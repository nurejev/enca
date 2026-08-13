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
  productionBuild: "v1.0.253",
  betaBuild: "v1.0.250-beta.28",

  items: [
    {
      n: 1,
      title: "Stop creating role-assignable groups",
      tools: ["Conditional Access groups"],
      builds: [25026],
      risk: "high",
      what: "The creation default in js/assign.js. An assigned group was made role-assignable unless told otherwise, which is why 95 of 100 templates produced them.",
      why: "Production is still building more of exactly what the baseline is moving away from. Every group created there today is a future ⑦ Migrate job.",
      files: ["js/assign.js", "js/groupTemplates.js"],
    },
    {
      n: 2,
      title: "Protect refuses role-assignable groups",
      tools: ["Protect exclusions", "Conditional Access groups"],
      builds: [25017, 25023],
      risk: "high",
      what: "Disables the checkbox, filters the write, corrects the header text, and adds select-all / deselect-all over the selectable rows.",
      why: "Production still lets you tick a role-assignable group into a restricted AU. That combination leaves NOBODY able to change its members — on a break-glass exclusion group, discovered during an incident.",
      files: ["js/app.js"],
    },
    {
      n: 3,
      title: "⑦ Migrate — role-assignable to a restricted AU",
      tools: ["Conditional Access groups"],
      builds: [25018, 25019, 25020, 25021],
      risk: "medium",
      what: "The migration wizard: planner, role/AU probes, member count, the ordered executor, select-all, optional AU placement, explicit scan button, Markdown report.",
      why: "The route off role-assignable groups. Without it a tenant can be told to stop making them but has no supported way to move the ones it has.",
      files: ["js/cagroups.js", "js/app.js", "index.html"],
    },
    {
      n: 4,
      title: "② Create: assigned or dynamic, optional restricted AU",
      tools: ["Conditional Access groups"],
      builds: [25026],
      risk: "medium",
      what: "The builder's role-assignable checkbox becomes a PROTECTION section; ↻ Recreate-role-assignable and its modal are removed; the ① Check drift flag is inverted so a plain group is correct.",
      why: "The other half of item 1 — the UI still offers the thing the default no longer does.",
      files: ["js/app.js", "js/cagroups.js", "index.html"],
    },
    {
      n: 5,
      title: "③ Members: add a member",
      tools: ["Conditional Access groups"],
      builds: [25022, 25024, 25028],
      risk: "low",
      what: "An ＋ Add bar with directory type-ahead on the user, loaded groups on the other side, prefilled when only one group is loaded. Includes the datalist fix: picking a suggestion no longer reopens the dropdown over the filled field.",
      why: "Convenience. Nothing in production is wrong without it.",
      files: ["js/app.js", "index.html"],
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
    {
      n: 7,
      title: "Roadmap: two new cards",
      tools: ["All tools"],
      builds: [25025, 25026, 25027],
      risk: "low",
      what: "🧹 Retire role-assignable groups everywhere (started), 🎛 Group actions where you are already looking (planned), and this promotion queue itself (js/promote.js + the Help section that renders it).",
      why: "Documentation only. The queue is beta-only by design, so promoting it is optional.",
      files: ["index.html", "js/promote.js", "js/app.js"],
    },
  ],

  // Deliberately NOT promoted. Listed so the absence is a decision on the
  // record rather than something that looks forgotten.
  staying: [
    {
      title: "📐 CIS Benchmark",
      why: "Stays on the beta channel until its verdicts have been checked against enough real tenants. Scoring a tenant against a benchmark is the kind of output people quote in an audit, so it graduates late rather than early.",
    },
  ],
};
