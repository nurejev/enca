// 🕵 Who is Anna to CA 1.6.0 — the IP addresses she signs in from, matched
// to the tenant's named locations (js/whois.js ipsOf / ipsHtml / ipsCsv / ipsMd).
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..'), source = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const box = vm.createContext({ console: quiet, URL, Set, Map, Date, Intl, BigInt });
for (const [f, sym] of [['cascope.js', 'CaScope'], ['signins.js', 'Signins'], ['reportimpact.js', 'ReportImpact'], ['locsignin.js', 'LocSignin'], ['whois.js', 'WhoIs']]) vm.runInContext(source(f) + `\nglobalThis.${sym}=${sym};`, box);
const WhoIs = box.WhoIs;

const NOW = Date.parse('2026-11-26T12:00:00Z');
const LOCS = [
  { '@odata.type': '#microsoft.graph.ipNamedLocation', id: 'l-hq', displayName: 'HQ Zoetermeer', isTrusted: true, ipRanges: [{ cidrAddress: '84.241.196.0/24' }] },
  { '@odata.type': '#microsoft.graph.ipNamedLocation', id: 'l-v6', displayName: 'Office v6', isTrusted: false, ipRanges: [{ cidrAddress: '2a02:a46f:1:2::/64' }] },
  { '@odata.type': '#microsoft.graph.countryNamedLocation', id: 'l-bad', displayName: 'Blocked countries', countriesAndRegions: ['DE'] },
  { '@odata.type': '#microsoft.graph.countryNamedLocation', id: 'l-gps', displayName: 'GPS countries', countriesAndRegions: ['NL'], countryLookupMethod: 'authenticatorAppGps' },
];
let n = 0;
const rec = (when, ip, city, cc, extra = {}) => ({ id: 'si-' + (++n), createdDateTime: when, userId: 'u1', appDisplayName: extra.app || 'Microsoft Teams', ipAddress: ip, location: { city, countryOrRegion: cc }, deviceDetail: { deviceId: extra.dev || 'd1' }, status: { errorCode: 0 }, ...extra });

test('one row per address, matched by range, by country and by Entra’s own answer', () => {
  const recs = [
    rec('2026-11-26T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL'),
    rec('2026-11-25T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL', { app: 'Outlook', dev: 'd2' }),
    rec('2026-11-24T09:00:00Z', '2a02:a46f:1:2:0:0:0:1c', 'Den Haag', 'NL'),
    rec('2026-11-25T09:00:00Z', '185.107.56.80', 'Frankfurt', 'DE', { id: 'stop-1' }),
    rec('2026-11-20T09:00:00Z', '20.61.14.207', 'Amsterdam', 'NL', { networkLocationDetails: [{ networkType: 'trustedNamedLocation', networkNames: ['AVD egress'] }] }),
    rec('2026-11-20T09:00:00Z', '', '', ''),
  ];
  const ip = WhoIs.ipsOf(recs, new Set(['stop-1']), LOCS, NOW, 7);
  assert.equal(ip.rows.length, 4);
  assert.equal(ip.noIp, 1);
  const hq = ip.rows.find((r) => r.ip === '84.241.196.12');
  assert.equal(hq.count, 2); assert.equal(hq.devices, 2); assert.equal(hq.trusted, true); assert.equal(hq.inside, true);
  assert.deepEqual(Array.from(hq.locs, (l) => `${l.name}|${l.by}`), ['HQ Zoetermeer|range'], 'the GPS country list is never matched from an address');
  assert.deepEqual(Array.from(hq.apps).sort(), ['Microsoft Teams', 'Outlook']);
  const v6 = ip.rows.find((r) => r.v6);
  assert.equal(v6.net, '2a02:a46f:1:2::/64'); assert.equal(v6.inside, true); assert.equal(v6.trusted, false);
  const de = ip.rows.find((r) => r.ip === '185.107.56.80');
  assert.equal(de.stopped, 1); assert.equal(de.inside, false, 'a country list says where, not that the address is yours');
  assert.deepEqual(Array.from(de.locs, (l) => l.name), ['Blocked countries']);
  const avd = ip.rows.find((r) => r.ip === '20.61.14.207');
  assert.equal(avd.locs[0].name, 'AVD egress'); assert.equal(avd.locs[0].by, 'log'); assert.equal(avd.inside, true, 'Entra’s own answer counts even for a location not read here');
  assert.equal(ip.stoppedOutside.length, 1);
  assert.equal(ip.by.outside, 1); assert.equal(ip.by.stopped, 1);
  assert.deepEqual(Array.from(ip.countries, (c) => c.c), ['NL', 'DE']);
  assert.equal(ip.networks, 4);
});

