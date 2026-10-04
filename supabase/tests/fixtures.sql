-- Refuse collisions rather than mutate preexisting fixture identities on linked Dev.
do $$ begin
 if exists(select 1 from auth.users where id::text like '20000000-0000-4000-8000-%') then
  raise exception 'Test fixture namespace is already occupied; refusing to mutate existing identities';
 end if;
end $$;

-- Synthetic fixtures only: stable IDs, reserved example.test emails, no login credentials.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.owner@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 1"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.admin@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 2"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.member@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 3"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b.owner@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 4"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c.owner@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 5"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd.owner@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 6"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e.owner@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 7"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'group.admin@example.test', '2026-01-01T00:00:00Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"first_name":"Fixture 8"}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.households (id, display_name, created_at, updated_at) values
  ('20000000-0000-4000-8000-000000000101', 'Fixture Household A', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000102', 'Fixture Household B', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000103', 'Fixture Household C', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000104', 'Fixture Household D', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000105', 'Fixture Household E', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.household_access (household_id,user_id,role,created_at) values
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001', 'owner', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000002', 'admin', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000003', 'member', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-000000000004', 'owner', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-000000000005', 'owner', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-000000000006', 'owner', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000105', '20000000-0000-4000-8000-000000000007', 'owner', '2026-01-01Z')
on conflict (household_id,user_id) do nothing;

insert into public.household_members (id, household_id, first_name, member_type, linked_user_id, created_at, updated_at) values
  ('20000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000101', 'Participant 201', 'adult', '20000000-0000-4000-8000-000000000001', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000101', 'Participant 202', 'child', null, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000101', 'Participant 203', 'adult', null, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000102', 'Participant 204', 'adult', '20000000-0000-4000-8000-000000000004', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000205', '20000000-0000-4000-8000-000000000102', 'Participant 205', 'child', null, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000206', '20000000-0000-4000-8000-000000000103', 'Participant 206', 'adult', '20000000-0000-4000-8000-000000000005', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000207', '20000000-0000-4000-8000-000000000104', 'Participant 207', 'adult', '20000000-0000-4000-8000-000000000006', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000208', '20000000-0000-4000-8000-000000000105', 'Participant 208', 'adult', '20000000-0000-4000-8000-000000000007', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000209', '20000000-0000-4000-8000-000000000101', 'Participant 209', 'adult', null, '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.groups (id,name,group_type,created_by_user_id,created_at,updated_at) values ('20000000-0000-4000-8000-000000000301','Fixture Community','community','20000000-0000-4000-8000-000000000008','2026-01-01Z','2026-01-01Z') on conflict (id) do nothing;

insert into public.group_admins (group_id,user_id,role,created_at) values ('20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000008','owner','2026-01-01Z') on conflict (group_id,user_id) do nothing;

insert into public.group_memberships (id,group_id,household_id,status,joined_at,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000101', 'active', '2026-01-01Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000102', 'active', '2026-01-01Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000403', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000104', 'left', '2026-01-01Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000404', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000105', 'removed', '2026-01-01Z', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.event_locations (id,group_id,name,address_line_1,location,created_by_user_id,created_at,updated_at) values ('20000000-0000-4000-8000-000000000501','20000000-0000-4000-8000-000000000301','Fictional Community Hall','Synthetic destination',extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),'20000000-0000-4000-8000-000000000008','2026-01-01Z','2026-01-01Z') on conflict (id) do nothing;

insert into private.household_locations (id,household_id,label,address_line_1,location,is_primary,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000510', '20000000-0000-4000-8000-000000000101', 'Fixture pickup', 'Synthetic pickup', extensions.st_geogfromtext('SRID=4326;POINT(0.1 0)'), true, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000511', '20000000-0000-4000-8000-000000000102', 'Fixture pickup', 'Synthetic pickup', extensions.st_geogfromtext('SRID=4326;POINT(0.2 0)'), true, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000512', '20000000-0000-4000-8000-000000000103', 'Fixture pickup', 'Synthetic pickup', extensions.st_geogfromtext('SRID=4326;POINT(0.3 0)'), true, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000513', '20000000-0000-4000-8000-000000000104', 'Fixture pickup', 'Synthetic pickup', extensions.st_geogfromtext('SRID=4326;POINT(0.4 0)'), true, '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000514', '20000000-0000-4000-8000-000000000105', 'Fixture pickup', 'Synthetic pickup', extensions.st_geogfromtext('SRID=4326;POINT(0.5 0)'), true, '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.event_series (id,group_id,name,location_id,timezone,recurrence_rule,series_start_date,default_required_arrival_time,default_ready_to_depart_time,created_by_user_id,created_at,updated_at) values ('20000000-0000-4000-8000-000000000601','20000000-0000-4000-8000-000000000301','Fixture weekly event','20000000-0000-4000-8000-000000000501','Etc/UTC','FREQ=WEEKLY;BYDAY=MO','2099-01-01','09:00','17:00','20000000-0000-4000-8000-000000000008','2026-01-01Z','2026-01-01Z') on conflict (id) do nothing;

insert into public.events (id,group_id,event_series_id,name,location_id,required_arrival_at,ready_to_depart_at,created_by_user_id,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000601', 'Fixture occurrence 0', '20000000-0000-4000-8000-000000000501', '2099-01-01T09:00:00Z', '2099-01-01T17:00:00Z', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000611', '20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000601', 'Fixture occurrence 1', '20000000-0000-4000-8000-000000000501', '2099-01-02T09:00:00Z', '2099-01-02T17:00:00Z', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.event_participation (id,event_id,member_id,status,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000700', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000201', 'going', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000701', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000202', 'going', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000702', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000203', 'going', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000703', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000204', 'going', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000704', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000205', 'going', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.ride_participation (id,event_id,member_id,household_location_id,leg,mode,available_seats,max_detour_minutes,anchor_earliest_at,anchor_latest_at,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000800', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000510', 'to_event', 'can_drive', 3, 15, '2099-01-01T08:50:00Z', '2099-01-01T09:10:00Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000510', 'to_event', 'need_ride', null, null, '2099-01-01T08:50:00Z', '2099-01-01T09:10:00Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000802', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000511', 'to_event', 'can_drive', 2, 10, '2099-01-01T08:50:00Z', '2099-01-01T09:10:00Z', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-000000000610', '20000000-0000-4000-8000-000000000205', '20000000-0000-4000-8000-000000000511', 'to_event', 'need_ride', null, null, '2099-01-01T08:50:00Z', '2099-01-01T09:10:00Z', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;

insert into public.group_invitations (id,group_id,invite_type,status,max_uses,use_count,expires_at,invited_email,token_hash,created_by_user_id,created_at,updated_at) values
  ('20000000-0000-4000-8000-000000000901', '20000000-0000-4000-8000-000000000301', 'direct', 'active', 1, 0, '2099-12-31Z', 'c.owner@example.test', 'b16d3bd1ad44baaac304703189b537d40433f6ad383896bc043579f74b1d0770', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000902', '20000000-0000-4000-8000-000000000301', 'group_link', 'active', 2, 0, '2099-12-31Z', null, '4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000903', '20000000-0000-4000-8000-000000000301', 'group_link', 'active', null, 0, '2000-01-01Z', null, '307aa056f7977b04a1e340ec4f1e1c045e2104d434cb07fe11c98a87e9b248f9', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000904', '20000000-0000-4000-8000-000000000301', 'group_link', 'revoked', null, 0, '2099-12-31Z', null, '9af9f7ed6a9d0781f84df42a59f0636496d8c43af0a235dd136ab9959deba789', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000905', '20000000-0000-4000-8000-000000000301', 'group_link', 'exhausted', 1, 1, '2099-12-31Z', null, '2e52161859e5997a1cd1e1d39f04c0bbe90b60bb17f5bf6b7957c202e275c867', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000906', '20000000-0000-4000-8000-000000000301', 'group_link', 'active', null, 0, '2099-12-31Z', null, '22972ad2508f46f01a050f8f458eda664cd40fb13b9d40e538c19b53b066d0cd', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z'),
  ('20000000-0000-4000-8000-000000000907', '20000000-0000-4000-8000-000000000301', 'group_link', 'active', 1, 1, '2099-12-31Z', null, '7c3efb5ed558bd7e0c4175cdd7f586d3c440c1dfd1f98ca9c055aca5c6819f97', '20000000-0000-4000-8000-000000000008', '2026-01-01Z', '2026-01-01Z')
on conflict (id) do nothing;
