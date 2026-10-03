-- =========================================================
-- RallyRoute Phase 0: Group Foundation
-- =========================================================


-- =========================================================
-- Groups
-- A group defines the trust/matching boundary.
-- =========================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  group_type text not null
    check (
      group_type in (
        'school',
        'camp',
        'sports',
        'workplace',
        'club',
        'community',
        'other'
      )
    ),

  description text,

  created_by_user_id uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger groups_set_updated_at
before update on public.groups
for each row
execute function public.set_updated_at();


-- =========================================================
-- Group Admins
-- Administration belongs to authenticated users,
-- not entire households.
-- =========================================================

create table public.group_admins (
  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role text not null
    check (role in ('owner', 'admin')),

  created_at timestamptz not null default now(),

  primary key (group_id, user_id)
);

create index group_admins_user_id_idx
  on public.group_admins(user_id);


-- =========================================================
-- Group Memberships
-- Households join groups.
-- =========================================================

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  household_id uuid not null
    references public.households(id)
    on delete cascade,

  status text not null default 'active'
    check (status in ('active', 'left', 'removed')),

  joined_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (group_id, household_id)
);

create trigger group_memberships_set_updated_at
before update on public.group_memberships
for each row
execute function public.set_updated_at();

create index group_memberships_group_id_idx
  on public.group_memberships(group_id);

create index group_memberships_household_id_idx
  on public.group_memberships(household_id);


-- =========================================================
-- Group Invitations
--
-- token_hash contains the hash of the opaque invite token.
-- The raw token is never stored in the database.
-- =========================================================

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null
    references public.groups(id)
    on delete cascade,

  invite_type text not null
    check (invite_type in ('direct', 'group_link')),

  created_by_user_id uuid
    references auth.users(id)
    on delete set null,

  -- Required for direct invitations.
  -- Null for reusable group links.
  invited_email text,

  token_hash text not null unique,

  status text not null default 'active'
    check (status in ('active', 'revoked', 'exhausted')),

  -- Direct invitations will use 1.
  -- Group links may specify a limit or remain unlimited.
  max_uses integer,

  use_count integer not null default 0,

  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (max_uses is null or max_uses > 0),

  check (use_count >= 0),

  check (
    max_uses is null
    or use_count <= max_uses
  ),

  check (
    (
      invite_type = 'direct'
      and invited_email is not null
      and max_uses = 1
    )
    or
    (
      invite_type = 'group_link'
      and invited_email is null
    )
  )
);

create trigger group_invitations_set_updated_at
before update on public.group_invitations
for each row
execute function public.set_updated_at();

create index group_invitations_group_id_idx
  on public.group_invitations(group_id);

create index group_invitations_invited_email_idx
  on public.group_invitations(invited_email)
  where invited_email is not null;


-- =========================================================
-- Invitation Redemptions
--
-- Each successful use of an invitation is recorded here.
-- Especially important for reusable group links.
-- =========================================================

create table public.group_invitation_redemptions (
  id uuid primary key default gen_random_uuid(),

  invitation_id uuid not null
    references public.group_invitations(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  household_id uuid not null
    references public.households(id)
    on delete cascade,

  group_membership_id uuid
    references public.group_memberships(id)
    on delete set null,

  redeemed_at timestamptz not null default now(),

  unique (invitation_id, household_id)
);

create index group_invitation_redemptions_user_id_idx
  on public.group_invitation_redemptions(user_id);


-- =========================================================
-- Row Level Security
--
-- Enable RLS immediately. Policies come next.
-- =========================================================

alter table public.groups enable row level security;
alter table public.group_admins enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_invitation_redemptions enable row level security;
