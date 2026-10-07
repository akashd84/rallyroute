import Link from "next/link";
import { groupPath } from "@/lib/groups/paths";
import { accountContext } from "@/lib/households/context";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

type GroupSummary = Pick<Database["public"]["Tables"]["groups"]["Row"],
  "id" | "slug" | "name" | "group_type" | "description">;

function GroupSection({ id, title, groups, emptyMessage }: {
  id: string;
  title: string;
  groups: GroupSummary[];
  emptyMessage: string;
}) {
  return <section aria-labelledby={id} className="space-y-4">
    <h2 id={id} className="text-xl font-semibold">{title}</h2>
    {groups.length ? <ul className="space-y-4">{groups.map(group =>
      <li key={group.id} className="rounded-xl border p-4">
        <Link href={groupPath(group.slug)} className="text-xl font-semibold underline text-teal-800">{group.name}</Link>
        <p className="capitalize">{group.group_type}</p>
        <p>{group.description}</p>
      </li>
    )}</ul> : <p>{emptyMessage}</p>}
  </section>;
}

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const { supabase, user, profileError } = await accountContext();
  const [groups, roles] = await Promise.all([
    supabase.from("groups").select("id, slug, name, group_type, description").order("name"),
    supabase.from("group_admins").select("group_id").eq("user_id", user.id).in("role", ["owner", "admin"]),
  ]);
  const managedIds = new Set(roles.data?.map(role => role.group_id));
  // RLS limits visible groups to household membership or group administration.
  const managed = groups.data?.filter(group => managedIds.has(group.id)) ?? [];
  const joined = groups.data?.filter(group => !managedIds.has(group.id)) ?? [];

  return <div className="mx-auto w-full max-w-3xl p-6">
    {notice === "group-link" && <p role="status">Your change was saved, but the group link could not be loaded. Reload your groups to continue.</p>}
    {profileError || groups.error || roles.error ?
      <p role="alert">Your groups could not be loaded. Reload to try again.</p> : <>
        <div className="space-y-8">
          <GroupSection id="managed-groups" title="Groups I Manage" groups={managed} emptyMessage="You do not manage any groups yet." />
          <GroupSection id="joined-groups" title="Groups I'm In" groups={joined} emptyMessage="You have not joined any other groups yet." />
        </div>
        <div className="my-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/groups/new" className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2">Create a group</Link>
          <Link href="/join" className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2">Join By Invite Code</Link>
        </div>
      </>}
  </div>;
}
