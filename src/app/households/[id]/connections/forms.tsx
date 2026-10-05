"use client";
import { useState } from "react";
import { WorkflowForm } from "@/components/workflow-form";
import { connectionAction } from "@/lib/connections/actions";
import { displayAddress, type locationsSchema } from "@/lib/connections/types";
import type { z } from "zod";
export function ConnectionForm(props: Omit<Parameters<typeof WorkflowForm>[0], "submitAction">) {
  return <WorkflowForm {...props} submitAction={connectionAction} />;
}
export function ContactConsent({ name, email, phone = "" }: { name: string; email: string; phone?: string | null }) {
  return <><p>Share your contact: <strong>{name}</strong> — {email}</p>
    <label className="block">Optional phone number<input name="phone" type="tel" maxLength={40} defaultValue={phone ?? ""} className="block w-full rounded border p-2" /></label>
    <label className="block"><input name="consent" value="yes" type="checkbox" required /> I agree to share my name, email, and optional phone with all account holders in the connected household after acceptance.</label>
    <p className="text-sm">Acceptance does not share pickup addresses. Disconnecting removes access in RallyRoute; it cannot erase details someone already copied.</p>
  </>;
}
export type ShareEvent = { id: string; name: string; revision: number; timezone: string; required_arrival_at: string | null; ready_to_depart_at: string | null };
export function SharePickupForm({ householdId, connectionId, locations, events, now }: {
  householdId: string; connectionId: string; locations: z.infer<typeof locationsSchema>; events: ShareEvent[]; now: number;
}) {
  const active = locations.filter(l => !l.archived_at && l.address_line_1);
  const [locationId, setLocationId] = useState("");
  const [eventId, setEventId] = useState("");
  const [leg, setLeg] = useState<"to_event" | "from_event">("to_event");
  const location = active.find(l => l.id === locationId);
  const event = events.find(e => e.id === eventId);
  const anchor = event && (leg === "to_event" ? event.required_arrival_at : event.ready_to_depart_at);
  if (!active.length || !events.length) return <p>Add a saved household address and an upcoming group event before sharing a pickup address.</p>;
  return <ConnectionForm command="share" values={{ householdId, connectionId, locationRevision: String(location?.revision ?? 0), eventRevision: String(event?.revision ?? 0) }} label="Share pickup address" confirmation="Share this exact address for the selected event and direction?">
    <label className="block">Pickup address<select name="locationId" required value={locationId} onChange={e => setLocationId(e.target.value)} className="block rounded border p-2"><option value="">Select address</option>{active.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
    <label className="block">Event<select name="eventId" required value={eventId} onChange={e => setEventId(e.target.value)} className="block rounded border p-2"><option value="">Select event</option>{events.map(e => <option key={e.id} value={e.id}>{e.name} — {new Intl.DateTimeFormat(undefined, { timeZone: e.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(e.required_arrival_at ?? e.ready_to_depart_at!))}</option>)}</select></label>
    <label className="block">Direction<select name="leg" value={leg} onChange={e => setLeg(e.target.value as typeof leg)} className="block rounded border p-2"><option value="to_event">To event</option><option value="from_event">From event</option></select></label>
    {location && <p>Address to share: {displayAddress(location)}</p>}
    {event && (anchor && Date.parse(anchor) > now ? <p>Sharing ends {new Intl.DateTimeFormat(undefined, { timeZone: event.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(anchor))} ({event.timezone}).</p> : <p role="alert">This direction is unavailable. Choose an upcoming ride direction.</p>)}
    <label><input name="consent" value="yes" type="checkbox" required /> Share this address with this connected household for this event and direction only.</label>
  </ConnectionForm>;
}
