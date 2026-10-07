# Phase 2: events, attendance, and ride preferences

Phase 2 is **complete on linked Dev**. Automated verification passed, and the user confirmed on 2026-10-05 that all previously outstanding Phase 2 manual testing is complete. Outstanding Phase 1 group/invitation verification remains separate.

## Where to start

Open a group and choose **Events and destinations**. The calendar offers Month, Week, Day, and weekly Agenda views using MIT-licensed FullCalendar 7.1.1. Mobile defaults to Agenda; larger screens default to Month. Validated `date` and `view` query parameters preserve the selected range when opening an occurrence and following its Group events link. Times use the browser timezone, identified above the calendar; occurrence details retain the original event timezone.

Group Owners and legacy Group Admins use **Create Event** (`/groups/:slug/events/new`), **Create Series** (`/groups/:slug/events/series/new`), and **Manage Destinations** (`/groups/:slug/events/destinations`). Each page checks group administration independently. Series creation/replacement returns to the calendar focused on the first generated occurrence; one-off creation opens the occurrence.

Calendar entries represent stored concrete occurrences, including edited exceptions and labelled cancellations. Activity endpoints take priority, with corresponding transportation anchors as fallbacks. Missing or invalid later endpoints render as timed markers without adding a stored duration. Range loading uses an authenticated Server Action and existing group RLS, paginates candidate records, and filters exact interval overlap (exclusive range end). No recurrence expansion or editing occurs inside the calendar. Loading failures offer Retry; superseded responses cannot replace the current range.

 Choose your household in the app header, open an event, and save each participant's attendance before configuring rides. Household screens link to **Pickup and dropoff addresses**.

Addresses remain manually entered, but saves now resolve coordinates server-side through Geoapify using OpenStreetMap data. The exact address is sent to that provider; users are told in the form. Unresolved addresses are rejected with an error. Coordinates are stored with the existing PostGIS geography fields; household coordinates remain private. Legacy addresses without coordinates are identified so an Owner/Admin can re-save and resolve them. Route calculations and geographic prefiltering are server-only and are not shown as match suggestions in this phase.

## Permissions

| Operation | Group Owner/Admin | Household Owner/Admin | Household Member |
| --- | --- | --- | --- |
| Read group events/destinations | Yes | With active group membership | With active group membership |
| Manage group events/destinations/series | Yes | Only with separate group administration | Only with separate group administration |
| Read/save household attendance and rides | Only with own household access | Own household | Own household |
| View/select exact household addresses | Only with own household access | Own household | Own household |
| Create/edit/archive household addresses | Only with own household management access | Own household | No |

Group administration belongs to an account and never grants access to another household's transportation records. Exact household addresses and preference snapshots remain in `private`; ordinary clients have no table grants. Public invoker RPCs delegate to fixed-search-path private implementations that validate the caller and lock the household/event records. Direct mutations of events, series, destinations, attendance, and rides are revoked.

## Dates, times, and history

Events store transport anchors as `timestamptz` and carry an IANA timezone. New forms default to the browser timezone and require confirmation. **Arrive by** anchors To event rides; **Ready to leave** anchors From event rides. At least one is required. Optional activity times are separate; explicit dates support overnight one-off events.

One-off input rejects nonexistent and repeated local times. Recurrence expands calendar dates with `rrule`, then converts local wall-clock times with Temporal. This preserves wall-clock times across daylight saving. Recurrence skips nonexistent times and chooses the earlier repeated instant, with preview disclosures.

Scheduled events may be edited until their first transportation anchor. Cancellation retains the event and attendance/history, disabling only ride legs whose anchors are still future. Name-only edits preserve preferences. Changes to anchor times, timezone, destination, or a saved destination's address require reconfirmation of affected future ride preferences. Revision checks reject stale submissions. Request UUIDs prevent duplicate event/series creation on retries.

Attendance is Unknown until explicitly saved. Only Going participants configure rides. Changing away from Going disables future preferences atomically; returning to Going does not reactivate them.

Each ride direction has independent Need ride, Can drive, Either, Self transport, or None preferences. Missing preferences are **Unconfigured**, distinct from explicit None. Active ride modes require an active owned location and concrete windows. Arrival defaults to ten minutes before the deadline through the deadline; departure defaults to readiness through ten minutes afterward. Windows cannot reverse, arrive after the deadline, or leave before readiness. Only Adults drive or choose Either. Drivers explicitly save 1–20 additional seats and 0–120 detour minutes; form defaults are one seat and ten minutes.

Self transport and None use no location, window, or driver fields. Invalidated preferences display **Needs reconfirmation** and retain prior values for review. Saving explicitly reactivates a valid preference. Replacing or disabling records snapshots their previous values into private audit history. Address archival disables affected future preferences. Archived households/participants cannot create new commitments.

## Recurrence and exceptions

