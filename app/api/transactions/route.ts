import { z } from "zod";
import { getDb } from "@/db";
import { body, handler, zApproval } from "@/server/api";
import { createTransaction } from "@/server/ledger";
import { requireUser } from "@/server/session";

export const POST = handler(async (req: Request) => {
  const actor = await requireUser();
  const input = await body(
    req,
    z.intersection(
      z.object({
        customerId: z.uuid(),
        type: z.enum(["debt", "payment"]),
        amount: z.number().int().positive().max(10_000_000),
      }),
      zApproval,
    ),
  );
  const t = await createTransaction(getDb(), actor, input);
  return { id: t.id, balanceAfter: t.balanceAfter };
});
