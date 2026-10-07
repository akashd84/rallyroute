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
update public.events set timezone='America/New_York',required_arrival_at='2027-03-13T09:00-05',ready_to_depart_at='2027-03-14T01:00-05' where id='20000000-0000-4000-8000-000000000610';
update public.events set timezone='America/New_York',required_arrival_at='2027-03-15T11:00-04',ready_to_depart_at='2027-03-16T01:00-04',is_exception=true where id='20000000-0000-4000-8000-000000000611';
insert into public.event_participation(event_id,member_id,status) values('20000000-0000-4000-8000-000000000611','20000000-0000-4000-8000-000000000201','going');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 612','20000000-0000-4000-8000-000000000501',null,'2099-01-03T17:00Z','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000613','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 613','20000000-0000-4000-8000-000000000501',now()-interval '2 days',now()-interval '1 day','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000614','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 614','20000000-0000-4000-8000-000000000501',now()-interval '1 hour',now()+interval '1 hour','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000615','20000000-0000-4000-8000-000000000301',null,'Excluded 615','20000000-0000-4000-8000-000000000501','2099-01-04T09:00Z','2099-01-04T17:00Z','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000616','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 616','20000000-0000-4000-8000-000000000501','2099-01-05T09:00Z','2099-01-05T17:00Z','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000617','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 617','20000000-0000-4000-8000-000000000501','2099-01-06T09:00Z','2099-01-06T17:00Z','cancelled','20000000-0000-4000-8000-000000000008');
insert into public.event_participation(event_id,member_id,status) values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000201','going'),('20000000-0000-4000-8000-000000000616','20000000-0000-4000-8000-000000000201','not_going');
create function pg_temp.ride_input(mode_value text default 'need_ride',direction text default 'to_event') returns jsonb language sql as $f$
 select jsonb_build_object('householdId','20000000-0000-4000-8000-000000000101','memberId','20000000-0000-4000-8000-000000000201','eventId',id,'revision',revision,'leg',direction,'mode',mode_value,'locationId','20000000-0000-4000-8000-000000000510','seats',2,'detour',15,
 'earliest',case when direction='to_event' then required_arrival_at-interval '10 minutes' else ready_to_depart_at end,
 'latest',case when direction='to_event' then required_arrival_at else ready_to_depart_at+interval '15 minutes' end)
 from public.events where id='20000000-0000-4000-8000-000000000610'
