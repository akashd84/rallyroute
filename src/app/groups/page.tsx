import Link from "next/link";
import { accountContext } from "@/lib/households/context";
export const dynamic = "force-dynamic";
export default async function GroupsPage() {
  const { supabase, profileError } = await accountContext();
  const { data: groups, error } = await supabase.from("groups").select("id, name, group_type, description").order("name");
  return <main className="mx-auto w-full max-w-3xl p-6"><Link href="/account" className="underline text-teal-800">Your account</Link>
    <p className="mt-4"><Link href="/join" className="underline">Join with an invitation code</Link></p><h1 className="my-6 text-3xl font-semibold">Your groups</h1>
    {profileError || error ? <p role="alert">Your groups could not be loaded. Reload to try again.</p> : <>
      <ul className="space-y-4">{groups?.map(group => <li key={group.id} className="rounded-xl border p-4"><Link href={`/groups/${group.id}`} className="text-xl font-semibold underline text-teal-800">{group.name}</Link><p className="capitalize">{group.group_type}</p><p>{group.description}</p></li>)}</ul>
      {!groups?.length && <p>You have not joined a group yet.</p>}
      <Link href="/groups/new" className="my-6 inline-block underline">Create a group</Link><p>To join a group, open an invitation from its Group Owner.</p>
    </>}
  </main>;
}
