import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupForm } from "@/app/groups/forms";
import { groupContext } from "@/lib/groups/context";
import { groupPath } from "@/lib/groups/paths";

export async function GroupInvitationPage({ slug, kind }: { slug: string; kind: "invite" | "share" }) {
  const { group, supabase, user } = await groupContext(slug);
  const { data: admins, error: adminError } = await supabase.from("group_admins").select("role")
    .eq("group_id", group.id).eq("user_id", user.id);
  if (adminError || !admins?.some(admin => admin.role === "owner" || admin.role === "admin")) notFound();
  const direct = kind === "invite";
  const { data: invitations, error } = await supabase.from("group_invitations")
    .select("id, invite_type, invited_email, status, use_count, max_uses, expires_at")
    .eq("group_id", group.id).eq("invite_type", direct ? "direct" : "group_link")
    .order("created_at", { ascending: false });

  return <div className="mx-auto w-full max-w-3xl p-6">
    <Link href={groupPath(group.slug)} className="inline-flex min-h-11 items-center underline text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Back to {group.name}</Link>
    <h1 className="my-6 text-3xl font-semibold">{direct ? "Invite to group" : "Share group"}</h1>
    <p>{group.name}</p>
    {direct ? <GroupForm command="invite-direct" values={{ groupId: group.id }} label="Create direct invitation">
      <label className="block">Invited email<input name="email" type="email" required maxLength={254} className="block w-full rounded border p-2" /></label>
    </GroupForm> : <GroupForm command="invite-link" values={{ groupId: group.id }} label="Create reusable link">
      <label className="block">Household use limit<input name="maxUses" type="number" min={1} max={2147483647} step={1} className="block w-full rounded border p-2" /></label>
      <p className="text-sm">Leave blank for unlimited households. Links expire after seven days.</p>
    </GroupForm>}
    <h2 className="mt-8 text-2xl font-semibold">{direct ? "Direct invitations" : "Reusable group links"}</h2>
    {error ? <p role="alert">Invitations could not be loaded. Reload to try again.</p> : <>
      {!invitations?.length && <p className="mt-4">{direct ? "No direct invitations yet." : "No reusable group links yet."}</p>}
      <ul>{invitations?.map(inv => <li key={inv.id} className="my-4 rounded border p-4">
        <p>{direct ? inv.invited_email : "Reusable link"} — {inv.status === "active" && inv.expires_at && new Date(inv.expires_at) <= new Date() ? "Expired" : inv.status}</p>
        <p>{inv.use_count} / {inv.max_uses ?? "unlimited"} household uses</p>
        {inv.expires_at && <p>Expires {new Date(inv.expires_at).toISOString().slice(0, 10)}</p>}
        {inv.status === "active" && <GroupForm command="revoke" values={{ groupId: group.id, invitationId: inv.id }} label="Revoke group invitation" confirmation="Revoke this invitation? Existing group memberships will remain." />}
      </li>)}</ul>
    </>}
  </div>;
}
