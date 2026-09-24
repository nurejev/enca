// ======================================================================
// 🎫 CAE & token protection — coverage, per persona (R21, T46, beta 32404).
//
// Continuous access evaluation and token protection are the two newer
// session controls, and both are easy to leave half-done. 📘 Microsoft Learn
// already judges each token protection POLICY (apps, platforms, device
// filter) and each CAE-disabled policy, with fixes. What nothing showed is
// COVERAGE: which personas have token protection at all, on which of the
// resources that support it, where CAE is customised — the same treatment
// the persona × control matrix gives the classic grant controls.
//
// Pure: the policies loaded now in, a model out. Findings that 📘 already
// raises are not raised again — they are counted per policy and pointed at.
//
//   TokenCov.analyze(raws, { caGroup, learn })   learn = MSLearn.run findings
//   TokenCov.render(m, { filter }) / chips(m, filter) / toMd(m, tenant)
// ======================================================================
const TokenCov = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  // What token protection can protect — MS Learn, concept-token-protection
  // and the three deployment guides, read 2026-09-24. Native apps: Exchange,
  // SharePoint, Teams everywhere it runs; AVD, Windows 365 and Windows Cloud
  // Login on Windows only. Browser (preview): Azure Resource Manager only.
  const RESOURCES = [
    { id: "00000002-0000-0ff1-ce00-000000000000", label: "Exchange Online", where: "Windows, macOS, iOS" },
    { id: "00000003-0000-0ff1-ce00-000000000000", label: "SharePoint Online", where: "Windows, macOS, iOS" },
    { id: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", label: "Teams Services", where: "Windows, macOS, iOS" },
    { id: "9cdead84-a844-4324-93f2-b2e6bb768d07", label: "Azure Virtual Desktop", where: "Windows" },
    { id: "0af06dc6-e4b5-4f28-818e-e78e62d137a5", label: "Windows 365", where: "Windows" },
    { id: "270efc09-cd0d-444b-a71f-39af4910ec45", label: "Windows Cloud Login", where: "Windows" },
    { id: "797f4846-ba00-4fd7-ba43-dac1f8f63013", label: "Azure Resource Manager", where: "browser, preview" },
  ];
  const RES_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));
  const CHECKED = "2026-09-24";
  const LEARN_URL = "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection";
  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };
  const CAE_LABEL = { disabled: "Disabled", strictEnforcement: "Strictly enforce location policies", strictLocation: "Strictly enforce location policies" };
  const SEV_RANK = { high: 0, medium: 1, info: 2 };
  const SEV_LABEL = { high: "High", medium: "Medium", info: "Info" };
  // personas whose accounts are people on managed devices; the rest (service
  // accounts, workload identities, guests) are not where token protection goes first
  const PEOPLE = new Set([0, 100, 200, 300, 1000]);

  const S = (p) => p.sessionControls || {};
  const tpOn = (p) => !!(S(p).secureSignInSession?.isEnabled || S(p).tokenProtection?.signInSessionTokenProtection?.isEnabled);
  const caeMode = (p) => { const m = S(p).continuousAccessEvaluation && S(p).continuousAccessEvaluation.mode; return m && m !== "unknownFutureValue" ? m : null; };
  const active = (p) => STATE[p.state] === "on" || STATE[p.state] === "ro";
  const apps = (p) => ((p.conditions || {}).applications || {}).includeApplications || [];
  const hasLocation = (p) => ((((p.conditions || {}).locations || {}).includeLocations) || []).length > 0;
  const platformsOf = (p) => { const x = (((p.conditions || {}).platforms || {}).includePlatforms) || []; return x.length && !x.includes("all") ? x : null; };

  function analyze(raws, opts) {
    const o = opts || {};
    const caGroup = o.caGroup || (() => ({ key: 99999, label: "Other / unnumbered" }));
    const learn = (o.learn || []).filter((f) => f && f.check && /^(token-prot-|cae-)/.test(f.check.id));
    const learnBy = new Map();
    for (const f of learn) { if (!learnBy.has(f.policyId)) learnBy.set(f.policyId, []); learnBy.get(f.policyId).push(f.check.title); }
    const personas = new Map();
    const P = (key, label) => { if (!personas.has(key)) personas.set(key, { key, label, active: 0, tp: [], cae: [], location: 0 }); return personas.get(key); };
    for (const p of raws || []) {
      const g = caGroup(p.displayName || "");
      const row = P(g.key, g.label);
      if (!active(p)) continue;
      row.active++;
      if (hasLocation(p)) row.location++;
      const st = STATE[p.state];
      if (tpOn(p)) {
        const inc = apps(p);
        const all = inc.includes("All"), o365 = inc.some((a) => String(a).toLowerCase() === "office365");
        row.tp.push({ id: p.id, name: p.displayName, state: st, all, o365,
          resources: inc.filter((a) => RES_BY_ID[a]).map((a) => RES_BY_ID[a].label),
          other: inc.filter((a) => !RES_BY_ID[a] && a !== "All" && String(a).toLowerCase() !== "office365").length,
          platforms: platformsOf(p), learn: learnBy.get(p.id) || [] });
      }
      const m = caeMode(p);
      if (m) row.cae.push({ id: p.id, name: p.displayName, state: st, mode: m, learn: learnBy.get(p.id) || [] });
    }
    const rows = [...personas.values()].filter((r) => r.active).sort((a, b) => a.key - b.key);
    const findings = [];
    const add = (sev, kind, persona, text, pols) => findings.push({ sev, kind, persona, text, policies: pols || [] });
    const anyTp = rows.some((r) => r.tp.length);
    for (const r of rows) {
      const tpActive = r.tp.filter((t) => t.state === "on");
      if (!r.tp.length && PEOPLE.has(r.key)) {
        add(r.key === 100 ? "medium" : "info", "tp-none", r.label,
          r.key === 100 ? "No token protection for the admin persona. A stolen admin refresh token is the costliest one to replay, and Exchange, SharePoint and Teams on Windows can be protected today."
            : "No token protection for this persona. Replayed refresh tokens stay usable from any device until they expire or are revoked.");
      } else if (r.tp.length && !tpActive.length) {
        add("info", "tp-report-only", r.label, "Token protection is in report-only only. Report-only marks every request without a hardware-bound device as Unbound, including devices that would upgrade — read the sign-in status codes before switching On.", r.tp.map((t) => t.name));
      }
      for (const t of r.tp) if (t.learn.length) add("medium", "tp-learn", r.label, `${t.learn.length} Microsoft Learn finding${t.learn.length === 1 ? "" : "s"} on this token protection policy (${t.learn.join("; ")}). Fixed in 📘 Microsoft Learn.`, [t.name]);
      for (const c of r.cae) {
        if (c.mode === "disabled") add("medium", "cae-disabled", r.label, "Continuous access evaluation is switched off for the users this policy reaches — revocation waits for the token to expire (up to an hour). Fixed in 📘 Microsoft Learn.", [c.name]);
        else if (!r.location) add("medium", "cae-strict-noloc", r.label, "Strict location enforcement only acts on location-based policies, and no active policy in this persona has a location condition — the setting changes nothing yet.", [c.name]);
        else add("info", "cae-strict", r.label, "Strict location enforcement: an IP that differs between Entra and the resource (split tunnelling, IPv6, a proxy) now blocks instead of passing. Check the CAE IP-mismatch workbook before switching On.", [c.name]);
      }
    }
    // resources: which supported resource no active token protection reaches
    const cover = RESOURCES.map((res) => {
      const on = [], ro = [];
      for (const r of rows) for (const t of r.tp) {
        if (!(t.resources.includes(res.label) || t.all)) continue;
        (t.state === "on" ? on : ro).push(r.label);
      }
      return { ...res, on: [...new Set(on)], ro: [...new Set(ro)] };
    });
    if (anyTp) for (const c of cover.slice(0, 3)) if (!c.on.length && !c.ro.length) add("info", "tp-resource", null, `${c.label} supports token protection and no token protection policy includes it.`);
    findings.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
    const counts = { high: 0, medium: 0, info: 0 };
    for (const f of findings) counts[f.sev]++;
    return { rows, cover, findings, counts, tpPolicies: rows.reduce((s, r) => s + r.tp.length, 0), caePolicies: rows.reduce((s, r) => s + r.cae.length, 0),
      learnCount: learn.length, checked: CHECKED, demo: !!o.demo };
  }

  // ---- render --------------------------------------------------------------
  const FILTERS = [["all", "All"], ["high", "High"], ["medium", "Medium"], ["info", "Info"]];
  function chips(m, filter) {
    return FILTERS.map(([k, l]) => { const n = k === "all" ? m.findings.length : m.counts[k]; return (n || k === "all" || k === filter) ? `<button class="fchip ${filter === k ? "active" : ""}" data-tcf="${k}">${l} (${n})</button>` : ""; }).join("");
  }
  const pill = (sev, text) => `<span class="xt-pill xt-${sev}">${esc(text || SEV_LABEL[sev])}</span>`;
  const statePill = (st) => st === "on" ? "tc-on" : "tc-ro";
  const polLink = (x) => `<span class="pol-link" data-polid="${esc(x.id)}">${esc(x.name)}</span>`;
  function tpCell(r) {
    if (!r.tp.length) return '<span class="muted">none</span>';
    return r.tp.map((t) => `<div class="tc-pol"><span class="xt-pill ${statePill(t.state)}">${STATE_LABEL[t.state]}</span> ${polLink(t)}${t.learn.length ? ` ${pill("medium", `${t.learn.length} in 📘`)}` : ""}</div>`).join("");
  }
  function resCell(r) {
    if (!r.tp.length) return '<span class="muted">—</span>';
    return r.tp.map((t) => `<div class="tc-pol mini">${t.all ? "All resources" : t.o365 ? "Office 365 group" : ""}${(t.all || t.o365) && t.resources.length ? " + " : ""}${esc(t.resources.join(", "))}${t.other ? ` + ${t.other} unsupported` : ""}</div>`).join("");
  }
  function platCell(r) {
    if (!r.tp.length) return '<span class="muted">—</span>';
    return r.tp.map((t) => `<div class="tc-pol mini">${t.platforms ? esc(t.platforms.join(", ")) : "any platform"}</div>`).join("");
  }
  function caeCell(r) {
    if (!r.cae.length) return '<span class="mini muted">default</span>';
    return r.cae.map((c) => `<div class="tc-pol"><span class="xt-pill ${c.mode === "disabled" ? "xt-medium" : "xt-info"}">${esc(CAE_LABEL[c.mode] || c.mode)}</span> ${polLink(c)}${c.state === "ro" ? ' <span class="mini muted">(report-only)</span>' : ""}</div>`).join("");
  }
  function render(m, o) {
    const f = (o && o.filter) || "all";
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    const covered = m.rows.filter((r) => r.tp.some((x) => x.state === "on")).length;
    const tiles = `<div class="xt-tiles">${t("", "Personas with active policies", m.rows.length)}${t(covered ? "" : "m", "…with token protection On", covered)}${t("", "Token protection policies", m.tpPolicies)}${t(m.rows.some((r) => r.cae.some((c) => c.mode === "disabled")) ? "m" : "", "Policies customising CAE", m.caePolicies)}</div>`;
    const matrix = m.rows.length ? `<div class="list-card xt-card"><h3>Per persona <span class="mini">— active policies only (On and report-only)</span></h3><div class="xt-tw"><table class="xt-tbl tc-tbl">
      <thead><tr><th>Persona</th><th>Token protection</th><th>Resources</th><th>Platforms</th><th>Continuous access evaluation</th></tr></thead>
      <tbody>${m.rows.map((r) => `<tr><td><b>${esc(r.label)}</b><br><span class="mini muted">${r.active} active polic${r.active === 1 ? "y" : "ies"}</span></td><td>${tpCell(r)}</td><td>${resCell(r)}</td><td>${platCell(r)}</td><td>${caeCell(r)}</td></tr>`).join("")}</tbody></table></div>
      <p class="mini muted" style="margin-top:8px">CAE <i>default</i> means no policy customises it — CAE is on for every client and resource that supports it.</p></div>`
      : '<div class="list-card xt-card"><p class="mini">No active policies loaded.</p></div>';
    const cover = `<div class="list-card xt-card"><h3>Resources that support token protection <span class="mini">— checked against Microsoft Learn ${esc(m.checked)}</span></h3><div class="xt-tw"><table class="xt-tbl tc-res">
      <thead><tr><th>Resource</th><th>Supported on</th><th>Protected (On)</th><th>Report-only</th></tr></thead>
      <tbody>${m.cover.map((c) => `<tr><td>${esc(c.label)}</td><td class="mini">${esc(c.where)}</td><td class="mini">${c.on.length ? esc(c.on.join(", ")) : '<span class="muted">no persona</span>'}</td><td class="mini">${c.ro.length ? esc(c.ro.join(", ")) : '<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>
      <p class="mini muted" style="margin-top:8px">Native apps only, except Azure Resource Manager, which is a browser preview for the Azure, Intune and Entra admin portals. Apple platforms need MDM-managed devices with the Enterprise SSO plug-in. <a href="${LEARN_URL}" target="_blank" rel="noopener">Token protection on Microsoft Learn</a>.</p></div>`;
    const list = m.findings.filter((x) => f === "all" || x.sev === f);
    const fnd = `<div class="list-card xt-card"><h3>Findings</h3>${list.length ? list.map((x) => `<div class="xt-f">${pill(x.sev)}<div><b>${esc(x.persona || "Tenant")}</b><p>${esc(x.text)}</p>${x.policies.length ? `<div class="xt-pols">${x.policies.map((n) => `<span class="xt-pol">${esc(n)}</span>`).join("")}</div>` : ""}</div></div>`).join("")
      : `<p class="mini" style="padding:8px 0">${m.findings.length ? "Nothing at this level." : "Nothing flagged."}</p>`}
      <p class="mini muted" style="margin-top:10px">Read-only, from the policies already loaded. Per-policy token protection settings (apps, platforms, client apps, the device filter) and a CAE switched off are judged — and fixed — in 📘 Microsoft Learn; this tab counts them and does not raise them twice.</p></div>`;
    return tiles + matrix + cover + fnd + (m.demo ? '<p class="mini muted">Demo data — example policies, not a real tenant.</p>' : "");
  }
  function toMd(m, tenant) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`# CAE and token protection coverage — ${tenant || "tenant"}`, "", `${m.tpPolicies} token protection policies · ${m.caePolicies} policies customising CAE · ${m.findings.length} findings${m.demo ? " (demo)" : ""}`, "",
      "| Persona | Token protection | Resources | Platforms | CAE |", "| --- | --- | --- | --- | --- |"];
    for (const r of m.rows) L.push(`| ${e(r.label)} | ${r.tp.length ? r.tp.map((t) => `${e(t.name)} (${STATE_LABEL[t.state]})`).join("; ") : "none"} | ${r.tp.map((t) => t.all ? "All" : t.resources.join(", ")).join("; ") || "—"} | ${r.tp.map((t) => t.platforms ? t.platforms.join(", ") : "any").join("; ") || "—"} | ${r.cae.length ? r.cae.map((c) => `${e(c.name)}: ${CAE_LABEL[c.mode] || c.mode}`).join("; ") : "default"} |`);
    L.push("", "## Resources", "");
    for (const c of m.cover) L.push(`- ${c.label} (${c.where}): ${c.on.length ? `On for ${c.on.join(", ")}` : "no persona On"}${c.ro.length ? `; report-only for ${c.ro.join(", ")}` : ""}`);
    L.push("", "## Findings", "");
    if (!m.findings.length) L.push("Nothing flagged.");
    for (const x of m.findings) L.push(`- **${SEV_LABEL[x.sev].toUpperCase()}** ${x.persona || "Tenant"} — ${x.text}${x.policies.length ? ` Policies: ${x.policies.join("; ")}.` : ""}`);
    L.push("", `Supported resources checked against Microsoft Learn ${m.checked}: ${LEARN_URL}`);
    return L.join("\n");
  }
  return { analyze, render, chips, toMd, RESOURCES, tpOn, caeMode };
})();
