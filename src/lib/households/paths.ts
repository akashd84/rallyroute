const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isHouseholdSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value !== "new" && !uuidPattern.test(value);
}
export function householdPath(slug: string): string {
  if (!isHouseholdSlug(slug)) throw new Error("Invalid household slug");
  return `/households/${slug}`;
}
export const householdLinkRecoveryPath = "/account?notice=household-link";
export function locationEditPath(householdSlug: string, locationSlug: string): string {
  if (locationSlug.length < 1 || locationSlug.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(locationSlug) || locationSlug === "add" || uuidPattern.test(locationSlug)) throw new Error("Invalid location slug");
  return `${householdPath(householdSlug)}/locations/${locationSlug}/edit`;
}
