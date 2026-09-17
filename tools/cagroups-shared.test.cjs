// 👥 CA groups (beta 25386): the groups every baseline shares — the 🚨
// E-Admins groups and the 🚀 CAD-SEC-U-DG deploy groups — count as the
// baseline's under whichever catalog is active, Joey Verlinden's included.
// No credentials, external packages or network.
// Run: node --test tools/cagroups-shared.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');

const gid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const JOEY_BG = 'CA-BreakGlassAccounts - Exclude';
const N000 = 'CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA';
const N100 = 'CA100-Admins-IdentityProtection-AdminPortals-AnyPlatform-MFA';
const N200 = 'CA200-Internals-IdentityProtection-AnyApp-AnyPlatform-MFA';
const N007 = 'CA007-Global-OlderRelease-AnyApp-AnyPlatform-MFA';   // shaped like his, not in the catalog
const E1100 = '(UP)CA1100-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access1-v3.0';
const E1101 = '(UP)CA1101-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access2-v3.0';
const E1102 = '(UP)CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0';
const E1103 = '(UP)CA1103-BLOCK-E-Admins-BP-AnyApp-NonWindowsPlatform-v3.0';
const E1104 = '(UP)CA1104-BLOCK-E-Admins-ASR-AnyApp-NonBrowserClients-v3.0';
const E1105 = '(UP)CA1105-SESSION-E-Admins-ASR-AllApps-SIF3h-NeverPersistent-v3.0';

// The tenant: Courseware after the Joey import in Deployment groups mode
// plus the E-Admins from a CloudFellows backup.
const GROUPS = [
  { id: gid(1), displayName: 'CAD-SEC-U-DG-ADM' },
  { id: gid(2), displayName: 'CAD-SEC-U-DG-GLO' },
  { id: gid(3), displayName: 'CAD-SEC-U-DG-INT' },
  { id: gid(4), displayName: 'CAD-SEC-U-DG-SA' },
  { id: gid(5), displayName: 'CAD-SEC-U-DG-GUESTUSERS' },
  { id: gid(6), displayName: 'Emergency_Access1' },
  { id: gid(7), displayName: JOEY_BG },
  { id: gid(8), displayName: `${N000} - Exclude` },
  { id: gid(9), displayName: 'Global-U-Exclude-MFA-P' },                // ad hoc — stays "not in the baseline"
  { id: gid(10), displayName: 'APP_Microsoft365_E5' },                  // Joey's example include group
  { id: gid(11), displayName: `${N007} - Exclude` },                    // his naming rule, older policy name
  { id: gid(12), displayName: 'Break-Glass-Team-Cloud' },               // what an E-Admins policy includes here
  { id: gid(13), displayName: 'CAB-SEC-U-BreakGlass' },                 // left by an earlier CloudFellows import
  { id: gid(14), displayName: 'CAD-SEC-U-DG-FW' },                      // no policy names it (tenant scope)
  { id: gid(15), displayName: 'Random-Security-Group' },                // no policy names it (tenant scope)
  { id: gid(16), displayName: 'CA403-Guests-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser - Exclude' },
  { id: gid(17), displayName: 'CA600-Global-NextRelease-AnyApp-AnyPlatform-MFA - Exclude' },   // only a newer release ships it
];
const pol = (id, name, users) => ({ id, name, state: 'disabled', raw: { id, displayName: name, state: 'disabled',
  conditions: { users: { includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: [], ...users } } } });
