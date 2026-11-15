/**
 * Core business rules. Every write that touches a customer's balance goes through here,
 * inside one DB transaction with the customer row locked (SELECT ... FOR UPDATE),
 * so several registers can work at once without corrupting balances.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, staffUsers, transactions, type Customer } from "@/db/schema";
import { AppError } from "./errors";
import { audit } from "./audit";
import { hashSecret, verifySecret } from "./hash";
import { clearFailures, isBlocked, recordFailure } from "./rateLimit";
import { CANCEL_WINDOW_MS, MAX_PIN_ATTEMPTS, PIN_LOCK_MS, normalizePhone } from "@/lib/format";

export type Actor = { staffId: string; storeId: string; role: "owner" | "employee" };

/** How a sensitive action is approved: the customer's PIN, or an owner override. */
export type Approval =
  | { pin: string; override?: undefined }
  | { pin?: undefined; override: { managerPin?: string } };

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export const PIN_RE = /^\d{4}$/;

/** Throws unless the actor may override: an owner, or an employee with a valid owner manager PIN. */
async function authorizeOverride(tx: Tx, actor: Actor, managerPin?: string) {
  if (actor.role === "owner") return actor.staffId;
  if (!managerPin) throw new AppError("OVERRIDE_REQUIRED");
  const owners = await tx
    .select({ id: staffUsers.id, managerPinHash: staffUsers.managerPinHash })
    .from(staffUsers)
    .where(
      and(
        eq(staffUsers.storeId, actor.storeId),
        eq(staffUsers.role, "owner"),
        eq(staffUsers.active, true),
        isNotNull(staffUsers.managerPinHash),
      ),
    );
  // 4-digit owner codes are guessable: block the store's override path after 5 wrong codes for 10 minutes.
  const key = `mgr:${actor.storeId}`;
  if (isBlocked(key, 5)) throw new AppError("RATE_LIMITED");
  for (const o of owners) {
    if (await verifySecret(o.managerPinHash!, managerPin)) {
      clearFailures(key);
      return o.id;
    }
  }
  recordFailure(key, 10 * 60_000);
  throw new AppError("FORBIDDEN", { reason: "bad_manager_pin" });
}

async function lockCustomer(tx: Tx, actor: Actor, customerId: string) {
  const [c] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, actor.storeId)))
    .for("update");
  if (!c) throw new AppError("NOT_FOUND");
  return c;
}

/**
 * Checks the customer's PIN. A wrong PIN must still be *saved* (attempt counter / lockout),
 * so this returns an AppError instead of throwing; the caller commits and throws afterwards.
 */
async function checkCustomerPin(
  tx: Tx,
  actor: Actor,
  c: Customer,
  pin: string,
  now: Date,
): Promise<AppError | null> {
  if (c.pinLockedUntil && c.pinLockedUntil > now) {
    return new AppError("PIN_LOCKED", { until: c.pinLockedUntil.toISOString() });
  }
  if (PIN_RE.test(pin) && (await verifySecret(c.pinHash, pin))) {
    if (c.failedPinAttempts > 0) {
      await tx.update(customers).set({ failedPinAttempts: 0 }).where(eq(customers.id, c.id));
    }
    return null;
  }
  const attempts = c.failedPinAttempts + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const until = new Date(now.getTime() + PIN_LOCK_MS);
    await tx
      .update(customers)
      .set({ failedPinAttempts: 0, pinLockedUntil: until })
      .where(eq(customers.id, c.id));
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: "pin_locked",
      customerId: c.id,
      details: { until: until.toISOString() },
    });
    return new AppError("PIN_LOCKED", { until: until.toISOString() });
  }
  await tx.update(customers).set({ failedPinAttempts: attempts }).where(eq(customers.id, c.id));
  await audit(tx, {
    storeId: actor.storeId,
    staffUserId: actor.staffId,
    action: "pin_failed",
    customerId: c.id,
    details: { attempt: attempts },
  });
  return new AppError("WRONG_PIN", { remaining: MAX_PIN_ATTEMPTS - attempts });
}

