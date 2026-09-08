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
  productionBuild: "v1.0.309",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
  },

  items: [
    {
      n: 136,
      title: "👥 CA groups 5.0: one list + drawer instead of seven tabs (T12, R48)",
      tools: ["Conditional Access groups"],
      builds: [25273, 25275, 25276, 25277, 25278, 25279, 25280],
      risk: "medium",
      what: "New js/groupsview.js (list, chips, bulk bar, drawer renderers) and a groups landing view in app.js. 25279: the list renders into #cgList and stays; #cgBody (the element every engine renders into and listens on) is MOVED by cgPlaceEngine into #cgOverlay (dialog, writes) or #cgSheet (sheet, members) and back, so engine code is untouched; #cgBar is the floating bar (fixed) and becomes the sheet header. Earlier: cgTab = groups by default, the tab strip hidden, engine screens reached from row / bulk actions with the selection carried across (cgGoTab, cgRmauPre / cgMigPre applied after their scans) and a ← Groups bar back. Drawer: members tree with add (existing cgAddMember via hidden group input) and remove (existing cgRemoveMember; new cgRemoveFromChild for nested groups), policies, protection, history (directoryAudits filtered on the group id). Tile blurb, Help and roadmap R48 rewritten.",
      why: "Every engine is unchanged, so the risk is in the routing and the reads: a bulk action that lands on the wrong screen, a pre-selection that does not stick, a member read that repeats. Graduates once one real tenant has been worked from the list end to end — create, protect, migrate, compare — without touching the old tabs, and the nested-remove confirm has been read on a real nested group.",
      test: [
        "Open 👥 on a real tenant: the list must appear after ONE scan (watch the network: no second scan when clicking rows, chips or tabs in the drawer). Status, used-by and protection columns must agree with the old ① Check table (still reachable: tick nothing, ⋯ → it opens the row popup).",
        "Click a row: its members must be read once and the drawer must show direct members first, then each nested group with ▸; expanding a nested group must list its members with × on each. Click the row again or another row: no re-read of a group already read.",
        "Drawer Members: add a user — the tree must update and only that group is re-read. × on a DIRECT member must confirm with the exclusion / include wording; × on a NESTED member must confirm naming the nested group and what else it feeds, and remove from the nested group (check in the portal).",
        "Tick two groups → ⊞ Compare selected: a SHEET must rise from the bar with the matrix for exactly those two columns (nesting view available) while the list stays visible and scrollable above it; tick a third row in the list — the matrix must gain its column; ✕ Close in the sheet header must return to the plain list with the ticks kept.",
        "Tick a group → 🧹 Migrate (and 🔒 Protect, ＋ Create, 📥 Import, 🎯 Assign): a DIALOG must open over the dimmed list; let Migrate finish its scan — the dialog header with ✕ Close must still be there; Esc must close it and the list must show the same ticks and open row as before. Scroll must be locked behind the dialog.",
        "Tick an unprotected exclusion group → 🔒 Protect in RMAU…: after ▶ Scan, exactly that group must be ticked (not the default set). Same for a role-assignable group → 🧹 Migrate.",
        "Missing filter → ＋ Create on a row: ② Create must open. Dangling filter → 🔁 Restore: the assign wizard must open with the restore action available. Deploy group → 🌊: Who is the wave to CA must open on that group.",
        "Drawer History → Read: the last 30 days of member adds / removes for that group must list who did it; decline AuditLog.Read.All: the tab must say so.",
        "Nesting: on a real tenant the ↪ Has nested groups chip must show a count right after the scan (no member read), the members column must say ↪ n nested groups on those rows, and a nested group inside an exclusion group must be in Needs attention. Open one: the drawer names the nested groups before the members are read.",
        "Scope All groups: every security group in the tenant appears (extras as not in the baseline); a tenant with more than 5,000 says 'first 5,000' in the head. Switching back to Used by CA policies re-scans.",
        "Click a row without ticking: the actions bar must appear naming the open row; 🧹 Migrate and 🔒 Protect from it must land on a RESULT (no Scan button) with that group ticked; Migrate must check ONLY that group (progress 1/1, a 'scoped' tag on the result) and the button on the tag must run the full check. ✕ on the bar with nothing ticked closes the drawer.",
        "Dark mode: the actions bar must be deep green with light text and readable buttons; the filter chips must have ink text and a visible border, the active chip lemon, Needs attention / Has nested groups red-toned and Not protected amber-toned even when idle; in ③ Compare the Members / Show nesting / Nested only switch must show a lemon key on a recessed track. Same in light mode.",
        "Scroll the list with a drawer open: the drawer header must stay below the toolbar, not under it.",
        "?demo=1: list of 24 rows, chips with counts, a present row opens a drawer with a member tree, policies tab shows CA001 On for CA002-Exclusion, compare / rmau / create routes and ← Groups come back with the ticks kept.",
      ],
      files: ["js/groupsview.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 135,
      title: "🔍 Gap analyse: T03 chip, no Back button (1.9.1)",
      tools: ["Gap analyse"],
      builds: [25270],
      risk: "low",
      what: "anIntro joins HEAD_TOOL so the Gap analyse header is stamped T03 · v like every other screen; the ← Back to policies button (1.9) is hidden — the tab bar already leads back.",
      why: "Cosmetic; the Back button removal changes one exit path. Graduates with the next port.",
      test: [
        "Open 🔍 Gap analyse: the header must read Gap analyse — Conditional Access impact with a T03 · v1.9.1 chip; no ← Back to policies button anywhere on the screen. Click the 📋 List policies tab: the cards view must come back.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 134,
      title: "👥 CA groups ③ Members: show nesting (T12 4.8, R45)",
      tools: ["Conditional Access groups"],
      builds: [25267, 25268, 25270],
      risk: "low",
      what: "loadMembers also reads /groups/{id}/members (direct users + member groups) and, in one $batch, each nested group's transitive users (first 40 groups); members carry direct / via. Matrix gains a Members / Show nesting / Nested only segment (● direct, ◐ nested with the child named), a NESTED GROUPS panel with expandable member lists, and ◐ cells are not removable. Demo nesting for the demo groups.",
      why: "Two extra reads per loaded group; the nesting read is best effort and a failure keeps the flat matrix. Graduates once a real group with a nested member group has shown the ◐ cells and the panel matches the portal.",
      test: [
        "Load ③ Members for a group that contains a nested group: Show nesting must mark the nested members ◐ with the child group name under the dot, direct members ●; hovering a ◐ must say remove from that group, not here, and offer no ×.",
        "The NESTED GROUPS panel must list the child with the same member count the portal shows; click it and the members must match. A dynamic child must show its rule.",
        "Nested only must keep exactly the ◐ rows; Members must show the matrix exactly as 4.7 did (no ◐, × on every ● of an assigned group).",
        "Read a group whose /members call fails (e.g. a mail-enabled group you lack rights on): the matrix must still render and the nesting panel must say nesting was not read.",
        "?demo=1: read members of three groups, Show nesting — every group with 2+ members has one ◐ member through SG-Demo-<n>, the panel lists it.",
        "25270: the ③ Members matrix must render as a card with a sticky Member column and vertical group headers (like 🔍 Gap analyse's grid), scrolling inside its own box; the In column must be the last column.",
        "25268: with empty groups loaded, tick hide N empty groups — the empty columns must vanish, the ⚠ line must fold to one row that opens on click; a nested group with a long shared prefix must show its tail under the ◐, and a column with only ◐ members must carry ◐ in its header.",
      ],
      files: ["js/cagroups.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 133,
      title: "Sign-in source: Entra log | Defender hunting | + non-interactive (🚦 🎚 🕵 🌊, R44)",
      tools: ["Sign-in failures", "Report-only impact", "Who is Anna to CA", "Who is the wave to CA"],
      builds: [25266, 25274],
      risk: "medium",
      what: "One shared segment in the four sign-in tools choosing the source: the Graph sign-in list (as before, default), Defender advanced hunting over EntraIdSignInEvents (same interactive sign-ins, no cap, 30 days, ThreatHunting.Read.All) or hunting including non-interactive sign-ins. Adapter in js/signins.js (huntingQuery / fromHunting) shaping hunting rows into the Graph record, per-day queries with a row cap, AADSignInEventsBeta fallback, logCache keyed by source, interactive / non-interactive chips in 🚦, source named in 🎚, per-user hunting query in 🕵.",
      why: "The default is unchanged, so production risk is in what the switch does when used: the ConditionalAccessPolicies JSON shape and LogonType values in EntraIdSignInEvents are read tolerantly but were not seen on a real tenant, and non-interactive volume can be 5× interactive. Graduates once the hunting source has matched the Entra source on interactive rows for one window, and the non-interactive rows have been eyeballed once.",
      test: [
        "Large tenant, Hunting + non-interactive, Last 4 hours, Enforced: the read must complete (progress may say slices halved / capped) and list failures and interrupts; the Sign-in source paragraph in Help explains the cap. Switch to Report-only: the whole window is read, sliced, and a capped 15-minute slice is said so in the result.",
        "On a tenant with Entra ID P2 and Defender: in 🚦 read 24 hours from the Entra sign-in log, note the failure count; switch to Defender hunting and read again — the interactive failure count must be the same (± sign-ins at the window edges) and every policy name must resolve. If ConditionalAccessPolicies renders empty, send back one raw row.",
        "Switch to Hunting + non-interactive: the header must show interactive / non-interactive chips, clicking non-interactive must show only cards marked non-interactive, and 🎚's header must say non-interactive sign-ins are included.",
        "Read 30 days on hunting: the progress must count days (30 steps), and a day with more than 20,000 sign-ins must produce the capped note. The 10,000 cap note must not appear on the hunting source.",
        "Open 🎚 after 🚦 on the same source and window: the ↺ reused line must appear; switch source in 🎚: the window must be re-read, not reused.",
        "🕵 on hunting: read a user — her sign-ins must come from one filtered query and match her rows in 🚦 on the same source.",
        "Decline ThreatHunting.Read.All when switching: the read must fail with a message that names the scope and tells you to switch back; the Entra source must still work.",
        "Tenant without P2: hunting returns no rows — the tool must say no sign-ins in the window, not error; the Help text says why.",
        "?demo=1: switch to Hunting + non-interactive in 🚦 — Eva's 03:14 non-interactive interruption appears with the chip pair; Entra source: it does not.",
        "25271: on the large tenant that failed with “exceeded the allowed result size”, read 7 days on Hunting + non-interactive — it must complete, the progress line must say how many slices were halved, and the total must not carry a capped note unless a 15-minute slice really held 20,000 sign-ins.",
      ],
      files: ["js/signins.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "js/version.js"],
    },
    {
      n: 132,
      title: "🛂 Session controls (T38, R43)",
      tools: ["Session controls"],
      builds: [25265, 25266, 25269],
      risk: "medium",
      what: "New beta-only tool: Defender for Cloud Apps session-control activity (CloudAppEvents via Graph runHuntingQuery, ThreatHunting.Read.All) joined to the Entra sign-in window's routing policies. Per CA policy with a session control: control, sessions routed, Defender actions, Defender policies matched, verdict. Event table with filters, Defender policies seen, schema panel. New js/sessionctl.js plus tile, screen, Help, wiring; demo policy d10, sign-in si-11 and sessionEvents.",
      why: "The classifier reads an undocumented schema: which ActionType a blocked download carries and where the matched policy name sits in RawEventData is known only from a real tenant with a real block. Graduates once one such tenant has confirmed the Blocked / Protected / Step-up rows are classified right and the routing join finds the CA policy. Also the first tool to use runHuntingQuery — the consent and the role requirement need one real run.",
      test: [
        "FIRST, on a tenant with Defender for Cloud Apps and at least one session policy that has blocked a download: open the tool, read 7 days, expand “What the hunting rows looked like” and send the ActionType list and RawEventData keys back. The Blocked row must be classified Blocked, not Activity; if not, that list is the fix.",
        "The tile count of App Control policies must equal the number of policies whose session controls show Conditional Access App Control in List Policies. A policy with Monitor only must carry the Monitor-only callout, and its verdict must never be Acting.",
        "For an enabled App Control policy: the Routed count must equal the number of sign-ins in 🚦 Sign-in failures' window (same range) whose applied policies include it with result success and a CloudAppSecurity session control. Spot-check three.",
        "For a blocked download: its Routed-by column must name the CA policy the user's sign-in of that session carried; open the user in 🕵 Who is Anna to CA and confirm that policy reaches her. A block with no routing sign-in in 8h must read “none found”, never a guessed policy.",
        "Decline ThreatHunting.Read.All: the run must stop with the role / permission message and nothing else must break. Grant it but decline AuditLog.Read.All: events must still render, the routing columns must say not checked, and the note above the result must say why.",
        "On a tenant whose CloudAppEvents has no AuditSource column (older schema): the fallback query must run and the note must say events were picked by wording.",
        "?demo=1: read — 2 App Control policies (CA310 On mcasConfigured, the limited-web-session policy Off monitorOnly), Gary's blocked download routed by CA310, Eva's block unmatched (“none found”), and the Monitor-only callout present.",
        "25269: after a read, typing two letters in the filter box must offer the users, apps, files and policies of the result, labelled by kind; pick Last hour and Last 4 hours — the query must run (hours, not days) and the tile ranges must read 1 hour / 4 hours.",
      ],
      files: ["js/sessionctl.js", "js/app.js", "index.html", "js/demo.js", "js/version.js"],
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
  if (gids.length) L.push("");
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
