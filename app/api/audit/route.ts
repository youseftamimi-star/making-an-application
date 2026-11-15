import { and, desc, eq, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { auditLog, customers, staffUsers } from "@/db/schema";
import { handler } from "@/server/api";
import { requireUser } from "@/server/session";

export const GET = handler(async (req: Request) => {
  const actor = await requireUser("owner");
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const before = url.searchParams.get("before");
  const s = alias(staffUsers, "s");
  const conds = [eq(auditLog.storeId, actor.storeId)];
  if (action) conds.push(eq(auditLog.action, action));
  if (before && !isNaN(Date.parse(before))) conds.push(lt(auditLog.createdAt, new Date(before)));
  return getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      staffName: s.name,
      customerId: auditLog.customerId,
      customerName: customers.name,
      transactionId: auditLog.transactionId,
    })
    .from(auditLog)
    .leftJoin(s, eq(auditLog.staffUserId, s.id))
    .leftJoin(customers, eq(auditLog.customerId, customers.id))
    .where(and(...conds))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);
});
