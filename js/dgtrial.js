// ======================================================================
// 🚀 Trial on deployment group / ↩ Back to persona (beta 33203, e04–e09 —
// decisions Mihai, 7 Nov).
//
// An import no longer stages a whole baseline on the CAD-SEC-U-DG-* deploy
// groups. It lands AS SHIPPED, on the real persona groups, Report-only
// (Importer, e04). Trying one policy on a small group of testers first is a
// PER-POLICY action, here:
//
//   🚀 Trial on deployment group   the policy's include becomes its
//      persona's deploy group (CAD-SEC-U-DG-<CODE>) and nothing else. The
//      include it had — groups AND directory roles AND the guest clause — is
//      saved BEFORE the write (e06). At Leeuwendaal the old deploy-group
//      remap dropped the role includes: CA100 and CA113–CA116 lost 132
//      roles, and nothing could put them back.
//   ↩ Back to persona   the saved include, exactly, read back.
//
// WHERE THE ORIGINAL IS KEPT. In this browser, per tenant
// (enca-dgtrial:<tenant id>, one record per policy id) — the pattern of
// enca-sdswitch and enca-dgfill — and in the trial report (⬇ MD), which
// carries the include as JSON so another browser or a person can restore it.
// A trial is REFUSED when the record cannot be written: nothing is changed
// that cannot be put back. Without a record (another browser, an import in
// the old Deployment groups mode before 33203) ↩ falls back to the catalog:
// the include the baseline ships, resolved by name in this tenant — the
// preview says which source it uses.
//
// WHICH POLICIES (e05, e07, e09):
//   🚨 E-Admins, workload identities, agents   never — emergency access and
//      service-principal scopes have no deploy group.
//   CloudFellows CA000, CA006, CA099, CA1009   refused: they include All
//      users and exclude every persona group, so on a deploy group they
//      test nothing — and CA099 (block users without a persona) would block
//      the persona-less. Rule: Report-only evaluation, then On; CA099 last.
//   SMB Basic CA001–CA005   refused: they REPLACE security defaults —
//      Report-only while it is on, then ⇄ Switch (security defaults Off and
//      CA001–CA005 On in one run).
//   SMB Basic CA200–CA299   the persona read from the number range gives
//      CAD-SEC-U-DG-INT; it is labelled "Compliant network" (e09), because
//      SMB has no Internals persona.
//
// PRE-FLIGHT (e08): per tester in the deploy group, a warning when the
// tester is also in a group the policy excludes (its exclusion group, the
// break-glass group, TeamsSharedDevices, a persona group the policy leaves
// out) or in break-glass / TeamsSharedDevices at all — the trial would not
// reach them; and for CAD-SEC-U-DG-INT, a tester who is not in the Internals
// persona group (the policy goes back to that group after the trial).
//
// Pure apart from the four async functions, which take their Graph and
// their store as arguments — tools/dgtrial.test.cjs runs all of it in node.
// ======================================================================
const DgTrial = (() => {
  const RO = "enabledForReportingButNotEnforced";
  const lower = (s) => String(s ?? "").trim().toLowerCase();
  const clean = (s) => String(s || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim();
  const numOf = (n) => { const m = /\bCA(\d{3,4})\b/i.exec(String(n || "")); return m ? +m[1] : null; };
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const SMB_RE = /^CA\d{3,4}-[A-Z]+-SMB-/i;
  const VERSIONED = /[-\s]v\d+(\.\d+)*\s*$/i;
  const imp = () => (typeof Importer !== "undefined" ? Importer : null);
  // The deploy groups, as the import names them (Importer.PERSONA_GROUPS is
  // the source; this copy only serves a host without the importer). DevOps
  // is written CAD-SEC-U-DG-DevOps, mixed case, everywhere (e09).
  const DG_FALLBACK = {
    global: "CAD-SEC-U-DG-GLO", admins: "CAD-SEC-U-DG-ADM", internals: "CAD-SEC-U-DG-INT",
    externals: "CAD-SEC-U-DG-EXT", guestusers: "CAD-SEC-U-DG-GUESTUSERS", g_admins: "CAD-SEC-U-DG-GUESTAdmins",
    serviceaccounts: "CAD-SEC-U-DG-SA", devops: "CAD-SEC-U-DG-DevOps", factoryworkers: "CAD-SEC-U-DG-FW",
  };
  const DG = () => (imp() && imp().PERSONA_GROUPS) || DG_FALLBACK;
  const PERSONA_LABEL = { global: "Global", admins: "Admins", internals: "Internals", externals: "Externals", guestusers: "Guest users",
    g_admins: "Guest admins", serviceaccounts: "Service accounts", devops: "DevOps", factoryworkers: "Factory workers" };

  // Which baseline a policy NAME belongs to: SMB Basic carries -SMB- after
  // the action, CloudFellows a version suffix (-v1.0.3 / " v3.0.2"), Joey
  // Verlinden (and Joey+) neither. The caller's hint decides only what the
  // name cannot.
  function catalogOf(name, hint) {
    const n = clean(name);
    if (SMB_RE.test(n)) return "smb";
    if (VERSIONED.test(n)) return "limonit";
    return hint && hint !== "smb" ? hint : "joey";
  }

  // e07: CloudFellows policies that include All users and exclude every
  // persona group. A deploy-group trial of them tests nothing.
  const CF_ALL_USERS = {
    0: "CA000 includes All users and excludes every persona group — it covers exactly the users no persona policy reaches, so on a deployment group it would test nobody it is meant for",
    6: "CA006 includes All users and excludes every persona group — on a deployment group it would test nobody it is meant for",
    99: "CA099 blocks every user who is in no persona group — on a deployment group it would test nothing, and a tester without a persona would be blocked",
    1009: "CA1009 includes All users and excludes the DevOps persona — on a deployment group it would test nothing",
  };
  const CF_RULE = "Report-only evaluation (🎚 Report-only impact), then On — CA099 last, once every persona group is filled.";
  const SMB_SD_RULE = "Report-only while security defaults is on; then ⇄ Switch from security defaults on 🧬 Baseline — security defaults Off and CA001–CA005 On in one run.";

  function dgLabel(catalog, num, persona) {
    if (catalog === "smb" && num != null && num >= 200 && num <= 299) return "Compliant network";
    return PERSONA_LABEL[persona] || persona || "";
  }

  // rule(policy, opts) → { ok, code, reason, guidance, dg, persona, label, catalog, num, name }
  //   code: trial | eadmins | workload | agents | allUsers | sdReplace | noPersona
  function rule(p, opts = {}) {
    const raw = (p && (p.raw || p)) || {};
    const name = clean((p && (p.name || p.displayName)) || raw.displayName);
    const num = numOf(name), catalog = catalogOf(name, opts.catalogId);
    const I = imp();
    const out = (o) => ({ name, num, catalog, dg: null, persona: null, label: "", guidance: "", ...o });
    if (I && I.isEAdmins(name)) return out({ ok: false, code: "eadmins", reason: "🚨 E-Admins (emergency access) are imported as shipped and are never tried on a deployment group" });
    if (I && I.isWorkloadIdentity(raw)) return out({ ok: false, code: "workload", reason: "a workload-identity policy targets service principals — it has no deployment group" });
    if (I && I.isAgentPolicy(raw)) return out({ ok: false, code: "agents", reason: "an agent policy targets agent identities — it has no deployment group" });
    if (catalog === "limonit" && Object.prototype.hasOwnProperty.call(CF_ALL_USERS, num)) return out({ ok: false, code: "allUsers", reason: CF_ALL_USERS[num], guidance: CF_RULE });
    if (catalog === "smb" && num != null && num >= 1 && num <= 5) return out({ ok: false, code: "sdReplace", reason: `CA00${num} is one of the five policies that replace security defaults — no deployment-group trial`, guidance: SMB_SD_RULE });
    const persona = I ? I.personaOf(name) : null;
    const dg = (persona && DG()[persona]) || null;
    if (!dg) return out({ ok: false, code: "noPersona", persona, reason: `no deployment group for this policy — its persona${persona ? ` (${persona})` : ""} has none` });
    return out({ ok: true, code: "trial", persona, dg, label: dgLabel(catalog, num, persona) });
  }

  // ---- the include ----------------------------------------------------
  const usersOf = (raw) => ((raw && raw.conditions && raw.conditions.users) || {});
  function includeOf(raw) {
    const u = usersOf(raw);
    return {
      includeUsers: (u.includeUsers || []).slice(),
      includeGroups: (u.includeGroups || []).slice(),
      includeRoles: (u.includeRoles || []).slice(),
      includeGuestsOrExternalUsers: u.includeGuestsOrExternalUsers ? clone(u.includeGuestsOrExternalUsers) : null,
    };
  }
  const trialInclude = (dgId) => ({ includeUsers: [], includeGroups: [dgId], includeRoles: [], includeGuestsOrExternalUsers: null });
  const setOf = (a) => [...new Set((a || []).map(lower))].filter((x) => x && x !== "none").sort().join("|");
  const guestKey = (g) => {
    if (!g) return "";
    const t = String(g.guestOrExternalUserTypes || "").split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
    const e = g.externalTenants || {};
    return `${t}|${e.membershipKind || "all"}|${(e.members || []).slice().sort().join(",")}`;
  };
  function sameInclude(a, b) {
    return setOf(a.includeUsers) === setOf(b.includeUsers) && setOf(a.includeGroups) === setOf(b.includeGroups)
      && setOf(a.includeRoles) === setOf(b.includeRoles) && guestKey(a.includeGuestsOrExternalUsers) === guestKey(b.includeGuestsOrExternalUsers);
  }
  // Is the policy on THIS deploy group only?
  const onlyOn = (inc, dgId) => sameInclude(inc, trialInclude(dgId));
  // The whole users block for a PATCH: the include given, every exclusion as
  // it is. Graph replaces conditions.users as a whole — a block that left
  // out the guest clauses would drop them (see Assign.newUsersBlock).
  function usersWith(raw, inc) {
    const u = usersOf(raw);
    const users = {
      includeUsers: (inc.includeUsers || []).slice(), excludeUsers: (u.excludeUsers || []).slice(),
      includeGroups: (inc.includeGroups || []).slice(), excludeGroups: (u.excludeGroups || []).slice(),
      includeRoles: (inc.includeRoles || []).slice(), excludeRoles: (u.excludeRoles || []).slice(),
    };
    if (inc.includeGuestsOrExternalUsers) users.includeGuestsOrExternalUsers = clone(inc.includeGuestsOrExternalUsers);
    if (u.excludeGuestsOrExternalUsers) users.excludeGuestsOrExternalUsers = clone(u.excludeGuestsOrExternalUsers);
    return users;
  }
  // "2 groups, 132 roles, guests" — what an include holds, for the preview
  function describe(inc, nameOf) {
    const n = (k) => (inc[k] || []).filter((x) => lower(x) !== "none");
    const parts = [];
    const users = n("includeUsers");
    if (users.includes("All") || users.map(lower).includes("all")) parts.push("All users");
    else if (users.length) parts.push(`${users.length} user${users.length === 1 ? "" : "s"}`);
    const g = n("includeGroups");
    if (g.length) parts.push(g.length <= 3 && nameOf ? g.map((x) => nameOf(x) || x).join(", ") : `${g.length} group${g.length === 1 ? "" : "s"}`);
    const r = n("includeRoles");
    if (r.length) parts.push(`${r.length} directory role${r.length === 1 ? "" : "s"}`);
    if (inc.includeGuestsOrExternalUsers) parts.push(`guests & external users (${inc.includeGuestsOrExternalUsers.guestOrExternalUserTypes || "all types"})`);
    return parts.join(" + ") || "nobody";
  }

  // ---- the store (this browser, per tenant) ---------------------------
  const KEY = (t) => `enca-dgtrial:${t || "demo"}`;
  function store(tenantKey, ls) {
    const L = ls || (typeof localStorage !== "undefined" ? localStorage : null);
    const load = () => { try { const o = JSON.parse((L && L.getItem(KEY(tenantKey))) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
    const save = (o) => { try { if (!L) return false; L.setItem(KEY(tenantKey), JSON.stringify(o)); return true; } catch { return false; } };
    return {
      key: KEY(tenantKey),
      all: load,
      get: (id) => load()[id] || null,
      put(id, rec) { const o = load(); o[id] = rec; return save(o); },
      drop(id) { const o = load(); delete o[id]; return save(o); },
    };
  }

  // ---- the catalog fallback for ↩ (no record in this browser) ----------
  // From a catalog row (CloudFellows): "CAB-SEC-U-Persona-Admins (group)",
  // "Global Administrator (role)", "All users". Anything else (a guest
  // clause written out in words, "16 directory roles (…)") cannot be turned
  // back into an include and is returned as unparsed — the fallback then
  // refuses rather than restore half.
  function catalogSpec(entry) {
    const spec = { users: [], groups: [], roles: [], roleIds: [], guests: null, unparsed: [] };
    for (const s of (entry && entry.include) || []) {
      const t = String(s).trim();
      let m;
      if (/^all users$/i.test(t)) spec.users.push("All");
      else if ((m = /^(.*)\s+\(group\)$/i.exec(t))) spec.groups.push(m[1].trim());
      else if ((m = /^(.*)\s+\(role\)$/i.exec(t))) spec.roles.push(m[1].trim());
      else spec.unparsed.push(t);
    }
    return spec;
  }
  // From a raw bundle policy (SMB Basic, Joey+, a live Joey read): role ids
  // are the same in every tenant; group ids are the bundle's own and become
  // names through bundle.groups.
  function bundleSpec(bundle, policyName) {
    const p = ((bundle && bundle.policies) || []).find((x) => lower(clean(x.displayName)) === lower(clean(policyName)))
      || ((bundle && bundle.policies) || []).find((x) => numOf(x.displayName) === numOf(policyName) && catalogOf(x.displayName) === catalogOf(policyName));
    if (!p) return null;
    const u = usersOf(p);
    const nameOfId = (id) => ((bundle.groups || []).find((g) => lower(g.id) === lower(id)) || {}).displayName || null;
    const spec = { users: (u.includeUsers || []).filter((x) => lower(x) !== "none"), groups: [], roles: [], roleIds: (u.includeRoles || []).slice(), guests: u.includeGuestsOrExternalUsers ? clone(u.includeGuestsOrExternalUsers) : null, unparsed: [] };
    for (const g of u.includeGroups || []) { const n = nameOfId(g); if (n) spec.groups.push(n); else spec.unparsed.push(`group ${g}`); }
    return spec;
  }
  // spec → include, names resolved in THIS tenant (resolvers are async).
  async function resolveSpec(spec, r) {
    if (!spec) throw new Error("no catalog include for this policy");
    if (spec.unparsed.length) throw new Error(`the catalog's include cannot be rebuilt by name (${spec.unparsed.slice(0, 2).join("; ")})`);
    const groups = [];
    for (const n of spec.groups) {
      const id = await r.groupIdByName(n);
      if (!id) throw new Error(`group “${n}” is not in this tenant`);
      groups.push(id);
    }
    const roles = spec.roleIds.slice();
    for (const n of spec.roles) {
      const id = await r.roleIdByName(n);
      if (!id) throw new Error(`directory role “${n}” is not known here`);
      roles.push(id);
    }
    return { includeUsers: spec.users.slice(), includeGroups: groups, includeRoles: [...new Set(roles)], includeGuestsOrExternalUsers: spec.guests ? clone(spec.guests) : null };
  }

  // ---- pre-flight (e08) -----------------------------------------------
  // ctx: { raw, dg: { id, name }, testers: [{ id, displayName, userPrincipalName }],
  //        groups: [{ id, name, members: Set|Array of user ids }] — every
  //        group the policy excludes, plus break-glass / shared devices /
  //        internals when the caller found them,
  //        breakGlass, sharedDevices, internals (names), catalog, isExclusionGroup(name) }
  function preflight(ctx) {
    const c = ctx || {};
    const u = usersOf(c.raw);
    const ex = new Set((u.excludeGroups || []).map(lower));
    const exUsers = new Set((u.excludeUsers || []).map(lower));
    const byName = (n) => (c.groups || []).find((g) => lower(g.name) === lower(n)) || null;
    const has = (g, uid) => !!g && (g.members instanceof Set ? g.members.has(uid) : (g.members || []).includes(uid));
    const kindOf = (g) => {
      if (c.breakGlass && lower(g.name) === lower(c.breakGlass)) return "breakglass";
      if (c.sharedDevices && lower(g.name) === lower(c.sharedDevices)) return "sharedDevices";
      if ((c.isExclusionGroup && c.isExclusionGroup(g.name)) || /-Exclusion$| - Exclude$/i.test(g.name || "")) return "exclusion";
      if (/-Persona-/i.test(g.name || "")) return "persona";
      return "excluded";
    };
    const WHY = {
      breakglass: (g) => `in the break-glass group ${g.name}`,
      sharedDevices: (g) => `in ${g.name} (Teams shared devices)`,
      exclusion: (g) => `in this policy's exclusion group ${g.name}`,
      persona: (g) => `in the persona group ${g.name}, which this policy excludes`,
      excluded: (g) => `in ${g.name}, which this policy excludes`,
    };
    const bg = c.breakGlass ? byName(c.breakGlass) : null, tsd = c.sharedDevices ? byName(c.sharedDevices) : null;
    const internals = c.internals ? byName(c.internals) : null;
    const isInt = /-DG-INT$/i.test((c.dg && c.dg.name) || "") && c.catalog !== "smb";
    const rows = [];
    for (const t of c.testers || []) {
      const w = [];
      if (exUsers.has(lower(t.id))) w.push({ kind: "excludedUser", text: "excluded by name in this policy — the trial does not reach this tester" });
      for (const g of c.groups || []) {
        if (!ex.has(lower(g.id)) || !has(g, t.id)) continue;
        const k = kindOf(g);
        w.push({ kind: k, text: `${WHY[k](g)} — the trial does not reach this tester` });
      }
      if (bg && !ex.has(lower(bg.id)) && has(bg, t.id)) w.push({ kind: "breakglass", text: `in the break-glass group ${bg.name} — an emergency account is not a tester` });
      if (tsd && !ex.has(lower(tsd.id)) && has(tsd, t.id)) w.push({ kind: "sharedDevices", text: `in ${tsd.name} — a Teams shared-device account is not a tester` });
      if (isInt && internals && !has(internals, t.id)) w.push({ kind: "notInternals", text: `not in ${internals.name} — after ↩ Back to persona the policy no longer reaches this tester` });
      rows.push({ tester: t, warnings: w });
    }
    const notes = [];
    if (!(c.testers || []).length) notes.push({ level: "warn", text: `${(c.dg && c.dg.name) || "The deployment group"} has no members — the trial would reach nobody. Add the testers first.` });
    if (isInt && c.internals && !internals) notes.push({ level: "info", text: `${c.internals} could not be read — the Internals check was not made.` });
    return { rows, notes, warnings: rows.reduce((n, r) => n + r.warnings.length, 0) + notes.filter((x) => x.level === "warn").length };
  }

  // ---- the writes -----------------------------------------------------
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function settle(G, url, until, waits) {
    let last = null;
    for (const w of waits || [0, 1000, 2000, 4000, 8000]) {
      if (w) await pause(w);
      last = await G.gget(url);
      if (until(last)) return last;
    }
    return last;
  }
  const URL_OF = (id) => `/identity/conditionalAccess/policies/${id}`;

  // opts: { store, dgId, dgName, catalogId, waits, at }
  async function trial(G, policyId, opts) {
    const o = opts || {};
    const url = URL_OF(policyId);
    const fresh = await G.gget(url);
    const r = rule({ name: fresh.displayName, raw: fresh }, { catalogId: o.catalogId });
    if (!r.ok) throw new Error(`${r.reason}${r.guidance ? `. ${r.guidance}` : ""}`);
    if (!o.dgId) throw new Error(`${r.dg} is not in this tenant — nothing was written`);
    const original = includeOf(fresh);
    if (onlyOn(original, o.dgId)) throw new Error(`already on ${o.dgName || r.dg} — nothing was written`);
    const rec = { id: policyId, name: fresh.displayName, dg: o.dgName || r.dg, dgId: o.dgId, label: r.label, at: o.at || new Date().toISOString(), state: fresh.state || null, original };
    const prev = o.store.get(policyId);
    if (!o.store.put(policyId, rec)) throw new Error("the original include could not be saved in this browser (storage refused) — nothing was written, because ↩ Back to persona would have nothing to restore");
    const users = usersWith(fresh, trialInclude(o.dgId));
    try { await G.gpatch(url, { conditions: { users } }); }
    catch (e) { if (prev) o.store.put(policyId, prev); else o.store.drop(policyId); throw e; }
    const back = await settle(G, url, (x) => onlyOn(includeOf(x), o.dgId), o.waits);
    if (!onlyOn(includeOf(back), o.dgId)) throw new Error(`written, but the include does not read back as ${rec.dg} — ⟳ read the tenant and check the policy; the original include is kept for ↩ Back to persona`);
    return { ok: true, id: policyId, name: fresh.displayName, record: rec };
  }

  // opts: { store, original (catalog fallback, when no record), source, force, waits }
  async function back(G, policyId, opts) {
    const o = opts || {};
    const url = URL_OF(policyId);
    const fresh = await G.gget(url);
    const rec = o.store.get(policyId);
    const original = (rec && rec.original) || o.original || null;
    if (!original) throw new Error("no saved include for this policy in this browser, and none from the catalog — restore it by hand from the trial report or a backup; nothing was written");
    const now = includeOf(fresh);
    if (rec && rec.dgId && !onlyOn(now, rec.dgId) && !o.force) throw new Error(`the include changed since the trial (it is no longer ${rec.dg} alone) — nothing was written; tick “restore anyway” to put the saved include back over it`);
    if (sameInclude(now, original)) { o.store.drop(policyId); return { ok: true, id: policyId, name: fresh.displayName, unchanged: true, source: rec ? "record" : o.source || "catalog" }; }
    await G.gpatch(url, { conditions: { users: usersWith(fresh, original) } });
    const after = await settle(G, url, (x) => sameInclude(includeOf(x), original), o.waits);
    if (!sameInclude(includeOf(after), original)) throw new Error("written, but the include does not read back as the saved one — ⟳ read the tenant and compare; the record is kept");
    o.store.drop(policyId);
    return { ok: true, id: policyId, name: fresh.displayName, source: rec ? "record" : o.source || "catalog", restored: original };
  }

  // Members of a group, transitive, users only.
  async function members(G, id) {
    const r = await G.ggetAll(`/groups/${id}/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName&$top=999`);
    return (r || []).map((x) => ({ id: x.id, displayName: x.displayName || "", userPrincipalName: x.userPrincipalName || "" }));
  }
  async function groupByName(G, name) {
    if (!name) return null;
    const hit = await G.ggetAll(`/groups?$filter=displayName eq '${String(name).replace(/'/g, "''")}'&$select=id,displayName`);
    return (hit && hit[0]) || null;
  }
  // Reads what preflight() needs. opts: { dg: { id, name }, breakGlass,
  // sharedDevices, internals, nameOf(id) → name|null, catalog, isExclusionGroup }
  async function readPreflight(G, raw, opts) {
    const o = opts || {};
    const testers = o.dg && o.dg.id ? await members(G, o.dg.id) : [];
    const groups = [];
    for (const id of usersOf(raw).excludeGroups || []) {
      let name = o.nameOf ? o.nameOf(id) : null;
      if (!name) { try { const g = await G.gget(`/groups/${id}?$select=displayName`); name = (g && g.displayName) || id; } catch { name = id; } }
      let m = [];
      try { m = await members(G, id); } catch { m = []; }
      groups.push({ id, name, members: new Set(m.map((x) => x.id)) });
    }
    for (const n of [o.breakGlass, o.sharedDevices, o.internals]) {
      if (!n || groups.some((g) => lower(g.name) === lower(n))) continue;
      try {
        const g = await groupByName(G, n);
        if (g) groups.push({ id: g.id, name: g.displayName || n, members: new Set((await members(G, g.id)).map((x) => x.id)) });
      } catch { /* the check says it could not read it */ }
    }
    return preflight({ raw, dg: o.dg, testers, groups, breakGlass: o.breakGlass, sharedDevices: o.sharedDevices, internals: o.internals, catalog: o.catalog, isExclusionGroup: o.isExclusionGroup });
  }

  // ---- the report: the include as JSON travels with it ----------------
  function report(meta, rows) {
    const L = [`# 🚀 Deployment-group trial — ${meta.tenant || "tenant"}`, "", `_${meta.at || new Date().toISOString()}_`, ""];
    for (const r of rows || []) {
      L.push(`## ${r.name}`, "");
      L.push(`- **Action:** ${r.action === "back" ? "↩ Back to persona" : `🚀 Trial on ${r.dg || "the deployment group"}${r.label ? ` (${r.label})` : ""}`}`);
      L.push(`- **Result:** ${r.ok ? "done, read back" : `not done — ${r.error || "?"}`}`);
      if (r.source) L.push(`- **Restored from:** ${r.source === "record" ? "the include saved in this browser at the trial" : "the catalog (no record in this browser)"}`);
      if (r.original) L.push("- **Original include (restore this to undo):**", "", "```json", JSON.stringify(r.original, null, 2), "```");
      L.push("");
    }
    L.push("Undo a trial: ↩ Back to persona on the policy card (Policies), or put the JSON above back as the policy's include (users / groups / directory roles / guests) by hand.");
    return L.join("\n");
  }

  return { RO, CF_ALL_USERS, CF_RULE, SMB_SD_RULE, DG_FALLBACK, catalogOf, dgLabel, rule, includeOf, trialInclude, sameInclude, onlyOn, usersWith, describe,
    KEY, store, catalogSpec, bundleSpec, resolveSpec, preflight, trial, back, members, groupByName, readPreflight, report };
})();
