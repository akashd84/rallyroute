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
select set_config('rallyroute.slug_prefix','slugtest-' || replace(gen_random_uuid()::text,'-',''),true);
select is((select count(*)::int from information_schema.columns where table_schema='public' and table_name='groups' and column_name='slug'),1,'groups have URL slugs');
select is((select is_nullable::text from information_schema.columns where table_schema='public' and table_name='groups' and column_name='slug'),'NO','every group requires a slug');
select ok(exists(select 1 from pg_constraint where conrelid='public.groups'::regclass and conname='groups_slug_key' and contype='u'),'slugs are globally unique');
select is(private.allocate_group_slug(current_setting('rallyroute.slug_prefix') || '  SCHOOL !!! Team  '), current_setting('rallyroute.slug_prefix') || '-school-team','ASCII case, punctuation and whitespace normalize');
select ok(private.allocate_group_slug('') ~ '^group(-[0-9a-f]{8})?$', 'empty normalized name has fallback');
select ok(private.allocate_group_slug('学校') ~ '^group(-[0-9a-f]{8})?$', 'non-ASCII-only name has fallback');
select ok(private.allocate_group_slug('NEW') ~ '^group-new(-[0-9a-f]{8})?$', 'creation route is reserved');
select ok(private.allocate_group_slug('20000000-0000-4000-8000-000000000301') ~ '^group-20000000-0000-4000-8000-000000000301(-[0-9a-f]{8})?$', 'UUID-like names cannot create UUID URLs');
select is(length(private.allocate_group_slug(current_setting('rallyroute.slug_prefix') || repeat('x',100))),80,'long slugs are truncated');
insert into public.groups(name,group_type) values(current_setting('rallyroute.slug_prefix') || '-duplicate','club');
select is((select slug from public.groups where name=current_setting('rallyroute.slug_prefix') || '-duplicate'),current_setting('rallyroute.slug_prefix') || '-duplicate','first group receives plain name');
insert into public.groups(name,group_type) values(current_setting('rallyroute.slug_prefix') || '-duplicate','club');
select is((select count(distinct slug)::int from public.groups where name=current_setting('rallyroute.slug_prefix') || '-duplicate'),2,'duplicates have distinct slugs');
select is((select count(*)::int from public.groups where name=current_setting('rallyroute.slug_prefix') || '-duplicate' and slug ~ '-[0-9a-f]{8}$'),1,'duplicate receives eight-character random suffix');
insert into public.groups(name,group_type) values(current_setting('rallyroute.slug_prefix') || repeat('x',59),'club'),(current_setting('rallyroute.slug_prefix') || repeat('x',59),'club');
select is((select max(length(slug)) from public.groups where name=current_setting('rallyroute.slug_prefix') || repeat('x',59)),80,'collision suffix stays within 80 characters');
select set_config('rallyroute.slug_group', (select id::text from public.groups where slug=current_setting('rallyroute.slug_prefix') || '-duplicate'),true);
select throws_ok($q$update public.groups set slug='changed-slug' where id=current_setting('rallyroute.slug_group')::uuid$q$,'22023',null,'database prevents privileged slug edits');
update public.groups set name='Renamed test group' where id=current_setting('rallyroute.slug_group')::uuid;
select is((select slug from public.groups where id=current_setting('rallyroute.slug_group')::uuid), current_setting('rallyroute.slug_prefix') || '-duplicate','rename preserves slug');
select is((select count(*)::int from public.groups where slug is null or length(slug)>80 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or slug='new' or slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),0,'all existing and new groups satisfy slug contract');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','authorization checks use ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'fixture user identity verified');
select set_config('rallyroute.slug_created', public.create_group_once('20000000-0000-4000-8000-000000000101',current_setting('rallyroute.slug_prefix') || '-created','club','20000000-0000-4000-8000-000000000989')::text,true);
select is(public.create_group_once('20000000-0000-4000-8000-000000000101','Different retry name','club','20000000-0000-4000-8000-000000000989')::text,current_setting('rallyroute.slug_created'),'idempotent requests preserve UUID');
select is((select slug from public.groups where id=current_setting('rallyroute.slug_created')::uuid),current_setting('rallyroute.slug_prefix') || '-created','idempotent requests preserve initial slug');
select throws_ok($q$update public.groups set slug='forbidden' where id=current_setting('rallyroute.slug_created')::uuid$q$,'42501',null,'Group Owner lacks slug update grant');
select lives_ok($q$update public.groups set name='Owner renamed group' where id=current_setting('rallyroute.slug_created')::uuid$q$,'Owner can still rename');
select is((select slug from public.groups where id=current_setting('rallyroute.slug_created')::uuid),current_setting('rallyroute.slug_prefix') || '-created','authorized rename preserves slug');
select throws_ok($q$select private.allocate_group_slug('probe')$q$,'42501',null,'ordinary users cannot probe global slug availability');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','outsider checks use ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000005'::uuid,'outsider identity verified');
select is((select count(*)::int from public.groups where slug=current_setting('rallyroute.slug_prefix') || '-created'),0,'outsider cannot discover a group by slug');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
