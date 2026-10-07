import { calendarQuery } from "@/lib/events/calendar";
import { OccurrenceParticipantCard } from "@/components/households/occurrence-participant-card";
import { participantSummary } from "@/lib/events/participant-presentation";
import { cookies } from "next/headers";
import { householdSelectionCookie, selectedHousehold } from "@/lib/households/selection";
import { householdPath } from "@/lib/households/paths";
/* eslint-disable react-hooks/purity -- Dynamic Server Component: current time is evaluated per request. */
import Link from "next/link";
import { z } from "zod";
import { groupContext } from "@/lib/groups/context";
import { isEventSlug } from "@/lib/events/paths";
import { groupPath } from "@/lib/groups/paths";
import { notFound } from "next/navigation";
import { displayTime } from "@/lib/events/time";
import { connectionsSchema } from "@/lib/connections/types";
import { MatchPanel } from "@/app/events/match-panel";
import { CarpoolAssignments } from "@/app/events/carpool-assignments";
export const dynamic = "force-dynamic";
const locationsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    is_primary: z.boolean(),
    archived_at: z.string().nullable(),
  }),
);
export default async function EventPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
  searchParams: Promise<{ calendarDate?: string; calendarView?: string }>;
}) {
  const { slug, eventSlug } = await params;
  const calendarReturn = await searchParams;
  const { supabase, user, profile, group: resolvedGroup } = await groupContext(slug);
  const id = resolvedGroup.id;
  if (!isEventSlug(eventSlug)) notFound();
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", eventSlug)
    .eq("group_id", id)
    .maybeSingle();
  if (error || !event) notFound();
  const eventId = event.id;
  const group = { data: resolvedGroup };
  const [houses, memberships, destinations] = await Promise.all([
    supabase
      .from("households")
      .select("id,slug,display_name")
      .is("archived_at", null).order("created_at").order("id"),
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
  const savedId = (await cookies()).get(householdSelectionCookie)?.value;
  const selected = selectedHousehold(houses.data ?? [], savedId);
  const household = selected && memberships.data?.some(membership => membership.household_id === selected.id) ? selected : undefined;
  const future =
    event.status === "scheduled" &&
    Date.parse(event.ready_to_depart_at ?? event.required_arrival_at!) >
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
  const destination = destinations.data?.find(
    (d) => d.id === event.location_id,
  );
  const now = Date.now();
  const summary = participantSummary(people.data ?? [], attendance.data ?? [], rides.data ?? [], event, now);
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link className="underline" href={`${groupPath(resolvedGroup.slug)}/events${calendarQuery(calendarReturn.calendarDate,calendarReturn.calendarView)}`}>
        Group events
      </Link>
      <h1 className="my-6 text-3xl">{event.name}</h1>
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
      {(houses.error ||
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
      {selected && <p className="my-4">Household: {selected.display_name}</p>}
      {!household && (
        <p className="my-4">{selected ? "The selected household is not an active member of this group. Choose a participating household in the app header to manage attendance and rides." : "No household is available. Create or join a household to manage attendance and rides."}</p>
      )}
      {household && (
        <>
          <Link
            className="underline"
            href={`${householdPath(household.slug)}/locations`}
          >
            Manage household addresses
          </Link>
          <p className="my-4" aria-label="Household participation summary">{summary.participants} participant{summary.participants === 1 ? "" : "s"} · {summary.going} going · {summary.incomplete} ride preference{summary.incomplete === 1 ? "" : "s"} incomplete</p>
          {!people.data?.length && <p className="my-4">No participants in this household. Add participants from your household page.</p>}
          {people.data?.map(person => <OccurrenceParticipantCard key={`${event.id}:${household.id}:${person.id}`} person={person} attendance={attendance.data?.find(a => a.member_id === person.id)} preferences={rides.data?.filter(r => r.member_id === person.id) ?? []} event={event} householdId={household.id} groupId={id} now={now} locations={savedLocations.success ? savedLocations.data.filter(l => !l.archived_at) : []} />)}
          <CarpoolAssignments householdSlug={household.slug} householdId={household.id} eventId={eventId} />
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
                householdSlug={household.slug}
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
        </>
      )}
    </div>
  );
}
