// js/trv2.js — T56 🌐 Global Secure Access · Tenant restrictions v2 (pure, no DOM, no fetch)
//
// Two parts, written in this order and never another:
//   A. Cross-tenant access policy (v1.0): one partner entry per allowed tenant with
//      tenantRestrictions = allow all users + all applications, THEN the default
//      tenantRestrictions = block all users + all applications.
//   B. Global Secure Access universal tenant restrictions (beta):
//      /networkAccess/settings/crossTenantAccess networkPacketTaggingStatus = enabled.
//      Separate opt-in: nothing is enforced until B is on.
//
// TRv2 only ever restricts accounts issued by OTHER tenants. This tenant's own users and
// the B2B guests in this directory are never affected (MS Learn, universal tenant restrictions).
// The allowed list is a per-tenant setting: no tenant name or id lives in this file.
(function (root) {
  "use strict";

  const GRAPH = "https://graph.microsoft.com";
  const V1 = GRAPH + "/v1.0";
  const BETA = GRAPH + "/beta";
  const URL_DEFAULT = V1 + "/policies/crossTenantAccessPolicy/default";
  const URL_PARTNERS = V1 + "/policies/crossTenantAccessPolicy/partners";
  const URL_UTR = BETA + "/networkAccess/settings/crossTenantAccess";
  const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // Microsoft accounts (consumer)
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  const STORE_PREFIX = "enca-trv2:";
  const PERMS = {
    read: ["Policy.Read.All", "NetworkAccess.Read.All"],
    write: ["Policy.ReadWrite.CrossTenantAccess", "NetworkAccess.ReadWrite.All"],
    lookup: ["CrossTenantInformation.ReadBasic.All"],
    roles: ["Security Administrator", "Global Secure Access Administrator"],
  };

  // ---------- shapes ----------
  function side(accessType, all) {
    return { accessType, targets: [{ target: all, targetType: all === "AllUsers" ? "user" : "application" }] };
  }
  function trBody(accessType) {
    return { usersAndGroups: side(accessType, "AllUsers"), applications: side(accessType, "AllApplications") };
  }
  const ALLOW_ALL = () => trBody("allowed");
  const BLOCK_ALL = () => trBody("blocked");

  // A tenantRestrictions object (or null) → {set, users, apps, usersAll, appsAll, all}
  function readTr(tr) {
    if (!tr || (!tr.usersAndGroups && !tr.applications)) return { set: false, users: null, apps: null, usersAll: false, appsAll: false, all: null };
    const one = (s, all) => {
      if (!s) return { type: null, all: false };
      const t = Array.isArray(s.targets) ? s.targets : [];
      return { type: s.accessType || null, all: t.some((x) => x && x.target === all) };
    };
    const u = one(tr.usersAndGroups, "AllUsers");
    const a = one(tr.applications, "AllApplications");
    let all = null;
    if (u.type && u.type === a.type && u.all && a.all) all = u.type; // "allowed" | "blocked"
    return { set: true, users: u.type, apps: a.type, usersAll: u.all, appsAll: a.all, all };
  }

  // ---------- settings (per tenant, in the browser) ----------
  function storeKey(tenantId) { return STORE_PREFIX + String(tenantId || "").toLowerCase(); }

  // [{domain?, tenantId?, name?}] → {ok:[{tenantId, domain, name}], needLookup:[{domain,name}], refused:[{entry, reason}]}
  function normalizeAllow(list, ownTenantId) {
    const own = String(ownTenantId || "").toLowerCase();
    const ok = [], needLookup = [], refused = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
      const e = {
        tenantId: String((raw && raw.tenantId) || "").trim().toLowerCase(),
        domain: String((raw && raw.domain) || "").trim().toLowerCase(),
        name: String((raw && raw.name) || "").trim(),
      };
      if (!e.tenantId && !e.domain) { refused.push({ entry: raw, reason: "No domain and no tenant ID." }); continue; }
      if (e.tenantId && !GUID.test(e.tenantId)) { refused.push({ entry: raw, reason: "Not a tenant ID: " + e.tenantId }); continue; }
      if (e.domain && !DOMAIN.test(e.domain)) { refused.push({ entry: raw, reason: "Not a domain name: " + e.domain }); continue; }
      if (e.tenantId && e.tenantId === own) { refused.push({ entry: raw, reason: "This is the tenant itself. Tenant restrictions never apply to its own accounts." }); continue; }
      if (e.tenantId === MSA_TENANT) { refused.push({ entry: raw, reason: "Microsoft accounts are handled by the Microsoft accounts switch, not the allowed list." }); continue; }
      const key = e.tenantId || "d:" + e.domain;
      if (seen.has(key)) { refused.push({ entry: raw, reason: "Listed twice." }); continue; }
      seen.add(key);
      if (!e.name) e.name = e.domain || e.tenantId;
      if (e.tenantId) ok.push(e); else needLookup.push(e);
    }
    return { ok, needLookup, refused };
  }

  // Graph v1.0 lookup by domain (CrossTenantInformation.ReadBasic.All, optional — same as T43)
  function lookupUrl(domain) {
    return V1 + "/tenantRelationships/findTenantInformationByDomainName(domainName='" + encodeURIComponent(String(domain).replace(/'/g, "''")) + "')";
  }
  function applyLookup(entry, info) {
    if (!info || !info.tenantId || !GUID.test(info.tenantId)) return null;
    return { tenantId: info.tenantId.toLowerCase(), domain: entry.domain, name: entry.name && entry.name !== entry.domain ? entry.name : info.displayName || entry.domain };
  }

  // CSV: domain,tenantId,name — header required, "," or ";"
  function parseCsv(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (!lines.length) return { rows: [], error: "The file is empty." };
    const sep = lines[0].includes(";") ? ";" : ",";
    const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const iD = head.indexOf("domain"), iT = head.indexOf("tenantid"), iN = head.indexOf("name");
    if (iD < 0 && iT < 0) return { rows: [], error: "The header must name a domain or tenantId column." };
    const rows = lines.slice(1).map((l) => {
      const c = l.split(sep).map((x) => x.trim());
      return { domain: iD >= 0 ? c[iD] || "" : "", tenantId: iT >= 0 ? c[iT] || "" : "", name: iN >= 0 ? c[iN] || "" : "" };
    });
    return { rows, error: null };
  }
  function toCsv(list) {
    const q = (s) => String(s || "").replace(/[,;\r\n]/g, " ");
    return ["domain,tenantId,name"].concat((list || []).map((e) => [q(e.domain), q(e.tenantId), q(e.name)].join(","))).join("\n") + "\n";
  }

  // ---------- reading the tenant ----------
  // defaultPolicy: GET default; partners: GET partners value[]; utr: GET networkAccess setting or an error
  function state(defaultPolicy, partners, utr) {
    const def = readTr(defaultPolicy && defaultPolicy.tenantRestrictions);
    const list = (Array.isArray(partners) ? partners : []).map((p) => {
      const tr = readTr(p.tenantRestrictions);
      return { tenantId: String(p.tenantId || "").toLowerCase(), tr, inherits: !tr.set, raw: p.tenantRestrictions || null };
    });
    let utrState = "unknown";
    if (utr && !utr.error && typeof utr.networkPacketTaggingStatus === "string") utrState = utr.networkPacketTaggingStatus.toLowerCase();
    return { default: def, defaultRaw: (defaultPolicy && defaultPolicy.tenantRestrictions) || null, partners: list, utr: utrState, utrError: utr && utr.error ? String(utr.error) : null };
  }

  // What a tenant's accounts get on this tenant's devices, once enforced
  function effective(st, tenantId) {
    const id = String(tenantId || "").toLowerCase();
    const p = st.partners.find((x) => x.tenantId === id);
    const tr = p && p.tr.set ? p.tr : st.default;
    if (!tr.set) return "allowed"; // Microsoft default: nothing restricted
    if (tr.all) return tr.all;
    return "partial";
  }

  // ---------- plan ----------
  // settings: {allow:[{tenantId,domain,name}], keepPartners:[tenantId], allowMsa:false, enforce:false}
  function plan(st, settings, opts) {
    opts = opts || {};
    const s = settings || {};
    const norm = normalizeAllow(s.allow, opts.ownTenantId);
    const ops = [], findings = [], notes = [];
    const refusals = norm.refused.map((r) => r.reason);
    for (const e of norm.needLookup) refusals.push("No tenant ID for " + e.domain + " yet. Look it up first.");
    const keep = new Set((s.keepPartners || []).map((x) => String(x).toLowerCase()));
    const allowIds = new Set(norm.ok.map((e) => e.tenantId));
    const allowOps = [];

    // 1. Allowed tenants: partner entry + allow-all, before anything is blocked
    for (const e of norm.ok) {
      const p = st.partners.find((x) => x.tenantId === e.tenantId);
      if (p && p.tr.all === "allowed") { notes.push(e.name + " already allowed."); continue; }
      if (!p) {
        const id = "create:" + e.tenantId;
        ops.push({ id, kind: "partner-create", label: "Add " + e.name + " to cross-tenant access settings", method: "POST", url: URL_PARTNERS, body: { tenantId: e.tenantId }, tenantId: e.tenantId, before: null, created: true });
        allowOps.push(id);
      }
      const id = "allow:" + e.tenantId;
      ops.push({ id, kind: "partner-allow", label: "Allow accounts from " + e.name + " (all users, all applications)", method: "PATCH", url: URL_PARTNERS + "/" + e.tenantId, body: { tenantRestrictions: ALLOW_ALL() }, tenantId: e.tenantId, before: p ? p.raw : null, requires: p ? [] : ["create:" + e.tenantId] });
      allowOps.push(id);
    }

    // 2. Existing partners that inherit the default: blocked once the default blocks, unless kept
    for (const p of st.partners) {
      if (allowIds.has(p.tenantId) || p.tenantId === MSA_TENANT) continue;
      if (!p.inherits) continue;
      if (keep.has(p.tenantId)) {
        const id = "keep:" + p.tenantId;
        ops.push({ id, kind: "partner-allow", label: "Keep partner " + p.tenantId + " allowed (it inherited the default)", method: "PATCH", url: URL_PARTNERS + "/" + p.tenantId, body: { tenantRestrictions: ALLOW_ALL() }, tenantId: p.tenantId, before: null });
        allowOps.push(id);
      } else {
        findings.push({ sev: "warn", tenantId: p.tenantId, text: "Partner " + p.tenantId + " has no tenant restrictions of its own and inherits the default: its accounts will be blocked on this tenant's devices." });
      }
    }

    // 3. Microsoft accounts: the default block covers them. Allowing them means a partner entry for the MSA tenant.
    const msa = st.partners.find((x) => x.tenantId === MSA_TENANT);
    if (s.allowMsa) {
      if (!(msa && msa.tr.all === "allowed")) {
        if (!msa) ops.push({ id: "create:msa", kind: "partner-create", label: "Add Microsoft accounts to cross-tenant access settings", method: "POST", url: URL_PARTNERS, body: { tenantId: MSA_TENANT }, tenantId: MSA_TENANT, before: null, created: true });
        ops.push({ id: "allow:msa", kind: "partner-allow", label: "Allow personal Microsoft accounts", method: "PATCH", url: URL_PARTNERS + "/" + MSA_TENANT, body: { tenantRestrictions: ALLOW_ALL() }, tenantId: MSA_TENANT, before: msa ? msa.raw : null, requires: msa ? [] : ["create:msa"] });
        allowOps.push("allow:msa");
      }
    } else if (msa && msa.tr.all === "allowed") {
      findings.push({ sev: "info", tenantId: MSA_TENANT, text: "Personal Microsoft accounts have an allow entry of their own and stay allowed." });
    }

    // 4. Default: block all external users and applications
    if (st.default.all === "blocked") notes.push("The default already blocks all external users and applications.");
    else ops.push({ id: "default-block", kind: "default-block", label: "Default: block accounts from every other tenant (all users, all applications)", method: "PATCH", url: URL_DEFAULT, body: { tenantRestrictions: BLOCK_ALL() }, before: st.defaultRaw, requires: allowOps.slice() });

    // 5. Enforcement through GSA: separate opt-in. 32708 (go-live recheck B5):
    // never with nothing allowed — that blocks every account from another
    // tenant on these devices at once. The tenant's own allow-all partners
    // count, so a second browser without the local list is not refused.
    const tenantAllowed = st.partners.filter((p) => p.tr.all === "allowed" && p.tenantId !== MSA_TENANT);
    if (s.enforce && !norm.ok.length && !tenantAllowed.length) refusals.push("Enforce needs at least one allowed tenant. With none, every account from another tenant is blocked on these devices at once — add the tenants first, or leave Enforce off.");
    if (s.enforce) {
      if (st.utr === "enabled") notes.push("Universal tenant restrictions are already on.");
      else ops.push({ id: "utr-on", kind: "utr", label: "Global Secure Access: turn on universal tenant restrictions", method: "PATCH", url: URL_UTR, body: { "@odata.type": "#microsoft.graph.networkaccess.crossTenantAccessSettings", networkPacketTaggingStatus: "enabled" }, before: st.utr, requires: ops.some((o) => o.id === "default-block") ? ["default-block"] : allowOps.slice() });
    } else if (st.utr !== "enabled") {
      notes.push("Enforcement is off: the policy is written but nothing is blocked until universal tenant restrictions are turned on.");
    }

    if (!norm.ok.length) findings.push({ sev: "warn", text: "No tenant is on the allowed list: every account from another tenant will be blocked on this tenant's devices." });
    if (st.utr === "unknown") findings.push({ sev: "info", text: "The Global Secure Access setting could not be read" + (st.utrError ? " (" + st.utrError + ")" : "") + ". Is Global Secure Access activated?" });

    return { ops, findings, notes, refusals, allowed: norm.ok, canRun: refusals.length === 0 && ops.length > 0 };
  }

  // ---------- backup and undo ----------
  // ops: the plan about to run. With it, the backup records what the run
  // touches, so Put back restores only that — never a partner nobody changed.
  function backup(st, tenantId, at, ops) {
    if (!tenantId) throw new Error("A backup needs the tenant id.");
    const list = Array.isArray(ops) ? ops : null;
    const created = list ? list.filter((o) => o.kind === "partner-create").map((o) => o.tenantId) : [];
    const touchedIds = list ? [...new Set(list.filter((o) => o.kind === "partner-allow").map((o) => o.tenantId))].filter((id) => !created.includes(id)) : st.partners.map((p) => p.tenantId);
    const partners = {};
    for (const id of touchedIds) { const p = st.partners.find((x) => x.tenantId === id); partners[id] = p ? p.raw : null; }
    return {
      kind: "enca-trv2-backup/1", tenantId: String(tenantId).toLowerCase(), at: at || new Date().toISOString(),
      default: st.defaultRaw, partners, utr: st.utr,
      touched: list ? { default: list.some((o) => o.kind === "default-block"), utr: list.some((o) => o.kind === "utr"), created } : null,
    };
  }

  // Undo in reverse order: enforcement off first, then the default, then the
  // partners as they were, then the partner entries the run added.
  function undoOps(bk, createdIds) {
    if (!bk || bk.kind !== "enca-trv2-backup/1") throw new Error("Not a tenant restrictions backup.");
    const t = bk.touched;
    const ops = [];
    if (t ? t.utr : bk.utr !== "enabled") ops.push({ id: "undo-utr", kind: "utr", label: "Global Secure Access: universal tenant restrictions back off", method: "PATCH", url: URL_UTR, body: { "@odata.type": "#microsoft.graph.networkaccess.crossTenantAccessSettings", networkPacketTaggingStatus: bk.utr === "enabled" ? "enabled" : "disabled" } });
    if (t ? t.default : true) ops.push({ id: "undo-default", kind: "default-restore", label: "Default tenant restrictions as they were", method: "PATCH", url: URL_DEFAULT, body: { tenantRestrictions: bk.default || null } });
    for (const [id, tr] of Object.entries(bk.partners || {})) ops.push({ id: "undo-partner:" + id, kind: "partner-restore", label: "Partner " + id + " tenant restrictions as they were", method: "PATCH", url: URL_PARTNERS + "/" + id, body: { tenantRestrictions: tr || null } });
    const created = createdIds || (t && t.created) || [];
    for (const id of created) ops.push({ id: "undo-create:" + id, kind: "partner-delete", label: "Remove the partner entry the run added: " + id, method: "DELETE", url: URL_PARTNERS + "/" + id });
    return ops;
  }

  // ---------- the readiness-board link ----------
  // → {state: "off" | "policy" | "enforced" | "incomplete", text}
  function verdict(st, settings, opts) {
    const p = plan(st, settings, opts);
    const policyDone = !p.ops.some((o) => o.kind !== "utr");
    if (st.utr === "enabled" && policyDone) return { state: "enforced", text: "Enforced through Global Secure Access" };
    if (st.utr === "enabled") return { state: "incomplete", text: "Enforcement is on, but the policy does not match the allowed list" };
    if (policyDone && st.default.all === "blocked") return { state: "policy", text: "Policy written, not enforced yet" };
    return { state: "off", text: "Not set up" };
  }


  // ---------- for T56: the card, the fix, the preview ----------
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const VERDICT_CLS = { enforced: ["ok", "enforced"], policy: ["warn", "policy only"], incomplete: ["bad", "check"], off: ["wait", "not set up"] };

  // info: {err} | {st, settings, verdict}; ui: {open}
  // 32708 (Mihai, 18 Oct: "tenant restrictions must be optional"): an
  // OPTIONAL extra, folded by default, never a step of the chain and never
  // part of the verdict — the stolen-token protection is complete without it.
  function card(info, ui) {
    const open = !!(ui && ui.open);
    const wrap = (cls, word, body) => `<section class="list-card gsa-sect gsa-trv2" id="gsaTrv2"><details data-trv2fold${open ? " open" : ""}><summary><h3>🚧 Tenant restrictions v2</h3><span class="tag">optional</span><span class="gsa-st ${cls}">${esc(word)}</span><span class="mini muted">not part of the chain or the verdict</span></summary><p class="mini">Which other tenants' accounts may be used on devices that send their traffic through Global Secure Access. This tenant's own accounts are never restricted; Conditional Access cannot see these sign-ins, because they happen in the other tenant. Leave it off unless you have decided the allowed list — once enforced it also blocks accounts and app registrations from customer tenants used on these devices.</p>${body}</details></section>`;
    const btn = `<div class="gsa-actrow"><div><b>Set up tenant restrictions</b><div class="mini muted">optional · allowed tenants first, then block the rest, then enforce · writes to tenant · opens a workspace below with impact and the way back</div></div><button class="btn sm" data-gsafix="trv2">Set up…</button></div>`;
    if (!info || info.err) return wrap("wait", "not read", `<p class="mini gsa-warn-txt">Not read${info && info.err ? " — " + esc(info.err) : ""}. Cross-tenant access settings need Policy.Read.All; enforcement needs NetworkAccess.Read.All.</p>`);
    const st = info.st, s = info.settings || {}, v = info.verdict || verdict(st, s, {});
    const [cls, word] = VERDICT_CLS[v.state] || VERDICT_CLS.off;
    const allowIds = new Set((s.allow || []).map((e) => e.tenantId));
    const inherit = st.partners.filter((p) => p.inherits && !allowIds.has(p.tenantId) && p.tenantId !== MSA_TENANT).length;
    const def = st.default.all === "blocked" ? "blocks accounts from every other tenant" : st.default.all === "allowed" ? "allows every other tenant (set explicitly)" : st.default.set ? "customised — not all users and applications" : "Microsoft default — nothing restricted";
    const names = (s.allow || []).map((e) => `${e.name}${st ? ` (${effective(st, e.tenantId)})` : ""}`);
    const inTenant = st.partners.filter((p) => p.tr.all === "allowed" && p.tenantId !== MSA_TENANT && !(s.allow || []).some((e) => e.tenantId === p.tenantId)).map((p) => p.tenantId);
    const lines = [
      `Default: ${def}`,
      `Allowed tenants (kept in this browser, for this tenant): ${names.length ? names.join(", ") : "none yet"}`,
      ...(inTenant.length ? [`Also allowed in the tenant itself (not on this browser's list): ${inTenant.join(", ")}`] : []),
      `Partners that inherit the default: ${inherit}${inherit ? " — blocked once the default blocks, unless kept" : ""}`,
      `Enforcement through Global Secure Access: ${st.utr === "enabled" ? "on" : st.utr === "disabled" ? "off" : "not read" + (st.utrError ? " — " + st.utrError : "")}`,
    ];
    return wrap(cls, word, `<p class="mini"><b>${esc(v.text)}.</b></p><ul class="gsa-read">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${btn}`);
  }

  const FIX = {
    title: "Set up tenant restrictions v2 (optional)",
    scopes: ["Policy.ReadWrite.CrossTenantAccess", "NetworkAccess.ReadWrite.All"],
    role: "Security Administrator, and Global Secure Access Administrator to enforce",
    changes: [
      "Cross-tenant access settings → Organizational settings: a partner entry for every tenant on the allowed list, its tenant restrictions set to allow all users and all applications.",
      "Then Default settings → Tenant restrictions: block all external users and all external applications.",
      "Only when Enforce is ticked: Global Secure Access → Settings → Session management → Universal tenant restrictions on.",
    ],
    impact: "Optional — the compliant-network protection does not need it. Nothing changes for anybody until enforcement is on. Then, on devices with the GSA client in the Microsoft traffic profile's assigned group, sign-ins with an account from a tenant not on the list are refused: vendor and customer tenants (an MSP's per-customer admin accounts and app registrations used from these devices included — Learn: service principals are blocked too, AADSTS5000211), personal Microsoft accounts unless allowed, and existing partners that inherit the default unless kept. This tenant's own accounts, its B2B guests and GDAP sign-ins with this tenant's accounts are never affected. There is no report-only mode — keep the profile on a pilot group first. Enforce is refused while no tenant is allowed.",
    recovery: "A backup of what the run changes is downloaded before the first write. ↩ Put back reads it and undoes in reverse: enforcement off first, the default as it was, the partners as they were, and the partner entries the run added removed. By hand: Global Secure Access → Settings → Session management → Universal tenant restrictions off.",
  };

  function preview(p) {
    const base = (u) => String(u).replace(/^https:\/\/graph\.microsoft\.com/, "");
    if (!p || !p.ops || !p.ops.length) {
      return [{ id: "req", label: "Graph requests", lang: "http", text: [
        "POST  /v1.0/policies/crossTenantAccessPolicy/partners            { tenantId }   (per allowed tenant without an entry)",
        "PATCH /v1.0/policies/crossTenantAccessPolicy/partners/{tenantId} { tenantRestrictions: allow AllUsers + AllApplications }",
        "PATCH /v1.0/policies/crossTenantAccessPolicy/default             { tenantRestrictions: block AllUsers + AllApplications }",
        "PATCH /beta/networkAccess/settings/crossTenantAccess              { networkPacketTaggingStatus: enabled }   (only with Enforce)",
        "",
        p && p.notes && p.notes.length ? "Nothing to change: " + p.notes.join(" ") : "The list of requests appears here once there is something to change.",
      ].join("\n") }];
    }
    return [{ id: "req", label: `Graph requests · ${p.ops.length} in order`, lang: "http", text: p.ops.map((o, i) => `${i + 1}. ${o.method} ${base(o.url)}\n   ${o.label}${o.body ? "\n" + JSON.stringify(o.body, null, 2).split("\n").map((l) => "   " + l).join("\n") : ""}`).join("\n\n") }];
  }

  const api = { MSA_TENANT, PERMS, URL_DEFAULT, URL_PARTNERS, URL_UTR, ALLOW_ALL, BLOCK_ALL, readTr, storeKey, normalizeAllow, lookupUrl, applyLookup, parseCsv, toCsv, state, effective, plan, backup, undoOps, verdict, card, preview, FIX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Trv2 = api;
})(typeof self !== "undefined" ? self : this);
