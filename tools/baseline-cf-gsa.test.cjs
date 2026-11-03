// CloudFellows compliant-network parity with SMB Basic (build 33111):
// the catalog taken from CloudFellows.dev on 3 Nov 2026 (CA001 v1.0.3, CA018,
// CA113-CA116, CA215-CA218 v3.0.5/v3.0.1), the group templates the import
// creates for them, and the import's handling (CA113-CA116 and CA215-CA218
// land Off, CA001 retried without the compliant network). Workfile:
// docs/WORKFILE-CF-GSA-parity-SMB-2026-10-30.md. No credentials or network.
// Run: node --test tools/baseline-cf-gsa.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load() {
  const b = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, Date, encodeURIComponent, decodeURIComponent, setTimeout,
    localStorage: { getItem: () => null, setItem() {} }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; } },
    AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' } };
  vm.createContext(b);
  vm.runInContext(['groupTemplates.js', 'baselineData.js', 'baselineJoeyData.js', 'baseline.js', 'import.js'].map(read).join('\n;\n')
    + '\n;globalThis.I = Importer; globalThis.BD = BASELINE; globalThis.T = GROUP_TEMPLATES; globalThis.B = Baseline;', b);
  return b;
}
const { BD, T, I, B } = load();
const P = (n) => BD.policies.find((p) => p.num === n);
const CN = 'All Compliant Network locations';
const SMB_APPS = ['Microsoft Intune', 'Microsoft Intune Enrollment', 'MicrosoftDefenderATP XPlat', 'Microsoft Defender for Mobile TVM', 'Azure Credential Configuration Endpoint Service', 'Device Registration Service'];

test('CA215-CA218: DevOps in, Teams shared devices and their own exclusion group out, the SMB app set', () => {
  for (const n of [215, 216, 217, 218]) {
    const p = P(n);
    assert.ok(p, `CA${n} in the catalog`);
    assert.ok(p.include.includes('CAB-SEC-U-Persona-DevOps (group)'), `CA${n} includes DevOps`);
    assert.ok(p.exclude.includes('CAB-SEC-U-TeamsSharedDevices (group)'), `CA${n} excludes the shared devices`);
    assert.ok(p.exclude.includes(`CAB-SEC-U-CA${n}-Exclusion (group)`), `CA${n} has its own exclusion group`);
    for (const a of SMB_APPS) assert.ok(p.resources.includes(`− ${a}`), `CA${n} excludes ${a}`);
    assert.ok(!/Windows Azure Active Directory|My Apps|AADReporting/.test(p.resources), `CA${n} no longer excludes the directory`);
    assert.equal(p.network, `Any network or location · − ${CN}`);
    assert.equal(p.block, true);
  }
  assert.equal(P(215).version, '3.0.5');
  assert.equal(P(218).version, '3.0.1');
});

