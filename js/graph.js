// ======================================================================
// Graph data layer: MSAL sign-in, policy fetch, GUID resolution.
// ======================================================================
const Graph = (() => {
  let msalApp = null, account = null;

  function init() {
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: AUTH_CONFIG.clientId,
        authority: AUTH_CONFIG.authority,
        redirectUri: window.location.origin + window.location.pathname,
        // "cp1" tells Entra this client can handle a claims challenge. Without
        // it Graph refuses protected actions outright — writing a Conditional
        // Access policy in a tenant that protects CA administration comes back
        // as 403 "Operation requires conditional access and client does not
        // support it" with no way to satisfy it. With cp1 declared, Graph
        // instead returns 401 + a claims challenge we can step up against.
        clientCapabilities: ["cp1"],
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    return msalApp.initialize();
  }

  async function signIn() {
    const res = await msalApp.loginPopup({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" });
    account = res.account;
    return account;
  }

  function signOut() {
    const acc = account;
    account = null;
    return msalApp.logoutPopup({ account: acc }).catch(() => {});
  }

  async function token(scopes) {
    scopes = scopes || AUTH_CONFIG.scopes;
    try {
      const r = await msalApp.acquireTokenSilent({ scopes, account });
      noteScopes(r.accessToken);
      return r.accessToken;
    } catch {
      const r = await msalApp.acquireTokenPopup({ scopes, account });
      noteScopes(r.accessToken);
      return r.accessToken;
    }
  }

  // ---- claims challenges (Conditional Access on the CA API itself) ----------
  // A tenant can protect Conditional Access administration with an auth context
  // ("protected actions"). Graph then rejects the write and names the auth
  // context it wants in a WWW-Authenticate header. The fix is not more
  // permission — it is a fresh token carrying the requested claims, which means
  // sending the user through an interactive step-up.
  function claimsChallenge(r) {
    // CORS: Graph lists WWW-Authenticate in Access-Control-Expose-Headers, so
    // this is readable from the browser. If it ever is not, we fall through to
    // the plain error rather than guessing.
    const h = (r.headers && r.headers.get("WWW-Authenticate")) || "";
    if (!/insufficient_claims/i.test(h)) return null;
    const m = /claims="([^"]+)"/i.exec(h);
    if (!m) return null;
    try { return atob(m[1]); } catch { return null; }
  }

  // Every Graph call goes through here so the step-up is handled once, in one
  // place, instead of per verb. Exactly one retry: if the token minted against
  // the challenge is still refused, retrying again would just loop the popup.
  async function graphFetch(url, opts, scopes) {
    const full = safeGraphUrl(url);
    const send = (t) => fetch(full, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    let r = await send(await token(scopes));
    const claims = claimsChallenge(r);
    if (claims) {
      const res = await msalApp.acquireTokenPopup({ scopes: scopes || AUTH_CONFIG.scopes, account, claims });
      r = await send(res.accessToken);
    }
    return r;
  }

  // Write scope — requested on demand (incremental consent) only for the
  // Assign-groups tool; every other tool stays read-only.
  const WRITE_SCOPES = ["Policy.ReadWrite.ConditionalAccess"];

  async function gpatch(url, body) {
    const scopes = [...AUTH_CONFIG.scopes, ...WRITE_SCOPES];
    const r = await graphFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, scopes);
    if (!r.ok) throw await graphError(r);
    return r.status === 204 ? null : r.json();
  }

  // Graph's top-level 400 text is generic; the useful part is usually in
  // error.code, error.details[] or innerError. Surface all of it, otherwise a
  // failed write is undiagnosable.
  async function graphError(r) {
    let msg = `Graph request failed (${r.status})`;
    try {
      const e = (await r.json()).error || {};
      const bits = [e.message, e.code && `code: ${e.code}`,
        (e.details || []).map((d) => d.message || d.code).filter(Boolean).join("; "),
        e.innerError && (e.innerError.code || e.innerError["request-id"]) &&
          `inner: ${(e.innerError.code || "")} ${(e.innerError["request-id"] || "")}`.trim(),
      ].filter(Boolean);
      if (bits.length) msg += ": " + bits.join(" · ");
      // Protected actions: if we get here the step-up did not happen, either
      // because the tenant sent no readable challenge or because the token
      // minted against it still did not satisfy the auth context. Neither is
      // fixed by granting more permission, so say what actually helps.
      if (/does not support it|insufficient_claims/i.test(e.message || "")) {
        msg += " — Conditional Access administration is a protected action in this tenant. "
          + "Sign in again so the step-up prompt can run, make sure your session satisfies the "
          + "auth context (e.g. phishing-resistant MFA), or temporarily remove the policy "
          + "requirement on the Conditional Access create/update/delete actions.";
      }
    } catch { /* no JSON body */ }
    return new Error(msg);
  }

  // Which of these appIds actually have a service principal in this tenant?
  // A CA policy cannot reference an app that does not exist — Graph rejects the
  // whole create with a generic 400, naming nothing.
  async function existingAppIds(ids) {
    const out = new Set();
    const list = [...new Set((ids || []).map((i) => String(i).toLowerCase()).filter(isGuid))];
    for (const part of chunk(list, 15)) {
      try {
        const flt = part.map((i) => `'${i}'`).join(",");
        const sps = await ggetAll(`/servicePrincipals?$filter=appId in (${flt})&$select=appId`);
        sps.forEach((sp) => out.add(String(sp.appId).toLowerCase()));
      } catch (e) { console.warn("Service principal lookup failed:", e.message); }
    }
    return out;
  }

  // never attach the access token to anything but Microsoft Graph
  function safeGraphUrl(url) {
    const full = url.startsWith("http") ? url : AUTH_CONFIG.graphBase + url;
    if (new URL(full).hostname !== "graph.microsoft.com") throw new Error("Blocked non-Graph URL");
    return full;
  }

  async function gget(url, scopes) {
    const r = await graphFetch(url, { headers: { ConsistencyLevel: "eventual" } }, scopes);
    if (!r.ok) throw new Error(`Graph request failed (${r.status})`);
    return r.json();
  }

  async function ggetAll(url) {
    let out = [], next = url;
    while (next) {
      const j = await gget(next);
      out = out.concat(j.value || []);
      next = j["@odata.nextLink"] || null;
    }
    return out;
  }

  async function gpost(url, body, scopes) {
    const r = await graphFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, scopes);
    if (!r.ok) throw await graphError(r);
    return r.status === 204 ? null : r.json();
  }

  // DELETE — only ever used by an explicitly confirmed write action.
  async function gdelete(url, scopes) {
    const r = await graphFetch(url, { method: "DELETE" }, scopes);
    if (!r.ok && r.status !== 404) throw await graphError(r);
    return true;
  }

  // Instantiating a Microsoft first-party app in the tenant. A CA policy can
  // only reference an app that has a service principal here; for Microsoft's
  // own apps the fix is to create one from the well-known appId — no consent
  // is granted by doing so, it just materialises the object.
  const APP_WRITE_SCOPES = ["Application.ReadWrite.All"];
  async function createServicePrincipal(appId) {
    const sp = await gpost("/servicePrincipals", { appId }, [...AUTH_CONFIG.scopes, ...APP_WRITE_SCOPES]);
    return { id: sp.id, appId: sp.appId, displayName: sp.displayName };
  }

  // Scopes needed only to CREATE role-assignable groups (requested on demand;
  // requires the Privileged Role Administrator role or Global Administrator).
  const GROUP_CREATE_SCOPES = ["Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"];
  function gpostGroupCreate(url, body) {
    return gpost(url, body, [...AUTH_CONFIG.scopes, ...GROUP_CREATE_SCOPES]);
  }

  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  // ---------- resolve all GUIDs referenced by the policies into names ----------
  async function buildResolver(policies, onStatus) {
    const names = {}; // guid -> display name

    onStatus?.("Resolving directory roles…");
    try { (await ggetAll("/directoryRoleTemplates")).forEach(r => names[r.id] = r.displayName); } catch {}

    onStatus?.("Resolving named locations…");
    try { (await ggetAll("/identity/conditionalAccess/namedLocations")).forEach(l => names[l.id] = l.displayName); } catch {}

    onStatus?.("Resolving authentication contexts…");
    try { (await ggetAll("/identity/conditionalAccess/authenticationContextClassReferences")).forEach(c => names[c.id] = c.displayName); } catch {}

    try { (await ggetAll("/policies/authenticationStrengthPolicies")).forEach(s => names[s.id] = s.displayName); } catch {}

    // terms of use names (needs Agreement.Read.All; shown as GUID if not granted)
    try { (await ggetAll("/identityGovernance/termsOfUse/agreements")).forEach(a => names[a.id] = a.displayName); } catch {}

    // collect user/group/app/service-principal GUIDs from all policies
    const dirIds = new Set(), appIds = new Set();
    for (const p of policies) {
      const c = p.conditions || {};
      const u = c.users || {};
      [...(u.includeUsers || []), ...(u.excludeUsers || []),
       ...(u.includeGroups || []), ...(u.excludeGroups || [])].filter(isGuid).forEach(id => dirIds.add(id));
      const a = c.applications || {};
      [...(a.includeApplications || []), ...(a.excludeApplications || [])].filter(isGuid).forEach(id => appIds.add(id));
      const ca = c.clientApplications || {};
      [...(ca.includeServicePrincipals || []), ...(ca.excludeServicePrincipals || [])].filter(isGuid).forEach(id => dirIds.add(id));
      (p.grantControls?.termsOfUse || []).filter(isGuid).forEach(id => dirIds.add(id));
    }

    onStatus?.("Resolving users and groups…");
    for (const ids of chunk([...dirIds], 1000)) {
      try {
        const j = await gpost("/directoryObjects/getByIds", { ids, types: ["user", "group", "servicePrincipal"] });
        (j.value || []).forEach(o => names[o.id] = o.displayName);
      } catch {}
    }

    onStatus?.("Resolving applications…");
    for (const ids of chunk([...appIds], 15)) {
      try {
        const flt = ids.map(id => `'${id}'`).join(",");
        (await ggetAll(`/servicePrincipals?$filter=appId in (${flt})&$select=appId,displayName`))
          .forEach(sp => names[sp.appId] = sp.displayName);
      } catch {}
    }

    return (id, fallbackMap) => (fallbackMap && fallbackMap[id]) || names[id] || id;
  }

  async function loadTenant(onStatus) {
    onStatus?.("Fetching Conditional Access policies…");
    const policies = await ggetAll("/identity/conditionalAccess/policies");
    onStatus?.("Fetching organization info…");
    let org = null;
    try { org = (await gget("/organization"))?.value?.[0] || null; } catch {}
    // tenant branding logo (used in exports); fails silently if not set / no permission
    let logo = null;
    if (org?.id) {
      try {
        const t = await token();
        const r = await fetch(safeGraphUrl(`/organization/${org.id}/branding/localizations/default/bannerLogo`),
          { headers: { Authorization: "Bearer " + t } });
        if (r.ok) {
          const b = await r.blob();
          if (b.size > 0) logo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
        }
      } catch {}
    }
    const resolve = await buildResolver(policies, onStatus);
    return { policies, org, logo, resolve, account };
  }

  // ---- consent / popup handling -------------------------------------------
  // Browsers only allow window.open while a user gesture is still "active".
  // Safari and Edge close that window as soon as the call stack awaits
  // anything; Chrome is laxer. A consent popup raised in the middle of an
  // import therefore gets blocked, which is why consent is pulled forward to
  // the click that starts the run — see hasScopes/ensureScopes below.
  const granted = new Set();
  const scopeName = (s) => String(s).replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase();
  function noteScopes(accessToken) {
    try {
      const p = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      (p.scp || "").split(" ").filter(Boolean).forEach((s) => granted.add(scopeName(s)));
    } catch { /* opaque token — leave the cache alone */ }
  }
  // Synchronous: safe to call as the first statement of a click handler.
  const hasScopes = (scopes) => (scopes || []).every((s) => granted.has(scopeName(s)));

  function isPopupBlocked(e) {
    const c = (e && (e.errorCode || e.name)) || "";
    return /popup_window_error|empty_window_error|popup_blocked/i.test(c)
      || /popup.*(blocked|window)/i.test((e && e.message) || "");
  }

  // Interactive consent request for additional scopes (popup). Returns the
  // scp claim of the resulting token. Call this from inside a click handler.
  async function requestConsent(scopes) {
    const r = await msalApp.acquireTokenPopup({ scopes, account });
    noteScopes(r.accessToken);
    return (r.accessToken && [...granted]) || [];
  }

  // Make sure `scopes` are consented BEFORE a long write run starts. Returns
  // true if nothing was needed. Any popup happens here, at the top of the
  // gesture, rather than several awaits deep where it would be blocked.
  async function ensureScopes(scopes) {
    if (hasScopes(scopes)) return true;
    try {
      const r = await msalApp.acquireTokenSilent({ scopes, account });
      noteScopes(r.accessToken);
      if (hasScopes(scopes)) return true;
    } catch { /* falls through to interactive */ }
    const r = await msalApp.acquireTokenPopup({ scopes, account });
    noteScopes(r.accessToken);
    return true;
  }

  // Scopes actually granted in the current session (from the access token's scp
  // claim). Silent only — never triggers a prompt; returns [] when unavailable.
  async function grantedScopes() {
    try {
      const r = await msalApp.acquireTokenSilent({ scopes: AUTH_CONFIG.scopes, account });
      noteScopes(r.accessToken);
      const payload = JSON.parse(atob(r.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return (payload.scp || "").split(" ").filter(Boolean);
    } catch { return []; }
  }

  return { init, signIn, signOut, loadTenant, gget, ggetAll, gpost, gpatch, gdelete, gpostGroupCreate, existingAppIds, createServicePrincipal, grantedScopes, requestConsent, hasScopes, ensureScopes, isPopupBlocked, get account() { return account; } };
})();
