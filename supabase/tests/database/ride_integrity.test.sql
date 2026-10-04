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

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at,available_seats,max_detour_minutes) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','can_drive','2099-01-01T16:50Z','2099-01-01T17:10Z',2,10)$sql$, '42501', null, 'Direct mutation denied: owner can configure a ride using private owned location');

select throws_ok($direct$update public.ride_participation set max_detour_minutes=12 where member_id='20000000-0000-4000-8000-000000000201'$direct$, '42501', null, 'Direct lifecycle mutation denied');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000511','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: other household location denied');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000511','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: other household member denied before privileged checks');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000209','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: missing attendance denied');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at,available_seats,max_detour_minutes) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000510','from_event','can_drive','2099-01-01T16:50Z','2099-01-01T17:10Z',2,10)$sql$, '42501', null, 'Direct mutation denied: child cannot offer to drive');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: child may request a ride');

select throws_ok($direct$delete from public.ride_participation where member_id='20000000-0000-4000-8000-000000000202' and leg='from_event'$direct$, '42501', null, 'Direct lifecycle mutation denied');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"a.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000002'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: household admin can configure own non-account adult ride');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.event_participation(event_id,member_id,status) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000201','going')$sql$, '42501', null, 'Direct mutation denied: Member can mark attendance before configuring rides');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: ordinary member can configure household rides');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000207','20000000-0000-4000-8000-000000000513','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: left membership cannot configure ride');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","email":"e.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000007'::uuid, 'JWT subject matches fixture user');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000208','20000000-0000-4000-8000-000000000514','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: removed membership cannot configure ride');

reset role; set local role :"fixture_owner";

select is((select count(*)::integer from public.ride_participation where member_id in ('20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000205')), 2, 'foreign rides remained unchanged');

reset role; set local role :"fixture_owner"; select set_config('request.jwt.claims', '{}', true); set local role authenticated;

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: missing identity cannot invoke privileged ride validation');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,anchor_earliest_at,anchor_latest_at) values ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000510','from_event','need_ride','2099-01-01T16:50Z','2099-01-01T17:10Z')$sql$, '42501', null, 'Direct mutation denied: anonymous ride insert denied');

reset role; set local role :"fixture_owner";

select * from finish();

rollback;
