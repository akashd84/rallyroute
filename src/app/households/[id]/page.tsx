import Link from "next/link";
import { z } from "zod";
import { householdContext } from "@/lib/households/context";
import { HouseholdForm, HouseholdSelector, NameFields } from "../forms";
export const dynamic = "force-dynamic";
export default async function HouseholdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <main className="p-6"><p className="my-4"><Link className="underline" href={`/households/${id}/locations`}>Pickup and dropoff addresses</Link></p><h1>Household unavailable</h1><Link href="/account">Your account</Link></main>;
  const { household, user, supabase, access, participants, invitations, loadError } = await householdContext(id);
  if (!household || loadError) return <main className="p-6"><h1>Household unavailable</h1><p role="alert">You may no longer have access. Return to your account or reload to try again.</p><Link href="/account">Your account</Link></main>;
  const ownRole = access.find(a => a.user_id === user.id)?.role;
  const manage = ownRole === "owner" || ownRole === "admin";
  const { data: households } = await supabase.from("households").select("id, display_name").is("archived_at", null).order("created_at");
  const base = { householdId: id };
  return <main className="mx-auto w-full max-w-3xl p-6 text-slate-900"><Link href="/account" className="text-teal-800 underline">Your account</Link>
    <h1 className="my-4 text-3xl font-semibold">{household.display_name ?? "Household"}</h1><p>Your role: {ownRole === "owner" ? "Owner" : ownRole === "admin" ? "Legacy administrator" : "Member"}</p>
    <HouseholdSelector households={households ?? []} selected={id} />
    <nav className="flex gap-4"><Link href="/groups" className="underline">Your groups</Link><a href="#participants" className="underline">Participants</a><a href="#settings" className="underline">Household settings</a></nav>
    <section id="participants" className="mt-8"><h2 className="text-2xl font-semibold">Participants</h2><p>Participants can be adults or children, with or without accounts.</p>
      {participants.map(p => <article key={p.id} className="my-4 rounded-xl border p-4"><h3 className="font-semibold">{p.first_name} {p.last_name}</h3>
        {p.linked_user_id && <p className="text-sm">Account-linked adult</p>}
        <HouseholdForm command="participant" values={{ ...base, participantId: p.id }} label="Save participant"><NameFields firstName={p.first_name} lastName={p.last_name} lastNameRequired={false} />
          <label className="block">Participant type<select name="memberType" defaultValue={p.member_type} className="ml-3 rounded border p-2"><option value="adult">Adult</option>{!p.linked_user_id && <option value="child">Child</option>}</select></label>
        </HouseholdForm>
        {!p.linked_user_id && <HouseholdForm command="archive" values={{ ...base, participantId: p.id }} label="Remove participant" confirmation="Remove this participant? Their history stays, and future participation will be disabled." />}
      </article>)}
      <h3 className="mt-6 text-xl font-semibold">Add participant</h3><HouseholdForm command="participant" values={base} label="Add participant"><NameFields lastNameRequired={false} />
        <label className="block">Participant type<select name="memberType" className="ml-3 rounded border p-2"><option value="adult">Adult</option><option value="child">Child</option></select></label>
      </HouseholdForm>
    </section>
    <section id="settings" className="mt-8"><h2 className="text-2xl font-semibold">Household settings</h2>
      {manage ? <>
        <HouseholdForm command="rename" values={base} label="Save household name"><label>Household name<input name="displayName" required maxLength={100} defaultValue={household.display_name ?? ""} className="block w-full rounded border p-2" /></label></HouseholdForm>
        <h3 className="mt-6 text-xl font-semibold">Invite an account holder</h3><HouseholdForm command="invite" values={base} label="Create invitation">
          <label className="block">Invited email<input name="email" required type="email" maxLength={254} className="block w-full rounded border p-2" /></label>
          <label className="block">Link adult participant<select name="participantId" className="block rounded border p-2"><option value="">Create adult on acceptance</option>{participants.filter(p => p.member_type === "adult" && !p.linked_user_id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
        </HouseholdForm>
        <ul>{invitations.map(inv => <li key={inv.id} className="my-4 rounded border p-3"><p>{inv.invited_email} — {inv.consumed_at ? "Accepted" : inv.revoked_at ? "Revoked" : new Date(inv.expires_at) <= new Date() ? "Expired" : "Pending"}</p>
          {!inv.consumed_at && !inv.revoked_at && <HouseholdForm command="revoke" values={{ ...base, invitationId: inv.id }} label="Revoke invitation" />}
        </li>)}</ul>
      </> : <p className="mt-4">Owners manage household settings, invitations, and account access.</p>}
      <h3 className="mt-6 text-xl font-semibold">Account access</h3><ul>{access.map(a => <li key={a.user_id} className="my-4 border-b py-3">
        <p>{participants.find(p => p.linked_user_id === a.user_id)?.first_name ?? "Account holder"} {a.user_id === user.id && "(you)"} — {a.role === "owner" ? "Owner" : a.role === "admin" ? "Legacy administrator" : "Member"}</p>
        {manage && a.role === "member" && a.user_id !== user.id && <><HouseholdForm command="promote" values={{ ...base, userId: a.user_id }} label="Promote to Owner" />
          <HouseholdForm command="remove" values={{ ...base, userId: a.user_id }} label="Remove Member" confirmation="Remove this Member’s access? Their participant history stays, and future participation will be disabled." /></>}
      </li>)}</ul>
      {ownRole === "owner" && <HouseholdForm command="demote" values={base} label="Step down to Member" confirmation="Step down? If you are the only Owner, the longest-standing Member becomes Owner." />}
      <HouseholdForm command="leave" values={base} label="Leave household" confirmation="Leave this household? Ownership transfers if needed. If you are the last account holder, the household archives. History is preserved." />
    </section>
  </main>;
}
