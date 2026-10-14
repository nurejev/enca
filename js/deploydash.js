// ======================================================================
// 📊 Deployment dashboard (T54, beta 32505) — the TUNO T28 rollout dashboard
// carried over to Conditional Access. Mihai, 12 Oct 2026: "just like the TUNO
// deployment dashboard in T28, we will need a deployment dashboard for ENCA.
// focus on the deployment groups and the members in there. also exclusions
// should have a piechart" — then "there should also be a total user count,
// because we also want to know how many are being left out", and the
// chosen shape off the mockup: option A (four charts over a group-by-group
// table) with B's go-live readiness column folded in.
//
// The waves of T28 are the CAD-SEC-U-DG-* deploy groups here. The page
// answers, top to bottom:
//
//   coverage   every ENABLED user in the tenant against the deploy groups'
//              members (transitive): in a deploy group, or LEFT OUT of every
//              one. The tenant total is what makes left out a number instead
//              of "whoever happened to be read". Disabled accounts are
//              counted apart and never as left out.
//   route in   direct member · nested through a group inside the deploy group
//   policies   every policy that includes a deploy group, by state
//   exclusions the members an exclusion takes back out of at least one policy
//              on their group, by what: a CA*-Exclusion group, BreakGlass,
//              another group, a direct user exclusion, a directory role —
//              a PIE, with direct labels (the ask)
//   per group  the same four side by side, plus 🌊's go-live readiness for
//              the report-only policies on the group, and what needs a look
//   left out   the one LIST this page makes itself: each left-out user, her
//              UPN and type. Every other count is a drill-through into 🌊 Who is
//              the wave (the group picked) or 🕵 Who is Anna — the per-member
//              answer already has a home and one list in three places would
//              drift.
//
// THIS TOOL READS THE TENANT AND NOTHING ELSE. The deploy groups are what the
// tenant calls CAD-SEC-U-DG-* (the framework's convention, the same test as
// Baseline.isDeployGroup) plus the names the active catalog gives its deploy
// groups. It does not read 🌍 Fill from regions' region list, its ⚙ Settings
// or its rules — Mihai, 13 Oct 2026: "these are separate things and should
// be separate from each other, no dependencies". Who is left out is this
// page's answer; where each one belongs is Fill's own question, asked there.
//
// Readiness is BEHIND A BUTTON. The group, user, policy and exclusion reads
// come back in seconds; 🌊's read is the sign-in window plus a member-by-
// policy evaluation per group, minutes on a large tenant. The page is useful
// without it, so it never waits for it.
//
// Pure: no DOM, no Graph. build(input) → model; html(model, opts) is the
// screen (opts.app) AND the export (no script, inline CSS, light and dark by
// the reader's system) — the same text, as T28 does it. app.js reads.
// ======================================================================
const DeployDash = (() => {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s == null ? "" : s).toLowerCase();
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const pct = (n, of) => { if (!of) return "—"; const p = (n / of) * 100; return p > 0 && p < 0.5 ? "<1%" : `${Math.round(p)}%`; };
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : (many || one + "s")}`;
  const csvCell = (s) => { const v = String(s == null ? "" : s); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const short = (n) => String(n || "").replace(/^CAD-SEC-U-DG-/i, "DG-");
  const caNumOf = (name) => { const m = String(name || "").match(/\bCA\d{3,4}[A-Za-z]?\b/); return m ? m[0] : ""; };

  // The deploy groups in the framework's order first, then whatever else the
  // tenant calls CAD-SEC-U-DG-*, alphabetically. A group's key is the part
  // after -DG- (GLO, INT, …); keyOf and sortNames are what app.js uses to
  // line the tenant's groups up, so the order is decided in one place.
  const ORDER = ["GLO", "INT", "EXT", "GUESTUSERS", "DevOps", "ADM", "SA"];
  const keyOf = (name) => String(name || "").replace(/^.*-DG-/i, "");
  const rank = (name) => { const i = ORDER.findIndex((k) => k.toLowerCase() === keyOf(name).toLowerCase()); return i < 0 ? ORDER.length : i; };
  const sortNames = (names) => [...names].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));

  // The chart series. `c` names a --dd-* colour token; the order is the
  // order in the ring, the legend and the bar.
  const SER = {
    cov:   [{ k: "in", label: "In a deploy group", c: "on" }, { k: "out", label: "Left out of every deploy group", c: "off" }],
    route: [{ k: "nested", label: "Nested via a group inside", c: "on" }, { k: "direct", label: "Direct", c: "blue" }],
    pol:   [{ k: "enf", label: "Enforced", c: "on" }, { k: "ro", label: "Report-only", c: "report" }, { k: "off", label: "Off", c: "na" }],
    excl:  [{ k: "ca", label: "CA*-Exclusion group", c: "c2" }, { k: "bg", label: "BreakGlass", c: "c1" }, { k: "group", label: "Another group", c: "c3" }, { k: "user", label: "User, direct", c: "c4" }, { k: "role", label: "Directory role", c: "c5" }],
    taken: [{ k: "in", label: "Reached", c: "on" }, { k: "ex", label: "Excluded", c: "c2" }],
  };
  const VERDICT = { notyet: "NOT YET", friction: "friction only", ready: "ready", nodata: "no data" };

  // Which exclusion route wins when a member has several: the one named first.
  const RANK = { bg: 0, ca: 1, group: 2, user: 3, role: 4 };

  // ------------------------------------------------------------- build --
  // input: { users, groups, policies, exclGroups, roleMembers, names,
  //          readiness, readAt }
  function build(input) {
    const I = input || {};
    const users = I.users || [];
    const groups = (I.groups || []).filter((g) => g);
    const names = I.names || {};
    const exclGroups = I.exclGroups || new Map();
    const roleMembers = I.roleMembers || new Map();
    const readiness = I.readiness || new Map();

    // --- the tenant: enabled users are the population; disabled apart
    const enabled = users.filter((u) => u.accountEnabled !== false);
    const disabled = users.length - enabled.length;
    const byId = new Map(enabled.map((u) => [u.id, u]));
    const anyId = new Set(users.map((u) => u.id));

    // --- who is in any deploy group (transitive)
    const inAny = new Set();
    const G = groups.map((g) => {
      const direct = g.direct || new Set(), nested = g.nested || new Set();
      const all = new Set([...direct, ...nested]);
      all.forEach((id) => inAny.add(id));
      return Object.assign({}, g, { all });
    });

    // --- coverage over the ENABLED users
    const cov = { in: 0, out: 0 };
    const leftOut = [];
    enabled.forEach((u) => {
      if (inAny.has(u.id)) { cov.in++; return; }
      cov.out++;
      leftOut.push({ id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName, type: lc(u.userType) === "guest" ? "guest" : "member" });
    });
    leftOut.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // --- the policies: which deploy groups each includes, by state
    const pols = (I.policies || []).map((p) => ({
      id: p.id, name: p.name, seq: caNumOf(p.name) || p.name,
      state: p.state === "enabled" ? "enf" : p.state === "enabledForReportingButNotEnforced" ? "ro" : "off",
      inc: new Set(p.includeGroups || []), excGroups: p.excludeGroups || [], excUsers: p.excludeUsers || [], excRoles: p.excludeRoles || [],
    }));
    const groupById = new Map(G.filter((g) => g.id).map((g) => [g.id, g]));
    const polTotal = { enf: 0, ro: 0, off: 0 };
    const polSeen = new Set();

    // --- per group
    const exclTotal = { ca: 0, bg: 0, group: 0, user: 0, role: 0 };
    const exclUsersAll = new Map();   // userId → strongest route across the groups
    const exclGroupUse = new Map();   // exclusion group id → { n members of a DG taken out, policies:Set }
    const rows = G.map((g) => {
      const direct = g.direct || new Set(), nested = g.nested || new Set();
      const members = g.all.size;
      const route = { nested: nested.size, direct: direct.size };
      // policies on it
      const on = g.id ? pols.filter((p) => p.inc.has(g.id)) : [];
      const pol = { enf: 0, ro: 0, off: 0 };
      on.forEach((p) => { pol[p.state]++; if (!polSeen.has(p.id)) { polSeen.add(p.id); polTotal[p.state]++; } });
      // exclusions: a member an exclusion takes out of at least one enforced
      // or report-only policy on this group — by what, first route wins
      const exclBy = { ca: 0, bg: 0, group: 0, user: 0, role: 0 };
      const taken = new Map();   // userId → kind
      on.filter((p) => p.state !== "off").forEach((p) => {
        p.excGroups.forEach((gid) => {
          const eg = exclGroups.get(gid); if (!eg) return;
          const nm = eg.name || names[gid] || gid;
          const kind = /breakglass|break-glass|emergency/i.test(nm) ? "bg" : /\bCA\d{3,4}[A-Za-z]?-Exclusion\b/i.test(nm) ? "ca" : "group";
          let n = 0;
          (eg.members || new Set()).forEach((id) => { if (!g.all.has(id)) return; n++; const cur = taken.get(id); if (!cur || RANK[kind] < RANK[cur]) taken.set(id, kind); });
          const u = exclGroupUse.get(gid) || exclGroupUse.set(gid, { n: new Set(), policies: new Set() }).get(gid);
          (eg.members || new Set()).forEach((id) => { if (g.all.has(id)) u.n.add(id); });
          u.policies.add(p.seq || p.name);
          void n;
        });
        p.excUsers.forEach((id) => { if (g.all.has(id)) { const cur = taken.get(id); if (!cur || RANK.user < RANK[cur]) taken.set(id, "user"); } });
        p.excRoles.forEach((rt) => { (roleMembers.get(rt) || new Set()).forEach((id) => { if (g.all.has(id)) { const cur = taken.get(id); if (!cur || RANK.role < RANK[cur]) taken.set(id, "role"); } }); });
      });
      taken.forEach((kind, id) => { exclBy[kind]++; const cur = exclUsersAll.get(id); if (!cur || RANK[kind] < RANK[cur]) exclUsersAll.set(id, kind); });
      const excl = taken.size;
      // needs a look — what this page can see without 🌊
      const look = [];
      const twin = g.key === "INT" ? G.find((x) => x.key === "EXT") : g.key === "EXT" ? G.find((x) => x.key === "INT") : null;
      if (twin) { let n = 0; g.all.forEach((id) => { if (twin.all.has(id)) n++; }); if (n) look.push({ kind: "two", n, text: `${fmt(n)} in both INT and EXT` }); }
      let dis = 0; g.all.forEach((id) => { if (!byId.has(id) && anyId.has(id)) dis++; }); if (dis) look.push({ kind: "disabled", n: dis, text: `${fmt(dis)} disabled` });
      const onLive = on.filter((p) => p.state === "enf");
      if (excl && onLive.length) { let n = 0; taken.forEach((kind, id) => { if (onLive.some((p) => p.excGroups.some((gid) => (exclGroups.get(gid) || {}).members?.has(id)) || p.excUsers.includes(id))) n++; }); if (n) look.push({ kind: "bypass", n, text: `${fmt(n)} standing bypass` }); }
      const rd = readiness.get(g.key) || null;
      return { key: g.key, name: g.name, id: g.id, found: !!g.id, dynamic: !!g.dynamic, nestedGroups: (g.children || []).length, members, route, pol, on: on.map((p) => ({ id: p.id, name: p.name, seq: p.seq, state: p.state })),
        live: pol.enf > 0, excl, exclBy, look, readiness: rd };
    });
    // the tenant-wide pie counts a PERSON once, by her strongest route; the
    // per-group bars count her in every group she is taken out of
    exclUsersAll.forEach((kind) => { exclTotal[kind]++; });
    const exclMembers = exclUsersAll.size;

    // --- route totals over all deploy-group members (a user in two groups
    //     counts by her strongest route once per group — the bar is per group)
    const route = { nested: 0, direct: 0 };
    rows.forEach((r) => { route.nested += r.route.nested; route.direct += r.route.direct; });

    // --- the exclusion groups on the policies that name a deploy group
    const exclList = [...exclGroups.entries()].map(([gid, eg]) => {
      const u = exclGroupUse.get(gid);
      const usedBy = pols.filter((p) => p.excGroups.includes(gid));
      return { id: gid, name: eg.name || names[gid] || gid, members: (eg.members || new Set()).size, usedBy: usedBy.map((p) => `${p.seq || p.name} · ${{ enf: "enforced", ro: "report-only", off: "off" }[p.state]}`),
        live: usedBy.some((p) => p.state === "enf"), inDg: u ? u.n.size : 0, orphan: !usedBy.length };
    }).sort((a, b) => b.inDg - a.inDg || b.members - a.members);
    const biggest = exclList.filter((e) => e.inDg).slice(0, 1).map((e) => e.id);

    return {
      readAt: I.readAt || null, tenant: I.tenant || "",
      total: { users: users.length, enabled: enabled.length, disabled, guests: enabled.filter((u) => lc(u.userType) === "guest").length },
      cov, leftOut, route, pol: polTotal, excl: exclTotal, exclMembers,
      groups: rows, exclList, biggest,
      readinessRead: readiness.size > 0, readinessAt: I.readinessAt || null,
      notFound: rows.filter((r) => !r.found).map((r) => r.name),
    };
  }
  // Readiness per group, from a 🌊 result: the report-only forecasts.
  function readinessOf(waveRes) {
    const roRows = (waveRes && waveRes.rows || []).filter((r) => r.state === "ro" && r.forecast);
    if (!roRows.length) return { ro: 0, locked: 0, prompted: 0, unchanged: 0, silent: 0, verdict: "none", policies: [] };
    const lockedIds = new Set(), promptedIds = new Set();
    roRows.forEach((r) => { (r.forecast.blocked || []).forEach((m) => lockedIds.add(m.id || m.upn)); (r.forecast.prompted || []).forEach((m) => promptedIds.add(m.id || m.upn)); });
    promptedIds.forEach((id) => { if (lockedIds.has(id)) promptedIds.delete(id); });
    const worst = roRows.some((r) => r.forecast.verdict === "notyet") ? "notyet" : roRows.some((r) => r.forecast.verdict === "friction") ? "friction" : roRows.every((r) => r.forecast.verdict === "ready") ? "ready" : "nodata";
    const silent = Math.max(...roRows.map((r) => r.forecast.silent || 0));
    const unchanged = Math.max(...roRows.map((r) => r.forecast.unchanged || 0));
    return { ro: roRows.length, locked: lockedIds.size, prompted: promptedIds.size, unchanged, silent, verdict: worst,
      policies: roRows.map((r) => ({ name: r.name, seq: r.seq, blocked: (r.forecast.blocked || []).length, prompted: (r.forecast.prompted || []).length, unchanged: r.forecast.unchanged || 0, silent: r.forecast.silent || 0, verdict: r.forecast.verdict })) };
  }

  // -------------------------------------------------------------- html --
  const col = (c) => `var(--dd-${c})`;
  const total = (defs, counts) => defs.reduce((s, d) => s + (counts[d.k] || 0), 0);
  function donutSvg(defs, counts, size, stroke) {
    size = size || 148; stroke = stroke || 18;
    const T = total(defs, counts), r = (size - stroke) / 2, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
    let off = 0; const gap = T ? 2 / C * T : 0;
    const arcs = defs.map((d) => { const v = counts[d.k] || 0; if (!v) return ""; const len = Math.max(0, v - gap) / T * C;
      const s = `<circle r="${r}" cx="${cx}" cy="${cy}" fill="none" stroke="${col(d.c)}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-(off / T * C)).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(d.label)}: ${fmt(v)} (${pct(v, T)})</title></circle>`; off += v; return s; }).join("");
    return `<svg class="dd-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="donut"><circle r="${r}" cx="${cx}" cy="${cy}" fill="none" stroke="var(--dd-track)" stroke-width="${stroke}"/>${arcs}</svg>`;
  }
  // A pie with the share written on every slice big enough to carry it.
  function pieSvg(defs, counts, size) {
    size = size || 148;
    const T = total(defs, counts), cx = size / 2, cy = size / 2, r = size / 2 - 4;
    if (!T) return `<svg class="dd-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="pie"><circle r="${r}" cx="${cx}" cy="${cy}" fill="var(--dd-track)"/></svg>`;
    let a0 = -Math.PI / 2;
    const parts = defs.map((d) => { const v = counts[d.k] || 0; if (!v) return ""; const a1 = a0 + v / T * 2 * Math.PI; const big = a1 - a0 > Math.PI ? 1 : 0;
      const full = v === T;
      const p = full ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z` : `M${cx},${cy} L${(cx + r * Math.cos(a0)).toFixed(2)},${(cy + r * Math.sin(a0)).toFixed(2)} A${r},${r} 0 ${big} 1 ${(cx + r * Math.cos(a1)).toFixed(2)},${(cy + r * Math.sin(a1)).toFixed(2)} Z`;
      const am = (a0 + a1) / 2, share = v / T;
      const label = share > 0.1 ? `<text x="${(cx + r * 0.62 * Math.cos(am)).toFixed(1)}" y="${(cy + r * 0.62 * Math.sin(am)).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#fff">${pct(v, T)}</text>` : "";
      const s = `<path d="${p}" fill="${col(d.c)}" stroke="var(--dd-card)" stroke-width="2"><title>${esc(d.label)}: ${fmt(v)} (${pct(v, T)})</title></path>${label}`; a0 = a1; return s; }).join("");
    return `<svg class="dd-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="pie">${parts}</svg>`;
  }
  const legend = (defs, counts) => { const T = total(defs, counts); return `<ul class="dd-leg">${defs.map((d) => `<li><i class="dd-sw" style="background:${col(d.c)}"></i><span>${esc(d.label)}</span><b>${fmt(counts[d.k] || 0)}</b><small>${pct(counts[d.k] || 0, T)}</small></li>`).join("")}</ul>`; };
  function bar(defs, counts, lead) {
    const T = total(defs, counts); if (!T) return '<span class="mini muted">—</span>';
    const spans = defs.map((d) => counts[d.k] ? `<span style="flex:${counts[d.k]} 0 0;background:${col(d.c)}"></span>` : "").join("");
    return `<div class="dd-cell"><div class="dd-bar" title="${esc(defs.map((d) => `${fmt(counts[d.k] || 0)} ${d.label.toLowerCase()}`).join(" · "))}">${spans}</div><b>${pct(counts[lead || defs[0].k], T)}</b></div>`;
  }
  function card(title, defs, counts, caption, src, link, o) {
    const T = total(defs, counts);
    const chart = o && o.pie ? `<div class="dd-donut">${pieSvg(defs, counts)}</div>` : `<div class="dd-donut">${donutSvg(defs, counts)}<div class="dd-center"><b>${pct(counts[defs[0].k], T)}</b><small>${esc(caption)}</small></div></div>`;
    const btn = link && o && o.app ? `<button type="button" class="dd-link" ${link.attr || ""}>${esc(link.text)} →</button>` : "";
    return `<section class="dd-card" aria-label="${esc(title)}"><h4>${esc(title)}</h4>${chart}${legend(defs, counts)}${btn}<p class="dd-src">${esc(src)}</p></section>`;
  }
  const pill = (text, kind) => `<span class="dd-pill${kind ? ` ${kind}` : ""}">${esc(text)}</span>`;
  const stateChip = (r) => r.live ? `<span class="dd-state live">Live · ${plural(r.pol.enf, "enforced", "enforced")}</span>` : r.pol.ro ? `<span class="dd-state ro">Report-only · ${r.pol.ro}</span>` : r.pol.off ? '<span class="dd-state off">Off only</span>' : '<span class="dd-state off">Not targeted</span>';
  function readinessCell(r, m, o) {
    if (!r.pol.ro) return stateChip(r);
    const rd = r.readiness;
    if (!rd) return `${stateChip(r)}<div class="mini muted">${m.readinessRead ? "not read for this group" : (o.app ? "🌊 Read readiness →" : "readiness not read")}</div>`;
    if (rd.verdict === "none") return `${stateChip(r)}<div class="mini muted">no forecast</div>`;
    const text = rd.verdict === "notyet" ? `${fmt(rd.locked)} locked out · ${fmt(rd.prompted)} prompted` : rd.verdict === "friction" ? `0 locked out · ${fmt(rd.prompted)} prompted` : rd.verdict === "ready" ? `${fmt(rd.unchanged)} evaluated, nobody stopped` : `silent — no data (${fmt(rd.silent)} without sign-ins)`;
    const kind = rd.verdict === "notyet" ? "bad" : rd.verdict === "friction" ? "warn" : rd.verdict === "ready" ? "ok" : "muted";
    const open = o.app && r.id ? ` data-dd-wave="${esc(r.id)}" title="Open 🌊 Who is the wave on this group"` : "";
    return `${stateChip(r)}<div style="margin-top:4px"><span class="dd-pill ${kind}"${open}>${esc(VERDICT[rd.verdict])} · ${esc(text)}</span></div>`;
  }
  function lookCell(r, o) {
    if (!r.look.length) return '<span class="mini muted">—</span>';
    return r.look.map((l) => `<span class="dd-pill ${l.kind === "two" || l.kind === "disabled" ? "bad" : l.kind === "bypass" ? "warn" : ""}"${o.app && r.id && l.kind !== "info" ? ` data-dd-wave="${esc(r.id)}" data-dd-wavefilter="${l.kind === "bypass" ? "bypass" : l.kind === "two" ? "twowaves" : "look"}"` : ""}>${esc(l.text)}</span>`).join(" ");
  }

  function covStrip(m, o) {
    const c = m.cov, T = m.total.enabled;
    return `<div class="dd-cov"><div><div class="dd-big">${fmt(T)}<small>enabled users in the tenant</small></div></div><div>
      <div class="dd-bar dd-bar-lg" title="${fmt(c.in)} in a deploy group · ${fmt(c.out)} left out of every deploy group">${SER.cov.map((d) => c[d.k] ? `<span style="flex:${c[d.k]} 0 0;background:${col(d.c)}"></span>` : "").join("")}</div>
      <div class="dd-kl"><span><i style="background:${col("on")}"></i><b>${fmt(c.in)}</b> in a deploy group · ${pct(c.in, T)}</span>
      <span class="dd-out"><i style="background:${col("off")}"></i><b>${fmt(c.out)}</b> left out of every deploy group · ${pct(c.out, T)}${o.app && c.out ? ` <button type="button" class="dd-link" data-dd-list="leftout">list them →</button>` : ""}</span>
      <span class="muted">${fmt(m.total.disabled)} disabled, not counted · ${fmt(m.total.guests)} guests counted</span></div></div></div>`;
  }

  function groupsTable(m, o) {
    const rows = (o.group ? m.groups.filter((r) => r.key === o.group) : m.groups);
    const name = (r) => o.app && r.id ? `<button type="button" class="dd-link dd-name" data-dd-group="${esc(r.id)}" title="Open this group in 👥 CA groups">${esc(r.name)}</button>` : `<b>${esc(r.name)}</b>`;
    const count = (r, filter, n) => o.app && r.id && n ? `<button type="button" class="dd-link" data-dd-wave="${esc(r.id)}"${filter ? ` data-dd-wavefilter="${filter}"` : ""} title="Open 🌊 Who is the wave on this group">${fmt(n)}</button>` : fmt(n);
    return `<section class="dd-panel"><div class="dd-panel-head"><h4>Group by group</h4><span class="mini muted">Same colours as the charts · hover a bar for its counts · a count opens 🌊 with the group picked</span></div>
      <div class="dd-twrap"><table class="cg-table dd-table"><thead><tr><th>Deploy group</th><th class="dd-num">Members</th><th>Route in</th><th>Policies on it</th><th>Go-live readiness</th><th>Taken out by exclusions</th><th>Needs a look</th></tr></thead><tbody>
      ${rows.map((r) => `<tr${r.found ? "" : ' class="dd-missing"'}><td>${name(r)}<div class="mini muted">${r.found ? (r.nestedGroups ? esc(plural(r.nestedGroups, "group nested inside", "groups nested inside")) : "no group nested inside") : "not in this tenant"}${r.dynamic ? " · dynamic" : ""}</div></td>
        <td class="dd-num">${count(r, "", r.members)}</td><td>${bar(SER.route, r.route)}</td><td>${bar(SER.pol, r.pol)}</td><td>${readinessCell(r, m, o)}</td>
        <td>${r.members ? `${bar(SER.taken, { in: r.members - r.excl, ex: r.excl }, "ex")}${r.excl ? `<div class="mini muted">${count(r, "bypass", r.excl)} excluded</div>` : ""}` : '<span class="mini muted">—</span>'}</td><td>${lookCell(r, o)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">Readiness is 🌊 Who is the wave's verdict for the report-only policies on the group: locked out (named there), prompted, unchanged, silent — silent is no data, never safety. A live group with nothing left in report-only shows its enforced count. Route in and reach count members once per group; a person in two groups is in both rows.</p></section>`;
  }

  function leftOutTable(m, o) {
    const rows = m.leftOut;
    const cap = o.app ? 300 : 2000;
    const shown = rows.slice(0, cap);
    const head = o.app ? `<div class="dd-panel-head"><div><h4>Left out — ${plural(m.leftOut.length, "enabled user")} in no deploy group</h4><p class="mini muted" style="margin:0">${rows.length > cap ? `first ${fmt(cap)} of ${fmt(rows.length)} — the CSV and the HTML export hold all` : plural(rows.length, "row")} · the one list only this page can make</p></div>
      <div class="dd-ctrl"><button type="button" class="btn" data-dd-list="">Close</button></div></div>`
      : `<h4>Left out — ${plural(m.leftOut.length, "enabled user")} in no deploy group</h4>`;
    if (!rows.length) return `<section class="dd-panel dd-list">${head}<p class="mini muted">Nobody — every enabled user is in a deploy group.</p></section>`;
    const who = (r) => o.app ? `<a href="#" class="dd-who" data-dd-who="${esc(r.upn)}" title="Open 🕵 Who is Anna to CA">${esc(r.name)}</a>` : `<b>${esc(r.name)}</b>`;
    return `<section class="dd-panel dd-list" aria-label="Left out">${head}
      <div class="dd-twrap"><table class="cg-table dd-table"><thead><tr><th>Member</th><th>UPN</th><th>Type</th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td>${who(r)}</td><td>${esc(r.upn)}</td><td>${esc(r.type)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="mini muted" style="margin:8px 0 0">Who is left out is this page's answer; which group each one belongs in is the deployment's own decision — 👥 CA groups adds members, and a name opens 🕵 for her whole picture.</p></section>`;
  }

  function exclTable(m, o) {
    const rows = m.exclList;
    if (!rows.length) return "";
    const empty = rows.filter((r) => !r.members).length, orphan = rows.filter((r) => r.orphan && r.members).length;
    const body = `<div class="dd-twrap"><table class="cg-table dd-table"><thead><tr><th>Group</th><th class="dd-num">Members</th><th>Used by</th><th class="dd-num">Of which in a deploy group</th><th></th></tr></thead><tbody>
      ${rows.filter((r) => r.members).slice(0, o.app ? 60 : 500).map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="dd-num">${fmt(r.members)}</td><td>${r.usedBy.length ? esc(r.usedBy.slice(0, 3).join(" · ")) + (r.usedBy.length > 3 ? ` · +${r.usedBy.length - 3}` : "") : '<span class="muted">no policy</span>'}</td><td class="dd-num">${fmt(r.inDg)}</td><td>${r.orphan ? pill("orphan — nothing uses it", "bad") : m.biggest.includes(r.id) ? pill("largest hole", "warn") : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
    const sum = `${plural(rows.length, "group")}, ${fmt(empty)} empty${orphan ? `, ${plural(orphan, "orphan")} with members` : ""}`;
    return o.app ? `<details class="dd-panel dd-fold"><summary>Exclusion groups on the policies — ${esc(sum)}</summary>${body}</details>` : `<section class="dd-panel"><h4>Exclusion groups on the policies — ${esc(sum)}</h4>${body}</section>`;
  }

  function html(m, opts) {
    const o = opts || {};
    const g1 = o.group ? m.groups.find((r) => r.key === o.group) : null;
    const route = g1 ? g1.route : m.route, pol = g1 ? g1.pol : m.pol, excl = g1 ? g1.exclBy : m.excl;
    const exclN = g1 ? g1.excl : m.exclMembers;
    const chips = o.app ? `<div class="dd-chips" role="group" aria-label="Group filter"><button type="button" class="fchip${o.group ? "" : " active"}" data-dd-chip="">All groups</button>${m.groups.filter((r) => r.found).map((r) => `<button type="button" class="fchip${o.group === r.key ? " active" : ""}" data-dd-chip="${esc(r.key)}">${esc(short(r.name))}${r.live ? " <small>live</small>" : r.pol.ro ? " <small>report-only</small>" : ""}</button>`).join("")}</div>` : (g1 ? `<p class="mini"><b>Group: ${esc(g1.name)}</b></p>` : "");
    const out = m.cov.out;
    const cards = [
      card("Covered · of every enabled user", SER.cov, m.cov, "in a deploy group", "All enabled users (members and guests) against the CAD-SEC-U-DG-* members, transitive. Left out = in none of them.", out ? { text: `${fmt(out)} left out — list them`, attr: 'data-dd-list="leftout"' } : null, o),
      card(g1 ? `Route in · ${short(g1.name)}` : "Route in · how members got there", SER.route, route, "nested", "Direct membership vs. a group nested inside the deploy group.", null, o),
      card(g1 ? `Policies on ${short(g1.name)}` : "Policies on the deploy groups", SER.pol, pol, "enforced", "Every policy that includes a deploy group, by state. Report-only on a live group is the go-live question.", null, o),
      card(g1 ? `Exclusions · ${short(g1.name)}` : "Exclusions · taken back out, by what", SER.excl, excl, "", `Deploy-group members an exclusion removes from at least one enforced or report-only policy on their group — ${fmt(exclN)}${g1 ? "" : ` of ${fmt(m.cov.in)}`}. First route wins: BreakGlass, then a CA*-Exclusion group, another group, a direct user, a role.`, null, Object.assign({ pie: true }, o)),
    ].join("");
    const missing = m.notFound.length ? `<p class="dd-wait bad">Not in this tenant: ${esc(m.notFound.join(", "))} — 👥 CA groups ② Create makes them.</p>` : "";
    const list = o.app && o.list === "leftout" ? leftOutTable(m, o) : "";
    const allLists = !o.app ? leftOutTable(m, o) : "";
    const foot = `<p class="mini muted dd-foot">Group membership and policy reach are separate checks: a deploy-group member is a target, not proof the policy applied. A read time is not a sign-in time. Disabled accounts are counted apart and never as left out. Missing report-only data stays unknown — never counted as safe.</p>`;
    return `<div class="dd">${covStrip(m, o)}${chips}<div class="dd-grid">${cards}</div>${missing}${list}${groupsTable(m, o)}${allLists}${exclTable(m, o)}${foot}</div>`;
  }

  // ------------------------------------------------------------- csv --
  function toCsv(m) {
    const rows = [["deploy_group", "found", "members", "direct", "nested", "enforced", "report_only", "off", "excluded", "excl_breakglass", "excl_ca_group", "excl_other_group", "excl_user", "excl_role", "readiness", "locked_out", "prompted", "needs_a_look"]];
    m.groups.forEach((r) => rows.push([r.name, r.found, r.members, r.route.direct, r.route.nested, r.pol.enf, r.pol.ro, r.pol.off, r.excl, r.exclBy.bg, r.exclBy.ca, r.exclBy.group, r.exclBy.user, r.exclBy.role,
      r.readiness ? VERDICT[r.readiness.verdict] || "" : "", r.readiness ? r.readiness.locked : "", r.readiness ? r.readiness.prompted : "", r.look.map((l) => l.text).join("; ")]));
    rows.push([]); rows.push(["left_out_upn", "name", "type"]);
    m.leftOut.forEach((r) => rows.push([r.upn, r.name, r.type]));
    return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  }

  // ------------------------------------------------------- export html --
  const CSS = `:root{--ink:#12331f;--muted:#5f7a67;--line:#dbe7de;--bg:#f2f7f3;--card:#fff;--soft:#eaf3ec;--green:#1e4729;
--dd-on:#3f7a24;--dd-report:#b8860b;--dd-off:#b04a3a;--dd-blue:#1f4e8f;--dd-na:#cdd8d0;--dd-track:#e4ece6;--dd-card:#fff;
--dd-c1:#3f7a24;--dd-c2:#2f5fb3;--dd-c3:#c2880a;--dd-c4:#b34d17;--dd-c5:#9c2a6a;--warn-bg:#fdf3c9;--warn-fg:#8a6d0b;--bad-bg:#f7e3df;--bad-fg:#8f2f1f;--ok-bg:#e5f3d9;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--ink:#eaf3ec;--muted:#8ca991;--line:#26402f;--bg:#0c1811;--card:#14261a;--soft:#1a2f21;--green:#7fc98f;
--dd-on:#7fc98f;--dd-report:#e0b64f;--dd-off:#e58a78;--dd-blue:#8ab4e8;--dd-na:#4a574f;--dd-track:#22362a;--dd-card:#14261a;
--dd-c1:#6db57a;--dd-c2:#7a9ee8;--dd-c3:#d6a63a;--dd-c4:#e08050;--dd-c5:#e070a8;--warn-bg:#392f14;--warn-fg:#e8c766;--bad-bg:#3a231f;--bad-fg:#f0a091;--ok-bg:#1d3325;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:24px 16px}h1{font-size:26px;letter-spacing:-.5px;margin:4px 0}.eyebrow{font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:var(--muted);margin:0}
.meta,.mini{font-size:12px;color:var(--muted)}.muted{color:var(--muted)}b{font-weight:600}
.cg-table{width:100%;border-collapse:collapse;font-size:12.5px}.cg-table th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--line)}
.cg-table td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
${"" /* shared with css/app.css — keep the two in step */}
.dd-cov{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 22px;align-items:center;padding:12px 16px;border-radius:10px;background:var(--soft);margin:0 0 14px}
.dd-big{font-size:30px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}.dd-big small{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin-top:4px}
.dd-kl{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12.5px;margin-top:6px}.dd-kl b{font-variant-numeric:tabular-nums}.dd-kl i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:5px}
.dd-out{color:var(--bad-fg);font-weight:600}@media(max-width:600px){.dd-cov{grid-template-columns:minmax(0,1fr)}}
.dd-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}@media(max-width:1100px){.dd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.dd-grid{grid-template-columns:minmax(0,1fr)}}
.dd-panel,.dd-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px;min-width:0}.dd-panel h4,.dd-card h4{margin:0 0 10px;font-size:13.5px}
.dd-card{display:flex;flex-direction:column;gap:10px}.dd-card h4{margin:0}.dd-panel-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;margin-bottom:10px;align-items:baseline}.dd-panel-head h4{margin:0}
.dd-donut{position:relative;width:148px;height:148px;margin:0 auto}.dd-svg{display:block;width:148px;height:148px}
.dd-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none}.dd-center b{font-size:26px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}.dd-center small{font-size:11px;color:var(--muted);margin-top:4px;max-width:90px}
.dd-leg{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.dd-leg li{display:grid;grid-template-columns:12px minmax(0,1fr) auto 36px;gap:8px;align-items:center;font-size:12.5px}
.dd-leg b{text-align:right;font-variant-numeric:tabular-nums}.dd-leg small{text-align:right;color:var(--muted)}.dd-sw{display:block;width:10px;height:10px;border-radius:3px}
.dd-src{font-size:11px;color:var(--muted);margin:0;border-top:1px solid var(--line);padding-top:8px}.dd-wait{color:var(--muted);font-size:12.5px}.dd-wait.bad{color:var(--bad-fg)}
.dd-twrap{overflow-x:auto}.dd-num{white-space:nowrap;font-variant-numeric:tabular-nums;text-align:right}
.dd-cell{display:flex;align-items:center;gap:8px;min-width:120px}.dd-cell b{min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
.dd-bar{display:flex;gap:2px;height:10px;flex:1 1 auto;min-width:60px}.dd-bar span{display:block;height:10px}.dd-bar span:first-child{border-radius:4px 0 0 4px}.dd-bar span:last-child{border-radius:0 4px 4px 0}.dd-bar-lg,.dd-bar-lg span{height:14px}
.dd-state{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--soft);white-space:nowrap}.dd-state.live{color:var(--dd-on)}.dd-state.ro{color:var(--dd-report)}.dd-state.off{color:var(--muted)}
.dd-pill{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid var(--line);white-space:nowrap;margin:1px 2px 1px 0}.dd-pill.warn{background:var(--warn-bg);color:var(--warn-fg);border-color:transparent}.dd-pill.bad{background:var(--bad-bg);color:var(--bad-fg);border-color:transparent}.dd-pill.ok{background:var(--ok-bg);color:var(--dd-on);border-color:transparent}.dd-pill.muted{color:var(--muted)}
.dd-foot{margin:8px 0 0}.dd-missing td{opacity:.6}.dd-link{font:inherit;font-size:12.5px;font-weight:600;color:var(--dd-on);background:none;border:0;padding:0;cursor:pointer;text-align:left}.dd-name{font-size:13px}
.dd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}.dd-ctrl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}details.dd-fold summary{cursor:pointer;font-weight:600;font-size:13px}details.dd-fold[open] summary{margin-bottom:10px}
.dd-who{color:var(--dd-on);font-weight:600;text-decoration:none}`;

  function exportHtml(m, meta) {
    const mt = meta || {};
    const stamp = (t) => t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not read";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(`Deployment dashboard — ${mt.tenant || "tenant"}`)}</title><style>${CSS}</style></head><body><div class="wrap">
<p class="eyebrow">Conditional Access · deployment dashboard</p><h1>${esc(mt.tenant || "Deployment dashboard")}</h1>
<p class="meta">Generated ${esc(stamp(mt.now || Date.now()))} · ${esc(mt.build || "")} · ENCA T54 Deployment dashboard${m.readAt ? ` · read ${esc(stamp(m.readAt))}` : ""}${m.readinessAt ? ` · readiness ${esc(stamp(m.readinessAt))}` : " · readiness not read"}</p>
${html(m, { app: false })}
<p class="meta">A snapshot, read only: it does not update and cannot change anything. It names users — share it like the tenant data it is.</p>
</div></body></html>`;
  }

  return { build, html, toCsv, exportHtml, readinessOf, keyOf, sortNames, ORDER, SER, VERDICT, CSS };
})();
if (typeof module !== "undefined") module.exports = DeployDash;
