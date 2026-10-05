import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ leg: "to_event", snapshots: [] as Record<string, unknown>[] }));
vi.mock("server-only", () => ({}));
// Fixture identity is simulated: these tests are not a real Auth/browser smoke test.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "20000000-0000-4000-8000-000000000001" } }, error: null }) } }) }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createAdminClient } = await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
  return { createAdminClient: () => {
    const client = createAdminClient();
    const original = client.rpc.bind(client) as unknown as (name: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
    return { rpc: (name: string, args: unknown) => name === "route_candidate_inputs"
      ? Promise.resolve({ data: state.snapshots.filter(row => row.leg === state.leg), error: null })
      : original(name, args) };
  } };
});
import { evaluateEventRideDetour } from "@/lib/routing/route-detour";

function loadRollbackSnapshots() {
  const directory = mkdtempSync(join(tmpdir(), "rallyroute-live-fixtures-"));
  const call = "public.route_candidate_inputs('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000800','20000000-0000-4000-8000-000000000803',100000)";
  const sql = `begin;
${readFileSync("supabase/tests/fixtures.sql", "utf8")}
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.2941 34.0754)') where id='20000000-0000-4000-8000-000000000510';
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.3785 33.9243)') where id='20000000-0000-4000-8000-000000000511';
update public.event_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.388 33.749)') where id='20000000-0000-4000-8000-000000000501';
update public.ride_participation set max_detour_minutes=120 where id='20000000-0000-4000-8000-000000000800';
create temporary table candidate_snapshot(data jsonb);
insert into candidate_snapshot select to_jsonb(c) from ${call} c;
update public.ride_participation set leg='from_event',anchor_earliest_at='2099-01-01T17:00Z',anchor_latest_at='2099-01-01T17:10Z' where id in ('20000000-0000-4000-8000-000000000800','20000000-0000-4000-8000-000000000803');
insert into candidate_snapshot select to_jsonb(c) from ${call} c;
select data from candidate_snapshot;
rollback;`;
  try {
    const file = join(directory, "fixture.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    const response = spawnSync("pnpm", ["supabase", "db", "query", "--linked", "--file", file], { encoding: "utf8" });
    if (response.status !== 0) throw new Error("Rollback-only live fixtures failed; raw output suppressed.");
    const result = JSON.parse(response.stdout);
    return result.rows.map((row: { data: Record<string, unknown> }) => row.data);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe.skipIf(process.env.RALLYROUTE_TEST_PHASE3 !== "1")("Dev fixture snapshots with real routing/cache RPCs", () => {
  it("evaluates both legs and serves repeated evaluations without provider HTTP", async () => {
    state.snapshots = loadRollbackSnapshots();
    expect(state.snapshots.map(row => row.leg).sort()).toEqual(["from_event", "to_event"]);
    // Isolate this run from previously cached routes while retaining public-only locations.
    vi.stubEnv("ROUTE_CACHE_VERSION", `phase3-live-${randomUUID()}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      for (const leg of ["to_event", "from_event"]) {
        state.leg = leg;
        const args = ["20000000-0000-4000-8000-000000000610", "20000000-0000-4000-8000-000000000800", "20000000-0000-4000-8000-000000000803"] as const;
        const first = await evaluateEventRideDetour(...args);
        expect(first.status).toBe("compatible");
        const calls = fetchSpy.mock.calls.filter(([url]) => String(url).startsWith(process.env.VALHALLA_URL!)).length;
        expect(await evaluateEventRideDetour(...args)).toEqual(first);
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).startsWith(process.env.VALHALLA_URL!))).toHaveLength(calls);
      }
      expect(fetchSpy.mock.calls.filter(([url]) => String(url).startsWith(process.env.VALHALLA_URL!))).toHaveLength(4);
    } finally { fetchSpy.mockRestore(); vi.unstubAllEnvs(); }
  }, 60000);
  it("shares route leases across independent real API clients", async () => {
    const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const key = randomUUID().replaceAll("-", "").repeat(2);
    const tokens = [randomUUID(), randomUUID()];
    try {
      const responses = await Promise.all([a, b].map((client, i) => client.rpc("routing_request_claim", { p_cache_key: key, p_token: tokens[i], p_lease_seconds: 20 })));
      expect(responses.map(r => r.error)).toEqual([null, null]);
      expect(responses.map(r => r.data.status).sort()).toEqual(["ok", "rate_limited"]);
    } finally {
      await Promise.all([a, b].map((client, i) => client.rpc("routing_request_finish", { p_cache_key: key, p_token: tokens[i], p_result: null })));
    }
  }, 20000);
  it("enforces shared provider budgets across independent API clients", async () => {
    const clients = [0, 1].map(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));
    const tokens = [randomUUID(), randomUUID()];
    const subject = randomUUID();
    try {
      const routed = await Promise.all(clients.map((client, i) => client.rpc("provider_budget_acquire", {
        p_provider: "routing", p_subject: "global", p_token: tokens[i], p_minute_limit: 60, p_hour_limit: 100000, p_concurrency: 1, p_lease_seconds: 20,
      })));
      expect(routed.map(r => r.error)).toEqual([null, null]);
      expect(routed.map(r => r.data.status).sort()).toEqual(["ok", "rate_limited"]);
      const geocoded = await Promise.all(clients.map(client => client.rpc("provider_budget_acquire", {
        p_provider: "geocoding", p_subject: subject, p_minute_limit: 1, p_hour_limit: 50, p_concurrency: 0, p_lease_seconds: 18,
      })));
      expect(geocoded.map(r => r.error)).toEqual([null, null]);
      expect(geocoded.map(r => r.data.status).sort()).toEqual(["ok", "rate_limited"]);
    } finally {
      await Promise.all(clients.map((client, i) => client.rpc("provider_budget_release", { p_token: tokens[i] })));
      // Delete only this randomly namespaced test counter; never reset global budgets.
      const cleaned = spawnSync("pnpm", ["supabase", "db", "query", "--linked", `delete from private.provider_budgets where provider='geocoding' and subject='${subject}'`], { encoding: "utf8" });
      if (cleaned.status !== 0) throw new Error("Unable to clean the synthetic provider counter.");
    }
  }, 20000);

});
