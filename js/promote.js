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
      n: 315,
      title: "PIM framework 3.0 — job groups, direct groups, Exchange RBAC access groups (T48 0.7.0, T51 0.3.0, R79)",
      tools: ["PIM baseline", "Deploy"],
      builds: [32436, 32437, 32438],
      risk: "high",
      what: "Catalog 3.0 in js/pimBaselineData.js: every M365 group has path job or direct; GroupJITTier1 (4 h, MFA and justification; Critical activation alerts in small, a ticket in large); SecOps-Direct, Ops-Direct, AppOps-Direct, Collab-Direct; Exchange, SharePoint, Conditional Access, Security and Compliance roles on direct groups; PIM-SG-EXO-* access groups; regional Helpdesk and Ops job groups. js/pimbaseline.js: isJob, jobOverrides (every job-held role expects Allow permanent active), compare by path, regions active at the unit, export Active and permanent. js/pimdeploy.js: active requests for job groups after their role rules, a finding per existing job group about active members, an Exchange RBAC section. Demo tenant on the 3.0 shape. Both Word documents reviewed for 3.0 and the contract refreshed at 32436.",
      why: "Mihai, 4-5 Oct: one activation should give the whole job; Exchange and SharePoint as Microsoft suggests; 4 hours; Exchange RBAC now. Risk is high because Deploy now writes permanent active assignments to groups: a job group that still has ACTIVE members gives them every role of the job standing. The baseline tenant cloudfellows.dev was migrated with tools/pim Invoke-PimBaselineSetup.ps1 before this build.",
      test: [
        "Demo (02 PIM-buddy, 🧬 PIM baseline, multi): PIM-SG-M365-Ops reads eligible · job and active 16-ish of its roles, with still eligible (2.x): Teams Administrator in red; Teams Administrator row has the finding PIM-SG-M365-Ops is still ELIGIBLE for it; Ops-Direct reads active · per role and Match; PIM-SG-EXO-Recipients reads Exchange role group Recipient Management · made in Exchange.",
        "cloudfellows.dev (migrated): T48 small, large and multi — no row says not held through a job group or still eligible (2.x); Intune Administrator has no permanent active outside the framework finding although PIM-SG-M365-Ops holds it permanently.",
        "cloudfellows.dev, T51 Deploy small, Preview only: no op of the form act: on Exchange, SharePoint, Global, Privileged, Conditional Access, Security Administrator or Compliance; the findings list PIM-SG-M365-Ops: if it has ACTIVE members; Exchange RBAC groups section shows the four groups and the By hand line names their role groups.",
        "A test tenant without 3.0 (2.2 shape): T51 Preview lists act: requests for the job groups, each requiring its rpol: ops; apply with Privileged Role Administrator active; the job groups show Active · Permanent in Entra; the old eligibilities are reported, not removed.",
        "EasyPIM samples: job groups Active and permanent under Assignments.EntraRoles; people Eligible in job groups, Active in direct groups; node tools/pim/generate.cjs leaves no diff.",
        "node --test tools/*.test.cjs WITH pwsh on PATH (as the GitHub runner has) — all pass, pimscripts included: 32436 failed CI because the PowerShell suite only runs where pwsh exists; 32437 makes New-PimBaseline.ps1 and New-PimRegions.ps1 plan job groups ACTIVE (FakeGraph learned roleAssignmentScheduleRequests).",
        "node --test tools/*.test.cjs — all pass, pimdocs included (contract snapshot 32436; both Word documents name it and describe the job and direct paths)."
      ]
    },
    {
      n: 314,
      title: "Administrative units — T27 covers regular units too (inventory, findings, move into a restricted unit)",
      tools: ["Administrative units"],
      builds: [32435],
      risk: "medium",
      what: "T27 is renamed Administrative units (number kept) and gains an inventory of every unit, restricted and regular: js/auinv.js (pure) models kind, membership type and rule, processing state, members, and roles at each unit's scope, active and eligible (PIM schedule instances; fallback to scopedRoleMembers, active only, said in the panel), and judges: ca-group-writable (high with a scoped Groups or User Administrator, medium otherwise; not for role-assignable groups or groups also in a restricted unit), holder-direct-standing (CA lens), holder-not-pim-group (PIM lens), overlap (regular units with desks on both), rule-paused, scoped-empty, unused, vault-closed, region-differs and region-unknown (PIM lens with a regions file). js/app.js: ruInvRead / ruInvRoles / ruInvPanel / ruInvMove, filters All / Restricted / Regular / With findings, the inventory above the unit's members in its card, reset on sign-in, sign-out and demo, a run counter so a read from an old context publishes nothing. One write: Move to a restricted unit (POST members/$ref on the restricted unit, the group stays in the regular one). Rename in the tile, Help, palette, rail and every live cross-reference; the catalog and EasyPIM samples keep the old name until the next docs review. Demo data: four regular units and roles at unit scope. tools/auinv.test.cjs (20).",
      why: "Mihai, 5 Oct: T27 should also handle regular admin units. Mockup first (T27 Administrative units), decisions A-D as recommended: rename and keep the number, read-only for regular units apart from the move, the PIM lens adds the regions file, eligible roles counted. Medium: reads only, except one member add into a restricted unit, which narrows who can change the group's members and is undone by taking it out again.",
      test: [
        "Demo (?demo=1), 01 → 🛡 Administrative units: the tile, crumb and Help say Administrative units; chips All (6) / Restricted (1) / Regular (5); ▶ Check every unit reads, the chip With findings appears and is selected; the table lists Helpdesk NL first with High (CAB-SEC-U-CA212-Exclusion, Groups Administrator scoped), AU-EU-Users and AU-NA-Users with Overlaps, AU-NA-Users with Rule processing is Paused, AU-Legacy-HR Nothing uses this unit, AU-Site-Warehouse A role is scoped on an empty unit.",
        "Click Helpdesk NL in the table: its card opens and scrolls into view, roles at its scope (Hanna Helpdesk, active · permanent; SG-Helpdesk-NL eligible) and the findings sit above the members; Move to a restricted unit → the confirmation names the target unit, what changes and how to put it back; OK → the toast says it is in the unit (simulated) and the High finding is gone.",
        "Export MD: the document starts with Inventory — every unit, the table and the findings, then the per-unit sections; a regular unit's section reads Members, a restricted one Protected members.",
        "Real tenant (cloudfellows.dev), signed in with Global Reader: ▶ Check every unit asks for AdministrativeUnit.Read.All and RoleManagement.Read.Directory once; roles at unit scope show eligible ones (the AU-RM-Executives desk) with active + eligible in the tile; a unit with hidden membership reads not read with the Member.Read.Hidden reason, never judged on members.",
        "A tenant without Entra ID P2 (or with RoleManagement.Read.Directory refused): the tile says active only and the note names why; the scoped role members still appear.",
        "Live move, on a test group only: put a test group excluded by a report-only policy into a regular unit with Groups Administrator scoped; the inventory reports it High; Move to a restricted unit → it lands in the persona vault (or the picked unit); Check again → the finding is gone; as the scoped Groups Administrator of the regular unit, adding a member to that group is refused; take it out of the restricted unit again from its card (✕) with Privileged Role Administrator.",
        "02 PIM-buddy (?demo=1&ws=pim): the PIM lens panel comes first, then the inventory; a holder that is not a PIM-SG group (SG-Helpdesk-NL, Hanna Helpdesk) is a finding; load the regions file in 🧬 PIM baseline → 🗺 Regions, then Check again: a regional unit that differs is reported and the units the file builds but the tenant lacks are listed under the tiles.",
        "Switch tenant or demo while the inventory is reading: nothing from the old read appears afterwards; ■ Stop ends the read with stopped, nothing judged.",
        "node --test tools/*.test.cjs — all pass; node tools/check-plain-text.js clean."
      ]
    },
    {
      n: 313,
      title: "Defender XDR access groups — the Entra side of the CloudFellows PIM framework (2.2)",
      tools: ["PIM baseline", "Deploy"],
      builds: [32434],
      risk: "medium",
      what: "js/pimBaselineData.js is release 2.2: five groups of scope xdr — PIM-SG-XDR-Admin, -Operator-T3, -Operator-T2, -Operator-T1, -Reader — with eligible members (GroupJIT; Admin under the new template GroupJITTier0: PT2H, justification, context c1, approval by PIM-SG-Approvers, the Tier 0 rota and a ticket in the large profile), an xdr field naming the portal role and scope, the naming pattern (M365|AZ|INT|XDR), the small profile with three of them (T1 and T2 merged into T3), large with five, multi central. js/pimbaseline.js: the group row shows the portal role, membership reads eligible · JIT for every GroupJIT* template, Carries reads Defender XDR · assigned in the portal, the EasyPIM samples carry the groups and a portal note. js/pimdeploy.js: section xdr (the groups and their membership policies, on by default), By hand lines for the portal roles, assignments and unified RBAC activation, members eligible. Help for T48, T51 and T53; tools/pim regenerated; the documentation contract refreshed after both Word documents were reviewed (baseline v1.2, handover v1.3).",
      why: "Mihai, 2 Oct: the XDR PIM redesign stays excluded for now, but the XDR setup of the M365 RBAC Baseline V2.0 (the v1.3 lineage, version 1.4 added the XDR groups) comes into PIM-buddy — the Entra side only, the XDR side is done separately. Mockup first (Defender XDR Access Groups), decisions taken on the page: the document's tier names, eight-hour shifts instead of the document's ten, c1 + approval on Admin, three groups in the small profile. Medium: a new group family and a new membership template reach Deploy's write path; nothing is removed and the Defender portal is never touched.",
      test: [
        "Demo (?demo=1), Workspace 02 → 🧬 PIM baseline, profile Large · one region: the PIM groups table lists PIM-SG-XDR-Admin, -Operator-T3, -T2, -T1 and -Reader with persona, the portal role (Defender XDR … · scope All), membership eligible · JIT, Carries = Defender XDR · assigned in the portal; Small business lists Admin, Operator-T3 and Reader only; Export MD carries the same rows.",
        "cloudfellows.dev, read: the five rows read Missing (or Match once the groups exist); 🚀 Import ticked → opens Deploy with the section Defender XDR groups ticked and counted (5 create, 5 later) and the By hand list naming the five portal roles and assignments.",
        "cloudfellows.dev, apply with Privileged Role Administrator active: Preview shows the five group creates in the groups pass; after the typed domain the run makes them role-assignable and private; Verify reads them present; a second Preview plans the five membership policies (GroupJIT ×4, GroupJITTier0 on Admin: PT2H, justification, context c1, approval by PIM-SG-Approvers-Tier0 with a ticket) once PIM for Groups knows the groups.",
        "T48 after the apply: every PIM-SG-XDR row reads Match on presence, role-assignable and membership policy; put an Entra role on PIM-SG-XDR-Reader by hand → the row reads Differs with also holds; remove it.",
        "The Defender side, by hand: Permissions → Roles → the five roles with the document's permission sets and one assignment each at scope All naming its PIM-SG-XDR group, unified RBAC activated; an eligible member activates PIM-SG-XDR-Operator-T1 in PIM and, minutes later, sees the portal with the T1 permissions and nothing more.",
        "📄 EasyPIM samples: each profile's sample lists the XDR groups under GroupRoles (GroupJITTier0 among the PolicyTemplates where Admin is in) and as eligible Assignments.Groups, with the portal note; tools/pim/samples match node tools/pim/generate.cjs.",
        "node --test tools/*.test.cjs — all pass, pimdocs included (the contract snapshot is build 32434; both Word documents name it)."
      ]
    },
    {
      n: 312,
      title: "CI: the PimBuddy Word-document gate asks for a review on catalog changes, not on every build",
      tools: ["PIM baseline"],
      builds: [32433],
      risk: "low",
      what: "tools/pimdocs.test.cjs: the reviewed build in docs/handovers/pimbuddy-documentation-contract.json must be at most the application build (was: equal to it), and each Word document must name that reviewed build (was: the current build). Checksums and the catalog-contract test are unchanged; the catalog test is what forces a docs review. docs/handovers/README.md says so.",
      why: "Mihai, 30 Sep: the docker image workflow failed on beta 32432 (checks failed, publish skipped) because the gate from 32431 compared the reviewed build to the app build with strictEqual, so every build bump failed CI until both Word files were re-stamped. Chose option 2 (loosen) over re-reviewing on every build.",
      test: [
        "Local: node --test tools/*.test.cjs — all pass, including pimdocs (3 of 3), with version.js at 32433 and the contract at 32431.",
        "Negative: set build in the contract JSON to 99999 → the reviewed-build test fails; change one catalog group description in js/pimBaselineData.js → the catalog-contract test fails. Revert both.",
        "GitHub Actions: after the push to origin beta:beta, the docker image run shows checks green and publish run; ghcr.io/nurejev/enca:beta is updated."
      ]
    },
    {
      n: 311,
      title: "🌍 Fill from regions — the CAD-SEC-U-DG deploy groups filled from the region and country member groups (T12 5.16.0, R76)",
      tools: ["Conditional Access groups", "Help"],
      builds: [32432],
      risk: "high",
      what: "js/dgfill.js (new, pure): the region list (Euro, North America / Mexico, Asia Pacific, Italy, BAMSCA; Belgium PILOT; -PL added for Poles not in Warsaw/Skarbimierz; SK NE KZ BY SZ unticked), country groups found by their usageLocation rule, Unlicensed ticked, DISABELD/TEST ignored. Rules 0a second account with main → ADM only, 0b without → SA only, 0c Unlicensed only → SA only, 1 guest → GUESTUSERS, 2 extensionAttribute10 starts with External → EXT, 3 else → INT, 4 GLO, 5 main of a second account → DevOps. Pairing on the part before the @; guests (#EXT# in the onmicrosoft.com domain) are never second accounts. Add + fix removes only users read from ticked sources, never from DevOps, never nested members; adds before removals; undoOps from the run record. app.js: cgDgFill button (hidden in Workspace 02), dgModal three steps, reads, $batch writes of 20, RunLedger, backup, typed tenant domain, read-back, report, Undo. index.html: button, modal, Help bullet, roadmap R76. tools/dgfill.test.cjs 19 tests.",
      why: "Mihai, 30 Sep, from the mockup: the Tuno waves members deployment for the deployment groups — read the member groups per region and country, get the users, sort them into EXT / INT / GUESTUSERS / GLO / DevOps; later: second accounts to ADM (SA without a main account), users without Intune to SA only, fix also. High: it writes group memberships the Conditional Access policies act on, in bulk (SA alone grows by about 11,000 at Perfetti).",
      test: [
        "Local: node --test tools/dgfill.test.cjs — 19 pass. Demo (?demo=1): 👥 CA groups → 🌍 Fill from regions: Belgium carries PILOT; Read & preview shows 14 users, 20 adds, 3 removals; r.tan +SA −GLO −INT; paula +EXT −INT; svc-build → SA; anna.jansen@pvmict.com already in ADM; type contoso.nl, Apply, ledger 9 of 9; Undo this run reverses 23. Workspace 02: the button is hidden.",
        "Perfetti, read only: open the dialog. Expect 39 groups on the region list ticked plus -PL, SK/NE/KZ/BY/SZ unticked under Not in your region list, the 7 Unlicensed groups ticked, DISABELD and TEST under Ignored; counts beside each group match the CSV of 29 Sep (NL 1851, IT 1720).",
        "Perfetti: Pilot only (Belgium) → Read & preview. Guests and second accounts are unticked by the preset. Check the three Belgian users' rows, the extensionAttribute10 values line, and that no user outside Belgium appears. Export CSV.",
        "Perfetti: tick the region list with guests and second accounts → Read & preview. Check the SA tile (about 11,000 from the Unlicensed groups), the ADM and DevOps pairs against a known admin (x@pvmict.com ↔ x@perfettivanmelle.com), the unpaired list, and the policies named on each tile. Nothing is written until step 3.",
        "Perfetti pilot write: Belgium only, Add + fix. Apply with the backup on; the ledger lands; the sub line says read back: every change is there. Portal: the Belgian users are in the expected CAD-SEC-U-DG groups. Then ↩ Undo this run and check they are back where they were. Only after that, a region at a time."
      ]
    },
    {
      n: 310,
      title: "PimBuddy documentation alignment and deployment readiness corrections",
      tools: ["PIM baseline", "Deploy"],
      builds: [32431],
      what: "Catalog explanations and both Word references aligned; effective baseline settings unchanged. Unknown approver counts no longer pass; count users rather than arbitrary directory objects. A blocked plan cannot be armed or run. Documentation contract tests detect future catalog drift.",
      why: "The application and customer documentation must describe the same baseline and current deployment limits. Full automatic onboarding remains pending.",
      test: [
        "Local: run the PIM and Intune suites plus tools/pimdocs.test.cjs. Unknown, null, invalid and insufficient approver counts must not enable approval; two users may enable the rule.",
        "Demo browser: enter the tenant domain on an unblocked preview and observe Apply enable; add a blocker and observe Apply remain disabled. The shared runner must reject the same blocked plan without a send.",
        "Live tenant pending: deny the approver membership read, then preview. Approval must remain unchanged and the manual readiness item must remain visible. Repeat with two actual approver users and verify the intended approval rule.",
        "Review both Word files: all three model inventories and remaining manual dependencies match the current catalog. Do not describe this build as full automatic onboarding."
      ]
    },
    {
      n: 309,
      title: "👥 T12 is called PIM groups in Workspace 02; 02's header is the logo's green with a lemon rule instead of navy",
      tools: ["Conditional Access groups", "Help"],
      builds: [32430],
      risk: "low",
      what: "js/workspaces.js: a PIM_ROSTER entry may carry its own name (T12: PIM groups); toolsOf() uses it for the home card and library, nameIn(id, ws) for the tab label and its close button. The blurb loses its PIM groups prefix. js/cagroups.js: the head carries both names in ws-ca / ws-pim spans; css/workspaces.css shows the one of body data-ws. Help T12 lens bullet updated. css/workspaces.css: 02's --wc-brand #1e3358 (navy) → #1e4729 (the shield's middle green) plus an inset 3px lemon rule under the header; the switcher's 02 swatch the same. Chosen as option C from the mockup of four.",
      why: "Mihai, 28 Sep, with a screenshot of the 02 card: within the PIM workspace they should be called PIM groups. Mihai, same day: the navy on top needs to change, something with the logo colours, a couple of options → go for C. Low: labels and one colour.",
      test: [
        "Beta site, demo (?demo=1&ws=pim): the home card reads PIM groups, blurb Every role-assignable group..., T12 · PIM LENS. All tools (library) lists PIM groups; searching pim groups finds it.",
        "Open it: the tab reads PIM groups and the head reads 👥 PIM groups — Contoso.",
        "With the tool open, switch to 01 (⌘⇧1): the tab and head read Conditional Access groups; back to 02 (⌘⇧2): PIM groups again. The 01 home card still reads Conditional Access groups.",
        "On 02 the header is green #1e4729 with a lemon line along its bottom edge; on 01 it is the darker #12331f with no line. Same in light and dark theme. The chip menu swatch for 02 matches; the rail switch dot follows the header. Header height the same on both sides (no jump when switching)."
      ]
    },
    {
      n: 308,
      title: "PIM lenses on the carried-over tools — 🛡 PIM checks (T08), 👥 PIM groups (T12), 🕓 PIM changes (T16), 🚦 Activations & approvals (T17), 🔗 Who holds what (T19) — and ☁ Azure RBAC in 🎖 Roles & assignments (R75)",
      tools: ["Checks", "Conditional Access groups", "Changes", "Sign-in log", "User or Group analyzer", "Roles & assignments"],
      builds: [32428],
      risk: "low",
      what: "js/pimlens.js (new, pure): checks / renderChecks, groups / renderGroups, audit / renderAudit, activations / renderActivations, whois / renderWhois, azure / renderAzure. js/app.js: LENS map, pimLensPaint(id) called from show() — a folding .pim-lens-host inserted after the tool's readme only when Workspaces.current() is pim, hidden otherwise; plxRead for the audit (directoryAudits loggedByService eq 'PIM', AuditLog.Read.All), the activation requests (selfActivate, principal + roleDefinition expanded) and the shared reads; runPimAzure (ARM, management groups + subscriptions, atScope instances) and the ☁ tab in prrPaint. js/workspaces.js: the five carry-overs marked PIM lens (built) with PIM blurbs. js/demo.js: audit, azure, two more activations. tools/pimlens.test.cjs (3).",
      why: "Mihai, 28 Sep: continue the PIM roadmap — PIM lenses on the carry-over tools (T08, T12, T16, T17, T19); the Azure RBAC read. Low: reads only; in Workspace 01 nothing changes.",
      test: [
        "Beta site, demo (?demo=1&ws=pim) → 🛡 Checks: the PIM LENS · 🛡 PIM checks panel sits under the head; ▶ Read → 11 failing · 2 passing · 0 not read; the first rows are critical (Joey Bakker; no policy targets c1); Open → on a row opens that tool. Fold the panel, open another tool and come back: it stays folded.",
        "👥 CA groups: the PIM groups panel lists CAB-SEC-U-Admins-Legacy (not in the framework, User Administrator (active)); PIM-SG-M365-GlobalAdmin 2 active · 0 eligible once Roles & assignments was read. 🕓 Changes → ▶ Read: All (6), Role settings shows Update role setting in PIM. 🚦 Sign-in log → ▶ Read: 5 requests · 3 granted · 1 waiting for approval. 🔗 User or Group analyzer: type anna → adm-anna with Global Administrator through PIM-SG-M365-GlobalAdmin and the no-policy note.",
        "🎖 Roles & assignments → ☁ Azure RBAC → ▶ Read: 3 scopes · 3 eligible · 3 active · 2 findings (Joey Bakker Owner on Corp; PIM-SG-AZ-Corp-Contributor active); PIM-SG-AZ-Platform-Owner eligible for Owner on Platform.",
        "Switch to 01 (⌘⇧1) and open 🛡 Checks: no PIM panel; the tool is as before.",
        "A real tenant: the audit panel asks AuditLog.Read.All once; Azure RBAC asks the Azure consent once and lists scopes it could not read by name.",
        "Offline: node --test tools/pimlens.test.cjs passes 3.",
      ],
      files: ["js/pimlens.js", "js/app.js", "js/demo.js", "js/workspaces.js", "index.html", "js/version.js", "tools/pimlens.test.cjs"],
    },
    {
      n: 307,
      title: "🧱 Update the catalog from cloudfellows.dev — the PIM portal's values proposed where the catalog keeps them, and js/pimBaselineData.js written with exactly those values edited (R74)",
      tools: ["PIM baseline"],
      builds: [32427],
      risk: "low",
      what: "js/pimcatalog.js (new, pure): propose(PIM_BASELINE, compare result, profile) — SETTINGS → template keys (MAP), grouped per tier: template when every role read agrees (profiles.<p>.templates.<Tier> when the profile sets the key, else templates.<Tier>), roles[\"X\"].override otherwise; recipients/defaults and absent rules skipped; split tiers noted. applyRevision(text, changes, revised) edits the source text in place (block / valueEnd / setIn / locate; adds an absent key, an absent override, an absent profile tier). js/app.js: chip 🧱 Update the catalog (baseline tenant or demo), pmbPaintCatalog, pmbCatalogFile (same-origin fetch of the site's own catalog, no eval — CSP), revision JSON and note. tools/pimcatalog.test.cjs (3).",
      why: "Mihai, 28 Sep: continue the PIM roadmap — update the catalog from cloudfellows.dev (today by hand). Low: reads only; the output is a file a person commits.",
      test: [
        "Beta site, demo (?demo=1&ws=pim), profile Large · one region → 🧬 PIM baseline → ▶ Read → 🧱 Update the catalog: 71 rows, two notes (Tier0 ActivationRequirement and Approvers set 2 different ways); Exchange Administrator's row is roles[\"Exchange Administrator\"].override · ActivationDuration · 2 h → 24 h (demo values).",
        "⬇ js/pimBaselineData.js downloads pimBaselineData.js; git diff against the repo's file shows only the ticked values and the revised line; node -e loads it (new Function(src + ';return PIM_BASELINE')()).",
        "Untick all but one row: the file differs in exactly that value and revised.",
        "cloudfellows.dev (the baseline tenant, 🧱 chip visible; on any other real tenant the chip is absent): after the portal edits Mihai made by hand, the proposal lists them; commit the downloaded file on beta and T48 on cloudfellows.dev reads those roles as Match.",
        "Offline: node --test tools/pimcatalog.test.cjs passes 3 (override for one role with a 2-line diff; template and profile-template placement; absent keys added; recipients never proposed).",
      ],
      files: ["js/pimcatalog.js", "js/app.js", "index.html", "js/version.js", "tools/pimcatalog.test.cjs"],
    },
    {
      n: 306,
      title: "🧾 Designer (T50) — a customer's variant of the CloudFellows PIM framework (tiers, role → tier, mailbox, authentication context, approver names), validated, per tenant and as a file; T48 / T49 / T51 use it when it is in use (R73)",
      tools: ["Designer", "PIM baseline"],
      builds: [32426],
      risk: "medium",
      what: "js/pimdesigner.js (new, pure): blank / validate / apply / diff / set / reset / setRole, schema cloudfellows-pim-variant/1, value lists per field. js/app.js: pds* block (per-tenant localStorage enca.pimVariant:<tenant>, Use for this tenant, ⬇ Variant file, ⬆ Load, ✕ Discard; tabs Tiers / Role → tier / Mailbox & approvers / The variant), pmbCat() applies an in-use valid variant. js/pimbaseline.js: compare() carries catalog.variant, the read line names it. index.html screen-pimdesigner + tile (T50); TOOL_TABS, HISTORY_SCREENS, roster, flat icon. tools/pimdesigner.test.cjs (3).",
      why: "Mihai, 28 Sep: continue the PIM roadmap — T50 Designer, build a customer's variant of the framework. Medium: nothing is written by the Designer itself, but an in-use variant changes what 🚀 Deploy writes.",
      test: [
        "Beta site, demo (?demo=1&ws=pim) → 🧾 Designer: Tiers → Tier1 → Activation 24 h: the row turns amber with ↺ framework, the status says 1 change · not in use; Use for this tenant → ✓ In use; The variant tab lists Tier1 · Activation · 2 h → 24 h.",
        "🧬 PIM baseline → ▶ Read: the read line says with the customer's variant (1 change, 🧾 Designer); Exchange Administrator (24 h in the demo) no longer lists Activation duration as a difference.",
        "Tier0 → tick MFA under On activation: Entra refuses the pair error appears and Use for this tenant is disabled; while the error stands, T48 compares against the framework as it is.",
        "⬇ Variant file downloads JSON with schema cloudfellows-pim-variant/1 and only the changes; ✕ Discard; ⬆ Load that file: it comes back not in use.",
        "🚀 Deploy with the variant in use: Preview's role settings follow the variant (Tier1 roles PATCHed to 24 h).",
        "Offline: node --test tools/pimdesigner.test.cjs passes 3.",
      ],
      files: ["js/pimdesigner.js", "js/app.js", "js/pimbaseline.js", "index.html", "js/workspaces.js", "js/flat-icons.js", "js/version.js", "tools/pimdesigner.test.cjs"],
    },
    {
      n: 305,
      title: "🚀 Deploy (T51) — import the CloudFellows PIM framework from the browser: pick, WhatIf, typed domain, run ledger, verify, backup and ↩ Put back; T48 leads to it instead of the script files (R72)",
      tools: ["Deploy", "PIM baseline"],
      builds: [32425, 32429],
      risk: "high",
      what: "js/pimdeploy.js (new, pure): build() — one plan from PimBaseline.compare + regions + IntuneRbac in the scripts' order (approvers, PIM-SG groups, units, Intune scope groups, role policies rule by rule with before, tenant-scope group eligibilities, scoped eligibilities (restricted unit, regions), membership policies — existing PATCHed by policy id, new deferred —, Intune, deferred last), blocked/findings/manual; sections() with counts. js/app.js: pdp* block (openPimDeploy(fromT48), pick / preview / verify stepper, pdpReadAll: PIM + Intune + regional approvers by UPN and the approver groups' members, restore from a backup file of the same tenant), runPimBaseline keeps policyIds / groupPolicyIds / verifiedDomains; T48 toolbar: #pmbImport replaces ⬇ Delta config and ⬇ Regions file (hidden), ⬇ Baseline config → ⋯ EasyPIM file; head, samples pane, regions text, tile and Help without a .ps1 for customers. index.html screen-pimdeploy + tile (T51), TOOL_TABS, HISTORY_SCREENS, workspaces roster + rail + lead, flat icon, css pim-steps / pim-pick. tools/pimdeploy.test.cjs (6).",
      why: "Mihai, 28 Sep: \"The PIM tool onboarding or configuration should always be from the browser, so customers don't need to run a ps1 script — just select and import from the baseline in their tenant\", and \"PIM-buddy Import is a go\" on mockup v4. High: it writes groups, role policies, eligibilities, units and Intune RBAC in a customer tenant — every write behind a WhatIf and the typed domain, nothing removed, backup of every rule changed.",
      test: [
        "Beta site, demo (?demo=1&ws=pim), profile Large · one region → 🧬 PIM baseline → ▶ Read: the toolbar shows 🚀 Import 47 ticked → and ⋯ EasyPIM file; no ⬇ Delta config, no ⬇ Regions file. Click it: 🚀 Deploy opens on Pick with Only the 47 rows ticked in 🧬 PIM baseline checked; sections PIM-SG groups 10 create · Approver groups 1 create · Role settings 94 update · Group eligibilities 35 add · Membership policies 7 update · 10 later · Restricted unit 4 add (unticked) · Intune RBAC (not read) · Azure groups (unticked).",
        "🔎 Preview 149 operations (32429: the approval rules wait — PIM-SG-Approvers-Tier0 is made empty in this run, and Found, not changed says so per role; approval is switched on only with an existing approver group of two or more): operation 1 is create plain group PIM-SG-Approvers-Tier0, then the role-assignable groups; no operation removes anything; Impact, Recovery and Permissions are filled; ▶ Apply is disabled until contoso.nl is typed. Apply: the ledger ends 149 of 149, 10 partly done (later), 0 failed; ⬇ Backup (n rules as they were) appears; Verify shows the run's counts and the demo note.",
        "32429, a plan runs once: after the run the ② Preview step is disabled and ▶ Apply cannot be armed again; typing in the domain box while the ledger runs does nothing. Put back with a backup of another tenant (or without a tenant id) is refused on a real tenant.",
        "32429, a real tenant signed in as an MSP / guest admin: the domain to type is the customer's default verified domain, not the admin's home domain.",
        "↩ Put back… with that backup file: Preview lists one put back … per rule; a JSON of another shape is refused (not a backup file this tool wrote); a backup of another tenant is refused on a real tenant.",
        "Profile Large · multi-region with the demo regions loaded (🗺 Regions → Use the example): Regions section counts units, groups, scoped eligibilities and Intune scope groups; the Preview has create dynamic unit AU-EU-DE-Devices and a finding that AU-EU-NL-Devices differs (not changed); approvers from the file are added to PIM-SG-EU-*-Approvers when found (anna, mihai, joey in the demo).",
        "cloudfellows.dev (Privileged Role Administrator active, Intune Administrator): ▶ Read the tenant asks the read permissions; Preview shows only what differs; Apply asks the write permissions once (Group.ReadWrite.All, RoleManagement.ReadWrite.Directory, RoleManagementPolicy.ReadWrite.Directory, RoleManagementPolicy.ReadWrite.AzureADGroup, AdministrativeUnit.ReadWrite.All, DeviceManagementRBAC.ReadWrite.All as ticked). A new group's first eligibility may show not replicated yet — trying again in 5 s and then land. Verify: 🧬 roles match where they were ticked; new groups' membership policies are later until they have a member.",
        "A customer-shaped test tenant (not cloudfellows.dev): the whole Small business profile imported from nothing ends with 0 failed; nothing in the tenant was removed (compare the role assignments list before and after); the break-glass accounts are untouched.",
        "Offline: node --test tools/pimdeploy.test.cjs passes 6 (order, placeholders, nothing removed, existing not asked again, conflicts block, ticked-only, regions, restricted unit off by default, end-to-end run without a placeholder reaching Graph).",
      ],
      files: ["js/pimdeploy.js", "js/app.js", "index.html", "css/app.css", "js/workspaces.js", "js/flat-icons.js", "js/version.js", "tools/pimdeploy.test.cjs"],
    },
    {
      n: 304,
      title: "🎖 Roles & assignments (T49) — who holds which Entra role, direct and through groups, eligible / active / activated, scoped, ending soon, with framework tiers and findings (R71)",
      tools: ["Roles & assignments"],
      builds: [32424],
      risk: "low",
      what: "js/pimroles.js (new, pure): model() over roleEligibilityScheduleInstances + roleAssignmentScheduleInstances (principal expanded), group principals opened from PIM for Groups instances (active + eligible members; /members fallback), tier by template id from the profile, findings per role, last activation; render (tabs roles / people / scoped / expiring; role rows as details that stay open across repaints), toCsv, toMd. js/app.js: prr* block (openPimRoles, runPimRoles with PRR_READ, batch per group a/e/m, getByIds for eligible members' names, selfActivate requests), screen-pimroles in index.html with its tile (T49), TOOL_TABS, HISTORY_SCREENS, workspaces roster + rail, flat icon. css/app.css: pim-* rules. js/demo.js: groupMembers, activations. tools/pimroles.test.cjs (4).",
      why: "Mihai, 28 Sep: continue the PIM roadmap — T49 Roles & assignments: who holds what, direct and through groups, eligible, active, activated, scoped, expiring. Low: reads only.",
      test: [
        "Beta site, demo (?demo=1&ws=pim) → 🎖 Roles & assignments (tile or rail Roles) → ▶ Read who holds what: tiles 29 roles held · 42 eligible · 6 permanent active · 1 activated now · 6 scoped · 0 ending within 30 days · 16 people.",
        "Open Global Administrator: Tier0, 3 eligible · 3 active (3 permanent, 2 break-glass), last activated 2026-09-27 by adm-anna, ⚠ 2 — 1 permanent active outside the framework: Joey Bakker; 2 people eligible directly (Anna de Vries, Joey Bakker); rows adm-anna and adm-mihai through PIM-SG-M365-GlobalAdmin (active member). Click Findings (5): Global Administrator stays open.",
        "Helpdesk Administrator: adm-desk-new eligible through PIM-SG-M365-Helpdesk (eligible member). 👤 Who holds what: adm-anna with a Tier0 tag and Global Administrator + the Tier 0 roles; find anna narrows to her. 📍 Scoped (6) shows the EU-NL rows with AU-EU-NL-Users etc. by name.",
        "⬇ CSV downloads one line per assignment (header role,tier,principal,…); Export MD opens the per-role table.",
        "A real tenant (Global Reader or Privileged Role Administrator): the read asks the four read permissions once; a role-assignable group's members appear through it; if PIM for Groups is not readable the members still come from the group's /members (active only), and a group with neither says Members not read for … instead of counting nobody.",
        "Offline: node --test tools/pimroles.test.cjs passes 4.",
      ],
      files: ["js/pimroles.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "js/workspaces.js", "js/flat-icons.js", "js/version.js", "tools/pimroles.test.cjs"],
    },
    {
      n: 303,
      title: "📱 Intune RBAC (T53) — role assignments, scope tags and their automatic assignment, scope groups and INT-ROLE-Regional-Ops read and matched against the framework; 🗺 Regions' Intune rows get verdicts (R70)",
      tools: ["Intune RBAC", "PIM baseline"],
      builds: [32423, 32429],
      risk: "low",
      what: "js/intunerbac.js (new, pure): expected (profile.intune + region template per row; two roles = two assignments), model (beta roleDefinitions + custom roles by id, roleAssignments with $expand=roleDefinition, roleScopeTags + /assignments, resourceOperations), resolveActions (id or Resource/Action), compare (verdicts by name for Regions; other assignments judged on members), plan + bindBuiltIns for 🚀 Deploy, render, toMd. js/pimbaseline.js compareRegions reads tenant.intune.verdicts. js/app.js: openPimBaseline(asIntune), pmbPaintIntune, runIntuneRbac (DeviceManagementRBAC.Read.All), pmbRebuild computes pmbIntRes before the regions. index.html tile toolIntuneRbac (T53), js/workspaces.js roster + rail, js/flat-icons.js, js/demo.js pim.intune. tools/intunerbac.test.cjs (6).",
      why: "Mihai, 28 Sep: continue the PIM roadmap — T53 Intune RBAC read, turning the regions' Not read rows into verdicts. Low: reads only (the plan it carries is used by 🚀 Deploy, a later item).",
      test: [
        "Beta site, demo (?demo=1&ws=pim), profile Large · multi-region → 📱 Intune RBAC (tile, rail Intune or the 📱 chip in 🧬 PIM baseline) → ▶ Read Intune RBAC: tiles 9 assignments expected · 3 match · 2 differ · 7 missing · 1 other assignment, 1 held standing; INT-ROLE-Regional-Ops ≠ Differs, lacks 3 of 31 (RotateLocalAdminPassword, LocateDevice, TermsAndConditions_Read); INT-RBAC-PolicyProfile-Central Policy and Profile Manager ✓, Application Manager ∅; INT-RBAC-HelpDesk-Central ≠ (PIM-SG-INT-HelpDesk does not exist); INT-TAG-EU-NL ✓, INT-TAG-EU-DE ∅; Legacy workplace team listed with held through CAB-SEC-U-Admins-Legacy.",
        "🗺 Regions after that read: EU-NL's INT-TAG-EU-NL and INT-RBAC-HelpDesk-EU-NL ✓ Match, INT-RBAC-Ops-EU-NL ∅ Missing — no Intune row says Not read. Before the Intune read (sign out and back into the demo) they say Not read.",
        "Export MD in the Intune pane opens the Intune report; the tool tab reads 📱 Intune RBAC, and 🧬 PIM baseline's tab opens the baseline, not the Intune pane.",
        "cloudfellows.dev (Intune licensed, Intune Administrator or Global Reader): ▶ Read Intune RBAC asks DeviceManagementRBAC.Read.All once; INT-TAG-EU-NL shows its target (INT-SG-DEV-EU-NL-All after the 32419 run); INT-ROLE-Regional-Ops shows the permissions it lacks by the tenant's own ids, and none says not known to this tenant (the 32421 labels resolve); the central INT-RBAC-* rows say Missing (they were never scripted).",
        "Offline: node --test tools/intunerbac.test.cjs passes 6.",
      ],
      files: ["js/intunerbac.js", "js/pimbaseline.js", "js/app.js", "js/demo.js", "index.html", "js/workspaces.js", "js/flat-icons.js", "js/version.js", "tools/intunerbac.test.cjs"],
    },
    {
      n: 302,
      title: "🛡 Restricted AUs — the PIM lens in Workspace 02 (AU-RM-Executives, the scoped desk, no PIM object in a restricted unit) and the shared WhatIf/apply runner for PIM writes (R69)",
      tools: ["Restricted AUs"],
      builds: [32422, 32424, 32429],
      risk: "medium",
      what: "js/pimplan.js (new, pure): the browser port of tools/pim/PimCommon.psm1 — plans of ordered ops with produces/{{placeholders}}, rule-by-rule PATCH with before kept (ruleChanges), eligibility requests capped by the role's own maximum and started now, replication retry 5/10/15/30/30/30 s on a 404 that names a just-created object (or SubjectNotFound), deferred membership policies, skip-on-failed-dependency, backup and restorePlan (PIM policy rules only). js/pimrmau.js (new, pure): check/plan/render of the lens. js/app.js: pimSend / pimGroupPolicyStep / pimPlanPanel / pimPlanWire / pimApply (typed domain, one preConsent of the plan's scopes, RunLedger, report, ⬇ backup) and the lens block (prl*), renderRmau swaps the CA panels for prlPanel() when Workspaces.current() is pim. js/demo.js: rmauMembers (two executives, a device, PIM-SG-M365-Tier0 and adm-joey in AU-RM-Executives). tools/pimplan.test.cjs (11).",
      why: "Mihai, 28 Sep: continue the whole PIM roadmap in the mockup's order, T27 first; and PIM onboarding/configuration always from the browser, never a .ps1. Medium: the lens writes (create a restricted unit — immutable flag —, scoped eligibilities, take a member out of a restricted unit), each behind a preview and a typed domain; nothing is ticked for a removal.",
      test: [
        "Beta site, demo (?demo=1&ws=pim), 🧬 PIM baseline profile Large · one region → 🛡 Restricted AUs: the head starts with PIM lens (Workspace 02); the ONE RESTRICTED AU PER PERSONA panel is gone; ▶ Read for the PIM lens shows tiles 1 / 1 · 0 scoped · 2 PIM objects · 0 regional · 1 restricted; AU-RM-Executives ✓ Present, 3 people · 1 devices · 1 groups; the three ServiceDesk-VIP rows … Blocked (the group does not exist yet), User Administrator → PIM-SG-M365-Identity Blocked.",
        "⚠ PIM objects inside (2): PIM-SG-M365-Tier0 (a PIM-SG group) and adm-joey (an adm- account), both unticked. Tick PIM-SG-M365-Tier0 → 🔎 Preview 1 change: one operation take PIM-SG-M365-Tier0 out of AU-RM-Executives (removes), Impact names only the removal, Permissions AdministrativeUnit.ReadWrite.All. ▶ Apply stays disabled until contoso.nl is typed; then the ledger shows 1 done (simulated) and 📄 Report lists it.",
        "Switch the lens profile to Small business: 🔒 Restricted units says No restricted unit in profile Small business; the other two tabs still judge. Switch to 01 Conditional Access and open 🛡 Restricted AUs: the CA panels are back, no PIM lens.",
        "cloudfellows.dev (a real tenant, Privileged Role Administrator active): profile Large · one region, AU-RM-Executives missing → the unit ticked; after 🚀 Deploy made PIM-SG-M365-ServiceDesk-VIP and -Identity, the four scoped rows ticked. Preview: 5 operations, Cannot be undone names the restricted flag. Apply: the unit is created restricted (Entra → Administrative units shows Restricted management: Yes), the four eligibilities appear under each role's Eligible assignments with scope AU-RM-Executives, and a retry note may show on the first eligibility (not replicated yet). ⟳ Read again: 1 / 1, 4 scoped in place.",
        "Offline: node --test tools/pimplan.test.cjs passes 11 (rule changes idempotent; approver placeholder; recipient rewrite; duration cap; placeholder + 404 retry 5 s, 10 s; skip on a failed create; no retry on an old object's 404; deferred + Stop; restore refuses a non-rule URL; the lens' checks and plan).",
      ],
      files: ["js/pimplan.js", "js/pimrmau.js", "js/app.js", "js/demo.js", "index.html", "js/workspaces.js", "tools/pimplan.test.cjs"],
    },
    {
      n: 301,
      title: "🧬 PIM baseline 0.2–0.3 — profiles (Small business, Large · one region, Large · multi-region), 🗺 Regions from the customer's regions.csv, 📄 EasyPIM samples, framework 2.1 after the reliability review; tools/pim plans and applies through Connect-Customer (R68)",
      tools: ["PIM baseline"],
      builds: [32413, 32414, 32415, 32416, 32417, 32418, 32419, 32420, 32421, 32424, 32425],
      risk: "medium",
      what: "32421 (0.3.5, the role template's actions): js/pimBaselineData.js intuneRoles INT-ROLE-Regional-Ops: Microsoft.Intune_MobileApps_ViewReports removed (no such action), four entries written as Resource/Action (Remote tasks/Collect diagnostics, Enrollment programs/Read device, Enrollment programs/Sync device, Audit data/Read), 31 actions; tools/pim/pim-regions-template.json and regions.cloudfellows.dev.json regenerated; New-PimRegions.ps1 Resolve-IntuneTemplateActions (an id the tenant lists, or resourceName/actionName → the tenant's id; unresolved → the tenant's operations for that resource with ids), used for create and -FixIntuneRoles; FakeGraph without the five ids, with named operations; Help (Regions); Test-PimIntuneRole.inc.ps1 +2 tests, one rewritten. 32420 (0.3.4, the custom Intune role): New-PimRegions.ps1 reads each existing framework Intune role by id (GET deviceManagement/roleDefinitions/{id}) and collects actions from rolePermissions and permissions, resourceActions and actions (Get-IntuneRoleActions); lacking actions reported with the count, extra ones reported and kept; new -FixIntuneRoles plans introlefix:NAME, a PATCH with every current action plus the missing ones and the current notAllowed list, before = the old permissions (backup), blocked when the operation list does not know a missing action; FakeGraph role by id, PATCH, a permissions[].actions shape and a list without permissions; Help (Regions); tools/pim/tests/Test-PimIntuneRole.inc.ps1 (4 tests). 32419 (0.3.3, scope tag targets): New-PimRegions.ps1 sends the scope tag auto-assignment as groupAssignmentTarget with groupId (the service refuses scopeTagGroupAssignmentTarget with 400 NotSupported); targets read back in either shape are sent back as group targets, assignment filter kept; FakeGraph refuses anything but a direct group target on assign and reads string targets back as groupAssignmentTarget; Help (Regions) says so; tools/pim/tests/Test-PimScopeTags.inc.ps1 (2 tests). 32418 (0.3.2, wait for replication): PimCommon.psm1 Invoke-PimPlan retries an http or request operation after a 404 when PIM says SubjectNotFound or the operation names an object this run created ({{...}}), waiting 5, 10, 15, 30, 30, 30 s (Test-PimNotReplicatedYet); any other failure still stops the run; the outcome status says after N retries; Help (The scripts) says so; FakeGraph $FakeLag and a recording Start-Sleep; tools/pim/tests/Test-PimReplication.inc.ps1 (4 tests). 32417 (0.3.1, roles by template id): js/pimBaselineData.js gives each of the 38 roles its built-in templateId (Microsoft Learn, built-in roles) and formerNames for Microsoft Entra Joined Device Local Administrator; tools/pim/generate.cjs writes tools/pim/pim-roles.json; PimCommon.psm1 New-PimRoleIndex and Resolve-PimRole (template id among built-in definitions first, then display name; a custom role wearing the name is never used); New-PimBaseline.ps1 (eligibilities, role policies, the Global Administrator check, -WriteResolved renames to the tenant's names) and New-PimRegions.ps1 use it; PimBaseline.canonRoles in the in-browser read (templateId selected) with a compare finding; the EasyPIM samples note it; FakeGraph roles carry real template ids, -RenamedRoles and -CustomRoles; tools/pim/tests/Test-PimRoles.inc.ps1 (5 tests). 32416 (0.3.0, the reliability review fixed, framework 2.1): js/pimBaselineData.js release 2.1 — the activation model (persona groups: active members, template GroupMember; each group eligible for its roles; Intune access groups PIM-SG-INT-* with eligible members, template GroupJIT), protection (no PIM-SG group or adm- account in an RMAU; break-glass by explicit id), profiles.large (Identity, Workplace, Collab, Apps, ServiceDesk, ServiceDesk-VIP, Audit; ticketing Tier 0 and 1; PIM-SG-Approvers-Tier0; AU-RM-Executives by hand), region template with the INT access groups, field regexes and limits. js/pimbaseline.js rewritten: fromTemplate/fromRules with full recipients, default-recipient switch and ABSENT rules; compare() by object id at tenant scope, protectedIds, sources (unread never a match), conflicts (duplicate names, custom role with a built-in name), extra and scoped roles as findings; parseRegions never throws (rows, errors, warnings); region() refuses unsafe values; compareRegions by id, scope and processing state; toOrchestrator schema cloudfellows-pim-config/2.1 with explicit ProtectedUsers ids and Assignments.Groups; SAMPLE + toSample (commented JSONC per profile); defaultSelection/selectable. js/app.js: pmbReset on sign-in, demo and sign-out; ticks in sets outside the DOM; every PIM-SG group's membership policy read (RoleManagementPolicy.Read.AzureADGroup) with per-source read state; the 📄 EasyPIM samples chip and pane; downloads as real JSON with a SHA-256 and the report naming the file and the Find-PimDuplicates / New-PimBaseline / New-PimRegions commands. js/demo.js: membership policies per group, INT groups, a paused dynamic group, contoso.nl. tools/pim: PimCommon.psm1 (new: Connect-Customer.ps1 connection, Customers.json tenant check, permission check with the -AddGraphScopes line, one write gate, plan file + SHA-256, stale-plan stop, typed-domain confirmation, verified backup, outcome log, apply command printer); New-PimBaseline.ps1 and New-PimRegions.ps1 rebuilt on it; Find-PimDuplicates.ps1 (new); generate.cjs writes pim-baseline*.json, samples/easypim.{small,large,multi}.jsonc, the regions template and files; tests/FakeGraph.ps1 + Test-PimScripts.ps1 + three includes (24 tests, six of them the second review's reproductions); tools/pimscripts.test.cjs runs them when pwsh is present. index.html: tile, Help rewritten for 2.1; css/app.css samples pane. 32415: both scripts look groups up with standard (immediately consistent) queries; New-PimBaseline.ps1 step 1c lists duplicate PIM-SG names and -MergeDuplicates keeps the oldest, deletes the empty copies; New-PimRegions.ps1 refuses duplicates. 32414: the roles read no longer asks v1.0 for isPrivileged (beta-only; the first real-tenant read failed on it, the demo fakes the field). js/pimBaselineData.js: profiles.small / .multi (groups, merge, templates, roles, rmau, intune), groupsSmall (PIM-SG-AZ-Sub-Owner / -Sub-Contributor), regions (columns, defaults, example, codePattern, template: aus, groups, eligibilities, intune, review), intuneRoles (INT-ROLE-Regional-Ops with its resource actions). js/pimbaseline.js: profile() derives the catalog; parseCsv / parseRegions (quoted CSV or JSON, defaults, code rule, duplicates); region() fills the template; compareRegions() per region: units by rule, groups, scoped eligibilities by directoryScopeId, Intune unread, the centre's RMAU; renderRegions / regionsMd / toRegionsFile / regionsCommand; compare() lists regional persona groups apart from extra groups; toOrchestrator everyProfile. js/app.js: pmbProfile select (localStorage enca.pmbProfile), PMB_READ adds AdministrativeUnit.Read.All, the read adds directory/administrativeUnits and the PIM-SG / INT-SG groups, inst() carries directoryScopeId, the 🗺 Regions chip and pane (file input, paste box, example, template, clear; rows in localStorage enca.pmbRegions:<tenant>), ⬇ Regions file, Export MD on the regions pane, the baseline config carries every profile's groups on the baseline tenant. js/demo.js: two regions (EU-NL nearly complete, EU-DE half), AU-RM-Admins, the plain groups, scoped eligibilities, regionsCsv. index.html: toolbar select and button, tile, Help; css/app.css pmb-profile / upload / rtbl. tools/pim: New-PimRegions.ps1 (new), pim-regions-template.json, regions.csv, regions.cloudfellows.dev.json, pim-baseline.small.json, pim-baseline.multi.json, pim-baseline.json regenerated; New-PimBaseline.ps1 -SkipOrchestrator. tools/pimbaseline.test.cjs: three tests more.",
      why: "Mihai, 28 Sep, -FixIntuneRoles on cloudfellows.dev: the tenant's operation list does not know 5 of the missing actions (CollectDiagnostics, MobileApps_ViewReports, EnrollmentProgram_Read, EnrollmentProgram_SyncDevice, AuditData_Read), nothing written. Mihai, 28 Sep, the regions plan on cloudfellows.dev: Intune role INT-ROLE-Regional-Ops differs from the template, missing all 32 actions, extra none (the role was created empty by a run before 32416). Mihai, 28 Sep, the second New-PimRegions.ps1 apply on cloudfellows.dev: EU-NL membership policies, eligibilities, INT-SG groups and INT-TAG-EU-NL made, then tagassign:INT-TAG-EU-NL failed 400 NotSupported (Role Scope Tags only supports targeting to direct security group memberships), 26 not run. Mihai, 28 Sep, the first New-PimRegions.ps1 apply on cloudfellows.dev: 8 operations done (3 EU-NL units, 5 EU-NL groups), then elig Helpdesk Administrator PIM-SG-EU-NL-Helpdesk AU-EU-NL-Users failed 404 SubjectNotFound 0.7 s after the group was created, 45 not run. Mihai, 28 Sep, the first New-PimBaseline.ps1 plan on cloudfellows.dev: role Microsoft Entra Joined Device Local Administrator does not exist in the tenant, 1 blocking problem, nothing written; the portal lists the role by that name. Mihai, 25 Sep: small business and multi-region first; two demo regions in cloudfellows.dev are fine; tell me what to run to get this going. Then the reliability review (pimbuddy-hardening-plan.md) and: fix everything like before, the scripts must work with my Connect-Customer script, and a section with a sample EasyPIM Orchestrator json to edit for the three scenarios. MEDIUM: T48 stays read-only (one more read permission, RoleManagementPolicy.Read.AzureADGroup). The scripts write to tenants, but only an approved plan file, after a stale check, a typed confirmation and a backup; they never remove an assignment, a member or a group — except Find-PimDuplicates.ps1 deleting copies nothing uses, which it lists first. 0.2's New-PimBaseline -MergeDuplicates and New-PimRegions -RmauMembers are gone: they must not reach production. Promote only when the cloudfellows.dev steps below have been run; the live activation proof of the review's action 1 (an eligible test admin activating a role through a persona group) is its own check and is listed last.",
      test: [
        "32425: the steps below that use ⬇ Delta config or ⬇ Regions file no longer apply on the toolbar — both are hidden (🚀 Import ticked → leads to 🚀 Deploy, queue 305); ⬇ Baseline config is ⋯ EasyPIM file. Check that no toolbar button, head text or Help line tells a customer to run a .ps1.",
        "Beta site, demo (?demo=1&ws=pim) → 🧬 PIM baseline → ▶ Read. Profile Large · multi-region (default): tiles 38 roles · 26 match · 12 differ · 0 missing; chips Differs (12), Groups (23), Assignments (15), 🗺 Regions (2), 📄 EasyPIM samples; ⬇ Delta config (19). Large · one region: 4 match · 34 differ, Groups (27), no Regions chip. Small business: 5 match · 33 differ, Groups (9). No console error.",
        "Ticks: untick the first ticked row (⬇ Delta config goes 19 → 18), switch to Groups and back to All, then ⟳ Read again: the row is still unticked and the button still says 18. No PIM-SG-AZ row is ever ticked by default.",
        "⬇ Delta config: a file pim-delta.contoso.nl-…json downloads (JSON with _meta.schema cloudfellows-pim-config/2.1 and a sha256OfFileWithoutThisField) and the report names that exact file in the New-PimBaseline.ps1 -ConfigFile line, with Find-PimDuplicates.ps1 -Customer first.",
        "🗺 Regions (multi-region): tiles 2 regions · 14 match · 2 differ · 19 missing · 0 conflict · 7 not read; EU-NL 13 of 18 compared match (User Administrator → PIM-SG-EU-NL-Ops Missing, held at TENANT scope), EU-DE 1 of 17. Paste code,name,attribute,value / EU-NL,NL,department,EU-NL / EU-FR,France,extensionAttribute2,\"FR\"\") -or (x\" and Read the rows: both rows are left out with the reason (extensionAttribute1 to 15; inside a membership rule). ⬇ Regions file: the JSON carries approvers as lists.",
        "📄 EasyPIM samples: three cards (Small business, Large one region, Large several regions) and five steps; each ⬇ downloads a .jsonc identical to tools/pim/samples/easypim.<profile>.jsonc (EDIT markers: small 21, large 35, multi 25); View opens it. At 400 px wide there is no horizontal scroll.",
        "Sign out of a real tenant with regions loaded, sign in to another tenant with no saved regions file: the 🗺 Regions pane shows no file and nothing from the first tenant; the delta ticks start from the defaults.",
        "Scripts offline: pwsh -NoProfile -File tools/pim/tests/Test-PimScripts.ps1 prints pass 41, fail 0 (or PWSH=pwsh node --test tools/pimscripts.test.cjs passes). Needs PowerShell 7; the node test skips without it.",
        "cloudfellows.dev (DEVCF in Customers.json): .\\Connect-Customer.ps1 -AddGraphScopes -Customer DEVCF -GraphScopes with the plan and apply permissions from the scripts' .NOTES, then .\\Connect-Customer.ps1 -Customer DEVCF -Services Graph. .\\tools\\pim\\Find-PimDuplicates.ps1 -Customer DEVCF lists every doubled PIM-SG name with what uses each copy and a KEEP; the plan deletes only copies that nothing uses (PIM-SG-AZ copies only with -AzureChecked after az role assignment list). Apply the printed command: exactly those deletions; a rerun says nothing to delete.",
        "32421, cloudfellows.dev: New-PimRegions.ps1 ... -FixIntuneRoles plans introlefix:INT-ROLE-Regional-Ops with 31 actions (no block on unknown actions); the PATCH body holds only Microsoft.Intune_* ids, never a Resource/Action name; in Intune the role's Properties show Remote tasks Collect diagnostics, Enrollment programs Read device and Sync device, Audit data Read among the 31. If an entry does not resolve, the block lists the tenant's operations for that resource with their ids.",
        "32420, cloudfellows.dev: the regions plan reports Intune role INT-ROLE-Regional-Ops lacks 32 of the template's 32 actions (it has none at all) and names -FixIntuneRoles; with -FixIntuneRoles the plan holds introlefix:INT-ROLE-Regional-Ops (add 32, none removed); the apply writes the backup first; in Intune, Tenant administration → Roles → INT-ROLE-Regional-Ops → Properties lists the permissions; planning again reports nothing for the role.",
        "32419, cloudfellows.dev: the regions plan starts with tagassign:INT-TAG-EU-NL (the tag exists, not assigned) and the two EU-NL Intune assignments, then EU-DE; the apply assigns the tag without NotSupported; in Intune, Tenant administration → Roles → Scope tags → INT-TAG-EU-NL → Assignments lists INT-SG-DEV-EU-NL-All.",
        "32418, cloudfellows.dev: .\\tools\\pim\\New-PimRegions.ps1 -RegionsFile .\\tools\\pim\\regions.csv -Customer DEVCF plans the rest without the 3 EU-NL units and 5 EU-NL groups the stopped run made (they are found, not created again); -Apply -PlanFile runs to the end: where Entra has not replicated a new group yet, the output shows not replicated yet (404), trying again in 5 s and the outcome file says done after N retries; failed 0, not run 0 (a membership policy may be deferred).",
        "32417, cloudfellows.dev: .\\tools\\pim\\New-PimBaseline.ps1 -Customer DEVCF no longer stops at role Microsoft Entra Joined Device Local Administrator does not exist; if Graph carries the former name, the findings say role Microsoft Entra Joined Device Local Administrator is called Azure AD Joined Device Local Administrator in this tenant — matched by its template id 9f06204d-73c1-4d4c-880a-6edb90606fd8, and the plan's eligibilities for it name that id. With -WriteResolved the resolved file uses the tenant's name. In ENCA, ▶ Read on cloudfellows.dev shows the role as Match or Differs (never Missing) with the same finding.",
        ".\\tools\\pim\\New-PimBaseline.ps1 -Customer DEVCF (pim-baseline.json): no write while planning; the plan lists the membership policies to GroupMember / GroupJIT rule by rule, eligibilities at tenant scope for groups that still hold 2.0 ACTIVE roles (each named as a finding), and the INT access groups. Apply the printed command (type cloudfellows.dev): a backup file and an outcome file appear; the re-plan at the end says nothing left (or only schedules that need a minute). Then remove the 2.0 ACTIVE group assignments by hand, as the findings say.",
        ".\\tools\\pim\\New-PimRegions.ps1 -RegionsFile .\\tools\\pim\\regions.csv -Customer DEVCF: the plan per region — 3 units, the persona, INT access and approver groups, 8 AU-scoped eligibilities, the Intune scope groups, tag, auto-assignment and 2 assignments, the custom role once — plus manual lines for the access review and Autopilot; approvers that do not exist in the tenant are findings. Apply the printed command; a rerun plans nothing. ENCA → 🧬 PIM baseline → 🗺 Regions with regions.csv reads Match on the Entra rows of EU-NL and EU-DE.",
        "Live activation proof (review action 1), cloudfellows.dev: an adm- test account made an ACTIVE member of PIM-SG-M365-Ops activates Exchange Administrator in My roles, gets it for the role's duration and loses it after; the same account in PIM-SG-EU-NL-Helpdesk activates Helpdesk Administrator scoped to AU-EU-NL-Users and cannot reset a password outside the unit. Record the times.",
      ],
      files: ["js/pimBaselineData.js", "js/pimbaseline.js", "js/app.js", "js/demo.js", "index.html", "css/app.css", "tools/pimbaseline.test.cjs", "tools/pimscripts.test.cjs", "tools/pim/PimCommon.psm1", "tools/pim/New-PimBaseline.ps1", "tools/pim/New-PimRegions.ps1", "tools/pim/Find-PimDuplicates.ps1", "tools/pim/generate.cjs", "tools/pim/tests/FakeGraph.ps1", "tools/pim/tests/Test-PimScripts.ps1", "tools/pim/tests/Test-PimRegions.inc.ps1", "tools/pim/tests/Test-PimDuplicates.inc.ps1", "tools/pim/tests/Test-PimReview.inc.ps1", "tools/pim/tests/Test-PimRoles.inc.ps1", "tools/pim/tests/Test-PimReplication.inc.ps1", "tools/pim/tests/Test-PimScopeTags.inc.ps1", "tools/pim/tests/Test-PimIntuneRole.inc.ps1", "tools/pim/pim-roles.json", "tools/pim/samples/easypim.small.jsonc", "tools/pim/samples/easypim.large.jsonc", "tools/pim/samples/easypim.multi.jsonc", "tools/pim/pim-regions-template.json", "tools/pim/regions.csv", "tools/pim/regions.cloudfellows.dev.json", "tools/pim/pim-baseline.json", "tools/pim/pim-baseline.small.json", "tools/pim/pim-baseline.large.json", "tools/pim/pim-baseline.multi.json", "js/version.js", "js/changelog.js", "js/promote.js"],
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
        "Open CA groups and Policies (two tabs). Press the chip → 02 · PIM-buddy: the header turns green with a lemon rule (navy until 32430), the chip reads 02, the rail reads Baseline (greyed, next build), PIM groups, Who holds…, Checks, Restricted AUs, Changes; the home title is Privileged access overview with the PIM lead and a library of 10 tools in four groups; the Policies tab is hidden, the CA groups tab is still there.",
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
