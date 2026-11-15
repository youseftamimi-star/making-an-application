import { handler } from "@/server/api";
import { destroySession } from "@/server/session";

export const POST = handler(async () => {
  await destroySession();
  return { ok: true };
});
