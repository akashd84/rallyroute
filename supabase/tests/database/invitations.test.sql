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

create temporary table before_invitation_attempt (state text);
create function pg_temp.invitation_state() returns text language sql security invoker as $$
 select jsonb_build_object(
  'memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.group_memberships m),
  'invitations',(select jsonb_agg(to_jsonb(i) order by id) from public.group_invitations i),
  'redemptions',(select jsonb_agg(to_jsonb(r) order by id) from public.group_invitation_redemptions r)
 )::text;
$$;

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.group_invitations where group_id='20000000-0000-4000-8000-000000000301'), 0, 'normal member cannot read invitations');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated","email":"group.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000008'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.group_invitations where group_id='20000000-0000-4000-8000-000000000301'), 7, 'administrator can inspect invitations');

select lives_ok($sql$select public.create_group_invitation('20000000-0000-4000-8000-000000000301',' DIRECT ','dc29af3dd716bc807c84e4e40837654c3d3eb79d53cd705a5d678288070c160d',' C.OWNER@EXAMPLE.TEST ',null,99)$sql$, 'group admin creates normalized direct invitation');

reset role; set local role :"fixture_owner";

select is((select invited_email from public.group_invitations where token_hash='dc29af3dd716bc807c84e4e40837654c3d3eb79d53cd705a5d678288070c160d'), 'c.owner@example.test', 'direct invited email normalized');

select is((select max_uses from public.group_invitations where token_hash='dc29af3dd716bc807c84e4e40837654c3d3eb79d53cd705a5d678288070c160d'), 1, 'direct invitation forces one use');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$select public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000103')$sql$, '42501', null, 'anonymous redemption denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'anonymous redemption denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000101')->>'status'),'invalid','ordinary household member redemption denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'ordinary household member redemption denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','other household substitution denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'other household substitution denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','66a7cef697570a5d882a43ddb3c74041dc0b5194d7d171a257afdabca635454f','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','unknown hash denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'unknown hash denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','b16d3bd1ad44baaac304703189b537d40433f6ad383896bc043579f74b1d0770','20000000-0000-4000-8000-000000000104')->>'status'),'invalid','wrong direct email denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'wrong direct email denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','b16d3bd1ad44baaac304703189b537d40433f6ad383896bc043579f74b1d0770','20000000-0000-4000-8000-000000000104')->>'status'),'invalid','forged JWT email does not bypass direct invitation');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'forged JWT email does not bypass direct invitation: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','307aa056f7977b04a1e340ec4f1e1c045e2104d434cb07fe11c98a87e9b248f9','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','expired invitation denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'expired invitation denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','9af9f7ed6a9d0781f84df42a59f0636496d8c43af0a235dd136ab9959deba789','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','revoked invitation denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'revoked invitation denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','2e52161859e5997a1cd1e1d39f04c0bbe90b60bb17f5bf6b7957c202e275c867','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','exhausted invitation denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'exhausted invitation denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','7c3efb5ed558bd7e0c4175cdd7f586d3c440c1dfd1f98ca9c055aca5c6819f97','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','active invite at usage limit denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'active invite at usage limit denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000101')->>'status'),'invalid','already active membership denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'already active membership denied: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","email":"e.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000007'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000105')->>'status'),'invalid','removed household cannot rejoin');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'removed household cannot rejoin: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','b16d3bd1ad44baaac304703189b537d40433f6ad383896bc043579f74b1d0770','20000000-0000-4000-8000-000000000103')->>'status'),'ok','matching database email redeems direct invitation');

select is((select count(*)::integer from public.group_invitation_redemptions where household_id='20000000-0000-4000-8000-000000000103'), 1, 'redeemer sees own household audit');

reset role; set local role :"fixture_owner";

select is((select count(*)::integer from public.group_memberships where group_id='20000000-0000-4000-8000-000000000301' and household_id='20000000-0000-4000-8000-000000000103' and status='active'), 1, 'direct redemption creates one active membership');

select is((select count(*)::integer from public.group_invitation_redemptions where invitation_id='20000000-0000-4000-8000-000000000901'), 1, 'direct redemption creates one audit');

select is((select use_count from public.group_invitations where id='20000000-0000-4000-8000-000000000901'), 1, 'direct usage incremented once');

