import { z } from "zod";
export const phoneSchema = z.string().trim().max(40).default("").refine(value => !value || (/^\+?[0-9() .-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15), "Enter a valid phone number.");
export const addressFields = {
  label: z.string(), address_line_1: z.string().nullable(), address_line_2: z.string().nullable(),
  city: z.string().nullable(), state_region: z.string().nullable(), postal_code: z.string().nullable(), country_code: z.string(),
};
export const connectionSchema = z.object({
  id: z.string().uuid(), status: z.enum(["pending", "accepted", "declined", "withdrawn", "expired", "disconnected"]),
  revision: z.number().int(), incoming: z.boolean(), otherHouseholdName: z.string().nullable(),
  otherHouseholdId: z.string().uuid(), eventTimezone: z.string(),
  groupId: z.string().uuid(), groupName: z.string(), eventName: z.string(), createdAt: z.string(), expiresAt: z.string(),
  contacts: z.array(z.object({ own: z.boolean(), editable: z.boolean(), name: z.string(), email: z.string().email(), phone: z.string().nullable() })),
  pickups: z.array(z.object({ id: z.string().uuid(), own: z.boolean(), eventName: z.string(), leg: z.enum(["to_event", "from_event"]), expiresAt: z.string(), timezone: z.string(), ...addressFields })),
});
export type Connection = z.infer<typeof connectionSchema>;
export const connectionsSchema = z.array(connectionSchema);
export const locationsSchema = z.array(z.object({ id: z.string().uuid(), revision: z.number().int(), archived_at: z.string().nullable(), ...addressFields }));
export function displayAddress(address: z.infer<typeof locationsSchema>[number] | Connection["pickups"][number]) {
  return [address.address_line_1, address.address_line_2, address.city, address.state_region, address.postal_code, address.country_code].filter(Boolean).join(", ");
}
export const outcomeSchema = z.object({ status: z.enum(["ok", "existing", "stale", "unavailable", "conflict", "invalid"]), id: z.string().uuid().optional(), incoming: z.boolean().optional() });
