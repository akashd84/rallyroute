import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), calculate: vi.fn(), health: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: m.rpc }) }));
import { consumeGeocodingBudget, positiveSetting, withUsageControls } from "@/lib/routing/usage-controls";
import type { RoutingProvider } from "@/lib/routing/types";
const request = { origin: { latitude: 33, longitude: -84 }, destination: { latitude: 34, longitude: -84 }, travelMode: "driving" as const };
const provider = () => withUsageControls({ capabilities: {}, getRoute: m.calculate, getTravelTime: m.calculate, getMatrix: m.calculate, checkHealth: m.health } as unknown as RoutingProvider);
beforeEach(() => {
  vi.resetAllMocks();
  m.rpc.mockImplementation(async name => ({ data: name === "provider_budget_acquire" ? { status: "ok" } : null, error: null }));
  m.calculate.mockResolvedValue({ status: "ok", durationSeconds: 60, distanceMeters: 100 });
});
describe("distributed provider admission", () => {
  it.each(["getRoute", "getTravelTime", "getMatrix"] as const)("guards %s and releases the owning token", async method => {
    const p = provider();
    const result = method === "getMatrix" ? await p.getMatrix({ origins: [request.origin], destinations: [request.destination], travelMode: "driving" }) : await p[method](request);
    expect(result.status).toBe("ok");
    const args = m.rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_provider: "routing", p_subject: "global", p_minute_limit: 60, p_concurrency: 4, p_lease_seconds: 20 });
    expect(m.rpc).toHaveBeenLastCalledWith("provider_budget_release", { p_token: args.p_token });
  });
  it("returns shared throttling without any provider HTTP work", async () => {
    m.rpc.mockResolvedValue({ data: { status: "rate_limited", retryAfterSeconds: 12 }, error: null });
    expect(await provider().getTravelTime(request)).toMatchObject({ code: "rate_limited", retryAfterSeconds: 12 });
    expect(m.calculate).not.toHaveBeenCalled();
  });
  it("fails closed when admission is unavailable or malformed", async () => {
    for (const response of [{ data: null, error: {} }, { data: {}, error: null }]) {
      m.rpc.mockResolvedValue(response);
      expect(await provider().getRoute(request)).toMatchObject({ status: "error" });
    }
    expect(m.calculate).not.toHaveBeenCalled();
  });
  it("leaves health checks outside calculation budgets", async () => {
    m.health.mockResolvedValue({ status: "ok", healthy: true });
    expect(await provider().checkHealth()).toMatchObject({ healthy: true });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("uses the verified user's shared geocoding budget", async () => {
    expect(await consumeGeocodingBudget("11111111-1111-4111-8111-111111111111")).toBe(0);
    expect(m.rpc).toHaveBeenCalledWith("provider_budget_acquire", expect.objectContaining({ p_provider: "geocoding", p_minute_limit: 10, p_hour_limit: 50, p_concurrency: 0 }));
  });
  it("rejects invalid server settings", () => {
    vi.stubEnv("ROUTING_MAX_CONCURRENT_REQUESTS", "0");
    expect(() => positiveSetting("ROUTING_MAX_CONCURRENT_REQUESTS", 4, 100)).toThrow();
    vi.unstubAllEnvs();
  });
});
