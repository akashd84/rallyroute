-- Agreed, two-household carpools. Raw selections stay behind controlled projections.
create table public.carpools (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.household_connections(id) on delete cascade,
 group_id uuid not null references public.groups(id) on delete cascade,
 requester_household_id uuid not null references public.households(id) on delete cascade,
 recipient_household_id uuid not null references public.households(id) on delete cascade,
 request_id uuid not null unique,
 status text not null default 'pending' check (status in ('pending','accepted','declined','closed')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 accepted_at timestamptz, closed_at timestamptz,
 check(requester_household_id<>recipient_household_id)
);
create unique index carpools_active_connection on public.carpools(connection_id) where status in ('pending','accepted');
create index carpools_requester on public.carpools(requester_household_id);
create index carpools_recipient on public.carpools(recipient_household_id);
alter table public.carpools enable row level security;
revoke all on public.carpools from public,anon,authenticated;
grant select on public.carpools to authenticated;
create policy carpools_household_read on public.carpools for select to authenticated using
 (private.is_household_member(requester_household_id) or private.is_household_member(recipient_household_id));

create table private.carpool_households (
 carpool_id uuid not null references public.carpools(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 accepted_at timestamptz,
 primary key(carpool_id,household_id)
);
create table private.carpool_rides (
 id uuid primary key default gen_random_uuid(),
 carpool_id uuid not null references public.carpools(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 leg text not null check(leg in ('to_event','from_event')),
 request_id uuid not null unique,
 driver_member_id uuid references public.household_members(id) on delete set null,
 driver_household_id uuid references public.households(id) on delete set null,
 available_seats smallint check(available_seats between 1 and 20),
 anchor_at timestamptz not null,
 event_revision integer not null,
 status text not null default 'proposed' check(status in ('proposed','confirmed','needs_review','canceled')),
 revision integer not null default 1,
 reason text,
 created_at timestamptz not null default now()
);
create unique index carpool_rides_active_leg on private.carpool_rides(carpool_id,event_id,leg) where status<>'canceled';
create index carpool_rides_event on private.carpool_rides(event_id);
create table private.carpool_participants (
 ride_id uuid not null references private.carpool_rides(id) on delete cascade,
 member_id uuid not null references public.household_members(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 display_name text not null,
 role text not null check(role in ('driver','rider')),
 primary key(ride_id,member_id)
);
create index carpool_participants_member on private.carpool_participants(member_id);
create table private.carpool_approvals (
 ride_id uuid not null references private.carpool_rides(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 revision integer not null,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz not null default now(),
 primary key(ride_id,household_id)
);
-- A database unique key, rather than a check-then-write, arbitrates competing confirmations.
create table private.carpool_assignments (
 ride_id uuid not null references private.carpool_rides(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 member_id uuid not null references public.household_members(id) on delete cascade,
 leg text not null check(leg in ('to_event','from_event')),
 primary key(event_id,leg,member_id)
);
alter table private.carpool_households enable row level security;
alter table private.carpool_rides enable row level security;
alter table private.carpool_participants enable row level security;
alter table private.carpool_approvals enable row level security;
alter table private.carpool_assignments enable row level security;
revoke all on private.carpool_households,private.carpool_rides,private.carpool_participants,private.carpool_approvals,private.carpool_assignments from public,anon,authenticated;

create function private.carpool_valid(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.carpools c join public.household_connections x on x.id=c.connection_id
 where c.id=p_id and c.status in ('pending','accepted') and x.status='accepted' and private.connection_valid(x.id))
$$;
create function private.carpool_ride_valid(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.carpool_rides r join public.carpools c on c.id=r.carpool_id
 join public.events e on e.id=r.event_id
 where r.id=p_id and c.status='accepted' and private.carpool_valid(c.id)
 and e.status='scheduled' and e.group_id=c.group_id and e.revision=r.event_revision
 and r.driver_member_id is not null and r.available_seats between 1 and 20
 and r.driver_household_id in (c.requester_household_id,c.recipient_household_id)
 and exists(select 1 from private.carpool_participants p join public.household_members m on m.id=p.member_id
 where p.ride_id=r.id and p.member_id=r.driver_member_id and p.role='driver'
 and p.household_id=r.driver_household_id and m.member_type='adult')
 and (select count(*) from private.carpool_participants p where p.ride_id=r.id and p.role='rider') between 1 and r.available_seats
 and (select count(*) from private.carpool_participants p where p.ride_id=r.id and p.role='driver')=1
 and not exists(select 1 from private.carpool_participants p left join public.household_members m on m.id=p.member_id
 where p.ride_id=r.id and (m.id is null or m.archived_at is not null or m.household_id<>p.household_id
 or p.household_id not in (c.requester_household_id,c.recipient_household_id)
 or not exists(select 1 from public.event_participation a where a.event_id=r.event_id and a.member_id=p.member_id and a.status='going'))))
$$;
create function private.invalidate_carpool_ride(p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.carpool_rides set status=p_status,reason=p_reason,revision=revision+1 where id=p_id and status<>'canceled';
 delete from private.carpool_approvals where ride_id=p_id;
 delete from private.carpool_assignments where ride_id=p_id;
end $$;
create function private.refresh_carpool(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not private.carpool_valid(p_id) then
  update public.carpools set status='closed',closed_at=now(),revision=revision+1 where id=p_id and status in ('pending','accepted');
  for r in select id from private.carpool_rides where carpool_id=p_id and anchor_at>now() and status<>'canceled' order by id for update loop
   perform private.invalidate_carpool_ride(r.id,'canceled','Carpool closed');
  end loop;
 else
  for r in select id from private.carpool_rides where carpool_id=p_id and anchor_at>now() and status='confirmed' and not private.carpool_ride_valid(id) order by id for update loop
   perform private.invalidate_carpool_ride(r.id,'needs_review','Ride eligibility changed; review and approve again');
  end loop;
 end if;
end $$;

create function private.carpool_action(p_command text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; cid uuid; rid uuid; x public.household_connections; c public.carpools;
 r private.carpool_rides; e public.events; mid uuid; members uuid[]; target text; requested uuid; agreed timestamptz;
begin
 hid=(p_data->>'householdId')::uuid;
 if not private.connection_household_access(auth.uid(),hid) then return jsonb_build_object('status','unavailable'); end if;
 if p_command='create' then
  requested=(p_data->>'requestId')::uuid;
  select * into x from public.household_connections where id=(p_data->>'connectionId')::uuid;
 else
  select * into c from public.carpools where id=(p_data->>'carpoolId')::uuid;
  select * into x from public.household_connections where id=c.connection_id;
 end if;
 if x.id is null or hid not in (x.requester_household_id,x.recipient_household_id) then return jsonb_build_object('status','unavailable'); end if;
 perform 1 from public.households where id in (x.requester_household_id,x.recipient_household_id) order by id for update;
 select * into x from public.household_connections where id=x.id for update;
 if not private.connection_household_access(auth.uid(),hid) then return jsonb_build_object('status','unavailable'); end if;
 if p_command='create' then
  if p_data->>'consent' is distinct from 'yes' or requested is null then return jsonb_build_object('status','invalid'); end if;
  if x.status<>'accepted' or not private.connection_valid(x.id) then return jsonb_build_object('status','unavailable'); end if;
  select * into c from public.carpools where request_id=requested;
  if c.id is not null then
   if c.connection_id<>x.id or c.requester_household_id<>hid then return jsonb_build_object('status','conflict'); end if;
   return jsonb_build_object('status','existing','id',c.id);
  end if;
  select * into c from public.carpools where connection_id=x.id and status in ('pending','accepted');
  if c.id is not null then return jsonb_build_object('status','existing','id',c.id); end if;
  insert into public.carpools(connection_id,group_id,requester_household_id,recipient_household_id,request_id)
  values(x.id,x.group_id,hid,case when hid=x.requester_household_id then x.recipient_household_id else x.requester_household_id end,requested) returning * into c;
  insert into private.carpool_households(carpool_id,household_id,accepted_at) values(c.id,c.requester_household_id,now()),(c.id,c.recipient_household_id,null);
  return jsonb_build_object('status','ok','id',c.id);
 end if;
 select * into c from public.carpools where id=c.id for update;
 perform private.refresh_carpool(c.id);
 select * into c from public.carpools where id=c.id;
 cid=c.id;
 if cid is null then return jsonb_build_object('status','unavailable'); end if;
 if p_command in ('accept','decline','close') then
  if p_command in ('accept','decline') and hid<>c.recipient_household_id then return jsonb_build_object('status','unavailable'); end if;
  if p_command='accept' and p_data->>'consent' is distinct from 'yes' then return jsonb_build_object('status','invalid'); end if;
  target=case p_command when 'accept' then 'accepted' when 'decline' then 'declined' else 'closed' end;
  if c.status=target then return jsonb_build_object('status','ok','id',cid); end if;
  if c.revision is distinct from (p_data->>'revision')::integer or not private.carpool_valid(cid)
   or (p_command in ('accept','decline') and c.status<>'pending') then return jsonb_build_object('status','conflict'); end if;
  update public.carpools set status=target,revision=revision+1,accepted_at=case when target='accepted' then now() else accepted_at end,
   closed_at=case when target<>'accepted' then now() else null end where id=cid;
  if target='accepted' then update private.carpool_households set accepted_at=now() where carpool_id=cid and household_id=hid;
  else perform private.refresh_carpool(cid); end if;
  return jsonb_build_object('status','ok','id',cid);
 end if;
 if c.status<>'accepted' or not private.carpool_valid(cid) then return jsonb_build_object('status','unavailable'); end if;
 if p_command='propose' then
  select * into e from public.events where id=(p_data->>'eventId')::uuid for share;
 else
  select * into r from private.carpool_rides where id=(p_data->>'rideId')::uuid and carpool_id=cid;
  select * into e from public.events where id=r.event_id for share;
 end if;
 if e.id is null or e.group_id<>c.group_id then return jsonb_build_object('status','unavailable'); end if;
 if p_command='propose' then
  if p_data->>'consent' is distinct from 'yes' or p_data->>'leg' is null or p_data->>'leg' not in ('to_event','from_event') or p_data->>'requestId' is null then return jsonb_build_object('status','invalid'); end if;
  agreed=(p_data->>'anchorAt')::timestamptz;
  if e.status<>'scheduled' or e.revision is distinct from (p_data->>'eventRevision')::integer or agreed is null or agreed<=now()
   or coalesce(case when p_data->>'leg'='to_event' then e.required_arrival_at else e.ready_to_depart_at end,now())<=now() then return jsonb_build_object('status','conflict'); end if;
  select * into r from private.carpool_rides where request_id=(p_data->>'requestId')::uuid;
  if r.id is not null then
   if r.carpool_id<>cid or r.event_id<>e.id or r.leg<>p_data->>'leg' then return jsonb_build_object('status','conflict'); end if;
   return jsonb_build_object('status','existing','id',cid);
  end if;
  if exists(select 1 from private.carpool_rides where carpool_id=cid and event_id=e.id and leg=p_data->>'leg' and status<>'canceled') then return jsonb_build_object('status','conflict'); end if;
  insert into private.carpool_rides(carpool_id,event_id,leg,request_id,anchor_at,event_revision)
   values(cid,e.id,p_data->>'leg',(p_data->>'requestId')::uuid,agreed,e.revision);
  return jsonb_build_object('status','ok','id',cid);
 end if;
 select * into r from private.carpool_rides where id=r.id for update;
 rid=r.id;
 if rid is null then return jsonb_build_object('status','unavailable'); end if;
 if p_command='cancel' and r.status='canceled' then return jsonb_build_object('status','ok','id',cid); end if;
 if r.revision is distinct from (p_data->>'revision')::integer or r.status='canceled' or r.anchor_at<=now() then return jsonb_build_object('status','conflict'); end if;
 if p_command='cancel' then
  perform private.invalidate_carpool_ride(rid,'canceled','Canceled by a participating household');
  return jsonb_build_object('status','ok','id',cid);
 end if;
 if e.status<>'scheduled' or coalesce(case when r.leg='to_event' then e.required_arrival_at else e.ready_to_depart_at end,now())<=now() then return jsonb_build_object('status','conflict'); end if;
 if p_data->>'consent' is distinct from 'yes' then return jsonb_build_object('status','invalid'); end if;
 if p_command='approve' then
  if not private.carpool_ride_valid(rid) then return jsonb_build_object('status','invalid_ride'); end if;
  -- Confirmation/approval is atomic, including uniqueness failure; preserve any prior approval.
  begin
   insert into private.carpool_approvals(ride_id,household_id,revision,approved_by) values(rid,hid,r.revision,auth.uid())
    on conflict(ride_id,household_id) do update set revision=excluded.revision,approved_by=excluded.approved_by,approved_at=now();
   if (select count(*) from private.carpool_approvals where ride_id=rid and revision=r.revision)=2 and r.status<>'confirmed' then
    insert into private.carpool_assignments(ride_id,event_id,member_id,leg)
     select rid,r.event_id,p.member_id,r.leg from private.carpool_participants p where p.ride_id=rid order by p.member_id;
    update private.carpool_rides set status='confirmed',reason=null where id=rid;
   end if;
  exception when unique_violation then return jsonb_build_object('status','assignment_conflict'); end;
  return jsonb_build_object('status','ok','id',cid);
 elsif p_command='participants' then
  if jsonb_typeof(p_data->'memberIds') is distinct from 'array' then return jsonb_build_object('status','invalid'); end if;
  select coalesce(array_agg(value::uuid),array[]::uuid[]) into members from jsonb_array_elements_text(p_data->'memberIds');
  if cardinality(members)>21 or cardinality(members)<>(select count(distinct v) from unnest(members) v)
   or exists(select 1 from unnest(members) v where not exists(select 1 from public.household_members m
    join public.event_participation a on a.member_id=m.id and a.event_id=e.id and a.status='going'
    where m.id=v and m.household_id=hid and m.archived_at is null)) then return jsonb_build_object('status','invalid_ride'); end if;
  if r.driver_household_id=hid and not (r.driver_member_id=any(members)) then return jsonb_build_object('status','invalid_ride'); end if;
  delete from private.carpool_participants where ride_id=rid and household_id=hid;
  insert into private.carpool_participants(ride_id,member_id,household_id,display_name,role)
   select rid,m.id,hid,concat_ws(' ',m.first_name,m.last_name),case when m.id=r.driver_member_id then 'driver' else 'rider' end
   from public.household_members m where m.id=any(members);
 elsif p_command='driver' then
  mid=(p_data->>'driverMemberId')::uuid;
  if r.driver_household_id is not null and r.driver_household_id<>hid then return jsonb_build_object('status','unavailable'); end if;
  if mid is null or (p_data->>'availableSeats')::integer is null or (p_data->>'availableSeats')::integer not between 1 and 20
   or not exists(select 1 from public.household_members m join public.event_participation a on a.member_id=m.id
    where m.id=mid and m.household_id=hid and m.archived_at is null and m.member_type='adult' and a.event_id=e.id and a.status='going') then return jsonb_build_object('status','invalid_ride'); end if;
  update private.carpool_participants set role='rider' where ride_id=rid and role='driver';
  insert into private.carpool_participants(ride_id,member_id,household_id,display_name,role)
   select rid,m.id,hid,concat_ws(' ',m.first_name,m.last_name),'driver' from public.household_members m where m.id=mid
   on conflict(ride_id,member_id) do update set role='driver',display_name=excluded.display_name;
  update private.carpool_rides set driver_member_id=mid,driver_household_id=hid,available_seats=(p_data->>'availableSeats')::smallint where id=rid;
 elsif p_command='clear_driver' then
  if r.driver_household_id is distinct from hid then return jsonb_build_object('status','unavailable'); end if;
  update private.carpool_participants set role='rider' where ride_id=rid and role='driver';
  update private.carpool_rides set driver_member_id=null,driver_household_id=null,available_seats=null where id=rid;
 elsif p_command='time' then
  agreed=(p_data->>'anchorAt')::timestamptz;
  if agreed is null or agreed<=now() then return jsonb_build_object('status','invalid'); end if;
  update private.carpool_rides set anchor_at=agreed where id=rid;
 else return jsonb_build_object('status','invalid'); end if;
 perform private.invalidate_carpool_ride(rid,'proposed',null);
 update private.carpool_rides set event_revision=e.revision where id=rid;
 return jsonb_build_object('status','ok','id',cid);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
 return jsonb_build_object('status','invalid');
end $$;

create function private.get_carpool(p_household_id uuid,p_carpool_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.carpools; readable boolean;
begin
 select * into c from public.carpools where id=p_carpool_id;
 if c.id is null or p_household_id not in(c.requester_household_id,c.recipient_household_id)
  or not private.connection_household_access(auth.uid(),p_household_id) then return null; end if;
 perform private.refresh_carpool(c.id);
 select * into c from public.carpools where id=p_carpool_id;
 readable=c.status='accepted' and private.carpool_valid(c.id);
 return jsonb_build_object('id',c.id,'connectionId',c.connection_id,'groupId',c.group_id,'groupName',(select name from public.groups where id=c.group_id),
 'status',c.status,'revision',c.revision,'incoming',c.recipient_household_id=p_household_id,
 'otherHouseholdName',(select display_name from public.households where id=case when c.requester_household_id=p_household_id then c.recipient_household_id else c.requester_household_id end),
 'createdAt',c.created_at,'rides',coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'eventId',r.event_id,'eventName',e.name,'timezone',e.timezone,'leg',r.leg,'anchorAt',r.anchor_at,
  'status',r.status,'revision',r.revision,'reason',r.reason,'availableSeats',r.available_seats,
  'driverOwn',r.driver_household_id=p_household_id,'eventRevision',e.revision,
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.member_id,'name',p.display_name,'role',p.role,'own',p.household_id=p_household_id) order by p.role,p.display_name)
   from private.carpool_participants p where p.ride_id=r.id and (readable or p.household_id=p_household_id)),'[]'::jsonb),
  'ownApproved',exists(select 1 from private.carpool_approvals a where a.ride_id=r.id and a.household_id=p_household_id and a.revision=r.revision),
  'otherApproved',readable and exists(select 1 from private.carpool_approvals a where a.ride_id=r.id and a.household_id<>p_household_id and a.revision=r.revision)
 ) order by r.anchor_at,r.id) from private.carpool_rides r join public.events e on e.id=r.event_id where r.carpool_id=c.id),'[]'::jsonb));
end $$;
create function private.list_carpools(p_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c record; result jsonb='[]'::jsonb;
begin
 if not private.connection_household_access(auth.uid(),p_household_id) then raise exception 'Carpools unavailable' using errcode='42501'; end if;
 for c in select id from public.carpools where p_household_id in(requester_household_id,recipient_household_id) order by created_at desc,id loop
  result=result || jsonb_build_array(private.get_carpool(p_household_id,c.id));
 end loop;
 return result;
end $$;

create function private.carpool_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if tg_table_name='household_connections' then
  if new.status is distinct from old.status and new.status<>'accepted' then
   for r in select id from public.carpools where connection_id=old.id and status in('pending','accepted') order by id loop perform private.refresh_carpool(r.id); end loop;
  end if;
 elsif tg_table_name='events' then
  if tg_op='UPDATE' and (new.status is distinct from old.status or new.required_arrival_at is distinct from old.required_arrival_at
   or new.ready_to_depart_at is distinct from old.ready_to_depart_at or new.location_id is distinct from old.location_id or new.timezone is distinct from old.timezone) then
   for r in select id from private.carpool_rides where event_id=old.id and anchor_at>now() and status<>'canceled' order by id for update loop
    perform private.invalidate_carpool_ride(r.id,case when new.status='cancelled' then 'canceled' else 'needs_review' end,'Event changed; review and approve again');
   end loop;
  end if;
 elsif tg_table_name='household_members' then
  if tg_op='DELETE' or new.archived_at is not null or new.household_id is distinct from old.household_id or new.member_type is distinct from old.member_type then
   for r in select cr.id from private.carpool_rides cr join private.carpool_participants p on p.ride_id=cr.id
    where p.member_id=old.id and cr.anchor_at>now() and cr.status<>'canceled' order by cr.id for update of cr loop
    perform private.invalidate_carpool_ride(r.id,'needs_review','Participant eligibility changed; review and approve again');
   end loop;
  end if;
 elsif tg_table_name='event_participation' then
  if tg_op='DELETE' or new.status<>'going' or new.event_id is distinct from old.event_id or new.member_id is distinct from old.member_id then
   for r in select cr.id from private.carpool_rides cr join private.carpool_participants p on p.ride_id=cr.id
    where p.member_id=old.member_id and cr.event_id=old.event_id and cr.anchor_at>now() and cr.status<>'canceled' order by cr.id for update of cr loop
    perform private.invalidate_carpool_ride(r.id,'needs_review','Attendance changed; review and approve again');
   end loop;
  end if;
 end if;
 return null;
end $$;
create trigger carpool_connection_closed after update on public.household_connections for each row execute function private.carpool_lifecycle();
create trigger carpool_event_changed after update on public.events for each row execute function private.carpool_lifecycle();
create trigger carpool_member_changed before update or delete on public.household_members for each row execute function private.carpool_lifecycle();
-- BEFORE member deletion retains the old selection long enough to invalidate its ride.
-- A BEFORE trigger must return the row so the original mutation proceeds.
create function private.carpool_member_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if tg_op='DELETE' or new.archived_at is not null or new.household_id is distinct from old.household_id or new.member_type is distinct from old.member_type then
  for r in select cr.id from private.carpool_rides cr join private.carpool_participants p on p.ride_id=cr.id
   where p.member_id=old.id and cr.anchor_at>now() and cr.status<>'canceled' order by cr.id for update of cr loop
   perform private.invalidate_carpool_ride(r.id,'needs_review','Participant eligibility changed; review and approve again');
  end loop;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger carpool_member_changed on public.household_members;
create trigger carpool_member_changed before update or delete on public.household_members for each row execute function private.carpool_member_lifecycle();
create trigger carpool_attendance_changed after update or delete on public.event_participation for each row execute function private.carpool_lifecycle();

create function public.carpool_action(p_command text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.carpool_action(p_command,p_data) $$;
create function public.get_carpool(p_household_id uuid,p_carpool_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.get_carpool(p_household_id,p_carpool_id) $$;
create function public.list_carpools(p_household_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.list_carpools(p_household_id) $$;
revoke all on function private.carpool_valid(uuid),private.carpool_ride_valid(uuid),private.invalidate_carpool_ride(uuid,text,text),private.refresh_carpool(uuid),private.carpool_lifecycle(),private.carpool_member_lifecycle() from public,anon,authenticated;
revoke all on function private.carpool_action(text,jsonb),private.get_carpool(uuid,uuid),private.list_carpools(uuid),public.carpool_action(text,jsonb),public.get_carpool(uuid,uuid),public.list_carpools(uuid) from public,anon;
grant execute on function private.carpool_action(text,jsonb),private.get_carpool(uuid,uuid),private.list_carpools(uuid),public.carpool_action(text,jsonb),public.get_carpool(uuid,uuid),public.list_carpools(uuid) to authenticated;
