import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detourInputSchema, evaluateResolvedDetour } from "@/lib/routing/route-detour";
import { decodeCursor, encodeCursor, type DiscoveryState } from "./cursor";
import { rankHouseholds, type MatchHousehold, type MatchResult } from "./types";
const requestSchema = z.object({ eventId: z.string().uuid(), householdId: z.string().uuid(), leg: z.enum(["to_event","from_event"]), cursor: z.string().max(300000).optional() });
const candidateSchema = z.object({
  pair_key: z.string(), fingerprint: z.string(),
  other_household_id: z.string().uuid(), other_household_name: z.string(),
  own_member_id: z.string().uuid(), own_member_name: z.string(), own_role: z.enum(["driver","rider"]),
  earliest: z.string().datetime({ offset: true }), latest: z.string().datetime({ offset: true }), route: detourInputSchema,
});
const rowsSchema = z.array(z.object({ pair_key: z.string(), candidate: candidateSchema }));
const empty = (status: MatchResult["status"]): MatchResult => ({ status, households: [], complete: false });
export async function discoverMatches(request: unknown): Promise<MatchResult> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) return empty("invalid_request");
  const input = parsed.data;
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return empty("unavailable");
    const context = { user: auth.data.user.id, event: input.eventId, household: input.householdId, leg: input.leg };
    let state: DiscoveryState;
    try {
      state = input.cursor ? decodeCursor(input.cursor,context) : { version: 1, ...context, expires: Date.now()+30*60*1000, after: "", checked: 0, failed: false, saved: [] };
    } catch { return empty("invalid_request"); }
    const distance = Number(process.env.ROUTING_PREFILTER_MAX_PICKUP_DISTANCE_METERS ?? 100000);
    if (!Number.isInteger(distance) || distance<1000 || distance>250000) return empty("unavailable");
    const admin = createAdminClient();
    const args = { p_user_id: context.user, p_event_id: context.event, p_household_id: context.household, p_leg: context.leg, p_max_distance: distance };
    const load = async (extra: { p_after?: string; p_keys?: string[]; p_limit: number }) => {
      const result = await admin.rpc("match_candidates", { ...args, ...extra });
      if (result.error) throw new Error("Discovery unavailable");
      return rowsSchema.parse(result.data).map(row => row.candidate);
    };
    const batch = await load({ p_after: state.after, p_limit: 21 });
    const evaluated = batch.slice(0,Math.min(20,1000-state.checked));
    let retryAfterSeconds: number | undefined;
    for (const candidate of evaluated) {
      const result = await evaluateResolvedDetour(candidate.route);
      state.checked++;
      state.after = candidate.pair_key;
      if (result.status==="compatible") state.saved.push({ key: candidate.pair_key, fingerprint: candidate.fingerprint, seconds: result.addedDurationSeconds });
      else if (result.status==="error") {
        state.failed = true;
        retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, result.retryAfterSeconds ?? 30);
      }
    }
    // One fresh database statement rechecks access and every accumulated suggestion.
    // Empty keys still enforce authorization before any result can be returned.
    const fresh = await load({ p_keys: state.saved.map(s=>s.key), p_limit: 1000 });
    const byKey = new Map(fresh.map(c=>[c.pair_key,c]));
    const retained = state.saved.filter(s=>byKey.get(s.key)?.fingerprint===s.fingerprint);
    if (retained.length!==state.saved.length) state.failed=true;
    state.saved=retained;
    const groups = new Map<string,MatchHousehold>();
    for (const saved of retained) {
      const c = byKey.get(saved.key)!;
      let household = groups.get(c.other_household_id);
      if (!household) { household={ id: c.other_household_id, name: c.other_household_name, opportunities: [] }; groups.set(household.id,household); }
      household.opportunities.push({
        // Stable opaque tie-breaker: counterpart ride IDs are never serialized.
        id: createHash("sha256").update(`${context.event}:${context.household}:${context.leg}:${c.pair_key}`).digest("hex"),
        ownMemberName: c.own_member_name, ownRole: c.own_role,
        earliest: c.earliest, latest: c.latest, addedDurationSeconds: saved.seconds,
      });
    }
    const more = batch.length>evaluated.length;
    const limitReached = more && state.checked>=1000;
    return {
      status: "ok", households: rankHouseholds([...groups.values()]), complete: !more && !state.failed,
      ...(more && !limitReached ? { cursor: encodeCursor(state) } : {}),
      ...(state.failed ? { retryAfterSeconds: retryAfterSeconds ?? 30 } : {}),
      ...(limitReached ? { limitReached: true } : {}),
    };
  } catch { return empty("unavailable"); }
}
