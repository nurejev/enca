// 🛡 Security defaults (beta 32706): the verdict, what takes each of its
// protections over, the HTML that says so, the bundled E-Admins and the
// import's landing state. No credentials, external packages or network.
// Run: node --test tools/secdefaults.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');

function box(extra = {}) {
  const b = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, Date, encodeURIComponent, decodeURIComponent, setTimeout,
    localStorage: { getItem: () => null, setItem() {} }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; } },
    AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, ...extra };
  vm.createContext(b);
  return b;
}
function load() {
  const b = box();
  vm.runInContext(`${read('secdefaults.js')}\n;${read('eadminsData.js')}\n;${read('baselineData.js')}\n;globalThis.S = SecDefaults; globalThis.E = E_ADMINS; globalThis.B = BASELINE;`, b);
  return b;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
// view models the way js/model.js shapes the parts coverage reads
const vmOf = (S, raws, names) => raws.map((r) => ({ id: r.id, name: r.displayName, state: { enabled: 'on', disabled: 'off' }[r.state] || 'report', raw: r,
  users: { exc: [...(r.conditions.users.excludeGroups || []).map((g) => `${(names || S.DEMO_NAMES)[g] || g} (group)`)] } }));

test('verdict: on / no P1 / with policies / off and empty / unknown / switched / nothing to say', () => {
  const { S } = load();
  assert.equal(S.verdict({ sd: { enabled: true }, count: 0, caps: { p1: true } }), 'sd-on');
  assert.equal(S.verdict({ sd: { enabled: true }, count: 0, caps: null }), 'sd-on', 'licences not readable is not "no P1"');
  assert.equal(S.verdict({ sd: { enabled: true }, count: 0, caps: { p1: false } }), 'sd-on-nop1');
  assert.equal(S.verdict({ sd: { enabled: true }, count: 12 }), 'sd-on-policies');
  assert.equal(S.verdict({ sd: { enabled: false }, count: 0 }), 'sd-off-empty');
  assert.equal(S.verdict({ sd: { enabled: null, error: '403' }, count: 0 }), 'sd-unknown-empty');
  assert.equal(S.verdict({ sd: { enabled: null }, count: 5 }), null, 'a refused read with policies says nothing');
  assert.equal(S.verdict({ sd: { enabled: false }, count: 5 }), null, 'the normal tenant');
  assert.equal(S.verdict({ sd: { enabled: false }, count: 5, switched: true }), 'sd-switched');
  assert.equal(S.verdict({ sd: null, count: 0 }), null);
});

test('read: isEnabled is the answer; a refusal is null with the reason, never off', async () => {
  const { S } = load();
  assert.equal((await S.read(async () => ({ isEnabled: true }))).enabled, true);
  assert.equal((await S.read(async () => ({ isEnabled: false }))).enabled, false);
  const r = await S.read(async () => { throw new Error('Graph request failed (403): Forbidden'); });
  assert.equal(r.enabled, null);
  assert.match(r.error, /403/);
  assert.equal(S.PATH, '/v1.0/policies/identitySecurityDefaultsEnforcementPolicy');
});

test('coverage on the demo tenant after step ①: four replacing policies, break-glass excluded, ready', () => {
  const { S } = load();
  const cov = S.coverage(vmOf(S, S.demoPolicies()), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  const by = Object.fromEntries(cov.items.map((i) => [i.key, i.policies.map((p) => p.name.slice(0, 5))]));
  assert.deepEqual(plain(by), { mfaAll: ['CA000'], mfaAdmins: ['CA100'], legacy: ['CA002'], deviceCode: ['CA004'], azureMgmt: [] }, 'azureMgmt (32816) is optional: nothing here does it, and the switch does not wait for it');
  assert.equal(cov.toOn.length, 4, 'CA101 (a persona group) and CA200 (internals) are not part of the switch');
  assert.equal(cov.breakGlass.ok, true);
  assert.equal(cov.ready, true);
  assert.deepEqual(plain(cov.strengthOn.map((p) => p.name.slice(0, 5))), ['CA100'], 'the built-in MFA strength on CA000 is MFA, not a flag');
});

test('coverage: the break-glass group gates the switch — members, existence, exclusion', () => {
  const { S } = load();
  const vms = vmOf(S, S.demoPolicies());
  for (const [n, re] of [[0, /no members/], [-1, /does not exist/], [-2, /could not be read/], [null, /being read/]]) {
    const cov = S.coverage(vms, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: n });
    assert.equal(cov.ready, false, `members ${n}`);
    assert.match(cov.breakGlass.why, re);
  }
  const raws = S.demoPolicies();
  raws.find((r) => r.displayName.startsWith('CA002')).conditions.users.excludeGroups = [];
  const cov = S.coverage(vmOf(S, raws), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.equal(cov.ready, false);
  assert.match(cov.breakGlass.why, /CA002/);
});

test('coverage: what is weaker than security defaults does not count', () => {
  const { S } = load();
  const raws = S.demoPolicies();
  const ca000 = raws.find((r) => r.displayName.startsWith('CA000'));
  ca000.conditions.locations = { includeLocations: ['All'], excludeLocations: ['AllTrusted'] };   // MFA only off the trusted network
  let cov = S.coverage(vmOf(S, raws), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.equal(cov.items.find((i) => i.key === 'mfaAll').ok, false);
  assert.equal(cov.ready, false);
  delete ca000.conditions.locations;
  ca000.grantControls = { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] };              // MFA OR a compliant device
  cov = S.coverage(vmOf(S, raws), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.equal(cov.items.find((i) => i.key === 'mfaAll').ok, false);
  ca000.grantControls = { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] };             // MFA AND a compliant device
  cov = S.coverage(vmOf(S, raws), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.equal(cov.items.find((i) => i.key === 'mfaAll').ok, true);
  const ca004 = raws.find((r) => r.displayName.startsWith('CA004'));
  ca004.conditions.authenticationFlows.transferMethods = 'authenticationTransfer, deviceCodeFlow';    // one string, comma-separated
  cov = S.coverage(vmOf(S, raws), { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.equal(cov.items.find((i) => i.key === 'deviceCode').ok, true);
});

test('HTML: every card kind renders, nothing undefined, the switch is disabled until ready', () => {
  const { S } = load();
  const ctx = { sd: { enabled: true, at: Date.now() }, caps: { p1: true, p2: false }, count: 0, tenantName: 'Limon-it',
    catalogs: [{ id: 'limonit', label: 'CloudFellows', release: 'R26.6 · v3.x', total: 99, points: ['a'] }, { id: 'joey', label: 'Joey Verlinden', release: '2026.6.1', total: 36, points: ['b'] }] };
  for (const k of ['sd-on', 'sd-on-nop1', 'sd-off-empty', 'sd-unknown-empty']) {
    const h = S.startCard(k, { ...ctx, sd: { enabled: k === 'sd-off-empty' ? false : k === 'sd-unknown-empty' ? null : true }, caps: k === 'sd-on-nop1' ? { p1: false } : ctx.caps });
    assert.ok(h.includes('sd-card'), k);
    assert.ok(!/undefined|NaN/.test(h), `${k}: ${h.match(/.{40}(undefined|NaN).{20}/)}`);
  }
  assert.ok(S.startCard('sd-on', ctx).includes('data-sdpick="joey"'));
  assert.ok(/data-sdpick="limonit" disabled/.test(S.startCard('sd-on-nop1', { ...ctx, caps: { p1: false } })), 'no P1: deploy off');
  assert.ok(S.startCard('sd-off-empty', { ...ctx, sd: { enabled: false } }).includes('data-sdturnon'));
  const vms = vmOf(S, S.demoPolicies());
  const notReady = S.band('sd-on-policies', S.coverage(vms, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 0 }), { reportOnly: 6 });
  assert.ok(/data-sdswitch disabled/.test(notReady));
  const ready = S.coverage(vms, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.ok(!/data-sdswitch disabled/.test(S.band('sd-on-policies', ready, { reportOnly: 6 })));
  const sw = S.switchBody(ready, { tenantName: 'Limon-it' });
  assert.equal((sw.match(/data-sdpol=/g) || []).length, 4);
  assert.ok(/requires? an authentication strength/.test(sw));
  assert.ok(S.band('sd-switched', null, { switched: { at: Date.now(), policies: [{ id: 'x', name: 'CA000', prev: 'enabledForReportingButNotEnforced' }] } }).includes('data-sdback'));
  assert.ok(S.backBody({ policies: [{ id: 'x', name: 'CA000', prev: 'enabledForReportingButNotEnforced' }] }, {}).includes('Report-only'));
});

test('E-Admins bundle: the catalog\'s six names, every referenced group and strength shipped, nothing of the source policy ids', () => {
  const { E, B } = load();
  const cat = B.policies.filter((p) => p.num >= 1100 && p.num <= 1105).map((p) => p.name).sort();
  assert.deepEqual(plain(E.names().slice().sort()), plain(cat), 'js/eadminsData.js and js/baselineData.js name the same six — re-read cloudfellows.dev when the catalog moves');
  const b = E.bundle();
  assert.equal(b.policies.length, 6);
  const blob = JSON.stringify(b.policies);
  for (const g of b.groups) assert.ok(blob.includes(g.id), `group ${g.displayName} is used`);
  for (const id of blob.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)) {
    assert.ok(b.groups.some((g) => g.id === id) || b.authStrengths.some((x) => x.id === id), `${id} has a file in the bundle`);
  }
  assert.ok(b.policies.every((p) => p.state === 'disabled' && !p.id && !p.createdDateTime));
  assert.ok(!/\(UP\)|\(NEW\)|@odata/.test(blob));
  b.policies[0].displayName = 'mutated';
  assert.notEqual(E.bundle().policies[0].displayName, 'mutated', 'a fresh copy every call');
});

// The importer behind a fake tenant (the shape tools/import-joey.test.cjs uses).
function world(opts = {}) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const groups = new Map(), pols = new Map(), posts = [], patches = [];
  const strip = (o) => Array.isArray(o) ? o.map(strip) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => !k.includes('@odata')).map(([k, v]) => [k, strip(v)])) : o;
  const Graph = {
    async ggetAll(url) {
      const m = /displayName eq '(.*)'/.exec(decodeURIComponent(url));
      if (url.startsWith('/groups') && m) return [...groups.values()].filter((g) => g.displayName.toLowerCase() === m[1].replace(/''/g, "'").toLowerCase());
      return [];
    },
    async gpost(url, body) {
      posts.push([url, structuredClone(body)]);
      if (url === '/directoryObjects/getByIds') return { value: [] };
      if (url === '/identity/conditionalAccess/policies') { const p = { ...structuredClone(body), id: id() }; pols.set(p.id, p); return { id: p.id }; }
      if (url === '/policies/authenticationStrengthPolicies') return { id: id() };
      return {};
    },
    async gpatch(url, body) {
      patches.push([url, structuredClone(body)]);
      if (opts.refuse && body.state === opts.refuse) throw new Error('Graph request failed (400): BadRequest — Security defaults is enabled');
      const p = pols.get(url.split('/').pop());
      if (p && body.state) p.state = body.state;
      return null;
    },
    async gget(url) { const p = pols.get(url.split('/').pop()); return p ? strip(structuredClone(p)) : {}; },
  };
  const Assign = {
    async createGroup(t) { const g = { id: id(), displayName: t.displayName }; groups.set(g.id, g); return { id: g.id, name: g.displayName, created: true }; },
    templates: () => [],
  };
  const b = box({ Graph, Assign });
  vm.runInContext(`${read('baselineData.js')}\n;${read('baselineJoeyData.js')}\n;${read('baseline.js')}\n;${read('import.js')}\n;${read('eadminsData.js')}\n;globalThis.I = Importer; globalThis.E = E_ADMINS;`, b);
  return { I: b.I, E: b.E, pols, posts, patches, groups };
}
async function run(w, bundle, opts) {
  const prepared = w.I.prepareBundle(bundle);
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  return w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped', readWaits: { missing: [1], stale: [1] }, ...opts });
}
const joeyLike = () => ({ catalogId: 'joey', fromRepository: true, groups: [{ id: 'bg-src', displayName: 'CA-BreakGlassAccounts - Exclude' }], namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [],
  policies: [{ displayName: 'CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA', state: 'enabled', conditions: { clientAppTypes: ['all'], applications: { includeApplications: ['All'] }, users: { includeUsers: ['All'], excludeGroups: ['bg-src'] } }, grantControls: { operator: 'OR', builtInControls: ['mfa'] } }] });

test('E-Admins merged into a Joey import: six added, break-glass renamed to his, all forced Off', async () => {
  const w = world();
  const m = w.I.mergeShared(joeyLike(), w.E.bundle(), { label: 'own copy', breakGlassFrom: 'CAB-SEC-U-BreakGlass', breakGlassTo: 'CA-BreakGlassAccounts - Exclude' });
  assert.equal(m.added.length, 6);
  assert.ok(m.bundle.groups.some((g) => g.displayName === 'CA-BreakGlassAccounts - Exclude'));
  assert.ok(!m.bundle.groups.some((g) => g.displayName === 'CAB-SEC-U-BreakGlass'), 'the CloudFellows name is not created beside his');
  assert.ok(m.bundle.groups.some((g) => g.displayName === 'Emergency_Access1') && m.bundle.groups.some((g) => g.displayName === 'Emergency_Access2'));
  assert.equal(m.bundle.authStrengths.length, 1);
  const res = await run(w, m.bundle, { landState: 'enabledForReportingButNotEnforced' });
  const by = Object.fromEntries(res.results.map((r) => [r.name.slice(0, 6), r]));
  assert.ok(res.results.every((r) => r.ok), JSON.stringify(res.results.filter((r) => !r.ok)));
  for (const n of ['CA1100', 'CA1101', 'CA1102', 'CA1103', 'CA1104', 'CA1105']) assert.equal(by[n].state, 'disabled', `${n} lands Off whatever the landing choice`);
  assert.ok(w.posts.some(([u, b]) => u === '/policies/authenticationStrengthPolicies' && b.displayName === 'Phishing-resistant MFA + TAP'));
});

test('Land as: Off by default whatever the file says; Report-only when chosen — created Off, read back, then Report-only', async () => {
  let w = world();
  let res = await run(w, joeyLike(), {});
  assert.equal(res.results[0].ok, true);
  assert.equal(res.results[0].state, 'disabled', 'the file ships it On; an import lands Off unless told otherwise');
  w = world();
  res = await run(w, joeyLike(), { landState: 'enabledForReportingButNotEnforced' });
  assert.equal(res.results[0].state, 'enabledForReportingButNotEnforced');
  assert.equal(w.posts.find(([u]) => u === '/identity/conditionalAccess/policies')[1].state, 'disabled', 'the create is always Off');
  assert.deepEqual(plain(w.patches.map(([, b]) => b.state)), ['enabledForReportingButNotEnforced'], 'one state write, after the read-back');
});

test('Land as Report-only refused by Entra: the policy stays as created, Off, and the run says so — not a failure', async () => {
  const w = world({ refuse: 'enabledForReportingButNotEnforced' });
  const off = joeyLike(); off.policies[0].state = 'disabled';
  const res = await run(w, off, { landState: 'enabledForReportingButNotEnforced', sdOn: true });
  assert.equal(res.results[0].ok, true);
  assert.equal(res.results[0].state, 'disabled');
  assert.ok(res.warnings.some((x) => /created Off — Entra refused Report-only/.test(x)), res.warnings.join(' | '));
  const w2 = world({ refuse: 'enabled' });
  const res2 = await run(w2, joeyLike(), {});
  assert.equal(res2.results[0].state, 'disabled', 'without a landing choice nothing changed');
});
