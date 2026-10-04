| Phase | Goal |
|---|---|
| **Phase 0 — Foundation** | Architecture, Supabase schema/RLS, auth, Rocket dev environment, Next.js integration, seed/test foundation |
| **Phase 1 — Households & Groups** | Household onboarding, members, create/join groups, invitations |
| **Phase 2 — Events & Ride Needs** | Events/event series, attendance, need ride/can drive/either, seats, time flexibility |
| **Phase 3 — Geographic Routing** | Household locations, PostGIS filtering, external routing API, detour calculations/cache |
| **Phase 4 — Matching** | Deterministic candidate matching and ranked match suggestions |
| **Phase 5 — Connections** | Request/accept/decline connection, controlled sharing of contact/location information |
| **Phase 6 — Carpools** | Turn accepted connections into actual carpools and assign rides/drivers |
| **Phase 7 — Pilot** | Controlled real-user pilot, measurement, feedback, fixes before broader launch |
Phase 1 household onboarding and access lifecycle are **complete**. Automated checks passed, and the user confirmed all eight manual two-account Supabase Cloud browser smoke-test steps passed on 2026-10-04. Results are recorded in [household onboarding](../household-onboarding.md). Group creation/joining and invitation UI are implemented. Outstanding group/manual code-entry verification remains pending; short-link testing passed.

Phase 2 events, attendance, ride preferences, and recurrence are implemented on Dev. Automated checks passed (147 unit tests, 26 mocked browser tests, native and linked database suites twice, four concurrency checks, lint/build, and clean linked schema lint). On 2026-10-04, the user reported manual testing is mostly complete and deferred the remaining checks; individual completed steps were not specified. **Phase 2 is not yet complete.** See [events and rides](../events-and-rides.md).
