import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({ auth:vi.fn(),group:vi.fn(),page:vi.fn(),from:vi.fn(),or:vi.fn() }));
vi.mock("@/lib/supabase/server",()=>({ createClient:async()=>({ auth:{getUser:m.auth},from:m.from }) }));
import { calendarEventsAction } from "@/app/events/calendar-actions";
const input={ slug:"club",start:"2027-03-01T00:00:00Z",end:"2027-04-01T00:00:00Z" };
const event={id:"id",slug:"game",name:"Game",status:"scheduled",timezone:"UTC",event_series_id:null,activity_starts_at:null,activity_ends_at:null,required_arrival_at:"2027-03-13T09:00Z",ready_to_depart_at:null};
beforeEach(()=>{
  vi.clearAllMocks(); m.auth.mockResolvedValue({data:{user:{id:"user"}},error:null});m.group.mockResolvedValue({data:{id:"group",slug:"club"},error:null});m.page.mockResolvedValue({data:[],error:null});
  m.from.mockImplementation(table=>{
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),or:m.or,order:vi.fn().mockReturnThis(),range:m.page,maybeSingle:m.group};
    m.or.mockReturnValue(query);return table==="groups"?query:query;
  });
});
it("authenticates and paginates without exposing domain records",async()=>{
  m.page.mockResolvedValueOnce({data:Array.from({length:500},(_,i)=>({...event,id:String(i)})),error:null}).mockResolvedValueOnce({data:[{...event,id:"501",secret:"not returned"}],error:null});
  const result=await calendarEventsAction(input);expect(result.ok).toBe(true);expect(result.events).toHaveLength(501);
  expect(m.page).toHaveBeenNthCalledWith(1,0,499);expect(m.page).toHaveBeenNthCalledWith(2,500,999);
  expect(m.or.mock.calls[0][0]).toContain("and(or(activity_starts_at.lt.");expect(JSON.stringify(result)).not.toContain("secret");
});
it("filters candidate false positives and handles empty ranges",async()=>{
  m.page.mockResolvedValue({data:[{...event,activity_starts_at:"2027-05-01T09:00Z"}],error:null});
  expect(await calendarEventsAction(input)).toMatchObject({ok:true,events:[]});
});
it("denies unauthenticated and inaccessible groups",async()=>{
  m.auth.mockResolvedValue({data:{user:null},error:null});expect((await calendarEventsAction(input)).ok).toBe(false);expect(m.from).not.toHaveBeenCalled();
  m.auth.mockResolvedValue({data:{user:{id:"user"}},error:null});m.group.mockResolvedValue({data:null,error:null});expect((await calendarEventsAction(input)).ok).toBe(false);expect(m.page).not.toHaveBeenCalled();
});
it("rejects invalid or excessive ranges before querying",async()=>{
  expect((await calendarEventsAction({...input,slug:"not/a/slug"})).ok).toBe(false);
  expect((await calendarEventsAction({...input,end:input.start})).ok).toBe(false);
  expect((await calendarEventsAction({...input,end:"2028-01-01T00:00:00Z"})).ok).toBe(false);expect(m.auth).not.toHaveBeenCalled();
});
it("reports query failures without a partial calendar",async()=>{
  m.page.mockResolvedValue({data:null,error:{message:"internal"}});expect(await calendarEventsAction(input)).toMatchObject({ok:false,message:"Unable to load events. Try again."});
});
