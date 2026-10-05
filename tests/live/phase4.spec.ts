import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
test.skip(process.env.RALLYROUTE_TEST_PHASE4_BROWSER!=="1","Explicit Dev opt-in required");
test.setTimeout(120000);
function query(sql:string) {
  const dir=mkdtempSync(join(tmpdir(),"rallyroute-phase4-browser-"));
  try{
    const file=join(dir,"query.sql");writeFileSync(file,sql,{mode:0o600});
    const result=spawnSync("pnpm",["supabase","db","query","--linked","--file",file],{encoding:"utf8"});
    if(result.status!==0) {
      const code = ((result.stderr ?? "") + (result.stdout ?? "")).match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] ?? "unknown";
      throw new Error(`Disposable Dev fixture query failed (SQLSTATE ${code}); raw output suppressed.`);
    }
    return JSON.parse(result.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test("real Dev: authenticated private matching for both legs and preference changes",async({page,context})=>{
  const ref=readFileSync("supabase/.temp/project-ref","utf8").trim();
  if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname!==`${ref}.supabase.co`)throw new Error("Application must target linked Dev");
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const suffix=randomUUID();const email=`phase4-smoke-${suffix}@example.test`;
  const created=await admin.auth.admin.createUser({email,email_confirm:true});
  if(created.error||!created.data.user)throw new Error("Disposable account creation failed");
  const userId=created.data.user.id;
  const ids=new Map<string,string>();
  const original=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  ids.set(original(1),userId);
  let fixture=readFileSync("supabase/tests/fixtures.sql","utf8");
  for(const old of fixture.match(/20000000-0000-4000-8000-\d{12}/g)??[])if(!ids.has(old))ids.set(old,randomUUID());
  const id=(n:number)=>ids.get(original(n))!;
  fixture=fixture.replace(/20000000-0000-4000-8000-\d{12}/g,old=>ids.get(old)!);
  // Avoid collisions with reserved fixture emails; the existing real Auth account is retained by ON CONFLICT.
  fixture=fixture.replace(/[a-z.]+@example\.test/g,old=>`phase4-${suffix}-${old}`);
  const allUsers=Array.from({length:8},(_,i)=>id(i+1));
  const allHouses=Array.from({length:5},(_,i)=>id(i+101));
  try{
    query(`begin;\n${fixture}\n
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.2941 34.0754)') where id='${id(510)}';
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.3785 33.9243)') where id='${id(511)}';
update public.event_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.388 33.749)') where id='${id(501)}';
update public.ride_participation set max_detour_minutes=120 where event_id='${id(610)}' and mode='can_drive';
insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,available_seats,max_detour_minutes,anchor_earliest_at,anchor_latest_at)
select event_id,member_id,household_location_id,'from_event',mode,available_seats,max_detour_minutes,'2099-01-01T17:00Z','2099-01-01T17:10Z' from public.ride_participation where event_id='${id(610)}';
commit;`);
    const link=await admin.auth.admin.generateLink({type:"magiclink",email});
    if(link.error||!link.data.properties.hashed_token)throw new Error("Disposable sign-in token creation failed");
    const cookies:{name:string;value:string;path:string}[]=[];
    const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>[],setAll:values=>{cookies.splice(0,cookies.length,...values.map(v=>({name:v.name,value:v.value,path:v.options.path??"/"})));}}});
    const verified=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"magiclink"});
    if(verified.error)throw new Error("Disposable sign-in failed");
    await context.addCookies(cookies.map(c=>({...c,domain:"127.0.0.1",httpOnly:false,secure:false,sameSite:"Lax" as const})));
    await page.goto(`/groups/${id(301)}/events/${id(610)}?household=${id(101)}`);
    for(const label of ["To event matches","From event matches"]){
      const panel=page.getByRole("region",{name:label,exact:true});
      await expect(panel.getByRole("heading",{name:"Fixture Household B"})).toHaveCount(0);
      const leg = label === "To event matches" ? "to_event" : "from_event";
      const isAction = (r: import("@playwright/test").Response) => r.request().headers()["next-action"] !== undefined && Boolean(r.request().postData()?.includes(leg));
      const [payload] = await Promise.all([
        page.waitForResponse(isAction).then(response => response.text()),
        panel.getByRole("button",{name:"Find matches",exact:true}).click(),
      ]);
      for(const secret of [id(802),id(803),"Participant 204","Participant 205","34.0754","33.9243","driver_latitude","rider_ride_id"])expect(payload).not.toContain(secret);
      await expect(panel.getByRole("heading",{name:"Fixture Household B"})).toBeVisible();await expect(panel.getByText(/adds about/)).toHaveCount(2);
      await Promise.all([
        page.waitForResponse(isAction).then(response => response.finished()),
        panel.getByRole("button",{name:"Find matches",exact:true}).click(),
      ]);
      await expect(panel.getByText(/adds about/)).toHaveCount(2);
    }
    query(`begin;update public.ride_participation set needs_reconfirmation=true,disabled_at=now() where event_id='${id(610)}' and member_id in ('${id(204)}','${id(205)}');commit;`);
    const panel=page.getByRole("region",{name:"To event matches",exact:true});await panel.getByRole("button",{name:"Find matches",exact:true}).click();await expect(panel.getByText(/No compatible matches found/)).toBeVisible();await expect(panel.getByRole("heading",{name:"Fixture Household B"})).toHaveCount(0);
  }finally{
    const quoted=(values:string[])=>values.map(v=>`'${v}'`).join(",");
    query(`begin;
delete from public.groups where id='${id(301)}';
delete from public.households where id in (${quoted(allHouses)});
-- SQL-created synthetic identities have no Auth API lifecycle; delete exactly this run's identities.
delete from auth.users where id in (${quoted(allUsers.slice(1))}) and email like 'phase4-${suffix}-%@example.test';
commit;`);
    const removed=await admin.auth.admin.deleteUser(userId);
    if(removed.error)throw new Error("Disposable real Auth account cleanup failed");
    const remaining=query(`select count(*)::integer as remaining from auth.users where id in (${quoted(allUsers)});`);
    expect(remaining.rows[0].remaining).toBe(0);
  }
});
