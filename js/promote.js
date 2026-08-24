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
  productionBuild: "v1.0.297",

  items: [
    {
      n: 93,
      title: "🍴 Fork detection and update-from-upstream (R15)",
      tools: ["All tools"],
      builds: [25195],
      risk: "low",
      what: "New js/fork.js: on a non-canonical host running a production-series build older than what enca.limon-it.nl serves, a strip under the header says how many builds behind this copy is, and opens the What's-new headline of every build in between with the update commands (docker pull, or fetch and re-review for a fork). Dismissible until upstream moves again. connect-src grew https://enca.limon-it.nl for this one check.",
      why: "Read-only, fails silent by design (offline and air-gapped are legitimate), and cannot fire on production (it IS upstream) or on the beta channel (a five-digit beta build is ahead, not behind - the series do not compare). The check parses upstream version.js and changelog.js as TEXT with regexes pinned to their literal layout, never as code; the thing to watch at promotion time is that those layouts and this regex keep agreeing.",
      test: [
        "On the beta site: NO strip - beta-series builds never compare. On production: NO strip and no fetch errors in the console.",
        "Serve a checkout locally (python3 -m http.server), set APP_BUILD.build to an older production integer such as 290: the strip appears, the count equals upstream's build minus 290, and See what changed lists exactly the builds in between, newest first.",
        "Click Dismiss, reload: no strip. Lower the local build by one more (upstream now newer than the dismissed number): strip returns.",
        "Kill the network and reload the same local copy: no strip, one console.info line, no error.",
        "Check the regex against upstream's live js/version.js and js/changelog.js on the day of promotion - the parse is pinned to their layout.",
      ],
      files: ["js/fork.js", "js/app.js", "index.html"],
    },
    {
      n: 92,
      title: "🐳 Self-hosting package (R06)",
      tools: ["Self-hosting"],
      builds: [25195],
      risk: "low",
      what: "Dockerfile (nginx:1.27-alpine over these files), selfhost/nginx.conf, docker-compose.yml, install.sh (Mac/Linux) and install.ps1 (Windows), azuredeploy.json (Azure Container Apps, scale-to-zero) with a Deploy to Azure button, SELF-HOSTING.md leading with the redirect-URI step, and a GitHub Actions workflow publishing ghcr.io/nurejev/enca - :latest from main, :beta from beta, guarded so the enca-beta deploy repo can never publish :latest.",
      why: "Not a byte of app code - packaging and documentation only, so the blast radius on the hosted sites is zero. It cannot be fully real until it reaches main: the raw.githubusercontent URLs in the scripts, the Deploy button and the workflow's :latest tag all point at main, so promoting this item is what turns the documentation true. One manual step after the first workflow run: set the GHCR package visibility to Public or anonymous docker pull fails.",
      test: [
        "docker build -t enca . in a clean checkout, run it, sign in at http://localhost:8080 with the URI registered: every tool loads, no 404s in the network tab, and /CNAME returns 404 (stripped from the image).",
        "bash selfhost/install.sh on a Mac without the container running, then again with it running: first run creates, second run replaces, both print the redirect-URI block with the right port.",
        "selfhost/install.ps1 on Windows PowerShell 5 and 7: same behaviour, and Start-Process opens the URL.",
        "After the first push to main: the workflow publishes :latest, the package is set Public once by hand, and docker pull ghcr.io/nurejev/enca:latest works logged out.",
        "Push to beta publishes :beta and NOT :latest; the enca-beta repo runs no workflow at all (repository guard).",
        "Deploy to Azure button from SELF-HOSTING.md on main: the template deploys in a fresh resource group, the output URL serves ENCA over https, and after adding that URL as a SPA redirect URI sign-in works. Scale-to-zero: after idle, the first request cold-starts rather than erroring.",
        "Not testable until promoted: everything above that reads from main. On beta, verify the files exist and docker build passes.",
      ],
      files: ["Dockerfile", ".dockerignore", ".github/workflows/docker.yml", "selfhost/nginx.conf", "selfhost/docker-compose.yml", "selfhost/install.sh", "selfhost/install.ps1", "selfhost/azuredeploy.json", "SELF-HOSTING.md"],
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
