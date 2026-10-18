# ENCA dashboard implementation plan

Created: 21 September 2026  
Status: planned; implementation has not started  
Review baseline: build 25420, commit `55d0f3b`

## Intended result

Use **mockup 1: Overview** as the landing page, with the finding evidence panel from **mockup 2: Review desk**. Keep the more detailed **mockup 3: Configuration map** as an optional, collapsed section or secondary view.

The dashboard should explain what is configured, what needs review, and what has actually been checked. Add **zero dashboard-specific sign-in requests**, no new sign-in permissions, and no automatic tenant-wide scans.

References:

- [Detailed review and source locations](/Users/mihaimonte/REPO/enca/review/2026-09-21/dashboard-review/REVIEW.md)
- [Interactive mockups](/Users/mihaimonte/REPO/enca/review/2026-09-21/dashboard-review/preview.html)
- [Original local measurements](/Users/mihaimonte/REPO/enca/review/2026-09-21/dashboard-review/inspection.json)

Mockup numbers are illustrative. The referenced review describes the checkout as it existed on 21 September; recheck the current implementation before changing it.

## Before implementation

- [ ] Inspect the current branch, build, dashboard and repository instructions; preserve unrelated work.
- [ ] Record baseline request counts, time from policies available to interactive Home, and main-thread long tasks using repeatable local fixtures. Keep authentication time separate from dashboard processing time.
- [ ] Agree a numeric performance tolerance from repeated baseline runs before judging the implementation. The earlier approximately 5 ms demo render is only a reference, not a live-login guarantee.

## 1. Correct incomplete or misleading information

Primary files: `js/overview.js`, `js/app.js`, `js/exclusions.js`, `js/gapcheck.js`.

- [ ] Include every exclusion category in the breakdown, including locations and platforms. Make the breakdown reconcile with the total and label it **Unique exclusion references**.
- [ ] Render unknown license shortfalls and bypass counts as **Unknown** or **Incomplete**. Do not substitute zero or the length of an unrelated list.
- [ ] Replace the provisional numerical score with **Configuration checks — partial** when required evidence is missing. If a score is retained later, expose its evidence coverage and limitations.
- [ ] Distinguish missing modification dates from no recent changes. Use **Report-only; last modified 30+ days ago**, without implying time spent in that state.
- [ ] Recheck Microsoft retirement guidance at implementation time. Show the applicable cohorts, dates, source link, and last-verified date; keep tenant impact **Not assessed** until checked.

Acceptance: incomplete reads never appear as a successful zero; exclusion totals reconcile; published advisories are clearly separated from tenant findings.

## 2. Build the compact snapshot header

Primary files: `js/overview.js`, `js/app.js`, `js/workspaces.js`, `css/app.css`, `css/workspaces.css`.

- [ ] Show tenant identity, snapshot date/time, and **Total / Enabled / Report-only / Off** together.
- [ ] Keep all four counts available on mobile and remove duplicate snapshot information elsewhere on Home.
- [ ] Shorten the welcome area and replace large empty run cards with compact check rows.
- [ ] Support distinct **Loading**, **Loaded with zero policies**, **Read failed**, and **Loaded** states.
- [ ] Keep All tools accessible and place the full library below the overview, collapsed or rendered when opened.

Acceptance: essential counts and status are visible on narrow screens; an empty tenant is not mistaken for a missing dashboard.

## 3. Connect findings to their evidence

Primary files: `js/app.js`, `js/overview.js`, existing policy/tool navigation and detail components.

- [ ] Give each finding a stable identifier, severity, affected policy IDs, evidence state, snapshot/run reference, and review action.
- [ ] Show two or three top findings with **View all findings**; preserve the full list behind that action.
- [ ] Open an evidence panel showing original policy names, relevant conditions, AND/OR grant logic, exclusions, scope and observation time.
- [ ] Carry finding/policy filters into the destination tool. Preserve the selection when returning to Home.
- [ ] Make policy counts open the corresponding filtered policy list. Offer sign-in validation and audit history as separate actions.
- [ ] Distinguish **Not run**, **Partial**, **Failed**, **Previous snapshot**, and **Complete for the stated scope**. Avoid implying that report-only policies are ready to enable.

Acceptance: a finding opens the matching evidence, and users can tell what was checked and what remains unknown.

## 4. Add summaries from existing data

