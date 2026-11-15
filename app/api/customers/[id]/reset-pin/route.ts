import { z } from "zod";
import { getDb } from "@/db";
import { body, handler, zManagerPin, zPin } from "@/server/api";
import { resetCustomerPin } from "@/server/ledger";
import { requireUser } from "@/server/session";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireUser();
  const { id } = await ctx.params;
  const { newPin, managerPin } = await body(req, z.object({ newPin: zPin, managerPin: zManagerPin.optional() }));
  return resetCustomerPin(getDb(), actor, { customerId: id, newPin, managerPin });
});
