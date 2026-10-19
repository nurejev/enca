// 📥 Import — the gimi run of 19 Oct (SMB Basic 1.0, Land as Report-only) and
// what beta 32902 does about it: a state write that lands on a replica that
// has not seen the policy yet is retried (then tried again at the end of the
// run), a policy already in the tenant is never created twice (fresh /beta
// read + this session's own creates), a custom strength with the same
// methods is reused, a dependency that failed stops its policy BEFORE the
// create, and the 🛫 pre-flight says all of it before Import is pressed.
// No credentials, external packages or network.
// Run: node --test tools/import-preflight.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const caGroup = (n) => { const m = /CA(\d{3,4})/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, key: num == null ? 99999 : Math.floor(num / 100) * 100, label: 'x' }; };
const fast = { missing: [1, 1], stale: [1], write: [1, 1] };

function world(opts = {}) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const groups = new Map(), pols = new Map(), posts = [], patches = [];
  const tenant = (opts.tenant || []).map((p) => ({ ...p }));   // what a list read returns
  const notYet = new Map(Object.entries(opts.notYet || {}));     // name prefix -> how many state writes answer 404
  const strip = (o) => Array.isArray(o) ? o.map(strip) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => !k.includes('@odata')).map(([k, v]) => [k, strip(v)])) : o;
  const Graph = {
    async existingAppIds(ids) { return new Set(ids); },
    async createServicePrincipal(appId) { return { displayName: appId }; },
    async ggetAll(url) {
      const m = /displayName eq '(.*?)'/.exec(decodeURIComponent(url));
      if (url.startsWith('/groups/') && url.includes('/members')) return opts.bgMembers || [];
      if (url.startsWith('/groups') && m) return [...groups.values(), ...(opts.groups || [])].filter((g) => g.displayName.toLowerCase() === m[1].replace(/''/g, "'").toLowerCase());
      if (url.startsWith('/policies/authenticationStrengthPolicies')) { if (opts.strengthReadFails) throw new Error('Graph request failed (403)'); return opts.strengths || []; }
      if (url.startsWith('/identity/conditionalAccess/policies')) { if (opts.listFails) throw new Error('Graph request failed (503)'); return opts.staleList ? tenant : [...tenant, ...[...pols.values()].map((p) => ({ id: p.id, displayName: p.displayName, state: p.state }))]; }
      if (url.startsWith('/identity/conditionalAccess/namedLocations')) return opts.locations || [];
      if (url.startsWith('/devices')) { if (opts.devicesFail) throw new Error('Graph request failed (403)'); return opts.devices || []; }
      return [];
    },
    async gpost(url, body) {
      posts.push([url, structuredClone(body)]);
      if (url === '/directoryObjects/getByIds') return { value: body.ids.filter((x) => groups.has(x)).map((x) => ({ id: x })) };
      if (url === '/identity/conditionalAccess/policies') { const p = { ...structuredClone(body), id: id() }; pols.set(p.id, p); return { id: p.id }; }
      if (/authenticationStrengthPolicies/.test(url) && opts.strengthCreateFails) throw new Error('Graph request failed (400): strength refused');
      return { id: id() };
    },
    async gpatch(url, body) {
      const p = pols.get(url.split('/').pop()) || tenant.find((t) => t.id === url.split('/').pop());
      patches.push([url, structuredClone(body), p && p.displayName]);
      if (p && body.state) {
        const key = [...notYet.keys()].find((k) => p.displayName.startsWith(k));
        if (key && notYet.get(key) > 0) { notYet.set(key, notYet.get(key) - 1); throw new Error('Graph request failed (404): ResourceNotFound — Policy does not exist'); }
        if (opts.refuse && p.displayName.startsWith(opts.refuse)) throw new Error('Graph request failed (400): BadRequest');
        p.state = body.state;
      }
      return null;
    },
    async gget(url) {
      if (url.endsWith('/fido2')) { if (opts.fido === 'error') throw new Error('Graph request failed (403)'); return { id: 'fido2', state: opts.fido || 'disabled' }; }
      if (url.startsWith('/networkAccess')) return { signalingStatus: opts.gsa || 'disabled' };
      if (url.startsWith('/policies/deviceRegistrationPolicy')) return { multiFactorAuthConfiguration: opts.devreg || 'notRequired' };
      const p = pols.get(url.split('/').pop()) || tenant.find((t) => t.id === url.split('/').pop());
      return p ? strip(structuredClone(p)) : {};
    },
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
  const src = ['baselineData.js', 'baselineJoeyData.js', 'baselineSmbData.js', 'baseline.js', 'import.js'].map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.I = Importer; globalThis.S = BASELINE_SMB;`, box);
  return { I: box.I, S: box.S, groups, pols, posts, patches };
}
async function smbRun(w, opts = {}, pick) {
  const prepared = w.I.prepareBundle(w.S.bundle());
  let chosen = w.I.plan(prepared, []).filter((p) => !p.exists);
  if (pick) chosen = chosen.filter((p) => pick.some((n) => p.name.startsWith(n)));
  const scoped = w.I.scopeBundle(prepared, chosen.map((p) => p.raw));
  const dep = await w.I.ensureDependencies(scoped, () => {}, { matchedNames: chosen.map((p) => p.name) });
  const res = await w.I.importPolicies(chosen, dep.maps, () => {}, { mode: 'shipped', landState: 'enabledForReportingButNotEnforced', readWaits: fast, lateWaits: fast, tenantKey: 't1', ...opts });
  return { res, dep, chosen, prepared };
}
const stateOf = (w, prefix) => ([...w.pols.values()].find((p) => p.displayName.startsWith(prefix)) || {}).state;
const smbName = (S, num) => S.policies.find((p) => p.num === num).name;

test('gimi, 19 Oct: a state write answered "does not exist" right after the create is retried — the policy lands Report-only, not Off', async () => {
  const w = world({ notYet: { CA002: 1, CA003: 2, CA005: 1, CA101: 1, CA102: 1, CA901: 2 } });
  const { res } = await smbRun(w);
  assert.deepEqual(plain(res.results.filter((r) => !r.ok).map((r) => r.name)), []);
  for (const k of ['CA001', 'CA002', 'CA003', 'CA004', 'CA005', 'CA006', 'CA101', 'CA102', 'CA104', 'CA901']) assert.equal(stateOf(w, k), 'enabledForReportingButNotEnforced', k);
  for (const k of ['CA103', 'CA201', 'CA202', 'CA203', 'CA204']) assert.equal(stateOf(w, k), 'disabled', k);
  assert.equal(res.warnings.filter((x) => /Entra refused/.test(x)).length, 0, res.warnings.join(' | '));
});

test('a state Conditional Access is still not ready for is tried again at the END of the run, and only then lands Off', async () => {
  const w1 = world({ notYet: { CA005: 4 } });           // fails the in-line tries, passes at the end
  const r1 = await smbRun(w1, {}, ['CA005', 'CA006']);
  const ca5 = r1.res.results.find((r) => r.name.startsWith('CA005'));
  assert.equal(ca5.ok, true);
  assert.equal(ca5.late, true);
  assert.equal(ca5.state, 'enabledForReportingButNotEnforced');
  assert.equal(stateOf(w1, 'CA005'), 'enabledForReportingButNotEnforced');
  const w2 = world({ notYet: { CA005: 99 } });          // never ready
  const r2 = await smbRun(w2, {}, ['CA005']);
  const x = r2.res.results[0];
  assert.equal(x.ok, true, 'created and verified — not a failure');
  assert.equal(x.state, 'disabled');
  assert.ok(r2.res.warnings.some((m) => /tried again at the end of the run/.test(m) && /Policy state/.test(m)), r2.res.warnings.join(' | '));
});

test('a real refusal (400) is not retried: one write, Off, said', async () => {
  const w = world({ refuse: 'CA004' });
  const { res } = await smbRun(w, {}, ['CA004']);
  assert.equal(res.results[0].state, 'disabled');
  assert.equal(w.patches.filter(([, b, n]) => n && n.startsWith('CA004') && b.state).length, 1);
  assert.ok(res.warnings.some((m) => /created Off — Entra refused Report-only/.test(m)));
});

test('never twice: a name already in the tenant (read fresh on /beta) is skipped, with its id', async () => {
  const S0 = world().S;
  const w = world({ tenant: [{ id: 'old-901', displayName: smbName(S0, 901), state: 'disabled' }] });
  const { res } = await smbRun(w, {}, ['CA901', 'CA006']);
  const ca901 = res.results.find((r) => r.name.startsWith('CA901'));
  assert.equal(ca901.skipped, true);
  assert.equal(ca901.existingId, 'old-901');
  assert.equal([...w.pols.values()].filter((p) => p.displayName.startsWith('CA901')).length, 0, 'no second CA901');
  assert.ok(res.warnings.some((m) => /skipped, not created twice/.test(m)));
  assert.equal(stateOf(w, 'CA006'), 'enabledForReportingButNotEnforced');
});

test('never twice: a second run in the same session creates nothing, even when the list has not shown the first run yet', async () => {
  const w = world({ staleList: true });
  await smbRun(w, {}, ['CA901']);
  assert.equal(w.pols.size, 1);
  const { res } = await smbRun(w, {}, ['CA901']);
  assert.equal(w.pols.size, 1, 'the 19:44 duplicate does not happen');
  assert.equal(res.results[0].skipped, true);
  assert.match(res.results[0].note, /created earlier in this session/);
});

test('a list that cannot be read is said, and the session guard still holds', async () => {
  const w = world({ listFails: true });
  await smbRun(w, {}, ['CA102']);
  const { res } = await smbRun(w, {}, ['CA102']);
  assert.equal(w.pols.size, 1);
  assert.ok(res.warnings.some((m) => /could not be re-read before the run/.test(m)));
});

test('strengths: one with exactly the same methods under another name is reused, not created again', async () => {
  const w = world({ strengths: [{ id: 's-old', displayName: 'SMB - FIDO2 security key', policyType: 'custom', allowedCombinations: ['Fido2'] }] });
  const { dep } = await smbRun(w, {}, ['CA901']);
  assert.equal(w.posts.filter(([u]) => /authenticationStrengthPolicies/.test(u)).length, 0);
  assert.ok(dep.log.reused.some((x) => /allows exactly the same methods, reused/.test(x)));
  assert.equal([...w.pols.values()][0].grantControls.authenticationStrength.id, 's-old');
  assert.equal(w.I.sameCombinations(['fido2'], ['Fido2']), true);
  assert.equal(w.I.sameCombinations(['fido2'], ['fido2', 'windowsHelloForBusiness']), false);
  assert.equal(w.I.sameCombinations([], []), false);
});

test('a strength that could not be created stops ITS policy before the create, with the reason; the rest lands', async () => {
  const w = world({ strengthCreateFails: true });
  const { res } = await smbRun(w, {}, ['CA901', 'CA001']);
  const ca901 = res.results.find((r) => r.name.startsWith('CA901'));
  assert.equal(ca901.ok, false);
  assert.match(ca901.error, /Not created: its authentication strength “SMB - Passkey \(FIDO2\)” could not be created/);
  assert.equal([...w.pols.values()].some((p) => p.displayName.startsWith('CA901')), false, 'no POST with a placeholder strength id');
  assert.equal(stateOf(w, 'CA001'), 'enabledForReportingButNotEnforced');
});

test('🛫 pre-flight on a gimi-like tenant: here already, Off to repair, a CA901 twice, GSA off, passkey method off, break-glass empty', async () => {
  const S0 = world().S;
  const tenant = [
    { id: 'p5', displayName: smbName(S0, 5), state: 'disabled' },
    { id: 'p101', displayName: smbName(S0, 101), state: 'disabled' },
    { id: 'p4', displayName: smbName(S0, 4), state: 'enabledForReportingButNotEnforced' },
    { id: 'p103', displayName: smbName(S0, 103), state: 'disabled' },
    { id: 'a', displayName: 'CA901-GRANT-SMB-BreakGlass-AnyApp-AnyPlatform-Passkey-v1.0.1', state: 'disabled' },
    { id: 'b', displayName: 'CA901-GRANT-SMB-BreakGlass-AnyApp-AnyPlatform-FIDO2-v1.0', state: 'disabled' },
    { id: 'c', displayName: 'CA001-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3', state: 'enabled' },
  ];
  const w = world({ tenant, groups: [{ id: 'bg', displayName: 'CAB-SEC-U-BreakGlass' }], bgMembers: [] });
  const prepared = w.I.prepareBundle(w.S.bundle());
  const items = w.I.plan(prepared, []);
  const pf = await w.I.preflight(prepared, items, { landState: 'enabledForReportingButNotEnforced', tenantKey: 't1', breakGlassGroup: 'CAB-SEC-U-BreakGlass', sdOn: true });
  const by = Object.fromEntries(pf.checks.map((c) => [c.key, c]));
  assert.equal(by.names.level, 'warn');
  assert.equal(by.names.names.length, 5, "CA004, CA005, CA101, CA103 and the 1.0.1 CA901 are here by name");
  assert.deepEqual(plain(pf.repair.map((r) => r.id).sort()), ['a', 'p101', 'p5'], 'CA103 lands Off on purpose, CA004 is already Report-only; the 1.0.1 CA901 is Off');
  assert.equal(by.twins.level, 'warn');
  assert.match(by.twins.detail, /Passkey-v1\.0\.1.*FIDO2-v1\.0|FIDO2-v1\.0.*Passkey-v1\.0\.1/);
  assert.doesNotMatch(by.twins.detail, /CA001-GRANT-Global/, 'a CloudFellows CA001 is not SMB\'s twin');
  assert.equal(by.gsa.level, 'info');
  assert.match(by.gsa.detail, /1037/);
  assert.equal(by.passkey.level, 'warn');
  assert.equal(by.breakglass.level, 'warn');
  assert.match(by.breakglass.title, /no members/);
  assert.equal(by.sd.level, 'info');
  assert.equal(by.capacity.level, 'ok');
  assert.equal(pf.blocked, false);
});

test('🛫 pre-flight: the custom-strength limit blocks; a clean tenant is all ok', async () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, displayName: `X${i}`, policyType: 'custom', allowedCombinations: [`m${i}`] }));
  const w = world({ strengths: many, fido: 'enabled', gsa: 'enabled', groups: [{ id: 'bg', displayName: 'CAB-SEC-U-BreakGlass' }], bgMembers: [{ id: 'u1' }, { id: 'u2' }] });
  const prepared = w.I.prepareBundle(w.S.bundle());
  const pf = await w.I.preflight(prepared, w.I.plan(prepared, []), { tenantKey: 't2', breakGlassGroup: 'CAB-SEC-U-BreakGlass' });
  const by = Object.fromEntries(pf.checks.map((c) => [c.key, c]));
  assert.equal(by.strengths.level, 'block');
  assert.equal(pf.blocked, true);
  assert.equal(by.passkey.level, 'ok');
  assert.equal(by.gsa.level, 'ok');
  assert.equal(by.breakglass.level, 'ok');
  assert.equal(by.names.level, 'ok');
  assert.equal(pf.repair.length, 0, 'no repair offered when the run lands Off');
});

test('the ticked repair sets each policy Report-only and reads it back', async () => {
  const w = world({ tenant: [{ id: 'p5', displayName: 'CA005-x', state: 'disabled' }, { id: 'p6', displayName: 'CA006-x', state: 'disabled' }], notYet: { 'CA006-x': 1 } });
  const out = await w.I.setStates([{ id: 'p5', name: 'CA005-x' }, { id: 'p6', name: 'CA006-x' }], 'enabledForReportingButNotEnforced', { readWaits: fast });
  assert.deepEqual(plain(out.map((r) => [r.id, r.ok])), [['p5', true], ['p6', true]]);
});

test('🛫 pre-flight, SMB 1.0.2: the device-join MFA setting, and whom CA008 would treat as unmanaged', async () => {
  const devices = [
    { id: 'w1', operatingSystem: 'Windows', trustType: 'AzureAD', accountEnabled: true },
    { id: 'w2', operatingSystem: 'Windows', trustType: 'ServerAD', accountEnabled: true },
    { id: 'w3', operatingSystem: 'Windows', trustType: 'ServerAD', accountEnabled: false },
    { id: 'w4', operatingSystem: 'Windows', trustType: 'Workplace', accountEnabled: true },
    { id: 'm1', operatingSystem: 'MacMDM', trustType: 'AzureAD', accountEnabled: true },
    { id: 'm2', operatingSystem: 'MacMDM', trustType: 'Workplace', accountEnabled: true },
    { id: 'i1', operatingSystem: 'iOS', trustType: 'Workplace', accountEnabled: true },
  ];
  const w = world({ devreg: 'required', devices });
  const prepared = w.I.prepareBundle(w.S.bundle());
  const pf = await w.I.preflight(prepared, w.I.plan(prepared, []), { tenantKey: 't9' });
  const by = Object.fromEntries(pf.checks.map((c) => [c.key, c]));
  assert.equal(by.devreg.level, 'warn');
  assert.match(by.devreg.detail, /CA007/);
  assert.equal(by.unmanaged.level, 'warn');
  assert.match(by.unmanaged.title, /CA008 would treat 3 enabled devices as unmanaged/);
  assert.match(by.unmanaged.detail, /1 hybrid-joined Windows PC, 1 Mac not Entra joined \(no Platform SSO yet\), 1 Windows PC only registered/);
  assert.match(by.unmanaged.detail, /2 Entra joined/);
  const w2 = world({ devreg: 'notRequired', devices: devices.filter((d) => d.trustType === 'AzureAD') });
  const p2 = w2.I.prepareBundle(w2.S.bundle());
  const pf2 = await w2.I.preflight(p2, w2.I.plan(p2, []), { tenantKey: 't10' });
  const by2 = Object.fromEntries(pf2.checks.map((c) => [c.key, c]));
  assert.equal(by2.devreg.level, 'ok');
  assert.equal(by2.unmanaged.level, 'ok');
  // not choosing CA007 / CA008: neither check is asked
  const w3 = world({ devreg: 'required' });
  const p3 = w3.I.prepareBundle(w3.S.bundle());
  const pf3 = await w3.I.preflight(p3, w3.I.plan(p3, []).filter((p) => !/^CA00[78]/.test(p.name)), { tenantKey: 't11' });
  assert.equal(pf3.checks.some((c) => c.key === 'devreg' || c.key === 'unmanaged'), false);
});
