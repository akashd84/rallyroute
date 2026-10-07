import { describe, expect, it } from "vitest";
import { eventCards, type EventCard } from "@/lib/events/cards";

const now = Date.parse("2026-10-06T12:00:00Z");
function event(id: string, date: string, series: string | null = null, group = "group-a"): EventCard {
  return { id, slug: id, group_id: group, event_series_id: series, name: "Practice", required_arrival_at: `${date}T09:00:00Z`, ready_to_depart_at: `${date}T17:00:00Z`, timezone: "UTC", status: "scheduled" };
}
describe("group event cards", () => {
  it("keeps separate one-off events and distinct series with the same name", () => {
    const records = [event("one", "2026-10-07"), event("two", "2026-10-07"), event("series-a", "2026-10-07", "a"), event("series-b", "2026-10-07", "b")];
    expect(eventCards(records, now)).toHaveLength(4);
  });
  it("keeps all upcoming occurrences in chronological order regardless of input order", () => {
    const records = [event("later", "2026-10-09", "a"), event("past", "2026-10-01", "a"), event("next", "2026-10-07", "a")];
    expect(eventCards(records, now).map(e => e.id)).toEqual(["next", "later"]);
    expect(records[0].id).toBe("later");
  });
  it("keeps ongoing events and excludes finished series", () => {
    const records = [event("today", "2026-10-06", "a"), event("tomorrow", "2026-10-07", "a"), event("older", "2026-10-01", "b"), event("latest", "2026-10-02", "b")];
    expect(eventCards(records, now).map(e => e.id)).toEqual(["today", "tomorrow"]);
  });
  it("excludes cancelled future occurrences and keeps exact departure boundaries", () => {
    const cancelled = { ...event("cancelled", "2026-10-07"), status: "cancelled" };
    const boundary = { ...event("boundary", "2026-10-06"), ready_to_depart_at: "2026-10-06T12:00:00Z" };
    expect(eventCards([cancelled, boundary], now).map(e => e.id)).toEqual(["boundary"]);
  });
  it("includes the seven-day boundary but excludes later arrivals and departures", () => {
    const boundary = { ...event("boundary", "2026-10-13"), required_arrival_at: "2026-10-13T12:00:00Z" };
    const later = { ...boundary, id: "later", required_arrival_at: "2026-10-13T12:00:00.001Z" };
    const departure = { ...boundary, id: "departure", required_arrival_at: null, ready_to_depart_at: "2026-10-13T12:00:00Z" };
    const far = event("far", "2026-10-14", "series");
    expect(eventCards([far, later, departure, boundary], now).map(e => e.id)).toEqual(["boundary", "departure"]);
  });
  it("keeps series separate across groups and handles departure-only events", () => {
    const departure = { ...event("departure", "2026-10-07", "a"), required_arrival_at: null };
    expect(eventCards([departure, event("other", "2026-10-07", "a", "group-b")], now).map(e => e.id)).toEqual(["other", "departure"]);
    expect(eventCards([], now)).toEqual([]);
  });
});
