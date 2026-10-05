-- Optional arguments are represented as optional fields by generated client types.
create or replace function public.authorize_location_geocoding(
 p_kind text,p_parent_id uuid,p_location_id uuid default null,p_revision integer default null
) returns boolean language sql security invoker set search_path='' as $$
 select private.authorize_location_geocoding(p_kind,p_parent_id,p_location_id,p_revision)
$$;
create or replace function public.provider_budget_acquire(p_provider text,p_subject text,p_token uuid default null,
 p_minute_limit integer default 10,p_hour_limit integer default 50,p_concurrency integer default 0,p_lease_seconds integer default 18)
returns jsonb language sql security invoker set search_path='' as $$
 select private.provider_budget_acquire(p_provider,p_subject,p_token,p_minute_limit,p_hour_limit,p_concurrency,p_lease_seconds)
$$;
