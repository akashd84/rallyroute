# Database fixtures and authorization tests

These tests exercise real PostgreSQL grants, RLS, and controlled functions. Vitest and mocked browser tests do not replace them. The database suite is separate from `pnpm test`.

## Linked development verification

Rocket uses linked Supabase Dev. Set `RALLYROUTE_TEST_DATABASE_URL` securely and run `pnpm test:db:linked` with `psql` available. The runner excludes seed idempotency, assumes `postgres` only for transaction-scoped setup/snapshots, and switches assertions to ordinary roles. No Cloud reset or development seed is permitted. Fixture namespace collisions abort. Each suite rolls back, including any pgTAP extension creation. Docker is optional for local/CI verification; it is not a gate for linked development. See [household onboarding](household-onboarding.md) for the current permission matrix and verification record.

## Optional local setup

Use a machine with Docker (or a compatible supported container runtime) available to the Supabase CLI. This task does not install Docker on Rocket. Install project dependencies with `pnpm install --frozen-lockfile`, then run:

```sh
pnpm db:start
pnpm db:reset
pnpm test:db
pnpm test:db
pnpm db:lint:local
```

`db:start` starts the local Supabase stack. `db:reset` explicitly targets **local** Supabase: it destroys the local database contents and replays migrations plus `supabase/seed.sql`. It does not reset the linked Cloud database. `test:db` and lint do not implicitly reset a database. The test command targets only `supabase/tests/database`; the support fixture SQL is not a standalone TAP suite.

Never add `--linked`, a Cloud database URL, or `--include-seed` to seed/reset commands for these fixtures. No Cloud credentials are required by the CI workflow.

The development seed uses stable IDs and `ON CONFLICT DO NOTHING`. Rerunning it does not duplicate records, overwrite edited fixture rows, or delete unrelated data. To restore the original development fixture state, reset the local database. Test fixtures use a separate ID namespace and roll back every suite, so they do not depend on the development seed or on another suite.

## Fixture identities

Development IDs use `10000000-0000-4000-8000-` followed by the 12-digit fixture number. Tests use the same fixture numbers under `20000000`. Emails are reserved `example.test` addresses. There are no account passwords, raw invitation tokens, or real household coordinates.

| User number / email | Household access | Group access |
| --- | --- | --- |
| 1 / a.owner@example.test | A owner | Active member |
| 2 / a.admin@example.test | A admin | Active member, not group admin |
| 3 / a.member@example.test | A member (can manage participants) | Active member, not group admin |
| 4 / b.owner@example.test | B owner | Active member |
| 5 / c.owner@example.test | C owner | Outsider; direct invitation target |
| 6 / d.owner@example.test | D owner | Left group |
| 7 / e.owner@example.test | E owner | Removed from group |
| 8 / group.admin@example.test | No household access | Group owner |

Household numbers are A=101, B=102, C=103, D=104, E=105; group=301; destination=501; household locations=510–514; event series=601; concrete events=610–611. A and B contain adult and child participants; A also contains adults without logins and a participant without attendance. Authentication identity is separate from transportation identity.

Attendance and rides are tied to event 610. Times are explicitly anchored in 2099 so fixtures remain stable; geographic points near (0,0) and addresses are synthetic, not actual pickup sites. These records are authorization fixtures, not evidence of routing/matching compatibility.

Invitation numbers: 901 direct to C; 902 active two-use link; 903 expired; 904 revoked; 905 exhausted; 906 unlimited link; 907 active but already at its usage limit. Only synthetic SHA-256-format hashes are stored; there are no invitation URLs to share. Fixtures do not constitute login credentials or test email delivery.

## Expected authorization matrix

| Capability | Household owner/admin | Household member | Group admin without household access | Outsider / anonymous |
| --- | --- | --- | --- | --- |
| Read own profile | Yes, own identity only | Yes, own identity only | Yes, own identity only | Authenticated outsider: own only; anonymous: denied |
| Read household people/attendance/rides | Own household only | Own household only | No | Outsider: own household only; anonymous: denied |
| Manage household people/attendance/rides | Own household, with integrity checks | Own household, with integrity checks | No | Outsider: own household within applicable group rules; anonymous: denied |
| See shared group/events/destinations | Active group membership | Active group membership | Administered group | No |
| Manage group/create invitations | Only with separate group admin role | No | Yes | No |
| Redeem an invitation | Own household, subject to all restrictions | No | Requires separate household management access | Authenticated outsider owner/admin may redeem; anonymous: denied |
| Directly query private household locations | No | No | No | No |
| Read redemption history | Own household | Own household | Administered group | Outsider: own household only; anonymous: denied |

The redemption-history policy is **household access or group administration**, not only the individual redeeming user. The suite explicitly verifies that another user in the same household can see its audit record while another household cannot.

## Suite design

Each file starts a transaction, installs pgTAP if needed inside that transaction, loads its own fixtures, and rolls back. The suite uses existing extension-schema grants; it does not change application grants for test helpers. Role switches set transaction-local JWT claims and assert both `current_user` and `auth.uid()`; normal-role assertions are never performed through a security-definer test helper.

