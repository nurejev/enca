// ======================================================================
// PROMOTION QUEUE — what is on the beta channel and not yet in production.
//
// Rendered in Help, and ONLY on a non-production host, so a customer on
// enca.limon-it.nl never sees a list of things they do not have.
//
// WHY THIS IS HAND-MAINTAINED. The app is static files in a browser: it
// cannot read git, diff two branches, or know what main contains. So this
// list is written by whoever makes the change — the same discipline as
// js/changelog.js, and the same failure mode if it is skipped: a stale list
// is worse than none, because it will be trusted.
//
// HOUSEKEEPING, every time a change lands on beta:
//   * add it to an existing item if it belongs to one, or open a new item
//   * put the beta builds it spans in `builds`
//   * write its `test` checklist — see below
//
// `test` — HOW SOMEBODY SATISFIES THEMSELVES IT WORKS, before promoting.
// `why` already says what the risk is and what would have to be true for the
// item to graduate; it does not say how to find out. An item whose graduation
// condition nobody knows how to check either ships untested or never ships at
// all, and both of those have happened here.
//
// Write steps that are FALSIFIABLE: name the tenant state each one needs and
// the outcome you should see, so a step can fail. "Check it works" is not a
// step. Where a check needs a tenant nobody has to hand, say so on the step
// rather than leaving it looking routine — knowing which check was skipped is
// worth more than a list that pretends all of them were run.
//
// An item without `test` is not finished. It lands in the same commit as the
// change, like the changelog entry and the home-tile tag.
//
// PROMOTING AN ITEM — all four, or the two channels start disagreeing:
//   1. delete the item here and bump `productionBuild`
//   2. update the roadmap card ON MAIN: `live · build NNN`
//   3. update the SAME card ON BETA: `live · beta NNNNN · production NNN`
//   4. add the changelog entry on both channels
//
// Step 3 is the one that gets missed, because the port is finished and working
// by then. Each channel carries its own copy of index.html, so promoting only
// touches main's roadmap — beta's card goes on claiming the work is beta-only.
// On 2026-08-17 EIGHT cards had drifted that way: R27 read "live · beta 25115"
// while it had been in production since 283, so the roadmap said beta-only and
// the queue, correctly, showed no gap at all. Two sources of truth, one of them
// updated. R07, R08, R09, R10, R29, R30 and R31 were in the same state.
//
// A card that says "live · beta NNNNN" with NO production clause therefore
// means one of two things, and only one of them is right: the tool is genuinely
// beta-only (R05 today, whose tool has not been promoted), or somebody skipped
// step 3. Write "beta NNNNN · production NNN" — never "build 250xx", which uses
// production wording for a five-digit beta number and reads as a release to
// anybody who does not know the two series apart.
//
// THERE IS A THIRD CASE, and it needs its own wording because it looks exactly
// like the mistake: a change that is finished on beta and DELIBERATELY held out
// of a release its neighbours went in. R28 is the first — promoted 61-66, 68
// and 69 to 287 and left 67 behind, because 67 is the only one that changes
// where a WRITE puts a group object. Write "beta NNNNN · held from production"
// so the card says which of the three it is. "No production clause" must never
// be the thing a reader has to interpret.
//
// `n` is a stable hand-assigned number so it can be referred to out loud —
// "push number 3 to main". Numbers are NOT reused after an item ships;
// the next new item takes the next free number.
//
// WHAT DOES NOT BELONG HERE. Roadmap cards, changelog entries and this file
// itself are documentation, not promotable changes: they describe the work
// rather than being it, and a row saying "one roadmap card" buries the rows
// that matter under things nobody decides about separately. They are never
// queued — they simply travel with whatever promotion happens next, which is
// why a port copies index.html's roadmap and Help along with the code.
//
// ONE ITEM PER CHANGE. Only things that must ship together share a number —
// a fix and the feature it fixes, or two edits that are meaningless apart.
// Unrelated work bundled under one number cannot be promoted separately, which
// is the whole point of numbering it: "push 19" has to mean one decision, not
// three that happened to be written on the same day.
// ======================================================================
// `betaBuild` USED TO LIVE HERE and has been removed on purpose: this site's
// own version is not a judgement call, it is APP_BUILD.label, and the header
// now reads it from there. Hand-maintaining it meant it could disagree with
// the footer of the same page — which it did, printing v1.0.250-beta.112 while
// the app computed v1.0.251-beta.12. Only `productionBuild` stays by hand,
// because the app genuinely cannot know what the other channel is running.
const PROMOTE = {
  productionBuild: "v1.0.292",

  items: [
    {
      n: 83,
      title: "🔁 RESTORE each policy's own CAxxx-Exclusion group (R38)",
      tools: ["List Policies", "CA groups"],
      builds: [25179],
      risk: "medium",
      what: "An eighth action in the Assign wizard, and the first that maps a DIFFERENT group to every policy: the CA number in the policy name resolves to its exclusion group via the baseline catalog (derived by convention when the catalog has no such number, and labelled as such). Step 2 is a drift report — already correct / lost the reference / group not in the tenant / no convention group — with only the repairs pre-ticked, optional creation of missing groups from their templates, and the whole tenant as a scope for the sweep. Additive only; tenant-wide needs the typed ALL. New Assign.conventionExclusionFor / conventionPlan / groupsByPrefix / applyMapped, and a per-policy change report.",
      why: "It WRITES, and what it writes widens policies: an exclusion group with members in it exempts those members the moment the reference is restored. Reading a tenant that has drifted is safe; putting 58 references back across a production estate in one pass is the part that has to be proven. Graduates once a sweep has been run against a real tenant and the change report reconciles with what the Baseline gap check expected.",
      test: [
        "Demo mode covers all three states (CA200 correct, CA201 lost the reference, CA204's group absent) — step 2 must show 1 already correct, 1 missing, 1 group not in tenant.",
        "Scope to a selection of one policy that already has its group: step 2 says there is nothing to restore and points at Back.",
        "A policy whose CA number the catalog does not have (e.g. rename one to CA250-…): the row appears with a derived tag, and the group name follows the convention.",
        "A policy with no CA number in its name is counted under 'no convention group' and never ticked.",
        "Untick the create-missing-groups box: the nogroup rows go disabled and Tick all does not select them; the count excludes them.",
        "Tick create-missing-groups on a real tenant: the group is created from its baseline template, appears in Entra as a plain security group, and the policy references it afterwards.",
        "Run it scoped to all policies: the review demands the typed ALL, and the change report lists policy → group pairs, not one group list.",
        "Re-run the same sweep immediately: every row now reads 'already set' and nothing is written twice.",
        "A policy that already excludes the group plus others: after the run its other exclusions are still there — this action must never replace a list.",
        "Break one deliberately (remove the group from a policy in the portal), sweep, and confirm 🧬 Baseline Policies stops reporting that policy as drifted afterwards.",
        "Needs a tenant where the CAB-SEC-U-CAxxx-Exclusion groups actually exist to prove the group lookup — say so if that check was skipped.",
      ],
      files: ["js/assign.js", "js/app.js", "js/demo.js", "index.html"],
    },
    {
      n: 82,
      title: "🧬 Baseline catalog revision 2026-08-20",
      tools: ["Baseline Policies"],
      builds: [25178],
      risk: "medium",
      what: "js/baselineData.js re-cut from the 2026-08-20 CloudFellows export. Same 99 policies. CA205 and CA301 move from a compliant-device grant to BLOCK with an Entra-joined device filter (CA301 admits hybrid joined too); CA213 includes Persona-Internals instead of CA213-Inclusion; revision stamp 2026-08-20, release still R26.6 (v3.x). Guest-type wording and group order were compared out as ENCA rendering changes, not policy changes. Two departures from the export kept on purpose: the 58 per-policy exclusion-group references are carried forward, and CA001's tenant-specific SEC-VIP-Exceptions is not taken.",
      why: "Data, not code — but it is the data every tenant's gap report is measured against, so a wrong entry reads as a wrong tenant. Production is still on the 2026-07-21 revision and will tell a customer CA205 should be a compliant-device grant; the two channels disagree about the baseline until this moves. Graduates once the three changed policies have been read against a real tenant and the counts still reconcile.",
      test: [
        "🧬 Baseline Policies header shows revision 2026-08-20, release R26.6 (v3.x), 99 policies.",
        "CA205 row reads CA205-BLOCK-Internals-BP-AnyApp-Windows-EntraJoined-v3.0 and its card shows Block access, not a grant.",
        "CA301 card shows Block access and the device filter admitting AzureAD OR ServerAD — a tenant with hybrid joined devices must not read as uncovered.",
        "CA213 card includes CAB-SEC-U-Persona-Internals and no CA213-Inclusion group.",
        "CA001 card still excludes CAB-SEC-U-CA001-Exclusion, and SEC-VIP-Exceptions appears nowhere in the catalog.",
        "Spot-check three policies that lost their exclusion group in the export (CA002, CA101, CA1009): each still lists its CAB-SEC-U-CAxxx-Exclusion group.",
        "👥 CA groups ① Check against a tenant: no baseline group is expected that has no template, and the template count still reads 100.",
        "Run the gap report on a tenant deployed from the July revision: CA205, CA301 and CA213 come back as version mismatches and nothing else does — if other policies show as changed, the rendering noise was not fully compared out.",
        "📥 Import a persona on a scratch tenant: CA205 and CA301 create as block policies with their filters intact.",
        "Needs a tenant with hybrid joined Windows devices to prove the CA301 filter matters; say so if that check was skipped.",
      ],
      files: ["js/baselineData.js"],
    },
    {
      n: 81,
      title: "\ud83d\udc65 REMOVE from assignment starts from what is assigned",
      tools: ["List Policies", "CA groups"],
      builds: [25177, 25179],
      risk: "medium",
      what: "FIXED IN 25179 BEFORE IT SHIPPED: the panel this item adds threw \"asAssignedGroups is not defined\" for everybody. Its helper functions were declared inside renderAssign's Directory-roles branch, and a function declaration in a block is only ASSIGNED when that block runs — so unless you had visited Directory roles first, which nobody does when the default target is Groups, step 2 stopped dead at \"Reading the current assignment…\". They are declared at module level now. The first line of the test list below would have caught it. — The two REMOVE actions in the Assign wizard list the groups the selected policies actually carry in that bucket, all ticked, so the job is unticking whatever should stay. Names are resolved per object id; an id the directory no longer has is labelled a dangling reference instead of being shown as its own GUID; each row says how many of the selected policies reference it. Nothing assigned gives an honest empty state rather than a catalog. A tenant-wide REMOVE now needs the typed ALL that tenant-wide rewrites already needed.",
      why: "REMOVE acts on what a policy ALREADY has, and step 2 offered the baseline catalog: ticking a group the policy never referenced did nothing, and the group actually assigned might not be in the catalog to tick. So the one action whose target set is knowable made you guess it. Pre-ticking also turns the question into the right one - which of these should stay - instead of hunting names out of a list of fifteen.",
      test: [
        "Pick one policy with a couple of exclusions, action REMOVE from EXCLUDE: step 2 lists exactly those groups, all ticked, under CURRENTLY EXCLUDED.",
        "Untick one, Next: the review lists only the ones still ticked, and after applying the unticked group is still on the policy.",
        "Same with REMOVE from INCLUDE: the list is the include groups, not the exclude ones.",
        "A policy with nothing in that bucket: step 2 says there is nothing to remove and points at Back - no catalog, no empty checkbox list.",
        "A policy that excludes a deleted group: the row shows the raw id with a dangling reference tag, and removing it clears the reference.",
        "Select several policies: each row says in N of M, and the counts are right (a group on 2 of 3 says so).",
        "Untick all / Tick all: the live count follows and the list does not jump or re-render under the click.",
        "Scope All policies in this tenant with a REMOVE: the review demands the typed ALL, as a tenant-wide rewrite does.",
        "Go Back from step 2, switch scope from selected to all, Next again: the list rebuilds for the new scope rather than showing the previous one.",
        "Go Back to step 1, change the action from REMOVE to ADD: the list switches back to the baseline catalog, unticked.",
      ],
      files: ["js/app.js"],
    },
    {
      n: 80,
      title: "\ud83c\udf9a Report-only impact: chips that count the search, and a search that suggests",
      tools: ["Report-only impact"],
      builds: [25176],
      risk: "medium",
      what: "The verdict chips are counted from the searched set rather than the whole run, and count the right subject per view (policies in Per policy, users in Per user). The search box gains type-ahead over the names actually present \u2014 policy names and the GROUPS each policy targets, or UPNs in Per user \u2014 and now matches target groups, which it never did. The empty state names which control emptied the list and carries the undo.",
      why: "In production the chips read All (31), would block (5), prompts (4) directly above \u201cNo report-only policy matches the current filter\u201d \u2014 the numbers and the list describing the same screen and disagreeing. A reader trusts the numbers. Searching a deployment group name, which is how a policy is actually scoped, returned nothing at all with no hint that the box never looked there.",
      test: [
        "Run the tool, then type a policy name fragment: the chip counts drop to match what is listed. Clear it and they go back to the run totals.",
        "Type a deployment group name (CAD-SEC-U-DG-INT or similar): the policies scoped by that group are listed. Before this build the answer was always no match.",
        "Start typing in the box: suggestions appear, and they are names from THIS run - policy names and target groups in Per policy, UPNs in Per user.",
        "Type something that exists nowhere: the empty state quotes the term, says what the box searches, and offers clear the search. No verdict-reset button, because that would not help.",
        "Search a term that hits, then click a verdict chip with none of them in it: the empty state gives both numbers and offers BOTH show all N and clear the search.",
        "Pick a verdict chip that then drops to zero under a search: the chip stays visible so it can be clicked off. A filter you cannot see is one you cannot clear.",
        "Switch to Per user: the chips recount over users (no never in scope chip - no user can carry that verdict), and the suggestions become UPNs.",
        "Clear the search from inside the empty state: the input empties too, not just the internal state.",
      ],
      files: ["index.html", "js/app.js"],
    },
    {
      n: 34,
      title: "CIS Benchmark Help section",
      tools: ["CIS Benchmark"],
      builds: [25079],
      risk: "low",
      what: "The Help section written for 📐 CIS Benchmark, held back from production because the tool is beta-only — a Help entry for a tile nobody has would be a lie.",
      why: "NOT promotable on its own — 📐 CIS Benchmark is beta-only, and a Help entry for a tile nobody has is a lie. It travels with the tool whenever that graduates.",
      test: [
        "Not testable in production until \ud83d\udcd0 CIS Benchmark itself graduates \u2014 the Help entry describes a tile that is not there. On beta: open \u2753 Help and confirm the CIS section is in the table of contents, that every control number it quotes exists in the tool, and that its licence caveat matches what the tool actually does on a tenant without Entra ID P2.",
      ],
      files: ["index.html"],
    },
    {
      n: 24,
      title: "📖 Baseline usage guide (R05)",
      tools: ["Baseline guide"],
      builds: [25063, 25065, 25069],
      risk: "low",
      what: "New beta-only tool: the deployment order as six steps with the reason for each, and a 🔎 Read-the-tenant readiness check per step (baseline groups, restricted units, locations, strengths, contexts, terms of use, exact missing policies, state tally). A policy count such as 93/99 names the six missing CA policies and uses the Baseline tool's number-clash-safe matcher. Pure reads plus one on-demand scope (Agreement.Read.All). New js/guide.js plus tile, screen and wiring.",
      why: "Reads only and self-contained, but it EXPLAINS the baseline — wrong prose is worse than no prose, so it graduates once the step texts have survived a few real deployments.",
      test: [
        "On a tenant with NO baseline deployed: open \ud83d\udcd6 Baseline guide \u2192 \ud83d\udd0e Read the tenant. Every step must report itself as not ready, naming the missing groups, units, locations and policies rather than showing a bare count.",
        "On a tenant with the baseline fully deployed: every step must report ready, and the per-persona policy coverage must match what \ud83e\uddec Baseline Policies reports for the same tenant. If the two disagree, the guide is wrong \u2014 it uses the Baseline tool's own matcher precisely so they cannot.",
        "Decline the Terms of use consent when it is asked for: the step must read \u201cnot read\u201d, never an empty list presented as \u201cnone\u201d.",
        "Read the six step texts end to end against a deployment you have actually run. This item's risk is the PROSE \u2014 a wrong reason for a step is worse than no reason, and it is the only part no automated check can catch.",
      ],
      files: ["js/guide.js", "js/app.js", "index.html", "js/version.js"],
    },
  ],

  // Deliberately NOT promoted. Every entry here must be something that EXISTS
  // on beta and is not going to production — it is still part of the gap, just
  // a permanent part of it. Something that has already shipped is not a
  // difference between the channels and belongs in neither list: it goes in
  // js/changelog.js and nowhere else. This section is the diff, not a history.
  staying: [
    {
      title: "🚚 This promotion queue",
      why: "Beta-only by design — js/promote.js and the Help section that renders it exist to describe the gap, so they have no meaning in production.",
    },
    {
      title: "📐 CIS Benchmark",
      why: "Stays on the beta channel until its verdicts have been checked against enough real tenants. Scoring a tenant against a benchmark is the kind of output people quote in an audit, so it graduates late rather than early.",
    },
  ],
};
