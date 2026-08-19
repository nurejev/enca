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
      n: 77,
      title: "🗣 User impact brief — the rollout email, written by the tenant itself",
      tools: ["User impact brief"],
      builds: [25169],
      risk: "low",
      what: "New tool (T32, beta-site only): derives the end-user communication from the deployed policies — what people will notice and what will no longer be possible, per audience, with live now / staged / at go-live taken from the policy states and every statement backed by the named policies. Audience filter, Markdown export via the report viewer, text-based Word export built client-side with JSZip. Reads only the policies already in memory; no Graph calls, no writes.",
      why: "Read-only over data every other tool already holds, so the risk is wrong WORDS rather than wrong writes: a detection rule that mislabels a policy produces a sentence the comms team repeats to the whole company. Graduates when the statements have been checked against a real tenant's policy set by someone who knows what that tenant actually enforces.",
      test: [
        "On a tenant with the persona baseline loaded, open the tool from the home tile: it renders without a run button, and the header counts match List Policies (total / enforced / report-only / prepared).",
        "Every statement carries at least one policy name; click one - the policy card opens, and its configuration visibly supports the sentence (e.g. the legacy-auth statement points at a Block with ActiveSync/Other client apps).",
        "On a tenant where some policies are enforced: those statements carry the live-now chip and sit under Already live today in the Markdown; everything backed only by Off policies reads at go-live. No statement backed solely by Off policies may claim to be live.",
        "Audience filter: pick Guests - only guest statements remain; service accounts, workload identities and E-Admin lockdowns appear NOWHERE regardless of filter.",
        "Export MD: the report viewer opens, the download is a .md whose appendix names the same policies as the cards on screen.",
        "Export Word: the .docx opens in Word without a repair prompt, headings and bullets intact, and its content matches the Markdown.",
        "On a tenant with NO user-facing policies (or before sign-in data is loaded): the tool says no user-facing policies detected rather than rendering an empty page or throwing.",
      ],
      files: ["index.html", "js/app.js", "js/userimpact.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 76,
      title: "\ud83d\udd0d Gap analyse gets a way out that says what it does",
      tools: ["Gap analyse", "List Policies"],
      builds: [25168],
      risk: "low",
      what: "Gap analyse renders inside the List Policies screen. That screen's Cards / List / Matrix picker stayed visible over it with none of the three highlighted, and it switched away from Gap analyse rather than within it. It is hidden there now, replaced by a single \u2190 Back to policies button that returns to whichever view you came from \u2014 which also has to exist, because the green action bar is hidden in this view too, so the picker was the only exit.",
      why: "A view picker with nothing selected reads as broken, and its Matrix button means the policies-by-settings grid while Gap analyse's own Matrix tab means users by policies: two buttons with one label on one screen. Nobody loses data over it, but it is the kind of thing that makes a reader distrust the rest of the screen.",
      test: [
        "From List Policies in Cards view, click Gap analyse: the Cards / List / Matrix picker disappears and one button reads Back to policies. Click it - you land on Cards, with Cards highlighted again.",
        "Repeat from List and from Matrix: Back returns you to THAT view, not to Cards.",
        "Open Gap analyse from the home tile instead: Back still lands on a policy view (the last one used, or Cards) and never on a blank screen or on Gap analyse itself.",
        "While Gap analyse is showing: no policy search box, no state chips, no select-all, no green action bar - and exactly ONE Matrix button on screen.",
        "Run an analysis, switch to its own Matrix tab, then Back to policies and re-enter: the tool's own Users / Matrix tabs still work and still say Run the analysis first before a run.",
        "Narrow the window until the toolbar wraps to two rows, then leave Gap analyse: the green action bar still sits below the toolbar rather than over it (syncSelbarTop measures the wrapped height).",
      ],
      files: ["index.html", "js/app.js"],
    },
    {
      n: 75,
      title: "\ud83d\udeab Disable nesting is opt-in until it is GA",
      tools: ["CA groups", "Import", "Assign groups"],
      builds: [25166],
      risk: "high",
      what: "Every create path stops asking for disableNesting by default; it is a tick in \u2460 Create and \u2461 Build a group manually instead, and CaGroups.NESTING_GA flips the default back in one line when Microsoft ships it. The request goes to v1.0, the only version whose documentation names the property. A \u201cRequest_BadRequest \u2014 unexpected request made to property\u201d refusal is recognised as \u201cthis tenant has not got the feature\u201d, reported as such, and remembered for the session. \u2467 Disable nesting no longer offers its destructive recreate in that case, and \ud83d\udce5 Import stops selecting the property in the batch that finds a file's groups.",
      why: "PRODUCTION IS AFFECTED TODAY. Since build 284 every create path sets disableNesting by default, and on a tenant whose directory does not carry the property Graph refuses the field outright \u2014 so every single group created ends in a red failure for a security setting the panel promised in small print. Worse, that failure text sends the reader to \u2467 Disable nesting, which retries the same call and then offers to RECREATE the group: a rename-aside and rebuild that sets the property at creation, which is exactly the request that just failed. A destructive dead end, recommended by the product. Also fixes \ud83d\udce5 Import reporting a tenant's existing groups as absent when the property makes its lookup 400.",
      test: [
        "Demo mode, CA groups 2 Build a group manually: the PREVIEW tick is present and UNTICKED. Create without ticking - the result says nothing about nesting at all (no green line, no red one).",
        "Same panel, tick it and create: the result reports nesting disabled.",
        "REAL tenant that refuses the property: tick it and create. The group is still created; the result says the tenant does not recognise the property and does NOT call it a failure. The tick then goes disabled, reading Unavailable in this tenant, for the rest of the session.",
        "After that refusal, open 1 Check and use a group's 8 Disable nesting: it refuses up front, offers NO recreate button, and the report points at a restricted management administrative unit.",
        "On a tenant that HAS the property: tick and create, then check the network tab - the disableNesting PATCH and read-back go to graph.microsoft.com/v1.0, not /beta. Result reports nesting disabled.",
        "Import preflight on a tenant WITHOUT the property: the recycle panel must still list the file's groups that exist here. If it says none of them exist, the batch is still selecting disableNesting - that is the bug this fixes. Nesting shows as not reported.",
        "7 Migrate: the Disable nesting on the new group box is unticked by default.",
        "Consent: create a group WITHOUT ticking nesting - Group-NestingSupport.ReadWrite.All must not be requested.",
      ],
      files: ["js/cagroups.js", "js/assign.js", "js/app.js", "index.html"],
    },
    {
      n: 74,
      title: "🎫 Licence gap: finish the user read on big tenants",
      tools: ["Licence gap"],
      builds: [25165],
      risk: "medium",
      what: "On a 32k-member tenant the exact gap tile sat next to a named list covering only the ~20k users the capped read reached - two numbers that read as a contradiction. The per-pass cap rose to ~50k, the partial chip states first N of M users read, and a Read-the-remaining-users button continues the read from its saved nextLink, judges new users via the same shared mapper as the first pass, and re-analyzes in place (admin exclusions and a done mailbox check survive). Bounded per click.",
      why: "The one risk worth eyes: the continuation must never double-count (it resumes the nextLink, never restarts) and must never present a still-partial list as complete. Large-tenant behaviour cannot be exercised in demo mode.",
      test: [
        "Demo mode: no partial chip, no read-the-remaining button anywhere - the demo user list is complete.",
        "REAL big tenant (>50k members, or temporarily lower LG_USER_PAGES to 2 to force it): after a run, the bars card shows the partial line with first N of M and the button naming ~(M-N).",
        "Click it: the button reads counts live, then the gap lists GROW while the gap tiles stay the same numbers as before the click - the tiles were exact all along; only the naming completes.",
        "THE ONE THAT MATTERS: sum check after finishing the read - the named P1 list length plus the licensed-targeted count should now be within not-classifiable of the targeted tile; before the fix the list was missing exactly the unread users.",
        "Set a mailbox check and an admin-group exclusion BEFORE clicking read-the-remaining: both must survive the re-analysis (chips keep their counts, newly read users show not checked in the Mailbox column rather than inheriting a verdict).",
        "Click the button twice quickly: one continuation runs, not two (busy guard).",
        "On a tenant that fits in one pass: no button, no partial chip, everything as before.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 73,
      title: "🎫 Licence gap: one run button",
      tools: ["Licence gap"],
      builds: [25164],
      risk: "low",
      what: "The toolbar's duplicate Count the gap became Rescan and renders only once a result exists to redo (the Change audit shape); the first run stays with the big button in the run prompt. Visibility is set in renderLicGap and while a run is in flight, so a mid-run tab switch cannot resurrect it.",
      why: "Pure UI dedupe on a tool already in production - two identical primary actions on one screen is a small confusion with a one-line fix, but the visibility logic is worth eyes: a button that reappears mid-run would fire a second concurrent read.",
      test: [
        "Open 🎫 Licence gap before any run: the toolbar shows only Export MD, and the run prompt carries the single Count the gap button.",
        "Run it (demo mode is fine): once results render, the toolbar shows Rescan and the prompt is gone.",
        "Click Rescan: the busy panel appears and Rescan disappears for the duration - switch to another tool tab and back mid-run, it must still be hidden - then returns with the fresh result.",
        "Export MD before ever running: the run-first toast, nothing else.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
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
