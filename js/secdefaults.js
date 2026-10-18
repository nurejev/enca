// ======================================================================
// 🛡 Security defaults (beta 32706) — why a tenant has no Conditional Access,
// and the way across to a baseline.
//
// Mihai, 18 Oct, a screenshot of 🧬 Baseline reading "No policies loaded.":
// "when a tenant uses security defaults nothing gets loaded? so we need to
// have a detection of that, and then offer to deploy one of the baselines".
// The read was right — a tenant on security defaults HAS no policies — but
// the screen stopped there, and the Overview's "Start from a baseline" led
// to that same dead end.
//
// Security defaults and Conditional Access are either/or. Entra accepts a
// policy in Report-only or Off while security defaults is on, and will not
// turn one On until it is off (the Entra admin center says so on the policy
// form; Microsoft Learn: "Organizations that choose to implement Conditional
// Access policies that replace security defaults must disable security
// defaults", and after disabling "should immediately enable Conditional
// Access policies"). So the way across is three steps:
//   ① deploy a baseline in Report-only   — no user impact
//   ② read what it would do (🎚 Report-only impact)
//   ③ ⇄ switch: security defaults Off, the policies that REPLACE it On, read
//      both back, in one run, so the gap is seconds — and ↩ back to
//      security defaults from the same band if it goes wrong.
// Mihai chose (mockup 18 Oct, review/2026-10-18/security-defaults): only the
// replacing set goes On at the switch, and ENCA writes the setting itself.
//
// Pure apart from read(): verdict, coverage and the HTML are functions of
// what they are handed, so tools/secdefaults.test.cjs runs them in node.
// ======================================================================
const SecDefaults = (() => {
  const PATH = "/v1.0/policies/identitySecurityDefaultsEnforcementPolicy";
  const GA = "62e90394-69f5-4237-9190-012177145e10";   // Global Administrator (role template id)
  const MFA_STRENGTH = "00000000-0000-0000-0000-000000000002";   // built-in "Multifactor authentication"
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const when = (t) => t ? new Date(t).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const STATE = { enabled: "On", enabledForReportingButNotEnforced: "Report-only", disabled: "Off" };

  // { enabled: true | false | null, at, error } — a refused read is an
  // ANSWER (null + the reason), never a guess either way.
  async function read(gget) {
    try {
      const r = await gget(PATH);
      return { enabled: r && typeof r.isEnabled === "boolean" ? r.isEnabled : null, at: Date.now(), error: r && typeof r.isEnabled === "boolean" ? null : "the setting came back without isEnabled" };
    } catch (e) {
      return { enabled: null, at: Date.now(), error: (e && e.message) || String(e) };
    }
  }

  // ---- the verdict for one tenant -------------------------------------
  //   sd-on            security defaults on, P1 present (or not readable), no policies
  //   sd-on-nop1       on, and no Entra ID P1 — Conditional Access cannot run here
  //   sd-on-policies   on, and policies exist (after step ①) — the switch band
  //   sd-off-empty     off, and no policies: nothing in Entra enforces MFA
  //   sd-unknown-empty the setting could not be read, and no policies
  //   sd-switched      off, and this browser switched it here — ↩ stays offered
  //   null             nothing to say (off with policies, the normal case)
  function verdict(o) {
    const sd = o && o.sd, n = (o && o.count) || 0, caps = o && o.caps;
    if (!sd) return null;
    if (sd.enabled === true) return n ? "sd-on-policies" : caps && caps.p1 === false ? "sd-on-nop1" : "sd-on";
    if (sd.enabled === false) return n ? (o.switched ? "sd-switched" : null) : "sd-off-empty";
    return n ? null : "sd-unknown-empty";
  }

  // ---- what security defaults does, and which policy takes each part over
  const users = (r) => (r && r.conditions && r.conditions.users) || {};
  const apps = (r) => (r && r.conditions && r.conditions.applications) || {};
  const grant = (r) => (r && r.grantControls) || {};
  const has = (a, v) => Array.isArray(a) && a.includes(v);
  const isBlock = (r) => has(grant(r).builtInControls, "block");
  // MFA, alone or with every other control required — "MFA OR a compliant
  // device" is weaker than security defaults and does not count
  function asksMfa(r) {
    const g = grant(r);
    if (isBlock(r)) return false;
    const mfa = has(g.builtInControls, "mfa") || !!(g.authenticationStrength && (g.authenticationStrength.id || g.authenticationStrength.displayName));
    const others = (g.builtInControls || []).filter((c) => c !== "mfa");
    return mfa && (String(g.operator || "OR").toUpperCase() === "AND" || !others.length);
  }
  // conditions that make a policy reach LESS than security defaults does
  function narrowed(r) {
    const c = (r && r.conditions) || {};
    const loc = c.locations, plat = c.platforms;
    if (loc && ((loc.includeLocations || []).some((x) => x !== "All") || (loc.excludeLocations || []).length)) return "a location condition";
    if (plat && ((plat.includePlatforms || []).some((x) => x !== "all") || (plat.excludePlatforms || []).length)) return "a platform condition";
    if (c.devices && c.devices.deviceFilter) return "a device filter";
    if ((c.userRiskLevels || []).length || (c.signInRiskLevels || []).length) return "a risk condition";
    if ((c.clientAppTypes || []).length && !has(c.clientAppTypes, "all") && c.clientAppTypes.length < 4) return "a client-app condition";
    return null;
  }
  // authenticationFlows.transferMethods is ONE string, comma-separated
  // ("deviceCodeFlow,authenticationTransfer"), not an array
  const transfers = (r) => String((((r && r.conditions) || {}).authenticationFlows || {}).transferMethods || "").split(",").map((x) => x.trim()).filter(Boolean);
  const allUsers = (r) => has(users(r).includeUsers, "All");
  const allApps = (r) => has(apps(r).includeApplications, "All");
  const PROTECTIONS = [
    { key: "mfaAll", label: "MFA for every user", sd: "Security defaults asks every user for MFA when Microsoft decides it is needed, and makes them register for it.",
      test: (r) => allUsers(r) && allApps(r) && asksMfa(r) && !narrowed(r) },
    { key: "mfaAdmins", label: "MFA for admins, every sign-in", sd: "Security defaults asks the privileged roles for MFA on every sign-in.",
      test: (r) => has(users(r).includeRoles, GA) && (allApps(r) || has(apps(r).includeApplications, "MicrosoftAdminPortals")) && asksMfa(r) && !narrowed(r) },
    { key: "legacy", label: "Block legacy authentication", sd: "Security defaults blocks every sign-in by a legacy protocol (Exchange ActiveSync basic, IMAP, POP, SMTP AUTH).",
      test: (r) => allUsers(r) && allApps(r) && isBlock(r) && has(r.conditions && r.conditions.clientAppTypes, "exchangeActiveSync") && has(r.conditions && r.conditions.clientAppTypes, "other") },
    { key: "deviceCode", label: "Block device code flow", sd: "Security defaults blocks the device code flow.",
      test: (r) => allUsers(r) && isBlock(r) && transfers(r).includes("deviceCodeFlow") },
  ];

  // vms: the app's view models ({ id, name, state, raw, users:{exc} }).
  // opts.breakGlass: the active catalog's break-glass group name;
  // opts.bgMembers: its member count once read (null = not read, -1 = no such group).
  function coverage(vms, opts) {
    const o = opts || {};
    const list = (vms || []).filter((p) => p && p.raw);
    const items = PROTECTIONS.map((pr) => {
      const hits = list.filter((p) => { try { return pr.test(p.raw); } catch { return false; } });
      return { key: pr.key, label: pr.label, sd: pr.sd, ok: hits.length > 0,
        // a strength other than the built-in "Multifactor authentication" one
        // (which is MFA by another name) asks for methods security defaults never did
        policies: hits.map((p) => { const st = grant(p.raw).authenticationStrength; return { id: p.id, name: p.name, state: p.raw.state, strength: !!st && st.id !== MFA_STRENGTH }; }) };
    });
    const seen = new Set();
    const set = [];
    for (const it of items) for (const p of it.policies) if (!seen.has(p.id)) { seen.add(p.id); set.push(p); }
    const toOn = set.filter((p) => p.state !== "enabled");
    // Break-glass: the group exists, has members, and every policy going On
    // excludes it. A switch that turns on MFA for all users without the
    // emergency accounts carved out is the lockout security defaults never had.
    const bg = String(o.breakGlass || "").trim();
    const exNames = (id) => {
      const p = list.find((x) => x.id === id);
      return ((p && p.users && p.users.exc) || []).map((x) => String(x).replace(/\s*\((group|user)\)$/i, "").toLowerCase());
    };
    const missingIn = bg ? set.filter((p) => !exNames(p.id).includes(bg.toLowerCase())).map((p) => p.name) : [];
    const members = o.bgMembers;
    const bgOk = !!bg && !missingIn.length && typeof members === "number" && members > 0;
    const bgItem = { key: "breakGlass", label: "Break-glass excluded", ok: bgOk, group: bg || null, members: members == null ? null : members, missingIn,
      why: !bg ? "this baseline names no break-glass group" : missingIn.length ? `not excluded by ${missingIn.join(", ")}` : members == null ? "its members are being read" : members === -1 ? "the group does not exist in this tenant" : members === -2 ? "its members could not be read — ⟳ Refresh to try again" : members === 0 ? "the group has no members — add the emergency accounts first" : null };
    const strengthOn = toOn.filter((p) => p.strength);
    return { items, breakGlass: bgItem, set, toOn, strengthOn, ready: items.every((i) => i.ok) && bgOk && toOn.length > 0 };
  }

  // ---- HTML ------------------------------------------------------------
  const fact = (cls, html) => `<span class="sd-fact${cls ? " " + cls : ""}">${html}</span>`;
  function facts(ctx) {
    const sd = ctx.sd || {}, caps = ctx.caps || {};
    const sdF = sd.enabled === true ? fact("warn", "Security defaults: ON") : sd.enabled === false ? fact(ctx.count ? "" : "bad", "Security defaults: OFF") : fact("", `Security defaults: not known${sd.error ? ` <span class="muted">(${esc(String(sd.error).slice(0, 80))})</span>` : ""}`);
    const p1 = caps.p1 === true ? fact("ok", "Entra ID P1 ✓") : caps.p1 === false ? fact("bad", "Entra ID P1 — not present") : fact("", "Entra ID P1 — not readable");
    const p2 = caps.p2 === true ? fact("ok", "Entra ID P2 ✓") : caps.p2 === false ? fact("", "Entra ID P2 — not present") : "";
    return `<div class="sd-facts">${sdF}${p1}${p2}${fact("", `Conditional Access policies: ${ctx.count || 0}`)}</div>`;
  }
  const steps = (at) => `<div class="sd-steps">
      <div class="sd-step${at === 1 ? " now" : ""}"><b><span class="sd-n">1</span>Deploy a baseline in Report-only</b><p>The whole catalog, its groups created by name, every policy Report-only.</p><span class="sd-imp none">No user impact · recovery: delete what the import created (its report lists it)</span></div>
      <div class="sd-step${at === 2 ? " now" : ""}"><b><span class="sd-n">2</span>Read what it would do</b><p>🎚 Report-only impact over a week or more of sign-ins: who would be prompted, who would be blocked.</p><span class="sd-imp none">Read-only</span></div>
      <div class="sd-step${at === 3 ? " now" : ""}"><b><span class="sd-n">3</span>⇄ Switch from security defaults</b><p>One run: security defaults Off → the policies that replace it On → both read back.</p><span class="sd-imp some">Enforcement moves to Conditional Access · recovery: ↩ Back to security defaults</span></div>
    </div>`;
  // ctx.catalogs: [{ id, label, release, total, source, skipped }]
  function choose(ctx, disabled) {
    const cards = (ctx.catalogs || []).map((c) => `<div class="sd-bcard">
        ${c.id === "limonit" ? '<span class="sd-rec">default</span>' : ""}
        <h4>${esc(c.icon || "🧬")} ${esc(c.label)}</h4>
        <div class="mini muted">${esc(c.release || "")} · ${c.total} policies${c.id === "joey" ? " · read live from GitHub" : " · from your baseline backup ZIP"}</div>
        <ul class="mini">${(c.points || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <button class="btn lemon" data-sdpick="${esc(c.id)}"${disabled ? " disabled" : ""}>${c.id === "joey" ? "⟳ Fetch latest — deploy in Report-only →" : "📥 Choose ZIP — deploy in Report-only →"}</button>
      </div>`).join("");
    return `<div class="sd-choose-h"><b>Choose the baseline to deploy</b></div><div class="sd-choose">${cards}</div>
      <p class="mini muted" style="margin:8px 0 0">Both open 📥 Import with the catalog ticked and new policies landing <b>Report-only</b> — On is not offered while security defaults is on. The licence check every import runs decides what is held back. Joey Verlinden's baseline brings the six shared 🚨 E-Admins policies along, created from ENCA's own copy.</p>`;
  }

  // The card for a tenant with NO policies (the screenshot's case).
  function startCard(kind, ctx) {
    const c = ctx || {};
    const head = `<div class="mini muted">Read with the policies${c.at ? ` · ${esc(when(c.at))}` : ""}${c.tenantName ? ` · ${esc(c.tenantName)}` : ""}${c.demo ? " · demo" : ""}</div>${facts(c)}`;
    if (kind === "sd-on") return `<div class="list-card sd-card">
        <h3>🛡 This tenant runs on security defaults — that is why there are no Conditional Access policies</h3>${head}
        <p class="mini" style="margin:8px 0 0">Security defaults and Conditional Access are either/or. Entra accepts new policies in <b>Report-only</b> while security defaults is on, but will not turn one <b>On</b> until it is off. So the way across is three steps, and nothing changes for users until step ③.</p>
        ${steps(1)}${choose(c)}
      </div>`;
    if (kind === "sd-on-nop1") return `<div class="list-card sd-card">
        <h3>🛡 This tenant runs on security defaults — and has no Entra ID P1</h3>${head}
        <p class="mini" style="margin:8px 0 0">Security defaults is the right protection here: Conditional Access needs Entra ID P1 (Microsoft 365 Business Premium, E3 and E5 include it). The table below is a <b>preview</b> — every baseline policy is Missing — so you can see what a licence would bring. Deploying stays off until P1 is present; ⟳ Refresh reads the licences again.</p>
        ${choose(c, true)}
      </div>`;
    if (kind === "sd-off-empty") return `<div class="list-card sd-card bad">
        <h3>⚠ Nothing in Entra enforces MFA in this tenant</h3>${head}
        <p class="mini" style="margin:8px 0 0">Security defaults is off and there are no Conditional Access policies — per-user MFA aside, which ENCA does not read. Two ways out: turn security defaults back on now, as a stopgap that protects everyone today, or deploy a baseline (Report-only first, then switch it on).</p>
        <div class="row" style="justify-content:flex-start;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" data-sdturnon>Turn security defaults on…</button></div>
        ${choose(c, c.caps && c.caps.p1 === false)}
      </div>`;
    if (kind === "sd-unknown-empty") return `<div class="list-card sd-card">
        <h3>0 Conditional Access policies — and the security defaults setting could not be read</h3>${head}
        <p class="mini" style="margin:8px 0 0">ENCA does not guess: the read was refused (Policy.Read.All not consented, or a role that may not read it), so whether security defaults protects this tenant is not known. The catalog is shown as Missing below, and the baselines are offered — the licence check every import runs is the guard.</p>
        <div class="row" style="justify-content:flex-start;gap:8px;margin-top:10px"><button class="btn" data-sdread>⟳ Read again</button></div>
        ${choose(c, c.caps && c.caps.p1 === false)}
      </div>`;
    return "";
  }

  // The band for a tenant that has policies AND security defaults on (after
  // step ①), or that this browser switched (↩ stays offered).
  function band(kind, cov, ctx) {
    const c = ctx || {};
    if (kind === "sd-switched") {
      const r = c.switched || {};
      return `<div class="sd-band ok"><h3>⇄ Switched from security defaults${r.at ? ` on ${esc(when(r.at))}` : ""}</h3>
        <p class="mini" style="margin:0 0 8px">${(r.policies || []).length} ${(r.policies || []).length === 1 ? "policy" : "policies"} went On in that run: ${esc((r.policies || []).map((p) => p.name).join(", "))}. Conditional Access protects the tenant now. If sign-ins broke, ↩ puts those policies back to the state they had and security defaults back on.</p>
        <div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="btn" data-sdback>↩ Back to security defaults…</button><button class="btn" data-sddone>✓ Keep Conditional Access — hide this</button></div></div>`;
    }
    if (kind !== "sd-on-policies" || !cov) return "";
    const nRO = (c.reportOnly || 0), nOff = (c.off || 0);
    const cell = (it) => `<div class="sd-cv"><span class="k ${it.ok ? "ok" : "no"}">${it.ok ? "✓" : "✗"} ${esc(it.label)}</span><small>${it.ok
      ? esc(it.policies.map((p) => `${(String(p.name).match(/CA\d{3,4}/) || [p.name])[0]} · ${STATE[p.state] || p.state}`).join(", "))
      : "no policy here does this yet — deploy it with the baseline"}</small></div>`;
    const bg = cov.breakGlass;
    const bgCell = `<div class="sd-cv"><span class="k ${bg.ok ? "ok" : "no"}">${bg.ok ? "✓" : "✗"} ${esc(bg.label)}</span><small>${bg.group ? `${esc(bg.group)}${typeof bg.members === "number" && bg.members >= 0 ? ` · ${bg.members} member${bg.members === 1 ? "" : "s"}` : ""}` : ""}${bg.why ? ` — ${esc(bg.why)}` : ""}</small></div>`;
    const imp = c.impact ? `<div class="sd-cv"><span class="k ok">✓ Report-only impact</span><small>read ${esc(when(c.impact.readAt))} · ${c.impact.blockedUsers} would be blocked, ${c.impact.promptedUsers} prompted</small></div>`
      : `<div class="sd-cv"><span class="k warn">! Report-only impact</span><small>not read in this session — a warning, not a gate</small></div>`;
    return `<div class="sd-band">
      <h3>Security defaults is still ON — ${nRO + nOff} ${nRO + nOff === 1 ? "policy is" : "policies are"} ${nRO && nOff ? "Report-only or Off" : nOff ? "Off" : "Report-only"} and cannot be turned On until it is off</h3>
      <div class="mini">What security defaults does for this tenant today, and the policy here that takes over each part:</div>
      <div class="sd-cover">${cov.items.map(cell).join("")}${bgCell}${imp}</div>
      <div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn primary" data-sdswitch${cov.ready ? "" : " disabled"}>⇄ Switch from security defaults…</button>
        <button class="btn" data-sdimpact>🎚 Read report-only impact</button>
        <span class="mini muted">${cov.ready ? `${cov.toOn.length} ${cov.toOn.length === 1 ? "policy goes" : "policies go"} On; the rest stay as they are for the normal rollout.` : "The switch stays off until every ✗ above is ✓."}</span>
      </div></div>`;
  }

  // The confirmation for ⇄ — impact and recovery before anything is written.
  function switchBody(cov, ctx) {
    const c = ctx || {};
    const rows = cov.toOn.map((p, i) => `<label class="chk" style="display:flex;margin:3px 0"><input type="checkbox" data-sdpol="${i}" checked> <span>${esc(p.name)} <span class="mini muted">· ${esc(STATE[p.state] || p.state)} → On</span>${p.strength ? ' <span class="tag block" title="An authentication strength: the admin must have one of its methods registered">strength</span>' : ""}</span></label>`).join("");
    const strong = cov.strengthOn.length ? `<div class="danger-note" style="margin:8px 0">🔑 <b>${cov.strengthOn.length} of these ${cov.strengthOn.length === 1 ? "requires" : "require"} an authentication strength</b> (${esc(cov.strengthOn.map((p) => (String(p.name).match(/CA\d{3,4}/) || [p.name])[0]).join(", "))}). Under security defaults the Authenticator app was enough; these ask for the methods the strength names — for the CloudFellows admin policies a passkey, Windows Hello for Business, a FIDO2 key or a Temporary Access Pass. Make sure every admin — <b>you included</b> — has one registered, or untick them: ${esc((cov.items.find((i) => i.key === "mfaAll") || { policies: [] }).policies.map((p) => (String(p.name).match(/CA\d{3,4}/) || [p.name])[0]).join(", ") || "the MFA-for-everyone policy")} still asks admins for MFA.</div>` : "";
    return `<p class="mini muted" style="margin:0 0 10px">Tenant: <b>${esc(c.tenantName || "")}</b>${c.demo ? " · demo — simulated" : ""}</p>
      <h4 class="sd-h4">Which policies go On</h4>
      <p class="mini" style="margin:0 0 4px">The ones that replace security defaults. Everything else stays as it is, for the normal report-only → On rollout.</p>
      ${rows}${strong}
      <h4 class="sd-h4">What happens, in this order</h4>
      <ol class="mini" style="margin:0;padding-left:20px">
        <li><b>Security defaults → Off</b>, read back until Entra says so</li>
        <li><b>The ticked policies → On</b>, one by one, each read back</li>
        <li><b>Security defaults read back once more</b></li>
      </ol>
      <h4 class="sd-h4">Impact</h4>
      <div class="sd-box warn mini">Between step 1 and the end of step 2 nothing enforces MFA — seconds; sign-ins that already hold a token are unaffected. From then on Conditional Access decides: users are prompted by these policies instead of by security defaults, and legacy-authentication and device-code sign-ins stay blocked. A policy that fails in step 2 does not stop the others: the run turns on as much protection as it can and names what failed.</div>
      <h4 class="sd-h4">If it goes wrong</h4>
      <div class="sd-box ok mini"><b>↩ Back to security defaults</b> puts the policies this run turned On back to the state they had, turns security defaults on, and reads both back. If Entra refuses security defaults, those policies are switched On again at once, so the tenant is never left with neither. It stays on the band, in this browser, until you hide it.</div>
      <h4 class="sd-h4">Needs</h4>
      <p class="mini" style="margin:0">Conditional Access Administrator or higher · consent for Policy.ReadWrite.ConditionalAccess, asked at the click, before the first write.</p>`;
  }
  function backBody(rec, ctx) {
    const c = ctx || {};
    return `<p class="mini muted" style="margin:0 0 10px">Tenant: <b>${esc(c.tenantName || "")}</b>${c.demo ? " · demo — simulated" : ""}</p>
      <h4 class="sd-h4">What happens, in this order</h4>
      <ol class="mini" style="margin:0;padding-left:20px">
        <li><b>${(rec.policies || []).length} ${(rec.policies || []).length === 1 ? "policy goes" : "policies go"} back</b> to the state they had before the switch — ${esc((rec.policies || []).map((p) => `${p.name} → ${STATE[p.prev] || p.prev}`).join("; "))}</li>
        <li><b>Security defaults → On</b>, read back</li>
      </ol>
      <h4 class="sd-h4">Impact</h4>
      <div class="sd-box warn mini">Security defaults takes over again: MFA for everyone as Microsoft decides, registration within 14 days, legacy authentication blocked. Any other policy that is On keeps Entra from accepting security defaults — the run then puts these policies back On at once and says so.</div>`;
  }
  function turnOnBody(ctx) {
    const c = ctx || {};
    return `<p class="mini muted" style="margin:0 0 10px">Tenant: <b>${esc(c.tenantName || "")}</b>${c.demo ? " · demo — simulated" : ""}</p>
      <h4 class="sd-h4">Impact</h4>
      <div class="sd-box warn mini">From the next sign-in: legacy authentication (IMAP, POP, SMTP AUTH, Exchange ActiveSync basic) and the device code flow are blocked, admins are asked for MFA every time, and every user must register the Microsoft Authenticator app within 14 days. Mail clients and scanners that still use basic authentication stop working.</div>
      <h4 class="sd-h4">If it goes wrong</h4>
      <div class="sd-box ok mini">Entra ID → Overview → Properties → Manage security defaults → Disabled, or deploy a baseline and ⇄ switch, which turns it off again in the same run.</div>`;
  }

  // ---- the demo tenant after step ① (?demo=sdro) ------------------------
  // The five CloudFellows policies that replace security defaults plus two
  // that do not, all Report-only, the break-glass group excluded — enough
  // for the band, the switch and ↩ to be walked without a tenant.
  const MFA = { id: "00000000-0000-0000-0000-000000000002", displayName: "Multifactor authentication" };
  const PR = { id: "sd-demo-prtap", displayName: "Phishing-resistant MFA + TAP" };
  const DEMO_NAMES = { "sd-demo-bg": "CAB-SEC-U-BreakGlass", "sd-demo-adm": "CAB-SEC-U-Persona-Admins", "sd-demo-int": "CAB-SEC-U-Persona-Internals", [GA]: "Global Administrator", "sd-demo-prtap": "Phishing-resistant MFA + TAP" };
  function demoPolicies() {
    const ro = "enabledForReportingButNotEnforced";
    const pol = (n, displayName, users, extra, grantControls) => ({ id: `sd-demo-${n}`, displayName, state: ro, createdDateTime: "2026-10-18T08:00:00Z", modifiedDateTime: "2026-10-18T08:00:00Z",
      conditions: { clientAppTypes: ["all"], applications: { includeApplications: ["All"], excludeApplications: [] },
        users: { includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: ["sd-demo-bg"], includeRoles: [], excludeRoles: [], ...users }, ...(extra || {}) },
      grantControls, sessionControls: null });
    const block = { operator: "OR", builtInControls: ["block"] };
    return [
      pol("000", "CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3", { includeUsers: ["All"], excludeGroups: ["sd-demo-bg", "sd-demo-adm", "sd-demo-int"] }, null, { operator: "OR", builtInControls: [], authenticationStrength: MFA }),
      pol("002", "CA002-BLOCK-Global-IP-AnyApp-AnyPlatform-LegacyAuthentication-v1.0.1", { includeUsers: ["All"] }, { clientAppTypes: ["exchangeActiveSync", "other"] }, block),
      pol("004", "CA004-BLOCK-Global-IP-AnyApp-AnyPlatform-DeviceCode-v1.0.2", { includeUsers: ["All"] }, { authenticationFlows: { transferMethods: "deviceCodeFlow" } }, block),
      pol("100", "CA100-GRANT-Admins-IP-AdminPortals-AnyPlatform-MFA-v1.0.3", { includeRoles: [GA] }, { applications: { includeApplications: ["MicrosoftAdminPortals"], excludeApplications: [] } }, { operator: "OR", builtInControls: [], authenticationStrength: PR }),
      pol("101", "CA101-GRANT-Admins-IP-AnyApp-AnyPlatform-MFA-v1.2.1", { includeGroups: ["sd-demo-adm"] }, null, { operator: "OR", builtInControls: [], authenticationStrength: PR }),
      pol("200", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", { includeGroups: ["sd-demo-int"] }, null, { operator: "OR", builtInControls: ["mfa"] }),
    ];
  }

  return { PATH, read, verdict, coverage, asksMfa, narrowed, PROTECTIONS, startCard, band, switchBody, backBody, turnOnBody, STATE, DEMO_NAMES, demoPolicies };
})();
