// Demo data for local development. Refuses to run if a store already exists.
// Demo logins (local only):
//   owner    / owner1234     (manager code 9999)
//   employee / employee1234
// Every demo customer's PIN is 1234.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db";
import { createCustomer, createTransaction, type Actor } from "../src/server/ledger";
import { createStaff, isSetUp, setupStore } from "../src/server/staff";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema }) as unknown as DB;

if (await isSetUp(db)) {
  console.log("A store already exists — seed skipped.");
  process.exit(0);
}

const owner = await setupStore(db, {
  storeName: "מכולת השכונה",
  ownerName: "עדנאן",
  username: "owner",
  password: "owner1234",
  managerPin: "9999",
});
const ownerActor: Actor = { staffId: owner.id, storeId: owner.storeId, role: "owner" };
const emp = await createStaff(db, ownerActor, {
  name: "סאמר",
  username: "employee",
  password: "employee1234",
  role: "employee",
});
const empActor: Actor = { staffId: emp.id, storeId: owner.storeId, role: "employee" };

const people: [string, string, number | null, number[]][] = [
  ["דנה כהן", "0501234567", 100_000, [4590, 12000, -5000]],
  ["יוסי לוי", "0529876543", null, [2350, 870]],
  ["מרים אבו-חמד", "0541112233", 50_000, [31000]],
  ["אברהם מזרחי", "0587654321", 30_000, []],
  ["רונית ביטון", "0533334444", null, [1500, -1500]],
  ["דוד פרץ", "0502223333", 20_000, [6400]],
];
for (const [name, phone, creditLimit, txs] of people) {
  const c = await createCustomer(db, ownerActor, { name, phone, creditLimit, pin: "1234" });
  for (const a of txs) {
    await createTransaction(db, empActor, {
      customerId: c.id,
      type: a > 0 ? "debt" : "payment",
      amount: Math.abs(a),
      pin: "1234",
    });
  }
}
await pool.end();
console.log("Seeded demo store. Logins are listed at the top of scripts/seed.ts");
