// ======================================================================
// T61 — 🛡 Securing M365 (BETA, Workspace 03 · Entra Tools, beta 33008).
//
// The tenant's Microsoft 365 security settings read against the CIS
// Microsoft 365 Foundations Benchmark v7.0.0 — everything a BROWSER can
// reach — and fixed from here where Microsoft Graph can change it.
// Mihai, 20 Oct 2026: "need tool in the entra section. Securing M365.
// review everything that can be done from the browser and add it to be
// checked and configured." Mockup first (review/2026-10-20/securing-m365),
// then his decisions:
//   • every tenant sees the tool as ENCA's own hardening checks; the CIS
//     numbers, titles and L1/L2 profile appear only on the publisher tenant
//     (the same gate 📐 CIS uses), because of the CIS terms of use
//   • phase 1 = Microsoft Graph (check + fix), Mail DNS (SPF / DKIM / DMARC
//     over DNS-over-HTTPS) and the 17 Conditional Access controls from the
//     existing 📐 engine (js/cischeck.js); Fabric is phase 2
//   • the controls only PowerShell can audit (Exchange, Defender for
//     Office, Purview, Teams, the rest of SharePoint) get a generated
//     READ-ONLY audit script whose JSON result is loaded back here
//   • attestations and accepted risks live in the tenant: a second open
//     extension on the organization object, nl.limonit.enca.hardening
//     (the GSA record nl.limonit.enca is the first; Graph allows two per
//     app, 2 KB each — so the record is compact and size-checked)
//
// WHAT IS NOT HERE, ON PURPOSE
//   The benchmark's description, rationale, impact and remediation text is
//   © Center for Internet Security and not reproduced. Titles below are
//   ENCA's own words for what good looks like; the CIS number and profile
//   level are references, shown only where the gate allows.
//
// SHAPE
//   CATALOG       one entry per recommendation (160): ENCA key, CIS ref,
//                 area, reach (fix | check | ca | dns | attest | ps | fabric),
//                 sources it needs, judge(S) → { st, now, items }, and for
//                 reach fix a fix: { scopes, role, impact, back, input, ops }
//   read(io)      the Graph sources, each { ok, data } or { ok:false, why }
//   judge(S, ctx) every row with its status — pure, tested in node
//   plan(...)     the selected fixes as merged write operations (two fixes
//                 on one object are ONE write), each with its undo
//   apply(...)    writes, reads back, re-judges; returns the undo snapshot
//   psScript()    the read-only audit script; parsePs() reads its result
//   markdown()    the report
// ======================================================================
const M365Harden = (() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const V1 = "/v1.0", BETA = "/beta";
  const BENCH = { name: "CIS Microsoft 365 Foundations Benchmark", version: "7.0.0", released: "2026-05-20" };
  const CATALOG_REV = "2026-10-20 r1";
  const EXT = "nl.limonit.enca.hardening";
  const EXT_MAX = 1900;          // bytes of the record we allow ourselves (Graph: 2 KB per open extension)
  const PS_SCHEMA = "enca-m365-ps/1";

  const ROLE = {
    GA: "62e90394-69f5-4237-9190-012177145e10", PRA: "e8611ab8-c189-46e8-94e1-60213ab1f814",
    EXA: "29232cdf-9323-42fd-ade2-1d097af3e4de", SPA: "f28a1f50-f6e7-4571-818b-6a12f2af6b6c",
    TEAMS: "69091246-20e8-4a56-aa4d-066075b2a7a8", SEC: "194ae4cb-b126-40b2-bd5b-6091b380977d",
  };
  const ROLE_NAME = { [ROLE.GA]: "Global Administrator", [ROLE.PRA]: "Privileged Role Administrator", [ROLE.EXA]: "Exchange Administrator", [ROLE.SPA]: "SharePoint Administrator", [ROLE.TEAMS]: "Teams Administrator", [ROLE.SEC]: "Security Administrator" };
  const TPL = { unified: "62375ab9-6b52-47ed-826b-58e47e0e304b", pw: "5cf42378-d67d-4f36-ba46-e8b86229381d" };
  const GUEST_ROLE = { same: "a0b1b346-4d3e-4e8b-98f8-753987be4970", limited: "10dae51f-b6af-4016-8d66-8c2a99b929b3", restricted: "2af84b1e-32c8-42b7-82bc-daa82404023b" };
  const THIRD_PARTY_APP = "c1f33bc0-bdb4-4248-ba9b-096807ddb43e";   // Microsoft 365 on the web — third-party storage
  const USER_CONSENT_BAD = ["managepermissiongrantsforself.microsoft-user-default-low", "managepermissiongrantsforself.microsoft-user-default-legacy"];
  // Service plans that make a licence an "application" licence (mail, files,
  // Teams, Office) — an admin account should hold none of them (1.1.4).
  const APP_PLAN = /^(EXCHANGE_S_|EXCHANGE_B_|TEAMS|MCOSTANDARD|MCOEV|SHAREPOINTSTANDARD|SHAREPOINTENTERPRISE|SHAREPOINTWAC|OFFICESUBSCRIPTION|OFFICE_BUSINESS|ONEDRIVE)/;
  const PW_DEFAULTS = { LockoutThreshold: "10", LockoutDurationInSeconds: "60", EnableBannedPasswordCheck: "True", BannedPasswordList: "", EnableBannedPasswordCheckOnPremises: "True", BannedPasswordCheckOnPremisesMode: "Audit" };

  // ---- areas, in screen order ------------------------------------------
  const AREAS = [
    ["m365", "M365 admin"], ["entra", "Entra ID"], ["auth", "Authentication"], ["devices", "Devices"],
    ["apps", "Apps & consent"], ["guests", "Guests"], ["priv", "Privileged access"], ["ca", "Conditional Access"],
    ["spo", "SharePoint"], ["dns", "Mail DNS"], ["exo", "Exchange"], ["mdo", "Defender for Office"],
    ["purview", "Purview"], ["teams", "Teams"], ["fabric", "Fabric"],
  ];
  const REACH = {
    fix: "Fix in browser", check: "Check only", ca: "CA engine", dns: "Mail DNS",
    attest: "Portal — attest", ps: "PowerShell script", fabric: "Fabric (phase 2)",
  };
  const STATUS = {
    pass: "Pass", fail: "Fail", part: "Partly", report: "Report-only", conf: "Configured, Off",
    attest: "Attest", attested: "Attested", accepted: "Accepted", na: "Not applicable", nolic: "Not licensed",
    notread: "Not read", out: "Run the script", phase2: "Phase 2", error: "Error",
  };

  // ---- extra read permissions (asked once, at a click) ------------------
  const RSCOPE = {
    spo: "SharePointTenantSettings.Read.All", apps: "OrgSettings-AppsAndServices.Read.All", forms: "OrgSettings-Forms.Read.All",
    intune: "DeviceManagementConfiguration.Read.All", enroll: "DeviceManagementServiceConfig.Read.All",
    audit: "AuditLog.Read.All", role: "RoleManagement.Read.Directory", rolePol: "RoleManagementPolicy.Read.Directory",
    ar: "AccessReview.Read.All", sync: "OnPremDirectorySynchronization.Read.All", mbx: "MailboxSettings.Read",
  };
  const W = {
    authz: "Policy.ReadWrite.Authorization", dev: "Policy.ReadWrite.DeviceConfiguration", appcfg: "Policy.ReadWrite.ApplicationConfiguration",
    acrp: "Policy.ReadWrite.ConsentRequest", amp: "Policy.ReadWrite.AuthenticationMethod", dir: "Directory.ReadWrite.All",
    domain: "Domain.ReadWrite.All", group: "Group.ReadWrite.All", user: "User.ReadWrite.All", app: "Application.ReadWrite.All",
    apps: "OrgSettings-AppsAndServices.ReadWrite.All", forms: "OrgSettings-Forms.ReadWrite.All",
    intune: "DeviceManagementServiceConfig.ReadWrite.All", intuneCfg: "DeviceManagementConfiguration.ReadWrite.All",
    pim: "RoleManagementPolicy.ReadWrite.Directory", spo: "SharePointTenantSettings.ReadWrite.All", org: "Organization.ReadWrite.All",
  };

  // ---- sources ----------------------------------------------------------
  // key → { url, scope (an extra read scope, or null for the sign-in scopes),
  // all (paged list) }. Dependent reads (role members, PIM rules, sync) are
  // done in read() after the list they hang off.
  const SOURCES = {
    org: { url: `${V1}/organization?$select=id,displayName,onPremisesSyncEnabled,verifiedDomains`, all: true },
    skus: { url: `${V1}/subscribedSkus`, all: true },
    domains: { url: `${V1}/domains`, all: true },
    authz: { url: `${V1}/policies/authorizationPolicy` },
    devReg: { url: `${V1}/policies/deviceRegistrationPolicy` },
    appMgmt: { url: `${V1}/policies/defaultAppManagementPolicy` },
    acrp: { url: `${V1}/policies/adminConsentRequestPolicy` },
    abt: { url: `${V1}/policies/activityBasedTimeoutPolicies`, all: true },
    amp: { url: `${BETA}/policies/authenticationMethodsPolicy` },
    groupSettings: { url: `${V1}/groupSettings`, all: true },
    b2b: { url: `${BETA}/legacy/policies`, all: true },
    unified: { url: `${V1}/groups?$filter=groupTypes/any(c:c eq 'Unified')&$select=id,displayName,visibility,createdDateTime&$top=999`, all: true },
    thirdParty: { url: `${V1}/servicePrincipals?$filter=appId eq '${THIRD_PARTY_APP}'&$select=id,appId,displayName,accountEnabled`, all: true },
    roles: { url: `${V1}/directoryRoles?$select=id,displayName,roleTemplateId`, all: true },
    strengths: { url: `${V1}/policies/authenticationStrengthPolicies`, all: true },
    locations: { url: `${V1}/identity/conditionalAccess/namedLocations`, all: true },
    caPolicies: { url: `${V1}/identity/conditionalAccess/policies`, all: true },
    appsSvc: { url: `${BETA}/admin/appsAndServices`, scope: "apps" },
    forms: { url: `${BETA}/admin/forms/settings`, scope: "forms" },
    // beta: the whole settings object — the write sends it back whole (33010)
    intune: { url: `${BETA}/deviceManagement/settings`, scope: "intune" },
    enroll: { url: `${BETA}/deviceManagement/deviceEnrollmentConfigurations`, scope: "enroll", all: true },
    spo: { url: `${V1}/admin/sharepoint/settings`, scope: "spo" },
    regDetails: { url: `${BETA}/reports/authenticationMethods/userRegistrationDetails?$filter=isMfaCapable eq false and userType eq 'member'&$select=id,userPrincipalName,userDisplayName,isAdmin,isMfaCapable`, scope: "audit", all: true },
    privDefs: { url: `${BETA}/roleManagement/directory/roleDefinitions?$filter=isPrivileged eq true&$select=id,displayName,isPrivileged,isBuiltIn,templateId`, scope: "role", all: true },
    schedInst: { url: `${V1}/roleManagement/directory/roleAssignmentScheduleInstances?$expand=principal`, scope: "role", all: true },
    reviews: { url: `${V1}/identityGovernance/accessReviews/definitions`, scope: "ar", all: true },
  };
  const SOURCE_LABEL = {
    org: "organization", skus: "licences", domains: "domains", authz: "authorization policy", devReg: "device registration policy",
    appMgmt: "app management policy", acrp: "admin consent requests", abt: "idle session timeout", amp: "authentication methods",
    groupSettings: "directory settings", b2b: "B2B invitation domains", unified: "Microsoft 365 groups", thirdParty: "third-party storage app",
    roles: "directory roles", strengths: "authentication strengths", locations: "named locations", caPolicies: "Conditional Access policies",
    appsSvc: "apps and services", forms: "Forms settings", intune: "Intune compliance settings", enroll: "Intune enrollment restrictions",
    spo: "SharePoint settings", regDetails: "MFA registration report", privDefs: "privileged role definitions", schedInst: "role assignments (PIM)",
    reviews: "access reviews", pimGA: "PIM settings — Global Administrator", pimPRA: "PIM settings — Privileged Role Administrator", sync: "directory sync",
    ext: "ENCA hardening record", dns: "DNS records", perUser: "per-user MFA", sharedMbx: "shared mailboxes",
  };

  const errText = (e) => String((e && e.message) || e || "error").replace(/\s+/g, " ").slice(0, 240);
  const isGone = (e) => /\(404\)|ResourceNotFound|Request_ResourceNotFound|not found|does not exist/i.test(errText(e));
  const isLicence = (e) => /licen[cs]e|AadPremiumLicenseRequired|P2|Premium|not (?:licensed|entitled)|SubscriptionNotFound|Tenant does not have/i.test(errText(e));

  // io: { one(url, scope) → obj, all(url, scope) → [] , has(scope) → bool }
  // scope is an RSCOPE key or null; io.has decides whether that permission
  // is granted (a source needing one that is not is "not granted", never a guess).
  async function read(io, opts) {
    const o = opts || {}, S = { readAt: new Date().toISOString() };
    const step = (m) => { if (o.onStep) o.onStep(m); };
    const one = async (key, fn) => {
      try { S[key] = { ok: true, data: await fn() }; }
      catch (e) { S[key] = { ok: false, why: isLicence(e) ? `not licensed — ${errText(e)}` : errText(e), licence: isLicence(e) }; }
    };
    const keys = Object.keys(SOURCES);
    let n = 0;
    const run = async (key) => {
      const s = SOURCES[key];
      if (s.scope && !io.has(s.scope)) { S[key] = { ok: false, why: `not granted — needs ${RSCOPE[s.scope]}`, scope: s.scope }; return; }
      step(`Reading ${SOURCE_LABEL[key]}… (${++n} of ${keys.length})`);
      if (key === "caPolicies" && o.caPolicies) { S[key] = { ok: true, data: o.caPolicies }; return; }
      await one(key, () => (s.all ? io.all(s.url, s.scope || null) : io.one(s.url, s.scope || null)));
    };
    for (let i = 0; i < keys.length; i += 6) await Promise.all(keys.slice(i, i + 6).map(run));
    // role members: each role read on its own, groups expanded transitively
    if (S.roles.ok) {
      step("Reading directory role members…");
      await one("roleMembers", async () => {
        const out = {};
        for (const r of S.roles.data) {
          const mem = await io.all(`${V1}/directoryRoles/${r.id}/members?$select=id,displayName,userPrincipalName,onPremisesSyncEnabled,assignedLicenses,accountEnabled`, null);
          const users = [];
          for (const m of mem) {
            const t = lc(m["@odata.type"]);
            if (t.includes("group")) {
              const gm = await io.all(`${V1}/groups/${m.id}/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName,onPremisesSyncEnabled,assignedLicenses,accountEnabled`, null).catch(() => []);
              gm.forEach((u) => users.push(Object.assign({ via: m.displayName }, u)));
            } else if (t.includes("user")) users.push(m);
          }
          out[r.roleTemplateId] = { name: r.displayName, users };
        }
        return out;
      });
    }
    // PIM approval rules for GA and PRA
    for (const [key, rid] of [["pimGA", ROLE.GA], ["pimPRA", ROLE.PRA]]) {
      if (!io.has("rolePol")) { S[key] = { ok: false, why: `not granted — needs ${RSCOPE.rolePol}`, scope: "rolePol" }; continue; }
      step(`Reading ${SOURCE_LABEL[key]}…`);
      await one(key, async () => {
        const a = await io.all(`${V1}/policies/roleManagementPolicyAssignments?$filter=scopeId eq '/' and scopeType eq 'DirectoryRole' and roleDefinitionId eq '${rid}'&$select=policyId`, "rolePol");
        const pid = a[0] && a[0].policyId;
        if (!pid) return null;
        const rule = await io.one(`${V1}/policies/roleManagementPolicies/${pid}/rules/Approval_EndUser_Assignment`, "rolePol");
        return { policyId: pid, rule };
      });
    }
    // directory sync — only on a synced tenant
    const org = S.org.ok && S.org.data && S.org.data[0];
    if (org && org.onPremisesSyncEnabled) {
      if (!io.has("sync")) S.sync = { ok: false, why: `not granted — needs ${RSCOPE.sync}`, scope: "sync" };
      else await one("sync", async () => { const v = await io.all(`${V1}/directory/onPremisesSynchronization`, "sync"); return v[0] || null; });
    } else S.sync = { ok: true, data: null };
    // the ENCA hardening record (404 = none yet)
    if (org) {
      try { S.ext = { ok: true, data: await io.one(`${V1}/organization/${org.id}/extensions/${EXT}`, null) }; }
      catch (e) { S.ext = isGone(e) ? { ok: true, data: null } : { ok: false, why: errText(e) }; }
    } else S.ext = { ok: false, why: "organization not read" };
    return S;
  }

  // ---- on-demand reads (one request per account, batched by 20) ----------
  // io.all(url, scope) and io.batch(requests, onProgress, base) → { [id]: { body } | { error } }
  async function readPerUser(io, onStep) {
    const users = await io.all(`${V1}/users?$filter=accountEnabled eq true and userType eq 'Member'&$select=id,userPrincipalName&$top=999`, null);
    if (onStep) onStep(`Reading per-user MFA for ${users.length} users…`);
    const res = await io.batch(users.map((u) => ({ id: u.id, method: "GET", url: `/users/${u.id}/authentication/requirements` })), (d, t) => onStep && onStep(`Per-user MFA: ${d} of ${t}…`), "beta");
    let refused = 0;
    const out = users.map((u) => { const r = res[u.id] || {}; if (r.error) refused++; return { id: u.id, upn: u.userPrincipalName, state: r.body ? lc(r.body.perUserMfaState) : "" }; });
    if (users.length && refused === users.length) throw new Error(`every read was refused — ${(res[users[0].id] || {}).error || "no detail"}`);
    return { users: out.filter((u) => u.state), refused };
  }
  async function readShared(io, onStep) {
    const cand = (await io.all(`${V1}/users?$filter=assignedLicenses/$count eq 0&$count=true&$select=id,userPrincipalName,mail,accountEnabled&$top=999`, null)).filter((u) => u.mail);
    if (onStep) onStep(`Checking ${cand.length} unlicensed accounts with a mailbox…`);
    const res = await io.batch(cand.map((u) => ({ id: u.id, method: "GET", url: `/users/${u.id}/mailboxSettings/userPurpose` })), (d, t) => onStep && onStep(`Mailboxes: ${d} of ${t}…`), "v1.0");
    let refused = 0;
    const shared = [];
    for (const u of cand) { const r = res[u.id] || {}; if (r.error) { refused++; continue; } const v = lc(r.body && (r.body.value || r.body.userPurpose || r.body)); if (v === "shared") shared.push({ id: u.id, userPrincipalName: u.userPrincipalName, accountEnabled: u.accountEnabled !== false }); }
    if (cand.length && refused === cand.length) throw new Error(`no mailbox could be read with your token (MailboxSettings.Read reaches only mailboxes you may open) — ${(res[cand[0].id] || {}).error || ""}`);
    return { shared, candidates: cand.length, refused };
  }

  // ---- DNS (2.1.8 / 2.1.9 / 2.1.10) -------------------------------------
  // dnsio(name, type) → { Status, Answer:[{type, data}] } (DNS-over-HTTPS
  // JSON). Only public names leave the browser; no token, ever.
  function mailDomains(S) {
    if (!S.domains || !S.domains.ok) return [];
    return S.domains.data.filter((d) => d.isVerified && !/\.mail\.onmicrosoft\.com$/i.test(d.id))
      .map((d) => ({ name: d.id, initial: !!d.isInitial || /\.onmicrosoft\.com$/i.test(d.id), email: (d.supportedServices || []).includes("Email") }));
  }
  async function readDns(S, dnsio, onStep) {
    const out = {};
    for (const d of mailDomains(S)) {
      if (onStep) onStep(`DNS ${d.name}…`);
      const rec = { name: d.name, initial: d.initial, email: d.email };
      const txt = async (n) => { const r = await dnsio(n, "TXT"); return (r.Answer || []).filter((a) => a.type === 16).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/"\s*"/g, "")); };
      try {
        rec.spf = (await txt(d.name)).filter((t) => /^v=spf1/i.test(t));
        const redir = rec.spf[0] && /redirect=([^\s]+)/i.exec(rec.spf[0]);
        if (redir) rec.spfRedirect = (await txt(redir[1])).filter((t) => /^v=spf1/i.test(t))[0] || "";
        rec.dmarc = (await txt(`_dmarc.${d.name}`)).filter((t) => /^v=DMARC1/i.test(t));
        if (!d.initial) {
          rec.dkim = {};
          for (const sel of ["selector1", "selector2"]) {
            const r = await dnsio(`${sel}._domainkey.${d.name}`, "CNAME");
            const a = (r.Answer || []).find((x) => x.type === 5);
            rec.dkim[sel] = a ? String(a.data || "").replace(/\.$/, "") : "";
          }
        }
      } catch (e) { rec.err = errText(e); }
      out[d.name] = rec;
    }
    return out;
  }
  function spfVerdict(r) {
    const s = r.spf || [];
    if (!s.length) return [false, "no SPF record"];
    if (s.length > 1) return [false, `${s.length} SPF records (only one is allowed)`];
    const rec = r.spfRedirect != null ? r.spfRedirect : s[0];
    if (/\s[-~]all\s*$/i.test(` ${rec}`)) return [true, rec.length > 70 ? rec.slice(0, 70) + "…" : rec];
    return [false, `ends without -all or ~all: ${rec.slice(0, 60)}`];
  }
  function dmarcVerdict(r) {
    const d = r.dmarc || [];
    if (!d.length) return [false, "no DMARC record"];
    const t = Object.fromEntries(d[0].split(";").map((x) => x.trim().split("=")).filter((x) => x.length === 2).map(([k, v]) => [lc(k), v.trim()]));
    const bad = [];
    if (!["quarantine", "reject"].includes(lc(t.p))) bad.push(`p=${t.p || "missing"}`);
    if (t.pct && t.pct !== "100") bad.push(`pct=${t.pct}`);
    if (!/mailto:/i.test(t.rua || "")) bad.push("no rua");
    if (!/mailto:/i.test(t.ruf || "")) bad.push("no ruf");
    return [!bad.length, bad.length ? bad.join(", ") : `p=${t.p}`];
  }

  // ---- helpers for judges -------------------------------------------------
  const need = (S, ...keys) => {
    for (const k of keys) {
      const s = S[k];
      if (!s) return { st: "notread", now: `${SOURCE_LABEL[k] || k}: not read yet` };
      if (!s.ok) return { st: s.licence ? "nolic" : "notread", now: `${SOURCE_LABEL[k] || k}: ${s.why}`, scope: s.scope };
    }
    return null;
  };
  const yes = (v) => v === true || lc(v) === "true";
  const dur = (s) => { const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(String(s || "")); return m ? (+(m[1] || 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4]) : null; };
  const iso = (s) => { const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/.exec(String(s || "")); return m ? (+(m[1] || 0) * 365 + +(m[2] || 0) * 30 + +(m[3] || 0)) : null; };
  const authz = (S) => S.authz.data || {};
  const dur8 = (S) => authz(S).defaultUserRolePermissions || {};
  const amCfg = (S, id) => ((S.amp.data || {}).authenticationMethodConfigurations || []).find((c) => lc(c.id) === lc(id)) || null;
  const settingsObj = (S, tpl) => (S.groupSettings.data || []).find((g) => lc(g.templateId) === tpl) || null;
  const settingVal = (obj, name, def) => { const v = obj && (obj.values || []).find((x) => lc(x.name) === lc(name)); return v ? v.value : def; };
  const pwVal = (S, name) => settingVal(settingsObj(S, TPL.pw), name, PW_DEFAULTS[name]);
  const allUsersTarget = (t) => (Array.isArray(t) ? t : [t]).some((x) => x && lc(x.id) === "all_users");
  const orgOf = (S) => (S.org && S.org.ok && S.org.data && S.org.data[0]) || null;
  const hybrid = (S) => !!(orgOf(S) && orgOf(S).onPremisesSyncEnabled);
  const memType = (o) => lc((o || {})["@odata.type"]);
  const restrictedMembership = (o) => /enumerated|nodeviceregistration/.test(memType(o));
  const skuPlans = (S) => { const m = new Map(); for (const s of (S.skus && S.skus.ok ? S.skus.data : [])) m.set(s.skuId, s); return m; };
  const licence = (S) => {
    if (!S.skus || !S.skus.ok) return { known: false };
    const plans = new Set(S.skus.data.filter((s) => !["Suspended", "Deleted", "LockedOut"].includes(s.capabilityStatus)).flatMap((s) => (s.servicePlans || []).filter((p) => ["Success", "PendingInput", "PendingActivation"].includes(p.provisioningStatus)).map((p) => p.servicePlanName)));
    const has = (rx) => [...plans].some((p) => rx.test(p));
    return { known: true, p1: has(/^AAD_PREMIUM$/), p2: has(/^AAD_PREMIUM_P2$/), gov: has(/IDENTITY_GOVERNANCE|Entra_Identity_Governance/i), intune: has(/^INTUNE_A/), spo: has(/^SHAREPOINT/), exo: has(/^EXCHANGE_S_/), teams: has(/^TEAMS1$/), plans };
  };
  const privRoles = (S) => {
    const rm = S.roleMembers && S.roleMembers.ok ? S.roleMembers.data : {};
    return Object.entries(rm).filter(([, r]) => /administrator/i.test(r.name) || r.name === "Global Reader");
  };
  const adminUsers = (S) => {
    const map = new Map();
    for (const [, r] of privRoles(S)) for (const u of r.users) { const e = map.get(u.id) || Object.assign({ roles: [] }, u); e.roles.push(r.name); map.set(u.id, e); }
    return [...map.values()];
  };
  const appLicences = (S, u) => {
    const skus = skuPlans(S), out = [];
    for (const l of u.assignedLicenses || []) {
      const s = skus.get(l.skuId); if (!s) continue;
      const off = new Set(l.disabledPlans || []);
      if ((s.servicePlans || []).some((p) => !off.has(p.servicePlanId) && APP_PLAN.test(p.servicePlanName))) out.push(s.skuPartNumber);
    }
    return out;
  };
  const list = (arr, n) => { const a = arr.slice(0, n || 3); return a.join(", ") + (arr.length > a.length ? ` +${arr.length - a.length}` : ""); };
  const caMatchesIdle = (p) => p.state === "enabled" && (p.conditions?.users?.includeUsers || []).includes("All") &&
    (p.conditions?.applications?.includeApplications || []).some((a) => lc(a) === "office365") &&
    JSON.stringify((p.conditions?.clientAppTypes || []).map(lc)) === '["browser"]' && p.sessionControls?.applicationEnforcedRestrictions?.isEnabled === true;
  const appRestr = (S, side, kind, type) => (((S.appMgmt.data || {})[side] || {})[kind] || []).find((r) => lc(r.restrictionType) === lc(type));
  const restrOk = (r, maxDays) => {
    if (!r) return false;
    if (r.state && lc(r.state) !== "enabled") return false;
    const when = r.restrictForAppsCreatedAfterDateTime;
    if (when && !/^0001-01-01/.test(when) && new Date(when) > new Date()) return false;
    if (maxDays != null) { const d = iso(r.maxLifetime); if (d == null || d > maxDays) return false; }
    return true;
  };

  // ---- fix plumbing -------------------------------------------------------
  // An op touches one object. ops with the same key are merged: the first
  // seed() is the starting body, every mutate() runs on it in turn, and the
  // undo bodies are merged too — so 5.1.4.2 and 5.1.4.3 picked together are
  // ONE PUT of the device registration policy, not two that overwrite each other.
  const op = (o) => Object.assign({ key: `${o.method} ${o.url}` }, o);
  const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj && k in obj) o[k] = clone(obj[k]); return o; };
  const authzOp = (S, prop, value) => op({
    method: "PATCH", url: `${V1}/policies/authorizationPolicy`, source: "authz",
    seed: () => ({ defaultUserRolePermissions: {} }),
    mutate: (b) => { b.defaultUserRolePermissions[prop] = clone(value); },
    undo: { defaultUserRolePermissions: { [prop]: clone(dur8(S)[prop]) } },
  });
  const authzTop = (S, prop, value) => op({
    method: "PATCH", url: `${V1}/policies/authorizationPolicy`, source: "authz",
    seed: () => ({ defaultUserRolePermissions: {} }),
    mutate: (b) => { b[prop] = value; },
    undo: { [prop]: clone(authz(S)[prop]) },
  });
  const devRegOp = (S, fn) => op({
    method: "PUT", url: `${V1}/policies/deviceRegistrationPolicy`, source: "devReg", whole: true,
    seed: () => { const b = clone(S.devReg.data || {}); for (const k of Object.keys(b)) if (/^@odata|^id$|^displayName$|^description$/.test(k)) delete b[k]; return b; },
    mutate: fn,
    undo: (() => { const b = clone(S.devReg.data || {}); for (const k of Object.keys(b)) if (/^@odata|^id$|^displayName$|^description$/.test(k)) delete b[k]; return b; })(),
  });
  const appMgmtOp = (S, side, kind, entry) => op({
    method: "PATCH", url: `${V1}/policies/defaultAppManagementPolicy`, source: "appMgmt",
    seed: () => { const d = S.appMgmt.data || {}; return { isEnabled: true, applicationRestrictions: clone(d.applicationRestrictions || {}), servicePrincipalRestrictions: clone(d.servicePrincipalRestrictions || {}) }; },
    mutate: (b) => {
      for (const s of side) {
        b[s] = b[s] || {}; const arr = (b[s][kind] || []).filter((r) => lc(r.restrictionType) !== lc(entry.restrictionType));
        arr.push(clone(entry)); b[s][kind] = arr;
      }
    },
    undo: pick(S.appMgmt.data || {}, ["isEnabled", "applicationRestrictions", "servicePrincipalRestrictions"]),
  });
  const settingsOp = (S, tpl, name, value) => {
    const obj = settingsObj(S, tpl);
    if (obj) return op({
      method: "PATCH", url: `${V1}/groupSettings/${obj.id}`, source: "groupSettings",
      seed: () => ({ values: clone(obj.values || []) }),
      mutate: (b) => { const v = b.values.find((x) => lc(x.name) === lc(name)); if (v) v.value = String(value); else b.values.push({ name, value: String(value) }); },
      undo: { values: clone(obj.values || []) },
    });
    return op({
      method: "POST", url: `${V1}/groupSettings`, key: `POST ${V1}/groupSettings ${tpl}`, source: "groupSettings", create: true,
      seed: () => ({ templateId: tpl, values: [] }),
      mutate: (b) => { const v = b.values.find((x) => lc(x.name) === lc(name)); if (v) v.value = String(value); else b.values.push({ name, value: String(value) }); },
      undo: null,
    });
  };
  const ampOp = (S, id, type, fn, beta) => {
    const cur = amCfg(S, id) || {};
    return op({
      method: "PATCH", url: `${beta ? BETA : V1}/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/${id}`, source: "amp",
      seed: () => ({ "@odata.type": `#microsoft.graph.${type}` }),
      mutate: fn,
      undo: Object.assign({ "@odata.type": `#microsoft.graph.${type}` }, pick(cur, ["state", "featureSettings", "includeTargets"])),
    });
  };
  const spoOp = (S, props) => op({
    method: "PATCH", url: `${V1}/admin/sharepoint/settings`, source: "spo",
    seed: () => ({}), mutate: (b, input) => Object.assign(b, typeof props === "function" ? props(input) : props),
    undo: pick(S.spo.data || {}, typeof props === "function" ? Object.keys(props({})) : Object.keys(props)),
  });

  // ---- the catalog ----------------------------------------------------------
  // lvl: CIS profile level (1/2). k: ENCA's key (what the script and the
  // record use). t: ENCA's own words. tgt: the target in plain words.
  const C = [];
  const add = (o) => C.push(o);

  // ===== M365 admin ======================================================
  add({ k: "adm-cloud-only", cis: "1.1.1", lvl: 1, area: "priv", reach: "check", t: "Admin accounts are cloud-only, not synced from on-premises AD", tgt: "0 synced admin accounts",
    src: ["roleMembers"], judge(S) { const n = need(S, "roleMembers"); if (n) return n; const a = adminUsers(S), bad = a.filter((u) => u.onPremisesSyncEnabled === true);
      return { st: bad.length ? "fail" : "pass", now: bad.length ? `${bad.length} of ${a.length} admin accounts synced: ${list(bad.map((u) => u.userPrincipalName))}` : `${a.length} admin accounts, none synced`, items: bad.map((u) => `${u.userPrincipalName} — ${u.roles.join(", ")}`) }; },
    go: "Create a cloud-only admin account for each person, move the role, and leave the synced account as their daily one. 02 PIM-buddy → 🎖 Roles shows who holds what." });
  add({ k: "adm-breakglass", cis: "1.1.2", lvl: 1, area: "priv", reach: "attest", t: "Two emergency access (break-glass) accounts exist", tgt: "two, confirmed",
    src: ["roleMembers"], judge(S) { const n = need(S, "roleMembers"); const ga = n ? [] : ((S.roleMembers.data[ROLE.GA] || {}).users || []);
      const cand = ga.filter((u) => !u.onPremisesSyncEnabled && !(u.assignedLicenses || []).length);
      return { st: "attest", now: n ? "attest after checking the accounts" : `${cand.length} unlicensed cloud-only Global Administrator${cand.length === 1 ? "" : "s"}: ${list(cand.map((u) => u.userPrincipalName)) || "none"}`, items: cand.map((u) => u.userPrincipalName) }; },
    portal: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles", go: "No API can say an account IS a break-glass account. ENCA lists the likely ones; confirm the two and attest." });
  add({ k: "adm-ga-count", cis: "1.1.3", lvl: 1, area: "priv", reach: "check", t: "Between two and four Global Administrators", tgt: "2–4",
    src: ["roleMembers"], judge(S) { const n = need(S, "roleMembers"); if (n) return n; const ga = (S.roleMembers.data[ROLE.GA] || {}).users || []; const ids = [...new Set(ga.map((u) => u.id))];
      return { st: ids.length >= 2 && ids.length <= 4 ? "pass" : "fail", now: `${ids.length} Global Administrator${ids.length === 1 ? "" : "s"} (active)`, items: ga.map((u) => `${u.userPrincipalName}${u.via ? ` (via ${u.via})` : ""}`) }; },
    go: "Remove or convert to eligible in 02 PIM-buddy → 🎖 Roles, keeping the two break-glass accounts." });
  add({ k: "adm-licence", cis: "1.1.4", lvl: 1, area: "priv", reach: "check", t: "Admin accounts hold no mail, Teams or Office licence", tgt: "no application licence",
    src: ["roleMembers", "skus"], judge(S) { const n = need(S, "roleMembers", "skus"); if (n) return n; const a = adminUsers(S).map((u) => ({ u, l: appLicences(S, u) })).filter((x) => x.l.length);
      return { st: a.length ? "fail" : "pass", now: a.length ? `${a.length} admin account${a.length === 1 ? "" : "s"} with an application licence` : "no admin account holds an application licence", items: a.map((x) => `${x.u.userPrincipalName} — ${x.l.join(", ")}`) }; },
    go: "Give admins a separate account with Entra ID P1/P2 only. A daily account that is only ELIGIBLE through PIM (approval required) also satisfies it." });
  add({ k: "grp-public", cis: "1.2.1", lvl: 2, area: "m365", reach: "fix", t: "No public Microsoft 365 groups unless approved", tgt: "Private",
    src: ["unified"], judge(S) { const n = need(S, "unified"); if (n) return n; const p = S.unified.data.filter((g) => lc(g.visibility) === "public");
      return { st: p.length ? "fail" : "pass", now: p.length ? `${p.length} public group${p.length === 1 ? "" : "s"} of ${S.unified.data.length}` : `${S.unified.data.length} groups, none public`, items: p.map((g) => g.displayName), pickable: p.map((g) => ({ id: g.id, label: g.displayName })) }; },
    fix: { scopes: [W.group], role: "Groups Administrator", input: { kind: "pick", label: "Make these private (untick the ones that are approved to stay public)" },
      impact: "People outside the group can no longer find the group's Team, files and conversations or join it themselves — they ask the owner. Members keep everything. A group you untick stays public and should be accepted with a reason.",
      back: "PATCH visibility back to Public for exactly the groups in the snapshot.",
      ops: (S, input) => S.unified.data.filter((g) => lc(g.visibility) === "public" && (!input || !input.picked || input.picked.includes(g.id))).map((g) => op({ method: "PATCH", url: `${V1}/groups/${g.id}`, label: g.displayName, seed: () => ({}), mutate: (b) => { b.visibility = "Private"; }, undo: { visibility: g.visibility }, source: "unified" })) } });
  add({ k: "mbx-shared-signin", cis: "1.2.2", lvl: 1, area: "m365", reach: "fix", t: "Shared mailboxes cannot be signed in to", tgt: "sign-in blocked",
    src: ["sharedMbx"], judge(S) { const s = S.sharedMbx; if (!s) return { st: "notread", now: "press 📬 Find shared mailboxes (one read per candidate account)", ondemand: "sharedMbx" }; if (!s.ok) return { st: "notread", now: s.why, ondemand: "sharedMbx" };
      const on = s.data.shared.filter((u) => u.accountEnabled);
      return { st: on.length ? "fail" : "pass", now: `${on.length} of ${s.data.shared.length} shared mailboxes can sign in${s.data.refused ? ` · ${s.data.refused} could not be read` : ""}`, items: on.map((u) => u.userPrincipalName), pickable: on.map((u) => ({ id: u.id, label: u.userPrincipalName })) }; },
    fix: { scopes: [W.user], role: "User Administrator", input: { kind: "pick", label: "Block sign-in for these shared mailboxes" },
      impact: "Nobody can sign in AS the mailbox any more. Everyone with delegated access (Full Access, Send As) keeps using it from their own account, so day to day nothing changes. A process that signs in with the mailbox's own password stops.",
      back: "PATCH accountEnabled back to true for exactly the accounts in the snapshot.",
      ops: (S, input) => S.sharedMbx.data.shared.filter((u) => u.accountEnabled && (!input || !input.picked || input.picked.includes(u.id))).map((u) => op({ method: "PATCH", url: `${V1}/users/${u.id}`, label: u.userPrincipalName, seed: () => ({}), mutate: (b) => { b.accountEnabled = false; }, undo: { accountEnabled: true }, source: "sharedMbx" })) } });
  add({ k: "pw-never-expire", cis: "1.3.1", lvl: 1, area: "auth", reach: "fix", t: "Passwords never expire (MFA does the work)", tgt: "never expire",
    src: ["domains"], judge(S) { const n = need(S, "domains"); if (n) return n; const ds = S.domains.data.filter((d) => d.isVerified && lc(d.authenticationType) === "managed");
      const bad = ds.filter((d) => Number(d.passwordValidityPeriodInDays) !== 2147483647);
      return { st: bad.length ? "fail" : "pass", now: bad.length ? `${bad.length} domain${bad.length === 1 ? "" : "s"} expire passwords: ${list(bad.map((d) => `${d.id} (${d.passwordValidityPeriodInDays} d)`))}` : `never expire on ${ds.length} managed domain${ds.length === 1 ? "" : "s"}` }; },
    fix: { scopes: [W.domain], role: "Domain Name Administrator",
      impact: "Users stop being forced to change their password every N days. That is safe only with MFA for everyone — check 🛡 Conditional Access rows above. Users notice nothing else; current passwords stay valid.",
      back: "PATCH passwordValidityPeriodInDays back to the snapshot value per domain.",
      ops: (S) => S.domains.data.filter((d) => d.isVerified && lc(d.authenticationType) === "managed" && Number(d.passwordValidityPeriodInDays) !== 2147483647).map((d) => op({ method: "PATCH", url: `${V1}/domains/${encodeURIComponent(d.id)}`, label: d.id, seed: () => ({}), mutate: (b) => { b.passwordValidityPeriodInDays = 2147483647; }, undo: { passwordValidityPeriodInDays: d.passwordValidityPeriodInDays }, source: "domains" })) } });
  add({ k: "idle-timeout", cis: "1.3.2", lvl: 2, area: "m365", reach: "fix", t: "Idle web sessions sign out after 3 hours or less on unmanaged devices", tgt: "≤ 3 h + CA app-enforced restrictions",
    src: ["abt", "caPolicies"], judge(S) { const n = need(S, "abt"); if (n) return n;
      const p = S.abt.data[0]; let secs = null;
      try { const d = JSON.parse((p && p.definition && p.definition[0]) || "null"); secs = dur(((d && d.ActivityBasedTimeoutPolicy && d.ActivityBasedTimeoutPolicy.ApplicationPolicies) || [])[0]?.WebSessionIdleTimeout); } catch { secs = null; }
      const tOk = secs != null && secs <= 3 * 3600;
      const ca = S.caPolicies && S.caPolicies.ok ? S.caPolicies.data.filter(caMatchesIdle) : null;
      const now = `${secs == null ? "no timeout policy" : `timeout ${(secs / 3600).toFixed(secs % 3600 ? 1 : 0)} h`} · ${ca == null ? "CA not read" : ca.length ? `CA: ${ca[0].displayName}` : "no CA policy with app-enforced restrictions for browsers"}`;
      return { st: tOk && ca && ca.length ? "pass" : tOk ? "part" : "fail", now }; },
    fix: { scopes: [W.appcfg], role: "Cloud Application Administrator or Global Administrator",
      impact: "Microsoft 365 web apps (Outlook, SharePoint, OneDrive, Office) sign a user out after 3 hours without activity. Desktop and mobile apps are not affected. It only takes effect on unmanaged devices once the Conditional Access half exists — All users, Office 365, client app Browser, session Use app enforced restrictions. ENCA writes the timeout; the CA policy is built in 🏗 Policy builder (born report-only).",
      back: "Delete the timeout policy ENCA created, or PATCH the previous definition back.",
      ops: (S) => { const p = S.abt.data[0]; const def = JSON.stringify({ ActivityBasedTimeoutPolicy: { Version: 1, ApplicationPolicies: [{ ApplicationId: "default", WebSessionIdleTimeout: "03:00:00" }] } });
        return [p ? op({ method: "PATCH", url: `${V1}/policies/activityBasedTimeoutPolicies/${p.id}`, seed: () => ({}), mutate: (b) => { b.definition = [def]; }, undo: { definition: clone(p.definition) }, source: "abt" })
          : op({ method: "POST", url: `${V1}/policies/activityBasedTimeoutPolicies`, create: true, seed: () => ({ displayName: "DefaultTimeoutPolicy", isOrganizationDefault: true, definition: [def] }), mutate: () => {}, undo: null, source: "abt" })]; } },
    go: "The Conditional Access half: 🏗 Policy builder → All users · Office 365 · Browser · Session: Use app enforced restrictions." });
  add({ k: "apps-store-trials", cis: "1.3.4", lvl: 1, area: "m365", reach: "fix", t: "Users cannot use the Office Store or start trials", tgt: "Store off · trials off",
    src: ["appsSvc"], judge(S) { const n = need(S, "appsSvc"); if (n) return n; const s = (S.appsSvc.data || {}).settings || {};
      const ok = s.isOfficeStoreEnabled === false && s.isAppAndServicesTrialEnabled === false;
      return { st: ok ? "pass" : "fail", now: `Store ${s.isOfficeStoreEnabled ? "on" : "off"} · trials ${s.isAppAndServicesTrialEnabled ? "on" : "off"}` }; },
    fix: { scopes: [W.apps], role: "Global Administrator",
      impact: "Users can no longer install add-ins from the Office Store into their own account or start trial subscriptions of apps and services. Add-ins an admin deploys centrally keep working.",
      back: "PATCH both settings back to the snapshot values.",
      ops: (S) => [op({ method: "PATCH", url: `${BETA}/admin/appsAndServices`, source: "appsSvc", seed: () => ({ "@odata.type": "#microsoft.graph.adminAppsAndServices", settings: { "@odata.type": "microsoft.graph.appsAndServicesSettings" } }), mutate: (b) => { b.settings.isOfficeStoreEnabled = false; b.settings.isAppAndServicesTrialEnabled = false; }, undo: { settings: pick((S.appsSvc.data || {}).settings || {}, ["isOfficeStoreEnabled", "isAppAndServicesTrialEnabled"]) } })] } });
  add({ k: "forms-phishing", cis: "1.3.5", lvl: 1, area: "m365", reach: "fix", t: "Microsoft Forms scans for internal phishing", tgt: "on",
    src: ["forms"], judge(S) { const n = need(S, "forms"); if (n) return n; const s = S.forms.data || {}; const v = s.isInOrgFormsPhishingScanEnabled;
      return { st: v === true ? "pass" : "fail", now: v === true ? "scan on" : v === false ? "scan off" : "setting not returned" }; },
    fix: { scopes: [W.forms], role: "Global Administrator",
      impact: "Forms that ask for passwords or similar are detected and blocked for review. Normal forms are not affected; a false positive can be released by an admin.",
      back: "PATCH isInOrgFormsPhishingScanEnabled back to false.",
      ops: (S) => [op({ method: "PATCH", url: `${BETA}/admin/forms/settings`, source: "forms", seed: () => ({}), mutate: (b) => { b.isInOrgFormsPhishingScanEnabled = true; }, undo: { isInOrgFormsPhishingScanEnabled: (S.forms.data || {}).isInOrgFormsPhishingScanEnabled } })] } });
  add({ k: "third-party-storage", cis: "1.3.7", lvl: 2, area: "m365", reach: "fix", t: "Microsoft 365 on the web cannot open third-party storage", tgt: "service principal present, disabled",
    src: ["thirdParty"], judge(S) { const n = need(S, "thirdParty"); if (n) return n; const sp = S.thirdParty.data[0];
      return { st: sp && sp.accountEnabled === false ? "pass" : "fail", now: !sp ? "service principal missing (users CAN open third-party storage)" : sp.accountEnabled ? "service principal enabled" : "disabled" }; },
    fix: { scopes: [W.app], role: "Cloud Application Administrator",
      impact: "Users can no longer open Dropbox, Box or Google Drive files inside Microsoft 365 on the web. Files in OneDrive and SharePoint are not affected. The setting IS this service principal: ENCA creates it when it is missing, then disables it.",
      back: "PATCH accountEnabled true. A service principal ENCA created is left in place (enabled), which is the same as before.",
      ops: (S) => { const sp = S.thirdParty.data[0];
        return sp ? [op({ method: "PATCH", url: `${V1}/servicePrincipals/${sp.id}`, source: "thirdParty", seed: () => ({}), mutate: (b) => { b.accountEnabled = false; }, undo: { accountEnabled: sp.accountEnabled } })]
          : [op({ method: "POST", url: `${V1}/servicePrincipals`, source: "thirdParty", create: true, then: { method: "PATCH", body: { accountEnabled: false } }, undoThen: { method: "PATCH", body: { accountEnabled: true } }, seed: () => ({ appId: THIRD_PARTY_APP }), mutate: () => {}, undo: null })]; } } });

  // ===== Devices (Intune + Entra) ========================================
  add({ k: "intune-secure-default", cis: "4.1", lvl: 1, area: "devices", reach: "fix", t: "Devices with no compliance policy are marked not compliant", tgt: "Not compliant",
    src: ["intune"], judge(S) { const n = need(S, "intune"); if (n) return n; const v = (S.intune.data || {}).secureByDefault;
      return { st: v === true ? "pass" : "fail", now: v === true ? "not compliant" : "compliant (the default)" }; },
    fix: { scopes: [W.intune, W.intuneCfg], role: "Intune Administrator",
      impact: "An enrolled device that no compliance policy targets becomes NOT compliant. With a 'require compliant device' Conditional Access policy those devices are blocked until a policy covers them — so check that every platform you enrol has a compliance policy assigned to all its devices first.",
      back: "PATCH secureByDefault back to false (the whole settings object is written back from the snapshot).",
      // 33010 (Mihai on devcf: 400 "DeviceComplianceCheckinThresholdDays must be
      // between 1 and 120"): settings is a complex property, so a PATCH REPLACES it
      // whole — a property left out comes back as 0. Send every property the read
      // returned, and the check-in threshold always inside 1–120 (Intune's 30 when
      // the read had none).
      ops: (S) => [op({ method: "PATCH", url: `${BETA}/deviceManagement`, source: "intune", seed: () => ({ settings: intuneSettings(S.intune.data) }), mutate: (b) => { b.settings.secureByDefault = true; }, undo: { settings: intuneSettings(S.intune.data) } })] } });
  function intuneSettings(d) {
    const b = {};
    for (const [k, v] of Object.entries(d || {})) if (!/^@odata/.test(k)) b[k] = clone(v);
    const t = Number(b.deviceComplianceCheckinThresholdDays);
    b.deviceComplianceCheckinThresholdDays = t >= 1 && t <= 120 ? t : 30;
    if (typeof b.isScheduledActionEnabled !== "boolean") b.isScheduledActionEnabled = true;
    return b;
  }
  const ENROLL_P = [["windowsRestriction", "Windows"], ["iosRestriction", "iOS"], ["androidRestriction", "Android"], ["androidForWorkRestriction", "Android Enterprise"], ["macOSRestriction", "macOS"]];
  const defaultRestriction = (S) => (S.enroll.data || []).find((c) => /DefaultPlatformRestrictions/i.test(c.id || "") && (c.priority === 0 || c.priority == null) && /platformRestrictionsConfiguration/i.test(c["@odata.type"] || ""));
  add({ k: "intune-byod-block", cis: "4.2", lvl: 1, area: "devices", reach: "fix", t: "Personal devices cannot enrol by default", tgt: "personal blocked on every platform",
    src: ["enroll"], judge(S) { const n = need(S, "enroll"); if (n) return n; const c = defaultRestriction(S);
      if (!c) return { st: "notread", now: "the default platform restriction was not found (this tenant may use per-platform restrictions — check Intune)" };
      const open = ENROLL_P.filter(([k]) => { const r = c[k] || {}; return !(r.platformBlocked || r.personalDeviceEnrollmentBlocked); }).map(([, l]) => l);
      return { st: open.length ? "fail" : "pass", now: open.length ? `personal allowed: ${open.join(", ")}` : "personal blocked (or the platform blocked) everywhere" }; },
    fix: { scopes: [W.intune], role: "Intune Administrator",
      impact: "New personally-owned devices can no longer enrol in Intune on the platforms listed. Devices already enrolled stay. Corporate enrolment (Autopilot, Apple Business Manager, Android Enterprise corporate-owned) is not affected. BYOD users then use app protection (MAM) instead — the CA215 mobile decision.",
      back: "PATCH personalDeviceEnrollmentBlocked back per platform from the snapshot.",
      ops: (S) => { const c = defaultRestriction(S);
        return [op({ method: "PATCH", url: `${BETA}/deviceManagement/deviceEnrollmentConfigurations/${c.id}`, source: "enroll", seed: () => { const b = { "@odata.type": c["@odata.type"] }; for (const [k] of ENROLL_P) if (c[k]) b[k] = clone(c[k]); return b; }, mutate: (b) => { for (const [k] of ENROLL_P) if (b[k] && !b[k].platformBlocked) b[k].personalDeviceEnrollmentBlocked = true; }, undo: (() => { const b = { "@odata.type": c["@odata.type"] }; for (const [k] of ENROLL_P) if (c[k]) b[k] = clone(c[k]); return b; })() })]; } } });
  add({ k: "dev-join", cis: "5.1.4.1", lvl: 2, area: "devices", reach: "fix", t: "Only selected users can Entra-join devices", tgt: "Selected (a group) or None",
    src: ["devReg"], judge(S) { const n = need(S, "devReg"); if (n) return n; const m = ((S.devReg.data || {}).azureADJoin || {}).allowedToJoin;
      return { st: restrictedMembership(m) ? "pass" : "fail", now: /enumerated/.test(memType(m)) ? `Selected (${((m.groups || []).length)} group${(m.groups || []).length === 1 ? "" : "s"}, ${(m.users || []).length} user${(m.users || []).length === 1 ? "" : "s"})` : /nodevice/.test(memType(m)) ? "None" : "All" }; },
    fix: { scopes: [W.dev], role: "Cloud Device Administrator", input: { kind: "group", label: "Who may Entra-join devices (a group — Autopilot devices are joined by their user)" },
      impact: "Only members of the group you pick can Entra-join a device — Autopilot and bulk enrolment included. Anyone else gets an error at the join. Devices already joined are not affected. Pick the group BEFORE writing; an empty Selected list blocks every join, so ENCA refuses it.",
      back: "PUT the whole device registration policy back from the snapshot (All).",
      ops: (S, input) => [devRegOp(S, (b) => { b.azureADJoin = b.azureADJoin || {}; b.azureADJoin.allowedToJoin = { "@odata.type": "#microsoft.graph.enumeratedDeviceRegistrationMembership", users: [], groups: [input.group.id] }; })],
      need: (input) => (input && input.group ? null : "pick the group that may join devices") } });
  add({ k: "dev-quota", cis: "5.1.4.2", lvl: 1, area: "devices", reach: "fix", t: "A user can register at most 10 devices", tgt: "≤ 10",
    src: ["devReg"], judge(S) { const n = need(S, "devReg"); if (n) return n; const q = (S.devReg.data || {}).userDeviceQuota;
      return { st: q <= 10 ? "pass" : "fail", now: String(q) }; },
    fix: { scopes: [W.dev], role: "Cloud Device Administrator", input: { kind: "number", label: "Devices per user", def: 10, min: 1, max: 10 },
      impact: "A user who already has more devices than the new limit keeps them, but cannot register another until stale ones are removed — 🧹 Entra device cleanup (T59) finds those. Administrators are not limited by the quota.",
      back: "PUT the whole policy back from the snapshot.",
      ops: (S, input) => [devRegOp(S, (b) => { b.userDeviceQuota = Math.max(1, Math.min(10, Number((input && input.number) || 10))); })] } });
  add({ k: "dev-ga-localadmin", cis: "5.1.4.3", lvl: 1, area: "devices", reach: "fix", t: "Global Administrators are not made local admins at Entra join", tgt: "No",
    src: ["devReg"], judge(S) { const n = need(S, "devReg"); if (n) return n; const v = (((S.devReg.data || {}).azureADJoin || {}).localAdmins || {}).enableGlobalAdmins;
      return { st: v === false ? "pass" : "fail", now: v === false ? "No" : "Yes" }; },
    fix: { scopes: [W.dev], role: "Cloud Device Administrator",
      impact: "Devices joined from now on stop adding the Global Administrator role to the local Administrators group; devices already joined keep what they have. Local admin rights come from Entra LAPS and the Microsoft Entra Joined Device Local Administrator role instead.",
      back: "PUT the whole device registration policy back from the snapshot. It is a whole-object write: a body without userDeviceQuota would reset it to 0 and block every join, which is why ENCA always sends the full policy.",
      ops: (S) => [devRegOp(S, (b) => { b.azureADJoin = b.azureADJoin || {}; b.azureADJoin.localAdmins = b.azureADJoin.localAdmins || {}; b.azureADJoin.localAdmins.enableGlobalAdmins = false; })] } });
  add({ k: "dev-user-localadmin", cis: "5.1.4.4", lvl: 1, area: "devices", reach: "fix", t: "The registering user is not made local admin at Entra join", tgt: "None (or Selected)",
    src: ["devReg"], judge(S) { const n = need(S, "devReg"); if (n) return n; const m = ((((S.devReg.data || {}).azureADJoin || {}).localAdmins) || {}).registeringUsers;
      return { st: restrictedMembership(m) ? "pass" : "fail", now: /enumerated/.test(memType(m)) ? "Selected" : /nodevice/.test(memType(m)) ? "None" : "All" }; },
    fix: { scopes: [W.dev], role: "Cloud Device Administrator",
      impact: "Users who join a device from now on are standard users on it, not administrators. Installing software then goes through Intune (Company Portal) or Endpoint Privilege Management. Devices already joined keep their current local admins. Autopilot profiles have their own 'user account type' setting and are not changed.",
      back: "PUT the whole policy back from the snapshot (All).",
      ops: (S) => [devRegOp(S, (b) => { b.azureADJoin = b.azureADJoin || {}; b.azureADJoin.localAdmins = b.azureADJoin.localAdmins || {}; b.azureADJoin.localAdmins.registeringUsers = { "@odata.type": "#microsoft.graph.noDeviceRegistrationMembership" }; })] } });
  add({ k: "dev-laps", cis: "5.1.4.5", lvl: 1, area: "devices", reach: "fix", t: "Entra LAPS is enabled", tgt: "Yes",
    src: ["devReg"], judge(S) { const n = need(S, "devReg"); if (n) return n; const v = ((S.devReg.data || {}).localAdminPassword || {}).isEnabled;
      return { st: v === true ? "pass" : "fail", now: v === true ? "Yes" : "No" }; },
    fix: { scopes: [W.dev], role: "Cloud Device Administrator",
      impact: "Devices may now back up a rotating local administrator password to Entra. Nothing happens on a device until an Intune LAPS policy targets it; then the built-in admin's password rotates and is readable only by authorised admins.",
      back: "PUT the whole policy back from the snapshot.",
      ops: (S) => [devRegOp(S, (b) => { b.localAdminPassword = Object.assign({}, b.localAdminPassword, { isEnabled: true }); })] } });
  add({ k: "dev-bitlocker-read", cis: "5.1.4.6", lvl: 2, area: "devices", reach: "fix", t: "Users cannot read the BitLocker keys of their own devices", tgt: "restricted",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = dur8(S).allowedToReadBitlockerKeysForOwnedDevice;
      return { st: v === false ? "pass" : "fail", now: v === false ? "restricted" : "users can read their own keys" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "A user locked out by BitLocker recovery can no longer look the key up themselves in My Account / the Company Portal — the service desk (Helpdesk or Cloud Device Administrator) reads it for them. Plan the service-desk route first.",
      back: "PATCH allowedToReadBitlockerKeysForOwnedDevice back to true.",
      ops: (S) => [authzOp(S, "allowedToReadBitlockerKeysForOwnedDevice", false)] } });

  // ===== Entra ID — user and group settings ===============================
  add({ k: "ent-app-reg", cis: "5.1.2.2", lvl: 1, area: "entra", reach: "fix", t: "Users cannot register applications", tgt: "No",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = dur8(S).allowedToCreateApps; return { st: v === false ? "pass" : "fail", now: v === false ? "No" : "Yes — any user" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "Non-admins can no longer create app registrations in the portal, the CLI or Visual Studio. Developers get the Application Developer role, or an admin creates the app for them. Existing apps and their owners are not affected.",
      back: "PATCH allowedToCreateApps back to true.", ops: (S) => [authzOp(S, "allowedToCreateApps", false)] } });
  add({ k: "ent-tenant-create", cis: "5.1.2.3", lvl: 1, area: "entra", reach: "fix", t: "Non-admins cannot create tenants", tgt: "Yes, restricted",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = dur8(S).allowedToCreateTenants; return { st: v === false ? "pass" : "fail", now: v === false ? "restricted" : "any user can create a tenant" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "Users can no longer create new Entra tenants (which they would own outside your control). Tenant Creator role holders and admins still can.",
      back: "PATCH allowedToCreateTenants back to true.", ops: (S) => [authzOp(S, "allowedToCreateTenants", false)] } });
  add({ k: "ent-secgroup-create", cis: "5.1.3.1", lvl: 1, area: "entra", reach: "fix", t: "Users cannot create security groups", tgt: "No",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = dur8(S).allowedToCreateSecurityGroups; return { st: v === false ? "pass" : "fail", now: v === false ? "No" : "Yes" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "Only admins (Groups Administrator and above) can create security groups. Users who build their own groups for sharing ask IT. Groups that exist stay.",
      back: "PATCH allowedToCreateSecurityGroups back to true.", ops: (S) => [authzOp(S, "allowedToCreateSecurityGroups", false)] } });
  add({ k: "ent-m365group-create", cis: "5.1.3.4", lvl: 2, area: "entra", reach: "fix", t: "Users cannot create Microsoft 365 groups (and Teams) except an allowed group", tgt: "No",
    src: ["groupSettings"], judge(S) { const n = need(S, "groupSettings"); if (n) return n; const o = settingsObj(S, TPL.unified); const v = settingVal(o, "EnableGroupCreation", null);
      return { st: v != null && lc(v) === "false" ? "pass" : "fail", now: !o ? "setting absent — the default lets every user create groups and Teams" : `EnableGroupCreation ${v}` }; },
    fix: { scopes: [W.dir], role: "Groups Administrator", input: { kind: "group", label: "Who may still create groups and Teams (optional — a group)", optional: true },
      impact: "Only admins and members of the group you pick can create Microsoft 365 groups — which means new Teams, Planner plans and SharePoint team sites too. Everyone else asks. Existing groups and Teams stay.",
      back: "PATCH the settings values back from the snapshot, or delete the settings object if ENCA created it.",
      ops: (S, input) => { const o = settingsObj(S, TPL.unified);
        const set = (b) => { const put = (name, value) => { const v = b.values.find((x) => lc(x.name) === lc(name)); if (v) v.value = value; else b.values.push({ name, value }); }; put("EnableGroupCreation", "false"); if (input && input.group) put("GroupCreationAllowedGroupId", input.group.id); };
        return [o ? op({ method: "PATCH", url: `${V1}/groupSettings/${o.id}`, source: "groupSettings", seed: () => ({ values: clone(o.values || []) }), mutate: set, undo: { values: clone(o.values || []) } })
          : op({ method: "POST", url: `${V1}/groupSettings`, key: `POST ${V1}/groupSettings ${TPL.unified}`, source: "groupSettings", create: true, seed: () => ({ templateId: TPL.unified, values: [] }), mutate: set, undo: null })]; } } });
  add({ k: "ent-admin-center", cis: "5.1.2.4", lvl: 1, area: "entra", reach: "attest", t: "Non-admins cannot open the Entra admin center", tgt: "Yes", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings", go: "Entra admin center → Users → User settings → Restrict access to Microsoft Entra admin center = Yes. No Graph property exists." });
  add({ k: "ent-kmsi", cis: "5.1.2.5", lvl: 2, area: "entra", reach: "attest", t: "The 'Stay signed in?' prompt is hidden", tgt: "No", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings", go: "Entra admin center → Users → User settings → Show keep user signed in = No. Graph's sign-in page branding has no property for it." });
  add({ k: "ent-linkedin", cis: "5.1.2.6", lvl: 2, area: "entra", reach: "attest", t: "LinkedIn account connections are off", tgt: "No", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings", go: "Entra admin center → Users → User settings → LinkedIn account connections = No." });
  add({ k: "ent-mygroups", cis: "5.1.3.2", lvl: 2, area: "entra", reach: "attest", t: "Users cannot use group features in My Groups", tgt: "Yes, restricted", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupsManagementMenuBlade/~/General", go: "Entra admin center → Groups → General → Restrict user ability to access groups features in My Groups = Yes." });
  add({ k: "ent-mygroups-owners", cis: "5.1.3.3", lvl: 1, area: "entra", reach: "attest", t: "Owners cannot manage membership requests in My Groups", tgt: "No", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupsManagementMenuBlade/~/General", go: "Entra admin center → Groups → General → Owners can manage group membership requests in My Groups = No." });
  add({ k: "ent-phs", cis: "5.1.8.1", lvl: 1, area: "entra", reach: "check", t: "Password hash sync is on (hybrid tenants)", tgt: "on",
    src: ["org", "sync"], judge(S) { const n = need(S, "org"); if (n) return n; if (!hybrid(S)) return { st: "na", now: "cloud-only tenant" }; const m = need(S, "sync"); if (m) return m;
      const v = ((S.sync.data || {}).features || {}).passwordSyncEnabled; return { st: v === true ? "pass" : "fail", now: v === true ? "on" : "off" }; },
    go: "Turned on in Entra Connect (Sync) or Cloud Sync on the server — not from Graph." });

  // ===== Apps & consent ===================================================
  add({ k: "app-user-consent", cis: "5.1.5.1", lvl: 2, area: "apps", reach: "fix", t: "Users cannot consent to apps themselves", tgt: "Do not allow user consent",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const a = (dur8(S).permissionGrantPoliciesAssigned || []).map(lc); const bad = a.filter((x) => USER_CONSENT_BAD.includes(x));
      return { st: bad.length ? "fail" : "pass", now: bad.length ? bad.map((x) => x.replace("managepermissiongrantsforself.", "")).join(", ") : "no user consent policy" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "Users can no longer consent to apps on their own behalf; an app that needs consent shows 'Need admin approval' and — with the admin consent workflow (the next row) — lets them send a request. Grants users already gave are kept; 🔑 App access review (T60) lists and revokes them. Fix both rows together.",
      back: "PATCH permissionGrantPoliciesAssigned back to the snapshot array.",
      ops: (S) => [op({ method: "PATCH", url: `${V1}/policies/authorizationPolicy`, source: "authz", seed: () => ({ defaultUserRolePermissions: {} }), mutate: (b) => { b.defaultUserRolePermissions.permissionGrantPoliciesAssigned = (dur8(S).permissionGrantPoliciesAssigned || []).filter((x) => !USER_CONSENT_BAD.includes(lc(x))); }, undo: { defaultUserRolePermissions: { permissionGrantPoliciesAssigned: clone(dur8(S).permissionGrantPoliciesAssigned || []) } } })] } });
  add({ k: "app-consent-workflow", cis: "5.1.5.2", lvl: 1, area: "apps", reach: "fix", t: "Users can request admin consent (the workflow is on)", tgt: "on, with reviewers",
    src: ["acrp"], judge(S) { const n = need(S, "acrp"); if (n) return n; const a = S.acrp.data || {};
      return { st: a.isEnabled ? "pass" : "fail", now: a.isEnabled ? `on · ${(a.reviewers || []).length} reviewer rule${(a.reviewers || []).length === 1 ? "" : "s"}` : "off" }; },
    fix: { scopes: [W.acrp], role: "Cloud Application Administrator", input: { kind: "group", label: "Reviewers (a group — its members get the requests)" },
      impact: "A user who meets an app that needs consent can send a request with a reason. The group's members get an e-mail and approve or deny in Entra; requests expire after 14 days. Nothing changes for apps already consented.",
      back: "PUT isEnabled false with the previous reviewers.",
      ops: (S, input) => [op({ method: "PUT", url: `${V1}/policies/adminConsentRequestPolicy`, source: "acrp", whole: true, seed: () => ({ isEnabled: true, notifyReviewers: true, remindersEnabled: true, requestDurationInDays: 14, reviewers: [{ query: `/groups/${input.group.id}/transitiveMembers/microsoft.graph.user`, queryType: "MicrosoftGraph" }] }), mutate: () => {}, undo: pick(S.acrp.data || {}, ["isEnabled", "notifyReviewers", "remindersEnabled", "requestDurationInDays", "reviewers"]) })],
      need: (input) => (input && input.group ? null : "pick the reviewers' group") } });
  const appRow = (k, cis, lvl, t, tgt, kind, type, maxDays, impact) => add({ k, cis, lvl, area: "apps", reach: "fix", t, tgt, src: ["appMgmt"],
    judge(S) { const n = need(S, "appMgmt"); if (n) return n; const d = S.appMgmt.data || {};
      const a = appRestr(S, "applicationRestrictions", kind, type), s = appRestr(S, "servicePrincipalRestrictions", kind, type);
      const okA = d.isEnabled && restrOk(a, maxDays), okS = d.isEnabled && restrOk(s, maxDays);
      return { st: okA && okS ? "pass" : okA || okS ? "part" : "fail", now: !d.isEnabled ? "the default app management policy is off" : `applications ${okA ? "✓" : a ? `${a.state || "enabled"}${a.maxLifetime ? " " + a.maxLifetime : ""} (not yet in force)` : "not restricted"} · service principals ${okS ? "✓" : s ? "not in force" : "not restricted"}` }; },
    fix: { scopes: [W.appcfg], role: "Cloud Application Administrator or Application Administrator",
      impact: `${impact} The restriction applies to apps created from now on (restrictForAppsCreatedAfterDateTime = today), so existing apps keep their credentials until they are rotated. Some restriction types need Microsoft Entra Workload ID Premium; if the tenant lacks it Graph refuses the write and the ledger shows Graph's reason.`,
      back: "PATCH the default app management policy back from the snapshot.",
      ops: (S) => [appMgmtOp(S, ["applicationRestrictions", "servicePrincipalRestrictions"], kind, { restrictionType: type, state: "enabled", maxLifetime: maxDays ? `P${maxDays}D` : null, restrictForAppsCreatedAfterDateTime: new Date().toISOString().slice(0, 10) + "T00:00:00Z" })] } });
  appRow("app-no-secrets", "5.1.5.3", 2, "New apps cannot get client secrets (certificates instead)", "blocked", "passwordCredentials", "passwordAddition", null, "New apps can no longer be given a client secret — certificates or federated credentials only.");
  appRow("app-secret-life", "5.1.5.4", 1, "App secrets live 180 days at most", "≤ 180 days", "passwordCredentials", "passwordLifetime", 180, "A new client secret can be valid for 180 days at most.");
  appRow("app-secret-custom", "5.1.5.5", 1, "App secrets are generated by Entra, never typed in", "blocked", "passwordCredentials", "customPasswordAddition", null, "A secret can no longer be supplied by the person — Entra generates it.");
  appRow("app-cert-life", "5.1.5.6", 1, "App certificates live 180 days at most", "≤ 180 days", "keyCredentials", "asymmetricKeyLifetime", 180, "A new certificate credential can be valid for 180 days at most.");

  // ===== Guests ===========================================================
  add({ k: "guest-domains", cis: "5.1.6.1", lvl: 2, area: "guests", reach: "check", t: "Guest invitations go only to allowed domains", tgt: "allow list",
    src: ["b2b"], judge(S) { const n = need(S, "b2b"); if (n) return n; const p = (S.b2b.data || []).find((x) => x.type === "B2BManagementPolicy");
      if (!p) return { st: "fail", now: "no invitation domain policy — invitations go anywhere" };
      let d = null; try { d = JSON.parse((p.definition || [])[0] || "{}").B2BManagementPolicy?.InvitationsAllowedAndBlockedDomainsPolicy || null; } catch { d = null; }
      if (!d) return { st: "fail", now: "invitations go anywhere" };
      if (d.BlockedDomains) return { st: "fail", now: `block list (${d.BlockedDomains.length}) — an allow list is required` };
      return d.AllowedDomains ? { st: "pass", now: `allow list: ${list(d.AllowedDomains, 4) || "no domains (nobody can be invited)"}` } : { st: "fail", now: "invitations go anywhere" }; },
    portal: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/CompanyRelationshipsMenuBlade/~/Settings", go: "Entra admin center → External Identities → External collaboration settings → Collaboration restrictions → Allow invitations only to the specified domains. (The write side of this policy is not a supported Graph API.)" });
  add({ k: "guest-access", cis: "5.1.6.2", lvl: 1, area: "guests", reach: "fix", t: "Guest users have restricted directory access", tgt: "limited or restricted",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = lc(authz(S).guestUserRoleId);
      return { st: [GUEST_ROLE.limited, GUEST_ROLE.restricted].includes(v) ? "pass" : "fail", now: v === GUEST_ROLE.restricted ? "restricted to their own objects" : v === GUEST_ROLE.limited ? "limited (the default)" : v === GUEST_ROLE.same ? "same access as members" : v || "unknown" }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator", input: { kind: "choice", label: "Guest access", def: "limited", options: [["limited", "Limited — guests see properties of non-hidden groups they are in (the Entra default)"], ["restricted", "Restricted — guests see only their own directory object (most restrictive)"]] },
      impact: "Guests can no longer enumerate users, groups and other directory objects as members do. Collaboration in Teams and SharePoint is not affected. 'Restricted' also hides the members of groups the guest is in.",
      back: "PATCH guestUserRoleId back to the snapshot value.",
      ops: (S, input) => [authzTop(S, "guestUserRoleId", (input && input.choice) === "restricted" ? GUEST_ROLE.restricted : GUEST_ROLE.limited)] } });
  add({ k: "guest-invite", cis: "5.1.6.3", lvl: 2, area: "guests", reach: "fix", t: "Only admins and Guest Inviters can invite guests", tgt: "admins + Guest Inviter",
    src: ["authz"], judge(S) { const n = need(S, "authz"); if (n) return n; const v = authz(S).allowInvitesFrom;
      return { st: ["adminsAndGuestInviters", "none"].includes(v) ? "pass" : "fail", now: { everyone: "everyone, guests too", adminsGuestInvitersAndAllMembers: "all members", adminsAndGuestInviters: "admins + Guest Inviter", none: "nobody" }[v] || String(v) }; },
    fix: { scopes: [W.authz], role: "Privileged Role Administrator",
      impact: "Members can no longer invite guests themselves (sharing a file with an outsider in SharePoint, or adding them to a Team, fails for them). Admins and people with the Guest Inviter role still can — give the role to the people who work with partners, or use access packages.",
      back: "PATCH allowInvitesFrom back to the snapshot value.",
      ops: (S) => [authzTop(S, "allowInvitesFrom", "adminsAndGuestInviters")] } });

  // ===== Authentication =====================================================
  add({ k: "auth-peruser-mfa", cis: "5.1.2.1", lvl: 1, area: "auth", reach: "fix", t: "Per-user MFA is off for everyone (Conditional Access does MFA)", tgt: "disabled for all",
    src: ["perUser"], judge(S) { const s = S.perUser; if (!s) return { st: "notread", now: "press 🔐 Read per-user MFA (one read per member, batched)", ondemand: "perUser" }; if (!s.ok) return { st: "notread", now: s.why, ondemand: "perUser" };
      const on = s.data.users.filter((u) => u.state && u.state !== "disabled");
      return { st: on.length ? "fail" : "pass", now: `${on.length} of ${s.data.users.length} users enabled or enforced${s.data.refused ? ` · ${s.data.refused} not read` : ""}`, items: on.map((u) => `${u.upn} — ${u.state}`), pickable: on.map((u) => ({ id: u.id, label: `${u.upn} (${u.state})` })) }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator", input: { kind: "pick", label: "Turn per-user MFA off for these users" },
      impact: "These users stop getting the legacy per-user MFA prompt. They are still asked for MFA by Conditional Access — make sure an MFA-for-all-users policy is On (the Conditional Access rows). Per-user MFA also ignores Conditional Access exclusions and report-only testing, which is why it should be off.",
      back: "PATCH perUserMfaState back to enabled/enforced for exactly the users in the snapshot.",
      ops: (S, input) => S.perUser.data.users.filter((u) => u.state && u.state !== "disabled" && (!input || !input.picked || input.picked.includes(u.id))).map((u) => op({ method: "PATCH", url: `${BETA}/users/${u.id}/authentication/requirements`, label: u.upn, source: "perUser", seed: () => ({}), mutate: (b) => { b.perUserMfaState = "disabled"; }, undo: { perUserMfaState: u.state } })) } });
  add({ k: "auth-fatigue", cis: "5.2.3.1", lvl: 1, area: "auth", reach: "fix", t: "Authenticator shows the app name and location in every push", tgt: "on, all users",
    src: ["amp"], judge(S) { const n = need(S, "amp"); if (n) return n; const c = amCfg(S, "MicrosoftAuthenticator"); if (!c) return { st: "fail", now: "Authenticator configuration not found" };
      const f = c.featureSettings || {}, a = f.displayAppInformationRequiredState || {}, l = f.displayLocationInformationRequiredState || {};
      const ok = lc(c.state) === "enabled" && allUsersTarget(c.includeTargets || []) && lc(a.state) === "enabled" && allUsersTarget(a.includeTarget) && lc(l.state) === "enabled" && allUsersTarget(l.includeTarget);
      return { st: ok ? "pass" : "fail", now: `method ${c.state}${allUsersTarget(c.includeTargets || []) ? " (all users)" : " (some users)"} · app name ${a.state || "default"} · location ${l.state || "default"}` }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator",
      impact: "Every Authenticator push shows which app is asking and where the sign-in comes from, so a user approving a stranger's prompt sees it is not theirs. If the Authenticator method was off it is switched on for all users. Users see two extra lines in the prompt; nothing to register.",
      back: "PATCH the Authenticator method back to the snapshot (state, targets and feature settings).",
      ops: (S) => [ampOp(S, "MicrosoftAuthenticator", "microsoftAuthenticatorAuthenticationMethodConfiguration", (b) => {
        const cur = amCfg(S, "MicrosoftAuthenticator") || {};
        b.state = "enabled";
        if (!allUsersTarget(cur.includeTargets || [])) b.includeTargets = [{ targetType: "group", id: "all_users", isRegistrationRequired: false, authenticationMode: "any" }];
        b.featureSettings = Object.assign(clone(b.featureSettings || cur.featureSettings || {}), {
          displayAppInformationRequiredState: Object.assign(clone((cur.featureSettings || {}).displayAppInformationRequiredState || {}), { state: "enabled", includeTarget: { targetType: "group", id: "all_users" } }),
          displayLocationInformationRequiredState: Object.assign(clone((cur.featureSettings || {}).displayLocationInformationRequiredState || {}), { state: "enabled", includeTarget: { targetType: "group", id: "all_users" } }),
        });
      }, true)] } });
  add({ k: "auth-companion", cis: "5.2.3.10", lvl: 1, area: "auth", reach: "fix", t: "Authenticator Lite in Outlook and other companion apps is off", tgt: "disabled",
    src: ["amp"], judge(S) { const n = need(S, "amp"); if (n) return n; const c = amCfg(S, "MicrosoftAuthenticator"); const v = (((c || {}).featureSettings || {}).companionAppAllowedState || {}).state;
      return { st: lc(v) === "disabled" ? "pass" : "fail", now: v || "default (Microsoft-managed)" }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator",
      impact: "Users can no longer approve MFA inside Outlook mobile (Authenticator Lite). Users who rely on it must install Microsoft Authenticator — check the registration report first.",
      back: "PATCH companionAppAllowedState back from the snapshot.",
      ops: (S) => [ampOp(S, "MicrosoftAuthenticator", "microsoftAuthenticatorAuthenticationMethodConfiguration", (b) => {
        const cur = amCfg(S, "MicrosoftAuthenticator") || {};
        b.featureSettings = Object.assign(clone(b.featureSettings || cur.featureSettings || {}), { companionAppAllowedState: Object.assign(clone((cur.featureSettings || {}).companionAppAllowedState || {}), { state: "disabled", includeTarget: { targetType: "group", id: "all_users" } }) });
      }, true)] } });
  const pwRow = (k, cis, lvl, t, tgt, name, test, fixVal, impact, input, hybridOnly) => add({ k, cis, lvl, area: "auth", reach: "fix", t, tgt, src: ["groupSettings"],
    judge(S) { const n = need(S, "groupSettings"); if (n) return n; if (hybridOnly && !hybrid(S)) return { st: "na", now: "cloud-only tenant" };
      const r = test(S); return { st: r[0] ? "pass" : "fail", now: r[1] + (settingsObj(S, TPL.pw) ? "" : " (defaults — no settings object yet)") }; },
    fix: { scopes: [W.dir], role: "Authentication Policy Administrator", input,
      impact, back: "PATCH the Password Rule Settings values back from the snapshot, or delete the settings object if ENCA created it.",
      ops: (S, inp) => { const o = settingsObj(S, TPL.pw);
        const set = (b) => { const put = (nm, v) => { const x = b.values.find((y) => lc(y.name) === lc(nm)); if (x) x.value = String(v); else b.values.push({ name: nm, value: String(v) }); }; for (const [nm, v] of fixVal(inp)) put(nm, v); };
        return [o ? op({ method: "PATCH", url: `${V1}/groupSettings/${o.id}`, source: "groupSettings", seed: () => ({ values: clone(o.values || []) }), mutate: set, undo: { values: clone(o.values || []) } })
          : op({ method: "POST", url: `${V1}/groupSettings`, key: `POST ${V1}/groupSettings ${TPL.pw}`, source: "groupSettings", create: true, seed: () => ({ templateId: TPL.pw, values: [] }), mutate: set, undo: null })]; },
      need: input && input.kind === "words" ? (inp) => (inp && inp.words && inp.words.length ? null : "type at least one banned word") : null } });
  pwRow("auth-banned-list", "5.2.3.2", 1, "A custom banned-password list is in use", "on, with words",
    "BannedPasswordList", (S) => { const on = yes(pwVal(S, "EnableBannedPasswordCheck")); const w = String(pwVal(S, "BannedPasswordList") || "").split(/\t/).filter(Boolean); return [on && w.length > 0, `${on ? "check on" : "check off"} · ${w.length} word${w.length === 1 ? "" : "s"}`]; },
    (inp) => [["EnableBannedPasswordCheck", "True"], ["BannedPasswordList", (inp.words || []).join("\t")]],
    "Passwords containing your company name, product names, locations and the like are refused from the next password change; existing passwords keep working until they are changed. Words are 4–16 characters, up to 1,000.",
    { kind: "words", label: "Banned words — company name, brands, places (one per line or comma-separated)" });
  pwRow("auth-onprem-protect", "5.2.3.3", 1, "Password protection is enforced on on-premises AD (hybrid)", "on, Enforce",
    "EnableBannedPasswordCheckOnPremises", (S) => { const on = yes(pwVal(S, "EnableBannedPasswordCheckOnPremises")); const m = pwVal(S, "BannedPasswordCheckOnPremisesMode"); return [on && lc(m) === "enforce", `${on ? "on" : "off"} · mode ${m}`]; },
    () => [["EnableBannedPasswordCheckOnPremises", "True"], ["BannedPasswordCheckOnPremisesMode", "Enforce"]],
    "Domain controllers running the Entra Password Protection DC agent start REFUSING weak and banned passwords (Audit only logged them). Without the agent installed nothing happens. Check the audit events on the DCs before switching.", null, true);
  pwRow("auth-lockout-threshold", "5.2.3.8", 1, "Smart lockout locks after 10 failed attempts or fewer", "≤ 10",
    "LockoutThreshold", (S) => { const v = Number(pwVal(S, "LockoutThreshold")); return [v > 0 && v <= 10, String(v)]; },
    (inp) => [["LockoutThreshold", Math.max(1, Math.min(10, Number((inp && inp.number) || 10)))]],
    "After that many failed sign-ins an account is locked for the lockout duration. Users who mistype a lot will meet it sooner.", { kind: "number", label: "Lockout threshold", def: 10, min: 1, max: 10 });
  pwRow("auth-lockout-duration", "5.2.3.9", 1, "Smart lockout lasts at least 60 seconds", "≥ 60 s",
    "LockoutDurationInSeconds", (S) => { const v = Number(pwVal(S, "LockoutDurationInSeconds")); return [v >= 60, `${v} s`]; },
    (inp) => [["LockoutDurationInSeconds", Math.max(60, Number((inp && inp.number) || 60))]],
    "A locked account waits at least this long before the next try; each further lockout lasts longer.", { kind: "number", label: "Lockout duration (seconds)", def: 60, min: 60, max: 3600 });
  add({ k: "auth-mfa-capable", cis: "5.2.3.4", lvl: 1, area: "auth", reach: "check", t: "Every member user is MFA capable", tgt: "all capable",
    src: ["regDetails"], judge(S) { const n = need(S, "regDetails"); if (n) return n; const r = S.regDetails.data || [];
      return { st: r.length ? "fail" : "pass", now: r.length ? `${r.length} member${r.length === 1 ? "" : "s"} not MFA capable${r.some((x) => x.isAdmin) ? ` (${r.filter((x) => x.isAdmin).length} admin)` : ""}` : "every member is MFA capable", items: r.map((x) => `${x.userPrincipalName}${x.isAdmin ? " (admin)" : ""}`) }; },
    go: "Registration is the user's step: a registration campaign (Authentication methods → Registration campaign) or a Temporary Access Pass, and a CA policy that requires MFA. Exclude break-glass and resource accounts by documenting them." });
  add({ k: "auth-sms-voice", cis: "5.2.3.5", lvl: 1, area: "auth", reach: "fix", t: "SMS and voice call are off as sign-in methods", tgt: "both disabled",
    src: ["amp"], judge(S) { const n = need(S, "amp"); if (n) return n; const s = amCfg(S, "Sms"), v = amCfg(S, "Voice");
      const on = [s && lc(s.state) === "enabled" ? "SMS" : "", v && lc(v.state) === "enabled" ? "voice" : ""].filter(Boolean);
      return { st: on.length ? "fail" : "pass", now: on.length ? `${on.join(" + ")} on` : "both off" }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator",
      impact: "Users whose ONLY second method is SMS or voice cannot complete MFA any more and must register Authenticator or a passkey first. 📵 SMS & voice retirement (T33) names them — run it before this. SSPR by SMS stops too.",
      back: "PATCH SMS and voice back to their snapshot state and targets.",
      ops: (S) => [amCfg(S, "Sms") && lc(amCfg(S, "Sms").state) === "enabled" ? ampOp(S, "Sms", "smsAuthenticationMethodConfiguration", (b) => { b.state = "disabled"; }) : null,
        amCfg(S, "Voice") && lc(amCfg(S, "Voice").state) === "enabled" ? ampOp(S, "Voice", "voiceAuthenticationMethodConfiguration", (b) => { b.state = "disabled"; }) : null].filter(Boolean) },
    go: "📵 SMS & voice retirement (T33) shows who would be locked out." });
  add({ k: "auth-system-preferred", cis: "5.2.3.6", lvl: 1, area: "auth", reach: "fix", t: "System-preferred MFA is on for all users", tgt: "enabled, all users",
    src: ["amp"], judge(S) { const n = need(S, "amp"); if (n) return n; const p = (S.amp.data || {}).systemCredentialPreferences || {};
      return { st: lc(p.state) === "enabled" && allUsersTarget(p.includeTargets || []) ? "pass" : "fail", now: `${p.state || "default"}${allUsersTarget(p.includeTargets || []) ? " · all users" : ""}` }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator",
      impact: "At sign-in Entra asks for the strongest method a user has registered (passkey before Authenticator before SMS) instead of the one the user last chose. Users with only one method see no change.",
      back: "PATCH systemCredentialPreferences back from the snapshot.",
      ops: (S) => [op({ method: "PATCH", url: `${BETA}/policies/authenticationMethodsPolicy`, source: "amp", seed: () => ({}), mutate: (b) => { const cur = (S.amp.data || {}).systemCredentialPreferences || {}; b.systemCredentialPreferences = { state: "enabled", includeTargets: [{ id: "all_users", targetType: "group" }], excludeTargets: clone(cur.excludeTargets || []) }; }, undo: { systemCredentialPreferences: clone((S.amp.data || {}).systemCredentialPreferences || {}) } })] } });
  add({ k: "auth-email-otp", cis: "5.2.3.7", lvl: 2, area: "auth", reach: "fix", t: "Email one-time passcode is off as a method", tgt: "disabled",
    src: ["amp"], judge(S) { const n = need(S, "amp"); if (n) return n; const e = amCfg(S, "Email"); return { st: e && lc(e.state) === "enabled" ? "fail" : "pass", now: e ? e.state : "not configured" }; },
    fix: { scopes: [W.amp], role: "Authentication Policy Administrator",
      impact: "Guests who redeem invitations with an e-mail one-time passcode can no longer sign in that way — guests whose domain has no Entra tenant or Microsoft account need another route (a Microsoft account, or Google federation). SSPR by e-mail for members stops too.",
      back: "PATCH the Email method back to enabled with its snapshot targets.",
      ops: (S) => [ampOp(S, "Email", "emailAuthenticationMethodConfiguration", (b) => { b.state = "disabled"; })] } });
  for (const [k, cis, t] of [["sspr-all", "5.2.4.1", "Self-service password reset is enabled for All"], ["sspr-two", "5.2.4.2", "Password reset needs two methods"], ["sspr-register", "5.2.4.3", "Users register for SSPR and re-confirm their methods"], ["sspr-notify-user", "5.2.4.4", "Users are told when their password is reset"], ["sspr-notify-admins", "5.2.4.5", "All admins are told when another admin's password is reset"]])
    add({ k, cis, lvl: cis === "5.2.4.2" ? 2 : 1, area: "auth", reach: "attest", t, tgt: "Yes", portal: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/PasswordResetMenuBlade/~/Properties", go: "Entra admin center → Password reset. SSPR's own settings have no Graph API — set them there and attest here." });

  // ===== Privileged access (PIM) ==========================================
  add({ k: "pim-standing", cis: "5.3.1", lvl: 2, area: "priv", reach: "check", t: "Privileged roles are activated through PIM, not standing", tgt: "eligible only (2 break-glass GA allowed)",
    src: ["privDefs", "schedInst"], judge(S) { const n = need(S, "privDefs", "schedInst"); if (n) return n;
      const priv = new Map(S.privDefs.data.map((d) => [d.id, d.displayName]));
      const inst = S.schedInst.data.filter((i) => priv.has(i.roleDefinitionId));
      const perm = inst.filter((i) => !/serviceprincipal/.test(memType(i.principal)) && lc(i.assignmentType) === "assigned");
      const permGA = perm.filter((i) => i.roleDefinitionId === ROLE.GA), other = perm.filter((i) => i.roleDefinitionId !== ROLE.GA);
      const spNoEnd = inst.filter((i) => /serviceprincipal/.test(memType(i.principal)) && !i.endDateTime);
      const bad = other.length + Math.max(0, permGA.length - 2);
      return { st: bad ? "fail" : spNoEnd.length ? "part" : "pass", now: `${perm.length} standing user/group assignment${perm.length === 1 ? "" : "s"} (${permGA.length} GA)${spNoEnd.length ? ` · ${spNoEnd.length} service principal${spNoEnd.length === 1 ? "" : "s"} without end date` : ""}`,
        items: [...other, ...permGA].map((i) => `${(i.principal || {}).displayName || i.principalId} — ${priv.get(i.roleDefinitionId)}`).concat(spNoEnd.map((i) => `${(i.principal || {}).displayName || i.principalId} (service principal) — ${priv.get(i.roleDefinitionId)}`)) }; },
    go: "02 PIM-buddy → 🎖 Roles converts standing assignments to eligible; the CloudFellows PIM framework does it for the whole tenant." });
  const reviewOk = (d, roleId) => {
    const s = d.settings || {}, rec = s.recurrence || {}, pat = lc((rec.pattern || {}).type), rng = lc((rec.range || {}).type);
    const scopeTxt = JSON.stringify(d.scope || {}) + JSON.stringify(d.instanceEnumerationScope || {});
    const inScope = roleId ? scopeTxt.includes(roleId) : /userType eq 'Guest'/i.test(scopeTxt);
    return inScope && lc(d.status) === "inprogress" && ["absolutemonthly", "weekly"].includes(pat) && rng === "noend" && (d.reviewers || []).length > 0 &&
      s.mailNotificationsEnabled === true && s.reminderNotificationsEnabled === true && s.justificationRequiredOnApproval === true && s.autoApplyDecisionsEnabled === true &&
      Number(s.instanceDurationInDays) <= 14 && (roleId ? lc(s.defaultDecision) === "none" : lc(s.defaultDecision) === "deny");
  };
  add({ k: "rev-guests", cis: "5.3.2", lvl: 1, area: "priv", reach: "check", t: "Guest access is reviewed monthly, unanswered means removed", tgt: "a monthly review in force",
    src: ["reviews"], judge(S) { const n = need(S, "reviews"); if (n) return n; const ok = S.reviews.data.filter((d) => reviewOk(d, null)); const any = S.reviews.data.filter((d) => /userType eq 'Guest'/i.test(JSON.stringify(d.scope || {})));
      return { st: ok.length ? "pass" : "fail", now: ok.length ? ok[0].displayName : any.length ? `${any.length} guest review${any.length === 1 ? "" : "s"}, none meets every setting` : "no guest access review" }; },
    portal: "https://entra.microsoft.com/#view/Microsoft_AAD_ERM/DashboardBlade/~/Controls/fromNav/Identity", go: "ID Governance → Access reviews → New: Teams + Groups, guests only, monthly, 14 days, auto-apply, if no response Remove access, require reason. Needs Entra ID P2 or ID Governance." });
  add({ k: "rev-roles", cis: "5.3.3", lvl: 1, area: "priv", reach: "check", t: "The six most privileged roles are reviewed monthly", tgt: "a review per role",
    src: ["reviews"], judge(S) { const n = need(S, "reviews"); if (n) return n; const roles = [ROLE.GA, ROLE.PRA, ROLE.EXA, ROLE.SPA, ROLE.TEAMS, ROLE.SEC];
      const miss = roles.filter((r) => !S.reviews.data.some((d) => reviewOk(d, r)));
      return { st: miss.length ? "fail" : "pass", now: miss.length ? `${roles.length - miss.length} of 6 reviewed · missing ${list(miss.map((r) => ROLE_NAME[r]), 2)}` : "all six reviewed", items: miss.map((r) => ROLE_NAME[r]) }; },
    portal: "https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/aadmigratedroles/resourceId//resourceType/tenant/provider/aadroles", go: "PIM → Microsoft Entra roles → Access reviews: eligible and active, everyone, monthly, 14 days, auto-apply, if no response No change. Needs Entra ID P2." });
  const pimRow = (k, cis, key, roleName) => add({ k, cis, lvl: 1, area: "priv", reach: "fix", t: `Activating ${roleName} needs approval`, tgt: "approval + approvers",
    src: [key], judge(S) { const n = need(S, key); if (n) return n; const d = S[key].data; if (!d) return { st: "notread", now: "no PIM policy assignment found for the role" };
      const s = (d.rule || {}).setting || {}; const ap = ((s.approvalStages || [])[0] || {}).primaryApprovers || [];
      return { st: s.isApprovalRequired && ap.length ? "pass" : "fail", now: s.isApprovalRequired ? `approval on · ${ap.length} approver${ap.length === 1 ? "" : "s"}` : "no approval" }; },
    fix: { scopes: [W.pim], role: "Privileged Role Administrator", input: { kind: "group", label: "Approvers (a group)" },
      impact: `Activating ${roleName} in PIM waits for an approver from the group you pick (single stage, one day). Break-glass accounts hold the role permanently and do not activate, so they are not affected. On a tenant that follows the CloudFellows PIM framework this is the same rule 02 PIM-buddy deploys — compare there first.`,
      back: "PATCH the approval rule back from the snapshot.",
      ops: (S, input) => { const d = S[key].data, rule = d.rule || {};
        return [op({ method: "PATCH", url: `${V1}/policies/roleManagementPolicies/${d.policyId}/rules/Approval_EndUser_Assignment`, source: key, seed: () => ({ "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule", id: "Approval_EndUser_Assignment", target: clone(rule.target || {}) }),
          mutate: (b) => { b.setting = { isApprovalRequired: true, isApprovalRequiredForExtension: false, isRequestorJustificationRequired: true, approvalMode: "SingleStage", approvalStages: [{ approvalStageTimeOutInDays: 1, isApproverJustificationRequired: true, escalationTimeInMinutes: 0, isEscalationEnabled: false, primaryApprovers: [{ "@odata.type": "#microsoft.graph.groupMembers", groupId: input.group.id }], escalationApprovers: [] }] }; },
          undo: { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule", id: "Approval_EndUser_Assignment", target: clone(rule.target || {}), setting: clone(rule.setting || {}) } })]; },
      need: (input) => (input && input.group ? null : "pick the approvers' group") } });
  pimRow("pim-ga-approval", "5.3.4", "pimGA", "Global Administrator");
  pimRow("pim-pra-approval", "5.3.5", "pimPRA", "Privileged Role Administrator");

  // ===== SharePoint (Graph) ===============================================
  add({ k: "spo-legacy-auth", cis: "7.2.1", lvl: 1, area: "spo", reach: "fix", t: "SharePoint refuses apps without modern authentication", tgt: "blocked",
    src: ["spo"], judge(S) { const n = need(S, "spo"); if (n) return n; const v = (S.spo.data || {}).isLegacyAuthProtocolsEnabled; return { st: v === false ? "pass" : "fail", now: v === false ? "blocked" : "allowed" }; },
    fix: { scopes: [W.spo], role: "SharePoint Administrator",
      impact: "Old Office versions (2010 and earlier), and tools that sign in to SharePoint with a plain password, stop connecting. Current Office, OneDrive sync and browsers are not affected.",
      back: "PATCH isLegacyAuthProtocolsEnabled back to true.", ops: (S) => [spoOp(S, { isLegacyAuthProtocolsEnabled: false })] } });
  add({ k: "spo-sharing", cis: "7.2.3", lvl: 1, area: "spo", reach: "fix", t: "SharePoint shares with new and existing guests at most (no Anyone links)", tgt: "new + existing guests, or less",
    src: ["spo"], judge(S) { const n = need(S, "spo"); if (n) return n; const v = (S.spo.data || {}).sharingCapability;
      return { st: ["externalUserSharingOnly", "existingExternalUserSharingOnly", "disabled"].includes(v) ? "pass" : "fail", now: { externalUserAndGuestSharing: "Anyone", externalUserSharingOnly: "new and existing guests", existingExternalUserSharingOnly: "existing guests only", disabled: "only people in the organisation" }[v] || String(v) }; },
    fix: { scopes: [W.spo], role: "SharePoint Administrator", input: { kind: "choice", label: "External sharing", def: "externalUserSharingOnly", options: [["externalUserSharingOnly", "New and existing guests (sign-in or code)"], ["existingExternalUserSharingOnly", "Existing guests only"], ["disabled", "Only people in the organisation"]] },
      impact: "'Anyone' links stop working — links that exist stop opening, new ones cannot be made — and people who used them must sign in as a guest. Sites set more openly than the tenant drop to the new level. Sharing with named guests keeps working (unless you pick a stricter level).",
      back: "PATCH sharingCapability back to the snapshot value. Anyone links that existed before are NOT restored.",
      ops: (S, input) => [spoOp(S, () => ({ sharingCapability: (input && input.choice) || "externalUserSharingOnly" }))] } });
  add({ k: "spo-reshare", cis: "7.2.5", lvl: 2, area: "spo", reach: "fix", t: "Guests cannot reshare what they don't own", tgt: "not allowed",
    src: ["spo"], judge(S) { const n = need(S, "spo"); if (n) return n; const v = (S.spo.data || {}).isResharingByExternalUsersEnabled; return { st: v === false ? "pass" : "fail", now: v === false ? "not allowed" : "allowed" }; },
    fix: { scopes: [W.spo], role: "SharePoint Administrator",
      impact: "A guest who was given access can no longer pass it on to other people. They ask the owner instead.",
      back: "PATCH isResharingByExternalUsersEnabled back to true.", ops: (S) => [spoOp(S, { isResharingByExternalUsersEnabled: false })] } });
  add({ k: "spo-domains", cis: "7.2.6", lvl: 2, area: "spo", reach: "fix", t: "SharePoint shares only with allowed domains", tgt: "allow list",
    src: ["spo"], judge(S) { const n = need(S, "spo"); if (n) return n; const d = S.spo.data || {};
      if (d.sharingCapability === "disabled") return { st: "pass", now: "no external sharing at all" };
      return { st: d.sharingDomainRestrictionMode === "allowList" && (d.sharingAllowedDomainList || []).length ? "pass" : "fail", now: d.sharingDomainRestrictionMode === "allowList" ? `allow list: ${list(d.sharingAllowedDomainList || [], 4)}` : d.sharingDomainRestrictionMode === "blockList" ? "block list" : "any domain" }; },
    fix: { scopes: [W.spo], role: "SharePoint Administrator", input: { kind: "words", label: "Allowed domains (one per line) — partners, customers, your other tenants" },
      impact: "Files and sites can be shared only with people whose address is in one of these domains. Guests from other domains who already have access keep it until it is removed; new invitations to them are refused.",
      back: "PATCH the restriction mode and lists back from the snapshot.",
      ops: (S, input) => [spoOp(S, (inp) => ({ sharingDomainRestrictionMode: "allowList", sharingAllowedDomainList: ((inp || input || {}).words || []) }))],
      need: (input) => (input && input.words && input.words.length ? null : "type at least one domain") } });

  // ===== Mail DNS ========================================================
  const dnsRow = (k, cis, t, tgt, verdict, skipInitial) => add({ k, cis, lvl: 1, area: "dns", reach: "dns", t, tgt, src: ["dns"],
    judge(S) { const n = need(S, "domains"); if (n) return n; const d = S.dns; if (!d) return { st: "notread", now: "DNS not looked up yet" }; if (!d.ok) return { st: "notread", now: d.why };
      const recs = Object.values(d.data).filter((r) => !(skipInitial && r.initial) && (r.email || r.initial));
      if (!recs.length) return { st: "na", now: "no mail domains" };
      const bad = [], items = [];
      for (const r of recs) { if (r.err) { bad.push(r.name); items.push(`${r.name} — lookup failed: ${r.err}`); continue; } const [ok, why] = verdict(r); items.push(`${ok ? "✓" : "✗"} ${r.name} — ${why}`); if (!ok) bad.push(r.name); }
      return { st: bad.length ? "fail" : "pass", now: bad.length ? `${bad.length} of ${recs.length} domain${recs.length === 1 ? "" : "s"} fail: ${list(bad)}` : `${recs.length} of ${recs.length} domain${recs.length === 1 ? "" : "s"}`, items }; },
    go: "Published at your DNS host — ENCA cannot write DNS. The row says what each domain is missing." });
  dnsRow("dns-spf", "2.1.8", "Every mail domain publishes SPF ending in -all or ~all", "all domains", spfVerdict, true);
  dnsRow("dns-dkim", "2.1.9", "Every mail domain publishes its DKIM keys", "selector1 + selector2", (r) => { const s = r.dkim || {}; const ok = !!(s.selector1 && s.selector2); return [ok, ok ? "selector1 + selector2 published (whether signing is ON is visible only in Exchange — the script checks it)" : `missing ${["selector1", "selector2"].filter((x) => !s[x]).join(" + ")}`]; }, true);
  dnsRow("dns-dmarc", "2.1.10", "Every mail domain publishes DMARC with quarantine or reject", "p=quarantine/reject, rua, ruf", dmarcVerdict, false);

  // ===== Conditional Access (from 📐) =====================================
  const CA_IDS = ["5.2.2.1", "5.2.2.2", "5.2.2.3", "5.2.2.4", "5.2.2.5", "5.2.2.6", "5.2.2.7", "5.2.2.8", "5.2.2.9", "5.2.2.10", "5.2.2.11", "5.2.2.12", "5.2.2.13", "5.2.2.14", "5.2.2.15", "5.2.2.16", "5.2.2.17"];
  const CA_T = {
    "5.2.2.1": "MFA for every admin role", "5.2.2.2": "MFA for all users", "5.2.2.3": "Legacy authentication is blocked", "5.2.2.4": "Admins re-sign in regularly; their browser sessions do not persist",
    "5.2.2.5": "Admins use phishing-resistant MFA", "5.2.2.6": "High user risk is remediated", "5.2.2.7": "Risky sign-ins are challenged", "5.2.2.8": "Medium and high sign-in risk is blocked",
    "5.2.2.9": "A managed device is required to sign in", "5.2.2.10": "A managed device is required to register security info", "5.2.2.11": "Intune enrolment asks to sign in every time",
    "5.2.2.12": "Device code flow is blocked", "5.2.2.13": "Everyone re-authenticates periodically", "5.2.2.14": "Trusted named locations are defined", "5.2.2.15": "Sign-ins from unexpected countries are blocked",
    "5.2.2.16": "Token protection is enforced for session tokens", "5.2.2.17": "Authentication transfer is blocked",
  };
  const LV = { "5.2.2.5": 2, "5.2.2.8": 2, "5.2.2.14": 2, "5.2.2.15": 2, "5.2.2.16": 2 };
  for (const id of CA_IDS) add({ k: `ca-${id.split(".").pop()}`, cis: id, lvl: LV[id] || 1, area: "ca", reach: "ca", t: CA_T[id], tgt: "an enabled policy",
    src: ["caPolicies"], judge(S, ctx) { const r = ctx && ctx.ca && ctx.ca.results ? ctx.ca.results.find((x) => x.id === id) : null;
      if (!r) return need(S, "caPolicies") || { st: "notread", now: "the 📐 engine has not run" };
      const st = { pass: "pass", reportonly: "report", configured: "conf", fail: "fail", unlicensed: "nolic", error: "error", manual: "attest" }[r.status] || "error";
      return { st, now: r.policies && r.policies.length ? list(r.policies, 2) : r.near && r.near.length ? `nearest: ${r.near[0].name} — missing ${list(r.near[0].missing, 2)}` : (r.note || "no policy") }; },
    go: "🏗 Policy builder builds it from the baseline template, born report-only; 🛡 Checks → CIS 5.2.2 shows the criteria." });

  // ===== attest-only items in other areas ===================================
  add({ k: "sway-external", cis: "1.3.8", lvl: 2, area: "m365", reach: "attest", t: "Sways cannot be shared outside the organisation", tgt: "off", portal: "https://admin.microsoft.com/#/Settings/Services/:/Settings/L1/Sway", go: "Microsoft 365 admin center → Settings → Org settings → Sway → uncheck external sharing." });
  add({ k: "bg-monitored", cis: "2.2.1", lvl: 1, area: "priv", reach: "attest", t: "Break-glass sign-ins raise an alert", tgt: "alert in place", portal: "https://security.microsoft.com/", go: "An alert rule (Defender XDR custom detection, Sentinel, or Azure Monitor on the sign-in log) that fires on any break-glass sign-in. 🚦 Sign-in log shows their recent activity." });
  add({ k: "mdca-on", cis: "2.4.3", lvl: 2, area: "mdo", reach: "attest", t: "Defender for Cloud Apps is connected and configured", tgt: "connected", portal: "https://security.microsoft.com/cloudapps/settings", go: "Defender portal → Settings → Cloud Apps: Microsoft 365 app connector, Defender for Endpoint integration, file monitoring." });
  add({ k: "air-on", cis: "2.4.5", lvl: 1, area: "mdo", reach: "attest", t: "Automated investigation and response remediates", tgt: "on", portal: "https://security.microsoft.com/securitysettings/automated_investigation", go: "Defender portal → Settings → Endpoints/Email → Automated investigation and response." });
  add({ k: "teams-app-policies", cis: "8.4.1", lvl: 1, area: "teams", reach: "attest", t: "Teams app permission policies are configured", tgt: "reviewed", portal: "https://admin.teams.microsoft.com/policies/app-setup", go: "Teams admin center → Teams apps → Manage apps / Permission policies — decide which third-party and custom apps are allowed." });

  // ===== PowerShell-only (the generated read-only script) =====================
  // ps: [module, check as PowerShell returning @{ pass; now }]. The check is
  // ENCA's own implementation of the audit criterion, written to run inside
  // Invoke-EncaCheck; $null pass means "could not judge".
  const PS = (k, cis, lvl, area, t, tgt, mod, code) => add({ k, cis, lvl, area, reach: "ps", t, tgt, ps: { mod, code },
    judge(S) { const r = S.ps && S.ps.ok && S.ps.data.results[k]; if (!r) return { st: "out", now: S.ps && S.ps.ok ? "not in the loaded result" : "run the 📜 audit script and load its result" };
      return { st: r.pass === true ? "pass" : r.pass === false ? "fail" : "error", now: `${r.now || ""}${r.err ? ` — ${r.err}` : ""}`, from: S.ps.data.ranAt }; } });
  PS("exo-cal-sharing", "1.3.3", 2, "exo", "Calendars are not shared externally", "Default Sharing Policy off", "EXO", `$p = Get-SharingPolicy -Identity 'Default Sharing Policy'; @{ pass = (-not $p.Enabled); now = "Default Sharing Policy enabled: $($p.Enabled)" }`);
  PS("exo-lockbox", "1.3.6", 2, "exo", "Customer Lockbox is on", "on", "EXO", `$o = Get-OrganizationConfig; @{ pass = [bool]$o.CustomerLockBoxEnabled; now = "CustomerLockBoxEnabled: $($o.CustomerLockBoxEnabled)" }`);
  PS("exo-bookings", "1.3.9", 1, "exo", "Shared Bookings pages are limited to selected users", "off in the default OWA policy", "EXO", `$o = Get-OrganizationConfig; $w = Get-OwaMailboxPolicy -Identity OwaMailboxPolicy-Default; @{ pass = ((-not $o.BookingsEnabled) -or (-not $w.BookingsMailboxCreationEnabled)); now = "BookingsEnabled $($o.BookingsEnabled) · default policy creation $($w.BookingsMailboxCreationEnabled)" }`);
  PS("mdo-safelinks", "2.1.1", 2, "mdo", "Safe Links protects mail, Teams and Office apps", "a policy with every protection on", "EXO", `$ok = @(Get-SafeLinksPolicy | Where-Object { $_.EnableSafeLinksForEmail -and $_.EnableSafeLinksForTeams -and $_.EnableSafeLinksForOffice -and $_.TrackClicks -and (-not $_.AllowClickThrough) -and $_.ScanUrls -and $_.EnableForInternalSenders -and $_.DeliverMessageAfterScan -and (-not $_.DisableUrlRewrite) }); @{ pass = ($ok.Count -gt 0); now = $(if ($ok.Count) { "policy: $($ok[0].Identity)" } else { 'no Safe Links policy has every protection on' }) }`);
  PS("mdo-filetypes", "2.1.2", 1, "mdo", "The common attachment types filter is on", "on", "EXO", `$p = Get-MalwareFilterPolicy -Identity Default; @{ pass = ([bool]$p.EnableFileFilter -and $p.FileTypes.Count -ge 53); now = "file filter $($p.EnableFileFilter) · $($p.FileTypes.Count) types" }`);
  PS("mdo-malware-notify", "2.1.3", 1, "mdo", "Admins are told when an internal user sends malware", "on, with an address", "EXO", `$p = @(Get-MalwareFilterPolicy | Where-Object { $_.EnableInternalSenderAdminNotifications -and $_.InternalSenderAdminAddress }); @{ pass = ($p.Count -gt 0); now = $(if ($p.Count) { "policy $($p[0].Identity) → $($p[0].InternalSenderAdminAddress)" } else { 'no policy notifies admins' }) }`);
  PS("mdo-safeattach", "2.1.4", 2, "mdo", "Safe Attachments blocks malicious attachments", "Block, admin-only quarantine", "EXO", `$p = @(Get-SafeAttachmentPolicy | Where-Object { $_.Enable -and $_.Action -eq 'Block' -and $_.QuarantineTag -eq 'AdminOnlyAccessPolicy' }); @{ pass = ($p.Count -gt 0); now = $(if ($p.Count) { "policy $($p[0].Identity)" } else { 'no Safe Attachments policy blocks with admin-only quarantine' }) }`);
  PS("mdo-safeattach-spo", "2.1.5", 2, "mdo", "Safe Attachments covers SharePoint, OneDrive and Teams", "on, Safe Documents on", "EXO", `$a = Get-AtpPolicyForO365; @{ pass = ($a.EnableATPForSPOTeamsODB -and $a.EnableSafeDocs -and (-not $a.AllowSafeDocsOpen)); now = "SPO/ODB/Teams $($a.EnableATPForSPOTeamsODB) · Safe Docs $($a.EnableSafeDocs) · allow open $($a.AllowSafeDocsOpen)" }`);
  PS("mdo-outbound-notify", "2.1.6", 1, "mdo", "Outbound spam notifies administrators", "Bcc + notify on", "EXO", `$p = Get-HostedOutboundSpamFilterPolicy -Identity Default; @{ pass = ($p.BccSuspiciousOutboundMail -and $p.NotifyOutboundSpam); now = "Bcc $($p.BccSuspiciousOutboundMail) · notify $($p.NotifyOutboundSpam)" }`);
  PS("mdo-antiphish", "2.1.7", 2, "mdo", "An anti-phishing policy protects against impersonation", "a policy with every protection on", "EXO", `$ok = @(Get-AntiPhishPolicy | Where-Object { $_.Enabled -and $_.PhishThresholdLevel -ge 3 -and $_.EnableTargetedUserProtection -and $_.EnableOrganizationDomainsProtection -and $_.EnableMailboxIntelligence -and $_.EnableMailboxIntelligenceProtection -and $_.EnableSpoofIntelligence -and $_.TargetedUserProtectionAction -eq 'Quarantine' -and $_.TargetedDomainProtectionAction -eq 'Quarantine' -and $_.MailboxIntelligenceProtectionAction -eq 'Quarantine' -and $_.EnableFirstContactSafetyTips -and $_.EnableSimilarUsersSafetyTips -and $_.EnableSimilarDomainsSafetyTips -and $_.EnableUnusualCharactersSafetyTips -and $_.HonorDmarcPolicy -and $_.TargetedUsersToProtect.Count -gt 0 }); @{ pass = ($ok.Count -gt 0); now = $(if ($ok.Count) { "policy $($ok[0].Name)" } else { 'no anti-phishing policy has every protection on' }) }`);
  PS("mdo-dkim-signing", "2.1.9", 1, "dns", "DKIM signing is ON in Exchange for every custom domain", "Enabled, Valid", "EXO", `$d = @(Get-AcceptedDomain | Where-Object { -not $_.IsCoExistenceDomain -and -not $_.InitialDomain }); $c = Get-DkimSigningConfig; $bad = @($d | Where-Object { $n = $_.DomainName; -not ($c | Where-Object { $_.Name -eq $n -and $_.Enabled -and $_.Status -eq 'Valid' }) } | ForEach-Object { $_.DomainName }); @{ pass = ($bad.Count -eq 0); now = $(if ($bad.Count) { 'not signing: ' + ($bad -join ', ') } else { "$($d.Count) domain(s) signing" }) }`);
  PS("mdo-attach-ext", "2.1.11", 2, "mdo", "A comprehensive attachment-extension filter is applied", "120+ extensions, rule on", "EXO", `$r = Get-MalwareFilterRule; $ok = @(Get-MalwareFilterPolicy | Where-Object { $p = $_; $p.EnableFileFilter -and $p.FileTypes.Count -ge 120 -and ($r | Where-Object { $_.MalwareFilterPolicy -eq $p.Identity -and $_.State -eq 'Enabled' }) }); @{ pass = ($ok.Count -gt 0); now = $(if ($ok.Count) { "policy $($ok[0].Identity) · $($ok[0].FileTypes.Count) extensions" } else { 'no enabled policy filters 120+ extensions' }) }`);
  PS("mdo-ip-allow", "2.1.12", 1, "mdo", "The connection filter IP allow list is empty", "empty", "EXO", `$p = Get-HostedConnectionFilterPolicy -Identity Default; @{ pass = ($p.IPAllowList.Count -eq 0); now = "$($p.IPAllowList.Count) IP range(s) allowed" }`);
  PS("mdo-safe-list", "2.1.13", 1, "mdo", "The connection filter safe list is off", "off", "EXO", `$p = Get-HostedConnectionFilterPolicy -Identity Default; @{ pass = (-not $p.EnableSafeList); now = "safe list $($p.EnableSafeList)" }`);
  PS("mdo-allowed-domains", "2.1.14", 1, "mdo", "Inbound anti-spam policies allow no sender domains", "none", "EXO", `$b = @(Get-HostedContentFilterPolicy | Where-Object { $_.AllowedSenderDomains.Count -gt 0 }); @{ pass = ($b.Count -eq 0); now = $(if ($b.Count) { 'allowed domains in: ' + (($b | ForEach-Object { $_.Identity }) -join ', ') } else { 'no allowed sender domains' }) }`);
  PS("mdo-outbound-limits", "2.1.15", 1, "mdo", "Outbound spam limits are set and block the sender", "500/1000/1000, BlockUser", "EXO", `$p = Get-HostedOutboundSpamFilterPolicy -Identity Default; $ok = ($p.RecipientLimitExternalPerHour -gt 0 -and $p.RecipientLimitExternalPerHour -le 500 -and $p.RecipientLimitInternalPerHour -gt 0 -and $p.RecipientLimitInternalPerHour -le 1000 -and $p.RecipientLimitPerDay -gt 0 -and $p.RecipientLimitPerDay -le 1000 -and $p.ActionWhenThresholdReached -eq 'BlockUser' -and $p.NotifyOutboundSpamRecipients.Count -gt 0); @{ pass = $ok; now = "ext $($p.RecipientLimitExternalPerHour)/h · int $($p.RecipientLimitInternalPerHour)/h · day $($p.RecipientLimitPerDay) · $($p.ActionWhenThresholdReached)" }`);
  PS("mdo-priority", "2.4.1", 1, "mdo", "Priority account protection is on with alerts", "on + phish and malware alerts", "EXO+IPPS", `$t = Get-EmailTenantSettings; $a = @(Get-ProtectionAlert | Where-Object { $_.RecipientTags -match 'Priority account' -and $_.Severity -eq 'High' -and $_.NotificationEnabled -and -not $_.Disabled -and $_.NotifyUser }); $ph = @($a | Where-Object { $_.ThreatType -eq 'Phish' }); $mw = @($a | Where-Object { $_.ThreatType -eq 'Malware' }); @{ pass = ([bool]$t.EnablePriorityAccountProtection -and $ph.Count -gt 0 -and $mw.Count -gt 0); now = "protection $($t.EnablePriorityAccountProtection) · phish alerts $($ph.Count) · malware alerts $($mw.Count)" }`);
  PS("mdo-priority-strict", "2.4.2", 1, "mdo", "Priority accounts get the Strict preset", "Strict preset on, VIPs targeted", "EXO", `$x = Get-ATPProtectionPolicyRule | Where-Object { $_.Identity -eq 'Strict Preset Security Policy' }; $y = Get-EOPProtectionPolicyRule | Where-Object { $_.Identity -eq 'Strict Preset Security Policy' }; $t = { param($r) $r -and $r.State -eq 'Enabled' -and ($r.SentTo -or $r.SentToMemberOf -or $r.RecipientDomainIs) }; @{ pass = ((& $t $x) -and (& $t $y)); now = "ATP $($x.State) · EOP $($y.State)" }`);
  PS("mdo-teams-zap", "2.4.4", 1, "mdo", "Zero-hour auto purge is on for Teams", "on", "EXO", `$p = Get-TeamsProtectionPolicy; @{ pass = [bool]$p.ZapEnabled; now = "ZAP $($p.ZapEnabled)" }`);
  PS("pv-audit-log", "3.1.1", 1, "purview", "Unified audit log search is on", "on", "EXO", `$c = Get-AdminAuditLogConfig; @{ pass = [bool]$c.UnifiedAuditLogIngestionEnabled; now = "ingestion $($c.UnifiedAuditLogIngestionEnabled)" }`);
  PS("pv-dlp", "3.2.1", 1, "purview", "At least one DLP policy is enabled", "an enabled policy", "IPPS", `$p = @(Get-DlpCompliancePolicy | Where-Object { $_.Mode -eq 'Enable' -and ($_.ExchangeLocation -or $_.SharePointLocation -or $_.OneDriveLocation -or $_.TeamsLocation) }); @{ pass = ($p.Count -gt 0); now = "$($p.Count) enabled DLP polic(ies)" }`);
  PS("pv-dlp-teams", "3.2.2", 1, "purview", "DLP covers Teams chats and channels", "an enabled policy for All", "IPPS", `$p = @(Get-DlpCompliancePolicy | Where-Object { $_.Workload -match 'Teams' -and $_.Mode -eq 'Enable' -and ($_.TeamsLocation | Out-String) -match 'All' }); @{ pass = ($p.Count -gt 0); now = "$($p.Count) enabled Teams DLP polic(ies)" }`);
  PS("pv-dlp-copilot", "3.2.3", 1, "purview", "DLP covers Copilot", "an enabled policy for All", "IPPS", `$p = @(Get-DlpCompliancePolicy | Where-Object { $_.EnforcementPlanes -match 'CopilotExperiences' -and $_.Mode -eq 'Enable' }); @{ pass = ($p.Count -gt 0); now = "$($p.Count) enabled Copilot DLP polic(ies)" }`);
  PS("pv-labels", "3.3.1", 1, "purview", "Sensitivity label policies are published", "at least one", "IPPS", `$p = @(Get-LabelPolicy -WarningAction Ignore | Where-Object { $_.Type -eq 'PublishedSensitivityLabel' }); @{ pass = ($p.Count -gt 0); now = "$($p.Count) published label polic(ies)" }`);
  PS("exo-audit-org", "6.1.1", 1, "exo", "Mailbox auditing is on for the organisation", "AuditDisabled False", "EXO", `$o = Get-OrganizationConfig; @{ pass = (-not $o.AuditDisabled); now = "AuditDisabled $($o.AuditDisabled)" }`);
  PS("exo-audit-actions", "6.1.2", 1, "exo", "Mailboxes audit the recommended actions", "every mailbox", "EXO", `$A = 'ApplyRecord','Copy','Create','FolderBind','HardDelete','MailItemsAccessed','Move','MoveToDeletedItems','SendAs','SendOnBehalf','Send','SoftDelete','Update','UpdateCalendarDelegation','UpdateFolderPermissions','UpdateInboxRules'; $D = 'ApplyRecord','Create','FolderBind','HardDelete','Move','MailItemsAccessed','MoveToDeletedItems','SendAs','SendOnBehalf','SoftDelete','Update','UpdateFolderPermissions','UpdateInboxRules'; $O = 'ApplyRecord','Create','HardDelete','MailboxLogin','Move','MailItemsAccessed','MoveToDeletedItems','Send','SoftDelete','Update','UpdateCalendarDelegation','UpdateFolderPermissions','UpdateInboxRules'; $m = @(Get-EXOMailbox -PropertySets Audit,Minimum -ResultSize Unlimited -RecipientTypeDetails UserMailbox); $bad = @($m | Where-Object { $x = $_; (-not $x.AuditEnabled) -or @($A | Where-Object { $_ -notin $x.AuditAdmin }).Count -or @($D | Where-Object { $_ -notin $x.AuditDelegate }).Count -or @($O | Where-Object { $_ -notin $x.AuditOwner }).Count }); @{ pass = ($bad.Count -eq 0); now = "$($bad.Count) of $($m.Count) mailbox(es) miss actions" }`);
  PS("exo-audit-bypass", "6.1.3", 1, "exo", "No mailbox bypasses auditing", "none", "EXO", `$b = @(Get-MailboxAuditBypassAssociation -ResultSize Unlimited -WarningAction SilentlyContinue | Where-Object { $_.AuditBypassEnabled }); @{ pass = ($b.Count -eq 0); now = "$($b.Count) bypass association(s)" }`);
  PS("exo-forwarding", "6.2.1", 1, "exo", "Automatic forwarding outside the organisation is blocked", "off in every outbound policy, no redirect rules", "EXO", `$r = @(Get-TransportRule | Where-Object { $_.RedirectMessageTo }); $p = @(Get-HostedOutboundSpamFilterPolicy | Where-Object { $_.AutoForwardingMode -ne 'Off' }); @{ pass = ($r.Count -eq 0 -and $p.Count -eq 0); now = "$($r.Count) redirect rule(s) · $($p.Count) outbound polic(ies) not Off" }`);
  PS("exo-rule-whitelist", "6.2.2", 1, "exo", "No transport rule whitelists sender domains", "none", "EXO", `$r = @(Get-TransportRule | Where-Object { $_.SetSCL -eq -1 -and $_.SenderDomainIs }); @{ pass = ($r.Count -eq 0); now = "$($r.Count) rule(s) set SCL -1 for domains" }`);
  PS("exo-external-tag", "6.2.3", 1, "exo", "Mail from outside is tagged External", "on", "EXO", `$e = @(Get-ExternalInOutlook); @{ pass = (@($e | Where-Object { -not $_.Enabled }).Count -eq 0 -and $e.Count -gt 0); now = "enabled: $(($e | ForEach-Object { $_.Enabled }) -join ', ')" }`);
  PS("exo-addins", "6.3.1", 2, "exo", "Users cannot install Outlook add-ins themselves", "no add-in roles in the default policy", "EXO", `$d = Get-RoleAssignmentPolicy | Where-Object { $_.IsDefault }; $bad = @($d.AssignedRoles | Where-Object { $_ -in 'My Custom Apps','My Marketplace Apps','My ReadWriteMailbox Apps' }); @{ pass = ($bad.Count -eq 0); now = $(if ($bad.Count) { 'assigned: ' + ($bad -join ', ') } else { 'none assigned' }) }`);
  PS("exo-personal-accounts", "6.3.2", 1, "exo", "Users cannot add personal mail accounts and calendars", "off", "EXO", `$p = Get-OwaMailboxPolicy | Where-Object { $_.IsDefault }; @{ pass = ((-not $p.PersonalAccountsEnabled) -and (-not $p.PersonalAccountCalendarsEnabled)); now = "accounts $($p.PersonalAccountsEnabled) · calendars $($p.PersonalAccountCalendarsEnabled)" }`);
  PS("exo-modern-auth", "6.5.1", 1, "exo", "Exchange Online uses modern authentication", "on", "EXO", `$o = Get-OrganizationConfig; @{ pass = [bool]$o.OAuth2ClientProfileEnabled; now = "OAuth2ClientProfileEnabled $($o.OAuth2ClientProfileEnabled)" }`);
  PS("exo-mailtips", "6.5.2", 1, "exo", "MailTips are on for users", "all on", "EXO", `$o = Get-OrganizationConfig; @{ pass = ($o.MailTipsAllTipsEnabled -and $o.MailTipsExternalRecipientsTipsEnabled -and $o.MailTipsGroupMetricsEnabled); now = "all $($o.MailTipsAllTipsEnabled) · external $($o.MailTipsExternalRecipientsTipsEnabled) · group $($o.MailTipsGroupMetricsEnabled) · large audience $($o.MailTipsLargeAudienceThreshold)" }`);
  PS("exo-owa-storage", "6.5.3", 2, "exo", "Outlook on the web cannot use other storage providers", "off", "EXO", `$p = Get-OwaMailboxPolicy -Identity OwaMailboxPolicy-Default; @{ pass = (-not $p.AdditionalStorageProvidersAvailable); now = "AdditionalStorageProvidersAvailable $($p.AdditionalStorageProvidersAvailable)" }`);
  PS("exo-smtp-auth", "6.5.4", 1, "exo", "SMTP AUTH is off for the organisation", "disabled", "EXO", `$t = Get-TransportConfig; @{ pass = [bool]$t.SmtpClientAuthenticationDisabled; now = "SmtpClientAuthenticationDisabled $($t.SmtpClientAuthenticationDisabled)" }`);
  PS("exo-direct-send", "6.5.5", 2, "exo", "Direct Send is rejected", "on", "EXO", `$o = Get-OrganizationConfig; @{ pass = [bool]$o.RejectDirectSend; now = "RejectDirectSend $($o.RejectDirectSend)" }`);
  PS("spo-b2b", "7.2.2", 1, "spo", "SharePoint and OneDrive use Entra B2B for guests", "on", "SPO", `$t = Get-SPOTenant; @{ pass = [bool]$t.EnableAzureADB2BIntegration; now = "EnableAzureADB2BIntegration $($t.EnableAzureADB2BIntegration)" }`);
  PS("spo-onedrive-sharing", "7.2.4", 2, "spo", "OneDrive content is not shared externally", "Disabled", "SPO", `$t = Get-SPOTenant; @{ pass = ("$($t.OneDriveSharingCapability)" -eq 'Disabled'); now = "OneDriveSharingCapability $($t.OneDriveSharingCapability)" }`);
  PS("spo-link-type", "7.2.7", 1, "spo", "Default sharing links are specific people or internal", "Direct or Internal", "SPO", `$t = Get-SPOTenant; @{ pass = ("$($t.DefaultSharingLinkType)" -in 'Direct','Internal'); now = "DefaultSharingLinkType $($t.DefaultSharingLinkType)" }`);
  PS("spo-share-group", "7.2.8", 2, "spo", "Only a security group may share externally", "a group", "SPO", `$t = Get-SPOTenant; $ok = ("$($t.SharingCapability)" -eq 'Disabled') -or (@($t.WhoCanShareAuthenticatedGuestAllowList | Where-Object { $_ }).Count -gt 0); @{ pass = $ok; now = "SharingCapability $($t.SharingCapability) · groups allowed: $(@($t.WhoCanShareAuthenticatedGuestAllowList | Where-Object { $_ }).Count)" }`);
  PS("spo-guest-expire", "7.2.9", 1, "spo", "Guest access to sites expires after 30 days", "on, 30 days", "SPO", `$t = Get-SPOTenant; @{ pass = ($t.ExternalUserExpirationRequired -and $t.ExternalUserExpireInDays -le 30); now = "required $($t.ExternalUserExpirationRequired) · $($t.ExternalUserExpireInDays) days" }`);
  PS("spo-reauth-code", "7.2.10", 1, "spo", "Guests with a code re-verify within 15 days", "on, ≤ 15 days", "SPO", `$t = Get-SPOTenant; @{ pass = ($t.EmailAttestationRequired -and $t.EmailAttestationReAuthDays -le 15); now = "required $($t.EmailAttestationRequired) · $($t.EmailAttestationReAuthDays) days" }`);
  PS("spo-link-perm", "7.2.11", 1, "spo", "Sharing links default to View", "View", "SPO", `$t = Get-SPOTenant; @{ pass = ("$($t.DefaultLinkPermission)" -eq 'View'); now = "DefaultLinkPermission $($t.DefaultLinkPermission)" }`);
  PS("spo-infected", "7.3.1", 2, "spo", "Infected files cannot be downloaded", "blocked", "SPO", `$t = Get-SPOTenant; @{ pass = [bool]$t.DisallowInfectedFileDownload; now = "DisallowInfectedFileDownload $($t.DisallowInfectedFileDownload)" }`);
  PS("teams-cloud-storage", "8.1.1", 2, "teams", "Teams shares files only through approved cloud storage", "third-party storage off", "TEAMS", `$c = Get-CsTeamsClientConfiguration -Identity Global; $on = @('AllowDropbox','AllowBox','AllowGoogleDrive','AllowShareFile','AllowEgnyte' | Where-Object { $c.$_ }); @{ pass = ($on.Count -eq 0); now = $(if ($on.Count) { 'on: ' + ($on -join ', ') } else { 'all third-party storage off' }) }`);
  PS("teams-channel-email", "8.1.2", 1, "teams", "Users cannot e-mail into channels", "off", "TEAMS", `$c = Get-CsTeamsClientConfiguration -Identity Global; @{ pass = (-not $c.AllowEmailIntoChannel); now = "AllowEmailIntoChannel $($c.AllowEmailIntoChannel)" }`);
  PS("teams-ext-domains", "8.2.1", 2, "teams", "Teams federation is limited to allowed domains", "off, or allow list", "TEAMS", `$p = Get-CsExternalAccessPolicy -Identity Global; $f = Get-CsTenantFederationConfiguration; $ok = (-not $p.EnableFederationAccess) -or (-not $f.AllowFederatedUsers) -or ("$($f.AllowedDomains)" -notmatch 'AllowAllKnownDomains'); @{ pass = $ok; now = "policy federation $($p.EnableFederationAccess) · tenant $($f.AllowFederatedUsers) · $($f.AllowedDomains)" }`);
  PS("teams-consumer", "8.2.2", 1, "teams", "Teams cannot talk to unmanaged (consumer) accounts", "off", "TEAMS", `$p = Get-CsExternalAccessPolicy -Identity Global; $f = Get-CsTenantFederationConfiguration; @{ pass = ((-not $p.EnableTeamsConsumerAccess) -or (-not $f.AllowTeamsConsumer)); now = "policy $($p.EnableTeamsConsumerAccess) · tenant $($f.AllowTeamsConsumer)" }`);
  PS("teams-consumer-inbound", "8.2.3", 1, "teams", "Unmanaged Teams users cannot start conversations", "off", "TEAMS", `$p = Get-CsExternalAccessPolicy -Identity Global; $f = Get-CsTenantFederationConfiguration; @{ pass = ((-not $p.EnableTeamsConsumerInbound) -or (-not $f.AllowTeamsConsumerInbound)); now = "policy $($p.EnableTeamsConsumerInbound) · tenant $($f.AllowTeamsConsumerInbound)" }`);
  PS("teams-trial", "8.2.4", 1, "teams", "Teams cannot talk to trial-only tenants", "Blocked", "TEAMS", `$f = Get-CsTenantFederationConfiguration; @{ pass = ("$($f.ExternalAccessWithTrialTenants)" -eq 'Blocked'); now = "ExternalAccessWithTrialTenants $($f.ExternalAccessWithTrialTenants)" }`);
  const MP = (k, cis, lvl, t, tgt, test, prop) => PS(k, cis, lvl, "teams", t, tgt, "TEAMS", `$m = Get-CsTeamsMeetingPolicy -Identity Global; @{ pass = (${test}); now = "${prop} $($m.${prop})" }`);
  MP("teams-anon-join", "8.5.1", 2, "Anonymous users cannot join meetings", "off", "-not $m.AllowAnonymousUsersToJoinMeeting", "AllowAnonymousUsersToJoinMeeting");
  MP("teams-anon-start", "8.5.2", 1, "Anonymous and dial-in users cannot start meetings", "off", "-not $m.AllowAnonymousUsersToStartMeeting", "AllowAnonymousUsersToStartMeeting");
  MP("teams-lobby", "8.5.3", 1, "Only people in the organisation bypass the lobby", "invited / org without guests / organizer", "\"$($m.AutoAdmittedUsers)\" -in 'InvitedUsers','EveryoneInCompanyExcludingGuests','OrganizerOnly'", "AutoAdmittedUsers");
  MP("teams-pstn-lobby", "8.5.4", 1, "Dial-in callers wait in the lobby", "off", "-not $m.AllowPSTNUsersToBypassLobby", "AllowPSTNUsersToBypassLobby");
  MP("teams-anon-chat", "8.5.5", 2, "Anonymous users cannot use meeting chat", "except anonymous", "\"$($m.MeetingChatEnabledType)\" -in 'EnabledExceptAnonymous','EnabledInMeetingOnlyForAllExceptAnonymous','Disabled'", "MeetingChatEnabledType");
  MP("teams-presenters", "8.5.6", 2, "Only organisers and co-organisers present", "organizer only", "\"$($m.DesignatedPresenterRoleMode)\" -eq 'OrganizerOnlyUserOverride'", "DesignatedPresenterRoleMode");
  MP("teams-ext-control", "8.5.7", 1, "External participants cannot give or take control", "off", "-not $m.AllowExternalParticipantGiveRequestControl", "AllowExternalParticipantGiveRequestControl");
  MP("teams-ext-chat", "8.5.8", 2, "Chat with untrusted external meetings is off", "off", "-not $m.AllowExternalNonTrustedMeetingChat", "AllowExternalNonTrustedMeetingChat");
  MP("teams-recording", "8.5.9", 2, "Meetings are not recorded by default", "off", "-not $m.AllowCloudRecording", "AllowCloudRecording");
  PS("teams-report", "8.6.1", 1, "teams", "Users can report security concerns in Teams", "on, to your SOC mailbox", "TEAMS+EXO", `$m = Get-CsTeamsMessagingPolicy -Identity Global; $r = Get-ReportSubmissionPolicy; $ok = $m.AllowSecurityEndUserReporting -and $r.ReportJunkToCustomizedAddress -and $r.ReportNotJunkToCustomizedAddress -and $r.ReportPhishToCustomizedAddress -and $r.ReportJunkAddresses -and $r.ReportPhishAddresses -and (-not $r.ReportChatMessageEnabled) -and $r.ReportChatMessageToCustomizedAddressEnabled; @{ pass = [bool]$ok; now = "Teams reporting $($m.AllowSecurityEndUserReporting) · to $($r.ReportPhishAddresses -join ', ')" }`);

  // ===== Fabric (phase 2) ===================================================
  const FAB = [["9.1.1", 1, "Guests cannot use Fabric unless a group allows them"], ["9.1.2", 1, "Inviting external users to Fabric is restricted"], ["9.1.3", 1, "Guests cannot browse Fabric content"], ["9.1.4", 1, "Publish to web is restricted"], ["9.1.5", 2, "R and Python visuals are off"], ["9.1.6", 1, "Users can apply sensitivity labels in Fabric"], ["9.1.7", 1, "Fabric shareable links are restricted"], ["9.1.8", 1, "External data sharing is restricted"], ["9.1.9", 1, "ResourceKey authentication is blocked"], ["9.1.10", 1, "Service principals' API access is restricted"], ["9.1.11", 1, "Service principals cannot create profiles"], ["9.1.12", 1, "Service principals cannot create workspaces, connections or pipelines"]];
  for (const [cis, lvl, t] of FAB) add({ k: `fab-${cis.split(".").pop()}`, cis, lvl, area: "fabric", reach: "fabric", t, tgt: "restricted", judge() { return { st: "phase2", now: "Fabric REST API — phase 2 (needs a second API permission and the Fabric Administrator role)" }; } });

  // tidy: every entry has a judge and src; level and ids checked by the tests
  for (const c of C) { if (!c.judge) c.judge = () => ({ st: "attest", now: "not attested" }); if (!c.src) c.src = []; }
  const CATALOG = C;
  const byKey = new Map(C.map((c) => [c.k, c]));

  // ---- the ENCA hardening record (attestations + accepted risks) ---------
  // One open extension, compact: entries "key|kind|yyyymmdd|who|reason",
  // kind a = attested (a portal setting confirmed), x = accepted (a failure
  // kept on purpose). Joined with "\n" into one string property.
  function parseRecord(rec) {
    const out = {};
    for (const line of String((rec && rec.t61) || "").split("\n").filter(Boolean)) {
      const [k, kind, d, who, ...why] = line.split("|");
      if (k) out[k] = { kind: kind === "x" ? "accepted" : "attested", at: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "", by: who || "", why: why.join("|") };
    }
    return out;
  }
  function recordBody(rec, k, entry) {
    const cur = parseRecord(rec);
    if (entry) cur[k] = entry; else delete cur[k];
    const clean = (s, n) => String(s || "").replace(/[|\n\r]/g, " ").trim().slice(0, n);
    const lines = Object.entries(cur).map(([key, e]) => [key, e.kind === "accepted" ? "x" : "a", String(e.at || "").replace(/-/g, "").slice(0, 8), clean(String(e.by || "").split("@")[0], 20), clean(e.why, 60)].join("|"));
    const body = { "@odata.type": "microsoft.graph.openTypeExtension", extensionName: EXT, t61: lines.join("\n"), t61rev: CATALOG_REV };
    const size = encodeURIComponent(JSON.stringify(body)).replace(/%[0-9A-F]{2}/gi, "x").length;   // UTF-8 bytes, no TextEncoder needed
    return { body, size, full: size > EXT_MAX };
  }

  // ---- judge everything -------------------------------------------------
  // ctx: { ca: CisCheck.run result, refs: show CIS references }
  function judge(S, ctx) {
    const rec = S.ext && S.ext.ok ? parseRecord(S.ext.data) : {};
    const lic = licence(S);
    const rows = CATALOG.map((c) => {
      let r;
      try { r = c.judge(S, ctx || {}) || { st: "error", now: "no verdict" }; } catch (e) { r = { st: "error", now: errText(e) }; }
      // PIM, access reviews, risk: licence first, so "not read" never hides "not licensed"
      if (lic.known && !lic.p2 && ["pim-standing", "pim-ga-approval", "pim-pra-approval", "rev-roles"].includes(c.k) && r.st !== "pass") r = { st: "nolic", now: "needs Microsoft Entra ID P2" };
      if (lic.known && !lic.p2 && !lic.gov && c.k === "rev-guests" && r.st !== "pass") r = { st: "nolic", now: "needs Entra ID P2 or ID Governance" };
      if (lic.known && !lic.intune && c.area === "devices" && /^intune-/.test(c.k) && r.st !== "pass") r = { st: "nolic", now: "no Intune licence in the tenant" };
      const att = rec[c.k];
      const row = Object.assign({ k: c.k, cis: c.cis, lvl: c.lvl, area: c.area, reach: c.reach, t: c.t, tgt: c.tgt, go: c.go || "", portal: c.portal || "", fixable: !!c.fix, base: r.st }, r);
      if (att && att.kind === "attested" && c.reach === "attest") Object.assign(row, { st: "attested", rec: att });
      else if (att && att.kind === "accepted" && ["fail", "part", "attest"].includes(r.st)) Object.assign(row, { st: "accepted", rec: att });
      else if (att) row.rec = att;
      return row;
    });
    const counted = rows.filter((r) => ["pass", "fail", "part", "report", "conf", "accepted"].includes(r.st));
    const pass = counted.filter((r) => r.st === "pass").length;
    return { rows, lic, rec, score: { pass, total: counted.length, pct: counted.length ? Math.round(pass / counted.length * 100) : 0, fail: rows.filter((r) => r.st === "fail" || r.st === "part").length, fixable: rows.filter((r) => r.fixable && (r.st === "fail" || r.st === "part")).length } };
  }

  // ---- plan ----------------------------------------------------------------
  // keys: the controls to fix. inputs: { [k]: input }. Returns { steps, refused }.
  function plan(S, keys, inputs) {
    const steps = new Map(), refused = [];
    for (const k of keys) {
      const c = byKey.get(k); if (!c || !c.fix) { refused.push({ k, why: "not fixable from here" }); continue; }
      const input = (inputs || {})[k] || null;
      const why = c.fix.need && c.fix.need(input);
      if (why) { refused.push({ k, why }); continue; }
      let ops = [];
      try { ops = c.fix.ops(S, input) || []; } catch (e) { refused.push({ k, why: errText(e) }); continue; }
      if (!ops.length) { refused.push({ k, why: "nothing to change" }); continue; }
      for (const o of ops) {
        let s = steps.get(o.key);
        if (!s) { s = { key: o.key, method: o.method, url: o.url, label: o.label || "", body: o.seed(), undo: o.undo ? clone(o.undo) : null, create: !!o.create, then: o.then || null, undoThen: o.undoThen || null, controls: [], source: o.source, scopes: new Set() }; steps.set(o.key, s); }
        else if (o.undo && s.undo && !o.whole) s.undo = deepMerge(s.undo, clone(o.undo));
        o.mutate(s.body, input);
        if (!s.controls.includes(k)) s.controls.push(k);
        c.fix.scopes.forEach((x) => s.scopes.add(x));
      }
    }
    const list = [...steps.values()].map((s) => Object.assign(s, { scopes: [...s.scopes] }));
    const scopes = [...new Set(list.flatMap((s) => s.scopes))];
    return { steps: list, refused, scopes };
  }
  function deepMerge(a, b) {
    if (Array.isArray(a) || Array.isArray(b) || typeof a !== "object" || typeof b !== "object" || !a || !b) return b;
    const o = Object.assign({}, a);
    for (const [k, v] of Object.entries(b)) o[k] = k in o ? deepMerge(o[k], v) : v;
    return o;
  }

  // ---- apply ---------------------------------------------------------------
  // io: { patch(url, body), put(url, body), post(url, body) → obj, del(url) }
  // ledger: RunLedger-like { start, done, fail, part, skip, stopped }.
  // Returns { results, undo: [ { method, url, body } ] } — undo in reverse order.
  async function apply(p, ctx) {
    const { io, ledger } = ctx, results = [], undo = [];
    for (let i = 0; i < p.steps.length; i++) {
      const s = p.steps[i];
      if (ledger && ledger.stopped) { ledger.skip(i, "stopped"); results.push({ key: s.key, ok: false, skipped: true }); continue; }
      if (ledger) ledger.start(i);
      try {
        const m = s.method.toUpperCase();
        if (m === "POST") {
          const made = await io.post(s.url, s.body);
          const id = made && made.id;
          if (s.then && id) await io.patch(`${s.url}/${id}`, s.then.body);
          if (id) undo.unshift(s.undoThen ? { method: "PATCH", url: `${s.url}/${id}`, body: s.undoThen.body, label: s.label || s.key } : { method: "DELETE", url: `${s.url}/${id}`, label: `remove what ENCA created — ${s.key}` });
        } else if (m === "PUT") { await io.put(s.url, s.body); if (s.undo) undo.unshift({ method: "PUT", url: s.url, body: s.undo, label: s.label || s.key }); }
        else { await io.patch(s.url, s.body); if (s.undo) undo.unshift({ method: "PATCH", url: s.url, body: s.undo, label: s.label || s.key }); }
        results.push({ key: s.key, ok: true });
        if (ledger) ledger.done(i, "written");
      } catch (e) { results.push({ key: s.key, ok: false, why: errText(e) }); if (ledger) ledger.fail(i, errText(e)); }
    }
    return { results, undo };
  }
  async function runUndo(undo, ctx) {
    const { io, ledger } = ctx, out = [];
    for (let i = 0; i < undo.length; i++) {
      const u = undo[i];
      if (ledger) ledger.start(i);
      try {
        if (u.method === "DELETE") await io.del(u.url); else if (u.method === "PUT") await io.put(u.url, u.body); else await io.patch(u.url, u.body);
        out.push({ ok: true }); if (ledger) ledger.done(i, "restored");
      } catch (e) { out.push({ ok: false, why: errText(e) }); if (ledger) ledger.fail(i, errText(e)); }
    }
    return out;
  }
  // what a step's sources are, so the screen re-reads only those after a write
  const sourcesOf = (p) => [...new Set(p.steps.map((s) => s.source).filter(Boolean))];

  // ---- the read-only PowerShell audit script ---------------------------------
  function psScript(meta) {
    const m = meta || {};
    const checks = CATALOG.filter((c) => c.reach === "ps" || (c.ps && c.ps.code));
    const block = (c) => `Invoke-EncaCheck '${c.k}' '${c.ps.mod}' {\n    ${c.ps.code}\n}`;
    const L = [];
    L.push("<#");
    L.push(".SYNOPSIS");
    L.push("  ENCA T61 Securing M365 — READ-ONLY audit of the settings a browser cannot reach.");
    L.push(".DESCRIPTION");
    L.push(`  Generated by ENCA ${m.build || ""} on ${new Date().toISOString().slice(0, 10)} for tenant ${m.tenantId || "<tenant id>"}.`);
    L.push("  Every command is a Get-* command: this script changes NOTHING in the tenant.");
    L.push(`  It writes one JSON file (schema ${PS_SCHEMA}) — load it in ENCA → 03 · Entra Tools → 🛡 Securing M365 → 📥 Load script result.`);
    L.push("  Modules: ExchangeOnlineManagement, Microsoft.Online.SharePoint.PowerShell, MicrosoftTeams.");
    L.push("  Roles: Global Reader covers Exchange, Purview and Teams reads; SharePoint needs SharePoint Administrator.");
    L.push(".PARAMETER Skip");
    L.push("  Leave out a workload: EXO, IPPS, SPO, TEAMS (comma-separated).");
    L.push("#>");
    L.push("[CmdletBinding()]");
    L.push(`param([string[]]$Skip = @(), [string]$OutFile = "$PWD\\enca-m365-ps-$((Get-Date).ToString('yyyyMMdd-HHmm')).json", [string]$SharePointAdminUrl = '${m.spoAdminUrl || "https://<tenant>-admin.sharepoint.com"}')`);
    L.push("$ErrorActionPreference = 'Stop'");
    L.push(`$TenantId = '${m.tenantId || ""}'`);
    L.push("$Results = [ordered]@{}");
    L.push("$Connected = @{}");
    L.push("function Invoke-EncaCheck([string]$Key, [string]$Needs, [scriptblock]$Check) {");
    L.push("  foreach ($n in $Needs.Split('+')) { if (-not $Connected[$n]) { $Results[$Key] = @{ pass = $null; now = ''; err = \"$n not connected\" }; return } }");
    L.push("  try { $r = & $Check; $Results[$Key] = @{ pass = $r.pass; now = [string]$r.now; err = '' } }");
    L.push("  catch { $Results[$Key] = @{ pass = $null; now = ''; err = $_.Exception.Message } }");
    L.push("  Write-Host (\"{0,-24} {1}\" -f $Key, $(if ($Results[$Key].pass -eq $true) { 'pass' } elseif ($Results[$Key].pass -eq $false) { 'FAIL' } else { 'not judged' }))");
    L.push("}");
    L.push("# Security & Compliance first, then Exchange: the other order makes Get-AdminAuditLogConfig report ingestion as off.");
    L.push("if ('IPPS' -notin $Skip) { try { Connect-IPPSSession -ShowBanner:$false; $Connected.IPPS = $true } catch { Write-Warning \"IPPS: $($_.Exception.Message)\" } }");
    L.push("if ('EXO' -notin $Skip) { try { Connect-ExchangeOnline -ShowBanner:$false; $Connected.EXO = $true } catch { Write-Warning \"EXO: $($_.Exception.Message)\" } }");
    L.push("if ('SPO' -notin $Skip) { try { Connect-SPOService -Url $SharePointAdminUrl; $Connected.SPO = $true } catch { Write-Warning \"SPO: $($_.Exception.Message)\" } }");
    L.push("if ('TEAMS' -notin $Skip) { try { Connect-MicrosoftTeams | Out-Null; $Connected.TEAMS = $true } catch { Write-Warning \"TEAMS: $($_.Exception.Message)\" } }");
    L.push("if ($Connected.EXO -and $TenantId) { try { $tid = (Get-ConnectionInformation | Select-Object -First 1).TenantID; if ($tid -and \"$tid\" -ne $TenantId) { Write-Warning \"Exchange is connected to tenant $tid, not $TenantId — the result will be refused by ENCA.\" } } catch {} }");
    L.push("");
    for (const g of ["EXO", "IPPS", "SPO", "TEAMS"]) {
      const todo = checks.filter((c) => c.ps.mod.split("+")[0] === g);
      if (!todo.length) continue;
      L.push(`# ---- ${g} ----`);
      for (const c of todo) L.push(block(c));
      L.push("");
    }
    L.push(`$out = [ordered]@{ schema = '${PS_SCHEMA}'; tenantId = $TenantId; ranAt = (Get-Date).ToUniversalTime().ToString('o'); ranBy = $(try { (Get-ConnectionInformation | Select-Object -First 1).UserPrincipalName } catch { '' }); connected = @($Connected.Keys); results = $Results }`);
    L.push("$out | ConvertTo-Json -Depth 5 | Set-Content -Path $OutFile -Encoding UTF8");
    L.push("Write-Host \"`nWritten: $OutFile — load it in ENCA (🛡 Securing M365 → 📥 Load script result).\"");
    L.push("if ($Connected.EXO) { Disconnect-ExchangeOnline -Confirm:$false | Out-Null }");
    L.push("if ($Connected.TEAMS) { Disconnect-MicrosoftTeams | Out-Null }");
    return L.join("\r\n") + "\r\n";
  }
  function parsePs(text, tenantId) {
    let j; try { j = JSON.parse(String(text || "").replace(/^﻿/, "")); } catch (e) { return { ok: false, why: `not JSON: ${errText(e)}` }; }
    if (!j || j.schema !== PS_SCHEMA) return { ok: false, why: `not an ENCA script result (schema ${j && j.schema})` };
    if (tenantId && j.tenantId && lc(j.tenantId) !== lc(tenantId)) return { ok: false, why: `the result is for tenant ${j.tenantId}, not this one` };
    const results = {};
    for (const [k, v] of Object.entries(j.results || {})) if (byKey.has(k)) results[k] = { pass: v && v.pass === true ? true : v && v.pass === false ? false : null, now: String((v && v.now) || ""), err: String((v && v.err) || "") };
    return { ok: true, data: { tenantId: j.tenantId || "", ranAt: j.ranAt || "", ranBy: j.ranBy || "", connected: j.connected || [], results } };
  }

  // ---- report --------------------------------------------------------------
  function markdown(model, meta) {
    const x = meta || {}, refs = !!x.refs, L = [];
    const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    L.push(`# Securing Microsoft 365 — ${x.tenant || "tenant"}`, "");
    L.push(`${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ENCA T61 ${x.build || ""} · catalog ${CATALOG_REV}${refs ? ` · referenced against the ${BENCH.name} v${BENCH.version}` : ""}`, "");
    const s = model.score;
    L.push(`**${s.pass} of ${s.total}** judged settings pass (${s.pct}%). ${s.fail} fail, ${s.fixable} of them fixable from ENCA.`, "");
    for (const [a, label] of AREAS) {
      const rows = model.rows.filter((r) => r.area === a); if (!rows.length) continue;
      L.push(`## ${label}`, "", `| ${refs ? "Ref | Level | " : ""}Setting | Status | Now | Target | How |`, `|${refs ? "---|---|" : ""}---|---|---|---|---|`);
      for (const r of rows) L.push(`| ${refs ? `${r.cis} | L${r.lvl} | ` : ""}${cell(r.t)} | ${STATUS[r.st] || r.st}${r.rec ? ` (${r.rec.kind} ${r.rec.at}${r.rec.why ? `: ${cell(r.rec.why)}` : ""})` : ""} | ${cell(r.now)} | ${cell(r.tgt)} | ${REACH[r.reach]} |`);
      L.push("");
    }
    if (refs) L.push("", `Recommendation numbers referenced from the ${BENCH.name} v${BENCH.version}, © Center for Internet Security, Inc. Assessment logic is ENCA's own; the benchmark text is not reproduced.`);
    return L.join("\n");
  }

  // ---- demo tenant -----------------------------------------------------------
  function demo() {
    const ok = (data) => ({ ok: true, data });
    const ga = (id, upn, extra) => Object.assign({ id, userPrincipalName: upn, displayName: upn.split("@")[0], onPremisesSyncEnabled: false, assignedLicenses: [], accountEnabled: true }, extra || {});
    const e5 = "06ebc4ee-1bb5-47dd-8120-11324bc54e06";
    const S = {
      readAt: new Date().toISOString(),
      org: ok([{ id: "00000000-0000-0000-0000-00000000demo", displayName: "Contoso (demo)", onPremisesSyncEnabled: false }]),
      skus: ok([{ skuId: e5, skuPartNumber: "SPE_E5", capabilityStatus: "Enabled", servicePlans: [{ servicePlanId: "p1", servicePlanName: "AAD_PREMIUM", provisioningStatus: "Success" }, { servicePlanId: "p2", servicePlanName: "AAD_PREMIUM_P2", provisioningStatus: "Success" }, { servicePlanId: "ex", servicePlanName: "EXCHANGE_S_ENTERPRISE", provisioningStatus: "Success" }, { servicePlanId: "in", servicePlanName: "INTUNE_A", provisioningStatus: "Success" }, { servicePlanId: "sp", servicePlanName: "SHAREPOINTENTERPRISE", provisioningStatus: "Success" }] }]),
      domains: ok([{ id: "contoso.example", isVerified: true, isInitial: false, authenticationType: "Managed", passwordValidityPeriodInDays: 90, supportedServices: ["Email"] }, { id: "contosodemo.onmicrosoft.com", isVerified: true, isInitial: true, authenticationType: "Managed", passwordValidityPeriodInDays: 2147483647, supportedServices: ["Email"] }]),
      authz: ok({ allowInvitesFrom: "everyone", guestUserRoleId: GUEST_ROLE.limited, defaultUserRolePermissions: { allowedToCreateApps: true, allowedToCreateTenants: false, allowedToCreateSecurityGroups: false, allowedToReadBitlockerKeysForOwnedDevice: true, permissionGrantPoliciesAssigned: ["ManagePermissionGrantsForSelf.microsoft-user-default-low", "ManagePermissionGrantsForOwnedResource.microsoft-dynamically-managed-permissions-for-team"] } }),
      devReg: ok({ id: "deviceRegistrationPolicy", displayName: "Device Registration Policy", userDeviceQuota: 50, multiFactorAuthConfiguration: "notRequired", azureADRegistration: { isAdminConfigurable: false, allowedToRegister: { "@odata.type": "#microsoft.graph.allDeviceRegistrationMembership" } }, azureADJoin: { isAdminConfigurable: true, allowedToJoin: { "@odata.type": "#microsoft.graph.allDeviceRegistrationMembership" }, localAdmins: { enableGlobalAdmins: true, registeringUsers: { "@odata.type": "#microsoft.graph.allDeviceRegistrationMembership" } } }, localAdminPassword: { isEnabled: true } }),
      appMgmt: ok({ isEnabled: false, applicationRestrictions: { passwordCredentials: [], keyCredentials: [] }, servicePrincipalRestrictions: { passwordCredentials: [], keyCredentials: [] } }),
      acrp: ok({ isEnabled: false, notifyReviewers: false, remindersEnabled: false, requestDurationInDays: 30, reviewers: [] }),
      abt: ok([]),
      amp: ok({ systemCredentialPreferences: { state: "enabled", includeTargets: [{ id: "all_users", targetType: "group" }], excludeTargets: [] }, authenticationMethodConfigurations: [
        { id: "MicrosoftAuthenticator", state: "enabled", includeTargets: [{ id: "all_users", targetType: "group" }], featureSettings: { displayAppInformationRequiredState: { state: "enabled", includeTarget: { id: "all_users", targetType: "group" } }, displayLocationInformationRequiredState: { state: "enabled", includeTarget: { id: "all_users", targetType: "group" } }, companionAppAllowedState: { state: "default", includeTarget: { id: "all_users", targetType: "group" } } } },
        { id: "Sms", state: "enabled", includeTargets: [{ id: "all_users", targetType: "group" }] }, { id: "Voice", state: "disabled" }, { id: "Email", state: "enabled", allowExternalIdToUseEmailOtp: "default" }] }),
      groupSettings: ok([]),
      b2b: ok([]),
      unified: ok([{ id: "g1", displayName: "All Company", visibility: "Public" }, { id: "g2", displayName: "Marketing", visibility: "Public" }, { id: "g3", displayName: "Finance", visibility: "Private" }]),
      thirdParty: ok([]),
      roles: ok([{ id: "r-ga", displayName: "Global Administrator", roleTemplateId: ROLE.GA }]),
      roleMembers: ok({ [ROLE.GA]: { name: "Global Administrator", users: [ga("u1", "bg-01@contoso.example"), ga("u2", "bg-02@contoso.example"), ga("u3", "anna.admin@contoso.example", { assignedLicenses: [{ skuId: e5, disabledPlans: [] }] }), ga("u4", "tom@contoso.example", { assignedLicenses: [{ skuId: e5, disabledPlans: [] }] }), ga("u5", "it@contoso.example"), ga("u6", "legacy@contoso.example", { onPremisesSyncEnabled: true })] }, [ROLE.PRA]: { name: "Privileged Role Administrator", users: [] } }),
      strengths: ok([]), locations: ok([]), caPolicies: ok([]),
      appsSvc: ok({ settings: { isOfficeStoreEnabled: true, isAppAndServicesTrialEnabled: true } }),
      forms: ok({ isInOrgFormsPhishingScanEnabled: true }),
      intune: ok({ secureByDefault: true, deviceComplianceCheckinThresholdDays: 30, isScheduledActionEnabled: true }),
      enroll: ok([{ "@odata.type": "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration", id: "demo_DefaultPlatformRestrictions", priority: 0, windowsRestriction: { platformBlocked: false, personalDeviceEnrollmentBlocked: false }, iosRestriction: { platformBlocked: false, personalDeviceEnrollmentBlocked: true }, androidRestriction: { platformBlocked: false, personalDeviceEnrollmentBlocked: false }, androidForWorkRestriction: { platformBlocked: false, personalDeviceEnrollmentBlocked: true }, macOSRestriction: { platformBlocked: false, personalDeviceEnrollmentBlocked: true } }]),
      spo: ok({ isLegacyAuthProtocolsEnabled: false, sharingCapability: "externalUserAndGuestSharing", isResharingByExternalUsersEnabled: true, sharingDomainRestrictionMode: "none", sharingAllowedDomainList: [], sharingBlockedDomainList: [] }),
      regDetails: ok([{ id: "x1", userPrincipalName: "new.starter@contoso.example", isAdmin: false }, { id: "x2", userPrincipalName: "kiosk@contoso.example", isAdmin: false }]),
      privDefs: ok([{ id: ROLE.GA, displayName: "Global Administrator" }, { id: ROLE.PRA, displayName: "Privileged Role Administrator" }]),
      schedInst: ok([{ roleDefinitionId: ROLE.GA, assignmentType: "Assigned", principalId: "u1", principal: { "@odata.type": "#microsoft.graph.user", displayName: "bg-01" } }, { roleDefinitionId: ROLE.GA, assignmentType: "Assigned", principalId: "u2", principal: { "@odata.type": "#microsoft.graph.user", displayName: "bg-02" } }, { roleDefinitionId: ROLE.GA, assignmentType: "Assigned", principalId: "u3", principal: { "@odata.type": "#microsoft.graph.user", displayName: "anna.admin" } }, { roleDefinitionId: ROLE.PRA, assignmentType: "Activated", principalId: "u4", principal: { "@odata.type": "#microsoft.graph.user", displayName: "tom" } }]),
      reviews: ok([]),
      pimGA: ok({ policyId: "DirectoryRole_demo_ga", rule: { id: "Approval_EndUser_Assignment", target: { caller: "EndUser", operations: ["All"], level: "Assignment" }, setting: { isApprovalRequired: false, approvalStages: [] } } }),
      pimPRA: ok({ policyId: "DirectoryRole_demo_pra", rule: { id: "Approval_EndUser_Assignment", target: { caller: "EndUser", operations: ["All"], level: "Assignment" }, setting: { isApprovalRequired: true, approvalStages: [{ primaryApprovers: [{ groupId: "g-approvers" }] }] } } }),
      sync: ok(null),
      ext: ok({ t61: "ent-linkedin|a|20261019|mihai|set in the portal 19 Oct" }),
      dns: ok({ "contoso.example": { name: "contoso.example", email: true, initial: false, spf: ["v=spf1 include:spf.protection.outlook.com -all"], dmarc: ["v=DMARC1; p=none; rua=mailto:dmarc@contoso.example"], dkim: { selector1: "selector1-contoso-example._domainkey.contosodemo.onmicrosoft.com", selector2: "" } }, "contosodemo.onmicrosoft.com": { name: "contosodemo.onmicrosoft.com", email: true, initial: true, spf: ["v=spf1 include:spf.protection.outlook.com -all"], dmarc: [] } }),
    };
    return S;
  }

  return {
    BENCH, CATALOG_REV, EXT, EXT_MAX, PS_SCHEMA, AREAS, REACH, STATUS, RSCOPE, SOURCES, SOURCE_LABEL, CATALOG, byKey, ROLE,
    read, readPerUser, readShared, readDns, mailDomains, spfVerdict, dmarcVerdict, judge, plan, apply, runUndo, sourcesOf, parseRecord, recordBody,
    psScript, parsePs, markdown, demo, licence, deepMerge, intuneSettings,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = M365Harden;
