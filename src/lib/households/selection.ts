export const householdSelectionCookie = "rallyroute-household";

export function selectedHousehold<T extends { id: string }>(households: T[], savedId?: string): T | undefined {
  return households.find(household => household.id === savedId) ?? households[0];
}
