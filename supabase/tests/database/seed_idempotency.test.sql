-- Fixture-loading assertions run as the owner; authorization suites use API roles.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

\ir ../../seed.sql

select is((select count(*)::integer from auth.users where id::text like '10000000-%'), 8, 'seed contains eight fictional accounts');
select is((select count(*)::integer from public.households where id::text like '10000000-%'), 5, 'seed contains five households');
select is((select count(*)::integer from public.ride_participation where id::text like '10000000-%'), 4, 'seed contains four ride preferences');

insert into public.households (id, display_name)
values ('30000000-0000-4000-8000-000000000001', 'Unrelated local data');
update public.households set display_name = 'Edited fixture'
where id = '10000000-0000-4000-8000-000000000101';

create function pg_temp.seed_state() returns jsonb
language plpgsql security invoker as $$
declare
  table_name text;
  rows jsonb;
  state jsonb := '{}'::jsonb;
begin
  foreach table_name in array array[
    'auth.users', 'public.profiles', 'public.households', 'public.household_access',
    'public.household_members', 'public.groups', 'public.group_admins',
    'public.group_memberships', 'public.group_invitations', 'public.group_invitation_redemptions',
    'public.event_locations', 'private.household_locations', 'public.event_series',
    'public.events', 'public.event_participation', 'public.ride_participation'
  ] loop
    execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from %s t', table_name) into rows;
    state := state || jsonb_build_object(table_name, rows);
  end loop;
  return state;
end;
$$;
create temporary table before_seed as select pg_temp.seed_state() as state;

\ir ../../seed.sql

select is(pg_temp.seed_state(), (select state from before_seed), 'repeated seed leaves every existing row unchanged');
select is((select display_name from public.households where id = '10000000-0000-4000-8000-000000000101'), 'Edited fixture', 'seed preserves edited fixture values');
select is((select count(*)::integer from public.households where id = '30000000-0000-4000-8000-000000000001'), 1, 'seed preserves unrelated data');

select * from finish();
rollback;
