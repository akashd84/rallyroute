import { expect, it } from "vitest";
import { attendanceLabel, participantSummary, rideModeLabel, type RideStatus } from "@/lib/events/participant-presentation";
const now = Date.parse("2027-01-01T08:00Z");
const event = { status: "scheduled", required_arrival_at: "2027-01-01T09:00Z", ready_to_depart_at: "2027-01-01T17:00Z" };
const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
const attendance = [{ member_id: "a", status: "going", disabled_at: null }, { member_id: "b", status: "not_going", disabled_at: null }];
const ride = (overrides: Partial<RideStatus> = {}): RideStatus => ({ member_id: "a", leg: "to_event", mode: "self_transport", disabled_at: null, needs_reconfirmation: false, available_seats: null, ...overrides });
it("counts participants, active Going attendance and incomplete configured directions", () => {
  expect(participantSummary(people, attendance, [], event, now)).toEqual({ participants: 3, going: 1, incomplete: 2 });
  expect(participantSummary(people, attendance, [ride()], event, now).incomplete).toBe(1);
});
it("counts disabled and reconfirmation preferences, including either ride mode", () => {
  expect(participantSummary(people, attendance, [ride({ disabled_at: "2026-01-01Z" }), ride({ leg: "from_event", mode: "either", needs_reconfirmation: true })], event, now).incomplete).toBe(2);
});
it("treats self transport and None as complete", () => {
  expect(participantSummary(people, attendance, [ride(), ride({ leg: "from_event", mode: "none" })], event, now).incomplete).toBe(0);
});
it("excludes elapsed, unavailable and cancelled directions", () => {
  expect(participantSummary(people, attendance, [], event, Date.parse(event.required_arrival_at)).incomplete).toBe(1);
  expect(participantSummary(people, attendance, [], { ...event, ready_to_depart_at: null }, now).incomplete).toBe(1);
  expect(participantSummary(people, attendance, [], { ...event, status: "cancelled" }, now).incomplete).toBe(0);
});
it("does not count unknown or disabled attendance as Going", () => {
  expect(participantSummary(people, [{ ...attendance[0], disabled_at: "2026-01-01Z" }], [], event, now)).toEqual({ participants: 3, going: 0, incomplete: 0 });
});
it("uses readable attendance and ride labels", () => {
  expect(attendanceLabel()).toBe("Unknown"); expect(attendanceLabel("not_going")).toBe("Not going");
  expect(rideModeLabel("need_ride")).toBe("Needs ride"); expect(rideModeLabel()).toBe("Not configured");
});
