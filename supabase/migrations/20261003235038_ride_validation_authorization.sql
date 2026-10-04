-- Allow controlled ride validation to inspect private locations without
-- granting API roles access to that table. Authorize before privileged reads.
create or replace function private.validate_ride_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_household_id uuid;
  member_type_value text;
  event_group_id uuid;
  event_arrival timestamptz;
  event_departure timestamptz;
begin

  -- The trigger must inspect private locations, but may do so only for
  -- members the authenticated caller can manage. Owner/service-role fixture
  -- setup has no API role and retains normal privileged maintenance access.
  if current_setting('role', true) in ('anon', 'authenticated')
     and (auth.uid() is null or not private.can_manage_household_member(new.member_id))
  then
    raise exception using errcode = '42501',
      message = 'Household administrator access required';
  end if;

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

revoke all on function private.validate_ride_participation()
  from public, anon, authenticated;
