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

  // Azure Container Apps is the deployment with no filesystem to put a
  // branding file on, so it is the one where "design it, then go and paste it
  // into Azure" is the whole friction. It is also the one the app can finish
  // by itself: ARM will take the change from the signed-in user's own token.
  const IS_ACA = /\.azurecontainerapps\.io$/i.test((location.hostname || "").toLowerCase());

  // HOW BIG AN ENVIRONMENT VARIABLE MAY BE, and why this is a hard limit
  // rather than a warning. Linux caps a SINGLE argv/envp string at
  // MAX_ARG_STRLEN — 128 KB — and the whole environment is handed to exec().
  // Go past it and exec fails with E2BIG before any program runs: not the
  // entrypoint, not nginx, nothing. The container is dead on arrival and the
  // app cannot repair it, because the app is served BY that container. The
  // only way back is removing the variable in the portal or the CLI.
  //
  // Build 25234 shipped this as a warning at 30 KB and no limit at all, and a
  // branding with an embedded logo — which is most of them — went straight
  // past 128 KB and took a live deployment down. A warning is the wrong shape
  // for a failure the user cannot undo from where they are standing.
  //
  // 48 KB leaves generous room under the kernel limit for the variable's name,
  // every other variable, and whatever the platform adds of its own.
  const ENV_MAX = 48000;
  const ENV_WARN = 24000;

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
    // Relative, same-origin, no scheme. The "no colon" test alone was not
    // enough and it now matters, because this value can be TYPED rather than
    // only arriving in a hand-edited file:
    //   //evil.example/x.png  is protocol-relative - no colon, but absolutely
    //                         off-origin. img-src 'self' in the CSP catches it
    //                         today, which is defence in depth, not a reason to
    //                         let it through the value check.
    //   ../../something       traversal, and nothing legitimate needs it: a
    //                         branding names an asset this deployment serves.
    if (v.startsWith("//") || v.startsWith("\\") || v.includes("..")) return "";
    if (/^(?!.*:)[\w./?=-]+$/.test(v)) return v;
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
      //
      // app.js already says SELF-HOSTED on any host that is neither
      // BRANDING.host nor BRANDING.betaHost, so on a real self-hosted copy this
      // is a no-op that happens to re-state the same thing. It still earns its
      // place for the one case app.js cannot cover: a branding file served from
      // the publisher's OWN beta host, where the ribbon starts as BETA.
      const rb = document.getElementById("betaRibbon");
      if (rb) {
        rb.textContent = "⚙ SELF-HOSTED";
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
    // Deliberately NOT val(): that falls back to the active branding, which on
    // an unconfigured deployment is the app's own logo path complete with its
    // ?v= cache-buster. Pre-filling that would pin every saved branding to one
    // build's asset URL and leave it pointing at a stale file later. Only a
    // path this branding actually set belongs in the box.
    const pathVal = (k) => {
      const v = typeof cur[k] === "string" ? cur[k] : "";
      return v.startsWith("data:") ? "" : esc(v);
    };
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
      <!-- A file picker embeds the image as a data: URI, which is what makes a
           branding large enough to be unusable as an environment variable. A
           path is the alternative the size refusal used to recommend without
           giving anywhere to type it. Same-origin relative paths only (the
           sanitiser rejects anything carrying a scheme), so an image has to be
           served by this deployment - a branding file cannot point the app at
           somebody else's host. -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:8px">
        ${F("shLogoPath", "…or a logo path already served here", pathVal("logo"), "assets/my-logo.svg")}
        ${F("shFavPath", "…or a favicon path", pathVal("favicon"), "assets/my-favicon.svg")}
      </div>
      <p class="mini muted" style="margin:4px 0 0">A path keeps the branding small enough to travel as an environment variable; an uploaded file is embedded and often will not. A file chosen above wins over the path next to it.</p>
      <div style="display:flex;gap:18px;margin-top:8px">
        <label class="chk mini"><input type="checkbox" id="shWide" ${cur.logoWide ? "checked" : ""}> Wide wordmark (natural aspect, not 1:1)</label>
        <label class="chk mini"><input type="checkbox" id="shHideOrg" ${cur.hideOrgName ? "checked" : ""}> Hide the org name next to the logo</label>
      </div>
      <label class="chk mini" style="margin-top:12px"><input type="checkbox" id="shColL" ${cur.colorsLight ? "checked" : ""}> Override identity colours — light</label>
      <div id="shColLRow" style="display:${cur.colorsLight ? "flex" : "none"};gap:12px;flex-wrap:wrap;margin:6px 0">${colorRow("colorsLight")}</div>
      <label class="chk mini"><input type="checkbox" id="shColD" ${cur.colorsDark ? "checked" : ""}> Override identity colours — dark</label>
      <div id="shColDRow" style="display:${cur.colorsDark ? "flex" : "none"};gap:12px;flex-wrap:wrap;margin:6px 0">${colorRow("colorsDark")}</div>
      <p class="mini" style="margin:8px 0 0">Full per-theme palettes (every CSS variable, not just the identity five) fit the same file — edit the downloaded JSON's colorsLight / colorsDark by hand (js/branding.js documents the variables), then ⭱ Import it here; the extra entries survive the round-trip.</p>
      ${IS_ACA ? `
      <!-- The escape hatch for a look too big to be an environment variable.
           Without a box to type it in, the size refusal was telling people to
           set a variable the app gave them no way to set. -->
      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--border);border-left:3px solid #3b5a72;border-radius:10px">
        ${F("shBrandUrl", "Branding JSON URL (optional — for a look too large to be an environment variable)", esc(""), "https://example.com/selfhost-branding.json")}
        <p class="mini muted" style="margin:6px 0 0">Fill this in and ☁ <b>Save to this deployment</b> sets <code>ENCA_BRANDING_URL</code> instead, with no size limit — the container fetches it on every start. Leave it empty and the look above is saved inline. ⭳ Download gives you the file to serve.</p>
      </div>` : ""}
      <!-- THE NUMBER, WHILE THERE IS STILL TIME TO ACT ON IT. Both size
           refusals below fire at the end of the job, on the click that was
           meant to finish it, about a logo chosen many fields ago. This says
           the same thing continuously and from the moment the dialog opens,
           so "too big" arrives as a property of the look being designed
           rather than as a verdict on it. -->
      <div id="shSize" class="mini" style="margin-top:14px;padding:8px 11px;border:1px solid var(--border);border-radius:9px"></div>
      <div class="modal-foot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
        <button class="btn" id="shReset" title="Remove the branding saved in this browser">✖ Remove local branding</button>
        <button class="btn" id="shImport" title="Load a selfhost-branding.json into the form to review, then Apply">⭱ Import from JSON</button>
        <input type="file" id="shImportFile" accept=".json,application/json" style="display:none">
        <button class="btn" id="shDownload">⭳ Download selfhost-branding.json</button>
        <button class="btn" id="shEnv" title="Copy this look as the ENCA_BRANDING value for the container — every visitor gets it, not just this browser">📋 Copy for container</button>
        ${IS_ACA ? `<button class="btn" id="shAzure" title="Write this look onto this container app's ENCA_BRANDING setting, using your own Azure rights">☁ Save to this deployment</button>` : ""}
        <button class="btn" id="shClose">Close</button>
        <button class="btn primary" id="shApply">💾 Apply in this browser</button>
      </div>
    </div>`;
    document.body.appendChild(bg);

    const $ = (id) => bg.querySelector("#" + id);
    let logoUri = cur.logo && String(cur.logo).startsWith("data:") ? cur.logo : "";
    let favUri = cur.favicon && String(cur.favicon).startsWith("data:") ? cur.favicon : "";
    $("shLogo").addEventListener("change", () => fileToDataUri($("shLogo"), (u) => { logoUri = u; updateSize(); }));
    $("shFav").addEventListener("change", () => fileToDataUri($("shFav"), (u) => { favUri = u; updateSize(); }));
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
      // An uploaded file wins over a typed path: choosing a file is the more
      // recent, more deliberate gesture of the two.
      const logoPath = $("shLogoPath").value.trim(), favPath = $("shFavPath").value.trim();
      if (logoUri) b.logo = logoUri; else if (logoPath) b.logo = logoPath;
      if (favUri) b.favicon = favUri; else if (favPath) b.favicon = favPath;
      if ($("shColL").checked) b.colorsLight = colors("colorsLight");
      if ($("shColD").checked) b.colorsDark = colors("colorsDark");
      return cleanBrand(b);
    }

    // What actually gets written to a file, a clipboard or a container app.
    //
    // cleanBrand() sets logoDark to the same value as logo, because a single
    // uploaded mark has to serve both themes. Serialising that copies the
    // WHOLE data: URI a second time — on a look whose logo is 10 KB, a third
    // of the payload was one image written twice, against a hard 48 KB
    // ceiling. Dropping it is lossless: every route back in (the fetched
    // file, Import, localStorage) runs cleanBrand, which puts it back.
    const forWire = (b) => {
      const o = Object.assign({}, b || {});
      if (o.logoDark && o.logoDark === o.logo) delete o.logoDark;
      return o;
    };

    // ---- the live size readout ------------------------------------------
    //
    // Measured through collect() and the SAME serialisation 📋 Copy and ☁ Save
    // use, so the number on screen is the number those buttons will judge —
    // a meter that estimated its own way would be a second opinion, and the
    // wrong one whenever they disagreed.
    //
    // It names the embedded images separately because that is the actionable
    // part: "122 KB" invites deleting text that costs nothing, while "the logo
    // is 90 KB of it" points at the one field that can fix it.
    // Bytes below 2 KB, KB above. A look with no image in it is a few hundred
    // bytes, and "0.0 KB" reads as a broken meter rather than a small one —
    // it also has to visibly MOVE when a field is typed into, or the readout
    // looks stuck and nobody trusts the number when it matters.
    const kb = (n) => (n < 2048 ? n + " bytes" : (n < 10240 ? (n / 1024).toFixed(1) : Math.round(n / 1024)) + " KB");
    function updateSize() {
      const el = $("shSize");
      if (!el) return;
      const b = forWire(collect());
      const n = JSON.stringify({ v: 1, brand: b }).length;
      const embedded = ["logo", "favicon"]
        .map((k) => ({ k, len: String(b[k] || "").startsWith("data:") ? b[k].length : 0 }))
        .filter((x) => x.len);
      const paths = ["logo", "favicon"].some((k) => b[k] && !String(b[k]).startsWith("data:"));
      const from = embedded.length
        ? " " + embedded.map((x) => `The embedded ${x.k} is ${kb(x.len)} of it.`).join(" ")
        : (paths ? " No image is embedded — they are paths, which is what keeps this small." : "");
      let tone, text;
      if (n > ENV_MAX) {
        tone = ["var(--off)", "var(--bad-bd)", "var(--bad-bg2)"];
        text = `<b>${kb(n)} — too large for ENCA_BRANDING.</b> An environment variable cannot safely carry more than ${Math.round(ENV_MAX / 1024)} KB, so 📋 Copy and ☁ Save will refuse this look.${from} Use a logo path above, or serve the downloaded file and point a branding URL at it. ⭳ Download and 💾 Apply are unaffected — neither has a size limit.`;
      } else if (n > ENV_WARN) {
        tone = ["var(--report)", "var(--warn-bd)", "var(--warn-bg2)"];
        text = `<b>${kb(n)} — large for an environment variable</b>, though still under the ${Math.round(ENV_MAX / 1024)} KB ceiling.${from} A shade smaller and there is room to keep editing this look later.`;
      } else {
        tone = ["var(--muted)", "var(--border)", "transparent"];
        text = `${kb(n)} — comfortably inside the ${Math.round(ENV_MAX / 1024)} KB an environment variable can carry, so every route out of this dialog is open.${from}`;
      }
      el.style.color = tone[0];
      el.style.borderColor = tone[1];
      el.style.background = tone[2];
      el.innerHTML = text;
    }
    // Delegated, so it survives the fields being rearranged, and covers the
    // colour pickers and checkboxes as well as the text boxes. The file
    // inputs read asynchronously and are updated from their own callbacks.
    bg.addEventListener("input", updateSize);
    bg.addEventListener("change", updateSize);
    updateSize();

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
      const data = JSON.stringify({ v: 1, comment: "Serve this file as /selfhost-branding.json next to index.html — see SELF-HOSTING.md.", brand: forWire(collect()) }, null, 2);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = "selfhost-branding.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    // ⭳ Download gives you a file to serve. This gives you the same look as a
    // value to hand the container, which is the only route on a platform with
    // no filesystem to mount into. Same JSON either way — the entrypoint writes
    // it to exactly the path the download tells you to serve it from.
    $("shEnv").addEventListener("click", async () => {
      const data = JSON.stringify({ v: 1, brand: forWire(collect()) });
      const kb = Math.round(data.length / 1024);
      // Environment variables are not a file, and the ceiling is the kernel's,
      // not the platform's: exec() refuses a single variable over 128 KB, so a
      // container carrying one never starts. An embedded logo is what gets you
      // there. Over the hard limit this stops being advice.
      const tooBig = data.length > ENV_MAX;
      const big = data.length > ENV_WARN;
      // Too big to be an environment variable at all: do not put it on the
      // clipboard. Handing somebody a value that will stop their container
      // from starting, with a caveat underneath, is how this went wrong once.
      if (tooBig) {
        return alert(
          `This look is ${kb} KB — too large for an environment variable, so ENCA_BRANDING is not the route for it.\n\n`
          + `Linux caps a single variable at 128 KB and hands the whole environment to exec(), so a container carrying `
          + `one bigger than that FAILS TO START — nothing runs, and the site is down until the variable is removed by hand.\n\n`
          + `An embedded logo is almost always the reason. Instead:\n\n`
          + `  - Use the "logo path already served here" box above to point at an image in the deployment\n`
          + `    rather than embedding one. Smaller change, usually enough on its own.\n\n`
          + `  - Or Download the file, serve it somewhere, and set ENCA_BRANDING_URL to that address.\n`
          + `    The container fetches it at start, with no size limit.\n\n`
          + `  - Or mount the file at the site root, if your platform has a filesystem.`);
      }
      let copied = false;
      try { await navigator.clipboard.writeText(data); copied = true; } catch { /* denied or insecure context */ }
      const how =
        `ENCA_BRANDING — ${kb} KB${copied ? ", copied to your clipboard" : ""}.\n\n` +
        `Azure Container Apps:\n` +
        // One line, no continuation character. A backslash is a bash
        // continuation and a backtick is PowerShell's, so ANY wrapped form is
        // wrong for half the readers - and pasting the wrong one runs the
        // first line alone, which fails with an error naming neither problem.
        `  az containerapp update -n <app> -g <rg> --set-env-vars ENCA_BRANDING='<paste>'\n\n` +
        `Docker:\n  docker run -e ENCA_BRANDING='<paste>' ...\n\n` +
        (big
          ? `⚠ ${kb} KB is on the large side for a variable — an embedded logo is why. The hard\n` +
            `ceiling is 128 KB, above which the container will not start at all. If you are going\n` +
            `to keep growing this look, serve the JSON at a URL and use ENCA_BRANDING_URL instead.\n\n`
          : "") +
        `Either way it is written to selfhost-branding.json at the site root, so EVERY\n` +
        `visitor sees this look — not just this browser.`;
      if (!copied) {
        // Clipboard refused (an http:// origin, or a denied permission). The
        // value is the point of the button, so it must still be obtainable.
        window.prompt(how + "\n\nCopy the value below:", data);
      } else {
        alert(how);
      }
    });
    // ---- ☁ Save to this deployment (Azure Container Apps only) ----------
    //
    // THE ONE PLACE ENCA WRITES TO AZURE. Everything else in the app reads.
    // What it changes is this instance's own ENCA_BRANDING setting, on the
    // container app serving the page you are looking at, with the signed-in
    // user's own rights — nothing is stored, nothing is delegated, and a user
    // without Contributor on that resource simply gets ARM's 403 and a message
    // saying so. It is the same act as typing the value into the portal, minus
    // leaving the app to do it.
    //
    // Finding the resource: the browser knows its hostname and nothing else —
    // not the subscription, not the resource group. Azure Resource Graph
    // answers "which container app has this ingress FQDN" across every
    // subscription the user can see, in one query, which beats making them
    // paste resource ids into a form.
    if (IS_ACA) $("shAzure").addEventListener("click", async () => {
      const btn = $("shAzure");
      const was = btn.textContent;
      const fail = (m) => { btn.textContent = was; alert("Could not save to this deployment.\n\n" + m); };
      if (typeof Graph === "undefined" || !Graph.account) {
        return fail("Sign in first — saving to the deployment uses your own Azure rights, so it needs your token.");
      }
      try {
        btn.disabled = true;
        btn.textContent = "Asking for Azure access…";
        // Consent for ARM is asked here, on the click, rather than at sign-in:
        // most people never touch this button, and a permission requested at
        // the moment it is used is one somebody can actually judge.
        await Graph.ensureScopes(Graph.ARM_SCOPES);

        btn.textContent = "Finding this container app…";
        const host = (location.hostname || "").toLowerCase();
        const q = {
          query: "resources | where type =~ 'microsoft.app/containerapps' "
               + "| where tostring(properties.configuration.ingress.fqdn) =~ '" + host.replace(/'/g, "") + "' "
               + "| project id, name, resourceGroup, subscriptionId | limit 2",
        };
        const found = await Graph.apost("/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01", q);
        const rows = (found && found.data) || [];
        if (!rows.length) {
          return fail("No container app in your subscriptions has the ingress hostname " + host + ".\n\n"
            + "That usually means your account cannot see the subscription it lives in — reader on the resource is not enough to change it, but you need at least to see it. "
            + "Use 📋 Copy for container and set ENCA_BRANDING in the portal instead.");
        }
        if (rows.length > 1) {
          return fail("More than one container app claims " + host + ", which should be impossible. Refusing to guess — set ENCA_BRANDING in the portal.");
        }
        const id = rows[0].id;

        btn.textContent = "Reading the current settings…";
        // GET before PATCH, and send the WHOLE template back. A container-app
        // PATCH replaces the containers array wholesale, so patching a bare
        // env list would drop the image, the resources and every other
        // variable — including ENCA_CLIENT_ID, which would silently move the
        // deployment back to the shared registration.
        const app = await Graph.aget(id + "?api-version=2024-03-01");
        const tpl = (app.properties && app.properties.template) || {};
        const containers = (tpl.containers || []).map((c) => Object.assign({}, c));
        if (!containers.length) return fail("This container app has no container defined, which the app cannot repair.");

        // A URL in the box means the look is served rather than carried, so it
        // is the URL that goes on the container and the inline value that is
        // cleared - leaving both would be two sources of truth, and the
        // entrypoint prefers the inline one, so the URL would look ignored.
        const url = ($("shBrandUrl").value || "").trim();
        const data = JSON.stringify({ v: 1, brand: forWire(collect()) });
        let env = (containers[0].env || []).filter((e) => e && e.name !== "ENCA_BRANDING" && e.name !== "ENCA_BRANDING_URL");

        if (url) {
          if (!/^https:\/\/[^\s"']+$/i.test(url)) {
            return fail("The branding URL must be a plain https:// address.\n\nIt is fetched by the container at start, so it has to be reachable from Azure - not from your browser only.");
          }
          env.push({ name: "ENCA_BRANDING_URL", value: url });
        } else {
          // REFUSE, do not warn. Saving an oversized value here does not fail
          // at save time - ARM accepts it happily. It fails at the NEXT
          // container start, with exec dying on E2BIG before anything runs,
          // and by then the site that would have told you is the site that is
          // down.
          if (data.length > ENV_MAX) {
            return fail(
              "This look is " + Math.round(data.length / 1024) + " KB, and an environment variable cannot safely carry more than "
              + Math.round(ENV_MAX / 1024) + " KB.\n\n"
              + "Linux caps a single variable at 128 KB and hands the whole environment to exec(). Past that, the container fails to "
              + "start AT ALL - and since this page is served by that container, you would have to fix it from the Azure portal.\n\n"
              + "An embedded logo is almost always the reason, and there are now two boxes in this dialog for it:\n\n"
              + "  - \"a logo path already served here\" - point at an image in the deployment instead of embedding one. This is\n"
              + "    the smaller change and usually enough on its own.\n\n"
              + "  - \"Branding JSON URL\" - Download the file, serve it somewhere Azure can reach, and put that address in the box.\n"
              + "    Saving then sets ENCA_BRANDING_URL, which has no size limit at all.");
          }
          env.push({ name: "ENCA_BRANDING", value: data });
        }
        containers[0].env = env;

        btn.textContent = "Saving…";
        const res = await Graph.apatch(id + "?api-version=2024-03-01", {
          properties: { template: Object.assign({}, tpl, { containers }) },
        });

        btn.textContent = "Saved";
        setTimeout(() => { btn.textContent = was; btn.disabled = false; }, 2500);
        alert("Saved to this deployment.\n\n"
          + "Azure is rolling a new revision" + (res && res.accepted ? " (still in progress)" : "") + ". "
          + "It carries " + (url ? "ENCA_BRANDING_URL, so the container fetches your look on every start" : "ENCA_BRANDING")
          + ", which means this look now applies to EVERY visitor, and survives restarts and image updates — "
          + "the setting lives on the container app, not inside the container.\n\n"
          + "Give it a minute, then reload in a private window to see what other people will see. "
          + "Your own browser may still be showing the local preview from 💾 Apply, which wins over the deployment's look by design — "
          + "✖ Remove local branding clears it.");
      } catch (e) {
        btn.disabled = false;
        fail((e && e.message) || String(e));
      }
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