Supported patterns are daily intervals, weekly intervals with selected weekdays, and monthly intervals with either calendar days 1–31 or first/second/third/fourth/fifth/last weekdays. Intervals default to one. The inclusive start/end range and batch are limited to 366 dates/occurrences. Missing calendar days and fifth weekdays are skipped, never shifted to month-end. Templates support same-day or next-day departure, and generate all concrete events immediately; no scheduler is used.

Preview occurrences before submitting. Every concrete occurrence has an immutable original local-date key unique within its series. Editing/cancelling **This occurrence** records an exception. **This and future occurrences** ends/deactivates the predecessor and atomically creates a successor, preserving historical and cancelled records. The form shows the replacement count and confirms that households must re-enter attendance and rides; commitments are not migrated.

## Verification

Automated results on 2026-10-04:

- `pnpm lint`: passed.
- `pnpm test`: 147 tests across seven files passed.
- `pnpm test:e2e`: 26 explicitly mocked browser tests passed; the three Phase 2 tests also passed after the final form/timezone changes.
- `pnpm build`: passed using the actual Dev environment after mocked browser builds.
- Fresh native PostgreSQL replay: all 21 migrations passed; development seed loaded twice transactionally without duplicates, then rolled back. All 598 pgTAP assertions passed on each of two runs; no fixture accounts remained. This disposable PostgreSQL uses minimal Auth stubs and supplements hosted verification.
- Linked Supabase Dev: all 592 assertions across nine suites passed on each of two runs. The local seed-only suite is intentionally excluded. All Cloud fixtures rolled back; zero synthetic fixture accounts remained.
- Four overlapping ordinary-role transaction checks passed: event edit versus ride save, cancellation versus attendance save, final household departure versus ride save, and duplicate series creation.
- `pnpm supabase db lint --linked --schema public,private`: clean; no application-schema findings. Public TypeScript types regenerated.
- Five new migrations applied schema-only to linked Dev; no Cloud seed or reset was run.

Database assertions use ordinary `anon`/`authenticated` roles and verified JWT subjects; fixture setup and private state snapshots use owner privileges. Browser tests are explicitly mocked and do not establish Cloud browser evidence.

Manual Cloud verification: the user initially deferred remaining checks on 2026-10-04, then explicitly confirmed on 2026-10-05 that the outstanding Phase 2 testing is complete and Phase 2 may be marked complete. The checklist below is retained for future regressions.

1. With two controlled accounts in distinct households in the same group, create a structured destination and a one-off event with both anchors. Confirm dates and timezone, including an overnight event.
2. Independently select each household in the app header, save Going attendance, add an owned private address, and configure To event and From event rides. Verify each household sees only its own participants, addresses, and preferences.
3. Confirm a Household Member can manage attendance/rides and select saved addresses, but cannot manage addresses or group events unless separately appointed Group Admin. Confirm a separate Group Admin cannot read household transportation data.
4. Change attendance to Not going, then Going; verify rides stay disabled until explicitly saved. Check driver eligibility and window/seat/detour validation.
5. Rename an event; preferences remain active. Change an anchor or destination/address; verify Needs reconfirmation, retained prior values, and explicit reconfirmation.
6. Cancel an event; verify future rides cannot be saved and history remains. Check past/started-event editing restrictions.
7. Preview/create daily, selected-weekday weekly, monthly calendar-day, and monthly ordinal-weekday series. Check missing day/fifth-weekday behavior and daylight-saving disclosures.
8. Edit/cancel one occurrence; confirm other occurrences remain. Replace this and future occurrences; verify cancelled predecessor events remain, successor attendance/rides are unconfigured, and historical events are unchanged.

No matching, routing, notifications, authentication-provider changes, deployment, commit, or push is included.

## Stable event URLs

Concrete events have automatic, immutable slugs unique within their group. Event detail URLs are `/groups/<groupslug>/<eventslug>`. UUIDs remain internal IDs for attendance, ride preferences, matching, carpool schedules, form submissions, and RPCs. Old `/groups/<groupslug>/events/<eventUUID>` URLs and UUID event segments return a generic 404 without redirects. Event management remains at `/groups/<groupslug>/events` and `/events/new` under the group.

Slugs normalize the initial name to lowercase ASCII hyphen-separated text, use `event` for an empty normalized name, and stay within 80 characters. Duplicate names receive an eight-character random hexadecimal suffix. Slugs reserve `events`, `members`, `settings`, `invite`, `share`, and `new`; reserved and UUID-shaped names receive an `event-` prefix. The database backfills in `created_at`, UUID order and enforces required, valid slugs and `(group_id, slug)` uniqueness. A private trigger generates all inserted slugs and rejects edits. Allocation locks the group row, matching existing event/series workflow locking, so concurrent same-group insertions serialize before selecting a slug. Public RPC signatures, UUID results, request idempotency, grants, and RLS remain unchanged.

