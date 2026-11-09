// 🚀 Trial on deployment group / ↩ Back to persona and the As shipped
// default import (beta 33203, e04–e09 — decisions Mihai, 7 Nov):
// js/dgtrial.js, the import's deploy groups and saved includes, the
// security-defaults take-over under SMB Basic. No credentials, packages or
// network. Run: node --test tools/dgtrial.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const RO = 'enabledForReportingButNotEnforced';

function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

// A fake tenant: policies, groups (with members), PATCH replaces conditions.users.
function tenant(opts = {}) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const pols = new Map(), groups = new Map(), posts = [], patches = [];
  for (const g of opts.groups || []) groups.set(g.id, { members: [], ...g });
  for (const p of opts.policies || []) pols.set(p.id, structuredClone(p));
  const Graph = {
    async ggetAll(url) {
      const u = decodeURIComponent(url);
      const m = /displayName eq '(.*)'/.exec(u);
      if (u.startsWith('/groups?') && m) return [...groups.values()].filter((g) => g.displayName.toLowerCase() === m[1].replace(/''/g, "'").toLowerCase()).map((g) => ({ id: g.id, displayName: g.displayName }));
      const t = /^\/groups\/([^/]+)\/transitiveMembers/.exec(u);
      if (t) return ((groups.get(t[1]) || {}).members || []).map((x) => ({ id: x, displayName: `User ${x}`, userPrincipalName: `${x}@contoso.com` }));
      return [];
    },
    async gget(url) {
      const g = /^\/groups\/([^/?]+)/.exec(url);
      if (g) return { id: g[1], displayName: (groups.get(g[1]) || {}).displayName };
      const p = pols.get(url.split('/').pop());
      return p ? structuredClone(p) : {};
    },
    async gpatch(url, body) {
      if (opts.failPatch) throw new Error('Graph request failed (400): BadRequest');
      patches.push([url, structuredClone(body)]);
      const p = pols.get(url.split('/').pop());
      if (p && body.conditions && body.conditions.users) p.conditions.users = structuredClone(body.conditions.users);
      if (p && body.state) p.state = body.state;
      return null;
    },
    async gpost(url, body) {
      posts.push([url, structuredClone(body)]);
      if (url === '/directoryObjects/getByIds') return { value: body.ids.filter((x) => groups.has(x)).map((x) => ({ id: x })) };
      if (url === '/identity/conditionalAccess/policies') { const p = { ...structuredClone(body), id: id() }; pols.set(p.id, p); return { id: p.id }; }
      return { id: id() };
    },
    async existingAppIds(ids) { return new Set(ids); },
  };
  const Assign = {
    async createGroup(t) {
      const hit = [...groups.values()].find((g) => g.displayName.toLowerCase() === t.displayName.toLowerCase());
      if (hit) return { id: hit.id, name: hit.displayName, created: false };
      const g = { id: id(), displayName: t.displayName, members: [] }; groups.set(g.id, g);
      return { id: g.id, name: g.displayName, created: true };
    },
    templates: () => [],
  };
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, Date, encodeURIComponent, decodeURIComponent, setTimeout,
    localStorage: mem(), document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; } },
    AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, Graph, Assign };
  vm.createContext(box);
  const src = ['baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js', 'import.js', 'dgtrial.js', 'eadminsData.js', 'joeyPlusData.js', 'secdefaults.js'].map(read).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.D = DgTrial; globalThis.I = Importer; globalThis.B = Baseline; globalThis.SMB = BASELINE_SMB; globalThis.J = JOEY_PLUS; globalThis.E = E_ADMINS; globalThis.SD = SecDefaults;`, box);
  return { ...box, Graph, pols, groups, posts, patches, ls: box.localStorage };
}

const ROLES = Array.from({ length: 132 }, (_, i) => `role-${String(i).padStart(3, '0')}`);
const pol = (id, name, users, state = RO) => ({ id, displayName: name, state, conditions: { clientAppTypes: ['all'], applications: { includeApplications: ['All'] },
  users: { includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [], ...users } }, grantControls: { operator: 'OR', builtInControls: ['mfa'] } });

// ---- e07 / e05 / e09: which policies a trial is allowed for ----
test('e07: CloudFellows CA000, CA006, CA099, CA1009 are refused with the reason and the rule; CA001 goes to DG-GLO', () => {
  const { D } = tenant();
  for (const [n, name] of [[0, 'CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3'], [6, 'CA006-GRANT-Global-DP-Office365-iOSorAndroid-RequireAppProtection-v1.0.2'],
    [99, 'CA099-BLOCK-Global-IdentityProtection-AllApps-AnyPlatform-Block-Non-persona-v1.0.3'], [1009, 'CA1009-BLOCK-DevOps-ASR-AzureDevops-AnyPlatform-BlockNonDevOpsPersona-v3.0']]) {
    const r = D.rule({ name });
    assert.equal(r.ok, false, name); assert.equal(r.code, 'allUsers'); assert.equal(r.catalog, 'limonit');
    assert.match(r.reason, new RegExp(`CA${String(n).padStart(3, '0')}`));
    assert.match(r.guidance, /Report-only evaluation.*then On.*CA099 last/);
  }
  assert.match(D.rule({ name: 'CA099-BLOCK-Global-IdentityProtection-AllApps-AnyPlatform-Block-Non-persona-v1.0.3' }).reason, /without a persona would be blocked/);
  const ok = D.rule({ name: 'CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1.0.3' });
  assert.equal(ok.ok, true); assert.equal(ok.dg, 'CAD-SEC-U-DG-GLO');
  assert.equal(D.rule({ name: 'CA100-GRANT-Admins-IP-AdminPortals-AnyPlatform-MFA-v1.0.3' }).dg, 'CAD-SEC-U-DG-ADM');
  assert.equal(D.rule({ name: 'CA1100-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access1-v3.0' }).code, 'eadmins');
  // Joey's CA000 is NOT the CloudFellows one: no version suffix, a normal Global policy
  assert.equal(D.rule({ name: 'CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA' }).ok, true);
});

test('e05: SMB Basic CA001–CA005 replace security defaults — no deployment-group trial; CA006–CA010 go to DG-GLO', () => {
  const { D, SMB } = tenant();
  for (const p of SMB.policies) {
    const r = D.rule({ name: p.name });
    if (p.num >= 1 && p.num <= 5) { assert.equal(r.ok, false, p.name); assert.equal(r.code, 'sdReplace'); assert.match(r.guidance, /⇄ Switch.*CA001–CA005 On in one run/); }
    else if (p.num <= 10) assert.equal(r.dg, 'CAD-SEC-U-DG-GLO', p.name);
  }
  assert.deepEqual(plain(SMB.replacing().map((n) => n.slice(0, 5))), ['CA001', 'CA002', 'CA003', 'CA004', 'CA005']);
});

test('e09: SMB CA201–CA204 reach CAD-SEC-U-DG-INT by number range, labelled Compliant network; DevOps is CAD-SEC-U-DG-DevOps everywhere', () => {
  const { D, I, SMB } = tenant();
  for (const p of SMB.policies.filter((x) => x.num >= 201 && x.num <= 204)) {
    assert.equal(I.personaOf(p.name), 'internals', p.name);
    const r = D.rule({ name: p.name });
    assert.equal(r.dg, 'CAD-SEC-U-DG-INT'); assert.equal(r.label, 'Compliant network');
  }
  const plan = I.plan(I.prepareBundle(SMB.bundle()), []);
  assert.ok(plan.filter((p) => /^CA20[1-4]/.test(p.name)).every((p) => p.personaGroup === 'CAD-SEC-U-DG-INT' && p.dgLabel === 'Compliant network'));
  assert.equal(D.rule({ name: 'CA201-GRANT-Internals-IP-AnyApp-AnyPlatform-MediumUserRisk-v3.0' }).label, 'Internals', 'CloudFellows Internals keep their name');
  assert.equal(I.PERSONA_GROUPS.devops, 'CAD-SEC-U-DG-DevOps');
  assert.equal(D.DG_FALLBACK.devops, 'CAD-SEC-U-DG-DevOps');
  const files = [...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join('js', f)), 'index.html'];
  for (const f of files) for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/CAD-SEC-U-DG-devops/gi)) assert.equal(m[0], 'CAD-SEC-U-DG-DevOps', `${f}: ${m[0]}`);
});

// ---- e06: the original include, saved and restored exactly ----
test('e06: a role-only policy (CA100, 132 roles) goes on DG-ADM and back with every role; the record is saved before the write', async () => {
  const t = tenant({ groups: [{ id: 'dg-adm', displayName: 'CAD-SEC-U-DG-ADM', members: ['u1'] }],
    policies: [pol('p100', 'CA100-GRANT-Admins-IP-AdminPortals-AnyPlatform-MFA-v1.0.3', { includeRoles: ROLES, excludeGroups: ['g-bg'], excludeRoles: ['role-x'] })] });
  const st = t.D.store('tenant-1', t.ls);
  const r = await t.D.trial(t.Graph, 'p100', { store: st, dgId: 'dg-adm', dgName: 'CAD-SEC-U-DG-ADM', waits: [0] });
  assert.equal(r.ok, true);
  const u = t.pols.get('p100').conditions.users;
  assert.deepEqual(plain(u.includeGroups), ['dg-adm']); assert.deepEqual(plain(u.includeRoles), []);
  assert.deepEqual(plain(u.excludeGroups), ['g-bg']); assert.deepEqual(plain(u.excludeRoles), ['role-x'], 'exclusions untouched');
  const rec = st.get('p100');
  assert.equal(rec.original.includeRoles.length, 132);
  assert.ok(JSON.parse(t.ls.getItem('enca-dgtrial:tenant-1')).p100, 'kept per tenant under enca-dgtrial:<tenant>');
  const b = await t.D.back(t.Graph, 'p100', { store: st, waits: [0] });
  assert.equal(b.source, 'record');
  const after = t.pols.get('p100').conditions.users;
  assert.deepEqual(plain(after.includeRoles), ROLES); assert.deepEqual(plain(after.includeGroups), []);
  assert.equal(st.get('p100'), null, 'record dropped after a verified restore');
});

test('e06: groups AND roles AND the guest clause come back (CA113 shape, Joey+ Admins / SMB CA004 role-only alike)', async () => {
  const guests = { guestOrExternalUserTypes: 'b2bCollaborationGuest,internalGuest', externalTenants: { membershipKind: 'all' } };
  const t = tenant({ groups: [{ id: 'dg-adm', displayName: 'CAD-SEC-U-DG-ADM' }],
    policies: [pol('p113', 'CA113-BLOCK-Admins-CN-AllApps-Windows-Require Global Secure Access client active-v1.0', { includeGroups: ['g-persona-adm'], includeRoles: ROLES.slice(0, 40), includeGuestsOrExternalUsers: guests,
      excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: 'serviceProvider', externalTenants: { membershipKind: 'all' } } }),
    pol('p004', 'CA004-GRANT-SMB-Admins-AnyApp-AnyPlatform-MFA-v1.0', { includeRoles: ROLES.slice(0, 16) })] });
  const st = t.D.store('t', t.ls);
  const before = plain(t.pols.get('p113').conditions.users);
  await t.D.trial(t.Graph, 'p113', { store: st, dgId: 'dg-adm', waits: [0] });
  assert.equal(t.pols.get('p113').conditions.users.includeGuestsOrExternalUsers, undefined, 'the trial includes the testers only');
  assert.ok(t.pols.get('p113').conditions.users.excludeGuestsOrExternalUsers, 'the excluded guest clause rides along');
  await t.D.back(t.Graph, 'p113', { store: st, waits: [0] });
  assert.deepEqual(plain(t.pols.get('p113').conditions.users), before, 'exactly as before');
  await assert.rejects(t.D.trial(t.Graph, 'p004', { store: st, dgId: 'dg-adm', waits: [0] }), /replace security defaults/, 'SMB CA004 is one of the five');
});

test('e06: nothing is written when the include cannot be saved; a refused PATCH leaves no record; a changed include needs force', async () => {
  const mk = (o) => tenant({ ...o, groups: [{ id: 'dg-int', displayName: 'CAD-SEC-U-DG-INT' }], policies: [pol('p200', 'CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1', { includeGroups: ['g-int'] })] });
  const t1 = mk();
  const refuse = { get: () => null, put: () => false, drop: () => true };
  await assert.rejects(t1.D.trial(t1.Graph, 'p200', { store: refuse, dgId: 'dg-int', waits: [0] }), /could not be saved.*nothing was written/);
  assert.equal(t1.patches.length, 0);
  const t2 = mk({ failPatch: true });
  const st2 = t2.D.store('t', t2.ls);
  await assert.rejects(t2.D.trial(t2.Graph, 'p200', { store: st2, dgId: 'dg-int', waits: [0] }), /400/);
  assert.equal(st2.get('p200'), null, 'no record for a trial that did not happen');
  const t3 = mk();
  const st3 = t3.D.store('t', t3.ls);
  await t3.D.trial(t3.Graph, 'p200', { store: st3, dgId: 'dg-int', waits: [0] });
  await assert.rejects(t3.D.trial(t3.Graph, 'p200', { store: st3, dgId: 'dg-int', waits: [0] }), /already on/);
  t3.pols.get('p200').conditions.users.includeGroups.push('g-someone');
  await assert.rejects(t3.D.back(t3.Graph, 'p200', { store: st3, waits: [0] }), /changed since the trial/);
  await t3.D.back(t3.Graph, 'p200', { store: st3, force: true, waits: [0] });
  assert.deepEqual(plain(t3.pols.get('p200').conditions.users.includeGroups), ['g-int']);
});

test('e06: without a record ↩ rebuilds the include from the catalog — CloudFellows CA113 (group + roles by name), SMB CA004 (role ids from the bundle)', async () => {
  const t = tenant({ groups: [{ id: 'g-adm', displayName: 'CAB-SEC-U-Persona-Admins' }] });
  const cf = t.B.catalog('limonit').policies.find((p) => p.num === 113);
  const spec = t.D.catalogSpec(cf);
  assert.deepEqual(plain(spec.groups), ['CAB-SEC-U-Persona-Admins']);
  assert.ok(spec.roles.length > 20 && !spec.unparsed.length);
  const inc = await t.D.resolveSpec(spec, { groupIdByName: async (n) => (n === 'CAB-SEC-U-Persona-Admins' ? 'g-adm' : null), roleIdByName: async (n) => `id:${n}` });
  assert.deepEqual(plain(inc.includeGroups), ['g-adm']); assert.equal(inc.includeRoles.length, spec.roles.length);
  const smb = t.D.bundleSpec(t.SMB.bundle(), 'CA004-GRANT-SMB-Admins-AnyApp-AnyPlatform-MFA-v1.0');
  assert.ok(smb.roleIds.length >= 16 && !smb.groups.length && !smb.unparsed.length);
  // a version later, the same CA number still finds the bundle row
  assert.ok(t.D.bundleSpec(t.SMB.bundle(), 'CA004-GRANT-SMB-Admins-AnyApp-AnyPlatform-MFA-v1.1'));
  await assert.rejects(t.D.resolveSpec(t.D.catalogSpec({ include: ['Guests & external users (all types)'] }), {}), /cannot be rebuilt/);
  await assert.rejects(t.D.resolveSpec(spec, { groupIdByName: async () => null, roleIdByName: async () => 'x' }), /not in this tenant/);
  // and back() uses it, saying so
  const t2 = tenant({ policies: [pol('p', 'CA100-GRANT-Admins-IP-AdminPortals-AnyPlatform-MFA-v1.0.3', { includeGroups: ['dg-adm'] })] });
  const b = await t2.D.back(t2.Graph, 'p', { store: t2.D.store('t', t2.ls), original: { includeUsers: [], includeGroups: [], includeRoles: ROLES, includeGuestsOrExternalUsers: null }, source: 'catalog', waits: [0] });
  assert.equal(b.source, 'catalog'); assert.equal(t2.pols.get('p').conditions.users.includeRoles.length, 132);
  await assert.rejects(t2.D.back(t2.Graph, 'p', { store: t2.D.store('t', t2.ls), waits: [0] }), /no saved include/);
  assert.match(t2.D.report({ tenant: 'x' }, [{ name: 'CA100', action: 'trial', ok: true, dg: 'CAD-SEC-U-DG-ADM', original: { includeRoles: ['r1'] } }]), /"includeRoles": \[\s*"r1"/);
});

// ---- e08: the pre-flight ----
test('e08: per tester — in the exclusion group, break-glass, TeamsSharedDevices, an excluded persona; DG-INT tester outside Internals', async () => {
  const t = tenant({ groups: [
    { id: 'dg-int', displayName: 'CAD-SEC-U-DG-INT', members: ['ok', 'ex', 'bg', 'tsd', 'per', 'noint'] },
    { id: 'g-ex', displayName: 'CAB-SEC-U-CA200-Exclusion', members: ['ex'] },
    { id: 'g-bg', displayName: 'CAB-SEC-U-BreakGlass', members: ['bg'] },
    { id: 'g-tsd', displayName: 'CAB-SEC-U-TeamsSharedDevices', members: ['tsd'] },
    { id: 'g-ext', displayName: 'CAB-SEC-U-Persona-Externals', members: ['per'] },
    { id: 'g-int', displayName: 'CAB-SEC-U-Persona-Internals', members: ['ok', 'ex', 'bg', 'tsd', 'per'] },
  ] });
  const raw = pol('p', 'CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1', { includeGroups: ['g-int'], excludeGroups: ['g-ex', 'g-bg', 'g-ext'] });
  const pre = await t.D.readPreflight(t.Graph, raw, { dg: { id: 'dg-int', name: 'CAD-SEC-U-DG-INT' }, breakGlass: 'CAB-SEC-U-BreakGlass', sharedDevices: 'CAB-SEC-U-TeamsSharedDevices', internals: 'CAB-SEC-U-Persona-Internals', catalog: 'limonit' });
  const by = Object.fromEntries(pre.rows.map((r) => [r.tester.id, r.warnings.map((w) => w.kind)]));
  assert.deepEqual(plain(by.ok), []);
  assert.deepEqual(plain(by.ex), ['exclusion']);
  assert.deepEqual(plain(by.bg), ['breakglass']);
  assert.deepEqual(plain(by.tsd), ['sharedDevices'], 'TSD warned even where the policy does not exclude it');
  assert.deepEqual(plain(by.per), ['persona']);
  assert.deepEqual(plain(by.noint), ['notInternals']);
  assert.equal(pre.warnings, 5);
  const empty = t.D.preflight({ raw, dg: { id: 'x', name: 'CAD-SEC-U-DG-GLO' }, testers: [], groups: [] });
  assert.match(empty.notes[0].text, /no members/);
  // SMB has no Internals persona: the DG-INT (Compliant network) check is not made
  const smb = t.D.preflight({ raw, dg: { id: 'dg-int', name: 'CAD-SEC-U-DG-INT' }, testers: [{ id: 'noint' }], groups: [], internals: 'CAB-SEC-U-Persona-Internals', catalog: 'smb' });
  assert.equal(smb.warnings, 0);
});

// ---- e04: the default import ----
const cfBundle = () => ({ catalogId: 'limonit',
  groups: [{ id: 's-adm', displayName: 'CAB-SEC-U-Persona-Admins' }, { id: 's-int', displayName: 'CAB-SEC-U-Persona-Internals' }, { id: 's-bg', displayName: 'CAB-SEC-U-BreakGlass' }, { id: 's-ext', displayName: 'CAB-SEC-U-Persona-Externals' }],
  namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [],
  policies: [
    pol(null, 'CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3', { includeUsers: ['All'], excludeGroups: ['s-bg', 's-adm', 's-int', 's-ext'] }, 'disabled'),
    pol(null, 'CA100-GRANT-Admins-IP-AdminPortals-AnyPlatform-MFA-v1.0.3', { includeRoles: ROLES, excludeGroups: ['s-bg'] }, 'disabled'),
    pol(null, 'CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1', { includeGroups: ['s-int'], excludeGroups: ['s-bg'] }, 'disabled'),
    pol(null, 'CA300-GRANT-Externals-IP-AnyApp-AnyPlatform-MFA-v3.0.1', { includeGroups: ['s-ext'], excludeGroups: ['s-bg'] }, 'disabled'),
  ].map((p) => { delete p.id; return p; }) });
async function run(t, bundle, mode, landState) {
  const prepared = t.I.prepareBundle(bundle);
  const chosen = t.I.plan(prepared, []).filter((p) => !p.exists);
  const scoped = t.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await t.I.ensureDependencies(scoped, () => {}, { matchedNames: mode === 'shipped' ? chosen.map((p) => p.name) : [], deployGroups: mode === 'shipped' });
  const res = await t.I.importPolicies(chosen, dep.maps, () => {}, { mode, landState, readWaits: { missing: [1], stale: [1] } });
  return { chosen, dep, res, by: Object.fromEntries(res.results.map((r) => [r.name.slice(0, 6).replace(/-$/, ''), r])) };
}

test('e04: As shipped, Report-only — persona groups attached (roles kept), deploy groups created EMPTY and attached to nothing; none for CA000', async () => {
  const t = tenant();
  const { dep, res, by } = await run(t, cfBundle(), 'shipped', RO);
  assert.ok(res.results.every((r) => r.ok), JSON.stringify(res.results.filter((r) => !r.ok)));
  for (const k of ['CA000', 'CA100', 'CA200', 'CA300']) assert.equal(by[k].state, RO, `${k} lands Report-only`);
  const names = [...t.groups.values()].map((g) => g.displayName);
  for (const n of ['CAD-SEC-U-DG-ADM', 'CAD-SEC-U-DG-INT', 'CAD-SEC-U-DG-EXT']) assert.ok(names.includes(n), `${n} created`);
  assert.ok(!names.includes('CAD-SEC-U-DG-GLO'), 'only CA000 is Global here, and it is never tried on a deploy group');
  assert.ok([...t.groups.values()].filter((g) => /^CAD-SEC-U-DG-/.test(g.displayName)).every((g) => !g.members.length), 'empty');
  assert.ok(dep.log.created.some((l) => /Group \(deploy, empty — for 🚀 Trial on deployment group\): CAD-SEC-U-DG-ADM/.test(l)));
  const posted = t.posts.filter(([u]) => u === '/identity/conditionalAccess/policies').map(([, b]) => b);
  const dgIds = new Set([...t.groups.values()].filter((g) => /^CAD-SEC-U-DG-/.test(g.displayName)).map((g) => g.id));
  assert.ok(posted.every((b) => !(b.conditions.users.includeGroups || []).some((g) => dgIds.has(g))), 'no policy points at a deploy group');
  assert.equal(posted.find((b) => b.displayName.startsWith('CA100')).conditions.users.includeRoles.length, 132, 'roles as shipped');
  assert.equal(by.CA100.trialOriginal, undefined, 'as shipped: nothing to restore');
});

test('e06: the old Deployment groups mode keeps each shipped include (groups as this tenant\'s ids, every role) for ↩', async () => {
  const t = tenant();
  const { by } = await run(t, cfBundle(), 'deploy', 'disabled');
  const o = by.CA100.trialOriginal;
  assert.equal(o.includeRoles.length, 132);
  assert.equal(by.CA100.trialDg, 'CAD-SEC-U-DG-ADM');
  const intId = [...t.groups.values()].find((g) => g.displayName === 'CAB-SEC-U-Persona-Internals').id;
  assert.deepEqual(plain(by.CA200.trialOriginal.includeGroups), [intId]);
  // stored like a trial, ↩ restores it
  const st = t.D.store('t', t.ls);
  st.put(by.CA100.createdId, { id: by.CA100.createdId, dgId: by.CA100.trialDgId, dg: by.CA100.trialDg, original: by.CA100.trialOriginal });
  await t.D.back(t.Graph, by.CA100.createdId, { store: st, waits: [0] });
  assert.equal(t.pols.get(by.CA100.createdId).conditions.users.includeRoles.length, 132);
});

test('e02/e03/e04: Joey+ — 48 policies with CA018–CA023; the preview and the run: CA019 Report-only, CA020–CA023 Off under the new default', async () => {
  const t = tenant();
  const joey = t.B.catalog('joey');
  const all = [...joey.policies, ...t.B.sharedPolicies(joey)];
  assert.equal(all.length, 48);
  for (const n of [18, 19, 20, 21, 22, 23]) assert.ok(all.some((p) => p.num === n && p.shared === 'Joey+'), `CA0${n}`);
  const ea = t.I.mergeShared({ catalogId: 'joey', fromRepository: true, groups: [], namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [], policies: [] }, t.E.bundle(), { breakGlassFrom: 'CAB-SEC-U-BreakGlass', breakGlassTo: 'CA-BreakGlassAccounts - Exclude' });
  const m = t.I.mergeShared(ea.bundle, t.J.bundle(), { match: t.J.isPlus, forceOff: t.J.forceOff });
  const plan = t.I.plan(t.I.prepareBundle(m.bundle), []);
  const land = Object.fromEntries(plan.map((p) => [p.name.slice(0, 6).replace(/-$/, ''), t.I.landingState(p, RO, 'shipped')]));
  assert.equal(land.CA018, RO); assert.equal(land.CA019, RO);
  for (const k of ['CA020', 'CA021', 'CA022', 'CA023']) assert.equal(land[k], 'disabled', `${k}: forced Off wins over Report-only`);
  assert.equal(land.CA1100, 'disabled', 'E-Admins taken from ENCA\'s copy land Off');
  const { by } = await run(t, m.bundle, 'shipped', RO);
  assert.equal(by.CA019.state, RO);
  for (const k of ['CA020', 'CA021', 'CA022', 'CA023']) assert.equal(by[k].state, 'disabled');
});

// ---- e05: the security-defaults take-over under SMB Basic ----
const vm_ = (p) => ({ id: p.id, name: p.displayName, state: p.state, raw: p, users: { exc: ['CAB-SEC-U-BreakGlass (group)'] } });
test('e05: greenfield — under SMB the switch turns exactly CA001–CA005 On, matched by number across versions', () => {
  const t = tenant();
  const pols = t.SMB.bundle().policies.map((p, i) => vm_({ ...p, id: `s${i}`, state: RO, displayName: p.displayName.replace('LegacyAuthentication-v1.0.1', 'LegacyAuthentication-v1.0.2') }));
  const cov = t.SD.coverage(pols, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2, replacing: t.SMB.replacing() });
  assert.deepEqual(plain(cov.toOn.map((p) => p.name.slice(0, 5))), ['CA001', 'CA002', 'CA003', 'CA004', 'CA005']);
  assert.equal(cov.ready, true);
  const heuristic = t.SD.coverage(pols, { breakGlass: 'CAB-SEC-U-BreakGlass', bgMembers: 2 });
  assert.ok(heuristic.toOn.length >= 1, 'without the named set the protections decide, as before');
});

test('e05: SMB beside CloudFellows v1.0 (K&S) — Report-only week, then CA001–CA005 On, the old counterparts Off a week later', () => {
  const t = tenant();
  const day = 24 * 3600 * 1000, t0 = Date.parse('2026-11-02T08:00:00Z');
  const smb = t.SMB.bundle().policies.filter((p) => /^CA00[1-5]/.test(p.displayName)).map((p, i) => ({ ...p, id: `n${i}`, state: RO, modifiedDateTime: new Date(t0).toISOString() }));
  const old = [
    pol('o0', 'CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0', { includeUsers: ['All'] }, 'enabled'),
    { ...pol('o2', 'CA002-BLOCK-Global-IP-AnyApp-AnyPlatform-LegacyAuthentication-v1.0', { includeUsers: ['All'] }, 'enabled'), grantControls: { operator: 'OR', builtInControls: ['block'] } },
    pol('o1100', 'CA1100-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access1-v3.0', { includeUsers: ['All'] }, 'enabled'),
  ];
  old[1].conditions.clientAppTypes = ['exchangeActiveSync', 'other'];
  const vms = [...smb, ...old].map(vm_);
  const p1 = t.SD.smbMigration(vms, { sd: { enabled: false }, now: t0 + 3 * day });
  assert.equal(p1.phase, 'report');
  assert.equal(p1.readyAt, t0 + 7 * day);
  const r1 = p1.rows.find((r) => r.name.startsWith('CA001'));
  assert.deepEqual(plain(r1.counterparts.map((q) => q.id)), ['o0']);
  assert.deepEqual(plain(p1.rows.find((r) => r.name.startsWith('CA002')).counterparts.map((q) => q.id)), ['o2']);
  assert.ok(!p1.rows.some((r) => r.counterparts.some((q) => q.id === 'o1100')), 'E-Admins are never a counterpart');
  assert.match(t.SD.migrationBand(p1, {}), /Report-only, one week[\s\S]*CA001–CA005 On[\s\S]*Old counterparts Off, one week later/);
  for (const v of vms) if (/SMB/.test(v.name)) { v.raw.state = 'enabled'; v.raw.modifiedDateTime = new Date(t0 + 8 * day).toISOString(); }
  const p2 = t.SD.smbMigration(vms, { sd: { enabled: false }, now: t0 + 10 * day });
  assert.equal(p2.phase, 'retire'); assert.equal(p2.readyAt, t0 + 15 * day);
  assert.deepEqual(plain(p2.retire.map((q) => q.id).sort()), ['o0', 'o2']);
  for (const v of vms) if (v.id === 'o0' || v.id === 'o2') v.raw.state = 'disabled';
  assert.equal(t.SD.smbMigration(vms, { sd: { enabled: false } }), null, 'the old ones Off: done, the band goes (the E-Admins never count)');
  assert.equal(t.SD.smbMigration(vms.filter((v) => /SMB/.test(v.name)), {}), null, 'greenfield: the security-defaults band does this');
  assert.equal(t.SD.smbMigration(vms, { sd: { enabled: true } }), null);
});
