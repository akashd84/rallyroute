-- Safe counterpart identity and timezone for match-card status and expiry displays.
create or replace function private.list_connections(p_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.connection_household_access(auth.uid(),p_household_id) then raise exception 'Connection unavailable' using errcode='42501'; end if;
 perform private.refresh_connections(p_household_id);
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'status',c.status,'revision',c.revision,'incoming',c.recipient_household_id=p_household_id,
 'otherHouseholdId',h.id,'otherHouseholdName',h.display_name,'eventTimezone',e.timezone,'groupId',c.group_id,'groupName',g.name,'eventName',e.name,
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
