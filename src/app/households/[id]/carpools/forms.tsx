"use client";
import { useState } from "react";
import { WorkflowForm } from "@/components/workflow-form";
import { carpoolAction } from "@/lib/carpools/actions";
import type { CarpoolRide } from "@/lib/carpools/types";
import { displayTime, localInput } from "@/lib/events/time";
export function CarpoolForm(props: Omit<Parameters<typeof WorkflowForm>[0], "submitAction">) {
  return <WorkflowForm {...props} submitAction={carpoolAction} />;
}
export function CarpoolConsent({ approval = false }: { approval?: boolean }) {
  return <label className="block"><input name="consent" type="checkbox" value="yes" required /> {approval ? "I approve this exact ride for my household." : "I agree to share my selected participants’ names and ride roles with the connected household."}</label>;
}
export type RideEvent = { id: string; name: string; revision: number; timezone: string; required_arrival_at: string | null; ready_to_depart_at: string | null };
export type RidePerson = { id: string; first_name: string; last_name: string | null; member_type: string };
export function ProposeRide({ householdId, carpoolId, requestId, events }: { householdId: string; carpoolId: string; requestId: string; events: RideEvent[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [leg, setLeg] = useState<"to_event" | "from_event">("to_event");
  const event = events.find(e => e.id === eventId);
  const anchor = event && (leg === "to_event" ? event.required_arrival_at : event.ready_to_depart_at);
  if (!event) return <p>No upcoming group events are available.</p>;
  return <CarpoolForm command="propose" label="Propose ride" values={{ householdId, carpoolId, requestId, eventRevision: String(event.revision), timezone: event.timezone }}>
    <label className="block">Event<select name="eventId" value={eventId} onChange={e => setEventId(e.target.value)} className="block rounded border p-2">{events.map(e => <option key={e.id} value={e.id}>{e.name} — {displayTime(e.required_arrival_at ?? e.ready_to_depart_at, e.timezone)}</option>)}</select></label>
    <label className="block">Direction<select name="leg" value={leg} onChange={e => setLeg(e.target.value as typeof leg)} className="block rounded border p-2"><option value="to_event">To event</option><option value="from_event">From event</option></select></label>
    <label className="block">Agreed {leg === "to_event" ? "arrival" : "departure"} time ({event.timezone})<input key={`${eventId}-${leg}`} name="localTime" type="datetime-local" required defaultValue={localInput(anchor ?? null, event.timezone)} className="block rounded border p-2" /></label>
    <CarpoolConsent />
  </CarpoolForm>;
}
export function SelectParticipants({ values, people, ride }: { values: Record<string,string>; people: RidePerson[]; ride: CarpoolRide }) {
  const [selected, setSelected] = useState(ride.participants.filter(p => p.own).map(p => p.id));
  return <CarpoolForm command="participants" values={values} label="Save my participants">
    <input name="memberIds" type="hidden" value={JSON.stringify(selected)} />
    <fieldset><legend>My attending participants</legend>{people.map(p => <label key={p.id} className="block"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(current => e.target.checked ? [...current,p.id] : current.filter(id => id!==p.id))} /> {p.first_name} {p.last_name}</label>)}</fieldset>
    <p>Include your assigned driver. Every other selected person uses an additional rider seat.</p><CarpoolConsent />
  </CarpoolForm>;
}
