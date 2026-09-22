// Local demo acceptance for the flat Home layout. External requests are blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ENCA_BASE_URL || 'http://127.0.0.1:8792';
const out=process.env.ENCA_EVIDENCE_DIR || path.join(__dirname,'../review/2026-09-22/dashboard-flat');
const build=Number(fs.readFileSync(path.join(__dirname,'../js/version.js'),'utf8').match(/build:\s*(\d+)/)[1]);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={build,scope:'Local demo; external traffic blocked; no live authentication benchmark',errors:[],layouts:[],interactions:[]};
 try{
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[736,'light'],[390,'dark'],[320,'light']]){
   const p=await browser.newPage({viewport:{width,height:1100},colorScheme:theme});p.setDefaultTimeout(12000);
   p.on('pageerror',e=>report.errors.push(e.message));
   await p.addInitScript(({theme,build})=>{localStorage.setItem('enca-theme',theme);localStorage.setItem('enca-seen-build-beta',String(build));localStorage.removeItem('enca.ovMapOpen');localStorage.removeItem('enca.wcLibraryOpen');},{theme,build});
   const graph=[];p.on('request',r=>{if(/graph.microsoft.com/.test(r.url()))graph.push(r.url());});
   await p.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
   await p.goto(base+'/?demo=1');await p.locator('#overview .db-worth').first().waitFor();
   await p.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(e=>e.classList.remove('open')));
   await p.locator('#toast').evaluate(e=>e.style.display='none').catch(()=>{});
   const layout=async state=>{
    const m=await p.locator('#overview').evaluate(el=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,shadowed:[...el.querySelectorAll('button,.db-tile,.db-check,.db-map-sec,.db-adv,.db-evid')].filter(x=>getComputedStyle(x).boxShadow!=='none').map(x=>x.className),nestedButtons:el.querySelectorAll('button button').length}));
    assert.ok(m.scroll<=m.viewport+1,`${width} ${state} overflow: ${JSON.stringify(m)}`);assert.deepEqual(m.shadowed,[]);assert.equal(m.nestedButtons,0);report.layouts.push({width,theme,state,...m});
   };
   assert.equal(await p.locator('.db-count').count(),4);assert.equal(await p.locator('.db-count').filter({visible:true}).count(),4);
   await layout('collapsed');
   await p.screenshot({path:path.join(out,`home-${width}-${theme}.png`),fullPage:true});
   const first=p.locator('[data-ovfind]').first();await first.focus();await p.keyboard.press('Enter');
   await p.locator('.db-evid').waitFor();await layout('evidence');
   assert.equal(await p.locator('[data-ovfind]').first().getAttribute('aria-expanded'),'true');
   if(width===1440)await p.screenshot({path:path.join(out,'evidence-1440-light.png'),fullPage:true});
   await p.keyboard.press('Enter');assert.equal(await p.locator('.db-evid').count(),0);
   const more=p.locator('[data-ovshowall]');if(await more.count()){await more.click();assert.ok(await p.locator('[data-ovfind]').count()>3);await more.click();}
   await p.locator('#ovMap>summary').click();await p.locator('.db-advs>summary').click();await layout('map-and-advisories');
   if(width===320)await p.screenshot({path:path.join(out,'details-320-light.png'),fullPage:true});
   assert.match(await p.locator('.db-advs').innerText(),/1 Jul 2027/);
   await p.locator('.db-count[data-ovstate="report"]').click();await p.locator('#screen-list.active').waitFor();
   assert.match(await p.locator('#screen-list').innerText(),/4 policies in view/);
   assert.match(await p.locator('#screen-list').innerText(),/Require MFA for all users — staged/);
   await p.locator('#wcHomeButton').click();await p.locator('#screen-home.active').waitFor();
   const nativeButtons=await p.locator('.db-tile-main').evaluateAll(xs=>xs.every(x=>x.tagName==='BUTTON'));
   assert.equal(nativeButtons,true);assert.deepEqual(graph,[]);
   report.interactions.push({width,theme,passed:['four counts visible','keyboard evidence open/close','view all findings','map and advisory expansion','report-only policy navigation','return home','native context buttons','zero Graph requests']});
   await p.close();
  }
  assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({build,layouts:report.layouts.length,interactionRuns:report.interactions.length,errors:report.errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
