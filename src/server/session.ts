import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, staffUsers, stores } from "@/db/schema";
import { AppError } from "./errors";
import type { Actor } from "./ledger";

const COOKIE = "pinkas_session";
const SESSION_DAYS = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(staffUserId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await getDb().insert(sessions).values({ id: sha256(token), staffUserId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export type SessionUser = Actor & { name: string; username: string; storeName: string; hasManagerPin: boolean };

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select({
      staffId: staffUsers.id,
      storeId: staffUsers.storeId,
      role: staffUsers.role,
      name: staffUsers.name,
      username: staffUsers.username,
      managerPinHash: staffUsers.managerPinHash,
      storeName: stores.name,
    })
    .from(sessions)
    .innerJoin(staffUsers, eq(sessions.staffUserId, staffUsers.id))
    .innerJoin(stores, eq(staffUsers.storeId, stores.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date()), eq(staffUsers.active, true)));
  if (!row) return null;
  const { managerPinHash, ...rest } = row;
  return { ...rest, hasManagerPin: !!managerPinHash };
}

export async function requireUser(role?: "owner"): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AppError("UNAUTHORIZED");
  if (role === "owner" && u.role !== "owner") throw new AppError("FORBIDDEN");
  return u;
}
