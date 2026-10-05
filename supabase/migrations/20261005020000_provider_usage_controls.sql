-- Shared budgets and leases contain identifiers and normalized outcomes only.
create table private.provider_budgets (
 provider text not null, subject text not null,
 minute_started_at timestamptz not null, hour_started_at timestamptz not null,
 minute_count integer not null default 0, hour_count integer not null default 0,
 primary key(provider,subject)
);
create table private.provider_active_requests (
 token uuid primary key, provider text not null, expires_at timestamptz not null
);
create index provider_active_requests_expiry on private.provider_active_requests(provider,expires_at);
create table private.routing_request_leases (
 cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
 token uuid, expires_at timestamptz not null, outcome jsonb
);
alter table private.provider_budgets enable row level security;
alter table private.provider_active_requests enable row level security;
alter table private.routing_request_leases enable row level security;
revoke all on private.provider_budgets,private.provider_active_requests,private.routing_request_leases from public,anon,authenticated;

create function private.provider_budget_acquire(p_provider text,p_subject text,p_token uuid,
 p_minute_limit integer,p_hour_limit integer,p_concurrency integer,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.provider_budgets; t timestamptz; retry integer:=0;
begin
 if p_provider not in ('routing','geocoding') or p_provider is null or p_subject is null
  or length(p_subject)>100 or length(p_subject)=0
  or p_minute_limit is null or p_minute_limit not between 1 and 10000
  or p_hour_limit is null or p_hour_limit not between 1 and 100000
  or p_concurrency is null or p_concurrency not between 0 and 100
  or p_lease_seconds is null or p_lease_seconds not between 1 and 70
  or (p_provider='routing' and (p_subject<>'global' or p_concurrency=0 or p_token is null))
  or (p_provider='geocoding' and (p_concurrency<>0 or p_token is not null)) then
  raise exception 'Invalid provider budget' using errcode='22023';
 end if;
 t:=clock_timestamp();
 insert into private.provider_budgets(provider,subject,minute_started_at,hour_started_at)
 values(p_provider,p_subject,t,t) on conflict do nothing;
 select * into b from private.provider_budgets where provider=p_provider and subject=p_subject for update;
 t:=clock_timestamp();
 if t>=b.minute_started_at+interval '1 minute' then b.minute_started_at:=t;b.minute_count:=0;end if;
 if t>=b.hour_started_at+interval '1 hour' then b.hour_started_at:=t;b.hour_count:=0;end if;
 if b.minute_count>=p_minute_limit then retry:=ceil(extract(epoch from b.minute_started_at+interval '1 minute'-t));end if;
 if b.hour_count>=p_hour_limit then retry:=greatest(retry,ceil(extract(epoch from b.hour_started_at+interval '1 hour'-t))::integer);end if;
 delete from private.provider_active_requests where provider=p_provider and expires_at<=t;
 if p_concurrency>0 and (select count(*) from private.provider_active_requests where provider=p_provider)>=p_concurrency then
  retry:=greatest(retry,ceil(extract(epoch from (select min(expires_at) from private.provider_active_requests where provider=p_provider)-t))::integer);
 end if;
 if retry>0 then return jsonb_build_object('status','rate_limited','retryAfterSeconds',greatest(1,retry));end if;
 update private.provider_budgets set minute_started_at=b.minute_started_at,hour_started_at=b.hour_started_at,
 minute_count=b.minute_count+1,hour_count=b.hour_count+1 where provider=p_provider and subject=p_subject;
 if p_concurrency>0 then
  insert into private.provider_active_requests values(p_token,p_provider,t+make_interval(secs=>p_lease_seconds));
 end if;
 return jsonb_build_object('status','ok');
end $$;
create function public.provider_budget_acquire(p_provider text,p_subject text,p_token uuid,
 p_minute_limit integer,p_hour_limit integer,p_concurrency integer,p_lease_seconds integer)
returns jsonb language sql security invoker set search_path='' as $$
 select private.provider_budget_acquire(p_provider,p_subject,p_token,p_minute_limit,p_hour_limit,p_concurrency,p_lease_seconds)
$$;
create function private.provider_budget_release(p_token uuid)
returns void language sql security definer set search_path='' as $$
 delete from private.provider_active_requests where token=p_token
$$;
create function public.provider_budget_release(p_token uuid)
returns void language sql security invoker set search_path='' as $$ select private.provider_budget_release(p_token) $$;

create function private.routing_request_claim(p_cache_key text,p_token uuid,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.routing_request_leases; t timestamptz; cached jsonb;
begin
 if p_cache_key is null or p_cache_key !~ '^[a-f0-9]{64}$' or p_token is null
  or p_lease_seconds is null or p_lease_seconds not between 1 and 70 then
  raise exception 'Invalid routing lease' using errcode='22023';end if;
 -- A transaction advisory lock serializes initial insertion and cache publication.
 perform pg_advisory_xact_lock(hashtextextended(p_cache_key,3));
 t:=clock_timestamp();
 cached:=private.routing_cache_get(p_cache_key);
 if cached is not null then return jsonb_build_object('status','cached','result',cached);end if;
 select * into r from private.routing_request_leases where cache_key=p_cache_key for update;
 if found and r.expires_at>t then
  if r.outcome is not null then return jsonb_build_object('status','cached','result',r.outcome);end if;
  return jsonb_build_object('status','rate_limited','retryAfterSeconds',greatest(1,ceil(extract(epoch from r.expires_at-t))::integer));
 end if;
 insert into private.routing_request_leases(cache_key,token,expires_at,outcome)
 values(p_cache_key,p_token,t+make_interval(secs=>p_lease_seconds),null)
 on conflict(cache_key) do update set token=excluded.token,expires_at=excluded.expires_at,outcome=null;
 return jsonb_build_object('status','ok');
end $$;
create function public.routing_request_claim(p_cache_key text,p_token uuid,p_lease_seconds integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.routing_request_claim(p_cache_key,p_token,p_lease_seconds) $$;

create function private.routing_request_finish(p_cache_key text,p_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.routing_request_leases; normalized_outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cache_key,3));
 select * into r from private.routing_request_leases where cache_key=p_cache_key for update;
 if not found or r.token is distinct from p_token or r.expires_at<=clock_timestamp() then return false;end if;
 if p_result is null then delete from private.routing_request_leases where cache_key=p_cache_key;return true;end if;
 if p_result->>'status'='ok' then
  -- Whitelist fields; never persist provider bodies or route geometry.
  normalized_outcome:=jsonb_build_object('status','ok','durationSeconds',p_result->'durationSeconds','distanceMeters',p_result->'distanceMeters');
  perform private.routing_cache_put(p_cache_key,'valhalla',normalized_outcome);
  delete from private.routing_request_leases where cache_key=p_cache_key;
 elsif p_result->>'status'='unreachable' and p_result->>'reason' in ('no_route','outside_coverage') then
  normalized_outcome:=jsonb_build_object('status','unreachable','reason',p_result->>'reason');
  update private.routing_request_leases set token=null,outcome=normalized_outcome,expires_at=clock_timestamp()+interval '5 minutes' where cache_key=p_cache_key;
 elsif p_result->>'status'='error' and p_result->>'code' in ('timeout','network','http','rate_limited','invalid_response') then
  normalized_outcome:=jsonb_build_object('status','error','code',p_result->>'code','message','Routing is temporarily unavailable. Please try again.','retryAfterSeconds',30);
  update private.routing_request_leases set token=null,outcome=normalized_outcome,expires_at=clock_timestamp()+interval '30 seconds' where cache_key=p_cache_key;
 else
  delete from private.routing_request_leases where cache_key=p_cache_key;
 end if;
 return true;
end $$;
create function public.routing_request_finish(p_cache_key text,p_token uuid,p_result jsonb)
returns boolean language sql security invoker set search_path='' as $$ select private.routing_request_finish(p_cache_key,p_token,p_result) $$;
-- All privileged implementations are private; public functions are invoker wrappers.
do $$ declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in
 ('provider_budget_acquire','provider_budget_release','routing_request_claim','routing_request_finish') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
 execute format('grant execute on function %I.%I(%s) to service_role',f.nspname,f.proname,f.args);
 end loop;
end $$;
