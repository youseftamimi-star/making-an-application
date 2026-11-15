import { z } from "zod";
import { getDb } from "@/db";
import { body, handler } from "@/server/api";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
import { createSession } from "@/server/session";
import { checkLogin } from "@/server/staff";

export const POST = handler(async (req: Request) => {
  const { username, password } = await body(
    req,
    z.object({ username: z.string().min(1).max(40), password: z.string().min(1).max(200) }),
  );
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`login:ip:${ip}`, 30, 15 * 60_000) || !rateLimit(`login:u:${username.toLowerCase()}`, 10, 15 * 60_000)) {
    throw new AppError("RATE_LIMITED");
  }
  const u = await checkLogin(getDb(), username, password);
  await createSession(u.id);
  return { ok: true };
});
