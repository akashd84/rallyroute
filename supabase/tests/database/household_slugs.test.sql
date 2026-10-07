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
select set_config('rallyroute.household_slug_prefix','household-slug-'||replace(gen_random_uuid()::text,'-',''),true);
select is((select is_nullable::text from information_schema.columns where table_schema='public' and table_name='households' and column_name='slug'),'NO','slug is required');
select ok(exists(select 1 from pg_constraint where conrelid='public.households'::regclass and conname='households_slug_key' and contype='u'),'globally unique');
select is(private.allocate_household_slug(current_setting('rallyroute.household_slug_prefix')||' HOME !!! Name '),current_setting('rallyroute.household_slug_prefix')||'-home-name','ASCII normalization');
select ok(private.allocate_household_slug(null) ~ '^household(-[0-9a-f]{8})?$','null name fallback');
select ok(private.allocate_household_slug('学校') ~ '^household(-[0-9a-f]{8})?$','non-ASCII fallback');
select ok(private.allocate_household_slug('!!!') ~ '^household(-[0-9a-f]{8})?$','empty normalization fallback');
select ok(private.allocate_household_slug('NEW') ~ '^household-new(-[0-9a-f]{8})?$','reserved name prefixed');
select ok(private.allocate_household_slug('20000000-0000-4000-8000-000000000101') ~ '^household-20000000-0000-4000-8000-000000000101(-[0-9a-f]{8})?$','UUID shape prefixed');
select is(length(private.allocate_household_slug(repeat('a',100))),80,'maximum length');
select is((select count(*)::int from public.households where slug is null or length(slug)>80 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or slug='new' or slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),0,'backfilled records satisfy contract');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select set_config('rallyroute.household_slug_id',public.onboard_household(current_setting('rallyroute.household_slug_prefix'),'Test','Owner','20000000-0000-4000-8000-000000009001')::text,true);
select is((select slug from public.households where id=current_setting('rallyroute.household_slug_id')::uuid),current_setting('rallyroute.household_slug_prefix'),'first household gets plain name');
select is(public.onboard_household('Changed retry name','Test','Owner','20000000-0000-4000-8000-000000009001')::text,current_setting('rallyroute.household_slug_id'),'creation request remains idempotent');
select is((select slug from public.households where id=current_setting('rallyroute.household_slug_id')::uuid),current_setting('rallyroute.household_slug_prefix'),'retry preserves slug');
select set_config('rallyroute.household_slug_duplicate',public.create_household(current_setting('rallyroute.household_slug_prefix'))::text,true);
select ok((select slug from public.households where id=current_setting('rallyroute.household_slug_duplicate')::uuid) ~ ('^'||current_setting('rallyroute.household_slug_prefix')||'-[0-9a-f]{8}$'),'duplicate gets eight-character suffix');
select lives_ok($q$update public.households set display_name='Renamed household' where id=current_setting('rallyroute.household_slug_id')::uuid$q$,'Owner can rename');
select is((select slug from public.households where id=current_setting('rallyroute.household_slug_id')::uuid),current_setting('rallyroute.household_slug_prefix'),'rename leaves slug unchanged');
select throws_ok($q$update public.households set slug='forbidden' where id=current_setting('rallyroute.household_slug_id')::uuid$q$,'42501',null,'Owner cannot edit slug');
select throws_ok($q$select private.allocate_household_slug('probe')$q$,'42501',null,'no global availability probing');
reset role; set local role :"fixture_owner";
select throws_ok($q$update public.households set slug='forbidden' where id=current_setting('rallyroute.household_slug_id')::uuid$q$,'22023','Household slugs cannot be changed','privileged updates also preserve slug');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select is((select count(*)::int from public.households where slug=current_setting('rallyroute.household_slug_prefix')),0,'outsider cannot discover household by slug');
reset role; set local role anon;
select throws_ok($q$select slug from public.households$q$,'42501',null,'anonymous reads remain denied');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
