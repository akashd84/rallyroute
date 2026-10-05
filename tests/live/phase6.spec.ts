import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { carpoolSchema } from "../../src/lib/carpools/types";
test.skip(process.env.RALLYROUTE_TEST_PHASE6_BROWSER !== "1", "Explicit linked Dev opt-in required");
test.setTimeout(240000);
function query(sql:string){
  const directory=mkdtempSync(join(tmpdir(),'rallyroute-phase6-'));
  try{
    const file=join(directory,'query.sql');writeFileSync(file,sql,{mode:0o600});
    const result=spawnSync('pnpm',['supabase','db','query','--linked','--file',file],{encoding:'utf8'});
    if(result.status!==0)throw new Error('Phase 6 disposable fixture query failed; raw output suppressed');
    return JSON.parse(result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true});}
}
test('real Dev: carpools, both legs, concurrency and persistent revocation',async({browser})=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
  if(new URL(url).hostname!==`${ref}.supabase.co`)throw new Error('Application must target linked Dev');
  const admin=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const suffix=randomUUID(),users:string[]=[],contexts:BrowserContext[]=[];
  const emails=[`phase6-a-${suffix}@example.test`,`phase6-b-${suffix}@example.test`];
  const original=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const ids=new Map<string,string>();let fixture=readFileSync('supabase/tests/fixtures.sql','utf8');
  for(const old of fixture.match(/20000000-0000-4000-8000-\d{12}/g)??[])if(!ids.has(old))ids.set(old,randomUUID());
  const id=(n:number)=>ids.get(original(n))!;
  const connection=randomUUID(),rivalConnection=randomUUID();let initialized=false;
  const quoted=(values:string[])=>values.map(v=>`'${v}'`).join(',');
  async function signIn(context:BrowserContext,email:string){
    const link=await admin.auth.admin.generateLink({type:'magiclink',email});if(link.error)throw new Error('Disposable token creation failed');
    const cookies:{name:string;value:string;path:string}[]=[];
    const client=createServerClient(url,key,{cookies:{getAll:()=>[],setAll:values=>{cookies.splice(0,cookies.length,...values.map(v=>({name:v.name,value:v.value,path:v.options.path??'/'})));}}});
    const verified=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});
    if(verified.error||!verified.data.session)throw new Error('Disposable sign-in failed');
    await context.addCookies(cookies.map(c=>({...c,domain:'127.0.0.1',httpOnly:false,secure:false,sameSite:'Lax' as const})));
    return createClient(url,key,{global:{headers:{Authorization:`Bearer ${verified.data.session.access_token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  }
  async function action(client:SupabaseClient,householdId:string,carpoolId:string,command:string,data:Record<string,unknown>={}){
    const result=await client.rpc('carpool_action',{p_command:command,p_data:{householdId,carpoolId,consent:'yes',...data}});
    expect(result.error).toBeNull();return result.data as {status:string;id:string};
  }
  async function detail(client:SupabaseClient,householdId:string,carpoolId:string){
    const result=await client.rpc('get_carpool',{p_household_id:householdId,p_carpool_id:carpoolId});expect(result.error).toBeNull();return carpoolSchema.parse(result.data);
  }
  try{
    for(let n=0;n<2;n++){
      const created=await admin.auth.admin.createUser({email:emails[n],email_confirm:true});if(created.error||!created.data.user)throw new Error('Disposable account creation failed');
      users.push(created.data.user.id);ids.set(original(n===0?1:4),created.data.user.id);
    }
    fixture=fixture.replace(/20000000-0000-4000-8000-\d{12}/g,old=>ids.get(old)!);
    fixture=fixture.replace(/[a-z.]+@example\.test/g,old=>`phase6-${suffix}-${old}`);
    query(`begin;\n${fixture}\n
update public.profiles set first_name='Phase6',last_name='Adult',onboarding_completed_at=now() where id in (${quoted(users)});
insert into public.household_access(household_id,user_id,role) values('${id(103)}','${users[1]}','member');
insert into public.group_memberships(group_id,household_id,status) values('${id(301)}','${id(103)}','active');
insert into public.event_participation(event_id,member_id,status) values('${id(610)}','${id(206)}','going');
insert into public.household_connections(id,requester_household_id,recipient_household_id,group_id,event_id,status)
values('${connection}','${id(101)}','${id(102)}','${id(301)}','${id(610)}','accepted'),('${rivalConnection}','${id(101)}','${id(103)}','${id(301)}','${id(610)}','accepted');
commit;`);initialized=true;
    const ca=await browser.newContext(),cb=await browser.newContext();contexts.push(ca,cb);
    const apiA=await signIn(ca,emails[0]),apiB=await signIn(cb,emails[1]);
    const pageA=await ca.newPage(),pageB=await cb.newPage();
    await pageA.goto(`/households/${id(101)}/connections`);
    const card=pageA.locator('article').filter({has:pageA.getByRole('heading',{name:'Fixture Household B',exact:true})});
    const create=card.locator('form').filter({has:pageA.getByRole('button',{name:'Create carpool'})});
    await create.getByRole('checkbox').check();await create.getByRole('button').click();await expect(pageA).toHaveURL(/\/carpools\/[\da-f-]+$/);
    const cid=pageA.url().split('/').pop()!;
    await pageB.goto(`/households/${id(102)}/carpools/${cid}`);await expect(pageB.getByText('Participant 201')).toHaveCount(0);
    const accept=pageB.locator('form').filter({has:pageB.getByRole('button',{name:'Accept carpool'})});await accept.getByRole('checkbox').check();await accept.getByRole('button').click();await expect(pageB.getByText('Fixture Community — Status: accepted')).toBeVisible();
    await pageA.reload();
    for(const leg of ['to_event','from_event'] as const){
      const proposal=pageA.getByRole('region',{name:'Propose a ride'});await proposal.getByLabel('Direction').selectOption(leg);await proposal.getByRole('checkbox').check();await proposal.getByRole('button',{name:'Propose ride'}).click();
      const ar=pageA.getByRole('region',{name:`Fixture occurrence 0 ${leg}`,exact:true});await expect(ar).toBeVisible();await ar.getByText('Edit ride — both households must approve again').click();
      const driver=ar.locator('form').filter({has:pageA.getByRole('button',{name:'Save driver and seats'})});await driver.getByLabel('Adult driver').selectOption(id(201));await driver.getByLabel('Additional rider seats').fill('3');await driver.getByRole('checkbox').check();await driver.getByRole('button').click();await expect(ar.getByText('Driver: Participant 201')).toBeVisible();
      await pageB.reload();const br=pageB.getByRole('region',{name:`Fixture occurrence 0 ${leg}`,exact:true});await br.getByText('Edit ride — both households must approve again').click();
      const selection=br.locator('form').filter({has:pageB.getByRole('button',{name:'Save my participants'})});await selection.getByRole('checkbox',{name:'Participant 205',exact:true}).check();await selection.getByRole('checkbox',{name:/I agree/}).check();await selection.getByRole('button').click();await expect(br.getByText('Riders: Participant 205')).toBeVisible();
      const ride=(await detail(apiA,id(101),cid)).rides.find(r=>r.leg===leg)!;
      const approvals=await Promise.all([action(apiA,id(101),cid,'approve',{rideId:ride.id,revision:ride.revision}),action(apiB,id(102),cid,'approve',{rideId:ride.id,revision:ride.revision})]);
      for(const outcome of approvals)expect(outcome.status).toBe('ok');expect((await detail(apiA,id(101),cid)).rides.find(r=>r.id===ride.id)?.status).toBe('confirmed');
    }
    await pageA.reload();await expect(pageA.getByText('Status: confirmed',{exact:true})).toHaveCount(2);
    const projection=await detail(apiB,id(102),cid);
    for(const secret of ['address_line_1','location_id','latitude','longitude',id(510)])expect(JSON.stringify(projection)).not.toContain(secret);
    await pageA.goto(`/groups/${id(301)}/events/${id(610)}?household=${id(101)}`);await expect(pageA.getByRole('region',{name:'Confirmed carpool rides'}).getByRole('link')).toHaveCount(2);
    const requestId=randomUUID();const created=await Promise.all([action(apiA,id(101),'','create',{connectionId:rivalConnection,requestId}),action(apiA,id(101),'','create',{connectionId:rivalConnection,requestId})]);
    expect(created.map(r=>r.status).sort()).toEqual(['existing','ok']);expect(created[0].id).toBe(created[1].id);const rival=created[0].id;
    expect((await action(apiB,id(103),rival,'accept',{revision:1})).status).toBe('ok');
    expect((await action(apiA,id(101),rival,'propose',{eventId:id(610),eventRevision:1,leg:'to_event',anchorAt:'2099-01-01T09:00:00Z',requestId:randomUUID()})).status).toBe('ok');
    let rr=(await detail(apiA,id(101),rival)).rides[0];
    expect((await action(apiA,id(101),rival,'driver',{rideId:rr.id,revision:rr.revision,driverMemberId:id(201),availableSeats:3})).status).toBe('ok');
    rr=(await detail(apiA,id(101),rival)).rides[0];expect((await action(apiB,id(103),rival,'participants',{rideId:rr.id,revision:rr.revision,memberIds:[id(206)]})).status).toBe('ok');
    rr=(await detail(apiA,id(101),rival)).rides[0];expect((await action(apiA,id(101),rival,'approve',{rideId:rr.id,revision:rr.revision})).status).toBe('ok');
    expect((await action(apiB,id(103),rival,'approve',{rideId:rr.id,revision:rr.revision})).status).toBe('assignment_conflict');
    // An edit invalidates approvals regardless of concurrent approval ordering.
    const ride=projection.rides.find(r=>r.leg==='to_event')!;
    const raced=await Promise.all([action(apiA,id(101),cid,'time',{rideId:ride.id,revision:ride.revision,anchorAt:'2099-01-01T08:55:00Z'}),action(apiB,id(102),cid,'approve',{rideId:ride.id,revision:ride.revision})]);
    expect(raced[0].status).toBe('ok');expect(['ok','conflict']).toContain(raced[1].status);
    const edited=(await detail(apiA,id(101),cid)).rides.find(r=>r.id===ride.id)!;expect(edited.status).toBe('proposed');expect(edited.ownApproved||edited.otherApproved).toBe(false);
    // Only one competing final confirmation can claim the shared driver.
    expect((await action(apiA,id(101),cid,'approve',{rideId:edited.id,revision:edited.revision})).status).toBe('ok');
    const competing=await Promise.all([action(apiB,id(102),cid,'approve',{rideId:edited.id,revision:edited.revision}),action(apiB,id(103),rival,'approve',{rideId:rr.id,revision:rr.revision})]);
    expect(competing.map(r=>r.status).sort()).toEqual(['assignment_conflict','ok']);
    const from=projection.rides.find(r=>r.leg==='from_event')!;
    const canceled=await Promise.all([action(apiA,id(101),cid,'cancel',{rideId:from.id,revision:from.revision}),action(apiB,id(102),cid,'approve',{rideId:from.id,revision:from.revision})]);
    expect(canceled[0].status).toBe('ok');expect(['ok','conflict']).toContain(canceled[1].status);expect((await detail(apiA,id(101),cid)).rides.find(r=>r.id===from.id)?.status).toBe('canceled');
    query(`begin;update public.group_memberships set status='left' where group_id='${id(301)}' and household_id='${id(101)}';update public.group_memberships set status='active' where group_id='${id(301)}' and household_id='${id(101)}';commit;`);
    expect((await detail(apiB,id(102),cid)).status).toBe('closed');await pageB.reload();await expect(pageB.getByText('Fixture Community — Status: closed')).toBeVisible();await expect(pageB.getByText('Driver: Participant 201')).toHaveCount(0);
  }finally{
    for(const context of contexts)await context.close();
    if(initialized)query(`begin;delete from public.groups where id='${id(301)}';delete from public.households where id in (${quoted(Array.from({length:5},(_,i)=>id(i+101)))});delete from auth.users where id in (${quoted(Array.from({length:8},(_,i)=>id(i+1)).filter(v=>!users.includes(v)))}) and email like 'phase6-${suffix}-%@example.test';commit;`);
    for(const uid of users){const removed=await admin.auth.admin.deleteUser(uid);if(removed.error)throw new Error('Disposable Auth cleanup failed');}
    if(initialized){
      const remaining=query(`select
        (select count(*) from auth.users where id in (${quoted(Array.from({length:8},(_,i)=>id(i+1)))}))::integer as accounts,
        (select count(*) from public.households where id in (${quoted(Array.from({length:5},(_,i)=>id(i+101)))}))::integer as households,
        (select count(*) from public.groups where id='${id(301)}')::integer as groups,
        (select count(*) from public.carpools where group_id='${id(301)}')::integer as carpools;`).rows[0];
      expect(remaining).toEqual({accounts:0,households:0,groups:0,carpools:0});
    }
  }
});
