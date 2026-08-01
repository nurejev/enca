// ======================================================================
// Changelog — the source of truth for both the "What's new" overlay shown
// after sign-in and the full changelog page.
//
// HOUSEKEEPING: whenever a tool is added or changed, add a NEW release
// object here for that build, in the same commit as the code, and bump
// APP_BUILD.build in version.js to match.
//
// One release object per build, holding ONLY what changed in that build.
// Do not bump an existing release's number to cover new work — the overlay
// shows every release newer than the build the person last acknowledged, so
// reusing an entry re-shows unrelated older items to people who already
// read them.
//
// kind:  "new"      — a whole tool or capability that did not exist
//        "improved" — an existing tool got better
//        "fixed"    — something was wrong and now is not
// Newest release first.
// ======================================================================
const CHANGELOG = [
  {
    build: 200, date: "2026-07-28", title: "Protect reads top-down",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "The panel now reads in the order you work: the administrative unit, scoped administrator and confirmation first, the group list below it — with a clearer explanation of why only the unprotected ASSIGNED exclusion groups are pre-selected. Dynamic groups are opt-in: their members follow a membership rule, not manual adds — the restriction still guards the group object (rule edits included) — and role-assignable groups are already privileged-only. The confirmation tick also survives toggling groups now." },
    ],
  },
  {
    build: 198, date: "2026-07-28", title: "Protect exclusions gets its own front door",
    items: [
      { kind: "new", tool: "Protect exclusions", text: "The exclusion-group protection workflow is now also a tool of its own on the home grid — same engine as CA groups ⑥ Protect (one state, one renderer, two entrances): restricted management administrative unit created if missing or reused, per-group protection status, optional AU-scoped Groups Administrator, explicit acknowledgement, Markdown report. Opening either view primes the other — the group scan is shared." },
    ],
  },
  {
    build: 197, date: "2026-07-28", title: "Exclusion groups, out of reach",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⑥ Protect — membership of a CA exclusion group is a Conditional Access bypass, and any tenant-level Groups/User Administrator can quietly hand it out. The new tab places the exclusion groups in a restricted management administrative unit (isMemberManagementRestricted — set at creation, immutable), after which only roles scoped to that administrative unit can change their members; tenant-wide admins, Global Administrator included, drop to read. Shows which exclusion groups are already protected, creates or reuses the restricted AU, and can grant one account Groups Administrator scoped to the AU so membership stays manageable — recommended, and called out because it also affects this tool's own ⑤ Import members. Behind an explicit acknowledgement; ends with a Markdown report. Needs AdministrativeUnit.ReadWrite.All (added to the app-registration script — re-run it against an existing app to pick the permission up), the Privileged Role Administrator role, and Entra ID P1 for AU administrators. Cloud security groups only — mail-enabled and on-premises-synced groups are rejected by Graph." },
    ],
  },
  {
    build: 196, date: "2026-07-27", title: "Compare users and Named locations are out of BETA",
    items: [
      { kind: "improved", tool: "Compare users", text: "Out of BETA, at v1.0. Nothing about it changed in this build — the badge is off because the tool has held up: per-policy assignment for two to eight users with the group, role or direct exclusion behind every difference, the membership grid underneath it, and the optional What-If sign-in run per user. It stays read-only and resolves per user, so it is unaffected by tenant size." },
      { kind: "improved", tool: "Named locations", text: "Out of BETA, at v1.4. It still writes to the tenant, and that badge stays: create, edit and delete IP-range and country locations, with CIDR and ISO-code validation, a warning when the trusted flag changes what policies do, and a typed confirmation before deleting a location a policy still references." },
      { kind: "fixed", tool: "All tools", text: "The README still listed Sign-in failures as BETA, three builds after it graduated. Corrected." },
    ],
  },
  {
    build: 195, date: "2026-07-27", title: "The summary follows you down the page",
    items: [
      { kind: "improved", tool: "Group Analyzer", text: "The summary chips now sit in a strip that stays put while you scroll — in both the sweep and the single-group view. On an account with a few hundred references the counts are the navigation (each area chip jumps to its section), and having them scroll away meant returning to the top to move anywhere. The object's name rides along, so it stays obvious whose result you are reading, and in the sweep the search box and the unused-only toggle come with it." },
      { kind: "improved", tool: "Group Analyzer", text: "The single-group header no longer buries the counts under a wall of group memberships. The object ID and the “member of / contains / roles” lines moved into their own card below the strip, where a hundred-group membership list can be as long as it likes." },
    ],
  },
  {
    build: 194, date: "2026-07-27", title: "Sweep only the groups Conditional Access actually uses",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "New sweep scope, and the new default: Only groups used by Conditional Access. It takes the include and exclude groups off every policy already loaded — enabled, report-only and Off alike — so it needs no directory enumeration at all and is bounded by your baseline rather than by the size of the tenant. On a 20 000-group tenant it is the difference between a sweep you plan and one you just run. It is also the question worth asking here: not “which of my 20 000 groups is dead”, but “now that Conditional Access depends on this group, what else does it touch?”" },
      { kind: "new", tool: "Group Analyzer", text: "Dangling references are kept, not dropped. When a policy names a group id the directory can no longer resolve, that row stays in the sweep flagged “not in the directory”, with the policies that name it — because the policy still points at it, so that assignment targets nobody, and a policy quietly scoped to nothing deserves more attention than a group that is merely unused. A chip filters the table down to them, the popup spells out the consequence, and they carry through to the Markdown, HTML and CSV exports." },
      { kind: "improved", tool: "Group Analyzer", text: "Opening the tool no longer reads a page of groups to seed the single-group picker. With the sweep as the default mode that list is not even on screen, so it is fetched when the picker is actually reached — switching to single-group mode, or clicking into the box." },
    ],
  },
  {
    build: 193, date: "2026-07-27", title: "Lemon headings, and the sweep up front",
    items: [
      { kind: "improved", tool: "All tools", text: "In dark, tool card titles are lemon rather than white — the same role the accent plays on limon-it.nl, where it is green in light and lemon in dark. Section labels stay white: on the site only the small eyebrow labels take the accent, headings do not. The BETA pill is now an outlined lemon chip rather than a solid one, because a solid lemon pill sitting beside a lemon title turns the whole line one colour." },
      { kind: "improved", tool: "Group Analyzer", text: "Sweep every group is the default mode. It is the more useful first move — it answers “which of my groups is dead” across the whole tenant, and any single group is one click away from the result." },
      { kind: "improved", tool: "All tools", text: "The NEW badge is off CA validator, What-If and Change audit. They have been in for several builds; a badge that never comes off stops meaning anything." },
    ],
  },
  {
    build: 192, date: "2026-07-27", title: "Dark mode, in Limon-IT colours",
    items: [
      { kind: "improved", tool: "All tools", text: "The dark theme now uses limon-it.nl's own palette, value for value: the background, surfaces, borders, ink and the sage muted tone are lifted straight from the site, and the lemon is the logo lemon (#f7d65a) rather than the duller shade this theme had drifted to. The greens are deeper and greener, so the tools and the site read as one product instead of two." },
      { kind: "improved", tool: "All tools", text: "More than a palette swap: the site's rule is that the green is the surface and the lemon is the signal, and this theme had it the other way round. So in dark, tool titles are white rather than green, the BETA and NEW pills are the site's lemon category pill (uppercase, letter-spaced, dark green text), the primary button is lemon, and the home screen carries the site's two-tone hero glow. Light mode is untouched — there the green is the accent, exactly as on the site." },
      { kind: "fixed", tool: "All tools", text: "Dark-mode rules that need more than a variable swap were only written for the explicit theme picker, so anyone on Auto with a dark OS got the light-mode active tab — white text on green. Every dark rule now exists in both branches, and they are kept in parity." },
      { kind: "fixed", tool: "All tools", text: "The faint tone used for “not applicable” rows and disclosure carets fell below 3:1 against the new, lighter surface. Lifted back over the line; every other text pair in the theme checks out at AA or better." },
    ],
  },
  {
    build: 191, date: "2026-07-27", title: "Group Analyzer: a way back, and a way to sweep less",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "Deep analyze no longer costs you the sweep. Drilling into a single group keeps the finished sweep loaded, and ← Back to the sweep appears above the result to put it straight back — same groups, same search, same “only unused” filter, no second scan. It survives analysing several groups in a row, and is cleared only by a new sweep or Reset." },
      { kind: "new", tool: "Group Analyzer", text: "A sweep can be narrowed by name: starts with, ends with or contains. Naming conventions live at both ends of a name, so a prefix like CAB-SEC- is usually enough to cut a 20 000-group tenant down to the set worth looking at — and “Groups in scope” then counts matches rather than raw groups, so “first 100” means a hundred groups you care about. The filter runs server-side where Graph supports it (endsWith needs $count, which pairs with the ConsistencyLevel header ENCA already sends) and falls back to filtering locally where a tenant rejects it. The scope is carried into the sweep header and into every export." },
      { kind: "new", tool: "Group Analyzer", text: "Purview, as far as Graph allows: the container sensitivity label on a group is now read and reported under Microsoft 365. It is worth having — the label drives the team's and site's privacy, guest access and external sharing, so membership plus label is the real posture. It is also the only part of Purview with a Microsoft Graph surface: DLP policies, retention policies, label publishing policies, insider risk and communication compliance live behind Security & Compliance PowerShell, which a static site cannot call. The help text says so outright rather than letting a clean result imply Purview was checked." },
      { kind: "new", tool: "Group Analyzer", text: "The summary chips do something. In a sweep, “groups” clears the filters, “with no usage found” toggles the unused-only list, “services read” opens the receipt — every service read, what it found and how long it took — and “not read” jumps to the failures. On a single group, each area chip jumps to its section." },
      { kind: "fixed", tool: "All tools", text: "A checkbox sitting inside a What-If–style form field was being inflated into a 38-pixel bordered square: the rule that gives text inputs and selects their height was matching every input, tick boxes included." },
      { kind: "fixed", tool: "Group Analyzer", text: "When all candidate shapes of a call failed, the “Not read” entry said only “none of 3 known shapes worked” and swallowed the individual reasons — the joiner used the same separator the error shortener splits on. The per-URL reasons are back." },
    ],
  },
  {
    build: 190, date: "2026-07-27", title: "Group Analyzer: no second scan, and two calls that were quietly failing",
    items: [
      { kind: "improved", tool: "Group Analyzer", text: "Clicking a group in a tenant sweep no longer re-runs the whole analysis. The sweep already holds every (group, object) hit, so the row now opens a popup that filters what is in memory — instant, on a tenant of any size. The one thing a sweep genuinely cannot know is inheritance, because it matches each group only against itself; the popup says so and offers ⤢ Deep analyze, which re-reads that single group with its parent groups expanded. Markdown, HTML and CSV export straight from the popup, for that group alone." },
      { kind: "fixed", tool: "Group Analyzer", text: "Intune scripts came back 403 while compliance and configuration profiles read fine, which looked like a role problem and was not: PowerShell scripts, macOS shell scripts and remediations sit behind their own permission, DeviceManagementScripts.Read.All, and are not covered by DeviceManagementConfiguration.Read.All. It is now requested with the rest of the Intune area and added to the app registration script." },
      { kind: "fixed", tool: "Group Analyzer", text: "Access packages came back 400 on both calls. The cause was nesting inside an $expand — $expand=accessPackage($select=…) and $expand=resourceRoleScopes($expand=scope,role) — which Graph rejects outright while naming nothing. Both are now single-level expands, and because entitlement management has renamed these relationships between versions before, each call tries a short ladder of known spellings and takes the first that answers instead of failing on the first miss." },
      { kind: "improved", tool: "Group Analyzer", text: "A failure now says what to do about it. Under “Not read”, each entry carries the permission the call needs and, separately, the directory or Intune role the signed-in user needs on top of it — those are different things, and a consented scope is often not enough. A 404 is called out as normal for a workload the tenant does not use, rather than looking like a fault." },
      { kind: "new", tool: "Group Analyzer", text: "Export HTML: a self-contained report — summary cards, every reference grouped by service, and the “Not read” list — that opens on any machine with no access to the tenant. The artefact to attach to a change request when the argument is that a group must not be touched. Available for a single group, for a whole sweep, and from the per-group popup." },
      { kind: "fixed", tool: "Group Analyzer", text: "The tenant-sweep card had a dead band above the search row and its content ran off the right edge: it reused the shared sticky toolbar, which is built for the top of a screen and breaks inside a card that clips its overflow. The card now has its own toolbar and the table scrolls instead of the card." },
      { kind: "improved", tool: "All tools", text: "A failed Graph read used to throw a bare “Graph request failed (403)”. It now carries Graph's own message, code and details — the same treatment writes already had — so every tool says whether it hit a missing scope, a missing role or a malformed query." },
    ],
  },
  {
    build: 189, date: "2026-07-27", title: "Where is this group actually used?",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "New tool (BETA) in Analyse & simulate. A group is a shared handle: one admin scopes a Conditional Access policy to it, another targets an Intune configuration profile at it, a third grants it a role on an Azure subscription — and nobody sees the whole picture, so adding a member has consequences that are invisible at the moment of the change. Paste a group name, a UPN or an object ID and get every place it is referenced, across 23 services: Entra ID (group nesting, administrative units, directory roles including PIM eligibility, enterprise application assignments, group-based licensing, the authentication methods policy, Conditional Access, access packages, admin-consent reviewers and — for a user — what they have actually registered), Intune (enrolment device-limit and platform restrictions, compliance policies, configuration profiles across device / settings catalog / ADMX, PowerShell and shell scripts and remediations, app protection, app configuration, app assignments, Autopilot profiles, Windows update profiles), Microsoft 365 (whether the group is an M365 group with a team on it) and Azure RBAC across every subscription and management group you can read, down to resource scope. After Jasper Baes' Microsoft Cloud Group Analyzer, re-implemented in the browser against delegated permissions — nothing installed, no client secret." },
      { kind: "new", tool: "Group Analyzer", text: "Parent groups are taken along. If the group is nested inside another group, anything targeting the parent reaches these members too — those hits are reported with “via parent group …” in the Matched via column, so an inherited reference is never mistaken for a direct one. For a user, every group they are a member of and every directory role they hold is in scope, so you see what the person is actually subject to." },
      { kind: "new", tool: "Group Analyzer", text: "Sweep every group: the same checks run tenant-wide and produce a group × service count table plus the list of groups nothing references — the starting point for a clean-up. Each service is read once and matched against every group, so a sweep costs little more than a single lookup; the per-group lookups (nesting, administrative units, app assignments, licensing, Teams) are batched 20 at a time through Graph's $batch and can be switched off for a fast first pass. Click any row to analyse that group on its own." },
      { kind: "new", tool: "Group Analyzer", text: "Nothing is read that you did not ask for. Entra, Intune, Microsoft 365 and Azure are ticked independently, and each area asks for its own permissions at the moment you tick it — while the click is still a live user gesture, which is where a consent popup actually survives. Azure is a different resource entirely (management.azure.com), so it gets its own token and its own consent, never bundled with Graph. Any service that failed or was never granted is listed by name with the reason under “Not read”: nothing found only ever means nothing found in what was actually read." },
      { kind: "new", tool: "All tools", text: "The permissions overview on the home screen now lists the six additional read scopes Group Analyzer can ask for and, separately, the Azure Resource Manager permission — marked as its own resource rather than mixed into the Graph consent request." },
    ],
  },
  {
    build: 188, date: "2026-07-23", title: "Compare users, side by side",
    items: [
      { kind: "new", tool: "Compare users", text: "New tool (BETA) in Analyse & simulate: add two to eight users and see where Conditional Access treats them differently. Per enabled or report-only policy, whether each user is included, excluded (hover for the group, role or direct exclusion behind it) or not targeted — rows where the users differ are flagged, and a differences-only toggle (on by default) hides the rest. A membership grid shows the groups and directory roles behind those differences. Optionally describe one What-If sign-in (resource, platform, client, IP/country, device state, risk) and it runs once per user through the What-If engine — a verdict per user, then the per-policy matrix of who it would actually hit. Markdown export of the whole comparison. Resolution is per user (transitiveMemberOf), so no tenant-wide group expansion — it stays fast on any tenant size." },
    ],
  },
  {
    build: 187, date: "2026-07-22", title: "Updates inherit what already works",
    items: [
      { kind: "fixed", tool: "Import", text: "Updating an existing policy (match & replace) could fail with a bare Graph 400 when the newer baseline version carried a terms-of-use or custom authentication-strength id from the source tenant that the dependency map couldn't place — even though the policy being replaced obviously has working ids. Those ids now fall back to the replaced policy's own terms of use / strength (tenant-valid by definition), with a note in the change report. A failed update also now says explicitly that an update is create-new-version-then-switch-old-Off, and that the current policy is untouched and still active when the create fails." },
    ],
  },
  {
    build: 186, date: "2026-07-22", title: "Import members stays inside the baseline",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "⑤ Import members offered every assignable group the scan knew — including ad-hoc groups only referenced by policies, so a persona named Global could auto-map to a Global-U-Exclude-MFA-P exclusion group by name coincidence. The target list (and the auto-mapping) is now restricted to baseline deployment-model groups — the bundled templates and the active catalogs — by default; a checkbox opts the remaining policy-referenced groups back in when you really mean one of them. Mappings you picked by hand are never overwritten by the toggle." },
    ],
  },
  {
    build: 185, date: "2026-07-22", title: "Pilot users, meet your groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⑤ Import members — bulk-add deployment-test users to the CA groups from a CSV, the browser equivalent of the Add-UsersToCAGroup PowerShell script. A UPN column is enough; with a Persona column (multi-persona cells split on , ; | or spaces) every user is auto-routed to the mapped group, pre-matched against the tenant's group names — including abbreviated conventions (internals → …-INT). Users are resolved, existing memberships pre-checked (already-members are skipped, not re-added), and nothing is written until an explicit review step. Dynamic groups are excluded — Entra manages those memberships. Produces a Markdown change report per group. Consents Group.ReadWrite.All on demand." },
      { kind: "improved", tool: "Sign-in failures", text: "Out of BETA." },
    ],
  },
  {
    build: 184, date: "2026-07-22", title: "From a failure to the policy in one click",
    items: [
      { kind: "improved", tool: "Sign-in failures", text: "Policy names are now links that open the policy's card — the same card as in List Policies, with the What-if flow and per-policy actions — from the Per policy table, the pinned label, and the failed-policy lines of an expanded sign-in. Log → policy card → What-If: the whole trace of a failed sign-in without leaving the tool." },
    ],
  },
  {
    build: 183, date: "2026-07-22", title: "Which policy was I reading again?",
    items: [
      { kind: "fixed", tool: "Sign-in failures", text: "Expanding a policy with dozens of sign-ins scrolled the policy's own row — and with it the name — off screen. The expanded list now carries a pinned label with the policy name, sign-in count and unmet controls that stays just below the toolbar while you scroll through it, with an ✕ to collapse the policy from wherever you are." },
    ],
  },
  {
    build: 182, date: "2026-07-22", title: "Help finds its headings again",
    items: [
      { kind: "fixed", tool: "Help", text: "Clicking a section chip in the Help table of contents could scroll the section's heading underneath the ToC itself. The ToC is sticky and wraps to more rows as tools are added — with the Sign-in failures chip it crossed onto a third row at common window widths, and the fixed scroll offset no longer covered it. The jump (and the scroll-spy highlight) now measure the ToC's actual height instead of assuming it." },
    ],
  },
  {
    build: 181, date: "2026-07-22", title: "The sign-in log joins the toolbox",
    items: [
      { kind: "new", tool: "Sign-in failures", text: "New tool. Reads the Entra sign-in log and shows which sign-ins Conditional Access failed and which policy did it — grouped per policy, so the policy generating the noise sits on top, with distinct users, affected apps and the grant controls that weren't met. Two modes: Enforced (conditionalAccessStatus = failure, filtered by Graph) and Report-only (policies that would have failed — the sign-ins complete, so the window is read and filtered in the browser, capped at 10 000). Any logged sign-in can be replayed in What-If with one click — user, app, platform, client, IP, country and device state prefilled — so the log tells you which policy failed and What-If tells you why. Exports: CSV with one line per sign-in × failing policy (pivot-table and SIEM friendly) and a per-policy Markdown report. Needs AuditLog.Read.All, requested when you run it." },
    ],
  },
  // Build 180 ("One file to rebrand a fork", js/branding.js) is deliberately
  // not listed. This changelog is what a tenant-side reader sees; how the repo
  // is re-skinned for a fork is not their release note. The capability is
  // documented in README.md under "Rebranding a fork".
  {
    build: 179, date: "2026-07-22", title: "Make dynamic: a create that was not a create",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "⟳ Make dynamic could report success while doing damage. Group creation reuses a group of the same name if it finds one, and the directory is eventually consistent — so straight after the rename the lookup still returned the OLD group and handed back its id. The add and remove steps then ran against the same id, which stripped the group from every policy it was assigned to instead of replacing it. Creation is now forced (no name reuse) and, as a second guard, the run aborts and rolls the rename back if the new group ever comes back with the id of the old one — before any policy is touched. The change report now prints both ids. If you ran this on build 178 and the two ids in the report are identical, the group's policy assignments were removed: re-add it with Assign → ADD to EXCLUDE." },
    ],
  },
  {
    build: 178, date: "2026-07-22", title: "Convert a group to dynamic membership",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⟳ Make dynamic on any group the template says should be dynamic but the tenant has as assigned. A plain security group is converted in place — same id, so every policy, app and role assignment keeps pointing at it. A role-assignable group cannot be dynamic at all (Entra makes the two mutually exclusive, and isAssignableToRole is immutable), so it is replaced: the old group is renamed -static-YYYYMMDD and kept as the rollback, a dynamic group is created under the original name, added to every policy that referenced the old one, and only then is the old one removed from those policies — so no policy is left without either group mid-flight. Typed confirmation, a step-by-step log and a change report, and the warning that the replacement is not role-assignable." },
    ],
  },
  {
    build: 177, date: "2026-07-22", title: "Clear a search in one click",
    items: [
      { kind: "improved", tool: "All tools", text: "Every search box now has a × to clear it — all eight of them, from the policy list to Change audit — and Escape does the same while the box has focus. It appears only when there is something to clear." },
    ],
  },
  {
    build: 176, date: "2026-07-22", title: "Named locations: a report per location, and config snapshots",
    items: [
      { kind: "new", tool: "Named locations", text: "Click a location name — in cards or the table — to open its report: every range or country, what the trusted flag actually means for it, and the full list of policies that name it plus the ones covering it via “All trusted locations”, each clickable through to the policy card. The cards now only summarise usage, so eighteen policy names no longer fill them." },
      { kind: "new", tool: "Named locations", text: "📄 Documentation (MD) writes up a single location on its own, next to the existing whole-inventory export." },
      { kind: "new", tool: "Named locations", text: "⭳ Export JSON saves the configuration of every location, and ⇄ Compare loads an earlier export back to show what moved: changed ranges, countries or trusted flags, locations that have since been deleted, and ones created since. Matched by display name, with a Markdown export of the differences." },
    ],
  },
  {
    build: 175, date: "2026-07-22", title: "An unknown app no longer costs you the whole policy",
    items: [
      { kind: "fixed", tool: "Import", text: "A policy that excludes a Microsoft first-party app this tenant has no service principal for — the Defender apps the baseline exempts, for instance — was rejected outright by Graph with a bare 400, losing the policy. If the service principal cannot be created, the importer now retries once without that reference and the policy lands (Off). Every drop is listed in the change report, with the warning that a dropped exclusion makes the policy apply more widely than the source did." },
      { kind: "improved", tool: "Import", text: "A 400 now names the specific application it could not resolve — “no service principal for MicrosoftDefenderATP XPlat (a3b7…)” instead of “references 2 application(s) by id”." },
    ],
  },
  {
    build: 174, date: "2026-07-22", title: "Named locations: tighter cards and a table view",
    items: [
      { kind: "improved", tool: "Named locations", text: "Cards are smaller and now tile in a grid — at least two side by side, more on a wide screen — with the Edit and Delete buttons on their own row and the policy list capped so one location used by thirty policies cannot stretch its card past the rest." },
      { kind: "new", tool: "Named locations", text: "A Table view next to Cards: name, type, definition, which policies use it (named or via “All trusted”) and the actions, one line per location. On a tenant with dozens of locations this is the view you actually want." },
    ],
  },
  {
    build: 173, date: "2026-07-22", title: "CA validator: open the policy from the report",
    items: [
      { kind: "improved", tool: "CA validator", text: "Click a policy name in the validation report — compact or detailed view — and its full policy card opens, so you can check the actual assignment behind a simulated result without leaving the tool. In the detailed view the rest of the header still collapses the table." },
      { kind: "improved", tool: "CA validator", text: "Out of BETA: it now carries the NEW badge, like What-If and Change audit." },
    ],
  },
  {
    build: 172, date: "2026-07-22", title: "Change audit leaves BETA",
    items: [
      { kind: "improved", tool: "Change audit", text: "Out of BETA — it has proven itself on a large tenant (thousands of entries, summary roll-up, snapshot compare), so it now carries the same NEW badge as What-If. Nothing about how it works changed." },
    ],
  },
  {
    build: 171, date: "2026-07-22", title: "CA Doc is now ENCA — new name, new address",
    items: [
      { kind: "improved", tool: "All tools", text: "The toolset is renamed ENCA (Entra Conditional Access) and now lives at enca.limon-it.nl. cadoc.limon-it.nl redirects, so old bookmarks and the footer on documents you generated earlier keep working. Nothing about your tenant changes: the app registration keeps the same application ID, so no one has to consent again." },
      { kind: "fixed", tool: "Change audit", text: "Audit snapshots exported under the old name (schema cadoc-audit/1) still load for comparison — the rename does not orphan the history you already collected." },
      { kind: "fixed", tool: "All tools", text: "Arriving for the first time no longer opens the whole changelog at once, just the newest release. This matters right now because the new address is a new origin, so every browser looks like a first visit." },
    ],
  },
  {
    build: 170, date: "2026-07-22", title: "Workload ID licence check and post-import housekeeping",
    items: [
      { kind: "improved", tool: "Import", text: "Conditional Access for workload identities needs the separately purchased Microsoft Entra Workload ID licence, which is not part of Entra ID P1 or P2. The importer now reads the tenant's subscriptions first: without that licence the CA900-range policies are marked 🔒 and left out entirely instead of being attempted and rejected by Graph with a bare 400. The change report says which ones were held back and how to get the licence." },
      { kind: "new", tool: "List Policies", text: "🧹 Housekeeping — a match & replace import leaves the version it supersedes in place, switched Off, as your rollback, and nothing ever cleaned those up. The button appears when such policies exist, lists each one next to the policy that replaced it, and hands the ones you tick to the normal delete flow with its JSON backup and typed confirmation." },
    ],
  },
  {
    build: 169, date: "2026-07-21", title: "Imports that were failing with a bare 400",
    items: [
      { kind: "fixed", tool: "Import", text: "Policies that exclude Microsoft first-party apps — Defender for Endpoint, Defender for Mobile TVM, Device Registration Service — failed with an unexplained 400 on tenants that had never used those apps, because a policy can only name an application that has a service principal here. The importer now checks every referenced app up front and creates the missing service principals before importing." },
      { kind: "fixed", tool: "Import", text: "Workload-identity policies no longer have a persona deploy group forced onto them. Graph rejects a policy that carries both a service-principal scope and a user scope, which is why the WorkloadIDs policies failed; their assignment is now kept as-is, like E-Admins." },
      { kind: "improved", tool: "Import", text: "A 400 from Graph now names the likely cause — app references needing a service principal, a workload-identity scope conflict, insider risk, or a terms of use that must exist first — instead of just the raw error." },
    ],
  },
  {
    build: 168, date: "2026-07-21", title: "A clearer home button",
    items: [
      { kind: "improved", tool: "All tools", text: "Both home controls — the icon in the tab bar and the Tools button in the header — now use a drawn house icon instead of a glyph, bigger and easier to hit, and the tab-bar one highlights when you are on the tools page." },
    ],
  },
  {
    build: 166, date: "2026-07-21", title: "The selection bar sits where it should",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The green selection bar overlapped the toolbar whenever the toolbar wrapped to a second row — searching, or a narrower window, was enough to trigger it. Its position is now measured from the toolbar's real height, and it wraps rather than clipping its own buttons." },
    ],
  },
  {
    build: 165, date: "2026-07-21", title: "Audit snapshots you can compare against",
    items: [
      { kind: "new", tool: "Change audit", text: "Export the current read as JSON, then load that snapshot on a later run to see what has happened since. Entra only keeps about 30 days of audit log and nothing is stored server-side, so exporting is how you build real history: new entries are badged and filterable, and anything the snapshot holds that Entra has since dropped is listed separately — at that point your export is the only copy." },
    ],
  },
  {
    build: 164, date: "2026-07-21", title: "A readable change audit on busy tenants",
    items: [
      { kind: "improved", tool: "Change audit", text: "Opens on a Summary view that rolls the log up per resource — one row per policy or group with how many adds, removes and updates it saw, how many distinct people moved, and who did it. On a large tenant that turns thousands of near-identical entitlement-management events into a handful of readable rows; click one for the individual changes, or switch to Timeline for the raw feed." },
    ],
  },
  {
    build: 163, date: "2026-07-21", title: "Change audit defaults and a read that holds",
    items: [
      { kind: "improved", tool: "Change audit", text: "Defaults to the last 7 days." },
      { kind: "fixed", tool: "Change audit", text: "A read in progress now survives switching tabs — come back and it is still running, or already finished, instead of showing the Run button again and starting a second read." },
    ],
  },
  {
    build: 162, date: "2026-07-21", title: "Auditing exclusion group membership",
    items: [
      { kind: "new", tool: "Change audit", text: "Also watches membership of the groups your policies include or exclude. Adding someone to an exclusion group widens a bypass without any policy being edited, so it never appears as a policy change — those additions and removals are now listed alongside, showing who was moved, to which group, by whom, and which policies that group exempts them from." },
    ],
  },
  {
    build: 161, date: "2026-07-21", title: "What's new, and a changelog page",
    items: [
      { kind: "new", tool: "What's new", text: "A “What's new” overlay after sign-in showing only what has landed since your last visit, and a full changelog page listing every release — reachable from its own tile, the tab bar, or by clicking the build number in the footer." },
    ],
  },
  {
    build: 160, date: "2026-07-21", title: "Setup script covers the audit permission",
    items: [
      { kind: "fixed", tool: "Setup", text: "The app-registration script now registers and consents AuditLog.Read.All, so Change audit works after a fresh setup. Re-run it against your existing app to add the permission." },
    ],
  },
  {
    build: 159, date: "2026-07-21", title: "Session-only policies are simulated",
    items: [
      { kind: "improved", tool: "CA validator", text: "Policies with only session controls are simulated instead of skipped — sign-in frequency, persistent browser, token protection, app-enforced restrictions, MDA app control and CAE now appear as expected controls carrying their configured value. Only a policy with no controls at all is skipped." },
      { kind: "improved", tool: "CA validator", text: "Both views group policies by persona." },
    ],
  },
  {
    build: 158, date: "2026-07-21", title: "Change audit, and sections on the home page",
    items: [
      { kind: "new", tool: "Change audit", text: "New tool. Reads the Entra directory audit log and shows who changed which Conditional Access resource, when, and exactly what changed — a field-level diff (state: report-only → enabled, one group added to an exclusion) rather than a wall of JSON. Covers policies, named locations, authentication strengths and contexts, and terms of use, with the actor and their source IP. Needs the AuditLog.Read.All permission, requested when you run it." },
      { kind: "improved", tool: "All tools", text: "The tools home page is grouped into sections — explore and document, analyse and simulate, compare against a baseline, manage the tenant — now that the tool count has grown." },
    ],
  },
  {
    build: 157, date: "2026-07-21", title: "Exclusion risk review",
    items: [
      { kind: "new", tool: "Exclusion analyzer", text: "New Risk review: every policy with exclusions scored for governance — privileged roles or all guests excluded, direct user exclusions, oversized exclusion lists, stale disabled accounts (including ones sitting inside an excluded group) and report-only exclusions — worst first, with the reasoning. Flag patterns follow Tiago S. Carvalho's CA exclusions audit." },
    ],
  },
  {
    build: 156, date: "2026-07-21", title: "Leaner group lookups",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "A scope selector, defaulting to only the groups your policies actually reference, so a big tenant no longer looks up every template and baseline group. The member scan is now a picker — read the groups you care about instead of all of them, since each one costs a Graph call." },
    ],
  },
  {
    build: 155, date: "2026-07-21", title: "Named location usage fixed",
    items: [
      { kind: "fixed", tool: "Named locations", text: "Locations consumed through “All trusted locations” were reported as unused — nearly every trusted location in a real tenant. That implicit coverage is now resolved and labelled separately from a direct reference." },
      { kind: "improved", tool: "Named locations", text: "Global Secure Access compliant-network locations are recognised as their own type instead of being shown as IP ranges, and marked service-managed." },
    ],
  },
  {
    build: 154, date: "2026-07-21", title: "The exclusion matrix keeps its headers",
    items: [
      { kind: "fixed", tool: "Exclusion analyzer", text: "The policy column headers and the exclusion column stay pinned while you scroll the matrix, so you can always tell which policy a mark belongs to." },
    ],
  },
  {
    build: 152, date: "2026-07-21", title: "Named locations",
    items: [
      { kind: "new", tool: "Named locations", text: "New tool. View, create, edit and delete the IP-range and country named locations your policies target, and see which policies use each one. Validates CIDR (IPv4 and IPv6) and ISO country codes, warns when changing the trusted flag would move policies that use “All trusted locations”, and requires a typed confirmation before deleting a location a policy still references." },
    ],
  },
  {
    build: 151, date: "2026-07-21", title: "Group members, and a cleaner Gap analyse",
    items: [
      { kind: "improved", tool: "Exclusion analyzer", text: "A group's member count is now a link that opens the member list with UPNs, plus a CSV export." },
      { kind: "fixed", tool: "Gap analyse", text: "The policy list's green action bar no longer sits on top of the analysis output, and the policy-only search and filters are hidden in that view." },
    ],
  },
  {
    build: 148, date: "2026-07-21", title: "What-If",
    items: [
      { kind: "new", tool: "What-If", text: "New tool. Describe a sign-in — user, target resource, platform, client app, IP or country, device state and risk — and every enabled or report-only policy is evaluated against it: which apply, with the grant and session controls to satisfy, and which do not, each with the first condition that wasn't met. Mirrors the Entra What If tool." },
    ],
  },
  {
    build: 147, date: "2026-07-21", title: "Validator scoping made complete",
    items: [
      { kind: "fixed", tool: "CA validator", text: "Running against a persona group now shows the catch-all policies that reach it alongside its own, honours exclusions on a group it is nested inside, and lists the policies that do not reach it with the reason rather than dropping them silently." },
    ],
  },
  {
    build: 146, date: "2026-07-21", title: "Baseline diffs and target autocomplete",
    items: [
      { kind: "improved", tool: "Baseline Policies", text: "A Changes column shows what a newer baseline version actually changes against the deployed policy — added and removed assignments, and grant or session control differences." },
      { kind: "improved", tool: "CA validator", text: "The “Run against” box suggests matching groups and users as you type." },
    ],
  },
  {
    build: 145, date: "2026-07-21", title: "A compact validator view",
    items: [
      { kind: "improved", tool: "CA validator", text: "Opens on a Compact view — one summary card per policy showing what it enforces, on which apps, clients and conditions, and who it does not apply to — instead of every simulation as its own row. Detailed keeps the full grid." },
    ],
  },
  {
    build: 144, date: "2026-07-21", title: "Results that stick around",
    items: [
      { kind: "improved", tool: "All tools", text: "The Exclusion analyzer, Best-practice checks and CA validator no longer re-scan every time you come back to their tab — the result is cached, with a Run button to start and Rescan to refresh." },
      { kind: "improved", tool: "All tools", text: "A close-all-tabs button in the tab bar, and Help moved to the end of the tool list." },
      { kind: "fixed", tool: "All tools", text: "Mobile: filter chips and the validator's target row wrap properly, and wide report tables scroll inside their own container instead of pushing the page off-screen." },
    ],
  },
  {
    build: 143, date: "2026-07-21", title: "Run the validator against one persona",
    items: [
      { kind: "new", tool: "CA validator", text: "A “Run against” box scopes the whole report to a single persona group or user — only the policies that actually apply to that principal, with their group and role membership taken into account." },
    ],
  },
  {
    build: 142, date: "2026-07-21", title: "CA validator",
    items: [
      { kind: "new", tool: "CA validator", text: "New tool. For each policy, the sign-in simulations it implies and the control each one should — or should not — enforce, with the excluded side inverted to prove the policy does not fire there. Ported from Jasper Baes' Conditional Access Validator." },
    ],
  },
  {
    build: 140, date: "2026-07-21", title: "Help as a proper tool",
    items: [
      { kind: "new", tool: "Help", text: "Help is a full tool with its own page and tab, documenting every tool, each option and what to expect from it, with a sticky table of contents that follows you as you scroll." },
    ],
  },
  {
    build: 137, date: "2026-07-21", title: "Smarter imports",
    items: [
      { kind: "new", tool: "Import", text: "Choose an assignment mode: deploy new policies onto the persona deploy groups, or match & replace — a policy already in the tenant keeps its current assignment and state, gains any new exclusion groups the update adds, and the superseded version is switched Off." },
    ],
  },
  {
    build: 132, date: "2026-07-21", title: "Click to filter the exclusion matrix",
    items: [
      { kind: "improved", tool: "Exclusion analyzer", text: "Click a user or group row, or a policy column, to filter the matrix down to what is actually in scope and drop the empty cells." },
    ],
  },
  {
    build: 131, date: "2026-07-21", title: "Baseline groups and the R26.6 catalog",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "One-click create for a missing baseline group, including TeamsSharedDevices as a dynamic group with the Teams Rooms membership rule, and a recreate path for a group that should be role-assignable but isn't." },
      { kind: "improved", tool: "Baseline Policies", text: "Catalog updated to the 2026-07-21 R26.6 export, including the new TeamsSharedDevices exclusion on the global session and risk policies." },
    ],
  },
];

// The newest build that has changelog copy — what the overlay compares against.
const CHANGELOG_LATEST = CHANGELOG.length ? CHANGELOG[0].build : 0;
