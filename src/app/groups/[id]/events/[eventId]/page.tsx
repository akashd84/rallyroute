/* eslint-disable react-hooks/purity -- Dynamic Server Component: current time is evaluated per request. */
import { randomUUID } from "node:crypto";
import { recurrenceSchema } from "@/lib/events/recurrence";
import { SeriesForm } from "@/app/events/series-form";
import Link from "next/link";
import { z } from "zod";
import { accountContext } from "@/lib/households/context";
import { displayTime, localInput } from "@/lib/events/time";
import { connectionsSchema } from "@/lib/connections/types";
import { MatchPanel } from "@/app/events/match-panel";
import { CarpoolAssignments } from "@/app/events/carpool-assignments";
import { RideFields } from "@/app/events/ride-fields";
import { EventForm } from "@/app/events/forms";
import { TimezoneField } from "@/app/events/timezone-field";
export const dynamic = "force-dynamic";
const locationsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    archived_at: z.string().nullable(),
  }),
);
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ household?: string }>;
}) {
  const { id, eventId } = await params;
  const query = await searchParams;
  const { supabase, user, profile } = await accountContext();
  if (![id, eventId].every((v) => z.string().uuid().safeParse(v).success))
    return <main>Event unavailable</main>;
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("group_id", id)
    .maybeSingle();
  if (error || !event) return <main>Event unavailable</main>;
  const group = await supabase.from("groups").select("name").eq("id", id).maybeSingle();
  const [admins, houses, memberships, destinations] = await Promise.all([
    supabase
      .from("group_admins")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", user.id),
    supabase
      .from("households")
      .select("id,display_name")
      .is("archived_at", null),
    supabase
      .from("group_memberships")
      .select("household_id")
      .eq("group_id", id)
      .eq("status", "active"),
    supabase
      .from("event_locations")
      .select(
        "id,name,archived_at,address_line_1,address_line_2,city,state_region,postal_code,country_code",
      )
      .eq("group_id", id),
  ]);
  const eligible =
    houses.data?.filter((h) =>
      memberships.data?.some((m) => m.household_id === h.id),
    ) ?? [];
  const household = eligible.find((h) => h.id === query.household);
  const manager = Boolean(admins.data?.length);
  const future =
    event.status === "scheduled" &&
    Date.parse(event.ready_to_depart_at ?? event.required_arrival_at!) >
      Date.now();
  const editable =
    event.status === "scheduled" &&
    Date.parse(event.required_arrival_at ?? event.ready_to_depart_at!) >
      Date.now();
  const [people, attendance, rides, locations] = household
    ? await Promise.all([
        supabase
          .from("household_members")
          .select("id,first_name,last_name,member_type")
          .eq("household_id", household.id)
          .is("archived_at", null),
        supabase
          .from("event_participation")
          .select("*")
          .eq("event_id", eventId),
        supabase.from("ride_participation").select("*").eq("event_id", eventId),
        supabase.rpc("household_location_list", {
          p_household_id: household.id,
        }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const connectionResult = household ? await supabase.rpc("list_connections", { p_household_id: household.id }) : { data: [], error: null };
  const parsedConnections = connectionsSchema.safeParse(connectionResult.data);
  const connectionStates = !connectionResult.error && parsedConnections.success ? parsedConnections.data.filter(c => c.status === "pending" || c.status === "accepted").map(c => ({ otherHouseholdId: c.otherHouseholdId, status: c.status, incoming: c.incoming })) : [];
  const savedLocations = locationsSchema.safeParse(locations.data);
  const series = event.event_series_id
    ? await supabase
        .from("event_series")
        .select("*")
        .eq("id", event.event_series_id)
        .maybeSingle()
    : { data: null };
  const spec = recurrenceSchema.safeParse(series.data?.recurrence_spec);
  const futureCount =
    event.event_series_id && event.original_local_date
      ? await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("event_series_id", event.event_series_id)
          .gte("original_local_date", event.original_local_date)
          .eq("status", "scheduled")
      : { count: 0 };
  const destination = destinations.data?.find(
    (d) => d.id === event.location_id,
  );
  const fields = { groupId: id, eventId, revision: String(event.revision) };
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link className="underline" href={`/groups/${id}/events`}>
        Group events
      </Link>
      <h1 className="my-6 text-3xl">{event.name}</h1>
      {household && <CarpoolAssignments householdId={household.id} eventId={eventId} />}
      <p>
        {event.status} — {event.timezone}
      </p>
      <p>Destination: {destination?.name ?? "Unavailable"}</p>
      {destination && (
        <p>
          {[
            destination.address_line_1,
            destination.address_line_2,
            destination.city,
            destination.state_region,
            destination.postal_code,
            destination.country_code,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
      <p>Arrive by: {displayTime(event.required_arrival_at, event.timezone)}</p>
      <p>
        Ready to leave: {displayTime(event.ready_to_depart_at, event.timezone)}
      </p>
      <p>
        Activity starts: {displayTime(event.activity_starts_at, event.timezone)}
      </p>
      <p>
        Activity ends: {displayTime(event.activity_ends_at, event.timezone)}
      </p>
      {(admins.error ||
        houses.error ||
        memberships.error ||
        people.error ||
        attendance.error ||
        rides.error ||
        locations.error) && (
        <p role="alert">
          Some records could not be loaded. Reload before saving.
        </p>
      )}
      <h2 className="mt-8 text-2xl">Household attendance and rides</h2>
      <form method="get" className="my-4">
        <label className="block">
          Household
          <select
            name="household"
            required
            defaultValue={household?.id ?? ""}
            className="block w-full rounded border p-2"
          >
            <option value="">Select your household</option>
            {eligible.map((h) => (
              <option key={h.id} value={h.id}>
                {h.display_name}
              </option>
            ))}
          </select>
        </label>
        <button className="my-3 rounded bg-teal-800 p-2 text-white">
          Show household
        </button>
      </form>
      {!eligible.length && (
        <p>
          Transportation is available only to participants in an active
          household that joined this group. Group administration does not grant
          household access.
        </p>
      )}
      {household && (
        <>
          <Link
            className="underline"
            href={`/households/${household.id}/locations`}
          >
            Manage household addresses
          </Link>
          {(["to_event", "from_event"] as const).map((leg) => {
            const anchor = leg === "to_event"
              ? event.required_arrival_at
              : event.ready_to_depart_at;
            if (!anchor) return null;
            const activePeople = people.data?.filter((p) =>
              attendance.data?.some((a) =>
                a.member_id === p.id && a.status === "going" && !a.disabled_at,
              ),
            ) ?? [];
            const preferences = rides.data?.filter((r) =>
              r.leg === leg && activePeople.some((p) => p.id === r.member_id),
            ) ?? [];
            const ready = preferences.some((r) =>
              !r.disabled_at && !r.needs_reconfirmation &&
              ["need_ride", "can_drive", "either"].includes(r.mode),
            );
            return (
              <MatchPanel
                key={`${household.id}:${leg}:${event.revision}:${JSON.stringify(preferences)}`}
                eventId={eventId}
                householdId={household.id}
                leg={leg}
                timezone={event.timezone}
                eventName={event.name}
                householdName={household.display_name ?? "Your household"}
                connections={connectionStates}
                groupName={group.data?.name}
                contact={{ name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "), email: user.email ?? "" }}
                readiness={
                  !future || Date.parse(anchor) <= Date.now() ? "past"
                    : ready ? "ready"
                    : preferences.some((r) => r.needs_reconfirmation) ? "reconfirm"
                    : "missing"
                }
              />
            );
          })}
          {people.data?.map((person) => {
            const att = attendance.data?.find((a) => a.member_id === person.id);
            const values = {
              ...fields,
              householdId: household.id,
              memberId: person.id,
            };
            return (
              <section className="my-6 rounded border p-4" key={person.id}>
                <h3 className="text-xl">
                  {person.first_name} {person.last_name} ({person.member_type})
                </h3>
                {future ? (
                  <EventForm
                    command="attendance"
                    values={values}
                    label="Save attendance"
                  >
                    <label className="block">
                      Attendance
                      <select
                        name="status"
                        defaultValue={att?.status ?? "unknown"}
                        className="block w-full rounded border p-2"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="going">Going</option>
                        <option value="not_going">Not going</option>
                      </select>
                    </label>
                  </EventForm>
                ) : (
                  <p>Attendance: {att?.status ?? "unknown"}</p>
                )}
                {att?.status === "going" &&
                  !att.disabled_at &&
                  (["to_event", "from_event"] as const).map((leg) => {
                    const anchor =
                      leg === "to_event"
                        ? event.required_arrival_at
                        : event.ready_to_depart_at;
                    if (!anchor) return null;
                    const pref = rides.data?.find(
                      (r) => r.member_id === person.id && r.leg === leg,
                    );
                    const active = future && Date.parse(anchor) > Date.now();
                    const earliest =
                      pref?.anchor_earliest_at ??
                      new Date(
                        Date.parse(anchor) - (leg === "to_event" ? 600000 : 0),
                      ).toISOString();
                    const latest =
                      pref?.anchor_latest_at ??
                      new Date(
                        Date.parse(anchor) +
                          (leg === "from_event" ? 600000 : 0),
                      ).toISOString();
                    return (
                      <div key={leg} className="mt-6 border-t pt-4">
                        <h4>
                          {leg === "to_event" ? "To event" : "From event"}
                        </h4>
                        <p>
                          {pref?.needs_reconfirmation
                            ? "Needs reconfirmation"
                            : pref?.disabled_at
                              ? "Disabled"
                              : (pref?.mode ?? "Unconfigured")}
                        </p>
                        {active && (
                          <EventForm
                            command="ride"
                            values={{
                              ...values,
                              leg,
                              timezone: event.timezone,
                            }}
                            label="Save ride preference"
                          >
                            <RideFields
                              adult={person.member_type === "adult"}
                              initialMode={pref?.mode}
                              locationId={pref?.household_location_id}
                              locations={
                                savedLocations.success
                                  ? savedLocations.data.filter(
                                      (l) => !l.archived_at,
                                    )
                                  : []
                              }
                              earliest={localInput(earliest, event.timezone)}
                              latest={localInput(latest, event.timezone)}
                              timezone={event.timezone}
                              seats={pref?.available_seats}
                              detour={pref?.max_detour_minutes}
                            />
                          </EventForm>
                        )}
                      </div>
                    );
                  })}
              </section>
            );
          })}
        </>
      )}
      {manager && (
        <section className="mt-8">
          <h2 className="text-2xl">
            Manage {event.event_series_id ? "this occurrence" : "event"}
          </h2>
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
      {manager && editable && series.data && event.original_local_date && (
        <section className="mt-8">
          <h2 className="text-2xl">This and future occurrences</h2>
          <SeriesForm
            groupId={id}
            requestId={randomUUID()}
            destinations={
              destinations.data?.filter((d) => !d.archived_at) ?? []
            }
            replaceEventId={event.id}
            seriesRevision={series.data.revision}
            replacementCount={futureCount.count ?? 0}
            startDate={event.original_local_date}
            initial={{
              ...(spec.success ? spec.data : {}),
              name: event.name,
              locationId: event.location_id ?? undefined,
            }}
          />
        </section>
      )}
    </main>
  );
}
