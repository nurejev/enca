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

test('the catalog: 19 policies in four sections, numbered where every tool reads a CA number', () => {
  const { S } = world();
  assert.equal(S.policies.length, 19);
  assert.deepEqual(plain(S.policies.map((p) => p.num)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 101, 102, 103, 104, 201, 202, 203, 204, 205, 901]);
  for (const p of S.policies) {
    assert.match(p.name, /^CA\d{3}-(GRANT|BLOCK|SESSION)-SMB-[A-Za-z]+-.+-v1\.0(\.[1-5])?$/, p.name);
    assert.equal(S.personaOfPolicy(S, p.name) != null, true, `${p.name} has a section`);
  }
  assert.equal(new Set(S.policies.map((p) => p.name)).size, 19, 'names are unique');
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
  assert.equal(c.templates().length, 21, 'break-glass + shared devices + one per policy');
});

test('among the catalogs: third, no shared E-Admins expected, Emergency_Access groups not expected', () => {
  const { B } = world();
  assert.deepEqual(plain(B.catalogs().map((c) => c.id)), ['limonit', 'joey', 'smb']);
  const smb = B.catalog('smb');
  assert.equal(B.sharedPolicies(smb).length, 0);
  assert.ok(B.sharedPolicies(B.catalog('joey')).length > 0, 'Joey still gets them');
  assert.equal(B.sharedGroups(smb).filter((g) => g.family === 'eadmins' && g.expected).length, 0);
  const r = B.compare([], 'smb');
  assert.equal(r.rows.filter((x) => x.status === 'missing').length, 19);
});

test('compare: a tenant holding the SMB policies is Up to date, and CloudFellows names do not pass for them', () => {
  const { B, S } = world();
  const vms = S.policies.map((p) => ({ id: `t${p.num}`, name: p.name }));
  const r = B.compare(vms, 'smb');
  assert.equal(r.rows.filter((x) => x.status === 'ok').length, 19);
  const cf = B.compare([{ id: 'x', name: 'CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1.0.2' }], 'smb');
  assert.notEqual(cf.rows.find((x) => x.num === 1).status, 'ok');
});

