-- =========================================================
-- RallyRoute Phase 0: Event RLS
-- =========================================================


-- =========================================================
-- Household-member authorization helpers
--
-- These avoid having event_participation policies query
-- household_members through its own RLS policies.
-- =========================================================

create or replace function private.can_access_household_member(
  target_member_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    join public.household_access ha
      on ha.household_id = hm.household_id
    where hm.id = target_member_id
      and ha.user_id = (select auth.uid())
  );
$$;


create or replace function private.can_manage_household_member(
  target_member_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    join public.household_access ha
      on ha.household_id = hm.household_id
    where hm.id = target_member_id
      and ha.user_id = (select auth.uid())
      and ha.role in ('owner', 'admin')
  );
$$;


revoke all on function private.can_access_household_member(uuid)
from public, anon, authenticated;

revoke all on function private.can_manage_household_member(uuid)
from public, anon, authenticated;

grant execute on function private.can_access_household_member(uuid)
to authenticated;

grant execute on function private.can_manage_household_member(uuid)
to authenticated;


-- =========================================================
-- EVENT SERIES GRANTS
-- =========================================================

revoke all on table public.event_series
from anon, authenticated;

grant select
on public.event_series
to authenticated;

grant insert (
  group_id,
  name,
  location_id,
  timezone,
  recurrence_rule,
  series_start_date,
  series_end_date,
  default_required_arrival_time,
  default_ready_to_depart_time,
  default_activity_start_time,
  default_activity_end_time,
  status,
  created_by_user_id
)
on public.event_series
to authenticated;

grant update (
  name,
  location_id,
  timezone,
  recurrence_rule,
  series_start_date,
  series_end_date,
  default_required_arrival_time,
  default_ready_to_depart_time,
  default_activity_start_time,
  default_activity_end_time,
  status
)
on public.event_series
to authenticated;

grant delete
on public.event_series
to authenticated;


-- =========================================================
-- EVENT SERIES RLS
-- =========================================================

create policy "event_series_select_group_member"
on public.event_series
for select
to authenticated
using (
  (select private.is_group_member(group_id))
  or
  (select private.is_group_admin(group_id))
);


create policy "event_series_insert_group_admin"
on public.event_series
for insert
to authenticated
with check (
  (select private.is_group_admin(group_id))
  and created_by_user_id = (select auth.uid())
);


create policy "event_series_update_group_admin"
on public.event_series
for update
to authenticated
using (
  (select private.is_group_admin(group_id))
)
with check (
  (select private.is_group_admin(group_id))
);


create policy "event_series_delete_group_admin"
on public.event_series
for delete
to authenticated
using (
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- EVENTS GRANTS
-- =========================================================

revoke all on table public.events
from anon, authenticated;

grant select
on public.events
to authenticated;

grant insert (
  group_id,
  event_series_id,
  name,
  location_id,
  required_arrival_at,
  ready_to_depart_at,
  activity_starts_at,
  activity_ends_at,
  status,
  created_by_user_id
)
on public.events
to authenticated;

grant update (
  event_series_id,
  name,
  location_id,
  required_arrival_at,
  ready_to_depart_at,
  activity_starts_at,
  activity_ends_at,
  status
)
on public.events
to authenticated;

grant delete
on public.events
to authenticated;


-- =========================================================
-- EVENTS RLS
-- =========================================================

create policy "events_select_group_member"
on public.events
for select
to authenticated
using (
  (select private.is_group_member(group_id))
  or
  (select private.is_group_admin(group_id))
);


create policy "events_insert_group_admin"
on public.events
for insert
to authenticated
with check (
  (select private.is_group_admin(group_id))
  and created_by_user_id = (select auth.uid())
);


create policy "events_update_group_admin"
on public.events
for update
to authenticated
using (
  (select private.is_group_admin(group_id))
)
with check (
  (select private.is_group_admin(group_id))
);


create policy "events_delete_group_admin"
on public.events
for delete
to authenticated
using (
  (select private.is_group_admin(group_id))
);


-- =========================================================
-- EVENT PARTICIPATION GRANTS
--
-- Attendance is NOT visible to the entire group.
-- Only users belonging to that member's household can see it.
-- =========================================================

revoke all on table public.event_participation
from anon, authenticated;

grant select
on public.event_participation
to authenticated;

grant insert (
  event_id,
  member_id,
  status
)
on public.event_participation
to authenticated;

grant update (
  status
)
on public.event_participation
to authenticated;

grant delete
on public.event_participation
to authenticated;


-- =========================================================
-- EVENT PARTICIPATION RLS
-- =========================================================

create policy "event_participation_select_household"
on public.event_participation
for select
to authenticated
using (
  (select private.can_access_household_member(member_id))
);


create policy "event_participation_insert_household_admin"
on public.event_participation
for insert
to authenticated
with check (
  (select private.can_manage_household_member(member_id))
);


create policy "event_participation_update_household_admin"
on public.event_participation
for update
to authenticated
using (
  (select private.can_manage_household_member(member_id))
)
with check (
  (select private.can_manage_household_member(member_id))
);


create policy "event_participation_delete_household_admin"
on public.event_participation
for delete
to authenticated
using (
  (select private.can_manage_household_member(member_id))
);
