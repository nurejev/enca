// ======================================================================
// Group Analyzer (BETA) — "where is this group actually used?"
//
// An Entra group is a shared handle: one admin scopes a Conditional Access
// policy to it, another targets an Intune compliance policy at it, a third
// grants it Contributor on a subscription. Nobody sees the whole picture, so
// adding a user to a group has consequences that are invisible at the moment
// of the change. This tool reads the picture back out of the tenant.
//
// After Jasper Baes' Microsoft Cloud Group Analyzer
// (github.com/jasperbaes/Microsoft-Cloud-Group-Analyzer) — same question,
// re-implemented in the browser against delegated permissions, so nothing is
// installed and no client secret exists.
//
// Design notes
//   • Every source is a descriptor with its own scopes and its own runner, and
//     a failing source is reported, never fatal. A tenant without Intune, or an
//     admin without the Azure token, still gets a complete Entra answer.
//   • A runner returns flat (principal, object) hits. That single shape serves
//     both modes: analysing one group (match set = that group + its ancestors)
//     and sweeping the tenant (match set = every group). No second code path.
//   • Ancestors, not just the group itself. If G is a member of P and a policy
//     targets P, then G's members are in that policy's scope. Reporting only
//     direct hits would understate the blast radius, which is the whole point.
// ======================================================================
const GroupUse = (() => {

  // ---------------------------------------------------------------- scopes --
  // Beyond the two read scopes ENCA signs in with. Requested per area, on
  // demand, so an Entra-only run never prompts for Intune.
  const AREA_SCOPES = {
    entra: ["RoleManagement.Read.Directory", "EntitlementManagement.Read.All", "Application.Read.All", "AuditLog.Read.All"],
    // DeviceManagementScripts.Read.All is its own scope: PowerShell scripts,
    // macOS shell scripts and remediations are NOT covered by
    // DeviceManagementConfiguration.Read.All, which is why they came back 403
    // while compliance and configuration profiles read fine.
    intune: ["DeviceManagementConfiguration.Read.All", "DeviceManagementApps.Read.All", "DeviceManagementServiceConfig.Read.All", "DeviceManagementScripts.Read.All"],
    m365: [],
    azure: [],   // Azure is a different resource entirely — see Graph.ARM_SCOPES
  };

  const AREAS = [
    { id: "entra", label: "Entra ID", icon: "🪪" },
    { id: "intune", label: "Intune", icon: "📱" },
    { id: "m365", label: "Microsoft 365", icon: "🧩" },
    { id: "azure", label: "Azure", icon: "☁️" },
  ];

  // ------------------------------------------------------------- utilities --
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isGuid = (s) => GUID.test(String(s || ""));
  const lc = (s) => String(s || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

  // Graph's error text is long and often ends in a request id. Keep the part a
  // human can act on: "Insufficient privileges", "Resource not found", …
  function shortErr(e, max) {
    const m = String((e && e.message) || e || "").split(" · ")[0];
    const cap = max || 180;
    return m.length > cap ? m.slice(0, cap - 3) + "…" : m;
  }

  // Never let one source kill the run. Returns [] and records the reason.
  async function safeAll(url) {
    return Graph.ggetAll(url);
  }

  // Walk an arbitrary Graph object looking for ids we care about. Used where
  // the schema is deep, version-dependent or simply not worth hard-coding
  // (entitlement management, authentication method policy). The path we return
  // is the explanation — "requestorSettings.allowedRequestors[0].id" says more
  // than "referenced somewhere".
  function deepFind(obj, ids, path = "", out = [], depth = 0) {
    if (obj == null || depth > 10) return out;
    if (typeof obj === "string") {
      if (isGuid(obj) && ids.has(lc(obj))) out.push({ pid: lc(obj), path: path || "(root)" });
      return out;
    }
    if (Array.isArray(obj)) { obj.forEach((v, i) => deepFind(v, ids, `${path}[${i}]`, out, depth + 1)); return out; }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        if (k === "@odata.type" || k === "@odata.context") continue;
        deepFind(v, ids, path ? `${path}.${k}` : k, out, depth + 1);
      }
    }
    return out;
  }

  // Turn a deepFind path into something readable in a table cell.
  function prettyPath(p) {
    return String(p)
      .replace(/\[\d+\]/g, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\./g, " › ")
      .toLowerCase();
  }

  // ------------------------------------------------- Intune assignment shape --
  // Every Intune workload shares one assignment model, which is the only
  // reason 10 sources fit in this file: a target carries an @odata.type of
  // groupAssignmentTarget or exclusionGroupAssignmentTarget plus a groupId.
  function intuneHits(item, nameOf, ids, extra) {
    const name = nameOf(item);
    const out = [];
    for (const a of (item.assignments || [])) {
      const t = a.target || {};
      const ty = lc(t["@odata.type"]);
      let how = null;
      if (ty.includes("exclusiongroupassignmenttarget")) how = "excluded";
      else if (ty.includes("groupassignmenttarget")) how = "assigned";
      if (!how) continue;                       // allDevices / allLicensedUsers
      const pid = lc(t.groupId);
      if (!ids.has(pid)) continue;
      const bits = [];
      if (a.intent) bits.push(`intent: ${a.intent}`);
      if (t.deviceAndAppManagementAssignmentFilterType && lc(t.deviceAndAppManagementAssignmentFilterType) !== "none") {
        bits.push(`filter: ${t.deviceAndAppManagementAssignmentFilterType}`);
      }
      if (extra) bits.push(extra(item));
      out.push({ pid, name, id: item.id, how, detail: bits.filter(Boolean).join(" · ") });
    }
    return out;
  }

  // Graph renames relationships between versions and rejects a query it does
  // not recognise with a flat 400 that names nothing. Rather than pin one
  // spelling and break when it moves, try the candidates in order and take the
  // first that answers — reporting the last error only if all of them fail.
  async function firstThatWorks(urls, label) {
    const errs = [];
    for (const url of urls) {
      try { return { items: await Graph.ggetAll(url), url }; }
      catch (e) { errs.push(`${url.split("?")[0].split("/").pop()}: ${shortErr(e)}`); }
    }
    // Join with "; " — shortErr() splits on " · " to drop Graph's request-id
    // tail, and joining with it here is what swallowed the individual reasons.
    throw new Error(`${label} — none of ${urls.length} known shapes worked: ${errs.join("; ")}`);
  }

  // Run several collection endpoints as one logical source. Each entry is
  // [url, nameField, subLabel]; a 404/403 on one family (a workload the tenant
  // does not have) does not fail the others.
  async function intuneFamily(list, ids, ctx) {
    const hits = [];
    const notes = [];
    const status = ctx && ctx.status;
    for (const [url, nameField, sub] of list) {
      try {
        status?.(sub);
        const items = await safeAll(url);
        for (const it of items) {
          intuneHits(it, (x) => x[nameField] || x.displayName || x.name || x.id, ids)
            .forEach((h) => hits.push({ ...h, sub }));
        }
      } catch (e) { notes.push(`${sub}: ${shortErr(e)}`); }
    }
    // All families failed → the source genuinely could not be read. Some
    // failed → say so, but keep what did come back; a tenant simply may not
    // have that workload.
    if (notes.length === list.length) throw new Error(notes.join("; "));
    notes.forEach((n) => ctx && ctx.note && ctx.note(n));
    return { hits, notes };
  }

  // --------------------------------------------------------------- sources --
  // run(ctx) → [{ pid, name, id, how, detail, sub }]
  // ctx = { ids:Set<string>, principal, isUser, policies, batchIds:[], status(fn) }
  const SOURCES = [

    // ---------------------------------------------------------------- Entra --
    {
      id: "nesting", perObject: true, area: "entra", label: "Entra group nesting",
      doc: "https://learn.microsoft.com/entra/identity/users/groups-self-service-management",
      hint: "Groups this group (or user) is a member of — everything targeted at a parent reaches here too.",
      async run(ctx) {
        const out = [];
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}/memberOf?$select=id,displayName,groupTypes,membershipRule` }));
        if (ctx.isUser) reqs.push({ id: "u", url: `/users/${ctx.principal.id}/memberOf?$select=id,displayName,groupTypes,membershipRule` });
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          if (!v.body) continue;
          const pid = k === "u" ? lc(ctx.principal.id) : lc(ctx.batchIds[+k]);
          for (const o of (v.body.value || [])) {
            if (lc(o["@odata.type"]).includes("administrativeunit")) continue;   // reported separately
            if (lc(o["@odata.type"]).includes("directoryrole")) continue;        // reported separately
            out.push({ pid, name: o.displayName || o.id, id: o.id, how: "member of",
              detail: (o.membershipRule ? "dynamic parent" : "") });
          }
        }
        return out;
      },
    },
    {
      id: "adminUnits", perObject: true, area: "entra", label: "Administrative units",
      doc: "https://learn.microsoft.com/entra/identity/role-based-access-control/administrative-units",
      hint: "An administrative unit scopes delegated admin rights — membership here changes who can manage the object.",
      async run(ctx) {
        const out = [];
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}/memberOf/microsoft.graph.administrativeUnit?$select=id,displayName` }));
        if (ctx.isUser) reqs.push({ id: "u", url: `/users/${ctx.principal.id}/memberOf/microsoft.graph.administrativeUnit?$select=id,displayName` });
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          if (!v.body) continue;
          const pid = k === "u" ? lc(ctx.principal.id) : lc(ctx.batchIds[+k]);
          (v.body.value || []).forEach((o) => out.push({ pid, name: o.displayName || o.id, id: o.id, how: "member of", detail: "" }));
        }
        return out;
      },
    },
    {
      id: "roles",
      roleHint: "A role that can read role assignments — Global Reader, Security Reader or Privileged Role Administrator.", area: "entra", label: "Entra ID directory roles",
      scopes: ["RoleManagement.Read.Directory"],
      doc: "https://learn.microsoft.com/entra/identity/role-based-access-control/groups-concept",
      hint: "Active and PIM-eligible directory role assignments. A role-assignable group turns group membership into privilege.",
      async run(ctx) {
        const out = [];
        const defName = new Map();
        const push = (a, how) => {
          const pid = lc(a.principalId);
          if (!ctx.ids.has(pid)) return;
          const rd = a.roleDefinition || {};
          const nm = rd.displayName || defName.get(lc(a.roleDefinitionId)) || a.roleDefinitionId;
          out.push({ pid, name: nm, id: a.roleDefinitionId, how,
            detail: a.directoryScopeId && a.directoryScopeId !== "/" ? `scoped to ${a.directoryScopeId}` : "tenant-wide" });
        };
        ctx.status?.("active assignments");
        (await safeAll("/roleManagement/directory/roleAssignments?$expand=roleDefinition($select=displayName)"))
          .forEach((a) => push(a, "assigned"));
        try {
          ctx.status?.("PIM-eligible assignments");
          (await safeAll("/roleManagement/directory/roleEligibilitySchedules?$expand=roleDefinition($select=displayName)"))
            .forEach((a) => push(a, "eligible (PIM)"));
        } catch { /* no P2 / no PIM — active assignments still stand */ }
        return out;
      },
    },
    {
      id: "entApps", perObject: true, area: "entra", label: "Enterprise applications",
      scopes: ["Application.Read.All"],
      doc: "https://learn.microsoft.com/entra/identity/enterprise-apps/assign-user-or-group-access-portal",
      hint: "App role assignments — which applications this group grants access to (and with which app role).",
      async run(ctx) {
        const out = [];
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}/appRoleAssignments?$select=resourceDisplayName,resourceId,appRoleId,principalId` }));
        if (ctx.isUser) reqs.push({ id: "u", url: `/users/${ctx.principal.id}/appRoleAssignments?$select=resourceDisplayName,resourceId,appRoleId,principalId` });
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          if (!v.body) continue;
          const pid = k === "u" ? lc(ctx.principal.id) : lc(ctx.batchIds[+k]);
          (v.body.value || []).forEach((a) => out.push({
            pid, name: a.resourceDisplayName || a.resourceId, id: a.resourceId, how: "assigned",
            detail: a.appRoleId && a.appRoleId !== "00000000-0000-0000-0000-000000000000" ? "app role" : "default access",
          }));
        }
        return out;
      },
    },
    {
      id: "licensing", perObject: true, area: "entra", label: "Group-based licensing",
      doc: "https://learn.microsoft.com/entra/identity/users/licensing-groups-assign",
      hint: "Licences assigned through the group. Removing a member removes their licence — and, eventually, their mailbox.",
      async run(ctx) {
        const out = [];
        let skuName = new Map();
        try {
          (await safeAll("/subscribedSkus?$select=skuId,skuPartNumber")).forEach((s) => skuName.set(lc(s.skuId), s.skuPartNumber));
        } catch { /* names fall back to the sku GUID */ }
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}?$select=id,displayName,assignedLicenses` }));
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          const g = v.body; if (!g) continue;
          const pid = lc(ctx.batchIds[+k]);
          (g.assignedLicenses || []).forEach((l) => out.push({
            pid, name: skuName.get(lc(l.skuId)) || l.skuId, id: l.skuId, how: "assigned",
            detail: (l.disabledPlans || []).length ? `${l.disabledPlans.length} service plan(s) disabled` : "all service plans",
          }));
        }
        return out;
      },
    },
    {
      id: "authMethods", area: "entra", label: "Authentication methods policy",
      doc: "https://learn.microsoft.com/entra/identity/authentication/concept-authentication-methods-manage",
      hint: "Which authentication methods the group may register and use, plus the registration campaign and report-suspicious-activity targets.",
      async run(ctx) {
        const p = await Graph.gget("/policies/authenticationMethodsPolicy");
        const out = [];
        const scan = (obj, label) => {
          const walk = (o, depth = 0) => {
            if (!o || typeof o !== "object" || depth > 6) return;
            for (const key of ["includeTargets", "excludeTargets"]) {
              for (const t of (o[key] || [])) {
                const pid = lc(t.id);
                if (!ctx.ids.has(pid)) continue;
                out.push({ pid, name: label, id: o.id || label, how: key === "includeTargets" ? "included" : "excluded",
                  detail: [o.state, t.isRegistrationRequired ? "registration required" : ""].filter(Boolean).join(" · ") });
              }
            }
            for (const v of Object.values(o)) {
              if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
              else if (v && typeof v === "object") walk(v, depth + 1);
            }
          };
          walk(obj);
        };
        for (const c of (p.authenticationMethodConfigurations || [])) scan(c, `Method: ${c.id}`);
        if (p.registrationEnforcement) scan(p.registrationEnforcement, "Registration campaign");
        if (p.reportSuspiciousActivitySettings) {
          const t = p.reportSuspiciousActivitySettings.includeTarget;
          if (t && ctx.ids.has(lc(t.id))) out.push({ pid: lc(t.id), name: "Report suspicious activity", id: "reportSuspiciousActivity", how: "included", detail: p.reportSuspiciousActivitySettings.state || "" });
        }
        return out;
      },
    },
    {
      id: "ca", area: "entra", label: "Conditional Access policies",
      doc: "https://learn.microsoft.com/entra/identity/conditional-access/",
      hint: "The policies ENCA already has in memory — no extra call, and the policy name opens its card.",
      async run(ctx) {
        const out = [];
        for (const p of (ctx.policies || [])) {
          const u = (p.conditions || {}).users || {};
          const state = p.state === "enabled" ? "On" : p.state === "enabledForReportingButNotEnforced" ? "Report-only" : "Off";
          (u.includeGroups || []).forEach((g) => { if (ctx.ids.has(lc(g))) out.push({ pid: lc(g), name: p.displayName, id: p.id, how: "included", detail: state, kind: "ca" }); });
          (u.excludeGroups || []).forEach((g) => { if (ctx.ids.has(lc(g))) out.push({ pid: lc(g), name: p.displayName, id: p.id, how: "excluded", detail: state, kind: "ca" }); });
          if (ctx.isUser) {
            const me = lc(ctx.principal.id);
            (u.includeUsers || []).forEach((x) => { if (lc(x) === me) out.push({ pid: me, name: p.displayName, id: p.id, how: "included", detail: `${state} · direct user`, kind: "ca" }); });
            (u.excludeUsers || []).forEach((x) => { if (lc(x) === me) out.push({ pid: me, name: p.displayName, id: p.id, how: "excluded", detail: `${state} · direct user`, kind: "ca" }); });
          }
          for (const r of (u.includeRoles || [])) if (ctx.ids.has(lc(r))) out.push({ pid: lc(r), name: p.displayName, id: p.id, how: "included", detail: `${state} · via directory role`, kind: "ca" });
          for (const r of (u.excludeRoles || [])) if (ctx.ids.has(lc(r))) out.push({ pid: lc(r), name: p.displayName, id: p.id, how: "excluded", detail: `${state} · via directory role`, kind: "ca" });
        }
        return out;
      },
    },
    {
      id: "accessPackages",
      roleHint: "An entitlement-management role (Catalog reader is the least privileged) or Global Reader / Security Reader / Identity Governance Administrator.", area: "entra", label: "Access packages (entitlement management)",
      scopes: ["EntitlementManagement.Read.All"],
      doc: "https://learn.microsoft.com/entra/id-governance/entitlement-management-overview",
      hint: "Where the group appears in entitlement management — as an allowed requestor, an approver, or a resource an access package grants.",
      // Entitlement management is the one place where hard-coding the schema
      // is a losing game: the relationship names moved between beta and v1.0
      // (accessPackageAssignmentPolicies → assignmentPolicies,
      // accessPackageResourceRoleScopes → resourceRoleScopes) and nested
      // $expand/$select inside an $expand is rejected outright with a bare 400.
      // So: single-level expands only, a candidate ladder per call, and a deep
      // scan of whatever comes back rather than a fixed property path.
      async run(ctx) {
        const out = [];
        const notes = [];
        const scan = async (urls, label, nameOf) => {
          try {
            const { items } = await firstThatWorks(urls, label);
            for (const it of items) {
              for (const h of deepFind(it, ctx.ids)) {
                out.push({ pid: h.pid, name: nameOf(it), id: it.id, how: "referenced", detail: prettyPath(h.path), sub: label });
              }
            }
          } catch (e) { notes.push(shortErr(e, 400)); }
        };
        ctx.status?.("assignment policies");
        await scan([
          "/identityGovernance/entitlementManagement/assignmentPolicies?$expand=accessPackage",
          "/identityGovernance/entitlementManagement/accessPackageAssignmentPolicies?$expand=accessPackage",
          "/identityGovernance/entitlementManagement/assignmentPolicies",
        ], "Assignment policy", (p) => `${(p.accessPackage && p.accessPackage.displayName) || "Access package"} — ${p.displayName || p.id}`);

        ctx.status?.("access packages");
        await scan([
          "/identityGovernance/entitlementManagement/accessPackages?$expand=accessPackageResourceRoleScopes",
          "/identityGovernance/entitlementManagement/accessPackages?$expand=resourceRoleScopes",
          "/identityGovernance/entitlementManagement/accessPackages",
        ], "Access package", (p) => p.displayName || p.id);

        if (notes.length === 2) throw new Error(notes.join(" · "));
        notes.forEach((n) => ctx.note?.(n));
        return out;
      },
    },
    {
      id: "adminConsent", area: "entra", label: "Admin consent request reviewers",
      doc: "https://learn.microsoft.com/entra/identity/enterprise-apps/configure-admin-consent-workflow",
      hint: "Groups nominated to review admin consent requests — a quiet but real privilege.",
      async run(ctx) {
        const p = await Graph.gget("/policies/adminConsentRequestPolicy");
        return (p.reviewers || []).flatMap((r) => {
          const m = /\/groups\/([0-9a-f-]{36})/i.exec(r.query || "");
          const pid = m ? lc(m[1]) : null;
          return pid && ctx.ids.has(pid)
            ? [{ pid, name: "Admin consent request policy", id: "adminConsentRequestPolicy", how: "reviewer", detail: p.isEnabled ? "workflow enabled" : "workflow disabled" }]
            : [];
        });
      },
    },
    {
      id: "mfaReg",
      roleHint: "Reports Reader, Security Reader or Global Reader.", area: "entra", label: "Authentication method registration",
      scopes: ["AuditLog.Read.All"], userOnly: true,
      doc: "https://learn.microsoft.com/entra/identity/authentication/howto-authentication-methods-activity",
      hint: "What the user has actually registered — the difference between a policy requiring MFA and the user being able to satisfy it.",
      async run(ctx) {
        if (!ctx.isUser) return [];
        const d = await Graph.gget(`/reports/authenticationMethods/userRegistrationDetails/${ctx.principal.id}`);
        const pid = lc(ctx.principal.id);
        const row = (name, val, detail) => ({ pid, name, id: name, how: val ? "yes" : "no", detail: detail || "" });
        return [
          row("MFA capable", d.isMfaCapable, (d.methodsRegistered || []).join(", ")),
          row("MFA registered", d.isMfaRegistered, ""),
          row("Passwordless capable", d.isPasswordlessCapable, ""),
          row("SSPR registered", d.isSsprRegistered, d.isSsprEnabled ? "SSPR enabled" : "SSPR not enabled"),
          row("System-preferred method", !!d.systemPreferredAuthenticationMethod, d.systemPreferredAuthenticationMethod || "none"),
        ];
      },
    },

    // --------------------------------------------------------------- Intune --
    {
      id: "intuneEnrollLimit",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Enrolment device limit restrictions",
      scopes: ["DeviceManagementServiceConfig.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/enrollment/enrollment-restrictions-set",
      hint: "How many devices a member may enrol.",
      async run(ctx) {
        const all = await safeAll("/deviceManagement/deviceEnrollmentConfigurations?$expand=assignments");
        return all.filter((c) => lc(c["@odata.type"]).includes("limitconfiguration"))
          .flatMap((c) => intuneHits(c, (x) => x.displayName || x.id, ctx.ids, (x) => x.limit != null ? `limit: ${x.limit}` : ""));
      },
    },
    {
      id: "intuneEnrollPlatform",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Enrolment platform restrictions",
      scopes: ["DeviceManagementServiceConfig.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/enrollment/enrollment-restrictions-set",
      hint: "Which device platforms a member may enrol, and whether personal devices are allowed.",
      async run(ctx) {
        const all = await safeAll("/deviceManagement/deviceEnrollmentConfigurations?$expand=assignments");
        return all.filter((c) => !lc(c["@odata.type"]).includes("limitconfiguration"))
          .flatMap((c) => intuneHits(c, (x) => x.displayName || x.id, ctx.ids,
            (x) => String(x["@odata.type"] || "").split(".").pop().replace(/Configuration$/, "")));
      },
    },
    {
      id: "intuneCompliance",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Compliance policies",
      scopes: ["DeviceManagementConfiguration.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/protect/device-compliance-get-started",
      hint: "Compliance policies decide the 'device is compliant' grant control — this is where CA and Intune meet.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceManagement/deviceCompliancePolicies?$expand=assignments", "displayName", "Compliance policy"],
          ["/deviceManagement/compliancePolicies?$expand=assignments", "name", "Compliance policy (settings catalog)"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },
    {
      id: "intuneConfig",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Configuration profiles",
      scopes: ["DeviceManagementConfiguration.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/configuration/device-profiles",
      hint: "Device configuration, settings-catalog and ADMX profiles — the largest single source of surprise.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceManagement/deviceConfigurations?$expand=assignments", "displayName", "Device configuration"],
          ["/deviceManagement/configurationPolicies?$expand=assignments", "name", "Settings catalog"],
          ["/deviceManagement/groupPolicyConfigurations?$expand=assignments", "displayName", "ADMX template"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },
    {
      id: "intuneScripts",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Scripts & remediations",
      // Scripts have their own permission — see AREA_SCOPES.
      scopes: ["DeviceManagementScripts.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/apps/intune-management-extension",
      hint: "Code that runs on the device. Adding a member here runs a script on their machine.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceManagement/deviceManagementScripts?$expand=assignments", "displayName", "PowerShell script"],
          ["/deviceManagement/deviceShellScripts?$expand=assignments", "displayName", "macOS shell script"],
          ["/deviceManagement/deviceHealthScripts?$expand=assignments", "displayName", "Remediation"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },
    {
      id: "intuneAppProtection",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "App protection policies",
      scopes: ["DeviceManagementApps.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/apps/app-protection-policy",
      hint: "MAM policies — they apply without enrolment, so their reach is easy to underestimate.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceAppManagement/iosManagedAppProtections?$expand=assignments", "displayName", "iOS app protection"],
          ["/deviceAppManagement/androidManagedAppProtections?$expand=assignments", "displayName", "Android app protection"],
          ["/deviceAppManagement/windowsManagedAppProtections?$expand=assignments", "displayName", "Windows app protection"],
          ["/deviceAppManagement/mdmWindowsInformationProtectionPolicies?$expand=assignments", "displayName", "Windows information protection"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },
    {
      id: "intuneAppConfig",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "App configuration policies",
      scopes: ["DeviceManagementApps.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/apps/app-configuration-policies-overview",
      hint: "Settings pushed into apps — for managed devices and for managed apps.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceAppManagement/mobileAppConfigurations?$expand=assignments", "displayName", "Managed devices"],
          ["/deviceAppManagement/targetedManagedAppConfigurations?$expand=assignments", "displayName", "Managed apps"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },
    {
      id: "intuneApps",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Application assignments",
      scopes: ["DeviceManagementApps.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/apps/apps-deploy",
      hint: "Required, available and uninstall assignments. 'Uninstall' is the one worth reading twice.",
      async run(ctx) {
        const apps = await safeAll("/deviceAppManagement/mobileApps?$expand=assignments&$select=id,displayName");
        return apps.flatMap((a) => intuneHits(a, (x) => x.displayName || x.id, ctx.ids));
      },
    },
    {
      id: "intuneAutopilot",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Autopilot deployment profiles",
      scopes: ["DeviceManagementServiceConfig.Read.All"],
      doc: "https://learn.microsoft.com/autopilot/profiles",
      hint: "Which out-of-box experience a device gets. Assigned to device groups, so watch for dynamic rules.",
      async run(ctx) {
        const all = await safeAll("/deviceManagement/windowsAutopilotDeploymentProfiles?$expand=assignments");
        return all.flatMap((p) => intuneHits(p, (x) => x.displayName || x.id, ctx.ids));
      },
    },
    {
      id: "intuneUpdates",
      roleHint: "An Intune RBAC role that can read this workload (e.g. Read Only Operator) and an active Intune licence for the tenant.", area: "intune", label: "Windows update profiles",
      scopes: ["DeviceManagementConfiguration.Read.All"],
      doc: "https://learn.microsoft.com/intune/intune-service/protect/windows-update-for-business-configure",
      hint: "Feature, quality and driver update profiles — update rings themselves live under configuration profiles.",
      async run(ctx) {
        const r = await intuneFamily([
          ["/deviceManagement/windowsFeatureUpdateProfiles?$expand=assignments", "displayName", "Feature update"],
          ["/deviceManagement/windowsQualityUpdateProfiles?$expand=assignments", "displayName", "Quality update"],
          ["/deviceManagement/windowsDriverUpdateProfiles?$expand=assignments", "displayName", "Driver update"],
        ], ctx.ids, ctx);
        return r.hits;
      },
    },

    // -------------------------------------------------------- Microsoft 365 --
    {
      id: "teams", perObject: true, area: "m365", label: "Microsoft 365 groups & Teams",
      doc: "https://learn.microsoft.com/microsoftteams/office-365-groups",
      hint: "Whether the group is a Microsoft 365 group and whether a team is provisioned on it — membership then carries a mailbox, a site and a chat.",
      async run(ctx) {
        const out = [];
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}?$select=id,displayName,groupTypes,resourceProvisioningOptions,mail,visibility,membershipRule` }));
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          const g = v.body; if (!g) continue;
          const pid = lc(ctx.batchIds[+k]);
          const isM365 = (g.groupTypes || []).includes("Unified");
          const isTeam = (g.resourceProvisioningOptions || []).includes("Team");
          if (!isM365 && !isTeam) continue;
          out.push({ pid, name: g.displayName || g.id, id: g.id, how: isTeam ? "team provisioned" : "Microsoft 365 group",
            detail: [g.mail, g.visibility, (g.membershipRule ? "dynamic" : "")].filter(Boolean).join(" · ") });
        }
        return out;
      },
    },

    {
      // The honest limit of what a browser can see of Purview. A container
      // label on a group is exposed on the group object and matters: it drives
      // the team's and site's privacy, guest access, unmanaged-device access
      // and external sharing, so membership plus label is the real posture.
      //
      // The rest of Purview — DLP policies, retention policies and label
      // *publishing* policies, insider risk, communication compliance — has no
      // Microsoft Graph surface at all. It lives behind Security & Compliance
      // PowerShell (Connect-IPPSSession), which a static site cannot call: no
      // CORS, and no delegated Graph token is accepted there. Say so rather
      // than let a clean result imply Purview was checked.
      id: "purviewLabel", perObject: true, area: "m365", label: "Sensitivity label (Purview)",
      doc: "https://learn.microsoft.com/purview/sensitivity-labels-teams-groups-sites",
      hint: "The container label on the group — it governs the team's and site's privacy, guest access and external sharing. Purview's policy surface (DLP, retention, label publishing, insider risk) is not in Microsoft Graph and cannot be read from a browser.",
      async run(ctx) {
        const out = [];
        const reqs = ctx.batchIds.map((id, i) => ({ id: i, url: `/groups/${id}?$select=id,displayName,assignedLabels` }));
        const res = await Graph.gbatch(reqs, ctx.progress);
        for (const [k, v] of Object.entries(res)) {
          const g = v.body; if (!g) continue;
          const pid = lc(ctx.batchIds[+k]);
          (g.assignedLabels || []).forEach((l) => out.push({
            pid, name: l.displayName || l.labelId, id: l.labelId, how: "labelled",
            detail: "container label — privacy, guest access and external sharing",
          }));
        }
        return out;
      },
    },

    // ---------------------------------------------------------------- Azure --
    {
      id: "azureRbac",
      roleHint: "Reader (or any role granting Microsoft.Authorization/roleAssignments/read) on the subscriptions or management groups you want to see.", area: "azure", label: "Azure role assignments",
      arm: true,
      doc: "https://learn.microsoft.com/azure/role-based-access-control/overview",
      hint: "Azure RBAC across every subscription you can read, plus management-group scopes. Needs a separate Azure sign-in.",
      async run(ctx) {
        const out = [];
        const roleName = new Map();
        const nameOf = async (defId) => {
          const k = lc(defId);
          if (roleName.has(k)) return roleName.get(k);
          let n = defId.split("/").pop();
          try { n = (await Graph.aget(`${defId}?api-version=2022-04-01`)).properties.roleName || n; } catch { /* keep the GUID */ }
          roleName.set(k, n);
          return n;
        };
        // Prettify /subscriptions/x/resourceGroups/y/providers/…/z
        const scopeLabel = (s, subName) => {
          if (!s) return "";
          const rg = /\/resourceGroups\/([^/]+)/i.exec(s);
          const res = /\/providers\/[^/]+\/[^/]+\/([^/]+)$/i.exec(s);
          if (/^\/providers\/Microsoft\.Management\/managementGroups\//i.test(s)) return `management group ${s.split("/").pop()}`;
          if (res && rg) return `${subName} › ${rg[1]} › ${res[1]}`;
          if (rg) return `${subName} › resource group ${rg[1]}`;
          return `${subName} (subscription)`;
        };

        const scopes = [];
        ctx.status?.("subscriptions");
        const subs = await Graph.agetAll("/subscriptions?api-version=2022-12-01");
        subs.forEach((s) => scopes.push({ path: `/subscriptions/${s.subscriptionId}`, name: s.displayName || s.subscriptionId, kind: "subscription" }));
        try {
          ctx.status?.("management groups");
          const mgs = await Graph.agetAll("/providers/Microsoft.Management/managementGroups?api-version=2020-05-01");
          mgs.forEach((m) => scopes.push({ path: m.id, name: (m.properties && m.properties.displayName) || m.name, kind: "management group" }));
        } catch { /* no management-group reader — subscriptions still work */ }

        if (!scopes.length) throw new Error("No Azure subscriptions or management groups are visible to this account");

        let i = 0;
        for (const sc of scopes) {
          ctx.status?.(`${sc.kind}: ${sc.name}`);
          ctx.progress?.(++i, scopes.length);
          let ras = [];
          try { ras = await Graph.agetAll(`${sc.path}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`); }
          catch (e) { console.warn("Azure RBAC read failed for", sc.path, shortErr(e)); continue; }
          for (const ra of ras) {
            const pid = lc(ra.properties && ra.properties.principalId);
            if (!ctx.ids.has(pid)) continue;
            out.push({
              pid, name: await nameOf(ra.properties.roleDefinitionId), id: ra.id, how: "assigned",
              detail: scopeLabel(ra.properties.scope, sc.name), sub: sc.kind === "management group" ? "Management group" : "Subscription",
            });
          }
        }
        return out;
      },
    },
  ];

  const sourceById = (id) => SOURCES.find((s) => s.id === id);

  // --------------------------------------------------------- principal load --
  // Accept a GUID, a UPN, a mail nickname or a display name; return whichever
  // of group/user it turns out to be, so the user does not have to say which.
  async function resolvePrincipal(term) {
    term = String(term || "").trim();
    if (!term) throw new Error("Enter a group or user");

    if (isGuid(term)) {
      try {
        const g = await Graph.gget(`/groups/${term}?$select=id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,isAssignableToRole,createdDateTime`);
        return { ...g, type: "group", name: g.displayName || g.id };
      } catch { /* fall through to user */ }
      const u = await Graph.gget(`/users/${term}?$select=id,displayName,userPrincipalName,userType,accountEnabled`);
      return { ...u, type: "user", name: u.displayName || u.userPrincipalName };
    }

    const f = term.replace(/'/g, "''");
    const [gs, us] = await Promise.all([
      Graph.gget(`/groups?$filter=startswith(displayName,'${f}') or mailNickname eq '${f}'&$select=id,displayName,description,groupTypes,membershipRule,securityEnabled,mailEnabled,isAssignableToRole&$top=5`).catch(() => ({ value: [] })),
      Graph.gget(`/users?$filter=startswith(userPrincipalName,'${f}') or startswith(displayName,'${f}')&$select=id,displayName,userPrincipalName,userType,accountEnabled&$top=5`).catch(() => ({ value: [] })),
    ]);
    const hits = [...((gs.value || []).map((g) => ({ ...g, type: "group", name: g.displayName }))),
                 ...((us.value || []).map((u) => ({ ...u, type: "user", name: u.displayName || u.userPrincipalName })))];
    if (!hits.length) throw new Error(`No group or user matches “${term}”`);
    const exact = hits.filter((h) => lc(h.name) === lc(term) || lc(h.userPrincipalName) === lc(term));
    if (exact.length === 1) return exact[0];
    if (hits.length === 1) return hits[0];
    throw new Error(`“${term}” matches ${hits.length} objects — use the exact name or the object ID`);
  }

  // The set of principal ids a hit may be recorded against, and why.
  //   • the object itself
  //   • every group it is transitively a member of (a policy on the parent
  //     reaches the members of this group)
  //   • for a user, also their directory roles (CA can target roles)
  // Nested CHILD groups are collected too, but only to be shown — they widen
  // who is affected, not where the group is used.
  async function buildScope(principal, onStatus) {
    const via = new Map();       // id -> label explaining the relationship
    via.set(lc(principal.id), principal.type === "user" ? "the user" : "the group itself");
    const parents = [], children = [], roles = [];

    onStatus?.("Expanding memberships…");
    const base = principal.type === "user" ? `/users/${principal.id}` : `/groups/${principal.id}`;
    let mem = [];
    try { mem = await Graph.ggetAll(`${base}/transitiveMemberOf?$select=id,displayName,roleTemplateId`); }
    catch (e) { console.warn("transitiveMemberOf failed:", shortErr(e)); }
    for (const o of mem) {
      const ty = lc(o["@odata.type"]);
      if (ty.includes("directoryrole")) {
        if (o.roleTemplateId) { via.set(lc(o.roleTemplateId), `via directory role “${o.displayName}”`); roles.push({ id: o.roleTemplateId, name: o.displayName }); }
        via.set(lc(o.id), `via directory role “${o.displayName}”`);
      } else if (ty.includes("administrativeunit")) {
        /* administrative units are reported by their own source */
      } else {
        via.set(lc(o.id), `via parent group “${o.displayName}”`);
        parents.push({ id: o.id, name: o.displayName });
      }
    }

    if (principal.type === "group") {
      try {
        (await Graph.ggetAll(`/groups/${principal.id}/transitiveMembers/microsoft.graph.group?$select=id,displayName`))
          .forEach((g) => children.push({ id: g.id, name: g.displayName }));
      } catch (e) { console.warn("nested members failed:", shortErr(e)); }
    }

    // Only real groups may be asked /groups/{id}/… — the user's own id and the
    // role template ids live in the match set but would 404 in a batch.
    const groupIds = [];
    if (principal.type === "group") groupIds.push(principal.id);
    parents.forEach((p) => groupIds.push(p.id));

    return { via, ids: new Set(via.keys()), groupIds, parents, children, roles };
  }

  // A bare "403" or "400" tells nobody what to do next. Say which permission
  // the call needs and which role the signed-in user needs on top of it —
  // those are different things, and a scope alone is often not enough.
  function whyFailed(src, e) {
    const m = String((e && e.message) || e);
    const scopes = (src.scopes || AREA_SCOPES[src.area] || []);
    if (/\b(401|403)\b|Authorization_RequestDenied|Insufficient privileges|Forbidden/i.test(m)) {
      return [
        scopes.length ? `Needs ${scopes.join(" or ")}.` : "",
        src.roleHint ? `Also needs: ${src.roleHint}` : "",
      ].filter(Boolean).join(" ");
    }
    if (/\b400\b|BadRequest/i.test(m)) return "Graph rejected the query — usually a schema that moved. Worth reporting.";
    if (/\b404\b/i.test(m)) return "Not present in this tenant — normal when the workload is not licensed or used.";
    if (/\b429\b/i.test(m)) return "Throttled. Try again, or narrow the sweep.";
    return "";
  }

  // ------------------------------------------------------------------- run --
  // sources: array of source ids to run. Everything else comes from ctx.
  // Returns { rows, ran:[{id,label,count,ms}], failed:[{id,label,error}], skipped:[] }
  async function analyze(opts) {
    const { ids, principal, isUser, policies, sourceIds, onStatus, onSource } = opts;
    const batchIds = opts.batchIds || [...ids].filter(isGuid);
    const rows = [], ran = [], failed = [], skipped = [], partial = [];

    for (const id of sourceIds) {
      const src = sourceById(id);
      if (!src) continue;
      if (src.userOnly && !isUser) { skipped.push({ id, label: src.label, area: src.area, why: "user input only" }); continue; }
      const t0 = Date.now();
      onSource?.(src);
      const notes = [];
      const ctx = {
        ids, principal, isUser, policies, batchIds,
        note: (m) => notes.push(m),
        status: (s) => onStatus?.(`${src.label} — ${s}`),
        progress: (a, b) => onStatus?.(`${src.label} — ${a}/${b}`),
      };
      try {
        onStatus?.(src.label);
        const hits = (await src.run(ctx)) || [];
        hits.forEach((h) => rows.push({ ...h, source: src.id, area: src.area, sourceLabel: src.label }));
        ran.push({ id, label: src.label, area: src.area, count: hits.length, ms: Date.now() - t0 });
        if (notes.length) partial.push({ id, label: src.label, area: src.area, notes });
      } catch (e) {
        failed.push({ id, label: src.label, area: src.area, error: shortErr(e), why: whyFailed(src, e) });
      }
    }
    return { rows, ran, failed, skipped, partial };
  }

  // ------------------------------------------------------------- reporting --
  function byArea(rows) {
    const m = new Map(AREAS.map((a) => [a.id, []]));
    for (const r of rows) {
      if (!m.has(r.area)) m.set(r.area, []);
      m.get(r.area).push(r);
    }
    return m;
  }

  // Rows for one principal, grouped by source, in SOURCES order.
  function grouped(rows) {
    const order = new Map(SOURCES.map((s, i) => [s.id, i]));
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.source)) m.set(r.source, []);
      m.get(r.source).push(r);
    }
    return [...m.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
      .map(([id, rs]) => ({ source: sourceById(id), rows: rs.sort((x, y) => String(x.name).localeCompare(String(y.name))) }));
  }

  // Sweep totals per group: { id, name, entra, intune, m365, azure, total }
  function sweepTotals(groups, rows) {
    const per = new Map(groups.map((g) => [lc(g.id), {
      id: g.id, name: g.displayName || g.id,
      dynamic: !!g.membershipRule, roleAssignable: !!g.isAssignableToRole,
      // set when the scope was "used by Conditional Access": the id a policy
      // names but the directory no longer has, and the policies that name it
      missing: !!g.missing, caPolicies: g.caPolicies || [],
      entra: 0, intune: 0, m365: 0, azure: 0, total: 0,
    }]));
    for (const r of rows) {
      const e = per.get(r.pid);
      if (!e) continue;
      e[r.area] = (e[r.area] || 0) + 1;
      e.total++;
    }
    return [...per.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- exports --
  function markdown(res, meta) {
    const L = [];
    L.push(`# Group Analyzer — ${meta.principalName}`, "");
    L.push(Brand.generatedBy("Generated"));
    L.push("", `- **Object:** ${mdCell(meta.principalName)} (${meta.principalType}) \`${meta.principalId}\``);
    if (meta.parents?.length) L.push(`- **Member of:** ${meta.parents.map((p) => mdCell(p.name)).join(", ")}`);
    if (meta.children?.length) L.push(`- **Contains groups:** ${meta.children.map((p) => mdCell(p.name)).join(", ")}`);
    if (meta.roles?.length) L.push(`- **Directory roles:** ${meta.roles.map((p) => mdCell(p.name)).join(", ")}`);
    L.push(`- **Hits:** ${res.rows.length} across ${new Set(res.rows.map((r) => r.source)).size} services`, "");

    for (const a of AREAS) {
      const gs = grouped(res.rows.filter((r) => r.area === a.id));
      if (!gs.length) continue;
      L.push(`## ${a.icon} ${a.label}`, "");
      for (const g of gs) {
        L.push(`### ${g.source.label} (${g.rows.length})`, "");
        L.push("| Object | How | Detail | Matched via |", "| --- | --- | --- | --- |");
        g.rows.forEach((r) => L.push(`| ${mdCell(r.name)}${r.sub ? ` *(${mdCell(r.sub)})*` : ""} | ${mdCell(r.how)} | ${mdCell(r.detail)} | ${mdCell(meta.via.get(r.pid) || r.pid)} |`));
        L.push("");
      }
    }

    if (res.failed.length) {
      L.push("## Not read", "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}${f.why ? ` *${mdCell(f.why)}*` : ""}`));
      L.push("");
    }
    (res.partial || []).forEach((p) => L.push(`- **${mdCell(p.label)}** — read, but partly: ${mdCell(p.notes.join("; "))}`));
    if (res.skipped.length) {
      res.skipped.forEach((s) => L.push(`- *${mdCell(s.label)} skipped — ${mdCell(s.why)}*`));
      L.push("");
    }
    const clean = SOURCES.filter((s) => res.ran.some((r) => r.id === s.id && !r.count));
    if (clean.length) L.push(`*No usage found in: ${clean.map((s) => mdCell(s.label)).join(", ")}.*`, "");
    return L.join("\n");
  }

  // ---- standalone HTML report ----------------------------------------------
  // Self-contained, neutral (no product branding beyond the credit line), and
  // openable by someone who has no access to the tenant — the artefact you
  // attach to a change request when you argue that a group must not be touched.
  const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5fa;color:#1f2330}
header{padding:18px 26px;background:#1f2933;color:#fff}h1{margin:0;font-size:19px}
.meta{color:#c8d1d9;font-size:12px;margin-top:4px}
.cards{display:flex;gap:12px;padding:14px 26px;background:#fff;border-bottom:1px solid #e6e6ee;flex-wrap:wrap}
.card{background:#f7f8fc;border:1px solid #e6e6ee;border-radius:10px;padding:10px 16px;min-width:120px}
.card .n{font-size:22px;font-weight:700}.card .l{font-size:11px;color:#6b7280;text-transform:uppercase}
.card.zero .n{color:#9aa0ab}
main{padding:18px 26px;max-width:1400px}
section.area{background:#fff;border:1px solid #e6e6ee;border-radius:10px;margin-bottom:16px;overflow:hidden}
section.area>h2{margin:0;padding:12px 18px;font-size:15px;background:#f1f2f8;border-bottom:1px solid #e6e6ee}
section.area>h2 span{font-weight:400;color:#6b7280;font-size:12px}
.src{padding:14px 18px;border-bottom:1px solid #f0f0f5}.src:last-child{border-bottom:0}
.src h3{margin:0 0 2px;font-size:13.5px}
.src .hint{margin:0 0 8px;font-size:12px;color:#6b7280}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{background:#f7f8fc;padding:8px 12px;text-align:left;border-bottom:1px solid #e6e6ee;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
td{padding:8px 12px;border-bottom:1px solid #f4f4f8;vertical-align:top}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums}.zero{color:#c2c7d0}
.how{display:inline-block;padding:1px 9px;border-radius:11px;font-size:11px;font-weight:700;background:#f0f1f6;color:#6b7280;white-space:nowrap}
.how.inc{background:#e6f5ec;color:#0a7d39}.how.exc{background:#fde8e6;color:#c0392b}.how.priv{background:#fff3cd;color:#8a5a00}
.via{color:#6b7280;font-size:12px}.via.parent{color:#8a5a00}
.mini{font-size:12px;color:#6b7280}
.fail{border:1px solid #e6e6ee;border-left:3px solid #c0392b;border-radius:8px;padding:9px 13px;margin:8px 0;font-size:12.5px;background:#fff}
.fail.skip{border-left-color:#9aa0ab}.fail .why{color:#6b7280;display:block;margin-top:2px}
footer{padding:16px 26px;color:#6b7280;font-size:12px}`;

  const HOW_CLASS = (h) => /exclud/i.test(h) ? "exc"
    : /assigned|included|member of|referenced|team|Microsoft 365|labelled|^yes$/i.test(h) ? "inc"
    : /eligible|reviewer/i.test(h) ? "priv" : "";

  function failHtml(res) {
    const partial = res.partial || [];
    if (!res.failed.length && !res.skipped.length && !partial.length) return "";
    return `<section class="area"><h2>Not read</h2><div class="src">
      <p class="hint">“Nothing found” only means “nothing found in what was actually read”. Check this list before concluding a group is unused.</p>
      ${res.failed.map((f) => `<div class="fail"><b>${esc(f.label)}</b> — ${esc(f.error)}${f.why ? `<span class="why">${esc(f.why)}</span>` : ""}</div>`).join("")}
      ${partial.map((p) => `<div class="fail skip"><b>${esc(p.label)}</b> — read, but partly: ${esc(p.notes.join("; "))}</div>`).join("")}
      ${res.skipped.map((s) => `<div class="fail skip"><b>${esc(s.label)}</b> — skipped (${esc(s.why)})</div>`).join("")}
    </div></section>`;
  }

  function html(res, meta) {
    const per = byArea(res.rows);
    const cards = AREAS.map((a) => {
      const n = (per.get(a.id) || []).length;
      return `<div class="card${n ? "" : " zero"}"><div class="n">${n}</div><div class="l">${esc(a.label)}</div></div>`;
    }).join("");
    const areas = AREAS.map((a) => {
      const gs = grouped(per.get(a.id) || []);
      if (!gs.length) return "";
      return `<section class="area"><h2>${a.icon} ${esc(a.label)} <span>${(per.get(a.id) || []).length} references</span></h2>
        ${gs.map((g) => `<div class="src"><h3>${esc(g.source.label)} <span class="mini">${g.rows.length}</span></h3>
          <p class="hint">${esc(g.source.hint || "")}</p>
          <table><thead><tr><th>Object</th><th>How</th><th>Detail</th><th>Matched via</th></tr></thead><tbody>
          ${g.rows.map((r) => {
            const v = meta.via.get(r.pid) || r.pid;
            return `<tr><td>${esc(r.name)}${r.sub ? ` <span class="mini">${esc(r.sub)}</span>` : ""}</td>
              <td><span class="how ${HOW_CLASS(r.how)}">${esc(r.how)}</span></td>
              <td class="mini">${esc(r.detail || "")}</td>
              <td class="via${/parent group|directory role/.test(v) ? " parent" : ""}">${esc(v)}</td></tr>`;
          }).join("")}
          </tbody></table></div>`).join("")}
      </section>`;
    }).join("");
    const rel = [];
    if (meta.parents?.length) rel.push(`Member of ${meta.parents.map((p) => esc(p.name)).join(", ")}`);
    if (meta.children?.length) rel.push(`Contains ${meta.children.map((p) => esc(p.name)).join(", ")}`);
    if (meta.roles?.length) rel.push(`Roles: ${meta.roles.map((p) => esc(p.name)).join(", ")}`);
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Group Analyzer — ${esc(meta.principalName)}</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Group usage — ${esc(meta.principalName)}</h1>
  <div class="meta">${esc(meta.principalType)} · ${esc(meta.principalId)}${meta.tenant ? ` · ${esc(meta.tenant)}` : ""} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</div></header>
<div class="cards"><div class="card"><div class="n">${res.rows.length}</div><div class="l">References</div></div>${cards}</div>
<main>${rel.length ? `<p class="mini">${rel.join(" · ")}</p>` : ""}
${areas || '<section class="area"><div class="src"><p class="hint">No references found in the services that were read.</p></div></section>'}
${failHtml(res)}</main>
<footer>${esc(Brand.generatedBy("Generated"))}</footer></body></html>`;
  }

  function sweepHtml(totals, res, meta) {
    const unused = totals.filter((t) => !t.total);
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Group Analyzer — tenant sweep</title><style>${REPORT_CSS}</style></head><body>
<header><h1>Group usage — tenant sweep</h1>
  <div class="meta">${totals.length} groups${meta && meta.scopeNote ? ` where ${esc(meta.scopeNote)}` : ""} · ${res.rows.length} references${meta && meta.tenant ? ` · ${esc(meta.tenant)}` : ""} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</div></header>
<div class="cards">
  <div class="card"><div class="n">${totals.length}</div><div class="l">Groups</div></div>
  <div class="card${unused.length ? "" : " zero"}"><div class="n">${unused.length}</div><div class="l">No usage found</div></div>
  <div class="card"><div class="n">${res.ran.length}</div><div class="l">Services read</div></div>
  <div class="card${res.failed.length ? "" : " zero"}"><div class="n">${res.failed.length}</div><div class="l">Not read</div></div>
</div>
<main><section class="area"><h2>Groups by reference count</h2><div class="src">
<table><thead><tr><th>Group</th>${AREAS.map((a) => `<th class="num">${esc(a.label)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
${totals.map((t) => `<tr><td>${esc(t.name)}${t.dynamic ? ' <span class="mini">dynamic</span>' : ""}${t.roleAssignable ? ' <span class="mini">role-assignable</span>' : ""}${t.missing ? ' <span class="how exc">not in the directory</span>' : ""}<br><span class="mini">${esc(t.id)}</span>${t.missing && t.caPolicies.length ? `<br><span class="mini">named by ${esc(t.caPolicies.join(", "))}</span>` : ""}</td>
  ${AREAS.map((a) => `<td class="num${t[a.id] ? "" : " zero"}">${t[a.id] || 0}</td>`).join("")}
  <td class="num"><b>${t.total}</b></td></tr>`).join("")}
</tbody></table></div></section>
${unused.length ? `<section class="area"><h2>Groups with no usage found <span>${unused.length}</span></h2><div class="src">
  <p class="hint">Nothing in the services read below references these groups. Read “Not read” before deleting anything.</p>
  <table><thead><tr><th>Group</th><th>Object ID</th></tr></thead><tbody>
  ${unused.map((t) => `<tr><td>${esc(t.name)}</td><td class="mini">${esc(t.id)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
${failHtml(res)}</main>
<footer>${esc(Brand.generatedBy("Generated"))} · Services read: ${res.ran.map((r) => esc(r.label)).join(", ")}.</footer></body></html>`;
  }

  // Everything the sweep already knows about one group — no new Graph calls.
  const rowsFor = (rows, pid) => rows.filter((r) => r.pid === lc(pid));

  function csv(res, meta) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = ["Area,Service,Object,ObjectId,How,Detail,MatchedVia,MatchedId"];
    res.rows.forEach((r) => out.push([
      AREAS.find((a) => a.id === r.area)?.label || r.area, r.sourceLabel + (r.sub ? ` / ${r.sub}` : ""),
      r.name, r.id, r.how, r.detail, meta.via.get(r.pid) || "", r.pid,
    ].map(q).join(",")));
    return out.join("\n");
  }

  function sweepCsv(totals) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = ["Group,GroupId,Dynamic,RoleAssignable,InDirectory,NamedByCAPolicies,Entra,Intune,Microsoft365,Azure,Total"];
    totals.forEach((t) => out.push([t.name, t.id, t.dynamic ? "yes" : "no", t.roleAssignable ? "yes" : "no",
      t.missing ? "no" : "yes", (t.caPolicies || []).join("; "), t.entra, t.intune, t.m365, t.azure, t.total].map(q).join(",")));
    return out.join("\n");
  }

  function sweepMarkdown(totals, res, meta) {
    const L = [`# Group Analyzer — tenant sweep`, "", Brand.generatedBy("Generated"), "",
      `- **Groups analysed:** ${totals.length}${meta && meta.scopeNote ? ` (${mdCell(meta.scopeNote)})` : ""}`,
      `- **Groups with no usage found:** ${totals.filter((t) => !t.total).length}`,
      `- **Total references:** ${res.rows.length}`, "",
      "| Group | Entra | Intune | M365 | Azure | Total |", "| --- | ---: | ---: | ---: | ---: | ---: |"];
    totals.forEach((t) => L.push(`| ${mdCell(t.name)}${t.dynamic ? " *(dynamic)*" : ""}${t.roleAssignable ? " *(role-assignable)*" : ""}${t.missing ? " **⚠ not in the directory**" : ""} | ${t.entra} | ${t.intune} | ${t.m365} | ${t.azure} | **${t.total}** |`));
    const gone = totals.filter((t) => t.missing);
    if (gone.length) {
      L.push("", `## Dangling references (${gone.length})`, "",
        "*A Conditional Access policy still names these ids, but the directory no longer has the group — so that assignment targets nobody.*", "",
        "| Object ID | Named by |", "| --- | --- |");
      gone.forEach((t) => L.push(`| \`${mdCell(t.id)}\` | ${mdCell(t.caPolicies.join(", "))} |`));
    }
    const unused = totals.filter((t) => !t.total);
    if (unused.length) {
      L.push("", `## Groups with no usage found (${unused.length})`, "",
        "*Nothing in the services read below references these groups. Check the “Not read” list before deleting anything.*", "");
      unused.forEach((t) => L.push(`- ${mdCell(t.name)} \`${t.id}\``));
    }
    if (res.failed.length) {
      L.push("", "## Not read", "");
      res.failed.forEach((f) => L.push(`- **${mdCell(f.label)}** — ${mdCell(f.error)}${f.why ? ` *${mdCell(f.why)}*` : ""}`));
    }
    L.push("", `*Services read: ${res.ran.map((r) => mdCell(r.label)).join(", ")}.*`);
    return L.join("\n");
  }

  return {
    AREAS, AREA_SCOPES, SOURCES, sourceById,
    resolvePrincipal, buildScope, analyze,
    grouped, byArea, sweepTotals, rowsFor,
    markdown, csv, html, sweepCsv, sweepMarkdown, sweepHtml,
    esc, isGuid, shortErr, HOW_CLASS,
  };
})();
