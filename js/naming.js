// ======================================================================
// 📏 Naming — the CA-number convention, checked (R25, T45, beta 32403).
//
// Every tool here groups policies by the CA number in the name (CA000–099
// Global, CA100–199 Admins, … — Render.caGroup) and none of them checked it.
// This module does, over the policies already loaded. It reads nothing.
//
//   unnumbered     — no CA number at all; grouped under Other everywhere
//   duplicate      — one number carried by two policies whose names differ
//                    beyond the version (a version pair is 🧹 Housekeeping's
//                    case, a same-name pair is 👯 Duplicates' — both skipped)
//   no-range       — the number falls in a hundred no persona owns
//   name-range     — the name says one persona, the number another
//   name-assign    — the policy INCLUDES the persona group of another range
//                    (only where the active baseline names persona groups)
//   gaps           — free numbers inside a used range; information, folded,
//                    never counted as a finding
//
//   Naming.analyze(vms, { caGroup, personaKey, personaGroups, catalogLabel })
//   Naming.render(m, { filter }) / chips(m, filter) / toMd(m, tenant)
// ======================================================================
const Naming = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const NUM_RE = /CA(\d{3,4})/i;
  const caNum = (name) => { const m = NUM_RE.exec(name || ""); return m ? +m[1] : null; };
  // the persona the NAME says (Baseline.personaKey) → the hundreds it may use
  const NAME_BASES = {
    global: [0], admin: [100], internal: [200], guest: [300, 400], guestadmin: [500],
    serviceaccount: [600, 700, 800], agent: [900], devops: [1000], eadmin: [1100],
  };
  const NAME_LABEL = {
    global: "Global", admin: "Admins", internal: "Internals", guest: "Guests / externals", guestadmin: "Guest admins",
    serviceaccount: "Service accounts", agent: "Workload identities", devops: "DevOps", eadmin: "Emergency access",
  };
  // a catalog persona group key → the hundred it belongs to (CloudFellows)
  const GROUP_BASE = { admins: 100, internals: 200, externals: 300, guestusers: 400, guestadmins: 500, serviceaccounts: 600, devops: 1000, breakglass: 1100 };
  const KINDS = {
    duplicate:     { sev: "medium", label: "Number used twice" },
    "no-range":    { sev: "medium", label: "No persona range" },
    "name-range":  { sev: "medium", label: "Name ≠ range" },
    "name-assign": { sev: "medium", label: "Name ≠ assignment" },
    unnumbered:    { sev: "info",   label: "Unnumbered" },
  };
  const ORDER = ["duplicate", "name-assign", "name-range", "no-range", "unnumbered"];
  const pad = (n) => `CA${String(n).padStart(3, "0")}`;

  // A name without its staging prefix, its CA number and its version — two
  // policies that agree on this are a version pair (or the same policy
  // twice), which other tools own.
  function stem(name) {
    return String(name || "").toLowerCase()
      .replace(/^\s*\((new|up)\)\s*/i, "")
      .replace(NUM_RE, " ")
      .replace(/[-_ ]v?\d+(\.\d+)+\b/g, " ")
      .replace(/\bv\d+\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function analyze(vms, opts) {
    const o = opts || {};
    const caGroup = o.caGroup || ((n) => ({ key: 99999, label: "Other", num: null }));
    const personaKey = o.personaKey || (() => null);
    const pgs = (o.personaGroups || []).filter((g) => g && g.group && GROUP_BASE[g.key] !== undefined);
    const findings = [];
    const add = (kind, p, why, extra) => findings.push({ kind, sev: KINDS[kind].sev, id: p.id, name: p.name, state: p.state, why, ...(extra || {}) });
    const rangeLabel = (base) => { const g = caGroup(pad(base)); return /\+$/.test(String(g.label || "").split(" (")[0]) ? null : g.label; };
    const known = (base) => !!rangeLabel(base) && !/^CA\d+\+/.test(rangeLabel(base));
    const byNum = new Map(), byBase = new Map();
    for (const p of vms || []) {
      const n = caNum(p.name);
      if (n === null) continue;
      if (!byNum.has(n)) byNum.set(n, []);
      byNum.get(n).push(p);
      const b = Math.floor(n / 100) * 100;
      if (!byBase.has(b)) byBase.set(b, new Set());
      byBase.get(b).add(n);
    }
    const nextFree = (base) => { const used = byBase.get(base) || new Set(); for (let n = base; n < base + 100; n++) if (!used.has(n)) return n; return null; };

    for (const p of vms || []) {
      const n = caNum(p.name);
      const key = personaKey(p.name);
      if (n === null) {
        const bases = key ? NAME_BASES[key] : null;
        const nf = bases ? nextFree(bases[0]) : null;
        add("unnumbered", p, `Grouped under Other / unnumbered in every tool.${nf !== null ? ` The name reads ${NAME_LABEL[key]}; the next free number there is ${pad(nf)}.` : ""}`);
        continue;
      }
      const base = Math.floor(n / 100) * 100;
      if (!known(base)) { add("no-range", p, `${pad(base)}–${pad(base + 99)} belongs to no persona, so the policy is grouped on its own.`); continue; }
      if (key && NAME_BASES[key] && !NAME_BASES[key].includes(base)) {
        add("name-range", p, `The name reads ${NAME_LABEL[key]}; the number is in ${rangeLabel(base)}.`);
      }
      if (pgs.length && base !== 0) {
        const inc = new Set(((p.users && p.users.inc) || []).map((x) => String(x).toLowerCase()));
        const other = pgs.filter((g) => inc.has(g.group.toLowerCase()) && GROUP_BASE[g.key] !== base);
        const own = pgs.some((g) => inc.has(g.group.toLowerCase()) && GROUP_BASE[g.key] === base);
        if (other.length) add("name-assign", p, `Includes ${other.map((g) => g.group).join(", ")} — the persona group of ${other.map((g) => rangeLabel(GROUP_BASE[g.key]) || pad(GROUP_BASE[g.key])).join(", ")}${own ? ", beside its own persona group" : ""}.`, { groups: other.map((g) => g.group) });
      }
    }
    for (const [n, list] of byNum) {
      if (list.length < 2) continue;
      const stems = new Map();
      for (const p of list) { const s = stem(p.name); if (!stems.has(s)) stems.set(s, []); stems.get(s).push(p); }
      if (stems.size < 2) continue;   // all one name apart from the version: Housekeeping / Duplicates
      for (const p of list) {
        const others = list.filter((x) => stem(x.name) !== stem(p.name)).map((x) => x.name);
        add("duplicate", p, `${pad(n)} is also ${others.map((x) => `“${x}”`).join(", ")}. Not a version pair — the names differ beyond the version.`, { num: n, others });
      }
    }
    const gaps = [...byBase.entries()].filter(([b]) => known(b)).sort((a, b) => a[0] - b[0]).map(([b, used]) => {
      const nums = [...used].sort((x, y) => x - y), hi = nums[nums.length - 1], free = [];
      for (let n = b; n < hi; n++) if (!used.has(n)) free.push(n);
      return { base: b, label: rangeLabel(b), used: nums.length, free };
    }).filter((g) => g.free.length);

    findings.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (caNum(a.name) ?? 1e9) - (caNum(b.name) ?? 1e9) || String(a.name).localeCompare(String(b.name)));
    const counts = Object.fromEntries(ORDER.map((k) => [k, findings.filter((f) => f.kind === k).length]));
    return { findings, counts, gaps, checked: (vms || []).length, assignChecked: pgs.length > 0, catalogLabel: o.catalogLabel || "", demo: !!o.demo };
  }

  // ---- render --------------------------------------------------------------
  function chips(m, filter) {
    const all = `<button class="fchip ${filter === "all" ? "active" : ""}" data-nmf="all">All (${m.findings.length})</button>`;
    return all + ORDER.filter((k) => m.counts[k] || filter === k).map((k) => `<button class="fchip ${filter === k ? "active" : ""}" data-nmf="${k}">${KINDS[k].label} (${m.counts[k]})</button>`).join("");
  }
  const pill = (k) => `<span class="xt-pill xt-${KINDS[k].sev}">${esc(KINDS[k].label)}</span>`;
  function render(m, opt) {
    const f = (opt && opt.filter) || "all";
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    const tiles = `<div class="xt-tiles nm-tiles">${t("", "Policies checked", m.checked)}${t(m.counts.duplicate ? "m" : "", "Number used twice", m.counts.duplicate)}${t(m.counts["name-range"] + m.counts["name-assign"] ? "m" : "", "Persona mismatch", m.counts["name-range"] + m.counts["name-assign"])}${t("", "Unnumbered or no range", m.counts.unnumbered + m.counts["no-range"])}</div>`;
    const list = m.findings.filter((x) => f === "all" || x.kind === f);
    const rows = list.length ? `<div class="xt-tw"><table class="xt-tbl nm-tbl"><thead><tr><th>Policy</th><th>Finding</th><th>Why</th></tr></thead><tbody>${list.map((x) => `<tr>
        <td><span class="pol-link" data-polid="${esc(x.id)}">${esc(x.name)}</span>${x.state && x.state !== "on" ? ` <span class="mini muted">(${esc(x.state === "report" ? "report-only" : x.state)})</span>` : ""}</td>
        <td>${pill(x.kind)}</td><td class="mini">${esc(x.why)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="mini" style="padding:8px 0">${m.findings.length ? "Nothing of this kind." : "Every policy is numbered, in a persona range, and named for it."}</p>`;
    const gaps = m.gaps.length ? `<details class="nm-gaps"><summary class="mini">Free numbers inside the ranges in use — ${m.gaps.reduce((s, g) => s + g.free.length, 0)} (information, not a finding)</summary>
        ${m.gaps.map((g) => `<p class="mini"><b>${esc(g.label)}</b> · ${g.used} used · free below the highest: ${g.free.slice(0, 40).map(pad).join(", ")}${g.free.length > 40 ? ` and ${g.free.length - 40} more` : ""}</p>`).join("")}</details>` : "";
    const scope = m.assignChecked
      ? `<p class="mini muted">Name ≠ assignment reads the persona groups of the active baseline${m.catalogLabel ? ` (${esc(m.catalogLabel)})` : ""}. Ranges are the CA-number persona ranges every ENCA tool groups by.</p>`
      : `<p class="mini muted">Name ≠ assignment was not checked — the active baseline names no persona groups. Ranges are the CA-number persona ranges every ENCA tool groups by.</p>`;
    return tiles + `<div class="list-card xt-card"><h3>Findings</h3>${rows}${gaps}${scope}
      <p class="mini muted">Read-only, from the policies already loaded — nothing is read or written. A version pair (same CA number, same name apart from the version) is 🧹 Housekeeping's; the same name twice is 👯 Duplicates'.</p></div>`
      + (m.demo ? '<p class="mini muted">Demo data — example policies, not a real tenant.</p>' : "");
  }
  function toMd(m, tenant) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`# CA naming convention — ${tenant || "tenant"}`, "", `${m.checked} policies checked · ${m.findings.length} finding${m.findings.length === 1 ? "" : "s"}${m.demo ? " (demo)" : ""}`, ""];
    if (m.findings.length) {
      L.push("| Policy | Finding | Why |", "| --- | --- | --- |");
      for (const x of m.findings) L.push(`| ${e(x.name)} | ${KINDS[x.kind].label} | ${e(x.why)} |`);
    } else L.push("Nothing flagged.");
    if (m.gaps.length) { L.push("", "## Free numbers inside the ranges in use (information)", ""); for (const g of m.gaps) L.push(`- ${g.label}: ${g.free.map(pad).join(", ")}`); }
    L.push("", m.assignChecked ? `Name ≠ assignment read the persona groups of ${m.catalogLabel || "the active baseline"}.` : "Name ≠ assignment not checked (no persona groups in the active baseline).");
    return L.join("\n");
  }
  return { analyze, render, chips, toMd, stem, caNum, KINDS, NAME_BASES, GROUP_BASE };
})();
