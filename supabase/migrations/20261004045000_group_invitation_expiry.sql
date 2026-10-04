-- Enforce uniform expiry while retaining the existing RPC signature.
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

  -- The legacy optional expiry argument cannot extend the new seven-day lifetime.
  if p_expires_at is not null and p_expires_at <> now() + interval '7 days' then
    raise exception using errcode='22023',message='New invitations expire after seven days';
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

