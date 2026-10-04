import { Temporal } from "@js-temporal/polyfill";
import { RRule } from "rrule";
import { z } from "zod";

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const recurrenceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    interval: z.coerce.number().int().min(1).max(366).default(1),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    weekdays: z.array(z.enum(weekdays)).default([]),
    monthlyMode: z.enum(["day", "weekday"]).default("day"),
    monthDay: z.coerce.number().int().min(1).max(31).default(1),
    ordinal: z.coerce
      .number()
      .int()
      .refine((n) => [-1, 1, 2, 3, 4, 5].includes(n))
      .default(1),
    weekday: z.enum(weekdays).default("MO"),
    timezone: z.string().min(1).max(100),
    arrivalTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    departureTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    departureNextDay: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.arrivalTime && !v.departureTime)
      ctx.addIssue({
        code: "custom",
        message: "Configure at least one transportation anchor.",
      });
    if (v.frequency === "weekly" && !v.weekdays.length)
      ctx.addIssue({ code: "custom", message: "Select a weekday." });
    try {
      const days = Temporal.PlainDate.from(v.startDate).until(
        Temporal.PlainDate.from(v.endDate),
      ).days;
      if (days < 0 || days > 365)
        ctx.addIssue({
          code: "custom",
          message: "Select an inclusive range of at most 366 dates.",
        });
      Temporal.Now.instant().toZonedDateTimeISO(v.timezone);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Use valid calendar dates and an IANA timezone.",
      });
    }
  });
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Occurrence = {
  original_local_date: string;
  required_arrival_at: string | null;
  ready_to_depart_at: string | null;
  notices: string[];
};

export function expandRecurrence(input: unknown): {
  rule: string;
  occurrences: Occurrence[];
  skipped: string[];
} {
  const v = recurrenceSchema.parse(input);
  const byweekday =
    v.frequency === "weekly"
      ? v.weekdays.map((day) => RRule[day])
      : v.frequency === "monthly" && v.monthlyMode === "weekday"
        ? [RRule[v.weekday].nth(v.ordinal)]
        : undefined;
  const rule = new RRule({
    freq:
      v.frequency === "daily"
        ? RRule.DAILY
        : v.frequency === "weekly"
          ? RRule.WEEKLY
          : RRule.MONTHLY,
    interval: v.interval,
    dtstart: new Date(`${v.startDate}T00:00:00Z`),
    until: new Date(`${v.endDate}T23:59:59Z`),
    byweekday,
    bymonthday:
      v.frequency === "monthly" && v.monthlyMode === "day"
        ? v.monthDay
        : undefined,
  });
  const skipped: string[] = [];
  const occurrences: Occurrence[] = [];
  for (const day of rule.all()) {
    const date = day.toISOString().slice(0, 10);
    const notices: string[] = [];
    let nonexistent = false;
    const convert = (localDate: string, time?: string): string | null => {
      if (!time) return null;
      const wall = Temporal.PlainDateTime.from(`${localDate}T${time}`);
      const earlier = wall.toZonedDateTime(v.timezone, {
        disambiguation: "earlier",
      });
      const later = wall.toZonedDateTime(v.timezone, {
        disambiguation: "later",
      });
      if (!earlier.toPlainDateTime().equals(wall)) {
        nonexistent = true;
        return null;
      }
      if (earlier.epochNanoseconds !== later.epochNanoseconds)
        notices.push("Repeated clock time: using the earlier occurrence.");
      return earlier.toInstant().toString();
    };
    const arrival = convert(date, v.arrivalTime);
    const departure = convert(
      v.departureNextDay
        ? Temporal.PlainDate.from(date).add({ days: 1 }).toString()
        : date,
      v.departureTime,
    );
    if (nonexistent) {
      skipped.push(`${date}: nonexistent clock time`);
      continue;
    }
    if (
      arrival &&
      departure &&
      Temporal.Instant.compare(arrival, departure) >= 0
    )
      throw new Error("Ready to leave must follow Arrive by.");
    occurrences.push({
      original_local_date: date,
      required_arrival_at: arrival,
      ready_to_depart_at: departure,
      notices,
    });
  }
  if (!occurrences.length || occurrences.length > 366)
    throw new Error("Select a range generating between 1 and 366 occurrences.");
  return { rule: rule.toString().split("RRULE:")[1], occurrences, skipped };
}
