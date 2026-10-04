-- Phase 2: controlled event and transportation writes. Sensitive addresses stay private.
alter table public.event_locations add column archived_at timestamptz, add column revision integer not null default 1;
alter table private.household_locations add column archived_at timestamptz, add column revision integer not null default 1;
alter table public.events add column timezone text not null default 'UTC', add column revision integer not null default 1,
 add column request_id uuid, add column original_local_date date, add column is_exception boolean not null default false;
update public.events e set timezone=s.timezone from public.event_series s where s.id=e.event_series_id;
create unique index events_creation_request on public.events(created_by_user_id,request_id) where request_id is not null;
create unique index events_series_date on public.events(event_series_id,original_local_date) where event_series_id is not null;
alter table public.event_series add column revision integer not null default 1, add column request_id uuid,
 add column recurrence_spec jsonb, add column predecessor_series_id uuid references public.event_series(id),
 add column departure_next_day boolean not null default false;
create unique index series_creation_request on public.event_series(created_by_user_id,request_id) where request_id is not null;
alter table public.ride_participation alter column household_location_id drop not null;
alter table public.ride_participation add column needs_reconfirmation boolean not null default false;
create table private.ride_preference_history (
 id uuid primary key default gen_random_uuid(), ride_id uuid not null, snapshot jsonb not null,
 reason text not null, recorded_at timestamptz not null default now()
);
revoke all on private.ride_preference_history from public,anon,authenticated;

create function private.archive_ride_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if to_jsonb(old) is distinct from to_jsonb(new) then
  insert into private.ride_preference_history(ride_id,snapshot,reason)
  values(old.id,to_jsonb(old),case when new.disabled_at is not null then 'disabled or invalidated' else 'replaced' end);
 end if;
 return new;
end $$;
revoke all on function private.archive_ride_snapshot() from public,anon,authenticated;
create trigger ride_snapshot before update on public.ride_participation for each row execute function private.archive_ride_snapshot();

create function private.invalidate_event_rides(p_event uuid,p_reason text default 'event changed') returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.ride_participation r set disabled_at=now(),needs_reconfirmation=true
 from public.events e where e.id=p_event and r.event_id=e.id and r.disabled_at is null
 and case when r.leg='to_event' then e.required_arrival_at else e.ready_to_depart_at end > now();
end $$;
revoke all on function private.invalidate_event_rides(uuid,text) from public,anon,authenticated;

create function private.household_location_list(p_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id,false);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'address_line_1',address_line_1,
 'address_line_2',address_line_2,'city',city,'state_region',state_region,'postal_code',postal_code,
 'country_code',country_code,'revision',revision,'archived_at',archived_at) order by created_at)
 from private.household_locations where household_id=p_household_id),'[]'::jsonb);
end $$;
create function public.household_location_list(p_household_id uuid) returns jsonb language sql security invoker set search_path=''
as $$select private.household_location_list(p_household_id)$$;
revoke all on function private.household_location_list(uuid),public.household_location_list(uuid) from public,anon;
grant execute on function private.household_location_list(uuid),public.household_location_list(uuid) to authenticated;

