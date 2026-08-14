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
//   * when it reaches production, delete the item and bump `productionBuild`
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
const PROMOTE = {
  productionBuild: "v1.0.280",
  betaBuild: "v1.0.250-beta.107",

  items: [
    {
      n: 51,
      title: "Tool count beside \"What do you want to do?\"",
      tools: ["All tools"],
      builds: [25106],
      risk: "low",
      what: "A counted-from-the-page badge next to the home heading, Help cards excluded, with new/beta count in the tooltip.",
      why: "Nothing on the home screen says how much is there, and the two channels have different totals.",
      files: ["index.html", "js/app.js", "css/app.css"],
    },
    {
      n: 50,
      title: "Per-unit scoped-admin field takes several people",
      tools: ["Restricted AUs"],
      builds: [25105],
      risk: "high",
      what: "The type-ahead searches the entry being typed rather than the whole field, a pick is appended instead of replacing what was there, and the grant loops over the list with a per-person outcome.",
      why: "In production the field accepts a ;-separated list, finds nobody once you type the separator, and then sends the whole string as one UPN — so it fails and looks like the tenant is at fault.",
      files: ["js/app.js"],
    },
    {
      n: 49,
      title: "Flagged home tiles ranked by recency, not page order",
      tools: ["All tools"],
      builds: [25104],
      risk: "medium",
      what: "When more tiles are flagged than a collapsed section has slots, the ones changed most recently claim them — ranked by the newest changelog build naming that tool — and the newest sits leftmost. The button label now says new, beta or updated.",
      why: "Production buries the tool changed in the current build under a BETA badge from weeks ago, which is the opposite of what the collapsed view is for.",
      files: ["js/app.js", "index.html"],
    },
    {
      n: 48,
      title: "Search for scoped administrators in the bulk grant",
      tools: ["Restricted AUs"],
      builds: [25103],
      risk: "low",
      what: "The bulk scoped-administrator panel gains a type-ahead over the tenant's users: pick by name, chips you can remove, Enter to add. Pasting UPNs still works and both write the same list.",
      why: "Production only takes typed UPNs, so granting to somebody whose UPN you do not know means leaving the tool to find it.",
      files: ["js/app.js", "css/app.css", "index.html"],
    },
    {
      n: 34,
      title: "CIS Benchmark Help section",
      tools: ["CIS Benchmark"],
      builds: [25079],
      risk: "low",
      what: "The Help section written for 📐 CIS Benchmark, held back from production because the tool is beta-only — a Help entry for a tile nobody has would be a lie.",
      why: "NOT promotable on its own — 📐 CIS Benchmark is beta-only, and a Help entry for a tile nobody has is a lie. It travels with the tool whenever that graduates.",
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