test('new = first seen in the last 3 days, and only on a window long enough to mean it', () => {
  const recs = [rec('2026-11-25T09:00:00Z', '1.2.3.4', '', 'NL'), rec('2026-11-10T09:00:00Z', '5.6.7.8', '', 'NL')];
  assert.equal(WhoIs.ipsOf(recs, new Set(), LOCS, NOW, 30).rows.find((r) => r.ip === '1.2.3.4').recent, true);
  assert.equal(WhoIs.ipsOf(recs, new Set(), LOCS, NOW, 30).rows.find((r) => r.ip === '5.6.7.8').recent, false);
  assert.equal(WhoIs.ipsOf(recs, new Set(), LOCS, NOW, 1).by.recent, 0, 'a one-day window makes everything new — so nothing is');
});

test('concentrated traffic is called out from 20 sign-ins and 90% on two addresses', () => {
  const recs = [];
  for (let i = 0; i < 19; i++) recs.push(rec('2026-11-25T09:00:00Z', '84.241.196.40', 'Zoetermeer', 'NL'));
  recs.push(rec('2026-11-25T09:00:00Z', '84.241.196.41', 'Zoetermeer', 'NL'));
  const ip = WhoIs.ipsOf(recs, new Set(), LOCS, NOW, 7);
  assert.ok(ip.concentrated); assert.equal(Math.round(ip.concentrated.share * 100), 100);
  assert.equal(WhoIs.ipsOf(recs.slice(0, 10), new Set(), LOCS, NOW, 7).concentrated, null, 'ten sign-ins prove nothing');
  assert.match(WhoIs.ipsHtml(ip, { who: 'it', whose: 'its' }), /an account that runs from a server/);
});

test('named locations not read: nothing is matched and the card says so', () => {
  const ip = WhoIs.ipsOf([rec('2026-11-25T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL')], new Set(), null, NOW, 7);
  assert.equal(ip.locationsRead, false); assert.equal(ip.rows[0].inside, false);
  const html = WhoIs.ipsHtml(ip, {});
  assert.match(html, /named locations not read/); assert.match(html, /could not be read/);
});

test('render: filter chips, the /24 · /64 grouping, and the hunting note', () => {
  const recs = [rec('2026-11-25T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL'), rec('2026-11-25T09:00:00Z', '84.241.196.13', 'Zoetermeer', 'NL'), rec('2026-11-25T09:00:00Z', '185.107.56.80', 'Frankfurt', 'DE', { id: 's2' })];
  const ip = WhoIs.ipsOf(recs, new Set(['s2']), LOCS, NOW, 7);
  const out = WhoIs.ipsHtml(ip, { filter: 'outside' });
  assert.match(out, /185\.107\.56\.80/); assert.doesNotMatch(out, /<b class="mono">84\.241\.196\.12/);
  const grouped = WhoIs.ipsHtml(ip, { group: true });
  assert.match(grouped, /84\.241\.196\.0\/24/); assert.match(grouped, /2 addresses/);
  assert.match(WhoIs.ipsHtml(ip, { source: { label: 'Defender hunting' } }), /matched by its ranges and countries here/);
  assert.match(WhoIs.ipsHtml(ip, {}), /data-wo-ipcsv/);
});

test('CSV and Markdown carry every address', () => {
  const ip = WhoIs.ipsOf([rec('2026-11-25T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL'), rec('2026-11-25T09:00:00Z', '185.107.56.80', 'Frankfurt', 'DE', { id: 's3' })], new Set(['s3']), LOCS, NOW, 7);
  const csv = WhoIs.ipsCsv(ip).split('\n');
  assert.equal(csv.length, 3); assert.match(csv[0], /^ip_address,network,/);
  assert.match(csv.join('\n'), /HQ Zoetermeer \[trusted, range\]/);
  const md = WhoIs.ipsMd(ip, 'she', (v) => String(v ?? '')).join('\n');
  assert.match(md, /## IP addresses she signs in from/); assert.match(md, /185\.107\.56\.80\*\* \(Frankfurt, DE\) — 1 of 1 stopped/);
});

test('analyze puts the card on the result and render places it after the applications', () => {
  const user = { id: 'u1', name: 'Anna', upn: 'anna@contoso.com', enabled: true, guest: false, groupIds: new Set(), roleIds: new Set(), names: {}, direct: new Set(), via: {} };
  const res = WhoIs.analyze({ user, vms: [], records: [rec('2026-11-25T09:00:00Z', '84.241.196.12', 'Zoetermeer', 'NL')], cat: null, dgPresent: new Map(), days: 7, now: NOW, locations: LOCS });
  assert.equal(res.ips.rows.length, 1);
  const html = WhoIs.render(res, {});
  assert.ok(html.indexOf('🗃 Applications') < html.indexOf('🌐 IP addresses'));
  assert.match(WhoIs.toMd(res, {}), /## IP addresses she signs in from/);
});