test('import of ENCA\'s own copy: groups, location and passkey strength by name; GSA policies Off; the rest Report-only', async () => {
  const w = world();
  const bundle = w.S.bundle();
  assert.equal(w.I.catalogOfBundle(bundle), 'smb');
  const prepared = w.I.prepareBundle(bundle);
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  assert.equal(chosen.length, 19);
  assert.deepEqual(plain(chosen.filter((p) => p.forceOff).map((p) => p.num)), [103, 201, 202, 203, 204]);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped', landState: 'enabledForReportingButNotEnforced' });
  const bad = res.results.filter((r) => !r.ok);
  assert.deepEqual(plain(bad.map((r) => `${r.name}: ${r.error}`)), []);
  const created = [...w.pols.values()];
  assert.equal(created.length, 19);
  const st = Object.fromEntries(created.map((p) => [p.displayName.slice(0, 5), p.state]));
  for (const k of ['CA103', 'CA201', 'CA202', 'CA203', 'CA204']) assert.equal(st[k], 'disabled', k);
  for (const k of ['CA001', 'CA002', 'CA003', 'CA004', 'CA005', 'CA006', 'CA007', 'CA008', 'CA009', 'CA101', 'CA102', 'CA104', 'CA205', 'CA901']) assert.equal(st[k], 'enabledForReportingButNotEnforced', k);
  // every exclusion is this tenant's group, by name
  const by = (n) => created.find((p) => p.displayName.startsWith(n));
  assert.deepEqual(by('CA001').conditions.users.excludeGroups.map((g) => nameOf(w, g)).sort(), ['CAB-SEC-U-BreakGlass', 'CAB-SEC-U-SMB-CA001-Exclusion', 'CAB-SEC-U-TeamsSharedDevices']);
  assert.deepEqual(by('CA901').conditions.users.includeGroups.map((g) => nameOf(w, g)), ['CAB-SEC-U-BreakGlass']);
  assert.deepEqual(by('CA901').conditions.users.excludeGroups.map((g) => nameOf(w, g)), ['CAB-SEC-U-SMB-CA901-Exclusion']);
  assert.equal(by('CA004').conditions.users.includeRoles.length, 16);
  assert.deepEqual(by('CA001').conditions.users.includeUsers, ['All'], 'as shipped: All users, never a deploy group');
  assert.equal(w.groups.size, 21);
  assert.ok(w.posts.some(([u, b]) => u === '/identity/conditionalAccess/namedLocations' && b.displayName === 'SMB - Allowed countries'));
  assert.ok(w.posts.some(([u, b]) => /authenticationStrengthPolicies/.test(u) && b.displayName === 'SMB - Passkey (FIDO2)' && b.allowedCombinations.join() === 'fido2'));
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
  assert.equal(res.results.filter((r) => r.ok).length, 14);
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

test('32817 exclusions: every policy its own group, break-glass out of all but CA901, sync accounts out of every all-users all-resources policy', () => {
  const { S } = world();
  const b = S.bundle();
  const gname = Object.fromEntries(b.groups.map((g) => [g.id, g.displayName]));
  const SYNC = ['d29b2b05-8046-44ba-8758-1e26182fcf32', 'a92aed5d-d78a-4d16-b381-09adb37eb3b0'];
  for (const p of b.policies) {
    const u = p.conditions.users, num = +/CA(\d{3})/.exec(p.displayName)[1];
    const ex = (u.excludeGroups || []).map((g) => gname[g]).sort();
    const want = [`CAB-SEC-U-SMB-CA${String(num).padStart(3, '0')}-Exclusion`, ...(num === 901 ? [] : ['CAB-SEC-U-BreakGlass']),
      ...([1, 3, 8, 9, 201, 202, 203, 204].includes(num) ? ['CAB-SEC-U-TeamsSharedDevices'] : [])].sort();
    assert.deepEqual(plain(ex), want, p.displayName);
    const everyoneEverywhere = (u.includeUsers || []).includes('All') && (p.conditions.applications.includeApplications || []).includes('All');
    // 1.0.2: CA005 (admin portals + Azure management, all users) leaves them out too
    assert.deepEqual(plain((u.excludeRoles || []).slice().sort()), everyoneEverywhere || num === 5 ? SYNC.slice().sort() : [], `${p.displayName}: sync roles`);
    // guests are out where they cannot comply (registration, compliant network)
    const guestsOut = !!u.excludeGuestsOrExternalUsers;
    assert.equal(guestsOut, [6, 7, 8, 9, 201, 202, 203, 204, 205].includes(num), `${p.displayName}: guests`);
    // nobody is excluded by user id — ids never travel between tenants
    assert.deepEqual(plain(u.excludeUsers), [], p.displayName);
  }
});

test('32817 CA901 asks for a passkey — the passkey combination, synced or device-bound as the profile allows', () => {
  const { S } = world();
  const b = S.bundle();
  const p = b.policies.find((x) => x.displayName.startsWith('CA901'));
  assert.equal(p.displayName, 'CA901-GRANT-SMB-BreakGlass-AnyApp-AnyPlatform-Passkey-v1.0.1');
  const st = b.authStrengths.find((x) => x.id === p.grantControls.authenticationStrength.id);
  assert.equal(st.displayName, 'SMB - Passkey (FIDO2)');
  assert.deepEqual(plain(st.allowedCombinations), ['fido2']);
});

test('32817 under SMB Basic the CA-number blocks are its sections — in the Policies list and the gap matrix', () => {
  const ls = new Map();
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, JSON, Date, Math, structuredClone, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) }, document: { dispatchEvent() {}, createElement: () => ({}) }, CustomEvent: class {} };
  vm.createContext(box);
  const src = ['render.js', 'baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js'].map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.R = Render; globalThis.B = Baseline;`, box);
  const { R, B } = box;
  const smbName = 'CA201-BLOCK-SMB-Users-AnyApp-Windows-OutsideCompliantNetwork-v1.0';
  assert.match(R.caGroup(smbName).label, /^Internals/, 'not active: the CloudFellows persona');
  B.setActive('smb');
  assert.equal(R.caGroup(smbName).label, 'Compliant network (CA200–CA299)');
  assert.equal(R.caGroup('CA901-GRANT-SMB-BreakGlass-AnyApp-AnyPlatform-Passkey-v1.0').label, 'Break-glass (CA900–CA999)');
  assert.equal(R.caGroup('CA001-GRANT-SMB-Global-AnyApp-AnyPlatform-MFA-v1.0').label, 'Base (CA000–CA099)');
  assert.match(R.caGroup('CA215-BLOCK-Internals-CN-AllApps-Windows-v3.0.4').label, /^Internals/, 'a name SMB does not claim keeps its persona');
});

test('32817 gap matrix under SMB Basic: sections, not CloudFellows personas — no "Internals: missing MFA", no compliant-device ask for admins', () => {
  const run = (active) => {
    const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error,
      Render: { caGroup }, Brand: { generatedBy: () => '' }, toolHead: () => '',
      Baseline: { activeCatalogId: () => active } };
    vm.createContext(box);
    vm.runInContext(`${read('gapcheck.js')}\n;globalThis.G = GapCheck;`, box);
    const { S } = world();
    const raws = S.bundle().policies.map((p, i) => ({ ...p, id: `p${i}`, state: 'enabled' }));
    return box.G.run(raws, {});
  };
  const smb = run('smb');
  assert.deepEqual(plain(smb.personas.map((p) => p.label || p.persona || p.id)).length, 4);
  const titles = smb.findings.map((f) => f.title);
  assert.equal(titles.some((t) => /Internals: missing/.test(t)), false);
  assert.equal(titles.some((t) => /missing Compliant device/.test(t)), false);
  const cf = run('limonit');
  assert.ok(cf.findings.some((f) => /Internals: missing/.test(f.title)), 'under CloudFellows the persona matrix is unchanged');
});

test('32817 a tenant on 1.0: the eight changed policies read Outdated, and Match & replace brings the sync-role exclusion along', async () => {
  const w = world();
  const v10 = (n) => n.replace(/-v1\.0\.[1-5]$/, '-v1.0').replace('-Passkey-', '-FIDO2-').replace('-AdminPortalsAndAzureMgmt-', '-AzureManagement-');
  // 1.0 had no CA007 and CA008 (added in 1.0.2)
  const tenant = w.S.bundle().policies.filter((p) => !/^CA(00[789]|205)-/.test(p.displayName)).map((p, i) => ({ ...JSON.parse(JSON.stringify(p)), id: `t${i}`, displayName: v10(p.displayName) }));
  for (const t of tenant) { delete t.conditions.users.excludeRoles; t.state = 'enabledForReportingButNotEnforced'; w.pols.set(t.id, t); }
  const r = w.B.compare(tenant.map((t) => ({ id: t.id, name: t.displayName })), 'smb');
  assert.deepEqual(plain(r.rows.filter((x) => x.status === 'outdated').map((x) => x.num).sort((a, b) => a - b)), [1, 2, 3, 5, 103, 201, 202, 203, 204, 901]);
  assert.equal(r.rows.filter((x) => x.status === 'ok').length, 5);
  assert.deepEqual(plain(r.rows.filter((x) => x.status === 'missing').map((x) => x.num)), [7, 8, 9, 205]);
  const prepared = w.I.prepareBundle(w.S.bundle());
  const chosen = w.I.plan(prepared, tenant).filter((p) => p.upgrade && p.num === 1);
  assert.equal(chosen.length, 1);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'replace' });
  assert.equal(res.results[0].ok, true, res.results[0].error);
  const made = [...w.pols.values()].find((p) => p.displayName === 'CA001-GRANT-SMB-Global-AnyApp-AnyPlatform-MFA-v1.0.3');
  assert.deepEqual(plain(made.conditions.users.excludeRoles.slice().sort()), ['a92aed5d-d78a-4d16-b381-09adb37eb3b0', 'd29b2b05-8046-44ba-8758-1e26182fcf32']);
});

test('1.0.2 (the guide\'s Appendix 1): CA005 adds the admin portals, CA007 guards device join, CA008 holds unmanaged Windows and Macs to 4 hours', () => {
  const { S } = world();
  const b = S.bundle();
  const by = (n) => b.policies.find((p) => p.displayName.startsWith(n));
  assert.equal(S.release, '1.0.5');
  assert.deepEqual(plain(by('CA005').conditions.applications.includeApplications), ['MicrosoftAdminPortals', '797f4846-ba00-4fd7-ba43-dac1f8f63013']);
  const ca7 = by('CA007');
  assert.equal(ca7.displayName, 'CA007-GRANT-SMB-Global-RegisterOrJoinDevices-AnyPlatform-MFA-v1.0.2');
  assert.deepEqual(plain(ca7.conditions.applications.includeUserActions), ['urn:user:registerdevice']);
  assert.deepEqual(plain(ca7.conditions.applications.includeApplications), []);
  assert.equal(ca7.grantControls.authenticationStrength.id, '00000000-0000-0000-0000-000000000002', 'the built-in Multifactor authentication strength (TAP accepted)');
  assert.equal(ca7.conditions.devices, undefined, 'Learn: no device filter with this user action');
  const ca8 = by('CA008');
  assert.equal(ca8.displayName, 'CA008-SESSION-SMB-Global-AnyApp-WindowsOrMacOS-Unmanaged-SIF4h-NeverPersistent-v1.0.3');
  assert.deepEqual(plain(ca8.conditions.platforms.includePlatforms), ['windows', 'macOS']);
  assert.deepEqual(plain(ca8.conditions.devices.deviceFilter), { mode: 'include', rule: 'device.trustType -ne "AzureAD"' });
  assert.deepEqual(plain(ca8.conditions.applications.includeApplications), ['All'], 'persistent browser needs all resources');
  assert.equal(ca8.grantControls, null);
  assert.deepEqual(plain([ca8.sessionControls.signInFrequency.value, ca8.sessionControls.signInFrequency.type, ca8.sessionControls.persistentBrowser.mode]), [4, 'hours', 'never']);
  assert.equal(b.forceOff.includes(ca8.displayName), false, 'lands as the run lands — Report-only from the security-defaults card');
  const cat = Object.fromEntries(S.policies.map((p) => [p.num, p.tag]));
  assert.deepEqual(plain([cat[5], cat[7], cat[8]]), ['UP', 'NEW', 'NEW']);
});

test('1.0.3 exclusions matrix: shared devices, Azure VM sign-in, the Defender mobile apps, B2B direct connect — and CA205 for the unknown platforms', () => {
  const { S } = world();
  const b = S.bundle();
  const by = (n) => b.policies.find((p) => p.displayName.startsWith(n));
  const exApps = (n) => plain(by(n).conditions.applications.excludeApplications);
  assert.ok(exApps('CA001').includes('372140e0-b3b7-4226-8ef9-d57986796201'), 'CA001 − Azure Windows VM Sign-In');
  for (const n of ['CA103', 'CA203', 'CA204']) for (const id of ['a0e84e36-b067-4d5c-ab4a-3db38e598ae2', 'e724aa31-0f56-4018-b8be-f8cb82ca1196']) assert.ok(exApps(n).includes(id), `${n} − Defender ${id}`);
  for (const n of ['CA201', 'CA202']) assert.deepEqual(exApps(n), ['0000000a-0000-0000-c000-000000000000', 'd4ebce55-015a-49b5-a083-c84d1797ae8c'], `${n}: Intune and Intune Enrollment only, as Learn asks`);
  assert.equal(by('CA008').conditions.users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, 'b2bDirectConnectUser');
  const ca205 = by('CA205');
  assert.equal(ca205.displayName, 'CA205-BLOCK-SMB-Users-AnyApp-UnknownPlatforms-v1.0.3');
  assert.deepEqual(plain(ca205.conditions.platforms), { includePlatforms: ['all'], excludePlatforms: ['android', 'iOS', 'windows', 'macOS'] });
  assert.equal(b.forceOff.includes(ca205.displayName), false, 'lands as the run lands');
  assert.ok(b.groups.some((g) => g.displayName === 'CAB-SEC-U-TeamsSharedDevices'));
  assert.equal(S.codeForGroup(S, 'CAB-SEC-U-TeamsSharedDevices'), 'GLO');
  const entry = S.policies.find((p) => p.num === 1);
  assert.ok(entry.exclude.includes('CAB-SEC-U-TeamsSharedDevices (group)'));
  assert.match(entry.resources, /− Azure Windows VM Sign-In/);
});

test('ENCA\'s own checks on SMB Basic: 🛡 Bypass & Swiss cheese and 📘 MS Learn leave only the findings the catalog accepts', () => {
  const ls = new Map();
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, JSON, Date, Math, structuredClone, encodeURIComponent, decodeURIComponent, Array, Object, Number, String, RegExp, Error,
    Render: { caGroup }, Brand: { generatedBy: () => '' }, toolHead: () => '',
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) }, document: { dispatchEvent() {} }, CustomEvent: class {} };
  vm.createContext(box);
  const src = ['baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js', 'gapcheck.js', 'mslearn.js'].map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;Baseline.setActive('smb'); globalThis.G = GapCheck; globalThis.M = MSLearn; globalThis.S = BASELINE_SMB;`, box);
  const { G, M, S } = box;
  const b = S.bundle();
  const raws = b.policies.map((p) => ({ ...p, id: p.displayName.slice(0, 5), state: 'enabled' }));
  const strengths = new Map(b.authStrengths.map((x) => [x.id, { ...x, allowedCombinations: x.allowedCombinations || ['windowsHelloForBusiness', 'fido2', 'password,microsoftAuthenticatorPush'] }]));
  const gid = (n) => b.groups.find((g) => g.displayName === n).id;
  const gc = G.run(raws, { strengths, names: {}, breakGlass: { id: gid('CAB-SEC-U-BreakGlass'), type: 'group' }, namedLocations: b.namedLocations }, { includeDisabled: true });
  const ACCEPT_GC = new Set(['Resource Exclusion Bypass', 'CA-Immune Resources', 'Risk-Based Access', 'Break-Glass Coverage', 'Platform Bypass']);
  const bad = gc.findings.filter((f) => !ACCEPT_GC.has(f.category) || (f.severity !== 'info' && ['Break-Glass Coverage', 'Platform Bypass'].includes(f.category)));
  assert.deepEqual(plain(bad.map((f) => `${f.category}: ${f.title}`)), [], 'Swiss cheese: break-glass everywhere, unknown platforms blocked, sections covered');
  const ml = M.run(raws, strengths, { includeDisabled: true, groups: { breakGlass: { id: gid('CAB-SEC-U-BreakGlass'), type: 'group', name: 'CAB-SEC-U-BreakGlass' }, sharedDevices: { id: gid('CAB-SEC-U-TeamsSharedDevices'), name: 'CAB-SEC-U-TeamsSharedDevices' } },
    partners: { ok: true, list: [] }, crossTenant: { ok: true, defaultOk: true, partnersOk: true, defaultTrust: {}, dcInboundDefault: 'blocked', partners: [] }, guestGroups: new Map() });
  // accepted: the exclusions Learn itself asks for (Intune, Defender, VM sign-in) under the baseline-scopes change, and the sync-role exclusion security defaults has
  const ACCEPT_ML = new Set(['all-resources-exclusion-change', 'dirsync-account-mfa']);
  assert.deepEqual(plain(ml.filter((f) => !ACCEPT_ML.has(f.check.id)).map((f) => `${f.check.id} · ${f.policyName || f.policy?.displayName}`)), []);
});

