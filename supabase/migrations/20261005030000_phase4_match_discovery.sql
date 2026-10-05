-- Coordinates and cross-household preferences remain behind service-only functions.
create function private.match_candidates(
  p_user_id uuid, p_event_id uuid, p_household_id uuid, p_leg text,
  p_max_distance integer, p_after text default '', p_keys text[] default null,
  p_limit integer default 21
) returns table(pair_key text, candidate jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_leg not in ('to_event','from_event') or p_leg is null
    or p_max_distance not between 1000 and 250000 or p_max_distance is null
    or p_limit not between 1 and 1000 or p_limit is null
    or coalesce(cardinality(p_keys),0)>1000 then
    raise exception 'Invalid discovery request' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.household_access ha
    join public.households h on h.id=ha.household_id and h.archived_at is null
    join public.events e on e.id=p_event_id
    join public.group_memberships gm on gm.group_id=e.group_id
      and gm.household_id=h.id and gm.status='active'
    where ha.user_id=p_user_id and h.id=p_household_id
  ) then raise exception 'Discovery unavailable' using errcode='42501'; end if;

  return query
  select d.id::text||':'||r.id::text,
    jsonb_build_object(
      'pair_key',d.id::text||':'||r.id::text,
      'driver_ride_id',d.id,'rider_ride_id',r.id,
      'other_household_id',case when dm.household_id=p_household_id then rh.id else dh.id end,
      'other_household_name',case when dm.household_id=p_household_id then rh.display_name else dh.display_name end,
      'own_member_id',case when dm.household_id=p_household_id then dm.id else rm.id end,
      'own_member_name',case when dm.household_id=p_household_id then dm.first_name else rm.first_name end,
      'own_role',case when dm.household_id=p_household_id then 'driver' else 'rider' end,
      'earliest',greatest(d.anchor_earliest_at,r.anchor_earliest_at),
      'latest',least(d.anchor_latest_at,r.anchor_latest_at),
      'route',to_jsonb(route),
      -- Snapshot all eligibility/routing inputs and displayed identity; never send this to clients.
      'fingerprint',md5(jsonb_build_array(to_jsonb(d),to_jsonb(r),to_jsonb(e),
        to_jsonb(dm),to_jsonb(rm),dh.display_name,rh.display_name,
        to_jsonb(route),dl.revision,rl.revision,el.revision)::text)
    )
  from public.ride_participation d
  join public.household_members dm on dm.id=d.member_id
  join public.households dh on dh.id=dm.household_id
  join public.ride_participation r on r.event_id=d.event_id and r.leg=d.leg
  join public.household_members rm on rm.id=r.member_id
  join public.households rh on rh.id=rm.household_id
  join public.events e on e.id=d.event_id
  join public.event_locations el on el.id=e.location_id
  join private.household_locations dl on dl.id=d.household_location_id
  join private.household_locations rl on rl.id=r.household_location_id
  cross join lateral private.route_candidate_inputs(p_user_id,p_event_id,d.id,r.id,p_max_distance) route
  where d.event_id=p_event_id and d.leg=p_leg
    and (dm.household_id=p_household_id or rm.household_id=p_household_id)
    and dm.household_id<>rm.household_id
    and not d.needs_reconfirmation and not r.needs_reconfirmation
    and d.mode in ('can_drive','either') and r.mode in ('need_ride','either')
    and (p_keys is null or (d.id::text||':'||r.id::text)=any(p_keys))
    and (d.id::text||':'||r.id::text)>coalesce(p_after,'')
  order by d.id::text||':'||r.id::text
  limit p_limit;
end $$;
revoke all on function private.match_candidates(uuid,uuid,uuid,text,integer,text,text[],integer) from public,anon,authenticated;
grant execute on function private.match_candidates(uuid,uuid,uuid,text,integer,text,text[],integer) to service_role;

create function public.match_candidates(
  p_user_id uuid, p_event_id uuid, p_household_id uuid, p_leg text,
  p_max_distance integer, p_after text default '', p_keys text[] default null,
  p_limit integer default 21
) returns table(pair_key text,candidate jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from private.match_candidates(p_user_id,p_event_id,p_household_id,p_leg,
    p_max_distance,p_after,p_keys,p_limit)
$$;
revoke all on function public.match_candidates(uuid,uuid,uuid,text,integer,text,text[],integer) from public,anon,authenticated;
grant execute on function public.match_candidates(uuid,uuid,uuid,text,integer,text,text[],integer) to service_role;
