-- Connection metadata is household-visible; contact and pickup consent stay private.
create table public.household_connections (
 id uuid primary key default gen_random_uuid(),
 requester_household_id uuid not null references public.households(id) on delete cascade,
 recipient_household_id uuid not null references public.households(id) on delete cascade,
 group_id uuid not null references public.groups(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn','expired','disconnected')),
 requested_by uuid references auth.users(id) on delete set null,
 responded_by uuid references auth.users(id) on delete set null,
 closed_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, closed_at timestamptz,
 revision integer not null default 1,
 check(requester_household_id<>recipient_household_id)
);
create unique index household_connections_active_pair on public.household_connections
 (least(requester_household_id,recipient_household_id),greatest(requester_household_id,recipient_household_id))
 where status in ('pending','accepted');
create index household_connections_requester on public.household_connections(requester_household_id,created_at desc);
create index household_connections_recipient on public.household_connections(recipient_household_id,created_at desc);
alter table public.household_connections enable row level security;
revoke all on public.household_connections from public,anon,authenticated;
grant select on public.household_connections to authenticated;
create policy household_connections_read on public.household_connections for select to authenticated
 using(private.is_household_member(requester_household_id) or private.is_household_member(recipient_household_id));

create table private.connection_contacts (
 connection_id uuid not null references public.household_connections(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 name text not null, email text not null, phone text,
 shared_at timestamptz not null default now(),
 primary key(connection_id,household_id)
);
create table private.connection_pickups (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.household_connections(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 leg text not null check(leg in ('to_event','from_event')),
 location_id uuid not null references private.household_locations(id) on delete cascade,
 location_revision integer not null,
 expires_at timestamptz not null,
 shared_by uuid references auth.users(id) on delete set null,
 shared_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index connection_pickups_active on private.connection_pickups(connection_id,household_id,event_id,leg) where revoked_at is null;
alter table private.connection_contacts enable row level security;
alter table private.connection_pickups enable row level security;
revoke all on private.connection_contacts,private.connection_pickups from public,anon,authenticated;

create function private.connection_household_access(p_user uuid,p_household uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_access a join public.households h on h.id=a.household_id
 where a.user_id=p_user and a.household_id=p_household and h.archived_at is null)
$$;
create function private.connection_valid(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_connections c
 where c.id=p_id and c.status in ('pending','accepted')
 and (c.status='accepted' or c.expires_at>now())
 and exists(select 1 from public.households h join public.group_memberships m on m.household_id=h.id
 where h.id=c.requester_household_id and h.archived_at is null and m.group_id=c.group_id and m.status='active')
 and exists(select 1 from public.households h join public.group_memberships m on m.household_id=h.id
 where h.id=c.recipient_household_id and h.archived_at is null and m.group_id=c.group_id and m.status='active')
 and not exists(select 1 from private.connection_contacts t where t.connection_id=c.id
 and not private.connection_household_access(t.user_id,t.household_id)))
$$;
create function private.refresh_connections(p_household uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.household_connections c set status=case when status='pending' and expires_at<=now() then 'expired' else 'disconnected' end,
 closed_at=now(),revision=revision+1
 where p_household in (requester_household_id,recipient_household_id) and status in ('pending','accepted') and not private.connection_valid(c.id);
end $$;
create function private.save_connection_contact(p_connection uuid,p_household uuid,p_user uuid,p_phone text) returns void
language plpgsql security definer set search_path='' as $$
declare contact_name text; contact_email text;
begin
 if not private.connection_household_access(p_user,p_household) then raise exception 'Connection unavailable' using errcode='42501'; end if;
 if length(coalesce(p_phone,''))>40 or (nullif(btrim(p_phone),'') is not null and (p_phone !~ '^\+?[0-9() .-]+$' or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 15)) then
 raise exception 'Invalid phone' using errcode='22023'; end if;
 select concat_ws(' ',nullif(btrim(p.first_name),''),nullif(btrim(p.last_name),'')),u.email into contact_name,contact_email
 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and u.email_confirmed_at is not null;
 if contact_name is null or contact_name='' or contact_email is null then raise exception 'Confirmed contact required' using errcode='22023'; end if;
 insert into private.connection_contacts(connection_id,household_id,user_id,name,email,phone)
 values(p_connection,p_household,p_user,contact_name,contact_email,nullif(btrim(p_phone),''))
 on conflict(connection_id,household_id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,shared_at=now();
end $$;

-- Only a trusted server with a verified, encrypted match proof can enter this workflow.
create function private.request_connection(p_user_id uuid,p_household_id uuid,p_other_household_id uuid,p_event_id uuid,p_leg text,p_pair_key text,p_fingerprint text,p_max_distance integer,p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.household_connections; candidate jsonb; gid uuid;
begin
 perform 1 from public.households where id in (p_household_id,p_other_household_id) order by id for update;
 if not private.connection_household_access(p_user_id,p_household_id) or p_household_id=p_other_household_id then return jsonb_build_object('status','unavailable'); end if;
 perform private.refresh_connections(p_household_id);
 select * into c from public.household_connections where status in ('pending','accepted')
 and least(requester_household_id,recipient_household_id)=least(p_household_id,p_other_household_id)
 and greatest(requester_household_id,recipient_household_id)=greatest(p_household_id,p_other_household_id) for update;
 if found then return jsonb_build_object('status','existing','id',c.id,'incoming',c.recipient_household_id=p_household_id); end if;
 select m.candidate into candidate from private.match_candidates(p_user_id,p_event_id,p_household_id,p_leg,p_max_distance,'',array[p_pair_key],1) m;
 if candidate is null or candidate->>'fingerprint' is distinct from p_fingerprint or (candidate->>'other_household_id')::uuid<>p_other_household_id then
 return jsonb_build_object('status','stale'); end if;
 select group_id into gid from public.events where id=p_event_id;
 insert into public.household_connections(requester_household_id,recipient_household_id,group_id,event_id,requested_by)
 values(p_household_id,p_other_household_id,gid,p_event_id,p_user_id) returning * into c;
 perform private.save_connection_contact(c.id,p_household_id,p_user_id,p_phone);
 return jsonb_build_object('status','ok','id',c.id);
end $$;
create function public.request_connection(p_user_id uuid,p_household_id uuid,p_other_household_id uuid,p_event_id uuid,p_leg text,p_pair_key text,p_fingerprint text,p_max_distance integer,p_phone text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.request_connection(p_user_id,p_household_id,p_other_household_id,p_event_id,p_leg,p_pair_key,p_fingerprint,p_max_distance,p_phone)
$$;
revoke all on function public.request_connection(uuid,uuid,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.request_connection(uuid,uuid,uuid,uuid,text,text,text,integer,text) to service_role;

create function private.connection_action(p_command text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; cid uuid; c public.household_connections; e public.events; l private.household_locations; anchor timestamptz; target text; sid uuid;
begin
 hid=(p_data->>'householdId')::uuid; cid=(p_data->>'connectionId')::uuid;
 select * into c from public.household_connections where id=cid;
 if c.id is null or hid not in (c.requester_household_id,c.recipient_household_id) or not private.connection_household_access(auth.uid(),hid) then return jsonb_build_object('status','unavailable'); end if;
 perform 1 from public.households where id in (c.requester_household_id,c.recipient_household_id) order by id for update;
 select * into c from public.household_connections where id=cid for update;
 if not private.connection_household_access(auth.uid(),hid) then return jsonb_build_object('status','unavailable'); end if;
 perform private.refresh_connections(hid);
 select * into c from public.household_connections where id=cid;
 if p_command in ('accept','decline','withdraw','disconnect') then
 if (p_command in ('accept','decline') and hid<>c.recipient_household_id) or (p_command='withdraw' and hid<>c.requester_household_id) then return jsonb_build_object('status','unavailable'); end if;
 target=case p_command when 'accept' then 'accepted' when 'decline' then 'declined' when 'withdraw' then 'withdrawn' else 'disconnected' end;
 if c.status=target then return jsonb_build_object('status','ok','id',cid); end if;
 if c.revision is distinct from (p_data->>'revision')::integer or (p_command='disconnect' and c.status<>'accepted') or (p_command<>'disconnect' and c.status<>'pending') then return jsonb_build_object('status','conflict'); end if;
 if p_command='accept' then perform private.save_connection_contact(cid,hid,auth.uid(),p_data->>'phone'); end if;
 update public.household_connections set status=target,revision=revision+1,
 responded_by=case when p_command in ('accept','decline') then auth.uid() else responded_by end,
 closed_by=case when p_command<>'accept' then auth.uid() else null end,
 accepted_at=case when p_command='accept' then now() else accepted_at end,
 closed_at=case when p_command<>'accept' then now() else null end where id=cid;
 return jsonb_build_object('status','ok','id',cid);
 end if;
 if c.status<>'accepted' or not private.connection_valid(cid) then return jsonb_build_object('status','conflict'); end if;
 if p_command='contact' then
 if not exists(select 1 from private.connection_contacts where connection_id=cid and household_id=hid and user_id=auth.uid()) then return jsonb_build_object('status','unavailable'); end if;
 perform private.save_connection_contact(cid,hid,auth.uid(),p_data->>'phone');
 elsif p_command='share' then
 select * into e from public.events where id=(p_data->>'eventId')::uuid for share;
 select * into l from private.household_locations where id=(p_data->>'locationId')::uuid and household_id=hid for share;
 if e.id is null or e.group_id<>c.group_id or e.status<>'scheduled' or l.id is null or l.archived_at is not null or nullif(l.address_line_1,'') is null
 or e.revision is distinct from (p_data->>'eventRevision')::integer or l.revision is distinct from (p_data->>'locationRevision')::integer or p_data->>'leg' not in ('to_event','from_event') or p_data->>'leg' is null then return jsonb_build_object('status','conflict'); end if;
 anchor=case when p_data->>'leg'='to_event' then e.required_arrival_at else e.ready_to_depart_at end;
 if anchor is null or anchor<=now() then return jsonb_build_object('status','conflict'); end if;
 -- Exact retries preserve the active share; replacements retain revoked history.
 if exists(select 1 from private.connection_pickups where connection_id=cid and household_id=hid and event_id=e.id and leg=p_data->>'leg' and location_id=l.id and location_revision=l.revision and revoked_at is null and expires_at=anchor) then return jsonb_build_object('status','ok','id',cid); end if;
 update private.connection_pickups set revoked_at=now() where connection_id=cid and household_id=hid and event_id=e.id and leg=p_data->>'leg' and revoked_at is null;
 insert into private.connection_pickups(connection_id,household_id,event_id,leg,location_id,location_revision,expires_at,shared_by)
 values(cid,hid,e.id,p_data->>'leg',l.id,l.revision,anchor,auth.uid());
 elsif p_command='revoke' then
 sid=(p_data->>'shareId')::uuid;
 if not exists(select 1 from private.connection_pickups where id=sid and connection_id=cid and household_id=hid) then return jsonb_build_object('status','unavailable'); end if;
 update private.connection_pickups set revoked_at=coalesce(revoked_at,now()) where id=sid;
 else return jsonb_build_object('status','invalid'); end if;
 return jsonb_build_object('status','ok','id',cid);
end $$;
create function public.connection_action(p_command text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.connection_action(p_command,p_data) $$;

create function private.list_connections(p_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.connection_household_access(auth.uid(),p_household_id) then raise exception 'Connection unavailable' using errcode='42501'; end if;
 perform private.refresh_connections(p_household_id);
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'status',c.status,'revision',c.revision,'incoming',c.recipient_household_id=p_household_id,
 'otherHouseholdName',h.display_name,'groupId',c.group_id,'groupName',g.name,'eventName',e.name,
 'createdAt',c.created_at,'expiresAt',c.expires_at,
 'contacts',case when c.status='accepted' and private.connection_valid(c.id) then coalesce((
 select jsonb_agg(jsonb_build_object('own',t.household_id=p_household_id,'editable',t.user_id=auth.uid(),'name',t.name,'email',t.email,'phone',t.phone))
 from private.connection_contacts t where t.connection_id=c.id),'[]'::jsonb) else '[]'::jsonb end,
 'pickups',case when c.status='accepted' and private.connection_valid(c.id) then coalesce((
 select jsonb_agg(jsonb_build_object('id',s.id,'own',s.household_id=p_household_id,'eventName',se.name,'leg',s.leg,'expiresAt',s.expires_at,'timezone',se.timezone,
 'label',l.label,'address_line_1',l.address_line_1,'address_line_2',l.address_line_2,'city',l.city,'state_region',l.state_region,'postal_code',l.postal_code,'country_code',l.country_code))
 from private.connection_pickups s join private.household_locations l on l.id=s.location_id
 join public.events se on se.id=s.event_id
 where s.connection_id=c.id and s.revoked_at is null and s.expires_at>now() and l.archived_at is null and l.revision=s.location_revision
 and se.status='scheduled' and se.group_id=c.group_id and s.expires_at=case when s.leg='to_event' then se.required_arrival_at else se.ready_to_depart_at end),'[]'::jsonb) else '[]'::jsonb end)
 order by c.created_at desc,c.id)
 from public.household_connections c join public.households h on h.id=case when c.requester_household_id=p_household_id then c.recipient_household_id else c.requester_household_id end
 join public.groups g on g.id=c.group_id join public.events e on e.id=c.event_id
 where p_household_id in (c.requester_household_id,c.recipient_household_id)),'[]'::jsonb);
end $$;
create function public.list_connections(p_household_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.list_connections(p_household_id) $$;

-- Persist lifecycle revocation, including leave/rejoin between reads.
create function private.revoke_connections_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='group_memberships' then
 if tg_op='DELETE' or new.status<>'active' then
 update public.household_connections set status='disconnected',closed_at=now(),revision=revision+1
 where group_id=old.group_id and old.household_id in (requester_household_id,recipient_household_id) and status in ('pending','accepted');
 end if;
 elsif tg_table_name='household_access' then
 if tg_op='DELETE' or new.household_id<>old.household_id or new.user_id<>old.user_id then
 update public.household_connections c set status='disconnected',closed_at=now(),revision=revision+1
 where c.status in ('pending','accepted') and exists(select 1 from private.connection_contacts t where t.connection_id=c.id and t.household_id=old.household_id and t.user_id=old.user_id);
 end if;
 elsif tg_table_name='households' then
 if new.archived_at is not null then
 update public.household_connections set status='disconnected',closed_at=now(),revision=revision+1 where old.id in (requester_household_id,recipient_household_id) and status in ('pending','accepted');
 end if;
 elsif tg_table_name='household_locations' then
 update private.connection_pickups set revoked_at=now() where location_id=old.id and revoked_at is null;
 elsif tg_table_name='events' then
 if new.status<>old.status or new.required_arrival_at is distinct from old.required_arrival_at or new.ready_to_depart_at is distinct from old.ready_to_depart_at or new.location_id is distinct from old.location_id or new.timezone<>old.timezone then
 update private.connection_pickups set revoked_at=now() where event_id=old.id and revoked_at is null;
 end if;
 end if;
 return null;
end $$;
create trigger connection_group_departure after update or delete on public.group_memberships for each row execute function private.revoke_connections_lifecycle();
create trigger connection_account_departure after update or delete on public.household_access for each row execute function private.revoke_connections_lifecycle();
create trigger connection_household_archive after update of archived_at on public.households for each row execute function private.revoke_connections_lifecycle();
create trigger connection_address_change after update on private.household_locations for each row execute function private.revoke_connections_lifecycle();
create trigger connection_event_change after update on public.events for each row execute function private.revoke_connections_lifecycle();

revoke all on function private.connection_household_access(uuid,uuid),private.connection_valid(uuid),private.refresh_connections(uuid),private.save_connection_contact(uuid,uuid,uuid,text),private.request_connection(uuid,uuid,uuid,uuid,text,text,text,integer,text),private.revoke_connections_lifecycle() from public,anon,authenticated;
grant execute on function private.request_connection(uuid,uuid,uuid,uuid,text,text,text,integer,text) to service_role;
revoke all on function private.connection_action(text,jsonb),private.list_connections(uuid),public.connection_action(text,jsonb),public.list_connections(uuid) from public,anon;
grant execute on function private.connection_action(text,jsonb),private.list_connections(uuid),public.connection_action(text,jsonb),public.list_connections(uuid) to authenticated;
