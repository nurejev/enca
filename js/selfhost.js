// ======================================================================
// Self-host branding (R06 / S02) — the ⚙ gear next to Sign out.
//
// A self-hosted instance can wear its organisation's identity WITHOUT
// forking, through the same mechanism as the per-audience looks in
// js/branding.js: everything here becomes a BRAND_OVERRIDES entry with
// the key "selfhost", and activeOverrideKey() (js/app.js) falls back to
// it when no other override is chosen. Chrome only, like any override —
// exports keep the neutral product credit by design.
//
// Two places the settings can live, in priority order:
//   1. localStorage (this browser)   — what 💾 Apply saves. The admin's
//      preview, and enough for a single-operator instance.
//   2. /selfhost-branding.json       — a file served next to index.html,
//      fetched at boot. The compose file and install scripts mount it into
//      the container, so EVERY visitor gets the branding. The gear's
//      ⭳ Download button produces exactly this file.
//
// THE GEAR IS EVERYWHERE; THE DEPLOYMENT FILE IS NOT. Two different things
// were behind one guard until this build.
//
//   The gear writes to localStorage — THIS browser, this person, chrome
//   only. It cannot reach another visitor, cannot be served to anyone, and
//   is undone by Reset or by clearing site data. There is no reason the
//   person running the hosted site should be denied a look they can already
//   have by self-hosting, so it is offered on every host.
//
//   The deployment FILE stays non-production. selfhost-branding.json is
//   fetched and applied to every visitor, and softens the ribbon; that is a
//   self-hosting mechanism and enca.limon-it.nl serves its identity from
//   js/branding.js, reviewed in git.
//
// BRANDING.host is NOT configurable either way: it drives isProdHost, the
// BETA ribbon and the export credit, and a wrong host would let a copy pass
// itself off as production. That has not changed and must not.
//
// When the deployment file (not just localStorage) is present, the red
// "BETA — not production" ribbon becomes a neutral "SELF-HOSTED" one: a
// deliberately configured instance is not a test site, but it must still
// never be mistakable for enca.limon-it.nl.
// ======================================================================
(() => {
  "use strict";
  const STORE = "enca-selfhost-brand";
  const KEY = "selfhost";

  const isProd = () => {
    try {
      const prod = ((typeof BRANDING !== "undefined" && BRANDING.host) || "").toLowerCase();
      return !!prod && (location.hostname || "").toLowerCase() === prod;
    } catch { return true; }
  };

  // ---- sanitising ----------------------------------------------------
  // Colour values end up inside a generated stylesheet; a value that can
  // close a declaration block could smuggle CSS in. Allow-list the charset.
  const SAFE_CSS = /^[#a-zA-Z0-9(),.%\s\/-]+$/;
  const IDENT = ["--green", "--green-deep", "--accent2", "--lemon", "--lemon-deep"];
  function cleanColors(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof k === "string" && k.startsWith("--") && typeof v === "string" && v.length < 80 && SAFE_CSS.test(v)) out[k] = v.trim();
    }
    return out;
  }
  const str = (v, max) => (typeof v === "string" && v.length <= (max || 300)) ? v : "";
  // Logos arrive as data: URIs from the file inputs; anything else must be a
  // same-origin relative path like the defaults in branding.js.
  const asset = (v) => {
    if (typeof v !== "string" || v.length > 800000) return "";
    if (/^data:image\/(png|jpe?g|svg\+xml|webp|gif);base64,/.test(v)) return v;
    if (/^(?!.*:)[\w./?=-]+$/.test(v)) return v;   // relative, no scheme
    return "";
  };
  function cleanBrand(b) {
    if (!b || typeof b !== "object") return null;
    const out = {};
    ["name", "longName", "expansion", "org", "orgSplit", "orgUrl", "copyright", "loginTitle", "loginBlurb"]
      .forEach((k) => { const v = str(b[k], k === "loginBlurb" ? 600 : 300); if (v) out[k] = v; });
    if (b.orgUrl && !/^https:\/\//.test(out.orgUrl || "")) delete out.orgUrl;
    const logo = asset(b.logo); if (logo) { out.logo = logo; out.logoDark = logo; }
    const fav = asset(b.favicon); if (fav) out.favicon = fav;
    if (b.logoWide) out.logoWide = true;
    if (b.hideOrgName) out.hideOrgName = true;
    const L = cleanColors(b.colorsLight), D = cleanColors(b.colorsDark);
    if (Object.keys(L).length) out.colorsLight = L;
    if (Object.keys(D).length) out.colorsDark = D;
    return Object.keys(out).length ? out : null;
  }

  // ---- registration --------------------------------------------------
  let deploymentBrand = null;   // from /selfhost-branding.json
  let localBrand = null;        // from localStorage
  try { localBrand = cleanBrand((JSON.parse(localStorage.getItem(STORE) || "null") || {}).brand); } catch { /* unreadable */ }

  function register() {
    if (typeof BRAND_OVERRIDES === "undefined") return;
    const i = BRAND_OVERRIDES.findIndex((o) => o.key === KEY);
    if (i >= 0) BRAND_OVERRIDES.splice(i, 1);
    const brand = localBrand || deploymentBrand;
    if (brand) BRAND_OVERRIDES.push({ key: KEY, label: "This deployment", match: /$^/, brand });
  }
  register();   // synchronous — before app.js paints, when localStorage has one

  const rebrand = () => document.dispatchEvent(new CustomEvent("enca:brand-updated"));

  // ---- the deployment file -------------------------------------------
  // Non-production only: this one is served TO people, and it is what turns
  // the red ribbon into a neutral SELF-HOSTED one. The hosted site's identity
  // is js/branding.js and stays there.
  const BOOT_CACHE = "enca-selfhost-brand-cache";
  if (!isProd()) fetch("selfhost-branding.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      deploymentBrand = cleanBrand(j && j.brand);
      // The boot cache is what js/selfhost-boot.js paints from BEFORE this
      // fetch can run, so it must mirror the fetch exactly: store the
      // sanitised brand on success, clear it when the file is gone —
      // otherwise a removed branding keeps flashing on every load.
      try {
        if (deploymentBrand) localStorage.setItem(BOOT_CACHE, JSON.stringify({ v: 1, brand: deploymentBrand }));
        else localStorage.removeItem(BOOT_CACHE);
      } catch { /* private mode */ }
      if (!deploymentBrand) return;
      register();
      rebrand();
      // A configured instance is not a test site: soften the ribbon, keep it.
      const rb = document.getElementById("betaRibbon");
      if (rb) {
        rb.textContent = "⚙ SELF-HOSTED — not " + ((typeof BRANDING !== "undefined" && BRANDING.host) || "production");
        rb.style.background = "#3b5a72";
        rb.dataset.titleTag = "[SELF-HOSTED]";
        document.title = document.title.replace(/^\[BETA\] /, "[SELF-HOSTED] ");
      }
    })
    .catch(() => { /* no file — nothing configured, nothing to do */ });

  // ---- the gear ------------------------------------------------------
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function normHex(v) {
    // computed CSS colours arrive in whatever format the sheet used; a
    // <input type=color> only eats #rrggbb.
    v = String(v || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    try {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = v || "#000000";
      const s = c.fillStyle;
      return /^#[0-9a-f]{6}$/i.test(s) ? s : "#000000";
    } catch { return "#000000"; }
  }

  function fileToDataUri(input, cb) {
    const f = input.files && input.files[0];
    if (!f) { cb(""); return; }
    if (f.size > 500000) { alert("Keep the image under 500 KB — it is stored inline in the settings file."); input.value = ""; cb(""); return; }
    const r = new FileReader();
    r.onload = () => cb(String(r.result || ""));
    r.readAsDataURL(f);
  }

  // `prefill` (optional) fills the form from an imported brand instead of the
  // saved one — the import flow rebuilds the dialog with it so the person can
  // REVIEW what a file contains before 💾 Apply makes it this browser's look.
  function buildModal(prefill) {
    let bg = document.getElementById("selfhostModal");
    if (bg && !prefill) return bg;
    if (bg) bg.remove();
    const cur = prefill || localBrand || deploymentBrand || {};
    const B = (typeof BRANDING !== "undefined") ? BRANDING : {};
    const val = (k, d) => esc(cur[k] != null ? cur[k] : (d != null ? d : (B[k] || "")));
    const cs = getComputedStyle(document.documentElement);
    const colorRow = (theme) => IDENT.map((k) => {
      const from = (cur[theme] && cur[theme][k]) || cs.getPropertyValue(k);
      return `<label class="mini" style="display:flex;flex-direction:column;gap:2px">${esc(k.replace("--", ""))}
        <input type="color" data-ct="${theme}" data-ck="${esc(k)}" value="${esc(normHex(from))}" style="width:64px;height:30px;padding:0;border:1px solid var(--border);border-radius:6px;background:var(--surface)"></label>`;
    }).join("");
    const F = (id, label, v, ph) =>
      `<label class="mini" style="display:flex;flex-direction:column;gap:3px">${esc(label)}
        <input type="text" id="${id}" value="${v}" placeholder="${esc(ph || "")}" style="padding:7px 9px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink)"></label>`;

    bg = document.createElement("div");
    bg.id = "selfhostModal";
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" style="max-width:680px">
      <h3>⚙ Branding — this deployment</h3>
      ${isProd() ? `<p class="mini" style="margin:0 0 14px;color:var(--report)">On this host the settings apply to <b>your browser only</b> \u2014 nobody else sees them, and \u21f2 Reset puts the look back. The downloaded file is for an instance you run yourself: served next to index.html there, it brands the site for every visitor. Serving it here would do nothing, because the hosted identity comes from js/branding.js.</p>` : ""}
      <p class="mini" style="margin:0 0 14px">The same mechanism as the hosted per-audience looks: chrome only, exports keep the neutral ${esc(B.name || "ENCA")} credit. 💾 applies in this browser; ⭳ downloads <b>selfhost-branding.json</b> — serve it next to index.html (the compose file mounts it) and every visitor gets this look.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px">
        ${F("shName", "Product name", val("name"))}
        ${F("shLong", "Long name", val("longName"))}
        ${F("shExp", "Name expansion (empty to hide)", val("expansion"))}
        ${F("shOrg", "Organisation", val("org"))}
        ${F("shSplit", "Accent tail of the org name (empty for none)", val("orgSplit"))}
        ${F("shUrl", "Organisation URL (https)", val("orgUrl"))}
        ${F("shCopy", "Copyright line", val("copyright"))}
        ${F("shLoginTitle", "Login title (empty for the default)", val("loginTitle"))}
      </div>
      <label class="mini" style="display:flex;flex-direction:column;gap:3px;margin-top:10px">Login blurb
        <textarea id="shBlurb" rows="2" style="padding:7px 9px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink);resize:vertical">${val("loginBlurb")}</textarea></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:10px">
        <label class="mini" style="display:flex;flex-direction:column;gap:3px">Logo (SVG/PNG, transparent, &lt;500 KB)
          <input type="file" id="shLogo" accept="image/*"></label>
        <label class="mini" style="display:flex;flex-direction:column;gap:3px">Favicon
          <input type="file" id="shFav" accept="image/*"></label>
      </div>
      <div style="display:flex;gap:18px;margin-top:8px">
        <label class="chk mini"><input type="checkbox" id="shWide" ${cur.logoWide ? "checked" : ""}> Wide wordmark (natural aspect, not 1:1)</label>
        <label class="chk mini"><input type="checkbox" id="shHideOrg" ${cur.hideOrgName ? "checked" : ""}> Hide the org name next to the logo</label>
      </div>
      <label class="chk mini" style="margin-top:12px"><input type="checkbox" id="shColL" ${cur.colorsLight ? "checked" : ""}> Override identity colours — light</label>
      <div id="shColLRow" style="display:${cur.colorsLight ? "flex" : "none"};gap:12px;flex-wrap:wrap;margin:6px 0">${colorRow("colorsLight")}</div>
      <label class="chk mini"><input type="checkbox" id="shColD" ${cur.colorsDark ? "checked" : ""}> Override identity colours — dark</label>
      <div id="shColDRow" style="display:${cur.colorsDark ? "flex" : "none"};gap:12px;flex-wrap:wrap;margin:6px 0">${colorRow("colorsDark")}</div>
      <p class="mini" style="margin:8px 0 0">Full per-theme palettes (every CSS variable, not just the identity five) fit the same file — edit the downloaded JSON's colorsLight / colorsDark by hand (js/branding.js documents the variables), then ⭱ Import it here; the extra entries survive the round-trip.</p>
      <div class="modal-foot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
        <button class="btn" id="shReset" title="Remove the branding saved in this browser">✖ Remove local branding</button>
        <button class="btn" id="shImport" title="Load a selfhost-branding.json into the form to review, then Apply">⭱ Import from JSON</button>
        <input type="file" id="shImportFile" accept=".json,application/json" style="display:none">
        <button class="btn" id="shDownload">⭳ Download selfhost-branding.json</button>
        <button class="btn" id="shClose">Close</button>
        <button class="btn primary" id="shApply">💾 Apply in this browser</button>
      </div>
    </div>`;
    document.body.appendChild(bg);

    const $ = (id) => bg.querySelector("#" + id);
    let logoUri = cur.logo && String(cur.logo).startsWith("data:") ? cur.logo : "";
    let favUri = cur.favicon && String(cur.favicon).startsWith("data:") ? cur.favicon : "";
    $("shLogo").addEventListener("change", () => fileToDataUri($("shLogo"), (u) => { logoUri = u; }));
    $("shFav").addEventListener("change", () => fileToDataUri($("shFav"), (u) => { favUri = u; }));
    $("shColL").addEventListener("change", () => { $("shColLRow").style.display = $("shColL").checked ? "flex" : "none"; });
    $("shColD").addEventListener("change", () => { $("shColDRow").style.display = $("shColD").checked ? "flex" : "none"; });

    function collect() {
      // Start from the palette the form was opened with, then let the five
      // identity pickers override their keys. A full palette (every CSS
      // variable, as an imported or hand-edited file can carry) must survive
      // a round-trip through this dialog — the pickers edit five of its
      // entries, they do not define the set.
      const colors = (theme) => {
        const out = Object.assign({}, cur[theme] || {});
        bg.querySelectorAll(`input[data-ct="${theme}"]`).forEach((el) => { out[el.dataset.ck] = el.value; });
        return out;
      };
      const b = {
        name: $("shName").value.trim(), longName: $("shLong").value.trim(),
        expansion: $("shExp").value.trim(), org: $("shOrg").value.trim(),
        orgSplit: $("shSplit").value.trim(), orgUrl: $("shUrl").value.trim(),
        copyright: $("shCopy").value.trim(), loginTitle: $("shLoginTitle").value.trim(),
        loginBlurb: $("shBlurb").value.trim(),
        logoWide: $("shWide").checked, hideOrgName: $("shHideOrg").checked,
      };
      if (logoUri) b.logo = logoUri;
      if (favUri) b.favicon = favUri;
      if ($("shColL").checked) b.colorsLight = colors("colorsLight");
      if ($("shColD").checked) b.colorsDark = colors("colorsDark");
      return cleanBrand(b);
    }

    $("shApply").addEventListener("click", () => {
      localBrand = collect();
      try { localStorage.setItem(STORE, JSON.stringify({ v: 1, brand: localBrand || {} })); } catch { alert("Could not save — is this a private window?"); return; }
      register(); rebrand();
      bg.classList.remove("open");
    });
    $("shReset").addEventListener("click", () => {
      localBrand = null;
      try { localStorage.removeItem(STORE); } catch { /* private mode */ }
      register(); rebrand();
      bg.remove();   // rebuilt with fresh values next open
    });
    $("shImport").addEventListener("click", () => $("shImportFile").click());
    $("shImportFile").addEventListener("change", () => {
      const f = $("shImportFile").files && $("shImportFile").files[0];
      if (!f) return;
      if (f.size > 900000) { alert("That file is too large to be a branding file — the limit is ~900 KB."); $("shImportFile").value = ""; return; }
      const r = new FileReader();
      r.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(String(r.result || "")); } catch { /* handled below */ }
        // Accept the exported shape ({ v, brand }) and a bare brand object,
        // then run it through the same sanitiser every other source gets —
        // an imported file earns no more trust than a fetched one.
        const b = cleanBrand(parsed && (parsed.brand || (parsed.org || parsed.name || parsed.colorsLight ? parsed : null)));
        if (!b) { alert("Could not read that as a branding file. Expected a selfhost-branding.json as exported by ⭳ Download (or its inner brand object)."); return; }
        // Rebuild the form with the file's values so they can be reviewed —
        // nothing is saved or applied until 💾 Apply.
        buildModal(b).classList.add("open");
      };
      r.readAsText(f);
    });
    $("shDownload").addEventListener("click", () => {
      const data = JSON.stringify({ v: 1, comment: "Serve this file as /selfhost-branding.json next to index.html — see SELF-HOSTING.md.", brand: collect() || {} }, null, 2);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = "selfhost-branding.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    $("shClose").addEventListener("click", () => bg.classList.remove("open"));
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.classList.remove("open"); });
    return bg;
  }

  function addGear() {
    const out = document.getElementById("signOutBtn");
    if (!out || document.getElementById("selfhostGearBtn")) return;
    const b = document.createElement("button");
    b.className = "btn";
    b.id = "selfhostGearBtn";
    b.textContent = "⚙";
    // The glyph at the .btn default size rendered near-invisible next to
    // Sign out; drawn at 21px (same button, no label) it reads as a control.
    b.style.fontSize = "21px";
    b.style.lineHeight = "1";
    b.style.padding = "3px 10px 5px";
    b.title = isProd()
      ? "Branding — changes the look in this browser only"
      : "Branding settings for this self-hosted deployment";
    b.addEventListener("click", () => buildModal().classList.add("open"));
    out.insertAdjacentElement("afterend", b);
  }
  (document.readyState === "loading") ? document.addEventListener("DOMContentLoaded", addGear) : addGear();
})();