test('1.0.4 CA009: app protection on iOS and Android, with the exclusions it needs and no more', () => {
  const { S } = world();
  const b = S.bundle();
  const p = b.policies.find((x) => x.displayName.startsWith('CA009'));
  assert.equal(p.displayName, 'CA009-GRANT-SMB-Global-AnyApp-iOSorAndroid-AppProtection-v1.0.5');
  assert.deepEqual(plain(p.grantControls.builtInControls), ['compliantApplication'], 'approved client app retired 30 June 2026');
  assert.deepEqual(plain(p.conditions.platforms.includePlatforms), ['iOS', 'android']);
  assert.deepEqual(plain(p.conditions.applications.includeApplications), ['All']);
  assert.deepEqual(plain(p.conditions.applications.excludeApplications), ['a0e84e36-b067-4d5c-ab4a-3db38e598ae2', 'e724aa31-0f56-4018-b8be-f8cb82ca1196', 'ea890292-c8c8-4433-b5ea-b09d0668e1a6'], 'the Defender mobile apps and Azure Credential Configuration Endpoint Service — no Intune exclusion');
  for (const n of ['CA103', 'CA203', 'CA204']) assert.ok(b.policies.find((x) => x.displayName.startsWith(n)).conditions.applications.excludeApplications.includes('ea890292-c8c8-4433-b5ea-b09d0668e1a6'), `${n}: passkeys in Authenticator on a phone`);
  for (const n of ['CA201', 'CA202', 'CA205']) assert.ok(!b.policies.find((x) => x.displayName.startsWith(n)).conditions.applications.excludeApplications.includes('ea890292-c8c8-4433-b5ea-b09d0668e1a6'), `${n}: no phone, no exclusion`);
  const gname = Object.fromEntries(b.groups.map((g) => [g.id, g.displayName]));
  assert.deepEqual(plain(p.conditions.users.excludeGroups.map((g) => gname[g]).sort()), ['CAB-SEC-U-BreakGlass', 'CAB-SEC-U-SMB-CA009-Exclusion', 'CAB-SEC-U-TeamsSharedDevices']);
  assert.ok(p.conditions.users.excludeGuestsOrExternalUsers, 'guests out');
  assert.equal(b.forceOff.includes(p.displayName), false);
});

