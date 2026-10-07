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
select set_config('rallyroute.event_group','20000000-0000-4000-8000-000000000301',true);
select set_config('rallyroute.event_prefix','eventtest-' || replace(gen_random_uuid()::text,'-',''),true);
select is((select is_nullable::text from information_schema.columns where table_schema='public' and table_name='events' and column_name='slug'),'NO','event slug is required');
select ok(exists(select 1 from pg_constraint where conrelid='public.events'::regclass and conname='events_group_slug_key' and contype='u'),'event slug uniqueness is enforced');
select is(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,'  School !!! TRIP '),'school-trip','normalizes ASCII case and punctuation');
select is(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,''),'event','empty name uses fallback');
select is(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,'学校'),'event','non-ASCII name uses fallback');
select is(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,'settings'),'event-settings','reserved route prefixed');
select is(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,'20000000-0000-4000-8000-000000000610'),'event-20000000-0000-4000-8000-000000000610','UUID-shaped name prefixed');
select is(length(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,repeat('x',100))),80,'slugs bounded at 80');
insert into public.events(group_id,name,required_arrival_at) values
(current_setting('rallyroute.event_group')::uuid,current_setting('rallyroute.event_prefix'),'2099-01-01T09:00Z'),
(current_setting('rallyroute.event_group')::uuid,current_setting('rallyroute.event_prefix'),'2099-01-02T09:00Z');
select is((select count(distinct slug)::int from public.events where name=current_setting('rallyroute.event_prefix')),2,'duplicate events have unique slugs');
select is((select count(*)::int from public.events where name=current_setting('rallyroute.event_prefix') and slug=current_setting('rallyroute.event_prefix')),1,'first duplicate has plain slug');
select is((select count(*)::int from public.events where name=current_setting('rallyroute.event_prefix') and slug ~ '-[0-9a-f]{8}$'),1,'collision has eight hexadecimal characters');
insert into public.groups(id,name,group_type) values ('20000000-0000-4000-8000-000000000399','Event slug other group','club');
insert into public.events(group_id,name,required_arrival_at) values ('20000000-0000-4000-8000-000000000399',current_setting('rallyroute.event_prefix'),'2099-01-01T09:00Z');
select is((select slug from public.events where group_id='20000000-0000-4000-8000-000000000399'),current_setting('rallyroute.event_prefix'),'same slug allowed in another group');
select throws_ok($q$update public.events set slug='changed' where id='20000000-0000-4000-8000-000000000610'$q$,'22023',null,'even privileged slug changes denied');
select set_config('rallyroute.original_slug',(select slug from public.events where id='20000000-0000-4000-8000-000000000610'),true);
update public.events set name='Renamed occurrence',required_arrival_at='2099-01-01T10:00Z',status='cancelled' where id='20000000-0000-4000-8000-000000000610';
select is((select slug from public.events where id='20000000-0000-4000-8000-000000000610'),current_setting('rallyroute.original_slug'),'renaming rescheduling cancellation preserve slug');
select is((select count(*)::int from public.events where slug is null or length(slug)>80 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or slug in ('events','members','settings','invite','share','new') or slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),0,'all backfilled and new events have valid slugs');
insert into public.events(group_id,name,required_arrival_at) values
(current_setting('rallyroute.event_group')::uuid,repeat('x',100),'2099-01-01T09:00Z'),
(current_setting('rallyroute.event_group')::uuid,repeat('x',100),'2099-01-02T09:00Z');
select is((select max(length(slug)) from public.events where group_id=current_setting('rallyroute.event_group')::uuid and name=repeat('x',100)),80,'collision suffix respects maximum length');
select ok((select bool_and(private.allocate_event_slug(current_setting('rallyroute.event_group')::uuid,value)='event-' || value) from unnest(array['events','members','settings','invite','share','new']) value),'all route names reserved');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008"}',true);
set local role authenticated;
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'group owner identity verified');
select throws_ok($q$update public.events set slug='forbidden' where id='20000000-0000-4000-8000-000000000611'$q$,'42501',null,'owner lacks slug update grant');
select throws_ok($q$select private.allocate_event_slug('20000000-0000-4000-8000-000000000301','probe')$q$,'42501',null,'allocator is private');
select set_config('rallyroute.event_payload',jsonb_build_object('groupId',current_setting('rallyroute.event_group'),'requestId','20000000-0000-4000-8000-000000000989','name',current_setting('rallyroute.event_prefix') || '-rpc','locationId','20000000-0000-4000-8000-000000000501','timezone','UTC','arrival','2099-01-01T09:00Z')::text,true);
select set_config('rallyroute.event_created',public.event_workflow('event-save',current_setting('rallyroute.event_payload')::jsonb)::text,true);
select is(public.event_workflow('event-save',current_setting('rallyroute.event_payload')::jsonb)::text,current_setting('rallyroute.event_created'),'repeated creation keeps UUID');
select is((select slug from public.events where id=current_setting('rallyroute.event_created')::uuid),current_setting('rallyroute.event_prefix') || '-rpc','repeated creation keeps slug');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select is(auth.uid(),'20000000-0000-4000-8000-000000000005'::uuid,'outsider identity verified');
select is((select count(*)::int from public.events where slug=current_setting('rallyroute.event_prefix') || '-rpc'),0,'unauthorized slug reads denied');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
