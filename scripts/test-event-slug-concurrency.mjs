// Explicit linked-Dev integration check. Uses only disposable synthetic fixtures.
// Separate transactions exercise group-lock serialization; finally cleans up.
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
const users = [randomUUID()];
const groupId = randomUUID();
const locationId = randomUUID();
const name = `slug-race-${randomUUID()}`;
const requests = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
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
    throw new Error(`Linked event concurrency query failed (${phase}); provider output suppressed.`);
  }
}
try {
  await query(`begin;
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values ('${users[0]}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-slug-${users[0]}@example.test',now(),'{}','{}',now(),now());
    insert into public.groups(id,name,group_type,created_by_user_id) values('${groupId}','Synthetic event slug race','club','${users[0]}');
    insert into public.group_admins(group_id,user_id,role) values('${groupId}','${users[0]}','owner');
    insert into public.event_locations(id,group_id,name,address_line_1,location) values('${locationId}','${groupId}','Synthetic destination','Synthetic address',extensions.st_geogfromtext('SRID=4326;POINT(0 0)'));
    commit;`);
  async function create(index) {
    const payload = { groupId, requestId: requests[index], name, locationId, timezone: "UTC", arrival: "2099-01-01T09:00:00Z" };
    const series = { groupId, requestId: requests[index], name, locationId,
      rule: "FREQ=DAILY;INTERVAL=1;UNTIL=20990102T235959Z",
      spec: { frequency: "daily", interval: 1, startDate: "2099-01-01", endDate: "2099-01-02", timezone: "UTC", arrivalTime: "09:00" },
      occurrences: ["2099-01-01","2099-01-02"].map(day => ({ original_local_date: day, required_arrival_at: `${day}T09:00:00Z`, ready_to_depart_at: null })) };
    const sql = index < 2 ? `public.event_workflow('event-save','${JSON.stringify(payload)}'::jsonb)` : `public.series_workflow('${JSON.stringify(series)}'::jsonb)`;
    return query(`begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"${users[0]}"}',true);
      select ${sql}; commit;`);
  }
  for (const pair of [[0,2],[1,3]]) {
    const outcomes = await Promise.allSettled(pair.map(index => create(index)));
    for (const result of outcomes) if (result.status === "rejected") throw result.reason;
  }
  const rows = await query(`select id,slug from public.events where group_id='${groupId}' order by id;`);
  assert.equal(rows.length,6);
  assert.equal(new Set(rows.map(row => row.slug)).size,6);
  assert.equal(rows.filter(row => row.slug === name).length,1);
  assert.ok(rows.every(row => row.slug === name || new RegExp(`^${name}-[0-9a-f]{8}$`).test(row.slug)));
  for (let index=0;index<4;index++) await create(index);
  assert.deepEqual(await query(`select id,slug from public.events where group_id='${groupId}' order by id;`),rows);
  console.log("Linked Dev: concurrent one-off/series creation, unique slugs and idempotent retries passed.");
} finally {
  try {
    await query(`begin;
      delete from public.events where group_id='${groupId}';
      delete from public.event_series where group_id='${groupId}';
      delete from public.event_locations where group_id='${groupId}';
      delete from public.group_admins where group_id='${groupId}';
      delete from public.groups where id='${groupId}';
      delete from auth.users where id='${users[0]}'; commit;`);
    const remaining = await query(`select (select count(*) from public.groups where id='${groupId}') + (select count(*) from public.events where group_id='${groupId}') + (select count(*) from public.event_series where group_id='${groupId}') + (select count(*) from public.event_locations where group_id='${groupId}') + (select count(*) from auth.users where id='${users[0]}') as remaining;`);
    assert.equal(Number(remaining[0].remaining),0);
    console.log("Disposable event slug fixtures removed.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
