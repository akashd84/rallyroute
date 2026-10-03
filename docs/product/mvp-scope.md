# RallyRoute MVP Scope

## Purpose

RallyRoute is a carpool matching application that helps people within a trusted group discover compatible transportation arrangements for shared events.

The MVP exists to validate one core hypothesis:

> If people going to the same destination can easily discover trusted group members with compatible schedules, available seats, and reasonable route overlap, they will form carpools.

The MVP should prove or disprove that hypothesis with the least possible product and infrastructure complexity.

## Product Principles

### Keep the core experience frictionless

The MVP does not include monetization. Creating an account, joining a group, entering ride needs, discovering matches, and connecting with another household should not require payment.

Post-MVP monetization ideas are intentionally excluded from implementation until the matching product is validated.

### Trusted groups are the discovery boundary

RallyRoute is not an open rideshare marketplace.

A user should discover possible carpools only through a group they belong to, such as:

- school
- camp
- sports team
- workplace
- club
- community

Groups establish who may potentially match with whom.

### Events establish where and when

A Group may contain many Events.

Examples:

- a school day
- a camp day
- a soccer practice
- an away game
- a workplace commute event
- a club meeting

Matching occurs against concrete Events, not directly against a Group or recurring Event Series.

### People are generic

The data model must not assume every participant is a child.

Household members may be adults or children. The UX may use family-oriented language when appropriate, but the underlying model must also support workplace and adult carpools.

Driver and rider are transportation roles for a particular ride, not permanent person types.

### Privacy is part of the product

RallyRoute will handle sensitive household location and transportation data.

Exact household locations, raw ride preferences, and other sensitive details must not become broadly visible merely because two households share a group.

Authorization must be enforced at the database/server level rather than through UI hiding alone.

---

## MVP Development Phases

### Phase 0 — Foundation

Goal: establish the technical and domain foundation.

Includes:

- Next.js + TypeScript application
- Rocket homelab development environment
- GitHub repository
- Supabase Cloud development project
- PostgreSQL + PostGIS
- Supabase Auth
- Supabase SSR integration
- SQL migrations as schema source of truth
- Row Level Security foundation
- identity and household model
- generic household members
- groups and invitations
- event locations
- private household locations
- event series
- concrete events
- event participation
- ride participation
- generated TypeScript database types
- minimal authentication/onboarding placeholder
- development seed data
- RLS/security tests

Phase 0 is not a user-complete product.

### Phase 1 — Households and Groups

Goal: let a real user establish their RallyRoute identity and trusted communities.

Includes:

- sign in
- create/edit household
- add household members
- choose Adult or Child in the UX
- manage household access
- create a group
- join a group
- direct invitations
- shareable group links
- group dashboard
- basic group administration

Success condition:

A user can create a household, add participating people, create or join a group, and see that group in the application without developer assistance.

### Phase 2 — Events and Ride Needs

Goal: capture actual transportation demand and supply.

Includes:

- create one-off events
- create recurring event series
- generate or manage concrete events
- mark household members as attending
- select ride mode per event leg:
  - need ride
  - can drive
  - either
  - self transport
  - none
- available driver seats
- maximum acceptable detour
- acceptable arrival/departure time window
- household pickup/dropoff location selection

Success condition:

Multiple households can independently describe who is attending an event and what transportation they need or can provide.

### Phase 3 — Geographic Routing

Goal: determine whether a theoretical schedule match is geographically practical.

Includes:

- PostGIS geographic prefiltering
- external routing provider integration
- direct route calculation
- pickup route calculation
- added drive time calculation
- route calculation caching
- route-provider usage controls

Success condition:

RallyRoute can determine whether picking up another household stays within a driver's stated detour tolerance.

### Phase 4 — Matching

Goal: generate useful deterministic match suggestions.

Includes:

- hard compatibility filters
- time-window intersection
- seat-capacity validation
- geographic prefilter
- route-deviation validation
- deterministic ranking
- match summary UI

Initial matching must not use AI or arbitrary compatibility percentages.

Success condition:

Given a known set of test households, RallyRoute reliably returns the matches humans expect and excludes incompatible candidates.

### Phase 5 — Connections

Goal: allow households to mutually agree to communicate.

Includes:

- request to connect
- accept
- decline
- connection status
- controlled release of appropriate contact/pickup information after acceptance

Built-in chat is not required for the MVP. Existing phone, SMS, or email tools may be used once two households connect.

Success condition:

A suggested match can become a mutually accepted connection without exposing private information prematurely.

### Phase 6 — Carpools

Goal: turn successful connections into an explicit carpool arrangement.

Includes:

- create carpool
- participating households
- participating household members
- event rides
- driver assignments
- basic schedule display

The first version may be informational rather than a full scheduling engine.

Success condition:

Connected households can represent an agreed carpool and identify who is driving each ride.

### Phase 7 — Pilot

Goal: validate RallyRoute with real users before broad release.

Suggested progression:

1. 10–20 users in one trusted group
2. 50–100 users across several group types
3. broader pilot after issues from the earlier cohorts are addressed

Measure:

- onboarding completion
- group join rate
- ride-preference completion
- useful matches per participant
- connection request rate
- connection acceptance rate
- carpools formed
- user-reported match usefulness
- privacy/support issues

---

## Explicitly Out of MVP Scope

Do not implement these unless the scope is intentionally changed:

- payments
- donations
- fundraising
- subscriptions
- organization billing
- sponsorship advertising
- premium plans
- live GPS tracking
- native iOS or Android applications
- child accounts
- child-to-child messaging
- built-in real-time chat
- ratings/reviews
- driver payments
- background-check workflows
- school information system integrations
- TeamSnap/SportsEngine integrations
- calendar integrations
- automatic multi-stop route optimization
- automatic driver rotations
- complex schedule exception handling
- AI matching
- public ride listings
- instant on-demand rides

These may be considered after the core matching behavior is validated.

---

## Authentication Scope

MVP authentication uses Supabase Auth.

Planned methods:

- Google OAuth
- email OTP

Password authentication is not required for the MVP.

Only authenticated adults receive application accounts. A household member does not need an authenticated account in order to participate in transportation.

---

## Hosting Scope

Development:

- Rocket homelab server
- Supabase Free development project
- GitHub source control

MVP production:

- Vercel
- separate Supabase production project
- rallyroute.app

The application must remain portable between Rocket and Vercel.

Do not introduce Rocket-specific architectural dependencies.

---

## Monetization

Monetization is post-MVP.

Ideas retained for later evaluation include:

- organization/enterprise SaaS
- optional household convenience features
- sponsorships
- nonprofit/PTA fundraising where families can make voluntary donations or subscriptions and RallyRoute retains a platform/admin portion

None of these should influence MVP matching access.

---

## MVP Completion Definition

The MVP is successful when a user can:

1. authenticate
2. create or access a household
3. add household members
4. create or join a trusted group
5. participate in an event
6. state ride needs or driver availability
7. receive geographically and temporally compatible match suggestions
8. request a connection
9. mutually accept a connection
10. form a basic carpool

The primary validation question remains:

> Do trusted group members form real carpools when RallyRoute identifies practical matches for them?
