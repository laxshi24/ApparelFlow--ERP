/**
 * Local development PostgreSQL using real PostgreSQL binaries (embedded-postgres).
 * Not used in production — production connects to a managed PostgreSQL via DATABASE_URL.
 *
 *   npm run db:start   -> starts the server in the foreground (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const dataDir = path.resolve(process.cwd(), ".data", "pg");
const databases = ["apparelflow", "apparelflow_test"];

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    onLog: () => {},
  });

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Initialising local PostgreSQL cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const db of databases) {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${db}"`);
      console.log(`Created database ${db}`);
    }
  }
  await client.end();

  console.log(`PostgreSQL ready on postgres://postgres:postgres@localhost:${port} (databases: ${databases.join(", ")})`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
