"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
const inputSchema = z.object({
  householdId: z.uuid(), memberId: z.uuid(), eventId: z.uuid(),
  status: z.enum(["going", "not_going", "unknown"]),
  expected: z.array(z.object({ id: z.uuid(), revision: z.number().int() })).max(366).optional(),
});
const resultSchema = z.object({ count: z.number().int().nonnegative(), snapshot: z.array(z.object({ id: z.uuid(), revision: z.number().int() })).optional() });
export async function seriesAttendanceAction(input: unknown): Promise<{ ok: boolean; message: string; count?: number; snapshot?: { id: string; revision: number }[] }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the participant and attendance selection." };
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return { ok: false, message: "Sign in before making this change." };
    const v = parsed.data;
    const result = await db.rpc("series_attendance", { p_household_id: v.householdId, p_member_id: v.memberId, p_event_id: v.eventId, p_status: v.status, p_expected: v.expected as Json | undefined });
    if (result.error) return { ok: false, message: result.error.code === "40001" ? "Occurrences changed. Reload and review before saving again." : result.error.code === "42501" ? "You no longer have permission for this change. Reload to check your access." : "Unable to update attendance. Please try again." };
    const data = resultSchema.parse(result.data);
    if (v.expected) {
      revalidatePath("/groups", "layout");
      revalidatePath("/households", "layout");
    }
    return { ok: true, ...data, message: data.count ? `Attendance updated for ${data.count} occurrence${data.count === 1 ? "" : "s"}.` : "There are no upcoming occurrences to update." };
  } catch { return { ok: false, message: "Unable to connect. Please try again." }; }
}
