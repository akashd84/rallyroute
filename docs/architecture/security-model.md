# RallyRoute Security Model

Phase 6 [agreed carpools](../carpools.md) uses household-scoped metadata and private participant/approval records. Controlled projections release only explicitly selected names and ride roles after carpool acceptance. Both households approve the same ride revision; database constraints prevent duplicate confirmed assignments. Connection and participation lifecycle changes persist revocation, and carpool acceptance does not extend pickup-address consent.

## Purpose

RallyRoute handles sensitive information about households, transportation routines, and exact pickup locations. Security and privacy are therefore product requirements, not optional implementation details.

This document describes the current Phase 0 security model and the rules future features must preserve.

The SQL migrations under `supabase/migrations/` remain the source of truth for implemented grants, Row Level Security policies, triggers, and controlled functions.

---

## Security Principles

### 1. Authentication and authorization are separate

Supabase Auth answers:

> Who is this user?

RallyRoute authorization answers:

> What may this authenticated user read or change?

A valid login does not imply permission to access another household, group, event participation record, or sensitive location.

### 2. UI hiding is not authorization

Sensitive data must be protected by database grants, RLS, private schemas, controlled functions, and server-side checks.

Never rely on:

- hidden UI
- disabled buttons
- client-side filtering
- route guards alone

as the primary security boundary.

### 3. Least privilege

Browser-accessible roles should receive only the privileges they need.

Do not grant broad write access when a narrow column grant or controlled function is sufficient.

### 4. Sensitive data should not be returned unnecessarily

The browser should receive only data required for the current UI.

Exact household locations and raw private ride data should not be exposed to unrelated households.

### 5. Trusted group membership is not blanket trust

Being in the same Group allows users to discover relevant group information, but it does not automatically grant access to:

- another household's exact address
- precise household coordinates
- another household's private ride preferences
- private contact information

---

## Authentication

RallyRoute uses Supabase Auth.

Planned MVP authentication methods:

- Google OAuth
- email OTP

Password authentication is not required for the MVP.

Only authenticated adults receive login accounts.

Children and other non-account household members are represented as `household_members` without needing credentials.

---

## Authentication Identity

### `auth.users`

Managed by Supabase.

### `public.profiles`

A profile row is automatically created when an Auth user is created.

The authenticated user may read and update only their own profile through current RLS policies.

---

## Authorization Layers

RallyRoute intentionally uses multiple layers.

### PostgreSQL grants

Table and column privileges define what the `authenticated` role may attempt.

### Row Level Security

RLS determines which rows the current authenticated user may access.

### Controlled database functions

Privileged workflows that need multiple writes or bypass normal RLS use carefully controlled functions.

### Application/server authorization

Sensitive workflows should also validate assumptions server-side rather than trusting values supplied by the browser.

These layers are complementary.

---

## Public and Private Schemas

### `public`

Contains application-facing tables protected by grants and RLS.

Examples:

- profiles
- households
- household_members
- groups
- events
- ride_participation

### `private`

Contains sensitive/internal data and privileged helper functions.

Examples:

- `private.household_locations`
- authorization helper functions
- privileged workflow implementations

The private schema is not intended to be directly exposed through the normal client API.

Do not move sensitive tables or privileged implementations into `public` merely for convenience.

---

## SECURITY DEFINER Rules

Privileged `SECURITY DEFINER` implementations belong in `private`.

Exposed functions in `public` should normally be narrow wrappers with explicitly granted execution rights.

Current examples include the controlled household/group/invitation workflows.

All privileged functions should:

- use a fixed/empty `search_path`
- explicitly qualify table/function names
- verify `auth.uid()`
- validate ownership/admin rights
- avoid trusting caller-supplied identifiers without authorization checks
- have execution revoked by default and granted deliberately

Default function execution privileges in `public` have been hardened so future public functions are not automatically executable by API roles.

---

## Household Security

### Household access

`public.household_access` maps authenticated users to households.

Roles:

- owner
- admin
- member

Authorization helper functions include:

- `private.is_household_member()`
- `private.is_household_admin()`

These helpers avoid recursive RLS patterns.

### Household creation

Users do not directly insert an arbitrary household plus owner relationship.

The controlled household creation workflow atomically:

