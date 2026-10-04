# Household onboarding

The household onboarding and access lifecycle increment of Phase 1 is **complete**. Automated verification passed, and the user confirmed all eight steps of the manual two-account Supabase Cloud browser smoke test passed on 2026-10-04. Group creation/joining UI, group invitations, events, and matching remain later increments.

## Account and household setup

After email-code sign-in, `/account` checks the current profile, active household visibility, and an active account-linked adult participant. Missing names/access/linkage lead to `/onboarding`; a missing profile or query failure offers recovery rather than silently creating data. An account may belong to multiple households.

Creating a household requires first name, last name, and household name. One transaction creates Owner access, a linked Adult participant, and the onboarding completion timestamp. A request UUID prevents duplicate households on retries. Existing account holders can complete names/linkage in their existing household without creating another household. Additional adults and children do not need accounts; their last names are optional.

`/households/[id]` provides a household selector, participant management, and settings/access controls. Participant names are transportation data and can differ from account profile names. Removing participants archives them; ordinary clients cannot hard-delete them, change household assignment, or assign account linkage. Account-linked participants must remain active Adults. An unlinked Adult with future driving offers cannot become a Child until those offers are removed.

## Permissions and ownership

| Operation | Owner | Member | Legacy Admin |
| --- | --- | --- | --- |
| Read household, participants, attendance, rides | Own household | Own household | Own household |
| Add/edit/archive unlinked participants | Yes | Yes | Yes |
| Manage existing attendance and ride preferences | Yes, integrity checks apply | Yes, integrity checks apply | Yes, integrity checks apply |
| Rename household; create/revoke invitations | Yes | No | Existing administrative permissions retained |
| Promote a Member or remove another Member | Yes | No | Administrative access retained |
| Remove/demote another Owner | No | No | No |
| Step down from Owner | Self only | Not applicable | Not applicable until promoted |
| Leave household | Self | Self | Self |
| Assign Admin role | No UI or new RPC | No | No UI or new RPC |

Group administration remains separate. Household Member access does not grant group management or group-invitation redemption privileges. Private household locations remain inaccessible through ordinary table queries. Cross-household access is denied even when households share a group.

Multiple Owners are supported. If the only Owner steps down or leaves, the oldest remaining Member by `household_access.created_at` becomes Owner; user ID breaks ties. A legacy Admin is eligible only if no ordinary Member remains. A sole account holder cannot step down and stay. Leaving as the last account holder archives the household even if transportation participants without accounts remain.

Departure/removal unlinks and archives that account holder's participant. Upcoming event attendance is marked `not_going` and disabled; upcoming ride legs are marked `none` and disabled. Past attendance/ride rows remain unchanged. Upcoming attendance uses the latest event arrival/departure/activity-end timestamp; upcoming rides use their leg's arrival/departure anchor. Household archival also archives remaining participants, ends active group memberships, and revokes unconsumed household invitations. Archived data is preserved; restoration is outside this increment.

Lifecycle RPCs lock the household before authorization and mutations. A deferred database constraint rejects an active household without an Owner at transaction completion. Migration reconciliation promotes the earliest existing account holder only in legacy households without any Owner and archives legacy households with no access; other Admin memberships retain their role.

## Household invitations

Owners enter the invited email and may select an existing unlinked Adult. Acceptance grants Member access and links that participant, or creates an Adult if none was selected. Links are single-use, revocable, and expire in seven days. No invitation emails are sent by RallyRoute in this increment.

The server generates a random 256-bit token and stores only its SHA-256 hash. Owners see the link immediately after creation; it is not recoverable later. Copy the full link, including its `#fragment`. Raw tokens stay out of HTTP request URLs: `/household-invitations/open` hashes the fragment in the browser and strips it before any request. HTTPS (or localhost) is required for browser Web Crypto. The hash is held in a 30-minute HttpOnly, SameSite=Lax cookie, with Secure enabled on HTTPS. No token is stored in local/session storage or logged by application code.

After sign-in, pending context leads to `/household-invitations/accept`. Visiting the link does not redeem it; acceptance is an authenticated POST Server Action. The database checks confirmed `auth.users.email`, normalized to lowercase/trimmed, rather than submitted addresses or JWT email claims. Wrong accounts, unknown/expired/revoked/consumed invitations, existing household access, archived households, and ineligible selected participants are rejected atomically. Successful acceptance records one redemption. Invitation hashes cannot be selected by API roles; only household administrators can inspect invitation metadata. Redemption history is visible to the redeeming account and household administrators.

