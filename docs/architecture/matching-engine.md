# RallyRoute Matching Engine

## Purpose

The RallyRoute matching engine determines whether two households have a practical carpool opportunity for the same concrete Event and ride leg.

The MVP matching engine should be deterministic, explainable, privacy-preserving, and inexpensive to run.

It must not use AI, opaque scoring, or arbitrary compatibility percentages.

---

## Matching Unit

Matching occurs against:

```text
Group
  ↓
Concrete Event
  ↓
Ride Leg
```

Not directly against:

- Group
- Event Series
- household
- permanent driver/rider identities

Each match must be tied to one concrete Event and one leg:

- `to_event`
- `from_event`

A recurring Event Series may create many Events, and each Event is evaluated independently.

---

## Core Inputs

The matching engine will use:

### Event

From `public.events`:

- group
- event location
- required arrival time
- ready-to-depart time
- status

### Event Participation

From `public.event_participation`:

- whether the household member is actually going

### Ride Participation

From `public.ride_participation`:

- ride leg
- mode
- available seats
- maximum detour
- acceptable time window
- selected household-side location

### Household Location

From `private.household_locations`:

- exact internal geographic point used for routing

Exact household locations must remain internal to the matching process.

---

## Roles

Driver and Rider are match-time roles.

### Driver candidate

A household member may act as a driver when their ride mode is:

- `can_drive`
- `either`

For MVP, only adults may offer to drive.

### Rider candidate

A household member may act as a rider when their mode is:

- `need_ride`
- `either`

The same adult may be a driver for one Event/leg and a rider for another.

---

## Hard Compatibility Filters

A potential driver/rider pair must pass every required hard filter before route calculation.

### 1. Same Group

Both households must have active membership in the Event's Group.

### 2. Same Event

Both ride records must reference the same concrete Event.

Do not match users based only on a shared Event Series.

### 3. Same Ride Leg

Both must be seeking/offering the same leg:

```text
to_event ↔ to_event
from_event ↔ from_event
```

Never match `to_event` against `from_event`.

### 4. Compatible Ride Modes

Valid driver modes:

- `can_drive`
- `either`

Valid rider modes:

- `need_ride`
- `either`

`self_transport` and `none` are not matching candidates.

### 5. Attendance

Both relevant household members must be marked `going` for the Event.

The database already enforces this when active ride participation is created.

### 6. Seat Capacity

The driver must have enough available seats for the rider demand.

The current Phase 0 schema models one household member per ride participation record, so the initial MVP may treat each rider record as one required seat.

If future requirements allow one ride request to represent multiple people, capacity calculation must be updated explicitly rather than inferred.

### 7. Time Window Overlap

The driver and rider acceptable destination time windows must overlap.

Driver:

```text
driver.anchor_earliest_at
driver.anchor_latest_at
```

Rider:

```text
rider.anchor_earliest_at
rider.anchor_latest_at
```

Compatibility exists when the intervals intersect.

Conceptually:

```text
max(driver earliest, rider earliest)
    <=
min(driver latest, rider latest)
```

### 8. Geographic Prefilter

Before calling an external route provider, use PostGIS to reject geographically implausible candidates.

The first implementation should be intentionally simple and configurable.

Possible inputs:

- distance between driver household location and rider household location
- relationship of both household locations to the Event destination
- broad maximum pickup radius

The prefilter exists to reduce external routing calls.

It is not the final compatibility decision.

### 9. Route Deviation

The actual pickup route must not exceed the driver's stated `max_detour_minutes`.

Only after all cheaper filters pass should RallyRoute call the routing provider.

---

## Time Model

RallyRoute uses a shared destination-side time anchor.

This is a critical architectural rule.

### To Event

For `to_event`:

> Match based on acceptable arrival time at the Event.

Do not primarily match based on the driver's self-reported home departure time.

Example:

```text
Event required arrival: 8:30 AM

Driver acceptable arrival:
8:20–8:40

Rider acceptable arrival:
8:25–8:35

Overlap:
8:25–8:35
```

Once a route is selected, the application may calculate backward to estimate driver departure and rider pickup times.

### From Event

