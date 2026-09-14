// Read-only local demo check. Start the repo server on 127.0.0.1:8769 first.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path');
const out=name=>path.join(process.env.ENCA_EVIDENCE_DIR || '/private/tmp',name);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('response',r=>{if(r.status()===404)console.log('404',r.url());});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','alcdn.msauth.net','alcdn.msftauth.net','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(u.hostname)&&route.request().method()==='GET'?route.continue():route.abort();});
 await page.goto('http://127.0.0.1:8769/?demo=1',{waitUntil:'networkidle'});
 await page.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open')));
 if(await page.locator('#newClose').isVisible())await page.locator('#newClose').click();
 const boot=await page.locator('.screen.active').getAttribute('id');console.log('BOOT',boot);
 await page.evaluate(()=>document.getElementById('toolAnalyze').click());await page.locator('#anRun').click();
 await page.waitForTimeout(1000);console.log('AN STATUS',await page.locator('#anStatus').innerText());await page.screenshot({path:out('enca-beta-analysis.png')});await page.waitForFunction(()=>document.getElementById('anResults').style.display!=='none',null,{timeout:15000});
 const analyze=await page.locator('#anResults').innerText();
 await page.evaluate(()=>document.getElementById('toolWhoIs').click()); await page.locator('.screen.active [data-tabgo="whois:group"]').click();
 const opts=await page.locator('#wvPicker option').evaluateAll(x=>x.map(o=>({value:o.value,label:o.textContent})));
 if(opts.length>1){await page.locator('#wvPicker').selectOption(opts[1].value);await page.locator('#wvRun').click();await page.waitForFunction(()=>document.getElementById('wvCsv').style.display!=='none',{timeout:20000});}
 const wave=await page.locator('#wvBody').innerText();await page.screenshot({path:out('enca-beta-wave.png'),fullPage:false});
 await page.evaluate(()=>document.getElementById('toolExclusions').click());await page.locator('[data-exrun]').click();await page.waitForFunction(()=>document.getElementById('exHead').innerText.includes('Effectively')||document.getElementById('exHead').innerText.includes('exclusion'),{timeout:15000});
 await page.waitForFunction(()=>document.getElementById('exBody').querySelector('table')!==null);const exclusions=await page.locator('#exHead').innerText(); if(exclusions.includes('Failed:')) throw new Error(exclusions);
 const worker=await page.evaluate(async()=>{
  const old=Graph.ggetAll;const users=Array.from({length:10000},(_,i)=>({id:'u'+i,displayName:'User '+i,userType:'Member',accountEnabled:true}));
  const vms=Array.from({length:100},(_,i)=>({raw:{id:'p'+i,displayName:'P'+i,state:'enabled',conditions:{users:{includeUsers:['All']},applications:{includeApplications:['All']}},grantControls:{operator:'OR',builtInControls:['mfa']}},grant:{controls:['mfa'],op:'OR'}}));
  let a;Graph.ggetAll=async url=>url.startsWith('/users?')?users:[];try{a=await Analyzer.collect(vms,'all',()=>{});}finally{Graph.ggetAll=old;}
  let ticks=0;const timer=setInterval(()=>ticks++,16),start=performance.now();const r=await AnalysisJobs.run('analyze',{lookup:a.lookup,users:a.users,ctx:a.ctx});clearInterval(timer);return{users:r.length,policies:100,elapsedMs:Math.round(performance.now()-start),uiHeartbeatTicks:ticks};
 });
 const smoke=[];
 const ids = await page.locator('[id^="tool"]').evaluateAll(es=>es.filter(e=>e.tagName==='BUTTON'||e.classList.contains('tool-tile')).map(e=>e.id));
 for(const id of [...new Set(ids)]){
  await page.evaluate(id=>{document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open'));document.getElementById(id).click();},id);await page.waitForTimeout(40);
  smoke.push({id,screen:await page.locator('.screen.active').getAttribute('id')});
  const tabs=await page.locator('.screen.active [data-tabgo]').evaluateAll(es=>es.map(e=>e.dataset.tabgo));
  for(const tab of tabs){ await page.locator('.screen.active [data-tabgo="'+tab+'"]').click();smoke.push({tab,screen:await page.locator('.screen.active').getAttribute('id')}); }
 }
 const build=await page.evaluate(()=>APP_BUILD.build); const result={build,boot,analyze:analyze.slice(0,180),wave:wave.slice(0,240),exclusions:exclusions.slice(0,240),worker,smoke,errors};fs.writeFileSync(out('enca-beta-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
