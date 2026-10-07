import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), adminRpc: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.user }, rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({
      maybeSingle: async () => ({ data: { slug: "fixture-household-a" }, error: null }),
    }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: m.adminRpc }) }));
import { decodeConnectionProof, encodeConnectionProof } from "@/lib/connections/proof";
import { connectionAction } from "@/lib/connections/actions";
import { phoneSchema, connectionsSchema } from "@/lib/connections/types";
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const proofInput = { user: id(1), household: id(101), other: id(102), event: id(610), leg: "to_event" as const, pair: `${id(800)}:${id(803)}`, fingerprint: "a".repeat(32), distance: 100000 };
const base = { householdId: id(101), connectionId: id(901), revision: 1 };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-secret");
  m.user.mockResolvedValue({ data: { user: { id: id(1), email: "trusted@example.test" } }, error: null });
  m.rpc.mockResolvedValue({ data: { status: "ok", id: id(901) }, error: null });
  m.adminRpc.mockResolvedValue({ data: { status: "ok", id: id(901) }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("connection proofs", () => {
  it("encrypts sensitive identifiers and authenticates its payload", () => {
    const token = encodeConnectionProof(proofInput);
    expect(token).not.toContain(id(803)); expect(token).not.toContain(proofInput.fingerprint);
    expect(decodeConnectionProof(token, id(1), id(101))).toMatchObject(proofInput);
    const bytes = Buffer.from(token, "base64url"); bytes[35] ^= 1;
    expect(() => decodeConnectionProof(bytes.toString("base64url"), id(1), id(101))).toThrow();
  });
  it("binds user, household and expiration", () => {
    vi.useFakeTimers(); const token = encodeConnectionProof(proofInput);
    expect(() => decodeConnectionProof(token, id(4), id(101))).toThrow();
    expect(() => decodeConnectionProof(token, id(1), id(102))).toThrow();
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(() => decodeConnectionProof(token, id(1), id(101))).toThrow();
  });
  it("rejects malformed and oversized proofs and invalid server configuration", () => {
    for (const token of ["bad", "!bad", "a".repeat(4097)]) expect(() => decodeConnectionProof(token, id(1), id(101))).toThrow();
    vi.stubEnv("SUPABASE_SECRET_KEY", ""); expect(() => encodeConnectionProof(proofInput)).toThrow();
  });
});
describe("connection actions", () => {
  it("requires verified identity before privileged creation", async () => {
    m.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await connectionAction({ command: "request", householdId: id(101), proof: encodeConnectionProof(proofInput), consent: "yes" })).toMatchObject({ ok: false, destination: "/sign-in" });
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("derives request arguments from proof rather than client identity", async () => {
    const result = await connectionAction({ command: "request", householdId: id(101), otherHouseholdId: id(999), userId: id(999), email: "forged@example.test", proof: encodeConnectionProof(proofInput), phone: "+1 404 555 0100", consent: "yes" });
    expect(result).toMatchObject({ ok: true, destination: "/households/fixture-household-a/connections" });
    expect(m.adminRpc).toHaveBeenCalledWith("request_connection", expect.objectContaining({ p_user_id: id(1), p_other_household_id: id(102), p_pair_key: proofInput.pair, p_fingerprint: proofInput.fingerprint }));
    expect(JSON.stringify(m.adminRpc.mock.calls)).not.toContain("forged@example.test");
    expect(JSON.stringify(result)).not.toContain(proofInput.pair);
  });
  it("rejects replay by another user and cross-household requests", async () => {
    const proof = encodeConnectionProof(proofInput);
    expect(await connectionAction({ command: "request", householdId: id(102), proof, consent: "yes" })).toMatchObject({ ok: false });
    m.user.mockResolvedValue({ data: { user: { id: id(4) } }, error: null });
    expect(await connectionAction({ command: "request", householdId: id(101), proof, consent: "yes" })).toMatchObject({ ok: false });
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it.each(["request", "accept", "contact", "share"])("requires explicit consent for %s", async command => {
    expect(await connectionAction({ command, ...base, proof: encodeConnectionProof(proofInput), eventId: id(610), eventRevision: 1, locationId: id(510), locationRevision: 1, leg: "to_event" })).toMatchObject({ ok: false });
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it.each(["accept", "decline", "withdraw", "disconnect", "contact", "share", "revoke"])("uses ordinary authenticated RPCs for %s", async command => {
    expect(await connectionAction({ command, ...base, consent: "yes", phone: "", eventId: id(610), eventRevision: 1, locationId: id(510), locationRevision: 1, leg: "to_event", shareId: id(902) })).toMatchObject({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("connection_action", expect.objectContaining({ p_command: command })); expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it.each(["stale", "unavailable", "conflict", "invalid"])("handles %s without leaking provider data", async status => {
    m.rpc.mockResolvedValue({ data: { status }, error: null });
    expect(await connectionAction({ command: "accept", ...base, consent: "yes" })).toMatchObject({ ok: false });
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it("directs reciprocal requests to explicit incoming consent", async () => {
    m.adminRpc.mockResolvedValue({ data: { status: "existing", incoming: true, id: id(901) }, error: null });
    expect(await connectionAction({ command: "request", householdId: id(101), proof: encodeConnectionProof(proofInput), consent: "yes" })).toMatchObject({ ok: true, message: expect.stringContaining("incoming request") });
  });
  it("handles malformed outcomes and network errors safely", async () => {
    m.rpc.mockResolvedValueOnce({ data: { private: "secret" }, error: null }).mockRejectedValueOnce(new Error("private error"));
    for (let n = 0; n < 2; n++) expect(JSON.stringify(await connectionAction({ command: "decline", ...base }))).not.toContain("private");
  });
});
it("validates optional phones without requiring country-specific formatting", () => {
  for (const phone of ["", "+1 (404) 555-0100", "020 7946 0958"]) expect(phoneSchema.safeParse(phone).success).toBe(true);
  for (const phone of ["javascript:bad", "123", "+1234567890123456"]) expect(phoneSchema.safeParse(phone).success).toBe(false);
});
it("strips unexpected private fields from database projections", () => {
  const result = connectionsSchema.parse([{ ...base, id: id(901), status: "pending", incoming: false, otherHouseholdName: "Other", otherHouseholdId: id(102), eventTimezone: "America/New_York", groupId: id(301), groupName: "Club", eventName: "Event", createdAt: "2099-01-01Z", expiresAt: "2099-01-08Z", contacts: [], pickups: [], coordinates: [33, -84] }]);
  expect(JSON.stringify(result)).not.toContain("coordinates");
});
