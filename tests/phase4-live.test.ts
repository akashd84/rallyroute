import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const state=vi.hoisted(()=>({ rows:[] as {pair_key:string;candidate:Record<string,unknown>}[], changed:false }));
vi.mock("server-only",()=>({}));
// SQL fixtures are transaction-only; Auth is simulated in this API harness.
// The separate Playwright smoke test exercises real Supabase Auth and discovery RPCs.
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"20000000-0000-4000-8000-000000000001"}},error:null})}})}));
vi.mock("@/lib/supabase/admin",async()=>{
  const actual=await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
  return {createAdminClient:()=>{
    const client=actual.createAdminClient();const rpc=client.rpc.bind(client);
    return {rpc:(name:string,args:Record<string,unknown>)=>{
      if(name!=="match_candidates")return rpc(name as Parameters<typeof rpc>[0],args);
      const rows=state.rows.filter(row=>(row.candidate.route as {leg:string}).leg===args.p_leg && (args.p_keys ? (args.p_keys as string[]).includes(row.pair_key) : row.pair_key>(args.p_after as string ?? ""))).slice(0,args.p_limit as number);
      return Promise.resolve({data:rows.map(row=>state.changed && args.p_keys ? {...row,candidate:{...row.candidate,fingerprint:"b".repeat(32)}}:row),error:null});
    }};
  }};
});
import { discoverMatches } from "@/lib/matching/discovery";
function snapshots() {
  const dir=mkdtempSync(join(tmpdir(),"rallyroute-phase4-live-"));
  const call=(leg:string)=>`public.match_candidates('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000101','${leg}',100000)`;
  const sql=`begin;
${readFileSync("supabase/tests/fixtures.sql","utf8")}
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.2941 34.0754)') where id='20000000-0000-4000-8000-000000000510';
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.3785 33.9243)') where id='20000000-0000-4000-8000-000000000511';
update public.event_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.388 33.749)') where id='20000000-0000-4000-8000-000000000501';
update public.ride_participation set max_detour_minutes=120 where mode='can_drive';
create temporary table snapshot(data jsonb);
insert into snapshot select to_jsonb(c) from ${call("to_event")} c;
update public.ride_participation set leg='from_event',anchor_earliest_at='2099-01-01T17:00Z',anchor_latest_at='2099-01-01T17:10Z' where event_id='20000000-0000-4000-8000-000000000610';
insert into snapshot select to_jsonb(c) from ${call("from_event")} c;
select data from snapshot;
rollback;`;
  try {
    const file=join(dir,"fixtures.sql");writeFileSync(file,sql,{mode:0o600});
    const r=spawnSync("pnpm",["supabase","db","query","--linked","--file",file],{encoding:"utf8"});
    if(r.status!==0)throw new Error("Rollback-only matching fixtures failed; raw output suppressed.");
    return JSON.parse(r.stdout).rows.map((r:{data:typeof state.rows[number]})=>r.data);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
describe.skipIf(process.env.RALLYROUTE_TEST_PHASE4!=="1")("linked matching snapshots with real Valhalla/cache",()=>{
  it("finds both-leg pairs, excludes excessive detours, reuses cache, and drops changed snapshots",async()=>{
    state.rows=snapshots();expect(state.rows).toHaveLength(4);
    vi.stubEnv("ROUTE_CACHE_VERSION",`phase4-live-${randomUUID()}`);
    const spy=vi.spyOn(globalThis,"fetch");
    const routeCalls=()=>spy.mock.calls.filter(([url])=>String(url).startsWith(process.env.VALHALLA_URL!)).length;
    try{
      for(const leg of ["to_event","from_event"] as const){
        const request={eventId:"20000000-0000-4000-8000-000000000610",householdId:"20000000-0000-4000-8000-000000000101",leg};
        const first=await discoverMatches(request);expect(first.status).toBe("ok");expect(first.complete).toBe(true);expect(first.households).toHaveLength(1);expect(first.households[0].opportunities).toHaveLength(2);
        const calls=routeCalls();expect(await discoverMatches(request)).toEqual(first);expect(routeCalls()).toBe(calls);
        // Keep the live route result but apply a literal zero-second tolerance to a known nonzero detour.
        const row=state.rows.find(r=>(r.candidate.route as {leg:string}).leg===leg && r.candidate.own_role==="rider")!;
        const route=row.candidate.route as {driver_max_detour_minutes:number};const tolerance=route.driver_max_detour_minutes;route.driver_max_detour_minutes=0;
        const filtered=await discoverMatches(request);expect(filtered.households[0].opportunities).toHaveLength(1);route.driver_max_detour_minutes=tolerance;
        state.changed=true;expect(await discoverMatches(request)).toMatchObject({complete:false,households:[]});state.changed=false;
      }
      expect(routeCalls()).toBe(8);
    }finally{spy.mockRestore();state.changed=false;vi.unstubAllEnvs();}
  },90000);
});
