// ⑦ Migrate (beta 33101): a run that stopped after the create is FINISHED on
// the rescan, never migrated again — and the change report says per failed
// row where it stopped, why, and that the archived original is still live.
// LeeuwendaalAdvies, 27 Oct 2026 (v2.0.8): seven of eight groups failed at the
// member copy; the report printed FAILED and nothing else, and a rescan would
// have offered the archived "(migrated 2026-10-27)" groups for a second
// migration — a stacked suffix and a permanent group called "X (migrated …)".
// No credentials, external packages or network.
// Run: node --test tools/cagroups-migrate.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');

function world() {
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, JSON, encodeURIComponent, decodeURIComponent, Date, Math, RegExp,
    localStorage: { getItem: () => null, setItem() {} },
    document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: () => ({ num: null, key: null, label: 'x' }) },
    Graph: { async ggetAll() { return []; }, async gget() { return {}; } } };
  vm.createContext(box);
  const src = ['baselineData.js', 'groupTemplates.js', 'baselineJoeyData.js', 'baseline.js', 'cagroups.js']
    .map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.C = CaGroups;`, box);
  return box.C;
}

const pol = (id, name) => ({ id, name });
const ARCH = 'CAD-SEC-U-DG-ADM (migrated 2026-10-27)';
const archived = () => ({ id: 'old-adm', name: ARCH, roleAssignable: true, memberTotal: 12,
  refs: { include: [pol('p1', 'CA100')], exclude: [pol('p2', 'CA200'), pol('p3', 'CA201')] } });
const live = () => ({ id: 'new-adm', name: 'CAD-SEC-U-DG-ADM', roleAssignable: false, memberTotal: 0, refs: { include: [], exclude: [] } });
const roles = (id) => new Map([[id, { ok: true, active: [], eligible: [] }]]);

test('an archived (migrated …) group whose live counterpart is a plain group is FINISHED, not migrated again', () => {
  const C = world();
  const plan = C.migratePlan([archived(), live()], { roles: roles('old-adm'), rmauName: 'CAB-SEC-RMAU-CA-Exclusions' });
  assert.equal(plan.eligible.length, 1, 'one item: the finish');
  const x = plan.eligible[0];
  assert.equal(x.resume, true);
  assert.equal(x.id, 'old-adm', 'the item is keyed by the ARCHIVED id — that is what the members and policies hang off');
  assert.equal(x.newId, 'new-adm');
  assert.equal(x.name, 'CAD-SEC-U-DG-ADM', 'the live name, so the run writes to the live group');
  assert.equal(x.archiveName, ARCH, 'the archive name is the one it already has — no second suffix');
  assert.ok(!x.archiveName.includes('(migrated 2026-10-27) (migrated'), 'never stacked');
  const keys = x.steps.map((s) => s.key);
  assert.ok(!keys.includes('rename') && !keys.includes('create'), `no rename, no create: ${keys}`);
  assert.equal(keys.join(','), 'resume,members,addInc,addExc,delInc,delExc,rmau');
  assert.equal(x.nRef, 3);
  assert.equal(x.memberTotal, 12, 'the members to copy are the archived group’s');
  // the plain live group itself is skipped as before — it is not the thing to convert
  const skippedLive = plan.skipped.find((s) => s.id === 'new-adm');
  assert.ok(skippedLive && /Already a plain group/.test(skippedLive.reason));
});

test('a scoped plan still finds the counterpart through allRows', () => {
  const C = world();
  const plan = C.migratePlan([archived()], { roles: roles('old-adm'), allRows: [archived(), live()] });
  assert.equal(plan.eligible.length, 1);
  assert.equal(plan.eligible[0].resume, true);
});

test('an archived group with no live counterpart is refused — a migration would stack the suffix', () => {
  const C = world();
  const plan = C.migratePlan([archived()], { roles: roles('old-adm') });
  assert.equal(plan.eligible.length, 0);
  assert.match(plan.skipped[0].reason, /no live “CAD-SEC-U-DG-ADM” exists/);
  assert.match(plan.skipped[0].reason, /stack a second suffix/);
});

test('an archived group whose live counterpart is role-assignable too is refused and points at the live one', () => {
  const C = world();
  const l = { ...live(), roleAssignable: true };
  const plan = C.migratePlan([archived(), l], { roles: new Map([['old-adm', { ok: true, active: [], eligible: [] }], ['new-adm', { ok: true, active: [], eligible: [] }]]) });
  const arch = plan.skipped.find((s) => s.id === 'old-adm');
  assert.ok(arch && /live “CAD-SEC-U-DG-ADM” is role-assignable itself/.test(arch.reason));
  assert.ok(plan.eligible.some((x) => x.id === 'new-adm' && !x.resume), 'the live role-assignable group is the one offered');
});

test('a legacy-suffixed archive is refused; a plain archive says delete it; a role-holding archive says deal with the role', () => {
  const C = world();
  const legacy = { ...archived(), name: 'CAD-SEC-U-DG-ADM (legacy 2026-08-04)' };
  let plan = C.migratePlan([legacy, live()], { roles: roles('old-adm') });
  assert.equal(plan.eligible.length, 0, 'only a (migrated …) archive can be finished');
  const plain = { ...archived(), roleAssignable: false };
  plan = C.migratePlan([plain, live()], { roles: roles('old-adm') });
  assert.match(plan.skipped.find((s) => s.id === 'old-adm').reason, /already a plain group/);
  plan = C.migratePlan([archived(), live()], { roles: new Map([['old-adm', { ok: true, active: ['Groups Administrator'], eligible: [] }]]) });
  assert.match(plan.skipped.find((s) => s.id === 'old-adm').reason, /holds a directory role \(Groups Administrator\)/);
});

test('the ordinary plan is unchanged for a live role-assignable group', () => {
  const C = world();
  const row = { id: 'g1', name: 'CAD-SEC-U-DG-INT', roleAssignable: true, memberTotal: 3, refs: { include: [], exclude: [pol('p', 'x')] } };
  const plan = C.migratePlan([row], { roles: roles('g1') });
  assert.equal(plan.eligible.length, 1);
  assert.equal(plan.eligible[0].resume, undefined);
  assert.equal(plan.eligible[0].steps.map((s) => s.key).join(','), 'rename,create,members,addExc,delExc,rmau');
  assert.match(plan.eligible[0].archiveName, /^CAD-SEC-U-DG-INT \(migrated \d{4}-\d{2}-\d{2}\)$/);
});

// ---- the report ----
const RESULTS = [
  { name: 'CAD-SEC-U-DG-ADM', ok: false, newId: 'e1f85baf', oldId: 'old-adm', archiveName: ARCH, failedAt: 'members', memberTotal: 12, membersMoved: 0,
    error: 'Membership copy incomplete: 12 of 12 failed — anna@contoso.example: Graph request failed (404): Resource \'e1f85baf\' does not exist. The replacement remains staged; policy references were not changed.',
    state: 'The new plain group exists with 0 of 12 members; every policy still points at the OLD group (CAD-SEC-U-DG-ADM (migrated 2026-10-27)), so nobody is uncovered — do NOT delete the archived group.',
    membersFailed: [{ name: 'anna@contoso.example', error: 'Graph request failed (404): Resource does not exist' }],
    steps: [{ k: 'rename', label: 'Rename the old group aside', s: 'done', note: 'now named ' + ARCH }, { k: 'create', label: 'Create the plain replacement', s: 'done', note: 'CAD-SEC-U-DG-ADM (e1f85baf)' }, { k: 'members', label: 'Copy the members', s: 'failed', note: 'x' }] },
  { name: 'CAD-SEC-U-DG-EXT', ok: true, newId: '2945ca10', membersMoved: 0, memberTotal: 0, refsMoved: 0, nesting: 'n/a', inAu: false, archiveName: 'CAD-SEC-U-DG-EXT (migrated 2026-10-27)', steps: [] },
  { name: 'CAD-SEC-U-DG-GLO', ok: false, stopped: true, error: 'stopped before this group — nothing changed for it', steps: [], state: 'Nothing changed.' },
];

test('the report says where a row failed, why, and that the archived original is still live', () => {
  const C = world();
  const md = C.migrateReport({ skipped: [] }, RESULTS, { tenant: 'LeeuwendaalAdvies', auName: 'CAB-SEC-RMAU-CA-Exclusions', build: 'v2.0.9-beta.1' });
  assert.match(md, /\*\*1 migrated\*\* · \*\*2 failed\*\* \(1 not reached — stopped\)/);
  assert.match(md, /\| CAD-SEC-U-DG-ADM \| FAILED at: Copy the members \| e1f85baf \| 0\/12 \| — \|/, 'the table names the step and the partial member count');
  assert.match(md, /\| CAD-SEC-U-DG-GLO \| not reached \(stopped\) \| — \|/);
  assert.match(md, /\| CAD-SEC-U-DG-EXT \| migrated \| 2945ca10 \| 0\/0 \| 0 \| allowed \(not requested\) \|/);
  assert.match(md, /## Failed \(1\)/, 'a stopped row is not a failure');
  assert.match(md, /still the live group/);
  assert.match(md, /Do not delete it and do not take it out of its policies/);
  assert.match(md, /### CAD-SEC-U-DG-ADM/);
  assert.match(md, /\*\*Failed at:\*\* Copy the members — Membership copy incomplete: 12 of 12 failed — anna@contoso.example: Graph request failed \(404\)/);
  assert.match(md, /\*\*Where things stand:\*\* The new plain group exists with 0 of 12 members/);
  assert.match(md, /\*\*Archived original:\*\* `CAD-SEC-U-DG-ADM \(migrated 2026-10-27\)` \(old-adm\)/);
  assert.match(md, /\*\*New group:\*\* `CAD-SEC-U-DG-ADM` \(e1f85baf\) — 0 of 12 members copied/);
  assert.match(md, /\*\*Members that did not copy:\*\* anna@contoso.example/);
  assert.match(md, /\*\*Steps:\*\* ✓ Rename the old group aside \(now named CAD-SEC-U-DG-ADM \(migrated 2026-10-27\)\) · ✓ Create the plain replacement \(CAD-SEC-U-DG-ADM \(e1f85baf\)\) · ✗ Copy the members/);
  // next steps: the failed rows come first, deletion is for the migrated rows only
  const next = md.slice(md.indexOf('## What to do next'));
  assert.match(next, /^1\. \*\*Finish or undo the 1 failed group first\*\*/m);
  assert.match(next, /2\. Check the members/);
  assert.match(next, /3\. \*\*1 group is not in the restricted AU yet\*\* — CAD-SEC-U-DG-EXT/);
  assert.match(next, /4\. Delete the archived `\(migrated …\)` groups \*\*of the migrated rows only\*\*/);
  assert.match(next, /leave them unticked/);
  assert.match(next, /archived groups of the migrated rows keep their members/);
});

test('a report with no failures reads as before, and one with nothing migrated says so', () => {
  const C = world();
  const okOnly = RESULTS.filter((r) => r.ok);
  let md = C.migrateReport({ skipped: [] }, okOnly, { tenant: 't' });
  assert.match(md, /\*\*1 migrated\*\* · \*\*0 failed\*\*/);
  assert.ok(!/## Failed/.test(md));
  assert.match(md, /^1\. Check the members/m);
  assert.match(md, /^3\. Delete the archived `\(migrated …\)` groups \*\*of the migrated rows only\*\* from/m);
  assert.ok(!/leave them unticked/.test(md));
  md = C.migrateReport({ skipped: [] }, RESULTS.filter((r) => !r.ok), { tenant: 't' });
  assert.match(md, /\*\*0 migrated\*\* · \*\*2 failed\*\*/);
  assert.match(md, /^1\. \*\*Finish or undo the 1 failed group first\*\*/m);
  assert.ok(!/Delete the archived/.test(md), 'nothing to delete when nothing migrated');
  assert.match(md, /Nothing was migrated: every archived group is still the live one/);
});

test('a finished (resumed) row reads as finished and keeps its nesting as it was', () => {
  const C = world();
  const md = C.migrateReport({ skipped: [] }, [{ name: 'CAD-SEC-U-DG-ADM', ok: true, resumed: true, newId: 'new-adm', membersMoved: 12, memberTotal: 12, refsMoved: 3, nesting: 'kept', inAu: true, steps: [] }], { tenant: 't' });
  assert.match(md, /\| CAD-SEC-U-DG-ADM \| finished \(earlier run\) \| new-adm \| 12\/12 \| 3 \| as it was \(finished an earlier run\) \|/);
});

test('a pipe or a newline in a name or an error cannot break the table', () => {
  const C = world();
  const md = C.migrateReport({ skipped: [] }, [{ name: 'A | B', ok: false, failedAt: 'members', error: 'line one\nline two | three', steps: [{ k: 'members', label: 'Copy the members', s: 'failed' }], state: 's' }], { tenant: 't' });
  assert.match(md, /\| A \\\| B \| FAILED at: Copy the members \|/);
  assert.match(md, /line one line two \\\| three/);
});

// ---- the write after the create (js/app.js, sliced like tools/workpackages.test.cjs) ----
function copyWorld({ notFoundTimes = 0, forbid = false } = {}) {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const posts = [], gets = [], waits = [];
  let left = notFoundTimes;
  const box = vm.createContext({ console: { log() {}, warn() {}, error() {} }, AUTH_CONFIG: { scopes: [] }, MEMBER_MOVE_SCOPES: [], Date, Math,
    setTimeout: (fn, ms) => { waits.push(ms); fn(); }, Set, Map,
    Graph: {
      async ggetAll(url) { if (/old\/members/.test(url)) return [{ id: 'u1', displayName: 'Anna', '@odata.type': '#microsoft.graph.user' }, { id: 'u2', displayName: 'Bob', '@odata.type': '#microsoft.graph.user' }]; return [{ id: 'u1' }, { id: 'u2' }]; },
      async gget(url) { gets.push(url); if (left > 0) { left--; throw new Error("Graph request failed (404): Resource 'new' does not exist or one of its queried reference-property objects are not present. · code: Request_ResourceNotFound"); } return { id: 'new' }; },
      async gpost(url) { posts.push(url); if (forbid) throw new Error('Graph request failed (403): Insufficient privileges to complete the operation. · code: Authorization_RequestDenied'); if (left > 0) { left--; throw new Error("Graph request failed (404): Resource 'new' does not exist or one of its queried reference-property objects are not present. · code: Request_ResourceNotFound"); } return {}; },
    } });
  const start = app.indexOf('  async function moveGroupMembers('), end = app.indexOf('  // ---- housekeeping:', start);
  vm.runInContext(app.slice(start, end) + '\nglobalThis.move = moveGroupMembers; globalThis.settled = settled; globalThis.awaitGroup = awaitGroup;', box);
  return { box, posts, gets, waits };
}

test('a member add that answers "does not exist" is retried and lands; the waits are the settle schedule', async () => {
  const w = copyWorld({ notFoundTimes: 2 });
  const log = await w.box.move('old', 'new');
  assert.equal(log.moved, 2); assert.equal(log.total, 2); assert.equal(log.failed.length, 0);
  assert.equal(w.posts.length, 4, 'two refusals, then both members');
  assert.equal(w.waits.join(','), '1500,3000');
});

test('a real refusal is final at once and the error names the first member and why; the log travels with the error', async () => {
  const w = copyWorld({ forbid: true });
  await assert.rejects(w.box.move('old', 'new'), (e) => {
    assert.match(e.message, /Membership copy incomplete: 2 of 2 failed — Anna: Graph request failed \(403\)/);
    assert.equal(e.log.moved, 0); assert.equal(e.log.total, 2); assert.equal(e.log.failed.length, 2);
    return true;
  });
  assert.equal(w.waits.length, 0, 'a 403 is never waited on');
});

test('the settle gives up after the schedule and awaitGroup reports the seconds it waited', async () => {
  const w = copyWorld({ notFoundTimes: 99 });
  await assert.rejects(w.box.settled(() => w.box.Graph.gget('/groups/new')), /\(404\)/);
  assert.equal(w.waits.join(','), '1500,3000,6000,10000', 'four waits, then the fifth answer is final');
  const w2 = copyWorld({ notFoundTimes: 1 });
  const secs = await w2.box.awaitGroup('new');
  assert.equal(typeof secs, 'number');
  assert.equal(w2.gets.length, 2);
});
