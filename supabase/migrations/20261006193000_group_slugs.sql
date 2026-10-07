-- Stable, globally unique URL slugs. UUIDs remain the relational identifiers.
alter table public.groups add column slug text;
alter table public.groups add constraint groups_slug_key unique (slug);

create function private.allocate_group_slug(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  -- ASCII-only normalization, independent of locale and without transliteration.
  base := btrim(regexp_replace(translate(p_name,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'group'; end if;
  if base = 'new' or base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    base := 'group-' || base;
  end if;
  base := rtrim(left(base, 80), '-');
  candidate := base;
  while exists (select 1 from public.groups where slug = candidate) loop
    candidate := rtrim(left(base, 71), '-') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end loop;
  return candidate;
end;
$$;
revoke all on function private.allocate_group_slug(text) from public, anon, authenticated;

-- Migration order determines which duplicate receives the plain name.
do $$
declare g record;
begin
  for g in select id, name from public.groups order by created_at, id loop
    update public.groups set slug = private.allocate_group_slug(g.name) where id = g.id;
  end loop;
end;
$$;

alter table public.groups alter column slug set not null;
alter table public.groups add constraint groups_slug_format check (
  length(slug) between 1 and 80
  and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and slug <> 'new'
  and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create function private.manage_group_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.slug := private.allocate_group_slug(new.name);
  elsif new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Group slugs cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.manage_group_slug() from public, anon, authenticated;
create trigger groups_manage_slug before insert or update on public.groups
  for each row execute function private.manage_group_slug();

-- Retry only the slug unique constraint; preserve authorization and idempotency.
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
  conflicting_constraint text;
  slug_attempt integer := 0;
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

  loop
    begin
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
      exit;
    exception when unique_violation then
      get stacked diagnostics conflicting_constraint = constraint_name;
      slug_attempt := slug_attempt + 1;
      if conflicting_constraint <> 'groups_slug_key' or slug_attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

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
