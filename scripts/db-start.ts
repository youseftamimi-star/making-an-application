// Runs a local PostgreSQL (no Docker needed) on port 5433, data in ./.pgdata.
// Keep this running in its own terminal while you develop.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(".pgdata");
const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "pinkas",
  password: "pinkas",
  port: 5433,
  persistent: true,
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("pinkas");
console.log("Postgres running on postgres://pinkas:pinkas@localhost:5433/pinkas (Ctrl+C to stop)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
