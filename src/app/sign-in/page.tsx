import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/account");
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="mb-3 font-semibold text-teal-800">RallyRoute</p>
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="mt-3 text-slate-600">Use your email to sign in or create an account. RallyRoute accounts are for adults.</p>
      {error === "sign-out" && <p role="alert" className="mt-4 text-sm text-red-800">Could not confirm sign-out with the server. Your local session has been cleared. You can sign in again.</p>}
      <SignInForm /><Link href="/join" className="mt-4 inline-block underline">Join with an invitation code</Link>
    </section>
  </main>;
}
