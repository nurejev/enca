// ======================================================================
// 🌍 Fill deploy groups from regions (beta 32432) — T12 CA groups.
//
// Mihai, 30 Sep 2026, after a mockup: "check the waves members deployment
// from Tuno. For the deployment groups I need a similar button: read the
// member groups per region and country, get the users, and put them in the
// CAD-SEC-U-DG-* groups." The rules were settled on the mockup, one answer at
// a time; they are the RULES below and nothing else.
//
//   0a  a SECOND account (@pvmict.com, @perfettivanmelle.onmicrosoft.com)
//       whose part before the @ is also a MAIN account (@perfettivanmelle.com)
//       → DG-ADM only                  ("should go to ADM if not there already")
//   0b  a second account without a main account → DG-SA only
//   0c  a user whose only sources are the Unlicensed-* groups (no Intune)
//       → DG-SA only                    ("1 out and into SA")
//   1   userType Guest → DG-GUESTUSERS          ┐
//   2   extensionAttribute10 starts with        │ exclusive
//       "External", any case → DG-EXT           │
//   3   anybody else → DG-INT                   ┘
//   4   everybody of 1–3 → DG-GLO
//   5   a MAIN account that has a second account → DG-DevOps (additive)
//
// Pairing is the part before the @, case-insensitive — employeeId is not set
// on the second accounts ("try to match before @").
//
// FIX ("2 fix also"): a user READ FROM A TICKED SOURCE who sits in a managed
// group the rules do not give her is taken out of it — INT → EXT, GLO/INT →
// SA and so on. Somebody who is in no ticked source is never touched: the
// tool only knows the people it read, and absence from a half-ticked region
// list says nothing. DG-DevOps is add-only (it also holds people added by
// hand, and "has no second account" is not a reason to lose DevOps).
// Removal is of DIRECT membership only; a nested member is reported, never
// "removed" by a call that cannot do it.
//
// ORDER IS THE SAFETY PROPERTY: every add runs before any removal, so a user
// moving from INT to EXT is never in neither for a moment.
//
// Pure planning, no Graph — the app injects the reads and the writes, and
// tools/dgfill.test.cjs drives the whole thing with fakes.
// ======================================================================
const DgFill = (() => {
  const TARGETS = [
    { key: "GLO",        name: "CAD-SEC-U-DG-GLO",        fix: true,  label: "everybody (rules 1–3)" },
    { key: "INT",        name: "CAD-SEC-U-DG-INT",        fix: true,  label: "internal members" },
    { key: "EXT",        name: "CAD-SEC-U-DG-EXT",        fix: true,  label: "extensionAttribute10 starts with External" },
    { key: "GUESTUSERS", name: "CAD-SEC-U-DG-GUESTUSERS", fix: true,  label: "guests" },
    { key: "DevOps",     name: "CAD-SEC-U-DG-DevOps",     fix: false, label: "main account of a user with a second account" },
    { key: "ADM",        name: "CAD-SEC-U-DG-ADM",        fix: true,  label: "second account with a main account" },
    { key: "SA",         name: "CAD-SEC-U-DG-SA",         fix: true,  label: "second account without a main account, and users without Intune" },
  ];
  const KEYS = TARGETS.map((t) => t.key);

  const DEFAULTS = {
    prefix: "PVM-UG-CORP-MEM-USERS-",
    mainDomain: "perfettivanmelle.com",
    secondDomains: ["pvmict.com", "perfettivanmelle.onmicrosoft.com"],
    extPrefix: "external",
    skipDisabled: true,
    fix: true,
  };

  // Mihai's region list (screenshot, 30 Sep). Keyed by the group's display
  // name after the prefix, because two of the rows are SITE groups (Warsaw,
  // Skarbimierz), not countries. "PL" is not on his list; he asked for it to
  // be added "only if the users are different" — the plan is a union by user
  // id, so a Pole already in Warsaw or Skarbimierz counts once whatever is
  // ticked. SK, NE, KZ, BY, SZ are the tenant's country groups he did NOT
  // list: shown, unticked ("add them unticked").
  const REGIONS = [
    { region: "Euro", groups: [["GB", "UK"], ["BE", "Belgium", "PILOT"], ["NL", "Netherlands"], ["LU", "Luxembourg"], ["CZ", "Czech"], ["POL-Warszawa", "PVM Polska (Warsaw)"], ["POL-SKARB", "PVM Production (Skarbimierz)"], ["PL", "Poland (rest)"], ["DK", "Denmark"], ["FR", "France"], ["CH", "Switzerland"], ["ES", "Spain"], ["PT", "Portugal"], ["GR", "Greece"], ["DE", "Germany"]] },
    { region: "North America / Mexico", groups: [["US", "North America"], ["MX", "Mexico"], ["CA", "Canada"]] },
    { region: "Asia Pacific", groups: [["CN", "China"], ["ID", "Indonesia"], ["VN", "Vietnam"], ["PH", "Philippines"], ["JP", "Japan"], ["MY", "Malaysia"], ["TH", "Thailand"], ["KR", "South Korea"], ["AU", "Australia"], ["SG", "Singapore"], ["HK", "Hong Kong"]] },
    { region: "Italy", groups: [["IT", "Italy"]] },
    { region: "BAMSCA", groups: [["IN", "India"], ["BR", "Brazil"], ["BD", "Bangladesh"], ["LK", "Sri Lanka"], ["NG", "Nigeria"], ["NP", "Nepal"], ["UAE", "Export Middle East & Africa DMCC"], ["ZA", "South Africa"], ["RU", "Russia"], ["TR", "Turkey"]] },
  ];

  const lc = (s) => String(s || "").trim().toLowerCase();
  const domainOf = (upn) => { const s = lc(upn); const i = s.lastIndexOf("@"); return i < 0 ? "" : s.slice(i + 1); };
  const localOf = (upn) => { const s = lc(upn); const i = s.lastIndexOf("@"); return i < 0 ? s : s.slice(0, i); };
  const ext10 = (u) => String(((u && u.onPremisesExtensionAttributes) || {}).extensionAttribute10 || (u && u.ext10) || "").trim();

  // ---------- sources ----------
  // Classify the tenant's groups under the prefix. A COUNTRY group is found
  // by its rule (usageLocation -eq "XX" plus the licence clause), never by its
  // name: -UAE carries AE, and a name typed differently must not decide it.
  function classifySources(groups, opts) {
    const o = { ...DEFAULTS, ...(opts || {}) };
    const pre = lc(o.prefix);
    const listed = new Map();
    REGIONS.forEach((r) => r.groups.forEach(([suffix, label, tag]) => listed.set(lc(o.prefix + suffix), { region: r.region, label, tag: tag || "" })));
    const rows = [];
    for (const g of groups || []) {
      const name = String(g.displayName || g.name || "");
      if (!lc(name).startsWith(pre)) continue;
      const rule = String(g.membershipRule || "");
      const suffix = name.slice(o.prefix.length);
      const m = /usageLocation\s+-eq\s+"([A-Za-z]{2})"/.exec(rule);
      const onlyCountry = m && !/\buser\.city\b|companyName|physicalDelivery/i.test(rule);
      let kind;
      if (/accountEnabled\s+-eq\s+false/i.test(rule) && !/-eq\s+true/i.test(rule)) kind = "ignored";
      else if (/^test$/i.test(suffix)) kind = "ignored";
      else if (/unlicensed/i.test(suffix)) kind = "unlicensed";
      else if (onlyCountry) kind = "country";
      else kind = "site";
      const l = listed.get(lc(name));
      rows.push({
        id: g.id, name, suffix, kind, rule,
        country: m ? m[1].toUpperCase() : "",
        dynamic: (g.groupTypes || []).includes("DynamicMembership") || !!rule,
        region: l ? l.region : (kind === "unlicensed" ? "No Intune licence" : kind === "ignored" ? "Ignored" : kind === "country" ? "Not in your region list" : "Other site groups"),
        label: l ? l.label : suffix,
        tag: l ? l.tag : "",
        listed: !!l,
        // What is ticked when the dialog opens: the region list, and the
        // Unlicensed groups (they go to SA only). Everything else waits for a tick.
        ticked: (!!l && kind !== "ignored") || kind === "unlicensed",
        count: g.count == null ? null : Number(g.count),
      });
    }
    const order = [...REGIONS.map((r) => r.region), "Not in your region list", "No Intune licence", "Other site groups", "Ignored"];
    const pos = (r) => { if (!r.listed) return 1e3; const reg = REGIONS.find((x) => x.region === r.region); return reg.groups.findIndex(([s]) => lc(o.prefix + s) === lc(r.name)); };
    rows.sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region) || pos(a) - pos(b) || a.name.localeCompare(b.name));
    // A region-list row whose group this tenant does not have is still shown,
    // so a typo in the list or a deleted group is visible instead of silent.
    const missing = [];
    for (const r of REGIONS) for (const [suffix, label] of r.groups) {
      const name = o.prefix + suffix;
      if (!rows.some((x) => lc(x.name) === lc(name))) missing.push({ name, region: r.region, label });
    }
    return { rows, missing };
  }

  // ---------- pairing ----------
  // second: users in the second-account domains. mains: Map lower(upn) →
  // user | null for every candidate main account (read by the app).
  function pairs(second, mains, opts) {
    const o = { ...DEFAULTS, ...(opts || {}) };
    const out = [];
    for (const s of second || []) {
      if (!isSecond(s, o)) continue;
      const want = `${localOf(s.userPrincipalName)}@${lc(o.mainDomain)}`;
      const main = mains && mains.get ? mains.get(want) : null;
      out.push({ second: s, mainUpn: want, main: main || null });
    }
    return out;
  }
  // A guest's UPN ends in the tenant's onmicrosoft.com domain too
  // (j.smith_partner.com#EXT#@perfettivanmelle.onmicrosoft.com) — it is a
  // guest, not somebody's second account.
  const isSecond = (u, o) => lc(u.userType) !== "guest" && !/#ext#/i.test(u.userPrincipalName || "")
    && o.secondDomains.map(lc).includes(domainOf(u.userPrincipalName));

  // ---------- the plan ----------
  // input:
  //   sources:  [{ id, name, kind }] — only the TICKED ones
  //   members:  Map sourceId → [user]   (transitive users of each source)
  //   guests:   [user] | null           — the "All guests" source when ticked
  //   second:   [user] | null           — every account in the second domains
  //   mains:    Map lower(upn) → user|null
  //   targets:  { KEY: { id, name, dynamic, roleAssignable, direct: Set(ids), nested: Set(ids) } | null }
  function plan(input, opts) {
    const o = { ...DEFAULTS, ...(opts || {}) };
    const inp = input || {};
    const users = new Map();          // id → { u, from: Set(kind), src: [names] }
    const touch = (u, kind, name) => {
      if (!u || !u.id) return;
      const e = users.get(u.id) || { u, from: new Set(), src: [] };
      e.from.add(kind); if (name && !e.src.includes(name)) e.src.push(name);
      users.set(u.id, e);
    };
    for (const s of inp.sources || []) for (const u of (inp.members && inp.members.get(s.id)) || []) touch(u, s.kind, s.label || s.suffix || s.name);
    for (const u of inp.guests || []) touch(u, "guests", "All guests");
    for (const u of inp.second || []) if (isSecond(u, o)) touch(u, "second", "Second accounts");

    const pr = pairs(inp.second || [], inp.mains, o);
    const pairBySecond = new Map(pr.map((p) => [p.second.id, p]));
    const mainsWithSecond = new Map();   // main id → [second upn]
    for (const p of pr) if (p.main && p.main.id && !(o.skipDisabled && p.main.accountEnabled === false)) {
      const list = mainsWithSecond.get(p.main.id) || []; list.push(p.second.userPrincipalName); mainsWithSecond.set(p.main.id, list);
    }

    const targets = inp.targets || {};
    const refusals = [];
    for (const t of TARGETS) {
      const g = targets[t.key];
      if (!g) refusals.push({ key: t.key, name: t.name, why: "not found in this tenant — create it first (② Create)" });
      else if (g.dynamic) refusals.push({ key: t.key, name: t.name, why: "dynamic membership — its rule decides who is in it; members cannot be added or removed" });
    }
    const usable = (k) => targets[k] && !targets[k].dynamic;
    const fixOn = (k) => o.fix && TARGETS.find((t) => t.key === k).fix && !(o.noFix || []).includes(k);

    const rows = [];
    const adds = Object.fromEntries(KEYS.map((k) => [k, []]));
    const removes = Object.fromEntries(KEYS.map((k) => [k, []]));
    const nestedOnly = [];
    const extValues = new Map();
    const inDirect = (k, id) => !!(targets[k] && targets[k].direct && targets[k].direct.has(id));
    const inNested = (k, id) => !!(targets[k] && targets[k].nested && targets[k].nested.has(id));

    const decide = (e) => {
      const u = e.u;
      if (isSecond(u, o)) {
        const p = pairBySecond.get(u.id) || pairs([u], inp.mains, o)[0];
        return p && p.main ? { want: ["ADM"], rule: "0a", why: `second account of ${p.main.userPrincipalName}` }
          : { want: ["SA"], rule: "0b", why: `no ${p ? p.mainUpn : "main account"}` };
      }
      const licensedSource = [...e.from].some((k) => k === "country" || k === "site" || k === "guests");
      if (!licensedSource && e.from.has("unlicensed")) return { want: ["SA"], rule: "0c", why: "no Intune licence (Unlicensed group only)" };
      if (lc(u.userType) === "guest") return { want: ["GUESTUSERS", "GLO"], rule: "1", why: "guest" };
      const x = ext10(u);
      if (x) extValues.set(x, (extValues.get(x) || 0) + 1);
      if (lc(x).startsWith(lc(o.extPrefix))) return { want: ["EXT", "GLO"], rule: "2", why: `extensionAttribute10 "${x}"` };
      return { want: ["INT", "GLO"], rule: "3", why: "member" };
    };

    for (const e of users.values()) {
      const u = e.u;
      const row = { id: u.id, upn: u.userPrincipalName || u.displayName || u.id, userType: u.userType || "", ext10: ext10(u), src: e.src, add: [], remove: [], keep: [], rule: "", why: "" };
      if (o.skipDisabled && u.accountEnabled === false) { row.rule = "skip"; row.why = "disabled account — skipped"; rows.push(row); continue; }
      const d = decide(e);
      const want = new Set(d.want);
      if (mainsWithSecond.has(u.id)) { want.add("DevOps"); row.second = mainsWithSecond.get(u.id); }
      row.rule = d.rule + (want.has("DevOps") ? "+5" : ""); row.why = d.why + (want.has("DevOps") ? ` · has ${row.second.join(", ")}` : "");
      for (const k of want) {
        if (inDirect(k, u.id)) row.keep.push(k);
        else if (usable(k)) { row.add.push(k); adds[k].push(u.id); }
      }
      for (const k of KEYS) {
        if (want.has(k) || !fixOn(k) || !usable(k)) continue;
        if (inDirect(k, u.id)) { row.remove.push(k); removes[k].push(u.id); }
        else if (inNested(k, u.id)) { nestedOnly.push({ id: u.id, upn: row.upn, key: k }); row.nested = (row.nested || []).concat(k); }
      }
      rows.push(row);
    }
    // Rule 5 for a main account nobody ticked a source for: DevOps still
    // follows from the second account, and nothing else about her changes.
    for (const [mid] of mainsWithSecond) {
      if (users.has(mid)) continue;
      const p = pr.find((x) => x.main && x.main.id === mid);
      const row = { id: mid, upn: p.main.userPrincipalName, userType: p.main.userType || "", ext10: ext10(p.main), src: ["(main account of a second account)"], add: [], remove: [], keep: [], rule: "5", why: `has ${mainsWithSecond.get(mid).join(", ")}`, second: mainsWithSecond.get(mid) };
      if (inDirect("DevOps", mid)) row.keep.push("DevOps");
      else if (usable("DevOps")) { row.add.push("DevOps"); adds.DevOps.push(mid); }
      rows.push(row);
    }

    const counts = Object.fromEntries(KEYS.map((k) => [k, {
      add: adds[k].length, remove: removes[k].length,
      now: targets[k] && targets[k].direct ? targets[k].direct.size : null,
    }]));
    const unpaired = pr.filter((p) => !p.main).map((p) => p.second.userPrincipalName);
    return {
      opts: o, rows, adds, removes, counts, refusals, nestedOnly, unpaired,
      extValues: [...extValues.entries()].sort((a, b) => b[1] - a[1]),
      users: rows.length,
      changes: KEYS.reduce((n, k) => n + adds[k].length + removes[k].length, 0),
      addTotal: KEYS.reduce((n, k) => n + adds[k].length, 0),
      removeTotal: KEYS.reduce((n, k) => n + removes[k].length, 0),
      moved: rows.filter((r) => r.add.length && r.remove.length).length,
    };
  }

  // ---------- operations ----------
  // Adds first, every group; removals after. One op per (group, user).
  function ops(p, targets) {
    const out = [];
    for (const k of KEYS) for (const uid of p.adds[k]) out.push({ op: "add", key: k, group: targets[k].id, user: uid });
    for (const k of KEYS) for (const uid of p.removes[k]) out.push({ op: "remove", key: k, group: targets[k].id, user: uid });
    return out;
  }
  // Graph $batch request for one op. "Already a member" / "not a member" are
  // the state we wanted — the caller counts them as done (see settled()).
  function request(op, i) {
    return op.op === "add"
      ? { id: String(i), method: "POST", url: `/groups/${op.group}/members/$ref`, body: { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${op.user}` } }
      : { id: String(i), method: "DELETE", url: `/groups/${op.group}/members/${op.user}/$ref` };
  }
  function settled(op, res) {
    if (!res) return { ok: false, why: "no answer" };
    if (!res.error) return { ok: true };
    const msg = String(res.error || "");
    if (op.op === "add" && (/already exist/i.test(msg) || res.status === 400 && /added object references/i.test(msg))) return { ok: true, already: true };
    if (op.op === "remove" && (res.status === 404 || /does not exist|not found/i.test(msg))) return { ok: true, already: true };
    return { ok: false, why: msg };
  }
  // The exact reverse of what landed — ↩ Undo this run.
  function undoOps(done) {
    return (done || []).filter((d) => d.ok && !d.already).map((d) => ({ ...d, op: d.op === "add" ? "remove" : "add", ok: undefined, already: undefined })).reverse()
      // re-adds first, then removals, same safety order as a run
      .sort((a, b) => (a.op === "add" ? 0 : 1) - (b.op === "add" ? 0 : 1));
  }

  // ---------- report ----------
  function report(meta, p, targets, done) {
    const m = meta || {};
    const L = [];
    L.push(`# 🌍 Fill deploy groups from regions — ${m.tenant || "tenant"}`, "");
    L.push(`Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · mode ${p.opts.fix ? "add + fix" : "add only"} · ${p.users} users read`, "");
    L.push("| Group | Before | Added | Removed |", "|---|---:|---:|---:|");
    for (const t of TARGETS) {
      const c = p.counts[t.key];
      const g = targets && targets[t.key];
      const d = (done || []).filter((x) => x.key === t.key && x.ok);
      L.push(`| ${t.name}${g ? "" : " (not found)"} | ${c.now == null ? "—" : c.now} | ${done ? d.filter((x) => x.op === "add").length : c.add} | ${done ? d.filter((x) => x.op === "remove").length : c.remove} |`);
    }
    if (done) {
      const fail = done.filter((x) => !x.ok);
      L.push("", `${done.filter((x) => x.ok).length} of ${done.length} changes landed${fail.length ? `, **${fail.length} refused**` : ""}.`);
      if (fail.length) { L.push("", "## Refused", ""); fail.slice(0, 200).forEach((f) => L.push(`- ${f.op} ${f.key} · ${f.upn || f.user} — ${f.why}`)); }
    }
    if (p.refusals.length) { L.push("", "## Groups not written", ""); p.refusals.forEach((r) => L.push(`- ${r.name} — ${r.why}`)); }
    if (p.unpaired.length) { L.push("", "## Second accounts without a main account (→ SA)", ""); p.unpaired.forEach((u) => L.push(`- ${u}`)); }
    if (p.nestedOnly.length) { L.push("", "## Nested members the fix cannot remove", ""); p.nestedOnly.slice(0, 200).forEach((n) => L.push(`- ${n.upn} in ${n.key} through another group`)); }
    if (p.extValues.length) { L.push("", "## extensionAttribute10 values seen", ""); p.extValues.forEach(([v, n]) => L.push(`- "${v}" — ${n}${lc(v).startsWith(lc(p.opts.extPrefix)) ? " (external)" : ""}`)); }
    const changed = p.rows.filter((r) => r.add.length || r.remove.length);
    L.push("", `## Changes per user (${changed.length})`, "", "| User | Sources | Rule | Adds | Removes | Why |", "|---|---|---|---|---|---|");
    changed.slice(0, 2000).forEach((r) => L.push(`| ${r.upn} | ${r.src.join(", ")} | ${r.rule} | ${r.add.join(" ")} | ${r.remove.join(" ")} | ${r.why.replace(/\|/g, "\\|")} |`));
    if (changed.length > 2000) L.push("", `…and ${changed.length - 2000} more — Export CSV has every row.`);
    return L.join("\n");
  }
  function csv(p) {
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["userPrincipalName", "id", "userType", "extensionAttribute10", "sources", "rule", "add", "remove", "already", "why"];
    return [head.join(";"), ...p.rows.map((r) => [r.upn, r.id, r.userType, r.ext10, r.src.join(" | "), r.rule, r.add.join(" "), r.remove.join(" "), r.keep.join(" "), r.why].map(q).join(";"))].join("\r\n");
  }

  // ---------- demo ----------
  // A small tenant shaped like Perfetti's: a handful of country groups, one
  // Unlicensed group, guests, second accounts with and without a main account,
  // somebody in the wrong group. Enough to see every rule and the fix.
  function demo() {
    const P = DEFAULTS.prefix;
    const rule = (cc) => `(user.usageLocation -eq "${cc}") and (user.assignedPlans -any (assignedPlan.servicePlanId -eq "c1ec4a95-1f05-45b3-a911-aa3fa01094f5" -and assignedPlan.capabilityStatus -eq "Enabled"))`;
    const groups = [
      ...["NL", "BE", "IT", "US", "IN", "PL", "SK"].map((cc) => ({ id: `src-${cc}`, displayName: P + cc, membershipRule: rule(cc), groupTypes: ["DynamicMembership"] })),
      { id: "src-POL-SKARB", displayName: P + "POL-SKARB", membershipRule: '(user.city -eq "Skarbimierz Osiedle")', groupTypes: ["DynamicMembership"] },
      { id: "src-UNL-Q-T", displayName: P + "Unlicensed-Q-T", membershipRule: '(user.userType -ne "Guest") and (user.accountEnabled -eq true) and (not (user.assignedPlans -any (assignedPlan.servicePlanId -eq "c1ec4a95-1f05-45b3-a911-aa3fa01094f5")) and (user.userPrincipalName -match "^[q-tQ-T].*"))', groupTypes: ["DynamicMembership"] },
      { id: "src-DIS", displayName: P + "DISABELD", membershipRule: "(user.accountEnabled -eq false)", groupTypes: ["DynamicMembership"] },
    ];
    const U = (id, upn, x) => ({ id, userPrincipalName: upn, displayName: upn.split("@")[0], userType: "Member", accountEnabled: true, onPremisesExtensionAttributes: { extensionAttribute10: null }, ...(x || {}) });
    const ext = (v) => ({ onPremisesExtensionAttributes: { extensionAttribute10: v } });
    const users = {
      anna: U("u-anna", "anna.jansen@perfettivanmelle.com"), lukas: U("u-lukas", "lukas.weber@perfettivanmelle.com"),
      marco: U("u-marco", "marco.rossi@perfettivanmelle.com", ext("External - Supplier")), paula: U("u-paula", "paula.souza@perfettivanmelle.com", ext("EXTERNAL")),
      pieter: U("u-pieter", "pieter.claes@perfettivanmelle.com"), raj: U("u-raj", "raj.kumar@perfettivanmelle.com"),
      kasia: U("u-kasia", "k.nowak@perfettivanmelle.com"), jan: U("u-jan", "jan.kowalski@perfettivanmelle.com"),
      rtan: U("u-rtan", "r.tan@perfettivanmelle.com"), sam: U("u-sam", "s.old@perfettivanmelle.com", { accountEnabled: false }),
      guest: U("u-guest", "j.smith_partner.com#EXT#@perfettivanmelle.onmicrosoft.com", { userType: "Guest", ...ext("EXTERNAL") }),
      annaAdm: U("u-anna-adm", "anna.jansen@pvmict.com"), svc: U("u-svc", "svc-build@pvmict.com"),
      rajAdm: U("u-raj-adm", "raj.kumar@perfettivanmelle.onmicrosoft.com"),
    };
    const members = new Map([
      ["src-NL", [users.anna, users.lukas, users.sam]], ["src-BE", [users.pieter]], ["src-IT", [users.marco]],
      ["src-US", [users.paula]], ["src-IN", [users.raj]], ["src-PL", [users.kasia, users.jan]], ["src-POL-SKARB", [users.jan]],
      ["src-UNL-Q-T", [users.rtan]], ["src-SK", []],
    ]);
    const targets = {
      GLO: { id: "dg-glo", name: "CAD-SEC-U-DG-GLO", direct: new Set(["u-lukas", "u-paula", "u-rtan"]), nested: new Set() },
      INT: { id: "dg-int", name: "CAD-SEC-U-DG-INT", direct: new Set(["u-lukas", "u-paula", "u-rtan"]), nested: new Set() },
      EXT: { id: "dg-ext", name: "CAD-SEC-U-DG-EXT", direct: new Set(), nested: new Set() },
      GUESTUSERS: { id: "dg-guest", name: "CAD-SEC-U-DG-GUESTUSERS", direct: new Set(), nested: new Set() },
      DevOps: { id: "dg-devops", name: "CAD-SEC-U-DG-DevOps", direct: new Set(["u-lukas"]), nested: new Set() },
      ADM: { id: "dg-adm", name: "CAD-SEC-U-DG-ADM", direct: new Set(["u-anna-adm"]), nested: new Set() },
      SA: { id: "dg-sa", name: "CAD-SEC-U-DG-SA", direct: new Set(), nested: new Set() },
    };
    const second = [users.annaAdm, users.svc, users.rajAdm];
    const mains = new Map([["anna.jansen@perfettivanmelle.com", users.anna], ["svc-build@perfettivanmelle.com", null], ["raj.kumar@perfettivanmelle.com", users.raj]]);
    return { groups, members, guests: [users.guest], second, mains, targets };
  }

  return { isSecond: (u, opts) => isSecond(u, { ...DEFAULTS, ...(opts || {}) }), TARGETS, KEYS, DEFAULTS, REGIONS, classifySources, pairs, plan, ops, request, settled, undoOps, report, csv, demo, localOf, domainOf, ext10 };
})();
if (typeof module !== "undefined") module.exports = DgFill;
