// 🕵 Who is … to CA 1.7.0 — the service principal subject (js/whoissp.js),
// on 🤖 Workload identities' scope rules and the shared 🌐 IP card.
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..'), source = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const box = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, Set, Map, Date, Intl, BigInt });
for (const [f, sym] of [['cascope.js', 'CaScope'], ['signins.js', 'Signins'], ['reportimpact.js', 'ReportImpact'], ['locsignin.js', 'LocSignin'], ['workloadid.js', 'WorkloadId'], ['whois.js', 'WhoIs'], ['whoissp.js', 'WhoIsSp']]) vm.runInContext(source(f) + `\nglobalThis.${sym}=${sym};`, box);
const { WhoIsSp } = box;

const T = 'tenant-1', NOW = Date.parse('2026-11-26T12:00:00Z');
const LOCS = [{ '@odata.type': '#microsoft.graph.ipNamedLocation', id: 'l-hq', displayName: 'HQ', isTrusted: true, ipRanges: [{ cidrAddress: '84.241.196.0/24' }] }];
const single = { id: 'sp-1', appId: 'app-1', displayName: 'svc-backup', servicePrincipalType: 'Application', appOwnerOrganizationId: T, signInAudience: 'AzureADMyOrg' };
const mi = { id: 'sp-mi', appId: 'app-mi', displayName: 'mi-func', servicePrincipalType: 'ManagedIdentity', appOwnerOrganizationId: null };
const pol = (id, name, inc, extra = {}) => ({ id, displayName: name, state: extra.state || 'enabled', conditions: { clientApplications: { includeServicePrincipals: inc, excludeServicePrincipals: extra.exc || [] }, applications: { includeApplications: ['All'] }, ...(extra.cond || {}) }, grantControls: { operator: 'OR', builtInControls: ['block'] } });
const userPol = { id: 'u-1', displayName: 'CA100-MFA', state: 'enabled', conditions: { users: { includeUsers: ['All'] }, applications: { includeApplications: ['All'] } }, grantControls: { builtInControls: ['mfa'] } };
let n = 0;
const rec = (ip, res, extra = {}) => ({ id: 'r' + (++n), createdDateTime: extra.when || '2026-11-25T10:00:00Z', servicePrincipalId: 'sp-1', appId: 'app-1', appDisplayName: 'svc-backup', resourceDisplayName: res, ipAddress: ip, location: { city: 'Zoetermeer', countryOrRegion: 'NL' }, status: { errorCode: extra.err || 0 }, conditionalAccessStatus: extra.err === 53003 ? 'failure' : 'notApplied', signInEventTypes: ['servicePrincipal'], appliedConditionalAccessPolicies: extra.applied || [] });

test('a single-tenant principal: named, all-in-tenant, excluded and not targeted are told apart; user policies counted, not listed', () => {
  const m = WhoIsSp.analyze({ sp: single, tenantId: T, now: NOW, days: 7, locations: LOCS,
    policies: [pol('p1', 'CA900-Block', ['sp-1'], { cond: { locations: { includeLocations: ['All'] } } }), pol('p2', 'CA901-Risk', ['ServicePrincipalsInMyTenant'], { state: 'enabledForReportingButNotEnforced' }), pol('p3', 'CA902-Other', ['ServicePrincipalsInMyTenant'], { exc: ['app-1'] }), pol('p4', 'CA903-Else', ['sp-x']), userPol],
    records: [rec('84.241.196.40', 'Microsoft Graph', { applied: [{ id: 'p1', result: 'notApplied' }] }), rec('84.241.196.40', 'Microsoft Graph', { applied: [{ id: 'p1', result: 'notApplied' }] })] });
  assert.equal(m.kind, 'single'); assert.equal(m.targetable, true);
  const s = Object.fromEntries(m.rows.map((r) => [r.seq, r.s]));
  assert.deepEqual(s, { CA900: 'inc', CA901: 'inc', CA902: 'exc', CA903: 'na' });
  assert.equal(m.counts.reach, 2); assert.equal(m.counts.on, 1); assert.equal(m.counts.ro, 1);
  assert.equal(m.userPolicies, 1);
  assert.equal(m.rows.find((r) => r.seq === 'CA900').res.notApplied, 2);
  assert.equal(m.ips.rows.length, 1); assert.equal(m.ips.rows[0].trusted, true);
  assert.deepEqual(Array.from(m.ips.rows[0].apps), ['Microsoft Graph'], 'what a workload identity reached is the resource, not itself');
});

