// ======================================================================
// Compare users (BETA) — put two or more users side by side:
//   • assignment: per policy, is each user included, excluded (and why),
//     or not targeted at all — differences highlighted
//   • memberships: the groups and directory roles behind those differences
//   • optionally one What-If sign-in scenario evaluated per user
// Resolution is per-user (transitiveMemberOf), so no tenant-wide group
// expansion is needed — a handful of Graph calls per user.
// ======================================================================
const Comparer = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---------- user resolution ----------
  // → { id, name, upn, guest, enabled, groupIds:Set, roleIds:Set, names:{id:label} }
  async function resolveUser(term) {
    let u = null;
    try { u = await Graph.gget(`/users/${encodeURIComponent(term)}?$select=id,displayName,userPrincipalName,userType,accountEnabled`); }
    catch {
      const f = term.replace(/'/g, "''");
      const j = await Graph.gget(`/users?$filter=startswith(userPrincipalName,'${f}') or startswith(displayName,'${f}')&$select=id,displayName,userPrincipalName,userType,accountEnabled&$top=2`);
      const hits = (j && j.value) || [];
      if (hits.length !== 1) throw new Error(hits.length ? `“${term}” matches more than one user — use the full UPN` : `User “${term}” not found`);
      u = hits[0];
    }
    const out = {
      id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName || "",
      guest: (u.userType || "").toLowerCase() === "guest", enabled: u.accountEnabled !== false,
      groupIds: new Set(), roleIds: new Set(), names: {},
    };
    const mem = await Graph.ggetAll(`/users/${u.id}/transitiveMemberOf?$select=id,displayName,roleTemplateId`);
    mem.forEach((o) => {
      const ty = (o["@odata.type"] || "").toLowerCase();
      if (ty.includes("directoryrole")) {
        if (o.roleTemplateId) { out.roleIds.add(o.roleTemplateId); out.names[o.roleTemplateId] = o.displayName || o.roleTemplateId; }
      } else if (!ty.includes("administrativeunit")) {
        out.groupIds.add(o.id); out.names[o.id] = o.displayName || o.id;
      }
    });
    return out;
  }

  function resolveUserDemo(term) {
    const t = term.trim().toLowerCase();
    const u = (DEMO_DATA.analyzeUsers || []).find((x) =>
      (x.userPrincipalName || "").toLowerCase() === t || (x.displayName || "").toLowerCase() === t) ||
      (DEMO_DATA.analyzeUsers || []).find((x) =>
        (x.userPrincipalName || "").toLowerCase().includes(t) || (x.displayName || "").toLowerCase().includes(t));
    if (!u) throw new Error(`User “${term}” not found in the demo directory`);
    const out = {
      id: u.id, name: u.displayName || u.userPrincipalName, upn: u.userPrincipalName || "",
      guest: (u.userType || "").toLowerCase() === "guest", enabled: u.accountEnabled !== false,
      groupIds: new Set(), roleIds: new Set(), names: { ...(DEMO_DATA.names || {}) },
    };
    Object.entries(DEMO_DATA.roleMembers || {}).forEach(([rt, ids]) => { if (ids.includes(u.id)) out.roleIds.add(rt); });
    Object.entries(DEMO_DATA.groupMembers || {}).forEach(([g, ids]) => { if (ids.includes(u.id)) out.groupIds.add(g); });
    Object.entries(DEMO_DATA.scopeGroups || {}).forEach(([label, ids]) => { if (ids.includes(u.id)) { out.groupIds.add(label); out.names[label] = label; } });
    return out;
  }

  // ---------- policy lookup (enabled + report-only) ----------
  function buildLookup(vms) {
    return vms.filter((vm) => vm.raw.state !== "disabled").map((vm) => {
      const p = vm.raw, u = (p.conditions || {}).users || {};
      return {
        id: p.id, name: p.displayName, seq: vm.seq, enforced: p.state === "enabled",
        includeAll: (u.includeUsers || []).includes("All"),
        incUsers: new Set(u.includeUsers || []), excUsers: new Set(u.excludeUsers || []),
        incGroups: u.includeGroups || [], excGroups: u.excludeGroups || [],
        incRoles: u.includeRoles || [], excRoles: u.excludeRoles || [],
        incGuests: !!u.includeGuestsOrExternalUsers, excGuests: !!u.excludeGuestsOrExternalUsers,
        controlsLabel: vm.grant.controls.join(vm.grant.op ? ` ${vm.grant.op} ` : ", "),
      };
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  // Assignment state of one policy for one resolved user.
  function stateFor(P, u) {
    const name = (id) => u.names[id] || id;
    const included = P.includeAll || P.incUsers.has(u.id) ||
      P.incGroups.some((g) => u.groupIds.has(g)) || P.incRoles.some((r) => u.roleIds.has(r)) ||
      (P.incGuests && u.guest);
    if (!included) return { s: "na" };
    if (P.excUsers.has(u.id)) return { s: "exc", why: "direct user exclusion" };
    const g = P.excGroups.find((x) => u.groupIds.has(x));
    if (g) return { s: "exc", why: "group: " + name(g) };
    const r = P.excRoles.find((x) => u.roleIds.has(x));
    if (r) return { s: "exc", why: "role: " + name(r) };
    if (P.excGuests && u.guest) return { s: "exc", why: "guest user type" };
    return { s: "inc" };
  }

  // → [{id, name, enforced, controls, states:[{s,why}], differs}]
  function assignmentRows(lookup, users) {
    return lookup.map((P) => {
      const states = users.map((u) => stateFor(P, u));
      return { id: P.id, name: P.name, enforced: P.enforced, controls: P.controlsLabel, states, differs: new Set(states.map((x) => x.s)).size > 1 };
    });
  }

  // ---------- membership diff ----------
  // kind: "group" | "role" → [{id, label, have:[bool], differs}]
  function membershipRows(users, kind) {
    const key = kind === "role" ? "roleIds" : "groupIds";
    const all = new Map();
    users.forEach((u) => u[key].forEach((id) => { if (!all.has(id)) all.set(id, u.names[id] || id); }));
    return [...all.entries()].map(([id, label]) => {
      const have = users.map((u) => u[key].has(id));
      return { id, label, have, differs: have.some((x) => !x) };
    }).sort((a, b) => (b.differs - a.differs) || a.label.localeCompare(b.label));
  }

  // ---------- What-If scenario, once per user ----------
  // scBase: the shared scenario fields; ctx: { namedLocations, names }
  function scenario(raws, users, scBase, ctx) {
    const names = { ...ctx.names };
    users.forEach((u) => Object.assign(names, u.names));
    const perUser = users.map((u) => WhatIfEval.evaluate(raws, {
      ...scBase, userId: u.id, userName: u.name, isGuest: u.guest, groupIds: u.groupIds, roleIds: u.roleIds,
    }, { namedLocations: ctx.namedLocations, names }));
    // matrix rows over every evaluated policy (same policy set for everyone)
    const polNames = new Map();
    perUser.forEach((r) => [...r.applied, ...r.notApplied].forEach((p) => polNames.set(p.id, p.name)));
    const rows = [...polNames.entries()].map(([id, name]) => {
      const cells = perUser.map((r) => {
        const a = r.applied.find((p) => p.id === id);
        if (a) return { s: a.state === "enabledForReportingButNotEnforced" ? "ro" : "ok", why: "" };
        const n = r.notApplied.find((p) => p.id === id);
        return { s: "no", why: (n && n.reason) || "" };
      });
      return { id, name, cells, differs: new Set(cells.map((c) => c.s === "ro" ? "ok" : c.s)).size > 1 };
    }).sort((a, b) => (b.differs - a.differs) || a.name.localeCompare(b.name));
    return { perUser, rows };
  }

  // ---------- rendering ----------
  const SYM = { inc: "✓", ok: "✓", ro: "✓", exc: "✗", no: "✗", na: "·" };
  const CLS = { inc: "ok", ok: "ok", ro: "ro", exc: "no", no: "no", na: "na" };
  const userHead = (users) => users.map((u) =>
    `<th class="pcol"><div class="ph" title="${esc(u.upn)}">${esc(u.name)}${u.guest ? " (guest)" : ""}</div></th>`).join("");

  function diffTag(differs) { return differs ? ' <span class="tag new">differs</span>' : ""; }

  function assignmentTable(rows, users, diffOnly) {
    const use = diffOnly ? rows.filter((r) => r.differs) : rows;
    const body = use.map((r) => `<tr${r.differs ? ' class="cmp-diff"' : ""}>
      <td class="ucol"><span class="pol-link" data-polid="${esc(r.id)}">${esc(r.name)}</span>${r.enforced ? "" : ' <span class="tag">report-only</span>'}${diffTag(r.differs)}
        <div class="uupn">${esc(r.controls)}</div></td>` +
      r.states.map((st) => `<td class="cellv ${CLS[st.s]}"${st.why ? ` title="excluded — ${esc(st.why)}"` : ""}><span class="cell ${CLS[st.s]}">${SYM[st.s]}</span></td>`).join("") + "</tr>").join("");
    return `<div class="mwrap"><table class="mtable"><thead><tr><th class="ucol">Policy (${use.length})</th>${userHead(users)}</tr></thead>
      <tbody>${body || `<tr><td class="mini" style="padding:16px" colspan="${users.length + 1}">${diffOnly ? "No differences — these users are treated identically by every enabled or report-only policy." : "No policies."}</td></tr>`}</tbody></table></div>`;
  }

  function membershipTable(rows, users, kind, diffOnly) {
    const use = diffOnly ? rows.filter((r) => r.differs) : rows;
    const body = use.map((r) => `<tr${r.differs ? ' class="cmp-diff"' : ""}>
      <td class="ucol"><span class="uname">${esc(r.label)}</span>${diffTag(r.differs)}</td>` +
      r.have.map((h) => `<td class="cellv ${h ? "ok" : "na"}"><span class="cell ${h ? "ok" : "na"}">${h ? "✓" : "·"}</span></td>`).join("") + "</tr>").join("");
    const label = kind === "role" ? "Directory role" : "Group";
    return `<div class="mwrap"><table class="mtable"><thead><tr><th class="ucol">${label} (${use.length})</th>${userHead(users)}</tr></thead>
      <tbody>${body || `<tr><td class="mini" style="padding:16px" colspan="${users.length + 1}">${diffOnly ? `No ${kind} differences.` : `No ${kind} memberships.`}</td></tr>`}</tbody></table></div>`;
  }

  function scenarioTable(sr, users, diffOnly) {
    const use = diffOnly ? sr.rows.filter((r) => r.differs) : sr.rows;
    const body = use.map((r) => `<tr${r.differs ? ' class="cmp-diff"' : ""}>
      <td class="ucol"><span class="pol-link" data-polid="${esc(r.id)}">${esc(r.name)}</span>${diffTag(r.differs)}</td>` +
      r.cells.map((c) => `<td class="cellv ${CLS[c.s]}"${c.why ? ` title="${esc(c.why)}"` : ""}><span class="cell ${CLS[c.s]}">${SYM[c.s]}</span></td>`).join("") + "</tr>").join("");
    return `<div class="mwrap"><table class="mtable"><thead><tr><th class="ucol">Policy (${use.length})</th>${userHead(users)}</tr></thead>
      <tbody>${body || `<tr><td class="mini" style="padding:16px" colspan="${users.length + 1}">${diffOnly ? "No differences — this sign-in hits the same policies for every user." : "No policies evaluated."}</td></tr>`}</tbody></table></div>`;
  }

  // ---------- Markdown export ----------
  function markdown(meta, users, rows, groups, roles, sr) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const uh = users.map((u) => e(u.name)).join(" | ");
    const sep = users.map(() => "---").join(" | ");
    const cell = { inc: "✓", ok: "✓", ro: "✓ (RO)", exc: "✗", no: "✗", na: "·" };
    const L = [`# Compare users — ${e(meta.tenant)}`, "", Brand.generatedBy("Generated"), "",
      "Users compared: " + users.map((u) => `**${e(u.name)}** (${e(u.upn)})`).join(" · "), "",
      "## Policy assignment", "",
      `| Policy | ${uh} |`, `| --- | ${sep} |`];
    rows.forEach((r) => L.push(`| ${e(r.name)}${r.enforced ? "" : " *(report-only)*"}${r.differs ? " **≠**" : ""} | ` +
      r.states.map((st) => cell[st.s] + (st.why ? ` — ${e(st.why)}` : "")).join(" | ") + " |"));
    const mem = (title, rws) => {
      L.push("", `## ${title}`, "", `| ${title} | ${uh} |`, `| --- | ${sep} |`);
      rws.forEach((r) => L.push(`| ${e(r.label)}${r.differs ? " **≠**" : ""} | ${r.have.map((h) => h ? "✓" : "·").join(" | ")} |`));
      if (!rws.length) L.push(`| *(none)* | ${users.map(() => "·").join(" | ")} |`);
    };
    mem("Groups", groups); mem("Directory roles", roles);
    if (sr) {
      L.push("", "## What-If scenario", "", meta.scenarioLine, "");
      users.forEach((u, i) => {
        const r = sr.perUser[i];
        L.push(`- **${e(u.name)}** — ${r.blocked ? "access would be **BLOCKED**" : `${r.applied.length} policies apply`}`);
      });
      L.push("", `| Policy | ${uh} |`, `| --- | ${sep} |`);
      sr.rows.forEach((r) => L.push(`| ${e(r.name)}${r.differs ? " **≠**" : ""} | ` +
        r.cells.map((c) => cell[c.s] + (c.why ? ` — ${e(c.why)}` : "")).join(" | ") + " |"));
    }
    L.push("", "✓ included / applies · ✗ excluded / does not apply · `·` not targeted · **≠** users differ");
    return L.join("\n");
  }

  return { resolveUser, resolveUserDemo, buildLookup, assignmentRows, membershipRows, scenario, assignmentTable, membershipTable, scenarioTable, markdown };
})();
