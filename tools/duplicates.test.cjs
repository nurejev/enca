// 👯 Duplicates (beta 25387): the same policy twice — detection, the merge
// plan and the run. No credentials, external packages or network.
// Run: node --test tools/duplicates.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');

const N004 = 'CA004-Global-IdentityProtection-AnyApp-AnyPlatform-AuthenticationFlows';
const EXCL = ['ex-policy', 'ex-breakglass'];
const STATE = { off: 'disabled', on: 'enabled', report: 'enabledForReportingButNotEnforced' };

// A policy the way T01 holds it: the view model with its raw underneath.
function pol(id, seq, name, state, users, extra = {}) {
  const raw = {
    id, displayName: name, state: STATE[state] || state, createdDateTime: extra.created || '2026-06-03T10:00:00Z',
    conditions: { clientAppTypes: ['all'], applications: { includeApplications: ['All'] },
      users: { includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [], ...users } },
    grantControls: extra.grant || { operator: 'OR', builtInControls: ['mfa'] },
    sessionControls: extra.session || null,
  };
  if (extra.conditions) Object.assign(raw.conditions, extra.conditions);
  return { id, seq, name, state, raw };
}
// Courseware, 17 Sep: one import in Deployment groups mode beside the live policy.
const courseware = () => [
  pol('p19', 'CA019', N004, 'report', { includeUsers: ['All'], excludeGroups: EXCL }),
  pol('p18', 'CA018', N004, 'off', { includeGroups: ['dg-glo'], excludeGroups: EXCL }, { created: '2026-09-17T16:48:00Z' }),
];

function world(opts = {}) {
  const pols = new Map((opts.policies || []).map((p) => [p.id, JSON.parse(JSON.stringify(p.raw))]));
  const calls = [];
  const Graph = {
    async gget(url) { const p = pols.get(url.split('/').pop()); return p ? JSON.parse(JSON.stringify(p)) : {}; },
    async gpatch(url, body) {
      const id = url.split('/').pop();
      calls.push(['patch', id, JSON.parse(JSON.stringify(body))]);
      const p = pols.get(id); if (!p) throw new Error('404');
      if (body.conditions) p.conditions = { ...p.conditions, ...JSON.parse(JSON.stringify(body.conditions)) };
      if (body.state) p.state = body.state;
      return null;
    },
    async gdelete(url) {
      const id = url.split('/').pop();
      calls.push(['delete', id]);
      if (opts.failDelete === id) throw new Error('Graph request failed (403): Insufficient privileges');
      pols.delete(id);
      return null;
    },
  };
  const box = { console: { log() {}, warn() {}, error() {} }, JSON, Set, Map, Date, setTimeout, AUTH_CONFIG: { scopes: [] }, Graph };
  vm.createContext(box);
  for (const f of ['render', 'policy-compare', 'import']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + f + '.js'), 'utf8'), box);
  return { I: vm.runInContext('Importer', box), pols, calls };
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('Courseware: one name, two policies — the live copy is the one to keep', () => {
  const { I } = world();
  const sets = I.duplicates(courseware());
  assert.equal(sets.length, 1);
  const s = sets[0];
  assert.equal(s.verdict, 'assignment', 'only who they reach differs');
  assert.deepEqual(plain(s.members.map((p) => p.seq)), ['CA019', 'CA018'], 'Report-only before Off');
  assert.equal(s.keepId, 'p19');
  assert.deepEqual(plain(s.states), ['Report-only', 'Off']);
  assert.equal(s.num, 4);
});

test('a version in the name is not a duplicate — that is housekeeping', () => {
  const { I } = world();
  const ps = [pol('a', 'CA001', 'CA110-BLOCK-Admins-O365 v1.0', 'off', {}), pol('b', 'CA002', 'CA110-BLOCK-Admins-O365 v3.0', 'on', {})];
  assert.equal(I.duplicates(ps).length, 0);
  assert.equal(I.housekeeping(ps).length, 1, 'it is the older-version case instead');
  // the staging prefix is not part of the name
  const staged = [pol('a', 'CA001', `(NEW)${N004}`, 'off', {}), pol('b', 'CA002', N004, 'report', {})];
  assert.equal(I.duplicates(staged).length, 1);
});

test('the same CA number under two names is a number clash, never a duplicate', () => {
  const { I } = world();
  assert.equal(I.duplicates([pol('a', 'CA001', 'CA004-Global-One', 'off', {}), pol('b', 'CA002', 'CA004-Global-Two', 'off', {})]).length, 0);
});

test('identical copies: nothing to bring across but the state', () => {
  const { I } = world();
  const ps = [pol('a', 'CA032', N004, 'off', { includeRoles: ['r1'] }), pol('b', 'CA033', N004, 'off', { includeRoles: ['r1'] }, { created: '2026-09-17T16:48:00Z' })];
  const [s] = I.duplicates(ps);
  assert.equal(s.verdict, 'identical');
  assert.equal(s.keepId, 'a', 'same state, so the older object is kept');
  const plan = I.mergePlan(s, s.keepId, []);
  assert.equal(plan.adds.length, 0);
  assert.equal(plan.patch, null);
  assert.equal(plan.canRun, true);
  assert.deepEqual(plain(plan.deletes.map((p) => p.seq)), ['CA033']);
});

