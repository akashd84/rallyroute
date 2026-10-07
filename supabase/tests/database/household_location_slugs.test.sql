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
select is((select is_nullable::text from information_schema.columns where table_schema='private' and table_name='household_locations' and column_name='slug'),'NO','private locations require slugs');
select ok(exists(select 1 from pg_constraint where conrelid='private.household_locations'::regclass and conname='household_locations_household_slug_key' and contype='u'),'slug uniqueness scoped to household');
select is((select slug from private.household_locations where id='20000000-0000-4000-8000-000000000510'),(select slug from private.household_locations where id='20000000-0000-4000-8000-000000000511'),'same slug can exist in different households');
select set_config('rallyroute.location_slug_prefix','location-'||replace(gen_random_uuid()::text,'-',''),true);
insert into private.household_locations(household_id,label) values
('20000000-0000-4000-8000-000000000101',current_setting('rallyroute.location_slug_prefix')),
('20000000-0000-4000-8000-000000000101',current_setting('rallyroute.location_slug_prefix'));
select is((select count(distinct slug)::int from private.household_locations where household_id='20000000-0000-4000-8000-000000000101' and label=current_setting('rallyroute.location_slug_prefix')),2,'duplicate labels within household receive distinct slugs');
select is((select count(*)::int from private.household_locations where household_id='20000000-0000-4000-8000-000000000101' and label=current_setting('rallyroute.location_slug_prefix') and slug ~ '-[0-9a-f]{8}$'),1,'one duplicate gets random suffix');
select is(private.allocate_household_location_slug('20000000-0000-4000-8000-000000000101',' ADD '),'location-add','add route reserved');
select is(private.allocate_household_location_slug('20000000-0000-4000-8000-000000000101','学校'),'location','ASCII fallback');
select is(length(private.allocate_household_location_slug('20000000-0000-4000-8000-000000000101',repeat('x',100))),80,'slug length limit');
select set_config('rallyroute.original_location_slug',(select slug from private.household_locations where id='20000000-0000-4000-8000-000000000510'),true);
update private.household_locations set label='Renamed pickup' where id='20000000-0000-4000-8000-000000000510';
select is((select slug from private.household_locations where id='20000000-0000-4000-8000-000000000510'),current_setting('rallyroute.original_location_slug'),'label edit preserves slug');
select throws_ok($q$update private.household_locations set slug='changed' where id='20000000-0000-4000-8000-000000000510'$q$,'22023','Location slugs cannot be changed','slugs immutable');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select ok(exists(select 1 from jsonb_array_elements(public.household_location_list('20000000-0000-4000-8000-000000000101')) x where x->>'slug'=current_setting('rallyroute.original_location_slug')),'authorized projection includes own slug');
select ok(not exists(select 1 from jsonb_array_elements(public.household_location_list('20000000-0000-4000-8000-000000000101')) x where x ? 'location' or x ? 'latitude' or x ? 'longitude'),'projection excludes precise coordinates');
select throws_ok($q$select public.household_location_list('20000000-0000-4000-8000-000000000102')$q$,'42501',null,'other household locations remain private');
select throws_ok($q$select * from private.household_locations$q$,'42501',null,'raw private table inaccessible');
select throws_ok($q$select private.allocate_household_location_slug('20000000-0000-4000-8000-000000000102','probe')$q$,'42501',null,'cannot probe other household slugs');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
