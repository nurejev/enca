// ======================================================================
// 🔒 Protect exclusions 3.0 (T20) — pure: classify, render, report.
//
// An exclusion group is a Conditional Access bypass, and two things widen it
// without the policy being touched: a tenant-wide admin ADDING A MEMBER, and
// somebody NESTING A GROUP inside it. Those are two locks, and until 3.0 they
// were two tools (⑥ Protect for the unit, ⑧ Disable nesting per group) with
// nothing saying which lock a group still lacked. This screen puts both on
// one row. State lives in app.js (cgRmau for the unit scan, prState for the
// ticks and the run); this file only derives and draws.
//
// ctx, built by app.js per render:
//   status      Map(groupId → { auId, auName } | null)   from readProtectionMap
//   statusError string | null                            the AU read failed
//   nestingOf   (id) → "disabled" | "allowed" | "unknown" | undefined (not read yet)
//   nestedOf    (id) → number of nested groups inside (direct group members)
//   ineligible  (g)  → text | null                        cgAuIneligible
//   target      (g)  → { auId, auName, source, code, by } rmauTarget
//   nestAvail   true | false | null   whether this directory has disableNesting
//                                     (null = still reading)
// ======================================================================
const Protect = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;

  // ------------------------------------------------------------ classify --
  function classify(g, ctx) {
    const prot = ctx.status.get(g.id) || null;
    const ineligible = ctx.ineligible(g);
    const ra = !!g.roleAssignable;
    const vault = prot ? "in" : (ra || ineligible) ? "cannot" : ctx.statusError ? "unknown" : "open";
    const ns = ctx.nestingOf(g.id);
    const nested = ctx.nestedOf(g.id);
    const nest = ra ? "impossible"
      : ns === "disabled" ? "disabled"
        : ns === "allowed" ? (nested ? "blocked" : "allowed")
          : ns === "unknown" ? "unknown" : "reading";
    const dest = vault === "open" ? ctx.target(g) : null;
    let cat;
    if (vault === "cannot") cat = "cannot";
    else if (ctx.nestAvail === false) cat = vault === "in" ? "full" : "open";   // one lock exists here
    else if (vault === "in" && nest === "disabled") cat = "full";
    else if (vault === "in") cat = "vaultonly";
    else if (nest === "disabled") cat = "nestonly";
    else cat = "open";
    const canVault = vault === "open" && !!dest && dest.source !== "missing" && dest.source !== "unset";
    const canNest = ctx.nestAvail !== false && nest === "allowed";
    return { prot, ineligible, ra, vault, nest, nested, dest, cat, canVault, canNest, frozen: !!(prot && ra) };
  }
  // Default ticks: NONE. ⑥ pre-selected every assigned exclusion group, and
  // on a 115-group tenant that read as "Protect 83" under a single visible
  // tick (2026-09-10). Here a tick is something you did: a row, the header
  // box, or a selection carried over from the groups list (`pre`). nest stays
  // undefined while the state is still being read (app.js fills it in).
  function defaultTicks(g, c, pre) {
    const on = !!(pre && pre.has(g.id));
    return { vault: on && c.canVault, nest: c.nest === "reading" ? undefined : (on && c.canNest) };
  }

  const CATS = [
    ["all", "All", "zero"], ["attention", "⚠ Not fully protected", "red", "warn"], ["vaultonly", "🔒 Vault only", "amber", "sec"],
    ["nestonly", "🚫 Nesting only", "amber", "sec"], ["open", "Open", "red", "warn"], ["full", "Fully protected", "green"], ["cannot", "Cannot here", "zero"],
  ];
  const matches = (c, k) => k === "all" ? true : k === "attention" ? (c.cat !== "full" && c.cat !== "cannot") : c.cat === k;

  // -------------------------------------------------------------- render --
  // cands: the ⑥ candidate list (rmauCands). o: { filter, q, ticks: Map,
  // settings: { rmaus, auChoice, auName, admin, ack, unmatched }, busy,
  // results, find (the directory-search panel html, already rendered) }
  function render(cands, ctx, o = {}) {
    const rows = cands.map((g) => ({ g, c: classify(g, ctx) }));
    const n = (k) => rows.filter((r) => matches(r.c, k)).length;
    const nestNA = ctx.nestAvail === false, nestReading = ctx.nestAvail === null;

    // ---- tiles
    const referenced = cands.filter((g) => !g.unused).length;
    const nestedIn = rows.filter((r) => r.c.nested > 0).length;
    const tiles = nestNA
      ? `<div class="wo-vt"><span class="k">Exclusion groups</span><span class="v">${cands.length}</span><span class="s">${referenced} referenced by a policy · ${cands.length - referenced} unused, still listed</span></div>
         <div class="wo-vt ok"><span class="k">🔒 In a vault</span><span class="v">${n("full")}</span><span class="s">members guarded by a restricted unit</span></div>
         <div class="wo-vt ${n("open") ? "bad" : "ok"}"><span class="k">🔒 Not in a vault</span><span class="v">${n("open")}</span><span class="s">any Groups Administrator can add a member</span></div>
         <div class="wo-vt"><span class="k">🚫 Nesting</span><span class="v muted">n/a</span><span class="s">not reported by this directory</span></div>
         <div class="wo-vt ${nestedIn ? "warn" : ""}"><span class="k">↪ Nested groups inside</span><span class="v">${nestedIn}</span><span class="s">the visible substitute — the ↪ chip in 👥 CA groups</span></div>`
      : `<div class="wo-vt"><span class="k">Exclusion groups</span><span class="v">${cands.length}</span><span class="s">${referenced} referenced by a policy · ${cands.length - referenced} unused, still listed</span></div>
         <div class="wo-vt ok"><span class="k">🔒🚫 Fully protected</span><span class="v">${n("full")}</span><span class="s">in a vault, nesting disabled</span></div>
         <div class="wo-vt ${n("vaultonly") ? "warn" : ""}"><span class="k">🔒 Vault only</span><span class="v">${n("vaultonly")}</span><span class="s">members guarded · nesting still allowed</span></div>
         <div class="wo-vt ${n("nestonly") ? "warn" : ""}"><span class="k">🚫 Nesting only</span><span class="v">${n("nestonly")}</span><span class="s">nesting off · any Groups Administrator can add a member</span></div>
         <div class="wo-vt ${n("open") ? "bad" : "ok"}"><span class="k">Open</span><span class="v">${n("open")}</span><span class="s">neither lock${n("cannot") ? ` · ${n("cannot")} cannot here` : ""}</span></div>`;

    // ---- chips
    const filter = o.filter || "all";
    const chips = CATS.filter(([k]) => k === "all" || k === "attention" || n(k)).filter(([k]) => !(nestNA && (k === "vaultonly" || k === "nestonly")))
      .map(([k, l, cls, tone]) => `<button class="fchip${tone ? ` ${tone}` : ""}${filter === k ? " active" : ""}" data-pr-filter="${k}">${l} ${pill(n(k), cls)}</button>`).join("");

    // ---- banner for a directory without the property
    const banner = nestNA
      ? `<div class="wo-callout" style="margin:12px 0 0"><b>🚫 Nesting protection is not available on this tenant.</b> The directory does not recognise the <code>disableNesting</code> property (it is not generally available yet), so the second lock cannot be set here — a migration's <i>Disable nesting</i> tick could not take effect either. Until Microsoft ships it, nesting stays <b>in sight</b>: 👥 CA groups reads every group's nested groups on each scan, the ↪ chip filters to them, and a nested group inside an exclusion is Needs attention.
          <div class="mini muted" style="margin-top:4px">Check yourself: <code>GET v1.0/groups/{id}?$select=id,disableNesting</code> — no property in the answer means not supported; <code>true</code> means set.</div></div>`
      : "";

    // ---- table
    const q = String(o.q || "").trim().toLowerCase();
    const shown = rows.filter((r) => matches(r.c, filter)).filter((r) => !q || String(r.g.name || "").toLowerCase().includes(q));
    const ticks = o.ticks || new Map();
    const tk = (id) => ticks.get(id) || { vault: false, nest: false };
    const vaultCell = (r) => {
      const { g, c } = r;
      if (c.frozen) return `<span class="wo-state off">${dot("off")}🧊 frozen in ${esc(c.prot.auName)}</span><div class="mini muted">role-assignable AND restricted — <b>nobody</b> can change its members. Take it out of the unit, or ⑦ Migrate it.</div>`;
      if (c.prot) return `<span class="wo-state on">${dot("on")}🔒 in ${esc(c.prot.auName)}</span>`;
      if (c.ra) return `<span class="wo-state na">${dot("na")}cannot — role-assignable</span><div class="mini muted">a vault would freeze it: nobody could change its members</div>`;
      if (c.ineligible) return `<span class="wo-state na">${dot("na")}cannot</span><div class="mini muted">${esc(c.ineligible)}</div>`;
      if (c.vault === "unknown") return `<span class="wo-state na">${dot("na")}unknown</span><div class="mini muted">the administrative units could not be read</div>`;
      const d = c.dest || {};
      const where = d.source === "persona" ? `→ <b>${esc(d.auName)}</b> <span class="muted">(${d.by === "map" ? "mapped" : "persona"})</span>`
        : d.source === "missing" ? `<span style="color:var(--off)">→ <b>${esc(d.auName)}</b> does not exist — create it in 🛡 Restricted AUs first</span>`
          : d.source === "unset" ? `<span style="color:var(--report)">unmapped — no CA number in the name and no mapping. Map it once in 🛡 Restricted AUs → 🏷 Group personas, or pick a fallback unit in Settings</span>`
            : `<span style="color:var(--report)">→ <b>${esc(d.auName)}</b> (fallback)</span>`;
      return `<span class="wo-state off">${dot("off")}unprotected</span><div class="mini">${where}</div>`;
    };
    const nestCell = (r) => {
      const { c } = r;
      if (c.nest === "impossible") return `<span class="wo-state na">${dot("na")}impossible</span><div class="mini muted">Entra never nests into a role-assignable group</div>`;
      if (c.nest === "disabled") return `<span class="wo-state on">${dot("on")}🚫 disabled</span>`;
      if (c.nest === "blocked") return `<span class="wo-state off">${dot("off")}allowed · <b>${c.nested} nested group${c.nested === 1 ? "" : "s"} inside</b></span><div class="mini muted">must be emptied of groups first — 👥 CA groups shows them</div>`;
      if (c.nest === "allowed") return `<span class="wo-state off">${dot("off")}allowed</span><div class="mini muted">a group can be nested into it</div>`;
      if (c.nest === "unknown") return `<span class="wo-state na">${dot("na")}not reported</span>${c.nested ? `<div class="mini" style="color:var(--report)">↪ ${c.nested} nested group${c.nested === 1 ? "" : "s"} inside</div>` : ""}`;
      return `<span class="mini muted">reading…</span>`;
    };
    const applyCell = (r) => {
      const { g, c } = r, t = tk(g.id);
      if (c.cat === "cannot") return c.ra && !c.prot ? `<button class="btn sm" data-pr-migrate="${esc(g.id)}">⑦ Migrate it first</button>` : '<span class="mini muted">—</span>';
      if (c.cat === "full") return '<span class="wo-state on">✓ fully protected</span>';
      const v = c.canVault ? `<label class="pr-tick"><input type="checkbox" data-pr-tick="vault" data-pr-id="${esc(g.id)}"${t.vault ? " checked" : ""}> place in vault</label>`
        : c.prot ? '<label class="pr-tick dis"><input type="checkbox" disabled> place in vault <span class="muted">— already</span></label>'
          : '<label class="pr-tick dis"><input type="checkbox" disabled> place in vault <span class="muted">— see left</span></label>';
      const nn = nestNA ? '<label class="pr-tick dis"><input type="checkbox" disabled> disable nesting <span class="muted">— n/a</span></label>'
        : c.canNest ? `<label class="pr-tick"><input type="checkbox" data-pr-tick="nest" data-pr-id="${esc(g.id)}"${t.nest ? " checked" : ""}> disable nesting</label>`
          : c.nest === "disabled" ? '<label class="pr-tick dis"><input type="checkbox" disabled> disable nesting <span class="muted">— already</span></label>'
            : c.nest === "blocked" ? '<label class="pr-tick dis"><input type="checkbox" disabled> disable nesting <span class="muted">— blocked</span></label>'
              : '<label class="pr-tick dis"><input type="checkbox" disabled> disable nesting <span class="muted">— not reported</span></label>';
      return v + nn;
    };
    const anyTick = (id) => { const t = tk(id); return !!(t.vault || t.nest); };
    const tbody = shown.map((r) => `<tr class="${anyTick(r.g.id) ? "pr-sel" : ""}">
        <td><input type="checkbox" data-pr-row="${esc(r.g.id)}"${anyTick(r.g.id) ? " checked" : ""}${(r.c.canVault || r.c.canNest) ? "" : " disabled"}></td>
        <td><b>${esc(r.g.name)}</b>${r.g.manual ? ' <span class="tag" title="Added by hand — stays across a rescan">by hand</span>' : ""}${r.g.dynamic ? ' <span class="tag">dynamic</span>' : ""}<div class="mini muted">${esc(r.g.label || (r.c.dest && r.c.dest.code ? `${r.c.dest.code} · ${r.c.dest.by === "map" ? "mapped" : "by CA number"}` : "exclusion group"))}${r.g.manual ? ' <button class="btn sm" data-pr-unadd="' + esc(r.g.id) + '" title="Take it off this list">✕</button>' : ""}</div></td>
        <td class="mini">${(r.g.refs && r.g.refs.exclude || []).length ? `${r.g.refs.exclude.length} polic${r.g.refs.exclude.length === 1 ? "y" : "ies"}` : '<span class="muted">not referenced</span>'}</td>
        <td>${vaultCell(r)}</td>
        <td>${nestCell(r)}</td>
        <td>${applyCell(r)}</td>
      </tr>`).join("");

    // ---- counts for the bar
    const jobs = rows.filter((r) => (tk(r.g.id).vault && r.c.canVault) || (tk(r.g.id).nest && r.c.canNest));
    const nV = jobs.filter((r) => tk(r.g.id).vault && r.c.canVault).length;
    const nN = jobs.filter((r) => tk(r.g.id).nest && r.c.canNest).length;
    const selectable = shown.filter((r) => r.c.canVault || r.c.canNest);
    const allOn = selectable.length && selectable.every((r) => anyTick(r.g.id));

    // ---- settings drawer (ids shared with ⑥ so the existing handlers serve it)
    const s = o.settings || {};
    const unmatched = s.unmatched || 0;
    const settings = `<details class="pr-settings"${s.open ? " open" : ""}><summary>Settings — fallback unit${unmatched ? ` <span class="pill amber">${unmatched} unmapped</span>` : ""}, scoped administrators, acknowledgement</summary>
      <div class="pr-settings-grid">
        <div><label class="mini" style="display:block;margin:0 0 4px">Fallback administrative unit <span class="muted">— used only for the ${unmatched} unmapped group${unmatched === 1 ? "" : "s"}; every other group goes to its persona's own vault</span></label>
          <select id="cgRmauAu" class="btn" style="cursor:pointer;max-width:420px">
            <option value=""${s.auChoice ? "" : " selected"}>— none: skip the groups that match no persona —</option>
            ${(s.rmaus || []).map((a) => `<option value="${esc(a.id)}"${s.auChoice === a.id ? " selected" : ""}>${esc(a.name)} (existing)</option>`).join("")}
            <option value="new"${s.auChoice === "new" ? " selected" : ""}>＋ Create a new one…</option>
          </select>
          ${s.auChoice === "new" ? `<input id="cgRmauName" class="txt" value="${esc(s.auName || "")}" autocomplete="off" style="max-width:420px;margin-top:6px;letter-spacing:normal;font-weight:400">
            <p class="mini muted" style="margin-top:4px">Created with <code>isMemberManagementRestricted: true</code> — immutable.</p>` : ""}</div>
        <div><label class="mini" style="display:block;margin:0 0 4px">Scoped administrator${(s.adminCount || 0) > 1 ? `s <span class="tag">${s.adminCount}</span>` : ""} <span class="muted">(optional, recommended — Groups Administrator scoped to every unit written to)</span></label>
          <input id="cgRmauAdmin" class="txt" list="cgRmauAdminList" value="${esc(s.admin || "")}" placeholder="UPN, or several separated by a comma" autocomplete="off" spellcheck="false" style="max-width:560px;letter-spacing:normal;font-weight:400">
          <datalist id="cgRmauAdminList"></datalist></div>
      </div>
      <label class="chk" style="margin-top:12px;display:block"><input type="checkbox" id="cgRmauAck"${s.ack ? " checked" : ""}> I understand that after this, membership of the vaulted groups can <b>only</b> be changed by administrative-unit-scoped roles, and that a group with nesting disabled refuses any group as a member until it is turned back on in the portal.</label>
    </details>`;

    const ledger = `<div id="prLedger"></div>`;
    const bar = `<div class="pr-barwrap"><div class="cgg-bulk">
        <span>🔒 <b>${jobs.length ? `Protect ${jobs.length} group${jobs.length === 1 ? "" : "s"}` : "Nothing ticked"}</b></span>
        <span class="mini" style="opacity:.85">${jobs.length ? `· ${nV} into ${nV === 1 ? "its" : "their"} vault${nV === 1 ? "" : "s"} · ${nN} nesting off` : "tick a row, or the header box for every row that still lacks a lock"}</span>
        <span style="flex:1"></span>
        <button class="btn" id="cgRmauRecheck">⟳ Re-check</button>
        <button class="btn primary" id="prGo"${jobs.length && !o.busy ? "" : " disabled"}>Protect ${jobs.length || ""}</button>
      </div></div>`;

    return `<div class="list-card wo-card">
        <div class="wo-verdicts wo-5" style="margin-top:0">${tiles}</div>
        ${banner}
      </div>
      ${o.results ? resultsHtml(o.results, o) : ""}
      <div class="list-card wo-card">
        <div class="chip-filter" style="margin:0 0 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${chips}
          <input id="cgRmauQ" class="txt" list="cgRmauQList" value="${esc(o.q || "")}" placeholder="Search the exclusion groups…" autocomplete="off" spellcheck="false" style="max-width:300px;margin-left:auto;letter-spacing:normal;font-weight:400">
          <datalist id="cgRmauQList">${cands.map((g) => `<option value="${esc(g.name)}"></option>`).join("")}</datalist>
        </div>
        <div class="cg-tablewrap"><table class="cg-table pr-table">
          <thead><tr><th style="width:30px"><input type="checkbox" data-pr-all${allOn ? " checked" : ""}${selectable.length ? "" : " disabled"} title="Tick every row that still lacks a lock"></th><th>Group</th><th style="width:100px">Used by</th><th style="width:26%">🔒 Members — restricted unit</th><th style="width:20%">🚫 Nesting</th><th style="width:190px">Apply</th></tr></thead>
          <tbody>${tbody || `<tr><td colspan="6" class="mini muted" style="padding:14px">${q ? `No exclusion group matches “${esc(o.q)}”.` : "Nothing in this filter."}</td></tr>`}</tbody>
        </table></div>
        <div class="legend mini muted" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px"><span>${dot("on")}protected</span><span>${dot("off")}open</span><span>${dot("na")}cannot / not applicable</span><span>Tick a row for both locks it lacks, or one box for one lock; the header box ticks every row that lacks something. Nothing is ticked for you.</span></div>
        ${ledger}
        ${settings}
        ${o.find || ""}
        <p class="mini muted" style="margin-top:10px">Consents <code>AdministrativeUnit.ReadWrite.All</code> and <code>Group-NestingSupport.ReadWrite.All</code> on demand (plus <code>RoleManagement.ReadWrite.Directory</code> for a scoped administrator). Placing a group needs the Privileged Role Administrator role and an Entra ID P1 licence for administrative-unit administrators. Nothing here recreates a group: where <code>disableNesting</code> cannot be set in place it is reported, never worked around.</p>
      </div>
      ${bar}`;
  }

  // -------------------------------------------------------------- results --
  function resultsHtml(res, o) {
    const rows = res.rows || [];
    const vOk = rows.filter((r) => r.vault && r.vault.state === "added").length;
    const nOk = rows.filter((r) => r.nest && r.nest.state === "disabled").length;
    const bad = rows.filter((r) => (r.vault && r.vault.state === "failed") || (r.nest && r.nest.state === "failed")).length;
    const na = rows.filter((r) => r.nest && r.nest.state === "unsupported").length;
    const skipped = rows.filter((r) => r.vault && r.vault.state === "skipped").length;
    return `<div class="list-card wo-card"><h3 class="wo-h">✅ Protection applied ${bad ? pill(bad, "red") : ""}</h3>
      <p class="mini" style="margin:6px 0 0">${vOk} group${vOk === 1 ? "" : "s"} placed in ${res.units && res.units.length ? res.units.map((u) => `<b>${esc(u.name)}</b>${u.created ? " <span class=\"tag grant\">created</span>" : ""}`).join(", ") : "a vault"} · ${nOk} nesting disabled${na ? ` · ${na} nesting not available in this tenant` : ""}${skipped ? ` · ${skipped} skipped (the row says why)` : ""}${bad ? ` · <b style="color:var(--off)">${bad} refused — see the ledger</b>` : ""}.
        ${res.admins && res.admins.length ? `<br>Scoped administrators: ${res.admins.map((a) => `${esc(a.upn)} → ${esc(a.au)} ${a.ok ? "✓" : `<span style="color:var(--off)">✗ ${esc(a.error || "")}</span>`}`).join(" · ")}` : ""}</p>
      <p class="mini" style="color:var(--report);margin:8px 0 0">⚠ From now on, membership of the vaulted groups can only be changed by principals holding a role scoped to the unit — including by ⑤ Import members.</p>
      <div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn" id="prReport">📄 Change report</button><button class="btn" id="prDismiss">✕ Dismiss</button></div>
    </div>`;
  }

  // --------------------------------------------------------------- report --
  function report(res, meta = {}) {
    const rows = res.rows || [];
    const L = [`# Protect exclusions — ${meta.tenant || "tenant"}`, "", meta.generatedBy || "", "",
      `Two locks per Conditional Access exclusion group: a **restricted management administrative unit** (only AU-scoped roles may change the members) and **disableNesting** (no group can be added as a member).`, "",
      `## Result`, "", `| Group | Restricted unit | Nesting |`, `| --- | --- | --- |`];
    const v = (x) => !x ? "—" : x.state === "added" ? `added to ${x.auName}` : x.state === "already" ? `already in ${x.auName}` : x.state === "skipped" ? `skipped — ${x.error}` : x.state === "failed" ? `FAILED — ${x.error}` : x.state;
    const nn = (x) => !x ? "—" : x.state === "disabled" ? "disabled (read back)" : x.state === "unsupported" ? "not available in this tenant" : x.state === "failed" ? `STILL ALLOWED — ${x.error}` : x.state;
    for (const r of rows) L.push(`| ${r.name} | ${v(r.vault)} | ${nn(r.nest)} |`);
    if (res.units && res.units.length) { L.push("", `## Administrative units written to`, ""); res.units.forEach((u) => L.push(`- **${u.name}**${u.created ? " _(created by this run — isMemberManagementRestricted, immutable)_" : ""}`)); }
    if (res.admins && res.admins.length) { L.push("", `## Scoped administrators`, ""); res.admins.forEach((a) => L.push(`- ${a.upn} → ${a.au}: ${a.ok ? "granted" : `FAILED — ${a.error}`}`)); }
    if (rows.some((r) => r.nest && r.nest.state === "unsupported")) L.push("", `_Nesting could not be disabled: this directory does not recognise the disableNesting property yet. Nesting stays in sight — 👥 CA groups reads every group's nested groups on each scan, and a nested group inside an exclusion is Needs attention._`);
    L.push("", `_From now on, membership of the vaulted groups can only be changed by principals holding a role scoped to the unit._`);
    return L.join("\n");
  }

  return { classify, defaultTicks, CATS, matches, render, report };
})();
