// ======================================================================
// Restricted AUs — manage restricted management administrative units.
//   https://learn.microsoft.com/entra/identity/role-based-access-control/admin-units-restricted-management
//
// An RMAU is an administrative unit created with
// isMemberManagementRestricted: true — that flag is IMMUTABLE: it cannot be
// added to or removed from an existing AU, so "convert" means recreate.
// Objects inside an RMAU can only be managed by roles scoped TO that AU —
// tenant-wide admins are locked out of the members, which is the point:
// ENCA's ⑥ Protect flow uses one to shield CA exclusion groups.
//
// Graph shapes used here:
//   list      GET    /administrativeUnits
//   members   GET    /administrativeUnits/{id}/members
//   add       POST   /administrativeUnits/{id}/members/$ref   {@odata.id}
//   remove    DELETE /administrativeUnits/{id}/members/{mid}/$ref
//   edit      PATCH  /administrativeUnits/{id}   (displayName/description)
//   delete    DELETE /administrativeUnits/{id}   (members survive, unscoped)
//   scoped    GET/POST/DELETE /administrativeUnits/{id}/scopedRoleMembers
//             (roleId = the ACTIVATED directory-role object id)
// Reads ride Directory.Read.All; writes need AdministrativeUnit.ReadWrite.All
// (+ RoleManagement.ReadWrite.Directory for scoped role grants). Creating an
// RMAU, and often touching its members, needs Privileged Role Administrator
// or a role scoped to the AU — Graph's 403 is surfaced, not guessed at.
// ======================================================================
const Rmau = (() => {
  // Directory-role templates offered for scoped grants — the ones that make
  // sense at AU scope. Anything else can be granted from the Entra portal.
  const ROLE_TEMPLATES = [
    { id: "fdd7a751-b60b-444a-984c-02652fe8fa1c", name: "Groups Administrator" },
    { id: "fe930be7-5e62-47db-91af-98c3a49a38b1", name: "User Administrator" },
    { id: "729827e3-9c14-49f7-bb1b-9608f156bbb8", name: "Helpdesk Administrator" },
    { id: "4d6ac14f-3453-41d0-bef9-a3e0c569773a", name: "License Administrator" },
  ];

  const isRestricted = (au) => au.isMemberManagementRestricted === true;

  const memberType = (m) => {
    const t = String(m["@odata.type"] || "").toLowerCase();
    if (t.includes("group")) return "group";
    if (t.includes("user")) return "user";
    if (t.includes("device")) return "device";
    return "object";
  };

  // Which member groups are referenced by the loaded CA policies (include or
  // exclude) — the reason most of these AUs exist in an ENCA tenant.
  function caRefs(memberId, raws) {
    const out = [];
    for (const p of raws || []) {
      const u = (p.conditions || {}).users || {};
      if ((u.excludeGroups || []).includes(memberId)) out.push({ id: p.id, name: p.displayName, how: "excluded" });
      else if ((u.includeGroups || []).includes(memberId)) out.push({ id: p.id, name: p.displayName, how: "included" });
    }
    return out;
  }

  function summarize(list) {
    const l = list || [];
    return { total: l.length, restricted: l.filter(isRestricted).length, standard: l.filter((a) => !isRestricted(a)).length };
  }

  function buildPayload(form) {
    const errors = [];
    const name = String(form.name || "").trim();
    if (!name) errors.push("A display name is required.");
    if (name.length > 256) errors.push("Keep the display name at 256 characters or less.");
    if (errors.length) return { ok: false, errors };
    const payload = { displayName: name, description: String(form.description || "").trim() || null };
    if (form.creating && form.restricted) payload.isMemberManagementRestricted = true;
    return { ok: true, errors, payload };
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(list, details, meta = {}) {
    const s = summarize(list);
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = [`# Restricted management administrative units — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `- Administrative units: **${s.total}** — ${s.restricted} restricted, ${s.standard} standard`, ""];
    for (const au of (list || []).slice().sort((a, b) => (isRestricted(b) ? 1 : 0) - (isRestricted(a) ? 1 : 0) || (a.displayName || "").localeCompare(b.displayName || ""))) {
      const d = (details || {})[au.id] || {};
      L.push(`## ${mdEsc(au.displayName)}${isRestricted(au) ? " 🔒 (restricted)" : ""}`, "");
      if (au.description) L.push(mdEsc(au.description), "");
      L.push(`- id \`${au.id}\`${au.visibility ? ` · visibility: ${au.visibility}` : ""}`);
      if (d.members) {
        L.push(`- Members (${d.members.length}):`);
        for (const m of d.members) L.push(`  - ${mdEsc(m.displayName || m.userPrincipalName || m.id)} _(${memberType(m)})_${(m._caRefs || []).length ? ` — ${m._caRefs.length} CA polic${m._caRefs.length === 1 ? "y" : "ies"} reference it` : ""}`);
      }
      if (d.scoped) {
        L.push(`- Scoped role members (${d.scoped.length}):`);
        for (const r of d.scoped) L.push(`  - ${mdEsc(r._principal || r.roleMemberInfo?.displayName || r.roleMemberInfo?.id)} — ${mdEsc(r._roleName || r.roleId)}`);
      }
      L.push("");
    }
    L.push("The isMemberManagementRestricted flag is immutable — an existing AU cannot be converted either way. Members of a restricted AU can only be managed by roles scoped to that AU.", "");
    return L.join("\n");
  }

  const BASELINE_AUS = [
    { code: "GLO",         label: "Global",                  caRange: "CA000–CA099" },
    { code: "ADM",         label: "Admins",                  caRange: "CA100–CA199" },
    { code: "INT",         label: "Internals",               caRange: "CA200–CA299" },
    { code: "EXT",         label: "Externals",               caRange: "CA300–CA399" },
    { code: "GUESTUSERS",  label: "Guest users",             caRange: "CA400–CA499" },
    { code: "GUESTAdmins", label: "Guest admins",            caRange: "CA500–CA599" },
    { code: "SA",          label: "Service accounts",        caRange: "CA600–CA899" },
    { code: "DevOps",      label: "DevOps",                  caRange: "CA1000–CA1099" },
    { code: "FW",          label: "Frontline workers",       caRange: "" },
  ];
  const auName = (code) => `CAB-SEC-RMAU-${code}-Exclusions`;
  const auDescription = (a) => `Restricted management administrative unit for the ${a.label} Conditional Access exclusion groups${a.caRange ? ` (${a.caRange})` : ""}. Membership changes require a role scoped to this administrative unit.`;

  // Compare the catalog with what the tenant has. `aus` is the /administrativeUnits
  // read (id, displayName, isMemberManagementRestricted).
  //
  // Three outcomes, and the third is the one that matters: an AU that exists
  // under the right name but is NOT restricted cannot be fixed — the flag is
  // immutable — so it is reported as a conflict rather than silently counted
  // as present, which would leave the persona unprotected while looking done.
  function baselineCheck(aus) {
    const byName = new Map((aus || []).map((a) => [String(a.displayName || "").toLowerCase(), a]));
    const rows = BASELINE_AUS.map((a) => {
      const name = auName(a.code);
      const hit = byName.get(name.toLowerCase());
      return {
        ...a, name,
        description: auDescription(a),
        au: hit || null,
        // The id of the matching unit, so a caller that wants to add members to
        // it does not have to reach through .au and get undefined in silence.
        id: hit ? hit.id : null,
        status: !hit ? "missing" : (hit.isMemberManagementRestricted === true ? "present" : "unrestricted"),
      };
    });
    return {
      rows,
      missing: rows.filter((r) => r.status === "missing"),
      present: rows.filter((r) => r.status === "present"),
      unrestricted: rows.filter((r) => r.status === "unrestricted"),
    };
  }

  function baselineReport(check, results, meta = {}) {
    const L = [`# Persona restricted administrative units`, "",
      `**Tenant:** ${meta.tenant || "—"}  `,
      `**Generated by:** ${meta.build || ""}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `One restricted management administrative unit per persona, so a scoped administrator for one persona's exclusion groups cannot edit another's.`, "",
      `| Administrative unit | Persona | Status | Scoped admin |`, `| --- | --- | --- | --- |`];
    for (const r of check.rows) {
      const res = (results || []).find((x) => x.name === r.name);
      const status = res ? (res.ok ? "created" : `FAILED — ${res.error}`)
        : r.status === "present" ? "already present"
        : r.status === "unrestricted" ? "**name taken by a NON-restricted AU**" : "missing";
      L.push(`| ${r.name} | ${r.label} | ${status} | ${res ? (res.adminOk ? res.admin : (res.adminError ? `not granted — ${res.adminError}` : "—")) : "—"} |`);
    }
    L.push("");
    if (check.unrestricted.length) {
      L.push(`## Conflicts`, "");
      L.push(`${check.unrestricted.length} administrative unit${check.unrestricted.length === 1 ? " exists" : "s exist"} under the expected name but **without** the restricted-management flag. That flag is set at creation and is immutable, so these cannot be upgraded — rename the existing one and create a restricted replacement, or adopt a different name for the persona.`, "");
      for (const r of check.unrestricted) L.push(`- ${r.name}`);
      L.push("");
    }
    L.push(`_An administrative unit with no scoped administrator is a vault nobody can open: tenant-wide roles are blocked by design, so somebody must hold a role scoped to it._`);
    return L.join("\n");
  }

  return { ROLE_TEMPLATES, isRestricted, memberType, caRefs, summarize, buildPayload, toMd,
    BASELINE_AUS, auName, auDescription, baselineCheck, baselineReport };
})();
