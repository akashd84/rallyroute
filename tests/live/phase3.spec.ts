import { test, expect, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test.skip(process.env.RALLYROUTE_TEST_PHASE3_BROWSER !== "1", "Explicit Dev opt-in required");
test.setTimeout(90000);
async function fillAddress(form: Locator, name: string) {
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Address line 1").fill("600 Peachtree Street NE");
  await form.getByLabel("City").fill("Atlanta");
  await form.getByLabel("State / region").fill("GA");
  await form.getByLabel("Postal code").fill("30308");
}

test("real Dev: signed-in household and destination create/edit", async ({ page, context }) => {
  const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`)
    throw new Error("Application URL must match linked Dev before live browser testing.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID();
  const email = `phase3-smoke-${suffix}@example.test`;
  const householdName = `Phase3 smoke household ${suffix}`;
  const groupName = `Phase3 smoke group ${suffix}`;
  const created = await admin.auth.admin.createUser({ email, password: randomUUID() + randomUUID(), email_confirm: true });
  // No OTP/email delivery: this disposable account is explicitly confirmed.
  if (created.error || !created.data.user) throw new Error("Disposable Dev account creation failed.");
  const userId = created.data.user.id;
  try {
    // Generate a verification token without sending email, then establish SSR cookies.
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token) throw new Error("Disposable session token generation failed.");
    const cookies: { name: string; value: string; path: string }[] = [];
    const signedIn = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: { getAll: () => [], setAll: values => { cookies.splice(0, cookies.length, ...values.map(v => ({ name: v.name, value: v.value, path: v.options.path ?? "/" }))); } },
    });
    const verified = await signedIn.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (verified.error) throw new Error("Disposable Dev sign-in verification failed.");
    await context.addCookies(cookies.map(cookie => ({ ...cookie, domain: "127.0.0.1", httpOnly: false, secure: false, sameSite: "Lax" as const })));
    await page.goto("/onboarding");
    await page.getByLabel("First name", { exact: true }).fill("Phase3");
    await page.getByLabel("Last name", { exact: true }).fill("Smoke");
    await page.getByLabel("Household name", { exact: true }).fill(householdName);
    await page.getByRole("button", { name: "Create household", exact: true }).click();
    await expect(page).toHaveURL(/\/households\/[a-z0-9-]+$/);
    const householdUrl = page.url();
    await page.goto(householdUrl + "/locations/add");
    const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Save address", exact: true }) }).last();
    await fillAddress(add, "Public building pickup");
    await add.getByRole("button", { name: "Save address", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Saved.");
    await page.getByRole("link", { name: "Saved addresses", exact: true }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Public building pickup", exact: true }) }).last();
    await expect(section.getByText("Coordinates are not available yet", { exact: false })).toHaveCount(0);
    await expect(section.getByText("© OpenStreetMap contributors", { exact: true })).toBeVisible();
    await expect(section.locator("address input, address select, address textarea, address button")).toHaveCount(0);
    await expect(section.locator("address")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Public building pickup", exact: true })).toBeVisible();
    await page.goto("/groups/new");
    await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: householdName });
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Group type").selectOption("club");
    await page.getByRole("button", { name: "Create group", exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/(?!new$)[a-z0-9-]+$/);
    await page.getByRole("link", { name: "Events and destinations" }).click();
    const destination = page.locator("form").filter({ has: page.getByRole("button", { name: "Save destination", exact: true }) }).first();
    await fillAddress(destination, "Public building destination");
    await destination.getByRole("button", { name: "Save destination", exact: true }).click();
    await expect(destination.getByRole("status")).toHaveText("Saved.");
    const details = page.locator("details").filter({ has: page.locator("summary", { hasText: "Public building destination" }) });
    await details.locator("summary").click();
    const destinationEdit = details.locator("form").filter({ has: page.getByRole("button", { name: "Save destination", exact: true }) });
    await destinationEdit.getByLabel("Name", { exact: true }).fill("Verified destination edit");
    await destinationEdit.getByLabel("Address line 1").fill("600 Peachtree St NE");
    page.once("dialog", dialog => dialog.accept());
    await destinationEdit.getByRole("button", { name: "Save destination", exact: true }).click();
    await expect(page.locator("summary", { hasText: "Verified destination edit" })).toBeVisible();
    await page.reload();
    await expect(page.locator("summary", { hasText: "Verified destination edit" })).toBeVisible();
  } finally {
    // Restrict cleanup to this uniquely named disposable identity and exclusive household.
    const directory = mkdtempSync(join(tmpdir(), "rallyroute-browser-cleanup-"));
    try {
      const file = join(directory, "cleanup.sql");
      writeFileSync(file, `begin;
do $$ begin
 if not exists(select 1 from auth.users where id='${userId}' and email='${email}') then raise exception 'Disposable identity mismatch';end if;
 if exists(select 1 from public.household_access a join public.households h on h.id=a.household_id where h.display_name='${householdName}' and a.user_id<>'${userId}') then raise exception 'Refusing cleanup of shared household';end if;
end $$;
delete from public.groups where created_by_user_id='${userId}' and name='${groupName}';
delete from private.household_creation_requests where user_id='${userId}';
delete from public.households where display_name='${householdName}' and id in (select household_id from public.household_access where user_id='${userId}');
delete from private.provider_budgets where provider='geocoding' and subject='${userId}';
commit;`, { mode: 0o600 });
      const cleanup = spawnSync("pnpm", ["supabase", "db", "query", "--linked", "--file", file], { encoding: "utf8" });
      if (cleanup.status !== 0) throw new Error("Disposable Dev fixture cleanup failed; provider output suppressed.");
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) throw new Error("Disposable Dev account cleanup failed.");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
