# Routing foundation

Application server code imports `getRoutingProvider` and domain types from `src/lib/routing`. The factory selects an adapter; matching code must not import `ValhallaProvider`. Its normalized contract supports ordered waypoint routes, travel time/distance, and row-major origin/destination matrices. Distances are meters and durations seconds. Route geometry uses encoded polyline segments with explicit precision, in leg order.

```text
RallyRoute server -> RoutingProvider -> ValhallaProvider
                                    -> future GoogleRoutesProvider
                                    -> future providers
```

Supabase/PostGIS remains the source of truth for application locations, households, participants and events. Exact household locations remain private. PostGIS performs inexpensive geographic filtering before routing. Valhalla maintains its own road graph; no roads or routing tiles are imported into Supabase. The future matching engine consumes normalized matrix/route results and independently evaluates eligibility, time windows, capacity and detours.

Household and event addresses are resolved server-side through a replaceable geocoding adapter. Household results must be building-level with overall and building confidence at least 0.9; event destinations must be building/amenity-level with overall confidence at least 0.9. Both require the returned country to match the input. Coarse or missing-quality results are rejected for correction without changing the saved address. The initial adapter uses Geoapify's forward-geocoding API; address form copy discloses that submitted addresses are sent to Geoapify/OpenStreetMap. `GEOAPIFY_API_KEY` is server-only. Unresolved or unavailable lookups prevent the address write, and the controlled database workflow stores the address, PostGIS point and provider attribution atomically. Geoapify/OpenStreetMap attribution must remain available in the product; see [Geoapify terms](https://www.geoapify.com/terms-and-conditions/) and [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).

MapLibre is a future browser rendering layer, separate from route calculations. No map currently exists, so MapLibre installation and map UI are deferred. OpenStreetMap supplies geographic source data; it is neither a routing service nor a visual tile hosting service.

## Self-hosted data flow

```text
OpenStreetMap region extract (.osm.pbf)
 -> Valhalla tile-building process
 -> Valhalla routing tiles
 -> Valhalla routing service
 -> RallyRoute RoutingProvider
```

Valhalla routing tiles describe road connectivity, restrictions and costs. They differ from raster/vector visual map tiles rendered by MapLibre. The current development service is self-hosted at `http://192.168.68.100:8002` and contains Georgia (US) OSM routing data only. Coordinates beyond that coverage may have no routable road; the adapter reports this safely and never falls back to straight-line distance. Refreshing OSM extracts and selecting visual tile hosting remain operational follow-ups. Production routing infrastructure has not been decided; the homelab deployment is development-only. A production application host must be able to reach the service securely; a Rocket-only localhost address will not work from Vercel. Follow OSM attribution requirements when data/results are presented.

## Configuration and behavior

Set server-only `ROUTING_PROVIDER=valhalla` and `VALHALLA_URL=http://192.168.68.100:8002` in your development environment, then restart the application. The old `VALHALLA_BASE_URL` name remains a compatibility fallback; `VALHALLA_URL` takes precedence. Do not use this internal address in browser requests or assume it is reachable from production. `VALHALLA_TIMEOUT_MS` is optional, defaults to 10000 and accepts 1–60000. A URL path prefix is supported. Credentials, query strings and fragments in the base URL are rejected. No `NEXT_PUBLIC_*` routing settings are used; existing environment secrets are untouched.

The adapter POSTs to `/route` and `/sources_to_targets`, requests kilometers, and converts either kilometers or miles in responses to meters. Supported modes are driving, cycling and walking. Limits are 20 route locations (18 intermediate waypoints), 25 matrix origins, 25 destinations and 625 cells. The self-hosted service must support these limits; lower deployment limits may require reducing application bounds. Requests beyond bounds are rejected before HTTP. There is no implicit batching.

Capabilities explicitly advertise no departure-time or traffic support in this initial adapter. Although Valhalla has time-dependent APIs, their local-time conversion and matrix limitations are not implemented here. A valid RFC3339 `departureTime` is accepted by the domain but returns `unsupported`, never silently ignored. Historical/predictive/live traffic are not claimed. Future adapters can implement these capabilities without changing matching code.

Results distinguish `ok`, `unreachable`, and `error`. Matrix cells preserve zero travel values and explicit unreachable entries. Wrong dimensions, indices, unsupported units, negative measurements and malformed responses fail safely. Operational failures have static messages and normalized codes; raw errors, infrastructure URLs and response bodies are not returned or logged. Requests disable caching and redirects and use an abort timeout covering response parsing. Successful travel-time results are persisted for 30 days in a private Postgres cache; keys include normalized coordinates/waypoints, mode, provider endpoint, and `ROUTE_CACHE_VERSION`.