test('different controls are never merged here', () => {
  const { I } = world();
  const ps = [pol('a', 'CA041', N004, 'on', { includeGroups: ['g'] }, { grant: { operator: 'OR', builtInControls: ['block'] } }),
    pol('b', 'CA042', N004, 'report', { includeGroups: ['g'] })];
  const [s] = I.duplicates(ps);
  assert.equal(s.verdict, 'review');
  assert.match(s.reasons.join(' '), /Grant controls differ/);
  assert.equal(I.mergePlan(s, s.keepId, []).canRun, false);
});

test('a guest scope a merge cannot express is review, not assignment', () => {
  const { I } = world();
  const a = pol('a', 'CA001', N004, 'report', { includeUsers: ['All'] });
  const b = pol('b', 'CA002', N004, 'off', { includeUsers: ['All'] });
  b.raw.conditions.users.includeGuestsOrExternalUsers = { guestOrExternalUserTypes: 'b2bCollaborationGuest', externalTenants: { membershipKind: 'all' } };
  const [s] = I.duplicates([a, b]);
  assert.equal(s.verdict, 'review');
  assert.match(s.reasons.join(' '), /guest, external or workload scope/);
});

test('incomplete details cannot be compared', () => {
  const { I } = world();
  const a = pol('a', 'CA001', N004, 'off', {}), b = pol('b', 'CA002', N004, 'off', {});
  delete b.raw.grantControls; delete b.raw.sessionControls;
  const [s] = I.duplicates([a, b]);
  assert.equal(s.verdict, 'review');
  assert.match(s.reasons.join(' '), /incomplete/);
});

test('the merge plan: what is offered, what a tick writes', () => {
  const { I } = world();
  const [s] = I.duplicates(courseware());
  const offered = I.mergePlan(s, 'p19', []);
  assert.deepEqual(plain(offered.adds.map((a) => a.field)).sort(), ['includeGroups', 'state']);
  assert.equal(offered.adds.find((a) => a.field === 'includeGroups').widens, true);
  assert.equal(offered.patch, null, 'nothing ticked, nothing written');
  const merged = I.mergePlan(s, 'p19', ['p18:includeGroups']);
  assert.deepEqual(plain(merged.patch.conditions.users.includeGroups), ['dg-glo']);
  assert.deepEqual(plain(merged.patch.conditions.users.includeUsers), ['All'], 'the kept policy keeps what it had');
  assert.deepEqual(plain(merged.patch.conditions.users.excludeGroups), EXCL);
  assert.equal(merged.patch.state, undefined);
  const both = I.mergePlan(s, 'p19', ['p18:includeGroups', 'p18:state']);
  assert.equal(both.patch.state, 'disabled');
});

test('the only enforcing copy is never the one deleted', () => {
  const { I } = world();
  const ps = [pol('live', 'CA050', N004, 'on', { includeUsers: ['All'] }), pol('copy', 'CA051', N004, 'off', { includeUsers: ['All'] })];
  const [s] = I.duplicates(ps);
  assert.equal(s.keepId, 'live');
  assert.equal(I.mergePlan(s, 'live', []).canRun, true);
  const wrong = I.mergePlan(s, 'copy', []);
  assert.equal(wrong.canRun, false);
  assert.match(wrong.refusals[0].why, /CA050 is On and the copy you keep \(CA051\) is not/);
  // taking the On state across makes the kept copy the enforcing one
  assert.equal(I.mergePlan(s, 'copy', ['live:state']).canRun, true);
});

test('the run: patch verified, copy deleted, report written', async () => {
  const w = world({ policies: courseware() });
  const [s] = w.I.duplicates(courseware());
  const plan = w.I.mergePlan(s, 'p19', ['p18:includeGroups']);
  const res = await w.I.mergePolicies([plan], { readWaits: { missing: [1], stale: [1] } });
  assert.equal(res[0].ok, true);
  assert.equal(res[0].patched, true);
  assert.deepEqual(plain(res[0].deleted.map((d) => [d.seq, d.ok])), [['CA018', true]]);
  assert.deepEqual(plain(w.pols.get('p19').conditions.users.includeGroups), ['dg-glo']);
  assert.equal(w.pols.has('p18'), false);
  assert.equal(w.calls.filter(([k]) => k === 'delete').length, 1);
  const md = w.I.mergeReport({ tenantName: 'Courseware', plans: [plan], results: res });
  assert.match(md, /Kept:\*\* CA019/);
  assert.match(md, /Brought across\*\* from CA018: 1 group included \(widens/);
  assert.equal(w.I.countLabel(2, "groups included"), "2 groups included");
  assert.match(md, /Deleted:\*\* CA018/);
  assert.match(md, /restorable for 30 days/);
});

test('a refused delete is partly done, not a failure of the whole set', async () => {
  const w = world({ policies: courseware(), failDelete: 'p18' });
  const [s] = w.I.duplicates(courseware());
  const plan = w.I.mergePlan(s, 'p19', []);
  const res = await w.I.mergePolicies([plan], { readWaits: { missing: [1], stale: [1] } });
  assert.equal(res[0].ok, false);
  assert.equal(res[0].patched, false, 'nothing was ticked to bring across');
  assert.match(res[0].error, /CA018: Graph request failed \(403\)/);
  assert.equal(w.pols.has('p18'), true);
});

test('stop leaves the rest untouched', async () => {
  const w = world({ policies: courseware() });
  const [s] = w.I.duplicates(courseware());
  const res = await w.I.mergePolicies([w.I.mergePlan(s, 'p19', [])], { shouldStop: () => true });
  assert.equal(res[0].stopped, true);
  assert.equal(w.calls.length, 0);
  assert.equal(w.pols.has('p18'), true);
});
