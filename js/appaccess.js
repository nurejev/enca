// ======================================================================
// T60 — 🔑 App access review (BETA, Workspace 03 · Entra Tools).
//
// Every app that can reach this tenant's data — what it can do, who let it
// in, whether it is still used — and a decision for each one. Built on
// Mihai's ask of 18 Oct 2026: customers on Microsoft 365 Business Premium
// cannot use Defender for Cloud Apps app governance, and the community
// report (MSIdentityTools Export-MsIdAppConsentGrantReport, his
// NewReport-OATH_Audit.ps1 wrapper) has the right idea and a weak engine.
// Design, script review and governance runbook: review/2026-10-18/
// t60-app-access/ and the project doc claude/ENCA-t60-app-access-review.md.
//
// WHAT THE COMMUNITY REPORT GOT WRONG, AND WHAT THIS DOES INSTEAD
//   • It reads application permissions with $expand=appRoleAssignments.
//     Graph returns at most 20 expanded items and NO next page — on devcf
//     Lokka MCP showed 20 of its 88. Here: expand, then re-read every app
//     that came back with exactly 20 (EXPAND_CAP), paged.
//   • It read delegated grants one service principal at a time and lost the
//     ones that failed. Here: ONE tenant-wide /oauth2PermissionGrants list.
//   • It rated by permission NAME only. Here: tier by permission AND API,
//     plus the directory roles the app holds, with the reason in words.
//   • It could not say whether an app is used, who consented, or how it
//     signs in. Here: sign-in activity, the consent events of the audit
//     window, secrets vs certificates, owners, roles, consent settings.
//
// ONE ROW PER APP. An app is a service principal that is the CLIENT of a
// delegated grant, the PRINCIPAL of an application permission, or holds a
// directory role. Resource-only service principals are counted, not listed.
//
// DECISIONS (Mihai 18 Oct: "the recommended option") live on the service
// principal's own Notes field, one line beginning "ENCA T60 ·", so the
// portal and the next admin see them and nothing depends on this browser.
//
// Writes, each with a fresh read before and a read-back after (the T59
// pattern), behind an io seam so the tests and the demo walk the same code:
//   approve    PATCH notes                         Application.ReadWrite.All
//   quarantine PATCH accountEnabled false + notes  Application.ReadWrite.All
//   enable     PATCH accountEnabled true  + notes  Application.ReadWrite.All
//   restrict   POST appRoleAssignedTo (group) then PATCH appRoleAssignmentRequired
//                                                  + AppRoleAssignment.ReadWrite.All
//   revoke     PATCH/DELETE oauth2PermissionGrants, DELETE appRoleAssignedTo
//                                                  + DelegatedPermissionGrant.ReadWrite.All
//   remove     revoke everything, then DELETE the service principal (only an
//              app already quarantined — dark before gone, as T59)
//   restore    POST /directory/deletedItems/{id}/restore, then grant back
//   acrp       PUT /policies/adminConsentRequestPolicy   Policy.ReadWrite.ConsentRequest
// Never on the registration ENCA is signed in with; never quarantine,
// reduce or remove one of Microsoft's own apps (its developer tools are the
// exception — Graph Command Line Tools may be restricted or switched off).
// ======================================================================
const AppAccess = (() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();
  const V1 = "/v1.0";
  const EXPAND_CAP = 20;
  const DAY = 86400000;
  const UNUSED_DAYS = 90;
  const GRAPH_APP = "00000003-0000-0000-c000-000000000000";
  const EXO_APP = "00000002-0000-0ff1-ce00-000000000000";
  const SPO_APP = "00000003-0000-0ff1-ce00-000000000000";
  const ARM_APP = "797f4846-ba00-4fd7-ba43-dac1f8f63013";
  const DEFAULT_ROLE = "00000000-0000-0000-0000-000000000000";
  const SCOPES = {
    notes: ["Application.ReadWrite.All"],
    assign: ["Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All"],
    revoke: ["Application.ReadWrite.All", "DelegatedPermissionGrant.ReadWrite.All", "AppRoleAssignment.ReadWrite.All"],
    acrp: ["Policy.ReadWrite.ConsentRequest"],
    audit: ["AuditLog.Read.All"],
  };
  // Tenants that own Microsoft's first-party apps (the two the community
  // report knew, the PME tenant, and the one that owns Graph Command Line
  // Tools — verified publisher Microsoft Corporation, which the community
  // report showed as "not Microsoft").
  const MS_TENANTS = new Set(["f8cdef31-a31e-4b4a-93e4-5f571e91255a", "72f988bf-86f1-41af-91ab-2d7cd011db47", "33e01921-4d64-4f8c-a055-5bdaffd5e33d", "cdc5aeea-15c5-4db6-b079-fcadd2505dc2"]);
  // Microsoft's developer tools are tools people RUN: what they can do is
  // decided by who may sign in to them, so they are reviewed, not trusted.
  const DEV_TOOLS = {
    "14d82eec-204b-4c2f-b7e8-296a70dab67e": "Microsoft Graph Command Line Tools",
    "de8bc8b5-d9f9-48b1-a8ad-b748da725064": "Graph Explorer",
    "04b07795-8ddb-461a-bbee-02f9e1bf7b46": "Azure CLI",
    "1950a258-227b-4e31-a9cf-717495945fc2": "Azure PowerShell",
    "1b730954-1685-4b74-9bfd-dac224a7b894": "Azure AD PowerShell",
    "fb78d390-0c51-40cd-8e17-fdbfab77341b": "Exchange Online PowerShell",
    "9bc3ab49-b65d-410a-85ad-de819febfddc": "SharePoint Online Management Shell",
    "12128f48-ec9e-42f0-b203-ea49fb6af367": "Microsoft Teams PowerShell",
  };
  // Partner tenants (Mihai 18 Oct: "PARTNERS LIMON-IT, DOVILO, Cloudfellows").
  // Editable on the screen; this is the default list.
  const PARTNERS_DEFAULT = [
    { tenantId: "ad715e59-d216-44ac-9b48-4ea9367886e5", name: "Limon-IT" },
    { tenantId: "e813e829-283a-4b53-97cd-bdeb800c764a", name: "CloudFellows" },
    { tenantId: "020eb2d3-8046-4257-828d-64bf3ece8fbb", name: "CloudFellows (dev)" },
    { tenantId: "e5a881ef-27f1-496c-a1ac-b9ef42f1dafa", name: "Dovilo" },
  ];

  // ---- tiers -----------------------------------------------------------
  const RANK = { info: 0, low: 1, med: 2, high: 3, ep: 4, t0: 5 };
  const TIER_LABEL = { t0: "TIER 0", ep: "ENDPOINT", high: "HIGH", med: "MEDIUM", low: "LOW", info: "INFO" };
  const CAPS = {
    grant: { row: "Give itself or others any permission", verb: "give itself or others any permission" },
    roles: { row: "Assign directory roles or change PIM", verb: "assign directory roles or change PIM" },
    authn: { row: "Reset sign-in methods or passwords", verb: "reset sign-in methods or passwords" },
    ca: { row: "Change Conditional Access or authentication policy", verb: "change Conditional Access or authentication policy" },
    consent: { row: "Change consent, authorization or domain settings", verb: "change consent, authorization or domain settings" },
    dir: { row: "Write the whole directory", verb: "write the whole directory" },
    devices: { row: "Push apps, scripts or settings to every device", verb: "push apps, scripts or settings to every managed device" },
    intune: { row: "Change Intune enrolment and devices", verb: "change Intune enrolment and devices" },
    users: { row: "Change users and groups", verb: "change users and groups" },
    files: { row: "Every site and file", verb: "reach every site and file" },
    mail: { row: "Every mailbox", verb: "reach every mailbox" },
    chat: { row: "Every chat and channel message", verb: "read every chat and channel message" },
    azure: { row: "Manage Azure as the user", verb: "manage Azure as the signed-in user" },
    read: { row: "Read the directory, policies or logs", verb: "read the directory, policies or logs" },
    scoped: { row: "Scoped to chosen sites only", verb: "reach only the sites it was given" },
    signin: { row: "Sign people in", verb: "sign people in and read their profile" },
    write: { row: "Write other data", verb: "write data across the tenant" },
  };
  const MATRIX_ROWS = ["grant", "roles", "authn", "ca", "consent", "dir", "devices", "intune", "users", "files", "mail", "chat", "azure", "scoped"];
  // First match wins. t: app | del | *  ·  api: GRAPH_APP / EXO_APP / SPO_APP / ARM_APP / *
  const R = (t, api, re, tier, cap) => ({ t, api, re, tier, cap });
  const RULES = [
    R("*", "*", /^Sites\.Selected$|^Files\.SelectedOperations\.Selected$|^Lists\.SelectedOperations\.Selected$|^ListItems\.SelectedOperations\.Selected$/, "low", "scoped"),
    R("*", GRAPH_APP, /^(AppRoleAssignment\.ReadWrite\.All|Application\.ReadWrite\.All|DelegatedPermissionGrant\.ReadWrite\.All)$/, "t0", "grant"),
    R("*", GRAPH_APP, /^(RoleManagement\.ReadWrite\.Directory|RoleAssignmentSchedule\.ReadWrite\.Directory|RoleEligibilitySchedule\.ReadWrite\.Directory|RoleManagementPolicy\.ReadWrite\.(Directory|AzureADGroup)|PrivilegedAccess\.ReadWrite\.AzureADGroup|Privileged(Assignment|Eligibility)Schedule\.ReadWrite\.AzureADGroup)$/, "t0", "roles"),
    R("*", GRAPH_APP, /^(UserAuthenticationMethod\.ReadWrite\.All|User-PasswordProfile\.ReadWrite\.All|User\.ManageCreds\.All)$/, "t0", "authn"),
    R("*", GRAPH_APP, /^(Policy\.ReadWrite\.ConditionalAccess|Policy\.ReadWrite\.AuthenticationMethod|Organization\.ReadWrite\.All)$/, "t0", "ca"),
    R("*", GRAPH_APP, /^(Policy\.ReadWrite\.PermissionGrant|Policy\.ReadWrite\.Authorization|Domain\.ReadWrite\.All|Directory\.AccessAsUser\.All)$/, "t0", "consent"),
    R("*", GRAPH_APP, /^Directory\.ReadWrite\.All$/, "t0", "dir"),
    R("*", GRAPH_APP, /^(DeviceManagementApps\.ReadWrite\.All|DeviceManagementScripts\.ReadWrite\.All|DeviceManagementConfiguration\.ReadWrite\.All|DeviceManagementRBAC\.ReadWrite\.All|DeviceManagementManagedDevices\.PrivilegedOperations\.All)$/, "ep", "devices"),
    R("*", GRAPH_APP, /^(DeviceManagementServiceConfig\.ReadWrite\.All|DeviceManagementManagedDevices\.ReadWrite\.All|Device\.ReadWrite\.All|CloudPC\.ReadWrite\.All)$/, "high", "intune"),
    R("*", GRAPH_APP, /^(User\.ReadWrite\.All|Group\.ReadWrite\.All|GroupMember\.ReadWrite\.All|EntitlementManagement\.ReadWrite\.All|User\.EnableDisableAccount\.All|User\.DeleteRestore\.All|AdministrativeUnit\.ReadWrite\.All)$/, "high", "users"),
    R("*", "*", /^(Sites\.(Read|ReadWrite|Manage|FullControl)\.All|Files\.(Read|ReadWrite)\.All|AllSites\.(Read|Write|Manage|FullControl)|MyFiles\.(Read|Write)|TermStore\.ReadWrite\.All)$/, "high", "files"),
    R("*", "*", /^(Mail\.(Read|ReadWrite|Send|ReadBasic)(\.All|\.Shared)?|MailboxSettings\.ReadWrite|full_access_as_app|full_access_as_user|EWS\.AccessAsUser\.All|IMAP\.AccessAsUser\.All|POP\.AccessAsUser\.All|EAS\.AccessAsUser\.All|Mail\.ReadWrite\.Shared|Calendars\.(Read|ReadWrite)(\.All|\.Shared)?|Contacts\.(Read|ReadWrite)(\.All|\.Shared)?)$/, "high", "mail"),
    R("*", GRAPH_APP, /^(Chat\.(Read|ReadWrite|ReadBasic)\.All|ChannelMessage\.(Read|ReadWrite)\.All|OnlineMeetingTranscript\.Read\.All|OnlineMeetingRecording\.Read\.All|CallRecords\.Read\.All)$/, "high", "chat"),
    R("del", GRAPH_APP, /^(Chat\.(Read|ReadWrite)|ChannelMessage\.Read\.All|OnlineMeetings\.ReadWrite)$/, "high", "chat"),
    R("del", ARM_APP, /^user_impersonation$/, "high", "azure"),
    R("del", GRAPH_APP, /^(openid|profile|email|offline_access|User\.Read|User\.ReadBasic\.All)$/, "low", "signin"),
    R("*", "*", /\.ReadWrite(\.|$)|\.Write$|\.Manage\.|\.FullControl/, "high", "write"),
    R("*", "*", /\.Read(\.|$)|\.ReadBasic|^Exchange\.ManageAsApp$|user_impersonation$|Read\.All$/, "med", "read"),
  ];
  // Directory roles an app can hold, by template id.
  const ROLE_TIER = {
    "62e90394-69f5-4237-9190-012177145e10": ["t0", "roles"],   // Global Administrator
    "e8611ab8-c189-46e8-94e1-60213ab1f814": ["t0", "roles"],   // Privileged Role Administrator
    "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": ["t0", "authn"],   // Privileged Authentication Administrator
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3": ["t0", "grant"],   // Application Administrator
    "158c047a-c907-4556-b7ef-446551a6b5f7": ["t0", "grant"],   // Cloud Application Administrator
    "8ac3fc64-6eca-42ea-9e69-59f4c7b60eb2": ["t0", "consent"], // Hybrid Identity Administrator
    "194ae4cb-b126-40b2-bd5b-6091b380977d": ["t0", "ca"],      // Security Administrator
    "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9": ["t0", "ca"],      // Conditional Access Administrator
    "3a2c62db-5318-420d-8d74-23affee5d9d5": ["ep", "devices"], // Intune Administrator
    "c4e39bd9-1100-46d3-8c65-fb160da0071f": ["high", "authn"], // Authentication Administrator
    "fe930be7-5e62-47db-91af-98c3a49a38b1": ["high", "users"], // User Administrator
    "fdd7a751-b60b-444a-984c-02652fe8fa1c": ["high", "users"], // Groups Administrator
    "7698a772-787b-4ac8-901f-60d6b08affd2": ["high", "intune"],// Cloud Device Administrator
    "29232cdf-9323-42fd-ade2-1d097af3e4de": ["high", "mail"],  // Exchange Administrator
    "f28a1f50-f6e7-4571-818b-6a12f2af6b6c": ["high", "files"], // SharePoint Administrator
    "69091246-20e8-4a56-aa4d-066075b2a7a8": ["high", "users"], // Teams Administrator
    "17315797-102d-40b4-93e0-432062caca18": ["high", "mail"],  // Compliance Administrator
    "e6d1a23a-da11-4be4-9570-befc86d067a7": ["high", "mail"],  // Compliance Data Administrator
  };
  const max = (a, b) => (RANK[b] > RANK[a] ? b : a);
  const apiOf = (appId) => (appId === GRAPH_APP ? "Microsoft Graph" : appId === EXO_APP ? "Exchange Online" : appId === SPO_APP ? "SharePoint Online" : appId === ARM_APP ? "Azure Resource Manager" : null);

  // One permission's tier. type: "app" (application permission) or "del".
  // A delegated scope never goes above HIGH: what it does is capped by the
  // signed-in person's own role, so the risk is WHO can sign in.
  function tierOf(value, type, resourceAppId) {
    const v = String(value || "");
    for (const r of RULES) {
      if (r.t !== "*" && r.t !== type) continue;
      if (r.api !== "*" && r.api !== resourceAppId) continue;
      if (!r.re.test(v)) continue;
      let tier = r.tier;
      if (type === "del" && RANK[tier] > RANK.high) tier = "high";
      return { tier, cap: r.cap };
    }
    return { tier: type === "app" ? "med" : "low", cap: type === "app" ? "read" : "signin" };
  }
  // A custom table in the community format (Type,Permission,Privilege,Reason)
  // wins over ENCA's tier for the permissions it names. Root matches
  // ("Mail") count as the community report counts them.
  function parseCustomCsv(text) {
    const out = new Map();
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return out;
    const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const iT = head.indexOf("type"), iP = head.indexOf("permission"), iV = head.indexOf("privilege"), iR = head.indexOf("reason");
    if (iT < 0 || iP < 0 || iV < 0) throw new Error("The CSV needs the columns Type, Permission, Privilege (Reason optional) — the community table's format");
    const map = { high: "high", medium: "med", low: "low", critical: "t0" };
    for (const l of lines.slice(1)) {
      const c = l.split(",").map((x) => x.trim());
      const t = /^app/i.test(c[iT]) ? "app" : "del", tier = map[lc(c[iV])];
      if (!tier || !c[iP]) continue;
      out.set(`${t}|${c[iP]}`, { tier, reason: iR >= 0 ? c[iR] || "" : "" });
    }
    return out;
  }
  function customTier(custom, value, type) {
    if (!custom || !custom.size) return null;
    return custom.get(`${type}|${value}`) || custom.get(`${type}|${String(value).split(".")[0]}`) || null;
  }

  // ---- origin ----------------------------------------------------------
  function partnerMap(list) { return new Map((list || PARTNERS_DEFAULT).map((p) => [lc(p.tenantId), p])); }
  function originOf(sp, tenantId, partners) {
    const owner = lc(sp.appOwnerOrganizationId), vp = sp.verifiedPublisher && sp.verifiedPublisher.displayName;
    if (sp.servicePrincipalType === "ManagedIdentity") return { kind: "org", label: "Managed identity", mi: true };
    if (owner && owner === lc(tenantId)) return { kind: "org", label: "Your org", multi: /Multiple|Personal/.test(sp.signInAudience || "") };
    const dev = DEV_TOOLS[lc(sp.appId)];
    if (MS_TENANTS.has(owner) || vp === "Microsoft Corporation") return { kind: "ms", label: dev ? "Microsoft · developer tool" : "Microsoft", devTool: !!dev };
    const p = (partners || partnerMap()).get(owner);
    if (p) return { kind: "partner", label: `Partner · ${p.name}`, partner: p.name, multi: true };
    return { kind: "tp", label: "Third-party", verified: !!vp, publisher: vp || sp.publisherName || "" };
  }

  // ---- read ------------------------------------------------------------
  const SP_SELECT = "id,appId,displayName,appOwnerOrganizationId,accountEnabled,servicePrincipalType,verifiedPublisher,appRoleAssignmentRequired,tags,createdDateTime,signInAudience,notes,disabledByMicrosoftStatus,publisherName";
  const ARA_SELECT = "id,appRoleId,resourceId,resourceDisplayName,principalId,createdDateTime";
  // io: { all(url) → rows, one(url) → object|null, hasAudit: bool }
  async function read(io, opts) {
    const o = opts || {}, step = (m) => { try { o.onStep && o.onStep(m); } catch { /* ui */ } };
    const out = { notes: [], readAt: Date.now() };
    step("Reading the service principals and their application permissions…");
    out.sps = await io.all(`${V1}/servicePrincipals?$select=${SP_SELECT}&$expand=appRoleAssignments($select=${ARA_SELECT})&$top=999`);
    const capped = out.sps.filter((sp) => (sp.appRoleAssignments || []).length >= EXPAND_CAP);
    if (capped.length) step(`Re-reading ${capped.length} app${capped.length === 1 ? "" : "s"} with ${EXPAND_CAP} or more application permissions (Graph cuts an expanded list at ${EXPAND_CAP})…`);
    for (const sp of capped) sp.appRoleAssignments = await io.all(`${V1}/servicePrincipals/${sp.id}/appRoleAssignments?$select=${ARA_SELECT}&$top=999`);
    out.recapped = capped.map((sp) => ({ id: sp.id, n: sp.appRoleAssignments.length }));
    step("Reading the delegated permission grants…");
    out.grants = await io.all(`${V1}/oauth2PermissionGrants?$top=999`);
    // names of the application permissions, per API used
    const resIds = [...new Set(out.sps.flatMap((sp) => (sp.appRoleAssignments || []).map((a) => a.resourceId)))];
    const byId = new Map(out.sps.map((sp) => [sp.id, sp]));
    out.resources = {};
    step(`Reading the permission names of ${resIds.length} API${resIds.length === 1 ? "" : "s"}…`);
    for (const id of resIds) {
      try {
        const r = await io.one(`${V1}/servicePrincipals/${id}?$select=id,appId,displayName,appRoles`);
        if (r) out.resources[id] = { appId: r.appId, displayName: r.displayName, roles: Object.fromEntries((r.appRoles || []).map((x) => [x.id, x.value])) };
      } catch (e) { const sp = byId.get(id); out.resources[id] = { appId: sp && sp.appId, displayName: sp && sp.displayName, roles: {}, err: String(e.message || e) }; }
    }
    step("Reading the app registrations: secrets, certificates, owners…");
    try { out.apps = await io.all(`${V1}/applications?$select=id,appId,displayName,signInAudience,passwordCredentials,keyCredentials&$expand=owners($select=id,displayName,userPrincipalName)&$top=999`); }
    catch (e) { out.apps = null; out.notes.push(`App registrations not read: ${e.message || e}`); }
    step("Reading the directory roles held by apps…");
    try {
      const [ras, defs] = await Promise.all([io.all(`${V1}/roleManagement/directory/roleAssignments?$select=id,roleDefinitionId,principalId,directoryScopeId&$top=999`), io.all(`${V1}/roleManagement/directory/roleDefinitions?$select=id,displayName,templateId`)]);
      const spIds = new Set(out.sps.map((s) => s.id));
      out.roles = ras.filter((r) => spIds.has(r.principalId));
      out.roleDefs = Object.fromEntries(defs.map((d) => [d.id, { name: d.displayName, templateId: d.templateId || d.id }]));
    } catch (e) { out.roles = null; out.roleDefs = {}; out.notes.push(`Directory roles not read: ${e.message || e}`); }
    step("Reading the consent settings…");
    out.settings = {};
    try { out.settings.authz = await io.one(`${V1}/policies/authorizationPolicy?$select=defaultUserRolePermissions`); } catch (e) { out.settings.authzErr = String(e.message || e); }
    try { out.settings.acrp = await io.one(`${V1}/policies/adminConsentRequestPolicy`); } catch (e) { out.settings.acrpErr = String(e.message || e); }
    try { out.settings.classes = await io.all(`${V1}/servicePrincipals(appId='${GRAPH_APP}')/delegatedPermissionClassifications`); } catch (e) { out.settings.classesErr = String(e.message || e); }
    if (o.audit) Object.assign(out, await readAudit(io, o));
    return out;
  }
  // Last use and the consent events — AuditLog.Read.All, asked for at a click.
  async function readAudit(io, opts) {
    const o = opts || {}, step = (m) => { try { o.onStep && o.onStep(m); } catch { /* ui */ } };
    const out = { activity: null, activityErr: null, consents: null, consentsErr: null };
    step("Reading the last sign-in of every app…");
    try {
      const rows = await io.all("/beta/reports/servicePrincipalSignInActivities?$top=999");
      out.activity = {};
      for (const r of rows) { const t = r.lastSignInActivity && r.lastSignInActivity.lastSignInDateTime; if (r.appId) out.activity[lc(r.appId)] = t || null; }
    } catch (e) { out.activityErr = String(e.message || e); }
    step("Reading who consented, in the audit window…");
    try {
      const since = new Date((o.now || Date.now()) - 30 * DAY).toISOString();
      const rows = await io.all(`${V1}/auditLogs/directoryAudits?$filter=${encodeURIComponent(`activityDisplayName eq 'Consent to application' and activityDateTime ge ${since}`)}&$top=999`);
      out.consents = rows.map((r) => {
        const t = (r.targetResources || [])[0] || {}, mp = t.modifiedProperties || [];
        const prop = (n) => { const x = mp.find((p) => p.displayName === n); return x ? String(x.newValue || "").replace(/^"|"$/g, "") : ""; };
        const by = (r.initiatedBy && (r.initiatedBy.user && (r.initiatedBy.user.userPrincipalName || r.initiatedBy.user.displayName) || r.initiatedBy.app && r.initiatedBy.app.displayName)) || "";
        return { spId: t.id, at: r.activityDateTime, by, admin: /true/i.test(prop("ConsentContext.IsAdminConsent")), ok: r.result === "success" };
      });
    } catch (e) { out.consentsErr = String(e.message || e); }
    return out;
  }

  // ---- notes stamp -----------------------------------------------------
  const DECISIONS = ["Approved", "Restricted", "Reduced", "Quarantined", "Enabled again", "Removed"];
  const STAMP_RE = /^ENCA T60 · (Approved|Restricted|Reduced|Quarantined|Enabled again|Removed) (\d{4}-\d{2}-\d{2})(?: · ([^·\n]*?))?(?: · review (\d{4}-\d{2}-\d{2}))?(?: · ([^\n]*))?$/m;
  function parseStamp(notes) {
    const m = STAMP_RE.exec(String(notes || ""));
    return m ? { decision: m[1], date: m[2], by: (m[3] || "").trim(), review: m[4] || "", reason: (m[5] || "").trim() } : null;
  }
  const clean = (s, n) => String(s || "").replace(/[·\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  function stamp(decision, d) {
    const x = d || {};
    let line = `ENCA T60 · ${decision} ${x.date || new Date().toISOString().slice(0, 10)}`;
    if (x.by) line += ` · ${clean(x.by, 80)}`;
    if (x.review) line += ` · review ${x.review}`;
    if (x.reason) line += ` · ${clean(x.reason, 300)}`;
    return line;
  }
  // The stamp replaces an earlier ENCA T60 line and keeps everything else
  // somebody wrote in Notes. Graph caps notes at 1024 characters.
  function withStamp(notes, line) {
    const rest = String(notes || "").split(/\r?\n/).filter((l) => l.trim() && !/^ENCA T60 · /.test(l));
    return [line, ...rest].join("\n").slice(0, 1024);
  }

  // ---- credentials -----------------------------------------------------
  const nameList = (names, max) => { const n = max || 6; return names.length > n ? `${names.slice(0, n).join(", ")} and ${names.length - n} more` : names.join(", "); };
  // the same certificate is written as hex or as base64 of the same bytes
  function thumb(k) {
    const c = String((k && k.customKeyIdentifier) || "");
    if (/^[0-9a-f]{40}$/i.test(c)) return c.toUpperCase();
    try {
      const bin = typeof atob === "function" ? atob(c) : Buffer.from(c, "base64").toString("binary");
      if (bin.length === 20) return [...bin].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
    } catch { /* not base64 */ }
    return c ? c.toUpperCase() : "";
  }
  function credsOf(app, now, shared) {
    if (!app) return null;
    const t = now || Date.now(), end = (c) => Date.parse(c.endDateTime || "") || 0;
    const sec = app.passwordCredentials || [], keys = app.keyCredentials || [];
    const liveSec = sec.filter((c) => end(c) > t), deadSec = sec.filter((c) => end(c) <= t);
    const liveKey = keys.filter((c) => end(c) > t), deadKey = keys.filter((c) => end(c) <= t);
    const next = [...liveSec, ...liveKey].map(end).sort((a, b) => a - b)[0] || null;
    // the other registrations that hold the same certificate (by thumbprint), named — "5 other apps" alone sends you hunting
    const others = (th) => ((shared && shared.get(th)) || []).filter((o) => lc(o.appId) !== lc(app.appId)).map((o) => ({ appId: o.appId, name: o.name, id: null }));
    const certs = liveKey.map((c) => { const th = thumb(c); return { name: c.displayName || "", end: c.endDateTime, thumb: th, others: th ? others(th) : [] }; });
    const sharedApps = [], seen = new Set();
    for (const c of certs) for (const o of c.others) if (!seen.has(lc(o.appId))) { seen.add(lc(o.appId)); sharedApps.push(o); }
    return { secrets: liveSec.map((c) => ({ name: c.displayName || "", end: c.endDateTime })), certs, expired: deadSec.length + deadKey.length, next, sharedWith: sharedApps.length, sharedApps, owners: (app.owners || []).map((o) => o.userPrincipalName || o.displayName || o.id) };
  }

  // ---- analyse ----------------------------------------------------------
  // raw = read() output (+ readAudit fields). ctx: { tenantId, partners, selfAppId, now, custom }
  function analyze(raw, ctx) {
    const c = ctx || {}, now = c.now || Date.now(), partners = partnerMap(c.partners);
    const sps = raw.sps || [], byId = new Map(sps.map((s) => [s.id, s]));
    const appByAppId = new Map((raw.apps || []).map((a) => [lc(a.appId), a]));
    // shared certificates across registrations in this tenant
    // thumbprint → [{ appId, name, cert, end }], one entry per registration
    const shared = new Map();
    for (const a of raw.apps || []) {
      const live = (a.keyCredentials || []).filter((k) => Date.parse(k.endDateTime || "") > now), done = new Set();
      for (const k of live) { const th = thumb(k); if (!th || done.has(th)) continue; done.add(th); if (!shared.has(th)) shared.set(th, []); shared.get(th).push({ appId: a.appId, name: a.displayName || a.appId, cert: k.displayName || "", end: k.endDateTime }); }
    }
    const resName = (id) => (raw.resources && raw.resources[id]) || (byId.get(id) ? { appId: byId.get(id).appId, displayName: byId.get(id).displayName, roles: {} } : { appId: null, displayName: id, roles: {} });
    const perms = new Map(), add = (id, p) => { if (!perms.has(id)) perms.set(id, []); perms.get(id).push(p); };
    // application permissions
    for (const sp of sps) for (const a of sp.appRoleAssignments || []) {
      const res = resName(a.resourceId), value = (res.roles && res.roles[a.appRoleId]) || a.appRoleId;
      add(sp.id, { type: "app", value, resourceId: a.resourceId, resourceAppId: lc(res.appId), api: apiOf(lc(res.appId)) || res.displayName || a.resourceDisplayName || "", assignmentId: a.id, appRoleId: a.appRoleId, at: a.createdDateTime });
    }
    // delegated grants: one permission row per scope, AllPrincipals and Principal apart
    const userGrants = [];
    for (const g of raw.grants || []) {
      const res = resName(g.resourceId), scopes = String(g.scope || "").split(/\s+/).filter(Boolean);
      if (g.consentType === "Principal") userGrants.push({ grantId: g.id, clientId: g.clientId, principalId: g.principalId, resourceId: g.resourceId, api: apiOf(lc(res.appId)) || res.displayName || "", scopes });
      for (const s of scopes) add(g.clientId, { type: "del", value: s, resourceId: g.resourceId, resourceAppId: lc(res.appId), api: apiOf(lc(res.appId)) || res.displayName || "", grantId: g.id, all: g.consentType === "AllPrincipals", principalId: g.principalId || null });
    }
    // roles held by apps
    const roleOf = new Map();
    for (const r of raw.roles || []) {
      const d = (raw.roleDefs || {})[r.roleDefinitionId] || { name: r.roleDefinitionId, templateId: r.roleDefinitionId };
      if (!roleOf.has(r.principalId)) roleOf.set(r.principalId, []);
      roleOf.get(r.principalId).push({ name: d.name, templateId: lc(d.templateId), scope: r.directoryScopeId || "/" });
    }
    const ids = new Set([...perms.keys(), ...roleOf.keys()]);
    const consentsBy = new Map();
    for (const e of raw.consents || []) { if (!consentsBy.has(e.spId)) consentsBy.set(e.spId, []); consentsBy.get(e.spId).push(e); }
    const apps = [];
    for (const id of ids) {
      const sp = byId.get(id); if (!sp) continue;
      const origin = originOf(sp, c.tenantId, partners);
      const list = (perms.get(id) || []).map((p) => {
        const cu = customTier(c.custom, p.value, p.type);
        const t = tierOf(p.value, p.type, p.resourceAppId);
        return Object.assign(p, { tier: cu ? (p.type === "del" && RANK[cu.tier] > RANK.high ? "high" : cu.tier) : t.tier, cap: t.cap, custom: cu ? cu.reason || "your table" : "" });
      });
      // two copies of one scope (AllPrincipals and a Principal grant) count once in the verdict
      const roles = roleOf.get(id) || [];
      let tier = "low"; const caps = new Map();
      const bump = (t, cap, label) => { tier = max(tier, t); if (!caps.has(cap)) caps.set(cap, { tier: t, items: [] }); const k = caps.get(cap); k.tier = max(k.tier, t); if (!k.items.includes(label)) k.items.push(label); };
      for (const p of list) if (p.type === "app" || p.all) bump(p.tier, p.cap, p.value);
      // a scope only individual users consented to still counts, one step down when it is not admin-scope
      for (const p of list) if (p.type === "del" && !p.all) bump(RANK[p.tier] >= RANK.high ? "med" : p.tier, p.cap, p.value);
      for (const r of roles) { const rt = ROLE_TIER[r.templateId] || ["med", "read"]; bump(rt[0], rt[1], r.name); }
      // Exchange.ManageAsApp is a key: with Exchange or Compliance Administrator it opens every mailbox
      const eam = list.some((p) => p.type === "app" && p.value === "Exchange.ManageAsApp");
      const exoAdmin = roles.some((r) => ["29232cdf-9323-42fd-ade2-1d097af3e4de", "17315797-102d-40b4-93e0-432062caca18", "62e90394-69f5-4237-9190-012177145e10"].includes(r.templateId));
      if (eam && exoAdmin) bump("high", "mail", "Exchange.ManageAsApp + Exchange role");
      const appPerms = list.filter((p) => p.type === "app"), delAll = list.filter((p) => p.type === "del" && p.all), delOne = list.filter((p) => p.type === "del" && !p.all);
      const consentUsers = [...new Set(delOne.map((p) => p.principalId))];
      const acts = appPerms.length && (delAll.length || delOne.length) ? "both" : appPerms.length ? "app" : delAll.length || delOne.length ? "user" : "role";
      const everyUser = delAll.length > 0 && sp.appRoleAssignmentRequired !== true;
      const delTier = delAll.reduce((t, p) => max(t, p.tier), "info");
      const last = raw.activity ? (Object.prototype.hasOwnProperty.call(raw.activity, lc(sp.appId)) ? raw.activity[lc(sp.appId)] : null) : undefined;
      const lastDays = last ? Math.floor((now - Date.parse(last)) / DAY) : null;
      const unused = raw.activity ? (last == null || lastDays >= UNUSED_DAYS) : false;
      const reg = origin.kind === "org" ? appByAppId.get(lc(sp.appId)) : null;
      const creds = reg ? credsOf(reg, now, shared) : null;
      const decision = parseStamp(sp.notes);
      const self = c.selfAppId && lc(c.selfAppId) === lc(sp.appId);
      // app-only permission sets shared by two of your registrations
      const appSet = appPerms.map((p) => `${p.resourceAppId}|${p.value}`).sort().join(",");
      const flags = [];
      const msApp = origin.kind === "ms" && !origin.devTool;
      if (sp.disabledByMicrosoftStatus) flags.push({ k: "msdisabled", sev: "bad", t: `Disabled by Microsoft (${sp.disabledByMicrosoftStatus})` });
      if (sp.accountEnabled === false) flags.push({ k: "disabled", sev: "info", t: "Sign-in disabled in this tenant" });
      if (origin.kind === "tp" && !origin.verified) flags.push({ k: "unverified", sev: "warn", t: "Publisher not verified by Microsoft" });
      if (unused && !msApp) flags.push({ k: "unused", sev: "warn", t: last == null ? "No sign-in on record" : `Not used for ${lastDays} days` });
      if (everyUser && !msApp && RANK[delTier] >= RANK.high) flags.push({ k: "everyone", sev: "warn", t: "Every user can sign in to it — assignment not required" });
      if (creds && creds.secrets.length && RANK[tier] >= RANK.high && appPerms.length) flags.push({ k: "secret", sev: "bad", t: `Client secret${creds.secrets.length === 1 ? "" : "s"} on an app that acts on its own — a certificate is safer` });
      if (creds && creds.expired) flags.push({ k: "expired", sev: "info", t: `${creds.expired} expired credential${creds.expired === 1 ? "" : "s"} still stored` });
      if (creds && creds.sharedWith) flags.push({ k: "sharedcert", sev: "warn", t: `Its certificate also signs in as ${creds.sharedWith} other app${creds.sharedWith === 1 ? "" : "s"}: ${nameList(creds.sharedApps.map((o) => o.name))}`, lead: `Its certificate also signs in as ${creds.sharedWith} other app${creds.sharedWith === 1 ? "" : "s"}:`, apps: creds.sharedApps });
      if (creds && creds.owners.length && RANK[tier] >= RANK.ep) flags.push({ k: "owners", sev: "warn", t: `${creds.owners.length} owner${creds.owners.length === 1 ? "" : "s"} can add a secret and act as this app` });
      if (origin.kind === "tp" && appPerms.length) flags.push({ k: "vendorkeys", sev: "info", t: "Acts on its own with keys held in the vendor's tenant — you can revoke or disable, not rotate" });
      if (origin.kind === "partner") flags.push({ k: "multi", sev: "info", t: `Multi-tenant registration from ${origin.partner} — check whether your own registration replaces it` });
      if (self) flags.push({ k: "self", sev: "info", t: "The registration ENCA is signed in with" });
      apps.push({ id, sp, appId: sp.appId, name: sp.displayName || sp.appId, origin, tier, caps, perms: list, appPerms, delAll, delOne, consentUsers, roles, acts, everyUser, delTier, assignmentRequired: sp.appRoleAssignmentRequired === true, enabled: sp.accountEnabled !== false, last, lastDays, unused, creds, decision, self, flags, consents: consentsBy.get(id) || [], appSet, created: sp.createdDateTime });
    }
    // duplicates: two of your registrations with the same app-only permission set (3 or more)
    const sets = new Map();
    for (const a of apps) if (a.origin.kind === "org" && a.appPerms.length >= 3) { if (!sets.has(a.appSet)) sets.set(a.appSet, []); sets.get(a.appSet).push(a); }
    for (const grp of sets.values()) if (grp.length > 1) for (const a of grp) a.flags.push({ k: "duplicate", sev: "warn", t: `Same ${a.appPerms.length} application permissions as ${grp.filter((x) => x !== a).map((x) => x.name).join(", ")}`, lead: `Same ${a.appPerms.length} application permissions as`, apps: grp.filter((x) => x !== a).map((x) => ({ appId: x.appId, name: x.name, id: x.id })) });
    // the apps a shared certificate names, linked to their rows (a registration without a service principal here stays a name)
    const idByAppId = new Map(apps.map((a) => [lc(a.appId), a.id]));
    for (const a of apps) if (a.creds) for (const o of [...a.creds.sharedApps, ...a.creds.certs.flatMap((c) => c.others)]) o.id = idByAppId.get(lc(o.appId)) || null;
    const sharedCerts = [...shared.entries()].filter(([, l]) => l.length > 1).map(([th, l]) => ({ thumb: th, cert: l[0].cert, end: l.map((x) => x.end).sort()[0], apps: l.map((x) => ({ appId: x.appId, name: x.name, id: idByAppId.get(lc(x.appId)) || null })) })).sort((x, y) => y.apps.length - x.apps.length);
    for (const a of apps) { a.ms = a.origin.kind === "ms" && !a.origin.devTool; a.why = whyOf(a); a.suggest = suggestOf(a); a.queue = inQueue(a); }
    apps.sort((x, y) => RANK[y.tier] - RANK[x.tier] || Number(y.queue) - Number(x.queue) || x.name.localeCompare(y.name));
    const model = { apps, readAt: raw.readAt, total: sps.length, grants: (raw.grants || []).length, appPerms: apps.reduce((n, a) => n + a.appPerms.length, 0), roleHolders: apps.filter((a) => a.roles.length).length, roleCount: (raw.roles || []).length, rolesRead: raw.roles != null, appsRead: raw.apps != null, activityRead: !!raw.activity, consentsRead: !!raw.consents, auditErr: raw.activityErr || raw.consentsErr || null, recapped: raw.recapped || [], notes: raw.notes || [], userGrants: userGrants.map((g) => Object.assign(g, { app: byId.get(g.clientId) })), settings: settingsOf(raw.settings || {}), sharedCerts };
    model.kpi = kpis(model);
    model.matrix = matrix(apps);
    return model;
  }
  function permList(items, n) { const shown = items.slice(0, n); return shown.join(", ") + (items.length > n ? ` +${items.length - n}` : ""); }
  function whyOf(a) {
    if (a.ms && !a.origin.devTool) return "Microsoft's own app. " + (a.delAll.some((p) => p.cap === "files") ? "Its SharePoint API access is approved in the SharePoint admin center." : "It signs people in to a Microsoft service.");
    const prio = (k) => { const i = MATRIX_ROWS.indexOf(k); return i < 0 ? 99 : i; };
    const top = [...a.caps.entries()].filter(([, v]) => v.tier === a.tier).sort((x, y) => prio(x[0]) - prio(y[0]));
    const verbs = top.slice(0, 2).map(([k]) => (CAPS[k] || CAPS.read).verb);
    const items = top.flatMap(([, v]) => v.items);
    const acts = a.acts === "both" && RANK[a.delTier] <= RANK.low && !a.delOne.length ? "app" : a.acts;
    const who = acts === "app" ? " (app-only)" : acts === "role" ? "" : a.delAll.length && acts !== "both" ? (a.everyUser ? ", for every user" : ", for assigned users") : acts === "both" ? " (app-only and as a user)" : `, for ${a.consentUsers.length} user${a.consentUsers.length === 1 ? "" : "s"} who consented`;
    let s = `Can ${verbs.join(" and ") || "sign people in"} — ${permList(items, 3)}${who}`;
    if (a.appPerms.length > 3) s += ` · ${a.appPerms.length} app permissions`;
    if (a.roles.length) s += ` · holds ${a.roles.map((r) => r.name).join(", ")}`;
    return s;
  }
  function suggestOf(a) {
    if (a.self || (a.ms && !a.origin.devTool)) return null;
    if (a.decision && a.decision.decision !== "Enabled again") return null;
    if (!a.enabled) return "remove";
    if (a.flags.some((f) => f.k === "duplicate") && a.unused) return "remove";
    if (a.unused && RANK[a.tier] >= RANK.high) return "quarantine";
    if (a.unused) return "remove";
    if (a.origin.kind === "tp" && !a.origin.verified && RANK[a.tier] >= RANK.ep && a.appPerms.length) return "quarantine";
    if (a.origin.devTool && a.everyUser) return "restrict";
    if (a.everyUser && RANK[a.tier] >= RANK.high && a.acts === "user") return "restrict";
    if (a.flags.some((f) => f.k === "secret")) return "certificate";
    return null;
  }
  function inQueue(a) {
    if (a.self || (a.ms && !a.origin.devTool)) return false;
    if (a.decision && a.decision.decision !== "Enabled again") return false;
    return RANK[a.tier] >= RANK.high || (a.origin.kind === "tp" && !a.origin.verified) || a.unused || !a.enabled || a.flags.some((f) => f.k === "expired" || f.k === "msdisabled");
  }
  function kpis(m) {
    const live = m.apps.filter((a) => !(a.ms && !a.origin.devTool));
    return {
      t0: live.filter((a) => RANK[a.tier] >= RANK.ep).length,
      high: live.filter((a) => a.tier === "high").length,
      unverified: live.filter((a) => a.origin.kind === "tp" && !a.origin.verified).length,
      unused: m.activityRead ? live.filter((a) => a.unused).length : null,
      secrets: live.filter((a) => a.flags.some((f) => f.k === "secret")).length,
      expired: live.reduce((n, a) => n + ((a.creds && a.creds.expired) || 0), 0),
      decided: live.filter((a) => a.decision && a.decision.decision !== "Enabled again").length,
      apps: live.length, queue: live.filter((a) => a.queue).length,
      origins: { org: live.filter((a) => a.origin.kind === "org").length, partner: live.filter((a) => a.origin.kind === "partner").length, tp: live.filter((a) => a.origin.kind === "tp").length, ms: m.apps.filter((a) => a.origin.kind === "ms").length },
    };
  }
  function matrix(apps) {
    const rows = [];
    for (const key of MATRIX_ROWS) {
      const own = [], user = [];
      for (const a of apps) {
        if (a.ms && !a.origin.devTool && key !== "files") continue;
        const appHit = a.appPerms.some((p) => p.cap === key) || a.roles.some((r) => (ROLE_TIER[r.templateId] || [])[1] === key) || (key === "mail" && a.caps.has("mail") && a.caps.get("mail").items.some((i) => /Exchange role/.test(i)));
        const userHit = a.delAll.some((p) => p.cap === key);
        if (appHit) own.push(a); else if (userHit) user.push(a);
      }
      if (own.length || user.length || ["grant", "roles", "authn", "ca", "devices", "files", "mail"].includes(key)) rows.push({ key, label: CAPS[key].row, own, user });
    }
    return rows;
  }
  // ---- settings checks ---------------------------------------------------
  function settingsOf(s) {
    const out = [];
    const assigned = ((s.authz && s.authz.defaultUserRolePermissions && s.authz.defaultUserRolePermissions.permissionGrantPoliciesAssigned) || []).map(String);
    const self = assigned.filter((x) => /^ManagePermissionGrantsForSelf\./i.test(x)).map((x) => x.split(".").slice(1).join("."));
    if (s.authz) {
      const rec = self.includes("microsoft-user-default-recommended"), low = self.includes("microsoft-user-default-low"), legacy = self.includes("microsoft-user-default-legacy");
      out.push(legacy ? { k: "userconsent", sev: "bad", title: "User consent — users may consent to any app", text: "The legacy setting: any user can give any app every permission that does not need an admin. This is how consent phishing works.", fix: "Entra → Enterprise apps → Consent and permissions → User consent settings → Let Microsoft manage your consent settings (recommended). Only future consents change; existing grants stay." }
        : rec ? { k: "userconsent", sev: "ok", title: "User consent — Microsoft-managed (recommended)", text: "Users may consent to delegated permissions except the ones Microsoft lists as risky (files and sites, mail, calendars, chat, contacts, tasks, people, Exchange EWS/IMAP/POP/EAS). Microsoft keeps the list up to date." }
        : low ? { k: "userconsent", sev: "ok", title: "User consent — verified publishers, low-impact permissions only", text: "Users may consent only to apps from verified publishers (or registered here) and only to permissions classified low impact." }
        : !self.length ? { k: "userconsent", sev: "ok", title: "User consent — off", text: "Users cannot consent; every app goes through an admin. Make sure the admin consent requests are on, or users will ask an admin to consent for everyone." }
        : { k: "userconsent", sev: "info", title: "User consent — a custom policy", text: `Assigned: ${self.join(", ")}. Read it in Entra to see what users may consent to.` });
      if (self.includes("microsoft-user-default-allow-consent-apps")) out.push({ k: "mailapps", sev: "info", title: "Mail client exception — on", text: "Users may give Apple Mail, Spark, eM Client and Samsung Mail their mail scopes (Microsoft-managed). Switch it off in Entra if those clients are not allowed." });
    } else out.push({ k: "userconsent", sev: "unknown", title: "User consent — not read", text: s.authzErr || "" });
    const allowed = s.authz && s.authz.defaultUserRolePermissions && s.authz.defaultUserRolePermissions.allowedToCreateApps;
    if (s.authz) out.push(allowed ? { k: "createapps", sev: "warn", title: "Users can register apps — yes", text: "Any user can create an app registration and becomes its owner. Set it to No unless developers need it (they can hold Application Developer instead)." } : { k: "createapps", sev: "ok", title: "Users can register apps — no", text: "Only admins and the Application Developer role create app registrations." });
    if (s.acrp) {
      const on = s.acrp.isEnabled === true;
      out.push(on ? { k: "acrp", sev: "ok", title: "Admin consent requests — on", text: `${(s.acrp.reviewers || []).length} reviewer entr${(s.acrp.reviewers || []).length === 1 ? "y" : "ies"}, requests expire after ${s.acrp.requestDurationInDays} days${s.acrp.notifyReviewers ? ", reviewers get email" : ""}.`, acrp: s.acrp }
        : { k: "acrp", sev: "bad", title: "Admin consent requests — off", text: "A user who hits Need admin approval has no way to ask. The usual result: they ask an admin to sign in and tick Consent on behalf of your organization — which is how a tool becomes consented for every user.", acrp: s.acrp, fixable: true });
    } else out.push({ k: "acrp", sev: "unknown", title: "Admin consent requests — not read", text: s.acrpErr || "" });
    if (s.classes) out.push({ k: "classes", sev: "info", title: `Low-impact permission classifications — ${s.classes.length ? s.classes.length : "none"}`, text: s.classes.length ? `Classified low: ${s.classes.map((x) => x.permissionName).join(", ")}.` : "Only used by the stricter user consent setting (verified publishers, low impact). If you move to it, classify openid, profile, email, offline_access and User.Read as low first." });
    return out;
  }
  // The admin consent workflow body: reviewers are the members of one group.
  function acrpBody(on, groupId, days) {
    return { isEnabled: !!on, notifyReviewers: true, remindersEnabled: true, requestDurationInDays: days || 14, reviewers: groupId ? [{ query: `/groups/${groupId}/transitiveMembers/microsoft.graph.user`, queryType: "MicrosoftGraph" }] : [] };
  }

  // ---- writes ------------------------------------------------------------
  // io: { read(url) → obj|null, patch(url, body), post(url, body) → obj, del(url), put(url, body) }
  // op: { kind, app: {id, appId, name, ms, devTool}, by, reason, review, groupId, revoke: [items], record }
  function refuse(op, ctx) {
    const a = op.app || {};
    if (ctx && ctx.selfAppId && lc(ctx.selfAppId) === lc(a.appId) && op.kind !== "approve") return "This is the registration ENCA is signed in with — switching it off or removing it would lock this tool out";
    if (a.ms && !a.devTool && ["quarantine", "revoke", "remove"].includes(op.kind)) return "One of Microsoft's own apps — it is not switched off or removed from here";
    return null;
  }
  const SPR = (id) => `${V1}/servicePrincipals/${id}?$select=id,appId,displayName,accountEnabled,appRoleAssignmentRequired,notes,appRoles`;
  async function applyOne(op, io, ctx) {
    const a = op.app, why = refuse(op, ctx);
    const res = { kind: op.kind, id: a.id, name: a.name, outcome: "failed", detail: "" };
    if (why) return Object.assign(res, { outcome: "refused", detail: why });
    const today = (ctx && ctx.today) || new Date().toISOString().slice(0, 10);
    const sp = await io.read(SPR(a.id));
    if (!sp) return Object.assign(res, { outcome: "skipped", detail: "gone — no longer in the directory" });
    const note = (decision) => withStamp(sp.notes, stamp(decision, { date: today, by: op.by, review: op.review, reason: op.reason }));
    if (op.kind === "approve") {
      await io.patch(`${V1}/servicePrincipals/${a.id}`, { notes: note("Approved") });
      const back = await io.read(SPR(a.id));
      return Object.assign(res, (parseStamp(back && back.notes) || {}).decision === "Approved" ? { outcome: "approved", detail: "decision written to the app's Notes" } : { detail: "read back without the decision" });
    }
    if (op.kind === "quarantine" || op.kind === "enable") {
      const want = op.kind === "enable";
      if (sp.accountEnabled === want) return Object.assign(res, { outcome: "skipped", detail: want ? "already enabled" : "already disabled" });
      await io.patch(`${V1}/servicePrincipals/${a.id}`, { accountEnabled: want, notes: note(want ? "Enabled again" : "Quarantined") });
      const back = await io.read(SPR(a.id));
      return Object.assign(res, back && back.accountEnabled === want ? { outcome: want ? "enabled" : "quarantined", detail: `read back accountEnabled: ${want}` } : { detail: "read back still " + (back ? `accountEnabled: ${back.accountEnabled}` : "missing") });
    }
    if (op.kind === "restrict") {
      if (!op.groupId) return Object.assign(res, { outcome: "skipped", detail: "no group chosen" });
      const userRole = (sp.appRoles || []).find((r) => (r.allowedMemberTypes || []).includes("User") && r.isEnabled !== false);
      // the group FIRST, so switching assignment on never locks it out
      try { await io.post(`${V1}/servicePrincipals/${a.id}/appRoleAssignedTo`, { principalId: op.groupId, resourceId: a.id, appRoleId: userRole ? userRole.id : DEFAULT_ROLE }); }
      catch (e) { if (!/already exists/i.test(String(e.message || e))) throw e; }
      await io.patch(`${V1}/servicePrincipals/${a.id}`, { appRoleAssignmentRequired: true, notes: note("Restricted") });
      const back = await io.read(SPR(a.id));
      return Object.assign(res, back && back.appRoleAssignmentRequired === true ? { outcome: "restricted", detail: `assignment required · group assigned${userRole ? ` as ${userRole.displayName || userRole.value}` : ""}` } : { detail: "read back without assignment required" });
    }
    if (op.kind === "revoke" || op.kind === "remove") {
      if (op.kind === "remove" && sp.accountEnabled !== false) return Object.assign(res, { outcome: "refused", detail: "quarantine it first — an app goes dark before it goes" });
      const items = op.kind === "remove" ? (await everyGrant(io, a.id)).map((it) => Object.assign(it, it.type === "app" ? { value: (op.names || {})[it.appRoleId] || it.value } : {})) : (op.revoke || []);
      const undone = [], failed = [];
      for (const it of items) {
        try {
          if (it.type === "app") {
            await io.del(`${V1}/servicePrincipals/${it.resourceId}/appRoleAssignedTo/${it.assignmentId}`);
            undone.push({ type: "app", resourceId: it.resourceId, appRoleId: it.appRoleId, value: it.value, api: it.api });
          } else {
            const g = await io.read(`${V1}/oauth2PermissionGrants/${it.grantId}`);
            if (!g) continue;
            const left = String(g.scope || "").split(/\s+/).filter((s) => s && !(it.scopes || []).includes(s));
            if (left.length) await io.patch(`${V1}/oauth2PermissionGrants/${it.grantId}`, { scope: left.join(" ") });
            else await io.del(`${V1}/oauth2PermissionGrants/${it.grantId}`);
            undone.push({ type: "del", clientId: a.id, consentType: g.consentType, principalId: g.principalId || null, resourceId: g.resourceId, scopes: (it.scopes || []).filter((s) => String(g.scope || "").split(/\s+/).includes(s)), api: it.api });
          }
        } catch (e) { failed.push(`${it.value || (it.scopes || []).join(" ")}: ${String(e.message || e).slice(0, 160)}`); }
      }
      res.undo = undone;
      if (op.kind === "revoke") {
        if (undone.length) { try { await io.patch(`${V1}/servicePrincipals/${a.id}`, { notes: note("Reduced") }); } catch { /* the revoke stands */ } }
        return Object.assign(res, failed.length ? (undone.length ? { outcome: "partly", detail: `${undone.length} revoked · ${failed.length} refused: ${failed.join("; ")}` } : { detail: failed.join("; ") }) : { outcome: "reduced", detail: `${undone.length} permission${undone.length === 1 ? "" : "s"} revoked` });
      }
      if (failed.length) return Object.assign(res, { outcome: "partly", detail: `${undone.length} revoked, ${failed.length} refused — the app was NOT deleted: ${failed.join("; ")}` });
      try { await io.patch(`${V1}/servicePrincipals/${a.id}`, { notes: note("Removed") }); } catch { /* best effort, it goes now */ }
      await io.del(`${V1}/servicePrincipals/${a.id}`);
      const back = await io.read(SPR(a.id));
      return Object.assign(res, !back ? { outcome: "removed", detail: `${undone.length} permission${undone.length === 1 ? "" : "s"} revoked · deleted (restorable for 30 days)` } : { outcome: "partly", detail: "permissions revoked, but the app still reads back" });
    }
    return Object.assign(res, { detail: `unknown action ${op.kind}` });
  }
  async function everyGrant(io, spId) {
    const out = [];
    const ar = await io.all(`${V1}/servicePrincipals/${spId}/appRoleAssignments?$select=${ARA_SELECT}&$top=999`);
    for (const x of ar || []) out.push({ type: "app", resourceId: x.resourceId, assignmentId: x.id, appRoleId: x.appRoleId, value: x.appRoleId, api: x.resourceDisplayName || "" });
    const gs = await io.all(`${V1}/oauth2PermissionGrants?$filter=${encodeURIComponent(`clientId eq '${spId}'`)}`);
    for (const g of gs || []) out.push({ type: "del", grantId: g.id, scopes: String(g.scope || "").split(/\s+/).filter(Boolean) });
    return out;
  }
  // The way back from Reduce and Remove: restore the deleted app (if it was
  // removed), then grant back exactly what this tool took.
  async function restore(rec, io) {
    const res = { kind: "restore", id: rec.id, name: rec.name, outcome: "failed", detail: "" };
    if (rec.removed) {
      try { await io.post(`${V1}/directory/deletedItems/${rec.id}/restore`, {}); }
      catch (e) { if (!/not found|does not exist|404/i.test(String(e.message || e))) throw e; }
    }
    const back = [], failed = [];
    for (const u of rec.undo || []) {
      try {
        if (u.type === "app") await io.post(`${V1}/servicePrincipals/${rec.id}/appRoleAssignments`, { principalId: rec.id, resourceId: u.resourceId, appRoleId: u.appRoleId });
        else {
          const f = `clientId eq '${rec.id}' and resourceId eq '${u.resourceId}' and consentType eq '${u.consentType}'` + (u.principalId ? ` and principalId eq '${u.principalId}'` : "");
          const have = ((await io.all(`${V1}/oauth2PermissionGrants?$filter=${encodeURIComponent(f)}`)) || [])[0];
          if (have) await io.patch(`${V1}/oauth2PermissionGrants/${have.id}`, { scope: [...new Set([...String(have.scope || "").split(/\s+/).filter(Boolean), ...u.scopes])].join(" ") });
          else await io.post(`${V1}/oauth2PermissionGrants`, Object.assign({ clientId: rec.id, consentType: u.consentType, resourceId: u.resourceId, scope: u.scopes.join(" ") }, u.principalId ? { principalId: u.principalId } : {}));
        }
        back.push(u);
      } catch (e) { if (/already exists/i.test(String(e.message || e))) back.push(u); else failed.push(`${u.value || (u.scopes || []).join(" ")}: ${String(e.message || e).slice(0, 160)}`); }
    }
    const sp = await io.read(SPR(rec.id));
    if (!sp) return Object.assign(res, { detail: "the app did not come back — restore it under Entra → Enterprise apps → Deleted applications (30 days)" });
    return Object.assign(res, failed.length ? { outcome: "partly", detail: `${back.length} granted back · ${failed.length} refused (Microsoft Graph application permissions need Privileged Role Administrator): ${failed.join("; ")}` } : { outcome: "restored", detail: `${rec.removed ? "restored · " : ""}${back.length} permission${back.length === 1 ? "" : "s"} granted back` });
  }
  async function apply(ops, opts) {
    const o = opts || {}, io = o.io, L = o.ledger, results = [];
    for (let i = 0; i < ops.length; i++) {
      if (L && L.stopped) break;
      if (L) L.start(i);
      let r;
      try { r = ops[i].kind === "restore" ? await restore(ops[i].record, io) : await applyOne(ops[i], io, o); }
      catch (e) { r = { kind: ops[i].kind, id: ops[i].app ? ops[i].app.id : ops[i].record && ops[i].record.id, name: ops[i].app ? ops[i].app.name : ops[i].record && ops[i].record.name, outcome: "failed", detail: /\(403\)|Authorization_RequestDenied|Insufficient privileges/i.test(String(e.message || e)) ? `refused by Graph — the signed-in account needs Cloud Application Administrator or Application Administrator (${String(e.message || e).slice(0, 140)})` : String(e.message || e) }; }
      results.push(r);
      if (L) { if (["failed"].includes(r.outcome)) L.fail(i, r.detail); else if (["skipped", "refused"].includes(r.outcome)) L.skip(i, r.detail, r.outcome); else if (r.outcome === "partly") L.part(i, r.detail); else L.done(i, r.detail, r.outcome); }
    }
    return results;
  }
  async function setAcrp(io, on, groupId, days) {
    const before = await io.read(`${V1}/policies/adminConsentRequestPolicy`);
    const body = acrpBody(on, groupId || null, days);
    if (!on && before) body.reviewers = before.reviewers || [];
    await io.put(`${V1}/policies/adminConsentRequestPolicy`, body);
    const back = await io.read(`${V1}/policies/adminConsentRequestPolicy`);
    return { ok: !!back && back.isEnabled === !!on, before, after: back };
  }

  // ---- report ------------------------------------------------------------
  const days = (a) => (a.last === undefined ? "not read" : a.last == null ? "no sign-in on record" : a.lastDays === 0 ? "today" : `${a.lastDays} days ago`);
  const whoCan = (a) => (a.acts === "app" ? "no user needed" : a.acts === "role" ? "—" : a.everyUser ? "every user" : a.delAll.length ? "assigned users" : `${a.consentUsers.length} user(s) who consented`);
  const credLine = (a) => (!a.creds ? (a.origin.kind === "tp" && a.appPerms.length ? "held by the vendor" : "—") : [a.creds.secrets.length ? `${a.creds.secrets.length} secret(s)` : "", a.creds.certs.length ? `${a.creds.certs.length} certificate(s)${a.creds.sharedWith ? ` shared with ${a.creds.sharedApps.map((o) => o.name).join("; ")}` : ""}` : "", a.creds.expired ? `${a.creds.expired} expired` : ""].filter(Boolean).join(", ") || "none");
  function markdown(m, meta) {
    const x = meta || {}, k = m.kpi, L = [];
    const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    L.push(`# App access review — ${x.tenant || "tenant"}`, "", `${new Date(m.readAt || Date.now()).toISOString().slice(0, 16).replace("T", " ")} UTC · ENCA T60 ${x.build ? `· ${x.build}` : ""} · read-only review of ${m.total} service principals`, "");
    L.push("## Summary", "", "| Tier 0 / endpoint | Tenant-wide reach | Third-party, unverified | Unused 90+ days | Secrets on powerful apps | Decided |", "|---|---|---|---|---|---|", `| ${k.t0} | ${k.high} | ${k.unverified} | ${k.unused == null ? "not read" : k.unused} | ${k.secrets} | ${k.decided} of ${k.apps} |`, "");
    const q = m.apps.filter((a) => a.queue);
    L.push(`## Decisions needed — ${q.length}`, "", "| App | Origin | Verdict | Why | Last used | Suggested |", "|---|---|---|---|---|---|");
    for (const a of q) L.push(`| ${cell(a.name)} | ${cell(a.origin.label)}${a.origin.kind === "tp" && !a.origin.verified ? " (unverified)" : ""} | ${TIER_LABEL[a.tier]} | ${cell(a.why)} | ${days(a)} | ${a.suggest || "decide"} |`);
    L.push("", "## Who can do what", "", "| Capability | On its own (app-only) | As a signed-in user, for every user |", "|---|---|---|");
    for (const r of m.matrix) L.push(`| ${r.label} | ${cell(r.own.map((a) => a.name).join(", ") || "—")} | ${cell(r.user.map((a) => a.name).join(", ") || "—")} |`);
    L.push("", "## Consent settings", "");
    for (const s of m.settings) L.push(`- ${s.sev === "ok" ? "✓" : s.sev === "bad" ? "✗" : s.sev === "warn" ? "⚠" : "ⓘ"} **${s.title}** — ${s.text}`);
    L.push("", "## Every app", "", "| App | Origin | Verdict | Acts as | Who can use it | Last used | Credentials | Roles | Decision |", "|---|---|---|---|---|---|---|---|---|");
    for (const a of m.apps) L.push(`| ${cell(a.name)} | ${cell(a.origin.label)} | ${TIER_LABEL[a.tier]} | ${a.acts} | ${whoCan(a)} | ${days(a)} | ${cell(credLine(a))} | ${cell(a.roles.map((r) => r.name).join(", ") || "—")} | ${a.decision ? `${a.decision.decision} ${a.decision.date}` : "—"} |`);
    if (m.sharedCerts && m.sharedCerts.length) {
      L.push("", "## Shared certificates", "", "One certificate on several registrations: whoever holds its private key can sign in as every one of them. Give each app its own certificate, then delete the shared one from the others (App registrations → the app → Certificates & secrets — match the thumbprint).", "", "| Certificate | Thumbprint | Ends | Registrations |", "|---|---|---|---|");
      for (const c of m.sharedCerts) L.push(`| ${cell(c.cert || "—")} | ${c.thumb} | ${String(c.end || "").slice(0, 10)} | ${cell(c.apps.map((x) => x.name).join(", "))} |`);
    }
    L.push("", "## What was read", "");
    L.push(`- ${m.total} service principals, ${m.grants} delegated grants, ${m.appPerms} application permissions${m.recapped.length ? ` (${m.recapped.length} app(s) re-read past Graph's 20-item expand)` : ""}`);
    L.push(`- Directory roles: ${m.rolesRead ? `${m.roleCount} held by ${m.roleHolders} app(s)` : "not read"} · app registrations: ${m.appsRead ? "read" : "not read"}`);
    L.push(`- Last use: ${m.activityRead ? "read (service principal sign-in activity)" : "not read — needs AuditLog.Read.All"} · consent events: ${m.consentsRead ? "read, last 30 days" : "not read"}`);
    for (const n of m.notes) L.push(`- ${n}`);
    return L.join("\n");
  }
  function csv(m) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["App", "AppId", "Origin", "Publisher verified", "Verdict", "Why", "Acts as", "Who can use it", "Last used", "Credentials", "Roles", "App permissions", "Delegated (every user)", "Users consented", "Decision", "Decision date", "Review", "Suggested"];
    const rows = m.apps.map((a) => [a.name, a.appId, a.origin.label, a.origin.kind === "tp" ? (a.origin.verified ? "yes" : "no") : "", TIER_LABEL[a.tier], a.why, a.acts, whoCan(a), days(a), credLine(a), a.roles.map((r) => r.name).join("; "), a.appPerms.map((p) => p.value).join(" "), a.delAll.map((p) => p.value).join(" "), a.consentUsers.length, a.decision ? a.decision.decision : "", a.decision ? a.decision.date : "", a.decision ? a.decision.review : "", a.suggest || ""]);
    return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  }
  function permCsv(m) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["App", "AppId", "Type", "API", "Permission", "ENCA tier", "Capability", "Consent", "Your table"];
    const rows = m.apps.flatMap((a) => a.perms.map((p) => [a.name, a.appId, p.type === "app" ? "Application" : "Delegated", p.api, p.value, TIER_LABEL[p.tier], (CAPS[p.cap] || CAPS.read).row, p.type === "app" ? "admin" : p.all ? "every user (admin)" : "one user", p.custom]));
    return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  }

  // ---- demo: a devcf-shaped tenant ----------------------------------------
  function demo(now) {
    const t = now || Date.now(), ago = (d) => new Date(t - d * DAY).toISOString(), fut = (d) => new Date(t + d * DAY).toISOString();
    const T = "11111111-2222-3333-4444-555555555555", MS = "f8cdef31-a31e-4b4a-93e4-5f571e91255a";
    const sp = (id, appId, displayName, owner, extra) => Object.assign({ id, appId, displayName, appOwnerOrganizationId: owner, accountEnabled: true, servicePrincipalType: "Application", verifiedPublisher: {}, appRoleAssignmentRequired: false, signInAudience: owner === T ? "AzureADMyOrg" : "AzureADMultipleOrgs", notes: null, appRoleAssignments: [], createdDateTime: ago(200) }, extra || {});
    const graph = sp("res-graph", GRAPH_APP, "Microsoft Graph", MS), exo = sp("res-exo", EXO_APP, "Office 365 Exchange Online", MS), spo = sp("res-spo", SPO_APP, "Office 365 SharePoint Online", MS), arm = sp("res-arm", ARM_APP, "Azure Resource Manager", MS);
    const G = ["RoleManagement.ReadWrite.Directory", "AppRoleAssignment.ReadWrite.All", "Application.ReadWrite.All", "Directory.ReadWrite.All", "UserAuthenticationMethod.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess", "Domain.ReadWrite.All", "Policy.ReadWrite.Authorization", "Chat.ReadWrite.All", "Sites.FullControl.All", "Files.ReadWrite.All", "User.ReadWrite.All", "Group.ReadWrite.All", "DeviceManagementApps.ReadWrite.All", "DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "DeviceManagementServiceConfig.ReadWrite.All", "DeviceManagementManagedDevices.Read.All", "GroupMember.Read.All", "Directory.Read.All", "Policy.Read.All", "AuditLog.Read.All", "User.Read.All", "Organization.ReadWrite.All", "Sites.Selected", "Exchange.ManageAsApp", "Application.Read.All", "SecurityEvents.ReadWrite.All", "IdentityRiskyUser.ReadWrite.All", "AccessReview.ReadWrite.All"];
    const roleId = (v) => `role-${v}`;
    graph.appRoles = G.filter((v) => v !== "Exchange.ManageAsApp" && v !== "Sites.Selected").map((v) => ({ id: roleId(v), value: v }));
    exo.appRoles = [{ id: roleId("Exchange.ManageAsApp"), value: "Exchange.ManageAsApp" }];
    spo.appRoles = [{ id: roleId("Sites.Selected"), value: "Sites.Selected" }, { id: roleId("Sites.FullControl.All"), value: "Sites.FullControl.All" }];
    let n = 0;
    const ara = (res, vals) => vals.map((v) => ({ id: `ara-${++n}`, appRoleId: roleId(v), resourceId: res.id, resourceDisplayName: res.displayName, createdDateTime: ago(120) }));
    const lokkaPerms = G.filter((v) => !["Exchange.ManageAsApp", "Sites.Selected", "DeviceManagementServiceConfig.ReadWrite.All", "Organization.ReadWrite.All"].includes(v));
    const apps = [
      sp("a-lokka", "db1bdbba-0000-0000-0000-000000000001", "Lokka MCP", T, { appRoleAssignments: ara(graph, lokkaPerms) }),
      sp("a-psgraph", "190755aa-0000-0000-0000-000000000002", "Graph automation (PowerShell)", T, { appRoleAssignments: ara(graph, ["RoleManagement.ReadWrite.Directory", "AppRoleAssignment.ReadWrite.All", "Directory.ReadWrite.All", "Domain.ReadWrite.All", "Policy.ReadWrite.Authorization", "User.ReadWrite.All", "Group.ReadWrite.All"]) }),
      sp("a-autopilot", "cfdb0a98-0000-0000-0000-000000000003", "Intune baseline - Autopilot", T, { appRoleAssignments: ara(graph, ["DeviceManagementApps.ReadWrite.All", "DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementServiceConfig.ReadWrite.All"]) }),
      sp("a-intuneget", "21e155a5-87ed-4422-8766-c1e750921940", "IntuneGet by UgurLabs.com", "ffc10f05-e837-4803-81b1-7c4dee678c2a", { appRoleAssignments: ara(graph, ["DeviceManagementApps.ReadWrite.All", "DeviceManagementServiceConfig.ReadWrite.All", "DeviceManagementManagedDevices.Read.All", "GroupMember.Read.All"]) }),
      sp("a-graphcli", "14d82eec-204b-4c2f-b7e8-296a70dab67e", "Microsoft Graph Command Line Tools", "cdc5aeea-15c5-4db6-b079-fcadd2505dc2", { verifiedPublisher: { displayName: "Microsoft Corporation", verifiedPublisherId: "5206095" }, signInAudience: "AzureADandPersonalMicrosoftAccount" }),
      sp("a-pimmgr", "02f3bde0-0000-0000-0000-000000000005", "PIM Manager", "6037e582-06b7-45f3-85a8-6c12aa25aa69"),
      sp("a-spauto", "e8b07033-0000-0000-0000-000000000006", "SharePoint automation", T, { appRoleAssignments: ara(graph, ["Sites.FullControl.All", "Files.ReadWrite.All"]).concat(ara(spo, ["Sites.FullControl.All"])) }),
      sp("a-teams", "9821a199-0000-0000-0000-000000000007", "Teams automation", T, { appRoleAssignments: ara(graph, ["User.ReadWrite.All", "Group.ReadWrite.All", "Directory.Read.All"]) }),
      sp("a-teamsold", "5b03b9fc-0000-0000-0000-000000000008", "Teams automation (old)", T, { appRoleAssignments: ara(graph, ["User.ReadWrite.All", "Group.ReadWrite.All", "Directory.Read.All"]) }),
      sp("a-exo", "0399eaab-0000-0000-0000-000000000009", "Exchange automation", T, { appRoleAssignments: ara(graph, ["Application.Read.All"]).concat(ara(exo, ["Exchange.ManageAsApp"])) }),
      sp("a-encapartner", "4437195a-f35c-417f-8c69-58036fbe2137", "ENCA (Limon-IT)", "ad715e59-d216-44ac-9b48-4ea9367886e5"),
      sp("a-tuno", "a0ea0fc5-970c-43d9-99ae-559a1cd2755e", "TUNO (Limon-IT)", "ad715e59-d216-44ac-9b48-4ea9367886e5"),
      sp("a-idp", "6ce0484b-2ae6-4458-b2b9-b3369f42fd6f", "idPowerToys", "10407d69-1ba5-4bec-8ebe-9af2f0b9e06a", { verifiedPublisher: { displayName: "M & I Consulting Pty Ltd", verifiedPublisherId: "6702308" } }),
      sp("a-cavis", "54930b90-0000-0000-0000-000000000013", "Conditional Access Visualizer", "42ba3ed1-ae78-4fd0-8080-5f8bfcc27b29"),
      sp("a-intunedoc", "b82babfc-0000-0000-0000-000000000014", "Intune Documentation", "96c21bc2-67e5-41aa-9334-e0fc104874b2", { verifiedPublisher: { displayName: "Ugurlabs UG (haftungsbeschränkt)", verifiedPublisherId: "7127792" } }),
      sp("a-harvest", "b1a5a6b2-0000-0000-0000-000000000015", "Harvest uploader", T, { appRoleAssignments: ara(spo, ["Sites.Selected"]) }),
      sp("a-spfx", "08e18876-6177-487e-b8b5-cf950c1e598c", "SharePoint Online Web Client Extensibility", MS),
    ];
    const g = (id, clientId, resourceId, scope, principalId) => ({ id, clientId, resourceId, scope, consentType: principalId ? "Principal" : "AllPrincipals", principalId: principalId || null });
    const grants = [
      g("g1", "a-graphcli", "res-graph", "User.Read openid profile offline_access RoleManagement.ReadWrite.Directory Directory.AccessAsUser.All Application.ReadWrite.All AppRoleAssignment.ReadWrite.All UserAuthenticationMethod.ReadWrite.All Policy.ReadWrite.ConditionalAccess DeviceManagementConfiguration.ReadWrite.All Mail.Read Sites.FullControl.All"),
      g("g2", "a-graphcli", "res-arm", "user_impersonation"),
      g("g3", "a-pimmgr", "res-graph", "User.Read RoleManagementPolicy.ReadWrite.AzureADGroup PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup Group.Read.All"),
      g("g4", "a-encapartner", "res-graph", "Policy.Read.All Directory.Read.All Policy.ReadWrite.ConditionalAccess Group.ReadWrite.All RoleManagement.ReadWrite.Directory Application.ReadWrite.All AuditLog.Read.All openid profile offline_access"),
      g("g5", "a-tuno", "res-graph", "User.Read DeviceManagementConfiguration.ReadWrite.All DeviceManagementScripts.ReadWrite.All Application.ReadWrite.All AppRoleAssignment.ReadWrite.All Sites.FullControl.All openid profile offline_access"),
      g("g6", "a-idp", "res-graph", "Agreement.Read.All Directory.Read.All Policy.Read.All User.Read openid profile offline_access"),
      g("g7", "a-cavis", "res-graph", "User.Read Policy.Read.All User.Read.All Group.Read.All Application.Read.All RoleManagement.Read.Directory openid profile offline_access"),
      g("g8", "a-intunedoc", "res-graph", "User.Read DeviceManagementConfiguration.Read.All DeviceManagementApps.Read.All openid profile offline_access", "u-admin"),
      g("g9", "a-intuneget", "res-graph", "User.Read"),
      g("g10", "a-spfx", "res-graph", "Files.ReadWrite.All Sites.Read.All User.Read"),
      g("g11", "a-lokka", "res-graph", "User.Read Directory.Read.All openid profile offline_access"),
    ];
    const cert = { customKeyIdentifier: "4479C56B56BCE7B9FCC4CDB263C2919F52C3169E", displayName: "CN=CF-DEMO", endDateTime: fut(560) };
    const reg = (appId, displayName, sec, keys, owners) => ({ id: `app-${appId.slice(0, 8)}`, appId, displayName, signInAudience: "AzureADMyOrg", passwordCredentials: sec || [], keyCredentials: keys || [], owners: owners || [] });
    const regs = [
      reg("db1bdbba-0000-0000-0000-000000000001", "Lokka MCP", [], [cert]),
      reg("190755aa-0000-0000-0000-000000000002", "Graph automation (PowerShell)", [{ displayName: "automation", endDateTime: fut(42) }, { displayName: "old", endDateTime: ago(218) }], [{ customKeyIdentifier: "RHnFa1a857n8xM2yY8KRn1LDFp4=", displayName: "CF-DEMO", endDateTime: fut(560) }], [{ id: "u-dev", userPrincipalName: "dev@contoso.example" }]),
      reg("cfdb0a98-0000-0000-0000-000000000003", "Intune baseline - Autopilot", [{ displayName: null, endDateTime: fut(330) }], []),
      reg("e8b07033-0000-0000-0000-000000000006", "SharePoint automation", [], [cert]),
      reg("9821a199-0000-0000-0000-000000000007", "Teams automation", [], [cert]),
      reg("5b03b9fc-0000-0000-0000-000000000008", "Teams automation (old)", [{ displayName: "old", endDateTime: ago(218) }], [cert]),
      reg("0399eaab-0000-0000-0000-000000000009", "Exchange automation", [{ displayName: "old", endDateTime: ago(218) }], [cert]),
      reg("b1a5a6b2-0000-0000-0000-000000000015", "Harvest uploader", [], [{ customKeyIdentifier: "D3C974E5D3C974E5D3C974E5D3C974E5D3C974E5", displayName: "CN=Harvest", endDateTime: fut(700) }]),
    ];
    const roleDefs = { "rd-cda": { name: "Cloud Device Administrator", templateId: "7698a772-787b-4ac8-901f-60d6b08affd2" }, "rd-spa": { name: "SharePoint Administrator", templateId: "f28a1f50-f6e7-4571-818b-6a12f2af6b6c" }, "rd-exa": { name: "Exchange Administrator", templateId: "29232cdf-9323-42fd-ade2-1d097af3e4de" }, "rd-ta": { name: "Teams Administrator", templateId: "69091246-20e8-4a56-aa4d-066075b2a7a8" } };
    const roles = [{ id: "ra1", roleDefinitionId: "rd-cda", principalId: "a-lokka", directoryScopeId: "/" }, { id: "ra2", roleDefinitionId: "rd-spa", principalId: "a-spauto", directoryScopeId: "/" }, { id: "ra3", roleDefinitionId: "rd-exa", principalId: "a-exo", directoryScopeId: "/" }, { id: "ra4", roleDefinitionId: "rd-ta", principalId: "a-teams", directoryScopeId: "/" }];
    const act = { "db1bdbba-0000-0000-0000-000000000001": 1, "190755aa-0000-0000-0000-000000000002": 5, "cfdb0a98-0000-0000-0000-000000000003": 261, "21e155a5-87ed-4422-8766-c1e750921940": 60, "14d82eec-204b-4c2f-b7e8-296a70dab67e": 2, "02f3bde0-0000-0000-0000-000000000005": 4, "9821a199-0000-0000-0000-000000000007": 5, "5b03b9fc-0000-0000-0000-000000000008": 129, "0399eaab-0000-0000-0000-000000000009": 5, "4437195a-f35c-417f-8c69-58036fbe2137": 8, "a0ea0fc5-970c-43d9-99ae-559a1cd2755e": 1, "6ce0484b-2ae6-4458-b2b9-b3369f42fd6f": 95, "54930b90-0000-0000-0000-000000000013": 55, "b82babfc-0000-0000-0000-000000000014": 3, "b1a5a6b2-0000-0000-0000-000000000015": 30 };
    const activity = Object.fromEntries(Object.entries(act).map(([k, d]) => [k, ago(d)]));
    const consents = [{ spId: "a-graphcli", at: ago(3), by: "adm-admin@contoso.example", admin: true, ok: true }, { spId: "a-tuno", at: ago(2), by: "adm-admin@contoso.example", admin: true, ok: true }];
    const sps = [graph, exo, spo, arm, ...apps];
    const resources = {};
    for (const r of [graph, exo, spo]) resources[r.id] = { appId: r.appId, displayName: r.displayName, roles: Object.fromEntries((r.appRoles || []).map((x) => [x.id, x.value])) };
    return {
      tenantId: T, readAt: t, notes: [], recapped: [{ id: "a-lokka", n: lokkaPerms.length }],
      sps, grants, resources, apps: regs, roles, roleDefs, activity, consents,
      settings: { authz: { defaultUserRolePermissions: { allowedToCreateApps: false, permissionGrantPoliciesAssigned: ["ManagePermissionGrantsForOwnedResource.microsoft-dynamically-managed-permissions-for-chat", "ManagePermissionGrantsForSelf.microsoft-user-default-recommended", "ManagePermissionGrantsForSelf.microsoft-user-default-allow-consent-apps"] } }, acrp: { isEnabled: false, notifyReviewers: false, remindersEnabled: false, requestDurationInDays: 0, reviewers: [] }, classes: [] },
    };
  }

  return { V1, EXPAND_CAP, UNUSED_DAYS, SCOPES, RANK, TIER_LABEL, CAPS, DEV_TOOLS, MS_TENANTS, PARTNERS_DEFAULT, GRAPH_APP, DECISIONS,
    tierOf, parseCustomCsv, originOf, partnerMap, read, readAudit, parseStamp, stamp, withStamp, thumb, nameList, credsOf, analyze, settingsOf, acrpBody, refuse, apply, restore, setAcrp, markdown, csv, permCsv, demo };
})();
if (typeof module !== "undefined" && module.exports) module.exports = AppAccess;
