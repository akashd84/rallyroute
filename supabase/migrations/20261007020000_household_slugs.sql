-- Stable, globally unique URL slugs. UUIDs remain the relational identifiers.
alter table public.households add column slug text;
alter table public.households add constraint households_slug_key unique (slug);

create function private.allocate_household_slug(p_display_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  -- ASCII-only normalization, independent of locale and without transliteration.
  base := btrim(regexp_replace(translate(coalesce(p_display_name, ''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'household'; end if;
  if base = 'new' or base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    base := 'household-' || base;
  end if;
  base := rtrim(left(base, 80), '-');
  candidate := base;
  while exists (select 1 from public.households where slug = candidate) loop
    candidate := rtrim(left(base, 71), '-') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end loop;
  return candidate;
end;
$$;
revoke all on function private.allocate_household_slug(text) from public, anon, authenticated;

-- Migration order determines which duplicate receives the plain name.
do $$
declare g record;
begin
  for g in select id, display_name from public.households order by created_at, id loop
    update public.households set slug = private.allocate_household_slug(g.display_name) where id = g.id;
  end loop;
end;
$$;

set constraints all immediate;
alter table public.households alter column slug set not null;
alter table public.households add constraint households_slug_format check (
  length(slug) between 1 and 80
  and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and slug <> 'new'
  and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create function private.manage_household_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.slug := private.allocate_household_slug(new.display_name);
  elsif new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Household slugs cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.manage_household_slug() from public, anon, authenticated;
create trigger households_manage_slug before insert or update on public.households
  for each row execute function private.manage_household_slug();

-- Preserve UUID returns, onboarding request idempotency, and owner creation.
create or replace function private.create_household(
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_household_id uuid;
  current_user_id uuid;
  conflicting_constraint text;
  slug_attempt integer := 0;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  loop
    begin
  insert into public.households (
    display_name
  )
  values (
    nullif(trim(p_display_name), '')
  )
  returning id into new_household_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics conflicting_constraint = constraint_name;
      slug_attempt := slug_attempt + 1;
      if conflicting_constraint <> 'households_slug_key' or slug_attempt >= 10 then raise; end if;
    end;
  end loop;

  insert into public.household_access (
    household_id,
    user_id,
    role
  )
  values (
    new_household_id,
    current_user_id,
    'owner'
  );

  return new_household_id;
end;
$$;


