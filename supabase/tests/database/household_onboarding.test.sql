begin;
-- Supabase's temporary CLI login can assume postgres for fixture setup.
-- Authorization assertions below always switch back to anon/authenticated.
\if :{?fixture_owner}
\else
select current_user as fixture_owner \gset
\endif
set local role :"fixture_owner";
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
\ir ../fixtures.sql
-- Past records must survive departure without becoming disabled.
insert into public.events(id,group_id,name,required_arrival_at,ready_to_depart_at,created_by_user_id)
values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000301','Historical event','2020-01-01Z','2020-01-01T17:00Z','20000000-0000-4000-8000-000000000008');
insert into public.event_participation(event_id,member_id,status)
values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000204','going');
insert into public.ride_participation(event_id,member_id,household_location_id,leg,mode,available_seats,max_detour_minutes,anchor_earliest_at,anchor_latest_at)
values('20000000-0000-4000-8000-000000000612','20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000511','to_event','can_drive',2,10,'2020-01-01Z','2020-01-01T00:10Z');
select no_plan();

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000003'::uuid,'verified fixture subject');
select throws_ok($q$select public.complete_household_onboarding('20000000-0000-4000-8000-000000000102','Member','Example')$q$,'42501',null,'cannot complete onboarding in another household');
select lives_ok($q$select public.complete_household_onboarding('20000000-0000-4000-8000-000000000101','Member','Example')$q$,'existing Member can finish onboarding');
select lives_ok($q$select public.complete_household_onboarding('20000000-0000-4000-8000-000000000101','Member','Example')$q$,'existing onboarding retry succeeds');
select is((select count(*)::int from public.household_members where linked_user_id=auth.uid() and member_type='adult' and archived_at is null),1,'existing completion creates exactly one linked adult');
select is((select onboarding_completed_at is not null from public.profiles),true,'existing completion records readiness');
select lives_ok($q$update public.household_members set first_name='Member edited' where id='20000000-0000-4000-8000-000000000203'$q$,'Member edits participant');
select is((select first_name from public.household_members where id='20000000-0000-4000-8000-000000000203'),'Member edited','participant change persisted');
select lives_ok($q$select public.event_workflow('ride','{"householdId":"20000000-0000-4000-8000-000000000101","eventId":"20000000-0000-4000-8000-000000000610","memberId":"20000000-0000-4000-8000-000000000203","revision":1,"leg":"to_event","mode":"can_drive","locationId":"20000000-0000-4000-8000-000000000510","earliest":"2099-01-01T08:50Z","latest":"2099-01-01T09:00Z","seats":2,"detour":10}')$q$, 'Member configures an unlinked adult driver through controlled RPC');
select is((select count(*)::int from public.ride_participation where member_id='20000000-0000-4000-8000-000000000203' and mode='can_drive'),1,'driver offer really exists');
select throws_ok($q$update public.household_members set member_type='child' where id='20000000-0000-4000-8000-000000000203'$q$,'23514',null,'active future driver cannot become Child');
select is((select member_type from public.household_members where id='20000000-0000-4000-8000-000000000203'),'adult','denied type change preserves participant');

