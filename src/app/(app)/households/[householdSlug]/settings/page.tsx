import Link from "next/link";
import { householdContext } from "@/lib/households/context";
import { householdPath } from "@/lib/households/paths";
import { HouseholdForm } from "@/app/households/forms";
export const dynamic = "force-dynamic";
export default async function HouseholdSettingsPage({ params }: { params: Promise<{ householdSlug: string }> }) {
  const { householdSlug } = await params;
  const { household, user, access, participants, invitations, loadError } = await householdContext(householdSlug);
  if (loadError) return <div className="p-6"><h1>Household settings</h1><p role="alert">Settings could not be loaded. Reload to try again.</p><Link href={householdPath(householdSlug)}>Your household</Link></div>;
  const ownRole = access.find(a => a.user_id === user.id)?.role;
  const manage = ownRole === "owner" || ownRole === "admin";
  const base = { householdId: household.id };
  return <div className="mx-auto w-full max-w-3xl p-6 text-slate-900">
    <Link className="inline-flex min-h-11 items-center text-teal-800 underline" href={householdPath(householdSlug)}>Your household</Link>
    <h1 className="my-4 text-3xl font-semibold">Household settings</h1>
    <p>{household.display_name ?? "Household"}</p>
    <p>Your role: {ownRole === "owner" ? "Owner" : ownRole === "admin" ? "Legacy administrator" : "Member"}</p>
    <section id="settings" className="mt-8">
      {manage ? <>
        <HouseholdForm command="rename" values={base} label="Save household name"><label>Household name<input name="displayName" required maxLength={100} defaultValue={household.display_name ?? ""} className="block w-full rounded border p-2" /></label></HouseholdForm>
        <h2 className="mt-6 text-xl font-semibold">Invite an account holder</h2><HouseholdForm command="invite" values={base} label="Create invitation">
          <label className="block">Invited email<input name="email" required type="email" maxLength={254} className="block w-full rounded border p-2" /></label>
          <label className="block">Link adult participant<select name="participantId" className="block rounded border p-2"><option value="">Create adult on acceptance</option>{participants.filter(p => p.member_type === "adult" && !p.linked_user_id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
        </HouseholdForm>
        <ul>{invitations.map(inv => <li key={inv.id} className="my-4 rounded border p-3"><p>{inv.invited_email} — {inv.consumed_at ? "Accepted" : inv.revoked_at ? "Revoked" : new Date(inv.expires_at) <= new Date() ? "Expired" : "Pending"}</p>
          {!inv.consumed_at && !inv.revoked_at && <HouseholdForm command="revoke" values={{ ...base, invitationId: inv.id }} label="Revoke invitation" />}
        </li>)}</ul>
      </> : <p className="mt-4">Owners manage household settings, invitations, and account access.</p>}
      <h2 className="mt-6 text-xl font-semibold">Account access</h2><ul>{access.map(a => <li key={a.user_id} className="my-4 border-b py-3">
        <p>{participants.find(p => p.linked_user_id === a.user_id)?.first_name ?? "Account holder"} {a.user_id === user.id && "(you)"} — {a.role === "owner" ? "Owner" : a.role === "admin" ? "Legacy administrator" : "Member"}</p>
        {manage && a.role === "member" && a.user_id !== user.id && <><HouseholdForm command="promote" values={{ ...base, userId: a.user_id }} label="Promote to Owner" />
          <HouseholdForm command="remove" values={{ ...base, userId: a.user_id }} label="Remove Member" confirmation="Remove this Member’s access? Their participant history stays, and future participation will be disabled." /></>}
      </li>)}</ul>
      {ownRole === "owner" && <HouseholdForm command="demote" values={base} label="Step down to Member" confirmation="Step down? If you are the only Owner, the longest-standing Member becomes Owner." />}
      <HouseholdForm command="leave" values={base} label="Leave household" confirmation="Leave this household? Ownership transfers if needed. If you are the last account holder, the household archives. History is preserved." />
    </section>
  </div>;
}
