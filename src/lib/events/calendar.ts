import { Temporal } from "@js-temporal/polyfill";
import { eventPath } from "./paths";
import type { Database } from "@/lib/supabase/database.types";
export const calendarViews = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"] as const;
export type CalendarView = typeof calendarViews[number];
export type CalendarEntry = { id: string; title: string; start: string; end?: string; allDay: false; url: string; classNames: string[]; extendedProps: { recurring: boolean; status: string; timezone: string } };
export type CalendarRecord = Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "slug" | "name" | "status" | "timezone" | "event_series_id" | "activity_starts_at" | "activity_ends_at" | "required_arrival_at" | "ready_to_depart_at">;
export function calendarDate(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try { return Temporal.PlainDate.from(value).toString() === value ? value : undefined; } catch { return undefined; }
}
export function calendarView(value?: string): CalendarView | undefined {
  return calendarViews.find(view => view === value);
}
export function calendarQuery(date?: string, view?: string) {
  const query = new URLSearchParams();
  if (calendarDate(date)) query.set("date", date!);
  if (calendarView(view)) query.set("view", view!);
  return query.size ? `?${query}` : "";
}
export function calendarEntry(event: CalendarRecord, groupSlug: string): CalendarEntry {
  const start = event.activity_starts_at ?? event.required_arrival_at ?? event.activity_ends_at ?? event.ready_to_depart_at!;
  const end = event.activity_ends_at ?? event.ready_to_depart_at;
  return { id: event.id, title: event.name, start, ...(end && Date.parse(end) > Date.parse(start) ? { end } : {}), allDay: false,
    url: eventPath(groupSlug,event.slug), classNames: event.status === "cancelled" ? ["rally-calendar-cancelled"] : [],
    extendedProps: { recurring: Boolean(event.event_series_id), status: event.status, timezone: event.timezone } };
}
export function calendarOverlap(event: CalendarEntry, start: number, end: number) {
  const eventStart = Date.parse(event.start);
  return eventStart < end && (event.end ? Date.parse(event.end) > start : eventStart >= start);
}
