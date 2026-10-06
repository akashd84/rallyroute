import Link from "next/link";
import { z } from "zod";
import { accountContext } from "@/lib/households/context";
import { GroupForm, GroupDetailsFields } from "@/app/groups/forms";
export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await accountContext();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <div className="p-6"><h1>Group unavailable</h1><Link href="/groups">Your groups</Link></div>;
  const { data: group, error } = await context.supabase.from("groups").select("id, name, group_type, description").eq("id", id).maybeSingle();
  if (context.profileError || error || !group) return <div className="p-6"><h1>Group unavailable</h1><p role="alert">You may not have access, or the group could not be loaded.</p><Link href="/groups">Your groups</Link></div>;
  const [admins, memberships, houses] = await Promise.all([
    context.supabase.from("group_admins").select("role").eq("group_id", id).eq("user_id", context.user.id),
    context.supabase.from("group_memberships").select("household_id").eq("group_id", id).eq("status", "active"),
    context.supabase.from("households").select("id, display_name").is("archived_at", null),
  ]);
  const role = admins.data?.[0]?.role;
  // Households are fetched through their own RLS; never render other households' IDs/names.
  const ownHouses = houses.data?.filter(h => memberships.data?.some(m => m.household_id === h.id)) ?? [];
  const { data: invitations, error: inviteError } = role ? await context.supabase.from("group_invitations").select("id, invite_type, invited_email, status, use_count, max_uses, expires_at").eq("group_id", id).order("created_at", { ascending: false }) : { data: [], error: null };
  const loadError = admins.error || memberships.error || houses.error || inviteError;
  return <div className="mx-auto w-full max-w-3xl p-6"><Link href="/groups" className="underline text-teal-800">Your groups</Link>
    <p className="mt-4"><Link className="underline" href={`/groups/${id}/events`}>Events and destinations</Link></p><h1 className="my-6 text-3xl font-semibold">{group.name}</h1><p className="capitalize">{group.group_type}</p><p className="my-3">{group.description}</p><p>Your group role: {role === "owner" ? "Group Owner" : role ? "Group Admin" : "Group Member"}</p>
    {loadError ? <p role="alert" className="mt-4">Group details could not be loaded. Reload to try again.</p> : <>
      <h2 className="mt-6 text-xl font-semibold">Your participating households</h2><ul>{ownHouses.map(h => <li key={h.id}><Link href={`/households/${h.id}`} className="underline">{h.display_name ?? "Household"}</Link></li>)}</ul>
      {!ownHouses.length && <p>You administer this group independently of household membership.</p>}
      {role ? <section className="mt-8"><h2 className="text-2xl font-semibold">Group settings</h2><GroupForm command="settings" values={{ groupId: id }} label="Save group settings"><GroupDetailsFields name={group.name} groupType={group.group_type} description={group.description} /></GroupForm>
        <h2 className="mt-8 text-2xl font-semibold">Invitations</h2><h3 className="mt-4 text-xl">Direct invitation</h3><GroupForm command="invite-direct" values={{ groupId: id }} label="Create direct invitation"><label className="block">Invited email<input name="email" type="email" required maxLength={254} className="block w-full rounded border p-2" /></label></GroupForm>
        <h3 className="mt-6 text-xl">Reusable group link</h3><GroupForm command="invite-link" values={{ groupId: id }} label="Create reusable link"><label className="block">Household use limit<input name="maxUses" type="number" min={1} max={2147483647} step={1} className="block w-full rounded border p-2" /></label><p className="text-sm">Leave blank for unlimited households. Links expire after seven days.</p></GroupForm>
        <ul>{invitations?.map(inv => <li key={inv.id} className="my-4 rounded border p-4"><p>{inv.invite_type === "direct" ? inv.invited_email : "Reusable link"} — {inv.status === "active" && inv.expires_at && new Date(inv.expires_at) <= new Date() ? "Expired" : inv.status}</p><p>{inv.use_count} / {inv.max_uses ?? "unlimited"} household uses</p>{inv.expires_at && <p>Expires {new Date(inv.expires_at).toISOString().slice(0, 10)}</p>}
          {inv.status === "active" && <GroupForm command="revoke" values={{ groupId: id, invitationId: inv.id }} label="Revoke group invitation" confirmation="Revoke this invitation? Existing group memberships will remain." />}
        </li>)}</ul>
      </section> : <p className="mt-6">Group Owners manage settings and invitations. Household ownership does not grant group administration.</p>}
    </>}
  </div>;
}
