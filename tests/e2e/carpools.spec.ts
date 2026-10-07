import { test, expect, type Page } from "@playwright/test";
const a='33333333-3333-4333-8333-333333333333';
async function login(page:Page,email:string){
  await page.goto('/sign-in');await page.getByLabel('Email address').fill(email);
  await page.getByRole('button',{name:'Send code',exact:true}).click();await page.getByLabel('Sign-in code').fill('123456');
  await page.getByRole('button',{name:'Verify code'}).click();await expect(page).toHaveURL(/\/account$/);
}
test.beforeEach(async({request,page})=>{
  await request.post('http://127.0.0.1:54329/test/reset');await login(page,'adult@example.com');
  await request.post('http://127.0.0.1:54329/test/matching');await request.post('http://127.0.0.1:54329/test/connections');
  await request.post('http://127.0.0.1:54329/test/carpools');await page.goto(`/households/example-household/connections`);
});
async function create(page:Page){
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Create carpool',exact:true})});
  await form.getByRole('checkbox').check();await form.getByRole('button').click();await expect(page).toHaveURL(/\/carpools\/[\da-f-]+$/);
  return page.url().split('/').pop()!;
}
test('mocked: invitation, both-leg agreement, revision resets, schedule and cancellation',async({page,browser,request})=>{
  const cid=await create(page),context=await browser.newContext(),other=await context.newPage();
  try{
    await login(other,'recipient@example.com');await other.goto(`/households/compatible-household/carpools/${cid}`);
    await expect(other.getByText('Private test address')).toHaveCount(0);
    const accept=other.locator('form').filter({has:other.getByRole('button',{name:'Accept carpool'})});await accept.getByRole('checkbox').check();await accept.getByRole('button').click();
    await expect(other.getByText('Match club — Status: accepted')).toBeVisible();await page.reload();
    for(const leg of ['to_event','from_event']){
      const propose=page.getByRole('region',{name:'Propose a ride'});await propose.getByLabel('Direction').selectOption(leg);await propose.getByRole('checkbox').check();await propose.getByRole('button',{name:'Propose ride'}).click();
      const ar=page.getByRole('region',{name:`Match event ${leg}`,exact:true});await expect(ar).toBeVisible();await ar.getByText('Edit ride — both households must approve again').click();
      const driver=ar.locator('form').filter({has:page.getByRole('button',{name:'Save driver and seats'})});await driver.getByLabel('Adult driver').selectOption({index:1});await driver.getByLabel('Additional rider seats').fill('2');await driver.getByRole('checkbox').check();await driver.getByRole('button').click();
      await expect(ar.getByText('Driver: Alex Example')).toBeVisible();await other.reload();
      const br=other.getByRole('region',{name:`Match event ${leg}`,exact:true});await br.getByText('Edit ride — both households must approve again').click();
      const select=br.locator('form').filter({has:other.getByRole('button',{name:'Save my participants'})});await select.getByRole('checkbox',{name:'Alex Example',exact:true}).check();await select.getByRole('checkbox',{name:/I agree/}).check();await select.getByRole('button').click();
      await expect(br.getByText('Riders: Alex Example')).toBeVisible();
      const approval=br.locator('form').filter({has:other.getByRole('button',{name:'Approve ride'})});await approval.getByRole('checkbox').check();await approval.getByRole('button').click();await expect(br.getByText('Status: proposed',{exact:true})).toBeVisible();
      await page.reload();const aa=ar.locator('form').filter({has:page.getByRole('button',{name:'Approve ride'})});await aa.getByRole('checkbox').check();await aa.getByRole('button').click();await expect(ar.getByText('Status: confirmed',{exact:true})).toBeVisible();
    }
    await page.goto(`/groups/match-club/match-event?household=${a}`);
    await expect(page.getByRole('region',{name:'Confirmed carpool rides'}).getByRole('link')).toHaveCount(2);
    await page.goto(`/households/example-household/carpools/${cid}`);await request.post('http://127.0.0.1:54329/test/carpools',{data:{invalidate:true}});await page.reload();
    const ride=page.getByRole('region',{name:'Match event to_event',exact:true});await expect(ride.getByText('Status: needs_review',{exact:true})).toBeVisible();
    await ride.getByText('Edit ride — both households must approve again').click();const time=ride.locator('form').filter({has:page.getByRole('button',{name:'Save agreed time'})});await time.getByLabel(/Agreed time/).fill('2099-01-01T04:05');await time.getByRole('checkbox').check();await time.getByRole('button').click();await expect(ride.getByText('Status: proposed',{exact:true})).toBeVisible();await expect(ride.getByText('Your approval: needed; other household: needed')).toBeVisible();
    page.once('dialog',d=>d.accept());await ride.getByRole('button',{name:'Cancel ride'}).click();await expect(ride.getByText('Status: canceled',{exact:true})).toBeVisible();
  }finally{await context.close();}
});
test('mocked: decline, re-invite, close and unavailable access',async({page,browser})=>{
  const cid=await create(page),context=await browser.newContext(),other=await context.newPage();
  try{
    await login(other,'recipient@example.com');await other.goto(`/households/compatible-household/carpools/${cid}`);await other.getByRole('button',{name:'Decline carpool'}).click();await expect(other.getByText('Match club — Status: declined')).toBeVisible();
    await page.goto(`/households/example-household/connections`);const next=await create(page);expect(next).not.toBe(cid);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Close carpool'}).click();await expect(page.getByText('Match club — Status: closed')).toBeVisible();
    await other.goto(`/households/example-household/carpools/${next}`);await expect(other.getByText('Carpool unavailable. Reload to check access.')).toHaveCount(0);await expect(other.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  }finally{await context.close();}
});
