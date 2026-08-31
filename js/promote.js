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
  productionBuild: "v1.0.304",

  items: [
    {
      n: 120,
      title: "🔎 Reach a group the scan never found — ⑥ Protect and ⑦ Migrate",
      tools: ["Conditional Access groups", "Protect exclusions"],
      builds: [25239],
      risk: "medium",
      what: "A directory-search panel under both lists (js/app.js: cgFindGroups, cgManualRow, cgAuIneligible, cgFindPanel, cgFindVerdict, cgFindRun, cgFindAdd, cgFindClick, rmauCands). $search on displayName with a startswith fallback, 25 hits, each tagged role-assignable / dynamic / Microsoft 365 / mail-enabled / on-premises / policy references. Adding one runs the same reads a scanned candidate gets: AU membership for ⑥, and held directory roles plus member count plus restricted-unit membership for ⑦. Added rows live in cgManual, outside cgRmau and cgMig, so a rescan re-checks them instead of dropping them; they carry an added-by-hand tag and an ✕. ＋ Add refuses what the tab cannot take, and cgRmauApply refuses the same at the write. Includes the fix that an unreferenced group's checkbox was disabled while its own row said to tick it.",
      why: "It is the only route to a group the tenant maintains for its own reasons — a break-glass group no policy references, an exclusion group named nothing like the baseline, a role-assignable group that predates the baseline. Medium rather than low because it widens what a WRITE can reach: before this, ⑥ Protect could only place a group the policies already pointed at, and ⑦ Migrate could only recreate one the baseline recognised. Nothing is written without the existing acknowledgement, the existing preflight and the existing per-row refusals, and the new eligibility guard runs at the write as well as on the checkbox — but the set of groups those writes can be aimed at is larger, and that is the thing to review.",
      test: [
        "⑥ Protect, after a scan: search for a group that is NOT an exclusion group and add it. It appears in the table marked added by hand, pre-selected, with its persona destination or unmapped, and its protection state read from the directory.",
        "Take it off again with ✕: the row goes, the selection count drops, nothing in the tenant changed.",
        "⟳ Rescan, then ⟳ Re-check protection: the hand-added group is still on the list, still pre-selected, with its protection re-read. This is the whole point of holding it outside the scan state, so check it explicitly.",
        "Search for a Microsoft 365 group, a mail-enabled security group and an on-premises-synced group in ⑥: ＋ Add is DISABLED on each, with the reason naming which of the three it is.",
        "Search for a role-assignable group in ⑥: it CAN be added, and the row refuses protection with the ⑦ Migrate it button rather than a disabled search result.",
        "⑦ Migrate: search for a group that is not role-assignable — ＋ Add is disabled and points at ⑥ Protect. Then add a role-assignable one and confirm the step list, the policy count and the member count are filled in, not blank.",
        "Add a role-assignable group that HOLDS a directory role in ⑦: it must land in NOT MIGRATED with the role named, never in the eligible list. Same for one already inside a restricted unit.",
        "Run the migration with a hand-added group ticked and confirm the archive, the member copy and the policy repoint behave exactly as for a scanned group.",
        "An unreferenced exclusion group in ⑥ can now be TICKED by hand; ☑ Select all must still leave it alone, and the counter beside it must say referenced by nothing rather than counting it as cannot be added.",
        "Open ⑥ Protect as its own tool tile (not the tab): the panel, the refusals and the ✕ behave identically — one renderer serves both hosts.",
        "In a tenant where Graph refuses $search: the console warns once and results still arrive by startswith. Type the END of a group name there and confirm the narrower answer is honest rather than empty-looking.",
      ],
      files: ["js/app.js"],
    },
    {
      n: 121,
      title: "🔗 The group panel's policies open the policy card",
      tools: ["Conditional Access groups"],
      builds: [25239],
      risk: "low",
      what: "In ① Check, the panel behind a group row lists Included in and Excluded from. Those policy names are now pol-links with data-polid, and the depBody click handler closes the group overlay and opens the policy card. A name whose policy is not in the loaded set stays plain text and says so.",
      why: "Read-only, and the .pol-link contract is the one every other list in the app already uses. The panel answered where this group is used and then made you find each policy by hand in 🗂 List Policies.",
      test: [
        "Open ① Check, click a group that several policies reference, and click a policy name: the group panel closes and that policy's card opens.",
        "Do it for a group in both lists — an include and an exclude — and confirm the right card opens each time, not the first one.",
        "A dangling group (referenced by id, not resolvable) must not turn a name into a dead link: the entry stays plain with not in the loaded policy set beside it.",
      ],
      files: ["js/app.js"],
    },
    {
      n: 118,
      title: "🐳 How to install Docker, before being told to use it",
      tools: ["Self-hosting"],
      builds: [25238],
      risk: "low",
      what: "A prerequisite section in SELF-HOSTING.md with the install command per platform (brew install --cask docker-desktop, winget install -e --id Docker.DockerDesktop, Docker Engine for Linux with the usermod line), direct installer links per architecture, and a readiness check. The install scripts print the same platform-specific command instead of a download URL when Docker is missing, and install.ps1 warns about WSL 2 needing a reboot.",
      why: "Documentation and two error strings - no app code, so nothing on the hosted sites can move. It fixes an assumption rather than a bug: the quick start opened with a curl one-liner that only works on a machine already set up for Docker, in a document written for somebody standing up their first instance.",
      test: [
        "On a Mac with no Docker: run install.sh and confirm it prints the brew command and the Apple-silicon and Intel links, not a product page.",
        "On Linux with no Docker: the same script prints the Engine guide and the usermod line, not the brew command. The branch is on uname, so check both rather than assuming.",
        "On Windows with no Docker: install.ps1 prints the winget command, both installer links, and the WSL 2 reboot warning.",
        "With Docker installed but stopped, on each platform: the second message names how to start it.",
        "Follow the prerequisite section on a clean machine end to end and confirm every link resolves and every command runs. The cask rename is the one most likely to rot - brew install --cask docker is the OLD name, and the document says so on purpose.",
      ],
      files: ["SELF-HOSTING.md", "selfhost/install.sh", "selfhost/install.ps1"],
    },
    {
      n: 119,
      title: "🪟 Commands that survive a paste into PowerShell",
      tools: ["Self-hosting", "All tools"],
      builds: [25238],
      risk: "low",
      what: "PowerShell forms beside the bash ones for the multi-line docker run and the Azure revision restart in SELF-HOSTING.md; the update window in js/fork.js writes its Azure block for the platform the browser reports; the branding gear's Copy for container instructions are now one line with no continuation character at all.",
      why: "TRAVELS WITH 118 - both are the same fault, that the self-hosting documentation was written by and for somebody on a Mac. A backslash continues a line in bash and does nothing in PowerShell, so a Windows reader's paste runs the first line alone and gets \"docker: invalid reference format\", which names neither the cause nor the fix. Documentation and one platform check; no behaviour changes.",
      test: [
        "Paste the PowerShell docker run block from SELF-HOSTING.md into PowerShell verbatim: one container starts. Then paste the bash one and confirm it fails as described - knowing the failure is what the section exists to prevent.",
        "The same for the Azure restart block, which needs the variable form as well as the backtick: $() is bash-only.",
        "Open the update window in a browser on Windows and confirm the Azure block is the PowerShell form; on macOS confirm it is the bash form. The check reads navigator.userAgentData.platform first and falls back to navigator.platform, so try a browser that has only the fallback.",
        "Copy for container: the az line must be a single line with no trailing backslash or backtick, and must run as-is in both shells.",
      ],
      files: ["SELF-HOSTING.md", "js/fork.js", "js/selfhost.js"],
    },
    {
      n: 112,
      title: "🚨 CSP never allowed Azure Resource Manager",
      tools: ["Group Analyzer", "All tools"],
      builds: [25234],
      risk: "medium",
      what: "connect-src in index.html gains https://management.azure.com. It was never there, from the build that first wrote the Azure area onwards, so every ARM call the app made was refused by the browser before it left the page.",
      why: "PROMOTE THIS ON ITS OWN AND FIRST. Production has been giving a wrong answer rather than an error: the Group Analyzer's Azure area reports what it could not read rather than failing, so a blocked ARM call came back as a group with no Azure role assignments. Confident, wrong, and invisible. It is one host on one line, and the risk in it is the risk of any CSP widening - it must be read in the diff and understood, not waved through because the change is small.",
      test: [
        "BEFORE the fix, on production: open devtools, run the Group Analyzer with Azure ticked, and confirm the Refused to connect errors are there. Knowing the bug is real in production is what justifies the change.",
        "After: the same run returns role assignments, and the console is clean.",
        "Every other area still works - the widening must not have broken Graph, sign-in or the fork check. Watch for CSP violations across a full session.",
        "The policy is a meta tag, so it ships in index.html and applies identically on GitHub Pages and in the container. Verify BOTH after promotion, not just one.",
        "Anyone who used the Azure area before this build has an answer that was wrong, which is why the changelog entry tells them to re-run.",
      ],
      files: ["index.html"],
    },
    {
      n: 113,
      title: "☁ Save branding to the Azure deployment",
      tools: ["Self-hosting"],
      builds: [25234],
      risk: "medium",
      what: "On an azurecontainerapps.io host the branding gear gains Save to this deployment: it finds the container app by asking Resource Graph which one carries this page's ingress hostname, reads its template, and PATCHes ENCA_BRANDING onto it with the signed-in user's own ARM token. js/graph.js gains apost and apatch; armFetch takes a method and body.",
      why: "It is the FIRST WRITE ENCA makes to Azure, and that is the whole review. Everything else in the app reads. The write is bounded - one environment variable, on the resource serving the page, with the user's own rights and ARM consent asked on the click - but the shape of the capability is new and deserves a deliberate decision rather than arriving inside a self-hosting item. Depends on 112: without management.azure.com in connect-src it cannot work at all.",
      test: [
        "As a user with Contributor on the container app: save, wait for the revision, then load the site in a private window and confirm the branding is there with no localStorage involved.",
        "Restart the revision, then update the image: the branding survives both, because the setting is on the Azure resource rather than in the container. This is the claim the whole feature rests on.",
        "As a user who can SEE the subscription but holds only Reader: the save must fail with Azure's own 403 message, not a generic error, and must change nothing.",
        "As a user whose account cannot see that subscription at all: Resource Graph returns no rows and the message says to use Copy for container instead. Confirm it does not silently do nothing.",
        "CRITICAL: set ENCA_CLIENT_ID on the container app first, then save branding, then read the revision back and confirm ENCA_CLIENT_ID is STILL THERE. A container-app patch replaces the containers array wholesale, so a narrower patch would drop it and move the deployment back to the shared registration without a word.",
        "Decline the ARM consent prompt: the button must recover and say so rather than leaving the modal stuck mid-save.",
        "The button must be ABSENT on every non-Container-Apps host, production included.",
      ],
      files: ["js/selfhost.js", "js/graph.js"],
    },
    {
      n: 114,
      title: "🧨 A branding too big to exec",
      tools: ["Self-hosting"],
      builds: [25235],
      risk: "low",
      what: "A hard 48 KB refusal on ENCA_BRANDING in both the Save to this deployment path and Copy for container, plus a maxLength on the template's branding parameter and the explanation in SELF-HOSTING.md. Over the limit, Copy for container will not even put the value on the clipboard.",
      why: "TRAVELS WITH 113 - it is the fix for a bug 113 shipped, and 113 must never reach production without it. Saving a branding with an embedded logo set an environment variable over the kernel's 128 KB per-string limit, and the container then failed to exec anything at all: no nginx, no entrypoint, site gone, recoverable only from the portal. ARM accepts the oversized value silently, so the failure lands at the next container start rather than at save time. Low risk in itself: it only ever refuses.",
      test: [
        "Design a branding with a PNG logo embedded until the value passes 48 KB, then press Save to this deployment: it must REFUSE, name the size, and point at ENCA_BRANDING_URL. Nothing may reach ARM.",
        "The same look through Copy for container: refused, and the clipboard must NOT contain it - check by pasting somewhere afterwards.",
        "Just under 48 KB: both routes work as before, and the container starts.",
        "The recovery path, once, deliberately: set an oversized ENCA_BRANDING with the az CLI, confirm the container dies with argument list too long, then remove the variable and confirm it comes back. Knowing the recovery works is worth one broken container in a test resource group.",
        "Deploy to Azure with an oversized branding parameter: ARM must reject it on the maxLength before creating anything, rather than deploying a container app that cannot start.",
      ],
      files: ["js/selfhost.js", "selfhost/azuredeploy.json", "SELF-HOSTING.md"],
    },
    {
      n: 115,
      title: "🖼 Somewhere to type what the size limit asks for",
      tools: ["Self-hosting"],
      builds: [25236],
      risk: "low",
      what: "Logo and favicon path boxes next to their file pickers, and on a Container Apps host a Branding JSON URL box that makes Save to this deployment write ENCA_BRANDING_URL instead of the inline value. Plus a tightened asset sanitiser: protocol-relative //host paths and .. traversal are now rejected, where only a colon was tested for before.",
      why: "TRAVELS WITH 114. On its own, 114 refuses an oversized branding and tells the person to reference a logo by path or set a branding URL - neither of which the dialog offered. A refusal that names an action nobody can take is not much better than the crash it replaced. The sanitiser change is the security half: giving a value a text box is what turns a theoretical hole into an easy one, and //evil.example/x.png passed the old check because it carries no colon.",
      test: [
        "Type assets/logo-mark-light.svg into the logo path box, Apply, and confirm the header logo changes - a path is honoured, not just a file.",
        "Choose a file AND type a path: the file must win, since it is the more deliberate gesture.",
        "Open the dialog on an unconfigured deployment: both path boxes must be EMPTY, not pre-filled with the app's own logo path. Pre-filling would pin every saved branding to one build's ?v= asset URL and leave it stale later.",
        "Paste //evil.example/x.png, then ../../x.png, then https://evil.example/x.png into the logo path box and Apply: all three must be discarded and the logo left alone. Check the console for CSP violations too - there should be none, because the value never reaches the DOM.",
        "Round-trip: set a path, Download, Import the file back, and confirm the path survived rather than being dropped.",
        "On Container Apps, put a reachable https URL in the Branding JSON URL box and Save: the revision must carry ENCA_BRANDING_URL and NOT ENCA_BRANDING, and the deployment must wear the look after it rolls. Then clear the box, save again, and confirm the swap happens the other way.",
        "A URL Azure cannot reach: the container must still start and serve the tool unbranded. The fetch is deliberately never fatal.",
        "A non-https URL must be refused in the dialog before anything reaches ARM.",
      ],
      files: ["js/selfhost.js"],
    },
    {
      n: 116,
      title: "📏 The branding dialog says how big the look is",
      tools: ["Self-hosting"],
      builds: [25237],
      risk: "low",
      what: "A live size readout above the branding gear's buttons, updating on every keystroke, colour pick and file choice. Measured through the same collect-and-serialise path Copy for container and Save to this deployment judge. Names the embedded logo and favicon separately, goes amber past 24 KB and red past the 48 KB ceiling, and says that Download and Apply in this browser have no size limit at all. Carries one real fix it turned up: logoDark, which the sanitiser sets to a copy of logo, is no longer serialised - every file, clipboard value and container setting was writing the logo out twice.",
      why: "TRAVELS AFTER 114 AND 115, and is the third act of the same story: 114 refuses an oversized look, 115 gave people somewhere to do what the refusal asks. Both still speak at the end of the job, on the click meant to finish it, about a logo chosen many fields earlier - and the person then has to guess which field to shrink. A number that is simply always on screen turns that from a verdict into a constraint you design inside. Pure display: it reads the form, changes nothing, and every refusal it warns about stays exactly where it was.",
      test: [
        "Open the gear on an unconfigured deployment: the readout must be there immediately, quiet-coloured, showing a small number - not blank until the first keystroke.",
        "Choose a large PNG logo: the number must jump as soon as the file is read, without touching another field. The file inputs read asynchronously and are the one place the delegated listener cannot cover.",
        "Push it past 48 KB and confirm the box goes red, names the embedded logo's own size, and that Copy for container then refuses with the SAME number the box showed. A meter that disagrees with the refusal is worse than no meter.",
        "Between 24 and 48 KB: amber, and both save routes still work.",
        "Set a logo PATH instead of a file: the readout must drop to a few KB and say no image is embedded.",
        "Type in every kind of field - text, textarea, the colour pickers, the checkboxes - and confirm each one moves the number. The listener is delegated on the modal, so a field it misses is a silent hole.",
        "Import a branding from JSON: the rebuilt dialog must show the imported look's size, not the previous one's.",
        "Check it in dark mode: the amber and red states use the shared warn/bad variables and must stay readable.",
        "The logoDark saving: Download a look with an embedded logo and confirm the JSON has logo but NOT logoDark, and that it is roughly a third smaller than the same look downloaded from 25236.",
        "Then Import that file back and confirm the DARK theme logo is still the uploaded mark, not the app's own. This is the one way the saving could bite - it is only lossless because cleanBrand re-derives logoDark on the way in.",
        "Same round-trip through a mounted selfhost-branding.json and through Save to this deployment, since all three serialise from the same place.",
      ],
      files: ["js/selfhost.js"],
    },
    {
      n: 111,
      title: "🕓 Who changed passkey dynamic migration, and when",
      tools: ["SMS & voice retirement"],
      builds: [25233],
      risk: "low",
      what: "A 🕓 Who changed this? button in the dynamic-migration panel of T33. It reads the directory audit log (category Policy, the last 30 days) for edits to the authentication methods policy, finds the ones where optOutSettings.passkeyDynamicMigration actually moved, and puts the last one under the state strip - transition, person or app, IP, timestamp - with every policy edit in the window behind a Show all toggle. Parsing lives in js/smsvoice.js as pure functions over audit records; app.js only fetches and renders. AuditLog.Read.All is asked for on the click. Three distinct outcomes are worded separately: the property moved, the policy was edited without Entra diffing the property, or nothing in the window.",
      why: "Low risk and additive: a read, on its own button, behind its own consent, in a panel that keeps working untouched when the read fails or the scope is refused. The thing to watch is not breakage but WORDING - this puts a named person against a change, and the fallback case explicitly must not. The other watch item is the audit log's real shape: the parser was built against the documented record shape and demo records, so it needs a tenant where somebody actually paused or resumed the property before the strong case can be called proven.",
      test: [
        "In a tenant where the property has been paused or resumed at least once inside 30 days: 🕓 Who changed this? names the person who did it, with the correct transition and time. THIS IS THE LOAD-BEARING CHECK and it needs a tenant where the change was really made - if no such tenant is to hand, say so rather than ticking it.",
        "Pause the rollout with the panel's own button, then read the history: your own change appears, attributed to you. It may take a few minutes to reach the audit log, which is Entra's latency and not a bug - re-read rather than concluding it is missing.",
        "In a tenant that has NEVER touched the property but has edited the authentication methods policy (a registration campaign change will do): the answer is the policy wording - no recorded change to passkeyDynamicMigration, the policy was last edited by X - and NOT a person's name presented as having changed the opt-out.",
        "In a tenant with no authentication methods policy change at all in the window: the line says no change in the last 30 days AND names retention as the reason it cannot mean more than that.",
        "Decline the AuditLog.Read.All consent prompt: a red one-line failure under the strip naming the scope and the role, the state strip above unchanged and still showing its value, and no toast claiming nothing was ever changed.",
        "With a reader account that has the scope but no audit-reading role: the Graph 403 text is surfaced in that same line rather than being reported as an empty history.",
        "Show all expands to the full list, each row labelled - the moved ones with their transition, the ones that touched the policy without the property as property unchanged. Collapse restores. Then run a tenant scan (▶ Check the tenant) and confirm the history block survives it, like the strip does.",
        "Demo mode: the button returns three demo records, the newest transition matches the strip (NOT PAUSED), and pausing in demo prepends your own record so the two never disagree.",
        "Read it twice in a row: the second read is labelled Re-read who changed it and reports the same answer rather than looking like a button that did nothing.",
      ],
      files: ["js/smsvoice.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js"],
    },
    {
      n: 110,
      title: "🔄 The sign-in card stops contradicting itself, and update tells you how",
      tools: ["Self-hosting", "All tools"],
      builds: [25232],
      risk: "low",
      what: "Three fixes on what a self-hosted instance says. The hard-coded \"Multi-tenant\" line on the sign-in card is now read from AUTH_CONFIG.authority, so it says Single-tenant on a single-tenant deployment instead of contradicting the notice directly above it. The SELF-HOSTED ribbon is just that, with the trailing \"- not <publisher host>\" dropped. And the R15 update window leads with the command for the platform it is actually running on - az containerapp revision copy on an azurecontainerapps.io host - with a Copy button on every block and a plain statement that a static app cannot restart its own container.",
      why: "The first is the sharp one: a card that says Multi-tenant above a notice saying single-tenant has told the reader something false whichever half they believe, on the screen where they decide whether to consent. The ribbon change is judgement - a vendor's domain appended to a disclaimer on somebody else's deployment reads as a watermark. The update window is additive. Low risk throughout, but it touches the sign-in screen on every host, so the multi-tenant case has to be checked on production and not only on a self-hosted copy.",
      test: [
        "On production and on beta: the card still reads \"Multi-tenant - read-only Microsoft Graph permissions\", unchanged. This is the case that must not regress, and it is the one a self-hosted test will not exercise.",
        "With js/authConfig.local.js or ENCA_TENANT_ID pointing at a single tenant: the line reads Single-tenant AND the notice below says single-tenant. They now come from one function, so a disagreement is a real bug.",
        "With the script blocked entirely (disable JS or break app.js deliberately): the static markup still says Multi-tenant, which is the correct fallback for the canonical site.",
        "The ribbon on a self-hosted host reads exactly \"SELF-HOSTED\" with no host name after it; the beta Pages host still reads \"BETA - not production\".",
        "Deployed on Azure Container Apps and behind upstream: the update window's FIRST block is the revision-restart command, and the docker and fork blocks follow. On any other non-canonical host the az block is absent entirely.",
        "Run that restart command against a real container app after republishing the tag, and confirm the new build is served - the claim that a restart re-pulls is the load-bearing one on that block, and a command that does not do what it says is worse than no command.",
        "Copy button on each block puts that block's text on the clipboard and says Copied. Over plain http, where the clipboard API is blocked, it selects the text and says to press Ctrl+C rather than doing nothing.",
        "KNOWN GAP, not fixed here: fork.js returns early on a five-digit beta build, so a self-hosted copy of the :beta image never sees the update window at all - the beta series has no upstream to compare against. Test this on a self-hosted copy of a PRODUCTION build. Whether a self-hosted beta should compare against upstream beta is its own decision.",
      ],
      files: ["index.html", "js/app.js", "js/selfhost.js", "js/fork.js", "SELF-HOSTING.md"],
    },
    {
      n: 109,
      title: "🎨 Deployment branding without a filesystem",
      tools: ["Self-hosting"],
      builds: [25231],
      risk: "low",
      what: "ENCA_BRANDING on the container, written to selfhost-branding.json at the site root by the entrypoint - the same path the gear's download tells you to serve from, so the file route and the variable route are one mechanism reached two ways. Raw JSON or base64, because pipelines mangle braces. ENCA_BRANDING_URL fetches the same JSON once at start for a look too big for an environment variable. The gear gains a Copy for container button that produces the value, names its size in KB, and prints the az containerapp update and docker run lines. Wired through the ARM template, compose and both install scripts.",
      why: "The gear saved to localStorage, which is one person in one browser, and the only way to reach every visitor was a file mounted at the site root - impossible on Azure Container Apps. So an organisation could design its look and then have nowhere to put it. Low risk because it is additive and inert without the variables: no variable, no write, and a branding that does not parse is refused rather than served, since a broken file at that path is fetched on every load and is a puzzle nobody would think to look for in an env var.",
      test: [
        "docker run -e ENCA_BRANDING='{\"v\":1,\"brand\":{\"name\":\"Contoso\"}}': every visitor in a fresh private window sees the branding, with no localStorage involved.",
        "The same value base64-encoded: identical result, and the log says it decoded.",
        "ENCA_BRANDING='not json' and a truncated '{\"v\":1' - the container starts, logs the refusal, and serves NO selfhost-branding.json. Check the file is absent rather than empty.",
        "ENCA_BRANDING_URL pointing at an unreachable host: the container still starts and serves the tool unbranded. This is the one that must never be fatal.",
        "Both set: ENCA_BRANDING wins and no fetch is attempted.",
        "Neither set, with a ./selfhost-branding.json bind-mounted as before: unchanged behaviour. Existing deployments are the regression that matters.",
        "BOTH at once: ENCA_BRANDING set AND ./selfhost-branding.json mounted :ro, which is what install.sh does. The container must START, keep the mounted file, and log which one won. This killed the container before the guard was added.",
        "js/authConfig.js mounted read-only with ENCA_CLIENT_ID set: the container must REFUSE to start, with the two enca: lines explaining why. Fatal is correct here - starting anyway serves the image's own registration while the operator believes theirs is in use.",
        "In the gear on a self-hosted host: Copy for container puts valid JSON on the clipboard, reports a plausible KB size, and warns when a logo is embedded. Then open the tool over plain http where the clipboard API is blocked and confirm it falls back to a prompt containing the value rather than losing it.",
        "Round-trip: Copy for container, paste into the container, reload - the deployment wears the look the browser was previewing.",
        "Note the image has no python3, so the JSON check that actually runs in production is the shape fallback. Verify the truncated case against the REAL image, not a local shell with python3 on PATH.",
      ],
      files: ["selfhost/docker-entrypoint.sh", "selfhost/azuredeploy.json", "selfhost/docker-compose.yml", "selfhost/install.sh", "selfhost/install.ps1", "js/selfhost.js", "SELF-HOSTING.md"],
    },
    {
      n: 108,
      title: "🔑 A self-hosted copy can be told which registration to use",
      tools: ["Self-hosting"],
      builds: [25230],
      risk: "medium",
      what: "ENCA_CLIENT_ID, ENCA_TENANT_ID and ENCA_AUTHORITY on the container. A new entrypoint writes them into js/authConfig.js at start, above the file's existing Object.assign hook rather than by editing values inside it, idempotently, and does nothing whatever when they are unset. Surfaced as clientId/tenantId parameters on the Deploy to Azure template, environment keys in docker-compose.yml, ENCA_CLIENT_ID for install.sh and -ClientId/-TenantId for install.ps1. Separately: New-EncaAppRegistration.ps1 no longer patches js/authConfig.js on a -SingleTenant run.",
      why: "Self-hosting without forking was not true. The one value you must change to own your identity - the client id - could only be changed by editing a file inside the image, so an Azure Container App, which has no filesystem to mount into, could not be pointed at its owner's registration at all. It is medium risk because the entrypoint now stands between the image and nginx: if it fails, nothing serves. It is written to fail closed and loud on a bad value, and to be a complete no-op without one. The PowerShell fix is the sharper bug of the two - a -SingleTenant run rewrote the canonical client id in the working tree, one git commit -a away from pointing the published site at a private tenant.",
      test: [
        "docker run with NO env vars: byte-compare js/authConfig.js inside the container against the repo copy - identical. This is the regression that matters, because it is every existing deployment.",
        "docker run -e ENCA_CLIENT_ID=<guid> -e ENCA_TENANT_ID=<guid>: the sign-in card's self-hosted notice shows that client id and reads single-tenant authority with that tenant, and signing in actually reaches the right registration once the host is a SPA redirect URI on it.",
        "Restart that same container twice: exactly one config block in the file, not three. A restarted container keeps its writable layer, so a non-idempotent entrypoint stacks.",
        "ENCA_CLIENT_ID='x\"; alert(1); //' - the container must refuse to start with a message naming the variable, not escape it and serve it.",
        "ENCA_TENANT_ID alone, no client id: authority is overridden, client id stays the shared one. ENCA_AUTHORITY set alongside ENCA_TENANT_ID: the explicit authority wins.",
        "Deploy to Azure with clientId and tenantId filled in: the container app comes up configured, and the deployment output URL added as a SPA redirect URI signs in. Leave both blank: it behaves exactly as the previous template did.",
        "The image must not serve the entrypoint: curl /selfhost/docker-entrypoint.sh returns 404.",
        "New-EncaAppRegistration.ps1 -SingleTenant in a test tenant: js/authConfig.js is UNCHANGED afterwards (git status clean) and the console says so. Without -SingleTenant it still patches, as before.",
      ],
      files: ["Dockerfile", ".dockerignore", "selfhost/docker-entrypoint.sh", "selfhost/azuredeploy.json", "selfhost/docker-compose.yml", "selfhost/install.sh", "selfhost/install.ps1", "New-EncaAppRegistration.ps1", "SELF-HOSTING.md"],
    },
    {
      n: 107,
      title: "⚙ A self-hosted copy says so, and can be named",
      tools: ["Self-hosting", "All tools"],
      builds: [25229],
      risk: "medium",
      what: "Three deployments are now told apart instead of two. BRANDING.betaHost names the publisher's own pre-production site, so the ribbon reads BETA only there; every other non-production host - localhost, an Azure Container App, a fork's domain - reads SELF-HOSTED in slate rather than BETA in red. The sign-in card gains a matching notice on those hosts naming the host it is served from, the build, that it does not update itself, and the full client ID plus whether the authority is shared multi-tenant or single-tenant. New-EncaAppRegistration.ps1 documents -AppName as the self-hosting option it always was, stops applying the CA Documenter rename fallback to caller-chosen names, and warns at creation that a changed name makes a SECOND registration.",
      why: "The ribbon change is the risky half and the reason this is medium rather than low: it decides what a customer's own deployment calls itself, and the failure mode is silent. If BRANDING.betaHost is wrong or missing after a port, the beta site starts calling ITSELF self-hosted - which is exactly the confusion this removes, pointed the other way. The login notice is additive and hidden on production, and the PowerShell change is defensive: the previous-name fallback firing on a caller-chosen name could rename an unrelated app in a customer tenant.",
      test: [
        "On the beta Pages host: the ribbon still reads BETA in red and the title tag is still [BETA]. This is the regression that matters - if it reads SELF-HOSTED, BRANDING.betaHost did not survive the port.",
        "On production enca.limon-it.nl after promotion: NO ribbon, no title tag, and the sign-in card shows no self-hosted notice. Confirm in a private window, since localStorage branding is per-browser.",
        "docker run the image on http://localhost:8080 with nothing else configured: slate SELF-HOSTED ribbon, [SELF-HOSTED] title, and the sign-in card names localhost, the build, and the client ID from js/authConfig.js.",
        "Same container with a selfhost-branding.json mounted: still SELF-HOSTED, still one ribbon, and the branding applies - the app.js ribbon and the js/selfhost.js re-statement must not produce two.",
        "Point js/authConfig.local.js at a single-tenant registration and reload: the notice reads single-tenant authority with the tenant id, not shared multi-tenant. Then set the authority back to organizations and confirm it flips.",
        "The client ID on the card must be the FULL guid and selectable, so somebody can compare it against their own tenant. A truncated one is verification theatre.",
        "New-EncaAppRegistration.ps1 -SingleTenant -AppName \"Contoso CA Review\" in a test tenant: creates under that name, prints the re-run warning, and running it AGAIN with the same name updates rather than creating a second app. Then run it with a different name and confirm a second app appears - that is the documented behaviour, not a bug, and the warning is what makes it survivable.",
        "In a tenant that has an app called \"CA Documenter (Limon-IT)\": run with -AppName \"Something Else\" and confirm the old app is NOT renamed. Before this build it would have been.",
      ],
      files: ["js/branding.js", "js/app.js", "js/selfhost.js", "css/app.css", "index.html", "New-EncaAppRegistration.ps1", "SELF-HOSTING.md", "SINGLE-TENANT.md"],
    },
    {
      n: 92,
      title: "🐳 Self-hosting package (R06)",
      tools: ["Self-hosting"],
      builds: [25195, 25228],
      risk: "low",
      what: "Dockerfile (nginx:1.27-alpine over these files), selfhost/nginx.conf, docker-compose.yml, install.sh (Mac/Linux) and install.ps1 (Windows), azuredeploy.json (Azure Container Apps, scale-to-zero) with a Deploy to Azure button, SELF-HOSTING.md leading with the redirect-URI step, and a GitHub Actions workflow publishing ghcr.io/nurejev/enca - :latest from main, :beta from beta, guarded so the enca-beta deploy repo can never publish :latest.",
      why: "Not a byte of app code - packaging and documentation only, so the blast radius on the hosted sites is zero. Originally it could not be tested at all before promotion: every raw.githubusercontent URL, the Deploy to Azure button and the image tags pointed at main and :latest, which do not exist until the port happens, so the button answered with 'error downloading the template from URI'. The beta copy now points at the beta branch and the :beta image throughout, which makes self-hosting testable here - at the cost of a carve-out the port MUST perform. One manual step after the first workflow run: set the GHCR package visibility to Public or anonymous docker pull fails, on Azure and on every machine.",
      carveout: "PORT CARVE-OUT, do not copy these files verbatim. In SELF-HOSTING.md, selfhost/install.sh, selfhost/install.ps1, selfhost/docker-compose.yml and selfhost/azuredeploy.json, rewrite every nurejev/enca/beta URL to nurejev/enca/main, every github.com/nurejev/enca/blob/beta to blob/main, every ghcr.io/nurejev/enca:beta to :latest, the install scripts' default tag (TAG=\"${ENCA_TAG:-beta}\" and $Tag = \"beta\") back to latest, upstream/beta back to upstream/main, and DELETE the 'You are reading the beta-channel copy' banner at the top of SELF-HOSTING.md plus the two BETA-CHANNEL COPY header comments in the install scripts. Grep the ported tree for /beta and :beta before committing: on main the only surviving mentions should be the ones describing the beta channel as an option.",
      test: [
        "docker build -t enca . in a clean checkout, run it, sign in at http://localhost:8080 with the URI registered: every tool loads, no 404s in the network tab, and /CNAME returns 404 (stripped from the image).",
        "bash selfhost/install.sh on a Mac without the container running, then again with it running: first run creates, second run replaces, both print the redirect-URI block with the right port.",
        "selfhost/install.ps1 on Windows PowerShell 5 and 7: same behaviour, and Start-Process opens the URL.",
        "ON BETA, before promotion: the Deploy to Azure button in SELF-HOSTING.md opens the portal with the template loaded and no download error, deploys into a fresh resource group, and the output URL serves ENCA over https once that URL is added as a SPA redirect URI. Scale-to-zero: after idle, the first request cold-starts rather than erroring.",
        "ON BETA: curl -fsSL the beta install.sh one-liner on a clean machine and confirm it pulls :beta and the container serves the beta build.",
        "GHCR visibility is the usual cause of a deploy that never becomes healthy: if the Container App's Log stream shows an unauthorised pull, the package is still Private. Fix it once at github.com Packages, enca, Package settings.",
        "Push to beta publishes :beta and NOT :latest; the enca-beta repo runs no workflow at all (repository guard).",
        "AFTER the port to main: the workflow publishes :latest, docker pull ghcr.io/nurejev/enca:latest works logged out, and the ported files contain no nurejev/enca/beta URL and no :beta default - re-run the whole checklist against main.",
      ],
      files: ["Dockerfile", ".dockerignore", ".github/workflows/docker.yml", "selfhost/nginx.conf", "selfhost/docker-compose.yml", "selfhost/install.sh", "selfhost/install.ps1", "selfhost/azuredeploy.json", "SELF-HOSTING.md", "tools/check-plain-text.js", "js/app.js (carve-out line in the queue renderer, inert where promote.js is absent)"],
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
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
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
