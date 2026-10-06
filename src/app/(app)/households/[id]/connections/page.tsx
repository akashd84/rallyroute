import { randomUUID } from "node:crypto";
import Link from "next/link";
import { z } from "zod";
import { householdContext } from "@/lib/households/context";
import { connectionsSchema, displayAddress, locationsSchema } from "@/lib/connections/types";
import { ConnectionForm, ContactConsent, SharePickupForm } from "@/app/households/[id]/connections/forms";
import { CarpoolForm, CarpoolConsent } from "@/app/households/[id]/carpools/forms";
export const dynamic = "force-dynamic";
export default async function ConnectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <div>Household unavailable</div>;
  const { household, supabase, user, profile } = await householdContext(id);
  if (!household) return <div>Household unavailable</div>;
  const [result, locations, households] = await Promise.all([
    supabase.rpc("list_connections", { p_household_id: id }),
    supabase.rpc("household_location_list", { p_household_id: id }),
    supabase.from("households").select("id,display_name").is("archived_at", null),
  ]);
  const parsed = connectionsSchema.safeParse(result.data);
  const saved = locationsSchema.safeParse(locations.data);
  const connections = parsed.success ? parsed.data : [];
  const groupIds = [...new Set(connections.filter(c => c.status === "accepted").map(c => c.groupId))];
  const events = groupIds.length ? await supabase.from("events").select("id,group_id,name,revision,timezone,required_arrival_at,ready_to_depart_at").in("group_id", groupIds).eq("status", "scheduled").or(`required_arrival_at.gt.${new Date().toISOString()},ready_to_depart_at.gt.${new Date().toISOString()}`).order("required_arrival_at") : { data: [], error: null };
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const email = user.email ?? "";
  return <div className="mx-auto max-w-3xl p-6">
    <Link className="underline" href={`/households/${id}`}>Your household</Link>
    <h1 className="my-4 text-3xl">{household.display_name} connections</h1>
    <Link href="/account" className="underline">Your account</Link>
    <nav aria-label="Choose household" className="my-4 flex flex-wrap gap-3">{households.data?.map(h => <Link key={h.id} className="underline" href={`/households/${h.id}/connections`}>{h.display_name}</Link>)}</nav>
    <p>Any account holder in your household can manage connections. Connections stay active while both households belong to the originating group. Seats are not reserved.</p>
    {(result.error || !parsed.success) && <p role="alert">Connections could not be loaded. Reload to check current status.</p>}
    {(locations.error || !saved.success || events.error) && <p role="alert">Pickup sharing selections could not be loaded. Reload before sharing.</p>}
    {(["Incoming requests", "Outgoing requests", "Accepted connections", "History"] as const).map(section => {
      const items = connections.filter(c => section === "Incoming requests" ? c.status === "pending" && c.incoming : section === "Outgoing requests" ? c.status === "pending" && !c.incoming : section === "Accepted connections" ? c.status === "accepted" : !["pending", "accepted"].includes(c.status));
      return <section key={section} aria-label={section} className="my-8"><h2 className="text-2xl">{section}</h2>{!items.length && <p>No {section.toLowerCase()}.</p>}
        {items.map(c => {
          const values = { householdId: id, connectionId: c.id, revision: String(c.revision) };
          return <article key={c.id} className="my-4 rounded border p-4"><h3 className="text-xl">{c.otherHouseholdName ?? "Household"}</h3>
            <p>Status: {c.status}</p><p>{c.groupName} — requested from {c.eventName}</p>
            {c.status === "pending" && <><p>Request expires {new Intl.DateTimeFormat(undefined, { timeZone: c.eventTimezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(c.expiresAt))} ({c.eventTimezone}).</p>
              {c.incoming ? <><ConnectionForm command="accept" values={values} label="Accept connection"><ContactConsent name={name} email={email} /></ConnectionForm><ConnectionForm command="decline" values={values} label="Decline request" /></> : <ConnectionForm command="withdraw" values={values} label="Withdraw request" />}
            </>}
            {c.status === "accepted" && <>
              <CarpoolForm command="create" values={{ householdId: id, connectionId: c.id, requestId: randomUUID() }} label="Create carpool"><CarpoolConsent /></CarpoolForm>
              <Link className="underline" href={`/households/${id}/carpools`}>Your carpools</Link>
              <h4 className="mt-4 font-semibold">Shared contacts</h4>
              {c.contacts.map(contact => <div key={contact.own ? "own" : "other"} className="my-3"><p>{contact.own ? "Your household" : "Other household"}: {contact.name}</p>
                <a className="underline" href={`mailto:${contact.email}`}>{contact.email}</a>{contact.phone && <p><a className="underline" href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`}>{contact.phone}</a></p>}
                {contact.editable && <ConnectionForm command="contact" values={values} label="Update my shared contact"><ContactConsent name={name} email={email} phone={contact.phone} /></ConnectionForm>}
              </div>)}
              <h4 className="mt-4 font-semibold">Shared pickup addresses</h4>{!c.pickups.length && <p>No pickup addresses are shared.</p>}
              {c.pickups.map(pickup => <div key={pickup.id} className="my-4"><p>{pickup.own ? "Your household" : "Other household"} — {pickup.eventName} — {pickup.leg === "to_event" ? "To event" : "From event"}</p>
                <p>{pickup.label}: {displayAddress(pickup)}</p><p>Sharing ends {new Intl.DateTimeFormat(undefined, { timeZone: pickup.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(pickup.expiresAt))} ({pickup.timezone}).</p>
                {pickup.own && <ConnectionForm command="revoke" values={{ ...values, shareId: pickup.id }} label="Withdraw address sharing" />}
              </div>)}
              {saved.success && !locations.error && !events.error && <details><summary className="cursor-pointer underline">Share a pickup address</summary><SharePickupForm householdId={id} connectionId={c.id} now={Date.now()} locations={saved.data} events={events.data?.filter(e => e.group_id === c.groupId) ?? []} /></details>}
              <Link className="underline" href={`/households/${id}/locations`}>Manage saved addresses</Link>
              <ConnectionForm command="disconnect" values={values} label="Disconnect" confirmation="Disconnect and remove access to shared contacts and pickup addresses?" />
            </>}
          </article>;
        })}
      </section>;
    })}
  </div>;
}