$f$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select is((public.series_ride_preferences(pg_temp.ride_input())->>'count')::int,2,'two Going occurrences including exception qualify');
select is((public.series_ride_preferences(pg_temp.ride_input())->>'skipped')::int,2,'missing leg and not going are skipped');
select set_config('rallyroute.ride_snapshot',public.series_ride_preferences(pg_temp.ride_input())->>'snapshot',true);
select is((public.series_ride_preferences(pg_temp.ride_input(),current_setting('rallyroute.ride_snapshot'))->>'count')::int,2,'Member bulk saves rides');
select is((select anchor_earliest_at from public.ride_participation where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201' and leg='to_event'),'2027-03-15T10:50-04'::timestamptz,'window follows edited anchor across DST');
select is((select count(*)::int from public.ride_participation where member_id='20000000-0000-4000-8000-000000000201' and event_id in ('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000613','20000000-0000-4000-8000-000000000614','20000000-0000-4000-8000-000000000615','20000000-0000-4000-8000-000000000616','20000000-0000-4000-8000-000000000617')),0,'skipped and excluded occurrences unchanged');
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input(),current_setting('rallyroute.ride_snapshot'))$q$,'40001',null,'changed ride preferences reject stale snapshot');
select is((public.series_ride_preferences(pg_temp.ride_input('can_drive'),public.series_ride_preferences(pg_temp.ride_input('can_drive'))->>'snapshot')->>'count')::int,2,'bulk supports can_drive');
select is((public.series_ride_preferences(pg_temp.ride_input('either'),public.series_ride_preferences(pg_temp.ride_input('either'))->>'snapshot')->>'count')::int,2,'bulk supports either');
select is((public.series_ride_preferences(pg_temp.ride_input('self_transport'),public.series_ride_preferences(pg_temp.ride_input('self_transport'))->>'snapshot')->>'count')::int,2,'bulk supports self_transport');
select is((public.series_ride_preferences(pg_temp.ride_input('none'),public.series_ride_preferences(pg_temp.ride_input('none'))->>'snapshot')->>'count')::int,2,'bulk supports none');
select is((select count(*)::int from public.ride_participation where member_id='20000000-0000-4000-8000-000000000201' and event_id in ('20000000-0000-4000-8000-000000000610','20000000-0000-4000-8000-000000000611') and household_location_id is null and anchor_earliest_at is null),2,'None clears active ride fields');
select is((public.series_ride_preferences(pg_temp.ride_input('need_ride','from_event'),public.series_ride_preferences(pg_temp.ride_input('need_ride','from_event'))->>'snapshot')->>'count')::int,3,'from event includes departure-only occurrence');
select is((select anchor_latest_at from public.ride_participation where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201' and leg='from_event'),'2027-03-16T01:15-04'::timestamptz,'overnight return window follows each departure');
reset role; set local role :"fixture_owner";
create function pg_temp.reject_second_ride() returns trigger language plpgsql as $$ begin raise exception 'Synthetic late failure' using errcode='22023'; end $$;
create trigger synthetic_bulk_failure before insert or update on public.ride_participation for each row when (new.event_id='20000000-0000-4000-8000-000000000611' and new.member_id='20000000-0000-4000-8000-000000000201' and new.mode='either') execute function pg_temp.reject_second_ride();
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input('either'),public.series_ride_preferences(pg_temp.ride_input('either'))->>'snapshot')$q$,'22023','Synthetic late failure','later occurrence failure rolls back entire batch');
select is((select mode from public.ride_participation where event_id='20000000-0000-4000-8000-000000000610' and member_id='20000000-0000-4000-8000-000000000201' and leg='to_event'),'none','earlier occurrence update rolled back');
reset role; set local role :"fixture_owner";
drop trigger synthetic_bulk_failure on public.ride_participation;
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input('can_drive') || jsonb_build_object('memberId','20000000-0000-4000-8000-000000000202'))$q$,'22023',null,'child cannot drive');
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input() || jsonb_build_object('locationId','20000000-0000-4000-8000-000000000511'))$q$,'42501',null,'unowned address denied');
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input() || jsonb_build_object('latest','2028-01-01Z'))$q$,'22023',null,'invalid window denied');
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input() || jsonb_build_object('memberId','20000000-0000-4000-8000-000000000205'))$q$,'42501',null,'other household participant denied');
select set_config('rallyroute.ride_snapshot',public.series_ride_preferences(pg_temp.ride_input())->>'snapshot',true);
reset role; set local role :"fixture_owner";
update public.event_participation set status='unknown' where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201';
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input(),current_setting('rallyroute.ride_snapshot'))$q$,'40001',null,'attendance changes reject confirmation');
select is((select status from public.event_participation where event_id='20000000-0000-4000-8000-000000000611' and member_id='20000000-0000-4000-8000-000000000201'),'unknown','ride bulk does not change attendance');
select set_config('rallyroute.ride_snapshot',public.series_ride_preferences(pg_temp.ride_input())->>'snapshot',true);
reset role; set local role :"fixture_owner";
update private.household_locations set revision=revision+1 where id='20000000-0000-4000-8000-000000000510';
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input(),current_setting('rallyroute.ride_snapshot'))$q$,'40001',null,'address edits reject confirmation');
reset role; set local role :"fixture_owner";
update public.events set required_arrival_at=now()-interval '1 hour',ready_to_depart_at=now()+interval '1 hour' where id='20000000-0000-4000-8000-000000000610';
update public.event_participation set status='unknown' where event_id='20000000-0000-4000-8000-000000000612' and member_id='20000000-0000-4000-8000-000000000201';
set local role authenticated;
select is((public.series_ride_preferences(pg_temp.ride_input('self_transport','from_event'))->>'count')::int,0,'ongoing source and non-Going future occurrences produce empty batch');
reset role; set local role :"fixture_owner";
update private.household_locations set archived_at=now() where id='20000000-0000-4000-8000-000000000510';
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(pg_temp.ride_input('need_ride','from_event'))$q$,'42501',null,'archived address denied');
reset role; set local role :"fixture_owner";
select set_config('rallyroute.ride_input',pg_temp.ride_input()::text,true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008"}',true);
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(current_setting('rallyroute.ride_input')::jsonb)$q$,'42501',null,'unrelated group administrator denied');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select throws_ok($q$select public.series_ride_preferences(current_setting('rallyroute.ride_input')::jsonb)$q$,'42501',null,'outsider denied');
reset role; set local role :"fixture_owner";
set local role anon;
select throws_ok($q$select public.series_ride_preferences('{}')$q$,'42501',null,'anonymous denied');
reset role; set local role :"fixture_owner";
select * from finish();
rollback;
