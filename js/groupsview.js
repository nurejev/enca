// ======================================================================
// 👥 Conditional Access groups — the LIST + DRAWER shell (T12 5.0).
//
// Seven tabs each started their own scan, and "who is in CA011-Exclusion"
// was three clicks and a 708 × 123 matrix. This view is the alternative:
// one tenant read, then a list of groups you act on, and a detail drawer
// that follows the row you clicked. Every engine underneath is unchanged —
// CaGroups.scan / loadMembers, Assign, the RMAU protect flow, the migrate
// plan, the CSV import — this file only renders; app.js routes the clicks
// into the existing flows with the selection carried across.
//
//   GroupsView.classify(row, ctx)      → { kind, kindLabel, flags[], attention }
//   GroupsView.render(model, opts)     → html (list + bulk bar + drawer)
//   GroupsView.chips(model, active)    → html
// model: { rows (scan rows + members/children when read), prot: Map|null,
//          policies: [{id, seq, name, state}], cat (active baseline) }
// opts:  { filter, q, sel:Set<name>, open:name|null, drTab, hist, drBusy }
// ======================================================================
const GroupsView = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const STATE_LABEL = { enabled: "On", enabledForReportingButNotEnforced: "Report-only", disabled: "Off" };
  const STATE_CLS = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const dot = (c) => `<span class="wo-dot ${c}"></span>`;
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const tail = (n, len = 14) => { n = String(n || ""); return n.length <= len ? n : "…" + n.slice(-len + 1); };
  // a ref is {id, name} from the scan; the demo scan carries bare ids
  const norm = (p, ctx) => typeof p === "string" ? { id: p, name: (ctx.nameOf && ctx.nameOf(p)) || p } : (p || { id: "", name: "" });
  const refsOf = (r, ctx) => ({ include: (r.refs && r.refs.include || []).map((p) => norm(p, ctx)), exclude: (r.refs && r.refs.exclude || []).map((p) => norm(p, ctx)) });

  // What kind of group is this, in the baseline's own words.
  function classify(r, ctx) {
    const name = r.name || "", cat = ctx.cat;
    const isExcl = (() => { try { return !!(cat && cat.isExclusionGroup && cat.isExclusionGroup(name)); } catch { return false; } })() || /-Exclusions?$|-Exclusion-| - Exclude$/i.test(name);
    const ca = (name.match(/\bCA(\d{3,4})\b/) || [])[0] || "";
    let kind = "other", kindLabel = "";
    if (/BreakGlass|Emergency_Access/i.test(name)) { kind = "breakglass"; kindLabel = "break-glass"; }
    else if (/-DG-/i.test(name)) { kind = "deploy"; kindLabel = "deploy group"; }
    else if (/-Persona-|^CA-.*(Internals|Admins|Guests|ServiceAccounts|Externals)$/i.test(name)) { kind = "persona"; kindLabel = "persona group"; }
    else if (isExcl) { kind = "exclusion"; kindLabel = ca ? `exclusion for ${ca}` : "exclusion group"; }
    const prot = r.id && ctx.prot ? ctx.prot.get(r.id) : null;
    const R = refsOf(r, ctx);
    const incOn = R.include.filter((p) => ctx.stateOf(p.id) === "enabled").length;
    const excOn = R.exclude.filter((p) => ctx.stateOf(p.id) === "enabled").length;
    const flags = [];
    if (r.status === "missing") flags.push("missing");
    if (r.status === "dangling") flags.push("dangling");
    if (r.status === "extra") flags.push("extra");
    if (r.id && r.memberTotal === 0) flags.push("empty");
    if (r.id && (kind === "exclusion" || kind === "breakglass") && ctx.prot && !prot && !r.roleAssignable) flags.push("unprotected");
    if (r.roleAssignable) flags.push("roleassignable");
    // nested groups are known from the scan (nestedGroups, direct group
    // members) before any member read (children, from the transitive read)
    const nestedN = (r.children || r.nestedGroups || []).length;
    if (nestedN) flags.push("nested");
    if (r.dynamic) flags.push("dynamic");
    if (r.drift) flags.push("drift");
    if (r.nesting === "allowed" && kind === "exclusion") flags.push("nestingallowed");
    // a group nested inside an exclusion or break-glass group widens a
    // standing bypass by one membership change somewhere else — attention
    const attention = flags.some((f) => ["missing", "dangling", "unprotected", "drift"].includes(f)) || (nestedN > 0 && (kind === "exclusion" || kind === "breakglass"));
    return { kind, kindLabel, ca, isExcl, prot, incOn, excOn, flags, attention, nestedN };
  }

  const CHIPS = [
    ["all", "All", "zero"], ["attention", "⚠ Needs attention", "red"], ["missing", "Missing from tenant", "amber"], ["dangling", "Referenced but gone", "red"],
    ["empty", "Empty", "zero"], ["unprotected", "Not protected", "amber"], ["roleassignable", "Role-assignable", "zero"], ["nested", "↪ Has nested groups", "red"], ["extra", "Not in the baseline", "zero"],
  ];
  function matches(r, c, filter) {
    if (filter === "all") return true;
    if (filter === "attention") return c.attention;
    return c.flags.includes(filter);
  }
  function chips(model, active) {
    const ctx = model.ctx;
    const counts = {};
    model.rows.forEach((r) => { const c = classify(r, ctx); CHIPS.forEach(([k]) => { if (matches(r, c, k)) counts[k] = (counts[k] || 0) + 1; }); });
    return CHIPS.filter(([k]) => k === "all" || k === "nested" || counts[k]).map(([k, l, cls]) => `<button class="fchip${active === k ? " active" : ""}" data-cgg-filter="${k}">${l} ${pill(counts[k] || 0, cls)}</button>`).join("");
  }

  function membersCell(r, c) {
    if (!r.id) return '<span class="mini muted">—</span>';
    if (r.memberError) return `<span class="mini" style="color:var(--off)">could not read</span>`;
    const pre = r.members == null && r.nestedGroups && r.nestedGroups.length ? `<div class="mini" style="color:var(--off)" title="${esc(r.nestedGroups.map((g) => g.name).join(", "))}">↪ ${r.nestedGroups.length} nested group${r.nestedGroups.length === 1 ? "" : "s"}</div>` : "";
    if (r.members == null) return `<span class="mini muted">not read</span> <button class="btn sm" data-cgg-read="${esc(r.name)}" title="Read the members of this group">read</button>${pre}`;
    const direct = r.directIds ? r.members.filter((m) => m.direct).length : null;
    const nested = r.directIds ? r.members.length - direct : null;
    const via = r.children && r.children.length ? ` via ${esc(tail(r.children[0].name))}${r.children.length > 1 ? ` +${r.children.length - 1}` : ""}` : "";
    return `<b class="num">${r.memberTotal}</b>${r.memberTotal > r.members.length ? ` <span class="mini muted">(first ${r.members.length})</span>` : ""}${direct != null && r.memberTotal ? `<div class="mini muted">${direct === r.memberTotal ? "all direct" : nested === r.memberTotal ? `all${via}` : `${direct} direct · ${nested}${via}`}</div>` : r.dynamic ? '<div class="mini muted">dynamic</div>' : ""}`;
  }
  function usedByCell(r, ctx) {
    const { include: inc, exclude: exc } = refsOf(r, ctx);
    if (!inc.length && !exc.length) return '<span class="mini muted">no policy</span>';
    const one = (p) => { const st = ctx.stateOf(p.id); return `<b>${esc(ctx.seqOf(p.id) || p.name)}</b> ${st ? `<span class="wo-state ${STATE_CLS[st]}">${dot(STATE_CLS[st])}${STATE_LABEL[st]}</span>` : ""}`; };
    const parts = [];
    if (exc.length) parts.push(`excluded by ${exc.length === 1 ? one(exc[0]) : `<b>${exc.length}</b>`}`);
    if (inc.length) parts.push(`included by ${inc.length === 1 ? one(inc[0]) : `<b>${inc.length}</b>`}`);
    return `<span class="mini">${parts.join("<br>")}</span>`;
  }
  function protCell(r, c, ctx) {
    if (!r.id) return '<span class="mini muted">—</span>';
    if (c.prot) return `<span class="res nc" title="${esc(c.prot.auName)}">🔒 ${esc(c.prot.auName.replace(/^CAB-SEC-RMAU-/i, "RMAU-"))}</span>`;
    if (r.roleAssignable) return '<span class="mini" style="color:var(--warn-fg)">role-assignable</span>';
    if (!ctx.prot) return '<span class="mini muted">not read</span>';
    if (c.kind === "exclusion" || c.kind === "breakglass") return '<span class="res wp">not protected</span>';
    return '<span class="mini muted">n/a</span>';
  }
  function rowActions(r, c) {
    const a = [];
    if (!r.id && r.template) a.push(`<button class="btn sm primary" data-cgg-act="create" data-cgg-name="${esc(r.name)}">＋ Create</button>`);
    if (r.status === "dangling") a.push(`<button class="btn sm" data-cgg-act="restore" data-cgg-name="${esc(r.name)}" title="Restore the reference in 👥 Assign">🔁 Restore</button>`);
    if (r.id && c.kind === "deploy") a.push(`<button class="btn sm" data-cgg-act="wave" data-cgg-name="${esc(r.name)}" title="Open 🌊 Who is the wave to CA">🌊</button>`);
    a.push(`<button class="btn sm" data-cgg-act="menu" data-cgg-name="${esc(r.name)}" title="More actions for this group">⋯</button>`);
    return a.join(" ");
  }
  function statusCell(r, c) {
    const S = { present: ["present", "nc"], missing: ["missing", "wp"], dangling: ["gone", "wb"], extra: ["present", "nc"] };
    const [l, cls] = S[r.status] || [r.status, ""];
    return `<span class="res ${cls}">${l}</span>${r.drift ? `<div class="mini" style="color:var(--warn-fg)" title="${esc(r.drift)}">drift</div>` : ""}`;
  }

  function list(model, o) {
    const ctx = model.ctx;
    const rows = model.rows.map((r) => ({ r, c: classify(r, ctx) }))
      .filter(({ r, c }) => matches(r, c, o.filter))
      .filter(({ r }) => !o.q || r.name.toLowerCase().includes(o.q) || (r.id || "").toLowerCase().includes(o.q) || (r.members || []).some((m) => (m.name || "").toLowerCase().includes(o.q) || (m.upn || "").toLowerCase().includes(o.q)))
      .sort((a, b) => (b.c.attention - a.c.attention) || a.r.name.localeCompare(b.r.name));
    const allSel = rows.length && rows.every(({ r }) => o.sel.has(r.name));
    return `<div class="list-card cgg-list"><div class="gu-tw" style="border:0;border-radius:0"><table class="plist cgg-tbl">
      <thead><tr><th style="width:28px"><input type="checkbox" class="cgg-chk" data-cgg-selall="1"${allSel ? " checked" : ""} title="Select every group in this view"></th><th>Group</th><th>Status</th><th>Members</th><th>Used by</th><th>Protection</th><th></th></tr></thead>
      <tbody>${rows.map(({ r, c }) => `<tr class="cgg-row${o.open === r.name ? " open" : ""}${o.sel.has(r.name) ? " sel" : ""}" data-cgg-row="${esc(r.name)}">
        <td><input type="checkbox" class="cgg-chk" data-cgg-sel="${esc(r.name)}"${o.sel.has(r.name) ? " checked" : ""}></td>
        <td><b>${esc(r.name)}</b><div class="mini muted">${esc([c.kindLabel, r.roleAssignable ? "role-assignable" : "", r.dynamic ? "dynamic" : "", r.status === "extra" ? "not in baseline" : "", r.status === "missing" && r.sources.length ? `expected by ${r.sources.join(", ")}` : ""].filter(Boolean).join(" · "))}</div></td>
        <td>${statusCell(r, c)}</td>
        <td>${membersCell(r, c)}</td>
        <td>${usedByCell(r, ctx)}</td>
        <td>${protCell(r, c, ctx)}</td>
        <td class="cgg-acts">${rowActions(r, c)}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="mini muted" style="padding:16px">No group matches ${o.filter === "all" ? "the search" : "this filter"}.</td></tr>`}</tbody></table></div>
      <p class="mini muted" style="padding:8px 14px">${rows.length} of ${model.rows.length} groups · sorted needs-attention first · click a row for its detail, tick rows for the actions bar</p></div>`;
  }

  // The bar shows for the ticked rows — or, with nothing ticked, for the
  // row that is open in the drawer, so a click is enough to act on a group.
  function bulkBar(model, o) {
    const sel = o.sel.size ? o.sel : (o.open ? new Set([o.open]) : null);
    if (!sel) return "";
    const n = sel.size;
    const rows = model.rows.filter((r) => sel.has(r.name));
    const missing = rows.filter((r) => !r.id && r.template).length;
    const unread = rows.filter((r) => r.id && r.members == null).length;
    return `<div class="cgg-bulk">
      <b>${o.sel.size ? `${n} selected` : `${esc(o.open)} <span class="mini" style="font-weight:400;opacity:.8">(open — tick rows to act on more)</span>`}</b>
      ${unread ? `<button class="btn" data-cgg-bulk="read">👥 Read members${unread < n ? ` (${unread})` : ""}</button>` : ""}
      <button class="btn" data-cgg-bulk="compare" title="The members × groups matrix for the selected groups">⊞ Compare selected</button>
      <button class="btn" data-cgg-bulk="assign">🎯 Assign to policies…</button>
      <button class="btn" data-cgg-bulk="rmau">🔒 Protect in RMAU…</button>
      <button class="btn" data-cgg-bulk="migrate">🧹 Migrate off role-assignable…</button>
      <button class="btn" data-cgg-bulk="csv">📥 Import members (CSV)…</button>
      <span class="spacer"></span>
      ${missing ? `<button class="btn primary" data-cgg-bulk="create">＋ Create ${missing} missing</button>` : ""}
      <button class="btn" data-cgg-bulk="clear" title="${o.sel.size ? "Clear the selection" : "Close"}">✕</button>
    </div>`;
  }

  // ---------------------------------------------------------- drawer --
  function drawer(model, o) {
    const ctx = model.ctx;
    if (!o.open) return `<div class="list-card cgg-drawer cgg-empty"><p class="mini muted">Click a group for its members, policies, protection and history.</p></div>`;
    const r = model.rows.find((x) => x.name === o.open);
    if (!r) return "";
    const c = classify(r, ctx);
    const tabs = [["members", `Members${r.memberTotal != null ? ` (${r.memberTotal})` : ""}`], ["policies", `Policies (${refsOf(r, ctx).include.length + refsOf(r, ctx).exclude.length})`], ["protection", "Protection"], ["history", "History"]];
    const facts = [];
    if (r.id && r.members) { const d = r.directIds ? r.members.filter((m) => m.direct).length : null; facts.push(`<span class="wo-fact">${r.memberTotal} member${r.memberTotal === 1 ? "" : "s"}${d != null ? ` · <b>${d} direct · ${r.memberTotal - d} nested</b>` : ""}</span>`); }
    if (c.prot) facts.push(`<span class="wo-fact">Protected <b>${esc(c.prot.auName)}</b></span>`);
    else if (r.id && ctx.prot && (c.kind === "exclusion" || c.kind === "breakglass") && !r.roleAssignable) facts.push('<span class="wo-fact warn">not protected</span>');
    if (r.roleAssignable) facts.push('<span class="wo-fact warn">role-assignable</span>');
    if (r.dynamic) facts.push(`<span class="wo-fact">dynamic</span>`);
    if (c.excOn && r.memberTotal) facts.push(`<span class="wo-fact warn">excluded from <b>${c.excOn}</b> enforced polic${c.excOn === 1 ? "y" : "ies"} — every member is a standing bypass</span>`);
    const head = `<div class="cgg-drhead">
      <div><div class="wo-name">${esc(r.name)}</div>
        <div class="mini muted">${esc(c.kindLabel || (r.status === "extra" ? "not in the baseline" : "group"))}${r.id ? ` · <span class="uupn">${esc(r.id)}</span>` : " · not in this tenant"}${r.description ? ` · ${esc(r.description)}` : ""}</div>
        <div class="wo-facts">${facts.join("")}</div></div>
      <div class="wo-actions">${r.id ? `<button class="btn sm" data-cgg-act="analyzer" data-cgg-name="${esc(r.name)}" title="🔗 User or Group analyzer — everything that points at this group">🔗</button>` : ""}<button class="btn sm" data-cgg-close title="Close">✕</button></div>
    </div>
    <div class="cgg-dtabs">${tabs.map(([k, l]) => `<button class="${o.drTab === k ? "on" : ""}" data-cgg-dtab="${k}">${l}</button>`).join("")}</div>`;
    let body = "";
    if (o.drTab === "members") body = drawerMembers(r, c, o);
    else if (o.drTab === "policies") body = drawerPolicies(r, ctx);
    else if (o.drTab === "protection") body = drawerProtection(r, c, ctx);
    else body = drawerHistory(r, o);
    return `<div class="list-card cgg-drawer">${head}${body}</div>`;
  }

  function drawerMembers(r, c, o) {
    if (!r.id) return `<p class="mini muted">This group does not exist in the tenant yet.${r.template ? ' <button class="btn sm primary" data-cgg-act="create" data-cgg-name="' + esc(r.name) + '">＋ Create it</button>' : ""}</p>`;
    if (r.members == null) return `${r.nestedGroups && r.nestedGroups.length ? `<div class="wo-callout bad" style="margin:0 0 8px"><b>↪ ${r.nestedGroups.length} nested group${r.nestedGroups.length === 1 ? "" : "s"}:</b> ${r.nestedGroups.map((g) => esc(g.name)).join(", ")}. Whoever manages ${r.nestedGroups.length === 1 ? "that group" : "those groups"} decides who is in this one.</div>` : ""}<div class="run-prompt" style="padding:18px"><button class="btn primary" data-cgg-read="${esc(r.name)}">👥 Read the members</button><p class="mini muted">Transitive, first 500, with the nested groups they came through.</p></div>`;
    if (r.memberError) return `<p class="mini" style="color:var(--off)">Could not read the members: ${esc(r.memberError)}</p>`;
    const direct = r.directIds ? r.members.filter((m) => m.direct) : r.members;
    const children = r.children || [];
    const addBox = r.dynamic ? '<p class="mini muted">Dynamic group — the rule decides the membership.</p>'
      : `<div class="cgg-add"><input id="cgAddUser" class="txt" list="cgUserSug" placeholder="Add a member — name or UPN" spellcheck="false" autocomplete="off"><input id="cgAddGroup" type="hidden" value="${esc(r.name)}"><button class="btn primary" id="cgAddGo">＋ Add</button></div>
        <div id="cgAddLog" class="mini" style="margin:4px 0 6px">${o.addMsg ? `<span style="${o.addMsg.bad ? "color:var(--off)" : ""}">${o.addMsg.html}</span>` : ""}</div>`;
    const li = (m, kind, gname, gid) => `<li class="${kind}"><span><b>${esc(m.name)}</b>${m.disabled ? ' <span class="tag block">disabled</span>' : ""} <span class="mini muted">${esc(m.upn || "")}</span></span>${r.dynamic ? "" : `<button class="cgg-x" data-cgg-rm="${esc(m.id)}" data-cgg-rmgroup="${esc(gname)}" data-cgg-rmgid="${esc(gid || "")}" title="Remove from ${esc(gname)}">×</button>`}</li>`;
    const tree = `<ul class="cgg-tree">
      ${direct.map((m) => li(m, "d", r.name, r.id)).join("")}
      ${direct.length ? "" : '<li class="d mini muted">no direct members</li>'}
      ${children.map((ch) => { const open = o.open && (o.nestOpen || new Set()).has(ch.id); return `<li class="g"><button class="cgg-nest" data-cgg-nest="${esc(ch.id)}">${open ? "▾" : "▸"} <b>${esc(ch.name)}</b></button> <span class="mini muted">nested group · ${ch.memberTotal} member${ch.memberTotal === 1 ? "" : "s"}${ch.dynamic ? " · dynamic" : ""}${ch.error ? ` · could not read: ${esc(ch.error)}` : ""}</span></li>${open ? ch.members.map((m) => li(m, "c", ch.name, ch.dynamic ? "" : ch.id)).join("") + (ch.memberTotal > ch.members.length ? `<li class="c mini muted">… ${ch.memberTotal - ch.members.length} more</li>` : "") : ""}`; }).join("")}
      ${r.memberTotal > r.members.length ? `<li class="d mini muted">… ${r.memberTotal - r.members.length} more (first ${r.members.length} read)</li>` : ""}
    </ul>`;
    const bypass = c.excOn && r.memberTotal ? `<div class="wo-callout bad"><b>Standing bypass.</b> This group is excluded from ${c.excOn} enforced polic${c.excOn === 1 ? "y" : "ies"}, so all ${r.memberTotal} people here skip ${c.excOn === 1 ? "it" : "them"}.${children.length && (r.memberTotal - direct.length) > 0 ? ` ${r.memberTotal - direct.length} come in through a nested group — was excluding the whole group the intent?` : ""}</div>` : "";
    return `${addBox}${tree}${bypass}<p class="mini muted" style="margin-top:8px">× asks first and says what the group is used for. A member under a nested group is removed from that nested group, not from ${esc(r.name)}. Only this group is re-read afterwards.</p>`;
  }
  function drawerPolicies(r, ctx) {
    const row = (p, how) => { const st = ctx.stateOf(p.id); return `<tr><td><span class="pol-link" data-polid="${esc(p.id)}">${ctx.seqOf(p.id) ? `<b>${esc(ctx.seqOf(p.id))}</b> ` : ""}${esc(p.name)}</span></td><td>${how === "exclude" ? '<span class="wo-res blk">excluded</span>' : '<span class="wo-res nc">included</span>'}</td><td>${st ? `<span class="wo-state ${STATE_CLS[st]}">${dot(STATE_CLS[st])}${STATE_LABEL[st]}</span>` : '<span class="mini muted">not loaded</span>'}</td></tr>`; };
    const R = refsOf(r, ctx);
    const rows = R.exclude.map((p) => row(p, "exclude")).concat(R.include.map((p) => row(p, "include")));
    return rows.length ? `<div class="gu-tw"><table class="plist wo-tbl" style="min-width:0"><thead><tr><th>Policy</th><th>How</th><th>State</th></tr></thead><tbody>${rows.join("")}</tbody></table></div><p class="mini muted" style="margin-top:8px">Policy names open the card. To put this group on more policies: <button class="btn sm" data-cgg-act="assign" data-cgg-name="${esc(r.name)}">🎯 Assign to policies…</button></p>`
      : `<p class="mini muted">No policy references this group.${r.status === "extra" ? "" : " A baseline group nothing references is idle."} <button class="btn sm" data-cgg-act="assign" data-cgg-name="${esc(r.name)}">🎯 Assign to policies…</button></p>`;
  }
  function drawerProtection(r, c, ctx) {
    if (!r.id) return '<p class="mini muted">Not in the tenant yet.</p>';
    if (c.prot) return `<p>🔒 In <b>${esc(c.prot.auName)}</b> — a restricted management administrative unit. Its members can only be changed by a role scoped to that unit; tenant-wide admins cannot add themselves.</p>${r.roleAssignable ? '<div class="wo-callout"><b>Frozen.</b> Role-assignable and inside a restricted unit: its membership cannot be read or moved from here. Remove it from the unit first, then convert it.</div>' : ""}`;
    if (r.roleAssignable) return `<p>Role-assignable. A role-assignable group cannot be placed in a restricted unit — the baseline's answer is to <b>migrate</b> it to a plain group that the vault can hold.</p><button class="btn primary" data-cgg-act="migrate" data-cgg-name="${esc(r.name)}">🧹 Migrate off role-assignable…</button>`;
    if (!ctx.prot) return '<p class="mini muted">Protection was not read (the administrative-unit read failed or was refused).</p>';
    if (c.kind === "exclusion" || c.kind === "breakglass") return `<div class="wo-callout"><b>Not protected.</b> Anyone with a tenant-wide group role can add themselves to this ${c.kind === "breakglass" ? "break-glass" : "exclusion"} group and bypass ${c.excOn || "the"} polic${c.excOn === 1 ? "y" : "ies"}.</div><button class="btn primary" data-cgg-act="rmau" data-cgg-name="${esc(r.name)}">🔒 Protect in its persona's unit…</button>`;
    return '<p class="mini muted">Not an exclusion or break-glass group — protection in a restricted unit is not something the baseline asks for here.</p>';
  }
  function drawerHistory(r, o) {
    if (!r.id) return '<p class="mini muted">Not in the tenant yet.</p>';
    if (o.histBusy) return '<div class="run-prompt" style="padding:18px"><div class="spinner"></div><p class="mini muted">Reading the audit log…</p></div>';
    const h = o.hist && o.hist.id === r.id ? o.hist : null;
    if (!h) return `<div class="run-prompt" style="padding:18px"><button class="btn primary" data-cgg-hist="${esc(r.name)}">🕓 Read the last 30 days</button><p class="mini muted">Who added or removed members, and who changed the group — from the directory audit log (AuditLog.Read.All, asked once).</p></div>`;
    if (h.error) return `<p class="mini" style="color:var(--off)">${esc(h.error)}</p>`;
    if (!h.rows.length) return '<p class="mini muted">No change to this group in the audit window.</p>';
    return `<ul class="cgg-tree">${h.rows.map((x) => `<li class="d"><span><b>${esc(x.activity)}</b>${x.target ? ` — ${esc(x.target)}` : ""}<div class="mini muted">${esc(x.when)} · by ${esc(x.by)}${x.result && x.result !== "success" ? ` · ${esc(x.result)}` : ""}</div></span></li>`).join("")}</ul><p class="mini muted" style="margin-top:8px">${h.rows.length} change${h.rows.length === 1 ? "" : "s"} · <a href="#" class="md-tool" data-tool="toolAudit">🕓 Change audit</a> has the field-level view.</p>`;
  }

  function render(model, o) {
    return `<div class="cgg-wrap">${list(model, o)}${drawer(model, o)}</div>${bulkBar(model, o)}`;
  }

  return { classify, chips, render, CHIPS };
})();
