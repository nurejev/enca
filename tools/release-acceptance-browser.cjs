// Local demo only: all requests outside loopback are blocked. No tenant writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.ENCA_EVIDENCE_DIR || '/private/tmp/enca-25370';fs.mkdirSync(out,{recursive:true});
const results={screens:[],exports:[],searches:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const theme of ['light','dark'])for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(8000);
 page.on('pageerror',e=>results.errors.push({theme,width,error:e.message}));
 await page.addInitScript(theme=>localStorage.setItem('enca-theme',theme),theme);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort());
 await page.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('#screen-home.active');
 await page.evaluate(()=>{
  document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open'));
  // Deterministic audit fixture: a loaded result, not an API assertion.
  DEMO_DATA.auditRecords=[{id:'fixture-audit',activityDateTime:'2026-09-15T08:00:00Z',activityDisplayName:'Update conditional access policy',operationType:'Update',result:'success',initiatedBy:{user:{displayName:'Acceptance Admin',userPrincipalName:'acceptance@example.test'}},targetResources:[{id:'fixture-policy',type:'Policy',displayName:'Acceptance MFA policy',modifiedProperties:[{displayName:'Policy',oldValue:'{"state":"disabled"}',newValue:'{"state":"enabled"}'}]}]}];
 });
 const tileIds=await page.evaluate(()=>Object.keys(TOOL_VERSIONS).filter(id=>document.getElementById(id)));
 const seen=new Set();
 async function inspect(route){
  await page.waitForTimeout(120);
  const screen=await page.locator('.screen.active').getAttribute('id');const mode=screen==='screen-list'&&await page.locator('#analyzeView').isVisible()?'coverage':'';const key=screen+mode;if(seen.has(key))return;seen.add(key);
  // Explicit allowlist of demo read/simulation actions only.
  const read='.screen.active [data-aurun],.screen.active [data-exrun],.screen.active [data-sirun],.screen.active [data-rirun],.screen.active [data-scrun],.screen.active [data-sgrun],.screen.active [data-dvrun],.screen.active [data-lgrun],.screen.active [data-svrun],.screen.active [data-morun],.screen.active [data-tdrun],.screen.active [data-ugrun],.screen.active #anRun,.screen.active #guRun';
  const b=page.locator(read).first();if(await b.count()&&await b.isVisible()&&await b.isEnabled()){await b.evaluate(e=>e.click());await page.waitForTimeout(500);}
  if(mode==='coverage')await page.waitForFunction(()=>document.getElementById('anResults').style.display!=='none');
  if(screen==='screen-wave'){const opt=page.locator('#wvPicker option').nth(1);if(await opt.count()){await page.locator('#wvPicker').selectOption(await opt.getAttribute('value'));await page.waitForTimeout(200);}}
  const state=await page.evaluate(()=>{const s=document.querySelector('.screen.active');return {screen:s.id,scroll:document.documentElement.scrollWidth,width:innerWidth,bodyText:s.innerText.length,overflowElements:[...s.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.right>innerWidth+2&&!e.closest('.cg-scroll,.table-wrap,.ex-scroll,.matrix-wrap');}).slice(0,8).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:Math.round(e.getBoundingClientRect().right)}))};});
  results.screens.push({theme,width,route,mode,...state});console.log(theme,width,screen,state.scroll>width+2?'OVERFLOW':'ok');
  if(state.scroll>width+2)await page.screenshot({path:path.join(out,theme+'-'+width+'-'+screen+'.png')});
  // Verify every local filter can offer loaded matches; not every empty demo has rows.
  for(const input of await page.locator('.screen.active input[list]').all()){
   if(!await input.isVisible())continue;const id=await input.getAttribute('id');if(!id?.endsWith('Search')&&id!=='searchBox')continue;
   await input.focus();await page.waitForTimeout(150);const n=await input.evaluate(e=>e.list.options.length);results.searches.push({theme,width,id,options:n});await input.blur();
  }
  if(screen==='screen-audit'){
   await page.locator('#auSearch').fill('acceptance@');await page.waitForFunction(()=>document.getElementById('auSearchList').options.length===1);
   const val=await page.locator('#auSearchList option').getAttribute('value');assert.equal(val,'acceptance@example.test');
   await page.locator('#auSearch').fill(val);await page.waitForTimeout(150);assert.equal(await page.locator('.au-sumrow').count(),1);
   assert.equal(await page.locator('#auSearchList option').count(),1);await page.locator('#auSearch').fill('');await page.locator('#auSearch').blur();
   await page.screenshot({path:path.join(out,'audit-'+theme+'-'+width+'.png')});
  }
  // Parse representative JSON and CSV downloads from populated fixtures.
  if(width===1440&&theme==='light')for(const id of ['auJson','loJson','sgCsv','exCsv']){
   const btn=page.locator('.screen.active #'+id);if(!await btn.count()||!await btn.isVisible())continue;
   const downloaded=page.waitForEvent('download');await btn.click();const d=await downloaded;
   const filename=path.join(out,d.suggestedFilename());await d.saveAs(filename);const text=fs.readFileSync(filename,'utf8');
   if(id.endsWith('Json'))assert.ok(JSON.parse(text));else {assert.ok(text.split(/\r?\n/).length>=2);assert.ok(!text.includes('[object Object]'));}
   results.exports.push({theme,width,id,bytes:Buffer.byteLength(text),format:id.endsWith('Json')?'json':'csv'});
  }
  // Render available reports and inspect their downloaded content.
  for(const button of await page.locator('.screen.active button[id$="Md"]').all()){
   if(!await button.isVisible()||!await button.isEnabled())continue;
   const id=await button.getAttribute('id');await button.evaluate(e=>e.click());await page.waitForTimeout(100);
   if(await page.locator('#reportModal.open').count()){
    const txt=await page.locator('#rptBody').innerText();assert.ok(txt.length>20,id+' empty report');assert.ok(!txt.includes('[object Object]'),id+' object rendering');
    const dims=await page.locator('#rptBody').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));results.exports.push({theme,width,id,characters:txt.length,...dims});
    if(width===1440&&theme==='light'){
      const dl=page.waitForEvent('download');await page.locator('#rptDownload').click();const download=await dl;await download.saveAs(path.join(out,download.suggestedFilename()));
    }
    await page.locator('#rptClose').click();
   }else results.exports.push({theme,width,id,status:'no report: demo data or required selection unavailable'});
  }
 }
 for(const id of tileIds){await page.evaluate(id=>{document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open'));document.getElementById(id).click();},id);await inspect(id);
 const tabs=await page.locator('.screen.active [data-tabgo]').evaluateAll(es=>es.map(e=>e.dataset.tabgo));
 for(const tab of tabs){await page.evaluate(tab=>document.querySelector('.screen.active [data-tabgo="'+tab+'"]').click(),tab);await inspect(tab);}
 }
 results.build=await page.evaluate(()=>APP_BUILD.build);await page.close();
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));}
 assert.equal(results.errors.length,0,JSON.stringify(results.errors));assert.equal(results.screens.filter(s=>s.scroll>s.width+2).length,0,'Page overflow');
})().catch(e=>{console.error(e);process.exitCode=1});