For `from_event`:

> Match based on acceptable departure time from the Event.

Example:

```text
Event ready to depart: 3:30 PM

Driver acceptable departure:
3:25–3:45

Rider acceptable departure:
3:30–3:40

Overlap:
3:30–3:40
```

This shared anchor remains stable even when household locations differ.

---

## Route Deviation Model

Straight-line distance is insufficient for the final decision.

A nearby household may require a poor road-network detour, while a farther household may sit directly along the driver's route.

For a `to_event` ride, compare:

```text
Direct:
Driver household → Event

Pickup route:
Driver household → Rider household → Event
```

Calculate:

```text
added_duration =
pickup_route_duration - direct_route_duration
```

Candidate passes when:

```text
added_duration <= driver.max_detour_minutes
```

Example:

```text
Direct route:       18 minutes
With rider pickup:  24 minutes
Added drive time:    6 minutes
Driver max detour:  10 minutes

Result: compatible
```

For `from_event`, compare the equivalent outbound route:

```text
Direct:
Event → Driver household

Dropoff route:
Event → Rider household → Driver household
```

The exact ordering model may evolve when multi-rider carpools are implemented, but the MVP pairwise comparison should remain simple.

---

## Matching Pipeline

The intended MVP pipeline is:

```text
Event + Ride Leg
        │
        ▼
Candidate ride records
        │
        ▼
Same group/event/leg
        │
        ▼
Driver ↔ Rider mode compatibility
        │
        ▼
Seat capacity
        │
        ▼
Time-window overlap
        │
        ▼
PostGIS geographic prefilter
        │
        ▼
External route calculation
        │
        ▼
Added drive time <= max detour
        │
        ▼
Compatible match candidate
```

The engine should eliminate candidates as early and cheaply as possible.

---

## External Routing Provider

The routing provider is not locked by the schema.

Google Maps Routes API is the leading initial candidate, but provider-specific details should remain behind a small application abstraction.

The matching domain should ask for concepts such as:

- direct duration
- direct distance
- pickup duration
- pickup distance

rather than embedding provider response structures throughout application code.

---

## Route Calculation Cache

Route calculations should be cached so repeated screen loads do not repeatedly call a paid external API.

A future internal/private cache may contain values such as:

- driver household location
- rider household location
- event location
- ride leg
- direct duration
- detour duration
- added duration
- distances
- provider
- calculation timestamp
- input/version hash

The cache is not currently implemented in the Phase 0 schema.

### Cache invalidation

A cached result should be considered stale when relevant inputs change, including:

- driver location
- rider location
- event destination
- routing assumptions/provider settings
- age threshold if time-sensitive traffic routing is eventually used

Do not cache based only on display addresses when geographic coordinates are available.

---

## Ranking

After hard filters pass, compatible candidates may be ranked.

Initial ranking should remain transparent.

Recommended priority:

1. greater useful schedule overlap across related Events
2. lower added drive time
3. wider overlapping time window

Do not display an invented score such as:

```text
92% compatible
```

unless a future scoring system has a meaningful, documented interpretation.

Prefer explanations such as:

```text
3 compatible rides this week
Typical added drive: +5 minutes
Arrival windows overlap by 15 minutes
```

---

## Recurring Compatibility

Individual matches are evaluated at the concrete Event level.

However, RallyRoute should eventually summarize recurring compatibility across related Events.

Example:

```text
Milton Eagles U14

Akash ↔ Priya

Tuesday practice: compatible
Thursday practice: compatible
Saturday game: compatible
Next Tuesday: compatible
```

This can produce a useful household-level summary without changing the underlying event-level truth.

Do not collapse recurring events into one abstract match if locations or times differ.

---

## Event-Specific Geography

A pair of households may be compatible for one Event and incompatible for another.

Example:

```text
Practice at Park A:
pickup detour = +14 minutes
not compatible

Away game at Park B:
pickup detour = +4 minutes
compatible
```

This is why the Event, not the Group, is the matching unit.

---

## Privacy Boundary

The matching engine may internally use sensitive data that users must not see directly.

Internal inputs may include:

