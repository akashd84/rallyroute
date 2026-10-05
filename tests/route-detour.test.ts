import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  userClient: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  travelTime: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.adminClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.userClient,
}));
vi.mock("@/lib/routing/cached-travel-time", () => ({
  getCachedTravelTime: mocks.travelTime,
}));
import { evaluateEventRideDetour } from "@/lib/routing/route-detour";

const eventId = "11111111-1111-4111-8111-111111111111";
const driverRideId = "22222222-2222-4222-8222-222222222222";
const riderRideId = "33333333-3333-4333-8333-333333333333";
const candidate = {
  event_id: eventId,
  leg: "to_event",
  event_latitude: 33.8,
  event_longitude: -84.4,
  driver_latitude: 33.75,
  driver_longitude: -84.39,
  rider_latitude: 33.77,
  rider_longitude: -84.38,
  driver_max_detour_minutes: 10,
  driver_available_seats: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ROUTING_PREFILTER_MAX_PICKUP_DISTANCE_METERS", "100000");
  mocks.userClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "44444444-4444-4444-8444-444444444444" } },
    error: null,
  });
  afterEach(() => vi.unstubAllEnvs());
  mocks.adminClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [candidate], error: null });
  mocks.travelTime.mockImplementation(async (request) => ({
    status: "ok",
    durationSeconds: request.waypoints ? 1600 : 1200,
    distanceMeters: 10000,
  }));
});

describe("pairwise route detour evaluation", () => {
  it("uses the PostGIS-filtered candidate and applies the driver limit for to-event routes", async () => {
    await expect(
      evaluateEventRideDetour(eventId, driverRideId, riderRideId),
    ).resolves.toEqual({
      status: "compatible",
      addedDurationSeconds: 400,
      maxDetourMinutes: 10,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "route_candidate_inputs",
      expect.objectContaining({
        p_event_id: eventId,
        p_driver_ride_id: driverRideId,
        p_rider_ride_id: riderRideId,
        p_max_pickup_distance_meters: 100000,
      }),
    );
    expect(mocks.travelTime).toHaveBeenCalledWith({
      origin: { latitude: 33.75, longitude: -84.39 },
      destination: { latitude: 33.8, longitude: -84.4 },
      travelMode: "driving",
    });
    expect(mocks.travelTime).toHaveBeenCalledWith({
      origin: { latitude: 33.75, longitude: -84.39 },
      waypoints: [{ latitude: 33.77, longitude: -84.38 }],
      destination: { latitude: 33.8, longitude: -84.4 },
      travelMode: "driving",
    });
  });

  it("reverses the route order for from-event trips", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...candidate, leg: "from_event" }],
      error: null,
    });
    await evaluateEventRideDetour(eventId, driverRideId, riderRideId);
    expect(mocks.travelTime).toHaveBeenCalledWith({
      origin: { latitude: 33.8, longitude: -84.4 },
      destination: { latitude: 33.75, longitude: -84.39 },
      travelMode: "driving",
    });
    expect(mocks.travelTime).toHaveBeenCalledWith({
      origin: { latitude: 33.8, longitude: -84.4 },
      waypoints: [{ latitude: 33.77, longitude: -84.38 }],
      destination: { latitude: 33.75, longitude: -84.39 },
      travelMode: "driving",
    });
  });

  it("rejects detours that exceed the stored driver tolerance", async () => {
    mocks.travelTime.mockImplementation(async (request) => ({
      status: "ok",
      durationSeconds: request.waypoints ? 2000 : 1200,
      distanceMeters: 10000,
    }));
    await expect(
      evaluateEventRideDetour(eventId, driverRideId, riderRideId),
    ).resolves.toEqual({
      status: "detour_exceeded",
      addedDurationSeconds: 800,
      maxDetourMinutes: 10,
    });
  });

  it("returns filtered when the database prefilter excludes a pair", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      evaluateEventRideDetour(eventId, driverRideId, riderRideId),
    ).resolves.toEqual({ status: "filtered" });
    expect(mocks.travelTime).not.toHaveBeenCalled();
  });

  it("does not resolve candidate coordinates without an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      evaluateEventRideDetour(eventId, driverRideId, riderRideId),
    ).resolves.toEqual({ status: "error", code: "unauthorized" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

it.each([
  { direct: 100, pickup: 100, limit: 0, status: "compatible" },
  { direct: 100, pickup: 101, limit: 0, status: "detour_exceeded" },
  { direct: 100, pickup: 700, limit: 10, status: "compatible" },
  { direct: 100, pickup: 701, limit: 10, status: "detour_exceeded" },
])("respects literal detour boundary %j", async ({ direct, pickup, limit, status }) => {
  mocks.rpc.mockResolvedValue({ data: [{ ...candidate, driver_max_detour_minutes: limit }], error: null });
  mocks.travelTime.mockImplementation(async request => ({ status: "ok", durationSeconds: request.waypoints ? pickup : direct, distanceMeters: 1000 }));
  expect(await evaluateEventRideDetour(eventId, driverRideId, riderRideId)).toMatchObject({ status });
});
it("propagates provider retry timing without coordinates", async () => {
  mocks.travelTime.mockResolvedValue({ status: "error", code: "rate_limited", retryAfterSeconds: 20 });
  expect(await evaluateEventRideDetour(eventId, driverRideId, riderRideId)).toEqual({ status: "error", code: "rate_limited", retryAfterSeconds: 20 });
});
it("returns unreachable without guessing compatibility", async () => {
  mocks.travelTime.mockResolvedValue({ status: "unreachable", reason: "outside_coverage" });
  expect(await evaluateEventRideDetour(eventId, driverRideId, riderRideId)).toEqual({ status: "unreachable", reason: "outside_coverage" });
});
