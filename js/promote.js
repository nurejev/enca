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
  productionBuild: "v1.0.268",
  betaBuild: "v1.0.250-beta.68",

  items: [
    {
      n: 28,
      title: "Grant scoped administrators across units (R07)",
      tools: ["Restricted AUs"],
      builds: [25068],
      risk: "medium",
      what: "Name the administrators once, tick the units once, apply the grid. Each unit x administrator is its own outcome; the role is activated once and each user resolved once. Units with nobody scoped are flagged.",
      why: "It writes role assignments, which is why it is not low. Production grants one administrator on one unit at a time, so a team across eleven baseline units is 44 acts and a missed unit is a persona nobody can manage — with nothing to announce it.",
      files: ["js/app.js", "index.html"],
    },
    {
      n: 27,
      title: "Group actions where you are already looking (R10)",
      tools: ["Conditional Access groups"],
      builds: [25067],
      risk: "low",
      what: "Clicking a group in ① Check lists the actions that apply to it and carries the group across to the tab that performs them. Only applicable actions are shown, and a frozen group is told the order it has to be unpicked in.",
      why: "Navigation only — every action already existed and none behaves differently. It removes the step of finding the same row a second time in another tab.",
      files: ["js/app.js", "index.html"],
    },
    {
      n: 26,
      title: "Baseline guide and Drift watch move to Explore & document",
      tools: ["All tools"],
      builds: [25065],
      risk: "low",
      what: "Both tiles move out of ✍️ Manage the tenant into 🗂 Explore & document. Read-only tools sitting among the ones that write.",
      why: "Production has 📉 Drift watch in the writing section, where a read-only tool implies it might change something.",
      files: ["index.html"],
    },
    {
      n: 25,
      title: "Type the country, get the ISO code (R08)",
      tools: ["Named locations"],
      builds: [25065],
      risk: "medium",
      what: "A country named location is built by typing the country name; the picker fills in the ISO 3166-1 code and shows both on a chip. Pasted text is normalised, and anything that is not a real code is reported rather than dropped. New file js/iso3166.js.",
      why: "Production takes two-letter codes typed by hand into a free-text box, where a wrong code is indistinguishable from a right one — the policy saves and covers the wrong country silently. Medium rather than low because it changes how a location is authored, and locations gate access.",
      files: ["js/iso3166.js", "js/app.js", "index.html", "css/app.css"],
    },
    {
      n: 24,
      title: "📖 Baseline usage guide (R05)",
      tools: ["Baseline guide"],
      builds: [25063, 25065],
      risk: "low",
      what: "New beta-only tool: the deployment order as six steps with the reason for each, and a 🔎 Read-the-tenant readiness check per step (baseline groups, restricted units, locations, strengths, contexts, terms of use, per-persona policy coverage, state tally). Pure reads plus one on-demand scope (Agreement.Read.All). New js/guide.js plus tile, screen and wiring.",
      why: "Reads only and self-contained, but it EXPLAINS the baseline — wrong prose is worse than no prose, so it graduates once the step texts have survived a few real deployments.",
      files: ["js/guide.js", "js/app.js", "index.html", "js/version.js"],
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
