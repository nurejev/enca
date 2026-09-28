// ======================================================================
// 🎖 Roles & assignments (T49, beta 32424, R71) — pure: no DOM, no Graph.
//
// Who holds what, in one table: every Entra role that anybody holds, and
// for each assignment WHO (a person, a group, a service principal), HOW
// (eligible · active and permanent · active until a date · activated now),
// WHERE (tenant-wide or an administrative unit) and UNTIL WHEN. A group is
// opened up: its members — active and eligible, from PIM for Groups — each
// become a row "through <group>", so "who can become Global Administrator"
// has an answer in people, not in object ids.
//
//   model(cat, raw)  → { roles, rows, people, counts, … }
//     raw = { roles:[{id,displayName,isBuiltIn,templateId}],
//             eligible:[inst], active:[inst],            (roleXxxScheduleInstances, principal expanded)
//             aus:[{id,displayName}] | null,
//             groupMembers:{ [groupId]: { active:[m], eligible:[m], read:true } | { read:false, error } },
//             activations:[{principalId, roleDefinitionId, createdDateTime, status, justification, ticket}] | null,
//             protectedIds:[…], readAt, demo }
//     inst  = { roleDefinitionId, principalId, principal:{@odata.type, displayName, userPrincipalName},
//               directoryScopeId, startDateTime, endDateTime, assignmentType, memberType }
//   render(model, opts) / toCsv(model) / toMd(model)
//
// Tiers come from the CloudFellows PIM framework (the role's template in
// the profile); a role the framework does not list has no tier and is shown
// as such, never guessed.
// ======================================================================
const PimRoles = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;
  const kindOf = (p) => { const t = String((p && p["@odata.type"]) || "").toLowerCase(); return t.includes("group") ? "Group" : t.includes("serviceprincipal") ? "ServicePrincipal" : "User"; };
  const TIERS = ["Tier0", "Tier1", "Tier2", "Reader"];

  function model(cat, raw, opts = {}) {
    const now = opts.now || Date.now();
    const soon = now + (opts.soonDays || 30) * DAY;
    const defs = new Map((raw.roles || []).map((r) => [r.id, r]));
    const byTpl = new Map(((cat && cat.roles) || []).filter((r) => r.templateId).map((r) => [String(r.templateId).toLowerCase(), r]));
    const byName = new Map(((cat && cat.roles) || []).map((r) => [r.name, r]));
    const catRole = (def, id) => (def && (byTpl.get(String(def.templateId || def.id || "").toLowerCase()) || byName.get(def.displayName))) || byTpl.get(String(id || "").toLowerCase()) || null;
    const auName = new Map((raw.aus || []).map((a) => [a.id, a.displayName]));
    const scopeName = (s) => (!s || s === "/" ? "tenant" : /^\/administrativeUnits\//.test(s) ? (auName.get(s.split("/")[2]) || `unit ${s.split("/")[2]}`) : s);
    const prot = new Set(raw.protectedIds || []);
    const protRe = new RegExp(((cat && cat.protected && cat.protected.pattern) || "^$"), "i");
    const rows = [];
    const push = (inst, how, via, member) => {
      const def = defs.get(inst.roleDefinitionId);
      const cr = catRole(def, inst.roleDefinitionId);
      const name = (cr && cr.name) || (def && def.displayName) || inst.roleName || inst.roleDefinitionId;
      const who = member || { id: inst.principalId, name: (inst.principal && (inst.principal.displayName || inst.principal.userPrincipalName)) || inst.principalName || inst.principalId, upn: inst.principal && inst.principal.userPrincipalName, type: inst.principal ? kindOf(inst.principal) : (inst.principalType || "User") };
      const end = member && member.endDateTime !== undefined ? member.endDateTime : inst.endDateTime;
      const endMs = end ? Date.parse(end) : null;
      const r = {
        role: name, roleId: inst.roleDefinitionId, tier: cr ? cr.template : null, privileged: !!(def && def.isPrivileged) || (cr ? cr.template === "Tier0" : false), builtIn: def ? def.isBuiltIn !== false : true,
        principalId: who.id, principal: who.name, upn: who.upn || "", type: who.type,
        how, via: via || null, viaHow: member ? member.how : null,
        scope: inst.directoryScopeId || "/", scopeName: scopeName(inst.directoryScopeId),
        start: inst.startDateTime || null, end: end || null,
        permanent: !end, expiring: endMs != null && endMs <= soon && endMs > now,
        protected: prot.has(who.id) || (!!who.name && protRe.test(who.name)),
      };
      rows.push(r);
      return r;
    };
    (raw.eligible || []).forEach((i) => push(i, "eligible"));
    (raw.active || []).forEach((i) => push(i, i.assignmentType === "Activated" ? "activated" : "active"));
    // Through groups: each member of a group principal is a row of its own.
    const direct = rows.slice();
    const unreadGroups = new Set();
    direct.filter((r) => r.type === "Group").forEach((r) => {
      const gm = raw.groupMembers ? raw.groupMembers[r.principalId] : undefined;
      if (!gm || gm.read === false) { unreadGroups.add(r.principal); return; }
      const inst = { roleDefinitionId: r.roleId, directoryScopeId: r.scope, endDateTime: r.end, startDateTime: r.start };
      (gm.active || []).forEach((m) => push(inst, r.how, r.principal, { id: m.principalId || m.id, name: m.displayName || m.principalId, upn: m.userPrincipalName, type: m.type || "User", how: "active member", endDateTime: r.end }));
      (gm.eligible || []).forEach((m) => push(inst, "eligible", r.principal, { id: m.principalId || m.id, name: m.displayName || m.principalId, upn: m.userPrincipalName, type: m.type || "User", how: "eligible member", endDateTime: r.end }));
    });
    // Last activation per role.
    const lastBy = new Map();
    (raw.activations || []).forEach((a) => { const t = Date.parse(a.createdDateTime || 0); const k = a.roleDefinitionId; if (!lastBy.has(k) || lastBy.get(k).t < t) lastBy.set(k, { t, who: a.principalName || a.principalId, status: a.status }); });
    // Per role.
    const roleMap = new Map();
    rows.forEach((r) => {
      const k = r.role;
      if (!roleMap.has(k)) roleMap.set(k, { role: k, roleId: r.roleId, tier: r.tier, privileged: r.privileged, rows: [] });
      roleMap.get(k).rows.push(r);
    });
    const roles = [...roleMap.values()].map((x) => {
      const d = x.rows.filter((r) => !r.via);
      const people = new Set(x.rows.filter((r) => r.type === "User").map((r) => r.principalId));
      const findings = [];
      const tpl = x.tier && cat && cat.templates ? cat.templates[x.tier] : null;
      const cr = byName.get(x.role);
      const allowPermActive = tpl && (cr && cr.override && cr.override.AllowPermanentActiveAssignment !== undefined ? cr.override.AllowPermanentActiveAssignment : tpl.AllowPermanentActiveAssignment);
      const permOut = d.filter((r) => r.how === "active" && r.permanent && !r.protected);
      if (tpl && !allowPermActive && permOut.length) findings.push(`${permOut.length} permanent active outside the framework: ${permOut.map((r) => r.principal).join(", ")}`);
      const directUsers = d.filter((r) => r.type === "User" && r.how === "eligible" && !r.protected);
      if (x.tier && directUsers.length) findings.push(`${directUsers.length} ${directUsers.length === 1 ? "person is" : "people are"} eligible directly, not through a PIM-SG group: ${directUsers.map((r) => r.principal).join(", ")}`);
      const forever = d.filter((r) => r.how === "eligible" && r.permanent);
      if (tpl && !tpl.AllowPermanentEligibility && forever.length) findings.push(`${forever.length} eligibilit${forever.length === 1 ? "y" : "ies"} never expire${forever.length === 1 ? "s" : ""} — the tier caps eligibility at ${tpl.MaximumEligibilityDuration}`);
      const last = lastBy.get(x.roleId);
      return {
        role: x.role, roleId: x.roleId, tier: x.tier, privileged: x.privileged,
        eligible: d.filter((r) => r.how === "eligible").length, active: d.filter((r) => r.how === "active").length,
        permanent: d.filter((r) => r.how === "active" && r.permanent).length, activated: d.filter((r) => r.how === "activated").length,
        scoped: d.filter((r) => r.scope !== "/").length, expiring: x.rows.filter((r) => r.expiring).length,
        groups: d.filter((r) => r.type === "Group").length, people: people.size,
        protectedPermanent: d.filter((r) => r.how === "active" && r.permanent && r.protected).length,
        lastActivation: last ? { at: new Date(last.t).toISOString(), who: last.who, status: last.status } : null,
        findings, rows: x.rows,
      };
    }).sort((a, b) => (TIERS.indexOf(a.tier) + 1 || 9) - (TIERS.indexOf(b.tier) + 1 || 9) || b.privileged - a.privileged || a.role.localeCompare(b.role));
    // Per person: every role, and how.
    const pmap = new Map();
    rows.filter((r) => r.type !== "Group").forEach((r) => {
      if (!pmap.has(r.principalId)) pmap.set(r.principalId, { id: r.principalId, name: r.principal, upn: r.upn, type: r.type, rows: [], protected: r.protected });
      pmap.get(r.principalId).rows.push(r);
    });
    const people = [...pmap.values()].map((p) => Object.assign(p, { roles: [...new Set(p.rows.map((r) => r.role))], tier0: p.rows.some((r) => r.tier === "Tier0"), direct: p.rows.some((r) => !r.via) })).sort((a, b) => b.tier0 - a.tier0 || b.roles.length - a.roles.length || a.name.localeCompare(b.name));
    const counts = {
      roles: roles.length, eligible: roles.reduce((n, r) => n + r.eligible, 0), active: roles.reduce((n, r) => n + r.active, 0), permanent: roles.reduce((n, r) => n + r.permanent, 0),
      activated: roles.reduce((n, r) => n + r.activated, 0), scoped: roles.reduce((n, r) => n + r.scoped, 0), expiring: rows.filter((r) => r.expiring).length,
      people: people.filter((p) => p.type === "User").length, findings: roles.reduce((n, r) => n + r.findings.length, 0),
    };
    return { roles, rows, people, counts, unreadGroups: [...unreadGroups], activationsRead: Array.isArray(raw.activations), readAt: raw.readAt || null, demo: !!raw.demo, soonDays: opts.soonDays || 30 };
  }

  const HOW = { eligible: ["info", "eligible"], active: ["warn", "active"], activated: ["ok", "activated now"] };
  const day = (s) => (s ? new Date(s).toISOString().slice(0, 10) : "");
  const when = (r) => (r.permanent ? (r.how === "eligible" ? "no end date" : "permanent") : `until ${day(r.end)}`);
  function hit(q, ...xs) { return !q || xs.join(" ").toLowerCase().includes(q); }
  function render(m, opts = {}) {
    const tab = opts.tab || "roles", f = opts.filter || "all", q = String(opts.q || "").trim().toLowerCase();
    const c = m.counts;
    const tiles = `<div class="xt-tiles pmb-tiles"><div class="xt-tile"><b>${c.roles}</b>roles held</div><div class="xt-tile"><b>${c.eligible}</b>eligible assignments</div><div class="xt-tile${c.permanent ? " m" : ""}"><b>${c.permanent}</b>permanent active</div><div class="xt-tile"><b>${c.activated}</b>activated now</div><div class="xt-tile"><b>${c.scoped}</b>scoped to a unit</div><div class="xt-tile${c.expiring ? " m" : ""}"><b>${c.expiring}</b>ending within ${m.soonDays} days</div><div class="xt-tile"><b>${c.people}</b>people who can hold a role</div></div>`;
    const tierPill = (t) => (t ? `<span class="pmb-tier pmb-tier-${esc(t)}">${esc(t)}</span>` : `<span class="mini">not in the framework</span>`);
    const howPill = (r) => `<span class="xt-pill pmb-${HOW[r.how][0]}">${esc(HOW[r.how][1])}</span>`;
    const aRow = (r) => `<tr class="pmb-row"><td><b>${esc(r.principal)}</b>${r.upn && r.upn !== r.principal ? `<div class="mini">${esc(r.upn)}</div>` : ""}${r.protected ? ` <span class="xt-pill pmb-na">break-glass</span>` : ""}</td><td class="mini">${esc(r.type)}${r.via ? ` · through <b>${esc(r.via)}</b> (${esc(r.viaHow)})` : " · direct"}</td><td>${howPill(r)}</td><td class="mini">${esc(r.scopeName)}</td><td class="mini${r.expiring ? " pmb-bad-txt" : ""}">${esc(when(r))}</td></tr>`;
    const head = `<thead><tr><th>Who</th><th>How it is held</th><th></th><th>Scope</th><th>Until</th></tr></thead>`;
    let body = "";
    if (tab === "roles") {
      let roles = m.roles.filter((r) => hit(q, r.role, r.tier || "", r.rows.map((x) => x.principal).join(" ")));
      if (f === "permanent") roles = roles.filter((r) => r.permanent);
      else if (f === "activated") roles = roles.filter((r) => r.activated);
      else if (f === "findings") roles = roles.filter((r) => r.findings.length);
      else if (f === "tier0") roles = roles.filter((r) => r.tier === "Tier0");
      body = `<div class="list-card xt-card"><h3>Entra roles <span class="mini">${roles.length} of ${m.roles.length} · open a row for every assignment, people through groups included</span></h3>${roles.map((r) => `<details class="pr-role"${opts.open && opts.open.has(r.role) ? " open" : ""} data-prrole="${esc(r.role)}"><summary><b>${esc(r.role)}</b> ${tierPill(r.tier)} <span class="mini">${r.eligible} eligible · ${r.active} active${r.permanent ? ` (<span class="pmb-bad-txt">${r.permanent} permanent${r.protectedPermanent ? `, ${r.protectedPermanent} break-glass` : ""}</span>)` : ""} · ${r.activated} activated now${r.scoped ? ` · ${r.scoped} at a unit` : ""} · ${r.people} ${r.people === 1 ? "person" : "people"}${r.lastActivation ? ` · last activated ${esc(day(r.lastActivation.at))} by ${esc(r.lastActivation.who)}` : ""}</span>${r.findings.length ? ` <span class="xt-pill pmb-warn">⚠ ${r.findings.length}</span>` : ""}</summary>${r.findings.length ? `<ul class="pmb-diffs pmb-findings">${r.findings.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<div class="xt-tw"><table class="xt-tbl pmb-rtbl">${head}<tbody>${r.rows.map(aRow).join("")}</tbody></table></div></details>`).join("") || `<p class="mini" style="padding:12px">Nothing under this filter.</p>`}</div>`;
    } else if (tab === "people") {
      const ps = m.people.filter((p) => hit(q, p.name, p.upn, p.roles.join(" ")));
      body = `<div class="list-card xt-card"><h3>Who holds what <span class="mini">${ps.length} principals · directly and through groups</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Who</th><th>Roles</th><th>How</th></tr></thead><tbody>${ps.map((p) => `<tr class="pmb-row"><td><b>${esc(p.name)}</b>${p.upn && p.upn !== p.name ? `<div class="mini">${esc(p.upn)}</div>` : ""}${p.tier0 ? ` <span class="pmb-tier pmb-tier-Tier0">Tier0</span>` : ""}</td><td class="mini">${esc(p.roles.join(", "))}</td><td class="mini">${p.rows.map((r) => `${esc(r.role)}: ${esc(HOW[r.how][1])}${r.via ? ` through ${esc(r.via)}` : " directly"}${r.scope !== "/" ? ` at ${esc(r.scopeName)}` : ""}`).join("<br>")}</td></tr>`).join("") || `<tr><td colspan="3" class="mini" style="padding:12px">Nobody matches.</td></tr>`}</tbody></table></div></div>`;
    } else {
      const pick = tab === "scoped" ? m.rows.filter((r) => r.scope !== "/") : m.rows.filter((r) => r.expiring || (tab === "expiring" && r.how === "eligible" && r.permanent && r.tier && r.tier !== "Reader"));
      const list = pick.filter((r) => hit(q, r.role, r.principal, r.scopeName, r.via || ""));
      body = `<div class="list-card xt-card"><h3>${tab === "scoped" ? "Scoped to an administrative unit" : `Ending within ${m.soonDays} days — and eligibilities with no end the tier does not allow`} <span class="mini">${list.length}</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Role</th><th>Who</th><th>How it is held</th><th></th><th>Scope</th><th>Until</th></tr></thead><tbody>${list.map((r) => `<tr class="pmb-row"><td><b>${esc(r.role)}</b></td>${aRow(r).replace(/^<tr class="pmb-row">/, "").replace(/<\/tr>$/, "")}</tr>`).join("") || `<tr><td colspan="6" class="mini" style="padding:12px">None.</td></tr>`}</tbody></table></div></div>`;
    }
    const notes = [m.unreadGroups.length ? `Members not read for ${m.unreadGroups.length} group${m.unreadGroups.length === 1 ? "" : "s"} (${m.unreadGroups.slice(0, 6).join(", ")}${m.unreadGroups.length > 6 ? ", …" : ""}) — the people behind them are not counted.` : "", m.activationsRead ? "" : "Activation history not read — no last activation is shown."].filter(Boolean);
    return tiles + (notes.length ? `<p class="mini pmb-warn">${notes.map(esc).join(" ")}</p>` : "") + body;
  }
  function toCsv(m) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return ["role,tier,principal,upn,type,how,through,memberHow,scope,start,end,permanent,expiring,breakGlass", ...m.rows.map((r) => [r.role, r.tier || "", r.principal, r.upn, r.type, r.how, r.via || "", r.viaHow || "", r.scopeName, r.start || "", r.end || "", r.permanent, r.expiring, r.protected].map(q).join(","))].join("\n");
  }
  function toMd(m, tenant) {
    const L = [`# 🎖 Roles & assignments — ${tenant || "tenant"}`, "", `${m.demo ? "Demo data. " : ""}${m.counts.roles} roles held · ${m.counts.eligible} eligible · ${m.counts.active} active (${m.counts.permanent} permanent) · ${m.counts.activated} activated now · ${m.counts.scoped} scoped · ${m.counts.expiring} ending soon · ${m.counts.people} people.`, "", "| Role | Tier | Eligible | Active | Permanent | Activated | Scoped | People | Findings |", "|---|---|---|---|---|---|---|---|---|"];
    m.roles.forEach((r) => L.push(`| ${r.role} | ${r.tier || "—"} | ${r.eligible} | ${r.active} | ${r.permanent} | ${r.activated} | ${r.scoped} | ${r.people} | ${r.findings.join("; ") || "—"} |`));
    return L.join("\n");
  }
  return { model, render, toCsv, toMd };
})();
