import { test, expect } from "@playwright/test";

// Mock-provider checks: no claim of live Supabase verification.
test("shell routes require authentication", async ({ page }) => {
  for (const route of ["/", "/groups", "/calendar", "/messages", "/profile"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  }
});

test("responsive shell navigation and content remain accessible", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("adult@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  for (const width of [375, 390, 430, 1280]) {
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
  await page.goto("/groups/55555555-5555-4555-8555-555555555555/events/new");
  await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Groups", exact: true })).toHaveAttribute("aria-current", "page");
  for (const suffix of ["members", "settings"]) {
    await page.goto(`/groups/55555555-5555-4555-8555-555555555555/${suffix}`);
    await expect(page.getByText("UX design pending")).toBeVisible();
  }
  await page.goto("/onboarding");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
});
