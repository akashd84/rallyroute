import type { createClient } from "@/lib/supabase/server";
import { groupUrlForId } from "@/lib/groups/urls";
import { isEventSlug } from "./paths";

// Use the caller's authenticated client so slug resolution preserves RLS.
export async function eventUrlForId(supabase: Awaited<ReturnType<typeof createClient>>, groupId: string, eventId: string): Promise<string | null> {
  try {
    const [groupUrl, event] = await Promise.all([
      groupUrlForId(supabase, groupId),
      supabase.from("events").select("slug").eq("id", eventId).eq("group_id", groupId).maybeSingle(),
    ]);
    return groupUrl && !event.error && event.data && isEventSlug(event.data.slug) ? `${groupUrl}/${event.data.slug}` : null;
  } catch { return null; }
}
