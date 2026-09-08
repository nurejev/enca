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
// beta-only (R05 today, whose tool has not been promoted), or somebody skipped
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
  productionBuild: "v1.0.308",

  // Named batches — see `group` in the header. Empty is fine: a group exists
  // only while two or more queued items share its id, and it is deleted when
  // the last of them ships.
  groups: {
  },

  items: [
    {
      n: 130,
      title: "🌊 Who is the wave to CA (T37)",
      tools: ["Who is the wave to CA"],
      builds: [25262],
      risk: "medium",
      what: "New beta-only tool: the T36 picture for a whole deployment group — picker with member counts, go-live readiness per report-only policy (locked out / prompted / unchanged / silent → Not yet / Friction only / Ready / No data), policies and how they target the wave, excluded-member counts, members with how they got in and flags (bypass, two waves, blocked, lockout, no P1, disabled), each a click into T36. New js/wave.js plus tile, screen, Help section, wiring and CSS; T36's stage tile links to it.",
      why: "Composes the same modules as T36 for N members, so the risk is scale and joins: the referenced-group reads are capped at 999 members each and the wave at 500, the report-only per-user rows join back on UPN, and the readiness verdict is only as good as the window. Graduates once a real wave's readiness table has matched 🎚 Report-only impact per policy and the member flags have matched T36 for a handful of members. Travels with item 129 (it calls WhoIs.stateFor and opens T36).",
      test: [
        "On a baseline tenant, open the tool: every CAD-SEC-U-DG-* group the tenant has must be a picker chip with its transitive member count; a group the tenant does not have must be greyed with —. Pick DG-INT: the member count in the header must equal the chip.",
        "For a wave with a nested child group: members that came through it must read “via <child>”, direct members “direct”, and the How-the-wave-is-built card must list the child with the same count. A dynamic child must show its rule.",
        "Compare the readiness row of one report-only policy with 🎚 Report-only impact for the same policy and window: the locked-out names here must be exactly that policy's would-deny users who are members of the wave. Nothing more, nothing less.",
        "Click three member names — one with a bypass flag, one in two waves, one quiet — and confirm 🕵 Who is Anna to CA opens on each with the same verdicts (exclusion callout, stage tile, forecast tile).",
        "A member in CAB-SEC-U-CAxxx-Exclusion while CAxxx is On must carry the bypass flag and the policy row must count them under Excluded members with the group named; switch the policy to report-only and rescan: the flag must become a plain “excluded” chip.",
        "Decline AuditLog.Read.All: the readiness card must say it needs the sign-in log, the member table must render without log columns filled, and nothing must throw. With a window that hit the 10,000 cap, the note above the result must say so.",
        "On a tenant with the Joey Verlinden baseline active: the picker must say the baseline has no deployment groups and offer his persona groups; typing a CA-… - Exclude group by name must work.",
        "?demo=1: pick Internals (persona) — Eva and Milan as members, CA200-CA20x targeting via direct include, the staged MFA policy in the readiness card, and Eva's name opening T36.",
      ],
      files: ["js/wave.js", "js/whois.js", "js/app.js", "index.html", "css/app.css", "js/version.js"],
    },
    {
      n: 129,
      title: "🕵 Who is Anna to CA (T36)",
      tools: ["Who is Anna to CA"],
      builds: [25261],
      risk: "medium",
      what: "New beta-only tool: one user, the whole Conditional Access picture on one screen — deployment stage (which CAD-SEC-U-DG-* groups, direct or nested via which parent), every policy and via what it reaches or excludes her, the sign-ins Conditional Access stopped for her, and her report-only forecast (locked out / prompts / no change / no data). Standing bypasses named. Reads only; the sign-in half is a per-user server-filtered read, or the shared window when complete. New js/whois.js plus tile, screen, Help section, wiring and CSS.",
      why: "Composes ⚖ Compare users, 🚦 Sign-in failures and 🎚 Report-only impact for one user rather than inventing new reads, so the risk is in the COMPOSITION: the include reason, the nested-via path and the per-user report-only row are new code paths. Graduates once the ladder and the policy table have matched ⚖ Compare and 🎚 Report-only impact on a few real users, including one in an exclusion group and one not in any wave.",
      test: [
        "On a baseline tenant, read a user who is in CAD-SEC-U-DG-INT through a nested group: the ladder must show DG-INT as In · nested via <that parent>, and DG-GLO likewise; a deploy group the tenant does not have must read “Not in this tenant”, not “Not in”.",
        "Read a user who is a direct member of a CAB-SEC-U-CAxxx-Exclusion group while that policy is On: the exclusion rung must be red, the policy row must read EXCLUDED with the group named, and a “Standing bypass” callout must appear. Switch the policy to report-only and rescan: the callout must go.",
        "For the same user, open ⚖ Compare users with that user and a colleague: every ✓ / ✗ / · in Compare's assignment column for the user must agree with the Reaches her / Excluded / Not targeted chips here. Any disagreement is a bug in this tool, not in Compare.",
        "Read a user with at least one sign-in an enforced policy blocked in the last 7 days: the blocked count in the tile, the policy row's Log column and the sign-ins table must agree with 🚦 Sign-in failures filtered to that UPN, and 🧪 Replay must open What-If prefilled with the app, platform, client and IP of that sign-in.",
        "With a report-only policy that would deny the user: the forecast tile must say Locked out and name the policy; the same user's row in 🎚 Report-only impact → Per user must show the same policy with the same failure count. A report-only policy that reaches her but evaluated no sign-in must render as “no data”, never as no change.",
        "Read a user in NO deploy group: the stage tile must say “Not in a wave” and the callout must offer 👥 Conditional Access groups. On a tenant with the Joey Verlinden baseline active, the ladder must say the baseline has no deployment groups and show the persona groups instead.",
        "Decline AuditLog.Read.All when it is asked for: the memberships and policy table must still render, and the sign-in half must say why it was skipped. Press the MFA methods “read” button and decline: the chip must stay “not read”.",
        "?demo=1: read eva@contoso.com — DG-GLO and DG-INT In, one report-only forecast from the demo sign-ins, and the policy names open the policy card.",
      ],
      files: ["js/whois.js", "js/app.js", "index.html", "css/app.css", "js/demo.js", "js/version.js"],
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
    {
      n: 24,
      title: "📖 Baseline usage guide (R05)",
      tools: ["Baseline guide"],
      builds: [25063, 25065, 25069],
      risk: "low",
      what: "New beta-only tool: the deployment order as six steps with the reason for each, and a 🔎 Read-the-tenant readiness check per step (baseline groups, restricted units, locations, strengths, contexts, terms of use, exact missing policies, state tally). A policy count such as 93/99 names the six missing CA policies and uses the Baseline tool's number-clash-safe matcher. Pure reads plus one on-demand scope (Agreement.Read.All). New js/guide.js plus tile, screen and wiring.",
      why: "Reads only and self-contained, but it EXPLAINS the baseline — wrong prose is worse than no prose, so it graduates once the step texts have survived a few real deployments.",
      test: [
        "On a tenant with NO baseline deployed: open \ud83d\udcd6 Baseline guide \u2192 \ud83d\udd0e Read the tenant. Every step must report itself as not ready, naming the missing groups, units, locations and policies rather than showing a bare count.",
        "On a tenant with the baseline fully deployed: every step must report ready, and the per-persona policy coverage must match what \ud83e\uddec Baseline Policies reports for the same tenant. If the two disagree, the guide is wrong \u2014 it uses the Baseline tool's own matcher precisely so they cannot.",
        "Decline the Terms of use consent when it is asked for: the step must read \u201cnot read\u201d, never an empty list presented as \u201cnone\u201d.",
        "Read the six step texts end to end against a deployment you have actually run. This item's risk is the PROSE \u2014 a wrong reason for a step is worse than no reason, and it is the only part no automated check can catch.",
      ],
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
  if (gids.length) L.push("");
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
