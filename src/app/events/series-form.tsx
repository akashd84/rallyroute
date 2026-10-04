"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { expandRecurrence, type Recurrence } from "@/lib/events/recurrence";
import { seriesAction } from "./series-actions";
import { TimezoneField } from "./timezone-field";
export function SeriesForm({
  groupId,
  requestId,
  destinations,
  replaceEventId,
  seriesRevision,
  replacementCount,
  startDate,
  initial,
}: {
  groupId: string;
  requestId: string;
  destinations: { id: string; name: string }[];
  replaceEventId?: string;
  seriesRevision?: number;
  replacementCount?: number;
  startDate?: string;
  initial?: Partial<Recurrence> & { name?: string; locationId?: string };
}) {
  const [preview, setPreview] = useState<ReturnType<
    typeof expandRecurrence
  > | null>(null);
  const [payload, setPayload] =
    useState<Parameters<typeof seriesAction>[0]>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="my-4 space-y-3"
      onChange={() => {
        setPreview(null);
        setPayload(null);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        try {
          if (fields.get("timezoneConfirmed") !== "on")
            throw new Error("Confirm the timezone.");
          const spec = {
            frequency: fields.get("frequency"),
            interval: fields.get("interval"),
            startDate: fields.get("startDate"),
            endDate: fields.get("endDate"),
            weekdays: fields.getAll("weekdays"),
            monthlyMode: fields.get("monthlyMode"),
            monthDay: fields.get("monthDay"),
            ordinal: fields.get("ordinal"),
            weekday: fields.get("weekday"),
            timezone: fields.get("timezone"),
            arrivalTime: fields.get("arrivalTime") || undefined,
            departureTime: fields.get("departureTime") || undefined,
            departureNextDay: fields.get("departureNextDay") === "on",
          };
          const result = expandRecurrence(spec);
          setPreview(result);
          setPayload({
            groupId,
            requestId,
            name: fields.get("name"),
            locationId: fields.get("locationId"),
            spec,
            replaceEventId,
            seriesRevision,
          });
          setMessage("");
        } catch (err) {
          setMessage(
            err instanceof Error && !("issues" in err)
              ? err.message
              : "Check dates, anchors, selected weekdays, and the 366-date limit.",
          );
          setPreview(null);
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        <label className="block">
          Series name
          <input
            className="block w-full rounded border p-2"
            name="name"
            required
            maxLength={100}
            defaultValue={initial?.name}
          />
        </label>
        <label className="block">
          Destination
          <select
            name="locationId"
            required
            defaultValue={initial?.locationId}
            className="block w-full rounded border p-2"
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <TimezoneField timezone={initial?.timezone} />
        <label className="block">
          Start date
          <input
            className="block rounded border p-2"
            type="date"
            name="startDate"
            required
            readOnly={Boolean(startDate)}
            defaultValue={startDate ?? initial?.startDate}
          />
        </label>
        <label className="block">
          End date
          <input
            className="block rounded border p-2"
            type="date"
            name="endDate"
            required
            defaultValue={initial?.endDate}
          />
        </label>
        <label className="block">
          Frequency
          <select
            name="frequency"
            defaultValue={initial?.frequency ?? "weekly"}
            className="block rounded border p-2"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="block">
          Interval
          <input
            className="block rounded border p-2"
            name="interval"
            type="number"
            min={1}
            max={366}
            required
            defaultValue={initial?.interval ?? 1}
          />
        </label>
        <fieldset>
          <legend>Weekly weekdays</legend>
          {["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((day) => (
            <label key={day} className="mr-3">
              <input
                type="checkbox"
                name="weekdays"
                value={day}
                defaultChecked={initial?.weekdays?.includes(day as "MO")}
              />{" "}
              {day}
            </label>
          ))}
        </fieldset>
        <label className="block">
          Monthly pattern
          <select
            name="monthlyMode"
            defaultValue={initial?.monthlyMode ?? "day"}
            className="block rounded border p-2"
          >
            <option value="day">Calendar day</option>
            <option value="weekday">Ordinal weekday</option>
          </select>
        </label>
        <label className="block">
          Calendar day
          <input
            name="monthDay"
            className="block rounded border p-2"
            type="number"
            min={1}
            max={31}
            defaultValue={initial?.monthDay ?? 1}
          />
        </label>
        <label className="block">
          Ordinal
          <select
            name="ordinal"
            defaultValue={initial?.ordinal ?? 1}
            className="block rounded border p-2"
          >
            {[
              [1, "First"],
              [2, "Second"],
              [3, "Third"],
              [4, "Fourth"],
              [5, "Fifth"],
              [-1, "Last"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Monthly weekday
          <select
            name="weekday"
            defaultValue={initial?.weekday ?? "MO"}
            className="block rounded border p-2"
          >
            {["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Arrive by
          <input
            name="arrivalTime"
            className="block rounded border p-2"
            type="time"
            defaultValue={initial?.arrivalTime}
          />
        </label>
        <label className="block">
          Ready to leave
          <input
            name="departureTime"
            className="block rounded border p-2"
            type="time"
            defaultValue={initial?.departureTime}
          />
        </label>
        <label className="block">
          <input
            name="departureNextDay"
            type="checkbox"
            defaultChecked={initial?.departureNextDay}
          />{" "}
          Ready to leave is on the next day
        </label>
        <p>
          Dates without the selected monthly day or fifth weekday are skipped.
          Limit: 366 calendar dates and occurrences.
        </p>
        <button className="rounded bg-teal-800 p-2 text-white">
          Preview occurrences
        </button>
      </fieldset>
      {preview && (
        <section>
          <h3 className="text-xl">{preview.occurrences.length} occurrences</h3>
          {replaceEventId && (
            <p role="alert">
              {replacementCount} existing events will be cancelled and replaced.
              Households must enter attendance and ride preferences again.
            </p>
          )}
          <ul className="max-h-72 overflow-y-auto">
            {preview.occurrences.map((o) => (
              <li key={o.original_local_date}>
                {o.original_local_date} —{" "}
                {o.required_arrival_at ?? "No arrival"} /{" "}
                {o.ready_to_depart_at ?? "No departure"}
                {o.notices.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </li>
            ))}
            {preview.skipped.map((s) => (
              <li key={s}>Skipped: {s}</li>
            ))}
          </ul>
          <button
            className="my-4 rounded bg-teal-800 p-2 text-white"
            disabled={pending}
            type="button"
            onClick={() => {
              if (
                replaceEventId &&
                !window.confirm(
                  `Replace ${replacementCount} future events? Existing attendance and rides will not migrate.`,
                )
              )
                return;
              startTransition(async () => {
                try {
                  const result = await seriesAction(payload);
                  setMessage(result.message);
                  if (result.destination) router.push(result.destination);
                } catch {
                  setMessage("Unable to connect. Please try again.");
                }
              });
            }}
          >
            {pending
              ? "Saving…"
              : replaceEventId
                ? "Replace this and future occurrences"
                : "Create series"}
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
