// ======================================================================
// PIM lenses on the carried-over tools (beta 32428, R75) — pure.
//
// Workspace 02 carries five tools over from 01 with their own T-number:
// 🛡 Checks (T08), 👥 CA groups (T12), 🕓 Changes (T16), 🚦 Sign-in log (T17)
// and 🔗 User or Group analyzer (T19). Opened from 02, each shows a PIM LENS
// above its own screen — the PIM-only view of the same question — built from
// the reads PIM-buddy already makes (🧬 T48, 🎖 T49, 📱 T53, 🛡 T27) plus the
// two only a lens needs (the PIM audit events, the activation requests).
// The tool underneath is untouched and works as in 01.
//
//   checks(ctx)          T08 — the PIM checks catalogue, each pass / fail /
//                        not read, with the tool that fixes it
//   groups(ctx)          T12 — role-assignable groups as PIM groups
//   audit(events)        T16 — PIM changes from the directory audit log
//   activations(reqs)    T17 — activation requests and how they ended
//   whois(ctx, q)        T19 — one person or group: every role and how,
//                        and the Conditional Access policies that gate
//                        activation through the authentication context
//   azure(raw, cat)      T49's ☁ Azure RBAC tab — PIM for Azure resources
// ======================================================================
const PimLens = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SEV = { critical: 0, high: 1, medium: 2, low: 3, pass: 9 };

  // ---- T08 ---------------------------------------------------------------
  // ctx = { cat, res (T48 compare) | null, roles (T49 model) | null,
  //         intune (T53 compare) | null, rmau (T27 check) | null, caPolicies: [raw] }
  function checks(ctx) {
    const out = [];
    const add = (id, sev, title, detail, state, open) => out.push({ id, sev, title, detail, state, open });
    const res = ctx.res, R = ctx.roles;
    // 1. Permanent Global Administrator outside the framework
    if (res) {
      const ga = res.rows.find((r) => r.name === "Global Administrator");
      if (ga) add("ga-permanent", "critical", "Permanent active Global Administrator outside the framework", ga.permanentOutside ? ga.findings.filter((f) => /permanent active outside/.test(f)).join("; ") : `${ga.protectedPermanent} break-glass account${ga.protectedPermanent === 1 ? "" : "s"}, nobody else`, ga.permanentOutside ? "fail" : "pass", "toolPimRoles");
      add("breakglass", "high", "Break-glass accounts hold Global Administrator permanently", ga && ga.protectedPermanent ? `${ga.protectedPermanent} found by the framework's pattern — list their object ids to protect them by id` : "none found by the framework's pattern — check the break-glass accounts exist and are named so", ga && ga.protectedPermanent ? "pass" : "fail", "toolPimRoles");
    } else add("ga-permanent", "critical", "Permanent active Global Administrator outside the framework", "🧬 PIM baseline not read", "unread", "toolPimBaseline");
    // 2. Global Administrator count
    if (R) {
      const ga = R.roles.find((r) => r.role === "Global Administrator");
      const n = ga ? new Set(ga.rows.filter((r) => r.type === "User").map((r) => r.principalId)).size : 0;
      add("ga-count", "high", "Two to four people can be Global Administrator", `${n} ${n === 1 ? "person" : "people"}, break-glass included, directly and through groups`, n >= 2 && n <= 4 ? "pass" : "fail", "toolPimRoles");
      const direct = R.roles.reduce((k, r) => k + r.findings.filter((f) => /eligible directly/.test(f)).length, 0);
      add("direct", "medium", "Roles held through PIM-SG groups, not directly", direct ? `${direct} role${direct === 1 ? " has" : "s have"} people eligible directly — ${R.roles.filter((r) => r.findings.some((f) => /eligible directly/.test(f))).map((r) => r.role).slice(0, 6).join(", ")}` : "every eligible person holds the role through a group", direct ? "fail" : "pass", "toolPimRoles");
      const never = R.roles.filter((r) => r.findings.some((f) => /never expire/.test(f)));
      add("expiry", "medium", "Eligibility expires within a year", never.length ? `eligibilities with no end on ${never.map((r) => r.role).slice(0, 6).join(", ")}` : "no eligibility without an end where the tier caps it", never.length ? "fail" : "pass", "toolPimRoles");
    } else ["ga-count", "direct", "expiry"].forEach((id) => add(id, id === "ga-count" ? "high" : "medium", { "ga-count": "Two to four people can be Global Administrator", direct: "Roles held through PIM-SG groups, not directly", expiry: "Eligibility expires within a year" }[id], "🎖 Roles & assignments not read", "unread", "toolPimRoles"));
    // 3. Tier 0 activation: context and approval
    if (res) {
      const t0 = res.rows.filter((r) => r.tier === "Tier0" && r.got);
      const noCtx = t0.filter((r) => !r.got.authContext && r.expected.authContext);
      const noAppr = t0.filter((r) => r.got.approval !== true && r.expected.approval);
      add("t0-context", "high", "Tier 0 activation requires the authentication context", noCtx.length ? `without it: ${noCtx.map((r) => r.name).join(", ")}` : `${t0.length} Tier 0 role${t0.length === 1 ? "" : "s"} read, all require it`, noCtx.length ? "fail" : t0.length ? "pass" : "unread", "toolPimBaseline");
      add("t0-approval", "high", "Tier 0 activation needs approval", noAppr.length ? `no approval on ${noAppr.map((r) => r.name).join(", ")}` : "every Tier 0 role the profile gates is gated", noAppr.length ? "fail" : t0.length ? "pass" : "unread", "toolPimBaseline");
      const notRA = res.groups.filter((g) => g.present && g.roleAssignable === false);
      add("group-ra", "high", "PIM-SG groups are role-assignable", notRA.length ? `not role-assignable: ${notRA.map((g) => g.name).join(", ")} — recreate them` : `${res.gcounts.present} present, all role-assignable`, notRA.length ? "fail" : "pass", "toolPimBaseline");
      const permMember = res.groups.filter((g) => g.diffs.some((d) => d.key === "permActive" && d.rawTenant === true));
      add("group-perm", "medium", "Group membership is never permanent", permMember.length ? `permanent membership allowed on ${permMember.map((g) => g.name).join(", ")}` : "no PIM-SG group allows it (of those read)", permMember.length ? "fail" : "pass", "toolPimBaseline");
      const missing = res.groups.filter((g) => !g.present && g.scope !== "azure");
      add("groups-present", "medium", "The profile's PIM-SG groups exist", missing.length ? `${missing.length} missing: ${missing.map((g) => g.name).slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}` : "all present", missing.length ? "fail" : "pass", "toolPimDeploy");
    }
    // 4. Intune
    if (ctx.intune) {
      const st = ctx.intune.other.filter((o) => o.finding);
      add("intune-standing", "high", "Intune roles are held through PIM-SG-INT access groups", st.length ? `${st.length} assignment${st.length === 1 ? "" : "s"} held standing: ${st.map((o) => o.name).join(", ")}` : "every other assignment is held by an access group", st.length ? "fail" : "pass", "toolIntuneRbac");
    } else add("intune-standing", "high", "Intune roles are held through PIM-SG-INT access groups", "📱 Intune RBAC not read", "unread", "toolIntuneRbac");
    // 5. Restricted units
    if (ctx.rmau) add("rmau-pim", "high", "No PIM object in a restricted unit", ctx.rmau.violations.length ? `${ctx.rmau.violations.length}: ${ctx.rmau.violations.map((v) => `${v.memberName} in ${v.auName}`).join(", ")}` : "none", ctx.rmau.violations.length ? "fail" : "pass", "toolRmau");
    else add("rmau-pim", "high", "No PIM object in a restricted unit", "🛡 Restricted AUs' PIM lens not read", "unread", "toolRmau");
    // 6. The context is enforced by Conditional Access
    const ctxId = (ctx.cat && ctx.cat.authContext && ctx.cat.authContext.id) || "c1";
    const gate = (ctx.caPolicies || []).filter((p) => ((((p.conditions || {}).applications || {}).includeAuthenticationContextClassReferences) || []).includes(ctxId));
    const on = gate.filter((p) => p.state === "enabled");
    add("ctx-policy", "critical", `A Conditional Access policy enforces authentication context ${ctxId}`, ctx.caPolicies ? (on.length ? `${on.map((p) => p.displayName).join(", ")}` : gate.length ? `only report-only or off: ${gate.map((p) => p.displayName).join(", ")} — Tier 0 activates with nothing behind the context` : "no policy targets it — Tier 0 activation asks for a context nothing enforces") : "Conditional Access policies not loaded", !ctx.caPolicies ? "unread" : on.length ? "pass" : "fail", "toolPolicies");
    return out.sort((a, b) => (a.state === "pass") - (b.state === "pass") || (a.state === "unread") - (b.state === "unread") || SEV[a.sev] - SEV[b.sev]);
  }
  const STATE = { fail: ["bad", "✗ fails"], pass: ["ok", "✓ passes"], unread: ["na", "? not read"] };
  function renderChecks(list) {
    const n = { fail: list.filter((c) => c.state === "fail").length, pass: list.filter((c) => c.state === "pass").length, unread: list.filter((c) => c.state === "unread").length };
    return `<p class="mini">${n.fail} failing · ${n.pass} passing · ${n.unread} not read</p><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Check</th><th>What was found</th><th></th></tr></thead><tbody>${list.map((c) => `<tr class="pmb-row"><td><span class="xt-pill pmb-${STATE[c.state][0]}">${esc(STATE[c.state][1])}</span>${c.state === "fail" ? ` <span class="sev ${c.sev}">${esc(c.sev)}</span>` : ""}</td><td><b>${esc(c.title)}</b></td><td class="mini">${esc(c.detail)}</td><td>${c.open ? `<button class="btn sm" data-lensopen="${esc(c.open)}">Open →</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // ---- T12 ---------------------------------------------------------------
  function groups(ctx) {
    const raw = ctx.raw; if (!raw) return null;
    const res = ctx.res, gm = (ctx.rolesRaw && ctx.rolesRaw.groupMembers) || {};
    const held = (id) => [...(raw.eligible || []).map((a) => Object.assign({ how: "eligible" }, a)), ...(raw.active || []).map((a) => Object.assign({ how: a.assignmentType === "Activated" ? "activated" : "active" }, a))].filter((a) => a.principalId === id);
    return (raw.groups || []).filter((g) => g.isAssignableToRole !== false).map((g) => {
      const h = held(g.id);
      const fw = res ? res.groups.find((x) => x.name === g.displayName) : null;
      const m = gm[g.id];
      return { id: g.id, name: g.displayName, framework: fw ? fw.status : /^PIM-SG-/.test(g.displayName) ? "regional or other" : "not in the framework", roles: h.map((a) => `${a.roleName}${a.how !== "eligible" ? ` (${a.how})` : ""}${a.directoryScopeId && a.directoryScopeId !== "/" ? " at a unit" : ""}`), active: m && m.read ? (m.active || []).length : null, eligible: m && m.read ? (m.eligible || []).length : null };
    }).sort((a, b) => b.roles.length - a.roles.length || a.name.localeCompare(b.name));
  }
  function renderGroups(rows) {
    return `<div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Role-assignable group</th><th>Framework</th><th>Roles it holds</th><th>Members</th></tr></thead><tbody>${rows.map((g) => `<tr class="pmb-row"><td><b>${esc(g.name)}</b></td><td class="mini">${esc(g.framework)}</td><td class="mini">${esc(g.roles.join(", ") || "none")}</td><td class="mini">${g.active == null ? "read in 🎖 Roles & assignments" : `${g.active} active · ${g.eligible} eligible`}</td></tr>`).join("") || `<tr><td colspan="4" class="mini" style="padding:12px">No role-assignable group.</td></tr>`}</tbody></table></div>`;
  }

  // ---- T16 ---------------------------------------------------------------
  function audit(events) {
    return (events || []).map((e) => ({
      at: e.activityDateTime, activity: e.activityDisplayName || e.operationType || "?", result: e.result || "",
      by: (e.initiatedBy && ((e.initiatedBy.user && (e.initiatedBy.user.userPrincipalName || e.initiatedBy.user.displayName)) || (e.initiatedBy.app && e.initiatedBy.app.displayName))) || "",
      target: (e.targetResources || []).map((t) => t.displayName || t.userPrincipalName || t.id).filter(Boolean).join(" → "),
      reason: e.resultReason || "",
      kind: /setting|policy/i.test(e.activityDisplayName || "") ? "setting" : /activat/i.test(e.activityDisplayName || "") ? "activation" : /eligible|assign|member/i.test(e.activityDisplayName || "") ? "assignment" : "other",
    })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function renderAudit(rows, f) {
    const list = rows.filter((r) => !f || f === "all" || r.kind === f);
    const K = [["all", "All"], ["setting", "Role settings"], ["assignment", "Assignments"], ["activation", "Activations"]];
    return `<div class="chip-filter">${K.map(([k, l]) => `<button class="fchip${(f || "all") === k ? " active" : ""}" data-lensaudit="${k}">${esc(l)} (${k === "all" ? rows.length : rows.filter((r) => r.kind === k).length})</button>`).join("")}</div><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th><th></th></tr></thead><tbody>${list.slice(0, 300).map((r) => `<tr class="pmb-row"><td class="mini">${esc(new Date(r.at).toLocaleString())}</td><td class="mini">${esc(r.by)}</td><td><b>${esc(r.activity)}</b>${r.reason ? `<div class="mini">${esc(r.reason)}</div>` : ""}</td><td class="mini">${esc(r.target)}</td><td class="mini ${/fail/i.test(r.result) ? "pmb-bad-txt" : ""}">${esc(r.result)}</td></tr>`).join("") || `<tr><td colspan="5" class="mini" style="padding:12px">No PIM change in the window.</td></tr>`}</tbody></table></div>`;
  }

  // ---- T17 ---------------------------------------------------------------
  function activations(reqs) {
    return (reqs || []).map((r) => ({ at: r.createdDateTime, who: r.principalName || r.principalId, role: r.roleName || r.roleDefinitionId, status: r.status || "", justification: r.justification || "", ticket: (r.ticketInfo && r.ticketInfo.ticketNumber) || "", ok: /Provisioned|Granted|ScheduleCreated/i.test(r.status || ""), pending: /Pending/i.test(r.status || "") })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function renderActivations(rows) {
    const n = { ok: rows.filter((r) => r.ok).length, pending: rows.filter((r) => r.pending).length };
    return `<p class="mini">${rows.length} requests · ${n.ok} granted · ${n.pending} waiting for approval · ${rows.length - n.ok - n.pending} refused, failed or cancelled</p><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Justification · ticket</th><th>Outcome</th></tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr class="pmb-row"><td class="mini">${esc(new Date(r.at).toLocaleString())}</td><td><b>${esc(r.who)}</b></td><td>${esc(r.role)}</td><td class="mini">${esc(r.justification)}${r.ticket ? ` · ${esc(r.ticket)}` : ""}</td><td><span class="xt-pill pmb-${r.ok ? "ok" : r.pending ? "warn" : "bad"}">${esc(r.status)}</span></td></tr>`).join("") || `<tr><td colspan="5" class="mini" style="padding:12px">No activation requests.</td></tr>`}</tbody></table></div>`;
  }

  // ---- T19 ---------------------------------------------------------------
  function whois(ctx, q) {
    const R = ctx.roles; if (!R || !q) return null;
    const s = String(q).trim().toLowerCase();
    const people = R.people.filter((p) => String(p.name).toLowerCase().includes(s) || String(p.upn || "").toLowerCase().includes(s));
    const groupsHit = [...new Set(R.rows.filter((r) => r.type === "Group" && !r.via && String(r.principal).toLowerCase().includes(s)).map((r) => r.principal))];
    const ctxId = (ctx.cat && ctx.cat.authContext && ctx.cat.authContext.id) || "c1";
    const gate = (ctx.caPolicies || []).filter((p) => ((((p.conditions || {}).applications || {}).includeAuthenticationContextClassReferences) || []).includes(ctxId));
    return {
      people: people.slice(0, 10).map((p) => ({ name: p.name, upn: p.upn, rows: p.rows.map((r) => ({ role: r.role, tier: r.tier, how: r.how, via: r.via, viaHow: r.viaHow, scope: r.scopeName, end: r.end })) })),
      groups: groupsHit.slice(0, 10).map((g) => ({ name: g, roles: R.rows.filter((r) => r.principal === g && !r.via).map((r) => `${r.role} (${r.how}${r.scope !== "/" ? ` at ${r.scopeName}` : ""})`), members: [...new Set(R.rows.filter((r) => r.via === g).map((r) => `${r.principal} (${r.viaHow})`))] })),
      gate: gate.map((p) => ({ name: p.displayName, state: p.state })), ctxId, caRead: !!ctx.caPolicies,
    };
  }
  function renderWhois(w) {
    if (!w) return "";
    const gateTxt = !w.caRead ? "Conditional Access policies not loaded." : w.gate.length ? `Activating a Tier 0 role asks for authentication context ${w.ctxId}, enforced by: ${w.gate.map((g) => `${g.name} (${g.state})`).join(", ")}.` : `Tier 0 activation asks for authentication context ${w.ctxId} and no Conditional Access policy targets it.`;
    return `${w.people.map((p) => `<div class="list-card xt-card"><h3>${esc(p.name)} <span class="mini">${esc(p.upn || "")}</span></h3><ul class="pmb-diffs">${p.rows.map((r) => `<li><b>${esc(r.role)}</b>${r.tier ? ` <span class="pmb-tier pmb-tier-${esc(r.tier)}">${esc(r.tier)}</span>` : ""} — ${esc(r.how)}${r.via ? ` through ${esc(r.via)} (${esc(r.viaHow)})` : " directly"}${r.scope !== "tenant" ? ` at ${esc(r.scope)}` : ""}${r.end ? ` until ${esc(String(r.end).slice(0, 10))}` : r.how === "eligible" ? ", no end" : ", permanent"}</li>`).join("")}</ul>${p.rows.some((r) => r.tier === "Tier0") ? `<p class="mini">${esc(gateTxt)}</p>` : ""}</div>`).join("")}${w.groups.map((g) => `<div class="list-card xt-card"><h3>${esc(g.name)} <span class="mini">group</span></h3><p class="mini"><b>Holds:</b> ${esc(g.roles.join(", ") || "nothing")}</p><p class="mini"><b>Members:</b> ${esc(g.members.join(", ") || "none read")}</p></div>`).join("")}${!w.people.length && !w.groups.length ? `<p class="mini">Nobody by that name holds a role.</p>` : ""}`;
  }

  // ---- Azure RBAC (T49's ☁ tab) ---------------------------------------------
  // raw = { scopes:[{id, name, type}], eligible:[inst], active:[inst], errors:[…] }
  // inst = ARM roleEligibilityScheduleInstance / roleAssignmentScheduleInstance
  const PRIV = /^(Owner|User Access Administrator|Role Based Access Control Administrator)$/;
  function azure(raw, cat) {
    if (!raw) return null;
    const row = (i, how) => { const p = i.properties || i, x = p.expandedProperties || {}; return { scope: (x.scope && x.scope.displayName) || p.scope, scopeType: (x.scope && x.scope.type) || "", role: (x.roleDefinition && x.roleDefinition.displayName) || p.roleDefinitionId, principal: (x.principal && x.principal.displayName) || p.principalId, principalId: p.principalId, principalType: (x.principal && x.principal.type) || p.principalType || "", how: how === "active" && p.assignmentType === "Activated" ? "activated" : how, end: p.endDateTime || null, memberType: p.memberType || "" }; };
    const rows = [...(raw.eligible || []).map((i) => row(i, "eligible")), ...(raw.active || []).map((i) => row(i, "active"))];
    const findings = [];
    rows.filter((r) => r.how === "active" && !r.end && PRIV.test(r.role) && /User/i.test(r.principalType) && r.memberType !== "Inherited").forEach((r) => findings.push(`${r.principal} holds ${r.role} on ${r.scope} permanently and directly — make it an eligibility through a PIM-SG-AZ group`));
    const azGroups = [...((cat && cat.groups) || []), ...((cat && cat.groupsSmall) || [])].filter((g) => g.scope === "azure");
    const groupRows = azGroups.map((g) => {
      const mine = rows.filter((r) => r.principal === g.name);
      const el = mine.filter((r) => r.how === "eligible");
      const act = mine.filter((r) => r.how === "active" && r.memberType !== "Inherited");
      if (act.length) findings.push(`${g.name} holds ${act.map((r) => `${r.role} on ${r.scope}`).join(", ")} ACTIVE — the framework makes it eligible`);
      return { name: g.name, want: `${g.azure.role} · ${g.azure.scope}`, eligible: el.map((r) => `${r.role} on ${r.scope}`), active: act.map((r) => `${r.role} on ${r.scope}`), ok: el.some((r) => r.role === g.azure.role) };
    });
    return { rows, groups: groupRows, findings, scopes: raw.scopes || [], errors: raw.errors || [], readAt: raw.readAt || null, demo: !!raw.demo };
  }
  function renderAzure(m) {
    return `<div class="xt-tiles pmb-tiles"><div class="xt-tile"><b>${m.scopes.length}</b>subscriptions and management groups read</div><div class="xt-tile"><b>${m.rows.filter((r) => r.how === "eligible").length}</b>eligible</div><div class="xt-tile"><b>${m.rows.filter((r) => r.how !== "eligible").length}</b>active</div><div class="xt-tile${m.findings.length ? " h" : ""}"><b>${m.findings.length}</b>findings</div></div>${m.errors.length ? `<p class="mini pmb-warn">Not read: ${esc(m.errors.join("; "))}</p>` : ""}${m.findings.length ? `<ul class="pmb-diffs pmb-findings">${m.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      <div class="list-card xt-card"><h3>PIM-SG-AZ groups <span class="mini">eligible for their Azure role where the framework puts them — the scope's real name is yours</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Group</th><th>Framework</th><th>Eligible for</th><th>Active</th></tr></thead><tbody>${m.groups.map((g) => `<tr class="pmb-row${g.ok ? "" : " pmb-missing"}"><td><b>${esc(g.name)}</b></td><td class="mini">${esc(g.want)}</td><td class="mini">${esc(g.eligible.join(", ") || "nothing")}</td><td class="mini ${g.active.length ? "pmb-bad-txt" : ""}">${esc(g.active.join(", ") || "—")}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="list-card xt-card"><h3>Every Azure role assignment read</h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Scope</th><th>Role</th><th>Who</th><th>How</th><th>Until</th></tr></thead><tbody>${m.rows.slice(0, 500).map((r) => `<tr class="pmb-row"><td class="mini">${esc(r.scope)} <span class="mini">${esc(r.scopeType)}</span></td><td><b>${esc(r.role)}</b></td><td>${esc(r.principal)} <span class="mini">${esc(r.principalType)}</span></td><td class="mini">${esc(r.how)}${r.memberType === "Inherited" ? " · inherited" : ""}</td><td class="mini">${r.end ? esc(String(r.end).slice(0, 10)) : "no end"}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  return { checks, renderChecks, groups, renderGroups, audit, renderAudit, activations, renderActivations, whois, renderWhois, azure, renderAzure };
})();
