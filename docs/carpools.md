# Phase 6: agreed carpools

Carpools turn an accepted connection into a manually agreed schedule between two households in one group. Any current account holder with household access can manage their household's arrangement; group administration grants no carpool access.

## Requirement review

| Roadmap requirement | Implementation and verification |
|---|---|
| Carpool creation | Accepted-connection navigation, invitation consent, recipient acceptance/decline, request-ID retries; linked and browser checks. |
| Participating households | Exactly two connected households; any current household account can manage its arrangement; ordinary-role isolation and group-admin denial checks. |
| Participating members | Household-owned active attending selections with explicit name/role sharing; disabled attendance is rejected; linked eligibility and consent checks. |
| Event rides | Separate concrete event/direction records with agreed times and revision-bound approvals; both-leg browser and lifecycle regression checks. |
| Driver assignments | Attending adult, including an adult without an account; all passengers count against additional seats; unique confirmed member/event/direction assignments and competing-confirmation checks. |
| Schedule display | Chronological carpool schedules and confirmed event assignments, sorted across arrangements; separate Phase 5 contact/address consent remains required. |

## Workflow

1. Open an accepted connection, select **Create carpool**, and confirm participant-sharing consent. The other household explicitly accepts or declines. Only one pending/accepted carpool exists per connection; declined and closed arrangements remain history. Recreating requires a fresh invitation.
2. Propose a future concrete event ride, separately for **To event** and **From event**. Enter an agreed arrival/departure time in the event timezone. Ambiguous/nonexistent daylight-saving times are rejected. No home departure scheduling or route calculation is performed.
3. Each household selects only its own active attending participants and explicitly consents to sharing their selected names/roles. The driver household selects an attending adult and confirms 1–20 additional rider seats. The adult need not have an account or driving preference. All passengers, including the driver's household passengers, count against capacity.
4. Both households approve the same revision. Confirmation rechecks membership, connection, attendance, driver eligibility, capacity and assignment conflicts. A person cannot hold two confirmed assignments for the same event/direction across carpools or roles. Proposals do not reserve assignments; cross-event travel conflicts are not detected.
5. View the chronological schedule or confirmed event-page assignments. Participant, driver, capacity and time edits immediately clear confirmation and both approvals. Only the driver household changes its driver/capacity; releasing its driver lets the other household offer to drive. Either household can cancel a future ride or close the carpool. Past rides remain history without trip completion tracking.

Contacts and exact pickup addresses still require [Phase 5 consent](connections.md). Carpool acceptance does not share an address. Use **Contacts and pickup sharing** for those separate grants. Matching preferences remain independent; preference-only changes do not invalidate manual agreements.

## Security and lifecycle

`public.carpools` exposes household-scoped metadata under RLS and select-only grants. Private tables hold participating households, rides, explicit participant name snapshots, approvals and confirmed assignments; all have RLS and no anonymous/authenticated table grants. Controlled projections exclude addresses, coordinates, route internals, counterpart attendance lists and raw ride preferences.

Authenticated invoker RPCs `carpool_action`, `list_carpools`, and `get_carpool` delegate to privileged implementations in `private` with fixed empty search paths. Server Actions verify Auth and validate inputs with Zod; SQL independently checks ownership and consent. Household rows lock in UUID order before connection/carpool rows. Revisions reject stale edits; request IDs make creation retries idempotent; a unique assignment key arbitrates competing confirmations atomically.

Connection closure, group departure and household archival persist closure and cancellation of future rides. Rejoining never restores consent. Event cancellation cancels rides; event changes or stale revisions require review. Participant archival/removal/type changes and loss or disabling of attendance persist invalidation and clear approvals. Restoring eligibility never restores approvals. Reads and transitions recheck eligibility. Closed projections retain own selections and hide counterpart names; revocation cannot erase already copied details.

## Verification

```sh
pnpm test:db:linked phase6_carpools.test.sql phase5_connections.test.sql phase4_matching.test.sql events_phase2.test.sql phase3_geographic_routing.test.sql provider_usage.test.sql
RALLYROUTE_TEST_PHASE6_BROWSER=1 pnpm exec playwright test --config playwright.live.config.ts tests/live/phase6.spec.ts
```

SQL fixtures roll back. The opt-in live check creates two disposable Auth accounts and isolated random fixture records, with accepted connections as setup. The second account also accesses a third fixture household to test competing two-household carpools. It sends no email, makes no routing calls, cleans up group/households/accounts and asserts zero remaining fixture accounts, households, groups and carpools. Existing temporary Chromium libraries can be enabled with `LD_LIBRARY_PATH=/tmp/rallyroute-browser-libs/root/usr/lib/x86_64-linux-gnu`; they are test infrastructure, not application dependencies.

On 2026-10-05: 63 Phase 6 linked SQL assertions and 308 assertions across six relevant suites passed; 286 ordinary unit tests, all 36 mocked browser tests, the real two-account Dev browser/concurrency check, lint, TypeScript, build and clean linked schema lint passed. The first browser run exposed a test locator error and a matching response-capture failure; the corrected affected suite and subsequent full suite passed. The live check covers concurrent creation, simultaneous approvals, edit/approval, cancellation/approval, and competing final confirmations. User manual acceptance remains pending.

Review corrections on 2026-10-05 add migration `20261005140000_phase6_review_guards.sql` without rewriting the original applied migration. Active attendance is now required when selecting participants/drivers and validating confirmation. Disabling attendance immediately clears confirmation, approvals and assignments; restoring attendance requires fresh approval. Every event revision change now persists invalidation immediately, including destination edits that keep the same location ID. Event-page assignments sort chronologically across carpools. Seven rollback-only regressions cover these database fixes. The review browser run also exposed an authentication test timer issue: installing the Playwright clock after the cooldown interval existed made resend verification unreliable. Installing it before navigation fixed the test; the subsequent full 36-test mocked suite passed. Public types were regenerated after applying the migration to linked Dev.

Review verification rerun: lint, TypeScript, 286 unit tests, all 36 mocked browser cases, 308 rollback-only linked assertions, clean `public,private` schema lint, and the production build passed. The real two-account Dev browser test passed both-leg UI flows and all five concurrency scenarios; cleanup assertions confirmed zero fixture accounts, households, groups and carpools. Local `/sign-in` on port 3000 returned HTTP 200. The review is ready for user manual acceptance; Phase 6 is not marked complete.

## Manual acceptance

1. Create and accept/decline an invitation; verify unrelated households/group admins cannot access it.
2. Propose both directions, select own riders and an adult driver, and verify pickup addresses remain private without separate consent.
3. Approve once, then from the other household; verify only the second approval confirms and the event page shows assignments.
4. Edit time, participants or seats; verify both approvals reset and insufficient capacity/duplicate assignments are rejected.
5. Change attendance/event details and restore them; verify fresh agreement is required.
6. Cancel, close, and leave/rejoin; verify future rides are canceled and recreation requires fresh consent.

Automatic rotations, route optimization, notifications, calendar integration and multi-household carpools remain outside Phase 6. No commit, push or production deployment was made.
