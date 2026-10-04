import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountContext } from "@/lib/households/context";
import { groupInviteCookie } from "@/lib/groups/constants";
import { inviteCookie } from "@/lib/households/result";
import { HouseholdSelector } from "@/app/households/forms";
import { SignOutForm, ProfileRetry } from "./sign-out-form";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const { supabase, user, profile, profileError } = await accountContext();
  if (!profileError && (await cookies()).get(inviteCookie)) redirect("/household-invitations/accept");
  if (!profileError && (await cookies()).get(groupInviteCookie)) redirect("/group-invitations/accept");
  const [houses, linked] = await Promise.all([
    supabase.from("households").select("id, display_name").is("archived_at", null).order("created_at"),
    supabase.from("household_members").select("id, household_id").eq("linked_user_id", user.id).is("archived_at", null),
  ]);
  const loadError = Boolean(houses.error || linked.error);
  if (!profileError && !loadError && (!profile?.first_name?.trim() || !profile?.last_name?.trim() || !houses.data?.length || !linked.data?.length)) redirect("/onboarding");
  return <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-900"><p className="font-semibold text-teal-800">RallyRoute</p>
    <p className="mt-4"><Link href="/join" className="underline">Join with an invitation code</Link></p><h1 className="mt-3 text-3xl font-semibold">Your account</h1><p className="mt-4">Signed in as {user.email}</p>
    {profileError || loadError ? <div role="alert" className="mt-4"><p>Your profile could not be loaded. Retry, or contact support if this continues.</p><ProfileRetry /></div> : <>
      <Link href="/groups" className="mt-6 inline-block underline text-teal-800">Your groups</Link>
      <h2 className="mt-6 text-xl font-semibold">Your households</h2><HouseholdSelector households={houses.data ?? []} />
      <ul className="space-y-3">{houses.data?.map(h => <li key={h.id}><Link href={`/households/${h.id}`} className="underline text-teal-800">{h.display_name ?? "Household"}</Link></li>)}</ul>
      <Link href="/onboarding" className="mt-6 inline-block underline">Create another household</Link>
      <p className="mt-4">To join another household, open an invitation from its Owner.</p>
    </>}<SignOutForm /></main>;
}
