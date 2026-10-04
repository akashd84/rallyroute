import Link from "next/link";
import { invitationResult, invitationMessage } from "@/lib/invitations/result";
import { cookies } from "next/headers";
import { accountContext } from "@/lib/households/context";
import { inviteCookie } from "@/lib/households/result";
import { HouseholdForm, NameFields } from "@/app/households/forms";
import { SignOutForm } from "@/app/account/sign-out-form";
export const dynamic = "force-dynamic";
export default async function AcceptInvitationPage() {
  const { supabase, user, profile, profileError } = await accountContext();
  const pending = (await cookies()).get(inviteCookie)?.value;
  const preview = pending && /^[a-f0-9]{64}$/.test(pending) ? await supabase.rpc("inspect_invitation", { p_kind: "household", p_token_hash: pending }) : null;
  const outcome = invitationResult(preview?.data);
  return <main className="mx-auto w-full max-w-xl p-6"><Link href="/account" className="text-teal-800">RallyRoute</Link>
    <h1 className="my-6 text-3xl font-semibold">Join a household</h1><p>Signed in as {user.email}. Use the email address invited by the Owner.</p>
    {profileError ? <p role="alert">Your profile could not be loaded. Reload to try again.</p> : !pending ? <p role="alert">Enter your code or open your invitation link again to continue.</p> : outcome.status !== "ok" || preview?.error ? <p role="alert">{invitationMessage(outcome)}</p> : <>
      <p className="mt-4">Accept to join as a Member. You can manage participants, and Owners manage household settings and access.</p>
      <HouseholdForm command="accept" label="Accept invitation"><NameFields firstName={profile?.first_name} lastName={profile?.last_name} /></HouseholdForm>
    </>}<HouseholdForm command="dismiss" label="Dismiss invitation" /><Link href="/onboarding" className="underline">Create a separate household</Link><SignOutForm /></main>;
}
