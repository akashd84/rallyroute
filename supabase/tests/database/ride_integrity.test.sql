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

select lives_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at,available_seats,max_detour_minutes) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','can_drive','2099-01-01T16:50Z','2099-01-01T17:10Z',2,10)$sql$, 'owner can configure a ride using private owned location');

with changed as (update public.ride_participation set max_detour_minutes=12 where member_id='20000000-0000-4000-8000-000000000201' returning 1) select is(count(*)::integer, 2, 'owner can update rides through validation trigger') from changed;

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000511','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'P0001', 'Ride location must belong to the member household', 'other household location denied');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000511','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'other household member denied before privileged checks');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000209','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'P0001', 'Member must be attending the event before configuring transportation', 'missing attendance denied');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at,available_seats,max_detour_minutes) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000510','from_event','can_drive','2099-01-01T16:50Z','2099-01-01T17:10Z',2,10)$sql$, 'P0001', 'Only adult household members can offer to drive', 'child cannot offer to drive');

select lives_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'child may request a ride');

with changed as (delete from public.ride_participation where member_id='20000000-0000-4000-8000-000000000202' and leg='from_event' returning 1) select is(count(*)::integer, 1, 'owner deletes own ride') from changed;

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"a.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000002'::uuid, 'JWT subject matches fixture user');

select lives_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'household admin can configure own non-account adult ride');

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'ordinary member cannot configure rides');

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000207','20000000-0000-4000-8000-000000000513','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'P0001', 'Household must be an active member of the event group', 'left membership cannot configure ride');

reset role;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","email":"e.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000007'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000208','20000000-0000-4000-8000-000000000514','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, 'P0001', 'Household must be an active member of the event group', 'removed membership cannot configure ride');

reset role;

select is((select count(*)::integer from public.ride_participation where member_id in ('20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000205')), 2, 'foreign rides remained unchanged');

reset role; select set_config('request.jwt.claims', '{}', true); set local role authenticated;

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'missing identity cannot invoke privileged ride validation');

reset role;

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'anonymous ride insert denied');

reset role;

select * from finish();

rollback;
