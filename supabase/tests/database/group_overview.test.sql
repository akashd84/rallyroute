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
-- Move one occurrence into the live window before refreshing its preferences.
update public.events set required_arrival_at=now()+interval '1 day',ready_to_depart_at=now()+interval '1 day 8 hours' where id='20000000-0000-4000-8000-000000000610';
update public.ride_participation set disabled_at=null,needs_reconfirmation=false,anchor_earliest_at=now()+interval '23 hours 50 minutes',anchor_latest_at=now()+interval '1 day 10 minutes' where event_id='20000000-0000-4000-8000-000000000610';
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select is((select group_members from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'counts all active households');
select is((select needs_rides from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'includes ride needs from another household');
select is((select drivers_available from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'includes other household driver offers');
select is((select carpools from public.get_group_overview('20000000-0000-4000-8000-000000000301')),0::bigint,'no confirmed rides means zero');
select is((select count(*)::int from public.ride_participation where member_id='20000000-0000-4000-8000-000000000204'),0,'raw preferences stay private');
select throws_ok($q$select * from public.get_group_overview('00000000-0000-4000-8000-000000000000')$q$,'42501','Group unavailable','unknown group denied');
reset role; set local role :"fixture_owner";
insert into public.household_connections(id,requester_household_id,recipient_household_id,group_id,event_id,status)
values('20000000-0000-4000-8000-000000001000','20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000610','accepted');
insert into public.carpools(id,connection_id,group_id,requester_household_id,recipient_household_id,request_id,status)
values('20000000-0000-4000-8000-000000001001','20000000-0000-4000-8000-000000001000','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000102',gen_random_uuid(),'accepted');
insert into private.carpool_rides(id,carpool_id,event_id,leg,request_id,driver_member_id,driver_household_id,available_seats,anchor_at,event_revision,status)
select '20000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000001001',id,'to_event',gen_random_uuid(),'20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000101',3,required_arrival_at,revision,'confirmed'
from public.events where id='20000000-0000-4000-8000-000000000610';
insert into private.carpool_participants(ride_id,member_id,household_id,display_name,role) values
('20000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000101','Fixture driver','driver'),
('20000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000000205','20000000-0000-4000-8000-000000000102','Fixture rider','rider');
insert into private.carpool_assignments(ride_id,event_id,member_id,leg)
select ride_id,'20000000-0000-4000-8000-000000000610',member_id,'to_event' from private.carpool_participants where ride_id='20000000-0000-4000-8000-000000001002';
set local role authenticated;
select is((select carpools from public.get_group_overview('20000000-0000-4000-8000-000000000301')),1::bigint,'counts a confirmed ride once, independent of participant count');
select is((select needs_rides from public.get_group_overview('20000000-0000-4000-8000-000000000301')),1::bigint,'fulfilled ride request excluded');
select is((select drivers_available from public.get_group_overview('20000000-0000-4000-8000-000000000301')),1::bigint,'assigned driver offer excluded');
reset role; set local role :"fixture_owner";
update private.carpool_rides set status='needs_review' where id='20000000-0000-4000-8000-000000001002';
set local role authenticated;
select is((select carpools from public.get_group_overview('20000000-0000-4000-8000-000000000301')),0::bigint,'ride needing review excluded');
select is((select needs_rides from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'unconfirmed assignment no longer fulfills request');
reset role; set local role :"fixture_owner";
update public.ride_participation set needs_reconfirmation=true where id='20000000-0000-4000-8000-000000000801';
update public.ride_participation set mode='either' where id='20000000-0000-4000-8000-000000000802';
set local role authenticated;
select is((select needs_rides from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'either counts as request, stale preference excluded');
select is((select drivers_available from public.get_group_overview('20000000-0000-4000-8000-000000000301')),2::bigint,'either counts as driver offer');
reset role; set local role :"fixture_owner";
update public.events set required_arrival_at=now()+interval '8 days',ready_to_depart_at=now()+interval '8 days 8 hours' where id='20000000-0000-4000-8000-000000000610';
set local role authenticated;
select is((select needs_rides+drivers_available from public.get_group_overview('20000000-0000-4000-8000-000000000301')),0::bigint,'outside seven days excluded');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008"}',true);
set local role authenticated;
select lives_ok($q$select * from public.get_group_overview('20000000-0000-4000-8000-000000000301')$q$,'independent group administrator authorized');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select throws_ok($q$select * from public.get_group_overview('20000000-0000-4000-8000-000000000301')$q$,'42501','Group unavailable','outsider denied');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000006"}',true);
set local role authenticated;
select throws_ok($q$select * from public.get_group_overview('20000000-0000-4000-8000-000000000301')$q$,'42501','Group unavailable','former member denied');
reset role; set local role anon;
select throws_ok($q$select * from public.get_group_overview('20000000-0000-4000-8000-000000000301')$q$,'42501',null,'anonymous denied');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
