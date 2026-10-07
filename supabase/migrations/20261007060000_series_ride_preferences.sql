-- One-time recurring ride updates. Concrete preferences remain the matching unit.
create function private.series_ride_preferences(p_data jsonb,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 hid uuid=(p_data->>'householdId')::uuid; mid uuid=(p_data->>'memberId')::uuid;
 eid uuid=(p_data->>'eventId')::uuid; source public.events; participant public.household_members;
 leg text=p_data->>'leg'; mode_value text=p_data->>'mode'; active_mode boolean;
 lid uuid=nullif(p_data->>'locationId','')::uuid; address_revision integer;
 earliest timestamptz=nullif(p_data->>'earliest','')::timestamptz;
 latest timestamptz=nullif(p_data->>'latest','')::timestamptz;
 source_anchor timestamptz; target_anchor timestamptz; snapshot jsonb; token text;
 batch jsonb; item record; total integer; eligible integer; cutoff timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.lock_household(hid,false);
 select * into participant from public.household_members where id=mid and household_id=hid and archived_at is null;
 if not found then raise exception 'Participant unavailable' using errcode='42501'; end if;
 select * into source from public.events where id=eid;
 if not found or source.event_series_id is null or not exists(select 1 from public.group_memberships where group_id=source.group_id and household_id=hid and status='active') then
  raise exception 'Series unavailable' using errcode='42501'; end if;
 perform 1 from public.event_series where id=source.event_series_id for update;
 perform 1 from public.events where event_series_id=source.event_series_id order by id for update;
 select * into source from public.events where id=eid;
 cutoff=clock_timestamp();
 source_anchor=case leg when 'to_event' then source.required_arrival_at when 'from_event' then source.ready_to_depart_at end;
 if source.revision is distinct from (p_data->>'revision')::integer then raise exception 'Stale source' using errcode='40001'; end if;
 if leg is null or leg not in ('to_event','from_event') or mode_value is null or mode_value not in ('need_ride','can_drive','either','self_transport','none')
 or source.status<>'scheduled' or source_anchor is null or source_anchor<=cutoff then raise exception 'Unavailable ride direction' using errcode='22023'; end if;
 if not exists(select 1 from public.event_participation where event_id=eid and member_id=mid and status='going' and disabled_at is null) then
  raise exception 'Attendance required' using errcode='22023'; end if;
 active_mode=mode_value in ('need_ride','can_drive','either');
 if active_mode then
  select revision into address_revision from private.household_locations where id=lid and household_id=hid and archived_at is null;
  if not found then raise exception 'Address unavailable' using errcode='42501'; end if;
  if earliest is null or latest is null or earliest>latest or (leg='to_event' and latest>source_anchor) or (leg='from_event' and earliest<source_anchor) then
   raise exception 'Invalid time window' using errcode='22023'; end if;
 end if;
 if mode_value in ('can_drive','either') and (participant.member_type<>'adult' or (p_data->>'seats') is null or (p_data->>'seats')::integer not between 1 and 20
 or (p_data->>'detour') is null or (p_data->>'detour')::integer not between 0 and 120) then raise exception 'Invalid driver preference' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'revision',e.revision,
  'eligible',coalesce(a.status='going' and a.disabled_at is null and case leg when 'to_event' then e.required_arrival_at else e.ready_to_depart_at end is not null,false),
  'attendance',a.status,'attendanceUpdatedAt',a.updated_at,'attendanceDisabledAt',a.disabled_at,'rideUpdatedAt',r.updated_at,'rideId',r.id) order by e.id),'[]'::jsonb)
 into batch from public.events e
 left join public.event_participation a on a.event_id=e.id and a.member_id=mid
 left join public.ride_participation r on r.event_id=e.id and r.member_id=mid and r.leg=leg
 where e.event_series_id=source.event_series_id and e.status='scheduled' and least(e.required_arrival_at,e.ready_to_depart_at)>cutoff;
 total=jsonb_array_length(batch);
 select count(*)::integer into eligible from jsonb_array_elements(batch) x where (x->>'eligible')::boolean;
 snapshot=jsonb_build_object('sourceRevision',source.revision,'sourceAnchor',source_anchor,'addressRevision',address_revision,'batch',batch);
 token=md5(snapshot::text);
 if p_expected is null then return jsonb_build_object('count',eligible,'skipped',total-eligible,'snapshot',token); end if;
 if p_expected is distinct from token then raise exception 'Occurrences changed' using errcode='40001'; end if;
 for item in select * from jsonb_to_recordset(batch) as x(id uuid,revision integer,eligible boolean) where x.eligible order by id loop
  select case leg when 'to_event' then required_arrival_at else ready_to_depart_at end into target_anchor from public.events where id=item.id;
  perform private.event_workflow('ride',p_data || jsonb_build_object('eventId',item.id,'revision',item.revision,
   'earliest',case when active_mode then target_anchor+(earliest-source_anchor) end,
   'latest',case when active_mode then target_anchor+(latest-source_anchor) end));
 end loop;
 return jsonb_build_object('count',eligible,'skipped',total-eligible);
end $$;
revoke all on function private.series_ride_preferences(jsonb,text) from public,anon;
grant execute on function private.series_ride_preferences(jsonb,text) to authenticated;
create function public.series_ride_preferences(p_data jsonb,p_expected text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.series_ride_preferences(p_data,p_expected)
$$;
revoke all on function public.series_ride_preferences(jsonb,text) from public,anon;
grant execute on function public.series_ride_preferences(jsonb,text) to authenticated;
