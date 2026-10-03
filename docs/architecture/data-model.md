# RallyRoute Data Model

## Purpose

This document defines the RallyRoute domain model and the current Phase 0 database structure.

The SQL migrations under `supabase/migrations/` remain the source of truth for the implemented schema. This document explains the intent and relationships behind that schema.

## Core Domain Model

RallyRoute is organized around these concepts:

```text
Authenticated User
        │
        ▼
      Profile
        │
        ▼
     Household
        │
        ├── Household Access
        │
        └── Household Members
                 │
                 ▼
              Groups
                 │
          ┌──────┴──────┐
          ▼             ▼
     Event Series      Events
                          │
                          ▼
                 Event Participation
                          │
                          ▼
                  Ride Participation
```

The central modeling rules are:

1. authentication identity is separate from transportation identity
2. households join groups
3. household members participate in events
4. driver and rider are per-ride roles, not permanent person types
5. concrete events are the matching unit
6. exact household locations are sensitive/private data

---

## Authentication Identity

### `auth.users`

Managed by Supabase Auth.

Represents an authenticated person who can sign into RallyRoute.

Authentication identity must not be confused with a transportation participant.

### `public.profiles`

One profile per authenticated user.

Key fields:

- `id` → `auth.users.id`
- `first_name`
- `last_name`
- `phone`
- `onboarding_completed_at`
- timestamps

A profile row is automatically created after a Supabase Auth user is created.

---

## Households

### `public.households`

The household is the main account/membership unit for transportation and group membership.

Key fields:

- `id`
- `display_name`
- timestamps

Examples:

- Desai Household
- Patel Household

A household is not itself an authenticated account.

### `public.household_access`

Defines which authenticated users can access a household.

Composite primary key:

- `household_id`
- `user_id`

Roles:

- `owner`
- `admin`
- `member`

This allows multiple authenticated adults to manage the same household without sharing credentials.

Example:

```text
Akash auth user ─────┐
                     ├── Desai Household
Amisha auth user ────┘
```

Household creation is performed through a controlled `create_household()` workflow so creation of the household and its owner relationship occur atomically.

---

## Household Members

### `public.household_members`

Represents people who may participate in transportation.

Key fields:

- `id`
- `household_id`
- `linked_user_id` nullable
- `first_name`
- `last_name` nullable
- `member_type`
- timestamps

Current `member_type` values:

- `adult`
- `child`

A household member does not need to have a login.

Example:

```text
Desai Household
├── Akash
│   member_type = adult
│   linked_user_id = authenticated user
├── Amisha
│   member_type = adult
│   linked_user_id = authenticated user
└── Neera
    member_type = child
    linked_user_id = null
```

### Important modeling rule

Do not create separate `parents` and `children` tables.

The neutral `household_members` model allows RallyRoute to support:

- families
- workplace carpools
- adult community groups
- future non-family use cases

The UX may still use family-oriented labels when appropriate.

---

## Groups

### `public.groups`

A Group establishes the trusted discovery and matching boundary.

Current group types:

- `school`
- `camp`
- `sports`
- `workplace`
- `club`
- `community`
- `other`

Key fields:

- `id`
- `name`
- `group_type`
- `description`
- `created_by_user_id`
- timestamps

Examples:

- Northwestern Middle School
- Camp All-American
- Milton Eagles U14
- Chase Atlanta Employees

### `public.group_admins`

Administration belongs to authenticated users, not households.

Roles:

- `owner`
- `admin`

Composite primary key:

- `group_id`
- `user_id`

### `public.group_memberships`

Households join Groups.

Key fields:

- `group_id`
- `household_id`
- `status`
- `joined_at`
- timestamps

Status values:

- `active`
- `left`
- `removed`

Unique constraint:

```text
(group_id, household_id)
```

This prevents duplicate memberships for the same household.

---

## Invitations

### `public.group_invitations`

Represents a direct invitation or reusable group link.

Invite types:

- `direct`
- `group_link`

Important fields:

- `group_id`
- `created_by_user_id`
- `invited_email` nullable
- `token_hash`
- `status`
- `max_uses`
- `use_count`
- `expires_at`

Current status values:

- `active`
- `revoked`
- `exhausted`

The raw invitation token must never be stored in the database.

The application generates a cryptographically random raw token, places it in the invite URL, hashes it, and stores only the hash.

For direct invitations:

- `invited_email` is required
- `max_uses = 1`
- redemption requires the authenticated user's email to match

For shareable links:

- `invited_email = null`
- `max_uses` may be null or a configured limit

### `public.group_invitation_redemptions`

Provides an audit trail of successful invitation uses.

Key fields:

- `invitation_id`
- `user_id`
- `household_id`
- `group_membership_id`
- `redeemed_at`

Each invitation/household pair may redeem only once.

---

## Locations

RallyRoute intentionally separates public/group destinations from sensitive household locations.

### `public.event_locations`

Represents normal event destinations visible within the relevant group.

Examples:

- school
- sports field
- camp
- office
- park

Key fields:

- `id`
- `group_id`
- name/address fields
- `country_code`
- `location` as PostGIS `geography(POINT)`
- `provider_place_id`
- `created_by_user_id`
- timestamps

Event locations belong to a specific group.

This deliberately favors simple authorization over global location deduplication.

### `private.household_locations`

Represents sensitive household-side locations.

Examples:

- Home
- Work
- Other pickup point

Key fields:

- `id`
- `household_id`
- `label`
- `location_type`
- address fields
- `location` as PostGIS `geography(POINT)`
- `provider_place_id`
- `is_primary`
- timestamps

