-- Publish cache entries only through the token-owning completion workflow.
-- The private helper remains callable by the SECURITY DEFINER owner of finish.
revoke execute on function public.routing_cache_put(text,text,jsonb) from service_role;
revoke execute on function private.routing_cache_put(text,text,jsonb) from service_role;
