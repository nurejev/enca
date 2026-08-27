// ======================================================================
// Graph data layer: MSAL sign-in, policy fetch, GUID resolution.
// ======================================================================
const Graph = (() => {
  let msalApp = null, account = null;

  // Popup or redirect. Popup is the default and is nicer — the page keeps its
  // state. But Edge's automatic work-profile switching can decide the sign-in
  // belongs to a different profile and reopen the popup in THAT profile's
  // window, which severs window.opener: the popup then has no way to hand the
  // response back, and Entra just re-prompts. Forever.
  //
  // A redirect navigates this tab instead, so there is no opener to lose. It
  // is the reliable route on a machine with an Edge work profile, and the
  // choice sticks once made.
  const AUTH_MODE_KEY = "enca-auth-mode";
  const authMode = () => { try { return localStorage.getItem(AUTH_MODE_KEY) || "popup"; } catch { return "popup"; } };
  const setAuthMode = (m) => { try { m === "popup" ? localStorage.removeItem(AUTH_MODE_KEY) : localStorage.setItem(AUTH_MODE_KEY, m); } catch { /* private mode */ } };

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
    // initialize() alone does not finish a redirect sign-in; handleRedirectPromise
    // does. Resolves to true when we came back from one and are now signed in,
    // so the caller can go straight on to loading the tenant.
    return msalApp.initialize()
      .then(() => msalApp.handleRedirectPromise())
      .then((res) => {
        if (res && res.account) {
          account = res.account;
          if (res.accessToken) noteScopes(res.accessToken);
          return true;
        }
        return false;
      })
      .catch((e) => { console.error("Redirect sign-in did not complete:", e); redirectError = e; return false; });
  }

  // Kept so the app can report a redirect failure the same way it reports a
  // popup one — a redirect error arrives on page load, not from a click.
  let redirectError = null;
  const takeRedirectError = () => { const e = redirectError; redirectError = null; return e; };

  function signInRedirect() {
    setAuthMode("redirect");
    return msalApp.loginRedirect({ scopes: AUTH_CONFIG.scopes, prompt: "select_account" });
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

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Every Graph call goes through here, so two cross-cutting concerns live in
  // one place: the claims-challenge step-up, and 429 throttling.
  //
  // Graph rate-limits a burst of writes (a tenant-wide assign is 100+ PATCHes)
  // and answers 429 with a Retry-After header saying how many seconds to wait.
  // Honour it and retry rather than failing the policy — otherwise a big run
  // dies the moment the tenant's quota is hit, as it did here. Retry-After is
  // authoritative; when absent we back off exponentially. 503/504 (transient
  // gateway) get the same treatment.
  const MAX_RETRIES = 5;
  async function graphFetch(url, opts, scopes) {
    const full = safeGraphUrl(url);
    const send = (t) => fetch(full, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    let r = await send(await token(scopes));

    // claims challenge — one step-up, as before
    const claims = claimsChallenge(r);
    if (claims) {
      const res = await msalApp.acquireTokenPopup({ scopes: scopes || AUTH_CONFIG.scopes, account, claims });
      r = await send(res.accessToken);
    }

    // throttling — wait out Retry-After and retry
    for (let attempt = 0; (r.status === 429 || r.status === 503 || r.status === 504) && attempt < MAX_RETRIES; attempt++) {
      const ra = parseInt(r.headers.get("Retry-After"), 10);
      const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(2 ** attempt * 1000, 20000);
      onThrottle(waitMs, attempt + 1);
      await sleep(waitMs + 250);   // small cushion over the stated window
      r = await send(await token(scopes));
    }
    return r;
  }

  // The UI can subscribe to throttle waits to keep the user informed instead of
  // looking frozen during a long back-off.
  let throttleCb = null;
  const onThrottle = (ms, attempt) => { try { throttleCb && throttleCb(ms, attempt); } catch { /* ignore */ } };
  const setThrottleHandler = (fn) => { throttleCb = fn; };

  // Write scope — requested on demand (incremental consent) only for the
  // Assign-groups tool; every other tool stays read-only.
  const WRITE_SCOPES = ["Policy.ReadWrite.ConditionalAccess"];

  // scopes optional — defaults to the CA write scope; pass Group.ReadWrite.All
  // etc. when patching a different resource (e.g. renaming a group).
  async function gpatch(url, body, scopes) {
    scopes = scopes || [...AUTH_CONFIG.scopes, ...WRITE_SCOPES];
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

  // ---- Azure Resource Manager ---------------------------------------------
  // Azure RBAC does not live in Graph. It is a different resource, with a
  // different audience, so it needs its own token — a Graph token sent to ARM
  // is rejected, and (more to the point) an ARM token must never be sent to
  // Graph. Hence a second host guard rather than a relaxed one.
  //
  // Consent is separate too: management.azure.com/user_impersonation is asked
  // for only when a tool actually reaches into Azure (User or Group analyzer).
  const ARM_BASE = "https://management.azure.com";
  const ARM_SCOPES = ["https://management.azure.com/user_impersonation"];

  function safeArmUrl(url) {
    const full = url.startsWith("http") ? url : ARM_BASE + url;
    if (new URL(full).hostname !== "management.azure.com") throw new Error("Blocked non-ARM URL");
    return full;
  }

  // Same 429 discipline as graphFetch — ARM throttles per subscription and
  // answers with Retry-After just as Graph does.
  async function armFetch(url) {
    const full = safeArmUrl(url);
    const send = (t) => fetch(full, { headers: { Authorization: "Bearer " + t, Accept: "application/json" } });
    let r = await send(await token(ARM_SCOPES));
    for (let attempt = 0; (r.status === 429 || r.status === 503 || r.status === 504) && attempt < MAX_RETRIES; attempt++) {
      const ra = parseInt(r.headers.get("Retry-After"), 10);
      const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(2 ** attempt * 1000, 20000);
      onThrottle(waitMs, attempt + 1);
      await sleep(waitMs + 250);
      r = await send(await token(ARM_SCOPES));
    }
    return r;
  }

  async function aget(url) {
    const r = await armFetch(url);
    if (!r.ok) {
      let msg = `Azure request failed (${r.status})`;
      try { const e = (await r.json()).error || {}; if (e.message) msg += ": " + e.message; } catch { /* no body */ }
      throw new Error(msg);
    }
    return r.json();
  }

  // ARM pages with nextLink (absolute URL), same idea as Graph's @odata.nextLink.
  async function agetAll(url) {
    let out = [], next = url;
    while (next) {
      const j = await aget(next);
      out = out.concat(j.value || []);
      next = j.nextLink || j["nextLink"] || null;
    }
    return out;
  }

  // ---- JSON batching -------------------------------------------------------
  // Some questions are per-object by nature ("which groups is THIS group a
  // member of"), and a tenant-wide sweep asks them hundreds of times. Graph's
  // $batch answers up to 20 in one round trip, which is the difference between
  // a sweep that finishes and one that times out.
  //
  // Returns { [id]: { body } | { error } } — one entry per request, never
  // throws for an individual failure, so one bad object cannot sink the run.
  async function gbatch(requests, onProgress) {
    const out = {};
    const parts = chunk(requests || [], 20);
    let done = 0;
    for (const part of parts) {
      const body = {
        requests: part.map((r) => ({
          id: String(r.id), method: r.method || "GET", url: r.url,
          headers: { ConsistencyLevel: "eventual" },
        })),
      };
      let j = null;
      try { j = await gpost("/$batch", body); }
      catch (e) { part.forEach((r) => out[r.id] = { error: e.message || String(e) }); done += part.length; onProgress?.(done, requests.length); continue; }

      // Individual 429s inside a batch carry their own Retry-After; retry those
      // ids once rather than failing them.
      const retry = [];
      for (const resp of (j.responses || [])) {
        if (resp.status >= 200 && resp.status < 300) out[resp.id] = { body: resp.body };
        else if (resp.status === 429 || resp.status === 503) retry.push(resp);
        else out[resp.id] = { error: (resp.body && resp.body.error && resp.body.error.message) || `HTTP ${resp.status}`,
          code: (resp.body && resp.body.error && resp.body.error.code) || "", status: resp.status };
      }
      if (retry.length) {
        const waitMs = Math.max(...retry.map((r) => parseInt((r.headers || {})["Retry-After"], 10) || 5)) * 1000;
        onThrottle(waitMs, 1);
        await sleep(waitMs + 250);
        const again = part.filter((r) => retry.some((x) => x.id === String(r.id)));
        const res2 = await gbatch(again);
        Object.assign(out, res2);
      }
      done += part.length;
      onProgress?.(done, requests.length);
    }
    return out;
  }

  // Reads used to throw a bare "Graph request failed (403)", which tells the
  // person nothing they can act on — Graph's own body says whether it is a
  // missing scope, a missing directory role or a malformed query. Surface it.
  async function gget(url, scopes) {
    const r = await graphFetch(url, { headers: { ConsistencyLevel: "eventual" } }, scopes);
    if (!r.ok) throw await graphError(r);
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
  // Strip the resource prefix off a scope so "https://graph.microsoft.com/
  // Policy.Read.All" and "Policy.Read.All" compare equal — and so ARM's
  // "https://management.azure.com/user_impersonation" matches the bare
  // "user_impersonation" that comes back in that token's scp claim.
  const scopeName = (s) => String(s).replace(/^https?:\/\/[^/]+\//i, "").toLowerCase();
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

  // ---- cross-tenant access: which partners are service providers? --------
  // A CSP / delegated-administration partner appears here with
  // isServiceProvider true, and inboundTrust records whether this tenant
  // accepts MFA and device claims from theirs. Both drive the MS Learn
  // service provider checks. Read-only, Policy.Read.All, beta endpoint —
  // isServiceProvider is not on the v1.0 resource.
  // Returns { ok: true, list: [...] } or { ok: false, error } — the caller
  // must be able to tell "no partners" from "could not look".
  async function serviceProviderPartners() {
    try {
      const rows = await ggetAll("/policies/crossTenantAccessPolicy/partners");
      const list = rows.filter((r) => r.isServiceProvider === true).map((r) => ({
        tenantId: r.tenantId,
        name: r.identitySynchronization?.displayName || r.displayName || r.tenantId,
        inboundTrust: r.inboundTrust || null,
      }));
      return { ok: true, list };
    } catch (e) {
      return { ok: false, error: e.message || String(e), list: [] };
    }
  }

  return { init, signIn, signInRedirect, authMode, setAuthMode, takeRedirectError, signOut, loadTenant, gget, ggetAll, gpost, gpatch, gdelete, gpostGroupCreate, gbatch, aget, agetAll, ARM_SCOPES, existingAppIds, createServicePrincipal, serviceProviderPartners, grantedScopes, requestConsent, hasScopes, ensureScopes, isPopupBlocked, setThrottleHandler, get account() { return account; } };
})();
