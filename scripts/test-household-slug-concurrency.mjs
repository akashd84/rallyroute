// Explicit linked-Dev integration check. Uses only disposable synthetic fixtures.
// Separate transactions exercise slug unique-index retries; finally cleans up.
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const directory = mkdtempSync(join(tmpdir(), "rallyroute-slug-concurrency-"));
let sequence = 0;
const users = [randomUUID(), randomUUID()];
const name = `slug-race-${randomUUID()}`;
const requests = [randomUUID(), randomUUID()];
// Initialize the CLI login once, then reuse its connection for independent psql
// sessions. Parallel CLI initialization can rotate the same temporary role.
let connectionEnv;
try {
  const { stdout } = await exec("pnpm", ["supabase", "db", "dump", "--linked", "--dry-run"], { maxBuffer: 1024 * 1024, timeout: 30000 });
  connectionEnv = { ...process.env, PGSSLMODE: "require", PGOPTIONS: "-c statement_timeout=15000" };
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(?:export )?(PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    connectionEnv[match[1]] = value;
  }
  if (!["PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE"].every(key => connectionEnv[key])) throw new Error();
} catch { rmSync(directory, { recursive: true, force: true }); throw new Error("Unable to initialize linked test connection; provider output suppressed."); }
async function query(sql) {
  const file = join(directory, `${sequence++}.sql`);
  const returnsRows = /^select /i.test(sql.trim());
  const statement = returnsRows ? `select coalesce(json_agg(row_to_json(result)), '[]'::json) from (${sql.trim().replace(/;$/, "")}) result;` : sql;
  writeFileSync(file, `set role postgres;\n${statement}`, { mode: 0o600 });
  try {
    const { stdout } = await exec("psql", ["-X", "-q", "-A", "-t", "--set", "ON_ERROR_STOP=1", "--file", file], { env: connectionEnv, maxBuffer: 1024 * 1024, timeout: 30000 });
    return returnsRows ? JSON.parse(stdout.trim()) : [];
  } catch (error) {
    const phase = String(error.stderr ?? "").match(/password authentication failed|could not translate host name|server certificate|connection refused|Tenant or user not found|permission denied|syntax error|could not connect|invalid integer value/)?.[0] ?? "connection or query error";
    throw new Error(`Linked household concurrency query failed (${phase}); provider output suppressed.`);
  }
}
const literals = values => values.map(v => `'${v}'`).join(",");
try {
  await query(`begin;
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values ${users.map(id => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','household-slug-${id}@example.test',now(),'{}','{}',now(),now())`).join(",")};
    commit;`);
  async function create(index, hold = false) {
    return query(`begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"${users[index]}"}',true);
      select public.onboard_household('${name}','Synthetic','Owner','${requests[index]}');
      ${hold ? "select pg_sleep(2);" : ""}
      commit;`);
  }
  const results = await Promise.allSettled([create(0, true), create(1)]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  const sql = `select h.id,h.slug from public.households h join private.household_creation_requests r on r.household_id=h.id where r.user_id in (${literals(users)}) order by h.id;`;
  const rows = await query(sql);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map(r => r.slug)).size, 2);
  assert.equal(rows.filter(r => r.slug === name).length, 1);
  assert.ok(rows.every(r => r.slug === name || new RegExp(`^${name}-[0-9a-f]{8}$`).test(r.slug)));
  await create(0); await create(1);
  assert.deepEqual(await query(sql), rows);
  console.log("Linked Dev: concurrent household creation and request retries passed.");
} finally {
  try {
    await query(`begin;
      create temporary table cleanup_households as select household_id from private.household_creation_requests where user_id in (${literals(users)});
      delete from private.household_creation_requests where user_id in (${literals(users)});
      delete from public.households where id in (select household_id from cleanup_households);
      delete from auth.users where id in (${literals(users)});
      commit;`);
    const remaining = await query(`select (select count(*) from auth.users where id in (${literals(users)})) + (select count(*) from public.households where display_name='${name}') as remaining;`);
    assert.equal(Number(remaining[0].remaining), 0);
    console.log("Disposable concurrency fixtures removed; no synthetic records remain.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
