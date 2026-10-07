// Explicit linked-Dev integration check. Uses only disposable synthetic fixtures.
// Separate transactions commit to exercise the unique-index retry; finally cleans up.
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
const households = [randomUUID(), randomUUID()];
const name = `slug-race-${randomUUID()}`;
const requests = [randomUUID(), randomUUID()];
async function query(sql) {
  const file = join(directory, `${sequence++}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    const { stdout } = await exec("pnpm", ["supabase", "db", "query", "--linked", "--file", file], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout).rows;
  } catch {
    throw new Error("Linked slug concurrency query failed; provider output suppressed.");
  }
}
const literals = values => values.map(v => `'${v}'`).join(",");
try {
  await query(`begin;
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values ${users.map(id => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','slug-race-${id}@example.test',now(),'{}','{}',now(),now())`).join(",")};
    insert into public.households(id,display_name) values ${households.map(id => `('${id}','Synthetic slug race household')`).join(",")};
    insert into public.household_access(household_id,user_id,role) values ${households.map((id,i) => `('${id}','${users[i]}','owner')`).join(",")};
    commit;`);
  async function create(index, hold) {
    return query(`begin;
      set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"${users[index]}"}',true);
      select public.create_group_once('${households[index]}','${name}','club','${requests[index]}');
      ${hold ? "select pg_sleep(2);" : ""}
      commit;`);
  }
  // Both same-name creations run while the first transaction still holds its slug.
  const results = await Promise.allSettled([create(0,true), create(1,false)]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  const rows = await query(`select id,slug from public.groups where created_by_user_id in (${literals(users)}) order by slug;`);
  assert.equal(rows.length,2);
  assert.equal(new Set(rows.map(row => row.slug)).size,2);
  assert.equal(rows.filter(row => row.slug === name).length,1);
  assert.ok(rows.every(row => row.slug === name || new RegExp(`^${name}-[0-9a-f]{8}$`).test(row.slug)));
  await create(0,false);
  const retry = await query(`select id,slug from public.groups where created_by_user_id in (${literals(users)}) order by slug;`);
  assert.deepEqual(retry,rows);
  console.log("Linked Dev: concurrent same-name creation and request retry passed.");
} finally {
  try {
    await query(`begin;
      delete from public.groups where created_by_user_id in (${literals(users)});
      delete from public.households where id in (${literals(households)});
      delete from auth.users where id in (${literals(users)});
      commit;`);
    const remaining = await query(`select (select count(*) from public.groups where created_by_user_id in (${literals(users)})) +
      (select count(*) from public.households where id in (${literals(households)})) +
      (select count(*) from auth.users where id in (${literals(users)})) as remaining;`);
    assert.equal(Number(remaining[0].remaining),0);
    console.log("Disposable concurrency fixtures removed; no synthetic records remain.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
