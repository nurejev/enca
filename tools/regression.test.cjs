// No credentials, external packages or network. Run: node --test tools/*.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(file,symbol,extras={}){
  const box={console:{log(){},warn(){},error(){}},Set,Map,URL,...extras};vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8')+'\n;globalThis.result='+symbol,box);return box.result;
}
const CaScope=load('cascope.js','CaScope');
const WhatIf=load('whatifeval.js','WhatIfEval',{CaScope});
const policy=(conditions={})=>({id:'p1',displayName:'Test policy',state:'enabled',conditions:{users:{includeUsers:['All']},applications:{includeApplications:['All']},...conditions},grantControls:{operator:'OR',builtInControls:['block']}});
const scenario={userId:'u1',appId:'app1',platform:'windows',clientApp:'browser',deviceState:'compliant',insiderRisk:'minor',isGuest:false};
const asVm=p=>({raw:p,seq:1,grant:{controls:p.grantControls.builtInControls||[],op:p.grantControls.operator}});
const maps=()=>({ph:{},group:{},loc:{},strength:{},ctx:{},tou:{},personaGroupIds:{}});
test('SMS/voice scan retains verdicts and registered methods without migration controls',()=>{
 const api=load('smsvoice.js','SmsVoice');
 const reg={phone:{methods:['mobilePhone'],defaultMethod:'sms'},mixed:{methods:['mobilePhone','microsoftAuthenticatorPush'],defaultMethod:'push'},ready:{methods:['passKeyDeviceBound'],defaultMethod:'passKeyDeviceBound'},clean:{methods:[]}};
 const result=api.analyze({campaignState:'default',sms:{state:'enabled'},voice:{state:'disabled'},users:Object.keys(reg).map(id=>({id,upn:id+'@example.com',enabled:true,inSms:true})),reg});
 assert.deepEqual(Object.fromEntries(result.rows.map(r=>[r.id,r.risk])),{phone:'blocking',mixed:'migrate',clean:'clean',ready:'ready'});
 assert.equal(result.summary.total,4);assert.equal(result.summary.phone,2);
 const md=api.toMd(result),csv=api.toCsv(result);
 assert.match(md,/Methods registered/);assert.match(md,/Authenticator push \(default\); Phone \(mobile\)/);
 assert.match(csv,/methodsRegistered,methodsRegisteredLabels/);assert.equal(csv.split('\n').length,5);
 assert.match(csv,/mobilePhone; microsoftAuthenticatorPush/);
 assert.doesNotMatch(md,/passkeyDynamicMigration|temporary opt-out|pause the rollout/i);
 assert.deepEqual(Array.from(api.notifyEmail(result).recipients),['mixed@example.com','phone@example.com']);
});
test('SMS/voice scope-only scan keeps unread registration distinct from no methods',()=>{
 const api=load('smsvoice.js','SmsVoice');
 const result=api.analyze({sms:{state:'enabled'},users:[{id:'u1',upn:'u1@example.com',enabled:true}],reg:null});
 assert.equal(result.rows[0].risk,'unknown');assert.equal(api.methodsWord(result.rows[0]),'?');
 assert.match(api.toMd(result),/registration data NOT read/);assert.equal(api.notifyEmail(result).scopeOnly,true);
});
function importer(overrides={}){
  const writes=[],store=new Map([['old-p',{...policy(),id:'old-p'}]]);
  const Graph={
    async gpost(url,body){writes.push(['POST',url,structuredClone(body)]);store.set('new-p',{...structuredClone(body),id:'new-p'});return {id:'new-p'};},
    async gpatch(url,body){writes.push(['PATCH',url,structuredClone(body)]);Object.assign(store.get(url.split('/').at(-1)),body);},
    async gget(url){return structuredClone(store.get(url.split('/').at(-1)));},...overrides};
  return {api:load('import.js','Importer',{AUTH_CONFIG:{scopes:[]},Graph}),writes,store};
}
const item=(raw=policy())=>({name:raw.displayName,raw,upgrade:true,existing:{id:'old-p',name:'Previous',raw:policy()}});
test('insider risk string and array both exclude unmatched levels',()=>{
 for(const insiderRiskLevels of ['elevated',['elevated'],'moderate,elevated']){const r=WhatIf.evaluate([policy({insiderRiskLevels})],scenario);assert.equal(r.blocked,false);assert.equal(r.notApplied[0].why,'risk');}
 assert.equal(WhatIf.evaluate([policy({insiderRiskLevels:'minor'})],scenario).blocked,true);
});
test('unsupported risk enum cannot produce a definite grant or block',()=>{const r=WhatIf.evaluate([policy({insiderRiskLevels:'unknownFutureValue'})],scenario);assert.equal(r.complete,false);assert.equal(r.blocked,false);});
test('compound and trailing device predicates stay indeterminate',()=>{
 for(const rule of ['device.isCompliant -eq True -and device.trustType -eq "ServerAD"','device.isCompliant -eq True -or device.isCompliant -eq False','device.isCompliant -eq True garbage']){
  const r=WhatIf.evaluate([policy({devices:{deviceFilter:{mode:'exclude',rule}}})],scenario);assert.equal(r.blocked,false);assert.equal(r.complete,false);assert.equal(r.indeterminate.length,1);
 }
});
test('compliance and trust are independent; exact simple predicates work',()=>{
 assert.equal(WhatIf.deviceFilterVerdict('device.trustType -eq "ServerAD"',scenario).known,false);
 assert.equal(WhatIf.deviceFilterVerdict('device.isCompliant -eq True',{deviceState:'hybrid'}).known,false);
 assert.equal(WhatIf.deviceFilterVerdict('device.trustType -eq "ServerAD"',{...scenario,trustType:'ServerAD'}).match,true);
 assert.equal(WhatIf.deviceFilterVerdict('device.isCompliant -eq False',{isCompliant:false}).match,true);
});
test('legacy guest token agrees between shared scope and What-If',()=>{const p=policy({users:{includeUsers:['GuestsOrExternalUsers']}});assert.equal(CaScope.of(p,{id:'u1',guest:true}).applies,true);assert.equal(WhatIf.evaluate([p],{...scenario,isGuest:true}).blocked,true);});
test('restricted external type and tenant must both match',()=>{
 const p=policy({users:{includeGuestsOrExternalUsers:{guestOrExternalUserTypes:'serviceProvider',externalTenants:{membershipKind:'enumerated',members:['partner-a']}}}});
 assert.equal(CaScope.of(p,{id:'u1',guest:true,guestOrExternalUserType:'b2bCollaborationGuest',homeTenantId:'partner-a'}).applies,false);
 assert.equal(CaScope.of(p,{id:'u1',guest:true,guestOrExternalUserType:'serviceProvider',homeTenantId:'partner-b'}).applies,false);
 assert.equal(CaScope.of(p,{id:'u1',guest:true,guestOrExternalUserType:'serviceProvider',homeTenantId:'partner-a'}).applies,true);
 assert.equal(CaScope.of(p,{id:'u1',guest:true}).state,'unknown');
});
test('unknown exclusion membership never confirms inclusion',()=>{assert.equal(CaScope.of(policy({users:{includeUsers:['All'],excludeGroups:['g1']}}),{id:'u1',groupsComplete:false}).state,'unknown');});
test('OR alternatives do not establish mandatory MFA',()=>{
 for(const operator of ['OR','AND'])assert.equal(CaScope.requiresMfa({operator,builtInControls:['mfa','compliantDevice']}),operator==='AND');
 assert.equal(CaScope.requiresMfa({operator:'OR',builtInControls:['mfa']}),true);
 assert.equal(CaScope.requiresMfa({operator:'OR',builtInControls:['mfa'],termsOfUse:['t1']}),false);
 assert.equal(CaScope.requiresMfa({authenticationStrength:{id:'custom',displayName:'MFA'}}),false);
 assert.equal(CaScope.requiresMfa({authenticationStrength:{id:'00000000-0000-0000-0000-000000000004'}}),true);
});
const CaCoverage=load('coverage.js','CaCoverage',{CaScope});
function analyzer(Graph){return load('analyze.js','Analyzer',{CaScope,CaCoverage,Graph});}
const users=[{id:'u1',displayName:'Review user',userType:'Member',accountEnabled:true}];
test('unread exclusion group aborts coverage instead of showing safe',async()=>{
 const a=analyzer({ggetAll:async url=>{if(url.startsWith('/groups/'))throw Error('403');return url.startsWith('/users?')?users:[];},gpost:async()=>({value:[]})});
 await assert.rejects(a.collect([asVm(policy({users:{includeUsers:['All'],excludeGroups:['g1']}}))],'all',()=>{}),/Analysis incomplete.*g1/);
});
test('unread role members abort coverage',async()=>{
 const a=analyzer({ggetAll:async url=>{if(url.startsWith('/users?'))return users;if(url.startsWith('/directoryRoles?'))return[{id:'role1',roleTemplateId:'template1'}];if(url.includes('/members'))throw Error('403');return[];},gpost:async()=>({value:[]})});
 await assert.rejects(a.collect([asVm(policy({users:{includeUsers:['All'],excludeRoles:['template1']}}))],'all',()=>{}),/Analysis incomplete.*role membership/);
});
test('analyzer reports OR MFA optional, AND MFA mandatory',async()=>{
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?users:[],gpost:async()=>({value:[]})});
 for(const operator of ['OR','AND']){
  const p=policy();p.grantControls={operator,builtInControls:['mfa','compliantDevice']};const c=await a.collect([asVm(p)],'all',()=>{});const r=a.evaluate(c.lookup,c.users,c.ctx);assert.equal(r[0].mfaTargeted,operator==='AND');
 }
});
test('replacement with unresolved break-glass exclusion makes no writes',async()=>{
 const {api,writes}=importer();const p=policy({users:{includeUsers:['All'],excludeGroups:['{{group:BreakGlass}}']}});
 const r=await api.importPolicies([item(p)],maps(),()=>{},{mode:'replace'});assert.equal(r.results[0].ok,false);assert.equal(writes.length,0);
});
test('new import with source user exclusions fails before writes',async()=>{
 const {api,writes}=importer();const raw=policy({users:{includeUsers:['All'],excludeUsers:['source-user']}});
 const r=await api.importPolicies([{name:'New',raw}],maps(),()=>{});assert.equal(r.results[0].ok,false);assert.equal(writes.length,0);
});
test('missing application reference never gets dropped or retried',async()=>{
 const {api,writes}=importer();const app='11111111-1111-1111-1111-111111111111';const raw=policy({applications:{includeApplications:['All'],excludeApplications:[app]}});
 const r=await api.importPolicies([item(raw)],{...maps(),missingApps:new Set([app])},()=>{},{mode:'replace'});assert.equal(r.results[0].ok,false);assert.equal(writes.length,0);
});
test('replacement stages Off, verifies, restores state, then disables old',async()=>{
 const {api,writes}=importer();const r=await api.importPolicies([item()],maps(),()=>{},{mode:'replace'});
 assert.equal(r.results[0].ok,true);assert.equal(r.results[0].state,'enabled');assert.equal(r.results[0].verified,true);
 assert.deepEqual(writes.map(x=>[x[0],x[1].split('/').at(-1),x[2].state]),[['POST','policies','disabled'],['PATCH','new-p','enabled'],['PATCH','old-p','disabled']]);
});
test('failed readback never disables previous policy',async()=>{
 const {api,writes}=importer({gget:async()=>{throw Error('403 readback');}});const r=await api.importPolicies([item()],maps(),()=>{},{mode:'replace'});assert.equal(r.results[0].ok,false);assert.match(r.results[0].error,/new-p/);assert.equal(writes.length,1);
});
test('material readback mismatch prevents activation and old disable',async()=>{
 const {api,writes}=importer({gget:async()=>({...policy(),state:'disabled',displayName:'Different'})});const r=await api.importPolicies([item()],maps(),()=>{},{mode:'replace'});assert.equal(r.results[0].ok,false);assert.equal(writes.length,1);
});
test('partial replacement is not reported as successful',async()=>{
 const f=importer({gpatch:async(url,body)=>{if(url.endsWith('old-p'))throw Error('403');Object.assign(f.store.get('new-p'),body);}});
 const r=await f.api.importPolicies([item()],maps(),()=>{},{mode:'replace'});
 assert.equal(r.results[0].ok,false);assert.equal(r.results[0].verified,true);assert.equal(r.results[0].createdId,'new-p');assert.equal(r.results[0].state,'enabled');assert.match(r.results[0].error,/previous policy old-p/);
});
async function batchFixture(response,opts={}){
 const endpoints=[],token='x.'+Buffer.from(JSON.stringify({scp:'Policy.Read.All Directory.Read.All'})).toString('base64url')+'.x';
 class Msal{async initialize(){} async handleRedirectPromise(){return null;} async acquireTokenSilent(){return{accessToken:token};}}
 const Graph=load('graph.js','Graph',{AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:['Policy.Read.All'],graphBase:'https://graph.microsoft.com/beta'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},atob:s=>Buffer.from(s,'base64').toString(),setTimeout:fn=>{fn();return 0;},fetch:async(url,options)=>{endpoints.push(url);const requests=JSON.parse(options.body).requests;return{ok:true,status:200,headers:{get:()=>null},json:async()=>({responses:requests.map(r=>response(r,endpoints.length))})};}});
 await Graph.init();const result=await Graph.gbatch([{id:'1',url:'/groups/g1'}],null,{base:'https://graph.microsoft.com/v1.0',...opts});return{result,endpoints};
}
test('batch throttling is bounded and preserves explicit API version',async()=>{const{result,endpoints}=await batchFixture(r=>({id:r.id,status:429,headers:{'Retry-After':'0'}}));assert.equal(endpoints.length,4);assert.ok(endpoints.every(u=>u==='https://graph.microsoft.com/v1.0/$batch'));assert.equal(result['1'].status,429);});
test('batch recovers a transient failure without switching API version',async()=>{const{result,endpoints}=await batchFixture((r,n)=>({id:r.id,status:n<2?503:200,headers:{'retry-after':'0'},body:{value:[]}}));assert.equal(endpoints.length,2);assert.ok(result['1'].body);});
test('cancelled batch makes no request',async()=>{const{result,endpoints}=await batchFixture(()=>{}, {shouldStop:()=>true});assert.equal(endpoints.length,0);assert.equal(result['1'].code,'cancelled');});
test('all demo policies have unique ids',()=>{const d=load('demo.js','DEMO_DATA');assert.equal(new Set(d.policies.map(p=>p.id)).size,d.policies.length);});
test('all app scripts parse and local assets exist',()=>{
 for(const file of fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(root,'js',file),'utf8'),{filename:file});
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,asset] of html.matchAll(/(?:src|href)="((?:js|css|assets|vendor)\/[^"?]+)(?:\?[^" ]*)?"/g))assert.ok(fs.existsSync(path.join(root,asset)),asset);
 const ids=[...html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'duplicate HTML id');
});
test('nginx index and branding locations retain all security headers',()=>{const c=fs.readFileSync(path.join(root,'selfhost/nginx.conf'),'utf8');for(const target of ['/index.html','/selfhost-branding.json']){const body=c.slice(c.indexOf('location = '+target)).split('}')[0];for(const header of ['X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'])assert.ok(body.includes('add_header '+header),target+' missing '+header);}});