/** Runs fn in a DB transaction. If fn returns an AppError, the transaction is committed and the error thrown. */
async function runCommitting<T>(db: DB, fn: (tx: Tx) => Promise<T | AppError>): Promise<T> {
  const result = await db.transaction(fn);
  if (result instanceof AppError) throw result;
  return result;
}

// ---------------------------------------------------------------------------

export async function createTransaction(
  db: DB,
  actor: Actor,
  input: { customerId: string; type: "debt" | "payment"; amount: number } & Approval,
  now = new Date(),
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 10_000_000) {
    throw new AppError("VALIDATION", { field: "amount" });
  }
  return runCommitting(db, async (tx) => {
    const c = await lockCustomer(tx, actor, input.customerId);
    const before = c.balance;
    const after = input.type === "debt" ? before + input.amount : before - input.amount;
    const isOverride = !!input.override;

    // Business checks come before the PIN so the customer never types a PIN for a doomed transaction.
    if (input.type === "payment" && after < 0) {
      return new AppError("PAYMENT_EXCEEDS_BALANCE", { balance: before });
    }
    if (input.type === "debt" && c.creditLimit != null && after > c.creditLimit && !isOverride) {
      return new AppError("CREDIT_LIMIT_EXCEEDED", { creditLimit: c.creditLimit, balance: before });
    }

    let approvedBy: string | null = null;
    if (isOverride) {
      approvedBy = await authorizeOverride(tx, actor, input.override!.managerPin);
    } else {
      const err = await checkCustomerPin(tx, actor, c, input.pin ?? "", now);
      if (err) return err;
    }

    const [row] = await tx
      .insert(transactions)
      .values({
        storeId: actor.storeId,
        customerId: c.id,
        type: input.type,
        amount: input.amount,
        balanceBefore: before,
        balanceAfter: after,
        confirmedBy: isOverride ? "owner_override" : "pin",
        createdByStaffId: actor.staffId,
        createdAt: now,
      })
      .returning();
    await tx.update(customers).set({ balance: after }).where(eq(customers.id, c.id));
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: isOverride ? "tx_override" : "tx_created",
      customerId: c.id,
      transactionId: row.id,
      details: {
        type: input.type,
        amount: input.amount,
        balanceBefore: before,
        balanceAfter: after,
        ...(isOverride ? { approvedByOwnerId: approvedBy } : {}),
      },
    });
    return row;
  });
}

export async function cancelTransaction(
  db: DB,
  actor: Actor,
  input: { transactionId: string } & Approval,
  now = new Date(),
) {
  return runCommitting(db, async (tx) => {
    const [peek] = await tx
      .select({ customerId: transactions.customerId })
      .from(transactions)
      .where(and(eq(transactions.id, input.transactionId), eq(transactions.storeId, actor.storeId)));
    if (!peek) throw new AppError("NOT_FOUND");
    const c = await lockCustomer(tx, actor, peek.customerId);
    const [t] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, input.transactionId))
      .for("update");
    if (t.status === "cancelled") return new AppError("ALREADY_CANCELLED");

    const withinWindow = now.getTime() - t.createdAt.getTime() <= CANCEL_WINDOW_MS;
    const isOverride = !!input.override;
    let approvedBy: string | null = null;
    if (isOverride) {
      approvedBy = await authorizeOverride(tx, actor, input.override!.managerPin);
    } else {
      if (!withinWindow) return new AppError("OVERRIDE_REQUIRED", { reason: "window_passed" });
      const err = await checkCustomerPin(tx, actor, c, input.pin ?? "", now);
      if (err) return err;
    }

    const newBalance = t.type === "debt" ? c.balance - t.amount : c.balance + t.amount;
    const [row] = await tx
      .update(transactions)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledByStaffId: actor.staffId,
        cancelMethod: isOverride ? "owner_override" : "pin",
      })
      .where(eq(transactions.id, t.id))
      .returning();
    await tx.update(customers).set({ balance: newBalance }).where(eq(customers.id, c.id));
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: isOverride ? "tx_cancel_override" : "tx_cancelled",
      customerId: c.id,
      transactionId: t.id,
      details: {
        type: t.type,
        amount: t.amount,
        balanceBefore: c.balance,
        balanceAfter: newBalance,
        minutesAfterCreation: Math.round((now.getTime() - t.createdAt.getTime()) / 60000),
        ...(isOverride ? { approvedByOwnerId: approvedBy } : {}),
      },
    });
    return row;
  });
}

