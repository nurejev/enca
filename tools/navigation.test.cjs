const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const start=app.indexOf('  function resumeToolTab(id) {'),end=app.indexOf('  function toolTabsSeg(',start);
function harness({open=true,remembered='impact',hidden=false}={}){
 const calls=[];
 const ctx=vm.createContext({TAB_HOSTS:{signins:{tile:'toolSignins',tabs:[{key:'impact',open:()=>calls.push('impact'),hidden}]}},openTabs:open?['toolSignins']:[],lastHostTab:new Map([['toolSignins',remembered]]),tabShown:t=>!t.hidden,$:id=>({click:()=>calls.push(id)})});
 vm.runInContext(app.slice(start,end),ctx);return {run:id=>ctx.resumeToolTab(id),calls};
}
test('existing workspace tab resumes the remembered subtab',()=>{const h=harness();h.run('toolSignins');assert.deepEqual(h.calls,['impact']);});
test('hidden production subtab cannot be resumed',()=>{const h=harness({hidden:true});h.run('toolSignins');assert.deepEqual(h.calls,['toolSignins']);});
test('closed or removed subtabs use the normal tool entry',()=>{for(const opts of [{open:false},{remembered:'removed'}]){const h=harness(opts);h.run('toolSignins');assert.deepEqual(h.calls,['toolSignins']);}});
