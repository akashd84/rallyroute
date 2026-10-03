# RallyRoute

Carpool matching within trusted groups. Next.js App Router, TypeScript, Tailwind, and Supabase Cloud. Use pnpm; development on Rocket and production on Vercel share the same application setup.

## Development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and **publishable** key. Do not use a service-role or secret key.
3. Configure Supabase Auth as described in [authentication setup and verification](docs/authentication.md).
4. Run `pnpm dev` and open your development origin (localhost:3000 for local access).

Routes: `/` chooses the sign-in or account page; `/sign-in` requests and verifies email codes; `/account` validates identity server-side and reads only the caller's profile through RLS. Google OAuth and household onboarding are deferred.

## Checks

```sh
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Browser tests launch a separate app on port 3100 and a **mock** Supabase HTTP server on port 54329. They never send email or connect to Cloud. Keep those ports free. Linux must have Chromium runtime libraries installed. Mock browser tests verify SSR cookies and application behavior; they do not prove live email delivery or database authorization.

Database migrations are the schema source of truth. Follow `AGENTS.md` for database validation. This authentication change needs no schema migration.
