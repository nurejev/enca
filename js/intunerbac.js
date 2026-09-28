// ======================================================================
// 📱 Intune RBAC (T53, beta 32423, R70) — pure: no DOM, no Graph.
//
// Intune has no administrative units and no PIM of its own, so the
// CloudFellows PIM framework draws the same boundaries with Intune's own
// objects: ROLE ASSIGNMENTS whose members are the PIM-SG-INT-* access groups
// (eligible members — activating the group is the gate; a persona group
// never sits in one, its active members would hold the role standing),
// SCOPE GROUPS (who and what an assignment reaches), SCOPE TAGS (which
// objects an admin sees) and one CUSTOM ROLE, INT-ROLE-Regional-Ops.
//
// What the framework expects comes from the profile (profile.intune:
// central assignments, custom roles) and, in the multi-region profile, from
// every row of the customer's regions.csv (the region template's tag, scope
// groups and two assignments). This module reads what Intune has and gives
// each expected object a verdict — the same five as 🧬 T48: match · differs
// · missing · unread · conflict — and plans what 🚀 Deploy creates:
//
//   expected(cat, rows)             the framework's Intune objects, named
//   model(raw)                      Graph's shapes → one normalised read
//   resolveActions(entries, ops)    template entries → the tenant's ids
//                                   (an id it lists, or "Resource/Action"
//                                   matched on resourceName/actionName —
//                                   the rule New-PimRegions.ps1 learnt on
//                                   cloudfellows.dev, 32421)
//   compare(cat, rows, m, groups)   verdicts, and `verdicts` by name for
//                                   🗺 Regions' Intune rows
//   plan(P, cat, rows, m, res, ref, sel)   ops into a PimPlan
//
// An assignment that names two roles (Policy and Profile Manager +
// Application Manager) is two Intune assignments under one name: Intune
// ties an assignment to exactly one role definition.
// ======================================================================
const IntuneRbac = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (s) => String(s || "").toLowerCase();
  const setKey = (a) => [...new Set((a || []).filter(Boolean).map(lc))].sort().join(",");
  const SCOPE = { "all users and devices": "allDevicesAndLicensedUsers", "all devices": "allDevices", "all users": "allLicensedUsers" };
  const SCOPE_TXT = { allDevicesAndLicensedUsers: "all users and devices", allDevices: "all devices", allLicensedUsers: "all users", resourceScope: "scope groups" };
  const DEFAULT_TAG = "0";

  function expected(cat, rows) {
    const p = (cat && cat.profile) || {};
    const I = p.intune || { assignments: [], customRoles: [], switches: [] };
    const out = { central: [], regions: [], customRoles: [], tags: [], switches: I.switches || [] };
    (I.assignments || []).forEach((a) => (a.roles || []).forEach((role) => out.central.push({ name: a.name, role, members: a.members || [], scopeType: SCOPE[lc(a.scope)] || "resourceScope", scopeGroups: a.scopeGroups || [], tags: a.tags || [], note: a.note || "", where: "central" })));
    out.central.forEach((a) => a.tags.forEach((t) => { if (t !== "default" && t !== "every" && !out.tags.some((x) => x.name === t)) out.tags.push({ name: t, autoAssignFrom: null, where: "central" }); }));
    (I.customRoles || []).forEach((n) => { const r = (cat.intuneRoles || []).find((x) => x.name === n); if (r) out.customRoles.push(r); });
    if (p.regions && Array.isArray(rows) && rows.length) {
      const T = (cat.regions && cat.regions.template && cat.regions.template.intune) || {};
      const fill = (v, row) => (typeof v === "string" ? v.replace(/<(REG|attribute|value|devicePrefix|autopilotTag)>/g, (m, k) => (k === "REG" ? row.code : String(row[k] ?? ""))) : Array.isArray(v) ? v.map((x) => fill(x, row)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, row)])) : v);
      rows.forEach((row) => {
        const R = fill(T, row);
        const reg = { code: row.code, tag: R.tag ? { name: R.tag.name, autoAssignFrom: R.tag.autoAssignFrom, where: row.code } : null, groups: R.groups || [], assignments: [] };
        (R.assignments || []).forEach((a) => (a.roles || []).forEach((role) => reg.assignments.push({ name: a.name, role, members: a.members || [], scopeType: "resourceScope", scopeGroups: a.scopeGroups || [], tags: a.tags || [], where: row.code })));
        out.regions.push(reg);
        if (reg.tag) out.tags.push(reg.tag);
      });
      if (!out.customRoles.length) (cat.intuneRoles || []).forEach((r) => out.customRoles.push(r));
    }
    return out;
  }

  // ---- the read ----------------------------------------------------------
  function roleActions(def) {
    const allowed = [], no = [];
    for (const prop of ["rolePermissions", "permissions"]) {
      for (const p of (def && def[prop]) || []) {
        if (!p || typeof p !== "object") continue;
        (p.actions || []).forEach((a) => { if (a && !allowed.includes(a)) allowed.push(a); });
        (p.resourceActions || []).forEach((ra) => {
          (ra.allowedResourceActions || []).forEach((a) => { if (a && !allowed.includes(a)) allowed.push(a); });
          (ra.notAllowedResourceActions || []).forEach((a) => { if (a && !no.includes(a)) no.push(a); });
        });
      }
    }
    return { allowed, notAllowed: no };
  }
  // raw = { roles:[def], assignments:[{…, roleDefinition:{id,displayName}}], tags:[{id,displayName}],
  //         tagTargets:{ [tagId]: [target] | null }, ops:[resourceOperation], readAt, demo, sources }
  function model(raw) {
    if (!raw) return null;
    const roles = (raw.roles || []).map((r) => Object.assign({ id: r.id, displayName: r.displayName, isBuiltIn: r.isBuiltIn !== false, description: r.description || "" }, roleActions(r)));
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const assignments = (raw.assignments || []).map((a) => {
      const rid = (a.roleDefinition && a.roleDefinition.id) || a.roleDefinitionId || null;
      const role = roleById.get(rid);
      return { id: a.id, displayName: a.displayName || "", roleId: rid, roleName: (a.roleDefinition && a.roleDefinition.displayName) || (role && role.displayName) || rid || "?", members: a.members || [], resourceScopes: a.resourceScopes || [], scopeType: a.scopeType || (a.resourceScopes && a.resourceScopes.length ? "resourceScope" : "resourceScope"), roleScopeTagIds: a.roleScopeTagIds || [] };
    });
    const tags = (raw.tags || []).map((t) => {
      const tg = raw.tagTargets ? raw.tagTargets[t.id] : undefined;
      return { id: String(t.id), displayName: t.displayName, isBuiltIn: String(t.id) === DEFAULT_TAG || t.isBuiltIn === true, targets: Array.isArray(tg) ? tg.map((x) => (x && (x.target || x)) || {}).map((x) => x.groupId || x.entraObjectId || null).filter(Boolean) : null };
    });
    return { roles, assignments, tags, ops: raw.ops || [], readAt: raw.readAt || null, demo: !!raw.demo, sources: raw.sources || null };
  }

  // Template entries → this tenant's operation ids.
  function resolveActions(entries, ops) {
    const norm = (x) => String(x || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").toLowerCase();
    const known = new Set((ops || []).map((o) => o.id).filter(Boolean));
    const byName = new Map();
    (ops || []).forEach((o) => { if (o.resourceName && o.actionName && o.id) byName.set(`${norm(o.resourceName)}|${norm(o.actionName)}`, o.id); });
    const ids = [], unknown = [];
    for (const e of entries || []) {
      if (!e) continue;
      let id = null;
      if (known.has(e)) id = e;
      else { const m = /^\s*([^/]+?)\s*\/\s*(.+?)\s*$/.exec(e); if (m) id = byName.get(`${norm(m[1])}|${norm(m[2])}`) || null; }
      if (id) { if (!ids.includes(id)) ids.push(id); continue; }
      let res = ""; const m1 = /^\s*([^/]+?)\s*\//.exec(e), m2 = /^Microsoft\.Intune_([^_]+)_/.exec(e);
      if (m1) res = norm(m1[1]); else if (m2) res = m2[1].toLowerCase();
      const key = res.replace(/\s/g, "");
      const word = res.split(/\s+/).find((w) => w.length >= 4);
      let cand = key ? (ops || []).filter((o) => lc(o.resourceName).replace(/\s/g, "") === key || lc(o.id).startsWith(`microsoft.intune_${key}_`)) : [];
      if (!cand.length && word) cand = (ops || []).filter((o) => lc(o.resourceName).includes(word) || lc(o.id).includes(word));
      unknown.push({ entry: e, hint: cand.length ? `this tenant lists for that resource: ${cand.slice(0, 12).map((o) => `${o.resourceName}/${o.actionName} = ${o.id}`).join(", ")}` : "the tenant lists nothing for that resource" });
    }
    return { ids, unknown };
  }

  // groups: name → [{id, displayName, isAssignableToRole, membershipRule, membershipRuleProcessingState}]
  //         (T48's read: role-assignable groups + the PIM-SG-/INT-SG- read), names: id → name
  function compare(cat, rows, m, groups, names = {}) {
    const E = expected(cat, rows);
    const res = { expected: E, items: [], other: [], customRoles: [], switches: E.switches, verdicts: {}, counts: { match: 0, differs: 0, missing: 0, unread: 0, conflict: 0 }, read: !!m, readAt: m ? m.readAt : null, demo: m ? m.demo : false };
    const nameOf = (id) => {
      if (names[id]) return names[id];
      for (const [n, l] of groups) if (l.some((g) => g.id === id)) return n;
      return id;
    };
    const idOf = (n) => { const l = groups.get(n) || []; return l.length === 1 ? l[0].id : null; };
    const tagByName = new Map(); (m ? m.tags : []).forEach((t) => { const k = t.displayName; (tagByName.get(k) || tagByName.set(k, []).get(k)).push(t); });
    const allTagIds = m ? m.tags.map((t) => t.id) : [];
    const roleByName = new Map(); (m ? m.roles : []).forEach((r) => { const k = lc(r.displayName); (roleByName.get(k) || roleByName.set(k, []).get(k)).push(r); });
    const push = (it) => { res.items.push(it); res.counts[it.status]++; if (it.kind !== "custom-role") res.verdicts[it.key || it.name] = { status: it.status, detail: it.detail }; };
    // custom roles
    E.customRoles.forEach((cr) => {
      const it = { kind: "custom-role", name: cr.name, key: `role:${cr.name}`, where: "central", expect: `${cr.allowed.length} permissions · ${cr.description}`, status: "unread", detail: "", missing: [], extra: [], unresolved: [], id: null };
      if (m) {
        const list = roleByName.get(lc(cr.name)) || [];
        const rs = resolveActions(cr.allowed, m.ops);
        it.unresolved = rs.unknown;
        if (!list.length) { it.status = "missing"; it.detail = rs.unknown.length ? `${rs.unknown.length} of its permissions are not names this tenant knows — Deploy will not create a reduced role: ${rs.unknown.map((u) => u.entry).join(", ")}` : `created by 🚀 Deploy with ${rs.ids.length} permissions`; it.want = rs.ids; }
        else if (list.length > 1) { it.status = "conflict"; it.detail = `${list.length} roles are called ${cr.name}`; }
        else if (list[0].isBuiltIn) { it.status = "conflict"; it.detail = "the only role with this name is built in"; }
        else {
          const r = list[0]; it.id = r.id; it.have = r.allowed; it.notAllowed = r.notAllowed;
          it.missing = rs.ids.filter((x) => !r.allowed.includes(x));
          it.extra = r.allowed.filter((x) => !rs.ids.includes(x));
          it.want = rs.ids;
          if (!r.allowed.length && !r.notAllowed.length) { it.status = "differs"; it.detail = `the role has no permissions at all (was it made empty?) — ${rs.ids.length} to add`; }
          else if (it.missing.length || it.unresolved.length) { it.status = "differs"; it.detail = `lacks ${it.missing.length + it.unresolved.length} of ${cr.allowed.length}${it.missing.length ? `: ${it.missing.join(", ")}` : ""}${it.unresolved.length ? `; not known to this tenant: ${it.unresolved.map((u) => u.entry).join(", ")}` : ""}`; }
          else it.status = "match";
          if (it.extra.length) it.detail = (it.detail ? it.detail + "; " : "") + `also carries ${it.extra.length} the template does not (${it.extra.join(", ")}) — kept; take them out in Intune if they should go`;
        }
      }
      res.customRoles.push(it); res.counts[it.status]++;
    });
    const customId = (n) => { const c = res.customRoles.find((x) => x.name === n); return c ? c.id : null; };
    // tags
    E.tags.forEach((t) => {
      const it = { kind: "tag", name: t.name, key: t.name, where: t.where, expect: t.autoAssignFrom ? `scope tag, auto-assigned from ${t.autoAssignFrom}` : "scope tag", status: "unread", detail: "", id: null, autoAssignFrom: t.autoAssignFrom };
      if (m) {
        const list = tagByName.get(t.name) || [];
        if (!list.length) it.status = "missing";
        else if (list.length > 1) { it.status = "conflict"; it.detail = `${list.length} tags are called ${t.name}`; }
        else {
          const tg = list[0]; it.id = tg.id; it.targets = tg.targets; it.status = "match";
          if (t.autoAssignFrom) {
            const want = idOf(t.autoAssignFrom);
            if (tg.targets === null) { it.status = "unread"; it.detail = "its assignments were not read"; }
            else if (!want) { it.status = "differs"; it.detail = `${t.autoAssignFrom} does not exist yet, so the tag is assigned to nothing it should be`; }
            else if (!tg.targets.includes(want)) { it.status = "differs"; it.detail = `not auto-assigned from ${t.autoAssignFrom}${tg.targets.length ? ` (it has ${tg.targets.length} other target${tg.targets.length === 1 ? "" : "s"}, kept)` : ""}`; }
          }
        }
      }
      push(it);
    });
    const tagIdOf = (n) => (n === "default" ? DEFAULT_TAG : (res.items.find((i) => i.kind === "tag" && i.name === n) || {}).id || null);
    // assignments
    const byAssign = new Map(); (m ? m.assignments : []).forEach((a) => { const k = a.displayName; (byAssign.get(k) || byAssign.set(k, []).get(k)).push(a); });
    const matched = new Set();
    const judge = (spec) => {
      const it = { kind: "assignment", name: spec.name, role: spec.role, key: `${spec.name}|${spec.role}`, where: spec.where, expect: `${spec.role} · members ${spec.members.join(", ")} · ${spec.scopeType === "resourceScope" ? `scope ${spec.scopeGroups.join(", ")}` : SCOPE_TXT[spec.scopeType]} · tags ${spec.tags.join(", ") || "—"}`, status: "unread", detail: "", spec };
      if (!m) return it;
      const same = (byAssign.get(spec.name) || []).filter((a) => lc(a.roleName) === lc(spec.role) || (customId(spec.role) && a.roleId === customId(spec.role)));
      if (!same.length) { it.status = "missing"; const other = byAssign.get(spec.name) || []; if (other.length) it.detail = `an assignment with this name exists for ${other.map((a) => a.roleName).join(", ")}, not ${spec.role}`; return it; }
      if (same.length > 1) { it.status = "conflict"; it.detail = `${same.length} assignments ${spec.name} for ${spec.role}`; same.forEach((a) => matched.add(a.id)); return it; }
      const a = same[0]; matched.add(a.id); it.id = a.id;
      const d = [];
      const wantMembers = spec.members.map(idOf);
      if (wantMembers.some((x) => !x)) d.push(`member group ${spec.members.filter((n, i) => !wantMembers[i]).join(", ")} does not exist`);
      else if (setKey(a.members) !== setKey(wantMembers)) d.push(`members ${a.members.map(nameOf).join(", ") || "none"}`);
      if (spec.scopeType === "resourceScope") {
        const wantScope = spec.scopeGroups.map(idOf);
        if (a.scopeType && a.scopeType !== "resourceScope") d.push(`scope ${SCOPE_TXT[a.scopeType] || a.scopeType} — wider than the region`);
        else if (wantScope.some((x) => !x)) d.push(`scope group ${spec.scopeGroups.filter((n, i) => !wantScope[i]).join(", ")} does not exist`);
        else if (setKey(a.resourceScopes) !== setKey(wantScope)) d.push(`scope groups ${a.resourceScopes.map(nameOf).join(", ") || "none"}`);
      } else if (a.scopeType !== spec.scopeType) d.push(`scope ${SCOPE_TXT[a.scopeType] || a.scopeType}${a.resourceScopes.length ? ` (${a.resourceScopes.map(nameOf).join(", ")})` : ""}`);
      const wantTags = spec.tags.includes("every") ? allTagIds : spec.tags.map(tagIdOf);
      if (wantTags.some((x) => !x)) d.push(`tag ${spec.tags.filter((n, i) => !wantTags[i]).join(", ")} does not exist`);
      else if (setKey(a.roleScopeTagIds) !== setKey(wantTags)) d.push(`tags ${a.roleScopeTagIds.map((t) => (m.tags.find((x) => x.id === String(t)) || {}).displayName || t).join(", ") || "none"}`);
      if (spec.where !== "central" && a.roleScopeTagIds.map(String).includes(DEFAULT_TAG)) d.push("carries the Default tag — the region's admins would see every object");
      it.status = d.length ? "differs" : "match"; it.detail = d.join("; ");
      return it;
    };
    E.central.forEach((s) => push(judge(s)));
    E.regions.forEach((r) => r.assignments.forEach((s) => push(judge(s))));
    // What else Intune holds: the members must still be eligible access groups.
    if (m) m.assignments.filter((a) => !matched.has(a.id)).forEach((a) => {
      const mem = a.members.map((id) => ({ id, name: nameOf(id), g: [...groups.values()].flat().find((g) => g.id === id) }));
      const standing = mem.filter((x) => !/^PIM-SG-INT-/.test(x.name));
      res.other.push({ id: a.id, name: a.displayName, role: a.roleName, members: mem.map((x) => x.name), scope: a.scopeType === "resourceScope" ? a.resourceScopes.map(nameOf).join(", ") || "none" : SCOPE_TXT[a.scopeType] || a.scopeType, tags: a.roleScopeTagIds.map((t) => (m.tags.find((x) => x.id === String(t)) || {}).displayName || t), finding: standing.length ? `held through ${standing.map((x) => x.name).join(", ")} — not a PIM-SG-INT access group, so its members hold the Intune role standing` : "" });
    });
    return res;
  }

  // Ops for 🚀 Deploy. ref(name) → group id | "{{group:NAME}}" | null.
  // sel: Set of keys to take (tag:<name> · tagassign:<name> · role:<name> ·
  // rolefix:<name> · assign:<name>|<role>); null takes everything missing.
  function plan(P, cat, res, ref, sel) {
    const take = (k) => !sel || sel.has(k);
    const BETA = PimPlan.BETA, W = ["DeviceManagementRBAC.ReadWrite.All"];
    const roleRef = {};
    res.customRoles.forEach((c) => {
      if (c.id) roleRef[c.name] = c.id;
      if (c.status === "missing" && take(`role:${c.name}`)) {
        if (c.unresolved.length) { P.blocked.push(`Intune role ${c.name}: ${c.unresolved.length} of its permissions do not resolve to an operation this tenant lists — a reduced role is never created. ${c.unresolved.map((u) => `${u.entry} → ${u.hint}`).join("; ")}`); return; }
        PimPlan.add(P, { key: `introle:${c.name}`, method: "POST", url: `${BETA}/deviceManagement/roleDefinitions`, produces: `introle:${c.name}`, needs: W, section: "intune", summary: `create Intune role ${c.name} (${c.want.length} permissions)`,
          body: { "@odata.type": "#microsoft.graph.deviceAndAppManagementRoleDefinition", displayName: c.name, description: String(((cat.intuneRoles || []).find((r) => r.name === c.name) || {}).description || "").slice(0, 1000), isBuiltIn: false, rolePermissions: [{ resourceActions: [{ allowedResourceActions: c.want, notAllowedResourceActions: [] }] }] } });
        roleRef[c.name] = `{{introle:${c.name}}}`;
      } else if (c.status === "differs" && c.missing.length && take(`rolefix:${c.name}`)) {
        if (c.unresolved.length) { P.blocked.push(`Intune role ${c.name}: ${c.unresolved.length} template permission(s) are not known to this tenant — nothing is added until they are. ${c.unresolved.map((u) => `${u.entry} → ${u.hint}`).join("; ")}`); return; }
        const all = [...new Set([...(c.have || []), ...c.missing])];
        PimPlan.add(P, { key: `introlefix:${c.name}`, method: "PATCH", url: `${BETA}/deviceManagement/roleDefinitions/${c.id}`, needs: W, section: "intune", summary: `Intune role ${c.name}: add ${c.missing.length} missing permission(s), ${all.length} in all (none removed)`,
          body: { "@odata.type": "#microsoft.graph.deviceAndAppManagementRoleDefinition", rolePermissions: [{ resourceActions: [{ allowedResourceActions: all, notAllowedResourceActions: c.notAllowed || [] }] }] }, before: { rolePermissions: [{ resourceActions: [{ allowedResourceActions: c.have || [], notAllowedResourceActions: c.notAllowed || [] }] }] } });
      }
    });
    const tagRef = { default: DEFAULT_TAG };
    // Intune takes only a direct group target on a scope tag (32419).
    const target = (gid) => ({ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: gid } });
    res.items.filter((i) => i.kind === "tag").forEach((t) => {
      if (t.id) tagRef[t.name] = t.id;
      if (t.status === "missing" && take(`tag:${t.name}`)) {
        PimPlan.add(P, { key: `tag:${t.name}`, method: "POST", url: `${BETA}/deviceManagement/roleScopeTags`, produces: `tag:${t.name}`, needs: W, section: "intune", summary: `create Intune scope tag ${t.name}`, body: { displayName: t.name, description: `CloudFellows PIM framework${t.where !== "central" ? `: ${t.where}` : ""}` } });
        tagRef[t.name] = `{{tag:${t.name}}}`;
        const from = t.autoAssignFrom ? ref(t.autoAssignFrom) : null;
        if (t.autoAssignFrom && from) PimPlan.add(P, { key: `tagassign:${t.name}`, method: "POST", url: `${BETA}/deviceManagement/roleScopeTags/{{tag:${t.name}}}/assign`, needs: W, section: "intune", summary: `auto-assign ${t.name} from ${t.autoAssignFrom}`, body: { assignments: [target(from)] } });
        else if (t.autoAssignFrom) P.findings.push(`${t.name}: ${t.autoAssignFrom} does not exist and is not planned — the tag is not auto-assigned`);
      } else if (t.status === "differs" && t.autoAssignFrom && t.targets && take(`tagassign:${t.name}`)) {
        const from = ref(t.autoAssignFrom);
        if (!from) { P.findings.push(`${t.name}: ${t.autoAssignFrom} does not exist and is not planned`); return; }
        // assign REPLACES the list: every existing target goes back unchanged.
        PimPlan.add(P, { key: `tagassign:${t.name}`, method: "POST", url: `${BETA}/deviceManagement/roleScopeTags/${t.id}/assign`, needs: W, section: "intune", summary: `auto-assign ${t.name} from ${t.autoAssignFrom}${t.targets.length ? ` (keeping its ${t.targets.length} other target${t.targets.length === 1 ? "" : "s"})` : ""}`, body: { assignments: [...t.targets.map(target), target(from)] } });
      }
    });
    const allTags = res.items.filter((i) => i.kind === "tag").map((t) => tagRef[t.name]).filter(Boolean);
    res.items.filter((i) => i.kind === "assignment").forEach((a) => {
      if (a.status !== "missing" || !take(`assign:${a.key}`)) {
        if (a.status === "differs" && (!sel || sel.has(`assign:${a.key}`))) P.findings.push(`Intune assignment ${a.name} (${a.role}) differs (${a.detail}) — not rewritten: correct it in Intune`);
        return;
      }
      const s = a.spec;
      const builtIn = (res.customRoles.find((c) => c.name === s.role) ? null : s.role);
      let rref = roleRef[s.role];
      if (!rref && builtIn) rref = `builtin:${builtIn}`;
      if (!rref) { P.findings.push(`${a.name}: Intune role ${s.role} does not exist and is not planned — left out`); return; }
      const mem = s.members.map(ref), scp = s.scopeGroups.map(ref);
      const tags = s.tags.includes("every") ? allTags : s.tags.map((t) => tagRef[t]);
      if ([...mem, ...scp, ...tags].some((x) => !x)) { P.findings.push(`${a.name} (${s.role}): left out — a member, scope group or tag it names does not exist and is not planned`); return; }
      PimPlan.add(P, { key: `intassign:${a.key}`, method: "POST", url: `${BETA}/deviceManagement/roleAssignments`, needs: W, section: "intune", summary: `create Intune assignment ${a.name}: ${s.role} · members ${s.members.join(", ")} · ${s.scopeType === "resourceScope" ? `scope ${s.scopeGroups.join(", ")}` : SCOPE_TXT[s.scopeType]} · tags ${s.tags.join(", ")}`,
        roleName: builtIn,
        body: { "@odata.type": "#microsoft.graph.deviceAndAppManagementRoleAssignment", displayName: s.name, description: `CloudFellows PIM framework${s.where !== "central" ? `: ${s.where}` : ""}`, members: mem, resourceScopes: s.scopeType === "resourceScope" ? scp : [], scopeType: s.scopeType, roleScopeTagIds: tags, "roleDefinition@odata.bind": rref.startsWith("builtin:") ? rref : `${BETA}/deviceManagement/roleDefinitions/${rref}` } });
    });
    return P;
  }
  // Built-in role names are bound at plan time by the caller, which knows the
  // tenant's ids: "builtin:<name>" → the role's id.
  function bindBuiltIns(P, m) {
    const byName = new Map((m ? m.roles : []).filter((r) => r.isBuiltIn).map((r) => [lc(r.displayName), r.id]));
    P.ops.forEach((o) => {
      const b = o.body && o.body["roleDefinition@odata.bind"];
      if (b && b.startsWith("builtin:")) {
        const id = byName.get(lc(b.slice(8)));
        if (id) o.body["roleDefinition@odata.bind"] = `${PimPlan.BETA}/deviceManagement/roleDefinitions/${id}`;
        else { P.blocked.push(`${o.summary}: Intune has no built-in role called ${b.slice(8)}`); o._drop = true; }
      }
    });
    P.ops = P.ops.filter((o) => !o._drop);
    return P;
  }

  const PILL = { match: ["ok", "✓ Match"], differs: ["warn", "≠ Differs"], missing: ["bad", "∅ Missing"], unread: ["na", "? Not read"], conflict: ["bad", "⚠ Conflict"] };
  const pill = (s) => `<span class="xt-pill pmb-${PILL[s][0]}">${esc(PILL[s][1])}</span>`;
  function render(res, opts = {}) {
    const f = opts.filter || "all";
    const c = res.counts;
    const tiles = `<div class="xt-tiles pmb-tiles"><div class="xt-tile"><b>${res.items.filter((i) => i.kind === "assignment").length}</b>assignments expected</div><div class="xt-tile"><b>${c.match}</b>match</div><div class="xt-tile${c.differs ? " m" : ""}"><b>${c.differs}</b>differ</div><div class="xt-tile${c.missing ? " h" : ""}"><b>${c.missing}</b>missing</div><div class="xt-tile${c.conflict ? " h" : ""}"><b>${c.conflict}</b>conflict</div><div class="xt-tile${res.other.some((o) => o.finding) ? " h" : ""}"><b>${res.other.length}</b>other assignments${res.other.some((o) => o.finding) ? ` · ${res.other.filter((o) => o.finding).length} held standing` : ""}</div></div>`;
    const sw = res.switches.length ? `<div class="list-card xt-card"><h3>Tenant switches <span class="mini">one-way, set in the Intune admin center by hand — Graph cannot read them back</span></h3><ul class="pmb-diffs">${res.switches.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : "";
    const roles = res.customRoles.length ? `<div class="list-card xt-card"><h3>Custom role${res.customRoles.length === 1 ? "" : "s"}</h3>${res.customRoles.map((r) => `<p><b>${esc(r.name)}</b> ${pill(r.status)} <span class="mini">${esc(r.expect)}</span></p>${r.detail ? `<p class="mini ${r.status === "match" ? "" : "pmb-bad-txt"}">${esc(r.detail)}</p>` : ""}${r.unresolved.length ? `<ul class="pmb-diffs pmb-findings">${r.unresolved.map((u) => `<li>${esc(u.entry)} — ${esc(u.hint)}</li>`).join("")}</ul>` : ""}`).join("")}</div>` : "";
    const rows = res.items.filter((i) => (f === "all" || (f === "assignments" && i.kind === "assignment") || (f === "tags" && i.kind === "tag") || (f === i.status)));
    const KIND = { assignment: "assignment", tag: "scope tag" };
    const table = `<div class="list-card xt-card"><h3>Assignments and scope tags <span class="mini">central from the profile · per region from the regions file</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th></th><th>Object</th><th>Where</th><th>Expected</th><th>Verdict</th></tr></thead><tbody>${rows.map((i) => `<tr class="pmb-row pmb-${i.status}"><td><span class="pmb-kind">${esc(KIND[i.kind])}</span></td><td><b>${esc(i.name)}</b>${i.role ? `<div class="mini">${esc(i.role)}</div>` : ""}</td><td class="mini">${esc(i.where)}</td><td class="mini">${esc(i.expect)}</td><td>${pill(i.status)}${i.detail ? `<div class="mini pmb-bad-txt">${esc(i.detail)}</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="mini" style="padding:12px">Nothing under this filter.</td></tr>`}</tbody></table></div></div>`;
    const other = res.other.length ? `<div class="list-card xt-card"><h3>Other Intune assignments <span class="mini">not the framework's — a tenant's own are its own, but their members are judged</span></h3><div class="xt-tw"><table class="xt-tbl pmb-rtbl"><thead><tr><th>Assignment</th><th>Role</th><th>Members</th><th>Scope · tags</th><th></th></tr></thead><tbody>${res.other.map((o) => `<tr class="pmb-row"><td><b>${esc(o.name)}</b></td><td>${esc(o.role)}</td><td class="mini">${esc(o.members.join(", ") || "none")}</td><td class="mini">${esc(o.scope)} · ${esc(o.tags.join(", ") || "—")}</td><td class="mini ${o.finding ? "pmb-bad-txt" : ""}">${esc(o.finding || "members are access groups")}</td></tr>`).join("")}</tbody></table></div></div>` : "";
    return tiles + sw + roles + table + other;
  }
  function toMd(res, tenant) {
    const L = [`# 📱 Intune RBAC — ${tenant || "tenant"}`, "", `${res.demo ? "Demo data. " : ""}${res.counts.match} match · ${res.counts.differs} differ · ${res.counts.missing} missing · ${res.counts.conflict} conflict · ${res.counts.unread} not read.`, ""];
    res.customRoles.forEach((r) => L.push(`- Custom role **${r.name}** — ${PILL[r.status][1]}${r.detail ? ` — ${r.detail}` : ""}`));
    L.push("", "| Kind | Object | Where | Expected | Verdict |", "|---|---|---|---|---|", ...res.items.map((i) => `| ${i.kind} | ${i.name}${i.role ? ` (${i.role})` : ""} | ${i.where} | ${i.expect} | ${PILL[i.status][1]}${i.detail ? ` — ${i.detail}` : ""} |`));
    if (res.other.length) L.push("", "## Other assignments", "", ...res.other.map((o) => `- ${o.name} (${o.role}) — members ${o.members.join(", ") || "none"}${o.finding ? ` — ${o.finding}` : ""}`));
    if (res.switches.length) L.push("", "## By hand", "", ...res.switches.map((s) => `- ${s}`));
    return L.join("\n");
  }
  return { SCOPE, DEFAULT_TAG, expected, roleActions, model, resolveActions, compare, plan, bindBuiltIns, render, toMd };
})();
