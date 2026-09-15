// Exact policy-name acceptance; local fixtures only, external traffic blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.ENCA_EVIDENCE_DIR||'/private/tmp/enca-policy-names';fs.mkdirSync(out,{recursive:true});
const names=['CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.2','CA003-GRANT-Global-BP-RegisterOrJoin-AnyPlatform-MFA-v1.0.0','(UP)CA004-BLOCK-Global-IP-AnyApp-AnyPlatform-DeviceCode-v1.0.2','(NEW)CA008-SESSION-GLOBAL-DP-AllApps-WinOrMacOrLix-3H session lifetime for unmanaged devices v1.0.3','Custom policy — Finance & Legal <review>'];
const fixtures=names.map((displayName,i)=>({id:'name-'+i,displayName,state:'disabled',conditions:{users:{includeUsers:['All']},applications:{includeApplications:['All']}},grantControls:{operator:'OR',builtInControls:['mfa']}}));
const result={variants:[],errors:[]};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const [theme,width] of [['light',1440],['dark',390]]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(theme=>localStorage.setItem('enca-theme',theme),theme);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort());
  await page.route('**/js/app.js?*',r=>{const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');const hook='window.seedPolicyNames=raws=>{policies=raws.map((r,i)=>buildViewModel(r,(id,map)=>map?.[id]||id,i));refreshViews();};\n';return r.fulfill({contentType:'application/javascript',body:source.replace('  Graph.init().then((resumed) => {',hook+'  Graph.init().then((resumed) => {')});});
  await page.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('#screen-home.active');
  await page.evaluate(raws=>{document.querySelectorAll('.modal-bg.open').forEach(e=>e.classList.remove('open'));document.getElementById('toolPolicies').click();seedPolicyNames(raws);},fixtures);
  const titles=await page.locator('#ptable .pname').allTextContents();assert.deepEqual(titles,names);assert.equal(await page.locator('#ptable .workspace-native').count(),0);
  for(let i=0;i<names.length;i++){
   await page.locator(`#ptable [data-open="name-${i}"]`).click();assert.equal(await page.locator('#workspaceInspector h2').textContent(),names[i]);assert.equal(await page.locator('#workspaceInspector .workspace-native').count(),0);
   await page.locator('[data-inspector-detail]').click();assert.ok((await page.locator('#detailBody h3').textContent()).endsWith(names[i]));await page.keyboard.press('Escape');
   await page.locator('[data-inspector-close]').click();
  }
  await page.locator('#searchBox').fill('CA003-GRANT');assert.deepEqual(await page.locator('#ptable .pname').allTextContents(),[names[1]]);await page.locator('#searchBox').fill('');
  await page.locator('#searchBox').blur();
  if(width<600)await page.locator('#ptable').evaluate(e=>e.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(out,`policy-names-${theme}-${width}.png`)});
  await page.locator('#viewCards').click();assert.deepEqual(await page.locator('#cardsView .scard-title h3').allTextContents(),names);
  await page.locator('#viewMatrix').click();for(const name of names)assert.ok((await page.locator('#matrixView thead').innerText()).includes(name));
  await page.locator('#viewList').click();await page.locator('#selAllTop').check();await page.locator('#workspaceHeading [data-workspace-tool="deploy"]').click();assert.deepEqual(await page.locator('.rollout-selection>div>b').allTextContents(),names);assert.equal(await page.locator('.rollout-selection small').count(),0);
  const sizes=await page.locator('.rollout-selection').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(sizes.scroll<=sizes.client+2);
  result.variants.push({theme,width,policies:names.length,checks:['list exact titles','no duplicate subtitle','inspector exact titles','full policy exact names','full-name search','cards and matrix unchanged','rollout exact names and wrapping']});result.build=await page.evaluate(()=>APP_BUILD.build);await page.close();
 }
 assert.deepEqual(result.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'policy-names.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
