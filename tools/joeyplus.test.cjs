// ➕ Joey Verlinden+ additions (beta 33109): js/joeyPlusData.js — the bundle,
// the catalog rows Baseline.sharedPolicies adds under the Joey catalog, the
// Joey contract's group routing, and the import (mergeShared beside the
// E-Admins, CA020–CA023 forced Off). No credentials, packages or network.
// Run: node --test tools/joeyplus.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function box(extra = {}) {
  const b = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, Date, encodeURIComponent, decodeURIComponent, setTimeout,
    localStorage: { getItem: () => null, setItem() {} }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; } },
    AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, ...extra };
  vm.createContext(b);
  return b;
}
const NAMES = [
  'CA018-Global-AttackSurfaceReduction-MicrosoftIntuneEnrollment-Windows-BLOCK-NonTrustedLocations',
  'CA019-Global-DataProtection-AllApps-iOSenAndroid-GRANT-RequireAppProtection',
  'CA020-Global-AttackSurfaceReduction-AllApps-Windows-BLOCK-OutsideCompliantNetwork',
  'CA021-Global-AttackSurfaceReduction-AllApps-macOS-BLOCK-OutsideCompliantNetwork',
  'CA022-Global-AttackSurfaceReduction-AllApps-iOS-BLOCK-OutsideCompliantNetwork',
  'CA023-Global-AttackSurfaceReduction-AllApps-Android-BLOCK-OutsideCompliantNetwork',
];
const CN = '3d46dbda-8382-466a-856d-eb00cbc6b910';

test('bundle: six policies with the names of the Joey+ release, every id explained, fresh copies', () => {
  const b = box(); vm.runInContext(`${read('joeyPlusData.js')}\n;globalThis.J = JOEY_PLUS;`, b);
  const J = b.J, x = J.bundle();
  assert.deepEqual(plain(J.names()), NAMES);
  assert.deepEqual(plain(J.forceOff), NAMES.slice(2), 'only CA020–CA023 are forced Off');
  assert.equal(x.policies.length, 6);
  assert.ok(x.policies.every((p) => p.state === 'disabled' && !p.id));
  const blob = JSON.stringify(x.policies);
  for (const id of blob.match(/7a7a0000-[0-9a-f-]{27}/g)) assert.ok(x.groups.some((g) => g.id === id), `${id} has a group`);
  for (const n of NAMES) assert.ok(x.groups.some((g) => g.displayName === `${n} - Exclude`), `exclusion group of ${n.slice(0, 5)}`);
  assert.ok(x.groups.some((g) => g.displayName === 'CAB-SEC-U-ExternalAdmins'));
  assert.ok(x.groups.some((g) => g.displayName === 'CA-BreakGlassAccounts - Exclude'), "Joey's break-glass group, no rename needed");
  x.policies[0].displayName = 'mutated';
  assert.notEqual(J.bundle().policies[0].displayName, 'mutated');
  assert.ok(J.isPlus(`(NEW) ${NAMES[3]}`) && !J.isPlus('CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA'));
});

