// ======================================================================
// CA Exclusion analyzer — every exclusion in every policy, as a matrix.
// Collects excluded users, groups, directory roles, guest/external types,
// applications, named locations and device platforms; resolves them to
// display names and expands group membership, so you can see both the
// configured exclusions and who is *effectively* excluded, per policy.
// Read-only: Policy.Read.All + Directory.Read.All.
// ======================================================================
const Exclusions = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const MEMBER_CAP = 500; // per group, keeps very large groups from stalling the UI

  const KIND = {
    user: { label: "User", icon: "👤", order: 1 },
    group: { label: "Group", icon: "👥", order: 2 },
    role: { label: "Directory role", icon: "🛡", order: 3 },
    guest: { label: "Guest / external", icon: "🤝", order: 4 },
    app: { label: "Application", icon: "📦", order: 5 },
    location: { label: "Named location", icon: "🌐", order: 6 },
    platform: { label: "Device platform", icon: "💻", order: 7 },
  };
  const GUEST_TYPE_LABEL = {
    internalGuest: "Local guests", b2bCollaborationGuest: "B2B collaboration guests",
    b2bCollaborationMember: "B2B collaboration members", b2bDirectConnectUser: "B2B direct connect",
    otherExternalUser: "Other external users", serviceProvider: "Service provider users",
  };
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

  // ---- 1. collect every exclusion reference from the raw policies ----
  function collect(raws) {
    const entities = new Map(); // key -> entity
    const policies = [];
    const add = (kind, id, p, name) => {
      const key = `${kind}:${id}`;
      let e = entities.get(key);
      if (!e) { e = { key, kind, id, name: name || null, policyIds: new Set(), members: null, memberTotal: null }; entities.set(key, e); }
      e.policyIds.add(p.id);
    };
    for (const p of raws) {
      const u = p.conditions?.users || {}, a = p.conditions?.applications || {};
      const l = p.conditions?.locations || {}, pl = p.conditions?.platforms || {};
      (u.excludeUsers || []).forEach((id) => add("user", id, p));
      (u.excludeGroups || []).forEach((id) => add("group", id, p));
      (u.excludeRoles || []).forEach((id) => add("role", id, p));
      if (u.excludeGuestsOrExternalUsers) {
        const t = u.excludeGuestsOrExternalUsers.guestOrExternalUserTypes || "";
        const label = t.split(",").map((x) => GUEST_TYPE_LABEL[x.trim()] || x.trim()).filter(Boolean).join(", ") || "All guest/external";
        add("guest", t || "all", p, label);
      }
      (a.excludeApplications || []).forEach((id) => add("app", id, p));
      (l.excludeLocations || []).forEach((id) => add("location", id, p));
      (pl.excludePlatforms || []).forEach((id) => add("platform", id, p, id));
      const n = (u.excludeUsers || []).length + (u.excludeGroups || []).length + (u.excludeRoles || []).length
        + (u.excludeGuestsOrExternalUsers ? 1 : 0) + (a.excludeApplications || []).length
        + (l.excludeLocations || []).length + (pl.excludePlatforms || []).length;
      policies.push({ id: p.id, name: p.displayName || "(unnamed policy)", state: p.state, seq: null, exclusionCount: n });
    }
    return { policies, entities: [...entities.values()] };
  }

  // ---- 2. resolve display names + expand group membership ----
  async function resolve(model, opts = {}) {
    const { onStatus, demo } = opts;
    const byKind = (k) => model.entities.filter((e) => e.kind === k);

    // well-known sentinels that are not directory objects
    const SENTINEL = { All: "All users", None: "None", GuestsOrExternalUsers: "Guests & external users", AllTrusted: "All trusted locations", Office365: "Office 365", MicrosoftAdminPortals: "Microsoft Admin Portals" };
    model.entities.forEach((e) => { if (SENTINEL[e.id]) e.name = SENTINEL[e.id]; });

    if (demo) {
      const names = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.names) || {};
      model.entities.forEach((e) => { e.name = e.name || names[e.id] || e.id; });
      byKind("group").forEach((e) => {
        const ids = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.scopeGroups && DEMO_DATA.scopeGroups[e.name]) || [];
        const users = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.analyzeUsers) || [];
        e.members = ids.map((id) => { const u = users.find((x) => x.id === id); return { id, name: u?.displayName || id, upn: u?.userPrincipalName || "" }; });
        e.memberTotal = e.members.length;
      });
      return model;
    }

    // users + groups in one batched directory lookup
    const dirIds = [...byKind("user"), ...byKind("group")].map((e) => e.id).filter(isGuid);
    if (dirIds.length) {
      onStatus?.("Resolving users and groups…");
      for (const ids of chunk([...new Set(dirIds)], 1000)) {
        try {
          const j = await Graph.gpost("/directoryObjects/getByIds", { ids, types: ["user", "group"] });
          (j.value || []).forEach((o) => {
            model.entities.forEach((e) => {
              if (e.id === o.id) { e.name = o.displayName || e.name; e.upn = o.userPrincipalName || ""; }
            });
          });
        } catch (e) { console.warn("Exclusions: directory lookup failed", e.message); }
      }
    }
    // directory roles by template id
    if (byKind("role").length) {
      onStatus?.("Resolving directory roles…");
      try {
        const tpl = await Graph.ggetAll("/directoryRoleTemplates");
        byKind("role").forEach((e) => { const t = tpl.find((x) => x.id === e.id); if (t) e.name = t.displayName; });
      } catch (e) { console.warn("Exclusions: role templates failed", e.message); }
    }
    // named locations
    if (byKind("location").length) {
      onStatus?.("Resolving named locations…");
      try {
        const locs = await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
        byKind("location").forEach((e) => { const l = locs.find((x) => x.id === e.id); if (l) e.name = l.displayName; });
      } catch (e) { console.warn("Exclusions: named locations failed", e.message); }
    }
    // applications by appId
    const apps = byKind("app").filter((e) => isGuid(e.id));
    if (apps.length) {
      onStatus?.("Resolving applications…");
      for (const part of chunk(apps, 15)) {
        try {
          const flt = part.map((e) => `'${e.id}'`).join(",");
          const sps = await Graph.ggetAll(`/servicePrincipals?$filter=appId in (${flt})&$select=appId,displayName`);
          part.forEach((e) => { const sp = sps.find((s) => s.appId === e.id); if (sp) e.name = sp.displayName; });
        } catch (e) { console.warn("Exclusions: app lookup failed", e.message); }
      }
    }
    // group membership (transitive users)
    const groups = byKind("group");
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      onStatus?.(`Expanding group ${i + 1}/${groups.length}…`);
      try {
        const members = await Graph.ggetAll(`/groups/${g.id}/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName&$top=999`);
        g.memberTotal = members.length;
        g.members = members.slice(0, MEMBER_CAP).map((m) => ({ id: m.id, name: m.displayName || m.id, upn: m.userPrincipalName || "" }));
      } catch (e) {
        console.warn(`Exclusions: members of ${g.name || g.id} failed`, e.message);
        g.members = []; g.memberTotal = null;
      }
    }
    model.entities.forEach((e) => { e.name = e.name || e.id; });
    return model;
  }

  // ---- 3. effective per-user exclusions (direct + via group) ----
  function effectiveUsers(model) {
    const users = new Map(); // userId -> { name, upn, byPolicy: Map(policyId -> [reasons]) }
    const touch = (id, name, upn) => {
      let u = users.get(id);
      if (!u) { u = { id, name: name || id, upn: upn || "", byPolicy: new Map() }; users.set(id, u); }
      if (name && u.name === u.id) u.name = name;
      if (upn && !u.upn) u.upn = upn;
      return u;
    };
    const addReason = (u, pid, reason) => {
      if (!u.byPolicy.has(pid)) u.byPolicy.set(pid, []);
      u.byPolicy.get(pid).push(reason);
    };
    // "All"/"None"/"GuestsOrExternalUsers" are sentinels, not real principals
    const SENTINEL_IDS = new Set(["All", "None", "GuestsOrExternalUsers"]);
    for (const e of model.entities) {
      if (e.kind === "user" && !SENTINEL_IDS.has(e.id)) {
        const u = touch(e.id, e.name, e.upn);
        e.policyIds.forEach((pid) => addReason(u, pid, { via: "direct" }));
      } else if (e.kind === "group" && e.members) {
        for (const m of e.members) {
          const u = touch(m.id, m.name, m.upn);
          e.policyIds.forEach((pid) => addReason(u, pid, { via: "group", group: e.name }));
        }
      }
    }
    return [...users.values()].sort((a, b) => b.byPolicy.size - a.byPolicy.size || a.name.localeCompare(b.name));
  }

  function summary(model, users) {
    const withExc = model.policies.filter((p) => p.exclusionCount > 0).length;
    const counts = {};
    model.entities.forEach((e) => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    return { policies: model.policies.length, policiesWithExclusions: withExc, entities: model.entities.length, users: users.length, counts };
  }

  // ---- rendering ----
  const sortEntities = (a, b) => (KIND[a.kind].order - KIND[b.kind].order) || b.policyIds.size - a.policyIds.size || String(a.name).localeCompare(String(b.name));

  function renderSummary(s) {
    const kinds = Object.entries(s.counts).sort((a, b) => KIND[a[0]].order - KIND[b[0]].order)
      .map(([k, n]) => `<span class="tag">${KIND[k].icon} ${n} ${esc(KIND[k].label)}${n === 1 ? "" : "s"}</span>`).join(" ");
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>🚪 CA Exclusion analyzer</h3>
        <p style="margin-bottom:8px">Every exclusion configured across your Conditional Access policies — users, groups (with their members), directory roles, guest types, applications, named locations and device platforms — mapped against the policies that exclude them.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${kinds || '<span class="mini">No exclusions found.</span>'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.entities}<span class="mini" style="font-weight:400"> exclusions</span></div>
        <div class="mini">${s.policiesWithExclusions} of ${s.policies} policies have exclusions</div>
        <div class="mini">${s.users} user${s.users === 1 ? "" : "s"} effectively excluded</div>
      </div>
    </div>`;
  }

  // Entities of the same kind that are excluded from exactly the same set of
  // policies say one thing, not seventeen — collapse them into a single row.
  // (A baseline typically excludes all 17 admin roles from the same policy.)
  function mergeRows(list) {
    const groups = new Map();
    for (const e of list) {
      const key = e.kind + "|" + [...e.policyIds].sort().join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.values()].map((items) => ({
      kind: items[0].kind,
      policyIds: items[0].policyIds,
      items,
      name: items.length === 1 ? items[0].name : `${items.length} ${KIND[items[0].kind].label.toLowerCase()}s`,
      merged: items.length > 1,
    })).sort((a, b) => (KIND[a.kind].order - KIND[b.kind].order) || b.policyIds.size - a.policyIds.size
      || b.items.length - a.items.length || String(a.name).localeCompare(String(b.name)));
  }

  const rowSub = (e) => (e.kind === "group"
    ? (e.memberTotal == null ? "members unknown" : `${e.memberTotal} member${e.memberTotal === 1 ? "" : "s"}`)
    : e.upn || (e.id !== e.name ? e.id : ""));

  // matrix: exclusions (rows) × policies (columns)
  function renderMatrix(model, filterKind, query, merge = true) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!pols.length) return '<p class="mini" style="padding:20px">No policy in scope has any exclusion configured.</p>';
    const q = (query || "").toLowerCase();
    const matched = model.entities
      .filter((e) => filterKind === "all" || e.kind === filterKind)
      .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q))
      .sort(sortEntities);
    if (!matched.length) return '<p class="mini" style="padding:20px">No exclusions match the current filter.</p>';
    const rows = merge ? mergeRows(matched) : matched.map((e) => ({ kind: e.kind, policyIds: e.policyIds, items: [e], name: e.name, merged: false }));
    const collapsed = matched.length - rows.length;
    const head = `<th class="ucol">Exclusion (${rows.length}${collapsed ? ` of ${matched.length}` : ""})</th>` + pols.map((p) =>
      `<th class="pcol"><div class="ph" title="${esc(p.name)}">${esc(p.name)}${p.state === "disabled" ? " [Off]" : p.state === "enabledForReportingButNotEnforced" ? " [RO]" : ""}</div></th>`).join("");
    const body = rows.map((r) => {
      const label = r.merged
        ? `<span class="uname">${KIND[r.kind].icon} ${esc(r.name)}</span><div class="uupn" title="${esc(r.items.map((i) => i.name).join(", "))}">${esc(r.items.map((i) => i.name).join(" · "))}</div>`
        : `<span class="uname">${KIND[r.kind].icon} ${esc(r.items[0].name)}</span><div class="uupn">${esc(KIND[r.kind].label)}${rowSub(r.items[0]) ? " · " + esc(rowSub(r.items[0])) : ""}</div>`;
      return `<tr><td class="ucol${r.merged ? " merged" : ""}">${label}</td>` +
        pols.map((p) => r.policyIds.has(p.id)
          ? `<td class="cellv no" title="${esc(r.name)} excluded from ${esc(p.name)}"><span class="cell no">✗</span></td>`
          : `<td class="cellv"><span class="cell na">·</span></td>`).join("") + "</tr>";
    }).join("");
    const note = collapsed ? `<p class="mini" style="padding:8px 2px 0">${collapsed} exclusion${collapsed === 1 ? "" : "s"} merged into shared rows — entries of the same type excluded from exactly the same policies are shown together.</p>` : "";
    return `<div class="mwrap-x"><table class="mtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${note}`;
  }

  // Grouped view — the readable default. One card per distinct exclusion set:
  // the policies are named in the card header, so nothing has to be read off a
  // 90-column grid. The matrix stays available for cross-referencing.
  function renderGroups(model, filterKind, query) {
    const q = (query || "").toLowerCase();
    const matched = model.entities
      .filter((e) => filterKind === "all" || e.kind === filterKind)
      .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q));
    if (!matched.length) return '<p class="mini" style="padding:20px">No exclusions match the current filter.</p>';

    // one card per identical policy set, regardless of entity kind
    const sets = new Map();
    for (const e of matched) {
      const key = [...e.policyIds].sort().join(",");
      if (!sets.has(key)) sets.set(key, { policyIds: e.policyIds, entities: [] });
      sets.get(key).entities.push(e);
    }
    const byId = new Map(model.policies.map((p) => [p.id, p]));
    const cards = [...sets.values()]
      .sort((a, b) => b.policyIds.size - a.policyIds.size || b.entities.length - a.entities.length)
      .map((s) => {
        const pols = [...s.policyIds].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
        const polList = pols.map((p) => `<span class="ex-pol${p.state === "disabled" ? " off" : p.state === "enabledForReportingButNotEnforced" ? " ro" : ""}">${esc(p.name)}${p.state === "disabled" ? " · Off" : p.state === "enabledForReportingButNotEnforced" ? " · report-only" : ""}</span>`).join("");
        // entities grouped by kind inside the card
        const byKind = new Map();
        for (const e of s.entities) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind).push(e); }
        const kinds = [...byKind.entries()].sort((a, b) => KIND[a[0]].order - KIND[b[0]].order).map(([k, items]) => {
          items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          const chips = items.map((e) => {
            const sub = rowSub(e);
            return `<span class="ex-ent" title="${esc(e.id)}${sub ? " · " + esc(sub) : ""}">${esc(e.name)}${e.kind === "group" && e.memberTotal != null ? `<i>${e.memberTotal}</i>` : ""}</span>`;
          }).join("");
          return `<div class="ex-kind"><div class="ex-kind-h">${KIND[k].icon} ${esc(KIND[k].label)}${items.length === 1 ? "" : "s"} <b>${items.length}</b></div><div class="ex-chips">${chips}</div></div>`;
        }).join("");
        // what is excluded comes first; the policies doing the excluding follow
        return `<div class="list-card ex-card">
          <div class="ex-card-b">
            <div class="ex-card-t">${s.entities.length} exclusion${s.entities.length === 1 ? "" : "s"}</div>
            ${kinds}
          </div>
          <div class="ex-card-h">
            <div class="ex-card-t">Excluded from <b>${pols.length}</b> polic${pols.length === 1 ? "y" : "ies"}</div>
            <div class="ex-pols">${polList}</div>
          </div>
        </div>`;
      }).join("");
    return `<p class="mini" style="margin:0 0 10px">${matched.length} exclusion${matched.length === 1 ? "" : "s"} across ${sets.size} distinct exclusion set${sets.size === 1 ? "" : "s"} — everything in a card is excluded from exactly the same policies.</p>${cards}`;
  }

  // matrix: effectively excluded users (rows) × policies (columns)
  function renderUsers(model, users, query, page, pageSize) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const q = (query || "").toLowerCase();
    const list = users.filter((u) => !q || u.name.toLowerCase().includes(q) || (u.upn || "").toLowerCase().includes(q));
    if (!list.length) return { html: '<p class="mini" style="padding:20px">No excluded users match the current filter.</p>', pages: 1, page: 0 };
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(page * pageSize, (page + 1) * pageSize);
    const head = `<th class="ucol">Excluded user (${list.length})</th>` + pols.map((p) =>
      `<th class="pcol"><div class="ph" title="${esc(p.name)}">${esc(p.name)}</div></th>`).join("");
    const body = slice.map((u) => `<tr><td class="ucol"><span class="uname">${esc(u.name)}</span><div class="uupn">${esc(u.upn)}</div></td>` +
      pols.map((p) => {
        const r = u.byPolicy.get(p.id);
        if (!r) return `<td class="cellv"><span class="cell na">·</span></td>`;
        const direct = r.some((x) => x.via === "direct");
        const groups = [...new Set(r.filter((x) => x.via === "group").map((x) => x.group))];
        const tip = direct ? "excluded directly" : `excluded via ${groups.join(", ")}`;
        return `<td class="cellv no" title="${esc(u.name)}: ${esc(tip)}"><span class="cell ${direct ? "no" : "ro"}">${direct ? "✗" : "◐"}</span></td>`;
      }).join("") + "</tr>").join("");
    return { html: `<div class="mwrap-x"><table class="mtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`, pages, page };
  }

  // ---- CSV export (exclusion × policy) ----
  function toCsv(model, users) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [];
    lines.push([q("Type"), q("Exclusion"), q("Id"), q("Members"), ...pols.map((p) => q(p.name))].join(","));
    model.entities.slice().sort(sortEntities).forEach((e) => {
      lines.push([q(KIND[e.kind].label), q(e.name), q(e.id), q(e.kind === "group" ? (e.memberTotal ?? "") : ""),
        ...pols.map((p) => q(e.policyIds.has(p.id) ? "excluded" : ""))].join(","));
    });
    lines.push("");
    lines.push([q("Effectively excluded user"), q("UPN"), ...pols.map((p) => q(p.name))].join(","));
    users.forEach((u) => {
      lines.push([q(u.name), q(u.upn), ...pols.map((p) => {
        const r = u.byPolicy.get(p.id);
        if (!r) return q("");
        return q(r.some((x) => x.via === "direct") ? "direct" : `via ${[...new Set(r.filter((x) => x.via === "group").map((x) => x.group))].join(" / ")}`);
      })].join(","));
    });
    return lines.join("\n");
  }

  // ---- Markdown export (shareable / pasteable into a chat or ticket) ----
  // Wide matrices do not survive markdown, so the matrix is transposed into
  // one row per exclusion with the excluding policies listed inline. A compact
  // ✗/◐ matrix is added as well when the policy count still fits.
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const stateTag = (s) => (s === "disabled" ? " *(Off)*" : s === "enabledForReportingButNotEnforced" ? " *(report-only)*" : "");
  const MD_MATRIX_MAX = 12; // columns beyond this become unreadable

  function toMd(model, users, tenantName) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const clean = model.policies.filter((p) => !p.exclusionCount);
    const s = summary(model, users);
    const ents = model.entities.slice().sort(sortEntities);
    const L = [];

    L.push(`# CA Exclusion analysis — ${mdEsc(tenantName || "tenant")}`);
    L.push("");
    L.push(`Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC by Conditional Access Baseline Tools (cadoc.limon-it.nl).`);
    L.push("");
    L.push("## Summary");
    L.push("");
    L.push(`- Policies in scope: **${s.policies}** — **${s.policiesWithExclusions}** have one or more exclusions, ${s.policies - s.policiesWithExclusions} have none.`);
    L.push(`- Distinct exclusions: **${s.entities}**` + (Object.keys(s.counts).length
      ? ` (${Object.entries(s.counts).sort((a, b) => KIND[a[0]].order - KIND[b[0]].order).map(([k, n]) => `${n} ${KIND[k].label.toLowerCase()}${n === 1 ? "" : "s"}`).join(", ")})`
      : ""));
    L.push(`- Users effectively excluded from at least one policy (directly or through a group): **${s.users}**`);
    L.push("");

    // ---- exclusions ----
    L.push("## Exclusions by policy");
    L.push("");
    if (!ents.length) {
      L.push("_No exclusions are configured on any policy in scope._");
    } else {
      L.push("Entries of the same type excluded from exactly the same policies are merged into one row.");
      L.push("");
      L.push("| Type | Exclusion | Members | Policies | Excluded from |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const r of mergeRows(ents)) {
        const names = pols.filter((p) => r.policyIds.has(p.id)).map((p) => mdEsc(p.name));
        const who = r.merged ? `**${r.items.length} ${KIND[r.kind].label.toLowerCase()}s** — ${r.items.map((i) => mdEsc(i.name)).join(", ")}` : mdEsc(r.items[0].name);
        const members = r.kind === "group" ? r.items.reduce((s, i) => s + (i.memberTotal || 0), 0) || "?" : "—";
        L.push(`| ${KIND[r.kind].label} | ${who} | ${members} | ${names.length} | ${names.join("<br>") || "—"} |`);
      }
    }
    L.push("");

    // ---- compact matrix when it fits ----
    if (pols.length && pols.length <= MD_MATRIX_MAX && ents.length) {
      L.push("### Exclusion × policy matrix");
      L.push("");
      L.push(`| Exclusion | ${pols.map((p) => mdEsc(p.name)).join(" | ")} |`);
      L.push(`| --- |${pols.map(() => " :-: |").join("")}`);
      for (const e of ents) {
        L.push(`| ${KIND[e.kind].label}: ${mdEsc(e.name)} | ${pols.map((p) => (e.policyIds.has(p.id) ? "✗" : "·")).join(" | ")} |`);
      }
      L.push("");
      L.push("`✗` = excluded · `·` = in scope");
      L.push("");
    }

    // ---- group membership ----
    const groups = ents.filter((e) => e.kind === "group" && e.members && e.members.length);
    if (groups.length) {
      L.push("## Excluded group membership");
      L.push("");
      for (const g of groups) {
        const more = g.memberTotal != null && g.memberTotal > g.members.length ? ` — showing ${g.members.length} of ${g.memberTotal}` : "";
        L.push(`**${mdEsc(g.name)}** (${g.memberTotal == null ? "?" : g.memberTotal} member${g.memberTotal === 1 ? "" : "s"}${more})`);
        L.push("");
        for (const m of g.members) L.push(`- ${mdEsc(m.name)}${m.upn ? ` — \`${mdEsc(m.upn)}\`` : ""}`);
        L.push("");
      }
    }

    // ---- effective users ----
    L.push("## Effectively excluded users");
    L.push("");
    if (!users.length) {
      L.push("_No individual user could be resolved from the configured exclusions._");
    } else {
      L.push("| User | UPN | Policies | Excluded from (how) |");
      L.push("| --- | --- | --- | --- |");
      for (const u of users) {
        const parts = [];
        for (const p of pols) {
          const r = u.byPolicy.get(p.id);
          if (!r) continue;
          const how = r.some((x) => x.via === "direct")
            ? "direct"
            : `via ${[...new Set(r.filter((x) => x.via === "group").map((x) => x.group))].map(mdEsc).join(" / ")}`;
          parts.push(`${mdEsc(p.name)} (${how})`);
        }
        L.push(`| ${mdEsc(u.name)} | ${mdEsc(u.upn)} | ${parts.length} | ${parts.join("<br>") || "—"} |`);
      }
    }
    L.push("");

    if (clean.length) {
      L.push("## Policies without exclusions");
      L.push("");
      for (const p of clean) L.push(`- ${mdEsc(p.name)}${stateTag(p.state)}`);
      L.push("");
    }
    return L.join("\n");
  }

  return { collect, resolve, effectiveUsers, summary, renderSummary, renderGroups, renderMatrix, renderUsers, toCsv, toMd, KIND };
})();
