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
update public.events set is_exception=true where id='20000000-0000-4000-8000-000000000611';
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 612','20000000-0000-4000-8000-000000000501','2099-01-03Z','2099-01-03T17:00Z','cancelled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000613','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 613','20000000-0000-4000-8000-000000000501',now()-interval '2 days',now()-interval '1 day','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000614','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000601','Excluded 614','20000000-0000-4000-8000-000000000501',now()-interval '1 hour',now()+interval '1 hour','scheduled','20000000-0000-4000-8000-000000000008');
insert into public.events(id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,status,created_by_user_id) values('20000000-0000-4000-8000-000000000615','20000000-0000-4000-8000-000000000301',null,'Excluded 615','20000000-0000-4000-8000-000000000501','2099-01-04Z','2099-01-04T17:00Z','scheduled','20000000-0000-4000-8000-000000000008');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select is((public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)->>'count')::int,2,'Member previews upcoming occurrences including exceptions');
select set_config('rallyroute.attendance_snapshot',(public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)->'snapshot')::text,true);
select is((public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','not_going',current_setting('rallyroute.attendance_snapshot')::jsonb)->>'count')::int,2,'bulk replaces attendance');
select is((select count(*)::int from public.event_participation where member_id='20000000-0000-4000-8000-000000000202' and status='not_going'),2,'both occurrences changed');
select is((select count(*)::int from public.event_participation where member_id='20000000-0000-4000-8000-000000000202' and event_id in ('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000613','20000000-0000-4000-8000-000000000614','20000000-0000-4000-8000-000000000615')),0,'excluded events untouched');
select ok((select disabled_at is not null and needs_reconfirmation from public.ride_participation where id='20000000-0000-4000-8000-000000000801'),'not going disables rides');
select is((public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',current_setting('rallyroute.attendance_snapshot')::jsonb)->>'count')::int,2,'bulk accepts going');
select is((public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','unknown',current_setting('rallyroute.attendance_snapshot')::jsonb)->>'count')::int,2,'bulk accepts unknown');
select ok((select disabled_at is not null from public.ride_participation where id='20000000-0000-4000-8000-000000000801'),'going does not restore rides');
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000205','20000000-0000-4000-8000-000000000610','going',null)$q$,'42501',null,'other household participant denied');
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000615','going',null)$q$,'42501',null,'one-off source denied');
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','bad',null)$q$,'22023',null,'invalid status denied');
reset role; set local role :"fixture_owner";
update public.events set revision=revision+1 where id='20000000-0000-4000-8000-000000000611';
set local role authenticated;
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',current_setting('rallyroute.attendance_snapshot')::jsonb)$q$,'40001',null,'edited event rejects stale confirmation');
select is((select count(*)::int from public.event_participation where member_id='20000000-0000-4000-8000-000000000202' and status='unknown'),2,'stale save changes nothing');
select set_config('rallyroute.attendance_snapshot',(public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)->'snapshot')::text,true);
reset role; set local role :"fixture_owner";
update public.events set status='cancelled' where id='20000000-0000-4000-8000-000000000611';
set local role authenticated;
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',current_setting('rallyroute.attendance_snapshot')::jsonb)$q$,'40001',null,'cancelled event rejects stale target set');
reset role; set local role :"fixture_owner";
update public.events set status='cancelled' where id='20000000-0000-4000-8000-000000000610';
set local role authenticated;
select is((public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going','[]'::jsonb)->>'count')::int,0,'empty series is harmless');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008"}',true);
set local role authenticated;
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)$q$,'42501',null,'group admin without household access denied');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)$q$,'42501',null,'outsider denied');
reset role; set local role :"fixture_owner";
set local role anon;
select throws_ok($q$select public.series_attendance('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000610','going',null)$q$,'42501',null,'anonymous denied');
reset role; set local role :"fixture_owner";
select * from finish();
rollback;
