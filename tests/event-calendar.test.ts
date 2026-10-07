import { expect, it } from "vitest";
import { calendarDate, calendarView, calendarQuery, calendarEntry, calendarOverlap, type CalendarRecord } from "@/lib/events/calendar";
const record: CalendarRecord = { id: "id", slug: "game", name: "Game", status: "scheduled", timezone: "America/New_York", event_series_id: null, activity_starts_at: null, activity_ends_at: null, required_arrival_at: "2027-03-13T09:00:00-05:00", ready_to_depart_at: "2027-03-13T17:00:00-05:00" };
it("validates dates and view query parameters", () => {
  expect(calendarDate("2027-02-29")).toBeUndefined(); expect(calendarDate("2028-02-29")).toBe("2028-02-29");
  expect(calendarDate("2027-01-01<script>")).toBeUndefined(); expect(calendarView("custom")).toBeUndefined();
  expect(calendarQuery("2027-03-15","listWeek")).toBe("?date=2027-03-15&view=listWeek"); expect(calendarQuery("invalid","bad")).toBe("");
});
it("prefers activity times and falls back to transportation anchors", () => {
  expect(calendarEntry(record,"club")).toMatchObject({ start: record.required_arrival_at, end: record.ready_to_depart_at, url: "/groups/club/game" });
  expect(calendarEntry({ ...record, activity_starts_at: "2027-03-13T10:00:00-05:00" },"club")).toMatchObject({ start: "2027-03-13T10:00:00-05:00", end: record.ready_to_depart_at });
  expect(calendarEntry({ ...record, activity_ends_at: "2027-03-13T16:00:00-05:00" },"club")).toMatchObject({ start: record.required_arrival_at, end: "2027-03-13T16:00:00-05:00" });
});
it("renders single anchors and invalid end intervals without inventing an end", () => {
  expect(calendarEntry({ ...record, ready_to_depart_at: null },"club").end).toBeUndefined();
  expect(calendarEntry({ ...record, required_arrival_at: null },"club")).toMatchObject({ start: record.ready_to_depart_at });
  expect(calendarEntry({ ...record, activity_starts_at: "2027-03-14T01:00:00Z" },"club").end).toBeUndefined();
});
it("uses exclusive range boundaries and includes overnight spans", () => {
  const entry=calendarEntry(record,"club"); const start=Date.parse(entry.start),end=Date.parse(entry.end!);
  expect(calendarOverlap(entry,start,end)).toBe(true); expect(calendarOverlap(entry,end,end+1000)).toBe(false); expect(calendarOverlap(entry,start-1000,start)).toBe(false);
  expect(calendarOverlap({ ...entry,end: undefined },start,start+1000)).toBe(true);
  const overnight=calendarEntry({ ...record, required_arrival_at: "2027-03-13T23:00:00-05:00", ready_to_depart_at: "2027-03-14T03:00:00-04:00" },"club");
  expect(calendarOverlap(overnight,Date.parse("2027-03-14T00:00:00-05:00"),Date.parse("2027-03-15T00:00:00-04:00"))).toBe(true);
});
it("keeps separate occurrence identifiers and cancelled metadata", () => {
  const entry=calendarEntry({ ...record, status: "cancelled", event_series_id: "series" },"club");
  expect(entry.classNames).toContain("rally-calendar-cancelled"); expect(entry.extendedProps).toEqual({ recurring: true,status: "cancelled",timezone: "America/New_York" });
});
it("compares mixed timezones and repeated daylight-saving hours as instants", () => {
  const entry = calendarEntry({ ...record, activity_starts_at: "2027-11-07T01:30:00-04:00", activity_ends_at: "2027-11-07T01:30:00-05:00" }, "club");
  expect(Date.parse(entry.end!) - Date.parse(entry.start)).toBe(3600000);
  expect(calendarOverlap(entry, Date.parse("2027-11-07T05:45:00Z"), Date.parse("2027-11-07T06:00:00Z"))).toBe(true);
  const sameInstant = calendarEntry({ ...record, activity_starts_at: "2027-03-13T09:00:00-05:00", activity_ends_at: "2027-03-13T14:00:00Z" }, "club");
  expect(sameInstant.end).toBeUndefined();
});
