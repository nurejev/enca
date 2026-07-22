// ======================================================================
// Changelog — the source of truth for both the "What's new" overlay shown
// after sign-in and the full changelog page.
//
// HOUSEKEEPING: whenever a tool is added or changed, add an entry here in
// the same commit as the code, and bump APP_BUILD.build in version.js. The
// overlay compares the build a person last acknowledged (localStorage)
// against the newest entry, so anything newer than their last visit is what
// they get shown.
//
// kind:  "new"      — a whole tool or capability that did not exist
//        "improved" — an existing tool got better
//        "fixed"    — something was wrong and now is not
// Newest release first; each release groups the builds shipped together.
// ======================================================================
const CHANGELOG = [
  {
    build: 164, date: "2026-07-21", title: "Change audit, named locations and a tidier home page",
    items: [
      { kind: "improved", tool: "Change audit", text: "Opens on a Summary view that rolls the log up per resource — one row per policy or group with how many adds, removes and updates it saw, how many distinct people moved, and who did it. On a large tenant that turns 2,600 near-identical entitlement-management events into a handful of readable rows; click one for the individual changes, or switch to Timeline for the raw feed." },
      { kind: "improved", tool: "Change audit", text: "Defaults to the last 7 days, and a read in progress now survives switching tabs — come back and it is still running (or already done) instead of showing the Run button again." },
      { kind: "new", tool: "Change audit", text: "Also watches membership of the groups your policies include or exclude. Adding someone to an exclusion group widens a bypass without any policy being edited, so it never appears as a policy change — those additions and removals are now listed alongside, showing who was added, to which group, by whom, and which policies that group exempts them from." },
      { kind: "new", tool: "Change audit", text: "New tool. Reads the Entra directory audit log and shows who changed which Conditional Access resource, when, and exactly what changed — a field-level diff (state: report-only → enabled, one group added to an exclusion) rather than a wall of JSON. Covers policies, named locations, authentication strengths and contexts, and terms of use, with the actor and their source IP. Needs the new AuditLog.Read.All permission, requested when you run it." },
      { kind: "new", tool: "Named locations", text: "New tool. View, create, edit and delete the IP-range and country named locations your policies target, and see which policies use each one. Validates CIDR (IPv4 and IPv6) and ISO country codes, warns when changing the trusted flag would move policies that use “All trusted locations”, and requires a typed confirmation before deleting a location a policy still references." },
      { kind: "new", tool: "What-If", text: "New tool. Describe a sign-in — user, target resource, platform, client app, IP or country, device state and risk — and every enabled or report-only policy is evaluated against it: which apply with the grant and session controls to satisfy, and which do not, each with the first condition that wasn't met. Mirrors the Entra What If tool." },
      { kind: "new", tool: "CA validator", text: "New tool. For each policy, the sign-in simulations it implies and the control each one should (or should not) enforce. Compact view by default, a Detailed grid when you want every combination, and a “Run against” box to scope the whole report to one persona group or user. Ported from Jasper Baes' Conditional Access Validator." },
      { kind: "improved", tool: "CA validator", text: "Session-only policies are simulated instead of skipped — sign-in frequency, persistent browser, token protection, app-enforced restrictions, MDA app control and CAE now appear as expected controls with their configured value. Both views group policies by persona." },
      { kind: "improved", tool: "Exclusion analyzer", text: "New Risk review: every policy with exclusions scored for governance — privileged roles or all guests excluded, direct user exclusions, oversized exclusion lists, stale disabled accounts (including inside an excluded group) and report-only exclusions. A group's member count opens the member list, and clicking a row or column filters the matrix to what is in scope." },
      { kind: "improved", tool: "Baseline Policies", text: "A Changes column shows what a newer baseline version actually changes against the deployed policy — added and removed assignments, and grant or session control differences." },
      { kind: "improved", tool: "Import", text: "Choose an assignment mode: deploy new policies onto the persona deploy groups, or match & replace, where a policy already in the tenant keeps its current assignment and state, gains any new exclusion groups the update adds, and the superseded version is switched Off." },
      { kind: "improved", tool: "Conditional Access groups", text: "Only the groups your policies actually reference are looked up by default, and the member scan is now a picker so you read the groups you care about instead of every one." },
      { kind: "improved", tool: "All tools", text: "The tools home page is grouped into sections, Help is a full tool with its own tab, and the Exclusion analyzer, Best-practice checks and CA validator keep their results when you switch tabs instead of re-scanning." },
      { kind: "fixed", tool: "Named locations", text: "Locations consumed through “All trusted locations” were reported as unused — nearly every trusted location in a real tenant. Implicit coverage is now resolved and labelled." },
      { kind: "fixed", tool: "Exclusion analyzer", text: "The policy column headers stay in view while scrolling the matrix, and the filter banner stays pinned under the toolbar." },
      { kind: "fixed", tool: "Gap analyse", text: "The policy list's green action bar no longer sits on top of the analysis output." },
    ],
  },
];

// The newest build that has changelog copy — what the overlay compares against.
const CHANGELOG_LATEST = CHANGELOG.length ? CHANGELOG[0].build : 0;
