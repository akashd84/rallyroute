-- Stable location slugs are unique only within their household. Exact addresses stay private.
alter table private.household_locations add column slug text;
alter table private.household_locations add constraint household_locations_household_slug_key unique (household_id, slug);

create function private.allocate_household_location_slug(p_household_id uuid, p_label text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  -- ASCII-only normalization, independent of locale and without transliteration.
  base := btrim(regexp_replace(translate(coalesce(p_label, ''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'location'; end if;
  if base = 'add' or base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    base := 'location-' || base;
  end if;
  base := rtrim(left(base, 80), '-');
  candidate := base;
  while exists (select 1 from private.household_locations where household_id=p_household_id and slug = candidate) loop
    candidate := rtrim(left(base, 71), '-') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end loop;
  return candidate;
end;
$$;
revoke all on function private.allocate_household_location_slug(uuid,text) from public, anon, authenticated;

-- Migration order determines which duplicate receives the plain name.
do $$
declare g record;
begin
  for g in select id, household_id, label from private.household_locations order by created_at, id loop
    update private.household_locations set slug = private.allocate_household_location_slug(g.household_id,g.label) where id = g.id;
  end loop;
end;
$$;

set constraints all immediate;
alter table private.household_locations alter column slug set not null;
alter table private.household_locations add constraint household_locations_slug_format check (
  length(slug) between 1 and 80
  and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and slug <> 'add'
  and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create function private.manage_household_location_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Controlled saves already lock this household; cover other insertion paths too.
    perform 1 from public.households where id=new.household_id for update;
    new.slug := private.allocate_household_location_slug(new.household_id,new.label);
  elsif new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Location slugs cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.manage_household_location_slug() from public, anon, authenticated;
create trigger household_locations_manage_slug before insert or update on private.household_locations
  for each row execute function private.manage_household_location_slug();


-- Keep the existing household-authorized projection; expose no coordinates.
create or replace function private.household_location_list(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_household(p_household_id,false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'slug',slug,'label',label,'address_line_1',address_line_1,
      'address_line_2',address_line_2,'city',city,'state_region',state_region,
      'postal_code',postal_code,'country_code',country_code,
      'coordinates_available',location is not null,
      'geocoding_attribution',geocoding_attribution,'revision',revision,
      'archived_at',archived_at
    ) order by created_at)
    from private.household_locations where household_id=p_household_id
  ),'[]'::jsonb);
end;
$$;

