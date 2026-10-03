-- =========================================================
-- RallyRoute Phase 0: Identity RLS
-- =========================================================

-- Private schema for authorization helper functions.
-- This schema is not exposed through the normal Supabase API.
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;


-- =========================================================
-- Authorization helpers
-- Security definer prevents recursive RLS checks against
-- household_access.
-- =========================================================

create or replace function private.is_household_member(
  target_household_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.household_access ha
    where ha.household_id = target_household_id
      and ha.user_id = (select auth.uid())
  );
$$;


create or replace function private.is_household_admin(
  target_household_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.household_access ha
    where ha.household_id = target_household_id
      and ha.user_id = (select auth.uid())
      and ha.role in ('owner', 'admin')
  );
$$;


revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.is_household_admin(uuid) from public;

grant execute on function private.is_household_member(uuid)
  to authenticated;

grant execute on function private.is_household_admin(uuid)
  to authenticated;


-- =========================================================
-- Profiles
-- =========================================================

revoke all on table public.profiles from anon, authenticated;

grant select on table public.profiles to authenticated;

grant update (
  first_name,
  last_name,
  phone,
  onboarding_completed_at
)
on public.profiles
to authenticated;


create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
);


create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
)
with check (
  id = (select auth.uid())
);


-- =========================================================
-- Households
-- Household creation happens through create_household()
-- rather than direct INSERT access.
-- =========================================================

revoke all on table public.households from anon, authenticated;

grant select on table public.households to authenticated;

grant update (display_name)
on public.households
to authenticated;


create policy "households_select_member"
on public.households
for select
to authenticated
using (
  (select private.is_household_member(id))
);


create policy "households_update_admin"
on public.households
for update
to authenticated
using (
  (select private.is_household_admin(id))
)
with check (
  (select private.is_household_admin(id))
);


-- =========================================================
-- Household Access
--
-- For Phase 0, authenticated users can view who has access
-- to their household, but cannot directly manipulate access.
-- Future invitation/account-linking workflows will do that
-- through controlled functions.
-- =========================================================

revoke all on table public.household_access from anon, authenticated;

grant select on table public.household_access to authenticated;


create policy "household_access_select_member"
on public.household_access
for select
to authenticated
using (
  (select private.is_household_member(household_id))
);


-- =========================================================
-- Household Members
-- =========================================================

revoke all on table public.household_members from anon, authenticated;

grant select
on public.household_members
to authenticated;

-- linked_user_id is intentionally NOT writable directly.
grant insert (
  household_id,
  first_name,
  last_name,
  member_type
)
on public.household_members
to authenticated;

grant update (
  first_name,
  last_name,
  member_type
)
on public.household_members
to authenticated;

grant delete
on public.household_members
to authenticated;


create policy "household_members_select_household"
on public.household_members
for select
to authenticated
using (
  (select private.is_household_member(household_id))
);


create policy "household_members_insert_admin"
on public.household_members
for insert
to authenticated
with check (
  (select private.is_household_admin(household_id))
);


create policy "household_members_update_admin"
on public.household_members
for update
to authenticated
using (
  (select private.is_household_admin(household_id))
)
with check (
  (select private.is_household_admin(household_id))
);


create policy "household_members_delete_admin"
on public.household_members
for delete
to authenticated
using (
  (select private.is_household_admin(household_id))
);


-- =========================================================
-- Atomic household creation
--
-- A user cannot simply INSERT arbitrary households and
-- memberships. This creates the household and immediately
-- makes the caller its owner.
-- =========================================================

create or replace function public.create_household(
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
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.households (
    display_name
  )
  values (
    nullif(trim(p_display_name), '')
  )
  returning id into new_household_id;

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


revoke all on function public.create_household(text) from public;

grant execute on function public.create_household(text)
to authenticated;
