begin;
-- Supabase's temporary CLI login can assume postgres for fixture setup.
-- Authorization assertions below always switch back to anon/authenticated.
\if :{?fixture_owner}
\else
select current_user as fixture_owner \gset
\endif
set local role :"fixture_owner";

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;


\ir ../fixtures.sql

select no_plan();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.groups where id='20000000-0000-4000-8000-000000000301'), 1, 'group participant sees groups');

select is((select count(*)::integer from public.events where id='20000000-0000-4000-8000-000000000610'), 1, 'group participant sees events');

select is((select count(*)::integer from public.event_series where id='20000000-0000-4000-8000-000000000601'), 1, 'group participant sees event_series');

select is((select count(*)::integer from public.event_locations where id='20000000-0000-4000-8000-000000000501'), 1, 'group participant sees event_locations');

select is((select count(*)::integer from public.event_participation where member_id='20000000-0000-4000-8000-000000000201'), 1, 'own event_participation visible');

select is((select count(*)::integer from public.event_participation where member_id='20000000-0000-4000-8000-000000000204'), 0, 'other household event_participation hidden');

with changed as (update public.event_participation set status='not_going' where member_id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign event_participation update denied') from changed;

with changed as (delete from public.event_participation where member_id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign event_participation delete denied') from changed;

select is((select count(*)::integer from public.ride_participation where member_id='20000000-0000-4000-8000-000000000201'), 1, 'own ride_participation visible');

select is((select count(*)::integer from public.ride_participation where member_id='20000000-0000-4000-8000-000000000204'), 0, 'other household ride_participation hidden');

with changed as (update public.ride_participation set mode='none' where member_id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign ride_participation update denied') from changed;

with changed as (delete from public.ride_participation where member_id='20000000-0000-4000-8000-000000000204' returning 1) select is(count(*)::integer, 0, 'foreign ride_participation delete denied') from changed;

select throws_ok($sql$select * from private.household_locations$sql$, '42501', null, 'exact locations not directly readable');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","email":"b.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000004'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.groups where id='20000000-0000-4000-8000-000000000301'), 1, 'group participant sees groups');

select is((select count(*)::integer from public.events where id='20000000-0000-4000-8000-000000000610'), 1, 'group participant sees events');

select is((select count(*)::integer from public.event_series where id='20000000-0000-4000-8000-000000000601'), 1, 'group participant sees event_series');

select is((select count(*)::integer from public.event_locations where id='20000000-0000-4000-8000-000000000501'), 1, 'group participant sees event_locations');

select is((select count(*)::integer from public.event_participation where member_id='20000000-0000-4000-8000-000000000204'), 1, 'own event_participation visible');

select is((select count(*)::integer from public.event_participation where member_id='20000000-0000-4000-8000-000000000201'), 0, 'other household event_participation hidden');

with changed as (update public.event_participation set status='not_going' where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 0, 'foreign event_participation update denied') from changed;

with changed as (delete from public.event_participation where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 0, 'foreign event_participation delete denied') from changed;

select is((select count(*)::integer from public.ride_participation where member_id='20000000-0000-4000-8000-000000000204'), 1, 'own ride_participation visible');

select is((select count(*)::integer from public.ride_participation where member_id='20000000-0000-4000-8000-000000000201'), 0, 'other household ride_participation hidden');

with changed as (update public.ride_participation set mode='none' where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 0, 'foreign ride_participation update denied') from changed;

with changed as (delete from public.ride_participation where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 0, 'foreign ride_participation delete denied') from changed;

select throws_ok($sql$select * from private.household_locations$sql$, '42501', null, 'exact locations not directly readable');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select lives_ok($sql$insert into public.event_participation(event_id,member_id,status) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000201','going')$sql$, 'owner adds own attendance');

with changed as (update public.event_participation set status='going' where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 1, 'owner updates own attendance') from changed;

with changed as (delete from public.event_participation where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 1, 'owner deletes own attendance') from changed;

select throws_ok($sql$insert into public.event_participation(event_id,member_id,status) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000204','going')$sql$, 'P0001', null, 'foreign attendance cannot be inserted');

with changed as (update public.groups set name='Forbidden' where id='20000000-0000-4000-8000-000000000301' returning 1) select is(count(*)::integer, 0, 'household owner is not group admin') from changed;

select throws_ok($sql$insert into public.group_memberships(group_id,household_id) values ('20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000103')$sql$, '42501', null, 'memberships cannot be inserted directly');

select throws_ok($sql$select public.create_group_invitation('20000000-0000-4000-8000-000000000301','group_link','dc29af3dd716bc807c84e4e40837654c3d3eb79d53cd705a5d678288070c160d')$sql$, 'P0001', 'Group administrator access required', 'normal group member cannot create invitations');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

with changed as (update public.event_participation set status='going' where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 1, 'ordinary member can edit attendance') from changed;

with changed as (update public.ride_participation set max_detour_minutes=20 where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 1, 'ordinary member can edit ride preferences') from changed;

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.groups where id='20000000-0000-4000-8000-000000000301'), 0, 'outsider cannot discover groups');

select is((select count(*)::integer from public.events where id='20000000-0000-4000-8000-000000000610'), 0, 'outsider cannot discover events');

select is((select count(*)::integer from public.event_series where id='20000000-0000-4000-8000-000000000601'), 0, 'outsider cannot discover event_series');

select is((select count(*)::integer from public.event_locations where id='20000000-0000-4000-8000-000000000501'), 0, 'outsider cannot discover event_locations');

select throws_ok($sql$insert into public.event_participation(event_id,member_id,status) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000206','going')$sql$, 'P0001', null, 'outsider cannot attend group event');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated","email":"group.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000008'::uuid, 'JWT subject matches fixture user');

with changed as (update public.groups set name='Admin edit' where id='20000000-0000-4000-8000-000000000301' returning 1) select is(count(*)::integer, 1, 'group administrator can edit group') from changed;

select lives_ok($sql$insert into public.event_locations(group_id,name,created_by_user_id) values ('20000000-0000-4000-8000-000000000301','Admin destination','20000000-0000-4000-8000-000000000008')$sql$, 'group administrator creates destination');

select is((select count(*)::integer from public.household_members where household_id='20000000-0000-4000-8000-000000000101'), 0, 'group admin has no household access');

select is((select count(*)::integer from public.ride_participation where event_id='20000000-0000-4000-8000-000000000610'), 0, 'group admin cannot see raw rides');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$select * from private.household_locations$sql$, '42501', null, 'anonymous cannot query locations');

select throws_ok($sql$select * from public.groups$sql$, '42501', null, 'anonymous cannot discover groups');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$select * from public.households$sql$, '42501', null, 'anonymous cannot read households');

select throws_ok($sql$select * from public.household_members$sql$, '42501', null, 'anonymous cannot read household_members');

select throws_ok($sql$select * from public.event_participation$sql$, '42501', null, 'anonymous cannot read event_participation');

select throws_ok($sql$select * from public.ride_participation$sql$, '42501', null, 'anonymous cannot read ride_participation');

select throws_ok($sql$select * from public.group_invitations$sql$, '42501', null, 'anonymous cannot read group_invitations');

reset role; set local role :"fixture_owner";

select * from finish();

rollback;
