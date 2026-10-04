import { z } from "zod";
const group = z.object({ group_id: z.string().uuid(), name: z.string(), group_type: z.string(), description: z.string().nullable() });
const schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), group: group.optional(), destination_kind: z.enum(["household", "group"]).optional(), destination_id: z.string().uuid().optional() }),
  z.object({ status: z.literal("invalid") }),
  z.object({ status: z.literal("unavailable") }),
  z.object({ status: z.literal("throttled"), retry_after_seconds: z.number().int().positive() }),
]);
export function invitationResult(value: unknown) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : { status: "unavailable" as const };
}
export function invitationMessage(value: ReturnType<typeof invitationResult>): string {
  if (value.status === "throttled") return `Too many invitation attempts. Try again in ${value.retry_after_seconds} seconds.`;
  if (value.status === "invalid") return "This invitation is unavailable. Check the code and invited email, or ask the Owner for a fresh invitation. It may be expired, revoked, already used, or already joined.";
  if (value.status === "unavailable") return "Unable to check this invitation. Please try again.";
  return "Invitation ready.";
}
