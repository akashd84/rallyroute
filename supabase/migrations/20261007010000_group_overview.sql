-- Count-only group overview. Individual ride preferences remain household-private.
create function private.get_group_overview(p_group_id uuid)
returns table(group_members bigint, needs_rides bigint, drivers_available bigint, carpools bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (private.is_group_member(p_group_id) or private.is_group_admin(p_group_id)) then
  raise exception 'Group unavailable' using errcode='42501';
 end if;
 return query
 with upcoming as (
  select e.* from public.events e where e.group_id=p_group_id and e.status='scheduled'
   and coalesce(e.ready_to_depart_at,e.required_arrival_at)>=now()
   and coalesce(e.required_arrival_at,e.ready_to_depart_at)<=now()+interval '7 days'
 ), confirmed as (
  select r.id from private.carpool_rides r join upcoming e on e.id=r.event_id
  where r.status='confirmed' and r.anchor_at>=now() and r.anchor_at<=now()+interval '7 days'
   and private.carpool_ride_valid(r.id)
 ), preferences as (
  select r.mode,m.member_type,r.available_seats from public.ride_participation r
  join upcoming e on e.id=r.event_id
  join public.household_members m on m.id=r.member_id and m.archived_at is null
  join public.households h on h.id=m.household_id and h.archived_at is null
  join public.group_memberships g on g.group_id=p_group_id and g.household_id=h.id and g.status='active'
  join public.event_participation a on a.event_id=r.event_id and a.member_id=r.member_id and a.status='going' and a.disabled_at is null
  where r.disabled_at is null and not r.needs_reconfirmation
   and (case r.leg when 'to_event' then e.required_arrival_at else e.ready_to_depart_at end) between now() and now()+interval '7 days'
   and not exists(select 1 from private.carpool_assignments x join confirmed c on c.id=x.ride_id
    where x.event_id=r.event_id and x.member_id=r.member_id and x.leg=r.leg)
 )
 select (select count(*) from public.group_memberships g join public.households h on h.id=g.household_id
          where g.group_id=p_group_id and g.status='active' and h.archived_at is null),
  (select count(*) from preferences where mode in ('need_ride','either')),
  (select count(*) from preferences where mode in ('can_drive','either') and member_type='adult' and available_seats>0),
  (select count(*) from confirmed);
end;
$$;
create function public.get_group_overview(p_group_id uuid)
returns table(group_members bigint, needs_rides bigint, drivers_available bigint, carpools bigint)
language sql stable security invoker set search_path='' as $$ select * from private.get_group_overview(p_group_id) $$;
revoke all on function private.get_group_overview(uuid),public.get_group_overview(uuid) from public,anon;
grant execute on function private.get_group_overview(uuid),public.get_group_overview(uuid) to authenticated;
