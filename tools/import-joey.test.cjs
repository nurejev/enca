// Joey Verlinden import (beta 25383): groups attached BY NAME, never a source
// id; E-Admins from a CloudFellows backup; re-attach of policies imported
// before. No credentials, external packages or network.
// Run: node --test tools/import-joey.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');

const BG = '2802b872-ccfb-4b29-a9a9-459808dfb11b';          // Joey's break-glass group — in HIS tenant
const DUP = '20cd89e3-25e2-4fcd-82c5-de666dfd31a4';         // one id, two CA005 group files
const G403 = 'ffba4a95-5986-4d87-804a-1f354533a930';        // "CA403-Guests-…" for the "CA403-GuestUsers-…" policy
const G000 = '7452a2db-063a-4048-84b0-ff691fa2900e';
const CN = '3d46dbda-8382-466a-856d-eb00cbc6b910';           // compliant network — Microsoft's, every tenant
const N000 = 'CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA';
const N005A = 'CA005-Global-DataProtection-Office365-AnyPlatform-Unmanaged-RequireAppProtection';
const N005B = 'CA005-Global-DataProtection-Office365-iOSenAndroid-ClientApps-Unmanaged-AppEnforcedRestrictions';
const N403 = 'CA403-GuestUsers-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser';
const N505 = 'CA505-Agents-AttackSurfaceReduction-AllAgentUsers-AllResources-RequireCompliantNetWork';

// A policy the way Joey's export writes it: OData annotations everywhere.
const od = (t, o) => ({ '@odata.type': `#microsoft.graph.${t}`, ...o });
const pol = (name, users, extra = {}) => od('conditionalAccessPolicy', {
  id: `src-${name.slice(0, 5)}`, displayName: name, state: 'enabled', deletedDateTime: null, templateId: null,
  conditions: od('conditionalAccessConditionSet', { clientAppTypes: ['all'], agents: null, times: null,
    applications: od('conditionalAccessApplications', { includeApplications: ['All'], excludeApplications: [] }),
    users: od('conditionalAccessUsers', { includeUsers: ['All'], excludeUsers: [], includeGroups: [], excludeGroups: [], ...users }),
    ...(extra.conditions || {}) }),
  grantControls: od('conditionalAccessGrantControls', { operator: 'OR', builtInControls: ['mfa'] }), sessionControls: null });
const joey = () => ({
  catalogId: 'joey', fromRepository: true,
  policies: [
    pol(N000, { excludeGroups: [G000, BG] }),
    pol(N005A, { excludeGroups: [BG, DUP] }),
    pol(N005B, { excludeGroups: [BG, DUP] }),
    pol(N403, { includeUsers: [], excludeGroups: [BG, G403] }),
    pol(N505, { includeUsers: ['None'] }, { conditions: { agents: od('conditionalAccessAgents', { includeAgentUsers: ['All'] }),
      locations: od('conditionalAccessLocations', { includeLocations: ['All'], excludeLocations: [CN] }) } }),
  ],
  groups: [
    { id: BG, displayName: 'CA-BreakGlassAccounts - Exclude' },
    { id: G000, displayName: `${N000} - Exclude` },
    { id: DUP, displayName: `${N005A} - Exclude` },
    { id: DUP, displayName: 'CA005-Global-DataProtection-Office365-iOSenAndroid-ClientApps-Unmanaged-RequireAppProtection - Exclude' },
    { id: G403, displayName: 'CA403-Guests-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser - Exclude' },
  ],
  namedLocations: [{ '@odata.type': '#microsoft.graph.compliantNetworkNamedLocation', id: CN, displayName: 'All Compliant Network locations', isTrusted: true }],
  authStrengths: [], authContexts: [], termsOfUse: [],
});