const POLICIES = [
  pol('p000', N000, { includeGroups: [gid(2)], excludeGroups: [gid(8), gid(7), gid(9)] }),
  pol('p100', N100, { includeGroups: [gid(1)], excludeGroups: [gid(7)] }),
  pol('p200', N200, { includeGroups: [gid(3), gid(10)], excludeGroups: [gid(7)] }),
  pol('p300', 'CA300-ServiceAccounts-IdentityProtection-AnyApp-AnyPlatform-MFA', { includeGroups: [gid(4)], excludeGroups: [gid(7)] }),
  pol('p400', 'CA400-GuestUsers-IdentityProtection-AnyApp-AnyPlatform-MFA', { includeGroups: [gid(5)], excludeGroups: [gid(7), gid(16), gid(17)] }),
  pol('p007', N007, { includeGroups: [gid(2)], excludeGroups: [gid(11)] }),
  pol('e1100', E1100, { includeGroups: [gid(6)] }),
  pol('e1101', E1101, { includeGroups: [] }),
  pol('e1102', E1102, { includeGroups: [gid(7), gid(12)] }),
  pol('e1103', E1103, { includeGroups: [gid(7), gid(13)] }),
  pol('e1104', E1104, { includeGroups: [gid(7)] }),
  pol('e1105', E1105, { includeGroups: [gid(7)] }),
];

function world(opts = {}) {
  const groups = opts.groups || GROUPS;
  const Graph = {
    async ggetAll(url) {
      const q = decodeURIComponent(url);
      if (/displayName eq '/.test(q)) {
        const names = [...q.matchAll(/displayName eq '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'").toLowerCase());
        return groups.filter((g) => names.includes(g.displayName.toLowerCase()));
      }
      if (/id eq '/.test(q)) {
        const ids = [...q.matchAll(/id eq '([^']+)'/g)].map((m) => m[1]);
        return groups.filter((g) => ids.includes(g.id));
      }
      if (/securityEnabled eq true/.test(q)) return groups.slice();
      return [];
    },
  };
  let stored = opts.active || 'joey';
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, JSON, encodeURIComponent, decodeURIComponent, Date, Math,
    localStorage: { getItem: () => stored, setItem: (k, v) => { stored = v; } },
    document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : Math.floor(num / 100) * 100, label: 'x' }; } },
    Graph };
  if (opts.live) box.BaselineLive = { catalog: () => box.__live || null };
  vm.createContext(box);
  const src = ['baselineData.js', 'groupTemplates.js', 'baselineJoeyData.js', 'baseline.js', 'cagroups.js', 'baselineCleanup.js']
    .map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n;\n');
  vm.runInContext(`${src}
;globalThis.B = Baseline; globalThis.C = CaGroups; globalThis.BC = BaselineCleanup;
globalThis.J = BASELINE_JOEY;`, box);
  if (opts.live) {
    box.__live = { ...box.J, source: 'live', policies: box.J.policies.map((p) => ({ ...p })),
      bundle: { groups: [{ id: 'x', displayName: 'CA600-Global-NextRelease-AnyApp-AnyPlatform-MFA - Exclude' }] } };
  }
  box.B.use('courseware');
  return box;
}
const byName = (res) => Object.fromEntries(res.rows.map((r) => [r.name, r]));

test('Joey active, policies scope: the deploy groups and the E-Admins groups are the baseline’s, the ad-hoc group is not', async () => {
  const w = world();
  assert.equal(w.B.active().id, 'joey');
  const res = await w.C.scan(POLICIES, { scope: 'policies' });
  const r = byName(res);
  for (const n of ['CAD-SEC-U-DG-ADM', 'CAD-SEC-U-DG-GLO', 'CAD-SEC-U-DG-INT', 'CAD-SEC-U-DG-SA', 'CAD-SEC-U-DG-GUESTUSERS']) {
    assert.equal(r[n].status, 'present', `${n} counts as the baseline's`);
    assert.equal(r[n].basis, 'deploy');
  }
  assert.equal(r.Emergency_Access1.status, 'present');
  assert.equal(r.Emergency_Access1.basis, 'eadmins');
  assert.equal(r['CAB-SEC-U-BreakGlass'].status, 'present', 'the CloudFellows break-glass group is an E-Admins group too');
  assert.equal(r['CAB-SEC-U-BreakGlass'].basis, 'eadmins');
  assert.equal(r['Break-Glass-Team-Cloud'].status, 'present', 'a group an E-Admins policy includes is an E-Admins group');
  assert.equal(r['Break-Glass-Team-Cloud'].basis, 'eadmins-target');
  assert.equal(r[JOEY_BG].status, 'present');
  assert.equal(r[JOEY_BG].basis, 'template');
  assert.equal(r['APP_Microsoft365_E5'].status, 'present', "Joey's example include group is his");
  assert.equal(r[`${N007} - Exclude`].status, 'present', 'the naming rule for a policy the tenant has');
  assert.equal(r[`${N007} - Exclude`].basis, 'convention');
  assert.equal(r['Global-U-Exclude-MFA-P'].status, 'extra', 'an ad-hoc group is still not in the baseline');
  assert.equal(r['Global-U-Exclude-MFA-P'].basis, null);
  const g403 = r['CA403-Guests-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser - Exclude'];
  assert.equal(g403.status, 'present', 'the name his own group file gives');
  assert.equal(g403.basis, 'repository');
  assert.equal(r['CA600-Global-NextRelease-AnyApp-AnyPlatform-MFA - Exclude'].status, 'extra', 'not in the bundled release, no live read here');
  assert.equal(res.counts.extra, 2, 'the ad-hoc group and the newer release name');
  assert.equal(res.other, null, 'the six shared E-Admins policies are no sign of the CloudFellows baseline');
});

