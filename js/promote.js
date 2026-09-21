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
  productionBuild: "v1.0.320",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
    "p1-scale-1-3": { title: "P1 reliability and large-tenant execution — work packages 1–3" },
  },

  items: [
    {
      n: 230,
      title: "Workspaces layout, centred policy details and branded header",
      tools: ["Navigation", "Policies", "Several tools"],
      builds: [25401, 25402, 25403],
      risk: "medium",
      what: "Ports the approved Workspaces concept into the actual beta entry point. New js/workspaces.js and css/workspaces.css provide the rail, Overview, session-local recent tools and searchable library. js/tool-layout.js and css/tool-layout.css share tool presentation. js/app.js opens full policy details directly and provides the original definition; js/workspace.js publishes session metadata for truthful tenant/demo labels. Native routes, tenant operations, permission overview and confirmation flows remain in place. No demo-forcing boot code or concept CSP is shipped. Build 25403 adds T36 to the rail and compact CA-number policy links across its user, group and comparison views. Build 25402 adds all tools in expandable Overview groups, standalone Permissions, the Theme label and silent connected-app ownership metadata in the account menu.",
      why: "The user approved the Workspaces design and asked to build it to beta. Consistent layout and a wide centred detail window make intensive use easier. Medium risk because shared navigation and responsive styles affect every tool: validate sign-in, tenant changes, original actions and nested dialogs before production. Local demo and simulated-session results are recorded in review/2026-09-21/BETA-25403.md; they are not live-tenant acceptance.",
      test: [
        "Open T36 from the rail. Policy links show only their CA number, keep the full original detail when clicked, and retain names for policies with no CA number. Check user, group and compare subjects.",
        "Overview shows all 24 tools as cards, including Guided rollout, Changes and Permissions. Collapse/expand groups and reopen Permissions via its tab. Theme replaces Appearance. Check own-tenant, external multitenant and unreadable app ownership without additional consent; the owner ID must come from Graph metadata.",
        "Without ?demo=1, open beta in a fresh session: the normal sign-in card and connection control appear; workspace rail and All tools are absent. After sign-in, the header names the tenant and must not say Demo. Sign out: workspace navigation disappears and theme selection remains reachable.",
        "Open demo: Overview and All tools work, all 23 original destinations remain reachable, and folded tools remain reachable by their native subtabs or command palette. Switch tabs with a policy filter and selection set: both survive. Close a neighbouring tab and close all through the account menu.",
        "Open a policy from List and Cards: the complete six-section detail is centred, the full original name and JSON definition are present, and a nested dependency closes back to it. Close/Escape/backdrop return focus; Documentation, Backup, Assign, Policy state and What-if still reach their original workflow. No tenant write occurs from merely opening a detail.",
        "1440/light and 390/dark: review every available tool and subtab for title, toolbar and panel consistency without page overflow. At 320px verify branding and the Teams devices prefix field fit. Wide data tables may scroll inside their panels.",
        "Apply a custom logo, product name and light/dark palettes through Branding settings: the top bar updates immediately, and text stays readable for light as well as dark header colours. Reset restores the deployment brand and retains the BETA or SELF-HOSTED identification.",
        "On a real tenant, confirm the permission overview and native incremental-consent flow remain reachable. Switch between two tenants (including equal display names): recent tools reset and the account names the current tenant. CIS must retain its existing tenant gate; verify it in the authorised tenant before production.",
      ],
      files: ["index.html", "js/graph.js", "js/whois.js", "js/wave.js", "js/compare.js", "js/workspaces.js", "css/workspaces.css", "js/tool-layout.js", "css/tool-layout.css", "js/workspace.js", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 229,
      title: "\u2699 The beta host's own single-tenant app registration \u2014 NEVER PROMOTE",
      tools: ["Sign-in"],
      builds: [25400],
      risk: "low",
      what: "js/authConfig.js gains AUTH_HOSTS, a hostname-keyed default merged between the shipped values and window.ENCA_AUTH. One entry: BRANDING.betaHost signs in with a single-tenant registration in the publisher's own directory. Every other host \u2014 production, a container, localhost, a fork \u2014 misses the key and is unaffected.",
      why: "Mihai, 21 Sep: beta should default to the registration he had just created. Beta is where a registration change is tried first, and trying it on the application every customer signs in with is not trying it. Single-tenant also means the app cannot be reached from any other directory, which is the right blast radius for a test site on a public github.io address.",
      carveout: "DO NOT PORT AUTH_HOSTS TO main. It names the publisher's own tenant and registration and would ship in the production build and in the :latest image, where the key can never match and the block is nothing but a tenant ID in somebody else's copy. When porting js/authConfig.js, take the header comment and the js/connection.js precedence note and leave AUTH_HOSTS behind; main keeps the plain two-argument Object.assign.",
      test: [
        "The beta site: the sign-in card reads Single-tenant, the \u2699 panel's Default entry names the beta client ID and tenant, and signing in reaches the publisher's tenant without an account picker.",
        "The beta site, signed in: the \u2753 Permissions panel and the PowerShell consent snippet quote the BETA client ID, not the shared one \u2014 they read AUTH_CONFIG like everything else.",
        "enca.limon-it.nl on the same build (were it ever served there) and a container from the :beta image on any other hostname: the card reads Multi-tenant and the shipped client ID, proving the key is host-scoped and not branch-scoped.",
        "A saved \u2699 connection on the beta host still wins over the host default, and Default restores the BETA registration there \u2014 not the shipped one.",
        "The beta site's URL is registered as a SPA redirect URI on the beta registration, or every sign-in there is AADSTS50011. Check before the first push, not after.",
      ],
      files: ["js/authConfig.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 228,
      title: "\u2699 The sign-in card chooses the tenant and the app registration",
      tools: ["Sign-in"],
      builds: [25399],
      risk: "medium",
      what: "NEW js/connection.js \u2014 a connection store in localStorage (enca-connections: { v, active, list:[{id,name,clientId,authority,at}] }) applied to AUTH_CONFIG at script-parse time, between js/authConfig.js and js/graph.js, plus the \u2699 panel it mounts into the sign-in card. index.html: the <details id=\"loginConn\"> markup under the pop-up link, the script tag, and a sentence in the Security block of Help. css/app.css: .login-conn and the .conn-* rules. js/app.js: the AADSTS50011 and AADSTS700016 hints point at the chosen registration, and showSignInError names the active connection. Only clientId and authority are settable \u2014 scopes and graphBase deliberately are not. A switch clears MSAL\u2019s sessionStorage keys and reloads, because a PublicClientApplication cannot be repointed at another client ID once constructed.",
      why: "Mihai, 21 Sep: he had just created a single-tenant registration and wanted to sign in with it, and to switch tenants, without editing a file. Until now both were deployment-time acts (js/authConfig.js, or js/authConfig.local.js served beside it) \u2014 right for an organisation standing up its own copy, wrong for an MSP moving between customer directories. MEDIUM, not low: this is the sign-in path on every host, and a fault here is not a broken tool but a site nobody can get into. The default path is untouched \u2014 with no stored connection, AUTH_CONFIG is exactly what the file says \u2014 which is what makes it promotable at all.",
      test: [
        "Production host, no connection ever saved: the card looks as it did, the audience line still reads Multi-tenant, and sign-in works. Confirm localStorage has no enca-connections key \u2014 the default path must not write one.",
        "Add a connection with only a tenant (your own tenant ID, client ID left empty): the page reloads, the summary names it, the card reads Single-tenant, and sign-in goes straight to that directory without an account picker across tenants.",
        "Add a connection with the new single-tenant client ID and its tenant ID: the Microsoft consent screen names THAT application in THAT tenant. Then Default: the next sign-in is the shipped registration again \u2014 no token from the previous one is reused (check sessionStorage holds no msal.* keys for the old client ID after the switch).",
        "Wrong on purpose: a client ID that is not a GUID is refused in the form, with the reason, before any sign-in. A well-formed client ID that is not an app in the named tenant fails with AADSTS700016 and the error box names the connection used.",
        "A registration WITHOUT this origin as a SPA redirect URI fails with AADSTS50011, and the panel's redirect line shows the exact string that is missing.",
        "Private window / site data blocked: the panel still renders, saving reports that the browser will not store the choice, and the sign-in card keeps working on the shipped registration.",
        "A self-hosted copy with js/authConfig.local.js: with no connection selected the file still wins; with one selected the connection wins and the self-hosted notice and the audience line both describe the connection, not the file.",
        "Beta and production both: the \u2699 panel is NOT host-gated on purpose \u2014 confirm it appears on enca.limon-it.nl too, and that Default is preselected there.",
      ],
      files: ["js/connection.js", "index.html", "css/app.css", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js", "SINGLE-TENANT.md"],
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
