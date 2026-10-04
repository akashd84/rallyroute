"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdResult } from "@/lib/households/result";

export function WorkflowForm({ command, values = {}, label, confirmation, children, submitAction }: { command: string; values?: Record<string, string>; label: string; confirmation?: string; children?: ReactNode; submitAction: (input: unknown) => Promise<HouseholdResult> }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="my-4 space-y-3" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (confirmation && !window.confirm(confirmation)) return;
    const fields = Object.fromEntries(data.entries());
    if (fields.participantId === "") delete fields.participantId;
    startTransition(async () => {
      setMessage(""); setInvitation(""); setCode("");
      try {
        const result = await submitAction({ ...values, ...fields, command });
        setMessage(result.message);
        if (result.invitationCode) setCode(result.invitationCode);
        if (result.invitationPath) setInvitation(window.location.origin + result.invitationPath);
        if (result.destination) router.push(result.destination);
        else if (result.ok) router.refresh();
      } catch { setMessage("Unable to connect. Please try again."); }
    });
  }}>
    <fieldset disabled={pending} className="space-y-3">{children}
      <button className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50" type="submit">{pending ? "Saving…" : label}</button>
    </fieldset>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {invitation && <div className="space-y-2">{code && <><label className="block">Invitation code<input className="w-full rounded border p-2 font-mono" readOnly value={code} onFocus={event => event.target.select()} /></label><button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(code); setMessage("Invitation code copied."); } catch { setMessage("Select and copy the code above."); } }}>Copy code</button></>}<label className="block">Invitation link<input className="w-full rounded border p-2" readOnly value={invitation} onFocus={event => event.target.select()} /></label>
      <button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(invitation); setMessage("Invitation link copied."); } catch { setMessage("Select and copy the link above."); } }}>Copy invitation link</button>
      <p className="text-sm">Share this link with the intended recipients. Expires in seven days. The code and link are shown only now.</p></div>}
  </form>;
}