test('definitions: CA018 Windows enrollment outside trusted, CA019 app protection, CA020–CA023 compliant network per platform', () => {
  const b = box(); vm.runInContext(`${read('joeyPlusData.js')}\n;globalThis.J = JOEY_PLUS;`, b);
  const by = Object.fromEntries(b.J.bundle().policies.map((p) => [p.displayName.slice(0, 5), p]));
  const ex = b.J.bundle().groups;
  const gname = (id) => (ex.find((g) => g.id === id) || {}).displayName;
  const c18 = by.CA018.conditions;
  assert.deepEqual(plain(c18.applications.includeApplications), ['d4ebce55-015a-49b5-a083-c84d1797ae8c']);
  assert.deepEqual(plain(c18.platforms.includePlatforms), ['windows']);
  assert.deepEqual(plain(c18.locations.excludeLocations), ['AllTrusted']);
  assert.deepEqual(plain(by.CA018.grantControls.builtInControls), ['block']);
  const c19 = by.CA019.conditions;
  assert.deepEqual(plain(c19.platforms.includePlatforms), ['iOS', 'android']);
  assert.deepEqual(plain(by.CA019.grantControls.builtInControls), ['compliantApplication']);
  assert.ok(c19.applications.excludeApplications.includes('ea890292-c8c8-4433-b5ea-b09d0668e1a6'), 'Authenticator passkey creation stays possible');
  for (const [k, plat, mobile] of [['CA020', 'windows', false], ['CA021', 'macOS', false], ['CA022', 'iOS', true], ['CA023', 'android', true]]) {
    const c = by[k].conditions;
    assert.deepEqual(plain(c.platforms.includePlatforms), [plat], k);
    assert.deepEqual(plain(c.locations.excludeLocations), [CN], `${k} excludes the compliant network`);
    assert.deepEqual(plain(c.users.includeUsers), ['All'], `${k}: users AND admins`);
    assert.equal((c.users.includeRoles || []).length + (c.users.excludeRoles || []).filter((r) => !/^(d29b2b05|a92aed5d)/.test(r)).length, 0, `${k}: no admin role is left out`);
    const groups = c.users.excludeGroups.map(gname);
    for (const g of ['CAB-SEC-U-ExternalAdmins', 'CA-ServiceAccounts', 'CA-BreakGlassAccounts - Exclude', `${by[k].displayName} - Exclude`]) assert.ok(groups.includes(g), `${k} excludes ${g}`);
    assert.match(c.users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, /serviceProvider/, `${k}: GDAP out`);
    const apps = c.applications.excludeApplications;
    for (const a of ['0000000a-0000-0000-c000-000000000000', 'd4ebce55-015a-49b5-a083-c84d1797ae8c', '01cb2876-7ebd-4aa4-9cc9-d28bd4d359a9']) assert.ok(apps.includes(a), `${k} leaves ${a} out`);
    assert.equal(apps.includes('a0e84e36-b067-4d5c-ab4a-3db38e598ae2'), mobile, `${k}: Defender app out only on mobile`);
  }
});

function catalogBox() {
  const b = box();
  vm.runInContext(['baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js', 'joeyPlusData.js'].map(read).join('\n;\n') + '\n;globalThis.B = Baseline; globalThis.BJ = BASELINE_JOEY; globalThis.J = JOEY_PLUS;', b);
  return b;
}

test('Baseline.sharedPolicies: the six under Joey only, beside the E-Admins; not under CloudFellows or SMB', () => {
  const b = catalogBox();
  const joey = b.B.sharedPolicies(b.B.catalog('joey'));
  const plus = joey.filter((p) => p.shared === 'Joey+');
  assert.deepEqual(plain(plus.map((p) => p.name)), NAMES);
  assert.ok(joey.some((p) => p.shared === 'CloudFellows'), 'the E-Admins stay');
  assert.ok(plus.every((p) => p.num >= 18 && p.num <= 23 && p.exclude.includes(`${p.name} - Exclude (group)`)));
  assert.equal(b.B.sharedPolicies(b.B.catalog('limonit')).length, 0);
  assert.equal(b.B.sharedPolicies(b.B.catalog('smb')).filter((p) => p.shared === 'Joey+').length, 0);
});

test('Joey contract: the Joey+ exclusion groups and CAB-SEC-U-ExternalAdmins are Global; templates create them', () => {
  const b = catalogBox();
  const BJ = b.BJ;
  for (const n of NAMES) assert.equal(BJ.codeForGroup(BJ, `${n} - Exclude`), 'GLO', n.slice(0, 5));
  assert.equal(BJ.codeForGroup(BJ, 'cab-sec-u-externaladmins'), 'GLO');
  assert.equal(BJ.codeForGroup(BJ, 'Something else'), null);
  const t = BJ.templates(BJ).map((x) => x.displayName);
  for (const n of NAMES) assert.ok(t.includes(`${n} - Exclude`));
  assert.ok(t.includes('CAB-SEC-U-ExternalAdmins'));
});

