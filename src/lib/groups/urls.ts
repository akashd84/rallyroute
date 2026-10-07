import type { createClient } from "@/lib/supabase/server";
import { groupPath, isGroupSlug } from "./paths";

// The caller's authenticated client and RLS control which group can be resolved.
export async function groupUrlForId(client: Awaited<ReturnType<typeof createClient>>, id: string): Promise<string | null> {
  try {
    const { data, error } = await client.from("groups").select("slug").eq("id", id).maybeSingle();
    return !error && data && isGroupSlug(data.slug) ? groupPath(data.slug) : null;
  } catch {
    return null;
  }
}
