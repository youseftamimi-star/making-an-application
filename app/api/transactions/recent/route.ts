import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, staffUsers, transactions } from "@/db/schema";
import { handler } from "@/server/api";
import { requireUser } from "@/server/session";

export const GET = handler(async () => {
  const actor = await requireUser();
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await getDb()
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      balanceBefore: transactions.balanceBefore,
      balanceAfter: transactions.balanceAfter,
      status: transactions.status,
      confirmedBy: transactions.confirmedBy,
      createdAt: transactions.createdAt,
      customerId: customers.id,
      customerName: customers.name,
      customerBalance: customers.balance,
      phoneLast4: customers.phoneLast4,
      staffName: staffUsers.name,
    })
    .from(transactions)
    .innerJoin(customers, eq(transactions.customerId, customers.id))
    .innerJoin(staffUsers, eq(transactions.createdByStaffId, staffUsers.id))
    .where(and(eq(transactions.storeId, actor.storeId), gt(transactions.createdAt, since)))
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  return { rows, serverNow: new Date().toISOString() };
});
