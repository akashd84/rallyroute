"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eventSchema } from "@/lib/events/validation";
import { localInstant } from "@/lib/events/time";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
const responseSchema = z.object({ count: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), snapshot: z.string().regex(/^[a-f0-9]{32}$/).optional() });
type Result = { ok: boolean; message: string; count?: number; skipped?: number; snapshot?: string };
export async function seriesRideAction(input: unknown): Promise<Result> {
  const parsed = eventSchema.safeParse(input);
  const expected = z.object({ expected: z.string().regex(/^[a-f0-9]{32}$/).optional() }).safeParse(input);
  if (!parsed.success || parsed.data.command !== "ride" || !expected.success) return { ok: false, message: "Check the ride preference, participant, and time window." };
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return { ok: false, message: "Sign in before making this change." };
    const value = parsed.data;
    const active = ["need_ride", "can_drive", "either"].includes(value.mode);
    let earliest: string | null = null, latest: string | null = null;
    try {
      if (active) {
        earliest = localInstant(value.earliestLocal.slice(0,10), value.earliestLocal.slice(11), value.timezone);
        latest = localInstant(value.latestLocal.slice(0,10), value.latestLocal.slice(11), value.timezone);
      }
    } catch { return { ok: false, message: "Choose valid, unambiguous times for the ride window." }; }
    const result = await db.rpc("series_ride_preferences", { p_data: { ...value, earliest, latest } as Json, p_expected: expected.data.expected });
    if (result.error) return { ok: false, message: result.error.code === "40001" ? "Occurrences or ride preferences changed. Reload and review before saving again." : result.error.code === "42501" ? "You no longer have access to this participant or address. Reload to check your access." : "Unable to save. Check attendance, the address, ride direction, and time window." };
    const data = responseSchema.parse(result.data);
    if (expected.data.expected) {
      revalidatePath("/groups", "layout");
      revalidatePath("/households", "layout");
    }
    return { ok: true, ...data, message: data.count ? `Ride preferences updated for ${data.count} occurrence${data.count === 1 ? "" : "s"}. ${data.skipped} skipped.` : `No upcoming occurrences qualify. ${data.skipped} skipped because attendance is not Going or the ride direction is unavailable.` };
  } catch { return { ok: false, message: "Unable to connect. Please try again." }; }
}
