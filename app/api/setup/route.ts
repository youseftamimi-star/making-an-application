import { z } from "zod";
import { getDb } from "@/db";
import { body, handler, zManagerPin } from "@/server/api";
import { createSession } from "@/server/session";
import { isSetUp, setupStore } from "@/server/staff";

export const GET = handler(async () => ({ setUp: await isSetUp(getDb()) }));

export const POST = handler(async (req: Request) => {
  const input = await body(
    req,
    z.object({
      storeName: z.string().trim().min(1).max(80),
      ownerName: z.string().trim().min(1).max(80),
      username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
      password: z.string().min(8).max(200),
      managerPin: zManagerPin,
    }),
  );
  const owner = await setupStore(getDb(), input);
  await createSession(owner.id);
  return { ok: true };
});
