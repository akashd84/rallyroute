"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { eventAction } from "./actions";
import { seriesRideAction } from "./series-ride-actions";
export function RideForm({ values, recurring, participantName, children, onSaved, onCancel }: { values: Record<string,string>; recurring: boolean; participantName: string; children: ReactNode; onSaved?: (message: string) => void; onCancel?: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="my-4 space-y-3" onSubmit={event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const input = { ...values, ...fields, command: "ride" };
    startTransition(async () => {
      setMessage("");
      try {
        if (fields.scope === "series") {
          const preview = await seriesRideAction(input);
          if (!preview.ok || !preview.count || !preview.snapshot) { setMessage(preview.message); return; }
          const direction = values.leg === "to_event" ? "To event" : "From event";
          const mode = { need_ride: "Need ride", can_drive: "Can drive", either: "Either", self_transport: "Self transport", none: "None" }[String(fields.mode)];
          if (!window.confirm(`Save ${participantName}’s ${direction} preference (${mode}) for ${preview.count} upcoming occurrences? ${preview.skipped} skipped because attendance is not Going or the ride direction is unavailable. Existing preferences will be replaced. Time windows keep their offset from each event’s arrival or departure time. Existing carpool commitments may be invalidated.`)) return;
          const result = await seriesRideAction({ ...input, expected: preview.snapshot });
          setMessage(result.message);
          if (result.ok) { onSaved?.(result.message); router.refresh(); }
        } else {
          const result = await eventAction(input);
          setMessage(result.message);
          if (result.ok) { onSaved?.(result.message); router.refresh(); }
        }
      } catch { setMessage("Unable to connect. Please try again."); }
    });
  }}>
    <fieldset disabled={pending} className="space-y-3">
      {children}
      {recurring && <><label className="block">Apply to<select name="scope" defaultValue="occurrence" className="block w-full rounded border p-2"><option value="occurrence">This occurrence</option><option value="series">All upcoming occurrences</option></select></label><p className="text-sm">Only upcoming occurrences with Going attendance and this ride direction qualify. Time windows follow each occurrence’s arrival or departure time.</p></>}
      <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving…" : "Save ride preference"}</button>
      {onCancel && <button type="button" className="ml-2 min-h-11 rounded-lg border px-4 py-2" onClick={onCancel}>Cancel</button>}
    </fieldset>
    {message && <p role="status" aria-live="polite">{message}</p>}
  </form>;
}
