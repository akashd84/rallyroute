# Email OTP authentication

## Behavior

New and existing adult accounts use the same email form. Email and code stay in component memory; reloading before verification starts the form again. Request and verification are Server Actions, with server-side Zod validation. The form and server accept six- or eight-digit codes; Supabase determines whether the submitted code is valid. Local configuration uses six digits and ten-minute expiry. Cloud was observed sending eight digits, which is also supported. Resending is disabled for 60 seconds in the UI; Supabase enforces rate limits independently of the browser.

Verification uses `verifyOtp` with type `email`. The SSR client writes the session to cookies; `src/proxy.ts` (alongside `src/app`) refreshes sessions and preserves cookie/header updates. Authenticated responses are private/no-store. `/account` calls `getUser()` before fetching the caller's profile with their authenticated client. Authentication does not grant access to other households. Sign-out is a POST Server Action with local scope (current session). The installed SDK clears local cookies even if remote revocation returns an error; the app redirects to `/sign-in?error=sign-out` with an unconfirmed-sign-out notice. This fixed notice flag contains no identity or session data.

The account page does not create households, edit profiles, or mark onboarding complete. A missing/unavailable profile has retry and sign-out controls. Google OAuth and magic links are deferred; there is no callback route in this code flow.

## Remote development through a tunnel

Set `RALLYROUTE_DEV_ORIGIN` in `.env.local` to the exact browser origin, for example `https://your-tunnel.use2.devtunnels.ms` (no `/sign-in` path). Restart `pnpm dev` if it does not restart automatically, then reload the page. Update this value when the tunnel hostname changes.

Next.js needs the hostname in `allowedDevOrigins` for development assets and the host in `experimental.serverActions.allowedOrigins` when the tunnel forwards an internal Host header. `next.config.ts` derives both from this setting, only in development. The development tunnel exception also permits `localhost:3000`, because VS Code port forwarding can retain that local Origin while setting the forwarded host to the tunnel hostname. Unlisted origins remain blocked; production uses normal same-origin checks. Do not use a wildcard to bypass the origin check.

## Supabase Cloud setup

Local `supabase/config.toml` is **not** applied to a linked Cloud project's Auth settings by a database push. Configure Cloud separately:

1. Authentication → Sign In / Providers → Email: enable Email, allow new signups, and require email confirmation. Set OTP length to **6**, expiry to **600 seconds**, and minimum interval between emails to **60 seconds**. Keep verification rate limits enabled. Dashboard wording may vary.
2. Authentication → Email Templates: update **Confirm signup** and **Magic link** with the contents of `supabase/templates/email-code.html`. Both need `{{ .Token }}`; a confirmation URL alone will not work. Use subject `Your RallyRoute sign-in code`.
3. Authentication → URL Configuration: set Site URL to the development origin used in your browser. This OTP flow has fixed in-app destinations and does not require an OAuth callback allowlist. Configure production origins separately when deploying.
4. Authentication → SMTP Settings: confirm the delivery setup. Supabase's default SMTP only sends to project team addresses and has restrictive delivery limits; use a team mailbox or configure custom SMTP for other recipients. Store SMTP credentials in secure Supabase settings, never in repository files or public environment variables.
5. Do not enable Google just for this task. Do not disable RLS or introduce a service-role key to work around profile errors.

For local Supabase, the configuration references the same template for signup confirmation and magic-link/OTP delivery. Restart local Supabase after changing Auth configuration. Local settings do not prove Cloud settings.

Sources: [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Live browser verification

Run the app with `.env.local` pointing at Supabase Cloud. Use a mailbox you control; enter codes only in the app, not in reports or chat.

1. In a fresh browser session, visit `/account`; expect `/sign-in`.
2. Request a code for a new account; confirm the email contains a six- or eight-digit code. Try an incorrect code; expect an error. Enter the delivered code; expect `/account`, the correct email, and the onboarding placeholder (not a missing-profile error).
3. Reload; expect to remain signed in. Visit `/sign-in`; expect `/account`.
4. Sign out; expect `/sign-in`. Revisit `/account`; access must be denied.
5. Request a fresh code for the existing account. First try the previously consumed code; it must fail. Enter the fresh delivered code; sign-in must succeed.
6. Test expiry with an unconsumed code after ten minutes. Request a replacement after the resend interval and verify it succeeds.
7. Allow the access token to expire while retaining the valid refresh cookie; reload `/account` and confirm it remains accessible. With the refresh session revoked, access should return to sign-in after the access token expires. Record Cloud results separately from mocked refresh tests.

## Two-account profile RLS check

Use two distinct confirmed test accounts. In separate browser contexts, sign in to each. Using an ordinary publishable-key Supabase client with each account's own session, query `profiles` by its own ID and expect exactly one row. Query the other account's ID and expect zero rows. The session must belong to that account; do not use SQL Editor/admin or service-role access for this check.

A reproducible procedure in a local interactive Node session is below. Supply URL, publishable key, account emails and codes in memory; do not save or commit codes/tokens. Disable persistent REPL history if used. Request and enter each code within ten minutes.

```js
const { createClient } = await import('@supabase/supabase-js');
const a = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const b = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
// Repeat separately for a/emailA/codeA and b/emailB/codeB:
await a.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
const resultA = await a.auth.verifyOtp({ email: emailA, token: codeA, type: 'email' });
// After verifying both clients, capture user IDs without printing tokens:
const idA = (await a.auth.getUser()).data.user.id;
const idB = (await b.auth.getUser()).data.user.id;
await a.from('profiles').select('id').eq('id', idA); // one row, no error
await a.from('profiles').select('id').eq('id', idB); // zero rows, no error
await b.from('profiles').select('id').eq('id', idB); // one row, no error
await b.from('profiles').select('id').eq('id', idA); // zero rows, no error
await a.auth.signOut({ scope: 'local' });
await b.auth.signOut({ scope: 'local' });
```

## Verification record

Implementation checks and live Cloud checks are separate gates. Never record actual email codes, raw sessions, or private profile data.

- Cloud public settings inspected: email provider enabled, signup allowed, email confirmation required; Google disabled.
- Cloud email templates, expiry, resend interval, SMTP recipient eligibility: awaiting dashboard configuration/confirmation.
- Live delivered-code sign-in, new-account profile creation, returning-user sign-in, consumed/expired-code rejection: pending user-controlled mailbox check.
- Live refresh/revocation and two-account profile isolation: pending authenticated Cloud checks.
- `pnpm lint`: passed.
- `pnpm test`: 28 tests passed, including Server Actions, six/eight-digit code validation, and development-only origin configuration.
- `pnpm test:e2e`: 9 Chromium tests passed against a production build and mock HTTP provider, including valid refresh cookie rotation and invalid-refresh denial. Rocket lacked browser runtime libraries; this run used packages extracted under `/tmp/rallyroute-browser-libs` via `LD_LIBRARY_PATH`, without a host installation. Standard browser test runs require those OS libraries to be available.
- `pnpm build`: passed; `/`, `/sign-in`, and `/account` are dynamic and the proxy is present.
- `git diff --check`: passed.
- No schema migration or privileged application credential was introduced.

Until these live checks pass, the flow is implemented but Cloud authentication is **not fully verified**.
