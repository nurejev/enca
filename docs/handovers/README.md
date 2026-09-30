# PimBuddy customer documentation

Read **PimBuddy_Baseline_Design_and_Object_Reference.docx** before **PimBuddy_Admin_Handover.docx**. Both describe local build 32431 and distinguish current functionality from the target Deploy my model workflow. The baseline is a catalog reference, not a live tenant inventory.

Original and Before_Alignment Word files are retained historical backups, not current operating instructions.

Run `node --test tools/pimdocs.test.cjs` alongside the PIM regression suites after catalog changes. A new application build alone does not require a new review: the documents keep the build they were reviewed at (32431) and the test only checks that it is not newer than the app. A change to the catalog contract does fail the test and does require the review below. The documentation contract captures reviewed model content and Word checksums. Review and update both Word documents, render and inspect their pages, then deliberately refresh the reviewed snapshot and checksums. Never refresh the snapshot simply to suppress a failure. Application behavior changes also require a human workflow review.

Validation: `review/2026-09-29/BETA-32431.md`.