create function private.event_workflow(p_command text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 eid uuid; hid uuid; gid uuid; mid uuid; lid uuid; rid uuid; ev public.events; dest public.event_locations;
 loc private.household_locations; participant public.household_members; anchor timestamptz;
 arrival timestamptz; departure timestamptz; earliest timestamptz; latest timestamptz;
 mode_value text; leg_value text; active_mode boolean; changed boolean; item record;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_command in ('attendance','ride','location-save','location-archive') then
  hid=(p_data->>'householdId')::uuid;
  perform private.lock_household(hid,p_command like 'location-%');
 else
  gid=(p_data->>'groupId')::uuid;
  perform 1 from public.groups where id=gid for update;
  if not private.is_group_admin(gid) then raise exception 'Group administration required' using errcode='42501'; end if;
 end if;
 if p_command in ('event-save','event-cancel','attendance','ride') then
  eid=nullif(p_data->>'eventId','')::uuid;
  if eid is not null then
   select * into ev from public.events where id=eid for update;
   if not found or (gid is not null and ev.group_id<>gid) then raise exception 'Invalid event' using errcode='22023'; end if;
   if ev.revision<> (p_data->>'revision')::integer or p_data->>'revision' is null then raise exception 'Stale event' using errcode='40001'; end if;
  end if;
 end if;
 if p_command in ('attendance','ride') then
  mid=(p_data->>'memberId')::uuid;
  select * into participant from public.household_members where id=mid and household_id=hid and archived_at is null;
  if not found or ev.status<>'scheduled' or not exists(select 1 from public.group_memberships where group_id=ev.group_id and household_id=hid and status='active') then
   raise exception 'Participant unavailable' using errcode='42501'; end if;
  if greatest(ev.required_arrival_at,ev.ready_to_depart_at)<=now() then raise exception 'Event has ended' using errcode='22023'; end if;
 end if;
 if p_command in ('destination-save','destination-archive') then
  lid=nullif(p_data->>'locationId','')::uuid;
  if lid is not null then
   select * into dest from public.event_locations where id=lid and group_id=gid for update;
   if not found then raise exception 'Invalid destination' using errcode='22023'; end if;
   if dest.revision<>(p_data->>'revision')::integer or p_data->>'revision' is null then raise exception 'Stale destination' using errcode='40001'; end if;
  end if;
  if p_command='destination-archive' then
   update public.event_locations set archived_at=now(),revision=revision+1 where id=lid; return lid;
  end if;
  if length(trim(coalesce(p_data->>'name','')))=0 or length(p_data->>'name')>100
   or length(trim(coalesce(p_data->>'addressLine1','')))=0 or length(trim(coalesce(p_data->>'city','')))=0
   or length(trim(coalesce(p_data->>'stateRegion','')))=0 or length(trim(coalesce(p_data->>'postalCode','')))=0
   or coalesce(p_data->>'countryCode','') !~ '^[A-Z]{2}$' then raise exception 'Structured address required' using errcode='22023'; end if;
  if lid is null then
   insert into public.event_locations(group_id,name,address_line_1,address_line_2,city,state_region,postal_code,country_code,created_by_user_id)
   values(gid,trim(p_data->>'name'),p_data->>'addressLine1',p_data->>'addressLine2',p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',p_data->>'countryCode',auth.uid()) returning id into lid;
  else
   changed=(dest.address_line_1,dest.address_line_2,dest.city,dest.state_region,dest.postal_code,dest.country_code)
    is distinct from (p_data->>'addressLine1',p_data->>'addressLine2',p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',p_data->>'countryCode');
   if changed then
    for item in select id from public.events where location_id=lid and status='scheduled' and least(required_arrival_at,ready_to_depart_at)>now() order by id for update loop
     perform private.invalidate_event_rides(item.id);
     update public.events set revision=revision+1 where id=item.id;
    end loop;
   end if;
   update public.event_locations set name=trim(p_data->>'name'),address_line_1=p_data->>'addressLine1',address_line_2=p_data->>'addressLine2',
    city=p_data->>'city',state_region=p_data->>'stateRegion',postal_code=p_data->>'postalCode',country_code=p_data->>'countryCode',location=null,revision=revision+1 where id=lid and archived_at is null;
   if not found then raise exception 'Archived destination' using errcode='22023'; end if;
  end if; return lid;
 elsif p_command='event-cancel' then
  perform private.invalidate_event_rides(eid,'cancelled');
  update public.events set status='cancelled',revision=revision+1,is_exception=(event_series_id is not null) where id=eid; return eid;
 elsif p_command='event-save' then
  if eid is null then
   rid=(p_data->>'requestId')::uuid;
   if rid is null then raise exception 'Request required' using errcode='22023'; end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||rid::text,0));
   select id into eid from public.events where created_by_user_id=auth.uid() and request_id=rid;
   if found then return eid; end if;
  elsif ev.status<>'scheduled' or least(ev.required_arrival_at,ev.ready_to_depart_at)<=now() then raise exception 'Event is read only' using errcode='22023'; end if;
  arrival=nullif(p_data->>'arrival','')::timestamptz; departure=nullif(p_data->>'departure','')::timestamptz;
  lid=(p_data->>'locationId')::uuid;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone')
   or length(trim(coalesce(p_data->>'name','')))=0 or length(p_data->>'name')>100
   or (arrival is null and departure is null) or least(arrival,departure)<=now()
   or (arrival is not null and departure is not null and arrival>=departure)
   or not exists(select 1 from public.event_locations where id=lid and group_id=gid and archived_at is null) then raise exception 'Invalid event details' using errcode='22023'; end if;
  if eid is null then
   insert into public.events(group_id,name,location_id,timezone,required_arrival_at,ready_to_depart_at,activity_starts_at,activity_ends_at,request_id,created_by_user_id)
   values(gid,trim(p_data->>'name'),lid,p_data->>'timezone',arrival,departure,nullif(p_data->>'activityStart','')::timestamptz,nullif(p_data->>'activityEnd','')::timestamptz,rid,auth.uid()) returning id into eid;
  else
   if (ev.location_id,ev.timezone,ev.required_arrival_at,ev.ready_to_depart_at) is distinct from (lid,p_data->>'timezone',arrival,departure) then perform private.invalidate_event_rides(eid); end if;
   update public.events set name=trim(p_data->>'name'),location_id=lid,timezone=p_data->>'timezone',required_arrival_at=arrival,ready_to_depart_at=departure,
   activity_starts_at=nullif(p_data->>'activityStart','')::timestamptz,activity_ends_at=nullif(p_data->>'activityEnd','')::timestamptz,revision=revision+1,is_exception=(event_series_id is not null) where id=eid;
  end if; return eid;
 elsif p_command='attendance' then
  if p_data->>'status' not in ('going','not_going','unknown') or p_data->>'status' is null then raise exception 'Invalid attendance' using errcode='22023'; end if;
  insert into public.event_participation(event_id,member_id,status) values(eid,mid,p_data->>'status')
  on conflict(event_id,member_id) do update set status=excluded.status,disabled_at=null;
  if p_data->>'status'<>'going' then
   update public.ride_participation set disabled_at=now(),needs_reconfirmation=true where event_id=eid and member_id=mid and disabled_at is null
   and case when leg='to_event' then ev.required_arrival_at else ev.ready_to_depart_at end>now();
  end if; return eid;
 elsif p_command='ride' then
  leg_value=p_data->>'leg'; mode_value=p_data->>'mode'; active_mode=mode_value in ('need_ride','can_drive','either');
  anchor=case when leg_value='to_event' then ev.required_arrival_at when leg_value='from_event' then ev.ready_to_depart_at end;
  if anchor is null or anchor<=now() or mode_value not in ('need_ride','can_drive','either','self_transport','none') or mode_value is null then raise exception 'Unavailable ride direction' using errcode='22023'; end if;
  if not exists(select 1 from public.event_participation where event_id=eid and member_id=mid and status='going' and disabled_at is null) then raise exception 'Attendance required' using errcode='22023'; end if;
  lid=nullif(p_data->>'locationId','')::uuid; earliest=nullif(p_data->>'earliest','')::timestamptz; latest=nullif(p_data->>'latest','')::timestamptz;
  if active_mode and (not exists(select 1 from private.household_locations where id=lid and household_id=hid and archived_at is null)
   or earliest is null or latest is null or earliest>latest or (leg_value='to_event' and latest>anchor) or (leg_value='from_event' and earliest<anchor)) then raise exception 'Invalid location or time window' using errcode='22023'; end if;
  if mode_value in ('can_drive','either') and participant.member_type<>'adult' then raise exception 'Adult driver required' using errcode='22023'; end if;
  insert into public.ride_participation(event_id,member_id,leg,mode,household_location_id,anchor_earliest_at,anchor_latest_at,available_seats,max_detour_minutes)
  values(eid,mid,leg_value,mode_value,case when active_mode then lid end,case when active_mode then earliest end,case when active_mode then latest end,
   case when mode_value in ('can_drive','either') then (p_data->>'seats')::smallint end,case when mode_value in ('can_drive','either') then (p_data->>'detour')::smallint end)
  on conflict(event_id,member_id,leg) do update set mode=excluded.mode,household_location_id=excluded.household_location_id,anchor_earliest_at=excluded.anchor_earliest_at,
   anchor_latest_at=excluded.anchor_latest_at,available_seats=excluded.available_seats,max_detour_minutes=excluded.max_detour_minutes,disabled_at=null,needs_reconfirmation=false;
  return eid;
 elsif p_command in ('location-save','location-archive') then
  lid=nullif(p_data->>'locationId','')::uuid;
  if lid is not null then
   select * into loc from private.household_locations where id=lid and household_id=hid;
   if not found then raise exception 'Invalid location' using errcode='42501'; end if;
   if loc.revision<>(p_data->>'revision')::integer or p_data->>'revision' is null then raise exception 'Stale location' using errcode='40001'; end if;
   for item in select distinct e.id from public.events e join public.ride_participation r on r.event_id=e.id where r.household_location_id=lid order by e.id loop
    perform 1 from public.events where id=item.id for update;
    update public.ride_participation set disabled_at=now(),needs_reconfirmation=true where event_id=item.id and household_location_id=lid and disabled_at is null
    and case when leg='to_event' then (select required_arrival_at from public.events where id=item.id) else (select ready_to_depart_at from public.events where id=item.id) end>now();
   end loop;
  end if;
  if p_command='location-archive' then update private.household_locations set archived_at=now(),revision=revision+1 where id=lid; return lid; end if;
  if length(trim(coalesce(p_data->>'name','')))=0 or length(p_data->>'name')>100 or length(trim(coalesce(p_data->>'addressLine1','')))=0
   or length(trim(coalesce(p_data->>'city','')))=0 or length(trim(coalesce(p_data->>'stateRegion','')))=0 or length(trim(coalesce(p_data->>'postalCode','')))=0
   or coalesce(p_data->>'countryCode','') !~ '^[A-Z]{2}$' then raise exception 'Structured address required' using errcode='22023'; end if;
  if lid is null then
   insert into private.household_locations(household_id,label,address_line_1,address_line_2,city,state_region,postal_code,country_code)
   values(hid,trim(p_data->>'name'),p_data->>'addressLine1',p_data->>'addressLine2',p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',p_data->>'countryCode') returning id into lid;
  else
   update private.household_locations set label=trim(p_data->>'name'),address_line_1=p_data->>'addressLine1',address_line_2=p_data->>'addressLine2',city=p_data->>'city',
    state_region=p_data->>'stateRegion',postal_code=p_data->>'postalCode',country_code=p_data->>'countryCode',location=null,revision=revision+1 where id=lid and archived_at is null;
   if not found then raise exception 'Archived location' using errcode='22023'; end if;
  end if; return lid;
 end if;
 raise exception 'Unsupported operation' using errcode='22023';
end $$;
create function public.event_workflow(p_command text,p_data jsonb) returns uuid language sql security invoker set search_path=''
as $$ select private.event_workflow(p_command,p_data) $$;
revoke all on function private.event_workflow(text,jsonb),public.event_workflow(text,jsonb) from public,anon;
grant execute on function private.event_workflow(text,jsonb),public.event_workflow(text,jsonb) to authenticated;

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
  if new.disabled_at is not null then return new; end if;

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
  if new.mode in ('need_ride','can_drive','either') and not exists (
    select 1
    from private.household_locations hl
    where hl.id = new.household_location_id
      and hl.household_id = member_household_id
      and hl.archived_at is null
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

