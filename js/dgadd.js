// ======================================================================
// 🚀 Add to deploy groups (beta 33207) — T12, CA groups toolbar.
//
// Mihai, 9 Nov: "I need to bulk add users/groups to GLO+INT and GLO+EXT, so
// if we can make that simpler, nice." The trial step of the rollout model
// (import on the persona in Report-only → trial per policy on
// CAD-SEC-U-DG-<persona>) needs the same testers in two deploy groups at
// once. The drawer adds to ONE group; 🌍 Fill from regions sorts a whole
// tenant by rules. This is the middle: paste a list, pick a set, add.
//
//   Sets:     GLO + INT (internal testers) · GLO + EXT (external testers)
//             · or any deploy groups ticked by hand
//   Entries:  a UPN or e-mail → that user · an object id → that user or group
//             · a name → the one group (or user) with exactly that name
//   A group:  Nest it (the deploy group follows it from then on) or Add its
//             users (a snapshot of its users, direct and nested, now)
//
// ADD ONLY. Nothing is ever taken out of a deploy group here — 🌍 Fill from
// regions and the drawer's × do that. Undo takes out exactly what one run put
// in (and switches nesting back off where the run switched it on).
//
// Nesting into a deploy group can be refused twice over: Entra never puts a
// group inside a ROLE-ASSIGNABLE group, and a group with disableNesting set
// refuses group members. The first is a blocker (⑦ Migrate makes it a plain
// group, or Add its users instead); the second can be lifted on that ONE
// deploy group, but only when the person ticks "Allow nesting" (opt-in).
//
// Pure planning — no Graph, no DOM. app.js resolves the entries and the
// targets, calls plan(), shows it, writes it. tools/dgadd.test.cjs drives it.
// ======================================================================
const DgAdd = (() => {
  // Keys follow DgFill.TARGETS (the names are per-tenant settings there).
  const PRESETS = [
    { key: "GLO+INT", label: "GLO + INT", keys: ["GLO", "INT"], note: "internal testers" },
    { key: "GLO+EXT", label: "GLO + EXT", keys: ["GLO", "EXT"], note: "external testers" },
    { key: "custom",  label: "Choose…",   keys: [],             note: "tick the deploy groups yourself" },
  ];
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ; , tab and new line separate; an Outlook To line gives its addresses;
  // the same entry twice (any case) is kept once.
  function parse(text) {
    let s = String(text || "");
    const out = [], seen = new Set();
    const keep = (t) => {
      t = String(t || "").trim().replace(/^["']+|["']+$/g, "").trim();
      if (!t || seen.has(t.toLowerCase())) return;
      seen.add(t.toLowerCase()); out.push(t);
    };
    if (/<[^<>\s]+@[^<>\s]+>/.test(s)) s = s.replace(/[^;<>\r\n]*<([^<>\s]+@[^<>\s]+)>/g, (m, a) => `;${a};`);
    s.split(/[;,\t\r\n]+/).forEach(keep);
    return out;
  }
  // how app.js should look an entry up
  const kindOf = (q) => GUID.test(q) ? "id" : q.includes("@") ? "upn" : "name";

  // A group Graph returned → the facts nesting cares about.
  function groupFacts(g) {
    const types = g.groupTypes || [];
    return {
      id: g.id, kind: "group", name: g.displayName || g.id,
      unified: types.includes("Unified"), security: g.securityEnabled !== false,
      dynamic: types.includes("DynamicMembership") || !!g.membershipRule,
      roleAssignable: !!g.isAssignableToRole,
    };
  }
  function userFacts(u) {
    return { id: u.id, kind: "user", name: u.displayName || u.userPrincipalName || u.id, upn: u.userPrincipalName || "", disabled: u.accountEnabled === false, guest: u.userType === "Guest" };
  }

  // Can this group be NESTED into this target? → null (yes) | reason
  // unlock: true when the only obstacle is disableNesting and the person
  // opted in to lifting it.
  function nestBlock(g, t, allowNesting) {
    if (t.dynamic) return { reason: "dynamic — the rule decides who is in it" };
    if (g.id === t.id) return { reason: "a group cannot be nested into itself" };
    if (g.unified) return { reason: "a Microsoft 365 group cannot be nested into a security group — use Add its users" };
    if (!g.security) return { reason: "not a security group (a distribution list)" };
    if (t.roleAssignable) return { reason: "role-assignable — Entra never allows a group inside one; use Add its users, or ⑦ Migrate it to a plain group" };
    if (t.nesting === "disabled") return allowNesting ? { unlock: true } : { reason: "nesting is disabled on this group — tick Allow nesting, or use Add its users" };
    return null;
  }

  // entries: [{ q, obj: userFacts|groupFacts|null, err?, users?: [userFacts] (expand) }]
  // targets: [{ key, name, id|null, dynamic, roleAssignable, nesting, members: Set<id> | null }]
  // opts:    { groupMode: "nest"|"expand", allowNesting, skipDisabled }
  // → { rows[], writes[], unlock[], counts }
  //   rows:   one per entry — { q, obj, err, cells: { KEY: { state, n?, reason? } } }
  //           state: add | same | blocked | skip | missing ; n = users for expand
  //   writes: [{ targetId, targetKey, targetName, memberId, memberName, kind }] — de-duplicated
  //   unlock: [{ id, key, name }] — deploy groups whose disableNesting is lifted first
  function plan(entries, targets, opts = {}) {
    const mode = opts.groupMode === "expand" ? "expand" : "nest";
    const writes = [], unlock = new Map(), done = new Set();
    const add = (t, m) => {
      const k = `${t.id}|${m.id}`;
      if (done.has(k)) return false;
      done.add(k);
      writes.push({ targetId: t.id, targetKey: t.key, targetName: t.name, memberId: m.id, memberName: m.name, kind: m.kind });
      return true;
    };
    const rows = (entries || []).map((e) => {
      const cells = {};
      for (const t of targets) {
        if (!e.obj) { cells[t.key] = { state: "skip" }; continue; }
        if (!t.id) { cells[t.key] = { state: "missing", reason: "not in this tenant" }; continue; }
        const o = e.obj;
        if (o.kind === "user") {
          if (t.dynamic) cells[t.key] = { state: "blocked", reason: "dynamic — the rule decides who is in it" };
          else if (o.disabled && opts.skipDisabled) cells[t.key] = { state: "skip", reason: "account disabled" };
          else if (t.members && t.members.has(o.id)) cells[t.key] = { state: "same" };
          else cells[t.key] = add(t, o) ? { state: "add" } : { state: "same", reason: "listed twice" };
          continue;
        }
        // a group
        if (mode === "nest") {
          const b = nestBlock(o, t, opts.allowNesting);
          if (b && b.reason) { cells[t.key] = { state: "blocked", reason: b.reason }; continue; }
          if (t.members && t.members.has(o.id)) { cells[t.key] = { state: "same" }; continue; }
          if (b && b.unlock) unlock.set(t.id, { id: t.id, key: t.key, name: t.name });
          cells[t.key] = add(t, o) ? { state: "add", unlock: !!(b && b.unlock) } : { state: "same", reason: "listed twice" };
          continue;
        }
        // expand: the group's users, each like a user entry
        if (t.dynamic) { cells[t.key] = { state: "blocked", reason: "dynamic — the rule decides who is in it" }; continue; }
        let n = 0, same = 0, skip = 0;
        for (const u of e.users || []) {
          if (u.disabled && opts.skipDisabled) { skip++; continue; }
          if (t.members && t.members.has(u.id)) { same++; continue; }
          if (add(t, u)) n++; else same++;
        }
        cells[t.key] = n ? { state: "add", n, same, skip } : { state: (e.users || []).length ? "same" : "skip", n: 0, same, skip, reason: (e.users || []).length ? "" : "no users in it" };
      }
      return { q: e.q, obj: e.obj, err: e.err || "", users: e.users ? e.users.length : null, cells };
    });
    const counts = {
      entries: rows.length, found: rows.filter((r) => r.obj).length, notFound: rows.filter((r) => !r.obj).length,
      writes: writes.length, unlock: unlock.size,
      blocked: rows.reduce((n, r) => n + Object.values(r.cells).filter((c) => c.state === "blocked").length, 0),
      perTarget: Object.fromEntries(targets.map((t) => [t.key, writes.filter((w) => w.targetKey === t.key).length])),
    };
    return { rows, writes, unlock: [...unlock.values()], counts, mode };
  }

  // The undo of a run: every add that succeeded, and every nesting that was
  // switched on, in reverse — members out first, then disableNesting back on.
  function undoPlan(run) {
    return {
      remove: (run.done || []).map((w) => ({ ...w })),
      relock: (run.unlocked || []).map((u) => ({ ...u })),
    };
  }

  // Markdown record of a run (Export / the ledger copy)
  function report(run, tenant) {
    const L = [`# Add to deploy groups — ${tenant || "tenant"} — ${run.at || ""}`, "",
      `Set: ${run.set} · groups: ${run.mode === "expand" ? "add their users" : "nest"}${run.allowNesting ? " · nesting allowed where it was off" : ""}`, ""];
    if ((run.unlocked || []).length) L.push(`Nesting switched on: ${run.unlocked.map((u) => u.name).join(", ")}`, "");
    L.push("| Deploy group | Member | Kind | Result |", "|---|---|---|---|");
    (run.done || []).forEach((w) => L.push(`| ${w.targetName} | ${w.memberName} | ${w.kind} | added |`));
    (run.failed || []).forEach((w) => L.push(`| ${w.targetName} | ${w.memberName} | ${w.kind} | failed: ${String(w.error || "").replace(/\|/g, "/")} |`));
    return L.join("\n") + "\n";
  }

  return { PRESETS, GUID, parse, kindOf, groupFacts, userFacts, nestBlock, plan, undoPlan, report };
})();
if (typeof module !== "undefined") module.exports = DgAdd;
