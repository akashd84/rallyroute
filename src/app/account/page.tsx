import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutForm, ProfileRetry } from "./sign-out-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/sign-in");
  const { data: profile, error } = await supabase.from("profiles").select("id, first_name, last_name").eq("id", user.id).maybeSingle();
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="mb-3 font-semibold text-teal-800">RallyRoute</p>
      <h1 className="text-3xl font-semibold">Your account</h1>
      <p className="mt-4 break-words">Signed in as {user.email}</p>
      {error || !profile ? <div role="alert" className="mt-4 text-red-800"><p>Your profile could not be loaded. Retry, or contact support if this continues.</p><ProfileRetry /></div> : <p className="mt-4 text-slate-600">{profile.first_name ? `Welcome, ${profile.first_name}. ` : "Welcome. "}Household onboarding is coming next.</p>}
      <SignOutForm />
    </section>
  </main>;
}
