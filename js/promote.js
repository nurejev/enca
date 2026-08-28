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