for (const format of ['policiesZip','policiesDocx']) {
 test(`${format}: a failed second card cancels the export and cleans staging`,async()=>{
  let renders=0,generated=0,removed=0;
  class Zip {file(){return this;} async generateAsync(){generated++;return {};}}
  class Img {constructor(){this.width=100;this.height=100;} set src(value){this.onload();}}
  const Exporter=load('export.js','Exporter',{
   JSZip:Zip,Image:Img,
   document:{body:{appendChild(){}},documentElement:{getAttribute(){return null;},setAttribute(){},removeAttribute(){}},createElement(){return {firstElementChild:{},remove(){removed++;}};}},
   Render:{card:()=>'<div>card</div>',caGroup:()=>({label:'Test'})},
   htmlToImage:{async toPng(){if(++renders>2)throw Error('fixture render failure');return 'data:image/png;base64,AA==';}},
  });
  await assert.rejects(Exporter[format]([{id:'p1',seq:1,name:'One'},{id:'p2',seq:2,name:'Two'}],'Fixture',null,()=>{}),/Export cancelled/);
  assert.equal(generated,0);assert.equal(removed,2);
 });
}
test('build number, assets and promotion entries are in sync',()=>{
 const build=load('version.js','APP_BUILD');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,v] of html.matchAll(/\?v=(\d+)/g))assert.equal(Number(v),build.build);
 const changes=load('changelog.js','CHANGELOG');assert.equal(changes[0].build,build.build);
 // js/promote.js is the beta channel's promotion queue and does not exist on main (production has no queue); the sync check applies where the file is.
 // A bookkeeping build (its changelog title starts with Production is) records a promotion and has no queue item of its own — every other beta build must.
 if(fs.existsSync(path.join(root,'js','promote.js'))){const queue=load('promote.js','PROMOTE');const active=queue.items.filter(i=>i.builds.includes(build.build));if(!/^Production is /.test(changes[0].title))assert.ok(active.length>0);for(const i of active)assert.ok(i.test.length>0);}
});
test('unresolved external scope stays unknown in coverage, matrix and exported report',async()=>{
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?users:[],gpost:async()=>({value:[]})});
 const p=policy({users:{includeUsers:['All'],excludeGuestsOrExternalUsers:{guestOrExternalUserTypes:'serviceProvider'}}});p.grantControls={builtInControls:['mfa'],operator:'OR'};
 const c=await a.collect([asVm(p)],'all',()=>{});const r=a.evaluate(c.lookup,c.users,c.ctx);
 assert.equal(r[0].mfaTargeted,null);assert.equal(r[0].unknown.length,1);assert.equal(a.summary(r).noMfa,0);assert.equal(a.coverage(r,false).unknown,1);assert.equal(a.coverage(r,false).total,0);
 assert.equal(a.buildMatrixMaps(r)[0].m[p.id],'unknown');
 const html=a.exportHtml({tenant:'Fixture',date:'2026-09-14'},r,a.policyMeta(c.lookup),[],false);
 assert.match(html,/unresolved policy scope/);for(const [,code]of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(code);
});
test('an ambiguous gateway error never automatically retries a policy create',async()=>{
 let calls=0;class Msal{async initialize(){}async handleRedirectPromise(){return null;}async acquireTokenSilent(){return{accessToken:'fixture'};}}
 const Graph=load('graph.js','Graph',{AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:[],graphBase:'https://graph.microsoft.com/beta'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},setTimeout:fn=>fn(),fetch:async()=>{calls++;return{ok:false,status:503,headers:{get:()=>null},json:async()=>({error:{message:'gateway failed'}})};}});
 await Graph.init();await assert.rejects(Graph.gpost('/identity/conditionalAccess/policies',policy()),/503/);assert.equal(calls,1);
});

