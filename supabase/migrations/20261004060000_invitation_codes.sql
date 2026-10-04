-- Shared persistent attempt budget. Contains counters only, never invitation secrets.
create table private.invitation_attempt_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 minute_started_at timestamptz not null,
 minute_count integer not null check(minute_count between 0 and 10),
 hour_started_at timestamptz not null,
 hour_count integer not null check(hour_count between 0 and 50)
);
revoke all on private.invitation_attempt_limits from public,anon,authenticated;

create function private.consume_invitation_attempt()
returns integer language plpgsql security definer set search_path='' as $$
declare budget private.invitation_attempt_limits; at_time timestamptz; retry integer:=0;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 at_time:=clock_timestamp();
 insert into private.invitation_attempt_limits values(auth.uid(),at_time,0,at_time,0) on conflict(user_id) do nothing;
 select * into budget from private.invitation_attempt_limits where user_id=auth.uid() for update;
 at_time:=clock_timestamp();
 if at_time>=budget.minute_started_at+interval '1 minute' then budget.minute_started_at:=at_time; budget.minute_count:=0; end if;
 if at_time>=budget.hour_started_at+interval '1 hour' then budget.hour_started_at:=at_time; budget.hour_count:=0; end if;
 if budget.minute_count>=10 then retry:=greatest(retry,ceil(extract(epoch from budget.minute_started_at+interval '1 minute'-at_time))::integer); end if;
 if budget.hour_count>=50 then retry:=greatest(retry,ceil(extract(epoch from budget.hour_started_at+interval '1 hour'-at_time))::integer); end if;
 update private.invitation_attempt_limits set minute_started_at=budget.minute_started_at,minute_count=budget.minute_count+case when retry=0 then 1 else 0 end,
 hour_started_at=budget.hour_started_at,hour_count=budget.hour_count+case when retry=0 then 1 else 0 end where user_id=auth.uid();
 return retry;
end;
$$;
revoke all on function private.consume_invitation_attempt() from public,anon,authenticated;

create function private.inspect_invitation(p_kind text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer; metadata jsonb; email_value text; invitation public.household_invitations;
begin
 retry:=private.consume_invitation_attempt();
 if retry>0 then return jsonb_build_object('status','throttled','retry_after_seconds',retry); end if;
 -- Expected failures roll back only this inner block, preserving the budget above.
 begin
  if p_kind is null or p_kind not in ('household','group') or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('status','invalid'); end if;
  if p_kind='group' then
   select to_jsonb(g) into metadata from private.preview_group_invitation(p_token_hash) g;
   if metadata is null then return jsonb_build_object('status','invalid'); end if;
   return jsonb_build_object('status','ok','group',metadata);
  end if;
  select lower(btrim(email)) into email_value from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select i.* into invitation from public.household_invitations i join public.households h on h.id=i.household_id
   where i.token_hash=p_token_hash and h.archived_at is null;
  if not found or email_value is null or email_value<>invitation.invited_email or invitation.revoked_at is not null or invitation.consumed_at is not null
   or invitation.expires_at<=clock_timestamp() or exists(select 1 from public.household_access a where a.household_id=invitation.household_id and a.user_id=auth.uid()) then
   return jsonb_build_object('status','invalid'); end if;
  return jsonb_build_object('status','ok');
 exception
  when sqlstate '22023' or sqlstate '42501' or sqlstate 'P0001' then return jsonb_build_object('status','invalid');
  when others then return jsonb_build_object('status','unavailable');
 end;
end;
$$;
create function private.accept_invitation(p_kind text,p_token_hash text,p_household_id uuid default null,p_first_name text default null,p_last_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer; result_id uuid; gid uuid;
begin
 retry:=private.consume_invitation_attempt();
 if retry>0 then return jsonb_build_object('status','throttled','retry_after_seconds',retry); end if;
 begin
  if p_kind is null or p_kind not in ('household','group') or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('status','invalid'); end if;
  if p_kind='household' then
   if p_first_name is null or p_last_name is null or btrim(p_first_name)='' or btrim(p_last_name)='' or length(btrim(p_first_name))>100 or length(btrim(p_last_name))>100 then
    return jsonb_build_object('status','invalid'); end if;
   result_id:=private.accept_household_invitation(p_token_hash,p_first_name,p_last_name);
   return jsonb_build_object('status','ok','destination_kind','household','destination_id',result_id);
  end if;
  if p_household_id is null then return jsonb_build_object('status','invalid'); end if;
  result_id:=private.redeem_group_invitation(p_token_hash,p_household_id);
  select group_id into gid from public.group_memberships where id=result_id;
  if gid is null then raise exception using errcode='22023',message='Invitation unavailable'; end if;
  return jsonb_build_object('status','ok','destination_kind','group','destination_id',gid);
 exception
  when sqlstate '22023' or sqlstate '42501' or sqlstate 'P0001' or sqlstate '23505' or sqlstate '23514' then return jsonb_build_object('status','invalid');
  when others then return jsonb_build_object('status','unavailable');
 end;
end;
$$;
revoke all on function private.inspect_invitation(text,text),private.accept_invitation(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function private.inspect_invitation(text,text),private.accept_invitation(text,text,uuid,text,text) to authenticated;
create function public.inspect_invitation(p_kind text,p_token_hash text) returns jsonb language sql security invoker set search_path='' as $$
 select private.inspect_invitation(p_kind,p_token_hash); $$;
create function public.accept_invitation(p_kind text,p_token_hash text,p_household_id uuid default null,p_first_name text default null,p_last_name text default null) returns jsonb language sql security invoker set search_path='' as $$
 select private.accept_invitation(p_kind,p_token_hash,p_household_id,p_first_name,p_last_name); $$;
revoke all on function public.inspect_invitation(text,text),public.accept_invitation(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.inspect_invitation(text,text),public.accept_invitation(text,text,uuid,text,text) to authenticated;
-- Keep implementations for guarded internal calls; remove every ordinary unguarded entrypoint.
revoke all on function public.preview_group_invitation(text),private.preview_group_invitation(text),
 public.redeem_group_invitation(text,uuid),private.redeem_group_invitation(text,uuid),
 public.accept_household_invitation(text,text,text),private.accept_household_invitation(text,text,text) from public,anon,authenticated;
