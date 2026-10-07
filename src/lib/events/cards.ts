import type { Database } from "@/lib/supabase/database.types";

export type EventCard = Pick<Database["public"]["Tables"]["events"]["Row"],
  "id" | "slug" | "group_id" | "event_series_id" | "name" | "required_arrival_at" | "ready_to_depart_at" | "timezone" | "status">;

function anchor(event: EventCard): number {
  return Date.parse(event.required_arrival_at ?? event.ready_to_depart_at!);
}

// Rolling seven-day window, including occurrences already in progress.
export function eventCards(events: EventCard[], now: number): EventCard[] {
  const until = now + 7 * 24 * 60 * 60 * 1000;
  return events.filter(event => event.status === "scheduled" &&
    Date.parse(event.ready_to_depart_at ?? event.required_arrival_at!) >= now && anchor(event) <= until)
    .sort((a, b) => anchor(a) - anchor(b) || a.id.localeCompare(b.id));
}
