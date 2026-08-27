// ======================================================================
// memberOf retirement check (T34) — a TEMPORARY tool, and it says so.
//
// The `memberOf` dynamic rule operator has been in public preview since 2022
// and Microsoft is ending that preview on 3 November 2026. After that date
// dynamic groups, dynamic administrative units and entitlement-management
// auto-assignment policies whose rule uses memberOf STOP UPDATING and stay in
// their last known state. Nothing breaks loudly — which is exactly the danger:
// a group frozen mid-2026 keeps handing out whatever it held that day, and a
// Conditional Access policy pointed at it keeps enforcing yesterday's answer.
//   https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-member-of
//
// The scan half follows the same three surfaces EMOS reads
// (github.com/kayasax/EMOS): dynamic groups, dynamic administrative units,
// and entitlement-management auto-assignment policies. THIS TOOL READS TWO OF
// THE THREE — groups and administrative units — and says so on screen rather
// than letting a clean report imply a clean tenant. The third surface needs
// EntitlementManagement.Read.All and Microsoft ships its own script for it;
// the report links to both instead of pretending the gap is not there.
//
// Where this goes further than a scan: ENCA already holds the tenant's
// Conditional Access policies, so every affected group is cross-referenced
// against them. That turns "this rule stops updating" into a sentence with
// consequences in it:
//   * a frozen group in an ENFORCED policy's INCLUDE is an enforcement gap —
//     the joiners who should be covered never arrive
//   * a frozen group in an ENFORCED policy's EXCLUDE is worse: it is a
//     standing bypass that no longer shrinks, and nobody gets an alert
//
// READS ONLY. Rewriting a membership rule changes who is in a group, and
// therefore who a Conditional Access policy hits — that decision belongs to a
// human in the portal, not to a report. Nothing here writes and nothing here
// talks to Graph: this module is pure analysis over a ctx the wiring fills
// from Graph (or demo data), matching the house pattern (smsvoice.js,
// devcheck.js, guide.js):
//   ctx = {
//     groups:   [{ id, displayName, membershipRule, ruleState, licensed, owners }],
//     aus:      [{ id, displayName, membershipRule, ruleState, restricted }] | null,
//     policies: [ raw Conditional Access policy JSON ],   // [] = not loaded
//     names:    { sourceGroupId → displayName },          // absent = deleted
//     namesRead: bool,
//     groupsPartial: bool, ausRead: bool, ausPartial: bool, ownersRead: bool,
//     totalDynamic: number,      // dynamic groups looked at, affected or not
//   }
// ======================================================================
const MemberOf = (() => {
  const DATES = {
    retire: { iso: "2026-11-03", label: "3 November 2026" },
  };
  const daysUntil = (iso) => Math.ceil((new Date(iso + "T00:00:00Z") - Date.now()) / 86400000);

  // Microsoft's own preview limits, quoted because they change what a big
  // number on this report means: a tenant at 500 has been using memberOf as
  // architecture, not as an experiment, and the migration is a project.
  const LIMITS = { groupsPerTenant: 500, memberGroupsPerRule: 50 };

  // ---- detecting the operator, and admitting when it is not certain -------
  // The documented syntax is `user.memberof -any (group.objectId -in [...])`
  // and its device twin. Matching the bare word "memberof" would also catch an
  // extension attribute somebody named memberOfDivision, so the primary match
  // is anchored to the user./device. prefix that makes it the OPERATOR.
  //
  // Anything that says memberof WITHOUT matching that shape is not silently
  // dropped — it comes back as `suspect` and a human reads the rule. A scanner
  // that quietly discards the cases it is unsure about is a scanner whose
  // clean report cannot be trusted, and the whole value of this tool is that
  // an empty result means something.
  const OPERATOR_RE = /\b(?:user|device)\s*\.\s*memberof\b/i;
  const LOOSE_RE = /memberof/i;
  const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  function ruleUse(rule) {
    const r = String(rule || "");
    if (OPERATOR_RE.test(r)) return "operator";
    if (LOOSE_RE.test(r)) return "mentions";
    return "no";
  }

  // The source groups the rule points AT. Read straight out of the rule text
  // because Graph does not model it: `group.objectId -in ['a','b']` is a
  // string as far as the API is concerned. Resolving these ids is what lets
  // the report say "the source group was deleted and this group still carries
  // its members", which is the failure the retirement notice warns about and
  // which is already true today, before any deadline.
  function sourceIds(rule) {
    return [...new Set((String(rule || "").match(GUID_RE) || []).map((x) => x.toLowerCase()))];
  }

  // ---- Conditional Access blast radius -----------------------------------
  // ENCA holds the policies already, so this costs no extra call. `state` is
  // carried through untranslated and turned into words once, at the edge.
  const stateWord = (s) => s === "enabled" ? "On"
    : s === "enabledForReportingButNotEnforced" ? "Report-only"
    : s === "disabled" ? "Off" : String(s || "unknown");

  function caRefs(policies, groupId) {
    const id = String(groupId || "").toLowerCase();
    const out = [];
    for (const p of policies || []) {
      const u = ((p.conditions || {}).users) || {};
      const st = stateWord(p.state);
      const hit = (list, how) => (list || []).forEach((g) => {
        if (String(g).toLowerCase() === id) out.push({ id: p.id, name: p.displayName || p.id, how, state: st, enforced: p.state === "enabled" });
      });
      hit(u.includeGroups, "included");
      hit(u.excludeGroups, "excluded");
    }
    return out;
  }

  // ---- verdicts ----------------------------------------------------------
  // critical — something that ENFORCES today rides on this rule: an On
  //            Conditional Access policy, or group-based licensing. When the
  //            rule freezes, the enforcement or the licence freezes with it.
  // high     — a real consumer, but not one enforcing right now: a report-only
  //            or Off policy, an administrative unit, or a rule that already
  //            points at a source group the directory no longer has.
  // review   — nothing ENCA can see consumes it. It still stops updating on
  //            the retirement date; ENCA just cannot say what that costs.
  // suspect  — the rule says memberof but not in the documented operator
  //            form. Read it by hand rather than trusting either answer.
  const RISK_RANK = { critical: 0, high: 1, review: 2, suspect: 3 };
  const RISK_WORD = {
    critical: "an ENFORCED consumer rides on this rule — it freezes with the rule",
    high: "a real consumer, none of it enforcing right now",
    review: "no consumer ENCA can see — it still stops updating",
    suspect: "says memberof, but not as the documented operator — read the rule",
  };

  // One row per affected object. `kind` keeps groups and administrative units
  // in one table without pretending they are the same thing: an AU has no
  // owners in Entra and no licences, and the columns say so rather than
  // showing a blank that reads as "none".
  function groupRow(g, ctx) {
    const use = ruleUse(g.membershipRule);
    const refs = caRefs(ctx.policies || [], g.id);
    const src = sourceIds(g.membershipRule);
    const missing = ctx.namesRead ? src.filter((id) => !(ctx.names || {})[id]) : [];
    const licensed = !!(g.licensed);
    const enforced = refs.filter((r) => r.enforced);
    const excluded = enforced.filter((r) => r.how === "excluded");
    let risk;
    if (use === "mentions") risk = "suspect";
    else if (enforced.length || licensed) risk = "critical";
    else if (refs.length || missing.length) risk = "high";
    else risk = "review";
    return {
      kind: "group", id: g.id, name: g.displayName || g.id,
      rule: g.membershipRule || "", use, risk,
      ruleState: g.ruleState || "",           // On / Paused — a paused rule is already frozen
      licensed, refs, enforced: enforced.length, bypass: excluded.length,
      src, missing, owners: g.owners || null, restricted: null,
      why: whyGroup({ enforced, refs, licensed, missing, use }),
    };
  }

  function whyGroup({ enforced, refs, licensed, missing, use }) {
    if (use === "mentions") return "The rule contains the word memberof but not as user.memberof or device.memberof — it may be an attribute name, or a rule written in a form this check does not recognise.";
    const parts = [];
    const inc = enforced.filter((r) => r.how === "included").length;
    const exc = enforced.filter((r) => r.how === "excluded").length;
    if (exc) parts.push(`EXCLUDED from ${exc} enforced Conditional Access ${exc === 1 ? "policy" : "policies"} — a bypass that stops shrinking`);
    if (inc) parts.push(`INCLUDED in ${inc} enforced Conditional Access ${inc === 1 ? "policy" : "policies"} — new joiners stop being covered`);
    if (licensed) parts.push("carries group-based licensing — new joiners stop being licensed");
    const soft = refs.length - enforced.length;
    if (soft) parts.push(`referenced by ${soft} report-only or Off ${soft === 1 ? "policy" : "policies"}`);
    if (missing.length) parts.push(`${missing.length} source ${missing.length === 1 ? "group is" : "groups are"} no longer in the directory — this rule is already stale`);
    return parts.length ? parts.join("; ") : "No Conditional Access policy and no group-based licensing points at it here.";
  }

  function auRow(a) {
    const use = ruleUse(a.membershipRule);
    const src = sourceIds(a.membershipRule);
    let risk;
    if (use === "mentions") risk = "suspect";
    else if (a.restricted) risk = "critical";
    else risk = "high";
    return {
      kind: "au", id: a.id, name: a.displayName || a.id,
      rule: a.membershipRule || "", use, risk,
      ruleState: a.ruleState || "", licensed: false, refs: [], enforced: 0, bypass: 0,
      src, missing: [], owners: null, restricted: !!a.restricted,
      why: use === "mentions"
        ? "The rule contains the word memberof but not as user.memberof or device.memberof — read it by hand."
        : a.restricted
          ? "A RESTRICTED management administrative unit: its membership decides who is shielded from tenant-wide admins. Frozen membership means new accounts never get that protection, and nothing says so."
          : "A dynamic administrative unit: its membership decides the scope of delegated administration. Frozen membership means delegated admins keep yesterday's scope.",
    };
  }

  function analyze(ctx) {
    const rows = [];
    for (const g of ctx.groups || []) if (ruleUse(g.membershipRule) !== "no") rows.push(groupRow(g, ctx));
    for (const a of ctx.aus || []) if (ruleUse(a.membershipRule) !== "no") rows.push(auRow(a));
    rows.sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk]
      || b.enforced - a.enforced
      || String(a.name).localeCompare(String(b.name)));
    const n = (k) => rows.filter((r) => r.risk === k).length;
    const groups = rows.filter((r) => r.kind === "group");
    return {
      rows,
      policiesRead: (ctx.policies || []).length > 0,
      namesRead: !!ctx.namesRead, names: ctx.names || {},
      groupsPartial: !!ctx.groupsPartial,
      ausRead: !!ctx.ausRead, ausPartial: !!ctx.ausPartial,
      ownersRead: !!ctx.ownersRead,
      summary: {
        total: rows.length,
        groups: groups.length,
        aus: rows.filter((r) => r.kind === "au").length,
        critical: n("critical"), high: n("high"), review: n("review"), suspect: n("suspect"),
        caPolicies: new Set(groups.flatMap((r) => r.refs.map((x) => x.id))).size,
        enforcedGroups: groups.filter((r) => r.enforced > 0).length,
        bypassGroups: groups.filter((r) => r.bypass > 0).length,
        licensedGroups: groups.filter((r) => r.licensed).length,
        staleGroups: groups.filter((r) => r.missing.length).length,
        pausedRules: rows.filter((r) => /paused/i.test(r.ruleState)).length,
        totalDynamic: ctx.totalDynamic || 0,
        days: daysUntil(DATES.retire.iso),
        nearLimit: groups.length >= LIMITS.groupsPerTenant * 0.8,
      },
    };
  }

  // ---- the notification email --------------------------------------------
  // Aimed at the OWNERS of the affected groups, not at end users: nobody who
  // signs in feels this retirement until the day their access is wrong, and by
  // then the rule has been frozen for months. Administrative units have no
  // owner in Entra at all, so they cannot be mailed to anybody — the modal
  // says that outright rather than leaving them silently out of the count.
  function notifyOwners(res) {
    const groups = (res.rows || []).filter((r) => r.kind === "group");
    const withOwners = groups.filter((r) => (r.owners || []).length);
    const recipients = [...new Set(withOwners.flatMap((r) => (r.owners || []).map((o) => o.upn)))]
      .filter((u) => /@/.test(u)).sort();
    const ownerless = groups.length - withOwners.length;
    const aus = (res.rows || []).filter((r) => r.kind === "au").length;
    const subject = `Action required before ${DATES.retire.label}: a group you own uses a rule Microsoft is retiring`;
    const body = [
      "Hello,",
      "",
      "You are listed as an owner of one or more dynamic groups in our Microsoft Entra tenant whose membership rule uses the memberOf operator.",
      "",
      `Microsoft is ending the preview of that operator on ${DATES.retire.label}. From that date the rule stops running: the group keeps whatever members it had on the last day and never updates again. Nothing fails visibly, which is why this needs attention before the date rather than after it.`,
      "",
      "What that means in practice:",
      "",
      "  * People who join later are never added, so they miss whatever the group grants — access, licences, or the Conditional Access policies scoped to it.",
      "  * People who leave are never removed, so access that should have ended quietly continues.",
      "",
      "What we need from you — please reply with which of these applies to each group you own:",
      "",
      "  1. REPLACE THE RULE. If the membership can be expressed with supported attributes (department, job title, country, an extension attribute), we rewrite the rule and the group keeps working.",
      "  2. CONVERT TO ASSIGNED. If the membership is stable, we switch the group to assigned membership and manage it by hand from then on.",
      "  3. DELETE IT. If the group is no longer used, say so and we remove it.",
      "",
      "If you are not sure which applies, reply and we will go through it with you. Doing nothing is option 1 by default, and it is the one option that leaves the group quietly wrong.",
      "",
      "The group names are listed below or attached.",
      "",
      "Thank you,",
      "[YOUR IT TEAM]",
    ].join("\n");
    return { subject, body, recipients, ownerless, aus,
      groupList: withOwners.map((r) => `${r.name} (${r.id})`).join("\n") };
  }

  // ---- exports -----------------------------------------------------------
  const MD_ROW_CAP = 500;   // Microsoft caps a tenant at 500 memberOf groups; the CSV carries any excess

  function toMd(res, meta = {}) {
    const s = res.summary;
    const L = [`# memberOf retirement check — ${meta.tenantName || "tenant"}`, "",
      (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy() : "", "",
      "> **Temporary tool.** The `memberOf` dynamic rule operator leaves preview on " +
      `**${DATES.retire.label}**. Configurations still using it stop updating and remain in their last known state. ` +
      "Source: [Microsoft's retirement notice](https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-member-of).", "",
      "## Tenant state", "",
      `- ${DATES.retire.label}: **${s.days >= 0 ? `in ${s.days} day${s.days === 1 ? "" : "s"}` : `${-s.days} days ago`}**`,
      `- Dynamic groups read: **${s.totalDynamic.toLocaleString()}**${res.groupsPartial ? " (READ CAPPED — the list is partial)" : ""} · using memberOf: **${s.groups.toLocaleString()}**`,
      `- Dynamic administrative units using memberOf: **${res.ausRead ? s.aus.toLocaleString() : "not read"}**${res.ausPartial ? " (read capped)" : ""}`,
      `- Verdicts: **${s.critical} critical** · ${s.high} high · ${s.review} review${s.suspect ? ` · ${s.suspect} to read by hand` : ""}`, ""];
    if (!s.total) {
      L.push(`**No dynamic group${res.ausRead ? " or administrative unit" : ""} in this tenant uses the memberOf operator. Nothing changes here on ${DATES.retire.label}.**`, "");
    } else {
      L.push("## Blast radius", "",
        ...[
          res.policiesRead
            ? `- Conditional Access policies pointing at an affected group: **${s.caPolicies}** · groups referenced by an **enforced** policy: **${s.enforcedGroups}** · of those, **${s.bypassGroups} used as an EXCLUSION** (a bypass that stops shrinking)`
            : "- Conditional Access cross-reference **not available** — no policies were loaded in this session, so the blast radius is unknown rather than empty",
          `- Groups carrying group-based licensing: **${s.licensedGroups}**`,
          `- Rules already pointing at a source group the directory no longer has: **${s.staleGroups}**`,
          s.pausedRules ? `- Rules whose processing state is already **Paused**: **${s.pausedRules}**` : null,
          s.nearLimit ? `- This tenant is at **${s.groups} of Microsoft's ${LIMITS.groupsPerTenant}** memberOf group limit — memberOf is architecture here, and the migration is a project rather than an afternoon.` : null,
        ].filter(Boolean), "");
    }
    if (res.rows.length) {
      L.push("## Affected objects", "",
        "| Type | Name | Rule state | CA policies | Enforced | Licensing | Stale sources | Verdict | Why |",
        "|---|---|---|---|---|---|---|---|---|");
      for (const r of res.rows.slice(0, MD_ROW_CAP))
        L.push(`| ${r.kind === "au" ? (r.restricted ? "AU (restricted)" : "AU") : "Group"} | ${r.name} | ${r.ruleState || "—"} | ${r.kind === "group" ? r.refs.length : "—"} | ${r.kind === "group" ? r.enforced : "—"} | ${r.kind === "group" ? (r.licensed ? "yes" : "no") : "—"} | ${r.missing.length || "—"} | ${r.risk} | ${r.why} |`);
      if (res.rows.length > MD_ROW_CAP) L.push("", `…and ${res.rows.length - MD_ROW_CAP} more — the CSV export carries the full list.`);
      L.push("", "### The rules themselves", "");
      for (const r of res.rows.slice(0, MD_ROW_CAP)) {
        L.push(`**${r.name}** — ${r.kind === "au" ? "administrative unit" : "group"} \`${r.id}\``, "", "```", r.rule, "```", "");
        if (r.kind === "group" && r.refs.length)
          L.push(...r.refs.map((x) => `- ${x.how === "excluded" ? "EXCLUDED from" : "included in"} **${x.name}** (${x.state})`), "");
      }
    }
    L.push("## What to do", "",
      `1. **Replace the rule** with [supported operators](https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-more-efficient) where the membership can be expressed as attributes.`,
      "2. **Convert to assigned membership** where it cannot, and manage the members by hand from then on.",
      "3. **Delete what is unused** — a frozen group nobody needed is still a group handing out yesterday's access.",
      `4. Start with the **critical** rows: those are the ones an enforced Conditional Access policy or a licence assignment already depends on.`, "",
      "### The surface this tool does not read", "",
      "Microsoft names a third surface — **entitlement-management auto-assignment policies** — whose rules can also use memberOf. This tool reads dynamic groups and dynamic administrative units only, so a clean report here does **not** mean a clean tenant. Check that surface with " +
      "[Microsoft's own script](https://learn.microsoft.com/entra/id-governance/entitlement-management-access-package-auto-assignment-policy#find-automatic-assignment-policies-that-use-the-memberof-attribute) or " +
      "[EMOS](https://github.com/kayasax/EMOS), which covers all three.", "",
      "Links: [retirement notice](https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-member-of) · [supported rule operators](https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-more-efficient) · [dynamic administrative units](https://learn.microsoft.com/entra/identity/role-based-access-control/admin-units-members-dynamic)", "");
    return L.join("\n");
  }

  function toCsv(res) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const L = ["type,displayName,objectId,ruleProcessingState,membershipRule,sourceGroupCount,staleSourceGroups,caPolicyCount,caEnforcedCount,caExclusionCount,caPolicies,groupBasedLicensing,restrictedManagementAu,owners,verdict,why"];
    for (const r of res.rows)
      L.push([
        r.kind === "au" ? "administrativeUnit" : "group",
        q(r.name), q(r.id), q(r.ruleState), q(r.rule),
        r.src.length, r.missing.length,
        r.kind === "group" ? r.refs.length : "",
        r.kind === "group" ? r.enforced : "",
        r.kind === "group" ? r.bypass : "",
        q(r.refs.map((x) => `${x.name} (${x.how}, ${x.state})`).join("; ")),
        r.kind === "group" ? (r.licensed ? "yes" : "no") : "",
        r.kind === "au" ? (r.restricted ? "yes" : "no") : "",
        q((r.owners || []).map((o) => o.upn).join("; ")),
        r.risk, q(r.why),
      ].join(","));
    return L.join("\n");
  }

  return { DATES, LIMITS, daysUntil, ruleUse, sourceIds, caRefs, stateWord,
    analyze, toMd, toCsv, notifyOwners, RISK_WORD, RISK_RANK, MD_ROW_CAP };
})();
