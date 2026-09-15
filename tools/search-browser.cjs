// Offline fixture hooks are injected only into the browser response, never app.js on disk.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=process.env.ENCA_EVIDENCE_DIR||'/private/tmp/enca-25370-final';fs.mkdirSync(output,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});const results={errors:[],checks:[]};try{
 const p=await b.newPage({viewport:{width:390,height:1000}});p.setDefaultTimeout(8000);p.on('pageerror',e=>results.errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&r.request().method()==='GET'?r.continue():r.abort());
 await p.route('**/js/app.js?*',r=>{
  const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  const hooks=`window.searchAcceptance = { teams(){openTeamsDev();}, sweep(){ guTotals=[{id:'g1',name:'Acceptance Finance',total:0,entra:0,intune:0,m365:0,azure:0},{id:'g2',name:'Acceptance Legal',total:0,entra:0,intune:0,m365:0,azure:0}];guRes={rows:[],ran:[],failed:[],skipped:[]};renderGuSweep(); }, licence(){lgRes={p1:{gapUsers:[{name:'Acceptance Person',upn:'person@example.test'}]}};lgModalKey='p1';}, report(){showReport('Acceptance table','Acceptance', '| Name | Note |\\n| --- | --- |\\n| Finance \\\\| Legal | '+ 'LongName'.repeat(30)+' |\\n\\nAfter the table.');} };\n`;
  return r.fulfill({contentType:'application/javascript',body:source.replace('  Graph.init().then((resumed) => {',hooks+'  Graph.init().then((resumed) => {')});
 });
 await p.goto((process.env.ENCA_BASE_URL||'http://127.0.0.1:8769')+'/?demo=1',{waitUntil:'domcontentloaded'});await p.waitForSelector('#screen-home.active');
 await p.evaluate(()=>{document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open'));document.getElementById('toolGroupUse').click();searchAcceptance.sweep();});
 await p.locator('#guSweepSearch').focus();await p.waitForFunction(()=>document.getElementById('guSweepSearchList').options.length===2);
 await p.locator('#guSweepSearch').fill('Acceptance Finance');await p.waitForTimeout(180);
 assert.equal(await p.locator('#guSweepSearch').inputValue(),'Acceptance Finance');assert.equal(await p.locator('[data-gugroup]').count(),1);assert.equal(await p.locator('#guSweepSearchList option').count(),0);
 await p.locator('#guSweepSearch').fill('Acceptance ');await p.waitForTimeout(180);assert.equal(await p.locator('[data-gugroup]').count(),2);assert.equal(await p.locator('#guSweepSearchList option').count(),2);results.checks.push('Dynamic T19 selection survives rerender without reopening suggestions; editing restores matching options.');
 // A modal-only search field with a synthetic loaded licence result.
 await p.evaluate(()=>{searchAcceptance.licence();document.getElementById('lgUsersModal').classList.add('open')});
 await p.locator('#lgUserSearch').fill('person@');await p.waitForFunction(()=>document.getElementById('lgUserSearchList').options.length===1);assert.equal(await p.locator('#lgUserSearchList option').getAttribute('value'),'person@example.test');results.checks.push('Licence modal suggests the loaded UPN.');
 await p.evaluate(()=>{document.querySelectorAll('.modal-bg.open').forEach(x=>x.classList.remove('open'));searchAcceptance.report();});
 const report=await p.locator('#rptBody').evaluate(e=>{const t=e.querySelector('.md-table-scroll');const before=t.scrollLeft;t.scrollLeft=100;return{client:e.clientWidth,scroll:e.scrollWidth,tableScrollable:t.scrollLeft>before,cells:t.querySelectorAll('tbody td').length,text:e.innerText};});
 assert.ok(report.scroll<=report.client+2);assert.ok(report.tableScrollable);assert.equal(report.cells,2);assert.ok(report.text.includes('Finance | Legal'));results.report=report;
 await p.locator('.md-table-scroll').focus();assert.equal(await p.evaluate(()=>document.activeElement.className),'md-table-scroll');await p.screenshot({path:path.join(output,'report-mobile-25370.png')});results.checks.push('Report prose stays within mobile width, table scrolls, keyboard can focus it, literal pipe stays in one cell.');
 await p.locator('#rptClose').click();
 for(const kind of ['bypass','cis','teams']){
  await p.evaluate(kind=>{if(kind==='teams')searchAcceptance.teams();else document.getElementById('toolGapCheck').click();},kind);
  if(kind==='cis')await p.locator('.screen.active [data-tabgo="checks:cis"]').click();
  const run=kind==='bypass'?'[data-gcrun]':kind==='cis'?'[data-cirun]':'[data-tdrun]';
  if(await p.locator(run).count())await p.locator(run).click();await p.waitForTimeout(500);
  const md=kind==='bypass'?'#gcMd':kind==='cis'?'#ciMd':'#tdMd';await p.locator(md).click();await p.waitForSelector('#reportModal.open');
  const text=await p.locator('#rptBody').innerText();assert.ok(text.length>100);assert.ok(!text.includes('[object Object]'));
  results.checks.push(kind+' populated demo report rendered');await p.locator('#rptClose').click();
 }
 assert.deepEqual(results.errors,[]);
 }finally{await b.close();fs.writeFileSync(path.join(output,'search-browser.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
