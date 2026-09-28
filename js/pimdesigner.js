// ======================================================================
// 🧾 Designer — a customer's variant of the framework (T50, beta 32426,
// R73). Pure: no DOM, no storage.
//
// The CloudFellows PIM framework is the baseline; a customer sometimes needs
// it a little different — four hours instead of two for Tier 1, their own
// alert mailbox, their approver group, Exchange Administrator one tier up.
// A VARIANT holds exactly those differences, nothing else: templates are
// edited as tiers (never role by role), a role can move to another tier, the
// mailbox, the authentication context and the approver groups can be named.
// Applied, it is a catalog like the bundled one, so 🧬 T48 compares against
// it and 🚀 T51 imports it — the same code, the customer's numbers.
//
// A variant is a small JSON file (schema cloudfellows-pim-variant/1) the
// browser keeps per tenant and the person can download, hand around and load
// into another tenant. It never carries people, ids or secrets.
//
//   blank(cat, profileId)      an empty variant for the profile
//   validate(v, cat)           { errors, warnings } — errors stop it being used
//   apply(cat, v)              the catalog with the variant in it (a copy)
//   diff(cat, v)               what the variant changes, in words
// ======================================================================
const PimDesigner = (() => {
  const SCHEMA = "cloudfellows-pim-variant/1";
  // What a tier may change, and to what. The lists are the values Entra
  // offers; free text would let a typo through to a PATCH.
  const FIELDS = {
    ActivationDuration: { label: "Activation", values: ["PT1H", "PT2H", "PT4H", "PT8H", "PT12H", "PT24H"] },
    ActivationRequirement: { label: "On activation", parts: ["MultiFactorAuthentication", "Justification", "Ticketing"] },
    AuthenticationContext_Enabled: { label: "Authentication context", bool: true },
    ApprovalRequired: { label: "Approval", bool: true },
    Approvers: { label: "Approver group", group: true },
    AllowPermanentEligibility: { label: "Permanent eligibility", bool: true },
    MaximumEligibilityDuration: { label: "Max eligibility", values: ["P30D", "P90D", "P180D", "P365D"] },
    AllowPermanentActiveAssignment: { label: "Permanent active", bool: true },
    MaximumActiveAssignmentDuration: { label: "Max active", values: ["P1D", "P7D", "P15D", "P30D", "P90D", "P180D", "P365D"] },
    Notification_Activation_Alert: { label: "Alert on activation", level: true },
    Notification_EligibleAssignment_Alert: { label: "Alert on eligible assignment", level: true },
    Notification_ActiveAssignment_Alert: { label: "Alert on active assignment", level: true },
  };
  const ROLE_TIERS = ["Tier0", "Tier1", "Tier2", "Reader"];
  const GROUP_NAME = /^PIM-SG-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;
  const MAILBOX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?$/;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function blank(cat, profileId) {
    return { schema: SCHEMA, name: "", profile: profileId || null, base: { catalog: cat.label, release: cat.release, revised: cat.revised }, templates: {}, roles: {}, mailbox: null, authContext: null, approvers: {}, notes: "", updatedAt: null };
  }
  const isEmpty = (v) => !v || (!Object.keys(v.templates || {}).length && !Object.keys(v.roles || {}).length && !v.mailbox && !v.authContext && !Object.keys(v.approvers || {}).length);

  function validate(v, cat) {
    const errors = [], warnings = [];
    if (!v || typeof v !== "object") return { errors: ["not a variant"], warnings };
    if (v.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
    for (const [t, o] of Object.entries(v.templates || {})) {
      if (!cat.templates[t]) { errors.push(`tier ${t} is not in the framework`); continue; }
      for (const [k, val] of Object.entries(o || {})) {
        const F = FIELDS[k];
        if (!F) { errors.push(`${t}: ${k} is not something a variant can change`); continue; }
        if (F.values && !F.values.includes(val)) errors.push(`${t}: ${F.label} ${val} is not one of ${F.values.join(", ")}`);
        if (F.bool && typeof val !== "boolean") errors.push(`${t}: ${F.label} must be true or false`);
        if (F.parts && (typeof val !== "string" || val.split(",").some((p) => p && p !== "None" && !F.parts.includes(p.trim())))) errors.push(`${t}: ${F.label} ${val} — only ${F.parts.join(", ")}`);
        if (F.group && (!Array.isArray(val) || val.some((g) => !GROUP_NAME.test(g)))) errors.push(`${t}: ${F.label} must be a PIM-SG- group name`);
        if (F.level && !(val && ["All", "Critical"].includes(val.notificationLevel))) errors.push(`${t}: ${F.label} must be All or Critical`);
      }
      const m = Object.assign({}, cat.templates[t], o);
      const req = String(m.ActivationRequirement || "");
      if (m.AuthenticationContext_Enabled && /MultiFactorAuthentication/.test(req)) errors.push(`${t}: MFA on activation together with an authentication context — Entra refuses the pair; the context's Conditional Access policy carries the MFA`);
      if (m.ApprovalRequired && !(m.Approvers || []).length) errors.push(`${t}: approval with no approver group — nobody could approve`);
      if (t === "Tier0" && !m.ApprovalRequired && !m.AuthenticationContext_Enabled) warnings.push("Tier0 without approval AND without an authentication context: a Global Administrator can be activated on MFA alone");
      if (t === "Tier0" && m.AllowPermanentActiveAssignment) warnings.push("Tier0 allows permanent active assignments — the framework's break-glass accounts are the only standing Tier 0");
      if (/^Tier/.test(t) && m.AllowPermanentEligibility) warnings.push(`${t} allows permanent eligibility — nothing then brings its holders back for the yearly review`);
    }
    for (const [r, o] of Object.entries(v.roles || {})) {
      if (!cat.roles.some((x) => x.name === r)) { errors.push(`role ${r} is not in the framework`); continue; }
      if (o.template && !ROLE_TIERS.includes(o.template)) errors.push(`${r}: tier ${o.template} — only ${ROLE_TIERS.join(", ")}`);
      const base = cat.roles.find((x) => x.name === r);
      if (o.template && base.template === "Tier0" && o.template !== "Tier0") warnings.push(`${r} leaves Tier 0 — it can ${/Privileged|Global/.test(r) ? "make a Global Administrator" : "switch the tenant's security policy off"}`);
    }
    if (v.mailbox != null && !MAILBOX.test(String(v.mailbox))) errors.push(`mailbox ${v.mailbox} is not a mailbox name or address`);
    if (v.authContext != null && !/^c([1-9]|[1-9][0-9])$/.test(String(v.authContext))) errors.push(`authentication context ${v.authContext} — c1 to c99`);
    for (const [from, to] of Object.entries(v.approvers || {})) if (!GROUP_NAME.test(to)) errors.push(`approver group ${from} → ${to}: must be a PIM-SG- name`);
    return { errors, warnings };
  }

  function apply(cat, v) {
    if (isEmpty(v)) return cat;
    const out = Object.assign({}, cat);
    const mapApprover = (a) => (typeof a === "string" && v.approvers && v.approvers[a]) || a;
    const fix = (t) => {
      const o = Object.assign({}, t);
      if (Array.isArray(o.Approvers)) o.Approvers = o.Approvers.map(mapApprover);
      if (v.mailbox) for (const k of ["Notification_Activation_Alert", "Notification_EligibleAssignment_Alert", "Notification_ActiveAssignment_Alert"]) if (o[k]) o[k] = Object.assign({}, o[k], { Recipients: (o[k].Recipients || []).map((r) => (r === (cat.notifications && cat.notifications.mailbox) || r === "pim-alerts" ? v.mailbox : r)) });
      if (v.authContext && o.AuthenticationContext_Enabled) o.AuthenticationContext_Value = v.authContext;
      return o;
    };
    out.templates = {};
    for (const [k, t] of Object.entries(cat.templates)) out.templates[k] = fix(Object.assign({}, t, (v.templates || {})[k] || {}));
    out.roles = cat.roles.map((r) => {
      const o = (v.roles || {})[r.name];
      const override = r.override ? fix(r.override) : r.override;
      return o && o.template ? Object.assign({}, r, { template: o.template, override }) : Object.assign({}, r, { override });
    });
    if (v.approvers && Object.keys(v.approvers).length) {
      out.approvers = Object.assign({}, cat.approvers, { name: mapApprover(cat.approvers && cat.approvers.name) });
      if (out.profile) out.profile = Object.assign({}, out.profile);
    }
    out.variant = { name: v.name || "unnamed variant", updatedAt: v.updatedAt || null, changes: diff(cat, v).length };
    out.label = cat.label;
    return out;
  }

  const show = (k, val) => {
    if (val === true) return "on"; if (val === false) return "off";
    if (Array.isArray(val)) return val.join(", ") || "none";
    if (val && typeof val === "object" && "notificationLevel" in val) return val.notificationLevel;
    if (k === "ActivationRequirement") return String(val || "None").split(",").filter(Boolean).map((x) => ({ MultiFactorAuthentication: "MFA", Justification: "justification", Ticketing: "ticket" }[x.trim()] || x)).join(" + ") || "nothing";
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?)?$/.exec(String(val || ""));
    if (m && (m[1] || m[2])) return [m[1] ? `${m[1]} day${m[1] === "1" ? "" : "s"}` : "", m[2] ? `${m[2]} h` : ""].filter(Boolean).join(" ");
    return String(val);
  };
  function diff(cat, v) {
    const out = [];
    if (!v) return out;
    for (const [t, o] of Object.entries(v.templates || {})) for (const [k, val] of Object.entries(o || {})) {
      const base = cat.templates[t] ? cat.templates[t][k] : undefined;
      if (JSON.stringify(base) !== JSON.stringify(val)) out.push({ where: t, what: (FIELDS[k] || { label: k }).label, from: show(k, base), to: show(k, val) });
    }
    for (const [r, o] of Object.entries(v.roles || {})) { const b = cat.roles.find((x) => x.name === r); if (b && o.template && o.template !== b.template) out.push({ where: r, what: "Tier", from: b.template, to: o.template }); }
    if (v.mailbox) out.push({ where: "Alerts", what: "Mailbox", from: (cat.notifications && cat.notifications.mailbox) || "pim-alerts", to: v.mailbox });
    if (v.authContext) out.push({ where: "Tier 0", what: "Authentication context", from: (cat.authContext && cat.authContext.id) || "c1", to: v.authContext });
    for (const [a, b] of Object.entries(v.approvers || {})) if (a !== b) out.push({ where: "Approvers", what: a, from: a, to: b });
    return out;
  }
  // Put a template field back to the framework's value.
  function reset(v, tier, key) {
    const n = clone(v);
    if (n.templates[tier]) { delete n.templates[tier][key]; if (!Object.keys(n.templates[tier]).length) delete n.templates[tier]; }
    return n;
  }
  // Set a field; setting it to the framework's own value removes it.
  function set(v, cat, tier, key, val) {
    const n = clone(v);
    const base = cat.templates[tier] ? cat.templates[tier][key] : undefined;
    if (JSON.stringify(base) === JSON.stringify(val)) return reset(n, tier, key);
    n.templates[tier] = Object.assign({}, n.templates[tier] || {}, { [key]: val });
    return n;
  }
  function setRole(v, cat, role, template) {
    const n = clone(v);
    const b = cat.roles.find((x) => x.name === role);
    if (!b || b.template === template) delete n.roles[role]; else n.roles[role] = { template };
    return n;
  }
  return { SCHEMA, FIELDS, ROLE_TIERS, blank, isEmpty, validate, apply, diff, reset, set, setRole, show };
})();
