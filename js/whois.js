// ======================================================================
// 🕵 Who is Anna to CA (T36, BETA) — one user, the whole Conditional
// Access picture on one screen.
//
// The question a service desk gets is never "which policies target group X"
// — it is "why can't Anna sign in" or "is Anna in the wave yet". Answering
// it today takes four tools: ⚖ Compare users for the include/exclude
// resolution, 🔗 User or Group analyzer for the memberships, 🚦 Sign-in
// failures for what actually happened to her and 🎚 Report-only impact for
// what will happen to her. This module composes those four answers for a
// single user and adds the one thing none of them frames: WHERE SHE IS IN
// THE ROLLOUT — which of the active baseline's deployment groups
// (CAD-SEC-U-DG-*) she is in, how she got there (direct, or nested via
// which parent), and which exclusion groups take her back out of an
// enforced policy.
//
// Pure functions over data the app hands in. The Graph reads live in
// app.js next to the other tools so the sign-in window cache and the
// consent prompts are shared; nothing here writes.
//
//   WhoIs.analyze({ user, vms, records, cat, dgPresent })  → res
//   WhoIs.render(res, opts)                                 → html
//   WhoIs.toMd(res, meta)                                   → markdown
//
// user     the shape Comparer.resolveUser returns, plus (optional)
//          direct:Set of direct group ids, via:{groupId:[parentName]},
//          dept, title, licence:{p1,p2,p1grace,lic0}|null, methods:[]|null
// vms      the app's policy view models (ALL states — Off is shown too, as
//          "becomes real when switched On")
// records  raw sign-in records for THIS user in the window (already filtered)
// cat      Baseline.active() — for the DG list, persona groups, exclusion
//          convention; null-safe
// dgPresent Map name(lower) → group | null: which DG groups the tenant has
// ======================================================================
const WhoIs = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();

  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };

  // ---------------------------------------------------------- lookup --
  // Like Comparer.buildLookup, but keeps Off policies and the CA number.
  function buildLookup(vms) {
    return (vms || []).map((vm) => {
      const p = vm.raw || {}, u = ((p.conditions || {}).users) || {};
      return {
        id: p.id, name: p.displayName || vm.name || p.id, seq: vm.seq || "", state: STATE[p.state] || "off",
        includeAll: (u.includeUsers || []).includes("All"),
        incUsers: new Set((u.includeUsers || []).filter((x) => x !== "All" && x !== "None" && x !== "GuestsOrExternalUsers")),
        excUsers: new Set((u.excludeUsers || []).filter((x) => x !== "GuestsOrExternalUsers")),
        incGroups: u.includeGroups || [], excGroups: u.excludeGroups || [],
        incRoles: u.includeRoles || [], excRoles: u.excludeRoles || [],
        incGuests: !!u.includeGuestsOrExternalUsers || (u.includeUsers || []).includes("GuestsOrExternalUsers"),
        excGuests: !!u.excludeGuestsOrExternalUsers || (u.excludeUsers || []).includes("GuestsOrExternalUsers"),
        controls: (vm.grant && vm.grant.controls) || [],
        op: (vm.grant && vm.grant.op) || "",
        session: (vm.session || []).map((x) => (x && typeof x === "object") ? x.t : x).filter(Boolean),
        block: ((vm.grant && vm.grant.controls) || []).some((c) => /^block/i.test(String(c))),
        // risk-based = needs Entra ID P2 on every targeted user
        risk: !!(((p.conditions || {}).userRiskLevels || []).length || ((p.conditions || {}).signInRiskLevels || []).length || ((p.conditions || {}).insiderRiskLevels || []).length),
      };
    });
  }

  // How the user got into a group: "direct", "nested via X", or "member"
  // when the app could not read the direct list.
  function howOf(u, gid) {
    if (!u.direct) return "member";
    if (u.direct.has(gid)) return "direct";
    const via = (u.via && u.via[gid]) || [];
    return via.length ? `nested via ${via.join(", ")}` : "nested";
  }

  // Assignment state of one policy for the user — Comparer.stateFor with the
  // INCLUDE reason added, because "reaches her via DG-INT" is the whole point.
  function stateFor(P, u) {
    const name = (id) => u.names[id] || id;
    let why = null;
    if (P.includeAll) why = { kind: "all", text: "All users" };
    else if (P.incUsers.has(u.id)) why = { kind: "user", text: "named directly" };
    else {
      const g = P.incGroups.find((x) => u.groupIds.has(x));
      if (g) why = { kind: "group", id: g, text: name(g), how: howOf(u, g) };
      else {
        const r = P.incRoles.find((x) => u.roleIds.has(x));
        if (r) why = { kind: "role", id: r, text: name(r) };
        else if (P.incGuests && u.guest) why = { kind: "guest", text: "guest / external user type" };
      }
    }
    if (!why) return { s: "na" };
    if (P.excUsers.has(u.id)) return { s: "exc", inc: why, exc: { kind: "user", text: "named directly in the exclusions" } };
    const g = P.excGroups.find((x) => u.groupIds.has(x));
    if (g) return { s: "exc", inc: why, exc: { kind: "group", id: g, text: name(g), how: howOf(u, g) } };
    const r = P.excRoles.find((x) => u.roleIds.has(x));
    if (r) return { s: "exc", inc: why, exc: { kind: "role", id: r, text: name(r) } };
    if (P.excGuests && u.guest) return { s: "exc", inc: why, exc: { kind: "guest", text: "guest / external user type" } };
    return { s: "inc", inc: why };
  }

  // ------------------------------------------------- deployment groups --
  // The active baseline's deploy groups and persona (production) groups,
  // each with: does the tenant have it, is the user in it, how.
  function ladderOf(u, cat, dgPresent) {
    const byName = new Map();
    u.groupIds.forEach((id) => byName.set(lc(u.names[id] || id), id));
    const present = dgPresent || new Map();
    const rung = (name, kind) => {
      const key = lc(name);
      const gid = byName.get(key);
      const has = present.has(key) ? !!present.get(key) : (gid ? true : null);   // null = not checked
      return { name, kind, exists: has, inMember: !!gid, id: gid || (present.get(key) || {}).id || null, how: gid ? howOf(u, gid) : "" };
    };
    const deploy = ((cat && cat.predefined) || []).filter((n) => /-DG-/i.test(n)).map((n) => rung(n, "deploy"));
    const persona = ((cat && cat.personaGroups) || []).filter((p) => p.group).map((p) => ({ ...rung(p.group, "persona"), label: p.label }));
    return { deploy, persona, hasDg: deploy.length > 0 };
  }

  // The exclusion groups the user is in: every group of hers that some policy
  // names in its EXCLUDE list, with the policies it takes her out of. The
  // baseline's own naming convention is a second, weaker signal (a
  // convention-named group no policy references any more is reported as
  // dangling rather than dropped).
  function exclusionsOf(u, lookup, cat) {
    const isConv = (n) => { try { return !!(cat && cat.isExclusionGroup && cat.isExclusionGroup(n)); } catch { return false; } };
    const out = new Map();
    lookup.forEach((P) => P.excGroups.forEach((g) => {
      if (!u.groupIds.has(g)) return;
      if (!out.has(g)) out.set(g, { id: g, name: u.names[g] || g, how: howOf(u, g), policies: [], convention: isConv(u.names[g] || "") });
      out.get(g).policies.push({ id: P.id, seq: P.seq, name: P.name, state: P.state, targeted: stateFor(P, u).s !== "na" });
    }));
    u.groupIds.forEach((g) => {
      const n = u.names[g] || "";
      if (isConv(n) && !out.has(g)) out.set(g, { id: g, name: n, how: howOf(u, g), policies: [], convention: true, dangling: true });
    });
    return [...out.values()].map((x) => ({
      ...x,
      // a bypass = she is excluded from a policy that is ON and would otherwise reach her
      bypass: x.policies.some((p) => p.state === "on" && p.targeted),
    })).sort((a, b) => (b.bypass - a.bypass) || a.name.localeCompare(b.name));
  }

  // --------------------------------------------------------- sign-ins --
  // records → enforced failures/interrupts (Signins.parse) + the user's
  // report-only row (ReportImpact.build), both scoped to this user already.
  function logOf(records, userId, roPolicies) {
    const recs = (records || []).filter((r) => !userId || r.userId === userId);
    const rows = recs.map((r) => Signins.parse(r, "enforced")).filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const blocked = rows.filter((r) => !r.interrupted).length;
    const interrupted = rows.length - blocked;
    const perPolicy = new Map();   // policy id → { blocked, interrupted }
    rows.forEach((r) => r.policies.forEach((p) => {
      const k = p.id || p.name;
      if (!perPolicy.has(k)) perPolicy.set(k, { blocked: 0, interrupted: 0 });
      perPolicy.get(k)[p.result === "interrupted" ? "interrupted" : "blocked"]++;
    }));
    // The records are this user's already, so the cross-policy user row is
    // the first (and only) one; a UPN that changed mid-window would make two,
    // which are folded here rather than losing one.
    let ro = null;
    try {
      const b = ReportImpact.build(recs, roPolicies || []);
      const us = b.users || [];
      if (us.length === 1) ro = us[0];
      else if (us.length > 1) {
        const pm = new Map();
        us.forEach((x) => x.policies.forEach((p) => {
          const k = p.id || p.key;
          if (!pm.has(k)) pm.set(k, { ...p, denyWhy: [...(p.denyWhy || [])], riskWhy: [...(p.riskWhy || [])], samples: [...(p.samples || [])] });
          else { const t = pm.get(k); t.success += p.success; t.interrupted += p.interrupted; t.failure += p.failure; t.denyWhy = t.denyWhy.concat(p.denyWhy || []); t.riskWhy = t.riskWhy.concat(p.riskWhy || []); }
        }));
        ro = { ...us[0], policies: [...pm.values()] };
      }
    } catch (e) { console.warn("whois: report-only build failed", e && e.message); }
    const failedIds = new Set(rows.map((r) => r.id));
    return { rows, total: recs.length, passed: recs.filter((r) => !failedIds.has(r.id)).length, blocked, interrupted, perPolicy, ro };
  }

  // ---------------------------------------------------------- analyze --
  function analyze({ user, vms, records, cat, dgPresent, days }) {
    const lookup = buildLookup(vms);
    const ladder = ladderOf(user, cat, dgPresent);
    const exclusions = exclusionsOf(user, lookup, cat);
    const roPolicies = lookup.filter((P) => P.state === "ro").map((P) => ({ id: P.id, name: P.name }));
    const log = records ? logOf(records, user.id, roPolicies) : null;
    const roByPolicy = new Map();
    if (log && log.ro) log.ro.policies.forEach((p) => roByPolicy.set(p.id || p.key, p));

    const rows = lookup.map((P) => {
      const st = stateFor(P, user);
      const cnt = log ? (log.perPolicy.get(P.id) || null) : null;
      const fc = P.state === "ro" && log ? (roByPolicy.get(P.id) || { success: 0, interrupted: 0, failure: 0, nodata: true }) : null;
      return { ...P, ...st, log: cnt, forecast: fc };
    }).sort((a, b) => {
      const o = { inc: 0, exc: 1, na: 2 };
      return (o[a.s] - o[b.s]) || (a.seq || "").localeCompare(b.seq || "") || a.name.localeCompare(b.name);
    });
    const reach = rows.filter((r) => r.s === "inc");
    const counts = {
      total: rows.length, reach: reach.length, excluded: rows.filter((r) => r.s === "exc").length, na: rows.filter((r) => r.s === "na").length,
      on: reach.filter((r) => r.state === "on").length, ro: reach.filter((r) => r.state === "ro").length, off: reach.filter((r) => r.state === "off").length,
    };
    // Where she is in the rollout: the highest deploy rung she is in, in the
    // baseline's own order; else the persona group; else nothing.
    const inDeploy = ladder.deploy.filter((r) => r.inMember);
    const inPersona = ladder.persona.filter((r) => r.inMember);
    const stage = inDeploy.length ? { kind: "deploy", groups: inDeploy } : inPersona.length ? { kind: "persona", groups: inPersona } : { kind: "none", groups: [] };
    // Forecast verdict: worst case over her report-only policies.
    let forecast = null;
    if (log) {
      const ro = log.ro;
      const block = ro ? ro.policies.filter((p) => p.failure) : [];
      const prompt = ro ? ro.policies.filter((p) => !p.failure && p.interrupted) : [];
      forecast = { worst: block.length ? "block" : prompt.length ? "prompt" : (ro && ro.policies.length) ? "clean" : "nodata", block, prompt, roCount: counts.ro };
    }
    return { user, days: days || null, ladder, exclusions, rows, counts, stage, log, forecast, bypasses: exclusions.filter((x) => x.bypass) };
  }

  // ----------------------------------------------------------- render --
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;
  const stateHtml = (st) => `<span class="wo-state ${st}">${dot(st)}${STATE_LABEL[st]}</span>`;
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const polLink = (r) => `<span class="pol-link" data-polid="${esc(r.id)}">${r.seq ? `<b>${esc(r.seq)}</b> ` : ""}${esc(r.name)}</span>`;
  // "nested via X" is the line that matters: she is in the group because
  // somebody put her in X, and whoever manages X decides — so it is marked,
  // not muted, wherever a group reason is written
  const howHtml = (how) => !how || how === "member" ? "" : /^nested/.test(how) ? ` <span class="wo-nest">↪ ${esc(how)}</span>` : ` <span class="mini muted">· ${esc(how)}</span>`;
  const whyHtml = (w) => {
    if (!w) return "";
    if (w.kind === "group") return `<b>${esc(w.text)}</b>${howHtml(w.how)}`;
    if (w.kind === "role") return `role <b>${esc(w.text)}</b>`;
    return `<b>${esc(w.text)}</b>`;
  };
  const fmtWhen = (iso) => { try { const d = new Date(iso); return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }); } catch { return String(iso || ""); } };
  const controlsHtml = (r) => {
    const c = (r.controls || []).map((x) => `<span class="ctrl${/^block/i.test(String(x)) ? " block" : ""}">${esc(x)}</span>`);
    const s = (r.session || []).map((x) => `<span class="ctrl">${esc(x)}</span>`);
    return c.concat(s).join(r.op && c.length > 1 ? `<span class="mini muted"> ${esc(r.op)} </span>` : "") || '<span class="mini muted">—</span>';
  };

  function forecastHtml(fc) {
    if (!fc) return '<span class="mini muted">—</span>';
    if (fc.nodata) return '<span class="mini muted">no sign-in evaluated it — no data, not safe</span>';
    const tot = (fc.failure || 0) + (fc.interrupted || 0) + (fc.success || 0);
    const w = (n) => tot ? Math.round(n / tot * 100) : 0;
    const bar = `<div class="wo-fbar" title="${fc.failure || 0} would block · ${fc.interrupted || 0} would prompt · ${fc.success || 0} no change"><i class="b" style="width:${w(fc.failure || 0)}%"></i><i class="p" style="width:${w(fc.interrupted || 0)}%"></i><i class="n" style="width:${w(fc.success || 0)}%"></i></div>`;
    const parts = [];
    if (fc.failure) parts.push(`<span class="wo-res wb">would block ×${fc.failure}</span>`);
    if (fc.interrupted) parts.push(`<span class="wo-res wp">prompts ×${fc.interrupted}</span>`);
    if (fc.success && !fc.failure && !fc.interrupted) parts.push(`<span class="wo-res nc">no change ×${fc.success}</span>`);
    else if (fc.success) parts.push(`<span class="mini muted">no change ×${fc.success}</span>`);
    const why = (fc.denyWhy || []).slice(0, 2).map((d) => `${esc(d.what)}${d.n > 1 ? ` ×${d.n}` : ""}`).join("; ");
    return `${bar}${parts.join(" · ")}${why ? `<div class="mini muted">${why}</div>` : ""}`;
  }

  function render(res, opts = {}) {
    const u = res.user, c = res.counts, log = res.log, fc = res.forecast;
    const rangeLabel = opts.rangeLabel || (res.days ? `${res.days} days` : "window");
    const filter = opts.filter || "reach";
    // ---- identity + verdict tiles
    const facts = [];
    facts.push(`<span class="wo-fact">${u.guest ? "Guest" : "Member"} · <b>${u.enabled ? "Enabled" : "Disabled"}</b></span>`);
    if (u.dept) facts.push(`<span class="wo-fact">Department <b>${esc(u.dept)}</b></span>`);
    if (u.title) facts.push(`<span class="wo-fact">${esc(u.title)}</span>`);
    if (u.licence) {
      const L = u.licence;
      const lab = L.p2 ? "Entra ID P2" : L.p1 ? "Entra ID P1" : L.p1grace ? "P1 (seat expired)" : L.lic0 ? "no licences" : "no Entra ID P1/P2";
      facts.push(`<span class="wo-fact${L.p1 ? "" : " warn"}">Licence <b>${esc(lab)}</b></span>`);
      const riskHit = res.rows.some((r) => r.s === "inc" && r.state !== "off" && r.risk);
      if (riskHit && !L.p2) facts.push(`<span class="wo-fact warn">a risk-based policy reaches her — needs <b>P2</b></span>`);
    } else if (u.licence === null) facts.push(`<span class="wo-fact muted">Licence not read</span>`);
    if (u.methods) facts.push(`<span class="wo-fact${u.methods.length ? "" : " warn"}">MFA methods <b>${u.methods.length ? esc(u.methods.join(", ")) : "none registered"}</b></span>`);
    else if (u.methods === null) facts.push(`<span class="wo-fact muted">MFA methods <b>not read</b> <button class="btn sm" data-wo-methods>read</button></span>`);
    facts.push(`<span class="wo-fact">Roles <b>${u.roleIds.size ? esc([...u.roleIds].map((r) => u.names[r] || r).join(", ")) : "none"}</b></span>`);
    facts.push(`<span class="wo-fact">Groups <b>${u.groupIds.size}</b>${u.direct ? ` <span class="muted">(${u.direct.size} direct)</span>` : ""}</span>`);

    const stage = res.stage;
    const stageTile = stage.kind === "deploy"
      ? `<div class="wo-vt ok"><span class="k">Deployment stage</span><span class="v">${esc(stage.groups.map((g) => g.name.replace(/^.*-DG-/i, "")).join(" + "))}</span><span class="s">${esc(stage.groups.map((g) => `${g.name} · ${g.how}`).join(" · "))} · <a href="#" class="md-tool" data-tool="toolWave">🌊 the wave</a></span></div>`
      : stage.kind === "persona"
        ? `<div class="wo-vt"><span class="k">Persona group</span><span class="v">${esc(stage.groups.map((g) => (g.label || g.name).replace(/^\S+\s/, "")).join(" + "))}</span><span class="s">${esc(stage.groups.map((g) => `${g.name} · ${g.how}`).join(" · "))}</span></div>`
        : `<div class="wo-vt ${res.ladder.hasDg ? "warn" : ""}"><span class="k">Deployment stage</span><span class="v">${res.ladder.hasDg ? "Not in a wave" : "No waves"}</span><span class="s">${res.ladder.hasDg ? "in none of the deploy groups — only what targets All users reaches her" : "the active baseline has no deployment groups"}</span></div>`;
    const polTile = `<div class="wo-vt"><span class="k">Policies reaching her</span><span class="v">${c.reach} <span class="of">/ ${c.total}</span></span><span class="s">${c.on} enforced · ${c.ro} report-only · ${c.off} off${c.excluded ? ` · <span class="wo-res wb">${c.excluded} excluded</span>` : ""}</span></div>`;
    const logTile = log
      ? `<div class="wo-vt ${log.rows.length ? "bad" : "ok"}"><span class="k">Sign-ins CA stopped · ${esc(rangeLabel)}</span><span class="v">${log.rows.length}</span><span class="s">${log.blocked} blocked · ${log.interrupted} interrupted · ${log.total} sign-ins read</span></div>`
      : `<div class="wo-vt"><span class="k">Sign-ins CA stopped</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>`;
    const fcTile = fc
      ? fc.worst === "block"
        ? `<div class="wo-vt bad"><span class="k">If report-only went live</span><span class="v">Locked out</span><span class="s">by ${esc(fc.block.map((p) => p.name).join(", "))}${fc.prompt.length ? ` · prompts from ${fc.prompt.length} more` : ""}</span></div>`
        : fc.worst === "prompt"
          ? `<div class="wo-vt warn"><span class="k">If report-only went live</span><span class="v">Extra prompts</span><span class="s">from ${esc(fc.prompt.map((p) => p.name).join(", "))}</span></div>`
          : fc.worst === "clean"
            ? `<div class="wo-vt ok"><span class="k">If report-only went live</span><span class="v">No change</span><span class="s">her sign-ins already satisfy every report-only policy</span></div>`
            : `<div class="wo-vt"><span class="k">If report-only went live</span><span class="v muted">No data</span><span class="s">${c.ro ? `${c.ro} report-only ${c.ro === 1 ? "policy reaches" : "policies reach"} her, none evaluated a sign-in in the window` : "no report-only policy reaches her"}</span></div>`
      : `<div class="wo-vt"><span class="k">If report-only went live</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>`;

    const head = `<div class="list-card wo-card">
      <div class="wo-who">
        <div class="avatar wo-av">${esc((u.name || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="wo-name">${esc(u.name)}${u.guest ? ' <span class="tag new">guest</span>' : ""}${u.enabled ? "" : ' <span class="tag block">disabled</span>'}</div>
          <div class="muted">${esc(u.upn)} <span class="uupn">${esc(u.id)}</span></div>
          <div class="wo-facts">${facts.join("")}</div>
        </div>
        <div class="wo-actions">
          <button class="btn sm" data-wo-compare title="Open ⚖ Compare users with this user added — who added her to a group, and how she differs from a colleague">⚖ Compare</button>
          <button class="btn sm" data-wo-whatif title="Open 🧪 What-If with this user filled in">🧪 What-If</button>
          <button class="btn sm" data-wo-groupuse title="Open 🔗 User or Group analyzer — everything outside Conditional Access that points at her">🔗 Analyzer</button>
        </div>
      </div>
      <div class="wo-verdicts">${stageTile}${polTile}${logTile}${fcTile}</div>
    </div>`;

    // ---- deployment ladder
    const rung = (r) => {
      const cls = r.inMember ? "in" : r.exists === false ? "missing" : "out";
      const st = r.inMember ? `In · <b>${esc(r.how)}</b>` : r.exists === false ? "Not in this tenant" : "Not in";
      return `<div class="wo-rung ${cls}"><span class="g">${dot(r.inMember ? "on" : "na")}${esc(r.name)}${r.label ? ` <span class="mini muted">${esc(r.label.replace(/^\S+\s/, ""))}</span>` : ""}</span><span class="st">${st}</span></div>`;
    };
    const exclRung = (x) => `<div class="wo-rung ${x.bypass ? "excl" : "out"}"><span class="g">${dot(x.bypass ? "off" : "na")}${esc(x.name)}</span>
      <span class="st">Excluded · ${/^nested/.test(x.how) ? `<b class="wo-nest">↪ ${esc(x.how)}</b> <span class="mini muted">— whoever manages that group decides</span>` : `<b>${esc(x.how)}</b>`}</span>
      <span class="mini muted">${x.dangling ? "no policy references this group" : `from ${x.policies.map((p) => `${esc(p.seq || p.name)}${p.state === "on" ? "" : ` (${STATE_LABEL[p.state]})`}`).join(", ")}`}</span></div>`;
    const ladderHtml = `<div class="list-card wo-card">
      <h3 class="wo-h">🚀 Deployment groups <span class="mini muted">— ${res.ladder.hasDg ? "the ★ active baseline's deploy groups, membership read transitively" : "the ★ active baseline has no deployment groups; its persona groups are shown"}</span></h3>
      ${res.ladder.deploy.length ? `<div class="wo-ladder">${res.ladder.deploy.map(rung).join("")}</div>` : ""}
      ${res.ladder.persona.length ? `<div class="mini muted" style="margin:10px 0 4px">Persona groups (production)</div><div class="wo-ladder">${res.ladder.persona.map(rung).join("")}</div>` : ""}
      ${res.exclusions.length ? `<div class="mini muted" style="margin:10px 0 4px">Exclusion groups she is in</div><div class="wo-ladder">${res.exclusions.map(exclRung).join("")}</div>` : '<p class="mini muted" style="margin-top:10px">She is in no exclusion group.</p>'}
      ${res.bypasses.map((x) => `<div class="wo-callout bad"><b>Standing bypass.</b> She is in <b>${esc(x.name)}</b> (${/^nested/.test(x.how) ? `<span class="wo-nest">↪ ${esc(x.how)}</span> — she was never added to the exclusion group itself` : esc(x.how)}), which takes her out of ${x.policies.filter((p) => p.state === "on" && p.targeted).map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.seq ? `${p.seq} ${p.name}` : p.name)}</span>`).join(", ")} while ${x.policies.filter((p) => p.state === "on" && p.targeted).length === 1 ? "it is" : "they are"} <b>enforced</b>. Who put her there and when: <a href="#" class="md-tool" data-tool="toolCompare">⚖ Compare users</a> shows the membership next to a colleague's; <a href="#" class="md-tool" data-tool="toolAudit">🕓 Change audit</a> has the group change if it is inside the retention window.</div>`).join("")}
      ${stage.kind === "none" && res.ladder.hasDg ? `<div class="wo-callout"><b>Not in a wave.</b> None of the deploy groups has her, so only policies scoped to <b>All users</b> (or a role / another group) reach her. If she is supposed to be in the rollout, add her through <a href="#" class="md-tool" data-tool="toolCaGroups">👥 Conditional Access groups</a>.</div>` : ""}
    </div>`;

    // ---- policies table
    const chips = [
      ["reach", `Reaches her ${pill(c.reach, "green")}`], ["exc", `Excluded ${pill(c.excluded, "red")}`], ["na", `Not targeted ${pill(c.na, "zero")}`], ["all", `All ${pill(c.total, "zero")}`],
    ].map(([k, l]) => `<button class="fchip${filter === k ? " active" : ""}" data-wo-filter="${k}">${l}</button>`).join("");
    const shown = res.rows.filter((r) => filter === "all" || (filter === "reach" ? r.s === "inc" : filter === "exc" ? r.s === "exc" : r.s === "na"));
    const via = (r) => r.s === "inc" ? whyHtml(r.inc)
      : r.s === "exc" ? `<span class="wo-ex"><b>EXCLUDED</b> · ${whyHtml(r.exc)}</span><div class="mini muted">would reach her via ${whyHtml(r.inc)}</div>`
        : '<span class="mini muted">not targeted</span>';
    const logCell = (r) => !log ? '<span class="mini muted">—</span>'
      : !r.log ? (r.state === "off" ? '<span class="mini muted">no verdicts (Off)</span>' : pill(0, "zero"))
        : `${r.log.blocked ? `${pill(r.log.blocked, "red")} blocked` : ""}${r.log.blocked && r.log.interrupted ? " · " : ""}${r.log.interrupted ? `${pill(r.log.interrupted, "amber")} interrupted` : ""}`;
    const tbl = `<div class="list-card wo-card">
      <h3 class="wo-h">📋 Policies and how they reach her</h3>
      <div class="chip-filter" style="margin:8px 0 10px">${chips}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>State</th><th>Reaches her via</th><th>Controls</th><th>Log · ${esc(rangeLabel)}</th><th>Forecast</th></tr></thead><tbody>
        ${shown.map((r) => `<tr class="${r.s === "exc" ? "wo-exrow" : r.state === "off" ? "wo-dim" : ""}"><td>${polLink(r)}</td><td>${stateHtml(r.state)}</td><td class="wo-via">${via(r)}</td><td>${controlsHtml(r)}</td><td class="wo-cnt">${logCell(r)}</td><td>${r.state === "ro" && r.s === "inc" ? forecastHtml(r.forecast) : r.state === "off" && r.s === "inc" ? '<span class="mini muted">becomes real when switched On</span>' : '<span class="mini muted">—</span>'}</td></tr>`).join("")
          || `<tr><td colspan="6" class="mini muted" style="padding:14px">Nothing in this filter.</td></tr>`}
      </tbody></table></div>
      <p class="mini muted" style="margin-top:8px">Same include/exclude resolution as ⚖ Compare users — groups expanded transitively, directory roles, guest type. Log and Forecast are this user's own rows from 🚦 Sign-in failures and 🎚 Report-only impact. Policy names open the policy card.</p>
    </div>`;

    // ---- sign-ins + forecast
    let logHtml = "";
    if (log) {
      const rows = log.rows.slice(0, opts.maxRows || 50);
      const sil = `<div class="list-card wo-card">
        <h3 class="wo-h">🚦 Sign-ins Conditional Access stopped · ${esc(rangeLabel)} ${pill(log.rows.length, "red")}</h3>
        ${log.rows.length ? `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>When</th><th>App · client</th><th>Policy</th><th>Result</th><th></th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td class="num">${esc(fmtWhen(r.when))}</td><td>${esc(r.app)}<div class="mini muted">${esc([r.browser || r.client, r.os, r.compliant ? "compliant" : r.managed ? "managed" : r.os ? "unmanaged" : "", [r.city, r.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</div></td>
            <td>${r.policies.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>`).join("<br>")}</td>
            <td><span class="wo-res ${r.interrupted ? "int" : "blk"}">${r.interrupted ? "Interrupted" : "Blocked"}</span><div class="mini muted">${esc(r.failureReason || "")}${r.errorCode != null ? ` · ${esc(r.errorCode)}` : ""}</div></td>
            <td><button class="fchip" data-wo-replay="${esc(r.id)}" title="Prefill 🧪 What-If from this sign-in">🧪 Replay</button></td></tr>`).join("")}
        </tbody></table></div>${log.rows.length > rows.length ? `<p class="mini muted" style="margin-top:6px">${log.rows.length - rows.length} more — export CSV for all.</p>` : ""}`
          : `<p class="mini muted">Nothing stopped her: ${log.total} sign-in${log.total === 1 ? "" : "s"} in the window, ${log.passed} passed every enforced policy.</p>`}
        <p class="mini muted" style="margin-top:8px">${log.total} sign-ins in the window · ${log.passed} passed</p>
      </div>`;
      const ro = log.ro;
      const items = [];
      if (fc && fc.block.length) fc.block.forEach((p) => items.push(`<div class="wo-callout bad"><b>Locked out</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span> would deny ${p.failure} of her sign-ins${(p.denyWhy || []).length ? `: ${p.denyWhy.slice(0, 3).map((d) => `${esc(d.what)}${d.n > 1 ? ` ×${d.n}` : ""}`).join("; ")}` : ""}${(p.samples || []).length ? `<div class="mini muted">e.g. ${p.samples.slice(0, 2).map((s) => esc([s.app, s.browser || s.client, s.os, s.compliant ? "compliant" : s.os ? "unmanaged" : "", [s.city, s.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))).join(" — ")}</div>` : ""}</div>`));
      if (fc && fc.prompt.length) fc.prompt.forEach((p) => items.push(`<div class="wo-callout"><b>Extra prompts</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span> would stop ${p.interrupted} sign-in${p.interrupted === 1 ? "" : "s"} for an extra step${(p.riskWhy || []).length ? ` (${p.riskWhy.map((d) => `${esc(d.what)} ×${d.n}`).join(", ")})` : ""}.</div>`));
      if (ro) ro.policies.filter((p) => !p.failure && !p.interrupted && p.success).forEach((p) => items.push(`<div class="wo-callout ok"><b>No change</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>: ${p.success} sign-in${p.success === 1 ? "" : "s"} already satisfied it.</div>`));
      const silent = res.rows.filter((r) => r.state === "ro" && r.s === "inc" && r.forecast && r.forecast.nodata);
      if (silent.length) items.push(`<div class="wo-callout"><b>No data</b> — ${silent.map((r) => `<span class="pol-link" data-polid="${esc(r.id)}">${esc(r.seq || r.name)}</span>`).join(", ")} reach${silent.length === 1 ? "es" : ""} her but evaluated none of her sign-ins in the window. Not evidence of safety.</div>`);
      const fch = `<div class="list-card wo-card">
        <h3 class="wo-h">🎚 If everything in report-only went live today</h3>
        ${items.join("") || `<p class="mini muted">${c.ro ? "No report-only verdict on her sign-ins in this window." : "No report-only policy reaches her."}</p>`}
        <p class="mini muted" style="margin-top:8px">Worst case first, per policy, from the report-only verdicts on her own sign-ins. Zero traffic on a policy is shown as no data, never as safe.</p>
      </div>`;
      logHtml = `<div class="wo-split">${sil}${fch}</div>`;
    } else {
      logHtml = `<div class="list-card wo-card"><div class="run-prompt" style="padding:24px 20px"><p class="mini muted">The sign-in half was not read — ${esc(opts.logSkipped || "sign-in log not available")}.</p></div></div>`;
    }
    return head + ladderHtml + tbl + logHtml;
  }

  // ------------------------------------------------------------- csv --
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(res) {
    const H = ["ca", "policy", "state", "assignment", "via", "how", "controls", "blocked", "interrupted", "ro_would_block", "ro_would_prompt", "ro_no_change"];
    const L = [H.join(",")];
    res.rows.forEach((r) => L.push([
      r.seq, r.name, STATE_LABEL[r.state], r.s === "inc" ? "included" : r.s === "exc" ? "excluded" : "not targeted",
      r.s === "exc" ? (r.exc || {}).text : (r.inc || {}).text, r.s === "exc" ? (r.exc || {}).how || "" : (r.inc || {}).how || "",
      (r.controls || []).join(" " + (r.op || ",") + " "),
      r.log ? r.log.blocked : "", r.log ? r.log.interrupted : "",
      r.forecast && !r.forecast.nodata ? r.forecast.failure : "", r.forecast && !r.forecast.nodata ? r.forecast.interrupted : "", r.forecast && !r.forecast.nodata ? r.forecast.success : "",
    ].map(csvCell).join(",")));
    return L.join("\n");
  }

  // ------------------------------------------------------------ markdown --
  function toMd(res, meta = {}) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const u = res.user, c = res.counts, log = res.log, fc = res.forecast;
    const L = [`# Who is ${e(u.name)} to Conditional Access — ${e(meta.tenant || "")}`, "", (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy("Generated") : "", ""];
    L.push(`**${e(u.name)}** (${e(u.upn)}) — ${u.guest ? "guest" : "member"}, ${u.enabled ? "enabled" : "DISABLED"}${u.dept ? `, ${e(u.dept)}` : ""}${u.licence ? `, ${u.licence.p2 ? "Entra ID P2" : u.licence.p1 ? "Entra ID P1" : "no Entra ID P1/P2"}` : ""}${u.methods ? `, MFA methods: ${u.methods.length ? e(u.methods.join(", ")) : "none"}` : ""}`, "");
    L.push("## At a glance", "");
    L.push(`- **Deployment stage:** ${res.stage.kind === "none" ? (res.ladder.hasDg ? "not in any deploy group" : "the active baseline has no deploy groups") : res.stage.groups.map((g) => `${e(g.name)} (${e(g.how)})`).join(", ")}`);
    L.push(`- **Policies reaching her:** ${c.reach} of ${c.total} — ${c.on} enforced, ${c.ro} report-only, ${c.off} off${c.excluded ? `; excluded from ${c.excluded}` : ""}`);
    if (log) L.push(`- **Sign-ins CA stopped (${e(meta.rangeLabel || "window")}):** ${log.rows.length} — ${log.blocked} blocked, ${log.interrupted} interrupted, of ${log.total} sign-ins read`);
    if (fc) L.push(`- **If report-only went live:** ${fc.worst === "block" ? `LOCKED OUT by ${fc.block.map((p) => e(p.name)).join(", ")}` : fc.worst === "prompt" ? `extra prompts from ${fc.prompt.map((p) => e(p.name)).join(", ")}` : fc.worst === "clean" ? "no change" : "no data"}`);
    L.push("", "## Deployment groups", "", "| Group | Status | How |", "| --- | --- | --- |");
    res.ladder.deploy.concat(res.ladder.persona).forEach((r) => L.push(`| ${e(r.name)} | ${r.inMember ? "IN" : r.exists === false ? "not in tenant" : "not in"} | ${e(r.how || "")} |`));
    if (res.exclusions.length) {
      L.push("", "### Exclusion groups she is in", "", "| Group | How | Excluded from | Bypass |", "| --- | --- | --- | --- |");
      res.exclusions.forEach((x) => L.push(`| ${e(x.name)} | ${e(x.how)} | ${x.policies.map((p) => `${e(p.seq || p.name)}${p.state === "on" ? "" : ` (${STATE_LABEL[p.state]})`}`).join(", ") || "(no policy references it)"} | ${x.bypass ? "**YES — enforced policy**" : "no"} |`));
    }
    L.push("", "## Policies", "", `| CA | Policy | State | Assignment | Via | Controls | Blocked | Interrupted | Forecast |`, "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    res.rows.forEach((r) => {
      const why = r.s === "exc" ? `EXCLUDED — ${e((r.exc || {}).text)}${(r.exc || {}).how ? ` (${e(r.exc.how)})` : ""}` : r.s === "inc" ? `${e((r.inc || {}).text)}${(r.inc || {}).how && r.inc.how !== "member" ? ` (${e(r.inc.how)})` : ""}` : "·";
      const fcs = r.forecast ? (r.forecast.nodata ? "no data" : `${r.forecast.failure} block / ${r.forecast.interrupted} prompt / ${r.forecast.success} ok`) : "";
      L.push(`| ${e(r.seq)} | ${e(r.name)} | ${STATE_LABEL[r.state]} | ${r.s === "inc" ? "✓" : r.s === "exc" ? "✗" : "·"} | ${why} | ${e((r.controls || []).join(` ${r.op || ","} `))} | ${r.log ? r.log.blocked : ""} | ${r.log ? r.log.interrupted : ""} | ${fcs} |`);
    });
    if (log) {
      L.push("", `## Sign-ins Conditional Access stopped (${e(meta.rangeLabel || "window")})`, "");
      if (!log.rows.length) L.push(`None — ${log.total} sign-ins, ${log.passed} passed.`);
      else {
        L.push("| When | App | Client | Policy | Result | Reason |", "| --- | --- | --- | --- | --- | --- |");
        log.rows.forEach((r) => L.push(`| ${e(r.when)} | ${e(r.app)} | ${e([r.browser || r.client, r.os, [r.city, r.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))} | ${r.policies.map((p) => e(p.name)).join("; ")} | ${r.interrupted ? "interrupted" : "BLOCKED"} | ${e(r.failureReason)}${r.errorCode != null ? ` (${r.errorCode})` : ""} |`));
      }
      L.push("", "## If everything in report-only went live", "");
      if (fc && fc.block.length) fc.block.forEach((p) => L.push(`- **LOCKED OUT** — ${e(p.name)} would deny ${p.failure} sign-in(s)${(p.denyWhy || []).length ? `: ${p.denyWhy.map((d) => `${e(d.what)} ×${d.n}`).join("; ")}` : ""}`));
      if (fc && fc.prompt.length) fc.prompt.forEach((p) => L.push(`- **Extra prompts** — ${e(p.name)} would stop ${p.interrupted} sign-in(s) for an extra step`));
      if (log.ro) log.ro.policies.filter((p) => !p.failure && !p.interrupted && p.success).forEach((p) => L.push(`- No change — ${e(p.name)} (${p.success} sign-ins already satisfied it)`));
      if (!(fc && (fc.block.length || fc.prompt.length)) && !(log.ro && log.ro.policies.length)) L.push(c.ro ? "No report-only verdict on her sign-ins in this window — no data, not safety." : "No report-only policy reaches her.");
    }
    L.push("", "✓ included · ✗ excluded · `·` not targeted. Resolution as ⚖ Compare users; log rows as 🚦 Sign-in failures; forecast as 🎚 Report-only impact.");
    return L.join("\n");
  }

  return { analyze, render, toMd, toCsv, buildLookup, stateFor, ladderOf, exclusionsOf, logOf };
})();
