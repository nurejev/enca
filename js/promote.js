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
      n: 198,
      title: "One sidebar rail for both themes — the brand's dark surface, in light AND dark (25362 rewound in 25364)",
      tools: ["All tools"],
      builds: [25362, 25364],
      risk: "low",
      what: "css/workspace.css: the sidebar's colours come from --workspace-rail tokens (surface, ink, muted, selected, selected-ink, colour-scheme) instead of literal values, and the same tokens drive the expanded, collapsed and mobile navigation, hover, focus and the native scrollbar. 25362 gave the dark theme an INVERTED rail (a lightly tinted light surface with dark brand text) and 25363 made that rail cream; both were reviewed on the beta site and rejected — 25364 removes the dark-theme overrides, so the rail is the brand's dark surface with the lemon selected row in light, dark and auto, which is what it was before 25362. What stays from 25362: the token plumbing, so a brand palette still colours the rail, and the mobile menu uses the same rail as the desktop one.",
      why: "Presentation-only CSS scoped to the sidebar. Navigation behaviour, policy data and tenant operations are unchanged. The one thing to look at after promotion is a customer brand palette whose --green-deep is light — the rail follows it either way, as it did before 25362.",
      test: [
        "Beta site, dark theme: the sidebar is the dark green rail with white text and the lemon selected row — NOT cream, NOT a light tint. Light theme: the same rail. Auto: the same rail whichever way the OS is set.",
        "Switch theme in the account menu while a tool is open: the rail does not change colour; the page around it does.",
        "Collapse the sidebar (the chevron) and expand it: icons and T-numbers stay legible on the dark rail in both states.",
        "Narrow the window under 1240 px and open the mobile menu: the same dark rail, not the page surface.",
        "Branding settings, pick the purple mockup palette: the rail takes that brand's deep colour and the selected row its accent, in both themes.",
        "Keyboard: Tab through the rail — the focus ring is visible on the dark rail and on the selected row.",
      ],
      files: ["css/workspace.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
  "n": 197,
  "title": "Remove obsolete September rollout controls (T33 1.6)",
  "tools": [
    "SMS & voice retirement"
  ],
  "builds": [
    25361
  ],
  "risk": "low",
  "what": "Remove the migration panel, state, read/write/history handlers and styles. Remove opt-out fields and advice from the report, home tile, Help and tool note. Preserve the SMS/voice scan and registered-method exports.",
  "why": "Removes obsolete controls and their authentication-method policy write path. No tenant configuration is changed by this release. Existing scan permissions and verdict logic remain unchanged.",
  "test": [
    "VERIFIED 2026-09-14: 37 offline regression tests passed, including verdict/method export retention and scope-only fallback. Toolbar ordering and plain-text checks passed.",
    "VERIFIED 2026-09-14: Edge demo initial screen, scan, all four verdict filters, rescan, registered methods, Markdown, CSV and notification draft passed with no JavaScript errors. Removed panel stays absent. Desktop and mobile screenshots inspected.",
    "PENDING real tenant: run with AuditLog.Read.All and confirm the same users, verdicts and method lists as build 25360; confirm no pause/resume controls or authentication-method write consent are offered.",
    "PENDING real tenant: refuse registration consent and confirm scope-only results still show unknown registration data. See review/2026-09-14/BETA-25361.md."
  ],
  "files": [
    "js/app.js",
    "js/smsvoice.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tools/regression.test.cjs",
    "review/2026-09-14/BETA-25361.md"
  ]
},
    {
      n: 196,
      title: "\ud83d\udcf5 Methods registered — the record behind every verdict, in the table, the Markdown and the CSV (T33 1.5)",
      tools: ["SMS & voice retirement"],
      builds: [25360],
      risk: "low",
      what: "js/smsvoice.js: METHOD_LABELS (every documented methodsRegistered value to a short label), methodLabel, defaultOf (the default-method field in both its dialects resolved to a registered method), methodsList (default first, password dropped) and methodsWord; classify returns the raw methods array (null when the report was not read); toMd gains a Methods registered column, toCsv gains methodsRegistered (raw values) and methodsRegisteredLabels. js/app.js: svMethods draws the list as tags — default bold and starred, phones in the retirement colour, raw Graph name on hover — in a new column between Phishing-resistant and Phone role. index.html: Help bullet. No verdict logic touched.",
      why: "Low: a display of data the tool already reads, added beside the columns that summarise it. The one thing to check on a real tenant is the label table — a methodsRegistered value the report returns that is not in METHOD_LABELS prints as the raw value, which is deliberate and harmless, but a value that IS labelled wrongly would mislead. The default marker depends on the preferred-method field arriving as one of the known dialect words; an unknown word leaves no star rather than a wrong one.",
      test: [
        "Demo tenant, \u25b6 Check the tenant: Maria's row lists Phone (mobile) \u2605 alone in the retirement colour, verdict locked out Feb 1; Pieter's lists Authenticator push \u2605 then Phone (mobile), verdict migrate; Fatima's lists Passkey (device-bound) \u2605 then Authenticator push, verdict passkey-ready; the scanner account reads none, verdict no phone method.",
        "Hover a tag: the title shows the raw Graph value (mobilePhone, microsoftAuthenticatorPush) and, on the starred one, the sentence about the default.",
        "Real tenant with AuditLog.Read.All: every locked-out row lists phone methods and nothing else; every migrate row lists a phone plus at least one non-phone, non-passkey method. A row that contradicts this is a bug in the sets in js/smsvoice.js, not in the column.",
        "Real tenant: find a user known to have a Temporary Access Pass, a hardware OATH token or Windows Hello for Business — each shows under its label, not as a raw value. Any RAW camelCase value in the column is a methodsRegistered value the label table lacks: note it, it is not an error.",
        "Real tenant, a user whose default is SMS: Phone (mobile) is starred and first. A user whose default is Authenticator push: that tag is starred and first, the phone after it. Both dialects of the preferred-method field (sms / voiceMobile vs mobilePhone) resolve to the same star.",
        "Refuse AuditLog.Read.All on the run: the column shows ? on every row, like the three flag columns beside it.",
        "\ud83d\udcdd Export MD: the table has a Methods registered column carrying the same words with (default) after the starred one. \u2b13 Export CSV: methodsRegistered holds the raw values joined by semicolons and methodsRegisteredLabels the words; password never appears in either.",
        "The filter chips, the counts in the summary line, the Phone role column and \u2709 Notify users are unchanged: click each chip and compare the counts to a run of build 25359 on the same tenant.",
      ],
      files: ["js/smsvoice.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
  "n": 195,
  "title": "Stable tab layout and compact Who is subject controls",
  "tools": [
    "All tools",
    "Who is … to CA"
  ],
  "builds": [
    25359
  ],
  "risk": "medium",
  "what": "Keep subtab strip position stable, reserve scrollbar space, observe active toolbar height, give Who is subjects matching compact intros and a group dropdown, and restore the wave log-source selector.",
  "why": "Changes shared tab navigation and the group selection control; results, permissions and existing write confirmations are unchanged.",
  "test": [
    "VERIFIED 2026-09-14: 35 offline tests, toolbar/plain-text checks and browser demo checks passed. Tab anchor and left edges remain stable, the three closed desktop intro cards match, rapid switching/keyboard focus work, and the group dropdown completes a demo read. Responsive checks at 1600/1280/1024/390px and 13 additional host tabs passed. Live-tenant checks remain pending; see review/2026-09-14/BETA-25359.md.",
    "From a long user result, scroll down and switch A group, Compare users, A user. The tab row keeps its vertical position and all screens keep the same left edge; previous result data and inputs remain available. Repeated or rapid switching must not restore the wrong screen position.",
    "At desktop width the three closed intro cards have equal heights. Open About this tool with the keyboard: full scope and permission descriptions remain available.",
    "Choose an existing demo group in the dropdown: it runs the group read and makes report actions available. Names and member counts are shown; missing groups are disabled. Typing a different group still works. Verify the selected sign-in log source agrees between user and group.",
    "At 1600, 1280, 1024 and 390px: no horizontal document overflow, reachable controls, and no sticky overlap after wrapping. Also check Checks, Baseline, What-If and Policy building blocks subtab alignment.",
    "REAL TENANT REQUIRED: verify deployment/persona group counts, arbitrary group lookup and both Defender log sources with appropriate permissions. See review/2026-09-14/BETA-25359.md for completed and pending validation."
  ],
  "files": [
    "js/app.js",
    "css/workspace.css",
    "index.html",
    "js/version.js",
    "tools/regression.test.cjs"
  ]
},
    {
  "n": 194,
  "title": "Workspace, evidence desk and guided rollout",
  "tools": [
    "Policies",
    "Checks",
    "Guided rollout"
  ],
  "builds": [
    25357,
    25358
  ],
  "risk": "medium",
  "what": "List-first layout, detail inspector, tenant context, mobile navigation and keyboard dialogs; guided flow delegates to existing tools. CloudFellows loads a backup ZIP; Joey Fetch latest opens a freshly fetched, complete release in the import review. Sidebar background, hover and selection follow the active brand palette.",
  "why": "Changes navigation and modal focus throughout the app.",
  "test": [
    "VERIFIED 2026-09-14, build 25358: 34 offline tests and structural/plain-text checks passed. Browser demo verified ZIP picker, fresh Joey import handoff and stale-read rejection with fixtures; branded sidebar light/dark/system-dark and mobile at 390px. Live release, real CloudFellows ZIP and tenant writes remain pending; see review/2026-09-14/BETA-25358.md.",
    "Branding: apply a non-green brand, inspect the desktop sidebar background, hover, active row and tool numbers in light/dark/automatic mode, then open mobile navigation at 390px. All colours follow the active theme with readable labels. Return to the default brand and verify no previous brand colours remain.",
    "Scope and Plan: CloudFellows Choose ZIP opens the file picker and imports the selected backup into the existing policy review; cancel and retry the same file. No tenant writes occur until the existing confirmation.",
    "Joey Fetch latest: force a fresh read, show release and commit in the import review, and include groups and named locations. Simulate failed refresh with a cached bundle, incomplete dependencies and repeated clicks: no stale import or duplicate preparation. Shared E-Admins policies must still be requested from the CloudFellows ZIP.",
    "REAL TENANT / NETWORK REQUIRED: fetch the current Joey release, verify policy and dependency names in import review, then validate assignments and permissions before any write. See review/2026-09-14/BETA-25358.md for completed and pending checks.",
    "Demo at desktop and 390px: select a policy, inspect its original definition, filter states, switch Cards/List/Matrix and return without losing selection.",
    "Keyboard: open a home launcher, open nested policy dialogs, Tab stays inside the top dialog and Escape restores focus.",
    "Run Checks, filter high findings and select two findings: assessment, policy and recommendation must follow the selection.",
    "Select policies, open Guided rollout, visit all four stages. Go-live stays disabled until all acknowledgements are checked; the next click opens the existing state confirmation. A changed selection clears acknowledgements.",
    "REAL TENANT REQUIRED: verify impact report scope, timestamps and capped/partial indicators before accepting enforcement. No simulated or unobserved result may be shown as verified."
  ],
  "files": [
    "js/workspace.js",
    "js/accessibility.js",
    "css/workspace.css",
    "js/app.js",
    "js/render.js",
    "index.html"
  ]
},
    {
  "n": 193,
  "title": "Imports preserve scope and verify replacement state",
  "tools": [
    "Import"
  ],
  "builds": [
    25357
  ],
  "what": "Refuse missing material references; stage disabled, read back, activate to approved state, verify, then retire previous version.",
  "why": "Multi-request writes need real Graph readback and consent checks before production.",
  "test": [
    "Offline tests: unresolved exclusion and missing app cause zero writes; readback failure or mismatch leaves the old policy unchanged.",
    "REAL TEST TENANT REQUIRED: replace an enabled policy; observe staged Off, verified On, then old Off, with matching UI and report states.",
    "REAL TEST TENANT REQUIRED: deny old-policy disable after successful replacement; report partial failure and identify the newly created policy, with no automatic duplicate retry.",
    "REAL TEST TENANT REQUIRED: normal import, as-is E-Admins, report-only replacement and baseline switch. Confirm target scope and actual states before accepting the result."
  ],
  "files": [
    "js/import.js",
    "js/app.js"
  ]
},
    {
  "n": 192,
  "title": "Analysis distinguishes unsupported evidence from protection",
  "tools": [
    "Gap analyse",
    "What-If",
    "Who is",
    "CA validator"
  ],
  "builds": [
    25357
  ],
  "what": "Shared restricted guest scope, exact device predicates, string insider risk, mandatory-MFA rules and fail-closed membership collection.",
  "why": "Restricted external metadata and unsupported expressions intentionally remain unresolved.",
  "test": [
    "Run offline regression suite for compound filters, insider risk, guest type and home tenant, unread groups/roles and OR/AND controls.",
    "REAL TENANT REQUIRED: deny membership reads; no coverage report may be produced from the failed run.",
    "REAL TENANT REQUIRED: restricted external-user policy without type/home-tenant metadata must be unknown, including exports.",
    "Run What-If with a compound device filter: result is incomplete with the expression shown, never a definite grant based on the first clause."
  ],
  "files": [
    "js/cascope.js",
    "js/whatifeval.js",
    "js/analyze.js",
    "js/whois.js",
    "js/validator.js",
    "js/app.js"
  ]
},
    {
  "n": 191,
  "title": "Bounded transport, complete exports and deployment checks",
  "tools": [
    "All tools"
  ],
  "builds": [
    25357
  ],
  "what": "Bounded Graph batches retain API version; ambiguous gateway errors do not retry writes. Exports abort on missing pages, nginx locations retain headers, demo IDs are unique and CI gates publication.",
  "why": "Transport and export failure paths need verification as well as happy paths.",
  "test": [
    "Offline suite: persistent 429 returns a failure after the retry budget; explicit v1.0 endpoint remains v1.0.",
    "Inject a renderer failure: ZIP and DOCX do not download a partial archive. Render ordinary demo PDF, PNG and Word exports successfully.",
    "SELF-HOSTING REQUIRED: request /, /index.html and /selfhost-branding.json; verify X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy on each.",
    "GitHub Actions checks must pass before container publish; pull requests run checks without pushing an image."
  ],
  "files": [
    "js/graph.js",
    "js/export.js",
    "js/demo.js",
    "selfhost/nginx.conf",
    "tools/regression.test.cjs",
    ".github/workflows/docker.yml"
  ]
},
    {
      n: 190,
      title: "\ud83d\udd17 User or Group analyzer on the shared verdict surface, and js/verdict.js (T19 1.2, R57)",
      tools: ["User or Group analyzer", "All tools"],
      builds: [25356],
      risk: "medium",
      what: "NEW js/verdict.js: Verdict.tile / Verdict.tiles / Verdict.callout, with the column count derived from the number of tiles instead of a hand-set wo-3 / wo-5 class, and title attributes escaped there rather than at each call site. Loaded right after js/version.js because js/promote.js already holds a tile. css/app.css: wo-2 and wo-6 grid widths, a 760px two-column fallback, and .gu-sticky pins at var(--sticky-tools) instead of 106px with its jump offset measured from --sticky-tools plus --gu-strip. js/app.js: syncStickyTops also sets --sticky-tools (header + tab bar + host strip + this screen toolbar) and --gu-strip; T19 single-subject and sweep headers emit tiles and a callout; the per-area blocks and the not-read card become .wo-card with data-wo-fold and call the shared applyFolds / foldClick; the relationship line becomes wo-fact pills in an About card; plural() added.",
      why: "Medium: T19 renders live Entra, Intune, Microsoft 365 and Azure configuration, so its two render paths cannot be exercised against the demo set at all \u2014 everything below has to be checked on a real tenant. The counts, jumps and filters are the same data through the same handlers; what changed is how they are drawn. Two things worth watching: the tiles make the sticky strip about 80 pixels taller than the pills were, so a jump has further to travel (measured, not guessed); and --sticky-tools is new machinery that every screen computes, though only this tool reads it so far.",
      test: [
        "Real tenant, \ud83d\udd17 Sweep tenant: five tiles across \u2014 groups swept, no usage found, dangling ids (only when there are any), services read, not read. The dangling tile is red, no-usage and not-read are amber when they are not zero and grey when they are. Click each: all clears the filters, no-usage and dangling filter the table, services opens the receipt panel, not-read jumps to that card. Exactly what the pills did.",
        "The same sweep, above the tiles: a callout naming the dangling ids and the unreferenced groups. With neither, no callout at all.",
        "Read one group: a tile for the total and one per area in scope, each area tile jumping to its card. An area with nothing found is grey and not clickable. Untick an area in Where to look and its tile goes.",
        "A subject where a service is refused (no Azure reader, or Purview denied): a Not read tile in amber plus a callout saying the counts are a floor. Both gone on a clean read.",
        "Click an area heading: the card folds and the chevron turns. Reload and re-read the same subject \u2014 it is still folded. Fold \ud83d\udd75 Who is' cards too and confirm the two tools remember separately.",
        "THE FIX: scroll a long result. The result strip must pin directly BELOW this screen toolbar with no overlap \u2014 at 1500 by 800 the toolbar reads 111 to 173 and the strip 173 onwards. Before this build the strip sat at 106 and covered the mode buttons.",
        "Click a jump tile while scrolled: the area card lands clear of the strip, not behind it.",
        "\ud83d\udcdd Export MD, \u2b13 Export HTML and \u2b13 Export CSV are unchanged \u2014 none of them reads the header markup.",
        "Every other tool that draws tiles is untouched in this build (\ud83d\udd75 \ud83c\udf0a \ud83d\udd12 \ud83d\udec2 \ud83e\udd25 and the promotion queue): open each and confirm its tiles look exactly as they did. They migrate to the shared helper in a later build.",
        "At 760 pixels and below, a tile row is two across rather than five or six, and nothing overflows sideways.",
      ],
      files: ["js/verdict.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 189,
      title: "\ud83e\uddf1 The host tab strip moves above the head card, pinned (all eight hosts, R57)",
      tools: ["All tools"],
      builds: [25355],
      risk: "low",
      what: "js/app.js: mountToolTabs builds the strip into a .tool-tabs-bar inserted as the SECTION's first child instead of the toolbar's first row, registers it with the sticky ResizeObserver and calls syncStickyTops; unmountToolTabs removes it from the section; syncStickyTops measures the active screen's strip into --tabs-h (0 where there is none). css/app.css: .screen.tool > .tool-tabs-bar pins at --sticky-nav with z-index 41 and scrolls sideways rather than clipping; .screen.tool > .toolbar pins at --sticky-nav + --tabs-h; the old .tool-tabs order and flex-basis rules are gone; .screen.tool > .readme no longer needs to be the first child. tools/check-toolbar-order.js fails a .tool-tabs written into a toolbar, which is now the old shape.",
      why: "Low: no tool's behaviour, read or output changes, and the strip carries the same buttons doing the same thing. It is a position change on 21 screens across eight hosts. Two things to look at after promotion: the strip and the toolbar are now two pinned rows rather than one, so any screen whose toolbar changes height has to keep stacking correctly (measured, not assumed \u2014 but it is the failure mode that hid \ud83c\udf0a's picker); and on a narrow window the strip scrolls sideways, which is new behaviour for it.",
      test: [
        "Open \ud83d\udee1 Checks: the four tabs are the FIRST thing on the screen, above the head card. Before this build they were under it, about a screen down.",
        "Scroll a long result on each host: the strip stays pinned and the toolbar pins directly beneath it \u2014 they must not overlap. At 1500 by 800 scrolled 900 pixels the strip reads 111 to 166 and the toolbar 166 to 228 on every one of the eight.",
        "Switch tabs while scrolled down: the new tool opens with the strip still pinned in the same place.",
        "A screen with no strip (\ud83d\udc65 CA groups, \ud83d\udeaa Exclusion analyzer, \ud83d\udee1 Restricted AUs): no strip, --tabs-h reads 0px, and the toolbar sits exactly where it did before.",
        "\ud83d\udd0d Gap analyse and \ud83d\uddc2 Policies share one screen: opening \ud83d\udd0d puts the strip in, opening \ud83d\uddc2 takes it out again, and the toolbar's offset follows both ways.",
        "Narrow the window to about 400 pixels on \ud83e\udde9 Policy building blocks: all five tabs stay one row, the strip scrolls sideways to reach the last of them, and the page does not scroll sideways. Before this build three were clipped away entirely.",
        "Production host: \ud83e\uddec Baseline's \ud83d\udcd6 Deployment guide tab and \ud83d\udee1 Checks' \ud83d\udcd0 CIS tab are hidden there. A host left with one visible tab shows NO strip, and --tabs-h reads 0 on it.",
        "node tools/check-toolbar-order.js exits 0. Write a .tool-tabs into any toolbar in index.html and it must FAIL.",
      ],
      files: ["js/app.js", "css/app.css", "tools/check-toolbar-order.js", "js/version.js"],
    },
    {
      n: 188,
      title: "\ud83c\udf0a The wave picker stops hiding behind its own controls (T30, R57)",
      tools: ["Who is the wave to CA", "All tools"],
      builds: [25354],
      risk: "low",
      what: "index.html: screen-wave's two sibling toolbars become one (wvToolbar2 is gone), in slot order \u2014 search, wvPicker chips, the Sign-ins window as a tb-win, \ud83d\udd0e Read wave, the exports. Every control kept its id. tools/check-toolbar-order.js: it now finds every toolbar a screen owns rather than only the first, fails a screen that has two, and that is how the \ud83c\udf0a row was found at all.",
      why: "Low, and it fixes something a user could hit every time they used the tool: two sticky rows pin to the same offset, so on any scroll the upper one is covered by the lower one. Measured before the fix at a 1500 by 800 window scrolled 700 pixels \u2014 both rows at top 111, overlapping by 24 pixels, the picker entirely behind the controls. The thing to look at after promotion is the wrap: on a tenant with many wave groups the picker chips and the controls now share one wrapping row rather than two fixed ones.",
      test: [
        "\ud83d\udd75 Who is \u2014 A group (the wave): the toolbar is one row \u2014 search, then the wave chips, then Sign-ins, then \ud83d\udd0e Read wave, then the exports once there is a result.",
        "Read a wave, then scroll the result: the whole toolbar stays pinned as ONE block and the chips stay visible and clickable. Before this build the chips disappeared under the controls after about 30 pixels of scroll.",
        "Pick a wave from a chip, then read a different group by typing in the search box \u2014 both paths still work, and the chips still show which wave is selected.",
        "A tenant with many wave groups: the row wraps and the actions stay hard right on whichever line they land on; nothing overlaps at 1500, 1100 or 820 pixels.",
        "node tools/check-toolbar-order.js exits 0. Re-add a second toolbar to any tool screen and it must FAIL naming that screen.",
      ],
      files: ["index.html", "tools/check-toolbar-order.js", "js/version.js"],
    },
    {
      n: 187,
      title: "\ud83e\uddf1 The last four screens that were not like the others (\ud83d\udd2e \u2696 \ud83d\udd17 \ud83d\udd12, R57)",
      tools: ["What-If", "Compare users", "Group usage", "Protect exclusions", "All tools"],
      builds: [25353],
      risk: "low",
      what: "index.html: \ud83d\udd2e What-If and \u2696 Compare users move their wi-actions group out of the form card into their existing toolbar as tb-actions (Compare's Differences only tick becomes a toolbar child in the extras slot); \ud83d\udd17 Group usage gains a toolbar holding its mode segment and its action group, both taken out of the form card; \ud83d\udc65 CA groups, \ud83e\udd25 Apps with no service principal and the filter row in \ud83d\udd0d Gap analyse's panel gain toolbar ids (cgToolbar, sgToolbar, anToolbar); \ud83d\udd12 Protect exclusions declares data-no-toolbar with its reason. css/app.css: the wi-actions rule is deleted, its two users having become tb-actions. tools/check-toolbar-order.js: a missing toolbar id and an undeclared missing toolbar now fail instead of printing a note.",
      why: "Low: markup moves inside three screens plus three id attributes. Every control kept its id, and nothing binds a handler by position, so the buttons work where they now sit. What a reader will notice is that the primary action of the two form tools moved from the foot of the form to the top right, in the sticky bar \u2014 that is the point, but it is the one thing somebody could dislike. Worth knowing: this leaves 32 addressable toolbars and one declared exception, so any screen that turns up later without either fails the commit.",
      test: [
        "node tools/check-toolbar-order.js \u2014 exits 0, reports 33 tool screens and 32 toolbars, and prints exactly one note: \ud83d\udd12 Protect exclusions, no toolbar, declared, with its reason. Delete the data-no-toolbar attribute and it should FAIL; put it back.",
        "\ud83d\udd2e What-If: the mode strip is on its own row, \u25b6 What If, Reset and Export MD are hard right beneath it, and the form below no longer ends in a button row. Fill the form and press \u25b6 What If \u2014 it runs and the result appears as before. Scroll the long form: the button stays in view.",
        "\u2696 Compare users (from \ud83d\udd75 Who is \u2014 Compare users): Differences only sits to the LEFT of \u2696 Compare and Reset. Tick it and run: the comparison hides matching rows exactly as it used to.",
        "\ud83d\udd17 User or Group analyzer: the two mode buttons are at the left of the toolbar, the five buttons at the right. Switch to One group or user \u2014 the form below swaps, the buttons stay put. Run a sweep in demo and confirm the exports appear in the toolbar rather than in the form.",
        "\ud83d\udc65 CA groups and \ud83e\udd25 Apps with no service principal: everything in their toolbars still works (search, the numbered segment, the chips, the CSV file picker, refresh and the exports). Their toolbars now have ids, which changes nothing visible.",
        "\ud83d\udd0d Gap analyse: the user filter row inside its panel still filters; it just has an id now.",
        "\ud83d\udd12 Protect exclusions: unchanged \u2014 the scan prompt, the ticks and the run all sit in the result as before. Open \ud83d\udc65 CA groups \u2465 Protect too and confirm the same renderer still draws there.",
        "At about 820 pixels wide, all three reshaped toolbars wrap without the actions landing on top of the controls.",
      ],
      files: ["index.html", "css/app.css", "tools/check-toolbar-order.js", "js/version.js"],
    },
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
