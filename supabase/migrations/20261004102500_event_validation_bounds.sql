-- Shared database validation remains effective for ordinary RPC callers without the UI.
create function private.validate_event_details() returns trigger language plpgsql set search_path='' as $$
begin
 if length(trim(new.name))=0 or length(new.name)>100 or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone)
 or (new.activity_starts_at is not null and new.activity_ends_at is not null and new.activity_ends_at<new.activity_starts_at)
 then raise exception 'Invalid event name, timezone, or activity interval' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.validate_event_details() from public,anon,authenticated;
create trigger event_details before insert or update on public.events for each row execute function private.validate_event_details();
create function private.validate_saved_address() returns trigger language plpgsql set search_path='' as $$
begin
 if length(coalesce(new.address_line_1,''))>200 or length(coalesce(new.address_line_2,''))>200
 or length(coalesce(new.city,''))>100 or length(coalesce(new.state_region,''))>100 or length(coalesce(new.postal_code,''))>30
 then raise exception 'Address field exceeds maximum length' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.validate_saved_address() from public,anon,authenticated;
create trigger destination_address_bounds before insert or update on public.event_locations for each row execute function private.validate_saved_address();
create trigger household_address_bounds before insert or update on private.household_locations for each row execute function private.validate_saved_address();
