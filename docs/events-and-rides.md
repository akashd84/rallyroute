# Phase 2: events, attendance, and ride preferences

Phase 2 implementation is available on linked Dev. Completion is pending the two-household manual Cloud browser verification. Outstanding Phase 1 manual verification remains pending.

## Where to start

Open a group and choose **Events and destinations**. Group Owners and legacy Group Admins create structured, manually entered destinations, one-off events, and recurring series. Open an event, explicitly select one of your participating households, and save each participant's attendance before configuring rides. Household screens link to **Pickup and dropoff addresses**.

Addresses have no autocomplete, geocoding, map validation, or routing yet. Coordinates remain nullable. No Google keys are required.

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

Manual Cloud verification: user agreed to run the following checks on 2026-10-04; results pending.

1. With two controlled accounts in distinct households in the same group, create a structured destination and a one-off event with both anchors. Confirm dates and timezone, including an overnight event.
2. Independently select each household, save Going attendance, add an owned private address, and configure To event and From event rides. Verify each household sees only its own participants, addresses, and preferences.
3. Confirm a Household Member can manage attendance/rides and select saved addresses, but cannot manage addresses or group events unless separately appointed Group Admin. Confirm a separate Group Admin cannot read household transportation data.
4. Change attendance to Not going, then Going; verify rides stay disabled until explicitly saved. Check driver eligibility and window/seat/detour validation.
5. Rename an event; preferences remain active. Change an anchor or destination/address; verify Needs reconfirmation, retained prior values, and explicit reconfirmation.
6. Cancel an event; verify future rides cannot be saved and history remains. Check past/started-event editing restrictions.
7. Preview/create daily, selected-weekday weekly, monthly calendar-day, and monthly ordinal-weekday series. Check missing day/fifth-weekday behavior and daylight-saving disclosures.
8. Edit/cancel one occurrence; confirm other occurrences remain. Replace this and future occurrences; verify cancelled predecessor events remain, successor attendance/rides are unconfigured, and historical events are unchanged.

No matching, routing, notifications, authentication-provider changes, deployment, commit, or push is included.
