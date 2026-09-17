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
  productionBuild: "v1.0.313",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
    "p1-scale-1-3": { title: "P1 reliability and large-tenant execution — work packages 1–3" },
  },

  items: [
    {
      n: 219,
      title: "📥 Joey import — groups attached by name, 🔧 re-attach, 🚨 E-Admins from a CloudFellows backup, 🤖 agent policies in the create shape (Import 2.13.1)",
      tools: ["Import"],
      builds: [25383, 25384],
      risk: "high",
      what: "js/import.js: prepareBundle() turns every group reference into a name key and plans one group per name — one source id with two files gives each policy the file with its own name, a policy's own exclusion group under another name (CA403, CA404) is created under the convention name; ensureDependencies() creates or finds each group by name, maps key to tenant id, records groupFailed, reads the directory once (getByIds) for ids no file explains and, for a backup rather than a repository, binds a source id the tenant still has to the same object; buildPolicyPayload() throws for an unresolved key and for an unknown group, user or named-location id; nulls are dropped from the create body; the readback comparison skips OData annotations; a compliantNetworkNamedLocation is referenced by 3d46dbda-8382-466a-856d-eb00cbc6b910 and never created; mode shipped (assignment as shipped, no deploy groups, no supersede); forceOff for merged E-Admins; mergeShared(); repairPlan(), repairPolicies(), repairReport(); decodeBytes() for UTF-16 zip and folder files; isAgentPolicy() failure hint; 25384: agentWriteShape() writes agent policies in the documented create shape (no users None block or empty includeServicePrincipals beside includeAgentIdServicePrincipals, conditions.agents becomes users AllAgentIdUsers, no OData annotations, an agent filter or users plus agents refused with the reason), one retry without the undocumented agentContext on a 400 with the note in the row and report, and the Workload ID licence warning only for a file that has workload-identity policies. js/app.js: imLoaded() prepares the bundle and pre-selects shipped for a catalog that is not CloudFellows; panels 🔧 re-attach, 🚨 E-Admins and 👥 groups attached by name; the 🧩 As shipped radio; 🤖 preview and 🚨 E-Admins Off tags. js/baselineLive.js: bundle() says fromRepository. js/workspace.js: the Joey source text. tools/import-joey.test.cjs: 10 tests.",
      why: "Mihai, 17 Sep: importing Joey's baseline gave a lot of errors on the agent policies, the groups were not imported correctly, and with Joey as the default baseline the E-Admins policies could not be imported; then: get the list of groups, create them yourself and attach them to the CA. His tenant showed 34 referenced-but-gone group ids — ids from Joey's own tenant, his break-glass group among them, excluded by 29 policies. HIGH: a policy pointing at a group that does not exist excludes nobody, so switching those policies On enforces them on the break-glass accounts. Production has the same importer. 25384: the Courseware import report (on 25382) showed all five agent policies refused with a bare 400 and a Workload ID warning in a file without workload-identity policies; Graph's beta create examples 5–9 document a different body for agent policies than the read the files carry.",
      test: [
        "Tenant with the broken Joey import (👥 CA groups shows 34 referenced but gone): ↗ Guided rollout → Joey → Fetch latest. The import dialog opens with 🔧 RE-ATTACH listing each policy and, per id, the group it meant (CA-BreakGlassAccounts - Exclude on nearly every row). Click Create … and re-attach: the ledger shows Groups, then one ✓ per policy; the report lists every swap. 👥 CA groups → Refresh: referenced but gone is 0 and the break-glass group lists the policies that exclude it.",
        "Open the same import again: no 🔧 panel — nothing is left to swap.",
        "Fresh test tenant, Joey import, 🧩 As shipped pre-selected: all 38 policies import Off and none is reported as differing from the approved plan. CA005 AnyPlatform excludes its own AnyPlatform group and the iOS/Android CA005 its own; CA403 excludes CA403-GuestUsers-…-PersistentBrowser - Exclude; CA000 includes All users. 👥 CA groups shows no referenced-but-gone ids.",
        "CA505: without Global Secure Access signaling the row fails with the compliant network and agent hints and no named location is created; with signaling on it imports and excludes All Compliant Network locations.",
        "CA501–CA504 carry the 🤖 preview tag; in a tenant without Agent ID a refusal names Microsoft Entra Agent ID and the Agent 365 licence.",
        "Courseware (33 Joey policies already there): import again — the 5 agent policies are created Off; CA503–CA505 read back with Users: All agent users, CA501/CA502 with Agent identities: All; the report says for CA503 whether the endpoints-only condition was kept or left out, and has no Workload ID licence warning.",
        "If an agent policy is still refused: in Graph Explorer, POST the “Block all agent identities” body from Graph's beta create docs (example 6) to /beta/identity/conditionalAccess/policies with state disabled. Refused too → it is the tenant (Agent ID or licensing), not ENCA.",
        "Sign in without the right to create groups: the ledger's Groups row is partly done and every policy naming a group that could not be created fails with the reason — no policy is created on a missing group.",
        "Joey import → 🚨 panel → ＋ E-Admins from a CloudFellows backup ZIP: six rows appear ticked with the E-Admins Off tag; import; CA1102–CA1105 include CA-BreakGlassAccounts - Exclude (not CAB-SEC-U-BreakGlass), CA1100 and CA1101 Emergency_Access1 and 2 with their authentication strength, all Off. A ZIP without E-Admins says so in the panel.",
        "CloudFellows ZIP restored into the CloudFellows reference tenant: groups bind to the same objects (the report says so), 🚀 Deployment groups is still pre-selected, no 🚨 panel.",
        "node --test tools/*.test.cjs green, tools/import-joey.test.cjs included; node tools/check-plain-text.js clean.",
      ],
      files: ["js/import.js", "js/app.js", "js/baselineLive.js", "js/workspace.js", "tools/import-joey.test.cjs", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 216,
      title: "\ud83d\udd17 Group analyzer reads Windows 365 (T19 1.4.0)",
      tools: ["User or Group analyzer"],
      builds: [25382],
      risk: "low",
      what: "js/groupuse.js: source w365 (area intune, CloudPC.Read.All) reads /deviceManagement/virtualEndpoint/provisioningPolicies?$expand=assignments and …/userSettings?$expand=assignments through intuneFamily; the cloudPcManagementGroupAssignmentTarget carries groupId like every Intune target, so intuneHits reads it unchanged. CloudPC.Read.All is added to AREA_SCOPES.intune, so the Intune area's consent prompt grows by one read scope.",
      why: "Low: a read-only source in the established descriptor shape, failing soft like the others (a tenant without Windows 365 gets a 404 note, not a failed run). The one thing to check is the extra consent — a tenant that has never granted CloudPC.Read.All will see it asked for with the Intune area.",
      test: [
        "Tenant with Windows 365: analyse a group that a provisioning policy is assigned to — one row under Intune › Windows 365 Cloud PC, sub Provisioning policy, how assigned; a group in the Cloud PC user settings shows a User settings row.",
        "Tenant without Windows 365: the Intune area still completes; the source is listed with a not-present note, no error banner.",
        "First run on a tenant that never consented CloudPC.Read.All: the Intune area asks for it once; declining leaves the other Intune sources working and this one reported as needing the permission.",
        "Sweep mode (every group): Windows 365 rows appear for the assigned groups only; a Cloud PC provisioning policy assigned to no group yields no row.",
      ],
      files: ["js/groupuse.js", "tools/groupuse-sources.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 217,
      title: "\ud83d\udd17 Group analyzer reads Intune role assignments, both directions (T19 1.4.0)",
      tools: ["User or Group analyzer"],
      builds: [25382],
      risk: "medium",
      what: "js/groupuse.js: source intuneRbac (area intune, DeviceManagementRBAC.Read.All) reads /deviceManagement/roleAssignments (expand roleDefinition first, plain shape with a roleDefinitions lookup as fallback via firstThatWorks). members ∩ ids → “member (may manage)”, resourceScopes ∩ ids → “in scope (is managed by)”; detail names the role, (custom), and the scope width (all devices / all licensed users / N scope groups). DeviceManagementRBAC.Read.All added to AREA_SCOPES.intune.",
      why: "Medium: the finding is a privilege statement (“members of this group can manage devices”), so a wrong direction would mislead. Both directions are labelled in words and the role is named. What would have to be true to graduate: on a real tenant a group that is a member of the Help Desk Operator assignment shows as member with that role, and the assignment's scope group shows as in scope — never the other way round.",
      test: [
        "Real tenant: analyse a group that is a MEMBER of an Intune role assignment — row under Intune › Intune role assignments, sub Member, how “member (may manage)”, detail “role: <name> · scope: …”.",
        "Analyse a group that is a resource SCOPE of a role assignment — sub Scope, how “in scope (is managed by)”, detail names the role and the member-group count.",
        "A custom role: detail carries “(custom)”; a built-in role does not.",
        "An assignment scoped to all devices: detail reads “scope: all devices”.",
        "Tenant where the signed-in user lacks an Intune RBAC read role: the source fails soft with the roleHint, the other Intune sources complete.",
      ],
      files: ["js/groupuse.js", "tools/groupuse-sources.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 218,
      title: "\ud83d\udd17 Enrolment configurations named for what they are (T19 1.4.0)",
      tools: ["User or Group analyzer"],
      builds: [25382],
      risk: "low",
      what: "js/groupuse.js intuneEnrollPlatform: label “Enrolment configurations”; kindOf maps the @odata.type to Platform restriction / Enrollment Status Page / Windows Hello for Business / Enrolment notification / Co-management authority / Windows backup and restore (unknown types keep the tail); the kind is both the detail and the row's sub. Same read as before — every non-limit deviceEnrollmentConfiguration was already read, only misnamed.",
      why: "Low: naming only; the hits are the same rows with better words. Check that a tenant's ESP assignment now reads as Enrollment Status Page.",
      test: [
        "Analyse a group with an Enrollment Status Page assigned: the row reads Enrolment configurations › Enrollment Status Page (was “platform restrictions · windows10EnrollmentCompletionPage”).",
        "A Windows Hello for Business enrolment policy assigned to the group: sub Windows Hello for Business.",
        "A platform restriction: sub Platform restriction — the row that used to be the only honestly named one is unchanged in meaning.",
        "Export MD of the run: the new sub labels appear in the source column.",
      ],
      files: ["js/groupuse.js", "tools/groupuse-sources.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 215,
      title: "\ud83d\udd11 What the user signed in with \u2014 T17 2.6.0 / T36 1.4.0 (a password where phishing-resistant MFA was required)",
      tools: ["Sign-in log", "Who is \u2026 to CA"],
      builds: [25381],
      risk: "medium",
      what: "js/signins.js: Signins.authOf(rec) reads authenticationDetails / authenticationRequirement / authenticationRequirementPolicies into { known, requirement, strength, steps, used, claim, mfaAsked, mfaOk, gap, passwordOnly, phishResistant, need, summary }; a step counts as the second factor by its METHOD (the password row carries the requirement too); parse() adds row.auth; build() adds authGap / authKnown and per-policy gap; CSV columns authRequired, authUsed, authGap; PHISH_RESISTANT exported. app.js 🚦: header count, auth:gap chip and filter, search over the summary, per-policy 🔑 count and detail line, card sub-line and detail (signed in with + the steps), MD column and line. js/whois.js: methodsOf(recs) (methods tally, gap with apps / needs / newest sample, strengths held to, phishResistant, claim, single) hung on log.mfa.methods; mfaStepOf returns missing (was fresh) for asked-and-not-given and never counts a primary step; mfaOf counts missing per app and total, and demanded policies include result failure; render: the 🔑 line and the red callout at the top of the 🔐 card, the third tile reads Asked, not given, the per-app Required cell says (n not given), the stopped table prints 🔑 under the result with the steps in the title; toMd for all three. css: .si-authgap, .si-steps. demo.js: si-3 (Alex Admin, Azure Management, Require MFA for all admins) carries the exact steps from Mihai's screenshot. Help for 🚦 and 🕵.",
      why: "Mihai, 16 Sep, from a sign-in log screenshot: T36 and T17 should include what a user used to sign in \u2014 the user must use phishing-resistant MFA but is using a password. The stopped table said WHICH policy failed her and never WHAT SHE BROUGHT; the two look identical in the list and have opposite fixes (a policy change vs registering a method). Medium: it also corrects a wrong number \u2014 the 🔐 card counted a strength that was asked and never given as a fresh prompt, which reads as “she did MFA” when she did not.",
      test: [
        "Demo: 🚦 Sign-in failures, Read: the header says “1 without the MFA asked”, a chip 🔑 MFA asked, not given (1); Sign-ins view: Alex Admin → Microsoft Azure Management reads “🔑 Password — Phishing-resistant MFA not provided” in red on the sub-line; open the card: signed in with + two steps (✓ Password · Password in the cloud — Correct password; ✗ (no method) — MFA required in Azure AD). Per policy view: Require MFA for all admins shows “🔑 1 without the MFA asked” and the detail line carries it.",
        "Demo: 🕵 alex.admin@contoso.com, Read user: the 🔐 card opens with “What she signed in with: Password ×1 · Held to Phishing-resistant MFA ×1”, a red callout naming Microsoft Azure Management and the never-used-a-passkey conclusion, the third tile “Asked, not given 1”, Fresh prompts 0; the table row says Require MFA for all admins (not “no applied policy carried an MFA grant”); the stopped table's Result cell carries the 🔑 line. Export MD: the same in the brief.",
        "Demo: 🕵 eva@contoso.com: Fresh prompts 1 (si-6), Satisfied by the token 1 (si-10), no red callout — the fixed step check must not move those.",
        "Real tenant, Entra sign-in log source: a user held to an authentication strength who signed in with a password: the rows read as above; a user whose MFA was satisfied by claim reads “MFA by a claim already in the token — MFA satisfied”. Switch to Defender hunting: every 🔑 line says the methods are not in the hunting source, no red, no callout.",
        "CSV from 🚦: three new columns after signInRisk; a gap row says yes.",
        "node --test tools/*.test.cjs green (12 suites); tools/check-plain-text.js clean.",
      ],
      files: ["js/signins.js", "js/whois.js", "js/app.js", "js/demo.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 214,
      title: "\ud83e\udee5 T39 0.3.0 \u2014 the apps table folds: one line per app, expand and collapse per row and for all",
      tools: ["Apps with no service principal"],
      builds: [25381],
      risk: "low",
      what: "js/spgap.js renderTable(R, filter, q, open, allOpen): one .au-sumrow.sg-row per app (chevron, name, id, sign-ins, verdict, a colspan-4 summary with the would / may / excluded-by counts and the newest sign-in date) and, when open, an .au-sumdet.sg-det row with a four-column grid of the pills and the evidence; .sg-foldbar above the table with ⊞ Expand all / ⊟ Collapse all and “n of m expanded”; the header row has one colspan-4 head. app.js: sgOpen (Set of app ids toggled by hand) and sgAllOpen (the default); data-sg-toggle flips an id, data-sg-all sets the default and clears the exceptions; .pol-link still opens the card first. css: .sg-folded (min-width 760 instead of 1300, 4th column auto), .sg-foldbar, .sg-row, .sg-det, .sg-detgrid, .sg-dk. Exports unchanged.",
      why: "Mihai, 16 Sep: T39 should have expand and collapse per item and global. The 0.2 table (queue 200) was seven columns and 1,300px wide; a tenant with sixty unregistered apps scrolled sideways through pills to find the one that mattered. Low: rendering only, the analysis and both exports are untouched.",
      test: [
        "Demo: 🫥, Read the 30-day app summary: two rows, both folded, the bar reads “0 of 2 expanded”, Collapse all disabled. Click the first row: it opens (▾, tinted), the four detail columns show Would apply / May apply / Excluded by / Newest sign-in, the bar reads 1 of 2. ⊞ Expand all: both open, Expand all disabled; click the first row: it closes and the other stays open; ⊟ Collapse all: none open.",
        "Type in the filter box and pick a chip: the open rows stay open. ⟳ Rescan: same.",
        "Real tenant with phantom exclusions: the summary line counts them (“2 excluded by”) and the red pills sit in the detail's third column. 📖 Read evidence: the summary's newest-sign-in date fills in per app.",
        "Export MD and CSV: unchanged from 0.2.",
      ],
      files: ["js/spgap.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 213,
      title: "\ud83d\udcbe Keep sign-ins on this device — R58 (T26 2.1.1 / T17 2.5.0)",
      tools: ["Sign-in log"],
      builds: [25378, 25379],
      risk: "high",
      what: "js/signinstore.js (new): IndexedDB store enca-signins with tenants / coverage / buckets, a memory backend for private mode, jsdom and the tests, and a fall-back to memory when IndexedDB fails mid-session; consent per tenant (on, ttlDays 1–30, at); coverage as merged [from,to) intervals per tenant × source × kind; buckets kept per hour and replaced per hour; purge() ages buckets past the tenant's ttl and cuts the coverage to match; forget / forgetAll; navigator.storage.persist() on consent. js/app.js readRoBuckets: with consent, window floored to the hour, settled = now − 2 h, gaps = missing(settled window, coverage) read through readSignInsHunting with from/to, stored and covered unless capped, the tail read every time; result.stored {hours, of, read} for the coverage line (roCoverageHtml). mountLogSourceSeg draws the 💾 button (class sistore, order 2 in css/app.css) after the segment; #siStoreModal (index.html) is the consent dialog with ttl select, Keep, Forget this tenant, Forget every tenant; SigninStore.purge() runs at sign-in. Roadmap: R58 (in beta today), S04 (self-hosted, planned); the two “nothing survives” roadmap paragraphs now name the exception; SECURITY.md has a paragraph on it; T26 Help has the bullet. Rows for the other tools are deliberately not stored. 25379: the first real run died twice — got.push(...records) over a week of buckets (call stack; Safari's argument limit) and then the tab (Safari error 5, memory) because hour × user × app × policy on a large tenant is millions of records a week. Buckets are per UTC DAY now (roBucketQuery bin 1d, SigninStore.UNIT, floorUnit, record.bin), every large append is a loop (append()), the window start is floored to the day with the store on, what the device holds is handed to onPartial first with note “held” (rendered at once under a From this device strip) and openImpact starts the read by itself when 💾 is on for the tenant on a hunting source. tools/report-impact-store.test.cjs has the day expectations, the held-first render and a 1.2-million-record run. 25380: 25379 still killed the tab — the read held every row of the window. readRoBuckets is a STREAM into a sink (sink.onRows(records, note)); readSignInsHunting gained opts.onRows (records handed over per slice, nothing kept, result.count); runImpact folds every slice into ReportImpact.accumulator and re-renders from finish() (at once for held, then every 3 s); roCache carries the accumulator for the reuse path; a stop finishes the accumulator as a partial window. The store keeps a day in CHUNKS of 4,000 (SigninStore.CHUNK; clearBuckets before a gap read, appendBuckets per slice with a session-wide chunk counter because four workers append to one day at once, forBuckets streams chunks back oldest first), IndexedDB VERSION 2 clears the old-shaped coverage and buckets on upgrade and keeps the consent.",
      why: "High: it is the first time ENCA keeps tenant data past the tab, and the promise “nothing is stored anywhere” is the one customers quote. Everything about it is built to keep the promise honest — off by default, per tenant, the dialog names the data, Forget is one click, the hosted site itself still stores nothing — but the copy has to be right everywhere it is made, and a wrong coverage computation would show a forecast that silently misses hours. What would have to be true to graduate: SECURITY.md, the roadmap, the Help and the dialog all describe the same thing; on a real tenant the second read after consent asks only for the new hours (the detail line shows one or two short queries, not the week) and the forecast equals a forced Rescan's; Forget empties IndexedDB (DevTools → Application → IndexedDB → enca-signins) at once.",
      test: [
        "node --test tools/signinstore.test.cjs tools/report-impact-store.test.cjs: interval arithmetic, consent, hour replacement, purge/ttl, forget; and the lifted readRoBuckets asking 168.5 hours on the first read, 3.5 an hour later, 168.5 on Rescan, 2.5 for a 1-day window on a full store, and never covering a capped interval.",
        "Real tenant, Hunting + non-interactive, Last 7 days, store OFF: the read runs as on 25377 (no “from this device” clause). Press 💾: the dialog names the tenant, what is kept, where, who can read it; Keep. The button reads “💾 Kept on this device” on the Report-only impact toolbar AND on the Failures toolbar.",
        "Run the read on the Perfetti-shaped tenant, Hunting + non-interactive, Last 7 days: it FINISHES (25378 and 25379 crashed the tab) and the tab's memory (Safari Develop → Show Web Inspector → Timelines, or Chrome Task Manager) stays flat while the days land; the coverage line ends with “💾 nothing held for this window yet — all 7 days read from Microsoft and kept on this device for next time”. DevTools → Application → IndexedDB → enca-signins → buckets holds one entry per day.",
        "Open the tab again an hour later: the read starts by itself, the forecast appears at once under a “From this device” strip, then one short query (today) lands and the strip goes; the coverage line says “7 of 7 settled days from this device, 0 days and the current day from Microsoft just now”. Per-policy numbers equal a ⟳ Rescan's on the same window.",
        "Next morning: “6 of 7 settled days from this device, 1 day and the current day from Microsoft just now” — one day-query plus today.",
        "Forget this tenant: IndexedDB is empty for the tenant, the button reads “Keep on this device”, the next read is a full one. Forget every tenant: the tenants store is empty too.",
        "Private window (IndexedDB blocked): Keep works, the dialog says “memory for this tab only”, a reload loses the store and no error is shown.",
        "Demo tenant: the button is disabled and the dialog does not open.",
        "Entra sign-in log source: the button is present, but the coverage line never mentions the device — the Entra rows are not stored.",
      ],
      files: ["js/signinstore.js", "js/app.js", "css/app.css", "index.html", "SECURITY.md", "SELF-HOSTING.md", "review/SIGNIN-STORE-DESIGN.md", "tools/signinstore.test.cjs", "tools/report-impact-store.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 212,
      title: "\ud83c\udf9a Report-only impact reads buckets, not rows, on the hunting sources (T26 2.0.0 → 2.2.0)",
      tools: ["Sign-in log"],
      builds: [25377, 25380],
      risk: "high",
      what: "js/signins.js roBucketQuery: let W (window, LogonType filter) / let P (mv-expand ConditionalAccessPolicies, report-only results by word or number) / union of three summaries — n (sign-ins per hour), na (reportOnlyNotApplied per hour × policy, with First/Last), ro (count, First, take_any of the control lists, arg_max(Timestamp, sample columns) by hour × policy × verdict × user × app × client × OS × trust × compliance × management × MFA requirement × both risk levels × logon type) — order by Hour desc, take cap. fromRoBuckets shapes each row through fromHunting with a one-entry policies JSON and sets n, firstDateTime, hour, bucket (an n row sets signIns). js/reportimpact.js build: every count adds rec.n || 1, first uses firstDateTime, records is the sum of signIns when any row carries it. js/app.js: readRoBuckets (own roCache, roReadKey with a “ro” tag, requireProduct + ThreatHunting consent) drives readSignInsHunting with opts.query/shape/kind ro/label; runImpact uses it for the hunting sources and falls back to readSignInWindow on an isRoRefusal error (roBucketsOk false for the session, toast); riBusyPanel, the head copy, the coverage line (roCoverageHtml) and the result sentence (“summarised by … in N queries”) follow the path. The source switch drops roCache with logCache. 25380: the query is RESHAPED — per UTC day; the user rows (Kind ro) grouped by day × policy × verdict × user × IsCompliant × IsManaged × AuthenticationRequirement × both risk levels only, with Apps = make_set(Application, 32); per-app counts are Kind a rows (day × policy × app); the one sample denial per user × policy is a Kind s row (arg_max over the reportOnlyFailure rows); totals (Kind n) only in the first part; the query takes policyId and runs once per report-only policy (readSignInsHunting opts.parts, partLabel) with RO_CAP 90,000. fromRoBuckets emits slim records (kind n/na/a/ro/s) with samples and app counts first. ReportImpact.accumulator(roPolicies).add(records).finish() replaces the one-pass build (build() still exists for the row path and the worker); finish() is pure and re-callable; bucket users take their sample from the s row and their deny evidence's trust/OS/client from it.",
      why: "High until a real tenant confirms it: the KQL has never run against a live hunting schema (the sandbox has none) — union, let, mv-expand, arg_max with many columns and take_any on tostring(dynamic) are all standard Kusto and all documented for advanced hunting, but the same was true of 25328's mv-apply and that shipped unverified too. The forecast is the tool people decide a go-live on, so a wrong count here is worse than a slow one. What would have to be true to graduate: on the same tenant, day and source, per-policy success / interrupted / failure / notApplied and the per-user rows from this build equal those of 25376 (row read), and the “sign-ins summarised” number equals the row count 25376 read. If the engine refuses the query, the fallback must land the row read without a second consent prompt.",
      test: [
        "node --test tools/report-impact-buckets.test.cjs: buckets and rows built from the same 2,880 synthetic sign-ins give identical per-policy and per-user results, samples are real sign-in ids, the denominator is the sign-in count; numeric result codes map; the query text carries the three Kinds, arg_max and the LogonType filter only when interactive-only.",
        "Real tenant with report-only policies, Defender hunting, Last 24 hours: the read finishes in a handful of queries (the header says “… summarised by Defender hunting in N queries”); switch to 25376 (or stop the store and force rows) on the same window: per-policy numbers identical, per-user rows identical.",
        "Same tenant, Hunting + non-interactive, Last 7 days: finishes in well under five minutes on the Perfetti-shaped tenant; the day-one “first day in progress” line shows within a minute.",
        "Expand a would-deny user: the sample sign-ins list real request ids, times, client, OS and location; the “needs a compliant device — device NOT compliant …” evidence is present.",
        "A staged policy with no traffic still shows as “no data”; a policy only ever out of scope shows “never in scope” with its out-of-scope count.",
        "Entra sign-in log source: unchanged — rows, 10,000 cap, “read from” wording.",
        "Fault injection: edit roBucketQuery to misspell arg_max in the console and run — the toast says the engine refused the summarised query, the row read runs and the forecast still renders.",
        "\ud83d\udd75 Who is Anna, \ud83c\udf0a the wave and \ud83d\udec2 Session controls after a T26 bucket read: they run their own row read (the bucket cache is not offered to them), and T26 does not re-read when opened again on the same window.",
      ],
      files: ["js/signins.js", "js/reportimpact.js", "js/app.js", "tools/report-impact-buckets.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 211,
      title: "\ud83e\uddf9 Housekeeping compares settings, not JSON (T01 2.12.6)",
      tools: ["Policies"],
      builds: [25376],
      risk: "medium",
      what: "js/policy-compare.js: config() strips @odata.* keys at every depth (strip()); walk() expands a null side as an object whose every setting is null, so a block against null yields per-setting rows and null-against-null rows are unchanged; grantControls.authenticationStrength is a LEAF compared and rendered as one row; text() renders a reference object as “name (id)” and any other object as one Setting: value line per entry — never JSON.stringify. A null leaf against an absent one is still a difference (the existing test keeps that).",
      why: "Medium: PolicyCompare.config feeds the Housekeeping ELIGIBILITY signature in js/import.js as well as the view. Stripping nested @odata makes two policies on the same authentication strength compare as identical configuration — which is correct, and which was wrong before (the annotation names each policy's own id) — but it is a change to what Housekeeping may offer for cleanup. What would have to be true to graduate: an older version whose only difference from its successor was that annotation now shows as matching configuration and is offered for cleanup only when it is Off and the successor On, as the rules already say.",
      test: [
        "node --test tools/policy-compare.test.cjs tools/housekeeping.test.cjs: 17 green, including the new 25376 case (block against null, strength as one row, no @odata row, no raw JSON, same-strength signatures equal).",
        "Real tenant, 🗂 Policies → 🧹 Housekeeping → Compare on a pair where the older version has a session control and the newer has sessionControls unset: rows read Session controls · Sign-in frequency · Enabled / Frequency interval / Authentication type, no curly braces anywhere in the table, and the controls the newer version also leaves null do not appear under Differences only.",
        "Same pair with an authentication strength on one side: one row “Grant controls · Authentication strength” reading “Multifactor authentication (00000000-0000-0000-0000-000000000002)” against Not configured; no “Authentication Strength@odata · Context” row.",
        "Two versions on the SAME strength and otherwise identical config: Housekeeping lists no configuration difference for the pair (it did before this build).",
        "Turn Differences only off: matching settings render as plain values, still no JSON.",
      ],
      files: ["js/policy-compare.js", "tools/policy-compare.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 210,
      title: "\ud83c\udf9a The hunting read keeps the slice length that worked (T26 1.6.0 / T17 2.4.0)",
      tools: ["Sign-in log"],
      builds: [25375],
      risk: "medium",
      what: "js/app.js readSignInsHunting: a STRIDE — the slice length that last worked — replaces the fresh 24-hour start of every day. It shrinks on a halving (size error or row cap), doubles after three whole slices in a row came back at a third of the cap or less, and is kept in localStorage per tenant, source and kind (enca-huntstride:<tenant>:<source>:<kind>). When no stride is known the first worker reads alone until one slice has landed (priming), then the others start at what it found. HUNT_WORKERS 4 (was 2). Reads filtered to a user or to enforced failures keep plain day slices. The reader also takes opts.from/to, opts.query, opts.shape, opts.kind, opts.cap and opts.label so a different query can run over the same slicing — unused in this build, groundwork for the bucket read. makeProgress line(): rows already back are said before the first whole step lands. tools/hunting-stride.test.cjs lifts the function out of app.js and asserts the query counts against a simulated tenant.",
      why: "Medium: the reader every hunting-source tool goes through changed shape. The result is the same rows — no slice is skipped, halves are still both read, the cap logic is unchanged — but the query count and the order the days land in differ, and priming means the first day is read by one worker before the rest start. What would have to be true to graduate: a real tenant's 7-day read returns the same row count as 25374 with fewer queries, and the stride the session leaves in localStorage is a sane one (between 15 min and a day).",
      test: [
        "node --test tools/hunting-stride.test.cjs: five green — 31 queries for the week that used to cost 49, the user-filtered read unchanged at 49, growth on an easy tenant, cap lowering below 15 minutes, from/to with a custom query.",
        "Real tenant (Perfetti-sized), Hunting + non-interactive, Last 7 days, \ud83c\udf9a Report-only impact: note the final query count on the detail line and compare with the same read on 25374 — expect roughly half. The per-policy counts must be identical.",
        "Same tenant, immediately re-read (\u27f3 Rescan): the detail line names the stride from the first query (e.g. “22 min slices”) and no 24-hour query is issued — localStorage enca-huntstride:<tenant>:huntall:rows holds a value between 900000 and 86400000.",
        "While the first day is being read the top line reads “N sign-ins · first day in progress” as soon as one slice has landed; before that, “Waiting for Microsoft's first response”.",
        "Small tenant, Defender hunting, Last 30 days: 30 queries, one per day, stride stays a day (no halving, no growth message).",
        "\ud83d\udd75 Who is Anna to CA on the hunting source: unchanged — one query per day, no stride on the line.",
      ],
      files: ["js/app.js", "tools/hunting-stride.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
{
  "n": 209,
  "title": "Preserve original policy names in all workspace titles",
  "tools": [
    "Policies",
    "Guided rollout"
  ],
  "builds": [
    25374
  ],
  "risk": "low",
  "what": "Remove generated aliases from list titles, inspector headings and rollout selection. Display the complete original policy name, preserving prefixes, CA numbers and versions; remove duplicate name subtitles. Long rollout names wrap inside their column.",
  "why": "The layout helper shortened CA-prefixed names to titles such as MFA · Global, making distinct policies look alike and treating UP-prefixed policies differently.",
  "test": [
    "PASSED: 104 offline tests and local Edge checks at light/1440px and dark/390px. Five fixture names remain exact in list, inspector, full detail, cards, matrix and rollout; full-name search, duplicate-subtitle removal and long-name rollout wrapping pass. Zero page exceptions. Validation: review/2026-09-15/BETA-25374.md.",
    "PENDING: live tenant and other browsers. No tenant writes, push or deployment. Existing production acceptance gates remain open."
  ],
  "files": [
    "js/render.js",
    "js/workspace.js",
    "css/workspace.css",
    "js/version.js",
    "index.html",
    "js/changelog.js",
    "js/promote.js",
    "tools/policy-names-browser.cjs",
    "review/2026-09-15/BETA-25374.md"
  ]
},
{
  "n": 208,
  "title": "Housekeeping: compare older and newer policy versions",
  "tools": [
    "Policies"
  ],
  "builds": [
    25373
  ],
  "risk": "low",
  "what": "Add a read-only field comparison to every Housekeeping pair. Show added/removed values and already resolved directory names, with differences-only and all-settings views. Share configuration normalization with cleanup eligibility; retain selection when comparison closes. Record Codex co-authorship on the implementation commit.",
  "why": "The previous dialog explained which categories differed, but could not show the exact extra exclusion, platform or control before a retirement decision.",
  "test": [
    "PASSED: 104 offline tests, including seven comparison tests; local Edge light/1440px and dark/390px acceptance covers exact additions/removals, name resolution, differences/all toggle, preserved selection, Escape, the CA008 exclusion/platform example, and mobile scrolling. Zero page exceptions. Validation: review/2026-09-15/BETA-25373.md.",
    "PENDING: live-tenant acceptance and other browsers. No Graph writes, remote push or production deployment are part of this change. Existing production gates remain open."
  ],
  "files": [
    "js/policy-compare.js",
    "js/import.js",
    "js/app.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tools/policy-compare.test.cjs",
    "tools/housekeeping.test.cjs",
    "tools/housekeeping-browser.cjs",
    "review/2026-09-15/BETA-25373.md"
  ]
},
{
  "n": 207,
  "title": "Housekeeping review for older policy versions",
  "tools": [
    "Policies"
  ],
  "builds": [
    25372
  ],
  "risk": "medium",
  "what": "Include older On and Report-only policies alongside Off predecessors when a higher version of the same CA number exists. Show status, assignment and configuration differences. Only matching Off predecessors of a newer On policy can proceed to deletion review; no preselected items. Recheck stable policy IDs before handoff. Restore the On-policy acknowledgement in the shared deletion dialog.",
  "why": "Housekeeping only listed old Off policies, hiding a report-only predecessor when the newer version was Off. A shared CA number alone also did not establish that configurations or assignments matched.",
  "test": [
    "PASSED: all 97 offline tests, including nine new cases covering the screenshot pair, active predecessors, successor states, raw-state precedence, numeric versions, CA families, configuration ordering, missing details and ambiguous successors.",
    "PASSED: local Edge fixture acceptance at light/1440px and dark/390px covers review visibility, disabled review rows, no preselection, stable IDs, stale eligibility, backup/typed confirmation and On acknowledgement. No deletion is executed.",
    "PENDING: live-tenant acceptance and other browsers. Existing P1-only, large-tenant network and tenant-write release gates remain open. Validation: review/2026-09-15/BETA-25372.md."
  ],
  "files": [
    "js/import.js",
    "js/app.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tools/housekeeping.test.cjs",
    "tools/housekeeping-browser.cjs",
    "review/2026-09-15/BETA-25372.md"
  ]
},
{
  "n": 206,
  "title": "Resume the last subtab when returning to an open workspace tab",
  "tools": [
    "Sign-in log",
    "Changes",
    "Gap analyse",
    "Who is to CA",
    "What-If",
    "Checks",
    "Policy building blocks",
    "Baseline",
    "Navigation"
  ],
  "builds": [
    25371
  ],
  "risk": "low",
  "what": "Remember the last visible subtab per open workspace tab. Restore it through the top tabs, sidebar, plus menu and neighbour selection after closing a tab. Browser history stores/restores tool and subtab, including the shared Policies/Coverage screen. Explicit destinations and closed-tab reset retain their normal behavior.",
  "why": "The top-level Sign-in log tab called the default T17 open function, even when the user left T26 mid-read. The same default-entry behavior affected other hosts. Browser Back previously showed the screen without updating the active tool.",
  "test": [
    "PASSED: all 23 subtabs across eight hosts resume through the top bar and sidebar in light/1440px and dark/390px local Edge demo runs.",
    "PASSED: a deliberately delayed T26 analysis is started only once across a tab round-trip; source, range, per-user view, search and results survive. Plus menu, neighbouring-tab close, Back/Forward, Policies/Coverage history, explicit default links and close/reopen also pass.",
    "PASSED: 88 offline tests, including remembered route selection, hidden production subtab fallback, and closed/removed subtab fallback. Toolbar order, plain text, syntax and diff checks pass.",
    "PENDING: live-tenant network-delay acceptance and other browsers. No tenant reads/writes, remote push or production deployment for this fix. Validation: review/2026-09-15/BETA-25371.md."
  ],
  "files": [
    "js/app.js",
    "tools/navigation.test.cjs",
    "tools/navigation-browser.cjs",
    "review/2026-09-15/BETA-25371.md",
    "js/version.js",
    "index.html",
    "js/changelog.js",
    "js/promote.js"
  ]
},
{
  "n": 205,
  "title": "Result search suggestions and extended screen/export acceptance",
  "tools": [
    "Change audit",
    "Policies",
    "Gap analyse",
    "Exclusions",
    "CA groups",
    "Baseline",
    "What-If simulations",
    "Apps with no service principal",
    "Policy building blocks",
    "Restricted AUs",
    "Licence gap",
    "User or Group analyzer"
  ],
  "builds": [
    25370
  ],
  "group": "p1-scale-1-3",
  "risk": "low",
  "what": "Local suggestions for T16 and 15 other result filters, actor UPN/member matching in T16, unbroken tool version badges, and independently scrolling report tables with escaped pipe handling. Investigation confirms all seven beta-only policies contain preview features (v1.0 error 1037). Existing beta policy reads remain in place.",
  "why": "Result filters without suggestions make users remember exact names. Suggestions must remain useful on large results without another directory read. The API inventory difference must be explained before any endpoint migration.",
  "test": [
    "PASSED: 85 offline tests, including late matches in 250k identities, stale-search cancellation, bounded suggestions and escaped report table values.",
    "Open T16, read the audit log and type a resource, actor UPN or changed field. Pick a suggestion: matching rows remain and the list is not rewritten. Clear the search to restore rows.",
    "PASSED: 136 local light/dark desktop/mobile screen/view checks, 96 report/export cases and targeted T19/T31 search tests; supplemental Checks/CIS/Teams reports rendered. No page exceptions. See review/2026-09-15/BETA-25370.md for exact passed/pending scope.",
    "Live read-only PASSED: 98 v1.0 / 105 beta policies; all seven additional policies return v1.0 HTTP 400, message 1037 requiring beta. P1-only, live write/readback/rollback, real large-tenant latency, optional source and full assistive-technology acceptance remain pending."
  ],
  "files": [
    "js/search-suggest.js",
    "js/app.js",
    "css/app.css",
    "tools/search-suggest.test.cjs",
    "tools/release-acceptance-browser.cjs",
    "tools/search-browser.cjs",
    "review/2026-09-15/BETA-25370.md",
    "review/2026-09-15/policy-inventory-25370.json",
    "js/version.js",
    "index.html",
    "js/changelog.js",
    "js/promote.js"
  ]
},
{
    "n": 204,
    "acceptance": "Follow-up beta 25370: the inventory difference is explained by Graph service error 1037 (preview features); see queue 205 and review/2026-09-15/BETA-25370.md. Earlier evidence below describes the 25369 run.",
    "title": "Work package 4 acceptance fixes and work package 5 production proposal",
    "tools": [
        "Gap analyse",
        "Navigation",
        "Self-hosting"
    ],
    "builds": [
        25369
    ],
    "group": "p1-scale-1-3",
    "risk": "medium",
    "what": "Stream coverage input/results in 500-row batches and restore global result ordering. Close mobile navigation on Escape and keep narrow identity cards and the channel ribbon from covering content. Normalize site permissions during container build. Acceptance report covers synthetic scale, adverse reads, 16 theme/brand/viewport combinations, Docker and bounded read-only checks in the user-selected P2/Intune tenant. A production proposal is prepared but not executed.",
    "why": "The previous worker response blocked the UI for more than one second at scale, and owner-only local files produced nginx 403 responses. Passing read-only tests is not approval for live policy changes or a P1-only certification. Stable and beta Graph policy inventories differed in the test tenant, so retain the beta policy endpoint.",
    "test": [
        "PASSED: 79 offline tests including failed second pages (401/403/404/429/502/503/504), download timeout/cancellation, missing batch response and streamed global ordering.",
        "PASSED browser: 16 default/custom-brand, light/dark/auto and 1440/390px combinations; Escape and keyboard theme changes; reduced motion; no page overflow in the tested Wave screen.",
        "PASSED scale: 50,000 x 40 and 250,000 x 8 coverage fixtures, one million log events; measured worker transfers and Stop latency are recorded in BETA-25369.md.",
        "PASSED limited live reads: organization identity, subscription evidence, users/groups, policies, named locations, audit log and interactive/non-interactive sign-in endpoints. These are CLI/API checks with a delegated account, not every ENCA tool end-to-end.",
        "PENDING: P1-only tenant, feature-specific optional sources, dedicated-tenant write/readback/rollback, real large-tenant latency, full screen-reader audit and resolution of stable/beta policy inventory differences. No production push/deployment was performed."
    ],
    "files": [
        "js/analysis-jobs.js",
        "js/analysis-worker.js",
        "js/workspace.js",
        "css/workspace.css",
        "Dockerfile",
        "selfhost/nginx.conf",
        "tools/acceptance-browser.cjs",
        "tools/acceptance-scale.cjs",
        "tools/acceptance.test.cjs",
        "tools/regression.test.cjs",
        "review/2026-09-14/BETA-25369.md",
        "review/2026-09-14/PRODUCTION-PROPOSAL-25369.md",
        "js/version.js",
        "js/changelog.js",
        "js/promote.js",
        "index.html"
    ]
},
{
    "n": 201,
    "acceptance": "Additional evidence and remaining gates: review/2026-09-14/BETA-25369.md; queue item 204.",
    "title": "Work package 1 — trustworthy operations and results",
    "tools": [
        "Imports",
        "Conditional Access groups",
        "Exclusions",
        "Compare users",
        "Wave",
        "User or Group analysis"
    ],
    "builds": [
        25368
    ],
    "risk": "high",
    "group": "p1-scale-1-3",
    "what": "Complete membership copy and readback before group repointing; explicit paging coverage and unknown scope; full exclusion members, paged Wave references and roles; no false absent-resource result on selected failed reads; immutable log context and ARM read correction.",
    "why": "Changes conclusions and write safeguards. Keep the original assignments on any unverified replacement. Partial evidence must never authorize rollout.",
    "test": [
        "PASSED offline: source 403, copy failure and missing readback member all prevent policy repointing; a verified copy permits it.",
        "PASSED offline: 600-item final page capped at 500 is incomplete; membership beyond 999 is retained; unresolved comparison and Wave scope remain unknown.",
        "PENDING dedicated test tenant: nested and role-assigned groups, replication delay, protected actions, restricted AU permissions and partial writes. Verify the original policies and memberships remain safe."
    ],
    "files": [
        "js/app.js",
        "js/graph.js",
        "js/compare.js",
        "js/exclusions.js",
        "js/cagroups.js",
        "js/groupuse.js",
        "js/wave.js",
        "js/version.js",
        "js/changelog.js",
        "js/promote.js",
        "index.html",
        "tools/workpackages.test.cjs",
        "review/2026-09-14/BETA-25368.md"
    ]
},
{
    "n": 202,
    "acceptance": "Additional evidence and remaining gates: review/2026-09-14/BETA-25369.md; queue item 204.",
    "title": "Work package 2 — P1 contract and import compatibility",
    "tools": [
        "Imports",
        "Guided rollout",
        "Sign-in log",
        "Report-only impact",
        "Intune checks"
    ],
    "builds": [
        25368
    ],
    "risk": "high",
    "group": "p1-scale-1-3",
    "what": "Capability model distinguishes P1, P2, Workload Premium and additional products. Import preview, policy writes and restores enforce known entitlement and available policy slots. Stable interactive Graph queries and explicit beta non-interactive queries. Endpoint contract and remaining beta dependencies are documented.",
    "why": "Unknown subscription evidence blocks writes. A SKU cannot establish per-user compliance or Defender permissions. Do not advertise live P1 certification from fixture tests.",
    "test": [
        "PASSED offline: P1 does not imply P2, Intune or Workload Premium; unknown/suspended entitlement and 240-slot exhaustion block preflight.",
        "PASSED offline: direct, batch and restore policy writes invoke the guard; non-interactive Graph query explicitly requests the event types.",
        "PENDING P1-only and P2-only tenants: verify core reads, role and consent errors, non-interactive preview, and each separately entitled optional source.",
        "PENDING staging writes: P1 baseline import, P2 risk-policy refusal and successful entitled import; keep premium conditions intact."
    ],
    "files": [
        "js/capabilities.js",
        "js/app.js",
        "js/graph.js",
        "js/signins.js",
        "js/reportimpact.js",
        "review/2026-09-14/P1-ENDPOINT-CONTRACT.md",
        "js/version.js",
        "js/changelog.js",
        "js/promote.js",
        "index.html",
        "tools/workpackages.test.cjs",
        "review/2026-09-14/BETA-25368.md"
    ]
},
{
    "n": 203,
    "acceptance": "Additional evidence and remaining gates: review/2026-09-14/BETA-25369.md; queue item 204.",
    "title": "Work package 3 — responsive reads and background analysis",
    "tools": [
        "Gap analyse",
        "Exclusions",
        "Wave",
        "Sign-in log",
        "Report-only impact",
        "All read progress panels"
    ],
    "builds": [
        25368
    ],
    "risk": "medium",
    "group": "p1-scale-1-3",
    "what": "Shared four-slot directory read queue, in-flight deduplication, cancellable paging/backoff, full Retry-After delays and per-attempt GET deadlines. Persistent progress clock and first-page impact results. Two-worker analysis queue, indexed Wave states and bounded matrix rendering. Explicit two-million-evaluation budget.",
    "why": "Large tenants need truthful partial coverage and a responsive UI. Worker processing reduces blocking but serialization, rendering and Microsoft latency still need scale acceptance.",
    "test": [
        "PASSED offline: read deduplication/concurrency, queued/backoff cancellation, first-response elapsed time, progress reset, worker parity, queued-worker cancellation and oversized-matrix refusal.",
        "PASSED local browser: demo coverage, Wave, exclusion scan and available navigation; 10,000 users x 100 policies ran in a worker while a UI timer continued. See BETA-25368.md for measured timing.",
        "25369 PASSED synthetic 50k/250k-user and 100k/1m-event fixtures, browser heap/long-task and worker Stop checks. PENDING actual large-tenant request latency, throttling, source failure/reconnect and first useful network result.",
        "25369 PASSED 16 Wave theme/brand/width combinations, rail palette, clipping, reduced-motion and keyboard/Escape checks. PENDING other screens and full assistive-technology acceptance."
    ],
    "files": [
        "js/analysis-jobs.js",
        "js/analysis-worker.js",
        "js/analyze.js",
        "js/app.js",
        "js/graph.js",
        "js/wave.js",
        "css/workspace.css",
        "js/version.js",
        "js/changelog.js",
        "js/promote.js",
        "index.html",
        "tools/workpackages.test.cjs",
        "review/2026-09-14/BETA-25368.md"
    ]
},
    {
      n: 200,
      title: "\ud83e\udee5 The apps table drawn as a list, not as the policy matrix (T39 0.2)",
      tools: ["Apps with no service principal"],
      builds: [25366, 25367],
      risk: "low",
      what: "js/spgap.js renderTable: the wrapper and table classes change from mwrap-x / mtable (the sticky policy-matrix table) to cg-tablewrap / cg-table (the list table 👥 CA groups uses) with sg- hooks; the app id cell and the policy pills lose their inline styles for classes. css/app.css: the sg- rules — sideways scroll on the wrap, fixed column widths on a 1240px table, right-aligned counts, monospace id, policy pills one per line wrapping inside their column; the Sign-ins header drops its (30 d) into a tooltip. 25367: the Once it exists column is 180px and the verdict chip may wrap inside it, and every cell clips — WOULD BE ENFORCED ran over the Would apply column on a real tenant. No data, verdict or export changes; toMd and toCsv are untouched.",
      why: "Low: presentation only, one table in one tool. The thing to check is that nothing in the tool relied on the matrix classes — the row click handler reads data-sg-app on the tr, which is unchanged.",
      test: [
        "Real tenant with an All-resources grant policy: every WOULD BE ENFORCED chip sits inside its own column, nothing runs into Would apply; NO CONDITIONAL ACCESS wraps to two lines inside the column rather than overflowing.",
        "Demo tenant, \ud83e\udee5 Apps with no service principal, \u25b6 Read: the table has padded rows, the App header left-aligned above the names, the app id in monospace under each name on one line, Sign-ins right-aligned, and NO empty surface under the last row — the box ends where the rows end.",
        "Narrow the window to about 800 px: the box scrolls sideways and the App column keeps its width; the page does not scroll sideways.",
        "Filter chips and the search box still filter the same rows; \ud83d\udcd6 Read evidence still fills the Newest sign-in column.",
        "\ud83d\udcdd Export MD and \u2b13 Export CSV: byte-identical to build 25365 on the same demo run.",
        "Real tenant: an app with several Would apply policies wraps its pills inside the column instead of pushing the table wider.",
      ],
      files: ["js/spgap.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
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
