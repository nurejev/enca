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
      n: 274,
      title: "📘 Shared-device matrix — Teams Rooms and Surface Hub against the demanded controls",
      tools: ["Checks"],
      builds: [25485],
      risk: "low",
      what: "js/mslearn.js: DEVICE_ROWS, DEVICE_CONTROLS (the guest matrix's controls plus risk remediation, token protection, customised CAE, no resilience defaults, insider risk, device code blocked), DEVICE_SUPPORT from Learn's Teams Rooms table and the Surface Hub page, reachesDevices (All users minus the shared-device group, or including it; All resources or a Teams app), reachesPlatform, deviceDemands, deviceMatrix, renderDeviceMatrix. js/app.js: mlDevMatrix built beside mlMatrix, rendered under it, data-dmcell opens Policies with idFilter. index.html: Help entry.",
      why: "Mihai asked for shared devices beside the guest matrix. Microsoft documents what Teams devices cannot do, and the per-policy checks only covered MFA, sign-in frequency and the device-code block on All-users policies.",
      test: [
        "CloudFellows baseline tenant (Include Off): the shared-device card says it reads CAB-SEC-U-TeamsSharedDevices; CA000, CA007, CA008, CA014, CA015, CA016 do not appear (they exclude it); CA099 no longer does either after 25481.",
        "A tenant with an All-users sign-in frequency policy that does not exclude the group: Teams Rooms on Windows × Sign-in frequency reads blocked, and the cell opens that policy.",
        "An All-users MFA policy: Windows rooms blocked, Android prompts, Surface Hub blocked.",
        "Remove the shared-device group temporarily (or test in a tenant without one): the card says no group was found and counts every All-users policy.",
      ],
      files: ["js/mslearn.js", "js/app.js", "index.html", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 273,
      title: "⇄ Switch over in Housekeeping, and version names with a hyphen",
      tools: ["Policies"],
      builds: [25484, 25486],
      risk: "high",
      what: "js/import.js: switchCandidates(list) — newer version Off while an older one is On / Report-only, grouped per newer version, target state from the older ones (On beats Report-only), housekeeping reasons minus the two the switch resolves, needsCompare, incomplete; switchOver(items, {reportOnlyFirst, readWaits, shouldStop, onItem}) — newer PATCH state + read back, then each older PATCH disabled + read back, partial when an older refuses; switchReport. housekeeping() family() strips -vX as well as spaced vX. js/app.js: the ⇄ section at the top of the Housekeeping list (ticks gated on Compare for pairs that differ, Report-only-first switch, review step with typed SWITCH, RunLedger, report, reload), Housekeeping button shows the switch count, Duplicates intro counts version pairs. index.html: Housekeeping Help.",
      why: "Perfetti, 23 Sep: 8 new versions left Off beside their predecessors by an import that could not verify them, and nothing in ENCA could finish the change. The hyphen bug meant no CloudFellows pair could ever be a Housekeeping cleanup candidate. Risk high: it changes the state of production policies.",
      test: [
        "25486: 🧹 Housekeeping → ⇄ Switch over a pair → Report: the report is in front, readable, and Download works; the same from 🔀 Duplicate names in CA groups and 👯 Duplicates.",
        "Perfetti: 🧹 Housekeeping shows ⇄ Switch over with the pairs from the 23 Sep import (CA014, CA100, CA101, CA111, CA200, CA302, CA405, CA1007). CA101 cannot be ticked until Compare has been opened for it.",
        "Tick CA200 only, leave Report-only first unticked, Review, type SWITCH, run: CA200 v1.0.1 reads the state CA200 v1.0 had, then v1.0 reads Off — in that order in the portal's audit log.",
        "Afterwards CA200 v1.0 appears below as a Cleanup candidate (Off, same configuration, newer On) — before this build no hyphenated pair ever did.",
        "Make a new version refuse (e.g. one still carrying the retired approved-app control): the row fails and its older version stays On.",
        "👯 Duplicates on Perfetti says how many more CA numbers are at two versions.",
      ],
      files: ["js/import.js", "js/app.js", "index.html", "tools/switch-over.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 272,
      title: "Import — finish created-but-not-yet-visible policies at the end of the run",
      tools: ["Import"],
      builds: [25483],
      risk: "high",
      what: "js/import.js: afterCreate(c, waits) — verify, activate, switch the superseded version Off — split out of importPolicies; an UNREAD (404) error after the create parks the item in deferred[] with a pending result and onItem phase pending; after the loop each parked item runs afterCreate again with LATE_WAITS (2+4+8+15+30 s) and its result replaces the pending one; a still-unread policy fails with the two-checks wording and points at Housekeeping / by hand. js/app.js: the import ledger notes a pending row instead of failing it, and marks a late success.",
      why: "Perfetti, 23 Sep, Match & replace from the CloudFellows baseline: 8 of 18 replacements created and never verified, each left Off beside its predecessor On. Risk high because it changes when an import switches a production policy Off.",
      test: [
        "Import into a large tenant (Perfetti) in Match & replace: rows that Entra is slow to show read created · checked again at the end, and turn ✓ at the end with the old version switched Off — the report lists them under imported, not failed.",
        "A policy that never becomes readable (simulate by importing and deleting it in the portal within seconds) is reported as failed after both checks, the old version untouched.",
        "Stop the run while policies are parked: they are reported as created Off and not verified, the old versions untouched.",
        "Recover the 8 from 23 Sep by hand first (they are Off beside their predecessors); a re-run of the same file will not touch them because it skips them by name.",
      ],
      files: ["js/import.js", "js/app.js", "tools/import-joey.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 271,
      title: "🔀 Merge groups that share a display name",
      tools: ["CA groups"],
      builds: [25477, 25480],
      risk: "high",
      what: "js/groupmerge.js (GroupMerge: duplicateSets, usersWithSwap, plan, run, report — pure, I/O injected). js/app.js: cgMergeDup button (syncMergeDupBtn after each scan), gmModal flow — member read per group (/groups/{id}/members), keep radio, per-name plan with refusals and the dynamic-rule warning, review step with rename-aside (default, typed MERGE) or delete (typed DELETE), JSON backup, RunLedger; deps POST members/$ref, GET + PATCH the policy, Importer.readSettled, PATCH displayName or DELETE the group. js/cagroups.js: ARCHIVE_SUFFIX and findArchived include merged. index.html: button, modal, script tag. Demo: a second CAB-SEC-U-Persona-Externals (g-demo-ext2).",
      why: "The CloudFellows baseline review found two groups called CAB-SEC-U-Persona-Externals, so members of one got no MFA; the fix by hand is members, then ten policies, then the group — in that order or a policy points at nothing. High risk because it writes group membership, up to every CA policy, and can delete a group.",
      test: [
        "25480: on the CloudFellows baseline tenant the 🔀 card reads, for the retired group, named by 8 policies (7 include · 1 exclude); the foot says repoint the 8 policies that name cd9fb158…, notes that CA099 already names both, and says the kept group is named by 12 policies afterwards.",
        "CloudFellows baseline tenant → 👥 CA groups → Refresh: 🔀 Duplicate names (1) appears; the dialog lists both CAB-SEC-U-Persona-Externals ids with members, rule and the policies on each side.",
        "Select the dynamic group with 0 members as the one to keep while the other has members: the card refuses and says why; select the other: the plan runs.",
        "Review → Rename it aside → type MERGE → run with the backup ticked: the JSON downloads first, then members, then each policy; afterwards CA300/CA301/CA304/CA310 and CA302–CA308 all name the kept id, CA000 and CA099 exclude it once, and the other group reads (merged YYYY-MM-DD).",
        "🧹 Archived groups lists the renamed group with 0 policy references; its Check uses finds anything outside CA before you delete it there.",
        "🛡 Checks → Bypass: the Group Hygiene finding for that name is gone.",
        "Force a failure (a policy that refuses its PATCH, e.g. one still carrying the retired approved-app control): the run stops after the policies, reports partly done, and the other group is NOT renamed or deleted.",
      ],
      files: ["js/groupmerge.js", "js/app.js", "js/cagroups.js", "index.html", "tools/group-merge.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 270,
      title: "Bypass checks — duplicate group names and allow-list block completeness",
      tools: ["Checks"],
      builds: [25476],
      risk: "medium",
      what: "js/gapcheck.js tenantChecks: checkDuplicateGroupNames (ids referenced by active policies grouped by trimmed lower-case display name from ctx.names) and checkAllowListBlocks (hasBlock + All users + All resources + unconditional + 3 or more excludeGroups; missed include groups, groups excluded by 2 or more other All-users policies, ungroupable external types). Scorecard link. js/app.js runGapCheckScan: gcCtx.names seeded from policyResolve.names.",
      why: "The review of the CloudFellows baseline export found the duplicate Externals group and three holes in CA099 by hand; no check could see any of them.",
      test: [
        "CloudFellows baseline tenant, 🛡 with Include Off ticked: Group Hygiene names two groups called CAB-SEC-U-Persona-Externals and lists CA300/CA301/CA304/CA310 on one and CA302–CA308 on the other.",
        "Same run: Allow-List Block on CA099 names CAD-SEC-U-DG-INT (included by CA200), CAB-SEC-U-TeamsSharedDevices (excluded by 7 policies) and the service provider / direct connect / other external types.",
        "After fixing all three in the tenant and ⟳ Refresh: both findings are gone.",
        "Group names read as names, not GUIDs, on a real tenant (not only in the demo).",
      ],
      files: ["js/gapcheck.js", "js/app.js", "tools/gapcheck-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 269,
      title: "Guest checks — TAP is not a guest method; an unconditional block counts as MFA coverage",
      tools: ["Checks"],
      builds: [25475],
      risk: "high",
      what: "js/mslearn.js: RESOURCE_OK_METHODS without temporaryAccessPass; isNeverForGuests, comboUsableHere, comboUsableAtHome; guest-auth-strength-unsatisfiable and the matrix strength verdict use them, with a TAP note and a not-even-through-trust branch; MFA_EQUIV_SIGNATURE drops the TAP clause; fullBlock / blockedBy feed extMfaGap.blocked and the ext-type-no-mfa detail.",
      why: "Running the checks over Mihai's CloudFellows baseline export: the guest-admin policies (PR + TAP) and CA508 were silent, and the no-MFA finding on CA400 was moot because CA099 blocks those types.",
      test: [
        "CloudFellows baseline tenant with a B2B guest in CAB-SEC-U-Persona-GuestAdmins: 📘 shows Authentication strength guests cannot complete for CA502, CA503, CA506, CA507 and CA508, each saying a TAP does not work for guest users.",
        "No policy on the Phishing-resistant MFA + TAP strength appears under This strength is Require MFA already.",
        "With CA099 in scope (Include Off ticked), External user types that no MFA policy reaches does not fire on CA400. Untick CA099's state or add a country condition to a copy: it fires again.",
      ],
      files: ["js/mslearn.js", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 268,
      title: "Bypass checks — security info registration, device code flow, sign-in frequency column",
      tools: ["Checks"],
      builds: [25473],
      risk: "medium",
      what: "js/gapcheck.js tenantChecks: checkSecurityInfoRegistration (includeUserActions urn:user:registersecurityinfo with MFA or block; medium / low when only report-only or Off) and checkDeviceCodeFlow (block with authenticationFlows.transferMethods deviceCodeFlow on coversEveryone + All resources; medium / low when narrow or not On). makeDetectors session-sif counts signInFrequency only. Persona gap remediation per control. Scorecard category links.",
      why: "Open items of the 25469 audit — what the checks had never looked for. The sign-in frequency column was found while building the admin-session check, which turned out to duplicate the matrix and was not shipped.",
      test: [
        "CloudFellows baseline tenant: if a catalog policy targets Register security information, no Security Info Registration finding; otherwise the finding appears with the template. Note which, so the catalog can be judged.",
        "A tenant without a device code flow block: Authentication Flows — Device code flow is not blocked (medium). Add one scoped to a pilot group: it turns low, not for everyone. Scope it to All users and All resources: gone.",
        "An admin-role policy with only Persistent browser session → Never persistent: the persona matrix shows ✗ Sign-in frequency for Admins and the finding names Session → Sign-in frequency → 4 hours. Add a 4-hour sign-in frequency: ✓.",
        "The scorecard's Block policies deployed signal filters the findings to include Authentication Flows.",
      ],
      files: ["js/gapcheck.js", "tools/gapcheck-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 267,
      title: "Guest checks follow guests through included groups",
      tools: ["Checks"],
      builds: [25472],
      risk: "medium",
      what: "js/app.js: readGuestGroups(ids) — per group, GET /groups/{id}/transitiveMembers/microsoft.graph.user?$count=true&$filter=userType eq 'Guest'&$top=1 (ConsistencyLevel eventual via gget), displayName when the count is above zero, mapLimit 4, cap 80, partial flag; passed as opts.guestGroups to MSLearn.run and guestMatrix. js/mslearn.js: GUEST_GROUPS, guestGroupsOf, extScope(p, want, noGroups) adds b2bCollaborationGuest via the group; mfaReaches uses noGroups; guestGroupIds exported; summary sentence.",
      why: "Open item of the 25469 audit: a guest-admin persona scoped by group with a phishing-resistant strength — the textbook guest lockout — produced no finding.",
      test: [
        "On the baseline tenant, a CA5xx guest-admin policy on the Phishing-resistant MFA strength, scoped to CAB-SEC-U-Persona-GuestAdmins with at least one B2B guest in it: 📘 shows Authentication strength guests cannot complete in this tenant, naming the group and the member count. On 25471 it showed nothing.",
        "The 📘 summary line says Guests are also followed through N included groups; N matches the number of included groups that actually hold guests.",
        "Guest matrix: B2B collaboration guests has cells for the controls that group-scoped policy demands.",
        "A group with no guest members adds nothing; excluding the same group on the policy removes the finding.",
        "Check the network tab: one $count request per included group, and none for policies on All users.",
      ],
      files: ["js/app.js", "js/mslearn.js", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 266,
      title: "Token protection device filter — Entra-joined only",
      tools: ["Checks"],
      builds: [25471],
      risk: "medium",
      what: "js/mslearn.js: TOKEN_PROT_DEVICE_RULE pairs CloudPC, AzureVirtualDesktop, MicrosoftPowerAutomate and SecureVM each with device.trustType -eq \"AzureAD\" in parentheses; TOKEN_PROT_DEVICE_FALLBACKS starts with the pre-25471 rule, then SecureVM alone; token-prot-devices reports a label rule without trustType as over-broad; remediation and remediationParts rewritten; fix note says Autopilot self-deploying needs its enrollment profile name.",
      why: "Learn's known limitations and example filters name only Entra-joined devices; the old rule removed supported hybrid-joined Cloud PCs and session hosts from token protection. Open item of the 25469 audit.",
      test: [
        "📘 on a tenant with a token-protection policy and no device filter: the Fix builds a filter whose rule contains trustType -eq \"AzureAD\" four times. Apply it (baseline tenant) or import the JSON: Entra accepts it — if it refuses, the result says which fallback landed.",
        "A token-protection policy whose filter is the old rule (labels without trustType) shows Token protection: unsupported device types must be excluded with the over-broad text.",
        "A hybrid-joined Cloud PC signs in to Outlook under the new policy and the sign-in log shows the token-protection session control applied (not excluded by the filter).",
      ],
      files: ["js/mslearn.js", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 265,
      title: "Bypass & Swiss cheese checks audit — MFA and legacy scope, OR verdicts, guest strength, human recommendations",
      tools: ["Checks"],
      builds: [25470, 25479],
      risk: "medium",
      what: "js/gapcheck.js: isMfaForAll requires allApps, partial MFA reported high; legacyTenantWide (everyone, All resources, both legacy types), narrow block reported high with reasons; checkOr — MFA OR device-trust low (Microsoft template), MFA OR app protection / password change medium, else high; checkGuestStrength only when every allowedCombination needs a home-tenant method; targetsUsers ignores GuestsOrExternalUsers; stable expansion key; recommendations rewritten where / change / why.",
      why: "Part of the T07/T08 audit Mihai asked for. Two checks gave an all-clear they could not justify (MFA for all users on one app, a legacy block on one group); two raised findings that contradict Microsoft's own guidance (the MFA-or-device template as High, every guest MFA policy as a trust problem).",
      test: [
        "25479: a policy requiring the Multifactor authentication strength OR a compliant device shows the Low Microsoft-template finding; a policy requiring MFA OR a terms of use shows a High finding saying a click on the terms is not a second factor.",
        "A tenant whose only all-users MFA policy targets Office 365: 🛡 shows MFA for all users exists only for selected resources, not a clean MFA Coverage.",
        "A legacy block scoped to a pilot group: Legacy authentication is blocked, but not tenant-wide, naming the group scope. The CloudFellows CA002 legacy block (All users, All resources, both legacy types) produces no legacy finding, even with the narrower CA1104 beside it.",
        "A policy MFA OR compliant device OR hybrid joined: one Low finding, Microsoft template. MFA OR app protection: Medium, saying it can be met without a second factor.",
        "CA400 with Require MFA for guests: no Guest Authentication Strength finding. A guest policy on the Phishing-resistant MFA strength: one High finding.",
        "Expand a finding, switch the severity filter away and back: it is still expanded.",
      ],
      files: ["js/gapcheck.js", "tools/gapcheck-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 264,
      title: "MS Learn checks audit — cross-tenant trust from the default, Windows Cloud Login, approved app read-only, external types without MFA",
      tools: ["Checks"],
      builds: [25469],
      risk: "high",
      what: "js/graph.js: crossTenantTrust() reads /policies/crossTenantAccessPolicy/default (inboundTrust, b2bDirectConnectInbound) and EVERY partner (isServiceProvider kept as a flag); serviceProviderPartners() is built on it. js/mslearn.js: ctView / inboundTrust / guestTrust / spWithoutTrust / dcInboundOpen replace trustGap — a partner flag that is null inherits the default; guest-auth-strength-unsatisfiable, guest-device-grant-needs-trust and the matrix verdicts use guestTrust; AZURE_VM_SIGNIN 372140e0 split from WINDOWS_CLOUD_LOGIN 270efc09; approved-client-app-retirement rewritten for the 30 June 2026 read-only state (fires on the OR transition too, severity high, remediationParts); token-prot-platform wording for Apple; guest-user-risk-blocked only for password change / risk remediation / block; defender-mobile-exclusion skips legacy-only, auth-flow and non-mobile-platform blocks; severity low in SEV_LABEL, group order and the summary; new check ext-type-no-mfa with extMfaGap / mfaReaches and a fix that adds the missing types; buildFixes passes the finding result to a fix. js/app.js: runMsLearn passes crossTenant; the Low filter chip. js/demo.js: crossTenantDefault.",
      why: "Mihai asked for T07 and T08 to be rock solid. The trust defect was a false all-clear: a tenant with no CSP partner read as trusting every guest's device and MFA claims. The new check catches the hole the 25468 catalog revision opened (Other external users reached by no MFA policy).",
      test: [
        "On a tenant whose DEFAULT inbound trust has compliant devices OFF and no service-provider partner: a policy requiring a compliant device of All users shows Device control in scope of guests without inbound device trust, saying OFF in the default; the matrix cell for B2B collaboration guests × Compliant device reads trust, not ok. On 25468 the same tenant showed neither.",
        "Turn compliant-device trust ON in the default settings, re-run (⟳ Refresh first): the finding is gone and the cell reads ok. Add a partner with it switched off: the finding returns naming that partner.",
        "A token-protection policy targeting Windows Cloud Login (270efc09) is not flagged by Token protection: only supported for specific apps.",
        "A policy with Require approved client app OR Require app protection policy is listed under Policy frozen by the approved client app retirement; its Fix builds a copy with app protection only, state Off.",
        "On the CloudFellows baseline tenant at catalog 25468: External user types that no MFA policy reaches sits on CA400 and names Other external users; with B2B direct connect blocked inbound it does not name direct connect and says why. The Fix adds otherExternalUser to CA400 only.",
        "A user-risk policy granting Require MFA and reaching All users does not appear under User-risk policy blocks guests; one granting Require risk remediation does.",
        "The legacy-auth block does not appear under Defender mobile apps must be excluded; a country block on All users and All resources still does.",
        "The Low filter chip appears when the swap-for-MFA finding is present and filters to it.",
      ],
      files: ["js/graph.js", "js/mslearn.js", "js/app.js", "js/demo.js", "tools/mslearn-guests.test.cjs", "tools/mslearn-audit.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 263,
      title: "Export the baseline from the baseline page, per persona",
      tools: ["Baseline"],
      builds: [25463],
      risk: "low",
      what: "index.html: blExport on the baseline action row (gated isBaselineTenant() and not demo, beside blCatalogUpdate) and bkPersonas inside the EXISTING backup modal. js/app.js: runBackup(pool, opts) — the body became paintBackup(), so the persona chooser repaints in place instead of reopening; bkPersonaKeys(pool) offers only the personas present, with counts, plus a no-CA-number row; bkInPersona filters after backupScope; the title and the go button relabel. The zip, backupDependencyIds, DEP_ENDPOINTS and the MigrationTable are untouched — one export, one implementation. bkGroups is ticked on open. FIX: the empty-scope early return bailed before painting, so unticking every persona left the previous count with Download live; it now paints zero and disables, and only when the chooser is off does the old toast stand.",
      why: "Mihai: when in the baseline page on the baseline tenant, I want to select export baseline, options per persona and Dependencies — and, on the shape of it: just like the backup from the policies section, but now also make available from the baseline page. The baseline is built and taken one persona at a time, and the page where that work happens had no way to take it.",
      test: [
        "On the reference tenant, the Baseline page shows ⬇ Export baseline; on any other tenant and in demo it does not.",
        "Open it: the title reads Export baseline (JSON), the baseline-tenant band is shown, Dependencies is already ticked, and the persona rows list only the personas this tenant holds with their counts.",
        "Untick a persona — the policy count and the dependency line both drop; tick it back and they return. Untick all: zero policies, zero dependencies, Download disabled. ☑ All restores.",
        "Download with two personas: the zip holds only those policies, and the dependency folders hold only what THEY reference (not the whole tenant's), with MigrationTable.json.",
        "Open 🗄 Backup from the Policies screen: no persona row, title Backup (JSON), button Download backup — unchanged.",
        "The whole suite, the plain-text check, and the jsdom drive-through of the panel.",
      ],
      files: ["index.html", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 262,
      title: "Baseline catalog revised from CloudFellows.dev (2026-09-22)",
      tools: ["Baseline"],
      builds: [25450, 25461, 25462, 25468, 25481, 25482],
      risk: "medium",
      what: "25468: a third revision, 2 policies — CA000 v1.0.3 excludes every guest and external type; CA400 v1.0.3 swaps the Multifactor authentication strength for Require multifactor authentication (the swap the 25459 MS Learn check recommends). Applied in place, list order kept, the new CA000 clause appended where the upload has it. REACH, counted: B2B direct connect and other external users are now required MFA by no policy in the catalog (CA000 was the only one reaching them); recorded in the file note, not corrected — the catalog mirrors CloudFellows. 25461: a second revision the same day — 11 policies (CA005, CA007, CA008, CA009, CA011, CA014, CA016, CA111, CA400, CA402, CA403), one change: B2B direct connect out of the session policies. Seven gain the exclusion CA405 already carried, CA400 and CA402 drop the type from their guest include, CA014 and CA111 widen to every external type; names and versions with them. Applied by keeping each entry list ORDER and only adding or removing the clause that actually moved, so the diff is the change and not a reshuffle. 25462: the sweep is COMPLETE — the note written in 25461 counted exclusions instead of REACH. A B2B direct connect user has no directory account, so a persona-group-scoped policy can never reach one and an exclusion there is decoration; the 29 session policies without the clause are all group-scoped. Only All users or a clause naming the external types reaches one, ten do, and all ten are covered. The js/baselineData.js note and the 25461 changelog line were corrected. js/baselineData.js: revised 2026-09-22 from Mihai's 🧱 Update the catalog output — 7 entries taken (CA100, CA101, CA111, CA405: guest and external exclusion types + version; CA212: Office 365, v3.0, AppProtections name; CA301: BLOCK in the name; CA302: SESSION v3.0.2), the catalog's own list order and release tags kept; the 19 the tool also offered were serialiser faults (fixed in 25450, see item 258) and were not taken. The header carries the revision note. js/userimpact.js RULES_CHECKED_AGAINST stays 2026-08-20, so the brief shows its warning until the rules are walked against this revision.",
      why: "The catalog is what 🧬 Baseline, the group templates and the import compare against; the reference tenant moved on four guest-exclusion policies and on CA212 since 2026-08-20.",
      test: [
        "25482: on the baseline tenant 🧱 Update the catalog offers neither CA406 nor CA1007. On a tenant with CA1007 at v1.0.2, 🧬 Baseline reads it Outdated and 📥 Import proposes v1.0.3 with the Entra-joined-only device filter.",
        "25481: 🛡 Checks → Bypass on the baseline tenant (Include Off): no Group Hygiene finding for CAB-SEC-U-Persona-Externals, and the Allow-List Block finding on CA099 no longer names CAB-SEC-U-TeamsSharedDevices, CAD-SEC-U-DG-INT or service provider admins.",
        "25481: on the baseline tenant run 🧱 Update the catalog again — none of the 30 is offered. On a tenant still at CA099 v1.0.1 it reads Outdated and 📥 Import proposes v1.0.3 with the shared-devices and service-provider exclusions.",
        "25468: on the baseline tenant run 🧱 Update the catalog again — CA000 and CA400 are no longer offered.",
        "25468: 🗂 Policies on the baseline tenant — CA000 and CA400 read Up to date at v1.0.3; CA400's grant reads Require multifactor authentication, no strength.",
        "25468: 📘 MS Learn on the baseline tenant — no guest auth-strength finding (swap or not-universal) on CA000 or CA400 any more.",
        "25468: on a tenant still at CA000/CA400 v1.0.2 — both read Outdated and 📥 Import proposes v1.0.3; after importing CA400, confirm in the portal it holds Require MFA and NO strength (the 25464 explicit-null path).",
        "25462: the header note in js/baselineData.js says the sweep is complete and why a group-scoped policy needs no carve-out; spot-check CA102 — scoped to CAB-SEC-U-Persona-Admins, no direct-connect exclusion, correctly so.",
        "25461: on the baseline tenant run 🧱 Update the catalog again — the 11 policies above are no longer offered; anything still offered is new since this build.",
        "25461: 🗂 Policies on the baseline tenant — CA005, CA007, CA008, CA009, CA011, CA016 and CA403 read Up to date, not Newer than baseline, and their exclusion lists show the B2B direct connect carve-out.",
        "25461: on a NON-baseline tenant nothing changes state from this — its own exclusions are never a difference (25453), so only a CA number and version at odds with the catalog is reported.",
        "🧬 Baseline on CloudFellows.dev after this build: the seven read Up to date (same version AND same definition); the Newer than baseline chip drops by seven, the 🏷 renamed group is empty, and 🧱 Update the catalog reports no serialiser drift on the platform lines.",
        "🧬 Baseline on a tenant still at CA100 v1.0.2: it reads Outdated, and 📥 Import proposes the v1.0.3 exclusion set.",
        "🗣 User impact brief: the revision warning shows (2026-08-20 checked against 2026-09-22); walk the RULES against CA212 (Office 365 now) and CA301, then move RULES_CHECKED_AGAINST.",
        "node --test tools/baseline-catalog.test.cjs — the 25450 case.",
      ],
      files: ["js/baselineData.js", "js/baseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "tools/baseline-catalog.test.cjs"],
    },
    {
      n: 261,
      title: "Edit a policy on its card (R17)",
      tools: ["Policies"],
      builds: [25448, 25456],
      risk: "medium",
      what: "25456: ✎ Edit is the FIRST button of the card action row (.pcard-actions, class btn primary, reading ✎ Edit this policy) instead of a small button in the wc-detail-top strip beside Close — Mihai: the edit button was all the way on top, every other action is on the bottom, that is why I missed it. renderCardEdit still hides it by the same [data-cedit=edit] lookup while an edit is open. ✎ Edit on the policy card (data-cedit). startCardEdit stashes the builder's draft, builds one from the policy (Builder.fromRaw, customName = the whole name), and renderCardEdit lays the builder's section forms (pbSectHtml, split out of pbFormHtml — the builder composes the same pieces with hints and navigation) into the card's six boxes plus a name field; the same delegated handlers (pbOnClick / pbOnChange / pbOnInput) run on #detailBody when pbSurface is card, and pbRepaint routes to renderCardEdit. cardEditBar counts Builder.diff rows, marks changed boxes and the name, holds the state select and the typed ON, shows Builder.diffHtml / preflightHtml on demand. Save is pbWrite: PATCH whole changed sections, Importer.readSettled, loadFromGraph(true), the card reopened. Cancel / closing the card / opening the builder end the edit (closeDetail, endCardEdit) and restore the builder's draft. Clone in builder replaces Edit in builder on the card and on the selection bar. DEPENDS ON queue 259 (js/builder.js).",
      why: "Mihai, after trying edits in the builder: editing a policy is not creating a new one, the workflow needs editing, it is not clear how. Mocked on the real card and approved with two answers: the name editable on the card; Assign stays the bulk tool and the card edits users inline as well. R17's own card always said edit from the card — the builder stepper was the wrong shape for changing one thing.",
      test: [
        "25456: open a policy card — ✎ Edit this policy is the first button of the row at the bottom, beside What-if flow and, after the separators, Clone in builder; the top strip carries Close only. Press it: the boxes become forms and the button disappears for the duration of the edit; Cancel brings it back.",
        "Open a policy card → ✎ Edit: six boxes become forms, the name is a field, the bar says 0 settings change and Save is disabled.",
        "Tick a grant control: the Grant box is marked CHANGED, the bar says 1 setting changes · grant, Save enabled; ± View diff lists grantControls.builtInControls.",
        "Edit the name: the bar adds name; the diff lists displayName. Untick the control again: back to 1.",
        "Switch State to On on a report-only policy: Save disabled until ON is typed in the bar.",
        "Save on a REAL tenant: the ledger shows PATCH → read back matches → re-read; the card reopens with the change; 🕓 Changes shows the same rows; the portal shows exactly the changed section and nothing else (a device filter or a guest clause the policy had must still be there).",
        "Cancel with changes asks; Cancel without changes just leaves. Close the card mid-edit, open 🧩 → Builder: the builder shows its own draft (or a blank one), never the card's.",
        "Users box: add a group by search, remove one with ✕, add a guest type under the fold — Save writes conditions.users whole (every list present in the PATCH body, JSON view in the builder is not involved).",
        "The action row and the selection bar read ⧉ Clone in builder and open a NEW draft with the next free number; no Edit in builder anywhere.",
        "node --test tools/*.test.cjs; the plain-text check; the toolbar-order check.",
      ],
      files: ["js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 260,
      title: "Register ENCA in your own tenant from the browser — the default sign-in (R59)",
      tools: ["Sign-in", "Home"],
      builds: [25438, 25439, 25443, 25444, 25455],
      risk: "medium",
      what: "25455: ONE CARD. The 🪪 front door is no longer a line under the ⚙ panel — it is a .conn-route block INSIDE conn-body (index.html #loginOnboard + #connRouteBody), painted by paintRoute() in js/connection.js from the ACTIVE AUTHORITY: EncaConn.isShared → the link, otherwise the blocked form naming ＋ Add and New-EncaAppRegistration.ps1 -SingleTenant with a Copy button (EncaConn.psLine). markOnboardLogin's isProdHost hide is GONE — a hostname was answering a question about the audience, so the route was hidden on the hosted site whose shared registration can carry it and shown on the beta host whose single-tenant registration cannot, where clicking it started a sign-in that could only end in AADSTS50020. The start click is delegated from #loginOnboard in js/onboard.js, because connection.js writes that markup. 25444: the account-menu row is back as static markup under the Connected app panel (onboardBtn, label set by paintMenu); Onboard.open({mode}) — check or new; the check step offers Add a separate registration instead; run() decides by form.own. 25443: S.own (owner tenant = signed-in tenant) → the wizard is a CHECK of the registration this copy signs in with, found by appId, PATCHed with updateBody (existing redirect URIs kept, permissions set, name/audience untouched), no connection saved; not own → the owner column shows the owner TENANT id, never the app's display name. The Connected app block in the account menu carries the button (wcOnboard); the menu row is gone. 25439: the pending flag is read synchronously at the top of afterSignIn and Onboard.pending() holds maybeShowWhatsNew back until enca:onboard-closed; #obModal z-index 335. js/onboard.js (Onboard): the browser version of New-EncaAppRegistration.ps1 -SingleTenant. Front door on the sign-in card (loginOnboard, hidden on BRANDING.host): sets a session flag, clicks Sign in, and afterSignIn opens the wizard once the tenant loaded. After sign-in: a band before #overview (re-painted on enca:wchome) and an account-menu row, only when /me/memberOf holds Global, Privileged Role, Application or Cloud Application Administrator AND Graph.connectionInfo() says the current registration is owned by another directory; dismissable per tenant in localStorage. Wizard: what changes (the SINGLE-TENANT.md table, app name, the exact SPA redirect URI, localhost, assignment, org-wide consent) → the plan with impact and recovery → the run (Graph.ensureScopes for Application.ReadWrite.All + DelegatedPermissionGrant.ReadWrite.All (+ AppRoleAssignment.ReadWrite.All), the Graph SP's oauth2PermissionScopes for the ids, POST or PATCH /applications by displayName, readSettled, the SP, appRoleAssignedTo me THEN appRoleAssignmentRequired, the AllPrincipals oauth2PermissionGrant, EncaConn.save selected) → default sign-in (this browser done; on an azurecontainerapps.io host a button sets ENCA_CLIENT_ID + ENCA_TENANT_ID via Resource Graph + GET-template-then-PATCH-whole under ARM_SCOPES, dropping ENCA_AUTHORITY; copy buttons for authConfig.local.js, docker -e and template parameters; Sign in again = EncaConn.use). Demo simulates every step. The scope list is asserted equal to the script's $DelegatedScopes by tools/onboard.test.cjs.",
      why: "Mihai: a web-based onboarding single-tenant flow, before login as the front door and after login as an option, and make it the default login. R14 shipped the PowerShell route in 273; this is the same registration made from the page, so a customer standing up a self-hosted copy — or a customer on a hosted multitenant copy who wants their own consent record — does not need PowerShell.",
      test: [
        "25455 on the BETA host (single-tenant registration): open the ⚙ panel — the 🪪 block sits inside it, above the redirect-URI line, with a red left edge, names the tenant id it is pinned to, and offers NO sign-in link. Copy puts the PowerShell line on the clipboard.",
        "25455 on a copy served with the shared registration (production, a container, a fork with the shipped default): the same block offers Register ENCA in your own tenant → and clicking it signs in and opens the wizard as before.",
        "25455: ＋ Add a connection whose tenant is organizations and select it on the beta host → the block flips to the link form on reload (it reads the connection in use, not the host); switch back to Default → the blocked form returns.",
        "25455: there is no 🪪 line under the fold on any host — one card, one question.",
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
      builds: [25437, 25441, 25445, 25446, 25452, 25454, 25456, 25457, 25464, 25465, 25478, 25479],
      risk: "medium",
      what: "25465: validate() refuses an authentication strength together with Require multifactor authentication (grant policies only) in Entra own wording, so Save is disabled before the round-trip instead of failing at it; a standing test that used that pair as its valid multi-control draft was corrected to two built-in controls. 25464: patchBody writes grantControls.authenticationStrength = null when the policy HAD a strength and the draft does not — omitting the key leaves the old strength in place, the policy then holds a strength and Require multifactor authentication together, Entra refuses the pair, and the save returns a bare 400 BadRequest. Mihai hit it on CA400 doing the swap the 25459 check recommends. Also toRaw stopped echoing the guest clause from the read: guestClause() names the externalTenants derived type every write and drops annotations, and an enumerated clause never falls back to all tenants. Both surfaces (builder and the card edit) save through patchBody, so both are fixed. 25457: pbDet(key, summary, body) writes the open attribute from a pbDets Set, and a CAPTURE-phase toggle listener on pbBody and detailBody records it (toggle does not bubble). Four pb-det panels were rewritten closed by every pbRepaint — guests include, guests exclude, exclude selected locations, exclude platforms — so one tick inside any of them folded it. The set is session state, deliberately not on the draft. 25456: pbOpenPolicyPicker gives every row ✎ Edit this policy (data-as=edit) beside ⧉ Clone into a new policy — 25448 had left Clone alone there, so the 🗂 start replaced the policy you picked with a clone of it. openBuilder({from, as:'edit'}) is unchanged and was never removed. 25454: the ld-divider between the steps and the preview is wired (pbRatio). 25452: Builder is the first tab of the 🧩 strip. 25446: edit mode — pbStart hidden, pbEditing chip + Discard, head line, stepsHtml marks every step done, step 1 is the name only, step 7 counts the diff and disables Save at zero. 25445: Edit in builder / Clone in builder on the policy card's action row (data-pbdetail in showDetail). 25441: persona chips are fchip (they carried a non-existent class). \ud83c\udfd7 Policy builder (T41, BETA), the sixth tab of T15 — R23 built on R17. js/builder.js (pure): the draft model, the CAnnn-KIND-Persona-words-vX.Y naming with the next free number in the persona's range, draft to Graph body and back, validation (nobody included, nothing enforced, the retired approved-client-app control, AND/OR), best-practice hints over the loaded policies and blocks, a preflight through WhatIfEval with synthetic subjects, a field-level diff, and a PATCH body of WHOLE sections (only the changed ones). js/app.js: the seven-step screen in the list/detail frame, pickers over the sign-in context's named locations / contexts / strengths (terms of use read on demand under Agreement.Read.All), group / user / role / app search, Card, JSON, Preflight and Diff previews, Change plan export, the write (optional exclusion group FIRST via gpostGroupCreate, then POST or PATCH under Policy.ReadWrite.ConditionalAccess, Importer.readSettled read-back, loadFromGraph(true), landing in Policies filtered to the policy). Entry points: Open in builder on the Policies action bar (Edit or Clone; several selected opens the first), New policy with this location / strength / context / terms on the four block panes. A new policy is born report-only; On needs a typed ON. FOLDED entry so ⌘K finds it; Importer.readSettled exported.",
      why: "Mihai: “go build R23, combined with building blocks, and it must also work when a policy is selected elsewhere”. The mockup was approved first (review/2026-09-22). R23's era header says it builds on R17 — the same draft edits an existing policy, which is R17's half, so both cards move to in beta today.",
      test: [
        "25479: card edit on any grant policy: tick Require multifactor authentication and Require app protection policy with Require one (OR) — a ⚠ hint under Grant says a password plus the right app gets in and that Checks reports it as Medium; switch to Require all (AND) — the hint goes. With a compliant device instead of app protection the hint is an info naming Microsoft's template.",
        "25478: a typed value that is not a GUID is refused with a toast and nothing is added.",
        "25478: on the card edit, Exclude guests → tick Service provider users → Only the tenants I choose: Save is disabled until a tenant is chosen; the CSP partner from cross-tenant access settings is offered with 🤝; after picking it and ticking a second type, the partner is still chosen. Save, then read the policy's JSON: excludeGuestsOrExternalUsers.externalTenants is #microsoft.graph.conditionalAccessEnumeratedExternalTenants with that tenant id in members.",
        "25478: 🗂 Policies → List → pick a persona → open a policy → Open wide & actions → ✎ Edit → change something → Save: the list still shows that persona only, and the saved policy is open in the inspector. Do the same through 🏗 Builder → Start from a policy → ✎ Edit: same result, no one-policy filter.",
        "🧩 Policy building blocks → the Builder tab: seven step rows, step 1 open, the name composed live, the next free number for the persona shown in the head and in step 1.",
        "Step 4: the tenant's named locations appear as blocks with trusted / countries / network access tags and their policy usage; picking one sets the name's words and the card's Conditions.",
        "Step 5: the tenant's authentication strengths and, after the one read, its terms of use; MFA + a strength together produces the hint that the strength already implies MFA.",
        "Preflight view: the first row applies for a member of the included group, the trusted-location row does not apply when All trusted is excluded, the excluded-group row does not apply, the guest row does not apply for a group-scoped policy; every row lists the other policies that apply.",
        "Create in report-only on a REAL tenant: the exclusion group is created first, the policy POSTed report-only, read back, the policy set re-read, and 🗂 Policies opens filtered to it. Check the policy in the portal — every condition as the card showed it.",
        "25446: Edit in builder on a policy whose name is not CAnnn-…: step 1 shows the name field only, no persona chips; the toolbar reads Editing <name> · Discard; step 7 says Nothing changes yet and Save is disabled; change the state → 1 setting changes, Save enabled.",
        "25465: with a strength selected, tick Require multifactor authentication — Save greys out and the reason names both controls; untick either one and Save comes back. A Block policy with the same ticks is not blocked.",
        "25464 ON A REAL TENANT: open a policy whose grant is an authentication strength, choose No strength, tick Require multifactor authentication, Save — it succeeds, and the policy in the portal shows the MFA control with no strength. Before this build it returned 400 BadRequest.",
        "25464: the reverse still works — a policy on Require MFA given a strength saves, and one that never had a strength is not sent a null for one.",
        "25464: save a policy carrying a guests-and-external-users clause with no other change to that clause — it succeeds, and the clause in the portal is unchanged (types and tenant scope both).",
        "25457: Builder → step 2 → open Exclude guests and external users → tick a type: the panel STAYS open, the count chip goes to 1 type, tick five more without reopening it. Same on Include guests (its own fold, unaffected by the exclude side), on step 4's Exclude selected locations and Exclude platforms. Close a panel and tick something else in the step: it stays closed.",
        "25457: open a policy card → ✎ Edit this policy → the Users box → the same guest panel behaves the same way.",
        "25456: 🧩 Policy building blocks → Builder → the 🗂 start → each row shows ✎ Edit this policy and ⧉ Clone into a new policy. Edit opens the builder on THAT policy: the toolbar reads Editing <name>, the Start-from segment is hidden, the number and name are the policy's own, the Diff view is empty until something is changed, and Save PATCHes only the changed sections. Clone opens a new draft at the next free number, report-only.",
        "25456: pick Edit, change the state, Save, then re-read the set — the policy is the SAME object (same id, same number), not a new one beside it.",
        "25445: open any policy card → Edit in builder opens the builder on it with the Diff view; Clone in builder opens a new draft with the next free number.",
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
      builds: [25436, 25437, 25440, 25442, 25449, 25450, 25452, 25453, 25467],
      risk: "medium",
      what: "25467: the per-policy cards in the 🧱 panel — the action row was class row, which only has a rule inside .modal, so its inline justify-content/gap/flex-wrap had no display:flex to act on; now bl-cardact (flex, wrap), the reason field an input.bl-why instead of an input.btn, the header bl-cardhead with a shrinkable bl-cardname, and the catalog/tenant lines bl-diffv (overflow-wrap:anywhere). data-blwhy kept, so the Hold handler is untouched. 25453: outside the baseline tenant include / exclude / name differences are ignored entirely (row.differsIn lists resources, conditions, grant, session only). 25452: Baseline.compare(vms, catId, {byDefinition}) — app.js passes isBaselineTenant(); only there does a definition difference at the same version become Newer than baseline; elsewhere the row is marked definition differs (row.differs) and the summary counts them apart. 25450: vmToEntry writes platforms as the catalog does (platformLine) and strips the tenant's (NEW)/(UP) prefix from the name; sameList keys a Platforms line through platformKey so either spelling compares equal. 25449: Baseline.reviewRow is the one judgement (definition diff + CLEAN name compare → kind version / edited / renamed), used by compare() for the chip and by catalogReview() for the panel; the panel groups and selects by kind and the chip equals the panel's ahead count. 25442: a number-clash row is never offered by the panel (it is another policy on that number). Baseline.compare marks a same-version policy whose definition differs as ahead with edited: true (Up to date = same version AND same definition), so the Newer than baseline chip, the summary line and the panel count the same policies; the panel groups by-version / edited-in-place on that flag. 25440: a differing NAME is a difference (catalogReview pushes a name-and-version diff row), so a version bumped with no other change is offered and the generated entry carries the tenant's name and version; the panel groups newer-in-name (= the chip's count) / edited in place / new here with a Select button per group. 25437: Select all / Deselect all above the list; the changed count is related to the summary's newer count (versions in names vs definitions), and each changed card says newer version in name / same version — edited in place / older version in name. \ud83e\uddf1 Update the catalog from this tenant, in baseline tenants only (never demo). Baseline.catalogReview compares each policy against its catalog entry on DEFINITION \u2014 vmToEntry renders the tenant view model into catalog shape, entryDiff normalises both sides so group order, condition order, the bullet and minus decoration, line-break markup and markdown emphasis are not differences. Take or hold per policy; holds are keyed by the signature of the difference and kept per tenant in localStorage. catalogSource emits the entries plus a revision note with every hold and its reason. Output is a report: no write to the tenant, no write to the repo.",
      why: "Mihai asked for changed \u2192 export \u2192 import. Mocked against this and he chose this: Import writes to a tenant, baselineData.js is a source file, and an export carries none of num/version/tag nor any of the judgement. Separately, Baseline.compare judged on the version string in the policy name and never on content \u2014 a policy edited without a version bump read as ok.",
      test: [
        "25467: on the baseline tenant open 🧱 Update the catalog — each card ends in ONE row: the tick, or, a text box filling the rest of the width with its whole hint visible, then Hold. Click into the box: its focus ring does not touch the label. Narrow the window to phone width: the row wraps, nothing runs off the right of a card, long group names break inside it. Type a reason and press Hold — it still holds.",
        "25453: on a customer tenant, add your own exclusion group to a baseline policy at the baseline's version: it stays Up to date with NO tag; change its grant control: still Up to date, tagged differs · grant controls.",
        "25452: on a customer tenant (not CloudFellows.dev) Up to date counts every policy at the baseline's number and version, whatever its definition; a differing one carries the definition differs tag and the summary says how many; on the baseline tenant the 25449 behaviour stands.",
        "25449: the chip's number equals newer + edited in place + renamed in the panel, exactly; a policy whose only difference is a (NEW) prefix or a capital in the name is Up to date, not renamed; a real rename shows both names on its card.",
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
      builds: [25433, 25458, 25459, 25460],
      risk: "medium",
      what: "25460: EFFECT, one table mapping a check id to denies or misses, with EFFECT_TEXT for the wording; a badge on the ml-head (ml-eff, its own palette so it never reads as a second severity) and a line at the top of ml-detail (ml-effect). Eight denies, three misses, and dc-unsupported-control and sp-exclusion-incomplete deliberately UNCLASSIFIED — the first ends in decide deliberately, the second covers identities you meant to exclude, which is neither. Tests assert the classification against each check remediation so the badge cannot drift from the advice. 25459: the guest auth-strength verdict SPLITS IN TWO by what the strength actually asks. isMfaEquivalent reads allowedCombinations (a password with a second factor, a federated combination, or a Temporary Access Pass — the MFA-strength rows, under no other built-in); a strength that matches is no stronger than Require multifactor authentication by Microsoft own table, so the new check guest-auth-strength-swap-for-mfa (severity low) says to SWAP the control on that policy, with an ordinary in-place fix, and guest-auth-strength-not-universal returns null for it and keeps the companion for the stricter strengths. Unread strengths: the swap check stays silent, the conservative one stands. 25458: the guest-auth-strength check gets a two-part remediation (remediationParts, rendered as a dl: EXCLUDE nothing and why, CREATE one policy and its exact shape, WHY TWO) and a COMPANION hook beside fix. A fix mutates the shared per-policy draft; a companion builds a SECOND policy from the raw one and leaves the original alone — sharing the draft would have let this check strip an authentication strength another fix had just preserved. The companion copies the scope, sets grantControls to Require multifactor authentication alone, drops the strength and the session controls, state Off, and names itself at nextFreeNumber in the original hundred rather than bumpVersion (a bumped version is a supersession to Housekeeping and a merge candidate to Duplicates). companionName falls back to words for a name off the convention and never carries a (NEW)/(UP) staging prefix. renderFixes marks it companion and counts how many go BESIDE theirs. \ud83d\udcd8 MS Learn checks gains six checks and a matrix for guests and external users. The checks: an authentication strength whose every combination needs a home-tenant-only method (FIDO2 / passkey, Windows Hello, CBA, Authenticator phone sign-in, OATH hardware); a strength that does not reach email OTP, SAML/WS-Fed, Google or MSA externals at all; approved client app / app protection / password change with any external type in scope; compliant or hybrid device without inbound trust; a user-risk policy that can never be remediated for a guest; and the five session controls unsupported for B2B direct connect. The matrix (MSLearn.guestMatrix) crosses the external types the policies reach with the controls they demand, four verdicts, worst-wins per cell, a cell click opening those policies in Policies. 30 checks, up from 24.",
      why: "Mihai asked for it, and picked the matrix from a mockup of two presentations. Three of the six checks already existed but only fired for service provider (CSP) admins, and only in a tenant with a partner configured \u2014 the same policy breaking an ordinary B2B guest was never reported. Everything here was read off the two Microsoft tables for external users during this build, not recalled.",
      test: [
        "25460: in Findings, a policy that blocks guests with an unsatisfiable control shows a red Blocks them badge and a line saying they are denied access; the auth-strength gap findings show an amber Misses them badge and a line saying they are neither blocked nor challenged. The severity badge beside it keeps its own colours and is not confused with it.",
        "25460: the two unclassified findings (Control unsupported for B2B direct connect, External-user exclusion leaves service provider admins in scope) show NO effect badge at all.",
        "25460: read a tenant where both kinds fire and check the advice matches the badge — every Blocks them finding opens with an exclusion, neither Misses them one does.",
        "25459: a policy on the built-in Multifactor authentication strength with guests in scope raises This strength is Require MFA already (low), NOT the add-a-policy finding, and its Fix is an in-place swap — one policy out, version bumped, grantControls builtInControls [mfa] with the strength gone.",
        "25459: the same policy on the Phishing-resistant MFA strength raises the OTHER finding instead, with the companion; never both at once.",
        "25459: read the tenant with the strengths read (the usual path) and again with them unavailable — with them unread the swap finding is absent and nothing claims a strength is equivalent to anything.",
        "25458: a tenant with a policy that requires an authentication strength and reaches guests — the finding reads EXCLUDE: Nothing / CREATE: one policy / WHY TWO, as three labelled answers rather than a paragraph, and the button says Fix — build the companion policy.",
        "25458: press it → the Fixes tab shows a card tagged companion, named at the next free CA number in the original's range (CA400 taken plus CA401 taken gives CA402), reading beside <original> · the original is not changed. Download the JSON: grantControls is builtInControls [mfa] with no authenticationStrength, sessionControls null, state disabled, and conditions.users identical to the original including its exclusions.",
        "25458: the original policy in the tenant is untouched — re-run the checks and it still carries its authentication strength; the finding still fires, because it is about the gap the companion fills, not about a defect in the original.",
        "25458: a policy whose name is off the CAnnn convention gets <name> — plain MFA for non-Entra externals instead of a forced number; a (UP)-prefixed original does not carry the prefix into the companion.",
        "25458: node --test tools/mslearn-guests.test.cjs — 23 tests, five of them the companion; the whole suite; the plain-text check.",
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
      builds: [25406, 25408, 25447, 25451, 25466, 25474], risk: "medium",
      what: "25466: markInspectedRow() in js/workspace.js marks the Policies list row whose policy is open in the inspector (tr.is-inspected + aria-current), re-applied from the inspected id on every redraw because refreshViews rewrites #ptable and only then reaches renderInspector — a class set on the click would be wiped by the next tick or filter. css/workspace.css: accent bar via inset box-shadow (no layout shift), tint, accent name. 25451: the tool head folds (js/tool-layout.js foldable, per-screen localStorage enca-head-fold:<screen>). Shared resizable list/detail presentation with wide and mobile detail modes; since 25408 the list and the detail panel are each their own scroll container, pinned at --sticky-tools (header + tool tabs + the screen's tab strip and toolbar, measured by syncStickyTops and re-measured by its ResizeObserver), capped at 100dvh MINUS the footer (--ld-foot, measured by the same function) with overscroll-behavior:contain, and main's bottom padding dropped above 900px on a screen that ends in a pane — both because a sticky box cannot hold its offset past the bottom of its own box, so any page scroll left after the panes pin drags them up under the toolbar (109px of the policy list was behind it before this); the panel is scrolled back to its top on a change of selection but not on a change of section; #listView and #workspaceInspector get the same treatment, restoring the sticky inspector 25406 had made static; below 900px both revert to one column and one scrollbar; policy settings tabs preserve native full-detail actions. Exclusions gets an entity view; User/Group references and sweep groups keep completeness evidence outside the detail panel. Flat local SVG icons replace leading interface markers without changing stored or exported data.",
      why: "A consistent reading layout reduces repeated expand/collapse actions. Medium risk because existing delegated actions now live inside detail panels across several tools. No Graph requests, permissions or write confirmations are added by the presentation layer.",
      test: [
        "25474: 👥 CA groups at 1440 wide, tick a group, open Compare selected: the sheet's title reads ③ Members / Compare in full and the sheet starts right of the side rail, in both Half and Full. At phone width the sheet ends above the bottom navigation bar.",
        "25466: 🗂 Policies in list view → pick a policy: its row gains an accent bar and tint. Tick any checkbox, change the state chip, type in the search — the row stays marked. Pick another: the mark moves (never two). Back to results: no row is marked. Light and dark theme both legible.",
        "25451: on any tool the ▾ at the end of the head's title folds the description away (title, chips and the meta block stay, the toolbar moves up); reload → still folded; ▸ unfolds; another tool is unaffected.",
        "25447: page at the top, pointer over the policy pane, wheel down: the pane scrolls to its end, then the page scrolls until the pane pins, and the end of the policy is on screen — no dead stop.",
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
