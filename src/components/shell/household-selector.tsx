"use client";

import { useState, useTransition } from "react";
import { selectHousehold } from "@/app/households/selection-actions";

export interface HeaderHousehold { id: string; display_name: string | null }

export function HouseholdSelector({ households, selectedId, loadError }: {
  households: HeaderHousehold[];
  selectedId?: string;
  loadError?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (loadError) return <p className="text-center text-sm" role="status">Households unavailable</p>;
  if (!households.length) return <p className="truncate text-center text-sm">No household</p>;
  if (households.length === 1) return <p className="truncate text-center font-semibold" title={households[0].display_name ?? "Household"}>{households[0].display_name ?? "Household"}</p>;
  return <div className="min-w-0">
    <label htmlFor="header-household" className="sr-only">Current household</label>
    <select id="header-household" value={selectedId ?? households[0].id} disabled={pending}
      className="min-h-11 w-full min-w-0 truncate rounded border bg-background px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      onChange={event => {
        const id = event.target.value;
        setMessage("");
        startTransition(async () => {
          try { setMessage((await selectHousehold(id)).message); }
          catch { setMessage("Unable to choose a household. Please try again."); }
        });
      }}>
      {households.map(h => <option key={h.id} value={h.id}>{h.display_name ?? "Household"}</option>)}
    </select>
    {pending && <p role="status" className="sr-only">Switching household…</p>}
    {message && <p role="alert" className="text-sm text-red-800">{message}</p>}
  </div>;
}
