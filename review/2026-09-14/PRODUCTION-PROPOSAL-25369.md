# Production proposal — beta 25369

**Decision: hold production promotion.** This is the prepared work package 5 proposal, not deployment approval. Work packages 1–3 are implemented; work package 4 now has local scale, browser, container and limited live read-only evidence. The remaining gates below are explicit.

## Candidate scope

Promote queue items **201–204 together** after acceptance: trustworthy group replacement and incomplete-result handling, P1/premium preflight, source-safe sign-in reads, responsive read/worker infrastructure, and acceptance fixes. Preserve the separate disposition of item 200 and all deliberately beta-only tools. The queue's production marker is v1.0.313; verify the actual deployed production revision before preparing the final port.

Runtime changes added in 25369:

- `js/analysis-jobs.js`, `js/analysis-worker.js`: chunk input/output transfers and preserve global report ordering.
- `js/workspace.js`, `css/workspace.css`: mobile Escape/focus handling and narrow identity/header layout.
- `Dockerfile`, `selfhost/nginx.conf`: normalize readable site permissions and remove duplicate gzip MIME declaration.
- Build/cache keys, tool version, Help queue and changelog advance together.

The complete candidate includes the prerequisite changes from 25368. Do not copy just the worker files without their loader, engines, cache versions and regression tests.

## Evidence available

See `BETA-25369.md` and its JSON/test artifacts. The evidence includes 79 offline tests, 16 theme/brand/viewport combinations, real-browser worker/Stop measurements, a local nginx container and bounded read-only Graph checks in the user-specified P2/Intune test tenant. No tenant object was created, edited or deleted.

## Required gates before production

1. **P1-only:** use a separate P1-only tenant or suitably isolated P1-only test configuration. Verify core reads and explicit optional-source unavailability. The current test tenant has P2, Intune and positive Cloud Apps SKU evidence, so it cannot establish the P1-only lane.
2. **Write acceptance in a dedicated tenant:** approve the exact temporary objects and test users before creating anything. Verify stage/readback, failed copy, replication delay, premium refusal, policy-slot handling and safe rollback. Fixture tests are not evidence of successful real-tenant writes.
3. **API compatibility:** v1.0 repeatedly returned 98 policies; beta returned 105, including seven additional disabled policies. Resolve the inventory difference before migrating the policy endpoint or claiming equivalent coverage. This candidate retains the existing beta policy inventory route. The difference is not treated as seven missing tenant policies.
4. **Real scale:** measure a permitted read in a large tenant, including request count, first useful result, latency, throttling and browser memory. Synthetic processing of 250k users and 1m events is not a Graph throughput test.
5. **Remaining UX/source lanes:** full assistive-technology audit, optional source failure/retry behavior and representative export review. Current visual checks target the Wave screen, navigation and shared analysis path; they do not certify every screen and export.

## Concrete write-test proposal, not executed

Use the already identified test tenant after separate authorization. Create only dedicated disposable objects with the prefix `ENCA-BETA-25369-ACCEPTANCE`: two static security groups (Source and Replacement) and one **disabled** CA policy targeting Source. Keep a ledger of their returned IDs. Use only explicitly designated disposable test users; none have been designated yet. Do not change any existing group, policy, role, subscription or emergency-access exclusion.

Verify Source membership, copy to Replacement, read back exact required members, then change the disabled test policy's group reference. Simulate refusal locally; in the tenant, stop on any failed copy/readback and inspect the ledger. Never enable the test policy or target All users. Check premium/capacity rejection using preflight, without filling the tenant to 240 policies.

Cleanup is limited to the newly created IDs in the ledger, under the authorized test scope. Preserve evidence and verify cleanup. No deletion of pre-existing tenant objects is part of this proposal. Authorization and designated test-user IDs are needed before this test can start.

## Later release procedure

- Resolve and sign off each gate with dated evidence. Update Waiting for production and this proposal with actual outcomes.
- Record the current production commit/image digest and retain a deployable copy. Export any tenant policy definitions separately if the approved rollout later involves tenant changes.
- Prepare a reviewable production port of the accepted queue items, retaining beta-only carve-outs and using the production build series. Re-run the relevant offline, browser and container checks on that exact candidate.
- Obtain the user's production go-ahead for that concrete candidate. Publish only then; this task performs no production push or deployment.
- Smoke-test sign-in, policy inventory, P1 behavior, read cancellation and representative exports after deployment. Compare inventory with the approved source and scope.

## Rollback

For an application-only release, redeploy the recorded previous production artifact and verify cache/build versions. That does not undo tenant writes. Any separately approved tenant changes need their own ID-based backup/readback/restore procedure and the same licensing/permission safeguards. Never infer rollback success from a browser refresh or a dismissed error.
