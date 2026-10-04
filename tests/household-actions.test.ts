import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ client: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), getCookie: vi.fn(), deleteCookie: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.getCookie, delete: mocks.deleteCookie, set: mocks.setCookie }), headers: async () => ({ get: () => "https://rallyroute.example" }) }));
import { householdAction, captureHouseholdInvitation } from "@/app/households/actions";
const householdId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";
const participantId = "22222222-2222-4222-8222-222222222222";
const names = { firstName: "Alex", lastName: "Example" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.rpc.mockResolvedValue({ data: householdId, error: null });
  mocks.getCookie.mockReturnValue({ value: "a".repeat(64) });
});
describe("household actions", () => {
  it.each([
    { command: "create", ...names, displayName: " ", requestId: userId },
    { command: "create", ...names, displayName: "Home", requestId: "bad" },
    { command: "accept", firstName: "", lastName: "Example" },
    { command: "invite", householdId, email: "bad" },
    { command: "participant", householdId, ...names, memberType: "driver" },
    { command: "promote", householdId, userId: "bad" },
    { command: "admin", householdId },
  ])("rejects invalid input before contacting Supabase: $command", async input => {
    expect((await householdAction(input)).ok).toBe(false); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("validates identity before database mutation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await householdAction({ command: "leave", householdId })).toMatchObject({ ok: false, destination: "/sign-in" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the supplied idempotency identifier and normalized names", async () => {
    const input = { command: "create", firstName: " Alex ", lastName: " Example ", displayName: " Home ", requestId: userId };
    expect(await householdAction(input)).toMatchObject({ ok: true, destination: `/households/${householdId}` });
    expect(mocks.rpc).toHaveBeenCalledWith("onboard_household", { p_first_name: "Alex", p_last_name: "Example", p_display_name: "Home", p_request_id: userId });
  });
  it("only sends a hash to the invitation RPC", async () => {
    const result = await householdAction({ command: "invite", householdId, email: "adult@example.test", participantId });
    const token = result.invitationPath!.split("#")[1];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("create_household_invitation", { p_household_id: householdId, p_email: "adult@example.test", p_token_hash: createHash("sha256").update(token).digest("hex"), p_participant_id: participantId });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
  });
  it("returns no invitation link if the provider rejects creation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private provider error" } });
    const result = await householdAction({ command: "invite", householdId, email: "adult@example.test" });
    expect(result.ok).toBe(false); expect(result.invitationPath).toBeUndefined(); expect(result.message).not.toContain("private");
  });
  it("requires a valid pending cookie for acceptance", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    expect((await householdAction({ command: "accept", ...names })).message).toContain("Open your invitation");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("accepts explicitly and clears invitation context only on success", async () => {
    expect(await householdAction({ command: "accept", ...names })).toMatchObject({ ok: true, destination: `/households/${householdId}` });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_household_invitation", { p_token_hash: "a".repeat(64), p_first_name: "Alex", p_last_name: "Example" });
    expect(mocks.deleteCookie).toHaveBeenCalledOnce();
  });
  it("keeps context on rejected acceptance and gives email/reissue guidance", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "22023", message: "Auth private details" }, data: null });
    expect((await householdAction({ command: "accept", ...names })).message).toContain("invited email");
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });
  it.each(["23514", "42501", "P0001"])("maps database errors safely: %s", async code => {
    mocks.rpc.mockResolvedValue({ error: { code, message: "sensitive database details" }, data: null });
    const result = await householdAction({ command: "demote", householdId });
    expect(result.ok).toBe(false); expect(result.message).not.toContain("sensitive"); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("handles provider network failures", async () => {
    mocks.rpc.mockRejectedValue(new Error("private network error"));
    expect((await householdAction({ command: "leave", householdId })).message).toContain("try again");
  });
  it.each([
    ["promote", "promote_household_member", { userId }],
    ["remove", "remove_household_member", { userId }],
    ["demote", "demote_household_owner", {}],
    ["leave", "leave_household", {}],
    ["archive", "archive_household_participant", { participantId }],
    ["revoke", "revoke_household_invitation", { invitationId: participantId }],
  ])("uses controlled RPCs for %s", async (command, rpc, extra) => {
    expect((await householdAction({ command, householdId, ...extra })).ok).toBe(true);
    expect(mocks.rpc.mock.calls[0][0]).toBe(rpc);
  });
  it("denied updates affecting zero rows are errors", async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.from.mockReturnValue(query);
    expect((await householdAction({ command: "rename", householdId, displayName: "Denied" })).ok).toBe(false);
  });
  it("completes existing household onboarding without another household", async () => {
    expect((await householdAction({ command: "complete", householdId, ...names })).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_household_onboarding", { p_household_id: householdId, p_first_name: "Alex", p_last_name: "Example" });
  });
});

it("captures only a hash before authentication with a short-lived secure HttpOnly cookie", async () => {
  expect((await captureHouseholdInvitation("a".repeat(64))).ok).toBe(true);
  expect(mocks.setCookie).toHaveBeenCalledWith("rallyroute-household-invite", "a".repeat(64), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 1800 }));
  expect(mocks.client).not.toHaveBeenCalled();
});
it("rejects malformed invitation context without storing it", async () => {
  expect((await captureHouseholdInvitation("raw token" )).ok).toBe(false); expect(mocks.setCookie).not.toHaveBeenCalled();
});

it("allows a transportation participant without a last name", async () => {
  const query = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [{ id: participantId }], error: null }) };
  mocks.from.mockReturnValue(query);
  expect((await householdAction({ command: "participant", householdId, firstName: "Casey", memberType: "adult" })).ok).toBe(true);
  expect(query.insert).toHaveBeenCalledWith({ household_id: householdId, first_name: "Casey", last_name: null, member_type: "adult" });
});
