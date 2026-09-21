// Signed-out UI and a simulated Graph session. No Entra login or tenant writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ENCA_BASE_URL || 'http://127.0.0.1:8774';
const out=process.env.ENCA_EVIDENCE_DIR || path.join(__dirname,'../review/2026-09-21/workspaces');fs.mkdirSync(out,{recursive:true});
const build=Number(fs.readFileSync(path.join(__dirname,'../js/version.js'),'utf8').match(/build:\s*(\d+)/)[1]);
const report={baseBuild:build,date:new Date().toISOString(),errors:[],checks:[],liveTenant:false};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(10000);
  p.on('pageerror',e=>report.errors.push(e.message));
  await p.addInitScript(build=>localStorage.setItem('enca-seen-build-beta',String(build)),build);
  await p.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
  await p.goto(base+'/');await p.locator('#screen-login.active').waitFor();
  assert.equal(new URL(p.url()).searchParams.has('demo'),false);
  assert.equal(await p.locator('#wcRail').isVisible(),false);assert.equal(await p.locator('#wcHeaderTools').isVisible(),false);
  assert.equal(await p.locator('#themeBtn').isVisible(),true);assert.equal(await p.locator('#loginConn').isVisible(),true);
  await p.screenshot({path:path.join(out,'signed-out-1440.png')});
  report.checks.push('Plain beta URL keeps the original sign-in and connection controls; no forced demo or workspace navigation.');
  // Exercise the actual loadFromGraph path with transport/auth replaced by a
  // fixture. This validates UI lifecycle, never live identity or permissions.
  const graph=fs.readFileSync(path.join(__dirname,'../js/graph.js'),'utf8');
  await p.route('**/js/graph.js*',r=>r.fulfill({contentType:'application/javascript',body:graph+`
    Graph.init=async()=>true;
    Graph.loadTenant=async()=>({policies:structuredClone(DEMO_DATA.policies),org:{displayName:'Same-name tenant',verifiedDomains:[]},logo:null,resolve:(id,map)=>map?.[id]||DEMO_DATA.names[id]||id,account:{tenantId:window.fixtureTenant||'fixture-a',username:'admin@example.test',name:'Fixture Admin'}});
    Graph.grantedScopes=async()=>['Policy.Read.All','Directory.Read.All'];
    Graph.signOut=()=>{};
  `}));
  await p.reload();await p.locator('#wcHome').waitFor();
  assert.equal(await p.locator('#wcAccountLabel').textContent(),'Same-name tenant');
  assert.equal(await p.locator('#wcEnvironment').textContent(),'Tenant · policy snapshot');
  assert.equal(await p.locator('#permOverview').isVisible(),true);
  assert.match(await p.title(),/SELF-HOSTED|BETA/);
  await p.locator('#wcRail [data-wc-tool="toolSignins"]').click();
  await p.locator('#wcRail [data-wc-tool="toolPolicies"]').click();
  await p.locator('#wcHomeButton').click();assert.equal(await p.locator('#wcRecent [data-wc-tool]').count(),2);
  await p.locator('#wcRail [data-wc-tool="toolPolicies"]').click();
  await p.evaluate(()=>window.fixtureTenant='fixture-b');await p.locator('#refreshBtn').click();
  await p.waitForFunction(()=>Workspace.context.key==='fixture-b');
  await p.locator('#wcHomeButton').click();
  assert.equal(await p.locator('#wcRecent [data-wc-tool="toolSignins"]').count(),0);
  report.checks.push('Simulated Graph session has truthful non-demo labels, visible permissions and beta identity; changing tenant ID resets recent tools even with an identical tenant name.');
  await p.locator('#acctBtn').click();await p.locator('#signOutBtn').click();
  await p.locator('#screen-login.active').waitFor();
  assert.equal(await p.locator('#wcRail').isVisible(),false);assert.equal(await p.locator('#wcHeaderTools').isVisible(),false);
  assert.equal(await p.locator('#toolNav').isVisible(),false);assert.equal(await p.locator('#themeBtn').isVisible(),true);
  assert.equal(await p.locator('#wcRecent .wc-recent').count(),0);
  await p.unroute('**/js/graph.js*');await p.locator('#screen-login a[href="?demo=1"]').click();
  await p.locator('#wcHome').waitFor();
  assert.match(await p.locator('#wcAccountLabel').textContent(),/Contoso.*Demo/);
  assert.equal(await p.locator('#wcEnvironment').textContent(),'Demo · sample data');
  report.checks.push('Sign-out hides all workspace navigation, clears recent tools and restores theme control; entering demo uses sample labels again.');
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'session-validation.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
