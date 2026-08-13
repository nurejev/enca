// ======================================================================
// Changelog — the source of truth for both the "What's new" overlay shown
// after sign-in and the full changelog page.
//
// HOUSEKEEPING: whenever a tool is added or changed, add a NEW release
// object here for that build, in the same commit as the code, and bump
// APP_BUILD.build in version.js to match.
//
// AND js/promote.js — the beta-channel promotion queue shown in Help. Same
// commit, same discipline: a change that reaches beta without an entry there
// becomes invisible when deciding what to push to production.
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
    build: 25037, date: "2026-08-13", title: "Three more items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now build 258. Items 8 (pickers above their lists on an administrative unit card) and 10 (one restricted administrative unit per persona, with the derived-check fix from build 25036) have shipped, and item 9 turned out to have gone to production back in build 256 without the queue being told — the exact failure this list warns about in its own header, so the numbers were reconciled against what main actually contains rather than against what the queue claimed. Item 11 (the Import protection preflight) now stands alone, since its dependency is live." },
    ],
  },
  {
    build: 25036, date: "2026-08-13", title: "The baseline check no longer offers to create what is already there",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "After creating the nine units the panel could still read “0 present · 9 missing” and offer to create them again, while the cards immediately below it showed all nine sitting in the tenant. The check was computed once and cached on the panel's state, so ⟳ Refresh — and any other re-render — updated the list of units without updating the verdict about them. The check is now derived on every render from the units currently loaded, so the panel and the cards can no longer disagree." },
      { kind: "improved", tool: "Restricted AUs", text: "Units created in this session are held as present even if a subsequent read does not show them yet. Directory writes are not read-your-writes consistent, so a re-read seconds after a create can legitimately come back without them — and a panel that offers to create what it has just created is worse than one running a few seconds behind the tenant. Ticks you made are kept across the refresh, minus anything that is no longer missing." },
    ],
  },
  {
    build: 25035, date: "2026-08-13", title: "Import checks the vaults before it fills them",
    items: [
      { kind: "new", tool: "Import", text: "A protection preflight sits above the policy list. It checks that a restricted administrative unit exists for each persona your selection actually touches — usually two or three, not all nine — and offers to create the missing ones, restricted, with you scoped as Groups Administrator. Creating them is a separate click from Import on purpose: creating administrative units and granting yourself a role is a different kind of act from restoring policies and should not ride along inside a button labelled Import. It never blocks the import either — skip it and everything still lands, just unprotected, and the report names each group." },
      { kind: "new", tool: "Import", text: "Every group the import CREATES is added to its persona's restricted unit, so a tenant-wide Groups Administrator cannot afterwards widen a Conditional Access exclusion. A group that already existed is left alone — it may be where it is on purpose, and that is not the import's decision. A group used by TWO personas is not placed either: an object can sit in several restricted units and a scoped administrator on any one of them can manage it, so filing a shared group under one persona would hand that persona's administrator control of the other's exclusions, and filing it under both would hand it to either. The report names every unplaced group and says which of the two reasons applies." },
      { kind: "fixed", tool: "Import", text: "The import report claimed every group it created was “(assigned, role-assignable)”. That stopped being true in build 254, when the baseline moved off role-assignable groups — a role-assignable group's members can only be changed by Global Administrator or Privileged Role Administrator, neither of which can be assigned at administrative-unit scope, so such a group inside a restricted unit has nobody who can edit it. The groups were already being created correctly; only the report was wrong, and it is the sort of line that gets quoted into a design document." },
      { kind: "improved", tool: "Import", text: "A failed placement is reported, never swallowed: the group exists and the policies will use it either way, so nothing about the tenant would reveal the gap. Each one is listed as “the group exists and is in use, but is not protected”. If the administrative units cannot be read at all, the panel says it could not check rather than reporting everything present." },
    ],
  },
  {
    build: 25034, date: "2026-08-13", title: "Help catches up with the baseline panel",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "The Help section still described the tool as it was before build 25033 — it said nothing about the persona baseline check, so the first thing the tool now shows was the one thing the documentation did not mention. Help now covers why there is one unit per persona rather than one shared vault, that creating a unit also grants you Groups Administrator scoped to it and why that second half is not optional, and what to do about a name already taken by a non-restricted unit. The permissions footnote also notes that directory writes are not read-your-writes consistent, so a unit that has just been created may lag the list below it." },
    ],
  },
  {
    build: 25033, date: "2026-08-13", title: "One restricted administrative unit per persona",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "The tool now opens with a BASELINE panel that checks the tenant for the nine administrative units the baseline expects — CAB-SEC-RMAU-GLO / ADM / INT / EXT / GUESTUSERS / GUESTAdmins / SA / DevOps / FW-Exclusions — and offers to create the missing ones. One unit per persona is the point: a scoped administrator for the Admins exclusions should not be able to touch the Externals exclusions, and a single shared unit gives exactly that. Each unit is created with isMemberManagementRestricted, and the account running it is granted Groups Administrator scoped to the unit in the same step — an administrative unit with no scoped administrator is a vault nobody can open, because the restricted flag is precisely what blocks the tenant-wide roles. Select all, tick individually, or produce a Markdown report of the current state." },
      { kind: "new", tool: "Restricted AUs", text: "A name clash is called out rather than silently skipped. If an administrative unit already exists under an expected name but WITHOUT the restricted flag, it is shown as “name taken — not restricted” and is not offered for creation: the flag is set at creation and is immutable, so that unit cannot be upgraded. The fix is to rename it and create a restricted replacement, or to adopt a different name for the persona — and the report says so in as many words." },
      { kind: "improved", tool: "Restricted AUs", text: "The creation log survives the re-read that follows it. Each unit reports its two outcomes separately — created, and scoped administrator granted — because a unit that exists but has no administrator is a real half-outcome, not a failure, and it is the case most worth reading. Directory writes are not read-your-writes consistent, so the summary is carried over from what actually happened rather than inferred from the list that is re-fetched afterwards." },
    ],
  },
  {
    build: 25032, date: "2026-08-12", title: "Sections collapse again",
    items: [
      { kind: "fixed", tool: "All tools", text: "Manage the tenant and Analyse & simulate started EXPANDED. Cause: flagged tiles (NEW / BETA / UPDATED) were exempt from the collapse and sat on top of the four-tile budget rather than inside it — and with six flagged tools in one section that meant ten of eleven tiles showing, which is the opposite of collapsing. Flagged tiles now claim the four slots FIRST, in page order, but do not add to them, so both sections start collapsed as intended. Anything flagged that still does not fit is counted on the button — “Show 7 more · 2 new or beta” — so it is announced rather than silently buried. Tile order never changes; only visibility does." },
    ],
  },
  {
    build: 25031, date: "2026-08-12", title: "The picker comes before the list",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "On an administrative-unit card, the add-member box and the grant-a-scoped-administrator row now sit ABOVE their lists instead of below them. A protected AU can hold dozens of groups, and with the list first the input you opened the card to use was pushed off the bottom — you scrolled past everything to reach the one control that does something. Both sections read heading → picker → list now, and the empty scoped-role message says “grant one above” to match." },
    ],
  },
  {
    build: 25030, date: "2026-08-12", title: "Six items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now v1.0.254. Items 1, 2, 3, 4, 5 and 7 have been re-landed there and are removed from 🚚 Waiting for production: no longer creating role-assignable groups, ⑥ Protect refusing them (with select-all and ⟳ Re-check), the ⑦ Migrate wizard, the new ② Create model with an optional restricted AU, the ③ Members add bar, and the two roadmap cards. What remains on this channel: item 6, your own single-tenant app registration — plus the CIS Benchmark and this queue itself, both beta-only by design and now listed as such rather than left to look forgotten." },
    ],
  },
  {
    build: 25029, date: "2026-08-12", title: "Re-check protection without starting over",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "\u27f3 Re-check protection sits next to the Protect button. The protection column is a point-in-time read \u2014 somebody may have protected a group from the portal, \u2466 Migrate may have replaced one, or an earlier run may have half-succeeded \u2014 and until now the only way to refresh it was to leave the tab and rescan, losing the selection you had built. It re-reads each candidate\u2019s administrative-unit membership and the list of restricted AUs (one may have been created since), keeps your selection, and drops any group that is protected now, whose checkbox goes disabled in the same pass. A group whose re-read fails keeps its previous answer rather than being reported as unprotected." },
    ],
  },
  {
    build: 25028, date: "2026-08-12", title: "Picking a suggestion sticks",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Choosing a name from the scoped-administrator suggestions filled the field and then immediately reopened the dropdown over it, so the choice looked as though it had not taken. Cause: selecting from a <datalist> fires the same input event as typing does, so the pick re-ran the directory query, rewrote the options, and the browser reopened the list. A query is now skipped when the field exactly matches an option already offered \u2014 which means the value came from the list rather than the keyboard. Typing something new still searches, so nothing is lost." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The same fix on the \u2462 Members \u002b Add bar (user and group) and on the Restricted AUs add-member box \u2014 all four type-ahead fields in the tool behaved this way, so all four are guarded rather than only the one that was reported." },
    ],
  },
  {
    build: 25027, date: "2026-08-12", title: "A list of what is waiting for production",
    items: [
      { kind: "new", tool: "All tools", text: "Help gains 🚚 Waiting for production, visible ONLY on the beta channel — the same non-production host test the BETA ribbon uses, so nobody on enca.limon-it.nl sees a list of things they do not have. It shows both build numbers and every promotable change as a NUMBERED row with what it is, why it matters, the beta builds it spans, the files it touches, and a risk rating: high means a real problem in production until it lands, medium a missing capability with nothing broken, low convenience or documentation. The numbers are stable and hand-assigned so a change can be named out loud — \u201cpush number 3 to main\u201d. A second list records what is deliberately NOT promoted (today the CIS Benchmark) so the absence reads as a decision rather than an oversight. It is hand-maintained in js/promote.js, because the app is static files in a browser and cannot read git or diff two branches \u2014 the section says so itself, and tells you to trust the changelog and the build numbers over the table if they ever disagree." },
    ],
  },
  {
    build: 25026, date: "2026-08-12", title: "Stop creating role-assignable groups",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "The baseline no longer creates role-assignable groups. The default changed at the source: Assign.createGroup used to make every ASSIGNED group role-assignable unless told otherwise, which is why the whole estate ended up that way \u2014 it now creates an ordinary security group, and only an explicit roleAssignable:true still asks for one. The \u2461 Create builder drops the checkbox and gains a PROTECTION section instead: assigned or dynamic, with an optional placement in a restricted management administrative unit (existing one, or create the default). The order trap is stated rather than discovered \u2014 once a group is in the AU only an AU-scoped role can add members, so for an assigned group you add members first and protect afterwards, while a dynamic group fills itself from its rule and is safe to protect at creation." },
      { kind: "improved", tool: "Conditional Access groups", text: "\u21bb Recreate role-assignable is removed, and its modal with it rather than left dead in the file where it would be one wire away from creating them again. The \u2460 Check drift flag is INVERTED: a plain assigned group used to be reported as drift for not being role-assignable, which is now backwards \u2014 a role-assignable group is the one with somewhere to go, and its row carries a button into \u2466 Migrate. MS Learn\u2019s create-the-missing-group fix also stops asking for role-assignable." },
      { kind: "improved", tool: "All tools", text: "New on the roadmap: \ud83e\uddf9 Retire role-assignable groups everywhere, marked started \u2014 with what is done and what is not. Still carrying the old shape: the bundled group templates and the baseline catalog, the MS Learn and CIS checks, Group Analyzer and the documentation exports, and the persona import path, which should create protected groups directly instead of leaving protection as a later step. Production keeps creating role-assignable groups until this reaches it." },
    ],
  },
  {
    build: 25025, date: "2026-08-12", title: "Roadmap: group actions where you are already looking",
    items: [
      { kind: "improved", tool: "All tools", text: "New on the roadmap: \ud83c\udf9b Group actions where you are already looking. Clicking a group in \u2460 Check opens a card that only READS \u2014 object id, type, the policies that include or exclude it, its members. Everything you might then want to DO lives on a different numbered tab, so you close the card, find the right step, and hunt for the group again. List Policies already solves this: every policy card carries its own Documentation, Backup, Assign and Policy-state buttons. The plan is the same treatment for a group \u2014 create (\u2461), members (\u2462), assign (\u2463), import members (\u2464), protect (\u2465), migrate (\u2466), disable nesting, and open it in \ud83d\udd17 Group Analyzer \u2014 with each action offered only when it actually applies, so a role-assignable group is not offered \u2465 Protect and one already in a restricted AU is not offered it twice." },
    ],
  },
  {
    build: 25024, date: "2026-08-12", title: "The add bar fills in the obvious answer",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2462 Members: when only one group\u2019s members are loaded, the add bar fills that group in \u2014 there is only one possible answer, so making you pick it was busywork \u2014 and the hint says so. With several groups loaded it keeps whatever you used last, but only if that group is still loaded; otherwise it clears the field rather than leaving a stale name behind, because guessing among several groups is how a member lands in the wrong exclusion." },
    ],
  },
  {
    build: 25023, date: "2026-08-12", title: "Select all in Protect, and honest wording about role-assignable groups",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "Select-all / deselect-all above the exclusion-group list. \u201cAll\u201d means all SELECTABLE: a role-assignable group or one already inside a restricted AU has a disabled checkbox, so they are neither counted nor toggled \u2014 an \u2018all\u2019 that includes rows you cannot tick is a lie, and the counter says how many cannot be added." },
      { kind: "fixed", tool: "Protect exclusions", text: "The list header still read \u201crole-assignable groups are already modifiable only by privileged roles\u201d, which implied adding them was merely unnecessary. It is not: a restricted AU blocks Global Administrator and Privileged Role Administrator, the only roles that can edit a role-assignable group\u2019s members, so a group carrying both protections has nobody who can change them. The header now says they cannot be added and points at \u2466 Migrate to convert them first." },
    ],
  },
  {
    build: 25022, date: "2026-08-12", title: "Add a member without leaving the matrix",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "\u2462 Members gains an \u002b Add bar. Type two letters and the directory suggests users by display name or UPN; the group side offers the groups whose members are already loaded, so the matrix can show the result immediately instead of asking you to re-read. The new member appears straight away and the group is then re-read to confirm it \u2014 directory writes are not read-your-writes consistent, so the optimistic row stands if the read has not caught up. Adding someone already in the group says so rather than failing, and an unknown group or an empty field is refused before any write." },
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate keeps the restricted-AU choice, the nesting toggle, the acknowledgement and the Migrate button pinned to the bottom of the panel while you scroll the group list. Picking the last of forty groups no longer means scrolling back down to find the button." },
    ],
  },
  {
    build: 25021, date: "2026-08-12", title: "Migrate asks before it scans, and looks like the rest of the tool",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate scanned the moment you opened the tab, which is the wrong manners for the most expensive read in the tool \u2014 it checks every role-assignable group for directory-role assignments and restricted-AU membership, and counts each one\u2019s members. A \u25b6 Scan button now starts it, exactly like \u2465 Protect: a scan in flight survives navigating away, the result stays until an explicit rescan, and the gate says what will be read and that nothing is written." },
      { kind: "improved", tool: "Conditional Access groups", text: "The wizard is laid out like the rest of Conditional Access groups \u2014 .cg-panel sections with the same uppercase headings and the same scrolling pick list \u2014 instead of borrowing Drift watch\u2019s card styling, which made step \u2466 look like a different tool bolted on. A failed scan now offers \u25b6 Try again in the same panel style rather than a bare error line." },
    ],
  },
  {
    build: 25020, date: "2026-08-12", title: "Say how many members are about to move",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate\u2019s step 3 read \u201cCopy the members across\u201d with no number, because the group scan does not load members \u2014 so the one figure worth checking before migrating a break-glass group was missing. The scan now counts them, and counts them the SAME WAY THE COPY READS THEM: direct members of every type, via /groups/{id}/members. The \u2462 Members tab deliberately counts something else (transitiveMembers of type user), and quoting that number here would have promised a total the copy does not move. The step also now says the archived group keeps its own copy \u2014 the migration copies rather than moves, which is exactly what makes the archived original a working rollback. Where the count cannot be read the step says so instead of silently omitting it." },
    ],
  },
  {
    build: 25019, date: "2026-08-12", title: "Migrate in stages if you want to",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate gains a select-all / deselect-all control above the list, with a live \u201cN of M selected\u201d count that follows the individual checkboxes rather than drifting from them." },
      { kind: "improved", tool: "Conditional Access groups", text: "Placing the new groups in a restricted AU is now optional. Untick it and the migration converts the groups \u2014 recreated as plain, members carried, policies repointed \u2014 and stops there, so you can verify the membership before restricting who may manage it. The step list, the acknowledgement text and the Markdown report all follow the choice instead of promising something that will not happen, and the wizard is explicit that a converted-but-unplaced group is an ordinary group any tenant-wide Groups Administrator can edit. Finishing later needs nothing new: they are plain groups now, so \u2465 Protect picks them up like any other \u2014 the results screen carries a button straight to it." },
    ],
  },
  {
    build: 25018, date: "2026-08-12", title: "Migrate the baseline off role-assignable groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "\u2466 Migrate (BETA) moves the baseline from role-assignable groups to a restricted management administrative unit. Role-assignable was only ever used here for a side effect \u2014 membership reachable only by Global Administrator or Privileged Role Administrator \u2014 and a restricted AU does that better, because it lets you NAME who may manage the groups. It also sheds the role-assignable costs: the 500-per-tenant cap, no dynamic membership, no control over nesting. The two cannot be combined, which is what forces a migration rather than simply protecting in place. isAssignableToRole is immutable, so each group is RECREATED, and the order is the safety property: rename the current group aside as \u201c(migrated YYYY-MM-DD)\u201d, create a plain group under the original name with nesting disabled by default, COPY THE MEMBERS, add the new group to every policy, remove the old one, and only then place the new group in the restricted AU. Members move before the AU placement because afterwards only an AU-scoped role could add them; the new group joins each policy before the old one leaves, so no exclusion ever briefly disappears. Skipped with the reason shown: a group that holds a directory role (a plain group cannot carry one), one already inside a restricted AU, one missing from the tenant, one already plain \u2014 and one whose role check failed, which is skipped rather than risked. Typed acknowledgement, live per-group progress, Markdown report, and the archived originals keep their members as your rollback until you delete them from \ud83e\uddf9 Archived groups." },
      { kind: "improved", tool: "Conditional Access groups", text: "\ud83e\uddf9 Archived groups now also finds the \u201c(migrated \u2026)\u201d leftovers the new wizard creates, so the housekeeping that deletes them is the same one you already use for (legacy \u2026), (nesting \u2026) and -static-\u2026 archives." },
    ],
  },
  {
    build: 25017, date: "2026-08-12", title: "Two protections that cancel each other out",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "The tool would let you put a ROLE-ASSIGNABLE group into a restricted management administrative unit. Do that and nobody can change its members again: a role-assignable group admits only Global Administrator or Privileged Role Administrator (owners aside), a restricted AU blocks exactly those two, and neither role can be assigned at AU scope. For a break-glass exclusion group, discovering that during an incident would be the worst possible moment. Such groups were already left unticked, but the reason given was wrong \u2014 \u201calready modifiable only by privileged roles; adding it is optional\u201d \u2014 and nothing stopped you ticking one. Now the checkbox is disabled, the row says plainly what would happen, and the write filters them out as well, because a selection can survive a rescan. It is recoverable if you already did it: Global Administrator and Privileged Role Administrator can still manage the AU itself, so remove the group from the restricted AU and its membership becomes editable again (allow up to 30 minutes for protections to lift)." },
      { kind: "improved", tool: "Conditional Access groups", text: "The \u2465 Protect help and the Restricted AUs help both state the mutual exclusion, and which to choose: for a CA exclusion group a restricted AU is usually the better of the two, because it lets you name who may manage the members instead of leaving it to whoever holds Privileged Role Administrator." },
    ],
  },
  {
    build: 25016, date: "2026-08-12", title: "Where to host your own copy",
    items: [
      { kind: "improved", tool: "All tools", text: "SINGLE-TENANT.md gains a \u201cWhere to host it\u201d section, because the obvious answer has a trap in it: a PRIVATE GitHub repository still gives you a PUBLIC website. Publishing Pages from a private repo needs Pro, Team or Enterprise Cloud, and restricting who may VIEW the site is Enterprise Cloud only \u2014 so on Pro or Team you get private source and a public site. The section says plainly what a public site does and does not expose: the client ID is not a secret (a SPA is a public client by design, which is why there is no client secret), no tenant data is ever written to the files, and with -RequireAssignment an unassigned visitor cannot get past sign-in anyway \u2014 but your OWN changes are visible, including the CA exclusion group names in js/groupTemplates.js, which is the reason to pick a gated host if that matters to you. Also the two things that bite on Pages: delete the upstream CNAME or your fork fights enca.limon-it.nl for the domain, and a project page serves from a subpath (https://org.github.io/enca/) which must be registered as the redirect URI exactly, trailing slash included \u2014 the app computes its own redirect URI from origin + pathname, so it asks for precisely that. A comparison table covers Azure Static Web Apps, Storage + Front Door and an internal server for anyone who needs the site itself private." },
    ],
  },
  {
    build: 25015, date: "2026-08-12", title: "Lock the app to yourself first, widen later",
    items: [
      { kind: "new", tool: "All tools", text: "New-EncaAppRegistration.ps1 gains -RequireAssignment. It sets \u201cAssignment required\u201d on the enterprise application (servicePrincipal.appRoleAssignmentRequired) and assigns the account running the script, so from that moment only you can open the tool \u2014 everyone else is refused at sign-in with AADSTS50105 until you widen it. Add others in the same run with -AssignTo, by UPN or group display name, or later from Entra ID > Enterprise applications > Users and groups. Order matters and the script enforces it: the requirement is switched on only AFTER at least one principal is successfully assigned, and you are always the first tried \u2014 flipping it first would seal the app shut with nobody able to open it, including the person who just created it. If nothing could be assigned it says so and leaves the requirement off. Documented in SINGLE-TENANT.md with the caveats that bite: Entra ignores NESTED groups for app assignment (direct membership only, and it fails silently), guests need assigning too, and this gates who may OPEN the tool rather than what they can do inside \u2014 an assigned Global Administrator is still a Global Administrator. It is a front door, not a permission model." },
    ],
  },
  {
    build: 25014, date: "2026-08-12", title: "Run ENCA on your own app registration",
    items: [
      { kind: "new", tool: "All tools", text: "\ud83c\udfe2 Your own single-tenant app registration is no longer a roadmap item — it is a supported route with a manual. ./New-EncaAppRegistration.ps1 -SingleTenant creates an AzureADMyOrg registration inside your tenant (SPA platform, PKCE, no secret, implicit grant off), points it at your own redirect URIs, and prints the client ID and authority to paste. Those go in a new js/authConfig.local.js, which the app merges over its defaults — so your tenant-specific values never touch a file upstream also edits, and pulling a later release stays a clean merge instead of a conflict on every version bump. SINGLE-TENANT.md is the walkthrough: prerequisites, five steps, how to verify it worked, the errors you will hit (AADSTS50011 is a redirect-URI mismatch, AADSTS700016 is the wrong client ID), and the part people skip — a pinned copy stops receiving fixes the moment you pin it, so the guide shows how to diff against upstream and read the What's-new entries in between. Readable inside the app from the roadmap card. The sign-in mechanism does not change; what changes is who owns the registration, and so who can review, audit and revoke it." },
      { kind: "improved", tool: "All tools", text: "A tool that is NEW, BETA or UPDATED is now exempt from the home-page collapse entirely, rather than merely counted on the \u25bc Show more button. Announcing a release and then hiding it behind a toggle was the opposite of a release. Flagged tools are shown on top of the four-tile budget, not out of it, so the everyday tools stay visible too, and the button counts only what is genuinely hidden (and disappears when nothing is). New \u2018UPDATED\u2019 chip for a tool that changed in the current release, alongside NEW and BETA \u2014 carried this cycle by List Policies, Conditional Access groups and Protect exclusions. The convention, including clearing UPDATED at the start of the next cycle, is written next to the tiles in index.html, because a stale flag quietly defeats the collapse." },
    ],
  },
  {
    build: 25013, date: "2026-08-12", title: "Where beta and production stand",
    items: [
      { kind: "improved", tool: "All tools", text: "PRODUCTION PARITY, as of production build 253. Everything on this channel has now been carried to enca.limon-it.nl except the CIS Benchmark. Landed in 253: 🛡 Restricted AUs and ⌨️ the command palette (both keeping their BETA tag), the ⑥ Protect 400 'conflicting object' fix, the missing CAB-SEC-U-CA1009-Exclusion group template, the representative demo group sample, the 🎯 CA result card in the per-policy What-If, and thirteen roadmap entries. Landed earlier, in 252: 📉 Drift watch (BETA) and the collapsed home-page sections; in 251: Report-only impact out of BETA and the NEW badge off Sign-in failures." },
      { kind: "improved", tool: "All tools", text: "STILL BETA-ONLY: 📐 CIS Benchmark (v0.5) — the tenant's CA policies scored against CIS Microsoft 365 Foundations Benchmark v7.0.0 section 5.2.2. It stays here until it has been run against enough real tenants to trust its verdicts in production. Everything else on this site also exists on production; where a tool differs, this channel is the newer one." },
      { kind: "improved", tool: "All tools", text: "HOW TO READ THIS: builds here are five digits (NNNII — 25013 renders as v1.0.250-beta.13), production builds are plain integers (253). The two series never collide, and each is monotone on its own site, so the What's-new overlay behaves the same on either. A change lands here first, then as its own production build — the two branches are not merged, so a feature exists twice in the history under two numbers." },
    ],
  },
  {
    build: 25012, date: "2026-08-12", title: "A removed member actually leaves the card",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Removing a member (or a scoped role grant) left the row on the card. The tool was already discarding its cache and re-reading after the write — the problem is that Entra directory writes are not read-your-writes consistent: the DELETE returns 204 and the very next GET of the same collection still lists the object, so the honest re-read faithfully restored the row that had just been deleted. Changes now apply to the card immediately and are then confirmed against the directory with backoff (three tries over about four seconds). If the directory has not caught up by then the card keeps showing what you did rather than resurrecting a deleted row, and a second toast says the directory is still catching up. Adding a member has the same lag in the other direction and gets the same treatment, and both boxes clear once the entry is on the list." },
    ],
  },
  {
    build: 25011, date: "2026-08-12", title: "Granting a scoped administrator stops fighting the directory role",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Granting a scoped administrator could fail with 400 \"A conflicting object with one or more of the specified property values is present in the directory\". Cause: GET /directoryRoles only returns roles that are ACTIVATED in the tenant, so a role that exists but is not returned by the lookup looks absent — and the obvious next step, activating it, conflicts with the role that was there all along. Resolution is now a ladder: the documented alternate-key GET /directoryRoles(roleTemplateId='…'), then $filter, then activation, and if activation conflicts, an unfiltered list matched client-side (case-insensitively) that no declined filter can defeat. A conflict is read as evidence the role exists, not as a failure. A genuine 403 still surfaces, and if the role really is absent the message says so rather than silently grabbing the wrong role." },
      { kind: "fixed", tool: "Restricted AUs", text: "Granting someone who already holds that role on that administrative unit now says exactly that — \"already holds that role on this administrative unit, nothing to change\" — and refreshes the card, instead of relaying Graph's conflict wording as though something had broken." },
      { kind: "fixed", tool: "Protect exclusions", text: "The ⑥ Protect flow's scoped-administrator grant activated the Groups Administrator role the same fragile way and could fail identically. Both now share the one resilient resolver." },
    ],
  },
  {
    build: 25010, date: "2026-08-12", title: "The baseline reconciles; demo stops lying about it",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "The baseline catalog referenced CAB-SEC-U-CA1009-Exclusion — the exclusion for CA1009, which blocks non-DevOps personas from Azure DevOps — but no group template defined it. The Check tab therefore expected a group it could never offer to create, and the ✎ Create action had no template to build from. The template is added, and catalog and templates now reconcile exactly: every one of the 98 group names the baseline references has a template, and no template is orphaned." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Demo mode showed the first 24 group templates in file order, which happened to be BreakGlass plus twenty-odd consecutive numbered exclusions — so the persona groups and the Emergency_Access pair never appeared, and demo mode read as though the baseline had forgotten them. It now shows a representative sample: every named group (personas, break-glass, Teams shared devices, deployment groups, Emergency_Access1 and 2) followed by one exclusion per persona band, so the numbering scheme is visible instead of twenty neighbours from the same range." },
      { kind: "fixed", tool: "Restricted AUs", text: "👤 Scoped admins did nothing when the card was already expanded — it re-opened an open card and scrolled to the button you had just pressed. It now lands on the grant box, focuses it and flashes it briefly, so it gives feedback whether the card was open or closed." },
    ],
  },
  {
    build: 25009, date: "2026-08-12", title: "The home page stops being a wall",
    items: [
      { kind: "improved", tool: "All tools", text: "Each section on the home page now shows its first four tools, with the rest behind a ▼ Show N more toggle — Analyse & simulate had grown to ten tiles and Manage the tenant to eleven, which is a lot to scroll past to reach the section you wanted. Sections of four or fewer are untouched, so no button appears where there is nothing to hide. Your choice per section is remembered between visits. Two things kept honest: a tool that just shipped cannot vanish silently, so the button counts the hidden NEW and BETA tiles (\"Show 7 more · 4 new or beta\"), and hidden tiles stay fully reachable — the tab bar, the + menu, roadmap links and Ctrl+K all open them exactly as before, because collapsing the grid must not amputate navigation. Sections are keyed by their heading, not their position, so adding a section later does not re-collapse a different one." },
    ],
  },
  {
    build: 25008, date: "2026-08-12", title: "Drift watch says which side failed",
    items: [
      { kind: "fixed", tool: "Drift watch", text: "A snapshot taken before build 25005 recorded Authentication strengths as unreadable (the $expand 400 fixed in that build), and every later comparison against that file kept reporting it — in red, as though the tenant were refusing the read right now. The area now says which side failed. A snapshot that lacks an area is marked 'stale snapshot' in muted type and tells you the fix: take a fresh snapshot and it is covered from then on. A failure in the current run stays red, because that one is real. When both sides failed, both reasons are given — before, only the snapshot's was, which hid a live problem behind an old one. The summary line makes the same split instead of counting them together." },
    ],
  },
  {
    build: 25007, date: "2026-08-12", title: "Restricted AUs stop making you type from memory",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "Both boxes on an AU card now suggest. Add member is pre-seeded with your baseline group names before you type a character — those are the groups the administrative unit exists to protect, so the common case is now a pick rather than a recall — and folds in live directory results for any other group or user as you type. The scoped-administrator box suggests users from Entra by display name or UPN, the same type-ahead the Protect flow has always had. Restricted AUs also gains a help section covering the parts that surprise people: roles are not granted in the Edit dialog, the restricted flag is immutable, and a 403 on a member change is the shield working." },
      { kind: "new", tool: "All tools", text: "Roadmap: 🍴 Fork detection and update-from-upstream. A tenant that forks, reviews and pins its own copy — which the security document recommends for high-assurance environments — stops hearing about fixes the moment it does. The plan is for a forked deployment to notice it is one, say how many builds behind it is, show the What's-new entries between its pinned build and upstream, and give the commands to pull main in and re-review the diff. Deliberately not auto-updating: that would defeat the reason for forking." },
    ],
  },
  {
    build: 25006, date: "2026-08-12", title: "Ctrl+K, and two tools grow up",
    items: [
      { kind: "new", tool: "All tools", text: "⌨️ Command palette (BETA): Ctrl+K — ⌘+K on a Mac — anywhere in the app opens a search box. Type a few letters and Enter lands you in the tool; type a CA number or part of a policy name and it opens that policy card directly, without going through List Policies first. Matching takes initials as well as substrings, so 'gap' finds Gap analyse and 'bpbc' finds Best-practice & bypass checks. Arrows move, Enter opens, Esc or Ctrl+K closes, clicking outside closes. Tools are searchable before sign-in, and the footer says how many policies are searchable rather than promising some that are not loaded yet. Straight off the roadmap: past twenty-odd tools a tile grid stops being the fastest way in." },
      { kind: "improved", tool: "Restricted AUs", text: "Granting a scoped administrator was only reachable by clicking a card header — so people looked under ✎ Edit, which is a PATCH of the AU's own name and description and says nothing about roles. Each card now carries a 👤 Scoped admins button, with the current count, that opens the panel where roles are granted and revoked; the Edit dialog points at it instead of leaving the question hanging." },
      { kind: "improved", tool: "Report-only impact", text: "Out of BETA. The go-live forecast has held up: per-policy would-be-denied / interrupted / unchanged read from the sign-in log, per-user worst case, verdict chips including the staged policy with no traffic at all, 1-hour to 30-day windows and a Markdown export." },
      { kind: "improved", tool: "Sign-in failures", text: "The NEW badge is retired — it has been in production long enough that the label had stopped meaning anything." },
    ],
  },
  {
    build: 25005, date: "2026-08-12", title: "Drift watch: readable cards, and strengths that actually read",
    items: [
      { kind: "fixed", tool: "Drift watch", text: "The result cards had no padding — text sat flush against the card border and the longest lines ran into it. Cause: the shared .list-card sets overflow:hidden and deliberately leaves spacing to whatever it wraps, which for every other tool is a table carrying its own cell padding. Drift watch wraps plain prose, so it needed its own. Long Graph error text now wraps instead of widening the card." },
      { kind: "fixed", tool: "Drift watch", text: "Authentication strengths came back as 'not captured' in tenants that reject $expand: /policies/authenticationStrengthPolicies?$expand=combinationConfigurations returns 400 'Query option Expand is not allowed' in some directories. The read now falls back to the plain shape — the same retry the Authentication strengths tool has always had — so the area is captured instead of skipped. And if one snapshot used the rich shape while the other fell back, the area says so, because fields missing from one side are an artefact of the read, not drift anybody caused." },
    ],
  },
  {
    build: 25004, date: "2026-08-12", title: "Drift watch — does the tenant still look like we left it?",
    items: [
      { kind: "new", tool: "Drift watch", text: "New beta-only tool answering the question Change audit cannot: does the Conditional Access configuration still look like it did when we signed it off? Take a snapshot — policies, named locations, authentication strengths and authentication contexts, downloaded as one JSON file you keep — then load it back days, months or a year later and the tenant is re-read and compared object by object. No server, nothing uploaded, and no 30-day limit, because the history is your file rather than Microsoft's audit log (which keeps ~30 days on P1/P2 and 7 otherwise). Findings are ranked the way the risk actually runs: a policy switched Off or down to report-only, an exclusion widened, a named location turned trusted are Critical; a rename is Low. GUIDs resolve to group and location names, and fields that move on their own (modifiedDateTime) are ignored, so a policy nobody touched reads as unchanged instead of as noise. An area that failed to read is reported as 'not captured' — never as 'no drift', because a clean bill of health nobody verified is worse than no answer. Run 🕓 Change audit first and each drifted object also names who changed it, for changes still inside audit retention; older drift is shown without attribution rather than with a guess. Markdown report for the review file. The field-level diff engine is the audit tool's, reused rather than reimplemented, so a change reads the same in both places." },
      { kind: "improved", tool: "All tools", text: "The roadmap grew by twelve: 📉 Drift watch (in beta today), 🖥 Compliant-device reality check and ↩️ Undo for writes join Next; 🏢 Several tenants at once, 🌐 Named locations vs. the sign-in log, 🤝 Cross-tenant access settings, 🎫 CAE and token protection coverage and 📋 Change plan export join Later; 🚀 Go-live checklist, 📏 Naming-convention linter, 🇳🇱 Dutch interface and ⌨️ Command palette sit on the horizon. Two are worth calling out as blind spots rather than features: a grant control demanding a compliant device is only worth what Intune's compliance policies are worth, and nothing checks that half today; and trusted IP ranges routinely outlive the offices they describe. Build 25004 (v1.0.250-beta.4)." },
    ],
  },
  {
    build: 25003, date: "2026-08-12", onlyBrand: "pvm", title: "The house look follows the account",
    items: [
      { kind: "improved", tool: "All tools", text: "Signing in with an @perfettivanmelle.onmicrosoft.com account now applies the Perfetti Van Melle look automatically, exactly as @pvmict.com already did — no need for the branded front door. (This entry is visible only on branded sessions.)" },
    ],
  },
  {
    build: 25002, date: "2026-08-12", title: "Bring your own app registration — on the map",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap's Next era gains 🏢 Your own single-tenant app registration. Today every tenant consents to one multi-tenant application owned by Limon-IT; the plan is to let a tenant register ENCA as a single-tenant SPA (AzureADMyOrg) of its own — own client ID, own consent record, own redirect URIs, own audit trail — so no application outside the directory holds a delegated grant. The sign-in platform is unchanged either way (SPA, authorization code + PKCE, no client secret); what moves is ownership of the registration. Security & risk has recommended this for high-assurance tenants all along — the work is making it a supported path (a -SingleTenant switch on the registration script, a client ID read from configuration, and a guide to the trade-off) instead of a manual fork-and-edit. The card links straight into the security document. Build 25002 (v1.0.250-beta.2)." },
    ],
  },
  {
    build: 25001, date: "2026-08-11", title: "Baseline tenants say so",
    items: [
      { kind: "improved", tool: "All tools", text: "Signing in from a baseline tenant now shows a 🧪 badge next to the tenant name: this session has more options than a regular tenant — the Gap and MS Learn checks review the persona baseline including policies deployed Off, and MS Learn's Apply-fixes can write here. The behaviour existed; now it announces itself instead of being a hidden mode. (Production took 249 for its own change, so this cycle targets 250 — build 25001, v1.0.250-beta.1.)" },
    ],
  },
  {
    build: 24901, date: "2026-08-11", title: "Restricted AUs joins the roadmap",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap's Next era now names 🛡 Restricted AUs alongside the CIS Benchmark — in beta today, clickable straight into the tool here (and to the beta site when read from production). Production took release 248 for its side of this change, so the beta cycle now targets 249 — this build is 24901 (v1.0.249-beta.1)." },
    ],
  },
  {
    build: 24801, date: "2026-08-11", title: "Restricted AUs: the vaults get a face",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "New beta-only tool managing restricted management administrative units — the vaults the ⑥ Protect flow creates around CA exclusion groups. Every AU listed (restricted first, standard for context), each expandable to its members — group members carry badges showing which CA policies include or exclude them — and its scoped role grants. Add a member by group name or user UPN, remove one, grant or revoke a scoped administrator (Groups, User, Helpdesk or License Administrator), edit name and description, create new (the restricted flag is set at creation and immutable — the tool says so instead of letting you find out), delete with typed confirmation and the honest warning that members merely lose their shield. A 403 on member changes is explained for what it is: the protection working. Markdown export for the review file. Note the version: production overtook the old cycle number, so beta now targets release 248 — this build is 24801 (v1.0.248-beta.1)." },
      { kind: "improved", tool: "All tools", text: "The roadmap's 🔓 Revoke-permissions-when-done idea is marked partially done: the Permissions panel's How-to-revoke guide (three routes, ready-to-run PowerShell, honest consequences) shipped as the first step — the one-click version remains on the map, with the design constraint documented in the guide itself." },
    ],
  },
  {
    build: 23018, date: "2026-08-11", title: "The inline bar centres like everything else",
    items: [
      { kind: "fixed", tool: "All tools", text: "The inline progress bar (RMAU scan, CSV import, CA groups scan) hugged the left edge while the spinner and status text sat centred — it now centres with them." },
    ],
  },
  {
    build: 23017, date: "2026-08-11", title: "Gap analyse gets the full busy panel",
    items: [
      { kind: "improved", tool: "Gap analyse", text: "The matrix build showed only a status sentence with a small inline bar — easy to miss and visibly not the same component every other long read uses. It now shows the full shared busy panel in place of the results: spinner, wide brand-coloured bar driven by the counted phases (group expansion, role resolution), and the current phase with elapsed time. The one-line status next to the Run button stays for a glance." },
    ],
  },
  {
    build: 23016, date: "2026-08-11", title: "Assign groups works again",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The Assign groups or roles wizard opened to an empty dialog — just Cancel and Next. Cause: a duplicate element id. The Authentication strengths tool (added in build 227) reused the wizard's asBody id for its own screen, and the browser hands back whichever comes first in the document — so the wizard had been writing its steps into a hidden screen ever since. The strengths screen's element is renamed and every step renders in the dialog again. Lesson absorbed: new tools get prefix-checked against existing ids." },
    ],
  },
  {
    build: 23015, date: "2026-08-11", title: "Roadmap mentions are doors",
    items: [
      { kind: "improved", tool: "All tools", text: "Tool names on the roadmap timeline are now clickable — 🎚 Report-only impact, 💪 Authentication strengths and 📋 What's new open the tool itself, and 📐 CIS Benchmark opens where it lives: the tool here on the beta site, the beta site itself when read from production." },
    ],
  },
  {
    build: 23014, date: "2026-08-11", title: "Consent, and the way back out",
    items: [
      { kind: "new", tool: "All tools", text: "The Permissions panel gains a 🔒 How to revoke button: an expandable guide to taking consent away again — self-service via myaccount.microsoft.com, the Enterprise-applications route for admins, and the surgical Graph PowerShell (with this deployment's real client ID, copy button included) that strips the write scopes while keeping the read base. With the consequences stated honestly: nothing breaks (tools simply re-prompt on the click, the same model that granted them), it is not instant (issued tokens live ~1 hour — pair with Revoke-MgUserSignInSession), an AllPrincipals grant re-prompts every user while a Principal grant hits one account, and the deletion lands in the audit log. Doing this from inside the app would need DelegatedPermissionGrant.ReadWrite.All — a bigger permission than the ones being cleaned up — which is exactly why it is a documented procedure here and a careful roadmap item, not a button that writes." },
    ],
  },
  {
    build: 23013, date: "2026-08-11", title: "Beta exclusives say so",
    items: [
      { kind: "improved", tool: "All tools", text: "Tools that run only on the beta site now carry an 'only here' chip on their home tile (today: 📐 CIS Benchmark) — and the production site grew a matching card pointing at the beta site, so on either channel it is visible which tools are beta-exclusive and where to find them." },
    ],
  },
  {
    build: 23012, date: "2026-08-11", title: "The roadmap becomes a timeline",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap now reads as a timeline running from Now into the future: what shipped recently anchors the top, then Next (📐 CIS Benchmark alignment — in beta today, graduating once proven against enough real tenants — 🔐 improving security, 🔓 revoking permissions when done), Later (✏️ editable policies) and On the horizon (🏗 the policy builder, which builds on editing). The line literally fades toward the future, because that part is steered by what users ask for." },
    ],
  },
  {
    build: 23011, date: "2026-08-11", title: "The roadmap, in the open",
    items: [
      { kind: "new", tool: "All tools", text: "A 🗺 Roadmap card sits next to What's new and Help: where ENCA is heading, stated in the open — 🔐 implementing the security documentation's own hardening advice as defaults, ✏️ editing a policy's conditions and controls from its card with a field-level diff before the PATCH, 🏗 a guided policy builder that preflights in What-If and creates in report-only by default, and 🔓 one click to drop the consented write scopes when the work is done, so sessions end least-privileged. Order and scope follow real-tenant feedback." },
    ],
  },
  {
    build: 23010, date: "2026-08-11", title: "The security document reads like a document",
    items: [
      { kind: "fixed", tool: "All tools", text: "The in-app security documentation rendered every hard-wrapped source line as its own paragraph — huge gaps, broken bold, numbered lists as loose sentences — and used barely half the screen. Wrapped lines are now joined back into their paragraphs and list items before rendering, the Markdown viewer learned ordered lists, and the report viewer grew to use the whole canvas (up to 94% of the viewport, taller reading area) — which benefits every tool report, not just this document. And the dimmed backdrop behind every dialog was hardcoded to the neutral brand's deep green — on a branded tenant, opening any dialog tinted the page the wrong colour; it now derives from the active brand's own deep tone." },
    ],
  },
  {
    build: 23009, date: "2026-08-11", title: "Read the security story before you sign in",
    items: [
      { kind: "improved", tool: "All tools", text: "The security & risk documentation (SECURITY.md) is now one click away inside the app: a link on the sign-in screen — readable BEFORE trusting the tool with a session — and a 🔒 Security link in the footer of every signed-in screen. It fetches the document that deploys with the site and renders it in the report viewer, so what you read is exactly the revision you are running." },
    ],
  },
  {
    build: 23008, date: "2026-08-11", title: "The security story, written down",
    items: [
      { kind: "new", tool: "All tools", text: "SECURITY.md ships with the repository: how ENCA is built (static, no backend, nothing stored anywhere), the delegated-only permission model and why it cannot exceed the signed-in admin, what leaves the browser (Graph calls and anonymous counts — the complete list), the in-app hardening, and an honest reckoning of residual risks for tenants and for the operator — delegated-write blast radius, supply chain, extensions, lookalikes, local exports — each with its mitigation, plus recommendations for security teams (consent policies, PIM just-in-time, fork-review-pin) and a private vulnerability-reporting channel. Linked from the README's Security section." },
    ],
  },
  {
    build: 23007, date: "2026-08-11", title: "The progress bar reaches every counted loop",
    items: [
      { kind: "improved", tool: "All tools", text: "The shared count-up bar now also runs wherever a tool walks a counted list: the Exclusion analyzer's group expansion ('Expanding group 4/112' now moves a bar, not just a sentence), the Conditional Access groups scan (group lookups and member reads), the CSV import's user resolution and member reads, the RMAU protection scan, and the Group Analyzer's source-by-source sweep. One visual, same brand colours, everywhere something is fetched at length." },
    ],
  },
  {
    build: 23006, date: "2026-08-11", title: "One progress visual for every long read; impact says who a policy aims at",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "A 🔴 verdict said WHO gets hit but not WHY they are in scope. Each policy card now shows the assignment it targets — include and exclude entries by name, straight from the policy in memory, with a link to the full policy card — and every affected user gets a why? button that resolves their directory membership against the policy's includes: 'member of included group X', 'holds included role Y', 'targeted directly', or 'the policy targets All users' (plus the reminder that no exclude entry caught them — that is why the sign-in applied)." },
      { kind: "improved", tool: "All tools", text: "The count-up progress bar the Report-only impact tool introduced is now the one busy visual for everything that reads at length: Sign-in failures (both modes) and the Change audit show the same bar, running count, page number and elapsed time — and Gap analyse drives it through its group-expansion and role-resolution loops, inline next to the status text. Each tool owns its own instance, so two reads running in background tabs never write into each other's panel, and every read survives switching tabs. The audit read is now also capped at 10,000 entries (with a notice when the window truncates) instead of unbounded." },
    ],
  },
  {
    build: 23005, date: "2026-08-11", title: "The progress bar wears the brand",
    items: [
      { kind: "fixed", tool: "Report-only impact", text: "The busy-state progress bar now fills in the brand's own dark colours — its gradient ended in a colour the brand overrides never touched, so on a branded tenant a stray green leaked into the bar. It now runs deep-to-primary of whatever brand is active (navy under a navy brand, green on the neutral look). Production also picks up the width fix the bar already had in beta — there it could still collapse to a sliver." },
    ],
  },
  {
    build: 23004, date: "2026-08-11", title: "Strengths grow their advanced options; three tools graduate",
    items: [
      { kind: "new", tool: "Authentication strengths", text: "Advanced options, as in the portal: restrict Passkeys (FIDO2) to specific AAGUIDs — with one-click presets for Microsoft Authenticator (Android + iOS) and Windows Hello (hardware, VBS, software), or any custom AAGUID — and restrict certificate-based authentication to specific issuer SKIs and policy OIDs (max 5 each, per Graph). Existing restrictions load with the strength ($expand), show on the cards and in the Markdown report, and edits apply only the difference: create, update or remove per configuration. A new strength carries its restrictions in the create call itself." },
      { kind: "fixed", tool: "All tools", text: "With many tabs open, the tab bar could not be scrolled back to its start — the home button and first tabs were unreachable. A centred flex strip that overflows hides its left side from scrolling entirely (a CSS classic); the strip is now centred with auto-margins instead, which scrolls normally, and switching tools keeps the active tab in view. Tall dialogs (like the grown strength editor) now scroll internally instead of pushing Save off screen." },
      { kind: "improved", tool: "All tools", text: "Out of BETA: 🎫 Authentication contexts, ♻ Recycle bin and 🔗 Group Analyzer — all three at v1.0 after tenant-side use." },
    ],
  },
  {
    build: 23003, date: "2026-08-11", title: "Shorter windows for fresh questions",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "1-hour and 4-hour ranges join 1/7/30 days — flip a policy to report-only, drive some traffic, and check the impact of the last hour without paging in a whole day of a large tenant's log." },
      { kind: "improved", tool: "Sign-in failures", text: "The same 1-hour and 4-hour ranges — when the helpdesk phone rings, the failure is minutes old, not days." },
    ],
  },
  {
    build: 23002, date: "2026-08-11", title: "The long read shows its work",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "Reading the sign-in window can take minutes in a large tenant — report-only verdicts cannot be server-filtered, so every page is fetched. The busy state now narrates: a running sign-in count, the page number and elapsed time, plus a progress bar toward the record cap, updated as each page lands. Switch tabs and back and it picks up mid-flight instead of showing a mute spinner." },
    ],
  },
  {
    build: 23001, date: "2026-08-11", title: "Report-only impact: the go-live forecast",
    items: [
      { kind: "new", tool: "Report-only impact", text: "New tool (BETA): what happens the day a report-only policy goes live, answered from the sign-in log. Where Sign-in failures keeps only the failures, this keeps every report-only verdict — so each staged policy gets a denominator and a verdict: 🔴 would block users (who, on which app, how often), 🟡 prompts only (interrupted for MFA or another control they can satisfy), 🟢 no change, or ⚪ no evidence — a staged policy with zero traffic is listed too, because 'no data' is the answer that should stop a go-live. The per-user view flips the question: for this person, the combined effect of everything in report-only at once, worst case first. Distribution bar per policy, per-user drill-down with apps and last-seen, policy names open the policy card, 1/7/30-day window, Markdown export for the change advisory board. Production released 229 (the usage counting that was beta 22905), so the beta cycle now targets release 230 — this build is 23001 (v1.0.230-beta.1)." },
    ],
  },
  {
    build: 22905, date: "2026-08-11", title: "Counting visits, not visitors",
    items: [
      { kind: "new", tool: "All tools", text: "ENCA now measures its own use — and only that. GoatCounter (a privacy-first, cookie-less counter) records page views and one event per tool-screen open: the tool's name and the channel (production or beta), nothing else. No identifiers, no tenant names, nothing from the Graph session; a blocked script changes nothing about how ENCA works. The README's privacy paragraph says exactly this. It answers one question the roadmap needs answered: which of these tools do people actually use." },
    ],
  },
  {
    build: 22904, date: "2026-08-11", title: "Recreate carries everyone, and says so",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "Recreate as role-assignable: the member move (added in build 219) only carried USER members — service principals and devices were left behind silently, which for a service-account persona group means an empty include. All member types now come across; the one thing that cannot is a nested group, because Entra forbids groups as members of a role-assignable group — those are named in the change report instead of failing quietly. And the confirm dialog no longer claims the new group starts empty (a leftover from before the member move existed): copying the members is now step ③ of the plan it shows." },
    ],
  },
  {
    build: 22903, date: "2026-08-11", title: "CIS: staged policies get their own tier",
    items: [
      { kind: "improved", tool: "CIS Benchmark", text: "Catalog r4, after reviewing the engine in Jhope188's CA Policy Analyzer. Disabled policies are now evaluated too: a policy that meets every criterion while Off lands in its own ⏸ Configured (Off) tier — own chip, own count, one state switch from passing — instead of disappearing into fail. It is deliberately NOT scored as pass: the benchmark's audit requires state = enabled, and the control says so (their analyzer shows such matches green with a state tag; an auditor would not). Staged-rollout baselines finally look like what they are." },
      { kind: "improved", tool: "CIS Benchmark", text: "5.2.2.5 tells you when you are close: a strength that carries the phishing-resistant methods but also allows extras — the classic PR + TAP onboarding strength — now reads 'close: includes the PR methods but also allows temporaryAccessPass…; remove the extras or document the deviation' instead of a flat combination miss. Their analyzer passes ANY admin auth-strength policy with a verify-yourself note; that reports compliance the benchmark letter does not support, so it was reviewed and deliberately not adopted." },
    ],
  },
  {
    build: 22902, date: "2026-08-11", title: "The what-if flow says how it ends",
    items: [
      { kind: "improved", tool: "List Policies", text: "The per-policy what-if flow now closes with a 🎯 CA result card: the actual sign-in verdict — denied, succeeds only after which controls (one-of or all-of, with the session shaping), or succeeds unconditionally — plus the tenant reality on a second line: Enforced (On, this is the real outcome today), Report-only (recorded but not enforced), or Off (becomes the outcome the moment the policy is switched On). The flow above stays the policy's logic; the result card is what the user at the door actually experiences." },
    ],
  },
  {
    build: 22901, date: "2026-08-11", title: "Beta catches up with production",
    items: [
      { kind: "new", tool: "All tools", text: "Production's builds 227 and 228 merged into the beta channel: the four new manage tools (\ud83c\udfab Authentication contexts, \ud83d\udcaa Authentication strengths, \ud83d\udcdc Terms of use, \u267b Recycle bin), the dependency-popup Manage-in-tool jump, and the terms-of-use PDF fixes now run here too \u2014 alongside the beta-only CIS Benchmark tool. This cycle now targets release 229, so this build is 22901 (v1.0.229-beta.1)." },
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
    build: 22701, date: "2026-08-10", title: "Beta gets its own numbers",
    items: [
      { kind: "improved", tool: "All tools", text: "The beta channel now has its own build series: five-digit numbers NNNII, where NNN is the production build this beta cycle will become and II the iteration — this build is 22701, shown as v1.0.227-beta.1. Production stays on plain integers (build 226 is the tabs-keep-your-place hotfix). No more shared number line between the channels: a beta build can never collide with a production build, and the label says at a glance which channel you are looking at. On release, the cycle's beta entries are consolidated into one production changelog entry." },
    ],
  },
  {
    build: 225, date: "2026-08-10", title: "Pilot groups count, and tabs keep your place",
    items: [
      { kind: "fixed", tool: "All tools", text: "Switching tool tabs no longer jumps to the top of the page — each screen's scroll position is remembered and restored when you come back. And reopening List Policies keeps the cards / list / matrix view you last chose instead of resetting to cards. (This fix is app-wide and safe for production ahead of the CIS beta.)" },
      { kind: "improved", tool: "CIS Benchmark", text: "Catalog r3 — the deployment model's pilot phase now counts: a policy whose user include is entirely CAD- deployment groups is treated as All users (the include-group names are resolved via Graph for this), with a note that the benchmark's audit reads includeUsers = All, so switch the policy to All users when the pilot completes or document the pilot scope. This is why a Global persona policy mid-rollout no longer fails every users: All criterion." },
      { kind: "improved", tool: "CIS Benchmark", text: "Sharper misses: the token-protection resource criterion (5.2.2.16) now names exactly which of Exchange Online / SharePoint Online / Teams Services is absent — 'missing only: Microsoft Teams Services' is a one-line fix that the generic label hid. Sign-in-frequency misses (5.2.2.4, 5.2.2.13) show the interval actually found ('found 14 days — the benchmark requires 7 days or less'), and a phishing-resistant-strength miss (5.2.2.5) says whether the strength was unresolvable or which non-phishing-resistant combinations it allows." },
    ],
  },
  {
    build: 224, date: "2026-08-10", title: "CIS learns the persona model",
    items: [
      { kind: "fixed", tool: "CIS Benchmark", text: "The tool now sits in the tool tab bar — it was missing from the tab list, so it could not be opened from the ＋ menu or pinned as a tab." },
      { kind: "improved", tool: "CIS Benchmark", text: "The three administrator-scoped controls (5.2.2.1 MFA for admins, 5.2.2.4 sign-in frequency + non-persistent browser, 5.2.2.5 phishing-resistant strength) scored 0/15 admin roles against baselines that scope admin policies through a persona group — an Admins / E-Admins group include — instead of directory roles, because the benchmark's Graph audit only reads includeRoles. Admin persona groups now satisfy the admin-scope criterion, recognised by the Admins token in the policy name plus a group include. A control passed this way carries a note: the audit letter expects includeRoles, so document the group as the tenant's administrator scope and verify every admin-role holder is actually in it." },
      { kind: "fixed", tool: "CIS Benchmark", text: "Catalog r2, two criteria corrected to match the benchmark's own leniency notes: a sign-in frequency of Every time satisfies 5.2.2.13 (stricter than any 7-day interval), and a policy granting a single control satisfies the OR-operator criterion on 5.2.2.9/.10 — with one control selected, the stored operator makes no functional difference." },
    ],
  },
  {
    build: 223, date: "2026-08-10", title: "CIS on its own track",
    items: [
      { kind: "improved", tool: "CIS Benchmark", text: "The tool header now carries its version (v0.2, hover for the release notes) like every other tool — it was the one head missing the stamp. And the CIS content is now managed on its own release track: the benchmark catalog (the 17 controls and their assessment criteria in cisdata.js) has a revision stamp of its own, shown in the header and in the Markdown report. A new benchmark version, an added control or a corrected criterion bumps the catalog revision — independent of the app build and of the other beta tools — so a reviewer can always tell which catalog produced a given assessment." },
    ],
  },
  {
    build: 222, date: "2026-08-10", title: "Scored against CIS",
    items: [
      { kind: "new", tool: "CIS Benchmark", text: "A new tool: the tenant's Conditional Access policies assessed against the CIS Microsoft 365 Foundations Benchmark v7.0.0 — all 17 automated recommendations of section 5.2.2 Conditional Access. Per control: pass, report-only (a policy meets every criterion but isn't enforced) or fail, with the benchmark's Graph audit criteria spelled out and — for every failing control — the nearest policies and exactly which criteria they miss, so the result doubles as the remediation map. Level 1 / Level 2 profile filter, licence-awareness (the three Identity Protection controls read 'not licensed' instead of 'fail' when the tenant has no Entra ID P2), an overall and per-level compliance score, and a Markdown compliance report. It's a CA compliance slice of the benchmark, not a full M365 scan — and it says so. Recommendation numbers and titles referenced from the CIS Benchmark, © Center for Internet Security; the full benchmark text is not reproduced." },
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