test('📘 the new MS Learn check: app protection on all resources without Azure Credential Configuration Endpoint Service is a finding, with a fix', () => {
  const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
  vm.createContext(box);
  vm.runInContext("const Baseline = undefined; function toolHead(){ return ''; }", box);
  vm.runInContext(read('mslearn.js') + '\n;globalThis.M = MSLearn;', box);
  const { M } = box;
  const pol = (exc, plat) => ({ id: 'p', displayName: 'APP', state: 'enabled', conditions: { users: { includeUsers: ['All'], excludeGroups: ['bg'] }, applications: { includeApplications: ['All'], excludeApplications: exc }, platforms: plat }, grantControls: { operator: 'OR', builtInControls: ['compliantApplication'] } });
  const hit = (p) => M.run([p], new Map(), { includeDisabled: true }).filter((f) => f.check.id === 'authenticator-passkey-app-protection');
  assert.equal(hit(pol([], { includePlatforms: ['iOS', 'android'] })).length, 1);
  assert.equal(hit(pol(['ea890292-c8c8-4433-b5ea-b09d0668e1a6'], { includePlatforms: ['iOS', 'android'] })).length, 0);
  assert.equal(hit(pol([], { includePlatforms: ['windows'] })).length, 0, 'not on Windows');
  const f = hit(pol([], { includePlatforms: ['iOS'] }))[0];
  const d = JSON.parse(JSON.stringify(pol([], { includePlatforms: ['iOS'] })));
  assert.match(f.check.fix(d).join(' '), /Azure Credential Configuration Endpoint Service/);
  assert.deepEqual(d.conditions.applications.excludeApplications, ['ea890292-c8c8-4433-b5ea-b09d0668e1a6']);
});
