// ======================================================================
// 🔀 Merge duplicate groups (beta 25477) — T12 CA groups.
//
// Two groups with one display name look like one group everywhere a name is
// shown, so a policy set can include one and exclude the other without anybody
// seeing it (the CloudFellows baseline had two CAB-SEC-U-Persona-Externals).
// This module plans and runs the fix: keep ONE group, move the other's members
// into it, point every Conditional Access policy at it, then take the other
// group out of the way.
//
// Pure planning, injected I/O — nothing here touches Graph directly, so the
// whole flow is tested with fakes (tools/group-merge.test.cjs).
//
// THE ORDER IS THE SAFETY PROPERTY:
//   1. members first, into the kept group — so the moment a policy points at
//      it, it already holds everyone the other one held;
//   2. then each policy, one PATCH of the WHOLE conditions.users block built
//      from a FRESH read (never from the snapshot the plan was made from), and
//      read back until the new ids are there;
//   3. only when every policy landed, the other group is renamed aside (the
//      default — restorable by renaming it back) or deleted (typed, and only
//      if asked for). A run that stops half-way never removes a group a
//      policy may still name.
// ======================================================================
const GroupMerge = (() => {
  const norm = (n) => String(n || "").trim().toLowerCase();
  const isoDay = () => new Date().toISOString().slice(0, 10);
  const MERGED_TAG = "merged";
  const mergedName = (name) => `${name} (${MERGED_TAG} ${isoDay()})`;

  // rows: CaGroups scan rows. A set is one normalised name carried by two or
  // more distinct groups that exist in the tenant.
  function duplicateSets(rows) {
    const by = new Map();
    for (const r of rows || []) {
      if (!r || !r.id || r.status === "dangling" || r.status === "missing") continue;
      const k = norm(r.name);
      if (!k) continue;
      if (!by.has(k)) by.set(k, new Map());
      by.get(k).set(r.id, r);
    }
    const sets = [];
    for (const [key, m] of by) {
      if (m.size < 2) continue;
      const members = [...m.values()].map((r) => ({
        id: r.id, name: r.name, dynamic: !!r.dynamic, membershipRule: r.membershipRule || "",
        roleAssignable: !!r.roleAssignable, refs: r.refs || { include: [], exclude: [] },
        refCount: r.refCount || 0, memberTotal: r.memberTotal ?? null,
      }));
      // suggested keep: the one more policies point at, then the one that
      // holds members, then an assigned group over a dynamic one (members can
      // be ADDED to an assigned group; a dynamic group's rule decides alone)
      members.sort((a, b) => b.refCount - a.refCount
        || (b.memberTotal || 0) - (a.memberTotal || 0)
        || (a.dynamic === b.dynamic ? 0 : a.dynamic ? 1 : -1));
      sets.push({ key, name: members[0].name, members, keepId: members[0].id });
    }
    return sets.sort((a, b) => a.name.localeCompare(b.name));
  }

  // The users block of a policy with every drop id replaced by the keep id,
  // include and exclude alike, de-duplicated. null when nothing changes.
  function usersWithSwap(users, dropIds, keepId) {
    const u = JSON.parse(JSON.stringify(users || {}));
    const drop = new Set(dropIds);
    let changed = false;
    for (const k of ["includeGroups", "excludeGroups"]) {
      const list = u[k] || [];
      if (!list.some((id) => drop.has(id))) continue;
      const out = [];
      for (const id of list) {
        const v = drop.has(id) ? keepId : id;
        if (!out.includes(v)) out.push(v);
      }
      u[k] = out; changed = true;
    }
    for (const k of Object.keys(u)) if (k.startsWith("@odata")) delete u[k];
    return changed ? u : null;
  }

  // set: from duplicateSets. keepId: the group to keep. raws: raw CA policies.
  // members: Map groupId -> { ok, error, list:[{ id, type, name }] } (direct
  // members). opts.remove: "rename" (default) | "delete".
  function plan(set, keepId, raws, members, opts = {}) {
    const keep = set.members.find((m) => m.id === keepId) || set.members[0];
    const drops = set.members.filter((m) => m.id !== keep.id);
    const dropIds = drops.map((d) => d.id);
    const remove = opts.remove === "delete" ? "delete" : "rename";
    const refusals = [];

    // 1. members
    const km = members && members.get(keep.id);
    const have = new Set(((km && km.list) || []).map((x) => x.id));
    const moves = [];
    for (const d of drops) {
      const dm = members && members.get(d.id);
      if (!dm || !dm.ok) { refusals.push({ why: `The members of ${d.id} could not be read${dm && dm.error ? ` (${dm.error})` : ""} — nothing can be moved safely without them.` }); continue; }
      for (const x of dm.list || []) if (!have.has(x.id) && !moves.some((m) => m.id === x.id)) moves.push({ ...x, from: d.id });
    }
    if (!km || !km.ok) refusals.push({ why: `The members of the group to keep (${keep.id}) could not be read.` });
    if (keep.dynamic && moves.length) {
      refusals.push({ why: `The group to keep is DYNAMIC — its rule decides who is in it, and nobody can be added by hand. ${moves.length} member${moves.length === 1 ? " of the other group is" : "s of the other group are"} not in it. Keep the other group instead, or widen the rule until they are in, then plan again.` });
    }
    const fromDynamic = drops.filter((d) => d.dynamic);

    // 2. policies
    const edits = [];
    for (const p of raws || []) {
      const users = p.conditions?.users;
      const next = usersWithSwap(users, dropIds, keep.id);
      if (!next) continue;
      const both = (next.includeGroups || []).filter((id) => (next.excludeGroups || []).includes(id));
      const e = { id: p.id, name: p.displayName || "(unnamed policy)", state: p.state,
        include: (users.includeGroups || []).some((id) => dropIds.includes(id)),
        exclude: (users.excludeGroups || []).some((id) => dropIds.includes(id)) };
      if (both.length) {
        refusals.push({ why: `"${e.name}" includes one of these groups and excludes the other. After the merge it would include and exclude the same group, and the exclusion wins — the policy would apply to nobody in it. Decide which side that policy means first.` });
        e.conflict = true;
      }
      edits.push(e);
    }

    return {
      key: set.key, name: set.name, keep, drops, dropIds, moves, edits, remove,
      fromDynamic, refusals, canRun: !refusals.length,
      archiveNames: drops.map((d) => ({ id: d.id, to: mergedName(d.name) })),
    };
  }

  // deps: { addMember(groupId, objectId), getPolicy(id), patchPolicy(id, body),
  //   readSettled(id, until), renameGroup(id, name), deleteGroup(id),
  //   shouldStop(), onStep(key, phase, info) }
  // phase: "start" | "done" | "fail" | "skip". Returns a result per step.
  async function run(p, deps) {
    const out = { key: p.key, name: p.name, keepId: p.keep.id, steps: [], ok: false, removed: false, stopped: false };
    const step = (key, phase, info) => { out.steps.push({ key, phase, ...(info || {}) }); deps.onStep && deps.onStep(key, phase, info || {}); };
    const stopped = () => deps.shouldStop && deps.shouldStop();

    // 1. members
    let memberFail = 0;
    for (const m of p.moves) {
      if (stopped()) { out.stopped = true; return out; }
      step(`member:${m.id}`, "start", { label: m.name || m.id });
      try { await deps.addMember(p.keep.id, m.id); step(`member:${m.id}`, "done", { label: m.name || m.id }); }
      catch (e) {
        // already a member is success, not a failure
        if (/already exist|One or more added object references already exist/i.test(e.message || "")) step(`member:${m.id}`, "done", { label: m.name || m.id, note: "already a member" });
        else { memberFail++; step(`member:${m.id}`, "fail", { label: m.name || m.id, error: e.message || String(e) }); }
      }
    }
    if (memberFail) { out.error = `${memberFail} member${memberFail === 1 ? "" : "s"} could not be added — no policy was changed and no group was removed.`; return out; }

    // 2. policies, each from a fresh read
    let policyFail = 0;
    for (const e of p.edits) {
      if (stopped()) { out.stopped = true; out.error = "stopped — the other group was NOT removed"; return out; }
      step(`policy:${e.id}`, "start", { label: e.name });
      try {
        const fresh = await deps.getPolicy(e.id);
        const users = usersWithSwap(fresh.conditions?.users, p.dropIds, p.keep.id);
        if (!users) { step(`policy:${e.id}`, "done", { label: e.name, note: "already points at the kept group" }); continue; }
        await deps.patchPolicy(e.id, { conditions: { users } });
        const back = await deps.readSettled(e.id, (x) => {
          const u = x.conditions?.users || {};
          const all = [...(u.includeGroups || []), ...(u.excludeGroups || [])];
          return !all.some((id) => p.dropIds.includes(id)) && all.includes(p.keep.id);
        });
        const u = back.conditions?.users || {};
        const all = [...(u.includeGroups || []), ...(u.excludeGroups || [])];
        if (all.some((id) => p.dropIds.includes(id))) throw new Error("the read-back still names the other group");
        step(`policy:${e.id}`, "done", { label: e.name });
      } catch (err) { policyFail++; step(`policy:${e.id}`, "fail", { label: e.name, error: err.message || String(err) }); }
    }
    if (policyFail) { out.error = `${policyFail} polic${policyFail === 1 ? "y was" : "ies were"} not changed — the other group was NOT removed, because a policy may still name it.`; return out; }

    // 3. the other group(s), only now
    for (const d of p.drops) {
      if (stopped()) { out.stopped = true; out.error = "stopped before the other group was removed"; return out; }
      const to = (p.archiveNames.find((a) => a.id === d.id) || {}).to;
      step(`remove:${d.id}`, "start", { label: d.name });
      try {
        if (p.remove === "delete") await deps.deleteGroup(d.id);
        else await deps.renameGroup(d.id, to);
        step(`remove:${d.id}`, "done", { label: p.remove === "delete" ? `deleted ${d.id}` : `renamed to ${to}` });
      } catch (err) {
        step(`remove:${d.id}`, "fail", { label: d.name, error: err.message || String(err) });
        out.error = `members and policies are merged, but ${d.id} could not be ${p.remove === "delete" ? "deleted" : "renamed"} (${err.message || err}) — do that by hand; nothing points at it any more.`;
        return out;
      }
    }
    out.ok = true; out.removed = true;
    return out;
  }

  function report(meta, plans, results) {
    const L = [`# Merge duplicate groups — ${meta.tenant || "tenant"}`, "", `_${new Date().toISOString()}_`, ""];
    for (const p of plans) {
      const r = (results || []).find((x) => x.key === p.key) || {};
      L.push(`## ${p.name}`, "");
      L.push(`- **Kept:** \`${p.keep.id}\`${p.keep.dynamic ? " (dynamic)" : ""}`);
      for (const d of p.drops) L.push(`- **${p.remove === "delete" ? "Deleted" : "Renamed aside"}:** \`${d.id}\`${p.remove === "delete" ? "" : ` → ${(p.archiveNames.find((a) => a.id === d.id) || {}).to}`}`);
      L.push(`- **Members moved:** ${p.moves.length}`);
      L.push(`- **Policies repointed:** ${p.edits.length}${p.edits.length ? ` — ${p.edits.map((e) => `${e.name} (${[e.include ? "include" : "", e.exclude ? "exclude" : ""].filter(Boolean).join(" + ")})`).join("; ")}` : ""}`);
      L.push(`- **Result:** ${r.ok ? "done" : r.stopped ? "stopped" : r.error || "not run"}`);
      const fails = (r.steps || []).filter((s) => s.phase === "fail");
      if (fails.length) { L.push("", "Failed steps:"); for (const f of fails) L.push(`- ${f.label}: ${f.error}`); }
      L.push("");
    }
    L.push("Undo: a renamed group is restored by renaming it back and pointing the policies at it again (the JSON backup downloaded before the run holds every policy's users block as it was). Members added to the kept group stay until removed.");
    return L.join("\n");
  }

  return { MERGED_TAG, mergedName, duplicateSets, usersWithSwap, plan, run, report };
})();
if (typeof module !== "undefined") module.exports = GroupMerge;
