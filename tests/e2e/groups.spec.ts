import { createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
// Explicitly mocked Auth/PostgREST browser tests; real authorization is pgTAP coverage.
async function login(page: Page, email = "adult@example.com", destination = /\/account$/) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456"); await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(destination);
}
async function createGroup(page: Page, name = "Example club") {
  await page.goto("/groups/new"); await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill(name); await page.getByLabel("Group type").selectOption("club");
  await page.getByLabel("Description").fill("A trusted group for shared trips.");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/(?!new$)[a-z0-9-]+$/);
}
async function directLink(page: Page) {
  await page.getByRole("link", { name: "Invite to group", exact: true }).click();
  await expect(page).toHaveURL(/\/group\/[^/]+\/invite$/);
  await expect(page.getByLabel("Household use limit")).toHaveCount(0);
  await page.getByLabel("Invited email").fill("recipient@example.com");
  await page.getByRole("button", { name: "Create direct invitation" }).click();
  const link = await page.locator("form").filter({ has: page.getByRole("button", { name: "Create direct invitation" }) }).getByLabel("Invitation link").inputValue();
  await page.getByRole("link", { name: /^Back to / }).click();
  return link;
}
async function reusableLink(page: Page, limit = "") {
  await page.getByRole("link", { name: "Share group", exact: true }).click();
  await expect(page).toHaveURL(/\/group\/[^/]+\/share$/);
  await expect(page.getByLabel("Invited email")).toHaveCount(0);
  await page.getByLabel("Household use limit").fill(limit);
  await page.getByRole("button", { name: "Create reusable link" }).click();
  const link = await page.locator("form").filter({ has: page.getByRole("button", { name: "Create reusable link" }) }).getByLabel("Invitation link").inputValue();
  await page.getByRole("link", { name: /^Back to / }).click();
  return link;
}
async function onboard(page: Page, name: string, destination: RegExp) {
  await page.getByRole("link", { name: "Create a household or complete setup" }).click();
  await page.getByLabel("Household name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create household", exact: true }).click();
  await expect(page).toHaveURL(destination);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("mocked: protected creation, error/pending recovery, settings and initial membership", async ({ page }) => {
  await page.goto("/groups/new"); await expect(page).toHaveURL(/\/sign-in$/); await login(page);
  await page.goto("/groups/new"); await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group type").selectOption("workplace"); await page.getByLabel("Group name").fill("Provider unavailable");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Unable to save");
  await page.getByLabel("Group name").fill("Slow group"); await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Slow group", exact: true })).toBeVisible();
  await expect(page.getByText("Your group role: Group Owner")).toBeVisible();
  const overview = page.getByRole("region", { name: "Group overview", exact: true });
  await expect(overview.getByText("Group Members", { exact: true })).toBeVisible();
  await expect(overview.locator("dd").first()).toHaveText("1");
  await expect(overview.getByText("Active households", { exact: true })).toBeVisible();
  for (const label of ["Needs Rides", "Driver Available", "Carpools"]) {
    const metric = overview.locator("dl").filter({ has: page.getByText(label, { exact: true }) });
    await expect(metric.locator("dd").first()).toHaveText("0");
  }
  const headingBox = await page.getByRole("heading", { name: "Slow group", exact: true }).boundingBox();
  const overviewBox = await overview.boundingBox();
  const eventsBox = await page.getByRole("region", { name: "Events", exact: true }).boundingBox();
  expect(overviewBox!.y).toBeGreaterThan(headingBox!.y + headingBox!.height);
  expect(overviewBox!.y + overviewBox!.height).toBeLessThan(eventsBox!.y);

  await expect(page.getByRole("link", { name: "Example household", exact: true })).toBeVisible();
  const groupUrl = page.url();
  await expect(page.getByLabel("Group name")).toHaveCount(0);
  await page.getByRole("link", { name: "Group settings", exact: true }).click();
  await expect(page).toHaveURL(`${groupUrl}/settings`);
  await page.getByLabel("Group name").fill("Updated group"); await page.getByRole("button", { name: "Save group settings" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await expect(page).toHaveURL(`${groupUrl}/settings`);
  await page.reload();
  await expect(page.getByLabel("Group name")).toHaveValue("Updated group");
  await page.getByRole("link", { name: "Back to Updated group", exact: true }).click();
  await expect(page).toHaveURL(groupUrl);
  await expect(page.getByRole("heading", { name: "Updated group", exact: true })).toBeVisible();
  await page.goto("/groups");
  await expect(page.getByRole("region", { name: "Groups I Manage", exact: true }).getByRole("link", { name: "Updated group" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Groups I'm In", exact: true }).getByRole("link", { name: "Updated group" })).toHaveCount(0);
});
test("mocked: direct invitation survives sign-in and onboarding, explicit household join and dashboard restrictions", async ({ page, browser }) => {
  await login(page); await createGroup(page); const groupUrl = page.url(); const link = await directLink(page);
  const context = await browser.newContext(); const recipient = await context.newPage();
  await recipient.goto(link); await expect(recipient).toHaveURL(/\/sign-in$/);
  const cookie = (await context.cookies()).find(c => c.name === "rallyroute-group-invite");
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.value).toBe(createHash("sha256").update(link.split("=")[1]).digest("hex")); expect(recipient.url()).not.toContain("#");
  await login(recipient, "recipient@example.com", /\/group-invitations\/accept$/);
  await expect(recipient.getByRole("heading", { name: "Example club", exact: true })).toBeVisible();
  await expect(recipient.getByRole("button", { name: "Join group" })).toHaveCount(0);
  await onboard(recipient, "Recipient home", /\/group-invitations\/accept$/);
  await expect(recipient.getByRole("combobox", { name: "Household", exact: true })).toHaveValue("");
  await recipient.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Recipient home" });
  await recipient.getByRole("button", { name: "Join group" }).click(); await expect(recipient).toHaveURL(groupUrl);
  await expect(recipient.getByText("Your group role: Group Member")).toBeVisible();
  await expect(recipient.getByRole("region", { name: "Group overview", exact: true }).locator("dd").first()).toHaveText("2");
  await expect(recipient.getByRole("button", { name: "Save group settings" })).toHaveCount(0);
  await expect(recipient.getByLabel("Invited email")).toHaveCount(0);
  await expect(recipient.getByRole("link", { name: "Recipient home", exact: true })).toBeVisible();
  await expect(recipient.getByText("Example household", { exact: true })).toHaveCount(0);
  expect((await context.cookies()).some(c => c.name === "rallyroute-group-invite")).toBe(false);
  await recipient.reload(); await expect(recipient.getByRole("heading", { name: "Example club", exact: true })).toBeVisible();
  await expect(recipient.getByRole("link", { name: "Group settings", exact: true })).toHaveCount(0);
  await expect(recipient.getByRole("link", { name: "Invite to group", exact: true })).toHaveCount(0);
  await expect(recipient.getByRole("link", { name: "Share group", exact: true })).toHaveCount(0);
  for (const route of ["invite", "share"]) {
    await recipient.goto(groupUrl.replace("/groups/", "/group/") + `/${route}`);
    await expect(recipient.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  }
  await recipient.goto(`${groupUrl}/settings`);
  await expect(recipient.getByRole("button", { name: "Save group settings" })).toHaveCount(0);
  await expect(recipient.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await recipient.goto("/groups");
  await expect(recipient.getByRole("region", { name: "Groups I'm In", exact: true }).getByRole("link", { name: "Example club", exact: true })).toHaveAttribute("href", new URL(groupUrl).pathname);
  await expect(recipient.getByRole("region", { name: "Groups I Manage", exact: true }).getByRole("link")).toHaveCount(0);
  await context.close();
});
test("mocked: wrong email preview denial, reusable joining, explicit selection and revocation", async ({ page, browser }) => {
  await login(page); await createGroup(page); const direct = await directLink(page);
  const context = await browser.newContext(); const outsider = await context.newPage();
  await outsider.goto(direct); await expect(outsider).toHaveURL(/\/sign-in$/);
  await login(outsider, "outsider@example.com", /\/group-invitations\/accept$/);
  await expect(outsider.locator("main").getByRole("alert")).toContainText("invited email"); await expect(outsider.getByRole("heading", { name: "Example club", exact: true })).toHaveCount(0);
  const link = await reusableLink(page, "2"); await outsider.goto(link); await expect(outsider).toHaveURL(/\/group-invitations\/accept$/);
  await onboard(outsider, "Outside home", /\/group-invitations\/accept$/);
  await outsider.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Outside home" });
  await outsider.getByRole("button", { name: "Join group" }).click(); await expect(outsider).toHaveURL(page.url());
  await page.getByRole("link", { name: "Share group", exact: true }).click();
  const row = page.locator("li").filter({ hasText: "Reusable link" });
  page.once("dialog", dialog => dialog.dismiss()); await row.getByRole("button", { name: "Revoke group invitation" }).click();
  await expect(row.getByRole("button", { name: "Revoke group invitation" })).toBeVisible();
  page.once("dialog", dialog => dialog.accept()); await row.getByRole("button", { name: "Revoke group invitation" }).click();
  await expect(row).toContainText("revoked");
  await outsider.goto(link); await expect(outsider.locator("main").getByRole("alert")).toContainText("unavailable");
  await outsider.getByRole("button", { name: "Dismiss group invitation" }).click(); await expect(outsider).toHaveURL(/\/groups$/);
  expect((await context.cookies()).some(c => c.name === "rallyroute-group-invite")).toBe(false); await context.close();
});
test("mocked: latest invitation replaces earlier household or group continuation", async ({ page, context }) => {
  await login(page); await createGroup(page); const groupLink = await reusableLink(page);
  await context.addCookies([{ name: "rallyroute-household-invite", value: "a".repeat(64), url: "http://127.0.0.1:3100", httpOnly: true }]);
  await page.goto(groupLink); await expect(page).toHaveURL(/\/group-invitations\/accept$/);
  let cookies = await context.cookies(); expect(cookies.some(c => c.name === "rallyroute-household-invite")).toBe(false);
  await page.goto(`/household-invitations/open#${"b".repeat(64)}`); await expect(page).toHaveURL(/\/household-invitations\/accept$/);
  cookies = await context.cookies(); expect(cookies.some(c => c.name === "rallyroute-group-invite")).toBe(false); expect(cookies.some(c => c.name === "rallyroute-household-invite")).toBe(true);
});
test("mocked: selecting a second household joins only that household", async ({ page }) => {
  await login(page); await createGroup(page); const groupUrl = page.url(); const link = await reusableLink(page);
  await page.goto(link); await expect(page).toHaveURL(/\/group-invitations\/accept$/);
  await page.goto("/onboarding");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Create household", exact: true }) });
  await create.getByLabel("Household name", { exact: true }).fill("Second household");
  await create.getByRole("button", { name: "Create household", exact: true }).click();
  await expect(page).toHaveURL(/\/group-invitations\/accept$/);
  await expect(page.getByRole("combobox", { name: "Household", exact: true }).locator("option")).toHaveCount(3);
  await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Second household" });
  await page.getByRole("button", { name: "Join group" }).click(); await expect(page).toHaveURL(groupUrl);
  await expect(page.getByRole("link", { name: "Example household", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Second household", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Share group", exact: true }).click();
  await expect(page.locator("li").filter({ hasText: "Reusable link" })).toContainText("1 / unlimited");
});
test("mocked: household Members get Owner guidance for group creation and joining", async ({ page, browser }) => {
  await login(page); await createGroup(page); const groupLink = await reusableLink(page);
  await page.goto("/account"); await page.getByRole("link", { name: "Example household", exact: true }).click(); await page.getByRole("link", { name: "Household settings", exact: true }).click();
  await page.getByLabel("Invited email").fill("recipient@example.com"); await page.getByRole("button", { name: "Create invitation", exact: true }).click();
  const householdLink = await page.getByLabel("Invitation link", { exact: true }).inputValue();
  const context = await browser.newContext(); const recipient = await context.newPage();
  await recipient.goto(householdLink); await expect(recipient).toHaveURL(/\/sign-in$/);
  await login(recipient, "recipient@example.com", /\/household-invitations\/accept$/);
  await recipient.getByRole("button", { name: "Accept invitation" }).click();
  await expect(recipient.getByText("Your role: Member")).toBeVisible();
  await recipient.goto("/groups/new"); await expect(recipient.getByRole("button", { name: "Create group", exact: true })).toHaveCount(0);
  await expect(recipient.getByText("Only household Owners can create a group.", { exact: false })).toBeVisible();
  await recipient.goto(groupLink); await expect(recipient).toHaveURL(/\/group-invitations\/accept$/);
  await expect(recipient.getByRole("button", { name: "Join group" })).toHaveCount(0);
  await expect(recipient.getByText("If you are a Member, ask your household Owner.", { exact: false })).toBeVisible();
  await context.close();
});
