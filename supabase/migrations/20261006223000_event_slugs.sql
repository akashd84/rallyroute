-- Concrete event URLs use stable slugs scoped to their group. UUIDs remain internal.
alter table public.events add column slug text;
alter table public.events add constraint events_group_slug_key unique (group_id, slug);

create function private.allocate_event_slug(p_group_id uuid, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare base text; candidate text;
begin
  -- Existing event and series workflows already take this group lock first.
  -- Taking it for every insert also serializes other insertion paths and avoids
  -- concurrent check/insert collisions without changing RPC idempotency.
  perform 1 from public.groups where id = p_group_id for update;
  base := btrim(regexp_replace(translate(p_name,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'event'; end if;
  if base in ('events','members','settings','invite','share','new')
    or base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    base := 'event-' || base;
  end if;
  base := rtrim(left(base, 80), '-');
  candidate := base;
  while exists (select 1 from public.events where group_id = p_group_id and slug = candidate) loop
    candidate := rtrim(left(base, 71), '-') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end loop;
  return candidate;
end;
$$;
revoke all on function private.allocate_event_slug(uuid,text) from public, anon, authenticated;

do $$
declare e record;
begin
  for e in select id, group_id, name from public.events order by created_at, id loop
    update public.events set slug = private.allocate_event_slug(e.group_id,e.name) where id = e.id;
  end loop;
end;
$$;
alter table public.events alter column slug set not null;
alter table public.events add constraint events_slug_format check (
  length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and slug not in ('events','members','settings','invite','share','new')
  and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
create function private.manage_event_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.slug := private.allocate_event_slug(new.group_id,new.name);
  elsif new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Event slugs cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.manage_event_slug() from public, anon, authenticated;
create trigger events_manage_slug before insert or update on public.events
  for each row execute function private.manage_event_slug();
