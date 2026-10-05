-- Enforce explicit sharing consent at the controlled database boundary too.
create or replace function private.connection_action(p_command text,p_data jsonb) returns jsonb
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
 if p_command in ('accept','contact','share') and p_data->>'consent' is distinct from 'yes' then return jsonb_build_object('status','invalid'); end if;
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

create or replace function private.revoke_connections_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='group_memberships' then
 if tg_op='DELETE' or new.status<>'active' or new.group_id is distinct from old.group_id or new.household_id is distinct from old.household_id then
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
