import { test, expect, type Page, type BrowserContext } from "@playwright/test";
// All provider responses are mocked. These tests do not establish Cloud delivery or RLS.
async function request(page: Page, email = "adult@example.com") {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
}
async function login(page: Page, email = "adult@example.com") {
  await request(page, email);
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
}
async function expire(context: BrowserContext, validRefresh: boolean) {
  const cookies = await context.cookies();
  const cookie = cookies.find(item => item.name.endsWith("-auth-token"));
  expect(cookie).toBeDefined();
  const session = JSON.parse(Buffer.from(cookie!.value.slice(7), "base64url").toString());
  const parts = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  claims.exp = Math.floor(Date.now() / 1000) - 60;
  parts[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
  session.access_token = parts.join("."); session.expires_at = claims.exp;
  if (!validRefresh) session.refresh_token = "invalid-refresh";
  await context.addCookies([{ ...cookie!, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }]);
}

test("anonymous account access and home route lead to sign-in", async ({ page }) => {
  await page.goto("/account"); await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/"); await expect(page).toHaveURL(/\/sign-in$/);
});
test("pending state, cooldown, resend, and changing email", async ({ page }) => {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill("slow@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
  await expect(page.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
  await page.clock.install(); await page.clock.fastForward(61000);
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("slow@example.com");
});
test("rate limits and provider errors are actionable and generic", async ({ page }) => {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill("limited@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many attempts");
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill("unavailable@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText("private error");
});
test("wrong code can be corrected; session survives reload; sign-out protects account", async ({ page, context }) => {
  await request(page); await page.getByLabel("Sign-in code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("invalid or expired");
  await page.getByLabel("Sign-in code").fill("123456"); await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/); await expect(page.getByText("Signed in as adult@example.com")).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  const response = await page.goto("/sign-in"); await expect(page).toHaveURL(/\/account$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/sign-in$/);
  expect((await context.cookies()).filter(c => c.name.includes("auth-token"))).toHaveLength(0);
  await page.goto("/account"); await expect(page).toHaveURL(/\/sign-in$/);
});
test("missing profile offers recovery without onboarding", async ({ page }) => {
  await login(page, "missing@example.com"); await expect(page.getByRole("main").getByRole("alert")).toContainText("profile could not be loaded");
  await expect(page.getByRole("button", { name: "Retry loading profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});
test("expired access token refreshes through SSR cookies", async ({ page, context }) => {
  await login(page); await expire(context, true); await page.reload();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  const cookie = (await context.cookies()).find(c => c.name.endsWith("-auth-token"))!;
  const session = JSON.parse(Buffer.from(cookie.value.slice(7), "base64url").toString());
  expect(session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
});
test("expired session with invalid refresh token returns to sign-in", async ({ page, context }) => {
  await login(page); await expire(context, false); await page.reload(); await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-out failure shows an error and clears the local session", async ({ page }) => {
  await login(page, "signout-error@example.com");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not confirm sign-out");
  await expect(page).toHaveURL(/\/sign-in\?error=sign-out$/);
  await page.goto("/account"); await expect(page).toHaveURL(/\/sign-in$/);
});

test("eight-digit Cloud-style code is accepted without truncation", async ({ page }) => {
  await request(page, "eight@example.com");
  await page.getByLabel("Sign-in code").fill("12345678");
  await expect(page.getByLabel("Sign-in code")).toHaveValue("12345678");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Signed in as eight@example.com")).toBeVisible();
});
