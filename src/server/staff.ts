import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { staffUsers, stores } from "@/db/schema";
import { AppError } from "./errors";
import { audit } from "./audit";
import { hashSecret, verifySecret } from "./hash";
import type { Actor } from "./ledger";

export async function isSetUp(db: DB) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(stores);
  return r.n > 0;
}

/** First run only: creates the store and its owner. */
export async function setupStore(
  db: DB,
  input: { storeName: string; ownerName: string; username: string; password: string; managerPin: string },
) {
  const passwordHash = await hashSecret(input.password);
  const managerPinHash = await hashSecret(input.managerPin);
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table stores in exclusive mode`);
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(stores);
    if (r.n > 0) throw new AppError("ALREADY_SET_UP");
    const [store] = await tx.insert(stores).values({ name: input.storeName.trim() }).returning();
    const [owner] = await tx
      .insert(staffUsers)
      .values({
        storeId: store.id,
        name: input.ownerName.trim(),
        username: input.username.trim().toLowerCase(),
        passwordHash,
        managerPinHash,
        role: "owner",
      })
      .returning();
    await audit(tx, { storeId: store.id, staffUserId: owner.id, action: "store_setup" });
    return owner;
  });
}

export async function checkLogin(db: DB, username: string, password: string) {
  const [u] = await db
    .select()
    .from(staffUsers)
    .where(and(sql`lower(${staffUsers.username}) = ${username.trim().toLowerCase()}`, eq(staffUsers.active, true)));
  // Always run a hash check so timing doesn't reveal whether the username exists.
  const ok = await verifySecret(u?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);
  if (!u || !ok) throw new AppError("BAD_CREDENTIALS");
  return u;
}

export async function listStaff(db: DB, actor: Actor) {
  return db
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      username: staffUsers.username,
      role: staffUsers.role,
      active: staffUsers.active,
      createdAt: staffUsers.createdAt,
    })
    .from(staffUsers)
    .where(eq(staffUsers.storeId, actor.storeId))
    .orderBy(staffUsers.createdAt);
}

export async function createStaff(
  db: DB,
  actor: Actor,
  input: { name: string; username: string; password: string; role: "owner" | "employee"; managerPin?: string },
) {
  if (actor.role !== "owner") throw new AppError("FORBIDDEN");
  const username = input.username.trim().toLowerCase();
  const [exists] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.username}) = ${username}`);
  if (exists) throw new AppError("USERNAME_EXISTS");
  const [u] = await db
    .insert(staffUsers)
    .values({
      storeId: actor.storeId,
      name: input.name.trim(),
      username,
      passwordHash: await hashSecret(input.password),
      role: input.role,
      managerPinHash: input.role === "owner" && input.managerPin ? await hashSecret(input.managerPin) : null,
    })
    .returning({ id: staffUsers.id });
  await audit(db, {
    storeId: actor.storeId,
    staffUserId: actor.staffId,
    action: "staff_created",
    details: { newStaffId: u.id, username, role: input.role },
  });
  return u;
}

export async function setStaffActive(db: DB, actor: Actor, staffId: string, active: boolean) {
  if (actor.role !== "owner") throw new AppError("FORBIDDEN");
  if (staffId === actor.staffId) throw new AppError("VALIDATION", { reason: "cannot_deactivate_self" });
  const [u] = await db
    .update(staffUsers)
    .set({ active })
    .where(and(eq(staffUsers.id, staffId), eq(staffUsers.storeId, actor.storeId)))
    .returning({ id: staffUsers.id });
  if (!u) throw new AppError("NOT_FOUND");
  if (!active) {
    await audit(db, { storeId: actor.storeId, staffUserId: actor.staffId, action: "staff_deactivated", details: { staffId } });
  }
  return u;
}
