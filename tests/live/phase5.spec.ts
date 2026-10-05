import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
test.skip(process.env.RALLYROUTE_TEST_PHASE5_BROWSER !== "1", "Explicit linked Dev opt-in required");
test.setTimeout(180000);
function query(sql: string) {
  const directory = mkdtempSync(join(tmpdir(), "rallyroute-phase5-browser-"));
  try {
    const file = join(directory, "query.sql"); writeFileSync(file, sql, { mode: 0o600 });
    const result = spawnSync("pnpm", ["supabase", "db", "query", "--linked", "--file", file], { encoding: "utf8" });
    if (result.status !== 0) throw new Error("Disposable Phase 5 fixture query failed; raw provider output suppressed.");
    return JSON.parse(result.stdout);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("real Dev: two-account consent, pickup revocation, lifecycle and concurrent transitions", async ({ browser }) => {
  const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Application must target linked Dev");
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID();
  const emails = [`phase5-a-${suffix}@example.test`, `phase5-b-${suffix}@example.test`];
  const realUsers: string[] = [], contexts: BrowserContext[] = [];
  const ids = new Map<string, string>();
  const original = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let fixture = readFileSync("supabase/tests/fixtures.sql", "utf8");
  for (const old of fixture.match(/20000000-0000-4000-8000-\d{12}/g) ?? []) if (!ids.has(old)) ids.set(old, randomUUID());
  const id = (n: number) => ids.get(original(n))!;
  const quoted = (values: string[]) => values.map(v => `'${v}'`).join(",");
  let initialized = false;
  async function signIn(context: BrowserContext, email: string) {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw new Error("Disposable sign-in token creation failed");
    const cookies: { name: string; value: string; path: string }[] = [];
    const client = createServerClient(url, publishable, { cookies: { getAll: () => [], setAll: values => { cookies.splice(0, cookies.length, ...values.map(v => ({ name: v.name, value: v.value, path: v.options.path ?? "/" }))); } } });
    const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (verified.error || !verified.data.session) throw new Error("Disposable sign-in failed");
    await context.addCookies(cookies.map(c => ({ ...c, domain: "127.0.0.1", httpOnly: false, secure: false, sameSite: "Lax" as const })));
    return createClient(url, publishable, { global: { headers: { Authorization: `Bearer ${verified.data.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  }
  async function share(page: Page, leg: "to_event" | "from_event") {
    await page.getByText("Share a pickup address", { exact: true }).click();
    await page.getByRole("combobox", { name: "Pickup address", exact: true }).selectOption(id(510));
    await page.getByRole("combobox", { name: "Event", exact: true }).selectOption(id(610));
    await page.getByRole("combobox", { name: "Direction", exact: true }).selectOption(leg);
    await page.getByRole("checkbox", { name: /Share this address with/ }).check();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Share pickup address", exact: true }).click();
    await expect(page.getByRole("button", { name: "Withdraw address sharing" })).toBeVisible();
  }
  try {
    for (let n = 0; n < 2; n++) {
      const created = await admin.auth.admin.createUser({ email: emails[n], email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Disposable account creation failed");
      realUsers.push(created.data.user.id); ids.set(original(n === 0 ? 1 : 4), created.data.user.id);
    }
    fixture = fixture.replace(/20000000-0000-4000-8000-\d{12}/g, old => ids.get(old)!);
    fixture = fixture.replace(/[a-z.]+@example\.test/g, old => `phase5-${suffix}-${old}`);
    query(`begin;\n${fixture}\n
update public.profiles set first_name='Phase5',last_name='Adult',onboarding_completed_at=now() where id in (${quoted(realUsers)});
update private.household_locations set address_line_1='Phase5 private pickup A',location=extensions.st_geogfromtext('SRID=4326;POINT(-84.2941 34.0754)') where id='${id(510)}';
update private.household_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.3785 33.9243)') where id='${id(511)}';
update public.event_locations set location=extensions.st_geogfromtext('SRID=4326;POINT(-84.388 33.749)') where id='${id(501)}';
update public.ride_participation set max_detour_minutes=120 where event_id='${id(610)}' and mode='can_drive';
commit;`);
    initialized = true;
    const a = await browser.newContext(), b = await browser.newContext(); contexts.push(a, b);
    const apiA = await signIn(a, emails[0]), apiB = await signIn(b, emails[1]);
    const pageA = await a.newPage(), pageB = await b.newPage();
    await pageA.goto(`/groups/${id(301)}/events/${id(610)}?household=${id(101)}`);
    const panel = pageA.getByRole("region", { name: "To event matches", exact: true });
    await panel.getByRole("button", { name: "Find matches", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Fixture Household B" })).toBeVisible();
    await panel.getByText("Request to connect", { exact: true }).click();
    await panel.getByRole("checkbox").check(); await panel.getByRole("button", { name: "Send connection request" }).click();
    await expect(pageA).toHaveURL(new RegExp(`/households/${id(101)}/connections$`));
    await pageB.goto(`/households/${id(102)}/connections`);
    await expect(pageB.getByText("Status: pending")).toBeVisible();
    await expect(pageB.getByText(emails[0], { exact: true })).toHaveCount(0);
    await expect(pageB.getByText(/Phase5 private pickup A/)).toHaveCount(0);
    query(`begin;update public.ride_participation set needs_reconfirmation=true where event_id='${id(610)}';commit;`);
    await pageB.getByRole("checkbox").check(); await pageB.getByRole("button", { name: "Accept connection" }).click();
    await expect(pageB.getByRole("link", { name: emails[0], exact: true })).toBeVisible();
    await pageA.reload(); await expect(pageA.getByRole("link", { name: emails[1], exact: true })).toBeVisible();
    await share(pageA, "to_event"); await pageB.reload();
    await expect(pageB.getByText(/Fixture pickup: Phase5 private pickup A/)).toBeVisible();
    const projection = await apiB.rpc("list_connections", { p_household_id: id(102) });
    expect(projection.error).toBeNull();
    for (const secret of [id(510), "location_id", "latitude", "longitude", "POINT("]) expect(JSON.stringify(projection.data)).not.toContain(secret);
    query(`begin;update private.household_locations set address_line_1='Phase5 revised pickup A',revision=revision+1 where id='${id(510)}';commit;`);
    await pageB.reload(); await expect(pageB.getByText(/Phase5 private pickup A/)).toHaveCount(0);
    await pageA.reload(); await share(pageA, "from_event"); await pageB.reload();
    await expect(pageB.getByText(/Phase5 revised pickup A/)).toBeVisible();
    await pageA.getByRole("button", { name: "Withdraw address sharing" }).click(); await pageB.reload();
    await expect(pageB.getByText(/Phase5 revised pickup A/)).toHaveCount(0);
    pageB.once("dialog", dialog => dialog.accept()); await pageB.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(pageB.getByText("Status: disconnected")).toBeVisible();
    await expect(pageB.getByRole("link", { name: emails[0], exact: true })).toHaveCount(0);

    // Simultaneous requests converge to one pending connection; acceptance is idempotent.
    query(`begin;update public.ride_participation set needs_reconfirmation=false where event_id='${id(610)}';commit;`);
    const pair = `${id(800)}:${id(803)}`;
    const args = { p_user_id: realUsers[0], p_event_id: id(610), p_household_id: id(101), p_leg: "to_event", p_max_distance: 100000, p_keys: [pair], p_limit: 1 };
    const candidate = await admin.rpc("match_candidates", args);
    if (candidate.error || !candidate.data?.length) throw new Error("Concurrent fixture candidate unavailable");
    const requestArgs = { p_user_id: realUsers[0], p_event_id: id(610), p_household_id: id(101), p_other_household_id: id(102), p_leg: "to_event", p_pair_key: pair, p_fingerprint: (candidate.data[0].candidate as { fingerprint: string }).fingerprint, p_max_distance: 100000 };
    const requested = await Promise.all([admin.rpc("request_connection", requestArgs), admin.rpc("request_connection", requestArgs)]);
    for (const r of requested) expect(r.error).toBeNull();
    const results = requested.map(r => r.data as { id: string; status: string });
    expect(results.map(r => r.status).sort()).toEqual(["existing", "ok"]); expect(results[0].id).toBe(results[1].id);
    const connectionId = results[0].id;
    const accepted = await Promise.all([apiB.rpc("connection_action", { p_command: "accept", p_data: { householdId: id(102), connectionId, revision: 1, consent: "yes" } }), apiB.rpc("connection_action", { p_command: "accept", p_data: { householdId: id(102), connectionId, revision: 1, consent: "yes" } })]);
    for (const r of accepted) { expect(r.error).toBeNull(); expect(r.data).toMatchObject({ status: "ok" }); }
    query(`begin;update public.group_memberships set status='left' where household_id='${id(101)}' and group_id='${id(301)}';update public.group_memberships set status='active' where household_id='${id(101)}' and group_id='${id(301)}';commit;`);
    const ended = await apiA.rpc("list_connections", { p_household_id: id(101) });
    expect(ended.error).toBeNull(); expect(ended.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: connectionId, status: "disconnected", contacts: [], pickups: [] })]));
  } finally {
    for (const context of contexts) await context.close();
    if (initialized) query(`begin;
delete from public.groups where id='${id(301)}';
delete from public.households where id in (${quoted(Array.from({ length: 5 }, (_, i) => id(i + 101)))});
delete from auth.users where id in (${quoted(Array.from({ length: 8 }, (_, i) => id(i + 1)).filter(v => !realUsers.includes(v)))}) and email like 'phase5-${suffix}-%@example.test';
commit;`);
    for (const userId of realUsers) { const removed = await admin.auth.admin.deleteUser(userId); if (removed.error) throw new Error("Disposable real Auth account cleanup failed"); }
    if (initialized) {
      const remaining = query(`select count(*)::integer as remaining from auth.users where id in (${quoted(Array.from({ length: 8 }, (_, i) => id(i + 1)))});`);
      expect(remaining.rows[0].remaining).toBe(0);
    }
  }
});
