"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeInvitationCode, type InvitationKind } from "@/lib/invitations/code";
import { captureGroupInvitation } from "@/app/groups/actions";
import { captureHouseholdInvitation } from "@/app/households/actions";
export function JoinForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [kind, setKind] = useState<InvitationKind | "">("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const prepare = useCallback((value: string, selected: InvitationKind | "") => {
    const canonical = normalizeInvitationCode(value);
    if (!canonical || !selected) { setMessage("Choose Household or Group and enter a valid six-character invitation code."); return; }
    startTransition(async () => {
      setMessage("");
      try {
        const bytes = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
        const hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        const result = await (selected === "household" ? captureHouseholdInvitation(hash) : captureGroupInvitation(hash));
        if (!result.ok) { setMessage(result.message); return; }
        setCode(""); router.replace(selected === "household" ? "/household-invitations/accept" : "/group-invitations/accept");
      } catch { setMessage("Unable to open this invitation. Please try again using HTTPS or localhost."); }
    });
  }, [router]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (!fragment) return;
    queueMicrotask(() => {
      const parts = new URLSearchParams(fragment);
      const h = parts.get("h"), g = parts.get("g");
      if (parts.size !== 1 || (h === null && g === null)) { setMessage("Open a valid invitation link or enter your code below."); return; }
      prepare(h ?? g ?? "", h !== null ? "household" : "group");
    });
  }, [prepare]);
  return <div className="mx-auto w-full max-w-xl p-6">{!signedIn && <Link href="/account" className="underline">RallyRoute</Link>}<h1 className="my-6 text-3xl font-semibold">Join with an invitation code</h1>
    <p>Enter the code shared by a household or Group Owner.{!signedIn && " You will sign in before accepting."}</p>
    <form className="my-6 space-y-4" onSubmit={event => { event.preventDefault(); prepare(code, kind); }}><fieldset disabled={pending} className="space-y-4">
      <label className="block">Invitation type<select required value={kind} onChange={event => setKind(event.target.value as InvitationKind)} className="block w-full rounded border p-2"><option value="">Choose a type</option><option value="household">Household</option><option value="group">Group</option></select></label>
      <label className="block">Invitation code<input required maxLength={32} value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={event => setCode(event.target.value)} className="block w-full rounded border p-2 font-mono" /></label>
      <p className="text-sm">Six letters or numbers. Codes exclude O, 0, I, 1, and L. Spaces and hyphens are optional.</p>
      <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{pending ? "Opening…" : "Continue with code"}</button>
    </fieldset></form>{message && <p role="status" aria-live="polite">{message}</p>}
  </div>;
}
