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
   const hook=`window.hkAcceptance={seed(raws){policyResolve=id=>({service:'CAB-SEC-U-Persona-Microsoft365ServiceAccounts',shared:'CAB-SEC-U-TeamsSharedDevices',emergency:'CAB-SEC-U-BreakGlass',admins:'CAD-SEC-U-DG-GLO',persona:'CAB-SEC-U-Persona-Admins',deployment:'CAD-SEC-U-DG-ADM'})[id]||id;policies=raws.map((r,i)=>buildViewModel(r,(id,map)=>map?.[id]||id,i));refreshViews();},reverse(){policies.reverse();},invalidate(){policies.find(p=>p.id==='cleanup-old').raw.state='enabled';},selected(){return [...selected];},deleteActive(){selected=new Set(['cleanup-new']);openDeleteModal();}};\n`;
   return r.fulfill({contentType:'application/javascript',body:source.replace('  Graph.init().then((resumed) => {',hook+'  Graph.init().then((resumed) => {')});
  });
  await page.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('#screen-home.active');
  await page.evaluate(raws=>{document.querySelectorAll('.modal-bg.open').forEach(e=>e.classList.remove('open'));document.getElementById('toolPolicies').click();hkAcceptance.seed(raws);},fixtures);
  await page.locator('#hkBtn').click();assert.match(await page.locator('#hkDesc').innerText(),/1 need review, 1 cleanup candidates/);
  assert.equal(await page.locator('#hkList input:checked').count(),0);assert.equal(await page.locator('#hkGo').isDisabled(),true);
  assert.equal(await page.locator('[data-hk="review-old"]').isDisabled(),true);assert.match(await page.locator('#hkList').innerText(),/Report-only.*Newer version is not On.*Assignments/s);
  await page.screenshot({path:path.join(out,`housekeeping-${theme}-${width}.png`)});
  // Comparing a review-only row never selects it or changes another selection.
  await page.locator('[data-hk="cleanup-old"]').check();
  await page.locator('[data-hk-compare="review-old"]').click();await page.waitForSelector('#hkCompareModal.open');
  assert.match(await page.locator('#hkCompareBody').innerText(),/Removed:.*Persona-Admins/s);assert.match(await page.locator('#hkCompareBody').innerText(),/Added:.*DG-ADM/s);
  assert.equal(await page.locator('[data-hk-field="grantControls.operator"]').count(),0);
  await page.locator('#hkCompareOnly').uncheck();assert.equal(await page.locator('[data-hk-field="grantControls.operator"]').count(),1);
  await page.keyboard.press('Escape');await page.waitForSelector('#hkCompareModal.open',{state:'hidden'});
  assert.equal(await page.locator('[data-hk="cleanup-old"]').isChecked(),true);assert.equal(await page.locator('[data-hk="review-old"]').isChecked(),false);

  await page.locator('[data-hk="cleanup-old"]').check();await page.evaluate(()=>hkAcceptance.reverse());await page.locator('#hkGo').click();await page.waitForSelector('#delModal.open');
  assert.deepEqual(await page.evaluate(()=>hkAcceptance.selected()),['cleanup-old']);assert.equal(await page.locator('#delBackup').isChecked(),true);assert.equal(await page.locator('#delGo').isDisabled(),true);await page.locator('#delCancel').click();
  await page.locator('#hkBtn').click();await page.locator('[data-hk="cleanup-old"]').check();await page.evaluate(()=>hkAcceptance.invalidate());await page.locator('#hkGo').click();
  assert.equal(await page.locator('#hkModal').evaluate(e=>e.classList.contains('open')),true);assert.equal(await page.locator('#delModal').evaluate(e=>e.classList.contains('open')),false);assert.equal(await page.locator('[data-hk="cleanup-old"]').isDisabled(),true);
  await page.locator('#hkCancel').click();await page.evaluate(()=>hkAcceptance.deleteActive());assert.equal(await page.locator('#delAckOn').isVisible(),true);await page.locator('#delConfirm').fill('DELETE');assert.equal(await page.locator('#delGo').isDisabled(),true);await page.locator('#delAckOn').check();assert.equal(await page.locator('#delGo').isDisabled(),false);await page.locator('#delCancel').click();
  // Screenshot pair alone must still expose Housekeeping with no deletable items.
  await page.evaluate(raws=>hkAcceptance.seed(raws),fixtures.slice(0,2));assert.equal(await page.locator('#hkBtn').isVisible(),true);await page.locator('#hkBtn').click();assert.match(await page.locator('#hkDesc').innerText(),/1 need review, 0 cleanup candidates/);
  assert.equal(await page.locator('#hkGo').isDisabled(),true);
  // User's CA008 session-control example: extra exclusion and Linux platform.
  await page.locator('#hkCancel').click();
  const session=fixtures.slice(0,2).map((p,i)=>({...p,displayName:`CA008-SESSION-GLOBAL-DP-AllApps-${i?'WinOrMacOrLix':'WinOrMac'}-3H session lifetime for unmanaged devices v1.0.${i+2}`,state:i?'enabledForReportingButNotEnforced':'enabled',grantControls:null,conditions:{users:{includeGroups:['admins'],excludeGroups:i?['shared','emergency','service']:['shared','emergency']},platforms:{includePlatforms:i?['windows','macOS','linux']:['windows','macOS']}},sessionControls:{signInFrequency:{isEnabled:true,value:3,type:'hours'}}}));
  await page.evaluate(raws=>hkAcceptance.seed(raws),session);await page.locator('#hkBtn').click();await page.locator('[data-hk-compare="review-old"]').click();
  assert.match(await page.locator('[data-hk-field="conditions.users.excludeGroups"]').innerText(),/Added:.*Microsoft365ServiceAccounts/s);
  assert.match(await page.locator('[data-hk-field="conditions.platforms.includePlatforms"]').innerText(),/Added: linux/);
  assert.equal(await page.locator('#hkCompareBody tbody tr').count(),4);
  const sizing=await page.locator('#hkCompareModal .modal').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(sizing.scroll<=sizing.client+2);
  if(width<600){const scrolling=await page.locator('.hk-compare-scroll').evaluate(e=>{e.scrollLeft=150;return e.scrollLeft>0});assert.equal(scrolling,true);await page.locator('.hk-compare-scroll').evaluate(e=>e.scrollLeft=0);}
  await page.screenshot({path:path.join(out,`housekeeping-compare-${theme}-${width}.png`)});
  await page.locator('#hkCompareOnly').uncheck();assert.match(await page.locator('[data-hk-field="sessionControls.signInFrequency.value"]').innerText(),/3/);
  await page.locator('#hkCompareClose').click();assert.equal(await page.locator('#hkModal.open').count(),1);
  results.variants.push({theme,width,checks:['compare on review-only pair','added/removed named assignments','differences/all toggle','Escape preserves Housekeeping selection','CA008 added exclusion and Linux','unchanged 3-hour session setting','comparison fits viewport and scrolls on mobile','review-only screenshot pair visible','no automatic selection','disabled review row','status and assignment reasons','stable ID after reorder','backup and typed confirmation','stale eligibility blocked','On deletion acknowledgement']});results.build=await page.evaluate(()=>APP_BUILD.build);await page.close();
 }
 assert.deepEqual(results.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'housekeeping.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
