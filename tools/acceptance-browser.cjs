// Local-only browser acceptance; never signs in or permits tenant requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const out=process.env.ENCA_ACCEPTANCE_OUTPUT || '/private/tmp/enca-browser-acceptance.json';
const base=process.env.ENCA_BASE_URL || 'http://127.0.0.1:8769';
const brand={org:'Acceptance fixture',colors:{'--green':'#30356d','--green-deep':'#171c40','--accent2':'#555ba3','--lemon':'#f4db83'},colorsLight:{'--green':'#30356d','--green-deep':'#171c40','--accent2':'#555ba3','--lemon':'#f4db83','--ink':'#181d40'},colorsDark:{'--green':'#777dcd','--green-deep':'#171c40','--accent2':'#aeb3ee','--lemon':'#f4db83','--ink':'#e7e9ff'}};
const results={localOnly:true,themes:[],workers:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 for(const custom of [false,true])for(const [theme,os] of [['light','light'],['dark','light'],['auto','light'],['auto','dark']])for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:os,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>results.errors.push(e.message));
  await page.addInitScript(({theme,brand})=>{localStorage.setItem('enca-theme',theme);if(brand)localStorage.setItem('enca-selfhost-brand',JSON.stringify({v:1,brand}));},{theme,brand:custom?brand:null});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','alcdn.msauth.net','alcdn.msftauth.net','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(u.hostname)&&route.request().method()==='GET'?route.continue():route.abort();});
  await page.goto(base+'/?demo=1',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#screen-home.active',{timeout:30000});
  await page.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open')));
  await page.evaluate(()=>document.getElementById('toolWhoIs').click());
  await page.locator('.screen.active [data-tabgo="whois:group"]').click();
  const option=await page.locator('#wvPicker option').nth(1).getAttribute('value');await page.locator('#wvPicker').selectOption(option);
  await page.waitForFunction(()=>document.getElementById('wvCsv').style.display!=='none');
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme||'auto',rail:getComputedStyle(document.getElementById('sideNav')).backgroundColor,ink:getComputedStyle(document.getElementById('sideNav')).color,animation:(()=>{const e=document.createElement('div');e.className='read-indeterminate';document.body.appendChild(e);const n=getComputedStyle(e).animationName;e.remove();return n;})()}));
  assert.equal(dimensions.animation,'none');
  assert.equal(dimensions.rail,custom?'rgb(23, 28, 64)':'rgb(18, 51, 31)');
  const cardFits=await page.locator('#wvBody .wo-who').evaluate(e=>e.scrollWidth<=e.clientWidth+2);assert.ok(cardFits,'Wave identity card clips content');
  // Record rather than silently accept page overflow; fail after all variants.
  dimensions.overflow=dimensions.scrollWidth>width+2;
  await page.locator('#themeBtn').focus();await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('html').getAttribute('data-theme'),dimensions.theme==='auto'?null:dimensions.theme);
  if(width===390){await page.locator('#workspaceMenu').click();assert.equal(await page.locator('#workspaceMenu').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#workspaceMenu').getAttribute('aria-expanded'),'false');}
  results.themes.push({brand:custom?'fixture':'default',theme,os,...dimensions});
  console.log('theme',custom,theme,os,width,dimensions.overflow?'OVERFLOW':'ok');
  if(custom&&theme==='dark'&&width===390)await page.screenshot({path:'/private/tmp/enca-acceptance-mobile.png'});
  await context.close();
 }
 const page=await browser.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','alcdn.msauth.net','alcdn.msftauth.net','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(u.hostname)&&route.request().method()==='GET'?route.continue():route.abort();});
 await page.goto(base+'/?demo=1',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#screen-home.active',{timeout:30000});
 await page.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open')));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 for(const [n,p] of [[50000,40],[250000,8]]){
  const r=await page.evaluate(async({n,p})=>{
   const old=Graph.ggetAll,users=Array.from({length:n},(_,i)=>({id:'u'+i,displayName:'User '+i,userType:'Member',accountEnabled:true}));
   const vms=Array.from({length:p},(_,i)=>({raw:{id:'p'+i,displayName:'P'+i,state:'enabled',conditions:{users:{includeUsers:['All']},applications:{includeApplications:['All']}},grantControls:{builtInControls:['mfa'],operator:'OR'}},grant:{controls:['mfa'],op:'OR'}}));
   let a;Graph.ggetAll=async url=>url.startsWith('/users?')?users:[];try{a=await Analyzer.collect(vms,'all',()=>{});}finally{Graph.ggetAll=old;}
   const longTasks=[];const observer=new PerformanceObserver(es=>es.getEntries().forEach(e=>longTasks.push(Math.round(e.duration))));observer.observe({type:'longtask'});
   let ticks=0;const timer=setInterval(()=>ticks++,16),start=performance.now();
   const result=await AnalysisJobs.run('analyze',{lookup:a.lookup,users:a.users,ctx:a.ctx});const ms=performance.now()-start;
   await new Promise(r=>setTimeout(r,100));clearInterval(timer);observer.disconnect();
   return {n,p,rows:result.length,elapsedMs:Math.round(ms),ticks,longTasks,maxLongTaskMs:Math.max(0,...longTasks)};
  },{n,p});assert.equal(r.rows,n);assert.ok(r.ticks>0);r.heapUsedBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize;results.workers.push(r);console.log('worker',JSON.stringify(r));await cdp.send('HeapProfiler.collectGarbage');
 }
 results.cancellation=await page.evaluate(async()=>{const controller=new AbortController(),records=Array.from({length:100000},(_,i)=>({id:'s'+i,appliedConditionalAccessPolicies:[]}));const run=AnalysisJobs.run('impact',{records,policies:[]},{signal:controller.signal});const start=performance.now();controller.abort();try{await run;return{stopped:false};}catch(e){return{stopped:!!e.stopped,latencyMs:Math.round(performance.now()-start)};}});
 assert.equal(results.cancellation.stopped,true);assert.ok(results.cancellation.latencyMs<250);
 results.build=await page.evaluate(()=>APP_BUILD.build);
 assert.equal(results.errors.length,0);
 } finally {await browser.close();fs.writeFileSync(out,JSON.stringify(results,null,2));}
 if(results.themes.some(x=>x.overflow))throw Error('Page overflow found; see evidence');
})().catch(e=>{console.error(e);process.exitCode=1;});
