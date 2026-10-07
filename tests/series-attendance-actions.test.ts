import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.user }, rpc: m.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
import { seriesAttendanceAction } from "@/app/events/attendance-actions";
const input = { householdId: "33333333-3333-4333-8333-333333333333", memberId: "22222222-2222-4222-8222-222222222222", eventId: "44444444-4444-4444-8444-444444444444", status: "going" };
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); });
it("previews without revalidation and sends confirmed snapshot on save", async () => {
  const snapshot = [{ id: input.eventId, revision: 2 }];
  m.rpc.mockResolvedValue({ data: { count: 1, snapshot }, error: null });
  expect(await seriesAttendanceAction(input)).toMatchObject({ ok: true, count: 1, snapshot });
  expect(m.refresh).not.toHaveBeenCalled();
  expect(await seriesAttendanceAction({ ...input, expected: snapshot })).toMatchObject({ ok: true, message: "Attendance updated for 1 occurrence." });
  expect(m.rpc.mock.lastCall?.[1].p_expected).toEqual(snapshot);
  expect(m.refresh).toHaveBeenCalledWith("/groups", "layout");
});
it("handles empty targets", async () => {
  m.rpc.mockResolvedValue({ data: { count: 0, snapshot: [] }, error: null });
  expect(await seriesAttendanceAction(input)).toMatchObject({ ok: true, count: 0, message: "There are no upcoming occurrences to update." });
});
it.each(["40001", "42501"])("returns recoverable errors for %s", async code => {
  m.rpc.mockResolvedValue({ data: null, error: { code } });
  expect(await seriesAttendanceAction(input)).toMatchObject({ ok: false });
  expect(m.refresh).not.toHaveBeenCalled();
});
it("requires authentication and valid input", async () => {
  expect((await seriesAttendanceAction({ ...input, status: "bad" })).ok).toBe(false);
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  expect((await seriesAttendanceAction(input)).ok).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
});
