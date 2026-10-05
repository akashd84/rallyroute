import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ rpc: vi.fn(), getUser: vi.fn(), evaluate: vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient: async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/routing/route-detour",async()=>({ ...await vi.importActual<typeof import("@/lib/routing/route-detour")>("@/lib/routing/route-detour"), evaluateResolvedDetour:mocks.evaluate }));
import { discoverMatches } from "@/lib/matching/discovery";
import { decodeCursor, encodeCursor, type DiscoveryState } from "@/lib/matching/cursor";
import { rankHouseholds } from "@/lib/matching/types";
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const request={eventId:id(610),householdId:id(101),leg:"to_event" as const};
function candidate(n=0) {
  return { pair_key:`${id(800+n)}:${id(1800+n)}`,fingerprint:"a".repeat(32),other_household_id:id(102),other_household_name:"Household B",own_member_id:id(201),own_member_name:"Own participant",own_role:"driver",
    earliest:"2099-01-01T08:50:00+00:00",latest:"2099-01-01T09:00:00+00:00",route:{event_id:id(610),leg:"to_event",event_latitude:33.8,event_longitude:-84.4,driver_latitude:33.75,driver_longitude:-84.39,rider_latitude:33.77,rider_longitude:-84.38,driver_max_detour_minutes:10,driver_available_seats:2} };
}
let candidates: ReturnType<typeof candidate>[];
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("SUPABASE_SECRET_KEY","test-only-secret");vi.stubEnv("ROUTING_PREFILTER_MAX_PICKUP_DISTANCE_METERS","100000");
  candidates=[candidate()];
  mocks.getUser.mockResolvedValue({data:{user:{id:id(1)}},error:null});
  mocks.evaluate.mockResolvedValue({status:"compatible",addedDurationSeconds:120,maxDetourMinutes:10});
  mocks.rpc.mockImplementation(async (_name,args)=>({data:candidates.filter(c=>args.p_keys ? args.p_keys.includes(c.pair_key) : c.pair_key>(args.p_after ?? "")).slice(0,args.p_limit).map(c=>({pair_key:c.pair_key,candidate:c})),error:null}));
});
afterEach(()=>vi.unstubAllEnvs());
describe("match discovery",()=>{
  it("returns only the safe projection and checks authorization again",async()=>{
    const r=await discoverMatches(request);
    expect(r).toMatchObject({status:"ok",complete:true,households:[{name:"Household B",opportunities:[{ownMemberName:"Own participant",ownRole:"driver",addedDurationSeconds:120}]}]});
    const json=JSON.stringify(r);for(const key of ["driver_ride_id","rider_ride_id","latitude","longitude","fingerprint",id(800),id(1800)])expect(json).not.toContain(key);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("requires authentication before privileged calls",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:null},error:null});expect(await discoverMatches(request)).toMatchObject({status:"unavailable"});expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid requests and configuration without routing",async()=>{
    expect(await discoverMatches({...request,eventId:"bad"})).toMatchObject({status:"invalid_request"});
    vi.stubEnv("ROUTING_PREFILTER_MAX_PICKUP_DISTANCE_METERS","NaN");expect(await discoverMatches(request)).toMatchObject({status:"unavailable"});expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("accumulates batches, revalidates earlier pairs, and uses a private bound cursor",async()=>{
    candidates=Array.from({length:23},(_,i)=>candidate(i));
    const a=await discoverMatches(request);expect(a.complete).toBe(false);expect(a.households[0].opportunities).toHaveLength(20);expect(mocks.evaluate).toHaveBeenCalledTimes(20);
    expect(a.cursor).not.toContain(id(800));
    const b=await discoverMatches({...request,cursor:a.cursor});expect(b.complete).toBe(true);expect(b.cursor).toBeUndefined();expect(b.households[0].opportunities).toHaveLength(23);expect(mocks.evaluate).toHaveBeenCalledTimes(23);
    expect(await discoverMatches({...request,householdId:id(102),cursor:a.cursor})).toMatchObject({status:"invalid_request"});
    expect(await discoverMatches({...request,leg:"from_event",cursor:a.cursor})).toMatchObject({status:"invalid_request"});
    expect(await discoverMatches({...request,eventId:id(611),cursor:a.cursor})).toMatchObject({status:"invalid_request"});
    mocks.getUser.mockResolvedValue({data:{user:{id:id(4)}},error:null});expect(await discoverMatches({...request,cursor:a.cursor})).toMatchObject({status:"invalid_request"});
  });
  it("evaluates sequentially",async()=>{
    candidates=[candidate(),candidate(1)];let running=false;
    mocks.evaluate.mockImplementation(async()=>{expect(running).toBe(false);running=true;await Promise.resolve();running=false;return {status:"compatible",addedDurationSeconds:0};});
    expect((await discoverMatches(request)).complete).toBe(true);
  });
  it("groups reciprocal either opportunities and keeps own participants distinct",async()=>{
    candidates=[candidate(),{...candidate(1),own_role:"rider",own_member_name:"Second participant"}];
    const r=await discoverMatches(request);expect(r.households).toHaveLength(1);expect(r.households[0].opportunities.map(o=>o.ownRole).sort()).toEqual(["driver","rider"]);
  });
  it.each(["detour_exceeded","unreachable"])("excludes %s without guessing compatibility",async(status)=>{
    mocks.evaluate.mockResolvedValue({status});expect(await discoverMatches(request)).toMatchObject({complete:true,households:[]});
  });
  it("reports transient failure as partial and offers bounded retry timing",async()=>{
    mocks.evaluate.mockResolvedValue({status:"error",retryAfterSeconds:20});expect(await discoverMatches(request)).toMatchObject({complete:false,households:[],retryAfterSeconds:20});
  });
  it("preserves partial status after later batches",async()=>{
    candidates=Array.from({length:21},(_,i)=>candidate(i));mocks.evaluate.mockResolvedValueOnce({status:"error"});
    const a=await discoverMatches(request);const b=await discoverMatches({...request,cursor:a.cursor});expect(b.complete).toBe(false);expect(b.retryAfterSeconds).toBe(30);expect(b.households[0].opportunities).toHaveLength(20);
  });
  it("discards a pair changed during evaluation",async()=>{
    mocks.evaluate.mockImplementation(async()=>{candidates=[{...candidate(),fingerprint:"b".repeat(32)}];return {status:"compatible",addedDurationSeconds:120};});
    expect(await discoverMatches(request)).toMatchObject({complete:false,households:[]});
  });
  it("clears suggestions if household access is revoked after routing",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:[{pair_key:candidate().pair_key,candidate:candidate()}],error:null}).mockResolvedValueOnce({data:null,error:{code:"42501"}});
    expect(await discoverMatches(request)).toMatchObject({status:"unavailable",households:[]});
  });
  it("discards changed or withdrawn suggestions from an earlier batch",async()=>{
    candidates=Array.from({length:21},(_,i)=>candidate(i));const a=await discoverMatches(request);candidates=candidates.slice(1);
    const b=await discoverMatches({...request,cursor:a.cursor});expect(b.households[0].opportunities).toHaveLength(20);expect(b.complete).toBe(false);
  });
  it("fails safely on malformed RPC data",async()=>{
    mocks.rpc.mockResolvedValue({data:[{candidate:{latitude:33}}],error:null});expect(await discoverMatches(request)).toMatchObject({status:"unavailable",households:[]});expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});
