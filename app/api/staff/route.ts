import { z } from "zod";
import { getDb } from "@/db";
import { body, handler, zManagerPin } from "@/server/api";
import { requireUser } from "@/server/session";
import { createStaff, listStaff } from "@/server/staff";

export const GET = handler(async () => listStaff(getDb(), await requireUser("owner")));

export const POST = handler(async (req: Request) => {
  const actor = await requireUser("owner");
  const input = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(80),
      username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
      password: z.string().min(8).max(200),
      role: z.enum(["owner", "employee"]),
      managerPin: zManagerPin.optional(),
    }),
  );
  return createStaff(getDb(), actor, input);
});
