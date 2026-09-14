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
// `carveout` — OPTIONAL, and the only field here that is an INSTRUCTION rather
// than a description. Write it when the item does not port verbatim: when the
// beta copy of a file deliberately says something the production copy must
// not. The self-hosting package (92) is the case that created this field — its
// docs, scripts and ARM template point at the `beta` branch and the `:beta`
// image so the feature is testable BEFORE promotion, and a straight copy to
// main would ship a production page telling people to pull beta.
//
// It renders in the queue and, more importantly, in the exported order, where
// the working session actually reads it. Say exactly what to rewrite and what
// to delete, and end with the grep that proves the port was complete — a
// carve-out you have to reconstruct from memory is one you will get wrong.
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
// beta-only (R01 and R51 today, whose tools have not been promoted), or somebody skipped
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
// `group` — OPTIONAL. Items that BELONG TOGETHER for promotion without being
// one change: a tool and the Help section written for it, a feature and the
// three follow-up fixes it grew on beta, the R28 run of 61-69. Give each of
// them the same group id and describe the group once in PROMOTE.groups below.
// The queue then renders them as ONE block with one tick — ticking the group
// ticks every member — and every member keeps its own tick, so one can be
// held back from the batch (R28 held 67) without losing the batch. A NUMBER
// says "never apart"; a GROUP says "usually together, and here is the list
// so nobody has to reconstruct it". The exported order names a group that
// goes out incomplete, member by member, so a deliberate hold-back reads as
// one rather than as an item somebody forgot to tick.
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
  productionBuild: "v1.0.311",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
  },

  items: [
    {
      n: 186,
      title: "\ud83e\udde9 One tool, one title \u2014 toolHead, and seven tools stop changing theirs (all tools, R57)",
      tools: ["All tools"],
      builds: [25352],
      risk: "medium",
      what: "js/version.js: each registry entry gains head (the title) and chips (its chip texts); HEAD_CHIP maps a chip's text to its class; headEsc, headChip, toolHeadTail, toolHeadInner and toolHead build the line; toolNo moves here from js/app.js's closure, because toolHeadTail runs before app.js. js/app.js: 52 head assignments now call toolHead instead of writing an h3, CI_IDLE_HEAD with them; the HEAD_TOOL map, stampHeadVersion and the 33 MutationObservers are deleted and replaced by a one-shot pass over data-tool-head. js/cischeck.js, js/exclusions.js, js/gapcheck.js, js/mslearn.js: their renderSummary title calls toolHead. js/baseline.js, js/cagroups.js: their data-driven titles keep composing and gain toolHeadTail. index.html: the two static heads become empty h3 elements carrying data-tool-head.",
      why: "Medium because it touches the render path of every tool, not because the change is deep: the line is the same line, from one place instead of 53. What a reader will actually notice is the fix \u2014 seven tools stop dropping a chip while they work, and \ud83d\udcdc Terms of use stops having three titles. The risk to look for is a tool whose head renders EMPTY (its registry entry has no head field) or DOUBLE-CHIPPED (a literal chip left behind next to a registry one). Both were checked across all 31 registry entries and all 33 screens in a browser before this landed, and the static check below is how you re-establish it rather than trust it. No per-tool version was bumped: no tool's own behaviour, read or output changed, only the shared line above it.",
      test: [
        "Open every tool from the sidebar. Each opens with its title, its chips and T-number \u00b7 version at the end of the line \u2014 none empty, none showing a chip twice. \ud83e\uddec Baseline still names its catalog and release in the title, \ud83d\udc65 CA groups still names the tenant, and both now carry their number.",
        "The fix, on a real tenant where the read takes a moment: open \ud83c\udf10 Named locations (or \ud83c\udfab Authentication contexts, \ud83d\udcaa Authentication strengths, \u267b Recycle bin, \ud83d\udee1 Restricted AUs) and watch the head WHILE it reads \u2014 the writes-to-tenant chip stays. Before this build it appeared only once the read finished.",
        "\ud83d\udcdc Terms of use: reading, loaded, and failed all show the same line \u2014 BETA and writes to tenant. It showed three different lines before.",
        "\u26a1 CA validator while it generates simulations: the NEW chip stays.",
        "Force a failure (sign in without the permission a tool needs): the head still shows the full title and chips above the error line, not a bare error.",
        "\ud83d\udd12 Protect exclusions and \ud83d\udd0d Gap analyse's intro card: both heads are written into index.html as empty h3 elements and filled at startup. Confirm both read correctly and carry their number; if app.js ever fails to run these two are blank, which is the deliberate cost of not keeping a second copy of their chips.",
        "Search the source for a head still writing its own title: node -e on js/app.js finding an h3 within 900 characters after a $(xxHead) reference should return none. Only the two data-driven module titles remain as literals.",
        "\ud83d\udd22 Tool numbers in Help and the sidebar numbers are unchanged \u2014 toolNo moved file but not behaviour.",
        "Open a tool, switch its tab strip, come back: the head re-renders and still carries exactly one stamp. There is no observer to loop now, so a doubled stamp would mean a renderer appending the line twice.",
      ],
      files: ["js/version.js", "js/app.js", "js/baseline.js", "js/cagroups.js", "js/cischeck.js", "js/exclusions.js", "js/gapcheck.js", "js/mslearn.js", "index.html"],
    },
    {
      n: 185,
      title: "\ud83e\uddf1 One frame for every tool screen \u2014 slot order, spacing in CSS (all tools, R57)",
      tools: ["All tools"],
      builds: [25351],
      risk: "medium",
      what: "css/app.css: THE TOOL SCREEN FRAME and THE SLOT ORDER blocks \u2014 .screen.tool owns the margins of its head card, toolbar and .tool-body; .toolbar children carry order values (tabs -1, find 1, scope 2, filter 3, window 4, extras 5, actions 6); .toolbar > .search drops flex:1 for width clamp(200px,26%,320px) with the action group taking the slack; .wi-f.tb-win and .wi-f.tb-scope get the row direction six inline styles used to give them; Inter removed from the body stack. index.html: all 33 tool sections gain class screen tool, 96 inline margin-top styles removed, the result div of each gains class tool-body, the five range or window labels gain tb-win and cgScopeWrap gains tb-scope (the six inline flex styles go with them), and the toolbars of \ud83d\uddc2 \ud83d\udeaa \ud83d\udc65 \u26a1 \ud83d\udccd \ud83d\udd53 \ud83d\udea6 \ud83c\udf9a are reordered so the markup matches the contract. New: tools/check-toolbar-order.js. Roadmap R57.",
      why: "Medium not for what it does but for how wide it is: no tool's behaviour, read, verdict or export changes, and no control was added or removed \u2014 but the markup of all 33 tool screens moved, and eight of them had two controls swap position. The risk is a screen whose JavaScript reaches a toolbar child by position rather than by id; nothing found does, and the checker plus the browser pass below are how that is established rather than assumed. The visible change somebody will notice: the find box is narrower than it was on a wide window, because it no longer stretches.",
      test: [
        "node tools/check-toolbar-order.js \u2014 exits 0 and reports 33 tool screens, 31 toolbars, every one in slot order. It also notes the four screens build 25353 fixes: \ud83d\udc65 CA groups and \ud83e\udd25 Apps with no service principal have no toolbar id, \ud83d\udd12 Protect exclusions and \ud83d\udc65 Group usage have no toolbar.",
        "Open every tool from the sidebar on a wide window: the find box is the same width and starts at the same x on all seventeen screens that have one, the segments sit immediately right of it, the chips right of those, the range picker right of those, and the actions hard right. Repeat at about 1100 and about 820 pixels \u2014 the row wraps but the order does not change.",
        "Tab from the find box on \ud83d\udea6 Sign-in log: focus goes Enforced/Report-only, then Sign-ins/Per policy, then the chips, then Range, then the export buttons \u2014 the same left-to-right order the eye reads. Before this build focus jumped from the chips back to the segments.",
        "\ud83d\uddc2 Policies and \ud83d\udc65 CA groups hide a toolbar control until it is needed (the Back button, the tab segment, the CSV file input). Open each, switch views, and confirm the control appears in its slot rather than at the start of the row.",
        "The eight hosts still mount their tab strips on its own row above the controls: \ud83d\uddc2 \ud83d\udd0d \ud83d\udea6 \ud83d\udd53 \ud83d\udee1 \ud83e\uddec \ud83d\udd2e \ud83d\udd75. Opening \ud83d\udd0d Gap analyse and then \ud83d\uddc2 Policies still takes the Gap strip back out.",
        "Spacing: the gap between head card and toolbar, and between toolbar and result, is 14 pixels on every tool screen. Three screens were tighter than that before (\ud83d\udeaa Exclusion analyzer, \ud83e\uddec Baseline, \ud83d\udc65 CA groups had no gap at all) and now match the rest.",
        "On a phone the find box is full width and the row stacks; no toolbar scrolls sideways.",
        "The sign-in screen, the loading screen, the home grid, \u2753 Help, \ud83d\uddfa Roadmap and the changelog do NOT carry class screen tool and are visually unchanged \u2014 check the Help table of contents still lines up and the roadmap cards still sit in their eras.",
        "Fonts: with Inter NOT installed locally the app looks the same as before (it was already falling back). On a machine that DOES have Inter installed, text is now the system font instead of Inter \u2014 intended, and the reason is that the app never shipped the file.",
      ],
      files: ["index.html", "css/app.css", "tools/check-toolbar-order.js", "js/version.js"],
    },
    {
      n: 170,
      title: "🫥 Apps with no service principal — new tool (T39 0.1, R51)",
      tools: ["Apps with no service principal"],
      builds: [25335],
      risk: "medium",
      what: "js/spgap.js (pure): analyze({ summary, spIds, raws, names, records }) diffs auditLogs/signInEventsAppSummary rows against the service-principal appIds, per app impactOf() via WhatIfEval.evaluate with an All-users scenario (will / may with why / wont), phantomIn from excludeApplications, evidenceOf() = newest raw sign-in record for the appId with its applied policies; verdict blocked / enforced / maybe / uncovered; renderTiles (wo-vt tiles), renderTable, toMd, toCsv. js/app.js sg* block after the T38 block: preConsent(SI_READ), ggetAll summary + servicePrincipals?$select=appId, evidence on request via the shared readSignInWindow(7) or a window already in logCache, chips/search, MD/CSV. index.html tile (Analyse section, BETA + only here), screen-spgap, Help section, roadmap R51, script tag. Demo: DEMO_DATA.signInAppSummary + servicePrincipalAppIds (two apps without an SP).",
      why: "Medium: a new tool with one new Graph endpoint (beta, documented on Learn: AuditLog.Read.All, Reports Reader / Security Reader, fixed 30 days, $filter on appId/signInCount). Two things to confirm on a real tenant before it graduates: (1) the summary really tops out at 1,000 rows (upstream's observation — the tool says “capped” at 1,000 and nothing more); (2) how a sign-in from an app with no SP shows in appliedConditionalAccessPolicies (the evidence column). The impact column is only as good as the What-If engine's scenario: All users, no device, no location — every conditional policy lands in “may apply” by design, never in “would apply”. Deliberately not ported: upstream's generated Register-MissingServicePrincipals.ps1.",
      test: [
        "Demo tenant (?demo=1): the tool lists Microsoft Authentication Broker (37 sign-ins, Microsoft tag, excluded by nothing) and an Unknown app 7f3a1c2e… (12); Exchange Online and Teams do NOT appear (they have a service principal); the all-zero id is dropped. Tiles read 2 apps.",
        "Real tenant, Reports Reader: ▶ reads in seconds; devtools shows one GET auditLogs/signInEventsAppSummary and the servicePrincipals pages. Compare the app count with Get-MgBetaAuditLogSignInEventAppSummary | ? { -not (Get-MgServicePrincipal -Filter \"appId eq '$($_.AppId)'\") }.",
        "Consent to one of the listed apps in the portal (or New-MgServicePrincipal -AppId), ⟳ Rescan: it disappears.",
        "Exclude one of the listed ids from a policy: the row shows the policy under Excluded by, the Phantom tile counts 1, and 🚪 Exclusion analyzer flags the same id as a phantom exclusion.",
        "📖 Read evidence: the newest sign-in column fills for apps in the last 7 days with the CA status and the applied policies; an app older than 7 days reads “not in the loaded window”. Open 🚦 first with a 7-day window, then this tool: evidence is there without a second read.",
        "Tenant where AuditLog.Read.All is refused: the tool explains and stops; nothing else breaks.",
        "A tenant with more than 1,000 apps in the summary: the tile says capped and the footer says the tenant has more.",
        "Export MD renders in the report viewer; CSV has one row per app with the appId first.",
      ],
      files: ["js/spgap.js", "js/app.js", "js/demo.js", "index.html", "js/version.js"],
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

// ======================================================================
// THE PROMOTION ORDER (ported from TUNO, build 10444). The queue above grew
// tick boxes; this turns the ticked numbers into a small file Mihai hands to
// a working session as the promotion instruction.
//
// THE FILE IS THE ORDER, NOT THE VERIFICATION — it says which items to
// promote, with the machine-readable order embedded. The session that
// receives it still verifies every item against what main actually contains,
// because the header of this file says not to trust its own list, and that
// rule does not bend for a nicer file format.
//
// Two refusals, both deliberate. An export with nothing ticked is not an
// empty order, it is a mistake. And a tick whose item is no longer queued —
// it shipped since the tick — is named rather than quietly dropped: an order
// that silently shrank is the same lie as a range that silently shrank.
// ======================================================================
PROMOTE.buildOrder = function (pickedNs, appBuild) {
  const ns = [...new Set((pickedNs || []).map(Number))].sort((a, b) => a - b);
  if (!ns.length) throw new Error("Nothing is ticked — an empty order is not an order.");
  const items = ns.map((n) => {
    const it = (PROMOTE.items || []).find((i) => i.n === n);
    if (!it) throw new Error(`Item ${n} is not in the queue — it may have shipped since the tick. Untick it and export again.`);
    return it;
  });
  const when = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const L = [];
  L.push("# ENCA promotion order");
  L.push("");
  L.push(`Generated ${when} on ${appBuild ? appBuild.label : ""} · production is ${PROMOTE.productionBuild}`);
  L.push("");
  L.push(`PROMOTE ITEMS: ${ns.join(", ")}`);
  L.push("");
  L.push("For the working session: this file is the ORDER, not the verification.");
  L.push("Verify each item against what main actually contains before building");
  L.push("the production commit — the queue's own rule. Items promote together");
  L.push("where their builds interleave; the session decides the cut.");
  L.push("");
  // Groups: a batch that goes out whole is one line; a batch that goes out
  // incomplete names what is held back, so the session knows it is a
  // decision and does not "helpfully" port the rest.
  const gids = [...new Set(items.map((i) => i.group).filter(Boolean))];
  for (const gid of gids) {
    const g = (PROMOTE.groups || {})[gid] || { title: gid };
    const members = (PROMOTE.items || []).filter((i) => i.group === gid).map((i) => i.n).sort((a, b) => a - b);
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`GROUP ${gid} — ${g.title}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
  }
  // Tool batches (25319): the queue folds items on the same tool under one
  // row whose tick takes them all, so a tool's run going out with a member
  // held back is the same kind of decision as an incomplete group — name it,
  // so the session does not port the missing version "for completeness".
  // Same home rule as the queue: first tool, or "Several tools" at three+.
  const all = PROMOTE.items || [];
  const gc = {}; all.forEach((i) => { if (i.group) gc[i.group] = (gc[i.group] || 0) + 1; });
  const homeOf = (i) => (i.group && gc[i.group] > 1) ? null : (((i.tools || []).length >= 3) ? "Several tools" : ((i.tools || [])[0] || "Several tools"));
  const homes = [...new Set(items.map(homeOf).filter(Boolean))];
  for (const h of homes) {
    const members = all.filter((i) => homeOf(i) === h).map((i) => i.n).sort((a, b) => a - b);
    if (members.length < 2) continue;
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`TOOL ${h}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
  }
  if (gids.length || homes.length) L.push("");
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
    if (it.group) L.push(`- group: ${it.group}`);
    L.push(`- files: ${(it.files || []).join(", ")}`);
    // A carve-out is the one thing in this file that is an instruction rather
    // than a fact: the item does NOT port verbatim, and the port is wrong if
    // this line is not read. It goes above the files for that reason.
    if (it.carveout) L.push(`- CARVE-OUT: ${it.carveout}`);
    L.push("");
  }
  L.push("```json");
  L.push(JSON.stringify({ order: ns, generated: when, betaBuild: appBuild ? appBuild.build : null, productionBuild: PROMOTE.productionBuild }));
  L.push("```");
  return { filename: `enca-promotion-order-${when.slice(0, 10)}.md`, text: L.join("\n") };
};
