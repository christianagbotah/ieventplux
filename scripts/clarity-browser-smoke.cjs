/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS CI harness. */
// Browser-only CI checks. Uses disposable seeded stack, no live credentials.
// Playwright is installed at a pinned version in runner temporary storage.
const {chromium}=require(process.env.IEVX_PLAYWRIGHT_MODULE)
const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const base='http://127.0.0.1:3000'
const output=path.resolve('ui-qa')
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
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:width===1440?900:740})
    const radios=settings.getByRole('radio')
    const first=await radios.nth(0).boundingBox(), second=await radios.nth(1).boundingBox()
    assert(first&&second&&Math.abs(first.y-second.y)<20&&second.x>first.x,'Settlement destination choices must share a row at '+width)
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
  await page.close()
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
