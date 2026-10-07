"use server";
import { groupUrlForId } from "@/lib/groups/urls";
import { groupLinkRecoveryPath } from "@/lib/groups/paths";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { expandRecurrence, recurrenceSchema } from "@/lib/events/recurrence";
import type { HouseholdResult } from "@/lib/households/result";
import type { Json } from "@/lib/supabase/database.types";
const schema = z.object({
  groupId: z.string().uuid(),
  requestId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  locationId: z.string().uuid(),
  spec: recurrenceSchema,
  replaceEventId: z.string().uuid().optional(),
  seriesRevision: z.number().int().positive().optional(),
});
export async function seriesAction(input: unknown): Promise<HouseholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: "Check the series details, dates, recurrence, and timezone.",
    };
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return {
        ok: false,
        message: "Sign in before creating a series.",
        destination: "/sign-in",
      };
    const expanded = expandRecurrence(parsed.data.spec);
    const result = await supabase.rpc("series_workflow", {
      p_data: {
        ...parsed.data,
        rule: expanded.rule,
        occurrences: expanded.occurrences,
      } as Json,
    });
    if (result.error)
      return {
        ok: false,
        message:
          result.error.code === "40001"
            ? "This series changed. Reload before replacing future occurrences."
            : "Unable to save the series. Check future dates, destination, and group permissions.",
      };
    const groupUrl = await groupUrlForId(supabase, parsed.data.groupId);
    revalidatePath("/groups/[slug]/events", "page");
    revalidatePath("/groups/[slug]/[eventSlug]", "page");
    revalidatePath("/groups/[slug]/[eventSlug]/recurring", "page");
    revalidatePath("/groups/[slug]", "page");
    revalidatePath("/groups");
    return {
      ok: true,
      message:
        "Series saved. Households must configure attendance and rides for the new occurrences.",
      destination: groupUrl ? `${groupUrl}/events?focus=${encodeURIComponent(expanded.occurrences[0].required_arrival_at ?? expanded.occurrences[0].ready_to_depart_at!)}` : groupLinkRecoveryPath,
    };
  } catch {
    return {
      ok: false,
      message: "Unable to save. Check the occurrence preview and try again.",
    };
  }
}
