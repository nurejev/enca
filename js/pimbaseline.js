// ======================================================================
// 🧬 PIM baseline (T48, R68) — pure module, no DOM, no Graph.
//
// What it does, in order:
//   expected(cat, item, dom)  the settings a catalog role (or group) should
//                             have: its template, then its override
//   fromRules(rules, names)   the same shape out of Graph's
//                             unifiedRoleManagementPolicy rules
//   compare(cat, tenant)      one row per catalog role and per catalog group,
//                             setting by setting; verdicts, counts, sources
//   profile(cat, id)          the catalog a profile derives
//   parseRegions(text, cat)   a customer's regions.csv (or JSON) → rows,
//                             blocking errors and warnings, never a throw
//   region(cat, row)          one row → the objects the template says
//   compareRegions(cat, rows, tenant)
//                             per region: units, groups, scoped eligibilities
//   toOrchestrator(cat, o)    the catalog — or the delta — as the framework's
//                             config (EasyPIM.Orchestrator's shape), which
//                             tools/pim/New-PimBaseline.ps1 plans and applies
//   toRegionsFile(cat, rows)  the file tools/pim/New-PimRegions.ps1 plans from
//   render / tiles / chips / renderRegions / toMd / regionsMd
//
// The shape both sides are normalised to (SETTINGS):
//   activation      ISO 8601 max activation duration      Expiration_EndUser_Assignment
//   enablement      sorted array of enabled rules          Enablement_EndUser_Assignment
//   authContext     claim value or null                    AuthenticationContext_EndUser_Assignment
//   approval        boolean                                Approval_EndUser_Assignment
//   approvers       sorted array of approver names         primaryApprovers, resolved by `names`
//   permEligible    permanent eligibility allowed          Expiration_Admin_Eligibility
//   maxEligible     ISO 8601 or null                       Expiration_Admin_Eligibility.maximumDuration
//   permActive      permanent active allowed               Expiration_Admin_Assignment
//   maxActive       ISO 8601 or null                       Expiration_Admin_Assignment.maximumDuration
//   alertActivation / alertEligible / alertActive
//                   notification level for the Admin recipient of each event
//   recipients      sorted extra recipients of those three — FULL addresses
//                   when the tenant's domain is known (pim-alerts@evil.example
//                   is not pim-alerts@contoso.nl); local parts only when not
//   defaults        whether the default recipients get each of the three
//                   ("on,on,on")
// A rule the tenant's policy does not carry reads as ABSENT — never as a
// default value that could happen to match.
//
// Verdicts: match · differs · missing · unread (a source that was not read —
// never shown as a match, never turned into a create) · conflict (two objects
// under one name, or a custom role wearing a built-in name: nothing is
// resolved by guessing which one is meant).
//
// Objects are matched by ID once a name resolves to exactly one object: a
// group's roles are the eligibilities whose principalId is that group's id at
// TENANT scope ("/"); an eligibility at an administrative unit is regional,
// never a central carry. Members are never compared: a group is a MODEL.
// ======================================================================
const PimBaseline = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uniq = (a) => [...new Set(a)];
  const sortStr = (a) => uniq(a).map(String).sort((x, y) => x.localeCompare(y));
  const local = (mail) => String(mail || "").split("@")[0].toLowerCase();
  const ISO = (s) => String(s || "").toUpperCase();
  const ABSENT = "rule absent";
  const TENANT_SCOPE = (a) => !a.directoryScopeId || a.directoryScopeId === "/";

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
    ["defaults", "Default recipients"],
  ];
  const LABEL = Object.fromEntries(KEYS);

  // "PT2H" → "2 h", "P365D" → "365 days" — the screen reads durations, the
  // exports keep the ISO value.
  function human(v) {
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(String(v || ""));
    if (!m || (!m[1] && !m[2] && !m[3])) return String(v);
    const p = [];
    if (m[1]) p.push(`${m[1]} day${m[1] === "1" ? "" : "s"}`);
    if (m[2]) p.push(`${m[2]} h`);
    if (m[3]) p.push(`${m[3]} min`);
    return p.join(" ");
  }

  // ---- the catalog side --------------------------------------------------
  function fromTemplate(t, domain) {
    const req = String(t.ActivationRequirement || "None").split(",").map((s) => s.trim()).filter((s) => s && s !== "None");
    const lvl = (n) => (n && n.notificationLevel) || "All";
    const notes = [t.Notification_Activation_Alert, t.Notification_EligibleAssignment_Alert, t.Notification_ActiveAssignment_Alert];
    const addr = (r) => { const s = String(r).toLowerCase(); return s.includes("@") ? s : domain ? `${s}@${String(domain).toLowerCase()}` : s; };
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
      alertActivation: lvl(notes[0]),
      alertEligible: lvl(notes[1]),
      alertActive: lvl(notes[2]),
      recipients: sortStr(notes.flatMap((n) => (n && n.Recipients) || []).map(addr)),
      defaults: notes.map((n) => (!n || n.isDefaultRecipientEnabled !== false ? "on" : "off")).join(","),
    };
  }
  // Template, then the role's own override (an inline EasyPIM setting).
  function expected(cat, item, domain) {
    const t = Object.assign({}, cat.templates[item.template] || {}, item.override || {});
    return fromTemplate(t, domain);
  }

  // ---- the tenant side ---------------------------------------------------
  // Graph's rules for one policy → SETTINGS. `names` maps a principal id to a
  // display name so approvers compare by name, as the catalog writes them.
  // A rule that is not there reads ABSENT on every key it feeds.
  function fromRules(rules, names = {}) {
    const byId = {};
    (rules || []).forEach((r) => { if (r && r.id) byId[r.id] = r; });
    const has = (id) => !!byId[id];
    const r = (id) => byId[id] || {};
    const approvalRule = r("Approval_EndUser_Assignment");
    const approval = has("Approval_EndUser_Assignment") ? !!((approvalRule.setting || {}).isApprovalRequired) : ABSENT;
    const approvers = ((approvalRule.setting || {}).approvalStages || []).flatMap((s) => s.primaryApprovers || [])
      .map((a) => names[a.groupId] || names[a.userId] || a.description || a.groupId || a.userId || "?");
    const note = ["Notification_Admin_EndUser_Assignment", "Notification_Admin_Admin_Eligibility", "Notification_Admin_Admin_Assignment"];
    const level = (id) => (has(id) ? (r(id).notificationLevel || "All") : ABSENT);
    const elig = r("Expiration_Admin_Eligibility"), act = r("Expiration_Admin_Assignment");
    const ctx = r("AuthenticationContext_EndUser_Assignment");
    return {
      activation: has("Expiration_EndUser_Assignment") ? ISO(r("Expiration_EndUser_Assignment").maximumDuration || "") : ABSENT,
      enablement: has("Enablement_EndUser_Assignment") ? sortStr(r("Enablement_EndUser_Assignment").enabledRules || []) : ABSENT,
      authContext: has("AuthenticationContext_EndUser_Assignment") ? (ctx.isEnabled ? String(ctx.claimValue || "") : null) : ABSENT,
      approval,
      approvers: approval === true ? sortStr(approvers) : [],
      permEligible: has("Expiration_Admin_Eligibility") ? elig.isExpirationRequired === false : ABSENT,
      maxEligible: has("Expiration_Admin_Eligibility") ? (elig.isExpirationRequired === false ? null : ISO(elig.maximumDuration || "") || null) : ABSENT,
      permActive: has("Expiration_Admin_Assignment") ? act.isExpirationRequired === false : ABSENT,
      maxActive: has("Expiration_Admin_Assignment") ? (act.isExpirationRequired === false ? null : ISO(act.maximumDuration || "") || null) : ABSENT,
      alertActivation: level(note[0]),
      alertEligible: level(note[1]),
      alertActive: level(note[2]),
      recipients: sortStr(note.flatMap((id) => r(id).notificationRecipients || []).map((m) => String(m).toLowerCase())),
      defaults: note.map((id) => (!has(id) ? ABSENT : r(id).isDefaultRecipientsEnabled === false ? "off" : "on")).join(","),
    };
  }

  // ---- the comparison ----------------------------------------------------
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const show = (k, v) => {
    if (v === ABSENT) return ABSENT;
    if (k === "enablement") return v.length ? v.map((x) => ({ MultiFactorAuthentication: "MFA", Justification: "justification", Ticketing: "ticket" }[x] || x)).join(" + ") : "nothing";
    if (k === "approvers" || k === "recipients") return v.length ? v.join(", ") : "—";
    if (k === "authContext") return v ? `c${String(v).replace(/^c/i, "")}` : "none";
    if (typeof v === "boolean") return v ? "allowed" : "not allowed";
    if (v == null) return "—";
    return String(v);
  };
  const showFor = (k, v) => (k === "approval" && v !== ABSENT ? (v ? "required" : "not required") : show(k, v));
  // Which keys count. When the baseline allows permanent eligibility the
  // maximum is moot; when neither side requires approval its approvers are.
  function diff(exp, got) {
    const out = [];
    for (const [k] of KEYS) {
      if (k === "maxEligible" && got.permEligible !== ABSENT && (exp.permEligible || got.permEligible) && exp.permEligible === got.permEligible) continue;
      if (k === "maxActive" && got.permActive !== ABSENT && (exp.permActive || got.permActive) && exp.permActive === got.permActive) continue;
      if (k === "approvers" && !exp.approval && got.approval !== true) continue;
      if (!same(exp[k], got[k])) out.push({ key: k, label: LABEL[k], baseline: showFor(k, exp[k]), tenant: showFor(k, got[k]), rawBaseline: exp[k], rawTenant: got[k] });
    }
    return out;
  }

  const STATUS = {
    conflict: { icon: "⚠", label: "Conflict",          cls: "bad",  order: 0 },
    missing:  { icon: "∅", label: "Missing in tenant", cls: "bad",  order: 1 },
    differs:  { icon: "≠", label: "Differs",           cls: "warn", order: 2 },
    unread:   { icon: "?", label: "Not read",          cls: "na",   order: 3 },
    match:    { icon: "✓", label: "Match",             cls: "ok",   order: 4 },
  };
  const isPermanent = (a) => !a.endDateTime;

  // tenant = { roles:[{id,displayName,isBuiltIn}], policies:{ [roleName]: rules[] },
  //   eligible:[{roleName, roleId?, principalId, principalName, principalType, endDateTime, directoryScopeId}],
  //   active:[{… assignmentType}], groups:[{id, displayName, isAssignableToRole}],
  //   named:[{id, displayName, isAssignableToRole, membershipRule, membershipRuleProcessingState}] | null,
  //   groupPolicies:{ [groupId or groupName]: rules[] } | null, groupPoliciesError,
  //   domain, names:{id:name}, sources:{…}, readAt, demo }
  // Built-in roles by template id. Microsoft renames roles; the template id
  // stays, and a tenant can still carry the former display name (cloudfellows.dev
  // read "Microsoft Entra Joined Device Local Administrator" as its 1.3 name).
  // Every built-in role whose template id the catalog knows takes the catalog
  // name; tenantName keeps what the tenant calls it. Roles the catalog does not
  // know, and custom roles, keep their own names.
  function canonRoles(cat, roles) {
    const byTpl = new Map();
    (cat.roles || []).forEach((r) => { if (r.templateId) byTpl.set(String(r.templateId).toLowerCase(), r.name); });
    return (roles || []).map((r) => {
      if (r.isBuiltIn === false) return r;
      const name = byTpl.get(String(r.templateId || r.id || "").toLowerCase());
      return name && name !== r.displayName ? { ...r, displayName: name, tenantName: r.displayName } : r;
    });
  }
  function groupIndex(tenant) {
    const byId = new Map();
    [...(tenant.groups || []), ...(tenant.named || [])].forEach((g) => { if (g && g.id && !byId.has(g.id)) byId.set(g.id, g); });
    const byName = new Map();
    for (const g of byId.values()) { const k = String(g.displayName); (byName.get(k) || byName.set(k, []).get(k)).push(g); }
    return byName;
  }
  function compare(cat, tenant) {
    const names = tenant.names || {};
    const domain = tenant.domain || null;
    // With no domain to hold them to, recipients compare by local part — and
    // the summary says the domain was not checked.
    const gotOf = (rules) => { const g = fromRules(rules, names); if (!domain && Array.isArray(g.recipients)) g.recipients = sortStr(g.recipients.map(local)); return g; };
    const roleDefs = new Map();
    (tenant.roles || []).forEach((r) => { const k = String(r.displayName).toLowerCase(); (roleDefs.get(k) || roleDefs.set(k, []).get(k)).push(r); });
    const byName = groupIndex(tenant);
    const prot = new RegExp((cat.protected && cat.protected.pattern) || "^$", "i");
    const protectedGroups = new Set((cat.protected && cat.protected.groups) || []);
    const protectedIds = new Set(tenant.protectedIds || []);
    // Explicit ids protect; the name pattern only suggests ("by name — confirm").
    const protectedHow = (a) => (protectedIds.has(a.principalId) ? "id" : prot.test(a.principalName || "") || protectedGroups.has(a.principalName || "") ? "name" : null);
    const resolve = (name) => byName.get(name) || [];
    const rows = cat.roles.map((item) => {
      const defs = roleDefs.get(item.name.toLowerCase()) || [];
      const exp = expected(cat, item, domain);
      const el = (tenant.eligible || []).filter((a) => a.roleName === item.name);
      const ac = (tenant.active || []).filter((a) => a.roleName === item.name);
      const perm = ac.filter((a) => isPermanent(a) && a.assignmentType !== "Activated");
      // A job group holding the role permanently IS the framework (3.0).
      const jobIds = new Set((item.via || []).filter((g) => isJob(cat, g)).flatMap((g) => resolve(g).map((x) => x.id)));
      const scopedJob = new Set([...((cat.profile && cat.profile.scoped) || []).filter((x) => x.role === item.name && isJob(cat, x.group)).flatMap((x) => resolve(x.group).map((y) => y.id))]);
      const permOutside = perm.filter((a) => !protectedHow(a) && !jobIds.has(a.principalId) && !scopedJob.has(a.principalId) && !(a.principalName && isJob(cat, a.principalName)));
      const byNameOnly = perm.filter((a) => protectedHow(a) === "name");
      let status, diffs = [], got = null, conflict = "";
      if (!defs.length) status = "missing";
      else if (defs.length > 1) { status = "conflict"; conflict = `${defs.length} role definitions are called ${item.name}`; }
      else if (defs[0].isBuiltIn === false) { status = "conflict"; conflict = `the only role called ${item.name} is a custom role, not the built-in one`; }
      else if (!tenant.policies || !(item.name in tenant.policies)) status = "unread";
      else { got = gotOf(tenant.policies[item.name]); diffs = diff(exp, got); status = diffs.length ? "differs" : "match"; }
      const findings = [];
      if (conflict) findings.push(conflict);
      if (defs.length === 1 && defs[0].tenantName) findings.push(`this tenant calls it ${defs[0].tenantName} — matched by its template id; EasyPIM looks roles up by name, so its config needs that name (New-PimBaseline.ps1 -WriteResolved writes it)`);
      if (!exp.permActive && permOutside.length) findings.push(`${permOutside.length} permanent active outside the framework: ${permOutside.map((a) => a.principalName || a.principalId).join(", ")}`);
      if (byNameOnly.length) findings.push(`${byNameOnly.length} permanent active treated as break-glass by name only — list their object ids to protect them: ${byNameOnly.map((a) => a.principalName || a.principalId).join(", ")}`);
      if (defs.length) (item.via || []).forEach((g) => {
        const gs = resolve(g);
        if (gs.length > 1) { findings.push(`${gs.length} groups are called ${g} — which one carries it cannot be decided`); return; }
        if (!gs.length) { findings.push(`not eligible through ${g} (the group is missing)`); return; }
        const id = gs[0].id;
        if (isJob(cat, g)) {
          const act = ac.filter((a) => a.principalId === id && a.assignmentType !== "Activated");
          if (act.some(TENANT_SCOPE)) return;
          const old = el.filter((a) => a.principalId === id).some(TENANT_SCOPE);
          findings.push(old ? `${g} is still ELIGIBLE for it (2.x) — a job group holds it ACTIVE, permanently` : `not held through ${g} (a job group holds it active, permanently)`);
          return;
        }
        const mine = el.filter((a) => a.principalId === id);
        if (mine.some(TENANT_SCOPE)) return;
        findings.push(mine.length ? `eligible through ${g} only at an administrative unit — not tenant-wide as the framework says` : `not eligible through ${g}`);
      });
      return { name: item.name, template: item.template, tier: item.template.replace(/^Group/, ""), via: item.via || [], note: item.note || "", status, diffs, expected: exp, got, eligible: el.length, active: ac.length, permanent: perm.length, permanentOutside: exp.permActive ? 0 : permOutside.length, findings, protectedPermanent: perm.length - permOutside.length };
    });
    // Groups: present under the exact name and only once, role-assignable,
    // carrying — by id, at tenant scope — exactly the roles the catalog
    // derives from `roles[].via`, and activating under their template.
    const carriesByGroup = {};
    cat.roles.forEach((r) => (r.via || []).forEach((g) => { (carriesByGroup[g] = carriesByGroup[g] || []).push(r.name); }));
    const groupRules = (tg) => tenant.groupPolicies ? (tenant.groupPolicies[tg.id] || tenant.groupPolicies[tg.displayName] || null) : null;
    const groups = cat.groups.map((g) => {
      const list = resolve(g.name);
      const carries = sortStr(carriesByGroup[g.name] || []);
      const base = { name: g.name, scope: g.scope, path: g.path || null, persona: g.persona, template: g.template, description: g.description || "", azure: g.azure || null, xdr: g.xdr || null, exchange: g.exchange || null, carries, has: [], scopedOnly: [], missingRoles: g.scope === "m365" ? carries.slice() : [], extraRoles: [], diffs: [], settings: "unread", ids: list.map((x) => x.id) };
      if (!list.length) return Object.assign(base, { present: false, roleAssignable: null, status: "missing" });
      if (list.length > 1) return Object.assign(base, { present: true, roleAssignable: list.every((x) => x.isAssignableToRole !== false), status: "conflict", missingRoles: [], conflict: `${list.length} groups are called ${g.name} (${list.map((x) => x.id).join(", ")}) — resolve with tools/pim/Find-PimDuplicates.ps1 before anything else` });
      const tg = list[0];
      const myEl = (tenant.eligible || []).filter((a) => a.principalId === tg.id);
      const myAc = (tenant.active || []).filter((a) => a.principalId === tg.id && a.assignmentType !== "Activated");
      const mineAll = [...myEl, ...myAc];
      // 3.0: a job group holds its roles ACTIVE, a direct group is ELIGIBLE
      // for them; the other kind counts as held but is reported.
      const job = g.path === "job";
      const right = job ? myAc : myEl, wrong = job ? myEl : myAc;
      const has = sortStr(right.filter(TENANT_SCOPE).map((a) => a.roleName));
      const wrongShape = g.scope === "m365" ? sortStr(wrong.filter(TENANT_SCOPE).map((a) => a.roleName)).filter((r) => carries.includes(r)) : [];
      const scopedOnly = sortStr(mineAll.filter((a) => !TENANT_SCOPE(a)).map((a) => a.roleName)).filter((r) => !has.includes(r));
      const missingRoles = g.scope === "m365" ? carries.filter((r) => !has.includes(r)) : [];
      const extraRoles = g.scope === "azure" ? [] : sortStr(mineAll.filter(TENANT_SCOPE).map((a) => a.roleName)).filter((r) => !carries.includes(r));
      let status = "match", diffs = [], settings = "unread";
      if (tg.isAssignableToRole === false) status = "differs";
      if (missingRoles.length || extraRoles.length) status = "differs";
      const rules = groupRules(tg);
      if (rules) {
        diffs = diff(expected(cat, g, domain), gotOf(rules)); settings = diffs.length ? "differs" : "match";
        if (diffs.length) status = "differs";
      } else if (status === "match") status = "unread";
      if (wrongShape.length) status = "differs";
      return Object.assign(base, { present: true, id: tg.id, roleAssignable: tg.isAssignableToRole !== false, has, scopedOnly, missingRoles, extraRoles, wrongShape, status, diffs, settings });
    });
    // A tenant's regional groups (PIM-SG-<REG>-Helpdesk/-Ops/-Approvers and
    // PIM-SG-INT-HelpDesk/Ops-<REG>) are the region template's, compared under
    // 🗺 Regions, never "extra".
    const code = String((cat.regions && cat.regions.codePattern) || "^$").replace(/^\^|\$$/g, "").replace(/\((?!\?)/g, "(?:");
    const regional = new RegExp(`^PIM-SG-(${code}-(Helpdesk|Ops|Approvers)|INT-(HelpDesk|Ops)-${code})$`);
    const catNames = new Set(allGroups(cat).map((c) => c.name).concat(Object.values(cat.profiles || {}).map((p) => p.approvers).filter(Boolean), [cat.approvers && cat.approvers.name].filter(Boolean)));
    const extraGroups = sortStr((tenant.groups || []).filter((g) => g.isAssignableToRole !== false && !catNames.has(g.displayName) && !regional.test(g.displayName)).map((g) => g.displayName));
    const regionalGroups = sortStr((tenant.groups || []).filter((g) => regional.test(g.displayName)).map((g) => g.displayName));
    const counts = { roles: rows.length, match: 0, differs: 0, missing: 0, unread: 0, conflict: 0 };
    rows.forEach((r) => { counts[r.status]++; });
    const compared = groups.filter((g) => g.scope !== "azure");
    const gcounts = { total: compared.length, present: compared.filter((g) => g.present).length, missing: compared.filter((g) => !g.present).length, differs: compared.filter((g) => g.status === "differs").length, conflict: groups.filter((g) => g.status === "conflict").length, unread: compared.filter((g) => g.status === "unread").length, azure: groups.length - compared.length, azurePresent: groups.filter((g) => g.scope === "azure" && g.present).length, extra: extraGroups.length };
    const permanentOutside = rows.reduce((n, r) => n + r.permanentOutside, 0);
    return { catalog: { id: cat.id, label: cat.label, release: cat.release, revised: cat.revised, tenant: cat.tenant, variant: cat.variant || null }, profile: cat.profile || null, rows, groups, extraGroups, regionalGroups, counts, gcounts, permanentOutside, domain, domainChecked: !!domain, sources: tenant.sources || null, groupPoliciesError: tenant.groupPoliciesError || null, readAt: tenant.readAt || null, demo: !!tenant.demo, tenantId: tenant.tenantId || null };
  }

  // What the delta takes by default: the rows that differ or are missing.
  // Conflicts are never in it (no config resolves two objects under one
  // name) and Azure groups are opt-in.
  function defaultSelection(res) {
    const sel = new Set();
    res.rows.forEach((r) => { if (r.status === "differs" || r.status === "missing") sel.add(`role:${r.name}`); });
    res.groups.forEach((g) => { if ((g.status === "differs" || g.status === "missing") && g.scope !== "azure") sel.add(`group:${g.name}`); });
    return sel;
  }
  const selectable = (res) => new Set([...res.rows.filter((r) => r.status !== "match" && r.status !== "conflict").map((r) => `role:${r.name}`), ...res.groups.filter((g) => g.status !== "match" && g.status !== "conflict").map((g) => `group:${g.name}`)]);

  // ---- profiles ----------------------------------------------------------
  // A profile is the same catalog at a size: the groups it keeps, the roles
  // of the groups it does not keep folded into the ones it does (`merge`),
  // template settings that change with size, and a note per role.
  function profile(cat, id) {
    const p = cat.profiles && cat.profiles[id];
    if (!p) return Object.assign({}, cat, { profile: null });
    const templates = {};
    for (const [k, t] of Object.entries(cat.templates)) templates[k] = Object.assign({}, t, (p.templates || {})[k] || {});
    const merge = p.merge || {};
    const roles = cat.roles.map((r) => {
      const o = (p.roles || {})[r.name] || {};
      const via = o.via ? sortStr(o.via) : sortStr((r.via || []).map((g) => merge[g] || g));
      return Object.assign({}, r, { via, override: Object.assign({}, r.override || {}, o.override || {}), note: o.note || r.note });
    });
    const pool = allGroups(cat);
    const groups = p.groups ? p.groups.map((n) => pool.find((g) => g.name === n)).filter(Boolean) : cat.groups.slice();
    const out = Object.assign({}, cat, { templates, roles, groups, profile: { id, label: p.label, size: p.size, description: p.description, regions: !!p.regions, rmau: p.rmau || [], scoped: p.scoped || [], intune: p.intune || null } });
    out.roles = jobOverrides(out, p.scoped || [], !!p.regions);
    return out;
  }
  // ---- 3.0: job groups and direct groups ----------------------------------
  // A job group (path job) holds every role of the job ACTIVE, permanently;
  // its eligible members activate the group once. A direct group (path
  // direct) is ELIGIBLE per role. Regional groups take their path from the
  // region template.
  const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function groupPath(cat, name) {
    const g = allGroups(cat).find((x) => x.name === name);
    if (g) return g.path || null;
    for (const t of ((cat.regions && cat.regions.template && cat.regions.template.groups) || [])) {
      if (new RegExp("^" + escRe(t.name).replace("<REG>", ".+") + "$").test(name)) return t.path || null;
    }
    return null;
  }
  const isJob = (cat, name) => groupPath(cat, name) === "job";
  // Every role a job group holds — at tenant scope, at the executive unit,
  // in the regions — allows a permanent active assignment: the gate is the
  // eligible membership, not the role.
  function jobOverrides(cat, scoped, regions) {
    const held = new Set();
    cat.roles.forEach((r) => { if ((r.via || []).some((g) => isJob(cat, g))) held.add(r.name); });
    (scoped || []).forEach((x) => { if (isJob(cat, x.group)) held.add(x.role); });
    if (regions) (((cat.regions && cat.regions.template) || {}).eligibilities || []).forEach((e) => { if (isJob(cat, e.group)) held.add(e.role); });
    return cat.roles.map((r) => (held.has(r.name) ? Object.assign({}, r, { override: Object.assign({}, r.override || {}, { AllowPermanentActiveAssignment: true }), jobHeld: true }) : r));
  }
  // The baseline tenant: every profile at once (every group, every scoped
  // assignment, the regions).
  function everyProfile(cat) {
    const scoped = Object.values(cat.profiles || {}).flatMap((p) => p.scoped || []);
    return Object.assign({}, cat, { roles: jobOverrides(cat, scoped, true) });
  }
  const profileIds = (cat) => Object.keys(cat.profiles || {});
  // Every group any profile uses — the baseline tenant carries all of them.
  const allGroups = (cat) => { const seen = new Set(); return [...cat.groups, ...(cat.groupsSmall || []), ...(cat.groupsLarge || [])].filter((g) => !seen.has(g.name) && seen.add(g.name)); };

  // ---- regions -----------------------------------------------------------
  // CSV with quoted fields (comma, or semicolon when the file has no comma).
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    const t = String(text || "").replace(/^﻿/, "");
    const sep = t.includes(",") ? "," : ";";
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }
  // Never throws. errors: the file or a row cannot be used (a row with an
  // error is left out, the others load); warnings: loaded, but look.
  function parseRegions(text, cat) {
    const R = cat.regions || {}, cols = R.columns || [], F = R.fields || {};
    const errors = [], warnings = [], rows = [];
    const out = () => ({ rows, errors, warnings });
    const raw = String(text == null ? "" : text);
    if (R.maxBytes && raw.length > R.maxBytes) { errors.push(`The file is larger than ${Math.round(R.maxBytes / 1024)} KB — a regions file is one row per region.`); return out(); }
    const trimmed = raw.trim();
    if (!trimmed) { errors.push("The file is empty."); return out(); }
    let objs;
    if (trimmed[0] === "[" || trimmed[0] === "{") {
      let j;
      try { j = JSON.parse(trimmed); } catch (e) { errors.push(`Not valid JSON: ${e.message}`); return out(); }
      if (Array.isArray(j)) objs = j;
      else if (j && typeof j === "object" && Array.isArray(j.regions)) objs = j.regions;
      else { errors.push("JSON must be an array of regions, or an object whose regions is an array."); return out(); }
    } else {
      const table = parseCsv(trimmed);
      const head = table[0].map((h) => String(h).trim());
      if (!head.includes("code")) { errors.push(`The first line must be the header: ${cols.join(",")}`); return out(); }
      head.forEach((h) => { if (h && !cols.includes(h)) warnings.push(`Column "${h}" is not one the template reads (ignored).`); });
      objs = table.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] == null ? "" : r[i]).trim()])));
    }
    if (R.maxRows && objs.length > R.maxRows) { errors.push(`${objs.length} rows — more than ${R.maxRows}; split the file.`); return out(); }
    const re = (k) => (F[k] ? new RegExp(F[k]) : null);
    const codeRe = new RegExp(R.codePattern || "^[A-Z0-9-]+$");
    const seen = new Set();
    const str = (v) => (v == null ? "" : typeof v === "string" || typeof v === "number" ? String(v).trim() : null);
    objs.forEach((o, i) => {
      const line = i + 2;
      if (!o || typeof o !== "object" || Array.isArray(o)) { errors.push(`Row ${line}: not a region (an object with code and name).`); return; }
      const fields = {};
      for (const k of ["code", "name", "attribute", "value", "devicePrefix", "autopilotTag", "itLead", "timezone"]) {
        const v = str(o[k]);
        if (v === null) { errors.push(`Row ${line}: ${k} must be text.`); return; }
        fields[k] = v;
      }
      const code = fields.code.toUpperCase();
      if (!code) { errors.push(`Row ${line}: no code.`); return; }
      if (!codeRe.test(code)) { errors.push(`Row ${line}: code "${code}" does not follow continent-country (EU-NL, NA-US, APAC-SG).`); return; }
      if (seen.has(code)) { errors.push(`Row ${line}: code ${code} twice.`); return; }
      const last = code.split("-").pop();
      let approvers = o.approvers;
      if (approvers == null || approvers === "") approvers = [];
      else if (typeof approvers === "string") approvers = approvers.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
      else if (Array.isArray(approvers) && approvers.every((x) => typeof x === "string")) approvers = approvers.map((x) => x.trim()).filter(Boolean);
      else { errors.push(`Row ${line}: approvers must be text (a;b) or a list of addresses.`); return; }
      const row = {
        code, name: fields.name || code,
        attribute: fields.attribute || "extensionAttribute1",
        value: fields.value || code,
        devicePrefix: fields.devicePrefix || `${last}-`,
        autopilotTag: fields.autopilotTag || code,
        itLead: fields.itLead, approvers, timezone: fields.timezone,
      };
      const bad = [];
      if (re("attribute") && !re("attribute").test(row.attribute)) bad.push(`attribute "${row.attribute}" — only extensionAttribute1 to extensionAttribute15 exist on users and devices both`);
      if (re("value") && !re("value").test(row.value)) bad.push(`value "${row.value}" — letters, digits, space, dot, dash and underscore only (it goes inside a membership rule)`);
      if (re("devicePrefix") && !re("devicePrefix").test(row.devicePrefix)) bad.push(`devicePrefix "${row.devicePrefix}" — letters, digits and dashes, at most 15`);
      if (re("autopilotTag") && !re("autopilotTag").test(row.autopilotTag)) bad.push(`autopilotTag "${row.autopilotTag}"`);
      if (re("name") && !re("name").test(row.name)) bad.push("name — at most 64 characters, no quotes or angle brackets");
      if (row.itLead && re("email") && !re("email").test(row.itLead)) bad.push(`itLead "${row.itLead}" is not an address`);
      row.approvers.forEach((a) => { if (re("email") && !re("email").test(a)) bad.push(`approver "${a}" is not an address`); });
      if (bad.length) { errors.push(`Row ${line} (${code}) left out: ${bad.join("; ")}.`); return; }
      seen.add(code);
      if (!fields.name) warnings.push(`Row ${line}: ${code} has no name (the code is used).`);
      if (!row.approvers.length) warnings.push(`Row ${line}: ${code} names no approvers — PIM-SG-${code}-Approvers stays empty.`);
      if (!row.itLead) warnings.push(`Row ${line}: ${code} names no IT lead to review the region's access.`);
      if (row.timezone && re("timezone") && !re("timezone").test(row.timezone)) warnings.push(`Row ${line}: timezone "${row.timezone}" does not look like Europe/Amsterdam.`);
      rows.push(row);
    });
    return out();
  }
  // One row through the template: every <REG>, <attribute>, … replaced. The
  // values were validated to a safe character set; a value that is not is
  // refused here as well, so no caller can build a rule from one.
  function fill(v, row) {
    if (typeof v === "string") return v.replace(/<(REG|attribute|value|devicePrefix|autopilotTag|itLead|approvers|name|timezone)>/g, (m, k) => (k === "REG" ? row.code : k === "approvers" ? row.approvers.join("; ") : String(row[k] ?? "")));
    if (Array.isArray(v)) return v.map((x) => fill(x, row));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, row)]));
    return v;
  }
  function region(cat, row) {
    const F = (cat.regions && cat.regions.fields) || {};
    for (const k of ["attribute", "value", "devicePrefix", "autopilotTag"]) if (F[k] && !new RegExp(F[k]).test(String(row[k] || ""))) throw new Error(`region ${row.code}: ${k} "${row[k]}" is not safe to put in a rule`);
    const T = (cat.regions && cat.regions.template) || {};
    return Object.assign({ code: row.code, name: row.name, row }, fill({ aus: T.aus || [], groups: T.groups || [], eligibilities: T.eligibilities || [], intune: T.intune || {}, review: T.review || null }, row));
  }
  // A membership rule compared without its whitespace and quote style.
  const ruleKey = (r) => String(r || "").replace(/\s+/g, " ").replace(/[‘’“”]/g, '"').trim().toLowerCase();
  // tenant adds: aus:[{id, displayName, membershipType, membershipRule, membershipRuleProcessingState, isMemberManagementRestricted}] | null,
  //   named:[…] | null (null = not read), eligible[].directoryScopeId ("/" or "/administrativeUnits/<id>")
  function compareRegions(cat, rows, tenant) {
    const auRead = Array.isArray(tenant.aus);
    const namedRead = Array.isArray(tenant.named);
    const ausBy = new Map();
    (tenant.aus || []).forEach((a) => { const k = String(a.displayName); (ausBy.get(k) || ausBy.set(k, []).get(k)).push(a); });
    const byName = groupIndex(tenant);
    const domain = tenant.domain || null;
    const names = tenant.names || {};
    const gotOf = (rules) => { const g = fromRules(rules, names); if (!domain && Array.isArray(g.recipients)) g.recipients = sortStr(g.recipients.map(local)); return g; };
    const regions = rows.map((row) => {
      const r = region(cat, row);
      const items = [];
      const auIds = {};
      r.aus.forEach((a) => {
        const list = ausBy.get(a.name) || [];
        let status = !auRead ? "unread" : !list.length ? "missing" : list.length > 1 ? "conflict" : "match", detail = "";
        if (list.length > 1) detail = `${list.length} units are called ${a.name} (${list.map((x) => x.id).join(", ")})`;
        if (list.length === 1) {
          const t = list[0]; auIds[a.name] = t.id;
          const dyn = t.membershipType === "Dynamic";
          if (a.kind === "dynamic" && !dyn) { status = "differs"; detail = "assigned in the tenant; the template says dynamic"; }
          else if (a.kind === "dynamic" && ruleKey(t.membershipRule) !== ruleKey(a.rule)) { status = "differs"; detail = `rule: ${t.membershipRule || "(none)"}`; }
          else if (a.kind === "dynamic" && t.membershipRuleProcessingState && t.membershipRuleProcessingState !== "On") { status = "differs"; detail = `rule processing is ${t.membershipRuleProcessingState} — nobody new joins the unit`; }
          else if (a.kind === "assigned" && dyn) { status = "differs"; detail = "dynamic in the tenant; the template says assigned (dynamic units cannot hold groups)"; }
          if (t.isMemberManagementRestricted) { status = status === "match" ? "differs" : status; detail = (detail ? detail + "; " : "") + "a restricted management unit — the region's admins would be locked out of it"; }
        }
        items.push({ kind: "au", name: a.name, expect: a.kind === "dynamic" ? `dynamic · ${a.rule}` : "assigned", status, detail, note: a.note || "" });
      });
      const groupIds = {};
      r.groups.forEach((g) => {
        const list = byName.get(g.name) || [];
        // Role-assignable groups come from the main read; plain ones only
        // from the framework-groups read — if that failed, they are unknown.
        let status, detail = "";
        if (list.length > 1) { status = "conflict"; detail = `${list.length} groups are called ${g.name} (${list.map((x) => x.id).join(", ")})`; }
        else if (list.length === 1) {
          const t = list[0]; status = "match"; groupIds[g.name] = t.id;
          if (g.roleAssignable && t.isAssignableToRole === false) { status = "differs"; detail = "not role-assignable — recreate it; the flag cannot be set later"; }
          else if (!g.roleAssignable && t.isAssignableToRole === true) { status = "differs"; detail = "role-assignable; the approver group is a plain group"; }
          else if (g.template) {
            const rules = tenant.groupPolicies ? (tenant.groupPolicies[t.id] || tenant.groupPolicies[t.displayName]) : null;
            if (rules) { const d = diff(expected(cat, g, domain), gotOf(rules)); if (d.length) { status = "differs"; detail = d.map((x) => `${x.label}: ${x.tenant} → ${x.baseline}`).join("; "); } }
            else { status = "unread"; detail = "membership settings (PIM for Groups) not read"; }
          }
        } else status = (!g.roleAssignable && !namedRead) ? "unread" : "missing";
        items.push({ kind: g.intune ? "intune-access" : "group", name: g.name, expect: g.roleAssignable ? `role-assignable · ${/^GroupJIT/.test(g.template) ? `eligible members (${g.template})` : "active members (GroupMember)"}` : `plain · members ${g.members || "—"}`, status, detail, note: g.description || "" });
      });
      r.eligibilities.forEach((e) => {
        const auId = auIds[e.au], gid = groupIds[e.group];
        const job = isJob(cat, e.group);
        const mine = gid ? (job ? (tenant.active || []).filter((a) => a.assignmentType !== "Activated") : (tenant.eligible || [])).filter((a) => a.roleName === e.role && a.principalId === gid) : [];
        const hit = auId ? mine.some((a) => a.directoryScopeId === `/administrativeUnits/${auId}`) : false;
        const wide = mine.some(TENANT_SCOPE);
        let status = !auRead ? "unread" : hit && !wide ? "match" : hit && wide ? "differs" : "missing";
        let detail = "";
        if (job && gid && !hit && (tenant.eligible || []).some((a) => a.roleName === e.role && a.principalId === gid)) detail = "still ELIGIBLE (2.x) — a regional job group holds it ACTIVE at the unit";
        else if (wide) detail = hit ? "ALSO held at tenant scope — wider than the region; remove the tenant-wide eligibility" : "held at TENANT scope — wider than the region; re-scope it";
        else if (!hit && auRead && !auId) detail = "the unit is missing, so the scoped eligibility cannot exist yet";
        else if (!hit && !gid) detail = "the group is missing";
        items.push({ kind: "eligibility", name: `${e.role} → ${e.group}`, expect: `${job ? "active, permanent," : "eligible"} at ${e.au}`, status, detail });
      });
      (r.intune.groups || []).forEach((g) => {
        const list = byName.get(g.name) || [];
        let status = list.length > 1 ? "conflict" : list.length ? "match" : namedRead ? "missing" : "unread", detail = "";
        if (list.length > 1) detail = `${list.length} groups are called ${g.name}`;
        if (list.length === 1) {
          const t = list[0];
          if (ruleKey(t.membershipRule) !== ruleKey(g.rule)) { status = "differs"; detail = `rule: ${t.membershipRule || "(none)"}`; }
          else if (t.membershipRuleProcessingState && t.membershipRuleProcessingState !== "On") { status = "differs"; detail = `rule processing is ${t.membershipRuleProcessingState}`; }
        }
        items.push({ kind: "intune-group", name: g.name, expect: `dynamic ${g.type} · ${g.rule}`, status, detail });
      });
      // Intune RBAC verdicts come from 📱 T53's read (32423) when it ran;
      // until then these rows are Not read, never a match.
      const iv = tenant.intune && tenant.intune.verdicts;
      const ivOf = (k) => (iv && iv[k]) || { status: "unread", detail: "Intune RBAC not read yet — 📱 Intune RBAC (T53) reads it" };
      if (r.intune.tag) { const v = ivOf(r.intune.tag.name); items.push({ kind: "intune", name: r.intune.tag.name, expect: `scope tag, auto-assigned from ${r.intune.tag.autoAssignFrom}`, status: v.status, detail: v.detail }); }
      (r.intune.assignments || []).forEach((a) => (a.roles || []).forEach((role) => { const v = ivOf(`${a.name}|${role}`); items.push({ kind: "intune", name: a.name, expect: `${role} · members ${a.members.join(", ")} · scope ${a.scopeGroups.join(", ")} · tag ${a.tags.join(", ")}`, status: v.status, detail: v.detail }); }));
      const counts = { match: 0, differs: 0, missing: 0, unread: 0, conflict: 0 };
      items.forEach((i) => { counts[i.status]++; });
      const compared = items.length - counts.unread;
      const status = counts.conflict ? "conflict" : counts.missing ? "missing" : counts.differs ? "differs" : counts.unread ? (compared ? "partial" : "unread") : "match";
      return { code: r.code, name: r.name, row, items, counts, compared, status, review: r.review, autopilot: r.intune.autopilot || null };
    });
    const central = ((cat.profile && cat.profile.rmau) || []).map((u) => {
      const list = ausBy.get(u.name) || [];
      const t = list[0];
      const status = !auRead ? "unread" : !list.length ? "missing" : list.length > 1 ? "conflict" : (u.restricted && !t.isMemberManagementRestricted) ? "differs" : "match";
      return { kind: "rmau", name: u.name, expect: `restricted management unit · ${u.holds}`, status, detail: status === "differs" ? "exists but is not restricted — only settable at creation" : "" };
    });
    const totals = { regions: regions.length, match: 0, differs: 0, missing: 0, unread: 0, conflict: 0 };
    regions.forEach((r) => { for (const k of Object.keys(r.counts)) totals[k] += r.counts[k]; });
    central.forEach((c) => { totals[c.status]++; });
    const missingCodes = regions.filter((r) => r.status !== "match" && r.status !== "partial").map((r) => r.code);
    return { regions, central, totals, missingCodes, auRead, namedRead, readAt: tenant.readAt || null, demo: !!tenant.demo, profile: cat.profile || null, tenantId: tenant.tenantId || null };
  }
  const RPILL = { match: ["ok", "✓ Match"], partial: ["ok", "✓ Entra matches · Intune not read"], differs: ["warn", "≠ Differs"], missing: ["bad", "∅ Missing"], unread: ["na", "? Not read"], conflict: ["bad", "⚠ Conflict"] };
  const rpill = (s) => `<span class="xt-pill pmb-${RPILL[s][0]}">${esc(RPILL[s][1])}</span>`;
  function renderRegions(res, opts = {}) {
    const q = String(opts.q || "").trim().toLowerCase();
    const sel = opts.selected || null;
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const t = res.totals;
    const head = `<div class="xt-tiles pmb-tiles"><div class="xt-tile"><b>${t.regions}</b>region${t.regions === 1 ? "" : "s"} in the file</div><div class="xt-tile"><b>${t.match}</b>match</div><div class="xt-tile${t.differs ? " m" : ""}"><b>${t.differs}</b>differ</div><div class="xt-tile${t.missing ? " h" : ""}"><b>${t.missing}</b>missing</div><div class="xt-tile${t.conflict ? " h" : ""}"><b>${t.conflict}</b>conflict</div><div class="xt-tile"><b>${t.unread}</b>not read</div></div>`;
    const KIND = { au: "unit", group: "group", "intune-access": "Intune access", eligibility: "eligible", "intune-group": "Intune scope", intune: "Intune", rmau: "RMAU" };
    const item = (i) => `<tr class="pmb-row pmb-${i.status}"><td><span class="pmb-kind">${esc(KIND[i.kind] || i.kind)}</span></td><td><b>${esc(i.name)}</b>${i.note ? `<div class="mini pmb-note">${esc(i.note)}</div>` : ""}</td><td class="mini">${esc(i.expect)}</td><td>${rpill(i.status)}${i.detail ? `<div class="mini ${i.status === "unread" ? "" : "pmb-bad-txt"}">${esc(i.detail)}</div>` : ""}</td></tr>`;
    const central = res.central.length ? `<div class="list-card xt-card"><h3>Central <span class="mini">what the profile expects beside the regions</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Object</th><th>Expected</th><th>Verdict</th></tr></thead><tbody>${res.central.map(item).join("")}</tbody></table></div></div>` : "";
    const cards = res.regions.filter((r) => hit(r.code + " " + r.name + " " + r.items.map((i) => i.name).join(" "))).map((r) => {
      const can = r.status !== "match" && r.status !== "conflict";
      const on = can && (sel ? sel.has(r.code) : true);
      return `<div class="list-card xt-card pmb-region"><h3><input type="checkbox" data-pmbreg="${esc(r.code)}"${on ? " checked" : ""}${can ? "" : " disabled"} aria-label="Take ${esc(r.code)} into the regions file"> ${esc(r.code)} · ${esc(r.name)} ${rpill(r.status)} <span class="mini">${r.counts.match} of ${r.compared} compared match · ${r.counts.missing} missing · ${r.counts.differs} differ${r.counts.conflict ? ` · ${r.counts.conflict} conflict` : ""}${r.counts.unread ? ` · ${r.counts.unread} not read` : ""}</span></h3>
      <p class="mini pmb-rowline">${esc(r.row.attribute)} = "${esc(r.row.value)}" · devices ${esc(r.row.devicePrefix)}%SERIAL% · Autopilot tag ${esc(r.row.autopilotTag)}${r.row.itLead ? ` · IT lead ${esc(r.row.itLead)}` : ""}${r.row.approvers.length ? ` · approvers ${esc(r.row.approvers.join(", "))}` : ""}${r.row.timezone ? ` · ${esc(r.row.timezone)}` : ""}${r.review ? ` · ${esc(r.review.cadence)} access review by ${esc(r.review.reviewer || "the IT lead")} (set up by hand)` : ""}</p>
      <div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Object</th><th>Expected</th><th>Verdict</th></tr></thead><tbody>${r.items.map(item).join("")}</tbody></table></div></div>`;
    }).join("");
    return head + central + (cards || `<p class="mini" style="padding:14px">No region matches the search.</p>`);
  }
  function regionsMd(res, tenantName) {
    const L = [`# 🗺 Regions — ${tenantName || "tenant"}`, `${res.demo ? "Demo data. " : ""}${res.totals.regions} regions from the file · ${res.totals.match} match · ${res.totals.differs} differ · ${res.totals.missing} missing · ${res.totals.conflict} conflict · ${res.totals.unread} not read.${res.readAt ? ` Tenant read ${new Date(res.readAt).toISOString()}.` : ""}`, ""];
    const line = (i) => `| ${i.kind} | ${i.name} | ${i.expect} | ${RPILL[i.status][1]}${i.detail ? ` — ${i.detail}` : ""} |`;
    if (res.central.length) { L.push("## Central", "", "| Kind | Object | Expected | Verdict |", "|---|---|---|---|", ...res.central.map(line), ""); }
    res.regions.forEach((r) => { L.push(`## ${r.code} · ${r.name} — ${RPILL[r.status][1]}`, "", "| Kind | Object | Expected | Verdict |", "|---|---|---|---|", ...r.items.map(line), ""); });
    return L.join("\n");
  }
  const SCHEMA = { config: "cloudfellows-pim-config/2.1", regions: "cloudfellows-pim-regions/2.1" };
  // The file New-PimRegions.ps1 plans from: the rows (only the chosen
  // regions when asked), the template, the group templates and the Intune
  // role — names, never ids. approvers is always an ARRAY of addresses.
  function toRegionsFile(cat, rows, opts = {}) {
    const only = opts.codes ? new Set(opts.codes) : null;
    return {
      _comment: `${cat.label} ${cat.release} — regions for ${opts.domain || "<tenant domain>"}, profile ${(cat.profile && cat.profile.label) || "multi-region"}. Generated by ENCA T48 → Regions. Plan: tools/pim/New-PimRegions.ps1 -RegionsFile <this file> -Customer <key>; apply with -Apply -PlanFile <the plan it wrote>.`,
      _meta: Object.assign({ schema: SCHEMA.regions, catalog: `${cat.label} ${cat.release}`, revised: cat.revised, profile: (cat.profile && cat.profile.id) || "multi" }, opts.meta || {}),
      profile: (cat.profile && cat.profile.id) || "multi",
      regions: rows.filter((r) => !only || only.has(r.code)).map((r) => Object.assign({}, r, { approvers: (r.approvers || []).slice() })),
      template: (cat.regions && cat.regions.template) || {},
      fields: (cat.regions && cat.regions.fields) || {},
      codePattern: (cat.regions && cat.regions.codePattern) || "",
      central: { rmau: (cat.profile && cat.profile.rmau) || [] },
      groupTemplates: Object.fromEntries(uniq(["GroupMember", "GroupJIT", ...((((cat.regions && cat.regions.template) || {}).groups || []).map((g) => g.template).filter(Boolean))]).filter((k) => cat.templates[k]).map((k) => [k, cat.templates[k]])),
      intuneRoles: cat.intuneRoles || [],
    };
  }
  const regionsCommand = (file, customer) => `.\\tools\\pim\\New-PimRegions.ps1 -RegionsFile .\\${file} -Customer ${customer || "<Customers.json key>"}`;

  // ---- the export --------------------------------------------------------
  // The catalog as the framework's config (EasyPIM.Orchestrator's shape).
  // Names stay names — the approver group, the persona groups — because the
  // catalog is tenant-neutral; tools/pim/New-PimBaseline.ps1 resolves them
  // to ids in the tenant it plans for. ProtectedUsers carries explicit ids
  // only (opts.protectedIds); no name pattern ever protects anybody.
  function toOrchestrator(cat, opts = {}) {
    const domain = opts.domain || "<tenant domain>";
    const mail = (n) => (n.includes("@") ? n : `${n}@${domain}`);
    const tmpl = (t) => {
      const o = {};
      for (const [k, v] of Object.entries(t)) {
        if (k === "description") continue;
        if (k === "Approvers") o[k] = (v || []).map((name) => ({ id: opts.ids && opts.ids[name] || `<id of ${name}>`, description: name, type: "group" }));
        else if (/^Notification_/.test(k)) o[k] = { isDefaultRecipientEnabled: String(!!v.isDefaultRecipientEnabled), notificationLevel: v.notificationLevel || "All", Recipients: (v.Recipients || []).map(mail) };
        else o[k] = v;
      }
      return o;
    };
    if (opts.everyProfile) cat = everyProfile(cat);
    const onlyRoles = opts.roles ? new Set(opts.roles) : null;
    const onlyGroups = opts.groups ? new Set(opts.groups) : null;
    const roles = cat.roles.filter((r) => !onlyRoles || onlyRoles.has(r.name));
    // The baseline tenant carries every profile's groups (opts.everyProfile),
    // so each profile has a real reference in cloudfellows.dev.
    const pool = opts.everyProfile ? allGroups(cat) : cat.groups;
    const groups = pool.filter((g) => !onlyGroups || onlyGroups.has(g.name));
    const usedTemplates = new Set([...roles.map((r) => r.template), ...groups.map((g) => g.template)]);
    const out = { _comment: `${cat.label} ${cat.release}, revised ${cat.revised}${opts.delta ? " — DELTA for one tenant: only what was selected" : ""}. Generated by ENCA T48 PIM baseline. Plan it with tools/pim/New-PimBaseline.ps1 -ConfigFile <this file> -Customer <key>; nothing is written until -Apply -PlanFile. EasyPIM users: resolve <id of …> first and strip the _ keys.` };
    out._protectedNote = "ProtectedUsers holds object ids only. Break-glass accounts are never found by name: list them explicitly. The framework's scripts never remove an assignment.";
    out._meta = Object.assign({ schema: SCHEMA.config, catalog: `${cat.label} ${cat.release}`, revised: cat.revised, profile: (cat.profile && cat.profile.id) || "base", delta: !!opts.delta }, opts.meta || {});
    out.PolicyTemplates = Object.fromEntries(Object.entries(cat.templates).filter(([k]) => usedTemplates.has(k)).map(([k, t]) => [k, tmpl(t)]));
    out.EntraRoles = { Policies: Object.fromEntries(roles.map((r) => [r.name, Object.assign({ Template: r.template }, r.override && Object.keys(r.override).length ? tmpl(Object.assign({}, r.override)) : {})])) };
    out.GroupRoles = { Policies: Object.fromEntries(groups.map((g) => [g.name, { Member: { Template: g.template } }])) };
    // 3.0: a job group holds its roles ACTIVE, permanently (its people are
    // ELIGIBLE members); a direct group is ELIGIBLE for each role (its people
    // are ACTIVE members). Nobody gets a role directly.
    const byRole = {};
    const wanted = (r, g) => (!onlyRoles && !onlyGroups) || (onlyRoles && onlyRoles.has(r.name)) || (onlyGroups && onlyGroups.has(g));
    cat.roles.forEach((r) => (r.via || []).forEach((g) => { if (wanted(r, g)) (byRole[r.name] = byRole[r.name] || []).push(g); }));
    out.Assignments = { EntraRoles: Object.entries(byRole).map(([roleName, gs]) => ({ roleName, assignments: gs.map((g) => Object.assign({ principalId: opts.ids && opts.ids[g] || `<id of ${g}>`, principalName: g, principalType: "Group" }, isJob(cat, g) ? { assignmentType: "Active", permanent: true } : { assignmentType: "Eligible", duration: "P365D" }, { justification: `${cat.label} ${cat.release}: ${g} ${isJob(cat, g) ? "holds" : "carries"} ${roleName}` })) })) };
    out.ProtectedUsers = [...((cat.protected && cat.protected.groups) || []).map((g) => opts.ids && opts.ids[g] || `<id of ${g}>`), ...(opts.protectedIds || [])];
    return out;
  }
  // ---- the EasyPIM samples (one per profile) ------------------------------
  // A commented config to copy and edit: EasyPIM.Orchestrator reads // and
  // /* */ comments, and so does New-PimBaseline.ps1. Every line to change
  // says EDIT; a person is never a real id here — "<EDIT: …>" is refused by
  // both the script and EasyPIM until it is replaced.
  const SAMPLE = {
    small: {
      title: "Small business (25–250 people, two to six in IT)",
      people: [
        ["PIM-SG-M365-GlobalAdmin", "Active", "adm- account of admin 1 (2 people, never 1, never 4)"],
        ["PIM-SG-M365-GlobalAdmin", "Active", "adm- account of admin 2"],
        ["PIM-SG-M365-SecOps", "Active", "adm- account of the security-minded admin, or the MSP's"],
        ["PIM-SG-M365-Ops", "Active", "adm- account of each person in IT"],
        ["PIM-SG-M365-SecOpsReader", "Active", "adm- account of IT, the auditor, the MSP's reviewer"],
        ["PIM-SG-INT-Ops", "Eligible", "adm- account of each person in IT (Intune: activate the group)"],
        ["PIM-SG-INT-SecOps", "Eligible", "adm- account of the security-minded admin"],
        ["PIM-SG-XDR-Admin", "Eligible", "adm- account of the security-minded admin (Defender XDR Administrator: two hours, approval)"],
        ["PIM-SG-XDR-Operator-T3", "Eligible", "adm- account of each person in IT (Defender XDR Operator T3: activate the group)"],
        ["PIM-SG-XDR-Reader", "Eligible", "adm- account of IT, the auditor, the MSP's reviewer (Defender XDR Reader)"],
      ],
      notes: [
        "Approval only on Global Administrator itself (the override below): the other admins approve, so there must be at least two.",
        "Defender XDR: the PIM-SG-XDR groups are the Entra side only. Create the three roles (Administrator, Operator T3, Reader) and their assignments at scope All, each naming its group, in the Defender portal, then activate unified RBAC per workload — EasyPIM and ENCA never touch the portal.",
        "PIM-SG-Approvers = the admins; an approval nobody can give is a control that gets switched off.",
        "The three Azure groups are created only when there is Azure; delete their blocks otherwise.",
      ],
    },
    large: {
      title: "Large organisation, one region (several IT teams, a service desk, an ITSM tool)",
      people: [
        ["PIM-SG-M365-GlobalAdmin", "Active", "adm- account (2 to 4 people incl. break-glass)"],
        ["PIM-SG-M365-Tier0", "Active", "adm- account of the identity lead"],
        ["PIM-SG-M365-SecOps", "Active", "adm- account of each SOC engineer"],
        ["PIM-SG-M365-Identity", "Active", "adm- account of each identity engineer"],
        ["PIM-SG-M365-Workplace", "Active", "adm- account of each endpoint engineer"],
        ["PIM-SG-M365-Collab", "Active", "adm- account of each messaging / collaboration engineer"],
        ["PIM-SG-M365-Apps", "Active", "adm- account of each application engineer"],
        ["PIM-SG-M365-ServiceDesk", "Active", "adm- account of each service-desk agent"],
        ["PIM-SG-M365-ServiceDesk-VIP", "Active", "adm- account of the named few who may help executives"],
        ["PIM-SG-M365-SecOpsReader", "Active", "adm- account of each SOC analyst"],
        ["PIM-SG-M365-Audit", "Active", "adm- account of each internal auditor"],
        ["PIM-SG-INT-Ops", "Eligible", "adm- account of each endpoint engineer (Intune: activate the group)"],
        ["PIM-SG-INT-HelpDesk", "Eligible", "adm- account of each service-desk agent"],
        ["PIM-SG-INT-SecOps", "Eligible", "adm- account of each SOC engineer"],
        ["PIM-SG-XDR-Admin", "Eligible", "adm- account of each SOC engineer who administers Defender (Defender XDR Administrator: two hours, the Tier 0 rota approves)"],
        ["PIM-SG-XDR-Operator-T3", "Eligible", "adm- account of each endpoint engineer (Defender XDR Operator T3)"],
        ["PIM-SG-XDR-Operator-T2", "Eligible", "adm- account of each second-line engineer (Defender XDR Operator T2)"],
        ["PIM-SG-XDR-Operator-T1", "Eligible", "adm- account of each service-desk agent (Defender XDR Operator T1)"],
        ["PIM-SG-XDR-Reader", "Eligible", "adm- account of each SOC analyst and internal auditor (Defender XDR Reader)"],
      ],
      notes: [
        "Ticketing is on for Tier 0 and Tier 1: every activation carries the ITSM reference.",
        "Defender XDR: the PIM-SG-XDR groups are the Entra side only. Create the five roles and their assignments at scope All, each naming its group, in the Defender portal, then activate unified RBAC per workload — EasyPIM and ENCA never touch the portal.",
        "PIM-SG-Approvers-Tier0 is the rota: three named people (security lead, IT manager, a deputy) — a plain group, never role-assignable, never the requester.",
        "ServiceDesk-VIP and Identity get their desk roles SCOPED to AU-RM-Executives. EasyPIM writes Entra role assignments at tenant scope only, so make those in 🛡 Restricted AUs (T27) or the portal — they are not in this file.",
        "AU-RM-Executives (restricted management) is filled by hand with the executives and their devices. Never put a PIM-SG group or an adm- account in a restricted AU.",
      ],
    },
    multi: {
      title: "Large organisation, several regions (central IT plus local IT per region)",
      people: [
        ["PIM-SG-M365-GlobalAdmin", "Active", "adm- account (2 to 4 people incl. break-glass)"],
        ["PIM-SG-M365-Tier0", "Active", "adm- account of the central identity lead"],
        ["PIM-SG-M365-SecOps", "Active", "adm- account of each central SOC engineer"],
        ["PIM-SG-M365-Ops", "Active", "adm- account of each central second-line engineer"],
        ["PIM-SG-M365-Helpdesk", "Active", "adm- account of the central desk (only if one desk serves every region)"],
        ["PIM-SG-M365-AppOps", "Active", "adm- account of each application engineer"],
        ["PIM-SG-M365-SecOpsReader", "Active", "adm- account of each SOC analyst"],
        ["PIM-SG-INT-Ops", "Eligible", "adm- account of each central Workplace engineer (Intune: activate the group)"],
        ["PIM-SG-INT-SecOps", "Eligible", "adm- account of each central SOC engineer"],
        ["PIM-SG-XDR-Admin", "Eligible", "adm- account of each central SOC engineer who administers Defender (Defender XDR Administrator: two hours, approval)"],
        ["PIM-SG-XDR-Operator-T3", "Eligible", "adm- account of each central second-line engineer (Defender XDR Operator T3)"],
        ["PIM-SG-XDR-Operator-T2", "Eligible", "adm- account of the second line between the desk and Ops (Defender XDR Operator T2)"],
        ["PIM-SG-XDR-Operator-T1", "Eligible", "adm- account of the central desk (Defender XDR Operator T1)"],
        ["PIM-SG-XDR-Reader", "Eligible", "adm- account of each SOC analyst (Defender XDR Reader)"],
      ],
      notes: [
        "Defender XDR: the PIM-SG-XDR groups are central and the Entra side only — no regional XDR groups. Create the five roles and their assignments at scope All, each naming its group, in the Defender portal, then activate unified RBAC per workload — EasyPIM and ENCA never touch the portal.",
        "This file is the CENTRE. The regions are not in it: EasyPIM writes Entra role assignments at tenant scope only (directoryScopeId \"/\"), and every regional eligibility is scoped to the region's administrative unit.",
        "Regions: fill regions.csv (one row per region) and run tools/pim/New-PimRegions.ps1 — units, PIM-SG-<REG>-Helpdesk / -Ops, PIM-SG-INT-*-<REG>, the scoped eligibilities, the Intune scope groups, tag and assignments.",
        "Regional people: active members of PIM-SG-<REG>-Helpdesk / -Ops, eligible members of PIM-SG-INT-HelpDesk-<REG> / -Ops-<REG> — add them with an Assignments.Groups block per group, as below, once the groups exist.",
      ],
    },
  };
  function toSample(cat, id, opts = {}) {
    const prof = profile(cat, id);
    const S = SAMPLE[id] || { title: prof.profile ? prof.profile.label : id, people: [], notes: [] };
    const domain = opts.domain || "contoso.com";
    const cfg = toOrchestrator(prof, { domain, meta: { sample: id } });
    delete cfg._comment; delete cfg._protectedNote;
    const hasGroup = new Set(prof.groups.map((g) => g.name));
    const byGroup = {};
    // 3.0: people are ELIGIBLE in job groups, ACTIVE in direct groups.
    const people = S.people.map(([g, type, who]) => [g, isJob(prof, g) ? "Eligible" : type, who]);
    prof.groups.filter((g) => g.path === "direct" && !people.some(([n]) => n === g.name)).forEach((g) => people.push([g.name, "Active", `adm- account of each person who needs these roles one at a time (${g.persona})`]));
    people.filter(([g]) => hasGroup.has(g)).forEach(([g, type, who]) => { (byGroup[g] = byGroup[g] || []).push({ principalId: `<EDIT: object id of ${who}>`, assignmentType: type, duration: "P365D", justification: `EDIT: why this person is ${type === "Active" ? "a member" : "eligible"}` }); });
    cfg.Assignments.Groups = Object.entries(byGroup).map(([g, a]) => ({ groupId: `<id of ${g}>`, roleName: "Member", assignments: a }));
    cfg.ProtectedUsers = [...cfg.ProtectedUsers, "<EDIT: object id of break-glass account 1>", "<EDIT: object id of break-glass account 2>"];
    const C = {
      _meta: ["Where the sample comes from. Leave it; EasyPIM ignores it."],
      PolicyTemplates: ["The tiers. A role or group names one; change a tier here, not per role.", `EDIT: every "pim-alerts@${domain}" → your alert mailbox (a shared mailbox read by real people, or the SOC).`],
      EntraRoles: ["Every Entra role under the framework and the tier it activates under. The inline settings are the few deliberate exceptions.", "EasyPIM finds a role by display name; a tenant can still carry a former one (Azure AD Joined Device Local Administrator). The resolved config of step 2 uses the names THIS tenant has."],
      GroupRoles: ["The groups' PIM for Groups Member policy. GroupJITTier1 = job groups (members ELIGIBLE, one activation of four hours gives the whole job); GroupMember = direct groups (members ACTIVE, at most a year, the roles eligible one at a time); GroupJIT = Intune, Defender XDR and Exchange access groups (members ELIGIBLE, activate for a shift); GroupJITTier0 = PIM-SG-XDR-Admin."],
      "  EntraRoles": ["The model: job groups hold their roles ACTIVE, permanently (assignmentType Active, permanent); direct groups are ELIGIBLE per role. Leave these; people never get a role directly."],
      "  Groups": ["People. EDIT every principalId: the object id of the person's adm- account.", "Job groups and Intune, Defender XDR and Exchange access groups: assignmentType Eligible, a year — the activation is the gate. Direct groups: Active, a year (the yearly review)."],
      ProtectedUsers: ["Never touched by EasyPIM. EDIT: the object ids of your break-glass accounts — by id, never by name."],
    };
    const lines = JSON.stringify(cfg, null, 2).split("\n");
    const out = [];
    for (const ln of lines) {
      const m = /^( {2}| {4})"([^"]+)":/.exec(ln);
      if (m) {
        const key = m[1] === "  " ? m[2] : `  ${m[2]}`;
        (C[key] || []).forEach((c) => out.push(`${m[1]}// ${c}`));
      }
      out.push(ln);
    }
    const head = [
      "// ======================================================================",
      `// ${cat.label} ${cat.release} — EasyPIM Orchestrator sample`,
      `// Scenario: ${S.title}`,
      `// Profile: ${prof.profile ? prof.profile.label : id} — ${prof.profile ? prof.profile.description : ""}`,
      "//",
      "// The model (3.0): JOB groups — people ELIGIBLE members, the group ACTIVE,",
      "// permanently, in every role of the job: one activation (four hours) gives",
      "// the whole job. DIRECT groups — people ACTIVE members, the group ELIGIBLE",
      "// per role — for Tier 0 and for the Exchange, SharePoint and Purview roles",
      "// (Microsoft: activation through a group can take hours to reach those",
      "// portals). Intune, Defender XDR and Exchange RBAC: PIM-SG-INT/XDR/EXO-*",
      "// groups whose members are ELIGIBLE and activate the group.",
      "//",
      "// HOW TO USE",
      "//  1. Copy this file to pim.<customer>.jsonc and edit every line marked",
      "//     EDIT (search for EDIT). \"<id of NAME>\" may stay: it is resolved.",
      "//  2. Plan it — reads only, writes a plan file and the resolved config:",
      "//       .\\Connect-Customer.ps1 -Customer <KEY> -Services Graph",
      "//       .\\tools\\pim\\New-PimBaseline.ps1 -ConfigFile .\\pim.<customer>.jsonc -Customer <KEY> -WriteResolved .\\pim.<customer>.resolved.json",
      "//     It stops while a framework group exists twice: .\\tools\\pim\\Find-PimDuplicates.ps1",
      "//     -Customer <KEY> shows what uses each copy and deletes only the unused ones.",
      "//  3a. With EasyPIM: Invoke-EasyPIMOrchestrator -ConfigFilePath .\\pim.<customer>.resolved.json",
      "//      -TenantId <tenant id> -Mode delta -WhatIf; read it; then again without -WhatIf.",
      "//      NEVER -Mode initial on a live tenant: it removes every assignment the file does not name.",
      "//  3b. Without EasyPIM: run the apply command step 2 printed (… -Apply -PlanFile <the plan>).",
      "//      It applies exactly that plan through Graph — groups, member policies, eligibilities,",
      "//      people; role policies with -Include RolePolicies — and stops if the tenant changed since.",
      "//",
      ...S.notes.map((n) => `// * ${n}`),
      "// ======================================================================",
    ];
    return head.join("\n") + "\n" + out.join("\n") + "\n";
  }
  // JSON with // and /* */ comments → JSON, strings left alone (the same
  // rule EasyPIM and New-PimBaseline.ps1 apply).
  function stripJsonComments(text) {
    let out = "", i = 0, str = false;
    const t = String(text || "");
    while (i < t.length) {
      const c = t[i], n = t[i + 1];
      if (str) { out += c; if (c === "\\") { out += n || ""; i += 2; continue; } if (c === '"') str = false; i++; continue; }
      if (c === '"') { str = true; out += c; i++; continue; }
      if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
      if (c === "/" && n === "*") { i += 2; while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) i++; i += 2; continue; }
      out += c; i++;
    }
    return out;
  }
  const command = (file, customer) => `.\\tools\\pim\\New-PimBaseline.ps1 -ConfigFile .\\${file} -Customer ${customer || "<Customers.json key>"}`;

  // ---- the screen --------------------------------------------------------
  function tiles(res) {
    const c = res.counts, g = res.gcounts;
    const tile = (n, label, cls) => `<div class="xt-tile${cls ? " " + cls : ""}"><b>${esc(n)}</b>${esc(label)}</div>`;
    return `<div class="xt-tiles pmb-tiles">${tile(c.roles, "roles compared")}${tile(c.match, "match")}${tile(c.differs, "differ", c.differs ? "m" : "")}${tile(c.missing + c.unread + c.conflict, c.conflict ? "missing, not read or in conflict" : c.unread ? "missing or not read" : "missing in tenant", c.missing || c.conflict ? "h" : "")}${tile(`${g.present} / ${g.total}`, g.conflict ? `PIM groups present · ${g.conflict} in conflict` : "PIM groups present", g.missing || g.conflict ? "m" : "")}${tile(res.permanentOutside, "permanent active outside the framework", res.permanentOutside ? "h" : "")}</div>`;
  }
  function chips(res, filter) {
    const c = res.counts, g = res.gcounts;
    const f = (key, label, n) => `<button class="fchip${filter === key ? " active" : ""}" data-pmbf="${key}">${esc(label)}${n == null ? "" : ` (${esc(n)})`}</button>`;
    return f("all", "All") + f("differs", "Differs", c.differs) + f("missing", "Missing", c.missing) + (c.conflict + g.conflict ? f("conflict", "Conflict", c.conflict + g.conflict) : "") + f("match", "Match", c.match) + f("groups", "Groups", g.total + g.azure) + f("findings", "Assignments", res.rows.filter((r) => r.findings.length).length) + (res.profile && res.profile.regions ? f("regions", "🗺 Regions", res.regionsCount == null ? undefined : res.regionsCount) : "");
  }
  const pill = (s) => `<span class="xt-pill pmb-${STATUS[s].cls}">${STATUS[s].icon} ${esc(STATUS[s].label)}</span>`;
  // A policy that matches beside an assignment finding is not a plain Match.
  const verdict = (r) => (r.status === "match" && r.findings && r.findings.length ? `<span class="xt-pill pmb-ok">✓ Policy matches</span> <span class="xt-pill pmb-warn">⚠ ${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}</span>` : pill(r.status));
  const humanIf = (k, v) => (/^(activation|maxEligible|maxActive)$/.test(k) ? human(v) : v);
  const diffCell = (diffs) => diffs.length ? `<ul class="pmb-diffs">${diffs.map((d) => `<li><b>${esc(d.label)}</b> ${esc(humanIf(d.key, d.tenant))} <span class="pmb-arrow">→</span> ${esc(humanIf(d.key, d.baseline))}</li>`).join("")}</ul>` : "";
  const SRC = { roles: "roles", policies: "role settings", eligible: "eligible", active: "active", groups: "groups", groupPolicies: "group settings", aus: "units", named: "framework groups" };
  function sourcesLine(res) {
    if (!res.sources) return "";
    const parts = Object.entries(SRC).filter(([k]) => res.sources[k]).map(([k, l]) => { const s = res.sources[k]; return s === "ok" ? `${l} ✓` : `<span class="pmb-warn">${esc(l)} ✗ ${esc(s)}</span>`; });
    return ` · sources: ${parts.join(" · ")}${res.domainChecked ? "" : ` · <span class="pmb-warn">alert domain not checked</span>`}`;
  }
  function render(res, opts = {}) {
    const filter = opts.filter || "all";
    const q = String(opts.q || "").trim().toLowerCase();
    const sel = opts.selected || defaultSelection(res);
    const can = selectable(res);
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const box = (key, label) => `<input type="checkbox" data-pmbfix="${esc(key)}"${sel.has(key) && can.has(key) ? " checked" : ""}${can.has(key) ? "" : " disabled"} aria-label="Take ${esc(label)} into the delta">`;
    const head = `<p class="mini pmb-read">${res.demo ? "Demo data · " : ""}Baseline: <b>${esc(res.catalog.label)} ${esc(res.catalog.release)}</b>${res.catalog.variant ? ` with the customer's variant <b>${esc(res.catalog.variant.name)}</b> (${res.catalog.variant.changes} change${res.catalog.variant.changes === 1 ? "" : "s"}, 🧾 Designer)` : ""}${res.profile ? ` · profile <b>${esc(res.profile.label)}</b>` : ""}, revised ${esc(res.catalog.revised)}, authored in ${esc(res.catalog.tenant)}${res.readAt ? ` · tenant read ${esc(new Date(res.readAt).toLocaleString())}` : ""}${sourcesLine(res)}${res.groupPoliciesError ? ` · <span class="pmb-warn">group settings not read: ${esc(res.groupPoliciesError)}</span>` : ""}</p>`;
    let rows = res.rows.filter((r) => hit(r.name + " " + r.template + " " + r.via.join(" ")));
    if (filter === "differs") rows = rows.filter((r) => r.status === "differs");
    else if (filter === "missing") rows = rows.filter((r) => r.status === "missing" || r.status === "unread");
    else if (filter === "conflict") rows = rows.filter((r) => r.status === "conflict");
    else if (filter === "match") rows = rows.filter((r) => r.status === "match");
    else if (filter === "findings") rows = rows.filter((r) => r.findings.length);
    rows = rows.slice().sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.name.localeCompare(b.name));
    const roleTable = filter === "groups" ? "" : `<div class="list-card xt-card"><h3>Roles <span class="mini">${rows.length} of ${res.rows.length} · the setting the tenant has → what the framework says</span></h3><div class="xt-tw"><table class="xt-tbl pmb-tbl">
      <thead><tr><th></th><th>Role</th><th>Tier</th><th>Eligible</th><th>Active</th><th>Permanent</th><th>Verdict</th><th>Differences · findings</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="pmb-row pmb-${r.status}"><td>${box(`role:${r.name}`, r.name)}</td><td><b>${esc(r.name)}</b>${r.via.length ? `<div class="mini pmb-via">via ${esc(r.via.join(", "))}</div>` : ""}${r.note ? `<div class="mini pmb-note">${esc(r.note)}</div>` : ""}</td><td><span class="pmb-tier pmb-tier-${esc(r.tier)}">${esc(r.tier)}</span></td><td>${r.eligible}</td><td>${r.active}</td><td>${r.permanent ? `<span class="xt-pill ${r.findings.some((f) => /permanent active outside/.test(f)) ? "pmb-bad" : "pmb-na"}">${r.permanent}${r.protectedPermanent ? ` <span class="mini">(${r.protectedPermanent} break-glass)</span>` : ""}</span>` : "—"}</td><td>${verdict(r)}</td><td>${diffCell(r.diffs)}${r.findings.length ? `<ul class="pmb-diffs pmb-findings">${r.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${r.status === "missing" ? `<div class="mini">No role with this name in the tenant. Built-in roles always exist; check the spelling in the catalog.</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="mini" style="padding:14px">Nothing under this filter.</td></tr>`}</tbody></table></div></div>`;
    const groups = res.groups.filter((g) => hit(g.name + " " + g.persona));
    const showGroup = (g) => filter === "all" || filter === "groups" || (filter === "missing" ? !g.present || g.status === "unread" : filter === "conflict" ? g.status === "conflict" : filter === "differs" ? g.status === "differs" : false);
    const groupTable = (filter !== "all" && filter !== "groups" && filter !== "missing" && filter !== "differs" && filter !== "conflict") ? "" : `<div class="list-card xt-card"><h3>PIM groups <span class="mini">the model, never the members · exact names, matched by id</span></h3><div class="xt-tw"><table class="xt-tbl pmb-tbl">
      <thead><tr><th></th><th>Group</th><th>Persona</th><th>Membership</th><th>In tenant</th><th>Role-assignable</th><th>Carries</th><th>Verdict</th><th>Differences</th></tr></thead>
      <tbody>${groups.filter(showGroup).map((g) => `<tr class="pmb-row pmb-${g.status}"><td>${box(`group:${g.name}`, g.name)}</td><td><b>${esc(g.name)}</b>${g.description ? `<div class="mini pmb-note">${esc(g.description)}</div>` : ""}</td><td>${esc(g.persona)}${g.azure ? `<div class="mini">${esc(g.azure.role)} · ${esc(g.azure.scope)}</div>` : ""}${g.xdr ? `<div class="mini">${esc(g.xdr.role)} · scope ${esc(g.xdr.scope)}</div>` : ""}</td><td><span class="pmb-tier">${g.path === "job" ? "eligible · job" : g.path === "direct" ? "active · per role" : /^GroupJIT/.test(g.template) ? "eligible · JIT" : "active · 1 year"}</span></td><td>${g.present ? (g.ids.length > 1 ? `<span class="pmb-bad-txt">${g.ids.length}×</span>` : "✓") : "<span class=\"pmb-bad-txt\">no</span>"}</td><td>${g.present ? (g.roleAssignable ? "✓" : "<span class=\"pmb-bad-txt\">no</span>") : "—"}</td><td>${g.scope === "azure" ? `<span class="mini">Azure RBAC · not compared</span>` : g.scope === "intune" ? `<span class="mini">Intune role through T53</span>` : g.scope === "xdr" ? `<span class="mini">Defender XDR · assigned in the portal</span>` : g.scope === "exchange" ? `<span class="mini">Exchange role group ${esc((g.exchange && g.exchange.roleGroup) || "")} · made in Exchange</span>` : `${g.path === "job" ? "active " : g.path === "direct" ? "eligible " : ""}${g.has.filter((r) => g.carries.includes(r)).length} / ${g.carries.length}${g.wrongShape && g.wrongShape.length ? `<div class="mini pmb-bad-txt">${g.path === "job" ? "still eligible (2.x) — should be active" : "held active — should be eligible"}: ${esc(g.wrongShape.join(", "))}</div>` : ""}${g.missingRoles.length ? `<div class="mini pmb-bad-txt">missing: ${esc(g.missingRoles.join(", "))}</div>` : ""}${g.scopedOnly.length ? `<div class="mini">only at an AU: ${esc(g.scopedOnly.join(", "))}</div>` : ""}`}${g.extraRoles.length ? `<div class="mini pmb-bad-txt">also holds: ${esc(g.extraRoles.join(", "))}</div>` : ""}</td><td>${pill(g.status)}</td><td>${g.conflict ? `<div class="mini pmb-bad-txt">${esc(g.conflict)}</div>` : ""}${g.present && g.roleAssignable === false ? `<div class="mini pmb-bad-txt">not role-assignable: a group made without isAssignableToRole cannot be made one later — recreate it</div>` : ""}${diffCell(g.diffs)}${g.present && g.settings === "unread" && !g.conflict && g.scope !== "azure" ? `<div class="mini">membership settings (PIM for Groups) not read</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="mini" style="padding:14px">Nothing under this filter.</td></tr>`}</tbody></table></div>${res.extraGroups.length ? `<p class="mini pmb-extra">Role-assignable groups in the tenant that are not in the framework: ${esc(res.extraGroups.join(", "))}. Not a difference — a tenant's own groups are its own — but every one of them can hold a role, so 👥 CA groups and 🛡 Administrative units should know them.</p>` : ""}${res.regionalGroups && res.regionalGroups.length ? `<p class="mini pmb-extra">Regional groups in the tenant: ${esc(res.regionalGroups.join(", "))} — compared under 🗺 Regions against the regions file.</p>` : ""}</div>`;
    return head + roleTable + groupTable;
  }

  function toMd(res, tenantName) {
    const L = [];
    L.push(`# 🧬 PIM baseline — ${tenantName || "tenant"} against ${res.catalog.label} ${res.catalog.release}`);
    L.push(`Catalog revised ${res.catalog.revised}, authored in ${res.catalog.tenant}.${res.profile ? ` Profile: ${res.profile.label}.` : ""} ${res.demo ? "Demo data. " : ""}${res.readAt ? `Tenant read ${new Date(res.readAt).toISOString()}.` : ""}${res.sources ? ` Sources: ${Object.entries(res.sources).map(([k, v]) => `${k} ${v}`).join(", ")}.` : ""}${res.domainChecked ? "" : " Alert recipients compared without the domain."}`);
    L.push("");
    L.push(`Roles: ${res.counts.roles} compared · ${res.counts.match} match · ${res.counts.differs} differ · ${res.counts.missing} missing · ${res.counts.unread} not read · ${res.counts.conflict} conflict. PIM groups: ${res.gcounts.present} of ${res.gcounts.total} present (${res.gcounts.missing} missing, ${res.gcounts.differs} differ, ${res.gcounts.unread} settings not read, ${res.gcounts.conflict} conflict). Permanent active outside the framework: ${res.permanentOutside}.`);
    L.push("");
    L.push("| Role | Tier | Eligible | Active | Permanent | Verdict | Differences (tenant → framework) · findings |");
    L.push("|---|---|---|---|---|---|---|");
    res.rows.slice().sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.name.localeCompare(b.name)).forEach((r) => {
      L.push(`| ${r.name} | ${r.tier} | ${r.eligible} | ${r.active} | ${r.permanent} | ${r.status === "match" && r.findings.length ? "Policy matches · finding" : STATUS[r.status].label} | ${[...r.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`), ...r.findings].join("; ") || "—"} |`);
    });
    L.push("");
    L.push("| Group | Persona | Membership | In tenant | Role-assignable | Carries | Verdict |");
    L.push("|---|---|---|---|---|---|---|");
    res.groups.forEach((g) => L.push(`| ${g.name} | ${g.persona} | ${g.path === "job" ? "eligible · job" : g.path === "direct" ? "active · per role" : /^GroupJIT/.test(g.template) ? "eligible · JIT" : "active · 1 year"} | ${g.present ? (g.ids.length > 1 ? `${g.ids.length}×` : "yes") : "no"} | ${g.present ? (g.roleAssignable ? "yes" : "no") : "—"} | ${g.scope === "azure" ? "Azure RBAC, not compared" : g.scope === "intune" ? "Intune (T53)" : g.scope === "xdr" ? "Defender XDR, assigned in the portal" : g.scope === "exchange" ? `Exchange role group ${(g.exchange && g.exchange.roleGroup) || ""}, made in Exchange` : `${g.path === "job" ? "active " : g.path === "direct" ? "eligible " : ""}${g.has.filter((r) => g.carries.includes(r)).length}/${g.carries.length}${g.missingRoles.length ? ` (missing ${g.missingRoles.join(", ")})` : ""}${g.wrongShape && g.wrongShape.length ? ` (${g.path === "job" ? "still eligible" : "held active"}: ${g.wrongShape.join(", ")})` : ""}`}${g.extraRoles.length ? ` (also holds ${g.extraRoles.join(", ")})` : ""} | ${STATUS[g.status].label}${g.conflict ? ` — ${g.conflict}` : ""}${g.diffs.length ? ` — ${g.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`).join("; ")}` : ""} |`));
    if (res.extraGroups.length) { L.push(""); L.push(`Role-assignable groups not in the framework: ${res.extraGroups.join(", ")}.`); }
    return L.join("\n");
  }

  return { KEYS, LABEL, STATUS, ABSENT, SCHEMA, SAMPLE, allGroups, canonRoles, toSample, stripJsonComments, human, expected, fromTemplate, fromRules, diff, compare, defaultSelection, selectable, toOrchestrator, command, tiles, chips, render, toMd, profile, profileIds, groupPath, isJob, everyProfile, parseCsv, parseRegions, region, compareRegions, renderRegions, regionsMd, toRegionsFile, regionsCommand };
})();
