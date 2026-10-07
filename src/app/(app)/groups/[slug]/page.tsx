import { householdPath } from "@/lib/households/paths";
/* eslint-disable react-hooks/purity -- Dynamic Server Component evaluates the current time per request. */
import { eventPath } from "@/lib/events/paths";
import { eventCards } from "@/lib/events/cards";
import { displayTime } from "@/lib/events/time";
import Link from "next/link";
import { groupContext } from "@/lib/groups/context";
import { groupInvitationPath, groupPath } from "@/lib/groups/paths";
export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await groupContext(slug);
  const { group } = context;
  const id = group.id;
  const [admins, memberships, houses, overview, events] = await Promise.all([
    context.supabase.from("group_admins").select("role").eq("group_id", id).eq("user_id", context.user.id),
    context.supabase.from("group_memberships").select("household_id", { count: "exact" }).eq("group_id", id).eq("status", "active"),
    context.supabase.from("households").select("id, slug, display_name").is("archived_at", null),
    context.supabase.rpc("get_group_overview", { p_group_id: id }).single(),
    context.supabase.from("events").select("id, slug, group_id, event_series_id, name, required_arrival_at, ready_to_depart_at, timezone, status").eq("group_id", id),
  ]);
  const cards = eventCards(events.data ?? [], Date.now());
  const role = admins.data?.[0]?.role;
  // Households are fetched through their own RLS; never render other households' IDs/names.
  const ownHouses = houses.data?.filter(h => memberships.data?.some(m => m.household_id === h.id)) ?? [];
  const loadError = admins.error || memberships.error || houses.error;
  return <div className="mx-auto w-full max-w-3xl p-6"><Link href="/groups" className="underline text-teal-800">Your groups</Link>
    {role && <><p className="mt-2"><Link href={`${groupPath(group.slug)}/settings`} className="inline-flex min-h-11 items-center text-teal-800 underline focus-visible:outline-2 focus-visible:outline-offset-4">Group settings</Link></p>
      <nav aria-label="Group invitations" className="flex flex-col items-start">
        <Link href={groupInvitationPath(group.slug, "invite")} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Invite to group</Link>
        <Link href={groupInvitationPath(group.slug, "share")} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Share group</Link>
      </nav>
    </>}
    <p className="mt-4"><Link className="underline" href={`${groupPath(group.slug)}/events`}>Events and destinations</Link></p><h1 className="my-6 text-3xl font-semibold">{group.name}</h1><p className="capitalize">{group.group_type}</p><p className="my-3">{group.description}</p><p>Your group role: {role === "owner" ? "Group Owner" : role ? "Group Admin" : "Group Member"}</p>
    <section aria-label="Group overview" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <dl className="rounded-xl border p-4">
        <dt className="font-semibold">Group Members</dt>
        <dd className="mt-2 text-2xl">{overview.error || !overview.data ? "Unavailable" : overview.data.group_members}</dd>
        <dd className="text-sm">Active households</dd>
      </dl>
      {([
        ["Needs Rides", "needs_rides", "Unfilled ride requests"],
        ["Driver Available", "drivers_available", "Available ride offers"],
        ["Carpools", "carpools", "Confirmed rides"],
      ] as const).map(([label, field, detail]) => <dl key={field} className="rounded-xl border p-4">
        <dt className="font-semibold">{label}</dt>
        <dd className="mt-2 text-2xl">{overview.error || !overview.data ? "Unavailable" : overview.data[field]}</dd>
        <dd className="text-sm">{detail} · next 7 days</dd>
      </dl>)}
    </section>
    <section aria-labelledby="group-events" className="mt-8 space-y-4">
      <h2 id="group-events" className="text-xl font-semibold">Events</h2>
      <p>Events in the next 7 days, soonest first.</p>
      {events.error ? <p role="alert">Events could not be loaded. Reload to try again.</p> : cards.length ?
        <ul className="grid gap-4 sm:grid-cols-2">{cards.map(event => {
          return <li key={event.id} className="flex min-w-0 flex-col rounded-xl border p-4">
            <Link href={eventPath(group.slug, event.slug)} className="inline-flex min-h-11 items-center break-words text-xl font-semibold underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2">{event.name}</Link>
            <p>{group.name}</p>
            {event.event_series_id && <p className="text-sm">Recurring event</p>}
            <p>{displayTime(event.required_arrival_at ?? event.ready_to_depart_at, event.timezone)} ({event.timezone})</p>
            <p className="capitalize">{event.status}</p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2">
              <Link href={`${eventPath(group.slug, event.slug)}/edit`} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2">Edit Occurrence</Link>
              {event.event_series_id && <Link href={`${eventPath(group.slug, event.slug)}/recurring`} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2">Edit Series</Link>}
            </div>
          </li>;
        })}</ul> : <p>No events in the next 7 days.</p>}
    </section>
    {loadError ? <p role="alert" className="mt-4">Group details could not be loaded. Reload to try again.</p> : <>
      <h2 className="mt-6 text-xl font-semibold">Your participating households</h2><ul>{ownHouses.map(h => <li key={h.id}><Link href={`${householdPath(h.slug)}`} className="underline">{h.display_name ?? "Household"}</Link></li>)}</ul>
      {!ownHouses.length && <p>You administer this group independently of household membership.</p>}
      {!role && <p className="mt-6">Group Owners manage settings and invitations. Household ownership does not grant group administration.</p>}
    </>}
  </div>;
}
