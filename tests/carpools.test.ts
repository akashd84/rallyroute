import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), single: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser:m.user }, rpc:m.rpc, from:()=>({select:()=>({eq:()=>({maybeSingle:m.single,is:()=>({maybeSingle:m.single})})})}) }) }));
import { carpoolAction } from "@/lib/carpools/actions";
import { carpoolCommandSchema } from "@/lib/carpools/types";
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={householdId:id(101),carpoolId:id(1001),rideId:id(1002),revision:3,consent:'yes'};
beforeEach(()=>{
  vi.resetAllMocks();
  m.user.mockResolvedValue({data:{user:{id:id(1)}},error:null});
  m.rpc.mockResolvedValue({data:{status:'ok',id:id(1001)},error:null});
  m.single.mockResolvedValue({data:{timezone:'America/New_York',slug:'fixture-household-a'},error:null});
});
describe('carpool validation and server boundary',()=>{
  it('requires Auth before invoking a mutation',async()=>{
    m.user.mockResolvedValue({data:{user:null},error:null});
    expect(await carpoolAction({command:'approve',...base})).toMatchObject({ok:false,destination:'/sign-in'});
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(['create','accept','propose','participants','driver','clear_driver','time','approve'])('requires consent for %s',async command=>{
    expect(await carpoolAction({command,...base,consent:undefined})).toMatchObject({ok:false});
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('parses selected IDs without trusting supplied identities',async()=>{
    expect(await carpoolAction({command:'participants',...base,memberIds:JSON.stringify([id(202)]),userId:id(999),name:'Forged'})).toMatchObject({ok:true});
    expect(m.rpc).toHaveBeenCalledWith('carpool_action',{p_command:'participants',p_data:{command:'participants',...base,memberIds:[id(202)]}});
  });
  it.each(['bad','{}',JSON.stringify([id(202),id(202)])])('rejects malformed/duplicate selections %s',memberIds=>{
    expect(carpoolCommandSchema.safeParse({command:'participants',...base,memberIds}).success).toBe(false);
  });
  it.each([0,21,1.5])('rejects invalid capacity %s',availableSeats=>{
    expect(carpoolCommandSchema.safeParse({command:'driver',...base,driverMemberId:id(201),availableSeats}).success).toBe(false);
  });
  it('converts event-local time using the trusted timezone',async()=>{
    expect(await carpoolAction({command:'propose',householdId:base.householdId,carpoolId:base.carpoolId,eventId:id(610),eventRevision:1,requestId:id(1003),leg:'to_event',localTime:'2099-01-01T09:00',timezone:'America/New_York',consent:'yes'})).toMatchObject({ok:true});
    expect(m.rpc).toHaveBeenCalledWith('carpool_action',expect.objectContaining({p_data:expect.objectContaining({anchorAt:'2099-01-01T14:00:00Z'})}));
  });
  it('rejects a stale timezone before saving',async()=>{
    expect(await carpoolAction({command:'propose',...base,eventId:id(610),eventRevision:1,requestId:id(1003),leg:'to_event',localTime:'2099-01-01T09:00',timezone:'Etc/UTC'})).toMatchObject({ok:false});
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(['assignment_conflict','invalid_ride','conflict','unavailable'])('reports %s without success',async status=>{
    m.rpc.mockResolvedValue({data:{status},error:null});
    expect(await carpoolAction({command:'approve',...base})).toMatchObject({ok:false});
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it('handles provider errors without exposing them',async()=>{
    m.rpc.mockRejectedValue(new Error('private database details'));
    expect(await carpoolAction({command:'approve',...base})).toEqual({ok:false,message:'Unable to save this carpool. Reload and try again.'});
  });
  it('navigates to the created or existing carpool',async()=>{
    expect(await carpoolAction({command:'create',householdId:id(101),connectionId:id(1000),requestId:id(1001),consent:'yes'})).toMatchObject({ok:true,destination:`/households/fixture-household-a/carpools/${id(1001)}`});
  });
});
