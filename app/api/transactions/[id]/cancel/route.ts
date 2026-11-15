import { getDb } from "@/db";
import { body, handler, zApproval } from "@/server/api";
import { cancelTransaction } from "@/server/ledger";
import { requireUser } from "@/server/session";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireUser();
  const { id } = await ctx.params;
  const approval = await body(req, zApproval);
  const t = await cancelTransaction(getDb(), actor, { transactionId: id, ...approval });
  return { id: t.id, status: t.status };
});
