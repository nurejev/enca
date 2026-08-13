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
  productionBuild: "v1.0.259",
  betaBuild: "v1.0.250-beta.41",

  items: [
    {
      n: 14,
      title: "Per-persona routing in Protect, and frozen-group detection",
      tools: ["Protect exclusions", "Conditional Access groups", "Restricted AUs"],
      builds: [25040],
      risk: "high",
      what: "⑥ Protect routes each exclusion group to its own persona unit instead of filing the whole run into one, skips rather than guesses when it cannot tell, and grants scoped administrators on every unit touched. Separately, a group that is role-assignable AND already inside a restricted unit is detected and reported as frozen.",
      why: "Production filed every selected group into a single chosen unit, so a tenant following the persona baseline ends up with the Admins exclusion groups inside the Global vault — a real misconfiguration that production can create today. The frozen detection is read-only and matters just as much: production cannot currently tell you that a group's membership is editable by nobody.",
      files: ["js/app.js", "js/cagroups.js", "js/rmau.js", "index.html"],
    },
    {
      n: 13,
      title: "Roadmap card: flagged tiles first in a collapsed section",
      tools: ["Roadmap"],
      builds: [25039],
      risk: "low",
      what: "One new roadmap card describing the intent to lift NEW / BETA / UPDATED tiles to the top of a collapsed home section rather than leaving them in page order.",
      why: "Roadmap text only — nothing behaves differently. It can ride along with the next promotion rather than justifying one.",
      files: ["index.html"],
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
