import { describe, expect, it } from "vitest";
import { expandRecurrence } from "../src/lib/events/recurrence";
import { localInstant } from "../src/lib/events/time";
const base = {
  frequency: "daily",
  startDate: "2099-01-01",
  endDate: "2099-01-04",
  timezone: "America/New_York",
  arrivalTime: "09:00",
};
describe("event timezone and recurrence", () => {
  it("converts one-off times independently of the host timezone", () =>
    expect(localInstant("2026-01-01", "09:00", "America/New_York")).toBe(
      "2026-01-01T14:00:00Z",
    ));
  it("rejects nonexistent and ambiguous one-off input", () => {
    expect(() =>
      localInstant("2026-03-08", "02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      localInstant("2026-11-01", "01:30", "America/New_York"),
    ).toThrow();
  });
  it("expands daily intervals", () =>
    expect(
      expandRecurrence({ ...base, interval: 2 }).occurrences.map(
        (o) => o.original_local_date,
      ),
    ).toEqual(["2099-01-01", "2099-01-03"]));
  it("requires weekly weekdays", () =>
    expect(() => expandRecurrence({ ...base, frequency: "weekly" })).toThrow());
  it("skips missing month days", () =>
    expect(
      expandRecurrence({
        ...base,
        frequency: "monthly",
        monthDay: 31,
        endDate: "2099-04-30",
      }).occurrences.map((o) => o.original_local_date),
    ).toEqual(["2099-01-31", "2099-03-31"]));
  it("supports leap days", () =>
    expect(
      expandRecurrence({
        ...base,
        frequency: "monthly",
        startDate: "2028-02-01",
        endDate: "2028-03-01",
        monthDay: 29,
      }).occurrences[0].original_local_date,
    ).toBe("2028-02-29"));
  it("supports last weekdays", () =>
    expect(
      expandRecurrence({
        ...base,
        frequency: "monthly",
        monthlyMode: "weekday",
        ordinal: -1,
        weekday: "MO",
        endDate: "2099-02-28",
      }).occurrences,
    ).toHaveLength(2));
  it("skips missing fifth weekdays", () =>
    expect(
      expandRecurrence({
        ...base,
        frequency: "monthly",
        monthlyMode: "weekday",
        ordinal: 5,
        weekday: "MO",
        endDate: "2099-04-30",
      }).occurrences.length,
    ).toBeLessThan(4));
  it("skips nonexistent recurring clock times", () =>
    expect(
      expandRecurrence({
        ...base,
        startDate: "2026-03-07",
        endDate: "2026-03-09",
        arrivalTime: "02:30",
      }).skipped,
    ).toHaveLength(1));
  it("uses and discloses the earlier repeated clock time", () => {
    const result = expandRecurrence({
      ...base,
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      arrivalTime: "01:30",
    });
    expect(result.occurrences[0].required_arrival_at).toBe(
      "2026-11-01T05:30:00Z",
    );
    expect(result.occurrences[0].notices).toHaveLength(1);
  });
  it("preserves wall clock across DST", () => {
    const result = expandRecurrence({
      ...base,
      startDate: "2026-03-07",
      endDate: "2026-03-09",
    });
    expect(result.occurrences.map((o) => o.required_arrival_at)).toEqual([
      "2026-03-07T14:00:00Z",
      "2026-03-08T13:00:00Z",
      "2026-03-09T13:00:00Z",
    ]);
  });
  it("bounds inclusive calendar ranges", () =>
    expect(() =>
      expandRecurrence({ ...base, endDate: "2100-01-02" }),
    ).toThrow());
  it("supports next-day departure", () =>
    expect(
      expandRecurrence({
        ...base,
        departureTime: "01:00",
        departureNextDay: true,
      }).occurrences[0].ready_to_depart_at,
    ).toBe("2099-01-02T06:00:00Z"));
  it("rejects departure before arrival", () =>
    expect(() =>
      expandRecurrence({ ...base, departureTime: "08:00" }),
    ).toThrow());
});
