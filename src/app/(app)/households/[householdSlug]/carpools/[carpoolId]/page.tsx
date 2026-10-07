import { householdPath } from "@/lib/households/paths";
/* eslint-disable react-hooks/purity -- Current time and request IDs belong to this dynamic server request. */
import { randomUUID } from "node:crypto";
import { eventUrlForId } from "@/lib/events/urls";
import Link from "next/link";
import { z } from "zod";
import { householdContext } from "@/lib/households/context";
import { carpoolSchema } from "@/lib/carpools/types";
import { displayTime, localInput } from "@/lib/events/time";
import { CarpoolForm, CarpoolConsent, ProposeRide, SelectParticipants } from "@/app/households/[id]/carpools/forms";
export const dynamic = "force-dynamic";
export default async function CarpoolPage({ params }: { params: Promise<{ householdSlug: string; carpoolId: string }> }) {
  const { householdSlug, carpoolId } = await params;
  const { household, supabase } = await householdContext(householdSlug);
  const id = household.id;
  if (!z.string().uuid().safeParse(carpoolId).success) return <div>Carpool unavailable</div>;
  if (!household) return <div>Carpool unavailable</div>;
  const result = await supabase.rpc("get_carpool", { p_household_id: id, p_carpool_id: carpoolId });
  const parsed = carpoolSchema.safeParse(result.data);
  if (result.error || !parsed.success) return <div className="p-6"><p role="alert">Carpool unavailable. Reload to check access.</p><Link href={`${householdPath(householdSlug)}/carpools`}>Your carpools</Link></div>;
  const c = parsed.data;
  const eventUrls = new Map(await Promise.all([...new Set(c.rides.map(ride => ride.eventId))].map(async eventId => [eventId, await eventUrlForId(supabase, c.groupId, eventId)] as const)));
  const [events, people, attendance, preferences] = c.status === "accepted" ? await Promise.all([
    supabase.from("events").select("id,name,revision,timezone,required_arrival_at,ready_to_depart_at").eq("group_id",c.groupId).eq("status","scheduled").or(`required_arrival_at.gt.${new Date().toISOString()},ready_to_depart_at.gt.${new Date().toISOString()}`).order("required_arrival_at"),
    supabase.from("household_members").select("id,first_name,last_name,member_type").eq("household_id",id).is("archived_at",null),
    supabase.from("event_participation").select("event_id,member_id,status").eq("status","going").is("disabled_at",null),
    supabase.from("ride_participation").select("event_id,member_id,leg,available_seats").in("mode",["can_drive","either"]),
  ]) : [{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  const selectionsLoaded = !events.error && !people.error && !attendance.error && !preferences.error;
  const base = { householdId:id, carpoolId, revision:String(c.revision) };
  const now = Date.now();
  return <div className="mx-auto max-w-3xl p-6"><Link className="underline" href={`${householdPath(householdSlug)}/carpools`}>Your carpools</Link>
    <h1 className="my-4 text-3xl">Carpool with {c.otherHouseholdName ?? "connected household"}</h1><p>{c.groupName} — Status: {c.status}</p>
    <p className="my-3">Both households approve each ride. Times and routes are agreed manually. Pickup addresses require separate consent.</p>
    <Link className="underline" href={`${householdPath(householdSlug)}/connections`}>Contacts and pickup sharing</Link>
    {c.status === "pending" && <>{c.incoming ? <>
      <CarpoolForm command="accept" values={base} label="Accept carpool"><CarpoolConsent /></CarpoolForm>
      <CarpoolForm command="decline" values={base} label="Decline carpool" />
    </> : <p>Waiting for the other household to accept.</p>}</>}
    {(c.status === "pending" || c.status === "accepted") && <CarpoolForm command="close" values={base} label="Close carpool" confirmation="Close this carpool and cancel its future rides?" />}
    {c.status === "accepted" && <section aria-label="Propose a ride" className="my-6"><h2 className="text-2xl">Propose a ride</h2>
      {selectionsLoaded ? <ProposeRide householdId={id} carpoolId={carpoolId} requestId={randomUUID()} events={events.data ?? []} /> : <p role="alert">Selections could not be loaded. Reload before editing.</p>}
    </section>}
    <h2 className="my-4 text-2xl">Schedule</h2>{!c.rides.length && <p>No rides proposed yet.</p>}
    {c.rides.map(r => {
      const editable = c.status === "accepted" && r.status !== "canceled" && Date.parse(r.anchorAt)>now && selectionsLoaded;
      const values = { householdId:id,carpoolId,rideId:r.id,revision:String(r.revision) };
      const eligible = (people.data ?? []).filter(p => attendance.data?.some(a => a.event_id===r.eventId && a.member_id===p.id));
      const driver = r.participants.find(p => p.role==='driver');
      const riders = r.participants.filter(p => p.role==='rider');
      return <section key={`${r.id}-${r.revision}`} aria-label={`${r.eventName} ${r.leg}`} className="my-6 rounded border p-4">
        <h3 className="text-xl">{eventUrls.get(r.eventId) ? <Link className="underline" href={`${eventUrls.get(r.eventId)}?household=${id}`}>{r.eventName}</Link> : r.eventName} — {r.leg==='to_event'?'To event':'From event'}</h3>
        <p>Agreed {r.leg==='to_event'?'arrival':'departure'}: {displayTime(r.anchorAt,r.timezone)} ({r.timezone})</p>
        <p>Status: {r.status}{Date.parse(r.anchorAt)<=now?' — history':''}</p>{r.reason && <p role="status">{r.reason}</p>}
        <p>Driver: {driver?.name ?? "Not assigned"}</p><p>Riders: {riders.map(p => p.name).join(", ") || "None selected"}</p>
        <p>Additional rider seats: {r.availableSeats ?? "Not set"}; selected passengers: {riders.length}</p>
        <p>Your approval: {r.ownApproved?'approved':'needed'}; other household: {r.otherApproved?'approved':'needed'}</p>
        {editable && <>
          <CarpoolForm command="approve" values={values} label="Approve ride"><CarpoolConsent approval /></CarpoolForm>
          <details><summary className="cursor-pointer underline">Edit ride — both households must approve again</summary>
            <SelectParticipants values={values} people={eligible} ride={r} />
            {(!driver || r.driverOwn) && <CarpoolForm command="driver" values={values} label="Save driver and seats">
              <label className="block">Adult driver<select name="driverMemberId" required defaultValue={driver?.own?driver.id:""} className="block rounded border p-2"><option value="">Select your adult driver</option>{eligible.filter(p=>p.member_type==='adult').map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
              <label className="block">Additional rider seats<input name="availableSeats" type="number" min={1} max={20} required defaultValue={r.availableSeats ?? preferences.data?.find(p => p.event_id===r.eventId && p.leg===r.leg && p.member_id===eligible.find(p=>p.member_type==='adult')?.id)?.available_seats ?? 1} className="block rounded border p-2" /></label><CarpoolConsent />
            </CarpoolForm>}
            {r.driverOwn && <CarpoolForm command="clear_driver" values={values} label="Release driver assignment"><CarpoolConsent /></CarpoolForm>}
            <CarpoolForm command="time" values={{...values,timezone:r.timezone}} label="Save agreed time"><label className="block">Agreed time ({r.timezone})<input name="localTime" type="datetime-local" required defaultValue={localInput(r.anchorAt,r.timezone)} className="block rounded border p-2" /></label><CarpoolConsent /></CarpoolForm>
          </details>
          <CarpoolForm command="cancel" values={values} label="Cancel ride" confirmation="Cancel this ride for both households?" />
        </>}
      </section>;
    })}
  </div>;
}