function rolloutHarness(fetchJoey) {
 const nodes=new Map(),actions=[],prepared=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,listeners:{},classList:{contains:()=>true,toggle(){}},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},querySelector(){return null;}});
  return nodes.get(id);
 };
 const workspace=load('workspace.js','Workspace',{APP_BUILD:{isBeta:true},Event,document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}}});
 workspace.init({action:name=>actions.push(name),impact:()=>null,fetchJoey,prepareJoey:async bundle=>prepared.push(bundle)});
 const update=(tenant='Fixture')=>workspace.update({tenant,demo:true,policies:[],visible:[],selected:new Set(),view:'list',readAt:1});
 update();
 const click=action=>node('rolloutBody').listeners.click({target:{closest:()=>({dataset:{rolloutAction:action}})}});
 return {workspace,node,actions,prepared,update,click};
}
const rolloutBundle=()=>({complete:true,policies:[policy()],groups:[{displayName:'Exclusion group'}],namedLocations:[{displayName:'Office'}],depSkipped:[],release:'fixture-release',commit:'1234567abcdef'});
test('rollout exposes separate CloudFellows ZIP and Joey fetch actions in Scope and Plan',async()=>{
 let fetches=0;const h=rolloutHarness(async()=>{fetches++;});
 assert.match(h.node('rolloutBody').innerHTML,/CloudFellows/);assert.match(h.node('rolloutBody').innerHTML,/Choose ZIP/);assert.match(h.node('rolloutBody').innerHTML,/Fetch latest/);
 await h.click('cloudfellows');assert.deepEqual(h.actions,['cloudfellows']);assert.equal(fetches,0);
 await h.click('next');assert.match(h.node('rolloutBody').innerHTML,/Choose ZIP/);assert.match(h.node('rolloutBody').innerHTML,/Fetch latest/);
});
test('Joey preparation waits for a complete fresh read, preserves dependencies and prevents double submission',async()=>{
 let finish,fetches=0;const bundle=rolloutBundle();
 const h=rolloutHarness(()=>{fetches++;return new Promise(resolve=>finish=resolve);});
 const run=h.click('joey');await h.click('joey');await h.click('cloudfellows');
 assert.equal(fetches,1);assert.equal(h.prepared.length,0);assert.equal(h.actions.length,0);
 finish({status:{status:'live',error:null},bundle});await run;
 assert.equal(h.prepared[0],bundle);assert.match(h.node('rolloutBody').innerHTML,/fixture-release/);assert.match(h.node('rolloutBody').innerHTML,/1234567/);
});
test('failed fresh fetch never opens a cached Joey release and can be retried',async()=>{
 let fetches=0;const h=rolloutHarness(async()=>({status:++fetches===1?{status:'live',error:'Rate limited'}:{status:'live',error:null},bundle:rolloutBundle()}));
 await h.click('joey');assert.equal(h.prepared.length,0);assert.match(h.node('rolloutBody').innerHTML,/Rate limited/);
 await h.click('joey');assert.equal(h.prepared.length,1);
});
test('incomplete Joey release, skipped dependencies and thrown errors stop preparation',async()=>{
 for(const result of [{...rolloutBundle(),complete:false},{...rolloutBundle(),depSkipped:['Groups/missing.json']},{...rolloutBundle(),policies:[]},null]){
  const h=rolloutHarness(async()=>({status:{status:'live'},bundle:result}));await h.click('joey');assert.equal(h.prepared.length,0);assert.match(h.node('rolloutBody').innerHTML,/incomplete/);
 }
 const h=rolloutHarness(async()=>{throw Error('Offline');});await h.click('joey');assert.equal(h.prepared.length,0);assert.match(h.node('rolloutBody').innerHTML,/Offline/);
});
test('switching tenants while Joey fetches discards the pending import',async()=>{
 let finish;const h=rolloutHarness(()=>new Promise(resolve=>finish=resolve));const run=h.click('joey');
 h.update('Other tenant');finish({status:{status:'live'},bundle:rolloutBundle()});await run;
 assert.equal(h.prepared.length,0);assert.doesNotMatch(h.node('rolloutBody').innerHTML,/fixture-release/);
});

