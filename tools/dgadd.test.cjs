// 🚀 Add to deploy groups (beta 33207) — DgAdd.plan. No credentials or network.
// Run: node --test tools/dgadd.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/dgadd.js'), 'utf8') + ';globalThis.D = DgAdd;', ctx);
const D = ctx.D;
const U = (id, o = {}) => D.userFacts({ id, displayName: id, userPrincipalName: id + '@x.com', accountEnabled: true, ...o });
const G = (id, o = {}) => D.groupFacts({ id, displayName: id, groupTypes: [], securityEnabled: true, ...o });
const T = (key, o = {}) => ({ key, name: 'CAD-SEC-U-DG-' + key, id: 'dg-' + key, dynamic: false, roleAssignable: false, nesting: 'unknown', members: new Set(), ...o });

test('presets: GLO + INT and GLO + EXT', () => {
  assert.deepEqual([...D.PRESETS.find((p) => p.key === 'GLO+INT').keys], ['GLO', 'INT']);
  assert.deepEqual([...D.PRESETS.find((p) => p.key === 'GLO+EXT').keys], ['GLO', 'EXT']);
});
test('parse and kindOf', () => {
  assert.deepEqual([...D.parse('a@x.com; SG-Pilot\nA@X.COM, "b@x.com"')], ['a@x.com', 'SG-Pilot', 'b@x.com']);
  assert.equal(D.kindOf('a@x.com'), 'upn');
  assert.equal(D.kindOf('8b0c1d2e-0000-4000-8000-000000000001'), 'id');
  assert.equal(D.kindOf('SG-Pilot'), 'name');
});
test('a user goes into every target once; already-in is kept', () => {
  const p = D.plan([{ q: 'a', obj: U('a') }, { q: 'b', obj: U('b') }], [T('GLO', { members: new Set(['b']) }), T('INT')], {});
  assert.equal(p.writes.length, 3);
  assert.equal(p.rows[1].cells.GLO.state, 'same');
  assert.deepEqual({ ...p.counts.perTarget }, { GLO: 1, INT: 2 });
});
test('the same user by alias and UPN is added once', () => {
  const p = D.plan([{ q: 'a', obj: U('a') }, { q: 'a2', obj: U('a') }], [T('GLO')], {});
  assert.equal(p.writes.length, 1); assert.equal(p.rows[1].cells.GLO.state, 'same');
});
test('not found entries write nothing; missing target writes nothing', () => {
  const p = D.plan([{ q: 'zz', obj: null, err: 'no user' }, { q: 'a', obj: U('a') }], [T('GLO'), T('EXT', { id: null })], {});
  assert.equal(p.writes.length, 1); assert.equal(p.counts.notFound, 1); assert.equal(p.rows[1].cells.EXT.state, 'missing');
});
test('nest: role-assignable, M365 and dynamic targets block; plain target adds the group', () => {
  const p = D.plan([{ q: 'g', obj: G('g') }, { q: 'm', obj: G('m', { groupTypes: ['Unified'] }) }], [T('GLO', { roleAssignable: true }), T('INT'), T('EXT', { dynamic: true })], { groupMode: 'nest' });
  assert.equal(p.rows[0].cells.GLO.state, 'blocked'); assert.match(p.rows[0].cells.GLO.reason, /role-assignable/);
  assert.equal(p.rows[0].cells.INT.state, 'add'); assert.equal(p.rows[0].cells.EXT.state, 'blocked');
  assert.equal(p.rows[1].cells.INT.state, 'blocked'); assert.match(p.rows[1].cells.INT.reason, /Microsoft 365/);
  assert.equal(p.writes.length, 1); assert.equal(p.writes[0].kind, 'group');
});
test('nest: disableNesting blocks unless allowed; allowed → unlock that target once', () => {
  const tg = [T('GLO', { nesting: 'disabled' }), T('INT')];
  const e = [{ q: 'g', obj: G('g') }, { q: 'h', obj: G('h') }];
  const off = D.plan(e, tg, { groupMode: 'nest' });
  assert.equal(off.rows[0].cells.GLO.state, 'blocked'); assert.equal(off.unlock.length, 0);
  const on = D.plan(e, tg, { groupMode: 'nest', allowNesting: true });
  assert.equal(on.rows[0].cells.GLO.state, 'add'); assert.equal(on.rows[0].cells.GLO.unlock, true);
  assert.equal(on.unlock.length, 1); assert.equal(on.unlock[0].key, 'GLO'); assert.equal(on.writes.length, 4);
});
test('users are never blocked by disableNesting or role-assignable', () => {
  const p = D.plan([{ q: 'a', obj: U('a') }], [T('GLO', { nesting: 'disabled', roleAssignable: true })], {});
  assert.equal(p.rows[0].cells.GLO.state, 'add'); assert.equal(p.unlock.length, 0);
});
test('expand: the group users each, de-duplicated with plain entries, disabled skipped', () => {
  const users = [U('a'), U('b'), U('c', { accountEnabled: false })];
  const p = D.plan([{ q: 'a', obj: U('a') }, { q: 'g', obj: G('g', { isAssignableToRole: false }), users }], [T('GLO', { roleAssignable: true, members: new Set(['b']) })], { groupMode: 'expand', skipDisabled: true });
  const c = p.rows[1].cells.GLO;
  assert.equal(c.state, 'same'); assert.equal(c.n, 0); assert.equal(c.same, 2); assert.equal(c.skip, 1);
  assert.equal(p.writes.length, 1);
  const q = D.plan([{ q: 'g', obj: G('g'), users }], [T('INT')], { groupMode: 'expand', skipDisabled: false });
  assert.equal(q.rows[0].cells.INT.n, 3); assert.ok(q.writes.every((w) => w.kind === 'user'));
});
test('disabled user skipped only when asked', () => {
  const e = [{ q: 'a', obj: U('a', { accountEnabled: false }) }];
  assert.equal(D.plan(e, [T('GLO')], { skipDisabled: true }).writes.length, 0);
  assert.equal(D.plan(e, [T('GLO')], { skipDisabled: false }).writes.length, 1);
});
test('undo removes what was added and relocks what was unlocked; report lists both', () => {
  const run = { at: 'x', set: 'GLO+INT', mode: 'nest', done: [{ targetId: 't', targetName: 'DG-GLO', memberId: 'm', memberName: 'Eva', kind: 'user' }], unlocked: [{ id: 't', name: 'DG-GLO' }], failed: [{ targetName: 'DG-INT', memberName: 'Max', kind: 'user', error: 'boom|x' }] };
  const u = D.undoPlan(run);
  assert.equal(u.remove.length, 1); assert.equal(u.relock.length, 1);
  const md = D.report(run, 'devcf');
  assert.match(md, /DG-GLO \| Eva \| user \| added/); assert.match(md, /failed: boom\/x/); assert.match(md, /Nesting switched on: DG-GLO/);
});
