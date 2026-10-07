"use client";
import { useEffect, useState, useTransition } from "react";
import { householdPath } from "@/lib/households/paths";
import Link from "next/link";
import { ConnectionForm, ContactConsent } from "@/app/households/[id]/connections/forms";
import { findEventMatches } from "./match-actions";
import type { MatchResult, RideLeg } from "@/lib/matching/types";
export function MatchPanel({ eventId, householdId, householdSlug, leg, timezone, readiness, contact, eventName, groupName, householdName, connections = [] }: {
  eventId: string; householdId: string; householdSlug: string; leg: RideLeg; timezone: string;
  householdName?: string; connections?: { otherHouseholdId: string; status: string; incoming: boolean }[];
  contact?: { name: string; email: string }; eventName?: string; groupName?: string;
  readiness: "ready" | "missing" | "reconfirm" | "past";
}) {
  const [result,setResult] = useState<MatchResult>();
  const [pending,startTransition] = useTransition();
  const [retryAt,setRetryAt] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  const title = leg==="to_event" ? "To event matches" : "From event matches";
  const display = (value: string) => new Intl.DateTimeFormat(undefined,{ timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  function find(cursor?: string) {
    if (Date.now()<retryAt) return;
    // Clear earlier cards while checking: failures must never leave stale matches visible.
    setResult(undefined);
    startTransition(async () => {
      try {
        const next = await findEventMatches({ eventId, householdId, householdSlug, leg, ...(cursor ? { cursor } : {}) });
        setResult(next);
        setRetryAt(next.retryAfterSeconds ? Date.now()+next.retryAfterSeconds*1000 : 0);
      } catch { setResult({ status: "unavailable", households: [], complete: false }); }
    });
  }
  return <section aria-label={title} className="my-6 rounded border p-4">
    <h3 className="text-xl">{title}</h3>
    <p>Each suggestion covers one driver and one rider. Seats are not reserved, and separate suggestions do not guarantee transport for everyone.</p>
    {readiness!=="ready" ? <p>{readiness==="reconfirm" ? "Reconfirm your ride preferences before finding matches." : readiness==="past" ? "Matching is unavailable for this ride leg." : "Mark a participant as going and save a ride need or driving offer with an address before finding matches."}</p> :
      <button type="button" disabled={pending || retryAt > 0} className="my-3 rounded bg-teal-800 p-2 text-white disabled:opacity-50" onClick={()=>find()}>{pending ? "Checking matches…" : "Find matches"}</button>}
    <div aria-live="polite" aria-busy={pending}>
      {pending && <p role="status">Checking compatible rides and routes…</p>}
      {result?.status==="invalid_request" && <p role="alert">This search expired or is invalid. Find matches again.</p>}
      {result?.status==="unavailable" && <p role="alert">Matches could not be checked. Reload this event and try again.</p>}
      {result?.status==="ok" && <>
        {!result.complete && <p role="status">Partial results — ranking is provisional. Some candidates have not been verified.</p>}
        {result.complete && !result.households.length && <p role="status">No compatible matches found for this event and ride leg.</p>}
        {result.households.map(h=><article key={h.id} className="my-4 border-t pt-3">
          <h4 className="text-lg">{h.name}</h4>
          <Link className="underline" href={`${householdPath(householdSlug)}/connections`}>View household connections</Link>
          {connections.some(c => c.otherHouseholdId === h.id) && <p>{connections.find(c => c.otherHouseholdId === h.id)?.status === "accepted" ? "Connection accepted" : connections.find(c => c.otherHouseholdId === h.id)?.incoming ? "Incoming connection request — open Connections to accept or decline." : "Connection request pending"}</p>}
          {!connections.some(c => c.otherHouseholdId === h.id) && h.requestProof && contact && <details className="my-3"><summary className="cursor-pointer underline">Request to connect</summary>
            <p>{groupName ?? "This group"} — {eventName ?? "This event"}</p><p>Request a connection between {householdName ?? "your selected household"} and {h.name}.</p>
            <ConnectionForm command="request" values={{ householdId, proof: h.requestProof }} label="Send connection request"><ContactConsent name={contact.name} email={contact.email} /></ConnectionForm>
          </details>}
          {h.opportunities.map(o=><div key={o.id} className="my-3">
            <p>{o.ownMemberName}: {o.ownRole==="driver" ? "Your household drives" : "Other household drives"}</p>
            <p>{leg==="to_event" ? "Arrival" : "Departure"} windows overlap: {display(o.earliest)} – {display(o.latest)} ({timezone})</p>
            <p>{leg==="to_event" ? "Pickup" : "Dropoff"} adds about {Math.ceil(o.addedDurationSeconds/60)} minutes of driving.</p>
          </div>)}
        </article>)}
        {result.retryAfterSeconds && <p>Some checks need another attempt. Wait {result.retryAfterSeconds} seconds before retrying.</p>}
        {result.cursor && <button type="button" disabled={pending || retryAt > 0} className="my-2 rounded border p-2" onClick={()=>find(result.cursor)}>Check more candidates</button>}
        {result.retryAfterSeconds && <button type="button" disabled={pending || retryAt > 0} className="m-2 rounded border p-2" onClick={()=>find()}>Retry matches</button>}
        {result.limitReached && <p>This search reached its limit of 1,000 pairs. Results are partial.</p>}
      </>}
    </div>
    <p className="text-sm">Routing uses OpenStreetMap data. © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p>
  </section>;
}