test('shared log-source selectors target existing toolbars',()=>{
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const mounted=[...app.matchAll(/mountLogSourceSeg\("([^"]+)"/g)].map(m=>m[1]);
 assert.ok(mounted.length>0);
 for(const id of mounted){
  const element=html.match(new RegExp('<[^>]+id="'+id+'"[^>]*>'));
  assert.ok(element,`log source toolbar ${id} exists`);
  assert.match(element[0],/class="[^"]*\btoolbar\b/,`${id} is a toolbar`);
 }
});

// ---- 25409: the shared coverage comparison (js/coverage.js) ----
// These were the review's behaviour probes P01/P02/P08; they assert the
// CORRECTED behaviour, so a regression here is a tool telling somebody an
// exclusion is closed when it is not.
const vpol=(over={})=>({id:over.id||'q1',displayName:over.name||'Q',state:'enabled',
 conditions:{users:{includeUsers:['All'],...(over.excludeUsers?{excludeUsers:over.excludeUsers}:{})},
  applications:{includeApplications:over.apps||['All']},
  ...(over.platforms?{platforms:{includePlatforms:over.platforms}}:{}),
  ...(over.deviceFilter?{devices:{deviceFilter:{mode:'include',rule:'device.trustType -eq "AzureAD"'}}}:{})},
 grantControls:{operator:over.op||'AND',builtInControls:over.controls||['mfa']}});

