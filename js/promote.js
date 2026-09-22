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
  productionBuild: "v1.0.321",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
    "p1-scale-1-3": { title: "P1 reliability and large-tenant execution — work packages 1–3" },
  },

  items: [
    {
      n: 260,
      title: "Register ENCA in your own tenant from the browser — the default sign-in (R59)",
      tools: ["Sign-in", "Home"],
      builds: [25438, 25439, 25443],
      risk: "medium",
      what: "25443: S.own (owner tenant = signed-in tenant) → the wizard is a CHECK of the registration this copy signs in with, found by appId, PATCHed with updateBody (existing redirect URIs kept, permissions set, name/audience untouched), no connection saved; not own → the owner column shows the owner TENANT id, never the app's display name. The Connected app block in the account menu carries the button (wcOnboard); the menu row is gone. 25439: the pending flag is read synchronously at the top of afterSignIn and Onboard.pending() holds maybeShowWhatsNew back until enca:onboard-closed; #obModal z-index 335. js/onboard.js (Onboard): the browser version of New-EncaAppRegistration.ps1 -SingleTenant. Front door on the sign-in card (loginOnboard, hidden on BRANDING.host): sets a session flag, clicks Sign in, and afterSignIn opens the wizard once the tenant loaded. After sign-in: a band before #overview (re-painted on enca:wchome) and an account-menu row, only when /me/memberOf holds Global, Privileged Role, Application or Cloud Application Administrator AND Graph.connectionInfo() says the current registration is owned by another directory; dismissable per tenant in localStorage. Wizard: what changes (the SINGLE-TENANT.md table, app name, the exact SPA redirect URI, localhost, assignment, org-wide consent) → the plan with impact and recovery → the run (Graph.ensureScopes for Application.ReadWrite.All + DelegatedPermissionGrant.ReadWrite.All (+ AppRoleAssignment.ReadWrite.All), the Graph SP's oauth2PermissionScopes for the ids, POST or PATCH /applications by displayName, readSettled, the SP, appRoleAssignedTo me THEN appRoleAssignmentRequired, the AllPrincipals oauth2PermissionGrant, EncaConn.save selected) → default sign-in (this browser done; on an azurecontainerapps.io host a button sets ENCA_CLIENT_ID + ENCA_TENANT_ID via Resource Graph + GET-template-then-PATCH-whole under ARM_SCOPES, dropping ENCA_AUTHORITY; copy buttons for authConfig.local.js, docker -e and template parameters; Sign in again = EncaConn.use). Demo simulates every step. The scope list is asserted equal to the script's $DelegatedScopes by tools/onboard.test.cjs.",
      why: "Mihai: a web-based onboarding single-tenant flow, before login as the front door and after login as an option, and make it the default login. R14 shipped the PowerShell route in 273; this is the same registration made from the page, so a customer standing up a self-hosted copy — or a customer on a hosted multitenant copy who wants their own consent record — does not need PowerShell.",
      test: [
        "On a self-hosted or beta host the sign-in card shows the 🪪 line; on enca.limon-it.nl it does not (isProdHost).",
        "25439: with enca-seen-build behind the current build, click the sign-in line and sign in: the wizard opens ALONE; close it and What's new appears; sign in normally (not via the line): What's new appears as before.",
        "Click the line → sign in with the shipped registration as a Global Administrator → the wizard opens by itself on the home page once the tenant loaded.",
        "Step 1: the app name defaults to ENCA — <tenant>, the redirect URI is exactly the origin + path this copy is served from (compare with the ⚙ panel's string).",
        "Step 2: the op list, then Create: ONE consent popup naming Application.ReadWrite.All, DelegatedPermissionGrant.ReadWrite.All and AppRoleAssignment.ReadWrite.All against the SHIPPED registration, for you only.",
        "Step 3 on a REAL tenant: the run creates the application (App registrations shows it, single-tenant, SPA with that redirect URI, 18 delegated permissions, implicit grant off), the service principal, the assignment (Users and groups lists you, Assignment required = Yes), and the consent (Enterprise applications → Permissions shows the admin consent); re-running with the same name UPDATES the same app (the object id must not change).",
        "Step 4: the ⚙ panel on the sign-in card shows the new connection selected; Sign in again → the consent screen names YOUR app in YOUR tenant, and the 🔒 Permissions panel lists the consented scopes.",
        "On an Azure Container App with Contributor rights: Set ENCA_CLIENT_ID and ENCA_TENANT_ID → a new revision; a private window signs in with the new registration; other env variables (ENCA_BRANDING) untouched. Without rights: ARM's 403 is shown as a sentence, the copy buttons still work.",
        "Sign in as a Conditional Access Administrator only: no band, no menu row, and the sign-in line still works but the run fails at the first write with Graph's own message.",
        "Sign in to a tenant whose registration is already its own (ENCA_CLIENT_ID set, or the beta host): no band; the account menu's Connected app panel says App registration in this tenant and offers Check this registration…; the wizard's step 1 names THIS tenant as the owner, the run PATCHes that application by ID and leaves every redirect URI it already had.",
        "Not now hides the band for that tenant only; the account menu row stays; another tenant still shows the band.",
        "node --test tools/onboard.test.cjs — 7 tests; the whole suite; the plain-text check.",
      ],
      files: ["js/onboard.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "SINGLE-TENANT.md", "tools/onboard.test.cjs"],
    },
    {
      n: 259,
      title: "Policy builder (T41): one guided screen for a policy, on 🧩 Policy building blocks",
      tools: ["Policy building blocks", "Policies"],
      builds: [25437, 25441],
      risk: "medium",
      what: "25441: persona chips are fchip (they carried a non-existent class). \ud83c\udfd7 Policy builder (T41, BETA), the sixth tab of T15 — R23 built on R17. js/builder.js (pure): the draft model, the CAnnn-KIND-Persona-words-vX.Y naming with the next free number in the persona's range, draft to Graph body and back, validation (nobody included, nothing enforced, the retired approved-client-app control, AND/OR), best-practice hints over the loaded policies and blocks, a preflight through WhatIfEval with synthetic subjects, a field-level diff, and a PATCH body of WHOLE sections (only the changed ones). js/app.js: the seven-step screen in the list/detail frame, pickers over the sign-in context's named locations / contexts / strengths (terms of use read on demand under Agreement.Read.All), group / user / role / app search, Card, JSON, Preflight and Diff previews, Change plan export, the write (optional exclusion group FIRST via gpostGroupCreate, then POST or PATCH under Policy.ReadWrite.ConditionalAccess, Importer.readSettled read-back, loadFromGraph(true), landing in Policies filtered to the policy). Entry points: Open in builder on the Policies action bar (Edit or Clone; several selected opens the first), New policy with this location / strength / context / terms on the four block panes. A new policy is born report-only; On needs a typed ON. FOLDED entry so ⌘K finds it; Importer.readSettled exported.",
      why: "Mihai: “go build R23, combined with building blocks, and it must also work when a policy is selected elsewhere”. The mockup was approved first (review/2026-09-22). R23's era header says it builds on R17 — the same draft edits an existing policy, which is R17's half, so both cards move to in beta today.",
      test: [
        "🧩 Policy building blocks → the Builder tab: seven step rows, step 1 open, the name composed live, the next free number for the persona shown in the head and in step 1.",
        "Step 4: the tenant's named locations appear as blocks with trusted / countries / network access tags and their policy usage; picking one sets the name's words and the card's Conditions.",
        "Step 5: the tenant's authentication strengths and, after the one read, its terms of use; MFA + a strength together produces the hint that the strength already implies MFA.",
        "Preflight view: the first row applies for a member of the included group, the trusted-location row does not apply when All trusted is excluded, the excluded-group row does not apply, the guest row does not apply for a group-scoped policy; every row lists the other policies that apply.",
        "Create in report-only on a REAL tenant: the exclusion group is created first, the policy POSTed report-only, read back, the policy set re-read, and 🗂 Policies opens filtered to it. Check the policy in the portal — every condition as the card showed it.",
        "🗂 Policies → select one policy → Open in builder → Edit: the Diff view is EMPTY for an untouched draft (no false differences from clientAppTypes [\"all\"] or a strength reference's decoration), change the state to report-only → the JSON view shows a PATCH body with state only; Save → read back matches, 🕓 Changes shows the same diff.",
        "Edit a policy that carries a (NEW) prefix and save it unchanged apart from state: the name keeps its prefix.",
        "Clone: the number is the next free one in the range, the state report-only, the head says cloned from.",
        "Locations tab → a location's detail pane → New policy with this location: the builder opens on step 4 with that location selected; same for a strength (step 5), a context (step 3), terms (step 5).",
        "Step 7 with state On: the Create button stays disabled until ON is typed.",
        "Change plan: the Markdown carries the op list, the step summaries, the hints and the body; JSON download loads in 📥 Import.",
        "node --test tools/builder.test.cjs — 12 tests; the whole suite; the plain-text check.",
      ],
      files: ["js/builder.js", "js/app.js", "js/import.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tools/builder.test.cjs"],
    },
    {
      n: 258,
      title: "Baseline: update the catalog from its own tenant",
      tools: ["Baseline"],
      builds: [25436, 25437, 25440, 25442],
      risk: "medium",
      what: "25442: a number-clash row is never offered by the panel (it is another policy on that number). Baseline.compare marks a same-version policy whose definition differs as ahead with edited: true (Up to date = same version AND same definition), so the Newer than baseline chip, the summary line and the panel count the same policies; the panel groups by-version / edited-in-place on that flag. 25440: a differing NAME is a difference (catalogReview pushes a name-and-version diff row), so a version bumped with no other change is offered and the generated entry carries the tenant's name and version; the panel groups newer-in-name (= the chip's count) / edited in place / new here with a Select button per group. 25437: Select all / Deselect all above the list; the changed count is related to the summary's newer count (versions in names vs definitions), and each changed card says newer version in name / same version — edited in place / older version in name. \ud83e\uddf1 Update the catalog from this tenant, in baseline tenants only (never demo). Baseline.catalogReview compares each policy against its catalog entry on DEFINITION \u2014 vmToEntry renders the tenant view model into catalog shape, entryDiff normalises both sides so group order, condition order, the bullet and minus decoration, line-break markup and markdown emphasis are not differences. Take or hold per policy; holds are keyed by the signature of the difference and kept per tenant in localStorage. catalogSource emits the entries plus a revision note with every hold and its reason. Output is a report: no write to the tenant, no write to the repo.",
      why: "Mihai asked for changed \u2192 export \u2192 import. Mocked against this and he chose this: Import writes to a tenant, baselineData.js is a source file, and an export carries none of num/version/tag nor any of the judgement. Separately, Baseline.compare judged on the version string in the policy name and never on content \u2014 a policy edited without a version bump read as ok.",
      test: [
        "25442: the Newer than baseline chip equals the panel's to-take count (added rows aside); a policy edited in the portal without a version bump shows in the table as newer with the reason same version as the catalog, definition differs — edited in place, and Up to date drops by the same number.",
        "25440: the 🆙 group's count EQUALS the Newer than baseline chip; a policy with only its version bumped appears there tagged newer version only, and taking it generates an entry with the tenant's name and version; Select the N newer ticks exactly that group.",
        "25437: Select all ticks every changed and new-here card and the Generate button counts them; Deselect all empties it. The line under the counts says how many of the changed carry a newer version in the name (must equal the summary's newer count for policies that differ in definition) and how many changed with no version bump.",
        "ON THE REAL BASELINE TENANT, the number that matters: how many of the ~105 come back CHANGED. Three or a handful means the normalisation is right. Dozens means it is reporting rendering as change \u2014 stop and read the false ones before trusting anything else.",
        "Check the drift line: it names how many UNCHANGED policies would serialise differently from the catalog's existing prose. Cosmetic, but it tells you how close the generated entries will read to their neighbours.",
        "Edit one policy in the tenant WITHOUT bumping its version; re-run: it must appear as changed with the right field named. That is the case the old comparison could not see.",
        "Reorder a policy's exclusion groups in the portal and re-run: it must NOT appear as changed.",
        "Hold a policy with a reason; re-run: it is in Held, out of the run, and the reason shows with its date.",
        "Then change that same policy in a DIFFERENT way and re-run: it must come back as changed and marked REOPENED.",
        "Take two policies and generate: the report carries both entries as valid JSON keeping their num, version and tag, the revision note lists what was taken and every hold, and the js/userimpact.js reminder is there.",
        "The button is absent in a non-baseline tenant and in demo.",
        "Offline: node --test tools/*.test.cjs \u2014 312 tests, including the 18 in tools/baseline-catalog.test.cjs.",
        "See review/2026-09-22/BETA-25436.md \u2014 the UI has NOT been run in a browser and this has never been run against the real tenant.",
      ],
      files: ["js/baseline.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/baseline-catalog.test.cjs"],
    },
    {
      n: 257,
      title: "Policies: Clear clears the view, not just the selection",
      tools: ["Policies"],
      builds: [25435],
      risk: "low",
      what: "clearSelBtn clears the selection, idFilter, personaFilter, stateFilter and the search together; it returns early when nothing is narrowing the view, and updateSelbar disables it and titles it with exactly what it would remove.",
      why: "It was selected.clear() and nothing else. On a bar reading \u201c2 policies in view \u00b7 Nothing selected\u201d it did nothing, while the Overview filter narrowing the view sat in the chip row above. Mihai reported it as the clear filter not working.",
      test: [
        "Arrive in \ud83d\uddc2 Policies from an Overview finding (the From the Overview chip is showing), select nothing, press Clear: every policy is back and the chip is gone.",
        "Tick a persona, type in the search, pick a state, select two policies, press Clear: all five go at once and the count returns to the tenant total.",
        "With nothing selected and no filter, Clear is greyed out and its tooltip reads \u201cNothing to clear \u2014 every policy is in view\u201d.",
        "Hover Clear with a selection and a filter active: the tooltip names both.",
        "The chip\u2019s own \u2715 still clears just the Overview filter, leaving a selection alone.",
      ],
      files: ["js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 256,
      title: "Checks: the MS Learn tab keeps its result across a tab switch",
      tools: ["Checks"],
      builds: [25434],
      risk: "low",
      what: "openMsLearn gains the cache guard its three sibling tabs already had, keyed on [tenantId, isDemo, policiesReadAt, Include Off] rather than on presence alone \u2014 this tab auto-runs on open, so it must not show another tenant\u2019s or another scope\u2019s findings. runMsLearn stamps the key; an empty tenant clears it. tools/checks-tab-cache.test.cjs asserts the guard structurally on all four tabs.",
      why: "Reopening the tab re-read the authentication strengths, the cross-tenant access settings, the CA settings and the authentication methods, re-ran 30 checks over every policy, rebuilt the fixes and re-resolved the app ids \u2014 and threw away the severity filter, the expanded findings and the Suggested fixes tab. Mihai reported it as the page doing a sort of refresh.",
      test: [
        "Run \ud83d\udcd8 MS Learn checks, expand a finding, set a severity filter, switch to Bypass & Swiss cheese and back: the same screen, same filter, same open finding, no Running checks flash, and NO new requests in the browser network tab.",
        "Switch to the Suggested fixes tab, leave, come back: still on Suggested fixes.",
        "\u27f3 Refresh re-runs and rebuilds the findings.",
        "Toggle Include Off (disabled) policies on a non-baseline tenant: re-runs, and the counts change.",
        "Switch tenant (or in and out of demo) and reopen the tab: it runs again \u2014 the previous tenant\u2019s findings must never appear.",
        "With no policies loaded the tab says so, and running a policy read then opening it runs the checks properly.",
        "Offline: node --test tools/*.test.cjs \u2014 294 tests, including the 5 in tools/checks-tab-cache.test.cjs.",
      ],
      files: ["js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/checks-tab-cache.test.cjs"],
    },
    {
      n: 255,
      title: "Checks: guests and external users, judged against what they can actually satisfy",
      tools: ["Checks"],
      builds: [25433],
      risk: "medium",
      what: "\ud83d\udcd8 MS Learn checks gains six checks and a matrix for guests and external users. The checks: an authentication strength whose every combination needs a home-tenant-only method (FIDO2 / passkey, Windows Hello, CBA, Authenticator phone sign-in, OATH hardware); a strength that does not reach email OTP, SAML/WS-Fed, Google or MSA externals at all; approved client app / app protection / password change with any external type in scope; compliant or hybrid device without inbound trust; a user-risk policy that can never be remediated for a guest; and the five session controls unsupported for B2B direct connect. The matrix (MSLearn.guestMatrix) crosses the external types the policies reach with the controls they demand, four verdicts, worst-wins per cell, a cell click opening those policies in Policies. 30 checks, up from 24.",
      why: "Mihai asked for it, and picked the matrix from a mockup of two presentations. Three of the six checks already existed but only fired for service provider (CSP) admins, and only in a tenant with a partner configured \u2014 the same policy breaking an ordinary B2B guest was never reported. Everything here was read off the two Microsoft tables for external users during this build, not recalled.",
      test: [
        "On a tenant with a phishing-resistant or passwordless auth strength aimed at guests: the finding fires, names the home-tenant-only methods, and says whether inbound MFA trust is configured, not configured, or could not be read. Check each of the three wordings against the tenant's real cross-tenant access settings.",
        "A strength with at least one combination completable in the resource tenant (password + SMS, say) must NOT fire.",
        "VERIFY AGAINST A REAL TENANT: sign a B2B guest into a resource behind a phishing-resistant strength and confirm the failure the check predicts. This is the claim the whole build rests on.",
        "A policy requiring app protection with B2B guests in scope is reported; the same policy with an OR'd MFA alternative is not.",
        "A policy whose only external type is Service provider users must still be reported by the sp-* checks and NOT double-reported by the guest ones.",
        "Local guest users (internalGuest) must never appear in a guest finding and must read ok across the whole matrix \u2014 they are accounts in this directory.",
        "An exclusion naming specific external tenants does not silence a finding; the detail says it only reaches the named tenants.",
        "The matrix: only controls the tenant's policies actually demand get a column; a control nothing asks of a type is blank, not green. Click a blocked cell and confirm Policies opens filtered to exactly those policies.",
        "With cross-tenant access settings unreadable (no permission), the matrix header says every trust answer is unverified and no cell claims 'not configured'.",
        "Light and dark, 1440 and 390 \u2014 the matrix scrolls sideways inside its card rather than widening the page.",
        "Offline: node --test tools/*.test.cjs \u2014 289 tests, including the 18 in tools/mslearn-guests.test.cjs.",
        "See the local review/2026-09-22/BETA-25433.md validation report \u2014 the UI has NOT been run in a browser and nothing has been checked against a live tenant.",
      ],
      files: ["js/mslearn.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tools/mslearn-guests.test.cjs"],
    },
    {
      n: 254,
      title: "Navigation: a sidebar shortcut for Checks",
      tools: ["Navigation", "Checks"],
      builds: [25432],
      risk: "low",
      what: "\ud83d\udee1 Checks (T08, js/app.js toolGapCheck) joins the sidebar rail after Who is \u2026, not at the end \u2014 the rail is ordered by the work, so the three question-answering tools sit together and the three that change the tenant follow. Baseline, CA groups and Building blocks each shift down one. One line in js/workspaces.js; T08 already mapped to the shield icon, so nothing else changed.",
      why: "Mihai asked for it, and picked this placement from a mockup of three. Checks was reachable only through All tools despite being the tool you open straight after a refresh.",
      test: [
        "The rail reads Home, Policies, Sign-ins, Who is \u2026, Checks, Baseline, CA groups, Building blocks, then the divider, All tools and Help.",
        "Clicking Checks opens \ud83d\udee1 Checks on its Bypass & Swiss cheese tab, and the rail button takes the active fill (25427).",
        "The rail icon matches the home tile's and the workspace tab's \u2014 all three are the shield.",
        "The rail still fits without scrolling on a 13-inch screen; Help and the caption stay reachable.",
        "At 390px the rail is not mounted; Checks is still reachable from All tools and its home tile.",
        "Microsoft Learn, CIS and Intune reality tabs still open, and deep links into them still land.",
      ],
      files: ["js/workspaces.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 253,
      title: "Policies: a persona filter bar",
      tools: ["Policies"],
      builds: [25431],
      risk: "low",
      what: "A chip row under the \ud83d\uddc2 Policies toolbar, one per persona present in the tenant, multi-select, with All personas as the clear. Render.personaChips(pool, activeSet) builds the HTML purely, like stateChips; app.js holds the Set and folds it into visible(). listRows is handed an already-filtered pool so the List view honours it too. New css/app.css .persona-filter block. No read, no write, no permission.",
      why: "136 policies in eight personas, and the only way to see one persona was to scroll the grouped list or search for a naming convention. It also gives the action bar a scope it never had: Documentation, Backup and Gap analyse fall back to everything in view.",
      test: [
        "The bar appears under the toolbar with one chip per persona in the tenant, in CA-number order, unnumbered last, and All personas carrying the total.",
        "Tick Guest admins: the Cards, List and Matrix views all narrow \u2014 List especially, it takes a different code path.",
        "Tick a second persona: both are on and the counts add up. Click a ticked chip: it turns off. All personas clears everything.",
        "Change the state filter or type in the search: every persona count changes with it, and a chip whose count drops to zero disappears \u2014 unless it is ticked, in which case it stays, reading (0).",
        "With a persona ticked, Select all ticks only that persona, and the action-bar line reads the filtered number. Documentation and Backup with nothing selected cover only that persona.",
        "Open Gap analyse: the bar hides with the rest of the policy chrome, and comes back on the way out.",
        "A tenant with one persona (or an unnumbered-only tenant) shows no bar at all.",
        "Light and dark, 1440 and 390 \u2014 the bar wraps rather than scrolling the page sideways.",
        "Offline: node --test tools/*.test.cjs \u2014 271 tests, including the 9 in tools/persona-filter.test.cjs.",
        "See the local review/2026-09-22/BETA-25431.md validation report \u2014 the UI has NOT been run in a browser.",
      ],
      files: ["js/render.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tools/persona-filter.test.cjs"],
    },
    {
      n: 252,
      title: "Assign: guests & external users as a third target, and a role edit that stopped eating the guest clause",
      tools: ["Policies"],
      builds: [25430],
      risk: "high",
      what: "\ud83d\udc65 Assign groups or roles gains a third ASSIGN target: guests & external users. Types plus tenant scope (all external tenants, or named tenant IDs), with the same Set / ADD / REMOVE actions aimed at conditions.users.include|excludeGuestsOrExternalUsers. ADD unions the types; the tenant scope cannot merge, so a policy scoped to different external tenants is skipped with its reason \u2014 a new result state, left untouched, distinct from failed and from already set. REMOVE drops the whole clause when no types remain. Separately: newRolesBlock now carries the guest clause through, and groupsChanged compares it.",
      why: "Mihai asked for it. The fixed part was found while building it: conditions.users is PATCHed whole, and the roles path omitted the guest blocks \u2014 so a directory-role assignment silently deleted a policy's guest/external exclusion and the policy started applying to those users.",
      test: [
        "REGRESSION FIRST \u2014 on a policy that excludes service provider users, run an ADD to EXCLUDE roles. Re-read the policy: the guest exclusion must still be there. On 25429 and earlier it is gone.",
        "Select one policy, Guests & external users, ADD to EXCLUDE, tick Service provider users, all external tenants. The policy gains the clause; the portal shows Guests or external users \u2192 Service provider users under Exclude.",
        "Run the same action again: reported as already set, no write.",
        "On a policy whose exclude clause names specific external tenants, ADD to EXCLUDE with all external tenants: reported LEFT UNTOUCHED with the reason, and the policy is byte-for-byte unchanged in the portal. Then Set the same thing and confirm it does replace the scope.",
        "Named tenants: Set EXCLUDE with two tenant IDs, confirm Graph accepts it and the portal lists both. A non-GUID in the box is refused before the run, not by Graph.",
        "REMOVE from EXCLUDE the only type a policy has: the whole guest clause disappears from the policy (verify in the portal, not just in ENCA).",
        "INCLUDE side on a policy set to All users: the wizard warns, and after the run the policy includes only the guest types.",
        "Tenant-wide Set asks for the typed ALL; tenant-wide ADD does not.",
        "The change report lists a Left untouched section with reasons, and the run ledger shows those rows as skipped rather than green.",
        "Offline: node --test tools/*.test.cjs \u2014 262 tests, including the 15 in tools/assign-guests.test.cjs.",
        "See the local review/2026-09-22/BETA-25430.md validation report \u2014 NONE of the above has been run against a live tenant yet.",
      ],
      files: ["js/assign.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/assign-guests.test.cjs"],
    },
    {
      n: 251,
      title: "Navigation: a sidebar shortcut and an icon of its own for Policy building blocks",
      tools: ["Navigation", "Policy building blocks"],
      builds: [25429],
      risk: "low",
      what: "\ud83e\udde9 Policy building blocks (T15, js/app.js toolLocations) joins the sidebar rail after CA groups. A new 'blocks' mark in js/flat-icons.js replaces the globe it inherited from Named locations, and the \ud83e\udde9 glyph gains a mapping \u2014 without one the home tile fell through to the four-square 'grid' mark that means All tools. Navigation and icon only; the tool itself is untouched.",
      why: "The tool hosts named locations, authentication contexts, authentication strengths and terms of use, and it was reachable only through All tools. Its two icons also disagreed with each other and one of them meant something else.",
      test: [
        "The rail shows Building blocks after CA groups; clicking it opens \ud83e\udde9 Policy building blocks and the rail button takes the active fill (25427).",
        "The rail icon, the home tile icon and the workspace tab icon are the same three-block mark \u2014 not a globe, not the four-square All tools mark.",
        "All tools still shows the four-square mark and is still distinguishable from Building blocks at rail size.",
        "At 390px the rail is not mounted; Building blocks is still reachable from All tools and from its home tile.",
        "Named locations, Contexts, Strengths and Terms of use tabs all still open, and deep links into them still land.",
      ],
      files: ["js/workspaces.js", "js/flat-icons.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 250,
      title: "Sign-in log: a ceiling on what the tab keeps, so Hunting + non-interactive stops crashing",
      tools: ["Sign-in log", "Report-only impact", "Who is \u2026 to CA", "Who is the wave to CA", "Session controls"],
      builds: [25428],
      risk: "medium",
      what: "The shared hunting reader keeps at most 50,000 sign-ins and stops there, reporting the window as truncated with its own reason line; a streaming read (Report-only impact's buckets) is exempt because it keeps nothing. Rows are appended in a loop instead of concat/spread (measured 6 ms against 165 ms for 400,000 in 500 slices, and without the throwaway copies), the window's first and last instants are found in one pass, and the result sort compares ISO timestamps directly instead of through a collator (a smaller saving, 15 ms against 19 ms for 50,000). No query, permission, verdict or export changed.",
      why: "Reading the sign-in log on Hunting + non-interactive killed the browser tab on a large tenant. HUNT_CAP caps a single query at 20,000 rows and a full slice is halved and re-read, so one day can legitimately be 96 slices of 20,000 \u2014 nothing bounded the total, and an enforced read there is mostly legacy-protocol blocks of service accounts retrying every few seconds. A labelled partial window is an answer; a dead tab is not.",
      test: [
        "On a large tenant, \ud83d\udea6 Sign-in log \u2192 Enforced \u2192 Hunting + non-interactive \u2192 30 days. The tab survives. The read stops and the header reads \u201cwindow stopped at 50,000 sign-ins \u2014 more than this window holds in the browser\u201d.",
        "Same tool, a window that fits (1 day, Defender hunting): no truncation line, the counts match what the Entra source reports for the same period.",
        "A day that hits the hunting ROW cap still says \u201cwindow truncated \u2014 a day hit the hunting row cap\u201d, not the new sentence \u2014 the two reasons must not be confused.",
        "\ud83c\udf9a Report-only impact on Hunting + non-interactive over the same window: still completes, still summarised by Microsoft, and is NOT cut off at 50,000 (its coverage line shows the full sign-in count).",
        "\ud83d\udd75 Who is \u2026 to CA, \ud83c\udf0a the wave and \ud83d\udec2 Session controls on a hunting source: a truncated window names its reason in the same words.",
        "The newest sign-in is still first in the list and in the CSV and Markdown exports, and the non-interactive chip counts still add up to the total.",
        "Offline: node --test tools/*.test.cjs \u2014 244 tests, including the four new ceiling tests in tools/hunting-stride.test.cjs.",
        "See the local review/2026-09-22/BETA-25428.md validation report for what was measured and what still needs a live tenant.",
      ],
      files: ["js/app.js", "js/signins.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/hunting-stride.test.cjs", "tools/signin-ordering.test.cjs", "tools/report-impact-store.test.cjs"],
    },
    {
      n: 249,
      title: "Navigation: contrasting active tool and tab",
      tools: ["Navigation"],
      builds: [25427],
      risk: "low",
      what: "Uses the theme's text and surface colours in reverse for the active workspace, Overview, tool subtab and matching sidebar shortcut. Active text, icons and close controls keep their contrast on hover. CSS only; existing navigation and data collection are unchanged.",
      why: "The pale active backgrounds made it difficult to identify the current tool. A solid dark selection in light mode and light selection in dark mode makes the current location clear.",
      test: [
        "In light and dark themes, select Sign-in log and each of its tabs. The active tool and subtab have contrasting solid fills; inactive neighbours remain unfilled.",
        "Hover and keyboard-focus the selected tool, close control, Overview and sidebar shortcut. Text and icons stay legible, and keyboard focus remains visible.",
        "Switch between tools and Overview, then change the theme without reloading. Check desktop and mobile layouts, including system dark mode.",
        "See the local review/2026-09-22/BETA-25427.md validation report for browser results and pending deployment acceptance.",
      ],
      files: ["css/workspaces.css", "css/tool-layout.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 248,
      title: "Overview: flat dashboard and clear reading order",
      tools: ["Home"],
      builds: [25426],
      risk: "low",
      what: "Replaces the raised dashboard cards with a single statistics strip, a findings/context split, ruled check rows and flat expandable details. Overview.advisories renders the existing advisories below the map; context actions use native buttons with separate secondary actions. Dashboard labels use the existing FlatIcons renderer. All existing data collection and deferred analysis remain in place.",
      why: "The earlier dashboard retained rounded cards and shadows instead of the requested flat design. This is a presentation and accessibility change with no new Graph requests, permissions or tenant writes.",
      test: [
        "Inspect light and dark Home at desktop and mobile widths: four counts remain visible, dashboard surfaces have no shadows, and expanded evidence, map and advisories do not overflow.",
        "Use the keyboard to open and close a finding, expand all findings and follow policy filters. Secondary sign-in and audit actions must remain separate from the context row action.",
        "Confirm the existing check buttons and tool navigation still work, with no dashboard requests made to Graph. Live sign-in timing remains an environment-dependent acceptance check.",
        "Run tools/dashboard-flat-browser.cjs, the offline suites, toolbar-order, plain-text and syntax checks. See review/2026-09-22/BETA-25426.md for actual outcomes.",
      ],
      files: ["js/overview.js", "js/app.js", "js/flat-icons.js", "css/app.css", "css/workspaces.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs", "tools/dashboard-flat-browser.cjs"],
    },
    {
      n: 247,
      title: "\ud83c\udfe0 Overview builds on the sign-in reads it already had",
      tools: ["Home"],
      builds: [25425],
      risk: "low",
      what: "js/graph.js: buildResolver keeps the namedLocations / authContexts / authStrengths responses as {items, at, ok, error} on resolve.context (and the name map on resolve.names); loadTenant returns context and names; every existing caller keeps its signature. js/app.js: signinContext set at both load sites (the demo from DEMO_DATA), cleared at sign-out; worthItems() feeds the completed reads and the name map to the provisional GapCheck.run, names what is unread in the note and the evidence chip, runs CisCheck provisionally when both reads completed (p2 null, Partial context); the worth memo and the paint key include the context; signinContextRows() lists each read in the map.",
      why: "LOW \u2014 no new request, no new scope: responses that were already returned are retained instead of discarded. The gain is a truer provisional pass; the risk is a stale context, which the tenant/account/demo keys and sign-out clearing cover.",
      test: [
        "Sign in: the Snapshot context lists named locations, strengths and contexts with counts and the sign-in time; CA settings and licence SKUs read not read until their tools run.",
        "The note under Worth a look first names only the Conditional Access settings as unread; the break-glass finding names the account, not an id.",
        "Make one of the three reads fail (revoke Policy.Read.All in a test tenant, or stub ggetAll locally): the row reads read failed at sign-in with the error, the note names that read as unread, no retry is made.",
        "Network: sign-in makes the same requests as before (no added call); the home page makes none.",
        "Sign out and into another tenant: the context rows show the new tenant's counts and time.",
        "Regression: tools/regression.test.cjs passes.",
      ],
      files: ["js/graph.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 246,
      title: "\ud83c\udfe0 Overview: the configuration map and the diff since the previous refresh",
      tools: ["Home"],
      builds: [25424],
      risk: "low",
      what: "js/overview.js: NEW normalize(raw) (volatile metadata out, keys sorted), diff(prev, cur) by id and definition, controls(raws) over CONTROL_ROWS by state, map(m) rendering the five sections in a folded details#ovMap. js/app.js: deriveSummary() adds the baseline basis (stored / auto-picked / default), release and source, exclusion occurrences and the controls table; noteSnapshot() keeps one previous read per tenant key (ovPrev) and computes ovDiff at both load sites; mapInput() builds the map's input; sign-out resets policiesReadAt, ovPrev, ovDiff and the id filter; the map's open state is remembered in localStorage enca.ovMapOpen. css: .db-map*, .db-list, .db-ctl, .db-kv, .db-diff.",
      why: "LOW \u2014 summaries over data already loaded, each with its unit and limit named; nothing here reads the tenant or changes a tool. The diff is the one new memory (one normalised snapshot per tenant, per session).",
      test: [
        "Demo: the Configuration map is folded under Your checks; open it, reload the page: it stays open.",
        "Report-only review queue lists the report-only policies oldest first with days ago; Open the report-only list filters \ud83d\uddc2 Policies.",
        "Controls table: a policy requiring MFA OR compliant device counts in both rows; the Enabled / Report-only / Off columns match the header counts per row when summed across states for a single-control tenant.",
        "Snapshot context: the baseline line names the catalog, its release and how it is active; the exclusion line reads unique / occurrences / policies and matches the tile; effective user impact reads not checked, then the \ud83d\udeaa count after a run.",
        "Since your previous refresh reads No earlier snapshot on the first read; press Refresh: 0 added / 0 modified / 0 removed; change a policy in the tenant (or DEMO_DATA locally) and refresh: it is listed as modified and Show the changed policies opens it.",
        "Sign out: the Overview is gone from the home page; sign in again: No earlier snapshot.",
        "Regression: tools/regression.test.cjs passes (73).",
      ],
      files: ["js/overview.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 245,
      title: "\ud83c\udfe0 Overview: findings with evidence state, an evidence panel, and a policy filter carried into \ud83d\uddc2 Policies",
      tools: ["Home", "Policies"],
      builds: [25423],
      risk: "medium",
      what: "js/app.js: worthItems() builds finding records {id, source, sev, policyIds, evidence:{state,label,at,note}, detail:{observed,next}, action}; gap findings collapse by title with their policy ids, CIS carries snapshot / needed / previous states, the app-coverage line names the policies; ovShowAll / ovOpen with redrawWorth() redraw only the band; the Overview handler takes data-ovfind, data-ovshowall and data-ovpolicies; NEW idFilter (a Set of ids) with policyPool() feeding visible(), refreshViews() and listRows, a From the Overview chip with data-idclear, cleared by the header state tiles and dropped when no id matches. js/overview.js: worth(w, opts) shows three with View all, evidence(x, opts) renders the panel from view models (users/resources/conditions with exclusions, grant with the operator, session), evidence chips; tile() takes state: targets and a secondary action. css: .db-evid*, .db-pol*, .db-ev, .db-more, .db-also.",
      why: "MEDIUM \u2014 the 21 September review: a line that only navigated to a broad tool did not let the reader see which policies, what logic, or how complete the evidence was; a green-looking result could hide a check that never ran. No new read; the panel is built from the view models sign-in already resolved.",
      test: [
        "Demo: three findings show with an evidence chip each (Partial context before \ud83d\udee1 has run); View all shows the rest, Show the top three folds them back.",
        "Press a finding: it opens in place with Observed, Evidence, Policies (original names, scope, grant with OR/AND, exclusions, modified date), Next step; press again to close; the rest of the page does not move.",
        "Press Show these policies: \ud83d\uddc2 Policies opens with only those policies and a From the Overview chip; the state chips count only them; press \u2715 and the full list is back; go Home and back to Policies: the filter is still on.",
        "Press Open in \ud83d\udee1 Checks: the Checks tool opens on the Bypass tab. Run it and return: the chips read Policy snapshot with the run time.",
        "Refresh after a \ud83d\udcd0 run (CIS tenant): the CIS line reads result is from before the policy reload with a Previous snapshot chip.",
        "Report-only tile opens Policies filtered to report-only; its validate with sign-ins link opens Sign-ins; the modified tile\u2019s who changed what opens Changes.",
        "Keyboard: Tab reaches each finding, Enter opens it, Tab continues into the panel's buttons.",
        "Regression: tools/regression.test.cjs passes (70).",
      ],
      files: ["js/overview.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 244,
      title: "\ud83c\udfe0 Overview: snapshot header, check rows, three load states, one paint per snapshot",
      tools: ["Home"],
      builds: [25422],
      risk: "medium",
      what: "js/overview.js: NEW header(d) (four state counts as data-ovstate buttons; loading / failed / empty status line), lead(d), checks(rows) replacing runs(); the tenant band folds the advisories under a details. js/app.js: renderOverview() reworked \u2014 ovSnapshotKey() / ovPaintKeyOf() fingerprints skip an unchanged paint, deriveSummary() caches baseline + exclusions on the snapshot, the worth band renders after the first paint under a sequence guard; ovLoading / ovReadError set around loadFromGraph and loadDemo, the single paint moved after policiesReadAt, invalidateToolResults skips the paint mid-read; data-ovstate opens Policies with stateFilter set, data-ovrefresh presses Refresh. js/workspaces.js: heading is Conditional Access overview with #wcHomeLead; the library is hidden behind Show/Hide (localStorage enca.wcLibraryOpen) and the layout collapses to one column. css: .db-head/.db-counts/.db-status/.db-checks/.db-advs; .wc-session hidden.",
      why: "MEDIUM \u2014 the 21 September review found the four policy counts below the fold and hidden under 700px, the tool library starting 960px (desktop) / 2040px (mobile) down, three tall not-run cards, an empty tenant hiding the whole Overview, and four renders per sign-in with one before the read time existed. Layout and render-path work; no new read.",
      test: [
        "Demo: the page opens with the four counts (they match \ud83d\uddc2 Policies\u2019 chips); press Report-only: Policies opens filtered to report-only.",
        "At 390px all four counts are visible; no horizontal scroll at 320px.",
        "The tool library is closed under the Overview; Show opens it, the choice survives a reload; the rail and header All tools still open the launcher.",
        "Sign in to a tenant with no policies (or empty DEMO_DATA.policies locally): the header shows 0 with the empty line and its three buttons, not a blank page.",
        "Instrument renderOverview: one paint per sign-in (was four), and returning Home without a change does not redraw (the innerHTML is untouched).",
        "Run \ud83d\udeaa and return Home: its row shows the headline with run number and time; press Refresh and return: the row reads Previous snapshot / Not run as appropriate.",
        "Network: no Graph request while the home page draws.",
        "Regression: tools/regression.test.cjs passes (68).",
      ],
      files: ["js/overview.js", "js/app.js", "js/workspaces.js", "css/app.css", "css/workspaces.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 243,
      title: "\ud83c\udfe0 Overview says only what it knows: reconciled exclusions, Unknown never zero, no provisional score, dated advisories",
      tools: ["Home"],
      builds: [25421],
      risk: "medium",
      what: "js/overview.js: exclusionKinds() covers every kind Exclusions.collect produces (plus other references) and the tile reads unique exclusion references in N policies; undated policies are counted apart on both date tiles; DEADLINES carry cohorts, source and verified date and render through advisory() with a tenant-impact line; the worth heading shows configuration checks \u2014 partial unless a full-context score is passed. js/app.js: the Licences and Exclusions headlines return Unknown when a measure was not read; the score is passed only from a fresh \ud83d\udee1 run with no incomplete context; svRes/moRes summaries feed the impact line. css/app.css: .db-adv*, .db-na. index.html: Help.",
      why: "MEDIUM \u2014 five ways the 25419/25420 home page could be read as saying more than it knew, found by the 21 September dashboard review: a breakdown summing below its total, a zero standing in for an unread measure, a numeric score from an incomplete pass, no change where the date was missing, and one retirement date where Microsoft publishes two cohorts. No new read.",
      test: [
        "Demo: the exclusions tile reads unique exclusion references and its kinds add up to the number (locations and platforms listed).",
        "Before \ud83d\udee1 has run, the Worth-a-look heading says configuration checks \u2014 partial and no number; run \ud83d\udee1 and return: the configuration score with the run time appears.",
        "The advisories show both SMS/voice cohorts with dates and day counts, the memberOf date, a Microsoft link and checked 2026-09-21; tenant impact reads not assessed with an Assess button; run \ud83d\udcf5 and return: the impact line shows the count found and the button reads Open.",
        "A Licences result with unread measures shows Unknown \u00b7 incomplete read on its card, never 0.",
        "Policies without modifiedDateTime/createdDateTime: the tiles say date unavailable for N.",
        "Regression: tools/regression.test.cjs passes (67).",
      ],
      files: ["js/overview.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 242,
      title: "\ud83c\udfe0 Overview: the Worth-a-look-first band",
      tools: ["Home"],
      builds: [25420],
      risk: "medium",
      what: "js/overview.js: NEW Overview.worth(w) \u2014 renders ranked finding buttons with a severity badge, the owning tool and an optional provisional note. js/app.js: worthItems(raws) runs GapCheck.run over the loaded set (a fresh gcResult from this session is used instead; gcRunAt / ciRunAt record when each ran so a result older than the policy snapshot is ignored), takes the critical and high findings collapsed by title, adds the CIS line only where the tab is shown (counts from a fresh ciResult, otherwise the offer to run), and the app-exclusion line from Exclusions.appCoverage; ranked by severity then tool, capped at six, memoised on the snapshot and the two results. The Overview click handler honours data-ovtab and opens the subtab directly. css/app.css: .db-worth* rules. index.html: Help bullet.",
      why: "MEDIUM \u2014 the Overview said what the tenant has, not what to look at. The gap checks and the exclusion comparison are pure over the policy set, so running them at home costs nothing and reads nothing. The risk is a provisional finding read as final: the note under the band, the Help text and the choice to leave CIS unguessed are the guard.",
      test: [
        "Load the demo: a Worth-a-look-first band sits between Tenant and Your runs with ranked lines (Critical before High), each naming its tool; the provisional note reads under it and the heading carries the Zero Trust number.",
        "Press a \ud83d\udee1 line: the Checks tool opens on the Bypass tab. Press the \ud83d\udcd0 line (CIS tenant only): the CIS tab opens directly. Press the \ud83d\udeaa line: the Exclusion analyzer opens.",
        "Run \ud83d\udee1 Checks and return Home: the provisional note is gone and the lines match the top of the Checks findings list (same titles, same severities).",
        "Run \ud83d\udcd0 CIS (CIS tenant) and return Home: the CIS line says how many controls fail with the Level 1 count; the not-assessed line is gone.",
        "Press Refresh and return Home: the band is provisional again (the \ud83d\udee1 and \ud83d\udcd0 results predate the snapshot).",
        "A tenant with no critical or high finding shows the empty line, not an empty box.",
        "The band never reads the tenant: the network panel shows no Graph call when the home page draws.",
        "Regression: tools/regression.test.cjs passes.",
      ],
      files: ["js/overview.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 241,
      title: "\ud83c\udfe0 Overview on the home page: the Tenant band and Your runs",
      tools: ["Home"],
      builds: [25419],
      risk: "medium",
      what: "NEW js/overview.js (Overview.tenant, Overview.runs, DEADLINES) \u2014 pure renderers. js/app.js: renderOverview() builds their input from state (policy states and modifiedDateTime, Baseline.compare on the active catalog, Exclusions.collect for configured counts, the three RunMeta descriptors with a headline each) and reads nothing from the tenant; it runs when the home screen is shown, after either load, and after invalidateToolResults; a delegated handler opens the owning tool from a tile and starts a run from a card. index.html: the #overview container between the intro and the tool tiles, the script tag, a Help section. css/app.css: the .db-* rules.",
      why: "MEDIUM \u2014 the home page was a tile catalogue; a signed-in tenant got no answer to \u201cwhat does this tenant look like\u201d without opening something. Nothing here can be wrong in a new way: every number is either pure over the loaded policies, the catalog comparison that already ran at sign-in, or a result a tool already published. No new Graph read, no new permission.",
      test: [
        "Sign in (or load the demo): an Overview appears above the tool tiles with the Tenant tiles and the Your-runs cards; before any tool has run all three cards say not run this session and offer Run.",
        "The policies tile counts match \ud83d\uddc2 Policies (on / report-only / off), and the baseline tile matches the \ud83e\uddec Baseline card\u2019s missing / outdated / conflict counts.",
        "The configured-exclusions tile says configured, not effective, and its count matches the \ud83d\udeaa head after a scan (entities, not users).",
        "Run \ud83d\udeaa and return Home: its card shows the effective-bypass count with the run number and completeness; press Rescan on the card and the tool opens and runs.",
        "Press Refresh, return Home: the three cards are back to not run (results were invalidated), the Tenant tiles reflect the reloaded snapshot.",
        "The two retirement countdowns show the right number of days and open their tools.",
        "Sign out or before a tenant is loaded: no Overview is drawn.",
        "Keyboard: the tiles are reachable with Tab and open with Enter.",
        "Regression: tools/regression.test.cjs passes.",
      ],
      files: ["js/overview.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 240,
      title: "\ud83d\udeaa Filters as chips, the pair card, no Matrix on narrow screens",
      tools: ["Exclusion analyzer"],
      builds: [25418],
      risk: "medium",
      what: "js/exclusions.js: focusBanner renders only the selected-policy strip (no Filtered-to wording, no clear button); NEW focusChips(model, users, focus) renders the row and column pins as removable fchips. js/app.js: renderExclusions draws the chips beside the type chips on both grid tabs, handles data-exunpin, and when both a row and a column are pinned renders the evidence card (exEvidenceHtml, shared with the cell popover) instead of a grid; on a viewport at or under 700px the matrix tab falls back to the Exclusions list, on open and on resize. css/app.css: .ex-pair and the media rule hiding #exTabMatrix.",
      why: "MEDIUM \u2014 this is the one build of the three that changes how the tool is used: the filter stops being an invisible mode toggled by clicking a label. Nothing is lost \u2014 every pin is still one click, now visible and removable where the other filters live. The pair card replaces the least useful screen the tool had.",
      test: [
        "Matrix: click a row label. A chip with the row\u2019s name appears beside the type chips, the grid narrows to that row\u2019s policies, and no banner is drawn. Click the chip: the grid is whole again.",
        "Click a policy header: a chip with the policy name appears, and the strip above the grid names the policy with its state, controls and exclusion count. Both chips can be active at once.",
        "With both a row and a policy pinned, the body is the evidence card for that pair \u2014 not a grid \u2014 and removing either chip brings the grid back. Falsifiable: on 25417 that state drew a full grid with one mark.",
        "Effective users: the same three checks, with the user\u2019s name on the row chip.",
        "Resize the window under 700px with Matrix open: the tool switches to the Exclusions list and the Matrix tab button is hidden; widen it again and the button returns.",
        "The cell popover\u2019s Only this row / Only this policy buttons produce the same chips.",
        "Regression: tools/regression.test.cjs passes.",
      ],
      files: ["js/exclusions.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 239,
      title: "\ud83d\udeaa Cell evidence on click, a keyboard grid, capped headers",
      tools: ["Exclusion analyzer"],
      builds: [25417],
      risk: "medium",
      what: "js/exclusions.js: renderMatrix and renderUsers render column headers, row labels and marked cells as buttons carrying data-r / data-c grid positions (first header tabindex 0, the rest -1); focusBanner takes the policy object and renders the selected-policy strip (name, state tag, controls, exclusion count, Open policy); gridLegend(tab) above each grid; NEW evidence(model, users, rowKey, policyId, tab) returns the card\u2019s data. js/app.js: openExPop draws the card in a fixed-position #ex-pop next to the cell (Escape, outside click and scroll close it; focus returns to the cell), its actions route to showDetail, openExMembers and the row/column pins; a focusin handler keeps one roving tabindex; a keydown handler moves focus with the arrow keys, Home and End. css/app.css: the .ex-grid button resets, the 110px header cap, the .cfg cell, the popover. index.html: the duplicate legend leaves the pager.",
      why: "MEDIUM \u2014 nothing was lying, but the grids were unusable for anyone not using a mouse and a large screen: 168 cells whose only explanation was a hover title, and 26 clickable things of which one had keyboard access. This is the review\u2019s finding 22 (accessibility) and the second half of finding 7. Rendering and interaction only; no data path changes.",
      test: [
        "Matrix, any \u2717 cell: click opens a card naming the exclusion, the policy with its state, and the reason; Escape closes it and focus is back on the cell. Falsifiable: on 25416 a cell click did nothing.",
        "Effective users: a \u25d0 cell\u2019s card names the excluded group and the nested group where there is one; a \u25cb cell\u2019s card says the policy never includes the user; a ? cell\u2019s card says the include side was not read.",
        "An excluded app\u2019s cell shows the coverage verdict chip and, for a partial one, what the replacement does not carry.",
        "Keyboard only: Tab into the grid lands on the first policy header; ArrowRight / ArrowDown / ArrowLeft / ArrowUp move between headers, row labels and marked cells; Enter on a cell opens the card; Tab does not stop on every cell.",
        "Pick a column: the strip above the grid shows the full policy name, its state tag, its controls and its exclusion count, and Open policy opens the card. The rotated header is no taller than about 110px.",
        "Touch (or the browser\u2019s device emulation): a tap on a cell opens the card \u2014 no hover needed.",
        "The card\u2019s Only this row / Only this policy buttons pin exactly as clicking the row or header does.",
        "Regression: tools/regression.test.cjs (60) passes.",
      ],
      files: ["js/exclusions.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 238,
      title: "\ud83d\udeaa Member button on its own line; full screen takes the pager",
      tools: ["Exclusion analyzer"],
      builds: [25416],
      risk: "medium",
      what: "js/exclusions.js: the group row renders a real button (.ex-rowact, min-height 28px) on its own line under the name instead of an inline .ex-memlink inside the overflow-hidden .uupn sublabel. css/app.css: the .ex-rowact rule. js/app.js: Fs.open takes an extras[] of elements parked beside the controls, and the T09 full-screen call passes the pager.",
      why: "MEDIUM \u2014 measured on 25415: the member button was 252 by 13 px, elementFromPoint at its centre returned nothing, and a real pointer click timed out. The one control that opens the member evidence from the grid did not work from the grid. Full screen with a stranded pager is the review\u2019s finding 7 second half. Rendering and layout only, no data change.",
      test: [
        "Matrix tab, any group row with members: a View N members button sits under the group name on its own line, and a plain click on it opens the member dialog (it timed out before 25416).",
        "The same click does not also pin the row: after closing the dialog no filter banner appears.",
        "Effective users with more than one page: press Full screen, and the Page x / y controls are inside the modal and work; close it and they are back in place.",
        "Keyboard: Tab reaches the member button and Enter opens the dialog.",
        "Regression: tools/regression.test.cjs passes.",
      ],
      files: ["js/exclusions.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 237,
      title: "\ud83d\udd0d Cohorts, \ud83d\udeaa list-first with an odd-one-out grid, and the quadratic row render",
      tools: ["Gap analyse", "Exclusion analyzer"],
      builds: [25413],
      risk: "medium",
      what: "js/analyze.js: cohorts(report, maps, pols, rowIdx) groups users by their signature across the run\u2019s policies and ranks findings first (risky, unknown, untargeted, report-only, then the quiet crowd); cohortsHtml renders them with an expandable member list; userRows takes the indices filterRows already computed instead of calling report.indexOf per row. index.html + js/app.js: the Cohorts tab, its container, its click handler and anCohortOpen. js/exclusions.js: renderMatrix mutes the dominant pattern and marks the policies that do NOT carry an exclusion carried by at least 60 percent of the columns, with a sentence naming them; the default tab is the Exclusions list. css/app.css: the muted and deviation cells.",
      why: "MEDIUM \u2014 nothing is wrong today, but the grid is the default view of a tool whose grid is mostly empty space, and the users table renders every row at once with a per-row indexOf. The cohort view is the part worth having: it turns a screen nobody can read on a large tenant into a handful of rows where the outlier is at the top. No Graph change, no permission change, no new read.",
      test: [
        "Run \ud83d\udd0d on a tenant with more than a few hundred users and open Cohorts: the row count collapses, the top row is a finding (risky, unknown or untargeted) rather than the biggest crowd, and the user counts add up to the number of rows the Users tab shows under the same filters.",
        "Click a cohort: the users behind it are listed; click again to close.",
        "Apply a search or group filter and switch to Cohorts: the cohorts are computed over the filtered set, and the header count matches.",
        "A tenant where one user is excluded from a policy everybody else is in: that user is a cohort of one, at the top, labelled with the bypass.",
        "Open \ud83d\udeaa: the Exclusions list is the tab that opens, not the matrix.",
        "\ud83d\udeaa Matrix on a tenant where a break-glass group is excluded from most policies but not from one: the shared pattern is muted, the missing cell carries the warning mark, and the line under the grid names the policy that does not carry it.",
        "An exclusion in only one or two policies is NOT marked as a deviation (the rule needs a dominant pattern to deviate from).",
        "Large-tenant render: the Users tab still renders and its rows open their detail correctly \u2014 the indices come from the filter now.",
        "Regression: tools/regression.test.cjs (56) passes.",
      ],
      files: ["js/analyze.js", "js/exclusions.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 236,
      title: "\ud83e\uddfe Results bound to their run: invalidation on refresh, an evidence strip, atomic publish",
      tools: ["Exclusion analyzer", "Gap analyse", "Licences"],
      builds: [25412, 25414],
      risk: "high",
      what: "NEW js/runmeta.js (RunMeta): a descriptor per run \u2014 tenant, policy snapshot time, policy count and states, population, options, completeness, run id \u2014 with stale(m, ctx) comparing tenant plus snapshot, and strip() rendering the evidence bar and its stale banner. js/app.js (25414 folded in: openExclusions, renderExclusions and the idle screen stand aside while a read is in flight, and the toolbar is hidden for its duration \u2014 reopening the tool mid-scan had been painting the idle run prompt and the export buttons under the busy panel): runContext() describes the live context; invalidateToolResults() drops anReport/anCov, exModel/exUsers, lgRes/lgCtx/lgPurpose/lgAdmin and their descriptors, and is called from the Graph load and the demo load; exIdle() puts \ud83d\udeaa back to its run prompt; the exclusion scan builds a draft and publishes model, users and descriptor together; \ud83d\udd0d gets an anBusyNow guard at handler entry and a catch that reports stopped without re-entering the progress guard; the \ud83d\udd0d export header is built from the descriptor. css/app.css: the strip.",
      why: "HIGH \u2014 a stale result under a refreshed tenant is the failure mode where somebody reads last tenant\u2019s exclusions as this one\u2019s. Reproduced on the demo source: run both tools, replace the policy source with zero policies, press Refresh \u2014 \ud83c\udfab still listed the old policies and gap, \ud83d\udeaa said no policies loaded while Export CSV still downloaded the old data. The same missing ownership is what would carry a result across a tenant switch. Read-only, no new permission; the descriptor is metadata about a run, not tenant data.",
      test: [
        "Run \ud83d\udeaa and \ud83c\udfab, then press Refresh: both tools return to their run prompt, the exports are gone with them, and nothing from the previous snapshot is on screen. Falsifiable \u2014 before 25412 both kept their results and \ud83d\udeaa exported them.",
        "Sign in to a tenant, run a tool, switch to Demo mode: no result from the tenant remains visible.",
        "Each result shows a strip naming tenant, policies-read time, On/Report-only/Off counts, population, completeness and a run number.",
        "With a result on screen, press Refresh from another tab of the same tool: the strip is amber and says the snapshot was replaced (this is the case where the result is still meaningful but no longer current).",
        "Start a \ud83d\udeaa rescan on a slow tenant and switch away and back while it runs: the tool shows the busy panel, not a half-built model with the previous user total, and no export button works until it finishes.",
        "Same case, the 25414 half: reopening the tool from its tile or tab mid-scan shows ONLY the busy panel \u2014 no Run exclusion scan prompt underneath it and no toolbar \u2014 and the toolbar returns with the result. Falsifiable on any tenant with enough groups for the read to take a few seconds.",
        "Start a \ud83d\udd0d run and press Stop: the status reads Stopped and no uncaught error appears in the console.",
        "During a \ud83d\udd0d run, change the scope selector: a second run cannot be started.",
        "Run \ud83d\udd0d with All users, then change the scope to Guests WITHOUT rerunning and export: the header names the run that produced the file and its snapshot time, not the new form values.",
        "Regression: tools/regression.test.cjs (54) passes.",
      ],
      files: ["js/runmeta.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 235,
      title: "\ud83c\udfab Licences: demand, purchased capacity and assigned entitlement as three measures",
      tools: ["Licences", "Gap analyse"],
      builds: [25411],
      risk: "high",
      what: "js/licgap.js: memberSet(ctx) is the one eligible population and sizeOf() intersects the exclusion set with it before subtracting from a member count; analyze() adds assignedInScope per plan (entitlement held by the targeted identities, counted over the same id set the gap list uses); the Markdown table becomes demand / seats purchased / assigned in scope / purchasing shortfall; a zero gap over an approximate read renders as no gap found in the resolved scope; the mailbox lines report the read outcome instead of a purpose. js/app.js: lgBar takes assignedInScope and draws purchased capacity against demand with an assignment marker, the tiles are renamed to the three measures, the no-gap line separates purchasing from assignment, LG_CATS say what was read, and the head states the population. js/analyze.js: needsP2 counts insider risk, which \ud83c\udfab already did. css/app.css: the bar marker.",
      why: "HIGH \u2014 these numbers are quoted in purchasing conversations. The bar could show No P1 gap while the list under it named hundreds of identities with no entitlement assigned, because it drew inventory and labelled it coverage. The guest subtraction is a plain arithmetic error across two populations, visible on any tenant whose exclusion groups contain guests. The mailbox wording told an operator to exclude accounts from Conditional Access on the strength of an access-denied error. Read-only, no new permission.",
      test: [
        "A tenant with unassigned P1 seats: the bar reads purchased capacity versus estimated demand, the marker sits at the assigned count, and the tiles show demand, purchased and assigned in scope as three numbers. Falsifiable: it said N of N targeted users licensed before.",
        "Where seats cover demand but some targeted identities hold no entitlement, the verdict line says no purchasing shortfall AND names the assignment remediation.",
        "A tenant whose exclusion groups contain guests: per-policy users-in-scope no longer drops below the member count it should have, and no policy reports fewer users in scope than it has gap users.",
        "A run where a group or role could not be read and the gap list comes back empty: the export says no gap found in the resolved scope and calls the result incomplete.",
        "\ud83c\udff7 Check mailbox types on a tenant where the delegated read is denied: the category reads mailbox read denied \u2014 unverified, the hint points at the Exchange admin center, and nothing says never licensed or suggests excluding the account.",
        "A mailbox where Graph DOES return userPurpose shared: the row names it as returned by Graph with the feature-dependent note, and sign-in stays blocked as advice.",
        "A policy carrying insider risk: \ud83d\udd0d Gap analyse counts that user as needing P2, matching \ud83c\udfab.",
        "The head states population and policy states, and matches what a scoped Coverage run says about itself.",
        "Regression: tools/regression.test.cjs (52) and tools/workpackages.test.cjs pass.",
      ],
      files: ["js/licgap.js", "js/app.js", "js/analyze.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs"],
    },
    {
      n: 234,
      title: "\ud83d\udeaa Configured versus effective exclusions, the whole external clause, and paged provenance",
      tools: ["Exclusion analyzer"],
      builds: [25410, 25415],
      risk: "high",
      what: "js/exclusions.js: effectiveUsers() decides, per user and policy, whether the policy INCLUDES that user before calling the exclusion a bypass \u2014 three states (bypass, configured, unknown) where the include side can only be judged from the group memberships this scan actually read; it returns {users, states, unexpanded} so the aggregates survive the worker\u2019s structured clone, and js/app.js puts them back on the model. Excluded directory roles and guest clauses are reported as not-expanded populations. collect() keeps the full excludeGuestsOrExternalUsers clause (types, membershipKind, tenant ids) in the entity key, the entity label and p.exc.guestClauses, and risk() reads the clause instead of a boolean. readNesting() follows @odata.nextLink on both the direct-member read and each nested group\u2019s transitive read, tracks pathComplete apart from membership, marks members whose route was never read, and records groups beyond the nested-group cap.",
      why: "HIGH \u2014 the effective-users number is the one an operator quotes as the size of the bypass, and it was inflated by rows that bypass nothing while a role exclusion contributed a silent zero. The guest collapse is a wrong risk verdict on a real tenant: a partner-scoped exemption was rendered as an all-guests exclusion. The provenance bug invents a nesting route on any exclusion group with more than one page of members, which is exactly the group a large tenant has. All read-only, no new permission, and the states are bounded by what was read \u2014 anything undecidable says so.",
      test: [
        "A tenant with a policy scoped to ONE group that also excludes the break-glass account: that account appears with a hollow circle (configured only), is not in the effective-bypass count, and the head says so. Falsifiable: it was counted as a bypass before 25410.",
        "A policy on All users excluding the same account: it is an effective bypass, exactly as before.",
        "A policy whose include side is a group this scan did not read: the cell is a question mark, the tooltip says the include side was not read, and the count of not-established cells is on the head.",
        "A policy excluding a directory role: the head shows the role as NOT EXPANDED and no user row silently appears or disappears.",
        "Two policies excluding B2B collaboration guests from different named tenants: two separate exclusion rows, each naming its tenant count, neither flagged High; a policy excluding every external type is still flagged High.",
        "An exclusion group with more than 999 direct members (or a stubbed continuation): the members on the second page are DIRECT, the nested count is not inflated, and the group does not claim a nesting route it never read.",
        "A group beyond the 40 nested-group cap: the row says how many nested groups were not read, rather than showing a complete-looking path.",
        "CSV and Markdown carry the three states in words, and the policy state (On / Report-only / Off) is in the column header.",
        "The 25415 half, documentation: Help separates WHO is excluded (transitive membership, nested users included) from HOW they got there (the path read and its 40-group cap), names the roles and guest clauses that are not expanded, and the group member dialog carries the same sentence under its counts.",
        "Regression: tools/regression.test.cjs and tools/workpackages.test.cjs pass; a tenant with no exclusions renders as before.",
      ],
      files: ["js/exclusions.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/regression.test.cjs", "tools/workpackages.test.cjs"],
    },
    {
      n: 233,
      title: "\ud83d\udeaa + \ud83d\udd0d One coverage comparison for both tools, and policy IDs through the results",
      tools: ["Exclusion analyzer", "Gap analyse"],
      builds: [25409],
      risk: "high",
      what: "NEW js/coverage.js (CaCoverage): one comparison answering \u201cdoes this policy replace that one?\u201d with four states \u2014 equivalent, partial with the missing requirements named, none, not established \u2014 over effective user scope (the replacement\u2019s own exclusions subtracted), applications, platforms, locations, client apps, sign-in and user risk, built-in controls, the AND/OR operator, block and authentication-strength identity. A registry of dimensions it does NOT model (device filter, authentication context, authentication flows, application filter, user actions, insider risk, workload identity risk, time window, terms of use, custom controls, session controls) turns a clean answer into NOT ESTABLISHED instead of a silent pass. js/analyze.js: the old shortfall/dimCovered/listCovered block is gone and evaluate() calls CaCoverage.bestOf; bypass rows carry verdict, coveredBy, coveredByIds, partial and unresolved; applied, bypassing and unknown entries carry the policy id; buildMatrixMaps, policyMeta and matrixTable are keyed by id; mfaCovered is mfaTargeted; funnel stages renamed. js/exclusions.js: policies keep their raw object and appCoverage delegates to CaCoverage with gate:false; resource collections get an explicit unresolved verdict. js/app.js: openPolicyRef opens by id with the name as fallback. css/app.css: the .vd chip.",
      why: "HIGH \u2014 both tools currently print a GREEN answer they have not established, and an operator acts on it. T03 accepted a replacement sharing ONE grant control, so a user excluded from an MFA-plus-compliant-device policy read as covered by an MFA-only policy. T09 accepted any enabled policy with any grant control whose include side looked broad enough: its own exclusions were never subtracted, its conditions and controls never compared. Both claims are the kind that close a finding nobody then looks at again. The ID change is the same class of defect: results keyed by display name collapsed two policies sharing a name into one matrix cell, so an included policy and an excluded one rendered as one excluded column. Bounded: read-only, no new Graph call, no new permission, and the comparison is pure over its arguments.",
      test: [
        "Demo tenant, \ud83d\udd0d Gap analyse: expand a user with a bypass. Every bypassed policy shows one of the four verdict chips, and a partial one names the missing requirement rather than saying covered.",
        "A tenant with a policy requiring MFA AND a compliant device, and a second policy requiring only MFA over the same users: the bypass reads PARTIAL and names the compliant device. Before 25409 it read covered. This is the falsifiable one.",
        "A replacement policy that EXCLUDES the bypassing user: the verdict is partial and says the principal is excluded from the replacement, never equivalent.",
        "A policy carrying a device filter or an authentication context: the verdict is NOT ESTABLISHED and names the condition, and the row still counts as risky.",
        "\ud83d\udeaa Exclusion analyzer on a tenant where an app is excluded from an All-resources MFA policy and covered by a narrower policy: the row says partial with the reasons, the risk review says no equivalent coverage established, and the Markdown export carries the same words.",
        "An app excluded from a policy targeting Office 365: the verdict is not established and names the resource collection instead of being silently skipped.",
        "Two policies with the same display name, one including a user and one excluding them: \ud83d\udd0d Matrix shows two independent cells, each column header carries a short ID, and clicking each header opens the right policy card.",
        "Export HTML report from \ud83d\udd0d: open the downloaded file, expand a user and confirm the same verdict wording, and that the matrix columns match the in-app ones.",
        "Regression: the offline suite (tools/regression.test.cjs) passes, and a tenant with no exclusions at all renders exactly as before.",
      ],
      files: ["js/coverage.js", "js/analyze.js", "js/exclusions.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 232,
      title: "\ud83d\udd75 Policies scoped to external-user types resolve, and the fourth state is visible",
      tools: ["Who is … to CA", "CA validator", "Compare users", "Analyze"],
      builds: [25405],
      risk: "medium",
      what: "js/cascope.js: externalTypeOf(subject) derives Entra's external-user type from userType and the #EXT# marker in the UPN (or externalUserState where the caller read it), and guestMatch uses it instead of a field nobody ever set. An internal account returns false against a restricted guest rule rather than null \u2014 serviceProvider and b2bDirectConnectUser hold no user object in the tenant, so a principal resolved here cannot be either. Where userType or the UPN is absent the answer is still null and the state is still unknown. js/whois.js: counts.unknown, an amber Unknown scope chip rendered only when non-zero, the filter arm for it, unknown ranked above na in the row sort, the count on the policies tile, and a callout. js/analyze.js: ctx.upns, passed into the per-user subject.",
      why: "Mihai, 21 Sep, on the Perfetti tenant: a user who should be getting CA111 was missing from \ud83d\udd75. CA057 excludes Guests & external users: Service provider users; guestMatch read subject.guestOrExternalUserType, which is set by nobody, returned null, and of() promoted that to unknown \u2014 a state with no filter chip, so the row existed only under All. Confirmed by arithmetic on his screen: 16 + 7 + 111 = 134 against All 136. MEDIUM: this is the shared scope check under four tools, and a wrong answer here is a policy reported as reaching somebody it does not, or the reverse. It is bounded by being decided from the account's own userType and UPN, both already read, with no new Graph call and no new permission.",
      test: [
        "Perfetti, the user this started with: CA057 is in Reaches her, via All users, and the three chips plus any Unknown chip add up to All. This is the falsifiable one \u2014 it was 134 of 136 before.",
        "A tenant WITH a CSP / GDAP partner: sign in as a normal member and confirm no policy excluding Service provider users reads unknown any more; then check the same policy against a real B2B guest (UPN with #EXT#) and confirm it still reaches them.",
        "A guest who IS a service provider cannot be tested from \ud83d\udd75 \u2014 a GDAP partner administrator holds no user object in the tenant, so there is nobody to look up. That is the premise of the fix rather than a gap in it; the unit check covers a subject that declares the type outright and confirms it is still excluded.",
        "Regression on the plain rule: a policy excluding all Guests and external users still excludes a guest and still reaches a member. A policy INCLUDING Guests and external users still reaches a guest and not a member.",
        "The kept unknown: find or make a policy with an enumerated externalTenants list and check a guest whose home tenant is not knowable \u2014 the row reads Unknown scope, the amber chip appears with a count, the callout names which half could not be decided, and the row sorts above Not targeted.",
        "The chip disappears when the count is zero, and on a tenant with no such policy the chip row looks exactly as it did.",
        "\u26a1 CA validator and \u2696 Compare users on the same user agree with \ud83d\udd75 about the same policy \u2014 one scope check, so a disagreement means something else is wrong.",
        "\ud83d\udcca Analyze over the tenant: no user row carries an unknown verdict for an external-user-typed policy, and the demo tenant still runs.",
      ],
      files: ["js/cascope.js", "js/whois.js", "js/analyze.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 231,
      title: "Shared list/detail tools and flat interface icons",
      tools: ["Policies", "Sign-ins", "Changes", "Policy building blocks", "Exclusions", "User/Group analyzer", "Navigation"],
      builds: [25406, 25408], risk: "medium",
      what: "Shared resizable list/detail presentation with wide and mobile detail modes; since 25408 the list and the detail panel are each their own scroll container, pinned at --sticky-tools (header + tool tabs + the screen's tab strip and toolbar, measured by syncStickyTops and re-measured by its ResizeObserver), capped at 100dvh MINUS the footer (--ld-foot, measured by the same function) with overscroll-behavior:contain, and main's bottom padding dropped above 900px on a screen that ends in a pane — both because a sticky box cannot hold its offset past the bottom of its own box, so any page scroll left after the panes pin drags them up under the toolbar (109px of the policy list was behind it before this); the panel is scrolled back to its top on a change of selection but not on a change of section; #listView and #workspaceInspector get the same treatment, restoring the sticky inspector 25406 had made static; below 900px both revert to one column and one scrollbar; policy settings tabs preserve native full-detail actions. Exclusions gets an entity view; User/Group references and sweep groups keep completeness evidence outside the detail panel. Flat local SVG icons replace leading interface markers without changing stored or exported data.",
      why: "A consistent reading layout reduces repeated expand/collapse actions. Medium risk because existing delegated actions now live inside detail panels across several tools. No Graph requests, permissions or write confirmations are added by the presentation layer.",
      test: [
        "Passed locally: 204 offline tests; populated browser fixtures for Policies, audit, sign-ins, building blocks, exclusions and User/Group results, including incomplete-read evidence and 320/390/1440 layouts.",
        "Passed locally: 66 tool screen visits, 44 subtabs, wide policy settings, nested dependencies, focus restoration, and light/dark branded layouts. CIS is unavailable in demo and was not bypassed.",
        "Before promotion, verify in a connected tenant that filters, bulk selections, native edit/restore dialogs, exports and sign-in replay retain the selected object. Review long real names and large result sets. No live-tenant acceptance or write execution was performed for this build.",
        "25408 scrolling, on a tenant with a long result set: open \ud83d\udd53 Changes, scroll to the bottom of a long diff and confirm the results list is still on screen and still clickable, that the screen's toolbar and search have not moved, and that a flick past the end of the panel does not scroll the page behind it.",
        "25408, the offset: with a toolbar that WRAPS to two rows (narrow window, \ud83d\udd17 User or Group analyzer) and with a second tool tab open so the tool nav is two rows, confirm the top of each pane sits under the toolbar rather than behind it \u2014 the offset is measured, so both cases are the test.",
        "25408, the bottom of the page: scroll a tool with panes ALL THE WAY DOWN and confirm the panes stop clear of the toolbar rather than sliding under it, and that the footer is what appears beneath them. Do it with the footer wrapped to two or three rows on a narrow window, since the footer's height is what the pane reserves.",
        "25408, selection and sections: picking a new row opens its detail at the top; switching the panel's own section tabs keeps the place in that item; Open wide and Back to results behave as before.",
        "25408, \ud83d\udcc4 Policies: with the detail panel open, the table keeps its scroll position while a six-section policy is read to the end, and the inspector has its own scrollbar again.",
        "25408, 390px and 320px: ONE scrollbar \u2014 no pane has a nested one, Back to results still returns to the list, and nothing is cut off at the bottom with the browser address bar shown and hidden.",
      ],
      files: ["js/list-detail.js", "css/list-detail.css", "js/flat-icons.js", "css/flat-icons.css", "js/workspace.js", "js/workspaces.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 230,
      title: "Workspaces layout, centred policy details and branded header",
      tools: ["Navigation", "Policies", "Several tools"],
      builds: [25401, 25402, 25403, 25404],
      risk: "medium",
      what: "Ports the approved Workspaces concept into the actual beta entry point. New js/workspaces.js and css/workspaces.css provide the rail, Overview, session-local recent tools and searchable library. js/tool-layout.js and css/tool-layout.css share tool presentation. js/app.js opens full policy details directly and provides the original definition; js/workspace.js publishes session metadata for truthful tenant/demo labels. Native routes, tenant operations, permission overview and confirmation flows remain in place. No demo-forcing boot code or concept CSP is shipped. T36 is in the rail. Build 25404 corrects its labels to full original policy names, including their own CA number, without an added ENCA sequence prefix; the detail heading also omits that prefix. Build 25402 adds all tools in expandable Overview groups, standalone Permissions, the Theme label and silent connected-app ownership metadata in the account menu.",
      why: "The user approved the Workspaces design and asked to build it to beta. Consistent layout and a wide centred detail window make intensive use easier. Medium risk because shared navigation and responsive styles affect every tool: validate sign-in, tenant changes, original actions and nested dialogs before production. Local demo and simulated-session results are recorded in review/2026-09-21/BETA-25404.md; they are not live-tenant acceptance.",
      test: [
        "Open T36 from the rail. Policy links show the full original name including its own CA number, without an additional ENCA sequence prefix. Clicking opens the same original name in the detail heading. Check user, group and compare subjects.",
        "Overview shows all 24 tools as cards, including Guided rollout, Changes and Permissions. Collapse/expand groups and reopen Permissions via its tab. Theme replaces Appearance. Check own-tenant, external multitenant and unreadable app ownership without additional consent; the owner ID must come from Graph metadata.",
        "Without ?demo=1, open beta in a fresh session: the normal sign-in card and connection control appear; workspace rail and All tools are absent. After sign-in, the header names the tenant and must not say Demo. Sign out: workspace navigation disappears and theme selection remains reachable.",
        "Open demo: Overview and All tools work, all 23 original destinations remain reachable, and folded tools remain reachable by their native subtabs or command palette. Switch tabs with a policy filter and selection set: both survive. Close a neighbouring tab and close all through the account menu.",
        "Open a policy from List and Cards: the complete six-section detail is centred, the full original name and JSON definition are present, and a nested dependency closes back to it. Close/Escape/backdrop return focus; Documentation, Backup, Assign, Policy state and What-if still reach their original workflow. No tenant write occurs from merely opening a detail.",
        "1440/light and 390/dark: review every available tool and subtab for title, toolbar and panel consistency without page overflow. At 320px verify branding and the Teams devices prefix field fit. Wide data tables may scroll inside their panels.",
        "Apply a custom logo, product name and light/dark palettes through Branding settings: the top bar updates immediately, and text stays readable for light as well as dark header colours. Reset restores the deployment brand and retains the BETA or SELF-HOSTED identification.",
        "On a real tenant, confirm the permission overview and native incremental-consent flow remain reachable. Switch between two tenants (including equal display names): recent tools reset and the account names the current tenant. CIS must retain its existing tenant gate; verify it in the authorised tenant before production.",
      ],
      files: ["index.html", "js/graph.js", "js/render.js", "js/whois.js", "js/wave.js", "js/compare.js", "js/workspaces.js", "css/workspaces.css", "js/tool-layout.js", "css/tool-layout.css", "js/workspace.js", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 224,
      title: "📐 CIS Benchmark (T21) — beta AND the CloudFellows tenant only; production 316 removes it from that build",
      tools: ["CIS Benchmark"],
      builds: [25391],
      risk: "low",
      what: "js/app.js: tenantDomains (the organization's verified domains, read where tenantName and tenantDomain are), isCisTenant(), and a per-tab `only` predicate honoured by tabShown(), openFolded() and the command-palette builder beside the existing betaOnly check; the CIS tab and the toolCis FOLDED entry carry only: () => isCisTenant(). index.html: the tool-number row and the R01 roadmap card say so. PRODUCTION SIDE, already committed on main as build 316: js/cischeck.js, js/cisdata.js, their script tags, the screen-cis section, the FOLDED and TAB_HOSTS entries, the whole CIS block in js/app.js and screen-cis in HISTORY_SCREENS are gone from that build; T21 keeps its number in the map and in TOOL_VERSIONS.",
      why: "Mihai, 18 Sep: the CIS tool ended up in main and in the self-hosted image, and it should be beta-only and only in the cloudfellows.dev tenant. The guard was betaOnly plus isProdHost, which asks WHERE THIS BUILD IS SERVED FROM - and a build anyone may serve cannot be kept clean that way, which is exactly how it reached a customer's instance. Two answers, one each: out of the production build, and behind a tenant test on beta. LOW on this channel (it only hides a tab); the production half ships as its own build 316.",
      test: [
        "Beta, signed into the CloudFellows tenant: Checks shows four tabs with CIS 5.2.2 among them, the command palette finds CIS Benchmark and T21, and the R01 roadmap link opens it.",
        "Beta, signed into any other tenant (Courseware): three tabs, no CIS; the palette finds neither the name nor T21; the R01 link does nothing.",
        "Beta with ?demo=1: three tabs - the demo is not that tenant on purpose.",
        "An administrator signed in as a guest of the CloudFellows tenant (UPN on another domain) still sees it: the test reads the organization's verified domains, not the account's.",
        "Production 316: Checks has three tabs on every host, js/cischeck.js and js/cisdata.js are 404, the page has no screen-cis, and Help still lists T21 in the tool numbers as not part of that build.",
        "A self-hosted container built from 316: the same three tabs - this is the case that started it.",
      ],
      files: ["js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
      title: "\u2699 The beta host's own single-tenant app registration (AUTH_HOSTS)",
      why: "Beta-only by design, and permanently \u2014 it was queue item 229 until build 25407, which is the wrong list for something that can never be ticked. AUTH_HOSTS in js/authConfig.js names the PUBLISHER'S OWN tenant and registration and is keyed on this site's hostname. In a production build, or in the :latest image, the key can never match and the block is nothing but somebody else's tenant ID shipped to every copy. When js/authConfig.js is ported, take the header comment and the js/connection.js precedence note and leave AUTH_HOSTS behind; main keeps the plain two-argument Object.assign. The \u2699 connection picker it defaults FROM (item 228) is in production since build 321.",
    },
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
