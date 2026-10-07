/* eslint-disable react-hooks/purity -- Editability is evaluated per request. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { groupContext } from "@/lib/groups/context";
import { eventPath, isEventSlug } from "@/lib/events/paths";
import { localInput } from "@/lib/events/time";
import { EventForm } from "@/app/events/forms";
import { TimezoneField } from "@/app/events/timezone-field";
export default async function EditOccurrencePage({ params }: { params: Promise<{ slug: string; eventSlug: string }> }) {
  const { slug, eventSlug } = await params;
  const { group, supabase, user } = await groupContext(slug);
  if (!isEventSlug(eventSlug)) notFound();
  const { data: event, error } = await supabase.from("events").select("*").eq("group_id", group.id).eq("slug", eventSlug).maybeSingle();
  if (error || !event) notFound();
  const [admins, destinations] = await Promise.all([
    supabase.from("group_admins").select("role").eq("group_id", group.id).eq("user_id", user.id),
    supabase.from("event_locations").select("id,name,archived_at").eq("group_id", group.id),
  ]);
  const manager = admins.data?.some(admin => admin.role === "owner" || admin.role === "admin");
  const editable = event.status === "scheduled" && Math.min(...[event.required_arrival_at,event.ready_to_depart_at].filter((time): time is string => Boolean(time)).map(Date.parse)) > Date.now();
  const fields = { groupId: group.id, eventId: event.id, revision: String(event.revision) };
  return <div className="mx-auto max-w-3xl p-6">
    <Link className="inline-flex min-h-11 items-center underline" href={eventPath(group.slug,event.slug)}>Back to {event.name}</Link>
    <h1 className="my-6 text-3xl">Edit occurrence</h1>
    <p>{event.name}</p>
    {admins.error || destinations.error ? <p role="alert">Event settings could not be loaded. Reload before making changes.</p> : <>
    {!manager && <p className="my-4">Group Owners and Admins can edit occurrences.</p>}
    {manager && !editable && <p className="my-4">Started, past, or cancelled occurrences cannot be edited.</p>}
      {manager && (
        <section id="edit-occurrence" className="mt-8 scroll-mt-20">
          {editable && (
            <EventForm
              command="event-save"
              values={fields}
              label="Save event"
              confirmation="Time, timezone, or destination changes require households to reconfirm future rides."
            >
              <label className="block">
                Event name
                <input
                  className="block w-full rounded border p-2"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={event.name}
                />
              </label>
              <label className="block">
                Destination
                <select
                  name="locationId"
                  required
                  defaultValue={event.location_id ?? ""}
                  className="block w-full rounded border p-2"
                >
                  {destinations.data
                    ?.filter(
                      (d) => !d.archived_at || d.id === event.location_id,
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <TimezoneField timezone={event.timezone} />
              {[
                ["arrivalLocal", "Arrive by", event.required_arrival_at],
                ["departureLocal", "Ready to leave", event.ready_to_depart_at],
                [
                  "activityStartLocal",
                  "Activity starts",
                  event.activity_starts_at,
                ],
                ["activityEndLocal", "Activity ends", event.activity_ends_at],
              ].map(([name, label, instant]) => (
                <label className="block" key={name}>
                  {label}
                  <input
                    className="block w-full rounded border p-2"
                    name={name!}
                    type="datetime-local"
                    defaultValue={localInput(instant, event.timezone)}
                  />
                </label>
              ))}
            </EventForm>
          )}
          {event.status === "scheduled" && (
            <EventForm
              command="event-cancel"
              values={fields}
              label="Cancel event"
              confirmation="Cancel this event? Future ride legs will be disabled; history is preserved."
            />
          )}
        </section>
      )}
    </>}
  </div>;
}
