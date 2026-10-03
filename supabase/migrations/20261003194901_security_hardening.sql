-- =========================================================
-- RallyRoute Phase 0: Security Hardening
-- =========================================================

-- Move internal trigger/helper functions out of the
-- API-exposed public schema.
alter function public.set_updated_at()
  set schema private;

alter function public.handle_new_user()
  set schema private;

-- Existing triggers continue referencing these functions
-- after the schema move.

revoke all on function private.set_updated_at()
  from public, anon, authenticated;

revoke all on function private.handle_new_user()
  from public, anon, authenticated;


-- =========================================================
-- Move privileged household creation logic to private
-- =========================================================

alter function public.create_household(text)
  set schema private;

revoke all on function private.create_household(text)
  from public, anon, authenticated;

grant execute on function private.create_household(text)
  to authenticated;


-- =========================================================
-- Expose only a SECURITY INVOKER wrapper through the API.
-- The privileged implementation remains in private.
-- =========================================================

create function public.create_household(
  p_display_name text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_household(p_display_name);
$$;

revoke all on function public.create_household(text)
  from public, anon, authenticated;

grant execute on function public.create_household(text)
  to authenticated;


-- =========================================================
-- Future public functions should not automatically become
-- executable by API roles.
-- Explicit grants will be required.
-- =========================================================

alter default privileges in schema public
  revoke execute on functions from public;

alter default privileges in schema public
  revoke execute on functions from anon;

alter default privileges in schema public
  revoke execute on functions from authenticated;
