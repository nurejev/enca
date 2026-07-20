// ======================================================================
// Baseline Policies — match the tenant's Conditional Access policies
// against the Limon-IT baseline catalog (js/baselineData.js).
//
// Matching is by CA number, which is the stable identity in the naming
// convention: the (NEW)/(UP) staging prefixes, the persona label and the
// descriptive middle of a policy name all change between releases, the
// number does not. Versions are compared numerically per segment, so
// v1.0.10 correctly sorts above v1.0.9.
//
// Every policy lands in exactly one bucket:
//   ok        present, version matches the baseline
//   outdated  present, but the tenant runs an older version
//   ahead     present, but the tenant runs a newer version than the catalog
//   unversioned present, but one side carries no version to compare
//   missing   in the baseline, not in the tenant
//   extra     numbered policy in the tenant that the baseline does not define
// ======================================================================
const Baseline = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const STATUS = {
    ok: { icon: "✓", label: "Up to date", cls: "ok", order: 3 },
    outdated: { icon: "⬆", label: "Outdated", cls: "warn", order: 1 },
    ahead: { icon: "⬇", label: "Newer than baseline", cls: "info", order: 4 },
    unversioned: { icon: "?", label: "Version unknown", cls: "info", order: 5 },
    missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
    extra: { icon: "＋", label: "Not in baseline", cls: "info", order: 6 },
  };

  const caNum = (name) => { const m = /CA(\d{3,4})/i.exec(name || ""); return m ? +m[1] : null; };
  const version = (name) => { const m = /v\s?(\d+\.\d+(?:\.\d+)?)\s*$/i.exec((name || "").trim()); return m ? m[1] : null; };

  // -1 a<b, 0 equal, 1 a>b — segment-wise, so 1.0.10 > 1.0.9
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  const personaOf = (num) => {
    try { return Render.caGroup(`CA${num}`).label; } catch { return "Other"; }
  };

  // ---- compare tenant policies against the catalog ----
  // vms: the app's view models ({ id, name, state, raw }).
  function compare(vms) {
    const byNum = new Map();
    for (const p of vms) {
      const n = caNum(p.name);
      if (n == null) continue;
      // duplicate CA numbers in a tenant are real (a leftover copy) — keep both
      if (!byNum.has(n)) byNum.set(n, []);
      byNum.get(n).push(p);
    }

    const rows = [];
    for (const b of BASELINE.policies) {
      const hits = byNum.get(b.num) || [];
      if (!hits.length) {
        rows.push({ num: b.num, baseline: b, tenant: null, status: "missing" });
        continue;
      }
      // when a number appears twice, judge on the best (newest) match
      const scored = hits.map((p) => {
        const tv = version(p.name);
        let status = "unversioned";
        if (tv && b.version) {
          const c = cmpVersion(tv, b.version);
          status = c === 0 ? "ok" : c < 0 ? "outdated" : "ahead";
        }
        return { p, tv, status };
      }).sort((a, b2) => STATUS[b2.status].order - STATUS[a.status].order);
      const best = scored[0];
      rows.push({
        num: b.num, baseline: b, tenant: best.p, tenantVersion: best.tv,
        status: best.status, duplicates: hits.length > 1 ? hits.length : 0,
      });
      byNum.delete(b.num);
    }
    // numbered policies the baseline does not define
    for (const [num, hits] of byNum) {
      rows.push({ num, baseline: null, tenant: hits[0], tenantVersion: version(hits[0].name), status: "extra", duplicates: hits.length > 1 ? hits.length : 0 });
    }
    rows.sort((a, b) => a.num - b.num);

    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const covered = rows.filter((r) => r.baseline && r.tenant).length;
    return {
      rows, counts,
      baselineTotal: BASELINE.policies.length,
      covered,
      coverage: BASELINE.policies.length ? Math.round((covered / BASELINE.policies.length) * 100) : 0,
      // what an import would actually bring in
      toImport: rows.filter((r) => r.status === "missing" || r.status === "outdated"),
    };
  }

  // ---- rendering ----
  function renderSummary(res) {
    const chip = (k) => res.counts[k] ? `<span class="bl-chip ${STATUS[k].cls}">${STATUS[k].icon} ${res.counts[k]} ${esc(STATUS[k].label.toLowerCase())}</span>` : "";
    const order = ["missing", "outdated", "ok", "ahead", "unversioned", "extra"];
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>🧬 Baseline Policies — ${esc(BASELINE.release)} (${esc(BASELINE.line)})</h3>
        <p style="margin-bottom:10px">Your tenant matched against the Limon-IT Conditional Access baseline, policy by policy on the CA number.
          Version differences are compared per segment, so an older deployment shows as <b>outdated</b> rather than present.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${order.map(chip).join("")}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${res.coverage}%<span class="mini" style="font-weight:400"> coverage</span></div>
        <div class="mini">${res.covered} of ${res.baselineTotal} baseline policies present</div>
        <div class="mini">${res.toImport.length} would be imported or updated</div>
      </div>
    </div>`;
  }

  function chips(res, active) {
    const all = res.rows.length;
    const items = [["all", `All (${all})`]].concat(
      ["missing", "outdated", "ok", "ahead", "unversioned", "extra"]
        .filter((k) => res.counts[k])
        .map((k) => [k, `${STATUS[k].icon} ${STATUS[k].label} (${res.counts[k]})`]));
    return items.map(([k, l]) => `<button class="fchip ${active === k ? "active" : ""}" data-blf="${k}">${esc(l)}</button>`).join("");
  }

  function renderTable(res, filter, query) {
    const q = (query || "").toLowerCase();
    let rows = res.rows;
    if (filter && filter !== "all") rows = rows.filter((r) => r.status === filter);
    if (q) rows = rows.filter((r) => `${r.num} ${r.baseline?.name || ""} ${r.tenant?.name || ""}`.toLowerCase().includes(q));
    if (!rows.length) return '<p class="mini" style="padding:20px">No baseline policies match the current filter.</p>';

    let body = "", lastGroup = null;
    for (const r of rows) {
      const g = personaOf(r.num);
      if (g !== lastGroup) {
        body += `<tr class="grouprow"><td colspan="5"><b>${esc(g)}</b></td></tr>`;
        lastGroup = g;
      }
      const s = STATUS[r.status];
      const bName = r.baseline ? r.baseline.name : "—";
      const tag = r.baseline?.tag ? `<span class="tag new">${esc(r.baseline.tag)}</span>` : "";
      const tenant = r.tenant
        ? `<span class="pname" data-blpol="${esc(r.tenant.id)}">${esc(r.tenant.name)}</span>
           <div class="mini">state: ${esc(r.tenant.state === "report" ? "report-only" : r.tenant.state)}${r.duplicates ? ` · ⚠ ${r.duplicates} policies share CA${r.num}` : ""}</div>`
        : '<span class="mini">not present in this tenant</span>';
      const ver = r.status === "outdated"
        ? `<span class="bl-ver warn">${esc(r.tenantVersion)} → ${esc(r.baseline.version)}</span>`
        : r.status === "missing" ? `<span class="mini">${esc(r.baseline.version || "—")}</span>`
        : r.status === "extra" ? `<span class="mini">${esc(r.tenantVersion || "—")}</span>`
        : `<span class="mini">${esc(r.tenantVersion || r.baseline?.version || "—")}</span>`;
      body += `<tr>
        <td class="bl-st"><span class="bl-badge ${s.cls}" title="${esc(s.label)}">${s.icon}</span></td>
        <td><b>CA${String(r.num).padStart(3, "0")}</b></td>
        <td>${esc(bName)} ${tag}<div class="mini">${esc(r.baseline ? `${r.baseline.resources} · ${r.baseline.grant}` : "")}</div></td>
        <td>${tenant}</td>
        <td>${ver}</td>
      </tr>`;
    }
    return `<div class="list-card"><table class="plist bl-table">
      <thead><tr><th style="width:44px"></th><th style="width:78px">CA</th><th>Baseline policy (${esc(BASELINE.release)})</th><th>In this tenant</th><th style="width:150px">Version</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }


  // ---- card view: render a baseline policy from the catalog alone ----
  // Same shape as the tenant policy cards, so a baseline policy reads the
  // same way as a deployed one — plus a status ribbon showing how this
  // tenant compares.
  const ICON = (p) => p.block ? "🚫" : /SESSION/i.test(p.name) ? "🕒" : "🔐";

  function policyCard(r) {
    const b = r.baseline;
    const s = STATUS[r.status];
    const sect = (label, body, cls) => body
      ? `<div class="bc-sect"><label>${esc(label)}</label><div class="${cls || ""}">${body}</div></div>` : "";
    const items = (arr, cls) => arr.length
      ? `<ul class="bc-list${cls ? " " + cls : ""}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";

    const status = `<div class="bc-status ${s.cls}">
        <b>${s.icon} ${esc(s.label)}</b>
        <span class="mini">${r.tenant
          ? `in tenant: ${esc(r.tenant.name)}${r.status === "outdated" ? ` — v${esc(r.tenantVersion)} vs baseline v${esc(b.version)}` : ""}`
          : "not present in this tenant"}</span>
      </div>`;

    return `<div class="list-card bc-card ${s.cls}">
      <div class="bc-head">
        <div class="bc-ic">${ICON(b)}</div>
        <div style="flex:1;min-width:0">
          <h3>${esc(b.name)}</h3>
          <div class="mini">CA${String(b.num).padStart(3, "0")} · ${esc(personaOf(b.num))}${b.version ? ` · v${esc(b.version)}` : ""}</div>
        </div>
        ${b.tag ? `<span class="tag new">${esc(b.tag)}</span>` : ""}
      </div>
      ${status}
      <div class="bc-body">
        ${sect("Users — include", items(b.include))}
        ${sect("Users — exclude", items(b.exclude, "excl"))}
        ${sect("Target resources", esc(b.resources || "—"))}
        ${sect("Network", esc(b.network || "Any network or location"))}
        ${sect("Conditions", items(b.conditions))}
        ${sect(b.block ? "Block" : "Grant", `<b>${esc(b.grant || "—")}</b>`)}
        ${sect("Session", esc(b.session))}
      </div>
    </div>`;
  }

  function renderCards(res, filter, query) {
    const q = (query || "").toLowerCase();
    let rows = res.rows.filter((r) => r.baseline);   // the catalog is the subject here
    if (filter && filter !== "all") rows = rows.filter((r) => r.status === filter);
    if (q) rows = rows.filter((r) => `${r.num} ${r.baseline.name} ${r.tenant?.name || ""}`.toLowerCase().includes(q));
    if (!rows.length) return '<p class="mini" style="padding:20px">No baseline policies match the current filter.</p>';

    let html = "", lastGroup = null;
    for (const r of rows) {
      const g = personaOf(r.num);
      if (g !== lastGroup) {
        html += `<div class="cardgroup" style="cursor:default"><h3>${esc(g)}</h3></div>`;
        lastGroup = g;
      }
      html += policyCard(r);
    }
    return `<div class="bc-grid">${html}</div>`;
  }

  // ---- Markdown export ----
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  function toMd(res, tenantName) {
    const L = [];
    L.push(`# Baseline comparison — ${mdEsc(tenantName || "tenant")} vs ${BASELINE.release} (${BASELINE.line})`);
    L.push("");
    L.push(`Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC by Conditional Access Baseline Tools (cadoc.limon-it.nl).`);
    L.push("");
    L.push(`- Baseline coverage: **${res.coverage}%** — ${res.covered} of ${res.baselineTotal} baseline policies present in the tenant.`);
    ["missing", "outdated", "ok", "ahead", "unversioned", "extra"].forEach((k) => {
      if (res.counts[k]) L.push(`- ${STATUS[k].label}: **${res.counts[k]}**`);
    });
    L.push(`- Import would add or update **${res.toImport.length}** policies.`);
    L.push("");
    L.push("| Status | CA | Baseline policy | In tenant | Version |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const r of res.rows) {
      const v = r.status === "outdated" ? `${r.tenantVersion} → ${r.baseline.version}` : (r.tenantVersion || r.baseline?.version || "—");
      L.push(`| ${STATUS[r.status].label} | CA${String(r.num).padStart(3, "0")} | ${mdEsc(r.baseline?.name || "—")} | ${mdEsc(r.tenant?.name || "—")} | ${mdEsc(v)} |`);
    }
    L.push("");
    if (res.toImport.length) {
      L.push("## Would be imported or updated");
      L.push("");
      for (const r of res.toImport) L.push(`- **CA${String(r.num).padStart(3, "0")}** ${mdEsc(r.baseline.name)}${r.status === "outdated" ? ` — currently v${mdEsc(r.tenantVersion)}` : " — not present"}`);
      L.push("");
    }
    return L.join("\n");
  }

  return { compare, renderSummary, chips, renderTable, renderCards, toMd, STATUS, caNum, version, cmpVersion };
})();
