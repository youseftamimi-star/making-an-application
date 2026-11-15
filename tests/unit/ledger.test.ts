import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DB } from "@/db";
import {
  cancelTransaction,
  createCustomer,
  createTransaction,
  resetCustomerPin,
  type Actor,
} from "@/server/ledger";
import { hashSecret } from "@/server/hash";
import { AppError } from "@/server/errors";

let db: DB;
let owner: Actor;
let employee: Actor;
let customerId: string;

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

async function balance() {
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
  return c;
}

beforeEach(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as DB;
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  const [store] = await db.insert(schema.stores).values({ name: "מכולת בדיקה" }).returning();
  const [o] = await db
    .insert(schema.staffUsers)
    .values({
      storeId: store.id,
      name: "בעלים",
      username: "owner",
      passwordHash: "x",
      role: "owner",
      managerPinHash: await hashSecret("9999"),
    })
    .returning();
  const [e] = await db
    .insert(schema.staffUsers)
    .values({ storeId: store.id, name: "עובד", username: "emp", passwordHash: "x", role: "employee" })
    .returning();
  owner = { staffId: o.id, storeId: store.id, role: "owner" };
  employee = { staffId: e.id, storeId: store.id, role: "employee" };
  const c = await createCustomer(db, owner, {
    name: "דנה כהן",
    phone: "050-123-4567",
    creditLimit: 50_000,
    pin: "1234",
  });
  customerId = c.id;
});

describe("customers", () => {
  it("stores a hashed PIN and last-4 digits, never the plain PIN", async () => {
    const c = await balance();
    expect(c.pinHash).toMatch(/^\$argon2id\$/);
    expect(c.pinHash).not.toContain("1234");
    expect(c.phone).toBe("0501234567");
    expect(c.phoneLast4).toBe("4567");
  });

  it("one account per phone number (BR-05)", async () => {
    await expectCode(
      createCustomer(db, owner, { name: "x", phone: "0501234567", creditLimit: null, pin: "1111" }),
      "PHONE_EXISTS",
    );
  });

  it("only the owner can open customers", async () => {
    await expectCode(
      createCustomer(db, employee, { name: "x", phone: "0529999999", creditLimit: null, pin: "1111" }),
      "FORBIDDEN",
    );
  });
});

describe("createTransaction", () => {
  it("adds a debt only with the right PIN (BR-01)", async () => {
    const t = await createTransaction(db, employee, { customerId, type: "debt", amount: 5000, pin: "1234" });
    expect(t.balanceBefore).toBe(0);
    expect(t.balanceAfter).toBe(5000);
    expect(t.confirmedBy).toBe("pin");
    expect((await balance()).balance).toBe(5000);
  });

  it("saves nothing on a wrong PIN, but counts the attempt", async () => {
    const err = await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 5000, pin: "0000" }),
      "WRONG_PIN",
    );
    expect(err.extra.remaining).toBe(4);
    const c = await balance();
    expect(c.balance).toBe(0);
    expect(c.failedPinAttempts).toBe(1);
    expect(await db.select().from(schema.transactions)).toHaveLength(0);
  });

  it("locks the PIN after 5 wrong tries, owner override still works", async () => {
    for (let i = 0; i < 4; i++) {
      await expectCode(
        createTransaction(db, employee, { customerId, type: "debt", amount: 100, pin: "0000" }),
        "WRONG_PIN",
      );
    }
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 100, pin: "0000" }),
      "PIN_LOCKED",
    );
    // even the right PIN is refused while locked
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 100, pin: "1234" }),
      "PIN_LOCKED",
    );
    const t = await createTransaction(db, owner, { customerId, type: "debt", amount: 100, override: {} });
    expect(t.confirmedBy).toBe("owner_override");
    const logs = await db.select().from(schema.auditLog);
    expect(logs.map((l) => l.action)).toContain("pin_locked");
    expect(logs.map((l) => l.action)).toContain("tx_override");
  });

  it("partial payment lowers the balance and needs a PIN (BR-04)", async () => {
    await createTransaction(db, employee, { customerId, type: "debt", amount: 10000, pin: "1234" });
    const p = await createTransaction(db, employee, { customerId, type: "payment", amount: 3000, pin: "1234" });
    expect(p.balanceAfter).toBe(7000);
    await expectCode(
      createTransaction(db, employee, { customerId, type: "payment", amount: 8000, pin: "1234" }),
      "PAYMENT_EXCEEDS_BALANCE",
    );
  });

  it("enforces the credit limit unless the owner overrides", async () => {
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 60_000, pin: "1234" }),
      "CREDIT_LIMIT_EXCEEDED",
    );
    // the PIN was not checked, so no attempt was counted
    expect((await balance()).failedPinAttempts).toBe(0);
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 60_000, override: {} }),
      "OVERRIDE_REQUIRED",
    );
    await expectCode(
      createTransaction(db, employee, {
        customerId,
        type: "debt",
        amount: 60_000,
        override: { managerPin: "1111" },
      }),
      "FORBIDDEN",
    );
    const t = await createTransaction(db, employee, {
      customerId,
      type: "debt",
      amount: 60_000,
      override: { managerPin: "9999" },
    });
    expect(t.balanceAfter).toBe(60_000);
  });

  it("blocks owner-code guessing after 5 wrong codes", async () => {
    const tryCode = (managerPin: string) =>
      createTransaction(db, employee, { customerId, type: "debt", amount: 100, override: { managerPin } });
    for (let i = 0; i < 5; i++) await expectCode(tryCode("0000"), "FORBIDDEN");
    await expectCode(tryCode("9999"), "RATE_LIMITED");
  });

  it("rejects bad amounts", async () => {
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 0, pin: "1234" }),
      "VALIDATION",
    );
    await expectCode(
      createTransaction(db, employee, { customerId, type: "debt", amount: 12.5, pin: "1234" }),
      "VALIDATION",
    );
  });

  it("keeps the balance right under concurrent registers", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        createTransaction(db, employee, { customerId, type: "debt", amount: 1000, pin: "1234" }),
      ),
    );
    expect((await balance()).balance).toBe(5000);
  });
});

