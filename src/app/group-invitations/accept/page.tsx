import Link from "next/link";
import { invitationResult, invitationMessage } from "@/lib/invitations/result";
import { cookies } from "next/headers";
import { accountContext } from "@/lib/households/context";
import { eligibleHouseholds } from "@/lib/groups/context";
import { groupInviteCookie } from "@/lib/groups/constants";
import { GroupForm } from "@/app/groups/forms";
import { SignOutForm } from "@/app/account/sign-out-form";
export const dynamic = "force-dynamic";
export default async function AcceptGroupInvitationPage() {
  const context = await accountContext();
  const hash = (await cookies()).get(groupInviteCookie)?.value;
  const preview = hash && /^[a-f0-9]{64}$/.test(hash) ? await context.supabase.rpc("inspect_invitation", { p_kind: "group", p_token_hash: hash }) : null;
  const outcome = invitationResult(preview?.data);
  const group = outcome.status === "ok" ? outcome.group : undefined;
  const { households, error } = await eligibleHouseholds(context);
  const ready = context.profile?.first_name?.trim() && context.profile?.last_name?.trim();
  return <main className="mx-auto w-full max-w-xl p-6"><Link href="/groups" className="underline">Your groups</Link><h1 className="my-6 text-3xl font-semibold">Join a group</h1><p>Signed in as {context.user.email}.</p>
    {context.profileError || error ? <p role="alert">Your account or household details could not be loaded. Reload to try again.</p> : !group || preview?.error ? <p role="alert" className="mt-4">{invitationMessage(outcome)}</p> : <>
      <h2 className="mt-6 text-2xl font-semibold">{group.name}</h2><p className="capitalize">{group.group_type}</p><p>{group.description}</p>
      {households.length && ready ? <GroupForm command="join" label="Join group"><label className="block">Household<select name="householdId" required className="block w-full rounded border p-2"><option value="">Select your household</option>{households.map(h => <option key={h.id} value={h.id}>{h.display_name ?? "Household"}</option>)}</select></label><p>Only the selected household will join this group.</p></GroupForm> : <p className="my-4">Only household Owners can join a household. <Link href="/onboarding" className="underline">Create a household or complete setup</Link>, then return here; your invitation will be preserved. If you are a Member, ask your household Owner.</p>}
    </>}
    <GroupForm command="dismiss" label="Dismiss group invitation" /><SignOutForm />
  </main>;
}
