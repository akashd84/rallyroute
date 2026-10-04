import { randomUUID } from "node:crypto";
import Link from "next/link";
import { accountContext } from "@/lib/households/context";
import { HouseholdForm, NameFields } from "@/app/households/forms";
import { SignOutForm, ProfileRetry } from "@/app/account/sign-out-form";
export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const { supabase, profile, profileError } = await accountContext();
  const { data: existing, error: loadError } = await supabase.from("households").select("id, display_name").is("archived_at", null);
  return <main className="mx-auto w-full max-w-xl p-6 text-slate-900"><Link href="/account" className="font-semibold text-teal-800">RallyRoute</Link>
    <h1 className="mt-6 text-3xl font-semibold">{existing?.length ? "Set up your household" : "Create your household"}</h1>
    {profileError || loadError ? <div role="alert"><p>Your profile could not be loaded.</p><ProfileRetry /></div> : <>
      {Boolean(existing?.length) && <><h2 className="mt-6 text-xl font-semibold">Complete your account details</h2><HouseholdForm command="complete" label="Complete setup"><NameFields firstName={profile?.first_name} lastName={profile?.last_name} /><label className="block">Existing household<select name="householdId" className="block rounded border p-2">{existing?.map(h => <option key={h.id} value={h.id}>{h.display_name}</option>)}</select></label></HouseholdForm><h2 className="mt-6 text-xl font-semibold">Create a separate household</h2></>}
      <p className="my-4">A household brings together the people you arrange transportation for. You will become its Owner.</p>
      <HouseholdForm command="create" values={{ requestId: randomUUID() }} label="Create household">
        <NameFields firstName={profile?.first_name} lastName={profile?.last_name} />
        <label className="block">Household name<input name="displayName" required maxLength={100} className="block w-full rounded border p-2" /></label>
      </HouseholdForm>
      <p>Joining an existing household? Open the invitation link shared by its Owner.</p>
    </>}<SignOutForm /></main>;
}
