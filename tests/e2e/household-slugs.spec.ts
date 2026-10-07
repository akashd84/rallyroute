import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "adult@example.com") {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(email === "adult@example.com" ? /\/account$/ : /\/onboarding$/);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("mocked: household slugs protect all nested routes and replace UUID URLs", async ({ page, browser }) => {
  await page.goto("/households/example-household/locations");
  await expect(page).toHaveURL(/\/sign-in$/);
  await login(page);
  await expect(page.getByRole("link", { name: "Example household", exact: true })).toHaveAttribute("href", "/households/example-household");
  for (const suffix of ["", "/locations", "/connections", "/carpools", "/settings"]) {
    expect((await page.goto(`/households/example-household${suffix}`))?.status()).toBe(200);
  }
  for (const slug of ["33333333-3333-4333-8333-333333333333", "missing-household", "Example-household", "bad--slug", "new"]) {
    for (const suffix of ["", "/locations", "/connections", "/carpools", "/settings", "/carpools/11111111-1111-4111-8111-111111111111"]) {
      const path = `/households/${slug}${suffix}`;
      expect((await page.goto(path))?.status()).toBe(404);
      await expect(page).toHaveURL(path);
    }
  }
  const context = await browser.newContext();
  const outsider = await context.newPage();
  try {
    await login(outsider, "recipient@example.com");
    for (const suffix of ["", "/locations", "/connections", "/carpools", "/settings", "/carpools/11111111-1111-4111-8111-111111111111"]) {
      expect((await outsider.goto(`/households/example-household${suffix}`))?.status()).toBe(404);
    }
  } finally { await context.close(); }
});
test("mocked: household rename preserves its slug and updates header name", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Example household", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save household name", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Household settings", exact: true })).toHaveAttribute("href", "/households/example-household/settings");
  await page.getByRole("link", { name: "Household settings", exact: true }).click();
  await expect(page).toHaveURL("/households/example-household/settings");
  await page.getByLabel("Household name", { exact: true }).fill("Renamed household");
  await page.getByRole("button", { name: "Save household name", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("link", { name: "Your household", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Renamed household", exact: true })).toBeVisible();
  await expect(page).toHaveURL("/households/example-household");
  await page.reload();
  await expect(page.getByRole("banner")).toContainText("Renamed household");
  await expect(page.getByRole("link", { name: "Connections", exact: true })).toHaveAttribute("href", "/households/example-household/connections");
  expect((await page.goto("/households/renamed-household"))?.status()).toBe(404);
});
