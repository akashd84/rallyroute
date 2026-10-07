"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "./actions";

export function SignOutForm({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className={compact ? "shrink-0" : "mt-6"} action={() => startTransition(async () => {
    try { const result = await signOut(); setMessage(result.message); }
    catch { setMessage("Unable to connect. Please try again."); }
  })}>
    <button type="submit" disabled={pending} className={compact ? "min-h-11 rounded px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" : "rounded-lg bg-teal-800 px-4 py-3 font-medium text-white disabled:opacity-50"}>{pending ? "Signing out…" : "Sign out"}</button>
    {message && <p role="alert" className="mt-3 text-red-800">{message}</p>}
  </form>;
}

export function ProfileRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="underline disabled:opacity-50" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Retrying…" : "Retry loading profile"}</button>;
}
