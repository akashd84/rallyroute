"use client";
import { useState } from "react";
export function RideFields({
  adult,
  initialMode,
  locationId,
  locations,
  earliest,
  latest,
  timezone,
  seats,
  detour,
}: {
  adult: boolean;
  initialMode?: string;
  locationId?: string | null;
  locations: { id: string; label: string }[];
  earliest: string;
  latest: string;
  timezone: string;
  seats?: number | null;
  detour?: number | null;
}) {
  const [mode, setMode] = useState(initialMode ?? "");
  const active = ["need_ride", "can_drive", "either"].includes(mode);
  const driver = ["can_drive", "either"].includes(mode);
  return (
    <>
      <label className="block">
        Ride mode
        <select
          className="block w-full rounded border p-2"
          name="mode"
          required
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="">Select mode</option>
          <option value="need_ride">Need ride</option>
          {adult && (
            <>
              <option value="can_drive">Can drive</option>
              <option value="either">Either</option>
            </>
          )}
          <option value="self_transport">Self transport</option>
          <option value="none">None</option>
        </select>
      </label>
      {active && (
        <>
          <label className="block">
            Pickup / dropoff address
            <select
              name="locationId"
              required
              defaultValue={locationId ?? ""}
              className="block w-full rounded border p-2"
            >
              <option value="">Select address</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Earliest ({timezone})
            <input
              className="block w-full rounded border p-2"
              type="datetime-local"
              name="earliestLocal"
              required
              defaultValue={earliest}
            />
          </label>
          <label className="block">
            Latest ({timezone})
            <input
              className="block w-full rounded border p-2"
              type="datetime-local"
              name="latestLocal"
              required
              defaultValue={latest}
            />
          </label>
        </>
      )}
      {driver && (
        <>
          <label className="block">
            Additional rider seats
            <input
              className="block w-full rounded border p-2"
              type="number"
              name="seats"
              min={1}
              max={20}
              required
              defaultValue={seats ?? 1}
            />
          </label>
          <label className="block">
            Maximum detour minutes
            <input
              className="block w-full rounded border p-2"
              type="number"
              name="detour"
              min={0}
              max={120}
              required
              defaultValue={detour ?? 10}
            />
          </label>
        </>
      )}
      <p>
        Saving explicitly confirms this preference. Self transport and None
        require no address, window, or driver fields.
      </p>
    </>
  );
}
