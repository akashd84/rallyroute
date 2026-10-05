import "server-only";
import { z } from "zod";
import { consumeGeocodingBudget, providerRetrySeconds } from "@/lib/routing/usage-controls";

export type GeocodingAddress = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
};

export type GeocodedAddress = {
  latitude: number;
  longitude: number;
  providerPlaceId: string | null;
  attribution: string;
};

const responseSchema = z.object({
  results: z.array(
    z.object({
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      place_id: z.string().optional(),
      result_type: z.string().optional(),
      country_code: z.string().optional(),
      rank: z.object({
        confidence: z.number().min(0).max(1).optional(),
        confidence_building_level: z.number().min(0).max(1).optional(),
      }).optional(),
      datasource: z.object({
        attribution: z.string().trim().min(1),
      }),
    }),
  ),
});

export class GeocodingError extends Error {
  constructor(
    readonly code: "not_configured" | "not_found" | "unavailable" | "uncertain" | "rate_limited",
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export async function geocodeAddress(
  address: GeocodingAddress,
  apiKey = process.env.GEOAPIFY_API_KEY,
  fetcher: typeof fetch = fetch,
  context?: { kind: "household" | "event"; userId: string },
): Promise<GeocodedAddress> {
  if (!apiKey) throw new GeocodingError("not_configured");

  const query = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.stateRegion,
    address.postalCode,
    address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  const endpoint = process.env.GEOAPIFY_API_URL;
  if (endpoint) {
    const configured = new URL(endpoint);
    const local = ["localhost", "127.0.0.1", "::1"].includes(configured.hostname);
    if (
      (configured.protocol !== "https:" && !local) ||
      configured.username ||
      configured.password ||
      configured.search ||
      configured.hash
    )
      throw new GeocodingError("not_configured");
    url.href = configured.href;
  }
  url.searchParams.set("text", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);

  if (context) {
    try {
      const retry = await consumeGeocodingBudget(context.userId);
      if (retry > 0) throw new GeocodingError("rate_limited", retry);
    } catch (error) {
      if (error instanceof GeocodingError) throw error;
      throw new GeocodingError("unavailable");
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 429) throw new GeocodingError("rate_limited", providerRetrySeconds(response.headers.get("retry-after")));
    if (!response.ok) throw new GeocodingError("unavailable");
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new GeocodingError("unavailable");
    const result = parsed.data.results[0];
    if (!result) throw new GeocodingError("not_found");
    const kind = context?.kind ?? "household";
    if (result.country_code?.toUpperCase() !== address.countryCode ||
      (result.rank?.confidence ?? 0) < 0.9 ||
      (kind === "household"
        ? result.result_type !== "building" || (result.rank?.confidence_building_level ?? 0) < 0.9
        : !["building", "amenity"].includes(result.result_type ?? "")))
      throw new GeocodingError("uncertain");
    return {
      latitude: result.lat,
      longitude: result.lon,
      providerPlaceId: result.place_id ?? null,
      attribution: result.datasource.attribution,
    };
  } catch (error) {
    if (error instanceof GeocodingError) throw error;
    throw new GeocodingError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
