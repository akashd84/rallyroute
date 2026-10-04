-- Series operations serialize on the group, then lock concrete events by UUID.
create function private.series_workflow(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare gid uuid; sid uuid; previous public.event_series; chosen public.events; destination uuid;
 rid uuid; start_date date; end_date date; spec jsonb; batch jsonb; occurrence jsonb; day date;
 arrival timestamptz; departure timestamptz; prior_day date; item record; frequency text; interval_value integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 gid=(p_data->>'groupId')::uuid; rid=(p_data->>'requestId')::uuid;
 perform 1 from public.groups where id=gid for update;
 if not private.is_group_admin(gid) then raise exception 'Group administrator required' using errcode='42501'; end if;
 if rid is null then raise exception 'Request required' using errcode='22023'; end if;
 select id into sid from public.event_series where request_id=rid and created_by_user_id=auth.uid();
 if found then return sid; end if;
 spec=p_data->'spec'; batch=p_data->'occurrences';
 start_date=(spec->>'startDate')::date; end_date=(spec->>'endDate')::date;
 frequency=spec->>'frequency'; interval_value=(spec->>'interval')::integer;
 destination=(p_data->>'locationId')::uuid;
 if start_date is null or end_date is null or end_date<start_date or end_date-start_date>365
 or frequency not in ('daily','weekly','monthly') or frequency is null or interval_value is null or interval_value not between 1 and 366
 or jsonb_typeof(batch)<>'array' or jsonb_array_length(batch) not between 1 and 366
 or length(trim(coalesce(p_data->>'name','')))=0 or length(p_data->>'name')>100
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=spec->>'timezone')
 or not exists(select 1 from public.event_locations where id=destination and group_id=gid and archived_at is null)
 or coalesce(p_data->>'rule','') !~ ('^FREQ='||upper(frequency)||';') then raise exception 'Invalid series' using errcode='22023'; end if;
 if frequency='weekly' and (coalesce(jsonb_typeof(spec->'weekdays'),'')<>'array' or jsonb_array_length(spec->'weekdays') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(spec->'weekdays') d where d not in ('MO','TU','WE','TH','FR','SA','SU'))) then raise exception 'Weekdays required' using errcode='22023'; end if;
 if frequency='monthly' and (spec->>'monthlyMode' is null or (spec->>'monthlyMode'='day' and spec->>'monthDay' is null) or (spec->>'monthlyMode'='weekday' and (spec->>'ordinal' is null or coalesce(spec->>'weekday','') not in ('MO','TU','WE','TH','FR','SA','SU'))) or (spec->>'monthlyMode'='day' and (spec->>'monthDay')::integer not between 1 and 31)
 or (spec->>'monthlyMode'='weekday' and (spec->>'ordinal')::integer not in (-1,1,2,3,4,5))
 or spec->>'monthlyMode' not in ('day','weekday')) then raise exception 'Invalid monthly recurrence' using errcode='22023'; end if;
 -- Validate the entire batch before changing the predecessor. Original dates are strictly increasing.
 for occurrence in select value from jsonb_array_elements(batch) loop
  day=(occurrence->>'original_local_date')::date;
  arrival=(occurrence->>'required_arrival_at')::timestamptz; departure=(occurrence->>'ready_to_depart_at')::timestamptz;
  if day is null or day<start_date or day>end_date or (prior_day is not null and day<=prior_day)
   or (arrival is null and departure is null) or least(arrival,departure)<=now()
   or (arrival is not null and departure is not null and arrival>=departure)
   or (arrival is not null and ((arrival at time zone (spec->>'timezone'))::date<>day or (arrival at time zone (spec->>'timezone'))::time is distinct from nullif(spec->>'arrivalTime','')::time))
   or (departure is not null and (departure at time zone (spec->>'timezone'))::time is distinct from nullif(spec->>'departureTime','')::time)
   or (departure is not null and (departure at time zone (spec->>'timezone'))::date<>day+case when coalesce((spec->>'departureNextDay')::boolean,false) then 1 else 0 end)
   then raise exception 'Invalid concrete occurrence' using errcode='22023'; end if;
  if frequency='daily' and (day-start_date)%interval_value<>0 then raise exception 'Incorrect daily date' using errcode='22023'; end if;
  if frequency='weekly' and (not (spec->'weekdays' ? (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from day)::integer])
   or ((day-date_trunc('week',start_date::timestamp)::date)/7)%interval_value<>0) then raise exception 'Incorrect weekly date' using errcode='22023'; end if;
  if frequency='monthly' then
   if ((extract(year from day)::integer-extract(year from start_date)::integer)*12+extract(month from day)::integer-extract(month from start_date)::integer)%interval_value<>0 then raise exception 'Incorrect monthly interval' using errcode='22023'; end if;
   if spec->>'monthlyMode'='day' and extract(day from day)::integer<>(spec->>'monthDay')::integer then raise exception 'Incorrect calendar day' using errcode='22023'; end if;
   if spec->>'monthlyMode'='weekday' and ((array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from day)::integer]<>spec->>'weekday'
    or ((spec->>'ordinal')::integer=-1 and extract(month from day+7)=extract(month from day))
    or ((spec->>'ordinal')::integer<>-1 and ((extract(day from day)::integer-1)/7+1)<>(spec->>'ordinal')::integer)) then raise exception 'Incorrect ordinal weekday' using errcode='22023'; end if;
  end if;
  prior_day=day;
 end loop;
 if nullif(p_data->>'replaceEventId','') is not null then
  select * into chosen from public.events where id=(p_data->>'replaceEventId')::uuid and group_id=gid;
  if not found or chosen.event_series_id is null or chosen.original_local_date is null or chosen.original_local_date<>start_date
   or chosen.status<>'scheduled' or least(chosen.required_arrival_at,chosen.ready_to_depart_at)<=now() then raise exception 'Cannot replace this occurrence' using errcode='22023'; end if;
  select * into previous from public.event_series where id=chosen.event_series_id for update;
  if previous.revision<>(p_data->>'seriesRevision')::integer or p_data->>'seriesRevision' is null then raise exception 'Stale series' using errcode='40001'; end if;
  for item in select id from public.events where event_series_id=previous.id and original_local_date>=start_date order by id for update loop
   perform private.invalidate_event_rides(item.id,'superseded series');
   update public.events set status='cancelled',is_exception=true,revision=revision+1 where id=item.id and least(required_arrival_at,ready_to_depart_at)>now();
  end loop;
  update public.event_series set series_end_date=case when start_date>series_start_date then start_date-1 else series_end_date end,
   status=case when start_date<=series_start_date then 'inactive' else status end,revision=revision+1 where id=previous.id;
 end if;
 insert into public.event_series(group_id,name,location_id,timezone,recurrence_rule,series_start_date,series_end_date,
  default_required_arrival_time,default_ready_to_depart_time,created_by_user_id,request_id,recurrence_spec,departure_next_day,predecessor_series_id)
 values(gid,trim(p_data->>'name'),destination,spec->>'timezone',p_data->>'rule',start_date,end_date,
 nullif(spec->>'arrivalTime','')::time,nullif(spec->>'departureTime','')::time,auth.uid(),rid,spec,coalesce((spec->>'departureNextDay')::boolean,false),previous.id) returning id into sid;
 for occurrence in select value from jsonb_array_elements(batch) loop
  insert into public.events(group_id,event_series_id,name,location_id,timezone,required_arrival_at,ready_to_depart_at,original_local_date,created_by_user_id)
  values(gid,sid,trim(p_data->>'name'),destination,spec->>'timezone',(occurrence->>'required_arrival_at')::timestamptz,
   (occurrence->>'ready_to_depart_at')::timestamptz,(occurrence->>'original_local_date')::date,auth.uid());
 end loop;
 return sid;
end $$;
create function public.series_workflow(p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.series_workflow(p_data)$$;
revoke all on function private.series_workflow(jsonb),public.series_workflow(jsonb) from public,anon;
grant execute on function private.series_workflow(jsonb),public.series_workflow(jsonb) to authenticated;
