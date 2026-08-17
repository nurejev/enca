// ======================================================================
// App wiring. One main screen with three views: Cards (default) · List · Matrix.
// ======================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  let policies = [];          // view models
  let tenantName = "";
  let tenantDomain = "";
  // Baseline tenants deploy the persona policies Off first; there the Gap and
  // MS Learn checks review only the persona baseline policies (always Off),
  // and skip non-persona policies.
  const BASELINE_TENANTS = ["cloudfellows.dev"];
  function isBaselineTenant() {
    const n = (tenantName || "").toLowerCase(), d = (tenantDomain || "").toLowerCase();
    return BASELINE_TENANTS.some(t => d === t || d.endsWith("." + t) || n.includes(t.split(".")[0]));
  }
  const isPersonaBaseline = (vm) => Render.caGroup(vm.name).num != null; // has a CAxxx number → persona
  function checkScope(includeDisabledChecked) {
    if (isBaselineTenant()) {
      const inScope = policies.filter(isPersonaBaseline);
      return { raws: inScope.map(p => p.raw), includeDisabled: true, baseline: true, skipped: policies.length - inScope.length };
    }
    return { raws: policies.map(p => p.raw), includeDisabled: !!includeDisabledChecked, baseline: false, skipped: 0 };
  }
  function scopeNote(scope, nOff) {
    return scope.baseline
      ? `— baseline tenant: reviewing ${scope.raws.length} persona baseline polic${scope.raws.length === 1 ? "y" : "ies"} (Off), ${scope.skipped} non-persona skipped`
      : nOff ? `(${nOff} Off in tenant)` : "(none Off)";
  }
  let tenantLogo = null;      // tenant branding logo (data URL) for neutral exports
  let selected = new Set();
  let collapsedGroups = new Set();  // collapsed persona sections in cards view
  let stateFilter = "all", query = "", viewMode = "cards", fmt = "png";
  let currentExport = [];
  let isDemo = false;
  let anReport = null, anFilter = "all", anQuery = "";   // impact analysis state
  let anPols = [], anMaps = [], anTab = "users", anPage = 0;
  let anGroups = [], anGroupSel = "";   // persona/scope group filter
  // R29 — the principals a scan is limited to, and what it actually judged
  let anNamed = [];          // [{ kind:"user"|"group", id, name }]
  let anNamedMap = new Map();  // lowercased label -> pick
  let anScopedTo = null;     // what the LAST run was scoped to, for the report
  let anType = "";                       // post-run user-type filter: "" | member | guest
  let toolMode = "document";             // action of the lemon toolbar button: document | backup
  const AN_PAGE_SIZE = 50;

  // ---------- helpers ----------
  // ---------- sticky stack: measured, not assumed ----------
  // Header (top:0), tool tab bar (under it) and each screen's toolbar stack
  // with position:sticky. Their offsets were hard-coded for a one-row desktop
  // header — on a phone the header wraps taller and every layer below it
  // overlapped the content. Measure the real heights into CSS variables and
  // let every sticky top build on those.
  function syncStickyTops() {
    const h = document.querySelector("header");
    const n = document.getElementById("toolNav");
    const hh = h ? Math.round(h.getBoundingClientRect().height) : 58;
    const navVisible = n && n.style.display !== "none" && n.offsetParent !== null;
    const nh = navVisible ? Math.round(n.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--sticky-header", hh + "px");
    document.documentElement.style.setProperty("--sticky-nav", (hh + nh) + "px");
  }
  const stickyNavTop = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sticky-nav")) || 106;
  window.addEventListener("resize", syncStickyTops);
  syncStickyTops();

  // ---------- screens + browser history ----------
  // This is a single page, so without history entries the Back button leaves
  // the site entirely — and after an MSAL popup sign-in the previous entry may
  // be the login redirect, which is why it felt like being "thrown out".
  // Each tool screen pushes a state; Back walks those before it ever leaves.
  const HISTORY_SCREENS = new Set(["screen-home", "screen-list", "screen-baseline",
    "screen-cagroups", "screen-mslearn", "screen-gapcheck", "screen-cis", "screen-exclusions", "screen-validator", "screen-whatif", "screen-compare", "screen-groupuse",
    "screen-locations", "screen-authctx", "screen-authstr", "screen-tou", "screen-recycle", "screen-rmau", "screen-audit", "screen-drift", "screen-guide", "screen-devcheck", "screen-signins", "screen-impact", "screen-protect", "screen-changelog", "screen-roadmap", "screen-help"]);
  let navSuppress = false;   // true while we are reacting to popstate

  // Inline variant of the shared fetch-progress visual: a status line that
  // reports (done, total) gets the same count-up bar dropped under the text.
  const progInline = (done, total) => total
    ? `<div class="ri-progwrap" style="width:min(420px,100%);margin:8px auto 2px"><div class="ri-progbar" style="width:${Math.min(100, done / total * 100)}%"></div></div>`
    : "";

  // Per-screen scroll memory: switching tabs used to jump to the top and lose
  // your place. The position of the screen you leave is saved and restored when
  // you come back; a screen you have not visited yet starts at the top.
  const screenScroll = {};
  let shownScreen = null;
  // Anonymous usage counting: one event per tool-screen open (GoatCounter,
  // loaded in index.html). Only the tool name and channel — never who, never
  // which tenant, never any policy data. Must never break the app.
  function trackTool(id) {
    try {
      if (!window.goatcounter || !window.goatcounter.count) return;
      const key = String(id).replace(/^screen-/, "");
      if (key === "home") return;
      const beta = typeof BRANDING !== "undefined" && location.hostname && location.hostname !== BRANDING.host;
      window.goatcounter.count({ path: (beta ? "beta/tool/" : "tool/") + key, title: key, event: true });
    } catch { /* counting is best-effort */ }
  }
  function show(id) {
    if (shownScreen && shownScreen !== id) screenScroll[shownScreen] = window.scrollY;
    if (shownScreen !== id) trackTool(id);
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
    (window.requestAnimationFrame || setTimeout)(syncStickyTops);
    if (shownScreen !== id) {
      const y = screenScroll[id] || 0;
      (window.requestAnimationFrame || setTimeout)(() => window.scrollTo(0, y));
    }
    shownScreen = id;
    if (navSuppress || !HISTORY_SCREENS.has(id)) return;
    // Replace rather than push when the screen has not changed, so clicking the
    // same tool twice does not need two Backs to leave it.
    if (history.state && history.state.screen === id) return;
    history.pushState({ screen: id }, "", location.pathname + location.search);
  }

  window.addEventListener("popstate", (e) => {
    // A modal or full-screen panel is the thing Back should close first —
    // that is what the same gesture does in every other app.
    const open = [...document.querySelectorAll(".modal-bg.open")];
    const fs = Fs.isOpen();
    if (open.length || fs) {
      open.forEach(m => m.classList.remove("open"));
      if (fs) Fs.close();
      history.pushState(history.state || { screen: "screen-home" }, "", location.pathname + location.search);
      return;
    }
    const target = (e.state && e.state.screen) || (policies.length ? "screen-home" : null);
    if (!target) return;                       // not signed in — let the browser go back
    navSuppress = true;
    try { show(target); } finally { navSuppress = false; }
  });
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  // ---------- build stamp ----------
  // Shown before sign-in so a stale deploy (or a cached tab) is obvious.
  (function showBuild() {
    if (typeof APP_BUILD === "undefined") return;
    const stamp = $("buildStamp"), foot = $("buildStampFoot");
    // Version AND release time, before sign-in. The date alone cannot separate
    // two releases on the same day, which is exactly when somebody asks whether
    // what they pushed is live.
    if (stamp) {
      stamp.textContent = APP_BUILD.stamp || `${APP_BUILD.label} · ${APP_BUILD.date}`;
      // The time reads in this browser's timezone; the tooltip keeps the UTC
      // original and names the zone, so a screenshot from another country and
      // a note in a ticket can still be reconciled.
      if (APP_BUILD.releasedUtc) {
        stamp.title = `Released ${APP_BUILD.releasedUtc}`
          + (APP_BUILD.timeZone ? ` — shown in your local time (${APP_BUILD.timeZone})` : " — shown in your local time")
          + ". Build number matches the asset version; if this is not the version you pushed, hard-refresh.";
      }
    }
    if (foot) {
      // the build number is the natural way in to "what changed"
      foot.textContent = APP_BUILD.label;
      foot.style.cursor = "pointer";
      foot.title = "See what's new";
      foot.addEventListener("click", () => { if (policies.length) openChangelog(); });
    }
    // per-tool version in the corner of each tile
    if (typeof TOOL_VERSIONS !== "undefined") {
      for (const [id, t] of Object.entries(TOOL_VERSIONS)) {
        const tile = $(id);
        if (!tile || tile.querySelector(".tool-ver")) continue;
        const tag = document.createElement("span");
        tag.className = "tool-ver";
        tag.textContent = `v${t.v}`;
        tag.title = t.note ? `${t.note}\n\nApp build ${APP_BUILD.label}` : `App build ${APP_BUILD.label}`;
        tile.appendChild(tag);
      }
    }
    // handy when someone reports a bug from a version you cannot see
    console.info(`${BRANDING.name} ${APP_BUILD.full}`);
  })();

  // ---------- branding ----------
  // Everything identity-shaped comes from js/branding.js, so a fork edits one
  // file. The markup carries this repo's own values as defaults, which keeps
  // the page readable before scripts run and makes the diff for a fork tiny.
  // ---------- branding, including per-audience overrides ----------
  // The active look: BRANDING, unless a brand override is selected — via the
  // ?brand= query (set by the /<key>/ front-door pages), a stored choice from
  // earlier in the session, or (later) the signed-in account's UPN domain.
  const BRAND_STORE = "enca-brand";
  function activeOverrideKey() {
    const q = new URLSearchParams(location.search).get("brand");
    if (q != null) {
      try { q && typeof BrandOverrides !== "undefined" && BrandOverrides.byKey(q) ? sessionStorage.setItem(BRAND_STORE, q) : sessionStorage.removeItem(BRAND_STORE); } catch {}
      return q;
    }
    try { return sessionStorage.getItem(BRAND_STORE); } catch { return null; }
  }
  function activeBrand() {
    if (typeof BRANDING === "undefined") return null;
    const o = typeof BrandOverrides !== "undefined" ? BrandOverrides.byKey(activeOverrideKey()) : null;
    return o ? Object.assign({}, BRANDING, o.brand, { colors: BRANDING.colors }) : BRANDING;
  }
  // Colour overrides land as inline :root properties; remember what we set so
  // switching back to the default look actually removes them.
  let appliedBrandColors = [];
  function applyBranding(B) {
    if (!B) return;
    // Publish before painting: Render draws policy marks from Brand.current,
    // and activeBrand() hands back a MERGED COPY rather than mutating the
    // global BRANDING — so anything reading the global directly would keep
    // showing the deployment's own logo under an override.
    Brand.setActive(B);
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    document.title = Brand.pageTitle;
    set("favicon", (el) => { if (B.favicon) el.href = B.favicon; });
    ["brandLogo", "brandLogoLogin"].forEach((id) => set(id, (el) => {
      if (B.logo) el.src = B.logo;
      el.alt = B.org || B.name;
      // Wide wordmarks (the default marks are 1:1) keep their aspect: fix the
      // height the layout expects and let the width follow.
      if (B.logoWide) { el.style.height = id === "brandLogo" ? "34px" : "56px"; el.style.width = "auto"; }
      else { el.style.height = ""; el.style.width = ""; }
    }));
    // Dark mode swaps the DEFAULT logo via a CSS content: rule; flag the root
    // when an override is active so that rule stands down (see app.css).
    const oBrand = typeof BrandOverrides !== "undefined" ? BrandOverrides.byKey(activeOverrideKey()) : null;
    const oKey = oBrand ? oBrand.key : "";
    if (oKey) document.documentElement.setAttribute("data-brand", oKey);
    else document.documentElement.removeAttribute("data-brand");
    // Override palettes ship as a stylesheet, scoped per theme — explicit
    // light/dark via data-theme, auto via prefers-color-scheme — so both
    // modes get a palette designed for them (appended last, so it wins ties).
    document.getElementById("brandOverrideCss")?.remove();
    if (oBrand) {
      const decl = (obj) => Object.entries(obj || {}).filter(([k, v]) => k.startsWith("--") && v)
        .map(([k, v]) => `${k}:${v}`).join(";");
      const both = decl(oBrand.brand.colors), L = decl(oBrand.brand.colorsLight), D = decl(oBrand.brand.colorsDark);
      const sel = `:root[data-brand="${oKey}"]`;
      const css = [
        both ? `${sel}{${both}}` : "",
        L ? `${sel}[data-theme="light"]{${L}}
@media (prefers-color-scheme: light){ ${sel}:not([data-theme="dark"]){${L}} }` : "",
        D ? `${sel}[data-theme="dark"]{${D}}
@media (prefers-color-scheme: dark){ ${sel}:not([data-theme="light"]){${D}} }` : "",
      ].filter(Boolean).join("\n");
      const tag = document.createElement("style");
      tag.id = "brandOverrideCss";
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    // "Limon-IT" → "Limon-<span>IT</span>": the tail takes the accent colour.
    set("brandOrg", (el) => {
      // A wordmark logo already carries the name — drawing it again as text
      // next to it is redundant.
      el.style.display = B.hideOrgName ? "none" : "";
      const org = B.org || "";
      const tail = B.orgSplit && org.endsWith(B.orgSplit) ? B.orgSplit : "";
      el.innerHTML = tail
        ? `${esc(org.slice(0, org.length - tail.length))}<span>${esc(tail)}</span>`
        : esc(org);
    });
    set("brandTag", (el) => { el.textContent = B.name; });
    set("brandHost", (el) => { el.textContent = B.host || ""; el.style.display = B.host ? "" : "none"; });
    set("brandLoginTitle", (el) => { el.textContent = B.loginTitle || Brand.title; });
    set("brandLoginBlurb", (el) => { if (B.loginBlurb) el.textContent = B.loginBlurb; });
    set("brandFoot", (el) => { el.textContent = [B.copyright, B.name].filter(Boolean).join(" · "); });
    set("brandOrgLink", (el) => {
      if (!B.orgUrl) { el.style.display = "none"; return; }
      el.href = B.orgUrl;
      el.textContent = B.orgUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    });
    // Colour overrides land on :root, so they beat the stylesheet without
    // anyone having to edit css/app.css.
    appliedBrandColors.forEach((k) => document.documentElement.style.removeProperty(k));
    appliedBrandColors = [];
    Object.entries(B.colors || {}).forEach(([k, v]) => {
      if (k.startsWith("--") && v) { document.documentElement.style.setProperty(k, v); appliedBrandColors.push(k); }
    });
  }
  applyBranding(activeBrand());
  // ---------- beta / preview ribbon ----------
  // The production deployment lives on BRANDING.host; any other origin
  // (the beta Pages site, a local dev server) is visibly not production, so
  // testers and screenshots can never be confused about what they're seeing.
  (function markNonProduction() {
    try {
      const prod = (BRANDING.host || "").toLowerCase();
      const here = location.hostname.toLowerCase();
      if (!prod || !here || here === prod) return;
      const r = document.createElement("div");
      r.textContent = "\u26A0 BETA \u2014 not production";
      r.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;" +
        "background:#b04a3a;color:#fff;font:800 13px/1 Inter,system-ui,sans-serif;padding:7px 22px;" +
        "border-radius:0 0 10px 10px;letter-spacing:.5px;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap";
      document.body.appendChild(r);
      document.title = "[BETA] " + document.title;
    } catch { /* cosmetic only */ }
  })();

  // ---------- home: show the first few tools per section ----------
  // Two sections carry ten and eleven tiles, which is a wall to scroll past
  // before reaching the section you wanted. Each grid shows its first four and
  // hides the rest behind a toggle. Done here rather than in the markup so a
  // new tool never has to remember to be counted.
  //
  // Hidden tiles stay in the DOM and stay clickable: every "open this tool"
  // path in the app (tabs, the + menu, roadmap links, the command palette)
  // works by calling .click() on the tile, and a display:none element still
  // takes a synthetic click. Collapsing the grid must not amputate navigation.
  const HOME_VISIBLE = 4;
  const HOME_KEY = "enca-home-expanded";
  // The expanded/collapsed choice is remembered, but only WITHIN A BUILD. A
  // release that adds or changes tools has changed what the section contains,
  // so "show me all eleven" — decided against a different eleven, possibly
  // months ago — is no longer an answer to the question being asked. Left to
  // persist, it also silently defeats the point of putting what changed at the
  // top of a collapsed section: an expanded section has no top.
  //
  // The old format was a bare array. It is read once and discarded rather than
  // migrated: it carries no build, so there is no honest way to decide whether
  // it still applies, and one collapsed visit costs a click.
  const homeExpanded = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
      if (raw && !Array.isArray(raw) && raw.build === APP_BUILD.build) return new Set(raw.keys || []);
    } catch { /* unreadable or private mode */ }
    return new Set();
  })();
  const homeSave = () => {
    try { localStorage.setItem(HOME_KEY, JSON.stringify({ build: APP_BUILD.build, keys: [...homeExpanded] })); }
    catch { /* private mode */ }
  };

  function initHomeSections() {
    const grids = [...document.querySelectorAll("#screen-home .tools")];
    grids.forEach((grid, gi) => {
      const tiles = [...grid.children].filter((el) => el.classList.contains("tool"));
      if (tiles.length <= HOME_VISIBLE) return;               // nothing worth hiding
      // A section is keyed by the heading above it, not its index, so adding a
      // section later does not silently re-collapse a different one.
      const head = grid.previousElementSibling;
      const key = (head && head.querySelector("h3") ? head.querySelector("h3").textContent : `sec${gi}`).trim();
      const btn = document.createElement("button");
      btn.className = "btn home-more";
      // A tool that just shipped or just changed should not be behind the fold.
      // NEW, BETA and UPDATED tiles therefore claim the visible slots FIRST —
      // but they do not enlarge the section, because when a release touches six
      // tools that stopped the section collapsing at all. Order never changes;
      // only which tiles are shown.
      const flagged = (t) => !!t.querySelector(".tag.new, .tag.upd");
      // When more tiles are flagged than there are slots, DOM order decided who
      // got one — so a tool changed in the current build lost its place to a
      // BETA tag that had been sitting there for weeks, which is precisely
      // backwards. Rank the flagged by RECENCY instead, read from the changelog:
      // the build number of the newest entry naming that tool. The changelog
      // records tools by their display name, which is the tile's heading, so the
      // two are matched on that. A tool the changelog has never named sorts last
      // among the flagged rather than first — no date is not a recent date.
      const toolName = (t) => {
        const h = t.querySelector("h3");
        if (!h) return "";
        return [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      };
      const lastBuild = (() => {
        const cache = new Map();
        return (t) => {
          const name = toolName(t);
          if (!name) return -1;
          if (cache.has(name)) return cache.get(name);
          let best = -1;
          try {
            for (const entry of (typeof CHANGELOG !== "undefined" ? CHANGELOG : [])) {
              if ((entry.items || []).some((i) => String(i.tool || "").toLowerCase() === name.toLowerCase())) {
                best = Math.max(best, +entry.build || -1);
              }
            }
          } catch { /* changelog optional */ }
          cache.set(name, best);
          return best;
        };
      })();
      // most recently changed first; ties keep their authored order
      const byRecency = tiles.filter(flagged)
        .map((t, i) => ({ t, i, b: lastBuild(t) }))
        .sort((a, b) => b.b - a.b || a.i - b.i)
        .map((x) => x.t);
      const paint = () => {
        const open = homeExpanded.has(key);
        // The visible budget is HOME_VISIBLE in total. Flagged tiles claim those
        // slots FIRST — a release must be reachable without expanding — but they
        // no longer sit on top of the budget. With six flagged tiles in a section
        // that meant nothing collapsed at all, which is the opposite of the point.
        // Anything flagged that still does not fit is counted on the button, so it
        // is announced rather than silently buried.
        const keep = new Set();
        for (const t of byRecency) { if (keep.size >= HOME_VISIBLE) break; keep.add(t); }
        for (const t of tiles) { if (keep.size >= HOME_VISIBLE) break; keep.add(t); }
        const hidden = [];
        tiles.forEach((t) => {
          const show = open || keep.has(t);
          t.style.display = show ? "" : "none";
          // COLLAPSED: what changed goes first. A flagged tile claimed a visible
          // slot before this but kept its page position, so a flagged tile
          // sitting ninth was on screen and still read as an afterthought.
          // Order is a CSS property here, not a DOM move — nothing is
          // reparented, so expanding restores the authored order exactly, and
          // the grid's grouping (which is meaningful) survives untouched.
          // Newest first among the flagged, so the tile you are looking for is
          // the leftmost one rather than somewhere among the badges.
          const rank = byRecency.indexOf(t);
          t.style.order = open ? "" : (rank >= 0 ? String(rank - byRecency.length) : "");
          if (!show) hidden.push(t);
        });
        const buried = hidden.filter(flagged).length;
        btn.style.display = hidden.length || open ? "" : "none";
        btn.textContent = open
          ? "▲ Show fewer"
          : `▼ Show ${hidden.length} more${buried ? ` · ${buried} new, beta or updated` : ""}`;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      };
      btn.addEventListener("click", () => {
        homeExpanded.has(key) ? homeExpanded.delete(key) : homeExpanded.add(key);
        homeSave(); paint();
      });
      grid.insertAdjacentElement("afterend", btn);            // outside the grid, not a grid cell
      paint();
    });
  }
  initHomeSections();

  // How many tools there are, counted from the tiles themselves rather than
  // written down — a hand-maintained number is wrong one release after it is
  // typed, and this one sits next to the question it answers.
  (function homeToolCount() {
    const el = $("homeCount");
    if (!el) return;
    const tiles = [...document.querySelectorAll("#screen-home .tool")];
    // The Help section is navigation, not tooling; counting it would inflate
    // the number with the three cards that explain the other ones.
    const isHelp = (t) => {
      const grid = t.closest(".tools");
      const head = grid && grid.previousElementSibling;
      return !!(head && /help/i.test(head.textContent || ""));
    };
    const tools = tiles.filter((t) => !isHelp(t));
    const beta = tools.filter((t) => t.querySelector(".tag.new")).length;
    el.textContent = `${tools.length} tools`;
    el.title = beta
      ? `${tools.length} tools on this build, ${beta} of them new or in beta`
      : `${tools.length} tools on this build`;
  })();

  // ---------- promotion queue (beta channel only) ----------
  // What is on this channel and not yet in production, numbered so it can be
  // referred to out loud: "push number 3 to main". Rendered only on a
  // non-production host — the same test the BETA ribbon uses — so a customer
  // on the production site never sees a list of things they do not have.
  (function renderPromotionQueue() {
    try {
      const host = (location.hostname || "").toLowerCase();
      const prod = ((typeof BRANDING !== "undefined" && BRANDING.host) || "").toLowerCase();
      if (!prod || host === prod) return;                 // production: stay hidden
      if (typeof PROMOTE === "undefined") return;
      const el = document.getElementById("helpPromote");
      if (!el) return;

      const RISK = {
        high:   { label: "high",   cls: "block", note: "a real problem in production until it lands" },
        medium: { label: "medium", cls: "new",   note: "missing capability, nothing broken" },
        low:    { label: "low",    cls: "",      note: "convenience or documentation" },
      };
      const esc2 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const items = (PROMOTE.items || []).slice().sort((a, b) => a.n - b.n);

      el.innerHTML = `
        <h4>🚚 Waiting for production <span class="tag new">BETA CHANNEL</span></h4>
        <p>Production is <b>${esc2(PROMOTE.productionBuild)}</b>; this site is <b>${esc2(APP_BUILD.label)}</b>.
          <b>This is the gap, and only the gap</b> — what exists here and not there. Nothing that has already
          shipped appears below; for that, read <b>📋 What's new</b>. Each row is one promotable <b>change to the
          tools</b> with a <b>stable number</b>, so <i>“push number 3 to main”</i> means exactly one thing.
          Roadmap cards, changelog entries and this table itself are not listed: they describe the work rather
          than being it, and they travel with whatever promotion happens next.</p>
        <div class="cg-tablewrap"><table class="cg-table">
          <thead><tr><th style="width:44px">#</th><th>Change</th><th style="width:90px">Risk</th><th style="width:120px">Beta builds</th></tr></thead>
          <tbody>${items.map((it) => {
            const r = RISK[it.risk] || RISK.low;
            return `<tr>
              <td><b style="font-size:15px">${it.n}</b></td>
              <td><b>${esc2(it.title)}</b>
                <div class="mini muted">${(it.tools || []).join(" · ")}</div>
                <div class="mini" style="margin-top:4px">${esc2(it.what)}</div>
                <div class="mini" style="margin-top:4px;color:var(--report)"><b>Why:</b> ${esc2(it.why)}</div>
                <div class="mini muted" style="margin-top:4px">${(it.files || []).map((f) => `<code>${esc2(f)}</code>`).join(" ")}</div></td>
              <td><span class="tag ${r.cls}">${r.label}</span><div class="mini muted" style="margin-top:4px">${r.note}</div></td>
              <td class="mini">${(it.builds || []).join(", ")}</td>
            </tr>`;
          }).join("")}</tbody></table></div>
        ${(PROMOTE.staying || []).length ? `
          <h4 style="margin-top:18px">Staying on this channel</h4>
          <p class="mini muted" style="margin:0 0 6px">Also part of the gap, but permanently: these exist here and are not going to production.</p>
          <ul>${PROMOTE.staying.map((sv) => `<li><b>${esc2(sv.title)}</b> — ${esc2(sv.why)}</li>`).join("")}</ul>` : ""}
        <p class="help-x">This list is written by hand — the app is static files in a browser and cannot read git or diff two branches. It is maintained alongside <b>📋 What's new</b>; if an entry looks stale, trust the changelog and the build numbers over this table.</p>`;
      el.style.display = "";
    } catch (e) { console.warn("promotion queue not rendered:", e.message); }
  })();

  // ---------- theme: Auto (device) → Light → Dark ----------
  // Auto leaves data-theme off so the CSS prefers-color-scheme block decides;
  // the logo swaps to the dark-background variant through a CSS content: rule.
  const THEMES = [
    { id: "auto", ico: "🌗", label: "Auto (follows your device)" },
    { id: "light", ico: "☀️", label: "Light" },
    { id: "dark", ico: "🌙", label: "Dark" },
  ];
  function applyTheme(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    if (t.id === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t.id);
    const btn = $("themeBtn");
    if (btn) {
      btn.querySelector(".tico").textContent = t.ico;
      btn.title = `Theme: ${t.label} — click to change`;
    }
    try { localStorage.setItem("enca-theme", t.id); } catch { /* private mode */ }
    return t.id;
  }
  let theme = (() => { try { return localStorage.getItem("enca-theme") || "auto"; } catch { return "auto"; } })();
  applyTheme(theme);
  $("themeBtn").addEventListener("click", () => {
    const i = THEMES.findIndex((x) => x.id === theme);
    theme = applyTheme(THEMES[(i + 1) % THEMES.length].id);
    toast(`Theme: <span>${THEMES.find((x) => x.id === theme).label}</span>`);
  });

  function toast(msg) {
    const t = $("toast"); t.innerHTML = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
  }
  // Download a text blob as "<base>-<tenant>-<yyyy-mm-dd-hhmmss>.<ext>".
  function downloadText(base, ext, mime, text) {
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    a.download = `${base}-${(tenantName || "tenant").replace(/[^\w-]+/g, "-")}-${stamp}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  // ---------- consent, up front ----------
  // A write run may need scopes the session has not consented yet. Asking for
  // them mid-run means the popup is raised several awaits after the click, and
  // Edge/Safari have already withdrawn the gesture by then — the window is
  // blocked and the run dies half-way. So every write handler calls this FIRST,
  // while the click is still fresh; after this returns true, the rest of the
  // run is pure Graph calls with a token already in hand.
  let pendingScopes = null;
  function preConsent(scopes) {
    if (isDemo || Graph.hasScopes(scopes)) return Promise.resolve(true);
    return Graph.ensureScopes(scopes).then(() => true).catch((e) => {
      if (Graph.isPopupBlocked(e)) { askPopup(scopes, e); return false; }
      if (/user_cancelled|cancell?ed/i.test(e.errorCode || e.message || "")) {
        toast("Permission request <span>cancelled</span> — nothing was changed");
        return false;
      }
      toast(`Could not get permission: <span>${esc(e.message || e)}</span>`);
      return false;
    });
  }
  function askPopup(scopes, err) {
    pendingScopes = scopes;
    $("popupWhy").textContent = `Needed: ${scopes.join(", ")}.`;
    console.warn("Popup blocked:", err);
    $("popupModal").classList.add("open");
  }
  $("popupCancel").addEventListener("click", () => { pendingScopes = null; $("popupModal").classList.remove("open"); });
  $("popupGo").addEventListener("click", async () => {
    if (!pendingScopes) return;
    const btn = $("popupGo"); btn.disabled = true;
    try {
      await Graph.ensureScopes(pendingScopes);
      $("popupModal").classList.remove("open");
      toast("Permissions <span>granted</span> — run the action again");
    } catch (e) {
      toast(Graph.isPopupBlocked(e)
        ? "Still blocked — allow popups for this site in the address bar"
        : `Failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; }
  });

  // ---------- Markdown report viewer ----------
  // A deliberately small renderer for the subset the reports actually emit:
  // headings, tables, lists, bold, inline code, rules. Everything is escaped
  // first and inline markup applied to the escaped text, so a policy name
  // containing "<" can never become markup.
  function mdToHtml(md) {
    const inline = (s) => esc(s)
      // [label](#tool:toolGroupUse) — an in-app jump, resolved by the click
      // delegate below. Downloaded Markdown keeps a readable link either way.
      .replace(/\[([^\]]+)\]\(#tool:([A-Za-z]+)\)/g,
        (m, label, tool) => `<a href="#" class="md-tool" data-tool="${tool}">${label}</a>`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, "$1<i>$2</i>")
      .replace(/❌/g, '<span class="md-bad">❌</span>')
      .replace(/✅|✓/g, (m) => `<span class="md-ok">${m}</span>`);
    const lines = String(md || "").split("\n");
    const out = [];
    let list = null, table = null;
    const closeList = () => { if (list) { out.push(list === "ol" ? "</ol>" : "</ul>"); list = null; } };
    const closeTable = () => { if (table) { out.push("</tbody></table>"); table = null; } };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const row = /^\s*\|(.+)\|\s*$/.exec(ln);
      if (row) {
        const cells = row[1].split("|").map((c) => c.trim());
        // the |---|---| separator only tells us the header ended
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        if (!table) { out.push(`<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`); table = true; continue; }
        out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        continue;
      }
      closeTable();
      const h = /^(#{1,4})\s+(.*)$/.exec(ln);
      if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { closeList(); out.push("<hr>"); continue; }
      const li = /^\s*[-*]\s+(.*)$/.exec(ln);
      if (li) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(li[1])}</li>`); continue; }
      const oli = /^\s*\d+\.\s+(.*)$/.exec(ln);
      if (oli) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(oli[1])}</li>`); continue; }
      closeList();
      if (ln.trim()) out.push(`<p>${inline(ln)}</p>`);
    }
    closeList(); closeTable();
    return out.join("\n");
  }

  // Show a report on screen AND keep it downloadable. `base`/`ext` feed
  // downloadText, so the file name matches what the tool would have written.
  let rptCurrent = null;
  function showReport(title, base, md, ext) {
    rptCurrent = { base, md, ext: ext || "md" };
    $("rptTitle").textContent = title;
    $("rptBody").innerHTML = mdToHtml(md);
    $("rptBody").scrollTop = 0;
    $("reportModal").classList.add("open");
  }
  $("rptClose").addEventListener("click", () => $("reportModal").classList.remove("open"));

  // ---------- security documentation, one click away ----------
  // SECURITY.md deploys with the site, so it is fetched same-origin and
  // rendered in the report viewer — readable BEFORE signing in (login-screen
  // link) and any time after (footer link on every screen).
  // A repo Markdown file is hard-wrapped at ~76 columns; the line-based
  // renderer would show every source line as its own paragraph. Join
  // continuation lines into their paragraph or list item first — anything
  // that starts a block (blank, heading, list, table, rule, quote) stays.
  function mdUnwrap(md) {
    const startsBlock = (l) => /^\s*$/.test(l) || /^#{1,6}\s/.test(l) || /^\s*[-*]\s/.test(l)
      || /^\s*\d+\.\s/.test(l) || /^\s*\|/.test(l) || /^\s*(-{3,}|\*{3,})\s*$/.test(l) || /^\s*>/.test(l);
    const out = [];
    for (const l of String(md || "").split("\n")) {
      const prev = out.length ? out[out.length - 1] : null;
      if (prev !== null && prev.trim() && !startsBlock(l)) out[out.length - 1] = prev.replace(/\s+$/, "") + " " + l.trim();
      else out.push(l);
    }
    return out.join("\n");
  }
  async function showSecurityDoc() {
    try {
      const r = await fetch("SECURITY.md?v=" + APP_BUILD.build);
      if (!r.ok) throw new Error("HTTP " + r.status);
      showReport("🔒 Security & risk documentation", "ENCA-Security", mdUnwrap(await r.text()));
    } catch (e) {
      console.error("SECURITY.md load failed:", e);
      toast(`Could not load the security documentation: <span>${esc(e.message || e)}</span>`);
    }
  }
  // The single-tenant setup guide, rendered the same way as the security doc so
  // it is readable without leaving the app (or trusting a link to GitHub).
  async function showSingleTenantDoc() {
    try {
      const r = await fetch("SINGLE-TENANT.md?v=" + APP_BUILD.build);
      if (!r.ok) throw new Error("HTTP " + r.status);
      showReport("🏢 Your own single-tenant app registration", "ENCA-SingleTenant", mdUnwrap(await r.text()));
    } catch (e) {
      console.error("SINGLE-TENANT.md load failed:", e);
      toast(`Could not load the setup guide: <span>${esc(e.message || e)}</span>`);
    }
  }
  // DELEGATED, not bound once at load. These anchors live on roadmap cards,
  // and rmAgeShipped() moves a card into 🗄 Shipped as it ages out of "Now" —
  // so the element a load-time binding captured is not necessarily the one the
  // reader clicks, and if $(id) was null at script time nothing was bound at
  // all. That is how 📖 Read the setup manual became a link that did nothing.
  // Delegation has no such window: the handler is on the document and matches
  // by id whenever and wherever the anchor ends up.
  //
  // The anchors also carry a REAL href now. href="#" meant a failure in this
  // script left a link that jumped to the top of the page; a genuine path
  // degrades to the file itself, which is the thing the link promises.
  const DOC_LINKS = {
    stLink: showSingleTenantDoc,
    secLinkLogin: showSecurityDoc,
    secLinkFoot: showSecurityDoc,
    rmSecLink: showSecurityDoc,
    rmSecLink2: showSecurityDoc,
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[id]"); if (!a) return;
    const open = DOC_LINKS[a.id]; if (!open) return;
    e.preventDefault();
    open();
  });

  // An in-app link inside any rendered report or confirmation: close whatever
  // is open and land on the tool, rather than telling someone to go find it.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.md-tool"); if (!a) return;
    e.preventDefault();
    document.querySelectorAll(".modal-bg.open").forEach((m) => m.classList.remove("open"));
    const tile = $(a.dataset.tool);
    if (tile) tile.click(); else toast("That tool is not available here");
  });

  // ---------- What's new / changelog ----------
  // The overlay appears once per release: we remember the build the person
  // acknowledged and show everything newer than that. Anyone arriving for the
  // first time just gets the newest release, not the whole history.
  // The seen-marker is PER CHANNEL. Both channels used one key while their
  // build numbers come from two incompatible series — production counts 259,
  // beta counts 25040 — so `seen >= latest` compared 25040 with 259, returned
  // true, and production stopped showing release notes on that browser. Not for
  // one build: permanently, for every future release, because a production
  // number can never overtake a beta one.
  //
  // A value from the other series reads as "not seen" rather than being
  // trusted, so a browser already stuck on the wrong number heals itself on the
  // next visit instead of needing its storage cleared.
  const CL_BETA_SERIES = (typeof APP_BUILD !== "undefined" ? APP_BUILD.build : 0) >= 10000;
  const CL_KEY = CL_BETA_SERIES ? "enca-seen-build-beta" : "enca-seen-build";
  const clSeen = () => {
    try {
      let v = +localStorage.getItem(CL_KEY) || 0;
      // Beta moved to its own key. Adopt the old shared one when it happens to
      // hold a beta number, so an existing beta user is not shown the whole
      // "here is everything" note again for a release they have already read.
      if (!v && CL_BETA_SERIES) {
        const legacy = +localStorage.getItem("enca-seen-build") || 0;
        if (legacy >= 10000) v = legacy;
      }
      return (v >= 10000) === CL_BETA_SERIES ? v : 0;
    } catch { return 0; }
  };
  const clMarkSeen = () => { try { localStorage.setItem(CL_KEY, String(CHANGELOG_LATEST)); } catch { /* private mode */ } };
  const CL_KIND = { new: "New", improved: "Improved", fixed: "Fixed" };

  function clEntries(rel) {
    const order = { new: 0, improved: 1, fixed: 2 };
    return rel.items.slice().sort((a, b) => order[a.kind] - order[b.kind])
      .map((i) => `<li class="cl-i">
        <span class="cl-k ${i.kind}">${CL_KIND[i.kind]}</span>
        <span><b>${esc(i.tool)}</b> — ${esc(i.text)}</span></li>`).join("");
  }
  function clRelease(rel) {
    return `<div class="cl-rel">
      <div class="cl-h"><b>${esc(rel.title)}</b>
        <span class="mini muted">build ${rel.build} · ${esc(rel.date)}</span></div>
      <ul class="cl-list">${clEntries(rel)}</ul>
    </div>`;
  }
  function openChangelog() {
    crumb("📋 What's new");
    show("screen-changelog");
    $("clBody").innerHTML = clVisible().map(clRelease).join("")
      || '<p class="mini">No changelog entries yet.</p>';
    clMarkSeen();
  }
  $("toolChangelog").addEventListener("click", openChangelog);
  // Shipped items age out of "Now" on their own. Hand-moving them means the
  // roadmap is only as current as the last time somebody remembered, and the
  // information needed — which build it shipped in, and which build this is —
  // is already on the page.
  //
  // The two channels count differently (production 269, beta 25070), and the
  // same file travels between them, so a card tagged on one channel would be
  // compared against the other's numbering and age wrongly. Ageing is therefore
  // only applied when both numbers are from the SAME series; otherwise the card
  // stays where it is, which is the honest answer to "I cannot tell".
  const RM_AGE = 15;
  let rmAged = false;
  function rmAgeShipped() {
    if (rmAged) return;                       // the DOM move is permanent
    const host = $("rmShippedCards"), box = $("rmShipped");
    if (!host || !box) return;
    const here = APP_BUILD.build, beta = here >= 10000;
    const moved = [];
    for (const card of [...document.querySelectorAll("#screen-roadmap [data-shipped]")]) {
      const b = +card.dataset.shipped;
      if (!b || (b >= 10000) !== beta) continue;   // a different channel's numbering
      if (here - b < RM_AGE) continue;
      moved.push([b, card]);
    }
    // Newest first: the most recently retired is the most likely to be looked up.
    moved.sort((a, b) => b[0] - a[0]).forEach(([, c]) => host.appendChild(c));
    box.style.display = moved.length ? "" : "none";
    rmAged = true;
  }
  function openRoadmap() { crumb("🗺 Roadmap"); show("screen-roadmap"); rmAgeShipped(); }
  $("toolRoadmap").addEventListener("click", openRoadmap);

  // Called once the tenant has loaded, so it never covers the sign-in screen.
  // A release can carry onlyBrand: "<key>" — it then exists only for sessions
  // wearing that brand override (sign-in match or ?brand=). Everyone else's
  // changelog and What's-new never mention it.
  const clVisible = () => (typeof CHANGELOG === "undefined" ? [] : CHANGELOG)
    .filter((r) => !r.onlyBrand || r.onlyBrand === activeOverrideKey());
  function maybeShowWhatsNew() {
    if (typeof CHANGELOG === "undefined" || !CHANGELOG.length) return;
    const seen = clSeen();
    if (seen >= CHANGELOG_LATEST) return;
    // First visit (no key — which is also everyone's state right after the move
    // to enca.limon-it.nl, since localStorage is per-origin): show only the
    // newest release, not the entire history.
    const vis = clVisible();
    if (!vis.length) return;
    const fresh = seen ? vis.filter((r) => r.build > seen) : [];
    const rels = fresh.length ? fresh : [vis[0]];
    const n = rels.reduce((s, r) => s + r.items.length, 0);
    $("newSub").innerHTML = seen
      ? `${n} change${n === 1 ? "" : "s"} since you were last here (build ${seen} → ${CHANGELOG_LATEST}).`
      : `Here's what the toolset can do as of build ${CHANGELOG_LATEST}.`;
    $("newBody").innerHTML = rels.map(clRelease).join("");
    $("newModal").classList.add("open");
  }
  function closeWhatsNew() { clMarkSeen(); $("newModal").classList.remove("open"); }
  $("newClose").addEventListener("click", closeWhatsNew);
  $("newModal").addEventListener("click", (e) => { if (e.target.id === "newModal") closeWhatsNew(); });
  $("newFull").addEventListener("click", () => { closeWhatsNew(); openChangelog(); });

  // ---------- Help (a full tool: own screen + tab) ----------
  // Table of contents is built once from the section headings so it can never
  // drift from the sections themselves.
  let helpTocBuilt = false;
  function buildHelpToc() {
    if (helpTocBuilt) return;
    // The promotion queue renders TWO h4s into its own .help-sec — its title and
    // "Staying on this channel" — and both were becoming contents entries, one
    // of them for a subsection rather than a section. It is also injected after
    // this runs on some paths, so what the list contains depended on timing.
    // Excluded outright: the contents list is of TOOLS, and the queue is a
    // beta-channel note about the gap between builds.
    const secs = [...document.querySelectorAll("#screen-help .help-sec > h4")]
      .filter((h) => !h.closest("#helpPromote"));
    secs.forEach((h, i) => { h.id = h.id || `help-sec-${i}`; });
    $("helpToc").innerHTML = secs.map((h) => `<a href="#${h.id}">${h.textContent.replace(/\s+(BETA|NEW|writes to tenant)\b/gi, "").trim()}</a>`).join("");
    // Scroll-spy: highlight the chip for the section currently in view, and keep
    // that chip scrolled into view within the sticky ToC so it stays reachable.
    const links = new Map([...$("helpToc").querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]));
    const seen = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
      const top = secs.find((h) => seen.has(h.id)) || secs[0];
      links.forEach((a) => a.classList.remove("active"));
      const a = top && links.get(top.id);
      if (a) a.classList.add("active");
    }, { rootMargin: `-${stickyNavTop() + $("helpToc").offsetHeight + 8}px 0px -60% 0px`, threshold: 0 });
    secs.forEach((h) => spy.observe(h));
    helpTocBuilt = true;
  }
  function openHelp() {
    buildHelpToc();
    crumb("❓ Help");
    show("screen-help");
  }
  $("toolHelp").addEventListener("click", openHelp);
  // ToC links scroll to the section without leaving a #hash in the address bar
  $("helpToc").addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    e.preventDefault();
    const t = document.getElementById(a.getAttribute("href").slice(1));
    if (!t) return;
    // The ToC is sticky and wraps to more rows the more tools there are, so a
    // fixed scroll offset lands the heading underneath it once the chips no
    // longer fit two rows. Measure the actual obstruction instead: the ToC's
    // sticky top plus however tall it currently is.
    const off = stickyNavTop() + $("helpToc").offsetHeight + 8;
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
  });
  $("rptDownload").addEventListener("click", () => {
    if (rptCurrent) downloadText(rptCurrent.base, rptCurrent.ext, "text/markdown", rptCurrent.md);
  });
  $("rptCopy").addEventListener("click", async () => {
    if (!rptCurrent) return;
    try { await navigator.clipboard.writeText(rptCurrent.md); toast("Markdown <span>copied</span>"); }
    catch { toast("Could not copy — use Download instead"); }
  });

  // Search matches the policy name AND its persona label, so "guest" finds the
  // Guest admins group even though those policies are named "G_Admin", and
  // "service account" finds CA600s named "MSA". Without this, searching by the
  // persona you see on screen silently misses policies named by convention.
  function policyHaystack(p) {
    let label = "";
    try { label = Render.caGroup(p.name).label || ""; } catch { /* unnumbered */ }
    return `${p.name} ${label}`.toLowerCase();
  }
  function visible() {
    return policies.filter(p => (stateFilter === "all" || p.state === stateFilter)
      && (!query || policyHaystack(p).includes(query)));
  }

  // ---------- views ----------
  function refreshViews() {
    const vis = visible();
    $("stateChips").innerHTML = Render.stateChips(policies, stateFilter);
    $("cardsView").innerHTML = Render.groupedCards(vis, selected, collapsedGroups)
      || '<p class="mini" style="padding:20px">No policies match the current filter.</p>';
    document.querySelector("#ptable tbody").innerHTML = Render.listRows(policies, selected, stateFilter, query, collapsedGroups);
    $("mtable").innerHTML = Render.matrix(vis.length ? vis : policies);
    // group checkboxes: indeterminate when only part of the group is selected
    document.querySelectorAll("[data-gsel]").forEach(cb => {
      const ids = groupIds(cb.dataset.gsel);
      const n = ids.filter(id => selected.has(id)).length;
      cb.indeterminate = n > 0 && n < ids.length;
    });
    setView(viewMode);
    updateSelbar();
    syncCollapseAllBtn();
    syncHkBtn();
  }
  function groupIds(key) {
    return visible().filter(p => String(Render.caGroup(p.name).key) === String(key)).map(p => p.id);
  }
  function toggleGroupSel(key, on) {
    groupIds(key).forEach(id => on ? selected.add(id) : selected.delete(id));
    refreshViews();
  }
  function setView(v) {
    viewMode = v;
    $("cardsView").style.display = v === "cards" ? "grid" : "none";
    $("listView").style.display = v === "list" ? "block" : "none";
    $("matrixView").style.display = v === "matrix" ? "block" : "none";
    $("analyzeView").style.display = v === "analyze" ? "block" : "none";
    $("plFull").style.display = v === "matrix" ? "" : "none";
    // show a hint when the matrix is wider than the screen (horizontal scroll needed)
    if (v === "matrix") {
      (window.requestAnimationFrame || setTimeout)(() => {
        const mv = $("matrixView");
        $("matrixHint").style.display = mv.scrollWidth > mv.clientWidth + 4 ? "block" : "none";
      });
    } else { $("matrixHint").style.display = "none"; }
    syncCollapseAllBtn();
    ["viewCards", "viewList", "viewMatrix"].forEach(id => $(id).classList.remove("active"));
    if (v !== "analyze") $(v === "cards" ? "viewCards" : v === "list" ? "viewList" : "viewMatrix").classList.add("active");
    // Only one action can be the current one: entering the analyze view takes
    // the highlight off whichever tool mode brought you here.
    $("selActAnalyze").classList.toggle("on", v === "analyze");
    if (v === "analyze") SEL_ACTIONS.forEach(([id]) => $(id).classList.remove("on"));
    // Gap analyse lives inside this screen but has its own toolbar and its own
    // subject (users, not policies) — the policy search, state chips, select-all
    // and the sticky green action bar don't apply and would sit over its output.
    const isAn = v === "analyze";
    const pSearch = document.querySelector("#screen-list .toolbar .search");
    if (pSearch) pSearch.style.display = isAn ? "none" : "";
    $("stateChips").style.display = isAn ? "none" : "";
    $("selAllWrap").style.display = isAn ? "none" : "";
    updateSelbar();
  }
  // Pin the action bar just below the toolbar. The toolbar wraps to two or
  // three rows depending on width and which controls are showing, so a fixed
  // offset ends up overlapping it — measure instead.
  function syncSelbarTop() {
    const tb = document.querySelector("#screen-list .toolbar");
    if (!tb) return;
    const h = Math.round(tb.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--selbar-top", (stickyNavTop() + h) + "px");
  }
  window.addEventListener("resize", syncSelbarTop);

  function updateSelbar() {
    const n = selected.size;
    (window.requestAnimationFrame || setTimeout)(syncSelbarTop);
    // The bar is the screen's action row, so it stays up as long as there are
    // policies to act on — an empty selection means "all visible", not "nothing".
    $("selbar").classList.toggle("visible", policies.length > 0 && viewMode !== "analyze");
    // "Select all" reflects the visible (filtered) set: checked when all of it
    // is selected, indeterminate while only part of it is.
    const vis = visible(), picked = vis.filter(p => selected.has(p.id)).length;
    const all = $("selAllTop"), listAll = $("selAll");
    [all, listAll].forEach(cb => {
      if (!cb) return;
      cb.checked = vis.length > 0 && picked === vis.length;
      cb.indeterminate = picked > 0 && picked < vis.length;
      cb.disabled = vis.length === 0;
    });
    $("selAllLabel").textContent = picked && picked === vis.length
      ? `All ${vis.length} selected`
      : picked ? `Select all (${picked}/${vis.length})` : `Select all (${vis.length})`;
    $("refreshBtn").disabled = policies.length === 0;

    // Writing to the tenant always needs an explicit selection — "everything
    // visible" is far too blunt a default for changing groups or policy state.
    // Assign groups stays available with an empty selection: its first step can
    // scope to the whole tenant, which is the point of a blanket exclusion.
    $("selActAssign").disabled = policies.length === 0;
    $("selActState").disabled = n === 0;
    $("selActDelete").disabled = n === 0;
    $("selLead").innerHTML = n
      ? `<b id="selCount">${n}</b> ${n === 1 ? "policy" : "policies"} selected`
      : `<b id="selCount">${vis.length}</b> ${vis.length === 1 ? "policy" : "policies"} in view`;
    $("selHint").textContent = !n
      ? "Nothing selected — Documentation, Backup and Gap analyse use everything in view"
      : n === 1
        ? "One policy exports as PNG, multiple as a combined PDF"
        : "Multiple selected — will export as a combined PDF";
  }
  // #10: warn when directory lookups partially failed and raw GUIDs remain
  function warnUnresolved() {
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    let n = 0;
    for (const p of policies) {
      [...p.users.inc, ...p.users.exc, ...p.apps.inc, ...p.apps.exc, ...p.net.inc, ...p.net.exc, ...p.grant.controls]
        .forEach(v => { if (guid.test(String(v))) n++; });
    }
    if (n) setTimeout(() => toast(`⚠ ${n} object name(s) could not be resolved — exports will show raw IDs for these`), 3500);
  }

  function showDetail(id) {
    const p = policies.find(x => x.id === id); if (!p) return;
    // The what-if flow is opt-in (a button under the card) so the detail stays
    // compact until you actually want to trace what the policy does.
    $("detailBody").innerHTML = Render.card(p, tenantName)
      + `<div class="pcard-actions">
           <button class="btn" data-wf="${p.id}">⑃ What-if flow</button>
           <span class="pa-sep"></span>
           <button class="btn" data-pact="document">📄 Documentation</button>
           <button class="btn" data-pact="backup">🗄 Backup</button>
           <button class="btn" data-pact="assign">👥 Assign groups or roles</button>
           <button class="btn" data-pact="state">🎚 Policy state</button>
         </div>
         <div class="wf-panel" id="wfPanel" style="display:none"></div>`;
    detailPolicyId = p.id;
    $("detailModal").classList.add("open");
  }
  let detailPolicyId = null;

  // Persona apply flow — a popout of what CA does to a sign-in for this persona,
  // including the Global policies that apply to everyone.
  function openPersonaFlow(key) {
    const label = (Render.caGroup(`CA${String(key).padStart(3, "0")}`).label || "").replace(/\s*\(.*\)$/, "") || "this persona";
    $("flowTitle").textContent = `⑃ Apply flow — ${label}`;
    $("flowBody").innerHTML = WhatIf.personaFlow(key, policies, label);
    $("flowModal").classList.add("open");
  }
  $("flowClose").addEventListener("click", () => $("flowModal").classList.remove("open"));
  $("flowBody").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link");
    if (pl) { $("flowModal").classList.remove("open"); openPolicyByName(pl.dataset.pol); }
  });

  // reveal / hide the per-policy flow on demand
  $("detailBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wf]");
    if (b) {
      const panel = $("wfPanel"); const p = policies.find(x => x.id === b.dataset.wf); if (!p || !panel) return;
      if (panel.style.display === "none") { panel.innerHTML = WhatIf.policyFlow(p); panel.style.display = "block"; b.textContent = "⑃ Hide what-if flow"; }
      else { panel.style.display = "none"; b.textContent = "⑃ What-if flow"; }
      return;
    }
    // Per-policy action: act on just this policy. Set the selection to it, close
    // the detail, and run the same tool the selection bar would.
    const act = e.target.closest("[data-pact]");
    if (act && detailPolicyId) {
      const mode = act.dataset.pact;
      selected = new Set([detailPolicyId]);
      refreshViews();
      $("detailModal").classList.remove("open");
      setToolMode(mode);
      runToolMode(mode);
    }
  });

  // ---------- export ----------
  // R27 lives inside Create documentation, not as another report hanging off
  // the Restricted AUs tool. This adapter deliberately owns its reads: opening
  // Restricted AUs first is never a prerequisite, and none of its ruList /
  // ruDetails state is reused. The pure RmauDoc module receives plain data and
  // can therefore be lifted into another host without this app.
  async function readRestrictedDocumentation(onProgress) {
    const rawPolicies = policies.map((p) => p.raw).filter(Boolean); // ALL tenant policies, not only the export selection
    if (isDemo) {
      const demo = (typeof DEMO_DATA !== "undefined" && DEMO_DATA) || {};
      return RmauDoc.build({
        units: (demo.adminUnits || []).map((a) => ({ ...a })),
        detailsById: Object.fromEntries(Object.entries(demo.adminUnitDetails || {}).map(([id, d]) => [id, {
          ...d,
          members: Array.isArray(d.members) ? d.members.map((m) => ({ ...m })) : d.members,
          scoped: Array.isArray(d.scoped) ? d.scoped.map((r) => ({ ...r, roleMemberInfo: r.roleMemberInfo ? { ...r.roleMemberInfo } : r.roleMemberInfo })) : d.scoped,
        }])),
        rawPolicies, directoryRoles: [], roleDefinitions: [],
        tenant: tenantName, build: APP_BUILD.label, baselineAUs: Rmau.BASELINE_AUS,
      });
    }

    let units;
    try {
      onProgress?.("Reading restricted administrative units…");
      units = await Graph.ggetAll("/administrativeUnits?$select=id,displayName,description,isMemberManagementRestricted");
    } catch (e) {
      return RmauDoc.build({ units: null, readError: e.message || String(e), rawPolicies,
        tenant: tenantName, build: APP_BUILD.label, baselineAUs: Rmau.BASELINE_AUS });
    }

    // Role metadata is enrichment. A tenant or account that cannot read it
    // still gets the unit pages, with capability marked unverified rather than
    // guessed from a friendly role name.
    let directoryRoles = [], roleDefinitions = [], directoryRolesError = "", roleDefinitionsError = "";
    await Promise.all([
      Graph.ggetAll("/directoryRoles?$select=id,displayName,roleTemplateId")
        .then((v) => { directoryRoles = v; })
        .catch((e) => { directoryRolesError = e.message || String(e); }),
      Graph.ggetAll("/roleManagement/directory/roleDefinitions?$select=id,displayName,templateId,rolePermissions")
        .then((v) => { roleDefinitions = v; })
        .catch((e) => { roleDefinitionsError = e.message || String(e); }),
    ]);

    const restricted = units.filter((a) => a.isMemberManagementRestricted === true);
    const detailsById = {};
    for (let i = 0; i < restricted.length; i++) {
      const au = restricted[i];
      onProgress?.(`Reading restricted unit ${i + 1}/${restricted.length}…`);
      const detail = { members: null, scoped: null, membersError: "", scopedError: "" };
      const [members, scoped] = await Promise.allSettled([
        Graph.ggetAll(`/administrativeUnits/${au.id}/members?$select=id,displayName,userPrincipalName,isAssignableToRole`),
        Graph.ggetAll(`/administrativeUnits/${au.id}/scopedRoleMembers`),
      ]);
      if (members.status === "fulfilled") detail.members = members.value.map((m) => ({ ...m }));
      else detail.membersError = members.reason?.message || String(members.reason || "Members could not be read");
      if (scoped.status === "fulfilled") detail.scoped = scoped.value.map((r) => ({ ...r,
        roleMemberInfo: r.roleMemberInfo ? { ...r.roleMemberInfo } : r.roleMemberInfo }));
      else detail.scopedError = scoped.reason?.message || String(scoped.reason || "Scoped roles could not be read");
      detailsById[au.id] = detail;
    }

    return RmauDoc.build({ units, detailsById, rawPolicies, directoryRoles, roleDefinitions,
      directoryRolesError, roleDefinitionsError, tenant: tenantName,
      build: APP_BUILD.label, baselineAUs: Rmau.BASELINE_AUS });
  }

  function openExport() {
    currentExport = selected.size ? [...selected] : visible().map(p => p.id);
    if (!currentExport.length) return;
    fmt = currentExport.length > 1 ? "docx" : "png";
    syncFmt();
    $("expDesc").textContent = selected.size
      ? (currentExport.length > 1
        ? `${currentExport.length} policies selected — recommended export is a Word document (one card per page).`
        : "1 policy selected — recommended export is a PNG image.")
      : `No selection — exporting all ${currentExport.length} policies in the current view.`;
    $("exportModal").classList.add("open");
  }
  function syncFmt() {
    ["Png", "Pdf", "Docx", "Zip", "Md", "Json"].forEach(f => $("expOpt" + f).classList.toggle("sel", fmt === f.toLowerCase()));
    $("expMatrixWrap").style.display = fmt === "pdf" ? "flex" : "none"; // appendix only applies to PDF
    // A single PNG is exactly one policy image and JSON is a backup. The
    // restricted-unit pages belong to the multi-page / multi-file documents.
    $("expRmauWrap").style.display = ["pdf", "docx", "zip", "md"].includes(fmt) ? "flex" : "none";
  }
  async function doExport() {
    $("exportModal").classList.remove("open");
    // export in persona order (CA number ranges): Global, Admins, Internals, …
    const ps = exportOrder(currentExport.map(id => policies.find(p => p.id === id)));
    try {
      const wantsRestricted = $("expRmau").checked && ["pdf", "docx", "zip", "md"].includes(fmt);
      let restrictedDoc = null;
      if (wantsRestricted) {
        try {
          restrictedDoc = await readRestrictedDocumentation((m) => toast(m));
          if (restrictedDoc.readError) toast("Restricted-unit appendix <span>not captured</span> — policy documentation continues");
        } catch (e) {
          // Optional integration: even a bug in its adapter cannot break the
          // policy export. Preserve the omission inside the deliverable when
          // the pure module is still available; otherwise continue without it.
          console.warn("Restricted-unit documentation unavailable:", e);
          try {
            restrictedDoc = RmauDoc.build({ units: null, readError: e.message || String(e),
              tenant: tenantName, build: APP_BUILD.label });
          } catch { restrictedDoc = null; }
          toast("Restricted-unit appendix <span>unavailable</span> — exporting the policies anyway");
        }
      }
      const docOpts = { restrictedDoc };
      if (fmt === "png") {
        for (const p of ps) {
          toast(`Exporting <span>${p.seq}.png</span>…`);
          await Exporter.policyPng(p, tenantName, tenantLogo);
        }
        toast("PNG export <span>done</span>");
      } else if (fmt === "docx") {
        await Exporter.policiesDocx(ps, tenantName, tenantLogo, (m) => toast(m), docOpts);
        toast("Word export <span>done</span> — images can be copied straight into other documents");
      } else if (fmt === "zip") {
        await Exporter.policiesZip(ps, tenantName, tenantLogo, (m) => toast(m), docOpts);
        toast("PNG bundle <span>done</span>");
      } else if (fmt === "md") {
        await Exporter.policiesMd(ps, tenantName, docOpts);
        toast("Markdown export <span>done</span>");
      } else if (fmt === "json") {
        await Exporter.policiesJson(ps, tenantName);
        toast("JSON backup <span>done</span>");
      } else {
        await Exporter.policiesPdf(ps, tenantName, $("expMatrix").checked, (m) => toast(m), tenantLogo, docOpts);
        toast("PDF export <span>done</span>");
      }
    } catch (e) {
      console.error("Export failed:", e);
      toast(`Export failed: <span>${esc(e.message || e)}</span>`);
    }
  }

  // ---------- data loading ----------
  async function loadFromGraph(isRefresh) {
    show("screen-loading");
    let phase = "loading the Conditional Access policies from your tenant";
    try {
      const { policies: raw, org, logo, resolve, account } = await Graph.loadTenant((m) => $("loadStatus").textContent = m);
      phase = "processing the policies";
      tenantName = org?.displayName || account?.tenantId || "";
      tenantDomain = (account?.username || "").split("@")[1] || "";
      // Audience branding by who signed in: an @pvmict.com account gets the
      // Perfetti Van Melle look even without coming in through /pvm.
      if (typeof BrandOverrides !== "undefined") {
        const bo = BrandOverrides.forUpn(account?.username);
        if (bo && activeOverrideKey() !== bo.key) {
          try { sessionStorage.setItem(BRAND_STORE, bo.key); } catch {}
          applyBranding(activeBrand());
        }
      }
      tenantLogo = logo || null;
      isDemo = false; anReport = null;
      $("anResults").style.display = "none"; $("anStatus").textContent = "";
      raw.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      policies = raw.map((r, i) => buildViewModel(r, resolve, i));
      $("tenantName").textContent = tenantName;
      // Baseline tenants (see BASELINE_TENANTS) get extended behaviour — say so
      // where the tenant identity lives, instead of it being a hidden mode.
      $("baselineBadge").style.display = isBaselineTenant() ? "inline-block" : "none";
      $("tenantUser").textContent = account?.username || "";
      $("avatar").textContent = (account?.name || account?.username || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      $("tenantBox").style.display = "flex";
    $("homeBtn").style.display = "inline-flex";
      selected = new Set();
      refreshViews();
      renderPermissions();
      show(isRefresh ? "screen-list" : "screen-home");
      toast(isRefresh
        ? `Refreshed from Entra — <span>${policies.length}</span> Conditional Access policies`
        : `Signed in to <span>${esc(tenantName)}</span> — ${policies.length} Conditional Access policies loaded`);
      warnUnresolved();
      if (!isRefresh) maybeShowWhatsNew();   // after sign-in, never over the login screen
    } catch (e) {
      console.error("Failed while " + phase + ":", e); // full details for diagnostics
      alert(`Something went wrong while ${phase}.\n\nError: ${e.message || e}\n\n` +
        (phase.startsWith("loading")
          ? "If this mentions 401/403: admin consent for this app may not be granted in your tenant yet."
          : "This looks like an app bug — please report the error text above."));
      show("screen-login");
    }
  }

  function loadDemo() {
    tenantName = DEMO_DATA.tenantName;
    tenantLogo = null;
    isDemo = true; anReport = null;
    $("anResults").style.display = "none"; $("anStatus").textContent = "";
    const resolve = (id, map) => (map && map[id]) || DEMO_DATA.names[id] || id;
    policies = DEMO_DATA.policies.map((r, i) => buildViewModel(r, resolve, i));
    $("tenantName").textContent = tenantName;
    $("tenantUser").textContent = "demo@contoso.onmicrosoft.com";
    $("avatar").textContent = "DM";
    $("tenantBox").style.display = "flex";
    $("homeBtn").style.display = "inline-flex";
    refreshViews();
    renderPermissions();
    show("screen-home");
    toast(`Demo mode — <span>${policies.length}</span> sample policies loaded`);
    maybeShowWhatsNew();
  }

  // ---------- permissions overview (home) ----------
  const SCOPE_INFO = [
    { scope: "Policy.Read.All", use: "Read CA policies, named locations, auth strengths & contexts", tools: "all tools", onDemand: false },
    { scope: "Directory.Read.All", use: "Resolve users/groups/roles/apps to names; expand memberships", tools: "all tools", onDemand: false },
    { scope: "AuditLog.Read.All", use: "Read the directory audit log for Conditional Access changes and the sign-in log for CA failures", tools: "Change audit, Sign-in failures", onDemand: true },
    { scope: "Agreement.Read.All", use: "Read terms-of-use agreements", tools: "Backup", onDemand: true },
    { scope: "Policy.ReadWrite.ConditionalAccess", use: "Update policy group assignments / state, create policies, manage named locations", tools: "CA groups (assign), Set Policy state, Import, Named locations, MS Learn apply", onDemand: true },
    { scope: "Application.Read.All", use: "Required by Graph to create policies with app conditions", tools: "Import", onDemand: true },
    { scope: "Application.ReadWrite.All", use: "Create service principals for Microsoft apps a policy must reference", tools: "MS Learn apply", onDemand: true },
    { scope: "Policy.ReadWrite.AuthenticationMethod", use: "Create authentication strengths", tools: "Import", onDemand: true },
    { scope: "Group.ReadWrite.All", use: "Create missing persona groups; add members from a CSV", tools: "CA groups (create, import members)", onDemand: true },
    { scope: "AdministrativeUnit.ReadWrite.All", use: "Create/edit administrative units, manage their members", tools: "CA groups (protect), Restricted AUs", onDemand: true },
    { scope: "RoleManagement.ReadWrite.Directory", use: "Create groups as role-assignable; grant scoped directory roles", tools: "CA groups (create), Restricted AUs", onDemand: true },
    { scope: "RoleManagement.Read.Directory", use: "Read directory role assignments and PIM eligibility for a group", tools: "Group Analyzer", onDemand: true },
    { scope: "Group-NestingSupport.ReadWrite.All", use: "Set disableNesting so no group can be added as a member of a group (beta) — asked for by every path that CREATES a group, and by the ⑧ Disable nesting step", tools: "CA groups (create, disable nesting), Assign groups, Import, Restricted AUs", onDemand: true },
    { scope: "EntitlementManagement.Read.All", use: "Read access packages and their assignment policies", tools: "Group Analyzer", onDemand: true },
    { scope: "DeviceManagementConfiguration.Read.All", use: "Read Intune compliance policies, configuration profiles, scripts and update profiles", tools: "Group Analyzer, Device reality check", onDemand: true },
    { scope: "DeviceManagementApps.Read.All", use: "Read Intune app assignments, app protection and app configuration policies", tools: "Group Analyzer, Device reality check", onDemand: true },
    { scope: "DeviceManagementServiceConfig.Read.All", use: "Read Intune enrolment restrictions and Autopilot deployment profiles", tools: "Group Analyzer", onDemand: true },
    { scope: "DeviceManagementScripts.Read.All", use: "Read Intune PowerShell scripts, macOS shell scripts and remediations — a separate scope, not covered by DeviceManagementConfiguration.Read.All", tools: "Group Analyzer", onDemand: true },
  ];
  // Azure Resource Manager is a different resource, not a Graph scope, so it is
  // listed on its own rather than mixed into the Graph consent request.
  const ARM_SCOPE_INFO = { scope: "management.azure.com/user_impersonation", use: "Read Azure role assignments across subscriptions and management groups", tools: "Group Analyzer (Azure area)" };
  // Revoking is the mirror image of consenting, and it belongs where the
  // permissions are listed. The panel explains the three routes and their
  // consequences; the PowerShell carries this deployment's real client ID.
  let permRevOpen = false;
  const permRevokeHtml = () => {
    const ps = [
      `$sp = Get-MgServicePrincipal -Filter "appId eq '${AUTH_CONFIG.clientId}'"`,
      `$grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)'"`,
      `# keep the read base, drop every write scope:`,
      `Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope "Policy.Read.All Directory.Read.All"`,
      `# or remove the consent completely:`,
      `Remove-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id`,
    ].join("\n");
    return `<div id="permRevoke" style="border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin:0 0 12px">
      <p class="mini" style="margin:0 0 8px">Consent is an <code>oAuth2PermissionGrant</code> in <b>your</b> tenant — revoking it is deleting or trimming that object. Three routes:</p>
      <p class="mini" style="margin:0 0 6px"><b>1 · Yourself:</b> <a href="https://myaccount.microsoft.com/" target="_blank" rel="noopener noreferrer">myaccount.microsoft.com</a> → App permissions → this app → <i>Revoke permissions</i>. Removes your own grant entirely.</p>
      <p class="mini" style="margin:0 0 6px"><b>2 · As admin, in the portal:</b> Entra admin center → Enterprise applications → this app → Permissions (tenant-wide admin consents live there).</p>
      <p class="mini" style="margin:0 0 4px"><b>3 · Surgically, via Graph PowerShell</b> — a grant's <code>scope</code> is one space-separated string, so the write scopes can be stripped while the read base stays:</p>
      <pre style="margin:4px 0 8px;padding:10px 12px;border-radius:8px;background:var(--soft);overflow:auto;font-size:12px;line-height:1.5"><code>${ps}</code></pre>
      <button class="btn sm" id="permRevCopy">Copy PowerShell</button>
      <p class="mini muted" style="margin:10px 0 0"><b>Consequences:</b> almost nothing breaks — on the next sign-in the token simply carries fewer scopes, and the moment a tool needs a missing one the consent prompt reappears (the same on-the-click model that granted it). Nothing is lost: this app stores no data. It is <b>not instant</b> — tokens already issued keep their scopes until they expire (about an hour); pair with <code>Revoke-MgUserSignInSession</code> and close the tab for immediacy. Mind the blast radius: deleting an <code>AllPrincipals</code> (admin-consented) grant re-prompts <b>every</b> user of the app in the tenant, a <code>Principal</code> grant only that account. The deletion lands in the directory audit log. And do not revoke from inside this app — that would need <code>DelegatedPermissionGrant.ReadWrite.All</code>, a far bigger permission than the ones being cleaned up (see the roadmap).</p>
    </div>`;
  };
  async function renderPermissions() {
    const el = $("permOverview");
    const granted = isDemo ? ["Policy.Read.All", "Directory.Read.All"] : await Graph.grantedScopes();
    const missing = SCOPE_INFO.map(s => s.scope).filter(s => !granted.includes(s));
    el.innerHTML = `<h3 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">🔑 Permissions in this session
        <button class="btn" id="permRefresh" style="font-size:12px;padding:5px 12px">⟳ Refresh</button>
        ${missing.length && !isDemo ? `<button class="btn primary" id="permConsent" style="font-size:12px;padding:5px 12px">🔓 Request consent for ${missing.length} missing permission(s)</button>` : ""}
        <button class="btn" id="permRevToggle" style="font-size:12px;padding:5px 12px" title="How to take consent away again, and what happens when you do">🔒 How to revoke ${permRevOpen ? "▴" : "▾"}</button></h3>
      <p class="mini" style="margin-bottom:10px">Granted scopes come from your current sign-in${isDemo ? " (demo — simulated)" : ""}. On-demand scopes are only requested when the matching tool is used — refresh after consenting to see them turn green.</p>
      ${permRevOpen ? permRevokeHtml() : ""}
      <table class="plist" style="font-size:13px">
        <thead><tr><th>Permission</th><th>Used for</th><th>Tools</th><th>Status</th></tr></thead>
        <tbody>${SCOPE_INFO.map(s => {
          const has = granted.includes(s.scope);
          return `<tr><td><code>${s.scope}</code></td><td class="mini">${s.use}</td><td class="mini">${s.tools}</td>
            <td>${has ? '<span class="tag grant">granted</span>' : s.onDemand ? '<span class="tag">on demand</span>' : '<span class="tag block">missing</span>'}</td></tr>`;
        }).join("")}
        <tr><td><code>${ARM_SCOPE_INFO.scope}</code></td><td class="mini">${ARM_SCOPE_INFO.use}</td><td class="mini">${ARM_SCOPE_INFO.tools}</td>
          <td>${!isDemo && Graph.hasScopes(Graph.ARM_SCOPES) ? '<span class="tag grant">granted</span>' : '<span class="tag">on demand</span>'}</td></tr></tbody>
      </table>
      <p class="mini muted" style="margin:8px 0 0">The last row is Azure Resource Manager, not Microsoft Graph — a separate resource with its own token, so it is consented on its own and never bundled into the request above.</p>`;
    el.style.display = "block";
  }
  $("permOverview").addEventListener("click", async (e) => {
    if (e.target.id === "permRefresh") { renderPermissions(); toast("Permission status <span>refreshed</span>"); return; }
    if (e.target.id === "permRevToggle") { permRevOpen = !permRevOpen; renderPermissions(); return; }
    if (e.target.id === "permRevCopy") {
      const code = document.querySelector("#permRevoke pre code");
      if (code) navigator.clipboard.writeText(code.textContent).then(() => toast("PowerShell <span>copied</span>"), () => toast("Copy failed — select the text manually"));
      return;
    }
    if (e.target.id === "permConsent") {
      e.target.disabled = true;
      try {
        const all = [...new Set([...AUTH_CONFIG.scopes, ...SCOPE_INFO.map(s => s.scope)])];
        const granted = await Graph.requestConsent(all);
        toast(`Consent updated — <span>${granted.length}</span> scopes in session`);
      } catch (err) {
        if (err.errorCode !== "user_cancelled") { console.error(err); toast(`Consent failed: <span>${esc(err.errorMessage || err.message || err)}</span>`); }
      } finally { renderPermissions(); }
    }
  });

  // ---------- tools home ----------
  function exportOrder(ps) {
    return [...ps].sort((a, b) => {
      const ga = Render.caGroup(a.name), gb = Render.caGroup(b.name);
      return ga.key - gb.key || (ga.num ?? 1e9) - (gb.num ?? 1e9) || a.name.localeCompare(b.name);
    });
  }
  // selection-bar action buttons ↔ tool mode
  const SEL_ACTIONS = [
    ["selActDoc", "document"], ["selActBackup", "backup"],
    ["selActAssign", "assign"], ["selActState", "state"],
  ];
  // Highlights the selection-bar action matching the tool you entered from, so
  // the screen still says which tool you are in now that the toolbar button
  // (which used to carry that label) is gone.
  function setToolMode(mode) {
    toolMode = mode;
    SEL_ACTIONS.forEach(([id, m]) => { const b = $(id); if (b) b.classList.toggle("on", m === mode); });
  }
  function runBackup() {
    const ps = exportOrder((selected.size ? [...selected] : visible().map(p => p.id)).map(id => policies.find(p => p.id === id)));
    if (!ps.length) { toast("Nothing to back up"); return; }
    bkPolicies = ps;
    const dep = backupDependencyIds(ps);
    const nDeps = Object.values(dep).reduce((s, a) => s + a.length, 0);
    $("bkDesc").textContent = `${ps.length} ${ps.length === 1 ? "policy" : "policies"} — referencing ${nDeps} dependencies `
      + `(${dep.groups.length} groups, ${dep.authStrengths.length} auth strengths, ${dep.namedLocations.length} named locations, ${dep.authContexts.length} auth contexts, ${dep.termsOfUse.length} terms of use).`;
    $("backupModal").classList.add("open");
  }
  let bkPolicies = [];
  function backupGroupIds(ps) {
    const ids = new Set();
    ps.forEach(p => {
      const u = p.raw.conditions?.users || {};
      [...(u.includeGroups || []), ...(u.excludeGroups || [])].forEach(id => ids.add(id));
    });
    return [...ids];
  }
  // All dependency ids referenced by the selected policies, per category.
  function backupDependencyIds(ps) {
    const d = { groups: new Set(), authStrengths: new Set(), namedLocations: new Set(), authContexts: new Set(), termsOfUse: new Set() };
    ps.forEach(p => {
      const c = p.raw.conditions || {}, g = p.raw.grantControls || {};
      backupGroupIds([p]).forEach(id => d.groups.add(id));
      if (g.authenticationStrength?.id) d.authStrengths.add(g.authenticationStrength.id);
      [...(c.locations?.includeLocations || []), ...(c.locations?.excludeLocations || [])]
        .filter(id => id !== "All" && id !== "AllTrusted").forEach(id => d.namedLocations.add(id));
      (c.applications?.includeAuthenticationContextClassReferences || []).forEach(id => d.authContexts.add(id));
      (g.termsOfUse || []).forEach(id => d.termsOfUse.add(id));
    });
    return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [...v]]));
  }
  const DEP_ENDPOINTS = {
    groups: (id) => `/groups/${id}`,
    authStrengths: (id) => `/policies/authenticationStrengthPolicies/${id}`,
    namedLocations: (id) => `/identity/conditionalAccess/namedLocations/${id}`,
    authContexts: (id) => `/identity/conditionalAccess/authenticationContextClassReferences/${id}`,
    termsOfUse: (id) => `/identityGovernance/termsOfUse/agreements/${id}?$expand=files`, // files carry the actual PDF (fileData.data)
  };
  // terms-of-use agreements need Agreement.Read.All — requested on demand
  const DEP_SCOPES = { termsOfUse: [...AUTH_CONFIG.scopes, "Agreement.Read.All"] };
  $("bkCancel").addEventListener("click", () => $("backupModal").classList.remove("open"));
  $("bkGo").addEventListener("click", async () => {
    $("backupModal").classList.remove("open");
    const ps = bkPolicies;
    const wantGroups = $("bkGroups").checked;
    if (!$("bkPolicies").checked && !wantGroups) { toast("Nothing selected to back up"); return; }
    try {
      const deps = { groups: [], authStrengths: [], namedLocations: [], authContexts: [], termsOfUse: [] };
      if (wantGroups) {
        const ids = backupDependencyIds(ps);
        const total = Object.values(ids).reduce((s, a) => s + a.length, 0);
        let n = 0; const skipped = [];
        for (const [cat, list] of Object.entries(ids)) {
          for (const id of list) {
            toast(`Fetching dependency ${++n}/${total}…`);
            try {
              deps[cat].push(isDemo
                ? { id, displayName: DEMO_DATA.names[id] || id, demo: true }
                : await Graph.gget(DEP_ENDPOINTS[cat](id), DEP_SCOPES[cat]));
            } catch (e) {
              console.warn(`Dependency fetch failed (skipped): ${cat}/${id}`, e.message);
              skipped.push(`${cat}: ${id}`);
            }
          }
        }
        if (skipped.length) toast(`⚠ <span>${skipped.length}</span> dependencies could not be fetched and were skipped — see browser console`);
      }
      const psOut = $("bkPolicies").checked ? ps : [];
      toast("Building JSON backup…");
      const nDeps = Object.values(deps).reduce((s, a) => s + a.length, 0);
      await Exporter.policiesJson(psOut, tenantName, {
        ...deps,
        tenantId: Graph.account?.tenantId || "",
      });
      toast(`JSON backup <span>downloaded</span> — ${psOut.length} policies${nDeps ? `, ${nDeps} dependencies` : ""}`);
    } catch (e) { console.error(e); toast(`Backup failed: <span>${esc(e.message || e)}</span>`); }
  });
  // ---------- tool tab bar ----------
  // The tools, in home-grid order. Each carries the exact crumb string its tile
  // handler sets, so the active tab can be matched from crumb() regardless of
  // whether the tool was opened from the grid or a tab.
  const TOOL_TABS = [
    ["toolPolicies", "🗂 List Policies"],
    ["toolDocument", "📄 Create documentation"],
    ["toolAnalyze", "🔍 Gap analyse"],
    ["toolGapCheck", "🛡 Best-practice & bypass checks"],
    ["toolValidator", "⚡ CA validator"],
    ["toolWhatIf", "🧪 What-If"],
    ["toolGroupUse", "🔗 Group Analyzer"],
    ["toolCompare", "⚖ Compare users"],
    ["toolAudit", "🕓 Change audit"],
    ["toolSignins", "🚦 Sign-in failures"],
    ["toolImpact", "🎚 Report-only impact"],
    ["toolExclusions", "🚪 Exclusion analyzer"],
    ["toolDevCheck", "🖥 Device reality check"],
    ["toolBaseline", "🧬 Baseline Policies"],
    ["toolBaselineJoey", "🧩 Baseline (Joey Verlinden)"],
    ["toolMsLearn", "📘 MS Learn checks"],
    ["toolCis", "📐 CIS Benchmark"],
    ["toolJson", "🗄 Backup (JSON)"],
    ["toolCaGroups", "👥 Conditional Access groups"],
    ["toolProtect", "🔒 Protect exclusions"],
    ["toolLocations", "🌐 Named locations"],
    ["toolAuthCtx", "🎫 Authentication contexts"],
    ["toolAuthStr", "💪 Authentication strengths"],
    ["toolTou", "📜 Terms of use"],
    ["toolRecycle", "♻ Recycle bin"],
    ["toolRmau", "🛡 Restricted AUs"],
    ["toolDrift", "📉 Drift watch"],
    ["toolGuide", "📖 Baseline guide"],
    ["toolState", "🎚 Set Policy state"],
    ["toolImport", "📥 Import"],
  ];
  // Help is a tool too, but always sits last (after the + in the tab bar).
  TOOL_TABS.push(["toolChangelog", "📋 What's new"]);
  TOOL_TABS.push(["toolRoadmap", "🗺 Roadmap"]);
  TOOL_TABS.push(["toolHelp", "❓ Help"]);
  // Browser-style tabs: a tab exists only for a tool you have opened. Home shows
  // no tabs; opening a tool (from the grid or the + menu) adds one; the + opens
  // another. openTabs is the ordered set of open tool ids.
  let openTabs = [], activeTab = null;
  const labelFor = (id) => (TOOL_TABS.find((x) => x[0] === id) || [, id])[1];
  const idForCrumb = (name) => (TOOL_TABS.find((x) => x[1] === name) || [])[0] || null;

  function renderTabs() {
    const home = `<button class="toolnav-btn home ${activeTab ? "" : "active"}" data-navhome title="All tools" aria-label="All tools">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.2 9.4V20.4h13.6V9.4"/><path d="M9.6 20.4v-6.2h4.8v6.2"/>
      </svg></button>`;
    const tabs = openTabs.map((id) =>
      `<span class="toolnav-tab ${id === activeTab ? "active" : ""}">
        <button class="toolnav-btn" data-nav="${id}">${esc(labelFor(id))}</button>
        <button class="toolnav-x" data-close="${id}" title="Close tab">×</button>
      </span>`).join("");
    const add = `<button class="toolnav-btn add" data-navadd title="Open a tool in a new tab">＋</button>`;
    const help = `<button class="toolnav-btn help" data-navhelp title="How each tool works">❓ Help</button>`;
    // "close all" appears only when there's more than one tab to close at once
    const closeAll = openTabs.length > 1 ? `<button class="toolnav-btn closeall" data-navcloseall title="Close all tabs">✕ all</button>` : "";
    // Centred inner strip aligned to the card width; tabs grow out from the
    // middle to left and right as more open ("opening a curtain").
    $("toolNav").innerHTML = `<div class="toolnav-inner">${home}${tabs}${add}${closeAll}${help}</div>`;
    // the bar only appears once a tool is open (empty at the tools home)
    $("toolNav").style.display = openTabs.length ? "block" : "none";
    // keep the tab you're on visible when the strip overflows
    const act = $("toolNav").querySelector(".toolnav-tab.active, .toolnav-btn.home.active");
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  function buildToolNav() { openTabs = []; activeTab = null; renderTabs(); }

  function closeTab(id) {
    const i = openTabs.indexOf(id);
    if (i < 0) return;
    openTabs.splice(i, 1);
    if (activeTab === id) {
      const next = openTabs[i] || openTabs[i - 1] || null;   // neighbour, else last
      if (next) { $(next).click(); }                          // switch to it
      else { crumb(""); show("screen-home"); }
    } else { renderTabs(); }
  }

  // The + menu: pick any tool to open in a new tab.
  function openAddMenu(anchor) {
    closeAddMenu();
    const menu = document.createElement("div");
    menu.className = "toolnav-menu"; menu.id = "toolAddMenu";
    menu.innerHTML = TOOL_TABS.map(([id, label]) =>
      `<button data-nav="${id}" class="${openTabs.includes(id) ? "open" : ""}">${esc(label)}${openTabs.includes(id) ? " <span class='mini'>· open</span>" : ""}</button>`).join("");
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-nav]"); if (!b) return;
      closeAddMenu(); $(b.dataset.nav).click();
    });
    setTimeout(() => document.addEventListener("click", closeAddMenu, { once: true }), 0);
  }
  function closeAddMenu() { const m = $("toolAddMenu"); if (m) m.remove(); }

  $("toolNav").addEventListener("click", (e) => {
    if (e.target.closest("[data-navhelp]")) { openHelp(); return; }
    if (e.target.closest("[data-navcloseall]")) { openTabs = []; activeTab = null; renderTabs(); crumb(""); show("screen-home"); return; }
    if (e.target.closest("[data-navhome]")) { crumb(""); show("screen-home"); return; }
    if (e.target.closest("[data-navadd]")) { openAddMenu(e.target.closest("[data-navadd]")); return; }
    const x = e.target.closest("[data-close]"); if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
    const b = e.target.closest("[data-nav]");
    if (b) $(b.dataset.nav).click();   // reuse the tile's own handler (crumb, screen, setup)
  });

  // Header breadcrumb + tab state: crumb(name) is called by every tool on entry,
  // so it both labels the header chip and registers/activates the tab.
  function crumb(name) {
    const id = name ? idForCrumb(name) : null;
    if (id) { if (!openTabs.includes(id)) openTabs.push(id); activeTab = id; }
    else { activeTab = null; }
    renderTabs();
  }
  $("homeBtn").addEventListener("click", () => { crumb(""); show("screen-home"); });
  // logo returns to the tools overview when signed in (does nothing on login)
  $("logoHome").addEventListener("click", () => { if (policies.length) { crumb(""); show("screen-home"); } });
  // Keep the view (cards / list / matrix) the user last chose — reopening the
  // tool used to force cards. Only the analyze mode (a different tool sharing
  // this screen) resets to cards.
  $("toolPolicies").addEventListener("click", () => { crumb("🗂 List Policies"); setToolMode("document"); setView(viewMode === "analyze" ? "cards" : viewMode); show("screen-list"); });
  // Document tool: opens the policy overview first — select policies (or none
  // for all), then click "Create documentation" in the toolbar to choose the format.
  $("toolDocument").addEventListener("click", () => {
    crumb("📄 Create documentation"); setToolMode("document"); setView(viewMode === "analyze" ? "cards" : viewMode); show("screen-list");
    toast("Documentation mode — select policies (or none for all), then click <span>Create documentation</span>");
  });
  $("toolAnalyze").addEventListener("click", () => { crumb("🔍 Gap analyse"); setToolMode("document"); setView("analyze"); show("screen-list"); });
  $("toolMsLearn").addEventListener("click", () => { crumb("📘 MS Learn checks"); openMsLearn(); });
  $("toolCis").addEventListener("click", () => { crumb("📐 CIS Benchmark"); openCis(); });
  $("toolGapCheck").addEventListener("click", () => { crumb("🛡 Best-practice & bypass checks"); openGapCheck(); });
  $("toolExclusions").addEventListener("click", () => { crumb("🚪 Exclusion analyzer"); openExclusions(); });
  $("toolValidator").addEventListener("click", () => { openValidator(); });   // openValidator sets its own crumb
  $("toolBaseline").addEventListener("click", () => { crumb("🧬 Baseline Policies"); openBaseline("limonit"); });
  $("toolBaselineJoey").addEventListener("click", () => { crumb("🧩 Baseline (Joey Verlinden)"); openBaseline("joey"); });
  // Backup tool: opens the policy overview in backup mode — select policies
  // (or leave unselected for all), then click "Backup (JSON)" in the toolbar.
  $("toolJson").addEventListener("click", () => {
    crumb("🗄 Backup (JSON)"); setToolMode("backup"); setView("cards"); show("screen-list");
    toast("Backup mode — select policies (or none for all), then click <span>Backup (JSON)</span>");
  });
  // Set-state tool (BETA): select policies, choose On / Report-only / Off, apply.
  $("toolState").addEventListener("click", () => {
    crumb("🎚 Set Policy state"); setToolMode("state"); setView("cards"); show("screen-list");
    toast("Set-state mode — select policies, then click <span>Set Policy state</span>");
  });
  function openStateModal() {
    if (!selected.size) { toast("Select at least one policy first"); return; }
    const ps = exportOrder([...selected].map(id => policies.find(p => p.id === id)));
    $("stDesc").textContent = `${ps.length} ${ps.length === 1 ? "policy" : "policies"} selected — choose the new state. This WRITES to your tenant.${isDemo ? " (demo — simulated)" : ""}`;
    $("stList").innerHTML = `<ul class="plist2" style="border:1px solid var(--border);border-radius:8px">` +
      ps.map(p => `<li>${Render.stateChip(p.state)} ${esc(p.name)}</li>`).join("") + "</ul>";
    document.querySelectorAll('[name="stState"]').forEach(r => r.checked = false);
    $("stateModal").classList.add("open");
  }
  $("stCancel").addEventListener("click", () => $("stateModal").classList.remove("open"));
  $("stGo").addEventListener("click", async () => {
    const sel = document.querySelector('[name="stState"]:checked');
    if (!sel) { toast("Choose the new state first"); return; }
    const state = sel.value;
    if (!await preConsent([...AUTH_CONFIG.scopes, "Policy.ReadWrite.ConditionalAccess"])) return;
    const ps = exportOrder([...selected].map(id => policies.find(p => p.id === id)));
    $("stGo").disabled = true;
    try {
      const results = [];
      for (let i = 0; i < ps.length; i++) {
        toast(`Updating ${i + 1}/${ps.length}…`);
        try {
          if (!isDemo) await Graph.gpatch(`/identity/conditionalAccess/policies/${ps[i].id}`, { state });
          results.push({ name: ps[i].name, ok: true });
        } catch (e) { console.error(e); results.push({ name: ps[i].name, ok: false }); }
      }
      $("stateModal").classList.remove("open");
      const failed = results.filter(r => !r.ok).length;
      toast(failed ? `State change done with <span>${failed} failure(s)</span> — see console`
        : `State of <span>${results.length}</span> policies set${isDemo ? " (simulated)" : ""}`);
      if (!isDemo && results.some(r => r.ok)) await loadFromGraph(true);
    } finally { $("stGo").disabled = false; }
  });

  // ---------- delete policies ----------
  // A deleted policy sits in the CA recycle bin for 30 days (♻ Recycle bin
  // tool restores it), but it stops applying the moment it is deleted. The
  // guards therefore stay deliberately heavy: the raw JSON is offered as a
  // download first (the only undo after the 30-day window), the word DELETE
  // must be typed, and enforced policies need a second tick because removing
  // one silently drops a control that is live right now.
  function delSelection() {
    return exportOrder([...selected].map(id => policies.find(p => p.id === id))).filter(Boolean);
  }
  function openDeleteModal() {
    if (!selected.size) { toast("Select at least one policy first"); return; }
    const ps = delSelection();
    const live = ps.filter(p => p.state === "enabled");
    $("delDesc").textContent = `${ps.length} ${ps.length === 1 ? "policy" : "policies"} selected `
      + `in ${tenantName || "this tenant"}.${isDemo ? " (demo — simulated, nothing is really deleted)" : ""}`;
    $("delOnWarn").style.display = live.length ? "block" : "none";
    $("delOnWarn").innerHTML = live.length
      ? `<label class="chk" style="margin:6px 0"><input type="checkbox" id="delAckOn"> `
        + `I understand <b>${live.length}</b> of these ${live.length === 1 ? "is" : "are"} currently <span class="state on">On</span> `
        + `— deleting ${live.length === 1 ? "it" : "them"} removes enforcement immediately</label>`
      : "";
    $("delList").innerHTML = `<ul class="plist2" style="border:1px solid var(--border);border-radius:8px">`
      + ps.map(p => `<li>${Render.stateChip(p.state)} ${esc(p.name)}</li>`).join("") + "</ul>";
    $("delConfirm").value = "";
    $("delBackup").checked = true;
    syncDelGo();
    $("delModal").classList.add("open");
  }
  // The Delete button only wakes up once every guard is satisfied.
  function syncDelGo() {
    const ack = $("delAckOn");
    $("delGo").disabled = $("delConfirm").value.trim().toUpperCase() !== "DELETE" || (ack ? !ack.checked : false);
  }
  $("delConfirm").addEventListener("input", syncDelGo);
  $("delOnWarn").addEventListener("change", syncDelGo);
  $("delCancel").addEventListener("click", () => $("delModal").classList.remove("open"));

  $("delGo").addEventListener("click", async () => {
    const ps = delSelection();
    if (!ps.length) { $("delModal").classList.remove("open"); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, "Policy.ReadWrite.ConditionalAccess"])) return;
    // Backup first — if this throws we stop, because the download is the only
    // thing standing between a mistaken click and an unrecoverable policy.
    if ($("delBackup").checked) {
      try {
        downloadText("CA-Deleted-Policies", "json", "application/json",
          JSON.stringify({ tenant: tenantName, exported: new Date().toISOString(), policies: ps.map(p => p.raw) }, null, 2));
      } catch (e) {
        console.error(e);
        toast("Backup download <span>failed</span> — nothing was deleted");
        return;
      }
    }
    $("delGo").disabled = true;
    try {
      const results = [];
      for (let i = 0; i < ps.length; i++) {
        toast(`Deleting ${i + 1}/${ps.length}…`);
        try {
          if (!isDemo) await Graph.gdelete(`/identity/conditionalAccess/policies/${ps[i].id}`, [...AUTH_CONFIG.scopes, ...ML_WRITE]);
          results.push({ name: ps[i].name, ok: true });
        } catch (e) { console.error(e); results.push({ name: ps[i].name, ok: false, err: e.message }); }
      }
      $("delModal").classList.remove("open");
      const failed = results.filter(r => !r.ok);
      toast(failed.length
        ? `Deleted <span>${results.length - failed.length}</span>, <span>${failed.length} failed</span> — see console`
        : `<span>${results.length}</span> ${results.length === 1 ? "policy" : "policies"} deleted${isDemo ? " (simulated)" : ""}`);
      selected.clear();
      if (!isDemo && results.some(r => r.ok)) await loadFromGraph(true); else refreshViews();
    } finally { $("delGo").disabled = false; }
  });

  // ---------- housekeeping: delete superseded (Off) policy versions ----------
  // "Match & replace" deliberately leaves the old version behind, switched Off,
  // as the rollback. Nothing ever cleans those up, so a tenant that has been
  // through a few baseline upgrades accumulates dead policies. This lists them
  // with what replaced them and hands the chosen ones to the normal delete flow,
  // guards and JSON backup included.
  function hkFind() { return Importer.supersededOff(policies); }
  function syncHkBtn() {
    const n = hkFind().length;
    const b = $("hkBtn"); if (!b) return;
    b.style.display = (n && viewMode !== "analyze") ? "" : "none";
    b.textContent = `🧹 Housekeeping (${n})`;
    b.title = `${n} old policy version${n === 1 ? "" : "s"} left switched Off by a match & replace import — review and clean up`;
  }
  function openHousekeeping() {
    const rows = hkFind();
    $("hkDesc").textContent = `${rows.length} superseded ${rows.length === 1 ? "policy" : "policies"} in ${tenantName || "this tenant"}.`;
    $("hkList").innerHTML = `<ul class="plist2" style="border:1px solid var(--border);border-radius:8px">`
      + rows.map((r, i) => `<li><label class="chk" style="margin:0">
          <input type="checkbox" data-hk="${i}" checked>
          ${Render.stateChip(r.policy.state)} ${esc(r.policy.name)}
          <span class="mini">superseded by <b>${esc(r.newer.name)}</b> ${Render.stateChip(r.newer.state)}</span>
        </label></li>`).join("") + "</ul>";
    syncHkGo();
    $("hkModal").classList.add("open");
  }
  function syncHkGo() {
    const n = document.querySelectorAll("[data-hk]:checked").length;
    $("hkGo").disabled = n === 0;
    $("hkGo").textContent = n ? `Review & delete ${n}` : "Review & delete";
  }
  $("hkBtn").addEventListener("click", openHousekeeping);
  $("hkCancel").addEventListener("click", () => $("hkModal").classList.remove("open"));
  $("hkList").addEventListener("change", (e) => { if (e.target.matches("[data-hk]")) syncHkGo(); });
  $("hkGo").addEventListener("click", () => {
    const rows = hkFind();
    const ids = [...document.querySelectorAll("[data-hk]:checked")].map(cb => rows[+cb.dataset.hk]?.policy.id).filter(Boolean);
    if (!ids.length) return;
    $("hkModal").classList.remove("open");
    // Hand over to the delete flow — typed DELETE, backup download, the lot.
    selected = new Set(ids);
    refreshViews();
    openDeleteModal();
  });

  // ---------- import tool (BETA) ----------
  let imBundle = null, imPlan = null, imFileName = "", imMode = "deploy";
  // Workload ID licence state for this tenant: { known, licensed, sku }. Read
  // once per file load — a workload-identity policy cannot be created without it.
  let imLic = { known: false, licensed: false, sku: null };
  const imWidBlocked = (p) => p.wid && imLic.known && !imLic.licensed;
  $("toolImport").addEventListener("click", () => {
    crumb("📥 Import");
    imBundle = null; imPlan = null; imAu = null; imMode = "deploy"; imLic = { known: false, licensed: false, sku: null };
    $("imBody").innerHTML = ""; $("imGo").style.display = "none"; $("imPick").style.display = "flex";
    $("imDesc").textContent = `Select a ${BRANDING.name} backup zip, or pick the extracted backup folder — both use the same structure.`;
    $("importModal").classList.add("open");
  });
  // Import is a modal over the current screen — drop the crumb when it closes.
  $("imCancel").addEventListener("click", () => { $("importModal").classList.remove("open"); crumb(""); });
  // Label a plan item's persona for the filter — an E-Admins policy is imported
  // as-is (no persona group), so it gets its own bucket.
  const IM_PERSONA_LABEL = {
    global: "🌐 Global", admins: "🛡 Admins", internals: "👤 Internals", externals: "🤝 Externals",
    guestusers: "👥 Guest users", g_admins: "🔑 Guest admins", serviceaccounts: "⚙ Service accounts",
    devops: "🧰 DevOps", factoryworkers: "🏭 Factory workers",
  };
  const imPersonaKey = (p) => p.asIs ? "eadmins" : (p.persona || "other");
  const imPersonaLabel = (k) => k === "eadmins" ? "🚨 E-Admins" : (IM_PERSONA_LABEL[k] || "Other");

  // Restricted-AU preflight. Read once per opened file; a failure to read is
  // shown as "could not check", never as "all present" — the whole point of a
  // preflight is that it does not lie about what it did not see.
  let imAu = null;   // { codes, rows, missing, byCode, error, busy, sel, results }

  async function imLoadAu() {
    const codes = Importer.personaCodes(imBundle, imPlan.filter(p => !p.exists).map(p => p.raw));
    imAu = { codes, rows: [], missing: [], byCode: {}, error: null, busy: false, sel: new Set(), results: null };
    if (!codes.length) return;
    try {
      const aus = isDemo
        ? [{ id: "au-GLO", displayName: "CAB-SEC-RMAU-GLO-Exclusions", isMemberManagementRestricted: true }]
        : await Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted");
      const check = Rmau.baselineCheck(aus);
      imAu.rows = check.rows.filter(r => codes.includes(r.code));
      imAu.missing = imAu.rows.filter(r => r.status === "missing");
      imAu.sel = new Set(imAu.missing.map(r => r.name));
      for (const r of imAu.rows) if (r.status === "present") imAu.byCode[r.code] = r.id;
    } catch (e) {
      imAu.error = e.message || String(e);
    }
  }

  function imAuPanel() {
    if (!imAu || !imAu.codes.length) return "";
    if (imAu.error) {
      return `<div class="cg-panel"><h4>🛡 PROTECTION — COULD NOT CHECK</h4>
        <p class="mini" style="margin:0">The tenant's administrative units could not be read (${esc(imAu.error)}), so it is not known whether the persona vaults exist. <b>The import will run regardless</b> — groups it creates will simply be left unprotected, and the report will say so per group.</p></div>`;
    }
    const chip = (r) => r.status === "present" ? '<span class="tag grant">present</span>'
      : r.status === "unrestricted" ? '<span class="tag block">name taken — not restricted</span>'
      : '<span class="tag">missing</span>';
    const rows = imAu.rows.map(r => `<div class="dr-row"><div class="dr-head">
        ${r.status === "missing"
          ? `<label class="chk" style="margin:0"><input type="checkbox" data-imau="${esc(r.name)}"${imAu.sel.has(r.name) ? " checked" : ""}> <b>${esc(r.name)}</b></label>`
          : `<b>${esc(r.name)}</b>`}
        ${chip(r)} <span class="mini muted">${esc(r.label)}</span>
      </div></div>`).join("");
    const done = imAu.results ? `<p class="mini" style="margin:8px 0 0"><b>${imAu.results.filter(r => r.ok).length}/${imAu.results.length} created.</b>${imAu.results.some(r => r.ok && !r.adminOk) ? ` <span style="color:var(--off)">${imAu.results.filter(r => r.ok && !r.adminOk).length} without a scoped administrator.</span>` : ""}</p>` : "";
    return `<div class="cg-panel">
      <h4>🛡 PROTECTION — ${imAu.rows.length} PERSONA VAULT${imAu.rows.length === 1 ? "" : "S"} FOR THIS IMPORT</h4>
      <p class="mini" style="margin:0 0 8px">Each group this import creates is added to its persona's restricted administrative unit, so a tenant-wide Groups Administrator cannot quietly widen a Conditional Access exclusion. Only the personas your selection touches are listed.</p>
      <div class="cg-pick">${rows}</div>
      ${imAu.missing.length ? `<div class="row" style="justify-content:flex-start;margin-top:10px">
          <button class="btn sm" id="imAuAll">${imAu.sel.size === imAu.missing.length ? "☐ Deselect all" : "☑ Select all"}</button>
          <button class="btn" id="imAuGo">Create ${imAu.sel.size} unit${imAu.sel.size === 1 ? "" : "s"} first</button>
        </div>
        <p class="mini muted" style="margin:8px 0 0">Created restricted, with you as Groups Administrator scoped to each. <b>Optional</b> — skip it and the import still runs; the groups land unprotected and the report names every one of them.</p>` : ""}
      ${done}
      <div id="imAuLog" class="mini" style="margin-top:8px">${(imAu.log || []).join("")}</div>
    </div>`;
  }

  async function imLoaded(bundle, fileName) {
    imBundle = bundle; imFileName = fileName;
    // pass the tenant's raw policies (not just names) so "match & replace" can
    // read the current assignment and id of a policy it supersedes
    imPlan = Importer.plan(bundle, policies.map(p => p.raw));
    const dep = ["groups", "namedLocations", "authStrengths", "authContexts", "termsOfUse"].map(k => `${bundle[k].length} ${k}`).join(", ");
    $("imDesc").textContent = `${fileName}: ${bundle.policies.length} policies, dependencies: ${dep}.`;
    // Only worth a Graph call when the file actually contains one.
    imLic = imPlan.some(p => p.wid)
      ? (isDemo ? { known: true, licensed: false, sku: null } : await Importer.workloadIdLicence())
      : { known: false, licensed: false, sku: null };
    await imLoadAu();
    imRenderList();
    $("imPick").style.display = "none";
  }

  // Rebuilds the plan list — called on load and whenever the assignment mode
  // toggles, since the per-row hint depends on the mode.
  function imRenderList() {
    const importable = imPlan.filter(p => !p.exists && !imWidBlocked(p));
    const nUpg = imPlan.filter(p => p.upgrade).length;
    const replace = imMode === "replace";
    const nWid = imPlan.filter(p => p.wid && !p.exists).length;

    // Persona filter: how many importable policies each persona has, so you can
    // bring in just one persona's set from a whole-tenant backup.
    const counts = new Map();
    importable.forEach(p => { const k = imPersonaKey(p); counts.set(k, (counts.get(k) || 0) + 1); });
    const order = ["global", "admins", "internals", "externals", "guestusers", "g_admins", "serviceaccounts", "devops", "factoryworkers", "eadmins", "other"];
    const chips = [...counts.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map(k => `<button class="btn sm persona-chip" data-im-persona="${esc(k)}">${esc(imPersonaLabel(k))} (${counts.get(k)})</button>`).join("");

    const rowHint = (p) => {
      if (p.exists) return esc(p.reason);
      if (imWidBlocked(p)) return `<span style="color:var(--off)">workload identity — this tenant has no Microsoft Entra Workload ID licence, so Graph will not create it</span>`;
      if (p.upgrade) return replace
        ? `♻️ replaces the current v${esc(p.existing.ver)} — assignment + state kept (new exclusions merged), old policy switched Off`
        : `→ ${esc(p.personaGroup || "")} · <span style="color:var(--muted)">current v${esc(p.existing.ver)} stays as-is</span>`;
      if (p.personaGroup) return `→ ${esc(p.personaGroup)}`;
      return esc(p.reason || "");
    };

    $("imBody").innerHTML = `
      ${imAuPanel()}
      <div class="im-mode" role="radiogroup" aria-label="Assignment mode">
        <label class="im-mode-opt${!replace ? " on" : ""}"><input type="radio" name="imMode" value="deploy" ${!replace ? "checked" : ""}>
          <b>🚀 Deployment groups</b><span class="mini">Includes remapped to the deploy persona group (CAD-SEC-U-DG-*) — staged, nothing existing is touched.</span></label>
        <label class="im-mode-opt${replace ? " on" : ""}"><input type="radio" name="imMode" value="replace" ${replace ? "checked" : ""}>
          <b>♻️ Match &amp; replace</b><span class="mini">A policy already in this tenant keeps its current assignment and state (plus any new exclusion groups this version adds); its old version is switched Off.${nUpg ? ` ${nUpg} match${nUpg === 1 ? "es" : "es"} here.` : " No matches in this file."}</span></label>
      </div>
      ${nWid && imLic.known && !imLic.licensed ? `<div class="danger-note" style="margin:10px 0">
        🔒 <b>${nWid} workload-identity ${nWid === 1 ? "policy is" : "policies are"} held back.</b> They target service principals, which needs the separately purchased
        <b>Microsoft Entra Workload ID</b> licence — not included in Entra ID P1/P2 — and this tenant has none, so Graph would reject them with a bare 400.
        Buy or trial the licence, then re-import; nothing else has to be redone.</div>` : ""}
      ${nWid && imLic.known && imLic.licensed ? `<p class="mini" style="margin:8px 0">✅ Workload ID licence found${imLic.sku ? ` (<b>${esc(imLic.sku)}</b>)` : ""} — the ${nWid} workload-identity ${nWid === 1 ? "policy" : "policies"} can be imported.</p>` : ""}
      ${nWid && !imLic.known ? `<p class="mini" style="margin:8px 0">⚠ Could not read the tenant's licences, so the ${nWid} workload-identity ${nWid === 1 ? "policy is" : "policies are"} attempted anyway — a 400 on those means the Workload ID licence is missing.</p>` : ""}
      <p class="mini" style="margin:8px 0">Dependencies are imported first (create-if-missing). Policies always land in state <b>Off</b>, and one with the same CA number + version is skipped.${isDemo ? " <b>Demo — simulated.</b>" : ""}</p>
      <p class="mini" style="margin:6px 0 4px"><b>Import only:</b> pick a persona to select just its policies, or use All / None.</p>
      <div class="persona-row" style="margin-bottom:10px">
        <button class="btn sm" data-im-persona="__all">All (${importable.length})</button>
        <button class="btn sm" data-im-persona="__none">None</button>
        ${chips}
      </div>
      <ul class="plist2" style="border:1px solid var(--border);border-radius:8px">` +
      imPlan.map((p, i) => `<li data-imrow="${i}" data-imkey="${esc(imPersonaKey(p))}"><label class="chk" style="margin:0">
        <input type="checkbox" data-imp="${i}" ${p.exists || imWidBlocked(p) ? "disabled" : "checked"}>
        ${p.exists ? '<span class="tag">skip</span>' : imWidBlocked(p) ? '<span class="tag block" title="Conditional Access for workload identities requires the Microsoft Entra Workload ID licence">🔒 no Workload ID licence</span>' : p.upgrade ? '<span class="tag grant">update</span>' : p.asIs ? '<span class="tag new">as-is</span>' : `<span class="tag grant">import</span>`}
        ${p.needsTou ? '<span class="tag block" title="Grants a Terms of use — create the ToU in the portal first, then re-import; it imports now without that control">📜 needs ToU</span>' : ""}
        ${esc(p.name)}
        <span class="mini">${rowHint(p)}${p.needsTou && !p.exists ? ' · <span style="color:var(--off)">imports without the Terms of use until you create it</span>' : ""}</span>
      </label></li>`).join("") + "</ul>";
    $("imGo").style.display = importable.length ? "inline-flex" : "none";
    updateImGo();
  }

  // Tick exactly the importable policies of one persona (or all / none). An
  // "already exists" row is disabled and never touched.
  function imSelectPersona(key) {
    const single = key !== "__all" && key !== "__none";
    imPlan.forEach((p, i) => {
      const cb = document.querySelector(`[data-imp="${i}"]`);
      if (cb && !cb.disabled) cb.checked = key === "__all" ? true : key === "__none" ? false : imPersonaKey(p) === key;
      // Picking one persona narrows the list to just its policies; All / None
      // show everything again.
      const row = document.querySelector(`[data-imrow="${i}"]`);
      if (row) row.style.display = (!single || imPersonaKey(p) === key) ? "" : "none";
    });
    updateImGo();
  }
  function updateImGo() {
    const n = document.querySelectorAll("[data-imp]:checked").length;
    const btn = $("imGo");
    btn.disabled = n === 0;
    btn.textContent = n ? `Import ${n}` : "Import";
  }
  $("imBody").addEventListener("click", async (e) => {
    if (e.target.id === "imAuAll") {
      imAu.sel = imAu.sel.size === imAu.missing.length ? new Set() : new Set(imAu.missing.map(r => r.name));
      imRenderList();
      return;
    }
    if (e.target.id === "imAuGo") { await imAuCreate(e.target); return; }
    const chip = e.target.closest("[data-im-persona]");
    if (chip) {
      imSelectPersona(chip.dataset.imPersona);
      // highlight the persona just applied (not All/None)
      document.querySelectorAll("#imBody [data-im-persona]").forEach(b => b.classList.remove("on"));
      if (!chip.dataset.imPersona.startsWith("__")) chip.classList.add("on");
      return;
    }
  });
  $("imBody").addEventListener("change", (e) => {
    if (e.target.matches('input[name="imMode"]')) { imMode = e.target.value; imRenderList(); return; }
    if (e.target.matches("[data-imp]")) updateImGo();
    const b = e.target.closest("[data-imau]");
    if (b) {
      b.checked ? imAu.sel.add(b.dataset.imau) : imAu.sel.delete(b.dataset.imau);
      imRenderList();
    }
  });

  // Create the vaults the import is about to need. Deliberately a separate
  // click from Import: creating administrative units and granting yourself a
  // role is a different kind of act from restoring policies, and should not
  // ride along inside a button labelled Import.
  async function imAuCreate(btn) {
    const picked = imAu.missing.filter(r => imAu.sel.has(r.name));
    if (!picked.length) { toast("Nothing selected"); return; }
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...RU_BASE_SCOPES])) return;
    btn.disabled = true;
    const lines = []; imAu.log = lines;
    const say = (h) => { lines.push(h); const el = $("imAuLog"); if (el) el.innerHTML = lines.join(""); };

    let me = null, role = null, roleErr = null;
    if (isDemo) me = { id: "demo-me", displayName: "You", userPrincipalName: "you@demo" };
    else {
      try { me = await Graph.gget("/me?$select=id,displayName,userPrincipalName"); }
      catch (e) { say(`<div style="color:var(--off)">Could not read your own account (${esc(e.message || e)}) — units will be created with no scoped administrator.</div>`); }
      if (me) { try { role = await ensureDirectoryRole(GROUPS_ADMIN_TEMPLATE); } catch (e) { roleErr = e.message || String(e); } }
    }

    const results = [];
    for (const r of picked) {
      const res = { name: r.name, code: r.code, ok: false, admin: me ? me.userPrincipalName : "" };
      try {
        const au = isDemo ? { id: "demo-au-" + r.code }
          : await Graph.gpost("/administrativeUnits", { displayName: r.name, description: r.description, isMemberManagementRestricted: true });
        res.ok = true; res.id = au.id;
        imAu.byCode[r.code] = au.id;              // the import can place into it now
        say(`<div>✓ created <b>${esc(r.name)}</b></div>`);
        if (me) {
          try {
            if (roleErr) throw new Error(roleErr);
            if (!isDemo) await Graph.gpost(`/administrativeUnits/${au.id}/scopedRoleMembers`, { roleId: role.id, roleMemberInfo: { id: me.id } });
            res.adminOk = true;
            say(`<div>&nbsp;&nbsp;✓ ${esc(me.userPrincipalName)} scoped as Groups Administrator</div>`);
          } catch (e) {
            res.adminError = e.message || String(e);
            say(`<div style="color:var(--off)">&nbsp;&nbsp;✗ scoped administrator NOT granted — ${esc(res.adminError)}. Groups placed here will be manageable by nobody until one is.</div>`);
          }
        }
      } catch (e) {
        res.error = e.message || String(e);
        say(`<div style="color:var(--off)">✗ ${esc(r.name)} — ${esc(res.error)}</div>`);
      }
      results.push(res);
    }
    imAu.results = results;
    // Re-derive from what actually happened rather than re-reading: directory
    // writes are not read-your-writes consistent, and a re-read that misses a
    // unit created two seconds ago would wrongly offer to create it again.
    const madeNames = new Set(results.filter(r => r.ok).map(r => r.name));
    imAu.rows = imAu.rows.map(r => madeNames.has(r.name) ? { ...r, status: "present", id: imAu.byCode[r.code] } : r);
    imAu.missing = imAu.rows.filter(r => r.status === "missing");
    imAu.sel = new Set(imAu.missing.map(r => r.name));
    btn.disabled = false;
    imRenderList();
    toast(`${results.filter(r => r.ok).length}/${results.length} administrative unit(s) created${isDemo ? " (simulated)" : ""}`);
  }
  $("imZip").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await imLoaded(await Importer.readZip(f), f.name); }
    catch (err) { console.error(err); toast(`Could not read zip: <span>${esc(err.message || err)}</span>`); }
  });
  $("imFolder").addEventListener("change", async (e) => {
    if (!e.target.files.length) return;
    try { await imLoaded(await Importer.readFolder([...e.target.files]), "selected folder"); }
    catch (err) { console.error(err); toast(`Could not read folder: <span>${esc(err.message || err)}</span>`); }
  });
  $("imGo").addEventListener("click", async () => {
    const chosen = [...document.querySelectorAll("[data-imp]:checked")].map(cb => imPlan[+cb.dataset.imp]);
    if (!chosen.length) { toast("Nothing selected to import"); return; }
    // Consent first, while the click is still fresh — an import creates
    // dependencies (groups, locations) as well as policies, so ask for both.
    const placing = !!(imAu && !imAu.error && Object.keys(imAu.byCode).length);
    if (!await preConsent([...AUTH_CONFIG.scopes, "Policy.ReadWrite.ConditionalAccess",
      "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory",
      ...(placing ? ["AdministrativeUnit.ReadWrite.All"] : [])])) return;
    $("imGo").disabled = true;
    try {
      let depLog = { created: [], reused: [], warnings: [] }, maps = { group: {}, loc: {}, strength: {}, ctx: {}, tou: {}, personaGroupIds: {} }, res = { results: [], warnings: [] };
      // Only build the dependencies the CHOSEN policies need — importing one
      // persona should not create every group in a whole-tenant backup.
      const scoped = Importer.scopeBundle(imBundle, chosen.map(p => p.raw));
      // policies that will be replaced in place don't need a deploy group made
      const matchedNames = imMode === "replace" ? chosen.filter(p => p.upgrade).map(p => p.name) : [];
      if (isDemo) {
        chosen.forEach(p => { if (p.personaGroup && !matchedNames.includes(p.name)) maps.personaGroupIds[p.personaGroup] = "g-" + p.personaGroup; });
        res.results = chosen.map(p => {
          const matched = imMode === "replace" && p.upgrade;
          return { name: p.name, ok: true, persona: p.persona, personaGroup: matched ? null : p.personaGroup, matched, disabledOld: matched, oldName: matched ? p.existing?.name : null, state: matched ? (p.existing?.raw?.state || "disabled") : "disabled" };
        });
        depLog.created = scoped.groups.map(g => "Group: " + g.displayName + " (assigned)");
        // Simulate the placement too, so the demo report shows the same three
        // outcomes as a real run rather than a tidier story than the truth.
        if (imAu && !imAu.error) {
          depLog.placed = []; depLog.placeFailed = []; depLog.unplaced = [];
          const per = Importer.groupPersonas(scoped, scoped.policies);
          for (const g of scoped.groups) {
            const info = per.get(g.id);
            // info.code, not info.persona: since build 25046 the vault is read
            // from the group's own name, and `persona` is null for every group
            // routed that way — which is nearly all of them.
            const code = info ? info.code : null;
            if (code && imAu.byCode[code]) depLog.placed.push({ name: g.displayName, code });
            else depLog.unplaced.push({ name: g.displayName, code, why: !code ? ((info && info.why) || "no persona could be read from the policies that use it") : `no restricted unit for ${code}` });
          }
        }
      } else {
        const dep = await Importer.ensureDependencies(scoped, (m) => toast(esc(m)), { matchedNames, auByCode: imAu && !imAu.error ? imAu.byCode : null });
        depLog = dep.log; maps = dep.maps;
        res = await Importer.importPolicies(chosen, maps, (m) => toast(esc(m)), { mode: imMode });
      }
      // Change report — shown on screen and downloadable. A failed import is
      // the case you most need to read, so it should not require opening a file.
      const md = Importer.buildReport({ tenantName, fileName: imFileName, depLog, planItems: imPlan, results: res.results, warnings: res.warnings, mode: imMode, licence: imLic });
      const failed = res.results.filter(r => !r.ok).length;
      $("importModal").classList.remove("open");
      showReport("📥 Import report", "CA-Import-Report", md);
      toast(failed ? `Import done with <span>${failed} failure(s)</span>`
        : `Imported <span>${res.results.length}</span> policies (Off)${isDemo ? " (simulated)" : ""}`);
      if (!isDemo && res.results.some(r => r.ok)) await loadFromGraph(true);
    } catch (e) {
      console.error(e); toast(`Import failed: <span>${esc(e.message || e)}</span>`);
    } finally { $("imGo").disabled = false; }
  });

  // ---------- Conditional Access groups ----------
  // One tool for the group side of the baseline: check what exists, create what
  // does not, read who is in them, and assign them to policies. The assign step
  // is the former standalone tool, unchanged — it just lives here now, next to
  // the groups it assigns.
  let cgmMsg = null;   // ② Create result line — survives the re-scan that follows a create
  // groupId -> { auId, auName } for restricted units. Null until read, and
  // null again if the read fails — the Check tab shows "—" rather than
  // claiming nothing is protected.
  let cgProt = null;
  let cgRes = null, cgTab = "check", cgFilter = "all", cgQuery = "", cgBusy = false, cgStop = false;
  // Default scope: only the groups the tenant's CA policies actually reference.
  // "all" additionally expects every template / baseline group (finds missing).
  let cgScope = "policies";
  const cgMemberSel = new Set();   // group names picked for the member read
  let cgMemberPick = false;        // showing the picker rather than the matrix

  $("toolCaGroups").addEventListener("click", () => { crumb("👥 Conditional Access groups"); openCaGroups(); });

  async function openCaGroups(keepTab) {
    show("screen-cagroups");
    if (!keepTab) { cgTab = "check"; cgFilter = "all"; cgQuery = ""; $("cgSearch").value = ""; }
    if (!cgRes) {
      $("cgHead").innerHTML = '<p class="mini">Scanning groups…</p>';
      $("cgChips").innerHTML = ""; $("cgBody").innerHTML = "";
      try {
        cgRes = isDemo ? demoGroupScan() : await CaGroups.scan(policies, {
          scope: cgScope,
          onStatus: (m, done, total) => { const h = $("cgHead"); if (h) h.innerHTML = `<p class="mini">${esc(m)}</p>` + progInline(done, total); },
        });
      } catch (e) {
        console.error(e);
        $("cgHead").innerHTML = `<p class="mini" style="color:var(--off)">Group scan failed: ${esc(e.message || e)}</p>`;
        return;
      }
      // Where each group actually lives. One call for the whole tenant, and
      // deliberately non-fatal: not being allowed to read administrative units
      // must not cost you the group scan. It leaves cgProt null, and the
      // Protection column then shows "—" rather than "not protected".
      if (!isDemo) {
        try { cgProt = await readProtectionMap(); }
        catch (e) { cgProt = null; console.warn("protection read failed:", e.message || e); }
      }
    }
    renderCaGroups();
  }

  // Demo mode has no directory, so synthesise a scan that still exercises every
  // status — otherwise the demo silently shows an empty tool.
  function demoGroupScan() {
    // A representative sample, not the first 24 in file order. The old slice(0,24)
    // happened to take BreakGlass plus twenty-odd numbered exclusions, so the
    // persona groups and the Emergency_Access pair — the ones a reviewer looks
    // for first — never appeared, and demo mode read as though the baseline had
    // forgotten them. Named groups first, then a spread of exclusions.
    const all = (typeof GROUP_TEMPLATES !== "undefined" ? GROUP_TEMPLATES : []);
    const named = all.filter((t) => !/-(Exclusion|Inclusion)$/.test(t.displayName));
    const excl = all.filter((t) => /-(Exclusion|Inclusion)$/.test(t.displayName));
    // one exclusion per persona band (CA0xx global, CA1xx admins, CA2xx …) so the
    // demo shows the numbering scheme rather than twenty consecutive neighbours
    const band = new Set();
    const spread = excl.filter((t) => {
      const m = t.displayName.match(/CA(\d+)-/);
      const b = m ? String(m[1]).padStart(4, "0").slice(0, 2) : "??";
      if (band.has(b)) return false;
      band.add(b); return true;
    });
    const names = [...named, ...spread, ...excl].filter((t, i, a) => a.indexOf(t) === i).slice(0, 24);
    const rows = names.map((t, i) => ({
      name: t.displayName, status: i % 5 === 0 ? "missing" : "present",
      sources: ["template"], template: t, id: i % 5 === 0 ? null : "g-demo-" + i,
      description: t.description || "", roleAssignable: !t.membershipRule,
      dynamic: !!t.membershipRule, membershipRule: t.membershipRule || "",
      refs: { include: [], exclude: i % 3 === 1 && i % 5 !== 0 ? ["d1", "d2"].slice(0, (i % 2) + 1) : [] }, refCount: i % 3,
      members: null, memberTotal: null, memberError: null, drift: null,
    }));
    const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
    const expectedTotal = rows.length;
    return { rows, counts, expectedTotal, present: counts.present || 0,
      coverage: Math.round(((counts.present || 0) / expectedTotal) * 100), scanned: new Date() };
  }

  function renderCaGroups() {
    if (!cgRes) return;
    $("cgHead").innerHTML = CaGroups.renderSummary(cgRes, tenantName);
    [...document.querySelectorAll("#cgTabs button")].forEach(b =>
      b.classList.toggle("active", b.dataset.cgtab === cgTab));
    $("cgChips").innerHTML = cgTab === "check" ? CaGroups.chips(cgRes, cgFilter) : "";
    $("cgChips").style.display = cgTab === "check" ? "flex" : "none";
    $("cgFull").style.display = cgTab === "members" ? "inline-flex" : "none";
    $("cgArchived").style.display = cgTab === "check" ? "inline-flex" : "none";
    $("cgSearch").placeholder = cgTab === "members"
      ? "Search member name or UPN…" : "Search group name or object ID…";
    $("cgSearch").style.display = cgTab === "create" || cgTab === "assign" || cgTab === "csv" || cgTab === "rmau" || cgTab === "migrate" ? "none" : "";

    if (cgTab === "check") {
      $("cgBody").innerHTML = CaGroups.renderTable(cgRes, cgFilter, cgQuery, cgProt);
      // disableNesting is invisible to the main scan, so fill it in after the
      // table is already on screen and repaint — the check should never make
      // the tool feel slower to open.
      if (cgRes.rows.some((r) => r.id && r.nesting === undefined)) {
        loadNestingStates(cgRes.rows)
          .then(() => { if (cgTab === "check") $("cgBody").innerHTML = CaGroups.renderTable(cgRes, cgFilter, cgQuery, cgProt); })
          .catch((e) => console.warn("nesting state read failed:", e.message));
      }
    } else if (cgTab === "create") {
      renderCgCreate();
    } else if (cgTab === "members") {
      renderCgMembers();
    } else if (cgTab === "csv") {
      renderCgCsv();
    } else if (cgTab === "rmau") {
      rmauStandalone = false;
      renderCgRmau();
    } else if (cgTab === "migrate") {
      renderCgMigrate();
    } else {
      renderCgAssign();
    }
  }

  // ---- ② create ----
  // Two ways to create, both here and both separate from Assign: batch-create
  // the missing baseline groups, or hand-build one group with full control over
  // role-assignable and static/dynamic.
  function renderCgCreate() {
    const can = CaGroups.creatable(cgRes);
    const cannot = CaGroups.missingNoTemplate(cgRes);
    const batch = (can.length || cannot.length) ? `<div class="cg-panel">
      <h4>CREATE MISSING BASELINE GROUPS (${can.length})</h4>
      <p class="mini">From the bundled templates. Assigned templates are created <b>role-assignable</b>; templates with a membership rule are created <b>dynamic</b>.
        A group that already exists under the same name is reused, never duplicated.</p>
      <div class="cg-pick">${can.map((r, i) =>
        `<label class="chk" style="margin:5px 0"><input type="checkbox" data-cgcreate="${i}" checked> ${esc(r.name)}
          <span class="mini muted">${r.template.membershipRule ? "dynamic" : "role-assignable"}</span></label>`).join("")
        || '<p class="mini muted">No creatable missing groups.</p>'}</div>
      <div class="cg-progress" id="cgCreateBar" style="display:none"><div style="width:0%"></div></div>
      <div id="cgCreateLog" class="mini" style="margin-top:8px"></div>
      ${can.length ? `<div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn" id="cgCreateNone">Clear all</button>
        <button class="btn" id="cgCreateAll">Select all</button>
        <button class="btn primary" id="cgCreateGo">Create selected${isDemo ? " (simulated)" : ""}</button>
      </div>` : ""}
      ${cannot.length ? `<p class="mini" style="margin-top:14px;color:var(--report)">⚠ ${cannot.length} expected group${cannot.length === 1 ? " has" : "s have"} no template
        (named by a baseline catalog but not in the bundled export). Build ${cannot.length === 1 ? "it" : "them"} by hand below: ${cannot.map(r => `<b>${esc(r.name)}</b>`).join(", ")}.</p>` : ""}
    </div>` : "";

    // The manual builder is always present, even when nothing is missing —
    // it is the general-purpose "make me a CA group" path.
    const manual = `<div class="cg-panel">
      <h4>BUILD A GROUP MANUALLY</h4>
      <label class="mini" for="cgmName" style="display:block;margin-bottom:4px">Display name</label>
      <input id="cgmName" class="txt" placeholder="e.g. CAB-SEC-U-Persona-Contractors" autocomplete="off" style="letter-spacing:normal;font-weight:400">
      <label class="mini" for="cgmDesc" style="display:block;margin:10px 0 4px">Description <span class="muted">(optional)</span></label>
      <input id="cgmDesc" class="txt" placeholder="What this group is for" autocomplete="off" style="letter-spacing:normal;font-weight:400">

      <h5 class="mini" style="margin:16px 0 6px">MEMBERSHIP</h5>
      <label class="chk" style="margin:5px 0"><input type="radio" name="cgmType" value="assigned" checked> <b>Assigned</b> — you add members manually</label>
      <label class="chk" style="margin:5px 0"><input type="radio" name="cgmType" value="dynamic"> <b>Dynamic</b> — members set by a rule</label>
      <div id="cgmRuleWrap" style="display:none;margin-top:8px">
        <label class="mini" for="cgmRule" style="display:block;margin-bottom:4px">Membership rule</label>
        <input id="cgmRule" class="txt" placeholder='(user.department -eq "IT")' autocomplete="off" spellcheck="false" style="letter-spacing:normal;font-weight:400">
        <p class="mini muted" style="margin-top:4px">Entra dynamic-membership syntax. The group is created with the rule processing <b>On</b>.</p>
      </div>

      <h5 class="mini" style="margin:16px 0 6px">PROTECTION</h5>
      <label class="chk" style="margin:5px 0"><input type="checkbox" id="cgmRmau"> Place it in a <b>restricted management administrative unit</b> <span class="mini muted">(only roles scoped to that AU can change the members)</span></label>
      <div id="cgmRmauWrap" style="display:none;margin:6px 0 0 24px">
        <select id="cgmRmauPick" class="btn" style="cursor:pointer;width:auto"></select>
        <p class="mini" style="margin:6px 0 0;color:var(--report)">⚠ Order matters: once the group is in the AU, only an <b>AU-scoped role</b> can add members — including this tool. For an <b>assigned</b> group, add the members first and protect it afterwards from ⑥ Protect, unless you already hold a scoped role. A <b>dynamic</b> group fills itself from its rule, so protecting it at creation is safe.</p>
      </div>
      <p class="mini muted" id="cgmRoleWrap" style="margin:8px 0 0"><b>Role-assignable is no longer offered.</b> That flag was only ever used to keep membership out of reach of tenant-wide group administrators, and a restricted AU does the same job, names <i>who</i> may manage it, and can be undone. The two cannot be combined: a role-assignable group admits only Global Administrator and Privileged Role Administrator, and a restricted AU blocks exactly those two. Existing ones move across with <b>⑦ Migrate</b>.</p>
      <p class="mini" id="cgmRoleNote" style="display:none"></p>

      <div id="cgmLog" class="mini" style="margin-top:10px">${cgmMsg || ""}</div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn primary" id="cgmCreate">Create group${isDemo ? " (simulated)" : ""}</button>
      </div>
      <p class="mini muted" style="margin-top:10px">Security group, mail-disabled. Consents <code>Group.ReadWrite.All</code> on demand, plus <code>AdministrativeUnit.ReadWrite.All</code> if you protect it. An existing group with the same name is reused.</p>
    </div>`;

    $("cgBody").innerHTML = batch + manual;
  }

  // ---- ⑤ import members from CSV ----
  // The deployment-test path: a CSV of pilot users (UPN + optional Persona
  // column) routed into the CA groups. Stage machine: pick → map → review →
  // done, with the same review-before-apply as every other write.
  let cgCsv = null;   // { fileName, cols, rows, upnCol, personaCol, users, personas, mapping, manualTargets, plan, results, busy }

  // Groups you can actually add members to: present in the tenant, not dynamic
  // (Entra manages those memberships — an add is rejected). By default only
  // groups that belong to the baseline deployment model (templates + catalog)
  // are offered — a policy also references ad-hoc exclusion groups like
  // Global-U-Exclude-MFA-P, and routing pilot users into one of those by a
  // name coincidence is exactly the accident to prevent.
  let cgCsvAll = false;   // opt-in: also offer non-baseline, policy-referenced groups
  // "Baseline" is exact template/catalog names PLUS their naming family: the
  // bundled templates only define a few of the CAD-SEC-U-DG-* groups, but a
  // tenant group following that same prefix convention (…-ADM, …-EXT, …-SA)
  // is plainly part of the deployment model, while Global-U-Exclude-MFA-P
  // matches no baseline prefix and stays out.
  function cgCsvBaseline() {
    const names = new Set(), prefixes = new Set();
    const add = (n) => {
      const s = String(n || "").toLowerCase(); if (!s) return;
      names.add(s);
      const seg = s.split("-");
      if (seg.length >= 4) prefixes.add(seg.slice(0, 3).join("-"));
      if (seg.length >= 5) prefixes.add(seg.slice(0, 4).join("-"));
    };
    try { CaGroups.templateNames().forEach((_, n) => add(n)); } catch {}
    try { CaGroups.catalogGroupNames(policies.map((p) => p.raw)).forEach((n) => add(n)); } catch {}
    return { names, prefixes };
  }
  function cgCsvTargets(all) {
    const base = cgCsvBaseline();
    const isBaseline = (name) => {
      const n = String(name || "").toLowerCase();
      return base.names.has(n) || [...base.prefixes].some((p) => n.startsWith(p + "-"));
    };
    return (cgRes ? cgRes.rows : [])
      .filter((r) => r.id && !r.dynamic)
      .filter((r) => (all ?? cgCsvAll)
        || r.template
        || (r.sources || []).some((x) => x === "template" || x === "catalog")
        || isBaseline(r.name))
      .map((r) => r.name).sort();
  }

  function renderCgCsv() {
    const t = cgCsv;
    if (!t) {
      $("cgBody").innerHTML = `<div class="cg-panel">
        <h4>IMPORT MEMBERS FROM CSV (${isDemo ? "demo — simulated" : "deployment tests"})</h4>
        <p class="mini">Add pilot users to the CA groups in bulk — the browser equivalent of the <code>Add-UsersToCAGroup</code> script.
          The CSV needs a <b>UPN column</b>; with a <b>Persona column</b> (e.g. <code>"Global, internals"</code> — separated by <code>, ; |</code> or spaces)
          every user is routed to the mapped group(s) automatically, otherwise you pick the target group(s) by hand and every user goes into all of them.</p>
        <pre class="mini" style="background:var(--soft);border-radius:8px;padding:10px;margin:10px 0">UserPrincipalName,Persona
eva@contoso.com,"Global, internals"
max@contoso.com,"Global, DevOps"</pre>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn primary" id="cgCsvPick">📄 Choose CSV file…</button>
        </div>
        <p class="mini muted" style="margin-top:10px">Nothing is written until you review and confirm. Adds consent <code>Group.ReadWrite.All</code> on demand.
          Dynamic groups are excluded — their membership is rule-managed, so a direct add would be rejected.</p>
      </div>`;
      return;
    }

    // ---- map: columns detected, personas → groups ----
    if (t.stage === "map") {
      const targets = cgCsvTargets();
      const opt = (sel) => ['<option value="">— skip —</option>', ...targets.map((g) =>
        `<option value="${esc(g)}"${g === sel ? " selected" : ""}>${esc(g)}</option>`)].join("");
      const mapRows = t.personaCol
        ? t.personas.map((p) => `<tr><td><b>${esc(p)}</b> <span class="mini muted">${t.users.filter((u) => u.personas.some((x) => x.toLowerCase() === p.toLowerCase())).length} users</span></td>
            <td><select data-cgcsvmap="${esc(p)}">${opt(t.mapping[p] || "")}</select></td></tr>`).join("")
        : "";
      const manual = !t.personaCol
        ? `<p class="mini" style="margin-top:8px">No persona column — pick the target group(s); <b>every</b> user in the CSV is added to all of them.</p>
           <div class="cg-pick">${targets.map((g) => `<label class="chk" style="margin:5px 0"><input type="checkbox" data-cgcsvtarget="${esc(g)}"${(t.manualTargets || []).includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("") || '<p class="mini muted">No assignable groups found — run ① Check first.</p>'}</div>`
        : "";
      $("cgBody").innerHTML = `<div class="cg-panel">
        <h4>MAP THE CSV — <span style="font-weight:400">${esc(t.fileName)}</span></h4>
        <p class="mini">${t.users.length} distinct user${t.users.length === 1 ? "" : "s"} · UPN column <b>${esc(t.upnCol)}</b>${t.personaCol ? ` · persona column <b>${esc(t.personaCol)}</b>` : " · no persona column"}</p>
        ${t.personaCol ? `<table class="cg-table" style="margin-top:8px"><thead><tr><th>Persona (from CSV)</th><th>Target group</th></tr></thead><tbody>${mapRows}</tbody></table>
          <p class="mini muted" style="margin-top:6px">Pre-matched against the tenant's <b>baseline</b> CA groups — check every row before scanning. "— skip —" leaves that persona's users alone. Dynamic groups are not offered.</p>` : manual}
        <label class="chk" style="margin-top:10px;display:block"><input type="checkbox" id="cgCsvAllToggle"${cgCsvAll ? " checked" : ""}> Also offer <b>non-baseline</b> groups that policies reference
          <span class="mini muted">(ad-hoc exclusion groups and the like — off by default, so pilot users can only land in deployment-model groups)</span></label>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn" id="cgCsvBack">← Different file</button>
          <button class="btn primary" id="cgCsvScan">Scan users & memberships</button>
        </div>
      </div>`;
      return;
    }

    // ---- review: the plan, per group ----
    if (t.stage === "review") {
      const adds = t.plan.filter((x) => x.state === "add");
      const byGroup = new Map();
      t.plan.forEach((x) => { const k = x.group || "(no group)"; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(x); });
      const ICON = { add: ["＋ add", "ok"], already: ["✓ already member", "muted"], notfound: ["✗ not found", "off"], skipped: ["– skipped", "muted"] };
      $("cgBody").innerHTML = `<div class="cg-panel">
        <h4>REVIEW BEFORE APPLYING — <span style="font-weight:400">${esc(t.fileName)}</span></h4>
        <p class="mini"><b>${adds.length}</b> member add${adds.length === 1 ? "" : "s"} across ${[...byGroup.keys()].filter((g) => byGroup.get(g).some((x) => x.state === "add")).length} group(s) ·
          ${t.plan.filter((x) => x.state === "already").length} already members · ${t.plan.filter((x) => x.state === "notfound").length} not found</p>
        ${[...byGroup.entries()].map(([g, rows]) => `<div style="margin-top:12px"><b>${esc(g)}</b> <span class="mini muted">${rows.filter((x) => x.state === "add").length} to add</span>
          <ul class="wi-list" style="margin-top:4px">${rows.map((x) => `<li><div class="wi-pn" style="font-weight:400">
            <span class="mini" style="color:var(--${(ICON[x.state] || [])[1] === "ok" ? "on" : (ICON[x.state] || [])[1] === "off" ? "off" : "muted"})">${(ICON[x.state] || ["?"])[0]}</span>
            ${esc(x.upn)}${x.persona ? ` <span class="mini muted">(${esc(x.persona)})</span>` : ""}</div></li>`).join("")}</ul></div>`).join("")}
        <div class="cg-progress" id="cgCsvBar" style="display:none"><div style="width:0%"></div></div>
        <div id="cgCsvLog" class="mini" style="margin-top:8px"></div>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn" id="cgCsvBack">← Back to mapping</button>
          ${adds.length ? `<button class="btn primary" id="cgCsvApply">Add ${adds.length} member${adds.length === 1 ? "" : "s"}${isDemo ? " (simulated)" : ""}</button>` : ""}
        </div>
      </div>`;
      return;
    }

    // ---- done ----
    const ok = t.results.filter((x) => x.state === "added").length;
    const failed = t.results.filter((x) => x.state === "failed").length;
    $("cgBody").innerHTML = `<div class="cg-panel">
      <h4>IMPORT COMPLETE</h4>
      <p class="mini"><b style="color:var(--on)">${ok} added</b>${failed ? ` · <b style="color:var(--off)">${failed} failed</b>` : ""} ·
        ${t.results.filter((x) => x.state === "already").length} already members · ${t.results.filter((x) => x.state === "notfound").length} not found</p>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn" id="cgCsvReport">📄 Change report</button>
        <button class="btn" id="cgCsvAgain">Import another CSV</button>
      </div>
      <p class="mini muted" style="margin-top:10px">③ Members re-reads live, so the matrix reflects the adds on its next scan.</p>
    </div>`;
  }

  $("cgCsvFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const text = await f.text();
    const { cols, rows } = CaGroups.csvParse(text);
    if (!rows.length) { toast("That CSV has no data rows"); return; }
    const { upnCol, personaCol } = CaGroups.csvDetect(cols, rows);
    if (!upnCol) { toast("Could not find a UPN column"); return; }
    const users = CaGroups.csvUsers(rows, upnCol, personaCol);
    const personas = [...new Set(users.flatMap((u) => u.personas.map((p) => p.toLowerCase())))]
      .map((k) => users.flatMap((u) => u.personas).find((p) => p.toLowerCase() === k));
    const targets = cgCsvTargets();
    const mapping = {};
    personas.forEach((p) => { mapping[p] = CaGroups.csvSuggest(p, targets); });
    cgCsv = { stage: "map", fileName: f.name, cols, rows, upnCol, personaCol, users, personas, mapping, manualTargets: [] };
    renderCgCsv();
  });
  $("cgBody").addEventListener("change", (e) => {
    // Snapshot the free-text inputs before a re-render, so a checkbox toggle
    // doesn't eat what was typed but not yet blurred.
    if (rmauChange(e)) return;
    if (e.target.id === "cgCsvAllToggle" && cgCsv) {
      cgCsvAll = e.target.checked;
      // Re-suggest only where nothing is picked yet, or the pick fell out of
      // the narrowed list — never clobber a mapping the user chose.
      const targets = cgCsvTargets();
      for (const p of cgCsv.personas) {
        if (!cgCsv.mapping[p] || !targets.includes(cgCsv.mapping[p])) {
          cgCsv.mapping[p] = CaGroups.csvSuggest(p, targets);
        }
      }
      cgCsv.manualTargets = (cgCsv.manualTargets || []).filter((g) => targets.includes(g));
      renderCgCsv();
      return;
    }
    const m = e.target.closest("[data-cgcsvmap]");
    if (m && cgCsv) { cgCsv.mapping[m.dataset.cgcsvmap] = m.value; return; }
    const mt = e.target.closest("[data-cgcsvtarget]");
    if (mt && cgCsv) {
      const set = new Set(cgCsv.manualTargets || []);
      mt.checked ? set.add(mt.dataset.cgcsvtarget) : set.delete(mt.dataset.cgcsvtarget);
      cgCsv.manualTargets = [...set];
    }
  });

  // Resolve every user and every target group's membership, then build the
  // add/skip plan. Reads only — the write happens after the review.
  async function cgCsvScan() {
    const t = cgCsv; if (!t || t.busy) return;
    const groupByName = new Map((cgRes ? cgRes.rows : []).filter((r) => r.id).map((r) => [r.name, r]));
    // (upn, group) pairs this CSV wants
    const wanted = [];
    for (const u of t.users) {
      if (t.personaCol) {
        for (const p of u.personas) {
          const g = t.mapping[t.personas.find((x) => x.toLowerCase() === p.toLowerCase())] || "";
          if (g) wanted.push({ upn: u.upn, persona: p, group: g });
          else wanted.push({ upn: u.upn, persona: p, group: "", state: "skipped" });
        }
        if (!u.personas.length) wanted.push({ upn: u.upn, persona: "", group: "", state: "skipped" });
      } else {
        const targets = t.manualTargets || [];
        if (!targets.length) { toast("Pick at least one target group"); return; }
        targets.forEach((g) => wanted.push({ upn: u.upn, persona: "", group: g }));
      }
    }
    t.busy = true;
    $("cgBody").innerHTML = '<div class="run-prompt"><div class="spinner"></div><p class="mini muted" id="cgCsvStatus">Resolving users…</p><div id="cgCsvBar" style="width:100%"></div></div>';
    const status = (m, done, total) => { const el = $("cgCsvStatus"); if (el) el.textContent = m; const bar = $("cgCsvBar"); if (bar) bar.innerHTML = progInline(done, total); };
    try {
      // users
      const ids = {};
      const uniqueUpns = [...new Set(wanted.filter((w) => w.group).map((w) => w.upn))];
      for (let i = 0; i < uniqueUpns.length; i++) {
        const upn = uniqueUpns[i];
        status(`Resolving users… ${i + 1}/${uniqueUpns.length}`, i + 1, uniqueUpns.length);
        if (isDemo) { ids[upn] = "u-" + upn; continue; }
        try {
          const f = upn.replace(/'/g, "''");
          const r = await Graph.gget(`/users?$filter=userPrincipalName eq '${f}'&$select=id,userPrincipalName`);
          ids[upn] = r.value && r.value[0] ? r.value[0].id : null;
        } catch { ids[upn] = null; }
      }
      // memberships, one read per target group
      const memberSets = {};
      const groups = [...new Set(wanted.filter((w) => w.group).map((w) => w.group))];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        status(`Reading members of ${g}… ${i + 1}/${groups.length}`, i + 1, groups.length);
        const row = groupByName.get(g);
        if (!row) { memberSets[g] = null; continue; }
        if (isDemo) { memberSets[g] = new Set(t.users.filter((_, j) => j % 4 === 0).map((u) => "u-" + u.upn)); continue; }
        try {
          const ms = await Graph.ggetAll(`/groups/${row.id}/members?$select=id&$top=999`);
          memberSets[g] = new Set(ms.map((m) => m.id));
        } catch { memberSets[g] = new Set(); }
      }
      t.plan = wanted.map((w) => {
        if (w.state === "skipped") return w;
        const uid = ids[w.upn];
        if (!uid) return { ...w, state: "notfound" };
        if (memberSets[w.group] && memberSets[w.group].has(uid)) return { ...w, state: "already", uid };
        return { ...w, state: "add", uid, gid: (groupByName.get(w.group) || {}).id };
      });
      t.stage = "review";
    } catch (e) {
      console.error("CSV scan failed:", e);
      toast(`Scan failed: <span>${esc(e.message || e)}</span>`);
      t.stage = "map";
    } finally { t.busy = false; }
    renderCgCsv();
  }

  async function cgCsvApply(btn) {
    const t = cgCsv; if (!t || t.busy) return;
    const adds = t.plan.filter((x) => x.state === "add");
    if (!adds.length) return;
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "Group-NestingSupport.ReadWrite.All"])) return;
    t.busy = true; btn.disabled = true; t.log = null;
    const bar = $("cgCsvBar"), log = $("cgCsvLog");
    bar.style.display = "block";
    const lines = [];
    t.results = t.plan.filter((x) => x.state !== "add").map((x) => ({ ...x, state: x.state === "already" ? "already" : x.state }));
    for (let i = 0; i < adds.length; i++) {
      const a = adds[i];
      bar.firstElementChild.style.width = `${Math.round(((i + 1) / adds.length) * 100)}%`;
      try {
        if (!isDemo) await Graph.gpost(`/groups/${a.gid}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/beta/directoryObjects/${a.uid}` });
        t.results.push({ ...a, state: "added" });
        lines.push(`<div>✓ ${esc(a.upn)} → <b>${esc(a.group)}</b></div>`);
      } catch (err) {
        t.results.push({ ...a, state: "failed", error: err.message || String(err) });
        lines.push(`<div style="color:var(--off)">✗ ${esc(a.upn)} → <b>${esc(a.group)}</b> — ${esc(err.message || err)}</div>`);
      }
      log.innerHTML = lines.slice(-12).join("");
    }
    t.busy = false; t.stage = "done";
    const ok = t.results.filter((x) => x.state === "added").length;
    const failed = t.results.filter((x) => x.state === "failed").length;
    toast(failed ? `${ok} added, <span>${failed} failed</span>` : `<span>${ok}</span> member${ok === 1 ? "" : "s"} added${isDemo ? " (simulated)" : ""}`);
    renderCgCsv();
  }

  // ---- ⑥ protect: restricted management administrative unit for the CA
  // exclusion groups. Membership of an exclusion group IS a CA bypass, and a
  // tenant-level Groups Administrator can grant it to anyone, themselves
  // included. A restricted management AU closes that: only roles scoped to the
  // AU can change members. Graph: POST /administrativeUnits with
  // isMemberManagementRestricted:true (immutable), then members/$ref.
  const RMAU_WRITE = ["AdministrativeUnit.ReadWrite.All"];
  const RMAU_DEFAULT_NAME = "CAB-SEC-RMAU-CA-Exclusions";
  const GROUPS_ADMIN_TEMPLATE = "fdd7a751-b60b-444a-984c-02652fe8fa1c"; // Groups Administrator
  let cgRmau = null;  // { status: Map(groupId → {auName, restricted}), rmaus: [], sel: Set, auChoice, auName, admin, busy, results, au }
  // The same workflow is reachable two ways: as ⑥ Protect inside CA groups,
  // and as its own tool tile. One state, one renderer — only the host differs.
  let rmauStandalone = false;
  const rmauBody = () => $(rmauStandalone ? "prBody" : "cgBody");

  // Shared by both hosts (CA groups ⑥ tab and the standalone tool tile).
  async function rmauClick(e) {
    // Select / deselect every SELECTABLE candidate. Role-assignable groups and
    // already-protected ones have disabled checkboxes, so they are not counted
    // and not toggled — an "all" that includes rows you cannot tick is a lie.
    if (e.target.id === "cgRmauRecheck") {
      const t = cgRmau;
      if (!t || rmauBusy) return true;
      rmauBusy = true;
      rmauBody().innerHTML = rmauBusyPanel();
      const say = (m, i, n) => { const el = $("cgRmauStatus"); if (el) el.textContent = m;
        const b = $("cgRmauBar"); if (b) b.innerHTML = progInline(i, n); };
      try {
        // Re-read the administrative units too — one may have been created since.
        if (!isDemo) {
          const aus = await Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted");
          t.rmaus = aus.filter((a) => a.isMemberManagementRestricted === true).map((a) => ({ id: a.id, name: a.displayName }));
        }
        const cands = CaGroups.rmauCandidates(cgRes);
        if (!isDemo) {
          say("Re-reading administrative unit membership…", 1, 2);
          try {
            const map = await readProtectionMap();
            t.statusError = null;
            say(`Matching ${cands.length} groups…`, 2, 2);
            cands.forEach((g) => t.status.set(g.id, map.get(g.id) || null));
          } catch (e) {
            // Leave the previous answers rather than inventing one.
            toast(`Re-check failed: <span>${esc(e.message || e)}</span>`);
          }
        }
        // A group that is protected now cannot also be selected for protecting.
        for (const g of cands) if (t.status.get(g.id)) t.sel.delete(g.id);
      } catch (err) {
        toast(`Re-check failed: <span>${esc(err.message || err)}</span>`);
      }
      rmauBusy = false;
      renderCgRmau();
      return true;
    }
    if (e.target.id === "cgRmauAll") {
      const t = cgRmau;
      if (t) {
        const q = (t.q || "").trim().toLowerCase();
        const pick = CaGroups.rmauCandidates(cgRes)
          .filter((g) => !q || String(g.name || "").toLowerCase().includes(q))
          .filter((g) => !t.status.get(g.id) && !g.roleAssignable && !g.unused);
        const on = pick.filter((g) => t.sel.has(g.id)).length;
        if (on === pick.length) pick.forEach((g) => t.sel.delete(g.id));
        else pick.forEach((g) => t.sel.add(g.id));
        renderCgRmau();
      }
      return true;
    }
    if (e.target.id === "cgRmauQClear" && cgRmau) { cgRmau.q = ""; renderCgRmau(); return true; }
    if (e.target.closest("[data-rmaurun]")) { await cgRmauScan(); return true; }
    if (e.target.id === "cgRmauGo") { await cgRmauApply(e.target); return true; }
    if (e.target.id === "cgRmauAgain") { cgRmau = null; await cgRmauScan(); return true; }
    if (e.target.id === "cgRmauReport" && cgRmau && cgRmau.results) {
      showReport("🔒 Restricted management administrative unit", "CA-ExclusionProtection",
        CaGroups.rmauReport({ tenant: tenantName, generatedBy: Brand.generatedBy("Generated"),
          // every admin, with its own outcome — a partial failure has to be
          // visible in the report, not flattened into "no admin was set"
          scopedAdmins: cgRmau.adminResults || [] }, cgRmau.au, cgRmau.results, cgRmau.units || []));
      return true;
    }
    return false;
  }
  function rmauChange(e) {
    const snap = () => { if (!cgRmau) return;
      const host = rmauBody();
      const a = host.querySelector("#cgRmauAdmin"); if (a) cgRmau.admin = a.value;
      const n = host.querySelector("#cgRmauName"); if (n) cgRmau.auName = n.value;
      const k = host.querySelector("#cgRmauAck"); if (k) cgRmau.ack = k.checked; };
    const rm = e.target.closest("[data-cgrmau]");
    if (rm && cgRmau) {
      snap();
      e.target.checked ? cgRmau.sel.add(rm.dataset.cgrmau) : cgRmau.sel.delete(rm.dataset.cgrmau);
      renderCgRmau();
      return true;
    }
    if (e.target.id === "cgRmauAu" && cgRmau) {
      snap();
      cgRmau.auChoice = e.target.value;
      renderCgRmau();
      return true;
    }
    if (e.target.id === "cgRmauAdmin" && cgRmau) { cgRmau.admin = e.target.value; return true; }
    return false;
  }
  // Resolve a directory-role TEMPLATE id to the ACTIVATED role object, which is
  // what scopedRoleMembers wants. This needs a ladder, not one call:
  //
  //   GET /directoryRoles only returns roles that are ACTIVATED in the tenant.
  //   A role that exists but is not returned by the $filter therefore looks
  //   absent, so the obvious next step — POST /directoryRoles to activate it —
  //   comes back 400 "A conflicting object with one or more of the specified
  //   property values is present in the directory". That error means the role
  //   was already there, so it is a reason to re-read, not to fail.
  //
  // Order: alternate-key GET (documented, exact), then $filter, then activate,
  // then — if activation conflicts — an unfiltered list matched client-side,
  // which cannot be defeated by a filter the tenant declines to honour.
  async function ensureDirectoryRole(roleTemplateId) {
    const byList = async () => (await Graph.ggetAll("/directoryRoles?$select=id,displayName,roleTemplateId"))
      .find((r) => String(r.roleTemplateId).toLowerCase() === String(roleTemplateId).toLowerCase()) || null;
    try {
      const r = await Graph.gget(`/directoryRoles(roleTemplateId='${roleTemplateId}')`);
      if (r && r.id) return r;
    } catch { /* alternate key unsupported or not activated — keep going */ }
    try {
      const r = (await Graph.gget(`/directoryRoles?$filter=roleTemplateId eq '${roleTemplateId}'`)).value?.[0];
      if (r) return r;
    } catch { /* filter declined — keep going */ }
    try {
      const created = await Graph.gpost("/directoryRoles", { roleTemplateId });
      if (created && created.id) return created;
    } catch (e) {
      // "conflicting object" = already activated, and the reads above simply
      // did not see it. Anything else is a real failure worth reporting.
      if (!/conflicting object|already exist/i.test(e.message || "")) throw e;
    }
    const found = await byList();
    if (found) return found;
    throw new Error(`The directory role ${roleTemplateId} could not be resolved or activated.`);
  }

  // Scoped-administrator type-ahead, same shape as the What-If user field.
  let rmauSugTimer = null;
  function rmauInput(e) {
    // The search box lives on the INPUT event, not change: a text input fires
    // `change` only on blur, so filtering-as-you-type has to be handled here.
    // It was in rmauChange, which meant typing did nothing at all until the
    // field lost focus.
    if (e.target.id === "cgRmauQ" && cgRmau) {
      cgRmau.q = e.target.value;
      const pos = e.target.selectionStart;
      renderCgRmau();
      // renderCgRmau rebuilds the panel, so the field being typed into is a
      // different element by the time this returns. Put the caret back.
      const box = rmauBody().querySelector("#cgRmauQ");
      if (box) { box.focus(); try { box.setSelectionRange(pos, pos); } catch {} }
      return;
    }
    if (e.target.id !== "cgRmauAdmin") return;
    if (cgRmau) cgRmau.admin = e.target.value;
    clearTimeout(rmauSugTimer);
    rmauSugTimer = setTimeout(async () => {
      // The box takes a list, so complete the fragment after the last
      // separator — otherwise typing a second name searches for the whole line.
      const t = String(e.target.value).split(/[,;\n]/).pop().trim();
      if (t.length < 2 || isDemo) return;
      try {
        const f = t.replace(/'/g, "''");
        const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
        const dl = rmauBody().querySelector("#cgRmauAdminList");
        if (dl) dl.innerHTML = ((r && r.value) || []).map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
      } catch (err) { console.warn("protect: admin suggest failed", err.message); }
    }, 250);
  }
  $("cgBody").addEventListener("input", rmauInput);
  $("prBody").addEventListener("input", rmauInput);
  $("prBody").addEventListener("click", (e) => { rmauClick(e); });
  $("prBody").addEventListener("change", (e) => { rmauChange(e); });

  // ---------- ⑦ Migrate: role-assignable -> plain group in a restricted AU ----------
  // The destructive one. Everything here is ordered so that a failure leaves the
  // tenant covered: the new group joins every policy BEFORE the old one leaves,
  // and it enters the restricted AU only AFTER its members are in — once inside,
  // nothing but an AU-scoped role could add them.
  let cgMig = null;      // { plan, aus, auChoice, auName, results, ack, nesting, toAu, sel }
  let cgMigBusy = false; // a scan in flight — survives navigating away and back

  function migBody() { return $("cgBody"); }

  async function cgMigScan() {
    if (cgMigBusy) return;
    cgMigBusy = true;
    migBody().innerHTML = migBusyPanel();
    const say = (m, i, n) => { const el = $("cgMigStatus"); if (el) el.textContent = m;
      const b = $("cgMigBar"); if (b) b.innerHTML = progInline(i, n); };
    try {
      if (!cgRes) {
        cgRes = isDemo ? demoGroupScan() : await CaGroups.scan(policies, { scope: cgScope, onStatus: say });
      }
      // Only role-assignable baseline groups are candidates; the rest are listed
      // as skipped so the wizard is honest about what it is not doing.
      const rows = (cgRes.rows || []).filter((r) => r.id || r.roleAssignable);
      const roles = new Map(), protectedIn = new Map();
      const cands = rows.filter((r) => r.id && r.roleAssignable);
      for (let i = 0; i < cands.length; i++) {
        say(`Checking ${cands[i].name}… ${i + 1}/${cands.length}`, i + 1, cands.length);
        if (isDemo) {
          roles.set(cands[i].id, { ok: true, active: [], eligible: [] });
          if (cands[i].memberTotal == null) cands[i].memberTotal = 2;   // demo fixture
          continue;
        }
        roles.set(cands[i].id, await CaGroups.heldRoles(cands[i].id));
        // How many members will actually be copied, so the preview can say so
        // BEFORE you commit. Counted the same way the copy reads them — DIRECT
        // members of every type — not transitiveMembers/user like the ③ Members
        // tab, which would report a different number than the one that moves.
        if (cands[i].memberTotal == null) {
          try {
            const ms = await Graph.ggetAll(`/groups/${cands[i].id}/members?$select=id&$top=999`);
            cands[i].memberTotal = ms.length;
          } catch (e) { console.warn("member count failed for", cands[i].name, e.message); }
        }
        try {
          const r = await Graph.gget(`/groups/${cands[i].id}/memberOf/microsoft.graph.administrativeUnit?$select=id,displayName,isMemberManagementRestricted`);
          const hit = ((r && r.value) || []).find((a) => a.isMemberManagementRestricted === true);
          if (hit) protectedIn.set(cands[i].id, { auId: hit.id, auName: hit.displayName });
        } catch { /* not fatal: the plan just will not know */ }
      }
      let aus = [];
      if (!isDemo) {
        aus = (await Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted"))
          .filter((a) => a.isMemberManagementRestricted === true).map((a) => ({ id: a.id, name: a.displayName }));
      }
      const auChoice = aus.length ? aus[0].id : "new";
      const auName = aus.length ? aus[0].name : RMAU_DEFAULT_NAME;
      cgMig = { aus, auChoice, auName, busy: false, results: null, ack: false, nesting: true, toAu: true, sel: null,
        plan: CaGroups.migratePlan(rows, { roles, protectedIn, rmauName: auName, disableNesting: true }) };
    } catch (e) {
      console.error("Migrate scan failed:", e);
      cgMigBusy = false;
      migBody().innerHTML = `<div class="cg-panel"><h4>SCAN FAILED</h4>
        <p class="mini" style="color:var(--off);margin:0">${esc(e.message || e)}</p>
        <div class="row" style="justify-content:flex-start;margin-top:12px"><button class="btn" data-migrun>▶ Try again</button></div></div>`;
      return;
    }
    cgMigBusy = false;
    renderCgMigrate();
  }

  const migBusyPanel = () => '<div class="run-prompt"><div class="spinner"></div><p class="mini muted" id="cgMigStatus">Scanning… this keeps running if you switch tabs.</p><div id="cgMigBar" style="width:100%"></div></div>';

  function renderCgMigrate() {
    // Same manners as ⑥ Protect: nothing scans until asked — this one reads
    // every role-assignable group's directory-role assignments AND its member
    // count, which is far too much work to fire off just because a tab was
    // clicked. A scan in flight survives navigating away; the result stays
    // until an explicit rescan.
    if (cgMigBusy) { migBody().innerHTML = migBusyPanel(); return; }
    if (!cgMig) {
      migBody().innerHTML = `<div class="run-prompt">
        <button class="btn primary" data-migrun>▶ Scan for role-assignable groups</button>
        <p class="mini muted">Reads the baseline groups, checks each role-assignable one for directory roles and restricted-AU membership, and counts the members that would move. Nothing is written. The result stays until you rescan.</p>
      </div>`;
      return;
    }
    const t = cgMig;
    if (t.results) { renderCgMigResults(); return; }

    const p = t.plan;
    const sel = t.sel || new Set(p.eligible.map((x) => x.id));
    const nSel = p.eligible.filter((x) => sel.has(x.id)).length;
    const auOptions = [...t.aus.map((a) => `<option value="${esc(a.id)}"${t.auChoice === a.id ? " selected" : ""}>${esc(a.name)}</option>`),
      `<option value="new"${t.auChoice === "new" ? " selected" : ""}>➕ Create “${esc(RMAU_DEFAULT_NAME)}”</option>`].join("");

    const rows = p.eligible.map((x) => `<div style="padding:8px 0;border-top:1px solid var(--border)">
        <label class="chk" style="margin:0"><input type="checkbox" data-cgmig="${esc(x.id)}"${sel.has(x.id) ? " checked" : ""}>
          <b>${esc(x.name)}</b></label>
        <span class="tag">${x.nRef} polic${x.nRef === 1 ? "y" : "ies"}</span>${x.memberTotal != null ? ` <span class="tag">${x.memberTotal} member${x.memberTotal === 1 ? "" : "s"}</span>` : ""}
        <ol class="mini muted" style="margin:6px 0 0 20px;padding:0">${x.steps.map((q) => `<li>${esc(q.text)}</li>`).join("")}</ol>
      </div>`).join("");

    migBody().innerHTML = `
      <div class="cg-panel">
        <h4>WHY MIGRATE</h4>
        <p class="mini" style="margin:0 0 8px">Your CA exclusion groups were made <b>role-assignable</b> to keep their membership away from tenant-wide group administrators. A <b>restricted management administrative unit</b> does that job better: it lets you <b>name</b> who may manage them, instead of leaving it to anyone holding Privileged Role Administrator. It also drops the role-assignable costs — the 500-per-tenant cap, no dynamic membership, and no control over nesting.</p>
        <p class="mini" style="margin:0 0 8px;color:var(--off)"><b>The two cannot be combined.</b> A role-assignable group admits only Global Administrator or Privileged Role Administrator; a restricted AU blocks exactly those two, and neither can be scoped to an AU. A group with both has <b>nobody</b> who can change its members.</p>
        <p class="mini muted" style="margin:0"><code>isAssignableToRole</code> is immutable, so each group is <b>recreated</b>: the old one is renamed aside and kept as your rollback, the new one takes its name, members and policy assignments.</p>
      </div>

      ${p.eligible.length ? `<div class="cg-panel">
        <h4>MIGRATE ${p.eligible.length} GROUP${p.eligible.length === 1 ? "" : "S"}</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${p.eligible.length > 1 ? `<button class="btn sm" id="cgMigAll">${nSel === p.eligible.length ? "☐ Deselect all" : "☑ Select all"}</button>` : ""}
          <span class="mini muted">${nSel} of ${p.eligible.length} selected</span>
        </div>
        <div class="cg-pick">${rows}</div>
        <div class="cg-actionbar">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
          <label class="chk" style="margin:0"><input type="checkbox" id="cgMigToAu"${t.toAu !== false ? " checked" : ""}> Place the new groups in a restricted AU now</label>
          <label class="wi-f" style="flex-direction:row;align-items:center;gap:6px;margin:0"><span>Restricted AU</span>
            <select id="cgMigAu" class="btn" style="cursor:pointer;width:auto"${t.toAu === false ? " disabled" : ""}>${auOptions}</select></label>
          <label class="chk" style="margin:0"><input type="checkbox" id="cgMigNest"${t.nesting ? " checked" : ""}> Disable nesting on the new groups</label>
        </div>
        ${t.toAu === false
          ? `<p class="mini" style="margin:8px 0 0;color:var(--report)">The groups will be converted but left <b>unprotected</b> — an ordinary group any tenant-wide Groups Administrator can edit. That is fine as a staged migration: convert now, verify the members, then place them from <b>⑥ Protect</b> when ready.</p>`
          : `<p class="mini muted" style="margin:8px 0 0">Nesting off keeps the one property the role-assignable flag gave you for free: no group can be added as a member, so nobody widens an exclusion by nesting a group inside it.</p>`}
        <label class="chk" style="display:block;margin-top:14px"><input type="checkbox" id="cgMigAck"${t.ack ? " checked" : ""}> I understand each group is <b>recreated</b>: the current group is renamed aside, a new one takes its name and members, every policy is repointed${t.toAu === false ? "" : ", and the new group is placed in the restricted AU — after which only an <b>AU-scoped role</b> can change its members"}.</label>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn primary" id="cgMigGo">Migrate</button>
          <button class="btn" id="cgMigRescan">⟳ Rescan</button>
        </div>
        <div id="cgMigBar2" style="display:none;width:100%;margin-top:12px"></div>
        <div id="cgMigLog" class="mini" style="margin-top:8px"></div>
        </div>
      </div>` : `<div class="cg-panel">
        <h4>NOTHING TO MIGRATE</h4>
        <p class="mini" style="margin:0">No role-assignable baseline group is eligible.${p.skipped.length ? " See below for why." : ""}</p>
        <div class="row" style="justify-content:flex-start;margin-top:12px"><button class="btn" id="cgMigRescan">⟳ Rescan</button></div>
      </div>`}

      ${p.skipped.length ? `<div class="cg-panel">
        <h4>NOT MIGRATED (${p.skipped.length})</h4>
        ${p.skipped.map((x) => `<div style="padding:6px 0;border-top:1px solid var(--border)"><span class="mini"><b>${esc(x.name)}</b> — ${esc(x.reason)}</span></div>`).join("")}
      </div>` : ""}`;
  }

  function renderCgMigResults() {
    const t = cgMig, r = t.results;
    const ok = r.filter((x) => x.ok).length;
    const outside = r.filter((x) => x.ok && !x.inAu);
    migBody().innerHTML = `<div class="cg-panel">
        <h4>MIGRATION ${ok === r.length ? "COMPLETE" : "FINISHED WITH FAILURES"}</h4>
        <p class="mini"><b style="color:var(--on)">${ok} of ${r.length} migrated</b>${ok === r.length ? "" : ` · <b style="color:var(--off)">${r.length - ok} failed</b>`}</p>
        ${r.map((x) => `<div style="padding:8px 0;border-top:1px solid var(--border)">
            <span class="tag ${x.ok ? "grant" : "block"}">${x.ok ? "migrated" : "failed"}</span> <b>${esc(x.name)}</b>
            ${x.membersMoved != null && x.memberTotal != null ? `<span class="tag">${x.membersMoved}/${x.memberTotal} members</span>` : ""}
            ${x.refsMoved != null ? `<span class="tag">${x.refsMoved} policies</span>` : ""}
            ${x.ok ? (x.inAu ? '<span class="tag ok">in the restricted AU</span>' : '<span class="tag block">not protected yet</span>') : ""}
            ${x.error ? `<div class="mini" style="color:var(--off)">${esc(x.error)}</div>` : ""}
            ${x.archiveName ? `<div class="mini muted">rollback: ${esc(x.archiveName)}</div>` : ""}
          </div>`).join("")}
        ${outside.length ? `<p class="mini" style="margin:12px 0 0;color:var(--report)">⚠ <b>${outside.length} group${outside.length === 1 ? " is" : "s are"} converted but not protected.</b> They are ordinary groups now, so any tenant-wide Groups Administrator can change their members until you place them in a restricted AU.</p>` : ""}
        <p class="mini" style="margin:12px 0 0">Check the members of each new group before deleting anything. The archived groups are your rollback — remove them from <b>🧹 Archived groups</b> on the ① Check tab once you are satisfied.</p>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          ${outside.length ? '<button class="btn primary" id="cgMigProtect">🔒 Protect them now (⑥)</button>' : ""}
          <button class="btn" id="cgMigMd">📄 Change report</button>
          <button class="btn" id="cgMigRescan">⟳ Rescan</button>
        </div>
      </div>`;
  }

  migBody().addEventListener("change", (e) => {
    if (!cgMig) return;
    if (e.target.id === "cgMigAu") {
      cgMig.auChoice = e.target.value;
      const hit = cgMig.aus.find((a) => a.id === e.target.value);
      cgMig.auName = hit ? hit.name : RMAU_DEFAULT_NAME;
      return;
    }
    if (e.target.id === "cgMigNest") { cgMig.nesting = e.target.checked; return; }
    if (e.target.id === "cgMigToAu") {
      cgMig.toAu = e.target.checked;
      // Re-plan so the step list, the acknowledgement and the report all agree
      // with what will actually be done.
      cgMig.plan = { ...cgMig.plan, toAu: cgMig.toAu,
        eligible: cgMig.plan.eligible.map((x) => ({ ...x, toAu: cgMig.toAu,
          steps: x.steps.filter((st) => st.key !== "rmau" && st.key !== "noAu").concat(
            cgMig.toAu ? [{ key: "rmau", text: `Add the new group to the restricted AU${cgMig.auName ? ` “${cgMig.auName}”` : ""} — last, so the member copy is still possible` }]
                       : [{ key: "noAu", text: "Leave it outside the restricted AU for now — add it later from ⑥ Protect" }]) })) };
      renderCgMigrate();
      return;
    }
    if (e.target.id === "cgMigAck") { cgMig.ack = e.target.checked; return; }
    const cb = e.target.closest("[data-cgmig]");
    if (cb) {
      cgMig.sel = cgMig.sel || new Set(cgMig.plan.eligible.map((x) => x.id));
      cb.checked ? cgMig.sel.add(cb.dataset.cgmig) : cgMig.sel.delete(cb.dataset.cgmig);
      // Repaint so the counter and the select-all label match the checkboxes —
      // a count that disagrees with what is ticked is worse than no count.
      renderCgMigrate();
    }
  });

  migBody().addEventListener("click", async (e) => {
    if (e.target.closest("[data-migrun]")) { cgMigScan(); return; }
    if (e.target.id === "cgAddGo") { await cgAddMember(); return; }
    if (e.target.id === "cgMigRescan") { cgMig = null; cgRes = null; cgMigScan(); return; }
    if (e.target.id === "cgMigAll") {
      const all = cgMig.plan.eligible.map((x) => x.id);
      const cur = cgMig.sel || new Set(all);
      cgMig.sel = cur.size === all.length ? new Set() : new Set(all);
      renderCgMigrate();
      return;
    }
    if (e.target.id === "cgMigProtect") {
      // The migration nulls cgRes (the scan is stale the moment groups change),
      // and renderCaGroups() returns early without one — so re-scan before
      // switching, or the button appears to do nothing.
      cgTab = "rmau"; rmauStandalone = false;
      if (!cgRes) {
        migBody().innerHTML = `<div class="run-prompt"><div class="spinner"></div><p class="mini muted">Re-reading the groups…</p></div>`;
        try { cgRes = isDemo ? demoGroupScan() : await CaGroups.scan(policies, { scope: cgScope }); }
        catch (err) { toast(`Could not re-read the groups: <span>${esc(err.message || err)}</span>`); return; }
      }
      renderCaGroups();
      return;
    }
    if (e.target.id === "cgMigMd" && cgMig && cgMig.results) {
      showReport("⑦ Migration report", "CA-Migration",
        CaGroups.migrateReport(cgMig.plan, cgMig.results, { tenant: tenantName, auName: cgMig.auName, build: APP_BUILD.label }));
      return;
    }
    if (e.target.id === "cgMigGo") await cgMigRun(e.target);
  });

  async function cgMigRun(btn) {
    const t = cgMig;
    if (!t || t.busy) return;
    if (!$("cgMigAck")?.checked) { toast("Tick the <span>confirmation</span> first — each group is recreated"); return; }
    const sel = t.sel || new Set(t.plan.eligible.map((x) => x.id));
    // Never migrate something the planner refused, whatever the checkboxes say.
    const picked = t.plan.eligible.filter((x) => sel.has(x.id));
    if (!picked.length) { toast("Nothing selected"); return; }
    const scopes = [...AUTH_CONFIG.scopes, ...CaGroups.MIGRATE_SCOPES];
    if (!isDemo && !await preConsent(scopes)) return;

    t.busy = true; btn.disabled = true;
    const bar = $("cgMigBar2"), log = $("cgMigLog");
    bar.style.display = "block";
    const lines = [], results = [];
    const say = (html) => { lines.push(html); log.innerHTML = lines.join(""); };

    // The AU must exist before the first group finishes, but create it once —
    // and not at all if the placement step was switched off.
    const toAu = t.toAu !== false;
    let auId = t.auChoice === "new" ? null : t.auChoice;
    try {
      if (toAu && !auId && !isDemo) {
        const au = await Graph.gpost("/administrativeUnits", {
          displayName: RMAU_DEFAULT_NAME,
          description: "Restricted management administrative unit protecting Conditional Access exclusion groups. Membership changes require a role scoped to this administrative unit.",
          isMemberManagementRestricted: true,
        }, scopes);
        auId = au.id; t.auName = au.displayName;
        say(`<div>✓ created restricted AU <b>${esc(au.displayName)}</b></div>`);
      }
    } catch (err) {
      say(`<div style="color:var(--off)">✗ could not create the restricted AU — ${esc(err.message || err)}. Nothing was migrated.</div>`);
      t.busy = false; btn.disabled = false; return;
    }

    for (let i = 0; i < picked.length; i++) {
      const x = picked[i];
      bar.innerHTML = progInline(i, picked.length);
      const res = { name: x.name, ok: false, memberTotal: x.memberTotal, archiveName: x.archiveName };
      try {
        say(`<div><b>${esc(x.name)}</b></div>`);
        // 1. rename the old one aside
        if (!isDemo) await Graph.gpatch(`/groups/${x.id}`, { displayName: x.archiveName }, scopes);
        say(`<div>&nbsp;&nbsp;✓ renamed to ${esc(x.archiveName)}</div>`);
        // 2. create the replacement — plain, optionally nesting-proof
        let created;
        if (isDemo) { created = { id: "demo-new-" + x.id }; }
        else {
          created = await Assign.createGroup({ displayName: x.name, roleAssignable: false, disableNesting: !!t.nesting }, { mustCreate: true });
          if (!created || !created.id || created.id === x.id) {
            await Graph.gpatch(`/groups/${x.id}`, { displayName: x.name }, scopes).catch(() => {});
            throw new Error("Create returned the existing group — the rename was rolled back and no policy was touched.");
          }
        }
        res.newId = created.id;
        say(`<div>&nbsp;&nbsp;✓ created plain group${t.nesting ? " (nesting disabled)" : ""}</div>`);
        // 3. members BEFORE the AU, or they can never be added
        if (!isDemo) {
          const mm = await moveGroupMembers(x.id, created.id);
          res.membersMoved = mm.moved; res.memberTotal = mm.total;
          say(`<div>&nbsp;&nbsp;✓ ${mm.moved}/${mm.total} members copied${mm.failed.length ? ` — ${mm.failed.length} failed` : ""}</div>`);
        } else { res.membersMoved = res.memberTotal || 0; }
        // 4./5. add the new group everywhere, then remove the old one
        const incIds = x.refs.include.map((q) => q.id), excIds = x.refs.exclude.map((q) => q.id);
        const apply = async (ids, action, id) => {
          if (!ids.length || isDemo) return;
          const r = await Assign.apply(ids, action, [id]);
          const bad = r.filter((q) => !q.ok);
          if (bad.length) throw new Error(`policy update failed on ${bad.length} — the old group is still assigned, so nothing is uncovered`);
        };
        await apply(incIds, 2, created.id);
        await apply(excIds, 3, created.id);
        await apply(incIds, 5, x.id);
        await apply(excIds, 6, x.id);
        res.refsMoved = incIds.length + excIds.length;
        if (res.refsMoved) say(`<div>&nbsp;&nbsp;✓ ${res.refsMoved} policy assignment${res.refsMoved === 1 ? "" : "s"} repointed</div>`);
        // 6. LAST: into the restricted AU — or deliberately not
        if (toAu) {
          if (!isDemo) {
            await Graph.gpost(`/administrativeUnits/${auId}/members/$ref`,
              { "@odata.id": `https://graph.microsoft.com/beta/groups/${created.id}` }, scopes);
          }
          res.inAu = true;
          say(`<div>&nbsp;&nbsp;✓ placed in the restricted AU</div>`);
        } else {
          res.inAu = false;
          say(`<div>&nbsp;&nbsp;• left outside the restricted AU — add it from ⑥ Protect when ready</div>`);
        }
        res.ok = true;
      } catch (err) {
        res.error = err.message || String(err);
        say(`<div style="color:var(--off)">&nbsp;&nbsp;✗ ${esc(res.error)}</div>`);
      }
      results.push(res);
    }
    bar.innerHTML = progInline(picked.length, picked.length);
    t.results = results; t.busy = false; btn.disabled = false;
    cgRes = null;                        // the scan is stale now
    renderCgMigrate();
  }

  // The standalone tile: same scan, same renderer, its own screen. The group
  // scan is the one CA groups uses, so opening either tool primes the other.
  async function openProtect() {
    rmauStandalone = true;
    crumb("🔒 Protect exclusions");
    show("screen-protect");
    renderCgRmau();
  }
  $("toolProtect").addEventListener("click", () => { openProtect(); });

  async function cgRmauScan() {
    if (rmauBusy) return;                     // already scanning — don't start a second pass
    rmauBusy = true;
    rmauBody().innerHTML = rmauBusyPanel();
    const status = (m, done, total) => { const el = $("cgRmauStatus"); if (el) el.textContent = m; const bar = $("cgRmauBar"); if (bar) bar.innerHTML = progInline(done, total); };
    try {
      // The candidates come from the shared group scan; load it here (not on
      // open) so simply visiting the tool costs nothing.
      if (!cgRes) {
        cgRes = isDemo ? demoGroupScan() : await CaGroups.scan(policies, {
          scope: cgScope,
          onStatus: status,
        });
      }
    } catch (e) {
      console.error("Protect: group scan failed", e);
      rmauBusy = false;
      rmauBody().innerHTML = `<p class="mini" style="padding:20px;color:var(--off)">Group scan failed: ${esc(e.message || e)}</p>
        <div class="run-prompt" style="padding:8px 20px 20px"><button class="btn" data-rmaurun>Try again</button></div>`;
      return;
    }
    const cands = CaGroups.rmauCandidates(cgRes);
    const st = { status: new Map(), rmaus: [], sel: new Set(), auChoice: "new", auName: RMAU_DEFAULT_NAME, admin: "", busy: false, results: null, au: null };
    try {
      if (isDemo) {
        st.rmaus = [];
      } else {
        const aus = await Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted");
        st.rmaus = aus.filter((a) => a.isMemberManagementRestricted === true).map((a) => ({ id: a.id, name: a.displayName }));
      }
      if (isDemo) {
        cands.forEach((g) => st.status.set(g.id, null));
      } else {
        status(`Reading administrative unit membership…`, 1, 2);
        let map = new Map();
        try { map = await readProtectionMap(); }
        catch (e) {
          // A failed read must not read as "nothing is protected" — that is the
          // reassuring answer, and it would be a guess.
          st.statusError = e.message || String(e);
        }
        status(`Matching ${cands.length} groups…`, 2, 2);
        if (!st.statusError) cands.forEach((g) => st.status.set(g.id, map.get(g.id) || null));
      }
      // Pre-select the groups the protection is FOR: the assigned exclusion
      // groups someone maintains by hand. Dynamic groups stay opt-in (their
      // membership follows a rule). Role-assignable groups are EXCLUDED, and
      // their checkbox is disabled — combining the two protections deadlocks
      // the membership (see the note rendered on the row).
      // `unused` groups are listed so their protection can be SEEN; nothing
      // references them, so protecting them is a decision, not a default.
      cands.forEach((g) => { if (!st.status.get(g.id) && !g.roleAssignable && !g.dynamic && !g.unused) st.sel.add(g.id); });
      // Deliberately NOT defaulted to st.rmaus[0]: that is Global on most
      // tenants, so an unrecognised group would be filed into the Global vault
      // by nothing more than list order. Unset means "skip these" until someone
      // chooses, which is the safe reading of an unanswered question.
      st.auChoice = "";
      cgRmau = st;
    } catch (e) {
      console.error("RMAU scan failed:", e);
      rmauBusy = false;
      rmauBody().innerHTML = `<p class="mini" style="padding:20px;color:var(--off)">Could not read administrative units: ${esc(e.message || e)}</p>
        <div class="run-prompt" style="padding:8px 20px 20px"><button class="btn" data-rmaurun>Try again</button></div>`;
      return;
    }
    rmauBusy = false;
    renderCgRmau();
  }

  // One read for the whole tenant instead of one per group. /administrativeUnits
  // supports $expand, so the units and their members arrive together — which
  // matters now that the candidate list includes baseline groups no policy
  // references: those used to be invisible here, and checking each one
  // separately would have made the scan cost grow with the baseline.
  //
  // Returns groupId -> { auId, auName } for RESTRICTED units only.
  async function readProtectionMap() {
    const map = new Map();
    const aus = await Graph.ggetAll(
      "/administrativeUnits?$select=id,displayName,isMemberManagementRestricted&$expand=members($select=id)");
    for (const a of aus) {
      if (a.isMemberManagementRestricted !== true) continue;
      for (const m of a.members || []) map.set(m.id, { auId: a.id, auName: a.displayName });
    }
    return map;
  }

  // Where does a group go? Each exclusion group is routed to ITS OWN persona
  // vault, derived from its CA number. One dropdown for the whole run was the
  // old behaviour and it quietly defeated the point of per-persona units: run
  // it once over CA001 and CA101 together and the Admins exclusions land in the
  // Global vault, handing the Global vault's scoped administrators control of
  // policies they have nothing to do with.
  //
  // The dropdown survives as the FALLBACK for the groups nothing matches — a
  // custom name, or the CA900 workload-identity range that no persona covers.
  function rmauTarget(t, g) {
    const code = Rmau.codeForGroup(g.name);
    if (code) {
      const want = Rmau.auName(code).toLowerCase();
      const hit = (t.rmaus || []).find((a) => String(a.name || "").toLowerCase() === want);
      if (hit) return { auId: hit.id, auName: hit.name, code, source: "persona" };
      // The right vault is known but absent. Saying "we will use the fallback"
      // would be worse than saying nothing: it is a silent demotion.
      return { auId: null, auName: Rmau.auName(code), code, source: "missing" };
    }
    if (t.auChoice === "new") return { auId: null, auName: (t.auName || RMAU_DEFAULT_NAME), code: null, source: "fallbackNew" };
    if (t.auChoice) {
      const hit = (t.rmaus || []).find((a) => a.id === t.auChoice);
      if (hit) return { auId: hit.id, auName: hit.name, code: null, source: "fallback" };
    }
    return { auId: null, auName: null, code: null, source: "unset" };
  }

  let rmauBusy = false;
  const rmauBusyPanel = () => '<div class="run-prompt"><div class="spinner"></div><p class="mini muted" id="cgRmauStatus">Scanning… this keeps running if you switch tabs.</p><div id="cgRmauBar" style="width:100%"></div></div>';
  function renderCgRmau() {
    // Same manners as Sign-in failures: nothing scans until asked, a scan in
    // flight survives navigating away and back, and the result stays until
    // an explicit rescan.
    if (rmauBusy) { rmauBody().innerHTML = rmauBusyPanel(); return; }
    if (!cgRmau) {
      rmauBody().innerHTML = `<div class="run-prompt">
        <button class="btn primary" data-rmaurun>▶ Scan the exclusion groups</button>
        <p class="mini muted">Reads the tenant's groups, the administrative units and each exclusion group's protection status. Nothing is written. The result stays until you rescan.</p>
      </div>`;
      return;
    }
    const t = cgRmau;
    const cands = CaGroups.rmauCandidates(cgRes);

    if (t.results) {
      const ok = t.results.filter((x) => x.state === "added").length;
      const failed = t.results.filter((x) => x.state === "failed").length;
      const skipped = t.results.filter((x) => x.state === "skipped");
      // Each group went to its OWN persona unit, so the summary counts per unit
      // rather than naming one and hoping it covers everything.
      const byAu = new Map();
      for (const x of t.results) if (x.state === "added") byAu.set(x.auName, (byAu.get(x.auName) || 0) + 1);
      rmauBody().innerHTML = `<div class="cg-panel">
        <h4>PROTECTION APPLIED</h4>
        <p class="mini"><b style="color:var(--on)">${ok} group${ok === 1 ? "" : "s"} protected</b> across ${byAu.size} administrative unit${byAu.size === 1 ? "" : "s"}${failed ? ` · <b style="color:var(--off)">${failed} failed</b>` : ""} · ${t.results.filter((x) => x.state === "already").length} already in one</p>
        ${byAu.size ? `<ul class="wi-list" style="margin:6px 0 0">${[...byAu].map(([n, c]) => `<li><div class="wi-why">🔒 <b>${esc(n)}</b> — ${c} group${c === 1 ? "" : "s"}</div></li>`).join("")}</ul>` : ""}
        ${(() => {
          if (!skipped.length) return "";
          // Two different reasons, and conflating them would send somebody to
          // create a unit for a group that never had a persona to begin with.
          const noUnit = skipped.filter((x) => x.auName && x.auName !== "(none chosen)");
          const noPersona = skipped.filter((x) => !noUnit.includes(x));
          const list = (xs, suffix) => `<ul class="wi-list" style="margin:6px 0 0">${xs.map((x) => `<li><div class="wi-why">⊘ <b>${esc(x.name)}</b>${suffix(x)}</div></li>`).join("")}</ul>`;
          return `<p class="mini" style="color:var(--off);margin:8px 0 0"><b>${skipped.length} skipped</b> — nothing was filed elsewhere on their behalf, because putting an Admins exclusion group into the Global vault would hand the Global vault's administrators control of it.</p>
            ${noUnit.length ? `<p class="mini" style="margin:8px 0 0">${noUnit.length} because <b>the persona unit does not exist yet</b> — create it in <b>🛡 Restricted AUs</b>, then run this again.</p>${list(noUnit, (x) => ` → ${esc(x.auName)}`)}` : ""}
            ${noPersona.length ? `<p class="mini" style="margin:8px 0 0">${noPersona.length} because <b>the name carries no CA number the baseline recognises</b> and no fallback unit was chosen. Pick one above, or place them by hand once you have decided who should manage them.</p>${list(noPersona, () => "")}` : ""}`;
        })()}
        <p class="mini" style="color:var(--report)">⚠ From now on, membership of these groups can only be changed by principals holding a role <b>scoped to this administrative unit</b> — including by this tool's own ⑤ Import members.</p>
        <div class="row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn" id="cgRmauReport">📄 Change report</button>
          <button class="btn" id="cgRmauAgain">⟳ Rescan</button>
        </div>
      </div>`;
      return;
    }

    // Search narrows what is already found — no directory lookup. The list runs
    // to dozens of groups on a real tenant, which is the only reason it exists.
    const q = (t.q || "").trim().toLowerCase();
    const shown = q ? cands.filter((g) => String(g.name || "").toLowerCase().includes(q)) : cands;

    const rows = shown.map((g) => {
      const prot = t.status.get(g.id);
      const dest = rmauTarget(t, g);
      // A ROLE-ASSIGNABLE group must not go into a restricted management AU.
      // The two protections deadlock: membership of a role-assignable group can
      // only be changed by Global Administrator or Privileged Role Administrator
      // (owners aside), and an RMAU blocks exactly those two — neither can be
      // assigned at AU scope. The result is a group nobody can edit, which for a
      // break-glass exclusion group is the worst possible day to discover it.
      // So the checkbox is disabled rather than merely unticked.
      const disabled = !!prot || !!g.roleAssignable || !!g.unused;
      return `<tr>
        <td><label class="chk" style="margin:0"><input type="checkbox" data-cgrmau="${esc(g.id)}"${t.sel.has(g.id) ? " checked" : ""}${disabled ? " disabled" : ""}> <b>${esc(g.name)}</b></label>
          ${g.roleAssignable ? '<div class="mini" style="color:var(--off)"><b>role-assignable — cannot be protected this way.</b> Its membership is already restricted to Global Administrator / Privileged Role Administrator, and a restricted AU blocks those same two roles. Putting it in one would leave <b>nobody</b> able to change the members. Pick one protection or the other: for a CA exclusion group, a restricted AU is usually the better one, because it lets you name who may manage it.</div>' : ""}
          ${g.unused ? '<div class="mini muted">not referenced by any policy right now — listed so its protection state is visible. A baseline exclusion group can sit in a unit (or be frozen in one) long after the policy that used it was retired, and if it were not listed here nothing in the app would say so. Tick it deliberately if you want it protected.</div>' : ""}
          ${g.dynamic ? '<div class="mini" style="color:var(--report)">dynamic group — not pre-selected: members come and go with its membership rule, not by hand. Adding it still helps (the restriction covers the group object, so editing the <b>rule</b> also needs an AU-scoped role) — but protect the hand-managed exclusion groups first.</div>' : ""}</td>
        <td class="mini">${g.refs.exclude.length ? `${g.refs.exclude.length} polic${g.refs.exclude.length === 1 ? "y" : "ies"}` : '<span class="muted">not referenced</span>'}</td>
        <td class="mini">${prot
          ? (g.roleAssignable
            ? `<span style="color:var(--off)">🧊 <b>frozen</b> in ${esc(prot.auName)} — role-assignable AND restricted, so <b>nobody</b> can change its members. Remove it from the unit to restore Global / Privileged Role Administrator, then convert it with ⑦ Migrate.</span>`
            : `🔒 in <b>${esc(prot.auName)}</b>`)
          : t.statusError ? '<span class="muted">unknown</span>'
          : '<span style="color:var(--report)">unprotected</span>'}</td>
        <td class="mini">${prot || g.roleAssignable ? '<span class="muted">—</span>'
          : dest.source === "persona" ? `→ <b>${esc(dest.auName)}</b>`
          : dest.source === "missing" ? `<span style="color:var(--off)">→ <b>${esc(dest.auName)}</b> does not exist — create it in 🛡 Restricted AUs first, or this group is skipped</span>`
          : dest.source === "unset" ? '<span style="color:var(--report)">no persona matches this name — pick a fallback unit above, or it is skipped</span>'
          : `<span style="color:var(--report)">→ <b>${esc(dest.auName)}</b> (fallback — no persona matches this name)</span>`}</td>
      </tr>`;
    }).join("");

    const unmatched = cands.filter((g) => !t.status.get(g.id) && !g.roleAssignable && rmauTarget(t, g).source.startsWith("fallback"));
    const auPick = `<label class="mini" style="display:block;margin:14px 0 4px">Fallback administrative unit <span class="muted">— used only for the ${unmatched.length} group${unmatched.length === 1 ? "" : "s"} whose name carries no CA number the baseline recognises. Everything else goes to its own persona vault.</span></label>
      <select id="cgRmauAu" style="max-width:420px">
        <option value=""${t.auChoice ? "" : " selected"}>— none: skip the groups that match no persona —</option>
        ${t.rmaus.map((a) => `<option value="${esc(a.id)}"${t.auChoice === a.id ? " selected" : ""}>${esc(a.name)} (existing)</option>`).join("")}
        <option value="new"${t.auChoice === "new" ? " selected" : ""}>＋ Create a new one…</option>
      </select>
      ${t.auChoice === "new" ? `<input id="cgRmauName" class="txt" value="${esc(t.auName)}" autocomplete="off" style="max-width:420px;margin-top:6px;letter-spacing:normal;font-weight:400">
        <p class="mini muted" style="margin-top:4px">Created with <code>isMemberManagementRestricted: true</code> — that flag is <b>immutable</b>; it cannot be added to or removed from an existing administrative unit.</p>` : ""}`;

    const picked = [...t.sel].filter((id) => !t.status.get(id)).length;
    rmauBody().innerHTML = `<div class="cg-panel">
      <h4>PROTECT THE EXCLUSION GROUPS (restricted management administrative unit)</h4>
      <p class="mini">Membership of a CA <b>exclusion</b> group is a Conditional Access bypass — and any tenant-level Groups/User Administrator can add someone (or themselves) to one.
        Placing these groups in a <b>restricted management administrative unit</b> closes that path: only principals holding a role <b>scoped to that administrative unit</b> can change their members. Tenant-wide admins — Global Administrator included — can read but not modify.</p>
      ${auPick}
      <label class="mini" style="display:block;margin:14px 0 4px">Scoped administrator${(() => { const n = CaGroups.adminList(t.admin).length; return n > 1 ? `s <span class="tag">${n}</span>` : ""; })()} <span class="muted">(optional but recommended — otherwise nobody can manage these members until a role is scoped later. Several are allowed: separate them with a comma — a break-glass pair, or an admin plus the team that covers them.)</span></label>
      <input id="cgRmauAdmin" class="txt" list="cgRmauAdminList" value="${esc(t.admin)}" placeholder="UPN, or several separated by a comma" autocomplete="off" spellcheck="false" style="max-width:560px;letter-spacing:normal;font-weight:400">
      <datalist id="cgRmauAdminList"></datalist>
      <label class="chk" style="margin-top:14px;display:block"><input type="checkbox" id="cgRmauAck"${t.ack ? " checked" : ""}> I understand that after this, membership of the selected groups can <b>only</b> be changed by administrative-unit-scoped roles — tenant-level admin roles (and this tool, signed in without one) lose write access to their membership.</label>
      <div class="cg-progress" id="cgRmauBar" style="display:none"><div style="width:0%"></div></div>
      <div id="cgRmauLog" class="mini" style="margin-top:8px"></div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn primary" id="cgRmauGo" ${picked ? "" : "disabled"}>Protect ${picked} group${picked === 1 ? "" : "s"}${isDemo ? " (simulated)" : ""}</button>
        ${/* The protection status is a point-in-time read. Somebody else may have
             protected a group from the portal, a migration may have replaced one,
             or a previous run may have half-succeeded — re-check without leaving
             the tab and losing the selection you have built. */ ""}
        <button class="btn" id="cgRmauRecheck">⟳ Re-check protection</button>
      </div>
      ${t.statusError ? `<p class="mini" style="color:var(--off);margin:12px 0 0">⚠ The administrative units could not be read (${esc(t.statusError)}), so the <b>Protection</b> column below is blank rather than accurate — it is unknown, not “none”. ⟳ Re-check once the permission is in place.</p>` : ""}
      <h5 class="mini" style="margin:18px 0 4px">THE GROUPS</h5>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">
        <input id="cgRmauQ" class="txt" list="cgRmauQList" value="${esc(t.q || "")}" placeholder="Search the exclusion groups…" autocomplete="off" spellcheck="false" style="max-width:340px;letter-spacing:normal;font-weight:400">
        <datalist id="cgRmauQList">${cands.map((g) => `<option value="${esc(g.name)}"></option>`).join("")}</datalist>
        ${q ? `<button class="btn sm" id="cgRmauQClear">✕ Clear</button><span class="mini muted">${shown.length} of ${cands.length}</span>` : ""}
      </div>
      <p class="mini muted" style="margin:0 0 8px">Pre-selected: the unprotected <b>assigned exclusion groups</b> — the ones whose membership is maintained by hand, which is exactly the membership this protection locks down.
        <b>Dynamic</b> groups are listed but not pre-selected: their members come and go with a membership rule, not by hand — the restriction still guards the group object (so changing the <b>rule</b> would also need an AU-scoped role), but the hand-managed exclusion groups are the priority.
        <b>Role-assignable</b> groups cannot be added at all: a restricted AU blocks Global Administrator and Privileged Role Administrator, the only roles that can edit a role-assignable group's members, so a group with both protections has nobody who can change them. Convert them first with <b>⑦ Migrate</b>.</p>
      ${(() => {
        // "All" means all SELECTABLE — a role-assignable group or one already
        // protected has a disabled checkbox, and counting those would show a
        // total the button can never reach.
        // Scoped to what is VISIBLE: with a search active, "all" meaning
        // "all 60, including the 54 you filtered out" is a trap.
        const pick = shown.filter((g) => !t.status.get(g.id) && !g.roleAssignable && !g.unused);
        if (pick.length < 2) return "";
        const on = pick.filter((g) => t.sel.has(g.id)).length;
        return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">
          <button class="btn sm" id="cgRmauAll">${on === pick.length ? "☐ Deselect all" : "☑ Select all"}</button>
          <span class="mini muted">${on} of ${pick.length} selectable group${pick.length === 1 ? "" : "s"} selected${cands.length - pick.length ? ` · ${cands.length - pick.length} cannot be added` : ""}</span>
        </div>`;
      })()}
      <div class="cg-tablewrap"><table class="cg-table">
        <thead><tr><th>Exclusion group</th><th style="width:110px">Excluded on</th><th style="width:200px">Protection</th><th style="width:260px">Goes to</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="mini muted" style="padding:14px">${q ? `No exclusion group matches “${esc(t.q)}”.` : "No groups are used as exclusions by the tenant's policies."}</td></tr>`}</tbody></table></div>
      <p class="mini muted" style="margin-top:10px">Consents <code>AdministrativeUnit.ReadWrite.All</code>${""} on demand (plus <code>RoleManagement.ReadWrite.Directory</code> if a scoped administrator is set).
        Requires the <b>Privileged Role Administrator</b> role and an Entra ID P1 licence for administrative-unit administrators. Only cloud security groups can be added — mail-enabled or on-premises-synced groups are rejected by Graph.</p>
    </div>`;
  }

  async function cgRmauApply(btn) {
    const t = cgRmau; if (!t || t.busy) return;
    if (!rmauBody().querySelector("#cgRmauAck")?.checked) { toast("Tick the <span>confirmation</span> first — this restricts who can manage these groups"); return; }
    t.admin = (rmauBody().querySelector("#cgRmauAdmin")?.value || "").trim();
    const cands = CaGroups.rmauCandidates(cgRes);
    // Guard the WRITE, not just the checkbox — a selection can survive a rescan,
    // and adding a role-assignable group to a restricted AU freezes its members
    // for everybody (GA/PRA are blocked by the AU; nobody else was ever allowed).
    const picked = cands.filter((g) => t.sel.has(g.id) && !t.status.get(g.id) && !g.roleAssignable);
    const refused = cands.filter((g) => t.sel.has(g.id) && !t.status.get(g.id) && g.roleAssignable);
    if (refused.length) {
      toast(`Skipped ${refused.length} role-assignable group${refused.length === 1 ? "" : "s"} — a restricted AU would leave nobody able to change their members.`);
    }
    if (!picked.length) return;
    const scopes = [...AUTH_CONFIG.scopes, ...RMAU_WRITE, ...(t.admin ? ["RoleManagement.ReadWrite.Directory"] : [])];
    if (!isDemo && !await preConsent(scopes)) return;
    t.busy = true; btn.disabled = true;
    const bar = rmauBody().querySelector("#cgRmauBar"), log = rmauBody().querySelector("#cgRmauLog");
    bar.style.display = "block";
    const lines = [], results = [];
    const say = (h) => { lines.push(h); log.innerHTML = lines.slice(-10).join(""); };
    try {
      // 1) work out where each group goes BEFORE writing anything, so a group
      //    whose vault does not exist is reported rather than quietly filed
      //    into the fallback with everything else.
      const plan = picked.map((g) => ({ g, dest: rmauTarget(t, g) }));
      const skipped = plan.filter((x) => x.dest.source === "missing" || x.dest.source === "unset");
      for (const x of skipped) {
        const unset = x.dest.source === "unset";
        results.push({ name: x.g.name, excludeCount: x.g.refs.exclude.length, state: "skipped",
          auName: x.dest.auName || "(none chosen)",
          error: unset
            ? "its name carries no CA number the baseline recognises, and no fallback unit was chosen"
            : `its persona unit ${x.dest.auName} does not exist — create it in 🛡 Restricted AUs, then protect this group` });
        say(`<div style="color:var(--off)">⊘ <b>${esc(x.g.name)}</b> — ${unset ? "no persona and no fallback chosen" : `${esc(x.dest.auName)} does not exist yet`}</div>`);
      }
      const doable = plan.filter((x) => x.dest.source !== "missing" && x.dest.source !== "unset");

      // The fallback unit is created only if something actually needs it.
      let fallback = null;
      const needFallback = doable.some((x) => x.dest.source === "fallbackNew");
      if (needFallback) {
        const name = (rmauBody().querySelector("#cgRmauName")?.value || RMAU_DEFAULT_NAME).trim() || RMAU_DEFAULT_NAME;
        if (isDemo) fallback = { id: "au-demo", name, created: true };
        else {
          const made = await Graph.gpost("/administrativeUnits", {
            displayName: name,
            description: "Restricted management administrative unit protecting Conditional Access exclusion groups. Membership changes require a role scoped to this administrative unit.",
            isMemberManagementRestricted: true,
          });
          fallback = { id: made.id, name, created: true };
        }
        say(`<div>✓ created restricted management administrative unit <b>${esc(fallback.name)}</b></div>`);
      }
      const auOf = (d) => d.source === "fallbackNew" ? fallback : { id: d.auId, name: d.auName, created: false };

      // The units actually touched — the summary and the scoped-admin step both
      // need this, and "the AU" is no longer a single thing.
      const unitsUsed = new Map();
      for (const x of doable) { const a = auOf(x.dest); if (a) unitsUsed.set(a.id, a); }
      t.units = [...unitsUsed.values()];
      t.au = t.units.length === 1 ? t.units[0] : null;

      // 2) the groups, each into its own unit
      for (let i = 0; i < doable.length; i++) {
        const { g, dest } = doable[i];
        const au = auOf(dest);
        bar.firstElementChild.style.width = `${Math.round(((i + 1) / doable.length) * 100)}%`;
        try {
          if (!isDemo) await Graph.gpost(`/administrativeUnits/${au.id}/members/$ref`,
            { "@odata.id": `https://graph.microsoft.com/beta/groups/${g.id}` });
          results.push({ name: g.name, excludeCount: g.refs.exclude.length, state: "added", auName: au.name });
          say(`<div>✓ protected <b>${esc(g.name)}</b> → ${esc(au.name)}</div>`);
        } catch (err) {
          const already = /added object references already exist|one or more added object references already exist/i.test(err.message || "");
          results.push({ name: g.name, excludeCount: g.refs.exclude.length, state: already ? "already" : "failed", auName: au.name, error: already ? "" : (err.message || String(err)) });
          say(`<div style="color:var(--off)">${already ? "•" : "✗"} <b>${esc(g.name)}</b>${already ? ` — already in ${esc(au.name)}` : ` — ${esc(err.message || err)}`}</div>`);
        }
      }
      // 3) the scoped administrators, so somebody can still manage the members.
      // One failure must not cost the others: each is resolved and granted on
      // its own, and every outcome reaches the report. The directory role is
      // activated once, outside the loop.
      const admins = CaGroups.adminList(t.admin);
      t.adminResults = [];
      if (admins.length) {
        let role = null, roleErr = null;
        if (!isDemo) {
          try {
            // scopedRoleMembers wants the ACTIVATED directory-role object id, not
            // the template id. Shared ladder — a plain filter-then-activate fails
            // with a 400 conflict on tenants where the role exists but the filter
            // does not see it.
            role = await ensureDirectoryRole(GROUPS_ADMIN_TEMPLATE);
          } catch (err) { roleErr = err.message || String(err); }
        }
        // Scoped to EVERY unit this run wrote to, not to one of them. The
        // groups are now spread across several persona units, and an admin
        // scoped to only the first would be unable to manage most of what they
        // were just named for. Each unit is a separate outcome.
        for (const upn of admins) {
          let uid = null, lookupErr = null;
          if (!isDemo && !roleErr) {
            try { uid = (await Graph.gget(`/users/${encodeURIComponent(upn)}?$select=id,userPrincipalName`)).id; }
            catch (err) { lookupErr = err.message || String(err); }
          }
          for (const unit of t.units) {
            try {
              if (roleErr) throw new Error(`Groups Administrator role could not be activated: ${roleErr}`);
              if (lookupErr) throw new Error(lookupErr);
              if (!isDemo) {
                await Graph.gpost(`/administrativeUnits/${unit.id}/scopedRoleMembers`,
                  { roleId: role.id, roleMemberInfo: { id: uid } });
              }
              t.adminResults.push({ upn, au: unit.name, ok: true });
              say(`<div>✓ <b>${esc(upn)}</b> granted Groups Administrator scoped to <b>${esc(unit.name)}</b></div>`);
            } catch (err) {
              const already = /already exist|conflicting object/i.test(err.message || "");
              t.adminResults.push({ upn, au: unit.name, ok: already, error: already ? "" : (err.message || String(err)) });
              say(already
                ? `<div>• <b>${esc(upn)}</b> — already scoped to ${esc(unit.name)}</div>`
                : `<div style="color:var(--off)">✗ <b>${esc(upn)}</b> on ${esc(unit.name)} — ${esc(err.message || err)}</div>`);
            }
          }
        }
        const bad = t.adminResults.filter((a) => !a.ok);
        t.adminError = bad.length ? `${bad.length} of ${t.adminResults.length} grants could not be made` : null;
      }
      t.results = results;
      const ok = results.filter((r) => r.state === "added").length;
      toast(`<span>${ok}</span> exclusion group${ok === 1 ? "" : "s"} protected${isDemo ? " (simulated)" : ""}`);
    } catch (e) {
      console.error("RMAU apply failed:", e);
      say(`<div style="color:var(--off)">✗ ${esc(e.message || e)}<br><span class="muted">Creating a restricted management administrative unit needs the Privileged Role Administrator role.</span></div>`);
    } finally { t.busy = false; btn.disabled = false; }
    if (t.results) renderCgRmau();
  }

  $("cgBody").addEventListener("click", async (e) => {
    if (e.target.id === "cgCsvPick") { $("cgCsvFile").click(); return; }
    if (await rmauClick(e)) return;
    if (e.target.id === "cgCsvBack") { if (cgCsv) cgCsv.stage = cgCsv.stage === "review" ? "map" : null; if (cgCsv && !cgCsv.stage) cgCsv = null; renderCgCsv(); return; }
    if (e.target.id === "cgCsvScan") { await cgCsvScan(); return; }
    if (e.target.id === "cgCsvApply") { await cgCsvApply(e.target); return; }
    if (e.target.id === "cgCsvAgain") { cgCsv = null; renderCgCsv(); return; }
    if (e.target.id === "cgCsvReport" && cgCsv && cgCsv.results) {
      showReport("👥 CA group member import", "CA-GroupMemberImport",
        CaGroups.csvReport({ tenant: tenantName, fileName: cgCsv.fileName, userCount: cgCsv.users.length,
          personaCol: cgCsv.personaCol, generatedBy: Brand.generatedBy("Generated") }, cgCsv.results));
      return;
    }
    if (e.target.id === "cgCreateAll" || e.target.id === "cgCreateNone") {
      const on = e.target.id === "cgCreateAll";
      document.querySelectorAll("[data-cgcreate]").forEach(cb => { cb.checked = on; });
      return;
    }
    if (e.target.id === "cgCreateGo") {
      const can = CaGroups.creatable(cgRes);
      const picked = [...document.querySelectorAll("[data-cgcreate]:checked")].map(cb => can[+cb.dataset.cgcreate]).filter(Boolean);
      if (!picked.length) { toast("Nothing selected to create"); return; }
      if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "Group-NestingSupport.ReadWrite.All"])) return;
      e.target.disabled = true;
      const bar = $("cgCreateBar"), log = $("cgCreateLog");
      bar.style.display = "block";
      const lines = [];
      let ok = 0, failed = 0;
      for (let i = 0; i < picked.length; i++) {
        const r = picked[i];
        bar.firstElementChild.style.width = `${Math.round(((i + 1) / picked.length) * 100)}%`;
        try {
          const g = isDemo
            ? { id: "g-" + r.name, name: r.name, created: true }
            : await Assign.createGroup(r.template);
          ok++;
          lines.push(`<div>${g.created ? "✓ created" : "• already existed, reused"} <b>${esc(r.name)}</b></div>`);
        } catch (err) {
          failed++;
          lines.push(`<div style="color:var(--off)">✗ <b>${esc(r.name)}</b> — ${esc(err.message || err)}</div>`);
        }
        log.innerHTML = lines.join("");
      }
      e.target.disabled = false;
      toast(failed ? `${ok} created, <span>${failed} failed</span>` : `<span>${ok}</span> group${ok === 1 ? "" : "s"} created${isDemo ? " (simulated)" : ""}`);
      // Re-scan so Check reflects reality rather than what we hoped happened.
      cgRes = null;
      await openCaGroups(true);
      cgTab = "check"; renderCaGroups();
      return;
    }
    if (e.target.id === "cgmCreate") { await cgManualCreate(e.target); return; }
    if (e.target.id === "cgMemberGo") { cgMemberPick = false; startMemberScan(); return; }
    if (e.target.id === "cgMemberStop") { cgStop = true; return; }
    // Scan one group. The full scan is a call per group, so reading a single
    // one you are curious about should not cost the other 130.
    const one = e.target.closest("[data-cgscan]");
    if (one) {
      e.stopPropagation();          // do not also open the row detail
      await scanOneGroup(one.dataset.cgscan, one);
      return;
    }
    // Create one missing group from its template, in place.
    const co = e.target.closest("[data-cgcreateone]");
    if (co) { e.stopPropagation(); await cgCreateOne(co.dataset.cgcreateone, co); return; }
    // Recreate a present-but-not-role-assignable group correctly.
    // "Recreate role-assignable" is retired — the baseline moves the other way
    // now. The button on a role-assignable row opens ⑦ Migrate instead.
    const mg = e.target.closest("[data-cgmigrate]");
    if (mg) { e.stopPropagation(); cgTab = "migrate"; renderCaGroups(); return; }
    const nb = e.target.closest("[data-cgnesting]");
    if (nb) { e.stopPropagation(); openNesting(nb.dataset.cgnesting, nb); return; }
    // Convert an assigned group to the dynamic membership its template expects.
    const cv = e.target.closest("[data-cgdynamic]");
    if (cv) { e.stopPropagation(); openConvertDynamic(cv.dataset.cgdynamic); return; }
    // a row in the check table opens that group's detail
    const row = e.target.closest("[data-cgrow]");
    if (row) showGroupRow(row.dataset.cgrow);
  });

  // Create a single missing baseline group from its template, then re-scan.
  async function cgCreateOne(name, btn) {
    const r = cgRes && cgRes.rows.find((x) => x.name === name && x.status === "missing" && x.template);
    if (!r) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "Group-NestingSupport.ReadWrite.All"])) return;
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const g = isDemo ? { id: "g-" + name, name, created: true } : await Assign.createGroup(r.template);
      toast(g.created ? `Created <span>${esc(name)}</span>` : `<span>${esc(name)}</span> already existed — reused`);
      cgRes = null; await openCaGroups(true); cgTab = "check"; renderCaGroups();
    } catch (err) { console.error(err); toast(`Create failed: <span>${esc(err.message || err)}</span>`); if (btn) { btn.disabled = false; btn.textContent = "Create"; } }
  }

  // ---- convert an assigned group to dynamic membership ----
  // Two routes, and which one applies is Entra's decision, not ours: a plain
  // security group converts in place (id kept, every reference intact), while a
  // role-assignable one cannot be dynamic at all and has to be replaced.
  let cvPlan = null;
  function openConvertDynamic(name) {
    const r = cgRes && cgRes.rows.find((x) => x.name === name);
    if (!r) return;
    const plan = CaGroups.convertPlan(r);
    cvPlan = plan;
    if (!plan.ok) { toast(esc(plan.reason)); return; }
    const inc = plan.refs.include, exc = plan.refs.exclude;
    const md = [];
    md.push(plan.mode === "inPlace"
      ? `**${r.name}** is a plain security group, so Entra can switch it to dynamic membership **in place**.`
      : `**${r.name}** is **role-assignable**, and Entra does not allow dynamic membership on a role-assignable group — \`isAssignableToRole\` is immutable, so this cannot be done in place. The group is replaced instead:`);
    md.push("");
    plan.steps.forEach((s, i) => md.push(`${i + 1}. ${s.text}`));
    md.push("");
    // mdToHtml has no fenced-code support — inline code renders, a fence would
    // just print the backticks.
    md.push("**Membership rule**");
    md.push("");
    md.push("`" + plan.rule + "`");
    md.push("");
    if (inc.length) { md.push("_Included in:_"); inc.forEach((p) => md.push(`- ${p.name}`)); md.push(""); }
    if (exc.length) { md.push("_Excluded from:_"); exc.forEach((p) => md.push(`- ${p.name}`)); md.push(""); }
    md.push(plan.keeps);
    md.push("");
    plan.warnings.forEach((w) => md.push(`⚠ ${w}`));
    md.push("");
    md.push(isDemo ? "_Demo mode — simulated, nothing is written._" : "This **writes to the tenant**.");
    $("cvBody").innerHTML = mdToHtml(md.join("\n"));
    $("cvOk").value = ""; $("cvGo").disabled = true;
    $("cvModal").classList.add("open");
  }
  $("cvOk").addEventListener("input", (e) => { $("cvGo").disabled = e.target.value.trim().toUpperCase() !== "CONVERT"; });
  $("cvCancel").addEventListener("click", () => $("cvModal").classList.remove("open"));
  $("cvGo").addEventListener("click", async () => {
    const plan = cvPlan; if (!plan || !plan.ok) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess"])) return;
    $("cvGo").disabled = true;
    let out = null, err = null;
    try {
      out = isDemo
        ? { log: plan.steps.map((s) => ({ ok: true, text: s.text })), newGroupId: "g-demo", archiveName: plan.archiveName }
        : await CaGroups.runConvert(plan, (m) => toast(esc(m)));
    } catch (e) { console.error(e); err = e; }
    $("cvModal").classList.remove("open");
    const md = [`# Group converted to dynamic membership — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      `- **Group:** ${plan.name}`,
      `- **Route:** ${plan.mode === "inPlace" ? "converted in place (id and every reference kept)" : `replaced (role-assignable groups cannot be dynamic); old group renamed to **${plan.archiveName}**`}`,
      `- **Rule:** \`${plan.rule}\``,
      ...(out?.newGroupId && out.newGroupId !== plan.id ? [`- **New group id:** \`${out.newGroupId}\` (the old one is \`${plan.id}\`)`] : []), "",
      `## Steps`, ""];
    (out?.log || []).forEach((l) => md.push(`- ${l.ok ? "✅" : "❌"} ${l.text}${l.detail ? ` — ${l.detail}` : ""}`));
    if (err) md.push(`- ❌ **Stopped:** ${err.message || err}`);
    md.push("");
    if (plan.mode === "recreate" && !err) {
      md.push(`## Next`, "",
        `- The new group fills as Entra evaluates the rule — check its members before relying on the policies.`,
        `- **${plan.archiveName}** is no longer referenced by any policy. Delete it once you are satisfied.`,
        `- It is **not role-assignable** any more: if the old group held a directory role or a PIM assignment, that has to be re-established another way.`, "");
    }
    if (plan.mode === "inPlace" && !err) {
      md.push(`## Next`, "", `- Members who do not match the rule are removed once Entra processes it, and members can no longer be added by hand.`, "");
    }
    showReport("⟳ Convert to dynamic", "CA-Group-Convert-Dynamic", md.join("\n"));
    toast(err ? `Convert stopped: <span>${esc(err.message || err)}</span>` : `<span>${esc(plan.name)}</span> is now dynamic${isDemo ? " (simulated)" : ""}`);
    if (!isDemo && !err) { cgRes = null; await openCaGroups(true); cgTab = "check"; renderCaGroups(); }
  });

  // Carry the user members of one group into another. Role-assignable groups
  // need RoleManagement.ReadWrite.Directory — Learn is explicit that
  // Group.ReadWrite.All "won't work" for their membership — so both scopes go
  // on every call rather than guessing which the target turned out to be.
  const MEMBER_MOVE_SCOPES = ["Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"];
  async function moveGroupMembers(fromId, toId, onStatus) {
    // ALL member types come across, not just users — a persona group can hold
    // service principals (service-account personas) and the old code left
    // those behind silently. The one hard limit is Entra's, not ours: a
    // role-assignable group cannot contain GROUPS as members, so nested
    // groups are reported as skipped with that reason instead of failing.
    const log = { moved: 0, total: 0, failed: [], skippedGroups: [] };
    const members = await Graph.ggetAll(`/groups/${fromId}/members?$select=id,displayName`).catch(() => []);
    const movable = [];
    for (const m of members) {
      if (String(m["@odata.type"] || "").toLowerCase().includes("group")) log.skippedGroups.push(m.displayName || m.id);
      else movable.push(m);
    }
    log.total = members.length;
    for (let i = 0; i < movable.length; i++) {
      onStatus?.(`Moving member ${i + 1}/${movable.length}…`);
      try {
        await Graph.gpost(`/groups/${toId}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/beta/directoryObjects/${movable[i].id}` },
          [...AUTH_CONFIG.scopes, ...MEMBER_MOVE_SCOPES]);
        log.moved++;
      } catch (e) {
        const already = /already exist/i.test(e.message || "");
        if (already) log.moved++;
        else log.failed.push({ name: movable[i].displayName || movable[i].id, error: e.message || String(e) });
      }
    }
    return log;
  }

  // ---- housekeeping: the groups a recreate left behind ----------------------
  // Every recreate renames the original aside instead of deleting it, so a bad
  // run stays recoverable. Nobody comes back to tidy up, so the directory fills
  // with "X (legacy 2026-08-04)". This is that second visit.
  let arcRows = [];
  $("cgArchived").addEventListener("click", () => openArchived());
  async function openArchived() {
    $("arcSub").textContent = "Looking for groups a recreate left behind…";
    $("arcBody").innerHTML = "";
    $("arcOk").value = ""; $("arcGo").disabled = true;
    $("arcModal").classList.add("open");
    try {
      arcRows = (isDemo
        ? [{ id: "g-old1", name: "CAB-SEC-U-Persona-Admins (legacy 2026-08-04)", liveName: "CAB-SEC-U-Persona-Admins", roleAssignable: false, dynamic: false, refs: { include: [], exclude: [] }, refCount: 0 }]
        : await CaGroups.findArchived(policies.map((p) => p.raw))).map((r) => ({ ...r, checked: r.refCount === 0 }));
      await arcCountMembers();
      renderArchived();
    } catch (e) {
      $("arcSub").textContent = "";
      $("arcBody").innerHTML = `<p class="mini" style="color:var(--off)">Could not search for archived groups: ${esc(e.message || e)}</p>`;
    }
  }

  // Member counts matter here: an archived group with members is one whose
  // members were never carried across, which is a different problem to a tidy-up.
  async function arcCountMembers() {
    if (isDemo || !arcRows.length) return;
    const res = await Graph.gbatch(arcRows.map((r, i) => ({ id: i, url: `/groups/${r.id}/members/$count` })))
      .catch(() => ({}));
    arcRows.forEach((r, i) => {
      const v = res[i];
      r.members = v && v.body != null ? Number(v.body) : null;
    });
  }

  function renderArchived() {
    const n = arcRows.length;
    const stillUsed = arcRows.filter((r) => r.refCount > 0).length;
    $("arcSub").innerHTML = n
      ? `${n} archived group${n === 1 ? "" : "s"} found${stillUsed ? ` · <b style="color:var(--off)">${stillUsed} still referenced by a policy</b>` : ""}`
      : "Nothing to tidy up.";
    if (!n) { $("arcBody").innerHTML = '<p class="mini muted">No group in this tenant carries an archive suffix from a recreate.</p>'; return; }
    $("arcBody").innerHTML = `
      <p class="mini muted" style="margin:0 0 10px">A deleted group is <b>soft-deleted and restorable for 30 days</b>. Even so, check
        <a href="#" class="md-tool" data-tool="toolGroupUse">Group Analyzer</a> first — Conditional Access is moved for you by a recreate,
        but app assignments, Intune, licensing and Azure RBAC are not, and they would still be pointing at the old id.</p>
      <div class="gu-tw"><table class="plist">
        <thead><tr><th></th><th>Archived group</th><th>Replaced by</th><th class="gu-num">Members</th><th>Still referenced</th></tr></thead>
        <tbody>${arcRows.map((r, i) => `<tr>
          <td><input type="checkbox" data-arc="${i}" ${r.checked ? "checked" : ""}></td>
          <td><b>${esc(r.name)}</b><div class="mini muted">${esc(r.id)}</div>
            ${r.roleAssignable ? '<span class="tag block">role-assignable</span>' : ""}${r.dynamic ? '<span class="tag">dynamic</span>' : ""}</td>
          <td class="mini">${esc(r.liveName)}</td>
          <td class="gu-num${r.members ? "" : " gu-zero"}">${r.members == null ? "—" : r.members}</td>
          <td class="mini">${r.refCount
            ? `<span style="color:var(--off)">${r.refCount} polic${r.refCount === 1 ? "y" : "ies"}</span><div class="mini">${esc(
                [...r.refs.include.map((p) => p.name), ...r.refs.exclude.map((p) => p.name)].slice(0, 3).join(", "))}</div>`
            : '<span class="muted">no policy</span>'}</td></tr>`).join("")}</tbody></table></div>
      ${stillUsed ? `<p class="mini" style="margin-top:10px;color:var(--off)">A group still referenced by a policy is <b>not</b> ticked by default —
        deleting it would leave that policy pointing at nothing. Move the reference first (④ Assign), or tick it deliberately.</p>` : ""}
      ${arcRows.some((r) => r.members) ? `<p class="mini" style="margin-top:6px;color:var(--report)">⚠ An archived group with members is one whose members were never carried across.
        Check the replacement has them before deleting.</p>` : ""}`;
  }
  $("arcBody").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-arc]"); if (!cb) return;
    arcRows[+cb.dataset.arc].checked = cb.checked;
  });
  $("arcOk").addEventListener("input", (e) => {
    $("arcGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE" || !arcRows.some((r) => r.checked);
  });
  $("arcCancel").addEventListener("click", () => $("arcModal").classList.remove("open"));
  $("arcGo").addEventListener("click", async () => {
    const picked = arcRows.filter((r) => r.checked);
    if (!picked.length) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...MEMBER_MOVE_SCOPES])) return;
    const btn = $("arcGo"); btn.disabled = true;
    const done = [], failed = [];
    for (let i = 0; i < picked.length; i++) {
      toast(`Deleting ${i + 1}/${picked.length}…`);
      try {
        if (!isDemo) await Graph.gdelete(`/groups/${picked[i].id}`, [...AUTH_CONFIG.scopes, ...MEMBER_MOVE_SCOPES]);
        done.push(picked[i]);
      } catch (e) { failed.push({ ...picked[i], error: e.message || String(e) }); }
    }
    $("arcModal").classList.remove("open");
    const L = [`# Archived groups removed — ${tenantName || "tenant"}`, "", Brand.generatedBy("Generated"), "",
      `- **Deleted:** ${done.length}${failed.length ? ` · **failed:** ${failed.length}` : ""}`,
      isDemo ? "- _Demo mode — simulated._" : "- Each deletion is a **soft delete**: Entra keeps the group for 30 days and it can be restored.", ""];
    if (done.length) {
      L.push("| Group | Object ID | Replaced by |", "| --- | --- | --- |");
      done.forEach((r) => L.push(`| ${r.name} | \`${r.id}\` | ${r.liveName} |`));
    }
    if (failed.length) {
      L.push("", "## Failed", "");
      failed.forEach((f) => L.push(`- ❌ **${f.name}** — ${f.error}`));
    }
    showReport("🧹 Archived groups removed", "CA-Groups-Housekeeping", L.join("\n"));
    toast(failed.length ? `Deleted ${done.length}, <span>${failed.length} failed</span>` : `<span>${done.length}</span> archived group${done.length === 1 ? "" : "s"} deleted`);
    cgRes = null; await openCaGroups(true); cgTab = "check"; renderCaGroups();
  });

  // ---- disable group nesting (BETA) ----------------------------------------
  // See the block comment in js/cagroups.js for why this reads and writes the
  // way it does. Shape here: read the current state and the direct members,
  // show exactly what will happen, try the non-destructive PATCH, and only
  // offer the recreate — behind its own typed confirmation — if Entra refuses.
  let nestRow = null, nestPlan = null;

  // disableNesting is invisible to a plain GET, so ask for it explicitly. One
  // batched pass over the groups that have an id; anything that errors stays
  // "unknown", which is a real answer here rather than a failure.
  async function loadNestingStates(rows) {
    const targets = rows.filter((r) => r.id && r.nesting === undefined);
    if (!targets.length) return;
    if (isDemo) { targets.forEach((r, i) => r.nesting = i % 4 === 0 ? "disabled" : "allowed"); return; }
    const res = await Graph.gbatch(targets.map((r, i) => ({ id: i, url: `/groups/${r.id}?$select=id,disableNesting` })));
    targets.forEach((r, i) => {
      const v = res[i];
      r.nesting = v && v.body ? CaGroups.nestingState(v.body) : "unknown";
    });
  }

  async function openNesting(name, btn) {
    const r = cgRes && cgRes.rows.find((x) => x.name === name);
    if (!r) return;
    const label = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
    try {
      // Direct members only — split by type, because a group member is the
      // blocker and a user member is the thing that has to be carried across.
      let members = { groups: [], users: [] };
      if (isDemo) {
        members = { groups: name.toLowerCase().includes("internals") ? [{ id: "g-nested", displayName: "Demo nested group" }] : [], users: [{ id: "u1", displayName: "Demo user" }] };
      } else {
        const [gs, us] = await Promise.all([
          Graph.ggetAll(`/groups/${r.id}/members/microsoft.graph.group?$select=id,displayName`).catch(() => []),
          Graph.ggetAll(`/groups/${r.id}/members/microsoft.graph.user?$select=id,displayName,userPrincipalName`).catch(() => []),
        ]);
        members = { groups: gs, users: us };
      }
      nestRow = r;
      nestPlan = CaGroups.nestingPlan(r, members);
      renderNestingModal();
      $("nestModal").classList.add("open");
    } catch (e) {
      console.error(e); toast(`Could not read the group: <span>${esc(e.message || e)}</span>`);
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  }

  function renderNestingModal() {
    const p = nestPlan;
    const md = [];
    md.push(`**${p.name}**`, "");
    if (!p.ok) {
      md.push(p.reason);
      if (p.blocked && p.nested.length) {
        md.push("", "### Nested groups in the way", "", "| Group |", "|---|");
        p.nested.forEach((g) => md.push(`| ${g.displayName || g.id} |`));
        md.push("", "_Remove these from the group — or accept that the users they bring in must be added directly — and the action becomes available._");
      }
    } else {
      md.push("Nesting disabled means **no group can be added as a member of this one**. On a Conditional Access persona group that closes a side door: today someone can widen a policy's scope by adding a group to a group, without the policy being touched.", "");
      md.push(`It has **${p.userCount} direct user member${p.userCount === 1 ? "" : "s"}**, no nested groups, and **${p.nRef} Conditional Access assignment${p.nRef === 1 ? "" : "s"}**.`, "");
      md.push("### What happens", "");
      p.steps.forEach((s, i) => md.push(`${i + 1}. ${s.text}`));
      md.push("", "### If Entra refuses the in-place change", "");
      p.fallback.forEach((s, i) => md.push(`${i + 1}. ${s.text}`));
      md.push("", "_You will be asked again before any of that runs._", "");
      p.warnings.forEach((w) => md.push(`> ⚠ ${w}`, ""));
    }
    $("nestBody").innerHTML = mdToHtml(md.join("\n"));
    $("nestGo").style.display = p.ok ? "" : "none";
    $("nestCancel").textContent = p.ok ? "Cancel" : "Close";
  }
  $("nestCancel").addEventListener("click", () => $("nestModal").classList.remove("open"));

  $("nestGo").addEventListener("click", async () => {
    const p = nestPlan; if (!p || !p.ok) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...CaGroups.NEST_WRITE_SCOPES])) return;
    const btn = $("nestGo"); btn.disabled = true; btn.textContent = "Setting…";
    try {
      let ok = false, patchError = null;
      if (isDemo) {
        ok = !p.name.toLowerCase().includes("admins");   // exercise both routes in demo
        patchError = ok ? null : "Demo — simulated refusal";
      } else {
        try {
          await Graph.gpatch(`/groups/${p.id}`, { disableNesting: true }, [...AUTH_CONFIG.scopes, ...CaGroups.NEST_WRITE_SCOPES]);
          // Entra can accept a PATCH and silently ignore an unknown property,
          // so success is not "no error" — it is the value reading back true.
          const back = await Graph.gget(`/groups/${p.id}?$select=id,disableNesting`);
          ok = CaGroups.nestingState(back) === "disabled";
          if (!ok) patchError = "Entra accepted the update but the property did not stick — it is still only settable at creation.";
        } catch (e) { patchError = GroupUse.shortErr(e); }
      }

      if (ok) {
        $("nestModal").classList.remove("open");
        nestRow.nesting = "disabled";
        showReport("🚫 Disable nesting", "CA-Group-DisableNesting",
          CaGroups.nestingReport(p, { route: "patch" }, tenantName));
        toast(`Nesting disabled on <span>${esc(p.name)}</span> — id unchanged`);
        renderCaGroups();
        return;
      }

      // In-place refused. Ask again, explicitly, for the destructive route.
      $("nestModal").classList.remove("open");
      nestPlan = { ...p, patchError };
      $("nestRcBody").innerHTML = mdToHtml([
        `Entra refused to set the property on **${p.name}** as it stands:`, "",
        `> ${patchError}`, "",
        "The only remaining route is to recreate the group. That means:", "",
        ...p.fallback.map((s, i) => `${i + 1}. ${s.text}`), "",
        `**The group gets a new object id.** Conditional Access assignments are moved for you. Anything else that points at this group — app assignments, Intune, group-based licensing, Azure RBAC — is **not**, and will keep pointing at the old, renamed group. Run [Group Analyzer](#tool:toolGroupUse) on it first if you are unsure.`, "",
        "The old group is renamed, not deleted, so this is recoverable.",
      ].join("\n"));
      $("nestRcOk").value = ""; $("nestRcGo").disabled = true;
      $("nestRcModal").classList.add("open");
    } catch (e) {
      console.error(e); toast(`Failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "Disable nesting"; }
  });

  $("nestRcOk").addEventListener("input", (e) => { $("nestRcGo").disabled = e.target.value.trim().toUpperCase() !== "RECREATE"; });
  $("nestRcCancel").addEventListener("click", () => $("nestRcModal").classList.remove("open"));
  $("nestRcGo").addEventListener("click", async () => {
    const p = nestPlan, r = nestRow; if (!p || !r) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...CaGroups.NEST_WRITE_SCOPES, ...MEMBER_MOVE_SCOPES, "Policy.ReadWrite.ConditionalAccess"])) return;
    const btn = $("nestRcGo"); btn.disabled = true;
    const archiveName = `${p.name} (nesting ${new Date().toISOString().slice(0, 10)})`;
    const log = { route: "recreate", archiveName, newId: null, membersMoved: 0, moved: [], failed: [], patchError: p.patchError };
    try {
      if (isDemo) {
        log.newId = "g-new-demo"; log.membersMoved = p.userCount;
        log.moved = [...p.refs.include.map((x) => ({ name: x.name, how: "include" })), ...p.refs.exclude.map((x) => ({ name: x.name, how: "exclude" }))];
      } else {
        toast("Renaming the current group…");
        await Graph.gpatch(`/groups/${r.id}`, { displayName: archiveName }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]);

        toast("Creating the replacement…");
        let g;
        try {
          g = await Assign.createGroup({
            displayName: p.name, description: r.description,
            roleAssignable: !!r.roleAssignable, disableNesting: true,
          }, { mustCreate: true });
        } catch (e) {
          // roll the rename back rather than leave the tenant half-changed
          await Graph.gpatch(`/groups/${r.id}`, { displayName: p.name }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]).catch(() => {});
          throw new Error(`Could not create the replacement, so the rename was undone and nothing changed: ${e.message || e}`);
        }
        // The build-179 guard: creation can hand back the group we just renamed
        // if the directory has not caught up. Acting on that id would strip the
        // original's assignments instead of moving them.
        if (String(g.id).toLowerCase() === String(r.id).toLowerCase()) {
          await Graph.gpatch(`/groups/${r.id}`, { displayName: p.name }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]).catch(() => {});
          throw new Error("Entra returned the original group's id for the new group — the directory has not replicated the rename yet. The rename was undone and nothing else was touched. Try again in a minute.");
        }
        log.newId = g.id;

        const mm = await moveGroupMembers(r.id, g.id, (m) => toast(m));
        log.membersMoved = mm.moved;
        mm.failed.forEach((f) => log.failed.push(f));

        // point the policies at the new group
        const refs = [...p.refs.include.map((x) => ({ ...x, how: "include" })), ...p.refs.exclude.map((x) => ({ ...x, how: "exclude" }))];
        for (let i = 0; i < refs.length; i++) {
          const pol = refs[i];
          toast(`Moving policy ${i + 1}/${refs.length}…`);
          try {
            const fresh = await Graph.gget(`/identity/conditionalAccess/policies/${pol.id}`);
            const u = fresh.conditions?.users || {};
            const key = pol.how === "include" ? "includeGroups" : "excludeGroups";
            const list = (u[key] || []).map((x) => (x === r.id ? g.id : x));
            await Graph.gpatch(`/identity/conditionalAccess/policies/${pol.id}`, { conditions: { users: { ...u, [key]: [...new Set(list)] } } });
            log.moved.push({ name: pol.name, how: pol.how });
          } catch (e) { console.error(e); log.failed.push({ name: pol.name, error: e.message || String(e) }); }
        }
      }
      $("nestRcModal").classList.remove("open");
      showReport("🚫 Disable nesting — recreated", "CA-Group-DisableNesting", CaGroups.nestingReport(p, log, tenantName));
      toast(log.failed.length ? `Recreated with <span>${log.failed.length} failure(s)</span>` : `<span>${p.name}</span> recreated with nesting disabled`);
      cgRes = null; await openCaGroups(true); cgTab = "check"; renderCaGroups();
    } catch (e) {
      console.error(e); toast(`Recreate failed: <span>${esc(e.message || e)}</span>`);
      btn.disabled = false;
    }
  });

  // ---- recreate a not-role-assignable group correctly ----
  // isAssignableToRole is immutable, so the group has to be replaced: rename the
  // old one aside, create a new role-assignable group with the original name,
  // then swap every referencing policy from the old group id to the new one.
  let recreateRow = null;
  // ↻ Recreate role-assignable was removed in build 25026. The baseline no
  // longer uses role-assignable groups: the flag was only ever a way to keep
  // membership away from tenant-wide group administrators, and a restricted
  // management administrative unit does that better. ⑦ Migrate moves existing
  // ones across. The old modal is gone with it rather than left dead in the
  // file, where it would be one wire away from creating them again.


  // Dynamic and role-assignable are mutually exclusive in Entra. Reflect that
  // live: choosing Dynamic reveals the rule box and forces role-assignable off.
  $("cgBody").addEventListener("change", (e) => {
    if (e.target.matches("[data-cgmem]")) {
      const n = e.target.dataset.cgmem;
      if (e.target.checked) cgMemberSel.add(n); else cgMemberSel.delete(n);
      // refresh just the button label, not the whole list (keeps scroll + focus)
      const go = $("cgMemberGo");
      if (go) { const c = cgMemberSel.size; go.disabled = !c; go.textContent = `Read members of ${c} selected group${c === 1 ? "" : "s"}`; }
      return;
    }
    if (e.target.name === "cgmType") {
      const dyn = e.target.value === "dynamic";
      const w = $("cgmRuleWrap"); if (w) w.style.display = dyn ? "block" : "none";
    }
    if (e.target.id === "cgmRmau") {
      const w = $("cgmRmauWrap");
      if (w) w.style.display = e.target.checked ? "block" : "none";
      if (e.target.checked) cgmLoadRmaus();
    }
  });

  // The restricted AUs available to the builder. Loaded on demand — ticking the
  // box is the first moment we need them.
  let cgmRmauList = null;
  async function cgmLoadRmaus() {
    const sel = $("cgmRmauPick");
    if (!sel) return;
    if (!cgmRmauList) {
      sel.innerHTML = '<option>Reading administrative units…</option>';
      try {
        cgmRmauList = isDemo
          ? ((typeof DEMO_DATA !== "undefined" && DEMO_DATA.adminUnits) || []).filter((a) => a.isMemberManagementRestricted).map((a) => ({ id: a.id, name: a.displayName }))
          : (await Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted"))
              .filter((a) => a.isMemberManagementRestricted === true).map((a) => ({ id: a.id, name: a.displayName }));
      } catch (e) { cgmRmauList = []; console.warn("RMAU list failed:", e.message); }
    }
    sel.innerHTML = [...cgmRmauList.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`),
      `<option value="new">➕ Create “${esc(RMAU_DEFAULT_NAME)}”</option>`].join("");
  }

  async function cgManualCreate(btn) {
    const name = $("cgmName").value.trim();
    if (!name) { toast("Give the group a display name"); $("cgmName").focus(); return; }
    const dynamic = document.querySelector('[name="cgmType"]:checked')?.value === "dynamic";
    const rule = dynamic ? $("cgmRule").value.trim() : "";
    if (dynamic && !rule) { toast("A dynamic group needs a membership rule"); $("cgmRule").focus(); return; }
    const roleAssignable = false;   // retired — see the note in the builder
    if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "Group-NestingSupport.ReadWrite.All"])) return;
    btn.disabled = true;
    const log = $("cgmLog");
    try {
      const spec = { displayName: name, description: $("cgmDesc").value.trim(), dynamic, membershipRule: rule, roleAssignable };
      const g = isDemo
        ? { id: "g-" + name, name, created: true, dynamic, roleAssignable }
        : await Assign.createGroup(spec);
      // Protection LAST, and only after the group exists — the same ordering
      // the migration wizard uses, for the same reason: once it is in the AU,
      // adding members needs an AU-scoped role.
      if ($("cgmRmau")?.checked && g && g.id) {
        try {
          let auId = $("cgmRmauPick")?.value;
          if (auId === "new" && !isDemo) {
            const au = await Graph.gpost("/administrativeUnits", {
              displayName: RMAU_DEFAULT_NAME,
              description: "Restricted management administrative unit protecting Conditional Access exclusion groups. Membership changes require a role scoped to this administrative unit.",
              isMemberManagementRestricted: true,
            }, [...AUTH_CONFIG.scopes, "AdministrativeUnit.ReadWrite.All"]);
            auId = au.id; cgmRmauList = null;
          }
          if (!isDemo && auId && auId !== "new") {
            await Graph.gpost(`/administrativeUnits/${auId}/members/$ref`,
              { "@odata.id": `https://graph.microsoft.com/beta/groups/${g.id}` },
              [...AUTH_CONFIG.scopes, "AdministrativeUnit.ReadWrite.All"]);
          }
          g.protected = true;
        } catch (e) {
          // The group exists either way — say which half succeeded rather than
          // reporting the whole create as failed.
          g.protectError = e.message || String(e);
        }
      }
      const kind = g.dynamic ? "dynamic" : "assigned";
      const prot = g.protectError
        ? `<div style="color:var(--off)">✗ but it could NOT be placed in the restricted AU — ${esc(g.protectError)}. The group exists; protect it from ⑥ Protect.</div>`
        : g.protected
          ? `<div style="color:var(--on)">✓ placed in the restricted AU — only an AU-scoped role can change its members now${g.dynamic ? "" : ", so add members with a scoped role or remove it from the AU first"}</div>`
          : "";
      cgmMsg = (g.created
        ? `<span style="color:var(--on)">✓ created <b>${esc(g.name)}</b> — ${kind}</span>`
        : `<span style="color:var(--report)">• <b>${esc(g.name)}</b> already existed — reused</span>`) + prot;
      log.innerHTML = cgmMsg;
      toast(g.created ? `<span>${esc(g.name)}</span> created (${kind})${isDemo ? " (simulated)" : ""}` : `<span>${esc(g.name)}</span> already existed — reused`);
      // fold the new group into the scan so Check shows it without a refresh
      cgRes = null;
      await openCaGroups(true);
      cgTab = "create"; renderCaGroups();
    } catch (err) {
      console.error(err);
      cgmMsg = `<span style="color:var(--off)">✗ ${esc(err.message || err)}</span>`;
      if ($("cgmLog")) $("cgmLog").innerHTML = cgmMsg;
      toast(`Create failed: <span>${esc(err.message || err)}</span>`);
      btn.disabled = false;
    }
  }

  // ---- ③ members ----
  // The picker: choose which groups to read rather than reading all of them.
  // One Graph call per group, so on a big tenant this is the difference between
  // a handful of calls and a hundred.
  function cgMemberPicker(open) {
    const avail = cgRes.rows.filter((r) => r.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const q = cgQuery.toLowerCase();
    const shown = q ? avail.filter((r) => r.name.toLowerCase().includes(q)) : avail;
    const sel = [...cgMemberSel].filter((n) => avail.some((r) => r.name === n));
    return `<div class="cg-panel">
      <h4>MEMBER SCAN — PICK THE GROUPS</h4>
      <p class="mini">Reading members costs <b>one Graph call per group</b>, so only the groups you tick are read.
        Membership is read <b>transitively</b>, so a user nested through another group still shows up.
        Groups larger than ${CaGroups.MEMBER_CAP} members are counted in full but listed to the cap.</p>
      <div class="row" style="justify-content:flex-start;margin:10px 0 6px;gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-cgmsel="all">Select all${q ? " shown" : ""} (${shown.length})</button>
        <button class="btn sm" data-cgmsel="none">Clear</button>
        <button class="btn sm" data-cgmsel="unread">Only not-yet-read</button>
        <span class="mini muted">${sel.length} selected${q ? ` · filtered by “${esc(cgQuery)}”` : " · use the search box to narrow the list"}</span>
      </div>
      <div class="cg-picklist">${shown.map((r) => `<label class="chk">
          <input type="checkbox" data-cgmem="${esc(r.name)}" ${cgMemberSel.has(r.name) ? "checked" : ""}>
          <span>${esc(r.name)}</span>
          ${r.members ? `<span class="mini muted">· ${r.memberTotal} member${r.memberTotal === 1 ? "" : "s"} read</span>` : ""}
          ${r.refs && (r.refs.include.length + r.refs.exclude.length) ? `<span class="mini muted">· ${r.refs.include.length + r.refs.exclude.length} policy ref${(r.refs.include.length + r.refs.exclude.length) === 1 ? "" : "s"}</span>` : ""}
        </label>`).join("") || '<p class="mini">No group matches the search.</p>'}</div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn primary" id="cgMemberGo" ${sel.length ? "" : "disabled"}>Read members of ${sel.length} selected group${sel.length === 1 ? "" : "s"}</button>
        ${open ? '<button class="btn" data-cgmclose>Back to the matrix</button>' : ""}
      </div>
    </div>`;
  }

  // ---------- ③ Members: add a user to a group ----------
  // A directory type-ahead on the user field and the loaded groups on the other.
  // The write is deliberately narrow: one user, one group, reported inline, and
  // the matrix re-reads that group afterwards so the new row is visible rather
  // than merely claimed.
  let cgAddGroup = "";
  let cgAddTimer = null;
  // renderCgMembers() rebuilds #cgAddLog, so a message written straight into the
  // DOM vanishes the moment the matrix repaints — which is exactly when the
  // confirmation matters. Keep it in state and render it.
  let cgAddMsg = null;   // { html, bad }

  function cgAddSuggest(e) {
    if (e.target.id !== "cgAddUser") return;
    const term = String(e.target.value || "").trim();
    clearTimeout(cgAddTimer);
    // Selecting from a <datalist> fires `input` just like typing does. Without
    // this the pick re-runs the query, the options are rewritten, and the
    // browser reopens the dropdown over a field you have already filled — so
    // it looks like the choice did not take. An exact match against what is
    // already offered means the value came from the list, not the keyboard.
    const dlNow = $("cgUserSug");
    if (dlNow && [...dlNow.options].some((o) => o.value === term)) return;
    if (term.length < 2 || isDemo) return;
    cgAddTimer = setTimeout(async () => {
      const f = term.replace(/'/g, "''");
      try {
        const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
        const dl = $("cgUserSug");
        if (dl) dl.innerHTML = ((r && r.value) || [])
          .map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
      } catch (err) { console.warn("member suggest failed:", err.message); }
    }, 250);
  }

  async function cgAddMember() {
    const uBox = $("cgAddUser"), gBox = $("cgAddGroup"), log = $("cgAddLog");
    const upn = (uBox?.value || "").trim(), gName = (gBox?.value || "").trim();
    const say = (html, bad) => {
      cgAddMsg = { html, bad: !!bad };
      const el = $("cgAddLog");
      if (el) el.innerHTML = `<span style="${bad ? "color:var(--off)" : ""}">${html}</span>`;
    };
    if (!upn) { say("Type a user first.", true); return; }
    if (!gName) { say("Pick a group.", true); return; }
    const row = (cgRes.rows || []).find((r) => r.name === gName && r.id);
    if (!row) { say(`No loaded group called <b>${esc(gName)}</b> — read its members first.`, true); return; }
    cgAddGroup = gName;

    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "Group-NestingSupport.ReadWrite.All"])) return;
    say("Adding…");
    try {
      let user = { id: "demo-" + upn, displayName: upn };
      if (!isDemo) user = await Graph.gget(`/users/${encodeURIComponent(upn)}?$select=id,displayName,userPrincipalName`);
      if ((row.members || []).some((m) => m.id === user.id)) {
        say(`<b>${esc(user.displayName || upn)}</b> is already a member of <b>${esc(gName)}</b>.`);
        return;
      }
      if (!isDemo) {
        await Graph.gpost(`/groups/${row.id}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/beta/directoryObjects/${user.id}` },
          [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]);
      }
      // Re-read that one group so the matrix shows the result. Directory writes
      // are not read-your-writes consistent, so add the row locally too and let
      // the re-read confirm it rather than contradict it.
      const fresh = { id: user.id, name: user.displayName || upn, upn: user.userPrincipalName || upn, disabled: false };
      row.members = [...(row.members || []), fresh];
      row.memberTotal = (row.memberTotal || 0) + 1;
      say(`✓ <b>${esc(fresh.name)}</b> added to <b>${esc(gName)}</b>.`);
      if (uBox) uBox.value = "";
      renderCgMembers();
      if (!isDemo) {
        try {
          await CaGroups.loadMembers([row], {});
          renderCgMembers();
        } catch { /* the optimistic row stands */ }
      }
    } catch (e) {
      const dup = /already exist/i.test(e.message || "");
      say(dup ? `Already a member of <b>${esc(gName)}</b>.` : `Add failed: ${esc(e.message || e)}`, !dup);
    }
  }

  function renderCgMembers() {
    const scanned = cgRes.rows.filter(r => r.members);
    if (cgMemberPick || (!scanned.length && !cgBusy)) {
      $("cgBody").innerHTML = cgMemberPicker(scanned.length > 0);
      return;
    }
    if (cgBusy) {
      $("cgBody").innerHTML = `<div class="cg-panel">
        <h4>READING MEMBERS…</h4>
        <div class="cg-progress"><div id="cgMemBar" style="width:0%"></div></div>
        <p class="mini" id="cgMemStatus">Starting…</p>
        <div class="row" style="justify-content:flex-start;margin-top:12px"><button class="btn" id="cgMemberStop">Stop</button></div>
      </div>`;
      return;
    }
    const m = CaGroups.matrix(cgRes.rows);
    const empties = m.empty.length
      ? `<p class="mini" style="margin:10px 0;color:var(--report)">⚠ ${m.empty.length} group${m.empty.length === 1 ? " is" : "s are"} empty:
         ${m.empty.map(c => `<b>${esc(c.name)}</b>`).join(", ")} — a policy scoped to an empty include group applies to nobody;
         an empty exclude group excludes nobody.</p>` : "";
    const errs = cgRes.rows.filter(r => r.memberError);
    // Add a member without leaving the matrix. Only the groups whose members
    // are actually loaded are offered — adding to a group you cannot see the
    // members of would be a write with no way to check the result.
    // Prefill the group when there is no ambiguity — one loaded group means
    // there is only one possible answer, so making you pick it is busywork.
    // With several, keep whatever you used last IF it is still loaded, and
    // otherwise leave it blank: guessing among several groups is how a member
    // lands in the wrong exclusion.
    if (m.cols.length === 1) cgAddGroup = m.cols[0].name;
    else if (cgAddGroup && !m.cols.some((c) => c.name === cgAddGroup)) cgAddGroup = "";

    const addBar = `<div class="cg-panel">
        <h4>ADD A MEMBER <span class="tag new">NEW</span></h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="cgAddUser" list="cgUserSug" placeholder="User — name or UPN" spellcheck="false" autocomplete="off" style="flex:1;min-width:220px">
          <span class="mini muted">to</span>
          <input id="cgAddGroup" list="cgGroupSug" placeholder="Group" spellcheck="false" autocomplete="off" style="flex:1;min-width:200px" value="${esc(cgAddGroup || "")}">
          <button class="btn primary" id="cgAddGo">＋ Add</button>
        </div>
        <p class="mini muted" style="margin:8px 0 0">Type two letters and the directory suggests users. ${m.cols.length === 1
          ? `Only <b>${esc(m.cols[0].name)}</b> is loaded here, so it is filled in for you — read more groups above to add to another.`
          : `The group list is the ${m.cols.length} groups whose members are loaded here, so the matrix can show the result immediately.`}</p>
        <div id="cgAddLog" class="mini" style="margin-top:8px">${cgAddMsg ? `<span style="${cgAddMsg.bad ? "color:var(--off)" : ""}">${cgAddMsg.html}</span>` : ""}</div>
      </div>`;

    $("cgBody").innerHTML = `<div class="mini" style="margin:10px 0">
        ${m.users.length} distinct member${m.users.length === 1 ? "" : "s"} across ${m.cols.length} group${m.cols.length === 1 ? "" : "s"}.
        <button class="btn sm" data-cgmpick style="margin-left:8px">＋ Read more groups</button>
        <button class="btn sm" id="cgMemberGo" style="margin-left:6px">⟳ Re-read selected</button>
      </div>${addBar}${empties}
      ${errs.length ? `<p class="mini" style="color:var(--off)">${errs.length} group${errs.length === 1 ? "" : "s"} could not be read: ${errs.map(r => esc(r.name)).join(", ")}</p>` : ""}
      ${CaGroups.renderMatrix(m, cgQuery)}`;
    const gl = $("cgGroupSug");
    if (gl) gl.innerHTML = m.cols.map((c) => `<option value="${esc(c.name)}"></option>`).join("");
  }

  // One group's members, on demand. Same reader as the bulk scan so a row
  // filled this way is indistinguishable from one filled by "read all" — it
  // counts towards the matrix and the Markdown export straight away.
  async function scanOneGroup(name, btn) {
    const r = cgRes && cgRes.rows.find(x => x.name === name);
    if (!r || !r.id) return;
    const label = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      if (isDemo) {
        r.memberTotal = 3;
        r.members = [1, 2, 3].map(k => ({ id: `u${k}-${r.id}`, name: `Demo user ${k}`, upn: `demo${k}@contoso.com`, disabled: k === 3 }));
      } else {
        await CaGroups.loadMembers([r], {});
      }
      if (r.memberError) toast(`Could not read <span>${esc(r.name)}</span>: ${esc(r.memberError)}`);
      else toast(`<span>${esc(r.name)}</span> — ${r.memberTotal} member${r.memberTotal === 1 ? "" : "s"}`);
    } catch (e) {
      console.error(e); toast(`Member read failed: <span>${esc(e.message || e)}</span>`);
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
    renderCaGroups();
    if ($("depModal").classList.contains("open")) showGroupRow(name);
  }

  async function startMemberScan() {
    cgBusy = true; cgStop = false; renderCaGroups();
    try {
      // only the groups the user ticked — one Graph call each
      const picked = cgRes.rows.filter(r => r.id && cgMemberSel.has(r.name));
      const targets = picked.length ? picked : cgRes.rows.filter(r => r.id && r.members);
      if (isDemo) {
        targets.forEach((r, i) => {
          r.memberTotal = i % 4; r.members = Array.from({ length: i % 4 }, (_, k) =>
            ({ id: `u${k}-${i}`, name: `Demo user ${k + 1}`, upn: `demo${k + 1}@contoso.com`, disabled: false }));
        });
      } else {
        await CaGroups.loadMembers(targets, {
          shouldStop: () => cgStop,
          onStatus: (msg, i, n) => {
            const s = $("cgMemStatus"), b = $("cgMemBar");
            if (s) s.textContent = msg;
            if (b) b.style.width = `${Math.round((i / n) * 100)}%`;
          },
        });
      }
      if (cgStop) toast("Member scan <span>stopped</span> — showing what was read so far");
    } catch (e) {
      console.error(e); toast(`Member scan failed: <span>${esc(e.message || e)}</span>`);
    } finally {
      cgBusy = false; renderCaGroups();
    }
  }

  // ---- ④ assign ----
  function renderCgAssign() {
    const n = selected.size;
    $("cgBody").innerHTML = `<div class="cg-panel">
      <h4>ASSIGN GROUPS TO POLICIES</h4>
      <p class="mini">Set or add the include/exclude groups of your policies. Scope it to the policies you ticked in
        <b>List Policies</b>, or to every policy in the tenant — the latter is how a break-glass or service-account
        exclusion gets onto everything without missing one. <b>ADD to EXCLUDE</b> is the only additive action; the
        others replace what is there.</p>
      <p class="mini" style="margin-top:8px">${n
        ? `<b>${n}</b> polic${n === 1 ? "y is" : "ies are"} currently selected.`
        : "Nothing is selected right now, so the wizard will open scoped to <b>all policies</b> — you can change that in step 1."}</p>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn primary" id="cgAssignGo">Open the assign wizard →</button>
        <button class="btn" id="cgAssignPick">Pick policies first</button>
      </div>
    </div>`;
  }
  $("cgBody").addEventListener("click", (e) => {
    // ---- member picker ----
    const bulk = e.target.closest("[data-cgmsel]");
    if (bulk) {
      const avail = cgRes.rows.filter((r) => r.id);
      const q = cgQuery.toLowerCase();
      const shown = q ? avail.filter((r) => r.name.toLowerCase().includes(q)) : avail;
      const mode = bulk.dataset.cgmsel;
      if (mode === "none") cgMemberSel.clear();
      else if (mode === "all") shown.forEach((r) => cgMemberSel.add(r.name));
      else if (mode === "unread") { cgMemberSel.clear(); shown.filter((r) => !r.members).forEach((r) => cgMemberSel.add(r.name)); }
      renderCaGroups(); return;
    }
    if (e.target.closest("[data-cgmpick]")) { cgMemberPick = true; renderCaGroups(); return; }
    if (e.target.closest("[data-cgmclose]")) { cgMemberPick = false; renderCaGroups(); return; }
    if (e.target.id === "cgAssignGo") { openAssign(selected.size ? "selection" : "all"); return; }
    if (e.target.id === "cgAssignPick") {
      setToolMode("assign"); setView("cards"); show("screen-list");
      toast("Tick the policies, then use <span>Assign groups or roles</span> on the selection bar");
    }
  });

  // R10 — the actions available for one group, offered on the group itself.
  // Every one of these was already reachable: open the right tab, find the row
  // again, tick it. That is three steps of re-finding something you already had
  // selected, and the tab strip gives no clue which of the seven apply to the
  // group in front of you. What is offered here is only what makes sense for
  // this group's actual state — a missing group cannot have members read, a
  // role-assignable one cannot be protected, one already in a vault does not
  // need protecting again.
  function cgRowActions(r) {
    const acts = [];
    const prot = r.id ? ((cgProt && cgProt.get(r.id)) || (cgRmau && cgRmau.status ? cgRmau.status.get(r.id) : null)) : null;

    if (!r.id && r.template) acts.push({ tab: "create", label: "② Create it", why: "it does not exist in this tenant yet" });
    if (r.id) {
      acts.push({ tab: "members", label: "③ Read members", why: "who is in it right now" });
      acts.push({ tab: "assign", label: "④ Assign to policies", why: "put it on a policy's include or exclude" });
      // ⑤ takes a whole CSV rather than one group, so it is offered as a
      // destination but nothing is pre-selected there — saying otherwise would
      // promise a carry-over that cannot happen.
      acts.push({ tab: "csv", label: "⑤ Import members", why: "add people from a CSV (the file picks the groups)" });
    }
    if (r.id && !prot && !r.roleAssignable) {
      acts.push({ tab: "rmau", label: "⑥ Protect it", why: "file it in its persona's restricted unit" });
    }
    if (r.id && r.roleAssignable) {
      acts.push({ tab: "migrate", label: "⑦ Migrate off role-assignable", why: prot
        ? "it is FROZEN — remove it from the unit first, then convert it"
        : "role-assignable groups cannot be protected; convert it first" });
    }
    if (!acts.length) return "";
    return `<h5 class="mini" style="margin:14px 0 6px">WHAT YOU CAN DO WITH IT</h5>
      <div class="cg-pick" style="padding:0">${acts.map((a) => `<div class="dr-row"><div class="dr-head">
          <button class="btn sm" data-cgact="${esc(a.tab)}" data-cgactname="${esc(r.name)}">${esc(a.label)}</button>
          <span class="mini muted">${esc(a.why)}</span>
        </div></div>`).join("")}</div>
      ${prot ? `<p class="mini muted" style="margin:6px 0 0">🔒 Currently in <b>${esc(prot.auName)}</b> — its members can only be changed by a role scoped to that unit.</p>` : ""}`;
  }

  // Detail of one group row — the policies that use it and its members.
  function showGroupRow(name) {
    const r = cgRes.rows.find(x => x.name === name); if (!r) return;
    const list = (arr, how) => arr.length
      ? `<h5 class="mini" style="margin:10px 0 4px">${how} (${arr.length})</h5><ul class="plist2" style="border:1px solid var(--border);border-radius:8px">${arr.map(p => `<li>${esc(p.name)}</li>`).join("")}</ul>` : "";
    $("depTitle").textContent = r.name;
    $("depBody").innerHTML = `
      <p class="mini">${r.id ? `Object ID <code>${esc(r.id)}</code>` : "Not present in this tenant"}
        · ${r.status === "missing" ? "missing" : r.dynamic ? "dynamic" : r.roleAssignable ? "role-assignable" : "assigned"}
        · expected by ${r.sources.join(", ")}</p>
      ${r.description ? `<p class="mini">${esc(r.description)}</p>` : ""}
      ${r.membershipRule ? `<p class="mini">Membership rule: <code>${esc(r.membershipRule)}</code></p>` : ""}
      ${r.drift ? `<p class="mini" style="color:var(--report)">⚠ ${esc(r.drift)}</p>` : ""}
      ${(() => {
        // "Migrate it" understates the case when the group is ALREADY inside a
        // restricted unit: at that point its members cannot be changed by
        // anybody, today, and that is a live incident rather than a plan.
        // Uses the tool's own protection read, falling back to ⑥ Protect's if
        // that one failed. Nothing is claimed when neither has an answer.
        if (!r.roleAssignable) return "";
        const prot = (cgProt && cgProt.get(r.id)) || (cgRmau && cgRmau.status ? cgRmau.status.get(r.id) : null);
        if (!prot) return "";
        return `<p class="mini" style="color:var(--off)">🧊 <b>frozen — its members cannot be changed by anyone.</b> It is role-assignable <i>and</i> already in the restricted unit <b>${esc(prot.auName)}</b>. Only Global Administrator and Privileged Role Administrator may edit a role-assignable group's members, and that unit blocks both; neither flag can be undone. Remove it from the unit first (🛡 Restricted AUs), then convert it with ⑦ Migrate.</p>`;
      })()}
      ${cgRowActions(r)}
      ${list(r.refs.include, "Included in")}
      ${list(r.refs.exclude, "Excluded from")}
      ${!r.refCount ? '<p class="mini muted" style="margin-top:10px">No policy references this group.</p>' : ""}
      ${r.id && !r.members ? `<div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn" id="cgOneScan" data-cgone="${esc(r.name)}">Read members of this group</button></div>` : ""}
      ${r.memberError ? `<p class="mini" style="color:var(--off)">Member read failed: ${esc(r.memberError)}</p>` : ""}
      ${r.members ? `<h5 class="mini" style="margin:10px 0 4px">Members (${r.memberTotal})</h5>
        <ul class="plist2" style="border:1px solid var(--border);border-radius:8px">${r.members.map(m => `<li>${esc(m.name)} <span class="mini muted">${esc(m.upn || "")}</span>${m.disabled ? ' <span class="tag block">disabled</span>' : ""}</li>`).join("") || '<li class="mini">No members</li>'}</ul>` : ""}`;
    $("depModal").classList.add("open");
  }
  // the same per-group scan, from inside the group's detail overlay
  $("depBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cgone]");
    if (b) { scanOneGroup(b.dataset.cgone, b); return; }
    const a = e.target.closest("[data-cgact]");
    if (!a) return;
    // Carry the group across rather than dropping the reader back into a tab
    // with nothing selected — the whole point is not having to find it again.
    const name = a.dataset.cgactname;
    const row = (cgRes && cgRes.rows || []).find((x) => x.name === name);
    $("depModal").classList.remove("open");
    cgTab = a.dataset.cgact; cgQuery = ""; $("cgSearch").value = "";
    if (cgTab === "members") { cgMemberSel.clear(); cgMemberSel.add(name); cgMemberPick = true; }
    if (cgTab === "rmau" && row && row.id && cgRmau) { cgRmau.sel = new Set([row.id]); cgRmau.q = name; }
    if (cgTab === "migrate" && row && row.id && cgMig) { cgMig.sel = new Set([row.id]); }
    renderCaGroups();
    toast(`<span>${esc(name)}</span> carried over to ${esc(a.textContent.trim())}`);
  });

  // Changing the scope means a different set of groups to look up → re-scan.
  $("cgScope").addEventListener("change", async (e) => {
    cgScope = e.target.value;
    cgRes = null; cgMemberSel.clear(); cgMemberPick = false;
    await openCaGroups(true);
  });
  $("cgBody").addEventListener("input", cgAddSuggest);
  $("cgBody").addEventListener("change", (e) => { if (e.target.id === "cgAddGroup") cgAddGroup = e.target.value; });
  $("cgTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cgtab]"); if (!b) return;
    cgTab = b.dataset.cgtab; cgQuery = ""; $("cgSearch").value = "";
    renderCaGroups();
  });
  $("cgChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cgf]"); if (!b) return;
    cgFilter = b.dataset.cgf; renderCaGroups();
  });
  $("cgSearch").addEventListener("input", (e) => { cgQuery = e.target.value.trim().toLowerCase(); renderCaGroups(); });
  $("cgRefresh").addEventListener("click", async () => {
    const btn = $("cgRefresh");
    btn.disabled = true; btn.textContent = "⟳ Refreshing…";
    try {
      if (isDemo) loadDemo(); else await loadFromGraph(true);
      cgRes = null;
      await openCaGroups(true);
      toast("Groups <span>re-scanned</span>");
    } catch (e) { toast(`Refresh failed: <span>${esc(e.message || e)}</span>`); }
    finally { btn.disabled = false; btn.textContent = "⟳ Refresh"; }
  });
  $("cgMd").addEventListener("click", () => {
    if (!cgRes) return;
    showReport("👥 Conditional Access groups", "CA-Groups",
      CaGroups.toMd(cgRes, tenantName, cgRes.rows.some(r => r.members)));
  });
  $("cgFull").addEventListener("click", () => Fs.open("Members × groups", { body: $("cgBody") }));

  // ---------- assign-groups wizard ----------
  let asStep = 0, asAction = null, asGroups = [], asPolicies = [], asResults = null;
  // "groups" | "roles" — the portal's two ways of naming who a policy covers.
  let asTarget = "groups", asRoles = [], asRoleQuery = "", asRoleAdminOnly = true;
  // "selection" = the policies ticked in the list; "all" = every policy loaded
  // from the tenant. Tenant-wide is what you want for a break-glass or
  // service-account exclusion that must never miss a policy.
  let asScope = "selection", asFound = [], asRun = null;
  const asScopePolicies = () => exportOrder(asScope === "all"
    ? policies.slice()
    : [...selected].map(id => policies.find(p => p.id === id)).filter(Boolean));
  function openAssign(scope) {
    asScope = scope || (selected.size ? "selection" : "all");
    if (!policies.length) { toast("No policies loaded"); return; }
    if (asScope === "all" && !selected.size) toast("Nothing selected — scoped to <span>all policies</span>, change it in step 1");
    asPolicies = asScopePolicies();
    asStep = 0; asAction = null; asGroups = []; asResults = null; asFound = [];
    asTarget = "groups"; asRoles = []; asRoleQuery = ""; asRoleAdminOnly = true;
    renderAssign();
    $("assignModal").classList.add("open");
  }
  function assignEsc(s) { return esc(s); }
  async function renderAssign() {
    const b = $("asBody"), next = $("asNext"), back = $("asBack");
    $("asSub").textContent = `${asPolicies.length} ${asPolicies.length === 1 ? "policy" : "policies"}`
      + ` ${asScope === "all" ? "(every policy in this tenant)" : "selected"} · step ${Math.min(asStep + 1, 3)} of 3`;
    back.style.display = asStep > 0 && asStep < 3 ? "inline-flex" : "none";
    const asT = $("asTitle");
    // Step 0 is where the target is still being chosen, so name both; after
    // that the title says which one you are actually working on.
    if (asT) asT.textContent = asStep === 0 ? "Assign groups or roles"
      : asTarget === "roles" ? "Assign directory roles" : "Assign groups";
    next.style.display = "inline-flex";
    if (asStep === 0) {
      next.textContent = "Next";
      const nSel = selected.size, nAll = policies.length;
      b.innerHTML = `<h4 class="mini" style="margin-bottom:8px">APPLY TO</h4>
        <label class="chk" style="margin:6px 0"><input type="radio" name="asScope" value="selection" ${asScope === "selection" ? "checked" : ""} ${nSel ? "" : "disabled"}> Selected policies (${nSel})</label>
        <label class="chk" style="margin:6px 0"><input type="radio" name="asScope" value="all" ${asScope === "all" ? "checked" : ""}> <b>All policies in this tenant (${nAll})</b> <span class="mini muted">— for an exclusion that must cover everything</span></label>
        <h4 class="mini" style="margin:16px 0 8px">ASSIGN</h4>
        <label class="chk" style="margin:6px 0"><input type="radio" name="asTarget" value="groups" ${asTarget === "groups" ? "checked" : ""}> Groups</label>
        <label class="chk" style="margin:6px 0"><input type="radio" name="asTarget" value="roles" ${asTarget === "roles" ? "checked" : ""}> <b>Directory roles</b> <span class="mini muted">— the portal's “Directory roles” under Include/Exclude</span></label>
        <h4 class="mini" style="margin:16px 0 8px">ACTION</h4>` + Assign.actionsFor(asTarget).map((a, i) =>
        a ? `<label class="chk" style="margin:6px 0"><input type="radio" name="asAct" value="${i}" ${asAction === i ? "checked" : ""}> ${assignEsc(a)}</label>` : "").join("");
    } else if (asStep === 1 && asTarget === "roles") {
      next.textContent = "Next";
      if (!asRoles.length) {
        b.innerHTML = '<p class="mini">Reading the directory roles…</p>';
        try {
          asRoles = (isDemo
            ? Assign.ADMIN_ROLE_NAMES.map((n, i) => ({ id: "r" + i, name: n, description: "", recommended: true }))
            : await Assign.roleTemplates()).map((r) => ({ ...r, checked: false }));
        } catch (e) {
          b.innerHTML = `<p class="mini" style="color:var(--off)">Could not read the directory roles: ${esc(e.message || e)}</p>`;
          return;
        }
      }
      const q = asRoleQuery.trim().toLowerCase();
      const pool = asRoleAdminOnly ? asRoles.filter(Assign.isAdminRole) : asRoles;
      const vis = q ? pool.filter((r) => r.name.toLowerCase().includes(q)) : pool;
      const nSel = asRoles.filter((r) => r.checked).length;
      const nRec = asRoles.filter((r) => r.recommended).length;
      const nAdmin = asRoles.filter(Assign.isAdminRole).length;
      b.innerHTML = `<h4 class="mini" style="margin-bottom:6px">QUICK PICKS</h4>
        <div class="persona-row">
          <button class="btn sm" data-asroleset="recommended">Microsoft's privileged set (${nRec})</button>
          <button class="btn sm" data-asroleset="admin">All administrator roles (${nAdmin})</button>
          <button class="btn sm" data-asroleset="visible">Select all shown (${vis.length})</button>
          <button class="btn sm" data-asroleset="none">Clear</button>
        </div>
        <p class="mini muted" style="margin:8px 0 0">The privileged set is the minimum Microsoft recommends requiring MFA on — Global, Application, Authentication, Billing, Cloud Application, Conditional Access, Exchange, Helpdesk, Password, Privileged Authentication, Privileged Role, Security, SharePoint and User Administrator. Resolved against this tenant's own role templates, not hard-coded IDs.</p>
        <p class="mini" style="margin:8px 0 0;color:var(--report)">⚠ Conditional Access only enforces <b>built-in</b> roles. Custom roles and administrative-unit-scoped assignments are not covered by a policy scoped this way — only the roles listed here are.</p>
        <h4 class="mini" style="margin:16px 0 8px">DIRECTORY ROLES <span class="muted">(${nSel} selected)</span></h4>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input id="asRoleSearch" class="btn" style="flex:1;cursor:text" placeholder="Search roles…" value="${esc(asRoleQuery)}">
          <label class="chk" style="margin:0;white-space:nowrap"><input type="checkbox" id="asRoleAdminOnly" ${asRoleAdminOnly ? "checked" : ""}> Administrator roles only</label>
        </div>
        <p class="mini muted" style="margin:0 0 8px">${asRoleAdminOnly
          ? `Showing the ${nAdmin} roles with “Administrator” in the name, plus the privileged set. Untick to see all ${asRoles.length} built-in templates — which include Guest User, Device Join and the Partner support roles, rarely what a policy wants.`
          : `Showing all ${asRoles.length} built-in templates, including non-admin ones such as Guest User and Device Join.`}</p>
        <div style="max-height:34vh;overflow:auto">` +
        (vis.map((r) => `<label class="chk" style="margin:5px 0"><input type="checkbox" data-asrole="${esc(r.id)}" ${r.checked ? "checked" : ""}> ${assignEsc(r.name)}${r.recommended ? ' <span class="tag grant">privileged</span>' : ""}</label>`).join("")
          || '<p class="mini muted">No role matches that search.</p>') + `</div>`;
    } else if (asStep === 1) {
      next.textContent = "Next";
      if (!asGroups.length) {
        b.innerHTML = '<p class="mini">Checking which persona groups exist in this tenant…</p>';
        asGroups = (isDemo
          ? Object.keys(DEMO_DATA.scopeGroups || {}).map(n => ({ id: "g-" + n, name: n }))
          : await Assign.resolveGroups((m) => { const el = b.querySelector("p"); if (el) el.textContent = m; })
        ).map(g => ({ ...g, checked: false }));
      }
      const tpls = Assign.templates().filter(t => !asGroups.some(g => g.name === t.displayName));
      // Pick by persona: one click adds that persona's group, creating it from
      // its template first if the tenant does not have it. A persona already in
      // the target list is marked so it is obvious it is covered.
      const personaChips = Assign.personasWithGroup().map(p => {
        const on = asGroups.some(g => g.name === p.group && g.checked);
        return `<button class="btn sm persona-chip ${on ? "on" : ""}" data-asPersona="${esc(p.group)}" title="${esc(p.group)}">${esc(p.label)}${on ? " ✓" : ""}</button>`;
      }).join("");
      b.innerHTML = `<h4 class="mini" style="margin-bottom:8px">BY PERSONA</h4>
        <p class="mini muted" style="margin-bottom:6px">Add the group for a persona — created from its baseline template if it is missing.</p>
        <div class="persona-row">${personaChips}</div>
        <h4 class="mini" style="margin:16px 0 8px">TARGET GROUPS</h4>` +
        (asGroups.map((g, i) => `<label class="chk" style="margin:5px 0"><input type="checkbox" data-asg="${i}" ${g.checked ? "checked" : ""}> ${assignEsc(g.name)}${g.created ? ' <span class="tag grant">created</span>' : ""}${g.nesting === "disabled" ? ' <span class="tag ok" title="No group can be added as a member of this one">🚫 nesting disabled</span>' : ""}${g.nesting === "failed" ? ` <span class="tag block" title="${assignEsc(g.nestingError || "")}">nesting still allowed</span>` : ""}</label>`).join("") || '<p class="mini">No predefined persona groups found in this tenant yet — create them from a template below.</p>') +
        `<h4 class="mini" style="margin:16px 0 6px">ANY OTHER GROUP</h4>
        <div style="display:flex;gap:8px">
          <input id="asCustom" class="btn" style="flex:1;cursor:text" placeholder="Search any group by name or paste an object ID…">
          <button class="btn" id="asCustomAdd">Search</button>
        </div>
        <div id="asFound">${asFound.length
          ? asFound.map((g, i) => `<label class="chk" style="margin:5px 0"><input type="checkbox" data-asfound="${i}"> ${assignEsc(g.name)} <span class="mini muted">${assignEsc(g.id)}</span></label>`).join("")
          : ""}</div>
        <h4 class="mini" style="margin:16px 0 6px">CREATE MISSING GROUP (from baseline templates)</h4>
        <div style="display:flex;gap:8px">
          <select id="asTpl" class="btn" style="flex:1;cursor:pointer">${tpls.map((t, i) => `<option value="${i}">${assignEsc(t.displayName)}${t.dynamic ? " (dynamic)" : ""}</option>`).join("")}</select>
          <button class="btn primary" id="asTplCreate" ${tpls.length ? "" : "disabled"}>Create</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="asNewName" class="btn" style="flex:1;cursor:text" placeholder="…or create a custom group by name (e.g. CAD-SEC-U-DG-CUSTOM)">
          <button class="btn primary" id="asNewCreate">Create</button>
        </div>
        <p class="mini" style="margin-top:10px">Groups are created directly via Graph as <b>role-assignable</b> security groups (immutable, set at creation) —
          membership can then only be changed by Privileged Role Administrators or delegated owners. Dynamic templates keep their membership rule instead
          (Graph does not allow role-assignable + dynamic). Creation requires the Privileged Role Administrator role and consents
          <code>Group.ReadWrite.All</code> + <code>RoleManagement.ReadWrite.Directory</code> on demand. Existing groups with the same name are reused, never duplicated.</p>`;
    } else if (asStep === 2) {
      next.textContent = "Review →";
      const gsel = asGroups.filter(g => g.checked);
      const rsel = asRoles.filter((r) => r.checked);
      const isRoles = asTarget === "roles";
      const notes = (asAction === 2 || (isRoles && asAction === 0)) && asPolicies.some(p => (p.raw.conditions?.users?.includeUsers || []).includes("All"))
        ? `<p class="mini" style="color:var(--report)">⚠ Policies currently targeting "All users" will switch to the selected ${isRoles ? "roles" : "groups"}.</p>` : "";
      // Replace (0,1) and All-Users (4) rewrite existing assignment, so tenant-
      // wide they get a typed confirmation. Additive (2,3) and REMOVE (5,6) only
      // touch the named groups, so they are safe to run across everything.
      const rewrites = asAction === 0 || asAction === 1 || asAction === 4;
      const wide = asScope === "all" && rewrites;
      const wideWarn = wide ? `<div class="danger-note"><b>This rewrites the assignment of all ${asPolicies.length} policies.</b>
          "${assignEsc(Assign.actionsFor(asTarget)[asAction])}" replaces what is there now — it does not merge. Type <b>ALL</b> if that is really what you want.</div>
        <input id="asWideOk" class="txt" placeholder="ALL" autocomplete="off" spellcheck="false" style="margin-bottom:6px">` : "";
      b.innerHTML = `<h4 class="mini">STEP 3 — review</h4>
        ${wideWarn}
        <p style="margin:8px 0"><b>Action:</b> ${assignEsc(Assign.actionsFor(asTarget)[asAction])}</p>
        <p style="margin:8px 0"><b>Policies (${asPolicies.length}):</b></p>
        <ul class="plist2" style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px">${asPolicies.map(p => `<li>${assignEsc(p.name)}</li>`).join("")}</ul>
        ${asAction === 4 ? '<p><b>Target:</b> All users (include groups will be cleared)</p>'
          : isRoles
            ? `<p style="margin:8px 0"><b>Directory roles (${rsel.length}):</b></p><ul class="plist2" style="border:1px solid var(--border);border-radius:8px">${rsel.map(r => `<li>${assignEsc(r.name)}${r.recommended ? ' <span class="tag grant">privileged</span>' : ""}</li>`).join("")}</ul>
               <p class="mini muted" style="margin:6px 0 0">Built-in roles only — Conditional Access does not enforce custom or administrative-unit-scoped roles.</p>`
            : `<p style="margin:8px 0"><b>Groups (${gsel.length}):</b></p><ul class="plist2" style="border:1px solid var(--border);border-radius:8px">${gsel.map(g => `<li>${assignEsc(g.name)} <span class="mini">${assignEsc(g.id)}</span></li>`).join("")}</ul>`}
        ${notes}`;
    } else {
      // results
      next.textContent = "Close";
      back.style.display = "none";
      const nFail = asResults.filter(r => !r.ok).length;
      const nUp = asResults.filter(r => r.ok && r.changed !== false).length;
      const nSet = asResults.length - nUp - nFail;
      // "unchanged" here means the group was already where you asked it to be —
      // for an add/remove that IS the intended end state, so it reads green
      // ("already set") not neutral. Only a real failure is red.
      b.innerHTML = `<h4 class="mini">RESULT</h4>
        <p class="mini">${nUp} updated · ${nSet} already set · ${nFail} failed</p>
        <div class="row" style="justify-content:flex-start;margin:8px 0 12px">
          <button class="btn" id="asReport">📄 View change report</button>
        </div>
        <ul class="plist2" style="border:1px solid var(--border);border-radius:8px">` +
        asResults.map(r => `<li>${r.ok
          ? (r.changed === false ? '<span class="tag grant">already set</span>' : '<span class="tag grant">updated</span>')
          : '<span class="tag block">failed</span>'} ${assignEsc(r.name)}${r.error ? `<div class="mini">${assignEsc(r.error)}</div>` : ""}</li>`).join("") + "</ul>";
    }
  }
  $("asBody").addEventListener("change", (e) => {
    const sc = e.target.closest('[name="asScope"]');
    if (sc) { asScope = sc.value; asPolicies = asScopePolicies(); renderAssign(); return; }
    const t = e.target.closest('[name="asTarget"]');
    if (t) { asTarget = t.value; asAction = null; renderAssign(); return; }   // actions differ per target
    const r = e.target.closest('[name="asAct"]'); if (r) { asAction = +r.value; return; }
    if (e.target.id === "asRoleAdminOnly") { asRoleAdminOnly = e.target.checked; renderAssign(); return; }
    const rr = e.target.closest("[data-asrole]");
    if (rr) { const role = asRoles.find((x) => x.id === rr.dataset.asrole); if (role) role.checked = rr.checked; renderAssign(); return; }
    const g = e.target.closest("[data-asg]"); if (g) { asGroups[+g.dataset.asg].checked = g.checked; return; }
    // a search hit promotes into the target list, so review shows it like any other
    const f = e.target.closest("[data-asfound]");
    if (f && f.checked) { asAddCreated(asFound[+f.dataset.asfound]); }
  });
  async function asAddCreated(g) {
    if (!asGroups.some(x => x.id === g.id)) asGroups.push({ ...g, checked: true });
    else asGroups.find(x => x.id === g.id).checked = true;
    renderAssign();
  }
  $("asBody").addEventListener("input", (e) => {
    if (e.target.id === "asRoleSearch") {
      asRoleQuery = e.target.value; renderAssign();
      const el = $("asRoleSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  });
  $("asBody").addEventListener("click", async (e) => {
    const set = e.target.closest("[data-asroleset]");
    if (set) {
      const how = set.dataset.asroleset;
      if (how === "visible") {
        const q2 = asRoleQuery.trim().toLowerCase();
        const shown = new Set(asRoles
          .filter((r) => (!asRoleAdminOnly || Assign.isAdminRole(r)) && (!q2 || r.name.toLowerCase().includes(q2)))
          .map((r) => r.id));
        asRoles.forEach((r) => { if (shown.has(r.id)) r.checked = true; });   // adds, never clears
      } else {
        asRoles.forEach((r) => {
          r.checked = how === "admin" ? Assign.isAdminRole(r)
            : how === "recommended" ? !!r.recommended
            : false;
        });
      }
      renderAssign(); return;
    }
    const pc = e.target.closest("[data-asPersona]");
    if (pc) {
      const name = pc.dataset.asPersona;
      // already in the list? just tick it, no Graph call
      const existing = asGroups.find(g => g.name === name);
      if (existing) { existing.checked = true; renderAssign(); return; }
      pc.disabled = true;
      try {
        // Resolve it; create from template only if it does not exist.
        let g = isDemo ? { id: "g-" + name, name } : await Assign.findGroup(name);
        if (!g) {
          if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"])) { pc.disabled = false; return; }
          g = isDemo ? { id: "g-" + name, name, created: true } : await Assign.createGroup(Assign.templateFor(name));
          toast(g.created ? `Created <span>${esc(name)}</span>` : `<span>${esc(name)}</span> reused`);
        }
        asAddCreated(g);
      } catch (err) { console.error(err); toast(`Persona group failed: <span>${esc(err.message || err)}</span>`); pc.disabled = false; }
      return;
    }
    if (e.target.id === "asCustomAdd") {
      const q = $("asCustom").value.trim(); if (!q) return;
      e.target.disabled = true; e.target.textContent = "Searching…";
      try {
        asFound = isDemo
          ? Object.keys(DEMO_DATA.scopeGroups || {}).filter(n => n.toLowerCase().startsWith(q.toLowerCase())).map(n => ({ id: "g-" + n, name: n }))
          : await Assign.searchGroups(q);
        // already-listed groups would be a confusing duplicate row
        asFound = asFound.filter(g => !asGroups.some(x => x.id === g.id));
        if (!asFound.length) toast("No group matches — check the name, or create one below");
        renderAssign();
        const box = $("asCustom"); if (box) box.value = q;
      } catch (err) { console.error(err); toast(`Search failed: <span>${esc(err.message || err)}</span>`); }
      finally { e.target.disabled = false; e.target.textContent = "Search"; }
      return;
    }
    if (e.target.id === "asTplCreate") {
      const tpls = Assign.templates().filter(t => !asGroups.some(g => g.name === t.displayName));
      const t = tpls[+($("asTpl").value || 0)]; if (!t) return;
      if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "Group-NestingSupport.ReadWrite.All"])) return;
      e.target.disabled = true;
      try {
        const g = isDemo
          ? { id: "g-" + t.displayName, name: t.displayName, created: true }
          : await Assign.createGroup(t);
        toast(g.created
          ? `${g.dynamic ? "Dynamic" : "Role-assignable"} group <span>${esc(g.name)}</span> created${isDemo ? " (simulated)" : ""}`
          : `Group <span>${esc(g.name)}</span> already existed — reused`);
        asAddCreated(g);
      } catch (err) { console.error(err); toast(`Create failed: <span>${esc(err.message || err)}</span>`); }
      finally { e.target.disabled = false; }
      return;
    }
    if (e.target.id === "asNewCreate") {
      const name = $("asNewName").value.trim(); if (!name) return;
      if (!await preConsent([...AUTH_CONFIG.scopes, "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "Group-NestingSupport.ReadWrite.All"])) return;
      e.target.disabled = true;
      try {
        const g = isDemo
          ? { id: "g-" + name, name, created: true }
          : await Assign.createGroup({ displayName: name });
        toast(g.created ? `Role-assignable group <span>${esc(g.name)}</span> created${isDemo ? " (simulated)" : ""}` : `Group <span>${esc(g.name)}</span> already existed — reused`);
        asAddCreated(g);
      } catch (err) { console.error(err); toast(`Create failed: <span>${esc(err.message || err)}</span>`); }
      finally { e.target.disabled = false; }
    }
  });
  // A successful write followed by Cancel (or the backdrop) used to leave the
  // app showing pre-change policies. Any way out reloads if something changed.
  async function closeAssign() {
    $("assignModal").classList.remove("open");
    if (!isDemo && asResults?.some((r) => r.ok && r.changed !== false)) { asResults = null; await loadFromGraph(true); }
  }
  $("asCancel").addEventListener("click", closeAssign);
  $("assignModal").addEventListener("click", (e) => { if (e.target.id === "assignModal") closeAssign(); });
  $("asBack").addEventListener("click", () => { asStep--; renderAssign(); });
  $("asNext").addEventListener("click", async () => {
    if (asStep === 0) {
      if (asAction === null) { toast("Choose an action first"); return; }
      asStep = asAction === 4 ? 2 : 1; // "All Users" needs no group selection
      renderAssign();
    } else if (asStep === 1) {
      if (asTarget === "roles") {
        if (!asRoles.some((r) => r.checked)) { toast("Select at least one <span>directory role</span>"); return; }
      } else if (!asGroups.some(g => g.checked)) { toast("Select at least one group"); return; }
      asStep = 2; renderAssign();
    } else if (asStep === 2) {
      const wideBox = $("asWideOk");
      if (wideBox && wideBox.value.trim().toUpperCase() !== "ALL") {
        toast("Type <span>ALL</span> to confirm a tenant-wide assignment change");
        wideBox.focus(); return;
      }
      if (asTarget === "roles") {
        if (!asRoles.some((r) => r.checked)) { toast("Select at least one <span>directory role</span>"); return; }
      } else if (asAction !== 4 && !asGroups.some(g => g.checked)) { toast("Select at least one group"); return; }
      openAssignConfirm();
    } else {
      await closeAssign();
    }
  });

  // Final plain-language confirm before the write, layered over the wizard.
  const AS_VERB = {
    0: "Replace the include groups of", 1: "Replace the exclude groups of",
    2: "Add to the include groups of", 3: "Add to the exclude groups of",
    4: "Set to All Users (clear include groups)",
    5: "Remove from the include groups of", 6: "Remove from the exclude groups of",
  };
  function openAssignConfirm() {
    const gsel = asGroups.filter(g => g.checked);
    const scope = asScope === "all" ? `all **${asPolicies.length}** policies in this tenant` : `**${asPolicies.length}** selected polic${asPolicies.length === 1 ? "y" : "ies"}`;
    const rsel = asRoles.filter((r) => r.checked);
    const verb = (asTarget === "roles"
      ? (AS_VERB[asAction] || "").replace(/groups/g, "roles")
      : AS_VERB[asAction]) || Assign.actionsFor(asTarget)[asAction];
    const lines = [];
    lines.push(`**${verb}** ${scope}.`);
    lines.push("");
    if (asAction === 4) {
      lines.push("The include assignment becomes **All users** and any include groups are cleared.");
    } else if (asTarget === "roles") {
      lines.push(`Directory role${rsel.length === 1 ? "" : "s"}:`);
      rsel.forEach((r) => lines.push(`- ${r.name}${r.recommended ? " *(privileged)*" : ""}`));
      lines.push("");
      lines.push("_Conditional Access enforces built-in roles only — custom roles and administrative-unit-scoped assignments are not covered by this._");
      if ((asAction === 0 || asAction === 2) && asPolicies.some((p) => (p.raw.conditions?.users?.includeUsers || []).includes("All"))) {
        lines.push("");
        lines.push("⚠ Policies currently including **All users** will switch to covering only these roles.");
      }
    } else {
      lines.push(`Group${gsel.length === 1 ? "" : "s"}:`);
      gsel.forEach(g => lines.push(`- ${g.name}`));
    }
    if (Assign.REMOVE_ACTIONS.has(asAction)) {
      lines.push("");
      lines.push("_Policies that do not reference the group are left untouched — only the ones that actually have it are rewritten._");
    }
    lines.push("");
    lines.push(isDemo ? "_Demo mode — this is simulated, nothing is written._" : "This **writes to your tenant**.");
    $("asConfirmBody").innerHTML = mdToHtml(lines.join("\n"));
    $("asConfirm").classList.add("open");
  }
  $("asConfirmBack").addEventListener("click", () => $("asConfirm").classList.remove("open"));
  $("asConfirmGo").addEventListener("click", async () => {
    if (!await preConsent([...AUTH_CONFIG.scopes, "Policy.ReadWrite.ConditionalAccess"])) return;
    const gids = asGroups.filter(g => g.checked).map(g => g.id);
    const btn = $("asConfirmGo"); btn.disabled = true;
    try {
      if (isDemo) {
        asResults = asPolicies.map(p => ({ name: p.name, ok: true, changed: true }));
        toast("Demo — changes <span>simulated</span>");
      } else {
        const ids = asTarget === "roles" ? asRoles.filter(r => r.checked).map(r => r.id) : gids;
        asResults = await Assign.apply(asPolicies.map(p => p.id), asAction, ids, (m) => toast(m), asTarget);
      }
      // Snapshot the run so the report reflects exactly what was applied, not
      // whatever the wizard state happens to be when the button is clicked.
      asRun = { action: asAction, scope: asScope, target: asTarget,
        groups: asGroups.filter(g => g.checked).map(g => ({ ...g })),
        roles: asRoles.filter(r => r.checked).map(r => ({ ...r })),
        results: asResults, when: new Date() };
      $("asConfirm").classList.remove("open");
      asStep = 3; renderAssign();
      const failed = asResults.filter(r => !r.ok).length;
      const changed = asResults.filter(r => r.ok && r.changed !== false).length;
      toast(failed ? `Done with <span>${failed} failure(s)</span>`
        : `<span>${changed}</span> polic${changed === 1 ? "y" : "ies"} updated${changed < asResults.length ? `, ${asResults.length - changed} already set` : ""}`);
      // A tenant-wide run (the blanket-exclusion case) or any run with failures
      // surfaces its change report automatically — that is exactly when you want
      // a record of what moved and what did not.
      if (asScope === "all" || failed) showReport("👥 Group assignment report", "CA-Assign-Report", assignReportMd(asRun));
    } catch (e) {
      console.error(e); toast(`Assign failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; }
  });

  // Change report for an assign run — what was applied, which policies changed,
  // which were left alone, and every failure with its Graph error. Same shape
  // as the import and MS Learn reports so a run is auditable the same way.
  function assignReportMd(run) {
    const md = (s) => String(s ?? "").replace(/\|/g, "\\|");
    const r = run.results || [];
    const up = r.filter(x => x.ok && x.changed !== false);
    const unch = r.filter(x => x.ok && x.changed === false);
    const fail = r.filter(x => !x.ok);
    const verb = (run.target === "roles" ? (AS_VERB[run.action] || "").replace(/groups/g, "roles") : AS_VERB[run.action])
      || Assign.actionsFor(run.target)[run.action];
    const L = [];
    L.push(`# Conditional Access — group assignment report`);
    L.push("");
    L.push(`- **Tenant:** ${md(tenantName || "tenant")}`);
    L.push(`- **When:** ${run.when.toISOString().slice(0, 16).replace("T", " ")} UTC`);
    L.push(`- **Action:** ${md(verb)}`);
    L.push(`- **Scope:** ${run.scope === "all" ? `all ${r.length} policies in the tenant` : `${r.length} selected`}`);
    if (run.action !== 4) {
      L.push(run.target === "roles"
        ? `- **Directory role(s):** ${(run.roles || []).map(r => `${md(r.name)}${r.recommended ? " *(privileged)*" : ""}`).join(", ") || "—"}`
        : `- **Group(s):** ${run.groups.map(g => `${md(g.name)}${g.id ? ` (\`${md(g.id)}\`)` : ""}`).join(", ") || "—"}`);
    }
    L.push(`- **Result:** ${up.length} updated · ${unch.length} already set · ${fail.length} failed`);
    if (isDemo) L.push(`- _Demo mode — simulated, nothing was written._`);
    L.push("");
    if (fail.length) {
      L.push("## Failures");
      L.push("");
      fail.forEach(x => L.push(`- ❌ **${md(x.name)}** — ${md(x.error || "unknown error")}`));
      L.push("");
    }
    L.push("## Every policy");
    L.push("");
    L.push("| Result | Policy |");
    L.push("|---|---|");
    for (const x of r) {
      const tag = !x.ok ? "❌ failed" : x.changed === false ? "✅ already set" : "✅ updated";
      L.push(`| ${tag} | ${md(x.name)} |`);
    }
    L.push("");
    L.push("---");
    L.push(`Generated by ${BRANDING.name} — Assign groups or roles`);
    return L.join("\n");
  }
  $("asBody").addEventListener("click", (e) => {
    if (e.target.id !== "asReport" || !asRun) return;
    showReport("👥 Group assignment report", "CA-Assign-Report", assignReportMd(asRun));
  });

  // ---------- Baseline Policies ----------
  // Pure client-side comparison against the bundled catalog — no Graph calls
  // beyond the policies already loaded, so it is instant and re-runs on filter.
  let blResult = null, blFilter = "all", blQuery = "", blView = "table", blCat = "limonit";
  const blCollapsed = new Set();
  // the Limon-IT R26.6 catalog is large — the table is the readable default;
  // the community catalogs open as cards
  const blDefaultView = (cat) => (cat === "limonit" ? "table" : "cards");
  // keepView: a refresh re-compares in place and must not throw away the filter,
  // search or collapsed sections the person was looking at.
  function openBaseline(catId, keepView) {
    show("screen-baseline");
    if (catId) blCat = catId;
    if (!policies.length) {
      $("blHead").innerHTML = '<p class="mini">No policies loaded.</p>';
      $("blChips").innerHTML = ""; $("blBody").innerHTML = "";
      return;
    }
    blResult = Baseline.compare(policies, blCat);
    if (!keepView) {
      blFilter = "all"; blQuery = ""; blView = blDefaultView(blCat); blCollapsed.clear(); $("blSearch").value = "";
    }
    renderBaseline();
  }
  function renderBaseline() {
    if (!blResult) return;
    $("blHead").innerHTML = Baseline.renderSummary(blResult);
    $("blCatalog").innerHTML = Baseline.catalogs()
      .map((c) => `<button class="${c.id === blCat ? "active" : ""}" data-blcat="${esc(c.id)}">${c.icon || "🧬"} ${esc(c.label)}</button>`).join("");
    $("blChips").innerHTML = Baseline.chips(blResult, blFilter);
    $("blViewCards").classList.toggle("active", blView === "cards");
    $("blViewTable").classList.toggle("active", blView === "table");
    $("blBody").innerHTML = blView === "cards"
      ? Baseline.renderCards(blResult, blFilter, blQuery, blCollapsed)
      : Baseline.renderTable(blResult, blFilter, blQuery, blCollapsed);
    const shown = Baseline.personas(blResult, blFilter, blQuery);
    const allCollapsed = shown.length > 0 && shown.every((g) => blCollapsed.has(g));
    $("blCollapseAll").textContent = allCollapsed ? "⊞ Expand all" : "⊟ Collapse all";
    const n = blResult.toImport.length;
    $("blImport").textContent = n ? `📥 Import baseline (${n}) →` : "📥 Import baseline →";
  }
  $("blCatalog").addEventListener("click", (e) => {
    const b = e.target.closest("[data-blcat]"); if (!b || b.dataset.blcat === blCat) return;
    blCat = b.dataset.blcat;
    blResult = Baseline.compare(policies, blCat);
    blFilter = "all"; blView = blDefaultView(blCat); blCollapsed.clear(); renderBaseline();
  });
  $("blChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-blf]"); if (!b) return;
    blFilter = b.dataset.blf; renderBaseline();
  });
  $("blSearch").addEventListener("input", (e) => { blQuery = e.target.value; renderBaseline(); });
  // click a persona header to fold that section away
  $("blBody").addEventListener("click", (e) => {
    const h = e.target.closest("[data-blgroup]"); if (!h) return;
    const g = h.dataset.blgroup;
    if (blCollapsed.has(g)) blCollapsed.delete(g); else blCollapsed.add(g);
    renderBaseline();
  });
  $("blCollapseAll").addEventListener("click", () => {
    const shown = Baseline.personas(blResult, blFilter, blQuery);
    const allCollapsed = shown.length > 0 && shown.every((g) => blCollapsed.has(g));
    if (allCollapsed) blCollapsed.clear(); else shown.forEach((g) => blCollapsed.add(g));
    renderBaseline();
  });
  $("blViewCards").addEventListener("click", () => { blView = "cards"; renderBaseline(); });
  $("blViewTable").addEventListener("click", () => { blView = "table"; renderBaseline(); });
  // clicking a tenant policy name opens its card, same as everywhere else
  $("blBody").addEventListener("click", (e) => {
    const el = e.target.closest("[data-blpol]"); if (!el) return;
    showDetail(el.dataset.blpol);
  });
  $("blMd").addEventListener("click", () => {
    if (!blResult) return;
    showReport("🧬 Baseline gap report", "CA-Baseline-Gap", Baseline.toMd(blResult, tenantName));
  });
  // Refresh: re-read the tenant, then re-compare against the selected catalog.
  // Needed after an import — otherwise the gap still shows what you just fixed.
  $("blRefresh").addEventListener("click", async () => {
    const btn = $("blRefresh");
    btn.disabled = true; btn.textContent = "⟳ Refreshing…";
    try {
      if (isDemo) loadDemo(); else await loadFromGraph(true);
      openBaseline(blCat, true);
      toast("Baseline comparison <span>refreshed</span>");
    } catch (e) {
      toast(`Refresh failed: <span>${esc(e.message || e)}</span>`);
    } finally {
      btn.disabled = false; btn.textContent = "⟳ Refresh";
    }
  });
  // hand off to the Import tool with the gap in hand
  $("blImport").addEventListener("click", () => {
    const n = blResult ? blResult.toImport.length : 0;
    if (blResult && blResult.catalog.url) {
      toast(`This baseline is published at <span>${esc(blResult.catalog.url)}</span> — download it there, then import`);
    }
    $("toolImport").click();
    if (n) {
      $("imDesc").textContent = `Baseline ${BASELINE.release}: ${n} ${n === 1 ? "policy is" : "policies are"} missing or outdated in this tenant. `
        + "Select the baseline backup zip (or its extracted folder). Choose an assignment mode: deploy new policies onto this tenant's persona groups, "
        + "or match & replace — an updated policy keeps the current one's assignment and its old version is switched Off.";
    }
  });

  // ---------- CA Exclusion analyzer ----------
  let exModel = null, exUsers = [], exTab = "matrix", exKind = "all", exQuery = "", exPage = 0;
  let exFocusRow = null, exFocusCol = null;  // pinned exclusion/user row and/or policy column
  const EX_PAGE = 50;
  // Opening the tool does NOT rescan — the scan (which expands group membership
  // over Graph) runs only when the user asks, and the result is cached so
  // switching tabs and coming back keeps the screen intact.
  function openExclusions() {
    show("screen-exclusions");
    $("exRescan").style.display = exModel ? "" : "none";
    if (!policies.length) { $("exHead").innerHTML = '<p class="mini">No policies loaded.</p>'; $("exBody").innerHTML = ""; $("exChips").innerHTML = ""; return; }
    if (exModel) {   // cached — restore the previous screen, no rescan
      $("exSearch").value = exQuery;
      Object.entries(EX_TABS).forEach(([tab, id]) => $(id).classList.toggle("active", tab === exTab));
      renderExclusions();
      return;
    }
    // idle — wait for the user to start the scan
    $("exHead").innerHTML = '<h3>🚪 CA Exclusion analyzer</h3><p class="mini" style="margin:6px 0 0">Every exclusion across all policies — users, groups (expanded to their members), roles, guest types, apps and locations.</p>';
    $("exChips").innerHTML = ""; $("exPager").style.display = "none"; $("exHint").style.display = "none";
    $("exBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-exrun>▶ Run exclusion scan</button><p class="mini muted">Expands group memberships via Microsoft Graph. The result stays until you rescan.</p></div>';
  }
  async function runExclusionScan() {
    $("exRescan").style.display = "";
    $("exHead").innerHTML = '<h3>🚪 CA Exclusion analyzer</h3><p class="mini" style="margin:6px 0 0">Collecting exclusions…</p>';
    $("exChips").innerHTML = ""; $("exBody").innerHTML = ""; $("exPager").style.display = "none";
    exTab = "matrix"; exKind = "all"; exQuery = ""; exPage = 0; exFocusRow = null; exFocusCol = null; Fs.close(); $("exSearch").value = "";
    Object.entries(EX_TABS).forEach(([tab, id]) => $(id).classList.toggle("active", tab === "matrix"));
    try {
      // the whole tenant's policies — exclusions are a tenant-wide question
      exModel = Exclusions.collect(policies.map(p => p.raw));
      await Exclusions.resolve(exModel, { demo: isDemo, onStatus: (m, done, total) => { $("exHead").innerHTML = `<h3>🚪 CA Exclusion analyzer</h3><p class="mini" style="margin:6px 0 0">${esc(m)}</p>` + progInline(done, total); } });
      exUsers = Exclusions.effectiveUsers(exModel);
      renderExclusions();
    } catch (e) {
      console.error("Exclusion analyzer failed:", e);
      exModel = null;
      $("exHead").innerHTML = `<h3>🚪 CA Exclusion analyzer</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("exRescan").addEventListener("click", runExclusionScan);
  // The filter banner sticks directly under the (sticky) toolbar. The toolbar
  // wraps to more rows on narrow screens, so measure it rather than guess.
  function syncExFocusTop() {
    const tb = $("exToolbar"); if (!tb) return;
    const fs = Fs.isOpen();
    const top = fs ? 0 : stickyNavTop() + Math.round(tb.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--ex-focus-top", top + "px");
    // Size the grid to the space left under the sticky chrome, so it scrolls
    // inside its own box — that is what keeps the policy header row (and the
    // exclusion column) pinned instead of scrolling off with the page.
    const wrap = $("exBody").querySelector(".mwrap-x");
    if (!wrap) return;
    if (fs) { wrap.style.maxHeight = ""; return; }   // full screen: let it run long
    const banner = $("exBody").querySelector(".ex-focus");
    const chrome = top + (banner ? Math.round(banner.getBoundingClientRect().height) + 10 : 0);
    wrap.style.maxHeight = Math.max(280, Math.round(window.innerHeight - chrome - 28)) + "px";
  }
  window.addEventListener("resize", syncExFocusTop);
  function renderExclusions() {
    if (!exModel) return;
    $("exHead").innerHTML = Exclusions.renderSummary(Exclusions.summary(exModel, exUsers));
    const counts = {};
    exModel.entities.forEach(e => counts[e.kind] = (counts[e.kind] || 0) + 1);
    $("exChips").innerHTML = exTab !== "users"
      ? [["all", `All (${exModel.entities.length})`], ...Object.entries(counts).sort((a, b) => Exclusions.KIND[a[0]].order - Exclusions.KIND[b[0]].order)
          .map(([k, n]) => [k, `${Exclusions.KIND[k].icon} ${Exclusions.KIND[k].label} (${n})`])]
          .map(([k, l]) => `<button class="fchip ${exKind === k ? "active" : ""}" data-exk="${k}">${l}</button>`).join("")
      : "";
    $("exExpand").style.display = "";
    const full = Fs.isOpen();
    const focus = { row: exFocusRow, col: exFocusCol };
    if (exTab === "risk") {
      $("exPager").style.display = "none"; $("exHint").style.display = "none";
      $("exExpand").style.display = "none"; $("exChips").innerHTML = "";
      $("exBody").innerHTML = Exclusions.renderRisk(Exclusions.risk(exModel), exQuery);
      return;
    }
    if (exTab === "matrix") {
      $("exPager").style.display = "none";
      // merge disabled — show every exclusion row so nothing is hidden
      $("exBody").innerHTML = Exclusions.renderMatrix(exModel, exKind, exQuery, false, focus);
    } else {
      // more vertical room full screen, so page in bigger chunks
      const r = Exclusions.renderUsers(exModel, exUsers, exQuery, exPage, full ? EX_PAGE * 4 : EX_PAGE, focus);
      exPage = r.page;
      $("exBody").innerHTML = r.html;
      $("exPager").style.display = "flex";
      $("exPage").textContent = `Page ${r.page + 1} / ${r.pages}`;
    }
    applyColW();
    (window.requestAnimationFrame || setTimeout)(() => {
      const w = $("exBody").querySelector(".mwrap-x");
      $("exHint").style.display = w && w.scrollWidth > w.clientWidth + 4 ? "block" : "none";
      syncExFocusTop();
    });
  }
  $("exChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-exk]"); if (!b) return;
    // a pinned row may not exist under the new kind filter — drop it
    exKind = b.dataset.exk; exFocusRow = null; renderExclusions();
  });
  // Click-to-filter: a row pins the exclusion/user (hides its out-of-scope
  // policy columns); a policy header pins the policy (hides out-of-scope rows).
  // Clicking the same target again, or the Clear button, releases the pin.
  // "N members" on a group row → list who is actually in it
  let exMemCur = null;
  function openExMembers(key) {
    const ent = exModel && exModel.entities.find((x) => x.key === key);
    if (!ent) return;
    exMemCur = ent;
    const shown = ent.members || [], total = ent.memberTotal;
    $("exMemTitle").textContent = `👥 ${ent.name}`;
    $("exMemSub").innerHTML = `${total == null ? shown.length : total} member${(total ?? shown.length) === 1 ? "" : "s"}`
      + (total != null && total > shown.length ? ` — showing the first ${shown.length}` : "")
      + ` · excluded from ${ent.policyIds.size} polic${ent.policyIds.size === 1 ? "y" : "ies"}`;
    $("exMemBody").innerHTML = shown.length
      ? `<table class="plist"><tbody>${shown.map((m) => `<tr><td>${esc(m.name)}<div class="mini muted">${esc(m.upn || "")}</div></td></tr>`).join("")}</tbody></table>`
      : '<p class="mini">No members resolved for this group.</p>';
    $("exMemModal").classList.add("open");
  }
  $("exMemClose").addEventListener("click", () => $("exMemModal").classList.remove("open"));
  $("exMemModal").addEventListener("click", (e) => { if (e.target.id === "exMemModal") $("exMemModal").classList.remove("open"); });
  $("exMemCsv").addEventListener("click", () => {
    if (!exMemCur) return;
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [[q("Group"), q("Member"), q("UPN")].join(","),
      ...(exMemCur.members || []).map((m) => [q(exMemCur.name), q(m.name), q(m.upn)].join(","))];
    downloadText(`Members-${exMemCur.name}`.replace(/[^\w.-]+/g, "-"), "csv", "text/csv", rows.join("\n"));
    toast("Member list <span>downloaded</span>");
  });

  $("exBody").addEventListener("click", (e) => {
    const mem = e.target.closest("[data-exmembers]");
    if (mem) { e.stopPropagation(); openExMembers(mem.dataset.exmembers); return; }
    if (e.target.closest("[data-exrun]")) { runExclusionScan(); return; }
    const rp = e.target.closest(".pol-link"); if (rp) { showDetail(rp.dataset.polid); return; }
    if (e.target.closest("[data-exclearfocus]")) { exFocusRow = null; exFocusCol = null; exPage = 0; renderExclusions(); return; }
    if (e.target.closest("[data-colgrip]")) return;  // don't pin while resizing the first column
    const col = e.target.closest("[data-expol]");
    if (col) { exFocusCol = exFocusCol === col.dataset.expol ? null : col.dataset.expol; exPage = 0; renderExclusions(); return; }
    const row = e.target.closest("[data-exrow]");
    if (row) { exFocusRow = exFocusRow === row.dataset.exrow ? null : row.dataset.exrow; exPage = 0; renderExclusions(); }
  });
  // Crosshair: highlight the hovered row and its column across the whole table.
  // Delegated once on the document so it survives every re-render, and applied
  // per column rather than per cell (a 143 x 90 matrix is 12k cells).
  let hlTable = null, hlCol = -1, hlRow = null;
  function clearCrosshair() {
    if (hlRow) hlRow.classList.remove("hl-row");
    if (hlTable) hlTable.querySelectorAll(".hl-col").forEach((c) => c.classList.remove("hl-col"));
    hlTable = null; hlCol = -1; hlRow = null;
  }
  document.addEventListener("mouseover", (e) => {
    const cell = e.target.closest("td,th");
    const table = cell && cell.closest(".mtable, table.matrix, .gc-matrix");
    if (!table) { if (hlTable) clearCrosshair(); return; }
    const row = cell.parentElement, col = cell.cellIndex;
    if (table === hlTable && col === hlCol && row === hlRow) return;
    if (hlTable && hlTable !== table) clearCrosshair();
    if (hlRow !== row) {
      if (hlRow) hlRow.classList.remove("hl-row");
      if (row.parentElement.tagName === "TBODY") row.classList.add("hl-row");
      hlRow = row.parentElement.tagName === "TBODY" ? row : null;
    }
    if (col !== hlCol || table !== hlTable) {
      table.querySelectorAll(".hl-col").forEach((c) => c.classList.remove("hl-col"));
      table.querySelectorAll(`tr > *:nth-child(${col + 1})`).forEach((c) => c.classList.add("hl-col"));
    }
    hlTable = table; hlCol = col;
  });
  document.addEventListener("mouseleave", (e) => {
    if (e.target instanceof Element && e.target.classList?.contains("mwrap-x")) clearCrosshair();
  }, true);

  // Drag-to-resize the sticky first column of any matrix (exclusions, users).
  // Width lives on the .mwrap-x element as --ucol-w and survives re-renders.
  let exColW = 260;
  function applyColW() {
    document.querySelectorAll(".mwrap-x")
      .forEach((el) => el.style.setProperty("--ucol-w", exColW + "px"));
  }
  document.addEventListener("mousedown", (e) => {
    const grip = e.target.closest("[data-colgrip]"); if (!grip) return;
    e.preventDefault();
    const th = grip.closest("th");
    const left = th.getBoundingClientRect().left;
    grip.classList.add("drag");
    const move = (ev) => { exColW = Math.min(900, Math.max(90, Math.round(ev.clientX - left))); applyColW(); };
    const up = () => {
      grip.classList.remove("drag");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  // double-click the grip: shrink to fit / restore
  document.addEventListener("dblclick", (e) => {
    if (!e.target.closest("[data-colgrip]")) return;
    exColW = exColW > 160 ? 150 : 260; applyColW();
  });

  // ---------- generic matrix full screen ----------
  // The view's own toolbar and body are MOVED into the panel and put back on
  // close, so every filter/search/button keeps working with no duplicate state.
  const Fs = (() => {
    let open = false, slots = [];
    function park(el, host) {
      if (!el) return;
      const mark = document.createComment("fs");
      el.parentNode.insertBefore(mark, el);
      slots.push({ el, mark, sticky: el.style.position });
      el.style.position = "static";  // sticky toolbars must not stick inside the panel
      host.appendChild(el);
    }
    return {
      isOpen: () => open,
      open(title, { controls, body, onChange } = {}) {
        if (open) this.close();
        $("fsTitle").textContent = title;
        park(controls, $("fsControls"));
        park(body, $("fsBody"));
        $("fsModal").classList.add("show");
        document.body.style.overflow = "hidden";
        open = true; Fs._onChange = onChange;
        onChange?.(true);
      },
      close() {
        if (!open) return;
        slots.reverse().forEach(({ el, mark, sticky }) => {
          el.style.position = sticky || "";
          mark.parentNode.insertBefore(el, mark);
          mark.remove();
        });
        slots = [];
        $("fsModal").classList.remove("show");
        document.body.style.overflow = "";
        open = false;
        const cb = Fs._onChange; Fs._onChange = null; cb?.(false);
      },
    };
  })();
  $("fsClose").addEventListener("click", () => Fs.close());
  $("fsModal").addEventListener("click", (e) => { if (e.target.id === "fsModal") Fs.close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // close the top-most layer first: the dependency inspector sits above the
    // policy card, which sits above the full-screen panel
    const open = [...document.querySelectorAll(".modal-bg.open")];
    if (open.length) {
      const top = open.reduce((a, b) =>
        (+getComputedStyle(b).zIndex || 0) >= (+getComputedStyle(a).zIndex || 0) ? b : a);
      top.classList.remove("open");
      return;
    }
    if (Fs.isOpen()) Fs.close();
  });

  $("exExpand").addEventListener("click", () => {
    Fs.open(exTab === "matrix" ? "Exclusion × policy matrix" : "Effectively excluded users × policy",
      { controls: $("exToolbar"), body: $("exBody"), onChange: () => renderExclusions() });
  });
  $("plFull").addEventListener("click", () => Fs.open("Policy settings matrix", { body: $("matrixView") }));
  $("anFull").addEventListener("click", () => Fs.open("Users × policies impact matrix", { body: $("anMatrixWrap") }));
  $("gcFull").addEventListener("click", () => Fs.open("Persona × control coverage", { body: $("gcMatrix") }));
  $("exSearch").addEventListener("input", (e) => { exQuery = e.target.value; exPage = 0; renderExclusions(); });
  const EX_TABS = { matrix: "exTabMatrix", users: "exTabUsers", risk: "exTabRisk" };
  for (const [tab, id] of Object.entries(EX_TABS)) {
    $(id).addEventListener("click", () => {
      // matrix rows are keyed by entity, users rows by user id — a pin from one
      // tab is meaningless in the other, so release it on switch
      exTab = tab; exPage = 0; exFocusRow = null; exFocusCol = null;
      Object.values(EX_TABS).forEach((x) => $(x).classList.toggle("active", x === id));
      renderExclusions();
    });
  }
  $("exPrev").addEventListener("click", () => { exPage--; renderExclusions(); });
  $("exNext").addEventListener("click", () => { exPage++; renderExclusions(); });
  $("exCsv").addEventListener("click", () => {
    if (!exModel) return;
    downloadText("CA-Exclusions", "csv", "text/csv", Exclusions.toCsv(exModel, exUsers));
    toast("Exclusion CSV <span>downloaded</span>");
  });
  $("exMd").addEventListener("click", () => {
    if (!exModel) return;
    showReport("🚪 Exclusion report", "CA-Exclusions", Exclusions.toMd(exModel, exUsers, tenantName));
    toast("Exclusion Markdown <span>downloaded</span>");
  });

  // ---------- CA validator (simulation report) ----------
  // A read-only port of the simulation generator from Jasper Baes' Conditional
  // Access Validator (https://github.com/jasperbaes/Conditional-Access-Validator).
  let vaResult = null, vaFilter = "all", vaQuery = "", vaReportOnly = false, vaTargetObj = null, vaView = "compact", vaNames = null;
  const vaCollapsed = new Set();
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");

  // Resolve every id the eligible policies reference to a display name — one
  // batched pass, no group-membership expansion (users stay placeholders).
  async function buildValidatorNames(reportOnly) {
    const names = { user: {}, group: {}, role: {}, app: {}, location: {} };
    const refs = Validator.collectRefs(policies.map((p) => p.raw), reportOnly);
    if (isDemo) {
      const dn = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.names) || {};
      [...refs.users].forEach((id) => names.user[id] = dn[id] || id);
      [...refs.groups].forEach((id) => names.group[id] = dn[id] || id);
      [...refs.roles].forEach((id) => names.role[id] = dn[id] || id);
      [...refs.apps].forEach((id) => names.app[id] = dn[id] || id);
      [...refs.locations].forEach((id) => names.location[id] = dn[id] || id);
      return names;
    }
    // users + groups via getByIds (chunks of 1000)
    const dirIds = [...refs.users, ...refs.groups].filter(isGuid);
    for (let i = 0; i < dirIds.length; i += 1000) {
      try {
        const j = await Graph.gpost("/directoryObjects/getByIds", { ids: dirIds.slice(i, i + 1000), types: ["user", "group"] });
        (j.value || []).forEach((o) => {
          const t = (o["@odata.type"] || "").toLowerCase();
          if (t.includes("group")) names.group[o.id] = o.displayName || o.id;
          else names.user[o.id] = o.displayName || o.userPrincipalName || o.id;
        });
      } catch (e) { console.warn("validator: directory lookup failed", e.message); }
    }
    if (refs.roles.length) {
      try {
        const tpl = await Graph.ggetAll("/directoryRoleTemplates");
        refs.roles.forEach((id) => { const t = tpl.find((x) => x.id === id); if (t) names.role[id] = t.displayName; });
      } catch (e) { console.warn("validator: role templates failed", e.message); }
    }
    if (refs.locations.length) {
      try {
        const locs = await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
        refs.locations.forEach((id) => { const l = locs.find((x) => x.id === id); if (l) names.location[id] = l.displayName; });
      } catch (e) { console.warn("validator: named locations failed", e.message); }
    }
    const apps = refs.apps.filter(isGuid);
    for (let i = 0; i < apps.length; i += 15) {
      try {
        const flt = apps.slice(i, i + 15).map((id) => `'${id}'`).join(",");
        const sps = await Graph.ggetAll(`/servicePrincipals?$filter=appId in (${flt})&$select=appId,displayName`);
        apps.slice(i, i + 15).forEach((id) => { const sp = sps.find((s) => s.appId === id); if (sp) names.app[id] = sp.displayName; });
      } catch (e) { console.warn("validator: app lookup failed", e.message); }
    }
    return names;
  }

  function openValidator() {
    crumb("⚡ CA validator");
    show("screen-validator");
    if (!policies.length) { $("vaHead").innerHTML = '<p class="mini">No policies loaded.</p>'; $("vaBody").innerHTML = ""; $("vaChips").innerHTML = ""; return; }
    if (vaResult) {   // cached — restore the previous screen, no re-generate
      $("vaReportOnly").checked = vaReportOnly;
      $("vaTargetClear").style.display = vaTargetObj ? "" : "none";
      $("vaSearch").value = vaQuery;
      renderValidator();
      return;
    }
    runValidatorScan();
  }
  async function runValidatorScan() {
    show("screen-validator");
    if (!policies.length) return;
    $("vaHead").innerHTML = '<h3>⚡ CA validator</h3><p class="mini" style="margin:6px 0 0">Generating simulations…</p>';
    $("vaChips").innerHTML = ""; $("vaBody").innerHTML = ""; vaFilter = "all"; vaQuery = ""; $("vaSearch").value = ""; vaCollapsed.clear();
    $("vaReportOnly").checked = vaReportOnly;
    $("vaTargetClear").style.display = vaTargetObj ? "" : "none";
    try {
      const names = await buildValidatorNames(vaReportOnly);
      vaNames = names;
      vaResult = Validator.simulate(policies.map((p) => p.raw), { names, includeReportOnly: vaReportOnly, target: vaTargetObj });
      renderValidator();
    } catch (e) {
      console.error("CA validator failed:", e);
      $("vaHead").innerHTML = `<h3>⚡ CA validator</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }

  // Resolve the free-text target into a group persona or a user (with the
  // user's transitive group + role memberships, so policy scope can be judged).
  async function resolveValidatorTarget(text) {
    const t = (text || "").trim();
    if (!t) return null;
    const guid = isGuid(t);
    if (isDemo) {   // best-effort against demo data
      const dn = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.names) || {};
      const byName = Object.keys(dn).find((id) => (dn[id] || "").toLowerCase() === t.toLowerCase());
      const id = guid ? t : byName;
      if (!id) throw new Error(`"${t}" not found in the demo data`);
      return { kind: "group", id, name: dn[id] || t };
    }
    if (t.includes("@")) {   // a UPN → user
      const u = await Graph.gget(`/users/${encodeURIComponent(t)}?$select=id,displayName,userPrincipalName`);
      return await userTarget(u);
    }
    if (guid) {              // GUID → try group, then user
      try { const g = await Graph.gget(`/groups/${t}?$select=id,displayName`); return await groupTarget(g); }
      catch { const u = await Graph.gget(`/users/${t}?$select=id,displayName,userPrincipalName`); return await userTarget(u); }
    }
    // plain text → group by display name (exact)
    const esc2 = t.replace(/'/g, "''");
    const res = await Graph.ggetAll(`/groups?$filter=displayName eq '${esc2}'&$select=id,displayName`);
    if (!res.length) throw new Error(`No group named "${t}" — use an exact group name, a group ID, or a user UPN (with @)`);
    return await groupTarget(res[0]);
  }
  // A persona group can be nested inside another group that a policy excludes —
  // carry the parents so that exclusion is honoured.
  async function groupTarget(g) {
    const groupIds = new Set([g.id]);
    try {
      const parents = await Graph.ggetAll(`/groups/${g.id}/transitiveMemberOf?$select=id`);
      parents.forEach((o) => groupIds.add(o.id));
    } catch (e) { console.warn("validator: group nesting lookup failed", e.message); }
    return { kind: "group", id: g.id, name: g.displayName || g.id, groupIds };
  }
  async function userTarget(u) {
    const groupIds = new Set(), roleIds = new Set();
    try {
      const mem = await Graph.ggetAll(`/users/${u.id}/transitiveMemberOf?$select=id,roleTemplateId`);
      mem.forEach((o) => {
        const ty = (o["@odata.type"] || "").toLowerCase();
        if (ty.includes("directoryrole")) { if (o.roleTemplateId) roleIds.add(o.roleTemplateId); }
        else groupIds.add(o.id);
      });
    } catch (e) { console.warn("validator: membership lookup failed", e.message); }
    return { kind: "user", id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName, groupIds, roleIds };
  }

  const VA_CTRL_ORDER = ["block", "mfa", "authenticationStrength", "compliantDevice", "domainJoinedDevice", "passwordChange"];

  // Compact view: collapse a policy's whole cross-product into one summary card —
  // what it enforces, on which apps/clients/conditions, and who it excludes.
  function vaCompactCard(g, filter, q) {
    const sims = g.sims; if (!sims.length) return "";
    const uniq = (a) => [...new Set(a)];
    const enforced = uniq(sims.filter((s) => !s.inverted).map((s) => s.expectedControl));
    const shown = filter === "all" ? enforced : enforced.filter((c) => c === filter);
    if (!shown.length) return "";
    const inclUsers = uniq(sims.filter((s) => s.userType === "included").map((s) => s.upn));
    const apps = uniq(sims.filter((s) => s.appType === "included").map((s) => s.appName));
    const clients = uniq(sims.map((s) => s.clientApp)).map(Validator.clientLabel);
    const locs = uniq(sims.filter((s) => s.locationType !== "excluded" && s.ipRange !== "All").map((s) => s.ipRange));
    const plats = uniq(sims.filter((s) => s.platformType !== "excluded" && s.devicePlatform !== "All").map((s) => s.devicePlatform));
    const risks = uniq([...sims.map((s) => s.userRisk), ...sims.map((s) => s.signInRisk)].filter((x) => x !== "All"));
    const acts = uniq(sims.map((s) => s.userAction).filter((x) => x && x !== "All"));
    const exUsers = uniq(sims.filter((s) => s.userType === "excluded").map((s) => s.upn));
    const exApps = uniq(sims.filter((s) => s.appType === "excluded").map((s) => s.appName));
    const exLocs = uniq(sims.filter((s) => s.locationType === "excluded").map((s) => s.ipRange));
    const exPlats = uniq(sims.filter((s) => s.platformType === "excluded").map((s) => s.devicePlatform));
    if (q && !(`${g.name} ${apps.join(" ")} ${inclUsers.join(" ")}`.toLowerCase().includes(q))) return "";

    const list = (a) => a.length ? esc(a.join(", ")) : '<span class="muted">any</span>';
    const stateTag = g.state === "enabledForReportingButNotEnforced" ? ' <span class="tag">report-only</span>' : "";
    const badges = shown.map((c) => `<span class="va-enf">enforces ${esc(Validator.CONTROL_LABEL[c])}</span>`).join(" ");
    const cond = `${locs.length ? esc(locs.join(", ")) : "any location"} · ${plats.length ? esc(plats.join(", ")) : "any platform"} · ${risks.length ? esc(risks.join("/")) + " risk" : "any risk"}${acts.length ? " · " + esc(acts.join(", ")) + " action" : ""}`;
    const rows = [["Users", list(inclUsers)], ["Apps", list(apps)], ["Client apps", list(clients)], ["Conditions", cond]];
    const excl = [
      exUsers.length ? `users ${esc(exUsers.join(", "))}` : "",
      exApps.length ? `apps ${esc(exApps.join(", "))}` : "",
      exLocs.length ? `locations ${esc(exLocs.join(", "))}` : "",
      exPlats.length ? `platforms ${esc(exPlats.join(", "))}` : "",
    ].filter(Boolean).join("; ");
    return `<div class="list-card va-compact">
      <div class="va-c-head"><b class="pol-link" data-polid="${esc(g.id)}" title="Open the policy card">${esc(g.name)}</b>${stateTag} <span class="va-enfs">${badges}</span></div>
      <table class="va-c-tbl"><tbody>${rows.map(([k, v]) => `<tr><td class="va-c-k">${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>
      ${excl ? `<div class="va-c-excl"><span class="tag block">does not apply to</span> ${excl}</div>` : ""}
    </div>`;
  }

  function renderValidator() {
    if (!vaResult) return;
    const r = vaResult;
    $("vaHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>⚡ CA validator <span class="tag new">NEW</span></h3>
        <p style="margin-bottom:6px">For each enabled policy, the sign-in simulations it implies and the control each one should enforce. A simulation on the <b>excluded</b> side inverts to <b>“no &lt;control&gt;”</b>.</p>
        <p class="mini muted" style="margin:0">Ported from <a href="https://github.com/jasperbaes/Conditional-Access-Validator" target="_blank" rel="noopener">Jasper Baes' Conditional Access Validator</a> (CC BY-NC-SA 4.0). Simulation report only; users are representative placeholders.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${r.simCount}<span class="mini" style="font-weight:400"> simulations</span></div>
        <div class="mini">${r.simulatedPolicies} of ${r.policyCount} policies ${r.target ? "apply" : "simulated"}</div>
        ${r.target ? `<div class="mini">${r.outOfScope} not in scope for this target</div>` : ""}
        ${r.skipped.length ? `<div class="mini">${r.skipped.length} with no controls</div>` : ""}
      </div></div>
      ${r.target ? `<div class="va-targetbar">🎯 Running against ${r.target.kind === "user" ? "user" : "persona group"} <b>${esc(r.target.name)}</b>${r.target.upn ? ` <span class="mini muted">${esc(r.target.upn)}</span>` : ""} — showing only the policies that apply. <button class="fchip" data-vacleartarget="1">✕ Clear</button></div>` : ""}`;

    // control filter chips
    const counts = {};
    r.sims.forEach((s) => counts[s.expectedControl] = (counts[s.expectedControl] || 0) + 1);
    const chips = [["all", `All (${r.simCount})`], ...VA_CTRL_ORDER.filter((c) => counts[c]).map((c) => [c, `${Validator.CONTROL_LABEL[c]} (${counts[c]})`])];
    $("vaChips").innerHTML = chips.map(([k, l]) => `<button class="fchip ${vaFilter === k ? "active" : ""}" data-vaf="${esc(k)}">${esc(l)}</button>`).join("");

    // view toggle state
    $("vaExpand").style.display = vaView === "detailed" ? "" : "none";
    [...$("vaViewSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.vaview === vaView));

    const q = vaQuery.toLowerCase();
    const skippedNote = r.skipped.length ? `<p class="mini muted" style="margin-top:10px">Not simulated (no grant or session control configured): ${r.skipped.map((s) => esc(s.name)).join(", ")}</p>` : "";

    // With a target, show the policies that do NOT reach it and why — the
    // overview is only complete if the misses are visible too.
    const nameOf = (id) => (vaNames && (vaNames.group[id] || vaNames.user[id] || vaNames.role[id])) || id;
    const oosHtml = (r.target && r.notInScope && r.notInScope.length) ? `<div class="list-card va-oos">
      <div class="va-oos-h"><b>Does not reach ${esc(r.target.name)}</b> <span class="mini muted">${r.notInScope.length} polic${r.notInScope.length === 1 ? "y" : "ies"}</span></div>
      <ul class="va-oos-l">${r.notInScope.map((x) => `<li>
        <span class="va-oos-n">${esc(x.name)}</span>${x.state === "enabledForReportingButNotEnforced" ? ' <span class="tag">report-only</span>' : ""}
        <span class="va-oos-r">${x.reason === "excluded"
          ? `excluded${x.via ? " via " + esc(nameOf(x.via)) : ""}${x.byAll ? " (targets all users)" : ""}`
          : "does not target this principal"}</span></li>`).join("")}</ul></div>` : "";
    const emptyMsg = () => { $("vaBody").innerHTML = (r.target && r.simulatedPolicies === 0)
      ? `<p class="mini" style="padding:20px">No enabled policy applies to <b>${esc(r.target.name)}</b>${vaReportOnly ? "" : " — tick “Include report-only” to widen the check"}.</p>`
      : '<p class="mini" style="padding:20px">No simulations match the current filter.</p>'; };

    // ---- Compact: one summary card per policy, grouped by persona ----
    if (vaView === "compact") {
      const blocks = (r.personas || []).map((pb) => {
        const cards = pb.groups.map((g) => vaCompactCard(g, vaFilter, q)).filter(Boolean);
        if (!cards.length) return "";
        return `<div class="va-persona"><h4>${esc(pb.label)} <span class="mini muted">${cards.length} polic${cards.length === 1 ? "y" : "ies"}</span></h4></div>${cards.join("")}`;
      }).filter(Boolean);
      if (!blocks.length && !oosHtml) { emptyMsg(); return; }
      $("vaBody").innerHTML = (blocks.length ? blocks.join("") : '<p class="mini" style="padding:14px">No policy enforces a control for this target.</p>') + oosHtml + skippedNote;
      return;
    }

    // ---- Detailed: one row per simulation (the full cross-product) ----
    const match = (s) => (vaFilter === "all" || s.expectedControl === vaFilter);
    const groups = r.groups.map((g) => {
      const sims = g.sims.filter((s) => match(s) && (!q || s.title.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)));
      return { ...g, shown: sims };
    }).filter((g) => g.shown.length);

    if (!groups.length && !oosHtml) { emptyMsg(); return; }
    const stateTag = (st) => st === "enabledForReportingButNotEnforced" ? '<span class="tag">report-only</span>' : "";
    const cell = (v) => v && v !== "All" ? esc(v) : '<span class="muted">·</span>';
    // insert a persona heading whenever the bucket changes
    let lastPersona = null;
    $("vaBody").innerHTML = groups.map((g) => {
      const pl = (g.persona && g.persona.label) || "Other";
      const head = pl !== lastPersona ? (lastPersona = pl, `<div class="va-persona"><h4>${esc(pl)}</h4></div>`) : "";
      return head + vaDetailCard(g, stateTag, cell);
    }).join("") + oosHtml + skippedNote;
  }

  // one policy's simulation table (detailed view)
  function vaDetailCard(g, stateTag, cell) {
    {
      const open = !vaCollapsed.has(g.id);
      const rows = g.shown.map((s) => `<tr>
        <td>${s.inverted ? '<span class="va-no">no ' + esc(s.controlLabel) + '</span>' : '<span class="va-yes">' + esc(s.controlLabel) + '</span>'}</td>
        <td>${esc(s.upn)}${s.userType === "excluded" ? ' <span class="tag block">excl</span>' : ""}</td>
        <td>${esc(s.appName)}${s.appType === "excluded" ? ' <span class="tag block">excl</span>' : ""}</td>
        <td>${cell(Validator.clientLabel(s.clientApp))}</td>
        <td>${cell(s.ipRange)}${s.locationType === "excluded" ? ' <span class="tag block">excl</span>' : ""}</td>
        <td>${cell(s.devicePlatform)}${s.platformType === "excluded" ? ' <span class="tag block">excl</span>' : ""}</td>
        <td>${cell(s.userRisk)}</td><td>${cell(s.signInRisk)}</td><td>${cell(s.userAction)}</td>
      </tr>`).join("");
      return `<div class="list-card va-card">
        <div class="va-h" data-vagroup="${esc(g.id)}">
          <span class="va-caret">${open ? "▾" : "▸"}</span>
          <b class="pol-link" data-polid="${esc(g.id)}" title="Open the policy card">${esc(g.name)}</b> ${stateTag(g.state)}
          <span class="mini muted">${g.shown.length} simulation${g.shown.length === 1 ? "" : "s"}${g.capped ? " · capped" : ""}</span>
        </div>
        <div class="va-tablewrap" style="${open ? "" : "display:none"}">
          <table class="va-table">
            <thead><tr><th>Expected</th><th>User</th><th>Application</th><th>Client</th><th>Location</th><th>Platform</th><th>User risk</th><th>Sign-in risk</th><th>User action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    }
  }

  function vaMarkdown() {
    const r = vaResult; if (!r) return "";
    const L = [`# Conditional Access validation — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      `Simulation generator ported from [Jasper Baes' Conditional Access Validator](https://github.com/jasperbaes/Conditional-Access-Validator) (CC BY-NC-SA 4.0).`, "",
      ...(r.target ? [`**Target:** ${r.target.kind === "user" ? "user" : "persona group"} ${r.target.name}${r.target.upn ? ` (${r.target.upn})` : ""} — only the policies that apply are shown (${r.outOfScope} not in scope).`, ""] : []),
      `- Policies ${r.target ? "applying" : "simulated"}: **${r.simulatedPolicies}** of ${r.policyCount}`, `- Simulations: **${r.simCount}**`,
      ...(r.skipped.length ? [`- Skipped (session-only / no controls): ${r.skipped.map((s) => s.name).join(", ")}`] : []), ""];
    for (const g of r.groups) {
      L.push(`## ${g.name}${g.state === "enabledForReportingButNotEnforced" ? " *(report-only)*" : ""}`, "");
      L.push("| Expected | User | Application | Client | Location | Platform | User risk | Sign-in risk | User action |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const s of g.sims) {
        const c = (v) => (v && v !== "All" ? String(v).replace(/\|/g, "\\|") : "·");
        L.push(`| ${s.inverted ? "no " : ""}${s.controlLabel} | ${c(s.upn)} | ${c(s.appName)} | ${c(Validator.clientLabel(s.clientApp))} | ${c(s.ipRange)} | ${c(s.devicePlatform)} | ${c(s.userRisk)} | ${c(s.signInRisk)} | ${c(s.userAction)} |`);
      }
      L.push("");
    }
    return L.join("\n");
  }

  $("vaChips").addEventListener("click", (e) => { const b = e.target.closest("[data-vaf]"); if (!b) return; vaFilter = b.dataset.vaf; renderValidator(); });
  $("vaViewSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-vaview]"); if (!b) return; vaView = b.dataset.vaview; renderValidator(); });
  $("vaBody").addEventListener("click", (e) => {
    // The policy name opens its card. It sits inside the collapse header in the
    // detailed view, so it has to be checked first or the click just toggles.
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { showDetail(pl.dataset.polid); return; }
    const h = e.target.closest("[data-vagroup]"); if (!h) return;
    const id = h.dataset.vagroup;
    if (vaCollapsed.has(id)) vaCollapsed.delete(id); else vaCollapsed.add(id);
    renderValidator();
  });
  $("vaSearch").addEventListener("input", (e) => { vaQuery = e.target.value; renderValidator(); });
  $("vaExpand").addEventListener("click", () => {
    if (!vaResult) return;
    const allOpen = vaResult.groups.every((g) => !vaCollapsed.has(g.id));
    vaCollapsed.clear();
    if (allOpen) vaResult.groups.forEach((g) => vaCollapsed.add(g.id));
    $("vaExpand").textContent = allOpen ? "⊞ Expand all" : "⊟ Collapse all";
    renderValidator();
  });
  $("vaReportOnly").addEventListener("change", (e) => { vaReportOnly = e.target.checked; runValidatorScan(); });
  $("vaRefresh").addEventListener("click", async () => { if (!isDemo) await loadFromGraph(true); runValidatorScan(); });
  $("vaMd").addEventListener("click", () => { if (!vaResult) return; showReport("⚡ CA validation report", "CA-Validation", vaMarkdown()); });
  // Target: run the simulation against one persona group or user
  async function vaRunTarget() {
    const text = $("vaTarget").value.trim();
    if (!text) { vaTargetObj = null; openValidator(); return; }
    $("vaTargetGo").disabled = true; $("vaTargetGo").textContent = "…";
    try {
      vaTargetObj = await resolveValidatorTarget(text);
      $("vaTarget").value = vaTargetObj.upn || vaTargetObj.name;
      runValidatorScan();
    } catch (e) { toast(`Target: <span>${esc(e.message || e)}</span>`); }
    finally { $("vaTargetGo").disabled = false; $("vaTargetGo").textContent = "Run"; }
  }
  $("vaTargetGo").addEventListener("click", vaRunTarget);
  $("vaTarget").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); vaRunTarget(); } });
  // Type-ahead: suggest matching groups and users as you type, so you don't
  // have to know the exact name. Debounced, read-only, top 10 of each.
  let vaSugTimer = null, vaSugLast = "";
  const vaSugCache = new Map();
  async function vaSuggest(text) {
    const t = text.trim();
    if (t.length < 2 || t === vaSugLast) return;
    vaSugLast = t;
    if (vaSugCache.has(t)) { $("vaTargetList").innerHTML = vaSugCache.get(t); return; }
    let opts = [];
    try {
      if (isDemo) {
        const dn = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.names) || {};
        opts = Object.values(dn).filter((n) => String(n).toLowerCase().includes(t.toLowerCase()))
          .slice(0, 12).map((n) => ({ v: n, l: "demo object" }));
      } else {
        const f = t.replace(/'/g, "''");
        const [groups, users] = await Promise.all([
          Graph.gget(`/groups?$filter=startswith(displayName,'${f}')&$select=displayName&$top=10`).catch(() => null),
          Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`).catch(() => null),
        ]);
        opts = [
          ...((groups && groups.value) || []).map((g) => ({ v: g.displayName, l: "group" })),
          ...((users && users.value) || []).map((u) => ({ v: u.userPrincipalName, l: `user · ${u.displayName || ""}`.trim() })),
        ];
      }
    } catch (e) { console.warn("validator: suggest failed", e.message); return; }
    const html = opts.map((o) => `<option value="${esc(o.v)}" label="${esc(o.l)}"></option>`).join("");
    vaSugCache.set(t, html);
    $("vaTargetList").innerHTML = html;
  }
  $("vaTarget").addEventListener("input", (e) => {
    const v = e.target.value;
    clearTimeout(vaSugTimer);
    vaSugTimer = setTimeout(() => vaSuggest(v), 250);
  });
  function vaClearTarget() { vaTargetObj = null; $("vaTarget").value = ""; runValidatorScan(); }
  $("vaTargetClear").addEventListener("click", vaClearTarget);
  $("vaHead").addEventListener("click", (e) => { if (e.target.closest("[data-vacleartarget]")) vaClearTarget(); });

  // ---------- Restricted AUs (BETA — list / edit / members / scoped roles) ----------
  // The vaults ⑥ Protect creates, manageable afterwards: members and scoped
  // role grants per AU, edit and create and delete — with the two truths the
  // portal buries stated up front: the restricted flag is immutable, and an
  // RMAU's members answer only to roles scoped to that AU (a tenant-wide
  // admin's 403 here is by design, not a bug).
  const RU_WRITE = ["AdministrativeUnit.ReadWrite.All"];
  const RU_ROLE_WRITE = ["RoleManagement.ReadWrite.Directory"];
  let ruList = null, ruDetails = {}, ruFilter = "restricted", ruQuery = "", ruEditing = null, ruDeleting = null;
  const ruOpen = new Set();
  let ruRoleNames = null;   // activated directory-role id → displayName

  async function openRmauTool(force) {
    crumb("🛡 Restricted AUs");
    show("screen-rmau");
    if (ruList && !force) { renderRmau(); return; }
    $("ruHead").innerHTML = '<h3>🛡 Restricted AUs</h3><p class="mini" style="margin:6px 0 0">Reading administrative units…</p>';
    $("ruBody").innerHTML = ""; $("ruChips").innerHTML = "";
    try {
      ruList = isDemo
        ? ((typeof DEMO_DATA !== "undefined" && DEMO_DATA.adminUnits) || [])
        : await Graph.ggetAll("/administrativeUnits?$select=id,displayName,description,visibility,isMemberManagementRestricted");
      ruDetails = {}; ruOpen.clear();
      renderRmau();
    } catch (e) {
      console.error("Restricted AUs failed:", e);
      $("ruHead").innerHTML = `<h3>🛡 Restricted AUs</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("toolRmau").addEventListener("click", () => openRmauTool());
  $("ruRefresh").addEventListener("click", () => openRmauTool(true));

  async function ruLoadDetail(id) {
    if (ruDetails[id] && !ruDetails[id].error) return ruDetails[id];
    const d = { members: null, scoped: null, error: null };
    try {
      if (isDemo) {
        const demo = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.adminUnitDetails) || {};
        Object.assign(d, demo[id] || { members: [], scoped: [] });
      } else {
        // isAssignableToRole is the point of this $select: a role-assignable
        // group inside a RESTRICTED unit can be edited by nobody. Its members
        // may only be changed by Global Administrator or Privileged Role
        // Administrator, and a restricted unit blocks exactly those two, and
        // neither can be assigned at unit scope. Without the flag the member
        // renders as an ordinary group and the deadlock stays invisible.
        d.members = await Graph.ggetAll(`/administrativeUnits/${id}/members?$select=id,displayName,userPrincipalName,isAssignableToRole`);
        try {
          d.scoped = await Graph.ggetAll(`/administrativeUnits/${id}/scopedRoleMembers`);
          if (!ruRoleNames) {
            ruRoleNames = {};
            (await Graph.ggetAll("/directoryRoles?$select=id,displayName")).forEach((r) => ruRoleNames[r.id] = r.displayName);
          }
          // The map is cached for the session, and /directoryRoles only lists
          // ACTIVATED roles — so a role activated after the cache was built (by
          // this very tool, granting a scoped administrator on a unit created
          // minutes ago) is absent from it, and the card fell back to printing
          // the raw GUID. One targeted read per unknown id fixes it; the id is
          // still shown if even that fails, because a wrong name would be worse
          // than an ugly one.
          const unknown = [...new Set(d.scoped.map((r) => r.roleId).filter((id) => id && !ruRoleNames[id]))];
          for (const id of unknown) {
            try {
              const role = await Graph.gget(`/directoryRoles/${id}?$select=id,displayName`);
              if (role && role.displayName) ruRoleNames[id] = role.displayName;
            } catch { /* leave the id visible rather than inventing a name */ }
          }
          d.scoped.forEach((r) => { r._roleName = ruRoleNames[r.roleId] || r.roleId; r._principal = r.roleMemberInfo?.displayName || r.roleMemberInfo?.id; });
        } catch (e) { d.scoped = []; d.scopedError = e.message || String(e); }
      }
      const raws = policies.map((p) => p.raw);
      (d.members || []).forEach((m) => { if (Rmau.memberType(m) === "group") m._caRefs = Rmau.caRefs(m.id, raws); });
    } catch (e) { d.error = e.message || String(e); }
    ruDetails[id] = d;
    return d;
  }

  // ---------- baseline: one restricted AU per persona ----------
  // A vault per persona rather than one for everything, so a scoped
  // administrator for the DevOps exclusions cannot also edit the Admins ones.
  let ruBase = null;      // { check, sel:Set, busy, results, me }
  const RU_BASE_SCOPES = ["AdministrativeUnit.ReadWrite.All", "RoleManagement.ReadWrite.Directory"];

  function ruBaseline() {
    if (!ruBase) ruBase = { sel: null, busy: false, results: null, log: null, made: new Map() };
    // The check is DERIVED on every render, never cached. It used to be computed
    // once and kept, which meant ⟳ Refresh updated the cards below while the
    // panel above still offered to create units that were by then sitting right
    // there on screen.
    const check = Rmau.baselineCheck(ruList || []);
    // Units created in this session are held present regardless of what the
    // read says. Directory writes are not read-your-writes consistent, and a
    // panel that offers to create what it has just created is worse than one
    // running a few seconds behind the tenant.
    if (ruBase.made.size) {
      check.rows = check.rows.map((r) => ruBase.made.has(r.name) && r.status !== "present"
        ? { ...r, status: "present", id: ruBase.made.get(r.name) } : r);
      check.missing = check.rows.filter((r) => r.status === "missing");
      check.present = check.rows.filter((r) => r.status === "present");
      check.unrestricted = check.rows.filter((r) => r.status === "unrestricted");
    }
    ruBase.check = check;
    // Keep the ticks the user made, minus anything no longer missing.
    ruBase.sel = ruBase.sel
      ? new Set([...ruBase.sel].filter((n) => check.missing.some((r) => r.name === n)))
      : new Set(check.missing.map((r) => r.name));
    return ruBase;
  }

  async function ruBaseCreate(btn) {
    const t = ruBaseline();
    if (t.busy) return;
    const picked = t.check.missing.filter((r) => t.sel.has(r.name));
    if (!picked.length) { toast("Nothing selected"); return; }
    const scopes = [...AUTH_CONFIG.scopes, ...RU_BASE_SCOPES];
    if (!isDemo && !await preConsent(scopes)) return;

    t.busy = true; btn.disabled = true;
    const lines = [], results = [];
    t.log = lines;
    const say = (h) => { lines.push(h); const el = $("ruBaseLog"); if (el) el.innerHTML = lines.join(""); };

    // Who to scope. The account running this is the sane default: an AU with no
    // scoped administrator is a vault nobody can open, because tenant-wide roles
    // are blocked by design.
    let me = null;
    if (!isDemo) {
      try { me = await Graph.gget("/me?$select=id,displayName,userPrincipalName"); }
      catch (e) { say(`<div style="color:var(--off)">Could not read your own account (${esc(e.message || e)}) — the units will be created without a scoped administrator, and nobody will be able to manage their members until one is granted.</div>`); }
    } else { me = { id: "demo-me", displayName: "You", userPrincipalName: "you@demo" }; }
    t.me = me;

    // The role is resolved once, not per AU.
    let role = null, roleErr = null;
    if (me && !isDemo) {
      try { role = await ensureDirectoryRole(GROUPS_ADMIN_TEMPLATE); }
      catch (e) { roleErr = e.message || String(e); }
    }

    for (const r of picked) {
      const res = { name: r.name, code: r.code, ok: false, admin: me ? me.userPrincipalName : "" };
      try {
        let au = { id: "demo-au-" + r.code, displayName: r.name };
        if (!isDemo) {
          au = await Graph.gpost("/administrativeUnits", {
            displayName: r.name,
            description: r.description,
            isMemberManagementRestricted: true,
          }, scopes);
        }
        res.ok = true; res.id = au.id;
        t.made.set(r.name, au.id);
        say(`<div>✓ created <b>${esc(r.name)}</b></div>`);

        // Scoped administrator, AFTER the unit exists. Reported separately:
        // a created-but-unscoped AU is a real half-outcome, not a failure.
        if (me) {
          try {
            if (roleErr) throw new Error(roleErr);
            if (!isDemo) {
              await Graph.gpost(`/administrativeUnits/${au.id}/scopedRoleMembers`,
                { roleId: role.id, roleMemberInfo: { id: me.id } }, scopes);
            }
            res.adminOk = true;
            say(`<div>&nbsp;&nbsp;✓ ${esc(me.userPrincipalName)} is Groups Administrator scoped to it</div>`);
          } catch (e) {
            res.adminError = e.message || String(e);
            say(`<div style="color:var(--off)">&nbsp;&nbsp;✗ scoped administrator NOT granted — ${esc(res.adminError)}. The unit exists but nobody can manage its members yet.</div>`);
          }
        }
      } catch (e) {
        res.error = e.message || String(e);
        say(`<div style="color:var(--off)">✗ ${esc(r.name)} — ${esc(res.error)}</div>`);
      }
      results.push(res);
    }
    t.results = results; t.busy = false; btn.disabled = false;
    // Re-read the units. ruBase is deliberately kept: it holds what was just
    // created, which the read may not show yet.
    ruList = null;
    t.results = results; t.log = lines;
    await openRmauTool(true);
    toast(`${results.filter((r) => r.ok).length}/${results.length} administrative unit${results.length === 1 ? "" : "s"} created${isDemo ? " (simulated)" : ""}`);
  }

  function ruBaselinePanel() {
    const t = ruBaseline();
    const c = t.check;
    const chip = (r) => r.status === "present" ? '<span class="tag grant">present</span>'
      : r.status === "unrestricted" ? '<span class="tag block">name taken — not restricted</span>'
      : '<span class="tag">missing</span>';
    const rows = c.rows.map((r) => `<div class="dr-row">
        <div class="dr-head">
          ${r.status === "missing"
            ? `<label class="chk" style="margin:0"><input type="checkbox" data-rubase="${esc(r.name)}"${t.sel.has(r.name) ? " checked" : ""}> <b>${esc(r.name)}</b></label>`
            : `<b>${esc(r.name)}</b>`}
          ${chip(r)}
          <span class="mini muted">${esc(r.label)}${r.caRange ? ` · ${esc(r.caRange)}` : ""}</span>
        </div>
        ${r.status === "unrestricted" ? `<div class="mini" style="color:var(--off)">An administrative unit already has this name but is <b>not</b> restricted. The flag is set at creation and cannot be changed, so this one cannot be upgraded — rename it and create a restricted replacement, or pick another name for the persona.</div>` : ""}
      </div>`).join("");

    const results = t.results ? `<div class="dr-row"><div class="mini">
        <b>${t.results.filter((r) => r.ok).length}/${t.results.length} created.</b>
        ${t.results.some((r) => r.ok && !r.adminOk) ? `<span style="color:var(--off)"> ${t.results.filter((r) => r.ok && !r.adminOk).length} without a scoped administrator — nobody can manage their members until one is granted.</span>` : ""}
      </div></div>` : "";

    return `<div class="cg-panel" id="ruBasePanel">
      <h4>BASELINE — ONE RESTRICTED AU PER PERSONA</h4>
      <p class="mini" style="margin:0 0 8px">The baseline expects a restricted management administrative unit per persona, so a scoped administrator for one persona's exclusion groups cannot edit another's. Names mirror the deployment groups (<code>CAD-SEC-U-DG-&lt;CODE&gt;</code>).</p>
      <p class="mini" style="margin:0 0 8px"><b>${c.present.length} present</b> · ${c.missing.length} missing${c.unrestricted.length ? ` · <span style="color:var(--off)">${c.unrestricted.length} name clash</span>` : ""}</p>
      <div class="cg-pick">${rows}</div>
      ${c.missing.length ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <button class="btn sm" id="ruBaseAll">${t.sel.size === c.missing.length ? "☐ Deselect all" : "☑ Select all"}</button>
          <span class="mini muted">${t.sel.size} of ${c.missing.length} selected</span>
        </div>
        <p class="mini muted" style="margin:8px 0 0">Each one is created restricted, and <b>you</b> are granted Groups Administrator scoped to it — without a scoped administrator an AU is a vault nobody can open, because tenant-wide roles are blocked by design.</p>
        <div class="row" style="justify-content:flex-start;margin-top:10px">
          <button class="btn primary" id="ruBaseGo">Create ${t.sel.size} administrative unit${t.sel.size === 1 ? "" : "s"}${isDemo ? " (simulated)" : ""}</button>
          <button class="btn" id="ruBaseMd">📄 Report</button>
        </div>` : `<div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn" id="ruBaseMd">📄 Report</button></div>`}
      ${results}
      <div id="ruBaseLog" class="mini" style="margin-top:8px">${(t.log || []).join("")}</div>
    </div>`;
  }

  function renderRmau() {
    ruSeedGroupSug();       // baseline group names are available before any typing
    const su = Rmau.summarize(ruList);
    $("ruHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>🛡 Restricted AUs <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">Restricted management administrative units — the vaults that shield objects (here: CA exclusion groups) from tenant-wide administration. Members of a restricted AU answer <b>only</b> to roles scoped to that AU.</p>
        <p class="mini muted" style="margin:0">The <code>isMemberManagementRestricted</code> flag is <b>immutable</b> — set at creation, never changeable. Creating one needs <b>Privileged Role Administrator</b>; touching members of one needs a role <b>scoped to it</b> — a 403 there is the shield working, not a fault. Every write asks for its permission on the click.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${su.restricted}<span class="mini" style="font-weight:400"> restricted</span></div>
        <div class="mini">${su.standard} standard AU${su.standard === 1 ? "" : "s"} in the tenant</div>
      </div></div>`;
    $("ruChips").innerHTML = [["restricted", `🔒 Restricted (${su.restricted})`], ["all", `All AUs (${su.total})`]]
      .map(([k, l]) => `<button class="fchip ${ruFilter === k ? "active" : ""}" data-ruf="${k}">${esc(l)}</button>`).join("");
    const q = ruQuery.toLowerCase();
    const rows = (ruList || []).filter((a) => (ruFilter === "all" || Rmau.isRestricted(a))
      && (!q || `${a.displayName} ${a.description || ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (Rmau.isRestricted(b) ? 1 : 0) - (Rmau.isRestricted(a) ? 1 : 0) || (a.displayName || "").localeCompare(b.displayName || ""));
    if (!rows.length) { $("ruBody").innerHTML = ruBaselinePanel() + ruBulkAdminPanel() + '<p class="mini" style="padding:20px">No administrative unit matches the current filter.</p>'; return; }
    $("ruBody").innerHTML = ruBaselinePanel() + ruBulkAdminPanel() + `<div class="lo-grid">` + rows.map((au) => {
      const open = ruOpen.has(au.id);
      const d = ruDetails[au.id];
      let detail = "";
      if (open) {
        if (!d) { detail = '<div class="mini muted" style="margin-top:8px"><div class="spinner" style="width:18px;height:18px"></div> Reading members and scoped roles…</div>'; }
        else if (d.error) { detail = `<div class="mini" style="color:var(--off);margin-top:8px">✗ ${esc(d.error)}</div>`; }
        else {
          const frozen = (m) => Rmau.isRestricted(au) && m.isAssignableToRole === true;
          const mems = (d.members || []).map((m) => `<li><div class="wi-pn">${esc(m.displayName || m.userPrincipalName || m.id)} <span class="tag">${Rmau.memberType(m)}</span>
              ${frozen(m) ? '<span class="tag block" title="Role-assignable AND in a restricted unit — nobody can change its members">🧊 frozen</span>' : ""}
              ${(m._caRefs || []).length ? `<span class="tag grant" title="${esc(m._caRefs.map((r) => `${r.how} by ${r.name}`).join("\n"))}">${m._caRefs.length} CA ref${m._caRefs.length === 1 ? "" : "s"}</span>` : ""}
              <button class="fchip" data-rumrm="${esc(m.id)}" data-ruau="${esc(au.id)}" title="Remove from this AU">✕</button></div></li>`
            + (frozen(m) ? `<div class="wi-why" style="color:var(--off);margin:0 0 6px">This group is <b>role-assignable</b> and sits in a <b>restricted</b> unit, so <b>nobody</b> can change its members — its membership is reserved to Global Administrator and Privileged Role Administrator, and this unit blocks both. Neither flag can be undone: both are immutable. The way out is to <b>remove it from this unit</b> (✕ above), which restores those two roles, and then convert it with <b>⑦ Migrate</b> in Conditional Access groups.</div>` : "")).join("");
          const nFrozen = (d.members || []).filter(frozen).length;
          const scoped = (d.scoped || []).map((r) => `<li><div class="wi-pn">${esc(r._principal || "(principal)")} <span class="tag">${esc(r._roleName || r.roleId)}</span>
              <button class="fchip" data-rusrm="${esc(r.id)}" data-ruau="${esc(au.id)}" title="Remove this scoped role grant">✕</button></div></li>`).join("");
          // The picker goes ABOVE its list. A protected AU can hold dozens of
          // groups, and with the list first the input you came here to use was
          // pushed off the bottom of the card — you scrolled past everything to
          // reach the one control that does something.
          detail = `<div style="margin-top:8px">
            <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em">Members (${(d.members || []).length})${nFrozen ? ` <span class="tag block" style="text-transform:none;letter-spacing:normal">🧊 ${nFrozen} frozen</span>` : ""}</div>
            ${ruPgRow(au, d)}
            <div style="display:flex;gap:6px;margin:6px 0 6px"><input data-ruaddbox="${esc(au.id)}" list="ruGroupSug" placeholder="…or any other group, by name — or a user UPN" spellcheck="false" autocomplete="off" style="flex:1"><button class="btn sm" data-ruadd="${esc(au.id)}">+ Add</button></div>
            <ul class="wi-list" style="margin:0 0 12px">${mems || '<li><div class="wi-why">No members.</div></li>'}</ul>
            ${ruBulkPanel(au)}
            <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em">Scoped role members (${(d.scoped || []).length})${d.scopedError ? ` <span class="muted" style="font-weight:400;text-transform:none">— ${esc(d.scopedError)}</span>` : ""}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 6px"><select data-rurole="${esc(au.id)}" class="btn" style="cursor:pointer">${Rmau.ROLE_TEMPLATES.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select>
              <input data-ruadminbox="${esc(au.id)}" list="ruUserSug" placeholder="Start typing a name — several at once, separated by ;" spellcheck="false" autocomplete="off" style="flex:1;min-width:180px"><button class="btn sm" data-ruadmin="${esc(au.id)}">+ Grant</button></div>
            <ul class="wi-list" style="margin:0">${scoped || '<li><div class="wi-why">No scoped role grants — nobody can manage the members except by tenant-unscoped rules. Grant one above.</div></li>'}</ul>
          </div>`;
        }
      }
      return `<div class="list-card lo-card">
        <div class="lo-h" data-ruopen="${esc(au.id)}" style="cursor:pointer">
          <span class="lo-ic">${Rmau.isRestricted(au) ? "🔒" : "📁"}</span>
          <b>${esc(au.displayName || "(unnamed)")}</b>
          ${Rmau.isRestricted(au) ? '<span class="tag grant">restricted</span>' : '<span class="tag">standard</span>'}
          ${au.visibility === "HiddenMembership" ? '<span class="tag">hidden membership</span>' : ""}
        </div>
        ${au.description ? `<div class="mini lo-d">${esc(au.description)}</div>` : ""}
        ${detail}
        <div class="lo-act">
          <button class="btn sm" data-ruedit="${esc(au.id)}">✎ Edit</button>
          ${/* Granting a scoped administrator lives inside the expanded card, which
                is not discoverable from a row whose only buttons are Edit and Delete
                — people reasonably look for it under Edit. This button names the
                thing and opens the place it lives. */ ""}
          <button class="btn sm" data-ruscope="${esc(au.id)}">👤 Scoped admins${ruDetails[au.id] && ruDetails[au.id].scoped ? ` (${ruDetails[au.id].scoped.length})` : ""}</button>
          <button class="btn sm danger" data-rudel="${esc(au.id)}">🗑 Delete</button>
        </div>
      </div>`;
    }).join("") + `</div>
    <p class="mini muted" style="margin-top:8px">Click a card header — or <b>👤 Scoped admins</b> — for members and scoped role grants. Member changes on a restricted AU need a role scoped to it — the error Graph returns otherwise is the protection doing its job.</p>`;
  }
  $("ruChips").addEventListener("click", (e) => { const b = e.target.closest("[data-ruf]"); if (!b) return; ruFilter = b.dataset.ruf; renderRmau(); });
  $("ruSearch").addEventListener("input", (e) => { ruQuery = e.target.value; renderRmau(); });

  // ---- type-ahead for the two boxes on an AU card ----
  // The member box is pre-seeded with the BASELINE group names — the groups this
  // AU exists to protect — so the common case needs no typing at all, and a live
  // directory search folds in anything else. Same debounce shape as the
  // scoped-administrator field in the Protect flow.
  function ruBaselineGroups() {
    const out = new Set();
    try { CaGroups.templateNames().forEach((_, n) => out.add(n)); } catch {}
    try { CaGroups.catalogGroupNames(policies.map((p) => p.raw)).forEach((n) => out.add(n)); } catch {}
    // Groups the CA-groups scan already resolved in this tenant rank first —
    // they are the ones that actually exist and can be added.
    const present = new Set();
    try { for (const r of (cgRes ? cgRes.rows : [])) if (r.id && r.name) present.add(r.name); } catch {}
    return [...new Set([...present, ...out])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  // Adding a group should work the way granting a scoped administrator does:
  // the tool offers what belongs here first, and typing something else is
  // still allowed. The unit already knows its persona, so the groups whose CA
  // number maps to it can be offered by name — nobody should have to remember
  // that CAB-SEC-U-CA101-Exclusion is the Admins one, and a free-text box over
  // every group in the tenant makes the right answer as hard to reach as the
  // wrong one.
  // What this unit's persona has in the tenant, with the protection check
  // applied — so a group that cannot go in is shown WITH THE REASON rather
  // than offered as a click that fails. The check is the same one the bulk
  // panel runs, through the same function.
  function ruPgRow(au, d) {
    const code = Rmau.codeForAu(au.displayName);
    if (!code) return "";
    const entry = Rmau.BASELINE_AUS.find((a) => a.code === code) || null;
    const label = esc(entry ? entry.label : code);
    const scan = ruPg.get(code);
    if (!scan) return `<div class="ru-pg"><span class="mini muted">Checking which ${label} groups this tenant has…</span></div>`;
    if (scan.busy) return `<div class="ru-pg"><div class="spinner" style="width:14px;height:14px"></div><span class="mini muted">Checking which ${label} groups can go in…</span></div>`;
    if (scan.error) return `<div class="ru-pg"><span class="mini" style="color:var(--off)">Could not read this persona's groups: ${esc(scan.error)}. Add by name below.</span></div>`;
    const already = new Set(((d && d.members) || []).map((m) => m.id));
    const rows = scan.groups.map((g) => ruWhyNot(g, au.id, already, scan.prot))
      .sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
    const can = rows.filter((r) => !r.why);
    const cannot = rows.filter((r) => r.why && r.why !== "already a member of this unit");
    const inAlready = rows.filter((r) => r.why === "already a member of this unit").length;
    if (!rows.length) {
      return `<div class="ru-pg"><span class="mini muted">This tenant has no ${label} group yet. Add any group by name below, or create the baseline groups in 👥 Conditional Access groups.</span></div>`;
    }
    return `<div class="ru-pg">
      <span class="mini muted">${can.length
        ? `${label} groups for this unit — click to add:`
        : `No ${label} group can be added${inAlready ? ` — ${inAlready} ${inAlready === 1 ? "is" : "are"} in already` : ""}${cannot.length ? `, and ${cannot.length} cannot go in` : ""}.`}</span>
      ${can.map((r) => `<button class="btn sm ru-pgchip" data-rupg="${esc(au.id)}|${esc(r.name)}">＋ ${esc(r.name)}</button>`).join("")}
      </div>
      ${cannot.length ? `<div class="ru-pgno">${cannot.map((r) => `<div class="mini"><b>${esc(r.name)}</b> <span class="tag block">cannot</span> ${esc(r.why)}${r.roleAssignable ? ` <button class="btn sm" data-rumigrate="${esc(r.id)}">⑦ Migrate it</button>` : ""}</div>`).join("")}</div>` : ""}`;
  }
  function ruPersonaGroups(au, d) {
    const code = Rmau.codeForAu(au.displayName);
    if (!code) return { code: null, entry: null, names: [] };
    const entry = Rmau.BASELINE_AUS.find((a) => a.code === code) || null;
    const already = new Set(((d && d.members) || [])
      .map((m) => String(m.displayName || "").toLowerCase()).filter(Boolean));
    const names = ruBaselineGroups()
      .filter((n) => Rmau.codeForGroup(n) === code && !already.has(n.toLowerCase()));
    return { code, entry, names };
  }
  function ruSeedGroupSug() {
    const dl = $("ruGroupSug");
    if (!dl) return;
    dl.innerHTML = ruBaselineGroups().slice(0, 200)
      .map((n) => `<option value="${esc(n)}"></option>`).join("");
  }
  let ruSugTimer = null;
  // what was typed before the entry currently being searched, per field
  const ruAdminPrefix = new WeakMap();
  function ruSuggest(e) {
    // The bulk-grant fields live in this tool, so they are handled by THIS
    // listener. rmauInput is bound to the CA-groups and Protect panels and
    // would never see them — a mistake worth naming, because the field would
    // look alive and simply never record anything.
    if (e.target.id === "ruBAUpns" && ruBulkAdmin) { ruBulkAdmin.upns = e.target.value; return; }
    // The bulk search box feeds the SAME list the paste field holds — one
    // source of truth, so picking and pasting cannot disagree about who is
    // being granted. It reuses the per-unit user datalist below.
    if (e.target.id === "ruBASearch") {
      const term = String(e.target.value || "").trim();
      clearTimeout(ruSugTimer);
      const dl = $("ruUserSug");
      if (dl && [...dl.options].some((o) => o.value === term)) return;   // came from the list
      if (term.length < 2 || isDemo) return;
      ruSugTimer = setTimeout(async () => {
        const f = term.replace(/'/g, "''");
        try {
          const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
          if (dl) dl.innerHTML = ((r && r.value) || [])
            .map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
        } catch (err) { console.warn("Restricted AUs: bulk admin suggest failed", err.message); }
      }, 250);
      return;
    }
    const isGroup = e.target.matches("[data-ruaddbox]");
    const isUser = e.target.matches("[data-ruadminbox]");
    if (!isGroup && !isUser) return;
    const raw = String(e.target.value || "");
    // The admin field takes a LIST. Searching the whole string meant that the
    // moment a separator was typed the term became "a@x.com;tul" and matched
    // nothing — the field looked broken exactly when it was being used as
    // designed. Search the entry being typed, and remember what precedes it so
    // a pick from the list can be put back after it: choosing from a datalist
    // replaces the whole value, which would otherwise eat the names already
    // entered.
    let prefix = "";
    let term = raw.trim();
    if (isUser) {
      const cut = Math.max(raw.lastIndexOf(";"), raw.lastIndexOf(","));
      if (cut >= 0) { prefix = raw.slice(0, cut + 1); term = raw.slice(cut + 1).trim(); }
      const dlU = $("ruUserSug");
      // a pick landed: restore the entries that came before it
      if (prefix === "" && dlU && [...dlU.options].some((o) => o.value === term) && ruAdminPrefix.get(e.target)) {
        e.target.value = ruAdminPrefix.get(e.target) + term;
        ruAdminPrefix.delete(e.target);
        return;
      }
      if (prefix) ruAdminPrefix.set(e.target, prefix); else ruAdminPrefix.delete(e.target);
    }
    clearTimeout(ruSugTimer);
    // Selecting from a <datalist> fires `input` just like typing does. Without
    // this the pick re-runs the query, the options are rewritten, and the
    // browser reopens the dropdown over a field you have already filled — so
    // it looks like the choice did not take. An exact match against what is
    // already offered means the value came from the list, not the keyboard.
    const dlNow = $(isUser ? "ruUserSug" : "ruGroupSug");
    if (dlNow && [...dlNow.options].some((o) => o.value === term)) return;
    if (term.length < 2 || isDemo) return;
    ruSugTimer = setTimeout(async () => {
      const f = term.replace(/'/g, "''");
      try {
        if (isUser) {
          const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
          const dl = $("ruUserSug");
          if (dl) dl.innerHTML = ((r && r.value) || [])
            .map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
        } else {
          // A member can be a group OR a user, so search both and keep the
          // baseline names that still match rather than replacing them.
          const [gr, ur] = await Promise.all([
            Graph.gget(`/groups?$filter=startswith(displayName,'${f}')&$select=displayName&$top=10`).catch(() => null),
            Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=5`).catch(() => null),
          ]);
          const hits = [
            ...((gr && gr.value) || []).map((g) => ({ v: g.displayName, l: "group" })),
            ...((ur && ur.value) || []).map((u) => ({ v: u.userPrincipalName, l: u.displayName || "user" })),
          ];
          const kept = ruBaselineGroups().filter((n) => n.toLowerCase().includes(term.toLowerCase()))
            .map((n) => ({ v: n, l: "baseline group" }));
          const seen = new Set();
          const dl = $("ruGroupSug");
          if (dl) dl.innerHTML = [...kept, ...hits].filter((x) => x.v && !seen.has(x.v) && seen.add(x.v))
            .map((x) => `<option value="${esc(x.v)}" label="${esc(x.l)}"></option>`).join("");
        }
      } catch (err) { console.warn("Restricted AUs: suggest failed", err.message); }
    }, 250);
  }
  $("ruBody").addEventListener("input", ruSuggest);
  $("ruBody").addEventListener("keydown", (e) => {
    if (e.target.id !== "ruBASearch" || e.key !== "Enter") return;
    e.preventDefault();
    if (ruBulkAdmin) ruBAAddPick();
  });
  // The datalist is shared, so seed it for the unit whose box has focus:
  // this persona's groups first, then the rest of the baseline. Otherwise the
  // dropdown is 200 names in alphabetical order and the four that belong here
  // are somewhere in the middle of it.
  $("ruBody").addEventListener("focusin", (e) => {
    if (!e.target.matches("[data-ruaddbox]")) return;
    const au = (ruList || []).find((a) => a.id === e.target.dataset.ruaddbox);
    const dl = $("ruGroupSug");
    if (!au || !dl) return;
    // Once this persona has been scanned, the type-ahead uses the SAME verdicts
    // the chips do: what can go in is labelled as belonging here, what cannot
    // says why on the option itself. Before the scan lands it falls back to the
    // baseline names, which is a guess about the tenant and is labelled softly.
    const code = Rmau.codeForAu(au.displayName);
    const scan = code ? ruPg.get(code) : null;
    const entry = code ? Rmau.BASELINE_AUS.find((x) => x.code === code) : null;
    const label = entry ? entry.label : (code || "");
    let opts = [];
    let mine = new Set();
    if (scan && !scan.busy && !scan.error) {
      const already = new Set(((ruDetails[au.id] || {}).members || []).map((m) => m.id));
      const rows = scan.groups.map((g) => ruWhyNot(g, au.id, already, scan.prot));
      mine = new Set(rows.map((r) => String(r.name).toLowerCase()));
      opts = rows
        .sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || String(a.name).localeCompare(String(b.name)))
        .map((r) => `<option value="${esc(r.name)}" label="${r.why ? `cannot — ${esc(r.why.split(" — ")[0])}` : `${esc(label)} — belongs here`}"></option>`);
    } else {
      const pg = ruPersonaGroups(au, ruDetails[au.id]);
      mine = new Set(pg.names.map((n) => n.toLowerCase()));
      opts = pg.names.map((n) => `<option value="${esc(n)}" label="${esc(label)} — belongs here"></option>`);
    }
    const rest = ruBaselineGroups().filter((n) => !mine.has(n.toLowerCase()));
    dl.innerHTML = [...opts, ...rest.slice(0, 200).map((n) => `<option value="${esc(n)}"></option>`)].join("");
  });
  $("ruBody").addEventListener("change", (e) => {
    if (e.target.id === "ruBARole" && ruBulkAdmin) { ruBulkAdmin.role = e.target.value; return; }
    const bau = e.target.closest("[data-ruba]");
    if (bau && ruBulkAdmin) {
      bau.checked ? ruBulkAdmin.sel.add(bau.dataset.ruba) : ruBulkAdmin.sel.delete(bau.dataset.ruba);
      renderRmau();
    }
  });

  // Entra directory writes are not read-your-writes consistent. A DELETE on
  // /members/{id}/$ref returns 204 and the very next GET of the same collection
  // can still list the object — so "delete the cache and re-read", which is what
  // this tool did, faithfully re-renders the row that was just removed.
  //
  // So: apply the change to the cached detail immediately, so the card shows
  // what the user actually did, then re-read a few times with backoff and only
  // accept the directory's answer once it agrees. If it never catches up we keep
  // the optimistic view rather than resurrecting a deleted row, and say so.
  async function ruSettle(auId, apply, settled) {
    if (ruDetails[auId]) apply(ruDetails[auId]);
    renderRmau();
    if (isDemo) return true;
    for (const wait of [500, 1200, 2500]) {
      await new Promise((r) => setTimeout(r, wait));
      const optimistic = ruDetails[auId];
      delete ruDetails[auId];
      const fresh = await ruLoadDetail(auId);
      if (fresh.error || settled(fresh)) { renderRmau(); return true; }
      ruDetails[auId] = optimistic;      // directory still lagging — keep our view
    }
    renderRmau();
    return false;
  }

  // Rendered inside a restricted persona AU's card, under the member list.
  function ruBulkPanel(au) {
    if (!Rmau.isRestricted(au)) return "";
    const code = Rmau.codeForAu(au.displayName);
    if (!code) return "";                       // not a baseline persona unit
    const entry = Rmau.BASELINE_AUS.find((a) => a.code === code) || {};
    const t = ruBulk && ruBulk.auId === au.id ? ruBulk : null;

    if (!t) {
      return `<div style="margin:10px 0 12px">
        <button class="btn sm" data-rubulk="${esc(au.id)}">＋ Bulk add ${esc(entry.label || code)} groups</button>
        <span class="mini muted"> — finds this tenant's security groups ${code === "BreakGlass"
          ? "named like break-glass groups (BreakGlass, Break-Glass, Emergency_Access1, BG-…)"
          : `whose CA number falls in ${esc(entry.caRange || "this persona's range")}`} and adds them in one go.</span>
      </div>`;
    }
    if (t.busy && !t.rows.length) return '<div class="mini muted" style="margin:10px 0"><div class="spinner" style="width:16px;height:16px"></div> Looking for this persona\'s groups…</div>';
    if (t.error) return `<div class="mini" style="color:var(--off);margin:10px 0">✗ ${esc(t.error)}</div>`;

    const can = t.rows.filter((r) => !r.why);
    const cannot = t.rows.filter((r) => r.why);
    const line = (r) => r.why
      ? `<div class="dr-row"><div class="dr-head"><b>${esc(r.name)}</b> <span class="tag block">cannot</span></div>
           <div class="mini" style="color:var(--off)">${esc(r.why)}</div></div>`
      : `<div class="dr-row"><div class="dr-head"><label class="chk" style="margin:0">
           <input type="checkbox" data-rubulkg="${esc(r.id)}"${t.sel.has(r.id) ? " checked" : ""}> <b>${esc(r.name)}</b></label></div></div>`;

    return `<div class="cg-panel" style="margin:10px 0 12px">
      <h4>BULK ADD — ${esc(entry.label || code).toUpperCase()} ${entry.caRange ? `(${esc(entry.caRange)})` : ""}</h4>
      ${!t.rows.length ? '<p class="mini" style="margin:0">No security group in this tenant carries a CA number in this persona\'s range. Nothing to add — which for the workload-identity unit is the expected answer, since those policies exclude service principals and a service principal cannot be a member of an administrative unit.</p>' : `
        <p class="mini" style="margin:0 0 8px">${can.length} can be added${cannot.length ? ` · <span style="color:var(--off)">${cannot.length} cannot</span>` : ""}. Matched by the CA number in the group's name — the same rule ⑥ Protect routes by.</p>
        <div class="cg-pick">${t.rows.map(line).join("")}</div>
        ${can.length ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
            <button class="btn sm" data-rubulkall="${esc(au.id)}">${t.sel.size === can.length ? "☐ Deselect all" : "☑ Select all"}</button>
            <span class="mini muted">${t.sel.size} of ${can.length} selected</span>
          </div>
          <div class="row" style="justify-content:flex-start;margin-top:10px">
            <button class="btn primary" data-rubulkgo="${esc(au.id)}"${t.busy ? " disabled" : ""}>Add ${t.sel.size} group${t.sel.size === 1 ? "" : "s"}${isDemo ? " (simulated)" : ""}</button>
            <button class="btn" data-rubulk="${esc(au.id)}">⟳ Re-check</button>
          </div>` : ""}`}
      ${t.results ? `<p class="mini" style="margin:8px 0 0"><b>${t.results.filter((r) => r.ok).length}/${t.results.length} added.</b>${t.results.some((r) => !r.ok) ? ` <span style="color:var(--off)">${t.results.filter((r) => !r.ok).map((r) => `${esc(r.name)} — ${esc(r.error)}`).join("; ")}</span>` : ""}</p>` : ""}
    </div>`;
  }

  // ---------- R07: grant scoped administrators across several units ----------
  // A restricted unit with no scoped administrator is one whose members nobody
  // can change, so the grants are not optional paperwork — they are what makes
  // the unit usable. Granted one administrator on one unit at a time, a
  // four-person team across eleven baseline units is 44 separate acts, and the
  // risk is not the tedium but the omission: miss one unit and that persona is
  // unmanageable, which nothing announces.
  //
  // Deliberately a grid rather than "apply to all": who may reach the Admins
  // exclusions is not automatically who may reach the Externals ones, and a
  // tool that assumed otherwise would quietly undo the per-persona split.
  let ruBulkAdmin = null;   // { open, sel:Set(auId), upns, role, busy, results }

  // One list, two ways in: search a name, or paste UPNs. The picker appends to
  // the same string the paste field holds rather than keeping its own array —
  // two sources of truth for "who is being granted" is how somebody grants a
  // role to a person they had removed.
  function ruBAAddPick() {
    const box = $("ruBASearch");
    const v = box ? box.value.trim() : "";
    if (!v) { toast("Search a <span>person</span> first"); return; }
    const cur = CaGroups.adminList(ruBulkAdmin.upns);
    if (cur.some((u) => u.toLowerCase() === v.toLowerCase())) { toast("Already in the list"); return; }
    ruBulkAdmin.upns = [...cur, v].join(", ");
    renderRmau();
  }
  function ruBulkAdminPanel() {
    const restricted = (ruList || []).filter(Rmau.isRestricted);
    if (restricted.length < 2) return "";      // nothing to do in bulk
    const t = ruBulkAdmin;
    if (!t || !t.open) {
      // A closed state that reads as a feature. It used to be one line of small
      // print at the foot of the baseline checklist, below eleven rows — which
      // is to say invisible, whatever the roadmap claimed had shipped.
      const naked = restricted.filter((au) => { const d = ruDetails[au.id]; return d && d.scoped && !d.scoped.length; }).length;
      return `<div class="cg-panel">
        <h4>👤 SCOPED ADMINISTRATORS ACROSS UNITS</h4>
        <p class="mini" style="margin:0 0 8px">One set of people, several units, applied as a grid — each unit × administrator its own outcome. A restricted unit with nobody scoped to it is a unit whose members <b>nobody</b> can change${naked ? `, and <b style="color:var(--off)">${naked}</b> of the ${restricted.length} opened so far ${naked === 1 ? "is" : "are"} in that state` : ""}.</p>
        <button class="btn primary" id="ruBAOpen">👤 Grant across ${restricted.length} restricted units…</button>
      </div>`;
    }
    const rows = restricted.map((au) => {
      const d = ruDetails[au.id];
      const who = d && d.scoped ? d.scoped.map((r) => r._principal).filter(Boolean) : null;
      return `<div class="dr-row"><div class="dr-head">
        <label class="chk" style="margin:0"><input type="checkbox" data-ruba="${esc(au.id)}"${t.sel.has(au.id) ? " checked" : ""}> <b>${esc(au.displayName)}</b></label>
        ${who ? (who.length
            ? `<span class="mini muted">${who.length} now: ${esc(who.slice(0, 3).join(", "))}${who.length > 3 ? "…" : ""}</span>`
            : '<span class="tag block">nobody can manage this unit</span>')
          : '<span class="mini muted">open the card to see who has it today</span>'}
      </div></div>`;
    }).join("");

    const res = t.results ? (() => {
      const ok = t.results.filter((r) => r.ok).length;
      const byUnit = new Map();
      for (const r of t.results) if (!r.ok) byUnit.set(r.au, [...(byUnit.get(r.au) || []), `${r.upn} — ${r.error}`]);
      return `<p class="mini" style="margin:8px 0 0"><b>${ok}/${t.results.length} grants made.</b></p>
        ${byUnit.size ? `<ul class="wi-list" style="margin:6px 0 0">${[...byUnit].map(([u, xs]) =>
          `<li><div class="wi-why" style="color:var(--off)">✗ <b>${esc(u)}</b> — ${esc(xs.join("; "))}</div></li>`).join("")}</ul>` : ""}`;
    })() : "";

    return `<div class="cg-panel" id="ruBAPanel">
      <h4>GRANT SCOPED ADMINISTRATORS ACROSS UNITS</h4>
      <p class="mini" style="margin:0 0 8px">Each unit × each administrator is a separate grant and a separate outcome — a partial success has to be readable rather than rounded to “done”.</p>
      <label class="mini" style="display:block;margin:0 0 4px">Administrators</label>
      <div class="ru-basearch">
        <input id="ruBASearch" list="ruUserSug" class="btn" style="cursor:text;flex:1;min-width:240px" placeholder="Search a person by name — or paste UPNs below" autocomplete="off" spellcheck="false">
        <button class="btn sm" id="ruBASearchAdd">＋ Add</button>
      </div>
      ${(() => {
        const picked = CaGroups.adminList(t.upns);
        return picked.length
          ? `<div class="ru-bapicks">${picked.map((u) => `<span class="an-pick">👤 ${esc(u)}<button data-rubadel="${esc(u)}" title="Remove">×</button></span>`).join("")}</div>`
          : `<p class="mini muted" style="margin:6px 0 0">Nobody picked yet. Search above, or paste a list.</p>`;
      })()}
      <label class="mini" style="display:block;margin:10px 0 4px">…or paste them <span class="muted">— UPNs, separated by commas</span></label>
      <input id="ruBAUpns" class="txt" value="${esc(t.upns)}" placeholder="someone@contoso.com, someone.else@contoso.com" autocomplete="off" spellcheck="false" style="max-width:560px;letter-spacing:normal;font-weight:400">
      <label class="mini" style="display:block;margin:10px 0 4px">Role</label>
      <select id="ruBARole" class="btn" style="cursor:pointer;width:auto">${Rmau.ROLE_TEMPLATES.map((r) => `<option value="${r.id}"${t.role === r.id ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
      <h5 class="mini" style="margin:14px 0 6px">UNITS</h5>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">
        <button class="btn sm" id="ruBAAll">${t.sel.size === restricted.length ? "☐ Deselect all" : "☑ Select all"}</button>
        <span class="mini muted">${t.sel.size} of ${restricted.length} selected</span>
      </div>
      <div class="cg-pick">${rows}</div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn primary" id="ruBAGo"${t.busy ? " disabled" : ""}>Grant ${t.sel.size * Math.max(1, CaGroups.adminList(t.upns).length)} ×${isDemo ? " (simulated)" : ""}</button>
        <button class="btn" id="ruBAClose">Close</button>
      </div>
      <div id="ruBALog" class="mini" style="margin-top:8px">${(t.log || []).join("")}</div>
      ${res}
    </div>`;
  }

  async function ruBulkAdminRun(btn) {
    const t = ruBulkAdmin; if (!t || t.busy) return;
    const upns = CaGroups.adminList(t.upns);
    const units = (ruList || []).filter((a) => t.sel.has(a.id));
    if (!upns.length) { toast("Name at least one administrator"); return; }
    if (!units.length) { toast("Pick at least one unit"); return; }
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE, ...RU_ROLE_WRITE])) return;

    t.busy = true; btn.disabled = true;
    const lines = []; t.log = lines;
    const say = (h) => { lines.push(h); const el = $("ruBALog"); if (el) el.innerHTML = lines.join(""); };

    // The role is activated once, and each UPN resolved once — not once per
    // unit. Eleven units times four people is 44 grants but only four lookups.
    let role = null, roleErr = null;
    if (!isDemo) {
      try { role = await ensureDirectoryRole(t.role); }
      catch (e) { roleErr = e.message || String(e); }
    }
    const ids = new Map();
    for (const upn of upns) {
      if (isDemo) { ids.set(upn, "demo-" + upn); continue; }
      try { ids.set(upn, (await Graph.gget(`/users/${encodeURIComponent(upn)}?$select=id`)).id); }
      catch (e) { say(`<div style="color:var(--off)">✗ ${esc(upn)} — could not be found: ${esc(e.message || e)}</div>`); }
    }

    const results = [];
    for (const au of units) {
      for (const upn of upns) {
        const r = { au: au.displayName, upn, ok: false };
        try {
          if (roleErr) throw new Error(`the role could not be activated: ${roleErr}`);
          if (!ids.has(upn)) throw new Error("user not found");
          if (!isDemo) {
            await Graph.gpost(`/administrativeUnits/${au.id}/scopedRoleMembers`,
              { roleId: role.id, roleMemberInfo: { id: ids.get(upn) } });
          }
          r.ok = true;
          say(`<div>✓ ${esc(upn)} → <b>${esc(au.displayName)}</b></div>`);
        } catch (e) {
          const already = /already exist|conflicting object/i.test(e.message || "");
          r.ok = already; r.error = already ? "" : (e.message || String(e));
          say(already
            ? `<div>• ${esc(upn)} — already scoped to ${esc(au.displayName)}</div>`
            : `<div style="color:var(--off)">✗ ${esc(upn)} on ${esc(au.displayName)} — ${esc(r.error)}</div>`);
        }
        results.push(r);
      }
      delete ruDetails[au.id];      // its scoped list is stale now
    }
    t.results = results; t.busy = false;
    const ok = results.filter((r) => r.ok).length;
    toast(`${ok}/${results.length} grant${results.length === 1 ? "" : "s"} made${isDemo ? " (simulated)" : ""}`);
    renderRmau();
  }

  // ---------- bulk add: the whole persona at once ----------
  // A persona vault wants every exclusion group of that persona in it. Adding
  // them one at a time through the type-ahead is the same decision repeated
  // twenty times, and the failure mode is not noticing that you stopped at
  // nineteen. This finds them by the CA number in their names — the same rule
  // ⑥ Protect routes by — and shows what CANNOT go in as prominently as what
  // can, because those are the rows that need a different action, not a retry.
  let ruBulk = null;   // { auId, busy, rows, sel, results, error }

  // The baseline family, plus — for the break-glass unit only — the names
  // tenants actually give those groups. Graph cannot match a displayName by
  // pattern without $search, so the shortlist is a few startswith reads and the
  // real filter happens on the results.
  const RU_BULK_PREFIXES = ["CAB-SEC", "CAD-SEC"];
  const RU_BULK_EXTRA = { BreakGlass: ["Emergency", "BreakGlass", "Break-Glass", "BG-"] };

  // Can this group go into this restricted unit, and if not, why not? One
  // function, because the answer is now given in two places — the bulk panel
  // and the per-unit chips — and two copies of it would disagree the first
  // time one was corrected. Order matters: the reasons are not equally
  // interesting, and "role-assignable" is the one that leaves a group frozen.
  function ruWhyNot(g, auId, already, prot) {
    const m365 = (g.groupTypes || []).includes("Unified");
    const mailSec = g.mailEnabled === true && g.securityEnabled === true;
    const dist = g.mailEnabled === true && g.securityEnabled === false;
    const elsewhere = (prot || new Map()).get(g.id);
    const row = { id: g.id, name: g.displayName, roleAssignable: g.isAssignableToRole === true };
    if (already && already.has(g.id)) row.why = "already a member of this unit";
    else if (m365) row.why = "Microsoft 365 group — only SECURITY groups can be members of a restricted unit";
    else if (mailSec) row.why = "mail-enabled security group — only cloud security groups can be members";
    else if (dist) row.why = "distribution group — only security groups can be members";
    else if (row.roleAssignable) row.why = "role-assignable — putting it in a restricted unit would leave NOBODY able to change its members. Convert it with ⑦ Migrate first";
    else if (elsewhere && elsewhere.auId !== auId) row.why = `already in ${elsewhere.auName} — an object can sit in several restricted units, and a scoped administrator on ANY of them can manage it, so adding it here widens who can reach it rather than narrowing it`;
    return row;
  }

  // The persona chips used to be built from group NAMES the baseline knows
  // about, which offered two things it should not: groups this tenant does not
  // have, and groups it has that cannot go in — a role-assignable one clicks
  // through to a frozen group, which is the one outcome this tool exists to
  // prevent. So the same bounded scan the bulk panel runs backs the chips,
  // cached per persona because several units never share one.
  const ruPg = new Map();          // code -> { busy, groups, prot, error }
  async function ruPgLoad(au) {
    const code = Rmau.codeForAu(au.displayName);
    if (!code || ruPg.has(code)) return;
    ruPg.set(code, { busy: true, groups: [], prot: new Map(), error: null });
    renderRmau();
    const entry = { busy: false, groups: [], prot: new Map(), error: null };
    try {
      if (isDemo) {
        entry.groups = [
          { id: "d1", displayName: "CAB-SEC-U-CA101-Exclusion", securityEnabled: true },
          { id: "d2", displayName: "CAB-SEC-U-CA102-Exclusion", securityEnabled: true, isAssignableToRole: true },
        ].filter((g) => Rmau.codeForGroup(g.displayName) === code);
      } else {
        const seen = new Set();
        for (const p of [...RU_BULK_PREFIXES, ...(RU_BULK_EXTRA[code] || [])]) {
          try {
            const r = await Graph.ggetAll(`/groups?$filter=startswith(displayName,'${p.replace(/'/g, "''")}')&$select=id,displayName,isAssignableToRole,groupTypes,mailEnabled,securityEnabled&$top=999`);
            for (const g of r) if (!seen.has(g.id) && Rmau.codeForGroup(g.displayName) === code) { seen.add(g.id); entry.groups.push(g); }
          } catch (e) { console.warn("persona chips: prefix", p, "failed:", e.message || e); }
        }
        try { entry.prot = await readProtectionMap(); } catch { /* leave it unknown */ }
      }
    } catch (e) { entry.error = e.message || String(e); }
    ruPg.set(code, entry);
    renderRmau();
  }

  async function ruBulkScan(auId) {
    const au = (ruList || []).find((a) => a.id === auId);
    const code = au ? Rmau.codeForAu(au.displayName) : null;
    ruBulk = { auId, busy: true, rows: [], sel: new Set(), results: null, error: null, code };
    renderRmau();
    try {
      if (!code) throw new Error("this administrative unit is not one of the baseline persona units, so there is no persona to gather groups for");
      let groups = [];
      if (isDemo) {
        groups = [{ id: "d1", displayName: "CAB-SEC-U-CA101-Exclusion" }, { id: "d2", displayName: "CAB-SEC-U-CA102-Exclusion" }];
      } else {
        // Bounded on purpose: the baseline family, not every group in the
        // tenant. A displayName cannot be matched by pattern in Graph, so the
        // CA-number filter happens here.
        const seen = new Set();
        for (const p of [...RU_BULK_PREFIXES, ...(RU_BULK_EXTRA[code] || [])]) {
          // One prefix failing must not cost the others — a tenant with an odd
          // group estate should still get the ones that did come back.
          try {
            const r = await Graph.ggetAll(`/groups?$filter=startswith(displayName,'${p.replace(/'/g, "''")}')&$select=id,displayName,isAssignableToRole,groupTypes,mailEnabled,securityEnabled&$top=999`);
            for (const g of r) if (!seen.has(g.id)) { seen.add(g.id); groups.push(g); }
          } catch (e) { console.warn("bulk add: prefix", p, "failed:", e.message || e); }
        }
      }
      const already = new Set(((ruDetails[auId] || {}).members || []).map((m) => m.id));
      // Where everything else already lives, so a group sitting in the WRONG
      // unit is visible rather than silently offered as if it were free.
      let prot = new Map();
      if (!isDemo) { try { prot = await readProtectionMap(); } catch { /* leave it unknown */ } }

      const rows = [];
      for (const g of groups) {
        if (Rmau.codeForGroup(g.displayName) !== code) continue;
        rows.push(ruWhyNot(g, auId, already, prot));
      }
      rows.sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
      ruBulk.rows = rows;
      ruBulk.sel = new Set(rows.filter((r) => !r.why).map((r) => r.id));
    } catch (e) {
      ruBulk.error = e.message || String(e);
    }
    ruBulk.busy = false;
    renderRmau();
  }

  async function ruBulkAdd(btn) {
    const t = ruBulk; if (!t || t.busy) return;
    const picked = t.rows.filter((r) => t.sel.has(r.id) && !r.why);
    if (!picked.length) { toast("Nothing selected"); return; }
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE])) return;
    t.busy = true; btn.disabled = true;
    const results = [];
    for (const r of picked) {
      try {
        if (!isDemo) await Graph.gpost(`/administrativeUnits/${t.auId}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/beta/groups/${r.id}` });
        results.push({ name: r.name, ok: true });
      } catch (e) {
        const already = /already exist/i.test(e.message || "");
        results.push({ name: r.name, ok: already, error: already ? "" : (e.message || String(e)) });
      }
    }
    t.results = results; t.busy = false;
    // The card's member list is stale now, and so is the offer.
    delete ruDetails[t.auId];
    await ruLoadDetail(t.auId);
    const ok = results.filter((r) => r.ok).length;
    toast(`${ok}/${results.length} group${results.length === 1 ? "" : "s"} added${isDemo ? " (simulated)" : ""}`);
    await ruBulkScan(t.auId);
  }

  async function ruAddMember(auId, term) {
    const t = term.trim();
    if (!t) { toast("Type a group name or a user UPN"); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE])) return;
    try {
      let obj = null, kind = "group";
      if (isDemo) { obj = { id: "demo-" + t, displayName: t }; }
      else if (t.includes("@")) {
        kind = "user";
        obj = await Graph.gget(`/users/${encodeURIComponent(t)}?$select=id,displayName`);
      } else {
        const f = t.replace(/'/g, "''");
        const r = await Graph.gget(`/groups?$filter=displayName eq '${f}'&$select=id,displayName`);
        obj = (r.value || [])[0];
        if (!obj) { const r2 = await Graph.gget(`/groups?$filter=startswith(displayName,'${f}')&$select=id,displayName&$top=2`); obj = (r2.value || [])[0]; }
      }
      if (!obj) { toast(`No group or user found for <span>${esc(t)}</span>`); return; }
      if (!isDemo) await Graph.gpost(`/administrativeUnits/${auId}/members/$ref`,
        { "@odata.id": `https://graph.microsoft.com/beta/${kind === "user" ? "users" : "groups"}/${obj.id}` });
      toast(`<span>${esc(obj.displayName || t)}</span> added${isDemo ? " (simulated)" : ""}`);
      // Same lag in the other direction: the new member can be missing from the
      // very next read. Show it straight away, then let the directory confirm.
      const added = { id: obj.id, displayName: obj.displayName || t,
        ...(kind === "user" ? { userPrincipalName: t } : {}) };
      if (kind === "group") added._caRefs = Rmau.caRefs(obj.id, policies.map((p) => p.raw));
      await ruSettle(auId,
        (d) => { if (!(d.members || []).some((m) => m.id === obj.id)) d.members = [...(d.members || []), added]; },
        (d) => (d.members || []).some((m) => m.id === obj.id));
      const box = document.querySelector(`[data-ruaddbox="${auId}"]`);
      if (box) box.value = "";                       // the entry is on the list now
    } catch (e) { toast(`Add failed: <span>${esc(e.message || e)}</span>`); }
  }
  // Several people at once. The field has always looked like it took a list —
  // and the bulk panel across units does — but this one granted the whole
  // string as a single UPN, so "a@x.com;b@x.com" failed as one unresolvable
  // user rather than succeeding twice. Each person is a separate grant and a
  // separate outcome; a partial success has to be readable, not rounded.
  async function ruGrantAdmins(auId, roleTemplateId, raw) {
    const list = CaGroups.adminList(raw);
    if (!list.length) { toast("Type the administrator's UPN"); return; }
    if (list.length === 1) return ruGrantAdmin(auId, roleTemplateId, list[0]);
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE, ...RU_ROLE_WRITE])) return;
    const done = [], failed = [];
    for (const upn of list) {
      try {
        if (!isDemo) {
          const role = await ensureDirectoryRole(roleTemplateId);
          const u = await Graph.gget(`/users/${encodeURIComponent(upn)}?$select=id`);
          await Graph.gpost(`/administrativeUnits/${auId}/scopedRoleMembers`, { roleId: role.id, roleMemberInfo: { id: u.id } });
          ruRoleNames = null;
        }
        done.push(upn);
      } catch (e) {
        failed.push(`${upn} — ${/conflicting object|already exist/i.test(e.message || "") ? "already holds that role" : (e.message || e)}`);
      }
    }
    toast(`<span>${done.length}/${list.length}</span> granted${isDemo ? " (simulated)" : ""}`
      + (failed.length ? ` · ${esc(failed.join("; "))}` : ""));
    delete ruDetails[auId];
    await ruLoadDetail(auId);
    renderRmau();
    const gbox = document.querySelector(`[data-ruadminbox="${auId}"]`);
    if (gbox) gbox.value = "";
  }
  async function ruGrantAdmin(auId, roleTemplateId, upn) {
    const t = upn.trim();
    if (!t) { toast("Type the administrator's UPN"); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE, ...RU_ROLE_WRITE])) return;
    let granted = null;
    try {
      if (!isDemo) {
        const role = await ensureDirectoryRole(roleTemplateId);
        const u = await Graph.gget(`/users/${encodeURIComponent(t)}?$select=id`);
        await Graph.gpost(`/administrativeUnits/${auId}/scopedRoleMembers`, { roleId: role.id, roleMemberInfo: { id: u.id } });
        ruRoleNames = null;
        granted = u.id;
      }
      toast(`<span>${esc(t)}</span> granted${isDemo ? " (simulated)" : ""}`);
      await ruSettle(auId,
        () => { /* the grant id is server-assigned, so wait for the read */ },
        (d) => !granted || (d.scoped || []).some((r) => (r.roleMemberInfo || {}).id === granted));
      const gbox = document.querySelector(`[data-ruadminbox="${auId}"]`);
      if (gbox) gbox.value = "";
    } catch (e) {
      // A conflict on the grant itself means this person already holds this role
      // on this AU — say that, rather than handing back Graph's wording, which
      // reads like a fault when it is really "nothing to do".
      const dup = /conflicting object|already exist/i.test(e.message || "");
      toast(dup
        ? `<span>${esc(t)}</span> already holds that role on this administrative unit — nothing to change.`
        : `Grant failed: <span>${esc(e.message || e)}</span>`);
      if (dup) { delete ruDetails[auId]; await ruLoadDetail(auId); renderRmau(); }
    }
  }

  $("ruBody").addEventListener("click", async (e) => {
    const op = e.target.closest("[data-ruopen]");
    if (op && !e.target.closest("button")) {
      const id = op.dataset.ruopen;
      ruOpen.has(id) ? ruOpen.delete(id) : ruOpen.add(id);
      renderRmau();
      // Opening a persona unit is the moment its groups become worth checking:
      // the chips claim "click to add", so they have to have been verified
      // first. Cached per persona, so re-opening costs nothing.
      if (ruOpen.has(id)) {
        const au = (ruList || []).find((a) => a.id === id);
        if (au && Rmau.isRestricted(au)) ruPgLoad(au);
      }
      if (ruOpen.has(id)) { await ruLoadDetail(id); renderRmau(); }
      return;
    }
    if (e.target.id === "ruBaseAll") {
      const t = ruBaseline();
      t.sel = t.sel.size === t.check.missing.length ? new Set() : new Set(t.check.missing.map((r) => r.name));
      renderRmau();
      return;
    }
    if (e.target.id === "ruBaseGo") { await ruBaseCreate(e.target); return; }
    if (e.target.id === "ruBaseMd") {
      const t = ruBaseline();
      showReport("🛡 Persona restricted administrative units", "CA-PersonaRMAUs",
        Rmau.baselineReport(t.check, t.results, { tenant: tenantName, build: APP_BUILD.label }));
      return;
    }
    const bg = e.target.closest("[data-rubulkg]");
    if (bg && ruBulk) {
      bg.checked ? ruBulk.sel.add(bg.dataset.rubulkg) : ruBulk.sel.delete(bg.dataset.rubulkg);
      renderRmau();
      return;
    }
    const bs = e.target.closest("[data-rubase]");
    if (bs) {
      const t = ruBaseline();
      bs.checked ? t.sel.add(bs.dataset.rubase) : t.sel.delete(bs.dataset.rubase);
      renderRmau();
      return;
    }
    if (e.target.id === "ruBAOpen" || e.target.id === "ruBAOpenTop") {
      ruBulkAdmin = { open: true, sel: new Set((ruList || []).filter(Rmau.isRestricted).map((a) => a.id)),
        upns: "", role: Rmau.ROLE_TEMPLATES[0].id, busy: false, results: null, log: null };
      renderRmau();
      return;
    }
    if (e.target.id === "ruBAClose" && ruBulkAdmin) { ruBulkAdmin.open = false; renderRmau(); return; }
    if (e.target.id === "ruBAAll" && ruBulkAdmin) {
      const all = (ruList || []).filter(Rmau.isRestricted).map((a) => a.id);
      ruBulkAdmin.sel = ruBulkAdmin.sel.size === all.length ? new Set() : new Set(all);
      renderRmau();
      return;
    }
    if (e.target.id === "ruBAGo") { await ruBulkAdminRun(e.target); return; }
    // add the searched person to the list, and take one back off it
    if (e.target.id === "ruBASearchAdd" && ruBulkAdmin) { ruBAAddPick(); return; }
    const bad = e.target.closest("[data-rubadel]");
    if (bad && ruBulkAdmin) {
      const drop = bad.dataset.rubadel.toLowerCase();
      ruBulkAdmin.upns = CaGroups.adminList(ruBulkAdmin.upns).filter((u) => u.toLowerCase() !== drop).join(", ");
      renderRmau();
      return;
    }
    const bk = e.target.closest("[data-rubulk]");
    if (bk) { await ruBulkScan(bk.dataset.rubulk); return; }
    const bka = e.target.closest("[data-rubulkall]");
    if (bka && ruBulk) {
      const can = ruBulk.rows.filter((r) => !r.why);
      ruBulk.sel = ruBulk.sel.size === can.length ? new Set() : new Set(can.map((r) => r.id));
      renderRmau();
      return;
    }
    const bkg = e.target.closest("[data-rubulkgo]");
    if (bkg) { await ruBulkAdd(bkg); return; }
    const sc = e.target.closest("[data-ruscope]");
    if (sc) {
      const id = sc.dataset.ruscope;
      const wasOpen = ruOpen.has(id);
      ruOpen.add(id);                       // always open, never toggle shut
      if (!wasOpen) renderRmau();
      if (!ruDetails[id]) { await ruLoadDetail(id); renderRmau(); }
      // Land on the grant box itself, not the button that was pressed. When the
      // card is ALREADY open the button is on screen and scrolling to it does
      // nothing visible — which reads as a dead button. Focusing the input is
      // feedback in both cases, and it is where the next keystroke belongs.
      const box = document.querySelector(`[data-ruadminbox="${id}"]`);
      if (box) {
        box.scrollIntoView({ block: "center", behavior: "smooth" });
        box.focus({ preventScroll: true });
        box.classList.add("ru-flash");
        setTimeout(() => box.classList.remove("ru-flash"), 1200);
      }
      return;
    }
    const ed = e.target.closest("[data-ruedit]"); if (ed) { openRuEditor(ruList.find((x) => x.id === ed.dataset.ruedit)); return; }
    const dl = e.target.closest("[data-rudel]"); if (dl) { openRuDelete(ruList.find((x) => x.id === dl.dataset.rudel)); return; }
    const ad = e.target.closest("[data-ruadd]");
    if (ad) { const box = document.querySelector(`[data-ruaddbox="${ad.dataset.ruadd}"]`); await ruAddMember(ad.dataset.ruadd, box ? box.value : ""); return; }
    // A role-assignable candidate needs converting before it can be protected,
    // and the tool that does it is two screens away — so the reason carries the
    // way out rather than only the diagnosis.
    const mig = e.target.closest("[data-rumigrate]");
    if (mig) {
      toast("Convert it in 👥 <span>Conditional Access groups</span> → ⑦ Migrate, then re-open this unit");
      openCaGroups();
      return;
    }
    // one click for a group that belongs to this unit's persona
    const pg = e.target.closest("[data-rupg]");
    if (pg) {
      const i = pg.dataset.rupg.indexOf("|");
      await ruAddMember(pg.dataset.rupg.slice(0, i), pg.dataset.rupg.slice(i + 1));
      return;
    }
    const ga = e.target.closest("[data-ruadmin]");
    if (ga) {
      const id = ga.dataset.ruadmin;
      const role = document.querySelector(`[data-rurole="${id}"]`);
      const box = document.querySelector(`[data-ruadminbox="${id}"]`);
      await ruGrantAdmins(id, role ? role.value : Rmau.ROLE_TEMPLATES[0].id, box ? box.value : "");
      return;
    }
    const mr = e.target.closest("[data-rumrm]");
    if (mr) {
      if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE])) return;
      try {
        const auId = mr.dataset.ruau, memId = mr.dataset.rumrm;
        if (!isDemo) await Graph.gdelete(`/administrativeUnits/${auId}/members/${memId}/$ref`);
        toast(`Member removed${isDemo ? " (simulated)" : ""}`);
        const agreed = await ruSettle(auId,
          (d) => { d.members = (d.members || []).filter((m) => m.id !== memId); },
          (d) => !(d.members || []).some((m) => m.id === memId));
        if (!agreed) toast("Removed — the directory is still catching up, so a refresh may briefly show it again.");
      } catch (err) { toast(`Remove failed: <span>${esc(err.message || err)}</span>`); }
      return;
    }
    const sr = e.target.closest("[data-rusrm]");
    if (sr) {
      if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE, ...RU_ROLE_WRITE])) return;
      try {
        const auId = sr.dataset.ruau, grantId = sr.dataset.rusrm;
        if (!isDemo) await Graph.gdelete(`/administrativeUnits/${auId}/scopedRoleMembers/${grantId}`);
        toast(`Scoped grant removed${isDemo ? " (simulated)" : ""}`);
        const agreed = await ruSettle(auId,
          (d) => { d.scoped = (d.scoped || []).filter((r) => r.id !== grantId); },
          (d) => !(d.scoped || []).some((r) => r.id === grantId));
        if (!agreed) toast("Removed — the directory is still catching up, so a refresh may briefly show it again.");
      } catch (err) { toast(`Remove failed: <span>${esc(err.message || err)}</span>`); }
      return;
    }
  });

  function openRuEditor(au) {
    ruEditing = au || null;
    $("ruEditTitle").textContent = au ? `Edit ${au.displayName}` : "New restricted administrative unit";
    $("ruEditSub").innerHTML = au
      ? "Name and description are a PATCH. The restricted flag cannot be changed."
      : "Created with <code>isMemberManagementRestricted: true</code> — needs the <b>Privileged Role Administrator</b> role.";
    $("ruName").value = au ? (au.displayName || "") : "";
    $("ruDesc").value = au ? (au.description || "") : "";
    $("ruEditFlag").innerHTML = au
      ? `<p class="mini muted" style="margin:0">Restricted: <b>${Rmau.isRestricted(au) ? "yes" : "no"}</b> — immutable. Converting means creating a new AU and moving the members.</p>
         <p class="mini" style="margin:8px 0 0">Looking for <b>scoped administrators</b>? They are not edited here — this dialog is a PATCH of the AU's own name and description. Close this and use <b>👤 Scoped admins</b> on the card to grant or revoke a role scoped to this administrative unit.</p>`
      : `<label class="chk" style="display:block"><input type="checkbox" id="ruNewRestricted" checked> Restricted management (immutable after creation)</label>`;
    $("ruEditWarn").innerHTML = "";
    $("ruEditModal").classList.add("open");
  }
  $("ruNew").addEventListener("click", () => openRuEditor(null));
  $("ruEditCancel").addEventListener("click", () => $("ruEditModal").classList.remove("open"));
  $("ruEditSave").addEventListener("click", async () => {
    const built = Rmau.buildPayload({ name: $("ruName").value, description: $("ruDesc").value,
      creating: !ruEditing, restricted: !ruEditing && $("ruNewRestricted") ? $("ruNewRestricted").checked : false });
    if (!built.ok) { $("ruEditWarn").innerHTML = built.errors.map((x) => `<div class="mini" style="color:var(--off)">✗ ${esc(x)}</div>`).join(""); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE])) return;
    const btn = $("ruEditSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isDemo) toast("Demo — <span>save simulated</span>");
      else if (ruEditing) await Graph.gpatch(`/administrativeUnits/${ruEditing.id}`, { displayName: built.payload.displayName, description: built.payload.description });
      else await Graph.gpost("/administrativeUnits", built.payload);
      $("ruEditModal").classList.remove("open");
      await openRmauTool(true);
      toast(`<span>${esc(built.payload.displayName)}</span> ${ruEditing ? "updated" : "created"}${isDemo ? " (simulated)" : ""}`);
    } catch (e) {
      $("ruEditWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  });

  function openRuDelete(au) {
    if (!au) return;
    ruDeleting = au;
    $("ruDelDesc").innerHTML = `<b>${esc(au.displayName)}</b>${Rmau.isRestricted(au) ? " — a <b>restricted</b> management AU; whatever it shields becomes tenant-manageable again." : ""}`;
    $("ruDelConfirm").value = ""; $("ruDelGo").disabled = true;
    $("ruDelModal").classList.add("open");
  }
  $("ruDelConfirm").addEventListener("input", (e) => { $("ruDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE"; });
  $("ruDelCancel").addEventListener("click", () => $("ruDelModal").classList.remove("open"));
  $("ruDelGo").addEventListener("click", async () => {
    if (!ruDeleting) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RU_WRITE])) return;
    const btn = $("ruDelGo"); btn.disabled = true;
    try {
      if (!isDemo) await Graph.gdelete(`/administrativeUnits/${ruDeleting.id}`);
      $("ruDelModal").classList.remove("open");
      toast(`<span>${esc(ruDeleting.displayName)}</span> deleted${isDemo ? " (simulated)" : ""}`);
      await openRmauTool(true);
    } catch (e) { toast(`Delete failed: <span>${esc(e.message || e)}</span>`); btn.disabled = false; }
  });
  $("ruBAOpenTop").addEventListener("click", () => {
    ruBulkAdmin = { open: true, sel: new Set((ruList || []).filter(Rmau.isRestricted).map((a) => a.id)),
      upns: "", role: Rmau.ROLE_TEMPLATES[0].id, busy: false, results: null, log: null };
    renderRmau();
    const el = $("ruBAPanel");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("ruMd").addEventListener("click", async (e) => {
    if (!ruList) return;
    // Read every unit's members and scoped administrators FIRST. The report used
    // to print whatever happened to be cached, which meant a document produced
    // without opening each card was a list of names and GUIDs — the two facts
    // that matter least. What the document is for is who is protected and who
    // may manage them.
    const missing = ruList.filter((au) => !ruDetails[au.id]);
    if (missing.length && !isDemo) {
      const btn = e.target; const label = btn.textContent;
      btn.disabled = true;
      try {
        for (let i = 0; i < missing.length; i++) {
          btn.textContent = `Reading ${i + 1}/${missing.length}…`;
          // Failures are left to ruLoadDetail, which records them on the detail
          // object; one unreadable unit must not cost the whole document.
          await ruLoadDetail(missing[i].id);
        }
      } finally { btn.disabled = false; btn.textContent = label; }
    }
    showReport("🛡 Restricted AUs", "CA-RestrictedAUs", Rmau.toMd(ruList, ruDetails, { tenantName }));
  });

  // ---------- shared fetch-progress visual ----------
  // ONE busy visual for every long read: spinner, message, count-up bar,
  // running count with step and elapsed time. Each tool gets its own instance
  // (prefix scopes the element ids), so two reads running in background tabs
  // never write into each other's panel; the state lives outside the DOM so
  // switching tabs and back re-renders mid-flight.
  function makeProgress(prefix) {
    const st = { n: 0, step: 0, t0: 0, cap: 0, label: "records", stepLabel: "page", capped: false };
    const elapsed = () => { const s = Math.round((Date.now() - st.t0) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
    const line = () => st.step
      ? `${st.n.toLocaleString()} ${st.label} · ${st.stepLabel} ${st.step}${st.cap && st.stepLabel !== "page" ? ` of ${st.cap.toLocaleString()}` : ""} · ${elapsed()}`
      : "Waiting for the first page from Microsoft Graph…";
    const width = () => st.cap ? Math.min(100, (st.stepLabel === "page" ? st.n : st.step) / st.cap * 100) : 0;
    const panel = (msg, note) => `<div class="run-prompt"><div class="spinner"></div>
      <p class="mini muted">${msg}</p>
      <div class="ri-progwrap"><div class="ri-progbar" id="${prefix}PgBar" style="width:${width()}%"></div></div>
      <p class="mini" id="${prefix}PgTxt">${line()}</p>
      ${note ? `<p class="mini muted" style="margin-top:2px">${note}</p>` : ""}</div>`;
    const start = (cap, label, stepLabel) => { st.n = 0; st.step = 0; st.t0 = Date.now(); st.cap = cap || 0; st.label = label || "records"; st.stepLabel = stepLabel || "page"; st.capped = false; };
    const tick = (n, step) => {
      st.n = n; st.step = step != null ? step : st.step + 1;
      const t = $(prefix + "PgTxt"), b = $(prefix + "PgBar");
      if (t) t.textContent = line();
      if (b) b.style.width = width() + "%";
    };
    // Capped, narrated pager — the record cap is also the bar's 100%.
    const fetchAll = async (url, cap, label) => {
      start(cap, label, "page");
      let out = [], next = url;
      while (next && out.length < cap) {
        const j = await Graph.gget(next);
        out = out.concat(j.value || []);
        tick(out.length);
        next = j["@odata.nextLink"] || null;
      }
      st.capped = !!next;
      return out.slice(0, cap);
    };
    return { st, panel, start, tick, fetchAll };
  }

  // The audit range selector stores days; sub-day ranges are fractions (1h = 1/24).
  // Keep one human label for the screen, snapshots and exported reports. The
  // value 1 is deliberately "24 hours": that is the choice the UI offers.
  const auRangeLabel = (d) => {
    const days = Number(d);
    if (!Number.isFinite(days) || days <= 0) return "30 days";
    if (days <= 1) {
      const hours = Math.round(days * 24);
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  // ---------- Change audit (directory audit log) ----------
  const AU_READ = ["AuditLog.Read.All"];
  const AU_MAX = 10000;
  let auRes = null, auFilter = "all", auQuery = "", auDays = 7, auWatch = null, auBusy = false, auView = "summary";
  let auSnap = null;   // { meta, cmp } once a previous export is loaded for comparison
  const auOpen = new Set();
  const auProg = makeProgress("au");
  const auBusyPanel = () => auProg.panel(
    "Reading the audit log… this keeps running if you switch tabs.",
    `The bar runs to the ${AU_MAX.toLocaleString()}-entry cap — Conditional Access changes rarely get near it.`);

  function openAudit() {
    crumb("🕓 Change audit");
    show("screen-audit");
    $("auRescan").style.display = auRes && !auBusy ? "" : "none";
    // A read in flight has to survive navigating away and back, otherwise the
    // Run prompt reappears and it looks like the read was cancelled.
    if (auBusy) { $("auBody").innerHTML = auBusyPanel(); return; }
    if (auRes) { renderAudit(); return; }
    $("auHead").innerHTML = `<h3>🕓 Change audit <span class="tag upd">UPDATED</span></h3>
      <p style="margin-bottom:4px">Who changed which Conditional Access resource, when, and exactly what changed — policies, named locations, authentication strengths and contexts, and terms of use.</p>
      <p class="mini muted" style="margin:0">Reads the Entra <b>directory audit log</b> (AuditLog.Read.All, requested when you run it). Retention is what your licence keeps — about 30 days on Entra ID P1/P2, 7 days otherwise.</p>`;
    $("auChips").innerHTML = "";
    $("auBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-aurun>▶ Read the audit log</button><p class="mini muted">Nothing is written. The result stays until you rescan.</p></div>';
  }
  $("toolAudit").addEventListener("click", () => openAudit());
  $("auRescan").addEventListener("click", () => runAudit());
  $("auDays").addEventListener("change", (e) => { auDays = +e.target.value; if (auRes) runAudit(); });

  async function runAudit() {
    if (auBusy) return;                       // already reading — don't start a second pass
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...AU_READ])) return;
    auBusy = true;
    $("auRescan").style.display = "none";
    $("auBody").innerHTML = auBusyPanel();
    try {
      // The groups every policy includes/excludes — membership changes on these
      // widen or narrow a policy without the policy itself being touched. The
      // audit record carries the group's display name, so ids are enough here.
      const watch = Audit.watchedGroups(policies.map((p) => p.raw));
      const scopes = [...AUTH_CONFIG.scopes, ...AU_READ];
      const [pol, mem] = isDemo
        ? [((typeof DEMO_DATA !== "undefined" && DEMO_DATA.auditRecords) || []), []]
        : await Promise.all([
            auProg.fetchAll(Audit.queryPolicy(auDays), AU_MAX, "audit entries"),
            // only worth asking if any policy actually points at a group
            watch.size ? Graph.ggetAll(Audit.queryMembership(auDays), scopes).catch(() => []) : [],
          ]);
      if (auProg.st.capped) toast(`Audit window truncated at ${AU_MAX.toLocaleString()} entries`);
      auRes = Audit.build([...pol, ...mem], { watch });
      auWatch = watch;
      auOpen.clear();
      auBusy = false;
      $("auRescan").style.display = "";
      renderAudit();
      if (!auRes.total) toast("No Conditional Access changes in this window");
    } catch (e) {
      console.error("Change audit failed:", e);
      auBusy = false;
      $("auBody").innerHTML = `<p class="mini" style="padding:20px;color:var(--off)">Could not read the audit log: ${esc(e.message || e)}<br>
        <span class="muted">This needs AuditLog.Read.All and a reader role such as Reports Reader, Security Reader or Security Administrator.</span></p>
        <div class="run-prompt" style="padding:8px 20px 20px"><button class="btn" data-aurun>Try again</button></div>`;
    } finally { auBusy = false; }
  }
  $("auBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-aurun]")) { runAudit(); return; }
    const s = e.target.closest("[data-ausum]");
    if (s) { const k = "s:" + s.dataset.ausum; auOpen.has(k) ? auOpen.delete(k) : auOpen.add(k); renderAudit(); return; }
    const h = e.target.closest("[data-auid]");
    if (h) { const id = h.dataset.auid; auOpen.has(id) ? auOpen.delete(id) : auOpen.add(id); renderAudit(); }
  });
  $("auViewSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-auview]"); if (!b) return;
    auView = b.dataset.auview; auOpen.clear(); renderAudit();
  });

  // ---- snapshots: export now, compare later ----
  // Nothing is stored server-side and Entra only keeps ~30 days, so an export
  // is the only way to hold history. A later read can be diffed against it.
  $("auJson").addEventListener("click", () => {
    if (!auRes) { toast("Read the audit log first"); return; }
    const payload = Audit.toExport(auRes, {
      tenant: tenantName, days: auDays,
      build: (typeof APP_BUILD !== "undefined" ? APP_BUILD.label : ""),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`CA-ChangeAudit-${(tenantName || "tenant").replace(/[^\w.-]+/g, "-")}-${stamp}`,
      "json", "application/json", JSON.stringify(payload, null, 2));
    toast(`Snapshot of <span>${auRes.total}</span> changes downloaded — compare against it later`);
  });
  $("auCompare").addEventListener("click", () => $("auFile").click());
  $("auFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";                       // let the same file be picked again
    if (!f) return;
    if (!auRes) { toast("Read the audit log first, then compare"); return; }
    try {
      const snap = Audit.fromExport(JSON.parse(await f.text()));
      auSnap = { meta: snap, cmp: Audit.compare(auRes.rows, snap.rows) };
      auFilter = "all"; auOpen.clear();
      renderAudit();
      const c = auSnap.cmp;
      toast(`Compared with ${esc(String(snap.generated).slice(0, 10))} — <span>${c.newSince.length}</span> new since then`);
    } catch (err) {
      console.error("Audit compare failed:", err);
      toast(`Could not load that snapshot: <span>${esc(err.message || err)}</span>`);
    }
  });
  function auClearSnapshot() { auSnap = null; renderAudit(); }
  $("auHead").addEventListener("click", (e) => { if (e.target.closest("[data-auclearsnap]")) auClearSnapshot(); });
  $("auChips").addEventListener("click", (e) => { const b = e.target.closest("[data-auf]"); if (!b) return; auFilter = b.dataset.auf; renderAudit(); });
  $("auSearch").addEventListener("input", (e) => { auQuery = e.target.value; renderAudit(); });

  const auAgo = (iso) => {
    const d = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (d < 1) return `${Math.max(1, Math.round(d * 60))} min ago`;
    if (d < 48) return `${Math.round(d)} h ago`;
    return `${Math.round(d / 24)} d ago`;
  };
  const auVal = (v) => Array.isArray(v) ? v.join(", ") : (v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
  // Records the snapshot has that Entra no longer returns — they fell out of
  // retention, so the snapshot is now the only copy.
  function auAgedHtml() {
    if (!auSnap || !auSnap.cmp.aged.length) return "";
    const a = auSnap.cmp.aged;
    return `<div class="list-card au-card" style="margin-top:12px">
      <div class="au-h" data-auid="aged"><span class="au-act delete">aged out</span>
        <b>${a.length} change${a.length === 1 ? "" : "s"} in the snapshot are no longer in the audit log</b>
        <span class="au-when">retention</span></div>
      <div class="au-sub">Entra has dropped these past its retention window — your export is the only record now. Keep exporting to build history.</div>
      ${auOpen.has("aged") ? `<ul class="wi-list dim" style="margin-top:8px">${a.slice(0, 60).map((x) => `<li>
          <div class="wi-pn">${esc(x.action)} · ${esc(x.target)}</div>
          <div class="wi-why">${esc(new Date(x.when).toLocaleString())} · by ${esc(x.actor && x.actor.name || "?")}</div></li>`).join("")}</ul>
        ${a.length > 60 ? `<p class="mini muted">+${a.length - 60} more in the export file.</p>` : ""}` : ""}
    </div>`;
  }

  function renderAudit() {
    const r = auRes; if (!r) return;
    const K = Audit.KIND;
    $("auHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>🕓 Change audit <span class="tag upd">UPDATED</span></h3>
        <p style="margin-bottom:4px">Every Conditional Access change in the last ${auRangeLabel(auDays)}, newest first — expand one to see the exact fields that moved.</p>
        <p class="mini muted" style="margin:0">From the Entra directory audit log. Retention is licence-bound (≈30 days on P1/P2), so this is a rolling window, not a full history.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${r.total}<span class="mini" style="font-weight:400"> changes</span></div>
        <div class="mini">${Object.entries(r.byAction).map(([k, n]) => `${n} ${k}`).join(" · ") || "—"}</div>
        ${r.failures ? `<div class="mini" style="color:var(--off)">${r.failures} failed</div>` : ""}
      </div></div>
      ${auSnap ? `<div class="va-targetbar">📌 Compared with the snapshot from <b>${esc(String(auSnap.meta.generated).slice(0, 16).replace("T", " "))}</b>
        (${auSnap.meta.count} changes${auSnap.meta.windowDays ? `, ${auRangeLabel(auSnap.meta.windowDays)} window` : ""}) —
        <b>${auSnap.cmp.newSince.length} new</b> since then, ${auSnap.cmp.common} already seen${auSnap.cmp.aged.length ? `, ${auSnap.cmp.aged.length} aged out of the log` : ""}.
        <button class="fchip" data-auclearsnap="1">✕ Clear</button></div>` : ""}`;

    const chips = [["all", `All (${r.total})`],
      ...(auSnap ? [["new", `✨ New since snapshot (${auSnap.cmp.newSince.length})`]] : []),
      ...Object.entries(r.byKind).map(([k, n]) => [k, `${K[k] ? K[k].icon : ""} ${K[k] ? K[k].label : k} (${n})`])];
    $("auChips").innerHTML = chips.map(([k, l]) => `<button class="fchip ${auFilter === k ? "active" : ""}" data-auf="${esc(k)}">${esc(l)}</button>`).join("");

    const q = auQuery.toLowerCase();
    const rows = r.rows.filter((x) => (auFilter === "all" || (auFilter === "new" ? auSnap && auSnap.cmp.newIds.has(x.id) : x.kind === auFilter))
      && (!q || `${x.target} ${x.actor.name} ${x.activity} ${x.changes.map((c) => c.path).join(" ")}`.toLowerCase().includes(q)));
    if (!rows.length) { $("auBody").innerHTML = '<p class="mini" style="padding:20px">No change matches the current filter.</p>'; return; }

    [...$("auViewSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.auview === auView));

    // ---- Summary: one row per resource touched (the readable default) ----
    if (auView === "summary") {
      const sum = Audit.summarize(rows);
      $("auBody").innerHTML = `<div class="list-card"><table class="plist au-sum">
        <thead><tr><th>Resource</th><th style="width:150px">Changes</th><th style="width:120px">People moved</th><th>Changed by</th><th style="width:110px">Last change</th></tr></thead>
        <tbody>${sum.map((s) => {
          const open = auOpen.has("s:" + s.key);
          const K = Audit.KIND[s.kind] || {};
          const detail = open ? `<tr class="au-sumdet"><td colspan="5">
            ${s.kind === "membership" && s.usedBy.length ? `<div class="au-why" style="margin:0 0 8px">This group is used as an <b>${esc(s.usedAs)}</b> on ${s.usedBy.length} polic${s.usedBy.length === 1 ? "y" : "ies"}: ${esc(s.usedBy.slice(0, 6).join(", "))}${s.usedBy.length > 6 ? ` +${s.usedBy.length - 6} more` : ""}</div>` : ""}
            <ul class="wi-list">${s.rows.slice(0, 40).map((x) => `<li>
              <div class="wi-pn"><span class="au-act ${x.action}">${x.action}</span> ${esc(x.member || x.activity)}</div>
              <div class="wi-why">${esc(new Date(x.when).toLocaleString())} · by ${esc(x.actor.name)}${x.actor.ip ? ` from ${esc(x.actor.ip)}` : ""}${x.changeCount && x.kind !== "membership" ? ` · ${x.changeCount} field${x.changeCount === 1 ? "" : "s"}` : ""}</div>
            </li>`).join("")}</ul>
            ${s.rows.length > 40 ? `<p class="mini muted">Showing the 40 most recent of ${s.rows.length} — switch to Timeline and search to see the rest.</p>` : ""}
          </td></tr>` : "";
          return `<tr class="au-sumrow" data-ausum="${esc(s.key)}">
            <td><b>${K.icon || ""} ${esc(s.target)}</b><div class="mini muted">${esc(K.label || s.kind)}${s.usedAs ? ` · ${esc(s.usedAs)} group` : ""}</div></td>
            <td>${s.add ? `<span class="au-n add">+${s.add}</span>` : ""}${s.remove ? `<span class="au-n rem">−${s.remove}</span>` : ""}${s.update ? `<span class="au-n upd">~${s.update}</span>` : ""}</td>
            <td>${s.memberCount ? `${s.memberCount} distinct` : '<span class="muted">—</span>'}</td>
            <td class="mini">${esc(s.actors.slice(0, 2).map(([n, c]) => `${n} (${c})`).join(", "))}${s.actors.length > 2 ? ` +${s.actors.length - 2}` : ""}</td>
            <td class="mini">${esc(auAgo(s.last))}</td>
          </tr>${detail}`;
        }).join("")}</tbody></table></div>
        <p class="mini muted" style="margin-top:8px">${sum.length} resource${sum.length === 1 ? "" : "s"} touched across ${rows.length} change${rows.length === 1 ? "" : "s"} — click a row for the individual events.</p>
        ${auAgedHtml()}`;
      return;
    }

    // ---- Timeline: one card per change (capped, it is a lot on a big tenant) ----
    const CAP = 300;
    const shown = rows.slice(0, CAP);
    $("auBody").innerHTML = (rows.length > CAP
      ? `<p class="mini muted" style="margin-bottom:8px">Showing the ${CAP} most recent of ${rows.length} changes — narrow with the filters or use Summary.</p>` : "")
      + shown.map((x) => {
      const open = auOpen.has(x.id);
      const diff = x.changes.length ? `<div class="au-diff">${x.changes.slice(0, 60).map((c) => `<div>
          <span class="au-op ${c.op}">${c.op}</span>
          <span class="au-path">${esc(c.path || "(value)")}</span>
          ${c.op === "change" ? `<span class="au-from">${esc(auVal(c.from))}</span> → <span class="au-to">${esc(auVal(c.to))}</span>`
            : c.op === "remove" || c.op === "clear" ? `<span class="au-from">${esc(auVal(c.value ?? c.from))}</span>`
            : `<span class="au-to">${esc(auVal(c.value ?? c.to))}</span>`}
        </div>`).join("")}${x.changes.length > 60 ? `<div class="mini muted">+${x.changes.length - 60} more</div>` : ""}</div>`
        : '<div class="au-diff mini muted">No field-level detail recorded for this entry.</div>';
      const isNew = auSnap && auSnap.cmp.newIds.has(x.id);
      return `<div class="list-card au-card${isNew ? " au-new" : ""}">
        <div class="au-h" data-auid="${esc(x.id)}">
          ${isNew ? '<span class="au-act add" title="Not in the loaded snapshot">new</span>' : ""}
          <span class="au-act ${x.action}">${x.action}</span>
          <span>${K[x.kind] ? K[x.kind].icon : ""}</span>
          <b>${esc(x.target)}</b>
          ${x.result && x.result.toLowerCase() !== "success" ? `<span class="tag block">${esc(x.result)}</span>` : ""}
          ${x.changeCount ? `<span class="mini muted">${x.changeCount} field${x.changeCount === 1 ? "" : "s"}</span>` : ""}
          <span class="au-when">${esc(auAgo(x.when))}</span>
        </div>
        <div class="au-sub">${esc(x.activity)} · by <b>${esc(x.actor.name)}</b>${x.actor.upn ? ` (${esc(x.actor.upn)})` : ""}${x.actor.ip ? ` from ${esc(x.actor.ip)}` : ""} · ${esc(new Date(x.when).toLocaleString())}</div>
        ${x.kind === "membership" ? `<div class="au-sub au-why">${x.action === "add" ? "⚠ " : ""}<b>${esc(x.member || "")}</b> ${x.action === "add" ? "gained" : "lost"} whatever this group grants —
          ${x.usedAs === "exclude" ? "it is an <b>exclusion</b> group" : x.usedAs === "include" ? "it is an <b>include</b> group" : "it is used as <b>include and exclude</b>"}
          on ${x.usedBy.length} polic${x.usedBy.length === 1 ? "y" : "ies"}: ${esc(x.usedBy.slice(0, 4).join(", "))}${x.usedBy.length > 4 ? ` +${x.usedBy.length - 4} more` : ""}</div>` : ""}
        ${open ? diff : ""}
      </div>`;
    }).join("") + auAgedHtml();
  }

  $("auMd").addEventListener("click", () => {
    const r = auRes; if (!r) return;
    const L = [`# Conditional Access change audit — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      `- Window: last ${auRangeLabel(auDays)}${r.from ? ` (${String(r.from).slice(0, 10)} → ${String(r.to).slice(0, 10)})` : ""}`,
      `- Changes: **${r.total}** — ${Object.entries(r.byAction).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}`,
      `- Most active: ${r.actors.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ") || "—"}`,
      `- Most changed: ${r.targets.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ") || "—"}`, ""];
    for (const x of r.rows) {
      L.push(`## ${x.action.toUpperCase()} — ${x.target}`, "",
        `- When: ${x.when}`, `- Activity: ${x.activity}`,
        `- By: ${x.actor.name}${x.actor.upn ? ` (${x.actor.upn})` : ""}${x.actor.ip ? ` from ${x.actor.ip}` : ""}`,
        `- Result: ${x.result || "—"}`, "");
      if (x.changes.length) {
        L.push("| Change | Field | Value |", "| --- | --- | --- |");
        x.changes.forEach((c) => L.push(`| ${c.op} | ${String(c.path || "").replace(/\|/g, "\\|")} | ${String(c.op === "change" ? `${auVal(c.from)} → ${auVal(c.to)}` : auVal(c.value ?? c.to ?? c.from)).replace(/\|/g, "\\|")} |`));
        L.push("");
      }
    }
    showReport("🕓 Change audit", "CA-ChangeAudit", L.join("\n"));
  });

  // ---------- Command palette ----------
  // Past twenty-odd tools a tile grid stops being the fastest way in. Ctrl/Cmd+K
  // anywhere, type, Enter. Two sources: every tool in TOOL_TABS, and — once a
  // tenant is loaded — every policy by CA number or name, so "203" lands on the
  // policy card without going through List Policies first.
  let cpItems = [], cpSel = 0;

  // Substring first, then initials ("gap" → "Gap analyse", "boc" → "Best-practice
  // & bypass checks"), so short muscle-memory strings work without a fuzzy
  // library. Score sorts exact-prefix above mid-word above initials.
  function cpScore(hay, q) {
    // Every tool label starts with an emoji, so score against the text after it
    // too — otherwise the start-of-string bonus can never fire and "list" would
    // not rank List Policies above a mid-word match elsewhere.
    const h = String(hay).toLowerCase().replace(/^[^a-z0-9]+/, ""), s = q.toLowerCase();
    if (!s) return 1;
    if (h.startsWith(s)) return 100;
    const i = h.indexOf(s);
    if (i > -1) return 60 - Math.min(i, 30);
    const initials = h.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("");
    if (initials.startsWith(s)) return 40;
    if (initials.includes(s)) return 25;
    return 0;
  }

  function cpBuild(q) {
    const out = [];
    for (const [id, label] of TOOL_TABS) {
      const el = $(id);
      if (!el) continue;                                  // tool not on this build
      const sc = cpScore(label, q);
      if (sc) out.push({ kind: "tool", id, label, hint: "Tool", score: sc });
    }
    // Policies only exist after sign-in; before that the palette is tools only,
    // and the footer says why rather than looking broken.
    for (const p of policies) {
      const sc = Math.max(cpScore(p.name, q), cpScore(p.seq, q));
      if (sc) out.push({ kind: "policy", id: p.id, label: p.name,
        hint: `${p.seq} · ${p.state}`, score: sc });
    }
    return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40);
  }

  function cpRender() {
    $("cpList").innerHTML = cpItems.length
      ? cpItems.map((it, i) => `<div class="cp-item${i === cpSel ? " sel" : ""}" data-cpi="${i}">
          <b>${esc(it.label)}</b><span class="cp-k">${esc(it.hint)}</span></div>`).join("")
      : `<div class="cp-empty">Nothing matches. Tools are always searchable; policies appear once a tenant is loaded.</div>`;
    const sel = $("cpList").querySelector(".cp-item.sel");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  function cpOpen() {
    cpSel = 0; cpItems = cpBuild("");
    $("cpInput").value = "";
    // Say what is searchable right now rather than always promising policies.
    $("cpScopeNote").textContent = policies.length
      ? `${policies.length} policies searchable`
      : "Sign in to search policies";
    $("cpModal").classList.add("open", "cp-open");
    cpRender();
    $("cpInput").focus();
  }
  function cpClose() { $("cpModal").classList.remove("open", "cp-open"); }
  function cpRun(it) {
    if (!it) return;
    cpClose();
    if (it.kind === "tool") { const el = $(it.id); if (el) el.click(); return; }
    showDetail(it.id);
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      $("cpModal").classList.contains("open") ? cpClose() : cpOpen();
      return;
    }
    if (!$("cpModal").classList.contains("open")) return;
    if (e.key === "Escape") { e.preventDefault(); cpClose(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!cpItems.length) return;
      cpSel = (cpSel + (e.key === "ArrowDown" ? 1 : -1) + cpItems.length) % cpItems.length;
      cpRender();
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); cpRun(cpItems[cpSel]); }
  });
  $("cpInput").addEventListener("input", (e) => { cpItems = cpBuild(e.target.value.trim()); cpSel = 0; cpRender(); });
  $("cpList").addEventListener("click", (e) => {
    const it = e.target.closest("[data-cpi]");
    if (it) cpRun(cpItems[+it.dataset.cpi]);
  });
  $("cpModal").addEventListener("click", (e) => { if (e.target.id === "cpModal") cpClose(); });

  // ---------- Drift watch (configuration state vs a snapshot file) ----------
  // Deliberately infrastructure-free: the snapshot is a file the tenant keeps.
  // That is the whole trick — it gives drift history with no database, no
  // scheduled job and no data leaving the browser, and unlike the audit log it
  // never ages out.
  let drNow = null;      // the snapshot just taken from the live tenant
  let drBase = null;     // the snapshot loaded from disk (the "before")
  let drCmp = null;      // the comparison, once both exist
  let drBusy = false;
  const drProg = makeProgress("dr");
  const drOpen = new Set();

  // GUIDs in a diff are unreadable. The policy view models already carry
  // resolved labels for every dependency they reference, so harvest those
  // rather than issuing another round of directory lookups.
  function drNames() {
    const out = {};
    for (const p of policies) for (const d of (p.deps || [])) if (d.id && d.label) out[d.id] = d.label;
    // Administrative units and the groups inside them, so "a member left
    // CAB-SEC-RMAU-ADM-Exclusions" does not read as two GUIDs. The AU list is
    // whatever the Restricted AUs tool last read; the group names come from the
    // policy dependencies above, which already cover every exclusion group.
    for (const a of (ruList || [])) if (a.id && a.displayName) out[a.id] = a.displayName;
    return out;
  }
  async function drRead(url, key) {
    if (isDemo) {
      if (key === "policies") return (typeof DEMO_DATA !== "undefined" && DEMO_DATA.policies) || [];
      if (key === "locations") return (typeof DEMO_DATA !== "undefined" && DEMO_DATA.namedLocations) || [];
      if (key === "adminunits") return (typeof DEMO_DATA !== "undefined" && DEMO_DATA.adminUnits) || [];
      return [];
    }
    return Graph.ggetAll(url);
  }

  function openDrift() { crumb("📉 Drift watch"); show("screen-drift"); renderDrift(); }
  $("toolDrift").addEventListener("click", openDrift);

  async function drTake(thenCompare) {
    if (drBusy) return;
    drBusy = true;
    drProg.start(Drift.AREAS.length, "objects", "area");
    let done = 0;
    $("drBody").innerHTML = drProg.panel("Reading the Conditional Access configuration…");
    try {
      const snap = await Drift.snapshot(drRead,
        { tenant: tenantName, build: APP_BUILD.label, names: drNames() },
        (a) => { drProg.tick(done, ++done); const t = $("drPgTxt"); if (t) t.textContent = `${a.icon} ${a.label}…`; });
      drNow = snap;
      if (thenCompare && drBase) drCmp = Drift.attribute(Drift.compare(drBase, drNow), auRes ? auRes.rows : null);
      return snap;
    } catch (e) {
      $("drBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off)">Reading the configuration failed: ${esc(e.message || e)}</p></div>`;
      return null;
    } finally { drBusy = false; }
  }

  // AdministrativeUnit.Read.All is asked for on the click, once, like every
  // other on-demand scope. Declined, the units simply come back as "not
  // captured" — the snapshot is still worth taking for everything else.
  const DRIFT_SCOPES = [...new Set(Drift.AREAS.flatMap((a) => a.scopes || []))];
  async function drConsent() {
    if (isDemo || !DRIFT_SCOPES.length) return true;
    try { return await preConsent([...AUTH_CONFIG.scopes, ...DRIFT_SCOPES]); }
    catch { return true; }   // never block a snapshot over an optional area
  }

  $("drSnap").addEventListener("click", async () => {
    await drConsent();
    const snap = await drTake(false);
    if (!snap) return;
    const failed = Object.entries(snap.areas).filter(([, v]) => !v.ok);
    downloadText("CA-DriftSnapshot", "json", "application/json", JSON.stringify(snap, null, 2));
    toast(failed.length
      ? `Snapshot saved — ${failed.length} area${failed.length === 1 ? "" : "s"} could not be read and ${failed.length === 1 ? "is" : "are"} marked as not captured.`
      : "Snapshot saved. Keep the file — a later run compares against it.");
    renderDrift();
  });

  $("drLoadBtn").addEventListener("click", () => $("drFile").click());
  $("drFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      drBase = Drift.fromExport(JSON.parse(await f.text()));
    } catch (err) {
      toast(`That snapshot could not be read: ${esc(err.message || err)}`);
      return;
    }
    await drConsent();
    if (!await drTake(false)) return;
    drCmp = Drift.attribute(Drift.compare(drBase, drNow), auRes ? auRes.rows : null);
    renderDrift();
  });

  $("drClear").addEventListener("click", () => { drBase = null; drNow = null; drCmp = null; drOpen.clear(); renderDrift(); });

  $("drMd").addEventListener("click", () => {
    if (!drCmp) { toast("Load a snapshot first — the report is the comparison."); return; }
    showReport("📉 Drift watch", "CA-DriftReport", Drift.markdown(drCmp, { tenant: tenantName, build: APP_BUILD.label }));
  });

  const DR_SEV_CLASS = { critical: "off", high: "warn", medium: "", low: "muted" };
  function drSevChip(sev) {
    const cls = DR_SEV_CLASS[sev] === "off" ? "block" : DR_SEV_CLASS[sev] === "warn" ? "new" : "";
    return `<span class="tag ${cls}">${Drift.SEV_LABEL[sev]}</span>`;
  }

  function renderDrift() {
    $("drHead").innerHTML = `<h3>📉 Drift watch</h3>
      <p class="mini" style="margin:6px 0 0">Snapshot the Conditional Access configuration now, compare a later run against it. The history is a file you keep — no server, no 30-day limit. Take a snapshot today; come back next month and load it.</p>`;

    if (!drCmp) {
      $("drBody").innerHTML = `<div class="list-card dr-card">
        <h4 style="margin:0 0 6px">How this works</h4>
        <ol class="mini">
          <li><b>📸 Take snapshot</b> — reads policies, named locations, authentication strengths and contexts, and downloads them as one JSON file. Store it wherever your review files live.</li>
          <li>Later — days, months, a year — come back and <b>📂 Load snapshot &amp; compare</b>. ${BRANDING.name} re-reads the tenant and reports what moved.</li>
        </ol>
        <p class="mini muted" style="margin:0">Nothing is uploaded and nothing is stored server-side; the file never leaves your machine except where you put it. Changes are ranked by severity — a widened exclusion or a policy switched Off outranks a rename, because that is how protection disappears quietly.</p>
        ${drNow ? `<p class="mini" style="margin:10px 0 0">✅ Snapshot taken ${esc(String(drNow.generated).slice(0, 16).replace("T", " "))} — ${Object.values(drNow.areas).reduce((n, a) => n + a.items.length, 0)} objects captured.</p>` : ""}
      </div>`;
      return;
    }

    const c = drCmp;
    const when = (s) => esc(String(s || "").slice(0, 16).replace("T", " "));
    // Three outcomes, never two: nothing verified, verified-and-clean, drift.
    // Collapsing the first into the second would show a green tick for a run
    // that read nothing — the one lie this tool must not tell.
    // Separate "your old snapshot lacks this" from "the tenant would not give it
    // to us now" — only the second is a problem with the current run.
    const stale = (c.skipped || []).filter((s) => s.staleSnapshot);
    const live = (c.skipped || []).filter((s) => !s.staleSnapshot);
    const caveat = (c.skipped && c.skipped.length)
      ? `${live.length ? `<p class="mini" style="color:var(--off);margin:6px 0 0">Covers only what was read — ${live.length} area${live.length === 1 ? "" : "s"} could not be read now: ${live.map((s) => esc(s.label)).join(", ")}.</p>` : ""}
         ${stale.length ? `<p class="mini muted" style="margin:6px 0 0">${stale.length} area${stale.length === 1 ? " was" : "s were"} missing from the <b>snapshot</b>, not from this run (${stale.map((s) => esc(s.label)).join(", ")}) — take a fresh snapshot and they will be covered from then on.</p>` : ""}`
      : "";
    const head = !c.verified
      ? `<div class="list-card dr-card"><h4 style="margin:0 0 4px">⚠️ Nothing was compared</h4>
          <p class="mini" style="margin:0">No area could be read, so this run proves nothing — it is not a clean bill of health, it is the absence of one. ${c.skipped.map((s) => `<br>${s.icon} <b>${esc(s.label)}</b> — ${esc(s.why)}`).join("")}</p></div>`
      : c.clean
      ? `<div class="list-card dr-card"><h4 style="margin:0 0 4px">✅ No drift</h4>
          <p class="mini" style="margin:0">Every compared object is identical to the snapshot from <b>${when(c.from)}</b>${c.days != null ? ` — ${c.days} day${c.days === 1 ? "" : "s"} ago` : ""}. ${c.totals.unchanged} object${c.totals.unchanged === 1 ? "" : "s"} checked across ${c.comparedAreas} area${c.comparedAreas === 1 ? "" : "s"}.</p>${caveat}</div>`
      : `<div class="list-card dr-card"><h4 style="margin:0 0 4px">Drift since ${when(c.from)} ${drSevChip(c.severity)}</h4>
          <p class="mini" style="margin:0">Compared with the tenant as read just now${c.days != null ? `, ${c.days} day${c.days === 1 ? "" : "s"} apart` : ""} —
          <b>${c.totals.added} added</b>, <b>${c.totals.removed} removed</b>, <b>${c.totals.changed} changed</b>, ${c.totals.unchanged} unchanged.</p>${caveat}
          ${c.attributed ? "" : `<p class="mini muted" style="margin:6px 0 0">Run 🕓 Change audit first and the drift below will name who made each change that is still inside Entra's ~30-day log retention.</p>`}</div>`;

    const rows = [];
    for (const a of c.areas) {
      if (!a.comparable) {
        // A stale snapshot is fixable by the reader; a live failure is not.
        // Colour and wording follow that difference instead of painting both red.
        rows.push(`<div class="list-card dr-card"><h4 style="margin:0 0 4px">${a.icon} ${esc(a.label)} ${a.staleSnapshot ? '<span class="tag">stale snapshot</span>' : '<span class="tag block">not read</span>'}</h4>
          <p class="mini" style="color:var(--${a.staleSnapshot ? "muted" : "off"});margin:0">Not compared — ${esc(a.why)}.</p>
          ${a.staleSnapshot ? `<p class="mini" style="margin:8px 0 0">📸 <b>Take snapshot</b> now and store the new file — comparisons against it will include this area.</p>` : ""}</div>`);
        continue;
      }
      if (!a.added.length && !a.removed.length && !a.changed.length) continue;
      const item = (x, kind) => {
        const key = a.key + ":" + x.id;
        const opened = drOpen.has(key);
        const actor = x.actor ? `<span class="mini muted"> · ${esc(x.actor.who && x.actor.who.name ? x.actor.who.name : x.actor.who)} ${when(x.actor.when)}</span>` : "";
        const body = kind === "changed"
          ? `<div class="gu-tw" style="${opened ? "" : "display:none"}"><table class="mini" style="width:100%">
              <thead><tr><th>Severity</th><th>What</th><th>Change</th></tr></thead><tbody>
              ${x.changes.map((ch) => { const d = Drift.describe(ch, c.names);
                return `<tr><td>${drSevChip(ch.severity)}</td><td>${esc(d.what)}</td><td>${esc(d.how)}: ${esc(d.detail)}</td></tr>`; }).join("")}
              </tbody></table></div>`
          : "";
        return `<div class="dr-row">
          <div class="dr-head">
            ${drSevChip(x.severity)}
            <b>${kind === "added" ? "ADDED" : kind === "removed" ? "REMOVED" : "CHANGED"}</b>
            <span>${esc(x.name)}</span>
            ${x.renamed ? `<span class="mini muted">was “${esc(x.was)}”</span>` : ""}
            ${kind === "changed" ? `<button class="btn mini" data-drtog="${esc(key)}">${opened ? "Hide" : `${x.changes.length} change${x.changes.length === 1 ? "" : "s"}`}</button>` : ""}
            ${actor}
          </div>${body}</div>`;
      };
      rows.push(`<div class="list-card dr-card"><h4 style="margin:0 0 2px">${a.icon} ${esc(a.label)} ${drSevChip(a.severity)}</h4>
        ${a.shapeNote ? `<p class="mini" style="color:var(--off);margin:0 0 6px">⚠️ ${esc(a.shapeNote)}</p>` : ""}
        ${a.removed.map((x) => item(x, "removed")).join("")}
        ${a.added.map((x) => item(x, "added")).join("")}
        ${a.changed.map((x) => item(x, "changed")).join("")}
        <p class="mini muted" style="margin:8px 0 0">${a.unchanged} unchanged.</p></div>`);
    }
    $("drBody").innerHTML = head + rows.join("");
  }

  $("drBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-drtog]");
    if (!b) return;
    const k = b.dataset.drtog;
    if (drOpen.has(k)) drOpen.delete(k); else drOpen.add(k);
    renderDrift();
  });

  // ---------- Baseline usage guide (roadmap R05) ----------
  // The deployment knowledge written down where it can be checked: the steps
  // with their reasons live in js/guide.js as content plus pure check
  // functions; this wiring reads the tenant once on demand, hands the reads
  // to Guide.evaluate, and turns each step's readiness into chips. Reads
  // only — the guide never writes, it points at the tools that do.
  let ugRes = null, ugCtx = null, ugBusy = false;
  const ugOpen = new Set();          // expanded missing-lists, by check key
  const ugProg = makeProgress("ug");
  // Agreement.Read.All is the one read outside the base scopes — asked for on
  // the click like everywhere else; declined, that step reads as "not read"
  // rather than blocking the rest of the guide.
  const UG_TOU_READ = ["Agreement.Read.All"];
  const UG_AREAS = [
    { key: "groups",     icon: "👥", label: "baseline groups" },
    { key: "aus",        icon: "🛡", label: "administrative units" },
    { key: "locations",  icon: "🌐", label: "named locations" },
    { key: "strengths",  icon: "💪", label: "authentication strengths" },
    { key: "contexts",   icon: "🎫", label: "authentication contexts" },
    { key: "agreements", icon: "📜", label: "terms of use" },
    { key: "policies",   icon: "🗂", label: "policies" },
  ];

  async function ugRead(key) {
    if (isDemo) {
      const D = (typeof DEMO_DATA !== "undefined" && DEMO_DATA) || {};
      if (key === "groups")     return Object.keys(D.scopeGroups || {});
      if (key === "aus")        return D.adminUnits || [];
      if (key === "locations")  return D.namedLocations || [];
      if (key === "strengths")  return [];
      if (key === "contexts")   return D.authContexts || [];
      if (key === "agreements") return [];
      if (key === "policies")   return (D.policies || []).map((p) => ({ name: p.displayName, raw: p }));
      return [];
    }
    if (key === "groups")
      return (await Graph.ggetAll("/groups?$filter=startswith(displayName,'CAB-SEC-')&$select=displayName&$top=999")).map((g) => g.displayName);
    if (key === "aus")
      return Graph.ggetAll("/administrativeUnits?$select=id,displayName,isMemberManagementRestricted");
    if (key === "locations")
      return Graph.ggetAll("/identity/conditionalAccess/namedLocations");
    if (key === "strengths")
      return Graph.ggetAll("/policies/authenticationStrengthPolicies");
    if (key === "contexts")
      return Graph.ggetAll("/identity/conditionalAccess/authenticationContextClassReferences");
    if (key === "agreements") {
      // null = not read (no consent / read refused) → the check says "unknown"
      // honestly instead of pretending an empty tenant.
      try {
        if (!await preConsent([...AUTH_CONFIG.scopes, ...UG_TOU_READ])) return null;
        return await Graph.ggetAll("/identityGovernance/termsOfUse/agreements");
      } catch { return null; }
    }
    if (key === "policies")
      return (await Graph.ggetAll("/identity/conditionalAccess/policies")).map((p) => ({ name: p.displayName, raw: p }));
    return [];
  }

  async function ugRun() {
    if (ugBusy) return;
    ugBusy = true;
    ugProg.start(UG_AREAS.length, "objects", "area");
    let done = 0, count = 0;
    $("ugBody").innerHTML = ugProg.panel("Reading the tenant against the baseline…",
      "Groups, restricted units, locations, strengths, contexts, terms of use and policies — reads only, nothing is written.");
    try {
      const ctx = {};
      for (const a of UG_AREAS) {
        const t = $("ugPgTxt"); if (t) t.textContent = `${a.icon} ${a.label}…`;
        try { ctx[a.key] = await ugRead(a.key); }
        catch { ctx[a.key] = a.key === "agreements" ? null : []; }
        count += Array.isArray(ctx[a.key]) ? ctx[a.key].length : 0;
        ugProg.tick(count, ++done);
      }
      ugCtx = ctx;
      ugRes = Guide.evaluate(ctx);
      ugOpen.clear();
    } catch (e) {
      $("ugBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off)">Reading the tenant failed: ${esc(e.message || e)}</p></div>`;
      ugBusy = false;
      return;
    }
    ugBusy = false;
    renderGuide();
  }

  const UG_STATE = {
    ok:      { cls: "ok",    icon: "✅", word: "ready" },
    warn:    { cls: "new",   icon: "⚠️", word: "gaps" },
    missing: { cls: "block", icon: "❌", word: "missing" },
    unknown: { cls: "",      icon: "❔", word: "not read" },
  };
  const ugChip = (r) => {
    const s = UG_STATE[r.state] || UG_STATE.unknown;
    return `<span class="tag ${s.cls}" style="vertical-align:middle">${s.icon} ${esc(r.summary)}</span>`;
  };

  function ugMissingList(key, r) {
    const list = r.missing || [];
    if (!list.length) return "";
    const open = ugOpen.has(key);
    const shown = open ? list : list.slice(0, 8);
    return `<ul class="mini" style="margin:6px 0 0 2px;padding-left:18px">${shown.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      ${list.length > 8 ? `<a href="#" class="mini" data-ugtog="${key}">${open ? "Show fewer" : `Show all ${list.length}`}</a>` : ""}`;
  }

  function renderGuide() {
    $("ugHead").innerHTML = `<h3>📖 Baseline usage guide <span class="tag new">BETA</span></h3>
      <p style="margin-bottom:4px">The deployment order with the <b>reason</b> for each step, not just the sequence — and, once the tenant has been read, a readiness check per step that says what is missing <b>before</b> you run it instead of after.</p>
      <p class="mini muted" style="margin:0">Reads only — nothing is written. Every step links the tool that does the work. The guide ends where <a href="#" class="md-tool" data-tool="toolImpact">🎚 Report-only impact</a> begins.</p>`;
    if (ugBusy) return;   // the run panel owns ugBody until the read finishes

    if (!ugRes) {
      $("ugBody").innerHTML = `<div class="run-prompt">
        <button class="btn primary" data-ugrun>🔎 Read the tenant</button>
        <p class="mini muted">Compares what exists against the baseline catalog — ${Guide.expectedGroups().length} groups, ${Guide.expectedAus().length} restricted units, the dependency objects and the numbered policies. You can also read the steps first; the checks fill in after the read.</p>
      </div>` + ugSteps(false);
      return;
    }
    $("ugBody").innerHTML = ugSteps(true);
  }

  function ugSteps(withChecks) {
    return Guide.STEPS.map((s, i) => {
      const checks = withChecks ? (s.check || []).map((k) => {
        const r = (ugRes || {})[k];
        return r ? `<div style="margin:8px 0 0">${ugChip(r)}${ugMissingList(k, r)}</div>` : "";
      }).join("") : "";
      // Step content that renders from the catalog alone (the persona table)
      // shows before any read — the reading matter is useful without consent.
      const extra = s.render ? (() => {
        try { const rows = s.render(ugCtx || {}); return rows && rows.length ? `<ul class="mini muted" style="margin:8px 0 0 2px;padding-left:18px">${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""; } catch { return ""; }
      })() : "";
      const links = (s.links || []).map(([tool, label]) =>
        `<a href="#" class="md-tool" data-tool="${tool}">${esc(label)}</a>`).join(" · ");
      return `<div class="list-card" style="padding:14px 16px;margin-top:${i ? 12 : 0}px">
        <h4 style="margin:0 0 6px"><span class="rm-ref">Step ${i + 1}</span> ${s.icon} ${esc(s.title)}</h4>
        <p class="mini" style="margin:0">${esc(s.why)}</p>
        ${extra}${checks}
        ${links ? `<p class="mini muted" style="margin:8px 0 0">Do it here: ${links}</p>` : ""}
      </div>`;
    }).join("");
  }

  function openGuide() { crumb("📖 Baseline guide"); show("screen-guide"); renderGuide(); }
  $("toolGuide").addEventListener("click", openGuide);
  $("ugRun").addEventListener("click", ugRun);
  $("ugBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-ugrun]")) { ugRun(); return; }
    const t = e.target.closest("[data-ugtog]");
    if (!t) return;
    e.preventDefault();
    const k = t.dataset.ugtog;
    if (ugOpen.has(k)) ugOpen.delete(k); else ugOpen.add(k);
    renderGuide();
  });
  $("ugMd").addEventListener("click", () => {
    if (!ugRes) { toast("Read the tenant first — the report is the readiness check."); return; }
    showReport("📖 Baseline usage guide", "CA-BaselineReadiness", Guide.toMd(ugRes, { tenantName }));
  });

  // ---------- Compliant-device reality check (roadmap R11) ----------
  // The analysis lives in js/devcheck.js as pure functions; this wiring
  // reads the Intune side on demand (two on-demand scopes), pairs it with
  // the CA policies already in memory, and renders the verdicts. Reads
  // only. The one number that changes what every gap MEANS — the tenant
  // default for devices with no compliance policy — is read from
  // /deviceManagement/settings and shown first, never assumed.
  let dvRes = null, dvBusy = false;
  const dvProg = makeProgress("dv");
  const DV_COMP_READ = ["DeviceManagementConfiguration.Read.All"];
  const DV_APP_READ = ["DeviceManagementApps.Read.All"];
  const DV_AREAS = [
    { key: "comp",     icon: "🖥", label: "compliance policies" },
    { key: "compSC",   icon: "🗂", label: "compliance policies (settings catalog)" },
    { key: "appPols",  icon: "📱", label: "app-protection policies" },
    { key: "settings", icon: "⚙", label: "tenant compliance default" },
  ];

  const DV_DEMO = {
    comp: [
      { "@odata.type": "#microsoft.graph.windows10CompliancePolicy", displayName: "Windows — baseline compliance",
        assignments: [{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }] },
      { "@odata.type": "#microsoft.graph.iosCompliancePolicy", displayName: "iOS compliance (HR pilot)",
        assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-hr" } }] },
    ],
    compSC: [],
    appPols: [
      { platform: "iOS", name: "iOS app protection (HR pilot)",
        assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-hr" } }] },
    ],
    settings: { secureByDefault: false },
  };

  // The list-level $expand=assignments is not reliable: on real tenants it
  // comes back EMPTY for some families (app protections notoriously, and
  // some compliance policies), and an empty answer is indistinguishable
  // from a genuinely unassigned policy. Nothing may be called "assigned to
  // nothing" on that evidence — so any policy whose expand yielded nothing
  // gets its assignments re-read individually before the analysis sees it.
  async function dvFillAssignments(list, base) {
    for (const p of list) {
      if ((p.assignments || []).length) { p.assignmentsKnown = true; continue; }
      if (!p.id) { p.assignmentsKnown = false; continue; }
      try {
        p.assignments = (await Graph.gget(`${base}/${p.id}/assignments`)).value || [];
        p.assignmentsKnown = true; // a successful empty read really is unassigned
      } catch {
        p.assignmentsKnown = false; // unknown is not the same thing as empty
      }
    }
    return list;
  }

  async function dvRead(key) {
    if (isDemo) return DV_DEMO[key];
    if (key === "comp")
      return dvFillAssignments(await Graph.ggetAll("/deviceManagement/deviceCompliancePolicies?$expand=assignments"),
        "/deviceManagement/deviceCompliancePolicies");
    if (key === "compSC") {
      // Settings-catalog compliance is where Linux lives; a tenant that
      // rejects the endpoint (no licence, old cloud) is an empty list,
      // not a failure of the whole run.
      try {
        return await dvFillAssignments(await Graph.ggetAll("/deviceManagement/compliancePolicies?$expand=assignments"),
          "/deviceManagement/compliancePolicies");
      } catch { return []; }
    }
    if (key === "appPols") {
      const fams = [
        ["/deviceAppManagement/iosManagedAppProtections", "iOS"],
        ["/deviceAppManagement/androidManagedAppProtections", "android"],
        ["/deviceAppManagement/windowsManagedAppProtections", "windows"],
      ];
      const out = [];
      for (const [base, platform] of fams) {
        try {
          const list = await dvFillAssignments(await Graph.ggetAll(`${base}?$expand=assignments`), base);
          for (const p of list) out.push({ platform, name: p.displayName || p.name,
            assignments: p.assignments, assignmentsKnown: p.assignmentsKnown });
        } catch { /* family missing on this cloud — the others still count */ }
      }
      return out;
    }
    if (key === "settings") {
      // null = not read; the analysis then says "not read" instead of
      // guessing which way the tenant default points.
      try { return (await Graph.gget("/deviceManagement/settings")) || null; }
      catch { return null; }
    }
    return [];
  }

  async function dvRun() {
    if (dvBusy) return;
    dvBusy = true;
    dvProg.start(DV_AREAS.length, "objects", "area");
    $("dvBody").innerHTML = dvProg.panel("Reading the Intune side of the device grants…",
      "Compliance policies with their assignments, app-protection policies, and the tenant default for devices with no policy — reads only, nothing is written.");
    try {
      if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...DV_COMP_READ, ...DV_APP_READ])) {
        $("dvBody").innerHTML = '<div class="list-card"><p class="mini">Reading Intune needs DeviceManagementConfiguration.Read.All and DeviceManagementApps.Read.All — asked once, on this click. Without them the other half of the device grant stays unreadable.</p></div>';
        dvBusy = false;
        return;
      }
      const ctx = { policies: policies.map((p) => p.raw), names: {} };
      let done = 0, count = 0;
      for (const a of DV_AREAS) {
        const t = $("dvPgTxt"); if (t) t.textContent = `${a.icon} ${a.label}…`;
        ctx[a.key] = await dvRead(a.key);
        count += Array.isArray(ctx[a.key]) ? ctx[a.key].length : 0;
        dvProg.tick(count, ++done);
      }
      // Names for every group id the verdicts may mention — CA includes and
      // Intune assignments both speak in GUIDs.
      const gids = [...new Set([
        ...ctx.policies.flatMap((r) => ((r.conditions || {}).users || {}).includeGroups || []),
        ...[...(ctx.comp || []), ...(ctx.compSC || []), ...(ctx.appPols || [])]
          .flatMap((p) => (p.assignments || []).map((as) => (as.target || {}).groupId).filter(Boolean)),
      ])];
      if (isDemo) { for (const g of gids) ctx.names[g] = (DEMO_DATA.names || {})[g] || g; }
      else {
        for (let i = 0; i < gids.length; i += 900) {
          try {
            const j = await Graph.gpost("/directoryObjects/getByIds", { ids: gids.slice(i, i + 900), types: ["group"] });
            for (const o of j.value || []) ctx.names[o.id] = o.displayName;
          } catch { /* names stay GUIDs — the verdicts still hold */ }
        }
      }
      dvRes = DevCheck.analyze(ctx);
      // Second pass: a DIFFERENT group name does not mean a user is not
      // covered. Where assignment alone left a verdict unproven, expand the
      // memberships of the CA include groups and the Intune-assigned groups
      // (transitive, so nesting counts) and match the actual users. Only
      // runs when something is flagged — a tenant whose assignments already
      // prove everything never pays for it.
      if (!isDemo && dvRes.summary.flagged) {
        const DV_GROUP_CAP = 80;         // groups expanded per run
        const DV_MEMBER_PAGES = 10;      // ~10k members per group
        const all = DevCheck.expandCandidates(ctx);
        const ids = all.slice(0, DV_GROUP_CAP);
        if (ids.length) {
          dvProg.start(ids.length, "members", "group");
          $("dvBody").innerHTML = dvProg.panel("Assignment names could not prove coverage everywhere — matching the members themselves…",
            "A user reached through a differently-named Intune group is still covered; this pass expands the group memberships (nesting included) and matches the users.");
          ctx.members = {};
          let mDone = 0, mCount = 0;
          for (const id of ids) {
            const t = $("dvPgTxt"); if (t) t.textContent = `👥 ${ctx.names[id] || id}…`;
            const rec = { users: [], devices: 0, capped: false };
            try {
              let next = `/groups/${id}/transitiveMembers?$select=id&$top=999`, pages = 0;
              while (next && pages < DV_MEMBER_PAGES) {
                const j = await Graph.gget(next);
                for (const m of j.value || []) {
                  const ty = String(m["@odata.type"] || "");
                  if (ty.endsWith(".user")) rec.users.push(m.id);
                  else if (ty.endsWith(".device")) rec.devices++;
                }
                next = j["@odata.nextLink"] || null;
                pages++;
              }
              rec.capped = !!next;
              // Only a successful read lands in the map — an unreadable
              // group must stay ABSENT, because an empty entry would read
              // as "fetched, zero members" and turn a read failure into a
              // false "none covered". Absent → the verdict falls back to
              // assignment names, which never lies.
              ctx.members[id] = rec;
              mCount += rec.users.length;
            } catch { /* absent on purpose — see above */ }
            dvProg.tick(mCount, ++mDone);
          }
          ctx.memberCap = Math.max(0, all.length - ids.length);
          dvRes = DevCheck.analyze(ctx);
        }
      }
    } catch (e) {
      $("dvBody").innerHTML = `<div class="list-card"><p class="mini" style="color:var(--off)">Reading Intune failed: ${esc(e.message || e)}</p></div>`;
      dvBusy = false;
      return;
    }
    dvBusy = false;
    renderDevCheck();
  }

  const DV_STATE = {
    covered:   { cls: "ok",    word: "covered" },
    partial:   { cls: "new",   word: "not proven" },
    uncovered: { cls: "block", word: "uncovered" },
    na:        { cls: "",      word: "n/a" },
  };
  const dvChip = (v) => `<span class="tag ${DV_STATE[v].cls}">${DevCheck.V_ICON[v]} ${DV_STATE[v].word}</span>`;
  const dvStateTag = (s) => s === "enabled" ? '<span class="tag block">Enforced</span>'
    : s === "enabledForReportingButNotEnforced" ? '<span class="tag new">Report-only</span>' : '<span class="tag">Off</span>';

  function renderDevCheck() {
    $("dvHead").innerHTML = `<h3>🖥 Compliant-device reality check <span class="tag new">NEW</span></h3>
      <p style="margin-bottom:4px">A grant control demanding a compliant device is only worth what Intune's compliance policies are worth — the CA side names <b>who</b> must present a compliant device, the Intune side decides <b>which devices can ever be one</b>, and nothing else checks that the two halves meet. Per CA policy and per platform: is the scope actually assigned a compliance policy? Same check for app-protection behind “require approved client app”.</p>
      <p class="mini muted" style="margin:0">Reads only — Intune compliance and app-protection policies with their assignments, and the tenant default that decides what an uncovered device becomes.</p>`;
    if (dvBusy) return;   // the run panel owns dvBody until the read finishes

    if (!dvRes) {
      $("dvBody").innerHTML = `<div class="run-prompt">
        <button class="btn primary" data-dvrun>▶ Check the coverage</button>
        <p class="mini muted">Pairs the ${policies.length} policies already loaded with the Intune side. Needs DeviceManagementConfiguration.Read.All and DeviceManagementApps.Read.All — asked once, on this click.</p>
      </div>`;
      return;
    }

    const r = dvRes;
    // The tenant default first: it is the difference between "gap = silently
    // unprotected" and "gap = users blocked", and it colours every card below.
    const secure = r.secure === null
      ? `<p class="mini" style="margin:0">⚙ Tenant default for devices with <b>no compliance policy</b>: <b>not read</b> — the verdicts below still hold, but what an uncovered device <i>becomes</i> is unknown.</p>`
      : r.secure
      ? `<p class="mini" style="margin:0">⚙ Tenant default: devices with no compliance policy are marked <b>Not compliant</b>. A coverage gap below surfaces as <b>blocked users</b> — loud, but not silent.</p>`
      : `<p class="mini" style="color:var(--off);margin:0">⚙ Tenant default: devices with no compliance policy are marked <b>COMPLIANT</b>. Every coverage gap below <b>passes the device check silently</b> — this single Intune toggle (Compliance policy settings → “Mark devices with no compliance policy assigned as”) decides what all the gaps mean.</p>`;
    // The verdict words carry the whole result, so they are defined where
    // they are read — not only in Help.
    const legend = `<div class="mini" style="margin:10px 0 0;display:grid;gap:3px">
      <div>${dvChip("covered")} proof found — an All-devices / All-users assignment, the CA include group assigned directly, or every member of the CA scope matched inside assigned groups.</div>
      <div>${dvChip("partial")} Intune policies exist for the platform, but coverage could not be <i>proven</i>: the CA scope cannot be enumerated (All users, guests, roles), only some members matched, the assignment is a device group, or the included group is empty. Not necessarily a gap — the tool refuses to guess.</div>
      <div>${dvChip("uncovered")} a proven gap as far as reads go: no Intune policy exists for the platform, or none of the CA scope's members is in any assigned group. What an uncovered device becomes is the tenant default above.</div>
      <div>${dvChip("na")} the control cannot exist on this platform — approved client app / app protection is an iOS-and-Android mechanism, so demanding it elsewhere can never be satisfied.</div>
    </div>`;
    const head = `<div class="list-card" style="padding:14px 16px">
      ${secure}
      ${legend}
      <p class="mini muted" style="margin:8px 0 0">${r.summary.compCount} compliance polic${r.summary.compCount === 1 ? "y" : "ies"} (${r.summary.perPlat.map((x) => `${esc(x.label)}: ${x.n}`).join(" · ")}) · ${r.summary.appCount} app-protection · ${r.results.length} CA polic${r.results.length === 1 ? "y" : "ies"} using device grants · <b>${r.summary.flagged} flagged</b>${r.summary.membersExpanded ? ` · memberships matched across ${r.summary.membersExpanded} group${r.summary.membersExpanded === 1 ? "" : "s"}${r.summary.memberCap ? ` <span style="color:var(--off)">(${r.summary.memberCap} more not expanded — over the read cap; those verdicts rest on assignment names alone)</span>` : ""}` : ""}</p>
    </div>`;

    if (!r.results.length) {
      $("dvBody").innerHTML = head + `<div class="list-card" style="padding:14px 16px;margin-top:12px"><p class="mini" style="margin:0">No Conditional Access policy grants <b>compliantDevice</b>, <b>approvedApplication</b> or <b>compliantApplication</b> — there is no device-grant coverage to check in this tenant.</p></div>`;
      return;
    }

    $("dvBody").innerHTML = head + r.results.map((p) => `
      <div class="list-card" style="padding:14px 16px;margin-top:12px">
        <h4 style="margin:0 0 6px">${dvChip(p.worst)} <b class="pol-link" data-polid="${esc(p.id || "")}" title="Open the policy card">${esc(p.name)}</b> ${dvStateTag(p.state)}</h4>
        ${p.alt.length ? `<p class="mini muted" style="margin:0 0 6px">OR-alternatives present (${esc(p.alt.join(", "))}) — a user on an uncovered device is not blocked, they simply satisfy the policy <i>without</i> the device check. The gap is in what the policy name promises, not in availability.</p>` : ""}
        ${p.legs.map((leg) => `<p class="mini" style="margin:6px 0 2px"><b>${esc(leg.label)}</b></p>
          <ul class="mini" style="margin:0 0 0 2px;padding-left:18px">
            ${leg.rows.map((row) => `<li>${DevCheck.V_ICON[row.verdict]} <b>${esc(DevCheck.PLAT[row.plat])}</b> — ${esc(row.detail)}${row.via.length ? `<ul class="muted" style="margin:2px 0 4px;padding-left:16px">${row.via.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : ""}</li>`).join("")}
          </ul>`).join("")}
      </div>`).join("");
  }

  function openDevCheck() { crumb("🖥 Device reality check"); show("screen-devcheck"); renderDevCheck(); }
  $("toolDevCheck").addEventListener("click", openDevCheck);
  $("dvRun").addEventListener("click", dvRun);
  $("dvBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-dvrun]")) { dvRun(); return; }
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });
  $("dvMd").addEventListener("click", () => {
    if (!dvRes) { toast("Run the check first — the report is the coverage verdicts."); return; }
    showReport("🖥 Compliant-device reality check", "CA-DeviceRealityCheck", DevCheck.toMd(dvRes, { tenantName }));
  });

  // ---------- Sign-in failures (sign-in log × CA verdicts) ----------
  const SI_READ = ["AuditLog.Read.All"];
  // Report-only failures cannot be filtered server-side (the sign-in itself
  // succeeds), so that mode reads the whole window. This cap keeps a busy
  // tenant from turning the read into a half-hour of paging.
  const SI_MAX = 10000;
  // ---------- one sign-in window, two tools ----------
  // 🚦 Sign-in failures in REPORT-ONLY mode and 🎚 Report-only impact issue the
  // byte-for-byte same Graph read: the whole window, unfiltered, because
  // report-only verdicts cannot be filtered server-side. On a real tenant that
  // is ten thousand records and minutes of waiting, and doing it twice because
  // the reader switched tools is a cost with nothing behind it.
  //
  // Shared ONLY where the query is identical. Enforced mode adds
  // conditionalAccessStatus eq 'failure' server-side, so it keeps its own read
  // — serving it from this cache would mean filtering 10k records client-side
  // to answer a question Graph already answers cheaply.
  //
  // The cap travels with the records. A truncated window is a different fact
  // from a complete one, and a tool that inherited the rows without inheriting
  // "this was cut short" would overstate what it knows.
  let logCache = null;   // { days, records, capped, at }
  const LOG_CACHE_MAX_AGE = 10 * 60 * 1000;   // beyond this, offer it but say so

  function logCacheAge() { return logCache ? Date.now() - logCache.at : Infinity; }
  function logCacheUsable(days) { return !!logCache && logCache.days === days; }

  // force: a Rescan means the reader wants the tenant re-read, not our copy.
  async function readSignInWindow(days, prog, force) {
    if (!force && logCacheUsable(days)) return { ...logCache, reused: true };
    const records = await prog.fetchAll(ReportImpact.query(days), SI_MAX, "sign-ins");
    logCache = { days, records, capped: !!prog.st.capped, at: Date.now() };
    return { ...logCache, reused: false };
  }
  const logAgeLabel = () => {
    const m = Math.round(logCacheAge() / 60000);
    return m < 1 ? "just now" : m === 1 ? "a minute ago" : `${m} minutes ago`;
  };

  let siRes = null, siFilter = "all", siQuery = "", siDays = 7, siMode = "enforced", siView = "signins";
  // The range selects carry days; sub-day ranges are fractions (1h = 1/24).
  // One label helper for every place the window is written out.
  const rangeLabel = (d) => d >= 1
    ? `${d} day${d === 1 ? "" : "s"}`
    : `${Math.round(d * 24)} hour${Math.round(d * 24) === 1 ? "" : "s"}`;

  // Type-ahead for the search box. Two sources, because both are useful at
  // different moments: once a scan has run, the users and apps that actually
  // appear in the result are the only ones worth typing — and before it has,
  // the directory is all there is. Merged, result first.
  let siSugTimer = null;
  function siSuggestFromResult() {
    if (!siRes || !siRes.rows) return [];
    const users = new Set(), apps = new Set();
    siRes.rows.forEach((r) => {
      (r.signins || [r]).forEach((x) => { if (x.upn) users.add(x.upn); if (x.app) apps.add(x.app); });
    });
    return [...users].slice(0, 40).map((u) => ({ v: u, l: "in this result" }))
      .concat([...apps].slice(0, 20).map((a) => ({ v: a, l: "app in this result" })));
  }
  function siFillSuggest(extra) {
    const dl = $("siSearchList"); if (!dl) return;
    const seen = new Set(); const out = [];
    [...siSuggestFromResult(), ...(extra || [])].forEach((o) => {
      const k = String(o.v || "").toLowerCase();
      if (!o.v || seen.has(k)) return;
      seen.add(k); out.push(`<option value="${esc(o.v)}" label="${esc(o.l || "")}"></option>`);
    });
    dl.innerHTML = out.join("");
  }
  $("siSearch").addEventListener("focus", () => siFillSuggest());
  $("siSearch").addEventListener("input", (e) => {
    const v = e.target.value; clearTimeout(siSugTimer);
    siSugTimer = setTimeout(async () => {
      const t = v.trim();
      if (isDemo || t.length < 2) { siFillSuggest(); return; }
      try {
        const f = t.replace(/'/g, "''");
        const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
        siFillSuggest(((r && r.value) || []).map((u) => ({ v: u.userPrincipalName, l: u.displayName || "" })));
      } catch (err) { console.warn("sign-ins: suggest failed", err.message); }
    }, 250);
  });
  let siBusy = false, siCapped = false;
  const siOpen = new Set();
  const siProg = makeProgress("si");
  const siBusyPanel = () => siProg.panel(
    "Reading the sign-in log… this keeps running if you switch tabs.",
    siMode === "reportonly"
      ? `The bar runs to the ${SI_MAX.toLocaleString()}-sign-in cap — report-only failures cannot be server-filtered, so the whole window is read.`
      : "Enforced failures are server-filtered, so this read is usually quick.");
  const siModeLabel = () => siMode === "reportonly" ? "report-only failures" : "enforced failures";

  function openSignins() {
    crumb("🚦 Sign-in failures");
    show("screen-signins");
    $("siRescan").style.display = siRes && !siBusy ? "" : "none";
    if (siBusy) { $("siBody").innerHTML = siBusyPanel(); return; }
    if (siRes) { renderSignins(); return; }
    $("siHead").innerHTML = `<h3>🚦 Sign-in failures</h3>
      <p style="margin-bottom:4px">Which sign-ins Conditional Access failed, and which policy did it — per policy: who, on which app, from where, with the controls that weren't met. The log-side counterpart of What-If.</p>
      <p class="mini muted" style="margin:0">Reads the Entra <b>sign-in log</b> (AuditLog.Read.All, requested when you run it). Retention is what your licence keeps — about 30 days on Entra ID P1/P2, 7 days otherwise. <b>Enforced</b> failures are filtered by Graph; <b>report-only</b> failures require reading the whole window, so that mode is capped at ${SI_MAX.toLocaleString()} sign-ins — and shared with <b>🎚 Report-only impact</b>, which reads exactly the same window.</p>
        ${siReused ? `<p class="mini muted" style="margin:6px 0 0">↺ Reused the sign-in window <b>🎚 Report-only impact</b> read ${logAgeLabel()} — same query, so it was not read twice. <b>⟳ Rescan</b> re-reads the tenant.</p>` : ""}`;
    $("siChips").innerHTML = "";
    $("siBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-sirun>▶ Read the sign-in log</button><p class="mini muted">Nothing is written. The result stays until you rescan.</p></div>';
  }
  $("toolSignins").addEventListener("click", () => openSignins());
  $("siRescan").addEventListener("click", () => runSignins(true));
  $("siDays").addEventListener("change", (e) => { siDays = +e.target.value; if (siRes) runSignins(); });
  $("siModeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-simode]"); if (!b) return;
    if (siMode === b.dataset.simode) return;
    siMode = b.dataset.simode;
    [...$("siModeSeg").children].forEach((x) => x.classList.toggle("active", x.dataset.simode === siMode));
    if (siRes || siBusy) runSignins(); else openSignins();
  });

  // The capped pager lives in siProg (shared fetch-progress visual).

  let siReused = false;
  async function runSignins(force) {
    if (siBusy) return;                       // already reading — don't start a second pass
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...SI_READ])) return;
    siBusy = true; siCapped = false;
    $("siRescan").style.display = "none";
    $("siBody").innerHTML = siBusyPanel();
    try {
      let records, reused = false;
      if (isDemo) {
        records = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.signIns) || [];
      } else if (siMode === "reportonly") {
        // Same window, same query as 🎚 Report-only impact.
        const w = await readSignInWindow(siDays, siProg, force);
        records = w.records; siCapped = w.capped; reused = w.reused;
      } else {
        records = await siProg.fetchAll(Signins.query(siDays, siMode), SI_MAX, "sign-ins");
        siCapped = siProg.st.capped;
      }
      siReused = reused;
      siRes = Signins.build(records, siMode);
      siOpen.clear(); siFilter = "all";
      siBusy = false;
      $("siRescan").style.display = "";
      renderSignins();
      if (!siRes.total) toast(`No Conditional Access ${siModeLabel()} in this window`);
    } catch (e) {
      console.error("Sign-in failures read failed:", e);
      siBusy = false;
      $("siBody").innerHTML = `<p class="mini" style="padding:20px;color:var(--off)">Could not read the sign-in log: ${esc(e.message || e)}<br>
        <span class="muted">This needs AuditLog.Read.All and a reader role such as Reports Reader, Security Reader or Security Administrator. The sign-in log also needs an Entra ID P1/P2 licence.</span></p>
        <div class="run-prompt" style="padding:8px 20px 20px"><button class="btn" data-sirun>Try again</button></div>`;
    } finally { siBusy = false; }
  }

  // ---- replay a logged sign-in in What-If --------------------------------
  // The log says which policy failed; What-If says why. Prefill the scenario
  // from the record so the two tools answer the same question about the same
  // sign-in.
  const siPlatform = (os) => {
    const t = String(os || "").toLowerCase();
    if (t.includes("windows phone")) return "windowsPhone";
    if (t.includes("windows")) return "windows";
    if (t.includes("mac")) return "macOS";
    if (t.includes("ios")) return "iOS";
    if (t.includes("android")) return "android";
    if (t.includes("linux")) return "linux";
    return "";
  };
  const siClient = (c) => {
    const t = String(c || "").toLowerCase();
    if (t.includes("browser")) return "browser";
    if (t.includes("mobile apps and desktop")) return "mobileAppsAndDesktopClients";
    if (t.includes("activesync")) return "exchangeActiveSync";
    if (t) return "other";                     // IMAP, POP, SMTP, "Other clients"…
    return "browser";
  };
  function siReplay(row) {
    $("wiUser").value = row.upn || row.user;
    const appOpt = [...$("wiApp").options].find((o) => o.value === row.appId);
    if (appOpt) { $("wiApp").value = row.appId; $("wiAppIdWrap").style.display = "none"; }
    else { $("wiApp").value = "custom"; $("wiAppId").value = row.appId || ""; $("wiAppIdWrap").style.display = ""; }
    const plat = siPlatform(row.os); if (plat) $("wiPlatform").value = plat;
    $("wiClient").value = siClient(row.client);
    $("wiIp").value = row.ip || "";
    $("wiCountry").value = row.country || "";
    $("wiDevice").value = row.compliant ? "compliant" : /hybrid/i.test(row.trustType) ? "hybrid" : row.os ? "unmanaged" : "";
    $("wiSignInRisk").value = ["none", "low", "medium", "high"].includes(row.signInRisk) ? row.signInRisk : "";
    $("toolWhatIf").click();
    toast("Scenario prefilled from the sign-in — press <span>Evaluate</span>");
  }

  $("siBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-sirun]")) { runSignins(); return; }
    // The policy name opens its card, same as everywhere else. It sits inside
    // the collapsible row / sticky label, so it has to be checked before the
    // toggle handlers or the click just expands and collapses.
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { showDetail(pl.dataset.polid); return; }
    const rp = e.target.closest("[data-sireplay]");
    if (rp) { const row = siRes && siRes.rows.find((x) => x.id === rp.dataset.sireplay); if (row) siReplay(row); return; }
    const s = e.target.closest("[data-sisum]");
    if (s) { const k = "p:" + s.dataset.sisum; siOpen.has(k) ? siOpen.delete(k) : siOpen.add(k); renderSignins(); return; }
    const h = e.target.closest("[data-siid]");
    if (h) { const id = h.dataset.siid; siOpen.has(id) ? siOpen.delete(id) : siOpen.add(id); renderSignins(); }
  });
  $("siViewSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-siview]"); if (!b) return;
    siView = b.dataset.siview; renderSignins();
  });
  $("siChips").addEventListener("click", (e) => { const b = e.target.closest("[data-sif]"); if (!b) return; siFilter = b.dataset.sif; renderSignins(); });
  $("siSearch").addEventListener("input", (e) => { siQuery = e.target.value; renderSignins(); });

  const siWhere = (r) => [r.city, r.country].filter(Boolean).join(", ");
  const siDevice = (r) => r.compliant ? "compliant" : /hybrid/i.test(r.trustType) ? "hybrid joined" : r.os ? "unmanaged" : "";

  // An expanded policy can hold 40 sign-ins — scrolling through them pushes the
  // policy's own table row off screen and you lose track of what you're reading.
  // A sticky label inside the detail keeps the policy name pinned just below the
  // toolbar. The toolbar wraps to more rows on narrow screens, so its real
  // height is measured (same approach as the List screen's action bar).
  function syncSiDetheadTop() {
    const tb = $("siToolbar");
    if (!tb) return;
    document.documentElement.style.setProperty("--si-dethead-top", (stickyNavTop() + Math.round(tb.getBoundingClientRect().height)) + "px");
  }
  window.addEventListener("resize", syncSiDetheadTop);

  function renderSignins() {
    const r = siRes; if (!r) return;
    (window.requestAnimationFrame || setTimeout)(syncSiDetheadTop);
    $("siHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>🚦 Sign-in failures</h3>
        <p style="margin-bottom:4px">Sign-ins with a Conditional Access <b>${siMode === "reportonly" ? "report-only failure" : "failure"}</b> in the window, newest first — grouped per policy, so the policy generating the noise sits on top.</p>
        <p class="mini muted" style="margin:0">${siMode === "reportonly"
          ? "Report-only: the sign-in itself completed, but these policies <b>would have failed it</b> if enforced — the numbers to check before flipping a policy on."
          : "Enforced: the user did not satisfy the policy's controls — the sign-in was blocked or interrupted. An abandoned MFA prompt lands here too, so a failure is a prompt to look, not proof the policy is wrong."}</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${r.total}<span class="mini" style="font-weight:400"> sign-ins</span></div>
        <div class="mini">${r.policies.length} polic${r.policies.length === 1 ? "y" : "ies"} · ${r.users.length} user${r.users.length === 1 ? "" : "s"} · ${r.apps.length} app${r.apps.length === 1 ? "" : "s"}</div>
        ${siCapped ? `<div class="mini" style="color:var(--off)">window truncated at ${SI_MAX.toLocaleString()} sign-ins</div>` : ""}
      </div></div>`;

    const chips = [["all", `All (${r.total})`],
      ...r.policies.slice(0, 8).map((p) => [p.key, `${p.name.length > 34 ? p.name.slice(0, 32) + "…" : p.name} (${p.count})`])];
    $("siChips").innerHTML = chips.map(([k, l]) => `<button class="fchip ${siFilter === k ? "active" : ""}" data-sif="${esc(k)}">${esc(l)}</button>`).join("");

    const q = siQuery.toLowerCase();
    const match = (x) => (siFilter === "all" || x.policies.some((p) => (p.id || p.name) === siFilter))
      && (!q || `${x.user} ${x.upn} ${x.app} ${x.ip} ${x.country} ${x.city} ${x.client} ${x.os} ${x.policies.map((p) => p.name).join(" ")}`.toLowerCase().includes(q));
    const rows = r.rows.filter(match);
    if (!rows.length) { $("siBody").innerHTML = '<p class="mini" style="padding:20px">No sign-in matches the current filter.</p>'; return; }

    [...$("siViewSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.siview === siView));

    // ---- Per policy: one row per failing policy (the readable default) ----
    if (siView === "policies") {
      const pols = r.policies
        .map((p) => ({ ...p, rows: p.rows.filter(match) }))
        .filter((p) => p.rows.length && (siFilter === "all" || p.key === siFilter));
      $("siBody").innerHTML = `<div class="list-card si-stickyhost"><table class="plist au-sum">
        <thead><tr><th>Policy</th><th style="width:110px">Failures</th><th style="width:100px">Users</th><th>Most affected</th><th>Controls not met</th><th style="width:110px">Last failure</th></tr></thead>
        <tbody>${pols.map((p) => {
          const open = siOpen.has("p:" + p.key);
          const detail = open ? `<tr class="au-sumdet"><td colspan="6">
            <div class="si-dethead">🚦 <b class="pol-link" data-polid="${esc(p.id || "")}" title="Open the policy card">${esc(p.name)}</b><span class="mini muted">${p.rows.length} sign-in${p.rows.length === 1 ? "" : "s"}${siMode === "reportonly" ? " · report-only" : ""}${p.controls.length ? ` · ${esc(p.controls.join(", "))}` : ""}</span><button class="fchip" data-sisum="${esc(p.key)}" title="Collapse this policy">✕</button></div>
            <ul class="wi-list">${p.rows.slice(0, 40).map((x) => `<li>
              <div class="wi-pn">${esc(x.user)}${x.upn && x.upn !== x.user ? ` <span class="mini muted">(${esc(x.upn)})</span>` : ""} → <b>${esc(x.app)}</b>
                <button class="fchip" data-sireplay="${esc(x.id)}" title="Prefill What-If with this sign-in">🧪 Replay</button></div>
              <div class="wi-why">${esc(new Date(x.when).toLocaleString())} · ${esc([x.client, x.os, siWhere(x), x.ip, siDevice(x)].filter(Boolean).join(" · "))}${x.failureReason ? ` · ${esc(x.failureReason)}` : ""}</div>
            </li>`).join("")}</ul>
            ${p.rows.length > 40 ? `<p class="mini muted">Showing the 40 most recent of ${p.rows.length} — switch to Sign-ins and search to see the rest.</p>` : ""}
          </td></tr>` : "";
          return `<tr class="au-sumrow" data-sisum="${esc(p.key)}">
            <td><b class="pol-link" data-polid="${esc(p.id || "")}" title="Open the policy card">${esc(p.name)}</b>${siMode === "reportonly" ? '<div class="mini muted">report-only</div>' : ""}</td>
            <td><span class="au-n rem">${p.count}</span></td>
            <td>${p.userCount} distinct</td>
            <td class="mini">${esc(p.users.slice(0, 2).map(([n, c]) => `${n} (${c})`).join(", "))}${p.users.length > 2 ? ` +${p.users.length - 2}` : ""}</td>
            <td class="mini">${esc(p.controls.join(", ") || "—")}</td>
            <td class="mini">${esc(auAgo(p.last))}</td>
          </tr>${detail}`;
        }).join("")}</tbody></table></div>
        <p class="mini muted" style="margin-top:8px">${pols.length} polic${pols.length === 1 ? "y" : "ies"} across ${rows.length} failed sign-in${rows.length === 1 ? "" : "s"} — click a row for the individual sign-ins, 🧪 to replay one in What-If.</p>`;
      return;
    }

    // ---- Sign-ins: one card per failed sign-in (capped, newest first) ----
    const CAP = 300;
    const shown = rows.slice(0, CAP);
    $("siBody").innerHTML = (rows.length > CAP
      ? `<p class="mini muted" style="margin-bottom:8px">Showing the ${CAP} most recent of ${rows.length} sign-ins — narrow with the filters or use Per policy.</p>` : "")
      + shown.map((x) => {
      const open = siOpen.has(x.id);
      const detail = open ? `<div class="au-diff">
          ${x.policies.map((p) => `<div><span class="au-op remove">failed</span> <span class="au-path pol-link" data-polid="${esc(p.id || "")}" title="Open the policy card">${esc(p.name)}</span>${p.controls.length ? ` <span class="au-to">${esc(p.controls.join(", "))}</span>` : ""}</div>`).join("")}
          ${x.failureReason ? `<div><span class="au-op change">reason</span> <span class="au-path">${esc(x.failureReason)}${x.errorCode ? ` (${esc(String(x.errorCode))})` : ""}</span></div>` : ""}
          ${x.browser ? `<div><span class="au-op set">client</span> <span class="au-path">${esc([x.browser, x.os].filter(Boolean).join(" on "))}</span></div>` : ""}
          ${x.signInRisk && x.signInRisk !== "none" && x.signInRisk !== "hidden" ? `<div><span class="au-op change">risk</span> <span class="au-path">${esc(x.signInRisk)}</span></div>` : ""}
        </div>` : "";
      return `<div class="list-card au-card">
        <div class="au-h" data-siid="${esc(x.id)}">
          <span class="au-act delete">${siMode === "reportonly" ? "would fail" : "failed"}</span>
          <b>${esc(x.user)}</b> <span class="muted">→</span> <span>${esc(x.app)}</span>
          <span class="mini muted">${esc(x.policies.map((p) => p.name).slice(0, 2).join(", "))}${x.policies.length > 2 ? ` +${x.policies.length - 2}` : ""}</span>
          <button class="fchip" data-sireplay="${esc(x.id)}" title="Prefill What-If with this sign-in">🧪</button>
          <span class="au-when">${esc(auAgo(x.when))}</span>
        </div>
        <div class="au-sub">${esc([x.upn !== x.user ? x.upn : "", x.client, x.os, siWhere(x), x.ip, siDevice(x)].filter(Boolean).join(" · "))} · ${esc(new Date(x.when).toLocaleString())}</div>
        ${detail}
      </div>`;
    }).join("");
  }

  $("siCsv").addEventListener("click", () => {
    const r = siRes; if (!r) return;
    downloadText("CA-SignInFailures", "csv", "text/csv", Signins.toCsv(r.rows));
    toast(`CSV <span>downloaded</span> — one line per sign-in × failing policy`);
  });
  $("siMd").addEventListener("click", () => {
    const r = siRes; if (!r) return;
    const L = [`# Conditional Access sign-in failures — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      `- Window: last ${rangeLabel(siDays)}${r.from ? ` (${String(r.from).slice(0, 10)} → ${String(r.to).slice(0, 10)})` : ""} — ${siModeLabel()}${siCapped ? `, truncated at ${SI_MAX} sign-ins` : ""}`,
      `- Sign-ins: **${r.total}** across ${r.policies.length} policies`,
      `- Most affected users: ${r.users.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ") || "—"}`,
      `- Most affected apps: ${r.apps.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ") || "—"}`, ""];
    for (const p of r.policies) {
      L.push(`## ${p.name}`, "",
        `- Failures: **${p.count}** — ${p.userCount} distinct users, ${p.appCount} apps`,
        `- Controls not met: ${p.controls.join(", ") || "—"}`,
        `- Last failure: ${p.last}`, "",
        "| When | User | App | Client | Location | IP | Device |", "| --- | --- | --- | --- | --- | --- | --- |");
      p.rows.slice(0, 100).forEach((x) => L.push(`| ${String(x.when).replace("T", " ").slice(0, 19)} | ${x.user} | ${x.app} | ${x.client} | ${siWhere(x)} | ${x.ip} | ${siDevice(x) || "—"} |`));
      if (p.rows.length > 100) L.push("", `_+${p.rows.length - 100} more — use the CSV export for the full set._`);
      L.push("");
    }
    showReport("🚦 Sign-in failures", "CA-SignInFailures", L.join("\n"));
  });

  // ---------- Report-only impact ----------
  // The go-live question, answered from the sign-in log: for every policy in
  // report-only, who would be denied, who just gets a prompt, who passes
  // unchanged — and per user, the combined effect of everything staged.
  // Reads the same log as Sign-in failures but keeps ALL report-only
  // verdicts (success/interrupted/failure/notApplied), because the safe
  // answer needs the denominator, not just the failures.
  let riRes = null, riDays = 7, riView = "policies", riQuery = "", riFilter = "all";
  let riBusy = false, riCapped = false;
  const riOpen = new Set();
  // Same shared fetch-progress visual as Sign-in failures and Change audit.
  const riProg = makeProgress("ri");
  const riBusyPanel = () => riProg.panel(
    "Reading the sign-in log — report-only verdicts cannot be server-filtered, so the whole window is read page by page. A large tenant takes a while; this keeps running if you switch tabs.",
    `The bar runs to the ${SI_MAX.toLocaleString()}-sign-in cap — most tenants finish well before the end of it.`);

  // The tenant's report-only policies from the list already in memory — so a
  // staged policy with zero traffic still shows up, as "no data".
  const riTenantRo = () => (policies || [])
    .filter((p) => p.state === "enabledForReportingButNotEnforced")
    .map((p) => ({ id: p.id, name: p.name }));

  function openImpact() {
    crumb("🎚 Report-only impact");
    show("screen-impact");
    $("riRescan").style.display = riRes && !riBusy ? "" : "none";
    if (riBusy) { $("riBody").innerHTML = riBusyPanel(); return; }
    if (riRes) { renderImpact(); return; }
    const ro = riTenantRo();
    $("riHead").innerHTML = `<h3>🎚 Report-only impact</h3>
      <p style="margin-bottom:4px">What happens the day a report-only policy goes live. Per policy: who would be <b>denied</b>, who is <b>interrupted</b> for an extra step (MFA, compliant device, terms of use…), who <b>passes unchanged</b>. Per user: the combined effect of everything in report-only at once.</p>
      <p class="mini muted" style="margin:0">Reads the Entra <b>sign-in log</b> (AuditLog.Read.All, requested when you run it). Report-only verdicts cannot be filtered by Graph, so the whole window is read — capped at ${SI_MAX.toLocaleString()} sign-ins. Retention is what your licence keeps — about 30 days on Entra ID P1/P2.${ro.length ? ` This tenant currently has <b>${ro.length}</b> report-only polic${ro.length === 1 ? "y" : "ies"}.` : ""}</p>`;
    $("riChips").innerHTML = "";
    $("riBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-rirun>▶ Read the sign-in log</button><p class="mini muted">Nothing is written. The result stays until you rescan.</p></div>';
  }
  $("toolImpact").addEventListener("click", () => openImpact());
  $("riRescan").addEventListener("click", () => runImpact(true));
  $("riDays").addEventListener("change", (e) => { riDays = +e.target.value; if (riRes) runImpact(); });

  let riReused = false;
  async function runImpact(force) {
    if (riBusy) return;
    if (!isDemo && !await preConsent([...AUTH_CONFIG.scopes, ...SI_READ])) return;
    riBusy = true; riCapped = false;
    $("riRescan").style.display = "none";
    $("riBody").innerHTML = riBusyPanel();
    try {
      let records, reused = false;
      if (isDemo) {
        records = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.signIns) || [];
      } else {
        const w = await readSignInWindow(riDays, riProg, force);
        records = w.records; riCapped = w.capped; reused = w.reused;
      }
      riReused = reused;
      riRes = ReportImpact.build(records, riTenantRo());
      riOpen.clear(); riFilter = "all";
      riBusy = false;
      $("riRescan").style.display = "";
      renderImpact();
      if (!riRes.policies.length) toast("No report-only policy was evaluated in this window");
    } catch (e) {
      console.error("Report-only impact read failed:", e);
      riBusy = false;
      $("riBody").innerHTML = `<p class="mini" style="padding:20px;color:var(--off)">Could not read the sign-in log: ${esc(e.message || e)}<br>
        <span class="muted">This needs AuditLog.Read.All and a reader role such as Reports Reader, Security Reader or Security Administrator. The sign-in log also needs an Entra ID P1/P2 licence.</span></p>
        <div class="run-prompt" style="padding:8px 20px 20px"><button class="btn" data-rirun>Try again</button></div>`;
    } finally { riBusy = false; }
  }

  const RI_V = {
    block:  ["🔴", "would block users", "At least one sign-in would have been denied"],
    prompt: ["🟡", "prompts only", "Nobody denied — users interrupted for a control they can satisfy"],
    clean:  ["🟢", "no change", "Every applying sign-in already satisfies it"],
    scoped: ["⚪", "never in scope", "Evaluated, but no sign-in fell inside its assignments"],
    nodata: ["⚪", "no data", "No evaluation in this window — no evidence either way"],
  };
  const riBar = (p) => {
    const t = p.evaluated + p.notApplied || 1;
    const seg = (n, cls, lab) => n ? `<span class="ri-seg ${cls}" style="flex:${n}" title="${esc(lab)}: ${n.toLocaleString()}"></span>` : "";
    return `<div class="ri-bar">${seg(p.failure, "bad", "would deny")}${seg(p.interrupted, "warn", "interrupted")}${seg(p.success, "ok", "pass unchanged")}${seg(p.notApplied, "na", "out of scope")}<span style="flex:${t ? 0 : 1}"></span></div>`;
  };

  function renderImpact() {
    const r = riRes; if (!r) return;
    $("riHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>🎚 Report-only impact</h3>
        <p style="margin-bottom:4px">The go-live forecast for the last ${rangeLabel(riDays)}: <b>${r.counts.block}</b> polic${r.counts.block === 1 ? "y" : "ies"} would block users, <b>${r.counts.prompt}</b> add prompts only, <b>${r.counts.clean}</b> change nothing, <b>${r.counts.scoped + r.counts.nodata}</b> without evidence.</p>
        ${riReused ? `<p class="mini muted" style="margin:0 0 4px">↺ Reused the sign-in window <b>🚦 Sign-in failures</b> read ${logAgeLabel()} — same query, so it was not read twice. <b>⟳ Rescan</b> re-reads the tenant.</p>` : ""}
        <p class="mini muted" style="margin:0">Across everything in report-only: <b>${r.blockedUsers}</b> user${r.blockedUsers === 1 ? "" : "s"} would be locked out of something, <b>${r.promptedUsers}</b> get new prompts. A verdict is only as good as the window — ${r.records.toLocaleString()} sign-ins read${riCapped ? `, <span style="color:var(--off)">truncated at ${SI_MAX.toLocaleString()}</span>` : ""}.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${r.policies.length}<span class="mini" style="font-weight:400"> report-only polic${r.policies.length === 1 ? "y" : "ies"}</span></div>
        <div class="mini">${r.users.length} user${r.users.length === 1 ? "" : "s"} evaluated</div>
      </div></div>`;

    const C = r.counts;
    const chips = [["all", `All (${r.policies.length})`],
      ["block", `🔴 would block (${C.block})`], ["prompt", `🟡 prompts (${C.prompt})`],
      ["clean", `🟢 no change (${C.clean})`], ["scoped", `⚪ never in scope (${C.scoped})`], ["nodata", `⚪ no data (${C.nodata})`]]
      .filter(([k]) => k === "all" || C[k]);
    $("riChips").innerHTML = chips.map(([k, l]) => `<button class="fchip ${riFilter === k ? "active" : ""}" data-rif="${k}">${l}</button>`).join("");
    [...$("riViewSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.riview === riView));
    const q = riQuery.toLowerCase();

    // ---- Per policy: is flipping THIS one on safe? -----------------------
    if (riView === "policies") {
      const pols = r.policies.filter((p) => (riFilter === "all" || p.verdict === riFilter)
        && (!q || `${p.name} ${p.users.map((u) => u.upn + " " + u.name).join(" ")} ${p.apps.map(([a]) => a).join(" ")}`.toLowerCase().includes(q)));
      if (!pols.length) { $("riBody").innerHTML = '<p class="mini" style="padding:20px">No report-only policy matches the current filter.</p>'; return; }
      $("riBody").innerHTML = pols.map((p) => {
        const [ic, vlab] = RI_V[p.verdict];
        const open = riOpen.has("p:" + p.key);
        const users = p.users.filter((u) => u.failure || u.interrupted);
        const detail = open ? `<div class="au-diff">
            ${users.length ? `<table class="plist au-sum" style="margin:6px 0"><thead><tr><th>User</th><th style="width:110px">Would deny</th><th style="width:110px">Interrupted</th><th style="width:90px">Pass</th><th>Apps</th><th style="width:110px">Last seen</th></tr></thead>
            <tbody>${users.slice(0, 60).map((u) => `<tr>
              <td><b>${esc(u.name)}</b>${u.upn !== u.name ? ` <span class="mini muted">${esc(u.upn)}</span>` : ""} <button class="fchip" data-riwhy="${esc(u.upn)}" data-ripol="${esc(p.id || "")}" title="Why is this user in the policy's scope?">why?</button></td>
              <td>${u.failure ? `<span class="au-n rem">${u.failure}</span>` : '<span class="mini muted">—</span>'}</td>
              <td>${u.interrupted ? `<span class="au-n upd">${u.interrupted}</span>` : '<span class="mini muted">—</span>'}</td>
              <td class="mini">${u.success || "—"}</td>
              <td class="mini">${esc([...u.apps].slice(0, 3).join(", "))}${u.apps.size > 3 ? ` +${u.apps.size - 3}` : ""}${riRiskWhy(u)}${riDenyWhy(u)}</td>
              <td class="mini">${esc(auAgo(u.last))}</td></tr>`).join("")}</tbody></table>
            ${users.length > 60 ? `<p class="mini muted">Showing 60 of ${users.length} affected users — the Markdown export has them all.</p>` : ""}`
            : '<p class="mini muted" style="margin:6px 0">No user would notice this policy going live in this window.</p>'}
            ${p.apps.length ? `<p class="mini muted" style="margin:4px 0 0">Apps in scope: ${esc(p.apps.slice(0, 6).map(([a, c]) => `${a} (${c})`).join(", "))}${p.apps.length > 6 ? ` +${p.apps.length - 6}` : ""}</p>` : ""}
          </div>` : "";
        return `<div class="list-card au-card">
          <div class="au-h" data-risum="${esc(p.key)}">
            <span title="${esc(RI_V[p.verdict][2])}">${ic}</span>
            <b class="pol-link" data-polid="${esc(p.id || "")}" title="Open the policy card">${esc(p.name)}</b>
            <span class="tag">report-only</span>
            <span class="ri-v ri-${p.verdict}">${vlab}</span>
            ${p.controls.length ? `<span class="mini muted">${esc(p.controls.slice(0, 3).join(", "))}</span>` : ""}
            <span class="au-when">${p.last ? esc(auAgo(p.last)) : ""}</span>
          </div>
          ${riBar(p)}
          <div class="au-sub">${esc(ReportImpact.verdictLine(p))}${p.notApplied ? ` Out of scope for ${p.notApplied.toLocaleString()} evaluation${p.notApplied === 1 ? "" : "s"}.` : ""}</div>
          ${riTargets(p.id)}
          ${detail}
        </div>`;
      }).join("") + `<p class="mini muted" style="margin-top:8px">Click a policy for the per-user breakdown; the policy name opens its card. 🔴/🟡 verdicts come from real sign-ins — a 🟢 only says nothing was observed to break <i>in this window</i>.</p>`;
      return;
    }

    // ---- Per user: what changes for this person? -------------------------
    const users = r.users.filter((u) => (riFilter === "all" || u.worst === riFilter)
      && (!q || `${u.name} ${u.upn} ${u.policies.map((x) => x.name).join(" ")} ${u.apps.join(" ")}`.toLowerCase().includes(q)));
    if (!users.length) { $("riBody").innerHTML = '<p class="mini" style="padding:20px">No user matches the current filter.</p>'; return; }
    const W = { block: ["🔴", "locked out of something"], prompt: ["🟡", "new prompts"], clean: ["🟢", "unaffected"] };
    $("riBody").innerHTML = `<div class="list-card"><table class="plist au-sum">
      <thead><tr><th>User</th><th style="width:140px">Going live means</th><th style="width:100px">Would deny</th><th style="width:100px">Interrupted</th><th>Policies involved</th><th style="width:110px">Last seen</th></tr></thead>
      <tbody>${users.slice(0, 200).map((u) => {
        const [ic, lab] = W[u.worst];
        const open = riOpen.has("u:" + u.upn);
        const detail = open ? `<tr class="au-sumdet"><td colspan="6"><ul class="wi-list" style="margin:6px 0">
          ${u.policies.map((x) => `<li><div class="wi-pn"><span class="pol-link" data-polid="${esc(x.id || "")}" title="Open the policy card">${esc(x.name)}</span></div>
            <div class="wi-why">${[x.failure ? `${x.failure} would deny` : "", x.interrupted ? `${x.interrupted} interrupted` : "", x.success ? `${x.success} pass` : ""].filter(Boolean).join(" · ")}${riRiskWhy(x)}</div>${riDenyWhy(x)}${riSamples(x)}</li>`).join("")}
        </ul></td></tr>` : "";
        return `<tr class="au-sumrow" data-riuser="${esc(u.upn)}">
          <td><b>${esc(u.name)}</b>${u.upn !== u.name ? ` <span class="mini muted">${esc(u.upn)}</span>` : ""}</td>
          <td>${ic} ${lab}</td>
          <td>${u.failure ? `<span class="au-n rem">${u.failure}</span>` : '<span class="mini muted">—</span>'}</td>
          <td>${u.interrupted ? `<span class="au-n upd">${u.interrupted}</span>` : '<span class="mini muted">—</span>'}</td>
          <td class="mini">${esc(u.policies.map((x) => x.name).slice(0, 2).join(", "))}${u.policies.length > 2 ? ` +${u.policies.length - 2}` : ""}</td>
          <td class="mini">${esc(auAgo(u.last))}</td>
        </tr>${detail}`;
      }).join("")}</tbody></table></div>
      ${users.length > 200 ? `<p class="mini muted" style="margin-top:8px">Showing 200 of ${users.length} users — the Markdown export has them all.</p>` : ""}
      <p class="mini muted" style="margin-top:8px">Worst case first: a user is 🔴 if any staged policy would deny any of their sign-ins. Click a row for the per-policy split.</p>`;
  }

  // A policy named LowMediumUserRisk reporting "3 interrupted" invites exactly
  // one question — low, or medium? — and the sign-in record carries the answer.
  // Shown per level rather than summarised, because a run that was two lows and
  // one medium is a different go-live decision from three mediums.
  // The sign-ins behind a verdict, shown the way 🚦 Sign-in failures shows them:
  // which controls the policy demanded, then the where-and-what of the actual
  // sign-in. A count with a derived explanation is thinner than the record it
  // came from, and this is the same evidence a reviewer would go and look up.
  const riSamples = (x) => (x.samples || []).length ? `<ul class="wi-list si-samples">${x.samples.map((r) => `<li>
      <div class="wi-pn"><span class="si-lab">would fail</span> ${esc((r.controls || []).join(", ") || "no control recorded")}
        <span class="mini muted">→ ${esc(r.app)}</span></div>
      <div class="wi-why">${esc([new Date(r.when).toLocaleString(), r.client, r.os || r.browser,
        [r.city, r.country].filter(Boolean).join(", "), r.ip,
        r.compliant ? "compliant" : (r.trustType || r.managed ? "not compliant" : "unregistered device")].filter(Boolean).join(" · "))}</div>
      ${r.failureReason ? `<div class="wi-why" style="color:var(--off)"><span class="si-lab">reason</span> ${esc(r.failureReason)}${r.errorCode ? ` (${r.errorCode})` : ""}</div>`
        : '<div class="wi-why muted">the sign-in itself succeeded — this policy only recorded what it would have done</div>'}
    </li>`).join("")}</ul>` : "";

  // Why it would say NO. The scope line explains why the policy looked at the
  // user; this explains what it would have demanded and what the sign-in
  // actually brought — the question a go-live turns on.
  const riDenyWhy = (x) => (x.denyWhy || []).length
    ? `<div class="wi-why" style="color:var(--off)">✗ ${x.denyWhy.map((r) => `${esc(r.what)}${r.n > 1 ? ` <span class="muted">(×${r.n})</span>` : ""}`).join("<br>✗ ")}</div>`
    : "";
  const riRiskWhy = (x) => (x.riskWhy || []).length
    ? ` — <span title="From the sign-in records behind this verdict">${x.riskWhy.map((r) => `${esc(r.what)} ×${r.n}`).join(", ")}</span>`
    : "";

  // ---- targeting context: what the policy aims at, and why a user is hit --
  // The verdicts come from the log; the SCOPE comes from the policy already
  // in memory. The card shows the assignment (who is targeted / excluded);
  // the per-user "why?" resolves the person's membership against the
  // policy's include entries, so "in scope" gets a concrete reason.
  const riVm = (polId) => policies.find((x) => x.id === polId) || null;
  function riTargets(polId) {
    const vm = riVm(polId);
    if (!vm) return "";
    const inc = vm.users.inc || [], exc = vm.users.exc || [];
    return `<div class="au-sub">🎯 Targets: <b>${esc(inc.slice(0, 4).join(", "))}</b>${inc.length > 4 ? ` +${inc.length - 4} more` : ""}${exc.length ? ` · excludes: ${esc(exc.slice(0, 3).join(", "))}${exc.length > 3 ? ` +${exc.length - 3} more` : ""}` : ""} — <span class="pol-link" data-polid="${esc(polId)}">open the policy</span> for the full assignment</div>`;
  }
  async function riWhy(upn, polId, btn) {
    const vm = riVm(polId);
    if (!vm) { toast("Policy not in the loaded set — reload the policy list"); return; }
    const u = (vm.raw.conditions || {}).users || {};
    btn.disabled = true; btn.textContent = "…";
    const reasons = [];
    try {
      if ((u.includeUsers || []).some((x) => String(x).toLowerCase() === "all")) reasons.push("the policy targets All users");
      if (!isDemo && ((u.includeUsers || []).length || (u.includeGroups || []).length || (u.includeRoles || []).length)) {
        const ue = encodeURIComponent(upn);
        const me = await Graph.gget(`/users/${ue}?$select=id`).catch(() => null);
        if (me && (u.includeUsers || []).includes(me.id)) reasons.push("targeted directly (include users)");
        if ((u.includeGroups || []).length || (u.includeRoles || []).length) {
          const mem = await Graph.ggetAll(`/users/${ue}/transitiveMemberOf?$select=id,displayName,roleTemplateId`).catch(() => []);
          const gHit = mem.filter((m) => (u.includeGroups || []).includes(m.id));
          const rHit = mem.filter((m) => m.roleTemplateId && (u.includeRoles || []).includes(m.roleTemplateId));
          gHit.forEach((g) => reasons.push(`member of included group “${g.displayName || g.id}”`));
          rHit.forEach((r) => reasons.push(`holds included role “${r.displayName || r.roleTemplateId}”`));
        }
      }
      if (!reasons.length) reasons.push(isDemo
        ? "demo — membership is not resolved here; the policy's include entries are shown on the card"
        : "no include entry matched the current directory state — the membership may have changed since the sign-in, or the match came via a nested/dynamic path Graph does not expand here");
      const note = (u.excludeGroups || []).length || (u.excludeUsers || []).length || (u.excludeRoles || []).length
        ? " (and no exclude entry caught this account — that is why the sign-in applied)" : "";
      btn.outerHTML = `<span class="mini" style="color:var(--muted)">— in scope: ${esc(reasons.join("; "))}${esc(note)}</span>`;
    } catch (e) {
      btn.disabled = false; btn.textContent = "why?";
      toast(`Could not resolve: <span>${esc(e.message || e)}</span>`);
    }
  }

  $("riBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-rirun]")) { runImpact(); return; }
    const wy = e.target.closest("[data-riwhy]");
    if (wy) { riWhy(wy.dataset.riwhy, wy.dataset.ripol, wy); return; }
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { showDetail(pl.dataset.polid); return; }
    const s = e.target.closest("[data-risum]");
    if (s) { const k = "p:" + s.dataset.risum; riOpen.has(k) ? riOpen.delete(k) : riOpen.add(k); renderImpact(); return; }
    const u = e.target.closest("[data-riuser]");
    if (u) { const k = "u:" + u.dataset.riuser; riOpen.has(k) ? riOpen.delete(k) : riOpen.add(k); renderImpact(); }
  });
  $("riViewSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-riview]"); if (!b) return;
    riView = b.dataset.riview; renderImpact();
  });
  $("riChips").addEventListener("click", (e) => { const b = e.target.closest("[data-rif]"); if (!b) return; riFilter = b.dataset.rif; renderImpact(); });
  $("riSearch").addEventListener("input", (e) => { riQuery = e.target.value; renderImpact(); });
  $("riMd").addEventListener("click", () => {
    if (!riRes) return;
    showReport("🎚 Report-only impact", "CA-ReportOnlyImpact", ReportImpact.toMd(riRes, riDays));
  });

  // ---------- Named locations (view / create / edit / delete) ----------
  const LO_WRITE = ["Policy.ReadWrite.ConditionalAccess"];
  let loList = null, loFilter = "all", loQuery = "", loEditing = null, loDeleting = null;
  // Cards sit in a grid (two or more per row); Table is the same information
  // one line per location, for tenants with 80+ of them.
  let loView = "cards";
  // Loaded JSON snapshot being compared against the tenant (null = normal list)
  let loCompare = null;

  async function openLocations(force) {
    crumb("🌐 Named locations");
    show("screen-locations");
    if (loList && !force) { renderLocations(); return; }   // cached
    $("loHead").innerHTML = '<h3>🌐 Named locations</h3><p class="mini" style="margin:6px 0 0">Reading named locations…</p>';
    $("loBody").innerHTML = ""; $("loChips").innerHTML = "";
    try {
      loList = isDemo
        ? ((typeof DEMO_DATA !== "undefined" && DEMO_DATA.namedLocations) || [])
        : await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
      renderLocations();
    } catch (e) {
      console.error("Named locations failed:", e);
      $("loHead").innerHTML = `<h3>🌐 Named locations</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("toolLocations").addEventListener("click", () => openLocations());
  $("loRefresh").addEventListener("click", () => openLocations(true));

  function renderLocations() {
    const raws = policies.map((p) => p.raw);
    const s = Locations.summarize(loList, raws);
    $("loHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>🌐 Named locations <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">The IP-range and country locations your Conditional Access policies can target. Create, edit and delete them here — each row shows which policies use it.</p>
        <p class="mini muted" style="margin:0">A location's type is fixed at creation: an IP location cannot become a country location. Deleting one that a policy still references widens that policy.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.total}<span class="mini" style="font-weight:400"> locations</span></div>
        <div class="mini">${s.ip} IP (${s.ranges} ranges) · ${s.country} country${s.compliantNetwork ? ` · ${s.compliantNetwork} compliant network` : ""}</div>
        <div class="mini">${s.trusted} trusted${s.viaTrusted ? ` · ${s.viaTrusted} used only via “All trusted”` : ""}${s.unused ? ` · ${s.unused} unused` : ""}</div>
      </div></div>`;

    const counts = { all: loList.length, ip: s.ip, country: s.country, trusted: s.trusted, unused: s.unused };
    $("loChips").innerHTML = [["all", `All (${counts.all})`], ["ip", `🖧 IP ranges (${counts.ip})`],
      ["country", `🌍 Countries (${counts.country})`], ["trusted", `✓ Trusted (${counts.trusted})`],
      ["unused", `Unused (${counts.unused})`]]
      .map(([k, l]) => `<button class="fchip ${loFilter === k ? "active" : ""}" data-lof="${k}">${esc(l)}</button>`).join("");

    const q = loQuery.toLowerCase();
    const rows = loList.filter((l) => {
      const k = Locations.kindOf(l), used = Locations.usedBy(l, raws).length;
      if (loFilter === "ip" && k !== "ip") return false;
      if (loFilter === "country" && k !== "country") return false;
      if (loFilter === "trusted" && !Locations.isTrusted(l)) return false;
      if (loFilter === "unused" && used) return false;
      return !q || `${l.displayName} ${Locations.detail(l)}`.toLowerCase().includes(q);
    }).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

    [...$("loViewSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.loview === loView));
    if (!rows.length) { $("loBody").innerHTML = '<p class="mini" style="padding:20px">No named location matches the current filter.</p>'; return; }

    // Compare view takes over the body until it is closed — it is a different
    // subject (this tenant vs a file), not a filter of the same list.
    if (loCompare) { renderLoCompare(); return; }

    // Shared per-location facts, so the card and the table row can never drift.
    const facts = (l) => {
      const used = Locations.usedBy(l, raws);
      return {
        k: Locations.kindOf(l), used, canEdit: Locations.editable(l),
        direct: used.filter((u) => !u.implicit), implicit: used.filter((u) => u.implicit),
      };
    };
    const icon = (k) => k === "ip" ? "🖧" : k === "country" ? "🌍" : "🛡";
    const kindLabel = (k) => k === "ip" ? "IP ranges" : k === "country" ? "countries" : "network access";
    const list = (arr) => arr.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>`).join(", ");
    const actions = (l, canEdit) => canEdit
      ? `<button class="btn sm" data-loedit="${esc(l.id)}">✎ Edit</button>
         <button class="btn sm danger" data-lodel="${esc(l.id)}">🗑 Delete</button>`
      : '<span class="mini muted">service-managed</span>';

    if (loView === "table") {
      $("loBody").innerHTML = `<div class="list-card" style="padding:0;overflow:hidden">
        <table class="plist lo-table">
          <thead><tr><th>Name</th><th>Type</th><th>Definition</th><th>Used by</th><th></th></tr></thead>
          <tbody>${rows.map((l) => {
            const { k, used, canEdit, direct, implicit } = facts(l);
            return `<tr>
              <td><b class="pol-link" data-lodet="${esc(l.id)}" title="Open the location report">${esc(l.displayName || "(unnamed)")}</b>${Locations.isTrusted(l) ? ' <span class="tag ok">trusted</span>' : ""}</td>
              <td class="mini">${icon(k)} ${esc(kindLabel(k))}</td>
              <td class="mini lo-d">${esc(Locations.detail(l))}</td>
              <td class="mini">${used.length ? [
                  direct.length ? `<b>${direct.length}</b> named: ${list(direct.slice(0, 2))}${direct.length > 2 ? ` +${direct.length - 2}` : ""}` : "",
                  implicit.length ? `<span class="lo-imp"><b>${implicit.length}</b> via “All trusted”</span>` : "",
                ].filter(Boolean).join("<br>") : '<span class="muted">not referenced</span>'}</td>
              <td class="lo-tact">${actions(l, canEdit)}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>`;
      return;
    }

    $("loBody").innerHTML = `<div class="lo-grid">` + rows.map((l) => {
      const { k, used, canEdit, direct, implicit } = facts(l);
      return `<div class="list-card lo-card">
        <div class="lo-h">
          <span class="lo-ic">${icon(k)}</span>
          <b class="pol-link" data-lodet="${esc(l.id)}" title="Open the location report">${esc(l.displayName || "(unnamed)")}</b>
          ${Locations.isTrusted(l) ? '<span class="tag ok">trusted</span>' : ""}
          <span class="tag">${esc(kindLabel(k))}</span>
        </div>
        <div class="mini lo-d">${esc(Locations.detail(l))}</div>
        <div class="lo-u">${used.length ? [
            direct.length ? `Named by ${direct.length} polic${direct.length === 1 ? "y" : "ies"}: ${list(direct.slice(0, 2))}${direct.length > 2 ? ` <span class="muted">+${direct.length - 2} more</span>` : ""}` : "",
            implicit.length ? `<span class="lo-imp">Covered by ${implicit.length} polic${implicit.length === 1 ? "y" : "ies"} using “All trusted locations”</span>` : "",
          ].filter(Boolean).join("<br>") + ` <span class="lo-more" data-lodet="${esc(l.id)}">details →</span>`
          : '<span class="mini muted">Not referenced by any policy</span>'}</div>
        <div class="lo-act">${actions(l, canEdit)}</div>
      </div>`;
    }).join("") + `</div>`;
  }
  $("loChips").addEventListener("click", (e) => { const b = e.target.closest("[data-lof]"); if (!b) return; loFilter = b.dataset.lof; renderLocations(); });
  $("loViewSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-loview]"); if (!b) return; loView = b.dataset.loview; renderLocations(); });
  $("loSearch").addEventListener("input", (e) => { loQuery = e.target.value; renderLocations(); });
  $("loBody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-loedit]"); if (ed) { openLoEditor(loList.find((x) => x.id === ed.dataset.loedit)); return; }
    const dl = e.target.closest("[data-lodel]"); if (dl) { openLoDelete(loList.find((x) => x.id === dl.dataset.lodel)); return; }
    const dt = e.target.closest("[data-lodet]"); if (dt) { openLoDetail(dt.dataset.lodet); return; }
    const pl = e.target.closest(".pol-link"); if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });

  // ---- one location, in full ----
  // The cards only summarise usage; a location trusted by 18 policies needs a
  // place that lists all of them, every range, and its own documentation.
  let loDetailId = null;
  function openLoDetail(id) {
    const l = loList && loList.find((x) => x.id === id); if (!l) return;
    loDetailId = id;
    const raws = policies.map((p) => p.raw);
    const k = Locations.kindOf(l), used = Locations.usedBy(l, raws);
    const direct = used.filter((u) => !u.implicit), implicit = used.filter((u) => u.implicit);
    const ranges = (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean);
    const countries = l.countriesAndRegions || [];
    const polList = (arr) => `<ul class="plist2" style="border:1px solid var(--border);border-radius:8px;max-height:200px;overflow:auto">`
      + arr.map((p) => `<li><span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>${p.how ? ` <span class="mini muted">${esc(p.how)}</span>` : ""}</li>`).join("") + "</ul>";
    $("loDetTitle").innerHTML = `${k === "ip" ? "🖧" : k === "country" ? "🌍" : "🛡"} ${esc(l.displayName || "(unnamed)")}`
      + (Locations.isTrusted(l) ? ' <span class="tag ok">trusted</span>' : "")
      + ` <span class="tag">${k === "ip" ? "IP ranges" : k === "country" ? "countries" : "network access"}</span>`;
    $("loDetBody").innerHTML = `
      <table class="plist" style="margin-bottom:12px"><tbody>
        <tr><td style="width:150px" class="mini">Type</td><td>${k === "ip" ? "IP ranges" : k === "country" ? "Countries / regions" : "Compliant network (service-managed)"}</td></tr>
        <tr><td class="mini">Trusted</td><td>${Locations.isTrusted(l)
          ? 'Yes — policies using <b>“All trusted locations”</b> cover it implicitly'
          : 'No — only policies that name it explicitly apply'}</td></tr>
        ${k === "ip" ? `<tr><td class="mini">Ranges (${ranges.length})</td><td class="lo-d" style="margin:0">${ranges.length ? ranges.map(esc).join("<br>") : "<span class='muted'>none</span>"}</td></tr>` : ""}
        ${k === "country" ? `<tr><td class="mini">Countries (${countries.length})</td><td>${countries.length ? esc(countries.join(", ")) : "<span class='muted'>none</span>"}</td></tr>
          <tr><td class="mini">Unknown regions</td><td>${l.includeUnknownCountriesAndRegions ? "included" : "not included"}</td></tr>
          <tr><td class="mini">Lookup</td><td>${esc(l.countryLookupMethod || "clientIpAddress")}</td></tr>` : ""}
        <tr><td class="mini">Location id</td><td class="mini lo-d" style="margin:0">${esc(l.id)}</td></tr>
      </tbody></table>
      <h4 style="margin:14px 0 6px">Named by ${direct.length} polic${direct.length === 1 ? "y" : "ies"}</h4>
      ${direct.length ? polList(direct) : '<p class="mini muted">No policy names this location.</p>'}
      ${implicit.length ? `<h4 style="margin:14px 0 6px">Covered by ${implicit.length} polic${implicit.length === 1 ? "y" : "ies"} using “All trusted locations”</h4>
        <p class="mini muted" style="margin:0 0 6px">These do not name it — they match it because it is trusted. Clearing the trusted flag removes it from all of them at once.</p>
        ${polList(implicit)}` : ""}
      ${!used.length ? '<p class="mini" style="color:var(--off)">Not referenced by any policy — deleting it changes nothing today.</p>' : ""}`;
    $("loDetEdit").style.display = Locations.editable(l) ? "" : "none";
    $("loDetModal").classList.add("open");
  }
  $("loDetClose").addEventListener("click", () => $("loDetModal").classList.remove("open"));
  $("loDetBody").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { $("loDetModal").classList.remove("open"); showDetail(pl.dataset.polid); }
  });
  $("loDetEdit").addEventListener("click", () => {
    const l = loList && loList.find((x) => x.id === loDetailId); if (!l) return;
    $("loDetModal").classList.remove("open"); openLoEditor(l);
  });
  $("loDetMd").addEventListener("click", () => {
    const l = loList && loList.find((x) => x.id === loDetailId); if (!l) return;
    showReport(`🌐 ${l.displayName || "Named location"}`, `CA-NamedLocation-${(l.displayName || "location").replace(/[^\w.-]+/g, "-")}`, loLocationMd(l));
  });

  // Documentation for a single location — same footer and tone as the other
  // Markdown exports, so it can be pasted straight into a design document.
  function loLocationMd(l) {
    const raws = policies.map((p) => p.raw);
    const k = Locations.kindOf(l), used = Locations.usedBy(l, raws);
    const direct = used.filter((u) => !u.implicit), implicit = used.filter((u) => u.implicit);
    const L = [`# Named location — ${l.displayName || "(unnamed)"}`, "",
      Brand.generatedBy("Generated"),
      `Tenant: ${tenantName || "—"}`, "",
      `- **Type:** ${k === "ip" ? "IP ranges" : k === "country" ? "Countries / regions" : "Compliant network (service-managed)"}`,
      `- **Trusted:** ${Locations.isTrusted(l) ? "yes" : "no"}`,
      `- **Id:** \`${l.id}\``, ""];
    if (k === "ip") {
      const r = (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean);
      L.push(`## Ranges (${r.length})`, "", ...(r.length ? r.map((x) => `- \`${x}\``) : ["_none_"]), "");
    } else if (k === "country") {
      const c = l.countriesAndRegions || [];
      L.push(`## Countries / regions (${c.length})`, "", c.length ? c.join(", ") : "_none_", "",
        `- Unknown regions: ${l.includeUnknownCountriesAndRegions ? "included" : "not included"}`,
        `- Lookup method: ${l.countryLookupMethod || "clientIpAddress"}`, "");
    }
    L.push(`## Policy usage`, "",
      `### Named by ${direct.length} polic${direct.length === 1 ? "y" : "ies"}`, "",
      ...(direct.length ? direct.map((p) => `- ${p.name}${p.how ? ` (${p.how})` : ""}`) : ["_none_"]), "");
    if (implicit.length) {
      L.push(`### Covered by ${implicit.length} polic${implicit.length === 1 ? "y" : "ies"} using “All trusted locations”`, "",
        `These do not name the location — they match it because it is trusted. Clearing the trusted flag removes it from all of them at once.`, "",
        ...implicit.map((p) => `- ${p.name}`), "");
    }
    if (!used.length) L.push(`_Not referenced by any policy — deleting it changes nothing today._`, "");
    return L.join("\n");
  }

  // ---- config snapshot: export, and compare a later state against it ----
  $("loJson").addEventListener("click", () => {
    if (!loList) return;
    const snap = Locations.toExport(loList, { tenant: tenantName, build: APP_BUILD.label });
    downloadText("CA-NamedLocations-Config", "json", "application/json", JSON.stringify(snap, null, 2));
    toast(`Exported <span>${snap.count}</span> named location${snap.count === 1 ? "" : "s"} — load it back with Compare to see what changed`);
  });
  $("loCmpFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !loList) return;
    try {
      const snap = Locations.fromExport(JSON.parse(await f.text()));
      loCompare = { snap, fileName: f.name, result: Locations.compare(loList, snap.locations) };
      renderLocations();
    } catch (err) { console.error(err); toast(`Could not read that export: <span>${esc(err.message || err)}</span>`); }
  });

  function renderLoCompare() {
    const { snap, fileName, result: r } = loCompare;
    const when = (snap.generated || "").replace("T", " ").slice(0, 16);
    const nDrift = r.changed.length + r.missing.length + r.extra.length;
    const sec = (title, note, body) => `<h4 style="margin:16px 0 4px">${title}</h4>${note ? `<p class="mini muted" style="margin:0 0 6px">${note}</p>` : ""}${body}`;
    const nameCell = (l) => `<b class="pol-link" data-lodet="${esc(l.id)}">${esc(l.displayName || "(unnamed)")}</b>`;
    const rowsChanged = r.changed.map((c) => `<tr><td>${nameCell(c.location)}</td>
      <td class="mini">${c.fields.map((f) => `<div class="lo-drift">${esc(f)}</div>`).join("")}</td></tr>`).join("");
    $("loBody").innerHTML = `
      <div class="list-card" style="border-left:3px solid var(--accent2)">
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <h3 style="margin:0 0 4px">⇄ Compared against ${esc(fileName)}</h3>
            <p class="mini" style="margin:0">Snapshot of <b>${snap.count}</b> location${snap.count === 1 ? "" : "s"}${snap.tenant ? ` from <b>${esc(snap.tenant)}</b>` : ""}${when ? `, taken ${esc(when)} UTC` : ""}${snap.build ? ` (${esc(snap.build)})` : ""}.
              Matched by <b>display name</b> — an id from another tenant means nothing here.</p>
            <p class="mini" style="margin:6px 0 0">${nDrift
              ? `<b style="color:var(--off)">${nDrift}</b> difference${nDrift === 1 ? "" : "s"}: ${r.changed.length} changed, ${r.missing.length} missing here, ${r.extra.length} new here. ${r.same.length} identical.`
              : `<b style="color:var(--on)">No differences</b> — all ${r.same.length} location${r.same.length === 1 ? " matches" : "s match"} the snapshot.`}</p>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn" id="loCmpMd">Export MD</button>
            <button class="btn" id="loCmpClose">✕ Back to locations</button>
          </div>
        </div>
      </div>
      ${r.changed.length ? sec(`✎ Changed (${r.changed.length})`,
        "Present in both, but the definition moved. A flipped <b>trusted</b> flag is the one to look at first — it silently changes which policies match.",
        `<div class="list-card" style="padding:0;overflow:hidden"><table class="plist"><tbody>${rowsChanged}</tbody></table></div>`) : ""}
      ${r.missing.length ? sec(`− In the snapshot, not in this tenant (${r.missing.length})`,
        "Deleted or renamed since. Any policy that named one no longer has it.",
        `<div class="list-card" style="padding:0;overflow:hidden"><table class="plist"><tbody>${r.missing.map((sl) => `<tr><td><b>${esc(sl.displayName)}</b></td><td class="mini">${esc(sl.kind === "country" ? (sl.countriesAndRegions || []).join(", ") : (sl.ipRanges || []).join(", "))}</td></tr>`).join("")}</tbody></table></div>`) : ""}
      ${r.extra.length ? sec(`+ In this tenant, not in the snapshot (${r.extra.length})`,
        "Created since the snapshot was taken.",
        `<div class="list-card" style="padding:0;overflow:hidden"><table class="plist"><tbody>${r.extra.map((l) => `<tr><td>${nameCell(l)}</td><td class="mini lo-d" style="margin:0">${esc(Locations.detail(l))}</td></tr>`).join("")}</tbody></table></div>`) : ""}`;
    $("loCmpClose").addEventListener("click", () => { loCompare = null; renderLocations(); });
    $("loCmpMd").addEventListener("click", () => showReport("⇄ Named locations — compare", "CA-NamedLocations-Compare", loCompareMd()));
  }

  function loCompareMd() {
    const { snap, fileName, result: r } = loCompare;
    const L = [`# Named locations — compared against a snapshot`, "",
      Brand.generatedBy("Generated"), "",
      `- **Tenant:** ${tenantName || "—"}`,
      `- **Snapshot:** ${fileName}${snap.tenant ? ` (${snap.tenant})` : ""}, taken ${(snap.generated || "").replace("T", " ").slice(0, 16)} UTC`,
      `- **Changed:** ${r.changed.length} · **Missing here:** ${r.missing.length} · **New here:** ${r.extra.length} · **Identical:** ${r.same.length}`, ""];
    if (r.changed.length) {
      L.push(`## Changed`, "", "| Location | What moved |", "| --- | --- |",
        ...r.changed.map((c) => `| ${c.location.displayName} | ${c.fields.join("; ").replace(/\|/g, "\\|")} |`), "");
    }
    if (r.missing.length) L.push(`## In the snapshot, not in this tenant`, "", ...r.missing.map((s) => `- ${s.displayName}`), "");
    if (r.extra.length) L.push(`## In this tenant, not in the snapshot`, "", ...r.extra.map((l) => `- ${l.displayName} — ${Locations.detail(l)}`), "");
    if (!r.changed.length && !r.missing.length && !r.extra.length) L.push(`No differences — all ${r.same.length} locations match the snapshot.`, "");
    return L.join("\n");
  }

  // ---- editor ----
  function loSyncKind() {
    const ip = $("loKind").value === "ip";
    $("loIpFields").style.display = ip ? "" : "none";
    $("loCountryFields").style.display = ip ? "none" : "";
  }
  $("loKind").addEventListener("change", loSyncKind);
  function openLoEditor(loc) {
    loEditing = loc || null;
    const f = Locations.toForm(loc);
    $("loEditTitle").textContent = loc ? "Edit named location" : "New named location";
    $("loEditSub").innerHTML = loc
      ? `<b>${esc(loc.displayName)}</b> — the type cannot be changed after creation.`
      : "Creates a new named location in this tenant.";
    $("loKind").value = f.kind; $("loKind").disabled = !!loc;
    $("loName").value = f.name; $("loRanges").value = f.ranges; $("loTrusted").checked = f.isTrusted;
    $("loCountries").value = f.countries; $("loUnknown").checked = f.includeUnknown; $("loLookup").value = f.lookupMethod;
    $("loCountrySearch").value = ""; $("loCountryList").innerHTML = "";
    loCountryRender([]);           // a fresh dialog starts with no complaints
    loSyncKind();
    // changing isTrusted moves every policy that uses "All trusted locations"
    const at = Locations.trustedConsumers(policies.map((p) => p.raw));
    $("loEditWarn").innerHTML = (f.kind === "ip" && at.length)
      ? `<div class="mini muted">⚠ ${at.length} polic${at.length === 1 ? "y uses" : "ies use"} <b>All trusted locations</b> — changing the trusted flag changes ${at.length === 1 ? "it" : "them"} too.</div>` : "";
    $("loEditModal").classList.add("open");
  }
  // ---------- country picker (R08) ----------
  // The hidden textarea stays the single source of truth: buildPayload already
  // reads it, and every other path (paste, an existing location being edited)
  // still works. The picker writes to it; the chips read from it. One place to
  // be wrong beats two places to keep in step.
  // Unknowns survive normalisation. Rewriting the field to clean codes is what
  // makes the chips and the payload agree — but if the message were rebuilt
  // from the rewritten value there would be nothing left to complain about, and
  // the junk would have been dropped in silence. Which is the failure this
  // feature exists to prevent, arrived at from the other direction.
  let loCountryRejected = [];
  function loCountryRender(rejected) {
    const box = $("loCountries");
    const parsed = ISO3166.parse(box.value);
    const codes = parsed.codes;
    if (rejected !== undefined) loCountryRejected = rejected;
    const unknown = [...new Set([...parsed.unknown, ...loCountryRejected])];
    $("loCountryPicks").innerHTML = codes.map((c) => `<span class="lo-chip"><b>${esc(c)}</b> ${esc(ISO3166.nameOf(c))}
        <button type="button" data-locountry-rm="${esc(c)}" title="Remove">✕</button></span>`).join("")
      || '<span class="mini muted">No countries selected yet.</span>';
    // Anything unrecognised is NAMED, not dropped. A code silently discarded is
    // a country silently not covered, which is the failure this whole feature
    // exists to prevent.
    $("loCountryMsg").innerHTML = unknown.length
      ? `<span style="color:var(--off)">✗ not an ISO 3166-1 code: ${unknown.map((u) => `<b>${esc(u)}</b>`).join(", ")}
         — these are <b>ignored</b>. UK is not a code (the United Kingdom is <b>GB</b>); EU is not one either.</span>`
      : (codes.length ? `<span class="muted">${codes.length} countr${codes.length === 1 ? "y" : "ies"}.</span>` : "");
    return codes;
  }
  function loCountryAdd(code) {
    const box = $("loCountries");
    const { codes } = ISO3166.parse(box.value);
    if (!codes.includes(code)) codes.push(code);
    box.value = codes.join(", ");
    loCountryRender([]);
  }

  // Suggestions come from the local ISO list — no network, and it is the same
  // list the codes are validated against, so what is offered is exactly what is
  // accepted.
  $("loCountrySearch").addEventListener("input", (e) => {
    const hits = ISO3166.search(e.target.value, 8);
    $("loCountryList").innerHTML = hits.map((h) => `<option value="${esc(h.name)} (${esc(h.code)})"></option>`).join("");
    // Picking from the datalist fires `input` with the full option text; that
    // is the confirmation, so it is added straight away rather than waiting for
    // a second gesture nobody knows to make.
    const m = /\(([A-Z]{2})\)\s*$/.exec(e.target.value.trim());
    if (m && ISO3166.isCode(m[1])) { loCountryAdd(m[1]); e.target.value = ""; $("loCountryList").innerHTML = ""; }
  });
  $("loCountrySearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();          // this field must never submit the dialog
    const hit = ISO3166.search(e.target.value, 1)[0];
    if (hit) { loCountryAdd(hit.code); e.target.value = ""; $("loCountryList").innerHTML = ""; }
    else if (e.target.value.trim()) {
      $("loCountryMsg").innerHTML = `<span style="color:var(--off)">✗ no country matches <b>${esc(e.target.value.trim())}</b> — nothing was added.</span>`;
    }
  });
  $("loCountryPicks").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-locountry-rm]");
    if (!rm) return;
    const box = $("loCountries");
    box.value = ISO3166.parse(box.value).codes.filter((c) => c !== rm.dataset.locountryRm).join(", ");
    loCountryRender([]);
  });
  // Typed or pasted directly: normalise to codes so the chips and the payload
  // agree with each other.
  $("loCountries").addEventListener("input", () => loCountryRender());
  $("loCountries").addEventListener("change", () => {
    const { codes, unknown } = ISO3166.parse($("loCountries").value);
    $("loCountries").value = codes.join(", ");
    loCountryRender(unknown);      // keep saying what was thrown away
  });

  $("loNew").addEventListener("click", () => openLoEditor(null));
  $("loEditCancel").addEventListener("click", () => $("loEditModal").classList.remove("open"));
  $("loEditSave").addEventListener("click", async () => {
    const form = {
      kind: $("loKind").value, name: $("loName").value, ranges: $("loRanges").value,
      isTrusted: $("loTrusted").checked, countries: $("loCountries").value,
      includeUnknown: $("loUnknown").checked, lookupMethod: $("loLookup").value,
    };
    const built = Locations.buildPayload(form);
    if (!built.ok) { $("loEditWarn").innerHTML = built.errors.map((x) => `<div class="mini" style="color:var(--off)">✗ ${esc(x)}</div>`).join(""); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...LO_WRITE])) return;
    const btn = $("loEditSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isDemo) {
        toast("Demo — <span>save simulated</span>");
      } else if (loEditing) {
        await Graph.gpatch(`/identity/conditionalAccess/namedLocations/${loEditing.id}`, built.payload, [...AUTH_CONFIG.scopes, ...LO_WRITE]);
        toast(`<span>${esc(built.payload.displayName)}</span> updated`);
      } else {
        await Graph.gpost("/identity/conditionalAccess/namedLocations", built.payload, [...AUTH_CONFIG.scopes, ...LO_WRITE]);
        toast(`<span>${esc(built.payload.displayName)}</span> created`);
      }
      $("loEditModal").classList.remove("open");
      await openLocations(true);
    } catch (e) {
      console.error("Save named location failed:", e);
      $("loEditWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  });

  // ---- delete ----
  function openLoDelete(loc) {
    if (!loc) return;
    loDeleting = loc;
    const used = Locations.usedBy(loc, policies.map((p) => p.raw));
    $("loDelDesc").innerHTML = `<b>${esc(loc.displayName)}</b> — ${esc(Locations.detail(loc))}`;
    $("loDelRefs").innerHTML = used.length
      ? `<div class="mini" style="color:var(--off);font-weight:600;margin-bottom:6px">⚠ Still referenced by ${used.length} polic${used.length === 1 ? "y" : "ies"}:</div>
         <ul class="wi-list dim">${used.map((p) => `<li><div class="wi-pn">${esc(p.name)}</div><div class="wi-why">${esc(p.how)} · ${esc(p.state === "enabledForReportingButNotEnforced" ? "report-only" : p.state)}</div></li>`).join("")}</ul>`
      : '<p class="mini muted">Not referenced by any policy — safe to remove.</p>';
    $("loDelConfirmWrap").style.display = used.length ? "" : "none";
    $("loDelConfirm").value = "";
    $("loDelGo").disabled = used.length > 0;
    $("loDelModal").classList.add("open");
  }
  $("loDelConfirm").addEventListener("input", (e) => { $("loDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE"; });
  $("loDelCancel").addEventListener("click", () => $("loDelModal").classList.remove("open"));
  $("loDelGo").addEventListener("click", async () => {
    if (!loDeleting) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...LO_WRITE])) return;
    const btn = $("loDelGo"); btn.disabled = true; btn.textContent = "Deleting…";
    try {
      if (isDemo) toast("Demo — <span>delete simulated</span>");
      else {
        await Graph.gdelete(`/identity/conditionalAccess/namedLocations/${loDeleting.id}`, [...AUTH_CONFIG.scopes, ...LO_WRITE]);
        toast(`<span>${esc(loDeleting.displayName)}</span> deleted`);
      }
      $("loDelModal").classList.remove("open");
      await openLocations(true);
    } catch (e) {
      console.error("Delete named location failed:", e);
      toast(`Delete failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "Delete permanently"; }
  });

  $("loMd").addEventListener("click", () => {
    if (!loList) return;
    const raws = policies.map((p) => p.raw), s = Locations.summarize(loList, raws);
    const L = [`# Named locations — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      `- Total: **${s.total}** — ${s.ip} IP (${s.ranges} ranges), ${s.country} country`,
      `- Trusted: ${s.trusted} · Not referenced by any policy: ${s.unused}`, "",
      "| Location | Type | Trusted | Detail | Used by |", "| --- | --- | --- | --- | --- |"];
    loList.slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")).forEach((l) => {
      const used = Locations.usedBy(l, raws);
      const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
      L.push(`| ${e(l.displayName)} | ${Locations.kindOf(l) === "ip" ? "IP ranges" : "Countries"} | ${Locations.isTrusted(l) ? "yes" : "—"} | ${e(Locations.detail(l))} | ${used.length ? used.map((p) => `${e(p.name)} (${p.how})`).join("<br>") : "—"} |`);
    });
    showReport("🌐 Named locations", "CA-NamedLocations", L.join("\n"));
  });

  // ---------- Authentication contexts (BETA — view / create / edit / publish / delete) ----------
  const AC_WRITE = ["Policy.ReadWrite.ConditionalAccess"];
  let acList = null, acFilter = "all", acQuery = "", acEditing = null, acDeleting = null;
  // Demo tenants rarely define contexts — a small sample keeps the tool
  // explorable at ?demo=1 without touching demo.js.
  const AC_DEMO = [
    { id: "c1", displayName: "Sensitive actions", description: "Step-up for Protected Actions and admin portals", isAvailable: true },
    { id: "c2", displayName: "Confidential documents", description: "Requested by the Highly Confidential sensitivity label", isAvailable: true },
    { id: "c3", displayName: "Draft — legal hold", description: "", isAvailable: false },
  ];

  async function openAuthCtx(force) {
    crumb("🎫 Authentication contexts");
    show("screen-authctx");
    if (acList && !force) { renderAuthCtx(); return; }   // cached
    $("acHead").innerHTML = '<h3>🎫 Authentication contexts</h3><p class="mini" style="margin:6px 0 0">Reading authentication contexts…</p>';
    $("acBody").innerHTML = ""; $("acChips").innerHTML = "";
    try {
      acList = isDemo
        ? ((typeof DEMO_DATA !== "undefined" && DEMO_DATA.authContexts) || AC_DEMO)
        : await Graph.ggetAll("/identity/conditionalAccess/authenticationContextClassReferences");
      renderAuthCtx();
    } catch (e) {
      console.error("Authentication contexts failed:", e);
      $("acHead").innerHTML = `<h3>🎫 Authentication contexts</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("toolAuthCtx").addEventListener("click", () => openAuthCtx());
  $("acRefresh").addEventListener("click", () => openAuthCtx(true));

  function renderAuthCtx() {
    const raws = policies.map((p) => p.raw);
    const s = AuthContexts.summarize(acList, raws);
    $("acHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>🎫 Authentication contexts <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">The step-up requirements apps, Protected Actions and sensitivity labels can ask for. The <b>id</b> (c1–c${AuthContexts.SLOT_MAX}) is the contract — it is what callers request and what the token's ACRS claim carries — so it can be renamed and republished, but never changed. Each card shows which Conditional Access policies enforce it.</p>
        <p class="mini muted" style="margin:0">Unpublished contexts are hidden from app and label selection but stay usable in CA policy authoring. Only an unpublished context that no policy references can be deleted.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.total}<span class="mini" style="font-weight:400"> of ${AuthContexts.SLOT_MAX} slots</span></div>
        <div class="mini">${s.published} published · ${s.unpublished} unpublished</div>
        <div class="mini">${s.inUse} enforced by a policy${s.unused ? ` · ${s.unused} unreferenced` : ""}</div>
      </div></div>`;
    $("acChips").innerHTML = [["all", `All (${s.total})`], ["published", `✓ Published (${s.published})`],
      ["unpublished", `Unpublished (${s.unpublished})`], ["inuse", `Enforced (${s.inUse})`], ["unused", `Unreferenced (${s.unused})`]]
      .map(([k, l]) => `<button class="fchip ${acFilter === k ? "active" : ""}" data-acf="${k}">${esc(l)}</button>`).join("");

    const q = acQuery.toLowerCase();
    const rows = (acList || []).filter((c) => {
      const used = AuthContexts.usedBy(c.id, raws).length;
      if (acFilter === "published" && !c.isAvailable) return false;
      if (acFilter === "unpublished" && c.isAvailable) return false;
      if (acFilter === "inuse" && !used) return false;
      if (acFilter === "unused" && used) return false;
      return !q || `${c.id} ${c.displayName} ${c.description}`.toLowerCase().includes(q);
    }).sort(AuthContexts.sortById);

    if (!rows.length) { $("acBody").innerHTML = '<p class="mini" style="padding:20px">No authentication context matches the current filter.</p>'; return; }
    const list = (arr) => arr.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>`).join(", ");
    $("acBody").innerHTML = `<div class="lo-grid">` + rows.map((c) => {
      const used = AuthContexts.usedBy(c.id, raws);
      const del = AuthContexts.deletable(c, raws);
      return `<div class="list-card lo-card">
        <div class="lo-h">
          <span class="lo-ic">🎫</span>
          <b>${esc(c.id)}</b> <b>${esc(c.displayName || "(unnamed)")}</b>
          ${c.isAvailable ? '<span class="tag ok">published</span>' : '<span class="tag">unpublished</span>'}
        </div>
        ${c.description ? `<div class="mini lo-d">${esc(c.description)}</div>` : ""}
        <div class="lo-u">${used.length
          ? `Enforced by ${used.length} polic${used.length === 1 ? "y" : "ies"}: ${list(used.slice(0, 3))}${used.length > 3 ? ` <span class="muted">+${used.length - 3} more</span>` : ""}`
          : '<span class="mini muted">No Conditional Access policy enforces this context — callers requesting it get no step-up</span>'}</div>
        <div class="lo-act">
          <button class="btn sm" data-acedit="${esc(c.id)}">✎ Edit</button>
          <button class="btn sm" data-acpub="${esc(c.id)}">${c.isAvailable ? "⏸ Unpublish" : "▶ Publish"}</button>
          <button class="btn sm danger" data-acdel="${esc(c.id)}" ${del.ok ? "" : `disabled title="${esc(del.why)}"`}>🗑 Delete</button>
        </div>
      </div>`;
    }).join("") + `</div>
    <p class="mini muted" style="margin-top:10px">${s.free} free slot${s.free === 1 ? "" : "s"} (of c1–c${AuthContexts.SLOT_MAX}).</p>`;
  }
  $("acChips").addEventListener("click", (e) => { const b = e.target.closest("[data-acf]"); if (!b) return; acFilter = b.dataset.acf; renderAuthCtx(); });
  $("acSearch").addEventListener("input", (e) => { acQuery = e.target.value; renderAuthCtx(); });
  $("acBody").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-acedit]"); if (ed) { openAcEditor(acList.find((x) => x.id === ed.dataset.acedit)); return; }
    const pb = e.target.closest("[data-acpub]"); if (pb) { await acTogglePublish(acList.find((x) => x.id === pb.dataset.acpub), pb); return; }
    const dl = e.target.closest("[data-acdel]"); if (dl && !dl.disabled) { openAcDelete(acList.find((x) => x.id === dl.dataset.acdel)); return; }
    const pl = e.target.closest(".pol-link"); if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });

  async function acTogglePublish(c, btn) {
    if (!c) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...AC_WRITE])) return;
    btn.disabled = true;
    try {
      if (isDemo) { c.isAvailable = !c.isAvailable; toast("Demo — <span>publish state simulated</span>"); renderAuthCtx(); return; }
      await Graph.gpatch(`/identity/conditionalAccess/authenticationContextClassReferences/${c.id}`, { isAvailable: !c.isAvailable }, [...AUTH_CONFIG.scopes, ...AC_WRITE]);
      toast(`<span>${esc(c.id)} ${esc(c.displayName || "")}</span> ${c.isAvailable ? "unpublished" : "published"}`);
      await openAuthCtx(true);
    } catch (e2) {
      console.error("Publish toggle failed:", e2);
      toast(`Failed: <span>${esc(e2.message || e2)}</span>`);
      btn.disabled = false;
    }
  }

  function openAcEditor(ctx) {
    acEditing = ctx || null;
    const f = AuthContexts.toForm(ctx);
    const free = AuthContexts.freeSlots(acList || []);
    $("acEditTitle").textContent = ctx ? `Edit ${ctx.id}` : "New authentication context";
    $("acEditSub").innerHTML = ctx
      ? `<b>${esc(ctx.displayName || ctx.id)}</b> — the id cannot be changed; rename and republish instead.`
      : `Creates a new context in a free slot. ${free.length} of ${AuthContexts.SLOT_MAX} slots free.`;
    $("acId").innerHTML = ctx
      ? `<option value="${esc(ctx.id)}">${esc(ctx.id)}</option>`
      : free.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
    $("acId").disabled = !!ctx;
    $("acName").value = f.name; $("acDesc").value = f.description; $("acAvail").checked = f.isAvailable;
    $("acEditWarn").innerHTML = "";
    $("acEditModal").classList.add("open");
  }
  $("acNew").addEventListener("click", () => openAcEditor(null));
  $("acEditCancel").addEventListener("click", () => $("acEditModal").classList.remove("open"));
  $("acEditSave").addEventListener("click", async () => {
    const built = AuthContexts.buildPayload({ id: acEditing ? acEditing.id : $("acId").value, name: $("acName").value, description: $("acDesc").value, isAvailable: $("acAvail").checked });
    if (!built.ok) { $("acEditWarn").innerHTML = built.errors.map((x) => `<div class="mini" style="color:var(--off)">✗ ${esc(x)}</div>`).join(""); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...AC_WRITE])) return;
    const btn = $("acEditSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isDemo) {
        toast("Demo — <span>save simulated</span>");
      } else {
        // Create-or-update by design: PATCH on the id upserts.
        await Graph.gpatch(`/identity/conditionalAccess/authenticationContextClassReferences/${built.id}`, built.payload, [...AUTH_CONFIG.scopes, ...AC_WRITE]);
        toast(`<span>${esc(built.id)} ${esc(built.payload.displayName)}</span> ${acEditing ? "updated" : "created"}`);
      }
      $("acEditModal").classList.remove("open");
      await openAuthCtx(true);
    } catch (e) {
      console.error("Save authentication context failed:", e);
      $("acEditWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  });

  function openAcDelete(c) {
    if (!c) return;
    acDeleting = c;
    const used = AuthContexts.usedBy(c.id, policies.map((p) => p.raw));
    $("acDelDesc").innerHTML = `<b>${esc(c.id)} ${esc(c.displayName || "")}</b>${c.description ? ` — ${esc(c.description)}` : ""}`;
    $("acDelRefs").innerHTML = used.length
      ? `<div class="mini" style="color:var(--off)">Still referenced by ${used.length} polic${used.length === 1 ? "y" : "ies"} — Graph will refuse this delete.</div>`
      : '<p class="mini muted">Unpublished and unreferenced — Graph allows this delete.</p>';
    $("acDelConfirm").value = ""; $("acDelGo").disabled = true;
    $("acDelModal").classList.add("open");
  }
  $("acDelConfirm").addEventListener("input", (e) => { $("acDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE"; });
  $("acDelCancel").addEventListener("click", () => $("acDelModal").classList.remove("open"));
  $("acDelGo").addEventListener("click", async () => {
    if (!acDeleting) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...AC_WRITE])) return;
    const btn = $("acDelGo"); btn.disabled = true; btn.textContent = "Deleting…";
    try {
      if (isDemo) toast("Demo — <span>delete simulated</span>");
      else {
        await Graph.gdelete(`/identity/conditionalAccess/authenticationContextClassReferences/${acDeleting.id}`, [...AUTH_CONFIG.scopes, ...AC_WRITE]);
        toast(`<span>${esc(acDeleting.id)}</span> deleted`);
      }
      $("acDelModal").classList.remove("open");
      await openAuthCtx(true);
    } catch (e) {
      console.error("Delete authentication context failed:", e);
      toast(`Delete failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "Delete permanently"; }
  });
  $("acMd").addEventListener("click", () => {
    if (!acList) return;
    showReport("🎫 Authentication contexts", "CA-AuthenticationContexts", AuthContexts.toMd(acList, policies.map((p) => p.raw), { tenantName }));
  });

  // ---------- Authentication strengths (BETA — view / create / edit / delete) ----------
  const AS_WRITE = ["Policy.ReadWrite.ConditionalAccess"];
  let asList = null, asCombos = null, asFilter = "all", asQuery = "", asEditing = null, asDeleting = null;

  async function openAuthStr(force) {
    crumb("💪 Authentication strengths");
    show("screen-authstr");
    if (asList && !force) { renderAuthStr(); return; }   // cached
    $("asHead").innerHTML = '<h3>💪 Authentication strengths <span class="tag new">BETA</span></h3><p class="mini" style="margin:6px 0 0">Reading authentication strengths…</p>';
    $("astBody").innerHTML = ""; $("asChips").innerHTML = "";
    try {
      if (isDemo) {
        asList = Object.entries((typeof DEMO_DATA !== "undefined" && DEMO_DATA.depSettings) || {})
          .filter(([k]) => k.startsWith("authStrength:")).map(([, v]) => v);
        // The demo data only carries the strengths its policies reference —
        // add whichever of the three built-ins are missing so the screen
        // shows the real shape of a tenant.
        const demoBuiltins = [
          { id: "00000000-0000-0000-0000-000000000002", displayName: "Multifactor authentication", policyType: "builtIn", description: "Combinations of methods that satisfy strong authentication, such as a password + SMS.", allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor", "deviceBasedPush", "temporaryAccessPassOneTime", "temporaryAccessPassMultiUse", "password,microsoftAuthenticatorPush", "password,softwareOath", "password,hardwareOath", "password,sms", "password,voice", "federatedMultiFactor"] },
          { id: "00000000-0000-0000-0000-000000000003", displayName: "Passwordless MFA", policyType: "builtIn", description: "Passwordless methods that satisfy strong authentication.", allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor", "deviceBasedPush"] },
          { id: "00000000-0000-0000-0000-000000000004", displayName: "Phishing-resistant MFA", policyType: "builtIn", description: "Phishing-resistant, passwordless methods for the strongest authentication.", allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor"] },
        ];
        for (const bi of demoBuiltins) if (!asList.some((p) => (p.id || "").toLowerCase() === bi.id || (p.displayName || "").toLowerCase() === bi.displayName.toLowerCase())) asList.push(bi);
        asCombos = AuthStrengths.FALLBACK_COMBINATIONS;
      } else {
        // $expand brings each policy's combinationConfigurations (AAGUID and
        // certificate restrictions) in one read; fall back to the plain list
        // if a cloud rejects the expand.
        try {
          asList = await Graph.ggetAll("/policies/authenticationStrengthPolicies?$expand=combinationConfigurations");
        } catch {
          asList = await Graph.ggetAll("/policies/authenticationStrengthPolicies");
        }
        // Live combination catalog — new modes appear without a code change.
        try {
          const root = await Graph.gget("/identity/conditionalAccess/authenticationStrength");
          asCombos = (root.authenticationCombinations || []).length ? root.authenticationCombinations : AuthStrengths.FALLBACK_COMBINATIONS;
        } catch { asCombos = AuthStrengths.FALLBACK_COMBINATIONS; }
      }
      renderAuthStr();
    } catch (e) {
      console.error("Authentication strengths failed:", e);
      $("asHead").innerHTML = `<h3>💪 Authentication strengths</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("toolAuthStr").addEventListener("click", () => openAuthStr());
  $("asRefresh").addEventListener("click", () => openAuthStr(true));

  function renderAuthStr() {
    const raws = policies.map((p) => p.raw);
    const s = AuthStrengths.summarize(asList, raws);
    $("asHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>💪 Authentication strengths <span class="tag new">BETA</span> <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">The method combinations a Conditional Access policy can require through <b>Require authentication strength</b>. A sign-in satisfies a strength with <b>any one</b> of its allowed combinations — so every combination on the list is a door, and the weakest door defines the strength.</p>
        <p class="mini muted" style="margin:0">The three built-in strengths are Microsoft-managed and immutable. Custom strengths can be created, renamed, re-combined and — when no policy grants them — deleted.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.total}<span class="mini" style="font-weight:400"> strengths</span></div>
        <div class="mini">${s.builtin} built-in · ${s.custom} custom</div>
        <div class="mini">${s.inUse} granted by a policy · ${s.pr} fully phishing-resistant</div>
      </div></div>`;
    $("asChips").innerHTML = [["all", `All (${s.total})`], ["builtin", `Built-in (${s.builtin})`],
      ["custom", `Custom (${s.custom})`], ["inuse", `Granted (${s.inUse})`]]
      .map(([k, l]) => `<button class="fchip ${asFilter === k ? "active" : ""}" data-asf="${k}">${esc(l)}</button>`).join("");

    const q = asQuery.toLowerCase();
    const rows = (asList || []).filter((p) => {
      const used = AuthStrengths.usedBy(p.id, raws).length;
      if (asFilter === "builtin" && !AuthStrengths.isBuiltIn(p)) return false;
      if (asFilter === "custom" && AuthStrengths.isBuiltIn(p)) return false;
      if (asFilter === "inuse" && !used) return false;
      return !q || `${p.displayName} ${p.description} ${(p.allowedCombinations || []).join(" ")}`.toLowerCase().includes(q);
    }).sort((a, b) => (AuthStrengths.isBuiltIn(b) ? 1 : 0) - (AuthStrengths.isBuiltIn(a) ? 1 : 0) || (a.displayName || "").localeCompare(b.displayName || ""));

    if (!rows.length) { $("astBody").innerHTML = '<p class="mini" style="padding:20px">No authentication strength matches the current filter.</p>'; return; }
    const list = (arr) => arr.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>`).join(", ");
    const classTag = (c) => c === "pr" ? '<span class="tag grant">phishing-resistant</span>' : c === "mfa" ? '<span class="tag">MFA</span>' : '<span class="tag block">allows single-factor</span>';
    $("astBody").innerHTML = `<div class="lo-grid">` + rows.map((p) => {
      const used = AuthStrengths.usedBy(p.id, raws);
      const del = AuthStrengths.deletable(p, raws);
      const combos = p.allowedCombinations || [];
      const builtin = AuthStrengths.isBuiltIn(p);
      return `<div class="list-card lo-card">
        <div class="lo-h">
          <span class="lo-ic">💪</span>
          <b>${esc(p.displayName || "(unnamed)")}</b>
          ${builtin ? '<span class="tag">built-in</span>' : '<span class="tag ok">custom</span>'}
          ${classTag(AuthStrengths.strengthClass(p))}
        </div>
        ${p.description ? `<div class="mini lo-d">${esc(p.description)}</div>` : ""}
        <div class="mini" style="margin:6px 0 0">${combos.slice(0, 6).map((c) => `<span class="tag" title="${esc(AuthStrengths.CLASS_LABEL[AuthStrengths.classify(c)])}">${esc(AuthStrengths.comboLabel(c))}</span>`).join(" ")}${combos.length > 6 ? ` <span class="mini muted">+${combos.length - 6} more</span>` : ""}</div>
        ${AuthStrengths.ccSummary(p.combinationConfigurations).map((x) => `<div class="mini" style="margin:4px 0 0">🔧 ${esc(x)}</div>`).join("")}
        <div class="lo-u">${used.length
          ? `Granted by ${used.length} polic${used.length === 1 ? "y" : "ies"}: ${list(used.slice(0, 3))}${used.length > 3 ? ` <span class="muted">+${used.length - 3} more</span>` : ""}`
          : '<span class="mini muted">Not granted by any policy</span>'}</div>
        <div class="lo-act">${builtin
          ? '<span class="mini muted">Microsoft-managed</span>'
          : `<button class="btn sm" data-asedit="${esc(p.id)}">✎ Edit</button>
             <button class="btn sm danger" data-asdel="${esc(p.id)}" ${del.ok ? "" : `disabled title="${esc(del.why)}"`}>🗑 Delete</button>`}</div>
      </div>`;
    }).join("") + `</div>`;
  }
  $("asChips").addEventListener("click", (e) => { const b = e.target.closest("[data-asf]"); if (!b) return; asFilter = b.dataset.asf; renderAuthStr(); });
  $("asSearch").addEventListener("input", (e) => { asQuery = e.target.value; renderAuthStr(); });
  $("astBody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-asedit]"); if (ed) { openAsEditor(asList.find((x) => x.id === ed.dataset.asedit)); return; }
    const dl = e.target.closest("[data-asdel]"); if (dl && !dl.disabled) { openAsDelete(asList.find((x) => x.id === dl.dataset.asdel)); return; }
    const pl = e.target.closest(".pol-link"); if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });

  function openAsEditor(p) {
    asEditing = p || null;
    $("asEditTitle").textContent = p ? `Edit ${p.displayName}` : "New custom authentication strength";
    $("asEditSub").innerHTML = p
      ? "Renames are a PATCH; the combinations go through Graph's dedicated <b>updateAllowedCombinations</b> action."
      : "Creates a custom strength any Conditional Access policy can then require.";
    $("asName").value = p ? (p.displayName || "") : "";
    $("asDesc").value = p ? (p.description || "") : "";
    const selected = new Set(p ? (p.allowedCombinations || []) : []);
    const cat = { pr: [], mfa: [], single: [] };
    for (const c of (asCombos || AuthStrengths.FALLBACK_COMBINATIONS)) cat[AuthStrengths.classify(c)].push(c);
    const group = (label, arr, warn) => arr.length ? `<div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 2px">${label}${warn ? ` <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">${warn}</span>` : ""}</div>`
      + arr.map((c) => `<label class="chk" style="display:block;margin:2px 0"><input type="checkbox" data-ascombo="${esc(c)}" ${selected.has(c) ? "checked" : ""}> ${esc(AuthStrengths.comboLabel(c))}</label>`).join("") : "";
    $("asCombos").innerHTML =
      group("Phishing-resistant", cat.pr) +
      group("MFA", cat.mfa) +
      group("Single-factor", cat.single, "— including any of these makes the whole strength satisfiable without MFA");
    // Advanced options: seed from the policy's existing configurations
    // (present via $expand; a stale cache without them just starts empty).
    const cfgs = (p && p.combinationConfigurations) || [];
    const fidoCfg = cfgs.find(AuthStrengths.isFidoCfg);
    const x509Cfg = cfgs.find(AuthStrengths.isX509Cfg);
    asAdvA = (fidoCfg?.allowedAAGUIDs || []).map((a) => a.toLowerCase());
    renderAsAdv({
      skis: (x509Cfg?.allowedIssuerSkis || []).join("\n"),
      oids: (x509Cfg?.allowedPolicyOIDs || []).join("\n"),
      applies: x509Cfg?.appliesToCombinations || null,
    });
    $("asEditWarn").innerHTML = "";
    $("asEditModal").classList.add("open");
  }

  // ---- Advanced options panel (AAGUIDs + certificate restrictions) -----
  // asAdvA holds the AAGUID allow-list; the text fields are read at save.
  let asAdvA = [];
  function renderAsAdv(seed) {
    const keepSkis = seed ? seed.skis : ($("asAdvSkis") ? $("asAdvSkis").value : "");
    const keepOids = seed ? seed.oids : ($("asAdvOids") ? $("asAdvOids").value : "");
    const applies = seed && seed.applies
      ? seed.applies
      : [...document.querySelectorAll("#asAdv [data-asx509]")].filter((x) => x.checked).map((x) => x.dataset.asx509);
    const provChecked = (key) => Object.keys(AuthStrengths.PROVIDER_AAGUIDS[key].aaguids).every((a) => asAdvA.includes(a));
    $("asAdv").innerHTML = `
      <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:2px 0 2px">Passkey (FIDO2) — allowed AAGUIDs</div>
      <p class="mini muted" style="margin:0 0 4px">Only passkeys whose Authenticator Attestation GUID is on this list can satisfy the strength. Empty list = any passkey. Applies only when the Passkey (FIDO2) combination is selected above.</p>
      ${Object.entries(AuthStrengths.PROVIDER_AAGUIDS).map(([k, v]) =>
        `<label class="chk" style="display:inline-block;margin:2px 14px 2px 0"><input type="checkbox" data-asprov="${k}" ${provChecked(k) ? "checked" : ""}> ${esc(v.label)}</label>`).join("")}
      <div style="margin:4px 0 2px">${asAdvA.map((a) => `<span class="tag" title="${esc(AuthStrengths.AAGUID_NAME[a] || "custom AAGUID")}">${esc(AuthStrengths.AAGUID_NAME[a] || a)} <a href="#" data-asaagrm="${esc(a)}" style="text-decoration:none">✕</a></span>`).join(" ") || '<span class="mini muted">No restriction — any passkey satisfies it.</span>'}</div>
      <div style="display:flex;gap:6px;margin:4px 0 10px"><input id="asAdvGuid" placeholder="Add AAGUID, e.g. 90a3ccdf-635c-4729-a248-9b709135078f" spellcheck="false" autocomplete="off" style="flex:1"><button class="btn sm" data-asaagadd>+ Add</button></div>
      <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 2px">Certificate-based authentication — issuer and OID restrictions</div>
      <p class="mini muted" style="margin:0 0 4px">The certificate must carry at least one listed issuer SKI <i>and</i> (when both are set) one listed policy OID. Graph allows at most 5 of each. Applies to the selected certificate combination(s):</p>
      <label class="chk" style="display:inline-block;margin:2px 14px 2px 0"><input type="checkbox" data-asx509="x509CertificateSingleFactor" ${applies && applies.includes("x509CertificateSingleFactor") ? "checked" : ""}> Certificate (single-factor)</label>
      <label class="chk" style="display:inline-block;margin:2px 0"><input type="checkbox" data-asx509="x509CertificateMultiFactor" ${applies && applies.includes("x509CertificateMultiFactor") ? "checked" : ""}> Certificate (multifactor)</label>
      <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
        <label class="wi-f" style="flex:1;min-width:200px"><span>Allowed issuer SKIs (one per line, hex)</span><textarea id="asAdvSkis" rows="2" spellcheck="false" placeholder="9A4248C6AC8C2931AB2A86537818E92E7B6C97B6"></textarea></label>
        <label class="wi-f" style="flex:1;min-width:200px"><span>Allowed policy OIDs (one per line)</span><textarea id="asAdvOids" rows="2" spellcheck="false" placeholder="1.2.3.4.6"></textarea></label>
      </div>`;
    $("asAdvSkis").value = keepSkis || "";
    $("asAdvOids").value = keepOids || "";
  }
  $("asAdv").addEventListener("click", (e) => {
    const add = e.target.closest("[data-asaagadd]");
    if (add) {
      const v = $("asAdvGuid").value.trim().toLowerCase();
      if (!AuthStrengths.AAGUID_RE.test(v)) { toast("Not a valid AAGUID — expected 8-4-4-4-12 hex"); return; }
      if (!asAdvA.includes(v)) asAdvA.push(v);
      renderAsAdv(); return;
    }
    const rm = e.target.closest("[data-asaagrm]");
    if (rm) { e.preventDefault(); asAdvA = asAdvA.filter((a) => a !== rm.dataset.asaagrm); renderAsAdv(); return; }
  });
  $("asAdv").addEventListener("change", (e) => {
    const prov = e.target.closest("[data-asprov]");
    if (prov) {
      const set = Object.keys(AuthStrengths.PROVIDER_AAGUIDS[prov.dataset.asprov].aaguids);
      asAdvA = prov.checked ? [...new Set([...asAdvA, ...set])] : asAdvA.filter((a) => !set.includes(a));
      renderAsAdv();
    }
  });
  $("asNew").addEventListener("click", () => openAsEditor(null));
  $("asEditCancel").addEventListener("click", () => $("asEditModal").classList.remove("open"));
  $("asEditSave").addEventListener("click", async () => {
    const combos = [...document.querySelectorAll("#asCombos [data-ascombo]")].filter((x) => x.checked).map((x) => x.dataset.ascombo);
    const built = AuthStrengths.buildPayload({ name: $("asName").value, description: $("asDesc").value, combinations: combos });
    const adv = AuthStrengths.buildAdvanced({
      aaguids: asAdvA,
      skis: ($("asAdvSkis") ? $("asAdvSkis").value : "").split(/[\n,;]+/),
      oids: ($("asAdvOids") ? $("asAdvOids").value : "").split(/[\n,;]+/),
      x509Applies: [...document.querySelectorAll("#asAdv [data-asx509]")].filter((x) => x.checked).map((x) => x.dataset.asx509),
    }, combos);
    const errors = [...(built.ok ? [] : built.errors), ...(adv.ok ? [] : adv.errors)];
    if (errors.length) { $("asEditWarn").innerHTML = errors.map((x) => `<div class="mini" style="color:var(--off)">✗ ${esc(x)}</div>`).join(""); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...AS_WRITE])) return;
    const btn = $("asEditSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      const wanted = [adv.fido2, adv.x509].filter(Boolean);
      if (isDemo) {
        toast("Demo — <span>save simulated</span>");
      } else if (asEditing) {
        // name/description and combinations travel on different endpoints
        const scopes = [...AUTH_CONFIG.scopes, ...AS_WRITE];
        if ((asEditing.displayName || "") !== built.payload.displayName || (asEditing.description || "") !== built.payload.description) {
          await Graph.gpatch(`/policies/authenticationStrengthPolicies/${asEditing.id}`, { displayName: built.payload.displayName, description: built.payload.description }, scopes);
        }
        const a = (asEditing.allowedCombinations || []).slice().sort().join("|");
        if (a !== built.payload.allowedCombinations.slice().sort().join("|")) {
          await Graph.gpost(`/policies/authenticationStrengthPolicies/${asEditing.id}/updateAllowedCombinations`, { allowedCombinations: built.payload.allowedCombinations }, scopes);
        }
        // Advanced restrictions: diff against what the policy had and apply
        // only the changes — create, update or remove per configuration type.
        const base = `/policies/authenticationStrengthPolicies/${asEditing.id}/combinationConfigurations`;
        for (const op of AuthStrengths.ccPlan(asEditing.combinationConfigurations || [], adv)) {
          if (op.method === "post") await Graph.gpost(base, op.body, scopes);
          else if (op.method === "patch") await Graph.gpatch(`${base}/${op.id}`, op.body, scopes);
          else await Graph.gdelete(`${base}/${op.id}`, scopes);
        }
        toast(`<span>${esc(built.payload.displayName)}</span> updated`);
      } else {
        // A create carries the restrictions inline — one POST, no follow-ups.
        const body = wanted.length ? { ...built.payload, combinationConfigurations: wanted } : built.payload;
        await Graph.gpost("/policies/authenticationStrengthPolicies", body, [...AUTH_CONFIG.scopes, ...AS_WRITE]);
        toast(`<span>${esc(built.payload.displayName)}</span> created`);
      }
      $("asEditModal").classList.remove("open");
      await openAuthStr(true);
    } catch (e) {
      console.error("Save authentication strength failed:", e);
      $("asEditWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  });

  function openAsDelete(p) {
    if (!p) return;
    asDeleting = p;
    const used = AuthStrengths.usedBy(p.id, policies.map((x) => x.raw));
    $("asDelDesc").innerHTML = `<b>${esc(p.displayName)}</b> — ${(p.allowedCombinations || []).length} combination${(p.allowedCombinations || []).length === 1 ? "" : "s"}`;
    $("asDelRefs").innerHTML = used.length
      ? `<div class="mini" style="color:var(--off)">Granted by ${used.length} polic${used.length === 1 ? "y" : "ies"} — Graph will refuse this delete.</div>`
      : '<p class="mini muted">Not granted by any policy — Graph allows this delete.</p>';
    $("asDelConfirm").value = ""; $("asDelGo").disabled = true;
    $("asDelModal").classList.add("open");
  }
  $("asDelConfirm").addEventListener("input", (e) => { $("asDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE"; });
  $("asDelCancel").addEventListener("click", () => $("asDelModal").classList.remove("open"));
  $("asDelGo").addEventListener("click", async () => {
    if (!asDeleting) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...AS_WRITE])) return;
    const btn = $("asDelGo"); btn.disabled = true; btn.textContent = "Deleting…";
    try {
      if (isDemo) toast("Demo — <span>delete simulated</span>");
      else {
        await Graph.gdelete(`/policies/authenticationStrengthPolicies/${asDeleting.id}`, [...AUTH_CONFIG.scopes, ...AS_WRITE]);
        toast(`<span>${esc(asDeleting.displayName)}</span> deleted`);
      }
      $("asDelModal").classList.remove("open");
      await openAuthStr(true);
    } catch (e) {
      console.error("Delete authentication strength failed:", e);
      toast(`Delete failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "Delete permanently"; }
  });
  $("asMd").addEventListener("click", () => {
    if (!asList) return;
    showReport("💪 Authentication strengths", "CA-AuthenticationStrengths", AuthStrengths.toMd(asList, policies.map((p) => p.raw), { tenantName }));
  });

  // ---------- Terms of use (BETA — view / create / edit / delete agreements) ----------
  const TU_READ = ["Agreement.Read.All"];
  const TU_WRITE = ["Agreement.ReadWrite.All"];
  const TU_ACCEPT = ["AgreementAcceptance.Read.All"];
  let tuList = null, tuFilter = "all", tuQuery = "", tuEditing = null, tuDeleting = null;
  let tuPdfB64 = null, tuPdfName = null;
  const TU_DEMO = [
    { id: "tou-demo-1", displayName: "Employee acceptable use 2026", isViewingBeforeAcceptanceRequired: true, isPerDeviceAcceptanceRequired: false,
      userReacceptRequiredFrequency: "P365D", files: [{ fileName: "AUP-2026.pdf", language: "en", isDefault: true, fileData: { data: "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNjA+PnN0cmVhbQpCVCAvRjEgMTggVGYgNzIgNzIwIFRkIChFTkNBIGRlbW8gdGVybXMgb2YgdXNlKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+" } }, { fileName: "AUP-2026-nl.pdf", language: "nl" }] },
    { id: "tou-demo-2", displayName: "Guest collaboration terms", isViewingBeforeAcceptanceRequired: true, isPerDeviceAcceptanceRequired: true,
      userReacceptRequiredFrequency: null, files: [{ fileName: "GuestTerms.pdf", language: "en", isDefault: true }] },
  ];

  async function openTou(force) {
    crumb("📜 Terms of use");
    show("screen-tou");
    if (tuList && !force) { renderTou(); return; }   // cached
    $("tuHead").innerHTML = '<h3>📜 Terms of use <span class="tag new">BETA</span></h3><p class="mini" style="margin:6px 0 0">Reading terms-of-use agreements…</p>';
    $("tuBody").innerHTML = ""; $("tuChips").innerHTML = "";
    try {
      if (isDemo) tuList = TU_DEMO;
      else {
        if (!await preConsent([...AUTH_CONFIG.scopes, ...TU_READ])) { $("tuHead").innerHTML = '<h3>📜 Terms of use</h3><p class="mini">Reading agreements needs Agreement.Read.All.</p>'; return; }
        // The LIST endpoint does not return the file localizations' fileData
        // (and on some tenants not the files at all) — only a per-agreement
        // GET with $expand=files carries the PDFs. Tenants hold a handful of
        // agreements, so fetch each one fully.
        const ids = await Graph.ggetAll("/identityGovernance/termsOfUse/agreements");
        tuList = await Promise.all(ids.map((a) =>
          Graph.gget(`/identityGovernance/termsOfUse/agreements/${a.id}?$expand=files`, [...AUTH_CONFIG.scopes, ...TU_READ]).catch(() => a)));
      }
      renderTou();
    } catch (e) {
      console.error("Terms of use failed:", e);
      $("tuHead").innerHTML = `<h3>📜 Terms of use</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}</p>`;
    }
  }
  $("toolTou").addEventListener("click", () => openTou());
  $("tuRefresh").addEventListener("click", () => openTou(true));

  function renderTou() {
    const raws = policies.map((p) => p.raw);
    const s = TermsOfUse.summarize(tuList, raws);
    $("tuHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>📜 Terms of use <span class="tag new">BETA</span> <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">The agreements a Conditional Access policy can require through its <b>terms of use</b> grant control. Each card shows the agreement's behaviour, its PDFs per language, and the policies requiring it.</p>
        <p class="mini muted" style="margin:0">The display name is internal — end users see the PDF, not the name. Deleting an agreement a policy still requires would leave a dangling grant, so that delete is blocked. Replacing a PDF (new version / extra language) is not in this tool yet — use the portal for that.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.total}<span class="mini" style="font-weight:400"> agreement${s.total === 1 ? "" : "s"}</span></div>
        <div class="mini">${s.files} PDF file${s.files === 1 ? "" : "s"} · ${s.inUse} required by a policy</div>
        <div class="mini">${s.perDevice} per-device · ${s.reaccept} with a re-accept schedule</div>
      </div></div>`;
    $("tuChips").innerHTML = [["all", `All (${s.total})`], ["inuse", `Required (${s.inUse})`],
      ["unused", `Unreferenced (${s.total - s.inUse})`], ["reaccept", `↻ Re-accept (${s.reaccept})`]]
      .map(([k, l]) => `<button class="fchip ${tuFilter === k ? "active" : ""}" data-tuf="${k}">${esc(l)}</button>`).join("");

    const q = tuQuery.toLowerCase();
    const rows = (tuList || []).filter((a) => {
      const used = TermsOfUse.usedBy(a.id, raws).length;
      if (tuFilter === "inuse" && !used) return false;
      if (tuFilter === "unused" && used) return false;
      if (tuFilter === "reaccept" && !a.userReacceptRequiredFrequency) return false;
      return !q || (a.displayName || "").toLowerCase().includes(q);
    }).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

    if (!rows.length) {
      $("tuBody").innerHTML = s.total
        ? '<p class="mini" style="padding:20px">No agreement matches the current filter.</p>'
        : '<p class="mini" style="padding:20px">No terms-of-use agreements exist in this tenant yet.</p>';
      return;
    }
    const list = (arr) => arr.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>`).join(", ");
    $("tuBody").innerHTML = `<div class="lo-grid">` + rows.map((a) => {
      const used = TermsOfUse.usedBy(a.id, raws);
      const del = TermsOfUse.deletable(a, raws);
      const files = TermsOfUse.fileList(a);
      return `<div class="list-card lo-card">
        <div class="lo-h">
          <span class="lo-ic">📜</span>
          <b>${esc(a.displayName || "(unnamed)")}</b>
          ${TermsOfUse.settingTags(a).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ") || '<span class="tag">accept only</span>'}
        </div>
        <div class="mini lo-d">${files.length ? files.map((f, i) => `${esc(f.language || "?")}: ${esc(f.fileName || "file")}${f.fileData?.data ? ` <button class="btn sm" data-tupdf="${esc(a.id)}:${i}" style="font-size:11px;padding:1px 8px">⭳ PDF</button>` : ""}`).join(" · ") : "no files"}</div>
        <div class="lo-u">${used.length
          ? `Required by ${used.length} polic${used.length === 1 ? "y" : "ies"}: ${list(used.slice(0, 3))}${used.length > 3 ? ` <span class="muted">+${used.length - 3} more</span>` : ""}`
          : '<span class="mini muted">Not required by any policy</span>'}</div>
        <div class="lo-act">
          <button class="btn sm" data-tuedit="${esc(a.id)}">✎ Edit</button>
          <button class="btn sm" data-tuacc="${esc(a.id)}">👥 Acceptances</button>
          <button class="btn sm danger" data-tudel="${esc(a.id)}" ${del.ok ? "" : `disabled title="${esc(del.why)}"`}>🗑 Delete</button>
        </div>
        <div class="mini" id="tuAcc-${esc(a.id)}" style="margin-top:6px"></div>
      </div>`;
    }).join("") + `</div>`;
  }
  $("tuChips").addEventListener("click", (e) => { const b = e.target.closest("[data-tuf]"); if (!b) return; tuFilter = b.dataset.tuf; renderTou(); });
  $("tuSearch").addEventListener("input", (e) => { tuQuery = e.target.value; renderTou(); });
  $("tuBody").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-tuedit]"); if (ed) { openTuEditor(tuList.find((x) => x.id === ed.dataset.tuedit)); return; }
    const dl = e.target.closest("[data-tudel]"); if (dl && !dl.disabled) { openTuDelete(tuList.find((x) => x.id === dl.dataset.tudel)); return; }
    const ac = e.target.closest("[data-tuacc]"); if (ac) { await tuLoadAcceptances(ac.dataset.tuacc, ac); return; }
    const pf = e.target.closest("[data-tupdf]"); if (pf) { tuDownloadPdf(pf.dataset.tupdf); return; }
    const pl = e.target.closest(".pol-link"); if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });

  function tuDownloadPdf(key) {
    const [id, idx] = key.split(":");
    const a = tuList.find((x) => x.id === id); if (!a) return;
    const f = TermsOfUse.fileList(a)[+idx]; if (!f?.fileData?.data) return;
    const bytes = Uint8Array.from(atob(f.fileData.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = f.fileName || "TermsOfUse.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Acceptance summary, on demand per agreement — needs its own permission,
  // so a refusal degrades to a clear message rather than blocking the tool.
  async function tuLoadAcceptances(id, btn) {
    const out = $(`tuAcc-${id}`); if (!out) return;
    if (isDemo) {
      out.innerHTML = '<b style="color:var(--on)">14 accepted</b> · <b style="color:var(--off)">1 declined</b> — latest: demo.user@contoso.com, yesterday <span class="muted">(demo)</span>';
      return;
    }
    btn.disabled = true; btn.textContent = "Loading…";
    try {
      if (!await preConsent([...AUTH_CONFIG.scopes, ...TU_ACCEPT])) { btn.disabled = false; btn.textContent = "👥 Acceptances"; return; }
      const acc = await Graph.ggetAll(`/identityGovernance/termsOfUse/agreements/${id}/acceptances`);
      const ok = acc.filter((x) => (x.state || "").toLowerCase() === "accepted");
      const no = acc.filter((x) => (x.state || "").toLowerCase() !== "accepted");
      const latest = acc.slice().sort((a, b) => (b.recordedDateTime || "").localeCompare(a.recordedDateTime || ""))[0];
      out.innerHTML = acc.length
        ? `<b style="color:var(--on)">${ok.length} accepted</b>${no.length ? ` · <b style="color:var(--off)">${no.length} declined/other</b>` : ""}${latest ? ` — latest: ${esc(latest.userPrincipalName || latest.userEmail || "?")}, ${esc((latest.recordedDateTime || "").slice(0, 10))}` : ""}`
        : "No acceptance records yet.";
    } catch (e) {
      out.innerHTML = `<span style="color:var(--off)">Acceptances not readable: ${esc(e.message || e)} — needs AgreementAcceptance.Read.All.</span>`;
    } finally { btn.disabled = false; btn.textContent = "👥 Acceptances"; }
  }

  function openTuEditor(a) {
    tuEditing = a || null; tuPdfB64 = null; tuPdfName = null;
    $("tuEditTitle").textContent = a ? `Edit ${a.displayName}` : "New terms-of-use agreement";
    $("tuEditSub").innerHTML = a
      ? "Behaviour settings and the name — replacing the PDF is not in this tool yet."
      : "Creates the agreement with one PDF; more languages can be added in the portal later.";
    $("tuPdfWrap").style.display = a ? "none" : "";
    // When editing, the current PDFs are shown read-only — language, default
    // marker and a download per file — so the document is viewable from here.
    const files = a ? TermsOfUse.fileList(a) : [];
    $("tuFilesList").style.display = a && files.length ? "" : "none";
    $("tuFilesList").innerHTML = a && files.length
      ? `<div class="mini" style="font-weight:700;margin-bottom:2px">Current PDFs</div>` + files.map((f, i) =>
          `<div class="mini" style="margin:2px 0">🌐 <b>${esc(f.language || "?")}</b>${f.isDefault ? ' <span class="tag ok">default</span>' : ""} — ${esc(f.fileName || "file")}
           ${f.fileData?.data ? `<button class="btn sm" data-tupdf="${esc(a.id)}:${i}" style="font-size:11px;padding:1px 8px">⭳ View PDF</button>` : ' <span class="muted">(content not returned by Graph)</span>'}</div>`).join("")
      : "";
    $("tuName").value = a ? (a.displayName || "") : "";
    $("tuPdf").value = ""; $("tuLang").value = "en"; tuPdfB64 = null; tuPdfName = null; tuPdfReady = null;
    $("tuView").checked = a ? !!a.isViewingBeforeAcceptanceRequired : true;
    $("tuDevice").checked = a ? !!a.isPerDeviceAcceptanceRequired : false;
    $("tuReaccept").innerHTML = TermsOfUse.FREQ_OPTIONS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    $("tuReaccept").value = a ? (a.userReacceptRequiredFrequency || "") : "";
    $("tuEditWarn").innerHTML = "";
    $("tuEditModal").classList.add("open");
  }
  // The file is read asynchronously — Save awaits tuPdfReady so a quick
  // Save right after picking the file cannot race the reader.
  let tuPdfReady = null;
  $("tuPdf").addEventListener("change", (e) => {
    const f = e.target.files[0];
    tuPdfB64 = null; tuPdfName = null; tuPdfReady = null;
    if (!f) return;
    tuPdfName = f.name;
    tuPdfReady = new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => { tuPdfB64 = String(r.result).split(",")[1] || null; resolve(); };
      r.onerror = () => resolve();
      r.readAsDataURL(f);
    });
  });
  $("tuNew").addEventListener("click", () => openTuEditor(null));
  $("tuEditCancel").addEventListener("click", () => $("tuEditModal").classList.remove("open"));
  $("tuFilesList").addEventListener("click", (e) => {
    const pf = e.target.closest("[data-tupdf]"); if (pf) tuDownloadPdf(pf.dataset.tupdf);
  });
  $("tuEditSave").addEventListener("click", async () => {
    if (tuPdfReady) await tuPdfReady;   // finish reading a just-picked PDF
    const built = TermsOfUse.buildPayload({
      name: $("tuName").value, viewRequired: $("tuView").checked, perDevice: $("tuDevice").checked,
      reaccept: $("tuReaccept").value || null, pdfBase64: tuPdfB64, pdfName: tuPdfName, language: $("tuLang").value,
    }, tuEditing ? "edit" : "create");
    if (!built.ok) { $("tuEditWarn").innerHTML = built.errors.map((x) => `<div class="mini" style="color:var(--off)">✗ ${esc(x)}</div>`).join(""); return; }
    if (!await preConsent([...AUTH_CONFIG.scopes, ...TU_WRITE])) return;
    const btn = $("tuEditSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (isDemo) {
        toast("Demo — <span>save simulated</span>");
      } else if (tuEditing) {
        await Graph.gpatch(`/identityGovernance/termsOfUse/agreements/${tuEditing.id}`, built.payload, [...AUTH_CONFIG.scopes, ...TU_WRITE]);
        toast(`<span>${esc(built.payload.displayName)}</span> updated`);
      } else {
        // The create API accepts only displayName + isViewingBeforeAcceptanceRequired
        // + files — the behaviour extras (per-device, re-accept) go in a
        // follow-up PATCH, or the POST is rejected outright.
        const { createBody, extras } = TermsOfUse.splitCreate(built.payload);
        const made = await Graph.gpost("/identityGovernance/termsOfUse/agreements", createBody, [...AUTH_CONFIG.scopes, ...TU_WRITE]);
        if (extras) {
          try { await Graph.gpatch(`/identityGovernance/termsOfUse/agreements/${made.id}`, extras, [...AUTH_CONFIG.scopes, ...TU_WRITE]); }
          catch (e2) { console.warn("Behaviour settings after create failed:", e2.message); toast(`Created, but the behaviour settings failed: <span>${esc(e2.message || e2)}</span> — edit the agreement to retry`); }
        }
        toast(`<span>${esc(built.payload.displayName)}</span> created`);
      }
      $("tuEditModal").classList.remove("open");
      await openTou(true);
    } catch (e) {
      console.error("Save agreement failed:", e);
      $("tuEditWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  });

  function openTuDelete(a) {
    if (!a) return;
    tuDeleting = a;
    const used = TermsOfUse.usedBy(a.id, policies.map((p) => p.raw));
    $("tuDelDesc").innerHTML = `<b>${esc(a.displayName)}</b> — ${TermsOfUse.fileList(a).length} PDF file${TermsOfUse.fileList(a).length === 1 ? "" : "s"}`;
    $("tuDelRefs").innerHTML = used.length
      ? `<div class="mini" style="color:var(--off)">Required by ${used.length} polic${used.length === 1 ? "y" : "ies"} — remove it from the grant first.</div>`
      : '<p class="mini muted">Not required by any policy.</p>';
    $("tuDelConfirm").value = ""; $("tuDelGo").disabled = true;
    $("tuDelModal").classList.add("open");
  }
  $("tuDelConfirm").addEventListener("input", (e) => { $("tuDelGo").disabled = e.target.value.trim().toUpperCase() !== "DELETE"; });
  $("tuDelCancel").addEventListener("click", () => $("tuDelModal").classList.remove("open"));
  $("tuDelGo").addEventListener("click", async () => {
    if (!tuDeleting) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...TU_WRITE])) return;
    const btn = $("tuDelGo"); btn.disabled = true; btn.textContent = "Deleting…";
    try {
      if (isDemo) toast("Demo — <span>delete simulated</span>");
      else {
        await Graph.gdelete(`/identityGovernance/termsOfUse/agreements/${tuDeleting.id}`, [...AUTH_CONFIG.scopes, ...TU_WRITE]);
        toast(`<span>${esc(tuDeleting.displayName)}</span> deleted`);
      }
      $("tuDelModal").classList.remove("open");
      await openTou(true);
    } catch (e) {
      console.error("Delete agreement failed:", e);
      toast(`Delete failed: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "Delete permanently"; }
  });
  $("tuMd").addEventListener("click", () => {
    if (!tuList) return;
    showReport("📜 Terms of use", "CA-TermsOfUse", TermsOfUse.toMd(tuList, policies.map((p) => p.raw), { tenantName }));
  });

  // ---------- Recycle bin (BETA — view / restore deleted CA policies & locations) ----------
  const RC_WRITE = ["Policy.ReadWrite.ConditionalAccess"];
  let rcPols = null, rcLocs = null, rcFilter = "all", rcQuery = "", rcRestoring = null;
  // Demo data: two deleted policies (one was On — the dangerous restore) and
  // a deleted location, with believable deletion timestamps.
  const RC_DEMO = () => {
    const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
    return {
      pols: [
        { id: "del-pol-1", displayName: "CA004-GRANT-Global-MFA-AllApps-AnyPlatform-v2.9 (superseded)", state: "disabled", deletedDateTime: ago(3),
          conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] } }, grantControls: { builtInControls: ["mfa"] } },
        { id: "del-pol-2", displayName: "CA210-BLOCK-Internals-LegacyAuth-v1.0", state: "enabled", deletedDateTime: ago(26),
          conditions: { users: { includeGroups: ["g1"] }, applications: { includeApplications: ["All"] }, clientAppTypes: ["exchangeActiveSync", "other"] }, grantControls: { builtInControls: ["block"] } },
      ],
      locs: [
        { id: "del-loc-1", displayName: "Old branch office", "@odata.type": "#microsoft.graph.ipNamedLocation", isTrusted: true, deletedDateTime: ago(12), ipRanges: [{ cidrAddress: "198.51.100.0/24" }] },
      ],
    };
  };

  async function openRecycle(force) {
    crumb("♻ Recycle bin");
    show("screen-recycle");
    if (rcPols && !force) { renderRecycle(); return; }   // cached
    $("rcHead").innerHTML = '<h3>♻ Recycle bin</h3><p class="mini" style="margin:6px 0 0">Reading recently deleted policies and named locations…</p>';
    $("rcBody").innerHTML = ""; $("rcChips").innerHTML = "";
    try {
      if (isDemo) {
        const d = RC_DEMO(); rcPols = d.pols; rcLocs = d.locs;
      } else {
        [rcPols, rcLocs] = await Promise.all([
          Graph.ggetAll("/identity/conditionalAccess/deletedItems/policies"),
          Graph.ggetAll("/identity/conditionalAccess/deletedItems/namedLocations").catch(() => []),
        ]);
      }
      renderRecycle();
    } catch (e) {
      console.error("Recycle bin failed:", e);
      $("rcHead").innerHTML = `<h3>♻ Recycle bin</h3><p class="mini" style="color:var(--off)">Failed: ${esc(e.message || e)}${/403|Authorization/i.test(String(e.message || e)) ? " — reading the recycle bin needs the Security Administrator or Conditional Access Administrator role." : ""}</p>`;
    }
  }
  $("toolRecycle").addEventListener("click", () => openRecycle());
  $("rcRefresh").addEventListener("click", () => openRecycle(true));

  function renderRecycle() {
    const s = Recycle.summarize(rcPols, rcLocs);
    $("rcHead").innerHTML = `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>♻ Recycle bin <span class="tag block">writes to tenant</span></h3>
        <p style="margin-bottom:4px">Deleted Conditional Access policies and named locations stay restorable for <b>${Recycle.RETENTION_DAYS} days</b>, then they are permanently gone. Each card shows what the item did, when it was deleted and how long it has left.</p>
        <p class="mini muted" style="margin:0">A restored policy returns <b>in the state it was deleted in</b> — a policy that was On enforces again the moment it comes back, so that restore asks for an extra confirmation.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.total}<span class="mini" style="font-weight:400"> deleted item${s.total === 1 ? "" : "s"}</span></div>
        <div class="mini">${s.policies} polic${s.policies === 1 ? "y" : "ies"} · ${s.locations} location${s.locations === 1 ? "" : "s"}</div>
        <div class="mini">${s.wereOn ? `${s.wereOn} ${s.wereOn === 1 ? "was" : "were"} On at deletion` : "none were On at deletion"}${s.expiringSoon ? ` · <b style="color:var(--off)">${s.expiringSoon} expiring ≤ 7 days</b>` : ""}</div>
      </div></div>`;
    $("rcChips").innerHTML = [["all", `All (${s.total})`], ["policies", `Policies (${s.policies})`],
      ["locations", `Locations (${s.locations})`], ["expiring", `⏳ Expiring ≤ 7 days (${s.expiringSoon})`]]
      .map(([k, l]) => `<button class="fchip ${rcFilter === k ? "active" : ""}" data-rcf="${k}">${esc(l)}</button>`).join("");

    const liveNames = policies.map((p) => p.raw.displayName);
    const q = rcQuery.toLowerCase();
    const items = [
      ...(rcPols || []).map((p) => ({ kind: "policy", it: p })),
      ...(rcLocs || []).map((l) => ({ kind: "location", it: l })),
    ].filter(({ kind, it }) => {
      if (rcFilter === "policies" && kind !== "policy") return false;
      if (rcFilter === "locations" && kind !== "location") return false;
      if (rcFilter === "expiring") { const d = Recycle.daysLeft(it); if (d === null || d > 7) return false; }
      return !q || (it.displayName || "").toLowerCase().includes(q);
    }).sort((a, b) => (Recycle.daysLeft(a.it) ?? 99) - (Recycle.daysLeft(b.it) ?? 99));

    if (!items.length) {
      $("rcBody").innerHTML = s.total
        ? '<p class="mini" style="padding:20px">No deleted item matches the current filter.</p>'
        : '<p class="mini" style="padding:20px">The recycle bin is empty — nothing has been deleted in the last 30 days.</p>';
      return;
    }
    $("rcBody").innerHTML = `<div class="lo-grid">` + items.map(({ kind, it }) => {
      const d = Recycle.daysLeft(it);
      const clash = Recycle.nameClash(it, liveNames);
      const wasOn = kind === "policy" && Recycle.restoresEnforcing(it);
      return `<div class="list-card lo-card">
        <div class="lo-h">
          <span class="lo-ic">${kind === "policy" ? "🗂" : "🌐"}</span>
          <b>${esc(it.displayName || "(unnamed)")}</b>
          ${kind === "policy" ? `<span class="tag ${wasOn ? "block" : ""}">${esc(Recycle.stateLabel(it.state))} at deletion</span>` : '<span class="tag">named location</span>'}
        </div>
        <div class="mini lo-d">${esc(kind === "policy" ? Recycle.policyBrief(it) : Recycle.locationBrief(it))}</div>
        <div class="lo-u mini">Deleted ${esc(Recycle.deletedAgo(it))} · ${d === null ? "retention unknown" : d <= 7 ? `<b style="color:var(--off)">${d} day${d === 1 ? "" : "s"} left</b>` : `${d} days left`}
          ${clash ? '<br><span style="color:var(--off)">⚠ an item with this name exists again — restoring creates a duplicate name</span>' : ""}</div>
        <div class="lo-act"><button class="btn sm lemon" data-rcres="${esc(it.id)}" data-rckind="${kind}">♻ Restore</button></div>
      </div>`;
    }).join("") + `</div>`;
  }
  $("rcChips").addEventListener("click", (e) => { const b = e.target.closest("[data-rcf]"); if (!b) return; rcFilter = b.dataset.rcf; renderRecycle(); });
  $("rcSearch").addEventListener("input", (e) => { rcQuery = e.target.value; renderRecycle(); });
  $("rcBody").addEventListener("click", (e) => {
    const r = e.target.closest("[data-rcres]"); if (!r) return;
    const kind = r.dataset.rckind;
    const it = (kind === "policy" ? rcPols : rcLocs).find((x) => x.id === r.dataset.rcres);
    if (it) openRcRestore(kind, it);
  });

  function openRcRestore(kind, it) {
    rcRestoring = { kind, it };
    const wasOn = kind === "policy" && Recycle.restoresEnforcing(it);
    const clash = Recycle.nameClash(it, policies.map((p) => p.raw.displayName));
    $("rcResDesc").innerHTML = `<b>${esc(it.displayName || "(unnamed)")}</b> — ${esc(kind === "policy" ? `${Recycle.stateLabel(it.state)} at deletion · ${Recycle.policyBrief(it)}` : Recycle.locationBrief(it))}<br>Deleted ${esc(Recycle.deletedAgo(it))}, ${Recycle.daysLeft(it) ?? "?"} days left in the bin.`;
    $("rcResWarn").innerHTML = [
      wasOn ? "" : `<div class="mini muted">Restores ${kind === "policy" ? `as <b>${esc(Recycle.stateLabel(it.state))}</b> — it will not enforce until you switch it On` : "with its previous definition"}.</div>`,
      clash ? '<div class="mini" style="color:var(--off)">⚠ An item with this display name exists again — after the restore there will be two with the same name.</div>' : "",
      kind === "location" && it.isTrusted ? '<div class="mini" style="color:var(--off)">⚠ This location was <b>trusted</b> — policies using “All trusted locations” will follow it again immediately.</div>' : "",
    ].filter(Boolean).join("");
    $("rcResConfirmWrap").style.display = wasOn ? "" : "none";
    $("rcResConfirm").value = "";
    $("rcResGo").disabled = wasOn;
    $("rcResModal").classList.add("open");
  }
  $("rcResConfirm").addEventListener("input", (e) => { $("rcResGo").disabled = e.target.value.trim().toUpperCase() !== "RESTORE"; });
  $("rcResCancel").addEventListener("click", () => $("rcResModal").classList.remove("open"));
  $("rcResGo").addEventListener("click", async () => {
    if (!rcRestoring) return;
    if (!await preConsent([...AUTH_CONFIG.scopes, ...RC_WRITE])) return;
    const { kind, it } = rcRestoring;
    const btn = $("rcResGo"); btn.disabled = true; btn.textContent = "Restoring…";
    try {
      if (isDemo) {
        toast("Demo — <span>restore simulated</span>");
        if (kind === "policy") rcPols = rcPols.filter((x) => x.id !== it.id); else rcLocs = rcLocs.filter((x) => x.id !== it.id);
        $("rcResModal").classList.remove("open");
        renderRecycle();
        return;
      }
      await Graph.gpost(`/identity/conditionalAccess/deletedItems/${kind === "policy" ? "policies" : "namedLocations"}/${it.id}/restore`, {}, [...AUTH_CONFIG.scopes, ...RC_WRITE]);
      toast(`<span>${esc(it.displayName || it.id)}</span> restored`);
      $("rcResModal").classList.remove("open");
      // the live policy set changed — reload it so every tool sees the restore
      if (kind === "policy") { try { await loadFromGraph(true); } catch (e2) { console.warn("Reload after restore failed:", e2.message); } }
      await openRecycle(true);
    } catch (e) {
      console.error("Restore failed:", e);
      $("rcResWarn").innerHTML = `<div class="mini" style="color:var(--off)">✗ ${esc(e.message || e)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Restore"; }
  });
  $("rcMd").addEventListener("click", () => {
    if (!rcPols && !rcLocs) return;
    showReport("♻ Recycle bin", "CA-RecycleBin", Recycle.toMd(rcPols, rcLocs, { tenantName }));
  });

  // ---------- What-If (Entra Conditional Access What If tool) ----------
  let wiResult = null, wiScenario = null, wiLocations = null, wiNames = {};
  // filters over the policies that did NOT apply (R30)
  let wiNaPersona = "all", wiNaWhy = "all", wiNaNum = "";
  function openWhatIf() {
    crumb("🧪 What-If");
    show("screen-whatif");
    $("wiHead").innerHTML = `<h3>🧪 What-If</h3>
      <p style="margin-bottom:6px">Describe a sign-in and every <b>enabled</b> or <b>report-only</b> policy is evaluated against it — which would apply (and the controls to satisfy), and which would not, with the first condition that wasn't met.</p>
      <p class="mini muted" style="margin:0">Mirrors the <a href="https://learn.microsoft.com/entra/identity/conditional-access/what-if-tool" target="_blank" rel="noopener">Entra Conditional Access What If tool</a>. Like the Microsoft tool it does not follow Conditional Access <b>service dependencies</b>, an app <i>group</i> (Office 365) never matches — use the app itself — and a condition the scenario leaves unspecified cannot be evaluated, so that policy will not apply.</p>`;
    if (!policies.length) { $("wiBody").innerHTML = '<p class="mini">No policies loaded.</p>'; return; }
    if (wiResult) renderWhatIf();   // keep the last run when returning to the tab
  }
  $("toolWhatIf").addEventListener("click", () => { openWhatIf(); });
  $("wiApp").addEventListener("change", (e) => { $("wiAppIdWrap").style.display = e.target.value === "custom" ? "" : "none"; });
  $("wiReset").addEventListener("click", () => {
    ["wiUser", "wiIp", "wiCountry", "wiAppId"].forEach((id) => $(id).value = "");
    ["wiDevice", "wiSignInRisk", "wiUserRisk", "wiInsiderRisk", "wiFlow"].forEach((id) => $(id).value = "");
    $("wiApp").value = "00000002-0000-0ff1-ce00-000000000000"; $("wiAppIdWrap").style.display = "none";
    $("wiAppList").innerHTML = ""; wiAppMap.clear(); wiAppSay("");
    $("wiPlatform").value = "windows"; $("wiClient").value = "browser";
    wiResult = null; $("wiBody").innerHTML = ""; $("wiMd").style.display = "none";
  });
  // user type-ahead, same shape as the validator's
  let wiSugTimer = null;
  $("wiUser").addEventListener("input", (e) => {
    const v = e.target.value; clearTimeout(wiSugTimer);
    wiSugTimer = setTimeout(async () => {
      const t = v.trim(); if (t.length < 2 || isDemo) return;
      try {
        const f = t.replace(/'/g, "''");
        const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
        $("wiUserList").innerHTML = ((r && r.value) || []).map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
      } catch (err) { console.warn("what-if: suggest failed", err.message); }
    }, 250);
  });

  // ---- R31: search the tenant's apps, not their GUIDs ----------------
  // "Other — enter an App ID" asked for a raw GUID. Nobody knows their apps by
  // GUID, and a mistyped one does not fail: it quietly describes a sign-in to
  // an app nobody has. So: type a name, get the id. A pasted GUID keeps
  // working and is resolved to a name for confirmation — but an id with no
  // service principal here is still legitimate (a policy can reference one,
  // which Import already has to handle), so it is reported, never refused.
  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let wiAppMap = new Map();     // lowercased display name -> { appId, name }
  let wiAppTimer = null;
  function wiAppSay(text, cls) {
    const el = $("wiAppFound");
    if (!el) return;
    el.textContent = text || "";
    el.className = `mini wi-appfound${cls ? " " + cls : ""}`;
  }
  async function wiResolveAppId(guid) {
    if (isDemo) return null;
    try {
      const r = await Graph.gget(`/servicePrincipals?$filter=appId eq '${guid}'&$select=appId,displayName&$top=1`);
      return ((r && r.value) || [])[0] || null;
    } catch (e) { console.warn("what-if: app id lookup failed", e.message); return null; }
  }
  $("wiAppId").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    clearTimeout(wiAppTimer);
    if (!v) { wiAppSay(""); return; }
    // a name picked from the list resolves locally, no round trip
    const hit = wiAppMap.get(v.toLowerCase());
    if (hit) { wiAppSay(`→ ${hit.name} · ${hit.appId}`, "ok"); return; }
    wiAppTimer = setTimeout(async () => {
      if (GUID_RE.test(v)) {
        const sp = await wiResolveAppId(v);
        if (sp) { wiAppMap.set((sp.displayName || "").toLowerCase(), { appId: sp.appId, name: sp.displayName }); wiAppSay(`→ ${sp.displayName}`, "ok"); }
        else wiAppSay("No service principal with this id in this tenant — a policy can still name it, so the run will use it as typed", "warn");
        return;
      }
      if (v.length < 2 || isDemo) return;
      try {
        const f = v.replace(/'/g, "''");
        const r = await Graph.gget(`/servicePrincipals?$filter=startswith(displayName,'${f}')&$select=appId,displayName&$top=10`);
        const rows = (r && r.value) || [];
        rows.forEach((sp) => wiAppMap.set((sp.displayName || "").toLowerCase(), { appId: sp.appId, name: sp.displayName }));
        // the NAME is the value, because that is what somebody is typing; the
        // id rides along as the label so the choice is still verifiable
        $("wiAppList").innerHTML = rows.map((sp) => `<option value="${esc(sp.displayName || "")}" label="${esc(sp.appId || "")}"></option>`).join("");
        wiAppSay(rows.length ? `${rows.length} match${rows.length === 1 ? "" : "es"} — pick one` : "No application in this tenant starts with that", rows.length ? "" : "warn");
      } catch (err) { console.warn("what-if: app suggest failed", err.message); }
    }, 250);
  });

  $("wiRun").addEventListener("click", async () => {
    const upn = $("wiUser").value.trim();
    if (!upn) { toast("Pick a <span>user</span> first"); return; }
    const btn = $("wiRun"); btn.disabled = true; btn.textContent = "Evaluating…";
    try {
      // ---- identity: resolve + memberships (groups and directory roles) ----
      let sc = { groupIds: new Set(), roleIds: new Set(), isGuest: false };
      if (isDemo) {
        sc.userId = "demo-user"; sc.userName = upn;
      } else {
        const u = await Graph.gget(`/users/${encodeURIComponent(upn)}?$select=id,displayName,userPrincipalName,userType`);
        sc.userId = u.id; sc.userName = u.displayName || u.userPrincipalName;
        sc.isGuest = (u.userType || "").toLowerCase() === "guest";
        try {
          const mem = await Graph.ggetAll(`/users/${u.id}/transitiveMemberOf?$select=id,roleTemplateId`);
          mem.forEach((o) => {
            const ty = (o["@odata.type"] || "").toLowerCase();
            if (ty.includes("directoryrole")) { if (o.roleTemplateId) sc.roleIds.add(o.roleTemplateId); }
            else sc.groupIds.add(o.id);
          });
          wiNames = {};
          mem.forEach((o) => { if (o.displayName) wiNames[o.id] = o.displayName; });
        } catch (e) { console.warn("what-if: membership lookup failed", e.message); }
      }
      // ---- target resource ----
      const appSel = $("wiApp").value;
      if (appSel.startsWith("action:")) { sc.userAction = appSel.slice(7); sc.appName = "User action"; }
      else if (appSel === "custom") {
        const typed = $("wiAppId").value.trim();
        const known = wiAppMap.get(typed.toLowerCase());
        if (known) { sc.appId = known.appId; sc.appName = known.name; }
        else if (GUID_RE.test(typed)) { sc.appId = typed; sc.appName = typed; }
        else if (typed) { toast("Pick an <span>application</span> from the list, or paste an App ID"); return; }
      }
      else { sc.appId = appSel; sc.appName = $("wiApp").selectedOptions[0].textContent; }
      if (!sc.userAction && !sc.appId) { toast("Pick an <span>application</span> — type its name, or paste an App ID"); return; }
      // ---- the rest of the sign-in ----
      sc.platform = $("wiPlatform").value;
      sc.clientApp = $("wiClient").value;
      sc.ip = $("wiIp").value.trim() || null;
      sc.country = $("wiCountry").value.trim().toUpperCase() || null;
      sc.deviceState = $("wiDevice").value || null;
      sc.signInRisk = $("wiSignInRisk").value || null;
      sc.userRisk = $("wiUserRisk").value || null;
      sc.insiderRisk = $("wiInsiderRisk").value || null;
      sc.authFlow = $("wiFlow").value || null;
      // ---- named locations (once) ----
      if (!wiLocations) {
        try { wiLocations = isDemo ? [] : await Graph.ggetAll("/identity/conditionalAccess/namedLocations"); }
        catch (e) { wiLocations = []; console.warn("what-if: named locations failed", e.message); }
      }
      // group names for the "excluded via …" reasons
      try {
        const gids = [...sc.groupIds].filter((x) => !wiNames[x]);
        for (let i = 0; i < gids.length && !isDemo; i += 1000) {
          const j = await Graph.gpost("/directoryObjects/getByIds", { ids: gids.slice(i, i + 1000), types: ["group"] });
          (j.value || []).forEach((o) => wiNames[o.id] = o.displayName || o.id);
        }
      } catch (e) { /* names are cosmetic */ }
      wiScenario = sc;
      wiNaPersona = "all"; wiNaWhy = "all"; wiNaNum = "";
      wiResult = WhatIfEval.evaluate(policies.map((p) => p.raw), sc, { namedLocations: wiLocations, names: wiNames });
      renderWhatIf();
    } catch (e) {
      console.error("What-If failed:", e);
      toast(`What-If: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "▶ What If"; }
  });

  const WI_GRANT_LABEL = { block: "Block access", mfa: "Require MFA", compliantDevice: "Require compliant device",
    domainJoinedDevice: "Require hybrid Entra joined device", approvedApplication: "Require approved client app",
    compliantApplication: "Require app protection policy", passwordChange: "Require password change",
    unknownFutureValue: "unknown" };
  const wiCtrl = (c) => c.startsWith("authenticationStrength:") ? "Authentication strength: " + c.slice(23)
    : c.startsWith("termsOfUse:") ? "Terms of use: " + c.slice(11) : (WI_GRANT_LABEL[c] || c);

  function renderWhatIf() {
    const r = wiResult, sc = wiScenario;
    if (!r) return;
    $("wiMd").style.display = "";
    const scLine = [`${esc(sc.userName || "")}`, esc(sc.appName || ""), WhatIfEval.LABEL[sc.platform] || sc.platform,
      WhatIfEval.LABEL[sc.clientApp] || sc.clientApp, sc.ip ? `IP ${esc(sc.ip)}` : "", sc.country ? `country ${esc(sc.country)}` : "",
      sc.deviceState ? WhatIfEval.LABEL[sc.deviceState] : "", sc.signInRisk ? `sign-in risk ${sc.signInRisk}` : "",
      sc.userRisk ? `user risk ${sc.userRisk}` : "", sc.authFlow ? esc(sc.authFlow) : ""].filter(Boolean).join(" · ");

    // "Blocked" with ten applying policies leaves you to work out WHICH one
    // said no. Name them, and make them clickable — with report-only kept
    // separate, because a report-only block changes nothing today and saying
    // otherwise is the difference between a verdict and a guess.
    const nameList = (xs) => xs.map((b) => `<span class="wi-blocker pol-link" data-polid="${esc(b.id)}">${esc(b.name)}</span>`).join(" ");
    const enforced = r.applied.filter((p) => p.state !== "enabledForReportingButNotEnforced");
    const allControls = [...new Set(enforced.flatMap((p) => p.grant || []))].filter((c) => c !== "block");
    const roControls = [...new Set(r.applied.filter((p) => p.state === "enabledForReportingButNotEnforced")
      .flatMap((p) => p.grant || []))].filter((c) => c !== "block");
    const roNote = (r.blockersReportOnly || []).length || roControls.length
      ? `<div class="wi-verdict-sub">Report-only, so not enforced today: ${
          (r.blockersReportOnly || []).length ? `<b>would block</b> once enforced — ${nameList(r.blockersReportOnly)}` : ""}${
          (r.blockersReportOnly || []).length && roControls.length ? " · " : ""}${
          roControls.length ? `would also require ${esc(roControls.map(wiCtrl).join(", "))}` : ""}</div>`
      : "";
    const verdict = (r.blocked
      ? `<div class="wi-verdict block">⛔ Access would be <b>blocked</b> by ${(r.blockers || []).length === 1 ? "" : `${r.blockers.length} policies: `}${nameList(r.blockers || [])}</div>`
      : allControls.length
        ? `<div class="wi-verdict grant">✅ Access granted after satisfying: <b>${esc(allControls.map(wiCtrl).join(", "))}</b></div>`
        : `<div class="wi-verdict none">✅ No grant control required by any enforced policy</div>`) + roNote;

    const applied = r.applied.length ? r.applied.map((p) => `<li>
        <div class="wi-pn"><span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>${p.state === "enabledForReportingButNotEnforced" ? ' <span class="tag">report-only</span>' : ""}${(p.grant || []).includes("block") ? (p.state === "enabledForReportingButNotEnforced" ? ' <span class="tag">would block once enforced</span>' : ' <span class="tag block">⛔ this is the block</span>') : ""}</div>
        <div class="wi-ctrls">
          ${(p.grant || []).length ? `<span class="wi-g">Grant: ${esc((p.grant || []).map(wiCtrl).join(p.operator === "OR" ? " or " : " and "))}</span>` : ""}
          ${(p.session || []).length ? `<span class="wi-s">Session: ${esc((p.session || []).join(" · "))}</span>` : ""}
          ${!(p.grant || []).length && !(p.session || []).length ? '<span class="mini muted">no controls</span>' : ""}
          ${(p.warnings || []).length ? `<span class="wi-w">⚠ ${esc(p.warnings.join("; "))}</span>` : ""}
        </div></li>`).join("") : '<li class="mini muted">No policy applies to this sign-in.</li>';

    // R30 — the honest answer is 2 policies that apply and 107 that do not,
    // each with its reason, and that list is unreadable as one block. The
    // question behind it is a persona question ("why did no Admins policy
    // apply to this admin?") or a number question ("what happened to CA103?"),
    // so it filters by both — the same CA ranges 🗂 List Policies groups by,
    // through the same Render.caGroup, so the ranges stay one idea. The count
    // per reason comes first: when a policy you expected is missing, the
    // reason is what you are hunting for.
    const naAll = r.notApplied.map((p) => ({ ...p, ca: Render.caGroup(p.name) }));
    const naPersonas = [...new Map(naAll.map((p) => [p.ca.key, p.ca])).entries()]
      .sort((a, b) => a[0] - b[0]).map(([key, ca]) => ({ key: String(key), label: ca.label.replace(/\s*\(.*\)$/, ""), n: naAll.filter((x) => x.ca.key === key).length }));
    const naReasons = [...new Set(naAll.map((p) => p.why))]
      .map((w) => ({ w, n: naAll.filter((x) => x.why === w).length }))
      .sort((a, b) => b.n - a.n);
    const num = wiNaNum.trim();
    const naShown = naAll.filter((p) =>
      (wiNaPersona === "all" || String(p.ca.key) === wiNaPersona)
      && (wiNaWhy === "all" || p.why === wiNaWhy)
      && (!num || (p.ca.num != null && String(p.ca.num).includes(num)) || p.name.toLowerCase().includes(num.toLowerCase())));
    const chip = (on, key, attr, label, n) =>
      `<button class="btn sm wi-nachip ${on ? "on" : ""}" data-${attr}="${esc(key)}">${esc(label)}${n != null ? ` <span class="mini">${n}</span>` : ""}</button>`;
    const naFilters = naAll.length ? `<div class="wi-nafilters">
        <div class="wi-narow">${chip(wiNaWhy === "all", "all", "wina-why", "Every reason", naAll.length)}
          ${naReasons.map((x) => chip(wiNaWhy === x.w, x.w, "wina-why", WhatIfEval.WHY_LABEL[x.w] || x.w, x.n)).join("")}</div>
        <div class="wi-narow">${chip(wiNaPersona === "all", "all", "wina-persona", "Every persona")}
          ${naPersonas.map((x) => chip(wiNaPersona === x.key, x.key, "wina-persona", x.label, x.n)).join("")}</div>
        <div class="wi-narow"><input id="wiNaNum" class="btn" style="cursor:text;min-width:200px" placeholder="CA number or name…" value="${esc(wiNaNum)}">
          ${wiNaPersona !== "all" || wiNaWhy !== "all" || num ? `<button class="btn sm" id="wiNaClear">Clear filters</button>` : ""}
          <span class="mini muted">showing ${naShown.length} of ${naAll.length}</span></div>
      </div>` : "";
    const notApplied = naShown.map((p) => `<li>
        <div class="wi-pn"><span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span></div>
        <div class="wi-why">${esc(p.reason)}</div></li>`).join("")
      || (naAll.length ? '<li class="mini muted">No policy matches these filters.</li>' : "");

    $("wiBody").innerHTML = `
      <div class="list-card wi-res">
        ${verdict}
        <p class="mini muted" style="margin:8px 0 0">${scLine}</p>
      </div>
      <div class="list-card wi-res">
        <h4 class="wi-h">Policies that apply <span class="mini muted">${r.applied.length}</span></h4>
        <ul class="wi-list">${applied}</ul>
      </div>
      <div class="list-card wi-res">
        <h4 class="wi-h">Policies that do not apply <span class="mini muted">${r.notApplied.length}</span></h4>
        ${naFilters}
        <ul class="wi-list dim">${notApplied || '<li class="mini muted">None — every evaluated policy applies.</li>'}</ul>
      </div>
      ${r.notEvaluated.length ? `<p class="mini muted" style="margin-top:10px">Not evaluated (Off): ${r.notEvaluated.map((p) => esc(p.name)).join(", ")}</p>` : ""}`;
  }
  $("wiBody").addEventListener("click", (e) => {
    const per = e.target.closest("[data-wina-persona]");
    if (per) { wiNaPersona = per.dataset.winaPersona; renderWhatIf(); return; }
    const why = e.target.closest("[data-wina-why]");
    if (why) { wiNaWhy = why.dataset.winaWhy; renderWhatIf(); return; }
    if (e.target.id === "wiNaClear") { wiNaPersona = "all"; wiNaWhy = "all"; wiNaNum = ""; renderWhatIf(); return; }
    const pl = e.target.closest(".pol-link"); if (pl) showDetail(pl.dataset.polid);
  });
  // a re-render replaces the input, so keep the caret where it was
  $("wiBody").addEventListener("input", (e) => {
    if (e.target.id !== "wiNaNum") return;
    wiNaNum = e.target.value;
    renderWhatIf();
    const el = $("wiNaNum");
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });
  $("wiMd").addEventListener("click", () => {
    const r = wiResult, sc = wiScenario; if (!r) return;
    const L = [`# Conditional Access What-If — ${tenantName || "tenant"}`, "",
      Brand.generatedBy("Generated"), "",
      "## Sign-in simulated", "",
      `- User: **${sc.userName}**`, `- Target resource: **${sc.appName}**`,
      `- Device platform: ${sc.platform} · Client app: ${sc.clientApp}`,
      `- IP: ${sc.ip || "—"} · Country: ${sc.country || "—"} · Device state: ${sc.deviceState || "not specified"}`,
      `- Sign-in risk: ${sc.signInRisk || "not specified"} · User risk: ${sc.userRisk || "not specified"}`, "",
      // The report carries the same obligation as the screen: name the cause.
      // A document that says BLOCKED and leaves the reader to find the policy
      // in a list of ten is the version that gets pasted into a ticket.
      `**Result:** ${r.blocked
        ? `access would be **BLOCKED** by ${(r.blockers || []).map((b) => b.name).join(", ")}`
        : "access granted after satisfying the controls below"}`,
      ...((r.blockersReportOnly || []).length
        ? [`**Report-only:** ${r.blockersReportOnly.map((b) => b.name).join(", ")} would block once enforced — ${r.blocked ? "in addition to the above" : "today this sign-in succeeds"}.`]
        : []), "",
      `## Policies that apply (${r.applied.length})`, ""];
    r.applied.forEach((p) => L.push(`- **${p.name}**${p.state === "enabledForReportingButNotEnforced" ? " *(report-only)*" : ""}${(p.grant || []).includes("block") ? (p.state === "enabledForReportingButNotEnforced" ? " ⛔ *would block once enforced*" : " ⛔ **this is the block**") : ""} — grant: ${(p.grant || []).map(wiCtrl).join(", ") || "none"}${(p.session || []).length ? `; session: ${p.session.join(" · ")}` : ""}`));
    const naBy = {};
    r.notApplied.forEach((p) => { naBy[p.why || "other"] = (naBy[p.why || "other"] || 0) + 1; });
    L.push("", `## Policies that do not apply (${r.notApplied.length})`, "");
    const naSum = Object.entries(naBy).sort((a, b) => b[1] - a[1])
      .map(([w, n]) => `${n} ${(WhatIfEval.WHY_LABEL || {})[w] || w}`).join(" · ");
    if (naSum) L.push(`_${naSum}_`, "");
    r.notApplied.forEach((p) => L.push(`- ${p.name} — ${p.reason}`));
    if (r.notEvaluated.length) { L.push("", `## Not evaluated (Off)`, ""); r.notEvaluated.forEach((p) => L.push(`- ${p.name}`)); }
    showReport("🧪 What-If report", "CA-WhatIf", L.join("\n"));
  });

  // ---------- Compare users ----------
  let cuUsers = [], cuResult = null, cuLocations = null, cuSeedList = "";
  function openCompare() {
    crumb("⚖ Compare users");
    show("screen-compare");
    $("cuHead").innerHTML = `<h3>⚖ Compare users</h3>
      <p style="margin-bottom:6px">Add two or more users and see where Conditional Access treats them differently: per-policy <b>assignment</b> (included, excluded — and why — or not targeted), the <b>group and role memberships</b> behind the differences, and optionally one <b>What-If sign-in</b> evaluated for every user.</p>
      <p class="mini muted" style="margin:0">Assignment compares user scoping only — location, platform, client and risk conditions only come in through the optional scenario. Read-only.</p>`;
    if (!policies.length) { $("cuBody").innerHTML = '<p class="mini">No policies loaded.</p>'; return; }
    if (isDemo) $("cuUserList").innerHTML = (DEMO_DATA.analyzeUsers || []).map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
    else if (!$("cuUserList").children.length) {
      // seed the picker with the first page of tenant users, so the dropdown
      // offers names before anything is typed; typing refines via Graph search
      Graph.gget("/users?$select=displayName,userPrincipalName&$top=100")
        .then((r) => {
          cuSeedList = ((r && r.value) || []).map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
          if (!$("cuUser").value.trim()) $("cuUserList").innerHTML = cuSeedList;
        })
        .catch((e) => console.warn("compare: user preload failed", e.message));
    }
    renderCuChips();
    if (cuResult) renderCompare();   // keep the last run when returning to the tab
  }
  $("toolCompare").addEventListener("click", () => openCompare());

  function renderCuChips() {
    $("cuChips").innerHTML = cuUsers.map((u, i) => `<span class="cu-chip">${esc(u.name)}${u.guest ? ' <span class="tag new">guest</span>' : ""}
      <span class="uupn mini muted">${esc(u.upn)}</span><button data-cu-del="${i}" title="Remove from comparison">×</button></span>`).join("") ||
      '<span class="mini muted">No users yet — add at least two.</span>';
  }
  $("cuChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cu-del]"); if (!b) return;
    cuUsers.splice(+b.dataset.cuDel, 1);
    cuResult = null; $("cuBody").innerHTML = ""; $("cuMd").style.display = "none";
    renderCuChips();
  });

  async function addCuUser(term) {
    term = (term || "").trim(); if (!term) return false;
    if (cuUsers.length >= 8) { toast("Compare up to <span>8</span> users at a time"); return false; }
    try {
      const u = isDemo ? Comparer.resolveUserDemo(term) : await Comparer.resolveUser(term);
      if (cuUsers.some((x) => x.id === u.id)) { toast(`<span>${esc(u.name)}</span> is already in the comparison`); $("cuUser").value = ""; return false; }
      cuUsers.push(u);
      cuResult = null; $("cuBody").innerHTML = ""; $("cuMd").style.display = "none";
      $("cuUser").value = ""; renderCuChips();
      return true;
    } catch (e) { toast(`${esc(e.message || e)}`); return false; }
  }
  $("cuUser").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCuUser(e.target.value); } });
  $("cuAdd").addEventListener("click", async () => { await addCuUser($("cuUser").value); $("cuUser").focus(); });
  $("cuUser").addEventListener("change", (e) => { if (e.target.value.trim()) addCuUser(e.target.value); });
  // user type-ahead, same shape as What-If's
  let cuSugTimer = null;
  $("cuUser").addEventListener("input", (e) => {
    const v = e.target.value; clearTimeout(cuSugTimer);
    cuSugTimer = setTimeout(async () => {
      const t = v.trim();
      if (isDemo) return;
      if (t.length < 2) { if (cuSeedList) $("cuUserList").innerHTML = cuSeedList; return; }   // back to the seeded tenant list
      try {
        const f = t.replace(/'/g, "''");
        const r = await Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=10`);
        $("cuUserList").innerHTML = ((r && r.value) || []).map((u) => `<option value="${esc(u.userPrincipalName)}" label="${esc(u.displayName || "")}"></option>`).join("");
      } catch (err) { console.warn("compare: suggest failed", err.message); }
    }, 250);
  });

  $("cuScenOn").addEventListener("change", (e) => { $("cuScenGrid").style.display = e.target.checked ? "" : "none"; });
  $("cuApp").addEventListener("change", (e) => { $("cuAppIdWrap").style.display = e.target.value === "custom" ? "" : "none"; });
  $("cuDiffOnly").addEventListener("change", () => { if (cuResult) renderCompare(); });
  $("cuReset").addEventListener("click", () => {
    cuUsers = []; cuResult = null;
    $("cuUser").value = ""; $("cuBody").innerHTML = ""; $("cuMd").style.display = "none";
    ["cuIp", "cuCountry", "cuAppId"].forEach((id) => $(id).value = "");
    ["cuDevice", "cuSignInRisk", "cuUserRisk"].forEach((id) => $(id).value = "");
    $("cuApp").value = "00000002-0000-0ff1-ce00-000000000000"; $("cuAppIdWrap").style.display = "none";
    $("cuPlatform").value = "windows"; $("cuClient").value = "browser";
    renderCuChips();
  });

  $("cuRun").addEventListener("click", async () => {
    if ($("cuUser").value.trim()) await addCuUser($("cuUser").value);   // take a typed-but-not-added user along
    if (cuUsers.length < 2) { toast("Add at least <span>two users</span> to compare"); return; }
    const btn = $("cuRun"); btn.disabled = true; btn.textContent = "Comparing…";
    try {
      const lookup = Comparer.buildLookup(policies);
      const rows = Comparer.assignmentRows(lookup, cuUsers);
      const groups = Comparer.membershipRows(cuUsers, "group");
      const roles = Comparer.membershipRows(cuUsers, "role");
      let sr = null, scLine = "";
      if ($("cuScenOn").checked) {
        const sc = {};
        const appSel = $("cuApp").value;
        if (appSel === "custom") { sc.appId = $("cuAppId").value.trim(); sc.appName = sc.appId || ""; }
        else { sc.appId = appSel; sc.appName = $("cuApp").selectedOptions[0].textContent; }
        if (!sc.appId) { toast("Enter an <span>App ID</span> for the scenario"); return; }
        sc.platform = $("cuPlatform").value;
        sc.clientApp = $("cuClient").value;
        sc.ip = $("cuIp").value.trim() || null;
        sc.country = $("cuCountry").value.trim().toUpperCase() || null;
        sc.deviceState = $("cuDevice").value || null;
        sc.signInRisk = $("cuSignInRisk").value || null;
        sc.userRisk = $("cuUserRisk").value || null;
        if (!cuLocations) {
          try { cuLocations = isDemo ? [] : await Graph.ggetAll("/identity/conditionalAccess/namedLocations"); }
          catch (e) { cuLocations = []; console.warn("compare: named locations failed", e.message); }
        }
        sr = Comparer.scenario(policies.map((p) => p.raw), cuUsers, sc, { namedLocations: cuLocations, names: {} });
        scLine = [esc(sc.appName), WhatIfEval.LABEL[sc.platform] || sc.platform, WhatIfEval.LABEL[sc.clientApp] || sc.clientApp,
          sc.ip ? `IP ${esc(sc.ip)}` : "", sc.country ? `country ${esc(sc.country)}` : "",
          sc.deviceState ? WhatIfEval.LABEL[sc.deviceState] : "", sc.signInRisk ? `sign-in risk ${sc.signInRisk}` : "",
          sc.userRisk ? `user risk ${sc.userRisk}` : ""].filter(Boolean).join(" · ");
      }
      cuResult = { users: cuUsers.slice(), rows, groups, roles, sr, scLine };
      renderCompare();
    } catch (e) {
      console.error("Compare users failed:", e);
      toast(`Compare: <span>${esc(e.message || e)}</span>`);
    } finally { btn.disabled = false; btn.textContent = "⚖ Compare"; }
  });

  function renderCompare() {
    const R = cuResult; if (!R) return;
    const diffOnly = $("cuDiffOnly").checked;
    $("cuMd").style.display = "";
    const nd = R.rows.filter((r) => r.differs).length;
    const ng = R.groups.filter((r) => r.differs).length + R.roles.filter((r) => r.differs).length;
    let scHtml = "";
    if (R.sr) {
      const verd = R.users.map((u, i) => {
        const r = R.sr.perUser[i];
        return `<div class="wi-verdict ${r.blocked ? "block" : "grant"}" style="margin-bottom:6px">${r.blocked ? "⛔" : "✅"} <b>${esc(u.name)}</b> — ${r.blocked ? "access would be <b>blocked</b>" : `${r.applied.length} ${r.applied.length === 1 ? "policy applies" : "policies apply"}`}</div>`;
      }).join("");
      scHtml = `<div class="list-card wi-res"><h4 class="wi-h">What-If scenario <span class="mini muted">${R.scLine}</span></h4>
        ${verd}${Comparer.scenarioTable(R.sr, R.users, diffOnly)}
        <p class="mini muted" style="margin:8px 0 0">✓ applies (amber = report-only) · ✗ does not apply — hover for the first unmet condition.</p></div>`;
    }
    $("cuBody").innerHTML = `
      <div class="list-card wi-res"><h4 class="wi-h">Policy assignment <span class="mini muted">${nd} difference${nd === 1 ? "" : "s"}</span></h4>
        ${Comparer.assignmentTable(R.rows, R.users, diffOnly)}
        <p class="mini muted" style="margin:8px 0 0">✓ included · ✗ excluded — hover for the group, role or direct exclusion behind it · “·” not targeted. Enabled and report-only policies; user scoping only.</p></div>
      <div class="list-card wi-res"><h4 class="wi-h">Memberships <span class="mini muted">${ng} difference${ng === 1 ? "" : "s"}</span></h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
          <div>${Comparer.membershipTable(R.groups, R.users, "group", diffOnly)}</div>
          <div>${Comparer.membershipTable(R.roles, R.users, "role", diffOnly)}</div>
        </div></div>
      ${scHtml}`;
  }
  $("cuBody").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link"); if (pl && pl.dataset.polid) showDetail(pl.dataset.polid);
  });
  $("cuMd").addEventListener("click", () => {
    const R = cuResult; if (!R) return;
    showReport("⚖ Compare users", "CA-CompareUsers",
      Comparer.markdown({ tenant: tenantName || "tenant", scenarioLine: R.scLine }, R.users, R.rows, R.groups, R.roles, R.sr));
  });

  // ---------- Group Analyzer (BETA) ----------
  // "Where is this group actually used?" The source registry, the matching and
  // the exports live in js/groupuse.js; this is screen, consent and rendering.
  let guMode = "all", guAreas = new Set(["entra", "m365"]);
  let guRes = null, guMeta = null, guTotals = null, guGroups = null;
  let guQuery = "", guUnusedOnly = false, guSeedList = "", guShowServices = false, guDanglingOnly = false;
  // A finished sweep is expensive. Drilling into one group must not throw it
  // away — park it here and offer the way back, rather than making the person
  // pay for the same scan twice.
  let guStash = null;

  function openGroupUse() {
    crumb("🔗 Group Analyzer");
    show("screen-groupuse");
    $("guHead").innerHTML = `<h3>🔗 Group Analyzer</h3>
      <p style="margin-bottom:6px">A group is a shared handle: one admin scopes a Conditional Access policy to it, another targets an Intune profile at it, a third grants it a role on a subscription. Paste a <b>group or user</b> and see every place it is referenced — or sweep the tenant and find the groups <b>nothing</b> references.</p>
      <p class="mini muted" style="margin:0">Read-only. Hits inherited from a <b>parent group</b> are marked as such — anything targeting the parent reaches these members too. After Jasper Baes' <i>Microsoft Cloud Group Analyzer</i>.</p>`;

    if (isDemo) {
      $("guBody").innerHTML = `<div class="list-card"><p class="mini" style="margin:0">Group Analyzer reads live Entra, Intune, Microsoft 365 and Azure configuration, so there is nothing meaningful to show against the demo policy set. Sign in to a tenant to use it.</p></div>`;
      $("guRun").disabled = true;
      return;
    }
    $("guRun").disabled = false;
    renderGuAreas();
    if (guRes || guTotals) renderGroupUse();
  }
  $("toolGroupUse").addEventListener("click", () => openGroupUse());

  // ---- area picker. Consent is asked at the tick, not at Run: the checkbox
  // click is a live user gesture, and Safari/Edge revoke that the moment the
  // run awaits its first Graph call — a popup raised there would be blocked.
  function renderGuAreas() {
    $("guAreas").innerHTML = GroupUse.AREAS.map((a) => {
      const n = GroupUse.SOURCES.filter((s) => s.area === a.id).length;
      const extra = a.id === "azure" ? "separate Azure sign-in"
        : (GroupUse.AREA_SCOPES[a.id] || []).length ? "asks for extra permissions" : "no extra permissions";
      return `<label class="gu-area${guAreas.has(a.id) ? " on" : ""}">
        <input type="checkbox" data-guarea="${a.id}"${guAreas.has(a.id) ? " checked" : ""}>
        <span class="gu-a-h">${a.icon} ${esc(a.label)}</span>
        <span class="mini muted">${n} service${n === 1 ? "" : "s"} · ${extra}</span></label>`;
    }).join("");
  }
  $("guAreas").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-guarea]"); if (!cb) return;
    const id = cb.dataset.guarea;
    if (!cb.checked) { guAreas.delete(id); renderGuAreas(); return; }
    const need = id === "azure" ? Graph.ARM_SCOPES : [...AUTH_CONFIG.scopes, ...(GroupUse.AREA_SCOPES[id] || [])];
    if (!isDemo && !Graph.hasScopes(need)) {
      cb.disabled = true;
      let ok = false;
      try { ok = await preConsent(need); }
      catch (err) { console.error(err); toast(`Consent failed: <span>${esc(err.message || err)}</span>`); }
      cb.disabled = false;
      if (!ok) { renderGuAreas(); return; }
      if (id === "azure") toast("Azure connected — subscriptions and role assignments will be read");
    }
    guAreas.add(id); renderGuAreas();
  });

  function guSeedPicker() {
    if (isDemo || guSeedList || $("guTermList").children.length) return;
    Graph.gget("/groups?$select=id,displayName&$top=100&$orderby=displayName")
      .then((r) => {
        guSeedList = ((r && r.value) || []).map((g) => `<option value="${esc(g.displayName)}"></option>`).join("");
        if (!$("guTerm").value.trim()) $("guTermList").innerHTML = guSeedList;
      })
      .catch((e) => console.warn("Group Analyzer: group preload failed", e.message));
  }
  $("guTerm").addEventListener("focus", guSeedPicker);

  $("guModeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-gumode]"); if (!b) return;
    guMode = b.dataset.gumode;
    [...$("guModeSeg").children].forEach((x) => x.classList.toggle("active", x === b));
    $("guOneWrap").style.display = guMode === "one" ? "" : "none";
    $("guAllWrap").style.display = guMode === "all" ? "" : "none";
    $("guRun").textContent = guMode === "all" ? "🔗 Sweep tenant" : "🔗 Analyze";
    if (guMode === "one") guSeedPicker();
  });

  // user/group type-ahead, same shape as Compare users'
  let guSugTimer = null;
  $("guTerm").addEventListener("input", (e) => {
    const v = e.target.value; clearTimeout(guSugTimer);
    guSugTimer = setTimeout(async () => {
      const t = v.trim();
      if (isDemo || t.length < 2) { if (guSeedList && t.length < 2) $("guTermList").innerHTML = guSeedList; return; }
      try {
        const f = t.replace(/'/g, "''");
        const [g, u] = await Promise.all([
          Graph.gget(`/groups?$filter=startswith(displayName,'${f}')&$select=displayName&$top=8`).catch(() => ({ value: [] })),
          Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=displayName,userPrincipalName&$top=8`).catch(() => ({ value: [] })),
        ]);
        $("guTermList").innerHTML =
          ((g.value || []).map((x) => `<option value="${esc(x.displayName)}" label="group"></option>`).join("")) +
          ((u.value || []).map((x) => `<option value="${esc(x.userPrincipalName)}" label="${esc(x.displayName || "")}"></option>`).join(""));
      } catch (err) { console.warn("Group Analyzer: suggest failed", err.message); }
    }, 250);
  });
  $("guTerm").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runGroupUse(); } });

  $("guRun").addEventListener("click", () => runGroupUse());
  $("guReset").addEventListener("click", () => {
    guRes = guMeta = guTotals = guGroups = guStash = null; guQuery = ""; guUnusedOnly = false;
    $("guTerm").value = ""; $("guBody").innerHTML = ""; $("guProg").textContent = "";
    ["guMd", "guHtml", "guCsv"].forEach((id) => $(id).style.display = "none");
  });

  const guSourceIds = (sweep) => GroupUse.SOURCES
    .filter((s) => guAreas.has(s.area))
    .filter((s) => !sweep || $("guSweepDeep").checked || !s.perObject)
    .map((s) => s.id);

  // Name filter for a sweep. Prefix and suffix are the useful ones in practice
  // — naming conventions live at both ends — and Graph can do both server-side
  // (endsWith needs $count=true, which pairs with the ConsistencyLevel header
  // Graph.gget always sends). The client predicate is kept as well, both as a
  // safety net and as the fallback when a tenant rejects the filter outright.
  function guNameFilter(mode, text) {
    const raw = String(text || "").trim();
    if (!raw) return { q: "", keep: null, label: "" };
    const t = raw.replace(/'/g, "''");
    const lo = raw.toLowerCase();
    if (mode === "ends") {
      return { q: `&$count=true&$filter=${encodeURIComponent(`endswith(displayName,'${t}')`)}`,
        keep: (n) => n.toLowerCase().endsWith(lo), label: `name ends with “${raw}”` };
    }
    if (mode === "contains") {
      return { q: `&$search=${encodeURIComponent(`"displayName:${raw}"`)}`,
        keep: (n) => n.toLowerCase().includes(lo), label: `name contains “${raw}”` };
    }
    return { q: `&$filter=${encodeURIComponent(`startswith(displayName,'${t}')`)}`,
      keep: (n) => n.toLowerCase().startsWith(lo), label: `name starts with “${raw}”` };
  }

  // Page through /groups only as far as the chosen limit — a tenant with
  // 20 000 groups should not be fully enumerated to answer "first 100". With a
  // name filter the limit counts matches, not rows scanned.
  async function guListGroups(limit, st, filter) {
    const f = filter || { q: "", keep: null };
    const base = "/groups?$select=id,displayName,membershipRule,isAssignableToRole,groupTypes";
    const top = limit ? Math.min(Math.max(limit, 50), 999) : 999;
    const keep = f.keep || (() => true);
    const collect = async (start) => {
      const out = [];
      let url = start;
      while (url) {
        const j = await Graph.gget(url);
        (j.value || []).forEach((g) => { if (keep(g.displayName || "")) out.push(g); });
        st?.(`Listing groups… ${out.length}`);
        if (limit && out.length >= limit) break;
        url = j["@odata.nextLink"] || null;
      }
      return out;
    };
    let out;
    if (f.q) {
      try { out = await collect(`${base}&$top=${top}${f.q}`); }
      catch (e) {
        console.warn("Group Analyzer: server-side name filter rejected —", e.message);
        st?.("Name filter not supported here — filtering locally…");
        out = await collect(`${base}&$top=${top}`);
      }
    } else out = await collect(`${base}&$top=${top}`);
    return limit ? out.slice(0, limit) : out;
  }

  async function runGroupUse() {
    if (isDemo) return;
    if (!guAreas.size) { toast("Pick at least one <span>area</span> to look in"); return; }
    const btn = $("guRun"); const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Analyzing…";
    // Drilling out of a finished sweep: keep it so "Back to the sweep" can put
    // it straight back on screen. A new sweep replaces whatever was parked.
    if (guMode === "one" && guTotals) {
      guStash = { totals: guTotals, groups: guGroups, res: guRes, meta: guMeta, query: guQuery, unusedOnly: guUnusedOnly, danglingOnly: guDanglingOnly };
    } else if (guMode === "all") guStash = null;
    guRes = guMeta = guTotals = guGroups = null;
    $("guBody").innerHTML = ""; ["guMd", "guHtml", "guCsv"].forEach((id) => $(id).style.display = "none");
    const st = (m, done, total) => { $("guProg").innerHTML = esc(m) + progInline(done, total); };
    try {
      if (guMode === "all") await sweepGroupUse(st);
      else await analyzeOneGroup($("guTerm").value, st);
    } catch (e) {
      console.error("Group Analyzer failed:", e);
      $("guBody").innerHTML = `<div class="list-card"><p class="mini" style="margin:0;color:var(--off)">${esc(e.message || e)}</p></div>`;
    } finally { btn.disabled = false; btn.textContent = label; $("guProg").textContent = ""; }
  }

  async function analyzeOneGroup(term, st) {
    term = (term || "").trim();
    if (!term) { toast("Enter a <span>group or user</span>"); return; }
    st("Resolving…");
    const principal = await GroupUse.resolvePrincipal(term);
    const scope = await GroupUse.buildScope(principal, st);
    const res = await GroupUse.analyze({
      ids: scope.ids, principal, isUser: principal.type === "user",
      policies: policies.map((p) => p.raw), sourceIds: guSourceIds(false),
      batchIds: scope.groupIds, onStatus: st,
    });
    guRes = res;
    guMeta = {
      principalName: principal.name, principalType: principal.type, principalId: principal.id,
      via: scope.via, parents: scope.parents, children: scope.children, roles: scope.roles,
    };
    renderGroupUse();
  }

  // The groups every Conditional Access policy points at — include and exclude,
  // across enabled, report-only and Off alike. This is the scope that matters
  // for a Conditional Access tool: it is bounded by the baseline rather than by
  // the size of the directory, it needs no /groups enumeration at all (the
  // policies are already in memory), and the answer it gives — "what else does
  // this group touch, now that Conditional Access depends on it" — is the whole
  // reason to look.
  //
  // A referenced id the directory cannot resolve is a DANGLING reference: the
  // policy still names it, but the group is gone, so that assignment targets
  // nobody. Those are kept and flagged rather than dropped — a policy quietly
  // scoped to nothing is worth more attention than one scoped to a live group.
  async function guCaScopedGroups(st) {
    const refs = new Map();   // lower id -> Set of policy names
    for (const p of policies) {
      const u = (p.raw.conditions || {}).users || {};
      for (const g of [...(u.includeGroups || []), ...(u.excludeGroups || [])]) {
        const k = String(g).toLowerCase();
        if (!GroupUse.isGuid(k)) continue;
        if (!refs.has(k)) refs.set(k, new Set());
        refs.get(k).add(p.raw.displayName || p.raw.id);
      }
    }
    if (!refs.size) return [];

    st(`Resolving ${refs.size} group${refs.size === 1 ? "" : "s"} referenced by Conditional Access…`);
    const found = new Map();
    const ids = [...refs.keys()];
    for (let i = 0; i < ids.length; i += 900) {
      try {
        const j = await Graph.gpost("/directoryObjects/getByIds", { ids: ids.slice(i, i + 900), types: ["group"] });
        (j.value || []).forEach((g) => found.set(String(g.id).toLowerCase(), g));
      } catch (e) { console.warn("Group Analyzer: getByIds failed", e.message); }
    }
    return ids.map((id) => {
      const g = found.get(id);
      const usedBy = [...refs.get(id)];
      return g
        ? { ...g, caPolicies: usedBy }
        : { id, displayName: "(not found in the directory)", missing: true, caPolicies: usedBy };
    }).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }

  async function sweepGroupUse(st) {
    st("Listing groups…");
    const filter = guNameFilter($("guMatchMode").value, $("guMatchText").value);
    const scope = $("guLimit").value;
    let groups, scopeLabel;
    if (scope === "ca") {
      groups = await guCaScopedGroups(st);
      if (filter.keep) groups = groups.filter((g) => filter.keep(g.displayName || ""));
      scopeLabel = [`used by Conditional Access`, filter.label].filter(Boolean).join(" and ");
      if (!groups.length) {
        toast(filter.label
          ? `No Conditional Access group where <span>${esc(filter.label)}</span>`
          : "No Conditional Access policy in this tenant assigns a group");
        return;
      }
    } else {
      groups = await guListGroups(+scope || 0, st, filter);
      scopeLabel = filter.label;
    }
    if (!groups.length) {
      toast(filter.label ? `No groups where <span>${esc(filter.label)}</span>` : "No groups found in this tenant");
      return;
    }
    const ids = new Set(groups.map((g) => String(g.id).toLowerCase()));
    const via = new Map(groups.map((g) => [String(g.id).toLowerCase(), g.displayName || g.id]));
    const res = await GroupUse.analyze({
      ids, principal: { id: "", name: "tenant", type: "group" }, isUser: false,
      policies: policies.map((p) => p.raw), sourceIds: guSourceIds(true),
      // a dangling id has no group behind it — asking /groups/{id}/… would only
      // generate 404s in every per-object batch
      batchIds: groups.filter((g) => !g.missing).map((g) => g.id), onStatus: st,
    });
    guRes = res; guGroups = groups;
    guTotals = GroupUse.sweepTotals(groups, res.rows);
    guMeta = { principalName: `${groups.length} groups`, principalType: "sweep", principalId: "",
      scopeNote: scopeLabel, via, parents: [], children: [], roles: [] };
    renderGroupUse();
  }

  // ---- rendering -----------------------------------------------------------
  function guSourceBlock(g, via) {
    const s = g.source;
    const rows = g.rows.map((r) => {
      const viaLabel = via.get(r.pid) || r.pid;
      const inherited = /parent group|directory role/.test(viaLabel);
      const name = r.source === "ca"
        ? `<span class="pol-link" data-polid="${esc(r.id)}">${esc(r.name)}</span>`
        : esc(r.name);
      return `<tr>
        <td>${name}${r.sub ? ` <span class="mini muted">${esc(r.sub)}</span>` : ""}</td>
        <td><span class="gu-how ${GroupUse.HOW_CLASS(r.how)}">${esc(r.how)}</span></td>
        <td class="mini">${esc(r.detail || "")}</td>
        <td class="gu-via${inherited ? " parent" : ""}">${esc(viaLabel)}</td></tr>`;
    }).join("");
    return `<div class="gu-src">
      <h5>${esc(s.label)} <span class="mini muted">${g.rows.length}</span>
        ${s.doc ? `<a href="${esc(s.doc)}" target="_blank" rel="noopener noreferrer">docs ↗</a>` : ""}</h5>
      <p class="mini muted" style="margin:0 0 6px">${esc(s.hint || "")}</p>
      <div class="gu-tw"><table class="plist"><thead><tr><th>Object</th><th>How</th><th>Detail</th><th>Matched via</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }

  function guNotReadBlock(res) {
    const partial = res.partial || [];
    if (!res.failed.length && !res.skipped.length && !partial.length) return "";
    return `<p class="mini muted" style="margin:0 0 4px">“Nothing found” only means “nothing found in what was actually read”. Check this list before concluding a group is unused.</p>
      ${res.failed.map((f) => `<div class="gu-fail"><b>${esc(f.label)}</b> — ${esc(f.error)}${f.why ? `<span class="why">${esc(f.why)}</span>` : ""}</div>`).join("")}
      ${partial.map((p) => `<div class="gu-fail gu-skip"><b>${esc(p.label)}</b> — read, but partly: ${esc(p.notes.join("; "))}</div>`).join("")}
      ${res.skipped.map((s) => `<div class="gu-fail gu-skip"><b>${esc(s.label)}</b> — skipped (${esc(s.why)})</div>`).join("")}`;
  }
  function guNotReadCard(res) {
    const inner = guNotReadBlock(res);
    return inner ? `<div class="list-card wi-res" id="guNotRead"><h4 class="wi-h">Not read</h4>${inner}</div>` : "";
  }

  function renderGroupUse() {
    if (guTotals) return renderGuSweep();
    const res = guRes, meta = guMeta;
    if (!res || !meta) return;
    ["guMd", "guHtml", "guCsv"].forEach((id) => $(id).style.display = "");

    const per = GroupUse.byArea(res.rows);
    const stats = GroupUse.AREAS.map((a) => {
      const n = (per.get(a.id) || []).length;
      return guAreas.has(a.id)
        ? `<span class="gu-stat${n ? " act" : " zero"}"${n ? ` data-gujump="guArea-${a.id}" title="Jump to ${esc(a.label)}"` : ""}>${a.icon} ${esc(a.label)} <b>${n}</b></span>`
        : "";
    }).join("");

    const rel = [];
    if (meta.parents.length) rel.push(`<b>Member of</b> ${meta.parents.map((p) => esc(p.name)).join(", ")}`);
    if (meta.children.length) rel.push(`<b>Contains groups</b> ${meta.children.map((p) => esc(p.name)).join(", ")}`);
    if (meta.roles.length) rel.push(`<b>Directory roles</b> ${meta.roles.map((p) => esc(p.name)).join(", ")}`);

    const areaCards = GroupUse.AREAS.map((a) => {
      if (!guAreas.has(a.id)) return "";
      const rows = per.get(a.id) || [];
      const groupsOf = GroupUse.grouped(rows);
      const empty = res.ran.filter((r) => r.area === a.id && !r.count);
      return `<div class="list-card wi-res" id="guArea-${a.id}">
        <h4 class="wi-h">${a.icon} ${esc(a.label)} <span class="mini muted">${rows.length} reference${rows.length === 1 ? "" : "s"}</span></h4>
        ${groupsOf.length ? groupsOf.map((g) => guSourceBlock(g, meta.via)).join("")
          : `<p class="mini muted" style="margin:0">No references found.</p>`}
        ${empty.length ? `<p class="mini muted" style="margin:10px 0 0">Read and clean: ${empty.map((e) => esc(e.label)).join(", ")}.</p>` : ""}</div>`;
    }).join("");

    // The counts double as jump links, and on an account with hundreds of
    // references they are the only way to navigate — so they ride along in a
    // sticky strip rather than scrolling away with the header. The strip sits
    // OUTSIDE the card on purpose: .list-card clips its overflow, and a sticky
    // child of a clipping ancestor sticks only within that ancestor's box.
    // The name comes with it, so it stays obvious whose result this is.
    $("guBody").innerHTML = `
      ${guBackBar()}
      <div class="gu-sticky">
        <span class="gu-who">${meta.principalType === "user" ? "👤" : "👥"} ${esc(meta.principalName)}
          <span class="mini muted">${esc(meta.principalType)}</span></span>
        <div class="gu-sum"><span class="gu-stat"><b>${res.rows.length}</b> reference${res.rows.length === 1 ? "" : "s"}</span>${stats}${
          (res.failed.length || (res.partial || []).length) ? `<span class="gu-stat act" data-gujump="guNotRead" title="Jump to what could not be read"><b>${res.failed.length + (res.partial || []).length}</b> not read</span>` : ""}</div>
      </div>
      ${rel.length ? `<div class="list-card wi-res gu-jt">
        <p class="mini muted" style="margin:0 0 4px">Object ID <code>${esc(meta.principalId)}</code></p>
        <p class="mini" style="margin:0">${rel.join(" &nbsp;·&nbsp; ")}</p></div>` : ""}
      ${areaCards}
      ${guNotReadCard(res)}`;
  }

  // Shown only when a finished sweep is parked behind this single-group view.
  function guBackBar() {
    if (!guStash) return "";
    const n = guStash.totals.length;
    return `<div class="gu-back"><button class="btn" id="guBack">← Back to the sweep</button>
      <span class="mini muted">${n} group${n === 1 ? "" : "s"}${guStash.meta && guStash.meta.scopeNote ? ` · ${esc(guStash.meta.scopeNote)}` : ""}, still loaded — going back costs nothing</span></div>`;
  }
  function restoreGuSweep() {
    if (!guStash) return;
    const s = guStash; guStash = null;
    guTotals = s.totals; guGroups = s.groups; guRes = s.res; guMeta = s.meta;
    guQuery = s.query; guUnusedOnly = s.unusedOnly; guDanglingOnly = !!s.danglingOnly;
    guMode = "all";
    [...$("guModeSeg").children].forEach((x) => x.classList.toggle("active", x.dataset.gumode === "all"));
    $("guOneWrap").style.display = "none"; $("guAllWrap").style.display = "";
    $("guRun").textContent = "🔗 Sweep tenant";
    renderGroupUse();
  }

  function renderGuSweep() {
    const res = guRes;
    ["guMd", "guHtml", "guCsv"].forEach((id) => $(id).style.display = "");
    const q = guQuery.trim().toLowerCase();
    const vis = guTotals.filter((t) => (!q || t.name.toLowerCase().includes(q))
      && (!guUnusedOnly || !t.total) && (!guDanglingOnly || t.missing));
    const unused = guTotals.filter((t) => !t.total).length;
    const gone = guTotals.filter((t) => t.missing).length;
    $("guBody").innerHTML = `
      <div class="gu-sticky">
        <span class="gu-who">Tenant sweep
          <span class="mini muted">${guTotals.length} groups${guMeta && guMeta.scopeNote ? ` where ${esc(guMeta.scopeNote)}` : ""} · ${res.rows.length} references</span></span>
        <div class="gu-sum">
          <span class="gu-stat act${!guUnusedOnly && !guDanglingOnly && !guQuery ? " on" : ""}" data-gustat="all" title="Show every group in the sweep"><b>${guTotals.length}</b> groups</span>
          <span class="gu-stat act${guUnusedOnly ? " on" : ""}${unused ? "" : " zero"}" data-gustat="unused" title="Show only the groups nothing references"><b>${unused}</b> with no usage found</span>
          <span class="gu-stat act${guShowServices ? " on" : ""}" data-gustat="services" title="List every service that was read, and what it found"><b>${res.ran.length}</b> services read</span>
          <span class="gu-stat act${res.failed.length ? "" : " zero"}" data-gustat="notread" title="Jump to what could not be read"><b>${res.failed.length}</b> not read</span>
          ${gone ? `<span class="gu-stat act${guDanglingOnly ? " on" : ""}" data-gustat="dangling" title="Ids a policy still names but the directory no longer has"><b>${gone}</b> dangling</span>` : ""}
        </div>
        <div class="gu-bar" style="margin:0">
          <div class="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
            <input id="guSweepSearch" placeholder="Search groups…" value="${esc(guQuery)}">
          </div>
          <label class="chk"><input type="checkbox" id="guUnused"${guUnusedOnly ? " checked" : ""}> Only groups with no usage found</label>
        </div>
      </div>
      <div class="list-card wi-res gu-jt">
        ${guShowServices ? guServicesPanel(res) : ""}
        <div class="gu-tw"${guShowServices ? ' style="margin-top:12px"' : ""}><table class="plist">
          <thead><tr><th>Group</th><th class="gu-num">Entra</th><th class="gu-num">Intune</th><th class="gu-num">M365</th><th class="gu-num">Azure</th><th class="gu-num">Total</th></tr></thead>
          <tbody>${vis.map((t) => `<tr class="gu-row-link" data-gugroup="${esc(t.id)}" title="Open this group's references">
            <td>${esc(t.name)}${t.dynamic ? ' <span class="tag">dynamic</span>' : ""}${t.roleAssignable ? ' <span class="tag block">role-assignable</span>' : ""}${
              t.missing ? ` <span class="tag block">not in the directory</span><div class="mini" style="color:var(--off)">Named by ${esc(t.caPolicies.join(", "))} — that assignment targets nobody</div>` : ""}</td>
            <td class="gu-num${t.entra ? "" : " gu-zero"}">${t.entra}</td>
            <td class="gu-num${t.intune ? "" : " gu-zero"}">${t.intune}</td>
            <td class="gu-num${t.m365 ? "" : " gu-zero"}">${t.m365}</td>
            <td class="gu-num${t.azure ? "" : " gu-zero"}">${t.azure}</td>
            <td class="gu-num"><b>${t.total}</b></td></tr>`).join("")
            || '<tr><td colspan="6" class="mini muted">Nothing matches that filter.</td></tr>'}</tbody>
        </table></div>
        <p class="mini muted" style="margin:8px 0 0">Click a row to open that group's references — read straight from this sweep, no second scan.</p>
      </div>
      ${guNotReadCard(res)}`;
    wireSearchClears();
  }

  // What "19 services read" actually means, on demand — which services, what
  // each one found, and how long it took. The counter alone invites the
  // assumption that everything was covered; this is the receipt.
  function guServicesPanel(res) {
    const rows = [...res.ran]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .map((r) => `<tr><td>${esc(r.label)}</td><td class="mini">${esc(GroupUse.AREAS.find((a) => a.id === r.area)?.label || r.area)}</td>
        <td class="gu-num${r.count ? "" : " gu-zero"}">${r.count}</td><td class="gu-num mini">${r.ms} ms</td></tr>`).join("");
    return `<div class="gu-tw" style="margin-top:10px"><table class="plist">
      <thead><tr><th>Service read</th><th>Area</th><th class="gu-num">References</th><th class="gu-num">Time</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ---- per-group popup -----------------------------------------------------
  // Clicking a sweep row used to re-run the whole analysis, which on a large
  // tenant means waiting again for data already sitting in memory. The sweep
  // holds every (group, object) hit, so the popup is a filter — instant. The
  // one thing it cannot show is inheritance, because a sweep matches each group
  // only against itself; "Deep analyze" is the explicit opt-in for that.
  let guModalGroup = null;
  function openGuGroupModal(id) {
    if (!guTotals || !guRes) return;
    const t = guTotals.find((x) => String(x.id).toLowerCase() === String(id).toLowerCase());
    if (!t) return;
    guModalGroup = t;
    const rows = GroupUse.rowsFor(guRes.rows, t.id);
    const via = new Map([[String(t.id).toLowerCase(), "this group"]]);
    const per = GroupUse.byArea(rows);

    $("guModalTitle").innerHTML = `👥 ${esc(t.name)}
      ${t.dynamic ? '<span class="tag">dynamic</span>' : ""}${t.roleAssignable ? '<span class="tag block">role-assignable</span>' : ""}${
        t.missing ? '<span class="tag block">not in the directory</span>' : ""}`;
    $("guModalSub").innerHTML = `${rows.length} reference${rows.length === 1 ? "" : "s"} · <code>${esc(t.id)}</code>
      &nbsp;·&nbsp; ${GroupUse.AREAS.filter((a) => guAreas.has(a.id)).map((a) => `${a.icon} ${(per.get(a.id) || []).length}`).join(" &nbsp; ")}`;

    const areas = GroupUse.AREAS.map((a) => {
      const gs = GroupUse.grouped(per.get(a.id) || []);
      if (!gs.length) return "";
      return `<h4 class="wi-h" style="margin-top:14px">${a.icon} ${esc(a.label)}
        <span class="mini muted">${(per.get(a.id) || []).length}</span></h4>
        ${gs.map((g) => guSourceBlock(g, via)).join("")}`;
    }).join("");

    const dangleNote = t.missing
      ? `<div class="gu-fail" style="margin:0 0 12px"><b>Dangling reference.</b> ${esc(t.caPolicies.join(", "))} still name${t.caPolicies.length === 1 ? "s" : ""} this id, but the directory no longer has the group — so that assignment targets nobody. Remove the reference, or recreate the group.</div>`
      : "";
    $("guModalBody").innerHTML = dangleNote + (areas || `<p class="mini muted" style="margin:0">No references found in the services that were read. Check <b>Not read</b> on the sweep before treating this group as unused.</p>`)
      + `<p class="mini muted" style="margin:14px 0 0">A sweep matches every group against itself only. If this group is nested inside another, references that reach it <b>through the parent</b> are not listed here — use <b>Deep analyze</b> for that.</p>`;
    $("guModal").classList.add("open");
  }
  const closeGuModal = () => { $("guModal").classList.remove("open"); guModalGroup = null; };
  $("guModalClose").addEventListener("click", closeGuModal);
  $("guModal").addEventListener("click", (e) => {
    if (e.target.id === "guModal") { closeGuModal(); return; }
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { closeGuModal(); showDetail(pl.dataset.polid); }
  });
  $("guModalDeep").addEventListener("click", () => {
    const t = guModalGroup; if (!t) return;
    closeGuModal();
    guMode = "one";
    [...$("guModeSeg").children].forEach((x) => x.classList.toggle("active", x.dataset.gumode === "one"));
    $("guOneWrap").style.display = ""; $("guAllWrap").style.display = "none";
    $("guRun").textContent = "🔗 Analyze";
    $("guTerm").value = t.id;
    runGroupUse();   // parks the sweep on the way out — see the stash in runGroupUse
  });

  // Exports from the popup reuse the shared builders — one group, direct
  // references only, which is exactly what the popup shows.
  function guModalSlice() {
    const t = guModalGroup;
    const rows = GroupUse.rowsFor(guRes.rows, t.id);
    const res = { rows, ran: guRes.ran, failed: guRes.failed, skipped: guRes.skipped, partial: guRes.partial };
    const meta = { principalName: t.name, principalType: "group", principalId: t.id, tenant: tenantName,
      via: new Map([[String(t.id).toLowerCase(), "this group"]]), parents: [], children: [], roles: [] };
    return { res, meta, base: `CA-GroupAnalyzer-${(t.name || "group").replace(/[^\w.-]+/g, "-").slice(0, 40)}` };
  }
  $("guModalMd").addEventListener("click", () => {
    if (!guModalGroup) return;
    const { res, meta, base } = guModalSlice();
    closeGuModal();
    showReport(`🔗 Group Analyzer — ${meta.principalName}`, base, GroupUse.markdown(res, meta));
  });
  $("guModalHtml").addEventListener("click", () => {
    if (!guModalGroup) return;
    const { res, meta, base } = guModalSlice();
    downloadText(base, "html", "text/html", GroupUse.html(res, meta));
  });
  $("guModalCsv").addEventListener("click", () => {
    if (!guModalGroup) return;
    const { res, meta, base } = guModalSlice();
    downloadText(base, "csv", "text/csv", GroupUse.csv(res, meta));
  });

  $("guBody").addEventListener("click", (e) => {
    if (e.target.closest("#guBack")) { restoreGuSweep(); return; }

    // summary chips are filters and jumps, not decoration
    const jump = e.target.closest("[data-gujump]");
    if (jump) {
      const el = $(jump.dataset.gujump);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("gu-flash"); setTimeout(() => el.classList.remove("gu-flash"), 1200); }
      return;
    }
    const stat = e.target.closest("[data-gustat]");
    if (stat) {
      const k = stat.dataset.gustat;
      if (k === "all") { guUnusedOnly = false; guDanglingOnly = false; guQuery = ""; renderGuSweep(); }
      else if (k === "unused") { guUnusedOnly = !guUnusedOnly; guDanglingOnly = false; renderGuSweep(); }
      else if (k === "dangling") { guDanglingOnly = !guDanglingOnly; guUnusedOnly = false; renderGuSweep(); }
      else if (k === "services") { guShowServices = !guShowServices; renderGuSweep(); }
      else if (k === "notread") {
        const el = $("guNotRead");
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("gu-flash"); setTimeout(() => el.classList.remove("gu-flash"), 1200); }
        else toast("Everything in scope was read — nothing to show");
      }
      return;
    }
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { showDetail(pl.dataset.polid); return; }
    const row = e.target.closest("[data-gugroup]");
    if (row) openGuGroupModal(row.dataset.gugroup);
  });
  $("guMatchText").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runGroupUse(); } });
  $("guBody").addEventListener("input", (e) => {
    if (e.target.id === "guSweepSearch") { guQuery = e.target.value; renderGuSweep(); $("guSweepSearch").focus(); }
  });
  $("guBody").addEventListener("change", (e) => {
    if (e.target.id === "guUnused") { guUnusedOnly = e.target.checked; renderGuSweep(); }
  });

  $("guMd").addEventListener("click", () => {
    if (!guRes) return;
    if (guTotals) showReport("🔗 Group Analyzer — tenant sweep", "CA-GroupAnalyzer-Sweep", GroupUse.sweepMarkdown(guTotals, guRes, guMeta));
    else showReport(`🔗 Group Analyzer — ${guMeta.principalName}`, "CA-GroupAnalyzer", GroupUse.markdown(guRes, guMeta));
  });
  $("guHtml").addEventListener("click", () => {
    if (!guRes) return;
    const meta = { ...guMeta, tenant: tenantName };
    if (guTotals) downloadText("CA-GroupAnalyzer-Sweep", "html", "text/html", GroupUse.sweepHtml(guTotals, guRes, meta));
    else downloadText("CA-GroupAnalyzer", "html", "text/html", GroupUse.html(guRes, meta));
    toast("Standalone <span>HTML report</span> downloaded — it opens without access to the tenant");
  });
  $("guCsv").addEventListener("click", () => {
    if (!guRes) return;
    if (guTotals) downloadText("CA-GroupAnalyzer-Sweep", "csv", "text/csv", GroupUse.sweepCsv(guTotals));
    else downloadText("CA-GroupAnalyzer", "csv", "text/csv", GroupUse.csv(guRes, guMeta));
  });

  // ---------- MS Learn documented exclusion checks ----------
  let mlGroups = null, mlFilter = "all", mlStrengths = new Map(), mlFixes = null, mlTab = "findings";
  const mlExpanded = new Set();
  async function openMsLearn() {
    show("screen-mslearn");
    if (!policies.length) { $("mlHead").innerHTML = '<p class="mini">No policies loaded.</p>'; $("mlBody").innerHTML = ""; $("mlChips").innerHTML = ""; return; }
    $("mlHead").innerHTML = '<h3>📘 MS Learn: documented exclusion checks</h3><p class="mini" style="margin:6px 0 0">Running checks…</p>';
    $("mlChips").innerHTML = ""; $("mlBody").innerHTML = "";
    mlTab = "findings"; mlFixes = null;
    // baseline tenant → include Off + persona-only; note the scope
    const baseline = isBaselineTenant();
    $("mlDisabled").checked = baseline;
    $("mlDisabled").disabled = baseline;
    $("mlDisabledNote").textContent = scopeNote(checkScope(baseline), policies.filter(p => p.raw.state === "disabled").length);
    // authentication strengths are needed to detect external authentication
    // methods (EAM) inside strength policies — one read, Policy.Read.All
    mlStrengths = new Map();
    try {
      if (isDemo) {
        Object.entries(DEMO_DATA.depSettings || {}).forEach(([k, v]) => { if (k.startsWith("authStrength:")) mlStrengths.set(v.id, v); });
      } else {
        (await Graph.ggetAll("/policies/authenticationStrengthPolicies")).forEach(s => mlStrengths.set(s.id, s));
      }
    } catch (e) { console.warn("Auth strength fetch failed (EAM check limited):", e.message); }
    await runMsLearn();
  }
  // Resolve a group by the baseline naming convention — the first name that
  // actually exists in the tenant wins. Returns null when none exist, which
  // makes the dependent fixes decline rather than invent an exclusion.
  async function findGroupByConvention(names) {
    for (const name of names) {
      try {
        if (isDemo) {
          if (DEMO_DATA.scopeGroups && DEMO_DATA.scopeGroups[name]) return { id: name, name };
          continue;
        }
        const j = await Graph.gget(`/groups?$filter=displayName eq '${encodeURIComponent(name).replace(/'/g, "''")}'&$select=id,displayName&$top=1`);
        const g = (j.value || [])[0];
        if (g) return { id: g.id, name: g.displayName };
      } catch (e) { console.warn(`Group lookup failed for ${name}:`, e.message); }
    }
    return null;
  }

  async function runMsLearn() {
    const scope = checkScope($("mlDisabled").checked);

    // Resolve the convention groups FIRST. The checks need them: a policy that
    // already excludes the shared-device group is not broken by the thing the
    // check would fix, and reporting it anyway is a false positive. Fixes need
    // them too, which is why this used to run after the findings — the cost is
    // one lookup before the first paint, which is worth not lying.
    const ctx = {};
    ctx.breakGlass = await findGroupByConvention(MSLearn.CONVENTION.breakGlass);
    if (ctx.breakGlass) ctx.breakGlass.type = "group";
    else {
      try {
        const c = GapCheck.identifyBreakGlass(scope.raws);
        if (c) ctx.breakGlass = { id: c.id, type: c.type, name: policies.find(p => p.id === c.id)?.name || `ID ${c.id.slice(0, 8)}…` };
      } catch { /* GapCheck optional */ }
    }
    ctx.sharedDevices = await findGroupByConvention(MSLearn.CONVENTION.sharedDevices);

    // Which partners hold delegated administration here, and does this tenant
    // trust their MFA and device claims? The service provider checks use it
    // twice: to name the partner in a finding, and to stay quiet altogether in
    // a tenant that has no CSP relationship. { ok: false } means "not read" —
    // the checks then run and say the trust settings were not verified, which
    // is different from saying there is no partner.
    let partners = { ok: false, list: [], error: "not read" };
    if (isDemo) partners = { ok: true, list: DEMO_DATA.serviceProviders || [] };
    else partners = await Graph.serviceProviderPartners();

    const findings = MSLearn.run(scope.raws, mlStrengths, { includeDisabled: scope.includeDisabled, groups: ctx, partners });
    mlGroups = MSLearn.group(findings);
    mlFilter = "all"; mlExpanded.clear();
    renderMsLearn();

    mlFixes = MSLearn.buildFixes(findings, scope.raws, ctx);
    // A policy cannot reference a service principal the tenant does not have.
    // Resolve every app our fixes touch and drop the ones that do not exist —
    // otherwise Graph rejects the create with an unhelpful 400.
    if (!isDemo) {
      try {
        const ids = MSLearn.referencedAppIds(mlFixes);
        if (ids.length) MSLearn.markUnknownApps(mlFixes, await Graph.existingAppIds(ids));
      } catch (e) { console.warn("App reference check failed:", e.message); }
    }
    renderMsLearn();
  }
  $("mlDisabled").addEventListener("change", () => { runMsLearn(); });
  function renderMsLearn() {
    if (!mlGroups) return;
    const incDis = $("mlDisabled").checked;
    const nFix = mlFixes ? mlFixes.fixes.length : 0;
    $("mlTabFixes").textContent = nFix ? `Suggested fixes (${nFix})` : "Suggested fixes";
    $("mlTabFindings").classList.toggle("active", mlTab === "findings");
    $("mlTabFixes").classList.toggle("active", mlTab === "fixes");
    $("mlHead").innerHTML = MSLearn.renderSummary(mlGroups, MSLearn.checksCount, incDis);

    if (mlTab === "fixes") {
      $("mlChips").innerHTML = "";
      $("mlFixZip").style.display = nFix ? "" : "none";
      // writing back is offered only in a recognised baseline tenant
      $("mlApply").style.display = nFix && isBaselineTenant() && !isDemo ? "" : "none";
      $("mlBody").innerHTML = MSLearn.renderFixes(mlFixes || { fixes: [], skipped: [] });
      return;
    }
    $("mlFixZip").style.display = "none";
    $("mlApply").style.display = "none";
    if (!mlGroups.length) {
      $("mlChips").innerHTML = "";
      $("mlBody").innerHTML = MSLearn.renderEmpty();
      return;
    }
    const count = (s) => s === "all" ? mlGroups.length : mlGroups.filter(g => g.check.severity === s).length;
    $("mlChips").innerHTML = [["all", "All"], ["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["info", "Info"]]
      .filter(([k]) => count(k) > 0 || k === "all")
      .map(([k, l]) => `<button class="fchip ${mlFilter === k ? "active" : ""}" data-mlf="${k}">${l} (${count(k)})</button>`).join("");
    $("mlBody").innerHTML = MSLearn.renderGroups(mlGroups, mlFilter, mlExpanded);
  }
  $("mlTabFindings").addEventListener("click", () => { mlTab = "findings"; renderMsLearn(); });
  $("mlTabFixes").addEventListener("click", () => { mlTab = "fixes"; renderMsLearn(); });
  // Refresh: re-read the tenant, then re-run the MS Learn checks.
  $("mlRefresh").addEventListener("click", async () => {
    const btn = $("mlRefresh"); btn.disabled = true; btn.textContent = "⟳ Refreshing…";
    try {
      if (isDemo) loadDemo(); else await loadFromGraph(true);
      await openMsLearn();
      toast("MS Learn checks <span>refreshed</span>");
    } catch (e) { toast(`Refresh failed: <span>${esc(e.message || e)}</span>`); }
    finally { btn.disabled = false; btn.textContent = "⟳ Refresh"; }
  });

  // Create a missing convention group (e.g. CAB-SEC-U-SharedDevices) so the
  // dependent fixes stop declining. Role-assignable security group, empty —
  // the resource accounts are added by the operator afterwards.
  $("mlBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-mkgroup]"); if (!b) return;
    const key = b.dataset.mkgroup;
    const name = MSLearn.CONVENTION[key][0];
    if (isDemo) { toast("Demo mode — <span>no group created</span>"); return; }
    b.disabled = true; b.textContent = `Creating ${name}…`;
    try {
      // Prefer the bundled template: the shared-devices group is dynamic, with
      // a rule that picks up the Teams Rooms resource accounts on its own. The
      // old code always built a bare role-assignable group, which left an empty
      // group to populate by hand — and role-assignable + dynamic is a
      // combination Entra refuses anyway, so the template has to win.
      const tpl = Assign.templates().find((t) => t.displayName === name);
      const g = tpl
        ? await Assign.createGroup(tpl)
        : await Assign.createGroup({
            displayName: name,
            description: MSLearn.GROUP_PURPOSE[key] || `Created by ${Brand.title}`,
          });
      toast(g.dynamic
        ? `<span>${esc(g.name || name)}</span> created — dynamic, it fills itself from the Teams Rooms plans`
        : `<span>${esc(g.name || name)}</span> created — add the resource accounts, then re-run the fixes`);
      await runMsLearn();
    } catch (err) {
      b.disabled = false; b.innerHTML = `➕ Create ${esc(name)} <span class="tag block">writes</span>`;
      toast(`Could not create ${esc(name)}: <span>${esc(err.message || err)}</span>`);
    }
  });

  // a finding card's Fix button jumps to the generated policy
  $("mlBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-mlfix]")) { mlTab = "fixes"; renderMsLearn(); return; }
    const dl = e.target.closest("[data-fxjson]");
    if (!dl || !mlFixes) return;
    const f = mlFixes.fixes[+dl.dataset.fxjson]; if (!f) return;
    downloadText(safeFile(f.newName), "json", "application/json", f.json);
    toast(`<span>${esc(f.newName)}</span> downloaded`);
  });
  const safeFile = (n) => String(n).replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "policy";

  // ---------- apply the suggested fixes in the tenant (baseline tenants) ----------
  // Create-then-delete, per policy: the replacement must exist before the
  // original goes, so a failure never leaves the control missing entirely.
  // Everything lands Off, and the confirmation lists every create and delete.
  const ML_WRITE = ["Policy.ReadWrite.ConditionalAccess"];
  function openApplyModal() {
    if (!mlFixes || !mlFixes.fixes.length) return;
    const n = mlFixes.fixes.length;
    $("mlApplyTenant").textContent = tenantName || "this tenant";
    $("mlApplyDesc").innerHTML = `${n} new polic${n === 1 ? "y" : "ies"} will be created <b>Off (disabled)</b>, `
      + "each replacing the policy it was built from. Nothing is switched on — review and enable them yourself afterwards.";
    const miss = mlFixes.missingApps || [];
    $("mlApplyList").innerHTML = (miss.length ? `<div class="ml-apply-row">
        <div><span class="ml-op create">CREATE</span> ${miss.length} Microsoft service principal${miss.length === 1 ? "" : "s"} — required before the policies can reference them</div>
        <div class="mini">${miss.map((m) => `${esc(m.label)} (${esc(m.appId)})`).join(" · ")}</div>
      </div>` : "") + mlFixes.fixes.map((f) => `<div class="ml-apply-row">
        <div><span class="ml-op create">CREATE</span> ${esc(f.newName)} <span class="mini">· Off</span></div>
        <div><span class="ml-op delete">DELETE</span> ${esc(f.originalName)} <span class="mini">· currently ${esc(f.originalState)}</span></div>
        <div class="mini">${f.changes.length} adjustment${f.changes.length === 1 ? "" : "s"}: ${esc(f.changes.join("; "))}</div>
      </div>`).join("");
    $("mlApplyResult").style.display = "none"; $("mlApplyResult").innerHTML = "";
    $("mlApplyOk").checked = false; $("mlApplyDelete").checked = true;
    $("mlApplyGo").disabled = true; $("mlApplyGo").textContent = "Apply";
    $("mlApplyModal").classList.add("open");
  }
  $("mlApply").addEventListener("click", openApplyModal);
  $("mlApplyCancel").addEventListener("click", () => $("mlApplyModal").classList.remove("open"));
  $("mlApplyOk").addEventListener("change", (e) => { $("mlApplyGo").disabled = !e.target.checked; });
  $("mlApplyDelete").addEventListener("change", () => {
    const del = $("mlApplyDelete").checked;
    $("mlApplyModal").querySelectorAll(".ml-op.delete").forEach((el) => el.classList.toggle("skip", !del));
  });
  $("mlApplyGo").addEventListener("click", async () => {
    if (!mlFixes || !$("mlApplyOk").checked) return;
    const del = $("mlApplyDelete").checked;
    // Applying fixes may also have to create service principals, so both write
    // scopes are consented here rather than deep inside the loop.
    if (!await preConsent([...AUTH_CONFIG.scopes, "Policy.ReadWrite.ConditionalAccess", "Application.ReadWrite.All"])) return;
    const btn = $("mlApplyGo"); btn.disabled = true;
    const out = $("mlApplyResult"); out.style.display = ""; out.innerHTML = "";
    const log = (cls, msg) => { out.insertAdjacentHTML("beforeend", `<div class="ml-apply-row ${cls}">${msg}</div>`); out.scrollTop = out.scrollHeight; };
    let created = 0, deleted = 0, failed = 0;
    const results = [];
    // Step 0: instantiate the Microsoft apps the fixes reference. A policy that
    // names an app with no service principal is rejected outright, so this has
    // to happen before any policy is written.
    const spCreated = [], spFailed = [];
    for (const m of (mlFixes.missingApps || [])) {
      btn.textContent = "Creating service principals…";
      try {
        const sp = await Graph.createServicePrincipal(m.appId);
        spCreated.push({ ...m, name: sp.displayName || m.label });
        log("ok", `✓ Created service principal <b>${esc(sp.displayName || m.label)}</b> (${esc(m.appId)})`);
      } catch (e) {
        spFailed.push({ ...m, error: e.message || String(e) });
        log("bad", `✗ Could not create the service principal for <b>${esc(m.label)}</b> (${esc(m.appId)}): ${esc(e.message || e)} — that app reference will be dropped.`);
      }
    }
    // whatever could not be created must come out of the drafts
    if (spFailed.length) MSLearn.dropApps(mlFixes, spFailed.map((x) => x.appId));
    for (const f of mlFixes.fixes) {
      const rec = { fix: f, created: false, deleted: false, error: null, deleteError: null };
      results.push(rec);
      btn.textContent = `Applying ${created + failed + 1}/${mlFixes.fixes.length}…`;
      try {
        // Entra rejects some payloads without saying why; try the full policy
        // first, then progressively simpler variants, so one awkward property
        // does not cost the whole fix.
        const variants = MSLearn.createVariants(f);
        let res = null, lastErr = null;
        for (let vi = 0; vi < variants.length; vi++) {
          try {
            res = await Graph.gpost("/identity/conditionalAccess/policies", JSON.parse(variants[vi].json), [...AUTH_CONFIG.scopes, ...ML_WRITE]);
            if (vi > 0) {
              rec.variantNote = variants[vi].note;
              f.changes.push(variants[vi].note);
              log("ok", `↻ ${esc(variants[vi].note)}`);
            }
            break;
          } catch (err) { lastErr = err; res = null; }
        }
        if (!res) throw lastErr;
        created++; rec.created = true; rec.createdId = res && res.id;
        log("ok", `✓ Created <b>${esc(f.newName)}</b> (Off)`);
        if (del) {
          try {
            await Graph.gdelete(`/identity/conditionalAccess/policies/${f.policyId}`, [...AUTH_CONFIG.scopes, ...ML_WRITE]);
            deleted++; rec.deleted = true;
            log("ok", `✓ Deleted <b>${esc(f.originalName)}</b>`);
          } catch (e) {
            failed++; rec.deleteError = e.message || String(e);
            log("bad", `✗ Created the replacement but could NOT delete <b>${esc(f.originalName)}</b>: ${esc(e.message || e)} — both policies now exist, remove the old one manually.`);
          }
        }
        if (res && res.id) f.createdId = res.id;
      } catch (e) {
        failed++; rec.error = e.message || String(e);
        log("bad", `✗ Failed to create <b>${esc(f.newName)}</b>: ${esc(e.message || e)} — <b>${esc(f.originalName)}</b> was left untouched.`);
      }
    }
    btn.textContent = "Done";
    log("", `<b>${created}</b> created · <b>${deleted}</b> deleted · <b>${failed}</b> failed. Reloading policies…`);
    const mlMd = applyReport(results, { created, deleted, failed, del, spCreated, spFailed });
    toast(`${created} polic${created === 1 ? "y" : "ies"} created${deleted ? `, ${deleted} removed` : ""}`);
    try { await loadFromGraph(true); } catch { /* surfaced by loadFromGraph */ }
    show("screen-mslearn");
    await openMsLearn();
    showReport("📘 MS Learn fixes applied", "CA-MSLearn-Applied", mlMd);
  });

  // Markdown record of what the apply actually did — one row per policy, the
  // adjustments that were written, and every failure with its Graph message.
  function applyReport(results, sum) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = [];
    L.push(`# MS Learn fixes applied — ${e(tenantName || "tenant")}`);
    L.push("");
    L.push(Brand.generatedBy("Applied"));
    L.push("");
    L.push(`- Created: **${sum.created}** (all in the **Off / disabled** state)`);
    L.push(`- Deleted: **${sum.deleted}**${sum.del ? "" : " — the originals were kept on purpose"}`);
    L.push(`- Failed: **${sum.failed}**`);
    if ((sum.spCreated || []).length) L.push(`- Service principals created: **${sum.spCreated.length}**`);
    if ((sum.spFailed || []).length) L.push(`- Service principals that could NOT be created: **${sum.spFailed.length}**`);
    L.push("");
    if ((sum.spCreated || []).length) {
      L.push("## Service principals created");
      L.push("");
      L.push("These Microsoft first-party apps had no service principal in the tenant, so the policies could not reference them.");
      L.push("Creating one only materialises the object — no permissions are consented.");
      L.push("");
      sum.spCreated.forEach((m) => L.push(`- ${e(m.name || m.label)} — \`${e(m.appId)}\``));
      L.push("");
    }
    if ((sum.spFailed || []).length) {
      L.push("## Service principals that could not be created");
      L.push("");
      sum.spFailed.forEach((m) => L.push(`- ${e(m.label)} (\`${e(m.appId)}\`) — ${e(m.error)}. The reference was dropped from the policies that wanted it.`));
      L.push("");
    }
    L.push("| Result | New policy | Replaced | Adjustments |");
    L.push("| --- | --- | --- | --- |");
    for (const r of results) {
      const result = r.error ? "❌ create failed"
        : r.deleteError ? "⚠ created, delete failed"
        : r.deleted ? "✅ created + original deleted"
        : "✅ created (original kept)";
      L.push(`| ${result} | ${e(r.fix.newName)} | ${e(r.fix.originalName)} | ${r.fix.changes.length} |`);
    }
    L.push("");

    const done = results.filter((r) => r.created);
    if (done.length) {
      L.push("## What changed, policy by policy");
      L.push("");
      for (const r of done) {
        L.push(`### ${e(r.fix.newName)}`);
        L.push("");
        L.push(`Built from **${e(r.fix.originalName)}** (was ${e(r.fix.originalState)}), created **Off**.`);
        L.push(r.deleted ? "The original policy was deleted." : r.deleteError
          ? `⚠ The original could NOT be deleted: ${e(r.deleteError)} — both policies exist, remove the old one manually.`
          : "The original policy was kept.");
        L.push("");
        r.fix.changes.forEach((c) => L.push(`- ${e(c)}`));
        L.push("");
        L.push(`Based on: ${e(r.fix.checks.map((c) => c.title).join("; "))}`);
        L.push("");
      }
    }

    const bad = results.filter((r) => r.error);
    if (bad.length) {
      L.push("## Failures");
      L.push("");
      for (const r of bad) {
        L.push(`### ${e(r.fix.newName)}`);
        L.push("");
        L.push(`${e(r.error)}`);
        L.push("");
        L.push(`\`${e(r.fix.originalName)}\` was left untouched.`);
        L.push("");
        if (r.fix.changes.length) {
          L.push("The adjustments it was trying to write:");
          L.push("");
          r.fix.changes.forEach((c) => L.push(`- ${e(c)}`));
          L.push("");
        }
        // the payload is what a support case or a manual retry actually needs
        L.push("<details><summary>Policy JSON that was rejected</summary>");
        L.push("");
        L.push("```json");
        L.push(r.fix.json);
        L.push("```");
        L.push("");
        L.push("</details>");
        L.push("");
      }
    }
    L.push("---");
    L.push("");
    L.push("Every created policy is disabled. Review it, switch it to report-only, check the sign-in impact, then enable.");
    return L.join("\n");
  }

  // all generated policies in one zip, alongside a README describing them
  $("mlFixZip").addEventListener("click", async () => {
    if (!mlFixes || !mlFixes.fixes.length) return;
    const btn = $("mlFixZip"); btn.disabled = true;
    try {
      const zip = new JSZip();
      const folder = zip.folder("SuggestedPolicies");
      const lines = ["# MS Learn suggested policies", "",
        `Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC from ${tenantName || "the connected tenant"}.`, "",
        "Every file is a NEW Conditional Access policy built from an existing one with the",
        "documented Microsoft Learn adjustment applied. The version in the name is bumped and",
        "the state is **disabled** — nothing was changed in the tenant. Review, then bring them",
        "in through the Import tool and enable deliberately.", ""];
      for (const f of mlFixes.fixes) {
        folder.file(`${safeFile(f.newName)}.json`, f.json);
        lines.push(`## ${f.newName}`, "", `From: ${f.originalName} (state: ${f.originalState})`, "");
        f.changes.forEach((c) => lines.push(`- ${c}`));
        lines.push("", `Based on: ${f.checks.map((c) => c.title).join("; ")}`, "");
      }
      zip.file("README.md", lines.join("\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const d = new Date(), pad = (n) => String(n).padStart(2, "0");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `CA-SuggestedFixes-${(tenantName || "tenant").replace(/[^\w-]+/g, "-")}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`${mlFixes.fixes.length} suggested polic${mlFixes.fixes.length === 1 ? "y" : "ies"} <span>downloaded</span>`);
    } catch (err) {
      toast(`Zip failed: <span>${esc(err.message || err)}</span>`);
    } finally { btn.disabled = false; }
  });
  $("mlChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mlf]"); if (!b) return;
    mlFilter = b.dataset.mlf; renderMsLearn();
  });
  $("mlBody").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link");
    if (pl) { showDetail(pl.dataset.polid); return; }
    const t = e.target.closest("[data-mltoggle]"); if (!t) return;
    const id = t.dataset.mltoggle;
    mlExpanded.has(id) ? mlExpanded.delete(id) : mlExpanded.add(id);
    renderMsLearn();
  });

  // ---------- gap analysis (best-practice & bypass checks) ----------
  let gcResult = null, gcFilter = "all", gcCtx = null, gcMeta = null;
  let gcCats = null; // category filter set by clicking a scorecard signal/pillar (array or null)
  const gcExpanded = new Set();
  function openGapCheck() {
    show("screen-gapcheck");
    if (!policies.length) { $("gcHead").innerHTML = '<p class="mini">No policies loaded.</p>'; $("gcMatrix").innerHTML = ""; $("gcChips").innerHTML = ""; $("gcBody").innerHTML = ""; return; }
    if (gcResult) { renderGapCheck(); return; }   // cached — keep the previous screen
    // idle — wait for the user to start the checks
    $("gcHead").innerHTML = '<h3>🛡 Best-practice &amp; bypass checks</h3><p class="mini" style="margin:6px 0 0">Check the baseline against known Conditional Access bypasses and the Swiss-cheese model — MFA coverage, break-glass, known bypass apps, and a persona × control matrix.</p>';
    $("gcMatrix").innerHTML = ""; $("gcChips").innerHTML = "";
    $("gcBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-gcrun>▶ Run checks</button><p class="mini muted">Reads authentication strengths and named locations via Microsoft Graph. Results stay until you refresh.</p></div>';
  }
  async function runGapCheckScan() {
    show("screen-gapcheck");
    if (!policies.length) return;
    $("gcHead").innerHTML = '<h3>🛡 Best-practice &amp; bypass checks</h3><p class="mini" style="margin:6px 0 0">Running checks…</p>';
    $("gcMatrix").innerHTML = ""; $("gcChips").innerHTML = ""; $("gcBody").innerHTML = "";
    // baseline tenant → include Off + persona-only; note the scope
    const baseline = isBaselineTenant();
    $("gcDisabled").checked = baseline;
    $("gcDisabled").disabled = baseline;
    $("gcDisabledNote").textContent = scopeNote(checkScope(baseline), policies.filter(p => p.raw.state === "disabled").length);
    const raws = policies.map(p => p.raw);
    // context: auth strengths (phishing-resistant detection), named locations
    // (trusted-network detection), break-glass display name — all Policy.Read.All
    gcCtx = { strengths: new Map(), namedLocations: [], names: {} };
    try {
      if (isDemo) {
        Object.entries(DEMO_DATA.depSettings || {}).forEach(([k, v]) => { if (k.startsWith("authStrength:")) gcCtx.strengths.set(v.id, v); });
        gcCtx.names = DEMO_DATA.names || {};
        gcCtx.namedLocations = DEMO_DATA.namedLocations || [];
      } else {
        const [strengths, locations] = await Promise.all([
          Graph.ggetAll("/policies/authenticationStrengthPolicies").catch(() => []),
          Graph.ggetAll("/identity/conditionalAccess/namedLocations").catch(() => []),
        ]);
        strengths.forEach(s => gcCtx.strengths.set(s.id, s));
        gcCtx.namedLocations = locations;
        const bg = GapCheck.identifyBreakGlass(raws);
        if (bg) {
          try {
            const j = await Graph.gpost("/directoryObjects/getByIds", { ids: [bg.id], types: ["user", "group"] });
            (j.value || []).forEach(o => gcCtx.names[o.id] = o.displayName);
          } catch (e) { console.warn("Break-glass name lookup failed:", e.message); }
        }
      }
    } catch (e) { console.warn("Best-practice checks context fetch failed:", e.message); }
    runGapCheck();
  }
  function runGapCheck() {
    const scope = checkScope($("gcDisabled").checked);
    gcResult = GapCheck.run(scope.raws, gcCtx, { includeDisabled: scope.includeDisabled });
    gcMeta = { tenantName, policyCount: scope.raws.length, includeDisabled: scope.includeDisabled, skipped: scope.skipped };
    gcFilter = "all"; gcCats = null; gcExpanded.clear();
    renderGapCheck();
  }
  // Refresh: pull the policies again from Entra, then re-run every gap check.
  $("gcRefresh").addEventListener("click", async () => {
    const btn = $("gcRefresh");
    btn.disabled = true; btn.textContent = "⟳ Refreshing…";
    try {
      if (isDemo) loadDemo(); else await loadFromGraph(true);
      gcCtx = null;
      await runGapCheckScan();
      toast("Best-practice &amp; bypass checks <span>refreshed</span>");
    } catch (e) {
      toast(`Refresh failed: <span>${esc(e.message || e)}</span>`);
    } finally {
      btn.disabled = false; btn.textContent = "⟳ Refresh";
    }
  });
  $("gcMd").addEventListener("click", () => {
    if (!gcResult) return;
    showReport("🛡 Best-practice & bypass checks", "CA-BestPractice-Checks", GapCheck.toMd(gcResult, gcMeta || { tenantName }));
    toast("Best-practice checks Markdown <span>downloaded</span>");
  });
  $("gcDisabled").addEventListener("change", runGapCheck);
  function renderGapCheck() {
    if (!gcResult) return;
    $("gcHead").innerHTML = GapCheck.renderSummary(gcResult, gcCats);
    $("gcMatrix").innerHTML = GapCheck.renderPersonaMatrix(gcResult.personas);
    $("gcFull").style.display = gcResult.personas.length ? "" : "none";
    // Severity counts respect an active scorecard category filter, so the
    // chips describe what is actually on screen.
    const inCats = gcCats && gcCats.length ? gcResult.findings.filter(f => gcCats.includes(f.category)) : gcResult.findings;
    const n = (s) => s === "all" ? inCats.length : inCats.filter(f => f.severity === s).length;
    const catChip = gcCats && gcCats.length
      ? `<button class="fchip active" data-gccatclear title="Click to show all categories again">✕ ${esc(gcCats.join(", "))}</button>` : "";
    $("gcChips").innerHTML = catChip + [["all", "All"], ["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"], ["info", "Info"]]
      .filter(([k]) => n(k) > 0 || k === "all")
      .map(([k, l]) => `<button class="fchip ${gcFilter === k ? "active" : ""}" data-gcf="${k}">${l} (${n(k)})</button>`).join("");
    $("gcBody").innerHTML = GapCheck.renderFindings(gcResult, gcFilter, gcExpanded, gcCats);
  }
  $("gcChips").addEventListener("click", (e) => {
    if (e.target.closest("[data-gccatclear]")) { gcCats = null; renderGapCheck(); return; }
    const b = e.target.closest("[data-gcf]"); if (!b) return;
    gcFilter = b.dataset.gcf;
    if (b.dataset.gcf === "all") gcCats = null; // "All" also clears a scorecard filter
    renderGapCheck();
  });
  // Scorecard signals / pillars live inside gcHead — clicking one filters the
  // findings list to its related categories; clicking the same one clears it.
  $("gcHead").addEventListener("click", (e) => {
    const b = e.target.closest("[data-gccat]"); if (!b) return;
    const cats = b.dataset.gccat ? b.dataset.gccat.split("|") : [];
    if (!cats.length) return;
    gcCats = (gcCats && gcCats.join("|") === cats.join("|")) ? null : cats;
    renderGapCheck();
  });
  $("gcBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-gcrun]")) { runGapCheckScan(); return; }
    const pl = e.target.closest(".pol-link");
    if (pl) { showDetail(pl.dataset.polid); return; }
    const t = e.target.closest("[data-gctoggle]"); if (!t) return;
    const id = t.dataset.gctoggle;
    gcExpanded.has(id) ? gcExpanded.delete(id) : gcExpanded.add(id);
    renderGapCheck();
  });

  // ---------- CIS Benchmark alignment ----------
  // Scan on demand (▶ button), result persists across tab switches until an
  // explicit rescan — same lifecycle as Sign-in failures and Protect.
  let ciResult = null, ciCtx = null, ciMeta = null;
  let ciFilter = { level: "all", status: "all" };
  const ciExpanded = new Set();
  const CI_IDLE_HEAD = '<h3>📐 CIS Benchmark alignment <span class="tag new">BETA</span></h3><p class="mini" style="margin:6px 0 0">Score the Conditional Access policies against the CIS Microsoft 365 Foundations Benchmark v7.0.0 — the 17 automated CA recommendations of section 5.2.2, with per-control pass/fail and the nearest policy for every gap.</p>';
  function openCis() {
    show("screen-cis");
    if (!policies.length) { $("ciHead").innerHTML = '<p class="mini">No policies loaded.</p>'; $("ciChips").innerHTML = ""; $("ciBody").innerHTML = ""; return; }
    if (ciResult) { renderCis(); return; }   // cached — keep the previous screen
    $("ciHead").innerHTML = CI_IDLE_HEAD;
    $("ciChips").innerHTML = "";
    $("ciBody").innerHTML = '<div class="run-prompt"><button class="btn primary" data-cirun>▶ Assess against CIS v7.0</button><p class="mini muted">Reads authentication strengths, named locations and the tenant\'s licence SKUs via Microsoft Graph. Results stay until you refresh.</p></div>';
  }
  async function runCisScan() {
    show("screen-cis");
    if (!policies.length) return;
    $("ciHead").innerHTML = CI_IDLE_HEAD.replace("Score the", "Assessing… reads authentication strengths, named locations and licence SKUs, then scores the");
    $("ciChips").innerHTML = ""; $("ciBody").innerHTML = "";
    const raws = policies.map(p => p.raw);
    ciCtx = { strengths: new Map(), namedLocations: [], p2: null, groupNames: {} };
    try {
      if (isDemo) {
        Object.entries(DEMO_DATA.depSettings || {}).forEach(([k, v]) => { if (k.startsWith("authStrength:")) ciCtx.strengths.set(v.id, v); });
        ciCtx.namedLocations = DEMO_DATA.namedLocations || [];
        ciCtx.p2 = true;
        ciCtx.groupNames = DEMO_DATA.names || {};
      } else {
        const [strengths, locations, skus] = await Promise.all([
          Graph.ggetAll("/policies/authenticationStrengthPolicies").catch(() => []),
          Graph.ggetAll("/identity/conditionalAccess/namedLocations").catch(() => []),
          Graph.ggetAll("/subscribedSkus").catch(() => null),
        ]);
        strengths.forEach(s => ciCtx.strengths.set(s.id, s));
        ciCtx.namedLocations = locations;
        // Entra ID P2 (AAD_PREMIUM_P2 service plan) gates the three Identity
        // Protection controls. skus === null → the read failed: licence
        // unknown, assess anyway rather than guessing not-applicable.
        if (Array.isArray(skus)) {
          ciCtx.p2 = skus.some(s => !["Suspended", "Deleted", "LockedOut"].includes(s.capabilityStatus) &&
            (s.servicePlans || []).some(x => x.servicePlanName === "AAD_PREMIUM_P2" && ["Success", "PendingInput"].includes(x.provisioningStatus)));
        }
        // Include-group display names: the CAD- pilot-deployment detection
        // needs them (policies store only GUIDs).
        const gids = [...new Set(raws.flatMap(p => p.conditions?.users?.includeGroups || []))];
        for (let i = 0; i < gids.length; i += 1000) {
          try {
            const j = await Graph.gpost("/directoryObjects/getByIds", { ids: gids.slice(i, i + 1000), types: ["group"] });
            (j.value || []).forEach(o => ciCtx.groupNames[o.id] = o.displayName);
          } catch (e) { console.warn("CIS group-name lookup failed:", e.message); break; }
        }
      }
    } catch (e) { console.warn("CIS benchmark context fetch failed:", e.message); }
    ciResult = CisCheck.run(raws, ciCtx);
    ciMeta = { tenantName, policyCount: raws.filter(p => p.state === "enabled" || p.state === "enabledForReportingButNotEnforced").length };
    ciFilter = { level: "all", status: "all" }; ciExpanded.clear();
    renderCis();
  }
  function renderCis() {
    if (!ciResult) return;
    $("ciHead").innerHTML = CisCheck.renderSummary(ciResult, ciMeta);
    document.querySelectorAll("#ciLevelSeg button").forEach(b =>
      b.classList.toggle("active", String(ciFilter.level) === b.dataset.cilvl));
    const n = (s) => s === "all" ? ciResult.results.length : ciResult.results.filter(r => r.status === s).length;
    $("ciChips").innerHTML = [["all", "All"], ["pass", "✓ Pass"], ["reportonly", "◐ Report-only"], ["configured", "⏸ Configured (Off)"], ["fail", "✗ Fail"], ["unlicensed", "Not licensed"]]
      .filter(([k]) => n(k) > 0 || k === "all")
      .map(([k, l]) => `<button class="fchip ${ciFilter.status === k ? "active" : ""}" data-cist="${k}">${l} (${n(k)})</button>`).join("");
    $("ciBody").innerHTML = CisCheck.renderTable(ciResult, ciFilter, ciExpanded);
  }
  $("ciLevelSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cilvl]"); if (!b) return;
    ciFilter.level = b.dataset.cilvl === "all" ? "all" : Number(b.dataset.cilvl);
    renderCis();
  });
  $("ciChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cist]"); if (!b) return;
    ciFilter.status = b.dataset.cist; renderCis();
  });
  $("ciBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-cirun]")) { runCisScan(); return; }
    const pl = e.target.closest(".pol-link");
    if (pl && pl.dataset.polid) { showDetail(pl.dataset.polid); return; }
    const t = e.target.closest("[data-cistoggle]"); if (!t) return;
    const id = t.dataset.cistoggle;
    ciExpanded.has(id) ? ciExpanded.delete(id) : ciExpanded.add(id);
    renderCis();
  });
  $("ciRefresh").addEventListener("click", async () => {
    const btn = $("ciRefresh");
    btn.disabled = true; btn.textContent = "⟳ Refreshing…";
    try {
      if (isDemo) loadDemo(); else await loadFromGraph(true);
      ciCtx = null;
      await runCisScan();
      toast("CIS Benchmark alignment <span>refreshed</span>");
    } catch (e) {
      toast(`Refresh failed: <span>${esc(e.message || e)}</span>`);
    } finally {
      btn.disabled = false; btn.textContent = "⟳ Refresh";
    }
  });
  $("ciMd").addEventListener("click", () => {
    if (!ciResult) return;
    showReport("📐 CIS Benchmark alignment", "CA-CIS-Benchmark", CisCheck.toMd(ciResult, ciMeta || { tenantName }));
    toast("CIS Benchmark Markdown <span>downloaded</span>");
  });

  // ---------- events ----------
  $("signInBtn").addEventListener("click", async () => {
    if (AUTH_CONFIG.clientId.startsWith("00000000")) {
      alert("No clientId configured yet in js/authConfig.js — see README.md step 1.\nUse the demo link below to preview the app.");
      return;
    }
    const btn = $("signInBtn"); btn.disabled = true;
    $("loginErr").style.display = "none";
    try {
      if (Graph.authMode() === "redirect") { await Graph.signInRedirect(); return; }   // navigates away
      await Graph.signIn();
      await loadFromGraph();
    } catch (e) {
      console.error("Sign-in failed:", e);
      showSignInError(e);
    } finally { btn.disabled = false; }
  });

  // MSAL reports user_cancelled for ANY popup that closes without a token —
  // not just the X. A Conditional Access interrupt the popup cannot satisfy, a
  // tenant that has not consented, an account blocked from the app: all of them
  // close the window, and this used to `return` silently, dropping the person
  // back on the sign-in screen with no explanation at all. Whatever the cause,
  // the app owes them the reason.
  const AADSTS = [
    [/AADSTS53003|blocked by Conditional Access/i, "A <b>Conditional Access policy in this tenant blocks this sign-in</b>. Check the sign-in log for this account — the failure names the policy. If it requires a compliant or hybrid-joined device, a browser pop-up on an unmanaged device cannot satisfy it."],
    [/AADSTS50076|AADSTS50079|AADSTS50072/i, "This sign-in needs <b>multi-factor authentication</b>, and the pop-up closed before it completed. Try again and finish the prompt, or sign in to portal.azure.com first so the session already carries MFA."],
    [/AADSTS50005|AADSTS530003|device/i, "A <b>device policy</b> is blocking the sign-in — typically a Conditional Access rule requiring a managed or compliant device."],
    [/AADSTS65001|AADSTS900971|consent/i, "This tenant has <b>not consented</b> to the app yet. A Global Administrator or Privileged Role Administrator must grant admin consent once — see the consent URL in the README."],
    [/AADSTS700016|application.*not found/i, "The app is <b>not present in this tenant</b> — nobody has consented to it here yet. An administrator needs to run the admin-consent URL once."],
    [/AADSTS50011|redirect_uri/i, `<b>Redirect URI mismatch.</b> The app registration needs this exact SPA redirect URI: <code>${window.location.origin + window.location.pathname}</code>`],
    [/AADSTS50020|AADSTS50128|AADSTS50034/i, "That account does not exist in a tenant this app can sign in to — check you used the <b>work account</b>, not a personal one."],
    [/AADSTS90094|admin.*consent/i, "The permissions need <b>admin consent</b>; a normal user cannot grant them."],
  ];

  function showSignInError(e) {
    const code = e.errorCode || e.name || "";
    const msg = e.errorMessage || e.message || String(e);
    const el = $("loginErr");

    let lead = "", hint = "";
    if (code === "popup_window_error" || code === "empty_window_error" || /popup/i.test(msg)) {
      lead = "The sign-in pop-up was blocked.";
      hint = "Allow pop-ups for this site and try again.";
    } else {
      const hit = AADSTS.find(([re]) => re.test(msg));
      if (hit) { lead = "Sign-in did not complete."; hint = hit[1]; }
      else if (code === "user_cancelled") {
        lead = "The sign-in window closed before it finished.";
        hint = "If you closed it yourself, just try again. <b>If it closed on its own and you are in Microsoft Edge with a work profile</b>, Edge may be reopening the pop-up in another profile, which breaks the link back to this page — use <b>Sign in without a pop-up</b> below. Otherwise this tenant is interrupting the sign-in (a Conditional Access policy on this app, or consent that has not been granted) and the sign-in log for this account will name it.";
      } else { lead = "Sign-in failed."; hint = esc(msg); }
    }

    // The raw detail, selectable in one click, so it can be pasted into a
    // ticket or handed to whoever owns the tenant.
    const diag = [code && `code: ${code}`, `at: ${new Date().toISOString()}`,
      msg && msg !== code ? `detail: ${msg}` : ""].filter(Boolean).join(" · ");

    el.innerHTML = `<p><b>${esc(lead)}</b></p><p>${hint}</p>`
      + `<div class="diag">${esc(diag)}</div>`;
    el.style.display = "";
  }
  function markRedirectMode() {
    const a = $("noPopupLink");
    a.textContent = "Using redirect sign-in · switch back to a pop-up";
  }
  $("noPopupLink").addEventListener("click", async (e) => {
    e.preventDefault();
    if (Graph.authMode() === "redirect") {          // toggle back
      Graph.setAuthMode("popup");
      $("noPopupLink").textContent = "Pop-up not working? Sign in without one →";
      toast("Back to <span>pop-up</span> sign-in");
      return;
    }
    $("loginErr").style.display = "none";
    markRedirectMode();
    try { await Graph.signInRedirect(); }           // leaves the page
    catch (err) { console.error(err); showSignInError(err); }
  });

  $("signOutBtn").addEventListener("click", () => {
    $("tenantBox").style.display = "none";
    $("homeBtn").style.display = "none";
    $("toolNav").style.display = "none";
    policies = []; selected.clear();
    // Back to the neutral look — the next person at this browser may not be
    // the same audience.
    try { sessionStorage.removeItem(BRAND_STORE); } catch {}
    applyBranding(activeBrand());
    Graph.signOut?.();
    show("screen-login");
  });

  // Every search box gets a clear (×) — eight tools filter through one, and
  // backspacing a query out is friction none of them needs. The tools all react
  // to the input event already, so clearing just replays that rather than
  // wiring anything per tool. Escape clears too, like a browser search field.
  function wireSearchClears() {
    document.querySelectorAll(".search").forEach((wrap) => {
      const input = wrap.querySelector("input");
      if (!input || wrap.querySelector(".search-x")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-x";
      btn.tabIndex = -1;                    // Tab should reach the results, not this
      btn.title = "Clear search (Esc)";
      btn.setAttribute("aria-label", "Clear search");
      btn.textContent = "×";
      const clear = () => {
        if (!input.value) return;
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      };
      btn.addEventListener("click", clear);
      input.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); clear(); } });
      wrap.appendChild(btn);               // must follow the input: CSS uses ~
    });
  }
  wireSearchClears();

  $("searchBox").addEventListener("input", (e) => { query = e.target.value.toLowerCase(); refreshViews(); });
  $("stateChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-state]"); if (!b) return;
    stateFilter = b.dataset.state; refreshViews();
  });
  // matrix: expand/collapse long cell lists
  $("mtable").addEventListener("click", (e) => {
    const b = e.target.closest(".clip-btn"); if (!b) return;
    const rest = b.closest(".clipgrp")?.querySelector(".clip-rest"); if (!rest) return;
    rest.hidden = !rest.hidden;
    b.textContent = rest.hidden ? `▾ ${b.dataset.more} more` : "▴ show less";
  });

  $("viewCards").addEventListener("click", () => setView("cards"));
  $("viewList").addEventListener("click", () => setView("list"));
  $("viewMatrix").addEventListener("click", () => setView("matrix"));
  $("clearSelBtn").addEventListener("click", () => { selected.clear(); refreshViews(); });

  // list view: name opens detail, checkbox selects, group header collapses/selects group
  document.querySelector("#ptable tbody").addEventListener("click", (e) => {
    const fb = e.target.closest("[data-flowkey]");
    if (fb) { e.stopPropagation(); openPersonaFlow(+fb.dataset.flowkey); return; }
    const gr = e.target.closest(".grouprow");
    if (gr) {
      if (e.target.matches("[data-gsel]")) return; // handled by change event
      const k = gr.dataset.gkey;
      collapsedGroups.has(k) ? collapsedGroups.delete(k) : collapsedGroups.add(k);
      refreshViews();
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) showDetail(open.dataset.open);
  });
  document.querySelector("#ptable tbody").addEventListener("change", (e) => {
    const g = e.target.closest("[data-gsel]");
    if (g) { toggleGroupSel(g.dataset.gsel, g.checked); return; }
    const cb = e.target.closest("[data-sel]"); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    refreshViews();
  });
  // operates on the data (all filtered policies), including collapsed groups
  function toggleSelectAll(on) {
    visible().forEach(p => on ? selected.add(p.id) : selected.delete(p.id));
    refreshViews();
  }
  $("selAll").addEventListener("change", (e) => toggleSelectAll(e.target.checked));
  $("selAllTop").addEventListener("change", (e) => toggleSelectAll(e.target.checked));

  // cards view: checkbox selects, click elsewhere opens detail modal
  $("cardsView").addEventListener("click", (e) => {
    const fb = e.target.closest("[data-flowkey]");
    if (fb) { e.stopPropagation(); openPersonaFlow(+fb.dataset.flowkey); return; }
    const gh = e.target.closest(".cardgroup"); // persona header: collapse/expand or group-select
    if (gh) {
      if (e.target.matches("[data-gsel]")) return; // handled by change event
      const k = gh.dataset.gkey;
      collapsedGroups.has(k) ? collapsedGroups.delete(k) : collapsedGroups.add(k);
      refreshViews();
      return;
    }
    if (e.target.matches("[data-sel]")) return; // handled by change event
    const sc = e.target.closest("[data-open]"); if (!sc) return;
    showDetail(sc.dataset.open);
  });
  $("cardsView").addEventListener("change", (e) => {
    const g = e.target.closest("[data-gsel]");
    if (g) { toggleGroupSel(g.dataset.gsel, g.checked); return; }
    const cb = e.target.closest("[data-sel]"); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    refreshViews();
  });

  // ---------- dependency settings viewer ----------
  const DEP_TYPE_MAP = { authStrength: "authStrengths", termsOfUse: "termsOfUse", namedLocation: "namedLocations", authContext: "authContexts", group: "groups" };
  const DEP_TITLES = { authStrength: "Authentication strength", termsOfUse: "Terms of use", namedLocation: "Named location", authContext: "Authentication context", group: "Group" };
  const depCache = new Map();
  let currentDepObj = null, currentDepType = null;
  // The dependency popup doubles as the junction into the manage tools: an
  // auth strength seen on a policy card is one click from being edited.
  const DEP_MANAGE = {
    authStrength: { label: "Manage in 💪 Authentication strengths →" },
    termsOfUse: { label: "Manage in 📜 Terms of use →" },
    namedLocation: { label: "Manage in 🌐 Named locations →" },
    authContext: { label: "Manage in 🎫 Authentication contexts →" },
  };
  function depManageJump() {
    if (!currentDepObj || !currentDepType) return;
    const name = currentDepObj.displayName || "";
    $("depModal").classList.remove("open");
    $("detailModal").classList.remove("open");
    // open the matching tool pre-filtered to this item
    if (currentDepType === "authStrength") { asQuery = name; $("asSearch").value = name; asFilter = "all"; openAuthStr(); }
    else if (currentDepType === "termsOfUse") { tuQuery = name; $("tuSearch").value = name; tuFilter = "all"; openTou(); }
    else if (currentDepType === "authContext") { acQuery = name; $("acSearch").value = name; acFilter = "all"; openAuthCtx(); }
    else if (currentDepType === "namedLocation") { loQuery = name; $("loSearch").value = name; loFilter = "all"; openLocations(); }
  }
  function stripFileData(o) {
    const c = JSON.parse(JSON.stringify(o));
    (c.files || []).forEach(f => { if (f.fileData?.data) f.fileData.data = `(base64 PDF, ${f.fileData.data.length} chars)`; });
    return c;
  }
  function depKv(rows) {
    return `<ul class="dep-kv">${rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join("")}</ul>`;
  }
  function depSettingsHtml(type, o) {
    const rows = [["Name", esc(o.displayName || "")], ["Id", esc(o.id || "")]];
    if (type === "authStrength") rows.push(["Description", esc(o.description || "")], ["Policy type", esc(o.policyType || "")],
      ["Allowed combinations", (o.allowedCombinations || []).map(esc).join("<br>") || "—"]);
    if (type === "termsOfUse") rows.push(
      ["View before accepting required", String(o.isViewingBeforeAcceptanceRequired ?? "—")],
      ["Per-device acceptance", String(o.isPerDeviceAcceptanceRequired ?? "—")],
      ["Re-accept frequency", esc(o.userReacceptRequiredFrequency || "—")],
      ["Expiration", o.termsExpiration ? esc(JSON.stringify(o.termsExpiration)) : "—"],
      ["Files", (o.files || []).map((f, i) => `${esc(f.language || f.fileName || "file")} ${f.fileData?.data ? `<button class="btn" data-toupdf="${i}" style="font-size:11px;padding:2px 8px">Download PDF</button>` : ""}`).join("<br>") || "—"]);
    if (type === "namedLocation") {
      const t = o["@odata.type"] || "";
      if (t.includes("ipNamedLocation")) rows.push(["Type", "IP ranges"], ["Trusted", String(o.isTrusted ?? "—")],
        ["IP ranges", (o.ipRanges || []).map(r => esc(r.cidrAddress || "")).join("<br>") || "—"]);
      else if (t.includes("countryNamedLocation")) rows.push(["Type", "Countries"],
        ["Countries", (o.countriesAndRegions || []).map(esc).join(", ") || "—"],
        ["Include unknown regions", String(o.includeUnknownCountriesAndRegions ?? "—")],
        ["Lookup method", esc(o.countryLookupMethod || "—")]);
    }
    if (type === "authContext") rows.push(["Description", esc(o.description || "")], ["Available", String(o.isAvailable ?? "—")]);
    if (type === "group") rows.push(["Description", esc(o.description || "")], ["Security enabled", String(o.securityEnabled ?? "—")],
      ["Role-assignable", String(o.isAssignableToRole ?? "false")], ["Group types", (o.groupTypes || []).join(", ") || "assigned"],
      ["Membership rule", o.membershipRule ? `<code>${esc(o.membershipRule)}</code>` : "—"],
      ["On-prem synced", String(o.onPremisesSyncEnabled ?? "—")],
      [`Members${o._members ? ` (first ${o._members.items.length}${o._members.count != null ? ` of ${o._members.count}` : ""})` : ""}`,
        o._members
          ? (o._members.items.map(m => `${esc(m.displayName || m.userPrincipalName || m.id)}${m.userPrincipalName ? ` <span class="mini">${esc(m.userPrincipalName)}</span>` : ""}`).join("<br>") || "no members")
          : "—"]);
    return depKv(rows) + `<details class="dep-raw"><summary class="mini">Raw JSON</summary><pre>${esc(JSON.stringify(stripFileData(o), null, 2))}</pre></details>`;
  }
  async function openDepView(type, id, label) {
    currentDepType = type;
    $("depTitle").textContent = `${DEP_TITLES[type] || type} — ${label}`;
    $("depBody").innerHTML = '<p class="mini">Loading settings…</p>';
    const mg = DEP_MANAGE[type];
    $("depManage").style.display = mg ? "" : "none";
    if (mg) $("depManage").textContent = mg.label;
    $("depModal").classList.add("open");
    try {
      const key = type + ":" + id;
      let obj = depCache.get(key);
      if (!obj) {
        obj = isDemo
          ? (DEMO_DATA.depSettings?.[key] || { id, displayName: label, description: "Demo mode — no live settings for this item" })
          : await Graph.gget(DEP_ENDPOINTS[DEP_TYPE_MAP[type]](id), DEP_SCOPES[DEP_TYPE_MAP[type]]);
        // groups: also fetch the first 5 members (+ total count)
        if (type === "group" && !isDemo) {
          try {
            const m = await Graph.gget(`/groups/${id}/members?$top=5&$count=true&$select=displayName,userPrincipalName`);
            obj._members = { count: m["@odata.count"], items: m.value || [] };
          } catch (e) { console.warn("Member fetch failed:", e.message); }
        }
        depCache.set(key, obj);
      }
      currentDepObj = obj;
      $("depBody").innerHTML = depSettingsHtml(type, obj);
    } catch (e) {
      console.error(e);
      $("depBody").innerHTML = `<p class="mini" style="color:var(--off)">Could not load settings: ${esc(e.message || e)}</p>`;
    }
  }
  $("depClose").addEventListener("click", () => $("depModal").classList.remove("open"));
  $("depManage").addEventListener("click", depManageJump);
  $("depModal").addEventListener("click", (e) => {
    if (e.target.id === "depModal") { $("depModal").classList.remove("open"); return; }
    const b = e.target.closest("[data-toupdf]"); if (!b) return;
    const f = currentDepObj?.files?.[+b.dataset.toupdf]; if (!f?.fileData?.data) return;
    const bytes = Uint8Array.from(atob(f.fileData.data), c => c.charCodeAt(0));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = `${(currentDepObj.displayName || "terms-of-use").replace(/[^\w-]+/g, "-")}-${f.language || "file"}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  // detail modal: backdrop closes, dependency chips open settings, Save PNG exports
  $("detailModal").addEventListener("click", (e) => {
    if (e.target.id === "detailModal") { $("detailModal").classList.remove("open"); return; }
    const dl = e.target.closest(".dep-link");
    if (dl) { openDepView(dl.dataset.dept, dl.dataset.depid, dl.dataset.deplabel); return; }
    const b = e.target.closest("[data-png]"); if (!b) return;
    const p = policies.find(x => x.id === b.dataset.png);
    toast(`Exporting <span>${p.seq}.png</span>…`);
    Exporter.policyPng(p, tenantName, tenantLogo).catch(err => { console.error(err); toast("Export failed"); });
  });

  // refresh: re-fetch policies from Entra (keeps current view; analysis becomes stale and is reset)
  $("refreshBtn").addEventListener("click", async () => {
    if (isDemo) { loadDemo(); toast("Demo data <span>reloaded</span>"); return; }
    await loadFromGraph(true);
  });

  // ---------- impact analysis (on demand only) ----------
  $("selActAnalyze").addEventListener("click", () => setView("analyze"));

  $("anRun").addEventListener("click", async () => {
    const scope = $("anScope").value;
    const includeRO = $("anReportOnly").checked;
    const vms = policies.filter(p => p.raw.state === "enabled" || (includeRO && p.raw.state === "enabledForReportingButNotEnforced"));
    if (!vms.length) { $("anStatus").textContent = "No enabled policies to analyse."; return; }
    $("anRun").disabled = true;
    // The full shared busy panel, same as every other long read: spinner,
    // message, wide bar and the current phase — shown in place of the
    // results while the matrix is being built.
    const anProg = makeProgress("an");
    anProg.start(0);
    $("anResults").style.display = "none";
    $("anBusy").style.display = "";
    $("anBusy").innerHTML = anProg.panel(
      "Building the users × policies matrix — fetching users, then expanding every group and role the policies reference. A large tenant takes a few minutes; this keeps running if you switch tabs.",
      "The bar runs during the counted phases: group expansion and role resolution.");
    const anT0 = Date.now();
    const status = (m, done, total) => {
      $("anStatus").textContent = m;
      const t = $("anPgTxt"), bar = $("anPgBar");
      const sec = Math.round((Date.now() - anT0) / 1000);
      const el = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
      if (t) t.textContent = `${m} · ${el}`;
      if (bar && total) bar.style.width = Math.min(100, done / total * 100) + "%";
    };
    try {
      const { lookup, users, scopeGroups, ctx } = isDemo
        ? Analyzer.collectDemo(vms)
        : await Analyzer.collect(vms, scope, status, scope === "named" ? {
            users: anNamed.filter((x) => x.kind === "user"),
            groups: anNamed.filter((x) => x.kind === "group"),
          } : null);
      status(`Evaluating ${users.length} users × ${lookup.length} policies…`);
      await new Promise(r => setTimeout(r, 30)); // let the status paint
      anReport = Analyzer.evaluate(lookup, users, ctx);
      anPols = Analyzer.policyMeta(lookup);
      anMaps = Analyzer.buildMatrixMaps(anReport);
      anGroups = scopeGroups || []; anGroupSel = "";
      // what was scoped has to be as prominent as what was found: a clean
      // result over four people is not a clean result over the tenant
      anScopedTo = scope === "named" && anNamed.length
        ? anNamed.map((x) => `${x.kind === "group" ? "👥" : "👤"} ${x.name}`) : null;
      refreshGroupSelect();
      anFilter = "all"; anQuery = ""; anPage = 0; anType = ""; $("anSearch").value = ""; $("anType").value = "";
      renderAnalysis();
      status(`Done — ${users.length} users, ${lookup.length} policies.`);
    } catch (e) {
      console.error("Analysis failed:", e);
      status("Analysis failed — see browser console.");
    } finally { $("anRun").disabled = false; $("anBusy").style.display = "none"; $("anBusy").innerHTML = ""; }
  });

  function refreshGroupSelect() {
    const sel = $("anGroup");
    sel.innerHTML = '<option value="">All groups</option>' + anGroups.map((g, i) =>
      `<option value="${i}" ${String(i) === anGroupSel ? "selected" : ""}>${(g.category ? g.category + " · " : "")}${g.label} (${g.users.size})</option>`).join("");
  }
  function groupMemberSet() {
    return anGroupSel === "" ? null : anGroups[+anGroupSel]?.users || null;
  }
  function renderAnalysis() {
    if (!anReport) return;
    const s = Analyzer.summary(anReport);
    // What was scanned, said as loudly as what was found. "No risky bypasses"
    // over four named people and over the whole tenant are different answers
    // that otherwise render identically.
    const sb = $("anScopeBanner");
    if (sb) {
      sb.style.display = anScopedTo ? "" : "none";
      sb.innerHTML = anScopedTo
        ? `<b>Scoped run</b> — these findings cover ${anReport.length} user${anReport.length === 1 ? "" : "s"} from ${anScopedTo.length} named principal${anScopedTo.length === 1 ? "" : "s"} only, not the tenant: ${anScopedTo.map(esc).join(" · ")}`
        : "";
    }
    $("anCards").innerHTML = [
      ["all", s.users, "Users", ""],
      ["risky", s.risky, "Risky bypasses", "risk"],
      ["nomfa", s.noMfa, "No MFA from CA", "gap"],
      ["noenforce", s.noEnforce, "No enforcing policy", "gap"],
    ].map(([f, n, l, cls]) => `<div class="an-card ${cls} ${anFilter === f ? "active" : ""}" data-f="${f}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    $("anUsersWrap").style.display = anTab === "users" ? "block" : "none";
    $("anMatrixWrap").style.display = anTab === "matrix" ? "block" : "none";
    $("anFull").style.display = anTab === "matrix" ? "" : "none";
    $("anTabUsers").classList.toggle("active", anTab === "users");
    $("anTabMatrix").classList.toggle("active", anTab === "matrix");
    if (anTab === "users") {
      $("anBody").innerHTML = Analyzer.userRows(anReport, anFilter, anQuery, groupMemberSet(), anType);
    } else {
      const rows = Analyzer.filterRows(anReport, anFilter, anQuery, groupMemberSet(), anType);
      // Only show policy columns that are actually in scope of the visible users
      // — a policy no shown user is targeted by (all "·" not-in-scope) is just
      // empty noise, especially when a group or user filter is applied.
      const scoped = anPols.filter(p => rows.some(i => anMaps[i] && anMaps[i].m[p.name]));
      const cols = scoped.length ? scoped : anPols;
      const m = Analyzer.matrixTable(anReport, anMaps, cols, rows, anPage, AN_PAGE_SIZE);
      anPage = m.page;
      $("anMHead").innerHTML = m.head;
      $("anMBody").innerHTML = m.body;
      $("anMPage").textContent = `Page ${m.page + 1} / ${m.pages}`;
      $("anMScope").textContent = cols.length < anPols.length
        ? `Showing ${cols.length} of ${anPols.length} policies — only those in scope of the ${anGroupSel !== "" ? "selected group" : "shown users"}.`
        : "";
    }
    // export button reflects the current filter scope
    const n = Analyzer.filterRows(anReport, anFilter, anQuery, groupMemberSet(), anType).length;
    $("anExport").textContent = n === anReport.length
      ? "Export HTML report"
      : `Export HTML report (${n} of ${anReport.length} users)`;
    $("anResults").style.display = "block";
  }

  $("anCards").addEventListener("click", (e) => {
    const c = e.target.closest("[data-f]"); if (!c) return;
    anFilter = c.dataset.f; renderAnalysis();
  });
  $("anSearch").addEventListener("input", (e) => { anQuery = e.target.value.toLowerCase(); anPage = 0; renderAnalysis(); });
  $("anTabUsers").addEventListener("click", () => { anTab = "users"; if (!anReport) { $("anStatus").textContent = "Run the analysis first."; return; } renderAnalysis(); });
  $("anTabMatrix").addEventListener("click", () => { anTab = "matrix"; if (!anReport) { $("anStatus").textContent = "Run the analysis first."; return; } renderAnalysis(); });
  $("anMPrev").addEventListener("click", () => { anPage--; renderAnalysis(); });
  $("anMNext").addEventListener("click", () => { anPage++; renderAnalysis(); });
  $("anGroup").addEventListener("change", (e) => { anGroupSel = e.target.value; anPage = 0; renderAnalysis(); });
  // ---- R29: scan only who you asked about --------------------------------
  function anRenderPicks() {
    $("anNamedPicks").innerHTML = anNamed.map((x, i) =>
      `<span class="an-pick">${x.kind === "group" ? "👥" : "👤"} ${esc(x.name)}<button data-anpick="${i}" title="Remove">×</button></span>`).join("");
    const run = $("anRun");
    if (run) run.disabled = $("anScope").value === "named" && !anNamed.length;
    const hint = $("anNamedHint");
    if (hint) {
      hint.textContent = anNamed.length
        ? "A group is expanded to its members, nested groups included — the scan judges people, not groups."
        : "Name at least one user or group. Nothing is read tenant-wide in this mode.";
    }
  }
  $("anScope").addEventListener("change", (e) => {
    $("anNamed").style.display = e.target.value === "named" ? "" : "none";
    anRenderPicks();
  });
  let anNamedTimer = null;
  $("anNamedSearch").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    clearTimeout(anNamedTimer);
    if (v.length < 2 || isDemo) return;
    anNamedTimer = setTimeout(async () => {
      try {
        const f = v.replace(/'/g, "''");
        const [u, g] = await Promise.all([
          Graph.gget(`/users?$filter=startswith(displayName,'${f}') or startswith(userPrincipalName,'${f}')&$select=id,displayName,userPrincipalName&$top=7`).catch(() => null),
          Graph.gget(`/groups?$filter=startswith(displayName,'${f}')&$select=id,displayName&$top=7`).catch(() => null),
        ]);
        anNamedMap = new Map();
        const rows = [];
        ((u && u.value) || []).forEach((x) => {
          const label = x.userPrincipalName || x.displayName;
          anNamedMap.set(label.toLowerCase(), { kind: "user", id: x.id, name: x.displayName || label });
          rows.push(`<option value="${esc(label)}" label="👤 ${esc(x.displayName || "")}"></option>`);
        });
        ((g && g.value) || []).forEach((x) => {
          anNamedMap.set((x.displayName || "").toLowerCase(), { kind: "group", id: x.id, name: x.displayName });
          rows.push(`<option value="${esc(x.displayName || "")}" label="👥 group"></option>`);
        });
        $("anNamedList").innerHTML = rows.join("");
      } catch (err) { console.warn("gap analyse: pick suggest failed", err.message); }
    }, 250);
  });
  function anAddPick() {
    const v = $("anNamedSearch").value.trim();
    if (!v) return;
    const hit = anNamedMap.get(v.toLowerCase());
    if (!hit) { toast("Pick a <span>user or group</span> from the list"); return; }
    if (anNamed.some((x) => x.id === hit.id)) { toast("Already in the list"); return; }
    anNamed.push(hit);
    $("anNamedSearch").value = "";
    anRenderPicks();
  }
  $("anNamedAdd").addEventListener("click", anAddPick);
  $("anNamedSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); anAddPick(); } });
  $("anNamedPicks").addEventListener("click", (e) => {
    const b = e.target.closest("[data-anpick]");
    if (!b) return;
    anNamed.splice(+b.dataset.anpick, 1);
    anRenderPicks();
  });
  $("anType").addEventListener("change", (e) => { anType = e.target.value; anPage = 0; renderAnalysis(); });
  $("anGroupAdd").addEventListener("click", async () => {
    const val = $("anGroupInput").value.trim(); if (!val || !anReport) return;
    $("anGroupAdd").disabled = true;
    try {
      let g = null;
      if (isDemo) {
        const ids = DEMO_DATA.scopeGroups?.[val];
        g = ids ? { label: val, category: "Custom", users: new Set(ids) } : null;
      } else {
        g = await Analyzer.resolveGroup(val);
        if (g) g.category = "Custom";
      }
      if (!g) { toast("Group <span>not found</span>"); return; }
      if (!anGroups.some(x => x.label === g.label)) anGroups.push(g);
      anGroupSel = String(anGroups.findIndex(x => x.label === g.label));
      $("anGroupInput").value = "";
      refreshGroupSelect(); anPage = 0; renderAnalysis();
      toast(`Group <span>${g.label}</span> added (${g.users.size} members)`);
    } finally { $("anGroupAdd").disabled = false; }
  });
  // policy names in analysis (detail lists + matrix column headers) open the policy card
  function openPolicyByName(name) {
    const p = policies.find(x => x.name === name);
    if (p) showDetail(p.id);
  }

  $("anBody").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link");
    if (pl) { openPolicyByName(pl.dataset.pol); return; }
    const tr = e.target.closest(".urow"); if (!tr) return;
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("detail")) { next.remove(); tr.classList.remove("open"); return; }
    tr.insertAdjacentHTML("afterend", Analyzer.userDetail(anReport[+tr.dataset.user]));
    tr.classList.add("open");
  });
  $("anMHead").addEventListener("click", (e) => {
    const pl = e.target.closest(".pol-link");
    if (pl) openPolicyByName(pl.dataset.pol);
  });

  $("anExport").addEventListener("click", () => {
    if (!anReport) return;
    // export exactly what is currently filtered (cards filter + search + group)
    const rowsIdx = Analyzer.filterRows(anReport, anFilter, anQuery, groupMemberSet(), anType);
    if (!rowsIdx.length) { toast("Nothing to export — current filter matches <span>0 users</span>"); return; }
    const subset = rowsIdx.map(i => anReport[i]);
    const filterBits = [];
    if (anType) filterBits.push(anType === "member" ? "members only" : "guests only");
    if (anGroupSel !== "") filterBits.push("group: " + (anGroups[+anGroupSel]?.label || ""));
    if (anFilter !== "all") filterBits.push({ risky: "risky bypasses only", nomfa: "no MFA from CA", noenforce: "no enforcing policy" }[anFilter]);
    if (anQuery) filterBits.push(`search: "${anQuery}"`);
    const meta = {
      tenant: tenantName || "tenant",
      date: new Date().toISOString().slice(0, 10),
      policies: anPols.length,
      scope: (anScopedTo ? `only ${anScopedTo.join(", ")}` : `${$("anScope").value} users`)
        + ($("anReportOnly").checked ? ", incl. report-only" : "")
        + (filterBits.length ? ` | filtered: ${filterBits.join(", ")} (${subset.length} of ${anReport.length} users)` : ""),
    };
    const html = Analyzer.exportHtml(meta, subset, anPols, anGroups);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `CA-Impact-${meta.tenant.replace(/[^\w-]+/g, "-")}-${meta.date}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("HTML report <span>downloaded</span> — single file, safe to share");
  });

  // export modal (Document) / JSON zip (Backup) / wizard (Assign) / state modal (Set Policy state)
  function runToolMode(mode) {
    return mode === "backup" ? runBackup()
      : mode === "assign" ? openAssign()
      : mode === "state" ? openStateModal()
      : openExport();
  }
  // The selection bar is the only place these are offered — the toolbar used to
  // duplicate Documentation and Gap analyse, which said the same thing twice.
  SEL_ACTIONS.forEach(([id, mode]) => $(id).addEventListener("click", () => {
    setToolMode(mode);
    runToolMode(mode);
  }));
  // Delete is not a tool mode — it has no "browse then act" phase, so it never
  // takes the highlight and always opens its own confirmation.
  $("selActDelete").addEventListener("click", openDeleteModal);

  // expand/collapse all persona sections (cards + list views)
  function syncCollapseAllBtn() {
    const keys = [...new Set(visible().map(p => String(Render.caGroup(p.name).key)))];
    const allCollapsed = keys.length > 0 && keys.every(k => collapsedGroups.has(k));
    $("collapseAllBtn").textContent = allCollapsed ? "⊞ Expand all" : "⊟ Collapse all";
    $("collapseAllBtn").style.display = (viewMode === "cards" || viewMode === "list") ? "inline-flex" : "none";
  }
  $("collapseAllBtn").addEventListener("click", () => {
    const keys = [...new Set(visible().map(p => String(Render.caGroup(p.name).key)))];
    const allCollapsed = keys.length > 0 && keys.every(k => collapsedGroups.has(k));
    allCollapsed ? keys.forEach(k => collapsedGroups.delete(k)) : keys.forEach(k => collapsedGroups.add(k));
    refreshViews();
  });
  ["png", "pdf", "docx", "zip", "md", "json"].forEach(f => $("expOpt" + f[0].toUpperCase() + f.slice(1)).addEventListener("click", () => { fmt = f; syncFmt(); }));
  $("expCancel").addEventListener("click", () => $("exportModal").classList.remove("open"));
  $("expGo").addEventListener("click", doExport);

  // ---------- boot ----------
  // Keep the user informed during a throttle back-off instead of looking hung.
  buildToolNav();
  Graph.setThrottleHandler((ms) => toast(`Microsoft Graph is throttling — waiting <span>${Math.ceil(ms / 1000)}s</span> then continuing…`));
  // The version badge is on the home tile; it belongs on the tool's own header
  // too, which is where somebody actually is when they wonder what changed.
  // Heads are re-rendered by their tools, so observe rather than stamp once.
  const HEAD_TOOL = {
    mlHead: "toolMsLearn", exHead: "toolExclusions", cgHead: "toolCaGroups", prHead: "toolProtect",
    blHead: "toolBaseline", gcHead: "toolGapCheck", vaHead: "toolValidator", wiHead: "toolWhatIf",
    guHead: "toolGroupUse", cuHead: "toolCompare", loHead: "toolLocations", auHead: "toolAudit",
    siHead: "toolSignins", ciHead: "toolCis", acHead: "toolAuthCtx", asHead: "toolAuthStr",
    rcHead: "toolRecycle", tuHead: "toolTou", riHead: "toolImpact", ruHead: "toolRmau",
    drHead: "toolDrift", ugHead: "toolGuide", dvHead: "toolDevCheck",
  };
  function stampHeadVersion(el, toolId) {
    const t = (typeof TOOL_VERSIONS !== "undefined" && TOOL_VERSIONS[toolId]) || null;
    if (!t || !t.v) return;
    const h = el.querySelector("h3, h4");
    if (!h || h.querySelector(".tool-ver-head")) return;   // also stops the observer looping
    const s = document.createElement("span");
    s.className = "tool-ver-head";
    s.textContent = "v" + t.v;
    if (t.note) s.title = t.note;
    h.appendChild(s);
  }
  Object.entries(HEAD_TOOL).forEach(([id, toolId]) => {
    const el = $(id); if (!el) return;
    stampHeadVersion(el, toolId);
    new MutationObserver(() => stampHeadVersion(el, toolId)).observe(el, { childList: true, subtree: true });
  });

  Graph.init().then((resumed) => {
    if (new URLSearchParams(location.search).get("demo")) { loadDemo(); return; }
    // Came back from a redirect sign-in: carry straight on rather than showing
    // the sign-in screen to somebody who has just signed in.
    if (resumed) { loadFromGraph(); return; }
    const err = Graph.takeRedirectError && Graph.takeRedirectError();
    if (err) showSignInError(err);
    else if (Graph.authMode && Graph.authMode() === "redirect") markRedirectMode();
  }).catch(e => console.error("MSAL init failed", e));
})();
