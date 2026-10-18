// R89 (beta 32709): ENCA signs in only through a registration in the tenant you
// sign in to. These tests hold the four places that could quietly bring a
// shared, multi-tenant login back: the shipped config and its guard, the ⚙
// connection store, the container entrypoint and the registration script, plus
// the SHA-256 the sign-in card checks the script against.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const GUID_A = '11111111-1111-1111-1111-111111111111', GUID_T = '22222222-2222-2222-2222-222222222222';

function loadConfig({ host = 'enca.limon-it.nl', encaAuth, store } = {}) {
  const ls = new Map(store ? [['enca-connections', JSON.stringify(store)]] : []);
  const box = {
    location: { hostname: host, origin: 'https://' + host, pathname: host === 'nurejev.github.io' ? '/enca-beta/' : '/', reload() { box.reloaded = true; } },
    window: { ENCA_AUTH: encaAuth },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { length: 0, key: () => null, removeItem() {} },
    document: { readyState: 'loading', addEventListener() {} },
    console,
  };
  box.window.location = box.location;
  vm.createContext(box);
  vm.runInContext(read('js/authConfig.js') + '\n' + read('js/connection.js') + '\nglobalThis.__x = { AUTH_CONFIG, EncaConn };', box);
  return box.__x;
}

test('the shipped config has no login on the hosted site, and the beta host keeps its own single-tenant one', () => {
  const p = loadConfig();
  assert.equal(p.AUTH_CONFIG.clientId, ''); assert.equal(p.AUTH_CONFIG.authority, ''); assert.equal(p.AUTH_CONFIG.refused, '');
  // The beta channel's per-host default (AUTH_HOSTS) exists on beta only; on
  // main the beta host gets the same empty default as any other host.
  const b = loadConfig({ host: 'nurejev.github.io' });
  if (/const AUTH_HOSTS/.test(read('js/authConfig.js'))) {
    assert.equal(b.AUTH_CONFIG.clientId, '6da2c636-e3ef-4fc1-b431-37e79aae2184');
    assert.match(b.AUTH_CONFIG.authority, /\/020eb2d3-8046-4257-828d-64bf3ece8fbb$/);
  } else assert.equal(b.AUTH_CONFIG.clientId, '');
  assert.doesNotMatch(read('js/authConfig.js'), /4437195a/, 'the retired shared client ID must not come back');
});

test('a shared authority or half a login from a deployment file is refused, not used', () => {
  for (const tail of ['organizations', 'common', 'consumers', 'Organizations/']) {
    const x = loadConfig({ host: 'enca.example', encaAuth: { clientId: GUID_A, authority: 'https://login.microsoftonline.com/' + tail } });
    assert.equal(x.AUTH_CONFIG.clientId, ''); assert.equal(x.AUTH_CONFIG.refused, 'shared');
    assert.equal(x.AUTH_CONFIG.refusedFrom.clientId, GUID_A);
  }
  assert.equal(loadConfig({ host: 'enca.example', encaAuth: { clientId: GUID_A } }).AUTH_CONFIG.refused, 'no-tenant');
  assert.equal(loadConfig({ host: 'enca.example', encaAuth: { authority: 'https://login.microsoftonline.com/' + GUID_T } }).AUTH_CONFIG.refused, 'no-client');
  const ok = loadConfig({ host: 'enca.example', encaAuth: { clientId: GUID_A, authority: 'https://login.microsoftonline.com/' + GUID_T } });
  assert.equal(ok.AUTH_CONFIG.clientId, GUID_A); assert.equal(ok.AUTH_CONFIG.refused, '');
});

test('the ⚙ form needs both values and refuses shared endpoints', () => {
  const { EncaConn } = loadConfig();
  assert.match(EncaConn.validate({ clientId: GUID_A, tenant: '' }), /two values/);
  assert.match(EncaConn.validate({ clientId: '', tenant: 'contoso.onmicrosoft.com' }), /two values/);
  assert.match(EncaConn.validate({ clientId: GUID_A, tenant: 'organizations' }), /shared endpoints/);
  assert.match(EncaConn.validate({ clientId: GUID_A, tenant: 'https://login.microsoftonline.com/common' }), /shared endpoints/);
  assert.match(EncaConn.validate({ clientId: 'not-a-guid', tenant: 'contoso.onmicrosoft.com' }), /GUID/);
  assert.equal(EncaConn.validate({ clientId: GUID_A, tenant: 'contoso.onmicrosoft.com' }), '');
  assert.equal(EncaConn.validate({ clientId: GUID_A, tenant: GUID_T }), '');
});

