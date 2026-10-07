begin;
\if :{?fixture_owner}
\else
select current_user as fixture_owner \gset
\endif
set local role :"fixture_owner";
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
\ir ../fixtures.sql
select no_plan();
insert into private.household_locations(id,household_id,label) values('20000000-0000-4000-8000-000000000599','20000000-0000-4000-8000-000000000101','Second address');
insert into public.household_connections(id,requester_household_id,recipient_household_id,group_id,event_id,status)
values('20000000-0000-4000-8000-000000001000','20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000610','accepted');
insert into private.connection_pickups(connection_id,household_id,event_id,leg,location_id,location_revision,expires_at)
select '20000000-0000-4000-8000-000000001000',household_id,'20000000-0000-4000-8000-000000000610','to_event',id,revision,'2099-01-01Z' from private.household_locations where id='20000000-0000-4000-8000-000000000510';
select set_config('rallyroute.primary_revision',(select revision::text from private.household_locations where id='20000000-0000-4000-8000-000000000510'),true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select lives_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000599')$q$,'Owner switches primary');
select is((select count(*)::int from jsonb_array_elements(public.household_location_list('20000000-0000-4000-8000-000000000101')) l where (l->>'is_primary')::boolean),1,'exactly one primary projected');
select is((select l->>'id' from jsonb_array_elements(public.household_location_list('20000000-0000-4000-8000-000000000101')) l where (l->>'is_primary')::boolean),'20000000-0000-4000-8000-000000000599','selected address primary');
select lives_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000599')$q$,'repeated choice idempotent');
select throws_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000511')$q$,'42501','Address unavailable','cross-household target denied');
select is((select l->>'id' from jsonb_array_elements(public.household_location_list('20000000-0000-4000-8000-000000000101')) l where (l->>'is_primary')::boolean),'20000000-0000-4000-8000-000000000599','failed switch preserves prior primary');
reset role; set local role :"fixture_owner";
select is((select revision::text from private.household_locations where id='20000000-0000-4000-8000-000000000510'),current_setting('rallyroute.primary_revision'),'default change does not alter address revision');
select is((select count(*)::int from private.connection_pickups where connection_id='20000000-0000-4000-8000-000000001000' and revoked_at is null),1,'default change preserves sharing consent');
select is((select count(*)::int from public.ride_participation where event_id='20000000-0000-4000-8000-000000000610' and disabled_at is not null),0,'default change preserves existing ride preferences');
select throws_ok($q$update private.household_locations set is_primary=true where id='20000000-0000-4000-8000-000000000510'$q$,'23505',null,'database prevents two primaries');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select throws_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000510')$q$,'42501',null,'household Member cannot change default');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select throws_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000510')$q$,'42501',null,'outsider denied');
reset role; set local role :"fixture_owner";
update private.household_locations set archived_at=now() where id='20000000-0000-4000-8000-000000000599';
select is((select is_primary from private.household_locations where id='20000000-0000-4000-8000-000000000599'),false,'archiving clears primary');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select throws_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000599')$q$,'42501','Address unavailable','archived address cannot be primary');
reset role; set local role :"fixture_owner";
update private.household_locations set revision=revision+1 where id='20000000-0000-4000-8000-000000000510';
select is((select count(*)::int from private.connection_pickups where connection_id='20000000-0000-4000-8000-000000001000' and revoked_at is null),0,'actual address revision still revokes consent');
set local role anon;
select throws_ok($q$select public.set_household_primary_location('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000510')$q$,'42501',null,'anonymous denied');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
