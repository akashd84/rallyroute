"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/events/validation";
import { localInstant } from "@/lib/events/time";
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
    return {
      ok: true,
      message: "Saved.",
      destination:
        value.command === "event-save"
          ? `/groups/${value.groupId}/events/${result.data}`
          : undefined,
    };
  } catch {
    return { ok: false, message: "Unable to connect. Please try again." };
  }
}