- exact household coordinates
- raw ride participation
- raw event participation
- route calculations

User-facing match results should expose only the minimum useful information.

A pre-connection result may eventually show:

- relevant first name/household identity
- shared group
- event
- ride leg
- compatible time information
- seats
- approximate added drive time
- general area if product policy allows it

It must not automatically reveal:

- exact home address
- precise household coordinates
- unrelated ride preferences
- private phone/email
- participation in unrelated Events

The match service should return a purpose-built projection rather than giving the client direct access to underlying private records.

---

## Match Storage

The exact match persistence model is intentionally deferred until Phase 4.

Possible options include:

- calculate matches on demand
- materialize/cached match candidates
- hybrid calculation plus cached route data

Do not add a permanent `matches` table merely because this document describes match concepts.

Choose storage based on actual Phase 4 query patterns.

---

## Pairwise MVP Matching

The first matching engine should solve the simplest valuable problem:

> Can one driver practically transport one rider for this Event leg?

Do not begin with:

- three-family route optimization
- vehicle routing problem solvers
- automatic multi-stop ordering
- dynamic rebalancing
- driver rotation optimization

Once pairwise compatibility is reliable, multiple compatible households can later be used to form more complex carpools.

---

## Edge Cases

### Either ↔ Either

If both participants choose `either`, RallyRoute may treat both directional possibilities as candidates:

```text
A drives B
B drives A
```

They should not be represented as two unrelated user-facing matches if the UI can summarize the reciprocal opportunity more clearly.

### Same household

Do not generate matches between members of the same household.

### Cancelled Event

Do not match rides for an Event with status `cancelled`.

### Past/completed Event

Normal matching should exclude completed/past Events unless explicitly running historical analysis.

### Removed Group Membership

A removed or inactive household must not remain a matching candidate.

### Location unavailable

An active matching mode currently requires a household location through the schema.

If routing cannot resolve a valid geographic point, fail gracefully and do not guess compatibility.

### Zero-minute detour

A driver may choose `max_detour_minutes = 0`.

That should be treated literally; only routes with no additional calculated time should pass.

---

## Explainability

Every match result should be explainable from deterministic facts.

Example:

```text
Why this match?

✓ Same Saturday game
✓ Both need to arrive between 1:20–1:40 PM
✓ 2 seats available
✓ Pickup adds approximately 5 minutes
✓ Driver accepts up to 10 minutes of detour
```

This is preferable to an opaque score and will make debugging and user trust much easier.

---

## Matching Tests

Before pilot use, create a deterministic test fixture with fake households around a known geography.

Examples should include:

### Expected match

- same Event
- compatible leg
- enough seats
- overlapping time
- pickup within allowed detour

### Time failure

- same geography
- non-overlapping time windows

### Seat failure

- driver has insufficient capacity

### Geography failure

- straight-line proximity seems reasonable
- road route exceeds detour tolerance

### Different Event failure

- same Group
- different concrete Event

### Different leg failure

- driver offers `to_event`
- rider needs `from_event`

### Inactive membership failure

- compatible ride data exists
- household is no longer active in the Group

### Privacy test

- client receives match summary
- client cannot query other household's raw ride participation or private location

The matching test suite should verify both inclusion and exclusion.

---

## Performance Strategy

The MVP should optimize in this order:

1. filter in SQL using indexed identifiers
2. intersect time windows
3. use PostGIS for rough geographic filtering
4. call external routing only for plausible pairs
5. cache route results
6. profile before adding infrastructure

Do not add Redis, queues, or microservices before measured demand requires them.

---

## Future Extensions

Post-MVP or later-MVP matching may consider:

- multi-rider carpools
- multi-stop route optimization
- recurring carpool preference
- preferred/blocked households
- driver rotations
- calendar exceptions
- live traffic-aware routing
- workplace-specific matching preferences

These extensions must preserve the event-level, privacy-first foundation.

---

## Implementation Rule

When implementing Phase 4, treat this document as the intended behavior but confirm the current migrations and data model before coding.

If the schema and this document disagree, the committed migrations describe current reality and the discrepancy should be resolved explicitly rather than silently worked around.
