// Explicit linked-Dev integration check. Uses only disposable synthetic fixtures.
// Separate transactions exercise bulk ride preference serialization; finally cleans up.
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const directory = mkdtempSync(join(tmpdir(), "rallyroute-series-rides-concurrency-"));
let sequence = 0;
const users = [randomUUID()];
const groupId = randomUUID();
const locationId = randomUUID();
const householdId=randomUUID(), memberId=randomUUID(), seriesId=randomUUID();
const eventIds=[randomUUID(),randomUUID()].sort();
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
  writeFileSync(file, `set role postgres;
${statement}`, { mode: 0o600 });
  try {
    const { stdout } = await exec("psql", ["-X", "-q", "-A", "-t", "--set", "ON_ERROR_STOP=1", "--file", file], { env: connectionEnv, maxBuffer: 1024 * 1024, timeout: 30000 });
    return returnsRows ? JSON.parse(stdout.trim()) : [];
  } catch (error) {
    const phase = String(error.stderr ?? "").match(/password authentication failed|could not translate host name|server certificate|connection refused|Tenant or user not found|permission denied|syntax error|could not connect|invalid integer value/)?.[0] ?? "connection or query error";
    throw new Error(`Linked recurring ride concurrency query failed (${phase}); provider output suppressed.`);
  }
}

