// All reachable tool/subtab layouts, centered details and native branding.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ENCA_BASE_URL || 'http://127.0.0.1:8774';
const url=base+'/?demo=1';
const evidence=process.env.ENCA_EVIDENCE_DIR || path.join(__dirname,'../review/2026-09-21/workspaces');fs.mkdirSync(evidence,{recursive:true});
const build=Number(fs.readFileSync(path.join(__dirname,'../js/version.js'),'utf8').match(/build:\s*(\d+)/)[1]);
const report={date:new Date().toISOString(),baseBuild:build,errors:[],screens:[],subtabs:[],details:[],branding:[],unavailable:[]};
const hosts=['toolSignins','toolAudit','toolAnalyze','toolWhoIs','toolWhatIf','toolGapCheck','toolLocations','toolBaseline'];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  async function pageFor(width,theme,brand){
   const p=await browser.newPage({viewport:{width,height:1000},colorScheme:theme});p.setDefaultTimeout(12000);
   p.on('pageerror',e=>report.errors.push(e.message));
   await p.addInitScript(({theme,build,brand})=>{
    localStorage.setItem('enca-theme',theme);localStorage.setItem('enca-seen-build-beta',String(build));
    if(brand)localStorage.setItem('enca-selfhost-brand',JSON.stringify({v:1,brand}));
   },{theme,build,brand});
   await p.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
   await p.goto(url);await p.waitForSelector('#wcHome');return p;
  }
  for(const [width,theme] of [[1440,'light'],[390,'dark']]){
   const p=await pageFor(width,theme),seen=new Set();
   const click=sel=>p.locator(sel).evaluate(el=>el.click());
   async function inspect(){
    const data=await p.locator('.screen.active').evaluate(el=>{
     const h=[...el.querySelectorAll('.wc-page-title')].find(e=>e.getClientRects().length);
     return {id:el.id,tool:el.classList.contains('tool'),title:h?.textContent,font:h?getComputedStyle(h).fontSize:null,viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};
    });
    if(!data.tool||seen.has(data.id))return;seen.add(data.id);
    report.screens.push({width,theme,...data});
    if(data.scroll>data.viewport+2){
     report.overflow=await p.locator('.screen.active').evaluate(el=>[...el.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth).map(e=>({tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.slice(0,120),width:e.getBoundingClientRect().width,style:e.getAttribute('style')})).slice(-20));
     await p.screenshot({path:path.join(evidence,`overflow-${data.id}-${width}.png`)});
    }
    assert.ok(data.scroll<=data.viewport+2,`${data.id} overflows at ${width}: ${data.scroll}`);
    assert.ok(data.title,`${data.id} has no shared visible title`);
    if(width===1440)await p.screenshot({path:path.join(evidence,`tool-${data.id.slice(7)}-${width}-${theme}.png`)});
   }
   const ids=await p.locator('#sideNav [data-nav]').evaluateAll(es=>es.map(e=>e.dataset.nav));
   for(const id of ids){await click('#'+id);await inspect();await p.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(el=>el.classList.remove('open')));}
   for(const id of hosts){
    await click('#'+id);
    const tabs=await p.locator('.screen.active [data-tabgo]').evaluateAll(es=>es.map(e=>e.dataset.tabgo));
    for(const tab of tabs){
     await click('.screen.active [data-tabgo="'+tab+'"]');
     assert.equal(await p.locator('.screen.active [data-tabgo].active').getAttribute('data-tabgo'),tab);
     report.subtabs.push({width,theme,tab});await inspect();
    }
   }
   await click('#toolCaGroups');
   await p.keyboard.press('Control+k');await p.locator('#cpInput').fill('T35');
   await p.locator('#cpList .cp-item').first().click();await inspect();
   const all=await p.locator('.screen.tool').evaluateAll(es=>es.map(e=>e.id));
   report.unavailable.push({width,theme,screens:all.filter(id=>!seen.has(id)),reason:'CIS is tenant-gated and unavailable in demo; no gate bypassed.'});
   assert.deepEqual(all.filter(id=>!seen.has(id)),['screen-cis']);
   await click('#toolPolicies');await click('#viewList');
   if(await p.locator('#workspaceInspector').isVisible())await p.locator('[data-inspector-close]').click();await p.locator('#ptable .pname').first().click();await p.locator('[data-inspector-detail]').click();await p.locator('#detailModal.open').waitFor();
   const box=await p.locator('#detailBody').boundingBox();
   const backdrop=await p.locator('#detailModal').boundingBox();
   assert.ok(Math.abs(box.x+box.width/2-(backdrop.x+backdrop.width/2))<2);assert.ok(box.height<=980);
   assert.equal(await p.locator('#detailBody .sect').count(),6);
   assert.equal(await p.locator('#detailBody').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   assert.equal(await p.locator('#detailBody').getAttribute('role'),'dialog');
   await p.screenshot({path:path.join(evidence,`policy-details-${width}-${theme}.png`)});
   // Native nested dependency, focus trap, Escape, close and backdrop behavior.
   await p.locator('#detailBody .dep-link').first().click();await p.locator('#depModal.open').waitFor();
   await p.keyboard.press('Escape');await p.locator('#depModal').waitFor({state:'hidden'});
   assert.equal(await p.locator('#detailModal').isVisible(),true);
   await p.locator('#detailBody [data-pact="document"]').click();await p.locator('#exportModal.open').waitFor();
   await p.locator('#expCancel').click();
   if(await p.locator('#workspaceInspector').isVisible())await p.locator('[data-inspector-close]').click();await p.locator('#ptable .pname').first().click();await p.locator('[data-inspector-detail]').click();await p.locator('#detailModal.open').waitFor();
   await p.keyboard.press('Escape');await p.locator('#detailModal').waitFor({state:'hidden'});
   assert.equal(await p.locator('[data-inspector-detail]').evaluate(el=>el===document.activeElement),true);
   if(await p.locator('#workspaceInspector').isVisible())await p.locator('[data-inspector-close]').click();await p.locator('#ptable .pname').first().click();await p.locator('[data-inspector-detail]').click();await p.locator('#detailModal.open').waitFor();
   await p.locator('#detailBody .wc-detail-top button').click();await p.locator('#detailModal').waitFor({state:'hidden'});
   if(await p.locator('#workspaceInspector').isVisible())await p.locator('[data-inspector-close]').click();await p.locator('#ptable .pname').first().click();await p.locator('[data-inspector-detail]').click();await p.locator('#detailModal.open').waitFor();
   await p.locator('#detailModal').click({position:{x:2,y:2}});await p.locator('#detailModal').waitFor({state:'hidden'});
   await click('#viewCards');await p.locator('#cardsView [data-open]').first().click();await p.locator('#detailModal.open').waitFor();
   assert.equal(await p.locator('#detailBody .wc-detail-top').count(),1);await p.keyboard.press('Escape');
   report.details.push({width,theme,centered:true,sixSettingsSections:true,nestedDependency:true,documentationAction:true,focusRestored:true,escapeCloseBackdrop:true,cards:true});
   await p.close();
  }
  const logo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="36" viewBox="0 0 180 36"><rect width="180" height="36" rx="6" fill="#f9aa1b"/><text x="12" y="25" fill="#112544" font-size="21" font-family="sans-serif" font-weight="bold">ACME</text></svg>').toString('base64');
  const brand={name:'Acme CA',org:'Acme',logo,logoWide:true,hideOrgName:true,colorsLight:{'--green':'#2465db','--green-deep':'#102b53','--accent2':'#2465db','--lemon':'#faa51c','--bg':'#f2f6fd','--soft':'#eaf0fa','--soft2':'#f5f8fd','--ink':'#122640','--border':'#d6e2f2','--muted':'#596f8e'},colorsDark:{'--green':'#a6c6ff','--green-deep':'#0b2345','--accent2':'#a6c6ff','--lemon':'#faa51c'}};
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'light'],[320,'dark']]){
   const p=await pageFor(width,theme,brand);
   assert.equal(await p.locator('#wcBrandName').textContent(),'Acme CA');
   assert.equal(await p.locator('#brandLogo').getAttribute('src'),logo);
   assert.equal(await p.locator('body > header').evaluate(e=>getComputedStyle(e).backgroundColor),theme==='light'?'rgb(16, 43, 83)':'rgb(11, 35, 69)');
   const bounds=await p.evaluate(()=>{const r=id=>{const x=document.getElementById(id).getBoundingClientRect();return {x:x.x,right:x.right};};return {logo:r('logoHome'),tools:r('wcHeaderTools'),viewport:innerWidth,scroll:document.documentElement.scrollWidth};});
   assert.ok(bounds.logo.right<=bounds.tools.x);assert.ok(bounds.scroll<=bounds.viewport);
   await p.screenshot({path:path.join(evidence,`branding-${width}-${theme}.png`)});
   if(width===1440){
    // Apply through ENCA's real branding form, including a light header colour.
    await p.locator('#acctBtn').click();await p.locator('#brandingBtn').click();
    await p.locator('#shName').fill('Acme workspace');
    await p.locator('[data-ct="colorsLight"][data-ck="--green-deep"]').fill('#d8e8ff');
    await p.locator('#shApply').click();
    assert.equal(await p.locator('#wcBrandName').textContent(),'Acme workspace');
    assert.equal(await p.locator('body > header').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(216, 232, 255)');
    assert.equal(await p.locator('body > header').evaluate(e=>getComputedStyle(e).color),'rgb(17, 17, 17)');
   }
   report.branding.push({width,theme,logo:true,palette:true,noOverlap:true,liveApply:width===1440});await p.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(evidence,'layout-validation.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({screens:report.screens.length,subtabs:report.subtabs.length,details:report.details,branding:report.branding,unavailable:report.unavailable,errors:report.errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
