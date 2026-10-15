// ======================================================================
// 📄 PIM documentation (T58, beta 32609) — pure module, no DOM, no Graph.
//
// Mihai, 14 Oct 2026: "the create documentation for PIM should be
// accessible in PIM buddy, maybe a dedicated tool" and, on the mockup,
// "T58 should also be completely readable online. for now go create".
//
// What 📄 Create documentation (T02) does for Conditional Access in
// Workspace 01, this does for PIM in 02: ONE handover for this tenant —
// the CloudFellows PIM framework as it applies here — generated from the
// catalog in the tenant's profile (js/pimBaselineData.js through
// PimBaseline.profile, the customer's variant and the modules switched on
// folded in by pmbCat()), the regions file when one is loaded, and, when
// the reader asks for it, the tenant's own values from 🧬 PIM baseline's
// last read. The offline PimBuddy_Baseline_* and _Handover_* files of
// October said the same things by hand and drifted behind every release;
// this never can, because it reads the catalog the tools compare against.
//
// Two sources, one document:
//   as designed   the framework in this profile — the baseline a new tenant
//                 is deployed to; nothing read from the tenant
//   as found      the same chapters with an "In this tenant" column from
//                 PimBaseline.compare (T48's pmbRes): verdict per role and
//                 group, the differences in words
//
// ONE MODEL, TWO RENDERINGS. build() returns chapters of plain blocks
// (paragraph, list, table, diagram, note); render() draws them as the page
// (the diagrams inline as SVG, a contents list that jumps), toMd() writes
// the same blocks as Markdown with every diagram EMBEDDED as a data URI so
// the file keeps its pictures when moved (the 12 Oct handover lesson) and a
// contents page of every heading first (Mihai reads these on the iPad).
// The screen and the file can never disagree, because neither is the
// source — the model is.
//
// Chapters are ticked by the reader; a chapter a profile has no content
// for (Intune without an Intune design, Regions outside multi-region) is
// left out and the numbering closes up. Plain text in every string: no
// HTML in the catalog's own words, and esc() on the way to the page.
// ======================================================================
const PimDoc = (() => {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mdc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const b64 = (str) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, "utf8").toString("base64"));
  const TIERS = ["Tier0", "Tier1", "Tier2", "Reader"];
  const TIER_LABEL = { Tier0: "Tier 0", Tier1: "Tier 1", Tier2: "Tier 2", Reader: "Readers" };
  const SCOPE_LABEL = { m365: "Entra roles", intune: "Intune", xdr: "Defender XDR", exchange: "Exchange", purview: "Purview", azure: "Azure", rh: "Remote Help", rhu: "Remote Help unattended", w365: "Windows 365", spo: "SharePoint", fab: "Fabric", pp: "Power Platform" };

  // "PT2H" → "2 h", "P365D" → "365 days"; booleans and lists in words.
  function human(v) {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(String(v));
    if (!m || (!m[1] && !m[2] && !m[3])) return String(v);
    return [m[1] && `${m[1]} day${m[1] === "1" ? "" : "s"}`, m[2] && `${m[2]} h`, m[3] && `${m[3]} min`].filter(Boolean).join(" ");
  }
  const SETTING = [
    ["activation", "Activation lasts"], ["enablement", "Activation asks for"], ["authContext", "Authentication context"], ["approval", "Approval"], ["approvers", "Approvers"],
    ["permEligible", "Permanent eligibility allowed"], ["maxEligible", "Eligibility at most"], ["permActive", "Permanent active allowed"], ["maxActive", "Active assignment at most"],
    ["alertActivation", "Alert on activation"], ["alertEligible", "Alert on eligible assignment"], ["alertActive", "Alert on active assignment"], ["recipients", "Alert recipients"],
  ];
  const settingText = (k, v) => (k === "authContext" ? (v ? v : "none") : k === "enablement" ? (Array.isArray(v) && v.length ? v.map((x) => ({ MultiFactorAuthentication: "MFA", Justification: "justification", Ticketing: "a ticket" }[x] || x)).join(" + ") : "nothing") : k === "approvers" ? (Array.isArray(v) && v.length ? v.join(", ") : "—") : human(v));

  // ---- the chapters ---------------------------------------------------
  const CHAPTERS = [
    { id: "model", title: "The model", blurb: "role activation first, role groups as team rosters, the lineage, the naming" },
    { id: "tiers", title: "Tiers and role settings", blurb: "the four tiers setting by setting; every Entra role with its tier, its group and its own override" },
    { id: "groups", title: "PIM-SG groups per persona", blurb: "name, purpose, membership, what each carries" },
    { id: "approvers", title: "Approvers, break-glass and protection", blurb: "PIM-SG-Approvers, the emergency accounts, the alert mailbox, what is protected where" },
    { id: "activation", title: "Activation guide for administrators", blurb: "the portal path, what each tier asks, how long it lasts, the slow paths" },
    { id: "intune", title: "Intune RBAC", blurb: "role assignments, scope groups and tags, the custom roles, the modules switched on", when: (c) => !!(c.profile && c.profile.intune) },
    { id: "exopur", title: "Exchange, SharePoint and Purview RBAC", blurb: "the role group behind each PIM-SG-EXO and PIM-SG-PUR group, the two SharePoint layers, and the scripts that bind them", when: (c) => c.groups.some((g) => g.scope === "exchange" || g.scope === "purview") },
    { id: "xdrgsa", title: "Defender XDR and Global Secure Access", blurb: "the XDR access groups on the Entra side; the Global Secure Access roles" },
    { id: "regions", title: "Regions", blurb: "the template per region — units, groups, scoped eligibilities, Exchange, Intune — and your regions file", when: (c) => !!(c.profile && c.profile.regions) },
    { id: "rmau", title: "Restricted units", blurb: "AU-RM-Executives and the desk scoped on it; what never goes into a restricted unit" },
    { id: "ca", title: "Conditional Access for PIM", blurb: "authentication context c1 and the policy that enforces it" },
    { id: "outside", title: "Done outside the browser", blurb: "access reviews, the generated scripts, the Defender portal roles, object-level bindings" },
  ];
  const chapters = (cat) => CHAPTERS.filter((c) => !c.when || c.when(cat)).map((c) => ({ id: c.id, title: c.title, blurb: c.blurb }));

  // ---- blocks ---------------------------------------------------------
  const P = (text) => ({ t: "p", text });
  const H = (text) => ({ t: "h", text });
  const UL = (items) => ({ t: "ul", items });
  const OL = (items) => ({ t: "ol", items });
  const T = (head, rows, caption) => ({ t: "table", head, rows, caption });
  const NOTE = (text) => ({ t: "note", text });
  const SVG = (svg, alt, caption) => ({ t: "svg", svg, alt, caption });

  // ---- tenant side (as found) -------------------------------------------
  const VERDICT = { match: "✓ as designed", differs: "≠ differs", missing: "✗ missing", unread: "? not read", conflict: "⚠ conflict" };
  function foundRole(res, name) {
    const r = res && res.rows.find((x) => x.name === name);
    if (!r) return "—";
    const diffs = (r.diffs || []).map((d) => `${d.label}: ${human(d.tenant)} → ${human(d.baseline)}`);
    return [VERDICT[r.status] || r.status, ...diffs, ...(r.findings || [])].join("; ");
  }
  function foundGroup(res, name) {
    const g = res && res.groups.find((x) => x.name === name);
    if (!g) return "—";
    const bits = [g.present ? (g.ids && g.ids.length > 1 ? `present ${g.ids.length}×` : "present") : "not in the tenant"];
    if (g.present && g.roleAssignable === false) bits.push("not role-assignable");
    if (g.missingRoles && g.missingRoles.length) bits.push(`missing: ${g.missingRoles.join(", ")}`);
    if (g.extraRoles && g.extraRoles.length) bits.push(`also holds: ${g.extraRoles.join(", ")}`);
    if (g.wrongShape && g.wrongShape.length) bits.push(`held active (4.1 slow path): ${g.wrongShape.join(", ")}`);
    (g.diffs || []).forEach((d) => bits.push(`${d.label}: ${human(d.tenant)} → ${human(d.baseline)}`));
    if (g.conflict) bits.push(g.conflict);
    return `${VERDICT[g.status] || g.status} — ${bits.join("; ")}`;
  }

  // ---- diagrams -------------------------------------------------------
  const C = { ink: "#18202b", mute: "#5b6b7f", obj: ["#eef2f7", "#5b6b7f"], ok: ["#e3f4ea", "#2e7d4f"], warn: ["#fff4d6", "#b7860b"], hot: ["#fde7e4", "#c0392b"], tier: ["#eaf1fb", "#1f4e8f"] };
  const svgOpen = (W, H) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif"><defs><marker id="pdArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${C.mute}"/></marker></defs><rect width="${W}" height="${H}" fill="#ffffff"/>`;
  const box = (x, y, w, h, kind, lines) => {
    const [fill, stroke] = C[kind];
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` + lines.map((l, i) => `<text x="${x + w / 2}" y="${y + 21 + i * 16}" text-anchor="middle" font-size="${i === 0 ? 13 : 11.5}" font-weight="${i === 0 ? 700 : 400}" fill="${C.ink}">${esc(l)}</text>`).join("");
  };
  const arrow = (x1, y1, x2, y2, label, above, dash) => `<path d="M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="${C.mute}" stroke-width="1.5"${dash ? ' stroke-dasharray="5 4"' : ""} marker-end="url(#pdArrow)"/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + (above === false ? 14 : -6)}" text-anchor="middle" font-size="11" fill="${C.mute}">${esc(label)}</text>` : ""}`;
  // 32617: a box whose lines sit in its vertical middle — the Administrator
  // spans both lanes of the access diagram, so its text must not hug the top.
  const boxMid = (x, y, w, h, kind, lines) => {
    const [fill, stroke] = C[kind];
    const top = y + Math.round((h - lines.length * 16) / 2) + 12;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` + lines.map((l, i) => `<text x="${x + w / 2}" y="${top + i * 16}" text-anchor="middle" font-size="${i === 0 ? 13 : 11.5}" font-weight="${i === 0 ? 700 : 400}" fill="${C.ink}">${esc(l)}</text>`).join("");
  };
  const lane = (y, text) => `<text x="16" y="${y}" font-size="12" font-weight="700" fill="${C.mute}">${esc(text)}</text>`;

  // How access flows: the role path (every Entra role group since 5.0) and
  // the access-group path (Intune, Defender XDR, Exchange, Purview).
  function flowSvg(cat, t0) {
    const W = 980, H = 340;
    return [svgOpen(W, H),
      lane(26, "ENTRA ROLES · active member of the role group · the group eligible per role · the ROLE policy is the gate"),
      // 32617: the Administrator spans both lanes and each path leaves it
      // straight, its label ABOVE the line — the old curves from one box
      // corner put "active member" on top of its own arrow.
      boxMid(16, 44, 150, 248, "obj", ["Administrator", "adm- account", "MFA,", "phishing-resistant"]),
      box(250, 44, 210, 76, "ok", ["PIM-SG role group", "active member ≤ 1 year", "assigned, reviewed yearly"]),
      box(500, 44, 210, 76, "obj", ["Entra role", "the group is ELIGIBLE", "one role per activation"]),
      box(750, 44, 214, 76, "tier", ["Activate the role · seconds", t0 ? `Tier 0: ${t0.activation} · ${t0.context} · approval` : "Tier 0: context c1 + approval", "Tier 1–2: MFA + justification"]),
      arrow(166, 82, 250, 82, "active member"), arrow(460, 82, 500, 82), arrow(710, 82, 750, 82),
      `<text x="250" y="200" font-size="12" font-weight="700" fill="${C.mute}">ACCESS GROUPS · eligible member · activate the MEMBERSHIP · the workload notices minutes later (the slow path)</text>`,
      box(250, 216, 210, 76, "warn", ["PIM-SG access group", "PIM-SG-INT / XDR / EXO / PUR", "eligible member ≤ 1 year"]),
      box(500, 216, 210, 76, "obj", ["Workload role", "Intune assignment, XDR role,", "Exchange / Purview role group"]),
      box(750, 216, 214, 76, "warn", ["Activate membership · minutes", "8 h shift · MFA + justification", "Elevation and XDR Admin: approval"]),
      arrow(166, 254, 250, 254, "eligible member", true, true), arrow(460, 254, 500, 254), arrow(710, 254, 750, 254),
      `<text x="16" y="${H - 14}" font-size="11" fill="${C.mute}">${esc(`${cat.label} ${cat.release} · blue: the tier decides what the activation asks · amber, dashed: membership activation, plan for the delay`)}</text>`,
      "</svg>"].join("");
  }
  // The four tiers side by side with the settings that matter most.
  function tiersSvg(tiers) {
    const W = 980, H = 190, w = 226, gap = 16;
    const kinds = { Tier0: "hot", Tier1: "warn", Tier2: "ok", Reader: "obj" };
    const s = [svgOpen(W, H), lane(24, "THE FOUR TIERS · what an activation asks, how long it lasts, how long an assignment may stand")];
    tiers.forEach((t, i) => {
      const x = 16 + i * (w + gap);
      s.push(box(x, 40, w, 120, kinds[t.id], [TIER_LABEL[t.id], `activation ${t.s.activation}`, `asks ${t.s.enablement}${t.s.authContext !== "none" ? ` · context ${t.s.authContext}` : ""}`, t.s.approval === "yes" ? `approval by ${t.s.approvers}` : "no approval", `eligible ≤ ${t.s.maxEligible} · active ≤ ${t.s.maxActive}`, `${t.roles} role${t.roles === 1 ? "" : "s"}`]));
    });
    s.push(`<text x="16" y="${H - 14}" font-size="11" fill="${C.mute}">red: can make or unmake a Global Administrator · amber: runs a workload · green: helps people · grey: reads</text>`, "</svg>");
    return s.join("");
  }
  // One region as the template builds it.
  function regionSvg(r, code) {
    const W = 980;
    const n = (x) => String(x).replace(/<REG>/g, code);
    const aus = (r.aus || []).map((a) => n(a.name)), grs = (r.groups || []).filter((g) => g.roleAssignable !== false).map((g) => n(g.name)).slice(0, 9), elig = (r.eligibilities || []).slice(0, 9);
    const H = 50 + 30 + Math.max(aus.length, grs.length, elig.length) * 16 + 44;
    return [svgOpen(W, H),
      lane(26, `ONE REGION · ${code} · global IT first, then regional IT — no local IT below a region`),
      box(16, 50, 230, 30 + aus.length * 16, "obj", ["Administrative units", ...aus]),
      box(290, 50, 300, 30 + grs.length * 16, "ok", ["Regional groups", ...grs]),
      box(640, 50, 324, 30 + elig.length * 16, "tier", ["Eligible at the region's units", ...elig.map((e) => `${e.role} → ${n(e.au)}`)]),
      arrow(246, 70, 290, 70, "scope"), arrow(590, 70, 640, 70, "per role"),
      `<text x="16" y="${H - 14}" font-size="11" fill="${C.mute}">${esc(`the units hold the region's users, devices and groups; the regional groups are eligible for their roles AT those units, never tenant-wide`)}</text>`,
      "</svg>"].join("");
  }
  const dataUri = (svg) => `data:image/svg+xml;base64,${b64(svg)}`;

  // ---- build ------------------------------------------------------------
  // input: { cat (profile applied), tenant {name, domain, id}, regions (rows|null),
  //          res (PimBaseline.compare result | null), chapters (Set|null), demo, build, PB (PimBaseline) }
  function build(input) {
    const cat = input.cat, PB = input.PB, res = input.res || null, domain = (input.tenant && input.tenant.domain) || null;
    const prof = cat.profile || { label: "(no profile)", size: "", description: "", regions: false, rmau: [], scoped: [], intune: null, modules: [] };
    const want = input.chapters instanceof Set ? input.chapters : null;
    const list = chapters(cat).filter((c) => !want || want.has(c.id));
    const found = !!res;
    const tier = {};
    TIERS.forEach((id) => { tier[id] = PB.expected(cat, { template: id }, domain); });
    const rolesOf = (g) => cat.roles.filter((r) => (r.via || []).includes(g)).map((r) => r.name);
    const tmplText = (g) => {
      const t = cat.templates[g.template] || {};
      if (g.template === "GroupMember") return `active member, at most ${human(t.MaximumActiveAssignmentDuration || "P365D")}`;
      if (!g.template) return "plain security group";
      return `eligible member, activation ${human(t.ActivationDuration)}${t.ApprovalRequired ? ` with approval` : ""}${t.AuthenticationContext_Enabled ? ` under context ${t.AuthenticationContext_Value}` : ""}`;
    };
    const carries = (g) => g.scope === "m365" ? (rolesOf(g.name).join(", ") || "—") : g.scope === "intune" ? "Intune role assignments (chapter Intune RBAC)" : g.scope === "xdr" ? `${(g.xdr && g.xdr.role) || "Defender XDR role"} · scope ${(g.xdr && g.xdr.scope) || "All"}` : g.scope === "exchange" ? `Exchange role group ${(g.exchange && g.exchange.roleGroup) || "—"}` : g.scope === "purview" ? `Purview role group ${(g.purview && g.purview.roleGroup) || "—"}` : g.scope === "azure" ? `Azure ${(g.azure && g.azure.role) || ""} on ${(g.azure && g.azure.scope) || ""}` : (SCOPE_LABEL[g.scope] || g.scope);
    const ch = {};

    // 1 The model
    ch.model = (() => {
      const B = [];
      B.push(P(`${cat.label} ${cat.release}, revised ${cat.revised}, is authored and tested in the ${cat.tenant} tenant and applied to ${input.tenant && input.tenant.name ? input.tenant.name : "this tenant"} in the profile ${prof.label} (${prof.size}).${cat.variant ? ` The customer's variant ${cat.variant.name} (${cat.variant.changes} change${cat.variant.changes === 1 ? "" : "s"}, made in 🧾 Designer) is folded into every table below.` : ""}${prof.modules && prof.modules.length ? ` Modules switched on: ${prof.modules.map((m) => (cat.modules[m] && cat.modules[m].label) || m).join(", ")}.` : " No optional module is switched on."}`));
      B.push(P(prof.description || ""));
      B.push(H("How access flows"));
      const t0 = tier.Tier0;
      B.push(SVG(flowSvg(cat, { activation: settingText("activation", t0.activation), context: t0.authContext || "c1" }), "How access flows: the role path and the access-group path", "The role path (top) and the access-group path (bottom)."));
      B.push(P("Role activation first. A person is an active member of a PIM-SG role group for at most a year, assigned by an administrator with a justification and reviewed yearly. The group itself holds nothing standing: it is eligible for each of its roles, and the person activates the one role the task needs, under that role's own tier — in seconds, because an Entra role activation does not have to reach another workload. The role policy is the gate, so a Tier 0 role asks for the authentication context and an approval however it is reached."));
      B.push(P("Access groups are the exception the workloads force. Intune, Defender XDR, Exchange and Purview have no PIM of their own, so their PIM-SG groups have eligible members who activate the membership for a shift; the workload notices the new member minutes later. That delay is the slow path, and the activation guide says how to plan for it."));
      B.push(H("Naming"));
      B.push(UL([`Every object starts with the solution: PIM-SG-… for the groups, AU-… for administrative units, INT-… for Intune objects. Pattern ${cat.naming.pattern}; for example ${cat.naming.example}.`, "A tenant's group counts as the framework's only under the exact name — no prefix, no suffix, no version — and only once; two groups with the same name are a conflict every tool refuses to act on.", "A PIM-SG group is role-assignable from the day it is made (the flag cannot be set later) and private; a plain security group (the approver groups) never is."]));
      if (cat.retired && cat.retired.length) B.push(T(["Retired group", "Folded into", "Since", "Why"], cat.retired.map((r) => [r.name, r.into, r.release, r.note || ""]), "Groups the framework no longer uses. A tenant group under one of these names is reported as retired; 🚀 Deploy removes what it still holds once the new group holds the same role, and a person deletes the group."));
      B.push(H("Lineage"));
      B.push(P(cat.lineage || ""));
      return B;
    })();

    // 2 Tiers and role settings
    ch.tiers = (() => {
      const B = [];
      const byTier = {}; TIERS.forEach((id) => { byTier[id] = cat.roles.filter((r) => r.template === id); });
      B.push(P("A tier is one set of PIM settings, named; every Entra role belongs to one. The tier decides what an activation asks for and how long anything may stand — a role never carries settings of its own except the few overrides listed with it."));
      B.push(SVG(tiersSvg(TIERS.map((id) => ({ id, s: Object.fromEntries(SETTING.map(([k]) => [k, settingText(k, tier[id][k])])), roles: byTier[id].length }))), "The four tiers", "The four tiers and what each asks."));
      B.push(T(["Setting", ...TIERS.map((id) => TIER_LABEL[id])], SETTING.map(([k, label]) => [label, ...TIERS.map((id) => settingText(k, tier[id][k]))]), "Every setting per tier, as 🧬 PIM baseline compares it. Alert recipients are the pim-alerts mailbox at the tenant's domain."));
      TIERS.forEach((id) => {
        const rows = byTier[id]; if (!rows.length) return;
        const head = ["Role", "Eligible through", "Own override", "Note"]; if (found) head.push("In this tenant");
        B.push(H(`${TIER_LABEL[id]} · ${rows.length} role${rows.length === 1 ? "" : "s"}`));
        B.push(P(cat.templates[id] && cat.templates[id].description ? cat.templates[id].description : ""));
        B.push(T(head, rows.slice().sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
          const ov = Object.entries(r.override || {}).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim().toLowerCase()}: ${human(v)}`).join("; ") || "—";
          const row = [r.name + (r.module ? ` (module ${(cat.modules[r.module] && cat.modules[r.module].label) || r.module})` : ""), (r.via || []).join(", ") || "—", ov, r.note || ""];
          if (found) row.push(foundRole(res, r.name));
          return row;
        })));
      });
      return B;
    })();

    // 3 Groups
    ch.groups = (() => {
      const B = [];
      B.push(P(`The profile keeps ${cat.groups.length} PIM-SG groups. A role group carries Entra roles; an access group carries a workload role through the group's membership. Members are never in the catalog — they are added by an administrator or an access package and reviewed yearly.`));
      const order = ["m365", "intune", "rh", "rhu", "w365", "xdr", "exchange", "purview", "azure"];
      const groups = cat.groups.slice().sort((a, b) => (order.indexOf(a.scope) - order.indexOf(b.scope)) || a.name.localeCompare(b.name));
      const head = ["Group", "Workload", "Persona", "Membership", "Carries", "Purpose"]; if (found) head.push("In this tenant");
      B.push(T(head, groups.map((g) => { const row = [g.name, SCOPE_LABEL[g.scope] || g.scope, g.persona || "", tmplText(g), carries(g), g.description || ""]; if (found) row.push(foundGroup(res, g.name)); return row; })));
      if (prof.scoped && prof.scoped.length) B.push(T(["Role", "Group", "At the unit"], prof.scoped.map((x) => [x.role, x.group, x.au]), "Eligibilities at a unit's scope instead of the whole tenant."));
      return B;
    })();

    // 4 Approvers, break-glass and protection
    ch.approvers = (() => {
      const B = [];
      B.push(H("Approvers"));
      B.push(P(`${cat.approvers.name} — ${cat.approvers.description} Approval is switched on only when the group exists with at least two members, so an empty approver group can never lock Tier 0 out (🚀 Deploy checks this on every run).`));
      if (prof.regions) B.push(P("Each region has PIM-SG-<REG>-Approvers, filled from the approvers column of the regions file — an optional regional approval gate for the regional groups."));
      B.push(H("Alerts"));
      B.push(P(`${cat.notifications.description}${domain ? ` Here: ${cat.notifications.mailbox}@${domain}.` : ""}`));
      B.push(H("Break-glass accounts"));
      B.push(P(`${cat.protected.description} The name pattern ${cat.protected.pattern} only suggests emergency accounts; the accounts are recorded by object id in 🧬 PIM baseline and never counted as standing access outside the framework. The standing Global Administrator of the baseline tenant is protected the same way: no PIM-buddy run touches it.`));
      B.push(H("Where each kind of privileged object is protected"));
      B.push(T(["Object", "How it is protected", "Restricted unit?"], (cat.protection || []).map((p) => [p.object, p.how, p.rmau ? "yes" : "never"])));
      return B;
    })();

    // 5 Activation guide
    ch.activation = (() => {
      const B = [];
      B.push(P("For the administrator who holds a role through a PIM-SG group. Activate the role, not the membership, whenever the task is an Entra role; activate a membership only for Intune, Defender XDR, Exchange, Purview and a SharePoint site group."));
      B.push(H("An Entra role"));
      B.push(OL(["Sign in with the admin account (adm-), never the daily account. Open the Microsoft Entra admin center → Identity governance → Privileged Identity Management → My roles → Microsoft Entra roles.", "Pick the one role the task needs and choose Activate. Set the duration (up to the tier's maximum) and the reason; the reason is in the audit log and in the pim-alerts mailbox.", "Tier 1 and Tier 2 ask for MFA and a justification and the role is active within a minute. Tier 0 asks for the authentication context (the Conditional Access policy for c1: phishing-resistant MFA on a compliant device) and waits for an approver from PIM-SG-Approvers — tell the approver before you start.", "Do the task. Deactivate when done, or let the activation expire; nothing stays active past the tier's maximum."]));
      B.push(T(["Tier", "Activation lasts", "Asks for", "Context", "Approval", "Eligibility at most"], TIERS.map((id) => [TIER_LABEL[id], settingText("activation", tier[id].activation), settingText("enablement", tier[id].enablement), settingText("authContext", tier[id].authContext), tier[id].approval ? `yes, ${settingText("approvers", tier[id].approvers)}` : "no", settingText("maxEligible", tier[id].maxEligible)])));
      B.push(H("An access group (Intune, Defender XDR, Exchange, Purview, the modules)"));
      B.push(OL(["My roles → Groups → the PIM-SG access group → Activate, with the reason. The membership lasts a shift (eight hours) unless the group says otherwise; Remote Help Elevation and the Defender XDR administrator group wait for an approver.", "The workload has to notice the new member: Intune and Defender within a few minutes, Exchange and Purview role groups up to an hour. Plan the activation before the change window, not during it.", "Once the shift ends the membership is gone and the workload forgets it the same way."]));
      B.push(NOTE("The slow path. Before 5.0 a job group held its roles active and people activated the membership; every Entra role then had to wait for the workload. A group that still holds an Entra role active is reported by 🧬 PIM baseline and 📋 PIM report as the 4.1 slow path, with the way out in 🚀 Deploy."));
      return B;
    })();

    // 6 Intune
    if (prof.intune) ch.intune = (() => {
      const B = [], I = prof.intune;
      B.push(P("Intune has no administrative units and no PIM of its own, so the framework draws the same boundaries with Intune's objects: role assignments whose members are the PIM-SG-INT access groups (eligible members — activating the membership is the gate), scope groups for who and what an assignment reaches, scope tags for what an administrator sees, and custom roles where a built-in one gives too much."));
      B.push(T(["Assignment", "Roles", "Members", "Reaches", "Scope tags", "Note"], (I.assignments || []).map((a) => [a.name + (a.module ? ` (module ${(cat.modules[a.module] && cat.modules[a.module].label) || a.module})` : ""), (a.roles || []).join(", "), (a.members || []).join(", "), a.scope || (a.scopeGroups || []).join(", ") || "", (a.tags || []).join(", ") || "—", a.note || ""])));
      const custom = (cat.intuneRoles || []).filter((r) => (I.customRoles || []).includes(r.name));
      if (custom.length) B.push(T(["Custom role", "Why", "Permissions"], custom.map((r) => [r.name, r.description || r.why || "", `${(r.allowed || []).length} allowed operation${(r.allowed || []).length === 1 ? "" : "s"}`]), "The custom roles 🚀 Deploy creates permission by permission; 📱 Intune RBAC (T53) compares them."));
      if (I.switches && I.switches.length) B.push(UL(I.switches.map((s) => `Tenant switch: ${s}`)));
      if (prof.modules && prof.modules.length) {
        B.push(H("Modules switched on"));
        prof.modules.forEach((m) => { const M = cat.modules[m]; if (M) B.push(P(`${M.label} — ${M.description}`)); });
      }
      if (prof.cloudPc && prof.cloudPc.length) B.push(T(["Cloud PC role", "Group"], prof.cloudPc.map((x) => [x.role, x.group]), "Windows 365: the Cloud PC role assignments, whole tenant."));
      return B;
    })();

    // 7 Exchange, SharePoint and Purview
    ch.exopur = (() => {
      const B = [];
      const exo = cat.groups.filter((g) => g.scope === "exchange"), pur = cat.groups.filter((g) => g.scope === "purview");
      B.push(P("Exchange Online and Purview keep their own role groups. The framework puts a PIM-SG access group into each role group once, so the role group's membership never changes by hand again: a person activates the PIM-SG group's membership and Exchange or Purview sees the member minutes later."));
      if (exo.length) B.push(T(["Group", "Exchange role group", "Roles in that role group", "Membership"], exo.map((g) => [g.name, (g.exchange && g.exchange.roleGroup) || "—", (g.exchange && g.exchange.roles || []).join(", ") || "—", tmplText(g)])));
      if (pur.length) B.push(T(["Group", "Purview role group", "Membership"], pur.map((g) => [g.name, (g.purview && g.purview.roleGroup) || "—", tmplText(g)])));
      const spo = cat.roles.filter((r) => /^SharePoint (Backup )?Administrator$|^Global Reader$/.test(r.name) && (r.via || []).length);
      if (spo.length) {
        B.push(P("SharePoint has no role groups of its own. Administration has two layers: the tenant layer is the Entra role SharePoint Administrator, activated per role like every Entra role; the site layer is the site collection administrator of one site, chosen per customer. Refresh the token after activating (aka.ms/pim/tokenrefresh) before opening the SharePoint admin center."));
        B.push(T(["Access", "Tier", "Eligible through", "Gives"], spo.map((r) => [r.name, TIER_LABEL[r.template] || r.template, (r.via || []).join(", "), r.name === "Global Reader" ? "the SharePoint admin center, read-only" : r.name === "SharePoint Administrator" ? "the SharePoint admin center: tenant settings, sharing, every site, OneDrive settings" : "Microsoft 365 Backup for SharePoint and OneDrive: back up and restore"]).concat([["Site collection administrator of one site", "access group", "PIM-SG-SPO-<site>-Admins (per customer, optional)", "full control of that one site, nothing tenant-wide"]])));
        B.push(NOTE("A site group is created by 🚀 Deploy (role-assignable, private, empty) together with a SharePoint Online PowerShell script that makes it secondary site collection administrator, the group id and site URL filled in; nothing is bound without that script. Members activate the membership for a shift, and SharePoint can take hours to notice a membership change: test on the site before relying on it, and use SharePoint Administrator for urgent site work until the delay is measured."));
      }
      if (prof.regions) B.push(P("Regions: a role group cannot be scoped per member, so each regional PIM-SG-EXO group gets direct Exchange role assignments scoped to the region's user unit (the Exchange provider through Graph, consented once; until then the generated script)."));
      B.push(NOTE("Microsoft Graph lists the Exchange and Purview role groups but never their members, and a role-assignable group is not a principal that provider resolves. So 🚀 Deploy creates the PIM-SG groups and their membership policies, and offers ⬇ Script per workload: Exchange PowerShell (Add-RoleGroupMember with the group ids) and Security and Compliance PowerShell for Purview. Each script writes an outcome file that 📂 Import outcome reads back."));
      return B;
    })();

    // 8 XDR and GSA
    ch.xdrgsa = (() => {
      const B = [];
      const xdr = cat.groups.filter((g) => g.scope === "xdr");
      B.push(H("Defender XDR"));
      B.push(P("The Entra side only: the access groups, role-assignable and private, with their membership policies. The Defender portal roles with their permission sets, one assignment each at scope All naming its group, and unified RBAC per workload are made in the Defender portal and are never read here."));
      if (xdr.length) B.push(T(["Group", "Defender XDR role", "Scope", "Membership", "Purpose"], xdr.map((g) => [g.name, (g.xdr && g.xdr.role) || "—", (g.xdr && g.xdr.scope) || "All", tmplText(g), g.description || ""])));
      B.push(H("Global Secure Access"));
      const gsa = cat.roles.filter((r) => /Global Secure Access/i.test(r.name));
      B.push(P("Global Secure Access is in every design, Microsoft traffic included. Private Access stays with Application Administrator and the GSA-based Conditional Access policies with Conditional Access Administrator."));
      if (gsa.length) B.push(T(["Role", "Tier", "Eligible through"], gsa.map((r) => [r.name, TIER_LABEL[r.template] || r.template, (r.via || []).join(", ")])));
      return B;
    })();

    // 9 Regions
    if (prof.regions) ch.regions = (() => {
      const B = [], R = cat.regions || {}, TT = R.template || {};
      B.push(P("Regions are never in the catalog. The customer's regions file (one row per region) feeds a template; every object below is built per row, <REG> replaced by the row's code and the attribute, value, device prefix and Autopilot tag taken from the same row. Two levels of IT: global IT first, then regional IT — no local IT below a region."));
      B.push(SVG(regionSvg(TT, (input.regions && input.regions[0] && input.regions[0].code) || "EU-NL"), "One region as the template builds it", "One region as the template builds it."));
      B.push(T(["Unit", "Kind", "Members", "Rule"], (TT.aus || []).map((a) => [a.name, a.kind, a.type, a.rule || "assigned by the region"])));
      B.push(T(["Group", "Persona", "Membership", "Purpose"], (TT.groups || []).map((g) => [g.name, g.persona || "", g.template ? tmplText(g) : `plain security group${g.members ? `, members from ${g.members}` : ""}`, g.description || ""])));
      B.push(T(["Role", "Group", "At the unit"], (TT.eligibilities || []).map((e) => [e.role, e.group, e.au]), "Eligible at the region's unit, never tenant-wide — only the roles Entra can scope to an administrative unit."));
      if (TT.intune) B.push(T(["Intune object", "Detail"], [["Scope tag", `${TT.intune.tag ? `${TT.intune.tag.name}, auto-assigned from ${TT.intune.tag.autoAssignFrom}` : "—"}`], ...((TT.intune.groups || []).map((g) => [`Scope group ${g.name}`, g.rule || ""])), ...((TT.intune.assignments || []).map((a) => [`Assignment ${a.name}`, `${(a.roles || []).join(", ")} · members ${(a.members || []).join(", ")} · scope ${(a.scopeGroups || []).join(", ")} · tags ${(a.tags || []).join(", ")}`])), ...(TT.intune.autopilot ? [["Autopilot", `profile ${TT.intune.autopilot.profile} · naming ${TT.intune.autopilot.naming} · group tag ${TT.intune.autopilot.groupTag}`]] : [])]));
      if (TT.review) B.push(P(`Access review per region: ${TT.review.name} — ${TT.review.scope}; reviewer ${TT.review.reviewer || "the IT lead"}.`));
      B.push(H("The regions file"));
      B.push(P(`File ${R.file || "regions.csv"}; columns ${(R.columns || []).join(", ")}; required ${(R.required || []).join(" and ")}. The attribute must be extensionAttribute1 to 15 (it has to exist on users and devices alike), values land inside dynamic-membership rules so they carry no quotes or operators, and a row that fails a check is left out while the rest of the file loads.`));
      if (input.regions && input.regions.length) {
        B.push(H(`Your regions · ${input.regions.length}`));
        B.push(T(["Region", "Name", "Attribute", "Device prefix", "Autopilot tag", "IT lead", "Approvers", "Units · groups · eligibilities"], input.regions.map((row) => { let r = null; try { r = PB.region(cat, row); } catch (e) { r = { error: e.message || String(e) }; } return [row.code, row.name, `${row.attribute || ""} = ${row.value || ""}`, row.devicePrefix || "", row.autopilotTag || "", row.itLead || "", Array.isArray(row.approvers) ? row.approvers.join("; ") : (row.approvers || ""), r.error ? `not built: ${r.error}` : `${(r.aus || []).length} · ${(r.groups || []).length} · ${(r.eligibilities || []).length}`]; })));
      } else B.push(NOTE("No regions file is loaded for this tenant. Load it on 🧬 PIM baseline → Regions and this chapter lists every region's objects by name."));
      return B;
    })();

    // 10 Restricted units
    ch.rmau = (() => {
      const B = [];
      B.push(P("A restricted management administrative unit is a vault: inside it only administrators scoped on the unit can change the objects, and tenant-wide administrators cannot. That is right for executives and for sensitive groups that are not role-assignable, and wrong for everything PIM manages — PIM for Groups, access reviews and lifecycle workflows cannot reach objects in a restricted unit, and a role-assignable group inside one can no longer have its membership changed at all."));
      if (prof.rmau && prof.rmau.length) B.push(T(["Unit", "Restricted", "Holds"], prof.rmau.map((u) => [u.name, u.restricted ? "yes" : "no", u.holds || ""])));
      else B.push(P("This profile expects no restricted unit. 🛡 Administrative units still checks that no PIM object sits inside one the tenant has."));
      if (prof.scoped && prof.scoped.length) B.push(T(["Role", "Group", "Scoped on"], prof.scoped.map((x) => [x.role, x.group, x.au]), "The desk scoped on the unit: eligible for its roles at the unit, never tenant-wide."));
      B.push(UL([`Never inside a restricted unit: ${(cat.protection || []).filter((p) => p.rmau === false).map((p) => p.object).join("; ")}.`, prof.regions ? "Regional units (AU-<REG>-Users, -Devices, -Groups) are never restricted: regional administrators are scoped on them, central IT keeps access." : "Dynamic units cannot hold groups; a unit for groups is assigned by hand."]));
      return B;
    })();

    // 11 Conditional Access
    ch.ca = (() => {
      const B = [];
      const needsC1 = Object.entries(cat.templates).filter(([, t]) => t.AuthenticationContext_Enabled).map(([k]) => k);
      B.push(P(`${cat.authContext.description}`));
      B.push(T(["Where c1 is required", "Templates"], [[`${cat.authContext.id} · ${cat.authContext.name}`, needsC1.join(", ") || "none"]]));
      B.push(UL(["The policy that gates c1 lives in Workspace 01: target the authentication context c1, require an authentication strength (phishing-resistant MFA) and a compliant device, no exclusions but the break-glass accounts. Without an enabled policy the context asks nothing — 🚀 Deploy reports it as a finding and 🛡 Checks (PIM lens) verifies it.", "The admin accounts (adm-) sign in under their own Conditional Access policies: phishing-resistant MFA everywhere, no legacy authentication, a compliant or privileged access workstation. Those policies are the CloudFellows Conditional Access baseline's, not this document's.", "Approval by PIM-SG-Approvers is a second gate on top of the context, not a replacement for it."]));
      return B;
    })();

    // 12 Outside the browser
    ch.outside = (() => {
      const B = [];
      B.push(P("Everything PimBuddy can do from the browser it does from the browser: 🚀 Deploy creates the groups, the policies and the eligibilities after a WhatIf and the tenant's domain typed out. What stays outside:"));
      B.push(UL((cat.outside || []).slice()));
      B.push(UL(["Exchange and Purview role-group membership: the script 🚀 Deploy generates, run by an Exchange or Compliance administrator; its outcome file is read back by 📂 Import outcome.", "Defender XDR: the portal roles, their permission sets and the assignment to each PIM-SG-XDR group, in the Defender portal.", "SharePoint sites, Fabric workspaces and Dataverse environments: bound to their PIM-SG group per customer, by the script Deploy generates.", "People: active members of the role groups, eligible members of the access groups — added by an administrator or an access package, reviewed yearly."]));
      return B;
    })();

    const out = list.map((c, i) => ({ id: c.id, n: i + 1, title: c.title, blurb: c.blurb, blocks: ch[c.id] || [P("(nothing to say for this profile)")] }));
    const meta = {
      tenant: (input.tenant && input.tenant.name) || "", domain: domain || "", tenantId: (input.tenant && input.tenant.id) || "",
      catalog: { label: cat.label, release: cat.release, revised: cat.revised, tenant: cat.tenant }, profile: prof.label, profileId: prof.id, variant: cat.variant ? cat.variant.name : null,
      modules: (prof.modules || []).map((m) => (cat.modules[m] && cat.modules[m].label) || m), regions: input.regions ? input.regions.length : null,
      source: found ? "as designed + as found" : "as designed", readAt: found && res.readAt ? res.readAt : null, demo: !!input.demo, build: input.build || "", generatedAt: new Date().toISOString(),
      chapters: list.length, available: chapters(cat).length,
    };
    return { meta, chapters: out };
  }

  // ---- render (the page) ------------------------------------------------
  const blockHtml = (b) => {
    if (b.t === "p") return b.text ? `<p>${esc(b.text)}</p>` : "";
    if (b.t === "h") return `<h3>${esc(b.text)}</h3>`;
    if (b.t === "ul") return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    if (b.t === "ol") return `<ol>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
    if (b.t === "note") return `<p class="pdoc-note">${esc(b.text)}</p>`;
    if (b.t === "svg") return `<figure class="pdoc-fig">${b.svg}${b.caption ? `<figcaption class="mini">${esc(b.caption)}</figcaption>` : ""}</figure>`;
    if (b.t === "table") return `<div class="xt-tw"><table class="xt-tbl pdoc-tbl"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.length ? b.rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${b.head.length}" class="mini">nothing in this profile</td></tr>`}</tbody></table></div>${b.caption ? `<p class="mini pdoc-cap">${esc(b.caption)}</p>` : ""}`;
    return "";
  };
  // 32617 (Mihai: this should also be nicer, the layout — option A of the
  // mockup): a READING layout. A contents rail beside a white sheet; on a
  // narrow window the rail folds into a contents bar above it. The sheet opens
  // on a cover (the tenant, then framework / profile / modules / source as a
  // small table) instead of a second "PIM documentation" heading under the
  // tool's own; every chapter carries its blurb under the title and ends on
  // Back to the top and Next — as divs: the shell styles every header and
  // footer element as page chrome. Rail, bar, Back and Next are all data-pdcjump
  // links (rail and bar one per chapter), so app.js scrolls and highlights.
  const nn = (n) => String(n).padStart(2, "0");
  function render(doc) {
    const m = doc.meta, ch = doc.chapters, N = ch.length;
    const rail = `<nav class="pdoc-rail" aria-label="Contents"><div class="pdoc-rail-h">Contents</div><ol>${ch.map((c, i) => `<li><a href="#pdoc-${esc(c.id)}" class="pdoc-rl${i === 0 ? " on" : ""}" data-pdcjump="${esc(c.id)}"${i === 0 ? ' aria-current="true"' : ""}><span class="pdoc-rn">${nn(c.n)}</span><span>${esc(c.title)}</span></a></li>`).join("")}</ol><p class="pdoc-rail-f">${N} of ${m.available} chapters · ${esc(m.source)}</p></nav>`;
    const bar = `<details class="pdoc-bar"><summary><span class="pdoc-bar-n">${nn(ch[0].n)} / ${nn(N)}</span><span class="pdoc-bar-t">${esc(ch[0].title)}</span></summary><ol>${ch.map((c) => `<li><a href="#pdoc-${esc(c.id)}" class="pdoc-bl" data-pdcjump="${esc(c.id)}"><span class="pdoc-rn">${nn(c.n)}</span> ${esc(c.title)}</a></li>`).join("")}</ol></details>`;
    const cell = (k, v) => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : "");
    const cover = `<div class="pdoc-cover" id="pdoc-top"><div class="pdoc-eyebrow">PIM handover${m.demo ? " · demo data" : ""}</div><h2 class="pdoc-title">${esc(m.tenant || "This tenant")}</h2>`
      + `<dl class="pdoc-meta">${cell("Framework", `${m.catalog.label} ${m.catalog.release} · revised ${m.catalog.revised}`)}${cell("Profile", `${m.profile}${m.variant ? ` · variant ${m.variant}` : ""}`)}${cell("Modules", m.modules.length ? m.modules.join(", ") : "none switched on")}`
      + `${cell("Source", `${m.source}${m.readAt ? ` · tenant read ${new Date(m.readAt).toLocaleString()}` : ""}`)}${cell("Authored in", m.catalog.tenant)}${m.regions != null ? cell("Regions", String(m.regions)) : ""}${cell("Chapters", `${N} of ${m.available}`)}</dl></div>`;
    const body = ch.map((c, i) => {
      const next = ch[i + 1];
      const foot = `<div class="pdoc-chnav"><a href="#pdoc-top" data-pdcto="top">Back to the top</a>${next ? `<a href="#pdoc-${esc(next.id)}" data-pdcto="${esc(next.id)}">Next · ${nn(next.n)} ${esc(next.title)}</a>` : ""}</div>`;
      return `<section class="pdoc-ch" id="pdoc-${esc(c.id)}"><h2><span class="pdoc-n">${nn(c.n)}</span> ${esc(c.title)}</h2>${c.blurb ? `<p class="pdoc-blurb">${esc(c.blurb.charAt(0).toUpperCase() + c.blurb.slice(1))}</p>` : ""}${c.blocks.map(blockHtml).join("")}${foot}</section>`;
    }).join("");
    return `<div class="pdoc">${rail}<div class="pdoc-main">${bar}<article class="pdoc-sheet">${cover}${body}</article></div></div>`;
  }

  // ---- Markdown -----------------------------------------------------------
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
  const blockMd = (b, L) => {
    if (b.t === "p") { if (b.text) L.push(b.text, ""); }
    else if (b.t === "h") L.push(`## ${b.text}`, "");
    else if (b.t === "ul") { b.items.forEach((i) => L.push(`- ${i}`)); L.push(""); }
    else if (b.t === "ol") { b.items.forEach((i, n) => L.push(`${n + 1}. ${i}`)); L.push(""); }
    else if (b.t === "note") L.push(`> ${b.text}`, "");
    else if (b.t === "svg") L.push(`![${mdc(b.alt || "diagram")}](${dataUri(b.svg)})`, "", ...(b.caption ? [`*${b.caption}*`, ""] : []));
    else if (b.t === "table") { L.push(`| ${b.head.map(mdc).join(" | ")} |`, `|${b.head.map(() => "---").join("|")}|`); b.rows.forEach((r) => L.push(`| ${r.map(mdc).join(" | ")} |`)); if (b.caption) L.push("", `*${b.caption}*`); L.push(""); }
  };
  function toMd(doc) {
    const m = doc.meta, L = [];
    L.push(`# 📄 PimBuddy PIM documentation — ${m.tenant || "tenant"} · ${m.profile}`, "");
    L.push(`*${m.catalog.label} ${m.catalog.release} as it applies to this tenant — ${m.source}*`, "");
    L.push("| | |", "|---|---|");
    L.push(`| Tenant | ${mdc(m.tenant || "—")}${m.domain ? ` (${mdc(m.domain)})` : ""}${m.tenantId && !m.demo ? ` · ${mdc(m.tenantId)}` : ""} |`);
    L.push(`| Catalog | ${mdc(m.catalog.label)} ${mdc(m.catalog.release)}, revised ${mdc(m.catalog.revised)}, authored in ${mdc(m.catalog.tenant)} |`);
    L.push(`| Profile | ${mdc(m.profile)}${m.variant ? ` · variant ${mdc(m.variant)}` : ""} |`);
    L.push(`| Modules | ${m.modules.length ? mdc(m.modules.join(", ")) : "none"} |`);
    if (m.regions != null) L.push(`| Regions | ${m.regions} |`);
    L.push(`| Source | ${mdc(m.source)}${m.readAt ? `, tenant read ${new Date(m.readAt).toISOString().replace("T", " ").slice(0, 16)} UTC` : ""} |`);
    L.push(`| Generated | ${m.generatedAt.replace("T", " ").slice(0, 16)} UTC by ENCA ${mdc(m.build)} T58${m.demo ? " · demo data" : ""} |`, "");
    L.push("## Contents", "");
    doc.chapters.forEach((c) => L.push(`${c.n}. [${c.title}](#${c.n}-${slug(c.title)})`));
    L.push("");
    doc.chapters.forEach((c) => { L.push(`# ${c.n} ${c.title}`, ""); c.blocks.forEach((b) => blockMd(b, L)); });
    return L.join("\n");
  }

  return { CHAPTERS, chapters, build, render, toMd, flowSvg, tiersSvg, regionSvg, human, settingText, foundRole, foundGroup };
})();
if (typeof module !== "undefined") module.exports = PimDoc;
