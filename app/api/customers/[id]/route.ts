import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customers, staffUsers, transactions } from "@/db/schema";
import { body, handler } from "@/server/api";
import { AppError } from "@/server/errors";
import { toPublicCustomer, updateCustomer } from "@/server/ledger";
import { requireUser } from "@/server/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const actor = await requireUser();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.storeId, actor.storeId)));
  if (!c) throw new AppError("NOT_FOUND");
  const history = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      balanceAfter: transactions.balanceAfter,
      status: transactions.status,
      confirmedBy: transactions.confirmedBy,
      createdAt: transactions.createdAt,
      cancelledAt: transactions.cancelledAt,
      staffName: staffUsers.name,
    })
    .from(transactions)
    .innerJoin(staffUsers, eq(transactions.createdByStaffId, staffUsers.id))
    .where(eq(transactions.customerId, c.id))
    .orderBy(desc(transactions.createdAt))
    .limit(200);
  return { customer: toPublicCustomer(c), history, serverNow: new Date().toISOString() };
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const actor = await requireUser("owner");
  const { id } = await ctx.params;
  const input = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      creditLimit: z.number().int().min(0).max(10_000_000).nullable().optional(),
    }),
  );
  return updateCustomer(getDb(), actor, id, input);
});
