import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/geocoding", () => ({
  geocodeAddress: vi.fn(async () => ({
    latitude: 33.75,
    longitude: -84.39,
    providerPlaceId: "place-123",
    attribution: "© OpenStreetMap contributors",
  })),
  GeocodingError: class extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
import { eventAction } from "@/app/events/actions";
import { seriesAction } from "@/app/events/series-actions";
const groupId = "22222222-2222-4222-8222-222222222222",
  eventId = "44444444-4444-4444-8444-444444444444",
  householdId = "33333333-3333-4333-8333-333333333333";
const create = {
  command: "event-save",
  groupId,
  requestId: eventId,
  name: "Practice",
  locationId: householdId,
  timezone: "America/New_York",
  timezoneConfirmed: "on",
  arrivalLocal: "2099-01-01T09:00",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({ auth: { getUser: m.user }, rpc: m.rpc, from: m.from });
  m.from.mockImplementation((table: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { slug: table === "events" ? "practice" : "club" }, error: null }) }));
  m.user.mockResolvedValue({ data: { user: { id: groupId } }, error: null });
  m.rpc.mockResolvedValue({ data: eventId, error: null });
});
describe("event Server Actions", () => {
  it("keeps a successful event save recoverable if its group URL cannot be resolved", async () => {
    m.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
    expect(await eventAction(create)).toMatchObject({ ok: true, destination: "/groups?notice=group-link" });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("resolves the series destination from the internal group UUID", async () => {
    const result = await seriesAction({ groupId, requestId: eventId, name: "Practice", locationId: householdId,
      spec: { frequency: "daily", startDate: "2099-01-01", endDate: "2099-01-02", timezone: "UTC", arrivalTime: "09:00" } });
    expect(result).toMatchObject({ ok: true, destination: "/groups/club/events?focus=2099-01-01T09%3A00%3A00Z" });
    expect(m.rpc.mock.calls[0][1].p_data.groupId).toBe(groupId);
  });
  it.each([
    { ...create, name: "" },
    { ...create, timezoneConfirmed: "" },
    { ...create, groupId: "bad" },
    {
      command: "attendance",
      householdId,
      eventId,
      memberId: groupId,
      revision: 1,
      status: "bad",
    },
    {
      command: "ride",
      householdId,
      eventId,
      memberId: groupId,
      revision: 1,
      leg: "to_event",
      mode: "can_drive",
      timezone: "UTC",
      seats: 21,
      detour: 10,
    },
  ])("rejects invalid input before provider calls", async (input) => {
    expect((await eventAction(input)).ok).toBe(false);
    expect(m.client).not.toHaveBeenCalled();
  });
  it("verifies identity with getUser", async () => {
    m.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await eventAction(create)).toMatchObject({
      ok: false,
      destination: "/sign-in",
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("converts wall times and preserves the request UUID", async () => {
    expect(await eventAction(create)).toMatchObject({
      ok: true,
      destination: "/groups/club/practice",
    });
    expect(m.rpc.mock.calls[0][1].p_data).toMatchObject({
      requestId: eventId,
      arrival: "2099-01-01T14:00:00Z",
    });
  });
  it("authorizes and geocodes an address before persisting its coordinates", async () => {
    const input = {
      command: "destination-save",
      groupId,
      name: "Practice",
      addressLine1: "10 Sample Road",
      addressLine2: "",
      city: "Sampleton",
      stateRegion: "GA",
      postalCode: "30301",
      countryCode: "US",
    };
    expect(await eventAction(input)).toMatchObject({ ok: true });
    expect(m.rpc).toHaveBeenNthCalledWith(
      1,
      "authorize_location_geocoding",
      expect.objectContaining({ p_kind: "event", p_parent_id: groupId }),
    );
    expect(m.rpc.mock.calls[1][1].p_data).toMatchObject({
      latitude: 33.75,
      longitude: -84.39,
      providerPlaceId: "place-123",
      geocodingAttribution: "© OpenStreetMap contributors",
    });
  });
  it("does not geocode address data when database authorization fails", async () => {
    const { geocodeAddress } = await import("@/lib/geocoding");
    vi.mocked(geocodeAddress).mockClear();
    m.rpc.mockResolvedValueOnce({ data: false, error: null });
    const result = await eventAction({
      command: "destination-save",
      groupId,
      name: "Practice",
      addressLine1: "10 Sample Road",
      addressLine2: "",
      city: "Sampleton",
      stateRegion: "GA",
      postalCode: "30301",
      countryCode: "US",
    });
    expect(result).toMatchObject({ ok: false });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });
  it("rejects an address when the geocoder cannot resolve it", async () => {
    const { geocodeAddress, GeocodingError } = await import("@/lib/geocoding");
    vi.mocked(geocodeAddress).mockRejectedValueOnce(
      new GeocodingError("not_found"),
    );
    const result = await eventAction({
      command: "destination-save",
      groupId,
      name: "Practice",
      addressLine1: "Unresolvable address",
      addressLine2: "",
      city: "Sampleton",
      stateRegion: "GA",
      postalCode: "30301",
      countryCode: "US",
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("could not locate"),
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects ambiguous one-off times", async () => {
    expect(
      (await eventAction({ ...create, arrivalLocal: "2026-11-01T01:30" })).ok,
    ).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("requires an anchor", async () => {
    expect((await eventAction({ ...create, arrivalLocal: "" })).ok).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(["40001", "42501", "P0001", "unexpected"])(
    "hides provider details for %s",
    async (code) => {
      m.rpc.mockResolvedValue({
        error: { code, message: "secret database details" },
      });
      const result = await eventAction(create);
      expect(result.ok).toBe(false);
      expect(result.message).not.toContain("secret");
    },
  );
  it("handles outages", async () => {
    m.rpc.mockRejectedValue(new Error("secret"));
    expect(await eventAction(create)).toMatchObject({
      ok: false,
      message: "Unable to connect. Please try again.",
    });
  });
  it("expands series on the server", async () => {
    expect(
      (
        await seriesAction({
          groupId,
          requestId: eventId,
          name: "Practice",
          locationId: householdId,
          spec: {
            frequency: "daily",
            startDate: "2099-01-01",
            endDate: "2099-01-02",
            timezone: "UTC",
            arrivalTime: "09:00",
          },
        })
      ).ok,
    ).toBe(true);
    expect(m.rpc.mock.calls[0][1].p_data.occurrences).toHaveLength(2);
  });
  it("rejects invalid series before identity/provider requests", async () => {
    expect((await seriesAction({ groupId, spec: {} })).ok).toBe(false);
    expect(m.client).not.toHaveBeenCalled();
  });
});

it.each(["uncertain", "rate_limited"] as const)("does not save after %s geocoding", async code => {
  const { geocodeAddress, GeocodingError } = await import("@/lib/geocoding");
  vi.mocked(geocodeAddress).mockRejectedValueOnce(new GeocodingError(code));
  const result = await eventAction({ command: "location-save", householdId, name: "Home", addressLine1: "10 Sample Road", city: "Sampleton", stateRegion: "GA", postalCode: "30301", countryCode: "US" });
  expect(result.ok).toBe(false);
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("reports an unapplied location RPC as setup failure", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const result = await eventAction({ command: "location-save", householdId, name: "Home", addressLine1: "10 Sample Road", city: "Sampleton", stateRegion: "GA", postalCode: "30301", countryCode: "US" });
  expect(result.message).toContain("database setup is missing");
});
