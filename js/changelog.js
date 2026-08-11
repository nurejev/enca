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
    build: 237, date: "2026-08-11", title: "Read the security story before you sign in",
    items: [
      { kind: "improved", tool: "All tools", text: "The security & risk documentation (SECURITY.md) is now one click away inside the app: a link on the sign-in screen — readable BEFORE trusting the tool with a session — and a 🔒 Security link in the footer of every signed-in screen. It fetches the document that deploys with the site and renders it in the report viewer, so what you read is exactly the revision you are running." },
    ],
  },
  {
    build: 23008, date: "2026-08-11", title: "The security story, written down",
    build: 236, date: "2026-08-11", title: "The security story, written down",
    items: [
      { kind: "new", tool: "All tools", text: "SECURITY.md ships with the repository: how ENCA is built (static, no backend, nothing stored anywhere), the delegated-only permission model and why it cannot exceed the signed-in admin, what leaves the browser (Graph calls and anonymous counts — the complete list), the in-app hardening, and an honest reckoning of residual risks for tenants and for the operator — delegated-write blast radius, supply chain, extensions, lookalikes, local exports — each with its mitigation, plus recommendations for security teams (consent policies, PIM just-in-time, fork-review-pin) and a private vulnerability-reporting channel. Linked from the README's Security section." },
    ],
  },
  {
    build: 23007, date: "2026-08-11", title: "The progress bar reaches every counted loop",
    build: 235, date: "2026-08-11", title: "The progress bar reaches every counted loop",
    items: [
      { kind: "improved", tool: "All tools", text: "The shared count-up bar now also runs wherever a tool walks a counted list: the Exclusion analyzer's group expansion ('Expanding group 4/112' now moves a bar, not just a sentence), the Conditional Access groups scan (group lookups and member reads), the CSV import's user resolution and member reads, the RMAU protection scan, and the Group Analyzer's source-by-source sweep. One visual, same brand colours, everywhere something is fetched at length." },
    ],
  },
  {
    build: 23006, date: "2026-08-11", title: "One progress visual for every long read; impact says who a policy aims at",
    build: 234, date: "2026-08-11", title: "One progress visual for every long read; impact says who a policy aims at",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "A 🔴 verdict said WHO gets hit but not WHY they are in scope. Each policy card now shows the assignment it targets — include and exclude entries by name, straight from the policy in memory, with a link to the full policy card — and every affected user gets a why? button that resolves their directory membership against the policy's includes: 'member of included group X', 'holds included role Y', 'targeted directly', or 'the policy targets All users' (plus the reminder that no exclude entry caught them — that is why the sign-in applied)." },
      { kind: "improved", tool: "All tools", text: "The count-up progress bar the Report-only impact tool introduced is now the one busy visual for everything that reads at length: Sign-in failures (both modes) and the Change audit show the same bar, running count, page number and elapsed time — and Gap analyse drives it through its group-expansion and role-resolution loops, inline next to the status text. Each tool owns its own instance, so two reads running in background tabs never write into each other's panel, and every read survives switching tabs. The audit read is now also capped at 10,000 entries (with a notice when the window truncates) instead of unbounded." },
    ],
  },
  {
    build: 23005, date: "2026-08-11", title: "The progress bar wears the brand",
    build: 233, date: "2026-08-11", title: "The progress bar wears the brand",
    items: [
      { kind: "fixed", tool: "Report-only impact", text: "The busy-state progress bar now fills in the brand's own dark colours — its gradient ended in a colour the brand overrides never touched, so on a branded tenant a stray green leaked into the bar. It now runs deep-to-primary of whatever brand is active (navy under a navy brand, green on the neutral look). Production also picks up the width fix the bar already had in beta — there it could still collapse to a sliver." },
    ],
  },
  {
    build: 23004, date: "2026-08-11", title: "Strengths grow their advanced options; three tools graduate",
    build: 232, date: "2026-08-11", title: "Strengths grow their advanced options; three tools graduate",
    items: [
      { kind: "new", tool: "Authentication strengths", text: "Advanced options, as in the portal: restrict Passkeys (FIDO2) to specific AAGUIDs — with one-click presets for Microsoft Authenticator (Android + iOS) and Windows Hello (hardware, VBS, software), or any custom AAGUID — and restrict certificate-based authentication to specific issuer SKIs and policy OIDs (max 5 each, per Graph). Existing restrictions load with the strength ($expand), show on the cards and in the Markdown report, and edits apply only the difference: create, update or remove per configuration. A new strength carries its restrictions in the create call itself." },
      { kind: "fixed", tool: "All tools", text: "With many tabs open, the tab bar could not be scrolled back to its start — the home button and first tabs were unreachable. A centred flex strip that overflows hides its left side from scrolling entirely (a CSS classic); the strip is now centred with auto-margins instead, which scrolls normally, and switching tools keeps the active tab in view. Tall dialogs (like the grown strength editor) now scroll internally instead of pushing Save off screen." },
      { kind: "improved", tool: "All tools", text: "Out of BETA: 🎫 Authentication contexts, ♻ Recycle bin and 🔗 Group Analyzer — all three at v1.0 after tenant-side use." },
    ],
  },
  {
    build: 23003, date: "2026-08-11", title: "Shorter windows for fresh questions",
    build: 231, date: "2026-08-11", title: "Shorter windows for fresh questions",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "1-hour and 4-hour ranges join 1/7/30 days — flip a policy to report-only, drive some traffic, and check the impact of the last hour without paging in a whole day of a large tenant's log." },
      { kind: "improved", tool: "Sign-in failures", text: "The same 1-hour and 4-hour ranges — when the helpdesk phone rings, the failure is minutes old, not days." },
    ],
  },
  {
    build: 23002, date: "2026-08-11", title: "The long read shows its work",
    build: 230, date: "2026-08-11", title: "Report-only impact: the go-live forecast",
    items: [
      { kind: "new", tool: "Report-only impact", text: "New tool (BETA): what happens the day a report-only policy goes live, answered from the sign-in log. Where Sign-in failures keeps only the failures, this keeps every report-only verdict — so each staged policy gets a denominator and a verdict: 🔴 would block users (who, on which app, how often), 🟡 prompts only (interrupted for MFA or another control they can satisfy), 🟢 no change, or ⚪ no evidence — a staged policy with zero traffic is listed too, because 'no data' is the answer that should stop a go-live. The per-user view flips the question: for this person, the combined effect of everything in report-only at once, worst case first. Distribution bar per policy, per-user drill-down with apps and last-seen, policy names open the policy card, 1/7/30-day window, Markdown export for the change advisory board." },
      { kind: "improved", tool: "Report-only impact", text: "The read shows its work: report-only verdicts cannot be server-filtered, so the whole window is paged in — minutes, not seconds, in a large tenant. The busy state narrates with a running sign-in count, page number and elapsed time, plus a progress bar toward the record cap; switch tabs and back and it picks up mid-flight." },
    ],
  },
  {
    build: 229, date: "2026-08-11", title: "Counting visits, not visitors",
    items: [
      { kind: "new", tool: "All tools", text: "ENCA now measures its own use — and only that. GoatCounter (a privacy-first, cookie-less counter) records page views and one event per tool-screen open: the tool's name and the channel (production or beta), nothing else. No identifiers, no tenant names, nothing from the Graph session; a blocked script changes nothing about how ENCA works. The README's privacy paragraph says exactly this. It answers one question the roadmap needs answered: which of these tools do people actually use." },
    ],
  },
  {
    build: 228, date: "2026-08-11", title: "Terms of use: the PDFs arrive",
    items: [
      { kind: "fixed", tool: "Terms of use", text: "PDFs and languages were invisible and uploads failed — three bugs, one release after shipping. The Graph LIST endpoint never returns the agreement files' content, so every agreement is now fetched individually with $expand=files: languages and the ⭳ PDF download appear on the cards, and the edit dialog lists the current PDFs per language (with the default marker and a view/download button). Creating an agreement failed because the POST included update-only properties — it now sends exactly what the create API accepts (name, view-before-accepting, the PDF) and applies per-device acceptance and the re-accept schedule in a follow-up PATCH. And Save awaits the file reader, so saving immediately after picking a PDF can no longer race the upload." },
    ],
  },
  {
    build: 227, date: "2026-08-10", title: "Two new tools: contexts and strengths",
    items: [
      { kind: "new", tool: "Authentication contexts", text: "A new manage tool (BETA): the Conditional Access authentication contexts — the step-up requirements apps, Protected Actions and sensitivity labels can ask for (c1-c99). Every defined context is a card with its publish state and the policies that enforce it (a published context no policy enforces is called out: callers requesting it get no step-up). Create in a free slot, rename, publish or unpublish with one click, and delete exactly where Graph allows it — unpublished and unreferenced only, behind a typed confirmation. The id is treated as what it is: the contract apps request and the ACRS claim carries, never changeable." },
      { kind: "improved", tool: "List Policies", text: "The dependency popup is now a junction into the manage tools: open an authentication strength, terms-of-use agreement, named location or authentication context from any policy card and a Manage-in-tool button takes you straight to the matching tool, pre-filtered to that item. See it on a policy, fix it in its tool, one click apart." },
      { kind: "new", tool: "Terms of use", text: "A new manage tool (BETA): the terms-of-use agreements Conditional Access can require. Every agreement as a card with its behaviour (view-before-accepting, per-device acceptance, re-accept schedule, expiration), its PDFs per language with direct download, and the policies requiring it. Create an agreement with a PDF upload, edit the behaviour settings, and check acceptances on demand — accepted and declined counts with the latest record, requesting AgreementAcceptance.Read.All only at that moment. Deleting is blocked while any policy still requires the agreement, because that delete would leave the policy with a dangling terms-of-use grant. Replacing a PDF or adding languages stays in the portal for now — the tool says so rather than pretending." },
      { kind: "new", tool: "Recycle bin", text: "A new manage tool (BETA): the Conditional Access recycle bin. Deleted policies and named locations stay restorable for 30 days — this tool lists everything still inside the window with what it did, its state at deletion, when it went and how many days it has left (expiring-soon filter included), and restores with the right guard rails: a policy that was On at deletion enforces again the moment it comes back, so that restore demands a typed confirmation; a name now taken again is flagged before you create a duplicate; a trusted location warns that every All-trusted policy follows it again immediately. After a policy restore the live policy set reloads, so every other tool sees it. (Yes — the delete flows used to say Conditional Access has no recycle bin. It does now, and so does ENCA.)" },
      { kind: "new", tool: "Authentication strengths", text: "A new manage tool (BETA): the Conditional Access authentication strengths. The three built-in strengths appear read-only with their full combination lists; custom strengths can be created, renamed, re-combined and — when no policy grants them — deleted behind a typed confirmation. Each strength is classified by its weakest allowed combination (phishing-resistant / MFA / allows single-factor), each card shows the policies granting it, and the combination picker groups the catalog by class — with the live catalog read from Graph so new methods appear without a code change. Edits use Graph's split model correctly: PATCH for name and description, the dedicated updateAllowedCombinations action for the combinations." },
    ],
  },
  {
    build: 226, date: "2026-08-10", title: "Tabs keep your place",
    items: [
      { kind: "fixed", tool: "All tools", text: "Switching tool tabs no longer jumps to the top of the page \u2014 each screen's scroll position is remembered and restored when you come back. And reopening List Policies (or Create documentation) keeps the cards / list / matrix view you last chose instead of resetting to cards; only Gap analyse still resets, since it shares the screen with a different view. (Production hotfix \u2014 builds 222\u2013225 are on the beta channel.)" },
    ],
  },
  {
    build: 221, date: "2026-08-10", title: "Stop reporting what you already fixed",
    items: [
      { kind: "fixed", tool: "MS Learn checks", text: "A policy that already excluded the shared-device group was still reported as breaking Teams devices. Every one of these checks remediates by adding that exclusion — but the detection never looked at whether it was already there, so CA004 showed the device-code finding while plainly excluding CAB-SEC-U-TeamsSharedDevices on the card above it. A finding whose entire remediation is already in place is not a lesser problem, it is not a problem: those are now suppressed rather than downgraded, and the summary says how many were handled that way so nothing goes quietly missing." },
      { kind: "fixed", tool: "MS Learn checks", text: "The convention groups (break-glass, shared devices) are resolved before the checks run rather than after. They were looked up only to build the fixes, which is why the checks could not tell an existing exclusion from a missing one. It costs one directory lookup before the first paint — a fair trade for not reporting problems that were solved months ago." },
    ],
  },
  {
    build: 220, date: "2026-08-10", title: "The shared-devices group it already had",
    items: [
      { kind: "fixed", tool: "MS Learn checks", text: "The shared-devices fixes asked for a group ENCA already ships. CAB-SEC-U-TeamsSharedDevices is the displayName in the bundled group templates and the name every exclusion in the R26.6 catalog actually uses — CA000, CA004, CA007, CA008, CA014, CA015, CA016 — but it was missing from the list of names these fixes accept, so a tenant that had done exactly the right thing was told six findings needed a group that did not exist. It is now the canonical name; the four older spellings stay as aliases." },
      { kind: "fixed", tool: "MS Learn checks", text: "Create now builds from the bundled template when there is one. It always made a bare, empty role-assignable group — but the shared-devices template is dynamic, with a membership rule that picks up the Teams Rooms resource accounts by their service plans, so it fills itself. The old path left an empty group to populate by hand and named it something the baseline never references. (Role-assignable and dynamic are mutually exclusive in Entra, so the template has to win.)" },
    ],
  },
  {
    build: 219, date: "2026-08-10", title: "Recreates: bring the members, then clean up after",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "Disable nesting is no longer offered on a role-assignable group. Entra already refuses to put a group inside one — “Group nesting isn't supported. A group can't be added as a member of a role-assignable group” — so the property would have changed nothing, and the recreate it may have led to would have been a new object id for no gain at all. The row says why instead." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Recreating a group as role-assignable now carries its members across. It never did: it renamed the original, created the replacement, moved every policy — and left the new group empty, so an include group applied to nobody and an exclude group excluded nobody until someone noticed and copied the members by hand. Both recreate paths use the same move now, and both ask for RoleManagement.ReadWrite.Directory alongside Group.ReadWrite.All, because Microsoft is explicit that Group.ReadWrite.All alone cannot manage the membership of a role-assignable group." },
      { kind: "new", tool: "Conditional Access groups", text: "🧹 Archived groups, in ① Check: the leftovers every recreate deliberately leaves behind — “X (legacy 2026-08-04)”, “X (nesting …)”, “X-static-…” — found, listed and deletable. Each row shows what replaced it, how many members it still has and which policies still reference it. Anything a policy still points at is left unticked, because deleting it would leave that policy targeting nothing; anything still holding members is flagged, because that means its members were never carried across. Typed confirmation, a Markdown record of what was removed, and a reminder that a deleted group is restorable for 30 days — and that Group Analyzer, linked from the dialog, is what tells you whether Intune, licensing or Azure RBAC still point at the old id." },
    ],
  },
  {
    build: 218, date: "2026-08-10", title: "It assigns roles too, so it says so",
    items: [
      { kind: "improved", tool: "List Policies", text: "The action is called Assign groups or roles now — on the selection bar, on the per-policy card, in the help and at the top of the change report. It has been able to set directory roles since build 211, but the label still promised only groups, which is a good way to keep a capability hidden from the people who would use it. The wizard title follows what you are doing: “Assign groups or roles” while you are still choosing, then the specific one." },
    ],
  },
  {
    build: 217, date: "2026-08-10", title: "Legacy auth: the block and the noise — and a scorecard you can click",
    items: [
      { kind: "fixed", tool: "Best-practice & bypass checks", text: "Twelve HIGH findings next to a 100-point legacy signal was both too loud and too quiet. The per-policy 'legacy targeted but not blocked' finding now correlates with the tenant's dedicated block, the way the DRS and platform checks already do: with an enabled tenant-wide legacy block, a grant policy that merely lists legacy client types drops to LOW ('covered by the tenant-wide block' — CA applies the union, the block wins), with the reminder that the block's own exclusions are the only legacy path left. A block that is enabled but narrower than All users downgrades them to MEDIUM instead; no block at all stays HIGH. The scorecard mirrors it: 100 only when the block covers everyone, 70 for a narrower block, 50 report-only, 0 none." },
      { kind: "improved", tool: "Best-practice & bypass checks", text: "The Zero Trust scorecard now filters the findings: click a pillar or a signal and the list below narrows to the finding categories that signal is derived from — 'Legacy authentication blocked' shows only the Legacy Authentication findings, 'Break-glass identified' only Break-Glass Coverage, a pillar shows everything its signals draw on. A dismissable chip in the filter bar names the active categories, the severity chips count only what is on screen, and clicking the same signal again — or All — clears it." },
    ],
  },
  {
    build: 216, date: "2026-08-10", title: "Select all shown, in the role picker",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "The directory-role picker gains Select all shown, which takes whatever the list is currently displaying — so it follows both the “administrator roles only” tickbox and the search box. Search for Teams and it selects every Teams role; untick the filter and it selects every built-in template. It adds to the selection rather than replacing it, so several searches can be combined into one assignment." },
    ],
  },
  {
    build: 215, date: "2026-08-10", title: "The beta banner, front and centre",
    items: [
      { kind: "improved", tool: "All tools", text: "The BETA \u2014 not production marker moved from the top-right corner to the middle of the top bar: a bold red banner centred over the header, unmissable in screenshots and demos alike." },
    ],
  },
  {
    build: 214, date: "2026-08-10", title: "Credit where the block is",
    items: [
      { kind: "fixed", tool: "Best-practice & bypass checks", text: "The scorecard's 'Legacy authentication blocked' signal scored 0 when ANY legacy-auth finding existed — so an unrelated policy that lists legacy client types without blocking them erased the credit for a real, enabled legacy-auth block (e.g. CA002-BLOCK-…-LegacyAuthentication). The signal is now measured from the policies directly: 100 for an enabled block targeting legacy client types, 50 when the block only exists in report-only, 0 when there is none. Findings still tell the full story either way." },
    ],
  },
  {
    build: 213, date: "2026-08-10", title: "A posture score, and seven checks deeper",
    items: [
      { kind: "new", tool: "Best-practice & bypass checks", text: "Zero Trust scorecard — three pillars (Verify explicitly, Least privilege, Assume breach), each a weighted average of 0-100 signals derived from the policy set and the findings, with an overall posture number on the summary and in the Markdown export. A number, not a verdict: it points at the findings, it does not replace them. Modeled on the scorecard in Jhope188's CA Policy Analyzer (independent reimplementation, credited in the README)." },
      { kind: "new", tool: "Best-practice & bypass checks", text: "Seven new checks: no sign-in-risk / no user-risk policy (Identity Protection signals computed but unused), Microsoft-managed policy detection including disabled Baseline Security Mode phantom drafts (MC1246002), platform-scoped policies without an unknown-platform block (the platform condition comes from the user agent, which is spoofable), named-location hygiene (dangling location references, 'All trusted locations' while IP locations sit unmarked, country locations with empty country lists), broad MFA policies with client-app-type holes, disabled resilience defaults, and authentication-context / Protected Actions policies (basic MFA instead of a strength, All-users scoping, report-only step-up, missing break-glass exclusions)." },
      { kind: "new", tool: "All tools", text: "Beta channel: a deployment on any host other than the production one wears a permanent BETA ribbon and a [BETA] page title, so a test deployment can never be mistaken for production." },
    ],
  },
  {
    build: 212, date: "2026-08-04", title: "146 roles, and only one of them showing",
    items: [
      { kind: "fixed", tool: "List Policies", text: "A policy scoped to many things showed only the first of them. The list row and the card summary printed users.inc[0] and nothing else — no count, no ellipsis — so a policy assigned a group plus 145 directory roles read exactly like one assigned a single group, and an assignment that had just been written looked like it had not been. Both now say “+N more”. The applications column already did this; the user column never did." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The assign wizard only reloaded the policies when it was closed with the Close button. Closing it with Cancel, or by clicking outside it, left the app showing the state from before the write. Any way out now reloads, and only when something actually changed." },
      { kind: "improved", tool: "Conditional Access groups", text: "The role picker is about administrator roles, which is what people mean when they ask for them. “All built-in roles” has gone: directoryRoleTemplates includes Guest User, Restricted Guest User, Device Join and the Partner support roles, and offering all 146 behind one button is how a policy ends up scoped to things nobody intended. The list defaults to roles with “Administrator” in the name plus the privileged set, the quick pick selects exactly those, and a tickbox reveals the rest with a note about what is in there." },
    ],
  },
  {
    build: 211, date: "2026-08-04", title: "Assign directory roles, not just groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "The assign wizard can now target a policy's Directory roles — the same include and exclude the portal offers under Users. Choose Groups or Directory roles at the top, and the same actions apply to whichever you picked, bar “Set INCLUDE to All Users”, which has no role equivalent and is hidden. This is the assignment behind every “require MFA for admins” policy, and it was the one thing the wizard could not express." },
      { kind: "new", tool: "Conditional Access groups", text: "Quick picks: Microsoft's privileged set — the fourteen roles Microsoft names as the minimum to require MFA on (Global, Application, Authentication, Billing, Cloud Application, Conditional Access, Exchange, Helpdesk, Password, Privileged Authentication, Privileged Role, Security, SharePoint and User Administrator) — or every built-in role, or clear. The set is held as names and resolved against this tenant's own role templates rather than hard-coded GUIDs, because a wrong GUID would silently target nothing at all." },
      { kind: "improved", tool: "Conditional Access groups", text: "The wizard is explicit about the limit that catches people out: Conditional Access enforces built-in roles only. Custom roles and administrative-unit-scoped assignments are not covered by a policy scoped this way — said at the point of choosing, again in the review, and once more in the change report. Setting include roles on a policy that currently covers All users warns that it will narrow to those roles." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The no-op check that skips policies an assign would not change compared only groups and users. A role-only edit therefore compared equal and would have been skipped on every policy — the run reporting success having written nothing. It compares roles now." },
    ],
  },
  {
    build: 210, date: "2026-08-04", title: "Small things: version on the tool, autofill on the search",
    items: [
      { kind: "improved", tool: "All tools", text: "The version badge now sits on the tool's own header card, not only on the home tile — which is where you are when you wonder whether what you are looking at has changed since last time. Hovering it still gives the full note of what that version covers. It survives the tool re-rendering its own header, so it does not vanish after a scan." },
      { kind: "improved", tool: "Sign-in failures", text: "The search box autocompletes, like the user fields elsewhere in the app. Two sources, in order: the users and apps that actually appear in the current result — the only ones worth typing once a scan has run — and then the directory, for when it has not. Typing two characters searches Entra; focusing the empty box offers what is already on screen." },
    ],
  },
  {
    build: 209, date: "2026-08-04", title: "Sign in without a pop-up (for Edge work profiles)",
    items: [
      { kind: "fixed", tool: "All tools", text: "Microsoft Edge signed into a work profile could loop the sign-in forever, while the same account in the same browser without a profile worked. Edge's automatic profile switching decides a work sign-in belongs to another profile and reopens the pop-up in that profile's window — which severs the link back to the page that opened it. The pop-up then has no way to hand the response back, so Entra just asks again." },
      { kind: "new", tool: "All tools", text: "A redirect sign-in is now available: “Pop-up not working? Sign in without one” under the sign-in button. It navigates this tab instead of opening a window, so there is no opener to lose, and the choice is remembered — the sign-in button uses it from then on, with the link offering to switch back. Returning from it carries straight on into the tenant rather than showing the sign-in screen to somebody who has just signed in. The pop-up remains the default; it keeps the page as you left it." },
      { kind: "improved", tool: "All tools", text: "A pop-up that closes on its own now names Edge's profile switching as the first thing to check, since that is a browser problem with a one-click fix rather than anything to do with the tenant." },
    ],
  },
  {
    build: 208, date: "2026-08-04", title: "The sign-in popup that ate its own answer",
    items: [
      { kind: "fixed", tool: "All tools", text: "Sign-in could loop on Microsoft's account picker: pick an account, land on /common/reprocess, and be asked to pick an account again, forever. The redirect URI is this app's own page, so after authentication the popup navigated back here and loaded the entire application again — every script, and a second MSAL instance — inside a window whose only job was to hand its own URL back to the opener. That second instance could consume the authorization response before the opener read it, leaving the sign-in with nothing to complete and the picker to reappear. The popup, and the hidden iframe used for silent token renewal, now stop loading the moment they see they are carrying an auth response. Nothing else changes: no new redirect URI, so no app registration needs touching." },
    ],
  },
  {
    build: 207, date: "2026-08-04", title: "A sign-in that tells you why it failed",
    items: [
      { kind: "fixed", tool: "All tools", text: "A failed sign-in could return you to the sign-in screen saying nothing at all. MSAL reports user_cancelled for any pop-up that closes without a token — not just the one you close yourself, but also a Conditional Access policy interrupting the sign-in, a tenant that has not consented, or an account blocked from the app — and the handler treated every one of those as “they changed their mind” and returned silently. It now always says what happened, in place under the sign-in button rather than as an alert you dismiss, and recognises the codes that matter: blocked by Conditional Access, MFA needed, device policy, consent missing, app not present in the tenant, redirect URI, wrong account type. Each one says what to do next, and the raw code and timestamp sit underneath in one click-to-select line for a ticket." },
    ],
  },
  {
    build: 206, date: "2026-08-04", title: "The logo, properly this time",
    items: [
      { kind: "fixed", tool: "All tools", text: "205 fixed half of it. The policy-card marks stopped being hard-coded, but they read the deployment's own BRANDING — and a per-audience override does not mutate that. activeBrand() builds a merged copy for the chrome and leaves the global untouched, so under an override the header wore the right logo while every policy card still drew the deployment's. The active look is now published as Brand.current and that is what draws the marks. Exports are deliberately excluded and still carry the neutral product credit, which is the entire point of an override changing chrome only." },
    ],
  },
  {
    build: 205, date: "2026-08-04", title: "A logo that should not have been there",
    items: [
      { kind: "fixed", tool: "All tools", text: "A rebranded deployment was still showing the Limon-IT mark on every policy card. js/branding.js was meant to be the one file that carries the identity, but js/render.js hard-coded assets/logo-mark-light.svg and assets/logo-mark-dark.svg for the two on-screen policy marks, so a fork's own logo never reached them. Both now come from branding, and a wide wordmark keeps its aspect instead of being squashed into a 30-pixel square. Exports are unaffected — they carry the customer's tenant branding and never a product logo, which was already correct." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Disable nesting could be offered on the archived half of an earlier recreate — a group still called “… (legacy 2026-08-04)”. Acting there is wrong twice over: the live group is the one without the suffix, and a recreate would have created a permanent new group still carrying the archive suffix in its name, then renamed the old one to “… (legacy …) (nesting …)”. It now recognises all three archive shapes this tool leaves behind and refuses, pointing at the live group instead." },
      { kind: "new", tool: "All tools", text: "Reports and confirmations that tell you to check Group Analyzer now link to it. Markdown rendering learned links, including an in-app form that closes whatever is open and lands you on the tool — being told to go and find something is not the same as being taken there." },
      { kind: "fixed", tool: "All tools", text: "Builds 203 and 204 were dated 2026-07-28. They were released today. Corrected — and the note on the List Policies mobile fix no longer blames a sticky offset that build 201 had already fixed properly; the real reason that toolbar stops sticking on a phone is that it wraps to five rows and pinning a quarter of the viewport leaves nothing to read." },
    ],
  },
  {
    build: 204, date: "2026-08-04", title: "List Policies on a phone, and more than one scoped admin",
    items: [
      { kind: "improved", tool: "List Policies", text: "Usable on a phone. The toolbar is no longer sticky below 680px — not because the offset was wrong (build 201 already measures that correctly) but because on a narrow screen this particular toolbar wraps to five rows, and pinning a quarter of the viewport leaves nothing to read. The action bar under it stops sticking for the same reason. The policy card was a three-column grid, which at 390 pixels gave columns barely wider than a word; it is one column, with the dividers that assumed three of them removed. And the list table was width:100%, so it crushed its columns instead of scrolling; it scrolls now. The state filters swipe sideways rather than stacking three rows deep, and the action bar wraps to two rows instead of one squeezed line." },
      { kind: "improved", tool: "Protect exclusions", text: "The scoped-administrator box takes more than one account. Separate them with a comma — a break-glass pair, or an admin plus the team that covers them, which is exactly the shape you want when the whole point is that tenant-level admins can no longer manage these groups. Each account is resolved and granted on its own, so one bad UPN no longer costs the others, and every outcome reaches the change report by name; an account that already holds the scoped role is reported as such rather than as a failure. Type-ahead now completes the entry after the last comma instead of searching for the whole line. Applies to both entrances — the standalone tile and CA groups ⑥." },
    ],
  },
  {
    build: 203, date: "2026-08-04", title: "Close the side door: disable group nesting",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "🚫 Disable group nesting (BETA), on any present, non-dynamic group in ① Check. A nested group is an invisible route into a Conditional Access assignment: someone adds a group to a group, a policy's scope widens, and the policy itself was never touched — so nothing in a review of that policy shows it happened. Entra's beta disableNesting property closes it: with the property set, no group can be added as a member. On a persona group, where the whole design assumes membership is deliberate, that is worth having." },
      { kind: "new", tool: "Conditional Access groups", text: "Detection is honest about what it cannot know. A plain read does not return disableNesting at all — only an explicit request for that one property does — so ① Check asks for it separately, after the table is already on screen, and reports three states rather than two: disabled, allowed, or not reported. “Not reported” means this tenant does not surface the property yet; it does not mean nesting is allowed, and the tool does not pretend otherwise." },
      { kind: "new", tool: "Conditional Access groups", text: "The write path tries the harmless thing first. Microsoft documents a dedicated permission for updating this property but does not list the property as updatable, and in the field it currently only takes at creation — so ENCA attempts the in-place change and then reads the value back to confirm, because Entra will happily accept a PATCH and silently ignore a property it does not recognise. Only if that genuinely fails does it offer to recreate the group — rename the current one aside, create it again with nesting disabled, move the user members, repoint every Conditional Access assignment — behind its own separate typed confirmation, never the first one. When Microsoft finishes shipping this, the recreate simply stops being reached." },
      { kind: "new", tool: "Conditional Access groups", text: "It refuses to run on a group that already contains nested groups, and says which ones. A nesting-disabled group cannot hold them, so recreating would quietly drop those memberships — and with them every user who was only a member through the nested group. That is exactly the kind of loss that is discovered months later, so the tool stops and hands you the list instead of proceeding and reporting the damage afterwards." },
      { kind: "new", tool: "Conditional Access groups", text: "If a recreate is needed the group gets a new object ID. Conditional Access assignments are moved for you; app assignments, Intune, group-based licensing and Azure RBAC are not, and the confirmation says so and points at Group Analyzer. The old group is renamed rather than deleted, so it is recoverable, and a failed create rolls the rename back rather than leaving the tenant half-changed. Needs Group-NestingSupport.ReadWrite.All and Group.ReadWrite.All, on demand. Background: Daniel Bradley, ourcloudnetwork.com." },
    ],
  },
  {
    build: 202, date: "2026-07-28", title: "Protect keeps its result",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "Same manners as Sign-in failures now: opening the tool shows a ▶ Scan button instead of immediately reading the directory, the result stays when you switch tabs and come back (until an explicit ⟳ Rescan), and a scan in flight survives navigating away. The shared group scan also loads on demand rather than on open, so just visiting the tool costs nothing. Applies to both entrances — the standalone tile and CA groups ⑥. The scoped-administrator field also auto-completes UPNs now, the same way the What-If user field does." },
    ],
  },
  {
    build: 201, date: "2026-07-28", title: "Sign-in failures, phone-sized",
    items: [
      { kind: "fixed", tool: "All tools", text: "On a phone, the sticky chrome (header, tool tab bar, each screen's toolbar) overlapped the content and stole taps — the layer offsets were hard-coded for a one-row desktop header, and on a narrow screen the header wraps taller. The offsets are now measured from the real header and tab-bar heights (and re-measured on resize and screen changes), so every sticky layer — toolbars, the Help table of contents, the List screen's action bar, the pinned labels — lands where the previous layer actually ends, at any width." },
      { kind: "improved", tool: "Sign-in failures", text: "The per-sign-in list is now the DEFAULT view — a failed sign-in is usually investigated one event at a time, and the newest event is the one you came for; Per policy stays one tap away for the aggregate picture. And because this is exactly the tool that gets opened from a phone when something is blocking someone right now, it now behaves on small screens: full-width search, the policy chips as one swipeable strip instead of a wall, tighter cards with wrapping instead of clipping, and the Per-policy table scrolls sideways." },
    ],
  },
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
