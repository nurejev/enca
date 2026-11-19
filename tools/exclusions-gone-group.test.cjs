// T09 CA Exclusion analyzer — an excluded group that is no longer in the
// directory. A Conditional Access policy keeps the object id of a group after
// the group is deleted, and Graph answers the member read for it with
// 404 Request_ResourceNotFound. That is an ANSWER (nobody is excluded through
// it), not an unread group, so the scan must finish and say so — while a read
// that really failed (403, 5xx) still refuses to publish totals.
// No credentials, external packages or network. Run: node --test tools/*.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(extras={}){
  const box={console:{log(){},warn(){},error(){}},Set,Map,URL,Brand:{generatedBy:()=>'ENCA'},...extras};vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root,'js','exclusions.js'),'utf8')+'\n;globalThis.result=Exclusions',box);return box.result;
}
const GONE='602b8033-2beb-4780-a66e-18b4d2ca6995', LIVE='11111111-2222-4333-8444-555555555555';
const pol=(id,name,excludeGroups)=>({id,displayName:name,state:'enabled',conditions:{users:{includeUsers:['All'],excludeGroups},applications:{includeApplications:['All']}},grantControls:{operator:'OR',builtInControls:['mfa']}});
// the text is Graph's own, as ENCA's graphError() words it
const notFound=()=>Object.assign(new Error(`Graph request failed (404): Resource '${GONE}' does not exist or one of its queried reference-property objects are not present. · code: Request_ResourceNotFound`),{status:404});
const members=[{id:'u1',displayName:'Anna',userPrincipalName:'anna@example.com'},{id:'u2',displayName:'Ben',userPrincipalName:'ben@example.com'}];
const graph=(over={})=>({
  ggetAll:async(url)=>{ if(url.includes(GONE)) throw notFound(); return members; },
  gbatch:async()=>({}),
  gpost:async()=>({value:[{id:LIVE,displayName:'CA-Exclude-Live'}]}),   // getByIds does not return the deleted group
  gget:async()=>{ throw notFound(); },                                   // not in the recycle bin either
  ...over});
const scan=async(g)=>{const ex=load({Graph:g});const m=await ex.resolve(ex.collect([pol('p1','CA001',[GONE,LIVE]),pol('p2','CA002',[GONE])]));return {ex,m};};

test('a deleted excluded group does not abort the scan — totals stay complete',async()=>{
  const {ex,m}=await scan(graph());
  const gone=m.entities.find(e=>e.id===GONE), live=m.entities.find(e=>e.id===LIVE);
  assert.equal(gone.gone,true);assert.equal(gone.memberTotal,0);assert.equal(gone.members.length,0);
  assert.equal(live.gone,undefined);assert.equal(live.memberTotal,2);
  const eff=ex.effectiveUsers(m);
  assert.deepEqual(Array.from(eff.users,u=>u.id).sort(),['u1','u2']);   // Array.from: the list is born in the vm realm
  assert.equal(ex.summary(m,eff.users).goneGroups,1);
});

test('a read that FAILED still refuses to publish totals',async()=>{
  for(const status of [403,500]){
    const ex=load({Graph:graph({ggetAll:async()=>{throw Object.assign(new Error(`Graph request failed (${status})`),{status});}})});
    await assert.rejects(ex.resolve(ex.collect([pol('p1','CA001',[LIVE])])),/incomplete/);
  }
});

test('404 is recognised from the message when the error carries no status',async()=>{
  const {m}=await scan(graph({ggetAll:async(url)=>{ if(url.includes(GONE)) throw new Error(notFound().message); return members; }}));
  assert.equal(m.entities.find(e=>e.id===GONE).gone,true);
});

test('a group still in the recycle bin gets its name and deletion date back',async()=>{
  const seen=[];
  const {m}=await scan(graph({gget:async(url)=>{seen.push(url);return {id:GONE,displayName:'CA-Exclude-Old',deletedDateTime:'2026-11-10T08:00:00Z'};}}));
  const gone=m.entities.find(e=>e.id===GONE);
  assert.equal(gone.name,'CA-Exclude-Old');assert.equal(gone.deletedAt,'2026-11-10T08:00:00Z');
  assert.equal(seen.length,1);assert.match(seen[0],new RegExp(`/directory/deletedItems/${GONE}`));
});

test('a group gone for good keeps its id as its name and no deletion date',async()=>{
  const {m}=await scan(graph());
  const gone=m.entities.find(e=>e.id===GONE);
  assert.equal(gone.name,GONE);assert.equal(gone.deletedAt,undefined);
});

test('the risk review, the evidence card and both exports say the group is not in the directory',async()=>{
  const {ex,m}=await scan(graph());
  const eff=ex.effectiveUsers(m);
  const rk=ex.risk(m);
  for(const id of ['p1','p2']){
    const row=rk.rows.find(r=>r.id===id);
    assert.ok(row.flags.some(f=>/not in the directory/i.test(f.text)&&f.level==='medium'),`policy ${id} is flagged`);
  }
  const gone=m.entities.find(e=>e.id===GONE);
  const ev=ex.evidence(m,eff.users,gone.key,'p2','exclusions');
  assert.ok(ev.lines.some(l=>/not in the directory/i.test(l)));
  assert.ok(!ev.actions.some(a=>a.kind==='members'),'no View members on a group that is not there');
  const md=ex.toMd(m,eff.users,'Contoso');
  assert.match(md,/1\*\* excluded group.*not in the directory/i);
  const csvRow=ex.toCsv(m,eff.users).split('\n').find(l=>l.includes(GONE));
  assert.match(csvRow,/"not found"/);
});

test('a scan with no deleted group reports none',async()=>{
  const ex=load({Graph:graph()});
  const m=await ex.resolve(ex.collect([pol('p1','CA001',[LIVE])]));
  const eff=ex.effectiveUsers(m);
  assert.equal(ex.summary(m,eff.users).goneGroups,0);
  assert.ok(!ex.risk(m).rows.some(r=>r.flags.some(f=>/not in the directory/i.test(f.text))));
  assert.doesNotMatch(ex.toMd(m,eff.users,'Contoso'),/not in the directory/i);
});
