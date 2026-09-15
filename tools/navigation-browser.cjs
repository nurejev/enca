// Local demo navigation regression: all external requests are blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.ENCA_EVIDENCE_DIR||'/private/tmp/enca-navigation';fs.mkdirSync(out,{recursive:true});
const hosts={toolSignins:'signins',toolAudit:'changes',toolAnalyze:'gap',toolWhoIs:'whois',toolWhatIf:'whatif',toolGapCheck:'checks',toolLocations:'blocks',toolBaseline:'baseline'};
const results={variants:[],errors:[]};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const [theme,width] of [['light',1440],['dark',390]]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>results.errors.push(e.message));
  await page.addInitScript(theme=>localStorage.setItem('enca-theme',theme),theme);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort());
  await page.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('#screen-home.active');
  await page.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(e=>e.classList.remove('open')));
  const click=selector=>page.locator(selector).evaluate(e=>e.click());
  const verify=async(id,tab)=>{
   assert.equal(await page.locator('.toolnav-tab.active [data-nav]').getAttribute('data-nav'),id);
   assert.equal(await page.locator('.screen.active [data-tabgo].active').getAttribute('data-tabgo'),tab);
  };
  const checked=[];
  for(const [id,host] of Object.entries(hosts)){
   await click('#'+id);
   const tabs=await page.locator('.screen.active [data-tabgo]').evaluateAll(es=>es.map(e=>e.dataset.tabgo));
   for(const tab of tabs){
    await click('.screen.active [data-tabgo="'+tab+'"]');
    const screen=await page.locator('.screen.active').getAttribute('id');
    await click('#toolUserImpact');await click('#toolNav [data-nav="'+id+'"]');await verify(id,tab);
    assert.equal(await page.locator('.screen.active').getAttribute('id'),screen);
    await click('#toolUserImpact');await click('#side-'+id);await verify(id,tab);
    checked.push(tab);console.log(theme,width,tab,'resumed');
   }
  }
  // In-flight T26 job: pause only the local analysis, preserving actual run wiring.
  await click('#toolSignins');await click('.screen.active [data-tabgo="signins:impact"]');
  await page.locator('#riDays').selectOption('30');await click('#riToolbar [data-logsrc="entraall"]');
  await page.waitForFunction(()=>document.getElementById('riRescan').style.display!=='none');
  await page.evaluate(()=>{const run=AnalysisJobs.run;window.navJobCount=0;AnalysisJobs.run=async function(kind,...args){if(kind==='impact'){window.navJobCount++;await new Promise(resolve=>window.finishNavJob=resolve);}return run.call(this,kind,...args);};});
  await click('#riRescan');await page.waitForFunction(()=>!!window.finishNavJob);
  await click('#toolGapCheck');await click('#toolNav [data-nav="toolSignins"]');await verify('toolSignins','signins:impact');
  assert.ok(await page.locator('#riBody [data-pgstop="ri"]').count());assert.equal(await page.evaluate(()=>window.navJobCount),1);
  assert.equal(await page.locator('#riDays').inputValue(),'30');assert.equal(await page.locator('#riToolbar [data-logsrc].active').getAttribute('data-logsrc'),'entraall');
  await page.evaluate(()=>window.finishNavJob());await page.waitForFunction(()=>document.getElementById('riRescan').style.display!=='none');
  await click('#riViewSeg [data-riview="users"]');await page.locator('#riSearch').fill('Eva');
  const before=await page.locator('#riBody').innerText();await page.locator('#riSearch').blur();
  await click('#toolGapCheck');await click('#toolNav [data-nav="toolSignins"]');await verify('toolSignins','signins:impact');
  assert.equal(await page.locator('#riSearch').inputValue(),'Eva');assert.equal(await page.locator('#riViewSeg .active').getAttribute('data-riview'),'users');assert.equal(await page.locator('#riBody').innerText(),before);assert.equal(await page.evaluate(()=>window.navJobCount),1);
  // + menu resumes an existing tab; closing a neighbour does the same.
  await click('#toolNav [data-navadd]');await click('#toolAddMenu [data-nav="toolSignins"]');await verify('toolSignins','signins:impact');
  await click('#toolNav [data-navcloseall]');await click('#toolSignins');await click('.screen.active [data-tabgo="signins:impact"]');await click('#toolGapCheck');await click('#toolNav [data-close="toolGapCheck"]');await verify('toolSignins','signins:impact');
  // Browser history selects the historical subtab, not the host's newest one.
  await click('.screen.active [data-tabgo="signins:failures"]');await click('#toolGapCheck');
  await page.goBack();await verify('toolSignins','signins:failures');await page.goBack();await verify('toolSignins','signins:impact');
  await page.goForward();await verify('toolSignins','signins:failures');await page.goForward();await verify('toolGapCheck','checks:bypass');
  // Policies and coverage share screen-list: history must preserve which tool.
  await click('#toolPolicies');await click('#toolAnalyze');await page.goBack();assert.equal(await page.locator('.toolnav-tab.active [data-nav]').getAttribute('data-nav'),'toolPolicies');assert.equal(await page.locator('#analyzeView').isVisible(),false);
  await page.goForward();await verify('toolAnalyze','gap:coverage');assert.equal(await page.locator('#analyzeView').isVisible(),true);
  // An explicit tool open may intentionally select its default. A closed tab
  // starts fresh; it does not resurrect the previous tab's remembered route.
  await click('#toolSignins');await verify('toolSignins','signins:failures');await click('.screen.active [data-tabgo="signins:impact"]');await click('#toolNav [data-close="toolSignins"]');await click('#side-toolSignins');await verify('toolSignins','signins:failures');
  results.variants.push({theme,width,subtabs:checked,checks:['top tabs','sidebar','add menu','neighbour close','in-flight T26 without restart','T26 source/window/view/search/result retained','Back/Forward with active tab','Policies/Coverage history','explicit default and closed tab reset']});
  await click('.screen.active [data-tabgo="signins:impact"]');await page.screenshot({path:path.join(out,'navigation-'+theme+'-'+width+'.png')});results.build=await page.evaluate(()=>APP_BUILD.build);await page.close();
 }
 assert.deepEqual(results.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'navigation.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
