"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AttendanceForm } from "@/app/events/attendance-form";
import { RideForm } from "@/app/events/ride-form";
import { RideFields } from "@/app/events/ride-fields";
import { localInput } from "@/lib/events/time";
import { attendanceLabel, rideModeLabel, rideLegs, rideAnchor, type RideLeg, type OccurrenceTiming, type AttendanceStatus, type RideStatus } from "@/lib/events/participant-presentation";
type Preference = RideStatus & { household_location_id: string | null; anchor_earliest_at: string | null; anchor_latest_at: string | null; max_detour_minutes: number | null };
function Editor({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("select, input, button")?.focus(); }, []);
  return <div id={id} ref={ref} role="region" aria-label={label}>{children}</div>;
}
export function OccurrenceParticipantCard({ person, attendance, preferences, event, householdId, groupId, locations, now }: {
  person: { id: string; first_name: string; last_name: string | null; member_type: string };
  attendance?: AttendanceStatus; preferences: Preference[];
  event: OccurrenceTiming & { id: string; revision: number; timezone: string; event_series_id: string | null };
  householdId: string; groupId: string;
  locations: { id: string; label: string; is_primary: boolean }[]; now: number;
}) {
  const id = useId();
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [openRides, setOpenRides] = useState<Partial<Record<RideLeg, boolean>>>({});
  const [message, setMessage] = useState("");
  const attendanceTrigger = useRef<HTMLButtonElement>(null);
  const rideTriggers = useRef<Partial<Record<RideLeg, HTMLButtonElement | null>>>({});
  const future = event.status === "scheduled" && Math.max(...[event.required_arrival_at,event.ready_to_depart_at].filter((time): time is string => Boolean(time)).map(Date.parse)) > now;
  const going = attendance?.status === "going" && !attendance.disabled_at;
  const values = { groupId, householdId, memberId: person.id, eventId: event.id, revision: String(event.revision) };
  const closeAttendance = () => { setAttendanceOpen(false); attendanceTrigger.current?.focus(); };
  const closeRide = (leg: RideLeg) => { setOpenRides(current => ({ ...current, [leg]: false })); rideTriggers.current[leg]?.focus(); };
  return <section aria-label={`${name} participation`} className="my-4 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words text-xl font-semibold">{name}</h3><p className="text-sm">{person.member_type === "adult" ? "Adult" : "Child"}</p></div>
      {future ? <button type="button" ref={attendanceTrigger} aria-label={`Edit attendance for ${name}: ${attendanceLabel(attendance?.status)}`} aria-expanded={attendanceOpen} aria-controls={`${id}-attendance`} className="min-h-11 rounded-lg border px-3 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => { if (!attendanceOpen) { setMessage(""); setAttendanceOpen(true); } }}>{attendanceLabel(attendance?.status)}</button> : <span>{attendanceLabel(attendance?.status)}</span>}
    </div>
    {attendanceOpen && future && <Editor id={`${id}-attendance`} label={`${name} attendance editor`}>
      <AttendanceForm values={values} status={attendance?.status ?? "unknown"} recurring={Boolean(event.event_series_id)} participantName={name} onCancel={closeAttendance} onSaved={(feedback, status) => { setMessage(feedback); closeAttendance(); if (status !== "going") setOpenRides({}); }} />
    </Editor>}
    {!going && <p className="mt-3 text-sm">{attendance?.status === "not_going" ? "Not attending this occurrence." : "Save attendance as Going to configure ride preferences."}</p>}
    {going && rideLegs.map(leg => {
      const anchor = rideAnchor(event, leg);
      if (!anchor) return null;
      const preference = preferences.find(p => p.leg === leg);
      const direction = leg === "to_event" ? "To event" : "From event";
      const editable = event.status === "scheduled" && Date.parse(anchor) > now;
      const seats = preference && ["can_drive","either"].includes(preference.mode) && preference.available_seats != null ? ` · ${preference.available_seats} additional seat${preference.available_seats === 1 ? "" : "s"}` : "";
      const earliest = preference?.anchor_earliest_at ?? new Date(Date.parse(anchor) - (leg === "to_event" ? 600000 : 0)).toISOString();
      const latest = preference?.anchor_latest_at ?? new Date(Date.parse(anchor) + (leg === "from_event" ? 600000 : 0)).toISOString();
      return <div key={leg} className="mt-3 border-t pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><h4 className="font-medium">{direction}</h4><p className="text-sm">{rideModeLabel(preference?.mode)}{seats}</p>
            {preference?.needs_reconfirmation ? <p className="font-semibold text-amber-800 dark:text-amber-300">Needs reconfirmation</p> : preference?.disabled_at ? <p className="font-semibold">Disabled</p> : null}
          </div>
          {editable && <button type="button" ref={element => { rideTriggers.current[leg] = element; }} aria-label={`Edit ${direction.toLowerCase()} for ${name}`} aria-expanded={Boolean(openRides[leg])} aria-controls={`${id}-${leg}`} className="min-h-11 shrink-0 rounded-lg px-3 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => { if (!openRides[leg]) { setMessage(""); setOpenRides(current => ({ ...current, [leg]: true })); } }}>Edit</button>}
        </div>
        {openRides[leg] && editable && <Editor id={`${id}-${leg}`} label={`${name} ${direction.toLowerCase()} editor`}>
          <RideForm values={{ ...values, leg, timezone: event.timezone }} recurring={Boolean(event.event_series_id)} participantName={name} onCancel={() => closeRide(leg)} onSaved={feedback => { setMessage(feedback); closeRide(leg); }}>
            <RideFields adult={person.member_type === "adult"} initialMode={preference?.mode} locationId={preference ? preference.household_location_id : locations.find(l => l.is_primary)?.id} locations={locations} earliest={localInput(earliest,event.timezone)} latest={localInput(latest,event.timezone)} timezone={event.timezone} seats={preference?.available_seats} detour={preference?.max_detour_minutes} />
          </RideForm>
        </Editor>}
      </div>;
    })}
    {message && <p className="mt-3" role="status" aria-live="polite">{message}</p>}
  </section>;
}
