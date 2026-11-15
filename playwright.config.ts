import { defineConfig } from "@playwright/test";

// Needs the local Postgres running (`npm run db:start`). The tests use their own
// database (pinkas_e2e), their own port (3100) and build dir, so `npm run dev` can keep running.
export const E2E_DB = "postgres://pinkas:pinkas@localhost:5433/pinkas_e2e";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome", // uses the installed Google Chrome, no browser download
    viewport: { width: 768, height: 1024 },
    locale: "he-IL",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DB, NEXT_DIST_DIR: ".next-e2e" },
  },
});
