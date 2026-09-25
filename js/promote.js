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
  productionBuild: "v2.0.1",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {},

  items: [
    {
      n: 301,
      title: "🧬 PIM baseline 0.2 — profiles (Small business, Large · multi-region) and 🗺 Regions from the customer's regions.csv; New-PimRegions.ps1 creates the units, groups, scoped eligibilities and Intune scopes (R68)",
      tools: ["PIM baseline"],
      builds: [32413, 32414],
      risk: "medium",
      what: "32414: the roles read no longer asks v1.0 for isPrivileged (beta-only; the first real-tenant read failed on it, the demo fakes the field). js/pimBaselineData.js: profiles.small / .multi (groups, merge, templates, roles, rmau, intune), groupsSmall (PIM-SG-AZ-Sub-Owner / -Sub-Contributor), regions (columns, defaults, example, codePattern, template: aus, groups, eligibilities, intune, review), intuneRoles (INT-ROLE-Regional-Ops with its resource actions). js/pimbaseline.js: profile() derives the catalog; parseCsv / parseRegions (quoted CSV or JSON, defaults, code rule, duplicates); region() fills the template; compareRegions() per region: units by rule, groups, scoped eligibilities by directoryScopeId, Intune unread, the centre's RMAU; renderRegions / regionsMd / toRegionsFile / regionsCommand; compare() lists regional persona groups apart from extra groups; toOrchestrator everyProfile. js/app.js: pmbProfile select (localStorage enca.pmbProfile), PMB_READ adds AdministrativeUnit.Read.All, the read adds directory/administrativeUnits and the PIM-SG / INT-SG groups, inst() carries directoryScopeId, the 🗺 Regions chip and pane (file input, paste box, example, template, clear; rows in localStorage enca.pmbRegions:<tenant>), ⬇ Regions file, Export MD on the regions pane, the baseline config carries every profile's groups on the baseline tenant. js/demo.js: two regions (EU-NL nearly complete, EU-DE half), AU-RM-Admins, the plain groups, scoped eligibilities, regionsCsv. index.html: toolbar select and button, tile, Help; css/app.css pmb-profile / upload / rtbl. tools/pim: New-PimRegions.ps1 (new), pim-regions-template.json, regions.csv, regions.cloudfellows.dev.json, pim-baseline.small.json, pim-baseline.multi.json, pim-baseline.json regenerated; New-PimBaseline.ps1 -SkipOrchestrator. tools/pimbaseline.test.cjs: three tests more.",
      why: "Mihai, 25 Sep: small business and multi-region first; two demo regions in cloudfellows.dev are fine; tell me what to run to get this going. Regions must come from a file because they are always different per customer. MEDIUM: T48 stays read-only but reads two more endpoints (administrative units, the named groups) and keeps customer rows in the browser; the new script writes units, groups, scoped eligibilities and Intune RBAC — WhatIf by default.",
      test: [
        "Beta site, demo (?demo=1), Workspace 02 → Baseline: the toolbar shows Profile with Small business and Large · multi-region; the default is Large · multi-region. ▶ Read: the summary line says profile Large · multi-region; the chips include 🗺 Regions (2). Switch to Small business: the tiles re-read without a new read (the demo tenant is set up as a large one, so 33 roles differ — the Tier 1 alert level Critical and the approval Tier 0 roles carry there); the PIM groups table shows 7 rows (GlobalAdmin, SecOps, Ops, SecOpsReader, Tenant-Owner, Sub-Owner, Sub-Contributor), 3 of 4 present; Helpdesk Administrator says via PIM-SG-M365-Ops, Privileged Role Administrator says via PIM-SG-M365-GlobalAdmin, Global Administrator differs on Activation duration PT1H → PT2H and Approval required → not required; the 🗺 Regions chip is gone. The choice survives a reload.",
        "Back on Large · multi-region, 🗺 Regions: the file card shows 2 regions loaded (demo); tiles 2 regions · 16 match · 1 differ · 16 missing · 6 not read; Central: AU-RM-Admins Match; EU-NL card: AU-EU-NL-Devices Differs with rule: (device.displayName -startsWith \"NL-\"), User Administrator → PIM-SG-EU-NL-Ops Missing with held at TENANT scope, Groups Administrator → PIM-SG-EU-NL-Ops Missing, the Intune tag and assignments Not read; EU-DE card: AU-EU-DE-Users and PIM-SG-EU-DE-Ops Match, the rest Missing. The find box narrows to one card on germany.",
        "Clear, then paste two rows with a lower-case code and a duplicate and Read the rows: the notes name the row numbers; Use the example loads the two regions again; ⬇ regions.csv template opens the CSV; Choose regions.csv with a real file loads it and a reload keeps it.",
        "⬇ Regions file with the default ticks (both regions ticked; a matching region would be unticked): a report with the two New-PimRegions.ps1 lines (WhatIf and -Apply) and JSON holding profile, regions (the rows), template, central.rmau, groupTemplates.GroupTier2, intuneRoles and protected. Export MD on the regions pane writes the per-region tables.",
        "⬇ Baseline config in demo on Large · multi-region: 20 group policies; on Small business: 7. On cloudfellows.dev (baseline tenant) it carries 22 (every profile's groups).",
        "cloudfellows.dev, ▶ Read this tenant's PIM: the read completes (roles, role settings, eligibilities, assignments, groups, units, framework groups, group settings) — no Could not be read; the tiles show the 38 roles and the 22 groups the scripts made, the 🧱 baseline tenant chip is up, and 🗺 Regions with regions.csv loaded shows EU-NL and EU-DE against the tenant.",
        "A real tenant: the read asks for AdministrativeUnit.Read.All once; a tenant that declines it still shows the role compare, and the regions pane says administrative units not read. Eligible rows scoped to a unit are counted on their role as before.",
        "tools/pim/New-PimBaseline.ps1 -ConfigFile .\\pim-baseline.json -TenantId cloudfellows.dev -SkipOrchestrator: renames SG-PIM-* to PIM-SG-*, creates PIM-SG-AZ-Sub-Owner and -Sub-Contributor, lists the protected accounts, writes the resolved file and stops without importing EasyPIM.",
        "tools/pim/New-PimRegions.ps1 -RegionsFile .\\regions.csv -TenantId cloudfellows.dev (WhatIf): lists per region the 3 units, 3 groups, 8 eligibilities, 2 Intune groups, the tag and 2 assignments as would create, AU-RM-Admins would create, the custom role would create with the count of known actions; warns on the placeholder approvers not found. With -Apply: created, and ENCA → Regions → ⟳ Read again reads Match on the Entra rows for both regions and AU-RM-Admins Match.",
      ],
      files: ["js/pimBaselineData.js", "js/pimbaseline.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "tools/pimbaseline.test.cjs", "tools/pim/New-PimRegions.ps1", "tools/pim/New-PimBaseline.ps1", "tools/pim/pim-regions-template.json", "tools/pim/regions.csv", "tools/pim/regions.cloudfellows.dev.json", "tools/pim/pim-baseline.json", "tools/pim/pim-baseline.small.json", "tools/pim/pim-baseline.multi.json", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 300,
      title: "🔑 Passkeys 0.1.1 — Phishing-resistant MFA + TAP counts as requiring a passkey; a policy with target resources None is listed, not counted",
      tools: ["Checks"],
      builds: [32411],
      risk: "low",
      what: "js/passkeys.js: requirement() accepts temporaryAccessPassOneTime / MultiUse beside the phishing-resistant three (TAP set), marks tap and keeps it out of alternatives; inert when includeApplications is None and there is no user action or authentication context — analyze() skips counting it and adds an inert info finding; a tapoff info finding when the strength accepts a TAP the tenant has disabled; the altNote says a TAP is accepted; COMBO_LABEL names the two TAP combinations. tools/passkeys.test.cjs: two tests. index.html Help and the tab head say how a TAP and None are read.",
      why: "Mihai, 25 Sep, screenshots on cloudfellows.dev: DEVCF P001 Require MFA for admins grants Phishing-resistant MFA + TAP, and 🔑 Passkeys said No policy requires a passkey. Low: a read-only judgement; Configure is unchanged.",
      test: [
        "cloudfellows.dev, 🛡 Checks → 🔑 Passkeys → ⟳ Refresh: DEVCF P001 is in Policies that require a passkey, its strength line lists Temporary Access Pass, and No policy requires a passkey is gone.",
        "P001's target resources are None today: it shows applies to no sign-in in the table and the Requires a passkey, but applies to no sign-in note; no Required, but not targeted finding is raised for it. Set its resources to All resources (on a test copy): the coverage findings for DEVCF-Persona-Admins appear and count people.",
        "A policy with Phishing-resistant MFA (no TAP) on the same group behaves as before; a strength with password + SMS beside the passkey is still not listed.",
        "With the Temporary Access Pass method disabled, a requiring policy whose strength accepts a TAP shows the The strength accepts a Temporary Access Pass, but the method is off note.",
      ],
      files: ["js/passkeys.js", "tools/passkeys.test.cjs", "index.html", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 299,
      title: "🧬 PIM baseline — T48, Workspace 02: the CloudFellows PIM framework (PIM-SG, 2.0) against this tenant's PIM, setting by setting; delta and baseline config as EasyPIM.Orchestrator JSON (R68)",
      tools: ["PIM baseline"],
      builds: [32408, 32409, 32410, 32412],
      risk: "medium",
      what: "32412: names solution first, PIM-SG- (catalog, demo, exports, Help, script; -RenameLegacyPrefix renames SG-PIM- groups in place). 32410: the placeholder scan skips the config's own notes (first run in cloudfellows.dev created the 21 groups, then stopped on the comment's <id of …>); BGA in the break-glass pattern. 32409: New-PimBaseline.ps1 also protects the users holding Global Administrator as a standing assignment (-ProtectGlobalAdmins, default on). js/pimBaselineData.js (new: PIM_BASELINE — templates Tier0/Tier1/Tier2/Reader + GroupTier0-2, 38 roles with template, via groups and overrides, 20 PIM-SG groups, approvers, notifications, auth context, protected, naming contract; the 1.3 → 2.0 lineage in the header); js/pimbaseline.js (new, pure: expected, fromRules, diff, compare, toOrchestrator, command, tiles, chips, render, toMd); js/app.js: HISTORY_SCREENS, TOOL_TABS, the pmb block (openPimBaseline, runPimBaseline with five reads + batched group policies, pmbExport → showReport, filters, find), reset on sign-in and demo, SCOPE_INFO row; js/demo.js DEMO_DATA.pim built from a spec in Graph shapes; js/workspaces.js: the roster card is real; js/flat-icons.js; index.html: tile (BETA), screen, Help section, roadmap R68, tool numbers T48; css/app.css pmb- rules; tools/pimbaseline.test.cjs; tools/pim/New-PimBaseline.ps1 (new) and tools/pim/pim-baseline.json (new, the export of the catalog).",
      why: "Mihai, 24 Sep: add a baseline tool with the cloudfellows.dev tenant as the baseline tenant, where things get created and matched against; the Dovilo framework v1.3 as the design, adjusted for the new baseline, PIM-SG naming, solution first. MEDIUM: read-only, but it reads endpoints no other tool reads (roleManagementPolicyAssignments with rules, the schedule instances with principal, PIM for Groups policies) on every tenant it is run on, and the catalog carries design decisions (tiers, c1, Tier 0 moves) that must hold up in cloudfellows.dev before another tenant is matched against them. Graduates once cloudfellows.dev carries the framework and the compare reads Match there.",
      test: [
        "Beta site, demo (?demo=1), Workspace 02 → Baseline → ▶ Read this tenant's PIM: tiles read 38 roles compared · N match · N differ · 0 missing · 5 / 7 PIM groups · 3 permanent active outside the framework; Global Administrator, Conditional Access Administrator and Security Administrator are Match; Exchange Administrator differs on Activation duration PT24H → PT2H with the findings 1 permanent active outside the framework: CAB-SEC-U-Admins-Legacy and not eligible through PIM-SG-M365-AppOps; Privileged Role Administrator differs on Approval only; Global Administrator shows 3 permanent (2 protected).",
        "Groups in demo: PIM-SG-M365-GlobalAdmin and PIM-SG-M365-Tier0 Match; PIM-SG-M365-SecOps Differs (Approval, and Compliance Data Administrator + Message Center Reader missing); PIM-SG-M365-Helpdesk Differs, Role-assignable no, with the recreate note; PIM-SG-M365-SecOpsReader and PIM-SG-M365-AppOps Missing; CAB-SEC-U-Admins-Legacy listed under groups not in the framework; the PIM-SG-AZ-* rows say Azure RBAC · not compared.",
        "Filters: Differs shows only differing roles and groups; Missing shows the two groups; Assignments shows the rows with a finding; the find box narrows on ops (PIM-SG-M365-Ops rows and roles via it).",
        "⬇ Delta config with the default ticks: a report with the Invoke-EasyPIMOrchestrator -WhatIf line and JSON holding PolicyTemplates for the tiers used, EntraRoles.Policies for the ticked roles, GroupRoles.Policies for the ticked groups, Assignments.EntraRoles with <id of PIM-SG-…> placeholders and ProtectedUsers. Untick everything → the toast says to tick something. ⬇ Baseline config: 38 role policies, 20 group policies, 7 templates, 35 assignment rows.",
        "A real tenant with RoleManagement.Read.Directory consented and a Global Reader account: Read completes in one pass (roles, role policies, eligibilities, assignments, groups, group settings) and the row for Global Administrator shows the tenant's real activation duration and approval; a tenant without PIM for Groups consent shows the roles compared and the summary line group settings not read: access denied … rather than an error.",
        "Signed in without a PIM-reading role: Could not be read — access denied … above the ▶ button; nothing else in the app changes. Stop read during the eligibilities read leaves the stopped message, not a partial table.",
        "On cloudfellows.dev (the baseline tenant) the toolbar carries the 🧱 baseline tenant chip; in demo it does not.",
        "tools/pim/New-PimBaseline.ps1 -TenantId cloudfellows.dev (WhatIf): the Groups step lists every PIM-SG group as created or resolved; the break-glass step prints the BG accounts; the standing Global Administrators step prints the account you signed in with as protected: … standing Global Administrator, permanent; the resolved json holds those ids under ProtectedUsers and no <id of …> placeholder is left; EasyPIM's WhatIf lists 38 role policies and 7 group policies to set and no removal.",
      ],
      files: ["js/pimBaselineData.js", "js/pimbaseline.js", "js/app.js", "js/demo.js", "js/workspaces.js", "js/flat-icons.js", "index.html", "css/app.css", "tools/pimbaseline.test.cjs", "tools/pim/New-PimBaseline.ps1", "tools/pim/pim-baseline.json", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 298,
      title: "🧭 Workspaces — 01 Conditional Access and 02 PIM-buddy on one shell: the chip switch, a rail, home and library per side, tabs kept across a switch (R67)",
      tools: ["Help"],
      builds: [32407],
      risk: "low",
      what: "js/workspaces.js: WORKSPACES (01 ca, 02 pim) with shortcuts, title, lead and context per side; PIM_ROSTER (02's groups, blurbs, lens chips, a planned card for T48); the header chip + menu (wcWsChip, wcWsMenu, data-wc-switch) after the wordmark; renderRail / renderChip / renderHome re-run on a switch; tabs of the other side hidden (.toolnav-tab hidden), auto-follow when the app opens a tool of the other side; ?ws=pim, localStorage enca.workspace, per-side enca.wcLibraryOpen:<ws>; ⌘⇧1 / ⌘⇧2; globalThis.Workspaces (current, switch, paletteItems, list). js/app.js cpBuild: one line pulling the Switch to entries. css/workspaces.css: body[data-ws=pim] --wc-brand navy, the chip, menu, rail switch, planned and lens chips, 02 hides #wcHomeLead / #overview / #onboardBand. index.html: Help 🧭 Workspaces bullet, roadmap R67.",
      why: "Mihai, 24 Sep: ENCA Conditional Access becomes Workspace 01, Workspace 02 becomes PIM-buddy, everything PIM, with T19, T16, T17, T08, T12 and T27 carried over; mockup approved. LOW: presentation only — no read, no write, no change to any tool's screen; a carry-over tool is the same module. The only app.js change is one palette line.",
      test: [
        "Beta site, demo (?demo=1): the header shows ENCA and a chip 01 · Conditional Access; the rail is Home, Policies, Sign-ins, Who is…, Checks, Baseline, CA groups, Building blocks, All tools, Help — exactly as before 32407.",
        "Open CA groups and Policies (two tabs). Press the chip → 02 · PIM-buddy: the header turns navy, the chip reads 02, the rail reads Baseline (greyed, next build), PIM groups, Who holds…, Checks, Restricted AUs, Changes; the home title is Privileged access overview with the PIM lead and a library of 10 tools in four groups; the Policies tab is hidden, the CA groups tab is still there.",
        "On 02 open Restricted AUs; press ⌘⇧1 (Ctrl+Shift+1 on Windows): back on 01 with the header green, all three tabs showing (CA groups, Policies, Restricted AUs), the screen unchanged. The 01 ⇄ caption at the foot of the rail switches to 02 again.",
        "On 02 press ⌘K, type switch, Enter: 01. On 02 press ⌘K, type rollout, Enter: Guided rollout opens AND the shell follows to 01 (chip 01, header green), because the screen decides the side.",
        "Reload with ?ws=pim: starts on 02. Reload without it: starts on the last side used in this browser. A fresh browser starts on 01.",
        "Sign out and in again: the chip and rail are still there, on the side last used; the Recent tools list is reset as before.",
        "400px wide: the chip shows only the 02 badge, the menu opens within the screen, no horizontal scroll.",
      ],
      files: ["js/workspaces.js", "js/app.js", "css/workspaces.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 297,
      title: "🤖 Workload identities — T47, a tab of 🚦 Sign-in log: the service-principal policies against the service principal sign-ins (R46)",
      tools: ["Sign-in log"],
      builds: [32406],
      risk: "medium",
      what: "js/workloadid.js (new, pure: targets, inScope, fromGraph, fromHunting, huntQuery, kindOf, analyze, render, chips, toMd) with its script tag; js/app.js: openWorkloadId/renderWorkloadId/runWorkloadId with its own source switch (localStorage enca-wlsource:<tenant>) and window, wlHunt (EntraIdSpnSignInEvents, falling back to AADSpnSignInEventsBeta), wlReadPrincipals (directoryObjects/getByIds for the principals, applications(appId=) signInAudience for the ones owned here, up to 300), wlPolicies (the demo keeps its two workload identity policies out of the shared list), the signins TAB_HOSTS tab (beta: true), the FOLDED entry toolWorkloadId, screen-workloadid in HISTORY_SCREENS; js/demo.js DEMO_DATA.workload; index.html: screen-workloadid, the Sign-in log tile line, the Help h5 under Session controls, T47 in Tool numbers, roadmap R46 to In beta today; css/app.css wl- rules; tools/workloadid.test.cjs.",
      why: "Mihai, 24 Sep: R46 to beta; on the mockup he chose the Entra log as the default source with hunting optional, because the hunting table carries no Conditional Access columns. MEDIUM: read-only, but it reads a sign-in log no other tab reads, on endpoints no other tab has used (the servicePrincipal and managedIdentity event-type filters on the beta signIns endpoint, the SPN hunting table, applications by appId) — none of them run against a live tenant yet, and Graph may refuse the event-type filter or return the service principal fields under other names. Graduates once both sources have been read on a tenant with at least one workload identity policy On and the verdicts matched the portal's Service principal sign-ins view.",
      test: [
        "Beta site, demo (?demo=1): 🚦 Sign-in log → 🤖 Workload identities → ▶ Read. svc-backup-graph reads Blocked 1×, svc-payroll-export Covered, app-hr-sync Report-only only, mi-func-invoices and Contoso Ticketing Cannot be targeted; Per policy says CA900 blocked once and names one principal it can never act on.",
        "A tenant with a workload identity policy On (Workload Identities Premium), Entra log, 7 days: every principal the policy names is listed, including ones with no sign-in; blocked counts match Entra ID → Sign-in logs → Service principal sign-ins filtered on Conditional Access Failure for the same window.",
        "A report-only workload identity policy: its card says what it WOULD have blocked; compare with the Report-only column of the same sign-ins in the portal.",
        "Switch the source to Defender hunting (a P2 tenant with hunting access): one query, counts over 30 days, blocked as 53003 totals, and the card says which policy blocked is not in the hunting table. On a tenant whose schema still only has AADSpnSignInEventsBeta the note under the table names that table.",
        "A single-tenant app no policy scopes, signing in from an IP outside every named location, reads Reachable, not targeted and is counted in the Targetable, not targeted, outside named locations tile. Show Microsoft apps adds the first-party apps as Cannot be targeted.",
        "Signed in without a reader role for sign-in logs: the prompt says could not be read with Graph's reason; nothing else in the app changes. Stop read during the Entra read leaves the stopped message, not a partial table.",
      ],
      files: ["js/workloadid.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "tools/workloadid.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 296,
      title: "🌐 Named locations vs. the sign-in log — a vs. sign-ins view in 🧩 Locations (R19)",
      tools: ["Policy building blocks"],
      builds: [32405],
      risk: "low",
      what: "js/locsignin.js (new, pure: analyze, render, toMd, inCidr with IPv4/IPv6 BigInt arithmetic, logNames) with its script tag; js/app.js: the signins loView (renderLocations hands over to renderLoSignins, like Compare), runLoSignins over readSignInWindow with its own lsProg (Stop), window chips 1/7/30, Export MD in the view; index.html: the vs. sign-ins button in loViewSeg, the tile blurb, the Locations Help list item, roadmap R19 to In beta today; css/app.css .ls-ctl; tools/locsignin.test.cjs.",
      why: "Mihai, 24 Sep: R19 to beta; the mockup placed it inside Locations as a view rather than a new tab, and he approved it. LOW: read-only; the only read is the shared sign-in window every sign-in tool already makes. The judgement is only as good as the window — Graph reads stop at 10,000 sign-ins, so on a large tenant a location can read as not seen because it is past the cap; the view says CAPPED when that happens. Graduates once it has been read on a tenant with a trusted office range and a VPN range, and both verdicts matched what the admins know about those offices.",
      test: [
        "Beta site, demo (?demo=1): 🧩 Policy building blocks → 🌐 Locations → vs. sign-ins → ▶ Read the sign-ins. HQ egress shows sign-ins from the Amsterdam records, Branch office (unmarked) shows the Rotterdam and Utrecht ones, Blocked countries (empty) reads as no sign-in from these countries, and US / FR / PT appear under Countries no location names.",
        "A real tenant, Entra sign-in log source, 7 days: a trusted office range that is in daily use shows a non-zero count, users and a last-seen of today; its count carries the (N by Entra) note only when some matches came from ranges rather than from Entra's own record.",
        "Mark a TEST range that no one uses as trusted: after ⟳ Read again it appears as Trusted, nobody signs in from it — High when a policy uses All trusted locations or names it.",
        "Switch 🚦 Sign-in log to Defender hunting and read again: the note under Findings says this source carries no location match from Entra; the counts are from range and country matching and should be close to the Entra-log counts for the same window.",
        "30 days on a large tenant (Graph): the note says CAPPED when the read stopped at 10,000; Stop read during the read leaves the view with the stopped message, not a partial table.",
      ],
      files: ["js/locsignin.js", "js/app.js", "index.html", "css/app.css", "tools/locsignin.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 295,
      title: "🎫 CAE & token protection — T46, a tab of 🛡 Checks: coverage per persona (R21)",
      tools: ["Checks"],
      builds: [32404],
      risk: "low",
      what: "js/tokencov.js (new, pure: analyze, render, chips, toMd, RESOURCES) with its script tag; js/mslearn.js: runSome(prefixes, raws) — the named checks without touching run()'s module state; js/app.js: openTokenCov/renderTokenCov/tcRebuild, the checks TAB_HOSTS tab (beta: true), the FOLDED entry toolTokenCov, screen-tokencov in HISTORY_SCREENS; index.html: screen-tokencov, the Checks tile line, the Help h5, T46 in Tool numbers, roadmap R21 to In beta today; css/app.css tc- rules; tools/tokencov.test.cjs.",
      why: "Mihai, 24 Sep: R21 to beta; on the mockup he chose a tab in Checks over a tab of Session controls. LOW: read-only, reads nothing. The supported-resource table is dated 2026-09-24 and will age — Microsoft adds resources and platforms to token protection. NOTE for the next MS Learn review: the token-prot-apps check in js/mslearn.js still counts Azure Resource Manager as unsupported, while Learn now lists it as a browser preview. Graduates once it has been opened on a tenant with token protection On for at least one persona and the matrix matched the portal.",
      test: [
        "Beta site, demo (?demo=1): 🛡 Checks → 🎫 CAE & tokens opens without a ▶; the demo's only token protection policy is Off, so every persona reads none, the Resources table says no persona on every row, and no resource finding appears (there is nothing to compare against).",
        "A tenant with a token protection policy targeting Exchange, SharePoint and Teams on Windows only: the persona row lists exactly those three and windows; the Resources table shows that persona under Protected (On) for those three rows and nothing for AVD / Windows 365.",
        "Change a TEST token protection policy to All resources: the row carries a count of 📘 findings and the Findings list says it is fixed in Microsoft Learn; 📘 Microsoft Learn shows the same policy under Token protection: only supported for specific apps. Open 📘 afterwards — its own counts and suppressed line are unchanged by having opened this tab.",
        "A policy with CAE Disabled appears under Continuous access evaluation for its persona and as a cae-disabled finding; a strict-location CAE policy in a persona without any location-based policy reads as changing nothing.",
        "No token protection anywhere: the Admins persona finding is Medium, other personas of people are Info, and no resource finding appears. Export MD contains the matrix, the resource table and the findings.",
      ],
      files: ["js/tokencov.js", "js/mslearn.js", "js/app.js", "index.html", "css/app.css", "tools/tokencov.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 294,
      title: "📏 Naming — T45, a tab of 🛡 Checks: the CA-number convention checked (R25)",
      tools: ["Checks"],
      builds: [32403],
      risk: "low",
      what: "js/naming.js (new, pure: analyze, render, chips, toMd, stem) with its script tag; js/app.js: openNaming/renderNaming/nmRebuild, the checks TAB_HOSTS tab (beta: true), the FOLDED entry toolNaming, screen-naming in HISTORY_SCREENS; index.html: screen-naming, the Checks tile line, the Help h5, T45 in Tool numbers, roadmap R25 to In beta today and R20 closed under Shipped before as delivered by R65; tools/naming.test.cjs.",
      why: "Mihai, 24 Sep: R25 to beta; on the mockup he chose the Checks tab with free numbers folded as information. LOW: read-only, reads nothing, works on the policies loaded at sign-in. Graduates once it has been opened on a CloudFellows tenant and a Joey tenant and every finding it raised was a real naming problem — in particular that no version pair or staging prefix reads as a duplicate.",
      test: [
        "Beta site, demo (?demo=1): 🛡 Checks → 📏 Naming opens without a ▶ and lists findings for the demo policies; every policy name is a link that opens its card.",
        "A CloudFellows tenant with CA204 v1.0 and CA204 v1.1 side by side (or any version pair, with or without a (NEW)/(UP) prefix): neither appears under Number used twice.",
        "Rename a TEST policy to carry the number of another policy with a different name: both appear under Number used twice, each naming the other.",
        "A policy named …-Admins-… numbered in the CA200s appears under Name ≠ range; a CA215-Internals policy that includes CAB-SEC-U-Persona-Admins appears under Name ≠ assignment.",
        "With the Joey catalog active (no persona groups): the note under Findings says Name ≠ assignment was not checked, and no such finding appears.",
        "Free numbers: the fold lists only numbers below the highest used one per range and the tiles do not count them. Export MD contains the same rows as the screen.",
      ],
      files: ["js/naming.js", "js/app.js", "index.html", "tools/naming.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 293,
      title: "🔒 Protect exclusions 3.1 — break-glass accounts in the restricted unit, and who can manage the units",
      tools: ["Protect exclusions", "MS Learn"],
      builds: [32402],
      risk: "medium",
      what: "New js/bgvault.js (pure: accounts, panel, tile, scopes, scopeCard, learnBand, reportLines). js/protect.js: a third lock per break-glass group — cat “accounts” and the 👤 Accounts open chip, the vault-N-accounts tick on the row, the panel as a sub-row, the tile, the scope card, a second acknowledgement in Settings, account counts in the bar and the result. js/app.js: readRestrictedUnits (the one AU read, now with what each unit holds), readBgAccounts (transitive members, each account's own memberOf of restricted units, the unit's users for stale ones), readGaStates (transitiveMemberOf directoryRole; roleAssignmentScheduleInstances and roleEligibilityScheduleInstances only after 🔑 Read PIM), readUnitScopes (scopedRoleMembers per restricted unit, PIM-eligible by directoryScopeId after Read PIM, names by directoryObjects/getByIds), prApply writes accounts with POST administrativeUnits/{id}/members/$ref and reads them back, a stale one with DELETE …/members/{id}/$ref; MS Learn reads the same for the break-glass group and draws a band. Help, tile and css.",
      why: "Mihai, 24 Sep: the users in CAB-SEC-U-BreakGlass must also be placed in the RMAU — then, while it was being built: also check the scope on the RMAU, groups and user admin. Advice and a mockup came first (the chanceofsecurity.com break-glass post and Microsoft Learn on restricted management AUs), approved with “bouwe”. Medium: it WRITES Global Administrators into a restricted unit, after which nobody can reset them until they are taken out again — the second acknowledgement and the recovery text exist for that; the scope check and the band only read.",
      test: [
        "Beta site, demo (?demo=1), 🔒 Protect exclusions → Scan: the break-glass row carries a panel with breakglass-01 in CAB-SEC-RMAU-BreakGlass, breakglass-02 not in a restricted unit and EmergencyAccess-old as in the unit, not in the group; the tile reads 👤 Break-glass accounts 1 / 2; the 🔑 card shows GLO as nobody, ADM as correct (Groups Administrator eligible through a group, User Administrator not needed) and BreakGlass as role missing (no User Administrator).",
        "Tick vault 1 account on the break-glass row: breakglass-02's own tick follows, the bar says 1 break-glass account into the unit and Protect is enabled; press Protect without the second acknowledgement — Settings opens and a toast asks for it; tick it and run — the ledger has a 👤 breakglass-02 line and the panel shows it protected.",
        "Real tenant with CAB-SEC-U-BreakGlass in CAB-SEC-RMAU-BreakGlass and one account outside it: the account reads not in a restricted unit; run it; in Entra, Administrative units → CAB-SEC-RMAU-BreakGlass → Users lists it, and the user's Overview says it is a member of a restricted management administrative unit. The panel re-reads and shows it protected.",
        "Same tenant: as a tenant-wide User Administrator, try to reset that account's authentication methods — refused. Recovery drill: as the other break-glass account (Global Administrator), remove it from the unit, confirm the reset is possible, put it back.",
        "Scope card: a unit with only groups and a scoped Groups Administrator reads correct; remove the scoped role in Entra and rescan — nobody. Add a User Administrator scoped to the break-glass unit — the row shows it, with the note that the Global Administrators stay out of its reach. Press 🔑 Read PIM, consent RoleManagement.Read.Directory: an eligible scoped assignment appears tagged eligible, and the accounts' Global Administrator column says permanent (or time-bound / activated / eligible).",
        "A tenant where the account read fails (sign in without Directory.Read.All consent on a fresh app) — the panel says not read, never not in a restricted unit.",
        "📘 MS Learn on the same tenant with an account outside the unit: a band above the findings (High) names the account; Fix in 🔒 Protect exclusions opens the tool. With every account in the unit and the roles present, no band.",
      ],
      files: ["js/bgvault.js", "js/protect.js", "js/app.js", "css/app.css", "index.html", "js/changelog.js", "js/version.js", "js/promote.js", "tools/bgvault.test.cjs"],
    },
    {
      n: 292,
      title: "🚚 Waiting for production — newest last, and NEW since your last visit",
      tools: ["Help"],
      builds: [32318],
      risk: "low",
      what: "js/app.js, the queue render in Help: blocks ordered by their NEWEST item (Newest last, default) or their oldest (By number), kept in localStorage enca.pqOrder and applied by moving the tbody rows (data-pqblk per block); items above the highest number seen (enca.pqSeen, written once the list has been on screen, via IntersectionObserver) carry a NEW tag and open their batch, the batch row shows N NEW; first visit marks items with a build dated in the last three days (changelog dates); mark all seen. css/app.css: the lemon bar on new rows. Help paragraph above the list.",
      why: "Mihai, 24 Sep, screenshot of the queue ending at 289: why am I missing the passkeys and the cross-tenant — 290 and 291 were folded under the Checks batch, which sat at its oldest item 280 near the top. Mockup shown first (review/2026-09-24/queue-order), approved as shown. Low: beta-only display of the queue — production never renders this list, so this item only matters if the queue render is ever ported.",
      test: [
        "Beta site, Help → Waiting for production: the list ends with the Checks batch (it holds 291, the highest number), opened, with 290 and 291 tagged NEW and a lemon bar; the toolbar says 2 new since your last visit.",
        "Click By number: the Checks batch moves back up next to CIS Benchmark and Workspaces; reload — By number is kept. Click Newest last: it goes back to the bottom.",
        "Reload the page and open Help again: the NEW tags are gone. Clear localStorage enca.pqSeen and reload: items with a build from the last three days are NEW again, older ones are not.",
        "Load the site on the home page only, then clear nothing and open Help: items that were NEW are still NEW — loading the site without opening the list does not mark them seen.",
        "Ticks, Export promotion order and Fold all behave as before in both orders; a ticked item's batch still opens by itself.",
      ],
      files: ["js/app.js", "css/app.css", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
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
