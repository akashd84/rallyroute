import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.user }, rpc: m.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
import { seriesRideAction } from "@/app/events/series-ride-actions";
const input = { command: "ride", householdId: "33333333-3333-4333-8333-333333333333", memberId: "22222222-2222-4222-8222-222222222222", eventId: "44444444-4444-4444-8444-444444444444", revision: "1", leg: "to_event", mode: "need_ride", locationId: "55555555-5555-4555-8555-555555555555", timezone: "America/New_York", earliestLocal: "2027-03-13T08:50", latestLocal: "2027-03-13T09:00" };
const snapshot = "a".repeat(32);
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); });
it("previews concrete source timestamps and commits the confirmed token", async () => {
  m.rpc.mockResolvedValue({ data: { count: 2, skipped: 1, snapshot }, error: null });
  expect(await seriesRideAction(input)).toMatchObject({ ok: true, count: 2, skipped: 1, snapshot });
  expect(m.refresh).not.toHaveBeenCalled();
  expect(m.rpc.mock.lastCall?.[1].p_data).toMatchObject({ earliest: "2027-03-13T13:50:00Z", latest: "2027-03-13T14:00:00Z" });
  expect(await seriesRideAction({ ...input, expected: snapshot })).toMatchObject({ ok: true, message: "Ride preferences updated for 2 occurrences. 1 skipped." });
  expect(m.rpc.mock.lastCall?.[1].p_expected).toBe(snapshot);
  expect(m.refresh).toHaveBeenCalledWith("/groups", "layout");
});
it("reports no eligible occurrences", async () => {
  m.rpc.mockResolvedValue({ data: { count: 0, skipped: 2, snapshot }, error: null });
  expect(await seriesRideAction(input)).toMatchObject({ ok: true, count: 0, skipped: 2 });
});
it.each(["40001", "42501"])("provides recoverable feedback for %s", async code => {
  m.rpc.mockResolvedValue({ data: null, error: { code } });
  expect((await seriesRideAction(input)).ok).toBe(false);
  expect(m.refresh).not.toHaveBeenCalled();
});
it("rejects ambiguous daylight-saving windows", async () => {
  expect((await seriesRideAction({ ...input, earliestLocal: "2027-11-07T01:10", latestLocal: "2027-11-07T01:20" })).ok).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("requires valid input and authentication", async () => {
  expect((await seriesRideAction({ ...input, mode: "bad" })).ok).toBe(false);
  expect((await seriesRideAction({ ...input, expected: [] })).ok).toBe(false);
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  expect((await seriesRideAction(input)).ok).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
});
