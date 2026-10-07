import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const output = path.resolve(process.env.ROUTE_REVIEW_DIR ?? "docs/route-review/2026-10-07");
const nextDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test("capture current routes with synthetic mobile data", async ({ page, request, context }) => {
  page.setDefaultTimeout(15_000);
  await mkdir(path.join(output, "screenshots/full"), { recursive: true });
  await request.post("http://127.0.0.1:54329/test/reset");
  const captures: object[] = [];
  const consoleIssues: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") consoleIssues.push(message.text());
  });
  page.on("pageerror", error => consoleIssues.push(error.message));
  async function capture(label: string, route: string, pattern: string, state = "default", navigate = true) {
    console.info(`Capturing ${label}: ${route}`);
    const response = navigate ? await page.goto(route) : null;
    await page.locator("main").first().waitFor();
    if (route.includes("/events?") || /\/events$/.test(route)) {
      await expect(page.getByLabel("Calendar view")).toBeVisible();
      await expect(page.getByText(/Loading events|Loading calendar/)).toHaveCount(0);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const metrics = await page.evaluate(() => ({
      title: document.querySelector("main h1")?.textContent ?? document.querySelector("h1")?.textContent,
      width: innerWidth, height: innerHeight, contentWidth: document.documentElement.scrollWidth,
      contentHeight: document.documentElement.scrollHeight,
      headerHousehold: (document.querySelector<HTMLSelectElement>("#header-household")?.selectedOptions[0]?.textContent ?? document.querySelector("header")?.textContent)?.trim(),
      visualWidth: visualViewport?.width,
      shell: !!document.querySelector('nav[aria-label="Primary navigation"]'),
      links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .filter(link => link.getClientRects().length && link.origin === location.origin)
        .map(link => ({ text: link.textContent?.trim(), href: link.pathname + link.search + link.hash })),
    }));
    const filename = `${String(captures.length + 1).padStart(2, "0")}-${label}.png`;
    const screenshot = `screenshots/${filename}`;
    const fullScreenshot = metrics.contentHeight > metrics.height ? `screenshots/full/${filename}` : null;
    await page.screenshot({ path: path.join(output, screenshot), animations: "disabled" });
    if (fullScreenshot) await page.screenshot({ path: path.join(output, fullScreenshot), fullPage: true, animations: "disabled" });
    captures.push({ label, pattern, route, viewport: page.viewportSize(), finalUrl: new URL(page.url()).pathname + new URL(page.url()).search, state,
      status: response?.status() ?? null, screenshot, fullScreenshot, ...metrics });
  }
  await capture("sign-in", "/sign-in", "/sign-in", "signed out");
  await page.getByLabel("Email address").fill("adult@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
  await capture("sign-in-code", "/sign-in", "/sign-in", "code entry", false);
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await request.post("http://127.0.0.1:54329/test/matching");
  await request.post("http://127.0.0.1:54329/test/connections");
  await request.post("http://127.0.0.1:54329/test/carpools");
  await page.goto("/households/example-household/connections");
  const carpool = page.locator("form").filter({ has: page.getByRole("button", { name: "Create carpool", exact: true }) });
  await carpool.getByRole("checkbox").check();
  await carpool.getByRole("button").click();
  await expect(page).toHaveURL(/\/carpools\/[\da-f-]+$/);
  const carpoolRoute = new URL(page.url()).pathname;

  await page.goto("/groups/new");
  await page.getByRole("combobox", { name: "Household", exact: true }).selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("Route review club");
  await page.getByLabel("Group type").selectOption("club");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL("/groups/route-review-club");
  const group = "/groups/route-review-club";
  await page.goto(`${group}/events/destinations`);
  const destination = page.locator("form").filter({ has: page.getByRole("button", { name: "Save destination", exact: true }) }).first();
  await destination.getByLabel("Name", { exact: true }).fill("Community hall");
  await destination.getByLabel("Address line 1").fill("Synthetic street");
  await destination.getByLabel("City").fill("Test city");
  await destination.getByLabel("State / region").fill("TS");
  await destination.getByLabel("Postal code").fill("00000");
  await destination.getByRole("button", { name: "Save destination", exact: true }).click();
  await expect(destination.getByRole("status")).toHaveText("Saved.");
  await page.goto(`${group}/events/series/new`);
  const series = page.locator("form").filter({ has: page.getByRole("button", { name: "Preview occurrences" }) });
  await series.getByLabel("Series name").fill("Community practice");
  await series.getByRole("combobox", { name: "Destination", exact: true }).selectOption({ label: "Community hall" });
  await series.getByLabel("Event timezone").fill("America/New_York");
  await series.getByRole("checkbox", { name: /I confirm/ }).check();
  await series.getByLabel("Start date").fill(nextDate(1));
  await series.getByLabel("End date").fill(nextDate(3));
  await series.getByLabel("Frequency").selectOption("daily");
  await series.getByLabel("Arrive by", { exact: true }).fill("09:00");
  await series.getByLabel("Ready to leave", { exact: true }).fill("17:00");
  await series.getByRole("button", { name: "Preview occurrences" }).click();
  await series.getByRole("button", { name: "Create series", exact: true }).click();
  const event = page.getByRole("link", { name: "Community practice", exact: true }).first();
  await expect(event).toBeVisible();
  const occurrence = await event.evaluate(link => new URL((link as HTMLAnchorElement).href).pathname);

  for (const [label, route] of [["home", "/"], ["account", "/account"], ["global-calendar", "/calendar"], ["messages", "/messages"], ["profile", "/profile"], ["onboarding", "/onboarding"], ["join", "/join"], ["groups", "/groups"], ["group-new", "/groups/new"]]) await capture(label, route, route);
  await capture("group", group, "/groups/:groupSlug");
  await capture("group-settings", `${group}/settings`, "/groups/:groupSlug/settings");
  await capture("group-members", `${group}/members`, "/groups/:groupSlug/members", "placeholder");
  await capture("group-invite", "/group/route-review-club/invite", "/group/:groupSlug/invite");
  await capture("group-share", "/group/route-review-club/share", "/group/:groupSlug/share");
  await capture("events-agenda", `${group}/events?date=${nextDate(1)}&view=listWeek`, "/groups/:groupSlug/events", "mobile Agenda");
  for (const [label, view] of [["month", "dayGridMonth"], ["week", "timeGridWeek"], ["day", "timeGridDay"]]) await capture(`events-${label}`, `${group}/events?date=${nextDate(1)}&view=${view}`, "/groups/:groupSlug/events", label);
  await capture("event-new", `${group}/events/new`, "/groups/:groupSlug/events/new");
  await capture("series-new", `${group}/events/series/new`, "/groups/:groupSlug/events/series/new");
  await capture("destinations", `${group}/events/destinations`, "/groups/:groupSlug/events/destinations");
  await capture("occurrence", occurrence, "/groups/:groupSlug/:eventSlug", "recurring occurrence");
  await capture("occurrence-edit", `${occurrence}/edit`, "/groups/:groupSlug/:eventSlug/edit");
  await capture("series-edit", `${occurrence}/recurring`, "/groups/:groupSlug/:eventSlug/recurring");
  await capture("occurrence-populated", "/groups/match-club/match-event", "/groups/:groupSlug/:eventSlug", "saved attendance and rides");
  await page.getByRole("button", { name: /^Edit attendance/ }).first().click();
  await capture("occurrence-attendance-editor", "/groups/match-club/match-event", "/groups/:groupSlug/:eventSlug", "expanded attendance", false);
  const household = "/households/example-household";
  for (const [label, suffix, pattern] of [
    ["household", "", ""], ["household-settings", "/settings", "/settings"], ["locations", "/locations", "/locations"],
    ["location-add", "/locations/add", "/locations/add"], ["location-edit", "/locations/home-pickup/edit", "/locations/:locationSlug/edit"],
    ["connections", "/connections", "/connections"], ["carpools", "/carpools", "/carpools"],
  ]) await capture(label, household + suffix, "/households/:householdSlug" + pattern);
  await capture("household-other-context", "/households/other-own-household", "/households/:householdSlug", "URL household differs from header selection");
  await capture("carpool-detail", carpoolRoute, "/households/:householdSlug/carpools/:carpoolId", "pending invitation");

  for (const kind of ["group", "household"]) {
    await capture(`${kind}-invitation-open`, `/${kind}-invitations/open`, `/${kind}-invitations/open`, "missing invitation fragment");
    const token = randomBytes(32).toString("hex");
    await request.post("http://127.0.0.1:54329/test/legacy", { data: { token, kind, groupSlug: "route-review-club" } });
    await context.addCookies([{ name: `rallyroute-${kind}-invite`, value: createHash("sha256").update(token).digest("hex"), url: "http://127.0.0.1:3100" }]);
    await capture(`${kind}-invitation-accept`, `/${kind}-invitations/accept`, `/${kind}-invitations/accept`, kind === "household" ? "unavailable invitation for current account" : "invitation preview");
    await context.clearCookies({ name: `rallyroute-${kind}-invite` });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await capture("household-320", household, "/households/:householdSlug", "320px layout");
  await capture("events-320", `${group}/events?date=${nextDate(1)}&view=listWeek`, "/groups/:groupSlug/events", "320px layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post("http://127.0.0.1:54329/test/event-member");
  await capture("group-as-member", group, "/groups/:groupSlug", "group Member");
  await capture("event-new-as-member", `${group}/events/new`, "/groups/:groupSlug/events/new", "permission notice; no mutation controls");
  await capture("group-settings-as-member", `${group}/settings`, "/groups/:groupSlug/settings", "generic 404");
  await capture("unknown-group", "/groups/missing-group", "/groups/:groupSlug", "generic 404");

  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), data: "Synthetic mock provider only; no linked database changes or real invitation tokens saved.", consoleIssues, captures }, null, 2) + "\n");
});
