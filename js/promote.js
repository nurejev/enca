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
// ======================================================================
const PROMOTE = {
  productionBuild: "v1.0.254",
  betaBuild: "v1.0.250-beta.30",

  items: [
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

  // Deliberately NOT promoted. Listed so the absence is a decision on the
  // record rather than something that looks forgotten.
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
