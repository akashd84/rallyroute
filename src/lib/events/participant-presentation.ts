export type AttendanceStatus = { member_id: string; status: string; disabled_at: string | null };
export type RideStatus = { member_id: string; leg: string; mode: string; disabled_at: string | null; needs_reconfirmation: boolean; available_seats: number | null };
export type OccurrenceTiming = { status: string; required_arrival_at: string | null; ready_to_depart_at: string | null };
export const rideLegs = ["to_event", "from_event"] as const;
export type RideLeg = typeof rideLegs[number];
export function attendanceLabel(status?: string) {
  return status === "going" ? "Going" : status === "not_going" ? "Not going" : "Unknown";
}
export function rideModeLabel(mode?: string) {
  return ({ need_ride: "Needs ride", can_drive: "Can drive", either: "Either", self_transport: "Self transport", none: "None" } as Record<string,string>)[mode ?? ""] ?? "Not configured";
}
export function rideAnchor(event: OccurrenceTiming, leg: RideLeg) {
  return leg === "to_event" ? event.required_arrival_at : event.ready_to_depart_at;
}
export function participantSummary(people: { id: string }[], attendance: AttendanceStatus[], rides: RideStatus[], event: OccurrenceTiming, now: number) {
  let going = 0, incomplete = 0;
  for (const person of people) {
    if (!attendance.some(a => a.member_id === person.id && a.status === "going" && !a.disabled_at)) continue;
    going++;
    if (event.status !== "scheduled") continue;
    for (const leg of rideLegs) {
      const anchor = rideAnchor(event, leg);
      if (!anchor || Date.parse(anchor) <= now) continue;
      const preference = rides.find(r => r.member_id === person.id && r.leg === leg);
      if (!preference || preference.disabled_at || preference.needs_reconfirmation) incomplete++;
    }
  }
  return { participants: people.length, going, incomplete };
}
