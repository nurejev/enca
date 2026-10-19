// 🏢 SMB Basic (beta 32816, R91): the third catalog — its contract, its
// place among the catalogs, the security-defaults switch it feeds, and the
// import of ENCA's own copy into a fake tenant. No credentials, external
// packages or network. Run: node --test tools/baseline-smb.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const caGroup = (n) => { const m = /CA(\d{3,4})/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? 99999 : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; };

function world(opts = {}) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const groups = new Map(), pols = new Map(), posts = [];
  const store = new Map();
  const strip = (o) => Array.isArray(o) ? o.map(strip) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => !k.includes('@odata')).map(([k, v]) => [k, strip(v)])) : o;
  const Graph = {
    async existingAppIds(ids) { return new Set(ids); },
    async createServicePrincipal(appId) { return { displayName: appId }; },
    async ggetAll(url) {
      const m = /displayName eq '(.*)'/.exec(decodeURIComponent(url));
      if (url.startsWith('/groups') && m) return [...groups.values()].filter((g) => g.displayName.toLowerCase() === m[1].replace(/''/g, "'").toLowerCase());
      if (url.startsWith('/policies/authenticationStrengthPolicies')) return opts.strengths || [];
      return [];
    },
    async gpost(url, body) {
      posts.push([url, structuredClone(body)]);
      if (url === '/directoryObjects/getByIds') return { value: body.ids.filter((x) => groups.has(x)).map((x) => ({ id: x })) };
      if (url === '/identity/conditionalAccess/policies') {
        if (opts.refuseCn && JSON.stringify(body).includes('3d46dbda-8382-466a-856d-eb00cbc6b910')) throw new Error('Graph request failed (400): location not found');
        const p = { ...structuredClone(body), id: id() }; pols.set(p.id, p); return { id: p.id };
      }
      const made = { id: id() }; store.set(made.id, [url, body]); return made;
    },
    async gpatch(url, body) {
      const p = pols.get(url.split('/').pop());
      if (p && body.conditions) p.conditions = { ...p.conditions, ...structuredClone(body.conditions) };
      if (p && body.state) p.state = body.state;
      return null;
    },
    async gget(url) { const p = pols.get(url.split('/').pop()); return p ? strip(structuredClone(p)) : {}; },
  };
  const Assign = {
    async createGroup(t) {
      const hit = [...groups.values()].find((g) => g.displayName.toLowerCase() === t.displayName.toLowerCase());
      if (hit) return { id: hit.id, name: hit.displayName, created: false };
      const g = { id: id(), displayName: t.displayName }; groups.set(g.id, g);
      return { id: g.id, name: g.displayName, created: true };
    },
    templates: () => [],
  };
  const ls = new Map();
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, Date, Math, encodeURIComponent, decodeURIComponent, setTimeout,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup }, AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, Graph, Assign };
  vm.createContext(box);
  const src = ['baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js', 'import.js', 'secdefaults.js']
    .map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.I = Importer; globalThis.B = Baseline; globalThis.S = BASELINE_SMB; globalThis.SD = SecDefaults;`, box);
  return { I: box.I, B: box.B, S: box.S, SD: box.SD, groups, pols, posts };
}
const nameOf = (w, gid) => (w.groups.get(gid) || {}).displayName || `MISSING ${gid}`;

test('the catalog: 15 policies in four sections, numbered where every tool reads a CA number', () => {
  const { S } = world();
  assert.equal(S.policies.length, 15);
  assert.deepEqual(plain(S.policies.map((p) => p.num)), [1, 2, 3, 4, 5, 6, 101, 102, 103, 104, 201, 202, 203, 204, 901]);
  for (const p of S.policies) {
    assert.match(p.name, /^CA\d{3}-(GRANT|BLOCK|SESSION)-SMB-[A-Za-z]+-.+-v1\.0$/, p.name);
    assert.equal(S.personaOfPolicy(S, p.name) != null, true, `${p.name} has a section`);
  }
  assert.equal(new Set(S.policies.map((p) => p.name)).size, 15, 'names are unique');
  assert.equal(S.adminRoles.length, 16, 'the 16 roles security defaults names (Learn, Oct 2026)');
});

test('the contract: exclusion group per policy, a unit per section, break-glass everywhere but CA901', () => {
  const { S, B } = world();
  const c = B.withContract(S);
  for (const p of S.policies) {
    const ex = c.exclusionGroupFor(p.name);
    assert.equal(ex.name, `CAB-SEC-U-SMB-CA${String(p.num).padStart(3, '0')}-Exclusion`);
    assert.equal(ex.source, 'catalog');
    assert.equal(c.isExclusionGroup(ex.name), true);
    assert.equal(p.exclude.includes(`${ex.name} (group)`), true);
    assert.equal(p.exclude.includes('CAB-SEC-U-BreakGlass (group)'), p.num !== 901, p.name);
  }
  assert.equal(c.codeForGroup('CAB-SEC-U-SMB-CA004-Exclusion'), 'GLO');
  assert.equal(c.codeForGroup('CAB-SEC-U-SMB-CA103-Exclusion'), 'ADM');
  assert.equal(c.codeForGroup('CAB-SEC-U-SMB-CA204-Exclusion'), 'CN');
  assert.equal(c.codeForGroup('CAB-SEC-U-SMB-CA901-Exclusion'), 'BreakGlass');
  assert.equal(c.codeForGroup('CAB-SEC-U-BreakGlass'), 'BreakGlass');
  assert.equal(c.codeForGroup('CAB-SEC-U-SMB-CA250-Exclusion'), null, 'a number the catalog does not define');
  assert.equal(c.codeForGroup('CAB-SEC-U-CA001-Exclusion'), null, "CloudFellows' group is not SMB's");
  assert.deepEqual(plain(['GLO', 'ADM', 'CN', 'BreakGlass'].map((k) => c.auName(k))), ['CA-RMAU-SMB-BASE', 'CA-RMAU-SMB-ADM', 'CA-RMAU-SMB-CN', 'CA-RMAU-BreakGlass']);
  assert.equal(c.personaOfPolicy('CA001-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3'), null, "a CA001 without SMB is someone else's");
  assert.equal(c.templates().length, 16, 'break-glass + one per policy');
});

test('among the catalogs: third, no shared E-Admins expected, Emergency_Access groups not expected', () => {
  const { B } = world();
  assert.deepEqual(plain(B.catalogs().map((c) => c.id)), ['limonit', 'joey', 'smb']);
  const smb = B.catalog('smb');
  assert.equal(B.sharedPolicies(smb).length, 0);
  assert.ok(B.sharedPolicies(B.catalog('joey')).length > 0, 'Joey still gets them');
  assert.equal(B.sharedGroups(smb).filter((g) => g.family === 'eadmins' && g.expected).length, 0);
  const r = B.compare([], 'smb');
  assert.equal(r.rows.filter((x) => x.status === 'missing').length, 15);
});

test('compare: a tenant holding the SMB policies is Up to date, and CloudFellows names do not pass for them', () => {
  const { B, S } = world();
  const vms = S.policies.map((p) => ({ id: `t${p.num}`, name: p.name }));
  const r = B.compare(vms, 'smb');
  assert.equal(r.rows.filter((x) => x.status === 'ok').length, 15);
  const cf = B.compare([{ id: 'x', name: 'CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1.0.2' }], 'smb');
  assert.notEqual(cf.rows.find((x) => x.num === 1).status, 'ok');
});

test('import of ENCA\'s own copy: groups, location and FIDO2 strength by name; GSA policies Off; the rest Report-only', async () => {
  const w = world();
  const bundle = w.S.bundle();
  assert.equal(w.I.catalogOfBundle(bundle), 'smb');
  const prepared = w.I.prepareBundle(bundle);
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  assert.equal(chosen.length, 15);
  assert.deepEqual(plain(chosen.filter((p) => p.forceOff).map((p) => p.num)), [103, 201, 202, 203, 204]);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped', landState: 'enabledForReportingButNotEnforced' });
  const bad = res.results.filter((r) => !r.ok);
  assert.deepEqual(plain(bad.map((r) => `${r.name}: ${r.error}`)), []);
  const created = [...w.pols.values()];
  assert.equal(created.length, 15);
  const st = Object.fromEntries(created.map((p) => [p.displayName.slice(0, 5), p.state]));
  for (const k of ['CA103', 'CA201', 'CA202', 'CA203', 'CA204']) assert.equal(st[k], 'disabled', k);
  for (const k of ['CA001', 'CA002', 'CA003', 'CA004', 'CA005', 'CA006', 'CA101', 'CA102', 'CA104', 'CA901']) assert.equal(st[k], 'enabledForReportingButNotEnforced', k);
  // every exclusion is this tenant's group, by name
  const by = (n) => created.find((p) => p.displayName.startsWith(n));
  assert.deepEqual(by('CA001').conditions.users.excludeGroups.map((g) => nameOf(w, g)).sort(), ['CAB-SEC-U-BreakGlass', 'CAB-SEC-U-SMB-CA001-Exclusion']);
  assert.deepEqual(by('CA901').conditions.users.includeGroups.map((g) => nameOf(w, g)), ['CAB-SEC-U-BreakGlass']);
  assert.deepEqual(by('CA901').conditions.users.excludeGroups.map((g) => nameOf(w, g)), ['CAB-SEC-U-SMB-CA901-Exclusion']);
  assert.equal(by('CA004').conditions.users.includeRoles.length, 16);
  assert.deepEqual(by('CA001').conditions.users.includeUsers, ['All'], 'as shipped: All users, never a deploy group');
  assert.equal(w.groups.size, 16);
  assert.ok(w.posts.some(([u, b]) => u === '/identity/conditionalAccess/namedLocations' && b.displayName === 'SMB - Allowed countries'));
  assert.ok(w.posts.some(([u, b]) => /authenticationStrengthPolicies/.test(u) && b.displayName === 'SMB - FIDO2 security key' && b.allowedCombinations.join() === 'fido2'));
  assert.equal(by('CA201').conditions.locations.excludeLocations[0], '3d46dbda-8382-466a-856d-eb00cbc6b910', 'Microsoft\'s compliant network location, as-is');
});

test('import on a tenant without Global Secure Access: the compliant-network policies fail on their own, the rest lands', async () => {
  const w = world({ refuseCn: true });
  const prepared = w.I.prepareBundle(w.S.bundle());
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped' });
  assert.deepEqual(plain(res.results.filter((r) => !r.ok).map((r) => r.name.slice(0, 5)).sort()), ['CA103', 'CA201', 'CA202', 'CA203', 'CA204']);
  assert.equal(res.results.filter((r) => r.ok).length, 10);
});

test('security defaults: the SMB policies cover all four protections plus Azure management, and the switch is CA001–CA005', () => {
  const w = world();
  const bundle = w.S.bundle();
  const names = { '5b5b0000-0000-4000-8000-000000999999': 'CAB-SEC-U-BreakGlass' };
  const vms = bundle.policies.map((r, i) => ({ id: `p${i}`, name: r.displayName, raw: { ...r, id: `p${i}`, state: 'enabledForReportingButNotEnforced' },
    users: { exc: (r.conditions.users.excludeGroups || []).map((g) => `${names[g] || 'CAB-SEC-U-SMB-x'} (group)`) } }));
  const cov = w.SD.coverage(vms, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  const by = Object.fromEntries(cov.items.map((i) => [i.key, i.policies.map((p) => p.name.slice(0, 5))]));
  assert.deepEqual(plain(by), { mfaAll: ['CA001'], mfaAdmins: ['CA004', 'CA101'], legacy: ['CA002'], deviceCode: ['CA003'], azureMgmt: ['CA005'] });
  // CA101 (phishing-resistant) does the admin part too, but CA004 does it with plain MFA: CA101 stays in the rollout
  assert.deepEqual(plain(cov.toOn.map((p) => p.name.slice(0, 5)).sort()), ['CA001', 'CA002', 'CA003', 'CA004', 'CA005']);
  assert.deepEqual(plain(cov.toOn.map((p) => p.name).sort()), plain(w.S.replacing().sort()), 'the catalog and the switch agree on the replacing set');
  assert.equal(cov.ready, true);
});

test('security defaults: Azure management is optional — a catalog without it still switches', () => {
  const { SD } = world();
  const vms = SD.demoPolicies().map((r) => ({ id: r.id, name: r.displayName, raw: r, users: { exc: ['CAB-SEC-U-BreakGlass (group)'] } }));
  const cov = SD.coverage(vms, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  const az = cov.items.find((i) => i.key === 'azureMgmt');
  assert.equal(az.ok, false);
  assert.equal(az.optional, true);
  assert.equal(cov.ready, true);
  assert.match(SD.band('sd-on-policies', cov, {}), /optional — no policy here does it on its own/);
});

test('the security-defaults card offers SMB Basic with its own source and button', () => {
  const { SD } = world();
  const html = SD.startCard('sd-on', { sd: { enabled: true }, caps: { p1: true }, count: 0,
    catalogs: [{ id: 'limonit', label: 'CloudFellows', total: 99 }, { id: 'joey', label: 'Joey Verlinden', total: 36 }, { id: 'smb', label: 'SMB Basic', icon: '🏢', total: 15 }] });
  assert.match(html, /data-sdpick="smb"/);
  assert.match(html, /carried by ENCA, nothing to download/);
  assert.match(html, /📥 Deploy in Report-only →/);
});