test('CA113-CA116: admins only through the compliant network, external admins and every external type out', () => {
  const plat = { 113: 'Windows', 114: 'macOS', 115: 'iOS', 116: 'Android' };
  const ca100 = P(100).include.filter((x) => x.endsWith('(role)'));
  for (const n of [113, 114, 115, 116]) {
    const p = P(n);
    assert.ok(p, `CA${n} in the catalog`);
    assert.equal(p.tag, 'NEW');
    assert.ok(p.include.includes('CAB-SEC-U-Persona-Admins (group)'));
    assert.deepEqual(new Set(p.include.filter((x) => x.endsWith('(role)'))), new Set(ca100), `CA${n} names the CA100 roles`);
    for (const g of ['CAB-SEC-U-BreakGlass', `CAB-SEC-U-CA${n}-Exclusion`, 'CAB-SEC-U-ExternalAdmins', 'CAB-SEC-U-Persona-GuestAdmins'])
      assert.ok(p.exclude.includes(`${g} (group)`), `CA${n} excludes ${g}`);
    assert.ok(p.exclude.some((x) => /^Guests & external users \(all types/.test(x)), `CA${n} excludes every external type`);
    assert.deepEqual(plain(p.conditions), [`Platforms: ${plat[n]}`, 'Client apps: Any client app']);
    assert.equal(p.network, `Any network or location · − ${CN}`);
  }
});

test('CA001 v1.0.3 excludes the compliant network; CA018 is in the catalog', () => {
  assert.equal(P(1).version, '1.0.3');
  assert.ok(P(1).network.includes(`− ${CN}`));
  assert.ok(P(18) && P(18).resources === 'Microsoft Intune Enrollment' && P(18).block);
  assert.equal(BD.revised, '2026-11-03');
});

test('every group the new entries name has a template, so the import can create it', () => {
  const have = new Set(T.map((t) => t.displayName));
  for (const n of [1, 18, 113, 114, 115, 116, 215, 216, 217, 218])
    for (const x of [...P(n).include, ...P(n).exclude].filter((s) => s.endsWith(' (group)')))
      assert.ok(have.has(x.replace(/ \(group\)$/, '')), `CA${n}: ${x} has a template`);
  assert.equal(new Set(T.map((t) => t.displayName)).size, T.length, 'no template twice');
});

const cfBundle = () => ({
  policies: BD.policies.filter((p) => [1, 18, 100, 113, 114, 115, 116, 200, 215, 216, 217, 218].includes(p.num))
    .map((p, i) => ({ id: `p${i}`, displayName: `(NEW)${p.name}`, state: 'enabled', conditions: { users: {}, locations: {} } })),
  groups: [],
});

test('import: a CloudFellows backup lands CA113-CA116 and CA215-CA218 Off and may drop CA001\'s compliant network', () => {
  const b = I.prepareBundle(cfBundle());
  const off = plain(b.forceOff).map((n) => +/CA(\d+)/.exec(n)[1]).sort((x, y) => x - y);
  assert.deepEqual(off, [113, 114, 115, 116, 215, 216, 217, 218]);
  assert.deepEqual(plain(b.cnOptional).map((n) => +/CA(\d+)/.exec(n)[1]), [1]);
  const plan = I.plan(b, []);
  const by = (n) => plan.find((x) => new RegExp(`CA0*${n}-`).test(x.name));
  assert.equal(by(215).forceOff, true);
  assert.equal(by(113).forceOff, true);
  assert.equal(by(1).cnOptional, true);
  assert.equal(by(18).forceOff, false, 'CA018 lands as the run lands');
  assert.equal(by(200).forceOff, false);
});

test('import: the rule is CloudFellows only — another catalog\'s CA001 or CA215 is left alone', () => {
  assert.equal(I.cloudFellowsGsa({ id: 'joey' }, [{ displayName: 'CA215-x' }]), null);
  assert.equal(I.cloudFellowsGsa(null, [{ displayName: 'CA001-x' }]), null);
  const r = I.cloudFellowsGsa({ id: 'limonit' }, [{ displayName: 'CA215-x' }, { displayName: 'CA001-y' }, { displayName: 'CA1100-z' }]);
  assert.deepEqual(plain(r), { forceOff: ['CA215-x'], cnOptional: ['CA001-y'] });
});

// 🗣 User impact brief: RULES_CHECKED_AGAINST moved to this revision, so the
// three shapes it touches are pinned here.
test('user impact: CA001 with the compliant network is a country rule, CA215/CA113 the client rule, CA018 the enrollment rule', () => {
  const b = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
  vm.createContext(b);
  vm.runInContext(['labels.js', 'model.js', 'baselineData.js', 'userimpact.js'].map(read).join('\n;\n') + '\n;globalThis.U = UserImpact; globalThis.BVM = buildViewModel;', b);
  const CNID = '3d46dbda-8382-466a-856d-eb00cbc6b910';
  const raw = (id, name, apps, exLoc, users) => ({ id, displayName: name, state: 'enabledForReportingButNotEnforced',
    conditions: { users, applications: { includeApplications: apps, excludeApplications: [] }, clientAppTypes: ['all'],
      locations: { includeLocations: ['All'], excludeLocations: exLoc } },
    grantControls: { operator: 'OR', builtInControls: ['block'] } });
  const all = { includeUsers: ['All'] };
  const pols = [
    raw('a', 'CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1.0.3', ['All'], ['country-loc', CNID], all),
    raw('b', 'CA215-BLOCK-Internals-CN-AllApps-Windows-Require Global Secure Access client active-v3.0.5', ['All'], [CNID], all),
    raw('c', 'CA113-BLOCK-Admins-CN-AllApps-Windows-Require Global Secure Access client active-v1.0', ['All'], [CNID], all),
    raw('d', 'CA018-BLOCK-Global-ASR-MicrosoftIntuneEnrollment-Windows-NonTrustedLocations-v1.0', ['d4ebce55-015a-49b5-a083-c84d1797ae8c'], ['AllTrusted'], all),
  ].map((p, i) => b.BVM(p, (id) => (id === CNID ? 'All Compliant Network locations' : id), i));
  const res = b.U.analyze(pols);
  const ruleOf = (id) => res.items.filter((it) => it.pols.some((p) => p.id === id)).map((it) => it.rule).sort();
  assert.deepEqual(plain(ruleOf('a')), ['geo']);
  assert.deepEqual(plain(ruleOf('b')), ['cn']);
  assert.deepEqual(plain(ruleOf('c')), ['cn']);
  assert.deepEqual(plain(ruleOf('d')), ['enroll']);
  assert.equal(res.baseline.stale, false, 'the rules were walked against this revision');
});
