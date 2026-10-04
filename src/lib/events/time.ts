import { Temporal } from "@js-temporal/polyfill";

export function localInstant(
  date: string,
  time: string,
  timezone: string,
): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function displayTime(instant: string | null, timezone: string): string {
  if (!instant) return "Not configured";
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(instant));
}
export function localInput(instant: string | null, timezone: string): string {
  if (!instant) return "";
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
