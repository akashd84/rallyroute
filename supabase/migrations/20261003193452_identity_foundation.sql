-- =========================================================
-- RallyRoute Phase 0: Identity Foundation
-- =========================================================

-- Reusable updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================================================
-- Profiles
-- One profile per authenticated Supabase user
-- =========================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  first_name text,
  last_name text,
  phone text,

  onboarding_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- Automatically create a profile when a Supabase Auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'given_name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'family_name'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- =========================================================
-- Households
-- A household is the primary membership/transportation unit
-- =========================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),

  display_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
before update on public.households
for each row
execute function public.set_updated_at();


-- =========================================================
-- Household Access
-- Controls which authenticated users can manage a household
-- =========================================================

create table public.household_access (
  household_id uuid not null
    references public.households(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role text not null
    check (role in ('owner', 'admin', 'member')),

  created_at timestamptz not null default now(),

  primary key (household_id, user_id)
);

create index household_access_user_id_idx
  on public.household_access(user_id);


-- =========================================================
-- Household Members
-- People participating in transportation.
-- A member does NOT need to have a login.
-- =========================================================

create table public.household_members (
  id uuid primary key default gen_random_uuid(),

  household_id uuid not null
    references public.households(id)
    on delete cascade,

  -- Nullable because children or non-account adults may not log in
  linked_user_id uuid
    references auth.users(id)
    on delete set null,

  first_name text not null,
  last_name text,

  member_type text not null
    check (member_type in ('adult', 'child')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger household_members_set_updated_at
before update on public.household_members
for each row
execute function public.set_updated_at();

create index household_members_household_id_idx
  on public.household_members(household_id);

create unique index household_members_linked_user_unique_idx
  on public.household_members(household_id, linked_user_id)
  where linked_user_id is not null;


-- =========================================================
-- Enable Row Level Security
--
-- Policies will be added in a dedicated RLS migration.
-- Until then, browser clients cannot access these tables.
-- =========================================================

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_access enable row level security;
alter table public.household_members enable row level security;
