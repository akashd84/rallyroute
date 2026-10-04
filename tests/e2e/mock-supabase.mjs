// Test-only HTTP provider. Never imported by the application.
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
const defaultId = "11111111-1111-4111-8111-111111111111";
const defaultHousehold = "33333333-3333-4333-8333-333333333333";
const hashId = email => { const h = createHash("sha256").update(email).digest("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const idFor = email => ["new@example.com", "recipient@example.com", "outsider@example.com"].includes(email) ? hashId(email) : defaultId;
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
  if (url.pathname === "/test/reset" && req.method === "POST") { houses.clear(); people.splice(0); access.splice(0); invites.splice(0); requests.clear(); return send(200, {}); }
  if (url.pathname.startsWith("/rest/v1/")) {
    const claims = JSON.parse(Buffer.from(req.headers.authorization.split(" ")[1].split(".")[1], "base64url"));
    const email = claims.email; const id = setup(email);
    const ownHouses = () => access.filter(a => a.user_id === id).map(a => a.household_id);
    const table = url.pathname.slice("/rest/v1/".length);
    const filter = (rows) => rows.filter(row => [...url.searchParams].every(([key, value]) => {
      if (["select", "order", "limit"].includes(key)) return true;
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      return true;
    }));
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
      if (rpc === "accept_household_invitation") {
        const invitation = invites.find(i => i.token_hash === body.p_token_hash && i.invited_email === email && !i.consumed_at && !i.revoked_at);
        if (!invitation) return denied();
        invitation.consumed_at = new Date().toISOString();
        access.push({ household_id: invitation.household_id, user_id: id, role: "member", created_at: new Date().toISOString() });
        const existing = people.find(p => p.id === invitation.participant_id);
        if (existing) existing.linked_user_id = id;
        else people.push({ id: randomUUID(), household_id: invitation.household_id, linked_user_id: id, first_name: body.p_first_name, last_name: body.p_last_name, member_type: "adult", archived_at: null });
        return send(200, invitation.household_id);
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
