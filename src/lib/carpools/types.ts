import { z } from "zod";
const id = z.string().uuid();
const base = { householdId: id, carpoolId: id };
const revision = z.coerce.number().int().positive();
const ride = { ...base, rideId: id, revision };
const consent = z.literal("yes");
const time = { localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), timezone: z.string().min(1).max(100) };
export const carpoolCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), householdId: id, connectionId: id, requestId: id, consent }),
  z.object({ command: z.literal("accept"), ...base, revision, consent }),
  z.object({ command: z.enum(["decline", "close"]), ...base, revision }),
  z.object({ command: z.literal("propose"), ...base, eventId: id, eventRevision: revision, requestId: id, leg: z.enum(["to_event", "from_event"]), ...time, consent }),
  z.object({ command: z.literal("participants"), ...ride, memberIds: z.preprocess(v => {
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return null; }
  }, z.array(id).max(21).refine(v => new Set(v).size === v.length)), consent }),
  z.object({ command: z.literal("driver"), ...ride, driverMemberId: id, availableSeats: z.coerce.number().int().min(1).max(20), consent }),
  z.object({ command: z.literal("clear_driver"), ...ride, consent }),
  z.object({ command: z.literal("time"), ...ride, ...time, consent }),
  z.object({ command: z.literal("approve"), ...ride, consent }),
  z.object({ command: z.literal("cancel"), ...ride }),
]);
export const carpoolRideSchema = z.object({
  id, eventId: id, eventName: z.string(), timezone: z.string(), leg: z.enum(["to_event", "from_event"]), anchorAt: z.string(),
  status: z.enum(["proposed", "confirmed", "needs_review", "canceled"]), revision: z.number().int(), reason: z.string().nullable(),
  availableSeats: z.number().int().nullable(), driverOwn: z.boolean().nullable(), eventRevision: z.number().int(),
  participants: z.array(z.object({ id, name: z.string(), role: z.enum(["driver", "rider"]), own: z.boolean() })),
  ownApproved: z.boolean(), otherApproved: z.boolean(),
});
export const carpoolSchema = z.object({
  id, connectionId: id, groupId: id, groupName: z.string(), status: z.enum(["pending", "accepted", "declined", "closed"]),
  revision: z.number().int(), incoming: z.boolean(), otherHouseholdName: z.string().nullable(), createdAt: z.string(), rides: z.array(carpoolRideSchema),
});
export const carpoolsSchema = z.array(carpoolSchema);
export const carpoolOutcomeSchema = z.object({ status: z.enum(["ok", "existing", "unavailable", "conflict", "invalid", "invalid_ride", "assignment_conflict"]), id: id.optional() });
export type Carpool = z.infer<typeof carpoolSchema>;
export type CarpoolRide = z.infer<typeof carpoolRideSchema>;
