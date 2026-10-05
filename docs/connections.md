# Phase 5: connections and controlled sharing

Phase 5 is **complete on linked Dev**. Automated verification passed, and the user confirmed completion of Phase 5 manual testing on 2026-10-05. Phase 5 adds household connections originating from a verified Phase 4 match. It does not reserve seats or create carpools. Every authenticated account with active household access can request, accept, decline, withdraw, or disconnect. Group administration alone grants no access.

## User workflow

1. Find matches on an event, open **Request to connect**, review the originating group/event, selected household, and your contact preview, then explicitly confirm sharing. Existing pending/accepted connections show their status on match cards.
2. Open **Connections** from the account or household page. Incoming counts identify actionable requests; separate sections show incoming, outgoing, accepted, and historical records.
3. The recipient previews and confirms their own name, confirmed Auth email, and optional phone before accepting. Neither side sees the other contact while pending. After acceptance, current accounts in both households can view both contacts and use email/phone links.
4. Either household may disconnect. The requesting household may withdraw; the recipient may decline. Reverse requests require explicit acceptance. Requests expire after seven days; terminal records remain in history. Declined, expired, withdrawn, and disconnected pairs can explicitly request again from a current match.
5. Acceptance does not share addresses. On an accepted connection, open **Share a pickup address**, choose an owned saved address, event in the originating group, and direction, review the exact address and expiry, then confirm sharing. Sharing can be withdrawn independently.

Connections apply across events while both households retain active membership in the originating group. Changing the original match, cancelling the originating event, or that event ending does not invalidate a pending request. Group departure, household archival, or loss of household access by a shared contact closes the connection. Rejoining does not restore consent. Only the contact owner can update their shared contact; other household accounts can disconnect and establish a fresh connection using their own contact.

Pickup sharing ends at the selected arrival/departure anchor. Event cancellation, transportation-anchor/destination/timezone changes, address editing/archival, withdrawal, and disconnection remove access. An edited address requires an explicit new share. One active share exists per connection, sharing household, event, and leg; replacements preserve revoked history. Recipients cannot edit or withdraw the other household's share. Revocation prevents future reads through RallyRoute but cannot erase details someone already copied.

## Database and server boundaries

`public.household_connections` stores metadata under household-only RLS. API clients receive select access only; controlled functions own mutations. `private.connection_contacts` holds explicitly consented contact snapshots. `private.connection_pickups` holds event/leg-specific location references, revisions, expiry, and revocation history. These private tables have RLS and no anonymous/authenticated table grants.

`public.request_connection` is service-role-only. The Server Action verifies Auth with `getUser()`, authenticates a domain-separated AES-256-GCM proof bound to user, selected/counterpart household, concrete event/leg, candidate key/fingerprint, geographic bound, and 30-minute expiry, then invokes creation. SQL rechecks the live candidate and snapshot. No route IDs, fingerprint, or coordinates appear in readable proof contents. Proofs cannot be substituted for Phase 4 continuation cursors.

`public.connection_action` is an authenticated invoker wrapper for accept/decline/withdraw/disconnect/contact/share/revoke operations. `public.list_connections` returns a purpose-built projection and persists expiry/invalid-state closure. Privileged implementations use fixed empty search paths in `private`, verify current household access, and do not derive consent from UI visibility. Contact names/email come from profiles and confirmed `auth.users`, never submitted identity fields. Optional phone numbers support 7–15 digits and ordinary international formatting without SMS verification.

Households are locked in stable UUID order, followed by the connection row. A partial unique index admits one pending/accepted record per unordered household pair. Explicit revisions guard stale transitions; repeated completed transitions and identical shares are idempotent. Lifecycle triggers persist closure on membership/access changes, including leave/rejoin between reads. Every contact/pickup read rechecks active consent and eligibility. Pickup responses expose structured addresses and labels, never coordinates, location IDs, or route internals.

## Verification and manual acceptance

The real-auth browser smoke test exercises two disposable accounts against linked Dev, actual routing, request/accept, pre-acceptance privacy, explicit address sharing for both directions, edit invalidation, independent withdrawal, disconnect, group leave/rejoin, simultaneous requests, and repeated acceptance. It removes its isolated group/households/accounts and asserts zero remaining test identities. It sends no email. Successful route cache entries/provider counters may remain; global counters are never reset.

Run rollback-only linked SQL verification:

```sh
pnpm test:db:linked phase5_connections.test.sql phase4_matching.test.sql events_phase2.test.sql phase3_geographic_routing.test.sql provider_usage.test.sql
```

Explicitly opt into the real-auth browser check:

```sh
RALLYROUTE_TEST_PHASE5_BROWSER=1 pnpm exec playwright test --config playwright.live.config.ts tests/live/phase5.spec.ts
```

Rocket's existing temporary Chromium dependency bundle can be enabled through `LD_LIBRARY_PATH=/tmp/rallyroute-browser-libs/root/usr/lib/x86_64-linux-gnu`. This is verification infrastructure, not an application or deployment dependency.

Manual user acceptance **passed**, confirmed by the user on 2026-10-05. This sign-off is separate from automated browser evidence. The following two-household checklist is retained for future regressions:

1. Request from a match. Verify the recipient's pending screen shows no requester contact or pickup address; check the incoming account count.
2. Change the original preferences, then accept. Verify both contacts become visible, but addresses remain private.
3. Share a saved address for one event/direction. Verify only that share is visible. Withdraw it, then verify it disappears for the recipient.
4. Re-share, then edit/archive the address or cancel the event. Verify the recipient loses access and a new share requires confirmation.
5. Decline/withdraw requests; disconnect an accepted connection. Verify history persists and contact/address access ends.
6. Leave/rejoin the originating group, or remove the contact account from its household. Verify the connection stays closed.
7. Test a Household Member and a separate Group Admin: the Member can manage their household connection; the Group Admin cannot view contacts or manage another household's connection.

Built-in chat, notification email, carpool creation, seat reservation, and driver assignment remain outside Phase 5.
