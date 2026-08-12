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

  return { ROLE_TEMPLATES, isRestricted, memberType, caRefs, summarize, buildPayload, toMd };
})();
