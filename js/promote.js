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
      n: 156,
      title: "🕵 Who is Anna 0.6: baseline CA numbers, 💻 Devices card, 🚦 why on stopped sign-ins (T36, T37 0.5.1)",
      tools: ["Who is Anna to CA", "Who is the wave to CA"],
      builds: [25321],
      risk: "low",
      what: "js/whois.js buildLookup: seq = caNumOf(name) (/\\bCA\\d{3,4}[A-Za-z]?\\b/ on the policy name) instead of vm.seq — the wave shares the lookup. logOf → devicesOf(recs, failedIds): one row per deviceId | displayName | os+browser, state from the LAST sign-in (compliant / managed / registered / unmanaged), count, stopped, apps, last; render() adds the 💻 card between risk and the log split with a compliant-device callout (controls matched on the LABEL words compliant / hybrid joined / domain joined — the vm carries labels, not ids); toMd adds the section. Stopped table: p.controls under each policy, Signins.codeText(errorCode) when failureReason is empty. js/signins.js: CODE_TEXT + codeText export; HUNT_COLS + fromHunting carry DeviceName / EntraIdDeviceId (the column AadDeviceId was renamed to in Sept 2025; both tables carry the new name per the schema docs) so hunting rows group by device too.",
      why: "Read-only, display. The hunting change adds two columns to the $project — if a tenant's EntraIdSignInEvents lacks DeviceName or EntraIdDeviceId the hunting read fails on that column name (test 1 below); the Entra-log source is unaffected.",
      test: [
        "Hunting source, 1 day, a real tenant: the read must still succeed with DeviceName and EntraIdDeviceId in the query (a 'failed to resolve column' error means the column names differ — check the schema panel in 🛂 and rename).",
        "A user with a compliant laptop and a phone: 💻 card shows two rows, the laptop Compliant with its Entra device id under the name, the phone Registered or Unmanaged, counts adding up to the sign-ins in the window; Last seen matches the newest sign-in per device.",
        "A user reached by an enforced compliant-device policy who signed in from an unmanaged browser: red callout naming the policy and the count; the same sign-ins appear as Blocked (53000) rows below with 'compliant device required and this one is not' under the result.",
        "A user whose sign-ins were all compliant: green callout 'Every sign-in came from a compliant device'.",
        "Interrupted rows: the Policy cell says 'demanded mfa' (or the authentication strength) and the Result cell says 'MFA was demanded — the prompt was shown and not completed (50074)'.",
        "Baseline tenant: the ladder, the exclusion cards ('from CA012, CA304'), the policies table and the MD export all show the number from the policy NAME; a tenant with unnumbered names shows full names. 🌊 the wave's policy table the same.",
        "?demo=1: Eva — 💻 card: Windows 11 device (3 sign-ins, 1 stopped) Unmanaged, Ios 17 device Unmanaged; red callout '4 sign-ins … Require compliant device for Office 365'; stopped table shows 'demanded RequireCompliantDevice' and '(53000)' in words.",
      ],
      files: ["js/whois.js", "js/signins.js", "index.html", "js/version.js"],
    },
    {
      n: 155,
      title: "🌊🛂 ■ Stop on the wave and Session controls reads (T37 0.5, T38 0.6)",
      tools: ["Who is the wave to CA", "Session controls"],
      builds: [25320],
      risk: "low",
      what: "js/app.js makeProgress: st.stop + begin()/check()/requestStop(), a ■ Stop button in panel() for a progress with stoppable = true, one document-level click handler over PROG_REG (the panel is re-rendered per phase). fetchAll checks between pages; readSignInsHunting checks per slice; a joined read (logInflight) is left on stop without cancelling the other tool's read. runWave: begin() per run, checks between the member pages, the group batches, the roles; a stop before the group half is complete renders a Stopped panel with Read again, a stop during the sign-in window keeps the result and sets wvLogSkipped. scHunt returns stoppedAt/slices; runSessionCtl renders the partial rows with a PARTIAL note and skips the sign-in read; a stop during the sign-in read keeps the Defender half.",
      why: "Read-only tools, nothing written. The stop is checked between calls, so the query in flight always completes — a two-minute hunting query still takes two minutes to stop, and the line says so. Only wv and sc opt in; every other progress panel is unchanged.",
      test: [
        "🌊 on a real tenant, a deployment group of a few thousand members: press ■ Stop during 'Reading the members' — the button reads ■ Stopping…, the line says stopping after the current query, and the next panel is 'Stopped by you — N members read' with a 🔎 Read the wave again button that starts a fresh run (not a stuck one: the button runs and the stop does not carry over).",
        "🌊 press ■ Stop during 'Reading the sign-in window' (Entra source, 30 days): the result renders with the members, exclusions and other waves, and the note under the head reads 'Sign-in half: stopped by you during the sign-in read'.",
        "🛂 30 days, hunting: press ■ Stop after two or three slices — the result renders with the events read so far, the first note says 'stopped by you after N of M slices — the Defender window is PARTIAL', and the sign-in window was not read (no routing column values).",
        "🛂 let the hunt finish, press ■ Stop during 'Reading the sign-in window for the routing policies': the Defender half renders and the note says routing is not there.",
        "Start 🚦 Sign-in failures on a 30-day hunting window, then open 🛂 and run it so it JOINS that read (the line says 🚦 is already reading this window); press ■ Stop in 🛂 — 🛂 stops, and 🚦's read completes and renders on its own.",
        "🚦 Sign-in failures, 🎚 Report-only impact, 🕵 Who is Anna: no ■ Stop button appears in their progress panels (they did not opt in).",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 154,
      title: "👥 ⑦ Migrate repoint runs all four passes past a refusal (T12 5.9.8)",
      tools: ["Conditional Access groups"],
      builds: [25318],
      risk: "medium",
      what: "js/app.js migrate run: apply() collects refusals instead of throwing; the two remove passes still run; one Error afterwards naming the refusing policies. refsMoved = references minus refusing policies.",
      why: "A write-order change in the destructive tool. Safety property kept: a policy that refuses the add also refuses the remove (same PATCH), so it keeps the old group and never names nothing; a policy that took the add and refused the remove keeps BOTH groups (covered twice, never uncovered). Test on the unpatchable policies before promoting.",
      test: [
        "Migrate a role-assignable group referenced by one of the four unpatchable REQ-PVM-ReqApp-* policies plus several normal ones: the normal policies must all end with the NEW group only; the unpatchable one keeps the OLD group; the ledger's repoint step is ✗ naming exactly that policy; the report's Policies column reads references minus 1.",
        "Migrate a group with no refusing policy: unchanged behaviour, ✓ repointed n.",
        "After such a run, T12's 🧹 Archived, still in policies chip counts exactly the refusing policies' group(s).",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 153,
      title: "👥 Archived originals still in policies are called out (T12 5.9.7)",
      tools: ["Conditional Access groups"],
      builds: [25317],
      risk: "low",
      what: "js/groupsview.js classify: `archived` (CaGroups.ARCHIVE_SUFFIX on the name) and `archivedref` (archived + any policy reference) flags; kindLabel says which; archivedref is Needs attention; chip '🧹 Archived, still in policies'; drawerProtectionAu opens with a callout pointing at 🎯 Assign then 🧹.",
      why: "Display only. Background: on 2026-09-10 Perfetti Van Melle showed 7 '(migrated …)' groups still excluded/included by up to 46 policies — a repoint that did not complete.",
      test: [
        "Perfetti Van Melle, scope Used by CA policies: the 7 '(migrated …)' rows read 'archived original — still named by n policies …', sit under Needs attention, and the new chip counts 7; the drawer's Protection tab shows the red callout.",
        "Scope All groups: the 80 archived originals no policy names read 'archived original — rollback, delete via 🧹' and are NOT Needs attention.",
        "🧹 Archived groups still lists all 87.",
      ],
      files: ["js/groupsview.js", "index.html", "js/version.js"],
    },
    {
      n: 152,
      title: "🔒 Break-glass groups are candidates on any policy reference (T20 3.0.2 / ⑥)",
      tools: ["Protect exclusions", "Conditional Access groups"],
      builds: [25316],
      risk: "low",
      what: "js/cagroups.js rmauCandidates: BREAKGLASS_NAME (/break-?glass|emergency[_-]?access|\\bBG-/i) + refs.include.length qualifies a row; rows carry breakGlass; unused is false for them. js/protect.js: Used by cell reads 'included by n · break-glass' for them; the sub-label says break-glass group.",
      why: "Widens the candidate list by name pattern + include reference only; nothing pre-ticked, nothing written by the change itself.",
      test: [
        "Perfetti Van Melle: T20 lists Emergency_Access1 and Emergency_Access2 as 🔒 in CAB-SEC-RMAU-BreakGlass with Used by 'included by 1 · break-glass'; CAB-SEC-U-BreakGlass keeps 'excluded by 124 / included by 4'.",
        "👥 CA groups → ⑥ Protect shows the same two rows.",
        "A tenant whose break-glass group is named without the pattern (e.g. SG-Emergency): not listed — add it by hand via the directory search, as before.",
      ],
      files: ["js/cagroups.js", "js/protect.js", "index.html", "js/version.js"],
    },
    {
      n: 151,
      title: "🛂🌊🚦🎚 Hunting read narrates every query + one read for two askers",
      tools: ["Session controls", "Who is the wave to CA", "Sign-in failures", "Report-only impact"],
      builds: [25315],
      risk: "low",
      what: "makeProgress: st.detail + st.frac, detail(text, frac), a 1 s clock that repaints until the panel is gone, stop(). readSignInsHunting calls prog.detail before and after every huntRun (day, HH:MM–HH:MM, query n, rows, halved/capped counts) and advances frac by the part of the day covered. readSignInWindow: logInflight { days, source, promise, prog, by } — a second asker for the same days+source mirrors the first's st into its own panel every second and awaits the same promise, then returns the cache. Each prog carries .by for the message.",
      why: "Presentation plus a join on an in-flight promise; the hunting queries themselves are unchanged. The join only applies to the same days and source; a Rescan (force) still reads on its own.",
      test: [
        "Large tenant, Hunting + non-interactive, 7 days: open 🛂 — within a few seconds the line reads 'Wed 04 Sep 00:00–12:00 · query 1 running · incl. non-interactive' and the clock ticks; as slices are halved the line says so; the bar moves within the day.",
        "While 🛂 is reading, open 🌊 and press Read wave with the same window: its panel reads '🛂 Session controls is already reading this window — joining that read · <the same detail>'; when 🛂 finishes, 🌊 renders from the cache without a second read.",
        "Entra sign-in log source: unchanged page-by-page line.",
        "?demo=1: the four tools still open and render.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 150,
      title: "📥 Import shows the run ledger (T06 2.10)",
      tools: ["Import"],
      builds: [25314],
      risk: "low",
      what: "js/import.js importPolicies gains opts.onItem(i, phase, result) and opts.shouldStop(). js/app.js imGo: RunLedger.create into #imBody with row 0 = dependencies (ensureDependencies / imCopyCounterparts onStatus → L.note(0)), rows 1..n = policies; failures or a Stop keep the dialog open; demo animates the rows.",
      why: "Presentation over the existing write loop — the requests are unchanged. The one behavioural change: Stop between policies (never mid-policy), and a run with a refused policy no longer auto-closes the dialog.",
      test: [
        "Import 6 policies on a real tenant: the dialog shows the ledger — Dependencies row working then ✓ with 'n created · m reused', each policy row amber while writing, ✓ 'created, Off' (or 'updated in place · “old” switched Off'); the dialog closes and the report opens.",
        "Import one that Graph refuses (the workload-identity case without the licence, or a policy naming an app with no service principal): the row is ✗ with the reason, the dialog stays open with the summary line, the report opens.",
        "Press ■ Stop during a 6-policy run: the policy in flight completes, the rest read 'stopped', the dialog stays open, the report lists them as not imported.",
        "?demo=1: Import 3 → the ledger animates and closes; report opens.",
      ],
      files: ["js/import.js", "js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 149,
      title: "👥 Used by shows the baseline's CA number, not ENCA's seq (T12 5.9.6)",
      tools: ["Conditional Access groups"],
      builds: [25313],
      risk: "low",
      what: "js/app.js cgModel().ctx.seqOf parses /\\bCA\\d{3,4}[A-Za-z]?\\b/ from the policy name instead of returning vm.seq. Every GroupsView cell that prints a policy number goes through it (Used by, drawer Policies tab, compare views).",
      why: "Display only. On a tenant whose policy names carry no CA number, the cells show the full policy name (as they already did when seqOf was empty).",
      test: [
        "Perfetti Van Melle: CAB-SEC-U-CA002-Exclusion reads 'excluded by CA002'; the drawer's Policies tab shows 'CA002 CA002-BLOCK-…'.",
        "A tenant with unnumbered policy names: Used by shows the full names, nothing blank.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 148,
      title: "🔒 Protect exclusions 3.0 — two locks per group (T20) + Empty count fix (T12)",
      tools: ["Protect exclusions", "Conditional Access groups"],
      builds: [25311, 25312],
      risk: "medium",
      what: "New js/protect.js (pure: classify / defaultTicks / render / report). js/app.js: renderCgRmau() dispatches to renderProtect() when rmauStandalone; prState { filter, ticks, forScan, results }; prCtx() builds the ctx from cgRmau + cgRes rows (nesting via loadNestingStates on the candidate rows, nested groups via loadNestedGroups); prApply() = per group: POST members/$ref into the persona unit (rmauTarget) + prDisableNesting() (PATCH v1.0 + read back, unsupported → noted tenant-wide); rmauGrantAdmins(t, say) extracted from cgRmauApply and shared. Settings drawer reuses the ⑥ ids (cgRmauAu/Name/Admin/Ack/Q) so the existing rmauChange/rmauInput handlers serve it; cgFindPanel('protect') kept. ⑥ inside T12 unchanged. Also loadNestedGroups: the $count body inside a $batch arrives as {$content-type, $content(base64)} — parsed now; before, directTotal was always null (c.status is not set on batch successes either).",
      why: "A new write screen over two existing engines. The risks: a tick applied to the wrong lock (row/header tick logic), a fallback unit created when nothing needs it, the nesting PATCH on a tenant that refuses it (it is caught and reported, never retried as a recreate). Graduates after one real run on each kind of tenant.",
      test: [
        "Green tenant (property supported): open T20, scan — five tiles, chips, every row shows both locks; a group in a vault with nesting allowed sits under Vault only with only the nesting tick on.",
        "Tick two open groups → Protect: ledger shows 'placing in <unit>… · nesting: setting…' then ✓ per row; the table re-renders with 🔒 in <unit> and 🚫 disabled; Change report has both columns; the scoped admin (if given) is granted on every unit written to.",
        "Perfetti Van Melle (no property): banner once, Nesting column reads 'not reported', nesting ticks disabled with '— n/a', tiles switch to the 4-tile variant (In a vault / Not in a vault / Nesting n/a / Nested groups inside); Protect still places groups in vaults.",
        "A role-assignable group: 'cannot — role-assignable' + 'impossible', the ⑦ Migrate it first button opens Migrate scoped to it. A group in a vault AND role-assignable: 🧊 frozen.",
        "A group with nested groups inside and nesting allowed: 'allowed · 2 nested groups inside', nesting tick disabled '— blocked'.",
        "Fresh scan: NOTHING ticked, the bar reads 'Nothing ticked'. Header tick: on → every row that lacks a lock gets its ticks; off → nothing ticked; the bar count follows the ticks exactly. Open T20 from the CA groups list with 3 groups selected → exactly those 3 arrive ticked. Settings closed by default; Protect with the acknowledgement unticked opens the drawer and toasts.",
        "⟳ Re-check keeps the ticks; a fresh scan (▶) resets them to the defaults. The directory search panel still adds a group by hand (tagged 'by hand', ✕ removes it).",
        "👥 CA groups → ⑥ Protect: unchanged layout and behaviour (the dispatch only fires on the standalone screen).",
        "T12 Empty chip on Perfetti Van Melle: must count every exclusion group with 0 direct members right after the scan (rows read '0 · empty' without pressing read).",
        "?demo=1: T20 renders, ticks toggle, Protect runs a simulated ledger (units are 'missing' in demo, so nesting is the lock that applies).",
      ],
      files: ["js/protect.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 147,
      title: "🛡 Restricted AUs: archived (migrated …) groups leave the chips and Bulk add (T27 1.8.2)",
      tools: ["Restricted AUs"],
      builds: [25310],
      risk: "low",
      what: "js/app.js ruPgLoad and the bulk-add scan filter on CaGroups.ARCHIVE_SUFFIX (already exported; the Archived-groups tool's sieve).",
      why: "Filter on an existing regex; nothing else changes.",
      test: [
        "Open CAB-SEC-RMAU-BreakGlass on the tenant migrated today: the 'cannot' list must not name Emergency_Access1/2 (migrated 2026-09-10); Emergency_Access1/2 stay listed as members.",
        "＋ Bulk add Break-glass groups: the found list must not include any '(migrated …)' or '(legacy …)' group.",
        "🧹 Archived groups still lists them for deletion — unchanged.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 146,
      title: "🗂 Group popup shows the nesting state (T01 2.10.1)",
      tools: ["List Policies"],
      builds: [25309],
      risk: "low",
      what: "js/app.js openDepView(type='group'): one extra GET CaGroups.NEST_V1(/groups/{id}?$select=id,disableNesting) → obj._nesting via CaGroups.nestingState; depSettingsHtml adds a Nesting row (role-assignable → impossible). Demo: exclusion/persona names read as disabled.",
      why: "Read-only, one extra request per popup open (cached in depCache with the rest).",
      test: [
        "Open a policy card → click a recreated exclusion group (CAB-SEC-U-CA002-Exclusion): Nesting reads '🚫 disabled'; a role-assignable group reads 'impossible'; a plain group without the property reads 'allowed'.",
        "?demo=1: any group popup shows the row.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 145,
      title: "👥 Finished writes consume their ticks (T12 5.9.4)",
      tools: ["Conditional Access groups"],
      builds: [25308],
      risk: "low",
      what: "js/app.js: after the migrate run, results.filter(ok) names leave cgSel; after Archived delete, done names leave cgSel; renderCaGroups prunes cgSel (and cgOpen) of names absent from cgRes.rows.",
      why: "Selection state only; no reads or writes change.",
      test: [
        "Tick two role-assignable groups → Migrate → done → Close: the list shows them unticked and the bar is gone; tick two others → Migrate: the header says '2 groups carried from the list' and Not migrated does not list the earlier pair.",
        "Archived groups: delete two → after the re-scan the bar count excludes them.",
        "Tick a group, then delete it via Archived groups in another way (or it vanishes on rescan): the bar count drops and the drawer closes.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 144,
      title: "👥 Nesting-disabled read goes to v1.0 like the create's verify (T12 5.9.3)",
      tools: ["Conditional Access groups"],
      builds: [25307],
      risk: "low",
      what: "js/graph.js gbatch(requests, onProgress, opts): opts.base posts the batch to an absolute base (v1.0) so the inner relative URLs resolve there. js/app.js loadNestingStates uses { base: 'https://graph.microsoft.com/v1.0' } — the same route Assign.confirmNesting and ⑧ Disable nesting already read (CaGroups.NEST_V1).",
      why: "Read-only. gbatch default behaviour unchanged (no base → the beta base as before).",
      test: [
        "Perfetti Van Melle, after the 2026-09-10 recreates with nesting disabled: the chip must count them and the rows carry 🚫 nesting disabled; compare with GET https://graph.microsoft.com/v1.0/groups/{id}?$select=id,disableNesting in Graph Explorer for two of them.",
        "A group created without the tick: drawer Protection tab says 'allowed'; the Disable nesting button opens ⑧.",
        "Every other batch caller (nested groups, member counts, protection map) still works — no base passed, so nothing changed for them.",
      ],
      files: ["js/graph.js", "js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 143,
      title: "🔄 Refresh never pulls you back to the tool that asked (T12 5.9.2)",
      tools: ["Conditional Access groups"],
      builds: [25306],
      risk: "low",
      what: "openCaGroups(keepTab, quiet): quiet skips crumb()+show() and only re-scans/renders. loadFromGraph(true): after the read, moved = shownScreen !== 'screen-loading'; T12 re-scans with quiet=moved, other tools show(from) only when !moved. The after-write re-scans inside T12 (Archived, Protect, Migrate, Create) pass quiet when shownScreen !== 'screen-cagroups'.",
      why: "Follow-up to queue 139's refresh-return: that fix navigated unconditionally when the async read finished. Navigation only; no read changes.",
      test: [
        "T12 → Assign a group to a policy from the drawer → Apply → close → immediately open 🕵 Who is Anna to CA while 'Refreshing' shows: you must stay on T36; go back to T12 — the list is already re-scanned with the new policy count.",
        "Same, but stay on T12: it re-scans and stays in front, as before.",
        "🧹 Archived groups delete on a big group (2 min): switch to another tool mid-run — when it finishes you stay there; T12's list is current on return.",
        "🗣 User impact ⟳ Re-read, then move to another tool while it reads: you stay on the new tool.",
      ],
      files: ["js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 142,
      title: "👥 ⑦ Migrate report: Nesting column from the verified create (T12 5.9.1)",
      tools: ["Conditional Access groups"],
      builds: [25305],
      risk: "low",
      what: "js/app.js migrate run: res.nesting / res.nestingError taken from Assign.createGroup's confirmNesting result (disabled | failed | unsupported | n/a) instead of echoing t.nesting; step + say lines use it. js/cagroups.js migrateReport: Nesting column + a closing line when any new group still allows nesting.",
      why: "Report-only change over data the create already produced; the demo create now returns nesting too so ?demo=1 renders the column.",
      test: [
        "Migrate one group with 'Disable nesting on the new groups' ticked on a tenant that supports the property: the report row reads 'disabled' and the ledger step says 'nesting disabled'.",
        "Same with the tick OFF: 'allowed (not requested)' and the closing line naming the Protection tab.",
        "On the tenant that refuses disableNesting (2026-08-19): 'not available in this tenant' and the italic line about nesting staying in sight — no failure.",
        "?demo=1: Migrate two groups, open the report — Nesting column present, 'disabled' when ticked.",
      ],
      files: ["js/app.js", "js/cagroups.js", "index.html", "js/version.js"],
    },
    {
      n: 141,
      title: "👥 CA groups 5.9: 🚫 Nesting disabled chip + drawer nesting line (T12)",
      tools: ["Conditional Access groups"],
      builds: [25304],
      risk: "low",
      what: "js/groupsview.js: classify() adds the nestingdisabled flag from r.nesting (already loaded by loadNestingStates on the list render); CHIPS gains ['nestingdisabled', '🚫 Nesting disabled', 'green'], shown once any row has a nesting state read; membersCell appends noNest(r); drawerProtection = nestingLine(r, c) + the old AU body, with data-cgg-act='nesting' routed to openNesting() in app.js.",
      why: "Read-only, derived from a read the list already did. The only write path is the existing ⑧ Disable nesting button, reachable one click sooner.",
      test: [
        "Real tenant: open the list — after a moment the 🚫 Nesting disabled chip appears with a count; click it: only groups with disableNesting true, each row carrying '🚫 nesting disabled' under the members; compare against Get-MgBetaGroup -Property disableNesting for two of them.",
        "A tenant whose directory does not return the property: the chip shows 0 and the drawer's Protection tab says 'not reported' — no error.",
        "Open an exclusion group with nesting allowed: Protection tab starts with 'allowed' in amber and a 🚫 Disable nesting button that opens the ⑧ dialog for that group; a role-assignable group says 'impossible'.",
        "?demo=1: every 4th group is 'disabled' — chip count > 0, rows marked, drawer line present.",
      ],
      files: ["js/groupsview.js", "js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 140,
      title: "🕵 Who is Anna to CA 0.5: identity risk tile + card, state filter (T36)",
      tools: ["Who is Anna to CA"],
      builds: [25303, 25321],
      risk: "low",
      what: "js/whois.js: riskOf(records, userId, user, lookup) → { read, err, user, atRisk, signIns, byLevel, worst, policies[firesNow, firesOnSignIn] }; lookup keeps userRisk / signInRisk levels per policy; render adds the fifth tile (.wo-verdicts.wo-5, 5 → 3 → 2 columns) and a 🛡 Identity risk card between the policies table and the sign-ins; toMd gains the at-a-glance line and a section. js/app.js: WO_RISK scopes, woReadRisk(u) — GET /identityProtection/riskyUsers/{id} (404 = never flagged) + riskDetections filtered on userId and the last 30 days, additionalInfo parsed — run in woExtras when the scopes are held, else from the tile's read button (preConsent, then WhoIs.analyze re-derived from the kept records). State filter: woSfilter, data-wo-sfilter, opts.stateFilter. Demo: DEMO_DATA.riskyUsers (Alex at risk medium with two detections, Eva remediated), si-3 carries the risk fields.",
      why: "Read-only and additive. The judgement calls: user risk comes from the risky-user record (state + level), sign-in risk from riskLevelAggregated over riskLevelDuringSignIn per record; 'fires now' is a plain level match against the policy's userRiskLevels while the state is atRisk / confirmedCompromised — it does not evaluate the rest of the policy. The detections window is 30 days regardless of the sign-in window, on purpose.",
      test: [
        "Real tenant, P2, an account that holds Security Reader: open a user who is at risk in the Entra portal — the tile must read '<Level> user risk · At risk · since <date>', and if a user-risk CA policy includes that level, 'fires <policy>'.",
        "The same user: the 🛡 card must list the same detections the portal's Risk detections blade shows for the last 30 days, with the same level and state; a risky sign-in in the window must appear with its detection types and the CA outcome.",
        "A remediated / dismissed user: tile green, 'Remediated · was <level> · since <date> · <riskDetail>'.",
        "A user never flagged: 'No risk · not flagged by Identity Protection'; a 404 from riskyUsers must NOT surface as an error.",
        "Sign in WITHOUT the two scopes: the tile reads 'Not read' with a read button; clicking it asks consent once and fills the tile; decline → tile unchanged, no error toast.",
        "A P1-only tenant: the tile must say it needs P2 rather than showing an empty record as 'No risk'.",
        "State filter: Reaches her × Report-only must show only the report-only policies reaching her, the chip counts matching the tile's enforced / report-only / off split; Excluded × Any state still lists the exclusions.",
        "Export MD: the report carries the Identity risk line under At a glance and, for a user with detections or risky sign-ins, an Identity risk section with both tables.",
        "25321 fix: on a tenant with twenty risk-based policies, open a user in one deploy group — the 🛡 card lists ONLY the risk policies whose include/exclude reaches her (compare with the policies table's Reaches her filter) and one muted line says how many are not targeted at her / she is excluded from. Insider-risk policies read 'insider risk minor/moderate/elevated', not a bare dash.",
        "?demo=1: Alex — Medium user risk, at risk but CA201 (user risk medium) is aimed at Internals, not at him: the card lists Block elevated insider risk only and says '1 not targeted at her'; one risky sign-in, two detections; Eva — Remediated; Milan — No risk. Markdown export carries the Identity risk line and section.",
      ],
      files: ["js/whois.js", "js/app.js", "js/demo.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 139,
      title: "🔎 Suggest boxes keep the pick + T12 refresh returns home (bugs of 2026-09-10)",
      tools: ["Who is Anna to CA", "Compare users", "What-If", "User or Group analyzer", "Who is the wave to CA", "Gap analyse", "CA validator", "Licence gap", "Sign-in failures", "Report-only impact", "Session controls", "Conditional Access groups"],
      builds: [25302],
      risk: "low",
      what: "js/app.js: dlPicked(listId, value) + dlSet(listId, html) next to esc(). Every datalist input handler returns early when the value is one of the options on offer (a pick, not typing) and writes its options through dlSet, which is a no-op when the html is unchanged (the result-driven lists in 🚦 🎚 🛂). ⑥ Protect's cgRmauAdmin gets the fragment-aware guard from ruSuggest. loadFromGraph(isRefresh) remembers shownScreen (HISTORY_SCREENS only) and returns there instead of screen-list; screen-cagroups re-scans via openCaGroups(true); cgRefresh no longer scans twice. 🧹 Archived groups passes an onItem tick into Assign.apply so the row reads 'taking it out of N policies… n of N'.",
      why: "The datalist guard is the same pattern T12 3.4 and T27 0.7 already carry, now applied everywhere in one place — the risk is a box whose value legitimately equals an option while the person keeps typing (they would have to type a whole UPN that is already listed; Enter still runs). The refresh return touches every tool that re-reads after a write: a screen that renders from its own state comes back as it was, which is what the tab already did.",
      test: [
        "🕵 Who is Anna to CA: type 'iva', pick the UPN from the dropdown — the list must close and stay closed; Enter or Read user runs with the picked UPN.",
        "⚖ Compare users: pick a user from the list — the user is added (change) and the list does not reopen over the emptied box; type two letters again and suggestions return.",
        "🧪 What-If user box, 🔗 User or Group analyzer, 🌊 wave box, 🔍 Gap analyse named pick, ⚡ CA validator target, 🎫 Licence gap admin groups: pick from the list — no reopen; typing more letters still re-queries.",
        "🚦 Sign-in failures, 🎚 Report-only impact, 🛂 Session controls: focus the search box, pick a suggestion — the dropdown closes; typing still filters and the suggestions stay.",
        "👥 ⑥ Protect: in the scoped-administrator box pick a name, type ', ' and pick a second — neither pick reopens the list (the second still replaces the line: known, ruSuggest has the prefix restore, this box does not).",
        "👥 from the list: open a group's drawer → Policies → 🎯 Assign → add it to one policy → Apply → close: you must land back on the groups list, re-scanned, with the policy count on the row updated — not on 🗂 List Policies. Same via Compare → Policies ticks.",
        "🗂 List Policies → 🎚 Set state on one policy: still lands on the list (from = screen-list). 🗣 User impact brief ⟳ Re-read: still comes back to the brief.",
        "🧹 Archived groups on a group named by many policies: the working row must count 'taking it out of N policies… 1 of N … N of N', then 'verifying…', then ✓.",
        "?demo=1: T36 pick from the seeded list — no reopen; T12 Archived groups delete renders the finished ledger.",
      ],
      files: ["js/app.js", "js/changelog.js", "js/promote.js", "js/version.js", "index.html"],
    },
    {
      n: 138,
      title: "✅ Run ledger for every batch write (R50)",
      tools: ["Conditional Access groups", "List Policies"],
      builds: [25301],
      risk: "medium",
      what: "New js/runledger.js (RunLedger.create(host,{unit,items,onStop}) → start/done/fail/skip/note/finish, stopped) + .rl CSS. Assign.apply / applyMapped gain onItem(i, phase, result) and shouldStop(). Wired: 🎯 Assign confirm modal (asConfirmBody replaced by the ledger; modal stays open on failures, Back→Close), 🎚 Set policy state (stLedger inserted in the modal), 👥 ⑦ Migrate (ledger element kept on cgMig so a re-render puts it back; steps as row notes; L.fail names the step), 🧹 Archived groups (arcBody), ⑥ Protect (cgRmauLog; skipped rows for missing units), ② Create (cgCreateLog; dialog stays, close re-reads), ⑤ Import CSV (cgCsvLog), Compare → Policies ticks (#cgFixLedger kept across re-render). cgCloseEngine re-scans when cgRes was thrown away; list click handler guards a missing scan.",
      why: "Every wired site is a write path, so the risk is a loop that stops early, a row index that drifts (the Compare ticks use an offset per job), or a dialog that closes on a failure and hides the ✗. Graduates once each site has been run once on a real tenant with at least one deliberate failure in the list.",
      test: [
        "🎯 Assign, tenant-wide exclude (100+ policies): the confirm modal must show every policy before the first write, the working row amber and scrolled into view, ✓ per row; press ■ Stop mid-run — the write in flight completes, the rest read 'stopped', the modal stays open with Back reading Close, and the report lists the stopped rows.",
        "🎯 Assign on a set that includes an unpatchable policy (the REQ-PVM-ReqApp-* ones): the ✗ row must carry the diagnosis inline and the modal must stay open; the clean policies must still be ✓.",
        "🎚 Set policy state on 5 policies: the ledger appears in the modal, ✓ per row with the new state, the modal closes on a clean run and stays open on a failure.",
        "👥 ⑦ Migrate 2 groups: one row per group, the step notes changing on the working row (renamed → created → members → repointed → verified → AU), ✓ migrated at the end; navigate to another tool mid-run and back — the same ledger with its progress must be there.",
        "👥 🧹 Archived groups, ⑥ Protect, ② Create, ⑤ Import CSV: each shows the ledger, Stop works, a failure keeps the dialog open with the reason on the row; after Create, Close must re-read the tenant and the list must show the new groups.",
        "Compare → Policies: tick 3 missing cells across 2 groups → apply: the ledger above the grid must show 3 rows in order, each ✓, the grid re-rendering with no differing rows and the ledger still visible.",
        "?demo=1: Archived groups delete, Migrate, Create and the Compare ticks all render a finished ledger with green rows; Assign's Apply animates 40 ms per row.",
      ],
      files: ["js/runledger.js", "js/assign.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 137,
      title: "🚪 Exclusion analyzer: nesting in sight (T09 1.7, R49)",
      tools: ["Exclusion analyzer", "Who is Anna to CA"],
      builds: [25281, 25282],
      risk: "low",
      what: "js/exclusions.js: readNesting(groups) after the transitive read — one $batch of /groups/{id}/members (direct users + groups, split on @odata.type), one of the nested groups' transitiveMembers/user (first 40) — sets members[].direct / via, group.nested / directCount / nestedCount. effectiveUsers reasons carry nested + through; risk() adds the nested-groups flag (High when directCount === 0); rowSub / matrix cell (↪, class nest) / summary tag / CSV / MD carry it; app.js openExMembers sorts direct first and names the path. Demo: last member of a 2+ group comes through SG-Demo-*.",
      why: "Read-only and additive: a failed nesting read leaves the old result exactly as it was (caught, warned). The one judgement call is the High level for an exclusion group with no direct members — that is the case Mihai could not see and asked for, so it should stay loud.",
      test: [
        "Real tenant with a nested exclusion group (CAB-SEC-U-CA005-Exclusion: 0 direct, 136 through 9 nested groups): the head must show the ↪ tag with the group and user counts; the matrix row must read '136 members · ↪ all through 9 nested groups'; clicking it must list the nested groups by name and every member with the group they came through.",
        "Effective users: a user from that group must show ↪ (not ◐) in the CA015 column, tooltip 'excluded via CAB-SEC-U-CA005-Exclusion ↪ <nested group> — through nesting only'.",
        "Risk review: CA015 must carry a High flag 'Exclusion group fed entirely by nested groups: CAB-SEC-U-CA005-Exclusion' naming the nine groups; a policy whose excluded group mixes direct and nested members must carry Medium instead.",
        "Export CSV and MD: the how column reads 'via <group> > <nested>' / 'via <group> ↪ <nested>'.",
        "🕵 Who is Anna to CA on a user who sits in an exclusion group only through a nested group: the exclusion rung must read 'Excluded · ↪ nested via <group>' in red, the policy table's Reaches-her-via column the same, and the standing-bypass callout must say she was never added to the exclusion group itself. A direct member keeps 'direct'.",
        "?demo=1: head tag '1 excluded group with nested groups · 1 user through nesting', HR-Department row '2 members · ↪ 1 through 1 nested group', Milan shows ↪ in Effective users, Risk review Medium on the policy excluding HR-Department.",
      ],
      files: ["js/exclusions.js", "js/whois.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 136,
      title: "👥 CA groups 5.0: one list + drawer instead of seven tabs (T12, R48)",
      tools: ["Conditional Access groups"],
      builds: [25273, 25275, 25276, 25277, 25278, 25279, 25280, 25284, 25285, 25286, 25287, 25288, 25289, 25290, 25291, 25292, 25293, 25294, 25295, 25296, 25297, 25298, 25299],
      risk: "medium",
      what: "New js/groupsview.js (list, chips, bulk bar, drawer renderers) and a groups landing view in app.js. 25294: Policies view ticks → cgFixApply → Assign.apply(pids, 2|3, [gid]) per (group, how), refs patched in place. 25279: the list renders into #cgList and stays; #cgBody (the element every engine renders into and listens on) is MOVED by cgPlaceEngine into #cgOverlay (dialog, writes) or #cgSheet (sheet, members) and back, so engine code is untouched; #cgBar is the floating bar (fixed) and becomes the sheet header. Earlier: cgTab = groups by default, the tab strip hidden, engine screens reached from row / bulk actions with the selection carried across (cgGoTab, cgRmauPre / cgMigPre applied after their scans) and a ← Groups bar back. Drawer: members tree with add (existing cgAddMember via hidden group input) and remove (existing cgRemoveMember; new cgRemoveFromChild for nested groups), policies, protection, history (directoryAudits filtered on the group id). Tile blurb, Help and roadmap R48 rewritten.",
      why: "Every engine is unchanged, so the risk is in the routing and the reads: a bulk action that lands on the wrong screen, a pre-selection that does not stick, a member read that repeats. Graduates once one real tenant has been worked from the list end to end — create, protect, migrate, compare — without touching the old tabs, and the nested-remove confirm has been read on a real nested group.",
      test: [
        "Open 👥 on a real tenant: the list must appear after ONE scan (watch the network: no second scan when clicking rows, chips or tabs in the drawer). Status, used-by and protection columns must agree with the old ① Check table (still reachable: tick nothing, ⋯ → it opens the row popup).",
        "Click a row: its members must be read once and the drawer must show direct members first, then each nested group with ▸; expanding a nested group must list its members with × on each. Click the row again or another row: no re-read of a group already read.",
        "Drawer Members: add a user — the tree must update and only that group is re-read. × on a DIRECT member must confirm with the exclusion / include wording; × on a NESTED member must confirm naming the nested group and what else it feeds, and remove from the nested group (check in the portal).",
        "Tick two groups → ⊞ Compare selected: a SHEET must fill the tool area below the tabs with the matrix for exactly those two columns (nesting view available); ▁ Half must drop it to half height with the list visible above — tick a third row there and the matrix must gain its column; the Half/Full choice must survive a reload; ✕ Close in the sheet header must return to the plain list with the ticks kept.",
        "Tick a group → 🧹 Migrate (and 🔒 Protect, ＋ Create, 📥 Import, 🎯 Assign): a DIALOG must open over the dimmed list; let Migrate finish its scan — the dialog header with ✕ Close must still be there; Esc must close it and the list must show the same ticks and open row as before. The header and the tool tabs must stay visible and clickable above the dialog (open another tool while a Migrate check runs, come back: the dialog is still there). ⟳ Rescan inside Migrate must re-check the same scoped groups, not all of them.",
        "Tick an unprotected exclusion group → 🔒 Protect in RMAU…: after ▶ Scan, exactly that group must be ticked (not the default set). Same for a role-assignable group → 🧹 Migrate.",
        "Missing filter → ＋ Create on a row: ② Create must open. Dangling filter → 🔁 Restore: the assign wizard must open with the restore action available. Deploy group → 🌊: Who is the wave to CA must open on that group.",
        "Drawer History → Read: the last 30 days of member adds / removes for that group must list who did it; decline AuditLog.Read.All: the tab must say so.",
        "Nesting: on a real tenant the ↪ Has nested groups chip must show a count right after the scan (no member read), the members column must say ↪ n nested groups on those rows, and a nested group inside an exclusion group must be in Needs attention. Open one: the drawer names the nested groups before the members are read.",
        "Empty chip right after the scan (no member read): its count must equal the number of present groups with 0 direct members in the portal; an unread row must show 'n direct' next to read.",
        "Scope All groups: every security group in the tenant appears (extras as not in the baseline); a tenant with more than 5,000 says 'first 5,000' in the head. Switching back to Used by CA policies re-scans.",
        "Click a row without ticking: the actions bar must appear naming the open row; 🧹 Migrate and 🔒 Protect from it must land on a RESULT (no Scan button) with that group ticked; Migrate must check ONLY that group (progress 1/1, a 'scoped' tag on the result) and the button on the tag must run the full check. ✕ on the bar with nothing ticked closes the drawer.",
        "Tick three rows one after another: the drawer must show the LAST ticked group each time; untick it — the drawer must show the previous one. In the drawer, ＋ Add a user and × a member must work (they are in the list element now).",
        "⋯ on a present row → ③ Read members: a sheet with the matrix for THAT group only (no 'pick the groups' list); ⋯ → ⑦ Migrate on a role-assignable group in a P1 tenant: the group must be eligible (no 'Could not check whether this group holds a directory role' skip), and the scan must not call memberOf per group when the list's protection map is loaded (network tab).",
        "Click the Members header: rows must sort by member count (unread rows by their direct count), again flips, a third click returns to attention-first; the header select-all must tick every row in the current filter and untick them again.",
        "Narrow window: the ⋯ column of the list must stay visible without a horizontal scrollbar; cells wrap instead.",
        "Tick a migrated group and its archive (DG-INT and DG-INT (migrated …)) → Compare → Policies: the grid must list every policy naming either, the rows that name only one of them first and marked 'differs', and the summary must say e.g. 'DG-INT is missing: 4 exclusions'; a policy name must open the card. Tick the 4 missing cells (☑ Tick every missing cell) and apply: 4 policy updates, the portal must show DG-INT excluded on those 4, the grid must show no differing rows afterwards and the list's used-by count must read 30. For the 4 REQ-PVM-ReqApp-* policies that answer 400: the note above the grid must name the setting Graph refuses (expected: app-protection grant without an iOS/Android-only platform condition, or ActiveSync mixed with other client types) — open one in the portal, fix that, save, retry: it must then apply. Also assign a group to a policy that targets guests (includeGuestsOrExternalUsers): the guest block must still be there afterwards. Members view: the two group columns must be narrow (46px), not stretched across the window.",
        "Migrate a group that will FAIL part-way (e.g. revoke Group.ReadWrite before the member copy): the result must name the failed step in the tag, show the ledger with ✓ for the steps done, and a 'Where things stand' line that is true — check the tenant: old group renamed, new group present with n members, policies untouched.",
        "🧹 Archived groups: tick a group still referenced by a policy, keep the 'take it out of every policy' box on, type DELETE — the policy must drop the old id before the delete (check the policy in the portal), the report must list the policies it was taken out of; 🔗 Check other uses on a group with an Intune assignment must show the hit in the last column.",
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
      builds: [25270, 25291],
      risk: "low",
      what: "anIntro joins HEAD_TOOL so the Gap analyse header is stamped T03 · v like every other screen; the ← Back to policies button (1.9) is hidden — the tab bar already leads back.",
      why: "Cosmetic; the Back button removal changes one exit path. Graduates with the next port.",
      test: [
        "Coverage funnel: click Required to do MFA (even at 100%) — the user list must filter to the users required to do MFA; click the −n on Licensed — the list must filter to the unlicensed ones; the export must name the filter.",
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
      builds: [25266, 25274, 25283],
      risk: "medium",
      what: "One shared segment in the four sign-in tools choosing the source: the Graph sign-in list (as before, default), Defender advanced hunting over EntraIdSignInEvents (same interactive sign-ins, no cap, 30 days, ThreatHunting.Read.All) or hunting including non-interactive sign-ins. Adapter in js/signins.js (huntingQuery / fromHunting) shaping hunting rows into the Graph record, per-day queries with a row cap, AADSignInEventsBeta fallback, logCache keyed by source, interactive / non-interactive chips in 🚦, source named in 🎚, per-user hunting query in 🕵.",
      why: "The default is unchanged, so production risk is in what the switch does when used: the ConditionalAccessPolicies JSON shape and LogonType values in EntraIdSignInEvents are read tolerantly but were not seen on a real tenant, and non-interactive volume can be 5× interactive. Graduates once the hunting source has matched the Entra source on interactive rows for one window, and the non-interactive rows have been eyeballed once.",
      test: [
        "Tenant WITHOUT Entra ID P2 (no EntraIdSignInEvents in the hunting schema): choose Defender hunting in 🚦 or 🕵 — the message must say the schema has no Entra sign-in table and needs P2, not quote AADSignInEventsBeta; switching back to the Entra sign-in log must work without a reload.",
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
      builds: [25265, 25266, 25269, 25300],
      risk: "medium",
      what: "New beta-only tool: Defender for Cloud Apps session-control activity (CloudAppEvents via Graph runHuntingQuery, ThreatHunting.Read.All) joined to the Entra sign-in window's routing policies. Per CA policy with a session control: control, sessions routed, Defender actions, Defender policies matched, verdict. Event table with filters, Defender policies seen, schema panel. New js/sessionctl.js plus tile, screen, Help, wiring; demo policy d10, sign-in si-11 and sessionEvents.",
      why: "The classifier reads an undocumented schema: which ActionType a blocked download carries and where the matched policy name sits in RawEventData is known only from a real tenant with a real block. Graduates once one such tenant has confirmed the Blocked / Protected / Step-up rows are classified right and the routing join finds the CA policy. Also the first tool to use runHuntingQuery — the consent and the role requirement need one real run.",
      test: [
        "Large tenant, Last 24 hours: the progress line must count slices (slice 2 of 6 · 40s) and finish in minutes, not hang on Waiting for the first page; a slice over 2 minutes must be halved (visible as more slices) and, at 30 minutes, reported skipped in the note above the result.",
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
