import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError } from "./errors";

/** Wraps a route handler: turns AppError / ZodError into JSON error responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "VALIDATION", issues: e.issues }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const json = await req.json().catch(() => {
    throw new AppError("VALIDATION", { reason: "bad_json" });
  });
  return schema.parse(json);
}

export const zPin = z.string().regex(/^\d{4}$/);
export const zManagerPin = z.string().regex(/^\d{4,6}$/);
export const zApproval = z.union([
  z.object({ pin: zPin }),
  z.object({ override: z.object({ managerPin: zManagerPin.optional() }) }),
]);
