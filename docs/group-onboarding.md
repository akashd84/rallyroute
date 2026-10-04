# Group creation, invitations, and joining

This increment implements invite-only group creation, household joining, dashboards, settings, and copied invitations. Group administration belongs to an authenticated account independently of household access. Events, public discovery, join requests, administrator transfers, household removal, and leaving groups remain deferred.

## Routes and permissions

Open **Your groups** from the account or household screen. `/groups` lists groups visible through active household membership or separate group administration. `/groups/new` requires an active household the caller owns (legacy household Admins retain eligibility), a name, and an existing group type. Description is optional. Creation atomically adds the creator as Group Owner and joins only the selected household. A request UUID protects creation retries.

The group dashboard at `/groups/[id]` shows group information and only the caller's participating households. It has no other-household roster or participant/location/attendance/ride data. Household Owner succession, demotion, departure, and archival do not transfer or delete separate group administration. An administrator without household access can still open Your groups from onboarding.

| Capability | Group Owner / legacy Group Admin | Household Owner / legacy Household Admin | Household Member |
| --- | --- | --- | --- |
| View group | Administered group | Active household membership | Active household membership |
| Create group | Requires eligible household access too | Yes, for own active household | No |
| Edit group settings | Yes | Requires separate group administration | Requires separate group administration |
| Create/inspect/revoke group invitations | Yes | Requires separate group administration | Requires separate group administration |
| Join selected household | Requires eligible household access too | Yes, with valid invitation | No |
| Read invitation token hashes | No | No | No |
| View another household's private transportation data | No | No | No |

Only Group Owner is assigned by the new creation flow. Existing Group Admin permissions remain supported; this increment provides no administrator assignment or transfer UI.

## Invitation flow

Group administrators create **direct invitations** addressed to an email or **reusable group links**. Copy the generated link; RallyRoute does not send invitation emails. Every newly created invitation expires after seven days. Direct invitations permit one household redemption. Reusable links default to unlimited household redemptions; an optional positive integer sets a limit. Status, expiry, and usage remain visible to administrators, but the raw link is shown only at creation and cannot be recovered later. Revocation requires confirmation and does not remove existing memberships.

Codes contain six uniformly generated characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Server Actions send only SHA-256 hashes to PostgreSQL. Copy the code or `/join#g=CODE` link immediately; neither is recoverable later. Recipients can enter case-insensitive codes at `/join` with spaces/hyphens, or open a short link. The browser strips fragments and hashes codes before capturing the existing 30-minute HttpOnly continuation cookie. Existing long `/group-invitations/open#TOKEN` links remain supported. HTTPS or localhost is required; raw codes/tokens are excluded from HTTP URLs, application logs, and persistent browser storage. See [invitation codes](invitation-codes.md) for the shared database attempt limits and current verification record.

Sign-in resumes `/group-invitations/accept`. The authenticated preview exposes only group name, type, description, and group ID. Direct previews require the matching **confirmed `auth.users.email`**, normalized with trim/lowercase. JWT email claims and submitted email values cannot substitute. Reusable previews require possession of the hash and a confirmed account. Visiting/opening/previewing never redeems an invitation.

Joining requires explicit household selection and an authenticated POST. Owners and legacy Admins may select their active households; Members receive Owner guidance. If none is eligible or account names are missing, complete household onboarding first; successful setup resumes pending group acceptance. Joining one household never joins the account's other households. Dismiss clears pending context without consuming the invitation. If the continuation expires, reopen the original link. Wrong accounts can sign out and sign in again with the invited email.

Unknown, expired, revoked, exhausted, wrong-email, unconfirmed-direct-email, already-active, duplicate, and removed-household redemptions fail atomically. A household that left may rejoin with a fresh valid invitation. Success creates/reactivates one membership, records one redemption, increments usage once, and exhausts a limited invitation at its limit.

## Database implementation

Migrations `20261004043000_group_onboarding.sql` and `20261004045000_group_invitation_expiry.sql` extend existing controlled workflows. Public RPCs are invoker wrappers; privileged implementations remain in `private` with empty search paths and explicit grants. No privileged application credentials are used.