test('a saved login that is not whole is kept but signs in with nothing — never the shipped login', () => {
  const half = { v: 1, active: 'c1', list: [{ id: 'c1', name: 'old', clientId: GUID_A, authority: '' }] };
  const b = loadConfig({ host: 'nurejev.github.io', store: half });
  assert.equal(b.AUTH_CONFIG.clientId, ''); assert.equal(b.AUTH_CONFIG.refused, 'connection');
  assert.equal(b.EncaConn.list().length, 1);
  const shared = { v: 1, active: 'c2', list: [{ id: 'c2', name: 'shared', clientId: GUID_A, authority: 'https://login.microsoftonline.com/organizations' }] };
  assert.equal(loadConfig({ store: shared }).AUTH_CONFIG.clientId, '');
  const whole = { v: 1, active: 'c3', list: [{ id: 'c3', name: 'Contoso', clientId: GUID_A, authority: 'https://login.microsoftonline.com/' + GUID_T }] };
  const w = loadConfig({ store: whole });
  assert.equal(w.AUTH_CONFIG.clientId, GUID_A); assert.equal(w.AUTH_CONFIG.refused, '');
});

test('the Cloud Shell command fetches this copy\'s script and checks the SHA-256 the file really has', () => {
  const { EncaConn } = loadConfig();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'New-EncaAppRegistration.ps1'))).digest('hex').toUpperCase();
  assert.equal(EncaConn.PS_SHA256, sha, 'PS_SHA256 in js/connection.js is stale — recompute it from New-EncaAppRegistration.ps1');
  const line = EncaConn.psLine();
  assert.match(line, /Invoke-WebRequest 'https:\/\/enca\.limon-it\.nl\/New-EncaAppRegistration\.ps1'/);
  assert.ok(line.includes(`-ne '${sha}'`)); assert.match(line, /throw /);
  assert.match(line, /-RedirectUris 'https:\/\/enca\.limon-it\.nl\/'/); assert.match(line, /-RequireAssignment/);
  const beta = loadConfig({ host: 'nurejev.github.io' }).EncaConn.psLine();
  assert.match(beta, /'https:\/\/nurejev\.github\.io\/enca-beta\/New-EncaAppRegistration\.ps1'/);
  assert.match(beta, /-RedirectUris 'https:\/\/nurejev\.github\.io\/enca-beta\/'/);
});

test('the registration script makes single-tenant registrations only and stays ASCII', () => {
  const ps = read('New-EncaAppRegistration.ps1');
  assert.doesNotMatch(ps, /AzureADMultipleOrgs|\/organizations\//);
  assert.match(ps, /\$audience = "AzureADMyOrg"/);
  assert.match(ps, /Get-AzAccessToken -ResourceTypeName MSGraph/);
  assert.doesNotMatch(ps, /Set-Content -Path \$AuthConfigPath/, 'the script must never edit js/authConfig.js');
  assert.doesNotMatch(ps, /[^\x00-\x7F]/, 'non-ASCII breaks Windows PowerShell 5.1 reading a BOM-less file');
});

test('the container refuses a client without a tenant and a shared authority', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'enca-r89-'));
  fs.mkdirSync(path.join(dir, 'js')); fs.writeFileSync(path.join(dir, 'js', 'authConfig.js'), read('js/authConfig.js'));
  const run = (env) => { try { execFileSync('sh', [path.join(root, 'selfhost', 'docker-entrypoint.sh'), 'true'], { env: { ...process.env, ENCA_ROOT: dir, ...env }, encoding: 'utf8', stdio: 'pipe' }); return { code: 0 }; } catch (e) { return { code: e.status, err: String(e.stderr) }; } };
  const a = run({ ENCA_CLIENT_ID: GUID_A }); assert.equal(a.code, 1); assert.match(a.err, /without ENCA_TENANT_ID/);
  const b = run({ ENCA_CLIENT_ID: GUID_A, ENCA_AUTHORITY: 'https://login.microsoftonline.com/organizations' }); assert.equal(b.code, 1); assert.match(b.err, /shared endpoint/);
  const c = run({ ENCA_CLIENT_ID: GUID_A, ENCA_TENANT_ID: GUID_T }); assert.equal(c.code, 0);
  assert.match(fs.readFileSync(path.join(dir, 'js', 'authConfig.js'), 'utf8'), new RegExp('authority: "https://login.microsoftonline.com/' + GUID_T + '"'));
});

test('Graph builds no MSAL instance without a login, and sign-in says so', async () => {
  let built = 0;
  const box = { AUTH_CONFIG: { clientId: '', authority: '', scopes: ['Directory.Read.All'] }, window: { location: { origin: 'https://enca.limon-it.nl', pathname: '/' } }, localStorage: { getItem: () => null }, console,
    msal: { PublicClientApplication: class { constructor() { built++; } } } };
  vm.createContext(box);
  vm.runInContext(read('js/graph.js') + '\nglobalThis.api = Graph;', box);
  assert.equal(await box.api.init(), false); assert.equal(built, 0);
  await assert.rejects(() => box.api.signIn(), (e) => e.errorCode === 'no_login');
});
