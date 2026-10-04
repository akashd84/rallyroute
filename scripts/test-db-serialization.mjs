// Supplemental concurrency checks on a disposable local PostgreSQL database only.
// Fixtures must be committed across connections; this must NEVER target Cloud.
import { spawn, spawnSync } from "node:child_process";
const raw = process.env.RALLYROUTE_DISPOSABLE_DATABASE_URL;
let url;
try {
  url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/rallyroute_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error();
} catch {
  console.error("Set RALLYROUTE_DISPOSABLE_DATABASE_URL to a loopback-only disposable database named rallyroute_test_*. Requires psql and applied migrations. Never use Cloud or a development data database."); process.exit(1);
}
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get("sslmode") || "prefer" };
const args = ["-X", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(text) {
  const result = spawnSync("psql", args, { env, input: text, encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) throw new Error("Local SQL failed; inspect the disposable database in a secure terminal.");
  return result.stdout.trim();
}
const uid = number => `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const h1 = uid(101), h2 = uid(102), group = uid(301), hash = "9".repeat(64);
function setup(caseName) {
  sql(`begin;
    insert into auth.users(id,email,email_confirmed_at) values ('${uid(1)}','one@example.test',now()),('${uid(2)}','two@example.test',now()),('${uid(3)}','admin@example.test',now());
    insert into public.households(id,display_name) values ('${h1}','One'),('${h2}','Two');
    insert into public.household_access(household_id,user_id,role) values ('${h1}','${uid(1)}','owner'),('${h2}','${uid(2)}','owner');
    ${caseName === "demotion" ? `insert into public.household_access(household_id,user_id,role) values ('${h1}','${uid(2)}','member');` : ""}
    insert into public.groups(id,name,group_type) values ('${group}','Concurrent group','club');
    insert into public.group_admins(group_id,user_id,role) values ('${group}','${uid(3)}','owner');
    insert into public.group_invitations(group_id,invite_type,created_by_user_id,token_hash,max_uses,expires_at) values ('${group}','group_link','${uid(3)}','${hash}',1,now()+interval '7 days'); commit;`);
}
function cleanup() {
  sql(`begin; delete from public.groups where id='${group}'; delete from public.households where id in ('${h1}','${h2}'); delete from auth.users where id in ('${uid(1)}','${uid(2)}','${uid(3)}'); commit;`);
}
function caller(number, operation, hold = false) {
  const child = spawn("psql", args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.resume();
  const completed = new Promise((resolve, reject) => {
    child.on("error", reject); child.on("exit", status => resolve({ status, output }));
  });
  const deadline = setTimeout(() => child.kill(), 15000);
  completed.then(() => clearTimeout(deadline), () => clearTimeout(deadline));
  child.stdin.end(`begin; select set_config('request.jwt.claims','{"sub":"${uid(number)}"}',true); set local role authenticated;
    select current_user::text || ':' || auth.uid()::text;
    ${operation}; ${hold ? "select pg_sleep(0.4);" : ""} commit;`);
  return { completed, child };
}
if (sql(`select count(*) from auth.users where id::text like '30000000-%'`) !== "0" || sql(`select count(*) from public.households where id::text like '30000000-%'`) !== "0" || sql(`select count(*) from public.groups where id::text like '30000000-%'`) !== "0") throw new Error("Synthetic namespace already exists; refusing to touch it.");
for (const caseName of ["final-use", "demotion", "archive", "attempt-limit"]) {
  setup(caseName);
  if (caseName === "attempt-limit") sql(`insert into private.invitation_attempt_limits values('${uid(1)}',clock_timestamp(),9,clock_timestamp(),9);`);
  let first, second;
  try {
    const operation = caseName === "attempt-limit" ? `select public.inspect_invitation('group','${hash}')` : caseName === "final-use" ? `select public.accept_invitation('group','${hash}','${h1}')` : caseName === "demotion" ? `select public.demote_household_owner('${h1}')` : `select public.leave_household('${h1}')`;
    first = caller(1, operation, true);
    // Wait until the first transaction is holding its locks and sleeping.
    let holding = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (sql("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event='PgSleep'") === "1") { holding = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!holding) throw new Error("First transaction did not reach the lock barrier.");
    const number = caseName === "final-use" ? 2 : 1;
    second = caller(number, caseName === "attempt-limit" ? `select public.inspect_invitation('group','${hash}')` : `select public.accept_invitation('group','${hash}','${caseName === "final-use" ? h2 : h1}')`);
    const [winner, loser] = await Promise.all([first.completed, second.completed]);
    if (winner.status !== 0 || loser.status !== 0 || !loser.output.includes(`"status": "${caseName === "attempt-limit" ? "throttled" : "invalid"}"`) || !winner.output.includes(`authenticated:${uid(1)}`) || !loser.output.includes(`authenticated:${uid(number)}`)) throw new Error("Ordinary-role serialization outcome failed.");
    if (caseName === "attempt-limit" && (!winner.output.includes('"status": "ok"') || sql(`select minute_count from private.invitation_attempt_limits where user_id='${uid(1)}'`) !== "10")) throw new Error("Concurrent budget exceeded ten attempts.");
    const count = caseName === "final-use" ? "1" : "0";
    if (sql(`select use_count from public.group_invitations where group_id='${group}'`) !== count || sql(`select count(*) from public.group_invitation_redemptions where invitation_id in(select id from public.group_invitations where group_id='${group}')`) !== count) throw new Error("Rejected join changed usage or audit state.");
    console.log(`${caseName}: overlapping ordinary-role transactions passed.`);
  } finally {
    first?.child.kill(); second?.child.kill();
    await Promise.allSettled([first?.completed, second?.completed]);
    cleanup();
  }
}
