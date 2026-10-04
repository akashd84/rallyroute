import { beforeEach, expect, it, vi } from "vitest";
import { createHash, randomInt } from "node:crypto";
vi.mock("node:crypto", async importOriginal => ({ ...await importOriginal<typeof import("node:crypto")>(), randomInt: vi.fn(() => 0) }));
import { invitationAlphabet, normalizeInvitationCode } from "@/lib/invitations/code";
import { createCodeInvitation } from "@/lib/invitations/generate";
import { invitationResult, invitationMessage } from "@/lib/invitations/result";
beforeEach(() => { vi.mocked(randomInt).mockClear(); });
it("uses exactly the approved 31-character alphabet", () => {
  expect(invitationAlphabet).toHaveLength(31); expect(new Set(invitationAlphabet).size).toBe(31);
  expect(invitationAlphabet).not.toMatch(/[O0I1L]/); expect(31 ** 6).toBe(887503681);
});
it.each(["ABC234", "abc234", " ab-c 234 ", "a\tb\nc234"])("normalizes case, spaces and hyphens: %s", input => {
  expect(normalizeInvitationCode(input)).toBe("ABC234");
});
it.each(["ABC23", "ABC2345", "ABO234", "AB0234", "ABI234", "AB1234", "ABL234", "abł234", "aß234", "abc_23", " ".repeat(33)])("rejects invalid codes: %s", input => { expect(normalizeInvitationCode(input)).toBeNull(); });
it("generates six unbiased cryptographic draws and sends only the hash", async () => {
  const create = vi.fn().mockResolvedValue({ error: null }); const result = await createCodeInvitation(create);
  expect(result.code).toBe("AAAAAA"); expect(randomInt).toHaveBeenCalledTimes(6);
  expect(randomInt).toHaveBeenCalledWith(31); expect(create).toHaveBeenCalledWith(createHash("sha256").update("AAAAAA").digest("hex"));
});
it("retries collisions and caps generation at five attempts", async () => {
  const create = vi.fn().mockResolvedValue({ error: { code: "23505" } });
  expect(await createCodeInvitation(create)).toEqual({ code: undefined, error: { code: "collision" } }); expect(create).toHaveBeenCalledTimes(5);
});
it("returns the successful code after a collision", async () => {
  const create = vi.fn().mockResolvedValueOnce({ error: { code: "23505" } }).mockResolvedValue({ error: null });
  expect((await createCodeInvitation(create)).code).toBe("AAAAAA"); expect(create).toHaveBeenCalledTimes(2);
});
it("does not retry unrelated permission or provider errors", async () => {
  const create = vi.fn().mockResolvedValue({ error: { code: "42501" } });
  expect((await createCodeInvitation(create)).code).toBeUndefined(); expect(create).toHaveBeenCalledOnce();
});
it("does not trust malformed RPC outcomes or provider detail", () => {
  expect(invitationResult({ status: "throttled", retry_after_seconds: -1 })).toEqual({ status: "unavailable" });
  expect(invitationResult({ message: "sensitive provider details" })).toEqual({ status: "unavailable" });
  expect(invitationMessage(invitationResult({ status: "invalid", message: "sensitive provider details" }))).not.toContain("sensitive");
});
