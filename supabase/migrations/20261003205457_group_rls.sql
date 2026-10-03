-- =========================================================
-- RallyRoute Phase 0: Group RLS + Controlled Workflows
-- =========================================================


-- =========================================================
-- Group authorization helpers
-- =========================================================

create or replace function private.is_group_member(
  target_group_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_memberships gm
    join public.household_access ha
      on ha.household_id = gm.household_id
    where gm.group_id = target_group_id
      and gm.status = 'active'
      and ha.user_id = (select auth.uid())
  );
$$;


create or replace function private.is_group_admin(
  target_group_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_admins ga
    where ga.group_id = target_group_id
      and ga.user_id = (select auth.uid())
  );
$$;


create or replace function private.is_group_admin_for_invitation(
  target_invitation_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_invitations gi
    join public.group_admins ga
      on ga.group_id = gi.group_id
    where gi.id = target_invitation_id
      and ga.user_id = (select auth.uid())
  );
$$;


revoke all on function private.is_group_member(uuid)
  from public, anon, authenticated;

revoke all on function private.is_group_admin(uuid)
  from public, anon, authenticated;

revoke all on function private.is_group_admin_for_invitation(uuid)
  from public, anon, authenticated;

grant execute on function private.is_group_member(uuid)
  to authenticated;

grant execute on function private.is_group_admin(uuid)
  to authenticated;

grant execute on function private.is_group_admin_for_invitation(uuid)
  to authenticated;


-- =========================================================
-- Table grants
-- =========================================================

revoke all on table public.groups
  from anon, authenticated;

revoke all on table public.group_admins
  from anon, authenticated;

revoke all on table public.group_memberships
  from anon, authenticated;

revoke all on table public.group_invitations
  from anon, authenticated;

revoke all on table public.group_invitation_redemptions
  from anon, authenticated;


-- Groups

grant select on table public.groups
  to authenticated;

grant update (
  name,
  group_type,
  description
)
on public.groups
to authenticated;


-- Group admins

grant select on table public.group_admins
  to authenticated;


-- Group memberships

grant select on table public.group_memberships
  to authenticated;


-- Invitations

grant select on table public.group_invitations
  to authenticated;


-- Invitation redemptions

grant select on table public.group_invitation_redemptions
  to authenticated;


-- =========================================================
-- GROUPS RLS
-- =========================================================

create policy "groups_select_member_or_admin"
on public.groups
for select
to authenticated
using (
  (select private.is_group_member(id))
  or
  (select private.is_group_admin(id))
);


create policy "groups_update_admin"
on public.groups
for update
to authenticated
using (
  (select private.is_group_admin(id))
)
with check (
  (select private.is_group_admin(id))
);


-- =========================================================
-- GROUP ADMINS RLS
-- =========================================================

create policy "group_admins_select_group_member"
on public.group_admins
for select
to authenticated
using (
  (select private.is_group_member(group_id))
  or
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- GROUP MEMBERSHIPS RLS
-- =========================================================

create policy "group_memberships_select_group_member"
on public.group_memberships
for select
to authenticated
using (
  (select private.is_group_member(group_id))
  or
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- GROUP INVITATIONS RLS
--
-- Invitations are administrative records.
-- Normal group members do not need access.
-- =========================================================

create policy "group_invitations_select_admin"
on public.group_invitations
for select
to authenticated
using (
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- INVITATION REDEMPTIONS RLS
-- =========================================================

create policy "group_invitation_redemptions_select_own_or_admin"
on public.group_invitation_redemptions
for select
to authenticated
using (
  (select private.is_household_member(household_id))
  or
  (
    select private.is_group_admin_for_invitation(invitation_id)
  )
);


-- =========================================================
-- CREATE GROUP
--
-- User must be an admin/owner of the household they are
-- adding to the group.
-- =========================================================

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


revoke all on function private.create_group(
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function private.create_group(
  uuid,
  text,
  text,
  text
)
to authenticated;


create or replace function public.create_group(
  p_household_id uuid,
  p_name text,
  p_group_type text,
  p_description text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_group(
    p_household_id,
    p_name,
    p_group_type,
    p_description
  );
$$;


revoke all on function public.create_group(
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.create_group(
  uuid,
  text,
  text,
  text
)
to authenticated;


-- =========================================================
-- CREATE GROUP INVITATION
--
-- RallyRoute application code generates a cryptographically
-- random RAW token.
--
-- Only its SHA-256 hash is passed into and stored by the DB.
-- =========================================================

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

  if normalized_type not in ('direct', 'group_link') then
    raise exception 'Invalid invitation type';
  end if;

  if nullif(trim(p_token_hash), '') is null then
    raise exception 'Invitation token hash is required';
  end if;

  if normalized_type = 'direct' then

    normalized_email := lower(trim(p_invited_email));

    if nullif(normalized_email, '') is null then
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
    p_expires_at
  )
  returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;


revoke all on function private.create_group_invitation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  integer
)
from public, anon, authenticated;

grant execute on function private.create_group_invitation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  integer
)
to authenticated;


create or replace function public.create_group_invitation(
  p_group_id uuid,
  p_invite_type text,
  p_token_hash text,
  p_invited_email text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_group_invitation(
    p_group_id,
    p_invite_type,
    p_token_hash,
    p_invited_email,
    p_expires_at,
    p_max_uses
  );
$$;


revoke all on function public.create_group_invitation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  integer
)
from public, anon, authenticated;

grant execute on function public.create_group_invitation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  integer
)
to authenticated;


-- =========================================================
-- REDEEM GROUP INVITATION
--
-- Validates:
--   authentication
--   household authority
--   token
--   expiration
--   usage limits
--   direct-email matching
--
-- Then atomically:
--   creates/reactivates membership
--   records redemption
--   increments invite usage
-- =========================================================

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

    select lower(email)
    into current_email
    from auth.users
    where id = current_user_id;

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


revoke all on function private.redeem_group_invitation(
  text,
  uuid
)
from public, anon, authenticated;

grant execute on function private.redeem_group_invitation(
  text,
  uuid
)
to authenticated;


create or replace function public.redeem_group_invitation(
  p_token_hash text,
  p_household_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.redeem_group_invitation(
    p_token_hash,
    p_household_id
  );
$$;


revoke all on function public.redeem_group_invitation(
  text,
  uuid
)
from public, anon, authenticated;

grant execute on function public.redeem_group_invitation(
  text,
  uuid
)
to authenticated;
