/* eslint-disable @typescript-eslint/no-require-imports */
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
   const check=await page.evaluate(()=>{
    const input=document.querySelector('#browse input[type=search]')
    const card=document.querySelector('.ievx-event-card h3')
    return {overflow:document.documentElement.scrollWidth-innerWidth,inputFont:parseFloat(getComputedStyle(input).fontSize),inputHeight:input.getBoundingClientRect().height,titleFont:parseFloat(getComputedStyle(card).fontSize)}
   })
   assert(check.overflow<=2,'Discovery viewport overflow '+width+': '+check.overflow)
   assert(check.inputFont>=16,'Search font too small '+width)
   assert(check.inputHeight>=48,'Search control too small '+width)
   assert(check.titleFont>=18,'Event card title too small '+width)
   await page.screenshot({path:path.join(output,'discover-'+width+'.png'),fullPage:true,animations:'disabled'})
   await page.goto(base+'/#/event/'+encodeURIComponent(event.slug),{waitUntil:'domcontentloaded'})
   await page.getByRole('heading',{level:1,name:event.title,exact:true}).waitFor({state:'visible',timeout:45000})
   const detail=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,titleSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)}))
   assert(detail.overflow<=2,'Event detail viewport overflow '+width+': '+detail.overflow)
   assert(detail.titleSize>=28,'Event heading too small '+width)
   await page.screenshot({path:path.join(output,'event-'+width+'.png'),fullPage:true,animations:'disabled'})
   console.log('PASS clarity viewport '+width,check,detail)
   await page.close()
  }
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
