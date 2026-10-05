// ======================================================================
// 🛡 Administrative units — the inventory (T27 2.0, beta 32435, R78).
// Pure: no DOM, no Graph. js/app.js reads, this module judges and draws.
//
// T27 used to be about restricted units only. A REGULAR unit matters as
// much, for the opposite reason: whoever holds a role scoped to it can act
// on what is inside. So every unit is read the same way — kind, membership
// (assigned / dynamic users / dynamic devices, the rule and whether it is
// processing), members, and who holds a role at its scope, active and
// eligible — and judged on what it holds that it should not.
//
// Facts this rests on (Microsoft Learn, admin-units-restricted-management,
// read for this build):
//   * restricted is set at creation and can never be changed — a regular
//     unit is never "made restricted"; a restricted copy is created;
//   * an object that is ALSO in a restricted unit cannot be modified by a
//     role scoped to a regular unit it is in — so a CA group already in a
//     restricted unit is not a finding here, whatever else it sits in;
//   * Microsoft 365, mail-enabled security and distribution groups cannot
//     be members of a restricted unit at all — moving one is refused here;
//   * a role-assignable group answers to Privileged Role Administrator and
//     Global Administrator only, neither of which can be scoped to a unit —
//     a scoped Groups Administrator cannot change it, so no finding.
//
// model(d) → { units, findings, counts, overlaps, regionsMissing, notes }
//   d = { aus, members: { [auId]: { list | null, error, capped } },
//         assignments: [{ directoryScopeId, roleName, roleTemplateId,
//           principalId, principalName, principalType, state, endDateTime }]
//           | null (not read), eligibleRead, policies: raw CA policies,
//         regions: PimBaseline.compareRegions result | null, lens: ca|pim }
// ======================================================================
const AuInv = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Roles that change a group's members when scoped to a unit. Matched on
  // template id first (a renamed role keeps it), then on the built-in name.
  const GROUP_WRITERS = {
    "fdd7a751-b60b-444a-984c-02652fe8fa1c": "Groups Administrator",
    "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
  };
  const GROUP_WRITER_NAMES = new Set(Object.values(GROUP_WRITERS));
  const writesGroups = (a) => !!(a && (GROUP_WRITERS[a.roleTemplateId] || GROUP_WRITER_NAMES.has(a.roleName)));
  // Same shape as PimRmau.REGIONAL (AU-<REG>-Users / -Devices / -Groups).
  const REGIONAL = /^AU-[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}-(Users|Devices|Groups)$/;
  const SEV = ["high", "medium", "low", "info"];
  const SEV_LABEL = { high: "High", medium: "Medium", low: "Low", info: "Info" };

  const isRestricted = (a) => !!(a && a.isMemberManagementRestricted === true);
  const kindOf = (m) => { const t = String((m && m["@odata.type"]) || "").toLowerCase(); return t.includes("group") ? "group" : t.includes("device") ? "device" : t.includes("user") ? "user" : "other"; };
  const scopeOf = (auId) => `/administrativeUnits/${auId}`;
  const auOfScope = (s) => { const m = /^\/administrativeUnits\/([^/]+)$/.exec(String(s || "")); return m ? m[1] : null; };

  function membershipOf(a) {
    if (String(a.membershipType || "").toLowerCase() !== "dynamic") return "Assigned";
    const r = String(a.membershipRule || "").replace(/^[\s(]+/, "").toLowerCase();
    return r.startsWith("device.") ? "Dynamic devices" : r.startsWith("user.") ? "Dynamic users" : "Dynamic";
  }
  // Can this group go into a restricted unit at all? Security groups only.
  function rmauEligible(g) {
    if (g.mailEnabled === true) return { ok: false, why: "mail-enabled — a restricted unit holds security groups only" };
    if ((g.groupTypes || []).includes("Unified")) return { ok: false, why: "a Microsoft 365 group — a restricted unit holds security groups only" };
    return { ok: true, why: "" };
  }
  // Which loaded CA policies reference a group, and how.
  function caRefs(groupId, policies) {
    const out = [];
    for (const p of policies || []) {
      const u = ((p && p.conditions) || {}).users || {};
      if ((u.excludeGroups || []).includes(groupId)) out.push({ id: p.id, name: p.displayName, how: "excluded", state: p.state });
      else if ((u.includeGroups || []).includes(groupId)) out.push({ id: p.id, name: p.displayName, how: "included", state: p.state });
    }
    return out;
  }

  function model(d) {
    const lens = d.lens === "pim" ? "pim" : "ca";
    const aus = d.aus || [];
    const assignRead = Array.isArray(d.assignments);
    const byUnit = new Map();
    (d.assignments || []).forEach((a) => {
      const id = a.auId || auOfScope(a.directoryScopeId);
      if (!id) return;
      (byUnit.get(id) || byUnit.set(id, []).get(id)).push(a);
    });
    const mem = (id) => (d.members || {})[id];
    // Every group that sits in a restricted unit (read ones only), and the
    // restricted units whose members could not be read — those leave a CA
    // finding on a regular unit open to doubt, and it says so.
    const inRestricted = new Map();
    const restrictedUnread = [];
    aus.filter(isRestricted).forEach((a) => {
      const m = mem(a.id);
      if (!m || !Array.isArray(m.list)) { restrictedUnread.push(a.displayName || a.id); return; }
      m.list.forEach((x) => { if (kindOf(x) === "group") (inRestricted.get(x.id) || inRestricted.set(x.id, []).get(x.id)).push(a.displayName || a.id); });
    });
    const regionsByUnit = new Map();
    const regionsMissing = [];
    const regionalNames = new Set();
    if (d.regions && Array.isArray(d.regions.regions)) {
      d.regions.regions.forEach((r) => (r.items || []).filter((i) => i.kind === "au").forEach((i) => {
        regionalNames.add(i.name);
        if (i.status === "missing") regionsMissing.push({ region: `${r.code} · ${r.name}`, name: i.name });
        else regionsByUnit.set(i.name, { region: `${r.code} · ${r.name}`, status: i.status, detail: i.detail || "" });
      }));
    }

    const units = aus.map((a) => {
      const m = mem(a.id);
      const read = !!(m && Array.isArray(m.list));
      const counts = read ? { user: 0, group: 0, device: 0, other: 0 } : null;
      if (read) m.list.forEach((x) => { counts[kindOf(x)]++; });
      const holders = (byUnit.get(a.id) || []).map((x) => ({ ...x, state: x.state === "eligible" ? "eligible" : "active" }))
        .sort((x, y) => String(x.roleName).localeCompare(String(y.roleName)) || String(x.principalName).localeCompare(String(y.principalName)));
      return {
        id: a.id, name: a.displayName || a.id, description: a.description || "", restricted: isRestricted(a),
        membership: membershipOf(a), rule: a.membershipRule || "", ruleState: a.membershipRuleProcessingState || "",
        hidden: a.visibility === "HiddenMembership", read, counts, capped: !!(m && m.capped),
        error: m && m.error ? m.error : null, holders, holdersRead: assignRead, findings: [],
        userIds: read && !(m && m.capped) ? new Set(m.list.filter((x) => kindOf(x) === "user").map((x) => x.id)) : null,
      };
    });
    const unitBy = new Map(units.map((u) => [u.id, u]));
    const add = (u, f) => { u.findings.push({ unitId: u.id, unitName: u.name, ...f }); };

    units.forEach((u) => {
      const writers = u.holders.filter(writesGroups);
      // 1 · a CA group a scoped admin can change (regular units only).
      if (!u.restricted && u.read) {
        mem(u.id).list.filter((x) => kindOf(x) === "group").forEach((g) => {
          if (g.isAssignableToRole === true) return;
          if (inRestricted.has(g.id)) return;
          const refs = caRefs(g.id, d.policies);
          if (!refs.length) return;
          const ex = refs.filter((r) => r.how === "excluded"), inc = refs.filter((r) => r.how === "included");
          const gname = g.displayName || g.id;
          const how = [ex.length ? `excluded by ${ex.length} polic${ex.length === 1 ? "y" : "ies"}` : "", inc.length ? `included by ${inc.length}` : ""].filter(Boolean).join(" and ");
          const who = writers.length
            ? `${[...new Set(writers.map((w) => w.roleName))].join(" and ")} ${writers.length === 1 ? "is" : "are"} scoped here, so ${writers.length === 1 ? "its holder" : "their holders"} can change who is in it`
            : (u.holdersRead ? "No group-managing role is scoped here today — one scoped grant would let its holder change who is in it" : "Who holds a role here was not read — a scoped Groups or User Administrator could change who is in it");
          const effect = ex.length ? (inc.length ? " — adding someone takes them out of the excluding policies, removing someone takes them out of the including ones" : " — adding someone takes them out of those policies")
            : " — removing someone takes them out of those policies";
          const elig = rmauEligible(g);
          add(u, {
            id: "ca-group-writable", sev: writers.length ? "high" : "medium",
            title: `Holds a Conditional Access group: ${gname}`,
            body: `${gname} is ${how}. ${who}${effect}.${restrictedUnread.length ? ` Not checked against ${restrictedUnread.length} restricted unit${restrictedUnread.length === 1 ? "" : "s"} whose members could not be read — if it sits in one, this does not apply.` : ""}`,
            policies: refs, groupId: g.id, groupName: gname,
            action: elig.ok ? { kind: "move", label: "Move to a restricted unit…", groupId: g.id, groupName: gname } : { kind: "blocked", label: "Cannot go into a restricted unit", why: elig.why },
          });
        });
      }
      // 2 · who holds the role, and how.
      u.holders.forEach((h) => {
        const pimGroup = h.principalType === "Group" && /^PIM-SG-/.test(h.principalName || "");
        if (lens === "pim") {
          if (pimGroup) return;
          add(u, { id: "holder-not-pim-group", sev: "medium",
            title: `${h.roleName} held outside a PIM-SG group`,
            body: `${h.principalName || h.principalId} holds ${h.roleName} at this unit's scope (${h.state}${h.state === "active" && !h.endDateTime ? ", permanent" : ""}). The framework scopes a desk through its PIM-SG group, so one activation carries the job and the group's own settings decide who and for how long.` });
        } else if (h.principalType === "User" && h.state === "active" && !h.endDateTime && h.assignmentType !== "Activated") {
          add(u, { id: "holder-direct-standing", sev: "medium",
            title: `${h.roleName} held directly and permanently`,
            body: `${h.principalName || h.principalId} holds ${h.roleName} at this unit's scope as an active assignment with no end date, not through a group and not just in time.` });
        }
      });
      // 3 · rule processing.
      if (u.membership !== "Assigned" && u.ruleState && u.ruleState !== "On") {
        add(u, { id: "rule-paused", sev: "medium", title: `Rule processing is ${u.ruleState}`,
          body: "New and changed users or devices stop arriving in this unit, so a desk scoped here does not see them; those who left stay in." });
      }
      // 4 · empty unit with someone scoped on it.
      if (u.read && !u.capped && u.holders.length && !(u.counts.user + u.counts.group + u.counts.device + u.counts.other)) {
        add(u, { id: "scoped-empty", sev: "low", title: "A role is scoped on an empty unit",
          body: `${u.holders.map((h) => h.roleName).filter((x, i, a) => a.indexOf(x) === i).join(", ")} ${u.holders.length === 1 ? "is" : "are"} scoped here but the unit has no members.` });
      }
      // 5 · nobody holds a role here.
      if (u.holdersRead && !u.holders.length) {
        if (u.restricted) add(u, { id: "vault-closed", sev: "medium", title: "Nobody can manage its members",
          body: "No role is held at this unit's scope, and tenant-wide roles are blocked by design. Global Administrator and Privileged Role Administrator can assign themselves here (an audited event) — until then its members are frozen." });
        else add(u, { id: "unused", sev: "info", title: "Nothing uses this unit",
          body: "No role is held at its scope, active or eligible. Keep it only if something outside Entra reads it." });
      }
      // 6 · regions file (PIM lens).
      if (lens === "pim" && d.regions) {
        const r = regionsByUnit.get(u.name);
        if (r && (r.status === "differs" || r.status === "conflict")) add(u, { id: "region-differs", sev: "medium", title: `Differs from the regions file (${r.region})`, body: r.detail || "The unit does not match what the regions file builds." });
        else if (!r && REGIONAL.test(u.name)) add(u, { id: "region-unknown", sev: "info", title: "Looks regional, not in the regions file", body: "The name follows AU-<region>-Users / -Devices / -Groups, but no region in the loaded file builds it." });
      }
    });

    // 7 · two regular units with desks on both share users.
    const overlaps = [];
    const regular = units.filter((u) => !u.restricted && u.userIds && u.userIds.size && u.holders.length);
    for (let i = 0; i < regular.length; i++) for (let j = i + 1; j < regular.length; j++) {
      const A = regular[i], B = regular[j];
      const [small, big] = A.userIds.size <= B.userIds.size ? [A.userIds, B.userIds] : [B.userIds, A.userIds];
      let n = 0; for (const id of small) if (big.has(id)) n++;
      if (!n) continue;
      overlaps.push({ a: A.id, b: B.id, n });
      [[A, B], [B, A]].forEach(([u, o]) => add(u, { id: "overlap", sev: "medium", title: `Overlaps ${o.name}`, otherId: o.id,
        body: `${n} user${n === 1 ? " is" : "s are"} in both units, and both have a role scoped on them — two desks can act on the same people.` }));
    }

    const rank = (s) => SEV.indexOf(s);
    units.forEach((u) => { u.findings.sort((x, y) => rank(x.sev) - rank(y.sev)); u.top = u.findings.length ? u.findings[0].sev : null; delete u.userIds; });
    const findings = units.flatMap((u) => u.findings);
    const counts = {
      total: units.length, restricted: units.filter((u) => u.restricted).length, regular: units.filter((u) => !u.restricted).length,
      withFindings: units.filter((u) => u.findings.length).length, holders: units.reduce((n, u) => n + u.holders.length, 0),
      high: findings.filter((f) => f.sev === "high").length, other: findings.filter((f) => f.sev !== "high").length,
      unread: units.filter((u) => !u.read).length, capped: units.filter((u) => u.capped).length,
    };
    const notes = [];
    if (!assignRead) notes.push("Roles at unit scope were not read — the findings that depend on them are left out.");
    else if (d.eligibleRead === false) notes.push(`Only active roles at unit scope were read${d.eligibleNote ? ` (${d.eligibleNote})` : ""} — eligible ones are not counted.`);
    if (counts.unread) notes.push(`${counts.unread} unit${counts.unread === 1 ? "'s" : "s'"} members could not be read — those units are not judged on what they hold.`);
    if (counts.capped) notes.push(`${counts.capped} unit${counts.capped === 1 ? " was" : "s were"} read only in part (more members than the browser holds) — overlap is not checked for ${counts.capped === 1 ? "it" : "them"}.`);
    return { lens, units, findings, counts, overlaps, regionsMissing, notes, readAt: d.readAt || null, demo: !!d.demo };
  }

  // ---- drawing ---------------------------------------------------------
  const sevTag = (s) => `<span class="auinv-sev auinv-${esc(s)}">${esc(SEV_LABEL[s] || s)}</span>`;
  const kindTag = (u) => u.restricted ? '<span class="tag grant">restricted</span>' : '<span class="tag">regular</span>';
  const membersText = (u) => !u.read ? (u.error ? "not read" : "—")
    : [u.counts.user ? `${u.counts.user} u` : "", u.counts.group ? `${u.counts.group} g` : "", u.counts.device ? `${u.counts.device} d` : ""].filter(Boolean).join(" · ") + (u.capped ? "+" : "") || "empty";
  const holdersText = (u) => !u.holdersRead ? "not read" : !u.holders.length ? "none"
    : `${u.holders.length} (${u.holders.filter((h) => h.state === "eligible").length} eligible)`;

  function matches(u, filter, q) {
    if (filter === "restricted" && !u.restricted) return false;
    if (filter === "regular" && u.restricted) return false;
    if (filter === "findings" && !u.findings.length) return false;
    if (!q) return true;
    const t = `${u.name} ${u.description} ${u.rule} ${u.holders.map((h) => `${h.roleName} ${h.principalName}`).join(" ")}`.toLowerCase();
    return t.includes(q);
  }

  function renderTable(res, opts = {}) {
    const q = String(opts.q || "").trim().toLowerCase();
    const rows = res.units.filter((u) => matches(u, opts.filter || "all", q))
      .sort((a, b) => (a.top ? SEV.indexOf(a.top) : 9) - (b.top ? SEV.indexOf(b.top) : 9) || (b.restricted - a.restricted) || a.name.localeCompare(b.name));
    if (!rows.length) return '<p class="mini" style="padding:12px">No unit matches the current filter.</p>';
    return `<div class="xt-tw"><table class="xt-tbl auinv-tbl"><thead><tr><th>Unit</th><th>Kind</th><th>Membership</th><th>Members</th><th>Roles at its scope</th><th>Findings</th></tr></thead><tbody>${rows.map((u) => `<tr class="auinv-row${opts.open && opts.open.has(u.id) ? " on" : ""}">
      <td><button type="button" class="auinv-name" data-auinvopen="${esc(u.id)}" title="Open the unit's card">${esc(u.name)}</button>${u.hidden ? ' <span class="tag">hidden</span>' : ""}</td>
      <td>${kindTag(u)}</td>
      <td class="mini">${esc(u.membership)}${u.membership !== "Assigned" && u.ruleState && u.ruleState !== "On" ? ` · <b>${esc(u.ruleState)}</b>` : ""}</td>
      <td class="mini">${esc(membersText(u))}</td>
      <td class="mini">${esc(holdersText(u))}</td>
      <td>${u.findings.length ? `${sevTag(u.top)} <span class="mini">${u.findings.length}</span>` : '<span class="mini muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // The move control: the restricted units to choose from, the group's persona
  // vault pre-selected when it exists (opts.targets [{id,name}],
  // opts.suggest(groupName) → id). No restricted unit: said, no button.
  function moveCtl(u, f, opts) {
    const t = opts.targets || [];
    if (!t.length) return '<div class="mini muted">There is no restricted unit to move it into yet — create one first (＋ New restricted AU).</div>';
    const pick = (opts.suggest && opts.suggest(f.action.groupName)) || "";
    const key = `${u.id}|${f.action.groupId}`;
    return `<div class="auinv-move"><label class="mini">Into <select data-auinvtarget="${esc(key)}" aria-label="Restricted unit to move ${esc(f.action.groupName)} into">${pick ? "" : '<option value="">— pick a restricted unit —</option>'}${t.map((x) => `<option value="${esc(x.id)}"${x.id === pick ? " selected" : ""}>${esc(x.name)}${x.id === pick ? " (its persona vault)" : ""}</option>`).join("")}</select></label> <button class="btn sm" data-auinvmove="${esc(key)}">${esc(f.action.label)}</button></div>`;
  }
  // The inventory half of a unit's card: membership, roles, findings.
  function renderUnit(u, opts = {}) {
    if (!u) return "";
    const rule = u.membership !== "Assigned" ? `<div class="mini" style="margin:4px 0"><b>Rule</b> · processing ${esc(u.ruleState || "unknown")}<div class="auinv-rule">${esc(u.rule || "(no rule)")}</div></div>` : "";
    const holders = !u.holdersRead ? '<li><div class="wi-why">Roles at this scope were not read.</div></li>'
      : u.holders.length ? u.holders.map((h) => `<li><div class="wi-pn"><b>${esc(h.roleName)}</b> → ${esc(h.principalName || h.principalId)} <span class="tag">${esc(h.principalType || "")}</span> <span class="tag${h.state === "eligible" ? " grant" : ""}">${esc(h.state)}${h.state === "active" && !h.endDateTime && h.assignmentType !== "Activated" ? " · permanent" : h.endDateTime ? ` · until ${esc(String(h.endDateTime).slice(0, 10))}` : ""}</span></div></li>`).join("")
      : '<li><div class="wi-why">No role is held at this unit\'s scope.</div></li>';
    const fs = u.findings.length ? u.findings.map((f) => `<div class="auinv-f auinv-f-${esc(f.sev)}"><div>${sevTag(f.sev)} <b>${esc(f.title)}</b></div><div class="mini">${esc(f.body)}</div>${f.policies && f.policies.length ? `<div class="mini muted">${esc(f.policies.map((p) => `${p.how}: ${p.name}`).join(" · "))}</div>` : ""}${f.action ? (f.action.kind === "move" ? moveCtl(u, f, opts) : `<div class="mini muted">${esc(f.action.label)} — ${esc(f.action.why)}</div>`) : ""}${f.otherId ? `<div><button class="btn sm" data-auinvopen="${esc(f.otherId)}">Open the other unit</button></div>` : ""}</div>`).join("")
      : '<p class="mini" style="margin:0">Nothing to report on this unit.</p>';
    return `<div class="auinv-unit">
      <div class="mini">${esc(u.membership)}${u.read ? ` · ${esc(membersText(u))}` : ""}</div>
      ${rule}
      <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:6px">Roles at its scope${opts.eligibleNote ? ` <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:normal">— ${esc(opts.eligibleNote)}</span>` : ""}</div>
      <ul class="wi-list" style="margin:4px 0 8px">${holders}</ul>
      <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em">Findings (${u.findings.length})</div>
      ${fs}
      ${!u.restricted ? '<p class="mini muted" style="margin:6px 0 0">A unit cannot be switched to restricted after it is created. To shield what is in it, move the objects into a restricted unit — or create a restricted copy (＋ New restricted AU) and move them there.</p>' : ""}
    </div>`;
  }

  function toMd(res, meta = {}) {
    const c = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = ["## Inventory — every unit", "",
      `${res.counts.total} units — ${res.counts.restricted} restricted, ${res.counts.regular} regular · ${res.counts.holders} role assignments at unit scope · ${res.counts.high} high and ${res.counts.other} other findings${meta.readAt ? ` · read ${new Date(meta.readAt).toISOString().slice(0, 16).replace("T", " ")}` : ""}${res.demo ? " · demo data" : ""}`, ""];
    res.notes.forEach((n) => L.push(`> ${n}`));
    if (res.notes.length) L.push("");
    L.push("| Unit | Kind | Membership | Members | Roles at its scope | Findings |", "| --- | --- | --- | --- | --- | --- |");
    res.units.forEach((u) => L.push(`| ${c(u.name)} | ${u.restricted ? "restricted" : "regular"} | ${c(u.membership)}${u.ruleState && u.membership !== "Assigned" && u.ruleState !== "On" ? ` (${c(u.ruleState)})` : ""} | ${c(membersText(u))} | ${c(holdersText(u))} | ${u.findings.length ? `${u.findings.length} (${SEV_LABEL[u.top]})` : "—"} |`));
    L.push("");
    const fs = res.findings;
    if (fs.length) {
      L.push("### Findings", "");
      SEV.forEach((s) => fs.filter((f) => f.sev === s).forEach((f) => L.push(`- **${SEV_LABEL[s]} · ${c(f.unitName)}** — ${c(f.title)}. ${c(f.body)}`)));
      L.push("");
    }
    if (res.regionsMissing.length) {
      L.push("### Units the regions file builds that do not exist", "");
      res.regionsMissing.forEach((r) => L.push(`- ${c(r.name)} (${c(r.region)})`));
      L.push("");
    }
    return L.join("\n");
  }

  return { GROUP_WRITERS, REGIONAL, isRestricted, kindOf, membershipOf, rmauEligible, caRefs, writesGroups, auOfScope, scopeOf, model, matches, renderTable, renderUnit, toMd };
})();
