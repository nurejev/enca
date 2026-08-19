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
  productionBuild: "v1.0.289",

  items: [
    {
      n: 70,
      title: "\ud83d\udd0d Gap analyse: the coverage flow (T03)",
      tools: ["Gap analyse"],
      builds: [25159],
      risk: "low",
      what: "A five-stage funnel above the Gap analyse results \u2014 in scope \u2192 targeted by an active policy \u2192 covered by an ENFORCED one \u2192 required to do MFA \u2192 licensed for what they are targeted by \u2014 with every bar drawn against the same denominator and every drop clicking through to exactly those users. Analyzer.coverage() is pure over the report; the drop predicates are shared between the count and the list filter so the two cannot disagree. The licence stage reads its own data (assignedLicenses on the /users select the tool already does, plus /subscribedSkus) and derives the verdict from LicGap.licenceOf, which is extracted from the \ud83c\udfab Licence gap wiring in the same commit so both tools share one definition of \u201clicensed\u201d. Demo data gains SKUs and licence records. Also in this build: every promotion-queue row carries a test checklist.",
      why: "Reads only, and additive \u2014 nothing existing changes behaviour, and the Licence gap refactor moves no logic, only its home. The risk is that a number is WRONG rather than that something breaks: a coverage funnel is the sort of screen a customer screenshots into a board pack, so a stage measured against the wrong base is worse than no funnel. That exact bug happened in the first draft (the licence stage measured against MFA instead of targeted) and is what the test steps below are shaped around.",
      test: [
        "Demo mode (?demo=1) \u2192 \ud83d\udd0d Gap analyse \u2192 Run analysis. The funnel must render five rows, the first reading 8 / 100% and labelled as the denominator.",
        "THE ONE THAT MATTERS: click each row that shows a drop and count the rows in the list below. The list length must equal the \u2212n on the row \u2014 if a stage is measured against the wrong base these disagree, which is the bug this feature already had once.",
        "Click the same row again: the filter clears and the list returns to every user. A row showing no drop must not be clickable at all.",
        "Check the funnel's MFA drop against the \u201cNo MFA from CA\u201d card: they SHOULD differ on a tenant with untargeted users \u2014 the card counts everyone without MFA, the funnel counts only those a policy reaches. If they are always equal, the drop predicate has been collapsed into the card's.",
        "THE OTHER ONE THAT MATTERS \u2014 and it cannot be run in demo: on a REAL tenant, check the licence row is not 0. The first implementation resolved users through /directoryObjects/getByIds, which ignores $select, so every user came back with no licence fields and the stage reported \u201cnobody is licensed\u201d as a successful read. Demo fixtures hid it. Then run \ud83c\udfab Licence gap in the same session and compare who each tool calls licensed \u2014 they go through one function now, so any disagreement means that sharing was undone.",
        "Export the HTML report while a coverage drop is selected. The scope line must NAME the filter (not read \u201cfiltered:\u201d and stop), and the funnel inside the file must describe the whole run \u2014 if its first row equals the drop count, the subset has become its own denominator. Search the file for the word \u201clic\u201d: per-user licence entitlement must not be in the embedded JSON.",
        "Pick a group in the \ud83d\udc65 filter, then click a coverage drop: the group filter must CLEAR, so the list length still matches the \u2212n. Re-apply it afterwards and the note under the funnel must say the list is filtered further.",
        "KNOWN GAP: demo mode has no risk-based policy, so needsP2 is false for every demo user and the P2 branch of the licence stage is never taken there. Exercise it on a tenant that has a sign-in-risk or user-risk policy \u2014 a user targeted by one who holds only P1 must appear in the licence drop.",
        "Sign in as an account that cannot read /subscribedSkus (or block it in devtools): the licence row must say NOT READ, the other four stages must be unaffected, and nothing may throw. A zero there instead of \u201cnot read\u201d is a wrong answer, not a missing one.",
        "Run a scoped analysis (Scope \u2192 Only these users or groups). The denominator must be the named principals' members, not the tenant \u2014 the scoped-run banner and the funnel must be telling the same story.",
        "On a tenant with guests: the note under the funnel must report them as having no licence record rather than counting them as licensed. Guests are outside member licensing.",
        "Narrow the window to phone width: the bar takes the full width with the counts above and the drop below, and nothing overflows.",
      ],
      files: ["js/analyze.js", "js/licgap.js", "js/app.js", "js/demo.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 67,
      title: "\ud83c\udff7 A tenant's own groups can go in the persona vaults (R28)",
      tools: ["Restricted AUs", "Protect exclusions", "Import", "Conditional Access groups", "Create documentation"],
      builds: [25153, 25155],
      risk: "medium",
      what: "New module js/camap.js: a per-tenant group \u2192 persona mapping held in localStorage under the tenant id, with JSON export/import. Group routing everywhere now goes through CaMap.codeOf (tenant mapping first, Rmau.codeForGroup second) \u2014 rmauTarget in \u2465 Protect, the persona chips, \uff0b Bulk add, ruBaselineGroups and Importer.fixedCode. Editor panel \ud83c\udff7 Group personas in \ud83d\udee1 Restricted AUs with an unmapped-group scan (resolves the group ids the loaded policies reference via /directoryObjects/getByIds). Mapped groups are read by id for the bounded prefix scans. The mapping is printed in the \ud83d\udee1 Markdown report and in the restricted-unit pages of \ud83d\udcc4 Create documentation. 25155 adds what 25153 left out: the \ud83d\udce5 Import home-tile tag, and per-tool version bumps for the three tools that changed behaviour without moving (\ud83d\udd12 Protect 1.7, \ud83d\udc65 CA groups 4.2, \ud83d\udcc4 Create documentation 1.6). Promote both builds together.",
      why: "MEDIUM because it changes where a WRITE puts a group: \u2465 Protect and \uff0b Bulk add place group objects into restricted administrative units, and a vault is an authorisation boundary \u2014 the wrong one hands a persona's scoped administrator another persona's exclusions. Nothing is inferred (exact id or exact display name only) and an empty mapping leaves every existing routing decision byte-for-byte as it was, so the risk is entirely in what an operator states. HELD BACK from production 287 for exactly that reason, while the seven items around it went: it is the only change in that batch that alters where a WRITE puts a group object. It graduates once a real tenant has mapped a group and the placement has been eyeballed in the unit afterwards. Note for promotion: R28 was reverted once at build 25100 for storing the mapping in each unit's description \u2014 this build writes nothing to the directory at all.",
      test: [
        "Sign in to a tenant that has an exclusion group with NO CA number in its name (create one \u2014 e.g. SEC-VIP-Exceptions \u2014 if none exists). Open \ud83d\udee1 Restricted AUs \u2192 \ud83c\udff7 Group personas \u2192 \ud83d\udd0e Find the unmapped groups: the group must be listed. A group your policies do not reference will NOT be listed, and that is correct.",
        "Map it to a persona, then open \ud83d\udc65 CA groups \u2192 \u2465 Protect: its row must show the persona's vault as the destination and carry the \u201cmapped here\u201d chip. Before mapping, the same row must read \u201cunmapped\u201d \u2014 not be silently absent.",
        "THE ONE THAT MATTERS: actually run \u2465 Protect on that group and then open the unit in \ud83d\udee1 Restricted AUs. The group must be in the vault you named and in no other. This is the check the item is held for \u2014 a vault is an authorisation boundary, so a wrong placement hands one persona's scoped administrator another persona's exclusions.",
        "Open \uff0b Bulk add on that persona's unit: the mapped group must be offered (it is read by id, not by the CAB-SEC prefix scan). Rename the group in Entra and repeat \u2014 it must still be offered, because the mapping stores the object id.",
        "Type a name into the add box that matches no group, and one that matches two: the first records a name-only entry (the panel says so), the second must refuse rather than guess.",
        "Export the mapping to JSON, clear it, import it back with both Replace and Merge. Counts must match, and a persona code this build does not have must be skipped with a reason rather than silently dropped.",
        "Open \ud83d\udcc4 Create documentation with the restricted-unit pages and confirm the mapping appears in the appendix; the same in \ud83d\udee1 Restricted AUs \u2192 Export MD.",
        "Open the tool in a private window: the panel must say outright that storage is refused and the mapping will not survive the tab, rather than appearing to save.",
      ],
      files: ["js/camap.js", "js/app.js", "js/import.js", "js/rmau.js", "js/rmaudoc.js", "index.html", "js/version.js"],
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