describe("cancelTransaction", () => {
  it("employee cancels with the customer PIN within 15 minutes; row is kept", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const t = await createTransaction(db, employee, { customerId, type: "debt", amount: 50000, pin: "1234" }, t0);
    const c = await cancelTransaction(
      db,
      employee,
      { transactionId: t.id, pin: "1234" },
      new Date(t0.getTime() + 14 * 60_000),
    );
    expect(c.status).toBe("cancelled");
    expect(c.cancelMethod).toBe("pin");
    expect((await balance()).balance).toBe(0);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
    await expectCode(
      cancelTransaction(db, owner, { transactionId: t.id, override: {} }),
      "ALREADY_CANCELLED",
    );
  });

  it("after 15 minutes only the owner can cancel", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const t = await createTransaction(db, employee, { customerId, type: "debt", amount: 2000, pin: "1234" }, t0);
    const later = new Date(t0.getTime() + 16 * 60_000);
    await expectCode(
      cancelTransaction(db, employee, { transactionId: t.id, pin: "1234" }, later),
      "OVERRIDE_REQUIRED",
    );
    const c = await cancelTransaction(db, owner, { transactionId: t.id, override: {} }, later);
    expect(c.cancelMethod).toBe("owner_override");
    expect((await balance()).balance).toBe(0);
  });

  it("cancelling a payment restores the debt", async () => {
    await createTransaction(db, employee, { customerId, type: "debt", amount: 5000, pin: "1234" });
    const p = await createTransaction(db, employee, { customerId, type: "payment", amount: 2000, pin: "1234" });
    await cancelTransaction(db, employee, { transactionId: p.id, pin: "1234" });
    expect((await balance()).balance).toBe(5000);
  });
});

describe("resetCustomerPin", () => {
  it("owner resets a locked PIN; the new PIN works and the audit log records it", async () => {
    await db
      .update(schema.customers)
      .set({ pinLockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(schema.customers.id, customerId));
    await expectCode(resetCustomerPin(db, employee, { customerId, newPin: "4321" }), "OVERRIDE_REQUIRED");
    await resetCustomerPin(db, owner, { customerId, newPin: "4321" });
    const t = await createTransaction(db, employee, { customerId, type: "debt", amount: 100, pin: "4321" });
    expect(t.balanceAfter).toBe(100);
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pin_reset"));
    expect(logs).toHaveLength(1);
  });
});