- `create_group_once`: household, name, type, request UUID, optional description; returns group UUID. The older `create_group` remains available.
- `create_group_invitation`: existing interface, with hash/email/type/limit validation. New invitations expire after seven days; omit the legacy expiry argument. An explicit different expiry is rejected, and existing invitation expiries are untouched.
- `inspect_invitation`: guarded authenticated household/group inspection, returning structured outcomes and minimal group metadata.
- `accept_invitation`: guarded household/group acceptance, returning structured outcomes and a fixed destination identifier.
- Ordinary execution of the former public/private preview/redemption entrypoints is revoked; private business logic is reused internally.
- `revoke_group_invitation`: group/invitation UUIDs, administrator check, active invitation revocation.

Creation/redemption lock the household and recheck active management access while holding that lock. Redemption then locks the invitation, preserving usage limits across concurrent households. Lifecycle changes use the same household lock. Creation request identifiers are in a private table unavailable to clients. Group name/description updates are validated by a database trigger as well as Zod. Invitation SELECT grants expose metadata columns only; direct membership inserts remain denied.

## Verification

Run `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. Browser tests use mocked Auth/PostgREST and do not establish live Cloud browser integration. Real grants/RLS and controlled functions are covered by pgTAP, including forged JWT email claims, isolated households, confirmed Auth email, retries, legacy Admins, limits, previews, revocation, and independent group administration.

For rollback-only Cloud checks, set `RALLYROUTE_TEST_DATABASE_URL` securely and run `pnpm test:db:linked` twice, followed by `pnpm supabase db lint --linked --schema public,private`. Requires `psql` and owner privileges for synthetic setup; assertions switch to ordinary roles and verify `current_user`/`auth.uid()`. Never seed or reset Cloud. Docker is optional, not required for linked development checks. Public TypeScript types must be regenerated after schema changes.

The optional serialization runner requires a separate disposable, migrated local PostgreSQL database. Set `RALLYROUTE_DISPOSABLE_DATABASE_URL` securely, then run `node scripts/test-db-serialization.mjs`. It accepts only loopback hosts and database names beginning `rallyroute_test_`, refuses synthetic namespace collisions, and cleans up its committed cross-connection fixtures. It is deliberately excluded from the Cloud transaction-only runner. No Docker installation is required; it can run against native PostgreSQL. Never point it at a database containing development or real user data.

### Execution record — 2026-10-04

- Both migrations validated on disposable native PostgreSQL/PostGIS before schema-only Dev rollout. All **15 migrations** replayed from scratch; development seed loaded twice transactionally and rolled back.
- Final native suites passed twice: **455 assertions across seven suites**, including **89 group onboarding assertions**. Native Auth stubs are supplemental SQL evidence.
- `scripts/test-db-serialization.mjs` passed three overlapping ordinary-role native transaction checks: two households competing for one final invitation use, joining during sole-Owner demotion, and joining during last-account departure/archival. Rejected joins left usage/audit unchanged. Synthetic native fixtures were cleaned up. This is targeted serialization verification, not a concurrency stress suite.
- Linked Dev real-role suites passed twice: **449 assertions across six suites per run**. All fixtures rolled back, with **zero synthetic accounts remaining**. No seeds/resets or real account changes.
- `pnpm lint`, **92 Vitest tests**, **19 mocked Playwright tests**, and `pnpm build` passed. Linked `public,private` schema lint reported no errors or warnings. Public types were regenerated from Dev.
- Manual two-account Cloud browser smoke test: **pending user execution**. Group onboarding and Phase 1 are not marked complete until this passes.

### Manual two-account checklist

Use mailboxes/accounts and households you control, in separate browser profiles. Do not share OTP codes or invitation links in test reports.

1. As A, open Your groups, create a group with an owned household, and reload. Confirm Group Owner status and that household's membership.
2. As A, create a direct invitation to B and copy the full link including the fragment.
3. As B, open the link, sign in if needed, and confirm only minimal group preview appears. Complete household setup if needed; verify acceptance resumes. Select one owned household explicitly and join.
4. As B, reload the dashboard. Confirm only B's participating household appears and settings/invitation controls are unavailable despite B owning that household. A's participants and private data must not appear.
5. As A, change group name/description and verify the new values. A remains Group Owner independently of household roles.
6. Create a reusable link, optionally with a use limit. Join a different eligible household, confirming other households are not automatically joined. Reopening consumed direct or exhausted limited invitations must fail.
7. As A, create a fresh reusable link, revoke it with confirmation, and verify another authenticated account cannot accept it. Existing memberships remain.
8. Report passed steps or exact errors, without codes/links. Completion status changes only after automated checks and this manual test pass.
