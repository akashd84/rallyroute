import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RoutingFailure } from "./types";
import { getCachedTravelTime } from "./cached-travel-time";

export const detourInputSchema = z.object({
  event_id: z.string().uuid(),
  leg: z.enum(["to_event", "from_event"]),
  event_latitude: z.number().finite().min(-90).max(90),
  event_longitude: z.number().finite().min(-180).max(180),
  driver_latitude: z.number().finite().min(-90).max(90),
  driver_longitude: z.number().finite().min(-180).max(180),
  rider_latitude: z.number().finite().min(-90).max(90),
  rider_longitude: z.number().finite().min(-180).max(180),
  driver_max_detour_minutes: z.number().int().min(0).max(120),
  driver_available_seats: z.number().int().min(1).max(20),
});

export type DetourEvaluation =
  | { status: "compatible"; addedDurationSeconds: number; maxDetourMinutes: number }
  | { status: "detour_exceeded"; addedDurationSeconds: number; maxDetourMinutes: number }
  | { status: "filtered" }
  | { status: "unreachable"; reason?: string }
  | { status: "error"; code: string; retryAfterSeconds?: number };

function routeFailure(result: RoutingFailure): DetourEvaluation {
  return result.status === "unreachable"
    ? { status: "unreachable", reason: result.reason }
    : { status: "error", code: result.code, ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}) };
}

export async function evaluateEventRideDetour(
  eventId: string,
  driverRideId: string,
  riderRideId: string,
): Promise<DetourEvaluation> {
  const parsedIds = z.string().uuid().safeParse(eventId);
  if (
    !parsedIds.success ||
    !z.string().uuid().safeParse(driverRideId).success ||
    !z.string().uuid().safeParse(riderRideId).success
  )
    return { status: "error", code: "invalid_request" };

  let user: { id: string } | null;
  try {
    const userClient = await createClient();
    const auth = await userClient.auth.getUser();
    if (auth.error) return { status: "error", code: "authentication_failed" };
    user = auth.data.user;
  } catch {
    return { status: "error", code: "authentication_failed" };
  }
  if (!user) return { status: "error", code: "unauthorized" };

  const distanceLimit = Number(
    process.env.ROUTING_PREFILTER_MAX_PICKUP_DISTANCE_METERS ?? 100000,
  );
  if (!Number.isInteger(distanceLimit) || distanceLimit < 1000 || distanceLimit > 250000)
    return { status: "error", code: "invalid_configuration" };

  const candidates = await (async () => {
    try {
      const admin = createAdminClient();
      return await admin.rpc("route_candidate_inputs", {
        p_user_id: user.id,
        p_event_id: eventId,
        p_driver_ride_id: driverRideId,
        p_rider_ride_id: riderRideId,
        p_max_pickup_distance_meters: distanceLimit,
      });
    } catch {
      return null;
    }
  })();
  if (!candidates)
    return { status: "error", code: "location_resolution_failed" };
  if (candidates.error)
    return { status: "error", code: "location_resolution_failed" };
  const candidate = z.array(detourInputSchema).safeParse(candidates.data);
  if (!candidate.success)
    return { status: "error", code: "invalid_location_result" };
  const input = candidate.data[0];
  if (!input) return { status: "filtered" };

  return evaluateResolvedDetour(input);
}

// Internal server-only primitive: callers must authorize and resolve inputs in SQL.
export async function evaluateResolvedDetour(
  input: z.infer<typeof detourInputSchema>,
): Promise<DetourEvaluation> {
  const event = {
    latitude: input.event_latitude,
    longitude: input.event_longitude,
  };
  const driver = {
    latitude: input.driver_latitude,
    longitude: input.driver_longitude,
  };
  const rider = {
    latitude: input.rider_latitude,
    longitude: input.rider_longitude,
  };
  const origin = input.leg === "to_event" ? driver : event;
  const destination = input.leg === "to_event" ? event : driver;
  const travelMode = "driving" as const;
  const routeTimes = await (async () => {
    try {
      return await Promise.all([
        getCachedTravelTime({ origin, destination, travelMode }),
        getCachedTravelTime({
          origin,
          waypoints: [rider],
          destination,
          travelMode,
        }),
      ]);
    } catch {
      return null;
    }
  })();
  if (!routeTimes)
    return { status: "error", code: "route_calculation_failed" };
  const [direct, withPickup] = routeTimes;
  if (direct.status !== "ok") return routeFailure(direct);
  if (withPickup.status !== "ok") return routeFailure(withPickup);

  const addedDurationSeconds = Math.max(
    0,
    withPickup.durationSeconds - direct.durationSeconds,
  );
  return addedDurationSeconds <= input.driver_max_detour_minutes * 60
    ? {
        status: "compatible",
        addedDurationSeconds,
        maxDetourMinutes: input.driver_max_detour_minutes,
      }
    : {
        status: "detour_exceeded",
        addedDurationSeconds,
        maxDetourMinutes: input.driver_max_detour_minutes,
      };
}
