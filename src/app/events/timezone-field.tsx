"use client";
import { useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const readTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "";
export function TimezoneField({ timezone }: { timezone?: string }) {
  const browserTimezone = useSyncExternalStore(
    subscribe,
    readTimezone,
    serverTimezone,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const value = edited ?? timezone ?? browserTimezone;
  return (
    <>
      <label className="block">
        Event timezone
        <input
          name="timezone"
          required
          value={value}
          onChange={(e) => setEdited(e.target.value)}
          className="block w-full rounded border p-2"
        />
      </label>
      <label className="block">
        <input name="timezoneConfirmed" type="checkbox" required /> I confirm
        dates and times use {value || "the selected timezone"}.
      </label>
    </>
  );
}