Use Dismiss invitation to clear pending context without consuming/revoking the invitation. Sign out and sign in with the invited email if the wrong account is active. Open the original link again if the continuation cookie expires; request a new invitation if the selected adult is no longer available. Household invitations are separate from existing group invitations.

## Database interfaces

All public RPCs are invoker wrappers around private implementations with fixed search paths and explicit authenticated grants. Ordinary application clients never use service-role credentials.

| Public RPC | Inputs | Result |
| --- | --- | --- |
| `onboard_household` | display name, first/last name, request UUID | Household UUID |
| `complete_household_onboarding` | household UUID, first/last name | Household UUID |
| `create_household_invitation` | household UUID, email, token hash, optional participant UUID | Invitation UUID |
| `accept_household_invitation` | token hash, first/last name | Household UUID |
| `revoke_household_invitation` | household UUID, invitation UUID | Void |
| `promote_household_member` | household UUID, user UUID | Void |
| `demote_household_owner`, `leave_household` | household UUID | Void |
| `remove_household_member` | household UUID, user UUID | Void |
| `archive_household_participant` | household UUID, participant UUID | Void |

The existing `create_household` RPC remains compatible. Archival columns are added to households/participants, and `disabled_at` to attendance/rides. New invitation/redemption tables have RLS. Clients cannot write archival/disable/linkage fields, household access, or onboarding completion directly. Generated public types come from linked Dev.

## Verification

Run `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. Browser tests use a mock provider and do not establish Cloud browser/auth integration.

For linked Dev database checks, set `RALLYROUTE_TEST_DATABASE_URL` securely to its PostgreSQL connection URL, then run `pnpm test:db:linked`. Requires `psql` and database-owner fixture setup permissions. This command explicitly assumes `postgres` for setup/snapshots, switches authorization assertions to ordinary `anon`/`authenticated` roles, and never resets or seeds Cloud. All fixtures and extension changes roll back. Namespace collisions abort rather than modify existing test identities. The local-only seed-idempotency suite is excluded. Do not point this command at production or place connection credentials in tracked files. Docker is optional for local/CI tests, not a requirement for linked development verification.

Also run `pnpm supabase db lint --linked --schema public,private`. Apply schema changes through new migrations and regenerate public types; never apply development seeds/resets to Cloud.

### Execution record

- Both new migrations applied to linked Dev through schema-only pushes; no Cloud seeds, resets, or role changes.
- All **13 migrations** replayed in a fresh native PostgreSQL/PostGIS database, the synthetic seed loaded transactionally, and **366 assertions across six suites** passed twice. Native Auth stubs are supplemental SQL evidence.
- Linked ordinary-role suites passed and rolled back. **360 assertions across five suites per run**, including 110 household onboarding assertions; repeated successfully. No synthetic Cloud identities remained after rollback.
- Two overlapping ordinary-role transactions in the disposable native database passed for simultaneous Owner demotions and simultaneous departures: an active household retained an Owner; the last departure archived it. Synthetic setup was cleaned up. This is a targeted serialization check, not a concurrency stress suite.
- `pnpm lint`, **57 Vitest tests**, `pnpm build`, and **13 mocked Playwright tests** passed. Linked `public,private` schema lint reported no errors; public types were regenerated after both migrations.
- Manual two-account Supabase Cloud browser smoke test: **passed all eight steps**, confirmed by the user on 2026-10-04. This establishes user-reported live household browser integration alongside the automated checks.

### Manual two-account checklist

**Completed:** the user reported all eight steps below passed on 2026-10-04.

1. In browser/profile A, sign in using a mailbox you control. Create a household and confirm your linked Adult and Owner role. Reload.
2. Add an unlinked Adult and optionally a Child. Invite mailbox B, selecting the Adult, and copy the full link.
3. In separate browser/profile B, open the link, sign in, and explicitly accept. Confirm the original Adult is linked once and your role is Member.
4. As B, add/edit an unlinked participant. Confirm household rename/invitation/access-management controls are unavailable.
5. As A, promote B to Owner. As A, step down and confirm Member status. As B, leave; reload A and confirm automatic succession to Owner.
6. Verify a revoked or consumed invitation fails without adding access. Use a third/wrong signed-in account only if available; database tests already cover forged/mismatched email claims.
7. As A, leave last. Confirm onboarding is offered and the former household URL is unavailable. No accounts are deleted.
8. Record actual outcomes/errors without sharing OTP codes or invitation links. Review preserved records through controlled database inspection if required; archived-household restoration is not available.
