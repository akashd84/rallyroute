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

test("mocked: slug routes resolve groups, protect nested pages and reject UUID URLs", async ({ page, request, browser }) => {
  await page.goto("/groups/match-club/events/new");
  await expect(page).toHaveURL(/\/sign-in$/);
  await login(page);
  await page.goto("/groups");
  await expect(page.getByRole("region", { name: "Groups I Manage", exact: true })).toContainText("You do not manage any groups yet.");
  await expect(page.getByRole("region", { name: "Groups I'm In", exact: true })).toContainText("You have not joined any other groups yet.");
  const seeded = await request.post("http://127.0.0.1:54329/test/matching", { data: { mode: "success" } });
  const eventUrl = (await seeded.json()).url;
  await page.goto("/groups");
  await expect(page.getByRole("link", { name: "Match club", exact: true })).toHaveAttribute("href", "/groups/match-club");
  await page.goto(eventUrl);
  await expect(page.getByRole("heading", { name: "Match event", exact: true })).toBeVisible();
  for (const path of ["/groups/match-club/55555555-5555-4555-8555-555555555555", "/groups/match-club/events/55555555-5555-4555-8555-555555555555", "/groups/match-club/Match-event", "/groups/match-club/missing-event", "/groups/match-club/bad--slug"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(path);
  }
  for (const suffix of ["", "/events", "/events/new", "/events/series/new", "/events/destinations", "/members"]) {
    const response = await page.goto(`/groups/match-club${suffix}`);
    expect(response?.status()).toBe(200);
  }
  for (const suffix of ["/events/new", "/events/series/new", "/events/destinations"]) {
    await page.goto(`/groups/match-club${suffix}`);
    await expect(page.getByText("Group Owners and Admins can manage events and destinations.")).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(0);
  }
  for (const slug of ["missing-club", "Match-Club", "bad--slug", "44444444-4444-4444-8444-444444444444"]) {
    for (const suffix of ["", "/events", "/events/new", "/events/series/new", "/events/destinations", "/members", "/settings", "/events/55555555-5555-4555-8555-555555555555"]) {
      const response = await page.goto(`/groups/${slug}${suffix}`);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveURL(`/groups/${slug}${suffix}`);
    }
  }
  await page.goto("/groups/new");
  await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("Other Club");
  await page.getByLabel("Group type").selectOption("club");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL("/groups/other-club");
  await expect(page.getByRole("region", { name: "Events", exact: true })).toContainText("No events in the next 7 days.");
  await expect(page.getByRole("region", { name: "Events", exact: true }).getByRole("link", { name: "Match event", exact: true })).toHaveCount(0);
  const wrongGroup = await page.goto("/groups/other-club/match-event");
  expect(wrongGroup?.status()).toBe(404);
  for (const path of ["/groups/other-club/match-event/recurring", "/groups/match-club/match-event/recurring", "/groups/match-club/missing-event/recurring", "/groups/match-club/55555555-5555-4555-8555-555555555555/recurring"]) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
  const context = await browser.newContext();
  const outsider = await context.newPage();
  await login(outsider, "recipient@example.com");
  await outsider.goto("/groups/match-club/events/new");
  await expect(outsider.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await context.close();
});

test("mocked: renaming preserves the URL and unknown notice values are ignored", async ({ page }) => {
  await login(page);
  await page.goto("/groups/new");
  await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("School Club");
  await page.getByLabel("Group type").selectOption("club");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL("/groups/school-club");
  await page.getByRole("link", { name: "Group settings", exact: true }).click();
  await page.getByLabel("Group name").fill("New group name");
  await page.getByRole("button", { name: "Save group settings" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.getByRole("link", { name: "Back to New group name", exact: true }).click();
  await expect(page).toHaveURL("/groups/school-club");
  await page.goto("/groups?notice=group-link");
  await expect(page.getByRole("status")).toContainText("Your change was saved");
  await page.goto("/groups?notice=untrusted-text");
  await expect(page.getByText("untrusted-text")).toHaveCount(0);
  await page.goto("/groups/new");
  await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("School Club");
  await page.getByLabel("Group type").selectOption("club");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/school-club-[0-9a-f]{8}$/);
});
