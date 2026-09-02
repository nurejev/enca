// ======================================================================
// Baseline Policies — match the tenant's Conditional Access policies
// against the CloudFellows baseline catalog (js/baselineData.js).
//
// Matching is by CA number, which is the stable identity in the naming
// convention: the (NEW)/(UP) staging prefixes, the persona label and the
// descriptive middle of a policy name all change between releases, the
// number does not. Versions are compared numerically per segment, so
// v1.0.10 correctly sorts above v1.0.9.
//
// Every policy lands in exactly one bucket:
//   ok        present, version matches the baseline
//   outdated  present, but the tenant runs an older version
//   ahead     present, but the tenant runs a newer version than the catalog
//   unversioned present, but one side carries no version to compare
//   missing   in the baseline, not in the tenant
//   conflict  the CA number matches but the name contradicts it — a number
//             clash between two baselines, not a deployed policy
//   extra     numbered policy in the tenant that the baseline does not define
// ======================================================================
const Baseline = (() => {
  // ====================================================================
  // R36 — ONE BASELINE, EVERY TOOL. Two catalogs, one of them ACTIVE, and
  // the active one is what ① Check, ② Create, ⑥ Protect, ＋ Bulk add, the
  // persona vaults, the exclusion-restore action and 📖 the guide all work
  // against. Before this, every one of those stopped at the CloudFellows
  // catalog whatever the Baseline tool was showing.
  //
  // Each catalog answers the same questions through the same names — the
  // CONTRACT — so a consumer never asks "which baseline is this" and then
  // branches. The CloudFellows contract is assembled here from the modules
  // that always held it (GROUP_TEMPLATES, Rmau's persona units, Assign's
  // convention); Joey's is written on his catalog in js/baselineJoeyData.js,
  // and the live-fetched copy of it (js/baselineLive.js) inherits it.
  //
  //   personas            [{ code, label, caRange, name?, description? }] — the vaults
  //   auName(code)        the restricted unit for a persona
  //   codeForGroup(name)  group name → persona code, or null (NEVER a guess)
  //   personaOfPolicy(n)  policy name → persona code
  //   exclusionGroupFor(policyName) → { name, source: catalog|derived } | null
  //   isExclusionGroup(name)
  //   templates()         the groups the baseline expects, creatable
  //   personaGroups       [{ key, label, group }] for pick-by-persona
  //   predefined          group names worth resolving up front
  //   groupPrefixes       bounded startswith() scans
  //   groupFilterPrefix   the one prefix the guide reads
  //   defaultAuName       the fallback unit ⑥ Protect offers
  //   breakGlassGroup
  //
  // WHICH ONE IS ACTIVE is a per-tenant choice, kept with the tenant like
  // the R28 mapping (localStorage under the tenant id) — a baseline is a
  // property of the deployment, not of the browser. It defaults to
  // CloudFellows, which is what every tool did before, so nothing changes
  // for a tenant that never chooses. Choosing is an explicit button in the
  // Baseline tool, never a side effect of looking at a comparison: looking
  // at Joey's table must not change where a WRITE puts a group.
  // ====================================================================
  const ACTIVE_KEY = (tid) => `enca-baseline:${tid || "unknown"}`;
  const DEFAULT_ID = "limonit";
  let tenantId = null;
  let activeId = null;   // resolved lazily from storage on first ask

  // Catalogs the tool can compare against. BASELINE is the CloudFellows one
  // (bundled from its documentation); BASELINE_JOEY is the community baseline
  // by Joey Verlinden — the bundled snapshot, or the live read of his
  // repository when this session has one (BaselineLive says which).
  function catalogs() {
    const out = [];
    if (typeof BASELINE !== "undefined") out.push(cloudFellows());
    if (typeof BASELINE_JOEY !== "undefined") {
      const live = typeof BaselineLive !== "undefined" ? BaselineLive.catalog() : null;
      out.push(live || BASELINE_JOEY);
    }
    return out;
  }
  const catalog = (id) => catalogs().find((c) => c.id === id) || catalogs()[0];

  // The CloudFellows catalog with its contract. Assembled per call — cheap,
  // and it means the modules it leans on are read at call time rather than
  // at load time, so script order in index.html stops mattering here.
  const CF_CONV_RE = /^CAB-SEC-U-CA(\d+)-Exclusion$/i;
  const CF_PERSONA_GROUPS = [
    { key: "global", label: "🌐 Global", group: null },  // no single persona group; global policies use All-users − exclusions
    { key: "admins", label: "🛡 Admins", group: "CAB-SEC-U-Persona-Admins" },
    { key: "internals", label: "👤 Internals", group: "CAB-SEC-U-Persona-Internals" },
    { key: "externals", label: "🤝 Externals", group: "CAB-SEC-U-Persona-Externals" },
    { key: "guestusers", label: "👥 Guest users", group: "CAB-SEC-U-Persona-GuestUsers" },
    { key: "guestadmins", label: "🔑 Guest admins", group: "CAB-SEC-U-Persona-GuestAdmins" },
    { key: "serviceaccounts", label: "⚙ M365 service accounts", group: "CAB-SEC-U-Persona-Microsoft365ServiceAccounts" },
    { key: "devops", label: "🧰 DevOps", group: "CAB-SEC-U-Persona-DevOps" },
    { key: "breakglass", label: "🚨 Break-glass", group: "CAB-SEC-U-BreakGlass" },
  ];
  const CF_PREDEFINED = [
    // deploy / test
    "CAD-SEC-U-DG-GLO", "CAD-SEC-U-DG-ADM", "CAD-SEC-U-DG-INT", "CAD-SEC-U-DG-EXT",
    "CAD-SEC-U-DG-GUESTUSERS", "CAD-SEC-U-DG-GUESTAdmins", "CAD-SEC-U-DG-SA",
    "CAD-SEC-U-DG-DevOps", "CAD-SEC-U-DG-FW",
    // production
    "CAB-SEC-U-BreakGlass", "Emergency_Access1", "Emergency_Access2",
    "CAB-SEC-U-Persona-Admins", "CAB-SEC-U-Persona-GuestAdmins", "CAB-SEC-U-Persona-Guests",
    "CAB-SEC-U-Persona-Internals", "CAB-SEC-U-Persona-Externals",
    "CAB-SEC-U-Persona-Microsoft365ServiceAccounts", "CAB-SEC-U-Persona-DevOps",
  ];
  function cloudFellows() {
    const R = typeof Rmau !== "undefined" ? Rmau : null;
    const personas = R && R.CLOUDFELLOWS_AUS ? R.CLOUDFELLOWS_AUS : [];
    const cat = {
      // The id stays `limonit` on purpose. It is what saved state and Drift
      // watch snapshots key on, so renaming it would orphan every stored
      // comparison taken before the baseline was renamed to CloudFellows.
      // Display name everywhere, identifiers nowhere.
      id: "limonit", label: "CloudFellows", icon: "🧬", source: "bundled",
      // `revised` marks a re-cut of the same release (documented fixes folded
      // back in) — worth showing, because a tenant on the older patch versions
      // is not out of release, only out of revision.
      release: BASELINE.release, line: BASELINE.line, author: "CloudFellows",
      released: BASELINE.revised || null,
      url: null, policies: BASELINE.policies,
      breakGlassGroup: "CAB-SEC-U-BreakGlass",
      groupPrefixes: ["CAB-SEC", "CAD-SEC"],
      groupFilterPrefix: "CAB-SEC-",
      defaultAuName: "CAB-SEC-RMAU-CA-Exclusions",
      personas,
      personaGroups: CF_PERSONA_GROUPS,
      predefined: CF_PREDEFINED,
      auName: (code) => { const e = personas.find((a) => a.code === code); return (e && e.name) || `CAB-SEC-RMAU-${code}-Exclusions`; },
      codeForGroup: (name) => (R && R.conventionCode ? R.conventionCode(name) : null),
      personaOfPolicy: (name) => (R && R.conventionCode ? R.conventionCode(name) : null),
      isExclusionGroup: (name) => CF_CONV_RE.test(String(name || "").trim()),
      // The CA token as the policy NAME spells it, leading zeros intact: CA006
      // and CA1009 are both real, and the group name has to match the tenant's
      // spelling character for character or the lookup finds nothing.
      //   catalog — the baseline itself names one for this CA number. Definitive.
      //   derived — the policy carries a CA number the catalog does not have (a
      //             tenant's own numbering), so the convention is applied by
      //             pattern. Offered, but labelled: it is an inference.
      // null means there is nothing to restore, which is the right answer for a
      // policy with no CA number AND for a catalog policy that legitimately has
      // no exclusion group of its own — 14 of the 99 do not.
      exclusionGroupFor: (policyName) => {
        const m = String(policyName || "").match(/\bCA(\d{3,4})\b/);
        if (!m) return null;
        const p = BASELINE.policies.find((x) => x.num === parseInt(m[1], 10));
        if (p) {
          const hit = (p.exclude || []).map((x) => String(x).replace(/\s*\(group\)$/, "")).find((x) => CF_CONV_RE.test(x));
          return hit ? { name: hit, source: "catalog" } : null;
        }
        return { name: `CAB-SEC-U-CA${m[1]}-Exclusion`, source: "derived" };
      },
      templates: () => (typeof GROUP_TEMPLATES !== "undefined" ? GROUP_TEMPLATES : []),
    };
    return cat;
  }

  // Joey's contract functions take the catalog first (so the live copy shares
  // them); the consumer-facing shape is the same as CloudFellows'. This wraps
  // whichever catalog is handed in so callers never see the difference.
  function withContract(cat) {
    if (!cat) return null;
    if (cat.id === "limonit") return cat;
    const J = cat;
    return {
      ...cat,
      auName: (code) => J.auName(J, code),
      codeForGroup: (name) => J.codeForGroup(J, name),
      personaOfPolicy: (name) => J.personaOfPolicy(J, name),
      exclusionGroupFor: (name) => J.exclusionGroupFor(J, name),
      isExclusionGroup: (name) => J.isExclusionGroup(name),
      templates: () => J.templates(J),
    };
  }

  // ---- which baseline is active ------------------------------------------
  function use(tid) {
    const id = String(tid || "");
    if (tenantId === id) return;
    tenantId = id;
    activeId = null;
  }
  function readActive() {
    try {
      const v = localStorage.getItem(ACTIVE_KEY(tenantId));
      return v && catalogs().some((c) => c.id === v) ? v : DEFAULT_ID;
    } catch { return DEFAULT_ID; }
  }
  function activeCatalogId() {
    if (activeId == null) activeId = readActive();
    return activeId;
  }
  // The active catalog WITH its contract. Every downstream consumer goes
  // through here and nowhere else.
  const active = () => withContract(catalog(activeCatalogId()));
  const isActive = (id) => activeCatalogId() === id;
  // Returns true when it changed. Fires "enca:baseline" so the screens that
  // cache a scan against the old baseline can throw it away.
  function setActive(id) {
    if (!catalogs().some((c) => c.id === id)) return false;
    if (activeCatalogId() === id) return false;
    activeId = id;
    try { localStorage.setItem(ACTIVE_KEY(tenantId), id); } catch { /* session only */ }
    // R28's mapping is per tenant AND per baseline (the persona codes differ),
    // so it has to re-read for the new one.
    try { if (typeof CaMap !== "undefined" && CaMap.rebind) CaMap.rebind(); } catch { /* not loaded */ }
    try { document.dispatchEvent(new CustomEvent("enca:baseline", { detail: { id } })); } catch { /* no DOM */ }
    return true;
  }
  // A short line for the tools that act on the active baseline, so no screen
  // ever leaves "which baseline?" to be inferred. `switchAttr` is the data
  // attribute the host page listens on to open the Baseline tool.
  function activeLine() {
    const c = active();
    if (!c) return "";
    const src = c.id === "joey" && typeof BaselineLive !== "undefined"
      ? (c.source === "live" ? `live from the repository, release ${c.release}${c.commit ? ` at ${String(c.commit).slice(0, 7)}` : ""}` : `bundled snapshot ${c.release}`)
      : `${c.release}${c.line ? ` (${c.line})` : ""}`;
    return `${c.icon || "🧬"} ${c.label} — ${src}`;
  }
  function activeChip() {
    const c = active();
    if (!c) return "";
    return `<span class="bl-active mini" title="The baseline every group check, group creation, persona vault and exclusion-restore action works against for this tenant. Change it in the Baseline tool.">Working against <b>${esc(activeLine())}</b> · <a href="#" data-open-baseline="${esc(c.id)}">change</a></span>`;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---- corroboration ----------------------------------------------------
  // The CA number alone is only a reliable identity WITHIN one baseline. Across
  // baselines the numbering diverges (Joey's CA501 is an agent policy; the
  // CloudFellows CA501 is a guest-admin policy), so a number match must be backed
  // by the name: the persona segment must not contradict, and the descriptive
  // tokens must overlap. Otherwise the row is a number clash, not a match.
  const PERSONA_KEYS = [
    // most specific first — "g_admin" must win over "admin"
    ["eadmin", /\b(e[-_ ]?admins?|emergency[_ ]?access|breakglass|break[-_ ]glass)\b/i],
    ["guestadmin", /\b(g[-_ ]?admins?|guest ?admins?|guestadmins)\b/i],
    ["guest", /\b(guests?|guestusers?|externals?)\b/i],
    ["agent", /\b(agents?|agentid|workloadids?|workload ?identit(y|ies))\b/i],
    ["serviceaccount", /\b(serviceaccounts?|svc|msa|sa)\b/i],
    ["devops", /\b(devops)\b/i],
    ["admin", /\b(admins?)\b/i],
    ["internal", /\b(internals?|employees?)\b/i],
    ["global", /\b(global)\b/i],
  ];
  function personaKey(name) {
    const n = String(name || "").replace(/[-_]/g, " ");
    for (const [key, re] of PERSONA_KEYS) if (re.test(n)) return key;
    return null;
  }

  // words that appear in nearly every policy name and so carry no signal
  const STOP = new Set(["ca", "v", "new", "up", "the", "and", "or", "for", "to", "of", "a",
    "anyapp", "anyapps", "allapps", "anyplatform", "allplatforms", "policy", "access"]);
  function tokens(name) {
    return new Set(String(name || "").toLowerCase()
      .replace(/\bca\d{3,4}\b/g, " ")           // the number is compared separately
      .replace(/\bv?\d+(\.\d+)*\b/g, " ")       // versions
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)));
  }
  // overlap relative to the smaller set — a long tenant name should not be
  // penalised for carrying extra descriptive words
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const t of A) if (B.has(t)) hit++;
    return hit / Math.min(A.size, B.size);
  }

  const MIN_SIMILARITY = 0.25;

  // Does the tenant policy plausibly correspond to this baseline policy?
  // Returns null when it does, or a reason string when it clearly does not.
  function mismatchReason(baselineName, tenantName) {
    const bp = personaKey(baselineName), tp = personaKey(tenantName);
    if (bp && tp && bp !== tp) return `different persona — the baseline policy is ${bp}, this one is ${tp}`;
    const sim = similarity(baselineName, tenantName);
    if (sim < MIN_SIMILARITY) return `the names have almost nothing in common (${Math.round(sim * 100)}% overlap)`;
    return null;
  }

  const STATUS = {
    ok: { icon: "✓", label: "Up to date", cls: "ok", order: 3 },
    outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1 },
    ahead: { icon: "⬇", label: "Newer than baseline", cls: "info", order: 4 },
    present: { icon: "✓", label: "Present", cls: "ok", order: 2 },
    unversioned: { icon: "?", label: "Version unknown", cls: "info", order: 5 },
    missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
    conflict: { icon: "⚠", label: "Number clash", cls: "warn", order: 0.5 },
    extra: { icon: "＋", label: "Not in baseline", cls: "info", order: 6 },
  };

  const caNum = (name) => { const m = /CA(\d{3,4})/i.exec(name || ""); return m ? +m[1] : null; };
  const version = (name) => { const m = /v\s?(\d+\.\d+(?:\.\d+)?)\s*$/i.exec((name || "").trim()); return m ? m[1] : null; };

  // -1 a<b, 0 equal, 1 a>b — segment-wise, so 1.0.10 > 1.0.9
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  // Render.caGroup matches CA followed by 3-4 digits, so the number has to be
  // zero-padded first — CA1 would otherwise fall through as "unnumbered".
  const caLabel = (num) => `CA${String(num).padStart(3, "0")}`;
  // A catalog policy may carry its own persona label (Joey's ranges differ from
  // the CloudFellows ones — his CA300 block is service accounts, not externals).
  const personaOf = (num, pol) => {
    if (pol && pol.persona) return pol.persona;
    try { return Render.caGroup(caLabel(num)).label; } catch { return "Other"; }
  };

  // ---- compare tenant policies against the catalog ----
  // vms: the app's view models ({ id, name, state, raw }).
  function compare(vms, catId) {
    const cat = catalog(catId);
    const byNum = new Map();
    for (const p of vms) {
      const n = caNum(p.name);
      if (n == null) continue;
      // duplicate CA numbers in a tenant are real (a leftover copy) — keep both
      if (!byNum.has(n)) byNum.set(n, []);
      byNum.get(n).push(p);
    }

    const rows = [];
    for (const b of cat.policies) {
      const hits = byNum.get(b.num) || [];
      if (!hits.length) {
        rows.push({ num: b.num, baseline: b, tenant: null, status: "missing" });
        continue;
      }
      // when a number appears twice, judge on the best (newest) match
      const scored = hits.map((p) => {
        const tv = version(p.name);
        let status;
        // a number match that the name contradicts is a clash, not a match
        const why = mismatchReason(b.name, p.name);
        if (why) return { p, tv, status: "conflict", why };
        if (tv && b.version) {
          const c = cmpVersion(tv, b.version);
          status = c === 0 ? "ok" : c < 0 ? "outdated" : "ahead";
        } else if (!b.version) {
          // this baseline does not version its policy names — being there is
          // the whole test, so do not report it as "version unknown"
          status = "present";
        } else {
          status = "unversioned";
        }
        return { p, tv, status };
      }).sort((a, b2) => STATUS[b2.status].order - STATUS[a.status].order);
      const best = scored[0];
      // every candidate contradicted the baseline → the policy is really absent
      rows.push({
        num: b.num, baseline: b, tenant: best.p, tenantVersion: best.tv,
        status: best.status, why: best.why || null,
        duplicates: hits.length > 1 ? hits.length : 0,
      });
      byNum.delete(b.num);
    }
    // numbered policies the baseline does not define
    for (const [num, hits] of byNum) {
      rows.push({ num, baseline: null, tenant: hits[0], tenantVersion: version(hits[0].name), status: "extra", duplicates: hits.length > 1 ? hits.length : 0 });
    }
    rows.sort((a, b) => a.num - b.num);

    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const covered = rows.filter((r) => r.baseline && r.tenant && r.status !== "conflict").length;
    return {
      rows, counts,
      catalog: cat,
      baselineTotal: cat.policies.length,
      covered,
      coverage: cat.policies.length ? Math.round((covered / cat.policies.length) * 100) : 0,
      // what an import would actually bring in
      toImport: rows.filter((r) => ["missing", "outdated", "conflict"].includes(r.status)),
    };
  }

  // ---- rendering ----
  function renderSummary(res) {
    const chip = (k) => res.counts[k] ? `<span class="bl-chip ${STATUS[k].cls}">${STATUS[k].icon} ${res.counts[k]} ${esc(STATUS[k].label.toLowerCase())}</span>` : "";
    const order = ["missing", "conflict", "outdated", "ok", "present", "ahead", "unversioned", "extra"];
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>${esc(res.catalog.icon || "🧬")} ${esc(res.catalog.label)} baseline — ${esc(res.catalog.release)}${res.catalog.line ? ` (${esc(res.catalog.line)})` : ""}${!res.catalog.url && res.catalog.released ? ` <span class="mini muted">rev ${esc(res.catalog.released)}</span>` : ""}</h3>
        <p style="margin-bottom:10px">Your tenant matched against the ${esc(res.catalog.author || res.catalog.label)} Conditional Access baseline, policy by policy on the CA number.
          ${res.catalog.url ? `Source: <a href="${esc(res.catalog.url)}" target="_blank" rel="noopener noreferrer">${esc(res.catalog.url)}</a>${res.catalog.released ? ` · released ${esc(res.catalog.released)}` : ""}. ` : ""}
          ${res.catalog.importerUrl ? `Deploy it with the author's importer at <a href="${esc(res.catalog.importerUrl)}" target="_blank" rel="noopener noreferrer">${esc(res.catalog.importerUrl)}</a>. ` : ""}
          Version differences are compared per segment, so an older deployment shows as <b>outdated</b> rather than present.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${order.map(chip).join("")}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${res.coverage}%<span class="mini" style="font-weight:400"> coverage</span></div>
        <div class="mini">${res.covered} of ${res.baselineTotal} baseline policies present</div>
        <div class="mini">${res.toImport.length} would be imported or updated</div>
        ${res.catalog.note ? `<div class="mini" style="max-width:280px;margin-top:6px">${esc(res.catalog.note)}</div>` : ""}
      </div>
    </div>
    ${sourcePanel(res.catalog)}
    ${activePanel(res.catalog)}`;
  }

  // R36 — where this catalog came from, said outright. Only Joey's catalog
  // has two possible sources; the CloudFellows one is always the bundled
  // transcription and says nothing here.
  function sourcePanel(cat) {
    if (!cat || cat.id !== "joey" || typeof BaselineLive === "undefined") return "";
    const st = BaselineLive.status();
    const line = BaselineLive.sourceLine(cat);
    const busy = st.status === "fetching";
    const extra = [];
    if (cat.source === "live" && (cat.dups || []).length) extra.push(`⚠ ${cat.dups.length === 1 ? "One CA number is" : `${cat.dups.length} CA numbers are`} used by more than one file in the repository at this release (${cat.dups.join(", ")}) — both are listed, and both exclusion groups are expected, because that is what the repository ships.`);
    if (cat.source === "live" && (cat.skipped || []).length) extra.push(`${cat.skipped.length} file${cat.skipped.length === 1 ? " was" : "s were"} skipped as not a policy: ${cat.skipped.slice(0, 3).join("; ")}${cat.skipped.length > 3 ? "; …" : ""}`);
    if (cat.source === "live" && st.error) extra.push(`The last refresh failed (${st.error}) — this is the read that succeeded earlier in the session.`);
    return `<div class="bl-source ${cat.source === "live" ? "live" : "bundled"}">
      <span class="mini"><b>${cat.source === "live" ? "📡" : "📦"} ${esc(line)}</b>${cat.source === "live" && cat.liveUrl ? ` · <a href="${esc(cat.liveUrl)}" target="_blank" rel="noopener noreferrer">release notes</a>` : ""}</span>
      <button class="btn sm" data-bl-fetch="1"${busy ? " disabled" : ""}>${busy ? "⟳ Reading…" : cat.source === "live" ? "⟳ Read again" : "📡 Read the latest release"}</button>
      ${extra.map((t) => `<div class="mini muted" style="flex-basis:100%">${esc(t)}</div>`).join("")}
      <div class="mini muted" style="flex-basis:100%">The repository is read over GitHub's public API (unauthenticated, rate-limited) and every file is checked before it is believed; a read that fails leaves the bundled snapshot in place and says so here. Nothing from the repository is executed.</div>
    </div>`;
  }

  // R36 — is THIS the baseline the rest of the app works against? Viewing a
  // comparison never changes that; the button does — and the button first
  // shows what the switch would change (previewSwitch) before offering it.
  function activePanel(cat) {
    if (!cat) return "";
    const on = isActive(cat.id);
    return `<div class="bl-activate ${on ? "on" : ""}" id="blActivate">
      <span class="mini">${on
        ? `<b>★ Active baseline.</b> 👥 Conditional Access groups (① Check, ② Create), 🔒 Protect exclusions, 🛡 Restricted AUs (persona vaults, ＋ Bulk add, persona chips), the exclusion-restore action and 📖 Baseline guide all work against <b>${esc(cat.label)}</b> for this tenant.`
        : `Not the active baseline — the group checks, group creation, persona vaults and the exclusion-restore action currently work against <b>${esc(active().label)}</b>.`}</span>
      ${on ? "" : `<button class="btn sm" data-bl-activate="${esc(cat.id)}">🔍 Preview switching to ${esc(cat.label)}</button>`}
    </div>`;
  }

  // ---- the switch preview: what changes, before it changes ------------
  // A DRY RUN over the tenant as read, pure over its inputs. `facts` is what
  // the host page collected — nothing here calls Graph:
  //   facts.groups   [{ id, displayName }] — the groups in both baselines'
  //                  families (both prefix scans), so the routing diff can
  //                  say which groups stop being routed and which start
  //   facts.aus      [{ displayName, isMemberManagementRestricted }]
  //   facts.mapFrom  R28 entries in the CURRENT baseline's drawer
  //   facts.mapTo    R28 entries already waiting in the TARGET's drawer
  // Every list is bounded when rendered; every count is exact.
  const normName = (s) => String(s || "").trim().toLowerCase();
  function previewSwitch(toId, facts) {
    const from = active(), to = withContract(catalog(toId));
    if (!from || !to || from.id === to.id) return null;
    const f = facts || {};
    const groups = (f.groups || []).filter((g) => g && g.displayName);
    const haveGroup = new Set(groups.map((g) => normName(g.displayName)));
    const aus = (f.aus || []).filter((a) => a && a.displayName);
    const auByName = new Map(aus.map((a) => [normName(a.displayName), a]));

    // 1. groups the tools expect
    const tplTo = to.templates(), tplFrom = from.templates();
    const groupsTo = tplTo.map((t) => ({ name: t.displayName, exists: haveGroup.has(normName(t.displayName)) }));
    // 2. persona vaults
    const vaults = (to.personas || []).map((p) => {
      const name = to.auName(p.code);
      const hit = auByName.get(normName(name));
      return { code: p.code, label: p.label, name, status: !hit ? "missing" : hit.isMemberManagementRestricted === true ? "present" : "unrestricted" };
    });
    const vaultsFrom = (from.personas || []).map((p) => from.auName(p.code));
    // 3. routing: who decides where each group goes, before and after.
    //    The tenant's hand mapping wins on both sides, as it does in CaMap.
    const mapFrom = new Map((f.mapFrom || []).map((e) => [normName(e.name), e.code]));
    const mapTo = new Map((f.mapTo || []).map((e) => [normName(e.name), e.code]));
    const route = (g, cat, map) => {
      const n = normName(g.displayName);
      if (map.has(n)) return { code: map.get(n), by: "tenant" };
      const c = cat.codeForGroup(g.displayName);
      return c ? { code: c, by: "convention" } : { code: null, by: null };
    };
    const routing = { lost: [], gained: [], moved: [], same: 0, unmapped: 0 };
    for (const g of groups) {
      const a = route(g, from, mapFrom), b = route(g, to, mapTo);
      const row = { name: g.displayName, fromCode: a.code, toCode: b.code, fromBy: a.by, toBy: b.by,
        fromAu: a.code ? from.auName(a.code) : null, toAu: b.code ? to.auName(b.code) : null };
      if (a.code && !b.code) routing.lost.push(row);
      else if (!a.code && b.code) routing.gained.push(row);
      else if (a.code && b.code && (a.code !== b.code || row.fromAu !== row.toAu)) routing.moved.push(row);
      else if (a.code) routing.same++;
      else routing.unmapped++;
    }
    const byName = (x, y) => x.name.localeCompare(y.name);
    routing.lost.sort(byName); routing.gained.sort(byName); routing.moved.sort(byName);
    return {
      from: { id: from.id, label: from.label, icon: from.icon || "🧬", groups: tplFrom.length, vaults: vaultsFrom, defaultAu: from.defaultAuName, breakGlass: from.breakGlassGroup, mapCount: (f.mapFrom || []).length },
      to: { id: to.id, label: to.label, icon: to.icon || "🧬", release: to.release, source: to.source, defaultAu: to.defaultAuName, breakGlass: to.breakGlassGroup, mapCount: (f.mapTo || []).length,
        exclusionShape: to.id === "joey" ? "“<policy name> - Exclude”" : "CAB-SEC-U-CAnnn-Exclusion" },
      groupsTo, groupsExist: groupsTo.filter((g) => g.exists).length,
      vaults, routing,
      scanned: groups.length, ausScanned: aus.length,
    };
  }

  function renderPreview(p) {
    if (!p) return "";
    const few = (rows, f, n) => rows.slice(0, n || 6).map(f).join("") + (rows.length > (n || 6) ? `<div class="mini muted">… and ${rows.length - (n || 6)} more</div>` : "");
    const gMissing = p.groupsTo.length - p.groupsExist;
    const vMissing = p.vaults.filter((v) => v.status === "missing").length;
    const vClash = p.vaults.filter((v) => v.status === "unrestricted");
    const r = p.routing;
    return `<div class="bl-preview">
      <h4 style="margin:0 0 6px">🔍 DRY RUN — switching this tenant from ${esc(p.from.icon)} ${esc(p.from.label)} to ${esc(p.to.icon)} ${esc(p.to.label)}${p.to.release ? ` ${esc(p.to.release)}` : ""}${p.to.source === "live" ? " (live read)" : p.to.id === "joey" ? " (bundled snapshot)" : ""}</h4>
      <p class="mini" style="margin:0 0 10px"><b>Nothing below has happened yet, and the switch itself writes nothing to the tenant.</b> No group or unit is created, renamed or moved; the comparison tables stay as they are. What changes is what the tools <i>expect</i> and where a later write would go. Switching back restores every value on the left.</p>
      <div class="bl-prev-grid">
        <div>
          <b>👥 Groups ① Check / ② Create expect</b>
          <div class="mini">${p.from.groups} groups → <b>${p.groupsTo.length}</b>. Of the ${p.groupsTo.length}, <b>${p.groupsExist} exist</b> in this tenant and <b>${gMissing}</b> would be offered by ② Create.</div>
          ${few(p.groupsTo.filter((g) => !g.exists), (g) => `<div class="mini muted">＋ ${esc(g.name)}</div>`, 5)}
        </div>
        <div>
          <b>🛡 Persona vaults 🛡 Restricted AUs expect</b>
          <div class="mini">${p.from.vaults.length} units → <b>${p.vaults.length}</b>: ${p.vaults.length - vMissing - vClash.length} present, <b>${vMissing} missing</b>${vClash.length ? `, <span style="color:var(--off)">${vClash.length} name taken by a non-restricted unit</span>` : ""}.</div>
          ${few(p.vaults, (v) => `<div class="mini muted">${v.status === "present" ? "✓" : v.status === "missing" ? "＋" : "⚠"} ${esc(v.name)} <span class="muted">(${esc(v.label)})</span></div>`, 8)}
        </div>
        <div>
          <b>🔀 Routing — where ⑥ Protect and ＋ Bulk add would file the ${p.scanned} groups read</b>
          <div class="mini">${r.same} unchanged · <b>${r.lost.length} stop being routed</b> (become unmapped) · <b>${r.gained.length} start being routed</b> · ${r.moved.length} change vault · ${r.unmapped} unmapped either way.</div>
          ${few(r.lost, (x) => `<div class="mini muted">− ${esc(x.name)} <span class="muted">was → ${esc(x.fromAu)}${x.fromBy === "tenant" ? " (by your mapping)" : ""}</span></div>`, 4)}
          ${few(r.gained, (x) => `<div class="mini muted">＋ ${esc(x.name)} <span class="muted">→ ${esc(x.toAu)}${x.toBy === "tenant" ? " (by your mapping)" : ""}</span></div>`, 4)}
          ${few(r.moved, (x) => `<div class="mini muted">~ ${esc(x.name)} <span class="muted">${esc(x.fromAu)} → ${esc(x.toAu)}</span></div>`, 4)}
        </div>
        <div>
          <b>📐 Conventions the tools apply</b>
          <div class="mini">Exclusion group per policy (🗂 Assign action 8): <b>${esc(p.to.exclusionShape)}</b></div>
          <div class="mini">Break-glass group (📘 MS Learn fix): ${esc(p.from.breakGlass)} → <b>${esc(p.to.breakGlass)}</b></div>
          <div class="mini">Fallback unit ⑥ Protect offers to create: ${esc(p.from.defaultAu)} → <b>${esc(p.to.defaultAu)}</b></div>
          <div class="mini">🏷 Group personas (R28): the ${p.from.mapCount} mapping${p.from.mapCount === 1 ? "" : "s"} for ${esc(p.from.label)} stay saved but out of view; ${p.to.mapCount ? `<b>${p.to.mapCount}</b> already waiting` : "none yet"} for ${esc(p.to.label)}.</div>
          <div class="mini">📖 Baseline guide reads ${esc(p.to.label)}'s objects${p.to.id === "joey" ? "; its step prose stays written for CloudFellows and says so" : ""}.</div>
        </div>
      </div>
      <div class="row" style="justify-content:flex-start;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn sm primary" data-bl-switch="${esc(p.to.id)}">★ Switch — make ${esc(p.to.label)} the active baseline</button>
        <button class="btn sm" data-bl-cancel="1">Keep ${esc(p.from.label)}</button>
        <span class="mini muted">Read ${p.scanned} groups and ${p.ausScanned} administrative units to write this; nothing was changed.</span>
      </div>
    </div>`;
  }

  function chips(res, active) {
    const all = res.rows.length;
    const items = [["all", `All (${all})`]].concat(
      ["missing", "conflict", "outdated", "ok", "present", "ahead", "unversioned", "extra"]
        .filter((k) => res.counts[k])
        .map((k) => [k, `${STATUS[k].icon} ${STATUS[k].label} (${res.counts[k]})`]));
    return items.map(([k, l]) => `<button class="fchip ${active === k ? "active" : ""}" data-blf="${k}">${esc(l)}</button>`).join("");
  }

  // ---- what changed between the tenant's policy and the baseline version ----
  // The catalog stores an assignment list and rendered control strings; the
  // tenant side is the same view model the cards use, so assignments compare
  // directly and the controls compare as normalised text.
  const normTxt = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const setDiff = (a, b) => {   // in a, not in b (case-insensitive)
    const B = new Set((b || []).map(normTxt));
    return (a || []).filter((x) => !B.has(normTxt(x)));
  };
  function changes(r) {
    if (!r.baseline || !r.tenant) return [];
    const b = r.baseline, vm = r.tenant, out = [];
    const bInc = b.include || [], bExc = b.exclude || [];
    const tInc = (vm.users && vm.users.inc) || [], tExc = (vm.users && vm.users.exc) || [];
    setDiff(bExc, tExc).forEach((x) => out.push({ k: "add", t: "exclude " + x }));
    setDiff(tExc, bExc).forEach((x) => out.push({ k: "del", t: "exclude " + x }));
    setDiff(bInc, tInc).forEach((x) => out.push({ k: "add", t: "include " + x }));
    setDiff(tInc, bInc).forEach((x) => out.push({ k: "del", t: "include " + x }));
    // grant / block
    const bGrant = b.block ? "Block access" : (b.grant || "");
    const tGrant = vm.grant && vm.grant.mode === "block" ? "Block access" : ((vm.grant && vm.grant.controls) || []).join(" + ");
    if (normTxt(bGrant) !== normTxt(tGrant) && (bGrant || tGrant)) out.push({ k: "chg", t: `grant: ${tGrant || "—"} → ${bGrant || "—"}` });
    // session controls
    const bSess = b.session || "";
    const tSess = ((vm.session) || []).map((s) => s.t).join(" · ");
    if (normTxt(bSess) !== normTxt(tSess) && (bSess || tSess)) out.push({ k: "chg", t: `session: ${tSess || "none"} → ${bSess || "none"}` });
    return out;
  }

  function renderTable(res, filter, query, collapsed) {
    const q = (query || "").toLowerCase();
    const isCollapsed = (g) => collapsed && collapsed.has(g);
    let rows = res.rows;
    if (filter && filter !== "all") rows = rows.filter((r) => r.status === filter);
    if (q) rows = rows.filter((r) => `${r.num} ${r.baseline?.name || ""} ${r.tenant?.name || ""}`.toLowerCase().includes(q));
    if (!rows.length) return '<p class="mini" style="padding:20px">No baseline policies match the current filter.</p>';

    // how many rows each persona holds, so a collapsed header can still say
    const perGroup = new Map();
    rows.forEach((r) => {
      const g = personaOf(r.num, r.baseline);
      perGroup.set(g, (perGroup.get(g) || 0) + 1);
    });

    let body = "", lastGroup = null;
    for (const r of rows) {
      const g = personaOf(r.num, r.baseline);
      if (g !== lastGroup) {
        const n = perGroup.get(g), col = isCollapsed(g);
        body += `<tr class="grouprow${col ? " collapsed" : ""}" data-blgroup="${esc(g)}"><td colspan="6">
          <span class="caret">▶</span> <b>${esc(g)}</b>
          <span class="mini">${n} ${n === 1 ? "policy" : "policies"}${col ? " · click to expand" : ""}</span></td></tr>`;
        lastGroup = g;
      }
      if (isCollapsed(g)) continue;
      const s = STATUS[r.status];
      const bName = r.baseline ? r.baseline.name : "—";
      const tag = r.baseline?.tag ? `<span class="tag new">${esc(r.baseline.tag)}</span>` : "";
      const tenant = r.tenant
        ? `<span class="pname" data-blpol="${esc(r.tenant.id)}">${esc(r.tenant.name)}</span>
           <div class="mini">state: ${esc(r.tenant.state === "report" ? "report-only" : r.tenant.state)}${r.duplicates ? ` · ⚠ ${r.duplicates} policies share CA${r.num}` : ""}${r.why ? ` · <b>${esc(r.why)}</b>` : ""}</div>`
        : '<span class="mini">not present in this tenant</span>';
      const ver = r.status === "outdated"
        ? `<span class="bl-ver warn">${esc(r.tenantVersion)} → ${esc(r.baseline.version)}</span>`
        : r.status === "missing" ? `<span class="mini">${esc(r.baseline.version || "—")}</span>`
        : r.status === "extra" ? `<span class="mini">${esc(r.tenantVersion || "—")}</span>`
        : `<span class="mini">${esc(r.tenantVersion || r.baseline?.version || "—")}</span>`;
      const ch = changes(r);
      const chCell = r.status === "missing" ? '<span class="mini muted">new policy</span>'
        : r.status === "extra" ? '<span class="mini muted">not in baseline</span>'
        : ch.length
          ? `<div class="bl-ch">${ch.slice(0, 6).map((c) =>
              `<span class="bl-chip ${c.k}" title="${esc(c.t)}">${c.k === "add" ? "+" : c.k === "del" ? "−" : "~"} ${esc(c.t)}</span>`).join("")}
             ${ch.length > 6 ? `<span class="mini muted">+${ch.length - 6} more</span>` : ""}</div>`
          : '<span class="mini muted">no assignment or control change</span>';
      body += `<tr>
        <td class="bl-st"><span class="bl-badge ${s.cls}" title="${esc(s.label)}">${s.icon}</span></td>
        <td><b>CA${String(r.num).padStart(3, "0")}</b></td>
        <td>${esc(bName)} ${tag}<div class="mini">${esc(r.baseline ? `${r.baseline.resources} · ${r.baseline.grant}` : "")}</div></td>
        <td>${tenant}</td>
        <td>${ver}</td>
        <td class="bl-chcell">${chCell}</td>
      </tr>`;
    }
    return `<div class="list-card"><table class="plist bl-table">
      <thead><tr><th style="width:44px"></th><th style="width:78px">CA</th><th>Baseline policy (${esc(res.catalog.release)})</th><th>In this tenant</th><th style="width:150px">Version</th><th style="width:280px">Changes</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }


  // Every persona currently on screen, for collapse-all / expand-all. It must
  // select EXACTLY the rows renderTable draws, or the button acts on a
  // different set than the one being looked at: this used to drop rows with no
  // baseline entry (the "Not in baseline" ones), which the table does render —
  // so with that chip active it returned nothing and Collapse all silently did
  // nothing at all. Same three steps as renderTable, in the same order.
  function personas(res, filter, query) {
    const q = (query || "").toLowerCase();
    let rows = res.rows;
    if (filter && filter !== "all") rows = rows.filter((r) => r.status === filter);
    if (q) rows = rows.filter((r) => `${r.num} ${r.baseline?.name || ""} ${r.tenant?.name || ""}`.toLowerCase().includes(q));
    return [...new Set(rows.map((r) => personaOf(r.num, r.baseline)))];
  }

  // ---- Markdown export ----
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  function toMd(res, tenantName) {
    const L = [];
    L.push(`# Baseline comparison — ${mdEsc(tenantName || "tenant")} vs the ${mdEsc(res.catalog.label)} baseline ${mdEsc(res.catalog.release)}`);
    L.push("");
    L.push(Brand.generatedBy());
    if (res.catalog.url) L.push(`Baseline source: ${res.catalog.url}`);
    L.push("");
    L.push(`- Baseline coverage: **${res.coverage}%** — ${res.covered} of ${res.baselineTotal} baseline policies present in the tenant.`);
    ["missing", "conflict", "outdated", "ok", "present", "ahead", "unversioned", "extra"].forEach((k) => {
      if (res.counts[k]) L.push(`- ${STATUS[k].label}: **${res.counts[k]}**`);
    });
    L.push(`- Import would add or update **${res.toImport.length}** policies.`);
    L.push("");
    L.push("| Status | CA | Baseline policy | In tenant | Version |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const r of res.rows) {
      const v = r.status === "outdated" ? `${r.tenantVersion} → ${r.baseline.version}` : (r.tenantVersion || r.baseline?.version || "—");
      L.push(`| ${STATUS[r.status].label} | CA${String(r.num).padStart(3, "0")} | ${mdEsc(r.baseline?.name || "—")} | ${mdEsc(r.tenant?.name || "—")}${r.why ? ` — ${mdEsc(r.why)}` : ""} | ${mdEsc(v)} |`);
    }
    L.push("");
    if (res.toImport.length) {
      L.push("## Would be imported or updated");
      L.push("");
      for (const r of res.toImport) L.push(`- **CA${String(r.num).padStart(3, "0")}** ${mdEsc(r.baseline.name)}${
        r.status === "outdated" ? ` — currently v${mdEsc(r.tenantVersion)}`
        : r.status === "conflict" ? ` — CA${String(r.num).padStart(3, "0")} is taken by "${mdEsc(r.tenant.name)}" (${mdEsc(r.why)})`
        : " — not present"}`);
      L.push("");
    }
    return L.join("\n");
  }

  return { catalogs, catalog, compare, personas, personaKey, similarity, mismatchReason, renderSummary, chips, renderTable, changes, toMd, STATUS, caNum, version, cmpVersion,
    // R36
    use, active, activeCatalogId, isActive, setActive, activeLine, activeChip, withContract, previewSwitch, renderPreview, DEFAULT_ID };
})();
