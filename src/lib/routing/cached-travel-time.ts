import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoutingProvider } from "./index";
import { routingLeaseSeconds, throttled } from "./usage-controls";
import type { RouteRequest, TravelTimeResult } from "./types";

const cachedResult = z.object({
  status: z.literal("ok"),
  durationSeconds: z.number().finite().nonnegative(),
  distanceMeters: z.number().finite().nonnegative(),
});

function cacheKey(request: RouteRequest, providerUrl: string): string {
  const normalize = ({ latitude, longitude }: RouteRequest["origin"]) => ({
    latitude,
    longitude,
  });
  const normalized = {
    cacheVersion: process.env.ROUTE_CACHE_VERSION ?? "1",
    provider: process.env.ROUTING_PROVIDER ?? "valhalla",
    providerUrl,
    origin: normalize(request.origin),
    waypoints: (request.waypoints ?? []).map(normalize),
    destination: normalize(request.destination),
    travelMode: request.travelMode,
    departureTime: request.departureTime ?? null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function getCachedTravelTime(
  request: RouteRequest,
): Promise<TravelTimeResult> {
  const url = process.env.VALHALLA_URL ?? process.env.VALHALLA_BASE_URL;
  if (!url) throw new Error("Configure VALHALLA_URL before using routing.");
  const provider = getRoutingProvider();
  const key = cacheKey(request, url);
  const admin = createAdminClient();
  const cached = await admin.rpc("routing_cache_get", { p_cache_key: key });
  if (cached.error) throw new Error("Unable to read the private route cache.");
  if (cached.data !== null) {
    const result = cachedResult.safeParse(cached.data);
    if (!result.success) throw new Error("The private route cache is invalid.");
    return result.data;
  }

  const token = randomUUID();
  const claimed = await admin.rpc("routing_request_claim", {
    p_cache_key: key, p_token: token, p_lease_seconds: routingLeaseSeconds(),
  });
  if (claimed.error) throw new Error("Unable to claim a private routing request.");
  const claim = z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok") }),
    z.object({ status: z.literal("rate_limited"), retryAfterSeconds: z.number().int().positive() }),
    z.object({ status: z.literal("cached"), result: z.union([
      cachedResult,
      z.object({ status: z.literal("unreachable"), reason: z.enum(["no_route", "outside_coverage"]) }),
      z.object({ status: z.literal("error"), code: z.enum(["timeout", "network", "http", "rate_limited", "invalid_response"]), message: z.string(), retryAfterSeconds: z.number().int().positive() }),
    ]) }),
  ]).parse(claimed.data);
  if (claim.status === "rate_limited") return throttled(claim.retryAfterSeconds);
  if (claim.status === "cached") return claim.result;
  let result: TravelTimeResult;
  try {
    result = await provider.getTravelTime(request);
  } catch {
    result = { status: "error", code: "network", message: "Routing is temporarily unavailable. Please try again." };
  }
  const finished = await admin.rpc("routing_request_finish", {
    p_cache_key: key, p_token: token, p_result: result,
  });
  if (finished.error || !finished.data) throw new Error("Unable to publish the private route result.");
  return result;
}