test('live repository: a group file of the release it read counts as the baseline’s', async () => {
  const w = world({ live: true });
  assert.equal(w.B.active().source, 'live');
  const res = await w.C.scan(POLICIES, { scope: 'policies' });
  const r = byName(res)['CA600-Global-NextRelease-AnyApp-AnyPlatform-MFA - Exclude'];
  assert.equal(r.status, 'present');
  assert.equal(r.basis, 'repository');
  assert.equal(res.counts.extra, 1, 'only the ad-hoc group is left');
});

test('Joey active, baseline + templates: the Emergency_Access pair is expected and creatable; CAB-SEC-U-BreakGlass is not expected', async () => {
  const w = world({ groups: GROUPS.filter((g) => g.displayName !== 'CAB-SEC-U-BreakGlass') });
  const res = await w.C.scan(POLICIES, { scope: 'all' });
  const r = byName(res);
  assert.equal(r.Emergency_Access2.status, 'missing', 'expected under every baseline — CA1101 names it');
  assert.ok(r.Emergency_Access2.template, 'the CloudFellows template makes it creatable');
  assert.ok(w.C.creatable(res).some((x) => x.name === 'Emergency_Access2'));
  assert.equal(r['CAB-SEC-U-BreakGlass'], undefined, "Joey's own break-glass group does that job here");
  assert.equal(r[JOEY_BG].status, 'present');
  assert.equal(Object.keys(r).filter((n) => /^CAD-SEC-U-DG-/.test(n) && r[n].status === 'missing').length, 0, 'deploy groups are recognised, never expected');
});

test('tenant scope: an unused deploy group is the baseline’s, an unrelated group is not', async () => {
  const w = world();
  const res = await w.C.scan(POLICIES, { scope: 'tenant' });
  const r = byName(res);
  assert.equal(r['CAD-SEC-U-DG-FW'].status, 'present');
  assert.equal(r['CAD-SEC-U-DG-FW'].basis, 'deploy');
  assert.equal(r['Random-Security-Group'].status, 'extra');
});

test('CloudFellows active: nothing moves — its own groups keep their own basis', async () => {
  const w = world({ active: 'limonit' });
  assert.equal(w.B.active().id, 'limonit');
  const res = await w.C.scan(POLICIES, { scope: 'policies' });
  const r = byName(res);
  assert.equal(r['CAD-SEC-U-DG-ADM'].status, 'present');
  assert.equal(r['CAD-SEC-U-DG-ADM'].basis, 'catalog', 'a CloudFellows predefined name, not a shared note');
  assert.equal(r.Emergency_Access1.basis, 'template');
  assert.equal(r['Global-U-Exclude-MFA-P'].status, 'extra');
});

