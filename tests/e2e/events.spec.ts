import { test, expect, type Page } from "@playwright/test";
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
  await expect(page).toHaveURL(/\/groups\/[a-f0-9-]+$/);
  await page.getByRole("link", { name: "Events and destinations" }).click();
  await expect(
    page.getByRole("heading", { name: "Events and destinations" }),
  ).toBeVisible();
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
  await expect(
    page
      .locator("form")
      .filter({
        has: page.getByRole("button", { name: "Create event", exact: true }),
      })
      .getByRole("option", { name: "Community hall" }),
  ).toHaveCount(1);
}
async function createEvent(page: Page) {
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
  await form.getByLabel("Arrive by", { exact: true }).fill("2099-01-01T09:00");
  await form
    .getByLabel("Ready to leave", { exact: true })
    .fill("2099-01-01T17:00");
  await form.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
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
  await expect(
    page.getByRole("button", { name: "Save attendance" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Household", exact: true })
    .selectOption({ label: "Example household" });
  await page.getByRole("button", { name: "Show household" }).click();
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
  await expect(
    page.getByRole("button", { name: "Save ride preference" }),
  ).toHaveCount(2);
  for (const form of await page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save ride preference" }) })
    .all()) {
    await form
      .getByRole("combobox", { name: "Ride mode", exact: true })
      .selectOption("self_transport");
    await form.getByRole("button", { name: "Save ride preference" }).click();
    await expect(form.getByRole("status")).toHaveText("Saved.");
  }
  const edit = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save event", exact: true }),
    });
  await edit.getByLabel("Arrive by", { exact: true }).fill("2099-01-01T09:15");
  await edit.getByRole("checkbox").check();
  page.once("dialog", (d) => d.accept());
  await edit.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page).toHaveURL(eventUrl);
  await page.goto(eventUrl + "?household=33333333-3333-4333-8333-333333333333");
  await expect(
    page.getByText("Needs reconfirmation", { exact: true }),
  ).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save attendance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save ride preference" }),
  ).toHaveCount(0);
});
test("mocked: recurrence requires preview and supports future replacement", async ({
  page,
}) => {
  await setup(page);
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Preview occurrences" }) });
  await form.getByLabel("Series name").fill("Monthly meet");
  await form.getByLabel("Event timezone").fill("UTC");
  await form.getByRole("checkbox", { name: /I confirm/ }).check();
  await form.getByLabel("Start date").fill("2099-01-01");
  await form.getByLabel("End date").fill("2099-04-30");
  await form.getByLabel("Frequency").selectOption("monthly");
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
    page.getByRole("link", { name: "Monthly meet", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("link", { name: "Monthly meet", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "This and future occurrences" }),
  ).toBeVisible();
  const occurrence = page.locator("form").filter({has:page.getByRole("button",{name:"Save event",exact:true})});
  await occurrence.getByLabel("Event name").fill("Single exception");
  await occurrence.getByRole("checkbox",{name:/I confirm/}).check();
  page.once("dialog",dialog=>dialog.accept());
  await occurrence.getByRole("button",{name:"Save event",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Single exception",exact:true})).toBeVisible();
  const replacement = page.locator("form").filter({has:page.getByRole("button",{name:"Preview occurrences"})});
  await replacement.getByLabel("Series name").fill("Successor meet");
  await replacement.getByRole("checkbox",{name:/I confirm/}).check();
  await replacement.getByRole("button",{name:"Preview occurrences"}).click();
  await expect(replacement.getByRole("alert")).toContainText("2 existing events");
  page.once("dialog",dialog=>dialog.accept());
  await replacement.getByRole("button",{name:"Replace this and future occurrences",exact:true}).click();
  await expect(page.getByRole("link",{name:"Successor meet",exact:true})).toHaveCount(2);
  await expect(page.locator("li").filter({hasText:"cancelled"})).toHaveCount(2);
});

test("mocked: Members select private locations and manage rides without settings access", async ({
  page,
  request,
}) => {
  await setup(page);
  await createEvent(page);
  const eventUrl = page.url();
  await page.goto("/households/33333333-3333-4333-8333-333333333333/locations");
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
  await request.post("http://127.0.0.1:54329/test/event-member");
  await page.reload();
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
  await page
    .getByRole("combobox", { name: "Attendance", exact: true })
    .selectOption("going");
  await page.getByRole("button", { name: "Save attendance" }).click();
  const ride = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save ride preference" }) })
    .first();
  await ride
    .getByRole("combobox", { name: "Ride mode", exact: true })
    .selectOption("can_drive");
  await ride
    .getByRole("combobox", { name: "Pickup / dropoff address", exact: true })
    .selectOption({ label: "Home pickup" });
  await expect(ride.getByLabel("Additional rider seats")).toHaveValue("1");
  await expect(ride.getByLabel("Maximum detour minutes")).toHaveValue("10");
  await ride.getByRole("button", { name: "Save ride preference" }).click();
  await expect(ride.getByRole("status")).toHaveText("Saved.");
});

test("mocked: rejected geocoding preserves destination and household addresses", async ({ page, request }) => {
  await setup(page);
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

  await page.goto("/households/33333333-3333-4333-8333-333333333333/locations");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Save address", exact: true }) }).last();
  await create.getByLabel("Name", { exact: true }).fill("Verified home");
  await create.getByLabel("Address line 1").fill("Synthetic private street");
  await create.getByLabel("City").fill("Test city");
  await create.getByLabel("State / region").fill("TS");
  await create.getByLabel("Postal code").fill("00000");
  await create.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(create.getByRole("status")).toHaveText("Saved.");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Verified home", exact: true }) });
  const householdEdit = section.locator("form").filter({ has: page.getByRole("button", { name: "Save address", exact: true }) });
  await householdEdit.getByLabel("Address line 1").fill("Another private street");
  await request.post("http://127.0.0.1:54329/test/geocoding", { data: { mode: "limited" } });
  page.once("dialog", dialog => dialog.accept());
  await householdEdit.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(householdEdit.getByRole("status")).toContainText("Try again in 30 seconds");
  await expect(section.locator("p").first()).toContainText("Synthetic private street");
});
