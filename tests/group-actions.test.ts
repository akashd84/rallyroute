import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ client: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), getCookie: vi.fn(), deleteCookie: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.getCookie, delete: mocks.deleteCookie, set: mocks.setCookie }), headers: async () => ({ get: () => "https://rallyroute.example" }) }));
import { groupAction, captureGroupInvitation } from "@/app/groups/actions";
const householdId = "33333333-3333-4333-8333-333333333333";
const groupId = "22222222-2222-4222-8222-222222222222";
const requestId = "11111111-1111-4111-8111-111111111111";
const create = { command: "create", householdId, requestId, name: " Club ", groupType: "club" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: requestId } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "accept_invitation" ? { status: "ok", destination_kind: "group", destination_id: groupId } : groupId, error: null }));
  mocks.getCookie.mockReturnValue({ value: "a".repeat(64) });
});
describe("group actions", () => {
  it.each([
    { ...create, name: " " }, { ...create, name: "a".repeat(101) }, { ...create, groupType: "invalid" },
    { ...create, requestId: "bad" }, { ...create, householdId: "bad" }, { ...create, description: "a".repeat(1001) },
    { command: "invite-direct", groupId, email: "bad" },
    ...[0, -1, 1.5, "NaN", 2147483648].map(maxUses => ({ command: "invite-link", groupId, maxUses })),
    { command: "join", householdId: "bad" }, { command: "revoke", groupId, invitationId: "bad" },
  ])("rejects invalid input without provider requests: $command", async input => {
    expect((await groupAction(input)).ok).toBe(false); expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([false, true])("validates server identity before mutation (auth error: %s)", async error => {
    mocks.getUser.mockResolvedValue({ data: { user: error ? { id: requestId } : null }, error: error ? { message: "private" } : null });
    expect(await groupAction(create)).toMatchObject({ ok: false, destination: "/sign-in" }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses a stable request identifier and normalized details", async () => {
    expect(await groupAction(create)).toMatchObject({ ok: true, destination: `/groups/${groupId}` });
    expect(mocks.rpc).toHaveBeenCalledWith("create_group_once", { p_household_id: householdId, p_name: "Club", p_group_type: "club", p_description: "", p_request_id: requestId });
  });
  it.each(["invite-direct", "invite-link"])("sends only a SHA-256 hash for %s", async command => {
    const result = await groupAction({ command, groupId, email: "adult@example.test", maxUses: "2" });
    const token = result.invitationCode!; expect(token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_token_hash: createHash("sha256").update(token).digest("hex"), p_invite_type: command === "invite-direct" ? "direct" : "group_link" });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
    if (command === "invite-link") expect(mocks.rpc.mock.calls[0][1].p_max_uses).toBe(2);
  });
  it("blank reusable limit leaves the database unlimited default", async () => {
    await groupAction({ command: "invite-link", groupId, maxUses: "" });
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_max_uses");
  });
  it.each(["42501", "22023", "P0001", "unexpected"])("never displays provider details or links on failure: %s", async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "sensitive provider details" } });
    const result = await groupAction({ command: "invite-link", groupId });
    expect(result.ok).toBe(false); expect(result.invitationPath).toBeUndefined(); expect(result.invitationCode).toBeUndefined(); expect(result.message).not.toContain("sensitive"); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("handles network failures safely", async () => {
    mocks.rpc.mockRejectedValue(new Error("private network information"));
    expect((await groupAction(create)).message).toContain("try again");
  });
  it("requires valid continuation before redemption", async () => {
    mocks.getCookie.mockReturnValue({ value: "raw token" });
    expect((await groupAction({ command: "join", householdId })).ok).toBe(false); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps context and provides guidance on rejected joining", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "sensitive" } });
    expect((await groupAction({ command: "join", householdId })).message).not.toContain("sensitive"); expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });
  it("explicit joining uses guarded RPC and clears context only on success", async () => {
    expect(await groupAction({ command: "join", householdId })).toMatchObject({ ok: true, destination: `/groups/${groupId}` });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_invitation", { p_kind: "group", p_token_hash: "a".repeat(64), p_household_id: householdId });
    expect(mocks.deleteCookie).toHaveBeenCalledWith("rallyroute-group-invite");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([
    [{ status: "invalid" }, "invited email"],
    [{ status: "throttled", retry_after_seconds: 35 }, "35 seconds"],
    [{ status: "unavailable" }, "try again"],
    [{ status: "ok" }, "try again"],
    [{ status: "ok", destination_kind: "group", destination_id: "https://evil.example" }, "try again"],
  ])("handles guarded outcomes and preserves context", async (data, message) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await groupAction({ command: "join", householdId })).toMatchObject({ ok: false, message: expect.stringContaining(message as string) });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });
  it("zero-row settings updates are permission errors", async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [], error: null }) }; mocks.from.mockReturnValue(query);
    expect((await groupAction({ command: "settings", groupId, name: "Club", groupType: "club" })).ok).toBe(false);
  });
  it("uses controlled revocation and supports dismissal", async () => {
    await groupAction({ command: "revoke", groupId, invitationId: requestId });
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_group_invitation", { p_group_id: groupId, p_invitation_id: requestId });
    expect(await groupAction({ command: "dismiss" })).toMatchObject({ ok: true, destination: "/groups" });
    expect(mocks.deleteCookie).toHaveBeenCalledWith("rallyroute-group-invite");
  });
});
it("captures only a hash in a short-lived HttpOnly cookie and replaces household context", async () => {
  expect((await captureGroupInvitation("a".repeat(64))).ok).toBe(true);
  expect(mocks.setCookie).toHaveBeenCalledWith("rallyroute-group-invite", "a".repeat(64), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 1800 }));
  expect(mocks.deleteCookie).toHaveBeenCalledWith("rallyroute-household-invite"); expect(mocks.client).not.toHaveBeenCalled();
});
it("rejects raw or malformed tokens without storing them", async () => {
  expect((await captureGroupInvitation("raw token")).ok).toBe(false); expect(mocks.setCookie).not.toHaveBeenCalled();
});
