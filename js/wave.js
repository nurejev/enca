// ======================================================================
// 🌊 Who is the wave to CA (T37, BETA) — the 🕵 Who is Anna to CA picture
// for a whole deployment group.
//
// A rollout goes group by group: CAD-SEC-U-DG-GLO, then -INT, then -ADM…
// The question before the next policy is switched from report-only to On
// is "can THIS wave take it" — and the tools that answer it are per policy
// (🎚 Report-only impact) or per user (🕵 Who is Anna to CA), never per
// wave. This module takes one group and answers, for its members:
//
//   • who is in it and HOW — direct, or through which child group, and
//     whether a dynamic rule decides it
//   • which policies TARGET the group (direct include, or via a parent
//     group), which reach members some other way (All users, a role,
//     another group), and how many members an exclusion takes back out
//   • what the sign-in log did to the members in the window
//   • GO-LIVE READINESS per report-only policy: how many members would be
//     locked out, prompted, unchanged — and how many have no traffic at
//     all, which is no data and never safety
//   • the members that need a look: in an exclusion group while the policy
//     is On, in two waves at once, blocked, would be locked out, no
//     Entra ID P1 — each one a click into 🕵 Who is Anna to CA
//
// Pure functions. The Graph reads live in app.js so the sign-in window
// cache, the consent prompts and the group-presence read are shared with
// T36. The per-member policy resolution is the same stateFor as T36
// (WhoIs.stateFor over a pseudo-user), so the two tools cannot disagree
// about a member.
//
//   Wave.analyze({ group, members, direct, children, groupMembers, roleMembers,
//                  names, vms, records, cat, dgGroups, memberCap, days }) → res
//   Wave.render(res, opts) → html      Wave.toMd(res, meta)     Wave.toCsv(res)
//
// group        { id, displayName, description, groupTypes[], membershipRule,
//                isAssignableToRole, createdDateTime }
// members      [{ id, displayName, userPrincipalName, userType, accountEnabled,
//                assignedLicenses, assignedPlans, licence? }] (transitive, capped)
// direct       Set of ids that are DIRECT members (users)
// children     [{ id, name, rule, memberIds:Set }] — the group's direct
//              member GROUPS, each with its transitive user ids
// groupMembers Map groupId → Set(userId) for every group a policy names
//              plus the baseline's deploy / persona groups
// roleMembers  Map roleTemplateId → Set(userId)
// names        { id → displayName } for groups and roles
// parents      Set of group ids the wave group is (transitively) a member of
// ======================================================================
const Wave = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };
  const short = (n) => String(n || "").replace(/^CAD-SEC-U-DG-/i, "DG-").replace(/^CAB-SEC-U-Persona-/i, "Persona-");

  // ---------------------------------------------------------- analyze --
  function analyze(a) {
    const { group, members, direct, children, groupMembers, roleMembers, names, vms, records, cat, dgGroups, memberCap, days } = a;
    const parents = a.parents || new Set();
    const lookup = WhoIs.buildLookup(vms);
    const gid = group.id;
    const isDyn = /DynamicMembership/i.test((group.groupTypes || []).join(","));

    // ---- how each member got in
    const viaOf = new Map();   // userId → [childName]
    (children || []).forEach((c) => c.memberIds.forEach((uid) => { (viaOf.get(uid) || viaOf.set(uid, []).get(uid)).push(c.name); }));

    // ---- deploy / persona groups the members are ALSO in. Only another
    // NON-global deploy group is a second wave: everyone is meant to be in
    // -GLO, and a persona group is production scoping, not a wave.
    const otherDg = (dgGroups || []).filter((g) => g.id && g.id !== gid && groupMembers.has(g.id));
    const isGlo = (g) => /-DG-GLO$/i.test(g.name || "");
    const selfIsWave = (dgGroups || []).some((g) => g.id === gid && g.kind === "deploy" && !isGlo(g));
    const otherWaves = selfIsWave ? otherDg.filter((g) => g.kind === "deploy" && !isGlo(g)) : [];
    const isConv = (n) => { try { return !!(cat && cat.isExclusionGroup && cat.isExclusionGroup(n)); } catch { return false; } };

    // ---- per-member resolution through T36's stateFor
    const memberRows = members.map((m) => {
      const u = { id: m.id, name: m.displayName || m.userPrincipalName, upn: m.userPrincipalName || "", guest: lc(m.userType) === "guest", enabled: m.accountEnabled !== false, groupIds: new Set([gid, ...parents]), roleIds: new Set(), names, direct: null };
      groupMembers.forEach((set, g) => { if (set.has(m.id)) u.groupIds.add(g); });
      roleMembers.forEach((set, r) => { if (set.has(m.id)) u.roleIds.add(r); });
      const states = lookup.map((P) => ({ P, st: WhoIs.stateFor(P, u) }));
      const exclusions = [];
      states.forEach(({ P, st }) => { if (st.s === "exc" && st.exc && st.exc.kind === "group") exclusions.push({ id: st.exc.id, name: st.exc.text, policy: P.seq || P.name, pid: P.id, on: P.state === "on" }); });
      const bypass = exclusions.some((x) => x.on);
      const waves = otherWaves.filter((g) => groupMembers.get(g.id).has(m.id)).map((g) => g.name);
      const also = otherDg.filter((g) => groupMembers.get(g.id).has(m.id)).map((g) => g.name);
      return {
        id: m.id, name: u.name, upn: u.upn, guest: u.guest, enabled: u.enabled,
        how: direct && direct.has(m.id) ? "direct" : (viaOf.get(m.id) || []).length ? `via ${[...new Set(viaOf.get(m.id))].join(", ")}` : isDyn ? "dynamic rule" : "nested",
        via: [...new Set(viaOf.get(m.id) || [])],
        states, exclusions, bypass, waves, also, roles: [...u.roleIds].map((r) => names[r] || r),
        licence: m.licence || null,
        log: { blocked: 0, interrupted: 0, rows: [] }, ro: null, worst: "none", signIns: 0,
      };
    });
    const byId = new Map(memberRows.map((r) => [r.id, r]));

    // ---- sign-ins of the members
    let log = null;
    if (records) {
      const ids = new Set(memberRows.map((r) => r.id));
      const recs = records.filter((r) => ids.has(r.userId));
      recs.forEach((r) => { const m = byId.get(r.userId); if (m) m.signIns++; });
      // risky sign-ins per member, off the same records — the wave's half of
      // 🛡 identity risk before anything is read (0.6)
      const RO_ = { none: 0, hidden: 0, low: 1, medium: 2, high: 3 };
      recs.forEach((r) => {
        const m = byId.get(r.userId); if (!m) return;
        const a = lc(r.riskLevelAggregated || ""), d = lc(r.riskLevelDuringSignIn || "");
        const lvl = (RO_[a] || 0) >= (RO_[d] || 0) ? a : d;
        if (RO_[lvl]) { m.riskySignIns = m.riskySignIns || { high: 0, medium: 0, low: 0 }; m.riskySignIns[lvl]++; }
      });
      const rows = recs.map((r) => Signins.parse(r, "enforced")).filter(Boolean).sort((x, y) => String(y.when).localeCompare(String(x.when)));
      rows.forEach((r) => { const m = byId.get(r.userId); if (!m) return; m.log.rows.push(r); m.log[r.interrupted ? "interrupted" : "blocked"]++; });
      const perPolicy = new Map();
      rows.forEach((r) => r.policies.forEach((p) => { const k = p.id || p.name; const e = perPolicy.get(k) || perPolicy.set(k, { blocked: 0, interrupted: 0, users: new Set() }).get(k); e[p.result === "interrupted" ? "interrupted" : "blocked"]++; e.users.add(r.userId); }));
      const roPolicies = lookup.filter((P) => P.state === "ro").map((P) => ({ id: P.id, name: P.name }));
      let ro = null;
      try { ro = ReportImpact.build(recs, roPolicies); } catch (e) { console.warn("wave: report-only build failed", e && e.message); }
      // the RO per-user rows are keyed by UPN; join back on UPN (case-insensitive)
      const byUpn = new Map(memberRows.map((r) => [lc(r.upn), r]));
      if (ro) ro.users.forEach((ur) => { const m = byUpn.get(lc(ur.upn)); if (m) { m.ro = ur; m.worst = ur.worst; } });
      memberRows.forEach((m) => { if (m.worst === "none" && m.signIns) m.worst = "quiet"; });
      log = { rows, total: recs.length, blocked: rows.filter((r) => !r.interrupted).length, interrupted: rows.filter((r) => r.interrupted).length,
        members: new Set(rows.map((r) => r.userId)).size, withTraffic: memberRows.filter((m) => m.signIns).length, perPolicy, ro };
    }

    // ---- policies: how they target the wave
    const rows = lookup.map((P) => {
      const direct = P.incGroups.includes(gid);
      const parent = P.incGroups.find((g) => parents.has(g));
      let target = direct ? { kind: "direct", text: `${short(group.displayName)} direct include` }
        : parent ? { kind: "parent", text: `via parent group ${names[parent] || parent}` }
          : P.includeAll ? { kind: "all", text: "All users" } : null;
      const reach = memberRows.filter((m) => m.states.find((s) => s.P.id === P.id).st.s === "inc");
      const exc = memberRows.filter((m) => m.states.find((s) => s.P.id === P.id).st.s === "exc");
      if (!target && reach.length) {
        // reaches members through a role, another group or guest type
        const kinds = new Set(reach.map((m) => m.states.find((s) => s.P.id === P.id).st.inc.kind));
        target = { kind: "other", text: `reaches ${reach.length} member${reach.length === 1 ? "" : "s"} through ${[...kinds].map((k) => ({ group: "another group", role: "a role", guest: "guest type", user: "a direct name" }[k] || k)).join(" / ")}` };
      }
      const cnt = log ? (log.perPolicy.get(P.id) || null) : null;
      let fc = null;
      if (P.state === "ro" && log && target && target.kind !== "other") {
        const withTraffic = reach.filter((m) => m.signIns);
        const blocked = reach.filter((m) => m.ro && m.ro.policies.some((x) => (x.id || x.key) === P.id && x.failure));
        const prompted = reach.filter((m) => !blocked.includes(m) && m.ro && m.ro.policies.some((x) => (x.id || x.key) === P.id && x.interrupted));
        const evaluated = reach.filter((m) => m.ro && m.ro.policies.some((x) => (x.id || x.key) === P.id));
        const unchanged = evaluated.filter((m) => !blocked.includes(m) && !prompted.includes(m));
        const silent = reach.filter((m) => !m.signIns);
        fc = { reach: reach.length, withTraffic: withTraffic.length, evaluated: evaluated.length, blocked, prompted, unchanged: unchanged.length, silent: silent.length,
          verdict: blocked.length ? "notyet" : prompted.length ? "friction" : evaluated.length ? "ready" : "nodata" };
      }
      return { ...P, target, reach: reach.length, exc, log: cnt, forecast: fc,
        excGroupsHit: [...new Set(exc.flatMap((m) => m.exclusions.filter((x) => x.pid === P.id).map((x) => x.name)))] };
    }).filter((r) => r.target || r.exc.length).sort((a, b) => {
      const o = { direct: 0, parent: 1, all: 2, other: 3 };
      return (o[(a.target || {}).kind] ?? 4) - (o[(b.target || {}).kind] ?? 4) || (a.seq || "").localeCompare(b.seq || "") || a.name.localeCompare(b.name);
    });
    const targets = rows.filter((r) => r.target && r.target.kind !== "other");
    const counts = { targets: targets.length, on: targets.filter((r) => r.state === "on").length, ro: targets.filter((r) => r.state === "ro").length, off: targets.filter((r) => r.state === "off").length,
      other: rows.filter((r) => r.target && r.target.kind === "other").length, total: lookup.length };

    // ---- member flags
    memberRows.forEach((m) => {
      m.flags = [];
      if (m.bypass) m.flags.push("bypass"); else if (m.exclusions.length) m.flags.push("excluded");
      if (m.waves.length) m.flags.push("twowaves");
      if (m.log.blocked) m.flags.push("blocked");
      if (m.worst === "block") m.flags.push("lockout");
      if (m.licence && !m.licence.p1 && !m.guest) m.flags.push("nop1");
      if (!m.enabled) m.flags.push("disabled");
      if (m.guest) m.flags.push("guest");
      m.needsLook = m.flags.some((f) => ["bypass", "twowaves", "blocked", "lockout", "nop1", "disabled"].includes(f));
    });
    const ORDER = { bypass: 0, lockout: 1, blocked: 2, twowaves: 3, nop1: 4, disabled: 5, excluded: 6, guest: 7 };
    memberRows.sort((x, y) => (y.needsLook - x.needsLook) || (Math.min(...x.flags.map((f) => ORDER[f] ?? 9), 9) - Math.min(...y.flags.map((f) => ORDER[f] ?? 9), 9)) || x.name.localeCompare(y.name));
    const flagCount = (f) => memberRows.filter((m) => m.flags.includes(f)).length;
    const mcounts = { total: memberRows.length, enabled: memberRows.filter((m) => m.enabled).length, direct: direct ? memberRows.filter((m) => m.how === "direct").length : null,
      nested: direct ? memberRows.filter((m) => m.how !== "direct").length : null, guests: flagCount("guest"), needsLook: memberRows.filter((m) => m.needsLook).length,
      bypass: flagCount("bypass"), excluded: memberRows.filter((m) => m.exclusions.length).length, twowaves: flagCount("twowaves"), blocked: flagCount("blocked"), lockout: flagCount("lockout"), nop1: flagCount("nop1"), disabled: flagCount("disabled"),
      quiet: memberRows.filter((m) => m.worst === "quiet").length, silent: memberRows.filter((m) => !m.signIns).length };
    const waveOverlap = otherWaves.map((g) => ({ name: g.name, n: memberRows.filter((m) => m.waves.includes(g.name)).length })).filter((x) => x.n);
    const alsoIn = otherDg.map((g) => ({ name: g.name, n: memberRows.filter((m) => m.also.includes(g.name)).length })).filter((x) => x.n);
    const bypassGroups = [...new Map(memberRows.flatMap((m) => m.exclusions.filter((x) => x.on)).map((x) => [x.id, x])).values()]
      .map((x) => ({ ...x, n: memberRows.filter((m) => m.exclusions.some((e) => e.id === x.id && e.on)).length }));
    // coverage: is every member also in the Global deploy group?
    const glo = (dgGroups || []).find((g) => /-DG-GLO$/i.test(g.name) && g.id && g.id !== gid && groupMembers.has(g.id));
    const coverage = glo ? { name: glo.name, missing: memberRows.filter((m) => !groupMembers.get(glo.id).has(m.id)).length } : null;

    // the risk-based policies aimed at this wave, with how many members each reaches
    const riskPolicies = lookup.filter((P) => P.risk && P.state !== "off").map((P) => ({
      id: P.id, name: P.name, seq: P.seq, state: P.state, userRisk: P.userRisk, signInRisk: P.signInRisk, insiderRisk: P.insiderRisk || [],
      reach: memberRows.filter((m) => m.states.find((s) => s.P.id === P.id).st.s === "inc").length,
    })).filter((p) => p.reach);
    return { group, isDyn, days, riskPolicies, members: memberRows, mcounts, children: (children || []).map((c) => ({ id: c.id, name: c.name, rule: c.rule, n: c.memberIds.size })), rows, counts, log, waveOverlap, alsoIn, bypassGroups, coverage, memberCap: memberCap || 0, capped: !!a.capped, dgGroups: dgGroups || [] };
  }

  // ----------------------------------------------------------- render --
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;
  const stateHtml = (st) => `<span class="wo-state ${st}">${dot(st)}${STATE_LABEL[st]}</span>`;
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const polLink = (r) => `<span class="pol-link" data-polid="${esc(r.id)}">${r.seq ? `<b>${esc(r.seq)}</b> ` : ""}${esc(r.name)}</span>`;
  const controlsHtml = (r) => {
    const c = (r.controls || []).map((x) => `<span class="ctrl${/^block/i.test(String(x)) ? " block" : ""}">${esc(x)}</span>`);
    return c.concat((r.session || []).map((x) => `<span class="ctrl">${esc(x)}</span>`)).join(r.op && c.length > 1 ? `<span class="mini muted"> ${esc(r.op)} </span>` : "") || '<span class="mini muted">—</span>';
  };
  const FLAG = {
    bypass: (m) => `<span class="ctrl block" title="in an exclusion group while the policy is On">${esc(m.exclusions.filter((x) => x.on).map((x) => `${x.policy} exclusion`).join(", "))}</span>`,
    excluded: (m) => `<span class="ctrl" title="in an exclusion group of a policy that is not On">${esc(m.exclusions.map((x) => `${x.policy} exclusion (${x.on ? "On" : "not On"})`).join(", "))}</span>`,
    twowaves: (m) => `<span class="ctrl" title="also in another deploy group">also ${esc(m.waves.map(short).join(", "))}</span>`,
    nop1: () => '<span class="ctrl">no P1</span>', disabled: () => '<span class="ctrl">disabled</span>', guest: () => '<span class="ctrl">guest</span>',
    blocked: () => "", lockout: () => "",
  };

  // ---- 🛡 identity risk for the whole wave (0.6, on Mihai's ask): the
  // user-risk record per member (read on demand — it is one call per member
  // and needs IdentityRiskyUser.Read.All), joined to the risky sign-ins the
  // members already have from the shared window, and to the risk policies
  // aimed at the wave: which would FIRE on a member as she stands now.
  // riskById: userId → { level, state, detail, updated } | null (never
  // flagged) | { err }. Mutates res (members get .risk) and sets res.risk.
  function applyRisk(res, riskById, meta = {}) {
    const RS = { atRisk: 1, confirmedCompromised: 1 };
    let errs = 0;
    res.members.forEach((m) => {
      const r = riskById.has(m.id) ? riskById.get(m.id) : undefined;
      if (r && r.err) { errs++; m.risk = { err: r.err }; return; }
      m.risk = r || { level: "none", state: "none", detail: "none", updated: "" };
      m.risk.atRisk = !!RS[m.risk.state];
      m.risk.fires = m.risk.atRisk ? res.riskPolicies.filter((P) => P.userRisk.includes(lc(m.risk.level)) && m.states.find((s) => s.P.id === P.id).st.s === "inc") : [];
    });
    const atRisk = res.members.filter((m) => m.risk && m.risk.atRisk);
    const remediated = res.members.filter((m) => m.risk && /^(remediated|dismissed|confirmedSafe)$/i.test(String(m.risk.state || "")));
    const risky = res.members.filter((m) => m.riskySignIns);
    const fires = new Map();
    atRisk.forEach((m) => (m.risk.fires || []).forEach((P) => { const e = fires.get(P.id) || fires.set(P.id, { ...P, members: [] }).get(P.id); e.members.push(m); }));
    res.risk = { read: true, at: meta.at || new Date().toISOString(), errs, atRisk, remediated, risky, fires: [...fires.values()], notRead: res.members.length - res.members.filter((m) => m.risk && !m.risk.err).length };
    return res.risk;
  }

  function render(res, opts = {}) {
    const g = res.group, c = res.counts, mc = res.mcounts, log = res.log, filter = opts.filter || "look";
    const rangeLabel = opts.rangeLabel || "window";
    const dgName = short(g.displayName);
    const facts = [
      `<span class="wo-fact">Members <b>${mc.total}</b>${res.capped ? ` <span class="muted">(first ${res.memberCap})</span>` : ""} · ${mc.enabled} enabled</span>`,
      mc.direct != null ? `<span class="wo-fact">Direct <b>${mc.direct}</b> · nested <b>${mc.nested}</b>${res.children.length ? ` via ${res.children.length} child group${res.children.length === 1 ? "" : "s"}` : ""}</span>` : "",
      res.isDyn ? `<span class="wo-fact">Dynamic · <span class="uupn">${esc(g.membershipRule || "")}</span></span>` : "",
      res.alsoIn.length ? `<span class="wo-fact${res.waveOverlap.length ? " warn" : ""}">Also in ${res.alsoIn.map((x) => `<b>${esc(short(x.name))}</b>: ${x.n}`).join(" · ")}</span>` : "",
      mc.bypass ? `<span class="wo-fact warn"><b>${mc.bypass}</b> in an exclusion group while the policy is On</span>` : "",
      `<span class="wo-fact">Guests <b>${mc.guests}</b></span>`,
      mc.nop1 ? `<span class="wo-fact warn">No Entra ID P1 <b>${mc.nop1}</b></span>` : "",
      g.isAssignableToRole ? '<span class="wo-fact">role-assignable</span>' : "",
    ].filter(Boolean).join("");
    const fcMembers = log ? res.members.filter((m) => m.worst === "block").length : null;
    const promptMembers = log ? res.members.filter((m) => m.worst === "prompt").length : null;
    const head = `<div class="list-card wo-card">
      <div class="wo-who">
        <div class="avatar wo-av" style="border-radius:12px;font-size:13px">${esc(dgName.replace(/^DG-/, "").slice(0, 4))}</div>
        <div>
          <div class="wo-name">${esc(g.displayName)}${res.dgGroups.some((x) => x.id === g.id) ? ' <span class="tag">deploy group</span>' : ""}</div>
          <div class="muted">${esc(g.description || "")}${g.createdDateTime ? ` <span class="mini">· created ${esc(String(g.createdDateTime).slice(0, 10))}</span>` : ""} <span class="uupn">${esc(g.id)}</span></div>
          <div class="wo-facts">${facts}</div>
        </div>
        <div class="wo-actions">
          <button class="btn sm" data-wv-cagroups title="Open 👥 Conditional Access groups">👥 CA groups</button>
          <button class="btn sm" data-wv-groupuse title="Open 🔗 User or Group analyzer on this group">🔗 Analyzer</button>
          ${res.risk ? "" : `<button class="btn sm" data-wv-risk title="Read Identity Protection's user risk for every member (IdentityRiskyUser.Read.All) and join it to the risky sign-ins already in the window">🛡 Read identity risk</button>`}
        </div>
      </div>
      <div class="wo-verdicts">
        <div class="wo-vt"><span class="k">Policies targeting the wave</span><span class="v">${c.targets}</span><span class="s">${c.on} enforced · ${c.ro} report-only · ${c.off} off${c.other ? ` · ${c.other} reach members another way` : ""}</span></div>
        ${log ? `<div class="wo-vt ${log.rows.length ? "bad" : "ok"}"><span class="k">Sign-ins CA stopped · ${esc(rangeLabel)}</span><span class="v">${log.rows.length}</span><span class="s">${log.blocked} blocked · ${log.interrupted} interrupted · ${log.members} member${log.members === 1 ? "" : "s"}</span></div>` : '<div class="wo-vt"><span class="k">Sign-ins CA stopped</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>'}
        ${log ? `<div class="wo-vt ${fcMembers ? "bad" : promptMembers ? "warn" : "ok"}"><span class="k">If report-only went live</span><span class="v">${fcMembers} <span class="of">locked out</span></span><span class="s">${promptMembers} get prompts · ${mc.silent} with no sign-ins (no data)</span></div>` : '<div class="wo-vt"><span class="k">If report-only went live</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>'}
        ${log ? `<div class="wo-vt ok"><span class="k">Quiet members · ${esc(rangeLabel)}</span><span class="v">${mc.quiet}</span><span class="s">signed in, nothing stopped, no forecast change</span></div>` : `<div class="wo-vt"><span class="k">Needs a look</span><span class="v">${mc.needsLook}</span><span class="s">of ${mc.total} members</span></div>`}
      </div>
    </div>`;

    // ---- 🛡 identity risk card: only once read (the button in the head)
    let riskHtml = "";
    {
      const rk = res.risk;
      const rsum = (m) => m.riskySignIns ? ["high", "medium", "low"].filter((l) => m.riskySignIns[l]).map((l) => `<span class="wo-res ${l === "high" ? "blk" : l === "medium" ? "int" : "wb"}">${m.riskySignIns[l]} ${l}</span>`).join(" ") : '<span class="muted">—</span>';
      const RS_LABEL = { atRisk: "At risk", confirmedCompromised: "Compromised", remediated: "Remediated", dismissed: "Dismissed", confirmedSafe: "Confirmed safe", none: "No risk" };
      const risky = res.members.filter((m) => m.riskySignIns);
      if (rk) {
        const listed = res.members.filter((m) => (m.risk && m.risk.atRisk) || m.riskySignIns || (m.risk && /^(remediated|dismissed|confirmedSafe)$/i.test(String(m.risk.state || ""))))
          .sort((a, b) => ((b.risk && b.risk.atRisk) - (a.risk && a.risk.atRisk)) || (!!b.riskySignIns - !!a.riskySignIns) || a.name.localeCompare(b.name));
        riskHtml = `<div class="list-card wo-card">
          <h3 class="wo-h" data-wo-fold="risk">🛡 Identity risk across the wave <span class="mini muted">— user risk read ${esc(String(rk.at).slice(0, 16).replace("T", " "))}${rk.errs ? ` · ${rk.errs} not read` : ""}</span></h3>
          <div class="wo-verdicts wo-3" style="margin:0 0 10px">
            <div class="wo-vt ${rk.atRisk.length ? "bad" : "ok"}"><span class="k">Members at risk</span><span class="v">${rk.atRisk.length}</span><span class="s">${rk.atRisk.length ? ["high", "medium", "low"].map((l) => [l, rk.atRisk.filter((m) => lc(m.risk.level) === l).length]).filter(([, n]) => n).map(([l, n]) => `${n} ${l}`).join(" · ") : "Identity Protection flags nobody in the wave"}</span></div>
            <div class="wo-vt ${rk.risky.length ? "warn" : "ok"}"><span class="k">Risky sign-ins · ${esc(rangeLabel)}</span><span class="v">${rk.risky.length}</span><span class="s">member${rk.risky.length === 1 ? "" : "s"} with a risky sign-in in the window</span></div>
            <div class="wo-vt ${rk.fires.length ? "bad" : "ok"}"><span class="k">Risk policies firing now</span><span class="v">${rk.fires.length}</span><span class="s">${rk.fires.length ? rk.fires.map((P) => `${esc(P.seq || P.name)} on ${P.members.length}`).join(" · ") : `${res.riskPolicies.length} risk-based polic${res.riskPolicies.length === 1 ? "y aims" : "ies aim"} at the wave, none fires on anyone as they stand`}</span></div>
          </div>
          ${res.riskPolicies.length ? `<p class="mini" style="margin:0 0 8px">Risk-based policies aimed at the wave: ${res.riskPolicies.map((P) => `<span class="pol-link" data-polid="${esc(P.id)}">${P.seq ? `<b>${esc(P.seq)}</b> ` : ""}${esc(P.name)}</span>${P.state === "ro" ? " (report-only)" : ""} <span class="muted">— ${[P.userRisk.length ? `user risk ${P.userRisk.join("/")}` : "", P.signInRisk.length ? `sign-in risk ${P.signInRisk.join("/")}` : "", P.insiderRisk.length ? `insider risk ${P.insiderRisk.join("/")}` : ""].filter(Boolean).join(", ")} · reaches ${P.reach}</span>`).join("<br>")}</p>` : '<p class="mini muted" style="margin:0 0 8px">No risk-based policy reaches this wave.</p>'}
          ${listed.length ? `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Member</th><th>User risk</th><th>Since</th><th>Risky sign-ins</th><th>Fires</th></tr></thead><tbody>
            ${listed.slice(0, 60).map((m) => `<tr${m.risk && m.risk.atRisk ? ' class="wo-exrow"' : ""}><td><a href="#" class="wv-member" data-wv-open="${esc(m.upn)}"><b>${esc(m.name)}</b></a><div class="mini muted">${esc(m.upn)}</div></td>
              <td>${m.risk && m.risk.err ? `<span class="muted">not read — ${esc(m.risk.err)}</span>` : `<span class="wo-res ${m.risk && m.risk.atRisk ? (lc(m.risk.level) === "high" ? "blk" : "int") : "nc"}">${RS_LABEL[(m.risk || {}).state] || esc((m.risk || {}).state || "No risk")}</span>${m.risk && m.risk.atRisk ? ` <span class="mini">${esc(m.risk.level)}</span>` : ""}${m.risk && m.risk.detail && m.risk.detail !== "none" ? `<div class="mini muted">${esc(m.risk.detail)}</div>` : ""}`}</td>
              <td class="mini">${m.risk && m.risk.updated ? esc(String(m.risk.updated).slice(0, 10)) : "—"}</td>
              <td>${rsum(m)}</td>
              <td class="mini">${m.risk && m.risk.fires && m.risk.fires.length ? m.risk.fires.map((P) => `<span class="pol-link" data-polid="${esc(P.id)}">${esc(P.seq || P.name)}</span>`).join(", ") : '<span class="muted">—</span>'}</td></tr>`).join("")}
          </tbody></table></div>${listed.length > 60 ? `<p class="mini muted" style="margin-top:6px">${listed.length - 60} more — export CSV for all.</p>` : ""}` : '<p class="mini muted">Nobody in the wave is flagged, remediated or has a risky sign-in in the window.</p>'}
          <p class="mini muted" style="margin-top:8px">User risk is Identity Protection's (needs Entra ID P2 to be populated); risky sign-ins are the members' own records in the shared window. Click a member for her full picture in 🕵 Who is Anna to CA. Nothing here changes the tenant.</p>
        </div>`;
      } else if (risky.length) {
        riskHtml = `<div class="wo-callout"><b>${risky.length} member${risky.length === 1 ? "" : "s"} had a risky sign-in in the window</b> — ${risky.slice(0, 6).map((m) => `<a href="#" class="wv-member" data-wv-open="${esc(m.upn)}">${esc(m.name)}</a> (${rsum(m)})`).join(", ")}${risky.length > 6 ? ` +${risky.length - 6}` : ""}. Press <b>🛡 Read identity risk</b> for what Identity Protection says about them now and which risk policies fire.</div>`;
      }
    }

    // ---- readiness
    const roRows = res.rows.filter((r) => r.state === "ro" && r.target && r.target.kind !== "other");
    const fbar = (fc) => { const t = fc.evaluated || 1; const w = (n) => Math.round(n / t * 100); return `<div class="wo-fbar" style="width:180px"><i class="b" style="width:${w(fc.blocked.length)}%"></i><i class="p" style="width:${w(fc.prompted.length)}%"></i><i class="n" style="width:${w(fc.unchanged)}%"></i></div>`; };
    const VERDICT = { notyet: '<span class="wo-res wb">Not yet</span>', friction: '<span class="wo-res wp">Friction only</span>', ready: '<span class="wo-res nc">Ready</span>', nodata: '<span class="mini muted">No data</span>' };
    const readiness = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="readiness">🧭 Go-live readiness per report-only policy — this wave only</h3>
      ${!log ? '<p class="mini muted">Needs the sign-in log.</p>' : !roRows.length ? '<p class="mini muted">No report-only policy targets this wave.</p>' : `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>Members with traffic</th><th>Forecast</th><th>Verdict</th></tr></thead><tbody>
        ${roRows.map((r) => { const fc = r.forecast; return `<tr><td>${polLink(r)}<div class="mini muted">${esc(r.target.text)}</div></td><td class="num">${fc.withTraffic} / ${fc.reach}${fc.silent ? `<div class="mini muted">${fc.silent} silent</div>` : ""}</td>
          <td>${fc.evaluated ? fbar(fc) : ""}${fc.blocked.length ? `<span class="wo-res wb">${fc.blocked.length} locked out</span> · ` : ""}${fc.prompted.length ? `<span class="wo-res wp">${fc.prompted.length} prompted</span> · ` : ""}${fc.evaluated ? `<span class="wo-res nc">${fc.unchanged} no change</span>` : '<span class="mini muted">no member sign-in was evaluated by it</span>'}</td>
          <td>${VERDICT[fc.verdict]}<div class="mini muted">${fc.verdict === "notyet" ? `${fc.blocked.slice(0, 4).map((m) => `<a href="#" class="wv-member" data-wv-open="${esc(m.upn)}">${esc(m.name)}</a>`).join(", ")}${fc.blocked.length > 4 ? ` +${fc.blocked.length - 4}` : ""}` : fc.verdict === "friction" ? "nobody denied" : fc.verdict === "ready" ? `${fc.evaluated} evaluated, nobody stopped` : "not evidence of safety"}</div></td></tr>`; }).join("")}
      </tbody></table></div>`}
      ${log && mc.silent ? `<p class="mini muted" style="margin-top:8px">${mc.silent} member${mc.silent === 1 ? " had" : "s had"} no sign-in in the window — no data, not safe.</p>` : ""}
    </div>`;

    // ---- policies
    const pfilter = opts.pfilter || "targets";
    const pchips = [["targets", `Targets the group ${pill(c.targets, "green")}`], ["other", `Reaches members another way ${pill(c.other, "amber")}`], ["all", `All ${pill(res.rows.length, "zero")}`]]
      .map(([k, l]) => `<button class="fchip${pfilter === k ? " active" : ""}" data-wv-pfilter="${k}">${l}</button>`).join("");
    const pshown = res.rows.filter((r) => pfilter === "all" || (pfilter === "targets" ? r.target && r.target.kind !== "other" : r.target && r.target.kind === "other"));
    const ptable = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="policies">📋 Policies and how they reach the wave</h3>
      <div class="chip-filter" style="margin:8px 0 10px">${pchips}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>State</th><th>Targets via</th><th>Excluded members</th><th>Controls</th><th>Log · ${esc(rangeLabel)}</th></tr></thead><tbody>
        ${pshown.map((r) => `<tr class="${r.state === "off" ? "wo-dim" : ""}"><td>${polLink(r)}</td><td>${stateHtml(r.state)}</td><td class="wo-via">${r.target ? (r.target.kind === "other" ? `<span style="color:var(--warn-fg)">${esc(r.target.text)}</span>` : `<b>${esc(r.target.text)}</b>`) : '<span class="mini muted">does not target it</span>'}${r.target && r.target.kind !== "other" && r.reach < mc.total - r.exc.length ? `<div class="mini muted">reaches ${r.reach} of ${mc.total}</div>` : ""}</td>
          <td>${r.exc.length ? `<span class="wo-res blk">${r.exc.length}</span> <span class="mini muted">via ${esc(r.excGroupsHit.join(", ") || "user / role / guest exclusion")}</span>` : '<span class="mini muted">none</span>'}</td><td>${controlsHtml(r)}</td>
          <td class="wo-cnt">${!log ? '<span class="mini muted">—</span>' : !r.log ? (r.state === "off" ? '<span class="mini muted">no verdicts (Off)</span>' : r.state === "ro" ? '<span class="mini muted">forecast above</span>' : pill(0, "zero")) : `${r.log.blocked ? `${pill(r.log.blocked, "red")} blocked ` : ""}${r.log.interrupted ? `${pill(r.log.interrupted, "amber")} interrupted ` : ""}<span class="mini muted">· ${r.log.users.size} member${r.log.users.size === 1 ? "" : "s"}</span>`}</td></tr>`).join("")
          || '<tr><td colspan="6" class="mini muted" style="padding:14px">Nothing in this filter.</td></tr>'}
      </tbody></table></div>
      <p class="mini muted" style="margin-top:8px">Per-member resolution is 🕵 Who is Anna to CA's, run for every member, so the two tools cannot disagree about a member. “Reaches members another way” = the policy does not name this group or a parent of it but hits members through All users, a role, another group or guest type.</p>
    </div>`;

    // ---- members
    const mchips = [["look", `Needs a look ${pill(mc.needsLook, "red")}`], ["bypass", `In an exclusion ${pill(mc.excluded, "red")}`], ["twowaves", `Two waves ${pill(mc.twowaves, "amber")}`], ["blocked", `Blocked ${pill(mc.blocked, "red")}`], ["lockout", `Would be locked out ${pill(mc.lockout, "red")}`], ["nop1", `No P1 ${pill(mc.nop1, "amber")}`], ["all", `All ${pill(mc.total, "zero")}`]]
      .map(([k, l]) => `<button class="fchip${filter === k ? " active" : ""}" data-wv-filter="${k}">${l}</button>`).join("");
    const mshown = res.members.filter((m) => filter === "all" ? true : filter === "look" ? m.needsLook : filter === "bypass" ? m.exclusions.length : m.flags.includes(filter));
    const maxRows = opts.maxRows || 100;
    const mtable = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="members">👥 Members ${pill(mc.total, "zero")} <span class="mini muted">— click a name for 🕵 Who is … to CA</span></h3>
      <div class="chip-filter" style="margin:8px 0 10px">${mchips}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Member</th><th>In wave via</th><th>Flags</th><th>${esc(rangeLabel)}</th><th>Forecast</th></tr></thead><tbody>
        ${mshown.slice(0, maxRows).map((m) => `<tr><td><a href="#" class="wv-member" data-wv-open="${esc(m.upn)}"><b>${esc(m.name)}</b></a><div class="mini muted">${esc(m.upn)}</div></td><td class="wo-via">${esc(m.how)}${m.roles.length ? `<div class="mini muted">${esc(m.roles.join(", "))}</div>` : ""}</td>
          <td>${m.flags.map((f) => FLAG[f] ? FLAG[f](m) : "").join("") || '<span class="mini muted">—</span>'}</td>
          <td>${!log ? '<span class="mini muted">—</span>' : m.log.blocked || m.log.interrupted ? `${m.log.blocked ? `<span class="wo-res blk">${m.log.blocked} blocked</span>` : ""}${m.log.blocked && m.log.interrupted ? " · " : ""}${m.log.interrupted ? `<span class="wo-res int">${m.log.interrupted} int.</span>` : ""}` : m.signIns ? `<span class="mini muted">${m.signIns} passed</span>` : '<span class="mini muted">no sign-ins</span>'}</td>
          <td>${!log ? '<span class="mini muted">—</span>' : m.worst === "block" ? `<span class="wo-res wb">locked out · ${esc(m.ro.policies.filter((p) => p.failure).map((p) => p.name).join(", "))}</span>` : m.worst === "prompt" ? `<span class="wo-res wp">prompts · ${esc(m.ro.policies.filter((p) => p.interrupted).map((p) => p.name).join(", "))}</span>` : m.worst === "clean" ? '<span class="wo-res nc">no change</span>' : m.signIns ? '<span class="mini muted">no RO verdict</span>' : '<span class="mini muted">no data</span>'}</td></tr>`).join("")
          || '<tr><td colspan="5" class="mini muted" style="padding:14px">Nobody in this filter.</td></tr>'}
      </tbody></table></div>
      ${mshown.length > maxRows ? `<p class="mini muted" style="margin-top:6px">${mshown.length - maxRows} more — export CSV for all.</p>` : ""}
    </div>`;

    // ---- how the wave is built
    const built = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="built">🧩 How the wave is built</h3>
      ${mc.direct != null ? `<div class="wo-grp"><span><b>Direct members</b></span><span class="muted">${mc.direct}</span><span class="mini muted">added by hand — 🔗 Analyzer for who</span></div>` : '<p class="mini muted">Direct list not read.</p>'}
      ${res.children.map((ch) => `<div class="wo-grp"><span>${esc(ch.name)}</span><span class="muted">nested · ${ch.n} member${ch.n === 1 ? "" : "s"}</span><span class="mini muted">${ch.rule ? `dynamic · <span class="uupn">${esc(ch.rule)}</span>` : "assigned"}</span></div>`).join("")}
      ${res.isDyn ? `<div class="wo-grp"><span><b>Dynamic rule</b></span><span class="muted">all ${mc.total}</span><span class="mini muted uupn">${esc(g.membershipRule || "")}</span></div>` : ""}
      ${res.waveOverlap.length ? `<div class="wo-callout"><b>Two waves at once.</b> ${res.waveOverlap.map((x) => `${x.n} member${x.n === 1 ? " is" : "s are"} also in <b>${esc(x.name)}</b>`).join(", ")} — they get both personas' policies and the stricter one wins at sign-in. Fine for a test, confusing for a rollout; decide which persona they are.</div>` : ""}
      ${res.bypassGroups.length ? `<div class="wo-callout bad"><b>${mc.bypass} standing bypass${mc.bypass === 1 ? "" : "es"}</b> inside the wave: ${res.bypassGroups.map((x) => `${x.n} in <b>${esc(x.name)}</b> while ${esc(x.policy)} is On`).join("; ")}. → <a href="#" class="md-tool" data-tool="toolExclusions">🚪 Exclusion analyzer</a> · <a href="#" class="md-tool" data-tool="toolProtect">🔒 Protect exclusions</a></div>` : ""}
      ${res.coverage ? (res.coverage.missing ? `<div class="wo-callout"><b>Coverage gap.</b> ${res.coverage.missing} member${res.coverage.missing === 1 ? " is" : "s are"} not in <b>${esc(res.coverage.name)}</b>, so the Global policies do not reach ${res.coverage.missing === 1 ? "that member" : "them"}.</div>` : `<div class="wo-callout ok"><b>Coverage.</b> ${mc.total === 1 ? "The one member is" : `All ${mc.total} members are`} also in <b>${esc(res.coverage.name)}</b>, so the Global policies reach the whole wave.${mc.guests ? "" : " No member is a guest."}</div>`) : ""}
      ${mc.disabled ? `<div class="wo-callout"><b>${mc.disabled} disabled account${mc.disabled === 1 ? "" : "s"}</b> in the wave — they count toward the licence obligation and toward nothing else.</div>` : ""}
    </div>`;

    return head + riskHtml + readiness + ptable + `<div class="wo-split">${mtable}${built}</div>`;
  }

  // ------------------------------------------------------------- csv --
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(res) {
    const H = ["upn", "name", "enabled", "guest", "in_wave_via", "other_waves", "exclusion_groups", "bypass", "roles", "p1", "blocked", "interrupted", "sign_ins", "forecast"];
    return [H.join(",")].concat(res.members.map((m) => [m.upn, m.name, m.enabled, m.guest, m.how, m.waves.join("; "), m.exclusions.map((x) => `${x.name} (${x.policy})`).join("; "), m.bypass, m.roles.join("; "),
      m.licence ? (m.licence.p2 ? "P2" : m.licence.p1 ? "P1" : "none") : "", m.log.blocked, m.log.interrupted, m.signIns, m.worst].map(csvCell).join(","))).join("\n");
  }

  // ------------------------------------------------------------ markdown --
  function toMd(res, meta = {}) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const g = res.group, c = res.counts, mc = res.mcounts, log = res.log;
    const L = [`# Who is ${e(g.displayName)} to Conditional Access — ${e(meta.tenant || "")}`, "", (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy("Generated") : "", ""];
    L.push(`**${e(g.displayName)}** — ${mc.total} members${res.capped ? ` (first ${res.memberCap})` : ""}, ${mc.enabled} enabled${mc.direct != null ? `, ${mc.direct} direct / ${mc.nested} nested` : ""}${res.isDyn ? `, dynamic rule \`${e(g.membershipRule)}\`` : ""}, ${mc.guests} guests.`, "");
    L.push("## At a glance", "");
    L.push(`- **Policies targeting the wave:** ${c.targets} — ${c.on} enforced, ${c.ro} report-only, ${c.off} off${c.other ? `; ${c.other} reach members another way` : ""}`);
    if (log) L.push(`- **Sign-ins CA stopped (${e(meta.rangeLabel || "window")}):** ${log.rows.length} — ${log.blocked} blocked, ${log.interrupted} interrupted, ${log.members} members; ${mc.silent} members had no sign-in`);
    if (log) L.push(`- **If report-only went live:** ${res.members.filter((m) => m.worst === "block").length} locked out, ${res.members.filter((m) => m.worst === "prompt").length} get prompts`);
    if (res.waveOverlap.length) L.push(`- **Two waves at once:** ${res.waveOverlap.map((x) => `${x.n} also in ${e(x.name)}`).join(", ")}`);
    if (mc.bypass) L.push(`- **Standing bypasses:** ${mc.bypass} members in an exclusion group while the policy is On`);
    if (res.coverage) L.push(`- **Coverage:** ${res.coverage.missing ? `${res.coverage.missing} members are NOT in ${e(res.coverage.name)}` : `all members are also in ${e(res.coverage.name)}`}`);
    if (res.risk) {
      const rk = res.risk;
      L.push(`- **Identity risk:** ${rk.atRisk.length} at risk, ${rk.remediated.length} remediated/dismissed, ${rk.risky.length} with a risky sign-in in the window${rk.fires.length ? `; firing: ${rk.fires.map((P) => `${e(P.seq || P.name)} on ${P.members.length}`).join(", ")}` : ""}${rk.errs ? `; ${rk.errs} not read` : ""}`);
      const listed = res.members.filter((m) => (m.risk && m.risk.atRisk) || m.riskySignIns);
      if (listed.length) {
        L.push("", "## Identity risk", "", "| Member | UPN | User risk | Level | Since | Risky sign-ins | Fires |", "| --- | --- | --- | --- | --- | --- | --- |");
        listed.forEach((m) => L.push(`| ${e(m.name)} | ${e(m.upn)} | ${e((m.risk || {}).state || "")} | ${e((m.risk || {}).level || "")} | ${e(String((m.risk || {}).updated || "").slice(0, 10))} | ${m.riskySignIns ? ["high", "medium", "low"].filter((l) => m.riskySignIns[l]).map((l) => `${m.riskySignIns[l]} ${l}`).join(", ") : ""} | ${((m.risk || {}).fires || []).map((P) => e(P.seq || P.name)).join(", ")} |`));
      }
    }
    const roRows = res.rows.filter((r) => r.state === "ro" && r.forecast);
    if (roRows.length) {
      L.push("", "## Go-live readiness per report-only policy", "", "| Policy | With traffic | Locked out | Prompted | No change | Silent | Verdict |", "| --- | --- | --- | --- | --- | --- | --- |");
      roRows.forEach((r) => { const f = r.forecast; L.push(`| ${e(r.seq)} ${e(r.name)} | ${f.withTraffic} / ${f.reach} | ${f.blocked.length}${f.blocked.length ? ` (${f.blocked.map((m) => e(m.upn)).join(", ")})` : ""} | ${f.prompted.length} | ${f.unchanged} | ${f.silent} | ${{ notyet: "NOT YET", friction: "friction only", ready: "ready", nodata: "no data" }[f.verdict]} |`); });
    }
    L.push("", "## Policies", "", "| CA | Policy | State | Targets via | Excluded members | Controls | Blocked | Interrupted |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    res.rows.forEach((r) => L.push(`| ${e(r.seq)} | ${e(r.name)} | ${STATE_LABEL[r.state]} | ${e(r.target ? r.target.text : "does not target it")} | ${r.exc.length}${r.excGroupsHit.length ? ` via ${e(r.excGroupsHit.join(", "))}` : ""} | ${e((r.controls || []).join(` ${r.op || ","} `))} | ${r.log ? r.log.blocked : ""} | ${r.log ? r.log.interrupted : ""} |`));
    L.push("", "## How the wave is built", "");
    if (mc.direct != null) L.push(`- Direct members: ${mc.direct}`);
    res.children.forEach((ch) => L.push(`- ${e(ch.name)} — nested, ${ch.n} members${ch.rule ? `, dynamic: \`${e(ch.rule)}\`` : ""}`));
    const look = res.members.filter((m) => m.needsLook);
    L.push("", `## Members that need a look (${look.length} of ${mc.total})`, "", "| Member | In wave via | Flags | Blocked | Interrupted | Forecast |", "| --- | --- | --- | --- | --- | --- |");
    look.forEach((m) => L.push(`| ${e(m.name)} (${e(m.upn)}) | ${e(m.how)} | ${e(m.flags.map((f) => f === "bypass" ? `bypass: ${m.exclusions.filter((x) => x.on).map((x) => x.policy).join(", ")}` : f === "twowaves" ? `also ${m.waves.map(short).join(", ")}` : f).join("; "))} | ${m.log.blocked} | ${m.log.interrupted} | ${m.worst === "block" ? "LOCKED OUT" : m.worst === "prompt" ? "prompts" : m.worst === "clean" ? "no change" : m.signIns ? "no RO verdict" : "no data"} |`));
    if (!look.length) L.push("| *(none)* | | | | | |");
    L.push("", "Resolution per member as 🕵 Who is Anna to CA; readiness from 🎚 Report-only impact narrowed to this group; silent members are no data, never safety.");
    return L.join("\n");
  }

  return { analyze, applyRisk, render, toMd, toCsv };
})();
