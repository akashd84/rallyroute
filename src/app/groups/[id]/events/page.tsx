/* eslint-disable react-hooks/purity -- Dynamic Server Component: current time is evaluated per request. */
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { accountContext } from "@/lib/households/context";
import { displayTime } from "@/lib/events/time";
import { AddressFields, EventForm } from "@/app/events/forms";
import { SeriesForm } from "@/app/events/series-form";
import { TimezoneField } from "@/app/events/timezone-field";
export const dynamic = "force-dynamic";
export default async function EventsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await accountContext();
  if (!z.string().uuid().safeParse(id).success)
    return <main>Group unavailable</main>;
  const { data: group } = await supabase
    .from("groups")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();
  if (!group) return <main>Group unavailable</main>;
  const [events, destinations, admins] = await Promise.all([
    supabase.from("events").select("*").eq("group_id", id),
    supabase
      .from("event_locations")
      .select("*")
      .eq("group_id", id)
      .order("name"),
    supabase
      .from("group_admins")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", user.id),
  ]);
  const manager = Boolean(admins.data?.length);
  const now = Date.now();
  const sorted =
    events.data?.sort(
      (a, b) =>
        Date.parse(a.required_arrival_at ?? a.ready_to_depart_at!) -
        Date.parse(b.required_arrival_at ?? b.ready_to_depart_at!),
    ) ?? [];
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href={`/groups/${id}`} className="underline">
        {group.name}
      </Link>
      <h1 className="my-6 text-3xl">Events and destinations</h1>
      {(events.error || destinations.error || admins.error) && (
        <p role="alert">
          Unable to load all records. Reload before making changes.
        </p>
      )}
      {[true, false].map((upcoming) => (
        <section key={String(upcoming)}>
          <h2 className="mt-6 text-2xl">
            {upcoming ? "Upcoming" : "Past"} events
          </h2>
          <ul>
            {sorted
              .filter(
                (e) =>
                  Date.parse(e.ready_to_depart_at ?? e.required_arrival_at!) >=
                    now ===
                  upcoming,
              )
              .map((e) => (
                <li key={e.id} className="my-3">
                  <Link
                    className="underline"
                    href={`/groups/${id}/events/${e.id}`}
                  >
                    {e.name}
                  </Link>{" "}
                  —{" "}
                  {displayTime(
                    e.required_arrival_at ?? e.ready_to_depart_at,
                    e.timezone,
                  )}{" "}
                  ({e.timezone}) — {e.status}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {manager && (
        <>
          <h2 className="mt-8 text-2xl">Create one-off event</h2>
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
          <h2 className="mt-8 text-2xl">Create recurring events</h2>
          <SeriesForm
            groupId={id}
            requestId={randomUUID()}
            destinations={
              destinations.data?.filter((d) => !d.archived_at) ?? []
            }
          />
          <h2 className="mt-8 text-2xl">Create destination</h2>
          <EventForm
            command="destination-save"
            values={{ groupId: id }}
            label="Save destination"
          >
            <AddressFields />
          </EventForm>
          <h2 className="mt-8 text-2xl">Manage destinations</h2>
          {destinations.data?.map((d) => (
            <details key={d.id} className="my-4 rounded border p-4">
              <summary>
                {d.name}
                {d.archived_at ? " (archived)" : ""}
              </summary>
              <p>
                {d.address_line_1}, {d.city}
              </p>
              {!d.location && (
                <p role="status">
                  Coordinates are not available yet. Edit and save this
                  destination to resolve it.
                </p>
              )}
              {d.geocoding_attribution && (
                <p className="text-sm text-muted-foreground">
                  {d.geocoding_attribution}
                </p>
              )}
              {!d.archived_at && (
                <>
                  <EventForm
                    command="destination-save"
                    values={{
                      groupId: id,
                      locationId: d.id,
                      revision: String(d.revision),
                    }}
                    label="Save destination"
                    confirmation="Address changes require households to reconfirm future rides."
                  >
                    <AddressFields
                      values={{
                        name: d.name,
                        addressLine1: d.address_line_1,
                        addressLine2: d.address_line_2,
                        city: d.city,
                        stateRegion: d.state_region,
                        postalCode: d.postal_code,
                        countryCode: d.country_code,
                      }}
                    />
                  </EventForm>
                  <EventForm
                    command="destination-archive"
                    values={{
                      groupId: id,
                      locationId: d.id,
                      revision: String(d.revision),
                    }}
                    label="Archive destination"
                    confirmation="Archive this destination? Historical events will retain it."
                  />
                </>
              )}
            </details>
          ))}
        </>
      )}
    </main>
  );
}
