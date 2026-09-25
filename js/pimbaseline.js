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
//   profile(cat, id)         the catalog a profile derives (32413): the
//                            groups it keeps, the roles folded into them,
//                            the template settings that change with size
//   parseRegions(text, cat)  a customer's regions.csv (or JSON) → rows,
//                            defaults filled, errors named
//   region(cat, row)         one row → the objects the template says
//   compareRegions(cat, rows, tenant)
//                            per region: units, groups, scoped eligibilities
//                            against the tenant; the central RMAU
//   renderRegions / regionsMd / toRegionsFile
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
    // A tenant's regional persona groups (PIM-SG-<REG>-Helpdesk / -Ops) are
    // the region template's, compared by T48 → Regions, never "extra".
    const regional = new RegExp("^PIM-SG-" + String((cat.regions && cat.regions.codePattern) || "^$").replace(/^\^|\$$/g, "").replace(/\((?!\?)/g, "(?:") + "-(Helpdesk|Ops|Approvers)$");
    const extraGroups = (tenant.groups || []).filter((g) => g.isAssignableToRole !== false && !cat.groups.some((c) => c.name === g.displayName) && !regional.test(g.displayName)).map((g) => g.displayName).sort();
    const regionalGroups = (tenant.groups || []).filter((g) => regional.test(g.displayName)).map((g) => g.displayName).sort();
    const counts = { roles: rows.length, match: 0, differs: 0, missing: 0, unread: 0 };
    rows.forEach((r) => { counts[r.status]++; });
    const g365 = groups.filter((g) => g.scope === "m365");
    const gcounts = { total: g365.length, present: g365.filter((g) => g.present).length, missing: g365.filter((g) => !g.present).length, differs: g365.filter((g) => g.present && g.status === "differs").length, azure: groups.length - g365.length, azurePresent: groups.filter((g) => g.scope !== "m365" && g.present).length, extra: extraGroups.length };
    const permanentOutside = rows.reduce((n, r) => n + r.permanentOutside, 0);
    return { catalog: { id: cat.id, label: cat.label, release: cat.release, revised: cat.revised, tenant: cat.tenant }, profile: cat.profile || null, rows, groups, extraGroups, regionalGroups, counts, gcounts, permanentOutside, groupPoliciesError: tenant.groupPoliciesError || null, readAt: tenant.readAt || null, demo: !!tenant.demo };
  }

  // ---- profiles ----------------------------------------------------------
  // A profile is the same catalog at a size: the groups it keeps, the roles
  // of the groups it does not keep folded into the ones it does (`merge`),
  // template settings that change with size, and a note per role. The
  // result has the catalog's own shape, so compare() and toOrchestrator()
  // take it as they take the base.
  function profile(cat, id) {
    const p = cat.profiles && cat.profiles[id];
    if (!p) return Object.assign({}, cat, { profile: null });
    const templates = {};
    for (const [k, t] of Object.entries(cat.templates)) templates[k] = Object.assign({}, t, (p.templates || {})[k] || {});
    const merge = p.merge || {};
    const roles = cat.roles.map((r) => {
      const o = (p.roles || {})[r.name] || {};
      const via = sortStr((r.via || []).map((g) => merge[g] || g));
      return Object.assign({}, r, { via, override: Object.assign({}, r.override || {}, o.override || {}), note: o.note || r.note });
    });
    const pool = [...cat.groups, ...(cat.groupsSmall || [])];
    const groups = p.groups ? p.groups.map((n) => pool.find((g) => g.name === n)).filter(Boolean) : cat.groups.slice();
    return Object.assign({}, cat, { templates, roles, groups, profile: { id, label: p.label, size: p.size, description: p.description, regions: !!p.regions, rmau: p.rmau || [], intune: p.intune || null } });
  }
  const profileIds = (cat) => Object.keys(cat.profiles || {});

  // ---- regions -----------------------------------------------------------
  // CSV with quoted fields, or a JSON array of objects with the same keys.
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    const t = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === ";" && !t.includes(",")) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }
  function parseRegions(text, cat) {
    const R = cat.regions || {}, cols = R.columns || [], errors = [], rows = [];
    let objs = [];
    const trimmed = String(text || "").trim();
    if (!trimmed) return { rows, errors: ["The file is empty."] };
    if (trimmed[0] === "[" || trimmed[0] === "{") {
      try { const j = JSON.parse(trimmed); objs = Array.isArray(j) ? j : (j.regions || []); } catch (e) { return { rows, errors: [`Not valid JSON: ${e.message}`] }; }
    } else {
      const table = parseCsv(trimmed);
      if (!table.length) return { rows, errors: ["No rows."] };
      const head = table[0].map((h) => String(h).trim());
      const known = head.filter((h) => cols.includes(h));
      if (!known.includes("code")) return { rows, errors: [`The first line must be the header: ${cols.join(",")}`] };
      head.forEach((h) => { if (h && !cols.includes(h)) errors.push(`Column "${h}" is not one the template reads (ignored).`); });
      objs = table.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] == null ? "" : r[i]).trim()])));
    }
    const codeRe = new RegExp(R.codePattern || "^[A-Z0-9-]+$");
    const seen = new Set();
    objs.forEach((o, i) => {
      const code = String(o.code || "").trim().toUpperCase();
      const line = i + 2;
      if (!code) { errors.push(`Row ${line}: no code.`); return; }
      if (!codeRe.test(code)) { errors.push(`Row ${line}: code "${code}" does not follow ${R.codePattern} (continent-country, e.g. EU-NL).`); return; }
      if (seen.has(code)) { errors.push(`Row ${line}: code ${code} twice.`); return; }
      seen.add(code);
      const last = code.split("-").pop();
      const row = {
        code, name: String(o.name || "").trim() || code,
        attribute: String(o.attribute || "").trim() || "extensionAttribute1",
        value: String(o.value || "").trim() || code,
        devicePrefix: String(o.devicePrefix || "").trim() || `${last}-`,
        autopilotTag: String(o.autopilotTag || "").trim() || code,
        itLead: String(o.itLead || "").trim(),
        approvers: String(Array.isArray(o.approvers) ? o.approvers.join(";") : o.approvers || "").split(/[;|]/).map((x) => x.trim()).filter(Boolean),
        timezone: String(o.timezone || "").trim(),
      };
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(row.attribute)) errors.push(`Row ${line}: attribute "${row.attribute}" is not a property name.`);
      if (!row.name || row.name === code) errors.push(`Row ${line}: ${code} has no name (the code is used).`);
      rows.push(row);
    });
    return { rows, errors };
  }
  // One row through the template: every <REG>, <attribute>, … replaced.
  function fill(v, row) {
    if (typeof v === "string") return v.replace(/<(REG|attribute|value|devicePrefix|autopilotTag|itLead|approvers|name|timezone)>/g, (m, k) => (k === "REG" ? row.code : k === "approvers" ? row.approvers.join("; ") : String(row[k] ?? "")));
    if (Array.isArray(v)) return v.map((x) => fill(x, row));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, row)]));
    return v;
  }
  function region(cat, row) {
    const T = (cat.regions && cat.regions.template) || {};
    return Object.assign({ code: row.code, name: row.name, row }, fill({ aus: T.aus || [], groups: T.groups || [], eligibilities: T.eligibilities || [], intune: T.intune || {}, review: T.review || null }, row));
  }
  // A membership rule compared without its whitespace and quote style.
  const ruleKey = (r) => String(r || "").replace(/\s+/g, " ").replace(/[\u2018\u2019\u201c\u201d]/g, '"').trim().toLowerCase();
  const RSTATUS = { match: "match", differs: "differs", missing: "missing", unread: "unread" };
  // tenant adds: aus:[{id, displayName, membershipType, membershipRule, isMemberManagementRestricted}],
  //   named:[{id, displayName, isAssignableToRole, membershipRule}] (PIM-SG-* and INT-SG-* groups, role-assignable or not),
  //   eligible[].directoryScopeId ("/" or "/administrativeUnits/<id>")
  function compareRegions(cat, rows, tenant) {
    const aus = new Map((tenant.aus || []).map((a) => [String(a.displayName), a]));
    const named = new Map([...(tenant.groups || []), ...(tenant.named || [])].map((g) => [String(g.displayName), g]));
    const auRead = Array.isArray(tenant.aus);
    const regions = rows.map((row) => {
      const r = region(cat, row);
      const items = [];
      const auIds = {};
      r.aus.forEach((a) => {
        const t = aus.get(a.name);
        let status = !auRead ? "unread" : t ? "match" : "missing", detail = "";
        if (t) {
          auIds[a.name] = t.id;
          const dyn = t.membershipType === "Dynamic";
          if (a.kind === "dynamic" && !dyn) { status = "differs"; detail = "assigned in the tenant; the template says dynamic"; }
          else if (a.kind === "dynamic" && ruleKey(t.membershipRule) !== ruleKey(a.rule)) { status = "differs"; detail = `rule: ${t.membershipRule || "(none)"}`; }
          else if (a.kind === "assigned" && dyn) { status = "differs"; detail = "dynamic in the tenant; the template says assigned (dynamic units cannot hold groups)"; }
        }
        items.push({ kind: "au", name: a.name, expect: a.kind === "dynamic" ? `dynamic · ${a.rule}` : "assigned", status, detail, note: a.note || "" });
      });
      r.groups.forEach((g) => {
        const t = named.get(g.name);
        let status = t ? "match" : "missing", detail = "";
        if (t && g.roleAssignable && t.isAssignableToRole === false) { status = "differs"; detail = "not role-assignable — recreate it; the flag cannot be set later"; }
        if (t && !g.roleAssignable && t.isAssignableToRole === true) { status = "differs"; detail = "role-assignable; the approver group is a plain group"; }
        items.push({ kind: "group", name: g.name, expect: g.roleAssignable ? `role-assignable · ${g.template}` : `plain · members ${g.members || ""}`, status, detail, note: g.description || "" });
      });
      r.eligibilities.forEach((e) => {
        const auId = auIds[e.au];
        const hit = (tenant.eligible || []).some((a) => a.roleName === e.role && a.principalType === "Group" && a.principalName === e.group && (auId ? a.directoryScopeId === `/administrativeUnits/${auId}` : false));
        const tenantWide = (tenant.eligible || []).some((a) => a.roleName === e.role && a.principalType === "Group" && a.principalName === e.group && (!a.directoryScopeId || a.directoryScopeId === "/"));
        items.push({ kind: "eligibility", name: `${e.role} → ${e.group}`, expect: `eligible at ${e.au}`, status: !auRead ? "unread" : hit ? "match" : "missing", detail: !hit && tenantWide ? "held at TENANT scope — wider than the region; re-scope it" : (!hit && !auId && auRead ? "the unit is missing, so the scoped eligibility cannot exist yet" : "") });
      });
      (r.intune.groups || []).forEach((g) => {
        const t = named.get(g.name);
        let status = t ? "match" : "missing", detail = "";
        if (t && ruleKey(t.membershipRule) !== ruleKey(g.rule)) { status = "differs"; detail = `rule: ${t.membershipRule || "(none)"}`; }
        items.push({ kind: "intune-group", name: g.name, expect: `dynamic ${g.type} · ${g.rule}`, status, detail });
      });
      if (r.intune.tag) items.push({ kind: "intune", name: r.intune.tag.name, expect: `scope tag, auto-assigned from ${r.intune.tag.autoAssignFrom}`, status: "unread", detail: "Intune RBAC is read by T53 (planned); the script creates it" });
      (r.intune.assignments || []).forEach((a) => items.push({ kind: "intune", name: a.name, expect: `${a.roles.join(" + ")} · members ${a.members.join(", ")} · scope ${a.scopeGroups.join(", ")} · tag ${a.tags.join(", ")}`, status: "unread", detail: "T53" }));
      const counts = { match: 0, differs: 0, missing: 0, unread: 0 };
      items.forEach((i) => { counts[i.status]++; });
      const compared = items.length - counts.unread;
      const status = counts.missing ? "missing" : counts.differs ? "differs" : compared ? "match" : "unread";
      return { code: r.code, name: r.name, row, items, counts, compared, status, review: r.review, autopilot: r.intune.autopilot || null };
    });
    // The centre: the restricted management unit(s) the profile expects.
    const central = ((cat.profile && cat.profile.rmau) || []).map((u) => {
      const t = aus.get(u.name);
      const status = !auRead ? "unread" : !t ? "missing" : (u.restricted && !t.isMemberManagementRestricted) ? "differs" : "match";
      return { kind: "rmau", name: u.name, expect: `restricted management unit · ${u.holds}`, status, detail: status === "differs" ? "exists but is not restricted — an RMAU can only be made so at creation; recreate it" : "" };
    });
    const totals = { regions: regions.length, match: 0, differs: 0, missing: 0, unread: 0 };
    regions.forEach((r) => { for (const k of Object.keys(r.counts)) totals[k] += r.counts[k]; });
    central.forEach((c) => { totals[c.status]++; });
    const missingCodes = regions.filter((r) => r.status !== "match").map((r) => r.code);
    return { regions, central, totals, missingCodes, auRead, readAt: tenant.readAt || null, demo: !!tenant.demo, profile: cat.profile || null };
  }
  const RPILL = { match: ["ok", "✓ Match"], differs: ["warn", "≠ Differs"], missing: ["bad", "∅ Missing"], unread: ["na", "? Not read"] };
  const rpill = (s) => `<span class="xt-pill pmb-${RPILL[s][0]}">${esc(RPILL[s][1])}</span>`;
  function renderRegions(res, opts = {}) {
    const q = String(opts.q || "").trim().toLowerCase();
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const t = res.totals;
    const head = `<div class="xt-tiles pmb-tiles"><div class="xt-tile"><b>${t.regions}</b>region${t.regions === 1 ? "" : "s"} in the file</div><div class="xt-tile"><b>${t.match}</b>match</div><div class="xt-tile${t.differs ? " m" : ""}"><b>${t.differs}</b>differ</div><div class="xt-tile${t.missing ? " h" : ""}"><b>${t.missing}</b>missing</div><div class="xt-tile"><b>${t.unread}</b>not read (Intune · T53)</div></div>`;
    const item = (i) => `<tr class="pmb-row pmb-${i.status}"><td><span class="pmb-kind">${esc({ au: "unit", group: "group", eligibility: "eligible", "intune-group": "Intune group", intune: "Intune", rmau: "RMAU" }[i.kind] || i.kind)}</span></td><td><b>${esc(i.name)}</b>${i.note ? `<div class="mini pmb-note">${esc(i.note)}</div>` : ""}</td><td class="mini">${esc(i.expect)}</td><td>${rpill(i.status)}${i.detail ? `<div class="mini pmb-bad-txt">${esc(i.detail)}</div>` : ""}</td></tr>`;
    const central = res.central.length ? `<div class="list-card xt-card"><h3>Central <span class="mini">what the profile expects beside the regions</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Object</th><th>Expected</th><th>Verdict</th></tr></thead><tbody>${res.central.map(item).join("")}</tbody></table></div></div>` : "";
    const cards = res.regions.filter((r) => hit(r.code + " " + r.name + " " + r.items.map((i) => i.name).join(" "))).map((r) => `<div class="list-card xt-card pmb-region"><h3><input type="checkbox" data-pmbreg="${esc(r.code)}"${r.status === "match" ? " disabled" : " checked"} aria-label="Take ${esc(r.code)} into the regions file"> ${esc(r.code)} · ${esc(r.name)} ${rpill(r.status)} <span class="mini">${r.counts.match} of ${r.compared} match · ${r.counts.missing} missing · ${r.counts.differs} differ${r.counts.unread ? ` · ${r.counts.unread} not read` : ""}</span></h3>
      <p class="mini pmb-rowline">${esc(r.row.attribute)} = "${esc(r.row.value)}" · devices ${esc(r.row.devicePrefix)}%SERIAL% · Autopilot tag ${esc(r.row.autopilotTag)}${r.row.itLead ? ` · IT lead ${esc(r.row.itLead)}` : ""}${r.row.approvers.length ? ` · approvers ${esc(r.row.approvers.join(", "))}` : ""}${r.row.timezone ? ` · ${esc(r.row.timezone)}` : ""}${r.review ? ` · ${esc(r.review.cadence)} review by ${esc(r.review.reviewer || "the IT lead")}` : ""}</p>
      <div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Object</th><th>Expected</th><th>Verdict</th></tr></thead><tbody>${r.items.map(item).join("")}</tbody></table></div></div>`).join("");
    return head + central + (cards || `<p class="mini" style="padding:14px">No region matches the search.</p>`);
  }
  function regionsMd(res, tenantName) {
    const L = [`# 🗺 Regions — ${tenantName || "tenant"}`, `${res.demo ? "Demo data. " : ""}${res.totals.regions} regions from the file · ${res.totals.match} match · ${res.totals.differs} differ · ${res.totals.missing} missing · ${res.totals.unread} not read.`, ""];
    const line = (i) => `| ${i.kind} | ${i.name} | ${i.expect} | ${RPILL[i.status][1]}${i.detail ? ` — ${i.detail}` : ""} |`;
    if (res.central.length) { L.push("## Central", "", "| Kind | Object | Expected | Verdict |", "|---|---|---|---|", ...res.central.map(line), ""); }
    res.regions.forEach((r) => { L.push(`## ${r.code} · ${r.name} — ${RPILL[r.status][1]}`, "", "| Kind | Object | Expected | Verdict |", "|---|---|---|---|", ...r.items.map(line), ""); });
    return L.join("\n");
  }
  // The file New-PimRegions.ps1 eats: the rows (only the ticked regions when
  // asked), the template and the Intune role, the profile — never ids.
  function toRegionsFile(cat, rows, opts = {}) {
    const only = opts.codes ? new Set(opts.codes) : null;
    return {
      _comment: `${cat.label} ${cat.release} — regions for ${opts.domain || "<tenant domain>"}, profile ${(cat.profile && cat.profile.label) || "multi-region"}. Generated by ENCA T48 → Regions. Run tools/pim/New-PimRegions.ps1 -RegionsFile <this file> -TenantId <domain> (WhatIf by default; -Apply to create).`,
      profile: (cat.profile && cat.profile.id) || "multi",
      regions: rows.filter((r) => !only || only.has(r.code)),
      template: (cat.regions && cat.regions.template) || {},
      central: { rmau: (cat.profile && cat.profile.rmau) || [] },
      groupTemplates: Object.fromEntries(["GroupTier2"].map((k) => [k, cat.templates[k]])),
      intuneRoles: cat.intuneRoles || [],
      protected: cat.protected || null,
    };
  }
  const regionsCommand = (file, domain) => `.\\tools\\pim\\New-PimRegions.ps1 -RegionsFile .\\${file} -TenantId ${domain || "<tenant domain or id>"}`;

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
    // The baseline tenant carries every profile's groups (opts.everyProfile),
    // so each profile has a real reference in cloudfellows.dev.
    const pool = opts.everyProfile ? [...cat.groups, ...(cat.groupsSmall || []).filter((g) => !cat.groups.some((c) => c.name === g.name))] : cat.groups;
    const groups = pool.filter((g) => !onlyGroups || onlyGroups.has(g.name));
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
    return f("all", "All") + f("differs", "Differs", c.differs) + f("missing", "Missing", c.missing) + f("match", "Match", c.match) + f("groups", "Groups", g.total) + f("findings", "Assignments", res.rows.filter((r) => r.findings.length).length) + (res.profile && res.profile.regions ? f("regions", "🗺 Regions", res.regionsCount == null ? undefined : res.regionsCount) : "");
  }
  const pill = (s) => `<span class="xt-pill pmb-${STATUS[s].cls}">${STATUS[s].icon} ${esc(STATUS[s].label)}</span>`;
  const diffCell = (diffs) => diffs.length ? `<ul class="pmb-diffs">${diffs.map((d) => `<li><b>${esc(d.label)}</b> ${esc(d.tenant)} <span class="pmb-arrow">→</span> ${esc(d.baseline)}</li>`).join("")}</ul>` : "";
  function render(res, opts = {}) {
    const filter = opts.filter || "all";
    const q = String(opts.q || "").trim().toLowerCase();
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const head = `<p class="mini pmb-read">${res.demo ? "Demo data · " : ""}Baseline: <b>${esc(res.catalog.label)} ${esc(res.catalog.release)}</b>${res.profile ? ` · profile <b>${esc(res.profile.label)}</b>` : ""}, revised ${esc(res.catalog.revised)}, authored in ${esc(res.catalog.tenant)}${res.readAt ? ` · tenant read ${esc(new Date(res.readAt).toLocaleString())}` : ""}${res.groupPoliciesError ? ` · <span class="pmb-warn">group settings not read: ${esc(res.groupPoliciesError)}</span>` : ""}</p>`;
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
      <tbody>${groups.filter((g) => filter === "all" || filter === "groups" || (filter === "missing" ? !g.present : g.status === "differs")).map((g) => `<tr class="pmb-row pmb-${g.status}"><td><input type="checkbox" data-pmbfix="group:${esc(g.name)}"${g.status === "match" ? " disabled" : (g.scope === "azure" ? "" : " checked")} aria-label="Take ${esc(g.name)} into the delta"></td><td><b>${esc(g.name)}</b>${g.description ? `<div class="mini pmb-note">${esc(g.description)}</div>` : ""}</td><td>${esc(g.persona)}${g.azure ? `<div class="mini">${esc(g.azure.role)} · ${esc(g.azure.scope)}</div>` : ""}</td><td><span class="pmb-tier pmb-tier-${esc(g.template.replace(/^Group/, ""))}">${esc(g.template.replace(/^Group/, ""))}</span></td><td>${g.present ? "✓" : "<span class=\"pmb-bad-txt\">no</span>"}</td><td>${g.present ? (g.roleAssignable ? "✓" : "<span class=\"pmb-bad-txt\">no</span>") : "—"}</td><td>${g.scope === "azure" ? `<span class="mini">Azure RBAC · not compared</span>` : `${g.has.length} / ${g.carries.length}${g.missingRoles.length ? `<div class="mini pmb-bad-txt">missing: ${esc(g.missingRoles.join(", "))}</div>` : ""}${g.extraRoles.length ? `<div class="mini">also: ${esc(g.extraRoles.join(", "))}</div>` : ""}`}</td><td>${pill(g.present ? g.status : "missing")}</td><td>${g.present && !g.roleAssignable ? `<div class="mini pmb-bad-txt">not role-assignable: a group made without isAssignableToRole cannot be made one later — recreate it</div>` : ""}${diffCell(g.diffs)}${g.present && g.settings === "unread" && g.scope === "m365" ? `<div class="mini">activation settings not read</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="mini" style="padding:14px">Nothing under this filter.</td></tr>`}</tbody></table></div>${res.extraGroups.length ? `<p class="mini pmb-extra">Role-assignable groups in the tenant that are not in the framework: ${esc(res.extraGroups.join(", "))}. Not a difference — a tenant's own groups are its own — but every one of them can hold a role, so 👥 CA groups and 🛡 Restricted AUs should know them.</p>` : ""}${res.regionalGroups && res.regionalGroups.length ? `<p class="mini pmb-extra">Regional persona groups in the tenant: ${esc(res.regionalGroups.join(", "))} — compared under 🗺 Regions against the regions file.</p>` : ""}</div>`;
    return head + roleTable + groupTable;
  }

  function toMd(res, tenantName) {
    const L = [];
    L.push(`# 🧬 PIM baseline — ${tenantName || "tenant"} against ${res.catalog.label} ${res.catalog.release}`);
    L.push(`Catalog revised ${res.catalog.revised}, authored in ${res.catalog.tenant}.${res.profile ? ` Profile: ${res.profile.label}.` : ""} ${res.demo ? "Demo data. " : ""}${res.readAt ? `Tenant read ${new Date(res.readAt).toISOString()}.` : ""}`);
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

  return { KEYS, LABEL, STATUS, expected, fromTemplate, fromRules, diff, compare, toOrchestrator, command, tiles, chips, render, toMd, profile, profileIds, parseCsv, parseRegions, region, compareRegions, renderRegions, regionsMd, toRegionsFile, regionsCommand };
})();
