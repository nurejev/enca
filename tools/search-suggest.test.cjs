const {test}=require('node:test'),assert=require('node:assert/strict');
const {collect}=require('../js/search-suggest.js');
test('result suggestions match before limiting, including the last identity of 250k',async()=>{
 let pauses=0;
 function* values(){for(let i=0;i<250000;i++)yield 'person'+i+'@example.test';}
 assert.deepEqual(await collect(values(),'person249999',{pause:async()=>{pauses++;}}),['person249999@example.test']);
 assert.ok(pauses>=249);
});
test('suggestions deduplicate, omit missing fields and preserve literal names',async()=>{
 assert.deepEqual(await collect([null,undefined,{},'', ' Alice ', 'ALICE','<script>','O\'Neil',0],''),['Alice','<script>',"O'Neil",'0']);
});
test('stale search stops after yielding rather than publishing an old tenant result',async()=>{
 let stale=false;
 assert.equal(await collect(Array.from({length:4000},(_,i)=>'user'+i),'not present',{stale:()=>stale,pause:async()=>{stale=true;}}),null);
});
test('suggestion limit bounds DOM work without truncating the result dataset',async()=>{
 const rows=Array.from({length:1000},(_,i)=>'user'+i); assert.equal((await collect(rows,'')).length,60);assert.equal(rows.length,1000);
});
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const renderer=app.slice(app.indexOf('  function mdToHtml(md) {'),app.indexOf('  // Show a report on screen'));
const ctx=vm.createContext({esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});vm.runInContext(renderer,ctx);
test('report tables preserve escaped pipe names and keep the correct column count',()=>{
 const html=ctx.mdToHtml('| Name | Result |\n| --- | --- |\n| Finance \\| Legal | Pass |');
 assert.equal((html.match(/<td>/g)||[]).length,2);assert.ok(html.includes('Finance | Legal'));assert.ok(html.includes('class="md-table-scroll"'));assert.ok(html.includes('tabindex="0"'));
});
test('report table wrapper closes before prose and tenant values remain escaped',()=>{
 const html=ctx.mdToHtml('| Name |\n| --- |\n| <img src=x onerror=alert(1)> |\n\nAfter the table');
 assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('</table></div>\n<p>After the table</p>'));
});
