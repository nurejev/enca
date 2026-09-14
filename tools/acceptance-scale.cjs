// Synthetic scale evidence; no tenant access. Cases run in separate processes.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cases = [ ['paging',250000], ['paging',25000], ['coverage',50000,40], ['coverage',250000,8], ['impact',100000], ['impact',1000000] ];
function load(file, name, extra={}) {
 const box = vm.createContext({console,URL,Map,Set,...extra});
 vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8')+'\nglobalThis.result='+name,box);
 return box.result;
}
async function run(kind,n,p) {
 let result, input, calls=0;
 const t0=performance.now();
 if(kind==='paging') {
  class Msal {async initialize(){} async handleRedirectPromise(){return null;}async acquireTokenSilent(){return {accessToken:'fixture'};}}
  const graph=load('graph.js','Graph',{AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:[],graphBase:'https://graph.microsoft.com/v1.0'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},fetch:async()=>{
   const start=calls++*999, end=Math.min(n,start+999);
   return {ok:true,status:200,headers:{get:()=>null},json:async()=>({value:Array.from({length:end-start},(_,i)=>({id:'u'+(start+i)})),...(end<n?{'@odata.nextLink':'/users?page='+calls}:{})})};
  },setTimeout,clearTimeout});
  await graph.init(); result=await graph.readPages('/users');
  if(result.items.length!==n||!result.complete||result.pages!==Math.ceil(n/999))throw Error('Incomplete pagination');
  return {kind,n,requests:calls,complete:result.complete,elapsedMs:Math.round(performance.now()-t0),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024)};
 }
 const scope=load('cascope.js','CaScope');
 if(kind==='coverage') {
  const users=Array.from({length:n},(_,i)=>({id:'u'+i,displayName:'User '+i,userType:'Member',accountEnabled:true}));
  const raws=Array.from({length:p},(_,i)=>({raw:{id:'p'+i,displayName:'Policy '+i,state:'enabled',conditions:{users:{includeUsers:['All']},applications:{includeApplications:['All']}},grantControls:{operator:'OR',builtInControls:['mfa']}},grant:{controls:['mfa'],op:'OR'}}));
  const a=load('analyze.js','Analyzer',{CaScope:scope,Graph:{ggetAll:async u=>u.startsWith('/users?')?users:[],gpost:async()=>({value:[]})}});
  input=await a.collect(raws,'all',()=>{});
  const start=performance.now();result=a.evaluate(input.lookup,input.users,input.ctx);
  if(result.length!==n)throw Error('Missing coverage rows');
  return {kind,n,policies:p,cells:n*p,evaluationMs:Math.round(performance.now()-start),elapsedMs:Math.round(performance.now()-t0),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024)};
 }
 const engine=load('reportimpact.js','ReportImpact');
 const kinds=['reportOnlySuccess','reportOnlyFailure','reportOnlyInterrupted','reportOnlyNotApplied'];
 const apps=kinds.map(result=>[{id:'p',displayName:'Policy',result,enforcedGrantControls:['Mfa']}]);
 input=Array.from({length:n},(_,i)=>({id:'s'+i,createdDateTime:'2026-09-14T10:00:00Z',userPrincipalName:'u'+(i%50000)+'@fixture.invalid',appDisplayName:'App '+(i%20),appliedConditionalAccessPolicies:apps[i%4],status:{errorCode:0},deviceDetail:{isCompliant:true}}));
 const start=performance.now();result=engine.build(input,[{id:'p',name:'Policy'}]);
 if(result.records!==n||result.policies.length!==1)throw Error('Missing log records');
 return {kind,n,distinctInputUsers:Math.min(n,50000),evaluationMs:Math.round(performance.now()-start),outputUsers:result.users.length,elapsedMs:Math.round(performance.now()-t0),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024)};
}
(async()=>{
 if(process.argv[2]==='--case'){console.log(JSON.stringify(await run(process.argv[3],+process.argv[4],+process.argv[5])));return;}
 const results=[];
 for(const c of cases){const r=JSON.parse(execFileSync(process.execPath,['--max-old-space-size=4096',__filename,'--case',...c.map(String)],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}));results.push(r);console.error(JSON.stringify(r));}
 console.log(JSON.stringify({fixture:true,platform:process.platform,arch:process.arch,node:process.version,cases:results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
