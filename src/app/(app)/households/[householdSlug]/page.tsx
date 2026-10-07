import { ParticipantsSection } from "@/components/households/participants-section";
import { LocationCards } from "@/components/households/location-cards";
import { householdPath } from "@/lib/households/paths";
import Link from "next/link";
import { householdContext } from "@/lib/households/context";
import { HouseholdSelector } from "@/app/households/forms";
export const dynamic = "force-dynamic";
export default async function HouseholdPage({ params }: { params: Promise<{ householdSlug: string }> }) {
  const { householdSlug } = await params;
  const { household, user, supabase, access, participants, loadError } = await householdContext(householdSlug);
  const id = household.id;
  if (!household || loadError) return <div className="p-6"><h1>Household unavailable</h1><p role="alert">You may no longer have access. Return to your account or reload to try again.</p><Link href="/account">Your account</Link></div>;
  const ownRole = access.find(a => a.user_id === user.id)?.role;
  const { data: households } = await supabase.from("households").select("id, slug, display_name").is("archived_at", null).order("created_at");
  return <div className="mx-auto w-full max-w-3xl p-6 text-slate-900"><Link href="/account" className="text-teal-800 underline">Your account</Link>
    <h1 className="my-4 text-3xl font-semibold">{household.display_name ?? "Household"}</h1><p>Your role: {ownRole === "owner" ? "Owner" : ownRole === "admin" ? "Legacy administrator" : "Member"}</p>
    <HouseholdSelector households={households ?? []} selected={id} />
    <nav className="flex gap-4"><Link href={`${householdPath(householdSlug)}/connections`} className="underline">Connections</Link><Link href={`${householdPath(householdSlug)}/carpools`} className="underline">Carpools</Link><Link href="/groups" className="underline">Your groups</Link><a href="#participants" className="underline">Participants</a><Link href={`${householdPath(householdSlug)}/settings`} className="underline">Household settings</Link></nav>
    <LocationCards householdSlug={householdSlug} />
    <ParticipantsSection key={id} householdId={id}>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{participants.map(p => <article key={p.id} className="min-w-0 rounded-xl border p-4">
        <h3 className="break-words font-semibold">{[p.first_name, p.last_name].filter(Boolean).join(" ")}</h3>
        <p className="mt-2 text-sm">{p.member_type === "adult" ? "Adult" : "Child"}</p>
        {p.linked_user_id && <p className="text-sm">Account-linked adult</p>}
      </article>)}</div>
      {!participants.length && <p className="mt-4">No participants yet.</p>}
    </ParticipantsSection>

  </div>;
}
