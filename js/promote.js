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
      n: 98,
      title: "\ud83d\uddfa The roadmap separates what is running from what is planned",
      tools: ["Roadmap"],
      builds: [25205],
      risk: "low",
      what: "A new era, In beta today, between Now and Next. R01 CIS Benchmark, R06 Self-hosting with Docker and R15 Fork detection move into it \u2014 the three cards already carrying the in-beta-today chip. Next keeps R36, R12, R13 and R16, which are planned or partially done. The era marker is filled, because these exist, but not green, because green is production.",
      why: "Next mixed two different kinds of answer to the question a roadmap is asked. R01 and R06 are running today and can be opened on this site; R12 and R13 are ideas with nothing behind them yet. Reading them in one list, a chip apart, makes every row in it worth less \u2014 and a reader on the beta channel could not tell which entries they were already able to use.",
      test: [
        "Roadmap: the eras read Now, In beta today, Next, Self-hosted, Later, On the horizon, in that order.",
        "In beta today holds exactly R01, R06 and R15, each still showing its own chip.",
        "Next holds R36, R12, R13 and R16 - and none of them says in beta today.",
        "No card is missing from the roadmap and none appears twice; the Shipped-before section is untouched.",
        "The timeline dot for the new era is filled and distinct from Next's hollow one, in both light and dark mode.",
        "When one of the three graduates, its card moves to Now with a production build number - the new era must not become a second place for shipped work.",
      ],
      files: ["index.html", "css/app.css"],
    },
    {
      n: 97,
      title: "\u2753 Help and \ud83d\uddfa Roadmap sat against the left of the column",
      tools: ["All tools"],
      builds: [25204],
      risk: "low",
      what: "Two capped blocks inside main are centred: the Help page (920px reading measure) and the roadmap timeline (820px). Both keep their measure \u2014 it is the block that moves, not the text that gets wider. Found by sweeping every rule in the stylesheet with a max-width over 600px and checking which lacked auto margins; the rest of what that sweep returned is correct as it stands, and the note in the stylesheet says which and why.",
      why: "A capped block inside main collects every unused pixel on ONE side, so the page reads as pushed left. This is not new and not the sidebar's doing \u2014 main is 1180 in production while these are 920 and 820, so production has roughly 260px of dead space down the right of the Help page today. The sidebar only made it obvious by widening the column to 1500.",
      test: [
        "Help screen: the heading, the tool chips and the promotion table sit in the middle of the column, with the same free space either side (discounting the rail).",
        "Roadmap screen: the timeline is centred rather than hard against the left.",
        "Both keep their line length - the text does not stretch to fill 1500px, because a longer line is not more readable.",
        "Collapse and expand the sidebar on both screens: they stay centred at each width.",
        "The tool intro card at the top of any tool screen is unchanged - it fills the column as before.",
        "Prose inside a card (MS Learn detail, the readme paragraph) still starts at the card's left edge and is NOT centred - centring body text inside a card would be wrong.",
        "Open any modal: still centred by its backdrop, unaffected.",
        "Below 1240px, where the sidebar is hidden, everything returns to one centred column.",
      ],
      files: ["css/app.css"],
    },
    {
      n: 96,
      title: "📌 Side navigation — TUNO's console sidebar, ported",
      tools: ["All tools"],
      builds: [25202, 25203],
      risk: "low",
      what: "The signed-in shell gets TUNO's fixed left sidebar: every tool grouped as on the home grid (built by walking the grid, never a second copy of the list), an Overview entry, active state driven by the tab bar's own activeTab, a chevron that folds it to a 56px icon rail with hover-peek, and the collapsed state remembered in guarded localStorage (enca.sideCollapsed). The content column widens to a 1500px cap beside the rail and centres in the remainder in both rail states; the tab strip's left edge follows the content. Hidden below 1240px and on the sign-in screen. New aside in index.html, one CSS block, and a JS block between the tab bar and the tile handlers.",
      why: "Layout and navigation chrome only - no Graph call, no policy read or write changed. The mechanism is lifted from TUNO where it has soaked since build 10380 (rail 10387, remainder-centring 10389, peek 10391). The thing to watch is ENCA-specific: 35 sidebar entries against TUNO's 17, so the expanded list is the first to test on short viewports, and the home-grid walker assumes every .tool tile's id is in TOOL_TABS.",
      what2: "25203 \u2014 the home grid kept the pre-sidebar 1180px cap while main widened to 1500, so its headings and tiles sat against the left of the column and every pixel of slack collected on the right: the page read as pushed left even though main centres correctly in both rail states. The block is CENTRED rather than widened, because filling 1500px gives five columns of minmax(250px,1fr) and a collapsed section shows four tiles \u2014 every collapsed section would render a hole where the fifth belongs. The footer, which sits outside main, was centred on the viewport instead of on the column and drifted left of it by half the rail; it now follows the same offset.",
      test: [
        "Home screen, sidebar expanded and collapsed: the headings and the tile grid are centred in the column, with the same free space either side of it (discounting the rail itself).",
        "Collapse and expand the rail on the home screen: the block stays centred both times and no section renders four tiles in a five-wide row.",
        "Scroll to the bottom: the footer lines up with the content column, not with the middle of the viewport.",
        "Narrow below 1240px: the sidebar goes, and main, the footer and the home grid all return to one centred column with no leftover offset.",
        "Sign in (or open the demo): the sidebar appears left with five group headings matching the home grid's sections, every tile present, Overview highlighted while on the home grid. Before sign-in: no sidebar, the login card stays centred.",
        "Open a tool from a tile, another from the sidebar, a third from the + menu: each opens a tab AND highlights its own sidebar entry; closing the active tab moves both highlights together. The sidebar and the tab bar must never disagree.",
        "Click the chevron: the rail folds to icons, section headings become divider lines, the content column shifts by under ~90px rather than relayouting. Hover the rail: after a beat it peeks open as an overlay over the content; picking a tool folds it back. Reload: the collapsed state survives.",
        "On a 1080px-tall window, expanded: the sidebar scrolls to reach Help at the bottom and the last entries are not cut off unreachable - ENCA has 35 entries where TUNO has 17, so this is the check TUNO's soak did not cover.",
        "Narrow the window below 1240px: the sidebar disappears entirely, the shell returns to the centred 1180px column, and every tool stays reachable through the tab bar's + and the home grid.",
        "Sign out: sidebar gone, body.with-side gone, login card centred. Sign back in: it returns rebuilt.",
      ],
      files: ["index.html", "js/app.js", "css/app.css"],
    },
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
