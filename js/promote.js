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
  productionBuild: "v1.0.286",

  items: [
    {
      n: 69,
      title: "🧬 Both baselines render as one table",
      tools: ["Baseline Policies", "Baseline (Joey Verlinden)"],
      builds: [25157],
      risk: "low",
      what: "The Cards / Table toggle is removed from the baseline screen and the table is the only view, in every catalog. blView, blDefaultView and the two view buttons are gone; Baseline.renderCards, its policyCard helper, the ICON map and the 23 CSS lines only they used are deleted. Status filters, search, Export MD, Refresh and Import baseline are untouched. Also fixes Collapse all under the \"Not in baseline\" filter: Baseline.personas() selected the card view's row set (baseline entries only) rather than the table's, so with that chip active it returned nothing and the button did nothing — it now mirrors renderTable's filtering exactly. Help and both tiles updated.",
      why: "Presentation only — nothing about the comparison itself changes, and the table renderer is the one already used for the CloudFellows catalog on every open. The reason it is worth promoting is that the split was per-catalog: table for CloudFellows, cards for the community ones, so the same screen answered the same question two ways and the two baselines could not be read against each other.",
      files: ["js/app.js", "js/baseline.js", "index.html", "css/app.css", "js/version.js"],
    },
    {
      n: 68,
      title: "\ud83d\udd22 Permanent T-numbers for the tools (R33)",
      tools: ["All tools"],
      builds: [25154],
      risk: "low",
      what: "Each TOOL_VERSIONS entry carries `t`, a permanent number assigned in the order the tool entered ENCA (T01\u2013T31, reconstructed from the first commit that added each tile). Rendered in the tile corner and the tool header next to the per-tool version, and searchable in the command palette \u2014 T07, or a bare 7, with an exact number match outranking everything. Help, What's new and Roadmap deliberately carry none. The numbering rule lives in version.js beside the numbers. CSS: .tool h3 gains right padding so the wider badge cannot sit on a heading.",
      why: "A label. It reads nothing, writes nothing and changes no behaviour \u2014 the only visible risk is layout, and the heading padding is there for exactly that. Worth eyeballing one long tile title with an UPDATED chip before promotion, and worth promoting EARLY rather than late: the value of the number is that it is stable, so the sooner both channels agree on it the fewer notes exist that predate it.",
      files: ["js/version.js", "js/app.js", "css/app.css", "index.html"],
    },
    {
      n: 67,
      title: "\ud83c\udff7 A tenant's own groups can go in the persona vaults (R28)",
      tools: ["Restricted AUs", "Protect exclusions", "Import", "Conditional Access groups", "Create documentation"],
      builds: [25153, 25155],
      risk: "medium",
      what: "New module js/camap.js: a per-tenant group \u2192 persona mapping held in localStorage under the tenant id, with JSON export/import. Group routing everywhere now goes through CaMap.codeOf (tenant mapping first, Rmau.codeForGroup second) \u2014 rmauTarget in \u2465 Protect, the persona chips, \uff0b Bulk add, ruBaselineGroups and Importer.fixedCode. Editor panel \ud83c\udff7 Group personas in \ud83d\udee1 Restricted AUs with an unmapped-group scan (resolves the group ids the loaded policies reference via /directoryObjects/getByIds). Mapped groups are read by id for the bounded prefix scans. The mapping is printed in the \ud83d\udee1 Markdown report and in the restricted-unit pages of \ud83d\udcc4 Create documentation. 25155 adds what 25153 left out: the \ud83d\udce5 Import home-tile tag, and per-tool version bumps for the three tools that changed behaviour without moving (\ud83d\udd12 Protect 1.7, \ud83d\udc65 CA groups 4.2, \ud83d\udcc4 Create documentation 1.6). Promote both builds together.",
      why: "MEDIUM because it changes where a WRITE puts a group: \u2465 Protect and \uff0b Bulk add place group objects into restricted administrative units, and a vault is an authorisation boundary \u2014 the wrong one hands a persona's scoped administrator another persona's exclusions. Nothing is inferred (exact id or exact display name only) and an empty mapping leaves every existing routing decision byte-for-byte as it was, so the risk is entirely in what an operator states. It graduates once a real tenant has mapped a group and the placement has been eyeballed in the unit afterwards. Note for promotion: R28 was reverted once at build 25100 for storing the mapping in each unit's description \u2014 this build writes nothing to the directory at all.",
      files: ["js/camap.js", "js/app.js", "js/import.js", "js/rmau.js", "js/rmaudoc.js", "index.html", "js/version.js"],
    },
    {
      n: 66,
      title: "\ud83c\udf10 Named locations report what is wrong with them (R37)",
      tools: ["Named locations"],
      builds: [25152, 25155, 25156],
      risk: "low",
      what: "Locations.findings(list, raws) \u2014 a pure function over the location list and the policies already in memory \u2014 raises four checks: dangling policy reference to a missing location id, empty country location, overly broad IP range (/0 or /8, /32 for IPv6, raised a level when the location is trusted), and untrusted IP location where policies consume All trusted locations. Surfaced in a findings panel above the list, a \u26a0 badge per row/card, the per-location report and the inventory Markdown export (findings ahead of the inventory table). No new Graph call and no writes. 25155 fixes the block-list suppression, which never fired: an underscore is a word character in a JS regex, so \\bblock found no boundary in _Blocked IPs \u2014 the exact name the check was written to stay quiet about. Boundaries are now explicit non-alphanumerics, blocklist is matched as one word, and \"bad\" is gone because it suppressed Bad Homburg office. 25156: the broad-range finding NAMES the prefix to narrow to, per range and per address family (/24 for an office and /16 at the widest for an estate; /48 for an IPv6 site and /64 for a network), and the explanation states only the family that actually fired — an IPv6 finding used to open by explaining what a /8 is. Promote all three builds together.",
      why: "Reads only, and additive \u2014 nothing existing changes behaviour. It graduates once the four checks have been seen against a few real tenants, because the one that can be WRONG is the untrusted-IP check: it is suppressed where a Block policy names the location or the name says so, and the honest test of that suppression is a tenant with a block list nobody told us about. A check that cries wolf about the normal case is the failure mode to watch for here, not a crash \u2014 25155 fixed exactly that: an underscore is a word character in a JS regex, so \\bblock never matched _Blocked IPs and the suppression the card promised never fired.",
      files: ["js/locations.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 65,
      title: "\ud83e\uddec The bundled baseline is renamed to CloudFellows (R35)",
      tools: ["Baseline Policies"],
      builds: [25151],
      risk: "low",
      what: "Display-name rename of the bundled catalog from \"Limon-IT baseline \u2014 R26.6 (v3.x)\" to \"CloudFellows baseline \u2014 R26.6 (v3.x)\". The catalog's label and author in baseline.js drive the tool header, the summary line and the Markdown gap report, so all three follow from one edit; the tile, the home overview, the Help section and the code comments in mslearn.js / baselineData.js were changed too. The catalog id stays limonit and the CAB-SEC / CAD-SEC group names are untouched. No policy, version or comparison logic changed.",
      why: "Cosmetic and reversible, but it is what a customer sees stamped on a gap report, so it should graduate on a deliberate release rather than ride along with unrelated work. Check on promotion that a Drift snapshot taken before the rename still compares cleanly \u2014 that is the one thing the untouched catalog id is protecting.",
      files: ["js/baseline.js", "js/baselineData.js", "js/mslearn.js", "js/app.js", "index.html", "README.md", "js/version.js"],
    },
    {
      n: 64,
      title: "🧬 On a baseline tenant, Backup and Documentation produce the baseline — not the tenant",
      tools: ["Backup (JSON)", "Create documentation"],
      builds: [25150, 25156],
      risk: "low",
      what: "On a tenant matched by BASELINE_TENANTS, 🗄 Backup (JSON) is scoped to the persona CAxxx policies — the same rule checkScope() applies to the Gap and MS Learn checks there. The policies are filtered BEFORE backupDependencyIds() runs, so groups, auth strengths, named locations, auth contexts and terms of use are read from the surviving policies only. The confirmation carries a 🧬 warning naming the skipped count, the zip is named ConditionalAccess-BASELINE-… and carries a BackupScope.json (which Import skips by name), and a selection with no baseline policy is refused with the reason. No override, by design. 25156 puts 📄 Create documentation through the same helper: the export modal states the scope and the skipped count, and every format carries it into the deliverable (PDF cover line, Markdown blockquote, Word title, SCOPE.txt beside the PNGs) from one shared sentence. The restricted-unit appendix is deliberately NOT filtered — on a baseline tenant those units are the baseline's own persona vaults. Header badge tooltip and Help updated. These two ship together: scoping the zip and not the Word file leaves the tenant half-covered, and the Word file is the one that gets forwarded.",
      why: "Reads only, and inert on every customer tenant — nothing outside cloudfellows.dev changes behaviour. It graduates once a baseline export has been taken with it and the zip eyeballed against the catalog, because the failure it prevents (a tenant's own policies shipped inside a baseline) is only visible at import time in somebody else's tenant.",
      files: ["js/app.js", "js/export.js", "js/import.js", "index.html", "css/app.css", "js/version.js"],
    },
    {
      n: 63,
      title: "\ud83d\udce5 Import finishes the job on the groups it reuses (R04)",
      tools: ["Import"],
      builds: [25149],
      risk: "medium",
      what: "Each reusable group in the \u267b\ufe0f preflight carries a tick for what is still open on it \u2014 \ud83d\udeab disable nesting, \ud83d\udd12 file it into its persona vault \u2014 with every impossible case (role-assignable, dynamic, Microsoft 365, already protected, shared by two personas, no vault yet) refused on the row with its reason. Nothing is pre-ticked, membership is never touched, and the writes run AFTER the policies import, so an import that fails leaves existing groups alone. The nesting write is verified by reading the value back, and a refusal is reported as still unprotected rather than rounded to done. Completes R04.",
      why: "In production a group the import REUSES gets neither nesting disabled nor a place in its vault \u2014 build 285 says so on screen and then sends the reader to two other tools. Every baseline imported into a tenant that already holds some of its groups leaves those groups editable by any tenant-wide Groups Administrator, which is the exact exposure the persona vaults exist to close.",
      files: ["js/app.js", "js/import.js", "index.html"],
    },
    {
      n: 62,
      title: "🚦 Sign-in failures gather the CA interrupts",
      tools: ["Sign-in failures"],
      builds: [25145, 25146, 25147],
      risk: "low",
      what: "Enforced mode also gathers the sign-ins Conditional Access INTERRUPTED (abandoned MFA prompt, MFA enrolment, device auth, terms of use). Graph has no 'interrupted' CA status — those records carry 'success' plus an interrupt error code — so a second server-filtered fetch on the interrupt codes (50072/50074/50076/50079/50097/50158/500121) is deduped into the failures, each interrupt attributed to the applied policies that imposed a control (an interrupt without one, e.g. per-user MFA, is dropped as not CA's doing). 25147: attribution narrowed by error code — MFA-family codes to MFA/auth-strength controls, 50097 to device/sign-in-frequency controls, 50158 to terms of use, with fallback to all control-bearing policies when nothing matches. Interrupted badge per sign-in, Blocked/Interrupted chips, counts in header, per-policy table, Markdown and CSV.",
      why: "Reads only, same scope, one extra server-filtered Graph query in enforced mode. Graduates once the interrupt attribution has been eyeballed against the portal on a real tenant.",
      files: ["js/signins.js", "js/app.js", "index.html", "js/version.js"],
    },
    {
      n: 61,
      title: "🎫 Licence gap",
      tools: ["Licence gap"],
      builds: [25135, 25136, 25137, 25138, 25139, 25140, 25141, 25142, 25143, 25144],
      risk: "medium",
      what: "New tool (BETA): the Conditional Access licensing obligation computed on TARGETED users — what Microsoft's new overage warning is actually about — instead of the evaluated-users number the licence usage blade shows. Per-policy targeting resolved on real members (transitive groups, roles, exclusions), the cross-policy UNION compared with P1/P2 seats matched on service plans, risk-based policies flagged as the P2 obligation, plus the why-the-gap-exists explanation and the mitigation options with trade-offs. 25136: the gap is NAMED — targeted users without the licence assigned are listed by UPN (screen + export), disabled accounts flagged as cleanup; the P2 half always renders, stating when nothing creates an obligation. 25137: the list lives in a searchable pop-out with a to-license / cleanup / resource breakdown on the card, and 🏷 Check mailbox types (MailboxSettings.Read, on demand) labels shared/room/equipment accounts as never licensed — and where the delegated read is denied, classifies the refusal (unlicensed account + existing mailbox = likely shared/resource); per-policy Gap column shows which policy drags unlicensed users in; admin-accounts groups (several) can be excluded — type-ahead picker, per-group chips, union of transitive members, exclusion stated in result + export. New js/licgap.js plus tile, screen, wiring, .lg-bar CSS. After Rudy Mens' Get-EntraLicenseGap.ps1 (lazyadmin.nl).",
      why: "Reads only and self-contained, covered by the two baseline scopes. It graduates once the counts have been checked against a few real tenants — a licensing number is the kind of output people take to procurement, so it must not be wrong.",
      files: ["js/licgap.js", "js/app.js", "index.html", "css/app.css", "js/version.js"],
    },
    {
      n: 34,
      title: "CIS Benchmark Help section",
      tools: ["CIS Benchmark"],
      builds: [25079],
      risk: "low",
      what: "The Help section written for 📐 CIS Benchmark, held back from production because the tool is beta-only — a Help entry for a tile nobody has would be a lie.",
      why: "NOT promotable on its own — 📐 CIS Benchmark is beta-only, and a Help entry for a tile nobody has is a lie. It travels with the tool whenever that graduates.",
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
