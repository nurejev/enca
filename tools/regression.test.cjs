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
function analyzer(Graph){return load('analyze.js','Analyzer',{CaScope,Graph});}
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
  const p=policy();p.grantControls={operator,builtInControls:['mfa','compliantDevice']};const c=await a.collect([asVm(p)],'all',()=>{});const r=a.evaluate(c.lookup,c.users,c.ctx);assert.equal(r[0].mfaCovered,operator==='AND');
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
 const queue=load('promote.js','PROMOTE');const active=queue.items.filter(i=>i.builds.includes(build.build));assert.ok(active.length>0);for(const i of active)assert.ok(i.test.length>0);
});
test('unresolved external scope stays unknown in coverage, matrix and exported report',async()=>{
 const a=analyzer({ggetAll:async url=>url.startsWith('/users?')?users:[],gpost:async()=>({value:[]})});
 const p=policy({users:{includeUsers:['All'],excludeGuestsOrExternalUsers:{guestOrExternalUserTypes:'serviceProvider'}}});p.grantControls={builtInControls:['mfa'],operator:'OR'};
 const c=await a.collect([asVm(p)],'all',()=>{});const r=a.evaluate(c.lookup,c.users,c.ctx);
 assert.equal(r[0].mfaCovered,null);assert.equal(r[0].unknown.length,1);assert.equal(a.summary(r).noMfa,0);assert.equal(a.coverage(r,false).unknown,1);assert.equal(a.coverage(r,false).total,0);
 assert.equal(a.buildMatrixMaps(r)[0].m[p.displayName],'unknown');
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
 const workspace=load('workspace.js','Workspace',{APP_BUILD:{isBeta:true},document:{getElementById:node,querySelectorAll:()=>[]}});
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
