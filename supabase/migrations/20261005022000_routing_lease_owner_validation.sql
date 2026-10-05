-- Null tokens never represent an active lease owner.
create or replace function private.routing_request_finish(p_cache_key text,p_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.routing_request_leases; normalized_outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cache_key,3));
 select * into r from private.routing_request_leases where cache_key=p_cache_key for update;
 if not found or p_token is null or r.token is null or r.token is distinct from p_token or r.expires_at<=clock_timestamp() then return false;end if;
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
