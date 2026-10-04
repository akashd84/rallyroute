import { z } from "zod";
const id = z.string().uuid();
const revision = z.coerce.number().int().positive();
const address = {
  name: z.string().trim().min(1).max(100),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(100),
  stateRegion: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(30),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
};
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  id.optional(),
);
const optionalRevision = z.preprocess(
  (v) => (v === "" ? undefined : v),
  revision.optional(),
);
export const eventSchema = z
  .discriminatedUnion("command", [
    z.object({
      command: z.literal("destination-save"),
      groupId: id,
      locationId: optionalId,
      revision: optionalRevision,
      ...address,
    }),
    z.object({
      command: z.literal("destination-archive"),
      groupId: id,
      locationId: id,
      revision,
    }),
    z.object({
      command: z.literal("location-save"),
      householdId: id,
      locationId: optionalId,
      revision: optionalRevision,
      ...address,
    }),
    z.object({
      command: z.literal("location-archive"),
      householdId: id,
      locationId: id,
      revision,
    }),
    z.object({
      command: z.literal("event-save"),
      groupId: id,
      eventId: optionalId,
      requestId: optionalId,
      revision: optionalRevision,
      name: z.string().trim().min(1).max(100),
      locationId: id,
      timezone: z.string().min(1).max(100),
      timezoneConfirmed: z.literal("on"),
      arrivalLocal: z.string().default(""),
      departureLocal: z.string().default(""),
      activityStartLocal: z.string().default(""),
      activityEndLocal: z.string().default(""),
    }),
    z.object({
      command: z.literal("event-cancel"),
      groupId: id,
      eventId: id,
      revision,
    }),
    z.object({
      command: z.literal("attendance"),
      householdId: id,
      eventId: id,
      memberId: id,
      revision,
      status: z.enum(["unknown", "going", "not_going"]),
    }),
    z.object({
      command: z.literal("ride"),
      householdId: id,
      eventId: id,
      memberId: id,
      revision,
      leg: z.enum(["to_event", "from_event"]),
      mode: z.enum([
        "need_ride",
        "can_drive",
        "either",
        "self_transport",
        "none",
      ]),
      locationId: z.string().default(""),
      timezone: z.string().min(1),
      earliestLocal: z.string().default(""),
      latestLocal: z.string().default(""),
      seats: z.coerce.number().int().min(1).max(20).optional(),
      detour: z.coerce.number().int().min(0).max(120).optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      "locationId" in value &&
      ["location-save", "destination-save"].includes(value.command) &&
      value.locationId &&
      !("revision" in value && value.revision)
    )
      ctx.addIssue({ code: "custom", message: "Revision required for edits." });
    if (
      value.command === "event-save" &&
      (value.eventId ? !value.revision : !value.requestId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Creation request or edit revision required.",
      });
    if (value.command === "ride") {
      if (
        ["need_ride", "can_drive", "either"].includes(value.mode) &&
        (!id.safeParse(value.locationId).success ||
          !value.earliestLocal ||
          !value.latestLocal)
      )
        ctx.addIssue({
          code: "custom",
          message: "Active rides require an owned address and concrete window.",
        });
      if (
        ["can_drive", "either"].includes(value.mode) &&
        (value.seats === undefined || value.detour === undefined)
      )
        ctx.addIssue({
          code: "custom",
          message: "Explicit driver seats and detour required.",
        });
    }
  });
