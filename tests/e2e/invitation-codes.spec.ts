import { test, expect, type Page } from "@playwright/test";
// Mocked provider coverage; real grants/RLS and limits are tested in PostgreSQL.
async function login(page: Page, email = "adult@example.com", destination = /\/account$/) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456"); await page.getByRole("button", { name: "Verify code" }).click(); await expect(page).toHaveURL(destination);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("mocked: manual household code normalization, copy controls and explicit acceptance", async ({ page, browser }) => {
  await login(page); await page.getByRole("link", { name: "Example household", exact: true }).click();
  await page.getByLabel("Invited email").fill("recipient@example.com"); await page.getByRole("button", { name: "Create invitation", exact: true }).click();
  const code = await page.getByLabel("Invitation code", { exact: true }).inputValue();
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  await expect(page.getByRole("button", { name: "Copy code", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy invitation link", exact: true })).toBeVisible();
  const context = await browser.newContext(); const recipient = await context.newPage();
  await recipient.goto("/join"); await recipient.getByRole("combobox", { name: "Invitation type" }).selectOption("household");
  await recipient.getByLabel("Invitation code", { exact: true }).fill("O0I1Ll"); await recipient.getByRole("button", { name: "Continue with code" }).click();
  await expect(recipient.getByRole("status")).toContainText("valid six-character"); await expect(recipient.getByLabel("Invitation code")).toHaveValue("O0I1Ll");
  await recipient.getByLabel("Invitation code").fill(`${code.slice(0,3).toLowerCase()} - ${code.slice(3).toLowerCase()}`);
  await recipient.getByRole("button", { name: "Continue with code" }).click(); await expect(recipient).toHaveURL(/\/sign-in$/);
  await login(recipient, "recipient@example.com", /\/household-invitations\/accept$/);
  await expect(recipient.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await recipient.getByRole("button", { name: "Accept invitation" }).click(); await expect(recipient.getByText("Your role: Member")).toBeVisible();
  await context.close();
});
test("mocked: manual group entry reaches guarded preview, throttling preserves context and recovers", async ({ page, request }) => {
  await login(page); await page.goto("/groups/new"); await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("Code club"); await page.getByLabel("Group type").selectOption("club"); await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/[a-f0-9-]+$/); await page.getByRole("button", { name: "Create reusable link" }).click();
  const code = await page.getByLabel("Invitation code").inputValue();
  await request.post("http://127.0.0.1:54329/test/budget", { data: { email: "adult@example.com", minuteCount: 10 } });
  await page.goto("/join"); await page.getByRole("combobox", { name: "Invitation type" }).selectOption("group"); await page.getByLabel("Invitation code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Continue with code" }).click(); await expect(page).toHaveURL(/\/group-invitations\/accept$/);
  await expect(page.locator("main").getByRole("alert")).toContainText("Too many invitation attempts");
  expect((await page.context().cookies()).some(c => c.name === "rallyroute-group-invite")).toBe(true);
  await request.post("http://127.0.0.1:54329/test/budget", { data: { email: "adult@example.com", minuteCount: 0 } });
  await page.reload(); await expect(page.getByRole("heading", { name: "Code club", exact: true })).toBeVisible();
});
test("mocked: original long household link remains valid through guarded acceptance", async ({ page, browser, request }) => {
  await login(page); const token = "d".repeat(64);
  await request.post("http://127.0.0.1:54329/test/legacy", { data: { kind: "household", token } });
  const context = await browser.newContext(); const recipient = await context.newPage();
  await recipient.goto(`/household-invitations/open#${token}`); await expect(recipient).toHaveURL(/\/sign-in$/);
  await login(recipient, "recipient@example.com", /\/household-invitations\/accept$/);
  await recipient.getByRole("button", { name: "Accept invitation" }).click(); await expect(recipient.getByText("Your role: Member")).toBeVisible();
  await context.close();
});
test("mocked: original long group link still previews without automatic redemption", async ({ page, request }) => {
  await login(page); await page.goto("/groups/new"); await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("Legacy club"); await page.getByLabel("Group type").selectOption("club"); await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/[a-f0-9-]+$/); const groupId = page.url().split("/").at(-1); const token = "e".repeat(64);
  await request.post("http://127.0.0.1:54329/test/legacy", { data: { kind: "group", groupId, token } });
  await page.goto(`/group-invitations/open#${token}`); await expect(page).toHaveURL(/\/group-invitations\/accept$/);
  expect(page.url()).not.toContain("#"); await expect(page.getByRole("heading", { name: "Legacy club", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join group" })).toBeVisible();
});
