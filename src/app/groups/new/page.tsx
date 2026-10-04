import { randomUUID } from "node:crypto";
import Link from "next/link";
import { accountContext } from "@/lib/households/context";
import { eligibleHouseholds } from "@/lib/groups/context";
import { GroupForm, GroupDetailsFields } from "../forms";
export const dynamic = "force-dynamic";
export default async function CreateGroupPage() {
  const context = await accountContext();
  const { households, error } = await eligibleHouseholds(context);
  return <main className="mx-auto w-full max-w-xl p-6"><Link href="/groups" className="underline">Your groups</Link><h1 className="my-6 text-3xl font-semibold">Create a group</h1>
    {context.profileError || error ? <p role="alert">Your household details could not be loaded. Reload to try again.</p> : !context.profile?.first_name?.trim() || !context.profile.last_name?.trim() ? <p>Complete your <Link href="/onboarding" className="underline">household setup</Link> first.</p> : households.length ? <>
      <p>You will become Group Owner, and the selected household will join the group.</p>
      <GroupForm command="create" values={{ requestId: randomUUID() }} label="Create group"><label className="block">Household<select name="householdId" required className="block w-full rounded border p-2"><option value="">Select your household</option>{households.map(h => <option key={h.id} value={h.id}>{h.display_name ?? "Household"}</option>)}</select></label><GroupDetailsFields /></GroupForm>
    </> : <p>Only household Owners can create a group. <Link href="/onboarding" className="underline">Create a household</Link>, or ask your household Owner.</p>}
  </main>;
}
