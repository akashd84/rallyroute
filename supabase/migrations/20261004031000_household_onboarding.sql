-- Household onboarding. API clients retain RLS; privileged workflows live in private.
alter table public.households add column archived_at timestamptz;
alter table public.household_members add column archived_at timestamptz;
alter table public.event_participation add column disabled_at timestamptz;
alter table public.ride_participation add column disabled_at timestamptz;
revoke update (onboarding_completed_at) on public.profiles from authenticated;
revoke delete on public.household_members from authenticated;

create table private.household_creation_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, household_id uuid not null references public.households(id),
 primary key(user_id,request_id)
);
create table public.household_invitations (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 invited_email text not null check (invited_email = lower(btrim(invited_email))),
 participant_id uuid references public.household_members(id),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 created_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '7 days',
 revoked_at timestamptz, consumed_at timestamptz
);
create table public.household_invitation_redemptions (
 invitation_id uuid primary key references public.household_invitations(id),
 household_id uuid not null references public.households(id),
 user_id uuid not null references auth.users(id),
 participant_id uuid not null references public.household_members(id),
 redeemed_at timestamptz not null default now()
);
alter table public.household_invitations enable row level security;
alter table public.household_invitation_redemptions enable row level security;
revoke all on public.household_invitations, public.household_invitation_redemptions from anon, authenticated;
grant select (id,household_id,invited_email,participant_id,created_by_user_id,created_at,expires_at,revoked_at,consumed_at)
 on public.household_invitations to authenticated;
grant select on public.household_invitation_redemptions to authenticated;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_access a join public.households h on h.id=a.household_id
 where a.household_id=target_household_id and a.user_id=auth.uid() and h.archived_at is null);
$$;
create or replace function private.is_household_admin(target_household_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_access a join public.households h on h.id=a.household_id
 where a.household_id=target_household_id and a.user_id=auth.uid() and a.role in ('owner','admin') and h.archived_at is null);
$$;
create or replace function private.can_access_household_member(target_member_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_members m where m.id=target_member_id and private.is_household_member(m.household_id));
$$;
create or replace function private.can_manage_household_member(target_member_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_members m where m.id=target_member_id and m.archived_at is null
 and private.is_household_member(m.household_id));
$$;
create or replace function private.is_group_member(target_group_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships g where g.group_id=target_group_id and g.status='active'
 and private.is_household_member(g.household_id));
$$;

drop policy household_members_insert_admin on public.household_members;
drop policy household_members_update_admin on public.household_members;
drop policy household_members_delete_admin on public.household_members;
create policy household_members_insert_member on public.household_members for insert to authenticated
 with check(private.is_household_member(household_id) and archived_at is null and linked_user_id is null);
create policy household_members_update_member on public.household_members for update to authenticated
 using(private.can_manage_household_member(id)) with check(private.can_manage_household_member(id));
create policy household_invitations_select_admin on public.household_invitations for select to authenticated
 using(private.is_household_admin(household_id));
create policy household_redemptions_select on public.household_invitation_redemptions for select to authenticated
 using(user_id=auth.uid() or private.is_household_admin(household_id));

