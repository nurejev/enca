// 👥 CA groups 6.4.0 (beta 33206): nest a group into a deployment group —
// GroupsView.nestCheck and the drawer switch. No credentials or network.
// Run: node --test tools/cg-nest.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/groupsview.js'), 'utf8') + ';globalThis.GV = GroupsView;', ctx);
const GV = ctx.GV;
const dg = (o = {}) => ({ id: 'dg1', name: 'CAD-SEC-U-DG-INT', members: [], nestedGroups: [], ...o });
const sg = (o = {}) => ({ id: 'g1', displayName: 'SG-Pilot-Finance', groupTypes: [], securityEnabled: true, mailEnabled: false, ...o });

test('a plain security group nests into a deploy group', () => {
  const r = GV.nestCheck(dg(), sg());
  assert.equal(r.ok, true); assert.equal(r.warnings.length, 0);
});
test('Microsoft 365 group and distribution list are refused', () => {
  assert.match(GV.nestCheck(dg(), sg({ groupTypes: ['Unified'] })).reason, /Microsoft 365/);
  assert.match(GV.nestCheck(dg(), sg({ securityEnabled: false, mailEnabled: true })).reason, /not a security group/);
});
test('itself and already nested are refused', () => {
  assert.match(GV.nestCheck(dg(), sg({ id: 'dg1' })).reason, /itself/);
  assert.match(GV.nestCheck(dg({ nestedGroups: [{ id: 'g1', name: 'x' }] }), sg()).reason, /already nested/);
  assert.match(GV.nestCheck(dg({ children: [{ id: 'g1', name: 'x' }] }), sg()).reason, /already nested/);
});
test('target role-assignable, dynamic or nesting-disabled is refused', () => {
  assert.match(GV.nestCheck(dg({ roleAssignable: true }), sg()).reason, /role-assignable/);
  assert.match(GV.nestCheck(dg({ dynamic: true }), sg()).reason, /dynamic/);
  assert.match(GV.nestCheck(dg({ nesting: 'disabled' }), sg()).reason, /disabled/);
});
test('archived migration leftover is refused', () => {
  assert.match(GV.nestCheck(dg(), sg({ displayName: 'SG-Pilot (migrated 2026-11-08)' })).reason, /archived/);
});
test('dynamic, mail-enabled and another DG nest with warnings', () => {
  const r = GV.nestCheck(dg(), sg({ displayName: 'CAD-SEC-U-DG-GLO', groupTypes: ['DynamicMembership'], mailEnabled: true }));
  assert.equal(r.ok, true); assert.equal(r.warnings.length, 3);
});
test('a group missing from the tenant cannot take a member', () => {
  assert.equal(GV.nestCheck(dg({ id: null }), sg()).ok, false);
});

function drawer(name, addKind) {
  const r = dg({ name, members: [] });
  const model = { rows: [r], ctx: { cat: null, prot: null, stateOf: () => '', seqOf: () => '', nameOf: () => '' }, policies: [] };
  return GV.render(model, { filter: 'all', q: '', sel: new Set(), open: name, drTab: 'members', addKind });
}
test('deploy group shows the User | Group switch and the nest box', () => {
  const h = drawer('CAD-SEC-U-DG-INT', 'group');
  assert.match(h, /data-cgg-addkind="group"/); assert.match(h, /id="cgNestName"/); assert.doesNotMatch(h, /id="cgAddUser"/);
  assert.match(drawer('CAD-SEC-U-DG-INT', 'user'), /id="cgAddUser"/);
});
test('an exclusion group gets no group switch', () => {
  const h = drawer('CAB-SEC-U-CA003-Exclusion', 'group');
  assert.doesNotMatch(h, /data-cgg-addkind/); assert.doesNotMatch(h, /cgNestName/); assert.match(h, /id="cgAddUser"/);
});
