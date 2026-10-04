-- Preserve the exact saved-location snapshot privately and record invalidation context.
create or replace function private.archive_ride_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare location_snapshot jsonb;
begin
 if to_jsonb(old) is distinct from to_jsonb(new) then
  select to_jsonb(l) into location_snapshot from private.household_locations l where l.id=old.household_location_id;
  insert into private.ride_preference_history(ride_id,snapshot,reason)
  values(old.id,to_jsonb(old)||jsonb_build_object('household_location_snapshot',location_snapshot),
   coalesce(nullif(current_setting('rallyroute.preference_reason',true),''),case when new.disabled_at is not null then 'disabled or invalidated' else 'replaced' end));
 end if;
 return new;
end $$;
create or replace function private.invalidate_event_rides(p_event uuid,p_reason text default 'event changed') returns void
language plpgsql security definer set search_path='' as $$
declare previous_reason text;
begin
 previous_reason=current_setting('rallyroute.preference_reason',true);
 perform set_config('rallyroute.preference_reason',p_reason,true);
 update public.ride_participation r set disabled_at=now(),needs_reconfirmation=true
 from public.events e where e.id=p_event and r.event_id=e.id and r.disabled_at is null
 and case when r.leg='to_event' then e.required_arrival_at else e.ready_to_depart_at end > now();
 perform set_config('rallyroute.preference_reason',coalesce(previous_reason,''),true);
end $$;
