// ======================================================================
// What-If FLOWCHARTS — the two descriptive views of "what happens", drawn
// from the view model with no scenario and no tenant read:
//
//   policyFlow(vm)          a per-policy flow: who is in scope, what has to be
//                           true, the controls that then apply, the outcome.
//                           Shown on demand from the policy card.
//   personaFlow(key, vms)   the same for a whole persona, with the Global
//                           policies that reach it and the exclusions that
//                           drop one out of the flow.
//
// The SIMULATOR is not here. Evaluating a scenario against the policy set is
// js/whatifeval.js (WhatIfEval.evaluate), which 🧪 What-If, ⚖ Compare users and
// 🫥 Apps with no service principal all call. This module draws pictures; that
// one decides verdicts. Keeping the two apart is deliberate — see the note at
// the bottom of the file for the fork that used to sit here.
//
// Read-only, pure over its inputs, no Graph and no storage.
// ======================================================================
const WhatIf = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---- 1. per-policy flow (from the view model) -------------------------
  // A vertical flow: Sign-in → in scope? → conditions gates → controls →
  // outcome. Each stage lists the exact assignment so the card doubles as an
  // explanation of the policy's logic.
  function stage(kind, title, body) {
    return `<div class="wf-stage wf-${kind}">
      <div class="wf-stage-h">${title}</div>
      <div class="wf-stage-b">${body}</div>
    </div>`;
  }
  const arrow = (label) => `<div class="wf-arrow">${label ? `<span>${esc(label)}</span>` : ""}▼</div>`;
  const chips = (arr, cls) => (arr && arr.length)
    ? arr.map((x) => `<span class="wf-chip ${cls || ""}">${esc(x)}</span>`).join("")
    : `<span class="wf-chip muted">—</span>`;

  function policyFlow(vm) {
    const c = vm.cond || {};
    const disabled = vm.state === "off";
    const gates = [];
    if (c.platforms?.length) gates.push(`Device platform is ${c.platforms.join(" / ")}${c.platformsExc?.length ? ` (not ${c.platformsExc.join(", ")})` : ""}`);
    if (c.clientApps?.length) gates.push(`Client app is ${c.clientApps.join(" / ")}`);
    (c.risks || []).forEach((r) => gates.push(r));
    if (c.devFilter) gates.push(`Device filter (${c.devFilter.mode}): ${c.devFilter.rule}`);
    if (c.authFlows?.length) gates.push(`Auth flow: ${c.authFlows.join(", ")}`);
    if (c.insider?.length) gates.push(`Insider risk: ${c.insider.join(", ")}`);
    const netScoped = !(vm.net.inc.length === 1 && /any network/i.test(vm.net.inc[0])) || vm.net.exc.length;
    if (netScoped) gates.push(`Location: ${vm.net.inc.join(", ")}${vm.net.exc.length ? ` (excl. ${vm.net.exc.join(", ")})` : ""}`);

    const isBlock = vm.grant.mode === "block";
    const outcome = isBlock
      ? `<div class="wf-outcome block">⛔ Access blocked</div>`
      : vm.grant.controls.length === 1 && /^no controls/i.test(vm.grant.controls[0])
        ? `<div class="wf-outcome allow">✅ Access granted${vm.session.length ? " (with session controls)" : ""}</div>`
        : `<div class="wf-outcome grant">✅ Access granted only if the ${vm.grant.op === "OR" ? "user satisfies one" : "user satisfies all"} of the controls above</div>`;

    // The concluding CA RESULT: the flow above is the policy's logic — this is
    // what the sign-in actually experiences in the tenant, which also depends
    // on the policy STATE (a report-only or Off policy changes nothing today).
    const ctl = (vm.grant.controls || []).filter((x) => !/^no controls/i.test(x));
    const sess = (vm.session || []).map((s) => s.t);
    const verdict = isBlock
      ? `<b>Sign-in denied.</b> No control can satisfy a block — the user does not get in under these conditions.`
      : ctl.length
        ? `<b>Sign-in succeeds only after ${vm.grant.op === "OR" && ctl.length > 1 ? "one of" : "all of"}:</b> ${ctl.map(esc).join(" · ")}.${sess.length ? ` Session shaped by: ${sess.map(esc).join(", ")}.` : ""}`
        : sess.length
          ? `<b>Sign-in succeeds.</b> No grant controls — the session is shaped by: ${sess.map(esc).join(", ")}.`
          : `<b>Sign-in succeeds.</b> The policy applies but imposes no controls.`;
    const reality = vm.state === "on"
      ? `<span class="wf-res-state on">Enforced (On)</span> — this is the real outcome in the tenant today.`
      : vm.state === "report"
        ? `<span class="wf-res-state ro">Report-only</span> — the sign-in is <b>not</b> affected today; Entra only records that this <i>would</i> have been the outcome.`
        : `<span class="wf-res-state off">Off</span> — the sign-in is <b>not</b> affected today; this becomes the outcome the moment the policy is switched On.`;
    const caResult = `<div class="wf-result ${isBlock ? "block" : "grant"}">
      <div class="wf-result-t">🎯 CA result</div>
      <div>${verdict}</div>
      <div class="wf-mut" style="margin-top:6px">${reality}</div>
    </div>`;

    return `<div class="wf-flow">
      ${disabled ? `<div class="wf-note">This policy is <b>Off</b> — it is evaluated here as if enabled, but in the tenant it does not apply.</div>` : ""}
      ${stage("start", "① A user signs in", `to <b>${esc(vm.apps.inc.join(", "))}</b>${vm.apps.exc.length ? ` <span class="wf-mut">(except ${esc(vm.apps.exc.join(", "))})</span>` : ""}`)}
      ${arrow("")}
      ${stage("scope", "② Is the user in scope?", `
        <div class="wf-row"><span class="wf-lbl in">Included</span> ${chips(vm.users.inc, "in")}</div>
        ${vm.users.exc.length ? `<div class="wf-row"><span class="wf-lbl ex">Excluded</span> ${chips(vm.users.exc, "ex")}</div>` : ""}
        <div class="wf-hint">In scope only when included <b>and not</b> excluded.</div>`)}
      ${arrow("in scope")}
      ${gates.length ? stage("cond", "③ Do all conditions match?", `<div class="wf-gates">${gates.map((g) => `<div class="wf-gate">◆ ${esc(g)}</div>`).join("")}</div>
        <div class="wf-hint">The policy triggers only when every condition is met.</div>`) + arrow("all match") : ""}
      ${stage(isBlock ? "block" : "grant", isBlock ? "⛔ Access controls — Block" : "✅ Access controls — Grant", isBlock
        ? `<div class="wf-mut">Block access — no controls can satisfy it.</div>`
        : `${vm.grant.controls.map((g) => `<div class="wf-ctrl">${esc(g)}</div>`).join("")}
           ${vm.grant.op ? `<div class="wf-hint">Require <b>${vm.grant.op === "OR" ? "one" : "all"}</b> of these.</div>` : ""}`)}
      ${vm.session.length ? arrow("") + stage("session", "⏱ Session controls", vm.session.map((s) => `<div class="wf-ctrl">${esc(s.t)}</div>`).join("")) : ""}
      ${arrow("")}
      ${outcome}
      ${caResult}
    </div>`;
  }

  // ---- persona apply flow ------------------------------------------------
  // What a sign-in for one persona experiences: the persona's own policies PLUS
  // the Global policies (CA000–099), which target everyone and so apply to every
  // persona. Built from the view models (no Graph calls) using the CA-number
  // range as the persona identity — the same convention the rest of the app uses.
  // The group(s) that represent a persona, matched against a policy's exclusions
  // so a Global policy that excludes this persona is not counted as applying.
  // Normalised (letters/digits only) so "GuestUsers" matches "Guest users".
  const EXCL_NEEDLES = {
    100: ["personaadmins"], 200: ["personainternals"], 300: ["personaexternals"],
    400: ["personaguestusers"], 500: ["personaguestadmins"],
    600: ["personamicrosoft365serviceaccounts"], 700: ["personaazureserviceaccounts"],
    800: ["personacorpserviceaccounts"], 900: ["personaworkloadidentities", "agent"],
    1000: ["personadevops"], 1100: ["breakglass", "emergencyaccess"],
  };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Does this policy exclude the given persona (by its group in the exclude list)?
  function excludesPersona(vm, key) {
    const needles = EXCL_NEEDLES[key]; if (!needles) return false;
    const exc = (vm.users && vm.users.exc) || [];
    return exc.some((e) => { const n = norm(e); return needles.some((x) => n.includes(x)); });
  }

  function personaFlow(key, vms, label) {
    const groupKey = (vm) => { try { return Render.caGroup(vm.name).key; } catch { return 99999; } };
    const persona = vms.filter((v) => groupKey(v) === key);
    // Global policies apply to everyone EXCEPT the personas they exclude, so a
    // Global policy excluding this persona's group does not apply to it.
    const allGlobal = key === 0 ? [] : vms.filter((v) => groupKey(v) === 0);
    const global = allGlobal.filter((v) => !excludesPersona(v, key));
    const globalExcluded = allGlobal.filter((v) => excludesPersona(v, key));

    const stateRank = (s) => (s === "on" ? 0 : s === "report" ? 1 : 2);
    const sortByCa = (a, b) => (Render.caGroup(a.name).num ?? 1e9) - (Render.caGroup(b.name).num ?? 1e9);

    // combined effect from the ENFORCING (On) policies across both sets
    const enforcing = [...global, ...persona].filter((v) => v.state === "on");
    const grant = new Set(); let block = false; const blockers = []; const session = new Set();
    for (const v of enforcing) {
      if (v.grant.mode === "block") { block = true; blockers.push(v.name); }
      else (v.grant.controls || []).forEach((c) => { if (!/^no controls/i.test(c)) grant.add(c); });
      (v.session || []).forEach((s) => session.add(s.t));
    }
    const reportOnly = [...global, ...persona].filter((v) => v.state === "report").length;
    const off = [...global, ...persona].filter((v) => v.state === "off").length;

    const polRow = (v) => {
      const st = v.state === "on" ? "on" : v.state === "report" ? "ro" : "off";
      const ctl = v.grant.mode === "block" ? "⛔ Block"
        : (v.grant.controls || []).filter((c) => !/^no controls/i.test(c)).join(", ")
          || (v.session.length ? v.session.map((s) => s.t).join(", ") : "no controls");
      return `<div class="wf-pol ${v.state === "off" ? "off" : "on"}">
        <div class="wf-pol-h"><span class="wf-dot ${st}"></span>
          <b class="pol-link" data-pol="${esc(v.name)}">${esc(v.name)}</b>
          ${v.state === "report" ? '<span class="wf-chip ro">report-only</span>' : v.state === "off" ? '<span class="wf-chip muted">Off</span>' : ""}</div>
        <div class="wf-pol-why">${esc(ctl)}</div>
      </div>`;
    };
    const section = (title, arr, note) => `<h4 class="wf-colh">${title} (${arr.length})</h4>
      ${note ? `<p class="wf-mut" style="margin:0 0 6px">${note}</p>` : ""}
      ${arr.length ? arr.slice().sort((a, b) => stateRank(a.state) - stateRank(b.state) || sortByCa(a, b)).map(polRow).join("") : '<p class="wf-mut">None.</p>'}`;

    const outcome = block
      ? `<div class="wf-outcome block">⛔ A ${esc(label)} sign-in can be <b>blocked</b><div class="wf-blockers">${blockers.map((b) => `<span class="wf-blk pol-link" data-pol="${esc(b)}">${esc(b)}</span>`).join("")}</div></div>`
      : grant.size
        ? `<div class="wf-outcome grant">✅ A ${esc(label)} sign-in is <b>granted</b> after satisfying:<div class="wf-blockers">${[...grant].map((g) => `<span class="wf-blk">${esc(g)}</span>`).join("")}</div></div>`
        : enforcing.length
          ? `<div class="wf-outcome allow">✅ Granted with no extra controls${session.size ? " (session controls apply)" : ""}</div>`
          : `<div class="wf-outcome none">— No enforcing (On) policy applies to ${esc(label)} yet${off ? ` — ${off} are staged Off` : ""}</div>`;

    return `<div class="wf-sim">
      <div class="wf-sub">Effect of Conditional Access on a <b>${esc(label)}</b> sign-in
        <span class="wf-mut">· ${persona.length} persona ${persona.length === 1 ? "policy" : "policies"}${global.length ? ` + ${global.length} Global` : ""}</span></div>
      ${outcome}
      <div class="wf-notes">
        ${session.size ? `<div><span class="wf-nk">Session</span> ${[...session].map(esc).join(", ")}</div>` : ""}
        ${reportOnly ? `<div><span class="wf-nk">Report-only</span> ${reportOnly} polic${reportOnly === 1 ? "y" : "ies"} evaluated but not enforced.</div>` : ""}
        ${off ? `<div><span class="wf-nk">Staged Off</span> ${off} polic${off === 1 ? "y" : "ies"} deployed but disabled — not applying yet.</div>` : ""}
      </div>
      <div class="wf-cols">
        <div>${section(`🌐 Global — applies to this persona`, global, key === 0 ? "" : "Target all users and do not exclude this persona.")}
          ${globalExcluded.length ? `<h4 class="wf-colh" style="margin-top:12px">🚫 Global — excluded for this persona (${globalExcluded.length})</h4>
            <p class="wf-mut" style="margin:0 0 6px">These target everyone but exclude this persona's group, so they do <b>not</b> apply.</p>
            ${globalExcluded.slice().sort(sortByCa).map((v) => `<div class="wf-pol off"><div class="wf-pol-h"><span class="wf-dot off"></span><b class="pol-link" data-pol="${esc(v.name)}">${esc(v.name)}</b> <span class="wf-chip ex">excluded</span></div></div>`).join("")}` : ""}</div>
        <div>${section(`This persona`, persona)}</div>
      </div>
    </div>`;
  }

  // WHAT USED TO BE HERE, and why it is gone (25344). This module also held a
  // second scenario simulator — resolveSubject / evalPolicy / simulate /
  // renderSim, about 190 lines — written before js/whatifeval.js existed. It
  // had NO CALLERS: 🧪 What-If evaluates through WhatIfEval.evaluate, and so do
  // ⚖ Compare users and 🫥 Apps with no service principal. Only policyFlow and
  // personaFlow above were ever reached from app.js.
  //
  // Dead code that answers a question the app answers elsewhere is worse than
  // no code: it reads as authoritative, it drifts (WhatIfEval has since learnt
  // user actions, authentication contexts, insider risk, authentication flows
  // and device filters that this copy never knew), and it is what made the
  // consolidation review count THREE policy evaluators in ENCA when there has
  // only ever been one in use. If a second simulator is ever wanted, it starts
  // from WhatIfEval, not from a fork of it.

  return { policyFlow, personaFlow };
})();
