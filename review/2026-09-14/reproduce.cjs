// Isolated review probes. No network, tokens, or tenant writes.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const findings = [];
const code = name => require('node:child_process').execFileSync('git', ['show', '8ec00e815f4548e0b1aec4d8772fc17cf899b21a:js/' + name], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
function load(file, symbol, extras = {}) {
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, ...extras };
  vm.createContext(box);
  vm.runInContext(code(file) + '\n;globalThis.result = ' + symbol, box);
  return box.result;
}
function record(name, actual) { findings.push({ name, actual }); }
const WhatIf = load('whatifeval.js', 'WhatIfEval');
const scope = load('cascope.js', 'CaScope');
const scenario = { userId: 'u1', isGuest: false, appId: 'app1', platform: 'windows', clientApp: 'browser', deviceState: 'compliant', insiderRisk: 'minor' };
const policy = (changes = {}) => ({ id: 'p1', displayName: 'Review fixture', state: 'enabled', conditions: { users: { includeUsers: ['All'] }, applications: { includeApplications: ['All'] }, clientAppTypes: ['all'], ...changes }, grantControls: { operator: 'OR', builtInControls: ['block'] } });

(async () => {
  const risk = WhatIf.evaluate([policy({ insiderRiskLevels: 'elevated' })], scenario);
  assert.equal(risk.blocked, true);
  record('Insider risk string ignored: elevated-only block applies to minor risk', { blocked: risk.blocked, warnings: risk.applied[0].warnings });

  const df = policy({ devices: { deviceFilter: { mode: 'exclude', rule: 'device.isCompliant -eq True -and device.trustType -eq "ServerAD"' } } });
  const device = WhatIf.evaluate([df], scenario);
  assert.equal(device.blocked, false);
  record('Compound filter: compliant non-hybrid device incorrectly excluded from block', { blocked: device.blocked, reason: device.notApplied[0].reason });

  const guest = policy({ users: { includeUsers: ['GuestsOrExternalUsers'] } });
  const guestScope = scope.of(guest, { kind: 'user', id: 'u1', guest: true, groupIds: new Set(), roleIds: new Set() });
  const guestWhatIf = WhatIf.evaluate([guest], { ...scenario, isGuest: true });
  assert.equal(guestScope.applies, true);
  assert.equal(guestWhatIf.applied.length, 0);
  record('Shared scope and What-If disagree for legacy guest token', { scopeApplies: guestScope.applies, whatIfApplies: guestWhatIf.applied.length > 0 });

  const specific = policy({ users: { includeGuestsOrExternalUsers: { guestOrExternalUserTypes: 'serviceProvider', externalTenants: { membershipKind: 'enumerated', members: ['partner-a'] } } } });
  const wrongGuest = scope.of(specific, { kind: 'user', id: 'u1', guest: true, guestOrExternalUserType: 'b2bCollaborationGuest', homeTenantId: 'partner-b', groupIds: new Set(), roleIds: new Set() });
  assert.equal(wrongGuest.applies, true);
  record('Guest type and tenant restriction discarded by scope preparation', { applies: wrongGuest.applies, preparedGuestFlag: scope.prep(specific).incGuests });

  const reads = [];
  const mockGraph = {
    async ggetAll(url) {
      reads.push(url);
      if (url.startsWith('/users?')) return [{ id: 'u1', displayName: 'Review user', userType: 'Member', accountEnabled: true }];
      if (url.startsWith('/groups/excluded/')) throw new Error('403 Forbidden');
      return [];
    },
    async gpost() { return { value: [] }; }
  };
  const analyzer = load('analyze.js', 'Analyzer', { Graph: mockGraph });
  const mfa = policy({ users: { includeUsers: ['All'], excludeGroups: ['excluded'] } });
  mfa.grantControls = { operator: 'OR', builtInControls: ['mfa'] };
  const collected = await analyzer.collect([{ raw: mfa, seq: 1, grant: { controls: ['MFA'], op: 'OR' } }], 'all', () => {});
  const report = analyzer.evaluate(collected.lookup, collected.users, collected.ctx);
  assert.equal(report[0].mfaCovered, true);
  record('Unread exclusion group becomes empty, user reported MFA-covered', { mfaCovered: report[0].mfaCovered, riskyCount: report[0].riskyCount, collectionKeys: Object.keys(collected) });

  const orPolicy = policy();
  orPolicy.grantControls = { operator: 'OR', builtInControls: ['mfa', 'compliantDevice'] };
  const orCollected = await analyzer.collect([{ raw: orPolicy, seq: 1, grant: { controls: ['MFA', 'Compliant device'], op: 'OR' } }], 'all', () => {});
  const orReport = analyzer.evaluate(orCollected.lookup, orCollected.users, orCollected.ctx);
  assert.equal(orReport[0].mfaCovered, true);
  record('MFA alternative is counted as MFA coverage for an OR grant', { controls: orPolicy.grantControls, mfaCovered: orReport[0].mfaCovered });

  const writes = [];
  const importer = load('import.js', 'Importer', {
    AUTH_CONFIG: { scopes: [] },
    Graph: {
      async gpost(url, body) { writes.push({ method: 'POST', url, body }); return { id: 'new-p' }; },
      async gpatch(url, body) { writes.push({ method: 'PATCH', url, body }); return null; }
    }
  });
  const newPolicy = policy({ users: { includeUsers: ['All'], excludeGroups: ['{{group:BreakGlass}}'] } });
  const existing = policy();
  const imported = await importer.importPolicies([{ name: newPolicy.displayName, raw: newPolicy, upgrade: true, existing: { id: 'old-p', name: 'Previous', raw: existing } }], { ph: {}, group: {}, loc: {}, strength: {}, ctx: {}, tou: {}, personaGroupIds: {} }, () => {}, { mode: 'replace' });
  assert.equal(writes[0].body.state, 'enabled');
  assert.equal(writes[0].body.conditions.users.excludeGroups.length, 0);
  assert.equal(imported.results[0].ok, true);
  assert.equal(writes[1].body.state, 'disabled');
  record('Replacement remains enabled after unresolved new break-glass exclusion', { newState: writes[0].body.state, exclusions: writes[0].body.conditions.users.excludeGroups, oldState: writes[1].body.state, result: imported.results[0], warnings: imported.warnings });

  const endpoints = [];
  const token = 'x.' + Buffer.from(JSON.stringify({ scp: 'Policy.Read.All Directory.Read.All' })).toString('base64url') + '.x';
  class Msal {
    async initialize() {}
    async handleRedirectPromise() { return null; }
    async acquireTokenSilent() { return { accessToken: token }; }
  }
  const graph = load('graph.js', 'Graph', {
    AUTH_CONFIG: { clientId: 'fixture', authority: 'fixture', scopes: ['Policy.Read.All'], graphBase: 'https://graph.microsoft.com/beta' },
    window: { location: { origin: 'http://localhost', pathname: '/' } },
    msal: { PublicClientApplication: Msal },
    atob: s => Buffer.from(s, 'base64').toString(),
    setTimeout: fn => { fn(); return 0; },
    fetch: async (url, options) => {
      endpoints.push(url);
      const req = JSON.parse(options.body).requests[0];
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ responses: [{ id: req.id, status: endpoints.length < 8 ? 429 : 200, headers: { 'Retry-After': '1' }, body: { value: [] } }] }) };
    }
  });
  await graph.init();
  await graph.gbatch([{ id: '1', url: '/groups/g1?$select=disableNesting' }], null, { base: 'https://graph.microsoft.com/v1.0' });
  assert.equal(endpoints.length, 8);
  assert.equal(endpoints[0], 'https://graph.microsoft.com/v1.0/$batch');
  assert.equal(endpoints[1], 'https://graph.microsoft.com/beta/$batch');
  record('Batch retries exceed retry budget and lose explicit API version', { requests: endpoints.length, endpoints });

  const demo = load('demo.js', 'DEMO_DATA');
  const duplicateIds = demo.policies.map(p => p.id).filter((id, i, a) => a.indexOf(id) !== i);
  assert.equal(Array.from(duplicateIds).join(','), 'd7');
  record('Demo contains duplicate policy IDs', { total: demo.policies.length, unique: new Set(demo.policies.map(p => p.id)).size, duplicateIds });

  const scripts = require('node:child_process').execFileSync('git', ['ls-tree', '-r', '--name-only', '8ec00e815f4548e0b1aec4d8772fc17cf899b21a', 'js'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n').filter(f => f.endsWith('.js')).map(f => f.slice(3));
  for (const file of scripts) new vm.Script(code(file), { filename: file });
  record('All application JavaScript parses', { files: scripts.length });
  const result = { commit: '8ec00e815f4548e0b1aec4d8772fc17cf899b21a', probes: findings.length, findings };
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