1. creates the household
2. assigns the authenticated caller as owner

This prevents orphaned households or caller-selected owners.

### Household members

Only users with appropriate access to a household may see its household members.

Household owners/admins control member creation and updates.

`linked_user_id` is intentionally not broadly writable through normal client CRUD because linking an authenticated identity to a transportation participant is security-sensitive.

---

## Group Security

### Groups are the trusted discovery boundary

A household must have an active group membership for the user to see normal group information.

Helper functions include:

- `private.is_group_member()`
- `private.is_group_admin()`

### Administration

Group administration belongs to specific authenticated users through `group_admins`.

A household joining a group does not make every authenticated person in that household a group administrator.

### Group creation

The controlled `create_group` workflow verifies that the caller is allowed to act for the household, then atomically:

1. creates the group
2. makes the caller group owner
3. creates the household's active group membership

---

## Invitation Security

RallyRoute supports:

- direct invitations
- reusable group links

### Raw token handling

The application must generate a cryptographically random raw token.

Example conceptual flow:

```text
random raw token
      │
      ├── placed in invite URL
      │
      └── SHA-256 hash
              │
              ▼
        stored in database
```

The raw token must never be stored in the database.

The database stores `token_hash` only.

### Direct invitations

Direct invitations:

- require an invited email
- have one use
- require the authenticated user's email to match the invited email at redemption

This prevents a forwarded direct invitation from silently granting access to a different account.

### Reusable links

Group links may:

- have a configured maximum use count
- be unlimited within application policy
- have an expiration
- be revoked

### Redemption

Invitation redemption occurs through a controlled atomic workflow that validates:

- authenticated caller
- caller authority over the target household
- token validity
- invitation status
- expiration
- use limit
- direct-email match when applicable
- existing membership state

The workflow then:

- creates or reactivates membership
- records the redemption
- increments usage
- marks the invitation exhausted when appropriate

A household that was explicitly `removed` cannot rejoin using an invite link.

---

## Location Security

### Event locations

`public.event_locations` contains group-visible destinations such as:

- schools
- parks
- camps
- offices
- sports fields

Group members may view relevant event destinations.

Group admins manage them.

### Household locations

`private.household_locations` contains sensitive origin/pickup/dropoff locations.

It is intentionally stored in the private schema.

Direct API-role access is revoked.

Exact household coordinates should not be returned to another household merely because they share a Group or Event.

Future matching code may use exact coordinates internally to calculate compatibility without exposing those coordinates to other users.

---

## Event Security

Group members may view normal Event and Event Series details for groups they belong to.

Examples:

- name
- destination
- required arrival time
- departure time
- activity time

Only group admins may create/update/delete group event definitions under the current model.

Integrity triggers ensure that:

- an Event Location belongs to the same Group
- an Event Series belongs to the same Group

This prevents cross-group identifier injection.

---

## Attendance Privacy

`public.event_participation` is intentionally not group-visible.

A household may view/manage participation only for members it is allowed to access/manage.

Example:

A household may see:

```text
Neera → going
Akash → going
```

but should not be able to freely query:

```text
Maya Patel → going
```

even when both households are in the same soccer group.

The future matching system may use attendance internally without exposing a raw group attendance roster.

---

## Ride Preference Privacy

`public.ride_participation` contains sensitive behavioral data such as:

- need ride
- can drive
- either
- household-side location
- available seats
- maximum detour
- acceptable time windows

Current RLS restricts raw ride participation to the participant's household.

Other households should receive a purpose-built Match result later rather than direct access to another family's underlying ride record.

This distinction is important:

```text
Not allowed:
"Show me every family's raw ride preferences."

Allowed future behavior:
"RallyRoute found a compatible household for this event."
```

---

## Database Integrity as Security

RallyRoute uses database constraints and triggers to enforce domain invariants even if application code is incorrect.

Current ride validation includes:

- household must belong to the event's Group
- member must be marked going
- selected household location must belong to that household
- only adults may offer to drive in MVP
- event must actually support the requested leg

Future code must not remove these safeguards simply because similar validation exists in TypeScript.

Application validation improves UX. Database validation protects integrity.

---

## Service Role

Do not use a Supabase service-role key in browser code.

Never expose it using a `NEXT_PUBLIC_*` variable.

