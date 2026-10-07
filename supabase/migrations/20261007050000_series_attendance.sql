-- Preview and commit share authorization and target resolution. No persistent defaults.
create function private.series_attendance(p_household_id uuid, p_member_id uuid, p_event_id uuid, p_status text, p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.events; item record; snapshot jsonb; total integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.lock_household(p_household_id,false);
 if not exists(select 1 from public.household_members where id=p_member_id and household_id=p_household_id and archived_at is null) then
  raise exception 'Participant unavailable' using errcode='42501'; end if;
 select * into source from public.events where id=p_event_id;
 if not found or source.event_series_id is null or not exists(select 1 from public.group_memberships where group_id=source.group_id and household_id=p_household_id and status='active') then
  raise exception 'Series unavailable' using errcode='42501'; end if;
 if p_status is null or p_status not in ('going','not_going','unknown') then raise exception 'Invalid attendance' using errcode='22023'; end if;
 -- Same series-before-events order as series replacement; household saves serialize first.
 perform 1 from public.event_series where id=source.event_series_id for update;
 perform 1 from public.events where event_series_id=source.event_series_id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by id),'[]'::jsonb)
 into snapshot from public.events where event_series_id=source.event_series_id and status='scheduled'
 and least(required_arrival_at,ready_to_depart_at)>clock_timestamp();
 total=jsonb_array_length(snapshot);
 if p_expected is null then return jsonb_build_object('count',total,'snapshot',snapshot); end if;
 if p_expected is distinct from snapshot then raise exception 'Occurrences changed' using errcode='40001'; end if;
 for item in select * from jsonb_to_recordset(snapshot) as x(id uuid,revision integer) order by id loop
  perform private.event_workflow('attendance',jsonb_build_object('householdId',p_household_id,'memberId',p_member_id,'eventId',item.id,'revision',item.revision,'status',p_status));
 end loop;
 return jsonb_build_object('count',total);
end $$;
revoke all on function private.series_attendance(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.series_attendance(uuid,uuid,uuid,text,jsonb) to authenticated;
create function public.series_attendance(p_household_id uuid,p_member_id uuid,p_event_id uuid,p_status text,p_expected jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.series_attendance(p_household_id,p_member_id,p_event_id,p_status,p_expected)
$$;
revoke all on function public.series_attendance(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.series_attendance(uuid,uuid,uuid,text,jsonb) to authenticated;
