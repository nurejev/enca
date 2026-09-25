// ======================================================================
// 🧬 PIM baseline (T48, build 32408, R68) — pure module, no DOM, no Graph.
//
// What it does, in order:
//   expected(cat, role)      the settings a catalog role (or group) should
//                            have: its template, then its override
//   fromRules(rules, names)  the same shape out of Graph's
//                            unifiedRoleManagementPolicy rules
//   compare(cat, tenant)     one row per catalog role and per catalog group,
//                            setting by setting; verdicts, counts
//   toOrchestrator(cat, o)   the catalog — or the delta — as an
//                            EasyPIM.Orchestrator config (PolicyTemplates,
//                            EntraRoles.Policies, GroupRoles.Policies,
//                            Assignments.EntraRoles, ProtectedUsers)
//   render / tiles / chips   the screen, as HTML strings
//   toMd(res)                the gap report
//
// The shape both sides are normalised to (SETTINGS):
//   activation      ISO 8601 max activation duration      Expiration_EndUser_Assignment
//   enablement      sorted array of enabled rules          Enablement_EndUser_Assignment
//   authContext     claim value or null                    AuthenticationContext_EndUser_Assignment
//   approval        boolean                                Approval_EndUser_Assignment
//   approvers       sorted array of approver names         primaryApprovers, resolved by `names`
//   permEligible    boolean (permanent eligibility allowed) Expiration_Admin_Eligibility.isExpirationRequired = false
//   maxEligible     ISO 8601 or null                        Expiration_Admin_Eligibility.maximumDuration
//   permActive      boolean (permanent active allowed)      Expiration_Admin_Assignment.isExpirationRequired = false
//   maxActive       ISO 8601 or null                        Expiration_Admin_Assignment.maximumDuration
//   alertActivation / alertEligible / alertActive
//                   notification level for the Admin recipient of each event
//                   (Notification_Admin_EndUser_Assignment / _Admin_Eligibility / _Admin_Assignment)
//   recipients      sorted extra recipients of those three (local parts, so
//                   pim-alerts matches pim-alerts@contoso.nl)
//
// Members are never compared. A group is a MODEL — present, role-assignable,
// carrying the roles the catalog says — and a person's eligibility is the
// tenant's own business.
// ======================================================================
const PimBaseline = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uniq = (a) => [...new Set(a)];
  const sortStr = (a) => uniq(a).map(String).sort((x, y) => x.localeCompare(y));
  const local = (mail) => String(mail || "").split("@")[0].toLowerCase();
  const ISO = (s) => String(s || "").toUpperCase();

  const KEYS = [
    ["activation", "Activation duration"],
    ["enablement", "On activation"],
    ["authContext", "Authentication context"],
    ["approval", "Approval"],
    ["approvers", "Approvers"],
    ["permEligible", "Permanent eligibility"],
    ["maxEligible", "Max eligibility"],
    ["permActive", "Permanent active"],
    ["maxActive", "Max active"],
    ["alertActivation", "Alert on activation"],
    ["alertEligible", "Alert on eligible assignment"],
    ["alertActive", "Alert on active assignment"],
    ["recipients", "Alert recipients"],
  ];
  const LABEL = Object.fromEntries(KEYS);

  // ---- the catalog side --------------------------------------------------
  function fromTemplate(t) {
    const req = String(t.ActivationRequirement || "None").split(",").map((s) => s.trim()).filter((s) => s && s !== "None");
    const lvl = (n) => (n && n.notificationLevel) || "All";
    const rec = [t.Notification_Activation_Alert, t.Notification_EligibleAssignment_Alert, t.Notification_ActiveAssignment_Alert].flatMap((n) => (n && n.Recipients) || []);
    return {
      activation: ISO(t.ActivationDuration || "PT8H"),
      enablement: sortStr(req),
      authContext: t.AuthenticationContext_Enabled ? String(t.AuthenticationContext_Value || "") : null,
      approval: !!t.ApprovalRequired,
      approvers: t.ApprovalRequired ? sortStr(t.Approvers || []) : [],
      permEligible: !!t.AllowPermanentEligibility,
      maxEligible: t.MaximumEligibilityDuration ? ISO(t.MaximumEligibilityDuration) : null,
      permActive: !!t.AllowPermanentActiveAssignment,
      maxActive: t.MaximumActiveAssignmentDuration ? ISO(t.MaximumActiveAssignmentDuration) : null,
      alertActivation: lvl(t.Notification_Activation_Alert),
      alertEligible: lvl(t.Notification_EligibleAssignment_Alert),
      alertActive: lvl(t.Notification_ActiveAssignment_Alert),
      recipients: sortStr(rec.map(local)),
    };
  }
  // Template, then the role's own override (an inline EasyPIM setting).
  function expected(cat, item) {
    const t = Object.assign({}, cat.templates[item.template] || {}, item.override || {});
    return fromTemplate(t);
  }

  // ---- the tenant side ---------------------------------------------------
  // Graph's rules for one policy → SETTINGS. `names` maps a principal id to a
  // display name so approvers compare by name, as the catalog writes them.
  function fromRules(rules, names = {}) {
    const byId = {};
    (rules || []).forEach((r) => { if (r && r.id) byId[r.id] = r; });
    const exp = (id) => byId[id] || {};
    const notif = (id) => byId[id] || null;
    const approvers = ((exp("Approval_EndUser_Assignment").setting || {}).approvalStages || []).flatMap((s) => s.primaryApprovers || [])
      .map((a) => names[a.groupId] || names[a.userId] || a.description || a.groupId || a.userId || "?");
    const level = (n) => (n ? (n.notificationLevel || "All") : "All");
    const recs = ["Notification_Admin_EndUser_Assignment", "Notification_Admin_Admin_Eligibility", "Notification_Admin_Admin_Assignment"].flatMap((id) => (notif(id) && notif(id).notificationRecipients) || []);
    const approval = !!((exp("Approval_EndUser_Assignment").setting || {}).isApprovalRequired);
    const ctx = exp("AuthenticationContext_EndUser_Assignment");
    return {
      activation: ISO(exp("Expiration_EndUser_Assignment").maximumDuration || "PT8H"),
      enablement: sortStr(exp("Enablement_EndUser_Assignment").enabledRules || []),
      authContext: ctx.isEnabled ? String(ctx.claimValue || "") : null,
      approval,
      approvers: approval ? sortStr(approvers) : [],
      permEligible: exp("Expiration_Admin_Eligibility").isExpirationRequired === false,
      maxEligible: exp("Expiration_Admin_Eligibility").isExpirationRequired === false ? null : ISO(exp("Expiration_Admin_Eligibility").maximumDuration || "") || null,
      permActive: exp("Expiration_Admin_Assignment").isExpirationRequired === false,
      maxActive: exp("Expiration_Admin_Assignment").isExpirationRequired === false ? null : ISO(exp("Expiration_Admin_Assignment").maximumDuration || "") || null,
      alertActivation: level(notif("Notification_Admin_EndUser_Assignment")),
      alertEligible: level(notif("Notification_Admin_Admin_Eligibility")),
      alertActive: level(notif("Notification_Admin_Admin_Assignment")),
      recipients: sortStr(recs.map(local)),
    };
  }

  // ---- the comparison ----------------------------------------------------
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const show = (k, v) => {
    if (k === "enablement") return v.length ? v.map((x) => ({ MultiFactorAuthentication: "MFA", Justification: "justification", Ticketing: "ticket" }[x] || x)).join(" + ") : "nothing";
    if (k === "approvers" || k === "recipients") return v.length ? v.join(", ") : "—";
    if (k === "authContext") return v ? `c${String(v).replace(/^c/i, "")}` : "none";
    if (typeof v === "boolean") return v ? "allowed" : "not allowed";
    if (v == null) return "—";
    return String(v);
  };
  const showFor = (k, v) => (k === "approval" ? (v ? "required" : "not required") : show(k, v));
  // Which keys count. When the baseline allows permanent eligibility the
  // maximum is moot; when the tenant's approval is off its approvers are.
  function diff(exp, got) {
    const out = [];
    for (const [k] of KEYS) {
      if (k === "maxEligible" && (exp.permEligible || got.permEligible) && exp.permEligible === got.permEligible) continue;
      if (k === "maxActive" && (exp.permActive || got.permActive) && exp.permActive === got.permActive) continue;
      if (k === "approvers" && !exp.approval && !got.approval) continue;
      if (!same(exp[k], got[k])) out.push({ key: k, label: LABEL[k], baseline: showFor(k, exp[k]), tenant: showFor(k, got[k]) });
    }
    return out;
  }

  const STATUS = {
    match:   { icon: "✓", label: "Match",             cls: "ok",   order: 3 },
    differs: { icon: "≠", label: "Differs",           cls: "warn", order: 1 },
    missing: { icon: "∅", label: "Missing in tenant", cls: "bad",  order: 0 },
    unread:  { icon: "?", label: "Not read",          cls: "na",   order: 2 },
  };
  const isPermanent = (a) => !a.endDateTime;
  const namesOf = (arr) => sortStr(arr.map((r) => r.roleName));

  // tenant = { roles:[{id,displayName}], policies:{ [roleName]: rules[] },
  //   eligible:[{roleName, principalId, principalName, principalType, endDateTime}],
  //   active:[{roleName, principalId, principalName, principalType, assignmentType, endDateTime}],
  //   groups:[{id, displayName, isAssignableToRole}],
  //   groupPolicies:{ [groupName]: rules[] } | undefined, groupPoliciesError: string|null,
  //   names:{id:name}, readAt, demo }
  function compare(cat, tenant) {
    const names = tenant.names || {};
    const roleByName = new Map((tenant.roles || []).map((r) => [String(r.displayName).toLowerCase(), r]));
    const prot = new RegExp(cat.protected && cat.protected.pattern || "^$", "i");
    const protectedGroups = new Set((cat.protected && cat.protected.groups) || []);
    const isProtected = (a) => prot.test(a.principalName || "") || protectedGroups.has(a.principalName || "");
    const rows = cat.roles.map((item) => {
      const role = roleByName.get(item.name.toLowerCase());
      const exp = expected(cat, item);
      const el = (tenant.eligible || []).filter((a) => a.roleName === item.name);
      const ac = (tenant.active || []).filter((a) => a.roleName === item.name);
      const perm = ac.filter((a) => isPermanent(a) && a.assignmentType !== "Activated");
      const permOutside = perm.filter((a) => !isProtected(a));
      let status, diffs = [], got = null;
      if (!role) status = "missing";
      else if (!tenant.policies || !(item.name in tenant.policies)) status = "unread";
      else { got = fromRules(tenant.policies[item.name], names); diffs = diff(exp, got); status = diffs.length ? "differs" : "match"; }
      // A permanent active assignment the template forbids is a finding of
      // its own, on the row, even when the policy already says "not allowed"
      // (a policy change never removes an assignment that already exists).
      const findings = [];
      if (!exp.permActive && permOutside.length) findings.push(`${permOutside.length} permanent active outside the framework: ${permOutside.map((a) => a.principalName || a.principalId).join(", ")}`);
      const viaMissing = (item.via || []).filter((g) => !el.some((a) => a.principalType === "Group" && a.principalName === g));
      if (role && viaMissing.length) findings.push(`not eligible through ${viaMissing.join(", ")}`);
      return { name: item.name, template: item.template, tier: item.template.replace(/^Group/, ""), via: item.via || [], note: item.note || "", status, diffs, expected: exp, got, eligible: el.length, active: ac.length, permanent: perm.length, permanentOutside: exp.permActive ? 0 : permOutside.length, findings, protectedPermanent: perm.length - permOutside.length };
    });
    // Groups: present under the exact name, role-assignable, carrying the
    // roles the catalog derives from `roles[].via`, and — when readable —
    // activating under the template's settings.
    const carriesByGroup = {};
    cat.roles.forEach((r) => (r.via || []).forEach((g) => { (carriesByGroup[g] = carriesByGroup[g] || []).push(r.name); }));
    const tenantGroups = new Map((tenant.groups || []).map((g) => [String(g.displayName), g]));
    const groups = cat.groups.map((g) => {
      const tg = tenantGroups.get(g.name);
      const carries = sortStr(carriesByGroup[g.name] || []);
      const has = namesOf((tenant.eligible || []).filter((a) => a.principalType === "Group" && a.principalName === g.name)
        .concat((tenant.active || []).filter((a) => a.principalType === "Group" && a.principalName === g.name)));
      const missingRoles = carries.filter((r) => !has.includes(r));
      const extraRoles = has.filter((r) => !carries.includes(r));
      let status = "missing", diffs = [], settings = "unread";
      if (tg) {
        status = "match";
        if (tg.isAssignableToRole === false) status = "differs";
        if (g.scope === "m365" && missingRoles.length) status = "differs";
        if (tenant.groupPolicies && tenant.groupPolicies[g.name]) {
          const exp = expected(cat, g), got = fromRules(tenant.groupPolicies[g.name], names);
          diffs = diff(exp, got); settings = diffs.length ? "differs" : "match";
          if (diffs.length) status = "differs";
        }
      }
      return { name: g.name, scope: g.scope, persona: g.persona, template: g.template, description: g.description || "", azure: g.azure || null, present: !!tg, roleAssignable: tg ? tg.isAssignableToRole !== false : null, carries, has, missingRoles, extraRoles, status, diffs, settings };
    });
    const extraGroups = (tenant.groups || []).filter((g) => g.isAssignableToRole !== false && !cat.groups.some((c) => c.name === g.displayName)).map((g) => g.displayName).sort();
    const counts = { roles: rows.length, match: 0, differs: 0, missing: 0, unread: 0 };
    rows.forEach((r) => { counts[r.status]++; });
    const g365 = groups.filter((g) => g.scope === "m365");
    const gcounts = { total: g365.length, present: g365.filter((g) => g.present).length, missing: g365.filter((g) => !g.present).length, differs: g365.filter((g) => g.present && g.status === "differs").length, azure: groups.length - g365.length, azurePresent: groups.filter((g) => g.scope !== "m365" && g.present).length, extra: extraGroups.length };
    const permanentOutside = rows.reduce((n, r) => n + r.permanentOutside, 0);
    return { catalog: { id: cat.id, label: cat.label, release: cat.release, revised: cat.revised, tenant: cat.tenant }, rows, groups, extraGroups, counts, gcounts, permanentOutside, groupPoliciesError: tenant.groupPoliciesError || null, readAt: tenant.readAt || null, demo: !!tenant.demo };
  }

  // ---- the export --------------------------------------------------------
  // The catalog as an EasyPIM.Orchestrator config. Names stay names — the
  // approver group, the persona groups, the break-glass accounts — because
  // the catalog is tenant-neutral; tools/pim/New-PimBaseline.ps1 resolves them
  // to object ids in the tenant it runs in (EasyPIM needs ids for Approvers,
  // principalId and ProtectedUsers; GroupRoles.Policies accepts names).
  function toOrchestrator(cat, opts = {}) {
    const domain = opts.domain || "<tenant domain>";
    const mail = (n) => (n.includes("@") ? n : `${n}@${domain}`);
    const tmpl = (t) => {
      const o = {};
      for (const [k, v] of Object.entries(t)) {
        if (k === "description") continue;
        if (k === "Approvers") o[k] = (v || []).map((name) => ({ id: opts.ids && opts.ids[name] || `<id of ${name}>`, description: name }));
        else if (/^Notification_/.test(k)) o[k] = { isDefaultRecipientEnabled: String(!!v.isDefaultRecipientEnabled), notificationLevel: v.notificationLevel || "All", Recipients: (v.Recipients || []).map(mail) };
        else o[k] = v;
      }
      return o;
    };
    const onlyRoles = opts.roles ? new Set(opts.roles) : null;
    const onlyGroups = opts.groups ? new Set(opts.groups) : null;
    const roles = cat.roles.filter((r) => !onlyRoles || onlyRoles.has(r.name));
    const groups = cat.groups.filter((g) => !onlyGroups || onlyGroups.has(g.name));
    const usedTemplates = new Set([...roles.map((r) => r.template), ...groups.map((g) => g.template)]);
    // The notes come first, so a script that strips them never leaves a
    // trailing comma behind (tools/pim/New-PimBaseline.ps1 drops them).
    const out = { _comment: `${cat.label} ${cat.release}, revised ${cat.revised}${opts.delta ? " — DELTA for one tenant: only what differs" : ""}. Generated by ENCA T48 PIM baseline. Resolve <id of …> with tools/pim/New-PimBaseline.ps1 before running Invoke-EasyPIMOrchestrator; run with -WhatIf first.` };
    if (!(opts.breakGlass || []).length) out._protectedNote = `Add the break-glass accounts (${(cat.protected && cat.protected.pattern) || "BG-*"}) to ProtectedUsers — the script finds them by name, and the standing Global Administrators with them.`;
    out.PolicyTemplates = Object.fromEntries(Object.entries(cat.templates).filter(([k]) => usedTemplates.has(k)).map(([k, t]) => [k, tmpl(t)]));
    out.EntraRoles = { Policies: Object.fromEntries(roles.map((r) => [r.name, Object.assign({ Template: r.template }, r.override ? tmpl(Object.assign({}, r.override)) : {})])) };
    out.GroupRoles = { Policies: Object.fromEntries(groups.map((g) => [g.name, { Member: { Template: g.template } }])) };
    // Eligibility of each persona group for the roles it carries — the
    // model. People are added to the groups, never to the roles.
    const byRole = {};
    const wanted = (r, g) => (!onlyRoles && !onlyGroups) || (onlyRoles && onlyRoles.has(r.name)) || (onlyGroups && onlyGroups.has(g));
    cat.roles.forEach((r) => (r.via || []).forEach((g) => { if (wanted(r, g)) (byRole[r.name] = byRole[r.name] || []).push(g); }));
    out.Assignments = { EntraRoles: Object.entries(byRole).map(([roleName, gs]) => ({ roleName, assignments: gs.map((g) => ({ principalId: opts.ids && opts.ids[g] || `<id of ${g}>`, principalType: "Group", assignmentType: "Eligible", duration: "P365D", justification: `${cat.label} ${cat.release}: ${g} carries ${roleName}` })) })) };
    out.ProtectedUsers = [...((cat.protected && cat.protected.groups) || []).map((g) => opts.ids && opts.ids[g] || `<id of ${g}>`), ...((opts.breakGlass || []).map((u) => opts.ids && opts.ids[u] || `<id of ${u}>`))];
    return out;
  }
  const command = (file, domain) => `Invoke-EasyPIMOrchestrator -ConfigFilePath .\\${file} -TenantId ${domain || "<tenant domain or id>"} -Mode delta -WhatIf`;

  // ---- the screen --------------------------------------------------------
  function tiles(res) {
    const c = res.counts, g = res.gcounts;
    const tile = (n, label, cls) => `<div class="xt-tile${cls ? " " + cls : ""}"><b>${esc(n)}</b>${esc(label)}</div>`;
    return `<div class="xt-tiles pmb-tiles">${tile(c.roles, "roles compared")}${tile(c.match, "match")}${tile(c.differs, "differ", c.differs ? "m" : "")}${tile(c.missing + c.unread, c.unread ? "missing or not read" : "missing in tenant", c.missing ? "h" : "")}${tile(`${g.present} / ${g.total}`, "PIM groups present", g.missing ? "m" : "")}${tile(res.permanentOutside, "permanent active outside the framework", res.permanentOutside ? "h" : "")}</div>`;
  }
  function chips(res, filter) {
    const c = res.counts, g = res.gcounts;
    const f = (key, label, n) => `<button class="fchip${filter === key ? " active" : ""}" data-pmbf="${key}">${esc(label)}${n == null ? "" : ` (${esc(n)})`}</button>`;
    return f("all", "All") + f("differs", "Differs", c.differs) + f("missing", "Missing", c.missing) + f("match", "Match", c.match) + f("groups", "Groups", g.total) + f("findings", "Assignments", res.rows.filter((r) => r.findings.length).length);
  }
  const pill = (s) => `<span class="xt-pill pmb-${STATUS[s].cls}">${STATUS[s].icon} ${esc(STATUS[s].label)}</span>`;
  const diffCell = (diffs) => diffs.length ? `<ul class="pmb-diffs">${diffs.map((d) => `<li><b>${esc(d.label)}</b> ${esc(d.tenant)} <span class="pmb-arrow">→</span> ${esc(d.baseline)}</li>`).join("")}</ul>` : "";
  function render(res, opts = {}) {
    const filter = opts.filter || "all";
    const q = String(opts.q || "").trim().toLowerCase();
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const head = `<p class="mini pmb-read">${res.demo ? "Demo data · " : ""}Baseline: <b>${esc(res.catalog.label)} ${esc(res.catalog.release)}</b>, revised ${esc(res.catalog.revised)}, authored in ${esc(res.catalog.tenant)}${res.readAt ? ` · tenant read ${esc(new Date(res.readAt).toLocaleString())}` : ""}${res.groupPoliciesError ? ` · <span class="pmb-warn">group settings not read: ${esc(res.groupPoliciesError)}</span>` : ""}</p>`;
    let rows = res.rows.filter((r) => hit(r.name + " " + r.template + " " + r.via.join(" ")));
    if (filter === "differs") rows = rows.filter((r) => r.status === "differs");
    else if (filter === "missing") rows = rows.filter((r) => r.status === "missing" || r.status === "unread");
    else if (filter === "match") rows = rows.filter((r) => r.status === "match");
    else if (filter === "findings") rows = rows.filter((r) => r.findings.length);
    rows = rows.slice().sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.name.localeCompare(b.name));
    const roleTable = filter === "groups" ? "" : `<div class="list-card xt-card"><h3>Roles <span class="mini">${rows.length} of ${res.rows.length} · the setting the tenant has → what the framework says</span></h3><div class="xt-tw"><table class="xt-tbl pmb-tbl">
      <thead><tr><th></th><th>Role</th><th>Tier</th><th>Eligible</th><th>Active</th><th>Permanent</th><th>Verdict</th><th>Differences · findings</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="pmb-row pmb-${r.status}"><td><input type="checkbox" data-pmbfix="role:${esc(r.name)}"${r.status === "differs" || r.status === "missing" ? " checked" : " disabled"} aria-label="Take ${esc(r.name)} into the delta"></td><td><b>${esc(r.name)}</b>${r.via.length ? `<div class="mini pmb-via">via ${esc(r.via.join(", "))}</div>` : ""}${r.note ? `<div class="mini pmb-note">${esc(r.note)}</div>` : ""}</td><td><span class="pmb-tier pmb-tier-${esc(r.tier)}">${esc(r.tier)}</span></td><td>${r.eligible}</td><td>${r.active}</td><td>${r.permanent ? `<span class="xt-pill ${r.findings.some((f) => /permanent active outside/.test(f)) ? "pmb-bad" : "pmb-na"}">${r.permanent}${r.protectedPermanent ? ` <span class="mini">(${r.protectedPermanent} protected)</span>` : ""}</span>` : "—"}</td><td>${pill(r.status)}</td><td>${diffCell(r.diffs)}${r.findings.length ? `<ul class="pmb-diffs pmb-findings">${r.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${r.status === "missing" ? `<div class="mini">No role with this name in the tenant. Built-in roles always exist; check the spelling in the catalog.</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="mini" style="padding:14px">Nothing under this filter.</td></tr>`}</tbody></table></div></div>`;
    const groups = res.groups.filter((g) => hit(g.name + " " + g.persona));
    const groupTable = (filter !== "all" && filter !== "groups" && filter !== "missing" && filter !== "differs") ? "" : `<div class="list-card xt-card"><h3>PIM groups <span class="mini">the model, never the members · exact names</span></h3><div class="xt-tw"><table class="xt-tbl pmb-tbl">
      <thead><tr><th></th><th>Group</th><th>Persona</th><th>Activates as</th><th>In tenant</th><th>Role-assignable</th><th>Carries</th><th>Verdict</th><th>Differences</th></tr></thead>
      <tbody>${groups.filter((g) => filter === "all" || filter === "groups" || (filter === "missing" ? !g.present : g.status === "differs")).map((g) => `<tr class="pmb-row pmb-${g.status}"><td><input type="checkbox" data-pmbfix="group:${esc(g.name)}"${g.status === "match" ? " disabled" : (g.scope === "azure" ? "" : " checked")} aria-label="Take ${esc(g.name)} into the delta"></td><td><b>${esc(g.name)}</b>${g.description ? `<div class="mini pmb-note">${esc(g.description)}</div>` : ""}</td><td>${esc(g.persona)}${g.azure ? `<div class="mini">${esc(g.azure.role)} · ${esc(g.azure.scope)}</div>` : ""}</td><td><span class="pmb-tier pmb-tier-${esc(g.template.replace(/^Group/, ""))}">${esc(g.template.replace(/^Group/, ""))}</span></td><td>${g.present ? "✓" : "<span class=\"pmb-bad-txt\">no</span>"}</td><td>${g.present ? (g.roleAssignable ? "✓" : "<span class=\"pmb-bad-txt\">no</span>") : "—"}</td><td>${g.scope === "azure" ? `<span class="mini">Azure RBAC · not compared</span>` : `${g.has.length} / ${g.carries.length}${g.missingRoles.length ? `<div class="mini pmb-bad-txt">missing: ${esc(g.missingRoles.join(", "))}</div>` : ""}${g.extraRoles.length ? `<div class="mini">also: ${esc(g.extraRoles.join(", "))}</div>` : ""}`}</td><td>${pill(g.present ? g.status : "missing")}</td><td>${g.present && !g.roleAssignable ? `<div class="mini pmb-bad-txt">not role-assignable: a group made without isAssignableToRole cannot be made one later — recreate it</div>` : ""}${diffCell(g.diffs)}${g.present && g.settings === "unread" && g.scope === "m365" ? `<div class="mini">activation settings not read</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="mini" style="padding:14px">Nothing under this filter.</td></tr>`}</tbody></table></div>${res.extraGroups.length ? `<p class="mini pmb-extra">Role-assignable groups in the tenant that are not in the framework: ${esc(res.extraGroups.join(", "))}. Not a difference — a tenant's own groups are its own — but every one of them can hold a role, so 👥 CA groups and 🛡 Restricted AUs should know them.</p>` : ""}</div>`;
    return head + roleTable + groupTable;
  }

  function toMd(res, tenantName) {
    const L = [];
    L.push(`# 🧬 PIM baseline — ${tenantName || "tenant"} against ${res.catalog.label} ${res.catalog.release}`);
    L.push(`Catalog revised ${res.catalog.revised}, authored in ${res.catalog.tenant}. ${res.demo ? "Demo data. " : ""}${res.readAt ? `Tenant read ${new Date(res.readAt).toISOString()}.` : ""}`);
    L.push("");
    L.push(`Roles: ${res.counts.roles} compared · ${res.counts.match} match · ${res.counts.differs} differ · ${res.counts.missing} missing · ${res.counts.unread} not read. PIM groups: ${res.gcounts.present} of ${res.gcounts.total} present (${res.gcounts.missing} missing, ${res.gcounts.differs} differ). Permanent active outside the framework: ${res.permanentOutside}.`);
    L.push("");
    L.push("| Role | Tier | Eligible | Active | Permanent | Verdict | Differences (tenant → framework) |");
    L.push("|---|---|---|---|---|---|---|");
    res.rows.slice().sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.name.localeCompare(b.name)).forEach((r) => {
      L.push(`| ${r.name} | ${r.tier} | ${r.eligible} | ${r.active} | ${r.permanent} | ${STATUS[r.status].label} | ${[...r.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`), ...r.findings].join("; ") || "—"} |`);
    });
    L.push("");
    L.push("| Group | Persona | Activates as | In tenant | Role-assignable | Carries | Verdict |");
    L.push("|---|---|---|---|---|---|---|");
    res.groups.forEach((g) => L.push(`| ${g.name} | ${g.persona} | ${g.template.replace(/^Group/, "")} | ${g.present ? "yes" : "no"} | ${g.present ? (g.roleAssignable ? "yes" : "no") : "—"} | ${g.scope === "azure" ? "Azure RBAC, not compared" : `${g.has.length}/${g.carries.length}${g.missingRoles.length ? ` (missing ${g.missingRoles.join(", ")})` : ""}`} | ${g.present ? STATUS[g.status].label : "Missing"}${g.diffs.length ? ` — ${g.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`).join("; ")}` : ""} |`));
    if (res.extraGroups.length) { L.push(""); L.push(`Role-assignable groups not in the framework: ${res.extraGroups.join(", ")}.`); }
    return L.join("\n");
  }

  return { KEYS, LABEL, STATUS, expected, fromTemplate, fromRules, diff, compare, toOrchestrator, command, tiles, chips, render, toMd };
})();
