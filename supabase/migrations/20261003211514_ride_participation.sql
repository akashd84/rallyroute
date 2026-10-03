-- =========================================================
-- RallyRoute Phase 0: Ride Participation
-- =========================================================

create table public.ride_participation (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null
    references public.events(id)
    on delete cascade,

  member_id uuid not null
    references public.household_members(id)
    on delete cascade,

  -- Location used at the household end of this ride.
  -- TO EVENT: origin/pickup location
  -- FROM EVENT: destination/dropoff location
  household_location_id uuid not null
    references private.household_locations(id)
    on delete restrict,

  leg text not null
    check (
      leg in (
        'to_event',
        'from_event'
      )
    ),

  mode text not null
    check (
      mode in (
        'need_ride',
        'can_drive',
        'either',
        'self_transport',
        'none'
      )
    ),

  -- Number of EXTRA rider seats the driver can provide.
  available_seats smallint,

  -- Maximum additional drive time the driver will accept.
  max_detour_minutes smallint,

  -- Acceptable destination time window.
  --
  -- TO EVENT:
  -- acceptable arrival window
  --
  -- FROM EVENT:
  -- acceptable departure window
  anchor_earliest_at timestamptz,
  anchor_latest_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, member_id, leg),

  check (
    anchor_earliest_at is null
    or anchor_latest_at is null
    or anchor_latest_at >= anchor_earliest_at
  ),

  check (
    available_seats is null
    or available_seats between 1 and 20
  ),

  check (
    max_detour_minutes is null
    or max_detour_minutes between 0 and 120
  ),

  -- Drivers need seats + detour tolerance.
  check (
    (
      mode in ('can_drive', 'either')
      and available_seats is not null
      and max_detour_minutes is not null
    )
    or
    (
      mode not in ('can_drive', 'either')
      and available_seats is null
      and max_detour_minutes is null
    )
  ),

  -- Active transportation modes require a time window.
  check (
    (
      mode in ('need_ride', 'can_drive', 'either')
      and anchor_earliest_at is not null
      and anchor_latest_at is not null
    )
    or
    mode in ('self_transport', 'none')
  )
);


create trigger ride_participation_set_updated_at
before update on public.ride_participation
for each row
execute function private.set_updated_at();


create index ride_participation_event_idx
  on public.ride_participation(event_id);


create index ride_participation_member_idx
  on public.ride_participation(member_id);


create index ride_participation_matching_idx
  on public.ride_participation(event_id, leg, mode);


alter table public.ride_participation
enable row level security;


-- =========================================================
-- Integrity Validation
-- =========================================================

create or replace function private.validate_ride_participation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  member_household_id uuid;
  member_type_value text;
  event_group_id uuid;
  event_arrival timestamptz;
  event_departure timestamptz;
begin

  -- Get household + member type.
  select
    hm.household_id,
    hm.member_type
  into
    member_household_id,
    member_type_value
  from public.household_members hm
  where hm.id = new.member_id;

  if member_household_id is null then
    raise exception 'Invalid household member';
  end if;


  -- Get event information.
  select
    e.group_id,
    e.required_arrival_at,
    e.ready_to_depart_at
  into
    event_group_id,
    event_arrival,
    event_departure
  from public.events e
  where e.id = new.event_id;

  if event_group_id is null then
    raise exception 'Invalid event';
  end if;


  -- Household must actively belong to the event's group.
  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = event_group_id
      and gm.household_id = member_household_id
      and gm.status = 'active'
  )
  then
    raise exception
      'Household must be an active member of the event group';
  end if;


  -- Member must be marked as attending.
  if not exists (
    select 1
    from public.event_participation ep
    where ep.event_id = new.event_id
      and ep.member_id = new.member_id
      and ep.status = 'going'
  )
  then
    raise exception
      'Member must be attending the event before configuring transportation';
  end if;


  -- Household location must belong to this member's household.
  if not exists (
    select 1
    from private.household_locations hl
    where hl.id = new.household_location_id
      and hl.household_id = member_household_id
  )
  then
    raise exception
      'Ride location must belong to the member household';
  end if;


  -- For MVP, only adults can offer to drive.
  if new.mode in ('can_drive', 'either')
     and member_type_value <> 'adult'
  then
    raise exception
      'Only adult household members can offer to drive';
  end if;


  -- Make sure the requested ride leg exists for this event.
  if new.leg = 'to_event'
     and event_arrival is null
  then
    raise exception
      'This event does not support transportation to the event';
  end if;


  if new.leg = 'from_event'
     and event_departure is null
  then
    raise exception
      'This event does not support transportation from the event';
  end if;


  return new;
end;
$$;


revoke all
on function private.validate_ride_participation()
from public, anon, authenticated;


create trigger validate_ride_participation_trigger
before insert or update
on public.ride_participation
for each row
execute function private.validate_ride_participation();


-- =========================================================
-- Permissions
--
-- Raw ride preferences are private to the household.
-- Other households will later receive MATCH RESULTS,
-- not unrestricted access to these records.
-- =========================================================

revoke all
on table public.ride_participation
from anon, authenticated;


grant select
on public.ride_participation
to authenticated;


grant insert (
  event_id,
  member_id,
  household_location_id,
  leg,
  mode,
  available_seats,
  max_detour_minutes,
  anchor_earliest_at,
  anchor_latest_at
)
on public.ride_participation
to authenticated;


grant update (
  household_location_id,
  mode,
  available_seats,
  max_detour_minutes,
  anchor_earliest_at,
  anchor_latest_at
)
on public.ride_participation
to authenticated;


grant delete
on public.ride_participation
to authenticated;


-- =========================================================
-- RLS
-- =========================================================

create policy "ride_participation_select_household"
on public.ride_participation
for select
to authenticated
using (
  (select private.can_access_household_member(member_id))
);


create policy "ride_participation_insert_household_admin"
on public.ride_participation
for insert
to authenticated
with check (
  (select private.can_manage_household_member(member_id))
);


create policy "ride_participation_update_household_admin"
on public.ride_participation
for update
to authenticated
using (
  (select private.can_manage_household_member(member_id))
)
with check (
  (select private.can_manage_household_member(member_id))
);


create policy "ride_participation_delete_household_admin"
on public.ride_participation
for delete
to authenticated
using (
  (select private.can_manage_household_member(member_id))
);