test('verdict: MFA plus compliant device is not covered by an MFA-only policy',()=>{
 const P=vpol({id:'p',name:'P',controls:['mfa','compliantDevice']});
 const Q=vpol({id:'q',name:'Q',controls:['mfa']});
 const v=CaCoverage.compare(P,Q);
 assert.equal(v.state,'partial');
 assert.ok(v.missing.some(m=>/compliant device/.test(m)),v.missing.join('|'));
 assert.equal(CaCoverage.bestOf(P,[Q]).state,'partial');
});
test('verdict: a replacement that excludes the user, or narrows the platform, is not equivalent',()=>{
 const P=vpol({id:'p',name:'P',controls:['mfa']});
 const excl=CaCoverage.compare(P,vpol({id:'q',name:'Q',controls:['mfa'],excludeUsers:['u1']}));
 assert.equal(excl.state,'partial');
 assert.ok(excl.missing.some(m=>/excluded from the replacement/.test(m)));
 const plat=CaCoverage.compare(P,vpol({id:'q2',name:'Q2',controls:['mfa'],platforms:['windows']}));
 assert.equal(plat.state,'partial');
 assert.ok(plat.missing.includes('device platforms'));
});
test('verdict: an identical policy is equivalent, and an unmodelled condition is never green',()=>{
 const P=vpol({id:'p',name:'P',controls:['mfa']});
 assert.equal(CaCoverage.compare(P,vpol({id:'q',name:'Q',controls:['mfa']})).state,'equivalent');
 const u=CaCoverage.compare(P,vpol({id:'q',name:'Q',controls:['mfa'],deviceFilter:true}));
 assert.equal(u.state,'unestablished');
 assert.ok(u.unresolved.some(x=>/device filter/.test(x)));
 assert.equal(CaCoverage.bestOf(P,[vpol({id:'q',name:'Q',controls:['mfa'],deviceFilter:true})]).state,'unestablished');
});
test('verdict: an OR grant with several controls does not guarantee the one that matters',()=>{
 const P=vpol({id:'p',name:'P',controls:['mfa']});
 const Q=vpol({id:'q',name:'Q',controls:['mfa','compliantDevice'],op:'OR'});
 const v=CaCoverage.compare(P,Q);
 assert.equal(v.state,'partial');
 assert.ok(v.missing.some(m=>/alternative grant controls/.test(m)));
});
test('verdict: a bypass with no equivalent replacement stays risky, and unestablished does too',async()=>{
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?users:[],gpost:async()=>({value:[]})});
 const bypassed=policy({users:{includeUsers:['All'],excludeUsers:['u1']}});
 bypassed.id='bypassed';bypassed.displayName='Bypassed';bypassed.grantControls={operator:'AND',builtInControls:['mfa','compliantDevice']};
 const weaker={...vpol({id:'weaker',name:'Weaker',controls:['mfa']})};
 const c=await a.collect([asVm(bypassed),asVm(weaker)],'all',()=>{});
 const r=a.evaluate(c.lookup,c.users,c.ctx);
 const b=r[0].bypassing.find(x=>x.policyId==='bypassed');
 assert.equal(b.verdict,'partial');
 assert.equal(b.covered,false);
 assert.equal(b.risky,true);
 assert.ok(b.partial[0].shortfall.some(m=>/compliant device/.test(m)),JSON.stringify(b.partial));
 assert.equal(b.policyId,'bypassed');
});
test('exclusion analyzer: app coverage uses the same comparison and the same words',()=>{
 const Exclusions=load('exclusions.js','Exclusions',{CaScope,CaCoverage,Graph:{}});
 const all=policy({users:{includeUsers:['All']},applications:{includeApplications:['All'],excludeApplications:['appX']}});
 all.id='all';all.displayName='Baseline MFA';all.grantControls={operator:'AND',builtInControls:['mfa']};
 const narrow=vpol({id:'narrow',name:'App X policy',apps:['appX'],controls:['compliantDevice'],platforms:['windows'],excludeUsers:['u1']});
 const model=Exclusions.appCoverage(Exclusions.collect([all,narrow]));
 const app=model.entities.find(e=>e.kind==='app'&&e.id==='appX');
 assert.ok(app,'the excluded app is an entity');
 assert.equal(app.verdicts.all.state,'partial');
 assert.equal(app.coverage.all.length,0);
 assert.ok(app.uncoveredIn.includes('all'));
 const missing=app.verdicts.all.partial[0].missing.join(' | ');
 assert.match(missing,/excluded from the replacement/);
 assert.match(missing,/device platforms/);
 assert.match(missing,/MFA is not mandatory/);
});
test('exclusion analyzer: a resource collection is not established rather than skipped',()=>{
 const Exclusions=load('exclusions.js','Exclusions',{CaScope,CaCoverage,Graph:{}});
 const all=policy({users:{includeUsers:['All']},applications:{includeApplications:['All'],excludeApplications:['Office365']}});
 all.id='all';all.grantControls={operator:'AND',builtInControls:['mfa']};
 const model=Exclusions.appCoverage(Exclusions.collect([all]));
 const app=model.entities.find(e=>e.kind==='app');
 assert.equal(app.verdicts.all.state,'unestablished');
 assert.match(app.verdicts.all.unresolved[0],/resource collection/);
});