it("ranks exact seconds, then overlap width, then stable identifiers",()=>{
  const o={id:"b",ownMemberName:"Own",ownRole:"driver" as const,earliest:"2099-01-01T08:50Z",latest:"2099-01-01T09:00Z",addedDurationSeconds:61};
  const r=rankHouseholds([{id:"1",name:"First",opportunities:[o,{...o,id:"a"}]},{id:"2",name:"Second",opportunities:[{...o,addedDurationSeconds:60}]},{id:"3",name:"Third",opportunities:[{...o,latest:"2099-01-01T09:10Z"}]}]);
  expect(r.map(h=>h.id)).toEqual(["2","3","1"]);expect(r[2].opportunities.map(o=>o.id)).toEqual(["a","b"]);
});
it("authenticates encrypted cursors and expires them",()=>{
  vi.stubEnv("SUPABASE_SECRET_KEY","test-only-secret");
  const context={user:id(1),event:id(610),household:id(101),leg:"to_event" as const};
  const state:DiscoveryState={version:1,...context,expires:Date.now()+60000,after:"",checked:0,failed:false,saved:[]};
  const token=encodeCursor(state);expect(decodeCursor(token,context)).toEqual(state);
  const bytes=Buffer.from(token,"base64url");bytes[30]^=1;expect(()=>decodeCursor(bytes.toString("base64url"),context)).toThrow();
  expect(()=>decodeCursor(encodeCursor({...state,expires:0}),context)).toThrow();
});
it("stops at the bounded search limit without claiming completeness",async()=>{
  candidates=Array.from({length:1001},(_,i)=>candidate(i));
  const context={user:id(1),event:id(610),household:id(101),leg:"to_event" as const};
  const cursor=encodeCursor({version:1,...context,expires:Date.now()+60000,after:candidates[998].pair_key,checked:999,failed:false,saved:[]});
  const r=await discoverMatches({...request,cursor});expect(r).toMatchObject({status:"ok",complete:false,limitReached:true});expect(r.cursor).toBeUndefined();expect(mocks.evaluate).toHaveBeenCalledTimes(1);
});
it("an empty discovery still rechecks access before reporting no matches",async()=>{
  candidates=[];expect(await discoverMatches(request)).toMatchObject({complete:true,households:[]});expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
