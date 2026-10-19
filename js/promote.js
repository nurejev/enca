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
  productionBuild: "v2.0.5",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {},

  // WORKSPACES (32439, Mihai: "split the work order of the beta to main for
  // Conditional Access and PIM-buddy, so it can be checked and exported
  // without mistakes that another workspace gets promoted").
  //
  // Every item and every staying entry carries `ws`: one of the keys below. A
  // test fails the suite when one is missing, so a new item cannot arrive
  // unlabelled. An order is made for ONE workspace (plus platform): the tool
  // offers only that workspace's ticks, and buildOrder refuses anything else.
  //
  // `platform` is shell work both workspaces need (sign-in, the Overview,
  // shared CSS, the queue itself). It can be ticked from either side.
  //
  // `owns` names the files that belong to a workspace alone. An order for
  // another workspace lists them under NEVER PORT, beside every file that only
  // that workspace's queued items touch. `mainChecks` are the greps a port of
  // ANOTHER workspace's order must come out clean on, once it is on main.
  //
  // `requires` on an item names the items it cannot work without. Pointing
  // into another workspace is the dangerous case — the order check blocks the
  // export and says which item needs what (314 is the first: the unit
  // inventory reads the PIM lens of 302 and the regions of 301).
  //
  // A workspace is a guard about the BUILD, never the host: a tool hidden on
  // the production host is still in every copy that serves the build (the
  // betaOnly lesson of 18 Sep 2026). Keeping PIM-buddy off main means its
  // files are not ported, and the order says which ones.
  workspaces: {
    ca: {
      num: "01", label: "Conditional Access",
      owns: [],
    },
    pim: {
      num: "02", label: "PIM-buddy",
      owns: ["js/pim*.js", "js/intunerbac.js", "tools/pim/", "tools/pim*.test.cjs", "tools/pim*.cjs", "tools/intunerbac.test.cjs"],
      mainChecks: [
        "grep -nE 'pmb[A-Z]|pimPlan|pimApply|prlOn|pimLensPaint|PIM-SG' js/*.js index.html  (expect nothing)",
        "grep -n 'src=\"js/pim' index.html  (expect nothing)",
        // 32818: main has had the workspace chip since production 326 (01 and
        // 03, with 02 listed as on the beta channel) — "no workspace chip" was
        // true when this was written at 32439 and failed on main from 326 on.
        "whole-page boot on main: 02 PIM-buddy only as 'On the beta channel — not in this build', no 02 tools in the rail, no console errors",
      ],
    },
    // 32515: 03 Entra Tools (Mihai, 14 Oct). It owns 🌐 Global Secure Access;
    // its Groups tool is T12, which stays 01's file set.
    entra: {
      num: "03", label: "Entra Tools",
      owns: ["js/gsa.js", "tools/gsa.test.cjs", "js/trv2.js", "tools/trv2.test.cjs", "js/egress.js", "tools/egress.test.cjs"],
      // 32818: 03 SHIPPED in production 326 (v2.0.4). The checks below used to
      // expect GsaTool, js/gsa.js and the 03 chip to be ABSENT from main, which
      // main failed before any port began. An order for another workspace must
      // leave main's 03 exactly as it was — that is what is checked now.
      onMain: 326,
      mainChecks: [
        "git diff <main before the port> HEAD -- js/gsa.js js/trv2.js js/egress.js tools/gsa.test.cjs tools/trv2.test.cjs tools/egress.test.cjs  (expect nothing: main keeps its own 03 files)",
        "grep -c 'src=\"js/gsa' index.html  (expect 1, as before the port)",
        "whole-page boot on main: 03 Entra Tools in the workspace chip as before the port, no console errors",
      ],
    },
    platform: {
      num: "", label: "Platform",
      owns: [],
    },
  },

  items: [
    {
      n: 355,
      ws: "platform",
      title: "🚚 Promotion order: shell files are port-by-hunk, not Never port; the after-port checks know 03 is on main",
      tools: ["Help"],
      builds: [32818],
      risk: "low",
      files: ["js/promote.js", "js/app.js", "tools/promote-ws.test.cjs"],
      what: "js/promote.js: PROMOTE.SHELL (index.html, js/app.js, css/app.css, css/workspaces.css, js/demo.js, js/flat-icons.js, js/workspaces.js, js/graph.js, js/connection.js, js/onboard.js, README.md, SECURITY.md, New-EncaAppRegistration.ps1) never goes under Never port; checkOrder returns byHunk, the shell files the other workspace's items change, and the order prints them as Shell files the other workspace also changes: port this order's hunks only. The 03 workspace carries onMain: 326 and its after-port checks now prove main's 03 files are untouched (git diff against main before the port, one js/gsa.js script tag, 03 in the chip as before) instead of expecting GsaTool and the 03 chip to be absent; the 02 check no longer expects no workspace chip. js/app.js: the order check in the tool shows the port-by-hunk line. tools/promote-ws.test.cjs: two tests.",
      why: "Mihai's 19 Oct orders (ca 7075618b, entra 4e572170, platform 5f779c04): items 336-353 list no files, so every shell file only a PIM item declared came out as Never port — index.html, js/app.js, css/app.css — while the carve-outs of 343 and 344 said to port hunks of exactly those; and the CA and Platform orders' after-port greps expected no GsaTool and no 03 on main, which main has carried since production 326, so main failed them before the port began.",
      carveout: "Beta-only, like the queue itself: nothing of it ports to main (promote.js and openPromote do not exist there). Ticking it clears it from the queue.",
      test: [
        "Beta, cloudfellows.dev, 🚚 Waiting for production on 01: tick 339 — the order check shows ⇄ Port by hunk with index.html, js/app.js and css/app.css, and Never port lists only the PIM-buddy and 03 files.",
        "Export that order: the file has the Shell files … port this order's hunks only section, and After the port says 03 Entra Tools in the workspace chip as before the port — no grep for GsaTool expecting nothing.",
        "Switch to 03 and tick 344: Never port lists only the PIM-buddy files; the fingerprint for the same ticks is the one the 19 Oct order carried (4e572170 for the full 03 order).",
      ],
    },
    {
      n: 354,
      ws: "entra",
      title: "🌐 Global Secure Access 0.15.2: the Windows install remediation upgrades an old client and checks the installer",
      tools: ["Global Secure Access"],
      builds: [32817],
      risk: "medium",
      what: "js/gsa.js: new GSA_MIN_VERSION (2.34.222.0) and VER_LINES (a four-part version compare). detectScript exits 1 when the client is missing or below the floor, reports the GSA service state without acting on it, and exits 0 on an unexpected error. remediationScript installs when missing and upgrades below the floor, with a 6-hour retry guard, the installed version read back and the temp installer removed in a finally. INSTALL_LINES (also the platform script) gets a 600 s download timeout and an Authenticode check (valid, signed by Microsoft Corporation). remediationBody description names the floor. tools/gsa.test.cjs: the 32520 test follows the new scripts, new 32817 test. Existing deployments are not touched: a GSA remediation found in a tenant is reused, never rewritten.",
      why: "Mihai, 19 Oct: a new Cloud PC (CPC-mihai-FDEEM, Limon-IT) got client 2.32.294 with a blank Device ID, so the forwarding profile stayed empty; an uninstall and the remediation's reinstall gave 2.34.222.0 and a working client. The v2.0 install could never upgrade an old client (detection only asked installed or not) and ran an unchecked installer. The same scripts, as plain files, are in ScriptsAndCode/Intune/Intune-Remediations_scripts/Install-GSA-Client-Windows, tested with a mock harness on PowerShell 7.4.6 (23 of 23, also on the text this generator emits).",
      carveout: "None: js/gsa.js, the two test and changelog hunks port as they are; promote.js stays beta-only.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Setup → step 6: open Create Windows install remediation…; Detection shows $MinVersion = '2.34.222.0' and the version compare, Remediation shows the retry guard, Get-AuthenticodeSignature and the version read-back; the Graph request tab description names 2.34.222.0.",
        "Same workspace, switch to the platform script: it has the signature check and still exits 0 when the client is there.",
        "Limon-IT, Read: the existing v2.0 install remediation is still reported as the Install client row, unchanged (nothing is rewritten).",
        "On a Windows test device with the client older than 2.34.222.0 (or after uninstalling it): run the new detection as SYSTEM, it exits 1 and says why; run the remediation, the client installs or upgrades, C:\\ProgramData\\GSAInstall\\install.log shows signed by Microsoft and the installed version, and a second run exits 0 without downloading. Then log off and on: the client signs in by itself.",
      ],
    },
    {
      n: 353,
      ws: "ca",
      title: "🏢 SMB Basic — a third Conditional Access baseline (R91)",
      tools: ["Baseline", "Import", "Guided rollout"],
      builds: [32816],
      risk: "medium",
      what: "js/baselineSmbData.js (new): BASELINE_SMB, 15 policies CA001-CA006 / CA101-CA104 / CA201-CA204 / CA901 named CAnnn-KIND-SMB-..., the Joey-shaped contract (personaOfPolicy, codeForGroup, exclusionGroupFor, templates, auName by section), sharedEAdmins false, and bundle(): a raw backup bundle with 16 groups, SMB - Allowed countries, the built-in MFA and phishing-resistant strengths, a custom SMB - FIDO2 security key, forceOff for CA103 and CA201-CA204. js/baseline.js: catalogs() lists it; sharedPolicies and sharedGroups honour sharedEAdmins false; exclusionShape from the catalog. js/secdefaults.js: optional azureMgmt protection (joins the switch, never gates it), SMB card text. js/app.js: imSmbLoad (setActive smb, then imLoaded), sdPick smb, Import baseline for smb, Guided rollout action smb, SMB texts in the convention, unit and guide panels. js/workspace.js: SMB source card. index.html: script tag, tile, Help (Baseline, Import), roadmap R91.",
      why: "Mihai, 19 Oct: a third CA baseline, SMB basic: security defaults with GSA policies, extra requirements for admins and something for the break-glass. Mockup approved with: no compliant device (SMB tenants do not enrol admin devices), compliant network with GSA instead; protect security-info registration; an exclusion group per policy and an RMAU per section; the break-glass RMAU also holds the accounts; the whole framework must embrace it like Joey and CloudFellows; break-glass alert left for later.",
      carveout: "None beyond the usual: the new file plus the hunks in baseline.js, secdefaults.js, app.js, workspace.js and index.html port as they are; promote.js stays beta-only.",
      test: [
        "Beta, ?demo=1: 🧬 Baseline, the picker shows 🏢 SMB Basic third; pick it — 15 rows in four sections (Base, Admins, Compliant network, Break-glass), no 🚨 E-Admins section.",
        "Beta, ?demo=1: Import baseline on SMB Basic opens 📥 Import with 15 policies, 16 groups, 1 named location and 3 strengths; assignment mode is As shipped; CA103 and CA201-CA204 say new policy, Off in the confirmation.",
        "Beta, ?demo=sd: the security-defaults card lists three baselines; SMB Basic reads carried by ENCA and its button is Deploy in Report-only.",
        "Beta, devcf or a test tenant WITHOUT Global Secure Access: import SMB Basic — CA001-CA006, CA101, CA102, CA104 and CA901 land; the five compliant-network policies are reported as refused or land Off; groups CAB-SEC-U-SMB-CA001-Exclusion ... and the location SMB - Allowed countries exist.",
        "Same tenant: 🛡 Restricted AUs, the baseline panel offers CA-RMAU-SMB-BASE, -ADM, -CN and CA-RMAU-BreakGlass; 🔒 Protect exclusions files every SMB exclusion group by CA number into its section's unit and offers the break-glass accounts for CA-RMAU-BreakGlass.",
        "A security-defaults tenant: deploy SMB Basic from the card, then the band shows MFA for Azure management ticked by CA005; ⇄ switch lists CA001-CA005 to go On, CA006 and the admin policies stay Report-only.",
        "👥 CA groups under SMB Basic: Emergency_Access1/2 are not reported missing.",
      ],
    },
    {
      n: 352,
      ws: "entra",
      title: "🌐 Global Secure Access 0.15.1: no false filter warning, and a read that cannot hang in silence",
      tools: ["Global Secure Access"],
      builds: [32815],
      risk: "low",
      what: "js/gsa.js: realFilter(id, mode) returns null for a null id, the all-zeros GUID or type none; tgt() uses it, so reach() no longer reports another filter than the script for a settings catalog policy (null) and a remediation (zero GUID) on the same group, and All devices with the zero GUID reads as All devices. Exported for the test. js/app.js readGsa: the winDns source lists the Windows settings catalog policies by name and opens settings and assignments only for those named like edge, chrome, browser, dns, doh, gsa or global secure access (60 at most, Graph.mapLimit 4) instead of one expand over all of them; one() and the device report, sign-in, group member, Mac and group name reads run through within() with GSA_SRC_MS (120 s), a source that passes it is recorded as not read; gsaStep() puts the source being read in the spinner line (#gsaStep); renderGsa wraps Gsa.model and the draw in try/catch and shows the error with Read the tenant again. tools/gsa.test.cjs: one test (57 in all).",
      why: "Mihai, 19 Oct: the Secure DNS off row in Limon-IT said INT-SEC-D-GSA-WIN-M365, but with another filter than the script although neither had a filter; and Global Secure Access on devcf kept loading and never showed. Not reproduced live (the board needs his sign-in): the pure model and render draw on a devcf-shaped combined remediation, so the hang is in the read; this removes the heaviest read and makes any remaining stall visible.",
      carveout: "None: js/gsa.js and the readGsa block are the same on main apart from the promotion series; port both files whole with the build numbers rewritten.",
      test: [
        "Beta, gimi (Limon-IT): Global Secure Access, Read the tenant, step 6, the Windows chain: Secure DNS off reads green with the install remediation's group and no warning about another filter.",
        "Beta, devcf (cloudfellows.dev): Read the tenant. The spinner line says now: followed by the source being read, and the board appears. If a source stalls, after two minutes it is listed as not read and the board still draws.",
        "Beta, devcf: step 6, Secure DNS off still finds the browser DNS policy when there is one (named Edge, Chrome, browser, DNS or GSA); a policy with another name is not opened.",
        "Beta, ?demo=1: Global Secure Access opens as before.",
      ],
    },
    {
      n: 351,
      ws: "platform",
      title: "🔐 Sign-in card: the ⚙ login panel stays collapsed once a login is saved",
      tools: ["Sign-in"],
      builds: [32814],
      risk: "low",
      what: "js/connection.js paintCurrent: the details element #loginConn is opened only when there is no saved connection and this copy ships no login (!c && !SHIPPED.clientId). Before, any saved connection opened it on every load. The summary line (Signing in as NAME — change) already carries the answer. Saving a connection still reloads the page.",
      why: "Mihai, 19 Oct: on the logon screen, after adjusting the new create-app-registration section and saving, the panel should always be collapsed instead of expanded.",
      carveout: "None: js/connection.js is the same on main apart from the route text; port the one condition.",
      test: [
        "Beta, a private window, no saved connection and no shipped login: the ⚙ panel is open (it is the only way in).",
        "Beta: ＋ Add a connection, Save — the page reloads and the panel is closed, the title line reads Signing in as NAME — change; click it and the panel opens with the connection selected.",
        "Beta: ⚙ Forget the connection with a shipped login present — the panel stays closed after the reload.",
      ],
    },
    {
      n: 350,
      ws: "entra",
      title: "🌐 Global Secure Access — Windows install and configuration as two deployments; Split for the combined script (T56 0.15.0)",
      tools: ["Global Secure Access"],
      builds: [32813],
      risk: "medium",
      what: "js/gsa.js: detectScript, remediationScript and windowsScript install the client only (one installBody; the uninstall-key lookup in both). New cfgDetectScript, cfgRemediationScript (the client checked first: exit 0, nothing to configure yet; the key created only when missing) and cfgScript (platform script, written whether or not the client is there), cfgRemediationBody, cfgScriptBody, names remCfg and winCfg (Configure Global Secure Access Client, no mode in the name), CFG_FILE, valsOf (exact values, custom too), majorName (v1.0 to v2.0, this month's release). contentSettings reports installs, checksClient and role; winRole gives a deployment's part by content, else by name. winCheck picks the install (assigned, install-only first; DEPRECATED left out) and returns combined, cfg (with its own reach), cfgCount and deprecated. winChain: the Client settings row is the configuration's (sub with mode and checks the client first, reach against the install's groups, X of N as required, waiting for the client; a second assigned configuration is bad; no configuration is a warning with Create); a combined script's install row offers Split and its settings row reads pilot or locked down, combined; IPv4 from the configuration. clientLanes adds winsplit (primary on a combined script) and wincfg. FIXES and preview: winrem and winscript install only (winrem hourly), wincfg, winsplit, winswap with the configuration script. js/app.js: gsaFixDefaults (winrem hourly, wincfg daily and remediation or script by the install, winsplit and winswap keep the old values), the workspace opened once (else if not had), forms for wincfg (kind, install's targets, schedule, mode, IPv4) and winsplit, runGsaFix wincfg, winsplit (backup, POST install with the same assignments and schedules, POST configuration, read both back, then assign the old one nothing and PATCH its name and description) and winswap with the configuration script and the configuration remediation unassigned; the demo applies all of it; script tabs download as shown. tools/fixtures/gsa-win-combined-v1.json: the combined scripts as ENCA wrote them before.",
      why: "Mihai, 19 Oct: adjust the Windows script to split installation from configuration, the configuration detecting first whether the client is installed, separate to run and assign. Found on the way: the combined script ran New-Item -Force on the client's own key (32811). Mockup review/2026-10-19/t56-windows-split approved with: DEPRECATED after the split yes, no mode in the name, one configuration only, install hourly and configuration daily. Risk medium: two new writes (the configuration, the split with a rename) and the swap now writes a second script; every write downloads a backup or reuses what exists, and the old script is only unassigned after both new ones read back.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Setup → step 6: the Windows lane offers Create Windows install remediation… and Create the Windows configuration…; the install workspace runs every hour by default, has no client settings and says it installs only.",
        "Beta, demo: apply the install; the chain's Client settings row reads not found with Create…; open it — a remediation by default, daily, assigned to the install's targets, name Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0, tabs Detection, Remediation, Graph request; switch to a platform script and the name, file and tabs follow, the schedule goes. Apply as a remediation: the row shows the configuration, pilot, checks the client first, 2 of 2 as required.",
        "Beta, demo: click a fix twice — one workspace, brought to the top.",
        "Beta, Limon-IT: Read — the Windows lane's first action is Split install and configuration…; the chain's Install client row is red (New-Item -Force; installs and configures in one) with Split…; Client settings reads pilot, combined.",
        "Beta, Limon-IT: Split… → the workspace names the install v2.0, the configuration and the DEPRECATED rename, reads pilot from the old script, configuration daily; Apply asks DeviceManagementConfiguration.ReadWrite.All; a JSON backup downloads; in Intune the install v2.0 and Configure v1.0 exist on INT-SEC-D-GSA-WIN-M365 (install hourly, configuration daily, remediation on), and [DEPRECATED] Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0 has no assignment and the reason in its description.",
        "Beta, Limon-IT after the split: Read again — Install client v2.0 clean with Redeploy…, Client settings the configuration's own row; on the Cloud PC uninstall the client once (Apps), let the install remediation (or Run now…) put it back, restart, and check the client signs in by itself and keeps its own values next to the four settings (Get-ItemProperty on its key).",
        "Beta, devcf: Read — the locked-down combined remediation offers Split…; Split it and check the configuration carries locked down.",
        "Beta, a Business Premium tenant with a configuration remediation: Replace… shows the install and the configuration script, both assigned to the remediation's groups, and both remediations unassigned and kept.",
      ],
    },
    {
      n: 349,
      ws: "ca",
      title: "🧬 Baseline catalog — the Global Secure Access block per platform: CA215 Windows, CA216 macOS, CA217 iOS, CA218 Android (T10 2.11.1)",
      tools: ["Baseline"],
      builds: [32812],
      risk: "low",
      what: "js/baselineData.js: CA215 becomes CA215-BLOCK-Internals-CN-AllApps-Windows-Require Global Secure Access client active-v3.0.4 (was WindowsOrMACOS v3.0.3, exclusions unchanged), and three new NEW entries after it — CA216 macOS, CA217 iOS, CA218 Android, v3.0: include CAB-SEC-U-Persona-Internals, exclude CAB-SEC-U-BreakGlass and their own CAB-SEC-U-CA21x-Exclusion, All resources minus the nine CA215 exclusions (plus MicrosoftDefenderATP XPlat and Microsoft Defender for Mobile TVM on iOS and Android), Any location minus All Compliant Network locations, Block. revised 2026-10-19 with a note. js/groupTemplates.js: templates CAB-SEC-U-CA216-Exclusion to CAB-SEC-U-CA218-Exclusion. Data only, no code.",
      why: "Mihai, 19 Oct: CA215 covers Windows and macOS, so a token replayed with an iOS or Android user agent passes; split per platform (215 Windows, 216 macOS, 217 iOS, 218 Android) so each goes on by itself. Mobile is BYOD with app protection, no enrolled devices, and the GSA client is required on BYOD too. Built in cloudfellows.dev as (NEW)CA215-CA218 in report-only; the combined (NEW)CA215 WindowsOrMACOS v3.0.3 stays there, Off (Mihai: devcf is the development tenant, off is good). NOT changed: the T56 step 7 builder still pre-fills one combined Windows and macOS CA215 (js/app.js data-gsabuild). Risk low: the catalog drives compare and Import, and Import creates new policies Off or report-only.",
      test: [
        "Beta, devcf (cloudfellows.dev), with the combined (NEW)CA215 WindowsOrMACOS v3.0.3 still there, Off: 🧬 Baseline → CloudFellows catalog → Internals: CA215 to CA218 read ok, CA215 matched to the Windows v3.0.4 policy (checked offline 19 Oct with Baseline.compare and entryDiff on the live policies: all four ok, no content difference).",
        "Beta, devcf: 🧱 Update the catalog → CA215 to CA218 are not offered as changed (the catalog entries equal what the serialiser makes of the tenant policies).",
        "Beta, a tenant with the old combined CA215 v3.0.3: Baseline reads CA215 outdated (3.0.3 against 3.0.4) and CA216 to CA218 Missing.",
        "Beta, a tenant without any of them (demo or Limon-IT): Baseline → Internals lists CA215 to CA218 as Missing; Import with them ticked → the plan creates CAB-SEC-U-CA216-Exclusion to CAB-SEC-U-CA218-Exclusion and the four policies, never On.",
        "Beta, group checks: CAB-SEC-U-CA216-Exclusion to CAB-SEC-U-CA218-Exclusion are expected groups; on devcf they read present.",
        "node --test tools/*.test.cjs passes.",
      ],
    },
    {
      n: 348,
      ws: "entra",
      title: "🌐 Global Secure Access — the Windows chain, per-device stages and Redeploy; the scripts keep the client's own registry key (T56 0.14.0, 0.14.1)",
      tools: ["Global Secure Access"],
      builds: [32810, 32811],
      risk: "medium",
      what: "js/gsa.js: winChain(raw, c) builds four rows found by content: Install client (contentSettings reads the install script: the aka.ms download, ARM64, the four client settings and DisabledComponents), Client settings (read only), Secure DNS off (dnsCheck over the Windows settings catalog policies, DNS_SETTINGS holds the four definition ids; fix windns with need = the settings no policy sets) and IPv4 preferred (optional). winChainHtml renders it as section gsaWin above the macOS chain. runIndex(obj) reads the deployment's run states (remediation detection and remediation state with the detection output; platform script run state) by Entra device id, else by name; authIndex(raw) reads the client's own sign-ins per Entra device id (ZTNA Policy Service Client to ZTNA Policy Service = policy; Global Secure Access Client or a resource with Global Secure Access = tunnel; failures kept apart). clientLanes adds Installed (replacing Ran (Intune) when run states are read), Policy fetched and Tunnel; the lane word names the first failing stage; Redeploy… is winrun for a remediation and winredeploy for a platform script; Show the chain jumps to gsaWin. The devices table has a Client column and Run now… per device. FIXES and preview for winrun, winredeploy and windns; winDnsBody, winDnsName and b64 exported. js/app.js: the read adds the remediation and platform script content and run states (with managedDevice expanded), the client sign-ins (non-interactive, both app ids) and the Windows settings catalog policies with settings and assignments filtered to the DNS definitions; GSA_READ adds DeviceManagementManagedDevices.Read.All; runGsaFix winrun (syncDevice then initiateOnDemandProactiveRemediation per ticked device), winredeploy (backup download, then PATCH displayName with the version bumped and scriptContent with a dated redeploy line) and windns (POST configurationPolicies with only the missing settings, then assign to the install targets or a device group); the demo applies all three.",
      why: "Mihai, 19 Oct: where is the windows chain, and where is the redeploy; his Cloud PC had the client installed but it showed Disabled by your organization. Read live on Limon-IT: the remediation detected 2.32.294 installed with the settings as required and the client fetched its policy at 00:41Z, but never got a tunnel token. Mockup enca-t56-windows-chain-mockup (review/2026-10-19/t56-windows-chain), then test it first against devcf: the setting ids, the child option off and the baseline browser policies (no DNS-over-HTTPS off) were read there; devcf has no managed devices and its Lokka connection refuses writes. Risk medium: three new writes, each asked at the click with its own scope; the reads are read-only and a refused one is named.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Setup → step 6: the Windows lane reads nothing deployed; Create Windows remediation → Apply; the lane shows Installed 2 of 2 client 2.32.294, Policy fetched 2 of 2, Tunnel 1 of 2 with the Disabled by your organization checks for LT-DEMO-02, partly connected, and Redeploy… as the first button.",
        "Beta, demo: Show the chain → the Windows chain has Install client, Client settings (pilot, the four values), Secure DNS off (Edge and Chrome: no policy turns DNS-over-HTTPS off, Create…) and IPv4 preferred (optional, not set); Devices in scope has a Client column and Run now… on LT-DEMO-02.",
        "Beta, demo: Create… on Secure DNS → the workspace shows the policy with the four settings, the assign request, the impact and the way back; Apply → simulated, the row reads the new policy as Learn wants it.",
        "Beta, demo: Run now… on LT-DEMO-02 → the workspace has the device ticked, Sync ticked, the requests and the licence warning; Apply → synced, the remediation runs now (simulated).",
        "Beta, devcf (cloudfellows.dev): Read → the Windows chain's Secure DNS row says no policy turns DNS-over-HTTPS off in Edge or Chrome; Create… → Apply asks DeviceManagementConfiguration.ReadWrite.All; in Intune the policy Win - DCP - Device Configuration - D - GSA Browser DNS - R26.10 - v1.0 exists with Control the mode of DNS-over-HTTPS = Disable DNS-over-HTTPS and Use built-in DNS client = Disabled for Edge and Chrome, assigned to the install groups; Read again → the row is green.",
        "Beta, Limon-IT: Read → the Windows lane reads installed · no tunnel: Installed 1 of 1 client 2.32.294, Policy fetched 1 of 1 (CPC-mihai-2L8IB), Tunnel 0 of 1 with the checks; the chain shows the remediation in pilot mode (Disable shown, sign-out hidden) and Secure DNS as the problem row.",
        "Beta, Limon-IT: Redeploy… → tick CPC-mihai-2L8IB with Sync → Apply asks DeviceManagementManagedDevices.PrivilegedOperations.All; the log says synced and run; after a few minutes Read again → the device's run state has a new time.",
        "Beta, a tenant with the platform script: Redeploy… → a backup downloads, the script's name has its version bumped and the content starts with a dated redeploy line; the assignments are unchanged.",
        "Beta, a tenant where DeviceManagementManagedDevices.Read.All or the sign-ins are refused: the lane falls back to Ran (Intune) and Connected and never reads installed on what was not read.",
        "32811, beta, Limon-IT and devcf: Read — the Windows chain's Install client row is red: re-creates the client's registry key with New-Item -Force; the lane offers no Redeploy while that script is deployed.",
        "32811, beta, demo or devcf: Create Windows remediation or Create Windows script → the workspace's script shows if (-not (Test-Path $key)) { New-Item -Path $key | Out-Null } and no New-Item -Force on the client's key.",
        "32811, a test device: after the new script ran, Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Global Secure Access Client' still lists the client's own values next to the four settings, and the client stays signed in after a restart.",
      ],
    },
    {
      n: 347,
      ws: "entra",
      title: "🌐 Global Secure Access — hide the Microsoft profile's app from My Apps (T56 0.13.0)",
      tools: ["Global Secure Access"],
      builds: [32808],
      risk: "low",
      what: "js/gsa.js: model() reads the profile's service principal tags — myApps (known, hidden, shown to whom) on step 3; the note says shown in My Apps to them or hidden from My Apps, the node carries an in My Apps badge, fix3 is hideapp or showapp; FIXES hideapp and showapp with impact and way back; appTags(tags, hide) keeps every other tag; preview for both, and Assign's extra PATCH when Also hide is ticked; monitor() adds a my apps line to Needs attention with the fix and renderMonitor draws its button; the demo app has a name and tags. js/app.js: tags in the service principal read; gsaAppVisible reads the tags fresh, PATCHes them with or without HideApp, reads back, and names the portal setting when Graph refuses; Assign hides in the same run when ticked (hide true by default); a fix pressed on Monitor opens on Setup at its step; the demo applies the tag. css/app.css: .gsa-badge. tools/gsa.test.cjs: 2 new tests (43 pass).",
      why: "Mihai, 19 Oct, from the sastu-insights post on deploying the Global Secure Access client with Business Premium: an option to remove the app visibility from the user. Built from the mockup (part A; part B, locking the client after go-live, not asked for). Risk low: one tag on one service principal, the assignment untouched, undone by Show again. Not verified live: whether Graph accepts the tag on this Microsoft-owned app.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Setup: step 3 carries an in My Apps badge; open it — the note ends shown in My Apps to them and What you can do offers Hide from My Apps…; the step stays partly (one traffic policy off), not changed by the tile.",
        "Beta, demo: Hide from My Apps… → the workspace shows the PATCH with WindowsAzureActiveDirectoryIntegratedApp and HideApp, the impact and the way back; Apply → simulated, the badge goes, step 3 reads hidden from My Apps and offers Show again…; Show again → back as before.",
        "Beta, demo: Monitor → Needs attention has The Microsoft profile's app shows in My Apps for 1 group with Hide from My Apps…; the button opens Setup at step 3 with the workspace open.",
        "Beta, demo: Assign… → Pilot group shows Also hide the app from My Apps, ticked; the request adds the tag PATCH; untick it or pick All users — the PATCH goes.",
        "Beta, Limon-IT (profile assigned to a group): Read → step 3 says shown in My Apps to them; as a member, myapps.microsoft.com shows the profile's tile. Hide from My Apps… → Apply asks Application.ReadWrite.All; the log says hidden and read back; Entra → Enterprise applications → the app → Properties shows Visible to users? No; the tile leaves My Apps within minutes; the member's client stays Connected and Monitor still shows traffic.",
        "Beta, Limon-IT: if Graph refuses the PATCH, the log names the portal setting; set Visible to users? No there, Read — step 3 reads hidden from My Apps.",
        "Beta, Limon-IT: Show again… → Visible to users? Yes in the portal and the tile returns.",
      ],
    },
    {
      n: 346,
      ws: "entra",
      title: "🌐 Global Secure Access — 📈 Monitor after setup: the traffic log, devices, alerts, sign-ins around the tunnel, the heartbeat (T56 0.12.0)",
      tools: ["Global Secure Access"],
      builds: [32807],
      risk: "low",
      what: "js/gsa.js: monitor(model, mon) — the devices (the lanes members as expected, plus every device in deviceReport, the traffic log and the sign-ins through GSA, by Entra device id: connected in the last day, silent, not seen, outside the GSA groups), client versions (Windows below 2.31.125 named), sign-ins (proof() over the guard policies, around the tunnel seeded by the users seen through GSA, Windows and macOS only, blocked and would-block per guard), alerts (deviceTokenInconsistency, crossTenantAnomaly), the heartbeat (usageProfiling buckets compared with the same time a week earlier, low below a third), six tiles and Needs attention, most serious first. renderMonitor, modeBar (also on top of the Setup board), monLogRows (the filtered traffic rows), demoMonitor, setupDone. js/app.js: gsa.mode with Monitor as default once setupDone until the person picks; readGsaMon — usageProfiling from a week before the period, deviceReport, logs/traffic (newest 1,000, $select, $orderby; Load more by nextLink), alerts (filtered by creationDateTime, else read and filtered here), sign-ins interactive and non-interactive (newest 5,000 each), each source on its own; CSV of the loaded transactions; the filter swaps only the table body; Refresh in Monitor reads the traffic again. GSA_MON adds NetworkAccess-Reports.Read.All, asked on the click. css/app.css: modes, tiles, heartbeat, attention, filter. tools/gsa.test.cjs: 4 new tests (41 pass).",
      why: "Mihai, 18 Oct: after setup the focus should be monitoring the traffic logs. Built from the mockup review/2026-10-18/t56-step6-monitor (go build). Risk low: read-only; the new permission is asked on the click and a refused source is named, never counted.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Read: the Setup / Monitor switch sits on top; Monitor (after setup) → it reads at once and shows six tiles, a heartbeat with one red bar, Needs attention (a drop, a sign-in around the tunnel from LT-DEMO-02, a device not seen, LT-DEMO-09 on client 2.28.96), the devices with LT-DEMO-09 marked no GSA group, and the traffic log.",
        "Beta, demo: type sharepoint in the traffic log filter — the rows narrow while the cursor stays in the box; Traffic and Action filters work; ⬇ CSV downloads the loaded transactions with device names.",
        "Beta, demo: 7 days and 30 days read again and the heartbeat turns to daily bars; Setup · 5 of 8 in the head returns to the board.",
        "Beta, Limon-IT: Monitor → the click asks NetworkAccess-Reports.Read.All once; with nothing tunnelled yet the device tile reads 0 / 2, the heartbeat says no traffic in this period, and Needs attention names CPC-mihai-2L8IB and MacBook Pro van Mihai as not seen.",
        "Beta, Limon-IT after the Mac or the Cloud PC connects: Read again — the device turns connected with its client version; the traffic log shows its Microsoft 365 transactions; Sign-ins through GSA rises above 0.",
        "Beta, an account without Global Secure Access Log Reader: Monitor — the traffic log and alerts say not read with Graph's answer; the heartbeat, devices and sign-ins still show.",
        "Beta, a tenant where setup is complete (every link ready, CA215 on): open the tool — it opens on Monitor by itself; pick Setup, Refresh — it stays on Setup.",
      ],
    },
    {
      n: 345,
      ws: "entra",
      title: "🌐 Global Secure Access — step 6 in two lanes, decided by what GSA has seen; Replace with the platform script; Not in scope kept in the tenant; a remediation outside the licence is a warning (T56 0.11.0, 0.13.1)",
      tools: ["Global Secure Access"],
      builds: [32806, 32809],
      risk: "medium",
      what: "js/gsa.js: clientLanes(raw, c) builds the Windows and macOS lanes — stages Deployed, Reaches, Allowed to run (remediation), Ran (Intune), Content and Profiles landed (macOS chain) and Connected, which decides — with actions per lane that never disappear (winswap, groups, scope-win; macscript or macprof, Show the chain, Check a Mac, scope-mac). seenIndex(raw) merges the networkAccess deviceReport (7 days) and the sign-ins marked isThroughGlobalSecureAccess (interactive and non-interactive, newest 2,000 each) by Entra device id; connectedGate counts the members of the deployment groups that were seen (a deployment for All devices or All users: the seen devices of that OS). scopeOut and scopeRecord read and write the ENCA settings record — the open extension nl.limonit.enca on the organization: t56WinOutAt, By, Why and t56MacOutAt, By, Why, written as empty strings when back in scope. Step 6 takes its status from the lanes, its detail no longer carries fix slots, the scope check counts the seen devices, the flow node shows Win and Mac chips. New FIXES winswap (backup, a GSA platform script reused or made, assigned to the remediation targets, then the remediation unassigned) and scope-win, scope-mac (Organization.ReadWrite.All). js/app.js: the read lists the group members (device id, name, join type) for both platforms, reads the device report, the sign-ins through GSA (GSA_READ + AuditLog.Read.All) and the ENCA settings record (404 is none); the runner, the forms, the preview options, Check a Mac copy, the demo. css/app.css: the lanes. tools/gsa.test.cjs: 6 new tests, 5 updated to the new rule.",
      why: "Mihai, 18 Oct: still stuck at step 6, he cannot complete it and see that everything is ok; and choosing mac leaves no Windows options. Read live on Limon-IT: the remediation (Business Premium, no Windows Enterprise) never ran, no device has ever sent traffic through GSA, and the board had no Windows action left. Mockup review/2026-10-18/t56-step6-monitor approved: go build. Risk medium: step 6 and the verdict now need the evidence of GSA itself, and there are two new writes (the swap, the settings record); every new read is read-only and either source may be refused without breaking the board. 32809 (0.13.1, Mihai 19 Oct: Business Premium has no licence for remediations, but they can be enabled and work — warn that it is the user's choice): the Allowed to run stage is Licence, amber, with that warning; the lane is never blocked · licence and Replace… is offered, not pushed; a remediation is offered beside the platform script when nothing is deployed.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Read: the step 6 node reads Win ✕ Mac ✕; the step's action column offers Show the lanes; the Windows lane reads nothing deployed with Create Windows remediation… and Not in scope…; the macOS lane shows the demo chain with Show the chain, Check a Mac and Not in scope….",
        "Beta, demo: Create Windows remediation → Apply; the Windows lane reads 1 of 2 Windows devices seen through GSA, partly connected, and Devices in scope lists LT-DEMO-01 connected and LT-DEMO-02 not connected. Open a macOS fix: the Windows actions are still in the Windows lane.",
        "Beta, demo: macOS → Not in scope… with a reason → Apply; the macOS lane reads not in scope with when, who and the reason, and offers Back in scope…; Apply that and the lane comes back.",
        "Beta, Limon-IT (Business Premium): Read — the Windows lane's Licence stage is amber, Not in the licence (Windows Business), with the warning that using the remediation is your choice; the lane word follows Connected (not connected / connected), never blocked · licence; Replace… sits under Stay inside the licence (optional), not as the primary button.",
        "Beta, Limon-IT, only if you choose the platform script: Replace… → the workspace shows the script, the Graph requests and the backup step. Apply: a JSON backup downloads, the platform script is assigned to INT-SEC-D-GSA-WIN-M365, and in Intune the remediation has no assignment and still exists.",
        "Beta, a Business Premium tenant with nothing deployed for Windows: the lane offers Create Windows script… as the fix and Create Windows remediation… beside it, marked outside the licence; that workspace shows the licence warning above Apply.",
        "Beta, Limon-IT, after the Cloud PC ran the platform script and signed in: Read again — the Windows lane reads 1 of 1 Windows device seen through GSA, connected, with the source under Last seen.",
        "Beta, Limon-IT: Check a Mac → Copy and run the three commands on the MacBook — the app, the system extension and the install log say whether the client is there.",
        "Beta, a tenant where AuditLog.Read.All is not consented or the device report is refused: Read — the lanes say not read and name the source; step 6 is never green on what was not read.",
        "Graph Explorer, Limon-IT after Not in scope: GET /v1.0/organization/{tenant id}/extensions/nl.limonit.enca returns t56MacOutAt, t56MacOutBy and t56MacOutWhy; after Back in scope they are empty strings.",
      ],
    },
    {
      n: 344,
      ws: "entra",
      title: "🔑 App access review — every app that can reach the tenant, and a decision for each (T60 0.1.1, R90)",
      tools: ["App access review"],
      builds: [32804, 32805],
      risk: "medium",
      what: "NEW js/appaccess.js (pure, io seam, tools/appaccess.test.cjs 13 tests): read() — service principals with appRoleAssignments expanded (any that comes back with exactly 20 is read again on its own: EXPAND_CAP, the expand stops at 20 without a next link), /v1.0/oauth2PermissionGrants, the resources' appRoles, applications with secrets, certificates and owners, directory role assignments and definitions, authorizationPolicy, adminConsentRequestPolicy, delegatedPermissionClassifications; readAudit() — /beta/reports/servicePrincipalSignInActivities and 30 days of Consent to application events. analyze() — per app the tier (t0, ep, high, med, low, info; first-match rules on type, API and permission; delegated capped at high; directory roles by template ID; Exchange.ManageAsApp with an Exchange role is mail), the origin (org, partner from PARTNERS_DEFAULT Limon-IT, Dovilo, CloudFellows, Microsoft by owner tenant or verified publisher Microsoft Corporation, third party verified or unverified; DEV_TOOLS judged as third party), caps, flags, the plain why, the suggested rung, the queue; plus kpi, matrix, settings and userGrants. apply() — approve, restrict (group assigned first, then appRoleAssignmentRequired), revoke, quarantine and enable (accountEnabled), remove (only when disabled; every grant revoked, then DELETE, an undo record kept), restore (deletedItems restore, grants given back); refuse() for ENCA's own registration (except approve) and Microsoft services (revoke, remove). The decision is a stamp line on the service principal's notes (withStamp keeps other text, 1024 at most). setAcrp() writes /v1.0/policies/adminConsentRequestPolicy with a group as reviewers. markdown(), csv(), permCsv(); parseCustomCsv() for the community table format; demo() of 17 apps. js/app.js: screen-aa (tabs Needs a decision, All apps, Who can do what, Users' own consents, Consent settings, Decisions; the app card with the five rungs and the group picker; typed confirm words QUARANTINE, RESTRICT, REVOKE, REMOVE; RunLedger; re-read after a write), TOOL_TABS, SCOPE_INFO (three new entries). index.html tile, screen, script tag, Help, roadmap R90, T61 next. js/workspaces.js: new group Applications, shortcut Apps. js/flat-icons.js: the toolAppAccess icon, and glyphs for ⌚ ⬇ 🧊 ✂ ↩ 🧾 💤 🔌 (buttons that started with them drew the grid fallback — about 80 ⬇ download buttons across the site among them). css aa- rules. New-EncaAppRegistration.ps1, js/onboard.js SCOPES and README gain AppRoleAssignment.ReadWrite.All, DelegatedPermissionGrant.ReadWrite.All and Policy.ReadWrite.ConsentRequest; PS_SHA256 recomputed. 32805 (0.1.1): analyze keeps the registrations per certificate thumbprint — creds.certs[].others, creds.sharedApps (with the rows' ids), model.sharedCerts; the sharedcert and duplicate flags carry lead + apps and the card draws them as links; Credentials lists each certificate with name, end date, thumbprint and the apps on it; report table Shared certificates; CSV names the apps; the fact-card caption is .aa-f>b:first-child so a bold role or certificate name stays inline.",
      why: "Mihai, 18 Oct: customers on Microsoft 365 Business Premium cannot use Defender for Cloud Apps app governance to see their apps and the risk; the community Export-MsIdAppConsentGrantReport produces a workbook to review but needs a clean, useful report. The review of that cmdlet (review/2026-10-18/t60-app-access) found it rates by permission name only, misses everything past 20 application permissions per app, loses failures, knows two Microsoft tenants and hides who consented. Mockup approved, then the decisions: decisions on the app's Notes, partners Limon-IT, Dovilo and CloudFellows, no Excel, the new scopes asked at the click and in the script, the consent settings written here, T60 in a new Applications group with the shortcut Apps, BETA.",
      carveout: "Main takes the tool whole (js/appaccess.js, the app.js block, the css, the index.html parts, workspaces, flat icon, Help, roadmap) and adds the three scopes to main's own New-EncaAppRegistration.ps1, js/onboard.js and README; do NOT copy beta's script or its PS_SHA256 — main's PS_SHA256 is recomputed from main's own script.",
      test: [
        "Beta, demo tenant, 03 → 🔌 Applications → 🔑 App access review: the tiles read 14 need a decision, 4 Tier 0, 8 high, 3 unverified, 4 unused, 2 with a client secret; Tier 0 and endpoint apps head the queue; Microsoft Graph Command Line Tools is in the queue labelled Microsoft · developer tool, SharePoint Online Web Client Extensibility is not.",
        "Beta, demo: open IntuneGet by UgurLabs.com — ENDPOINT, unverified publisher, the plain why says it can push to every device; 🧊 Quarantine asks for QUARANTINE typed, the ledger shows it done, the row reads Quarantined with the Notes stamp, and ↻ Enable again brings it back.",
        "Beta, demo: Teams automation (old) suggests Remove; 🧊 Quarantine it first, then 🗑 Remove (REMOVE typed) — it leaves the list and appears on Decisions with ↩ Restore; Restore brings it back with its grants given back. Remove is disabled on an app that is still enabled.",
        "Beta, demo: Consent settings shows admin consent requests off; switch them on with a group as reviewers and 30 days — the check turns green (simulated). Who can do what opens the app from a pill; 📝 Report, ⬇ CSV and ⬇ Permissions CSV download.",
        "Beta, cloudfellows.dev (Cloud Application Administrator active): Read — the counts match the Enterprise applications blade; an app with more than 20 application permissions shows its full count, not 20; ⌚ Last use & who consented fills last sign-in and the consents (Security Reader or Reports Reader needed).",
        "Beta, cloudfellows.dev: on a test app only, 🧊 Quarantine — Entra shows Enabled for users to sign in = No and the Notes line ENCA T60 · Quarantined with today's date; ↻ Enable again — Yes, the Notes line replaced, other Notes text kept.",
        "Beta, a customer tenant after the script is run again (or admin consent given once more): the three new permissions are in the registration; the first write asks for nothing more than the scopes of that rung.",
        "Beta 32805, demo: open Lokka MCP — the warning reads Its certificate also signs in as 5 other apps: followed by Graph automation (PowerShell), SharePoint automation, Teams automation, Teams automation (old) and Exchange automation as links; click one and that app's card opens. Credentials shows CN=CF-DEMO with its end date, thumbprint and the same five apps. 📝 Report has a Shared certificates table with the six registrations.",
        "Beta 32805, cloudfellows.dev: open Lokka MCP - CloudFellows.dev — the five others are Powershell Graph Connections, Powershell ExchangeOnline Connections, Powershell Teams Connections, Powershell Teams - CloudFellows.dev and Powershell SharePoint - CloudFellows.dev (the certificate is written as hex on three and as base64 on three; all six count); Triage DEVCF graph and Triage DEVCF exchange name each other.",
      ],
    },
    {
      n: 343,
      ws: "platform",
      title: "🔐 Sign-in card: Open Azure Cloud Shell and the registration's name; Device.ReadWrite.All out of the script (R89)",
      tools: ["Sign-in"],
      builds: [32803],
      risk: "medium",
      what: "js/connection.js paintRoute: four numbered steps — Open Azure Cloud Shell (CLOUD_SHELL_URL https://shell.azure.com/powershell, new tab), the registration's name (#connRegName, default ENCA; cleanName drops quotes, backticks, $ and control characters, 120 at most), the command (psLine(redirect, name) adds -AppName), ＋ Add; a delegated input listener rewrites the command as the name is typed and Copy takes the current name. New-EncaAppRegistration.ps1 and js/onboard.js SCOPES lose Device.ReadWrite.All (application-only in Microsoft Graph); PS_SHA256 recomputed. css: .conn-steps, .conn-name. Help 🪪. tools/signin-single.test.cjs (+1).",
      why: "Mihai, 18 Oct, running the card's command in Cloud Shell on keij-stefels.nl: it stopped with Delegated permission Device.ReadWrite.All not found on Microsoft Graph (the permission is application-only; T59 added it in 32707). With the list passed by hand the registration was made, single-tenant with both redirect URIs and assignment. Then: make sure the app on the login page has the right settings, and add a link button to open Cloud Shell.",
      carveout: "Production 327 already has a script without Device.ReadWrite.All (main kept its own scope list), so main needs the card part only: port paintRoute, psLine/cleanName/CLOUD_SHELL_URL, the input listener, the css and the Help line; do NOT copy beta's New-EncaAppRegistration.ps1 or its PS_SHA256 — main's PS_SHA256 stays the hash of main's own script.",
      test: [
        "Beta, a private window: the ⚙ panel shows four numbered steps; Open Azure Cloud Shell opens shell.azure.com in a new tab in PowerShell.",
        "Beta: type a name in Name of the registration — the command shows -AppName with that name as you type; a quote or $ typed in the name does not appear in the command; Copy the command copies the same line.",
        "Beta, Cloud Shell (PowerShell, no storage account) in a test tenant: paste the copied command — the hash check passes, step 2 no longer stops, the registration is created under the name typed, single-tenant, with you assigned; the summary prints the client ID and tenant ID.",
        "Beta: run the same command again with the same name — the registration is updated, not duplicated.",
      ],
    },
    {
      n: 341,
      ws: "entra",
      title: "🌐 Global Secure Access — the go-live checks: people or tokens, who is covered, Windows by what landed; tenant restrictions optional (T56 0.10.0)",
      tools: ["Global Secure Access"],
      builds: [32708],
      risk: "medium",
      what: "js/gsa.js: cnPolicies marks guard (block outside the compliant network, All resources), allApps and otherOut, and matches the well-known location id CN_ID (3d46dbda) without the locations read; verdict() is green only with a guard on, steps 2-6 ok and scopeCheck ok, else 'blocks people, not tokens' naming what is missing; step 7 counts guards only and carries the scope lines; scopeCheck compares the guard's include (groups by id, All users, users named, roles flagged) with the profile's assignment and the devices with the client. winCheck/winTable judge Windows by reach (raw.winGroups: devices by trustType, users) and landing (remediation and platform script runSummary, app installSummary); winLicence reads Windows Enterprise/Education/VDA service plan ids; on Business Premium the fix is winscript and a found remediation reads red. macOS out of scope when raw.macManaged is 0 and no script. proof() counts not applied with only the location unsatisfied as passed through GSA, inScope/inScopeVia, interactive/non-interactive. Step 3 shows assignmentRules or the platform reminder. Texts: macscript weekly file 109, profiles made by ENCA, the policies card. sysext add keeps the policy's name; otherSxLegacy. js/trv2.js: the card is folded and marked optional, outside the chain; plan refuses Enforce with nothing allowed (list or tenant allow-all partners); the card names the tenant's allow-all partners. js/app.js: the read adds platform script run summaries, app assignments and install summaries, the Windows groups' members, the managed-Mac count (Entra devices MacMDM/macOS isManaged); the winrem runner reuses the remediation step 6 found and writes every assignment back with remediation on, winscript reuses the found script; signal waits for the location; location reads first, POST only when missing with the portal route on refusal; the proof reads nonInteractiveUser beside interactive; the report-only template is Windows and macOS, the profile's groups, named CA215; download name 109; the TRv2 fold remembered. css: .gsa-scope, the TRv2 summary. Help: Go-live checks item. tools/gsa.test.cjs (31) and trv2.test.cjs (20).",
      why: "The go-live recheck of 18 Oct (review/2026-10-18/t56-golive): the board could read green while nobody could pass, the Windows step was green on a remediation assigned to an empty group that never ran, remediations were offered on Business Premium, the fix could make a second remediation, the proof missed non-interactive sign-ins. Mihai: tenant restrictions must be optional, for the rest go fix. Risk medium: the verdict and the Windows fix change; the new reads are read-only, the winrem runner now writes remediation on for existing assignments of the GSA remediation.",
      test: [
        "Beta, demo tenant, 03 → 🌐 Global Secure Access → Read: verdict says CA215 is not on; step 7 is partly with the line that CA215 would require the compliant network of g-internals while the profile is assigned to GSA-SEC-U-M365Profile-Pilot; the Who it reaches card shows the same warning.",
        "Beta, demo: step 6 shows the Windows table (Deployment not found, licence ✓ Windows 10/11 Enterprise) above the macOS chain; Create Windows remediation → Apply; the table then reads INT-SEC-D-GSA-WIN-M365 — 2 Windows devices and has not run on any device yet, step 6 stays partly.",
        "Beta, demo: the Tenant restrictions v2 card is folded with optional on it; open it, Set up, tick Enforce with no tenant listed — Apply is refused with Enforce needs at least one allowed tenant; untick Enforce and Apply writes the policy only (simulated).",
        "Beta, cloudfellows.dev, Read: step 6 Windows reads the remediation on INT-SEC-D-GSA-WIN-M365 — no Windows device and no user in it (the group is empty) and is not ready; macOS reads as before; the verdict names step 6; step 7 (after Read the policies) says CA215 would require the compliant network of CAB-SEC-U-Persona-Internals while the profile is on GSA-SEC-U-M365-ALL-PILOT.",
        "Beta, cloudfellows.dev: add one Entra-joined Windows test device to INT-SEC-D-GSA-WIN-M365, Read again — the table reads 1 Windows device; after the hourly run it reads 1 with the client (or the held line if remediation turns out to be off — then check the assignment in Intune).",
        "Beta, a Business Premium tenant without a GSA deployment: step 6 offers Create Windows platform script, the Windows table says Windows Business — remediations not licensed.",
        "Beta, cloudfellows.dev, step 7 with CA215 not counted as covered: Create it in report-only is offered only when no guard policy exists — on a tenant without one, the builder opens with Windows and macOS and the profile's group, report-only.",
        "Beta, any tenant with a report-only guard policy: Read the proof — the toast and step 8 name the sign-ins in the policies' scope and how many came through GSA, and step 8 says how many interactive and non-interactive were read.",
      ],
    },
    {
      n: 340,
      ws: "entra",
      title: "🧹 Entra device cleanup — stale devices out in two steps, ported from TUNO T25 (T59 0.1.0, R88)",
      tools: ["Entra device cleanup"],
      builds: [32707, 32802],
      risk: "medium",
      what: "0.2.0 (32802): the tiles and tabs became one lifecycle row (stages are the navigation, Re-enable / Never seen / Results as pills), padded card, rule chips, silence bars, real empty states. 0.1.0: New tool T59 in Workspace 03 (Directory objects, beside Groups; shortcut 🧹 Devices). js/devicecleanup.js is TUNO T25's logic unchanged behind an io seam — buckets, apply with a fresh read before and a read-back after every write (woke up skipped, re-enabled since refused at delete, 403 explained as the directory-role gate), afterResults, the Markdown report, a demo estate. app.js draws it with ENCA components: Verdict tiles that open their tab, a tab strip, .selbar with DELETE typed to arm, RunLedger on Results, editable thresholds. New scope Device.ReadWrite.All: New-EncaAppRegistration.ps1, js/onboard.js SCOPES, the permissions catalog and SECURITY.md in the same commit. tools/devicecleanup.test.cjs.",
      why: "Mihai, 18 Oct: next port T25 from TUNO to the ENCA 03 Entra workspace; the layout from the mockup. Risk medium: it disables and deletes directory devices — every write is re-read first and read back, delete only what is disabled, typed DELETE.",
      test: [
        "Beta, demo tenant, 03 → 🧹 Entra device cleanup: tiles 4 active · 3 stale · 1 waiting · 2 delete · 1 never seen; each tile opens its tab. Tick two under ① and Disable: the ledger lists both, they turn disabled, and they appear under ↩ Re-enable at once. Re-enable one. Under ② the button stays disabled until DELETE is typed; delete one and it leaves every tab. 📝 Report has the actions with outcomes.",
        "Beta, demo: change the thresholds to 40 / 100 — the stages follow without a new read; set disable to 300 and the delete box moves to 301 by itself; the Stale stage then says nothing to disable and names the quietest device.",
        "Beta, cloudfellows.dev as Cloud Device Administrator: Read — the tile counts match Entra → Devices filtered on last activity. Disable one stale test device: Graph asks for Device.ReadWrite.All once; the row turns disabled; Entra shows it disabled. Re-enable it: enabled again.",
        "Beta, cloudfellows.dev signed in WITHOUT a device role (e.g. Security Reader + consent): Disable — the row fails and says it is the directory-role gate, not missing consent.",
        "Beta, a disabled test device past the threshold: re-enable it in the portal after the read, then Delete it here — refused, somebody wants it back. Never delete a real device during the test.",
      ],
    },
    {
      n: 339,
      ws: "ca",
      title: "🛡 Security defaults detected, and the way across to a baseline (T10 2.11.0) — Import lands Report-only and creates the E-Admins (T06 2.14.0)",
      tools: ["Baseline", "Import", "Overview"],
      builds: [32706],
      risk: "medium",
      what: "js/secdefaults.js (new, pure apart from read): verdict over the setting, the policy count and the P1 evidence; coverage of the four protections security defaults gives (MFA all users, MFA for the Global Administrator role, legacy authentication, device code flow) plus the break-glass group; the start card, the switch band and the three confirmations. app.js: the setting and the licences are read in loadFromGraph; openBaseline compares an empty tenant instead of returning; the card in blSecDef and on the Overview; sdPick opens Import on Report-only (CloudFellows ZIP or Joey from the repository); sdSwitchRun, sdBackRun and sdTurnOnRun write through Graph.gpatch with read-backs and a never-neither rule; demo tenants ?demo=sd and ?demo=sdro. js/import.js: opts.landState and opts.sdOn, and the softState fallback in afterCreate. js/eadminsData.js (new): the six E-Admins policies read from cloudfellows.dev 2026-10-18 as a raw bundle; imEaAddBundled through Importer.mergeShared, automatic on the Joey import paths.",
      why: "Mihai, 18 Oct, from a screenshot of Baseline on a security-defaults tenant: nothing gets loaded — detect security defaults and offer to deploy one of the baselines; on the mockup he chose that only the replacing set goes On and that ENCA writes the setting itself, and asked that the E-Admins be created with the Joey baseline from configs ENCA carries rather than imported from a ZIP. Risk medium: the switch turns security defaults off in a live tenant. Not yet run against a real security-defaults tenant; Microsoft Learn does not state outright that Graph accepts a Report-only policy while security defaults is on, which the landing fallback covers.",
      test: [
        "Beta, ?demo=sd: Home shows the card (Security defaults ON, P1, 0 policies) and the Overview status line names security defaults; Baseline shows the same card above the full catalog as Missing, and Import baseline counts the catalog.",
        "Beta, ?demo=sd, Joey Verlinden on the card: Import opens with Land new policies as on Report-only and the six E-Admins listed; Import 6 reports them created Off (simulated).",
        "Beta, ?demo=sdro: the band lists MFA for every user (CA000), MFA for admins (CA100), legacy (CA002), device code (CA004) and Break-glass excluded with 2 members, all ticked; Switch opens the confirmation with CA100 flagged for its strength; the run shows security defaults Off, four policies On, the setting read back; the band becomes Switched from security defaults with Back to security defaults; Back reverses it and the band returns to the switch.",
        "Beta, a real tenant with security defaults ON and no policies (a fresh trial tenant): sign-in shows the card with the setting read; Choose ZIP with the CloudFellows backup lands the policies Report-only — or, if Entra refuses Report-only while security defaults is on, Off with that said per policy in the import report.",
        "Beta, the same tenant after step one, break-glass group with members: the switch turns security defaults Off in Entra (Entra ID, Overview, Properties, Manage security defaults reads Disabled), the five replacing policies are On, everything else unchanged; then Back to security defaults restores both — and if Entra refuses security defaults, the five are On again.",
        "Beta, a tenant with security defaults OFF and policies: no card, no band, nothing changed on the Baseline screen.",
        "Beta, Joey Verlinden import from the Baseline screen in a tenant without the E-Admins: the six are ticked, the break-glass group reads CA-BreakGlassAccounts - Exclude, the strength Phishing-resistant MFA + TAP is created or reused, all six land Off.",
      ],
    },
    {
      n: 338,
      ws: "entra",
      title: "🌐 Global Secure Access — step 7 always has a next step; Who it reaches replaces the groups card (T56 0.9.1)",
      tools: ["Global Secure Access"],
      builds: [32705],
      risk: "low",
      what: "js/gsa.js: the policy link says what is not known and carries a sub line per state; render adds Read the policies (data-gsareadpols, also on the policies card), Create it in report-only (data-gsabuild) and Step 8 for report-only; model.reachInfo (profile: all users / groups / backing; policies: include groups and All users; devices: Intune targets per OS with the macOS group counts) and the device groups in groupIds; the card is Who Global Secure Access reaches (three questions, users/devices chips, one summary line). js/app.js: the read runs loadFromGraph(true) and reopens T56 on step 7; the build opens openBuilder from a CA200-BLOCK template as a new draft in report-only. css: .gsa-who.",
      why: "Mihai, 17 Oct: step 7 said load Policies first and nothing ENCA can do — nothing happens; the groups card said all users and then no group yet. Risk low: one read, and the builder only opens a draft.",
      test: [
        "Beta, signed in, Policies NOT loaded: 03 → Global Secure Access → step 7 says the policies are not read; Read the policies shows the loading screen and comes back to step 7 with the policies counted.",
        "Beta, a tenant without a compliant-network policy: step 7 offers Create it in report-only; the Policy builder opens as a new policy, report-only, all users, all resources, block, the compliant network and the two Intune apps excluded; nothing is written until Save.",
        "Beta, cloudfellows.dev: the Who it reaches card reads the profile on GSA-SEC-U-M365-ALL-PILOT (Assignment required is on there, read 18 Oct), the policies' include after the read, macOS INT-SEC-D-GSA-MAC-M365 with 0 managed Macs, Windows INT-SEC-D-GSA-WIN-M365 (remediation), and the line on top says nobody's traffic goes through yet; 👥 Groups → Used by GSA lists both device groups.",
      ],
    },
    {
      n: 337,
      ws: "entra",
      title: "🌐 Global Secure Access — the macOS chain: the three profiles come with the script, every object checked by content, reach and landing, with repair (T56 0.8.0–0.9.0)",
      tools: ["Global Secure Access"],
      builds: [32703, 32704],
      risk: "medium",
      what: "0.9.0 (32704): Gsa.macCheck finds the script and the three profiles by content (any name), compares each with Learn, checks it reaches the script's Macs and reads what landed, plus the script's groups (devices, Intune-managed Macs); the step-6 table offers one fix per row from Gsa.macFixPlan — create, repair (next version, old unassigned and renamed [DEPRECATED], never deleted), assign, or add the GSA ids to a policy that already sets system extensions (backup + PUT, Graph.gput). The macOS script is the baseline v1.2 byte for byte (signature check, macOS 14+, waits for both approvals, weekly, file 109); the client settings name carries D. 0.8.0 (32703): js/gsa.js: names() gains sysext/proxy/settings (devcf's names without [OPTIONAL]); macSysextBody (settings catalog, Allowed System Extensions for com.microsoft.globalsecureaccess.tunnel + com.microsoft.globalsecureaccess, team UBF8T346G9, user overrides allowed — devcf's own shape), macProxyBody (macOSCustomConfiguration, Learn's com.apple.vpn.managed plist verbatim, deviceChannel), macSettingsBody (macOSCustomAppConfiguration, bundleId com.microsoft.globalsecureaccess, the four Hide… keys; lock = all hidden); MAC_PROFILES + wantProfile (unset tick = missing or unassigned); the client link's fix2 is macscript without a script, macprof with one but a profile missing or unassigned; macProfiles() marks a consolidated system-extension policy found by its settings; preview shows the script, each ticked profile and the requests; FIXES.macscript rewritten, FIXES.macprof new. js/app.js: the read opens the settings of macOS system-extension policies; the workspace form has the three ticks (found ones named, reused) and the lock tick; the runner makes or reuses each ticked profile and assigns it (both /assign routes replace, so what is there is kept); macprof skips the script; demo applies. tools/gsa.test.cjs covers the shapes against Learn.",
      why: "Mihai, 17 Oct: after creating the macOS install script the three configuration profiles were missing and nothing was offered. Risk medium: writes to Intune only, idempotent by read and by name; a Mac already in the group gets the profiles at its next check-in, which is what the client needs.",
      test: [
        "Beta, demo tenant, step 6: the macOS chain table shows 4 problems — the script without a signature check (Repair…), System Extensions assigned to nobody (Assign…), the proxy as Learn, the client settings with the .plist domain and a U name (Repair…) — and that the group has no managed Mac. Apply each fix: the table ends at 1 problem (the group), the client settings v3.2 named D and lock-down kept, the old ones listed as DEPRECATED under also.",
        "Beta, signed in to cloudfellows.dev: Read — the table reads the v1.2 script, the System Extensions policy as the baseline's own and reaching the script's Macs through All devices with a filter, the proxy and the client settings v3.2 as Learn, and one problem: INT-SEC-D-GSA-MAC-M365 has no Intune-managed Mac.",
        "Beta, a test tenant with an old ENCA once-only script and a profile with a .plist domain: Repair each — in Intune the new version is assigned to the same groups, the old one is unassigned and named [DEPRECATED] with the reason in its description; nothing was deleted.",
        "Beta, a tenant where an MDE policy allows system extensions but not the GSA ones: step 6 says another policy sets the payload; Fix system extensions downloads a backup and the policy afterwards lists the two GSA ids beside its own (check in Intune that its other settings are unchanged). If the PUT is refused, write down the message.",
        "Beta, demo tenant, 03 → Global Secure Access → step 6: the fix reads Create macOS script and profiles…; the workspace lists the three profiles, system extensions ticked (demo: unassigned), proxy and settings unticked (assigned); the What it sends tabs are the script, System extensions (JSON) and Graph requests; ticking Client settings adds its tab; Apply logs created/assigned per profile and the step reads macOS profiles all assigned.",
        "Beta, demo tenant: after that Apply the step offers no macOS fix; remove the demo's shell script by a Refresh and the macscript fix returns.",
        "Beta, signed in to cloudfellows.dev: Read — step 6 reads system extensions assigned (in the baseline's System Extensions policy) once that policy is assigned, or NOT ASSIGNED with the same note while it is not; the Intune card lists MACOS - DCP - Device Security - D - System Extensions - R26.10 - v1.0 as Profile · system extensions.",
        "Beta, a tenant without the profiles (or cloudfellows.dev with the two [OPTIONAL] profiles unassigned): Create macOS profiles… → Apply. In Intune → Devices → macOS → Configuration the three (or the reused two plus one new) are assigned to INT-SEC-D-GSA-MAC-M365; the custom profile's XML equals Learn's; the preference file's domain is com.microsoft.globalsecureaccess (Learn), not …globalsecureaccess.plist as devcf's reads.",
        "Beta, a Mac in that group with the client installed: no system-extension or proxy approval prompt after the next check-in; the tray shows Pause and Disable (pilot) or none of the four (lock).",
      ],
    },
    {
      n: 336,
      ws: "entra",
      title: "🚧 Global Secure Access — tenant restrictions v2 (optional): only the tenants you allow on your devices (T56 0.7.0)",
      tools: ["Global Secure Access"],
      builds: [32702],
      risk: "high",
      what: "js/trv2.js (new, pure): state, plan (partner creates and allow-all, then the default block-all, then universal tenant restrictions only when Enforce is ticked; requires chain), backup of what the run touches, undoOps, verdict, card, preview, FIX. js/gsa.js: Trv2 picked up when loaded (required in node), fix trv2 with its preview, the card between the step and the workspaces, demo cross-tenant data. js/app.js: GSA_READ + Policy.Read.All; the read of the cross-tenant default, partners and networkAccess crossTenantAccess; trv2Settings per tenant in localStorage (enca-trv2:<tenant>), domain look-up, CSV import and export, keep-partner and Microsoft-accounts ticks, runTrv2 with the backup download first, trv2PutBack. index.html: script tag, Help bullet and the reads line. tools/trv2.test.cjs (18).",
      why: "Mihai, 17 Oct: the GSA setup needs tenant restrictions v2, allowing Limon-IT and CloudFellows (both tenants); create it and prepare to deploy later. Risk high: once enforced it decides which accounts can sign in on every device in the traffic profile's group, there is no report-only mode, and three Graph shapes are unverified — PATCH with tenantRestrictions null to clear (Put back), POST partners with only a tenantId, AllApplications as the allow-all application target.",
      test: [
        "Beta, demo tenant, 03 → Global Secure Access: the Tenant restrictions v2 card says not set up and one partner inherits the default; Set up opens the workspace; Look up and add contoso.com adds a row; Apply without Enforce downloads a backup and logs a partner create, an allow and the default block, simulated; the card then says policy only.",
        "Beta, demo tenant: tick Enforce and Apply — the card says enforced; ↩ Put back with the downloaded backup turns enforcement off first and the card returns to its earlier state.",
        "Beta, signed in to cloudfellows.dev as Security Administrator: Read the tenant — the card lists the existing partners that inherit the default (compare with Entra → External Identities → Cross-tenant access settings → Organizational settings). Import docs/trv2-allowed-msp.csv (untracked): limon-it.nl and trianti.nl resolve by look-up, the cloudfellows.dev row is refused as the tenant itself.",
        "Beta, cloudfellows.dev, Enforce NOT ticked: Apply. In the admin center the two partners read Tenant restrictions customized, all users and applications allowed, and Default settings → Tenant restrictions reads blocked. Read back one partner in Graph Explorer: the application target is AllApplications — if not, stop and send it to Claude.",
        "Beta, cloudfellows.dev, traffic profile on a pilot group with one test device: tick Enforce and Apply. On that device an account of a third tenant gets Access blocked; a limon-it.nl account, a trianti.nl account and a cloudfellows.dev account sign in.",
        "Beta, cloudfellows.dev: ↩ Put back with the backup — universal tenant restrictions off, the default as before, the two added partners removed. If the PATCH with null is refused, write down the message: Put back then needs the explicit default shape.",
      ],
    },
    {
      n: 335,
      ws: "pim",
      title: "🧾 Designer — three steps, tier cards in words, the variant beside them (T50 0.2.0)",
      tools: ["Designer — a customer's variant"],
      builds: [32615],
      risk: "low",
      what: "js/app.js pdsPaint: steps, Role tiers / Group membership card grids with summary and folded settings, side panel; change/reset handlers take the tier from data-pdscard. css .pds-*. Help bullet. js/pimdesigner.js untouched.",
      why: "Mihai, 14 Oct: the designer should be better described, and the layout should be much nicer than this. Mockup board 2. Risk low: same variant model, same storage, same validation.",
      test: [
        "Beta, demo tenant, 02 → Designer: three steps above; Role tiers shows Tier0, Tier1, Tier2, Reader as cards with activation, asks for, approval and eligible for in words; Group membership the membership templates.",
        "Beta, demo tenant: Change Tier1 → Activation 4 hours — the card is marked 1 changed, the side panel lists Tier1 Activation 2 h → 4 h; ↺ framework resets it.",
        "Beta, demo tenant: switch Approval on in Tier2 without an approver group — the side panel says it is refused and why; Use for this tenant stays disabled.",
        "Beta, narrow window (≤ 900 px): steps and cards stack in one column, the side panel follows.",
      ],
    },
    {
      n: 334,
      ws: "pim",
      title: "🎖 Roles & assignments — a failed build or draw is said on screen, the instance reads capped (T49 0.2.1)",
      tools: ["Roles & assignments"],
      builds: [32614],
      risk: "medium",
      what: "js/app.js: prrRebuild try/catch → prr.err; prrPaint wraps PimRoles.render; profile label fallback; PRR_CAP 20000 on roleEligibilityScheduleInstances and roleAssignmentScheduleInstances.",
      why: "Mihai, 14 Oct: T49 crashes; verify in devcf and fix — then: do not focus on those errors for now. The cause is not established (the devcf reads page normally, the demo runs clean); this makes any failure visible instead of a frozen spinner, which is what is needed to find it. Risk medium: the crash itself is not yet explained.",
      test: [
        "Beta, demo tenant: Roles & assignments → Read who holds what — the tiles and the four tabs as before.",
        "Beta, signed in to cloudfellows.dev: Read who holds what — either the result, or a red line naming what failed (send it to Claude); the spinner never stays after the read ends.",
        "Beta, signed in: ☁ Azure RBAC tab and Read again still work after a failed build.",
      ],
    },
    {
      n: 333,
      ws: "pim",
      title: "🛡 Administrative units in PIM-buddy — the baseline's units first, the tenant's own below (T27 2.1.0)",
      tools: ["Administrative units"],
      builds: [32613],
      risk: "low",
      what: "js/app.js: prlBaselineUnits / prlBaselineNames / prlBaselineTable (restricted units from PimRmau.check, regional AUs from PimBaseline.compareRegions), shown at the top of prlPanel; renderRmau in the PIM lens renders PIM-baseline units in this tenant, then Already in this tenant with ruInvPanel; the card markup moved into ruCardHtml (Workspace 01 renders as before). css .prl-base, h3.prl-sec. Help bullet; the workspaces Help sentence on header colours corrected.",
      why: "Mihai, 14 Oct: administrative units in the PIM-buddy section should focus first on PIM-baseline related AU or RMAU, then below the AU or RMAU already in the tenant. Mockup board 3. Risk low: reads only; the existing Preview and Deploy write paths are untouched.",
      test: [
        "Beta, demo tenant, 02, profile Large · multi-region: Administrative units → Read — From the PIM baseline lists the regional AUs with Present / Differs / Missing; under it PIM-baseline units in this tenant, then Already in this tenant with the inventory.",
        "Beta, demo tenant, 02, profile Large · one region: the table lists AU-RM-Executives; Small business says the profile expects no unit.",
        "Beta, demo tenant, 01: Administrative units looks as before (vault panels, map, every card in one grid).",
        "Beta, signed in to cloudfellows.dev, 02 with the regions file loaded: each region's three units are listed with their real state.",
      ],
    },
    {
      n: 332,
      ws: "pim",
      title: "🔗 User or Group analyzer — the PIM-SG groups in scope (this design / every design) and one-click groups in the PIM lens (T19 1.7.0)",
      tools: ["User or Group analyzer"],
      builds: [32612],
      risk: "low",
      what: "js/app.js: guLimit values pim / pimall in sweepGroupUse with guNamedGroups (exact-name lookup) and an absent-names toast; openGroupUse picks pim from Workspace 02 (guWsLast); plxBody whois lists the PIM-SG groups holding a role as data-lenswhopick chips, handled in plxClick. index.html: the two options and a Help line.",
      why: "Mihai, 14 Oct: T19 PIM lens focus is not working; the groups in scope should also have the PIM groups, just as T12. Mockup board 6. Risk low: reads only.",
      test: [
        "Beta, demo tenant, 02 PIM-buddy → Who holds what (T19): Groups in scope reads Only the PIM-SG groups — this tenant's design; the PIM lens → Read who holds what lists the PIM-SG groups that hold a role; clicking one fills the box and shows its roles.",
        "Beta, demo tenant: switch to 01 and open T19 — Groups in scope is back on Only groups used by Conditional Access.",
        "Beta, signed in to cloudfellows.dev, 02: Sweep tenant with this tenant's design sweeps only PIM-SG groups; a design group the tenant lacks is named in the toast, not swept.",
        "Beta, signed in: every design sweeps more groups than this tenant's design when the profile is Small business.",
      ],
    },
    {
      n: 331,
      ws: "pim",
      title: "👥 PIM groups per baseline design — Design picker Small · Large one region · Multi-region · Every design, S/L/M badges (T12 6.1.0)",
      tools: ["Conditional Access groups"],
      builds: [32611],
      risk: "low",
      what: "js/app.js: cgDesign, cgDesignIds, cgDesignOf, cgPimDesigns, cgPimAllNames (the scan's expect list and the demo rows), cgView (rows, counts, coverage, frame and otherOnly of the chosen design; used by renderSummary and cgModel), cgSyncDesignSel and the #cgDesign change handler; usesOf's PIM badge over every design. js/groupsview.js: ctx.designsOf badges in the Used by cell. js/cagroups.js: the pim lead and the other-design note. index.html: #cgDesignWrap after Scope, Help line. css: .cgg-dsg. tools/cagroups-design.test.cjs (3).",
      why: "Mihai, 14 Oct: T12 PIM groups should be able to focus on the groups per baseline option — small, large, multi. Mockup board 4. Risk low: reads the same groups (the union of three name lists instead of one), writes nothing.",
      test: [
        "Offline: node --test tools/cagroups-design.test.cjs green.",
        "Beta, demo tenant, 02 PIM-buddy → PIM groups: Design opens on the profile PIM baseline has (marked this tenant); Small business shows 17 rows, Large one region 45, Large multi-region 27, Every design 50; the chips and the percentage follow.",
        "Beta, demo tenant: with Small business picked the header names the framework release and Small business and says how many PIM-SG groups belong to another design only.",
        "Beta, signed in to cloudfellows.dev: one read, then switching design makes no new Graph request (network tab), and PIM-SG-M365-GlobalAdmin carries S, L and M.",
        "Beta: Scope Used by CA policies or All groups hides the Design picker.",
      ],
    },
    {
      n: 329,
      ws: "pim",
      title: "📄 PIM documentation — the handover generated from the catalog, readable on the page, Markdown with the diagrams embedded (T58 0.1.0, R87)",
      tools: ["PIM documentation"],
      builds: [32609, 32617],
      risk: "low",
      what: "js/pimdoc.js (new, pure): CHAPTERS (twelve, with a when() per profile), build({cat, PB, tenant, regions, res, chapters, demo, build}) → {meta, chapters[{id, n, title, blocks}]} of plain blocks (p, h, ul, ol, table, note, svg); render(doc) → the page (contents list, chapters with ids, tables as xt-tbl, SVG inline); toMd(doc) → one Markdown file (document-control table, contents page with anchors, diagrams as data URIs). Three diagrams: flowSvg (role path and access-group path), tiersSvg, regionSvg. foundRole / foundGroup write the In this tenant column from PimBaseline.compare rows and groups. js/app.js: the pdc block (openPimDoc, pdcPaint, pdcReset from pmbReset; the source seg, the chapter picker with Select all / Deselect all, the contents jump, ⤓ Markdown through downloadText); HISTORY_SCREENS and the tool-name list. index.html: tile toolPimDoc (BETA), screen-pimdoc, Help section, roadmap R87, Tool numbers text to T58 / T59 next. js/workspaces.js roster (under 🧬 Compare, after 📋 PIM report), PIM_ONLY, rail shortcut 📄 Docs; js/flat-icons.js; css .pdoc-*. tools/pimdoc.test.cjs. 32617 (0.2.0, reading layout, option A of the mockup): render() draws a contents rail (pdoc-rail, pdoc-rl, sticky at --sticky-tools) beside a sheet (pdoc-sheet) that opens on a cover (pdoc-cover: eyebrow, the tenant, a dl of framework / profile / modules / source / authored in / regions / chapters); a pdoc-bar details for under 900px; each chapter its blurb and a footer of data-pdcto Back to the top / Next; flowSvg: boxMid, the Administrator spanning both lanes, straight arrows with labels above, the access path dashed. app.js: PDC_HEAD one line + About this tool, pdcNote without the source, the jump handler takes data-pdcjump and data-pdcto and folds the bar, pdcSpy (a passive scroll listener, one per frame) marks the rail and names the chapter in the bar. css/app.css: the .pdoc block rewritten.",
      why: "Mihai, 14 Oct: the create documentation for PIM should be accessible in PIM-buddy, maybe a dedicated tool; T58 should also be completely readable online. Risk low: reads nothing of its own and writes nothing; it only reads the catalog and what T48 already read.",
      test: [
        "32617, beta, demo tenant, 1440 wide: 02 → 📄 PIM documentation shows the contents rail on the left and the sheet on the right; the sheet opens on the tenant with Framework / Profile / Modules / Source / Authored in / Regions / Chapters, not a second PIM documentation heading. Scroll down: the rail stays under the toolbar and its marked chapter follows the one being read; click 07 in the rail and the page lands on Exchange, SharePoint and Purview RBAC with its heading clear of the toolbar. Every chapter ends on Back to the top and Next.",
        "32617, beta, 390 wide (iPhone or a narrow window): no rail; a contents bar under the toolbar reads 01 / 12 The model, follows the scroll, and opening it lists the chapters — picking one folds it and jumps.",
        "32617: How access flows — one Administrator box spanning both lanes, active member and eligible member above straight arrows, the access-group arrow dashed; the same in the downloaded Markdown on the iPad.",
        "32617: the head is one line; About this tool opens the rest. Light and dark theme: the marked rail entry and the sheet stay readable.",
        "Offline: node --test tools/pimdoc.test.cjs green — every profile builds, the multi profile has a Regions chapter and the small one does not, toMd carries one data: image per diagram and a contents entry per chapter, render escapes a hostile group name.",
        "Beta, demo tenant, 02 PIM-buddy → 📄 PIM documentation: the page opens on As designed with twelve chapters (Large · multi-region) and three diagrams drawn; the contents list jumps to each chapter.",
        "Beta, demo tenant: 📑 Chapters → untick everything but The model and Tiers → the page shows two chapters numbered 1 and 2; ☑ Select all brings the twelve back.",
        "Beta, demo tenant: + as found is disabled before 🧬 PIM baseline has read; ▶ Read the tenant opens 🧬 PIM baseline; after its read, + as found adds an In this tenant column whose Global Administrator row names the demo's differences.",
        "Beta, demo tenant: ⤓ Markdown downloads ENCA-pim-documentation-…md; opened in a Markdown reader on the iPad it shows the contents page and the three diagrams.",
        "Beta, signed in, Small business profile picked on 🧬 PIM baseline: the document says Small business, has no Regions chapter, and the tiers table shows Tier 0 without approval except Global Administrator's own override.",
      ],
      files: ["js/pimdoc.js", "js/app.js", "js/workspaces.js", "js/flat-icons.js", "css/app.css", "tools/pimdoc.test.cjs", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 328,
      ws: "pim",
      title: "🧬 PIM baseline as pages — Roles, PIM groups, Regions, Intune, catalog, samples — with Select all / Deselect all (T48 1.1.0)",
      tools: ["PIM baseline"],
      builds: [32608],
      risk: "low",
      what: "TAB_HOSTS.pimbaseline in js/app.js: six pages on the tool-tabs bar (Regions only when the profile has regions, Update the catalog only on the baseline tenant or in the demo; pmbTabsSync rebuilds the strip when that set changes and writes the counts). pmbPage is the page, pmbFilter only the status filter; openPimBaseline(asIntune, page). js/pimbaseline.js: chips(res, filter, page) with per-page counts, rowsOf / groupsOf as the one filter judgement, visibleKeys(res, {page, filter, q}) for ☑ Select all / ☐ Deselect all (data-pmbselall / data-pmbselnone, .pmb-selbar), render(res, {page}) draws one table per page (page absent = both, the shape the tests read). The row tick updates the bar’s n of m without a repaint.",
      why: "Mihai, 14 Oct: the layout of T48 needs some adjustment — select all / unselect all at the top of the ticked items, dedicated pages for Roles and PIM groups. Risk low: presentation and selection only; nothing read or written differently, Deploy receives the same selection set.",
      test: [
        "Offline: node --test tools/*.test.cjs green (pimbaseline.test.cjs reads render without a page and still gets both tables).",
        "Beta, demo tenant, 02 PIM-buddy → 🧬 PIM baseline: the tab strip reads Roles · PIM groups · Regions · Intune RBAC · Update the catalog · EasyPIM samples; after ▶ Read the Roles and PIM groups tabs carry counts and the status chips show the counts of the open page only (no Groups chip).",
        "Beta, demo tenant, Roles page: ☐ Deselect all drops Import N ticked by the roles count; ☑ Select all brings it back; on the Differs chip ☑ Select all ticks only the differing rows (the button says how many).",
        "Beta, demo tenant: tick two groups on PIM groups, switch to Roles and back — the ticks are still there and Import N ticked counted them while on Roles.",
        "Beta, demo tenant: 📱 Intune RBAC tile opens the screen on the Intune page with T53’s head; the 🧬 PIM baseline tile afterwards lands on Roles.",
        "Beta, signed in to a tenant that is not cloudfellows.dev, Small business profile: no Regions tab and no Update the catalog tab; switch to Large · multi-region — the Regions tab appears without reopening the tool.",
      ],
      files: ["js/app.js", "js/pimbaseline.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 327,
      ws: "pim",
      title: "🧬 Framework 5.0 — role activation first, the -Direct groups folded (T48 1.0.0, T51 0.6.0, T55 0.3.0, R86)",
      tools: ["PIM baseline", "Deploy", "PIM report"],
      builds: [32607],
      risk: "high",
      what: "js/pimBaselineData.js release 5.0: every job group and the two regional job groups are GroupMember role groups (path direct), eligible per role; SecOps-, Ops-, AppOps- and Collab-Direct removed and their roles moved to the job group; a retired list names them with the group they went into; GroupJITTier1 kept only to read 4.1 tenants. js/pimbaseline.js: slow path (a role group or regional group holding a role active) and retired groups reported apart from permanent active outside the framework; retiredGroups in the result, the UI and the Markdown. js/pimdeploy.js: eligibilities for every role group; section migrate (default off, only when ticked) removes an active assignment or a retired group's assignment only when the read already shows its replacement; never deletes a group. js/pimplan.js: the backup carries restores for every removal, Put back recreates them as adminAssign requests and refuses anything else. js/pimreport.js: findings slow-path and retired-groups; the regional verdict follows the path. tools/pim regenerated. Help (T48, T51, T55) and roadmap R86.",
      why: "Mihai, 13 and 14 Oct: activate the role, not the membership, as much as possible (Our Cloud Network article; Microsoft Learn: option 1 for Exchange, SharePoint and Purview roles); fold the -Direct groups into the job groups; devcf only tests the configuration, PIM-buddy is where it is built. Risk high: Deploy now plans eligibilities where it used to plan permanent active assignments, and the migration section removes assignments.",
      test: [
        "Offline: node tools/pim/generate.cjs (no change after the release script ran) and node --test tools/*.test.cjs green, including pimbaseline, pimdeploy and pimreport.",
        "Beta, demo tenant: 🧬 PIM baseline on Large · multi-region shows SecOps-Direct and Ops-Direct as retired with the roles they hold, Intune Administrator as held ACTIVE by PIM-SG-M365-Ops (4.1 slow path), and no -Direct group under groups outside the framework.",
        "Beta, demo tenant: 📋 PIM report lists the findings Slow path (high) and Retired groups (medium), each opening 🚀 Deploy.",
        "cloudfellows.dev, Privileged Role Administrator active: 🚀 Deploy Preview with Group assignments ticked shows eligibility requests for the job groups and no roleAssignmentScheduleRequests; Preview with 5.0 migration ticked before the first run shows zero removals and the waiting findings.",
        "cloudfellows.dev after the first run: Preview with 5.0 migration ticked lists one removal per active assignment whose eligibility exists, and the retired groups' eligibilities whose job group now holds the role; ⬇ Backup contains them under restores; apply; 🧬 PIM baseline shows no slow path left.",
        "cloudfellows.dev: ↩ Put back on that backup previews adminAssign requests only for the removed assignments (do not apply unless rolling back).",
        "Live proof: a test adm- account as active member of PIM-SG-M365-Ops activates User Administrator from My roles and can edit a user within a minute; remove it afterwards.",
      ],
      files: ["js/pimBaselineData.js", "js/pimbaseline.js", "js/pimdeploy.js", "js/pimplan.js", "js/pimreport.js", "tools/pimbaseline.test.cjs", "tools/pimdeploy.test.cjs", "tools/pimreport.test.cjs", "tools/pim/*", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 321,
      ws: "pim",
      title: "🧬 Framework 4.1 — Exchange and Purview covered, the workload roles, Global Secure Access, the script where no API exists (T48 0.9.0, T51 0.5.0, R83)",
      tools: ["PIM baseline", "Deploy"],
      builds: [32510],
      risk: "high",
      what: "Catalog 4.1 in js/pimBaselineData.js: twenty workload roles (template ids read from cloudfellows.dev on 13 Oct 2026), the groups PIM-SG-M365-Teams (job), -Backup-Direct, -Billing and -Data-Direct, five Purview access groups PIM-SG-PUR-*, PIM-SG-EXO-Recipients-REG and -HelpDesk-REG in the region template, Global Secure Access in every design, the multi-region profile explicit without Azure, the naming rule with PUR/SPO/FAB/PP, the stale first-line and Tier 0 texts corrected. js/pimscript.js (new, pure): the script Deploy generates where no API exists — Exchange role groups, Purview role groups, the regional Exchange scopes — with the object ids filled in, plus readOutcome for the file it writes. js/pimdeploy.js: a purview section, P.scripts, By hand lines without any repository .ps1. app.js: ⬇ Script buttons and 📂 Import outcome on the Preview panel. pimbaseline.js carries and renders the purview scope. demo.js carries the new roles.",
      why: "Mihai, 12 Oct: Exchange must be fully covered — the PIM-SG-EXO groups in the right Exchange RBAC groups; the baseline docs were missing the overview; Global Secure Access in every design; Teams, backups, billing, Copilot, Fabric, Power Platform and Purview in the design; Azure out of multi-region; and the amendment to the no-script rule — where ENCA cannot act from the browser it offers a downloadable script that performs the actions. Risk high: it rewrites what Deploy plans for every profile (new groups, new eligibilities, approval overrides on Tier 1 roles) and the write path of the scripts is unverified until the outcome files from a real run come back. Nothing here has written to a live tenant.",
      test: [
        "Local: node --test tools/pimscript.test.cjs (6) and tools/pim*.test.cjs pass; the whole suite passes; node tools/check-plain-text.js and node tools/check-toolbar-order.js clean. Demo (?demo=1): 🧬 PIM baseline → Read shows the Teams, Backup-Direct, Billing, PUR and (large) Data-Direct rows as missing with their role group named; 🚀 Deploy → Pick shows the Purview groups section; Preview shows ⬇ Exchange role groups and ⬇ Purview role groups and a 📂 Import outcome control; the downloaded .ps1 names every ticked group and no password, token or Graph call.",
        "cloudfellows.dev (baseline tenant), Privileged Role Administrator active: 🚀 Deploy, profile multi, Pick everything but Azure → Preview → Apply. Expect the four M365 groups, the five PUR groups and, per region, the two EXO-REG groups created role-assignable and private; the eligibilities of the twenty roles land (the backup and attribute roles with approval switched on only while PIM-SG-Approvers has two members); Verify reads them back. Then Read again: every new row ✓.",
        "cloudfellows.dev, Exchange Administrator active in PowerShell 7: run the downloaded pim-exchange.cloudfellows.dev.ps1 — it adds PIM-SG-EXO-Recipients to Recipient Management, -HelpDesk to Help Desk, -Hygiene to Hygiene Management, -Reader to View-Only Organization Management, and writes pim-exchange-outcome.cloudfellows.dev.<stamp>.json. 📂 Import outcome lists four bindings added or already there. Get-RoleGroupMember 'Recipient Management' shows the group.",
        "cloudfellows.dev, Compliance Administrator active: run pim-purview.cloudfellows.dev.ps1 (Connect-IPPSSession). Expect InfoProtection, Records, InsiderRisk and CommCompliance added; eDiscovery Manager is the one to watch — Microsoft documents only a mail-enabled security group there, so a failed line for PIM-SG-PUR-eDiscovery is a finding to record, not a tool error. Import the outcome.",
        "cloudfellows.dev, region EU-NL: run pim-exchange-regional.cloudfellows.dev.ps1 — eleven New-ManagementRoleAssignment lines scoped to AU-EU-NL-Users. A member of PIM-SG-EXO-Recipients-EU-NL, activated, can edit a mailbox inside the unit and is refused outside it.",
        "Timing (design test T5, still unmeasured): a test admin eligible in PIM-SG-EXO-Reader activates — note the minutes until Get-Recipient works in Exchange PowerShell, and until it stops after deactivation; the same for Helpdesk Administrator through the Helpdesk job group. Write both into the catalog notes.",
        "gimi (read-only): 🧬 PIM baseline → Read with profile small — the new roles show as missing or on the tenant default, nothing is written, no console error.",
      ],
      files: ["js/pimBaselineData.js", "js/pimscript.js", "js/pimdeploy.js", "js/pimbaseline.js", "js/app.js", "js/demo.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html", "tools/pim/*.json", "tools/pim/samples/*.jsonc", "tools/pimscript.test.cjs", "tools/pimbaseline.test.cjs", "tools/pimdeploy.test.cjs"],
    },
    {
      n: 320,
      ws: "pim",
      title: "📋 PIM report — roles vs groups and settings on one page (T55 0.1.0, R82)",
      tools: ["PIM report"],
      builds: [32507, 32508],
      risk: "low",
      what: "New read-only tool T55 in Workspace 02, js/pimreport.js (pure: build, render, tabs, toMd with the flow diagram as an embedded SVG data URI, toCsv) and the prp block in app.js. ▶ Read the report runs runPimBaseline and runPimRoles, then reads the members (PIM for Groups active and eligible instances, plain members as the fallback) of every PIM-SG group the Roles read did not open. The model: tiles, findings with impact and way back, the roles × groups matrix with a verdict per cell, both settings tables, people per group with the approver counts, standing access outside PIM. On the baseline tenant every profile's links and groups count as expected.",
      why: "Mihai, 12 Oct: need a PIM report of the current situation — roles vs groups and settings — and it must be part of PIM-Buddy in ENCA. The hand-made report on cloudfellows.dev that morning is the specification; option A off the mockup (its own tool). Graduates when the real-tenant steps below give the same numbers as that report and the export opens with its picture in VS Code.",
      test: [
        "Local: node --test tools/pimreport.test.cjs passes; the whole suite passes; node tools/check-toolbar-order.js and node tools/check-plain-text.js clean. Demo (?demo=1): Workspace 02 shows the 📋 PIM report tile with BETA; ▶ Read the report fills five tiles and the Findings tab; every tab paints; ⤓ Markdown opens the report modal and its download carries one data:image/svg+xml image.",
        "cloudfellows.dev (baseline tenant): ▶ Read — Roles vs groups says 103 / 103 match (84 active, 16 at AU scope, 19 eligible) and no extra link; the Findings list starts with the Tier 0 role policies (Global Administrator 8 h, no approval, no c1) and lists the empty PIM-SG-Approvers behind the GlobalAdmin group's approval; People says 0 in the model; Outside PIM lists the three permanent Global Administrators, BGA marked break-glass, and the five apps.",
        "cloudfellows.dev: the ⚙ Settings group table shows PIM-SG-M365-Ops 4 h MFA and justification as match and PIM-SG-M365-GlobalAdmin 1 h with approval; the role table shows Windows 365 Administrator as match. Compare three rows with 🧬 PIM baseline — the verdicts are the same.",
        "A customer tenant on one profile (not the baseline tenant): the matrix marks a role a job group holds outside its profile as extra (!) and a link the profile expects but the tenant lacks as missing (?), and the matching finding names the group and the role.",
        "32508, demo (?demo=1): 🚪 Outside PIM — the break-glass pill sits on ONE line in a Tags column on a 1280 px and a 390 px window. ▸ Groups on Anna de Vries opens her PIM groups; Read her other groups shows CAB-SEC-U-Persona-Internals and CAB-SEC-U-CA200-Exclusion each as nested, 2 levels with the path, and two groups counted, not listed. Without 🗂 Policies read in the session the panel says CA policies are not loaded; after opening 🗂 once, the exclusion group reads Excluded from N.",
        "32508, a real tenant: pick an admin who is an ELIGIBLE member of a PIM-SG group — the group is listed as eligible member · JIT although memberOf does not carry it; pick one who reaches a CA exclusion group through a team group — the path names the team group. Switch tenant, open 📋 again: no Groups panel from the previous tenant survives, and 🚀 Deploy starts empty.",
        "Export: download the Markdown, move it to another folder and open it in VS Code preview and in a Markdown viewer — the diagram shows; the CSV opens in Excel with one row per link.",
      ],
      files: ["js/pimreport.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/workspaces.js", "js/flat-icons.js", "js/changelog.js", "js/promote.js", "tools/pimreport.test.cjs"],
    },
    {
      n: 318,
      ws: "pim",
      requires: [303, 305],
      title: "🚀 Windows 365 and Remote Help modules in the PIM-buddy Intune RBAC, licence-aware (T51 0.4.0, T53 0.2.0, T48 0.8.0, R80)",
      tools: ["Deploy", "Intune RBAC", "PIM baseline"],
      builds: [32504, 32506],
      risk: "high",
      what: "js/pimmodules.js (new, pure): offer() from subscribedSkus by service plan name (SKU part numbers matched after stripping zero-width characters), parse/toggle of the per-tenant state (localStorage enca.pmbModules:<tenant>). js/pimBaselineData.js: modules rh, rhu, w365 (groups, Intune roles, Entra role, regional additions, per-profile blocks), template GroupJITApproval (four hours, MFA + justification + approval), INT-ROLE-HelpDesk (the 93 permissions of the built-in Help Desk Operator read on cloudfellows.dev, minus Remote Help Elevation and Android unattended) replacing the built-in role in every HelpDesk assignment of the three profiles and the region template. js/pimbaseline.js: profile(cat, id, { modules }) merges a module into the profile. js/intunerbac.js: module tag on items, plan() gated by the Deploy section, an assignment of the first-line name that still holds the built-in Help Desk Operator is a difference (not rewritten, not duplicated). js/pimdeploy.js: sections Remote Help and Windows 365 (off by default), their groups and membership policies, By hand lines (enable Remote Help, Remote Desktop policy and LAPS for Windows unattended, the Cloud PC role assignments). js/app.js: Modules strip in Deploy Pick, licence read, state. js/demo.js: the permissions the new roles name.",
      why: "Mihai, 11-12 Oct: add Windows 365 and Remote Help (including unattended) to the PIM-buddy Intune RBAC for the Large and multi-region profiles, Elevation behind approval; Small gets an option with E3, or Business Premium with the Defender suite. Validated read-only on cloudfellows.dev and gimi (resource operation Microsoft.Intune_RemoteAssistanceApp_WindowsUnattended exists; built-in Help Desk Operator carries Elevation and Android unattended; Cloud PC roles are their own provider). High: it creates Intune custom roles and changes the role the first line is assigned.",
      test: [
        "Local: node --test tools/pimmodules.test.cjs — 13 pass; the whole suite passes. Demo (?demo=1&ws=pim) → 🚀 Deploy → ▶ Read the tenant: a Modules strip with three unticked boxes; no Remote Help or Windows 365 section. Tick Remote Help: the section appears ticked, Preview lists PIM-SG-INT-RH-View, -Full, -Elevation, the roles INT-ROLE-HelpDesk and INT-ROLE-RH-*, and the By hand line about enabling Remote Help.",
        "Demo, 📱 Intune RBAC → Read: INT-RBAC-HelpDesk-Central and INT-RBAC-HelpDesk-EU-NL show Differs with the built-in Help Desk Operator text (the demo tenant still holds the old role); nothing is planned for them.",
        "cloudfellows.dev (read only first): Deploy → Modules shows Remote Help offered with the note that no Remote Help entitlement was found (Business Premium + Defender suite) and Windows 365 not offered (no Windows 365 licence). Tick Remote Help and Intune RBAC → Preview: the new roles resolve all their permissions (none unresolved); apply on a scratch basis with Intune Role Administrator; read again: INT-ROLE-RH-Elevation holds only Remote Help Elevation plus the two base permissions.",
        "cloudfellows.dev: with Multi Admin Approval on, role creation queues for a second administrator; the run shows it as not done, and a second Preview after approval plans the assignments.",
        "cloudfellows.dev: the existing INT-RBAC-HelpDesk assignments show Differs (built-in role); delete one in Intune, import again: it is made with INT-ROLE-HelpDesk. A helper in PIM-SG-INT-HelpDesk can no longer use Elevation; the same person activating PIM-SG-INT-RH-Elevation (approval) can.",
        "gimi (Windows 365 licensed, read only): Modules offers Windows 365; ticking it plans PIM-SG-INT-W365-Reader, -Operator and PIM-SG-M365-W365Admin and lists the two Cloud PC role assignments under By hand. Windows 365 Administrator appears in role settings. No Cloud PC assignment is planned.",
        "gimi (Windows 365 licensed): Deploy → tick Windows 365 → Read: consent for RoleManagement.ReadWrite.CloudPC is asked; Preview lists assign Cloud PC Reader and Cloud PC Administrator (whole tenant) for the two PIM-SG-INT-W365 groups; Apply, then read again: Preview plans nothing for them. On a tenant without the licence the two assignments stay under By hand.",
        "Not yet verified on a live tenant: the Windows 365 Administrator role settings policy, whether Cloud PC role assignments accept a scope (so no regional Windows 365 groups exist), and the Microsoft 365 E3 case (no E3 tenant available) — the Small offer for E3 rests on Microsoft's statement that Remote Help is included."
      ],
      files: ["js/pimmodules.js", "js/pimBaselineData.js", "js/pimbaseline.js", "js/intunerbac.js", "js/pimdeploy.js", "js/app.js", "js/demo.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tools/pimmodules.test.cjs", "tools/intunerbac.test.cjs", "tools/pim/"],
    },
    {
      n: 315,
      ws: "pim",
      requires: [298],
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
      ws: "ca",
      requires: [301, 302],
      requiresWhy: "ruInvLens() reads prlOn() from 302 and the inventory passes pmbReg (the regions file of 301) to its judge, so this item does not port on its own: promote 301 and 302 with it, or port it with those two branches cut.",
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      n: 310,
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      ws: "pim",
      requires: [298],
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
      n: 299,
      ws: "pim",
      requires: [298],
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
      ws: "pim",
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
      n: 224,
      ws: "ca",
      title: "📐 CIS Benchmark (T21) — beta AND the CloudFellows tenant only; production 316 removes it from that build",
      tools: ["CIS Benchmark"],
      builds: [25391],
      risk: "low",
      what: "js/app.js: tenantDomains (the organization's verified domains, read where tenantName and tenantDomain are), isCisTenant() (renamed isPublisherTenant in 32439, item 316), and a per-tab `only` predicate honoured by tabShown(), openFolded() and the command-palette builder beside the existing betaOnly check; the CIS tab and the toolCis FOLDED entry carry only: () => isCisTenant(). index.html: the tool-number row and the R01 roadmap card say so. PRODUCTION SIDE, already committed on main as build 316: js/cischeck.js, js/cisdata.js, their script tags, the screen-cis section, the FOLDED and TAB_HOSTS entries, the whole CIS block in js/app.js and screen-cis in HISTORY_SCREENS are gone from that build; T21 keeps its number in the map and in TOOL_VERSIONS.",
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
      ws: "ca",
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
      ws: "platform",
      title: "\u2699 The beta host's own single-tenant app registration (AUTH_HOSTS)",
      why: "Beta-only by design, and permanently \u2014 it was queue item 229 until build 25407, which is the wrong list for something that can never be ticked. AUTH_HOSTS in js/authConfig.js names the PUBLISHER'S OWN tenant and registration and is keyed on this site's hostname. In a production build, or in the :latest image, the key can never match and the block is nothing but somebody else's tenant ID shipped to every copy. When js/authConfig.js is ported, take the header comment and the js/connection.js precedence note and leave AUTH_HOSTS behind; main keeps the plain two-argument Object.assign. The \u2699 connection picker it defaults FROM (item 228) is in production since build 321.",
    },
    {
      ws: "platform",
      title: "🚚 This promotion queue",
      why: "Beta-only by design — js/promote.js and the Help section that renders it exist to describe the gap, so they have no meaning in production.",
    },
    {
      ws: "ca",
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
// ---- workspaces: pure helpers, used by the tool and by the tests ----
// Bookkeeping files are per channel and never "shared" in the sense that
// matters: every item touches them and every port rewrites them.
PROMOTE.BOOKKEEPING = ["js/version.js", "js/changelog.js", "js/promote.js"];
// Shell files (32818): every workspace's tools are wired through these, so no
// workspace's items can make one "only theirs". Until 32818 a shell file that
// only the other workspace's items DECLARED was listed under Never port — and
// most items declare no files at all, so the 19 Oct orders told the session
// never to port index.html, js/app.js and css/app.css while their own
// carve-outs said to port hunks of exactly those. A shell file the other
// workspace changes is listed as PORT BY HUNK instead: this order's hunks go,
// the other workspace's stay on beta.
PROMOTE.SHELL = ["index.html", "js/app.js", "css/app.css", "css/workspaces.css", "js/demo.js", "js/flat-icons.js", "js/workspaces.js", "js/graph.js", "js/connection.js", "js/onboard.js", "README.md", "SECURITY.md", "New-EncaAppRegistration.ps1"];
PROMOTE.wsOf = (it) => (it && Object.prototype.hasOwnProperty.call(PROMOTE.workspaces, it.ws)) ? it.ws : null;
// An order for `ws` may carry that workspace's items and platform's.
PROMOTE.inOrder = (it, ws) => { const w = PROMOTE.wsOf(it); return !!w && (w === ws || w === "platform"); };
PROMOTE.wsLabel = (ws) => { const w = PROMOTE.workspaces[ws]; return w ? `${w.num ? w.num + " " : ""}${w.label}` : String(ws); };
PROMOTE.globMatch = (pattern, file) => {
  const f = String(file).replace(/\s*\(.*\)\s*$/, "").trim();
  if (pattern.endsWith("/")) return f.startsWith(pattern);
  if (!pattern.includes("*")) return f === pattern;
  const re = new RegExp("^" + pattern.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
  return re.test(f);
};
// A short checksum of what the order is, so a session handed the file can see
// it was not edited into another order on the way (FNV-1a, 32 bits).
PROMOTE.fingerprint = (ws, ns) => {
  const str = `${ws}|${[...ns].sort((a, b) => a - b).join(",")}|${PROMOTE.productionBuild}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};

// THE ORDER CHECK. Pure: the ticked numbers and the workspace in, a verdict
// out. `blocks` stop the export; `warns` travel into the order file.
PROMOTE.checkOrder = function (pickedNs, ws) {
  const all = PROMOTE.items || [];
  const byN = new Map(all.map((i) => [i.n, i]));
  const ns = [...new Set((pickedNs || []).map(Number))].sort((a, b) => a - b);
  const out = { ws, ns: [], blocks: [], warns: [], unlabelled: [], foreign: [], gone: [], shared: [], sameTool: [], neverPort: [], byHunk: [], excluded: [] };
  if (!PROMOTE.workspaces[ws]) { out.blocks.push(`Unknown workspace ${ws}.`); return out; }
  out.unlabelled = all.filter((i) => !PROMOTE.wsOf(i)).map((i) => i.n);
  if (out.unlabelled.length) out.blocks.push(`Item${out.unlabelled.length === 1 ? "" : "s"} ${out.unlabelled.join(", ")} carr${out.unlabelled.length === 1 ? "ies" : "y"} no workspace. Label ${out.unlabelled.length === 1 ? "it" : "them"} in js/promote.js before any order is exported.`);
  for (const n of ns) {
    const it = byN.get(n);
    if (!it) { out.gone.push(n); continue; }
    if (!PROMOTE.inOrder(it, ws)) { out.foreign.push(n); continue; }
    out.ns.push(n);
  }
  if (out.gone.length) out.blocks.push(`Item${out.gone.length === 1 ? "" : "s"} ${out.gone.join(", ")} ${out.gone.length === 1 ? "is" : "are"} no longer queued — shipped since the tick. Untick and export again.`);
  if (out.foreign.length) out.blocks.push(`Item${out.foreign.length === 1 ? "" : "s"} ${out.foreign.join(", ")} belong${out.foreign.length === 1 ? "s" : ""} to another workspace and cannot be in a ${PROMOTE.wsLabel(ws)} order.`);
  if (!out.ns.length && !out.foreign.length && !out.gone.length) out.blocks.push("Nothing is ticked in this workspace — an empty order is not an order.");
  const picked = out.ns.map((n) => byN.get(n));
  const other = all.filter((i) => PROMOTE.wsOf(i) && !PROMOTE.inOrder(i, ws));
  out.excluded = other.map((i) => i.n).sort((a, b) => a - b);
  // requires: into another workspace blocks; inside this one, unticked, warns
  for (const it of picked) {
    const deps = (it.requires || []).map((r) => byN.get(r)).filter(Boolean);   // a shipped dependency is no gap
    const away = deps.filter((d) => !PROMOTE.inOrder(d, ws));
    const unticked = deps.filter((d) => PROMOTE.inOrder(d, ws) && !out.ns.includes(d.n));
    if (away.length) out.blocks.push(`Item ${it.n} needs ${away.length === 1 ? "item" : "items"} ${away.map((d) => d.n).join(", ")} of ${[...new Set(away.map((d) => PROMOTE.wsLabel(d.ws)))].join(" and ")}.${it.requiresWhy ? " " + it.requiresWhy : ""}`);
    if (unticked.length) out.warns.push(`Item ${it.n} needs ${unticked.length === 1 ? "item" : "items"} ${unticked.map((d) => d.n).join(", ")}, not ticked. Tick ${unticked.length === 1 ? "it" : "them"}, or the port must leave out what ${it.n} takes from ${unticked.length === 1 ? "it" : "them"}.`);
  }
  // shared files and tools with the other workspace's queued items
  const book = new Set(PROMOTE.BOOKKEEPING);
  const clean = (f) => String(f).replace(/\s*\(.*\)\s*$/, "").trim();
  const mine = new Map();
  picked.forEach((it) => (it.files || []).map(clean).filter((f) => !book.has(f)).forEach((f) => { if (!mine.has(f)) mine.set(f, []); mine.get(f).push(it.n); }));
  for (const [f, ours] of mine) {
    const theirs = other.filter((i) => (i.files || []).map(clean).includes(f)).map((i) => i.n);
    if (theirs.length) out.shared.push({ file: f, ours, theirs });
  }
  if (out.shared.length) out.warns.push(`${out.shared.length} file${out.shared.length === 1 ? " is" : "s are"} also changed by the other workspace (${out.shared.map((x) => x.file).join(", ")}). Port by marker, never the whole file.`);
  const unknownFiles = picked.filter((it) => !(it.files || []).length).map((it) => it.n);
  if (unknownFiles.length) out.warns.push(`Item${unknownFiles.length === 1 ? "" : "s"} ${unknownFiles.join(", ")} list${unknownFiles.length === 1 ? "s" : ""} no files, so shared files cannot be checked for ${unknownFiles.length === 1 ? "it" : "them"}. Read the builds' commits.`);
  const toolsOther = new Map();
  other.forEach((i) => (i.tools || []).filter((t) => t !== "Help").forEach((t) => { if (!toolsOther.has(t)) toolsOther.set(t, []); toolsOther.get(t).push(i.n); }));
  const seenTool = new Set();
  picked.forEach((it) => (it.tools || []).forEach((t) => { if (toolsOther.has(t) && !seenTool.has(t)) { seenTool.add(t); out.sameTool.push({ tool: t, ours: picked.filter((p) => (p.tools || []).includes(t)).map((p) => p.n), theirs: toolsOther.get(t) }); } }));
  if (out.sameTool.length) out.warns.push(out.sameTool.map((x) => `${x.tool}: item${x.theirs.length === 1 ? "" : "s"} ${x.theirs.join(", ")} of the other workspace change${x.theirs.length === 1 ? "s" : ""} it too — those parts stay on beta.`).join(" "));
  // never port: what the other workspaces own, and files only their items touch
  const owns = Object.entries(PROMOTE.workspaces).filter(([k]) => k !== ws && k !== "platform").flatMap(([, w]) => w.owns || []);
  const usedHere = new Set(all.filter((i) => PROMOTE.inOrder(i, ws)).flatMap((i) => (i.files || []).map(clean)));
  const shell = new Set(PROMOTE.SHELL);
  const theirFiles = [...new Set(other.flatMap((i) => (i.files || []).map(clean)))];
  const onlyThere = theirFiles.filter((f) => !book.has(f) && !shell.has(f) && !usedHere.has(f) && !owns.some((g) => PROMOTE.globMatch(g, f)));
  out.neverPort = [...owns, ...onlyThere.sort()];
  // a shell file is never "theirs": port this order's hunks of it, not the file
  out.byHunk = theirFiles.filter((f) => shell.has(f) && !out.shared.some((x) => x.file === f)).sort();
  out.mainChecks = Object.entries(PROMOTE.workspaces).filter(([k]) => k !== ws && k !== "platform").flatMap(([, w]) => w.mainChecks || []);
  return out;
};

// THE ORDER FILE, for one workspace. Refuses whatever the check blocks.
PROMOTE.buildOrder = function (pickedNs, appBuild, ws) {
  ws = ws || "ca";
  const chk = PROMOTE.checkOrder(pickedNs, ws);
  if (chk.blocks.length) throw new Error(chk.blocks.join(" "));
  const ns = chk.ns;
  const items = ns.map((n) => (PROMOTE.items || []).find((i) => i.n === n));
  const scope = (PROMOTE.items || []).filter((i) => PROMOTE.inOrder(i, ws));
  const when = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const fp = PROMOTE.fingerprint(ws, ns);
  const L = [];
  L.push(`# ENCA promotion order · WORKSPACE ${PROMOTE.wsLabel(ws)}`);
  L.push("");
  L.push(`Generated ${when} on ${appBuild ? appBuild.label : ""} · production is ${PROMOTE.productionBuild}`);
  L.push(`workspace: ${ws}`);
  L.push(`fingerprint: ${fp}  (workspace + items + production build)`);
  L.push("");
  L.push(`PROMOTE ITEMS: ${ns.join(", ")}`);
  L.push("");
  L.push("For the working session: this file is the ORDER, not the verification.");
  L.push("Verify each item against what main actually contains before building");
  L.push("the production commit — the queue's own rule. Items promote together");
  L.push("where their builds interleave; the session decides the cut.");
  L.push("");
  L.push("## Guard");
  L.push(`- Every item in this order is ${ws === "platform" ? "platform" : `${PROMOTE.wsLabel(ws)} or platform`}. Refuse the whole order if it names anything else, or if the fingerprint does not match.`);
  if (chk.excluded.length) L.push(`- Queued on beta and NOT in this order (other workspace): ${chk.excluded.join(", ")}. Port nothing of them "for completeness".`);
  L.push("");
  if (chk.neverPort.length) {
    L.push("## Never port: the other workspace's files (where main has its own copy, it keeps it)");
    chk.neverPort.forEach((f) => L.push(`- ${f}`));
    L.push("");
  }
  if (chk.byHunk.length) {
    L.push("## Shell files the other workspace also changes: port this order's hunks only, never the whole file");
    chk.byHunk.forEach((f) => L.push(`- ${f}`));
    L.push("");
  }
  if (chk.shared.length || chk.sameTool.length) {
    L.push("## Shared with the other workspace: port by marker only");
    chk.shared.forEach((x) => L.push(`- ${x.file}: take the parts of ${x.ours.join(", ")}; leave the parts of ${x.theirs.join(", ")}`));
    chk.sameTool.forEach((x) => L.push(`- tool ${x.tool}: this order ${x.ours.join(", ")}; leave ${x.theirs.join(", ")} on beta`));
    L.push("");
  }
  if (chk.warns.length) {
    L.push("## Order check");
    chk.warns.forEach((w) => L.push(`- ${w}`));
    L.push("");
  }
  // Groups and tool batches, scoped to this workspace: a member of the other
  // workspace is never "held back" here, it was never offered.
  const gids = [...new Set(items.map((i) => i.group).filter(Boolean))];
  for (const gid of gids) {
    const g = (PROMOTE.groups || {})[gid] || { title: gid };
    const members = scope.filter((i) => i.group === gid).map((i) => i.n).sort((a, b) => a - b);
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`GROUP ${gid} — ${g.title}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
  }
  const gc = {}; scope.forEach((i) => { if (i.group) gc[i.group] = (gc[i.group] || 0) + 1; });
  const homeOf = (i) => (i.group && gc[i.group] > 1) ? null : (((i.tools || []).length >= 3) ? "Several tools" : ((i.tools || [])[0] || "Several tools"));
  const homes = [...new Set(items.map(homeOf).filter(Boolean))];
  let batchLines = 0;
  for (const h of homes) {
    const members = scope.filter((i) => homeOf(i) === h).map((i) => i.n).sort((a, b) => a - b);
    if (members.length < 2) continue;
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`TOOL ${h}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
    batchLines++;
  }
  if (gids.length || batchLines) L.push("");
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- workspace: ${it.ws}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
    if (it.group) L.push(`- group: ${it.group}`);
    if ((it.requires || []).length) L.push(`- requires: ${it.requires.join(", ")}`);
    L.push(`- files: ${(it.files || []).join(", ")}`);
    // A carve-out is the one thing in this file that is an instruction rather
    // than a fact: the item does NOT port verbatim, and the port is wrong if
    // this line is not read. It goes above the test steps for that reason.
    if (it.carveout) L.push(`- CARVE-OUT: ${it.carveout}`);
    L.push("");
  }
  if ((chk.mainChecks || []).length) {
    L.push("## After the port, on main");
    chk.mainChecks.forEach((c) => L.push(`- ${c}`));
    L.push("");
  }
  L.push("```json");
  L.push(JSON.stringify({ order: ns, workspace: ws, fingerprint: fp, generated: when, betaBuild: appBuild ? appBuild.build : null, productionBuild: PROMOTE.productionBuild }));
  L.push("```");
  return { filename: `enca-promotion-order-${ws}-${when.slice(0, 10)}.md`, text: L.join("\n"), check: chk };
};
