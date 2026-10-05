// Explicit opt-in to transaction-only authorization tests on the linked Dev database.
// Credentials travel through the process environment, never command arguments/logs.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runManagementSuite } from "./database-management-tests.mjs";
const directory = "supabase/tests/database";
const availableFiles = readdirSync(directory).filter(file => file.endsWith(".test.sql") && file !== "seed_idempotency.test.sql").sort();
const requestedFiles = process.argv.slice(2);
if (requestedFiles.some(file => !availableFiles.includes(file))) {
  console.error("Unknown or unsupported database suite. Supply test filenames from supabase/tests/database; seed_idempotency.test.sql is local-only.");
  process.exit(1);
}
const files = requestedFiles.length ? [...new Set(requestedFiles)] : availableFiles;
if (!process.env.RALLYROUTE_TEST_DATABASE_URL) {
  for (const file of files) {
    const source = readFileSync(`${directory}/${file}`, "utf8");
    if (!/^begin;/m.test(source) || !/^rollback;/m.test(source) || /\\ir .*seed\.sql/.test(source)) throw new Error(`Unsafe suite: ${file}`);
    if (!runManagementSuite(file, source)) process.exit(1);
  }
  process.exit(0);
}
let connection;
try {
  connection = new URL(process.env.RALLYROUTE_TEST_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol) || !connection.hostname) throw new Error("Invalid database URL");
} catch { console.error("RALLYROUTE_TEST_DATABASE_URL must be a PostgreSQL connection URL."); process.exit(1); }
const databaseEnv = { ...process.env,
  PGHOST: connection.hostname, PGPORT: connection.port || "5432",
  PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)) || "postgres",
  PGSSLMODE: connection.searchParams.get("sslmode") || "require",
};
for (const file of files) {
  const text = readFileSync(`${directory}/${file}`, "utf8");
  if (!/^begin;/m.test(text) || !/^rollback;/m.test(text) || /\\ir .*seed\.sql/.test(text)) throw new Error(`Unsafe suite: ${file}`);
  const result = spawnSync("psql", ["-X", "--set", "ON_ERROR_STOP=1", "--set", "fixture_owner=postgres", "--file", `${directory}/${file}`], {
    encoding: "utf8", env: databaseEnv, maxBuffer: 8 * 1024 * 1024,
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  if (result.error || result.status !== 0 || /not ok \d|Looks like you failed/.test(output)) {
    console.error(`${file}: FAILED. Inspect the suite with psql in a secure terminal; provider output is suppressed to protect credentials.`);
    process.exit(1);
  }
  const count = output.match(/1\.\.(\d+)/)?.[1];
  if (!count) { console.error(`${file}: No TAP completion marker.`); process.exit(1); }
  console.log(`${file}: ${count} assertions passed (rolled back).`);
}
