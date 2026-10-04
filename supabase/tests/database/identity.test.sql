begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

grant usage on schema extensions to authenticated, anon;

\ir ../fixtures.sql

select no_plan();

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.profiles where id='20000000-0000-4000-8000-000000000001'), 1, 'own profile is readable');

select is((select count(*)::integer from public.profiles where id='20000000-0000-4000-8000-000000000004'), 0, 'other profile is hidden');

with changed as (update public.profiles set first_name='Updated' where id='20000000-0000-4000-8000-000000000001' returning 1) select is(count(*)::integer, 1, 'own profile can be edited') from changed;

with changed as (update public.profiles set first_name='Forbidden' where id='20000000-0000-4000-8000-000000000004' returning 1) select is(count(*)::integer, 0, 'other profile cannot be edited') from changed;

select is((select count(*)::integer from public.households where id='20000000-0000-4000-8000-000000000101'), 1, 'own household visible');

select is((select count(*)::integer from public.households where id='20000000-0000-4000-8000-000000000102'), 0, 'shared group does not expose another household');

select is((select count(*)::integer from public.household_access where household_id='20000000-0000-4000-8000-000000000101'), 3, 'own household access visible');

select is((select count(*)::integer from public.household_access where household_id='20000000-0000-4000-8000-000000000102'), 0, 'other household access hidden');

with changed as (update public.households set display_name='Edited' where id='20000000-0000-4000-8000-000000000101' returning 1) select is(count(*)::integer, 1, 'owner edits household') from changed;

with changed as (update public.households set display_name='Forbidden' where id='20000000-0000-4000-8000-000000000102' returning 1) select is(count(*)::integer, 0, 'owner cannot edit another household') from changed;

select lives_ok($sql$insert into public.household_members(household_id,first_name,member_type) values ('20000000-0000-4000-8000-000000000101','Added','adult')$sql$, 'owner adds non-account adult');

with changed as (update public.household_members set first_name='Owned' where id='20000000-0000-4000-8000-000000000203' returning 1) select is(count(*)::integer, 1, 'owner updates own member') from changed;

with changed as (update public.household_members set first_name='Forbidden' where id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign member update affects zero rows') from changed;

with changed as (delete from public.household_members where id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign member delete affects zero rows') from changed;

select throws_ok($sql$insert into public.household_members(household_id,first_name,member_type) values ('20000000-0000-4000-8000-000000000102','Forbidden','adult')$sql$, '42501', null, 'cannot add another household member');

select throws_ok($sql$insert into public.household_members(household_id,first_name,member_type,linked_user_id) values ('20000000-0000-4000-8000-000000000101','Linked','adult','20000000-0000-4000-8000-000000000003')$sql$, '42501', null, 'linked identity cannot be inserted directly');

select throws_ok($sql$update public.household_members set linked_user_id='20000000-0000-4000-8000-000000000003' where id='20000000-0000-4000-8000-000000000203'$sql$, '42501', null, 'linked identity is not writable');

select throws_ok($sql$update public.household_members set household_id='20000000-0000-4000-8000-000000000102' where id='20000000-0000-4000-8000-000000000203'$sql$, '42501', null, 'member household is not writable');

select throws_ok($sql$delete from public.household_access where user_id='20000000-0000-4000-8000-000000000003'$sql$, '42501', null, 'household access cannot be removed directly');

select throws_ok($sql$insert into public.household_access(household_id,user_id,role) values ('20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000001','owner')$sql$, '42501', null, 'access ownership cannot be inserted directly');

select throws_ok($sql$update public.household_access set role='owner' where user_id='20000000-0000-4000-8000-000000000003'$sql$, '42501', null, 'access roles cannot be changed directly');

select throws_ok($sql$insert into public.households(display_name) values ('Orphan')$sql$, '42501', null, 'household creation must use workflow');

select lives_ok($sql$select public.create_household('Controlled household')$sql$, 'authenticated household workflow succeeds');

reset role;

select is((select count(*)::integer from public.household_access ha join public.households h on h.id=ha.household_id where h.display_name='Controlled household' and ha.user_id='20000000-0000-4000-8000-000000000001' and ha.role='owner'), 1, 'workflow assigns exactly one owner');

with changed as (delete from public.household_members where household_id='20000000-0000-4000-8000-000000000101' and first_name='Added' returning 1) select is(count(*)::integer, 1, 'owner deletes own member') from changed;

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"a.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000002'::uuid, 'JWT subject matches fixture user');

with changed as (update public.household_members set first_name='Admin edit' where id='20000000-0000-4000-8000-000000000203' returning 1) select is(count(*)::integer, 1, 'household admin manages members') from changed;

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.household_members where household_id='20000000-0000-4000-8000-000000000101'), 4, 'ordinary member can read own household people');

with changed as (update public.household_members set first_name='Forbidden' where id='20000000-0000-4000-8000-000000000203' returning 1) select is(count(*)::integer, 0, 'ordinary member cannot update members') from changed;

with changed as (delete from public.household_members where id='20000000-0000-4000-8000-000000000203' returning 1) select is(count(*)::integer, 0, 'ordinary member cannot delete members') from changed;

select throws_ok($sql$insert into public.household_members(household_id,first_name,member_type) values ('20000000-0000-4000-8000-000000000101','Forbidden','adult')$sql$, '42501', null, 'ordinary member cannot insert members');

with changed as (update public.households set display_name='Forbidden' where id='20000000-0000-4000-8000-000000000101' returning 1) select is(count(*)::integer, 0, 'ordinary member cannot edit household') from changed;

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","email":"b.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000004'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.household_members where household_id='20000000-0000-4000-8000-000000000102'), 2, 'second household sees own members');

select is((select count(*)::integer from public.household_members where household_id='20000000-0000-4000-8000-000000000101'), 0, 'isolation works in both directions');

reset role;

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$select * from public.profiles$sql$, '42501', null, 'anonymous profile read denied');

select throws_ok($sql$select public.create_household('Anonymous')$sql$, '42501', null, 'anonymous household RPC denied');

reset role;

select ok(bool_and(relrowsecurity), 'every exposed application table has RLS enabled') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';

select set_config('request.jwt.claims', '{}', true); set local role authenticated;

select is(auth.uid(), null::uuid, 'authenticated role without subject has no identity');

select is((select count(*)::integer from public.profiles where true), 0, 'missing JWT subject cannot see profiles');

select throws_ok($sql$select public.create_household('Missing identity')$sql$, 'P0001', 'Authentication required', 'missing JWT subject cannot create household');

reset role;

select * from finish();

rollback;