A service-role key bypasses RLS and should be introduced only for a concrete trusted server-side requirement.

Prefer authenticated user access through RLS or narrow controlled functions where possible.

---

## Environment Secrets

Never commit:

- `.env.local`
- Supabase service-role credentials
- database passwords
- OAuth client secrets
- Google Maps secret/server credentials
- raw invitation tokens

Public/publishable client keys may be used only as intended by Supabase and do not replace RLS.

---

## Authorization Helper Pattern

Use private authorization helpers when a policy needs to inspect protected relationship tables and a direct subquery could create recursive RLS behavior.

Examples already used:

- household membership
- household admin
- group membership
- group admin
- household-member access
- household-member management

Do not duplicate these rules loosely across many policies when a shared helper better expresses the invariant.

---

## Future Match Privacy

When matching is implemented, the internal engine may need:

- exact geographic points
- raw ride preferences
- event participation
- route calculations

The user-facing Match result should contain only the minimum useful summary.

Before mutual connection, likely visible fields include:

- first name or household display identity appropriate to product policy
- shared group/event
- compatible ride leg
- schedule overlap
- available capacity when needed
- approximate route impact
- general area if useful

Before mutual connection, do not expose by default:

- exact address
- precise coordinates
- unnecessary phone/email
- unrelated event participation
- raw underlying preference records

---

## Connection Privacy

The Phase 5 Connection workflow explicitly controls when additional information becomes visible. See [connections and controlled sharing](../connections.md) for the implementation and consent lifecycle.

Mutual connection acceptance may unlock selected contact/pickup details according to product rules.

Do not infer:

```text
same group = connected
```

or:

```text
match suggestion = permission to view exact address
```

Those are distinct states.

---

## Logging and Auditability

Current invitation redemptions provide an explicit audit trail.

As sensitive workflows expand, prefer auditable state changes for operations such as:

- invitation use
- group removal
- connection acceptance
- privacy-sensitive data release
- administrator actions

Avoid unnecessary logging of raw sensitive values.

Never log raw invitation tokens or secrets.

---

## RLS Testing Requirements

Security-sensitive database changes should include explicit negative tests.

At minimum, test that:

1. User A can read their own profile
2. User A cannot read User B's private profile data outside intended policies
3. household members cannot be accessed by unrelated households
4. a non-admin cannot manage another household's members
5. a user outside a Group cannot read that Group
6. a normal Group member cannot administer the Group
7. raw event participation from another household is not readable
8. raw ride participation from another household is not readable
9. private household locations cannot be queried through the normal client
10. direct invitations cannot be redeemed by the wrong authenticated email
11. exhausted/revoked/expired invitations fail
12. a removed household cannot rejoin through normal invitation redemption

A security test should prove both allowed and denied behavior.

---

## Security Review Checklist for New Features

Before finishing a feature, ask:

- What new data is stored?
- Is any of it sensitive?
- Which authenticated users genuinely need it?
- Is the table in the correct schema?
- Are grants narrow enough?
- Is RLS enabled?
- Are SELECT/INSERT/UPDATE/DELETE policies all intentional?
- Could a caller substitute another household/group/member ID?
- Does the database validate cross-entity relationships?
- Does the browser receive more data than it needs?
- Does any new function require SECURITY DEFINER?
- If yes, can the implementation remain private?
- Are secrets or exact locations being logged?
- Are negative authorization tests included?

---

## Validation Commands

For database security changes:

```bash
pnpm supabase db lint --linked --schema public,private
```

Do not treat PostGIS extension lint findings as RallyRoute-owned errors unless the changed code actually modifies the extension.

Also run:

```bash
pnpm lint
pnpm build
```

and regenerate public database TypeScript types after schema changes.

## Phase 2 controlled mutations

Events, event series, group destinations, attendance, and ride preferences now reject direct API mutations, including column-level INSERT/UPDATE grants. Use `event_workflow` and `series_workflow`; these invoker interfaces call private implementations that validate identity, permissions, revisions, lifecycle state, and transportation integrity. Saved household addresses are read through `household_location_list` and managed through `event_workflow`, with no direct private-table grants. Preference history and historical address snapshots remain private. See [events and rides](../events-and-rides.md) for the active permission matrix and locking/verification behavior.
