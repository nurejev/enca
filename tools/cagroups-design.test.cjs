// 👥 PIM groups (beta 32611): in the PIM-buddy scope every row shows which
// baseline designs carry the group (S / L / M), and a model without the
// designs hook shows none. Also: every PIM-SG name of the three designs is
// looked up once, so the Design picker narrows without a second read.
// No credentials, external packages or network.
// Run: node --test tools/cagroups-design.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(root, 'js/groupsview.js'), 'utf8') + ';globalThis.GroupsView = GroupsView;', ctx);
const row = (name) => ({ name, status: 'missing', sources: ['PIM framework'], id: null, refs: { include: [], exclude: [] }, refCount: 0, members: null, memberTotal: null, basis: 'pim' });

test('a PIM-SG row carries one badge per design that names it', () => {
  const html = ctx.GroupsView.render({ rows: [row('PIM-SG-M365-Teams')], ctx: { usesOf: () => ['pim'], designsOf: () => [{ id: 'small', short: 'S', label: 'Small business' }, { id: 'multi', short: 'M', label: 'Large · multi-region' }] } }, { filter: 'all', q: '', sel: new Set(), sort: null });
  assert.match(html, /class="cgg-dsg" title="In the Small business design">S</);
  assert.match(html, /class="cgg-dsg" title="In the Large · multi-region design">M</);
  assert.doesNotMatch(html, />L<\/span>/);
});

test('without the designs hook there is no design badge', () => {
  const html = ctx.GroupsView.render({ rows: [row('PIM-SG-M365-Teams')], ctx: { usesOf: () => ['pim'] } }, { filter: 'all', q: '', sel: new Set(), sort: null });
  assert.doesNotMatch(html, /cgg-dsg/);
});

test('the three designs together name more groups than any one of them', () => {
  const c2 = vm.createContext({ console, window: {} });
  for (const f of ['js/pimBaselineData.js', 'js/pimmodules.js', 'js/pimbaseline.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c2);
  vm.runInContext('globalThis.__pb = PIM_BASELINE; globalThis.__pbl = PimBaseline;', c2);
  const ids = Object.keys(c2.__pb.profiles);
  assert.deepEqual(ids, ['small', 'large', 'multi']);
  const sets = ids.map((id) => new Set(c2.__pbl.profile(c2.__pb, id).groups.map((g) => g.name.toLowerCase())));
  const all = new Set(sets.flatMap((s) => [...s]));
  sets.forEach((s) => assert.ok(all.size > s.size));
  assert.ok(sets[0].has('pim-sg-m365-globaladmin') && sets[1].has('pim-sg-m365-globaladmin') && sets[2].has('pim-sg-m365-globaladmin'));
});