Each recurring occurrence has its own slug, preserved across renaming, rescheduling, and cancellation. New replacement occurrences get new slugs. The group page displays each scheduled occurrence in the next seven days separately, soonest first, linking to its own slug. Slug lookups use the authenticated client and resolved group UUID; slugs do not grant discovery or access. After a successful save with an unavailable URL lookup, the app returns to `/groups?notice=group-link` with recoverable feedback.

Apply `20261006223000_event_slugs.sql` before deploying the route changes. The migration has been applied to linked Supabase Dev. Bookmarked UUID event URLs intentionally stop working with the application update.

Verification: `pnpm test:db:linked event_slugs.test.sql` runs rollback-only schema and authorization checks. `node scripts/test-event-slug-concurrency.mjs` uses disposable committed fixtures to verify concurrent one-off and series creation and idempotent retries, then removes them. It initializes the linked CLI login once through a dry run and uses independent `psql` sessions; it does not require Docker or print credentials.

Event cards include an Edit Occurrence link to `/groups/<groupslug>/<eventslug>/edit`. Recurring event cards also include an Edit Series link to `/groups/<groupslug>/<eventslug>/recurring`. Both links appear at the bottom of the card. The authenticated, group-scoped page uses the existing SeriesForm preview and confirmed replacement workflow. Owners and Admins may replace the selected future scheduled occurrence and later dates; other members and historical/cancelled occurrences are read-only. Changes create replacement occurrences and require fresh attendance and ride preferences. Nonrecurring events, wrong-group event slugs, and inaccessible records return a generic 404.

### Attendance across a recurring series

Each participant’s attendance form defaults to **This occurrence**. Choose **All upcoming occurrences** to preview and confirm a one-time replacement of attendance across existing scheduled occurrences in the same series, including individually edited occurrences. Past, ongoing, and cancelled events are excluded. The confirmation shows the participant, selected status, and occurrence count; changed targets or event revisions require a reload.

Household Members and Owners can update their own household’s participants. Group administration does not grant access to another household’s attendance. Updates are atomic and retain existing ride invalidation safeguards: Not going or Unknown disables ride preferences and invalidates affected commitments; Going does not restore disabled rides. Newly generated occurrences and successor series do not inherit this update.

### Ride preferences across a recurring series

Each ride form defaults to **This occurrence**. Choose **All upcoming occurrences** to preview and confirm a one-time replacement for that participant and direction across existing scheduled occurrences in the same series. Only occurrences that have not begun, have active Going attendance, and provide the chosen ride direction qualify. The confirmation reports eligible and skipped counts. Attendance is not changed.

Active modes copy the owned household address and applicable driving fields. Earliest/latest timestamps preserve their offsets from each occurrence’s arrival or departure anchor, including edited occurrences, overnight returns, and daylight-saving changes. Self transport and None clear active ride fields. Saving explicitly reconfirms the replaced preferences. Newly generated occurrences and successor series do not inherit them.

Bulk saves use the same authorization and carpool lifecycle policy as individual saves. Confirmed carpool agreements remain separate from discovery preferences; changing preferences alone does not silently rewrite or withdraw an agreement. Event, attendance, participant, and membership invalidation safeguards continue to apply. A change to the confirmed target set, attendance, event revisions, preferences, or address revision requires a fresh preview.

Verification: `pnpm test:db:linked series_ride_preferences.test.sql phase6_carpools.test.sql` and `node scripts/test-series-rides-concurrency.mjs` exercise linked Dev with transactional or disposable synthetic fixtures.

Occurrence views show event details, attendance, rides, and carpools. Event management lives on `/groups/<group-slug>/<event-slug>/edit`; recurring settings remain on `/groups/<group-slug>/<event-slug>/recurring`. Group event cards link directly to these edit pages.

Occurrence pages use the household selected in the app header, including its validated default when no selection is saved. Changing the header selection refreshes attendance, ride preferences, matches, and carpools. A selected household outside the group displays membership guidance instead of another household’s data. Legacy household query parameters do not override the header selection.

### Compact participant cards

Occurrence pages show the header household’s saved participation summary and one compact card per participant. Attendance and configured ride directions stay readable while editors begin collapsed. Click the attendance status or a direction’s Edit button to open that editor. Independent editors preserve drafts; Cancel discards only its draft and returns focus, while successful saves close only that editor and announce the result on the card. Failed saves and cancelled bulk confirmations keep the editor open. Switching households clears drafts and results. Saving attendance away from Going closes that participant’s ride editors.

The incomplete count includes missing, disabled, or unconfirmed preferences for active Going participants and configured future directions. Self transport and None count as configured. Cancelled or elapsed directions do not add incomplete work. Participant cards precede confirmed carpools and match discovery. Existing single-occurrence and recurring bulk rules, authorization, and database workflows remain unchanged.
