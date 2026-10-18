// ======================================================================
// CONNECTION — which app registration, and which tenant, this browser
// signs in with. Loaded AFTER js/authConfig.js and BEFORE js/graph.js.
//
// WHY THIS EXISTS. Until build 321 the only way to point ENCA at a
// different registration was to edit js/authConfig.js, or to serve a
// js/authConfig.local.js beside it (SINGLE-TENANT.md step 3). Both are
// deployment-time acts: they change the file every visitor is served. That
// is the right mechanism for an organisation standing up its own copy, and
// the wrong one for the two things people actually do daily —
//
//   * signing in to ANOTHER TENANT (a customer's directory, as a guest or
//     through delegated administration), which is only an `authority`
//     change and needs no new registration at all; and
//   * trying a registration you have just created, before committing
//     anything to a file, against a host somebody else serves.
//
// So the choice moves into the sign-in card, and into THIS BROWSER only.
// Nothing here is written to the site, to a server, or to any tenant.
//
// PRECEDENCE, highest first:
//   1. the connection selected here (localStorage, this browser profile)
//   2. window.ENCA_AUTH from js/authConfig.local.js  ─┐ both already merged
//   3. the defaults in js/authConfig.js              ─┘ into AUTH_CONFIG
//
// A deliberate act in the UI outranks a file, because the person doing it
// is looking at a card that names exactly what they are about to use. The
// "Default" entry is always present and always means "whatever this copy
// ships with" — so 2 and 3 are one keystroke away and can never be lost.
//
// SINCE BUILD 327 A LOGIN IS ALWAYS TWO VALUES. There is no shared,
// multi-tenant registration any more, so "change only the tenant" and "change
// only the client" have nothing left to fall back on: a connection names the
// Application (client) ID AND the tenant it lives in, and a shared endpoint
// (organizations / common / consumers) is refused here as it is in
// js/authConfig.js. A connection saved by an older build that lacks either
// half is kept in the list but NOT applied — the card says it needs editing,
// and nothing signs in with a registration the person did not name.
//
// WHAT IT WILL NOT TOUCH: `scopes` and `graphBase`. Those are what the app
// asks for and where it asks; a connection picker that could quietly widen
// the permission request would be a consent screen that lies. Only WHO is
// asking (clientId) and WHICH DIRECTORY is asked (authority) are settable.
//
// THE ONE THING THAT WILL BITE: the redirect URI. Whatever registration
// you name must carry THIS origin + path as a SPA redirect URI, or Entra
// refuses with AADSTS50011. The panel states the exact string to register,
// selectable, because a URI somebody has to retype is a URI somebody
// mistypes.
// ======================================================================
const EncaConn = (() => {
  const KEY = "enca-connections";
  const LOGIN_BASE = "https://login.microsoftonline.com/";
  const SHARED = /^(organizations|common|consumers)$/i;
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // A verified domain: at least one dot, no scheme, no path. Deliberately
  // permissive — Entra accepts any verified domain of the tenant, and this
  // code has no way to know which ones those are. It only rejects shapes
  // that cannot be a tenant at all.
  const DOMAIN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;

  // THE ROUTE INTO A TENANT THAT HAS NO REGISTRATION YET (327). A web page
  // cannot sign anybody in to a tenant without a registration that tenant can
  // reach, and there is no shared one any more — so the first write happens
  // where the administrator is already signed in with Microsoft's own tools:
  // Azure Cloud Shell, PowerShell, no storage account needed (an ephemeral
  // session keeps nothing once the window closes). The script is fetched from
  // THIS copy of ENCA and refused unless its SHA-256 is the one this build
  // shipped (tools/signin-single.test.cjs keeps PS_SHA256 in step with the
  // file), so what runs as an administrator is exactly the file you can read
  // here. It prints the two values ＋ Add takes.
  const PS_SHA256 = "3084EC5A66C8EFDFF43E694E83A630CB5CA2128C22A7597D41891840FBD1B557";
  const scriptUrl = () => window.location.origin + window.location.pathname.replace(/[^/]*$/, "") + "New-EncaAppRegistration.ps1";
  function psLine(redirect) {
    const r = String(redirect || redirectUri()).replace(/'/g, "");
    return `Invoke-WebRequest '${scriptUrl()}' -OutFile ./enca-reg.ps1; ` +
      `if ((Get-FileHash ./enca-reg.ps1 -Algorithm SHA256).Hash -ne '${PS_SHA256}') { throw 'enca-reg.ps1 is not the file this ENCA build shipped - stopped.' }; ` +
      `./enca-reg.ps1 -RedirectUris '${r}' -RequireAssignment`;
  }

  // The values this copy was SERVED with, captured before anything here can
  // change them. This is what "Default" restores to, so it has to be read
  // at parse time — after apply() has run, AUTH_CONFIG no longer holds it.
  const SHIPPED = {
    clientId: (typeof AUTH_CONFIG !== "undefined" && AUTH_CONFIG.clientId) || "",
    authority: (typeof AUTH_CONFIG !== "undefined" && AUTH_CONFIG.authority) || "",
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // The redirect URI MSAL will actually send (js/graph.js builds it the same
  // way). Stated rather than described: this is the string to paste into the
  // registration's SPA platform.
  const redirectUri = () => window.location.origin + window.location.pathname;

  // ---------- store ----------
  // Shape: { v: 1, active: "<id>" | "", list: [{ id, name, clientId, authority, at }] }
  // active "" means the shipped configuration. A stored id that is no longer
  // in the list is treated as "" rather than as an error — a connection can
  // be forgotten in another tab, and a sign-in screen that refuses to load
  // because of a dangling key would be the worse failure.
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { v: 1, active: "", list: [] };
      const o = JSON.parse(raw);
      const list = Array.isArray(o && o.list) ? o.list.filter((c) => c && c.id) : [];
      const active = list.some((c) => c.id === (o && o.active)) ? o.active : "";
      return { v: 1, active, list };
    } catch { return { v: 1, active: "", list: [] }; }   // private mode, or somebody's hand-edit
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, active: state.active || "", list: state.list || [] })); return true; }
    catch { return false; }                              // private mode — the session still works, it just will not be remembered
  }

  const list = () => read().list;
  const activeId = () => read().active;
  const byId = (id) => read().list.find((c) => c.id === id) || null;
  const active = () => byId(activeId());

  // ---------- apply ----------
  // Mutates AUTH_CONFIG in place, at script-parse time, so that every later
  // reader — js/graph.js building the MSAL instance, setAudience() and
  // markSelfHostedLogin() in js/app.js, the consent URL in the permissions
  // panel — sees ONE answer. An override applied after MSAL is constructed
  // would produce a card describing one registration and a sign-in against
  // another, which is exactly the contradiction the audience line exists to
  // prevent.
  function apply() {
    const c = active();
    if (!c || typeof AUTH_CONFIG === "undefined") return null;
    if (!usable(c)) {
      // Fail closed: falling back to the shipped login would sign somebody in
      // with a registration other than the one the card shows them selected.
      AUTH_CONFIG.clientId = ""; AUTH_CONFIG.authority = ""; AUTH_CONFIG.refused = "connection";
      return c;
    }
    AUTH_CONFIG.clientId = c.clientId;
    AUTH_CONFIG.authority = c.authority;
    AUTH_CONFIG.refused = "";
    return c;
  }

  // ---------- normalising what somebody types ----------
  // Accepts a tenant ID, a verified domain, one of the shared endpoints, or
  // a whole authority URL pasted out of the portal or out of
  // New-EncaAppRegistration.ps1's output. Returns a full authority.
  function toAuthority(input) {
    const raw = String(input || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;                    // already an authority
    return LOGIN_BASE + raw;
  }
  const tail = (authority) => String(authority || "").replace(/\/+$/, "").split("/").pop() || "";
  const isShared = (authority) => SHARED.test(tail(authority));

  // Returns "" when valid, or the reason it is not. The reason is shown as
  // written — these are the only words somebody gets before a sign-in that
  // would otherwise fail minutes later with an AADSTS code.
  function validate({ clientId, tenant }) {
    const id = String(clientId || "").trim();
    const t = String(tenant || "").trim().replace(/^https?:\/\/[^/]+\//i, "").replace(/\/+$/, "");
    if (!id || !t) return "A login is two values: the Application (client) ID of your ENCA registration and the tenant it lives in. ENCA signs in only through a registration in your own tenant.";
    if (!GUID.test(id)) {
      return "The Application (client) ID is a GUID — 8-4-4-4-12 hex characters. Copy it from the registration's Overview blade (Application (client) ID), not the object ID or the directory ID.";
    }
    if (SHARED.test(t)) return "organizations, common and consumers are shared endpoints that reach every tenant. ENCA no longer signs in that way: give the tenant ID or a verified domain of the tenant the registration lives in.";
    if (!GUID.test(t) && !DOMAIN.test(t)) {
      return "The tenant is a tenant ID (GUID) or a verified domain such as contoso.onmicrosoft.com.";
    }
    return "";
  }
  // A saved connection is applied only when it is a whole login (see header).
  const usable = (c) => !!(c && GUID.test(String(c.clientId || "")) && c.authority && !isShared(c.authority));

  // ---------- switching ----------
  // MSAL is constructed ONCE, from AUTH_CONFIG, in Graph.init(). There is no
  // supported way to repoint a PublicClientApplication at another client ID
  // afterwards, and half-repointing it is how you get a token cached for one
  // application handed to another. So a switch reloads the page, and clears
  // MSAL's own cache on the way out: its session-storage entries are keyed by
  // client ID, and an account left behind for registration A is at best noise
  // on the account picker for registration B.
  //
  // The reload is not a workaround being apologised for — it is the only
  // state-free way to change identity, and it costs nothing on a screen
  // nobody has yet signed in to.
  function use(id) {
    const s = read();
    s.active = s.list.some((c) => c.id === id) ? id : "";
    write(s);
    clearMsalCache();
    location.reload();
  }
  function clearMsalCache() {
    try {
      const drop = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && /^msal\./i.test(k)) drop.push(k);
      }
      drop.forEach((k) => sessionStorage.removeItem(k));
    } catch { /* private mode — nothing was cached either */ }
  }

  function save({ id, name, clientId, tenant }) {
    const s = read();
    const rec = {
      id: id || (`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
      name: String(name || "").trim().slice(0, 60),
      clientId: String(clientId || "").trim(),
      authority: toAuthority(tenant),
      at: Date.now(),
    };
    if (!rec.name) {
      // Named after whichever half is the distinguishing one, so a saved
      // connection is never a blank row in the picker.
      const t = tail(rec.authority);
      rec.name = t && !SHARED.test(t) ? t : (rec.clientId ? rec.clientId.slice(0, 8) + "…" : "Connection");
    }
    const i = s.list.findIndex((c) => c.id === rec.id);
    if (i >= 0) s.list[i] = rec; else s.list.push(rec);
    s.active = rec.id;
    if (!write(s)) return { ok: false, error: "This browser will not let the choice be stored (private window, or site data blocked). The connection cannot be remembered." };
    return { ok: true, rec };
  }
  function forget(id) {
    const s = read();
    s.list = s.list.filter((c) => c.id !== id);
    if (s.active === id) s.active = "";
    write(s);
  }

  // Applied immediately: every module below this script tag must see the
  // final values, and app.js states them on the card.
  const APPLIED = apply();

  // ==================================================================
  // The panel on the sign-in card. Wired on DOMContentLoaded; everything
  // above works without it (and is what the rest of the app reads).
  // ==================================================================
  function mount() {
    const $ = (id) => document.getElementById(id);
    const box = $("loginConn");
    if (!box) return;
    const pick = $("connPick"), cur = $("connCur"), form = $("connForm"), err = $("connErr");
    const fName = $("connName"), fClient = $("connClient"), fTenant = $("connTenant");
    let editing = null;                                   // id being edited, or null for a new one

    const descr = (clientId, authority) => {
      const t = tail(authority);
      return `<span class="conn-k">App</span> <code>${esc(clientId || "(none)")}</code><br>` +
        `<span class="conn-k">Tenant</span> <code>${esc(t || "(none)")}</code> · ` +
        (!t ? "no login" : isShared(authority) ? "shared endpoint — refused" : "that directory only");
    };

    function paintCurrent() {
      const c = active();
      const refusedShipped = !c && typeof AUTH_CONFIG !== "undefined" && AUTH_CONFIG.refusedFrom;
      cur.innerHTML = c
        ? `<b>${esc(c.name)}</b> — saved in this browser<br>${descr(c.clientId, c.authority)}` +
          (usable(c) ? "" : `<div class="conn-warn">This saved login is not a whole login — it needs the client ID <b>and</b> the tenant, and no shared endpoint. It is not used. <b>✎ Edit</b> it, or pick another.</div>`)
        : SHIPPED.clientId
          ? `<b>Default</b> — the login this copy of ENCA is served with<br>${descr(SHIPPED.clientId, SHIPPED.authority)}`
          : refusedShipped
            ? `<b>Default</b> — refused<br>${descr(AUTH_CONFIG.refusedFrom.clientId, AUTH_CONFIG.refusedFrom.authority)}<div class="conn-warn">This copy is configured with ${AUTH_CONFIG.refused === "shared" ? "a shared endpoint" : "only half a login"}, which ENCA refuses. Whoever runs it sets <code>ENCA_CLIENT_ID</code> and <code>ENCA_TENANT_ID</code>. Until then, ＋ Add your own login below.</div>`
            : `<b>No login yet</b> — this copy of ENCA ships none of its own<br><span class="mini">ENCA signs in only through an app registration in your own tenant. ＋ Add yours, or create one with the command below.</span>`;
      // The summary carries the answer without opening the panel: somebody
      // who left a customer's connection selected last week must not have to
      // remember that they did.
      const sum = $("connSummary");
      if (sum) sum.innerHTML = c
        ? `⚙ Signing in as <b>${esc(c.name)}</b> — change`
        : SHIPPED.clientId ? `⚙ Sign in with another login (another tenant, your own registration)` : `⚙ Your organisation's ENCA login`;
      $("connForget").style.display = c ? "" : "none";
      $("connEdit").style.display = c ? "" : "none";
      // A non-default choice is never hidden behind a closed fold, and neither
      // is the panel when it is the only way in.
      if (c || !SHIPPED.clientId) box.setAttribute("open", "");
    }

    function paintPicker() {
      const s = read();
      pick.innerHTML = `<option value="">${SHIPPED.clientId ? "Default — as this copy ships" : "Default — no login"}</option>` +
        s.list.map((c) => `<option value="${esc(c.id)}"${c.id === s.active ? " selected" : ""}>${esc(c.name)}</option>`).join("");
    }

    function openForm(c) {
      editing = c ? c.id : null;
      fName.value = c ? c.name : "";
      fClient.value = c ? c.clientId : "";
      fTenant.value = c ? tail(c.authority) : "";
      err.style.display = "none";
      form.style.display = "";
      fName.focus();
    }
    const closeForm = () => { form.style.display = "none"; editing = null; };

    // ---------- 🪪 the own-registration route (25455, rewritten 327) ----------
    // Until 32708 this block had two forms: a link into the in-app wizard where
    // the selected registration could reach any tenant (the shared one), and
    // the PowerShell route where it could not. The first form is gone with the
    // shared registration — the wizard needs a token for the tenant it writes
    // into, and no single-tenant registration owned by another directory can
    // give one. What is left is the one route that never needed a foothold:
    // Azure Cloud Shell, signed in as the administrator, running the script
    // this copy serves, checked by its SHA-256. The in-app wizard stays for a
    // tenant that already signs in with its own registration (account menu).
    function paintRoute() {
      const host = $("connRouteBody"), wrap = $("loginOnboard");
      if (!host || !wrap) return;
      wrap.classList.remove("blocked");
      host.innerHTML =
        `<p>ENCA signs in only through an app registration in <b>your own tenant</b>. To create one, open <b>Azure Cloud Shell</b> signed in to your tenant, choose <b>PowerShell</b> and <i>No storage account required</i>, and paste:</p>` +
        `<pre class="conn-cmd" id="connPsLine">${esc(psLine())}</pre>` +
        `<p><button type="button" class="btn sm" id="connPsCopy">Copy the command</button> <a href="${esc(scriptUrl())}" target="_blank" rel="noopener">Read the script</a></p>` +
        `<p>It creates a <b>single-tenant</b> registration with this page as its redirect URI, assigns you to it, grants admin consent for your organisation and prints the <b>client ID</b> and <b>tenant ID</b> — ＋ Add them above. You need Global Administrator, or Privileged Role Administrator with Application Administrator. No Azure subscription for Cloud Shell? Run the same script in PowerShell 7 on your own machine with the Microsoft.Graph module.</p>`;
    }

    paintPicker(); paintCurrent(); paintRoute();
    // Delegated, so the Copy button survives a repaint. The onboarding link
    // itself is handled in js/onboard.js, delegated from the same container.
    const routeBox = $("loginOnboard");
    if (routeBox) routeBox.addEventListener("click", async (e) => {
      const b = e.target.closest("#connPsCopy"); if (!b) return;
      const line = psLine();
      try { await navigator.clipboard.writeText(line); b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy the command"; }, 1500); }
      catch { const pre = $("connPsLine"); if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } }
    });
    $("connRedirect").innerHTML =
      `Whichever registration you name must have <code>${esc(redirectUri())}</code> as a <b>SPA</b> redirect URI, ` +
      `or Entra refuses the sign-in with <b>AADSTS50011</b>. Nothing here is sent anywhere — the choice lives in this browser only.`;

    pick.addEventListener("change", () => use(pick.value));
    $("connAdd").addEventListener("click", () => openForm(null));
    $("connEdit").addEventListener("click", () => { const c = active(); if (c) openForm(c); });
    $("connCancel").addEventListener("click", closeForm);
    $("connForget").addEventListener("click", () => {
      const c = active();
      if (!c) return;
      if (!confirm(`Forget "${c.name}"? ${SHIPPED.clientId ? "The next sign-in uses the login this copy ships with." : "This copy ships no login, so you will need to add one again to sign in."} Nothing in any tenant changes.`)) return;
      forget(c.id);
      clearMsalCache();
      location.reload();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = { name: fName.value, clientId: fClient.value.trim(), tenant: fTenant.value.trim() };
      const bad = validate(v);
      if (bad) { err.textContent = bad; err.style.display = ""; return; }
      const r = save({ id: editing, ...v });
      if (!r.ok) { err.textContent = r.error; err.style.display = ""; return; }
      clearMsalCache();
      location.reload();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  return { list, active, activeId, use, save, forget, validate, usable, toAuthority, isShared, tail, redirectUri, psLine, scriptUrl, PS_SHA256, clearMsalCache, shipped: SHIPPED, applied: APPLIED };
})();
