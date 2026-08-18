// ======================================================================
// Licence gap — targeted users versus P1/P2 entitlements.
//
// Microsoft now shows a "Licensing overage" warning on the Conditional
// Access page, and links it to the licence usage blade. That blade counts
// EVALUATED users — who actually triggered a policy last month. But the
// licensing obligation is on TARGETED users: every user a CA policy is
// scoped to needs Entra ID P1, whether they signed in or not, and every
// user targeted by a risk-based policy needs P2. Two very different
// numbers: a tenant whose blade shows "2 of 25, fine" can be targeting
// 114 users with 25 licences. This tool computes the targeted number —
// the one the obligation is based on — compares it with what the tenant
// actually owns, and NAMES the users sitting in the gap, because "2 users
// short" is not actionable until you know which two.
// (After Rudy Mens' Get-EntraLicenseGap.ps1, lazyadmin.nl.)
//
// This module is pure analysis over a ctx the wiring fills from Graph
// (or demo data):
//   ctx = {
//     policies:        [conditionalAccessPolicy raws]   (all states; disabled are filtered here),
//     skus:            [subscribedSku raws] | null      (null = not read),
//     totalMembers:    n | null    (member users in the tenant; guests are a separate conversation),
//     disabledMembers: n | null    (member users with accountEnabled false — the cleanup potential),
//     users:    [{ id, name, upn, enabled, p1, p2 }] | null
//               member users with whether the P1 / P2 service plan is
//               assigned to them (Enabled or Warning) — what lets the gap
//               be NAMED instead of only counted. null = not read,
//     usersCapped: bool   (the user read hit its page cap — the list is a
//               prefix of the tenant, so named lists are partial and every
//               number derived from them is approximate),
//     members:  { groupId → { users:[ids], capped:bool } }   transitive USER members;
//               an unreadable group stays ABSENT — an empty entry would read as
//               "fetched, zero members" and turn a read failure into a wrong count,
//     roleMembers: { roleTemplateId → [userIds] | null }     null = unreadable,
//     names:    { id → displayName },
//   }
// Counts are honest about their own precision: wherever a group hit the
// read cap, a role could not be read, an exclusion group was unreadable or
// the user list was capped, the number is marked approximate rather than
// presented as exact.
// Nothing here talks to Graph and nothing writes — matching the house
// pattern (devcheck.js, rmau.js): logic testable on its own, wiring thin.
// ======================================================================
const LicGap = (() => {
  // Service plan IDs — P1 and P2 ride inside many SKUs (EMS, M365 E3/E5,
  // Business Premium…), so SKUs are matched on the service plans they
  // carry, never on a hard-coded list of part numbers.
  const P1_PLAN = "41781fb2-bc02-4b7c-bd55-b576c07bb09d"; // AAD_PREMIUM
  const P2_PLAN = "eec0eb4f-6444-4f95-aba0-50c24d67f998"; // AAD_PREMIUM_P2
  // A suspended or cancelled subscription still appears in /subscribedSkus;
  // counting its seats would overstate what the tenant owns today.
  const DEAD = new Set(["Suspended", "Deleted", "LockedOut"]);

  function licenseTotals(skus) {
    if (!skus) return { known: false, p1: { seats: 0, assigned: 0, rows: [] }, p2: { seats: 0, assigned: 0, rows: [] }, skipped: [] };
    const p1 = { seats: 0, assigned: 0, rows: [] }, p2 = { seats: 0, assigned: 0, rows: [] }, skipped = [];
    for (const s of skus) {
      const plans = s.servicePlans || [];
      const hasP1 = plans.some((p) => p.servicePlanId === P1_PLAN);
      const hasP2 = plans.some((p) => p.servicePlanId === P2_PLAN);
      if (!hasP1 && !hasP2) continue;
      if (DEAD.has(s.capabilityStatus)) { skipped.push(s.skuPartNumber || s.skuId); continue; }
      const seats = ((s.prepaidUnits || {}).enabled || 0);
      const assigned = s.consumedUnits || 0;
      const row = { part: s.skuPartNumber || s.skuId, seats, assigned };
      if (hasP2) {
        p2.seats += seats; p2.assigned += assigned; p2.rows.push(row);
        p1.seats += seats; p1.assigned += assigned; p1.rows.push({ ...row, viaP2: true });
      } else { p1.seats += seats; p1.assigned += assigned; p1.rows.push(row); }
    }
    return { known: true, p1, p2, skipped };
  }

  // What a policy scopes, as Graph spells it. GuestsOrExternalUsers in the
  // legacy excludeUsers list is a marker, not a user id.
  function scopeOf(raw) {
    const u = (raw.conditions || {}).users || {};
    return {
      all: (u.includeUsers || []).includes("All"),
      none: (u.includeUsers || []).includes("None") && (u.includeUsers || []).length === 1
        && !(u.includeGroups || []).length && !(u.includeRoles || []).length && !u.includeGuestsOrExternalUsers,
      incUsers: (u.includeUsers || []).filter((x) => x !== "All" && x !== "None" && x !== "GuestsOrExternalUsers"),
      incGroups: u.includeGroups || [],
      incRoles: u.includeRoles || [],
      incGuests: !!u.includeGuestsOrExternalUsers || (u.includeUsers || []).includes("GuestsOrExternalUsers"),
      excUsers: (u.excludeUsers || []).filter((x) => x !== "GuestsOrExternalUsers"),
      excGroups: u.excludeGroups || [],
      excRoles: u.excludeRoles || [],
      excGuests: !!u.excludeGuestsOrExternalUsers || (u.excludeUsers || []).includes("GuestsOrExternalUsers"),
    };
  }

  // Which risk conditions make a policy a P2 policy. Sign-in and user risk
  // are the documented P2 requirement; the insider-risk condition also
  // rides on P2 (plus Purview IRM) and is named separately so nobody has
  // to guess where a P2 verdict came from.
  function riskKindsOf(raw) {
    const c = raw.conditions || {};
    const k = [];
    if ((c.signInRiskLevels || []).length) k.push("sign-in risk");
    if ((c.userRiskLevels || []).length) k.push("user risk");
    if (c.insiderRiskLevels) k.push("insider risk");
    return k;
  }

  // Resolve one side of a scope (includes or excludes) to a user-id set.
  // `approx` goes true whenever something could not be resolved exactly:
  // a group absent from ctx.members (unreadable or over the group cap),
  // a group whose member read was capped, or a role that was unreadable.
  function usersOf(users, groups, roles, ctx) {
    const set = new Set(users);
    let approx = false;
    for (const g of groups) {
      const rec = (ctx.members || {})[g];
      if (!rec) { approx = true; continue; }
      if (rec.capped) approx = true;
      for (const u of rec.users) set.add(u);
    }
    for (const r of roles) {
      const m = (ctx.roleMembers || {})[r];
      if (m === null || m === undefined) { approx = true; continue; }
      for (const u of m) set.add(u);
    }
    return { set, approx };
  }

  // One policy's targeting, sized. For an All-users policy the count is
  // tenant members minus the resolvable exclusions; for a scoped policy it
  // is the union of the includes minus the exclusions. Guest targeting is
  // flagged, never counted — guest licensing (MAU / External ID) is a
  // separate conversation with different rules.
  function sizeOf(raw, ctx) {
    const s = scopeOf(raw);
    const exc = usersOf(s.excUsers, s.excGroups, s.excRoles, ctx);
    if (s.none) return { scope: s, size: 0, approx: false, excluded: exc.set, included: new Set() };
    if (s.all) {
      const t = ctx.totalMembers;
      // An unreadable exclusion group means the real exclusion list is
      // longer than what was resolved — the count can only be high, and
      // approx says so.
      return { scope: s, size: t == null ? null : Math.max(0, t - exc.set.size),
        approx: exc.approx || t == null, excluded: exc.set, included: null };
    }
    const inc = usersOf(s.incUsers, s.incGroups, s.incRoles, ctx);
    const eff = new Set([...inc.set].filter((u) => !exc.set.has(u)));
    return { scope: s, size: eff.size, approx: inc.approx || exc.approx, excluded: exc.set, included: eff };
  }

  // The union across policies — the licensing obligation. One user under
  // five policies needs ONE licence, so per-policy counts must never be
  // summed; the union is computed on user ids where scopes are enumerable.
  // With one or more All-users policies the only users OUTSIDE the union
  // are those excluded from every All policy AND not reached by any scoped
  // policy. When the wiring has read the user list, the union becomes an
  // actual id set — which is what lets the gap be NAMED; with a capped
  // list the ids are a partial prefix and every derived number says ≈.
  function unionInfo(sized, ctx) {
    const live = sized.filter((x) => !x.scope.none);
    if (!live.length) return { size: 0, approx: false, ids: new Set() };
    const users = ctx.users || null;
    const complete = users && !ctx.usersCapped;
    let approx = live.some((x) => x.approx);
    const alls = live.filter((x) => x.scope.all);
    const scopedUnion = new Set();
    for (const x of live) if (!x.scope.all && x.included) for (const u of x.included) scopedUnion.add(u);
    if (!alls.length) return { size: scopedUnion.size, approx, ids: scopedUnion };
    let inter = null;
    for (const x of alls) {
      inter = inter === null ? new Set(x.excluded) : new Set([...inter].filter((u) => x.excluded.has(u)));
      if (!inter.size) break;
    }
    const outside = new Set([...(inter || new Set())].filter((u) => !scopedUnion.has(u)));
    if (users) {
      const ids = new Set(users.filter((u) => !outside.has(u.id)).map((u) => u.id));
      for (const u of scopedUnion) ids.add(u);
      if (complete) return { size: ids.size, approx, ids };
      // Capped list: the ids are a partial prefix, so the SIZE falls back
      // to the count arithmetic (exact per /users?$count) while the named
      // list stays available as "the part that was read".
      const size = ctx.totalMembers != null ? Math.max(0, ctx.totalMembers - outside.size) : null;
      return { size, approx: true, ids, partial: true };
    }
    const size = ctx.totalMembers != null ? Math.max(0, ctx.totalMembers - outside.size) : null;
    return { size, approx: size == null ? true : approx, ids: null };
  }

  // ---- the whole tenant ------------------------------------------------
  function analyze(ctx) {
    const nm = (id) => (ctx.names || {})[id] || id;
    const active = (ctx.policies || []).filter((p) => p.state !== "disabled");
    const lic = licenseTotals(ctx.skus);

    // The user map is needed twice: for the per-policy gap column here and
    // for the named union gap further down.
    const byId = ctx.users ? new Map(ctx.users.map((u) => [u.id, u])) : null;

    const perPolicy = [];
    for (const raw of active) {
      const sz = sizeOf(raw, ctx);
      const riskKinds = riskKindsOf(raw);
      const s = sz.scope;
      // This policy's own gap: how many of ITS targeted users lack the
      // licence IT needs (P2 for a risk policy, P1 otherwise). Null when
      // the user list was not read — a per-policy gap that cannot be
      // computed must not render as zero.
      let gap = null, gapApprox = false;
      if (byId) {
        const key = riskKinds.length ? "p2" : "p1";
        let targets;
        if (s.none) targets = [];
        else if (s.all) { targets = (ctx.users || []).filter((u) => !sz.excluded.has(u.id)); gapApprox = !!ctx.usersCapped; }
        else {
          targets = [];
          for (const id of sz.included) { const u = byId.get(id); if (u) targets.push(u); else gapApprox = true; }
        }
        gap = targets.reduce((acc, u) => acc + (u[key] ? 0 : 1), 0);
        gapApprox = gapApprox || sz.approx;
      }
      const bits = [];
      if (s.all) bits.push("All users" + (sz.excluded.size ? ` − ${sz.excluded.size} excluded` : ""));
      else {
        if (s.incGroups.length) bits.push(s.incGroups.map(nm).slice(0, 3).join(", ") + (s.incGroups.length > 3 ? ` +${s.incGroups.length - 3} groups` : ""));
        if (s.incRoles.length) bits.push(`${s.incRoles.length} role${s.incRoles.length === 1 ? "" : "s"}`);
        if (s.incUsers.length) bits.push(`${s.incUsers.length} named user${s.incUsers.length === 1 ? "" : "s"}`);
        if (s.none && !bits.length) bits.push("None");
      }
      if (s.incGuests) bits.push("guests (not counted — separate licensing)");
      perPolicy.push({ id: raw.id, name: raw.displayName || raw.name || "(unnamed)", state: raw.state,
        size: sz.size, approx: sz.approx, gap, gapApprox,
        needsP2: riskKinds.length > 0, riskKinds, desc: bits.join(" · ") || "—" });
    }
    perPolicy.sort((a, b) => (b.size || 0) - (a.size || 0) || String(a.name).localeCompare(String(b.name)));

    const sizedAll = active.map((raw) => sizeOf(raw, ctx));
    const riskIdx = active.map((raw, i) => (riskKindsOf(raw).length ? i : -1)).filter((i) => i >= 0);
    const p1u = unionInfo(sizedAll, ctx);
    const p2u = unionInfo(riskIdx.map((i) => sizedAll[i]), ctx);

    // The named gap: targeted users WITHOUT the plan assigned to them.
    // This is deliberately a different number from `gap` (targeted − seats
    // OWNED): unassigned seats exist, and assigning them is free while
    // buying is not — so both numbers are reported and the render says
    // which is which. Disabled accounts sort last: they are the cleanup
    // candidates, not the purchase candidates.
    const gapListOf = (info, key) => {
      if (!info.ids || !byId) return null;
      const out = [];
      for (const id of info.ids) {
        const u = byId.get(id);
        if (u && !u[key]) out.push(u);
      }
      out.sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1)
        || String(a.upn || a.name).localeCompare(String(b.upn || b.name)));
      return out;
    };

    const broadest = perPolicy.reduce((w, p) => (p.size != null && (!w || p.size > w.size) ? p : w), null);
    const disabledRisk = (ctx.policies || []).filter((p) => p.state === "disabled" && riskKindsOf(p).length).length;

    const p1 = { targeted: p1u.size, approx: p1u.approx, seats: lic.known ? lic.p1.seats : null,
      assigned: lic.known ? lic.p1.assigned : null,
      gap: lic.known && p1u.size != null ? p1u.size - lic.p1.seats : null,
      gapUsers: gapListOf(p1u, "p1"), gapPartial: !!p1u.partial };
    const p2 = { targeted: p2u.size, approx: p2u.approx, seats: lic.known ? lic.p2.seats : null,
      assigned: lic.known ? lic.p2.assigned : null,
      gap: lic.known && p2u.size != null ? p2u.size - lic.p2.seats : null,
      gapUsers: gapListOf(p2u, "p2"), gapPartial: !!p2u.partial,
      riskCount: riskIdx.length };

    const caveats = [];
    caveats.push("Counted on member users — guests are excluded on purpose; guest/External ID licensing follows different rules.");
    caveats.push("The count is of identities, not people. Microsoft's licensing FAQ counts one employee with several internal accounts (a day-to-day account plus an admin account) as ONE licence — map admin accounts back to their owners before buying for them.");
    if (p1.approx || p2.approx) caveats.push("A count marked ≈ is approximate: a group was unreadable or over the read cap, a role could not be read, or the user list was capped. The tool refuses to present those as exact.");
    if (ctx.usersCapped) caveats.push("The user read hit its page cap — the named gap lists cover the users that were read, not the whole tenant.");
    if (ctx.users === null || ctx.users === undefined) caveats.push("The user list was not read — the gap can be counted but not named.");
    if (perPolicy.some((p) => p.state === "enabledForReportingButNotEnforced"))
      caveats.push("Report-only policies count — they evaluate every sign-in in scope, and the licensing terms are about targeting, not enforcement.");
    if (disabledRisk) caveats.push(`${disabledRisk} disabled risk-based polic${disabledRisk === 1 ? "y" : "ies"} not counted — switching ${disabledRisk === 1 ? "it" : "one"} on creates a P2 obligation for its scope.`);

    return { perPolicy, lic, p1, p2, broadest,
      totals: { members: ctx.totalMembers, disabled: ctx.disabledMembers,
        usersRead: ctx.users ? ctx.users.length : null, usersCapped: !!ctx.usersCapped },
      disabledRisk, activeCount: active.length, caveats };
  }

  // ---- Markdown --------------------------------------------------------
  const n = (v, approx) => v == null ? "not read" : `${approx ? "≈ " : ""}${v.toLocaleString()}`;
  function mdGapList(L, label, o, partial) {
    L.push(`### Who is in the ${label} gap`, "");
    if (o.gapUsers === null) {
      L.push("The user list could not be read, so the gap is counted but not named.", "");
      return;
    }
    if (!o.gapUsers.length) {
      L.push(`Nobody — every targeted user has ${label} assigned.`, "");
      return;
    }
    L.push(`${o.gapUsers.length.toLocaleString()} targeted user${o.gapUsers.length === 1 ? "" : "s"} with no ${label} licence assigned${partial ? " (partial — the user read was capped)" : ""}:`, "");
    // u.purpose is set by the wiring's on-demand mailbox-type check.
    // Besides the real userPurpose values, two derived outcomes exist:
    // "mailbox-no-access" — a mailbox EXISTS but the delegated read was
    // denied; on an unlicensed account that is almost always a shared/
    // room/equipment mailbox — and "no-mailbox", a plain unlicensed user.
    const RESOURCE = { shared: "SHARED MAILBOX", room: "ROOM MAILBOX", equipment: "EQUIPMENT MAILBOX" };
    for (const u of o.gapUsers) L.push(`- ${u.upn || u.id}${u.name && u.name !== u.upn ? ` — ${u.name}` : ""}${RESOURCE[u.purpose] ? ` — **${RESOURCE[u.purpose]}** (never licensed — disable or exclude it)` : u.purpose === "mailbox-no-access" ? " — **UNLICENSED MAILBOX** (likely shared/room/equipment — verify in the Exchange admin center)" : u.enabled === false ? " — **DISABLED** (cleanup candidate, not a purchase)" : ""}`);
    const unassigned = o.seats != null && o.assigned != null ? Math.max(0, o.seats - o.assigned) : null;
    L.push("");
    if (unassigned) L.push(`${unassigned.toLocaleString()} owned seat${unassigned === 1 ? " is" : "s are"} not assigned to anyone — assigning covers ${Math.min(unassigned, o.gapUsers.length)} of these before anything needs buying.`, "");
  }
  function toMd(res, meta = {}) {
    const L = [`# Licence gap — ${meta.tenantName || "tenant"}`, "", Brand.generatedBy(), ""];
    L.push("The licence usage blade in Entra counts **evaluated** users — who triggered a policy last month. The licensing obligation is on **targeted** users: every user a Conditional Access policy is scoped to needs Entra ID P1, and every user targeted by a risk-based policy needs P2, whether they signed in or not. This report counts the targeted number and names the users in the gap.", "");
    L.push("## The gap", "");
    L.push("| | Targeted | Licensed | Gap |", "|---|---|---|---|");
    L.push(`| **Entra ID P1** (any CA policy) | ${n(res.p1.targeted, res.p1.approx)} | ${n(res.p1.seats)} | ${res.p1.gap == null ? "—" : res.p1.gap > 0 ? `**${res.p1.gap.toLocaleString()} short**` : "covered"} |`);
    L.push(`| **Entra ID P2** (risk-based policies) | ${n(res.p2.targeted, res.p2.approx)} | ${n(res.p2.seats)} | ${res.p2.gap == null ? "—" : res.p2.gap > 0 ? `**${res.p2.gap.toLocaleString()} short**` : "covered"} |`, "");
    if (res.totals.members != null) L.push(`Member users in the tenant: ${res.totals.members.toLocaleString()}${res.totals.disabled != null ? ` (of which ${res.totals.disabled.toLocaleString()} disabled)` : ""}. Active CA policies: ${res.activeCount}.${res.broadest ? ` Broadest policy: **${res.broadest.name}** (${n(res.broadest.size, res.broadest.approx)} users).` : ""}`, "");
    mdGapList(L, "P1", res.p1, res.totals.usersCapped);
    if (res.p2.riskCount) mdGapList(L, "P2", res.p2, res.totals.usersCapped);
    else L.push("### Who is in the P2 gap", "", `No active risk-based policy — nothing creates a P2 obligation today${res.p2.seats ? ` (${res.p2.seats.toLocaleString()} P2 seat${res.p2.seats === 1 ? "" : "s"} owned)` : ""}.${res.disabledRisk ? ` Note: ${res.disabledRisk} disabled risk-based polic${res.disabledRisk === 1 ? "y" : "ies"} would create one the day ${res.disabledRisk === 1 ? "it is" : "one is"} switched on.` : ""}`, "");
    if (res.lic.known) {
      L.push("## Where the licences come from", "");
      for (const r of res.lic.p1.rows) L.push(`- ${r.part}: ${r.seats.toLocaleString()} seat${r.seats === 1 ? "" : "s"} (${r.assigned.toLocaleString()} assigned)${r.viaP2 ? " — carries P2, counts for both" : ""}`);
      if (res.lic.skipped.length) L.push(`- Not counted (suspended/cancelled): ${res.lic.skipped.join(", ")}`);
      L.push("");
    }
    L.push("## Per policy", "", "| Policy | State | Needs | Targeting | Users in scope | Gap |", "|---|---|---|---|---|---|");
    for (const p of res.perPolicy)
      L.push(`| ${p.name} | ${p.state === "enabled" ? "On" : p.state === "enabledForReportingButNotEnforced" ? "Report-only" : p.state} | ${p.needsP2 ? `P2 (${p.riskKinds.join(", ")})` : "P1"} | ${p.desc} | ${n(p.size, p.approx)} | ${p.gap == null ? "—" : p.gap > 0 ? `**${n(p.gap, p.gapApprox)}**` : "0"} |`);
    L.push("");
    L.push("## Closing the gap", "");
    L.push("1. **Clean up before you buy.** Disabled users, stale accounts synced from on-premises AD, service accounts, room and shared mailboxes are all in scope of an All-users policy. Exclude what should never hit Conditional Access, disable or delete what nobody uses." + (res.totals.disabled ? ` This tenant has ${res.totals.disabled.toLocaleString()} disabled member users counting against the obligation today.` : ""));
    L.push("2. **Map identities to people.** One employee with several internal accounts needs one licence — review admin accounts against their owners and document the mapping.");
    L.push("3. **Narrowing the target is a trade-off, not a fix.** Scoping policies to a licensed-users group closes the compliance gap but leaves everyone outside it unprotected — baseline policies scoped to All users are the recommended practice for a reason.");
    L.push("4. **Small tenant, simple needs?** Security defaults give MFA for all users with no P1 at all — but they cannot coexist with Conditional Access policies.");
    L.push("5. **Buy what remains.** P1 rides in EMS E3, M365 E3, Business Premium and standalone; P2 in EMS E5, M365 E5 and standalone — P2 covers the P1 obligation too.");
    L.push("", "## Notes", "");
    for (const c of res.caveats) L.push(`- ${c}`);
    return L.join("\n");
  }

  return { analyze, toMd, scopeOf, riskKindsOf, licenseTotals, P1_PLAN, P2_PLAN };
})();
