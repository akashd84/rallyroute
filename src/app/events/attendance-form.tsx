"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eventAction } from "./actions";
import { seriesAttendanceAction } from "./attendance-actions";

export function AttendanceForm({ values, status, recurring, participantName, onSaved, onCancel }: { values: Record<string, string>; status: string; recurring: boolean; participantName: string; onSaved?: (message: string, status: string) => void; onCancel?: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="my-4 space-y-3" onSubmit={event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    startTransition(async () => {
      setMessage("");
      try {
        const input = { ...values, status: fields.status };
        if (fields.scope === "series") {
          const preview = await seriesAttendanceAction(input);
          if (!preview.ok || !preview.count || !preview.snapshot) { setMessage(preview.message); return; }
          const label = fields.status === "going" ? "Going" : fields.status === "not_going" ? "Not going" : "Unknown";
          if (!window.confirm(`Set ${participantName} to ${label} for ${preview.count} upcoming occurrences? Existing attendance choices will be replaced.${fields.status !== "going" ? " Ride preferences and carpool commitments may be invalidated." : " Previously disabled rides will not be restored."}`)) return;
          const result = await seriesAttendanceAction({ ...input, expected: preview.snapshot });
          setMessage(result.message);
          if (result.ok) { onSaved?.(result.message, String(fields.status)); router.refresh(); }
        } else {
          const result = await eventAction({ ...input, command: "attendance" });
          setMessage(result.message);
          if (result.ok) { onSaved?.(result.message, String(fields.status)); router.refresh(); }
        }
      } catch { setMessage("Unable to connect. Please try again."); }
    });
  }}>
    <fieldset disabled={pending} className="space-y-3">
      <label className="block">Attendance<select name="status" defaultValue={status} className="block w-full rounded border p-2"><option value="unknown">Unknown</option><option value="going">Going</option><option value="not_going">Not going</option></select></label>
      {recurring && <label className="block">Apply to<select name="scope" defaultValue="occurrence" className="block w-full rounded border p-2"><option value="occurrence">This occurrence</option><option value="series">All upcoming occurrences</option></select></label>}
      <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving…" : "Save attendance"}</button>
      {onCancel && <button type="button" className="ml-2 min-h-11 rounded-lg border px-4 py-2" onClick={onCancel}>Cancel</button>}
    </fieldset>
    {message && <p role="status" aria-live="polite">{message}</p>}
  </form>;
}
