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
    L.push("The isMemberManagementRestricted flag is immutable — an existing AU cannot be converted either way. Members of a restricted AU can only be managed by roles scoped to that AU.", "");
    return L.join("\n");
  }

  // ---------- R27: documentation, not a listing -------------------------
  // toMd above is the raw material — what each unit holds and who may manage
  // it. A document is a different thing: it answers the questions a reviewer
  // actually arrives with, in the order they arrive in. Two of them decide
  // whether this control is real at all:
  //
  //   * WHO COULD WIDEN AN EXCLUSION — in a restricted unit the answer is not
  //     "the Global Administrators". Tenant-wide roles are blocked by design,
  //     so it is exactly the people scoped to this unit, by name.
  //   * WHAT WOULD HAPPEN IF THEY DID — naming the policies each protected
  //     group is excluded from turns an abstract risk into a sentence somebody
  //     can check: add a member here and they stop being subject to these.
  //
  // And two failure states get their own section, because they are what a
  // review is for and neither is visible from the portal: a unit with NOBODY
  // scoped to it (a vault that cannot be opened), and a FROZEN group —
  // role-assignable inside a restricted unit, so its membership is editable by
  // no one at all.
  function docMd(list, details, meta = {}) {
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const units = (list || []).filter(isRestricted)
      .slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    const det = (au) => (details || {})[au.id] || {};
    const frozenOf = (au) => (det(au).members || []).filter((m) => m.isAssignableToRole === true);
    const orphans = units.filter((au) => det(au).scoped && !det(au).scoped.length);
    const frozen = units.filter((au) => frozenOf(au).length);

    const L = [`# Restricted administrative units — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `Conditional Access exclusion groups are the soft underbelly of a baseline: adding one member to the right group removes that person from a policy, and nothing about the policy changes. A restricted management administrative unit is what stops that being a tenant-wide privilege — membership of a group inside one can only be changed by a role scoped to that unit, and tenant-wide roles, Global Administrator included, are blocked by design.`, "",
      `This document records, per unit: what it protects, which Conditional Access policies depend on those groups, who may change them, and what changing them would do.`, "",
      `- Restricted units documented: **${units.length}**`,
      `- Units with **nobody** scoped to them: **${orphans.length}**${orphans.length ? " ⚠" : ""}`,
      `- Units holding a **frozen** group: **${frozen.length}**${frozen.length ? " ⚠" : ""}`, ""];

    if (orphans.length || frozen.length) {
      L.push(`## Findings`, "");
      for (const au of orphans) {
        L.push(`- ⚠ **${mdEsc(au.displayName)} — no scoped administrator.** Nobody can change the membership of the groups in this unit: tenant-wide roles are blocked and no role is scoped here. Every group inside it is effectively frozen until somebody is granted a scoped role.`);
      }
      for (const au of frozen) {
        for (const m of frozenOf(au)) {
          L.push(`- ⚠ **${mdEsc(m.displayName || m.id)} in ${mdEsc(au.displayName)} — frozen.** The group is role-assignable, which restricts its membership to Global Administrator and Privileged Role Administrator; it also sits in a restricted unit, which blocks exactly those two. Neither a scoped administrator nor a tenant-wide one can change it. Convert the group to a regular security group first, then re-protect it.`);
        }
      }
      L.push("");
    }

    for (const au of units) {
      const d = det(au);
      const code = codeForAu(au.displayName);
      const entry = code ? BASELINE_AUS.find((x) => x.code === code) : null;
      L.push(`## ${mdEsc(au.displayName)}`, "");
      if (entry) L.push(`**Persona:** ${mdEsc(entry.label)}${entry.caRange ? ` · policies ${mdEsc(entry.caRange)}` : ""}`, "");
      const desc = String(au.description || "").replace(/\[enca:extra=[^\]]*\]/i, "").trim();
      if (desc) L.push(mdEsc(desc), "");
      const stated = parseExtra(au.description);
      if (stated.length) L.push(`**Filed here by hand:** ${stated.map(mdEsc).join(", ")} — stated on this unit rather than inferred from a name.`, "");

      // ---- what it protects, and what each group is load-bearing for ----
      const members = d.members || [];
      if (!d.members) L.push(`_Members were not read for this unit._`, "");
      else if (!members.length) L.push(`**Protects:** nothing yet. The unit exists but holds no groups, so it is not currently a control.`, "");
      else {
        L.push(`### What it protects (${members.length})`, "");
        for (const m of members) {
          const refs = m._caRefs || [];
          const exc = refs.filter((r) => r.how === "excluded");
          const inc = refs.filter((r) => r.how === "included");
          L.push(`**${mdEsc(m.displayName || m.id)}** _(${memberType(m)})_`
            + (m.isAssignableToRole === true ? ` — ⚠ **frozen** (role-assignable inside a restricted unit)` : ""));
          if (!refs.length) L.push(`  - No Conditional Access policy references this group. It is protected but not load-bearing — worth asking whether it should be here.`);
          if (exc.length) {
            L.push(`  - **Excluded from ${exc.length} polic${exc.length === 1 ? "y" : "ies"}** — a member added to this group stops being subject to ${exc.length === 1 ? "it" : "them"}:`);
            for (const r of exc) L.push(`    - ${mdEsc(r.name)}`);
          }
          if (inc.length) {
            L.push(`  - **Targeted by ${inc.length} polic${inc.length === 1 ? "y" : "ies"}** — a member added to this group becomes subject to ${inc.length === 1 ? "it" : "them"}:`);
            for (const r of inc) L.push(`    - ${mdEsc(r.name)}`);
          }
        }
        L.push("");
      }

      // ---- who could widen an exclusion ----
      L.push(`### Who could widen an exclusion`, "");
      if (!d.scoped) L.push(`_Scoped role assignments were not read for this unit._`, "");
      else if (!d.scoped.length) {
        L.push(`⚠ **Nobody.** No role is scoped to this unit and tenant-wide roles cannot reach into it, so its groups cannot be changed by anyone — including in an emergency. That is not a stronger control, it is an unusable one.`, "");
      } else {
        L.push(`These ${d.scoped.length === 1 ? "person holds" : "people hold"} a role scoped to this unit. Because tenant-wide roles are blocked here, this list is the complete answer — a Global Administrator not named below cannot change these groups.`, "");
        L.push(`| Who | Role | What that permits |`, `| --- | --- | --- |`);
        for (const r of d.scoped) {
          const role = r._roleName || r.roleId || "";
          L.push(`| ${mdEsc(r._principal || r.roleMemberInfo?.displayName || r.roleMemberInfo?.id)} | ${mdEsc(role)} | ${mdEsc(ROLE_PERMITS(role))} |`);
        }
        L.push("");
        const excCount = (d.members || []).reduce((n, m) => n + ((m._caRefs || []).filter((r) => r.how === "excluded").length), 0);
        if (excCount) L.push(`**What would happen if they did:** adding a user to any group in this unit removes that user from up to ${excCount} Conditional Access polic${excCount === 1 ? "y" : "ies"}, listed above, with no change to the policies themselves and no approval step. That is why this unit exists, and why the list above should be short and reviewed.`, "");
      }
      L.push(`<sub>id \`${au.id}\`</sub>`, "");
    }
    L.push(`---`, "", `_The isMemberManagementRestricted flag is set at creation and is immutable: a unit cannot be converted either way, in either direction. Membership of groups inside a restricted unit is manageable only by roles scoped to that unit._`);
    return L.join("\n");
  }
  // Plain words for what a scoped role actually lets somebody do here.
  function ROLE_PERMITS(roleName) {
    const n = String(roleName || "").toLowerCase();
    if (n.includes("group")) return "Add or remove members of the groups in this unit — which is what widens an exclusion.";
    if (n.includes("user")) return "Manage the user objects in this unit; group membership only if a group role is also held.";
    if (n.includes("privileged") || n.includes("global")) return "Full management within this unit, including group membership.";
    if (n.includes("read")) return "Read only — cannot change membership.";
    return "Scoped to this unit; check the role definition for whether it includes group membership.";
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

  // ---- R28: groups a tenant has filed by hand -------------------------
  // Everything above routes a group by reading the CA number in its name,
  // which works for the baseline and for nothing else. A tenant's own
  // exclusion group — SEC-VIP-Exceptions, Contractors-NoMFA — matches no
  // persona, and telling somebody their naming is wrong is not a feature.
  //
  // So a persona vault can carry a stated mapping in its own description:
  //
  //     [enca:extra=Contractors-NoMFA;SEC-VIP-Exceptions]
  //
  // The administrative unit is the thing the mapping is about, it is one
  // object per persona, and it is readable in the portal. Two rules the
  // roadmap card sets and this code keeps: never GUESS a mapping (a persona
  // nobody stated is how a group ends up in the wrong vault silently), and
  // never HIDE an unmapped group — it stays visible as unmapped rather than
  // dropping quietly out of every list.
  const EXTRA_RE = /\[enca:extra=([^\]]*)\]/i;
  function parseExtra(description) {
    const m = EXTRA_RE.exec(String(description || ""));
    if (!m) return [];
    return m[1].split(";").map((x) => x.trim()).filter(Boolean);
  }
  // Rewrite the token in place, leaving the human text either side of it
  // alone — the description is somebody's writing first and our storage second.
  function withExtra(description, names) {
    const d = String(description || "");
    const list = [...new Set((names || []).map((x) => String(x).trim()).filter(Boolean))];
    const token = list.length ? `[enca:extra=${list.join(";")}]` : "";
    if (EXTRA_RE.test(d)) return d.replace(EXTRA_RE, token).replace(/\s{2,}/g, " ").trim();
    return list.length ? `${d.trim()} ${token}`.trim() : d.trim();
  }
  // name -> persona code, from the descriptions of the units themselves.
  // `aus` is the /administrativeUnits read including `description`.
  function extraMap(aus) {
    const map = new Map();
    for (const a of aus || []) {
      const code = codeForAu(a.displayName);
      if (!code) continue;
      for (const n of parseExtra(a.description)) map.set(n.toLowerCase(), code);
    }
    return map;
  }

  // `extras` is the map from extraMap(). A STATED mapping wins over every
  // inference, including the CA number: somebody said this out loud, and the
  // number in a name is at best a convention.
  function codeForGroup(name, extras) {
    const n = String(name || "");
    if (extras && extras.size) {
      const stated = extras.get(n.toLowerCase());
      if (stated) return stated;
    }
    // Failing a stated mapping, the CA NUMBER WINS. A group that carries one has been filed deliberately,
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

  return { ROLE_TEMPLATES, isRestricted, memberType, caRefs, summarize, buildPayload, toMd, docMd,
    BASELINE_AUS, auName, auDescription, baselineCheck, baselineReport, codeForGroup, codeForAu, BREAKGLASS_NAME,
    parseExtra, withExtra, extraMap };
})();
