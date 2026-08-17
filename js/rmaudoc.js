// ======================================================================
// R27 — restricted-administrative-unit documentation.
//
// Pure/portable contract: this module performs no Graph calls, touches no DOM
// and reads no ENCA globals. A host supplies plain objects from:
//   units              /administrativeUnits
//   detailsById[id]    { members, scoped, membersError, scopedError }
//   rawPolicies        Conditional Access policy JSON (the WHOLE tenant)
//   directoryRoles     activated role id -> role template id
//   roleDefinitions    rolePermissions.allowedResourceActions
//   baselineAUs        optional persona catalog [{code,label,caRange,name}]
//
// build() returns a plain documentation model. overviewHtml(), unitHtml() and
// markdown() are pure renderers over that model. The app/exporter are only
// adapters; an unavailable adapter must never cost the core policy document.
// ======================================================================
const RmauDoc = (() => {
  const clean = (v) => String(v ?? "").trim();
  const htmlEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
  const mdEsc = (v) => clean(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];

  function objectType(m) {
    const t = clean(m && m["@odata.type"]).toLowerCase();
    if (t.includes("group")) return "group";
    if (t.includes("user")) return "user";
    if (t.includes("device")) return "device";
    return "object";
  }

  function policyRefs(memberId, rawPolicies) {
    const refs = [];
    for (const p of rawPolicies || []) {
      const users = (p.conditions || {}).users || {};
      const name = clean(p.displayName || p.name || p.id) || "Unnamed policy";
      if ((users.excludeGroups || []).includes(memberId)) refs.push({ how: "excluded", name, id: p.id || "", state: p.state || "" });
      if ((users.includeGroups || []).includes(memberId)) refs.push({ how: "included", name, id: p.id || "", state: p.state || "" });
    }
    return refs.sort((a, b) => a.name.localeCompare(b.name) || a.how.localeCompare(b.how));
  }

  function baselineName(entry) {
    return clean(entry.name) || `CAB-SEC-RMAU-${entry.code}-Exclusions`;
  }

  function personaFor(au, baselineAUs) {
    const name = clean(au.displayName).toLowerCase();
    const ix = (baselineAUs || []).findIndex((p) => baselineName(p).toLowerCase() === name);
    if (ix < 0) return { code: "", label: "Custom / unclassified", caRange: "", order: 9999 };
    const p = baselineAUs[ix];
    return { code: p.code || "", label: p.label || p.code || "Persona", caRange: p.caRange || "", order: ix };
  }

  function allowedActions(definition) {
    return uniq((definition && definition.rolePermissions || [])
      .flatMap((p) => p && p.allowedResourceActions || [])
      .map((a) => clean(a).toLowerCase()));
  }

  // Role names are never used as a capability heuristic. Only the role
  // definition's allowedResourceActions can prove this answer.
  function groupMemberCapability(definition) {
    if (!definition) return null;
    const actions = allowedActions(definition);
    return actions.some((a) =>
      /^microsoft\.directory\/groups\/(members\/)?(update|alltasks|\*)$/i.test(a)
      || /^microsoft\.directory\/groups\/members\/(update|alltasks|\*)$/i.test(a));
  }

  function roleLookups(directoryRoles, roleDefinitions) {
    const active = new Map();
    for (const r of directoryRoles || []) if (r && r.id) active.set(r.id, r);
    const definitions = new Map();
    for (const d of roleDefinitions || []) {
      if (!d) continue;
      for (const k of [d.id, d.templateId, d.roleTemplateId].filter(Boolean)) definitions.set(k, d);
    }
    return { active, definitions };
  }

  function scopedRole(row, lookups) {
    const active = lookups.active.get(row.roleId) || null;
    const definition = lookups.definitions.get(row.roleId)
      || (active && lookups.definitions.get(active.roleTemplateId || active.templateId)) || null;
    const principal = clean(row._principal || (row.roleMemberInfo || {}).displayName
      || (row.roleMemberInfo || {}).userPrincipalName || (row.roleMemberInfo || {}).id) || "Unknown principal";
    const role = clean(row._roleName || (active || {}).displayName || (definition || {}).displayName || row.roleId) || "Unknown role";
    return {
      id: row.id || "", principal, role, roleId: row.roleId || "",
      canUpdateMembers: groupMemberCapability(definition),
      definitionFound: !!definition,
    };
  }

  function build(input = {}) {
    const generatedAt = input.generatedAt || new Date().toISOString();
    const doc = {
      tenant: clean(input.tenant) || "tenant",
      build: clean(input.build),
      generatedAt,
      readError: clean(input.readError),
      roleMetadata: {
        directoryRolesError: clean(input.directoryRolesError),
        roleDefinitionsError: clean(input.roleDefinitionsError),
      },
      units: [], findings: [],
      summary: { units: 0, noAdmin: 0, frozenGroups: 0, emptyUnits: 0, unreadableUnits: 0, exclusionDependencies: 0 },
    };

    if (doc.readError || !Array.isArray(input.units)) {
      doc.readError ||= "The restricted administrative units could not be read.";
      doc.findings.push({ level: "unknown", code: "not-captured", unit: "", text: `Restricted-unit appendix not captured: ${doc.readError}` });
      return doc;
    }

    const lookups = roleLookups(input.directoryRoles, input.roleDefinitions);
    const details = input.detailsById || {};
    doc.units = input.units.filter((a) => a && a.isMemberManagementRestricted === true).map((au) => {
      const d = details[au.id] || {};
      const persona = personaFor(au, input.baselineAUs);
      const membersRead = Array.isArray(d.members) && !clean(d.membersError || d.memberError);
      const scopedRead = Array.isArray(d.scoped) && !clean(d.scopedError);
      const members = membersRead ? d.members.map((m) => {
        const type = objectType(m);
        const refs = type === "group" ? policyRefs(m.id, input.rawPolicies) : [];
        return {
          id: m.id || "", name: clean(m.displayName || m.userPrincipalName || m.id) || "Unnamed object",
          type, frozen: type === "group" && m.isAssignableToRole === true,
          included: refs.filter((r) => r.how === "included"),
          excluded: refs.filter((r) => r.how === "excluded"),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const scoped = scopedRead ? d.scoped.map((r) => scopedRole(r, lookups))
        .sort((a, b) => a.principal.localeCompare(b.principal) || a.role.localeCompare(b.role)) : [];
      const findings = [];
      if (!membersRead) findings.push({ level: "unknown", code: "members-unreadable", text: `Protected objects not captured: ${clean(d.membersError || d.memberError) || "the member read did not complete"}.` });
      else if (!members.length) findings.push({ level: "info", code: "empty", text: "This restricted unit is empty; it currently protects no object." });
      if (!scopedRead) findings.push({ level: "unknown", code: "scoped-unreadable", text: `Scoped administrators not captured: ${clean(d.scopedError) || "the scoped-role read did not complete"}.` });
      else if (!scoped.length) findings.push({ level: "high", code: "no-admin", text: "Nobody is scoped to this unit. Tenant-wide roles are blocked, so its protected groups cannot be managed until a suitable scoped role is granted." });
      for (const m of members.filter((x) => x.frozen)) findings.push({ level: "high", code: "frozen", text: `${m.name} is role-assignable inside a restricted unit. The two protections combine into a frozen group whose membership nobody can change.` });
      if (scopedRead && scoped.length && scoped.every((r) => r.canUpdateMembers === false)) {
        findings.push({ level: "high", code: "no-membership-role", text: "Scoped roles were found, but every readable role definition lacks the group-membership update action." });
      }
      if (scopedRead && scoped.some((r) => r.canUpdateMembers === null)) {
        findings.push({ level: "unknown", code: "capability-unverified", text: "At least one scoped role could not be matched to a readable role definition; its group-membership capability is unverified." });
      }
      for (const m of members.filter((x) => x.type === "group" && !x.included.length && !x.excluded.length)) {
        findings.push({ level: "info", code: "no-policy-reference", text: `${m.name} is protected here but no loaded Conditional Access policy includes or excludes it.` });
      }
      const excludedPolicies = uniq(members.flatMap((m) => m.excluded.map((r) => r.name))).sort();
      const includedPolicies = uniq(members.flatMap((m) => m.included.map((r) => r.name))).sort();
      const wideners = scoped.filter((r) => r.canUpdateMembers === true);
      const unit = {
        id: au.id || "", name: clean(au.displayName || au.id) || "Unnamed restricted unit",
        description: clean(au.description).replace(/\[enca:extra=[^\]]*\]/ig, "").trim(),
        persona, membersRead, scopedRead,
        membersError: clean(d.membersError || d.memberError), scopedError: clean(d.scopedError),
        members, scoped, wideners, excludedPolicies, includedPolicies, findings,
      };
      return unit;
    }).sort((a, b) => a.persona.order - b.persona.order || a.name.localeCompare(b.name));

    doc.summary.units = doc.units.length;
    doc.summary.noAdmin = doc.units.filter((u) => u.scopedRead && !u.scoped.length).length;
    doc.summary.frozenGroups = doc.units.reduce((n, u) => n + u.members.filter((m) => m.frozen).length, 0);
    doc.summary.emptyUnits = doc.units.filter((u) => u.membersRead && !u.members.length).length;
    doc.summary.unreadableUnits = doc.units.filter((u) => !u.membersRead || !u.scopedRead).length;
    doc.summary.exclusionDependencies = doc.units.reduce((n, u) => n + u.members.reduce((m, x) => m + x.excluded.length, 0), 0);
    doc.findings = doc.units.flatMap((u) => u.findings.map((f) => ({ ...f, unit: u.name })));
    if (!doc.units.length) doc.findings.push({ level: "info", code: "none", unit: "", text: "No restricted management administrative unit was found in the tenant." });
    if (doc.roleMetadata.roleDefinitionsError) doc.findings.push({ level: "unknown", code: "role-definitions-unreadable", unit: "", text: `Role definitions not captured: ${doc.roleMetadata.roleDefinitionsError}. Scoped people and role names remain listed, but membership capability is unverified.` });
    return doc;
  }

  const findingIcon = (level) => level === "high" ? "⚠" : level === "unknown" ? "?" : "ℹ";
  const findingClass = (level) => level === "high" ? "block" : level === "unknown" ? "new" : "";
  const footer = (doc) => `<div class="pcard-foot"><span class="mini">Conditional Access documentation · ${htmlEsc(doc.tenant)} · ${htmlEsc(clean(doc.generatedAt).slice(0, 10))}</span></div>`;

  function overviewHtml(doc) {
    const s = doc.summary || {};
    const findings = (doc.findings || []).length
      ? `<ul>${doc.findings.map((f) => `<li><span class="tag ${findingClass(f.level)}">${findingIcon(f.level)} ${htmlEsc(f.level)}</span> ${f.unit ? `<b>${htmlEsc(f.unit)}:</b> ` : ""}${htmlEsc(f.text)}</li>`).join("")}</ul>`
      : '<ul><li><span class="tag grant">✓ no findings</span> No restricted-unit control failure was found in the data captured.</li></ul>';
    return `<div class="pcard neutral" data-rmau-doc="overview">
      <div class="pcard-head"><div style="flex:1"><h3>Restricted administrative units — review overview</h3>
        <div class="meta">${htmlEsc(doc.tenant)} · generated ${htmlEsc(clean(doc.generatedAt).slice(0, 10))}${doc.build ? ` · ${htmlEsc(doc.build)}` : ""}</div></div>
        <span class="tag">${s.units || 0} restricted unit${s.units === 1 ? "" : "s"}</span></div>
      <div class="pcard-grid">
        <div class="sect wide"><h4>Why this control matters</h4><p class="mini" style="margin:0">Adding a person to a Conditional Access exclusion group can remove protection without changing a policy. A restricted management administrative unit blocks tenant-wide administrators from changing the objects inside it; only a suitable role scoped to that unit can do so. This appendix records who can reach that path and which policies it affects.</p></div>
        <div class="sect"><h4>Who could widen an exclusion</h4><ul><li><b>${s.noAdmin || 0}</b> unit${s.noAdmin === 1 ? "" : "s"} with nobody scoped</li><li><b>${s.unreadableUnits || 0}</b> unit${s.unreadableUnits === 1 ? "" : "s"} partly unreadable</li></ul></div>
        <div class="sect"><h4>What is protected</h4><ul><li><b>${s.emptyUnits || 0}</b> empty unit${s.emptyUnits === 1 ? "" : "s"}</li><li><b>${s.frozenGroups || 0}</b> frozen group${s.frozenGroups === 1 ? "" : "s"}</li></ul></div>
        <div class="sect"><h4>What widening would affect</h4><ul><li><b>${s.exclusionDependencies || 0}</b> group × excluded-policy dependenc${s.exclusionDependencies === 1 ? "y" : "ies"}</li><li>Calculated from all loaded tenant policies</li></ul></div>
        <div class="sect wide"><h4>Findings and unknowns</h4>${findings}</div>
      </div>${footer(doc)}</div>`;
  }

  function capabilityHtml(r) {
    if (r.canUpdateMembers === true) return '<span class="tag block">can update group members</span>';
    if (r.canUpdateMembers === false) return '<span class="tag grant">no group-member update action</span>';
    return '<span class="tag new">capability unverified</span>';
  }

  function unitHtml(doc, unit) {
    const protectedHtml = !unit.membersRead
      ? `<ul><li class="na">Not captured: ${htmlEsc(unit.membersError || "member read did not complete")}</li></ul>`
      : !unit.members.length ? '<ul><li class="na">This unit is empty.</li></ul>'
      : `<ul>${unit.members.map((m) => `<li><b>${htmlEsc(m.name)}</b> <span class="tag">${htmlEsc(m.type)}</span>${m.frozen ? '<span class="tag block">frozen</span>' : ""}
          ${m.excluded.length ? `<div class="mini" style="color:var(--off)">Excluded from: ${htmlEsc(m.excluded.map((r) => r.name).join(" · "))}</div>` : ""}
          ${m.included.length ? `<div class="mini">Included by: ${htmlEsc(m.included.map((r) => r.name).join(" · "))}</div>` : ""}
          ${!m.excluded.length && !m.included.length && m.type === "group" ? '<div class="mini muted">No loaded CA policy references this group.</div>' : ""}</li>`).join("")}</ul>`;
    const scopedHtml = !unit.scopedRead
      ? `<ul><li class="na">Not captured: ${htmlEsc(unit.scopedError || "scoped-role read did not complete")}</li></ul>`
      : !unit.scoped.length ? '<ul><li><span class="tag block">nobody scoped</span> Tenant-wide roles cannot manage this unit.</li></ul>'
      : `<ul>${unit.scoped.map((r) => `<li><b>${htmlEsc(r.principal)}</b><div class="mini">${htmlEsc(r.role)} · ${capabilityHtml(r)}</div></li>`).join("")}</ul>`;
    const effectHtml = !unit.membersRead
      ? '<ul><li class="na">Unknown until protected objects can be read.</li></ul>'
      : `<ul>${unit.excludedPolicies.length
        ? `<li><b>Adding a member to an exclusion group can remove them from:</b></li>${unit.excludedPolicies.map((n) => `<li class="excl">${htmlEsc(n)}</li>`).join("")}`
        : '<li class="na">No excluded-policy dependency was found.</li>'}
        ${unit.includedPolicies.length ? `<li style="margin-top:6px"><b>The unit also holds groups targeted by:</b></li>${unit.includedPolicies.map((n) => `<li>${htmlEsc(n)}</li>`).join("")}` : ""}</ul>`;
    const findings = unit.findings.length
      ? `<div class="sect wide"><h4>Review findings</h4><ul>${unit.findings.map((f) => `<li><span class="tag ${findingClass(f.level)}">${findingIcon(f.level)} ${htmlEsc(f.level)}</span> ${htmlEsc(f.text)}</li>`).join("")}</ul></div>` : "";
    return `<div class="pcard neutral" data-rmau-doc="${htmlEsc(unit.id)}">
      <div class="pcard-head"><div style="flex:1"><h3>${htmlEsc(unit.name)}</h3>
        <div class="meta">${htmlEsc(unit.persona.label)}${unit.persona.caRange ? ` · ${htmlEsc(unit.persona.caRange)}` : ""} · ${htmlEsc(doc.tenant)}</div></div>
        <span class="tag">restricted</span></div>
      <div class="pcard-grid">
        ${unit.description ? `<div class="sect wide"><h4>Purpose recorded on the unit</h4><p class="mini" style="margin:0">${htmlEsc(unit.description)}</p></div>` : ""}
        <div class="sect"><h4>What it protects</h4>${protectedHtml}</div>
        <div class="sect"><h4>Who could widen an exclusion</h4>${scopedHtml}</div>
        <div class="sect"><h4>What would happen if they did</h4>${effectHtml}</div>
        ${findings}
        <div class="sect wide"><h4>Auditor questions</h4><ul><li>Is every person with a membership-capable scoped role expected and reviewed?</li><li>Does each protected group belong to this persona's vault?</li><li>Are the excluded policies above the intended blast radius of one membership change?</li></ul></div>
      </div>${footer(doc)}</div>`;
  }

  function markdown(doc) {
    const s = doc.summary || {};
    const out = ["## Restricted administrative units", "",
      `**Units:** ${s.units || 0}  `,
      `**Nobody scoped:** ${s.noAdmin || 0}  `,
      `**Frozen groups:** ${s.frozenGroups || 0}  `,
      `**Unreadable units:** ${s.unreadableUnits || 0}  `,
      `**Excluded-policy dependencies:** ${s.exclusionDependencies || 0}`, "",
      "Adding a person to a Conditional Access exclusion group can remove protection without changing a policy. These pages record who can change the protected groups and which policies that path affects.", ""];
    if (doc.readError) out.push(`> **Restricted-unit appendix not captured:** ${mdEsc(doc.readError)}`, "");
    if ((doc.findings || []).length) {
      out.push("### Findings and unknowns", "");
      for (const f of doc.findings) out.push(`- **${findingIcon(f.level)} ${mdEsc(f.level)}${f.unit ? ` — ${mdEsc(f.unit)}` : ""}:** ${mdEsc(f.text)}`);
      out.push("");
    }
    for (const unit of doc.units || []) {
      out.push(`### ${mdEsc(unit.name)}`, "",
        `**Persona:** ${mdEsc(unit.persona.label)}${unit.persona.caRange ? ` · ${mdEsc(unit.persona.caRange)}` : ""}  `,
        `**Unit ID:** \`${mdEsc(unit.id)}\``, "");
      if (unit.description) out.push(mdEsc(unit.description), "");
      out.push("#### What it protects", "");
      if (!unit.membersRead) out.push(`_Not captured: ${mdEsc(unit.membersError || "member read did not complete")}._`, "");
      else if (!unit.members.length) out.push("_This unit is empty._", "");
      else {
        for (const m of unit.members) {
          out.push(`- **${mdEsc(m.name)}** (${mdEsc(m.type)})${m.frozen ? " — **FROZEN**" : ""}`);
          if (m.excluded.length) out.push(`  - Excluded from: ${m.excluded.map((r) => mdEsc(r.name)).join("; ")}`);
          if (m.included.length) out.push(`  - Included by: ${m.included.map((r) => mdEsc(r.name)).join("; ")}`);
          if (!m.excluded.length && !m.included.length && m.type === "group") out.push("  - No loaded Conditional Access policy references this group.");
        }
        out.push("");
      }
      out.push("#### Who could widen an exclusion", "");
      if (!unit.scopedRead) out.push(`_Not captured: ${mdEsc(unit.scopedError || "scoped-role read did not complete")}._`, "");
      else if (!unit.scoped.length) out.push("**Nobody is scoped to this unit.** Tenant-wide roles cannot manage it.", "");
      else {
        out.push("| Person | Scoped role | Group-member update |", "|---|---|---|");
        for (const r of unit.scoped) out.push(`| ${mdEsc(r.principal)} | ${mdEsc(r.role)} | ${r.canUpdateMembers === true ? "verified: yes" : r.canUpdateMembers === false ? "verified: no" : "unverified"} |`);
        out.push("");
      }
      out.push("#### What would happen if they did", "");
      if (!unit.membersRead) out.push("_Unknown until protected objects can be read._", "");
      else if (!unit.excludedPolicies.length) out.push("No excluded-policy dependency was found.", "");
      else {
        out.push("Adding a member to an exclusion group in this unit can remove that person from:", "");
        unit.excludedPolicies.forEach((n) => out.push(`- ${mdEsc(n)}`));
        out.push("");
      }
    }
    return out.join("\n");
  }

  function pages(doc) {
    return [
      { name: "Restricted administrative units — overview", html: overviewHtml(doc) },
      ...(doc.units || []).map((u) => ({ name: u.name, html: unitHtml(doc, u) })),
    ];
  }

  return { build, overviewHtml, unitHtml, markdown, pages, groupMemberCapability };
})();
