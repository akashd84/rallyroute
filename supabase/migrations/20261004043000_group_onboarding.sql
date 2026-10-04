-- Group onboarding: retain RLS, normalize new invitations, and serialize household joins.
create table private.group_creation_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 group_id uuid not null references public.groups(id) on delete cascade,
 primary key(user_id,request_id)
);
revoke all on private.group_creation_requests from public,anon,authenticated;
revoke select on public.group_invitations from authenticated;
grant select(id,group_id,invite_type,created_by_user_id,invited_email,status,max_uses,use_count,expires_at,created_at,updated_at)
 on public.group_invitations to authenticated;

create function private.validate_group_details()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.name is null or length(btrim(new.name)) not between 1 and 100
 or new.name !~ '[^[:space:]]' or length(coalesce(new.description,''))>1000 then
 raise exception using errcode='22023',message='Invalid group details'; end if;
 new.name:=btrim(new.name);
 new.description:=nullif(btrim(new.description),'');
 return new;
end;
$$;
revoke all on function private.validate_group_details() from public,anon,authenticated;
create trigger group_details_valid before insert or update on public.groups
 for each row execute function private.validate_group_details();
create or replace function private.create_group(
  p_household_id uuid,
  p_name text,
  p_group_type text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_group_id uuid;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_household_admin(p_household_id) then
    raise exception 'You cannot create a group for this household';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Group name is required';
  end if;

  perform private.lock_household(p_household_id,true);
  if p_group_type is null or lower(btrim(p_group_type)) not in ('school','camp','sports','workplace','club','community','other') then
    raise exception using errcode='22023',message='Invalid group type';
  end if;

  insert into public.groups (
    name,
    group_type,
    description,
    created_by_user_id
  )
  values (
    trim(p_name),
    lower(trim(p_group_type)),
    nullif(trim(p_description), ''),
    current_user_id
  )
  returning id into new_group_id;

  insert into public.group_admins (
    group_id,
    user_id,
    role
  )
  values (
    new_group_id,
    current_user_id,
    'owner'
  );

  insert into public.group_memberships (
    group_id,
    household_id,
    status
  )
  values (
    new_group_id,
    p_household_id,
    'active'
  );

  return new_group_id;
end;
$$;

create or replace function private.create_group_invitation(
  p_group_id uuid,
  p_invite_type text,
  p_token_hash text,
  p_invited_email text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_invitation_id uuid;
  normalized_type text;
  normalized_email text;
  effective_max_uses integer;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_group_admin(p_group_id) then
    raise exception 'Group administrator access required';
  end if;

  normalized_type := lower(trim(p_invite_type));

  if normalized_type is null or normalized_type not in ('direct', 'group_link') then
    raise exception 'Invalid invitation type';
  end if;

  if p_token_hash is null or btrim(p_token_hash) !~ '^[a-f0-9]{64}$' then
    raise exception 'Invitation token hash is required';
  end if;

  if normalized_type = 'direct' then

    normalized_email := lower(trim(p_invited_email));

    if normalized_email is null or length(normalized_email)>254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Direct invitations require an email address';
    end if;

    effective_max_uses := 1;

  else

    normalized_email := null;
    effective_max_uses := p_max_uses;

  end if;

  if effective_max_uses is not null
     and effective_max_uses <= 0 then
    raise exception 'Maximum uses must be greater than zero';
  end if;

  insert into public.group_invitations (
    group_id,
    invite_type,
    created_by_user_id,
    invited_email,
    token_hash,
    status,
    max_uses,
    expires_at
  )
  values (
    p_group_id,
    normalized_type,
    current_user_id,
    normalized_email,
    trim(p_token_hash),
    'active',
    effective_max_uses,
    now() + interval '7 days'
  )
  returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;

create or replace function private.redeem_group_invitation(
  p_token_hash text,
  p_household_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_email text;

  invitation_record public.group_invitations%rowtype;

  existing_membership_id uuid;
  existing_membership_status text;

  membership_id uuid;
  new_use_count integer;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_household_admin(p_household_id) then
    raise exception 'You cannot add this household to a group';
  end if;

  perform private.lock_household(p_household_id,true);

  select *
  into invitation_record
  from public.group_invitations
  where token_hash = trim(p_token_hash)
  for update;

  if not found then
    raise exception 'Invalid invitation';
  end if;

  if invitation_record.status <> 'active' then
    raise exception 'Invitation is no longer active';
  end if;

  if invitation_record.expires_at is not null
     and invitation_record.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;

  if invitation_record.max_uses is not null
     and invitation_record.use_count >= invitation_record.max_uses then
    raise exception 'Invitation has reached its usage limit';
  end if;


  -- Direct invites must be redeemed by the invited email address.

  if invitation_record.invite_type = 'direct' then

    select lower(btrim(email))
    into current_email
    from auth.users
    where id = current_user_id and email_confirmed_at is not null;

    if current_email is null
       or current_email <> lower(invitation_record.invited_email) then
      raise exception 'This invitation was issued to another email address';
    end if;

  end if;


  -- Check existing membership.

  select id, status
  into existing_membership_id, existing_membership_status
  from public.group_memberships
  where group_id = invitation_record.group_id
    and household_id = p_household_id
  for update;


  if found then

    if existing_membership_status = 'active' then
      raise exception 'Household is already a member of this group';

    elsif existing_membership_status = 'removed' then
      raise exception 'Household cannot rejoin this group using an invitation';

    elsif existing_membership_status = 'left' then

      update public.group_memberships
      set
        status = 'active',
        joined_at = now()
      where id = existing_membership_id;

      membership_id := existing_membership_id;

    end if;

  else

    insert into public.group_memberships (
      group_id,
      household_id,
      status
    )
    values (
      invitation_record.group_id,
      p_household_id,
      'active'
    )
    returning id into membership_id;

  end if;


  -- Record exactly which household used the invitation.

  insert into public.group_invitation_redemptions (
    invitation_id,
    user_id,
    household_id,
    group_membership_id
  )
  values (
    invitation_record.id,
    current_user_id,
    p_household_id,
    membership_id
  );


  new_use_count := invitation_record.use_count + 1;


  update public.group_invitations
  set
    use_count = new_use_count,
    status =
      case
        when max_uses is not null
         and new_use_count >= max_uses
        then 'exhausted'
        else status
      end
  where id = invitation_record.id;


  return membership_id;
end;
$$;


create function private.create_group_once(p_household_id uuid,p_name text,p_group_type text,p_request_id uuid,p_description text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare gid uuid;
begin
 perform private.lock_household(p_household_id,true);
 if p_request_id is null then raise exception using errcode='22023',message='Request identifier required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text,1));
 select group_id into gid from private.group_creation_requests where user_id=auth.uid() and request_id=p_request_id;
 if found then return gid; end if;
 gid:=private.create_group(p_household_id,p_name,p_group_type,p_description);
 insert into private.group_creation_requests values(auth.uid(),p_request_id,gid);
 return gid;
end;
$$;
create function private.preview_group_invitation(p_token_hash text)
returns table(group_id uuid,name text,group_type text,description text)
language plpgsql security definer set search_path='' as $$
declare invite public.group_invitations; email_value text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
 raise exception using errcode='22023',message='Invitation unavailable'; end if;
 select * into invite from public.group_invitations i where i.token_hash=p_token_hash;
 if not found or invite.status<>'active' or (invite.expires_at is not null and invite.expires_at<=now())
 or (invite.max_uses is not null and invite.use_count>=invite.max_uses) then
 raise exception using errcode='22023',message='Invitation unavailable'; end if;
 select lower(btrim(email)) into email_value from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if email_value is null or (invite.invite_type='direct' and email_value<>invite.invited_email) then
 raise exception using errcode='42501',message='Invitation unavailable for this account'; end if;
 return query select g.id,g.name,g.group_type,g.description from public.groups g where g.id=invite.group_id;
end;
$$;
create function private.revoke_group_invitation(p_group_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_group_admin(p_group_id) then
 raise exception using errcode='42501',message='Group administrator access required'; end if;
 update public.group_invitations set status='revoked' where id=p_invitation_id and group_id=p_group_id and status='active';
 if not found then raise exception using errcode='22023',message='Invitation unavailable'; end if;
end;
$$;

revoke all on function private.create_group_once(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function private.create_group_once(uuid,text,text,uuid,text) to authenticated;
create function public.create_group_once(p_household_id uuid,p_name text,p_group_type text,p_request_id uuid,p_description text default null) returns uuid language sql security invoker set search_path='' as $$
 select  private.create_group_once(p_household_id,p_name,p_group_type,p_request_id,p_description); $$;
revoke all on function public.create_group_once(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_group_once(uuid,text,text,uuid,text) to authenticated;

revoke all on function private.preview_group_invitation(text) from public,anon,authenticated;
grant execute on function private.preview_group_invitation(text) to authenticated;
create function public.preview_group_invitation(p_token_hash text) returns table(group_id uuid,name text,group_type text,description text) language sql security invoker set search_path='' as $$
 select * from private.preview_group_invitation(p_token_hash); $$;
revoke all on function public.preview_group_invitation(text) from public,anon,authenticated;
grant execute on function public.preview_group_invitation(text) to authenticated;

revoke all on function private.revoke_group_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function private.revoke_group_invitation(uuid,uuid) to authenticated;
create function public.revoke_group_invitation(p_group_id uuid,p_invitation_id uuid) returns void language sql security invoker set search_path='' as $$
 select  private.revoke_group_invitation(p_group_id,p_invitation_id); $$;
revoke all on function public.revoke_group_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_group_invitation(uuid,uuid) to authenticated;
