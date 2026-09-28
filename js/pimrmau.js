// ======================================================================
// 🛡 Restricted AUs — the PIM lens (T27 in Workspace 02, beta 32422, R69).
// Pure: no DOM, no Graph. js/app.js reads, this module judges and plans.
//
// What the CloudFellows PIM framework 2.1 says about restricted management
// administrative units, and what this lens checks:
//
//   * AU-RM-EXECUTIVES (profile Large · one region) — a restricted unit for
//     executives, their devices and sensitive groups that are not
//     role-assignable. Present once, restricted (the flag is set at creation
//     and can never be changed), and the named desk SCOPED on it: the
//     profile's `scoped` list — Helpdesk, Password and Authentication
//     Administrator eligible for PIM-SG-M365-ServiceDesk-VIP, User
//     Administrator for PIM-SG-M365-Identity — each an eligibility at
//     directoryScopeId /administrativeUnits/<id>, never tenant-wide.
//   * NO PIM OBJECT IN ANY RESTRICTED UNIT. Role-assignable groups protect
//     themselves; inside a restricted unit a role-assignable group can no
//     longer have its membership changed by anybody, and PIM for Groups,
//     access reviews and lifecycle workflows stop working on what is there.
//     So a PIM-SG group, any role-assignable group, an adm- account or a
//     person who holds an Entra role, found in ANY restricted unit, is a
//     finding — with "take it out of the unit" as the (ticked by hand) fix.
//   * REGIONAL UNITS ARE NEVER RESTRICTED. AU-<REG>-Users / -Devices /
//     -Groups exist so the region's desk can act on its people; a restricted
//     one would lock the region's own admins out.
//
// check(cat, d) → { units, violations, regional, counts, profile }
//   d = { aus, members: { [auId]: [...] | null }, eligible, active,
//         groups, named, roles, policies, readAt, demo }
// plan(cat, d, res, opts) → a PimPlan (js/pimplan.js) for the ticked fixes.
// ======================================================================
const PimRmau = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kindOf = (m) => { const t = String((m && m["@odata.type"]) || "").toLowerCase(); return t.includes("group") ? "group" : t.includes("device") ? "device" : t.includes("user") ? "user" : "other"; };
  const ADM = /^adm[-_.]/i;
  const REGIONAL = /^AU-[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}-(Users|Devices|Groups)$/;
  const scopeOf = (auId) => `/administrativeUnits/${auId}`;

  function check(cat, d) {
    const p = (cat && cat.profile) || {};
    const expected = p.rmau || [];
    const scoped = p.scoped || [];
    const aus = d.aus || null;
    const byName = new Map();
    (aus || []).forEach((a) => { const k = String(a.displayName); (byName.get(k) || byName.set(k, []).get(k)).push(a); });
    const groups = new Map();
    [...(d.groups || []), ...(d.named || [])].forEach((g) => { if (g && g.displayName) (groups.get(g.displayName) || groups.set(g.displayName, []).get(g.displayName)).push(g); });
    const holders = new Set([...(d.eligible || []), ...(d.active || [])].map((a) => a.principalId));

    const units = expected.map((u) => {
      const list = byName.get(u.name) || [];
      const t = list[0];
      const base = { name: u.name, holds: u.holds || "", id: t ? t.id : null, members: null, scoped: [], extraScoped: [] };
      if (!aus) return Object.assign(base, { status: "unread" });
      if (!list.length) base.status = "missing";
      else if (list.length > 1) Object.assign(base, { status: "conflict", detail: `${list.length} units are called ${u.name} (${list.map((x) => x.id).join(", ")})` });
      else if (u.restricted && !t.isMemberManagementRestricted) Object.assign(base, { status: "unrestricted", detail: "exists, but NOT restricted — the flag is set at creation and can never be changed; rename it away and create a restricted one" });
      else base.status = "present";
      if (base.status === "present") {
        const mem = d.members ? d.members[t.id] : undefined;
        if (Array.isArray(mem)) {
          const c = { user: 0, device: 0, group: 0, other: 0 };
          mem.forEach((m) => { c[kindOf(m)]++; });
          base.members = c;
        } else base.members = null;
      }
      // The desk scoped on the unit — by id, at the unit's scope.
      base.scoped = scoped.filter((s) => s.au === u.name).map((s) => {
        const gl = groups.get(s.group) || [];
        const g = gl.length === 1 ? gl[0] : null;
        const row = { role: s.role, group: s.group, groupId: g ? g.id : null, status: "missing", detail: "" };
        if (gl.length > 1) return Object.assign(row, { status: "blocked", detail: `${gl.length} groups are called ${s.group}` });
        if (!g) return Object.assign(row, { status: "blocked", detail: `${s.group} does not exist yet — 🚀 Deploy makes it; then this eligibility can be added` });
        const mine = (d.eligible || []).filter((a) => a.principalId === g.id && a.roleName === s.role);
        const hit = base.id && mine.some((a) => a.directoryScopeId === scopeOf(base.id));
        const wide = mine.some((a) => !a.directoryScopeId || a.directoryScopeId === "/");
        if (!base.id) return Object.assign(row, { status: base.status === "missing" ? "missing" : "blocked", detail: base.status === "missing" ? "the unit is missing — created in the same run" : "the unit cannot be used" });
        if (hit && !wide) row.status = "match";
        else if (hit && wide) Object.assign(row, { status: "wide", detail: "ALSO eligible at tenant scope — wider than the unit; remove the tenant-wide one by hand" });
        else if (wide) Object.assign(row, { status: "wide", detail: "eligible at TENANT scope only — the desk can reach everybody, not only the executives" });
        return row;
      });
      if (base.id) {
        const want = new Set(base.scoped.map((s) => `${s.groupId}|${s.role}`));
        base.extraScoped = [...(d.eligible || []), ...(d.active || [])].filter((a) => a.directoryScopeId === scopeOf(base.id) && !want.has(`${a.principalId}|${a.roleName}`))
          .map((a) => ({ principal: a.principalName || a.principalId, role: a.roleName, type: a.assignmentType === "Eligible" || a.assignmentType === undefined ? "eligible" : "active" }));
      }
      return base;
    });

    // Every restricted unit: what must not be in one.
    const violations = [];
    const restricted = (aus || []).filter((a) => a.isMemberManagementRestricted);
    const unreadUnits = [];
    restricted.forEach((a) => {
      const mem = d.members ? d.members[a.id] : undefined;
      if (!Array.isArray(mem)) { unreadUnits.push(a.displayName); return; }
      mem.forEach((m) => {
        const k = kindOf(m), name = m.displayName || m.userPrincipalName || m.id;
        let why = null, kind = null;
        if (k === "group" && /^PIM-SG-/.test(m.displayName || "")) { kind = "pim-group"; why = "a PIM-SG group — PIM for Groups, access reviews and lifecycle workflows stop working on it here"; }
        else if (k === "group" && m.isAssignableToRole === true) { kind = "role-assignable"; why = "role-assignable — inside a restricted unit nobody can change its members any more"; }
        else if (k === "user" && (ADM.test(m.userPrincipalName || "") || ADM.test(m.displayName || ""))) { kind = "admin-account"; why = "an adm- account — the framework protects admins through their role-assignable groups, never a restricted unit"; }
        else if (k === "user" && holders.has(m.id)) { kind = "role-holder"; why = "holds an Entra role, eligible or active — PIM cannot manage what sits in a restricted unit"; }
        if (why) violations.push({ auId: a.id, auName: a.displayName, memberId: m.id, memberName: name, memberKind: k, kind, why });
      });
    });
    const regional = (aus || []).filter((a) => REGIONAL.test(a.displayName || "") && a.isMemberManagementRestricted).map((a) => ({ id: a.id, name: a.displayName, why: "a region's unit is restricted — its own desk is locked out; the flag cannot be removed, so recreate it unrestricted" }));
    const counts = {
      expected: units.length, present: units.filter((u) => u.status === "present").length,
      missing: units.filter((u) => u.status === "missing").length,
      problems: units.filter((u) => u.status === "unrestricted" || u.status === "conflict").length,
      scopedMissing: units.reduce((n, u) => n + u.scoped.filter((s) => s.status === "missing").length, 0),
      scopedMatch: units.reduce((n, u) => n + u.scoped.filter((s) => s.status === "match").length, 0),
      violations: violations.length, regional: regional.length, restricted: restricted.length,
    };
    return { profile: p.label || null, profileId: p.id || null, units, violations, regional, unreadUnits, counts, readAt: d.readAt || null, demo: !!d.demo, ausRead: !!aus };
  }

  // The fixes the person ticked, as a plan. `sel` holds keys:
  //   unit:<name> · scoped:<unit>|<role>|<group> · out:<auId>|<memberId>
  function plan(cat, d, res, sel, opts = {}) {
    const P = PimPlan.newPlan({ tool: "T27", tenantId: opts.tenantId || null, domain: opts.domain || null, profile: res.profileId });
    const roleId = (name) => { const r = (d.roles || []).find((x) => x.displayName === name && x.isBuiltIn !== false); return r ? r.id : null; };
    res.units.forEach((u) => {
      const unitSel = sel.has(`unit:${u.name}`);
      let auRef = u.id;
      if (u.status === "missing" && unitSel) {
        PimPlan.add(P, { key: `au:${u.name}`, method: "POST", url: `${PimPlan.V1}/directory/administrativeUnits`, produces: `au:${u.name}`, needs: ["AdministrativeUnit.ReadWrite.All"], section: "units", summary: `create restricted unit ${u.name}`,
          body: { displayName: u.name, description: `CloudFellows PIM framework: ${u.holds}`.slice(0, 1024), isMemberManagementRestricted: true } });
        auRef = `{{au:${u.name}}}`;
      }
      u.scoped.forEach((s) => {
        if (!sel.has(`scoped:${u.name}|${s.role}|${s.group}`)) return;
        if (s.status !== "missing") return;
        if (!auRef) { P.findings.push(`${s.group} → ${s.role} at ${u.name}: left out — the unit is not ticked`); return; }
        const rid = roleId(s.role);
        if (!rid) { P.blocked.push(`${s.role}: no built-in role with that name was read`); return; }
        const dur = PimPlan.eligibilityDuration((d.policies || {})[s.role], "P365D");
        if (dur.capped) P.findings.push(`${s.role} allows eligibility for at most ${dur.duration}; ${s.group} gets that`);
        PimPlan.add(P, { key: `elig:${s.role}:${s.group}:${u.name}`, kind: "request", url: `${PimPlan.V1}/roleManagement/directory/roleEligibilityScheduleRequests`, needs: ["RoleManagement.ReadWrite.Directory"], section: "scoped", summary: `${s.group} eligible for ${s.role} at ${u.name} (${dur.duration})`,
          body: PimPlan.eligibility({ principalId: s.groupId, roleDefinitionId: rid, scope: `/administrativeUnits/${auRef}`, duration: dur.duration, justification: `CloudFellows PIM framework: ${s.group} carries ${s.role} in ${u.name}` }) });
      });
    });
    res.violations.forEach((v) => {
      if (!sel.has(`out:${v.auId}|${v.memberId}`)) return;
      PimPlan.add(P, { key: `out:${v.auId}:${v.memberId}`, method: "DELETE", url: `${PimPlan.V1}/directory/administrativeUnits/${v.auId}/members/${v.memberId}/$ref`, needs: ["AdministrativeUnit.ReadWrite.All"], section: "out", removes: true, summary: `take ${v.memberName} out of ${v.auName}` });
    });
    return P;
  }
  // What is ticked by default: create what is missing, add the desk; never
  // a removal (that one is ticked by a person, per row).
  function defaultSelection(res) {
    const s = new Set();
    res.units.forEach((u) => {
      if (u.status === "missing") s.add(`unit:${u.name}`);
      u.scoped.forEach((x) => { if (x.status === "missing") s.add(`scoped:${u.name}|${x.role}|${x.group}`); });
    });
    return s;
  }

  const PILL = { present: ["ok", "✓ Present"], missing: ["bad", "∅ Missing"], unrestricted: ["bad", "⚠ Not restricted"], conflict: ["bad", "⚠ Conflict"], unread: ["na", "? Not read"], match: ["ok", "✓ Match"], wide: ["warn", "≠ Tenant-wide"], blocked: ["na", "… Blocked"] };
  const pill = (s) => `<span class="xt-pill pmb-${PILL[s][0]}">${esc(PILL[s][1])}</span>`;
  function render(res, sel, opts = {}) {
    const tab = opts.tab || "units";
    const c = res.counts;
    const tiles = `<div class="xt-tiles pmb-tiles"><div class="xt-tile${c.missing || c.problems ? " h" : ""}"><b>${c.present} / ${c.expected}</b>restricted unit${c.expected === 1 ? "" : "s"} the profile expects</div><div class="xt-tile${c.scopedMissing ? " m" : ""}"><b>${c.scopedMatch}</b>scoped eligibilities in place${c.scopedMissing ? ` · ${c.scopedMissing} missing` : ""}</div><div class="xt-tile${c.violations ? " h" : ""}"><b>${c.violations}</b>PIM objects in a restricted unit</div><div class="xt-tile${c.regional ? " h" : ""}"><b>${c.regional}</b>regional units restricted</div><div class="xt-tile"><b>${c.restricted}</b>restricted units in the tenant</div></div>`;
    const box = (key, can, label) => `<input type="checkbox" data-prlsel="${esc(key)}"${can && sel.has(key) ? " checked" : ""}${can ? "" : " disabled"} aria-label="${esc(label)}">`;
    let body = "";
    if (tab === "units") {
      body = res.units.length ? res.units.map((u) => `<div class="list-card xt-card"><h3>${box(`unit:${u.name}`, u.status === "missing", `Create ${u.name}`)} 🔒 ${esc(u.name)} ${pill(u.status)}${u.members ? ` <span class="mini">${u.members.user} people · ${u.members.device} devices · ${u.members.group} groups</span>` : ""}</h3>
        <p class="mini">Holds ${esc(u.holds)}.${u.detail ? ` <span class="pmb-bad-txt">${esc(u.detail)}</span>` : ""}${u.status === "missing" ? " Created restricted — the flag cannot be removed later — and empty: executives are added by hand once the scoped desk below is tested." : ""}</p>
        <div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Scoped on it</th><th>Group</th><th>Verdict</th></tr></thead><tbody>${u.scoped.map((s) => `<tr class="pmb-row"><td>${box(`scoped:${u.name}|${s.role}|${s.group}`, s.status === "missing", `${s.group} eligible for ${s.role} at ${u.name}`)}</td><td><b>${esc(s.role)}</b><div class="mini">eligible at ${esc(u.name)}</div></td><td>${esc(s.group)}</td><td>${pill(s.status)}${s.detail ? `<div class="mini">${esc(s.detail)}</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="4" class="mini" style="padding:12px">Nobody is scoped on it in this profile.</td></tr>`}</tbody></table></div>
        ${u.extraScoped.length ? `<p class="mini pmb-extra">Also scoped on it (not in the profile): ${esc(u.extraScoped.map((x) => `${x.principal} → ${x.role} (${x.type})`).join("; "))}.</p>` : ""}</div>`).join("")
        : `<div class="list-card xt-card"><h3>No restricted unit in profile ${esc(res.profile || "")}</h3><p class="mini">Small business and Large · multi-region keep executives in the tenant-wide desk's reach; Large · one region adds AU-RM-Executives. Switch the profile in 🧬 PIM baseline to see it. The two checks on the other tabs apply to every profile.</p></div>`;
    } else if (tab === "violations") {
      body = `<div class="list-card xt-card"><h3>PIM objects in a restricted unit <span class="mini">framework 2.1: none, in any restricted unit</span></h3>${res.unreadUnits.length ? `<p class="mini pmb-warn">Members not read for: ${esc(res.unreadUnits.join(", "))} — those units are not judged.</p>` : ""}
        <div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Member</th><th>Unit</th><th>Why it should not be there</th></tr></thead><tbody>${res.violations.map((v) => `<tr class="pmb-row pmb-differs"><td>${box(`out:${v.auId}|${v.memberId}`, true, `Take ${v.memberName} out of ${v.auName}`)}</td><td><b>${esc(v.memberName)}</b><div class="mini">${esc(v.memberKind)}</div></td><td>${esc(v.auName)}</td><td class="mini">${esc(v.why)}</td></tr>`).join("") || `<tr><td colspan="4" class="mini" style="padding:12px">None — no PIM group, role-assignable group, adm- account or role holder sits in a restricted unit.</td></tr>`}</tbody></table></div>
        <p class="mini">Ticking a row takes that member out of the unit: the object itself, its members and its roles stay. Taking an object out of a restricted unit needs Privileged Role Administrator (or a role scoped to the unit). Nothing here is ticked for you.</p></div>`;
    } else {
      body = `<div class="list-card xt-card"><h3>Regional units <span class="mini">AU-&lt;code&gt;-Users / -Devices / -Groups are never restricted</span></h3><ul class="pmb-diffs">${res.regional.map((r) => `<li><b>${esc(r.name)}</b> — ${esc(r.why)}</li>`).join("") || "<li>None of the regional units is restricted.</li>"}</ul><p class="mini">The regional units themselves are compared under 🧬 PIM baseline → 🗺 Regions.</p></div>`;
    }
    return tiles + body;
  }

  return { check, plan, defaultSelection, render, REGIONAL, ADM };
})();
