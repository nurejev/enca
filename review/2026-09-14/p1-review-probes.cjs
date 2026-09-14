const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
// Advice-only review probes: asserts known defect behaviour at b2bbfd2. All API responses are mocked.
const root=require('node:path').resolve(__dirname,'../..');
const src=f=>fs.readFileSync(root+'/js/'+f,'utf8');
const quiet={log(){},warn(){},error(){}};
function load(f,s,extra={}){const c=vm.createContext({console:quiet,Set,Map,URL,...extra});vm.runInContext(src(f)+'\nglobalThis.result='+s,c);return c.result;}
const app=src('app.js');
const scope=load('cascope.js','CaScope');
const who=load('whois.js','WhoIs',{CaScope:scope});
const wave=load('wave.js','Wave',{WhoIs:who});
const policy=(users={includeUsers:['All']},id='p')=>({id,displayName:id,state:'enabled',conditions:{users,applications:{includeApplications:['All']}},grantControls:{operator:'OR',builtInControls:['mfa']}});
const asVm=p=>({raw:p,seq:p.id,grant:{controls:p.grantControls.builtInControls,op:'OR'}});
const user={id:'u',name:'User',displayName:'User',upn:'u@example.test',guest:true,groupIds:new Set(),roleIds:new Set(),names:{}};
const output={date:'2026-09-14',probes:[],benchmarks:[]};
function record(name,evidence){output.probes.push({name,...evidence});}
function progressHarness(graph={}){let now=1000;const nodes={xPgTxt:{textContent:''},xPgBar:{style:{}}};const c=vm.createContext({console:quiet,Graph:graph,Date:{now:()=>now},$:id=>nodes[id],PROG_REG:{},setInterval:()=>1,clearInterval(){},document:{querySelectorAll:()=>[]}});vm.runInContext(app.slice(app.indexOf('  function makeProgress('),app.indexOf('  // The audit range selector'))+'\nglobalThis.result=makeProgress("x");',c);return {p:c.result,nodes,advance:ms=>now+=ms};}
(async()=>{
 class Msal{async initialize(){}async handleRedirectPromise(){return null;}async acquireTokenSilent(){return {accessToken:'fixture'};}}
 let calls=0;
 const graph=load('graph.js','Graph',{AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:[],graphBase:'https://graph.microsoft.com/beta'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},setTimeout:fn=>fn(),fetch:async()=>{calls++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>({value:[]})};}});
 await graph.init();let error;try{await graph.aget('https://management.azure.com/subscriptions?api-version=2022-12-01');}catch(e){error=e.message;}
 assert.equal(error,'opts is not defined');record('ARM successful response throws',{networkCalls:calls,error});
 let batches=0,waited=0;
 const throttle=load('graph.js','Graph',{AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:[],graphBase:'https://graph.microsoft.com/beta'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},setTimeout:(fn,ms)=>{waited+=ms;fn();},fetch:async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({responses:++batches===1?[{id:'1',status:429,headers:{'Retry-After':'120'}}]:[{id:'1',status:200,body:{value:[]}}]})})});
 await throttle.init();await throttle.gbatch([{id:'1',url:'/users'}]);assert.equal(waited,60000);record('Batch Retry-After shortened',{serverRequestedSeconds:120,actualScheduledSeconds:waited/1000});
 const compare=load('compare.js','Comparer');
 const restricted=policy({includeGuestsOrExternalUsers:{guestOrExternalUserTypes:'serviceProvider',externalTenants:{membershipKind:'enumerated',members:['partner-a']}}});
 const guest={...user,guestOrExternalUserType:'b2bCollaborationGuest',homeTenantId:'partner-b'};
 const old=compare.assignmentRows(compare.buildLookup([asVm(restricted)]),[guest])[0].states[0].s;
 const correct=scope.of(restricted,guest).state;
 assert.equal(old,'inc');assert.equal(correct,'na');record('Compare users external scope mismatch',{compare:old,sharedScope:correct});
 const legacy=policy({includeUsers:['GuestsOrExternalUsers']});
 assert.equal(compare.assignmentRows(compare.buildLookup([asVm(legacy)]),[guest])[0].states[0].s,'na');
 assert.equal(scope.of(legacy,guest).state,'inc');record('Compare users legacy guest mismatch',{compare:'na',sharedScope:'inc'});
 const ex=load('exclusions.js','Exclusions',{Graph:{ggetAll:async()=>Array.from({length:600},(_,i)=>({id:'u'+i,displayName:'User '+i})),gbatch:async()=>({})}});
 const m=await ex.resolve(ex.collect([policy({includeUsers:['All'],excludeGroups:['g']})]));
 assert.equal(m.entities[0].memberTotal,600);assert.equal(ex.effectiveUsers(m).length,500);record('Exclusions discards users after full read',{read:600,effectiveUsers:500});
 const h=progressHarness({gget:async()=>({value:Array.from({length:600},(_,i)=>({id:'u'+i}))})});
 const got=await h.p.fetchAll('/members',500,'members');assert.equal(got.length,500);assert.equal(h.p.st.capped,false);record('Progress pager silently slices final page',{fetched:600,returned:got.length,capped:h.p.st.capped});
 h.p.start(25,'users','page');h.p.tick(999,1);assert.equal(h.nodes.xPgBar.style.width,'100%');record('Page count used as record denominator',{pageCap:25,page:1,records:999,bar:h.nodes.xPgBar.style.width});
 h.p.start(10000,'records','page');h.advance(30000);assert.doesNotMatch(h.p.panel('Read'),/30s/);record('First-page progress hides elapsed time',{elapsedSeconds:30,visible:'Waiting for the first page from Microsoft Graph…'});
 let finish;const c=vm.createContext({console:quiet,logSource:'entra',logCache:null,logInflight:null,logCacheUsable:()=>false,ReportImpact:{query:()=>'/signins'},SI_MAX:10000,Date,setInterval,clearInterval});
 vm.runInContext(app.slice(app.indexOf('  async function readSignInWindow('),app.indexOf('  const logAgeLabel'))+'\nglobalThis.read=readSignInWindow;',c);
 const pending=c.read(7,{st:{},fetchAll:()=>new Promise(r=>finish=r),stop(){}},true);c.logSource='hunt';finish([{id:'entra-row'}]);const result=await pending;
 assert.equal(result.source,'hunt');record('Log source changes during pending read',{requestedSource:'entra',storedSource:result.source,record:result.records[0].id});
 const gc=vm.createContext({console:quiet,Graph:{gpost:async()=>{throw Error('403');}},GroupUse:{isGuid:()=>true},policies:[asVm(policy({includeGroups:['g']}))]});const gs=app.indexOf('  async function guCaScopedGroups(');vm.runInContext(app.slice(gs,app.indexOf('\n  }',gs)+4)+'\nglobalThis.read=guCaScopedGroups;',gc);const missing=await gc.read(()=>{});assert.equal(missing[0].missing,true);record('Failed group lookup becomes missing object',{request:'403',reportedMissing:missing[0].missing});
 const mutations=[];const mc=vm.createContext({console:quiet,Graph:{ggetAll:async()=>{throw Error('403 member read');},gget:async()=>({conditions:{users:{includeGroups:['old']}}}),gpatch:async(url,body)=>mutations.push({url,body})},r:{id:'old'},g:{id:'new'},p:{refs:{include:[{id:'policy',name:'Policy'}],exclude:[]}},log:{failed:[],moved:[]},toast(){}});
 const moveStart=app.indexOf('  async function moveGroupMembers(');vm.runInContext(app.slice(moveStart,app.indexOf('  // ---- housekeeping:',moveStart)),mc);
 const tailStart=app.indexOf('        const mm = await moveGroupMembers(r.id, g.id,');const tailEnd=app.indexOf('\n      }\n      $("nestRcModal")',tailStart);assert.ok(tailEnd>tailStart);
 await vm.runInContext('(async()=>{'+app.slice(tailStart,tailEnd)+'})()',mc);assert.equal(mc.log.membersMoved,0);assert.equal(mc.log.failed.length,0);assert.equal(mutations.length,1);assert.deepEqual(Array.from(mutations[0].body.conditions.users.includeGroups),['new']);record('Group recreation retargets policy after failed membership read',{memberRead:'403',membersCopied:mc.log.membersMoved,reportedFailures:mc.log.failed.length,policyWrites:mutations.length,newPolicyGroup:'new'});
 const args=(n,p,groups=new Map())=>({group:{id:'wave',displayName:'Wave'},members:Array.from({length:n},(_,i)=>({id:'u'+i,displayName:'User '+i})),groupMembers:groups,roleMembers:new Map(),names:{},vms:Array.from({length:p},(_,i)=>asVm(policy({includeUsers:['All'],excludeGroups:['ex']},'p'+i))),records:null,dgGroups:[],memberCap:500,days:7});
 const partial=wave.analyze(args(1,1,new Map([['ex',new Set()]])));
 const complete=wave.analyze(args(1,1,new Map([['ex',new Set(['u0'])]])));
 assert.equal(partial.members[0].states[0].st.s,'inc');assert.equal(complete.members[0].states[0].st.s,'exc');record('Wave cannot distinguish unread membership',{missingLaterPage:partial.members[0].states[0].st.s,completeRead:complete.members[0].states[0].st.s});
 for(const [n,p] of [[100,50],[500,100],[500,200]]){const a=args(n,p);wave.analyze(a);const runs=[];for(let k=0;k<3;k++){const t=performance.now();wave.analyze(a);runs.push(Math.round((performance.now()-t)*10)/10);}output.benchmarks.push({module:'Wave.analyze',users:n,policies:p,ms:runs,medianMs:[...runs].sort((a,b)=>a-b)[1]});}
 const impact=load('reportimpact.js','ReportImpact');
 for(const n of [10000,100000]){const records=Array.from({length:n},(_,i)=>({id:'s'+i,userPrincipalName:'u'+(i%1000)+'@example.test',createdDateTime:'2026-09-14T00:00:00Z',appliedConditionalAccessPolicies:Array.from({length:10},(_,p)=>({id:'p'+p,displayName:'Policy '+p,result:'reportOnlySuccess'}))}));const runs=[];for(let k=0;k<3;k++){const t=performance.now();impact.build(records,[]);runs.push(Math.round((performance.now()-t)*10)/10);}output.benchmarks.push({module:'ReportImpact.build',signins:n,policiesPerSignin:10,distinctUsers:1000,ms:runs,medianMs:[...runs].sort((a,b)=>a-b)[1]});}
 for(const n of [1000,5000,10000]){const us=Array.from({length:n},(_,i)=>({id:'u'+i,displayName:'User '+i,userType:'Member',accountEnabled:true}));const an=load('analyze.js','Analyzer',{CaScope:scope,Graph:{ggetAll:async url=>url.startsWith('/users?')?us:[],gpost:async()=>({value:[]})}});const collected=await an.collect(Array.from({length:100},(_,i)=>asVm(policy(undefined,'p'+i))),'all',()=>{});const t=performance.now();an.evaluate(collected.lookup,collected.users,collected.ctx);output.benchmarks.push({module:'Analyzer.evaluate',users:n,policies:100,ms:Math.round((performance.now()-t)*10)/10,runs:1});}
 fs.writeFileSync(__dirname+'/p1-review-results.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
