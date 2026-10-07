import { test, expect } from "@playwright/test";

// Mock-provider checks: no claim of live Supabase verification.
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("shell routes require authentication", async ({ page }) => {
  for (const route of ["/", "/groups", "/calendar", "/messages", "/profile"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  }
});

test("responsive shell navigation and content remain accessible", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("adult@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  for (const width of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [label, route] of [["Home", "/"], ["Groups", "/groups"], ["Calendar", "/calendar"], ["Messages", "/messages"], ["Profile", "/profile"]]) {
      const nav = page.getByRole("navigation", { name: "Primary navigation" });
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(route);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      if (label === "Home") await page.screenshot({ path: `/tmp/rallyroute-shell-${width}.png` });
      const box = await nav.getByRole("link", { name: label, exact: true }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const content = await page.getByRole("main").locator(":scope > *").last().boundingBox();
      const navBox = await nav.boundingBox();
      expect(content!.y + content!.height).toBeLessThanOrEqual(navBox!.y);
    }
  }
  await request.post("http://127.0.0.1:54329/test/matching", { data: { mode: "success" } });
  await page.goto("/groups/match-club/events/new");
  await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Groups", exact: true })).toHaveAttribute("aria-current", "page");
  for (const suffix of ["members"]) {
    await page.goto(`/groups/match-club/${suffix}`);
    await expect(page.getByText("UX design pending")).toBeVisible();
  }
  await page.goto("/onboarding");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});


test("header centers a single household and remembers an authorized household choice", async ({ page, request, context }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("adult@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const header = page.getByRole("banner");
  const name = header.getByText("Example household", { exact: true });
  await expect(name).toBeVisible();
  await expect(header.getByRole("combobox")).toHaveCount(0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await name.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
    await expect(header.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  }
  await request.post("http://127.0.0.1:54329/test/matching");
  await page.reload();
  const selector = header.getByRole("combobox", { name: "Current household", exact: true });
  await expect(selector).toHaveCount(1);
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption({ label: "Other own household" });
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue("77777777-7777-4777-8777-777777777777");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Groups", exact: true }).click();
  await expect(selector).toHaveValue("77777777-7777-4777-8777-777777777777");
  await page.reload();
  await expect(selector).toHaveValue("77777777-7777-4777-8777-777777777777");
  await page.goto("/join");
  await expect(selector).toHaveValue("77777777-7777-4777-8777-777777777777");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await selector.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 160)).toBeLessThan(2);
  // A stale or tampered preference cannot add an inaccessible household to the header.
  await context.addCookies([{ name: "rallyroute-household", value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: "http://127.0.0.1:3100" }]);
  await page.reload();
  await expect(selector).toHaveValue("33333333-3333-4333-8333-333333333333");
  await expect(selector.locator("option")).toHaveCount(2);
});
