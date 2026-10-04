-- Preserve adult-only driving when changing an unlinked participant type.
create or replace function private.guard_household_participant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=new.household_id for update;
 if new.linked_user_id is not null and (new.member_type <> 'adult' or new.archived_at is not null) then
   raise exception using errcode='23514',message='Account-linked participants must be active adults';
 end if;
 if current_setting('role',true) in ('anon','authenticated') and
    (not private.is_household_member(new.household_id) or exists(select 1 from public.households where id=new.household_id and archived_at is not null)) then
   raise exception using errcode='42501',message='Household access denied';
 end if;
 if new.member_type='child' and exists(
   select 1 from public.ride_participation r join public.events e on e.id=r.event_id
   where r.member_id=new.id and r.mode in ('can_drive','either') and r.disabled_at is null
   and (case when r.leg='to_event' then e.required_arrival_at else e.ready_to_depart_at end)>=now()
 ) then raise exception using errcode='23514',message='Remove future driving offers before changing participant type'; end if;
 return new;
end;
$$;
