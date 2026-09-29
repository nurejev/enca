const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = app.indexOf('  async function pdpResolveApprovers()');
const code = app.slice(start, app.indexOf('  async function pdpVerify()', start));
async function resolve(response) {
  const pdp = {}; let request;
  const Graph = { gbatch: async requests => { request = requests[0]; return response; } };
  const run = new Function('pdp','Graph','pmbGroupIndex','isDemo','AUTH_CONFIG','pmbRegionsOn', code+';return pdpResolveApprovers();');
  await run(pdp, Graph, () => new Map([['PIM-SG-Approvers', [{id:'ap-1'}]]]), false, {scopes:[]}, () => false);
  return {pdp,request};
}
test('approver reader accepts the Graph.gbatch success wrapper and requests only two users', async () => {
  const {pdp, request} = await resolve({'0':{body:{value:[{id:'u1'},{id:'u2'}]}}});
  assert.equal(pdp.approverMembers['PIM-SG-Approvers'],2);
  assert.equal(request.url,'/groups/ap-1/members/microsoft.graph.user?$select=id&$top=2&$count=true');
});
test('approver reader preserves failed and missing reads as unknown', async () => {
  for (const response of [{},{'0':{error:'Forbidden',status:403}},{'0':{body:{}}}]) {
    assert.equal((await resolve(response)).pdp.approverMembers['PIM-SG-Approvers'],undefined);
  }
});
test('approver reader preserves a successful empty group as zero', async () => {
  assert.equal((await resolve({'0':{body:{value:[]}}})).pdp.approverMembers['PIM-SG-Approvers'],0);
});
