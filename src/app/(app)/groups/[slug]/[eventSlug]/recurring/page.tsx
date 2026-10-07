/* eslint-disable react-hooks/purity -- Editability is evaluated at request time. */
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesForm } from "@/app/events/series-form";
import { groupContext } from "@/lib/groups/context";
import { groupPath } from "@/lib/groups/paths";
import { eventPath, isEventSlug } from "@/lib/events/paths";
import { recurrenceSchema } from "@/lib/events/recurrence";

export default async function RecurringPage({ params }: { params: Promise<{ slug: string; eventSlug: string }> }) {
  const { slug, eventSlug } = await params;
  const { group, supabase, user } = await groupContext(slug);
  if (!isEventSlug(eventSlug)) notFound();
  const { data: event, error: eventError } = await supabase.from("events").select("*")
    .eq("group_id", group.id).eq("slug", eventSlug).maybeSingle();
  if (eventError || !event?.event_series_id || !event.original_local_date) notFound();
  const [series, admins, destinations, futureCount] = await Promise.all([
    supabase.from("event_series").select("*").eq("group_id", group.id).eq("id", event.event_series_id).maybeSingle(),
    supabase.from("group_admins").select("role").eq("group_id", group.id).eq("user_id", user.id),
    supabase.from("event_locations").select("id, name").eq("group_id", group.id).is("archived_at", null).order("name"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("group_id", group.id)
      .eq("event_series_id", event.event_series_id).gte("original_local_date", event.original_local_date).eq("status", "scheduled"),
  ]);
  if (series.error || !series.data) notFound();
  const spec = recurrenceSchema.safeParse(series.data.recurrence_spec);
  const manager = admins.data?.some(admin => admin.role === "owner" || admin.role === "admin");
  const editable = event.status === "scheduled" && Math.min(...[event.required_arrival_at, event.ready_to_depart_at].filter((time): time is string => Boolean(time)).map(Date.parse)) > Date.now();
  const loadError = admins.error || destinations.error || futureCount.error || !spec.success;

  return <div className="mx-auto w-full max-w-3xl p-6">
    <Link href={eventPath(group.slug, event.slug)} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Back to {event.name}</Link>
    <h1 className="my-6 text-3xl font-semibold">Recurring settings</h1>
    <p>{series.data.name}</p>
    {loadError ? <p role="alert" className="my-4">Recurring settings could not be loaded. Reload before making changes.</p> : <>
      <p className="my-4">Repeats every {spec.data!.interval} {{ daily: "day", weekly: "week", monthly: "month" }[spec.data!.frequency]}{spec.data!.interval === 1 ? "" : "s"} · {spec.data!.timezone}</p>
      {manager && editable ? <>
        <p>Changes apply to this occurrence ({event.original_local_date}) and future occurrences. Preview the dates before saving. Existing attendance and ride preferences will not migrate to the replacement events.</p>
        <SeriesForm groupId={group.id} requestId={randomUUID()} destinations={destinations.data ?? []}
          replaceEventId={event.id} seriesRevision={series.data.revision} replacementCount={futureCount.count ?? 0}
          startDate={event.original_local_date} initial={{ ...spec.data!, name: series.data.name, locationId: series.data.location_id ?? undefined }} />
      </> : <p className="my-4">{!manager ? "Group Owners and Admins can update recurring settings." : "Started, past, or cancelled occurrences cannot be replaced. Open a future scheduled occurrence to update recurring settings."}</p>}
    </>}
    <Link href={`${groupPath(group.slug)}/events`} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Events and destinations</Link>
  </div>;
}
