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
  productionBuild: "v1.0.294",

  items: [
    {
      n: 87,
      title: "\ud83d\udde3 The brief is tied to the baseline revision it was written against",
      tools: ["User impact brief", "Baseline Policies"],
      builds: [25185],
      risk: "medium",
      what: "T32's rules carry RULES_CHECKED_AGAINST, the bundled baseline revision they were last verified against. When the loaded catalog is newer, the brief warns on screen \u2014 naming both dates and linking T10 \ud83e\uddec Baseline Policies \u2014 and the same caveat is written into the Markdown and Word exports, because a brief handed to people outlives the screen it came from. js/baselineData.js now tells whoever bumps `revised` to walk the rules first. A missing or older catalog is treated as fine, not as a warning.",
      why: "This is the failure that produced item 86, generalised. The rules match on POLICY SHAPE; the catalog decides what shape a requirement is written in. Revision 2026-08-20 moved CA205 and CA301 from a compliant-device grant to a block with a device filter, and the brief stopped covering either without anything anywhere saying so. Nothing connected the two, so the next catalog revision would do it again \u2014 and the output is the one written to be handed to end users.",
      test: [
        "Normal case: catalog revision equals RULES_CHECKED_AGAINST, so T32 shows no warning and the exports carry none.",
        "Edit BASELINE.revised in js/baselineData.js to a later date and reload: T32 shows the amber warning naming both dates, with a working link to Baseline Policies.",
        "Export MD and Word in that state: the caveat is directly under the title, not buried at the end.",
        "Put the date back: warning gone from screen and both exports.",
        "Set BASELINE.revised EARLIER than the rules date: no warning - an older catalog is not a reason to distrust the wordings.",
        "The warning must never appear because a catalog failed to load; T32 works with no baseline present at all.",
      ],
      files: ["js/userimpact.js", "js/baselineData.js", "js/app.js"],
    },
    {
      n: 86,
      title: "\ud83d\udde3 The brief was missing every device requirement written as a block",
      tools: ["User impact brief"],
      builds: [25184],
      risk: "high",
      what: "The company-device item matched only a compliantDevice GRANT, and explicitly excluded blocks. Entra has no grant control for require Entra joined \u2014 only compliantDevice and domainJoinedDevice exist \u2014 so the baseline writes that requirement as a BLOCK on everything the device filter does not cover. Those policies are now matched too, folded into the same item per audience, with the text naming whichever consequences apply. domainJoinedDevice is recognised as a grant for the first time. Filter DIRECTION is honoured, so a block aimed AT company devices is not mistaken for one requiring them.",
      why: "In production the brief tells people what to expect at go-live, and it silently omitted three of the baseline's device requirements \u2014 CA205 and CA301 (blocked unless Entra joined or hybrid joined) and CA309 (selected apps blocked unless compliant). A user reading it would be told their Mac must be enrolled and never told a Windows machine that is not joined is refused outright. It is the one output written to be handed to end users, so an omission reads as a promise.",
      test: [
        "Open T32 on a tenant carrying the baseline. The company-device item for Employees now lists CA205 alongside CA208, not CA208 on its own.",
        "The Externals audience gets its own company-device item listing CA301 and CA309.",
        "Read the item text: with both forms present it names BOTH consequences - enrolled and compliant, and refused outright if not joined. With only one form present it names only that one.",
        "Session policies that carry a device filter (CA005, CA007, CA202, CA206, CA214) must NOT appear in this item - they are session limits, not device requirements.",
        "CA215, the compliant-NETWORK block, must stay in its own Global Secure Access item.",
        "No policy appears twice across the whole brief.",
        "Export MD and Word: the same policies are listed there as on screen.",
        "A tenant with a policy blocking access FROM company devices (device filter include, positive rule) must not have it described as requiring one - the direction is the whole meaning.",
      ],
      files: ["js/userimpact.js"],
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
