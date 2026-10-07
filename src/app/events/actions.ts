"use server";
import { eventUrlForId } from "@/lib/events/urls";
import { groupLinkRecoveryPath } from "@/lib/groups/paths";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/events/validation";
import { localInstant } from "@/lib/events/time";
import { geocodeAddress, GeocodingError } from "@/lib/geocoding";
import type { HouseholdResult } from "@/lib/households/result";
import type { Json } from "@/lib/supabase/database.types";
export async function eventAction(input: unknown): Promise<HouseholdResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message:
        "Check the required fields, household selection, and time window. Confirm the event timezone.",
    };
  const value = parsed.data;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return {
        ok: false,
        message: "Sign in before making this change.",
        destination: "/sign-in",
      };
    const payload: Record<string, Json | undefined> = { ...value };
    if (
      value.command === "location-save" ||
      value.command === "destination-save"
    ) {
      const household = value.command === "location-save";
      const authorized = await supabase.rpc("authorize_location_geocoding", {
        p_kind: household ? "household" : "event",
        p_parent_id: household ? value.householdId : value.groupId,
        p_location_id: value.locationId,
        p_revision: value.revision,
      });
      if (authorized.error && ["PGRST202", "42883"].includes(authorized.error.code))
        return { ok: false, message: "Address lookup database setup is missing. Contact the administrator." };
      if (authorized.error || !authorized.data)
        return {
          ok: false,
          message: "You do not have permission to save this address. Reload and check your access.",
        };
      try {
        const coordinates = await geocodeAddress(value, undefined, undefined, { kind: household ? "household" : "event", userId: user.id });
        payload.latitude = coordinates.latitude;
        payload.longitude = coordinates.longitude;
        payload.providerPlaceId = coordinates.providerPlaceId;
        payload.geocodingAttribution = coordinates.attribution;
      } catch (error) {
        if (error instanceof GeocodingError) {
          if (error.code === "uncertain")
            return { ok: false, message: "We could not verify this exact address. Check the street number, city, postal code and country, then try again." };
          if (error.code === "rate_limited")
            return { ok: false, message: `Address lookup is busy. Try again in ${error.retryAfterSeconds ?? 30} seconds.` };
          if (error.code === "not_configured")
            return {
              ok: false,
              message: "Address lookup is not configured. Contact the administrator.",
            };
          if (error.code === "not_found")
            return {
              ok: false,
              message: "We could not locate this address. Check the address fields and try again.",
            };
          return {
            ok: false,
            message: "Address lookup is temporarily unavailable. Try again later.",
          };
        }
        return {
          ok: false,
          message: "Unable to verify this address. Please try again.",
        };
      }
    }
    const convert = (v: string, timezone: string) =>
      v ? localInstant(v.slice(0, 10), v.slice(11), timezone) : null;
    if (value.command === "event-save") {
      try {
        payload.arrival = convert(value.arrivalLocal, value.timezone);
        payload.departure = convert(value.departureLocal, value.timezone);
        payload.activityStart = convert(
          value.activityStartLocal,
          value.timezone,
        );
        payload.activityEnd = convert(value.activityEndLocal, value.timezone);
      } catch {
        return {
          ok: false,
          message:
            "Use valid, unambiguous local times in the selected timezone. Times skipped or repeated by daylight saving cannot be used for a one-off event.",
        };
      }
      if (!payload.arrival && !payload.departure)
        return { ok: false, message: "Configure Arrive by or Ready to leave." };
    }
    if (value.command === "ride") {
      const active = ["need_ride", "can_drive", "either"].includes(value.mode);
      try {
        payload.earliest = active
          ? convert(value.earliestLocal, value.timezone)
          : null;
        payload.latest = active
          ? convert(value.latestLocal, value.timezone)
          : null;
      } catch {
        return {
          ok: false,
          message: "Choose valid, unambiguous times for the ride window.",
        };
      }
    }
    const result = await supabase.rpc("event_workflow", {
      p_command: value.command,
      p_data: payload,
    });
    if (result.error)
      return {
        ok: false,
        message:
          result.error.code === "40001"
            ? "This record changed. Reload and review it before saving again."
            : result.error.code === "42501"
              ? "You no longer have permission for this change. Reload to check your access."
              : "Unable to save. Check attendance, the event status, location, and time window, then try again.",
      };
    revalidatePath("/groups", "layout");
    revalidatePath("/households", "layout");
    const eventUrl = value.command === "event-save" && result.data ? await eventUrlForId(supabase, value.groupId, result.data) : null;
    return {
      ok: true,
      message: "Saved.",
      destination:
        value.command === "event-save"
          ? eventUrl ?? groupLinkRecoveryPath
          : undefined,
    };
  } catch {
    return { ok: false, message: "Unable to connect. Please try again." };
  }
}
