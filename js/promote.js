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
  productionBuild: "v1.0.305",

  items: [
    {
      n: 123,
      title: "🧩 R36 — Joey Verlinden baseline as a first-class baseline, read live",
      tools: ["Baseline Policies", "Baseline (Joey Verlinden)", "Conditional Access groups", "Protect exclusions", "Restricted AUs", "List Policies", "Baseline guide", "MS Learn checks"],
      builds: [25243, 25244, 25245],
      risk: "medium",
      what: "One ACTIVE baseline per tenant (chosen by a ★ button in the Baseline tool, kept in localStorage under the tenant id, default CloudFellows), and every downstream consumer reads it through Baseline.active(): group templates, persona vaults, the group-to-persona rule, the exclusion-restore convention, the bounded prefix scans, the fallback unit name and the break-glass name. Joey's catalog carries its own contract (js/baselineJoeyData.js) and js/baselineLive.js reads his repository once per session with the bundled snapshot as a stated fallback; connect-src gains api.github.com and raw.githubusercontent.com. Rmau.BASELINE_AUS became a getter; CaMap keys its storage per baseline (the CloudFellows key is unchanged).",
      why: "Medium because it changes where WRITES go when a tenant switches baselines: ② Create builds different groups, the persona panel creates different units, ⑥ Protect files groups into different vaults. All of that is gated on an explicit ★ click that defaults to the old behaviour, and the CloudFellows path is the same functions returning the same values — but the getter and the per-baseline mapping key are new plumbing under every existing call site. Graduates once a tenant has actually switched to Joey's baseline, created his groups and units, placed them, and switched back without the CloudFellows mapping or scans being disturbed.",
      test: [
        "Sign in to any tenant, open 🧬 Baseline Policies: the summary card must show the ★ Active baseline panel saying CloudFellows is active. Open 🧩 Baseline (Joey Verlinden): its card must say it is NOT the active one and offer the ★ button; the source panel must read the repository within a few seconds and turn green with the release, a 7-character commit and a policy count (38 at 2026.6.1). The table header must say the catalog's release, not R26.6.",
        "The repository's policy files are UTF-16 LE with a BOM (PowerShell exports); 25244 decodes them. If the source panel ever again says N of N files were not valid JSON, read the parser message it now quotes before assuming the release is broken.",
        "Block api.github.com (or go offline) and reload: the Joey card must say BUNDLED SNAPSHOT with the failure reason on the card, and the comparison must still render from the snapshot — never an empty table.",
        "Click 🔍 Preview switching on Joey's card: a DRY RUN card must appear, reading the tenant, and its numbers must be checkable — the groups-exist count against ① Check in Baseline + templates scope after the switch, the vaults against the 🛡 baseline panel, and the stop-being-routed list must name every CAB-SEC-U-CAnnn-Exclusion group the tenant has. Keep must return to the card with CloudFellows still active and nothing changed.",
        "With CloudFellows still active, open 👥 Conditional Access groups in Baseline + templates scope and note the expected count and the missing list. Preview and then ★ Switch on Joey's card, reopen the groups tool: the chip must say Working against Joey Verlinden, the expected set must be his 38 (or the live count) “- Exclude”, break-glass and CA-ServiceAccounts names, and ② Create must offer them as creatable — no “no template” warning for them.",
        "Create one of his exclusion groups. Open 🛡 Restricted AUs: the baseline panel must list CA-RMAU-Global … CA-RMAU-BreakGlass (seven) and say the units are ENCA's convention. Create the matching persona unit, then run ⑥ Protect on the group you created: it must route to that unit by the persona rule (source shown as convention), not to the fallback.",
        "Rename that group by one character and rescan: it must show as UNMAPPED, not routed anywhere — the exact-match rule. Map it by hand in 🏷 Group personas; it must route again. Then switch back to CloudFellows: the CloudFellows mapping you had before must be exactly as it was, and the Joey mapping must be gone from view (not deleted — switch to Joey again and it is back).",
        "Under Joey's baseline open 🗂 List Policies → 👥 Assign → action 8 on a policy that carries one of his names: the row must name “<policy name> - Exclude” with the catalog label; a CAB-SEC policy name under his baseline must be derived or none, never CAB-SEC-U-CAnnn-Exclusion.",
        "Under CloudFellows active, repeat one group check, one ⑥ Protect routing and one action-8 plan and confirm every value is identical to before this build — the CloudFellows path must not have moved.",
        "Demo mode: switch baselines and open the groups tool and Restricted AUs — both must render his names without a real tenant; ＋ Bulk add on a demo unit must list his two demo groups.",
      ],
      files: ["js/baseline.js", "js/baselineJoeyData.js", "js/baselineLive.js", "js/rmau.js", "js/camap.js", "js/cagroups.js", "js/assign.js", "js/guide.js", "js/mslearn.js", "js/import.js", "js/rmaudoc.js", "js/app.js", "css/app.css", "index.html", "js/version.js"],
    },
    {
      n: 122,
      title: "📝 Deploy to Azure: what to put in the branding boxes",
      tools: ["Self-hosting"],
      builds: [25242],
      risk: "low",
      what: "The branding and brandingUrl parameter descriptions in selfhost/azuredeploy.json now lead with LEAVE EMPTY on a first deployment, explain that the look is designed in the app afterwards and written back by Save to this deployment, say what the boxes are actually for (a redeploy, or a matching instance for another team), and that it is one or the other rather than both.",
      why: "Text in two ARM parameter descriptions - no template logic, no app code, nothing that can change what a deployment does. It fixes an ordering problem rather than a bug: the form asks for a branding JSON at the one moment nobody can have one, because designing it requires the instance the form is creating.",
      carveout: "PORT CARVE-OUT for the file, unchanged from item 92's: selfhost/azuredeploy.json on beta defaults image to ghcr.io/nurejev/enca:beta and main's must say :latest. This item touches only the two description strings, so port those and leave the defaultValue alone - do not copy the file wholesale.",
      test: [
        "Open the Deploy to Azure button from SELF-HOSTING.md and hover the info icon on Branding and Branding Url: both must lead with LEAVE EMPTY on a first deployment. The portal truncates long descriptions in some views, so check the tooltip actually shows that opening phrase rather than starting mid-sentence.",
        "Deploy with both blank: the instance comes up unbranded, which is the documented happy path.",
        "Then sign in, design a look, and use Save to this deployment - confirming the sequence the descriptions now promise is the one that works.",
        "Deploy a second instance with the branding parameter filled from that look: it comes up wearing it without anyone touching the gear.",
        "The 48000 maxLength is unchanged - paste an oversized value and confirm ARM still refuses before creating anything.",
      ],
      files: ["selfhost/azuredeploy.json"],
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
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
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
