"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdResult } from "@/lib/households/result";
const schema = z.object({ householdId: z.uuid(), locationId: z.uuid() });
export async function setPrimaryLocation(input: unknown): Promise<HouseholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose an available address." };
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return { ok: false, message: "Sign in before changing the primary address.", destination: "/sign-in" };
    const { error } = await client.rpc("set_household_primary_location", { p_household_id: parsed.data.householdId, p_location_id: parsed.data.locationId });
    if (error) return { ok: false, message: "Unable to set this address as primary. Reload and check your household access." };
    revalidatePath("/households/[householdSlug]", "layout");
    revalidatePath("/groups/[slug]/[eventSlug]", "page");
    return { ok: true, message: "Primary address updated." };
  } catch { return { ok: false, message: "Unable to connect. Please try again." }; }
}