The provider is guarded by `server-only`. The provider also exposes `checkHealth()`, which GETs `/status` with the same timeout and safe error handling and validates version/tileset metadata. It checks service readiness, not whether an arbitrary location is covered. No browser-facing routing endpoint is added. A server-only client using the modern Supabase secret API key can invoke narrowly scoped database functions to resolve a specified pair of ride records; SQL checks group, attendance, ride roles, time-window overlap, seats, and PostGIS distance before returning coordinates. Authenticated browser roles cannot execute these coordinate/cache functions. Application entrypoints must validate identity with `getUser()` before invoking them. Do not log precise coordinates or return cross-household route geometry before the product's sharing rules permit it.

## Verification and next work

`tests/routing.test.ts` uses mocked HTTP only and covers conversion, waypoint ordering, matrix ordering, unreachable routes, input/configuration validation, unsupported capabilities, malformed responses, provider errors and timeout. Normal CI requires no Valhalla service. Live routing is not verified by these tests.

The Phase 3 routing implementation now includes server-side address geocoding, controlled coordinate resolution, a configurable PostGIS household-distance prefilter, pairwise detour evaluation for both event legs, and a private persistent result cache. Configure `GEOAPIFY_API_KEY` and the server-only `SUPABASE_SECRET_KEY` alongside the routing URL. Geoapify API usage is subject to its service terms and attribution requirements. Phase 4 now adds event-level match discovery/ranking through this routing foundation; see [matching architecture](matching-engine.md). Maps, traffic-aware scheduling, multi-rider route optimization, and production routing deployment remain deferred. Phase 2 manual verification was completed by user sign-off on 2026-10-05.

