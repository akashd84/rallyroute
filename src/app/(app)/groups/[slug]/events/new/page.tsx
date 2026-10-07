import Link from "next/link";
import { randomUUID } from "node:crypto";
import { eventManagementContext } from "@/lib/events/management";
import { groupPath } from "@/lib/groups/paths";
import { EventForm } from "@/app/events/forms";
import { TimezoneField } from "@/app/events/timezone-field";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { group, destinations, manager, loadError } = await eventManagementContext(slug);
  const id = group.id;
  return <div className="mx-auto max-w-3xl p-6">
    <Link href={`${groupPath(group.slug)}/events`} className="inline-flex min-h-11 items-center underline">Events and destinations</Link>
    <h1 className="my-6 text-3xl">Create one-off event</h1>
    {loadError ? <p role="alert">Unable to load event settings. Reload before making changes.</p> : !manager ? <p>Group Owners and Admins can manage events and destinations.</p> : <>
          <EventForm
            command="event-save"
            values={{ groupId: id, requestId: randomUUID() }}
            label="Create event"
          >
            <label className="block">
              Event name
              <input
                className="block w-full rounded border p-2"
                name="name"
                maxLength={100}
                required
              />
            </label>
            <label className="block">
              Destination
              <select
                name="locationId"
                required
                className="block w-full rounded border p-2"
              >
                <option value="">Select destination</option>
                {destinations.data
                  ?.filter((d) => !d.archived_at)
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <TimezoneField />
            {[
              ["arrivalLocal", "Arrive by"],
              ["departureLocal", "Ready to leave"],
              ["activityStartLocal", "Activity starts (optional)"],
              ["activityEndLocal", "Activity ends (optional)"],
            ].map(([name, label]) => (
              <label className="block" key={name}>
                {label}
                <input
                  className="block w-full rounded border p-2"
                  type="datetime-local"
                  name={name}
                />
              </label>
            ))}
            <p>
              Configure at least one transportation anchor. Use explicit dates
              for overnight events.
            </p>
          </EventForm>
    </>}
  </div>;
}
