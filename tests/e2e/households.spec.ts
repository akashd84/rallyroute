import { createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
// Mocked provider/browser coverage only. Database grants/RLS are tested separately.
async function login(page: Page, email: string, destination: RegExp = /\/account$/) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(destination);
}
async function create(page: Page, name: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create household", exact: true }) });
  await form.getByLabel("First name", { exact: true }).fill("Alex");
  await form.getByLabel("Last name", { exact: true }).fill("Example");
  await form.getByLabel("Household name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create household", exact: true }).click();
  await expect(page).toHaveURL(/\/households\/[a-f0-9-]+$/);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("mocked: onboarding errors and pending state recover, linked adult exists", async ({ page }) => {
  await login(page, "new@example.com", /\/onboarding$/);
  await page.getByLabel("Household name").fill("Provider unavailable");
  await page.getByRole("button", { name: "Create household", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Unable to save");
  await page.getByLabel("Household name").fill("Slow household");
  await page.getByRole("button", { name: "Create household", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Slow household", exact: true })).toBeVisible();
  await expect(page.getByText("Account-linked adult", { exact: true })).toBeVisible();
  await expect(page.getByText("Your role: Owner")).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Slow household", exact: true })).toBeVisible();
});
test("mocked: participant edits, confirmed archival, and household switching", async ({ page }) => {
  await login(page, "new@example.com", /\/onboarding$/); await create(page, "First home");
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Add participant", exact: true }) });
  await add.getByLabel("First name", { exact: true }).fill("Casey"); await add.getByLabel("Last name", { exact: true }).fill("Example");
  await add.getByLabel("Participant type").selectOption("child"); await add.getByRole("button", { name: "Add participant" }).click();
  const person = page.locator("article").filter({ has: page.getByRole("heading", { name: "Casey Example" }) });
  await expect(person).toBeVisible(); await person.getByLabel("First name", { exact: true }).fill("Updated");
  await person.getByRole("button", { name: "Save participant" }).click();
  const updated = page.locator("article").filter({ has: page.getByRole("heading", { name: "Updated Example" }) });
  await expect(updated).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss()); await updated.getByRole("button", { name: "Remove participant" }).click(); await expect(updated).toBeVisible();
  page.once("dialog", dialog => dialog.accept()); await updated.getByRole("button", { name: "Remove participant" }).click(); await expect(updated).toHaveCount(0);
  await page.goto("/onboarding"); await create(page, "Second home");
  const firstId = await page.getByLabel("Household", { exact: true }).locator("option").filter({ hasText: "First home" }).getAttribute("value");
  await page.getByLabel("Household", { exact: true }).selectOption(firstId!);
  await expect(page.getByRole("heading", { name: "First home", exact: true })).toBeVisible();
});
test("mocked: invite survives sign-in, explicit acceptance links adult, Member boundaries and succession", async ({ page, browser }) => {
  await login(page, "adult@example.com"); await page.getByRole("link", { name: "Example household", exact: true }).click();
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Add participant", exact: true }) });
  await add.getByLabel("First name", { exact: true }).fill("Recipient"); await add.getByLabel("Last name", { exact: true }).fill("Example"); await add.getByRole("button", { name: "Add participant" }).click();
  await page.getByLabel("Invited email").fill("recipient@example.com");
  await page.getByLabel("Link adult participant").selectOption({ label: "Recipient Example" });
  await page.getByRole("button", { name: "Create invitation", exact: true }).click();
  const link = await page.getByLabel("Invitation link", { exact: true }).inputValue();
  const recipientContext = await browser.newContext(); const recipient = await recipientContext.newPage();
  await recipient.goto(link); await expect(recipient).toHaveURL(/\/sign-in$/);
  const cookie = (await recipientContext.cookies()).find(c => c.name === "rallyroute-household-invite");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.value).toBe(createHash("sha256").update(link.split("#")[1]).digest("hex"));
  expect(recipient.url()).not.toContain("#");
  await login(recipient, "recipient@example.com", /\/household-invitations\/accept$/);
  await expect(recipient.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await recipient.getByRole("button", { name: "Accept invitation" }).click();
  await expect(recipient.getByText("Your role: Member")).toBeVisible();
  await expect(recipient.getByRole("heading", { name: "Recipient Example", exact: true })).toHaveCount(1);
  await expect(recipient.getByRole("button", { name: "Create invitation" })).toHaveCount(0);
  await expect(recipient.getByRole("button", { name: "Save household name" })).toHaveCount(0);
  await page.reload(); await page.getByRole("button", { name: "Promote to Owner" }).click();
  await recipient.reload(); await expect(recipient.getByText("Your role: Owner")).toBeVisible();
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Step down to Member" }).click();
  await expect(page.getByText("Your role: Member")).toBeVisible();
  recipient.once("dialog", dialog => dialog.accept()); await recipient.getByRole("button", { name: "Leave household" }).click();
  await expect(recipient).toHaveURL(/\/onboarding$/);
  await page.reload(); await expect(page.getByText("Your role: Owner")).toBeVisible();
  await recipient.goto(page.url()); await expect(recipient.getByRole("heading", { name: "Household unavailable" })).toBeVisible();
  await recipientContext.close();
});
test("mocked: revoked invitation rejects without joining; last departure protects archived household", async ({ page, browser }) => {
  await login(page, "adult@example.com"); await page.getByRole("link", { name: "Example household", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Example household", exact: true })).toBeVisible();
  const householdUrl = page.url();
  await page.getByLabel("Invited email").fill("recipient@example.com"); await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page.getByLabel("Invitation link", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Revoke invitation" }).click();
  const context = await browser.newContext(); const recipient = await context.newPage();
  await recipient.goto(link); await expect(recipient).toHaveURL(/\/sign-in$/); await login(recipient, "recipient@example.com", /\/household-invitations\/accept$/);
  await recipient.getByRole("button", { name: "Accept invitation" }).click();
  await expect(recipient.getByRole("status")).toContainText("invited email");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Leave household" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(householdUrl); await expect(page.getByRole("heading", { name: "Household unavailable" })).toBeVisible();
  await context.close();
});