References: [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/), [matrix API](https://valhalla.github.io/valhalla/api/matrix/), [tile building](https://valhalla.github.io/valhalla/mjolnir/).

### Initial foundation results — 2026-10-04

Type checking (`pnpm exec tsc --noEmit`), ESLint (`pnpm lint`), all 170 unit tests including 23 routing tests (`pnpm test`), production build (`pnpm build`), and linked schema lint (`pnpm supabase db lint --linked --schema public,private`) passed. No database schema changes were made. Live Valhalla verification remains pending service configuration; mocked tests are not integration evidence.

## Live development verification

Run from a machine that can resolve/reach the homelab endpoint:

```bash
ROUTING_PROVIDER=valhalla VALHALLA_URL=http://192.168.68.100:8002 RALLYROUTE_TEST_VALHALLA=1 pnpm exec vitest run tests/routing-live.test.ts
```

This explicit opt-in test uses the actual RallyRoute factory and adapter with real HTTP. It checks health, normalized direct routes, a route with two ordered waypoints, and a two-origin/one-destination matrix using public Georgia coordinates. It does not send household addresses or require credentials. The ordinary suite skips it even when a routing URL is configured. No live environment files or production settings were modified by this implementation.

### Development integration update — 2026-10-04

Type checking, lint, production build, clean linked schema lint and 173 mocked/unit tests (including 26 routing tests) passed; the one live test is skipped in the ordinary suite. The initial endpoint check from this agent session could not resolve `valhalla.home`; the service was later verified by IP on 2026-10-05 (see below).

### Live integration update — 2026-10-05

The service health check and live routing smoke test passed against `http://192.168.68.100:8002`, including direct routing, ordered waypoints and the origin/destination matrix.

### Phase 3 implementation update — 2026-10-05

The new migration `20261005010000_phase3_geographic_routing.sql` adds geocoding authorization, atomic coordinate storage, service-role-only route-candidate resolution and a private 30-day route cache. The server-only route service applies the broad straight-line pickup filter before making direct and waypoint route calls. Focused unit tests, the full unit suite, lint and production build passed. No match discovery or user-facing match results are included. That initial migration and the follow-up controls/compatibility/coordinate-refresh migrations are now applied to linked Dev; see the latest status below. The database assertions are in `supabase/tests/database/phase3_geographic_routing.test.sql`.

## Shared usage controls and current verification

Configure the privileged client with the server-only `SUPABASE_SECRET_KEY=sb_secret_...`. The key authorizes PostgreSQL's `service_role` role, but it is the modern secret API key rather than the legacy JWT key. The client is separate from the authenticated SSR client, has no persisted user session, and never appears in browser code. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

The factory guards all route, travel-time, and matrix calculations through atomic private Postgres budgets. Health checks are outside calculation budgets. Defaults are 60 external routing requests per minute globally and four concurrent requests; an additional generous hourly routing ceiling defaults to 100000. Geocoding is limited to 10 lookups/minute and 50/hour per verified user, after address-save authorization. Positive-integer server overrides are `ROUTING_REQUESTS_PER_MINUTE` (maximum 10000), `ROUTING_REQUESTS_PER_HOUR` (maximum 100000), `ROUTING_MAX_CONCURRENT_REQUESTS` (maximum 100), `GEOCODING_REQUESTS_PER_MINUTE` (maximum 10000), and `GEOCODING_REQUESTS_PER_HOUR` (maximum 100000). Invalid configuration or failed control RPCs prevent provider work. Rejected admission returns a safe retry interval; provider Retry-After hints are bounded to 3600 seconds.

Travel-time cache misses acquire a route-key lease shared across instances. Leases last the configured provider timeout rounded up to seconds plus 10 seconds. Competing instances return a retryable result instead of waiting or issuing duplicate HTTP calls. Only the current, unexpired token owner can publish or release a route lease. Direct service-role execution of the older cache-write RPC is revoked; publication uses the owned completion workflow. Successful normalized results remain cached for 30 days; unreachable results have a five-minute cooldown and transient failures a 30-second cooldown. No raw provider bodies or route geometry are stored. Expired leases can be reclaimed. Cache hits consume no external-call budget; there are no automatic retries. Bump `ROUTE_CACHE_VERSION` after routing assumptions or road tiles change.

All migrations through `20261005024000` are applied to linked Dev and schema lint is clean. The linked transaction-only suites pass 40 geographic-routing assertions, 65 event assertions, and 36 provider-control assertions. Mocked browser coverage verifies household/destination creation and edits, rejected uncertain lookups, and provider-throttled edits preserving existing addresses. Live Valhalla health, route, ordered waypoint, matrix, both-leg detour, repeat-cache, and independent-client lease/budget checks passed using the existing modern Dev secret key held only in the test-process environment. The fixture harness rolls back synthetic households and simulates the authenticated fixture identity; it does not verify real Supabase Auth/browser sign-in. Live checks create normalized cache entries using public coordinates and consume real Dev provider budgets; isolated test counters/leases are cleaned up, global usage counters are not reset.

Run opt-in checks with secrets loaded securely into the process environment:

```sh
RALLYROUTE_TEST_VALHALLA=1 RALLYROUTE_TEST_PHASE3=1 pnpm exec vitest run tests/routing-live.test.ts tests/phase3-live.test.ts
RALLYROUTE_TEST_GEOCODING=1 pnpm exec vitest run tests/geocoding-live.test.ts
```

The Phase 3 fixture harness requires linked CLI access as well as the configured secret key and routing URL. It uses public Georgia points, not real household coordinates. The geocoding smoke test uses a public Atlanta building; it is not a check of every household address.

**Phase 3 is complete on linked Dev.** The application environment now has the modern secret key, Geoapify key, and routing URL configured. All five opt-in live API checks passed, including Geoapify's strict building-quality check. A separate real signed-in browser check passed household and event-destination address creation and address edits with persisted results and attribution. It used a uniquely named disposable account and public Atlanta building addresses, generated a verification token without sending email, and removed its isolated account/household/group/location records afterward. Cleanup was verified with zero remaining smoke-test accounts, households, or groups. The transaction-only SQL suites separately verify coordinate-change ride reconfirmation and privacy boundaries.

Run the explicitly opted-in Dev browser check with `.env.local` configured:

```sh
RALLYROUTE_TEST_PHASE3_BROWSER=1 pnpm exec playwright test --config playwright.live.config.ts
```

The browser test checks the application Supabase URL against the linked project, creates only uniquely named disposable test data, and cleans up only that data. It requires modern secret-key and linked Management API access; it never sends OTP email or resets/seeds Cloud. Browser dependencies must be available; this session reused existing temporary Chromium libraries through `LD_LIBRARY_PATH=/tmp/rallyroute-browser-libs/root/usr/lib/x86_64-linux-gnu` without installing system packages. The full mocked browser suite passed before the new address regression, and the four affected event/address cases then passed across targeted reruns. Lint, 219 unit tests, TypeScript, production build, and linked schema lint passed; ordinary unit runs skip the five live API checks.

Legacy addresses without coordinates remain excluded until an authorized user edits and saves them; no bulk address submission or backfill was performed. Phase 2 manual checks were completed by user sign-off on 2026-10-05. Production routing infrastructure, maps, and Phase 4 discovery/ranking remain deferred.
