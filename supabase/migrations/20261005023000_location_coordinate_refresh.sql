-- Provider coordinate corrections invalidate future rides even when the address text stays unchanged.
create or replace function private.location_save_workflow(p_command text, p_data jsonb)
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
          p_data->>'countryCode') or dest.location is null
        or not extensions.st_equals(dest.location::extensions.geometry,point_value::extensions.geometry);
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
        p_data->>'countryCode') or loc.location is null
      or not extensions.st_equals(loc.location::extensions.geometry,point_value::extensions.geometry);
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
