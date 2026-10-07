# Invitation codes

Household invitations, direct group invitations, and reusable group invitations now use six-character codes. Their permission, email, expiry, and usage rules are unchanged. Existing long links remain valid until their original expiry/revocation and use the same guarded acceptance APIs.

## Create and share

An authorized Owner creates an invitation in household or group settings. Copy its **Invitation code** or **Invitation link** immediately. Both are shown only at creation; neither can be recovered from invitation history. RallyRoute does not send invitation emails.

The alphabet is `ABCDEFGHJKMNPQRSTUVWXYZ23456789`: 31 characters, giving **887,503,681 combinations**. Codes exclude O, 0, I, 1, and L. Each character is selected uniformly with Node's cryptographic `randomInt`; generation retries at most five times on hash collisions. Uniqueness is enforced within each invitation table, including historical rows; household and group codes have separate namespaces.

Only the SHA-256 hash of the canonical uppercase code reaches PostgreSQL. No raw-code column or registry is added. Codes and hashes are not logged by application code. Public invitation SELECT grants still exclude hashes. The database retains existing invitation IDs, history, and expiry rules.

New shareable links use `/join#h=CODE` for households or `/join#g=CODE` for groups. HTTPS or localhost is required for Web Crypto.

## Enter and accept

Open **Join with an invitation code** from sign-in, account, onboarding, or Your groups. Choose Household or Group and enter the code. Lowercase is accepted; spaces and hyphens are removed. Excluded characters are rejected, not translated into other letters/numbers. Input is bounded to 32 characters before normalization; the canonical code must be six characters.

Opening a short link removes the fragment before any Server Action request. Manual entry and short links hash the normalized code in the browser, then send only the hash to capture continuation context. No code is stored in local/session storage. Existing long-link routes hash the original token without code normalization.

The existing 30-minute HttpOnly, SameSite=Lax continuation cookies are retained (Secure on HTTPS). Opening another household/group invitation replaces earlier context. Sign-in and household setup preserve the pending invitation. Dismiss clears the context without consuming/revoking the invitation.

An authenticated preview precedes acceptance. Household inspection confirms availability without exposing household details; group inspection exposes only group ID, name, type, and description. Household/direct group invitations match confirmed `auth.users.email`, never JWT email claims or submitted emails. Group acceptance requires explicit selection of a household the account owns or administers through the legacy Admin role. Members receive Owner guidance.

Opening, entering, or previewing never joins. An explicit authenticated POST accepts. Successful acceptance preserves exactly-once membership/linkage, audit, usage, and exhaustion behavior. Rejected acceptance preserves invitation and membership state.

## Attempt limits and RPCs

Inspection and acceptance share **10 attempts per minute and 50 per hour per authenticated account** across both invitation kinds. Fixed windows begin with the first admitted attempt and reset after their durations. Valid, invalid, and provider-failure lookups count. Throttled requests perform no invitation lookup and do not increment beyond the cap. The UI reports retry seconds; wait and reload/retry, or reopen the original link if continuation expired.

A private table holds one counter row per account, containing timestamps/counts only. Row locking serializes updates. Counter updates happen outside the inner exception block for invitation operations, so failed lookups/joins retain their attempt count while invitation mutations roll back. No client can read/write the counter table or execute its budget helper. Limits are per account; they do not implement a global or IP-based cap.

Public invoker wrappers call private privileged implementations with fixed empty search paths and explicit authenticated grants:

| RPC | Inputs | Structured result |
| --- | --- | --- |
| `inspect_invitation` | `p_kind` (`household`/`group`), `p_token_hash` | `status`; successful group inspection also returns `group` metadata |
| `accept_invitation` | kind/hash; group household UUID or household first/last names | `status`; success returns `destination_kind` and `destination_id` |

Outcomes are `ok`, `invalid`, `throttled` (with positive `retry_after_seconds`), or `unavailable`. Server Actions validate the response, construct household routes from UUIDs, and resolve group UUIDs to their RLS-visible stable slugs before constructing group routes. Unavailable group URL lookups return to the group list with recovery guidance. Unexpected provider details are never displayed. Anonymous callers cannot execute these RPCs.

Ordinary-role execution of the old public/private `preview_group_invitation`, `redeem_group_invitation`, and `accept_household_invitation` entrypoints is revoked. The guarded implementations reuse their existing private business logic; clients must switch to the new RPCs. Legacy **links** remain compatible through updated application callers. Invitation creation/revocation RPCs remain available with existing authorization.

## Verification record — 2026-10-04

- Migration `20261004060000_invitation_codes.sql` validated on disposable native PostgreSQL/PostGIS before a schema-only Dev push. No Cloud seeds, resets, or real account changes.
- All **16 migrations** replayed from scratch; seed loaded twice transactionally and rolled back. **517 assertions across eight native suites** passed twice. Native Auth stubs are supplemental SQL evidence.
- Linked Dev ordinary-role checks passed twice: **511 assertions across seven suites per run**, including **62 invitation-code assertions**. Fixtures rolled back; **zero synthetic accounts remained**.
- Four targeted ordinary-role native concurrency checks passed: final invitation use, joining during Owner demotion, joining during archival, and simultaneous attempts at the shared minute cap. The loopback-only disposable runner cleans up its committed fixtures; it never targets Cloud.
- `pnpm lint`, **117 Vitest tests**, **23 mocked Playwright tests**, and `pnpm build` passed. Linked `public,private` schema lint reported no errors or warnings; public types were regenerated.
- Manual short-link testing: **passed**, reported by the user on 2026-10-04. The report confirms short links; it does not specify invitation kinds or individual checklist steps.
- Remaining manual verification, including manual code entry and the full two-account checklist: **pending**. Mocked browser tests do not establish live Cloud browser integration. Roadmap completion remains unchanged.

Run `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm test:db:linked` twice, and `pnpm supabase db lint --linked --schema public,private`. See [database testing](database-testing.md) for secure connection setup and [group onboarding](group-onboarding.md) for the disposable concurrency runner. Docker is optional for linked verification.

## Manual Cloud checklist

Use two controlled accounts in separate browser profiles; report outcomes without sharing codes, links, or OTPs.

1. As A, create a household invitation for B, optionally selecting an unlinked Adult. Confirm six-character code and short link appear with both copy controls.
2. As B, enter a lowercase/spaced/hyphenated version at `/join` with Household selected, sign in, and explicitly accept. Confirm Member access and one linked Adult.
3. As A, create a direct group invitation to B. As B, open its short link, confirm the fragment disappears, select an owned household, and explicitly join. Complete household setup first if needed and verify acceptance resumes.
4. Create a reusable group invitation and join another eligible household using manual Group code entry. Verify unrelated households are not joined and household ownership does not reveal group administration controls.
5. Revoke fresh household/group invitations. Their codes and links must fail; consumed direct or exhausted limited invitations must also fail without adding access.
6. If an existing, unexpired long invitation is available, verify it still previews/accepts through the updated app. Automated coverage also exercises both legacy routes.
7. Optionally repeat inspection until throttled; confirm retry timing, preserved continuation, and recovery after the stated wait. Database tests already verify both windows and concurrency without waiting.
8. Record actual results. Mark code-flow verification complete only after this checklist passes; Phase 1 also requires its pending group onboarding smoke test.
