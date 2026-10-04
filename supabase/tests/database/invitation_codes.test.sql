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
insert into public.household_invitations(household_id,invited_email,token_hash,created_by_user_id)
 values('20000000-0000-4000-8000-000000000101','group.admin@example.test',repeat('a',64),'20000000-0000-4000-8000-000000000001');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'assertion identity');
select throws_ok($q$select * from private.invitation_attempt_limits$q$,'42501',null,'private counters not readable');
select throws_ok($q$select private.consume_invitation_attempt()$q$,'42501',null,'clients cannot manipulate the budget');
select throws_ok($q$select public.accept_household_invitation(repeat('a',64),'A','B')$q$,'42501',null,'old household accept blocked');
select throws_ok($q$select private.accept_household_invitation(repeat('a',64),'A','B')$q$,'42501',null,'private household accept blocked');
select throws_ok($q$select public.redeem_group_invitation(repeat('a',64),'20000000-0000-4000-8000-000000000101')$q$,'42501',null,'old group redeem blocked');
select throws_ok($q$select private.redeem_group_invitation(repeat('a',64),'20000000-0000-4000-8000-000000000101')$q$,'42501',null,'private group redeem blocked');
select throws_ok($q$select public.preview_group_invitation(repeat('a',64))$q$,'42501',null,'old group preview blocked');
select throws_ok($q$select private.preview_group_invitation(repeat('a',64))$q$,'42501',null,'private group preview blocked');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','household inspection succeeds with confirmed Auth email');
select is(public.inspect_invitation('household',repeat('b',64))->>'status','invalid','unknown household hash rejected');
select is(public.inspect_invitation('group',repeat('b',64))->>'status','invalid','unknown group hash rejected');
select is(public.accept_invitation('group',repeat('b',64),'20000000-0000-4000-8000-000000000101')->>'status','invalid','failed acceptance consumes same budget');
select is(public.inspect_invitation('bad','malformed')->>'status','invalid','malformed RPC input counted');

reset role; set local role :"fixture_owner";
select is((select minute_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000008'),5,'successful and failed outcomes persist five attempts');
select is((select count(*)::int from public.household_invitation_redemptions where user_id='20000000-0000-4000-8000-000000000008'),0,'inspection does not join');

reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'assertion identity');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt six');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt seven');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt eight');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt nine');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt ten allowed');
select is(public.accept_invitation('household',repeat('a',64),null,'A','B')->>'status','throttled','minute limit blocks acceptance of valid invite');
select is(public.inspect_invitation('group',repeat('0',64))->>'status','throttled','limit shared across kinds');
select ok((public.inspect_invitation('household',repeat('a',64))->>'retry_after_seconds')::integer between 1 and 60,'minute retry timing');

reset role; set local role :"fixture_owner";
select is((select minute_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000008'),10,'blocked calls do not consume beyond limit');
select is((select consumed_at from public.household_invitations where token_hash=repeat('a',64)),null::timestamptz,'blocked acceptance left invite untouched');
update private.invitation_attempt_limits set minute_started_at=clock_timestamp()-interval '61 seconds' where user_id='20000000-0000-4000-8000-000000000008';
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'assertion identity');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','minute window resets');

reset role; set local role :"fixture_owner";
select is((select minute_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000008'),1,'new minute count one');
select is((select hour_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000008'),11,'hour budget retained');
update private.invitation_attempt_limits set minute_started_at=clock_timestamp()-interval '61 seconds',hour_count=49 where user_id='20000000-0000-4000-8000-000000000008';
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'assertion identity');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','ok','attempt fifty allowed');
select is(public.inspect_invitation('household',repeat('a',64))->>'status','throttled','hour limit blocks fifty-one');
select ok((public.inspect_invitation('household',repeat('a',64))->>'retry_after_seconds')::integer between 1 and 3600,'hour retry timing');

reset role; set local role :"fixture_owner";
update private.invitation_attempt_limits set minute_started_at=clock_timestamp()-interval '61 seconds',hour_started_at=clock_timestamp()-interval '61 minutes' where user_id='20000000-0000-4000-8000-000000000008';
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000008'::uuid,'assertion identity');
select is(public.accept_invitation('household',repeat('a',64),null,'Group','Admin')->>'status','ok','expired windows allow explicit household acceptance');
select is(public.accept_invitation('household',repeat('a',64),null,'Group','Admin')->>'status','invalid','duplicate rejected structurally');

reset role; set local role :"fixture_owner";
select is((select hour_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000008'),2,'both windows reset and failed duplicate counted');
select is((select count(*)::int from public.household_invitation_redemptions where user_id='20000000-0000-4000-8000-000000000008'),1,'one audit after duplicate');
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000001'::uuid,'assertion identity');
select lives_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101','c.owner@example.test',repeat('c',64))$q$,'hash-only creation allowed');
select throws_ok($q$select public.create_household_invitation('20000000-0000-4000-8000-000000000101','c.owner@example.test',repeat('c',64))$q$,'23505',null,'hash collision rejected atomically');

reset role; set local role :"fixture_owner";
create function pg_temp.fail_access() returns trigger language plpgsql as $$ begin raise exception using errcode='XX000',message='synthetic provider failure'; end; $$;
create trigger test_unavailable before insert on public.household_access for each row execute function pg_temp.fail_access();
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000005'::uuid,'assertion identity');
select is(public.accept_invitation('household',repeat('c',64),null,'C','Owner')->>'status','unavailable','unexpected provider failure returns safe status');

reset role; set local role :"fixture_owner";
drop trigger test_unavailable on public.household_access;
select is((select minute_count from private.invitation_attempt_limits where user_id='20000000-0000-4000-8000-000000000005'),1,'provider failure preserves attempt count');
select is((select consumed_at from public.household_invitations where token_hash=repeat('c',64)),null::timestamptz,'provider failure rolls back consumption');
select is((select count(*)::int from public.household_access where household_id='20000000-0000-4000-8000-000000000101' and user_id='20000000-0000-4000-8000-000000000005'),0,'provider failure rolls back access');
reset role; set local role :"fixture_owner";

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005","email":"forged@example.test"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','assertion ordinary role');
select is(auth.uid(),'20000000-0000-4000-8000-000000000005'::uuid,'assertion identity');
select is(public.accept_invitation('household',repeat('c',64),null,'C','Owner')->>'status','ok','allowed acceptance succeeds after recovery');

reset role; set local role :"fixture_owner";
select set_config('request.jwt.claims','{}',true);
set local role anon;
select is(current_user::text,'anon','anonymous role');
select is(auth.uid(),null::uuid,'anonymous uid');
select throws_ok($q$select public.inspect_invitation('household',repeat('a',64))$q$,'42501',null,'anonymous inspect blocked');
select throws_ok($q$select public.accept_invitation('household',repeat('a',64),null,'A','B')$q$,'42501',null,'anonymous accept blocked');
reset role; set local role :"fixture_owner";
set constraints all immediate;
select * from finish();
rollback;
