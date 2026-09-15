// Local fixture acceptance: no tenant access and no deletion is executed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.ENCA_EVIDENCE_DIR||'/private/tmp/enca-housekeeping';fs.mkdirSync(out,{recursive:true});
const results={variants:[],errors:[]};
const raw=(id,ca,ver,state,group='admins')=>({id,displayName:`(UP)CA${ca}-BLOCK-Admins-ASR-O365-AnyPlatform-Block access to Office 365 v${ver}`,state,conditions:{users:{includeGroups:[group],excludeUsers:['emergency']},applications:{includeApplications:['Office365']}},grantControls:{operator:'OR',builtInControls:['block']}});
const fixtures=[raw('review-old','110','1.0.1','enabledForReportingButNotEnforced','persona'),raw('review-new','110','1.0.2','disabled','deployment'),raw('cleanup-old','120','1.0.1','disabled'),raw('cleanup-new','120','1.0.2','enabled')];
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const [theme,width] of [['light',1440],['dark',390]]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>results.errors.push(e.message));
  await page.addInitScript(theme=>localStorage.setItem('enca-theme',theme),theme);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort());
  await page.route('**/js/app.js?*',r=>{
   const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
   const hook=`window.hkAcceptance={seed(raws){policies=raws.map((r,i)=>buildViewModel(r,(id,map)=>map?.[id]||id,i));refreshViews();},reverse(){policies.reverse();},invalidate(){policies.find(p=>p.id==='cleanup-old').raw.state='enabled';},selected(){return [...selected];},deleteActive(){selected=new Set(['cleanup-new']);openDeleteModal();}};\n`;
   return r.fulfill({contentType:'application/javascript',body:source.replace('  Graph.init().then((resumed) => {',hook+'  Graph.init().then((resumed) => {')});
  });
  await page.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('#screen-home.active');
  await page.evaluate(raws=>{document.querySelectorAll('.modal-bg.open').forEach(e=>e.classList.remove('open'));document.getElementById('toolPolicies').click();hkAcceptance.seed(raws);},fixtures);
  await page.locator('#hkBtn').click();assert.match(await page.locator('#hkDesc').innerText(),/1 need review, 1 cleanup candidates/);
  assert.equal(await page.locator('#hkList input:checked').count(),0);assert.equal(await page.locator('#hkGo').isDisabled(),true);
  assert.equal(await page.locator('[data-hk="review-old"]').isDisabled(),true);assert.match(await page.locator('#hkList').innerText(),/Report-only.*Newer version is not On.*Assignments/s);
  await page.screenshot({path:path.join(out,`housekeeping-${theme}-${width}.png`)});
  await page.locator('[data-hk="cleanup-old"]').check();await page.evaluate(()=>hkAcceptance.reverse());await page.locator('#hkGo').click();await page.waitForSelector('#delModal.open');
  assert.deepEqual(await page.evaluate(()=>hkAcceptance.selected()),['cleanup-old']);assert.equal(await page.locator('#delBackup').isChecked(),true);assert.equal(await page.locator('#delGo').isDisabled(),true);await page.locator('#delCancel').click();
  await page.locator('#hkBtn').click();await page.locator('[data-hk="cleanup-old"]').check();await page.evaluate(()=>hkAcceptance.invalidate());await page.locator('#hkGo').click();
  assert.equal(await page.locator('#hkModal').evaluate(e=>e.classList.contains('open')),true);assert.equal(await page.locator('#delModal').evaluate(e=>e.classList.contains('open')),false);assert.equal(await page.locator('[data-hk="cleanup-old"]').isDisabled(),true);
  await page.locator('#hkCancel').click();await page.evaluate(()=>hkAcceptance.deleteActive());assert.equal(await page.locator('#delAckOn').isVisible(),true);await page.locator('#delConfirm').fill('DELETE');assert.equal(await page.locator('#delGo').isDisabled(),true);await page.locator('#delAckOn').check();assert.equal(await page.locator('#delGo').isDisabled(),false);await page.locator('#delCancel').click();
  // Screenshot pair alone must still expose Housekeeping with no deletable items.
  await page.evaluate(raws=>hkAcceptance.seed(raws),fixtures.slice(0,2));assert.equal(await page.locator('#hkBtn').isVisible(),true);await page.locator('#hkBtn').click();assert.match(await page.locator('#hkDesc').innerText(),/1 need review, 0 cleanup candidates/);
  assert.equal(await page.locator('#hkGo').isDisabled(),true);
  results.variants.push({theme,width,checks:['review-only screenshot pair visible','no automatic selection','disabled review row','status and assignment reasons','stable ID after reorder','backup and typed confirmation','stale eligibility blocked','On deletion acknowledgement']});results.build=await page.evaluate(()=>APP_BUILD.build);await page.close();
 }
 assert.deepEqual(results.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'housekeeping.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
