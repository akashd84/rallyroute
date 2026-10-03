-- =========================================================
-- RallyRoute Phase 0: Event Foundation
-- =========================================================


-- =========================================================
-- Event Series
--
-- Recurring templates such as:
--   School days
--   Camp sessions
--   Tuesday soccer practice
--
-- Matching never happens directly against a series.
-- A series generates concrete Events.
-- =========================================================

create table public.event_series (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  name text not null,

  location_id uuid
    references public.event_locations(id)
    on delete restrict,

  -- IANA timezone, e.g. America/New_York
  timezone text not null,

  -- RFC 5545-style recurrence rule
  -- Example: FREQ=WEEKLY;BYDAY=TU,TH
  recurrence_rule text not null,

  series_start_date date not null,
  series_end_date date,

  -- Local times; concrete events will become timestamptz
  default_required_arrival_time time,
  default_ready_to_depart_time time,

  default_activity_start_time time,
  default_activity_end_time time,

  status text not null default 'active'
    check (status in ('active', 'inactive')),

  created_by_user_id uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    series_end_date is null
    or series_end_date >= series_start_date
  ),

  check (
    default_required_arrival_time is not null
    or default_ready_to_depart_time is not null
  )
);


create trigger event_series_set_updated_at
before update on public.event_series
for each row
execute function private.set_updated_at();


create index event_series_group_id_idx
  on public.event_series(group_id);


create index event_series_location_id_idx
  on public.event_series(location_id);


alter table public.event_series enable row level security;


-- =========================================================
-- Events
--
-- Concrete occurrence used by the matching engine.
-- =========================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  event_series_id uuid
    references public.event_series(id)
    on delete set null,

  name text not null,

  location_id uuid
    references public.event_locations(id)
    on delete restrict,

  -- Transportation anchors
  required_arrival_at timestamptz,
  ready_to_depart_at timestamptz,

  -- Human/event information
  activity_starts_at timestamptz,
  activity_ends_at timestamptz,

  status text not null default 'scheduled'
    check (
      status in (
        'scheduled',
        'cancelled',
        'completed'
      )
    ),

  created_by_user_id uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    required_arrival_at is not null
    or ready_to_depart_at is not null
  ),

  check (
    required_arrival_at is null
    or ready_to_depart_at is null
    or ready_to_depart_at > required_arrival_at
  )
);


create trigger events_set_updated_at
before update on public.events
for each row
execute function private.set_updated_at();


create index events_group_id_idx
  on public.events(group_id);


create index events_event_series_id_idx
  on public.events(event_series_id);


create index events_location_id_idx
  on public.events(location_id);


create index events_required_arrival_at_idx
  on public.events(required_arrival_at);


create index events_ready_to_depart_at_idx
  on public.events(ready_to_depart_at);


alter table public.events enable row level security;


-- =========================================================
-- Event Participation
--
-- Indicates whether a household member is attending.
-- Transportation preference is stored separately.
-- =========================================================

create table public.event_participation (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null
    references public.events(id)
    on delete cascade,

  member_id uuid not null
    references public.household_members(id)
    on delete cascade,

  status text not null default 'unknown'
    check (
      status in (
        'going',
        'not_going',
        'unknown'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, member_id)
);


create trigger event_participation_set_updated_at
before update on public.event_participation
for each row
execute function private.set_updated_at();


create index event_participation_event_id_idx
  on public.event_participation(event_id);


create index event_participation_member_id_idx
  on public.event_participation(member_id);


alter table public.event_participation enable row level security;


-- =========================================================
-- Integrity validation
--
-- Make sure event locations/series belong to the same group.
-- =========================================================

create or replace function private.validate_event_series_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  if new.location_id is not null
     and not exists (
       select 1
       from public.event_locations el
       where el.id = new.location_id
         and el.group_id = new.group_id
     )
  then
    raise exception 'Event series location must belong to the same group';
  end if;

  return new;
end;
$$;


revoke all on function private.validate_event_series_group()
from public, anon, authenticated;


create trigger validate_event_series_group_trigger
before insert or update
on public.event_series
for each row
execute function private.validate_event_series_group();


create or replace function private.validate_event_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  if new.location_id is not null
     and not exists (
       select 1
       from public.event_locations el
       where el.id = new.location_id
         and el.group_id = new.group_id
     )
  then
    raise exception 'Event location must belong to the same group';
  end if;


  if new.event_series_id is not null
     and not exists (
       select 1
       from public.event_series es
       where es.id = new.event_series_id
         and es.group_id = new.group_id
     )
  then
    raise exception 'Event series must belong to the same group';
  end if;

  return new;
end;
$$;


revoke all on function private.validate_event_group()
from public, anon, authenticated;


create trigger validate_event_group_trigger
before insert or update
on public.events
for each row
execute function private.validate_event_group();


-- =========================================================
-- Participation validation
--
-- A household member can only participate in an event if
-- their household is an active member of that event's group.
-- =========================================================

create or replace function private.validate_event_participation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  if not exists (
    select 1
    from public.events e

    join public.group_memberships gm
      on gm.group_id = e.group_id
     and gm.status = 'active'

    join public.household_members hm
      on hm.household_id = gm.household_id

    where e.id = new.event_id
      and hm.id = new.member_id
  )
  then
    raise exception
      'Household member must belong to an active household in the event group';
  end if;

  return new;
end;
$$;


revoke all on function private.validate_event_participation()
from public, anon, authenticated;


create trigger validate_event_participation_trigger
before insert or update
on public.event_participation
for each row
execute function private.validate_event_participation();
