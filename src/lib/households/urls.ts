import type { createClient } from "@/lib/supabase/server";
import { householdPath, isHouseholdSlug } from "./paths";
export async function householdUrlForId(client: Awaited<ReturnType<typeof createClient>>, id: string): Promise<string | null> {
  try {
    const { data, error } = await client.from("households").select("slug").eq("id", id).is("archived_at", null).maybeSingle();
    return !error && data && isHouseholdSlug(data.slug) ? householdPath(data.slug) : null;
  } catch { return null; }
}
