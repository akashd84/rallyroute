"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isGroupSlug } from "@/lib/groups/paths";
import { calendarEntry, calendarOverlap, type CalendarEntry } from "@/lib/events/calendar";
const schema = z.object({ slug: z.string().refine(isGroupSlug), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).refine(v => Date.parse(v.end) > Date.parse(v.start) && Date.parse(v.end)-Date.parse(v.start) <= 93*86400000);
export async function calendarEventsAction(input: unknown): Promise<{ ok: boolean; events?: CalendarEntry[]; message?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a valid calendar date range." };
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in again to load events." };
    const { data: group, error: groupError } = await db.from("groups").select("id,slug").eq("slug",parsed.data.slug).maybeSingle();
    if (groupError || !group) return { ok: false, message: "Events are unavailable. Reload to check your access." };
    const { start, end } = parsed.data;
    const columns = ["activity_starts_at","activity_ends_at","required_arrival_at","ready_to_depart_at"];
    const candidates = `and(or(${columns.map(column => `${column}.lt.${end}`).join(",")}),or(${columns.map(column => `${column}.gte.${start}`).join(",")}))`;
    const entries: CalendarEntry[] = [];
    for (let offset=0;;offset+=500) {
      const { data, error } = await db.from("events").select("id,slug,name,status,timezone,event_series_id,activity_starts_at,activity_ends_at,required_arrival_at,ready_to_depart_at").eq("group_id",group.id).or(candidates).order("id").range(offset,offset+499);
      if (error || !data) return { ok: false, message: "Unable to load events. Try again." };
      for (const row of data) {
        const entry = calendarEntry(row,group.slug);
        if (calendarOverlap(entry,Date.parse(start),Date.parse(end))) entries.push(entry);
      }
      if (data.length<500) break;
    }
    return { ok: true, events: entries };
  } catch { return { ok: false, message: "Unable to load events. Try again." }; }
}
