import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/routing/usage-controls", () => ({ consumeGeocodingBudget: vi.fn(async () => 0), providerRetrySeconds: (header: string | null) => header ? Number(header) : 30 }));
import { geocodeAddress, GeocodingError } from "@/lib/geocoding";

const address = {
  addressLine1: "10 Sample Road",
  addressLine2: "",
  city: "Sampleton",
  stateRegion: "GA",
  postalCode: "30301",
  countryCode: "US",
};

describe("server geocoding", () => {
  it("uses the structured address and normalizes Geoapify coordinates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              result_type: "building", country_code: "us", rank: { confidence: 1, confidence_building_level: 1 },
              lat: 33.75,
              lon: -84.39,
              place_id: "place-123",
              datasource: { attribution: "© OpenStreetMap contributors" },
            },
          ],
        }),
      ),
    );
    await expect(
      geocodeAddress(address, "test-key", fetcher),
    ).resolves.toEqual({
      latitude: 33.75,
      longitude: -84.39,
      providerPlaceId: "place-123",
      attribution: "© OpenStreetMap contributors",
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain("api.geoapify.com/v1/geocode/search");
    expect(String(url)).toContain("10+Sample+Road");
    expect(String(url)).toContain("apiKey=test-key");
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
  });

  it("rejects missing credentials before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(geocodeAddress(address, "", fetcher)).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unresolved, malformed, and unavailable responses explicitly", async () => {
    const empty = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ results: [] })),
    );
    await expect(geocodeAddress(address, "key", empty)).rejects.toBeInstanceOf(GeocodingError);
    await expect(geocodeAddress(address, "key", empty)).rejects.toMatchObject({
      code: "not_found",
    });

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ lat: 120, lon: 0 }] })),
    );
    await expect(
      geocodeAddress(address, "key", malformed),
    ).rejects.toMatchObject({ code: "unavailable" });

    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    await expect(
      geocodeAddress(address, "key", unavailable),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

const precise = { lat: 33.75, lon: -84.39, result_type: "building", country_code: "us", rank: { confidence: 1, confidence_building_level: 1 }, datasource: { attribution: "© OpenStreetMap contributors" } };
it.each([
  { result_type: "street" }, { result_type: "city" }, { country_code: "ca" },
  { rank: { confidence: 0.89, confidence_building_level: 1 } },
  { rank: { confidence: 1, confidence_building_level: 0.89 } },
  { rank: undefined },
])("rejects uncertain household result %j", async override => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ ...precise, ...override }] })));
  await expect(geocodeAddress(address, "key", fetcher)).rejects.toMatchObject({ code: "uncertain" });
});
it("accepts the exact confidence threshold", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ ...precise, rank: { confidence: 0.9, confidence_building_level: 0.9 } }] })));
  await expect(geocodeAddress(address, "key", fetcher)).resolves.toMatchObject({ latitude: 33.75 });
});
it("normalizes provider throttling", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 429 }));
  await expect(geocodeAddress(address, "key", fetcher)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 30 });
});
it("aborts slow geocoding without exposing provider errors", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("private URL")))));
  const result = expect(geocodeAddress(address, "key", fetcher)).rejects.toMatchObject({ code: "unavailable" });
  await vi.advanceTimersByTimeAsync(8000);
  await result;
  vi.useRealTimers();
});

it("accepts a precise event amenity but rejects it for a household", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ results: [{ ...precise, result_type: "amenity", rank: { confidence: 0.95 } }] })));
  await expect(geocodeAddress(address, "key", fetcher, { kind: "event", userId: "11111111-1111-4111-8111-111111111111" })).resolves.toMatchObject({ latitude: 33.75 });
  await expect(geocodeAddress(address, "key", fetcher)).rejects.toMatchObject({ code: "uncertain" });
});
it("does not send an address when the shared budget denies admission", async () => {
  const { consumeGeocodingBudget } = await import("@/lib/routing/usage-controls");
  vi.mocked(consumeGeocodingBudget).mockResolvedValueOnce(42);
  const fetcher = vi.fn<typeof fetch>();
  await expect(geocodeAddress(address, "key", fetcher, { kind: "household", userId: "11111111-1111-4111-8111-111111111111" })).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 42 });
  expect(fetcher).not.toHaveBeenCalled();
});
