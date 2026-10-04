// Supplemental multi-connection checks. Only a loopback disposable database is allowed.
import { spawn, spawnSync } from "node:child_process";
let url;
try {
  url = new URL(process.env.RALLYROUTE_DISPOSABLE_DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/rallyroute_test_[a-z0-9_]+$/.test(url.pathname)
  )
    throw Error();
} catch {
  console.error(
    "Requires a loopback disposable database named rallyroute_test_*. Never target Cloud.",
  );
  process.exit(1);
}
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
const args = ["-X", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input) {
  const r = spawnSync("psql", args, {
    env,
    input,
    encoding: "utf8",
    timeout: 15000,
  });
  if (r.status !== 0)
    throw Error(
      "Disposable SQL failed; inspect locally without exposing credentials.",
    );
  return r.stdout.trim();
}
const uid = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hh = uid(101),
  gid = uid(301),
  eid = uid(610),
  mid = uid(201),
  lid = uid(501);
function setup() {
  sql(
    `begin;insert into auth.users(id,email,email_confirmed_at)values('${uid(1)}','household@example.test',now()),('${uid(2)}','group@example.test',now());insert into public.households(id,display_name)values('${hh}','Synthetic');insert into public.household_access(household_id,user_id,role)values('${hh}','${uid(1)}','owner');insert into public.household_members(id,household_id,first_name,member_type,linked_user_id)values('${mid}','${hh}','Synthetic','adult','${uid(1)}');insert into public.groups(id,name,group_type)values('${gid}','Synthetic','club');insert into public.group_admins(group_id,user_id,role)values('${gid}','${uid(2)}','owner');insert into public.group_memberships(group_id,household_id,status)values('${gid}','${hh}','active');insert into public.event_locations(id,group_id,name,address_line_1,city,state_region,postal_code)values('${lid}','${gid}','Synthetic','Synthetic','Synthetic','TS','00000');insert into public.events(id,group_id,name,location_id,required_arrival_at,ready_to_depart_at)values('${eid}','${gid}','Synthetic','${lid}','2099-01-01T09:00Z','2099-01-01T17:00Z');insert into public.event_participation(event_id,member_id,status)values('${eid}','${mid}','going');commit;`,
  );
}
function cleanup() {
  sql(
    `delete from public.ride_participation where event_id='${eid}';delete from public.event_participation where event_id in(select id from public.events where group_id='${gid}');delete from public.events where group_id='${gid}';delete from public.event_series where group_id='${gid}';delete from public.event_locations where group_id='${gid}';delete from public.groups where id='${gid}';delete from private.household_locations where household_id='${hh}';delete from public.household_members where household_id='${hh}';delete from public.households where id='${hh}';delete from auth.users where id in('${uid(1)}','${uid(2)}');delete from private.ride_preference_history where snapshot->>'event_id'='${eid}';`,
  );
}
function caller(n, operation, hold = false) {
  const child = spawn("psql", args, { env });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", () => {});
  child.stdin.end(
    `begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"${uid(n)}","role":"authenticated"}',true);select current_user||':'||auth.uid();${operation};${hold ? "select pg_sleep(0.4);" : ""}commit;`,
  );
  return {
    child,
    done: new Promise((resolve) =>
      child.on("close", (status) => resolve({ status, output })),
    ),
  };
}
if (
  sql("select count(*) from auth.users where id::text like '40000000-%'") !==
  "0"
)
  throw Error("Fixture namespace occupied; refusing cleanup.");
const ride = `select public.event_workflow('ride','${JSON.stringify({ householdId: hh, eventId: eid, memberId: mid, revision: 1, leg: "to_event", mode: "self_transport" })}')`;
const attendance = `select public.event_workflow('attendance','${JSON.stringify({ householdId: hh, eventId: eid, memberId: mid, revision: 1, status: "going" })}')`;
const edit = `select public.event_workflow('event-save','${JSON.stringify({ groupId: gid, eventId: eid, revision: 1, name: "Changed", locationId: lid, timezone: "UTC", arrival: "2099-01-01T09:15Z", departure: "2099-01-01T17:00Z" })}')`;
const series = `select public.series_workflow('${JSON.stringify({ groupId: gid, requestId: uid(901), name: "Daily", locationId: lid, rule: "FREQ=DAILY;INTERVAL=1", spec: { frequency: "daily", interval: 1, startDate: "2099-02-01", endDate: "2099-02-01", timezone: "UTC", arrivalTime: "09:00" }, occurrences: [{ original_local_date: "2099-02-01", required_arrival_at: "2099-02-01T09:00Z" }] })}')`;
for (const name of [
  "event-edit/ride",
  "cancel/attendance",
  "departure/ride",
  "duplicate-series",
]) {
  setup();
  let first, second;
  try {
    const operation =
      name === "event-edit/ride"
        ? edit
        : name === "cancel/attendance"
          ? `select public.event_workflow('event-cancel','${JSON.stringify({ groupId: gid, eventId: eid, revision: 1 })}')`
          : name === "departure/ride"
            ? `select public.leave_household('${hh}')`
            : series;
    first = caller(name === "departure/ride" ? 1 : 2, operation, true);
    let barrier = false;
    for (let i = 0; i < 100; i++) {
      if (
        sql(
          "select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep'",
        ) === "1"
      ) {
        barrier = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!barrier) throw Error("Lock barrier not reached.");
    second = caller(
      name === "duplicate-series" ? 2 : 1,
      name === "duplicate-series"
        ? series
        : name === "cancel/attendance"
          ? attendance
          : ride,
    );
    const [a, b] = await Promise.all([first.done, second.done]);
    if (
      a.status !== 0 ||
      !a.output.includes(
        `authenticated:${uid(name === "departure/ride" ? 1 : 2)}`,
      ) ||
      !b.output.includes(
        `authenticated:${uid(name === "duplicate-series" ? 2 : 1)}`,
      )
    )
      throw Error("Ordinary role proof failed.");
    if (name === "duplicate-series") {
      if (
        b.status !== 0 ||
        sql(
          `select count(*) from public.events where event_series_id in(select id from public.event_series where group_id='${gid}')`,
        ) !== "1"
      )
        throw Error("Duplicate series generated.");
    } else if (
      b.status === 0 ||
      sql(
        `select count(*) from public.ride_participation where event_id='${eid}'`,
      ) !== "0"
    )
      throw Error("Serialized rejection failed.");
    console.log(`${name}: overlapping ordinary-role transactions passed.`);
  } finally {
    first?.child.kill();
    second?.child.kill();
    await Promise.allSettled([first?.done, second?.done]);
    cleanup();
  }
}