// A fake tenant behind the Graph calls the importer makes.
function world(opts = {}) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const groups = new Map((opts.groups || []).map((g) => [g.id, g])), pols = new Map(), posts = [];
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
      if (url === '/directoryObjects/getByIds') return { value: body.ids.filter((x) => groups.has(x)).map((x) => ({ id: x })) };
      if (url === '/identity/conditionalAccess/policies') { const p = { ...structuredClone(body), id: id() }; pols.set(p.id, p); return { id: p.id }; }
      if (url === '/identity/conditionalAccess/namedLocations') return { id: id() };
      return {};
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
      if (opts.failGroup && t.displayName.includes(opts.failGroup)) throw new Error('Graph request failed (403): Insufficient privileges');
      const hit = [...groups.values()].find((g) => g.displayName.toLowerCase() === t.displayName.toLowerCase());
      if (hit) return { id: hit.id, name: hit.displayName, created: false };
      const g = { id: id(), displayName: t.displayName }; groups.set(g.id, g);
      return { id: g.id, name: g.displayName, created: true };
    },
    templates: () => [],
  };
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: () => null, setItem() {} }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? null : num >= 1100 && num < 1200 ? 1100 : Math.floor(num / 100) * 100, label: 'x' }; } },
    AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, Graph, Assign };
  vm.createContext(box);
  const src = ['baselineData.js', 'baselineJoeyData.js', 'baseline.js', 'import.js']
    .map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.I = Importer;`, box);
  return { I: box.I, groups, pols, posts, graphRef: Graph };
}
// values built inside the vm context carry its Array prototype; compare plain copies
const plain = (x) => JSON.parse(JSON.stringify(x));
const nameOf = (w, gid) => (w.groups.get(gid) || {}).displayName || `MISSING ${gid}`;
const policyPosts = (w) => w.posts.filter(([u]) => u === '/identity/conditionalAccess/policies').map(([, b]) => b);
async function runImport(w, bundle, mode = 'shipped') {
  const prepared = w.I.prepareBundle(bundle);
  const chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode });
  return { prepared, dep, res, byName: Object.fromEntries(res.results.map((r) => [r.name, r])) };
}

test('UTF-16 backup files decode — a downloaded copy of the repository is not zero policies', () => {
  const { I } = world();
  const text = JSON.stringify(pol(N000, {}));
  const bytes = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]);
  const b = I.parseEntries([{ path: 'Repo/Config/ConditionalAccess/x.json', text: I.decodeBytes(new Uint8Array(bytes)) }]);
  assert.equal(b.policies.length, 1);
  assert.equal(b.policies[0].displayName, N000);
});

test('prepareBundle writes names, not source ids — dup ids split per policy, CA403 takes the convention name', () => {
  const { I } = world();
  const p = I.prepareBundle(joey());
  assert.equal(p.prepared, true);
  const blob = JSON.stringify(p.policies);
  for (const src of [BG, DUP, G403, G000]) assert.equal(blob.includes(src), false, `source id ${src} left in a policy`);
  const names = p.groups.map((g) => g.displayName).sort();
  assert.ok(names.includes(`${N005A} - Exclude`));
  assert.ok(names.includes(`${N005B} - Exclude`), 'the renamed CA005 gets the name its policy carries');
  assert.ok(names.includes(`${N403} - Exclude`), 'CA403 group created under the policy convention');
  assert.ok(!names.some((n) => n.startsWith('CA403-Guests-')), 'the file name is not created as well');
  assert.equal(p.groups.filter((g) => g.displayName === 'CA-BreakGlassAccounts - Exclude').length, 1);
  assert.ok(p.groupNotes.some((n) => /CA403-Guests-/.test(n)));
  assert.equal(p.groupIndex.nameFor(N005B, DUP), `${N005B} - Exclude`);
  assert.equal(p.groupIndex.nameFor(N000, BG), 'CA-BreakGlassAccounts - Exclude');
});

test('as shipped: every group is created by name and attached; nothing points at the source tenant', async () => {
  const w = world();
  const { res, byName } = await runImport(w, joey());
  assert.deepEqual(plain(res.results.filter((r) => !r.ok).map((r) => r.name)), []);
  for (const b of policyPosts(w)) {
    const u = b.conditions.users;
    for (const g of [...(u.includeGroups || []), ...(u.excludeGroups || [])]) assert.ok(w.groups.has(g), `${b.displayName} points at ${g}`);
    assert.equal(b.state, 'disabled');
    assert.equal(JSON.stringify(b).includes('enca-group:'), false);
  }
  const ex = (n) => plain(w.pols.get(byName[n].createdId).conditions.users.excludeGroups.map((g) => nameOf(w, g)));
  assert.deepEqual(ex(N005A), ['CA-BreakGlassAccounts - Exclude', `${N005A} - Exclude`]);
  assert.deepEqual(ex(N005B), ['CA-BreakGlassAccounts - Exclude', `${N005B} - Exclude`]);
  assert.deepEqual(ex(N403), ['CA-BreakGlassAccounts - Exclude', `${N403} - Exclude`]);
  assert.deepEqual(plain(w.pols.get(byName[N000].createdId).conditions.users.includeUsers), ['All'], 'as shipped keeps the include');
});

test('a readback without OData annotations is not "differs from the approved plan"', async () => {
  const w = world();
  const { res } = await runImport(w, joey());
  assert.equal(res.results.some((r) => /differs from the approved plan/.test(r.error || '')), false);
  assert.equal(res.results.every((r) => r.verified), true);
});

test('a group that cannot be created holds its policies back instead of creating them on a missing group', async () => {
  const w = world({ failGroup: 'BreakGlass' });
  const { res, dep } = await runImport(w, joey());
  const failed = res.results.filter((r) => !r.ok);
  assert.equal(failed.length, 4);
  for (const r of failed) assert.match(r.error, /CA-BreakGlassAccounts - Exclude.*could not be created/);
  assert.equal(policyPosts(w).length, 1, 'only CA505, which names no group, is created');
  assert.ok(dep.log.warnings.some((x) => /held back/.test(x)));
});

test('the compliant network location is referenced by its well-known id, never created', async () => {
  const w = world();
  const { byName, dep } = await runImport(w, joey());
  assert.equal(w.posts.some(([u]) => u === '/identity/conditionalAccess/namedLocations'), false);
  assert.deepEqual(plain(w.pols.get(byName[N505].createdId).conditions.locations.excludeLocations), [CN]);
  assert.ok(dep.log.reused.some((x) => /compliant network/.test(x)));
  assert.equal(byName[N505].ok, true);
  const b = policyPosts(w).find((x) => x.displayName === N505);
  assert.equal('agents' in b.conditions && b.conditions.agents === null, false, 'no null preview properties are sent');
});

test('a group id that no file explains and the tenant does not hold fails the policy', async () => {
  const w = world();
  const b = joey();
  b.policies = [pol(N000, { excludeGroups: ['99999999-9999-4999-8999-999999999999'] })];
  const { res } = await runImport(w, b, 'deploy');
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].error, /does not exist in this tenant/);
  assert.equal(policyPosts(w).length, 0);
});

test('a backup restored into its own tenant binds to the same group object', async () => {
  const w = world({ groups: [{ id: G000, displayName: 'Renamed since the backup' }] });
  const b = joey(); delete b.fromRepository; delete b.catalogId;
  b.policies = [pol(N000, { excludeGroups: [G000] })];
  const { res } = await runImport(w, b, 'deploy');
  assert.equal(res.results[0].ok, true);
  assert.deepEqual(plain(w.pols.get(res.results[0].createdId).conditions.users.excludeGroups), [G000]);
});

test('E-Admins from a CloudFellows backup: only those, break-glass renamed to the target, landing Off', async () => {
  const w = world();
  const CFBG = '11111111-1111-4111-8111-111111111111';
  const cf = { policies: [pol('CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0', { includeUsers: [], includeGroups: [CFBG] }), pol('CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.2', {})],
    groups: [{ id: CFBG, displayName: 'CAB-SEC-U-BreakGlass' }, { id: '22222222-2222-4222-8222-222222222222', displayName: 'CAB-SEC-U-Persona-Admins' }],
    namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [] };
  const m = w.I.mergeShared(joey(), cf, { label: 'cf.zip', breakGlassFrom: 'CAB-SEC-U-BreakGlass', breakGlassTo: 'CA-BreakGlassAccounts - Exclude' });
  assert.equal(m.found, 1);
  assert.deepEqual(plain(m.added), ['CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0']);
  assert.equal(m.bundle.groups.some((g) => g.displayName === 'CAB-SEC-U-Persona-Admins'), false, 'nothing the E-Admins do not use');
  const { res, byName, prepared } = await runImport(w, m.bundle);
  const ea = byName['CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0'];
  assert.equal(ea.ok, true);
  assert.equal(ea.forceOff, true);
  const p = w.pols.get(ea.createdId);
  assert.equal(p.state, 'disabled', 'source state was enabled');
  assert.deepEqual(plain(p.conditions.users.includeGroups.map((g) => nameOf(w, g))), ['CA-BreakGlassAccounts - Exclude']);
  const bgIds = new Set(res.results.filter((r) => r.ok).flatMap((r) => [...(w.pols.get(r.createdId).conditions.users.includeGroups || []), ...(w.pols.get(r.createdId).conditions.users.excludeGroups || [])]).filter((g) => nameOf(w, g) === 'CA-BreakGlassAccounts - Exclude'));
  assert.equal(bgIds.size, 1, 'one break-glass group for Joey and the E-Admins alike');
  const planned = prepared.groups.find((g) => g.displayName === 'CA-BreakGlassAccounts - Exclude');
  assert.deepEqual(plain(planned.srcIds).sort(), [BG, CFBG].sort());
});

test('re-attach swaps only the source ids the tenant does not have, and reads the policy back', async () => {
  const w = world({ groups: [{ id: G000, displayName: `${N000} - Exclude` }] });   // this one exists here (same id)
  const raw = { ...pol(N403, { includeUsers: [], excludeGroups: [BG, G403, G000] }), id: 't-403' };
  w.pols.set('t-403', structuredClone(raw));
  const prepared = w.I.prepareBundle(joey());
  const dir = await w.I.readDirectoryIds([BG, G403, G000]);
  const rows = w.I.repairPlan(prepared, [raw], dir);
  assert.equal(rows.length, 1);
  assert.deepEqual(plain(rows[0].swaps.map((s) => s.name)), ['CA-BreakGlassAccounts - Exclude', `${N403} - Exclude`]);
  const groups = [...new Map(rows.flatMap((r) => r.swaps.map((s) => [s.key, s.group]))).values()];
  const mini = { policies: rows.map((r) => ({ displayName: r.name, conditions: { users: { excludeGroups: r.swaps.map((s) => s.key) } } })), groups, namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [], prepared: true, fromRepository: true };
  const dep = await w.I.ensureDependencies(mini, () => {}, { matchedNames: rows.map((r) => r.name) });
  const out = await w.I.repairPolicies(rows, dep.maps, {});
  assert.equal(out[0].ok, true);
  assert.equal(out[0].changed, true);
  const ex = w.pols.get('t-403').conditions.users.excludeGroups;
  assert.deepEqual(plain(ex.map((g) => nameOf(w, g))), ['CA-BreakGlassAccounts - Exclude', `${N403} - Exclude`, `${N000} - Exclude`]);
  assert.equal(ex.includes(G000), true, 'an id this tenant has is never swapped');
  assert.deepEqual(plain(w.I.repairPlan(prepared, [w.pols.get('t-403')], await w.I.readDirectoryIds(ex))), []);
  assert.match(w.I.repairReport({ tenantName: 'T', fileName: 'f', rows, results: out, depLog: dep.log }), /Policies re-attached:\*\* 1 of 1/);
});

// ---- beta 25384: agent policies in the create shape Graph documents ----------
const agentPolicies = () => {
  const base = joey().policies;
  const a501 = pol('CA501-Agents-IdentityProtection-AnyApp-AnyPlatform-BLOCK-HighRiskAgent', { includeUsers: ['None'] }, { conditions: {
    agentIdRiskLevels: 'high', agents: null,
    clientApplications: od('conditionalAccessClientApplications', { includeServicePrincipals: [], includeAgentIdServicePrincipals: ['All'], excludeServicePrincipals: [] }) } });
  a501.grantControls = od('conditionalAccessGrantControls', { operator: 'OR', builtInControls: ['block'] });
  const a503 = pol('CA503-Agents-BaseProtection-AllAgentUsers-RequireCompliantDevice', { includeUsers: ['None'] }, { conditions: {
    clientApplications: null,
    agents: od('conditionalAccessAgents', { includeAgentUsers: ['All'], excludeAgentUsers: [], agentFilter: null }),
    agentContext: od('conditionalAccessAgentContext', { includeAgentContexts: ['agentUserSessionsInitiatedFromEndpoints'], excludeAgentContexts: [] }) } });
  const a504 = pol('CA504-Agents-IdentityProtection-AllAgentUsers-AllResources-BlockRiskyAgents', { includeUsers: ['None'] }, { conditions: {
    agentIdRiskLevels: 'medium,high', agents: od('conditionalAccessAgents', { includeAgentUsers: ['All'], excludeAgentUsers: [], agentFilter: null }) } });
  return { ...joey(), policies: [a501, a503, a504, base.find((p) => p.displayName === N505)] };
};
// Graph as the Courseware tenant answered it: the READ shape is refused.
function strictGraph() {
  return async (url, body) => {
    if (url === '/identity/conditionalAccess/policies') {
      const c = body.conditions || {};
      const s = JSON.stringify(body);
      const ca = c.clientApplications;
      if (c.agents || s.includes('@odata') || (ca && Array.isArray(ca.includeServicePrincipals) && !ca.includeServicePrincipals.length) || c.agentContext) {
        throw new Error('Graph request failed (400): The server could not process the request because it is malformed or incorrect. · code: BadRequest');
      }
    }
  };
}

test('agentWriteShape: agent identities lose the read-only users "None" block and the empty service-principal list', () => {
  const { I } = world();
  const src = agentPolicies().policies[0];
  const w = I.agentWriteShape(src);
  assert.equal(w.blocked, null);
  const c = plain(w.payload).conditions;
  assert.equal('users' in c, false);
  assert.deepEqual(c.clientApplications, { includeAgentIdServicePrincipals: ['All'], excludeAgentIdServicePrincipals: [] });
  assert.equal(c.agentIdRiskLevels, 'high');
  assert.equal(JSON.stringify(w.payload).includes('@odata'), false);
});

test('agentWriteShape: agents\' user accounts become users "AllAgentIdUsers"; an agent filter is refused, not guessed', () => {
  const { I } = world();
  const [, a503, a504] = agentPolicies().policies;
  const w = I.agentWriteShape(a504);
  const c = plain(w.payload).conditions;
  assert.equal('agents' in c, false);
  assert.deepEqual(c.users.includeUsers, ['AllAgentIdUsers']);
  assert.equal(c.agentIdRiskLevels, 'medium,high');
  assert.equal(w.notes.length, 1);
  const f = structuredClone(a503); f.conditions.agents.agentFilter = { mode: 'include', rule: 'x' };
  assert.match(I.agentWriteShape(f).blocked, /agent filter/);
  const both = structuredClone(a503); both.conditions.users.includeUsers = ['All'];
  assert.match(I.agentWriteShape(both).blocked, /users and agents/);
});

test('agent policies import against a Graph that refuses the read shape; agentContext is retried without, and said so', async () => {
  const posts = [];
  const strict = strictGraph();
  const w2 = world();
  const g2 = w2.graphRef;
  const create = g2.gpost;
  g2.gpost = async (url, body) => { await strict(url, body); posts.push([url, structuredClone(body)]); return create(url, body); };
  const out = await runImport(w2, agentPolicies());
  const failed = out.res.results.filter((r) => !r.ok);
  assert.deepEqual(plain(failed.map((r) => r.name + ' ' + r.error)), []);
  const r503 = out.byName['CA503-Agents-BaseProtection-AllAgentUsers-RequireCompliantDevice'];
  assert.ok(r503.agentNotes.some((n) => /WITHOUT the agent execution environment/.test(n)));
  assert.ok(out.res.warnings.some((n) => /CA503.*WITHOUT/.test(n)));
  const p505 = w2.pols.get(out.byName[N505].createdId);
  assert.deepEqual(plain(p505.conditions.users.includeUsers), ['AllAgentIdUsers']);
  assert.deepEqual(plain(p505.conditions.locations.excludeLocations), [CN]);
  const md = w2.I.buildReport({ tenantName: 'T', fileName: 'f', depLog: out.dep.log, planItems: w2.I.plan(out.prepared, []), results: out.res.results, warnings: out.res.warnings, mode: 'shipped', licence: { known: false } });
  assert.doesNotMatch(md, /Workload ID licence could not be read/, 'no workload-identity policy, no workload-identity warning');
  assert.match(md, /🤖/);
});
