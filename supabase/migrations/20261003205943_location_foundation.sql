-- =========================================================
-- RallyRoute Phase 0: Location Foundation
-- =========================================================


-- =========================================================
-- Event Locations
--
-- Normal group-visible destinations:
-- schools, parks, camps, offices, fields, etc.
-- =========================================================

create table public.event_locations (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  name text not null,

  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,

  country_code text not null default 'US'
    check (char_length(country_code) = 2),

  location extensions.geography(POINT),

  -- e.g. Google Place ID later
  provider_place_id text,

  created_by_user_id uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create trigger event_locations_set_updated_at
before update on public.event_locations
for each row
execute function private.set_updated_at();


create index event_locations_group_id_idx
  on public.event_locations(group_id);


create index event_locations_geo_idx
  on public.event_locations
  using gist (location)
  where location is not null;


alter table public.event_locations enable row level security;


-- =========================================================
-- Event Location Permissions
-- =========================================================

revoke all on table public.event_locations
  from anon, authenticated;


grant select on table public.event_locations
  to authenticated;


grant insert (
  group_id,
  name,
  address_line_1,
  address_line_2,
  city,
  state_region,
  postal_code,
  country_code,
  location,
  provider_place_id,
  created_by_user_id
)
on public.event_locations
to authenticated;


grant update (
  name,
  address_line_1,
  address_line_2,
  city,
  state_region,
  postal_code,
  country_code,
  location,
  provider_place_id
)
on public.event_locations
to authenticated;


grant delete
on public.event_locations
to authenticated;


create policy "event_locations_select_group_member"
on public.event_locations
for select
to authenticated
using (
  (select private.is_group_member(group_id))
  or
  (select private.is_group_admin(group_id))
);


create policy "event_locations_insert_group_admin"
on public.event_locations
for insert
to authenticated
with check (
  (select private.is_group_admin(group_id))
  and created_by_user_id = (select auth.uid())
);


create policy "event_locations_update_group_admin"
on public.event_locations
for update
to authenticated
using (
  (select private.is_group_admin(group_id))
)
with check (
  (select private.is_group_admin(group_id))
);


create policy "event_locations_delete_group_admin"
on public.event_locations
for delete
to authenticated
using (
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- Household Locations
--
-- Sensitive pickup/origin locations.
--
-- This table intentionally lives in the private schema
-- and is NOT exposed through the normal Supabase Data API.
-- =========================================================

create table private.household_locations (
  id uuid primary key default gen_random_uuid(),

  household_id uuid not null
    references public.households(id)
    on delete cascade,

  label text not null default 'Home',

  location_type text not null default 'home'
    check (location_type in ('home', 'work', 'other')),

  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,

  country_code text not null default 'US'
    check (char_length(country_code) = 2),

  location extensions.geography(POINT),

  provider_place_id text,

  is_primary boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create trigger household_locations_set_updated_at
before update on private.household_locations
for each row
execute function private.set_updated_at();


create index household_locations_household_id_idx
  on private.household_locations(household_id);


create index household_locations_geo_idx
  on private.household_locations
  using gist (location)
  where location is not null;


-- Only one primary location per household.
create unique index household_locations_one_primary_idx
  on private.household_locations(household_id)
  where is_primary = true;


-- Explicitly block direct API-role access.
revoke all on table private.household_locations
  from public, anon, authenticated;


alter table private.household_locations enable row level security;