select is((select status from public.group_invitations where id='20000000-0000-4000-8000-000000000901'), 'exhausted', 'single-use direct invitation exhausted');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','b16d3bd1ad44baaac304703189b537d40433f6ad383896bc043579f74b1d0770','20000000-0000-4000-8000-000000000103')->>'status'),'invalid','consumed direct invitation cannot be reused');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'consumed direct invitation cannot be reused: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000104')->>'status'),'ok','left household rejoins with valid group link');

reset role; set local role :"fixture_owner";

select is((select count(*)::integer from public.group_memberships where id='20000000-0000-4000-8000-000000000403' and status='active'), 1, 'left membership reactivated in place');

select is((select use_count from public.group_invitations where id='20000000-0000-4000-8000-000000000902'), 1, 'group link first use counted');

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000104')->>'status'),'invalid','duplicate active redemption denied');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'duplicate active redemption denied: no membership, audit, or usage changes');

update public.group_memberships set status='left' where id='20000000-0000-4000-8000-000000000403';

reset role; set local role :"fixture_owner"; truncate before_invitation_attempt; insert into before_invitation_attempt select pg_temp.invitation_state();

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000104')->>'status'),'invalid','same invitation household pair cannot redeem twice');

reset role; set local role :"fixture_owner";

select is(pg_temp.invitation_state(), (select state from before_invitation_attempt), 'same invitation household pair cannot redeem twice: no membership, audit, or usage changes');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","email":"d.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000006'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','22972ad2508f46f01a050f8f458eda664cd40fb13b9d40e538c19b53b066d0cd','20000000-0000-4000-8000-000000000104')->>'status'),'ok','fresh unlimited link allows rejoining after leaving');

reset role; set local role :"fixture_owner";

update public.group_memberships set status='left' where household_id='20000000-0000-4000-8000-000000000103';

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","email":"c.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000005'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','4c4d5928d6a5d126b140c1e84e94867f11b70269d9692c7e75ca355bed42d8f9','20000000-0000-4000-8000-000000000103')->>'status'),'ok','second distinct household consumes final group-link use');

reset role; set local role :"fixture_owner";

select is((select use_count from public.group_invitations where id='20000000-0000-4000-8000-000000000902'), 2, 'limited link records exactly two uses');

select is((select status from public.group_invitations where id='20000000-0000-4000-8000-000000000902'), 'exhausted', 'limited link becomes exhausted at limit');

select is((select count(*)::integer from public.group_invitation_redemptions where invitation_id='20000000-0000-4000-8000-000000000902'), 2, 'limited link has two audit rows');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"a.owner@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000001'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.group_invitation_redemptions where household_id='20000000-0000-4000-8000-000000000103'), 0, 'another household audit hidden');

reset role; set local role :"fixture_owner";

update public.group_memberships set status='left' where household_id='20000000-0000-4000-8000-000000000101';

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"a.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000002'::uuid, 'JWT subject matches fixture user');

select is((public.accept_invitation('group','22972ad2508f46f01a050f8f458eda664cd40fb13b9d40e538c19b53b066d0cd','20000000-0000-4000-8000-000000000101')->>'status'),'ok','household admin can redeem a valid invitation');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","email":"a.member@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000003'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.group_invitation_redemptions where household_id='20000000-0000-4000-8000-000000000101'), 1, 'ordinary member sees audit for own household under current policy');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated","email":"group.admin@example.test"}', true);

set local role authenticated;

select is((current_user::text), 'authenticated', 'assertion executes as ordinary role');

select is(auth.uid(), '20000000-0000-4000-8000-000000000008'::uuid, 'JWT subject matches fixture user');

select is((select count(*)::integer from public.group_invitation_redemptions where invitation_id='20000000-0000-4000-8000-000000000902'), 2, 'group admin sees relevant audits');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims', '{}', true);

set local role anon;

select is((current_user::text), 'anon', 'assertion executes as ordinary role');

select is(auth.uid(), null::uuid, 'anonymous JWT has no subject');

select throws_ok($sql$select public.create_group_invitation('20000000-0000-4000-8000-000000000301','group_link','1d3c629d051ef16fbb901d740555e62a1141281cf21df22c5ce18bf7c90895a5')$sql$, '42501', null, 'anonymous invitation creation denied');

reset role; set local role :"fixture_owner";

select * from finish();

rollback;
