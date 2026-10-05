export type RideLeg = "to_event" | "from_event";
export type MatchOpportunity = {
  id: string;
  ownMemberName: string;
  ownRole: "driver" | "rider";
  earliest: string;
  latest: string;
  addedDurationSeconds: number;
};
export type MatchHousehold = {
  requestProof?: string;
  id: string;
  name: string;
  opportunities: MatchOpportunity[];
};
export type MatchResult = {
  status: "ok" | "unavailable" | "invalid_request";
  households: MatchHousehold[];
  complete: boolean;
  cursor?: string;
  retryAfterSeconds?: number;
  limitReached?: boolean;
};
// Exact measurements determine ranking; rounding belongs only in the UI.
export function compareOpportunities(a: MatchOpportunity, b: MatchOpportunity) {
  return a.addedDurationSeconds - b.addedDurationSeconds ||
    (Date.parse(b.latest) - Date.parse(b.earliest)) -
    (Date.parse(a.latest) - Date.parse(a.earliest)) || a.id.localeCompare(b.id);
}
export function rankHouseholds(households: MatchHousehold[]) {
  return households.map(h => ({ ...h, opportunities: [...h.opportunities].sort(compareOpportunities) }))
    .sort((a,b) => compareOpportunities(a.opportunities[0],b.opportunities[0]) || a.id.localeCompare(b.id));
}
