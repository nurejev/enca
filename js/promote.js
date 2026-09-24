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
  productionBuild: "v2.0.0",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {},

  items: [
    {
      n: 291,
      title: "🔑 Passkeys — T44, a tab of 🛡 Checks: required passkeys against the Passkey (FIDO2) method, with Configure",
      tools: ["Checks"],
      builds: [32317],
      risk: "high",
      what: "js/passkeys.js (new, pure: requirement, wanted, analyze, profilesOf, keyAllows, profileMeets, draftFrom, applyOptIn, validate, toBody, applyBody, diff, impact, render, chips, toMd) with its script tag; js/app.js: pkRaw/pkModel state beside xtRaw (reset on both tenant loads), openPasskeys/renderPasskeys/runPasskeys, the ✎ Configure editor (openPkEditor, pkPaintEditor, pkPaintSide, save with a per-tenant restore snapshot in localStorage enca.pkRestore:<tenant>), the checks TAB_HOSTS tab (beta: true), the FOLDED entry, screen-passkeys in HISTORY_SCREENS; index.html: screen-passkeys, pkEditModal, the Checks tile line, the Help h5, T44 in Tool numbers, roadmap R66; js/demo.js DEMO_DATA.passkeys; css/app.css the pk- block; README permission row; tools/passkeys.test.cjs.",
      why: "Mihai, 24 Sep: in enca we required passkey, we need a check if passkeys are configured and with which settings, an option to configure it; on the mockup he chose a tab in Checks, Configure for the whole method, TAP as a finding only. HIGH: it WRITES a tenant-wide authentication method — a wrong target list, exclusion or key restriction stops passkey sign-in for real people. Mitigations: the diff, the stops-working list and the re-run findings before Save, a confirm on every loss, a read-back, and Restore. Unverified: whether a PATCH carrying passkeyProfiles opts a not-yet-opted-in tenant in (Microsoft documents the opt-in only as a portal banner); whether Graph accepts a client-generated id for a NEW profile; that isRegistrationRequired round-trips unchanged.",
      test: [
        "Beta site, a tenant where a policy grants Phishing-resistant MFA to a group, signed in as Global Reader: 🛡 Checks → 🔑 Passkeys → ▶ Read. The Policies that require a passkey table lists that policy and no policy whose strength also allows password + SMS or whose grant offers another control under OR.",
        "Current settings matches Entra ID → Authentication methods → Passkey (FIDO2): Enabled, each include target with its profiles, the exclusions, Allow self-service set up, and every profile's types, attestation and key restrictions.",
        "Coverage: take a test user in the policy's group who is NOT in any method include target — the Required, but not targeted finding counts them and show users names them. Put that user in an excluded group of the method — the Excluded from passkeys finding appears instead.",
        "No common key: with a strength restricted to Authenticator AAGUIDs and a profile that blocks them, the Strength and passkey profile finding appears; allow them in another profile on a target holding the users and ⟳ Refresh — it goes.",
        "Configure, as Authentication Policy Administrator on a TEST tenant: add a group as include target with a profile, press Save — the consent prompt for Policy.ReadWrite.AuthenticationMethod appears once; the portal then shows the target; the finding the save said it clears is gone; ↩ Restore appears.",
        "Remove an AAGUID from an Allow list in Configure: the Stops working box names that model before Save and Save asks once more. Save, then ↩ Restore → Save: the portal shows the list as it was.",
        "Add a new passkey profile and Save: record whether Graph accepts the client-generated id (if it answers 400, the profile create needs another shape — this item stays in beta).",
        "A tenant NOT opted in to passkey profiles (or a fresh test tenant): the Not opted in info shows, Configure shows tenant-wide attestation and key restrictions; changing attestation writes only isAttestationEnforced. Opt in… then Save on a TEST tenant: record whether the PATCH opts the tenant in (portal shows the Default passkey profile) or is refused.",
        "Signed in as Global Reader without the Authentication Policy Administrator role: Save fails with the access-denied line; nothing changes. Demo (?demo=1): one Blocks finding for Require MFA for all admins (Alex Admin not in the pilot), a warning for the Authenticator-only pilot profile without attestation, and Configure → add CAB-SEC-U-Persona-Admins → the side says it clears the blocking finding.",
      ],
      files: ["js/passkeys.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "README.md", "tools/passkeys.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 290,
      title: "🤝 Cross-tenant access — T43, a tab of 🛡 Checks (checks from cdell2222/m365-security-toolkit)",
      tools: ["Checks"],
      builds: [32316],
      risk: "medium",
      what: "js/xtenant.js (new, pure: analyze, reachTypes, effTrust, render, chips, toMd, toCsv) with its script tag; js/app.js: xtRaw/xtModel state beside isRaw (reset on both tenant loads), openXTenant/renderXTenant/runXTenant/xtTenantExists, the checks TAB_HOSTS tab (beta: true), the FOLDED entry for the command palette, screen-xtenant in HISTORY_SCREENS, the two options kept per browser in localStorage enca.xtOpts; index.html: screen-xtenant, the Help h5 under 🛡 Checks, the credits line, T43 in Tool numbers, roadmap R65; js/demo.js DEMO_DATA.xtenant; css/app.css the xt- block; CrossTenantInformation.ReadBasic.All added to New-EncaAppRegistration.ps1, js/onboard.js and README; tools/xtenant.test.cjs.",
      why: "Mihai, 24 Sep: can we add these checks to enca — github.com/cdell2222/m365-security-toolkit; on the mockup he chose a tab in Checks, with the tenant-exists check, partner names and the Reaches your CA column. Medium: one new optional read-only permission and requests from the browser to Microsoft's public sign-in endpoint; nothing is written to the tenant. Unverified: whether that endpoint's NOT-FOUND answer is readable cross-origin — if it is not, a dead partner reads not checked instead of gone, which is the safe direction.",
      test: [
        "Beta site, a real tenant with at least two partner entries, signed in as Global Reader or Security Reader: 🛡 Checks → 🤝 Cross-tenant → ▶ Read. The Default policy card matches Entra ID → External Identities → Cross-tenant access settings → Default settings (B2B collaboration inbound, B2B direct connect inbound, Trust settings).",
        "The Partners table has one row per entry under Organizational settings. Open one partner's Trust settings in the portal: MFA and device trust match, and a partner still on Default settings shows (default) in those columns.",
        "Exists: every live partner reads ✓, and DevTools → Network shows the openid-configuration requests to login.microsoftonline.com answered 200. Then, in the console, fetch('https://login.microsoftonline.com/00000000-0000-0000-0000-000000000001/v2.0/.well-known/openid-configuration').then(r => r.status) — 400 means a dead partner will read gone; a CORS error means it will read not checked. Record which.",
        "Tick Show partner names and ⟳ Refresh: the consent prompt for CrossTenantInformation.ReadBasic.All appears once; after it the rows carry the partner's name and default domain. Refuse it on another run: the tab still reads, with IDs.",
        "Reaches your CA: in a tenant where default MFA trust is on and an enabled policy asks guests for MFA, the default MFA finding is High and names that policy; where only report-only policies or none ask, it is Medium and says so.",
        "A partner with cross-tenant sync inbound (a multitenant organization) shows Sync in ✓ with a Medium finding; a CSP partner shows Info and no overrides-nothing finding.",
        "Signed in with an account that cannot read cross-tenant access settings: the tab says access denied and why; the other Checks tabs are unchanged. Switch tenant: the tab goes back to ▶ Read.",
        "Export MD and Export CSV open the report and download the findings. Demo (?demo=1): four partners — Contoso (device trust, Medium), Fabrikam (sync and auto-redeem, MTO), a gone tenant (High) and Northwind (CSP, Info).",
      ],
      files: ["js/xtenant.js", "js/app.js", "js/demo.js", "js/onboard.js", "index.html", "css/app.css", "New-EncaAppRegistration.ps1", "README.md", "tools/xtenant.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 289,
      title: "MS Learn: guest findings and the guest matrix give one judgement",
      tools: ["MS Learn"],
      builds: [32315],
      risk: "low",
      what: "js/mslearn.js: guest-auth-strength-unsatisfiable reports only the types verdict(type, strength) marks blocked or trust, so Other external users (n/a for a strength) drop out of it; verdict(b2bDirectConnectUser, mfa) returns n/a when direct connect is blocked inbound, as dc-mfa-needs-trust already skipped. tools/mslearn-guests.test.cjs: a cross-check test over scopes, grants, sessions and both inbound states.",
      why: "Mihai: there is something wrong with the engine, a High Blocks them finding (CA111, Other external users) that is not in the matrix. The finding and the matrix judged the same policy separately and disagreed.",
      test: [
        "A tenant with a CA111-style policy (All users with every guest type but Other external users excluded, authentication strength required): no High unsatisfiable finding naming Other external users; the not-universal finding is still there; the matrix cell is n/a.",
        "A policy with a phishing-resistant strength scoped to B2B collaboration guests: still High unsatisfiable, and the matrix cell is blocked.",
        "Direct connect blocked inbound, an All users MFA policy: the direct connect MFA cell is n/a with the reason; with direct connect allowed for a partner and no MFA trust: trust in the matrix and the dc-mfa-needs-trust finding.",
      ],
      files: ["js/mslearn.js", "tools/mslearn-guests.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 288,
      title: "Self-hosting: pinned installs — update and roll back by digest (SELF-HOSTING.md, selfhost/resolve-digest.sh, the update notice)",
      tools: ["Self-hosting"],
      builds: [32314],
      risk: "low",
      what: "SELF-HOSTING.md: new section Pinned installs: update and roll back (write down the running reference for Docker and Container Apps, resolve the digest, deploy on Docker / compose / Container Apps bash and PowerShell / IaC, check, roll back). selfhost/resolve-digest.sh (new; ghcr.io, docker.io and ACR, read-only, prints image@sha256). js/fork.js: the update window gains a Pinned to a digest step (the platform's command) beside the tag-based ones, because a restart keeps the same build on a pinned instance.",
      why: "Mihai asked whether the PVM production update runbook works for other self-hosters: the principle does, the tooling did not exist publicly — nothing turned :latest into a digest, and nothing told anyone to write down the running build before updating. Low: documentation, a read-only script, and one more step in a notice shown only on self-hosted production copies.",
      test: [
        "On main after promotion: SELF-HOSTING.md renders the new section after Staying up to date; every command block runs as written in bash (and the PowerShell one in PowerShell).",
        "bash selfhost/resolve-digest.sh prints ghcr.io/nurejev/enca:latest -> sha256:… and the pinned reference; with a tag that does not exist it says so and exits 1; curl …/main/selfhost/resolve-digest.sh | bash works.",
        "A self-hosted production copy that is builds behind (Docker host, and an *.azurecontainerapps.io host, on Windows and macOS): the update window lists Pinned to a digest with the right command for the platform and shell.",
        "The image still starts (the script is a plain file in the image; nothing runs it).",
      ],
      files: ["SELF-HOSTING.md", "selfhost/resolve-digest.sh", "js/fork.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 287,
      title: "Branded dark mode — the neutral greens follow the brand",
      tools: ["Self-hosting"],
      builds: [32313],
      risk: "low",
      what: "css/app.css: under :root[data-brand] in dark (explicit and Auto), --chip-bd, --sw-track, --na, --faint, --ghost-bd and --on-deep-mute are color-mix()ed from the brand's --green, --green-deep, --muted, --ink, --surface and --bg instead of ENCA's literal greens. A branding stylesheet that names one still wins (it is appended later). Without data-brand nothing changes.",
      why: "Mihai, Dovilo in dark: still showing green. The Protect / CA groups bottom bar already follows the brand since 32307 (queue 283) - verified in a browser with the Dovilo branding: blue - so a container still showing a green bar runs an image from before 32307. This item takes the remaining brand-neutral greens with it.",
      test: [
        "Dovilo (or any blue branding), dark theme: chip borders, switch tracks, n/a and faint text and ghost borders are blue-grey, not green; the Protect exclusions and CA groups bottom bar is deep blue.",
        "Same with Auto theme and the OS in dark.",
        "ENCA's own look (beta or production, no branding) in dark: unchanged, the same greens as before.",
        "A branding file that sets --ghost-bd in colorsDark: that value is used.",
        "Semantic colours unchanged under a branding: the green In a vault card, the UPDATED tag, red Not in a vault.",
      ],
      files: ["css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 286,
      title: "🗂 Policies list uses the whole width; every table column resizable",
      tools: ["Policies", "Workspaces"],
      builds: [32312],
      risk: "low",
      what: "css/workspace.css: #ptable fixed layout with content-based widths (name 39% on one line with ellipsis, State 120px, Users 15%, Resources 16%, Grant 19%, Modified 112px, min-width 1000px), the 380px name cap removed; css/list-detail.css keeps the inspector split on auto layout with wrapping names whatever widths were saved. js/render.js: tooltips with the full name, users, resources and grant. NEW js/col-resize.js: a MutationObserver attaches a grip to every header cell of every table (not .matrix / .mtable / .gc-matrix / .gm / .matrix-wrap tables, merged or two-row headers, data-noresize); drag freezes the table to fixed layout at its current widths, double-click fits one column, ↺ resets; widths saved per table id (or screen + header texts) in localStorage enca-colw:*, keyed by header text. css/app.css: the grip, the reset button, ellipsis headers on a resized table. Help 🧭 Workspaces and navigation documents both.",
      why: "Mihai, 24 Sep, screenshot of the Policies list: names wrapped over three lines with a lot of white space in Users — use all the width, and make every table column expandable by the user. Mockup shown first (enca-policies-list-mockup.html), approved as shown.",
      test: [
        "🗂 Policies, List, a 1920px window: every policy name is on one line; hovering a cut name shows it whole; Report-only fits in State; no column is mostly empty.",
        "Drag the Users header edge left: Users narrows and the other columns take the room; reload — the widths come back; ↺ in the Modified header restores the defaults and disappears.",
        "Double-click the Policy header edge: the column fits the longest name on one line and the table scrolls sideways if it has to.",
        "Open a policy (inspector split): the list shows Policy and State only, names wrap, no sideways scroll — also after resizing columns in the full list.",
        "👥 CA groups list and 🧬 Baseline table: header grips resize; clicking a header still sorts where it did before; a drag never triggers a sort.",
        "🔍 Gap analyse Matrix and the 🚪 exclusion grid: no grips, layout unchanged.",
        "Touch (iPad): dragging a grip resizes the column instead of scrolling the page.",
      ],
      files: ["js/col-resize.js", "css/app.css", "css/workspace.css", "css/list-detail.css", "js/render.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 285,
      title: "Self-hosted branding — no Limon-IT flash on a hard refresh",
      tools: ["Self-hosting"],
      builds: [32310],
      risk: "medium",
      what: "js/selfhost.js: deploymentBrand starts from window.ENCA_BRAND_BOOT (the file the container entrypoint writes into js/selfhost-boot.js), else the enca-selfhost-brand-cache copy, so register() has the brand before app.js first paints; the fetch of selfhost-branding.json still runs and wins, and when it finds no file it now takes a started brand down on the same load (startedBranded). js/selfhost-boot.js: while a boot brand is painting, #brandOrg, #brandOrgLink, #brandFoot, #brandLoginTitle, #brandLoginBlurb and #brandTag are visibility:hidden until applyBranding removes the boot stylesheet, and the document title's organisation part is set at once.",
      why: "Mihai, Dovilo container with branding: a hard refresh briefly showed Limon-IT instead of Dovilo. Cause: selfhost.js registered no brand until its fetch returned, so app.js's first applyBranding painted the default look and removed the boot stylesheet.",
      test: [
        "Self-hosted container with a branding file (Dovilo): hard refresh several times, also in a private window (no cache): the header, sign-in card, footer and tab title show Dovilo from the first frame, never Limon-IT.",
        "Change the branding file on the host without restarting the container, refresh: the new look shows on that load.",
        "Remove the branding file (container restarted without it, or a static host): after one refresh the default look shows and stays; no old brand lingers.",
        "A look applied through the gear in this browser still wins over the deployment file.",
        "Beta and production sites (no branding file): unchanged, Limon-IT look, no hidden text.",
      ],
      files: ["js/selfhost.js", "js/selfhost-boot.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 284,
      title: "🏅 Identity Secure Score — T42, a tab of 🛡 Checks, and the score + Microsoft recommends on the home page",
      tools: ["Checks", "Overview"],
      builds: [32308, 32309],
      risk: "medium",
      what: "js/idscore.js (new, pure: latest, normalize, evidence, model, render, chips, dashboardTile, dashboardRecs, toMd) with its script tag; js/app.js: isRaw/isModel state beside caSettingsCache (reset on both tenant loads), openIdScore/renderIdScore/runIdScore, the checks TAB_HOSTS tab (beta: true), the FOLDED entry for the command palette, screen-idscore in HISTORY_SCREENS, renderOverview passes the tile to Overview.header and puts IdScore.dashboardRecs after the primary band, data-ovrun is reads it in place; js/overview.js: header() takes an optional fifth figure (db-counts.five); index.html: screen-idscore, Help h5 under 🛡 Checks, T42 in the tool numbers, roadmap R64; css is-* and db-is; js/demo.js idScores + idRecommendations; DirectoryRecommendations.Read.All added to New-EncaAppRegistration.ps1, js/onboard.js SCOPES and the README permission table; tools/idscore.test.cjs.",
      why: "Mihai, 23 Sep, on the home dashboard: it should also show the secure score percentage and a recommendations section, perhaps a new tool; on the mockup: only focus on identity, go build. Medium: a new Graph permission (read-only, admin consent) and a beta API; nothing is written to the tenant.",
      test: [
        "Beta site, a real tenant, signed in as Global Reader or Security Reader: the home strip has a fifth figure, Identity Secure Score — ▶ read it. Click it: the admin-consent prompt for DirectoryRecommendations.Read.All appears once; after it, the figure shows the same percentage as Entra ID → Identity Secure Score in the admin center (Microsoft's page may round differently).",
        "Microsoft recommends lists up to four open recommendations, the Conditional Access ones first, each with points and What ENCA sees; All N recommendations opens 🛡 Checks on the Identity score tab.",
        "The tab: score, 30-day change and trend line, three facts (to address, answered by Conditional Access, already built but not enforcing). Filters To address / Conditional Access / In the score / All / Completed / Accepted. Open a row: Microsoft's reasoning, value, steps with links, and what ENCA looked for.",
        "In the CloudFellows tenant (99 of 105 Off): Require MFA for administrative roles and Block legacy authentication read Built, Off with the baseline policy names; the ›-button goes to 🧬 Baseline or 🛡 Checks.",
        "Signed in with an account WITHOUT a reader role (or refuse the consent): the tab and the home band say it could not be read and why; the rest of the home page is unchanged.",
        "⟳ Refresh reads again; Export MD opens the report. Switch tenant: the figure goes back to ▶ read it.",
        "Demo (?demo=1): the figure reads 47.9% with example recommendations, marked demo in the footer.",
        "32309 — on the tenant where the first read failed with 400 Please try again after some time: ▶ Read again. Either both parts come back, or the tab names the part that did not (score history or recommendations) in an amber line; with no history the score reads ≈N% summed from the recommendations, no trend line, and the home figure carries the ≈ too. ⟳ Refresh tries again.",
      ],
      files: ["js/idscore.js", "js/app.js", "js/overview.js", "js/demo.js", "js/onboard.js", "index.html", "css/app.css", "New-EncaAppRegistration.ps1", "README.md", "tools/idscore.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 283,
      title: "T12 groups actions bar (and the 🔒 Protect bar) follows the site branding in dark",
      tools: ["Conditional Access groups"],
      builds: [32307],
      risk: "low",
      what: "css/app.css: the dark .cgg-bulk rules (explicit dark and prefers-color-scheme) mix the brand tokens — background color-mix(--green 18%, --green-deep), border color-mix(--green 35%, --green-deep) — instead of the literal #1e4729 / #3c6b48; .cgg-bulk .mini inherits the bar's text colour. The 📰 Learn changes count chip takes --green-deep instead of a literal.",
      why: "Mihai, screenshot of a Dovilo-branded instance in dark: in the groups T12, the bottom bar needs to follow the branding. Low: colour only; ENCA's own palette mixes back to the green it had.",
      test: [
        "Beta site, dark theme, ENCA branding: 👥 Conditional Access groups, click a group — the bottom bar is the same deep green as before, border included.",
        "A self-hosted instance with the Dovilo branding (or ⚙ branding with a different --green / --green-deep), dark: the bar is deep brand blue with a lighter blue border, not green; light: brand blue as before.",
        "In both themes the (open — tick rows to act on more) hint after the group name is readable.",
        "🔒 Protect exclusions: its bottom bar follows the same colours.",
      ],
      files: ["css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 282,
      title: "📰 Learn changes — the nightly Microsoft Learn watch in the MS Learn tool, per-check verified dates, triage, 📋 Work order and the GitHub issue",
      tools: ["Checks"],
      builds: [32306, 32311],
      risk: "low",
      what: "js/learnfeed.js (new, pure: checksFrom, classify, decide with upTo, newKeys, issueMarkdown, commentMarkdown, workOrder, chips, render, driftFor) and js/learntriage.js (new, the recorded decisions, empty) with script tags; js/learnfeed-snapshot.json (the feed as shipped with the build); js/mslearn.js: a verified date on every check, checkDocs(), renderGroups opts.drift (⚠ Learn changed on the head, lf-drift line in the detail); js/app.js: lf* block (lfLoad raw.githubusercontent.com then the snapshot, lfResult, lfDecide, mlTabsPaint, renderLearn), the third tab, 📋 Work order, Refresh re-reads the feed on that tab, Findings and Suggested fixes fall back to the ▶ Run checks prompt before a scan; index.html tab + button + Help; css lf-*; tools/learn-feed.mjs (loadLib/withOpen, --lib --triage --issue-dir, emphasis stripped from what's-new text, page titles on watched entries) and tools/learnfeed.test.cjs. The workflow itself lives on main (.github/workflows/learn-feed.yml, issues: write) and was updated there in the same hand-over.",
      why: "Mihai, 23 Sep: a daily check on everything new about Conditional Access, fed to the beta MS Learn tool (he chose a separate learn-feed branch read at run time, never a bot commit to beta or main); then, asked what the next steps are when it finds something, he approved triage on the tab, decisions recorded in the repo, a work order for a session, and a GitHub notification. Low: it reads Microsoft's public docs and nothing in the tenant; the only writes are the nightly run's own branch and issue.",
      test: [
        "Beta site, any tenant, 🛡 Checks → 📘 Microsoft Learn: the tab strip shows 📰 Learn changes with a ⚠ count before any scan. Click it: the band names the feed date and entra-docs commit; before the first nightly run it says GitHub could not be reached and shows the copy shipped with this build.",
        "Sections: ⚠ A page a check relies on changed (Continuous access evaluation, cae-disabled, verified 2026-09-11, see the diff opens the entra-docs commit), New pages (Token Protection for web apps), Changed, the folded typo/link/bulk edits, What's new, the folded mentions, and the Not watched line (5 pages outside entra-docs).",
        "On the CAE row, press ✎ Check needs a change with an empty reason: refused with a toast. Type a reason and press it again: the row shows ✎ Check needs a change · pending with undo, the ⚠ count drops by one. Reload the page: still pending (this browser). undo puts it back.",
        "📋 Work order: the report lists 1 decision with a ready-to-paste line for js/learntriage.js, the work under 2 with the Learn and diff links, and the undecided items under 3.",
        "Switch to Findings before any scan: the ▶ Run checks prompt, Include Off back, 📋 Work order gone. Run a scan on a tenant with a policy that disables CAE: that finding carries ⚠ Learn changed; open it: the line at the top links the change and Open in 📰 Learn changes lands on the ⚠ filter.",
        "Refresh on the Learn tab re-reads the feed only (no tenant read). Chips filter the sections.",
        "GitHub: after main is pushed, Actions → learn feed → Run workflow. The learn-feed branch appears with learn-feed.json, and an issue labelled learn-feed lists the open items. Run it again: no new comment (nothing new). Record a decision in js/learntriage.js on beta, push beta, run again: that item leaves the issue; with everything recorded the issue closes itself.",
        "After the nightly feed exists, reload the tab: the band says fresh and names the nightly date, not the shipped copy.",
        "32311 — open 📰 Learn changes: How this works is open with Read / Decide / Hand over; fold it, reload: it stays folded. The status bar counts to decide / decided, not handed over yet / recorded; answer one item: the second count goes up, the item shows Decided: … with undo, and 📋 Make work order (1) in the status bar opens the work order. Sections read answer needed or for reading; each item asks its question in words; the buttons read Still correct, The check needs a change, Make it a new check, Add to an existing check, Already covered, Not relevant. On main: the learn feed workflow is scheduled for Mondays (cron 17 4 * * 1), and a feed older than 8 days reads out of date.",
      ],
      files: ["js/learnfeed.js", "js/learntriage.js", "js/learnfeed-snapshot.json", "js/mslearn.js", "js/app.js", "index.html", "css/app.css", "tools/learn-feed.mjs", "tools/learn-feed.test.cjs", "tools/learnfeed.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", ".github/workflows/learn-feed.yml (main)"],
    },
    {
      n: 281,
      title: "Baseline catalog revised 2026-09-23 — CAB-SEC-U-TeamsSharedDevices excluded from CA005, CA006, CA009, CA011, CA012, CA013, CA017",
      tools: ["Baseline"],
      builds: [32305],
      risk: "medium",
      what: "js/baselineData.js: seven entries take the exclusion, the name and the version from the 🧱 Update the catalog output of 2026-09-23 (CA005 1.0.2, CA006 1.0.2, CA009 3.0.2, CA011 1.0.2, CA012 3.0.2, CA013 3.0.3, CA017 3.0.2); each keeps its own list order with the group added after its last group; revised 2026-09-23 with a note. Not taken: the trailing space the export put on CA017's terms-of-use name. js/userimpact.js RULES_CHECKED_AGAINST not moved (the exclusion changes no policy shape the brief matches on).",
      why: "Mihai uploaded the catalog output generated after 🧰 Fix (32303) answered the shared-device Microsoft Learn check in the CloudFellows tenant, and asked for it to be queued. All seven are real changes, verified field by field against the catalog: only exclude, name and version differ. Medium because a tenant compared against the catalog in production reads these seven as newer than its own until it takes them.",
      test: [
        "Beta site, CloudFellows tenant, 🧱 Baseline: CA005, CA006, CA009, CA011, CA012, CA013 and CA017 read Up to date (same number and version as the catalog); the Newer-than-baseline chip does not count them.",
        "🧱 Update the catalog on the CloudFellows tenant: none of the seven is offered any more; the 🧰 ready-for-the-catalog list is empty for them.",
        "Any customer tenant still on the previous versions: those seven show as the baseline being newer, with the shared-device exclusion as the difference; importing one creates it with CAB-SEC-U-TeamsSharedDevices under Exclude.",
        "Baseline card for CA017: Exclude lists CAB-SEC-U-TeamsSharedDevices; the grant reads Terms of use Internals Minor insider risk (no trailing space).",
      ],
      files: ["js/baselineData.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 280,
      title: "🧰 Fix on the MS Learn finding, in place in the baseline tenant, and ready for 🧱 Update the catalog",
      tools: ["Checks", "Baseline"],
      builds: [32303, 32304],
      risk: "medium",
      what: "js/mslearn.js: ownDeviceFix (shared-device-unsupported on the devices' own policy removes the unsupported grant and session controls when the shared-device group is the only include; conditions never; compliant device named and left), blockedControls on the finding, patchBody (changed sections only, name, explicit null for anything a fix took out, never state), acceptSig, renderAccepted, renderGroups opts (Fix N on the head and in the detail, accept form), renderDeviceMatrix opts.fixN. js/app.js: mlFindings / mlRaws / mlCtx, mlSubset (one finding's fixes alone, or @devices), mlFixableCounts, openApplyModal(set, label) with in-place PATCH in the baseline tenant, companions still POSTed, a policy still carrying approvedApplication rebuilt (POST Off, then DELETE — it is read-only in Entra), report with each changed section as it was, re-read and re-run after; accepted store enca-ml-accepted:<tenant>; ready store enca-catalog-ready:<tenant>, the band, openCatalogFromReady, the catalog panel ticking, pruning and the from-Fix line. js/baseline.js: catalogSource meta.why note. index.html: modal rows, Help, R62. css/app.css: ml-headrow, ml-accept, ml-accepted, ml-ready.",
      why: "Mihai, 23 Sep, with a screenshot of the baseline tenant's Microsoft Learn tab: the issues found may be fixed with a fix button, then set ready for updating the CloudFellows baseline; now it is too much manual work. Mockup first (review/2026-09-23/mslearn-fix-to-catalog/); he chose PATCH in place, removing the control from the devices' own policy when the group is the only include, and accept-with-a-reason. Medium because it writes policies — only in the baseline tenant, where they are Off — and none of it has run against the real tenant yet.",
      test: [
        "CloudFellows tenant, Microsoft Learn, Include Off ticked, Run checks: Shared devices: controls their resource accounts cannot meet shows 🧰 Fix 7 (or the real count) on its head; the matrix note has 🧰 Fix these; the toolbar has 🧰 Fix all (N).",
        "Click 🧰 Fix on that finding: the confirm lists one CHANGE row per policy with old name → new name and stays Off, no DELETE rows, the Delete-original tick is hidden, Mark ready is ticked. Apply: every row ✓, the report opens with each policy's users section as it was.",
        "In the Entra portal, one of those policies: same object ID as before, still Off, CAB-SEC-U-TeamsSharedDevices under Exclude, version in the name one step up, nothing else changed.",
        "Back on the tab after the re-run: the shared-device matrix has no blocked cells from those policies and the finding is gone; the band says N policies ready for the catalog.",
        "A policy that includes only CAB-SEC-U-TeamsSharedDevices and asks for terms of use: its Fix removes the terms of use and keeps compliant device (the change line says so). The same policy with a second include group: no Fix, listed as needing a decision.",
        "Band → Open 🧱 Update the catalog: the CloudFellows catalog, the panel open, those policies ticked and marked 🧰 from Fix with the check; Generate the catalog source: the note lists the check, its Learn URL, the CA numbers and each change.",
        "The baseline-scopes finding: type a reason, Accept — it folds into Accepted (1) with the reason; the count drops; Reopen brings it back. Change the policy set (add an app exclusion to another All-resources policy), run again: it is open again by itself.",
        "A policy still carrying Require approved client app (read-only in Entra): its 🧰 Fix confirm shows CREATE at the bumped version and DELETE of the original with the reason; after Apply the new one exists Off and the old one is gone.",
        "Any other tenant: no 🧰 Fix buttons and no band; Suggested fixes still downloads the JSON for Import. Demo: no writes offered.",
        "32304 — the run looks like 📥 Import: on Apply the plan and the ticks give way to the run ledger (one row per policy, a first row for service principals when any are missing); rows turn ✓ with the new name, the header counts N of M, and ■ Stop after this one leaves the remaining rows skipped and those policies untouched. A clean run closes the dialog and opens the report; with a ✗ or a stop the dialog stays open, Apply is gone and 📄 Report is on the ledger. Open 🧰 Fix again: the plan and the ticks are back.",
      ],
      files: ["js/mslearn.js", "js/app.js", "js/baseline.js", "css/app.css", "index.html", "tools/mslearn-fix.test.cjs", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 279,
      title: "Redesigned ENCA mark (light, dark, favicon) and a BETA edition on the beta host",
      tools: ["Workspaces"],
      builds: [32302],
      risk: "low",
      what: "assets/logo-mark-light.svg, logo-mark-dark.svg, favicon.svg redrawn (pale disc, gold ring, deep-green shield, gold keyhole; dark: green disc, lime shield). New assets/logo-mark-light-beta.svg, logo-mark-dark-beta.svg, favicon-beta.svg carry a yellow BETA pill. js/branding.js: asset ?v= 32302 plus betaLogo / betaLogoDark / betaFavicon. js/app.js applyBranding: on BRANDING.betaHost with no override or self-hosted look, the header and sign-in logo and the favicon use the beta assets and html gets data-beta-mark. css/app.css: the dark-mode content:url rules move to v=32302, plus data-beta-mark rules for the dark beta mark.",
      why: "Mihai asked for the Limon-IT logo to get the same redesign as the PVM, CloudFellows and Dovilo marks, plus a beta logo. Mockup shown first; he approved the redesign as shown and the automatic swap on the beta host.",
      test: [
        "Beta site, light theme: the header medallion, the sign-in card and the browser tab show the mark with the yellow BETA pill.",
        "Beta site, dark theme (and Auto with the OS in dark): the dark mark with the BETA pill, in the header and on the sign-in card.",
        "Beta site with a look applied through the gear (or a per-audience override): that look's own logo, no BETA mark, and html has no data-beta-mark attribute.",
        "Open a policy card on the beta site: the small mark in the card header is the plain mark, without the pill.",
        "Production (after promotion) and a local or self-hosted copy: the redesigned mark without the pill everywhere, the plain favicon.",
        "Hard refresh after deploy: no old gold-shield mark comes back from cache (asset ?v= is 32302).",
      ],
      files: ["assets/logo-mark-light.svg", "assets/logo-mark-dark.svg", "assets/favicon.svg", "assets/logo-mark-light-beta.svg", "assets/logo-mark-dark-beta.svg", "assets/favicon-beta.svg", "js/branding.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
