/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS CI harness. */
// Browser-only CI checks. Uses disposable seeded stack, no live credentials.
// Playwright is installed at a pinned version in runner temporary storage.
const {chromium}=require(process.env.IEVX_PLAYWRIGHT_MODULE)
const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const base='http://127.0.0.1:3000'
const output=path.resolve('ui-qa')
async function verifyShell(page,width,route){
 const shell=page.locator('#main > div.ievx-page-shell')
 await shell.waitFor({state:'visible'})
 const box=await shell.boundingBox()
 assert(box&&box.width<=1153,'Shared shell exceeds 1152px: '+route+' '+width)
 if(width>=1024)assert(box.x>=39&&Math.abs(width-box.x-box.width-box.x)<=3,'Shared shell not centered: '+route+' '+width+' '+JSON.stringify(box))
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
 assert(overflow<=2,'Page overflow: '+route+' '+width+' '+overflow)
 return box
}
async function main(){
 fs.mkdirSync(output,{recursive:true})
 const catalogue=await fetch(base+'/api/v1/events?pageSize=12').then(r=>r.json())
 const event=catalogue.items?.find(row=>row.slug)
 assert(event,'Seeded event required for browser QA')
 const browser=await chromium.launch({headless:true})
 try{
  for(const [width,height] of [[320,740],[390,844],[768,1024],[1440,1000]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',deviceScaleFactor:1})
   await page.goto(base+'/#/',{waitUntil:'domcontentloaded'})
   await page.locator('h1').first().waitFor({state:'visible',timeout:45000})
   const search=page.locator('#browse input[type=search]')
   await search.waitFor({state:'visible',timeout:45000})
   await page.locator('.ievx-event-card').first().waitFor({state:'visible',timeout:45000})
   await page.screenshot({path:path.join(output,'discover-'+width+'.png'),fullPage:true,animations:'disabled'})
   await verifyShell(page,width,'discover')
   const check=await page.evaluate(()=>{
    const input=document.querySelector('#browse input[type=search]')
    const card=document.querySelector('.ievx-event-card h3')
    const nav=document.querySelector('nav[aria-label="Mobile primary"]')
    const labels=nav&&getComputedStyle(nav).display!=='none'?Array.from(nav.querySelectorAll('button span')).map(el=>({text:el.textContent,overflow:el.scrollWidth-el.clientWidth})):[]
    const overflow=document.documentElement.scrollWidth-innerWidth
    const offenders=overflow>2?Array.from(document.querySelectorAll('body *')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&getComputedStyle(el).position!=='fixed'}).slice(0,15).map(el=>({tag:el.tagName,classes:typeof el.className==='string'?el.className.slice(0,180):'',right:Math.round(el.getBoundingClientRect().right)})):[]
    return {overflow,offenders,labels,inputFont:parseFloat(getComputedStyle(input).fontSize),inputHeight:input.getBoundingClientRect().height,inputTop:input.getBoundingClientRect().top,titleFont:parseFloat(getComputedStyle(card).fontSize)}
   })
   assert(check.overflow<=2,'Discovery viewport overflow '+width+': '+check.overflow+' '+JSON.stringify(check.offenders))
   assert(check.inputFont>=16,'Search font too small '+width)
   assert(check.inputHeight>=48,'Search control too small '+width)
   assert(check.inputTop<180,'Search not near the top of viewport '+width+': '+check.inputTop)
   assert(check.labels.every(label=>label.overflow<=1),'Mobile nav label clipped '+width+': '+JSON.stringify(check.labels))
   assert(check.titleFont>=(width<1024?17:18),'Event card title too small '+width)
   await page.goto(base+'/#/event/'+encodeURIComponent(event.slug),{waitUntil:'domcontentloaded'})
   await page.getByRole('heading',{level:1,name:event.title,exact:true}).waitFor({state:'visible',timeout:45000})
   await verifyShell(page,width,'event')
   const detail=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,titleSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)}))
   assert(detail.overflow<=2,'Event detail viewport overflow '+width+': '+detail.overflow)
   assert(detail.titleSize>=(width<640?26:28),'Event heading too small '+width)
   await page.screenshot({path:path.join(output,'event-'+width+'.png'),fullPage:true,animations:'disabled'})
   console.log('PASS clarity viewport '+width,check,detail)
   await page.close()
  }
  // Real seeded owner session and draft storefront; simulate the exact 403
  // at the network boundary to reproduce the user-reported scroll failure.
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',deviceScaleFactor:1})
  const login=await page.request.post(base+'/api/v1/auth/login',{data:{email:'pastor@lightworld.dev',password:'Dev@12345'}})
  assert(login.ok(),'Seeded seller sign-in')
  const slug='ci-visual-shop-'+Date.now()
  const created=await page.request.post(base+'/api/v1/marketplace/stores',{data:{name:'Visual QA shop',slug,category:'Arts and crafts'}})
  assert(created.ok(),'Seeded visual store created')
  await page.goto(base+'/#/shop/'+slug,{waitUntil:'domcontentloaded'})
  const settings=page.getByRole('region',{name:'Payment and settlement settings'})
  const save=settings.getByRole('button',{name:'Save payment preferences'})
  await save.waitFor({state:'visible',timeout:45000})
  for(const width of [320,390,768,1280,1440]){
    await page.setViewportSize({width,height:width===1440?900:740})
    const radios=settings.getByRole('radio')
    const first=await radios.nth(0).boundingBox(), second=await radios.nth(1).boundingBox()
    assert(first&&second&&Math.abs(first.y-second.y)<25&&second.x>first.x,'Settlement destination choices must share a row at '+width)
    await verifyShell(page,width,'shop detail')
    const optionBoxes=await settings.locator('.ievx-payment-option').evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})))
    assert(optionBoxes.every(box=>box.width<=250&&box.height>=44),'Payment options must be compact, not full-row: '+width+' '+JSON.stringify(optionBoxes))
    if(width>=1280){const a=await settings.locator('[data-payment-methods]').boundingBox(),b=await settings.locator('[data-settlement-destination]').boundingBox();assert(a&&b&&Math.abs(a.y-b.y)<5&&a.x<b.x&&a.width>b.width,'Desktop payment/settlement should share a 3:2 row')}
    await settings.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'shop-payment-layout-'+width+'.png'),animations:'disabled'})
  }
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:width===1440?900:740})
   await page.route('**/api/v1/marketplace/stores/'+slug+'/payment-settings',async route=>{
    if(route.request().method()==='PATCH')await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'FORBIDDEN',message:'Verify your email before changing payment preferences.'}})})
    else await route.continue()
   })
   await save.scrollIntoViewIfNeeded()
   await save.click()
   const feedback=settings.locator('[data-submission-feedback][role=alert]')
   await feedback.waitFor({state:'visible'})
   await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-submission-feedback'))
   const bounds=await feedback.boundingBox()
   assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<= (width===1440?900:740),'Submission error must be inside viewport '+width)
   assert((await feedback.innerText()).includes('Verify your email'),'Exact verification error visible')
   await page.screenshot({path:path.join(output,'shop-payment-error-'+width+'.png'),animations:'disabled'})
   await page.unroute('**/api/v1/marketplace/stores/'+slug+'/payment-settings')
  }
  await settings.getByRole('checkbox',{name:'Mobile money',exact:true}).check()
  await save.click()
  await settings.locator('[data-submission-feedback][role=status]').waitFor({state:'visible'})
  assert((await settings.locator('[data-submission-feedback][role=status]').innerText()).includes('saved'),'Successful server save confirmed')
  await page.getByRole('button',{name:'Edit store logo'}).waitFor({state:'visible'})
  await page.getByRole('button',{name:'Edit banner'}).waitFor({state:'visible'})
  console.log('MARKETPLACE_SUBMISSION_FEEDBACK_BROWSER_PASS')
  for(const width of [390,1280,1440,1920]){
    await page.setViewportSize({width,height:900})
    for(const route of ['services','following','shop','seller','me?tab=profile','live']){
      await page.goto(base+'/#/'+route,{waitUntil:'domcontentloaded'})
      await page.locator('#main').getByRole('heading').first().waitFor({state:'visible',timeout:45000})
      const bounds=await verifyShell(page,width,route)
      console.log('PASS shared content shell',route,width,bounds.width,bounds.x)
      if(width===1440||width===390)await page.screenshot({path:path.join(output,'shell-'+route.replace(/[^a-z]/g,'-')+'-'+width+'.png'),animations:'disabled'})
    }
  }
  console.log('SHARED_PAGE_SHELL_BROWSER_PASS')
  // Synthetic profile in the disposable CI database, never a live user.
  const createdOrg=await page.request.post(base+'/api/v1/orgs',{data:{name:'Visual QA organizer',orgType:'INDIVIDUAL',tagline:'Initial profile'}})
  assert(createdOrg.ok(),'Synthetic organizer created')
  const org=(await createdOrg.json()).org
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:width===1440?900:740})
    await page.goto(base+'/#/org/'+org.slug,{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Edit profile',exact:true}).waitFor({state:'visible'})
    await verifyShell(page,width,'organizer profile')
    assert(await page.getByRole('button',{name:'Follow',exact:true}).count()===0,'Owner must not see Follow')
    await page.getByRole('button',{name:'Edit profile picture'}).waitFor({state:'visible'})
    await page.getByRole('button',{name:'Edit banner'}).waitFor({state:'visible'})
    await page.screenshot({path:path.join(output,'org-profile-owner-'+width+'.png'),animations:'disabled'})
  }
  await page.getByRole('button',{name:'Edit profile',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Edit profile'})
  await dialog.getByLabel('Short introduction').fill('Updated public profile')
  await dialog.getByLabel('Website',{exact:true}).fill('invalid://')
  await dialog.getByRole('button',{name:'Save profile'}).click()
  const profileFeedback=dialog.locator('[data-submission-feedback][role=alert]')
  await profileFeedback.waitFor({state:'visible'})
  await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-submission-feedback'))
  assert(await dialog.getByLabel('Short introduction').inputValue()==='Updated public profile','Invalid submission retains profile data')
  await dialog.getByLabel('Website',{exact:true}).fill('https://example.com')
  await dialog.getByRole('button',{name:'Save profile'}).click()
  await dialog.waitFor({state:'hidden'})
  await page.getByText('Updated public profile',{exact:false}).first().waitFor({state:'visible'})
  // New browser context without the owner session must not get editor controls.
  const guest=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'})
  await guest.goto(base+'/#/org/'+org.slug,{waitUntil:'domcontentloaded'})
  await guest.getByRole('heading',{name:org.name,exact:true}).waitFor({state:'visible'})
  assert(await guest.getByRole('button',{name:'Edit profile',exact:true}).count()===0,'Guest cannot edit')
  assert(await guest.getByRole('button',{name:'Edit profile picture'}).count()===0,'Guest cannot edit picture')
  assert(await guest.getByRole('button',{name:'Edit banner'}).count()===0,'Guest cannot edit banner')
  await guest.close()
  console.log('ORGANIZER_PROFILE_OWNER_BROWSER_PASS')
  await page.close()
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
