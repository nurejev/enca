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
//   * write its `test` checklist — see below
//
// `test` — HOW SOMEBODY SATISFIES THEMSELVES IT WORKS, before promoting.
// `why` already says what the risk is and what would have to be true for the
// item to graduate; it does not say how to find out. An item whose graduation
// condition nobody knows how to check either ships untested or never ships at
// all, and both of those have happened here.
//
// Write steps that are FALSIFIABLE: name the tenant state each one needs and
// the outcome you should see, so a step can fail. "Check it works" is not a
// step. Where a check needs a tenant nobody has to hand, say so on the step
// rather than leaving it looking routine — knowing which check was skipped is
// worth more than a list that pretends all of them were run.
//
// An item without `test` is not finished. It lands in the same commit as the
// change, like the changelog entry and the home-tile tag.
//
// `carveout` — OPTIONAL, and the only field here that is an INSTRUCTION rather
// than a description. Write it when the item does not port verbatim: when the
// beta copy of a file deliberately says something the production copy must
// not. The self-hosting package (92) is the case that created this field — its
// docs, scripts and ARM template point at the `beta` branch and the `:beta`
// image so the feature is testable BEFORE promotion, and a straight copy to
// main would ship a production page telling people to pull beta.
//
// It renders in the queue and, more importantly, in the exported order, where
// the working session actually reads it. Say exactly what to rewrite and what
// to delete, and end with the grep that proves the port was complete — a
// carve-out you have to reconstruct from memory is one you will get wrong.
//
// PROMOTING AN ITEM — all four, or the two channels start disagreeing:
//   1. delete the item here and bump `productionBuild`
//   2. update the roadmap card ON MAIN: `live · build NNN`
//   3. update the SAME card ON BETA: `live · beta NNNNN · production NNN`
//   4. add the changelog entry on both channels
//
// Step 3 is the one that gets missed, because the port is finished and working
// by then. Each channel carries its own copy of index.html, so promoting only
// touches main's roadmap — beta's card goes on claiming the work is beta-only.
// On 2026-08-17 EIGHT cards had drifted that way: R27 read "live · beta 25115"
// while it had been in production since 283, so the roadmap said beta-only and
// the queue, correctly, showed no gap at all. Two sources of truth, one of them
// updated. R07, R08, R09, R10, R29, R30 and R31 were in the same state.
//
// A card that says "live · beta NNNNN" with NO production clause therefore
// means one of two things, and only one of them is right: the tool is genuinely
// beta-only (R01 and R51 today, whose tools have not been promoted), or somebody skipped
// step 3. Write "beta NNNNN · production NNN" — never "build 250xx", which uses
// production wording for a five-digit beta number and reads as a release to
// anybody who does not know the two series apart.
//
// THERE IS A THIRD CASE, and it needs its own wording because it looks exactly
// like the mistake: a change that is finished on beta and DELIBERATELY held out
// of a release its neighbours went in. R28 is the first — promoted 61-66, 68
// and 69 to 287 and left 67 behind, because 67 is the only one that changes
// where a WRITE puts a group object. Write "beta NNNNN · held from production"
// so the card says which of the three it is. "No production clause" must never
// be the thing a reader has to interpret.
//
// `n` is a stable hand-assigned number so it can be referred to out loud —
// "push number 3 to main". Numbers are NOT reused after an item ships;
// the next new item takes the next free number.
//
// `group` — OPTIONAL. Items that BELONG TOGETHER for promotion without being
// one change: a tool and the Help section written for it, a feature and the
// three follow-up fixes it grew on beta, the R28 run of 61-69. Give each of
// them the same group id and describe the group once in PROMOTE.groups below.
// The queue then renders them as ONE block with one tick — ticking the group
// ticks every member — and every member keeps its own tick, so one can be
// held back from the batch (R28 held 67) without losing the batch. A NUMBER
// says "never apart"; a GROUP says "usually together, and here is the list
// so nobody has to reconstruct it". The exported order names a group that
// goes out incomplete, member by member, so a deliberate hold-back reads as
// one rather than as an item somebody forgot to tick.
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
// `betaBuild` USED TO LIVE HERE and has been removed on purpose: this site's
// own version is not a judgement call, it is APP_BUILD.label, and the header
// now reads it from there. Hand-maintaining it meant it could disagree with
// the footer of the same page — which it did, printing v1.0.250-beta.112 while
// the app computed v1.0.251-beta.12. Only `productionBuild` stays by hand,
// because the app genuinely cannot know what the other channel is running.
const PROMOTE = {
  productionBuild: "v1.0.321",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
    "p1-scale-1-3": { title: "P1 reliability and large-tenant execution — work packages 1–3" },
  },

  items: [
    {
      n: 232,
      title: "\ud83d\udd75 Policies scoped to external-user types resolve, and the fourth state is visible",
      tools: ["Who is … to CA", "CA validator", "Compare users", "Analyze"],
      builds: [25405],
      risk: "medium",
      what: "js/cascope.js: externalTypeOf(subject) derives Entra's external-user type from userType and the #EXT# marker in the UPN (or externalUserState where the caller read it), and guestMatch uses it instead of a field nobody ever set. An internal account returns false against a restricted guest rule rather than null \u2014 serviceProvider and b2bDirectConnectUser hold no user object in the tenant, so a principal resolved here cannot be either. Where userType or the UPN is absent the answer is still null and the state is still unknown. js/whois.js: counts.unknown, an amber Unknown scope chip rendered only when non-zero, the filter arm for it, unknown ranked above na in the row sort, the count on the policies tile, and a callout. js/analyze.js: ctx.upns, passed into the per-user subject.",
      why: "Mihai, 21 Sep, on the Perfetti tenant: a user who should be getting CA111 was missing from \ud83d\udd75. CA057 excludes Guests & external users: Service provider users; guestMatch read subject.guestOrExternalUserType, which is set by nobody, returned null, and of() promoted that to unknown \u2014 a state with no filter chip, so the row existed only under All. Confirmed by arithmetic on his screen: 16 + 7 + 111 = 134 against All 136. MEDIUM: this is the shared scope check under four tools, and a wrong answer here is a policy reported as reaching somebody it does not, or the reverse. It is bounded by being decided from the account's own userType and UPN, both already read, with no new Graph call and no new permission.",
      test: [
        "Perfetti, the user this started with: CA057 is in Reaches her, via All users, and the three chips plus any Unknown chip add up to All. This is the falsifiable one \u2014 it was 134 of 136 before.",
        "A tenant WITH a CSP / GDAP partner: sign in as a normal member and confirm no policy excluding Service provider users reads unknown any more; then check the same policy against a real B2B guest (UPN with #EXT#) and confirm it still reaches them.",
        "A guest who IS a service provider cannot be tested from \ud83d\udd75 \u2014 a GDAP partner administrator holds no user object in the tenant, so there is nobody to look up. That is the premise of the fix rather than a gap in it; the unit check covers a subject that declares the type outright and confirms it is still excluded.",
        "Regression on the plain rule: a policy excluding all Guests and external users still excludes a guest and still reaches a member. A policy INCLUDING Guests and external users still reaches a guest and not a member.",
        "The kept unknown: find or make a policy with an enumerated externalTenants list and check a guest whose home tenant is not knowable \u2014 the row reads Unknown scope, the amber chip appears with a count, the callout names which half could not be decided, and the row sorts above Not targeted.",
        "The chip disappears when the count is zero, and on a tenant with no such policy the chip row looks exactly as it did.",
        "\u26a1 CA validator and \u2696 Compare users on the same user agree with \ud83d\udd75 about the same policy \u2014 one scope check, so a disagreement means something else is wrong.",
        "\ud83d\udcca Analyze over the tenant: no user row carries an unknown verdict for an external-user-typed policy, and the demo tenant still runs.",
      ],
      files: ["js/cascope.js", "js/whois.js", "js/analyze.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 231,
      title: "Shared list/detail tools and flat interface icons",
      tools: ["Policies", "Sign-ins", "Changes", "Policy building blocks", "Exclusions", "User/Group analyzer", "Navigation"],
      builds: [25406], risk: "medium",
      what: "Shared resizable list/detail presentation with wide and mobile detail modes; policy settings tabs preserve native full-detail actions. Exclusions gets an entity view; User/Group references and sweep groups keep completeness evidence outside the detail panel. Flat local SVG icons replace leading interface markers without changing stored or exported data.",
      why: "A consistent reading layout reduces repeated expand/collapse actions. Medium risk because existing delegated actions now live inside detail panels across several tools. No Graph requests, permissions or write confirmations are added by the presentation layer.",
      test: [
        "Passed locally: 204 offline tests; populated browser fixtures for Policies, audit, sign-ins, building blocks, exclusions and User/Group results, including incomplete-read evidence and 320/390/1440 layouts.",
        "Passed locally: 66 tool screen visits, 44 subtabs, wide policy settings, nested dependencies, focus restoration, and light/dark branded layouts. CIS is unavailable in demo and was not bypassed.",
        "Before promotion, verify in a connected tenant that filters, bulk selections, native edit/restore dialogs, exports and sign-in replay retain the selected object. Review long real names and large result sets. No live-tenant acceptance or write execution was performed for this build.",
      ],
      files: ["js/list-detail.js", "css/list-detail.css", "js/flat-icons.js", "css/flat-icons.css", "js/workspace.js", "js/workspaces.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 230,
      title: "Workspaces layout, centred policy details and branded header",
      tools: ["Navigation", "Policies", "Several tools"],
      builds: [25401, 25402, 25403, 25404],
      risk: "medium",
      what: "Ports the approved Workspaces concept into the actual beta entry point. New js/workspaces.js and css/workspaces.css provide the rail, Overview, session-local recent tools and searchable library. js/tool-layout.js and css/tool-layout.css share tool presentation. js/app.js opens full policy details directly and provides the original definition; js/workspace.js publishes session metadata for truthful tenant/demo labels. Native routes, tenant operations, permission overview and confirmation flows remain in place. No demo-forcing boot code or concept CSP is shipped. T36 is in the rail. Build 25404 corrects its labels to full original policy names, including their own CA number, without an added ENCA sequence prefix; the detail heading also omits that prefix. Build 25402 adds all tools in expandable Overview groups, standalone Permissions, the Theme label and silent connected-app ownership metadata in the account menu.",
      why: "The user approved the Workspaces design and asked to build it to beta. Consistent layout and a wide centred detail window make intensive use easier. Medium risk because shared navigation and responsive styles affect every tool: validate sign-in, tenant changes, original actions and nested dialogs before production. Local demo and simulated-session results are recorded in review/2026-09-21/BETA-25404.md; they are not live-tenant acceptance.",
      test: [
        "Open T36 from the rail. Policy links show the full original name including its own CA number, without an additional ENCA sequence prefix. Clicking opens the same original name in the detail heading. Check user, group and compare subjects.",
        "Overview shows all 24 tools as cards, including Guided rollout, Changes and Permissions. Collapse/expand groups and reopen Permissions via its tab. Theme replaces Appearance. Check own-tenant, external multitenant and unreadable app ownership without additional consent; the owner ID must come from Graph metadata.",
        "Without ?demo=1, open beta in a fresh session: the normal sign-in card and connection control appear; workspace rail and All tools are absent. After sign-in, the header names the tenant and must not say Demo. Sign out: workspace navigation disappears and theme selection remains reachable.",
        "Open demo: Overview and All tools work, all 23 original destinations remain reachable, and folded tools remain reachable by their native subtabs or command palette. Switch tabs with a policy filter and selection set: both survive. Close a neighbouring tab and close all through the account menu.",
        "Open a policy from List and Cards: the complete six-section detail is centred, the full original name and JSON definition are present, and a nested dependency closes back to it. Close/Escape/backdrop return focus; Documentation, Backup, Assign, Policy state and What-if still reach their original workflow. No tenant write occurs from merely opening a detail.",
        "1440/light and 390/dark: review every available tool and subtab for title, toolbar and panel consistency without page overflow. At 320px verify branding and the Teams devices prefix field fit. Wide data tables may scroll inside their panels.",
        "Apply a custom logo, product name and light/dark palettes through Branding settings: the top bar updates immediately, and text stays readable for light as well as dark header colours. Reset restores the deployment brand and retains the BETA or SELF-HOSTED identification.",
        "On a real tenant, confirm the permission overview and native incremental-consent flow remain reachable. Switch between two tenants (including equal display names): recent tools reset and the account names the current tenant. CIS must retain its existing tenant gate; verify it in the authorised tenant before production.",
      ],
      files: ["index.html", "js/graph.js", "js/render.js", "js/whois.js", "js/wave.js", "js/compare.js", "js/workspaces.js", "css/workspaces.css", "js/tool-layout.js", "css/tool-layout.css", "js/workspace.js", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 224,
      title: "📐 CIS Benchmark (T21) — beta AND the CloudFellows tenant only; production 316 removes it from that build",
      tools: ["CIS Benchmark"],
      builds: [25391],
      risk: "low",
      what: "js/app.js: tenantDomains (the organization's verified domains, read where tenantName and tenantDomain are), isCisTenant(), and a per-tab `only` predicate honoured by tabShown(), openFolded() and the command-palette builder beside the existing betaOnly check; the CIS tab and the toolCis FOLDED entry carry only: () => isCisTenant(). index.html: the tool-number row and the R01 roadmap card say so. PRODUCTION SIDE, already committed on main as build 316: js/cischeck.js, js/cisdata.js, their script tags, the screen-cis section, the FOLDED and TAB_HOSTS entries, the whole CIS block in js/app.js and screen-cis in HISTORY_SCREENS are gone from that build; T21 keeps its number in the map and in TOOL_VERSIONS.",
      why: "Mihai, 18 Sep: the CIS tool ended up in main and in the self-hosted image, and it should be beta-only and only in the cloudfellows.dev tenant. The guard was betaOnly plus isProdHost, which asks WHERE THIS BUILD IS SERVED FROM - and a build anyone may serve cannot be kept clean that way, which is exactly how it reached a customer's instance. Two answers, one each: out of the production build, and behind a tenant test on beta. LOW on this channel (it only hides a tab); the production half ships as its own build 316.",
      test: [
        "Beta, signed into the CloudFellows tenant: Checks shows four tabs with CIS 5.2.2 among them, the command palette finds CIS Benchmark and T21, and the R01 roadmap link opens it.",
        "Beta, signed into any other tenant (Courseware): three tabs, no CIS; the palette finds neither the name nor T21; the R01 link does nothing.",
        "Beta with ?demo=1: three tabs - the demo is not that tenant on purpose.",
        "An administrator signed in as a guest of the CloudFellows tenant (UPN on another domain) still sees it: the test reads the organization's verified domains, not the account's.",
        "Production 316: Checks has three tabs on every host, js/cischeck.js and js/cisdata.js are 404, the page has no screen-cis, and Help still lists T21 in the tool numbers as not part of that build.",
        "A self-hosted container built from 316: the same three tabs - this is the case that started it.",
      ],
      files: ["js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 34,
      title: "CIS Benchmark Help section",
      tools: ["CIS Benchmark"],
      builds: [25079],
      risk: "low",
      what: "The Help section written for 📐 CIS Benchmark, held back from production because the tool is beta-only — a Help entry for a tile nobody has would be a lie.",
      why: "NOT promotable on its own — 📐 CIS Benchmark is beta-only, and a Help entry for a tile nobody has is a lie. It travels with the tool whenever that graduates.",
      test: [
        "Not testable in production until \ud83d\udcd0 CIS Benchmark itself graduates \u2014 the Help entry describes a tile that is not there. On beta: open \u2753 Help and confirm the CIS section is in the table of contents, that every control number it quotes exists in the tool, and that its licence caveat matches what the tool actually does on a tenant without Entra ID P2.",
      ],
      files: ["index.html"],
    },
  ],

  // Deliberately NOT promoted. Every entry here must be something that EXISTS
  // on beta and is not going to production — it is still part of the gap, just
  // a permanent part of it. Something that has already shipped is not a
  // difference between the channels and belongs in neither list: it goes in
  // js/changelog.js and nowhere else. This section is the diff, not a history.
  staying: [
    {
      title: "\u2699 The beta host's own single-tenant app registration (AUTH_HOSTS)",
      why: "Beta-only by design, and permanently \u2014 it was queue item 229 until build 25407, which is the wrong list for something that can never be ticked. AUTH_HOSTS in js/authConfig.js names the PUBLISHER'S OWN tenant and registration and is keyed on this site's hostname. In a production build, or in the :latest image, the key can never match and the block is nothing but somebody else's tenant ID shipped to every copy. When js/authConfig.js is ported, take the header comment and the js/connection.js precedence note and leave AUTH_HOSTS behind; main keeps the plain two-argument Object.assign. The \u2699 connection picker it defaults FROM (item 228) is in production since build 321.",
    },
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

// ======================================================================
// THE PROMOTION ORDER (ported from TUNO, build 10444). The queue above grew
// tick boxes; this turns the ticked numbers into a small file Mihai hands to
// a working session as the promotion instruction.
//
// THE FILE IS THE ORDER, NOT THE VERIFICATION — it says which items to
// promote, with the machine-readable order embedded. The session that
// receives it still verifies every item against what main actually contains,
// because the header of this file says not to trust its own list, and that
// rule does not bend for a nicer file format.
//
// Two refusals, both deliberate. An export with nothing ticked is not an
// empty order, it is a mistake. And a tick whose item is no longer queued —
// it shipped since the tick — is named rather than quietly dropped: an order
// that silently shrank is the same lie as a range that silently shrank.
// ======================================================================
PROMOTE.buildOrder = function (pickedNs, appBuild) {
  const ns = [...new Set((pickedNs || []).map(Number))].sort((a, b) => a - b);
  if (!ns.length) throw new Error("Nothing is ticked — an empty order is not an order.");
  const items = ns.map((n) => {
    const it = (PROMOTE.items || []).find((i) => i.n === n);
    if (!it) throw new Error(`Item ${n} is not in the queue — it may have shipped since the tick. Untick it and export again.`);
    return it;
  });
  const when = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const L = [];
  L.push("# ENCA promotion order");
  L.push("");
  L.push(`Generated ${when} on ${appBuild ? appBuild.label : ""} · production is ${PROMOTE.productionBuild}`);
  L.push("");
  L.push(`PROMOTE ITEMS: ${ns.join(", ")}`);
  L.push("");
  L.push("For the working session: this file is the ORDER, not the verification.");
  L.push("Verify each item against what main actually contains before building");
  L.push("the production commit — the queue's own rule. Items promote together");
  L.push("where their builds interleave; the session decides the cut.");
  L.push("");
  // Groups: a batch that goes out whole is one line; a batch that goes out
  // incomplete names what is held back, so the session knows it is a
  // decision and does not "helpfully" port the rest.
  const gids = [...new Set(items.map((i) => i.group).filter(Boolean))];
  for (const gid of gids) {
    const g = (PROMOTE.groups || {})[gid] || { title: gid };
    const members = (PROMOTE.items || []).filter((i) => i.group === gid).map((i) => i.n).sort((a, b) => a - b);
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`GROUP ${gid} — ${g.title}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
  }
  // Tool batches (25319): the queue folds items on the same tool under one
  // row whose tick takes them all, so a tool's run going out with a member
  // held back is the same kind of decision as an incomplete group — name it,
  // so the session does not port the missing version "for completeness".
  // Same home rule as the queue: first tool, or "Several tools" at three+.
  const all = PROMOTE.items || [];
  const gc = {}; all.forEach((i) => { if (i.group) gc[i.group] = (gc[i.group] || 0) + 1; });
  const homeOf = (i) => (i.group && gc[i.group] > 1) ? null : (((i.tools || []).length >= 3) ? "Several tools" : ((i.tools || [])[0] || "Several tools"));
  const homes = [...new Set(items.map(homeOf).filter(Boolean))];
  for (const h of homes) {
    const members = all.filter((i) => homeOf(i) === h).map((i) => i.n).sort((a, b) => a - b);
    if (members.length < 2) continue;
    const going = members.filter((n) => ns.includes(n));
    const held = members.filter((n) => !ns.includes(n));
    L.push(`TOOL ${h}: ${held.length ? `INCOMPLETE — promoting ${going.join(", ")}; held back ${held.join(", ")} (deliberate; do not port them)` : `whole (${going.join(", ")})`}`);
  }
  if (gids.length || homes.length) L.push("");
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
    if (it.group) L.push(`- group: ${it.group}`);
    L.push(`- files: ${(it.files || []).join(", ")}`);
    // A carve-out is the one thing in this file that is an instruction rather
    // than a fact: the item does NOT port verbatim, and the port is wrong if
    // this line is not read. It goes above the files for that reason.
    if (it.carveout) L.push(`- CARVE-OUT: ${it.carveout}`);
    L.push("");
  }
  L.push("```json");
  L.push(JSON.stringify({ order: ns, generated: when, betaBuild: appBuild ? appBuild.build : null, productionBuild: PROMOTE.productionBuild }));
  L.push("```");
  return { filename: `enca-promotion-order-${when.slice(0, 10)}.md`, text: L.join("\n") };
};
