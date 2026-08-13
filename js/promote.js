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
// ONE ITEM PER CHANGE. Only things that must ship together share a number —
// a fix and the feature it fixes, or two edits that are meaningless apart.
// Unrelated work bundled under one number cannot be promoted separately, which
// is the whole point of numbering it: "push 19" has to mean one decision, not
// three that happened to be written on the same day.
// ======================================================================
const PROMOTE = {
  productionBuild: "v1.0.267",
  betaBuild: "v1.0.250-beta.59",

  items: [
    {
      n: 23,
      title: "Flagged tiles sort first in a collapsed section (R09)",
      tools: ["All tools"],
      builds: [25059],
      risk: "low",
      what: "A collapsed home section puts NEW / BETA / UPDATED tiles first via CSS order, restoring the authored order on expand. Nothing is reparented — the grid's grouping survives untouched.",
      why: "Production has the same behaviour of a flagged tile claiming a visible slot but keeping its page position, so a flagged tile sitting ninth is on screen and still reads as an afterthought.",
      files: ["js/app.js"],
    },
    {
      n: 22,
      title: "Roadmap items carry a reference (R01–R26)",
      tools: ["Roadmap"],
      builds: [25057],
      risk: "low",
      what: "A stable reference chip on every roadmap item, plus the .rm-ref style and a line in the intro saying the references are permanent and not a priority order.",
      why: "Labelling only. Production's roadmap has the same items and no way to name one out loud.",
      files: ["index.html", "css/app.css"],
    },
    {
      n: 21,
      title: "Break-glass groups matched by local naming",
      tools: ["Restricted AUs", "Protect exclusions", "Import"],
      builds: [25054],
      risk: "medium",
      what: "＋ Bulk add finds break-glass groups named Emergency_Access1, EmergencyAccess, Break-Glass, BG-… and not only the baseline's own name — the query looks under those prefixes too, since such a group was never being read at all. The CA number now wins over a name match in every tool that routes.",
      why: "Depends on bulk add, which is already in production. Without it the break-glass unit stays empty on any tenant that does not use the baseline's spelling — which is most of them, since break-glass groups predate the baseline.",
      files: ["js/rmau.js", "js/app.js", "index.html"],
    },
    {
      n: 20,
      title: "Roadmap card: self-hosting with Docker",
      tools: ["Roadmap"],
      builds: [25053, 25056],
      risk: "low",
      what: "One roadmap card describing a published nginx image and a compose example, pairing with the single-tenant app registration, leading with the redirect-URI step that cannot be automated, and an optional SQLite store for keeping snapshots and reports between sessions.",
      why: "Roadmap text only. It can ride along with the next promotion.",
      files: ["index.html"],
    },
    {
      n: 19,
      title: "Roadmap card: baseline usage guide",
      tools: ["Roadmap"],
      builds: [25053],
      risk: "low",
      what: "One roadmap card describing an in-app guide to what the baseline contains and the dependency order to deploy it in, with a readiness check per step.",
      why: "Roadmap text only. It can ride along with the next promotion.",
      files: ["index.html"],
    },
    {
      n: 17,
      title: "Roadmap card: bulk grant scoped administrators",
      tools: ["Roadmap"],
      builds: [25050],
      risk: "low",
      what: "One roadmap card describing granting scoped administrators across several restricted units at once, and showing the current grants across all units in one view.",
      why: "Roadmap text only. It can ride along with the next promotion.",
      files: ["index.html"],
    },
    {
      n: 6,
      title: "Your own single-tenant app registration",
      tools: ["All tools"],
      builds: [25014, 25015, 25016],
      risk: "low",
      what: "-SingleTenant and -RequireAssignment on the registration script, js/authConfig.local.js as an override, and SINGLE-TENANT.md with the hosting guidance.",
      why: "A documented route for high-assurance tenants. Additive — nothing behaves differently for anyone who ignores it.",
      files: ["New-EncaAppRegistration.ps1", "js/authConfig.js", "SINGLE-TENANT.md", "README.md", "SECURITY.md"],
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