test('the other-baseline hint still fires for real CloudFellows policies', async () => {
  const w = world();
  const cf = w.B.catalog('limonit').policies.filter((p) => !/E-Admins/.test(p.name)).slice(0, 3);
  const pols = [...POLICIES, ...cf.map((p, i) => pol(`cf${i}`, p.name, {}))];
  const other = w.C.otherBaseline(pols);
  assert.ok(other, 'three CloudFellows-only names are a signal');
  assert.equal(other.catalog.id, 'limonit');
  assert.equal(other.hits, 3, 'the six E-Admins are not counted');
});

test('Joey contract files the shared groups: E-Admins in the break-glass unit, deploy groups by their persona code', () => {
  const w = world();
  const c = w.B.active();
  assert.equal(c.codeForGroup('Emergency_Access1'), 'BreakGlass');
  assert.equal(c.codeForGroup('emergency_access2'), 'BreakGlass');
  assert.equal(c.codeForGroup('CAB-SEC-U-BreakGlass'), 'BreakGlass');
  assert.equal(c.codeForGroup(JOEY_BG), 'BreakGlass');
  assert.equal(c.codeForGroup('CAD-SEC-U-DG-ADM'), 'ADM');
  assert.equal(c.codeForGroup('CAD-SEC-U-DG-GUESTUSERS'), 'GUESTUSERS');
  assert.equal(c.codeForGroup('CAD-SEC-U-DG-GUESTAdmins'), null, 'Joey has no guest-admin persona — never a guess');
  assert.equal(c.codeForGroup('Break-Glass-Team-Cloud'), null, 'exact names only');
  assert.equal(c.codeForGroup('Global-U-Exclude-MFA-P'), null);
  assert.equal(c.auName(c.codeForGroup('Emergency_Access1')), 'CA-RMAU-BreakGlass');
});

test('Baseline.sharedGroups / sharedFamily', () => {
  const w = world();
  const joey = JSON.parse(JSON.stringify(w.B.sharedGroups(w.B.catalog('joey'))));
  const e = joey.filter((s) => s.family === 'eadmins');
  assert.deepEqual(e.map((s) => s.name).sort(), ['CAB-SEC-U-BreakGlass', 'Emergency_Access1', 'Emergency_Access2']);
  assert.deepEqual(e.filter((s) => s.expected).map((s) => s.name).sort(), ['Emergency_Access1', 'Emergency_Access2']);
  assert.ok(joey.filter((s) => s.family === 'deploy').length >= 9);
  assert.ok(joey.filter((s) => s.family === 'deploy').every((s) => !s.expected));
  const cf = JSON.parse(JSON.stringify(w.B.sharedGroups(w.B.catalog('limonit'))));
  assert.ok(cf.filter((s) => s.family === 'eadmins').every((s) => s.expected), 'CloudFellows expects all three');
  assert.equal(w.B.sharedFamily('cad-sec-u-dg-custom'), 'deploy');
  assert.equal(w.B.sharedFamily('CAD-SEC-U-CA001-Exclusion'), null);
  assert.equal(w.B.sharedFamily('Emergency_Access1'), 'eadmins');
  assert.equal(w.B.sharedFamily('Emergency_Access3'), null);
});

test('baseline switch cleanup: a shared group is no leftover of the old baseline', () => {
  const w = world();
  const cf = w.B.withContract(w.B.catalog('limonit'));
  const joey = w.B.active();
  const res = w.BC.scan(cf, joey, {
    groups: [
      { id: 'a', displayName: 'CAD-SEC-U-DG-INT', memberCount: 0 },
      { id: 'b', displayName: 'CAB-SEC-U-CA201-Exclusion', memberCount: 0 },
      { id: 'c', displayName: 'Emergency_Access1', memberCount: 1 },
    ],
    aus: [], policies: [], protection: new Map(),
  });
  const names = JSON.parse(JSON.stringify(res.groups || res.rows || [])).map((x) => x.name);
  assert.ok(names.includes('CAB-SEC-U-CA201-Exclusion'), 'a CloudFellows exclusion group is still a leftover');
  assert.ok(!names.includes('CAD-SEC-U-DG-INT'), 'the deploy group serves Joey as well');
  assert.ok(!names.includes('Emergency_Access1'));
});
