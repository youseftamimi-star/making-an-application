// Fresh database for every run: drop + create pinkas_e2e, migrate, seed the demo store.
import { execSync } from "node:child_process";
import { Client } from "pg";
import { E2E_DB } from "../../playwright.config";

export default async function globalSetup() {
  const admin = new Client({ connectionString: E2E_DB.replace(/\/pinkas_e2e$/, "/postgres") });
  await admin.connect();
  await admin.query("drop database if exists pinkas_e2e with (force)");
  await admin.query("create database pinkas_e2e");
  await admin.end();
  const env = { ...process.env, DATABASE_URL: E2E_DB };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx scripts/seed.ts", { env, stdio: "inherit" });
}
