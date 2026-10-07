import { test, expect, type Page } from "@playwright/test";
const upcomingDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
// Mocked browser coverage. This does not verify Cloud authorization or delivery.
async function setup(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("adult@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/groups/new");
  await page
    .getByRole("combobox", { name: "Household", exact: true })
    .selectOption({ label: "Example household" });
  await page.getByLabel("Group name").fill("Trips club");
  await page.getByLabel("Group type").selectOption("club");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/(?!new$)[a-z0-9-]+$/);
  await page.getByRole("link", { name: "Events and destinations" }).click();
  await expect(
    page.getByRole("heading", { name: "Events and destinations" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Manage Destinations", exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save destination", exact: true }),
    })
    .first();
  await form.getByLabel("Name", { exact: true }).fill("Community hall");
  await form.getByLabel("Address line 1").fill("Synthetic street");
  await form.getByLabel("City").fill("Test city");
  await form.getByLabel("State / region").fill("TS");
  await form.getByLabel("Postal code").fill("00000");
  await form
    .getByRole("button", { name: "Save destination", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.goto("/groups/trips-club/events");
}
async function createEvent(page: Page) {
  await page.goto("/groups/trips-club/events/new");
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Create event", exact: true }),
    });
  await form.getByLabel("Event name").fill("Practice");
  await form
    .getByRole("combobox", { name: "Destination", exact: true })
    .selectOption({ label: "Community hall" });
  await form.getByLabel("Event timezone").fill("UTC");
  await form.getByRole("checkbox").check();
  await form.getByLabel("Arrive by", { exact: true }).fill(`${upcomingDate(1)}T09:00`);
  await form
    .getByLabel("Ready to leave", { exact: true })
    .fill(`${upcomingDate(1)}T17:00`);
  await form.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/trips-club\/practice$/);
}
const participantCard = (page: Page) => page.getByRole("region", { name: "Alex Example participation", exact: true });
async function openAttendance(page: Page) {
  const trigger = participantCard(page).getByRole("button", { name: /^Edit attendance/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}
async function openRide(page: Page, direction = "to event") {
  const trigger = participantCard(page).getByRole("button", { name: `Edit ${direction} for Alex Example`, exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});
test("mocked: attendance, both directions, event reconfirmation and cancellation", async ({
  page,
}) => {
  await setup(page);
  await createEvent(page);
  const eventUrl = page.url();
  await page.goto("/groups");
  await expect(page.getByRole("region", { name: "Events", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Trips club", exact: true }).click();
  const cards = page.getByRole("region", { name: "Events", exact: true });
  await expect(cards.getByRole("listitem")).toHaveCount(1);
  await expect(cards.getByRole("link", { name: "Edit Series", exact: true })).toHaveCount(0);
  await cards.getByRole("link", { name: "Edit Occurrence", exact: true }).click();
  await expect(page).toHaveURL(`${eventUrl}/edit`);
  await expect(page.getByRole("button", { name: "Save event", exact: true })).toBeVisible();
  await page.goto(eventUrl);
  await expect(page.getByText("Household: Example household", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show household" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Attendance", exact: true })).toHaveCount(0);
  await openAttendance(page);
  await expect(
    page.getByRole("combobox", { name: "Attendance", exact: true }),
  ).toHaveValue("unknown");
  await expect(
    page.getByRole("button", { name: "Save ride preference" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Attendance", exact: true })
    .selectOption("going");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(participantCard(page).getByRole("button", { name: /^Edit (to|from) event/ })).toHaveCount(2);
  for (const direction of ["to event", "from event"]) {
    await openRide(page, direction);
    const form = participantCard(page).getByRole("region", { name: `Alex Example ${direction} editor`, exact: true });
    await form.getByRole("combobox", { name: "Ride mode", exact: true }).selectOption("self_transport");
    await form.getByRole("button", { name: "Save ride preference" }).click();
    await expect(participantCard(page).getByRole("status")).toHaveText("Saved.");
    await expect(form).toHaveCount(0);
  }
  await page.goto(`${eventUrl}/edit`);
  const edit = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save event", exact: true }),
    });
  await edit.getByLabel("Arrive by", { exact: true }).fill(`${upcomingDate(1)}T09:15`);
  await edit.getByRole("checkbox").check();
  page.once("dialog", (d) => d.accept());
  await edit.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page).toHaveURL(eventUrl);
  await page.goto(eventUrl + "?household=33333333-3333-4333-8333-333333333333");
  await expect(
    page.getByText("Needs reconfirmation", { exact: true }),
  ).toHaveCount(2);
  await page.goto(`${eventUrl}/edit`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(page.getByText("Started, past, or cancelled occurrences cannot be edited.", { exact: true })).toBeVisible();
  await page.goto(eventUrl);
  await expect(
    page.getByRole("button", { name: "Save attendance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save ride preference" }),
  ).toHaveCount(0);
  await expect(participantCard(page).getByRole("button", { name: /^Edit attendance/ })).toHaveCount(0);
  await expect(participantCard(page).getByRole("button", { name: /^Edit (to|from) event/ })).toHaveCount(0);
});
test("mocked: recurrence requires preview and supports future replacement", async ({
  page, request, browser,
}) => {
  await setup(page);
  await page.goto("/groups/trips-club/events/series/new");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Preview occurrences" }) });
  await form.getByLabel("Series name").fill("Daily meet");
  await form.getByLabel("Event timezone").fill("UTC");
  await form.getByRole("checkbox", { name: /I confirm/ }).check();
  await form.getByLabel("Start date").fill(upcomingDate(1));
  await form.getByLabel("End date").fill(upcomingDate(2));
  await form.getByLabel("Frequency").selectOption("daily");
  await form.getByLabel("Calendar day", { exact: true }).fill("31");
  await form.getByLabel("Arrive by", { exact: true }).fill("09:00");
  await expect(
    form.getByRole("button", { name: "Create series", exact: true }),
  ).toHaveCount(0);
  await form.getByRole("button", { name: "Preview occurrences" }).click();
  await expect(
    form.getByRole("heading", { name: "2 occurrences" }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Create series", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Daily meet", exact: true }),
  ).toHaveCount(2);
  const eventsUrl = page.url();
  const firstOccurrence = await page.getByRole("link", { name: "Daily meet", exact: true }).first().evaluate(link => new URL((link as HTMLAnchorElement).href).pathname);
  const occurrenceUrls = await page.getByRole("link", { name: "Daily meet", exact: true }).evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname));
  await page.goto("/groups");
  await expect(page.getByRole("region", { name: "Events", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Trips club", exact: true }).click();
  const cards = page.getByRole("region", { name: "Events", exact: true });
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  expect(await cards.getByRole("link", { name: "Daily meet", exact: true }).evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname))).toEqual(occurrenceUrls);
  await expect(cards.getByRole("link", { name: "Daily meet", exact: true }).first()).toHaveAttribute("href", firstOccurrence!);
  await expect(cards.getByText("Recurring event", { exact: true })).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const recurringLink = cards.getByRole("link", { name: "Edit Series", exact: true }).first();
  await expect(recurringLink).toHaveAttribute("href", `${firstOccurrence}/recurring`);
  await expect(cards.getByRole("link", { name: "Edit Occurrence", exact: true }).first()).toHaveAttribute("href", `${firstOccurrence}/edit`);
  expect((await recurringLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await recurringLink.click();
  await expect(page.getByRole("heading", { name: "Recurring settings", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Frequency", exact: true })).toHaveValue("daily");
  await expect(page.getByLabel("Series name", { exact: true })).toHaveValue("Daily meet");
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue(upcomingDate(1));
  await expect(page.getByLabel("Start date", { exact: true })).toHaveAttribute("readonly", "");
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(page.url());
  await expect(visitor).toHaveURL(/\/sign-in$/);
  await anonymous.close();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("link", { name: "Back to Daily meet", exact: true }).click();
  await expect(page).toHaveURL(new URL(firstOccurrence!, eventsUrl).toString());
  await expect(page.getByRole("button", { name: "Save event", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel event", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "This and future occurrences" })).toHaveCount(0);
  await page.goto(new URL(`${firstOccurrence}/edit`, eventsUrl).toString());
  const occurrence = page.locator("form").filter({has:page.getByRole("button",{name:"Save event",exact:true})});
  await occurrence.getByLabel("Event name").fill("Single exception");
  await occurrence.getByRole("checkbox",{name:/I confirm/}).check();
  page.once("dialog",dialog=>dialog.accept());
  await occurrence.getByRole("button",{name:"Save event",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Single exception",exact:true})).toBeVisible();
  await page.goto(new URL(`${firstOccurrence}/recurring`, eventsUrl).toString());
  const replacement = page.locator("form").filter({has:page.getByRole("button",{name:"Preview occurrences"})});
  await replacement.getByLabel("Series name").fill("Successor meet");
  await replacement.getByRole("checkbox",{name:/I confirm/}).check();
  await replacement.getByRole("button",{name:"Preview occurrences"}).click();
  await expect(replacement.getByRole("alert")).toContainText("2 existing events");
  page.once("dialog",dialog=>dialog.dismiss());
  await replacement.getByRole("button",{name:"Replace this and future occurrences",exact:true}).click();
  await expect(page.getByRole("heading", { name: "Recurring settings", exact: true })).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await replacement.getByRole("button",{name:"Replace this and future occurrences",exact:true}).click();
  await expect(page.getByRole("link",{name:"Successor meet",exact:true})).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Cancelled$/ })).toHaveCount(2);
  const successor = await page.getByRole("link", { name: "Successor meet", exact: true }).first().evaluate(link => new URL((link as HTMLAnchorElement).href).pathname);
  await page.goto(new URL(`${firstOccurrence}/recurring`, eventsUrl).toString());
  await expect(page.getByText(/Started, past, or cancelled occurrences/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview occurrences" })).toHaveCount(0);
  await request.post("http://127.0.0.1:54329/test/event-member");
  await page.goto(new URL(`${successor}/recurring`, eventsUrl).toString());
  await expect(page.getByText("Group Owners and Admins can update recurring settings.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview occurrences" })).toHaveCount(0);
  await page.goto("/groups/trips-club");
  await expect(page.getByRole("link", { name: "Edit Series", exact: true })).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Events", exact: true }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Single exception", exact: true })).toHaveCount(0);
});

test("mocked: Members select private locations and manage rides without settings access", async ({
  page,
  request,
}) => {
  await setup(page);
  await createEvent(page);
  const eventUrl = page.url();
  await page.goto("/households/example-household/locations/add");
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save address", exact: true }),
    });
  await form.getByLabel("Name", { exact: true }).fill("Home pickup");
  await form.getByLabel("Address line 1").fill("Synthetic private street");
  await form.getByLabel("City").fill("Test city");
  await form.getByLabel("State / region").fill("TS");
  await form.getByLabel("Postal code").fill("00000");
  await form.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.goto("/households/example-household/locations");
  await page.getByRole("button", { name: "Set as primary", exact: true }).click();
  await expect(page.getByText("Primary address", { exact: true })).toBeVisible();
  await request.post("http://127.0.0.1:54329/test/event-member");
  await page.goto("/households/example-household/locations");
  await expect(
    page.getByRole("button", { name: "Save address", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Synthetic private street", { exact: false }),
  ).toBeVisible();
  await page.goto(eventUrl + "?household=33333333-3333-4333-8333-333333333333");
  await expect(
    page.getByRole("button", { name: "Save event", exact: true }),
  ).toHaveCount(0);
  await openAttendance(page);
  await page
    .getByRole("combobox", { name: "Attendance", exact: true })
    .selectOption("going");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await openRide(page);
  const ride = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save ride preference" }) })
    .first();
  await ride
    .getByRole("combobox", { name: "Ride mode", exact: true })
    .selectOption("can_drive");
  await expect(ride.getByRole("combobox", { name: "Pickup / dropoff address", exact: true }).locator("option:checked")).toHaveText("Home pickup");
  await expect(ride.getByLabel("Additional rider seats")).toHaveValue("1");
  await expect(ride.getByLabel("Maximum detour minutes")).toHaveValue("10");
  await ride.getByRole("button", { name: "Save ride preference" }).click();
  await expect(participantCard(page).getByRole("status")).toHaveText("Saved.");
});

test("mocked: rejected geocoding preserves destination and household addresses", async ({ page, request }) => {
  await setup(page);
  await page.goto("/groups/trips-club/events/destinations");
  const details = page.locator("details").filter({ has: page.locator("summary", { hasText: "Community hall" }) });
  await details.locator("summary").click();
  const edit = details.locator("form").filter({ has: page.getByRole("button", { name: "Save destination", exact: true }) });
  await edit.getByLabel("Address line 1").fill("Uncertain destination");
  await request.post("http://127.0.0.1:54329/test/geocoding", { data: { mode: "uncertain" } });
  page.once("dialog", dialog => dialog.accept());
  await edit.getByRole("button", { name: "Save destination", exact: true }).click();
  await expect(edit.getByRole("status")).toContainText("could not verify this exact address");
  await expect(details.locator("p").first()).toContainText("Synthetic street");
  await request.post("http://127.0.0.1:54329/test/geocoding", { data: { mode: "precise" } });
  page.once("dialog", dialog => dialog.accept());
  await edit.getByRole("button", { name: "Save destination", exact: true }).click();
  await expect(edit.getByRole("status")).toHaveText("Saved.");
  await expect(details.locator("p").first()).toContainText("Uncertain destination");

  await page.goto("/households/example-household/locations/add");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Save address", exact: true }) }).last();
  await create.getByLabel("Name", { exact: true }).fill("Verified home");
  await create.getByLabel("Address line 1").fill("Synthetic private street");
  await create.getByLabel("City").fill("Test city");
  await create.getByLabel("State / region").fill("TS");
  await create.getByLabel("Postal code").fill("00000");
  await create.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(create.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("link", { name: "Saved addresses", exact: true }).click();
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Verified home", exact: true }) }).last();
  await expect(section.locator("address input, address select, address textarea, address button")).toHaveCount(0);
  await expect(section.locator("address")).toContainText("Synthetic private street");
  await expect(section.getByRole("link", { name: "Edit address", exact: true })).toHaveAttribute("href", "/households/example-household/locations/verified-home/edit");
  await section.getByRole("link", { name: "Edit address", exact: true }).click();
  const householdEdit = page.locator("form");
  await householdEdit.getByLabel("Address line 1").fill("Another private street");
  await request.post("http://127.0.0.1:54329/test/geocoding", { data: { mode: "limited" } });
  page.once("dialog", dialog => dialog.accept());
  await householdEdit.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(householdEdit.getByRole("status")).toContainText("Try again in 30 seconds");
  await page.getByRole("link", { name: "Saved addresses", exact: true }).click();
  await expect(section.locator("address")).toContainText("Synthetic private street");
});

test("mocked: bulk attendance confirms count and preserves occurrence-only edits", async ({ page }) => {
  await setup(page);
  await page.goto("/groups/trips-club/events/series/new");
  const seriesForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Preview occurrences" }) });
  await seriesForm.getByLabel("Series name").fill("Attendance series");
  await seriesForm.getByLabel("Event timezone").fill("UTC");
  await seriesForm.getByRole("checkbox", { name: /I confirm/ }).check();
  await seriesForm.getByLabel("Start date").fill(upcomingDate(1));
  await seriesForm.getByLabel("End date").fill(upcomingDate(2));
  await seriesForm.getByLabel("Frequency").selectOption("daily");
  await seriesForm.getByLabel("Arrive by", { exact: true }).fill("09:00");
  await seriesForm.getByRole("button", { name: "Preview occurrences" }).click();
  await seriesForm.getByRole("button", { name: "Create series", exact: true }).click();
  const links = page.getByRole("link", { name: "Attendance series", exact: true });
  await expect(links).toHaveCount(2);
  const paths = await links.evaluateAll(nodes => nodes.map(n => new URL((n as HTMLAnchorElement).href).pathname));
  const household = "33333333-3333-4333-8333-333333333333";
  await page.goto(`${paths[0]}?household=${household}`);
  await openAttendance(page);
  const attendanceForm = participantCard(page);
  await expect(attendanceForm.getByLabel("Apply to")).toHaveValue("occurrence");
  await attendanceForm.getByRole("combobox", { name: "Attendance", exact: true }).selectOption("going");
  await attendanceForm.getByLabel("Apply to").selectOption("series");
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("2 upcoming occurrences"); await dialog.dismiss(); });
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await expect(attendanceForm.getByRole("button", { name: "Save attendance" })).toBeEnabled();
  await page.reload();
  await openAttendance(page);
  await expect(attendanceForm.getByRole("combobox", { name: "Attendance", exact: true })).toHaveValue("unknown");
  await attendanceForm.getByRole("combobox", { name: "Attendance", exact: true }).selectOption("going");
  await attendanceForm.getByLabel("Apply to").selectOption("series");
  page.once("dialog", dialog => dialog.accept());
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await expect(attendanceForm.getByRole("status")).toHaveText("Attendance updated for 2 occurrences.");
  await page.goto(`${paths[1]}?household=${household}`);
  await openAttendance(page);
  await expect(attendanceForm.getByRole("combobox", { name: "Attendance", exact: true })).toHaveValue("going");
  await attendanceForm.getByRole("combobox", { name: "Attendance", exact: true }).selectOption("not_going");
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await expect(attendanceForm.getByRole("status")).toHaveText("Saved.");
  await page.goto(`${paths[0]}?household=${household}`);
  await openAttendance(page);
  await expect(attendanceForm.getByRole("combobox", { name: "Attendance", exact: true })).toHaveValue("going");
});

test("mocked: recurring ride scope confirms eligible and skipped occurrences", async ({ page }) => {
  await setup(page);
  const managementUrl=page.url();
  await page.goto("/households/example-household/locations/add");
  await page.getByLabel("Name", { exact: true }).fill("Home pickup");
  await page.getByLabel("Address line 1").fill("Synthetic private street");
  await page.getByLabel("City").fill("Test city");
  await page.getByLabel("State / region").fill("TS");
  await page.getByLabel("Postal code").fill("00000");
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(managementUrl);
  await page.goto("/groups/trips-club/events/series/new");
  const seriesForm=page.locator("form").filter({ has: page.getByRole("button", { name: "Preview occurrences" }) });
  await seriesForm.getByLabel("Series name").fill("Ride series");
  await seriesForm.getByLabel("Event timezone").fill("UTC");
  await seriesForm.getByRole("checkbox", { name: /I confirm/ }).check();
  await seriesForm.getByLabel("Start date").fill(upcomingDate(1));
  await seriesForm.getByLabel("End date").fill(upcomingDate(3));
  await seriesForm.getByLabel("Frequency").selectOption("daily");
  await seriesForm.getByLabel("Arrive by", { exact: true }).fill("09:00");
  await seriesForm.getByRole("button", { name: "Preview occurrences" }).click();
  await seriesForm.getByRole("button", { name: "Create series", exact: true }).click();
  const links=page.getByRole("link", { name: "Ride series", exact: true });
  await expect(links).toHaveCount(3);
  const paths=await links.evaluateAll(nodes=>nodes.map(n=>new URL((n as HTMLAnchorElement).href).pathname));
  const household="33333333-3333-4333-8333-333333333333";
  await page.goto(`${paths[0]}?household=${household}`);
  await openAttendance(page);
  const attendanceForm=participantCard(page);
  await attendanceForm.getByRole("combobox", { name: "Attendance", exact: true }).selectOption("going");
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await openRide(page);
  const rideForm=participantCard(page).getByRole("region", { name: "Alex Example to event editor", exact: true });
  await expect(rideForm.getByRole("combobox", { name: "Apply to", exact: true })).toHaveValue("occurrence");
  await rideForm.getByRole("combobox", { name: "Ride mode", exact: true }).selectOption("self_transport");
  await rideForm.getByRole("combobox", { name: "Apply to", exact: true }).selectOption("series");
  page.once("dialog", async d=>{ expect(d.message()).toContain("1 upcoming occurrences"); expect(d.message()).toContain("2 skipped"); await d.dismiss(); });
  await rideForm.getByRole("button", { name: "Save ride preference" }).click();
  await expect(rideForm.getByRole("button", { name: "Save ride preference" })).toBeEnabled();
  await page.reload();
  await openRide(page);
  await expect(rideForm.getByRole("combobox", { name: "Ride mode", exact: true })).toHaveValue("");
  await openAttendance(page);
  await attendanceForm.getByRole("region", { name: "Alex Example attendance editor", exact: true }).getByRole("combobox", { name: "Apply to", exact: true }).selectOption("series");
  page.once("dialog", d=>d.accept());
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await expect(attendanceForm.getByRole("status")).toHaveText("Attendance updated for 3 occurrences.");
  await rideForm.getByRole("combobox", { name: "Ride mode", exact: true }).selectOption("need_ride");
  await rideForm.getByRole("combobox", { name: "Pickup / dropoff address", exact: true }).selectOption({ label: "Home pickup" });
  await rideForm.getByRole("combobox", { name: "Apply to", exact: true }).selectOption("series");
  page.once("dialog", d=>d.accept());
  await rideForm.getByRole("button", { name: "Save ride preference" }).click();
  await expect(participantCard(page).getByRole("status")).toHaveText("Ride preferences updated for 3 occurrences. 0 skipped.");
  await page.goto(`${paths[1]}?household=${household}`);
  await openRide(page);
  await expect(rideForm.getByRole("combobox", { name: "Ride mode", exact: true })).toHaveValue("need_ride");
  await expect(rideForm.getByLabel("Earliest (UTC)", { exact: true })).toHaveValue(`${upcomingDate(2)}T08:50`);
  await rideForm.getByRole("combobox", { name: "Ride mode", exact: true }).selectOption("none");
  await rideForm.getByRole("button", { name: "Save ride preference" }).click();
  await expect(participantCard(page).getByRole("status")).toHaveText("Saved.");
  await page.goto(`${paths[0]}?household=${household}`);
  await openRide(page);
  await expect(rideForm.getByRole("combobox", { name: "Ride mode", exact: true })).toHaveValue("need_ride");
});

test("mocked: calendar views, URL restoration, navigation and retry", async ({ page }) => {
  const renderErrors: string[] = [];
  page.on("console", message => {
    if (/Cannot update a component|while rendering a different component|state update on a component that hasn.t mounted|cannot be a descendant|cannot contain a nested/.test(message.text())) renderErrors.push(message.text());
  });
  await setup(page);
  await createEvent(page);
  const date = upcomingDate(1);
  await page.goto(`/groups/trips-club/events?date=${date}&view=timeGridDay`);
  const view = page.getByLabel("Calendar view");
  await expect(view).toHaveValue("timeGridDay");
  await expect(page.getByText(/Times shown in/)).toBeVisible();
  await page.getByRole("link", { name: "Practice", exact: true }).click();
  await expect(page).toHaveURL(/calendarView=timeGridDay/);
  await page.getByRole("link", { name: "Group events", exact: true }).click();
  await expect(view).toHaveValue("timeGridDay");
  await expect(page).toHaveURL(new RegExp(`date=${date}&view=timeGridDay`));
  for (const value of ["timeGridWeek", "listWeek", "dayGridMonth"]) {
    await view.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`view=${value}`));
    await expect(page.getByRole("link", { name: "Practice", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("No events in this date range.")).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("link", { name: "Practice", exact: true })).toBeVisible();
  await page.route("**/groups/trips-club/events?**", async route => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("region", { name: "Group event calendar" }).getByRole("alert")).toContainText("Unable to load events");
  await page.unroute("**/groups/trips-club/events?**");
  await page.getByRole("button", { name: "Retry loading events" }).click();
  await expect(page.getByText("No events in this date range.")).toBeVisible();
  expect(renderErrors).toEqual([]);
});

test("mocked: mobile calendar defaults to Agenda and validates URL state", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await setup(page);
  await expect(page.getByLabel("Calendar view")).toHaveValue("listWeek");
  await page.goto("/groups/trips-club/events?date=invalid&view=invalid");
  await expect(page.getByLabel("Calendar view")).toHaveValue("listWeek");
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}&view=listWeek/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mocked: calendar overflow, cancelled labels and rapid navigation", async ({ page, request }) => {
  await setup(page);
  await createEvent(page);
  await request.post("http://127.0.0.1:54329/test/calendar-crowded");
  const date = upcomingDate(1);
  await page.goto(`/groups/trips-club/events?date=${date}&view=dayGridMonth`);
  const more = page.getByRole("button", { name: /more/ }).first();
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByRole("link", { name: "Calendar copy 5 — Cancelled", exact: true })).toBeVisible();
  await page.getByLabel("Calendar view").selectOption("listWeek");
  const cancelled = page.getByRole("link", { name: "Calendar copy 5 — Cancelled", exact: true });
  await expect(cancelled).toBeVisible();
  await cancelled.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Calendar copy 5", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Group events", exact: true }).click();
  await page.getByLabel("Calendar view").selectOption("timeGridDay");
  await page.getByRole("button", { name: "Next", exact: true }).dblclick();
  await expect(page.getByText("No events in this date range.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`date=${upcomingDate(0)}&view=timeGridDay`));
});