// ---- 25410: configured versus effective, the whole external clause, paged provenance ----
const exModule=(Graph)=>load('exclusions.js','Exclusions',{CaScope,CaCoverage,Graph});
const expol=(id,name,over={})=>({id,displayName:name,state:over.state||'enabled',
 conditions:{users:{includeUsers:over.inc||['All'],
  ...(over.incGroups?{includeGroups:over.incGroups}:{}),
  ...(over.excUsers?{excludeUsers:over.excUsers}:{}),
  ...(over.excGroups?{excludeGroups:over.excGroups}:{}),
  ...(over.excGuests?{excludeGuestsOrExternalUsers:over.excGuests}:{})},
  applications:{includeApplications:['All']}},
 grantControls:{operator:'AND',builtInControls:['mfa']}});

test('exclusions: a user the policy never includes is configured, not a bypass',()=>{
 const E=exModule({});
 const scoped=expol('p1','Scoped to a group',{inc:[],incGroups:['gUnread'],excUsers:['u1']});
 const named=expol('p2','Named users',{inc:['u2'],excUsers:['u1']});
 const all=expol('p3','All users',{excUsers:['u1']});
 const m=E.collect([scoped,named,all]);
 const {users,states}=E.effectiveUsers(m);
 const cells=Object.fromEntries([...users[0].byPolicy].map(([k,v])=>[k,v.state]));
 assert.equal(cells.p3,'bypass');      // All users, then excluded — a real bypass
 assert.equal(cells.p2,'configured');  // includes only u2; u1 was never in scope
 assert.equal(cells.p1,'unknown');     // include side is a group this scan never read
 assert.equal(states.bypass,1);assert.equal(states.configured,1);assert.equal(states.unknown,1);
});
test('exclusions: excluded directory roles are named as not expanded, never as zero',()=>{
 const E=exModule({});
 const p=expol('p1','Role exclusion');p.conditions.users.excludeRoles=['62e90394-69f5-4237-9190-012177145e10'];
 const m=E.collect([p]);
 const {users,unexpanded}=E.effectiveUsers(m);
 assert.equal(users.length,0);
 assert.equal(unexpanded.roles.length,1);
 assert.equal(E.summary(m,users).unexpandedRoles,1);
});
test('exclusions: two external clauses stay two exclusions, and only all-guests is High',()=>{
 const E=exModule({});
 const partner=expol('g1','Partner',{excGuests:{guestOrExternalUserTypes:'b2bCollaborationGuest',externalTenants:{membershipKind:'enumerated',members:['t1','t2']}}});
 const everyone=expol('g2','All external',{excGuests:{guestOrExternalUserTypes:'b2bCollaborationGuest,internalGuest,b2bCollaborationMember,b2bDirectConnectUser,otherExternalUser,serviceProvider'}});
 const m=E.collect([partner,everyone]);
 const guests=m.entities.filter(e=>e.kind==='guest');
 assert.equal(guests.length,2,'two different clauses are two entities');
 assert.match(guests.find(e=>e.clause.tenants.length).name,/2 named tenants/);
 const rk=E.risk(m);
 const flagsOf=(n)=>rk.rows.find(r=>r.name===n).flags.map(f=>f.level+':'+f.text).join(' ');
 assert.match(flagsOf('All external'),/high:All guests and external users are excluded/);
 assert.doesNotMatch(flagsOf('Partner'),/high:All guests/);
 assert.match(flagsOf('Partner'),/medium:Scoped external exclusion/);
});
test('exclusions: a direct member on page two stays direct',async()=>{
 // transitive members: u1 and u2. The direct-member read returns u1 plus a
 // continuation; before 25410 u2 was reported as coming in through nesting
 // although no nested group resolved at all.
 let batchCalls=0;
 const Graph={
  async gpost(){return {value:[{id:'g1',displayName:'CA-Exclude'}]};},
  async ggetAll(url){
   if(url.includes('/transitiveMembers'))return [{id:'u1'},{id:'u2'}];
   if(url.includes('/members'))return [{id:'u1',displayName:'User one'},{id:'u2',displayName:'User two'}];
   return [];
  },
  async gbatch(reqs){
   batchCalls++;
   return reqs.map(()=>({body:{value:[{id:'u1',displayName:'User one'}],'@odata.nextLink':'https://graph/next'}}));
  },
 };
 const E=exModule(Graph);
 const m=await E.resolve(E.collect([expol('p1','All users',{excGroups:['g1']})]));
 const g=m.entities.find(e=>e.kind==='group');
 assert.equal(g.memberTotal,2);
 assert.equal(g.directCount,2,'both members are direct once the continuation is followed');
 assert.equal(g.nestedCount,0);
 assert.equal(g.pathComplete,true);
 assert.ok(batchCalls>0);
});

// ---- 25411: one licence population, three measures, factual mailbox states ----
const LicGap=load('licgap.js','LicGap',{CaScope,Graph:{},Brand:{generatedBy:()=>'Generated by ENCA'}});
const P1_PLAN='41781fb2-bc02-4b7c-bd55-b576c07bb09d';
const lgpol=(id,name,over={})=>({id,displayName:name,state:over.state||'enabled',
 conditions:{users:{includeUsers:over.inc||['All'],...(over.excUsers?{excludeUsers:over.excUsers}:{})},
  applications:{includeApplications:['All']},...(over.risk?{signInRiskLevels:['high']}:{})},
 grantControls:{operator:'AND',builtInControls:['mfa']}});

