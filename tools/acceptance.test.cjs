const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/graph.js'),'utf8');
class Msal {async initialize(){}async handleRedirectPromise(){return null;}async acquireTokenSilent(){return {accessToken:'fixture'};}}
async function graph(fetch,extra={}) {
 const box=vm.createContext({console,URL,AbortController,AUTH_CONFIG:{clientId:'fixture',authority:'fixture',scopes:[],graphBase:'https://graph.microsoft.com/v1.0'},window:{location:{origin:'http://localhost',pathname:'/'}},msal:{PublicClientApplication:Msal},fetch,setTimeout,clearTimeout,...extra});
 vm.runInContext(source+'\nglobalThis.result=Graph',box);await box.result.init();return box.result;
}
const response=(status,body,headers={})=>({ok:status<400,status,headers:{get:k=>headers[k]||null},json:async()=>body});
for(const status of [401,403,404,429,502,503,504])test(`a failed second page (${status}) preserves explicit incomplete evidence`,async()=>{
 let calls=0;const g=await graph(async()=>++calls===1?response(200,{value:[{id:'first'}],'@odata.nextLink':'/users?page=2'}):response(status,{error:{message:'fixture refusal'}},{'Retry-After':'0'}),{setTimeout:fn=>{queueMicrotask(fn);return 0;},clearTimeout(){}});
 await assert.rejects(g.readPages('/users'),e=>e.partial?.complete===false&&e.partial.items[0].id==='first');
 assert.equal(calls,[429,502,503,504].includes(status)?7:2);
});
test('GET deadline covers the body and cannot publish a header-only response',async()=>{
 let timeout;const g=await graph(async(url,opts)=>({ok:true,status:200,headers:new Headers(),arrayBuffer:()=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))}),{Response,Headers,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){}});
 const run=g.readPages('/users');await new Promise(setImmediate);timeout();await assert.rejects(run,e=>/two minutes/.test(e.message)&&e.partial.complete===false);
});
test('stopping while downloading the GET body does not publish a collection',async()=>{
 const ctl=new AbortController();const g=await graph(async(url,opts)=>({ok:true,status:200,headers:new Headers(),arrayBuffer:()=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))}),{Response,Headers});
 const run=g.readPages('/users',{signal:ctl.signal});await new Promise(setImmediate);ctl.abort();await assert.rejects(run,e=>e.stopped&&e.partial.complete===false);
});
test('missing batch subresponse is an error instead of empty data',async()=>{
 const g=await graph(async()=>response(200,{responses:[]}));const result=await g.gbatch([{id:'x',url:'/users'}]);assert.ok(result.x.error);assert.equal(result.x.body,undefined);
});
test('streamed analysis preserves global order and full results across transfer chunks',async()=>{
 const messages=[],dir=path.join(__dirname,'../js');let box;
 box=vm.createContext({console,URL,Map,Set,self:{location:{href:'http://localhost/js/analysis-worker.js?v=fixture'},postMessage:m=>messages.push(m)},importScripts:(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(dir,f.split('?')[0]),'utf8'),box))});
 vm.runInContext(fs.readFileSync(path.join(dir,'analysis-worker.js'),'utf8'),box);
 const users=Array.from({length:1001},(_,i)=>({id:'u'+i,displayName:'User '+String(1000-i).padStart(4,'0'),userType:'Member',accountEnabled:true}));
 // Empty policy lookup isolates ordering/transport from the evaluator's own tests.
 box.self.onmessage({data:{kind:'analyze',stream:true,args:{lookup:[],ctx:{},total:users.length}}});
 let offset=0,done=false;const rows=[];
 while(messages.length){const m=messages.shift();if(m.requestUsers){const chunk=users.slice(offset,offset+200);offset+=chunk.length;box.self.onmessage({data:{usersChunk:chunk,inputDone:offset>=users.length}});}else if(m.resultChunk){assert.ok(m.resultChunk.length<=500);rows.push(...m.resultChunk);box.self.onmessage({data:{nextResult:true}});}else if(m.resultDone)done=true;else if(m.error)throw Error(m.error);}
 assert.ok(done);assert.equal(rows.length,1001);assert.equal(new Set(rows.map(r=>r.id)).size,1001);assert.deepEqual(rows.map(r=>r.user),users.map(u=>u.displayName).sort());
});