const claims = JSON.stringify({sub:users[0]});
const authenticate = `set local role authenticated; select set_config('request.jwt.claims','${claims}',true);`;
let rideData;
function rpc(mode,expected=null) { return `public.series_ride_preferences('${JSON.stringify({...rideData,mode})}'::jsonb,${expected===null?'null':"'"+expected+"'"})`; }
async function preview() {
 const source=(await query(`select revision from public.events where id='${eventIds[0]}'`))[0];
 rideData={householdId,memberId,eventId:eventIds[0],revision:source.revision,leg:'to_event',mode:'self_transport'};
 return (await query(`select ${rpc('self_transport')} as payload from (select set_config('request.jwt.claims','${claims}',false)) auth`))[0].payload.snapshot;
}
async function commit(mode,snapshot) { await query(`begin; ${authenticate} select ${rpc(mode,snapshot)}; commit;`); }
async function waitForWriter(tag) {
 for(let i=0;i<100;i++) {
  const rows=await query(`select count(*)::int as n from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep'`);
  if(rows[0].n===1)return;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw new Error('Writer synchronization timed out');
}
try {
 await query(`begin;
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('${users[0]}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rides-${users[0]}@example.test',now(),'{}','{}',now(),now());
 insert into public.households(id,display_name) values('${householdId}','Synthetic recurring ride household');
 insert into public.household_access(household_id,user_id,role) values('${householdId}','${users[0]}','owner');
 insert into public.household_members(id,household_id,first_name,member_type) values('${memberId}','${householdId}','Synthetic participant','adult');
 insert into public.groups(id,name,group_type,created_by_user_id) values('${groupId}','Synthetic recurring ride group','club','${users[0]}');
 insert into public.group_admins(group_id,user_id,role) values('${groupId}','${users[0]}','owner');
 insert into public.group_memberships(group_id,household_id,status) values('${groupId}','${householdId}','active');
 insert into public.event_locations(id,group_id,name,address_line_1,location) values('${locationId}','${groupId}','Synthetic destination','Synthetic address',extensions.st_geogfromtext('SRID=4326;POINT(0 0)'));
 insert into public.event_series(id,group_id,name,location_id,timezone,recurrence_rule,series_start_date,default_required_arrival_time,created_by_user_id) values('${seriesId}','${groupId}','Synthetic series','${locationId}','UTC','FREQ=DAILY','2099-01-01','09:00','${users[0]}');
 ${eventIds.map((id,i)=>`insert into public.events(id,group_id,event_series_id,name,location_id,timezone,required_arrival_at,original_local_date,created_by_user_id) values('${id}','${groupId}','${seriesId}','Synthetic occurrence','${locationId}','UTC','2099-01-0${i+1}T09:00Z','2099-01-0${i+1}','${users[0]}');`).join(' ')}
 ${eventIds.map(id=>`insert into public.event_participation(event_id,member_id,status) values('${id}','${memberId}','going');`).join(' ')}
 commit;`);
 let snapshot=await preview();
 const tag=`series-rides-${randomUUID()}`;
 let writer=query(`begin; set local application_name='${tag}'; ${authenticate} select ${rpc('self_transport',snapshot)}; select pg_sleep(1); commit;`);
 await waitForWriter(tag);
 let results=await Promise.allSettled([writer,commit('none',snapshot)]);
 assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].status,'rejected');
 let rows=await query(`select mode from public.ride_participation where member_id='${memberId}'`);
 assert.equal(rows.length,2); assert.ok(rows.every(r=>r.mode==='self_transport'));
 for(const kind of ['attendance','ride','edit','cancel','replace']) {
  await query(`update public.events set status='scheduled' where event_series_id='${seriesId}'; update public.event_participation set status='going',disabled_at=null where member_id='${memberId}';`);
  snapshot=await preview(); await commit('self_transport',snapshot); snapshot=await preview();
  const targetRevision=(await query(`select revision from public.events where id='${eventIds[1]}'`))[0].revision;
  let operation;
  if(kind==='attendance') operation=`select public.event_workflow('attendance','${JSON.stringify({householdId,memberId,eventId:eventIds[1],revision:targetRevision,status:'unknown'})}'::jsonb);`;
  if(kind==='ride') operation=`select public.event_workflow('ride','${JSON.stringify({householdId,memberId,eventId:eventIds[1],revision:targetRevision,leg:'to_event',mode:'none'})}'::jsonb);`;
  if(kind==='edit') operation=`select public.event_workflow('event-save','${JSON.stringify({groupId,eventId:eventIds[1],revision:targetRevision,name:'Edited occurrence',locationId,timezone:'UTC',arrival:'2099-01-02T10:00:00Z'})}'::jsonb);`;
  if(kind==='cancel') operation=`select public.event_workflow('event-cancel','${JSON.stringify({groupId,eventId:eventIds[1],revision:targetRevision})}'::jsonb);`;
  if(kind==='replace') {
   const revision=(await query(`select revision from public.event_series where id='${seriesId}'`))[0].revision;
   const payload={groupId,requestId:randomUUID(),replaceEventId:eventIds[0],seriesRevision:revision,name:'Successor',locationId,rule:'FREQ=DAILY;INTERVAL=1',spec:{frequency:'daily',interval:1,startDate:'2099-01-01',endDate:'2099-01-02',timezone:'UTC',arrivalTime:'09:00'},occurrences:['2099-01-01','2099-01-02'].map(day=>({original_local_date:day,required_arrival_at:day+'T09:00:00Z',ready_to_depart_at:null}))};
   operation=`select public.series_workflow('${JSON.stringify(payload)}'::jsonb);`;
  }
  writer=query(`begin; set local application_name='${tag}'; ${authenticate} ${operation} select pg_sleep(1); commit;`);
  await waitForWriter(tag);
  results=await Promise.allSettled([writer,commit('none',snapshot)]);
  assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].status,'rejected');
  rows=await query(`select mode from public.ride_participation where event_id='${eventIds[0]}' and member_id='${memberId}'`);
  assert.equal(rows[0].mode,'self_transport');
 }
 console.log('Linked Dev: concurrent bulk/individual rides, attendance, event edits, cancellation and series replacement reject stale bulk preferences atomically.');
} finally {
 try {
  await query(`begin;
   delete from public.ride_participation where member_id='${memberId}';
   delete from public.event_participation where member_id='${memberId}';
   delete from public.events where group_id='${groupId}';
   delete from public.event_series where group_id='${groupId}';
   delete from public.event_locations where group_id='${groupId}';
   delete from public.group_memberships where group_id='${groupId}';
   delete from public.group_admins where group_id='${groupId}';
   delete from public.groups where id='${groupId}';
   delete from public.household_members where household_id='${householdId}';
   delete from public.household_access where household_id='${householdId}';
   delete from public.households where id='${householdId}';
   delete from public.profiles where id='${users[0]}';
   delete from auth.users where id='${users[0]}'; commit;`);
  const remaining=await query(`select (select count(*) from public.groups where id='${groupId}') + (select count(*) from public.households where id='${householdId}') + (select count(*) from auth.users where id='${users[0]}') as remaining`);
  assert.equal(Number(remaining[0].remaining),0);
  console.log('Disposable recurring ride fixtures removed.');
 } finally { rmSync(directory,{recursive:true,force:true}); }
}