test('licences: an excluded guest cannot subtract from a member count',()=>{
 // One member user, one guest excluded from the All-users policy. The guest is
 // not in the member population, so the policy targets the one member.
 const ctx={policies:[lgpol('p1','All users',{excUsers:['guest1']})],
  users:[{id:'m1',userPrincipalName:'m1@x',displayName:'Member one',accountEnabled:true,assignedLicenses:[],assignedPlans:[]}],
  totalMembers:1,members:{},roleMembers:{},skus:[],names:{}};
 const res=LicGap.analyze(ctx);
 const row=res.perPolicy.find(p=>p.id==='p1');
 assert.equal(row.size,1,'1 member in scope, not 0');
 assert.equal(res.p1.targeted,1);
 assert.equal((res.p1.gapUsers||[]).length,1);
 assert.equal(row.gap,1);
});
test('licences: seats purchased and entitlement assigned in scope are separate measures',()=>{
 const users=[
  // analyze() reads the per-user verdict the wiring puts there with licenceOf
  {id:'a',upn:'a@x',name:'A',userPrincipalName:'a@x',displayName:'A',accountEnabled:true,enabled:true,p1:true,p2:false,assignedLicenses:[{skuId:'sku-p1',disabledPlans:[]}],assignedPlans:[]},
  {id:'b',upn:'b@x',name:'B',userPrincipalName:'b@x',displayName:'B',accountEnabled:true,enabled:true,p1:false,p2:false,assignedLicenses:[],assignedPlans:[]},
 ];
 const ctx={policies:[lgpol('p1','All users')],users,totalMembers:2,members:{},roleMembers:{},names:{},
  skus:[{skuId:'sku-p1',skuPartNumber:'AAD_PREMIUM',prepaidUnits:{enabled:9},consumedUnits:1,capabilityStatus:'Enabled',servicePlans:[{servicePlanId:P1_PLAN,servicePlanName:'AAD_PREMIUM',provisioningStatus:'Success'}]}]};
 const res=LicGap.analyze(ctx);
 assert.equal(res.p1.targeted,2);
 assert.equal(res.p1.seats,9,'nine seats owned');
 assert.equal(res.p1.assignedInScope,1,'only one targeted identity holds it');
 assert.ok(res.p1.gap<=0,'no purchasing shortfall');
 assert.equal((res.p1.gapUsers||[]).length,1,'and still one user to assign to');
 const md=LicGap.toMd(res,{tenantName:'Fixture'});
 assert.match(md,/Assigned in scope/);
 assert.match(md,/Purchasing shortfall is demand against seats OWNED/);
 assert.doesNotMatch(md,/\| Targeted \| Licensed \| Gap \|/);
});
test('licences: a denied mailbox read is reported as denied, never as never-licensed',()=>{
 const ctx={policies:[lgpol('p1','All users')],
  users:[{id:'a',userPrincipalName:'shared@x',displayName:'Shared',accountEnabled:true,assignedLicenses:[],assignedPlans:[]}],
  totalMembers:1,members:{},roleMembers:{},skus:[],names:{}};
 const res=LicGap.analyze(ctx);
 res.p1.gapUsers[0].purpose='mailbox-no-access';
 const md=LicGap.toMd(res,{tenantName:'Fixture'});
 assert.match(md,/MAILBOX READ DENIED/);
 assert.match(md,/purpose was NOT established/);
 assert.doesNotMatch(md,/never licensed/i);
 assert.doesNotMatch(md,/disable or exclude it/i);
 res.p1.gapUsers[0].purpose='shared';
 const md2=LicGap.toMd(res,{tenantName:'Fixture'});
 assert.match(md2,/userPurpose returned by Graph/);
 assert.match(md2,/keep sign-in blocked/);
});
test('licences and coverage agree that insider risk is a P2 condition',async()=>{
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?users:[],gpost:async()=>({value:[]})});
 const p=policy();p.conditions.insiderRiskLevels='elevated';p.grantControls={operator:'AND',builtInControls:['mfa']};
 const c=await a.collect([asVm(p)],'all',()=>{});
 const r=a.evaluate(c.lookup,c.users,c.ctx);
 assert.equal(r[0].needsP2,true);
 assert.equal(JSON.stringify(LicGap.riskKindsOf?LicGap.riskKindsOf(p):['insider risk']),JSON.stringify(['insider risk']));
});

// ---- 25412: results are bound to the run that made them ----
const RunMeta=load('runmeta.js','RunMeta',{});
test('runmeta: a policy reload makes a result stale, a rerender does not',()=>{
 const ctx={tenantId:'t1',tenantName:'Contoso',snapshot:1000,policies:[{state:'enabled'},{state:'disabled'}]};
 const m=RunMeta.of({...ctx,tool:'T09',population:'Every policy in the tenant'});
 assert.equal(m.states.on,1);assert.equal(m.states.off,1);
 assert.equal(RunMeta.stale(m,ctx),false,'same snapshot, same tenant');
 assert.equal(RunMeta.stale(m,{...ctx,snapshot:2000}),true,'policies reloaded');
 assert.equal(RunMeta.stale(m,{...ctx,tenantId:'t2'}),true,'different tenant');
 const html=RunMeta.strip(m,{...ctx,snapshot:2000},{staleHint:'rescan'});
 assert.match(html,/runstrip stale/);
 assert.match(html,/Policy snapshot replaced/);
 assert.match(html,/#'?\w+/);
 assert.doesNotMatch(RunMeta.strip(m,ctx),/stale/);
});
test('runmeta: two runs get different ids and the descriptor keeps its own snapshot',()=>{
 const a=RunMeta.of({tenantId:'t1',snapshot:1,policies:[]});
 const b=RunMeta.of({tenantId:'t1',snapshot:2,policies:[]});
 assert.notEqual(a.id,b.id);
 assert.equal(a.snapshot,1);assert.equal(b.snapshot,2);
});

// ---- 25413: cohorts, and the render that stopped being quadratic ----
test('cohorts: identical users collapse into one row, outliers sort first',async()=>{
 const many=Array.from({length:12},(_,i)=>({id:'u'+i,displayName:'User '+i,userType:'Member',accountEnabled:true}));
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?many:[],gpost:async()=>({value:[]})});
 const p1=policy();p1.id='p1';p1.displayName='All users MFA';
 const p2=policy({users:{includeUsers:['All'],excludeUsers:['u0']}});p2.id='p2';p2.displayName='Excludes one';
 p2.grantControls={operator:'AND',builtInControls:['mfa','compliantDevice']};
 const c=await a.collect([asVm(p1),asVm(p2)],'all',()=>{});
 const r=a.evaluate(c.lookup,c.users,c.ctx);
 const maps=a.buildMatrixMaps(r),pols=a.policyMeta(c.lookup);
 const co=a.cohorts(r,maps,pols);
 assert.equal(co.length,2,'twelve users, two distinct states');
 assert.equal(co[0].users,1,'the outlier sorts first');
 assert.match(co[0].finding,/risky bypass/);
 assert.equal(co[1].users,11);
 assert.equal(co[1].finding,'nothing to look at');
 const html=a.cohortsHtml(r,maps,pols,null,null);
 assert.match(html,/2 cohorts<\/b> across 12 users/);
 assert.match(html,/data-cohort="0"/);
});
test('user rows keep their original indices without a quadratic lookup',async()=>{
 const many=Array.from({length:30},(_,i)=>({id:'u'+i,displayName:'User '+i,userPrincipalName:'u'+i+'@x',userType:'Member',accountEnabled:true}));
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?many:[],gpost:async()=>({value:[]})});
 const c=await a.collect([asVm(policy())],'all',()=>{});
 const r=a.evaluate(c.lookup,c.users,c.ctx);
 const idxs=a.filterRows(r,'all','u2',null,'');
 const html=a.userRows(r,'all','u2',null,'');
 for(const i of idxs)assert.match(html,new RegExp('data-user="'+i+'"'));
 assert.equal((html.match(/data-user=/g)||[]).length,idxs.length);
});

