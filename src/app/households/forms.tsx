"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { householdAction } from "./actions";

export function HouseholdForm({ command, values = {}, label, confirmation, children }: { command: string; values?: Record<string, string>; label: string; confirmation?: string; children?: ReactNode }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="my-4 space-y-3" action={data => {
    if (confirmation && !window.confirm(confirmation)) return;
    const fields = Object.fromEntries(data.entries());
    if (fields.participantId === "") delete fields.participantId;
    startTransition(async () => {
      setMessage(""); setInvitation("");
      try {
        const result = await householdAction({ ...values, ...fields, command });
        setMessage(result.message);
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
    {invitation && <div className="space-y-2"><label className="block">Invitation link<input className="w-full rounded border p-2" readOnly value={invitation} onFocus={event => event.target.select()} /></label>
      <button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(invitation); setMessage("Invitation link copied."); } catch { setMessage("Select and copy the link above."); } }}>Copy invitation link</button>
      <p className="text-sm">Share with the invited email address. Expires in seven days. The link is shown only now.</p></div>}
  </form>;
}
export function NameFields({ firstName = "", lastName = "", lastNameRequired = true }: { firstName?: string | null; lastName?: string | null; lastNameRequired?: boolean }) {
  return <><label className="block">First name<input name="firstName" required maxLength={100} defaultValue={firstName ?? ""} className="block w-full rounded border p-2" autoComplete="given-name" /></label>
    <label className="block">Last name<input name="lastName" required={lastNameRequired} maxLength={100} defaultValue={lastName ?? ""} className="block w-full rounded border p-2" autoComplete="family-name" /></label>{!lastNameRequired && <p className="text-sm text-slate-600">Last name is optional for transportation participants.</p>}</>;
}
export function HouseholdSelector({ households, selected }: { households: { id: string; display_name: string | null }[]; selected?: string }) {
  const router = useRouter();
  return <label className="block my-4">Household<select aria-label="Household" value={selected ?? ""} onChange={event => { if (event.target.value) router.push(`/households/${event.target.value}`); }} className="ml-3 rounded border p-2">
    <option value="" disabled>Select a household</option>{households.map(h => <option key={h.id} value={h.id}>{h.display_name ?? "Household"}</option>)}
  </select></label>;
}
