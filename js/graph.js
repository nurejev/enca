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

  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error("Read stopped"), { stopped: true })); return; }
    let timer;
    const abort = () => { clearTimeout(timer); reject(Object.assign(new Error("Read stopped"), { stopped: true })); };
    timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });

  // Every Graph call goes through here, so two cross-cutting concerns live in
  // one place: the claims-challenge step-up, and 429 throttling.
  //
  // Graph rate-limits a burst of writes (a tenant-wide assign is 100+ PATCHes)
  // and answers 429 with a Retry-After header saying how many seconds to wait.
  // Honour it and retry rather than failing the policy — otherwise a big run
  // dies the moment the tenant's quota is hit, as it did here. Retry-After is
  // authoritative; when absent we back off exponentially. 503/504 (transient
  // gateway) get the same treatment.
  async function readFetch(url, options) {
    if (options.method && options.method !== "GET" || typeof AbortController === "undefined") return fetch(url, options);
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort();
    if (options.signal?.aborted) throw stoppedError();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      // Keep the attempt deadline through the body download, not only headers.
      if (typeof Response !== "undefined" && response.arrayBuffer) {
        const bytes = await response.arrayBuffer();
        return new Response(response.status === 204 ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      return response;
    } catch (e) {
      if (timedOut) throw new Error("Microsoft did not finish this request within two minutes. Retry or narrow the scope; the read is incomplete.");
      if (options.signal?.aborted) throw stoppedError();
      throw e;
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }

  const MAX_RETRIES = 5;
  async function graphFetch(url, opts, scopes) {
    const full = safeGraphUrl(url);
    const send = (t) => readFetch(full, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    let r = await send(await token(scopes));

    // claims challenge — one step-up, as before
    const claims = claimsChallenge(r);
    if (claims) {
      const res = await msalApp.acquireTokenPopup({ scopes: scopes || AUTH_CONFIG.scopes, account, claims });
      r = await send(res.accessToken);
    }

    // throttling — wait out Retry-After and retry. 502 joined the list in
    // 25326: Graph's edge answered a sign-in page read with nginx's "502 Bad
    // Gateway" HTML wrapped in a JSON error, once, mid-window — transient by
    // definition, and a whole 30-day read died on it.
    // A gateway failure may arrive after a write was committed. Retrying a
    // create could duplicate it; only reads retry ambiguous 5xx responses.
    const isRead = !opts.method || ["GET", "HEAD"].includes(opts.method.toUpperCase());
    for (let attempt = 0; (r.status === 429 || (isRead && [502, 503, 504].includes(r.status))) && attempt < MAX_RETRIES; attempt++) {
      const ra = parseInt(r.headers.get("Retry-After"), 10);
      const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(2 ** attempt * 1000, 20000);
      onThrottle(waitMs, attempt + 1);
      await sleep(waitMs + 250, opts.signal);   // stop remains responsive during server backoff
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
  let policyGuard = null;
  const setPolicyGuard = fn => { policyGuard = fn; };
  const guardPolicy = async (url, body, method) => { if (policyGuard && /\/identity\/conditionalAccess\/(?:policies(?:\/[^/?]+)?|deletedItems\/policies\/[^/?]+\/restore)$/.test(url.split("?")[0])) await policyGuard(url, body, method); };
  async function gpatch(url, body, scopes) {
    await guardPolicy(url, body, "PATCH");
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
    // A gateway error page — nginx's "502 Bad Gateway" with its MSIE padding
    // comments — arrives as e.message inside a JSON error. Nobody needs the
    // HTML; say what it was and that it is Microsoft's edge, not the tenant.
    const GATEWAY = { 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };
    const gatewayText = (status, html) => {
      const t = /<title>\s*([^<]*?)\s*<\/title>/i.exec(String(html || ""));
      return `Microsoft's gateway answered with an error page instead of data — ${(t && t[1]) || `${status} ${GATEWAY[status] || ""}`.trim()}. That is the Graph edge, not this tenant or this account: transient, retried ${MAX_RETRIES} times over about a minute before giving up. Run it again.`;
    };
    try {
      const e = (await r.json()).error || {};
      if (/<html|<title>|<body|<\/h1>/i.test(String(e.message || ""))) e.message = gatewayText(r.status, e.message);
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
    } catch {
      // no JSON body — a bare gateway page, or nothing at all
      if (GATEWAY[r.status]) msg += ": " + gatewayText(r.status, "");
    }
    return Object.assign(new Error(msg), { status: r.status });
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
    const full = url.startsWith("http") ? url : /^\/(v1\.0|beta)\//.test(url) ? "https://graph.microsoft.com" + url : AUTH_CONFIG.graphBase + url;
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
  //
  // `init` carries a method and body for the two callers that write. Everything
  // in ENCA reads; the ONE exception is a self-hosted instance saving its own
  // branding onto its own container app, which is the user changing a resource
  // they own, with their own rights, in their own subscription. It goes through
  // this same host guard and the same retry discipline as every read.
  async function armFetch(url, init) {
    const full = safeArmUrl(url);
    const send = (t) => fetch(full, {
      method: (init && init.method) || "GET",
      headers: Object.assign(
        { Authorization: "Bearer " + t, Accept: "application/json" },
        init && init.body ? { "Content-Type": "application/json" } : {}),
      body: init && init.body ? JSON.stringify(init.body) : undefined,
    });
    let r = await send(await token(ARM_SCOPES));
    // A gateway failure may arrive after a write was committed. Retrying a
    // create could duplicate it; only reads retry ambiguous 5xx responses.
    const isRead = !init?.method || ["GET", "HEAD"].includes(init.method.toUpperCase());
    for (let attempt = 0; (r.status === 429 || (isRead && [502, 503, 504].includes(r.status))) && attempt < MAX_RETRIES; attempt++) {
      const ra = parseInt(r.headers.get("Retry-After"), 10);
      const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(2 ** attempt * 1000, 20000);
      onThrottle(waitMs, attempt + 1);
      await sleep(waitMs + 250);
      r = await send(await token(ARM_SCOPES));
    }
    return r;
  }

  async function aget(url) { return armSend(url); }

  // POST is a read in one important case: Azure Resource Graph answers queries
  // over every subscription the signed-in user can see, and it is a POST.
  async function apost(url, body) { return armSend(url, { method: "POST", body }); }

  // The only write. ARM answers a container-app PATCH with 200 or 202; a 202
  // means the revision is still rolling, which the caller has to say rather
  // than reporting a change that has not landed yet.
  async function apatch(url, body) { return armSend(url, { method: "PATCH", body }); }

  async function armSend(url, init) {
    const r = await armFetch(url, init);
    if (!r.ok) {
      let msg = `Azure request failed (${r.status})`;
      // ARM's own message names the missing permission or the bad field, and
      // it is far more useful than a status code — a 403 here almost always
      // means "you can read this resource but not change it", which the
      // person can act on only if they are told.
      try { const e = (await r.json()).error || {}; if (e.message) msg += ": " + e.message; } catch { /* no body */ }
      throw new Error(msg);
    }
    if (r.status === 204) return null;
    return r.status === 202 ? { accepted: true } : r.json().catch(() => null);
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
  // opts.base: an absolute Graph base for the batch endpoint — the inner
  // relative URLs resolve against the version the batch was posted to, so a
  // batch to v1.0 reads v1.0 resources. Needed for disableNesting, which only
  // v1.0 returns on some tenants (see NEST_V1 in js/cagroups.js).
  async function gbatch(requests, onProgress, opts = {}) {
    const out = {}, all = requests || [];
    // Validate the whole batch before sending any policy mutation.
    for (const r of all) if (["POST", "PATCH"].includes((r.method || "GET").toUpperCase())) await guardPolicy(r.url, r.body, r.method.toUpperCase());
    const endpoint = opts.base ? `${opts.base}/$batch` : "/$batch";
    const limit = Math.max(0, Math.min(5, opts.maxRetries ?? 3));
    const stopped = () => opts.signal?.aborted || opts.shouldStop?.();
    let done = 0;
    for (const part of chunk(all, 20)) {
      let pending = part;
      for (let attempt = 0; pending.length; attempt++) {
        if (stopped()) { pending.forEach(r => out[r.id] = { error: "Batch cancelled", code: "cancelled" }); break; }
        let j;
        try {
          j = await gpost(endpoint, { requests: pending.map(r => ({
            id: String(r.id), method: r.method || "GET", url: r.url,
            headers: { ConsistencyLevel: "eventual", ...(r.body ? { "Content-Type": "application/json" } : {}), ...(r.headers || {}) },
            ...(r.body ? { body: r.body } : {}),
          })) }, opts.scopes);
        } catch (e) { pending.forEach(r => out[r.id] = { error: e.message || String(e) }); break; }
        const byId = new Map((j.responses || []).map(r => [String(r.id), r]));
        const again = []; let waitMs = 0;
        for (const req of pending) {
          const r = byId.get(String(req.id));
          if (r && r.status >= 200 && r.status < 300) { out[req.id] = { body: r.body }; continue; }
          // Retrying an ambiguous write can duplicate it; only reads and throttled
          // (not executed) requests are eligible for automatic retry.
          const transient = r && (r.status === 429 || ([502,503,504].includes(r.status) && (!req.method || req.method === "GET")));
          if (transient && attempt < limit) {
            again.push(req);
            const raw = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
            const seconds = Number(raw);
            const delay = raw && !Number.isFinite(seconds) ? Date.parse(raw) - Date.now() : (raw == null ? 5 : seconds) * 1000;
            waitMs = Math.max(waitMs, Math.max(0, Number.isFinite(delay) ? delay : 5000));
          } else out[req.id] = { error: r?.body?.error?.message || (r ? `HTTP ${r.status}; retry limit reached` : "Batch response missing"), code: r?.body?.error?.code || "", status: r?.status };
        }
        pending = again;
        if (pending.length) {
          onThrottle(waitMs, attempt + 1);
          // Small waits make cancellation responsive even with Retry-After.
          for (let remaining = waitMs; remaining > 0 && !stopped(); remaining -= 250) await sleep(Math.min(250, remaining));
        }
      }
      done += part.length; onProgress?.(done, all.length);
    }
    return out;
  }

  // Reads used to throw a bare "Graph request failed (403)", which tells the
  // person nothing they can act on — Graph's own body says whether it is a
  // missing scope, a missing directory role or a malformed query. Surface it.
  const readContext = () => `${account?.homeAccountId || ""}:${account?.tenantId || ""}`;
  const stoppedError = () => Object.assign(new Error("Read stopped; results are incomplete"), { stopped: true });
  // Shared concurrency budget for all directory reads. Queued reads can be stopped.
  let activeReads = 0;
  const readQueue = [];
  async function withReadSlot(fn, signal) {
    if (signal?.aborted) throw stoppedError();
    await new Promise((resolve, reject) => {
      const entry = { resolve, cleanup: () => signal?.removeEventListener("abort", abort) };
      const abort = () => { const i = readQueue.indexOf(entry); if (i >= 0) { readQueue.splice(i, 1); entry.cleanup(); reject(stoppedError()); } };
      signal?.addEventListener("abort", abort, { once: true });
      readQueue.push(entry); drainReads();
    });
    try { if (signal?.aborted) throw stoppedError(); return await fn(); }
    finally { activeReads--; drainReads(); }
  }
  function drainReads() { while (activeReads < 4 && readQueue.length) { activeReads++; const entry = readQueue.shift(); entry.cleanup(); entry.resolve(); } }
  async function mapLimit(items, limit, fn) {
    const result = new Array(items.length); let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      for (;;) { const i = cursor++; if (i >= items.length) return; result[i] = await fn(items[i], i); }
    }));
    return result;
  }
  const pendingReads = new Map();
  async function gget(url, scopes, options = {}) {
    const context = readContext();
    const key = JSON.stringify([context, url, scopes || AUTH_CONFIG.scopes]);
    if (!options.signal && pendingReads.has(key)) return pendingReads.get(key);
    const run = withReadSlot(async () => {
      const r = await graphFetch(url, { headers: { ConsistencyLevel: "eventual" }, signal: options.signal }, scopes);
      if (context !== readContext()) throw new Error("Read discarded: signed-in account changed");
      if (!r.ok) throw await graphError(r);
      return r.json();
    }, options.signal);
    if (!options.signal) pendingReads.set(key, run);
    try { return await run; }
    finally { if (pendingReads.get(key) === run) pendingReads.delete(key); }
  }

  // Completeness is explicit, independent of whether the final page has a nextLink.
  async function readPages(url, opts = {}) {
    const cap = Number.isFinite(opts.cap) && opts.cap > 0 ? opts.cap : Infinity;
    const items = [], seen = new Set(); let next = url, pages = 0, observed = 0;
    const state = () => ({ items, complete: !next && observed <= cap, capped: !!next || observed > cap,
      nextLink: next, pages, observed, count: items.length, readAt: Date.now() });
    try {
      while (next && items.length < cap) {
        if (opts.signal?.aborted || opts.shouldStop?.()) throw stoppedError();
        if (seen.has(next)) throw new Error("Repeated pagination link; read is incomplete");
        seen.add(next);
        const j = await gget(next, opts.scopes, { signal: opts.signal });
        if (opts.signal?.aborted || opts.shouldStop?.()) throw stoppedError();
        const page = j.value;
        if (!Array.isArray(page)) throw new Error("Expected a collection page; read is incomplete");
        observed += page.length; pages++;
        for (const row of page) { if (items.length < cap) items.push(row); }
        next = j["@odata.nextLink"] || null;
        await opts.onPage?.(items, state());
      }
      return state();
    } catch (e) { e.partial = { ...state(), complete: false }; throw e; }
  }
  async function ggetAll(url, capOrOptions) {
    // Older callers passed a scopes array as argument two. Preserve it explicitly.
    const opts = Array.isArray(capOrOptions) ? { scopes: capOrOptions }
      : typeof capOrOptions === "object" ? (capOrOptions || {}) : { cap: capOrOptions };
    const result = await readPages(url, opts);
    Object.defineProperty(result.items, "readState", { value: { ...result, items: undefined } });
    return result.items;
  }

  async function gpost(url, body, scopes) {
    await guardPolicy(url, body, "POST");
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

    // Order: the caller's label map (All / Office365 …), the tenant's own
    // display name, then the first-party fallback map for an id with no
    // service principal here, then the id itself.
    const firstParty = (id) => (typeof firstPartyAppName === "function" ? firstPartyAppName(id) : null);
    return (id, fallbackMap) => (fallbackMap && fallbackMap[id]) || names[id] || firstParty(id) || id;
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

  // Connection metadata is informational: silent token only, no extra consent.
  async function connectionInfo() {
    const clientId=AUTH_CONFIG.clientId;
    try {
      if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error('Invalid client ID');
      const result=await msalApp.acquireTokenSilent({scopes:AUTH_CONFIG.scopes,account});
      const response=await fetch(safeGraphUrl(`/servicePrincipals(appId='${clientId}')?$select=displayName,appOwnerOrganizationId,signInAudience`),{
        headers:{Authorization:'Bearer '+result.accessToken},signal:AbortSignal.timeout(10000)
      });
      if(!response.ok)throw new Error('Registration unavailable');
      const sp=await response.json();
      return {clientId,name:sp.displayName,ownerTenantId:sp.appOwnerOrganizationId,audience:sp.signInAudience};
    } catch { return {clientId,name:'',ownerTenantId:null,audience:null}; }
  }

  return { connectionInfo, init, signIn, signInRedirect, authMode, setAuthMode, takeRedirectError, signOut, loadTenant, gget, ggetAll, readPages, mapLimit, gpost, gpatch, gdelete, gpostGroupCreate, gbatch, aget, agetAll, apost, apatch, ARM_SCOPES, existingAppIds, createServicePrincipal, serviceProviderPartners, grantedScopes, requestConsent, hasScopes, ensureScopes, isPopupBlocked, setThrottleHandler, setPolicyGuard, get account() { return account; } };
})();
