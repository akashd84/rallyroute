import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  rpc: vi.fn(),
  getTravelTime: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.adminClient,
}));
vi.mock("@/lib/routing/index", () => ({
  getRoutingProvider: () => ({ getTravelTime: mocks.getTravelTime }),
}));
import { getCachedTravelTime } from "@/lib/routing/cached-travel-time";

const request = {
  origin: { latitude: 33.75, longitude: -84.39 },
  destination: { latitude: 33.8, longitude: -84.4 },
  travelMode: "driving" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VALHALLA_URL", "http://routing.internal:8002");
  vi.stubEnv("ROUTE_CACHE_VERSION", "1");
  mocks.adminClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name) => ({ data: name === "routing_request_claim" ? { status: "ok" } : name === "routing_request_finish" ? true : null, error: null }));
  mocks.getTravelTime.mockResolvedValue({
    status: "ok",
    durationSeconds: 120,
    distanceMeters: 2000,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("private route result cache", () => {
  it("uses a cached successful duration without calling the provider", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "ok", durationSeconds: 90, distanceMeters: 1700 },
      error: null,
    });
    await expect(getCachedTravelTime(request)).resolves.toEqual({
      status: "ok",
      durationSeconds: 90,
      distanceMeters: 1700,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "routing_cache_get",
      expect.objectContaining({ p_cache_key: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(mocks.getTravelTime).not.toHaveBeenCalled();
  });

  it("stores only successful route calculations and uses a hashed input key", async () => {
    await expect(getCachedTravelTime(request)).resolves.toMatchObject({
      status: "ok",
      durationSeconds: 120,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "routing_request_finish",
      expect.objectContaining({
        p_cache_key: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_result: {
          status: "ok",
          durationSeconds: 120,
          distanceMeters: 2000,
        },
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("routing.internal");
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("33.75");
  });

  it("publishes unreachable results for a short cooldown", async () => {
    mocks.getTravelTime.mockResolvedValue({
      status: "unreachable",
      reason: "no_route",
    });
    await expect(getCachedTravelTime(request)).resolves.toMatchObject({
      status: "unreachable",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("routing_request_finish", expect.objectContaining({ p_result: { status: "unreachable", reason: "no_route" } }));
  });

  it("surfaces cache read and write failures instead of returning success-shaped fallbacks", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private" } });
    await expect(getCachedTravelTime(request)).rejects.toThrow(
      "Unable to read the private route cache.",
    );

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { status: "ok" }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private" } });
    await expect(getCachedTravelTime(request)).rejects.toThrow(
      "Unable to publish the private route result.",
    );
  });
  it("does not call the provider while another instance owns the request", async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === "routing_cache_get" ? null : { status: "rate_limited", retryAfterSeconds: 20 }, error: null }));
    expect(await getCachedTravelTime(request)).toMatchObject({ status: "error", code: "rate_limited", retryAfterSeconds: 20 });
    expect(mocks.getTravelTime).not.toHaveBeenCalled();
  });
  it("reuses a shared failure cooldown without another provider request", async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === "routing_cache_get" ? null : { status: "cached", result: { status: "unreachable", reason: "no_route" } }, error: null }));
    expect(await getCachedTravelTime(request)).toEqual({ status: "unreachable", reason: "no_route" });
    expect(mocks.getTravelTime).not.toHaveBeenCalled();
  });
  it("rejects stale-owner publication", async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === "routing_cache_get" ? null : name === "routing_request_claim" ? { status: "ok" } : false, error: null }));
    await expect(getCachedTravelTime(request)).rejects.toThrow("Unable to publish");
  });

});
