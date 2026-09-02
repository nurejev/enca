// ======================================================================
// Baseline leftovers — what the PREVIOUS baseline left behind after a
// switch (roadmap R36, follow-up to the active-baseline switch).
//
// Switching the active baseline writes nothing, on purpose: it changes what
// the tools expect, not what the tenant holds. So after a switch the old
// baseline's exclusion groups, its persona units and its numbered policies
// are all still there — and nothing said so. This module reads them, says
// which are still doing something, and offers to delete only the ones that
// are not.
//
// THREE KINDS OF LEFTOVER, one rule each for "safe":
//
//   group   — a group the old baseline defines (its templates, or a name its
//             routing rule places). SAFE only when NO policy of any kind
//             references it, it has NO members, and it is not sitting in a
//             restricted unit that stays — a group inside a unit that is
//             itself being deleted is fine, because units go first.
//   au      — one of the old baseline's persona units. SAFE only when every
//             member is an old-baseline group that is itself safe: a unit
//             that still protects a group in use must stay, or the group is
//             left unprotected the moment the unit goes.
//   policy  — a numbered policy that matches the OLD catalog and not the
//             active one. SAFE only when it is Off. A policy that is On or
//             report-only is still doing something; it is listed, with its
//             state, and refused here — 🎚 Set Policy state is the tool for
//             that, and it has its own confirmation.
//
// Everything else is listed WITH THE REASON it is refused. Select-all ticks
// only the safe rows; a refused row cannot be ticked at all — this is the
// one delete list in the app where "tick it deliberately" is not offered,
// because a group still referenced by a policy or a unit still guarding a
// group is not a judgement call, it is a broken policy or an open vault.
//
// Order of deletion, when it runs: units, then groups, then policies — a
// group cannot be deleted while it sits in a restricted unit without a role
// scoped to that unit, and the unit going first makes the scope irrelevant.
//
// Pure over `facts` (scan) and over `plan` (toMd); the host page reads the
// tenant and runs the deletes, with the typed confirmation and the report
// every other write tool has.
// ======================================================================
const BaselineCleanup = (() => {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const stateLabel = (s) => s === "enabled" ? "On" : s === "enabledForReportingButNotEnforced" ? "report-only" : s === "disabled" ? "Off" : String(s || "unknown");

  // Which of the tenant's groups belong to a baseline — an exact template
  // name, or the exact shape of its exclusion-group convention. NOT its
  // routing rule: codeForGroup() also places break-glass groups by intent
  // (Emergency_Access1 routes to the BreakGlass vault), and a tenant's own
  // emergency-access group is never a leftover of anybody's baseline.
  function belongsTo(cat, name) {
    const n = norm(name);
    if (!n) return false;
    if ((cat.templates() || []).some((t) => norm(t.displayName) === n)) return true;
    try { return !!cat.isExclusionGroup(name); } catch { return false; }
  }
  // Break-glass is never offered, whatever its state: an empty break-glass
  // group is a deployment mistake to fix, not an object to tidy away.
  const BREAKGLASS = /break[-_ ]?glass|emergency[-_ ]?access|^bg[-_]/i;
  const isBreakGlass = (cat, name) => norm(name) === norm(cat.breakGlassGroup) || BREAKGLASS.test(String(name || ""));

  // facts:
  //   groups     [{ id, displayName, isAssignableToRole, groupTypes, memberCount }]
  //              memberCount: number, or null when it could not be read
  //   aus        [{ id, displayName, isMemberManagementRestricted, members:[{id}], scopedAdmins }]
  //   policies   the app's view models ({ id, name, state, raw })
  //   protection Map(groupId -> { auId, auName }) — where each group sits
  function scan(oldCat, curCat, facts) {
    const f = facts || {};
    const oldGroups = (f.groups || []).filter((g) => g && g.id && belongsTo(oldCat, g.displayName)
      // a name BOTH baselines claim is not a leftover of either
      && !belongsTo(curCat, g.displayName));
    const oldIds = new Set(oldGroups.map((g) => g.id));

    // policy references, from the policies already loaded — every policy in
    // the tenant counts, not only the old baseline's
    const refs = new Map();
    for (const p of f.policies || []) {
      const u = ((p.raw || p).conditions || {}).users || {};
      for (const id of [...(u.includeGroups || []), ...(u.excludeGroups || [])]) {
        if (!oldIds.has(id)) continue;
        if (!refs.has(id)) refs.set(id, []);
        refs.get(id).push({ id: p.id, name: p.name || (p.raw && p.raw.displayName) || p.id });
      }
    }

    // units of the old baseline, by name
    const wantAu = new Set([...(oldCat.personas || []).map((p) => norm(oldCat.auName(p.code))), norm(oldCat.defaultAuName)].filter(Boolean));
    const curAu = new Set([...(curCat.personas || []).map((p) => norm(curCat.auName(p.code))), norm(curCat.defaultAuName)].filter(Boolean));
    const aus = (f.aus || []).filter((a) => a && a.id && wantAu.has(norm(a.displayName)) && !curAu.has(norm(a.displayName)));
    const prot = f.protection instanceof Map ? f.protection : new Map();

    // groups first pass: safe on their own merits (references, members)
    const groupRows = oldGroups.map((g) => {
      const r = refs.get(g.id) || [];
      const members = typeof g.memberCount === "number" ? g.memberCount : null;
      const inAu = prot.get(g.id) || null;
      const why = [];
      if (isBreakGlass(oldCat, g.displayName)) why.push("break-glass group — never deleted by this tool");
      if (r.length) why.push(`still referenced by ${r.length} polic${r.length === 1 ? "y" : "ies"} — deleting it would leave ${r.length === 1 ? "that policy" : "them"} pointing at nothing`);
      if (members === null) why.push("members could not be counted");
      else if (members > 0) why.push(`has ${members} member${members === 1 ? "" : "s"} — empty it first, or keep it`);
      return {
        kind: "group", id: g.id, name: g.displayName, refs: r, members, inAu,
        roleAssignable: !!g.isAssignableToRole,
        dynamic: (g.groupTypes || []).includes("DynamicMembership"),
        ownSafe: why.length === 0, why,
      };
    });
    const ownSafeIds = new Set(groupRows.filter((r) => r.ownSafe).map((r) => r.id));

    // units: safe when every member is an old group that is safe on its own
    const auRows = aus.map((a) => {
      const members = a.members || [];
      const foreign = members.filter((m) => !oldIds.has(m.id));
      const guarding = members.filter((m) => oldIds.has(m.id) && !ownSafeIds.has(m.id));
      const why = [];
      if (foreign.length) why.push(`holds ${foreign.length} member${foreign.length === 1 ? "" : "s"} that ${foreign.length === 1 ? "is" : "are"} not ${oldCat.label} baseline groups`);
      if (guarding.length) why.push(`protects ${guarding.length} group${guarding.length === 1 ? "" : "s"} still in use — deleting the unit would leave ${guarding.length === 1 ? "it" : "them"} open to tenant-wide group administrators`);
      return {
        kind: "au", id: a.id, name: a.displayName, restricted: a.isMemberManagementRestricted === true,
        memberCount: members.length, foreign: foreign.length, guarding: guarding.length,
        scopedAdmins: typeof a.scopedAdmins === "number" ? a.scopedAdmins : null,
        safe: why.length === 0, why,
      };
    });
    const safeAuIds = new Set(auRows.filter((r) => r.safe).map((r) => r.id));

    // groups second pass: a group inside a unit that STAYS is refused
    for (const r of groupRows) {
      if (r.inAu && !safeAuIds.has(r.inAu.auId)) r.why.push(`sits in the restricted unit “${r.inAu.auName}”, which stays — remove it there first (🛡 Restricted AUs)`);
      r.safe = r.why.length === 0;
      delete r.ownSafe;
    }

    // policies: match the old catalog, not the active one
    // A number the two catalogs share (CA201 exists in both) is matched by
    // both comparisons — the Baseline tool's matcher is deliberately lenient
    // about names. So a policy is a leftover of the OLD baseline only when
    // its name is closer to the old catalog's entry than to the active one's.
    let policyRows = [];
    try {
      const rowsOld = Baseline.compare(f.policies || [], oldCat.id).rows.filter((r) => r.baseline && r.tenant && r.status !== "conflict");
      const rowsCur = new Map(Baseline.compare(f.policies || [], curCat.id).rows.filter((r) => r.baseline && r.tenant && r.status !== "conflict").map((r) => [r.tenant.id, r]));
      const leftovers = rowsOld.filter((r) => {
        const c = rowsCur.get(r.tenant.id);
        if (!c) return true;
        return Baseline.similarity(r.baseline.name, r.tenant.name) > Baseline.similarity(c.baseline.name, c.tenant.name);
      }).map((r) => r.tenant);
      policyRows = leftovers.map((p) => {
        const st = (p.raw && p.raw.state) || p.state;
        const off = st === "disabled";
        return { kind: "policy", id: p.id, name: p.name, state: stateLabel(st), safe: off,
          why: off ? [] : [`${stateLabel(st)} — still ${st === "enabled" ? "enforcing" : "evaluating sign-ins"}; set it Off first (🎚 Set Policy state), then it can go`] };
      });
    } catch { policyRows = []; }

    const byName = (a, b) => a.name.localeCompare(b.name);
    groupRows.sort(byName); auRows.sort(byName); policyRows.sort(byName);
    const all = [...auRows, ...groupRows, ...policyRows];
    return {
      old: { id: oldCat.id, label: oldCat.label, icon: oldCat.icon || "🧬" },
      cur: { id: curCat.id, label: curCat.label, icon: curCat.icon || "🧬" },
      aus: auRows, groups: groupRows, policies: policyRows,
      total: all.length,
      safe: all.filter((r) => r.safe).length,
      scannedGroups: (f.groups || []).length,
      scannedAus: (f.aus || []).length,
    };
  }

  // Run order, so a group is never deleted while its unit still guards it.
  const ORDER = { au: 0, group: 1, policy: 2 };
  const runOrder = (rows) => rows.slice().sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name));

  const mdCell = (v) => String(v ?? "").trim().replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  function toMd(plan, results, meta = {}) {
    const res = new Map((results || []).map((r) => [r.id, r]));
    const L = [`# Baseline leftovers — ${mdCell(plan.old.label)} after switching to ${mdCell(plan.cur.label)}`, "",
      `**Tenant:** ${mdCell(meta.tenant || "—")}  `, `**Generated by:** ${mdCell(meta.build || "")}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `Switching the active baseline writes nothing, so what the ${mdCell(plan.old.label)} baseline had created stayed in the tenant. This report lists it — ${plan.aus.length} administrative unit${plan.aus.length === 1 ? "" : "s"}, ${plan.groups.length} group${plan.groups.length === 1 ? "" : "s"}, ${plan.policies.length} polic${plan.policies.length === 1 ? "y" : "ies"} — and says which were safe to delete, which were refused and why${results ? ", and what this run did" : ""}.`, "",
      `| Kind | Object | Detail | Verdict | ${results ? "Result" : "—"} |`, `| --- | --- | --- | --- | --- |`];
    const row = (r, detail) => {
      const v = r.safe ? "safe to delete" : `refused — ${r.why.join("; ")}`;
      const out = res.get(r.id);
      const done = !results ? "" : !out ? "not ticked" : out.ok ? "deleted" : `FAILED — ${mdCell(out.error)}`;
      L.push(`| ${r.kind === "au" ? "restricted unit" : r.kind} | ${mdCell(r.name)} | ${mdCell(detail)} | ${mdCell(v)} | ${done} |`);
    };
    for (const r of plan.aus) row(r, `${r.restricted ? "restricted" : "NOT restricted"} · ${r.memberCount} member${r.memberCount === 1 ? "" : "s"}${r.scopedAdmins != null ? ` · ${r.scopedAdmins} scoped admin${r.scopedAdmins === 1 ? "" : "s"}` : ""}`);
    for (const r of plan.groups) row(r, `${r.members == null ? "members unknown" : `${r.members} member${r.members === 1 ? "" : "s"}`} · ${r.refs.length ? `referenced by ${r.refs.map((p) => p.name).join(", ")}` : "no policy references it"}${r.inAu ? ` · in ${r.inAu.auName}` : ""}${r.roleAssignable ? " · role-assignable" : ""}`);
    for (const r of plan.policies) row(r, `state ${r.state}`);
    L.push("", `_A group still referenced by a policy, a unit still protecting a group in use, and a policy that is not Off are never offered for deletion here. This tool only removes what has stopped doing anything; the rest is listed so it can be dealt with in the tool that owns it._`);
    return L.join("\n");
  }

  return { scan, toMd, runOrder, belongsTo };
})();