- Seed idempotency: complete before/after data snapshots, preservation of edited fixture values, unrelated data, and expected fixture counts.
- Identity: own/foreign profiles, household isolation, owner/admin/member permissions, immutable linkage/ownership columns, controlled household creation, missing JWT identity, anonymous denial, and RLS enabled on all public application tables.
- Groups and participation: group-visible information, isolation between A and B, outsider denial, attendance writes, group vs household administration, private location denial, and anonymous denial.
- Ride integrity: allowed owner/admin writes, foreign member/location rejection, missing attendance, inactive memberships, adult-only driver offers, and ordinary Member success within the same household.
- Invitations: normalized direct emails and forced one-use limits, actual Auth email vs forged JWT email, invalid/status/expiry/usage restrictions, existing/removed membership rules, fresh-link rejoining, duplicate audit protection, household-admin redemption, visibility, and exact success accounting.

Every rejected invitation redemption compares a complete before/after snapshot of memberships, invitations, and redemption history as the test fixture owner. The rejection itself runs under the ordinary caller role. Owner snapshots verify atomicity without bypassing the authorization assertion.

## CI

The database workflow runs on pull requests, pushes to `main`, and manual dispatch. It installs the declared pnpm version and frozen dependencies, starts isolated Supabase, resets only that local database, runs the suites twice, and lints `public,private`. It has read-only repository permissions, no Cloud secrets, and no deployment step. Its lint gate fails on application-schema errors and excludes the PostGIS extension schema.

## Security fix

The original ride-validation trigger ran as an invoker but read `private.household_locations`. An authorized owner insert failed with SQLSTATE `42501`. Migration `20261003235038_ride_validation_authorization.sql` makes the private trigger security-definer with an empty search path and checks API callers can manage the member before privileged reads. The function remains unavailable for direct API-role execution; private locations retain their denied grants and RLS. Privileged database maintenance can still seed fixtures. No public interface or generated type shape changes.

## Verification record

- Application migrations replayed and development seed loaded in a disposable native PostgreSQL 18/PostGIS database on Rocket, using a minimal test-only Auth schema and `auth.uid()` implementation. This is supplemental SQL validation, not a full Supabase stack run.
- All five pgTAP suites passed twice in that database: **255 assertions per run**. Test users remaining after rollback: **zero**.
- All 11 application migrations also replayed in a second fresh native database; every suite passed without preloaded development seed data.
- Development seed reapplied twice: **8 users and 5 households**, without duplicates.
- Baseline authorized ride insertion reproduced the private-location permission failure; it succeeds after the new migration. Client location queries remain denied.
- The migration was applied to linked development Cloud with no seeds, roles, or vault changes. Linked `public,private` database lint passed with no schema errors.
- Public TypeScript types were regenerated successfully from Cloud and were unchanged.
- Existing 28 Vitest tests, application lint, and production build passed.
- Standard local Supabase startup/tests/lint are **pending**: Rocket has neither Docker nor Podman. The CI workflow is checked in but has not run; no commit or push was requested.

The historical local-stack check is optional; do not mark it verified until `pnpm test:db` and `pnpm db:lint:local` pass on the actual local stack or CI. The native fallback does not test Auth service behavior, API schema exposure, or real mail delivery.

## Phase 1 household update

The household onboarding suite adds real-role coverage for Member participant management, email-restricted household invitations, account linkage, Owner succession, last-account archival, history preservation, and deferred ownership invariants. Hard deletion of participants is replaced by controlled archival. See [household onboarding](household-onboarding.md) for current execution results; the earlier 255-assertion record above describes Phase 0.

## Phase 1 group update

The group onboarding suite adds controlled creation retries, separate Group Owner access, settings validation, confirmed-email previews, metadata-only invitation reads, revocation, uniform new-invitation expiry, usage limits, and legacy household Admin compatibility. Existing invitation and isolation suites remain in place. Household test audit/count snapshots are scoped to synthetic identities so unrelated live Dev history does not change expected results. See [group onboarding](group-onboarding.md) for current execution results and the manual browser checklist.

## Invitation-code update

The code suite verifies ordinary-role access, removal of unthrottled RPC entrypoints, private counter denial, hash collisions, shared 10/minute and 50/hour windows, synthetic boundary timestamps, retry timing, counted failures, provider-failure rollback, and successful acceptance. Existing household/group suites now assert guarded structured outcomes alongside actual data changes and unchanged rejection snapshots. The disposable serialization runner also checks simultaneous attempts at the shared cap. See [invitation codes](invitation-codes.md) for current execution results; Cloud fixtures remain transaction-scoped and never seed/reset Dev.

## Phase 2 checks

`events_phase2.test.sql` covers controlled event/attendance/ride/location workflows and cross-household privacy; `event_series.test.sql` covers recurring patterns and successor-series replacement. Legacy direct-mutation cases now assert denied grants; successful writes use controlled RPCs.

For supplemental overlapping-transaction checks, apply migrations to a disposable loopback PostgreSQL database named `rallyroute_test_*`, set `RALLYROUTE_DISPOSABLE_DATABASE_URL` securely, and run `node scripts/test-events-serialization.mjs`. It verifies event-edit/ride-save, cancellation/attendance-save, household-departure/ride-save, and duplicate-series races, using ordinary authenticated clients. It refuses Cloud targets and cleans up its synthetic fixture namespace. Linked suites remain transaction-scoped and never seed or reset Cloud.
