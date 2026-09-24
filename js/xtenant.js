// ======================================================================
// 🤝 Cross-tenant access — who you let in from other Entra tenants, and
// whose MFA and device decisions you have agreed to trust.
//
// Mihai, 24 Sep: "can we add these checks to enca?" — the checks of
// Get-CrossTenantAccessReview.ps1 in cdell2222/m365-security-toolkit
// (MIT, Charlie Delmotte), ported to the browser and read next to the
// Conditional Access policies loaded now. Its sibling script,
// Get-CrossTenantInventory.ps1, reads Exchange organization relationships
// through the ExchangeOnlineManagement module; there is no Graph API for
// those, so it is NOT ported (said so on the tab and in Help).
//
// Reads (all by the app, on ▶ — this module is PURE, no DOM, no Graph):
//   GET /policies/crossTenantAccessPolicy/default                 Policy.Read.All
//   GET /policies/crossTenantAccessPolicy/partners                Policy.Read.All
//   GET /policies/crossTenantAccessPolicy/partners/{id}/identitySynchronization
//                                            Policy.Read.All, 404 = none set
//   GET https://login.microsoftonline.com/{id}/v2.0/.well-known/openid-configuration
//        public, no token — does the partner tenant still exist (optional)
//   GET /tenantRelationships/findTenantInformationByTenantId(tenantId='{id}')
//        CrossTenantInformation.ReadBasic.All — partner names (optional)
//
// WHAT ENCA ADDS to the script: every trust flag is followed into the
// policies. Inbound trust only matters where a policy that reaches that
// tenant's B2B users asks for MFA (or a strength) or a compliant / hybrid
// joined device. So the default-trust findings are HIGH only when an
// enabled policy relies on the claim today, and MEDIUM when none does yet.
//
// TRUST INHERITS PER FLAG. A partner whose inboundTrust is null — or whose
// single flag is null — takes the DEFAULT's value for it (the same rule
// MSLearn's ctView uses since 25469). The script falls back only when the
// whole object is null; ENCA follows Graph.
//
// Deliberate differences from the script, each said where it shows:
//   - "Guests can be invited from any tenant to all apps" is INFO here, not
//     MEDIUM: it is Microsoft's default, and the finding says so.
//   - A tenant whose existence could not be checked (network, CORS, a
//     timeout) is "not checked", never "gone".
// ======================================================================
const XTenant = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const NAME_SCOPES = ["CrossTenantInformation.ReadBasic.All"];
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SOURCE = "https://github.com/cdell2222/m365-security-toolkit";
  // The external user types inbound trust applies to: B2B collaboration
  // (guest and member) and B2B direct connect. Local guests are this
  // tenant's own accounts; other external users and service providers are
  // not what these settings decide.
  const B2B = ["b2bCollaborationGuest", "b2bCollaborationMember", "b2bDirectConnectUser"];
  const SEV_RANK = { high: 0, medium: 1, info: 2 };
  const SEV_LABEL = { high: "High", medium: "Medium", info: "Info" };
  const FLAGS = {
    mfa: "isMfaAccepted",
    compliant: "isCompliantDeviceAccepted",
    hybrid: "isHybridAzureADJoinedDeviceAccepted",
  };

  // ---- the settings ------------------------------------------------------
  function effTrust(def, own) {
    const out = {}, inherited = {};
    for (const [k, f] of Object.entries(FLAGS)) {
      const v = own ? own[f] : null;
      if (v === null || v === undefined) { out[k] = !!(def && def[f]); inherited[k] = true; }
      else { out[k] = !!v; inherited[k] = false; }
    }
    return { ...out, inherited };
  }
  const targetsOf = (x) => (x && x.targets || []).map((t) => t && t.target).filter(Boolean);
  function openToAll(s) {
    if (!s) return false;
    const u = s.usersAndGroups, a = s.applications;
    return !!(u && a && u.accessType === "allowed" && targetsOf(u).includes("AllUsers")
      && a.accessType === "allowed" && targetsOf(a).includes("AllApplications"));
  }
  function fmtAccess(s) {
    if (!s || !s.usersAndGroups) return "inherits default";
    const u = s.usersAndGroups, a = s.applications || {};
    const nu = (u.targets || []).length, na = (a.targets || []).length;
    const who = targetsOf(u).includes("AllUsers") ? "all users" : `${nu} user/group target${nu === 1 ? "" : "s"}`;
    const what = targetsOf(a).includes("AllApplications") ? "all apps" : `${na} app target${na === 1 ? "" : "s"}`;
    return `${u.accessType || "?"}: ${who} / ${what}`;
  }

  // ---- reach: which policies does a claim from this tenant satisfy? --------
  // tenantId = a partner's id, or null for "a tenant with no partner entry"
  // (the default). Returns the B2B types the policy reaches from there.
  function reachTypes(p, tenantId, partnerIds) {
    const U = (p.conditions && p.conditions.users) || {};
    const iu = U.includeUsers || [], eu = U.excludeUsers || [];
    if (eu.includes("GuestsOrExternalUsers")) return [];
    const namesTenant = (sel) => {
      const et = sel.externalTenants || {};
      if ((et.membershipKind || "all") !== "enumerated") return true;
      const m = et.members || [];
      return tenantId ? m.includes(tenantId) : m.some((x) => !partnerIds.has(x));
    };
    const typesOf = (sel) => String(sel.guestOrExternalUserTypes || "").split(",").map((s) => s.trim()).filter(Boolean);
    let types = [];
    if (iu.includes("All") || iu.includes("GuestsOrExternalUsers")) types = B2B.slice();
    else if (U.includeGuestsOrExternalUsers && namesTenant(U.includeGuestsOrExternalUsers)) {
      types = typesOf(U.includeGuestsOrExternalUsers).filter((t) => B2B.includes(t));
    }
    const ex = U.excludeGuestsOrExternalUsers;
    if (types.length && ex) {
      const et = ex.externalTenants || {};
      const all = (et.membershipKind || "all") !== "enumerated";
      // an exclusion naming tenants only takes out the tenants it names
      if (all || (tenantId && (et.members || []).includes(tenantId))) {
        const gone = typesOf(ex);
        types = types.filter((t) => !gone.includes(t));
      }
    }
    return types;
  }
  function asksFor(p) {
    const g = p.grantControls || {}, b = g.builtInControls || [];
    return { mfa: b.includes("mfa") || !!g.authenticationStrength, compliant: b.includes("compliantDevice"), hybrid: b.includes("domainJoinedDevice") };
  }
  const LIVE = (s) => s === "enabled" || s === "enabledForReportingButNotEnforced";
  // { mfa:[{name,state}], compliant:[…], hybrid:[…] } — only for the claims
  // this trust actually accepts; enabled and report-only policies.
  function reach(policies, tenantId, partnerIds, trust) {
    const out = { mfa: [], compliant: [], hybrid: [] };
    for (const p of policies || []) {
      if (!p || !LIVE(p.state)) continue;
      if (!reachTypes(p, tenantId, partnerIds).length) continue;
      const a = asksFor(p);
      for (const k of Object.keys(out)) if (trust[k] && a[k]) out[k].push({ name: p.displayName || p.id || "(unnamed)", state: p.state });
    }
    return out;
  }
  const enforced = (list) => list.filter((x) => x.state === "enabled");
  const reachCount = (r) => new Set([...r.mfa, ...r.compliant, ...r.hybrid].map((x) => x.name)).size;
  const policyList = (list) => list.map((x) => x.state === "enabled" ? x.name : `${x.name} (report-only)`);

  // ---- analyze -------------------------------------------------------------
  // input: { defaultOk, def, partnersOk, partners, sync:{id:obj|null}, exists:{id:bool|null},
  //          info:{id:{displayName,defaultDomainName}}, existsChecked, namesRead, error }
  function analyze(input, policies, opts) {
    const I = input || {};
    const def = I.def || {};
    const dTrustRaw = def.inboundTrust || {};
    const rows = (I.partners || []).filter((p) => p && GUID.test(p.tenantId || ""));
    const partnerIds = new Set(rows.map((p) => p.tenantId.toLowerCase()).concat(rows.map((p) => p.tenantId)));
    const findings = [];
    const add = (sev, scope, id, name, setting, text, pols) => findings.push({ sev, scope, id: id || null, name: name || null, setting, text, policies: pols || [] });

    // -- default
    const dTrust = effTrust(dTrustRaw, null);
    const dReach = I.defaultOk ? reach(policies, null, partnerIds, dTrust) : { mfa: [], compliant: [], hybrid: [] };
    const defModel = I.defaultOk ? {
      guestIn: fmtAccess(def.b2bCollaborationInbound), guestOpen: openToAll(def.b2bCollaborationInbound),
      dcIn: def.b2bDirectConnectInbound && def.b2bDirectConnectInbound.usersAndGroups ? def.b2bDirectConnectInbound.usersAndGroups.accessType : "blocked",
      trust: dTrust, reach: dReach,
    } : null;
    if (defModel) {
      const trustFinding = (k, setting, what) => {
        if (!dTrust[k]) return;
        const on = enforced(dReach[k]);
        if (on.length) add("high", "Default", null, null, setting,
          `${what} ${on.length} enabled polic${on.length === 1 ? "y relies" : "ies rely"} on it today. Trust it per partner, not by default.`, policyList(dReach[k]));
        else add("medium", "Default", null, null, setting,
          `${what} No enabled policy relies on it today${dReach[k].length ? " (only report-only ones do)" : ""}, but any policy that later asks guests for it will. Trust it per partner, not by default.`, policyList(dReach[k]));
      };
      trustFinding("mfa", "inboundTrust.isMfaAccepted", "MFA done in ANY external Entra tenant satisfies your Conditional Access MFA requirement for its B2B users.");
      trustFinding("compliant", "inboundTrust.isCompliantDeviceAccepted", "A device marked compliant by ANY external tenant's Intune counts as compliant for your Conditional Access — you do not control their compliance bar.");
      trustFinding("hybrid", "inboundTrust.isHybridAzureADJoinedDeviceAccepted", "Hybrid-joined devices from ANY external tenant satisfy your device-based Conditional Access.");
      if (defModel.guestOpen) add("info", "Default", null, null, "b2bCollaborationInbound",
        "Users from any Entra tenant can be invited as guests with access to all apps. This is Microsoft's default and fine for many organisations — it should be a decision, not an accident.");
      if (defModel.dcIn === "allowed") add("medium", "Default", null, null, "b2bDirectConnectInbound",
        "Users from any tenant can reach your Teams shared channels without existing in your directory. Microsoft's default is blocked — someone changed this.");
    }

    // -- partners
    const partners = rows.map((p) => {
      const id = p.tenantId;
      const info = (I.info || {})[id] || null;
      const sync = (I.sync || {})[id];
      const syncName = sync && sync.displayName;
      const name = (info && info.displayName) || syncName || p.displayName || id;
      const exists = I.exists && Object.prototype.hasOwnProperty.call(I.exists, id) ? I.exists[id] : undefined;
      const own = p.inboundTrust || null;
      const trust = effTrust(dTrustRaw, own);
      const syncIn = sync === undefined ? null : !!(sync && sync.userSyncInbound && sync.userSyncInbound.isSyncAllowed);
      const autoRedeem = !!(p.automaticUserConsentSettings && p.automaticUserConsentSettings.inboundAllowed);
      const r = reach(policies, id, partnerIds, trust);
      const overrides = ["b2bCollaborationInbound", "b2bCollaborationOutbound", "b2bDirectConnectInbound", "b2bDirectConnectOutbound", "inboundTrust", "tenantRestrictions"]
        .filter((k) => p[k] !== null && p[k] !== undefined);
      const row = { id, name, named: name !== id, domain: (info && info.defaultDomainName) || "", exists, guestIn: fmtAccess(p.b2bCollaborationInbound),
        dcIn: fmtAccess(p.b2bDirectConnectInbound), trust, syncIn, autoRedeem, sp: p.isServiceProvider === true,
        mto: p.isInMultiTenantOrganization === true, overrides, reach: r, reachN: reachCount(r) };

      if (exists === false) add("high", "Partner", id, name, "tenant", "This tenant no longer exists. The partner entry is dead configuration — remove it.");
      if (syncIn) add("medium", "Partner", id, name, "identitySynchronization.userSyncInbound",
        "This tenant can create and update users in your directory (cross-tenant sync). Confirm there is still a live multi-tenant or merger reason.");
      if (autoRedeem) add("medium", "Partner", id, name, "automaticUserConsentSettings.inboundAllowed",
        "Invitations from this tenant are redeemed automatically — its users never see a consent prompt.");
      if (own && (own.isCompliantDeviceAccepted || own.isHybridAzureADJoinedDeviceAccepted)) {
        const pol = [...r.compliant, ...r.hybrid];
        add("medium", "Partner", id, name, "inboundTrust (device)",
          `Devices trusted by this tenant's Intune or Active Directory count as trusted for your Conditional Access — their bar may be lower than yours.${pol.length ? ` It satisfies the device requirement of ${new Set(pol.map((x) => x.name)).size} of your policies.` : " No policy that reaches its users asks for a device today."}`, [...new Set(policyList(pol))]);
      }
      if (own && own.isMfaAccepted) add("info", "Partner", id, name, "inboundTrust.isMfaAccepted",
        `MFA from this tenant is trusted. Reasonable if you know their MFA policy — confirm it is still enforced.${r.mfa.length ? ` It satisfies MFA in ${r.mfa.length} of your policies.` : ""}`, policyList(r.mfa));
      if (openToAll(p.b2bDirectConnectInbound)) add("medium", "Partner", id, name, "b2bDirectConnectInbound",
        "All users of this tenant can reach all your Teams shared channels.");
      if (row.sp) add("info", "Partner", id, name, "isServiceProvider",
        "Service provider (CSP / GDAP). Confirm you still work with them — old resellers often keep their entry long after the contract ends. Check their GDAP relationship in the admin center too.");
      // service-provider entries are created by Microsoft and normally override nothing
      if (!overrides.length && !syncIn && !autoRedeem && exists !== false && !row.sp) add("info", "Partner", id, name, "entry",
        "Overrides nothing — every setting inherits the default. Either someone meant to configure it and did not, or it can go.");
      return row;
    });

    findings.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev] || (a.scope === b.scope ? 0 : a.scope === "Default" ? -1 : 1) || String(a.name || "").localeCompare(String(b.name || "")));
    const counts = { high: 0, medium: 0, info: 0 };
    for (const f of findings) counts[f.sev]++;
    return { def: defModel, partners, findings, counts, partnersOk: !!I.partnersOk, defaultOk: !!I.defaultOk,
      existsChecked: !!I.existsChecked, namesRead: !!I.namesRead, readAt: (opts && opts.readAt) || Date.now(), demo: !!(opts && opts.demo), error: I.error || "" };
  }

  // ---- render --------------------------------------------------------------
  const FILTERS = [["all", "All"], ["high", "High"], ["medium", "Medium"], ["info", "Info"]];
  function chips(m, filter) {
    return FILTERS.map(([k, l]) => {
      const n = k === "all" ? m.findings.length : m.counts[k];
      return (n || k === "all" || k === filter) ? `<button class="fchip ${filter === k ? "active" : ""}" data-xtf="${k}">${l} (${n})</button>` : "";
    }).join("");
  }
  const pill = (sev) => `<span class="xt-pill xt-${sev}">${SEV_LABEL[sev]}</span>`;
  const yes = (v, warn) => v === null || v === undefined ? '<span class="muted">?</span>' : v ? (warn ? `✓ ${pill(warn)}` : "✓") : '<span class="muted">—</span>';
  function existsCell(v) {
    if (v === true) return "✓";
    if (v === false) return '<span class="xt-dead">✗ gone</span>';
    if (v === null) return '<span class="muted" title="The public sign-in endpoint could not be reached from this browser">not checked</span>';
    return '<span class="muted">—</span>';
  }
  const trustTxt = (on, inh) => on ? `on${inh ? ' <span class="mini muted">(default)</span>' : ""}` : `off${inh ? ' <span class="mini muted">(default)</span>' : ""}`;
  function polChips(list) { return list.length ? `<div class="xt-pols">${list.map((n) => `<span class="xt-pol">${esc(n)}</span>`).join("")}</div>` : ""; }

  function renderDefault(m) {
    if (!m.def) return `<div class="list-card xt-card"><h3>Default policy</h3><p class="mini" style="color:var(--off)">Could not be read${m.error ? ` — ${esc(m.error)}` : ""}.</p></div>`;
    const d = m.def, t = d.trust;
    const devOn = t.compliant || t.hybrid;
    const sev = (k) => { const f = m.findings.find((x) => x.scope === "Default" && x.setting === `inboundTrust.${FLAGS[k]}`); return f ? " " + pill(f.sev) : ""; };
    const kv = (k, v) => `<div class="xt-kv"><span>${k}</span><span>${v}</span></div>`;
    const relied = [...d.reach.mfa, ...d.reach.compliant, ...d.reach.hybrid];
    const names = [...new Set(policyList(relied))];
    return `<div class="list-card xt-card"><h3>Default policy <span class="mini">— applies to every tenant without a partner entry</span></h3>
      <div class="xt-grid">
        ${kv("Guest access inbound", `${esc(d.guestIn)}${d.guestOpen ? " " + pill("info") : ""}`)}
        ${kv("Direct connect inbound (Teams shared channels)", d.dcIn === "allowed" ? `allowed ${pill("medium")}` : esc(d.dcIn || "blocked"))}
        ${kv("Trust external MFA", `${t.mfa ? "on" : "off"}${sev("mfa")}`)}
        ${kv("Trust external compliant / hybrid devices", `${devOn ? [t.compliant ? "compliant" : "", t.hybrid ? "hybrid joined" : ""].filter(Boolean).join(" + ") : "off"}${sev("compliant")}${sev("hybrid")}`)}
      </div>
      ${(t.mfa || devOn) ? `<div class="xt-adds"><div class="xt-tag">What this trust does to your policies</div>
        ${names.length ? `<p class="mini">A B2B user from <i>any</i> organisation without a partner entry satisfies ${t.mfa && devOn ? "MFA or the device requirement" : t.mfa ? "MFA" : "the device requirement"} in these policies without registering or enrolling here:</p>${polChips(names)}`
          : '<p class="mini">No enabled or report-only policy loaded now reaches B2B users from other tenants with a control this trust satisfies — the trust is on, but nothing relies on it yet.</p>'}</div>` : ""}
    </div>`;
  }
  function renderPartners(m) {
    if (!m.partnersOk) return `<div class="list-card xt-card"><h3>Partners</h3><p class="mini" style="color:var(--off)">The partner list could not be read${m.error ? ` — ${esc(m.error)}` : ""}.</p></div>`;
    if (!m.partners.length) return '<div class="list-card xt-card"><h3>Partners</h3><p class="mini">No partner entries — every other tenant gets the default policy above.</p></div>';
    const devSev = (p) => m.findings.some((f) => f.id === p.id && f.setting === "inboundTrust (device)") ? "medium" : null;
    const rows = m.partners.map((p) => `<tr>
      <td>${p.exists === false ? `<span class="xt-dead">${esc(p.name)}</span>` : esc(p.name)}${p.domain ? `<br><span class="mini muted">${esc(p.domain)}</span>` : ""}${p.named ? `<br><span class="mini muted xt-id">${esc(p.id)}</span>` : ""}</td>
      <td>${existsCell(p.exists)}</td>
      <td>${esc(p.guestIn)}</td>
      <td>${trustTxt(p.trust.mfa, p.trust.inherited.mfa)}</td>
      <td>${(p.trust.compliant || p.trust.hybrid) ? `${trustTxt(true, p.trust.inherited.compliant && p.trust.inherited.hybrid)}${devSev(p) ? " " + pill("medium") : ""}` : trustTxt(false, p.trust.inherited.compliant && p.trust.inherited.hybrid)}</td>
      <td>${yes(p.syncIn, p.syncIn ? "medium" : null)}</td>
      <td>${yes(p.autoRedeem, p.autoRedeem ? "medium" : null)}</td>
      <td>${[p.sp ? "CSP" : "", p.mto ? "MTO" : ""].filter(Boolean).join(" · ")}</td>
      <td class="xt-reach">${p.reachN ? `${p.reachN} polic${p.reachN === 1 ? "y" : "ies"}${p.reach.compliant.length || p.reach.hybrid.length ? '<br><span class="mini muted">incl. a device grant satisfied by their devices</span>' : ""}` : '<span class="muted">—</span>'}</td>
    </tr>`).join("");
    return `<div class="list-card xt-card"><h3>Partners <span class="mini">— ${m.partners.length} entr${m.partners.length === 1 ? "y" : "ies"}</span></h3>
      <div class="xt-tw"><table class="xt-tbl">
        <thead><tr><th>Tenant</th><th>Exists</th><th>Guest inbound</th><th>MFA trusted</th><th>Device trusted</th><th>Sync in</th><th>Auto-redeem</th><th>Type</th><th title="Enabled or report-only policies that reach this tenant's B2B users with a control its trusted claims satisfy">Reaches your CA</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${m.existsChecked ? "" : '<p class="mini muted" style="margin-top:8px">Exists: not checked on this run.</p>'}${m.namesRead ? "" : '<p class="mini muted" style="margin-top:4px">Names: tenant IDs, or the name cross-tenant sync carries. Tick Show partner names and ⟳ Refresh to look them up.</p>'}
    </div>`;
  }
  function renderFindings(m, filter) {
    const list = m.findings.filter((f) => filter === "all" || !filter || f.sev === filter);
    const body = list.length ? list.map((f) => `<div class="xt-f">${pill(f.sev)}<div><b>${f.scope === "Default" ? "Default" : esc(f.name)} · <span class="xt-set">${esc(f.setting)}</span></b><p>${esc(f.text)}</p>${polChips(f.policies)}</div></div>`).join("")
      : `<p class="mini" style="padding:8px 0">${m.findings.length ? "Nothing at this level." : "Nothing flagged."}</p>`;
    return `<div class="list-card xt-card"><h3>Findings</h3>${body}
      <p class="mini muted" style="margin-top:10px">Read-only — nothing here changes the tenant; cross-tenant settings are changed in Entra ID → External Identities → Cross-tenant access settings. Checks adapted from <a href="${SOURCE}" target="_blank" rel="noopener">cdell2222/m365-security-toolkit</a> (MIT).</p></div>`;
  }
  function renderTiles(m) {
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    return `<div class="xt-tiles">${t(m.counts.high ? "h" : "", "High", m.counts.high)}${t(m.counts.medium ? "m" : "", "Medium", m.counts.medium)}${t("", "Info", m.counts.info)}${t("", "Partner entries", m.partnersOk ? m.partners.length : "?")}</div>`;
  }
  function render(m, o) {
    const f = (o && o.filter) || "all";
    return renderTiles(m) + renderDefault(m) + renderPartners(m) + renderFindings(m, f)
      + (m.demo ? '<p class="mini muted">Demo data — example partners, not a real tenant.</p>' : "");
  }

  // ---- export --------------------------------------------------------------
  function toMd(m, tenant) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`# Cross-tenant access — ${tenant || "tenant"}`, ""];
    L.push(`${m.counts.high} high, ${m.counts.medium} medium, ${m.counts.info} info · ${m.partnersOk ? m.partners.length : "?"} partner entries · read ${new Date(m.readAt).toISOString().slice(0, 16).replace("T", " ")} UTC${m.demo ? " (demo)" : ""}`, "");
    if (m.def) {
      const t = m.def.trust;
      L.push("## Default policy", "", `- Guest access inbound: ${m.def.guestIn}`, `- Direct connect inbound: ${m.def.dcIn}`,
        `- Trust external MFA: ${t.mfa ? "on" : "off"}`, `- Trust external devices: ${t.compliant || t.hybrid ? [t.compliant ? "compliant" : "", t.hybrid ? "hybrid joined" : ""].filter(Boolean).join(" + ") : "off"}`, "");
    }
    if (m.partners.length) {
      L.push("## Partners", "", "| Tenant | Exists | Guest inbound | MFA trusted | Device trusted | Sync in | Auto-redeem | Type | Reaches your CA |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const p of m.partners) L.push(`| ${e(p.name)}${p.named ? ` (${p.id})` : ""} | ${p.exists === true ? "yes" : p.exists === false ? "GONE" : "not checked"} | ${e(p.guestIn)} | ${p.trust.mfa ? "yes" : "no"} | ${p.trust.compliant || p.trust.hybrid ? "yes" : "no"} | ${p.syncIn === null ? "?" : p.syncIn ? "yes" : "no"} | ${p.autoRedeem ? "yes" : "no"} | ${[p.sp ? "CSP" : "", p.mto ? "MTO" : ""].filter(Boolean).join(", ")} | ${p.reachN} |`);
      L.push("");
    }
    L.push("## Findings", "");
    if (!m.findings.length) L.push("Nothing flagged.");
    for (const f of m.findings) L.push(`- **${SEV_LABEL[f.sev].toUpperCase()}** ${f.scope === "Default" ? "Default" : f.name} · \`${f.setting}\` — ${f.text}${f.policies.length ? ` Policies: ${f.policies.join("; ")}.` : ""}`);
    L.push("", `Read-only. Checks adapted from ${SOURCE} (MIT); "Reaches your CA" reads the loaded Conditional Access policies.`);
    return L.join("\n");
  }
  function toCsv(m) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const L = [["severity", "scope", "tenantId", "tenantName", "setting", "finding", "policies"].join(",")];
    for (const f of m.findings) L.push([SEV_LABEL[f.sev].toUpperCase(), f.scope, f.id || "", f.name || "", f.setting, f.text, f.policies.join("; ")].map(q).join(","));
    return L.join("\n");
  }

  return { analyze, render, chips, toMd, toCsv, reachTypes, effTrust, openToAll, fmtAccess, NAME_SCOPES, GUID, SOURCE };
})();
