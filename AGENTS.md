# RallyRoute Agent Instructions

## Project Overview

RallyRoute is a carpool matching application.

The MVP helps people within a trusted group discover compatible carpools based on:

- shared events
- ride direction
- availability
- seat capacity
- time compatibility
- geographic compatibility
- acceptable route detour

The initial UX is family-oriented, but the underlying data model must remain generic enough to support adult/workplace carpools later.

Do not introduce assumptions that RallyRoute is only for children, schools, or parents unless the UI context specifically requires it.

---

## Technology Stack

- Next.js
- TypeScript
- Next.js App Router
- Tailwind CSS
- shadcn/ui
- Supabase
  - PostgreSQL
  - Auth
  - Row Level Security
  - PostGIS
- Zod
- pnpm

Development currently runs on the `rocket` homelab server.

This project intentionally uses the linked hosted Supabase Dev project rather than a local Docker Supabase stack.

For verification:
- run pnpm lint
- run pnpm build
- run pnpm supabase db lint --linked --schema public,private
- use the linked Supabase Dev project for integration checks where possible

Do not mark Docker-based local Supabase verification as required unless a task specifically needs it.

Production is expected to run on Vercel.

Supabase Cloud is used for the development database.

The codebase must remain portable between Rocket and Vercel. Do not introduce Rocket-specific application dependencies.

---

## Package Manager

Use `pnpm`.

Do not use `npm install` or create an npm lockfile.

Common commands:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm supabase db push
pnpm supabase migration list
pnpm supabase db lint --linked --schema public,private
```

---

## Repository Rules

Do not use `sudo` for application-level commands inside this repository.

Do not commit:

- `.env.local`
- API keys
- Supabase secrets
- database passwords
- OAuth secrets
- raw invitation tokens
- service-role credentials

Never expose privileged credentials through `NEXT_PUBLIC_*` environment variables.

Do not commit or push changes unless explicitly requested.

Before making significant architectural changes, inspect the existing schema, migrations, and relevant documentation.

---

## Database Migrations

Supabase migrations are the source of truth for database schema changes.

All database changes must be implemented as new migrations under:

`supabase/migrations/`

Never modify an already-applied migration merely to change the live schema.

Instead:

1. create a new migration
2. make the change there
3. run `pnpm supabase db push`
4. lint the RallyRoute schemas

For database changes, run:

```bash
pnpm supabase db lint --linked --schema public,private
```

Ignore lint output originating solely from the PostGIS `extensions` schema unless the task specifically concerns PostGIS itself.

After schema changes, regenerate the Supabase TypeScript types:

```bash
pnpm supabase gen types typescript \
  --linked \
  --schema public \
  > src/lib/supabase/database.types.ts
```

---

## Database Schemas

### `public`

Contains application-facing RallyRoute data protected by grants and RLS.

### `private`

Contains sensitive/internal data and privileged helper functions.

The `private` schema must not be exposed directly through the normal client API.

Examples of private data include:

- exact household locations
- precise household geographic coordinates
- privileged authorization helpers
- internal route calculations

Do not move sensitive data into `public` merely for convenience.

---

## Security Model

Security is a core architectural requirement.

Do not rely on UI hiding for authorization.

Authorization must be enforced through:

1. PostgreSQL grants
2. Row Level Security
3. controlled database functions where appropriate
4. server-side application checks for sensitive workflows

All new exposed application tables should have RLS enabled.

Avoid recursive RLS policies. Use approved helper functions in the `private` schema when membership checks are required.

Privileged `SECURITY DEFINER` implementations belong in `private`, not directly in exposed schemas.

Do not bypass RLS from browser code.

Do not add a Supabase service-role key to browser-accessible code.

---

## Identity Model

Authentication identity and transportation identity are separate concepts.

### Authenticated user

Supabase Auth user represented by:

`auth.users`

and:

`public.profiles`

### Household

Users receive household access through:

`public.household_access`

A household can have multiple authenticated users.

### Household member

Transportation participants are represented by:

`public.household_members`

A household member may or may not have an authenticated account.

Examples:

- authenticated adult
- non-authenticated adult
- child

Do not create separate `parents` and `children` tables.

Do not assume every household member can log in.

---

## Adult and Child Modeling

`member_type` currently distinguishes:

- `adult`
- `child`

This is a UX/domain attribute, not the transportation role.

Do not use `child` as the generic participant concept.

---

## Driver and Rider Modeling

Driver and rider are roles for a specific event ride.

They are not permanent person types.

An adult may:

- drive to one event
- ride to another event
- do neither

The ride role belongs in ride participation, not on the household member record.

For MVP, only adults may offer to drive.

---

## Groups

Groups define the trust and matching boundary.

Examples:

- school
- camp
- sports team
- workplace
- club
- community

Households join groups.

Do not allow arbitrary users outside a group to discover its participating households.

Group administration belongs to authenticated users, not entire households.

---

## Invitations

RallyRoute supports:

- direct invitations
- reusable group links

Invitation URLs contain opaque cryptographically random tokens.

The database stores only a hash of the raw token.

Never store raw invitation tokens in the database.

For direct invitations, the authenticated email must match the invited email.

Group invitation redemption must use the controlled database workflow rather than direct client-side insertion into membership tables.

---

## Events

Events are the primary matching unit.

Groups may have many events.

Examples:

- one soccer game
- one practice
- one school day
- one camp day
- one workplace commute occurrence

A concrete event has its own:

- destination
- arrival requirement
- departure time
- date/time

Matching happens against concrete events, not directly against event series.

---

## Event Series

Event series are recurring templates.

Examples:

- school Monday-Friday
- Tuesday soccer practice
- summer camp session

A series generates concrete events.

Use RFC 5545-style recurrence rules rather than inventing a custom recurrence format.

---

## Transportation Time Model

For `to_event` rides:

The matching anchor is the acceptable arrival time at the event.

For `from_event` rides:

The matching anchor is the acceptable departure time from the event.

Do not use the driver's home departure time as the primary matching anchor.

Time flexibility should be stored as concrete:

- `anchor_earliest_at`
- `anchor_latest_at`

The UI may express these as values such as ±10 minutes.

---

## Ride Participation

Ride modes currently include:

- `need_ride`
- `can_drive`
- `either`
- `self_transport`
- `none`

For drivers:

- `available_seats` means additional rider seats
- `max_detour_minutes` defines acceptable additional driving time

Raw ride participation records are private to the participant's household.

Other households should eventually receive appropriate match results rather than unrestricted access to another household's transportation preferences.

---

## Locations

Event locations are normal group-visible destinations.

Examples:

- school
- park
- office
- sports field
- camp

Household locations are sensitive.

Exact household addresses and precise coordinates must not be exposed to unrelated households.

Use PostGIS geography types for geographic storage and filtering.

Use PostGIS for inexpensive geographic prefiltering before calling an external routing provider.

---

## Matching Principles

The MVP matching engine should be deterministic.

Do not introduce AI-based matching or arbitrary compatibility percentages.

A potential match should satisfy hard requirements such as:

1. same group
2. same event
3. same ride leg
4. compatible driver/rider mode
5. enough available seats
6. overlapping acceptable time windows
7. geographic prefilter passes
8. route detour is within the driver's maximum

External routing should be used only after inexpensive database/geographic filtering.

Route calculations should eventually

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
