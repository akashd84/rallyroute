import { cache } from "react";
import { z } from "zod";
import { householdContext } from "./context";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isLocationSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug !== "add" && !uuidPattern.test(slug);
}
export const locationSchema = z.object({
  id: z.uuid(), slug: z.string().refine(isLocationSlug), label: z.string(), is_primary: z.boolean(),
  address_line_1: z.string().nullable(), address_line_2: z.string().nullable(),
  city: z.string().nullable(), state_region: z.string().nullable(), postal_code: z.string().nullable(),
  country_code: z.string(), coordinates_available: z.boolean().optional(),
  geocoding_attribution: z.string().nullable().optional(), revision: z.number(), archived_at: z.string().nullable(),
});
export const householdLocations = cache(async (householdSlug: string) => {
  const context = await householdContext(householdSlug);
  const result = await context.supabase.rpc("household_location_list", { p_household_id: context.household.id });
  const parsed = z.array(locationSchema).safeParse(result.data);
  const role = context.access.find(a => a.user_id === context.user.id)?.role;
  return { ...context, locations: parsed.success ? parsed.data : [], locationsError: Boolean(result.error || !parsed.success), manager: role === "owner" || role === "admin" };
});
