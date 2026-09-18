// 🧬 Baseline (beta 25393): a catalog may define SEVERAL policies on one CA
// number — the live read of Joey Verlinden's repository keeps them, and
// release 2026.6.1 numbers both the AnyPlatform and the iOS/Android copy
// CA005. The tenant's policies are paired with them one to one, so the
// second row stops reading "not present in this tenant" while its policy
// sits two lines above it.
// No credentials, external packages or network.
// Run: node --test tools/baseline-pairing.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');

const A5 = 'CA005-Global-DataProtection-Office365-AnyPlatform-Unmanaged-RequireAppProtection';
const I5 = 'CA005-Global-DataProtection-Office365-iOSenAndroid-ClientApps-Unmanaged-RequireAppProtection';
const A6 = 'CA006-Global-DataProtection-Office365-AnyPlatform-Browser-Unmanaged-AppEnforceRestrictions';
const I6 = 'CA006-Global-DataProtection-Office365-iOSenAndroid-RequireAppProtection';

const gid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pol = (n, name) => ({ id: gid(n), name, state: 'off', raw: { id: gid(n), displayName: name, state: 'disabled' } });
const plain = (v) => JSON.parse(JSON.stringify(v));

// The catalog as the live read builds it: CA005 and CA006 each carry two
// policies. `extra` replaces the bundled entries for those numbers.
function run(catalogPolicies, tenantNames) {
  const ctx = {};
  vm.createContext(ctx);
  for (const f of ['js/baselineData.js', 'js/baselineJoeyData.js', 'js/baseline.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  }
  vm.runInContext(`
    const keep = BASELINE_JOEY.policies.filter((p) => p.num !== 5 && p.num !== 6);
    BASELINE_JOEY.policies = keep.concat(${JSON.stringify(catalogPolicies)});
    globalThis.__R = Baseline.compare(${JSON.stringify(tenantNames.map((n, i) => pol(i + 1, n)))}, 'joey');
  `, ctx);
  return plain(ctx.__R);
}

const CAT_BOTH = [
  { num: 5, persona: '🌐 Global', name: A5 },
  { num: 5, persona: '🌐 Global', name: I5 },
  { num: 6, persona: '🌐 Global', name: A6 },
  { num: 6, persona: '🌐 Global', name: I6 },
];
const rowsFor = (res, num) => res.rows.filter((r) => r.num === num && r.baseline);
const nameOf = (r) => (r.tenant && r.tenant.name) || null;

test('two baseline policies on one number are paired with the tenant one to one', () => {
  const res = run(CAT_BOTH, [A5, I5, A6, I6]);
  for (const num of [5, 6]) {
    const rows = rowsFor(res, num);
    assert.equal(rows.length, 2, `CA00${num} keeps both catalog rows`);
    assert.equal(rows.filter((r) => r.status === 'missing').length, 0,
      `neither CA00${num} row reports missing — both policies are in the tenant`);
    for (const r of rows) assert.equal(nameOf(r), r.baseline.name, 'each row matched its own policy');
  }
});

test('the pairing does not depend on the order the tenant returns its policies', () => {
  for (const order of [[A5, I5], [I5, A5]]) {
    const res = run(CAT_BOTH, order.concat([A6, I6]));
    const rows = rowsFor(res, 5);
    assert.deepEqual(rows.map((r) => [r.baseline.name, nameOf(r)]).sort(),
      [[A5, A5], [I5, I5]].sort(), `tenant order ${order[0] === A5 ? 'A,I' : 'I,A'}`);
  }
});

test('with two defined and one present, the one that is there matches and only the other is missing', () => {
  const res = run(CAT_BOTH, [I5, A6, I6]);
  const rows = rowsFor(res, 5);
  const there = rows.find((r) => r.baseline.name === I5);
  const gone = rows.find((r) => r.baseline.name === A5);
  assert.equal(nameOf(there), I5, 'the policy the tenant holds is matched to its own catalog row');
  assert.equal(gone.status, 'missing', 'only the policy the tenant does not hold is missing');
  assert.equal(gone.tenant, null);
});

test('a leftover COPY still raises the shared-number warning', () => {
  // one catalog policy on CA005, the tenant holding it twice
  const cat = [{ num: 5, persona: '🌐 Global', name: A5 }];
  const res = run(cat, [A5, A5]);
  const rows = rowsFor(res, 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].duplicates, 2, 'two copies of a number the catalog defines once is still a warning');
});

test('a number the catalog defines twice and the tenant holds twice is NOT a duplicate warning', () => {
  const res = run(CAT_BOTH, [A5, I5, A6, I6]);
  for (const r of rowsFor(res, 5).concat(rowsFor(res, 6))) {
    assert.equal(r.duplicates, 0, 'the catalog accounts for both copies, so nothing is spare');
  }
});

test('a third copy beyond what the catalog defines is still reported', () => {
  const res = run(CAT_BOTH, [A5, I5, A5, A6, I6]);
  const rows = rowsFor(res, 5);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.duplicates === 3), 'three policies on a number the catalog defines twice is a warning');
});

test('coverage counts both policies of a shared number', () => {
  const both = run(CAT_BOTH, [A5, I5, A6, I6]);
  const half = run(CAT_BOTH, [A5, A6]);
  assert.ok(both.covered > half.covered, 'holding both copies covers more of the baseline than holding one');
  assert.equal(both.covered - half.covered, 2, 'exactly the two second copies');
});

test('a numbered policy the catalog does not define is still reported as extra', () => {
  const res = run(CAT_BOTH, [A5, I5, A6, I6, 'CA987-Global-Something-Else']);
  const extra = res.rows.filter((r) => r.status === 'extra');
  assert.equal(extra.length, 1);
  assert.equal(extra[0].num, 987);
});
