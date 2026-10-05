import { test, expect, type Page, type Browser } from "@playwright/test";
async function login(page: Page, email: string) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456"); await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
}
async function recipient(browser: Browser, household: string) {
  const context = await browser.newContext(); const page = await context.newPage();
  await login(page, "recipient@example.com");
  await expect(page.getByRole("link", { name: "Connections (1 incoming)" })).toBeVisible();
  await page.goto(`/households/${household}/connections`);
  return { context, page };
}
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/reset"); await login(page, "adult@example.com");
  const setup = await (await request.post("http://127.0.0.1:54329/test/matching")).json();
  await request.post("http://127.0.0.1:54329/test/connections"); await page.goto(setup.url);
});
async function sendRequest(page: Page) {
  const panel = page.getByRole("region", { name: "To event matches", exact: true });
  await panel.getByRole("button", { name: "Find matches", exact: true }).click();
  await panel.getByText("Request to connect", { exact: true }).click();
  await expect(panel.getByText("Match club — Match event")).toBeVisible();
  await expect(panel.getByText(/Share your contact:/)).toContainText("Alex Example");
  await panel.getByRole("checkbox").check(); await panel.getByRole("button", { name: "Send connection request" }).click();
  await expect(page).toHaveURL(/\/connections$/);
}
test("mocked: mutual consent, safe contacts, separate pickup sharing and disconnection", async ({ page, browser }) => {
  await sendRequest(page);
  const other = await recipient(browser, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  try {
    await expect(other.page.getByText("adult@example.com", { exact: true })).toHaveCount(0);
    await expect(other.page.getByText(/Private test address/)).toHaveCount(0);
    await other.page.getByRole("checkbox").check(); await other.page.getByRole("button", { name: "Accept connection" }).click();
    await expect(other.page.getByRole("link", { name: "adult@example.com", exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole("link", { name: "recipient@example.com", exact: true })).toBeVisible();
    await page.getByText("Share a pickup address", { exact: true }).click();
    await page.getByRole("combobox", { name: "Pickup address", exact: true }).selectOption({ label: "Home pickup" });
    await page.getByRole("combobox", { name: "Event", exact: true }).selectOption({ index: 1 });
    await expect(page.getByText(/Address to share: Private test address/)).toBeVisible();
    await page.getByRole("checkbox", { name: /Share this address with/ }).check();
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Share pickup address", exact: true }).click();
    await expect(page.getByRole("button", { name: "Withdraw address sharing" })).toBeVisible();
    await other.page.reload(); await expect(other.page.getByText(/Home pickup: Private test address/)).toBeVisible();
    await expect(other.page.getByRole("button", { name: "Withdraw address sharing" })).toHaveCount(0);
    await page.getByRole("button", { name: "Withdraw address sharing" }).click();
    await other.page.reload(); await expect(other.page.getByText(/Home pickup: Private test address/)).toHaveCount(0);
    other.page.once("dialog", d => d.accept()); await other.page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(other.page.getByText("Status: disconnected")).toBeVisible();
    await expect(other.page.getByRole("link", { name: "adult@example.com", exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole("link", { name: "recipient@example.com", exact: true })).toHaveCount(0);
  } finally { await other.context.close(); }
});
test("mocked: decline and withdraw preserve history without revealing contacts", async ({ page, browser }) => {
  await sendRequest(page); const other = await recipient(browser, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  try { await other.page.getByRole("button", { name: "Decline request" }).click(); await expect(other.page.getByText("Status: declined")).toBeVisible(); await expect(other.page.getByRole("link", { name: "adult@example.com" })).toHaveCount(0); }
  finally { await other.context.close(); }
  await page.goto("/groups/44444444-4444-4444-8444-444444444444/events/55555555-5555-4555-8555-555555555555?household=33333333-3333-4333-8333-333333333333");
  await sendRequest(page); await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByText("Status: withdrawn")).toBeVisible();
});
test("mocked: expiry and household selection clear actionable requests", async ({ page, request }) => {
  await sendRequest(page);
  await page.getByRole("navigation", { name: "Choose household" }).getByRole("link", { name: "Other own household" }).click();
  await expect(page).toHaveURL(/77777777-7777-4777-8777-777777777777\/connections$/);
  await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Choose household" }).getByRole("link", { name: "Example household" }).click();
  await expect(page).toHaveURL(/33333333-3333-4333-8333-333333333333\/connections$/);
  await request.post("http://127.0.0.1:54329/test/connections", { data: { expire: true } }); await page.reload();
  await expect(page.getByText("Status: expired")).toBeVisible(); await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
});