// The importer behind a fake tenant (the shape tools/secdefaults.test.cjs uses).
function world() {
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
      return { id: id() };
    },
    async gpatch(url, body) {
      patches.push([url, structuredClone(body)]);
      const p = pols.get(url.split('/').pop());
      if (p && body.state) p.state = body.state;
      return null;
    },
    async existingAppIds(ids) { return new Set(ids); },
    async gget(url) { const p = pols.get(url.split('/').pop()); return p ? strip(structuredClone(p)) : { value: [] }; },
  };
  const Assign = {
    async createGroup(t) { const g = { id: id(), displayName: t.displayName }; groups.set(g.id, g); return { id: g.id, name: g.displayName, created: true }; },
    templates: () => [],
  };
  const b = box({ Graph, Assign });
  vm.runInContext(['baselineData.js', 'baselineJoeyData.js', 'baseline.js', 'import.js', 'eadminsData.js', 'joeyPlusData.js'].map(read).join('\n;\n') + '\n;globalThis.I = Importer; globalThis.E = E_ADMINS; globalThis.J = JOEY_PLUS;', b);
  return { I: b.I, E: b.E, J: b.J, groups, posts };
}
const joeyLike = () => ({ catalogId: 'joey', fromRepository: true, groups: [{ id: 'bg-src', displayName: 'CA-BreakGlassAccounts - Exclude' }], namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [],
  policies: [{ displayName: 'CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA', state: 'enabled', conditions: { clientAppTypes: ['all'], applications: { includeApplications: ['All'] }, users: { includeUsers: ['All'], excludeGroups: ['bg-src'] } }, grantControls: { operator: 'OR', builtInControls: ['mfa'] } }] });

test('mergeShared: default is still the E-Admins only; Joey+ through opts.match, forceOff only CA020–CA023', () => {
  const w = world();
  assert.equal(w.I.mergeShared(joeyLike(), w.J.bundle(), {}).added.length, 0, 'without match nothing of Joey+ is taken');
  const ea = w.I.mergeShared(joeyLike(), w.E.bundle(), { breakGlassFrom: 'CAB-SEC-U-BreakGlass', breakGlassTo: 'CA-BreakGlassAccounts - Exclude' });
  assert.equal(ea.bundle.forceOff.length, 6, 'E-Admins: all forced Off as before');
  const m = w.I.mergeShared(ea.bundle, w.J.bundle(), { match: w.J.isPlus, forceOff: w.J.forceOff });
  assert.deepEqual(plain(m.added), NAMES);
  assert.equal(m.bundle.policies.length, 13);
  assert.ok(NAMES.slice(2).every((n) => m.bundle.forceOff.includes(n)) && !m.bundle.forceOff.includes(NAMES[0]) && !m.bundle.forceOff.includes(NAMES[1]));
  assert.equal(w.I.prepareBundle(m.bundle).groups.filter((g) => g.displayName === 'CA-BreakGlassAccounts - Exclude').length, 1, 'one break-glass group once prepared');
  assert.equal(w.I.mergeShared(m.bundle, w.J.bundle(), { match: w.J.isPlus }).added.length, 0, 'never taken twice');
});

test('import: Joey + E-Admins + Joey+ — CA018/CA019 land Report-only, CA020–CA023 and the E-Admins Off, groups created', async () => {
  const w = world();
  const ea = w.I.mergeShared(joeyLike(), w.E.bundle(), { breakGlassFrom: 'CAB-SEC-U-BreakGlass', breakGlassTo: 'CA-BreakGlassAccounts - Exclude' });
  const m = w.I.mergeShared(ea.bundle, w.J.bundle(), { match: w.J.isPlus, forceOff: w.J.forceOff });
  const prepared = w.I.prepareBundle(m.bundle);
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped', readWaits: { missing: [1], stale: [1] }, landState: 'enabledForReportingButNotEnforced' });
  assert.ok(res.results.every((r) => r.ok), JSON.stringify(res.results.filter((r) => !r.ok).map((r) => [r.name, r.error])));
  const st = Object.fromEntries(res.results.map((r) => [r.name.slice(0, 6).replace(/-$/, ''), r.state]));
  assert.equal(st.CA018, 'enabledForReportingButNotEnforced');
  assert.equal(st.CA019, 'enabledForReportingButNotEnforced');
  for (const k of ['CA020', 'CA021', 'CA022', 'CA023', 'CA1100', 'CA1105']) assert.equal(st[k], 'disabled', `${k} lands Off`);
  const names = [...w.groups.values()].map((g) => g.displayName);
  assert.ok(names.includes('CAB-SEC-U-ExternalAdmins') && names.includes(`${NAMES[2]} - Exclude`));
  const cn = w.posts.find(([u, b]) => u === '/identity/conditionalAccess/policies' && b.displayName === NAMES[2])[1];
  assert.deepEqual(plain(cn.conditions.locations.excludeLocations), [CN], 'the compliant network location by its fixed id');
  assert.ok(!JSON.stringify(cn).includes('7a7a0000'), 'no placeholder id reaches the tenant');
});
