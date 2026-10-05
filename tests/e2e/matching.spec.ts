import { test, expect } from "@playwright/test";
test.beforeEach(async({page,request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
  await page.goto("/sign-in");await page.getByLabel("Email address").fill("adult@example.com");await page.getByRole("button",{name:"Send code",exact:true}).click();await page.getByLabel("Sign-in code").fill("123456");await page.getByRole("button",{name:"Verify code"}).click();await expect(page).toHaveURL(/\/account$/);
  const r=await request.post("http://127.0.0.1:54329/test/matching");const data=await r.json();await page.goto(data.url);
});
test("mocked: explicit discovery, both legs, own participants, household selection and safe summaries",async({page})=>{
  const panel=page.getByRole("region",{name:"To event matches",exact:true});
  await expect(panel.getByRole("heading",{name:"Compatible household"})).toHaveCount(0);
  const [payload]=await Promise.all([
    page.waitForResponse(r=>r.request().headers()["next-action"]!==undefined && Boolean(r.request().postData()?.includes("to_event"))).then(r=>r.text()),
    panel.getByRole("button",{name:"Find matches",exact:true}).click(),
  ]);
  for(const secret of ["33.7512345","33.7712345","88888888-8888-4888-8888","99999999-9999-4999-8999","driver_ride_id","fingerprint"])expect(payload).not.toContain(secret);
  await expect(panel.getByRole("heading",{name:"Compatible household"})).toHaveCount(1);
  await expect(panel.getByText("Alex: Your household drives")).toBeVisible();await expect(panel.getByText("Taylor: Other household drives")).toBeVisible();await expect(panel.getByText(/Arrival windows overlap/)).toHaveCount(2);
  const outbound=page.getByRole("region",{name:"From event matches",exact:true});await outbound.getByRole("button",{name:"Find matches",exact:true}).click();await expect(outbound.getByText(/Departure windows overlap/)).toHaveCount(2);
  await page.getByRole("combobox",{name:"Household",exact:true}).selectOption({label:"Other own household"});await page.getByRole("button",{name:"Show household"}).click();await expect(page.getByRole("heading",{name:"Compatible household"})).toHaveCount(0);await expect(page.getByText(/Mark a participant as going/)).toHaveCount(2);
});
test("mocked: partial batches accumulate and final results become complete",async({page,request})=>{
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"more"}});await page.reload();const panel=page.getByRole("region",{name:"To event matches",exact:true});
  await panel.getByRole("button",{name:"Find matches",exact:true}).click();await expect(panel.getByText(/ranking is provisional/)).toBeVisible();await expect(panel.getByText(/adds about/)).toHaveCount(20);
  await panel.getByRole("button",{name:"Check more candidates"}).click();await expect(panel.getByText(/adds about/)).toHaveCount(23);await expect(panel.getByText(/ranking is provisional/)).toHaveCount(0);
});
test("mocked: empty, transient failure, cooldown and retry",async({page,request})=>{
  const panel=page.getByRole("region",{name:"To event matches",exact:true});
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"empty"}});await panel.getByRole("button",{name:"Find matches",exact:true}).click();await expect(panel.getByText(/No compatible matches found/)).toBeVisible();
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"failure"}});await panel.getByRole("button",{name:"Find matches",exact:true}).click();await expect(panel.getByText(/ranking is provisional/)).toBeVisible();await expect(panel.getByText(/No compatible matches found/)).toHaveCount(0);await expect(panel.getByRole("button",{name:"Retry matches"})).toBeDisabled();
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"success"}});await expect(panel.getByRole("button",{name:"Retry matches"})).toBeEnabled();await panel.getByRole("button",{name:"Retry matches"}).click();await expect(panel.getByRole("heading",{name:"Compatible household"})).toBeVisible();
});
test("mocked: loading, missing preferences and reconfirmation",async({page,request})=>{
  const panel=page.getByRole("region",{name:"To event matches",exact:true});
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"slow"}});await panel.getByRole("button",{name:"Find matches",exact:true}).click();await expect(panel.getByRole("status")).toContainText("Checking compatible rides");await expect(panel.getByRole("heading",{name:"Compatible household"})).toBeVisible();
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"missing"}});await page.reload();await expect(panel.getByText(/Mark a participant as going/)).toBeVisible();await expect(panel.getByRole("button",{name:"Find matches",exact:true})).toHaveCount(0);
  await request.post("http://127.0.0.1:54329/test/matching",{data:{mode:"reconfirm"}});await page.reload();await expect(panel.getByText(/Reconfirm your ride preferences/)).toBeVisible();
});
