alter table public.event_locations add column geocoding_attribution text;
alter table private.household_locations add column geocoding_attribution text;
grant usage on schema private to service_role;

create or replace function private.household_location_list(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_household(p_household_id,false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'address_line_1',address_line_1,
      'address_line_2',address_line_2,'city',city,'state_region',state_region,
      'postal_code',postal_code,'country_code',country_code,
      'coordinates_available',location is not null,
      'geocoding_attribution',geocoding_attribution,'revision',revision,
      'archived_at',archived_at
    ) order by created_at)
    from private.household_locations where household_id=p_household_id
  ),'[]'::jsonb);
end;
$$;

create function private.authorize_location_geocoding(
  p_kind text,
  p_parent_id uuid,
  p_location_id uuid,
  p_revision integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  if p_kind = 'household' then
    perform private.lock_household(p_parent_id, true);
    if p_location_id is null then return p_revision is null; end if;
    return exists (
      select 1 from private.household_locations
      where id = p_location_id and household_id = p_parent_id
        and archived_at is null and revision = p_revision
    );
  elsif p_kind = 'event' then
    perform 1 from public.groups where id = p_parent_id for update;
    if not found or not private.is_group_admin(p_parent_id) then return false; end if;
    if p_location_id is null then return p_revision is null; end if;
    return exists (
      select 1 from public.event_locations
      where id = p_location_id and group_id = p_parent_id
        and archived_at is null and revision = p_revision
    );
  end if;
  return false;
end;
$$;
revoke all on function private.authorize_location_geocoding(text,uuid,uuid,integer) from public, anon;
grant execute on function private.authorize_location_geocoding(text,uuid,uuid,integer) to authenticated;

create function public.authorize_location_geocoding(
  p_kind text,
  p_parent_id uuid,
  p_location_id uuid,
  p_revision integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.authorize_location_geocoding(p_kind,p_parent_id,p_location_id,p_revision)
$$;
revoke all on function public.authorize_location_geocoding(text,uuid,uuid,integer) from public, anon;
grant execute on function public.authorize_location_geocoding(text,uuid,uuid,integer) to authenticated;

create function private.location_save_workflow(p_command text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  gid uuid;
  lid uuid;
  loc private.household_locations;
  dest public.event_locations;
  latitude_value double precision;
  longitude_value double precision;
  point_value extensions.geography;
  changed boolean;
  item record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if p_command = 'location-save' then
    hid = (p_data->>'householdId')::uuid;
    perform private.lock_household(hid,true);
    lid = nullif(p_data->>'locationId','')::uuid;
    if lid is not null then
      select * into loc from private.household_locations
      where id=lid and household_id=hid for update;
      if not found then raise exception 'Invalid location' using errcode='42501'; end if;
      if loc.revision <> (p_data->>'revision')::integer or p_data->>'revision' is null then
        raise exception 'Stale location' using errcode='40001';
      end if;
    end if;
  elsif p_command = 'destination-save' then
    gid = (p_data->>'groupId')::uuid;
    perform 1 from public.groups where id=gid for update;
    if not found or not private.is_group_admin(gid) then
      raise exception 'Group administration required' using errcode='42501';
    end if;
    lid = nullif(p_data->>'locationId','')::uuid;
    if lid is not null then
      select * into dest from public.event_locations
      where id=lid and group_id=gid for update;
      if not found then raise exception 'Invalid destination' using errcode='22023'; end if;
      if dest.revision <> (p_data->>'revision')::integer or p_data->>'revision' is null then
        raise exception 'Stale destination' using errcode='40001';
      end if;
    end if;
  else
    raise exception 'Unsupported operation' using errcode='22023';
  end if;

  if length(trim(coalesce(p_data->>'name',''))) = 0
    or length(p_data->>'name') > 100
    or length(trim(coalesce(p_data->>'addressLine1',''))) = 0
    or length(trim(coalesce(p_data->>'city',''))) = 0
    or length(trim(coalesce(p_data->>'stateRegion',''))) = 0
    or length(trim(coalesce(p_data->>'postalCode',''))) = 0
    or coalesce(p_data->>'countryCode','') !~ '^[A-Z]{2}$'
    or p_data->>'latitude' is null or p_data->>'longitude' is null
    or length(trim(coalesce(p_data->>'geocodingAttribution','')))=0
    or length(p_data->>'geocodingAttribution')>500 then
    raise exception 'Structured address and coordinates required' using errcode='22023';
  end if;
  latitude_value = (p_data->>'latitude')::double precision;
  longitude_value = (p_data->>'longitude')::double precision;
  if latitude_value not between -90 and 90 or longitude_value not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode='22023';
  end if;
  point_value = extensions.st_setsrid(
    extensions.st_makepoint(longitude_value,latitude_value),4326
  )::extensions.geography;

  if p_command = 'destination-save' then
    if lid is null then
      insert into public.event_locations(
        group_id,name,address_line_1,address_line_2,city,state_region,postal_code,
        country_code,location,provider_place_id,geocoding_attribution,created_by_user_id
      ) values (
        gid,trim(p_data->>'name'),p_data->>'addressLine1',p_data->>'addressLine2',
        p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',
        p_data->>'countryCode',point_value,nullif(p_data->>'providerPlaceId',''),
        p_data->>'geocodingAttribution',auth.uid()
      ) returning id into lid;
    else
      changed = (dest.address_line_1,dest.address_line_2,dest.city,dest.state_region,
        dest.postal_code,dest.country_code)
        is distinct from (p_data->>'addressLine1',p_data->>'addressLine2',
          p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',
          p_data->>'countryCode') or dest.location is null;
      if changed then
        for item in
          select id from public.events
          where location_id=lid and status='scheduled'
            and least(required_arrival_at,ready_to_depart_at)>now()
          order by id for update
        loop
          perform private.invalidate_event_rides(item.id);
          update public.events set revision=revision+1 where id=item.id;
        end loop;
      end if;
      update public.event_locations set
        name=trim(p_data->>'name'),address_line_1=p_data->>'addressLine1',
        address_line_2=p_data->>'addressLine2',city=p_data->>'city',
        state_region=p_data->>'stateRegion',postal_code=p_data->>'postalCode',
        country_code=p_data->>'countryCode',
        location=case when changed then point_value else dest.location end,
        provider_place_id=case when changed then nullif(p_data->>'providerPlaceId','') else dest.provider_place_id end,
        geocoding_attribution=case when changed then p_data->>'geocodingAttribution' else dest.geocoding_attribution end,
        revision=revision+1
      where id=lid and archived_at is null;
      if not found then raise exception 'Archived destination' using errcode='22023'; end if;
    end if;
    return lid;
  end if;

  if lid is null then
    insert into private.household_locations(
      household_id,label,address_line_1,address_line_2,city,state_region,
      postal_code,country_code,location,provider_place_id,geocoding_attribution
    ) values (
      hid,trim(p_data->>'name'),p_data->>'addressLine1',p_data->>'addressLine2',
      p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',
      p_data->>'countryCode',point_value,nullif(p_data->>'providerPlaceId',''),
      p_data->>'geocodingAttribution'
    ) returning id into lid;
  else
    changed = (loc.address_line_1,loc.address_line_2,loc.city,loc.state_region,
      loc.postal_code,loc.country_code)
      is distinct from (p_data->>'addressLine1',p_data->>'addressLine2',
        p_data->>'city',p_data->>'stateRegion',p_data->>'postalCode',
        p_data->>'countryCode') or loc.location is null;
    if changed then
      for item in
        select distinct e.id from public.events e
        join public.ride_participation r on r.event_id=e.id
        where r.household_location_id=lid order by e.id
      loop
        perform 1 from public.events where id=item.id for update;
        update public.ride_participation set disabled_at=now(),needs_reconfirmation=true
        where event_id=item.id and household_location_id=lid and disabled_at is null
          and case when leg='to_event'
            then (select required_arrival_at from public.events where id=item.id)
            else (select ready_to_depart_at from public.events where id=item.id)
          end > now();
      end loop;
    end if;
    update private.household_locations set
      label=trim(p_data->>'name'),address_line_1=p_data->>'addressLine1',
      address_line_2=p_data->>'addressLine2',city=p_data->>'city',
      state_region=p_data->>'stateRegion',postal_code=p_data->>'postalCode',
      country_code=p_data->>'countryCode',
      location=case when changed then point_value else loc.location end,
      provider_place_id=case when changed then nullif(p_data->>'providerPlaceId','') else loc.provider_place_id end,
      geocoding_attribution=case when changed then p_data->>'geocodingAttribution' else loc.geocoding_attribution end,
      revision=revision+1
    where id=lid and archived_at is null;
    if not found then raise exception 'Archived location' using errcode='22023'; end if;
  end if;
  return lid;
end;
$$;
revoke all on function private.location_save_workflow(text,jsonb) from public,anon,authenticated;

create function private.event_workflow_dispatcher(p_command text,p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if p_command in ('location-save','destination-save') then
    return private.location_save_workflow(p_command,p_data);
  end if;
  return private.event_workflow(p_command,p_data);
end;
$$;
revoke all on function private.event_workflow_dispatcher(text,jsonb) from public,anon;
grant execute on function private.event_workflow_dispatcher(text,jsonb) to authenticated;
revoke execute on function private.event_workflow(text,jsonb) from authenticated;
create or replace function public.event_workflow(p_command text,p_data jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.event_workflow_dispatcher(p_command,p_data)
$$;

create table private.routing_result_cache (
  cache_key text primary key check (cache_key ~ '^[a-f0-9]{64}$'),
  provider text not null,
  result jsonb not null check (
    coalesce(jsonb_typeof(result)='object'
    and result->>'status'='ok'
    and jsonb_typeof(result->'durationSeconds')='number'
    and jsonb_typeof(result->'distanceMeters')='number',false)
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index routing_result_cache_expiry_idx on private.routing_result_cache(expires_at);
alter table private.routing_result_cache enable row level security;
revoke all on private.routing_result_cache from public,anon,authenticated;

create function private.route_candidate_inputs(
  p_user_id uuid,
  p_event_id uuid,
  p_driver_ride_id uuid,
  p_rider_ride_id uuid,
  p_max_pickup_distance_meters integer
)
returns table(
  event_id uuid,
  leg text,
  event_latitude double precision,
  event_longitude double precision,
  driver_latitude double precision,
  driver_longitude double precision,
  rider_latitude double precision,
  rider_longitude double precision,
  driver_max_detour_minutes integer,
  driver_available_seats integer,
  household_distance_meters double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,d.leg,
    extensions.st_y(el.location::extensions.geometry),
    extensions.st_x(el.location::extensions.geometry),
    extensions.st_y(dl.location::extensions.geometry),
    extensions.st_x(dl.location::extensions.geometry),
    extensions.st_y(rl.location::extensions.geometry),
    extensions.st_x(rl.location::extensions.geometry),
    d.max_detour_minutes::integer,d.available_seats::integer,
    extensions.st_distance(dl.location,rl.location)
  from public.events e
  join public.event_locations el on el.id=e.location_id
    and el.archived_at is null and el.location is not null
  join public.ride_participation d on d.id=p_driver_ride_id and d.event_id=e.id
  join public.household_members dm on dm.id=d.member_id and dm.archived_at is null
  join public.households dh on dh.id=dm.household_id and dh.archived_at is null
  join private.household_locations dl on dl.id=d.household_location_id
    and dl.household_id=dm.household_id and dl.archived_at is null and dl.location is not null
  join public.ride_participation r on r.id=p_rider_ride_id and r.event_id=e.id and r.leg=d.leg
  join public.household_members rm on rm.id=r.member_id and rm.archived_at is null
  join public.households rh on rh.id=rm.household_id and rh.archived_at is null
  join private.household_locations rl on rl.id=r.household_location_id
    and rl.household_id=rm.household_id and rl.archived_at is null and rl.location is not null
  where e.id=p_event_id and e.status='scheduled'
    and case when d.leg='to_event' then e.required_arrival_at>now()
      else e.ready_to_depart_at>now() end
    and d.disabled_at is null and r.disabled_at is null
    and d.mode in ('can_drive','either') and dm.member_type='adult'
    and r.mode in ('need_ride','either')
    and d.available_seats>=1 and d.max_detour_minutes between 0 and 120
    and d.member_id<>r.member_id and dm.household_id<>rm.household_id
    and extensions.st_dwithin(dl.location,rl.location,p_max_pickup_distance_meters)
    and greatest(d.anchor_earliest_at,r.anchor_earliest_at)
      <= least(d.anchor_latest_at,r.anchor_latest_at)
    and exists (
      select 1 from public.event_participation dp
      where dp.event_id=e.id and dp.member_id=d.member_id
        and dp.status='going' and dp.disabled_at is null
    )
    and exists (
      select 1 from public.event_participation rp
      where rp.event_id=e.id and rp.member_id=r.member_id
        and rp.status='going' and rp.disabled_at is null
    )
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id=e.group_id and gm.household_id=dm.household_id and gm.status='active'
    )
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id=e.group_id and gm.household_id=rm.household_id and gm.status='active'
    )
    and exists (
      select 1 from public.group_memberships gm
      join public.household_access ha on ha.household_id=gm.household_id
      join public.households h on h.id=gm.household_id and h.archived_at is null
      where gm.group_id=e.group_id and gm.status='active' and ha.user_id=p_user_id
    )
    and p_max_pickup_distance_meters between 1000 and 250000
$$;
revoke all on function private.route_candidate_inputs(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.route_candidate_inputs(uuid,uuid,uuid,uuid,integer) to service_role;

create function public.route_candidate_inputs(
  p_user_id uuid,
  p_event_id uuid,
  p_driver_ride_id uuid,
  p_rider_ride_id uuid,
  p_max_pickup_distance_meters integer
)
returns table(
  event_id uuid, leg text, event_latitude double precision, event_longitude double precision,
  driver_latitude double precision, driver_longitude double precision,
  rider_latitude double precision, rider_longitude double precision,
  driver_max_detour_minutes integer, driver_available_seats integer,
  household_distance_meters double precision
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.route_candidate_inputs(
    p_user_id,p_event_id,p_driver_ride_id,p_rider_ride_id,p_max_pickup_distance_meters
  )
$$;
revoke all on function public.route_candidate_inputs(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.route_candidate_inputs(uuid,uuid,uuid,uuid,integer) to service_role;

create function private.routing_cache_get(p_cache_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare cached_result jsonb;
begin
  select result into cached_result from private.routing_result_cache
  where cache_key=p_cache_key and expires_at>now();
  return cached_result;
end;
$$;
revoke all on function private.routing_cache_get(text) from public,anon,authenticated;
grant execute on function private.routing_cache_get(text) to service_role;

create function public.routing_cache_get(p_cache_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.routing_cache_get(p_cache_key) $$;
revoke all on function public.routing_cache_get(text) from public,anon,authenticated;
grant execute on function public.routing_cache_get(text) to service_role;

create function private.routing_cache_put(p_cache_key text,p_provider text,p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_cache_key is null or p_cache_key !~ '^[a-f0-9]{64}$'
    or p_provider is null or length(p_provider)=0
    or coalesce(jsonb_typeof(p_result)<>'object',true)
    or p_result->>'status' is distinct from 'ok'
    or jsonb_typeof(p_result->'durationSeconds') is distinct from 'number'
    or jsonb_typeof(p_result->'distanceMeters') is distinct from 'number'
    or (p_result->>'durationSeconds')::numeric<0
    or (p_result->>'distanceMeters')::numeric<0 then
    raise exception 'Invalid route cache entry' using errcode='22023';
  end if;
  delete from private.routing_result_cache where expires_at<=now();
  insert into private.routing_result_cache(cache_key,provider,result,expires_at)
  values(p_cache_key,p_provider,p_result,now()+interval '30 days')
  on conflict(cache_key) do update set provider=excluded.provider,result=excluded.result,
    created_at=now(),expires_at=excluded.expires_at;
end;
$$;
revoke all on function private.routing_cache_put(text,text,jsonb) from public,anon,authenticated;
grant execute on function private.routing_cache_put(text,text,jsonb) to service_role;

create function public.routing_cache_put(p_cache_key text,p_provider text,p_result jsonb)
returns void language sql security invoker set search_path=''
as $$ select private.routing_cache_put(p_cache_key,p_provider,p_result) $$;
revoke all on function public.routing_cache_put(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.routing_cache_put(text,text,jsonb) to service_role;
