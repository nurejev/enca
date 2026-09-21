# Proposal: list + detail workspace

Design only. No beta implementation or tenant operations. Based on the supplied CA groups layout and inspection of current ENCA renderers. Three interactive examples: Policies, Sign-in log and Changes.

## Recommended behavior

1. **Policies:** List is the proposed default. A row opens a detail panel to the right (roughly 54% list / 46% detail). Preserve the full original name, including its own CA number; never add the ENCA sequence. Show only identity, state and a short scope/control summary in the list. Put the full configuration into Settings, Assignments, Conditions, Controls and Definition tabs. Keep Cards and Matrix as alternative views in an implementation.
2. **Keep the wide detail option:** Open wide gives complex settings the entire content width. Return to list restores row focus, filters, checked rows and scroll position. This avoids returning to the narrow inspector that previously lacked space. At narrow widths, use a detail page with Back to results in implementation; the mockup stacks the panels to make both inspectable.
3. **Separate selection from inspection:** Clicking a name changes the inspected record. Checkboxes select rows for bulk actions. Single-policy actions belong to the detail panel; bulk actions belong above the list, explicitly naming the checked count. Existing confirmation and consent flows must remain.
4. **Stable results:** Do not expand large content within rows. Keep sort, filter, scroll and selected-record identity while switching detail tabs. If a filter removes the inspected record, select an available record or show an empty state rather than leaving ambiguous stale detail. Identify partial reads and missing evidence as such.
5. **Density and resizing:** On a large display allow resizing between list and detail, with a minimum readable detail width. Wrap original policy names; never replace them with a generated alias. On smaller desktop widths hide secondary list columns before truncating identity. Retain accessible keyboard navigation and focus restoration.

## Other tools reviewed

| Priority | Tool / view | Proposed list → detail | Why / constraint |
|---|---|---|---|
| 1 | T01 Policies | Policy → assignments, conditions, controls, definition | Strong fit for browsing many policies without repeatedly opening a modal. Retain full-width Matrix and Cards. Existing compact inspector in js/workspace.js is too brief to reuse unchanged. |
| 2 | T17 Sign-in log | Event → event, policy results, authentication, device | Strong fit. Current renderSignins in js/app.js expands policy-group results and event details within the list. Keep Enforced / Report-only distinct and keep policy-group summary as an alternate level. Never confuse sign-in failure with a particular policy's recorded result. |
| 3 | T16 Changes | Audit event → changed fields, actor, event context | Strong fit. renderAudit builds expandable timeline cards; moving before/after fields to the side preserves chronological position. Preserve Summary and snapshot comparison separately. An absent recorded before/after value must remain unknown. |
| 4 | T15 Policy building blocks | Location / strength / context / agreement → definition, used-by policies, findings | Strong fit for the inventory subviews. Current Named locations supports cards/table plus separate compare mode. Keep editing as a deliberate action and preserve trusted-location impact warnings. Recycle bin can use item → original definition + restore consequences; restore still requires its existing confirmation. |
| 5 | T09 Exclusion analyzer, entity lists | Excluded group/user → policies, membership evidence, reason | Good fit. renderGroups currently groups entities with identical policy sets in cards. Side details reduce repeated policy lists. Preserve the matrix for cross-policy comparison and explicit nested/direct membership evidence. |
| 6 | T19 User or Group analyzer | Reference → source, relationship, affected object | Useful for reading individual search results after analysis. Keep source completeness and read failures visible at list level; a clean-looking detail panel must not imply a complete search. |
| 7 | T08 Checks / baseline findings | Finding → evidence, affected policies, remediation context | Useful only for individual findings. Keep summary, comparison and coverage matrices at full width; do not turn every result into a narrow two-panel view. |
| Reference | T12 CA groups | Existing group → Members / Policies / Protection / History | Use this as the shared interaction model. The screenshot already demonstrates it. Do not redesign its underlying actions merely for visual consistency. |

## Keep full-width by default

- T36 user/group comparison and policy matrices: the relationships across columns are the task. Use the side panel only for secondary policy inspection.
- Gap analysis and baseline comparison: preserve the cross-object overview; optional finding details can sit alongside when sufficient space exists.
- Guided rollout and Import: retain their ordered review steps and confirmation boundaries.
- Documentation, permission tables and wide exports: splitting the page does not inherently improve the task.

## Evidence inspected

- js/app.js: renderAudit, renderSignins, renderLocations and their existing view switches.
- js/workspace.js: existing policy inspector and full-detail action.
- js/exclusions.js: renderGroups and grouped policy references.
- index.html: audit, sign-in and policy-building-block screen structure.

## Mockup boundaries and validation

The preview contains synthetic data, not a live tenant snapshot. Search, row inspection, checkboxes, detail tabs and Open wide operate locally. The three examples illustrate the reading layout; production write/export actions are intentionally outside this prototype. The policy definition is illustrative, not a Graph request payload.

Browser validation: switch all three tools; select another policy; switch detail tabs; expand and return; verify no uncaught JavaScript errors and no horizontal page overflow at 390px. The interface has not been integrated into beta. No push performed.
