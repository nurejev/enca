// 🪪 Own registration — onboarding from the browser (R59, build 25438), the pure half.
//   node --test tools/onboard.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const box = { console, location: { hostname: "enca.contoso.example", origin: "https://enca.contoso.example", pathname: "/" }, document: { readyState: "complete", getElementById: () => null, addEventListener: () => {} }, sessionStorage: {}, localStorage: {}, APP_BUILD: { build: 25438, label: "v1.0.250-beta.438" } };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, "js/onboard.js"), "utf8"), box, { filename: "onboard.js" });
vm.runInContext("globalThis.O = Onboard;", box);
const O = box.O;
const plain = (v) => JSON.parse(JSON.stringify(v));

test("the scope list matches New-EncaAppRegistration.ps1's $DelegatedScopes exactly", () => {
  const ps = fs.readFileSync(path.join(root, "New-EncaAppRegistration.ps1"), "utf8");
  const m = /\[string\[\]\]\$DelegatedScopes = @\(([^)]*)\)/.exec(ps);
  assert.ok(m, "the parameter is where the test expects it");
  const scopes = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(plain(O.SCOPES), scopes);
});

test("the application body is the script's registration in Graph's shape", () => {
  const ids = {}; O.SCOPES.forEach((s, i) => ids[s] = `id-${i}`);
  const b = O.appBody({ name: " Contoso CA Review ", localhost: true }, ids);
  assert.equal(b.displayName, "Contoso CA Review");
  assert.equal(b.signInAudience, "AzureADMyOrg");
  assert.deepEqual(plain(b.spa.redirectUris), ["https://enca.contoso.example/", "http://localhost:8080"]);
  assert.equal(b.web.implicitGrantSettings.enableAccessTokenIssuance, false);
  assert.equal(b.web.implicitGrantSettings.enableIdTokenIssuance, false);
  assert.equal(b.requiredResourceAccess[0].resourceAppId, "00000003-0000-0000-c000-000000000000");
  assert.equal(b.requiredResourceAccess[0].resourceAccess.length, O.SCOPES.length);
  assert.ok(b.requiredResourceAccess[0].resourceAccess.every((x) => x.type === "Scope"));
  // a scope Graph does not offer is left out, never sent as undefined
  const some = { ...ids }; delete some["Group-NestingSupport.ReadWrite.All"];
  assert.equal(O.appBody({ name: "x" }, some).requiredResourceAccess[0].resourceAccess.length, O.SCOPES.length - 1);
  assert.deepEqual(plain(O.appBody({ name: "x" }, ids).spa.redirectUris), ["https://enca.contoso.example/"]);
});

test("eligibility is the four roles, by template id, case-insensitive", () => {
  assert.equal(O.eligibleRoles([{ roleTemplateId: "62E90394-69F5-4237-9190-012177145E10" }]), true);
  assert.equal(O.eligibleRoles([{ roleTemplateId: "158c047a-c907-4556-b7ef-446551a6b5f7" }]), true);
  assert.equal(O.eligibleRoles([{ roleTemplateId: "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9" }]), false); // Conditional Access Administrator cannot register or consent
  assert.equal(O.eligibleRoles([]), false); assert.equal(O.eligibleRoles(null), false);
  assert.deepEqual(plain(O.roleNames([{ roleTemplateId: "62e90394-69f5-4237-9190-012177145e10" }, { roleTemplateId: "x" }])), ["Global Administrator"]);
});

test("the plan says the assignment goes you-first and names the consent grant", () => {
  const s = { account: { username: "mihai@contoso.example" } };
  const ops = O.plan({ name: "ENCA — Contoso", localhost: false, assign: true, consent: true }, s);
  assert.deepEqual(plain(ops.map((o) => o.op)), ["CREATE", "SET", "SET", "CREATE", "SET", "GRANT", "SAVE"]);
  assert.match(ops[4].sub, /after assigning mihai@contoso.example — you first/);
  assert.match(ops[5].sub, /AllPrincipals/);
  const few = O.plan({ name: "x", assign: false, consent: false }, s);
  assert.deepEqual(plain(few.map((o) => o.op)), ["CREATE", "SET", "SET", "CREATE", "SAVE"]);
  assert.match(O.plan({ name: "x", exists: true }, s)[0].sub, /UPDATED, not duplicated/);
});

test("the container-app env keeps every other variable and drops ENCA_AUTHORITY", () => {
  const env = O.acaEnv([{ name: "ENCA_BRANDING", value: "{}" }, { name: "ENCA_CLIENT_ID", value: "old" }, { name: "ENCA_AUTHORITY", value: "https://login.microsoftonline.com/old" }, { name: "OTHER", value: "1" }], "new-client", "new-tenant");
  assert.deepEqual(plain(env), [{ name: "ENCA_BRANDING", value: "{}" }, { name: "OTHER", value: "1" }, { name: "ENCA_CLIENT_ID", value: "new-client" }, { name: "ENCA_TENANT_ID", value: "new-tenant" }]);
  assert.deepEqual(plain(O.acaEnv(undefined, "c", "t")), [{ name: "ENCA_CLIENT_ID", value: "c" }, { name: "ENCA_TENANT_ID", value: "t" }]);
});

test("the copy blocks are the three shapes SINGLE-TENANT.md and the template take", () => {
  assert.equal(O.localJs("c", "t"), 'window.ENCA_AUTH = {\n  clientId:  "c",\n  authority: "https://login.microsoftonline.com/t",\n};\n');
  assert.equal(O.dockerLines("c", "t"), "-e ENCA_CLIENT_ID=c -e ENCA_TENANT_ID=t");
  assert.deepEqual(JSON.parse(O.templateParams("c", "t")), { clientId: { value: "c" }, tenantId: { value: "t" } });
  const tpl = JSON.parse(fs.readFileSync(path.join(root, "selfhost/azuredeploy.json"), "utf8"));
  assert.ok(tpl.parameters.clientId && tpl.parameters.tenantId, "the template still names its parameters clientId and tenantId");
});

test("names: a default from the tenant, and the refusals", () => {
  assert.equal(O.defaultName("Contoso B.V."), "ENCA — Contoso B.V.");
  assert.equal(O.defaultName(""), "ENCA");
  assert.equal(O.validateName("  "), "Give the application a name — it is the handle the registration is found by.");
  assert.match(O.validateName("<script>"), /cannot contain/);
  assert.equal(O.validateName("ENCA — Contoso"), "");
});
