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
  productionBuild: "v1.0.258",
  betaBuild: "v1.0.250-beta.38",

  items: [
    {
      n: 12,
      title: "Break-glass restricted administrative unit",
      tools: ["Restricted AUs"],
      builds: [25038],
      risk: "medium",
      what: "A tenth baseline unit, CAB-SEC-RMAU-BreakGlass, for the group excluded from nearly every policy. Production shipped the nine persona units in build 258 without it.",
      why: "Production's baseline is incomplete without it — it reports nine units as the full set and a tenant that follows it leaves the single most sensitive exclusion group in whatever unit somebody guessed. Low mechanical risk (one more row in the same catalog), but it changes what the baseline claims is complete, which is why it is not filed as low.",
      files: ["js/rmau.js", "index.html"],
    },
    {
      n: 11,
      title: "Import: protection preflight and group placement",
      tools: ["Import"],
      builds: [25035, 25038],
      risk: "medium",
      what: "Import checks the restricted units for the personas the selection touches, offers to create the missing ones, and adds every group it creates to its persona's unit. Shared and pre-existing groups are deliberately not placed and are named in the report.",
      why: "Its dependency (the persona units) went to production in build 258, so this can now promote on its own. It writes to the directory on an import run, which is the moment you least want a surprise, so it is worth a couple of real restores on beta first. The role-assignable label fix it used to carry shipped separately as build 257.",
      files: ["js/import.js", "js/app.js", "js/rmau.js", "index.html"],
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
