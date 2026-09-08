// ======================================================================
// 🛂 Session controls (T38, BETA) — what did a session control actually DO?
//
// The Entra sign-in log stops at "CA308 applied — Conditional Access App
// Control". Everything after that — the download that was blocked, the
// file that was labelled on the way out, the step-up that fired — happens
// inside the session and is written by Defender for Cloud Apps, not by
// Entra. So the question "is CA308 blocking downloads" has no answer in
// any log ENCA read until now.
//
// Two sources, one join:
//   • CloudAppEvents from Defender advanced hunting, through Microsoft
//     Graph (POST /security/runHuntingQuery, delegated
//     ThreatHunting.Read.All) — the same host and MSAL client as every
//     other read, one extra scope on the click. Filtered to AuditSource =
//     "Defender for Cloud Apps session control" / "access control", which
//     is exactly the traffic a Conditional Access session control routed.
//   • the Entra sign-in window ENCA already reads (🚦 / 🎚 share it):
//     a sign-in whose applied policy carries a CloudAppSecurity session
//     control is the ROUTING event — the moment the session was handed to
//     Defender, and which policy did it.
//   Join: same user, same app, the newest routing sign-in in the 8 hours
//   before the activity. A row that matches nothing is shown as unmatched,
//   never guessed.
//
// The activity schema is deliberately read tolerantly: which ActionType a
// blocked download carries, and where the matched policy name sits in
// RawEventData, is documented nowhere and differs per app. Every event
// keeps its raw fields, the classifier works on words (block / protect /
// step-up / login / download / upload), and the screen offers the raw
// field names it saw so a tenant with a real block can tell us what to
// read precisely. That is test item 1 of the promotion queue.
//
//   SessionCtl.query(days)                              → KQL
//   SessionCtl.parseEvents(rows)                        → events[]
//   SessionCtl.analyze({ vms, events, records, days })  → res
//   SessionCtl.render(res, opts) / toMd / toCsv
// ======================================================================
const SessionCtl = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();
  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };
  const CAAC_LABEL = { mcasConfigured: "Use custom policy", monitorOnly: "Monitor only", blockDownloads: "Block downloads" };
  const JOIN_WINDOW_MS = 8 * 3600 * 1000;

  // ------------------------------------------------------------ query --
  // Two shapes: with the AuditSource / SessionData columns (June 2024+),
  // and a fallback for a schema that does not have them yet.
  function query(days, fallback) {
    const d = Math.max(1, Math.round(days || 7));
    const cols = "Timestamp, ActionType, ActivityType, Application, ApplicationId, AccountObjectId, AccountDisplayName, AccountId, ObjectName, ObjectType, IPAddress, DeviceType, OSPlatform, UserAgent, IsExternalUser, AccountType, RawEventData, AdditionalFields";
    if (fallback) {
      return `CloudAppEvents
| where Timestamp > ago(${d}d)
| where ActionType has_any ("Block", "Blocked", "Protect", "Session", "Download", "Upload", "Login", "Step") or tostring(RawEventData) has_any ("SessionPolicy", "session control", "Blocked", "Protected")
| project ${cols}
| order by Timestamp desc
| take 5000`;
    }
    return `CloudAppEvents
| where Timestamp > ago(${d}d)
| where AuditSource has "session control" or AuditSource has "access control"
| project ${cols}, AuditSource, SessionData
| order by Timestamp desc
| take 5000`;
  }

  // ------------------------------------------------------------ parse --
  // hunting rows → events. Tolerant on purpose (see header).
  const asObj = (v) => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };
  function findKey(obj, rx, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 3) return "";
    for (const [k, v] of Object.entries(obj)) {
      if (rx.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v);
    }
    for (const v of Object.values(obj)) { const r = findKey(v, rx, depth + 1); if (r) return r; }
    return "";
  }
  function classify(actionType, rawText) {
    const a = lc(actionType), t = lc(rawText);
    if (/block/.test(a) || /"(actionresult|takenaction|action)"\s*:\s*"?block/.test(t)) return "block";
    if (/protect|encrypt|label/.test(a) || /"(actionresult|takenaction|action)"\s*:\s*"?(protect|encrypt)/.test(t)) return "protect";
    if (/step.?up|verif|reauth|authentication context/.test(a) || /step.?up/.test(t)) return "stepup";
    if (/^log ?in|login|sign.?in|logon/.test(a)) return "login";
    if (/download/.test(a)) return "download";
    if (/upload/.test(a)) return "upload";
    if (/audit|monitor/.test(a)) return "audit";
    return "other";
  }
  function parseEvents(rows) {
    return (rows || []).map((r) => {
      const raw = asObj(r.RawEventData) || {}, add = asObj(r.AdditionalFields) || {}, sess = asObj(r.SessionData) || {};
      const rawText = JSON.stringify(raw) + JSON.stringify(add);
      const policy = findKey(raw, /^(policy|policyname|matchedpolic|sessionpolic|policies|policydisplayname)/i) || findKey(add, /polic/i) || "";
      const file = r.ObjectName || findKey(raw, /^(sourcefilename|filename|objectname|file)$/i) || "";
      const kind = classify(r.ActionType, rawText);
      return {
        when: r.Timestamp, actionType: r.ActionType || "", activityType: r.ActivityType || "",
        app: r.Application || "", appId: r.ApplicationId, userId: r.AccountObjectId || "", name: r.AccountDisplayName || r.AccountId || "", upn: /@/.test(r.AccountId || "") ? r.AccountId : "",
        file, objectType: r.ObjectType || "", ip: r.IPAddress || "", device: [r.DeviceType, r.OSPlatform].filter(Boolean).join(" · "), ua: r.UserAgent || "",
        external: r.IsExternalUser === true || r.IsExternalUser === "true", accountType: r.AccountType || "",
        source: r.AuditSource || "", sessionId: sess.InLineSessionId || sess.inLineSessionId || "",
        policy, kind, raw, rawKeys: Object.keys(raw).slice(0, 40),
      };
    });
  }

  // ------------------------------------------------- policy side --
  function policyRows(vms) {
    return (vms || []).map((vm) => {
      const p = vm.raw || {}, s = p.sessionControls || {};
      const caac = s.cloudAppSecurity && s.cloudAppSecurity.isEnabled ? (s.cloudAppSecurity.cloudAppSecurityType || "mcasConfigured") : null;
      const others = [];
      if (s.signInFrequency && s.signInFrequency.isEnabled) others.push(s.signInFrequency.frequencyInterval === "everyTime" ? "Sign-in frequency: every time" : `Sign-in frequency: ${s.signInFrequency.value} ${s.signInFrequency.type}`);
      if (s.persistentBrowser && s.persistentBrowser.isEnabled) others.push(`Persistent browser: ${s.persistentBrowser.mode}`);
      if (s.secureSignInSession && s.secureSignInSession.isEnabled) others.push("Token protection");
      if (s.applicationEnforcedRestrictions && s.applicationEnforcedRestrictions.isEnabled) others.push("App enforced restrictions");
      if (s.continuousAccessEvaluation && s.continuousAccessEvaluation.mode) others.push(`CAE: ${s.continuousAccessEvaluation.mode}`);
      if (s.globalSecureAccessFilteringProfile && s.globalSecureAccessFilteringProfile.isEnabled) others.push("Global Secure Access profile");
      if (!caac && !others.length) return null;
      return { id: p.id, seq: vm.seq || "", name: p.displayName || vm.name, state: STATE[p.state] || "off", caac, caacLabel: caac ? (CAAC_LABEL[caac] || caac) : "", others, kind: caac ? "appcontrol" : "session" };
    }).filter(Boolean).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "appcontrol" ? -1 : 1) || (a.seq || "").localeCompare(b.seq || "") || a.name.localeCompare(b.name));
  }

  // The routing sign-ins: applied policy with a CloudAppSecurity session
  // control, result success (an enforced policy that applied).
  function routingSignins(records, policyIds) {
    const out = [];
    (records || []).forEach((rec) => {
      (rec.appliedConditionalAccessPolicies || []).forEach((ap) => {
        const sc = (ap.enforcedSessionControls || []).map(lc);
        if (!sc.some((c) => /cloudappsecurity|mcas|appcontrol/.test(c))) return;
        if (ap.result !== "success") return;
        out.push({ when: rec.createdDateTime, t: Date.parse(rec.createdDateTime || "") || 0, userId: rec.userId || "", upn: rec.userPrincipalName || "", name: rec.userDisplayName || "", app: rec.appDisplayName || rec.resourceDisplayName || "", appId: rec.appId || "", client: rec.clientAppUsed || "", policyId: ap.id, policyName: ap.displayName || (policyIds.get(ap.id) || {}).name || ap.id });
      });
    });
    return out;
  }

  // ---------------------------------------------------------- analyze --
  function analyze({ vms, events, records, days, schemaFallback, capped }) {
    const pols = policyRows(vms);
    const byId = new Map(pols.map((p) => [p.id, p]));
    const routes = records ? routingSignins(records, byId) : null;
    const norm = (s) => lc(s).replace(/\s+online$/, "").replace(/^microsoft\s+/, "").replace(/[^a-z0-9]/g, "");
    // index routing sign-ins per user+app, newest first
    const idx = new Map();
    (routes || []).forEach((r) => { const k = `${r.userId}|${norm(r.app)}`; (idx.get(k) || idx.set(k, []).get(k)).push(r); });
    idx.forEach((arr) => arr.sort((a, b) => b.t - a.t));
    const routeFor = (ev) => {
      if (!routes) return null;
      const t = Date.parse(ev.when || "") || 0;
      const exact = idx.get(`${ev.userId}|${norm(ev.app)}`) || [];
      let hit = exact.find((r) => r.t <= t && t - r.t <= JOIN_WINDOW_MS);
      if (!hit) { // any app for this user — the activity's app name and the sign-in's resource name often differ (SharePoint vs Office 365 SharePoint Online)
        let best = null;
        idx.forEach((arr, k) => { if (!k.startsWith(`${ev.userId}|`)) return; const c = arr.find((r) => r.t <= t && t - r.t <= JOIN_WINDOW_MS); if (c && (!best || c.t > best.t)) best = c; });
        hit = best ? { ...best, loose: true } : null;
      }
      return hit || null;
    };
    const evs = (events || []).map((e) => ({ ...e, route: routeFor(e) }));

    // per policy
    const rows = pols.map((p) => {
      const rs = (routes || []).filter((r) => r.policyId === p.id);
      const acts = evs.filter((e) => e.route && e.route.policyId === p.id);
      const cnt = (k) => acts.filter((e) => e.kind === k).length;
      const mdaPolicies = [...new Set(acts.map((e) => e.policy).filter(Boolean))];
      let verdict, why;
      if (p.kind !== "appcontrol") { verdict = "na"; why = "not a Defender control — enforced by Entra at sign-in"; }
      else if (p.state === "off") { verdict = "off"; why = p.caac === "monitorOnly" ? "Off — and Monitor only, which would route sessions but never block" : "Off — nothing is routed, the log cannot show anything"; }
      else if (p.state === "ro") { verdict = "ro"; why = "report-only — session controls are not applied in report-only, nothing is routed"; }
      else if (!routes) { verdict = "unknown"; why = "sign-in log not read — routing cannot be checked"; }
      else if (!rs.length) { verdict = "idle"; why = capped ? "no routing sign-in in the (capped) window" : "On, but no sign-in in the window carried this control — nobody in scope signed in through a browser?"; }
      else if (p.caac === "monitorOnly") { verdict = "monitor"; why = `${rs.length} session${rs.length === 1 ? "" : "s"} routed — Monitor only logs the login and nothing else`; }
      else if (cnt("block") || cnt("protect") || cnt("stepup")) { verdict = "acting"; why = "routed sessions and Defender actions both present"; }
      else if (acts.length) { verdict = "watching"; why = "routed and logged by Defender, but no block / protect / step-up in the window"; }
      else { verdict = "silent"; why = `${rs.length} session${rs.length === 1 ? "" : "s"} routed, no Defender activity joined to them — a Defender session policy may be missing, or the join found nothing`; }
      return { ...p, routed: rs.length, users: new Set(rs.map((r) => r.userId)).size, apps: [...new Set(rs.map((r) => r.app))], acts: acts.length, block: cnt("block"), protect: cnt("protect"), stepup: cnt("stepup"), audit: cnt("audit") + cnt("download") + cnt("upload"), login: cnt("login"), mdaPolicies, verdict, why };
    });

    // MDA policies seen, with the CA policy that routed to them (or none)
    const mda = new Map();
    evs.forEach((e) => {
      if (!e.policy) return;
      const m = mda.get(e.policy) || mda.set(e.policy, { name: e.policy, n: 0, block: 0, protect: 0, stepup: 0, login: 0, routers: new Set(), kinds: new Set() }).get(e.policy);
      m.n++; if (m[e.kind] != null) m[e.kind]++; m.kinds.add(e.kind);
      if (e.route) m.routers.add(e.route.policyName);
    });
    const mdaPolicies = [...mda.values()].map((m) => ({ ...m, routers: [...m.routers], kinds: [...m.kinds] })).sort((a, b) => b.block - a.block || b.n - a.n);

    const unmatched = evs.filter((e) => !e.route && e.kind !== "login");
    const rawKeys = [...new Set(evs.flatMap((e) => e.rawKeys))].slice(0, 60);
    const actionTypes = [...evs.reduce((m, e) => m.set(e.actionType, (m.get(e.actionType) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const tiles = {
      policies: pols.length, appcontrol: pols.filter((p) => p.kind === "appcontrol").length, other: pols.filter((p) => p.kind !== "appcontrol").length,
      routed: routes ? routes.length : null, routedUsers: routes ? new Set(routes.map((r) => r.userId)).size : null, routedApps: routes ? new Set(routes.map((r) => r.app)).size : null, routers: routes ? new Set(routes.map((r) => r.policyId)).size : null,
      blocked: evs.filter((e) => e.kind === "block").length, blockedUsers: new Set(evs.filter((e) => e.kind === "block").map((e) => e.userId)).size,
      protect: evs.filter((e) => e.kind === "protect").length, stepup: evs.filter((e) => e.kind === "stepup").length, audit: evs.filter((e) => ["audit", "download", "upload", "other"].includes(e.kind)).length, login: evs.filter((e) => e.kind === "login").length,
      events: evs.length,
    };
    return { days, rows, events: evs.sort((a, b) => String(b.when).localeCompare(String(a.when))), mdaPolicies, unmatched: unmatched.length, tiles, rawKeys, actionTypes, schemaFallback: !!schemaFallback, capped: !!capped, routesRead: !!routes };
  }

  // ----------------------------------------------------------- render --
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;
  const stateHtml = (st) => `<span class="wo-state ${st}">${dot(st)}${STATE_LABEL[st]}</span>`;
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const polLink = (r) => `<span class="pol-link" data-polid="${esc(r.id)}">${r.seq ? `<b>${esc(r.seq)}</b> ` : ""}${esc(r.name)}</span>`;
  const KIND = { block: ["Blocked", "blk"], protect: ["Protected", "wp"], stepup: ["Step-up", "int"], login: ["Login routed", "nc"], download: ["Download", ""], upload: ["Upload", ""], audit: ["Audited", ""], other: ["Activity", ""] };
  const VERDICT = { acting: ['<span class="wo-res nc">Acting</span>'], watching: ['<span class="wo-res wp">Watching</span>'], monitor: ['<span class="wo-res wp">Monitor only</span>'], silent: ['<span class="wo-res wb">Routed, nothing acted</span>'], idle: ['<span class="wo-res wb">Nothing routed</span>'], off: ['<span class="wo-res wp">Off</span>'], ro: ['<span class="wo-res wp">Report-only</span>'], unknown: ['<span class="mini muted">Not checked</span>'], na: ['<span class="mini muted">n/a</span>'] };
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return String(iso || ""); } };

  function render(res, opts = {}) {
    const t = res.tiles, filter = opts.filter || "acted", pfilter = opts.pfilter || "appcontrol", rangeLabel = opts.rangeLabel || `${res.days} days`;
    const q = lc(opts.q || "");
    const notes = [];
    if (res.schemaFallback) notes.push("The hunting schema had no AuditSource column, so session-control events were picked by their wording — counts may include activities Defender logged through an app connector rather than a session.");
    if (res.capped) notes.push("The sign-in window was capped, so some routing sign-ins are missing and more activities than usual show as unmatched.");
    if (!res.routesRead) notes.push("The sign-in log was not read: activities are shown, but which CA policy routed each session cannot be said.");
    // Every tile is a filter: the number sets the table it counts, the parts
    // under it narrow further. sc-pf = policy filter, sc-ef = event filter.
    const sub = (kind, val, label, on) => `<button class="wo-sub${on ? " on" : ""}" data-${kind}="${val}">${label}</button>`;
    const tiles = `<div class="list-card wo-card"><div class="wo-verdicts">
      <button class="wo-vt wo-tile${pfilter === "all" ? " on" : ""}" data-sc-pf="all" title="Show every policy with a session control"><span class="k">Policies with a session control</span><span class="v">${t.policies}</span><span class="s">${sub("sc-pf", "appcontrol", `${t.appcontrol} App Control`, pfilter === "appcontrol")} · ${sub("sc-pf", "session", `${t.other} other session controls`, pfilter === "session")}</span></button>
      <button class="wo-vt wo-tile ${t.routed ? "ok" : ""}${pfilter === "routed" ? " on" : ""}" data-sc-pf="routed" title="Show the policies that routed a session"><span class="k">Sessions routed to Defender · ${esc(rangeLabel)}</span><span class="v">${t.routed == null ? '<span class="muted">—</span>' : t.routed}</span><span class="s">${t.routed == null ? "sign-in log not read" : `by ${t.routers} polic${t.routers === 1 ? "y" : "ies"} · ${t.routedUsers} users · ${t.routedApps} apps · ${sub("sc-ef", "login", `${t.login} logins logged`, filter === "login")}`}</span></button>
      <button class="wo-vt wo-tile ${t.blocked ? "bad" : "ok"}${filter === "block" ? " on" : ""}" data-sc-ef="block" title="Show the blocked activities"><span class="k">Downloads / activities blocked</span><span class="v">${t.blocked}</span><span class="s">${t.blockedUsers} user${t.blockedUsers === 1 ? "" : "s"} · ${sub("sc-ef", "all", `${t.events} Defender events read`, filter === "all")}</span></button>
      <button class="wo-vt wo-tile ${t.protect + t.stepup ? "warn" : ""}${filter === "acted" ? " on" : ""}" data-sc-ef="acted" title="Show everything Defender acted on"><span class="k">Other actions</span><span class="v">${t.protect + t.stepup + t.audit}</span><span class="s">${sub("sc-ef", "protect", `${t.protect} protected`, filter === "protect")} · ${sub("sc-ef", "stepup", `${t.stepup} step-ups`, filter === "stepup")} · ${sub("sc-ef", "audit", `${t.audit} audited`, filter === "audit")} · ${sub("sc-ef", "unmatched", `${res.unmatched} unmatched`, filter === "unmatched")}</span></button>
    </div></div>`;

    // policies
    const pchips = [["appcontrol", `App Control ${pill(t.appcontrol, "green")}`], ["routed", `Routed a session ${pill(res.rows.filter((r) => r.routed > 0).length, "green")}`], ["session", `Other session controls ${pill(t.other, "zero")}`], ["all", `All ${pill(t.policies, "zero")}`]].map(([k, l]) => `<button class="fchip${pfilter === k ? " active" : ""}" data-sc-pfilter="${k}">${l}</button>`).join("");
    const prows = res.rows.filter((r) => pfilter === "all" || (pfilter === "routed" ? r.routed > 0 : r.kind === pfilter));
    const ptable = `<div class="list-card wo-card" id="scPolicies">
      <h3 class="wo-h">📋 Conditional Access policies with a session control — and what Defender did behind them</h3>
      <div class="chip-filter" style="margin:8px 0 10px">${pchips}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>State</th><th>Session control</th><th>Routed · ${esc(rangeLabel)}</th><th>Defender actions</th><th>Defender policies matched</th><th>Verdict</th></tr></thead><tbody>
      ${prows.map((r) => `<tr class="${r.state === "off" ? "wo-dim" : ""}"><td>${polLink(r)}</td><td>${stateHtml(r.state)}</td>
        <td>${r.caac ? `<span class="ctrl">App Control</span> <span class="mini muted">${esc(r.caacLabel)}</span>` : ""}${r.others.map((o) => `<span class="ctrl">${esc(o)}</span>`).join("")}</td>
        <td class="wo-cnt">${r.kind !== "appcontrol" ? '<span class="mini muted">n/a</span>' : !res.routesRead ? '<span class="mini muted">—</span>' : `${pill(r.routed, "green")}${r.routed ? ` <span class="mini muted">${r.users} user${r.users === 1 ? "" : "s"}</span>` : ""}`}</td>
        <td>${r.kind !== "appcontrol" ? '<span class="mini muted">not a Defender control</span>' : r.acts ? `${r.block ? `<span class="wo-res blk">${r.block} blocked</span> · ` : ""}${r.protect ? `<span class="wo-res wp">${r.protect} protected</span> · ` : ""}${r.stepup ? `${r.stepup} step-ups · ` : ""}<span class="mini muted">${r.audit} audited · ${r.login} logins</span>` : '<span class="mini muted">—</span>'}</td>
        <td class="mini">${r.mdaPolicies.map(esc).join("<br>") || '<span class="muted">—</span>'}</td>
        <td>${VERDICT[r.verdict][0]}<div class="mini muted">${esc(r.why)}</div></td></tr>`).join("") || '<tr><td colspan="7" class="mini muted" style="padding:14px">No policy in this filter.</td></tr>'}
      </tbody></table></div>
      ${res.rows.filter((r) => r.kind === "appcontrol" && r.caac === "monitorOnly").length ? `<div class="wo-callout"><b>Monitor only never blocks.</b> ${res.rows.filter((r) => r.kind === "appcontrol" && r.caac === "monitorOnly").map((r) => `<span class="pol-link" data-polid="${esc(r.id)}">${esc(r.seq || r.name)}</span>`).join(", ")} carr${res.rows.filter((r) => r.caac === "monitorOnly").length === 1 ? "ies" : "y"} the built-in <i>Monitor only</i> control: once On, every matching session is routed to Defender and its <i>Login</i> is logged — nothing else. To block downloads the policy needs <b>Use custom policy</b> (or the built-in <b>Block downloads</b>) and a Defender session policy <i>Control file download (with inspection) → Block</i>.</div>` : ""}
      ${res.mdaPolicies.filter((m) => !m.routers.length).length && res.routesRead ? `<div class="wo-callout"><b>Defender policies with no router found.</b> ${res.mdaPolicies.filter((m) => !m.routers.length).map((m) => `<b>${esc(m.name)}</b> (${m.n})`).join(", ")} matched activities that no routing sign-in in the window could be joined to — either the session started before the window, or no enabled CA policy carries App Control for that scope.</div>` : ""}
    </div>`;

    // activities
    const kinds = [["acted", `Blocked / protected / step-up ${pill(t.blocked + t.protect + t.stepup, "red")}`], ["block", `Blocked ${pill(t.blocked, "red")}`], ["protect", `Protected ${pill(t.protect, "amber")}`], ["stepup", `Step-up ${pill(t.stepup, "amber")}`], ["audit", `Audited ${pill(t.audit, "zero")}`], ["login", `Logins routed ${pill(t.login, "zero")}`], ["unmatched", `Unmatched ${pill(res.unmatched, "amber")}`], ["all", `All ${pill(t.events, "zero")}`]]
      .map(([k, l]) => `<button class="fchip${filter === k ? " active" : ""}" data-sc-filter="${k}">${l}</button>`).join("");
    const inFilter = (e) => filter === "all" ? true : filter === "acted" ? ["block", "protect", "stepup"].includes(e.kind) : filter === "audit" ? ["audit", "download", "upload", "other"].includes(e.kind) : filter === "unmatched" ? (!e.route && e.kind !== "login") : e.kind === filter;
    const inQ = (e) => !q || [e.name, e.upn, e.app, e.file, e.policy, e.actionType, e.route && e.route.policyName].some((x) => lc(x).includes(q));
    const shown = res.events.filter((e) => inFilter(e) && inQ(e));
    const maxRows = opts.maxRows || 100;
    const etable = `<div class="list-card wo-card" id="scEvents">
      <h3 class="wo-h">🚫 What Defender did · ${esc(rangeLabel)} ${pill(t.blocked, "red")} ${pill(t.protect + t.stepup, "amber")}</h3>
      <div class="chip-filter" style="margin:8px 0 10px">${kinds}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>When</th><th>User</th><th>App · object</th><th>Action</th><th>Defender policy</th><th>Routed by</th></tr></thead><tbody>
      ${shown.slice(0, maxRows).map((e) => `<tr><td class="num">${esc(fmtWhen(e.when))}</td>
        <td>${e.upn ? `<a href="#" class="wv-member" data-sc-open="${esc(e.upn)}"><b>${esc(e.name || e.upn)}</b></a>` : `<b>${esc(e.name || e.userId || "(unknown)")}</b>`}<div class="mini muted">${esc(e.upn || e.userId)}${e.external ? " · external" : ""}</div></td>
        <td>${esc(e.app)}${e.file ? `<div class="mini muted">${esc(e.file)}</div>` : ""}</td>
        <td><span class="wo-res ${KIND[e.kind][1]}">${KIND[e.kind][0]}</span><div class="mini muted">${esc(e.actionType)}${e.device ? ` · ${esc(e.device)}` : ""}</div></td>
        <td class="mini">${esc(e.policy) || '<span class="muted">—</span>'}</td>
        <td class="mini">${e.route ? `<span class="pol-link" data-polid="${esc(e.route.policyId)}">${esc(e.route.policyName)}</span>${e.route.loose ? '<div class="muted">joined on user + time; app names differ</div>' : ""}` : res.routesRead ? '<span style="color:var(--warn-fg)">none found</span><div class="muted">no routing sign-in within 8h</div>' : '<span class="muted">not checked</span>'}</td></tr>`).join("")
        || `<tr><td colspan="6" class="mini muted" style="padding:14px">${t.events ? "Nothing in this filter." : "Defender logged no session-control activity in the window."}</td></tr>`}
      </tbody></table></div>
      ${shown.length > maxRows ? `<p class="mini muted" style="margin-top:6px">${shown.length - maxRows} more — export CSV for all.</p>` : ""}
      <p class="mini muted" style="margin-top:8px">Join rule: same user, same app, the newest sign-in with an App Control policy applied in the 8 hours before the activity; when the activity's app name and the sign-in's resource name differ, the newest routing sign-in of that user is used and said so. A row with no match is shown as such — never guessed.</p>
    </div>`;

    // MDA policies + schema
    const mtable = `<div class="list-card wo-card">
      <h3 class="wo-h">🧩 Defender session policies seen</h3>
      ${res.mdaPolicies.length ? res.mdaPolicies.map((m) => `<div class="wo-grp"><span><b>${esc(m.name)}</b></span><span class="muted">${m.block ? `${m.block} blocked · ` : ""}${m.protect ? `${m.protect} protected · ` : ""}${m.stepup ? `${m.stepup} step-ups · ` : ""}${m.n} events</span><span class="mini ${m.routers.length ? "muted" : ""}" ${m.routers.length ? "" : 'style="color:var(--warn-fg)"'}>${m.routers.length ? `routed by ${esc(m.routers.join(", "))}` : "no CA policy routing found"}</span></div>`).join("")
        : '<p class="mini muted">No activity in the window named a Defender policy. Defender has no Graph endpoint for listing session policies, so a policy that matched nothing cannot be listed here.</p>'}
      <details style="margin-top:12px"><summary class="mini muted" style="cursor:pointer">What the hunting rows looked like — action types and raw field names seen</summary>
        <p class="mini" style="margin-top:8px"><b>ActionType</b>: ${res.actionTypes.slice(0, 20).map(([a, n]) => `${esc(a || "(empty)")} ×${n}`).join(" · ") || "—"}</p>
        <p class="mini" style="margin-top:6px"><b>RawEventData keys</b>: ${res.rawKeys.map(esc).join(", ") || "—"}</p>
        <p class="mini muted" style="margin-top:6px">A block that shows as “Activity” instead of “Blocked” means the words this tool looks for are not the ones your tenant's events use — send this list along and the classifier gets the exact field.</p>
      </details>
    </div>`;
    return (notes.length ? `<p class="mini muted" style="margin:0 0 8px">${notes.map(esc).join(" ")}</p>` : "") + tiles + ptable + `<div class="wo-split">${etable}${mtable}</div>`;
  }

  // ------------------------------------------------------------- csv --
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(res) {
    const H = ["when", "user", "upn", "external", "app", "object", "kind", "action_type", "defender_policy", "routed_by_policy", "routed_by_id", "session_id", "device", "ip"];
    return [H.join(",")].concat(res.events.map((e) => [e.when, e.name, e.upn || e.userId, e.external, e.app, e.file, e.kind, e.actionType, e.policy, e.route ? e.route.policyName : "", e.route ? e.route.policyId : "", e.sessionId, e.device, e.ip].map(csvCell).join(","))).join("\n");
  }

  // ------------------------------------------------------------ markdown --
  function toMd(res, meta = {}) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const t = res.tiles;
    const L = [`# Session controls — ${e(meta.tenant || "")}`, "", (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy("Generated") : "", "", `Window: ${e(meta.rangeLabel || `${res.days} days`)}. ${t.events} Defender session-control events${res.routesRead ? `, ${t.routed} routing sign-ins` : " (sign-in log not read)"}.`, ""];
    L.push("## At a glance", "", `- Policies with a session control: ${t.policies} (${t.appcontrol} App Control)`, `- Sessions routed to Defender: ${t.routed == null ? "not read" : `${t.routed} by ${t.routers} policies, ${t.routedUsers} users`}`, `- Blocked: ${t.blocked} (${t.blockedUsers} users) · protected ${t.protect} · step-ups ${t.stepup} · audited ${t.audit} · logins ${t.login}`, "");
    L.push("## Policies", "", "| CA | Policy | State | Session control | Routed | Blocked | Protected | Step-ups | Defender policies | Verdict |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    res.rows.forEach((r) => L.push(`| ${e(r.seq)} | ${e(r.name)} | ${STATE_LABEL[r.state]} | ${e([r.caac ? `App Control: ${r.caacLabel}` : "", ...r.others].filter(Boolean).join("; "))} | ${r.kind === "appcontrol" && res.routesRead ? r.routed : ""} | ${r.block || ""} | ${r.protect || ""} | ${r.stepup || ""} | ${e(r.mdaPolicies.join("; "))} | ${e(r.verdict)} — ${e(r.why)} |`));
    const acted = res.events.filter((x) => ["block", "protect", "stepup"].includes(x.kind));
    L.push("", `## What Defender did (${acted.length} blocked / protected / step-up)`, "", "| When | User | App | Object | Action | Defender policy | Routed by |", "| --- | --- | --- | --- | --- | --- | --- |");
    acted.forEach((x) => L.push(`| ${e(x.when)} | ${e(x.name || x.upn)} | ${e(x.app)} | ${e(x.file)} | ${e(KIND[x.kind][0])} (${e(x.actionType)}) | ${e(x.policy)} | ${x.route ? e(x.route.policyName) : res.routesRead ? "none found" : "not checked"} |`));
    if (!acted.length) L.push("| *(none)* | | | | | | |");
    L.push("", "## Defender session policies seen", "");
    res.mdaPolicies.forEach((m) => L.push(`- **${e(m.name)}** — ${m.n} events (${m.block} blocked, ${m.protect} protected, ${m.stepup} step-ups) — ${m.routers.length ? `routed by ${e(m.routers.join(", "))}` : "no CA policy routing found"}`));
    if (!res.mdaPolicies.length) L.push("*(none named in the window)*");
    L.push("", `Action types seen: ${res.actionTypes.map(([a, n]) => `${e(a || "(empty)")} ×${n}`).join(", ") || "—"}`, "", "Source: Defender advanced hunting CloudAppEvents (session / access control) via Microsoft Graph, joined to the Entra sign-in log on user, app and time (8h). Monitor only routes and logs the login only; blocks come from Defender session policies.");
    return L.join("\n");
  }

  return { query, parseEvents, policyRows, routingSignins, analyze, render, toMd, toCsv };
})();
