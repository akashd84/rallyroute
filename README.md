# RallyRoute

Carpool matching within trusted groups. Next.js App Router, TypeScript, Tailwind, and Supabase Cloud. Use pnpm; development on Rocket and production on Vercel share the same application setup.

## Development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and **publishable** key. Do not use a service-role or secret key.
3. Configure Supabase Auth as described in [authentication setup and verification](docs/authentication.md).
4. Run `pnpm dev` and open your development origin (localhost:3000 for local access).

Routes: `/` is authenticated Home (anonymous requests go to sign-in); `/sign-in` requests and verifies email codes; `/account` validates identity server-side and reads only the caller's profile through RLS. Household onboarding and invite-only groups are available; Google OAuth remains deferred.

Frontend work follows the [design-system implementation policy](docs/ux/frontend-design-system.md).

## Checks

```sh
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Browser tests launch a separate app on port 3100 and a **mock** Supabase HTTP server on port 54329. They never send email or connect to Cloud. Keep those ports free. Linux must have Chromium runtime libraries installed. Mock browser tests verify SSR cookies and application behavior; they do not prove live email delivery or database authorization.

Database migrations are the schema source of truth. Follow `AGENTS.md` for database validation.

## Database fixtures and security checks

See [database testing](docs/database-testing.md) for fictional seed identities, Docker prerequisites, local reset commands, and the real-role pgTAP suites. Run `pnpm test:db` separately from application tests; fixtures are never seeded into Cloud.

Household onboarding, ownership rules, invitation setup, and verification: [docs/household-onboarding.md](docs/household-onboarding.md).

Group creation, joining, permissions, invitations, and verification: [docs/group-onboarding.md](docs/group-onboarding.md).

Six-character invitation codes, short links, attempt limits, legacy-link compatibility, and manual verification: [docs/invitation-codes.md](docs/invitation-codes.md).

Events, attendance, private household addresses, ride preferences, recurrence, and verification: [docs/events-and-rides.md](docs/events-and-rides.md).

Household connections, contact consent, pickup sharing, and verification: [docs/connections.md](docs/connections.md).

Agreed two-household carpools, drivers, participants, schedule, and verification: [docs/carpools.md](docs/carpools.md).