select throws_ok($q$update public.profiles set onboarding_completed_at=now() where id='20000000-0000-4000-8000-000000000003'$q$,'42501',null,'cannot mark onboarding complete directly');
select throws_ok($q$update public.household_members set member_type='child' where id='20000000-0000-4000-8000-000000000201'$q$,'23514',null,'linked adult cannot become child');
select throws_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('a',64))$q$,'42501',null,'Member cannot invite');
select throws_ok($q$select public.promote_household_member('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000003')$q$,'42501',null,'Member cannot promote self');
select throws_ok($q$select public.archive_household_participant('20000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000205')$q$,'42501',null,'Member cannot archive another household');
select is((select count(*)::int from public.household_invitations where household_id='20000000-0000-4000-8000-000000000101'),0,'Member cannot inspect invitations');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'verified fixture subject');
select lives_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101',' GROUP.ADMIN@EXAMPLE.TEST ',repeat('a',64),'20000000-0000-4000-8000-000000000203')$q$,'Owner invites existing unlinked adult');
select is((select invited_email from public.household_invitations where household_id='20000000-0000-4000-8000-000000000101'),'group.admin@example.test','email normalized');
select throws_ok($q$select token_hash from public.household_invitations$q$,'42501',null,'hash is not exposed even to Owner');
select throws_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101','x@example.test',repeat('b',64),'20000000-0000-4000-8000-000000000202')$q$,'22023',null,'cannot invite child');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","email":"group.admin@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000004'::uuid,'verified fixture subject');
select is((public.accept_invitation('household',repeat('a',64),null,'Wrong','Email')->>'status'),'invalid','forged JWT email rejected');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select is((public.accept_invitation('household',repeat('a',64),null,'Group','Admin')->>'status'),'ok','Auth email matches invitation despite forged JWT email');
select is((select linked_user_id from public.household_members where id='20000000-0000-4000-8000-000000000203'),'20000000-0000-4000-8000-000000000008'::uuid,'existing participant linked');
select is((select role from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000008'),'member','acceptance grants Member');
select is((select count(*)::int from public.household_invitation_redemptions where user_id='20000000-0000-4000-8000-000000000008'),1,'one redemption recorded');
select is((public.accept_invitation('household',repeat('a',64),null,'Group','Admin')->>'status'),'invalid','duplicate acceptance rejected');
reset role; set local role :"fixture_owner";
select is((select count(*)::int from public.household_invitation_redemptions where user_id::text like '20000000-%'),1,'duplicate did not add audit');
select is((select count(*)::int from public.household_invitations where consumed_at is not null and household_id::text like '20000000-%'),1,'one consumed invitation');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'verified fixture subject');
select lives_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('9',64))$q$,'fresh invite for an existing member');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','existing-member assertion uses ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'existing-member subject');
select is((public.accept_invitation('household',repeat('9',64),null,'Group','Admin')->>'status'),'invalid','already-member acceptance denied');
reset role; set local role :"fixture_owner";
select is((select consumed_at from public.household_invitations where token_hash=repeat('9',64)),null::timestamptz,'already-member rejection did not consume invitation');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select lives_ok($q$select public.promote_household_member('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000008')$q$,'Owner promotes Member');
select throws_ok($q$select public.remove_household_member('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000008')$q$,'42501',null,'cannot remove another Owner');
select lives_ok($q$select public.demote_household_owner('20000000-0000-4000-8000-000000000101')$q$,'Owner can step down with another Owner');
select is((select role from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000001'),'member','self is now Member');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select lives_ok($q$select public.demote_household_owner('20000000-0000-4000-8000-000000000101')$q$,'sole Owner transfers to longest-standing Member');
select is((select role from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000001'),'owner','Member preferred over legacy Admin and tie broken by user ID');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'verified fixture subject');
select lives_ok($q$select public.remove_household_member('20000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000008')$q$,'Owner removes Member');
select is((select linked_user_id from public.household_members where id='20000000-0000-4000-8000-000000000203'),null::uuid,'removed participant unlinked');
select is((select archived_at is not null from public.household_members where id='20000000-0000-4000-8000-000000000203'),true,'removed participant archived');
select is((select count(*)::int from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000008'),0,'removed access gone');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select is((select count(*)::int from public.households where id='20000000-0000-4000-8000-000000000101'),0,'removed user cannot see household');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000004'::uuid,'verified fixture subject');
select throws_ok($q$select public.demote_household_owner('20000000-0000-4000-8000-000000000102')$q$,'22023',null,'sole account holder cannot demote');
select lives_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000102','group.admin@example.test',repeat('c',64))$q$,'create invitation before archival');
select lives_ok($q$select public.leave_household('20000000-0000-4000-8000-000000000102')$q$,'last account holder leaves and archives');
select is((select count(*)::int from public.households where id='20000000-0000-4000-8000-000000000102'),0,'archived household inaccessible');
reset role; set local role :"fixture_owner";
select is((select archived_at is not null from public.households where id='20000000-0000-4000-8000-000000000102'),true,'household archived');
select is((select status from public.group_memberships where household_id='20000000-0000-4000-8000-000000000102'),'left','active group membership ended');
select is((select count(*)::int from public.household_invitations where household_id='20000000-0000-4000-8000-000000000102' and revoked_at is not null),1,'pending invitation revoked');
select is((select count(*)::int from public.ride_participation where member_id in ('20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000205') and disabled_at is not null and mode='none'),2,'future rides disabled and preserved');
select is((select count(*)::int from public.event_participation where member_id in ('20000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000205') and disabled_at is not null and status='not_going'),2,'future attendance disabled and preserved');
select is((select status from public.event_participation where event_id='20000000-0000-4000-8000-000000000612'),'going','historical attendance unchanged');
select is((select mode from public.ride_participation where event_id='20000000-0000-4000-8000-000000000612'),'can_drive','historical ride unchanged');
select is((select disabled_at from public.ride_participation where event_id='20000000-0000-4000-8000-000000000612'),null::timestamptz,'historical ride not disabled');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select is((public.accept_invitation('household',repeat('c',64),null,'Group','Admin')->>'status'),'invalid','cannot join archived household');
reset role; set local role :"fixture_owner";
insert into public.household_invitations(household_id,invited_email,token_hash,created_by_user_id,expires_at) values ('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('d',64),'20000000-0000-4000-8000-000000000001',now()-interval '1 minute');
insert into public.household_invitations(household_id,invited_email,token_hash,created_by_user_id,revoked_at) values ('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('e',64),'20000000-0000-4000-8000-000000000001',now());
insert into public.household_invitations(household_id,invited_email,token_hash,created_by_user_id,participant_id) values ('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('f',64),'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000203');
create temporary table before_attempt as select (select jsonb_agg(to_jsonb(a) order by household_id,user_id) from public.household_access a where household_id::text like '20000000-%') access,(select jsonb_agg(to_jsonb(i) order by id) from public.household_invitations i where household_id::text like '20000000-%') invites,(select jsonb_agg(to_jsonb(r) order by invitation_id) from public.household_invitation_redemptions r where user_id::text like '20000000-%') audit, (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p where id::text like '20000000-%') profiles, (select jsonb_agg(to_jsonb(m) order by id) from public.household_members m where household_id::text like '20000000-%') participants;

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select is((public.accept_invitation('household',repeat('d',64),null,'Group','Admin')->>'status'),'invalid','expired invitation rejected');
select is((public.accept_invitation('household',repeat('e',64),null,'Group','Admin')->>'status'),'invalid','revoked invitation rejected');
select is((public.accept_invitation('household',repeat('f',64),null,'Group','Admin')->>'status'),'invalid','ineligible participant invitation rejected');
select is((public.accept_invitation('household',repeat('0',64),null,'Group','Admin')->>'status'),'invalid','unknown invitation rejected');
reset role; set local role :"fixture_owner";
select is((select (select jsonb_agg(to_jsonb(a) order by household_id,user_id) from public.household_access a where household_id::text like '20000000-%')=access and (select jsonb_agg(to_jsonb(i) order by id) from public.household_invitations i where household_id::text like '20000000-%')=invites and (select jsonb_agg(to_jsonb(r) order by invitation_id) from public.household_invitation_redemptions r where user_id::text like '20000000-%')=audit and (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p where id::text like '20000000-%')=profiles and (select jsonb_agg(to_jsonb(m) order by id) from public.household_members m where household_id::text like '20000000-%')=participants from before_attempt),true,'rejections preserved membership invitation and audit state');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'verified fixture subject');
select lives_ok($q$select public.leave_household('20000000-0000-4000-8000-000000000101')$q$,'Owner departure transfers automatically');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000003'::uuid,'verified fixture subject');
select is((select role from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000003'),'owner','remaining Member becomes Owner');
select lives_ok($q$select public.leave_household('20000000-0000-4000-8000-000000000101')$q$,'Owner leaves with only legacy Admin remaining');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000002'::uuid,'verified fixture subject');
select is((select role from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000002'),'owner','legacy Admin is fallback successor');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'verified fixture subject');
select lives_ok($q$select public.onboard_household('New household','Group','Admin','20000000-0000-4000-8000-000000000990')$q$,'onboarding retry succeeds');
select lives_ok($q$select public.onboard_household('New household','Group','Admin','20000000-0000-4000-8000-000000000990')$q$,'onboarding retry succeeds');
select is((select count(*)::int from public.households where display_name='New household'),1,'retry did not duplicate household');
select is((select count(*)::int from public.household_members where linked_user_id='20000000-0000-4000-8000-000000000008' and archived_at is null),1,'one linked adult');
select is((select onboarding_completed_at is not null from public.profiles),true,'onboarding complete only through workflow');
select lives_ok($q$select public.onboard_household('Second household','Group','Admin','20000000-0000-4000-8000-000000000991')$q$,'multiple households supported');
select is((select count(*)::int from public.households),2,'account sees its two active households');
reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{}',true);
set local role anon;
select is((select current_user::text),'anon','anonymous role verified');
select is((select auth.uid()),null::uuid,'anonymous identity verified');
select throws_ok($q$select public.accept_invitation('household',repeat('a',64),null,'A','B')$q$,'42501',null,'anonymous acceptance denied');
reset role; set local role :"fixture_owner";
select throws_ok($q$do $body$ begin
 update public.household_access set role='member' where household_id='20000000-0000-4000-8000-000000000101';
 set constraints all immediate;
end $body$;$q$,'23514',null,'deferred invariant rejects an ownerless active household');
select is((select count(*)::int from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and role='owner'),1,'failed invariant check rolls back protected roles');
set constraints all immediate;
select lives_ok($q$select 1$q$,'all deferred invariants validate');
select * from finish();
rollback;
