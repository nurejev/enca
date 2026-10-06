// ======================================================================
// 👤 Break-glass accounts in the vault, and 🔑 who can manage the units
// (T20 3.1, beta 32402) — pure: derive and draw. The reads and the writes
// live in app.js (readBgAccounts, readUnitScopes, prApply).
//
// WHY THE ACCOUNTS, NOT ONLY THE GROUP. Putting CAB-SEC-U-BreakGlass in a
// restricted management administrative unit guards WHO IS IN the group. It
// does nothing for the accounts themselves: a tenant-wide User, Authentication
// or Privileged Authentication Administrator can still change their methods,
// disable them or delete them. Microsoft Learn (restricted management AUs):
// a group in the unit is protected, its members are not — the users have to
// be members of the unit in their own right.
//
// THE CATCH, said on the screen every time an account is ticked: the
// break-glass accounts are Global Administrators, and no role that can be
// scoped to an administrative unit may reset a Global Administrator's password
// or methods. Once they are in the unit NOBODY can reset them — recovery is a
// Global or Privileged Role Administrator (the other break-glass account)
// taking the account out of the unit (audited), fixing it, and putting it
// back.
//
// WHO CAN MANAGE THE UNITS (asked 2026-09-24: "also add a check if the scope
// is correct on the rmau — groups and user admin"). A restricted unit blocks
// every tenant-wide role, Global Administrator included, so a unit with no
// scoped role is one nobody can maintain without first assigning themselves
// a role on it. Expected: Groups Administrator on a unit that holds groups,
// User Administrator on a unit that holds users. Active assignments come from
// scopedRoleMembers (Directory.Read.All); PIM-eligible ones only once
// RoleManagement.Read.Directory has been granted (a button asks for it).
// ======================================================================
const BgVault = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + "s")}`;

  const GA = "62e90394-69f5-4237-9190-012177145e10";
  const ROLES = {
    groups: { id: "fdd7a751-b60b-444a-984c-02652fe8fa1c", name: "Groups Administrator" },
    users: { id: "fe930be7-5e62-47db-91af-98c3a49a38b1", name: "User Administrator" },
  };
  const ONMS = /\.onmicrosoft\.com$/i;
  const BG_UNIT = /break[-_ ]?glass|emergency[-_ ]?access|(^|-)bg(-|$)/i;

  // ------------------------------------------------------------ accounts --
  // inp:
  //   members    [user] | null   users in the group, read transitively (null = unread)
  //   error      text            why members is null
  //   prot       Map(objectId → { auId, auName }) | null   every restricted unit's members
  //   unit       { id, name, missing? } | null             where the accounts belong
  //   unitUsers  [user] | null   the users in that unit (stale ones come from here)
  //   ga         Map(userId → { kind, end }) | null
  //              kind: permanent | timebound | activated | active | eligible | none
  //   pim        true when the PIM reads were made (permanence and eligibility known)
  const shape = (m) => ({
    id: m.id, name: m.displayName || m.userPrincipalName || m.id, upn: m.userPrincipalName || "",
    enabled: m.accountEnabled !== false, synced: m.onPremisesSyncEnabled === true, onms: ONMS.test(m.userPrincipalName || ""),
  });
  function accounts(inp) {
    const unit = inp.unit || null;
    if (!inp.members) return { state: "unknown", error: inp.error || "the group's members could not be read", rows: [], stale: [], open: 0, total: 0, protectedN: 0, unit, canPlace: false, pim: !!inp.pim };
    const ids = new Set(inp.members.map((m) => m.id));
    const gaOf = (id) => !inp.ga ? { kind: "unknown" } : (inp.ga.get(id) || { kind: "none" });
    const rows = inp.members.map((m) => {
      // prot must NAME every account it knows about (null = in no restricted
      // unit); an account it does not name is unknown, never "open"
      const inU = inp.prot && inp.prot.has(m.id) ? (inp.prot.get(m.id) || null) : undefined;
      const state = inU === undefined ? "unknown" : !inU ? "open" : (unit && unit.id && inU.auId === unit.id) ? "in" : "other";
      return { ...shape(m), ga: gaOf(m.id), au: inU || null, state };
    }).sort((a, b) => a.name.localeCompare(b.name));
    // Stale = in the break-glass unit but no longer in the group. Only for a
    // unit that IS a break-glass unit: in a shared persona unit every other
    // user would read as a former break-glass account.
    const stale = unit && unit.id && BG_UNIT.test(unit.name || "")
      ? (inp.unitUsers || []).filter((u) => !ids.has(u.id)).map((u) => ({ ...shape(u), ga: gaOf(u.id), au: { auId: unit.id, auName: unit.name }, state: "stale" }))
      : [];
    const open = rows.filter((r) => r.state === "open").length;
    return {
      state: "read", rows, stale, open, total: rows.length,
      protectedN: rows.filter((r) => r.state === "in" || r.state === "other").length,
      unknownN: rows.filter((r) => r.state === "unknown").length,
      unit, canPlace: !!(unit && unit.id), pim: !!inp.pim,
    };
  }
  // why an open account cannot be ticked — on the tick itself
  function placeWhy(acc) {
    if (acc.canPlace) return "";
    if (acc.unit && acc.unit.missing) return `${acc.unit.name} does not exist yet — create it in 🛡 Restricted AUs`;
    return "the group is in no restricted unit and has no break-glass vault to follow — put the group in its vault first";
  }

  const GA_TEXT = {
    permanent: ["on", "active · permanent", "direct assignment, no end date"],
    timebound: ["ro", "active · time-bound", ""],
    activated: ["ro", "activated from eligible (PIM)", "a break-glass account must not depend on PIM"],
    active: ["on", "active", "permanence not read — 🔑 Read PIM"],
    eligible: ["ro", "eligible only (PIM)", "a break-glass account must not depend on PIM"],
    none: ["ro", "not a Global Administrator", "not through a direct or group assignment"],
    unknown: ["na", "not read", ""],
  };
  function gaCell(ga) {
    const [cls, label, sub] = GA_TEXT[ga.kind] || GA_TEXT.unknown;
    const end = ga.kind === "timebound" && ga.end ? `ends ${String(ga.end).slice(0, 10)}` : sub;
    return `<span class="wo-state ${cls}">${dot(cls)}${esc(label)}</span>${end ? `<div class="mini muted">${esc(end)}</div>` : ""}`;
  }
  function shapeChips(r) {
    return [
      r.synced ? '<span class="tag bg-dev" title="Synced from on-premises — a break-glass account should be cloud-only, so an on-premises outage cannot take it down">synced</span>' : '<span class="tag bg-ok">cloud-only</span>',
      r.onms ? '<span class="tag bg-ok">onmicrosoft.com</span>' : '<span class="tag bg-dev" title="A break-glass account should sign in on the onmicrosoft.com domain, which does not depend on DNS or federation">custom domain</span>',
      r.enabled ? '<span class="tag bg-ok">enabled</span>' : '<span class="tag bg-dev">disabled</span>',
    ].join(" ");
  }
  function unitCell(r) {
    if (r.state === "in") return `<span class="wo-state on">${dot("on")}🔒 in ${esc(r.au.auName)}</span>`;
    if (r.state === "other") return `<span class="wo-state on">${dot("on")}🔒 in ${esc(r.au.auName)}</span><div class="mini muted">a restricted unit protects it wherever it is — left where it is</div>`;
    if (r.state === "stale") return `<span class="wo-state ro">${dot("ro")}in the unit · not in the group</span><div class="mini muted">a former break-glass account, still locked — only an administrator scoped to this unit can change it</div>`;
    if (r.state === "unknown") return `<span class="wo-state na">${dot("na")}unknown</span><div class="mini muted">the administrative units could not be read</div>`;
    return `<span class="wo-state off">${dot("off")}not in a restricted unit</span><div class="mini muted">a tenant-wide User, Authentication or Privileged Authentication Administrator can change its methods, disable it or delete it</div>`;
  }

  // o: { gid, ticks: Set(userId), outTicks: Set(userId), pimAsk: bool }
  function panel(acc, o = {}) {
    if (acc.state === "reading") return `<div class="bg-acc"><span class="mini muted">👤 Reading the accounts in this group…</span></div>`;
    if (acc.state === "unknown") return `<div class="bg-acc"><b>👤 Accounts in this group</b> <span class="wo-state na">${dot("na")}not read</span><div class="mini muted">${esc(acc.error)}</div></div>`;
    const ticks = o.ticks || new Set(), out = o.outTicks || new Set();
    const why = placeWhy(acc);
    const apply = (r) => {
      if (r.state === "in" || r.state === "other") return '<span class="wo-state on">✓ protected</span>';
      if (r.state === "unknown") return '<span class="mini muted">—</span>';
      if (r.state === "stale") return `<label class="pr-tick"><input type="checkbox" data-pr-accout="${esc(r.id)}"${out.has(r.id) ? " checked" : ""}> take out of the unit</label><div class="mini muted">not ticked for you — your call</div>`;
      return acc.canPlace
        ? `<label class="pr-tick"><input type="checkbox" data-pr-acc="${esc(r.id)}" data-pr-gid="${esc(o.gid || "")}"${ticks.has(r.id) ? " checked" : ""}> place in ${esc(acc.unit.name)}</label>`
        : `<label class="pr-tick dis" title="${esc(why)}"><input type="checkbox" disabled> place in a unit <span class="muted">— ${esc(why)}</span></label>`;
    };
    const tr = (r) => `<tr class="${r.state === "stale" ? "bg-stale" : ""}${ticks.has(r.id) || out.has(r.id) ? " pr-sel" : ""}">
        <td><b>${esc(r.name)}</b><div class="mini muted">${esc(r.upn)}</div></td>
        <td class="mini">${shapeChips(r)}</td>
        <td class="mini">${gaCell(r.ga)}</td>
        <td>${unitCell(r)}</td>
        <td>${apply(r)}</td></tr>`;
    const anyGa = [...acc.rows, ...acc.stale].some((r) => ["permanent", "timebound", "activated", "active"].includes(r.ga.kind));
    const tags = [
      `<span class="tag">${plural(acc.total, "user")} · read through nested groups</span>`,
      acc.open ? `<span class="tag bg-bad">${acc.open} not in a restricted unit</span>` : acc.total ? '<span class="tag bg-ok">every account in a restricted unit</span>' : "",
      acc.stale.length ? `<span class="tag bg-dev">${acc.stale.length} in the unit but no longer in the group</span>` : "",
    ].join(" ");
    return `<div class="bg-acc">
      <div class="bg-acc-head"><b>👤 Accounts in this group</b> ${tags}</div>
      ${acc.total || acc.stale.length ? `<div class="cg-tablewrap"><table class="cg-table bg-acc-table">
        <thead><tr><th>Account</th><th style="width:210px">Shape</th><th style="width:170px">Global Administrator</th><th>🔒 Restricted unit (account)</th><th style="width:210px">Apply</th></tr></thead>
        <tbody>${[...acc.rows, ...acc.stale].map(tr).join("")}</tbody></table></div>` : '<div class="mini muted">No users in this group — a break-glass group with nobody in it excludes nobody.</div>'}
      ${anyGa ? `<div class="wo-callout bg-callout"><b>⚠ Once in the unit, nobody can reset these accounts.</b> They are Global Administrators, and no role that can be scoped to an administrative unit may reset a Global Administrator's password or methods — not even a tenant-wide Global Administrator can. <b>To recover:</b> sign in with the other break-glass account (a Global or Privileged Role Administrator), take the account out of the unit (audited), fix it, and put it back. The account can still register its own passkey.</div>` : ""}
      <div class="mini muted">Shape follows the usual break-glass rules: cloud-only, an onmicrosoft.com sign-in name, Global Administrator as a direct, permanent, active assignment. A deviation is shown in amber and never blocks the lock.${acc.pim ? "" : ' Permanence and PIM eligibility are read once <b>RoleManagement.Read.Directory</b> is granted — <button class="btn sm" data-pr-pim>🔑 Read PIM</button>'}</div>
    </div>`;
  }

  // the tile over all break-glass groups on the screen
  function tile(accs) {
    const read = accs.filter((a) => a.state === "read");
    if (!accs.length) return "";
    if (!read.length) return `<div class="wo-vt"><span class="k">👤 Break-glass accounts</span><span class="v muted">${accs.some((a) => a.state === "reading") ? "…" : "?"}</span><span class="s">${accs.some((a) => a.state === "reading") ? "reading the accounts" : "the accounts could not be read"}</span></div>`;
    const seen = new Map();
    read.forEach((a) => a.rows.forEach((r) => seen.set(r.id, r)));
    const all = [...seen.values()], open = all.filter((r) => r.state === "open").length, prot = all.filter((r) => r.state === "in" || r.state === "other").length;
    return `<div class="wo-vt ${open ? "bad" : "ok"}"><span class="k">👤 Break-glass accounts</span><span class="v">${prot} / ${all.length}</span><span class="s">${open ? `in a restricted unit · ${open} still editable by tenant-wide admins` : all.length ? "every account in a restricted unit" : "no users in the break-glass group"}</span></div>`;
  }

  // -------------------------------------------------------------- scopes --
  // inp.units:  [{ id, name, groups, users, gaUsers }]   the restricted units
  // inp.scoped: Map(auId → { active: [a] | null, eligible: [a] | null, error })
  //             a = { roleTemplateId, roleName, who, upn, whoType }
  // inp.pim:    whether eligibility was read at all
  function scopes(inp) {
    const rows = (inp.units || []).map((u) => {
      const s = (inp.scoped && inp.scoped.get(u.id)) || { active: null, eligible: null };
      if (!s.active) return { unit: u, verdict: "unknown", error: s.error || "not read", need: {}, have: { groups: [], users: [] }, other: [] };
      const all = [...s.active.map((a) => ({ ...a, eligible: false })), ...(s.eligible || []).map((a) => ({ ...a, eligible: true }))];
      const have = { groups: all.filter((a) => a.roleTemplateId === ROLES.groups.id), users: all.filter((a) => a.roleTemplateId === ROLES.users.id) };
      const other = all.filter((a) => a.roleTemplateId !== ROLES.groups.id && a.roleTemplateId !== ROLES.users.id);
      const need = { groups: u.groups > 0, users: u.users > 0 };
      const missing = [need.groups && !have.groups.length ? ROLES.groups.name : null, need.users && !have.users.length ? ROLES.users.name : null].filter(Boolean);
      const verdict = !all.length ? (need.groups || need.users ? "bad" : "empty") : missing.length ? "warn" : "ok";
      return { unit: u, verdict, need, have, other, missing, eligibleRead: s.eligible !== null && s.eligible !== undefined };
    }).sort((a, b) => ({ bad: 0, warn: 1, unknown: 2, ok: 3, empty: 4 }[a.verdict] - { bad: 0, warn: 1, unknown: 2, ok: 3, empty: 4 }[b.verdict]) || String(a.unit.name).localeCompare(String(b.unit.name)));
    return { rows, bad: rows.filter((r) => r.verdict === "bad").length, warn: rows.filter((r) => r.verdict === "warn").length, pim: !!inp.pim };
  }
  const who = (list) => list.map((a) => `<span class="bg-who${a.eligible ? " elig" : ""}" title="${esc(a.upn || a.who || "")}${a.eligible ? " — eligible through PIM" : " — active"}">${esc(a.who || a.upn || "unknown principal")}${a.whoType && a.whoType !== "user" ? ` <span class="muted">(${esc(a.whoType)})</span>` : ""}${a.eligible ? ' <span class="tag">eligible</span>' : ""}</span>`).join("");
  function roleCell(r, key) {
    if (r.verdict === "unknown") return '<span class="mini muted">—</span>';
    const list = r.have[key];
    if (list.length) return `<span class="wo-state on">${dot("on")}${list.length}</span><div class="bg-whos">${who(list)}</div>`;
    if (!r.need[key]) return '<span class="mini muted">not needed — nothing of that kind in the unit</span>';
    return `<span class="wo-state off">${dot("off")}none</span>`;
  }
  function scopeCard(res, o = {}) {
    if (!res) return "";
    if (res.state === "reading") return `<div class="list-card wo-card"><h3 class="wo-h">🔑 Who can manage the units</h3><p class="mini muted">Reading the roles scoped to each restricted unit…</p></div>`;
    const V = {
      ok: ["on", "correct"], warn: ["ro", "role missing"], bad: ["off", "nobody"], unknown: ["na", "not read"], empty: ["na", "empty unit"],
    };
    const body = res.rows.map((r) => {
      const [cls, lbl] = V[r.verdict];
      const holds = r.unit.groups === undefined ? "" : `${plural(r.unit.groups || 0, "group")} · ${plural(r.unit.users || 0, "user")}${r.unit.gaUsers ? ` <span class="muted">(${r.unit.gaUsers} Global Admin)</span>` : ""}${r.unit.capped ? ' <span class="muted">(counted from the first 20 members)</span>' : ""}`;
      const note = r.verdict === "bad" ? "nobody holds a role on this unit — a tenant-wide Global Administrator can manage the unit but not what is in it, until they assign themselves a role on it (audited)"
        : r.verdict === "warn" ? `no ${r.missing.join(" and no ")} on this unit${r.eligibleRead ? "" : " (active roles only — PIM eligibility not read)"}`
          : r.verdict === "unknown" ? r.error : r.verdict === "empty" ? "holds nothing — no role needed yet" : "";
      const gaNote = r.unit.gaUsers && r.need.users ? `<div class="mini muted">A User Administrator on this unit manages its ordinary users. The ${plural(r.unit.gaUsers, "Global Administrator")} in it stay${r.unit.gaUsers === 1 ? "s" : ""} out of its reach — no unit-scoped role may change a Global Administrator.</div>` : "";
      return `<tr><td><b>${esc(r.unit.name)}</b><div class="mini muted">${holds}</div></td>
        <td>${roleCell(r, "groups")}</td>
        <td>${roleCell(r, "users")}${gaNote}</td>
        <td>${r.other && r.other.length ? `<div class="bg-whos">${r.other.map((a) => `<span class="bg-who${a.eligible ? " elig" : ""}">${esc(a.roleName || "role")} · ${esc(a.who || a.upn || "?")}${a.eligible ? ' <span class="tag">eligible</span>' : ""}</span>`).join("")}</div>` : '<span class="mini muted">—</span>'}</td>
        <td><span class="wo-state ${cls}">${dot(cls)}${lbl}</span>${note ? `<div class="mini muted">${esc(note)}</div>` : ""}</td></tr>`;
    }).join("");
    return `<div class="list-card wo-card bg-scope">
      <h3 class="wo-h">🔑 Who can manage the units ${res.bad ? `<span class="pill red">${res.bad}</span>` : ""}${res.warn ? ` <span class="pill amber">${res.warn}</span>` : ""}</h3>
      <p class="mini" style="margin:6px 0 10px">A restricted unit blocks every tenant-wide role, Global Administrator included, so someone must hold a role <b>scoped to the unit</b>: <b>Groups Administrator</b> where the unit holds groups, <b>User Administrator</b> where it holds users.</p>
      ${res.rows.length ? `<div class="cg-tablewrap"><table class="cg-table bg-scope-table">
        <thead><tr><th>Restricted unit</th><th>Groups Administrator</th><th>User Administrator</th><th>Other roles</th><th style="width:26%">Verdict</th></tr></thead>
        <tbody>${body}</tbody></table></div>` : '<p class="mini muted">No restricted management administrative units in this tenant yet.</p>'}
      <p class="mini muted" style="margin:8px 0 0">Active assignments are read from each unit's scoped role members. ${res.pim ? "PIM-eligible assignments are included (tagged eligible)." : 'PIM-eligible assignments need <b>RoleManagement.Read.Directory</b> — <button class="btn sm" data-pr-pim>🔑 Read PIM</button>'} A Groups Administrator is granted from Settings below; a User Administrator from 🛡 Restricted AUs → the unit → Scoped administrators.</p>
    </div>`;
  }

  // ----------------------------------------------------- 📘 MS Learn band --
  // acc: accounts() for the break-glass group; sc: the scopes() row for its
  // unit (or null). Nothing to say → "".
  function learnBand(acc, sc, groupName) {
    if (!acc || acc.state !== "read") return "";
    const lines = [];
    if (acc.open) lines.push(`${acc.open} of ${plural(acc.total, "break-glass account")} ${acc.open === 1 ? "is" : "are"} not in a restricted management unit: ${acc.rows.filter((r) => r.state === "open").map((r) => r.name).join(", ")}. The group being in one guards who is IN it, not the accounts — a tenant-wide User, Authentication or Privileged Authentication Administrator can still change their methods, disable or delete them.`);
    if (sc && (sc.verdict === "bad" || sc.verdict === "warn")) lines.push(sc.verdict === "bad" ? `Nobody holds a role scoped to ${sc.unit.name}.` : `${sc.unit.name} has no ${sc.missing.join(" and no ")} scoped to it.`);
    if (!lines.length) return "";
    return `<div class="ml-ready bg-learn"><div class="grow"><b>🚨 Break-glass: ${acc.open ? "accounts outside the restricted unit" : "the unit's scoped roles"}</b> <span class="tag bg-bad">${acc.open ? "High" : "Medium"}</span>
      <div class="mini">${lines.map(esc).join("<br>")}</div>
      <div class="mini muted">${esc(groupName || "Break-glass group")} · learn.microsoft.com — Restricted management administrative units; Manage emergency access accounts</div></div>
      <button class="btn primary sm" data-ml-bg-open>Fix in 🔒 Protect exclusions →</button></div>`;
  }

  // -------------------------------------------------------------- report --
  function reportLines(accRes, scopeRes) {
    const L = [];
    if (accRes && accRes.length) {
      L.push("", "## Break-glass accounts", "", "| Account | Restricted unit |", "| --- | --- |");
      for (const a of accRes) L.push(`| ${a.upn || a.name} | ${a.state === "added" ? `added to ${a.auName} (read back)` : a.state === "removed" ? `taken out of ${a.auName}` : a.state === "already" ? `already in ${a.auName}` : `FAILED — ${a.error}`} |`);
      L.push("", "_A Global Administrator inside a restricted unit can have its password and methods reset by nobody until it is taken out of the unit — the recovery route is the other break-glass account._");
    }
    return L;
  }

  return { accounts, placeWhy, panel, tile, scopes, scopeCard, learnBand, reportLines, GA, ROLES, BG_UNIT };
})();
