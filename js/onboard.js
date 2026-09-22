// ======================================================================
// 🪪 Own registration — onboarding a tenant from the browser (R59, build 25438)
//
// WHAT IT IS. New-EncaAppRegistration.ps1 -SingleTenant, done from the page:
// an administrator signed in through the registration this copy ships with
// registers ENCA in THEIR directory — single-tenant, SPA, the same delegated
// Graph permissions the script requests, a service principal, optionally
// assignment-required with them assigned first, optionally admin consent for
// the organisation — and the result becomes the default sign-in: for THIS
// BROWSER at once (an EncaConn connection, selected), and for THIS DEPLOYMENT
// when it is an Azure Container App they hold rights on (ENCA_CLIENT_ID and
// ENCA_TENANT_ID written onto the container app, the way Branding settings
// writes ENCA_BRANDING). Any other host gets the js/authConfig.local.js block
// and the docker -e lines to copy. SINGLE-TENANT.md stays the long form and
// the pipeline route.
//
// WHERE IT SHOWS. Before sign-in: a line on the sign-in card ("First time on
// this copy?") on every host but the publisher's own (BRANDING.host), which
// signs in with the shipped registration once and opens the wizard when the
// tenant has loaded. After sign-in: a band on the home page, and a row in the
// account menu, for a signed-in user who holds a role that can do this
// (Global, Privileged Role, Application or Cloud Application Administrator)
// while the copy still signs in through an app another directory owns.
// Dismissable per tenant; the menu row stays.
//
// WHAT IT NEEDS FROM THE PERSON. Consent, for themselves only, to
// Application.ReadWrite.All and DelegatedPermissionGrant.ReadWrite.All (plus
// AppRoleAssignment.ReadWrite.All when assignment is ticked) — asked on the
// Create click, at the top of the gesture (Graph.ensureScopes), never
// mid-run. They are consented to the SHIPPED registration for this session;
// the new registration never requests them.
//
// WHAT IT WRITES, IN ORDER, EACH READ BACK: the application (create, or update
// when one of that name exists — the name is the handle, as in the script), the
// service principal, the assignment (me first, then the requirement — never the
// other way round, so it cannot seal the person out), the admin consent
// grant. Then the connection in this browser. The Azure write is a separate
// button on the last step with its own ARM consent. Demo mode simulates every
// step and writes nothing.
// ======================================================================
const Onboard = (() => {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const GRAPH_APP = "00000003-0000-0000-c000-000000000000";
  // The delegated permissions New-EncaAppRegistration.ps1 requests — KEEP IN
  // STEP with $DelegatedScopes there (tools/onboard.test.cjs checks it).
  const SCOPES = ["Policy.Read.All", "Directory.Read.All", "AuditLog.Read.All", "AdministrativeUnit.ReadWrite.All", "Agreement.Read.All", "Application.Read.All", "Application.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess", "Policy.ReadWrite.AuthenticationMethod", "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "RoleManagement.Read.Directory", "EntitlementManagement.Read.All", "DeviceManagementConfiguration.Read.All", "DeviceManagementApps.Read.All", "DeviceManagementServiceConfig.Read.All", "DeviceManagementScripts.Read.All", "Group-NestingSupport.ReadWrite.All"];
  // roles that can register an application AND grant tenant-wide consent to
  // delegated Graph permissions (Cloud Application / Application Administrator
  // can, for delegated permissions; Privileged Role Administrator can consent
  // and, with the default "users can register applications", create)
  const ROLES = {
    "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
    "e8611ab8-c189-46e8-94e1-60213ab1f814": "Privileged Role Administrator",
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3": "Application Administrator",
    "158c047a-c907-4556-b7ef-446551a6b5f7": "Cloud Application Administrator",
  };
  const NEED = ["Application.ReadWrite.All", "DelegatedPermissionGrant.ReadWrite.All"];
  const NEED_ASSIGN = ["AppRoleAssignment.ReadWrite.All"];
  const PENDING = "enca-onboard-pending";
  const DISMISS = (t) => `enca-onboard-dismissed:${t || "unknown"}`;
  const IS_ACA = /\.azurecontainerapps\.io$/i.test((location.hostname || "").toLowerCase());
  const redirectUri = () => (typeof EncaConn !== "undefined" ? EncaConn.redirectUri() : location.origin + location.pathname);

  let S = { tenantId: "", tenantName: "", demo: false, account: null, roles: null, owner: null, eligible: false, reason: "" };
  let step = 1, form = null, result = null, busy = false;

  // ---- pure: what the wizard says and writes -------------------------------------
  function defaultName(tenantName) { return tenantName ? `ENCA — ${tenantName}`.slice(0, 120) : "ENCA"; }
  function validateName(name) {
    const n = String(name || "").trim();
    if (!n) return "Give the application a name — it is the handle the registration is found by.";
    if (n.length > 120) return "The name is too long (120 characters at most).";
    if (/[<>]/.test(n)) return "The name cannot contain < or >.";
    return "";
  }
  // The registration body — the script's parameters, in Graph's shape.
  function appBody(f, scopeIds) {
    return {
      displayName: String(f.name || "").trim(),
      signInAudience: "AzureADMyOrg",
      spa: { redirectUris: uniq([redirectUri(), ...(f.localhost ? ["http://localhost:8080"] : [])]) },
      web: { implicitGrantSettings: { enableAccessTokenIssuance: false, enableIdTokenIssuance: false } },
      requiredResourceAccess: [{ resourceAppId: GRAPH_APP, resourceAccess: SCOPES.map((s) => ({ id: scopeIds[s], type: "Scope" })).filter((x) => x.id) }],
      notes: `Registered from ENCA in the browser (${typeof APP_BUILD !== "undefined" ? APP_BUILD.label || APP_BUILD.build : ""}) — single-tenant SPA, authorization code + PKCE, no secret. SINGLE-TENANT.md describes it.`,
    };
  }
  const uniq = (a) => [...new Set((a || []).filter(Boolean))];
  // The body for UPDATING an application that exists: its redirect URIs are
  // kept and ours added (the beta site and a customer's host can share one
  // registration — replacing the list would sign the other one out), the
  // audience and the name are left as they are.
  function updateBody(existing, f, scopeIds) {
    const b = appBody(f, scopeIds);
    const have = (existing && existing.spa && existing.spa.redirectUris) || [];
    return { spa: { redirectUris: uniq([...have, ...b.spa.redirectUris]) }, requiredResourceAccess: b.requiredResourceAccess, web: b.web };
  }
  function plan(f, s) {
    const ops = [];
    if (f.own) ops.push({ op: "UPDATE", what: `application ${f.name} — the one this copy already signs in with`, sub: "redirect URIs completed (existing ones kept) and the permission list completed; audience, platform and secrets untouched" });
    else ops.push({ op: "CREATE", what: `application ${f.name}`, sub: `single-tenant (AzureADMyOrg) · SPA platform · implicit grant off · no secret${f.exists ? " — an application of this name exists: it is UPDATED, not duplicated" : ""}` });
    ops.push({ op: "SET", what: `${f.localhost ? 2 : 1} SPA redirect URI${f.localhost ? "s" : ""}`, sub: redirectUri() + (f.localhost ? " · http://localhost:8080" : "") });
    ops.push({ op: "SET", what: `${SCOPES.length} delegated Microsoft Graph permissions`, sub: `${SCOPES.slice(0, 4).join(", ")} … — the same list New-EncaAppRegistration.ps1 requests` });
    ops.push({ op: "CREATE", what: "service principal", sub: "the enterprise application" });
    if (f.assign) ops.push({ op: "SET", what: "assignment required", sub: `after assigning ${s.account && s.account.username || "you"} — you first, then the requirement, so it cannot seal you out` });
    if (f.consent) ops.push({ op: "GRANT", what: "admin consent for the organisation", sub: `one oauth2PermissionGrant, AllPrincipals, ${SCOPES.length} scopes` });
    ops.push({ op: "SAVE", what: "the connection in this browser, selected", sub: "the ⚙ control on the sign-in card shows it; Default there restores the shipped registration" });
    return ops;
  }
  // The container-app template with the two variables set — the whole env
  // list carried, ENCA_AUTHORITY dropped (it would win over ENCA_TENANT_ID).
  function acaEnv(env, clientId, tenantId) {
    const keep = (env || []).filter((e) => e && !["ENCA_CLIENT_ID", "ENCA_TENANT_ID", "ENCA_AUTHORITY"].includes(e.name));
    return [...keep, { name: "ENCA_CLIENT_ID", value: clientId }, { name: "ENCA_TENANT_ID", value: tenantId }];
  }
  const localJs = (clientId, tenantId) => `window.ENCA_AUTH = {\n  clientId:  "${clientId}",\n  authority: "https://login.microsoftonline.com/${tenantId}",\n};\n`;
  const dockerLines = (clientId, tenantId) => `-e ENCA_CLIENT_ID=${clientId} -e ENCA_TENANT_ID=${tenantId}`;
  const templateParams = (clientId, tenantId) => JSON.stringify({ clientId: { value: clientId }, tenantId: { value: tenantId } }, null, 2);
  const roleNames = (roles) => (roles || []).map((r) => ROLES[String(r.roleTemplateId || "").toLowerCase()] || ROLES[r.roleTemplateId]).filter(Boolean);
  const eligibleRoles = (roles) => roleNames(roles).length > 0;

  // ---- state after sign-in --------------------------------------------------------
  // Called by js/app.js once the tenant (or the demo) has loaded. Reads the
  // signed-in person's directory roles (one call, base scope) and who owns the
  // registration this copy signs in with; then paints the band and the menu
  // row, and opens the wizard when the sign-in card asked for it.
  async function afterSignIn(state) {
    S = { ...S, ...(state || {}) };
    // The sign-in card's flag is read and cleared HERE, synchronously, before
    // the first await: js/app.js asks pending() right after this call to hold
    // the What's-new overlay back — two overlays opening on the same sign-in
    // was the 25438 bug (the wizard sat under What's new).
    try { S.pendingOpen = sessionStorage.getItem(PENDING) === "1"; sessionStorage.removeItem(PENDING); } catch { S.pendingOpen = false; }
    paintMenu(false);
    if (S.demo) {
      S.roles = [{ roleTemplateId: "62e90394-69f5-4237-9190-012177145e10" }];
      S.owner = { ownerTenantId: "publisher", name: "ENCA (Limon-IT)", audience: "AzureADMultipleOrgs" };
    } else {
      try { S.roles = ((await Graph.gget("/me/memberOf/microsoft.graph.directoryRole?$select=roleTemplateId,displayName")) || {}).value || []; }
      catch (e) { S.roles = null; S.reason = e && e.message || String(e); }
      try { S.owner = await Graph.connectionInfo(); } catch { S.owner = null; }
    }
    const own = !!(!S.demo && S.owner && S.owner.ownerTenantId && S.tenantId && String(S.owner.ownerTenantId).toLowerCase() === String(S.tenantId).toLowerCase());
    S.own = own; S.clientId = (S.owner && S.owner.clientId) || (typeof AUTH_CONFIG !== "undefined" && AUTH_CONFIG.clientId) || "";
    S.eligible = eligibleRoles(S.roles) && !own;
    paintMenu(true);
    paintBand();
    if (S.pendingOpen) open();
    return S;
  }
  const pending = () => !!S.pendingOpen;
  // the wizard closing is what lets a held-back What's new show
  function close() {
    const bg = $("obModal"); if (bg) bg.classList.remove("open");
    S.pendingOpen = false;
    document.dispatchEvent(new CustomEvent("enca:onboard-closed"));
  }
  function paintMenu() { /* since 25443 the Connected app block in the account menu carries the wizard's button (js/workspaces.js) */ }
  function dismissed() { try { return localStorage.getItem(DISMISS(S.tenantId)) === "1"; } catch { return false; } }
  function paintBand() {
    const old = $("onboardBand"); if (old) old.remove();
    if (!S.eligible || dismissed()) return;
    const ov = $("overview"); if (!ov) return;
    const roles = roleNames(S.roles);
    const owner = S.owner && S.owner.name ? S.owner.name : "an application";
    const html = `<div class="ob-band" id="onboardBand" role="region" aria-label="Own registration">
      <div class="ob-ic">🪪</div>
      <div class="ob-txt"><b>This copy signs in through an app registered outside ${esc(S.tenantName || "this tenant")}</b> — <code>${esc(owner)}</code>${S.owner && S.owner.audience === "AzureADMultipleOrgs" ? ", multi-tenant" : ""}, owned by ${S.owner && S.owner.ownerTenantId ? `tenant <code>${esc(S.owner.ownerTenantId)}</code>` : "another directory"}, holding a delegated grant on your Conditional Access configuration.
        <div class="mini muted" style="margin-top:4px">You are <b>${esc(roles[0] || "an administrator")}</b> here, so you can register ENCA in ${esc(S.tenantName || "this tenant")} from this page in about a minute: your own application ID, your own consent record, revocable by you alone. It becomes the default sign-in for <b>this browser</b> at once${IS_ACA ? ", and for <b>this deployment</b> if you hold rights on its container app" : ""}. The PowerShell route in SINGLE-TENANT.md stays for pipelines.</div></div>
      <div class="ob-act"><button type="button" class="btn primary sm" id="onboardOpen">🪪 Set up your own registration →</button><button type="button" class="btn sm" id="onboardLater" title="Hidden for this tenant; the account menu keeps a row for it">Not now</button></div></div>`;
    ov.insertAdjacentHTML("beforebegin", html);
    $("onboardOpen").addEventListener("click", open);
    $("onboardLater").addEventListener("click", () => { try { localStorage.setItem(DISMISS(S.tenantId), "1"); } catch {} paintBand(); });
    if (typeof FlatIcons !== "undefined") FlatIcons.apply($("onboardBand"));
  }

  // ---- the wizard --------------------------------------------------------------------
  function open() {
    step = 1; result = null; busy = false;
    form = form && form.tenantId === S.tenantId ? form : { tenantId: S.tenantId, name: S.own && S.owner && S.owner.name ? S.owner.name : defaultName(S.tenantName), localhost: false, assign: true, consent: true, exists: false, own: !!S.own, ok: false };
    form.own = !!S.own;
    render();
    $("obModal").classList.add("open");
  }
  const who = () => `${esc(S.tenantName || "this tenant")} · signed in as ${esc(S.account && S.account.username || (S.demo ? "demo@contoso.onmicrosoft.com" : ""))} · ${esc(roleNames(S.roles)[0] || "administrator")}${S.demo ? " · demo, nothing is written" : ""}`;
  const stepsBar = () => `<div class="ob-steps">${[["① What changes", 1], ["② The plan", 2], ["③ Run", 3], ["④ Default sign-in", 4]].map(([l, n]) => `<span class="${n === step ? "now" : n < step ? "done" : ""}">${n < step ? "✓ " + l.slice(2) : l}</span>`).join("")}</div>`;
  function render() {
    const m = $("obModalBody"); if (!m) return;
    const c = typeof EncaConn !== "undefined" ? EncaConn.shipped : { clientId: "", authority: "" };
    const multi = S.owner && /^AzureADMultipleOrgs$|^AzureADandPersonalMicrosoftAccount$/.test(S.owner.audience || "");
    const ownerTenant = S.own ? (S.tenantName || S.tenantId) : (S.owner && S.owner.ownerTenantId ? `tenant ${S.owner.ownerTenantId}` : "another directory");
    if (step === 1 && S.own) m.innerHTML = `<h3>🪪 This copy already signs in with a registration in ${esc(S.tenantName || "this tenant")} <span class="tag block">writes to tenant</span></h3><p class="mini muted" style="margin:0 0 6px">${who()}</p>${stepsBar()}
      <table class="ob-tbl"><tr><th></th><th>Today</th></tr>
        <tr><td>Application</td><td><b>${esc(S.owner.name || "Application")}</b> · <code>${esc(S.clientId)}</code></td></tr>
        <tr><td>Application owner</td><td class="y"><b>${esc(S.tenantName || S.tenantId)}</b> — this tenant</td></tr>
        <tr><td>Audience</td><td>${multi ? "multi-tenant — other directories can consent to it too" : "single-tenant — this directory only"}</td></tr>
        <tr><td>Sign-in mechanism</td><td>SPA · code + PKCE · no secret</td></tr></table>
      <p class="mini" style="margin:0 0 6px">There is nothing to onboard: the trust decision is already yours. Running the steps <b>checks and completes this registration</b> — the SPA redirect URI for the origin this copy is served from, the ${SCOPES.length} delegated permissions ENCA uses (existing redirect URIs and permissions are kept), the service principal, and optionally assignment and organisation-wide consent. Name, audience and secrets are not touched.</p>
      <label class="ob-f">Application name <input type="text" id="obName" value="${esc(form.name)}" maxlength="120" readonly><span class="mini">The registration this copy signs in with — found by its application ID, not by name.</span></label>
      <label class="ob-f">SPA redirect URI — the origin this copy is served from, added if missing <code class="ro">${esc(redirectUri())}</code></label>
      <div class="ob-row"><input type="checkbox" id="obLocal"${form.localhost ? " checked" : ""}><span>Also register <code>http://localhost:8080</code> for running a copy locally</span></div>
      <div class="ob-row"><input type="checkbox" id="obAssign"${form.assign ? " checked" : ""}><span><b>Restrict to assigned users</b> — <i>Assignment required</i>, with <b>you assigned first</b>.</span></div>
      <div class="ob-row"><input type="checkbox" id="obConsent"${form.consent ? " checked" : ""}><span><b>Grant admin consent for the whole organisation</b> for the ${SCOPES.length} delegated permissions.</span></div>
      <div class="ob-err mini" id="obErr" style="display:none;color:var(--off);margin-top:8px"></div>
      <div class="modal-foot"><button type="button" class="btn" id="obCancel">Cancel</button><button type="button" class="btn primary" id="obNext">Next: the plan →</button></div>`;
    else if (step === 1) m.innerHTML = `<h3>🪪 Your own app registration <span class="tag block">writes to tenant</span></h3><p class="mini muted" style="margin:0 0 6px">${who()}</p>${stepsBar()}
      <table class="ob-tbl"><tr><th></th><th>Today — ${multi ? "shared, multi-tenant" : "another directory's"}</th><th>After — yours, single-tenant</th></tr>
        <tr><td>Application</td><td>${esc(S.owner && S.owner.name || "Application")} · <code>${esc(c.clientId || "—")}</code>${multi ? ", shared by every tenant" : ""}</td><td class="y">a new one, yours alone · <code>AzureADMyOrg</code></td></tr>
        <tr><td>Application owner</td><td>${esc(ownerTenant)}</td><td class="y"><b>${esc(S.tenantName || "your tenant")}</b></td></tr>
        <tr><td>Consent record</td><td>to an app another directory owns; its owner can retire the app</td><td class="y">to an app in your directory; only you can revoke or retire it</td></tr>
        <tr><td>Sign-in mechanism</td><td>SPA · code + PKCE · no secret</td><td class="y"><b>identical</b> — ownership changes, not the flow</td></tr></table>
      <label class="ob-f">Application name <input type="text" id="obName" value="${esc(form.name)}" maxlength="120"><span class="mini">Listed among your enterprise applications. Running this again with the same name updates it; a different name makes a second app.</span></label>
      <label class="ob-f">SPA redirect URI — the origin this copy is served from, registered exactly <code class="ro">${esc(redirectUri())}</code></label>
      <div class="ob-row"><input type="checkbox" id="obLocal"${form.localhost ? " checked" : ""}><span>Also register <code>http://localhost:8080</code> for running a copy locally</span></div>
      <div class="ob-row"><input type="checkbox" id="obAssign"${form.assign ? " checked" : ""}><span><b>Restrict to assigned users</b> — <i>Assignment required</i> on the enterprise application, with <b>you assigned first</b>, so the requirement can never seal you out. Add others later under Users and groups; nested groups do not count.</span></div>
      <div class="ob-row"><input type="checkbox" id="obConsent"${form.consent ? " checked" : ""}><span><b>Grant admin consent for the whole organisation</b> — the ${SCOPES.length} delegated Graph permissions are consented once for everyone. Unticked, every person consents for themselves at first sign-in.</span></div>
      <div class="ob-err mini" id="obErr" style="display:none;color:var(--off);margin-top:8px"></div>
      <div class="modal-foot"><button type="button" class="btn" id="obCancel">Cancel</button><button type="button" class="btn primary" id="obNext">Next: the plan →</button></div>`;
    else if (step === 2) m.innerHTML = `<h3>🪪 Your own app registration <span class="tag block">writes to tenant</span></h3><p class="mini muted" style="margin:0 0 6px">${who()}</p>${stepsBar()}
      <div class="ob-h">What will be written in ${esc(S.tenantName || "this tenant")} — in this order, each read back before the next</div>
      <div class="ml-apply-list">${plan(form, S).map((o) => `<div class="ml-apply-row"><span class="ml-op ${o.op === "CREATE" || o.op === "GRANT" ? "create" : ""}">${esc(o.op)}</span> ${esc(o.what)}${o.sub ? ` <span class="mini">· ${esc(o.sub)}</span>` : ""}</div>`).join("")}</div>
      <div class="ob-h">Likely impact</div>
      <ul class="mini" style="margin:0;padding-left:18px;line-height:1.55"><li><b>Nothing that exists changes.</b> The shared registration keeps working; its consent stays until you revoke it (Enterprise applications → its name → Permissions).</li><li>People opening this copy sign in to <b>your</b> app and see one consent screen naming it — once. Which app a browser uses is decided by its ⚙ connection, or by the deployment's own setting (step ④).</li><li>Your Conditional Access policies are not touched, and no policy applies differently.</li></ul>
      <div class="ob-h">Recovery</div>
      <ul class="mini" style="margin:0;padding-left:18px;line-height:1.55"><li>Delete the registration (App registrations → Delete; it sits in the deleted applications list for 30 days) — or ⚙ <b>Forget</b> the connection on the sign-in card and the shipped registration is used again.</li><li>Nothing here can lock you out of the tenant: <i>Assignment required</i> gates who may open ENCA, not who may administer Entra.</li></ul>
      <div class="ob-h">What ENCA needs from you now</div>
      <div class="ob-note">Consent, <b>for you only</b>, to <code>${NEED.join("</code>, <code>")}</code>${form.assign ? ` and <code>${NEED_ASSIGN[0]}</code>` : ""} — asked in a popup when you press Create, on that click, so it cannot be blocked mid-run. They are consented to the shipped registration for this session; the new app never requests them.</div>
      <div class="ob-row" style="margin-top:14px"><input type="checkbox" id="obOk"><span>I have read what will be written, and I want to create it</span></div>
      <div class="modal-foot"><button type="button" class="btn" id="obBack">← Back</button><button type="button" class="btn primary" id="obGo" disabled>Create in ${esc(S.tenantName || "this tenant")}</button></div>`;
    else if (step === 3) m.innerHTML = `<h3>🪪 Your own app registration <span class="tag block">writes to tenant</span></h3><p class="mini muted" style="margin:0 0 6px">${who()}</p>${stepsBar()}<div id="obLedger"></div><div class="modal-foot"><span class="mini muted" style="margin-right:auto">Each step is read back before the next; a failure stops the run and says where.</span></div>`;
    else if (step === 4) {
      const r = result || {};
      m.innerHTML = `<h3>🪪 Your own app registration <span class="tag ok">${r.ok ? "created" : "partly done"}</span></h3><p class="mini muted" style="margin:0 0 6px">${who()}</p>${stepsBar()}<div id="obLedger"></div>
      ${r.appId ? `<div class="ob-h">The two values — the same two the script prints</div><div class="ob-kv"><span>Application (client) ID</span><code>${esc(r.appId)}</code><span>Directory (tenant) ID</span><code>${esc(S.tenantId || "")}</code></div>
      <div class="ob-h">Default sign-in</div><div class="ob-def">
        <div class="ob-defrow${r.saved ? " ok" : ""}"><span class="ic">${r.saved ? "✓" : "✗"}</span><span><b>This browser</b> — ${r.saved ? `connection <b>${esc(r.connName)}</b> is saved and selected. The next sign-in uses it; ⚙ on the sign-in card shows it, and <b>Default</b> there restores the shipped one.` : "the connection could not be stored (private window?) — add it under ⚙ on the sign-in card."}</span></div>
        ${IS_ACA ? `<div class="ob-defrow" id="obAcaRow"><span class="ic">☁</span><span><b>This deployment</b> — an Azure Container App serves this page. <button type="button" class="btn sm primary" id="obAca">Set ENCA_CLIENT_ID and ENCA_TENANT_ID on it</button><span class="mini muted">Uses your own Azure rights (Contributor on the container app), the same way Branding settings does. Azure rolls a new revision; every visitor then signs in with your registration, and it survives image updates. Nothing is stored by ENCA.</span><span class="mini" id="obAcaOut"></span></span></div>` : ""}
        <div class="ob-defrow"><span class="ic">📋</span><span><b>Any other host</b> — <button type="button" class="btn sm" data-obcopy="local">Copy js/authConfig.local.js</button> <button type="button" class="btn sm" data-obcopy="docker">Copy docker -e lines</button> <button type="button" class="btn sm" data-obcopy="params">Copy Azure template parameters</button><span class="mini muted">For a copy you serve to other people: the file beside js/authConfig.js, or the two container variables — SINGLE-TENANT.md step 3.</span></span></div></div>` : `<p class="mini" style="color:var(--off)">The registration was not created — see the run above. Nothing else was changed.</p>`}
      <div class="modal-foot"><span class="mini muted" style="margin-right:auto">${r.appId ? `The consent screen will now name <b>${esc(form.name)}</b>, in ${esc(S.tenantName || "your tenant")}.` : ""}</span><button type="button" class="btn" id="obClose">Close</button>${r.saved && !S.demo ? `<button type="button" class="btn primary" id="obRelogin">Sign in again with your own registration →</button>` : ""}</div>`;
      if (result && result.ledgerHtml) { const l = $("obLedger"); if (l) l.innerHTML = result.ledgerHtml; }
    }
    if (typeof FlatIcons !== "undefined") FlatIcons.apply(m);
  }
  function readForm() {
    form.name = ($("obName") || {}).value || form.name; form.localhost = !!($("obLocal") || {}).checked; form.assign = !!($("obAssign") || {}).checked; form.consent = !!($("obConsent") || {}).checked;
  }
  function wire() {
    const bg = $("obModal"); if (!bg) return;
    bg.addEventListener("click", async (e) => {
      const t = e.target;
      if (t.id === "obCancel" || t.id === "obClose" || (t === bg && !busy)) { if (!busy) close(); return; }
      if (t.id === "obNext") { readForm(); const bad = validateName(form.name); const err = $("obErr"); if (bad) { err.textContent = bad; err.style.display = ""; return; } step = 2; render(); return; }
      if (t.id === "obBack") { step = 1; render(); return; }
      if (t.id === "obGo") { run(); return; }
      if (t.id === "obRelogin" && result && result.connId) { EncaConn.use(result.connId); return; }
      if (t.id === "obAca") { setOnAca(); return; }
      const cp = t.closest("[data-obcopy]");
      if (cp && result && result.appId) {
        const text = cp.dataset.obcopy === "local" ? localJs(result.appId, S.tenantId) : cp.dataset.obcopy === "docker" ? dockerLines(result.appId, S.tenantId) : templateParams(result.appId, S.tenantId);
        try { await navigator.clipboard.writeText(text); cp.textContent = "Copied"; setTimeout(() => render(), 1500); } catch { window.prompt("Copy the value below:", text); }
      }
    });
    bg.addEventListener("change", (e) => { if (e.target.id === "obOk") { const b = $("obGo"); if (b) b.disabled = !e.target.checked; } });
    const start = $("onboardStart");
    if (start) start.addEventListener("click", (e) => {
      e.preventDefault();
      try { sessionStorage.setItem(PENDING, "1"); } catch { /* the wizard is a click away after sign-in anyway */ }
      const b = $("signInBtn"); if (b) b.click();
    });
    const row = $("onboardBtn"); if (row) row.addEventListener("click", () => { const menu = $("acctMenu"); if (menu) menu.hidden = true; open(); });
  }

  // ---- the run --------------------------------------------------------------------------
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function settled(url, until) {
    if (typeof Importer !== "undefined" && Importer.readSettled) return Importer.readSettled(url, until);
    for (let i = 0; i < 6; i++) { try { const r = await Graph.gget(url); if (!until || until(r)) return r; } catch (e) { if (!/404|ResourceNotFound/i.test(e.message || "")) throw e; } await pause(1000 * (i + 1)); }
    return Graph.gget(url);
  }
  async function run() {
    if (busy) return;
    busy = true; step = 3; render();
    const items = [{ label: `Application ${form.name}`, sub: "create, or update the one of that name" }, { label: "SPA redirect URI and permissions", sub: `${SCOPES.length} delegated scopes` }, { label: "Service principal" }, ...(form.assign ? [{ label: "Assignment required", sub: "you first, then the requirement" }] : []), ...(form.consent ? [{ label: "Admin consent for the organisation" }] : []), { label: "Connection in this browser" }];
    const L = RunLedger.create($("obLedger"), { title: `Registering ENCA in ${S.tenantName || "this tenant"}`, items });
    const R = { ok: false, appId: null, appObjectId: null, spId: null, saved: false, connId: null, connName: "" };
    let i = 0;
    const fail = (why) => { L.fail(i, why); L.finish(); };
    try {
      if (S.demo) {
        for (i = 0; i < items.length; i++) { L.start(i); await pause(250); L.done(i, "simulated"); }
        R.appId = "00000000-1111-2222-3333-444444444444"; R.saved = true; R.connName = `${S.tenantName || "Demo"} — own registration`; R.ok = true;
      } else {
        // consent first, at the top of the gesture
        await Graph.ensureScopes([...AUTH_CONFIG.scopes, ...NEED, ...(form.assign ? NEED_ASSIGN : [])]);
        L.start(i);
        const graphSp = (((await Graph.gget(`/servicePrincipals?$filter=appId eq '${GRAPH_APP}'&$select=id,oauth2PermissionScopes`)) || {}).value || [])[0];
        if (!graphSp) throw new Error("The Microsoft Graph service principal was not found in this tenant.");
        const scopeIds = {}; (graphSp.oauth2PermissionScopes || []).forEach((p) => scopeIds[p.value] = p.id);
        const missing = SCOPES.filter((s) => !scopeIds[s]);
        const body = appBody(form, scopeIds);
        const existing = S.own && S.clientId
          ? (((await Graph.gget(`/applications?$filter=appId eq '${S.clientId}'&$select=id,appId,displayName,spa`)) || {}).value || [])
          : (((await Graph.gget(`/applications?$filter=displayName eq '${form.name.replace(/'/g, "''")}'&$select=id,appId,displayName,spa`)) || {}).value || []);
        let app;
        if (existing.length > 1) throw new Error(`${existing.length} applications are called ${form.name} — rename one in the portal first, or choose another name.`);
        if (S.own && !existing.length) throw new Error(`The registration this copy signs in with (${S.clientId}) was not found among this tenant's applications — this account may not read it.`);
        if (existing.length === 1) { await Graph.gpatch(`/applications/${existing[0].id}`, updateBody(existing[0], form, scopeIds)); app = await settled(`/applications/${existing[0].id}`, (a) => a && a.spa && (a.spa.redirectUris || []).includes(redirectUri())); L.done(i, "updated " + app.appId); }
        else { const created = await Graph.gpost("/applications", body); app = await settled(`/applications/${created.id}`, (a) => a && a.appId); L.done(i, app.appId); }
        R.appId = app.appId; R.appObjectId = app.id; i++;
        L.start(i); if (missing.length) L.part(i, `${missing.length} permission${missing.length === 1 ? "" : "s"} not offered by Graph here and left out: ${missing.join(", ")}`); else L.done(i, `${SCOPES.length} scopes`); i++;
        L.start(i);
        let sp = (((await Graph.gget(`/servicePrincipals?$filter=appId eq '${app.appId}'&$select=id,appId`)) || {}).value || [])[0];
        if (!sp) { sp = await Graph.createServicePrincipal(app.appId); sp = await settled(`/servicePrincipals/${sp.id}`, (x) => x && x.id); }
        R.spId = sp.id; L.done(i, sp.id); i++;
        if (form.assign) {
          L.start(i);
          const me = await Graph.gget("/me?$select=id,userPrincipalName");
          const have = (((await Graph.gget(`/servicePrincipals/${sp.id}/appRoleAssignedTo?$select=principalId`)) || {}).value || []).some((a) => a.principalId === me.id);
          if (!have) await Graph.gpost(`/servicePrincipals/${sp.id}/appRoleAssignedTo`, { principalId: me.id, resourceId: sp.id, appRoleId: "00000000-0000-0000-0000-000000000000" });
          await Graph.gpatch(`/servicePrincipals/${sp.id}`, { appRoleAssignmentRequired: true });
          L.done(i, `${me.userPrincipalName} assigned`); i++;
        }
        if (form.consent) {
          L.start(i);
          const scope = SCOPES.filter((s) => scopeIds[s]).join(" ");
          const grant = (((await Graph.gget(`/oauth2PermissionGrants?$filter=clientId eq '${sp.id}' and resourceId eq '${graphSp.id}' and consentType eq 'AllPrincipals'`)) || {}).value || [])[0];
          if (grant) await Graph.gpatch(`/oauth2PermissionGrants/${grant.id}`, { scope });
          else await Graph.gpost("/oauth2PermissionGrants", { clientId: sp.id, consentType: "AllPrincipals", resourceId: graphSp.id, scope });
          L.done(i, `${scope.split(" ").length} scopes`); i++;
        }
        L.start(i);
        if (S.own) { R.saved = true; R.connName = S.owner.name || "this registration"; L.skip(i, "already the registration this copy signs in with"); }
        else {
          R.connName = `${S.tenantName || S.tenantId} — own registration`;
          const saved = EncaConn.save({ name: R.connName, clientId: app.appId, tenant: S.tenantId });
          if (saved.ok) { R.saved = true; R.connId = saved.rec.id; L.done(i, "selected"); } else L.fail(i, saved.error);
        }
        R.ok = true;
      }
      L.finish();
    } catch (e) {
      console.error("onboard:", e);
      fail((e && e.message) || String(e));
    }
    const led = $("obLedger");
    R.ledgerHtml = led ? led.innerHTML : "";
    result = R; busy = false; step = 4; render();
  }
  // ☁ the deployment: the container app's two variables, with the person's
  // own ARM rights — the same GET-template-then-PATCH-whole path Branding
  // settings uses, because a PATCH of a bare env list drops the image.
  async function setOnAca() {
    const btn = $("obAca"), out = $("obAcaOut"); if (!btn || !result || !result.appId) return;
    const say = (m) => { if (out) out.textContent = m; };
    try {
      btn.disabled = true; say("Asking for Azure access…");
      await Graph.ensureScopes(Graph.ARM_SCOPES);
      say("Finding this container app…");
      const host = (location.hostname || "").toLowerCase();
      const q = { query: "resources | where type =~ 'microsoft.app/containerapps' | where tostring(properties.configuration.ingress.fqdn) =~ '" + host.replace(/'/g, "") + "' | project id, name, resourceGroup, subscriptionId | limit 2" };
      const found = await Graph.apost("/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01", q);
      const rows = (found && found.data) || [];
      if (rows.length !== 1) throw new Error(rows.length ? `More than one container app claims ${host} — set the variables in the portal.` : `No container app in your subscriptions has the ingress hostname ${host} — your account may not see its subscription. Use the copy buttons and set ENCA_CLIENT_ID and ENCA_TENANT_ID in the portal.`);
      const id = rows[0].id;
      say("Reading the current settings…");
      const app = await Graph.aget(id + "?api-version=2024-03-01");
      const tpl = (app.properties && app.properties.template) || {};
      const containers = (tpl.containers || []).map((c) => Object.assign({}, c));
      if (!containers.length) throw new Error("This container app has no container defined.");
      containers[0].env = acaEnv(containers[0].env, result.appId, S.tenantId);
      say("Saving…");
      await Graph.apatch(id + "?api-version=2024-03-01", { properties: { template: Object.assign({}, tpl, { containers }) } });
      btn.textContent = "Set on the container app";
      say(`Saved on ${rows[0].name} (${rows[0].resourceGroup}). Azure is rolling a new revision; every visitor then signs in with ${form.name}. Give it a minute, then reload in a private window.`);
      const row = $("obAcaRow"); if (row) row.classList.add("ok");
    } catch (e) { btn.disabled = false; say("Could not set it: " + ((e && e.message) || String(e))); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  return { SCOPES, ROLES, NEED, NEED_ASSIGN, defaultName, validateName, appBody, plan, acaEnv, localJs, dockerLines, templateParams, roleNames, eligibleRoles, afterSignIn, open, close, pending, paintBand, updateBody, state: () => S, _setState: (s) => { S = { ...S, ...s }; } };
})();
