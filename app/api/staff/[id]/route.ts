import { z } from "zod";
import { getDb } from "@/db";
import { body, handler } from "@/server/api";
import { requireUser } from "@/server/session";
import { setStaffActive } from "@/server/staff";

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireUser("owner");
  const { id } = await ctx.params;
  const { active } = await body(req, z.object({ active: z.boolean() }));
  return setStaffActive(getDb(), actor, id, active);
});
