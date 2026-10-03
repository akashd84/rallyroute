import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn(), signOut: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { requestCode, verifyCode } from "@/app/sign-in/actions";
import { signOut } from "@/app/account/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ auth: { signInWithOtp: mocks.request, verifyOtp: mocks.verify, signOut: mocks.signOut } });
  mocks.request.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ error: null, data: { user: { id: "user-a" }, session: { access_token: "token" } } });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("email code request", () => {
  it("rejects malformed email before contacting Supabase", async () => {
    expect((await requestCode("invalid")).ok).toBe(false);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["new@example.com", "existing@example.com"])("uses the same signup-enabled workflow for %s", async email => {
    expect(await requestCode(` ${email} `)).toEqual({ ok: true, message: "Check your email for a sign-in code.", retryAfter: 60 });
    expect(mocks.request).toHaveBeenCalledWith({ email, options: { shouldCreateUser: true } });
  });
  it("does not expose provider errors", async () => {
    mocks.request.mockResolvedValue({ error: { status: 500, message: "sensitive provider details" } });
    expect(await requestCode("a@example.com")).toEqual({ ok: false, message: "Sign-in is temporarily unavailable. Please try again shortly." });
  });
  it("handles network failures", async () => {
    mocks.request.mockRejectedValue(new Error("network"));
    expect((await requestCode("a@example.com")).ok).toBe(false);
  });
  it("handles throttling", async () => {
    mocks.request.mockResolvedValue({ error: { status: 429 } });
    expect((await requestCode("a@example.com")).retryAfter).toBe(60);
  });
});

describe("verification", () => {
  it.each(["12345", "abcdef", "1234567", "123456789", "abcdefgh"])("rejects malformed code %s", async code => {
    expect((await verifyCode("a@example.com", code)).ok).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects malformed email", async () => { expect((await verifyCode("invalid", "123456")).ok).toBe(false); });
  it.each(["otp_expired", "otp_disabled"])("handles %s", async code => {
    mocks.verify.mockResolvedValue({ error: { code, status: 403 } });
    expect((await verifyCode("a@example.com", "123456")).message).toContain("invalid or expired");
  });
  it("handles throttling", async () => {
    mocks.verify.mockResolvedValue({ error: { status: 429 } });
    expect((await verifyCode("a@example.com", "123456")).retryAfter).toBe(60);
  });
  it("handles provider and network failures", async () => {
    mocks.verify.mockResolvedValue({ error: { status: 500 } });
    expect((await verifyCode("a@example.com", "123456")).ok).toBe(false);
    mocks.verify.mockRejectedValue(new Error("network"));
    expect((await verifyCode("a@example.com", "123456")).ok).toBe(false);
  });
  it("does not redirect without a session", async () => {
    mocks.verify.mockResolvedValue({ error: null, data: { user: null, session: null } });
    expect((await verifyCode("a@example.com", "123456")).ok).toBe(false);
  });
  it.each(["123456", "12345678"])("verifies the complete %s code without truncation", async code => {
    await expect(verifyCode(" a@example.com ", ` ${code} `)).rejects.toThrow("REDIRECT:/account");
    expect(mocks.verify).toHaveBeenCalledWith({ email: "a@example.com", token: code, type: "email" });
  });
});

describe("sign out", () => {
  it("signs out only the current session and redirects", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("carries remote revocation failure to sign-in after local session removal", async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 500 } });
    await expect(signOut()).rejects.toThrow("REDIRECT:/sign-in?error=sign-out");
  });
  it("handles network failure", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    expect((await signOut()).ok).toBe(false);
  });
});
