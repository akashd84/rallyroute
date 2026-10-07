-- A default is household-private and uses the existing one-primary unique index.
-- Choosing a default must not revoke previously consented address sharing.
drop trigger connection_address_change on private.household_locations;
create trigger connection_address_change after update on private.household_locations
for each row when ((to_jsonb(old)-'is_primary'-'updated_at') is distinct from (to_jsonb(new)-'is_primary'-'updated_at'))
execute function private.revoke_connections_lifecycle();

create function private.clear_archived_primary_location() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.archived_at is not null then new.is_primary=false; end if;
 return new;
end;
$$;
revoke all on function private.clear_archived_primary_location() from public,anon,authenticated;
create trigger household_location_archive_primary before insert or update on private.household_locations
for each row execute function private.clear_archived_primary_location();
update private.household_locations set is_primary=false where archived_at is not null and is_primary;
alter table private.household_locations add constraint household_locations_primary_active check (not is_primary or archived_at is null);

create function private.set_household_primary_location(p_household_id uuid,p_location_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id,true);
 if not exists(select 1 from private.household_locations where id=p_location_id and household_id=p_household_id and archived_at is null) then
  raise exception 'Address unavailable' using errcode='42501';
 end if;
 update private.household_locations set is_primary=false where household_id=p_household_id and is_primary and id<>p_location_id;
 update private.household_locations set is_primary=true where id=p_location_id and not is_primary;
end;
$$;
create function public.set_household_primary_location(p_household_id uuid,p_location_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.set_household_primary_location(p_household_id,p_location_id) $$;
revoke all on function private.set_household_primary_location(uuid,uuid),public.set_household_primary_location(uuid,uuid) from public,anon;
grant execute on function private.set_household_primary_location(uuid,uuid),public.set_household_primary_location(uuid,uuid) to authenticated;

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
      'id',id,'slug',slug,'label',label,'is_primary',is_primary,'address_line_1',address_line_1,
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

