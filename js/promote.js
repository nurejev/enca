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
  productionBuild: "v1.0.277",
  betaBuild: "v1.0.250-beta.98",

  items: [
    {
      n: 45,
      title: "Custom groups in the persona vaults (R28)",
      tools: ["Restricted AUs"],
      builds: [25098],
      risk: "medium",
      what: "A tenant's own groups can be filed into a persona vault, stated in the unit's description as [enca:extra=...] and honoured by every tool that routes a group. Never guesses, never hides the unmapped, and a stated mapping outranks the CA number.",
      why: "Production routes only by the CA number, so a group that predates the baseline matches no persona and quietly falls out of Protect and Bulk add.",
      files: ["js/rmau.js", "js/app.js", "css/app.css", "index.html"],
    },
    {
      n: 44,
      title: "Gap analyse scans only named users or groups (R29)",
      tools: ["Gap analyse"],
      builds: [25097],
      risk: "medium",
      what: "A scope mode that names users or groups before the run: groups expanded to their transitive members, no tenant-wide /users read, and the scoped-ness reported on screen and in the export.",
      why: "Production reads every user in the tenant to answer a question about one contractor, which on a large tenant is minutes of reads for a wide answer nobody asked for.",
      files: ["index.html", "js/app.js", "js/analyze.js", "css/app.css"],
    },
    {
      n: 43,
      title: "Filter the policies that did not apply (R30)",
      tools: ["What-If"],
      builds: [25096],
      risk: "medium",
      what: "The non-applying list filters by persona (same CA ranges as List Policies, same helper), by CA number or name, and by reason — with a count per reason shown first and each count clickable. \"Scenario does not say\" is separated from genuine out-of-scope. Reason counts also go into the Markdown export.",
      why: "Production shows a flat list of ~107 entries with no way in, so the one policy you were looking for is found by reading.",
      files: ["js/app.js", "js/whatifeval.js", "css/app.css", "index.html"],
    },
    {
      n: 42,
      title: "What-If searches the tenant's apps (R31)",
      tools: ["What-If"],
      builds: [25095],
      risk: "medium",
      what: "Target resource → Other is a type-ahead over the tenant's service principals: type a name, get the id. A pasted GUID still works and is resolved to a name for confirmation; an id with no service principal here is reported rather than refused.",
      why: "Production asks for a raw GUID, and a mistyped GUID does not fail — it describes a sign-in to an app nobody has, so the answer looks valid and is about nothing.",
      files: ["index.html", "js/app.js", "css/app.css"],
    },
    {
      n: 41,
      title: "Policy cards name the external user types",
      tools: ["List Policies"],
      builds: [25094],
      risk: "medium",
      what: "A guest/external include or exclude lists which of the six user types it holds, calls out an omitted service provider as NOT service providers, says \"all types, incl. service providers\" when all six are selected, and reports a selection scoped to named tenants.",
      why: "Production collapses the whole selection to \"Guests & external users\", so a card cannot show whether a policy reaches the CSP partner's delegated admins — which is what the new service provider checks are about. The check finds it; the card should show it.",
      files: ["js/model.js"],
    },
    {
      n: 40,
      title: "Release time in the reader's own timezone",
      tools: ["All tools"],
      builds: [25091, 25093],
      risk: "low",
      what: "The sign-in build stamp converts the recorded UTC release time to the browser's timezone and names the offset; the UTC original moves to the tooltip along with the zone it was converted to. Includes the 25093 correction: the released field is set from the clock, never typed, after three builds carried a local time in a field documented as UTC.",
      why: "Production shows 12:05Z, so everybody outside UTC does the arithmetic to answer \"is what I pushed live?\".",
      files: ["js/version.js", "js/app.js"],
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