export async function createCustomer(
  db: DB,
  actor: Actor,
  input: { name: string; phone: string; creditLimit: number | null; pin: string },
) {
  if (actor.role !== "owner") throw new AppError("FORBIDDEN");
  const phone = normalizePhone(input.phone);
  const name = input.name.trim();
  if (!name) throw new AppError("VALIDATION", { field: "name" });
  if (phone.length < 9 || phone.length > 13) throw new AppError("VALIDATION", { field: "phone" });
  if (!PIN_RE.test(input.pin)) throw new AppError("VALIDATION", { field: "pin" });
  if (input.creditLimit != null && (!Number.isInteger(input.creditLimit) || input.creditLimit < 0)) {
    throw new AppError("VALIDATION", { field: "creditLimit" });
  }
  const pinHash = await hashSecret(input.pin);
  return db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.storeId, actor.storeId), eq(customers.phone, phone)));
    if (exists) throw new AppError("PHONE_EXISTS", { customerId: exists.id });
    const [c] = await tx
      .insert(customers)
      .values({
        storeId: actor.storeId,
        name,
        phone,
        phoneLast4: phone.slice(-4),
        pinHash,
        creditLimit: input.creditLimit,
      })
      .returning();
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: "customer_created",
      customerId: c.id,
      details: { name, phoneLast4: c.phoneLast4, creditLimit: input.creditLimit },
    });
    return toPublicCustomer(c);
  });
}

export async function updateCustomer(
  db: DB,
  actor: Actor,
  customerId: string,
  input: { name?: string; creditLimit?: number | null },
) {
  if (actor.role !== "owner") throw new AppError("FORBIDDEN");
  return db.transaction(async (tx) => {
    const c = await lockCustomer(tx, actor, customerId);
    const patch: Partial<Customer> = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new AppError("VALIDATION", { field: "name" });
      patch.name = input.name.trim();
    }
    if (input.creditLimit !== undefined) patch.creditLimit = input.creditLimit;
    const [row] = await tx.update(customers).set(patch).where(eq(customers.id, c.id)).returning();
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: "customer_updated",
      customerId: c.id,
      details: { from: { name: c.name, creditLimit: c.creditLimit }, to: patch },
    });
    return toPublicCustomer(row);
  });
}

/** Owner (or employee with the owner's manager PIN) sets a new PIN the customer typed twice. */
export async function resetCustomerPin(
  db: DB,
  actor: Actor,
  input: { customerId: string; newPin: string; managerPin?: string },
) {
  if (!PIN_RE.test(input.newPin)) throw new AppError("VALIDATION", { field: "pin" });
  const pinHash = await hashSecret(input.newPin);
  return db.transaction(async (tx) => {
    const approvedBy = await authorizeOverride(tx, actor, input.managerPin);
    const c = await lockCustomer(tx, actor, input.customerId);
    await tx
      .update(customers)
      .set({ pinHash, failedPinAttempts: 0, pinLockedUntil: null })
      .where(eq(customers.id, c.id));
    await audit(tx, {
      storeId: actor.storeId,
      staffUserId: actor.staffId,
      action: "pin_reset",
      customerId: c.id,
      details: { approvedByOwnerId: approvedBy },
    });
    return { ok: true };
  });
}

/** The only shape of a customer that may leave the server: never includes pinHash (BR-03). */
export function toPublicCustomer(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    phoneLast4: c.phoneLast4,
    creditLimit: c.creditLimit,
    balance: c.balance,
    pinLockedUntil: c.pinLockedUntil,
    createdAt: c.createdAt,
  };
}
export type PublicCustomer = ReturnType<typeof toPublicCustomer>;
