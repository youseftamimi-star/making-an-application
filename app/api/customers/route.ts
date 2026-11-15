import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { body, handler, zPin } from "@/server/api";
import { createCustomer, toPublicCustomer } from "@/server/ledger";
import { requireUser } from "@/server/session";

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export const GET = handler(async (req: Request) => {
  const actor = await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const conds = [eq(customers.storeId, actor.storeId)];
  if (q) {
    const digits = q.replace(/\D/g, "");
    if (digits && digits.length === q.replace(/[\s-]/g, "").length) {
      // digits: last 4 of phone, or end of phone number
      conds.push(or(eq(customers.phoneLast4, digits), ilike(customers.phone, `%${esc(digits)}`))!);
    } else {
      // name: any word starting with the typed letters
      conds.push(or(ilike(customers.name, `${esc(q)}%`), ilike(customers.name, `% ${esc(q)}%`))!);
    }
  }
  const rows = await getDb()
    .select()
    .from(customers)
    .where(and(...conds))
    .orderBy(q ? sql`case when ${customers.name} ilike ${esc(q) + "%"} then 0 else 1 end` : asc(customers.name), asc(customers.name))
    .limit(q ? 20 : 100);
  return rows.map(toPublicCustomer);
});

export const POST = handler(async (req: Request) => {
  const actor = await requireUser("owner");
  const input = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(80),
      phone: z.string().min(9).max(20),
      creditLimit: z.number().int().min(0).max(10_000_000).nullable(),
      pin: zPin,
    }),
  );
  return createCustomer(getDb(), actor, input);
});
