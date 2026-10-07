import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupForm, GroupDetailsFields } from "@/app/groups/forms";
import { groupContext } from "@/lib/groups/context";
import { groupPath } from "@/lib/groups/paths";

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { group, supabase, user } = await groupContext(slug);
  const { data: admins, error } = await supabase.from("group_admins").select("role")
    .eq("group_id", group.id).eq("user_id", user.id);
  if (error || !admins?.some(admin => admin.role === "owner" || admin.role === "admin")) notFound();

  return <div className="mx-auto w-full max-w-3xl p-6">
    <Link href={groupPath(group.slug)} className="inline-flex min-h-11 items-center text-teal-800 underline focus-visible:outline-2 focus-visible:outline-offset-4">Back to {group.name}</Link>
    <h1 className="my-6 text-3xl font-semibold">Group settings</h1>
    <GroupForm command="settings" values={{ groupId: group.id }} label="Save group settings">
      <GroupDetailsFields name={group.name} groupType={group.group_type} description={group.description} />
    </GroupForm>
  </div>;
}