test('a managed identity cannot be targeted, and the policies that name it say so', () => {
  const m = WhoIsSp.analyze({ sp: mi, tenantId: T, now: NOW, days: 7, locations: LOCS, policies: [pol('p1', 'CA900-Block', ['sp-mi']), pol('p2', 'CA901-All', ['ServicePrincipalsInMyTenant'])], records: [] });
  assert.equal(m.kind, 'mi'); assert.equal(m.targetable, false);
  assert.deepEqual(Array.from(m.rows, (r) => r.s), ['cannot', 'cannot']);
  assert.match(m.callouts[0].text, /managed identit/);
  assert.match(WhoIsSp.render(m, {}), /Cannot target this kind/);
});

test('stopped sign-ins and an untargeted principal outside the named locations are called out', () => {
  const m = WhoIsSp.analyze({ sp: single, tenantId: T, now: NOW, days: 7, locations: LOCS, policies: [userPol],
    records: [rec('185.107.56.80', 'Microsoft Graph', { err: 53003 }), rec('84.241.196.40', 'Office 365 Exchange Online')] });
  assert.equal(m.stopped, 1);
  assert.ok(m.callouts.some((c) => /No workload-identity policy reaches it\. 1 of its 2 addresses/.test(c.text)));
  assert.ok(m.callouts.some((c) => c.kind === 'bad'));
  assert.equal(m.ips.stoppedOutside.length, 1);
  assert.equal(m.resources.length, 2);
});

test('hunting rows are weighted: counts, stopped and first seen come from the summary', () => {
  const recs = WhoIsSp.fromHunting([
    { IPAddress: '84.241.196.40', Country: 'NL', City: 'Zoetermeer', ResourceDisplayName: 'Microsoft Graph', n: 500, blocked: 0, failed: 2, first: '2026-11-20T01:00:00Z', last: '2026-11-25T23:00:00Z' },
    { IPAddress: '185.107.56.80', Country: 'DE', City: 'Frankfurt', ResourceDisplayName: 'Microsoft Graph', n: 7, blocked: 7, failed: 7, first: '2026-11-25T01:00:00Z', last: '2026-11-25T02:00:00Z' },
  ]);
  const m = WhoIsSp.analyze({ sp: single, tenantId: T, now: NOW, days: 7, locations: LOCS, policies: [], records: recs });
  assert.equal(m.total, 507); assert.equal(m.stopped, 7); assert.equal(m.failed, 9); assert.equal(m.hunting, true);
  const de = m.ips.rows.find((r) => r.ip === '185.107.56.80');
  assert.equal(de.count, 7); assert.equal(de.stopped, 7); assert.equal(de.first, '2026-11-25T01:00:00Z');
  assert.equal(m.ips.rows[0].count, 500);
  assert.match(WhoIsSp.render(m, {}), /not in the hunting source|no policy aimed at workload identities/);
});

test('the hunting query is scoped to the one principal and cannot be injected', () => {
  const q = WhoIsSp.huntQuery('EntraIdSpnSignInEvents', 'abc-123"; drop', '2026-11-19T00:00:00Z', '2026-11-26T00:00:00Z');
  assert.match(q, /ServicePrincipalId == "abc-123d"/);
  assert.doesNotMatch(q, /drop/);
});

test('Markdown carries the policies, the IP table and the resources', () => {
  const m = WhoIsSp.analyze({ sp: single, tenantId: T, now: NOW, days: 7, locations: LOCS, policies: [pol('p1', 'CA900-Block', ['sp-1'])], records: [rec('84.241.196.40', 'Microsoft Graph')] });
  const md = WhoIsSp.toMd(m, { tenant: 'Contoso', rangeLabel: '7 days' });
  assert.match(md, /# Who is svc-backup to Conditional Access — Contoso/);
  assert.match(md, /\| CA900 \| On \| named directly \|/);
  assert.match(md, /## IP addresses it signs in from/);
  assert.match(md, /## Resources it signs in to/);
});
