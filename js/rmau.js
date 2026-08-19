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
    return {
    total: l.length, restricted: l.filter(isRestricted).length, standard: l.filter((a) => !isRestricted(a)).length };
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
      // Names first. The object id is real information for a support case but
      // it is the least interesting fact about a unit, and leading with it —
      // which is what this did — made a document of GUIDs.
      if (d.members) {
        L.push(d.members.length ? `- **Protected members (${d.members.length})**` : "- **Protected members:** none — this unit shields nothing yet.");
        for (const m of d.members) {
          const frozen = isRestricted(au) && m.isAssignableToRole === true;
          L.push(`  - ${mdEsc(m.displayName || m.userPrincipalName || m.id)} _(${memberType(m)})_`
            + `${(m._caRefs || []).length ? ` — ${m._caRefs.length} CA polic${m._caRefs.length === 1 ? "y" : "ies"} reference it` : ""}`
            + `${frozen ? " — ⚠ **frozen**: role-assignable inside a restricted unit, so nobody can change its members" : ""}`);
        }
      }
      if (d.scoped) {
        L.push(d.scoped.length
          ? `- **Who may manage them (${d.scoped.length})**`
          : "- **Who may manage them:** ⚠ nobody. No role is scoped to this unit, so its members cannot be changed by anyone.");
        for (const r of d.scoped) L.push(`  - ${mdEsc(r._principal || r.roleMemberInfo?.displayName || r.roleMemberInfo?.id)} — ${mdEsc(r._roleName || r.roleId)}`);
      }
      if (d.error) L.push(`- ⚠ could not be read: ${mdEsc(d.error)}`);
      L.push(`- <sub>id \`${au.id}\`${au.visibility ? ` · visibility: ${au.visibility}` : ""}</sub>`);
      L.push("");
    }
    // R28 — the tenant's own group → persona mapping, stated where a reader can
    // see it. A routing decision that appears nowhere in the documentation is a
    // decision the next administrator has to rediscover from behaviour.
    if (Array.isArray(meta.personaMap) && meta.personaMap.length) L.push(...meta.personaMap);
    L.push("The isMemberManagementRestricted flag is immutable — an existing AU cannot be converted either way. Members of a restricted AU can only be managed by roles scoped to that AU.", "");
    return L.join("\n");
  }

  // ---------- the baseline's per-persona restricted AUs ----------
  //
  // One vault per persona rather than one for everything, so a scoped
  // administrator for the DevOps exclusions cannot also edit the Admins ones.
  // The codes mirror the deployment groups the baseline already uses
  // (CAD-SEC-U-DG-<CODE>), so the two naming schemes stay legible together.
  const BASELINE_AUS = [
    { code: "GLO",         label: "Global",                  caRange: "CA000–CA099" },
    { code: "ADM",         label: "Admins",                  caRange: "CA100–CA199" },
    { code: "INT",         label: "Internals",               caRange: "CA200–CA299" },
    { code: "EXT",         label: "Externals",               caRange: "CA300–CA399" },
    { code: "GUESTUSERS",  label: "Guest users",             caRange: "CA400–CA499" },
    { code: "GUESTAdmins", label: "Guest admins",            caRange: "CA500–CA599" },
    { code: "SA",          label: "Service accounts",        caRange: "CA600–CA899" },
    // Workload-identity policies target SERVICE PRINCIPALS, which cannot be
    // members of an administrative unit at all — only users, groups and devices
    // can. So this unit holds whatever exclusion GROUPS the CA900 range uses,
    // and nothing else; that is still worth separating, because those groups
    // gate access for the automation that runs without a person behind it.
    { code: "WLI",         label: "Workload identities",     caRange: "CA900–CA999" },
    { code: "DevOps",      label: "DevOps",                  caRange: "CA1000–CA1099" },
    // Break-glass is not a persona and has no CA range: CAB-SEC-U-BreakGlass is
    // excluded from very nearly every policy in the baseline, which is exactly
    // why it cannot sit in one persona's vault. Whoever can edit it can walk
    // through every policy at once, so it gets a unit of its own with its own
    // (smaller) list of scoped administrators. The name has no -Exclusions
    // suffix because it is not a persona's exclusions — it is the emergency
    // access group itself.
    { code: "BreakGlass",  label: "Break-glass",             caRange: "", name: "CAB-SEC-RMAU-BreakGlass",
      description: "Restricted management administrative unit for the break-glass emergency access group (CAB-SEC-U-BreakGlass), which is excluded from nearly every Conditional Access policy. Membership changes require a role scoped to this administrative unit — keep the list of scoped administrators shorter than for any other unit." },
    { code: "FW",          label: "Factory workers",         caRange: "CA1200–CA1299" },
  ];
  // Which persona vault does an exclusion group belong in? Derived from the CA
  // number in its name, using the same ranges the baseline documents, so
  // CAB-SEC-U-CA101-Exclusion goes to ADM and not to whichever unit happened to
  // be first in a dropdown. Break-glass is matched by name: it is excluded from
  // nearly every policy, so no CA number could ever place it.
  const CA_BASE_CODE = {
    0: "GLO", 100: "ADM", 200: "INT", 300: "EXT", 400: "GUESTUSERS",
    500: "GUESTAdmins", 600: "SA", 700: "SA", 800: "SA",
    900: "WLI", 1000: "DevOps",
    1100: "ADM",   // E-Admins file with the admins
    1200: "FW",
  };
  // Break-glass groups are named by local convention, not by the baseline —
  // BreakGlass, Break-Glass, Emergency_Access1, EmergencyAccess, BG-Admins.
  // Anything holding the accounts that bypass every policy belongs in the same
  // vault whatever it is called, so the match is by intent rather than by our
  // preferred spelling.
  const BREAKGLASS_NAME = /break[-_ ]?glass|emergency[-_ ]?access|^bg[-_]/i;

  function codeForGroup(name) {
    const n = String(name || "");
    // The CA NUMBER WINS. A group that carries one has been filed deliberately,
    // and a name that also happens to say "emergency" should not overrule it —
    // CAB-SEC-U-CA101-EmergencyAccess is an Admins exclusion group, not a
    // break-glass one.
    const m = /CA(\d{3,4})/i.exec(n);
    if (m) return CA_BASE_CODE[Math.floor(+m[1] / 100) * 100] || null;
    if (BREAKGLASS_NAME.test(n)) return "BreakGlass";
    if (/\bfrontline\b|[-_]FW[-_]|[-_]FW$/i.test(n)) return "FW";
    return null;
  }

  // A catalog entry may carry its own `name` — break-glass does, because it
  // holds the emergency access group rather than a persona's exclusions.
  const auName = (code) => {
    const e = BASELINE_AUS.find((a) => a.code === code);
    return (e && e.name) || `CAB-SEC-RMAU-${code}-Exclusions`;
  };
  const auDescription = (a) => a.description
    || `Restricted management administrative unit for the ${a.label} Conditional Access exclusion groups${a.caRange ? ` (${a.caRange})` : ""}. Membership changes require a role scoped to this administrative unit.`;

  // The reverse of auName: which persona is THIS administrative unit? Matched
  // against the catalog by name, because an administrative unit's name carries
  // no CA number for codeForGroup to read.
  const codeForAu = (displayName) => {
    const n = String(displayName || "").toLowerCase();
    const hit = BASELINE_AUS.find((a) => auName(a.code).toLowerCase() === n);
    return hit ? hit.code : null;
  };

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

  // THIS REPORT IS A DEPLOYMENT CHECKLIST, AND SAYS SO. It answers exactly one
  // question — does each persona's unit exist and is it restricted — because
  // that is the only question baselineCheck() has data for: it walks
  // BASELINE_AUS and matches by name, so a restricted unit the tenant has but
  // the baseline does not name is not in it and cannot be.
  //
  // It used to carry a "Scoped admin" column as well, and that column was a
  // lie. Scoped administrators are only known for units created in the SAME run
  // (the creation loop grants one and records the outcome); for a pre-existing
  // unit there is no record, so every "already present" row printed "—". The
  // report never called /administrativeUnits/{id}/scopedRoleMembers at all, and
  // a footnote about vaults nobody can open turned that silence into a finding:
  // a tenant with four Groups Administrators scoped to a unit was documented as
  // having none. The column is gone rather than half-filled — a missing column
  // sends the reader to a tool that knows, an empty one does not.
  //
  // A creation grant is real data and is kept, folded into the row it belongs
  // to, so a created-but-unscoped unit is still reported as the half-outcome it
  // is. Cells are escaped: a Graph error carrying a pipe would otherwise split
  // the table it is sitting in.
  const mdCell = (v) => String(v ?? "").trim().replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

  function baselineReport(check, results, meta = {}) {
    const L = [`# Persona restricted administrative units`, "",
      `**Tenant:** ${meta.tenant || "—"}  `,
      `**Generated by:** ${meta.build || ""}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `One restricted management administrative unit per persona, so a scoped administrator for one persona's exclusion groups cannot edit another's.`, "",
      `**What this report covers.** Whether each persona's unit exists and carries the restricted-management flag — nothing more. It does not read scoped administrators, members or policy dependencies, and a restricted unit outside the persona baseline is not listed. For who is scoped to a unit, what it protects and which policies a membership change would affect, open the unit in 🛡 Restricted AUs, or include the restricted-unit pages in 📄 Create documentation.`, "",
      `| Administrative unit | Persona | Status |`, `| --- | --- | --- |`];
    for (const r of check.rows) {
      const res = (results || []).find((x) => x.name === r.name);
      let status;
      if (res) {
        if (!res.ok) status = `FAILED — ${mdCell(res.error)}`;
        else if (res.adminOk) status = `created — ${mdCell(res.admin)} scoped as administrator`;
        else if (res.adminError) status = `created — scoped administrator NOT granted: ${mdCell(res.adminError)}`;
        else status = "created";
      } else {
        status = r.status === "present" ? "already present"
          : r.status === "unrestricted" ? "**name taken by a NON-restricted AU**" : "missing";
      }
      L.push(`| ${mdCell(r.name)} | ${mdCell(r.label)} | ${status} |`);
    }
    L.push("");
    if (check.unrestricted.length) {
      L.push(`## Conflicts`, "");
      L.push(`${check.unrestricted.length} administrative unit${check.unrestricted.length === 1 ? " exists" : "s exist"} under the expected name but **without** the restricted-management flag. That flag is set at creation and is immutable, so these cannot be upgraded — rename the existing one and create a restricted replacement, or adopt a different name for the persona.`, "");
      for (const r of check.unrestricted) L.push(`- ${r.name}`);
      L.push("");
    }
    L.push(`_An administrative unit with no scoped administrator is a vault nobody can open: tenant-wide roles are blocked by design, so somebody must hold a role scoped to it. This report cannot tell you which units those are — it does not read scoped administrators. 🛡 Restricted AUs shows them per unit, and 📄 Create documentation states a no-admin unit as a finding._`);
    return L.join("\n");
  }

  return { ROLE_TEMPLATES, isRestricted, memberType, caRefs, summarize, buildPayload, toMd,
    BASELINE_AUS, auName, auDescription, baselineCheck, baselineReport, codeForGroup, codeForAu, BREAKGLASS_NAME };
})();
