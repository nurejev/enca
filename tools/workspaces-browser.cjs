// Browser acceptance for the beta Workspaces shell; all tenant traffic is blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ENCA_BASE_URL || 'http://127.0.0.1:8774';
const url=base+'/?demo=1';
const evidence=process.env.ENCA_EVIDENCE_DIR || path.join(__dirname,'../review/2026-09-21/workspaces');fs.mkdirSync(evidence,{recursive:true});
const build=Number(fs.readFileSync(path.join(__dirname,'../js/version.js'),'utf8').match(/build:\s*(\d+)/)[1]);
const report={date:new Date().toISOString(),baseBuild:build,errors:[],navigation:[],layouts:[],checks:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  async function pageFor(width,theme){
   const p=await browser.newPage({viewport:{width,height:1000},colorScheme:theme});p.setDefaultTimeout(12000);
   p.on('pageerror',e=>report.errors.push(e.message));
   await p.addInitScript(({theme,build})=>{localStorage.setItem('enca-theme',theme);localStorage.setItem('enca-seen-build-beta',String(build));},{theme,build});
   await p.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
   await p.goto(url);await p.waitForSelector('#wcHome');
   return p;
  }
  const p=await pageFor(1440,'light');
  assert.equal(await p.locator('#wcBrandName').innerText(),'ENCA');
  const homeTools=await p.locator('#wcOverviewTools [data-wc-tool]').count();
  assert.equal(homeTools,24);
  for(const id of ['toolDeploy','toolAudit','toolPermissions'])assert.equal(await p.locator('#wcOverviewTools [data-wc-tool="'+id+'"]').isVisible(),true);
  await p.locator('#wcToggleGroups').click();assert.equal(await p.locator('#wcOverviewTools details[open]').count(),0);
  await p.locator('#wcToggleGroups').click();assert.ok(await p.locator('#wcOverviewTools details[open]').count()>0);
  await p.locator('#wcOverviewTools [data-wc-tool="toolPermissions"]').click();assert.equal(await p.locator('#permOverview').isVisible(),true);
  await p.locator('#wcHomeButton').click();assert.equal(await p.locator('#permOverview').isVisible(),false);
  await p.locator('#acctBtn').click();assert.match(await p.locator('#themeBtn').innerText(),/Theme/);assert.match(await p.locator('#wcConnection').innerText(),/no app connection/);await p.keyboard.press('Escape');

  assert.equal(await p.locator('#logoHome #brandLogo').isVisible(),true);
  assert.equal(await p.locator('#toolNav [data-navhome]').isVisible(),true);
  assert.equal(await p.locator('#brandOrg').isVisible(),false);
  assert.equal(await p.locator('#betaRibbon').isVisible(),true);
  assert.equal(await p.locator('.wc-header-context').textContent(),'Conditional Access / Workspaces');
  assert.match(await p.locator('#wcAccountLabel').textContent(),/Contoso.*Demo/);
  // Use the visible new launcher to open every original destination.
  const ids=await p.locator('#sideNav [data-nav]').evaluateAll(els=>els.map(el=>el.dataset.nav));
  for(const id of ids){
   await p.locator('#wcHeaderTools').click();
   await p.locator('#wcLauncher [data-wc-tool="'+id+'"]').click();
   assert.equal(await p.locator('#wcLauncher').evaluate(el=>el.open),false);
   const active=await p.locator('#toolNav .toolnav-tab.active [data-nav]').getAttribute('data-nav');
   assert.equal(active,id);
   report.navigation.push({tool:id,screen:await p.locator('.screen.active').getAttribute('id')});
   // Import and help can open original app dialogs. Close without executing.
   await p.evaluate(()=>document.querySelectorAll('.modal-bg.open').forEach(el=>el.classList.remove('open')));
  }
  await p.locator('#wcRail [data-wc-tool="toolPolicies"]').click();
  assert.equal(await p.locator('#screen-list').isVisible(),true);
  await p.locator('#viewList').click();
  await p.locator('#searchBox').fill('CA200-GRANT');await p.locator('#searchBox').blur();
  assert.equal(await p.locator('#ptable .pname').count(),1);
  const name=await p.locator('#ptable .pname').textContent();assert.match(name,/CA200-GRANT-Internals/);
  await p.locator('#selAllTop').check();assert.equal(await p.locator('#selCount').textContent(),'1');
  await p.locator('#wcRail [data-wc-tool="toolSignins"]').click();
  await p.locator('#toolNav [data-nav="toolPolicies"]').click();
  assert.equal(await p.locator('#searchBox').inputValue(),'CA200-GRANT');assert.equal(await p.locator('#selCount').textContent(),'1');
  await p.locator('#ptable .pname').click();await p.locator('[data-inspector-detail]').click();
  await p.locator('#detailModal.open').waitFor();
  assert.ok((await p.locator('#detailBody .pcard-head h3').textContent()).includes(name));
  assert.equal(await p.locator('#workspaceInspector').isVisible(),true); // retained behind the wide modal for return
  assert.equal(await p.locator('#detailBody .sect').count(),6);
  assert.equal(await p.locator('#detailBody .wc-policy-definition').count(),1);
  const modal=await p.locator('#detailBody').boundingBox();
  const backdrop=await p.locator('#detailModal').boundingBox();
  assert.ok(modal.width>1100);assert.ok(Math.abs(modal.x+modal.width/2-(backdrop.x+backdrop.width/2))<2);
  await p.screenshot({path:path.join(evidence,'policy-details-1440-light.png')});
  await p.keyboard.press('Escape');await p.locator('#detailModal').waitFor({state:'hidden'});
  assert.equal(await p.locator('#searchBox').inputValue(),'CA200-GRANT');assert.equal(await p.locator('#selCount').textContent(),'1');
  await p.locator('#viewCards').click();assert.equal(await p.locator('#cardsView').isVisible(),true);
  await p.locator('#viewMatrix').click();assert.equal(await p.locator('#matrixView').isVisible(),true);
  await p.locator('#viewList').click();
  await p.locator('#selActState').click();assert.equal(await p.locator('#stateModal').isVisible(),true);assert.match(await p.locator('#stDesc').textContent(),/demo.*simulated/);await p.locator('#stCancel').click();
  await p.locator('#selActDoc').click();assert.equal(await p.locator('#exportModal').isVisible(),true);await p.locator('#expCancel').click();
  report.checks.push('Policies remains the real Cards/List/Matrix viewer, exact original name and detail, selected policy and search survive tab switching, existing documentation and state confirmation dialogs open.');
  await p.locator('#acctBtn').click();await p.locator('#wcCloseAll').click();
  assert.equal(await p.locator('#toolNav [data-close]').count(),0);
  assert.equal(await p.locator('#toolNav [data-navhome]').isVisible(),true);
  await p.locator('#wcRail [data-wc-tool="toolSignins"]').click();
  await p.locator('.screen.active [data-tabgo="signins:impact"]').click();
  await p.locator('#wcRail [data-wc-tool="toolPolicies"]').click();
  await p.locator('#toolNav [data-nav="toolSignins"]').click();
  assert.equal(await p.locator('.screen.active [data-tabgo].active').getAttribute('data-tabgo'),'signins:impact');
  await p.locator('#toolNav [data-close="toolPolicies"]').click();
  assert.equal(await p.locator('.screen.active [data-tabgo].active').getAttribute('data-tabgo'),'signins:impact');
  await p.locator('#wcHomeButton').click();assert.ok(await p.locator('#wcRecent [data-wc-tool]').count()>0);
  await p.locator('#wcRail [data-wc-library]').click();await p.locator('#wcSearch').fill('T01');assert.equal(await p.locator('#wcTools [data-wc-tool]').count(),1);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#wcLauncher').evaluate(el=>el.open),false);
  report.checks.push('Native subtabs retained, closing neighbouring tab works, recent tools populated, launcher search and Escape work.');
  const beforeTheme=await p.locator('html').getAttribute('data-theme');
  await p.locator('#acctBtn').click();await p.locator('#themeBtn').click();
  assert.notEqual(await p.locator('html').getAttribute('data-theme'),beforeTheme);
  assert.equal(await p.locator('#acctMenu').isVisible(),false);
  report.checks.push('Option 3 ENCA header, right-hand All tools and account, persistent Overview, account menu appearance and close-all controls.');
  await p.close();
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[736,'light'],[390,'dark'],[320,'light']]){
   const page=await pageFor(width,theme);
   for(const [name,id] of [['home',null],['policies','toolPolicies'],['signins','toolSignins'],['baseline','toolBaseline'],['groups','toolCaGroups']]){
    if(id){await page.locator('#wcRail [data-wc-library]').click();await page.locator('#wcLauncher [data-wc-tool="'+id+'"]').click();}
    const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(size.scroll<=size.viewport+2,`${name} at ${width} overflow ${JSON.stringify(size)}`);
    const chrome=await page.evaluate(()=>{
     const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     return {brand:box('logoHome'),tools:box('wcHeaderTools'),account:box('acctBtn')};
    });
    assert.ok(chrome.brand.right<=chrome.tools.left,`Brand and All tools overlap at ${width}`);
    if(width>600)assert.ok(chrome.tools.right<=chrome.account.left,`All tools and account overlap at ${width}`);
    else assert.ok(chrome.tools.bottom<=chrome.account.top,`Mobile account must be on second row at ${width}`);
    report.layouts.push({width,theme,page:name,...size});
    if(name==='policies'){
     const contrast=await page.locator('#toolNav .toolnav-tab.active').evaluate(el=>{
      const light=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(x=>{x=+x/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
      const a=light(getComputedStyle(el.querySelector('.toolnav-btn')).color),b=light(getComputedStyle(el).backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
     });
     assert.ok(contrast>=4.5,`Active tab contrast ${contrast} at ${width}/${theme}`);
    }
    if(['home','policies'].includes(name)){
     // Let the actual startup toast disappear before taking the design image.
     await page.locator('#toast').waitFor({state:'hidden',timeout:10000}).catch(()=>{});
     await page.screenshot({path:path.join(evidence,`${name}-${width}-${theme}.png`),fullPage:name==='home'});
    }
   }
   await page.locator('#wcRail [data-wc-library]').click();await page.locator('#wcSearch').fill('Policies');
   await page.locator('#wcLauncher [data-wc-tool="toolPolicies"]').click();assert.equal(await page.locator('#screen-list').isVisible(),true);
   await page.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(evidence,'shell-validation.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({errors:report.errors,toolDestinations:report.navigation.length,layouts:report.layouts.length,checks:report.checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
