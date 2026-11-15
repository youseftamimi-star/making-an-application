import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema (node-postgres in the app, PGlite in tests). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __pinkasPool?: Pool };

function getPool() {
  if (!g.__pinkasPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    g.__pinkasPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return g.__pinkasPool;
}

let _db: DB | undefined;
export function getDb(): DB {
  if (!_db) _db = drizzle(getPool(), { schema }) as unknown as DB;
  return _db;
}

export { schema };