Primary files: `js/overview.js`, `js/app.js`, existing baseline, exclusion and run-metadata modules.

- [ ] Add a report-only review queue and recently modified policy list using available timestamps.
- [ ] Show exclusion categories and the number of policies containing exclusions; distinguish unique references from occurrences and affected users.
- [ ] Show baseline catalog name/version/source, selection basis, and matched/missing/outdated/conflicting requirements.
- [ ] Add last-run time, scope, completeness and error details to compact check rows.
- [ ] Add optional counts of policies referencing MFA/strengths, device controls, risk, legacy-client conditions and session controls, split by policy state. Explain that categories overlap and do not measure effective protection.
- [ ] Optionally compare policy definitions with the previous refresh in the same session. Compare by policy ID and normalized definition; exclude volatile metadata from configuration diffs. First use should say **No earlier snapshot**. Do not infer the actor or complete audit history.

Acceptance: summaries are derived from known inputs, with clear units and limits. The detailed configuration map stays secondary to the overview.

## 5. Reuse context already fetched at sign-in

Primary files: `js/graph.js`, `js/app.js`, `js/runmeta.js` and analysis consumers.

- [ ] Retain the existing named-location, authentication-context and authentication-strength responses alongside the name resolver, preserving compatibility with its callers.
- [ ] Attach tenant/account identity, observation time, completion/error state and source to each retained dataset.
- [ ] Use successful reads in dashboard analysis. Preserve unknown status for failed, incomplete or unread inputs; keep CA settings and license data independent.
- [ ] Wire this context before enabling summaries that depend on it. Do not add retries, consent prompts or additional reads for the dashboard.
- [ ] Clear retained data and previous snapshots on sign-out, tenant/account change and demo/live transitions.

Acceptance: richer findings reuse completed reads without increasing startup requests or mixing contexts between sessions.

## 6. Keep additional work off the sign-in path

Primary files: `js/app.js`, dashboard summary/rendering code.

- [ ] Establish tenant and snapshot identity before the initial overview render.
- [ ] Build one shared derived summary per snapshot. Cache by tenant/account, policy revision, catalog revision, scope, relevant context and tool results.
- [ ] Invalidate after policy refreshes, local edits, context/catalog/scope changes and completed tool runs. Do not rely only on policy count.
- [ ] Paint identity, state totals and timestamps first. Schedule heavier local comparisons after first paint; use bounded chunks or a worker only if profiling warrants it.
- [ ] Cancel or discard calculations for superseded snapshots. Avoid rebuilding the full dashboard when only one check row changes.
- [ ] Keep sign-ins, audit history, expanded memberships, MFA registration, licensing, risky users and retirement-impact scans behind explicit actions. Display cached results with their scope and freshness afterward.

Acceptance: zero added dashboard startup requests or scopes, no new main-thread tasks over 50 ms, and p95 Home readiness within the agreed baseline tolerance.

## 7. Validate correctness, usability and performance

- [ ] Add focused tests for exclusion arithmetic, missing dates, unknown versus zero, incomplete inputs, cache invalidation and session isolation.
- [ ] Check loading, zero-policy, failed/403/partial reads, stale runs, tenant switching and demo/live switching.
- [ ] Verify finding selection, policy filters, evidence details, back navigation and Run actions.
- [ ] Inspect light/dark layouts at 1440, 1024, 736, 390 and 320px, plus keyboard access, focus behavior and screen-reader labels.
- [ ] Compare request counts and repeated timing distributions against the baseline using small, medium and large datasets, many app exclusions and slower CPU settings.
- [ ] Run relevant existing regression and repository checks. Record actual outcomes; local demo results do not establish live-tenant performance.

## 8. Prepare the beta release record

- [ ] Update the build/version and changelog using current repository conventions.
- [ ] Update **Help > Waiting for production** in `js/promote.js` alongside the implementation and changelog.
- [ ] Save a validation report separating **Passed**, **Failed**, **Pending**, **Skipped** and **Environment-dependent** checks, with screenshots and performance evidence.
- [ ] Document remaining live-tenant acceptance and the rollback point before promotion. Creating this plan does not publish or deploy a change.

## Completion criteria

The overview and evidence panel are implemented; displayed information has clear provenance and scope; unknowns remain explicit; mobile and keyboard flows work; performance acceptance passes; and beta release records accurately reflect validation status.