test('exclusions matrix: the policy that does NOT carry the shared exclusion is marked',()=>{
 const E=exModule({});
 // four policies exclude the break-glass group, one does not
 const pols=[1,2,3,4].map(i=>expol('p'+i,'Policy '+i,{excGroups:['g-break']}));
 pols.push(expol('p5','The odd one out',{excUsers:['someone-else']}));
 const m=E.collect(pols);
 const html=E.renderMatrix(m,'all','',true,{});
 assert.match(html,/cellv dev/,'the missing cell is marked');
 assert.match(html,/odd one out/i);
 assert.match(html,/excluded from 4 of 5 policies/);
 // and with no dominant pattern nothing is marked
 const flat=E.collect([expol('a','A',{excGroups:['g1']}),expol('b','B',{excGroups:['g2']})]);
 assert.doesNotMatch(E.renderMatrix(flat,'all','',true,{}),/cellv dev/);
});

// ---- 25416: the member button is a real control on its own line ----
test('exclusions matrix: the member button is not inside the clipped sublabel',()=>{
 const E=exModule({});
 const m=E.collect([expol('p1','All users',{excGroups:['g1']})]);
 const g=m.entities.find(e=>e.kind==='group');
 g.name='CA-Exclude';g.members=[{id:'u1',name:'One',upn:'one@x',direct:true,via:[]},{id:'u2',name:'Two',upn:'two@x',direct:false,via:['Child']}];g.memberTotal=2;g.nested=[{id:'c',name:'Child'}];g.directCount=1;g.nestedCount=1;
 const html=E.renderMatrix(m,'all','',false,{});
 assert.match(html,/class="ex-rowact" data-exmembers=/);
 assert.doesNotMatch(html,/ex-memlink/);
 // the button follows the sublabel div, it does not sit inside it
 const i=html.indexOf('class="uupn"'),j=html.indexOf('class="ex-rowact"');
 assert.ok(i>0&&j>i);
 assert.ok(html.slice(i,j).includes('</div>'),'sublabel closed before the button');
});

// ---- 25417: every reactive thing in the grids is a button, and a cell has evidence ----
test('exclusions grids: rows, columns and marked cells are buttons with grid positions',()=>{
 const E=exModule({});
 const m=E.collect([expol('p1','All users',{excUsers:['u1']}),expol('p2','Second',{excUsers:['u1','u2']})]);
 m.entities.forEach(e=>{e.name=e.id;});
 const html=E.renderMatrix(m,'all','',false,{});
 assert.match(html,/<button type="button" class="ph" data-expol="p1" data-r="0" data-c="1" tabindex="0"/);
 assert.match(html,/<button type="button" class="uname ex-rowbtn" data-exrow="user:u1" data-r="1" data-c="0"/);
 assert.match(html,/<button type="button" class="cell no" data-excell="user:u1\|p1"/);
 assert.doesNotMatch(html,/<td class="ucol[^>]*data-exrow=/,'the td no longer carries the row action');
 assert.match(html,/ex-legend/);
 const {users}=E.effectiveUsers(m);
 const r=E.renderUsers(m,users,'',0,50,{});
 assert.match(r.html,/data-excell="u1\|p2"/);
 assert.match(r.html,/class="ph" data-expol="p2" data-r="0" data-c="2" tabindex="-1"/);
});
test('exclusions evidence: the cell card says the same thing the title used to, plus the verdict',()=>{
 const E=exModule({});
 const scoped=expol('p1','Scoped',{inc:['u2'],excUsers:['u1']});
 const all=expol('p2','All users',{excUsers:['u1']});
 const m=E.collect([scoped,all]);
 m.entities.forEach(e=>{e.name='User one';e.upn='u1@x';});
 const {users}=E.effectiveUsers(m);
 const evb=E.evidence(m,users,'u1','p2','users');
 assert.equal(evb.state,'bypass');assert.match(evb.verdict,/effective bypass/);
 const evc=E.evidence(m,users,'u1','p1','users');
 assert.equal(evc.state,'configured');assert.match(evc.verdict,/never includes them/);
 const evm=E.evidence(m,users,'user:u1','p2','matrix');
 assert.equal(evm.excluded,true);assert.equal(evm.policy.name,'All users');
 const odd=E.evidence(m,users,'user:u1','p1','matrix');
 assert.equal(odd.excluded,true);
 assert.equal(E.evidence(m,users,'nobody','p2','users'),null);
});