Current location types:

- `home`
- `work`
- `other`

Only one location per household may be marked primary.

This table lives in the `private` schema and is not directly exposed to normal client API roles.

---

## Event Series

### `public.event_series`

An Event Series is a recurring template used to create concrete Events.

Examples:

- Tuesday soccer practice
- Monday–Friday school days
- recurring camp days

Key fields:

- `group_id`
- `name`
- `location_id`
- `timezone`
- `recurrence_rule`
- `series_start_date`
- `series_end_date`
- default transportation/activity times
- `status`
- `created_by_user_id`
- timestamps

Recurrence uses an RFC 5545-style rule such as:

```text
FREQ=WEEKLY;BYDAY=TU,TH
```

Current status values:

- `active`
- `inactive`

### Important modeling rule

The matching engine does not match directly against an Event Series.

The series creates or describes concrete Events; matching occurs against those concrete events.

---

## Events

### `public.events`

A concrete event is the primary time/location unit used by the future matching engine.

Key fields:

- `id`
- `group_id`
- `event_series_id` nullable
- `name`
- `location_id`
- `required_arrival_at`
- `ready_to_depart_at`
- `activity_starts_at`
- `activity_ends_at`
- `status`
- `created_by_user_id`
- timestamps

Current status values:

- `scheduled`
- `cancelled`
- `completed`

### Transportation anchors

For a ride `to_event`:

```text
required_arrival_at
```

is the destination-side anchor.

For a ride `from_event`:

```text
ready_to_depart_at
```

is the destination-side anchor.

Activity start/end times are human/event information and may differ from transportation anchors.

Example:

```text
Game starts:          2:00 PM
Required arrival:     1:30 PM

Game ends:            3:30 PM
Ready to depart:      3:45 PM
```

Integrity triggers ensure an Event and its Event Series/Location belong to the same Group.

---

## Event Participation

### `public.event_participation`

Represents whether a household member is attending a concrete event.

Key fields:

- `event_id`
- `member_id`
- `status`
- timestamps

Current status values:

- `going`
- `not_going`
- `unknown`

Unique constraint:

```text
(event_id, member_id)
```

A household member can participate only when their household has an active membership in the Event's Group.

Event attendance is intentionally separate from transportation preference.

Someone may attend while using their own transportation and never enter the matching pool.

---

## Ride Participation

### `public.ride_participation`

Represents a household member's transportation preference for one concrete event leg.

Key fields:

- `event_id`
- `member_id`
- `household_location_id`
- `leg`
- `mode`
- `available_seats`
- `max_detour_minutes`
- `anchor_earliest_at`
- `anchor_latest_at`
- timestamps

Unique constraint:

```text
(event_id, member_id, leg)
```

### Ride legs

- `to_event`
- `from_event`

### Ride modes

- `need_ride`
- `can_drive`
- `either`
- `self_transport`
- `none`

### Driver fields

When the mode is `can_drive` or `either`:

- `available_seats` is required
- `max_detour_minutes` is required

`available_seats` means extra passenger seats, not total vehicle capacity.

For MVP, only an adult household member may offer to drive.

### Time windows

Active matching modes require:

- `anchor_earliest_at`
- `anchor_latest_at`

For `to_event`, these represent an acceptable destination arrival window.

For `from_event`, these represent an acceptable destination departure window.

Example:

```text
Event required arrival: 8:30 AM
User flexibility: ±10 minutes

anchor_earliest_at = 8:20 AM
anchor_latest_at   = 8:40 AM
```

### Validation

The database currently validates that:

- the household is an active member of the event's group
- the person is marked `going`
- the selected household location belongs to that member's household
- only adults can offer to drive
- `to_event` is allowed only when the event has an arrival anchor
- `from_event` is allowed only when the event has a departure anchor

---

## Relationship Summary

```text
auth.users
    │
    ├── profiles
    │
    ├── household_access ────── households
    │                              │
    │                              ├── household_members
    │                              │
    │                              └── private.household_locations
    │
    └── group_admins
             │
             ▼
           groups
             │
             ├── group_memberships ───── households
             │
             ├── group_invitations
             │       └── group_invitation_redemptions
             │
             ├── event_locations
             │
             ├── event_series
             │
             └── events
                    │
                    ├── event_participation ─── household_members
                    │
                    └── ride_participation ──── household_members
                                                  │
                                                  └── private.household_locations
```

---

## Driver and Rider Are Roles

Do not add a permanent `is_rider` or `is_driver` concept to a household member.

A person can be:

```text
Monday morning     driver
Monday afternoon   rider
Tuesday morning    self transport
Wednesday          not participating
```

The role is derived from `ride_participation.mode` for a specific Event and leg.

---

## Current vs Planned Schema

Implemented in Phase 0:

- profiles
- households
- household access
- household members
- groups
- group admins
- group memberships
- invitations/redemptions
- event locations
- private household locations
- event series
- events
- event participation
- ride participation

Planned for later MVP phases, not yet part of the current schema:

- route calculation cache
- match results
- connection requests
- accepted connections
- carpools
- carpool membership
- event-level driver assignments

Do not add those prematurely unless implementing the phase that requires them.

---

## Schema Change Rules

All schema changes must be new SQL migrations under:

`supabase/migrations/`

Do not rewrite already-applied migrations to change the live schema.

After changing the schema:

1. run the migration against the linked development project
2. lint `public,private`
3. regenerate TypeScript database types
4. run application lint/build