-- Every lifecycle RPC obtains this lock before checking access, preventing stale-role races.
create function private.lock_household(p_household_id uuid, p_manage boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=p_household_id and archived_at is null for update;
 if not found or auth.uid() is null or not private.is_household_member(p_household_id)
    or (p_manage and not private.is_household_admin(p_household_id)) then
   raise exception using errcode='42501',message='Household access denied';
 end if;
end;
$$;

create function private.guard_household_participant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=new.household_id for update;
 if new.linked_user_id is not null and (new.member_type <> 'adult' or new.archived_at is not null) then
   raise exception using errcode='23514',message='Account-linked participants must be active adults';
 end if;
 if current_setting('role',true) in ('anon','authenticated') and
    (not private.is_household_member(new.household_id) or exists(select 1 from public.households where id=new.household_id and archived_at is not null)) then
   raise exception using errcode='42501',message='Household access denied';
 end if;
 return new;
end;
$$;
create trigger household_participant_guard before insert or update on public.household_members
 for each row execute function private.guard_household_participant();

-- Deferred enforcement permits atomic creation/transfer while rejecting orphaned commits.
create function private.check_household_owner()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='households' then target:=new.id;
 elsif tg_op='DELETE' then target:=old.household_id; else target:=new.household_id; end if;
 perform 1 from public.households where id=target for update;
 if exists(select 1 from public.households where id=target and archived_at is null)
 and not exists(select 1 from public.household_access where household_id=target and role='owner') then
  raise exception using errcode='23514',message='Active households require an Owner';
 end if;
 return null;
end;
$$;
-- Reconcile pre-onboarding households without an Owner; preserve all other legacy roles.
update public.household_access a set role='owner' where (a.household_id,a.user_id) in (
 select distinct on (h.id) h.id,a2.user_id from public.households h join public.household_access a2 on a2.household_id=h.id
 where not exists(select 1 from public.household_access o where o.household_id=h.id and o.role='owner')
 order by h.id,a2.created_at,a2.user_id
);
update public.households h set archived_at=now() where not exists(select 1 from public.household_access a where a.household_id=h.id);
create constraint trigger household_owner_access after insert or update or delete on public.household_access
 deferrable initially deferred for each row execute function private.check_household_owner();
create constraint trigger household_owner_household after insert or update on public.households
 deferrable initially deferred for each row execute function private.check_household_owner();

create function private.complete_household_profile(p_first_name text,p_last_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 if p_first_name is null or p_last_name is null or length(btrim(p_first_name)) not between 1 and 100 or length(btrim(p_last_name)) not between 1 and 100 then
 raise exception using errcode='22023',message='First and last name required'; end if;
 update public.profiles set first_name=btrim(p_first_name),last_name=btrim(p_last_name) where id=auth.uid();
 if not found then raise exception using errcode='P0001',message='Profile missing'; end if;
end;
$$;
create function private.onboard_household(p_display_name text,p_first_name text,p_last_name text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare hid uuid;
begin
 perform private.complete_household_profile(p_first_name,p_last_name);
 if p_request_id is null or p_display_name is null or length(btrim(p_display_name)) not between 1 and 100 then
 raise exception using errcode='22023',message='Household name and request identifier required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text,0));
 select household_id into hid from private.household_creation_requests where user_id=auth.uid() and request_id=p_request_id;
 if found then return hid; end if;
 hid:=private.create_household(btrim(p_display_name));
 insert into public.household_members(household_id,linked_user_id,first_name,last_name,member_type)
 values(hid,auth.uid(),btrim(p_first_name),btrim(p_last_name),'adult');
 insert into private.household_creation_requests values(auth.uid(),p_request_id,hid);
 update public.profiles set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=auth.uid();
 return hid;
end;
$$;

create function private.create_household_invitation(p_household_id uuid,p_email text,p_token_hash text,p_participant_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 perform private.lock_household(p_household_id,true);
 if p_email is null or length(btrim(p_email))>254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
 raise exception using errcode='22023',message='Invalid invitation'; end if;
 if p_participant_id is not null and not exists(select 1 from public.household_members where id=p_participant_id and household_id=p_household_id and member_type='adult' and linked_user_id is null and archived_at is null) then
 raise exception using errcode='22023',message='Select an unlinked adult'; end if;
 insert into public.household_invitations(household_id,invited_email,token_hash,participant_id,created_by_user_id)
 values(p_household_id,lower(btrim(p_email)),p_token_hash,p_participant_id,auth.uid()) returning id into iid;
 return iid;
end;
$$;
create function private.revoke_household_invitation(p_household_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id,true);
 update public.household_invitations set revoked_at=coalesce(revoked_at,now()) where id=p_invitation_id and household_id=p_household_id and consumed_at is null;
 if not found then raise exception using errcode='22023',message='Invitation unavailable'; end if;
end;
$$;
create function private.accept_household_invitation(p_token_hash text,p_first_name text,p_last_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.household_invitations; hid uuid; mid uuid; caller_email text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 -- Lock household first, then invitation: all workflows share the same lock order.
 select household_id into hid from public.household_invitations where token_hash=p_token_hash;
 perform 1 from public.households where id=hid and archived_at is null for update;
 if not found then raise exception using errcode='22023',message='Invitation unavailable'; end if;
 select * into invitation from public.household_invitations where token_hash=p_token_hash for update;
 select lower(btrim(email)) into caller_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if invitation.revoked_at is not null or invitation.consumed_at is not null or invitation.expires_at<=now()
 or caller_email is null or caller_email<>invitation.invited_email then
 raise exception using errcode='22023',message='Invitation unavailable for this account'; end if;
 if exists(select 1 from public.household_access where household_id=hid and user_id=auth.uid()) then
 raise exception using errcode='22023',message='Already a household member'; end if;
 mid:=invitation.participant_id;
 if mid is not null and not exists(select 1 from public.household_members where id=mid and household_id=hid and member_type='adult' and linked_user_id is null and archived_at is null) then
 raise exception using errcode='22023',message='Invited participant is no longer available'; end if;
 perform private.complete_household_profile(p_first_name,p_last_name);
 insert into public.household_access(household_id,user_id,role) values(hid,auth.uid(),'member');
 if mid is null then
 insert into public.household_members(household_id,linked_user_id,first_name,last_name,member_type)
 values(hid,auth.uid(),btrim(p_first_name),btrim(p_last_name),'adult') returning id into mid;
 else update public.household_members set linked_user_id=auth.uid() where id=mid; end if;
 update public.household_invitations set consumed_at=now() where id=invitation.id;
 insert into public.household_invitation_redemptions(invitation_id,household_id,user_id,participant_id)
 values(invitation.id,hid,auth.uid(),mid);
 update public.profiles set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=auth.uid();
 return hid;
end;
$$;

create function private.promote_household_member(p_household_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id,true);
 update public.household_access set role='owner' where household_id=p_household_id and user_id=p_user_id and role='member';
 if not found then raise exception using errcode='22023',message='Select a Member'; end if;
end;
$$;
create function private.ensure_household_successor(p_household_id uuid,p_exclude_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare successor uuid;
begin
 if exists(select 1 from public.household_access where household_id=p_household_id and user_id<>p_exclude_user and role='owner') then return; end if;
 select user_id into successor from public.household_access where household_id=p_household_id and user_id<>p_exclude_user
 order by (role='admin'),created_at,user_id limit 1;
 if successor is null then raise exception using errcode='22023',message='The only account holder must remain Owner or leave'; end if;
 update public.household_access set role='owner' where household_id=p_household_id and user_id=successor;
end;
$$;
create function private.demote_household_owner(p_household_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id);
 if not exists(select 1 from public.household_access where household_id=p_household_id and user_id=auth.uid() and role='owner') then
 raise exception using errcode='42501',message='Only an Owner may step down'; end if;
 perform private.ensure_household_successor(p_household_id,auth.uid());
 update public.household_access set role='member' where household_id=p_household_id and user_id=auth.uid();
end;
$$;
create function private.disable_future_participation(p_member_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.ride_participation r set disabled_at=now(),mode='none',available_seats=null,max_detour_minutes=null
 from public.events e where r.member_id=p_member_id and r.event_id=e.id and r.disabled_at is null
 and (case when r.leg='to_event' then e.required_arrival_at else e.ready_to_depart_at end)>=now();
 update public.event_participation a set disabled_at=now(),status='not_going' from public.events e
 where a.member_id=p_member_id and a.event_id=e.id and a.disabled_at is null
 and greatest(e.required_arrival_at,e.ready_to_depart_at,e.activity_ends_at)>=now();
end;
$$;
create function private.archive_household_participant(p_household_id uuid,p_member_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id);
 perform 1 from public.household_members where id=p_member_id and household_id=p_household_id and archived_at is null and linked_user_id is null for update;
 if not found then raise exception using errcode='22023',message='Only unlinked active participants may be removed'; end if;
 perform private.disable_future_participation(p_member_id);
 update public.household_members set archived_at=now() where id=p_member_id;
end;
$$;
create function private.depart_household(p_household_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
 perform private.lock_household(p_household_id);
 if p_user_id<>auth.uid() then
 if not private.is_household_admin(p_household_id) or not exists(select 1 from public.household_access where household_id=p_household_id and user_id=p_user_id and role='member') then
 raise exception using errcode='42501',message='Owners can remove Members only'; end if;
 end if;
 if not exists(select 1 from public.household_access where household_id=p_household_id and user_id=p_user_id) then
 raise exception using errcode='22023',message='Account is not in this household'; end if;
 if exists(select 1 from public.household_access where household_id=p_household_id and user_id<>p_user_id) then
 perform private.ensure_household_successor(p_household_id,p_user_id);
 end if;
 for mid in select id from public.household_members where household_id=p_household_id and linked_user_id=p_user_id loop
 perform private.disable_future_participation(mid);
 update public.household_members set linked_user_id=null,archived_at=now() where id=mid;
 end loop;
 if not exists(select 1 from public.household_access where household_id=p_household_id and user_id<>p_user_id) then
 for mid in select id from public.household_members where household_id=p_household_id and archived_at is null loop
 perform private.disable_future_participation(mid);
 update public.household_members set archived_at=now() where id=mid;
 end loop;
 update public.group_memberships set status='left' where household_id=p_household_id and status='active';
 update public.household_invitations set revoked_at=coalesce(revoked_at,now()) where household_id=p_household_id and consumed_at is null;
 update public.households set archived_at=now() where id=p_household_id;
 end if;
 delete from public.household_access where household_id=p_household_id and user_id=p_user_id;
end;
$$;
create function private.leave_household(p_household_id uuid)
returns void language sql security definer set search_path='' as $$ select private.depart_household(p_household_id,auth.uid()); $$;
create function private.remove_household_member(p_household_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user_id is null or p_user_id=auth.uid() then raise exception using errcode='22023',message='Use Leave household for yourself'; end if;
 perform private.depart_household(p_household_id,p_user_id);
end;
$$;
-- Allow controlled ride validation to inspect private locations without
-- granting API roles access to that table. Authorize before privileged reads.
create or replace function private.validate_ride_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_household_id uuid;
  member_type_value text;
  event_group_id uuid;
  event_arrival timestamptz;
  event_departure timestamptz;
begin
  if new.disabled_at is not null then return new; end if;

  -- The trigger must inspect private locations, but may do so only for
  -- members the authenticated caller can manage. Owner/service-role fixture
  -- setup has no API role and retains normal privileged maintenance access.
  if current_setting('role', true) in ('anon', 'authenticated')
     and (auth.uid() is null or not private.can_manage_household_member(new.member_id))
  then
    raise exception using errcode = '42501',
      message = 'Household administrator access required';
  end if;

  -- Get household + member type.
  select
    hm.household_id,
    hm.member_type
  into
    member_household_id,
    member_type_value
  from public.household_members hm
  where hm.id = new.member_id;

  if member_household_id is null then
    raise exception 'Invalid household member';
  end if;


  -- Get event information.
  select
    e.group_id,
    e.required_arrival_at,
    e.ready_to_depart_at
  into
    event_group_id,
    event_arrival,
    event_departure
  from public.events e
  where e.id = new.event_id;

  if event_group_id is null then
    raise exception 'Invalid event';
  end if;


  -- Household must actively belong to the event's group.
  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = event_group_id
      and gm.household_id = member_household_id
      and gm.status = 'active'
  )
  then
    raise exception
      'Household must be an active member of the event group';
  end if;


  -- Member must be marked as attending.
  if not exists (
    select 1
    from public.event_participation ep
    where ep.event_id = new.event_id
      and ep.member_id = new.member_id
      and ep.status = 'going'
  )
  then
    raise exception
      'Member must be attending the event before configuring transportation';
  end if;


  -- Household location must belong to this member's household.
  if not exists (
    select 1
    from private.household_locations hl
    where hl.id = new.household_location_id
      and hl.household_id = member_household_id
  )
  then
    raise exception
      'Ride location must belong to the member household';
  end if;


  -- For MVP, only adults can offer to drive.
  if new.mode in ('can_drive', 'either')
     and member_type_value <> 'adult'
  then
    raise exception
      'Only adult household members can offer to drive';
  end if;


  -- Make sure the requested ride leg exists for this event.
  if new.leg = 'to_event'
     and event_arrival is null
  then
    raise exception
      'This event does not support transportation to the event';
  end if;


  if new.leg = 'from_event'
     and event_departure is null
  then
    raise exception
      'This event does not support transportation from the event';
  end if;


  return new;
end;
$$;

create or replace function private.validate_event_participation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.disabled_at is not null then return new; end if;

  if not exists (
    select 1
    from public.events e

    join public.group_memberships gm
      on gm.group_id = e.group_id
     and gm.status = 'active'

    join public.household_members hm
      on hm.household_id = gm.household_id

    where e.id = new.event_id
      and hm.id = new.member_id
      and hm.archived_at is null
      and exists(select 1 from public.households h where h.id=hm.household_id and h.archived_at is null)
  )
  then
    raise exception
      'Household member must belong to an active household in the event group';
  end if;

  return new;
end;
$$;



revoke all on function private.lock_household(uuid,boolean) from public, anon, authenticated;

revoke all on function private.guard_household_participant() from public, anon, authenticated;

revoke all on function private.check_household_owner() from public, anon, authenticated;

revoke all on function private.complete_household_profile(text,text) from public, anon, authenticated;

revoke all on function private.ensure_household_successor(uuid,uuid) from public, anon, authenticated;

revoke all on function private.disable_future_participation(uuid) from public, anon, authenticated;

revoke all on function private.depart_household(uuid,uuid) from public, anon, authenticated;

revoke all on function private.onboard_household(text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.onboard_household(text,text,text,uuid) to authenticated;
create function public.onboard_household(p_display_name text,p_first_name text,p_last_name text,p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$
 select private.onboard_household(p_display_name,p_first_name,p_last_name,p_request_id); $$;
revoke all on function public.onboard_household(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.onboard_household(text,text,text,uuid) to authenticated;

revoke all on function private.create_household_invitation(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.create_household_invitation(uuid,text,text,uuid) to authenticated;
create function public.create_household_invitation(p_household_id uuid,p_email text,p_token_hash text,p_participant_id uuid default null) returns uuid language sql security invoker set search_path='' as $$
 select private.create_household_invitation(p_household_id,p_email,p_token_hash,p_participant_id); $$;
revoke all on function public.create_household_invitation(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_household_invitation(uuid,text,text,uuid) to authenticated;

revoke all on function private.revoke_household_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function private.revoke_household_invitation(uuid,uuid) to authenticated;
create function public.revoke_household_invitation(p_household_id uuid,p_invitation_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.revoke_household_invitation(p_household_id,p_invitation_id); $$;
revoke all on function public.revoke_household_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_household_invitation(uuid,uuid) to authenticated;

revoke all on function private.accept_household_invitation(text,text,text) from public,anon,authenticated;
grant execute on function private.accept_household_invitation(text,text,text) to authenticated;
create function public.accept_household_invitation(p_token_hash text,p_first_name text,p_last_name text) returns uuid language sql security invoker set search_path='' as $$
 select private.accept_household_invitation(p_token_hash,p_first_name,p_last_name); $$;
revoke all on function public.accept_household_invitation(text,text,text) from public,anon,authenticated;
grant execute on function public.accept_household_invitation(text,text,text) to authenticated;

revoke all on function private.promote_household_member(uuid,uuid) from public,anon,authenticated;
grant execute on function private.promote_household_member(uuid,uuid) to authenticated;
create function public.promote_household_member(p_household_id uuid,p_user_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.promote_household_member(p_household_id,p_user_id); $$;
revoke all on function public.promote_household_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.promote_household_member(uuid,uuid) to authenticated;

revoke all on function private.demote_household_owner(uuid) from public,anon,authenticated;
grant execute on function private.demote_household_owner(uuid) to authenticated;
create function public.demote_household_owner(p_household_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.demote_household_owner(p_household_id); $$;
revoke all on function public.demote_household_owner(uuid) from public,anon,authenticated;
grant execute on function public.demote_household_owner(uuid) to authenticated;

revoke all on function private.archive_household_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function private.archive_household_participant(uuid,uuid) to authenticated;
create function public.archive_household_participant(p_household_id uuid,p_member_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.archive_household_participant(p_household_id,p_member_id); $$;
revoke all on function public.archive_household_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.archive_household_participant(uuid,uuid) to authenticated;

revoke all on function private.leave_household(uuid) from public,anon,authenticated;
grant execute on function private.leave_household(uuid) to authenticated;
create function public.leave_household(p_household_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.leave_household(p_household_id); $$;
revoke all on function public.leave_household(uuid) from public,anon,authenticated;
grant execute on function public.leave_household(uuid) to authenticated;

revoke all on function private.remove_household_member(uuid,uuid) from public,anon,authenticated;
grant execute on function private.remove_household_member(uuid,uuid) to authenticated;
create function public.remove_household_member(p_household_id uuid,p_user_id uuid) returns void language sql security invoker set search_path='' as $$
 select private.remove_household_member(p_household_id,p_user_id); $$;
revoke all on function public.remove_household_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_household_member(uuid,uuid) to authenticated;

-- Finish onboarding for preexisting account access without creating another household.
create function private.complete_household_onboarding(p_household_id uuid,p_first_name text,p_last_name text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_household(p_household_id);
 perform private.complete_household_profile(p_first_name,p_last_name);
 if not exists(select 1 from public.household_members where household_id=p_household_id and linked_user_id=auth.uid() and archived_at is null) then
 insert into public.household_members(household_id,linked_user_id,first_name,last_name,member_type)
 values(p_household_id,auth.uid(),btrim(p_first_name),btrim(p_last_name),'adult');
 end if;
 update public.profiles set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=auth.uid();
 return p_household_id;
end;
$$;
revoke all on function private.complete_household_onboarding(uuid,text,text) from public,anon,authenticated;
grant execute on function private.complete_household_onboarding(uuid,text,text) to authenticated;
create function public.complete_household_onboarding(p_household_id uuid,p_first_name text,p_last_name text)
returns uuid language sql security invoker set search_path='' as $$
 select private.complete_household_onboarding(p_household_id,p_first_name,p_last_name); $$;
revoke all on function public.complete_household_onboarding(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_household_onboarding(uuid,text,text) to authenticated;
