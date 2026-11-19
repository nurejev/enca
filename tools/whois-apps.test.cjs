// 🕵 Who is Anna to CA 1.5.0 — the applications she signs in to, and which
// of her exclusions cover each one (js/whois.js appsOf / appsCsv / render).
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..'), source = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const box = vm.createContext({ console: quiet, URL, Set, Map, Date, Intl });
for (const [f, sym] of [['cascope.js', 'CaScope'], ['signins.js', 'Signins'], ['reportimpact.js', 'ReportImpact'], ['whois.js', 'WhoIs']]) vm.runInContext(source(f) + `\nglobalThis.${sym}=${sym};`, box);
const WhoIs = box.WhoIs;

const EXO = '00000002-0000-0ff1-ce00-000000000000', SPO = '00000003-0000-0ff1-ce00-000000000000', TEAMS = 'cc15fd57-2c6c-4117-a88c-83b1d56b4bbe';
const VIVA = '00000005-0000-0ff1-ce00-000000000000', SALES = 'aaaaaaaa-0000-0000-0000-00000000sale', ARM = '797f4846-ba00-4fd7-ba43-dac1f8f63013';
const NOW = Date.parse('2026-11-19T12:00:00Z');
const pol = (id, name, apps, extra = {}) => ({
  raw: { id, displayName: name, state: extra.state || 'enabled', conditions: { users: { includeUsers: ['All'], excludeGroups: extra.noExclude ? [] : ['g-ex'] }, applications: apps }, grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] } },
  name, grant: { controls: ['Require device to be marked compliant'], op: 'OR' }, session: [],
  apps: { inc: (apps.includeApplications || []).map((x) => ({ [SALES]: 'Salesforce', [VIVA]: 'Viva Engage' }[x] || x)), exc: [] },
});
const user = { id: 'u1', name: 'Anna', upn: 'anna@contoso.com', enabled: true, guest: false, groupIds: new Set(['g-ex']), roleIds: new Set(), names: { 'g-ex': 'CAE-SEC-U-Exclude' }, direct: new Set(['g-ex']), via: {} };
let n = 0;
const rec = (when, app, appId, res, resId, extra = {}) => ({ id: 'si-' + (++n), createdDateTime: when, userId: 'u1', appDisplayName: app, appId, resourceDisplayName: res, resourceId: resId, deviceDetail: { deviceId: extra.dev || 'd1' }, status: { errorCode: 0 }, conditionalAccessStatus: 'success', appliedConditionalAccessPolicies: [], ...extra });
const records = () => [
  rec('2026-11-19T10:00:00Z', 'Microsoft Teams', TEAMS, 'Microsoft Teams', TEAMS),
  rec('2026-11-18T10:00:00Z', 'Microsoft Teams', TEAMS, 'Office 365 SharePoint Online', SPO),
  rec('2026-11-17T10:00:00Z', 'Microsoft Teams', TEAMS, 'Viva Engage', VIVA, { dev: 'd2' }),
  rec('2026-11-19T09:00:00Z', 'Outlook', 'out-1', 'Office 365 Exchange Online', EXO),
  rec('2026-10-29T09:00:00Z', 'Azure Portal', 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c', 'Windows Azure Service Management API', ARM),
  rec('2026-11-01T09:00:00Z', 'someone else', 'x', 'x', 'x', { userId: 'u2' }),
];
const run = (vms, recs = records()) => WhoIs.analyze({ user, vms, records: recs, cat: null, dgPresent: new Map(), days: 30, now: NOW });
const row = (res, app) => res.apps.rows.find((a) => a.app === app);

test('one row per application, her records only, with the resources it reached', () => {
  const res = run([pol('p-all', 'CA204-AllApps', { includeApplications: ['All'] })]);
  assert.equal(res.apps.total, 5);
  assert.deepEqual(Array.from(res.apps.rows, (a) => a.app), ['Microsoft Teams', 'Azure Portal', 'Outlook']);
  const t = row(res, 'Microsoft Teams');
  assert.equal(t.count, 3);
  assert.deepEqual(Array.from(t.resources, (r) => r.name).sort(), ['Microsoft Teams', 'Office 365 SharePoint Online', 'Viva Engage']);
  assert.equal(t.devices, 2);
  assert.equal(t.last, '2026-11-19T10:00:00Z');
  assert.equal(t.first, '2026-11-17T10:00:00Z');
});

test('days since the last sign-in count from now; stale from 14 days', () => {
  const res = run([]);
  assert.equal(row(res, 'Microsoft Teams').days, 0);
  assert.equal(row(res, 'Microsoft Teams').stale, false);
  assert.equal(row(res, 'Azure Portal').days, 21);
  assert.equal(row(res, 'Azure Portal').stale, true);
  assert.equal(res.apps.by.stale, 1);
});

test('an exclusion on an all-resources policy is on every row, as "all"', () => {
  const res = run([pol('p-all', 'CA204-AllApps', { includeApplications: ['All'] })]);
  assert.equal(res.apps.exclusions, 1);
  assert.equal(res.apps.allRes.length, 1);
  res.apps.rows.forEach((a) => { assert.equal(a.excluded.length, 1); assert.equal(a.excluded[0].how, 'all'); assert.equal(a.named, false); });
  assert.equal(row(res, 'Microsoft Teams').excluded[0].via, 'CAE-SEC-U-Exclude');
  assert.equal(res.apps.unused.length, 0, 'an all-resources policy is never called unused');
});

test('a policy naming a resource matches the application that reached it', () => {
  const res = run([pol('p-viva', 'CA216-VivaEngage', { includeApplications: [VIVA] })]);
  const t = row(res, 'Microsoft Teams');
  assert.equal(t.excluded.length, 1);
  assert.equal(t.excluded[0].how, 'app');
  assert.equal(t.excluded[0].n, 1, 'only the sign-in that reached Viva Engage');
  assert.equal(t.excluded[0].seq, 'CA216');
  assert.equal(row(res, 'Outlook').excluded.length, 0);
  assert.equal(res.apps.unused.length, 0);
  assert.equal(res.apps.by.excl, 1);
});

test('a named application with no sign-in in the window is a review candidate', () => {
  const res = run([pol('p-sales', 'CA310-Salesforce', { includeApplications: [SALES] })]);
  assert.equal(res.apps.unused.length, 1);
  assert.equal(res.apps.unused[0].seq, 'CA310');
  assert.deepEqual(Array.from(res.apps.unused[0].apps), ['Salesforce']);
  assert.equal(res.apps.unused[0].via, 'CAE-SEC-U-Exclude');
  res.apps.rows.forEach((a) => assert.equal(a.excluded.length, 0));
  const html = WhoIs.render(res, { rangeLabel: '30 days', source: { label: 'Entra sign-in log', nonInteractive: false, fuller: 'Hunting + non-interactive' } });
  assert.match(html, /Applications she signs in to/);
  assert.match(html, /No sign-in to what/);
  assert.match(html, /interactive<\/b> sign-ins only/);
  assert.match(WhoIs.toMd(res, { rangeLabel: '30 days' }), /## Applications she signs in to \(30 days\)[\s\S]*No sign-in to what CA310 covers/);
});

test('an excluded application takes the sign-in back out of the policy', () => {
  const res = run([pol('p-allbut', 'CA205-AllButExchange', { includeApplications: ['All'], excludeApplications: [EXO] })]);
  assert.equal(row(res, 'Outlook').excluded.length, 0);
  assert.equal(row(res, 'Microsoft Teams').excluded.length, 1);
});

test('the Office 365 app group is matched on its core services and never called unused', () => {
  const res = run([pol('p-o365', 'CA206-Office365', { includeApplications: ['Office365'] })]);
  assert.equal(row(res, 'Outlook').excluded[0].how, 'group');
  assert.equal(row(res, 'Azure Portal').excluded.length, 0);
  const none = run([pol('p-o365', 'CA206-Office365', { includeApplications: ['Office365'] })], [records()[4]]);
  assert.equal(none.apps.unused.length, 0);
});

test('only an exclusion on a policy that is not Off and would reach her counts', () => {
  const off = run([pol('p-off', 'CA207-Off', { includeApplications: ['All'] }, { state: 'disabled' })]);
  assert.equal(off.apps.exclusions, 0);
  const inc = run([pol('p-inc', 'CA208-Included', { includeApplications: ['All'] }, { noExclude: true })]);
  assert.equal(inc.apps.exclusions, 0);
  inc.apps.rows.forEach((a) => assert.equal(a.excluded.length, 0));
  const ro = run([pol('p-ro', 'CA209-RO', { includeApplications: [VIVA] }, { state: 'enabledForReportingButNotEnforced' })]);
  assert.equal(row(ro, 'Microsoft Teams').excluded[0].state, 'ro');
});

test('a user-action policy is counted apart, not matched to an application', () => {
  const res = run([pol('p-act', 'CA210-RegisterSecurityInfo', { includeUserActions: ['urn:user:registersecurityinfo'] })]);
  assert.equal(res.apps.otherScope.length, 1);
  assert.equal(res.apps.unused.length, 0);
  res.apps.rows.forEach((a) => assert.equal(a.excluded.length, 0));
});

test('the filter chips narrow the table, and the CSV carries every application', () => {
  const res = run([pol('p-viva', 'CA216-VivaEngage', { includeApplications: [VIVA] })]);
  const body = (h) => h.slice(h.indexOf('Applications she signs in to'), h.indexOf('MFA on her sign-ins') > 0 ? h.indexOf('MFA on her sign-ins') : undefined);
  const all = body(WhoIs.render(res, { rangeLabel: '30 days' }));
  const ex = body(WhoIs.render(res, { rangeLabel: '30 days', appFilter: 'excl' }));
  assert.match(all, /<b>Outlook<\/b>/);
  assert.doesNotMatch(ex, /<b>Outlook<\/b>/);
  assert.match(ex, /<b>Microsoft Teams<\/b>/);
  assert.match(ex, /reaches [^<]*Viva Engage/);
  const csv = WhoIs.appsCsv(res).split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^application,appId,resources,sign_ins/);
  assert.match(csv[1], /^Microsoft Teams,.*CA216 \[named\] via CAE-SEC-U-Exclude/);
});
