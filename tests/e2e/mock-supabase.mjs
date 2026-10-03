// Test-only HTTP provider. Never imported by the application.
import http from "node:http";
const id = "11111111-1111-4111-8111-111111111111";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function session(email = "adult@example.com") {
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
  if (url.pathname === "/rest/v1/profiles") {
    const claims = JSON.parse(Buffer.from(req.headers.authorization.split(" ")[1].split(".")[1], "base64url"));
    return send(200, claims.email === "missing@example.com" ? null : { id, first_name: "Alex", last_name: "Example" });
  }
  return send(404, { message: "Unknown mock endpoint" });
});
server.listen(54329, "127.0.0.1");
