// Test-only HTTP provider. Never imported by the application.
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
const defaultId = "11111111-1111-4111-8111-111111111111";
const defaultHousehold = "33333333-3333-4333-8333-333333333333";
const hashId = email => { const h = createHash("sha256").update(email).digest("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const idFor = email => ["new@example.com", "recipient@example.com", "outsider@example.com"].includes(email) ? hashId(email) : defaultId;
const events = []; const destinations = []; const locations = []; const attendance = []; const rides = []; const series = [];
const budgets = new Map();
const groups = new Map(); const groupAdmins = []; const memberships = []; const groupInvites = []; const groupRequests = new Map();
const houses = new Map(); const people = []; const access = []; const invites = []; const requests = new Map();
function setup(email) {
 const id = idFor(email);
 if (!houses.has(defaultHousehold)) houses.set(defaultHousehold, { id: defaultHousehold, display_name: "Example household", archived_at: null, created_at: "2026-01-01" });
 if (!houses.get(defaultHousehold).archived_at && !["new@example.com", "recipient@example.com", "outsider@example.com"].includes(email) && !access.some(a => a.user_id === id)) {
  access.push({ household_id: defaultHousehold, user_id: id, role: "owner", created_at: "2026-01-01" });
  people.push({ id: randomUUID(), household_id: defaultHousehold, linked_user_id: id, first_name: "Alex", last_name: "Example", member_type: "adult", archived_at: null });
 }
 return id;
}
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function session(email = "adult@example.com") {
  const id = setup(email);
  const now = Math.floor(Date.now() / 1000);
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, email, exp: now + 3600, iat: now, aud: "authenticated", role: "authenticated" })}.mock`;
  return { access_token: token, refresh_token: "mock-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}
const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://127.0.0.1:54329");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Supabase-Api-Version", "2024-01-01");
  const send = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/auth/v1/otp") {
    if (body.email === "slow@example.com") await new Promise(resolve => setTimeout(resolve, 1500));
    if (body.email === "limited@example.com") return send(429, { code: "over_email_send_rate_limit", msg: "private error" });
    if (body.email === "unavailable@example.com") return send(500, { code: "unexpected_failure", msg: "private error" });
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/verify") {
    if (body.token !== (body.email === "eight@example.com" ? "12345678" : "123456")) return send(403, { code: "otp_expired", msg: "private error" });
    return send(200, session(body.email));
  }
  if (url.pathname === "/auth/v1/token") {
    if (body.refresh_token !== "mock-refresh") return send(400, { code: "refresh_token_not_found", msg: "Invalid refresh token" });
    return send(200, session());
  }
  if (url.pathname === "/auth/v1/user") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || token === "mock-key") return send(401, { code: "bad_jwt", msg: "Invalid JWT" });
    try { const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url")); return send(200, session(claims.email).user); }
    catch { return send(401, { code: "bad_jwt", msg: "Invalid JWT" }); }
  }
  if (url.pathname === "/auth/v1/logout") {
    const claims = JSON.parse(Buffer.from(req.headers.authorization.split(" ")[1].split(".")[1], "base64url"));
    if (claims.email === "signout-error@example.com") return send(422, { code: "unexpected_failure", msg: "private error" });
    return send(200, {});
  }
  if (url.pathname === "/test/reset" && req.method === "POST") { events.splice(0); destinations.splice(0); locations.splice(0); attendance.splice(0); rides.splice(0); series.splice(0); budgets.clear(); groups.clear(); groupAdmins.splice(0); memberships.splice(0); groupInvites.splice(0); groupRequests.clear(); houses.clear(); people.splice(0); access.splice(0); invites.splice(0); requests.clear(); return send(200, {}); }
  if (url.pathname === "/test/event-member" && req.method === "POST") { access.filter(a=>a.user_id===defaultId).forEach(a=>a.role="member"); for(let i=groupAdmins.length-1;i>=0;i--)if(groupAdmins[i].user_id===defaultId)groupAdmins.splice(i,1); return send(200,{}); }
  if (url.pathname === "/test/budget" && req.method === "POST") { budgets.set(idFor(body.email), { minute: Date.now(), hour: Date.now(), minuteCount: body.minuteCount ?? 0, hourCount: body.hourCount ?? 0 }); return send(200, {}); }
  if (url.pathname === "/test/legacy" && req.method === "POST") {
    const hash = createHash("sha256").update(body.token).digest("hex");
    if (body.kind === "household") invites.push({ id: randomUUID(), household_id: defaultHousehold, invited_email: "recipient@example.com", token_hash: hash, participant_id: null, expires_at: new Date(Date.now() + 86400000).toISOString(), consumed_at: null, revoked_at: null });
    else groupInvites.push({ id: randomUUID(), group_id: body.groupId, invite_type: "group_link", invited_email: null, token_hash: hash, status: "active", max_uses: null, use_count: 0, expires_at: new Date(Date.now() + 86400000).toISOString() });
    return send(200, {});
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const claims = JSON.parse(Buffer.from(req.headers.authorization.split(" ")[1].split(".")[1], "base64url"));
    const email = claims.email; const id = setup(email);
    const ownHouses = () => access.filter(a => a.user_id === id).map(a => a.household_id);
    const isAdmin = gid => groupAdmins.some(a => a.group_id === gid && a.user_id === id);
    const visible = gid => isAdmin(gid) || memberships.some(m => m.group_id === gid && m.status === "active" && ownHouses().includes(m.household_id));
    const manages = hid => access.some(a => a.household_id === hid && a.user_id === id && ["owner", "admin"].includes(a.role)) && !houses.get(hid)?.archived_at;
    const table = url.pathname.slice("/rest/v1/".length);
    const filter = (rows) => rows.filter(row => [...url.searchParams].every(([key, value]) => {
      if (["select", "order", "limit"].includes(key)) return true;
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      return true;
    }));
    if (["events","event_locations","event_series","event_participation","ride_participation"].includes(table)) {
      const source = {events,event_locations:destinations,event_series:series,event_participation:attendance,ride_participation:rides}[table];
      const rows = filter(source.filter(r => r.group_id ? visible(r.group_id) : people.some(p => p.id===r.member_id && ownHouses().includes(p.household_id))));
      if (req.method === "HEAD") { res.setHeader("Content-Range",`0-${rows.length-1}/${rows.length}`); return send(200,[]); }
      return send(200,req.headers.accept?.includes("vnd.pgrst.object") ? rows[0]??null : rows);
    }
    if (table === "groups") {
      let rows = filter([...groups.values()].filter(g => visible(g.id)));
      if (req.method === "PATCH") { rows = rows.filter(g => isAdmin(g.id)); rows.forEach(g => Object.assign(g, body)); }
      return send(200, req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
    }
    if (table === "group_admins") return send(200, filter(groupAdmins.filter(a => isAdmin(a.group_id))));
    if (table === "group_memberships") {
      const rows = filter(memberships.filter(m => visible(m.group_id)));
      return send(200, req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
    }
    if (table === "group_invitations") return send(200, filter(groupInvites.filter(i => isAdmin(i.group_id))).map(({ token_hash, ...metadata }) => { void token_hash; return metadata; }));
    if (table === "profiles") return send(200, email === "missing@example.com" ? null : { id, first_name: "Alex", last_name: "Example", onboarding_completed_at: null });
    if (table === "households") {
      const rows = filter([...houses.values()].filter(h => ownHouses().includes(h.id) && !h.archived_at));
      if (req.method === "PATCH") rows.forEach(h => Object.assign(h, body));
      return send(200, rows);
    }
    if (table === "household_access") return send(200, filter(access.filter(a => ownHouses().includes(a.household_id))));
    if (table === "household_members") {
      if (req.method === "POST") {
        const value = Array.isArray(body) ? body[0] : body;
        const participant = { id: randomUUID(), linked_user_id: null, archived_at: null, ...value };
        people.push(participant); return send(201, [participant]);
      }
      const rows = filter(people.filter(p => ownHouses().includes(p.household_id)));
      if (req.method === "PATCH") rows.forEach(p => Object.assign(p, body));
      return send(200, rows);
    }
    if (table === "household_invitations") return send(200, filter(invites.filter(i => ownHouses().includes(i.household_id) && access.some(a => a.household_id === i.household_id && a.user_id === id && a.role === "owner"))));
    if (table.startsWith("rpc/")) {
      const rpc = table.slice(4); const hid = body.p_household_id;
      const denied = () => send(400, { code: "22023", message: "private database details" });
      if (rpc === "household_location_list") return ownHouses().includes(hid) ? send(200,locations.filter(l=>l.household_id===hid)) : denied();
      if (rpc === "event_workflow") {
        const d=body.p_data,c=body.p_command; const ev=events.find(e=>e.id===d.eventId);
        if (c.startsWith("location-") && !manages(d.householdId)) return denied();
        if ((c.startsWith("event-")||c.startsWith("destination-"))&&!isAdmin(d.groupId)) return denied();
        if (["attendance","ride"].includes(c)&&(!ownHouses().includes(d.householdId)||!ev||ev.status!=="scheduled"))return denied();
        const invalidate=eventId=>rides.filter(r=>r.event_id===eventId).forEach(r=>Object.assign(r,{disabled_at:new Date().toISOString(),needs_reconfirmation:true}));
        if (c.endsWith("save") && c!=="event-save") {
          const source=c==="location-save"?locations:destinations;
          let row=source.find(l=>l.id===d.locationId);
          if(row){if(c==="destination-save")events.filter(e=>e.location_id===row.id).forEach(e=>invalidate(e.id));else rides.filter(r=>r.household_location_id===row.id).forEach(r=>Object.assign(r,{disabled_at:new Date().toISOString(),needs_reconfirmation:true}));}
          else {row={id:randomUUID(),revision:0,archived_at:null};source.push(row);}
          Object.assign(row,{group_id:d.groupId,household_id:d.householdId,name:d.name,label:d.name,address_line_1:d.addressLine1,address_line_2:d.addressLine2,city:d.city,state_region:d.stateRegion,postal_code:d.postalCode,country_code:d.countryCode,revision:row.revision+1});return send(200,row.id);
        }
        if(c==="event-save"){
          let row=ev;if(row){if(row.required_arrival_at!==d.arrival||row.ready_to_depart_at!==d.departure||row.timezone!==d.timezone||row.location_id!==d.locationId)invalidate(row.id);}
          else {row={id:randomUUID(),revision:0,status:"scheduled",event_series_id:null};events.push(row);}
          Object.assign(row,{group_id:d.groupId,name:d.name,location_id:d.locationId,timezone:d.timezone,required_arrival_at:d.arrival,ready_to_depart_at:d.departure,activity_starts_at:d.activityStart,activity_ends_at:d.activityEnd,revision:row.revision+1});return send(200,row.id);
        }
        if(c==="event-cancel"){ev.status="cancelled";ev.revision++;invalidate(ev.id);return send(200,ev.id);}
        if(c==="attendance"){let row=attendance.find(a=>a.event_id===ev.id&&a.member_id===d.memberId);if(!row){row={id:randomUUID(),event_id:ev.id,member_id:d.memberId,disabled_at:null};attendance.push(row);}row.status=d.status;if(d.status!=="going")rides.filter(r=>r.event_id===ev.id&&r.member_id===d.memberId).forEach(r=>Object.assign(r,{disabled_at:new Date().toISOString(),needs_reconfirmation:true}));return send(200,ev.id);}
        if(c==="ride"){let row=rides.find(r=>r.event_id===ev.id&&r.member_id===d.memberId&&r.leg===d.leg);if(!row){row={id:randomUUID(),event_id:ev.id,member_id:d.memberId,leg:d.leg};rides.push(row);}Object.assign(row,{mode:d.mode,household_location_id:d.locationId||null,anchor_earliest_at:d.earliest,anchor_latest_at:d.latest,available_seats:d.seats,max_detour_minutes:d.detour,disabled_at:null,needs_reconfirmation:false});return send(200,ev.id);}
        const row=(c==="location-archive"?locations:destinations).find(l=>l.id===d.locationId);if(row){row.archived_at=new Date().toISOString();return send(200,row.id);}return denied();
      }
      if(rpc==="series_workflow"){
        const d=body.p_data;if(!isAdmin(d.groupId))return denied();const sid=randomUUID();series.push({id:sid,group_id:d.groupId,revision:1,recurrence_spec:d.spec});
        if(d.replaceEventId){const old=events.find(e=>e.id===d.replaceEventId);events.filter(e=>e.event_series_id===old.event_series_id&&e.original_local_date>=old.original_local_date).forEach(e=>e.status="cancelled");}
        d.occurrences.forEach(o=>events.push({id:randomUUID(),group_id:d.groupId,event_series_id:sid,name:d.name,location_id:d.locationId,timezone:d.spec.timezone,revision:1,status:"scheduled",activity_starts_at:null,activity_ends_at:null,...o}));return send(200,sid);
      }
      if (rpc === "create_group_once") {
        if (!manages(hid)) return denied();
        if (body.p_name === "Provider unavailable") return send(503, { code: "unexpected", message: "private details" });
        if (body.p_name === "Slow group") await new Promise(resolve => setTimeout(resolve, 1000));
        const key = id + body.p_request_id; if (groupRequests.has(key)) return send(200, groupRequests.get(key));
        const gid = randomUUID(); groupRequests.set(key, gid);
        groups.set(gid, { id: gid, name: body.p_name, group_type: body.p_group_type, description: body.p_description || null });
        groupAdmins.push({ group_id: gid, user_id: id, role: "owner" }); memberships.push({ id: randomUUID(), group_id: gid, household_id: hid, status: "active" });
        return send(200, gid);
      }
      if (rpc === "create_group_invitation") {
        if (!isAdmin(body.p_group_id)) return denied();
        const inv = { id: randomUUID(), group_id: body.p_group_id, invite_type: body.p_invite_type, invited_email: body.p_invited_email?.toLowerCase() ?? null, token_hash: body.p_token_hash, status: "active", max_uses: body.p_invite_type === "direct" ? 1 : body.p_max_uses ?? null, use_count: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }; groupInvites.push(inv); return send(200, inv.id);
      }
      if (["preview_group_invitation", "redeem_group_invitation", "accept_household_invitation"].includes(rpc)) return send(403, { code: "42501", message: "permission denied" });
      if (rpc === "inspect_invitation" || rpc === "accept_invitation") {
        const now = Date.now(); const budget = budgets.get(id) ?? { minute: now, hour: now, minuteCount: 0, hourCount: 0 };
        if (now - budget.minute >= 60000) { budget.minute = now; budget.minuteCount = 0; }
        if (now - budget.hour >= 3600000) { budget.hour = now; budget.hourCount = 0; }
        budgets.set(id, budget);
        const retry = Math.max(budget.minuteCount >= 10 ? Math.ceil((budget.minute + 60000 - now) / 1000) : 0, budget.hourCount >= 50 ? Math.ceil((budget.hour + 3600000 - now) / 1000) : 0);
        if (retry) return send(200, { status: "throttled", retry_after_seconds: retry });
        budget.minuteCount++; budget.hourCount++;
        const invalid = () => send(200, { status: "invalid" });
        if (body.p_kind === "group") {
          const inv = groupInvites.find(i => i.token_hash === body.p_token_hash);
          if (!inv || inv.status !== "active" || new Date(inv.expires_at) <= new Date() || (inv.max_uses != null && inv.use_count >= inv.max_uses) || (inv.invite_type === "direct" && inv.invited_email !== email)) return invalid();
          if (rpc === "inspect_invitation") { const { id: group_id, ...details } = groups.get(inv.group_id); return send(200, { status: "ok", group: { group_id, ...details } }); }
          if (!manages(hid) || memberships.some(m => m.group_id === inv.group_id && m.household_id === hid && m.status !== "left")) return invalid();
          const membership = { id: randomUUID(), group_id: inv.group_id, household_id: hid, status: "active" }; memberships.push(membership); inv.use_count++; if (inv.max_uses != null && inv.use_count >= inv.max_uses) inv.status = "exhausted";
          return send(200, { status: "ok", destination_kind: "group", destination_id: inv.group_id });
        }
        if (body.p_kind !== "household") return invalid();
        const inv = invites.find(i => i.token_hash === body.p_token_hash && i.invited_email === email && !i.consumed_at && !i.revoked_at && new Date(i.expires_at) > new Date() && !houses.get(i.household_id)?.archived_at);
        if (!inv || access.some(a => a.household_id === inv.household_id && a.user_id === id)) return invalid();
        if (rpc === "inspect_invitation") return send(200, { status: "ok" });
        inv.consumed_at = new Date().toISOString(); access.push({ household_id: inv.household_id, user_id: id, role: "member", created_at: new Date().toISOString() });
        const existing = people.find(p => p.id === inv.participant_id);
        if (existing) existing.linked_user_id = id;
        else people.push({ id: randomUUID(), household_id: inv.household_id, linked_user_id: id, first_name: body.p_first_name, last_name: body.p_last_name, member_type: "adult", archived_at: null });
        return send(200, { status: "ok", destination_kind: "household", destination_id: inv.household_id });
      }
      if (rpc === "revoke_group_invitation") {
        if (!isAdmin(body.p_group_id)) return denied();
        const inv = groupInvites.find(i => i.id === body.p_invitation_id && i.group_id === body.p_group_id && i.status === "active"); if (!inv) return denied(); inv.status = "revoked"; return send(200, null);
      }
      if (rpc === "onboard_household") {
        if (body.p_display_name === "Provider unavailable") return send(503, { code: "P0001", message: "private database details" });
        if (body.p_display_name === "Slow household") await new Promise(resolve => setTimeout(resolve, 1000));
        const request = id + body.p_request_id;
        if (requests.has(request)) return send(200, requests.get(request));
        const newId = randomUUID(); requests.set(request, newId);
        houses.set(newId, { id: newId, display_name: body.p_display_name, archived_at: null });
        access.push({ household_id: newId, user_id: id, role: "owner", created_at: new Date().toISOString() });
        people.push({ id: randomUUID(), household_id: newId, linked_user_id: id, first_name: body.p_first_name, last_name: body.p_last_name, member_type: "adult", archived_at: null });
        return send(200, newId);
      }
      if (rpc === "create_household_invitation") {
        const invitation = { id: randomUUID(), household_id: hid, invited_email: body.p_email.toLowerCase(), token_hash: body.p_token_hash, participant_id: body.p_participant_id ?? null, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), consumed_at: null, revoked_at: null };
        invites.push(invitation); return send(200, invitation.id);
      }
      if (rpc === "archive_household_participant") { const p = people.find(p => p.id === body.p_member_id); if (p) p.archived_at = new Date().toISOString(); return send(200, null); }
      if (rpc === "revoke_household_invitation") { const inv = invites.find(i => i.id === body.p_invitation_id); if (inv) inv.revoked_at = new Date().toISOString(); return send(200, null); }
      if (rpc === "promote_household_member") { const a = access.find(a => a.household_id === hid && a.user_id === body.p_user_id); if (a) a.role = "owner"; return send(200, null); }
      if (rpc === "demote_household_owner") {
        const a = access.find(a => a.household_id === hid && a.user_id === id);
        const other = access.find(a => a.household_id === hid && a.user_id !== id);
        if (!other) return denied(); other.role = "owner"; a.role = "member"; return send(200, null);
      }
      if (rpc === "leave_household" || rpc === "remove_household_member") {
        const departing = rpc === "leave_household" ? id : body.p_user_id;
        const index = access.findIndex(a => a.household_id === hid && a.user_id === departing);
        if (index >= 0) access.splice(index, 1);
        const remaining = access.filter(a => a.household_id === hid);
        if (!remaining.length) houses.get(hid).archived_at = new Date().toISOString();
        else if (!remaining.some(a => a.role === "owner")) remaining[0].role = "owner";
        people.filter(p => p.household_id === hid && p.linked_user_id === departing).forEach(p => { p.linked_user_id = null; p.archived_at = new Date().toISOString(); });
        return send(200, null);
      }
    }
  }
  return send(404, { message: "Unknown mock endpoint" });
});
server.listen(54329, "127.0.0.1");
