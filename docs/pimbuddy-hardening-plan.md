# PIM Buddy: reliability plan

Review date: 25 September 2026. Repository: ENCA, build **32415**, commit **8f32ffc**. This is a review and proposed implementation sequence; no application or tenant changes were made.

## Recommendation

Keep the two-workspace shell and the pure comparison module. Harden the access model, evidence, and existing scripts before adding browser deployment. A reliable PIM Buddy must answer three separate questions: **does the configuration match, does the access model work, and was the result fully verified?** A green policy comparison cannot answer all three.

The supplied CloudFellows PIM Designs and PIM-buddy Workspace HTML files are design references, not execution instructions or proof of Microsoft platform behavior. Their proposed build order should change because the review found foundational conflicts.

## Current implementation versus the designs

| Area | Current repository | Remaining work |
|---|---|---|
| Workspace 02 | Dedicated shell, navigation, remembered workspace, shared tools | Actual PIM-specific views and evidence-driven home |
| T48 baseline | Pure comparison, role settings, assignment findings, group model, reports | Correct identities, scope, completeness, effective access and stable selections |
| Profiles | Small and multi-region | Large single-region; validated profile semantics |
| Regions | CSV/JSON parsing, template expansion, AU/group/eligibility comparisons | Strict validation, group activation settings, full scope and processing checks |
| Intune | Catalog definitions and regional deployment script | T53 read/compare; verification of complete RBAC semantics |
| Deployment | Two PowerShell scripts and EasyPIM configuration exports | Reliable preview, dependency plan, durable outcome report and read-back |
| Roles, designer, browser deploy | T49–T51 are design targets | Implement after foundations; keep planned status explicit |
| Shared tools | Existing modules labelled “PIM lens · roadmap” | PIM-specific groups, checks, audit views and help |

Relevant implementation: [workspace shell](/Users/mihaimonte/REPO/enca/js/workspaces.js:41), [comparison engine](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:1), [application integration](/Users/mihaimonte/REPO/enca/js/app.js:21494), [catalog](/Users/mihaimonte/REPO/enca/js/pimBaselineData.js:1).

## Ordered plan

Keep these action numbers stable during implementation.

### 1. Resolve the activation model — release blocker

The designs promise one group activation that grants the persona's roles. The exporter instead makes the group **eligible** for its roles; the regions script does the same. Group membership activation alone does not make those eligible role assignments active.

Microsoft documents two distinct patterns: active group membership with eligible role assignment, or eligible group membership with active role assignment. It also documents workload activation delays for the latter in Exchange, SharePoint and Purview. [Microsoft: PIM for Groups](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/concept-pim-for-groups).

**Deliver:** an explicit activation model per persona/role mapping, including assignment type, scope, duration and the policy that actually gates access. Prefer the group-membership model where one activation is intended, with deliberate workload exceptions. Keep direct human standing access separate from intentional active role assignments to PIM groups.

Audit effective gates when changing the model. SecOps carries Tier 0 roles but uses GroupTier1; Ops carries Tier 1 roles under GroupTier2. A strong direct-role policy must not be presented as protection for a weaker group path. Validate the authentication context's actual enabled CA enforcement and approver configuration, not just the string `c1`.

**Pass condition:** an eligible test administrator activates the documented path, gains exactly the intended permissions and scope, and loses them after deactivation/expiry; workload delays are measured and documented. Prove this separately for central and regional personas.

Evidence: [eligible exports](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:470), [regional eligibility creation](/Users/mihaimonte/REPO/enca/tools/pim/New-PimRegions.ps1:311), [role/group tiers](/Users/mihaimonte/REPO/enca/js/pimBaselineData.js:195).

### 2. Correct restricted-AU protection — release blocker

The design puts every PIM group in AU-RM-Admins. The script's `-RmauMembers` selects every `PIM-SG-*` group. Microsoft explicitly documents that role-assignable groups inside restricted AUs cannot have their membership modified, and documents limitations with identity governance features for protected objects. This conflicts with PIM-managed membership. [Microsoft: restricted AU limitations](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/admin-units-restricted-management#limitations).

**Deliver:** a supported protection matrix for privileged users, role-assignable PIM groups, ordinary sensitive groups and executive objects. Exclude incompatible objects from automatic placement. Validate the scoped administrators and recovery route before moving objects. Treat emergency accounts as explicit tenant object IDs; naming patterns may suggest candidates but must not silently establish protection.

**Pass condition:** supported account administration, activation, deactivation and recovery work after protection. Attempts to place incompatible groups are blocked before any write. Do not infer that scoped User Administrator can manage all privileged users or role-assignable groups.

Evidence: [RMAU population](/Users/mihaimonte/REPO/enca/tools/pim/New-PimRegions.ps1:329).

### 3. Make the existing scripts safe before extending them — release blocker

`New-PimBaseline.ps1` advertises preview by default, but group rename/create use `ShouldProcess` without `SupportsShouldProcess`, and without checking `-Apply`. Its duplicate deletion calls `Remove-MgGroup` directly. Only the later orchestrator invocation is switched to `-WhatIf`. A harmless local PowerShell probe confirmed that this form of `ShouldProcess` returns true by default.

The script also continues after backup failure, and initial mode uses an eight-second warning rather than approval of an exact removal plan. “Empty” duplicate groups are checked for members, owners and directory-role schedules, not all external references. The claimed 30-day recycle-bin recovery must not be relied upon for these security-group deletions.

**Deliver:** one write gate covering every mutation; a complete read-only plan first; explicit apply bound to the tenant and plan; required verified backup before destructive changes; exact duplicate IDs and reference analysis; initial mode disabled until its deletion plan is independently reviewable. Separate provisioning from duplicate cleanup. Pin and test supported Graph/EasyPIM versions.

**Pass condition:** mocked execution records **zero non-GET tenant calls** in default preview and explicit WhatIf, including rename and duplicate paths. Missing protection evidence or failed backup blocks destructive execution. Re-running a successful apply produces no unintended mutations.

Evidence: [script parameters](/Users/mihaimonte/REPO/enca/tools/pim/New-PimBaseline.ps1:116), [rename](/Users/mihaimonte/REPO/enca/tools/pim/New-PimBaseline.ps1:174), [duplicate deletion](/Users/mihaimonte/REPO/enca/tools/pim/New-PimBaseline.ps1:202), [backup and initial mode](/Users/mihaimonte/REPO/enca/tools/pim/New-PimBaseline.ps1:311).

### 4. Make every comparison defensible — high priority

Reproduced offline: group settings can be unread while overall group status remains Match; assignment scope changes do not affect the central group's carrying-role verdict; different notification domains normalize to the same value. Name-keyed maps silently collapse duplicate objects. A failed framework-group read becomes an empty array and can then appear as missing groups. Regional status can remain Match while Intune is unread.

**Deliver:** resolved IDs for roles, principals, groups and AUs; built-in role template identity where available; duplicate-name conflicts; assignment comparisons by principal, role, scope, type and schedule. Keep names as expected naming checks. Separate policy compliance, assignment findings and completeness. Use Match, Drift, Missing, Unknown, Conflict and Not applicable with documented meanings. Unknown must never become a create plan.

Normalize only semantically equivalent values. Preserve full notification addresses and event-specific settings, default recipient enablement, approval-stage behavior and missing rules. A regional assignment at the correct scope does not cancel a second tenant-wide assignment. Read regional Member policies and consider Owner policy and ownership bypasses. Validate dynamic membership processing state, not just rule text.

**Pass condition:** fixtures for duplicate names, wrong IDs, unexpected extra privileges, scoped versus tenant-wide assignments, missing rules and partial reads produce precise findings, never a false pass. Every finding links to its source and observation time.

Evidence: [normalization](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:103), [central comparison](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:171), [regions](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:332), [read error handling](/Users/mihaimonte/REPO/enca/js/app.js:21603).

### 5. Isolate tenant state and harden data loading — high priority

There are useful existing controls: shared paging, cancellation, throttling and a tenant/policy snapshot guard. Keep them. However, sign-in/demo reset clears the PIM results but not the loaded region rows/text; restoration does nothing when the new tenant has no saved file. Old rows can consequently carry into another context. Completed results also need explicit freshness handling.

PIM for Groups policy consent is missing from the PIM-specific scope list; it is only mentioned after a failure. Microsoft's documented permission is `RoleManagementPolicy.Read.AzureADGroup`. [Microsoft: policy assignment permissions](https://learn.microsoft.com/en-us/graph/api/policyroot-list-rolemanagementpolicyassignments?view=graph-rest-1.0#permissions).

**Deliver:** a PIM session store keyed by tenant, account, run, profile, catalog version and region-file hash. Clear/invalidate all relevant state on tenant/demo/sign-out changes; discard late responses. Preserve per-source permission/error/completeness metadata. Request read permissions by feature and distinguish consent, operator role, licensing and endpoint failure. Reuse Graph paging/batching; verify inner batch failures and pagination. Load PIM on demand with bounded concurrency; do not add tenant-wide reads to sign-in.

**Pass condition:** tenant A → tenant B with no regions file produces no A data or export; cancel, refresh failure and late response cannot revive stale results. PIM reads remain independently usable when optional AU, group-policy or Intune evidence is unavailable.

Evidence: [session resets](/Users/mihaimonte/REPO/enca/js/app.js:2461), [region restore](/Users/mihaimonte/REPO/enca/js/app.js:21559), [PIM read scopes](/Users/mihaimonte/REPO/enca/js/app.js:21501).

### 6. Make input, selection and exports deterministic — high priority

Region JSON such as `{"regions":{}}` or `[null]` throws instead of returning validation errors. Invalid attributes are reported while rows remain usable. Template substitution inserts unescaped values into dynamic-rule strings. Browser-exported approvers are arrays, whereas the PowerShell parser coerces them to a string before splitting. The browser and script need one agreed contract.

Delta selection is read from visible checkboxes. Repainting after a filter/search resets selections, and hidden selected rows are lost. Config actions currently put JSON inside a Markdown report, adding manual steps to obtain the advertised file.

**Deliver:** versioned schemas shared by catalog, profiles, regions and plan artifacts; strict type/size/duplicate checks; supported attribute validation and safe rule-value serialization. Distinguish warnings from blocking errors. Validate both CSV and JSON paths, including multiple approvers. Maintain selected IDs independently of the DOM. Offer actual JSON/CSV downloads plus a separate human-readable report with tenant, profile, catalog version, source time and checksum. Preserve one canonical catalog and generated artifacts.

**Pass condition:** malformed input never crashes or reaches deployment; CSV → JSON → script preserves identical meaning; filter changes preserve deliberate selection; downloaded files parse and are accepted by their intended consumer. Display an exact selected-change summary before export.

Evidence: [input and substitution](/Users/mihaimonte/REPO/enca/js/pimbaseline.js:262), [PowerShell input](/Users/mihaimonte/REPO/enca/tools/pim/New-PimRegions.ps1:155), [selection/export](/Users/mihaimonte/REPO/enca/js/app.js:21645).

### 7. Build the actual PIM administration views — after the foundations

**Deliver:** T49 read-only roles and assignments first: direct/group paths, eligible/active/activated, tenant/AU scope, expiry, protection exceptions and unknowns. Add dedicated PIM views to Groups, Checks and Changes using common domain data. Separate framework model comparison from optional membership/ownership auditing; customer memberships should not be copied into the reusable catalog. Add the missing single-region profile after its access model is settled.

The home should show configuration state, effective-access findings and unread sources separately, with source age and drill-down. No overall “secure” score from partial inputs. Reserve Member and Owner distinctions, activation failures, approver readiness and expiring eligibility in the design. Use the mockup's visual structure after correcting its contradictory claims.

**Pass condition:** every tile opens the exact supporting rows; screen/report/filter counts agree; planned tools remain labelled. Keyboard, narrow-screen, dark/light, empty, loading, failure and partial states are verified, alongside workspace switching and shared-tab behavior.

### 8. Complete regional and Intune verification before provisioning more — after 4–6

The regional script treats existing Intune role/tag/assignment names as sufficient, skips unsupported custom-role actions, and ignores errors reading current assignments. `Ensure-GroupPolicy` covers only part of the template. It does not provide proof that existing objects match or that accepted requests became effective.

**Deliver:** T53 comparisons for allowed actions, scope tags and tag assignments, role members, resource scopes and full role bindings. Gate optional features on capability evidence. Do not create reduced custom roles silently or create assignments after unreadable discovery. Reconcile current objects by ID and content, verify all supported group-policy settings, and represent access reviews/Autopilot as manual or unsupported until genuinely implemented. Keep Azure RBAC completeness separate; an Azure-labelled group is not proof of an ARM role assignment.

**Pass condition:** rerunning repairs an interrupted tag-assignment step without duplicates; missing required actions blocks the plan; a regional operator can perform allowed work in one region and is denied equivalent work outside it. Central broad roles are checked as alternate access paths.

Evidence: [partial policy writer](/Users/mihaimonte/REPO/enca/tools/pim/New-PimRegions.ps1:284), [Intune provisioning](/Users/mihaimonte/REPO/enca/tools/pim/New-PimRegions.ps1:345).

### 9. Add browser deployment and policy design behind one execution model

**Deliver:** a shared dependency-aware plan for script and browser execution: exact tenant and IDs, operation type, before/after, prerequisites, protected principals, catalog hash, approval state and verification query. Revalidate before apply. Stop means stop scheduling new writes, then reconcile in-flight requests. Poll asynchronous schedule requests through completion and read back the resulting configuration. Reuse RunLedger for presentation, backed by durable operation outcomes and exportable evidence.

Start with a small supported operation set in T51; add T50 only after validation and round-trip export are proven. Treat EasyPIM as a versioned adapter. Catalog capture from cloudfellows.dev must produce a reviewed proposed diff, not automatically bless a tenant snapshot. Recovery is an explicit compensating plan; do not promise transactional rollback of identity operations.

**Pass condition:** preview and apply address the same reviewed targets; stale plans stop; interruption/resume does not duplicate assignments; partial failure is visible per operation; verified completion requires read-back, not only HTTP success.

### 10. Define the release gates and prove them

**Deliver:** focused automated suites plus controlled live acceptance. The current 11 baseline tests are useful catalog/demo tests but do not establish deployment safety, Graph failure handling or tenant lifecycle behavior.

| Gate | Required evidence |
|---|---|
| Comparison | IDs/scope/types, duplicate conflicts, complete and partial reads, rule absence, permissions, notification and approval semantics |
| Browser | Tenant/demo transitions, cancel/refresh races, filters/selections, actual downloads, accessibility and representative large tenants |
| Scripts | Zero-write preview mocks, fault injection, protected IDs, backup failure, idempotent rerun and schema parity |
| Live pilot | One central and one regional persona; activation/deactivation; allowed/denied access; Intune boundary; approver and recovery scenarios |
| Release | Help → Waiting for production, changelog and validation report updated together; passed, pending and environment-dependent checks explicit |

No customer deployment release until actions 1–6 pass their gates and the pilot proves the selected access model. Do not use passing unit tests or the baseline tenant's label as substitute evidence.

## Suggested delivery batches

1. **Containment and model correction:** actions 1–3. Correct the catalog/design contract and unsafe scripts before adding writes.
2. **Trustworthy read-only product:** actions 4–6. Stable evidence, tenant isolation, validated inputs and dependable exports.
3. **Complete operational visibility:** actions 7–8. Roles, PIM views, regional boundaries and Intune comparison.
4. **Controlled change management:** action 9, then the full action 10 release gate. Test coverage from action 10 should be added throughout every batch.

## Verification performed in this review

- Read the PIM catalog/comparison/regions/export code, app integration, workspace shell, both scripts, baseline tests, shared Graph/progress/ledger infrastructure and relevant release entries; inspected both supplied HTML designs.
- Ran `node --test tools/pimbaseline.test.cjs`: **11 passed, 0 failed**.
- Offline probes reproduced unread group policies labelled Match, unchanged carrying-role verdicts after scope mutation, wrong recipient domains comparing equal, and malformed-region JSON exceptions.
- A standalone, non-mutating PowerShell probe verified default `ShouldProcess` behavior. No deployment script was executed against a tenant.
- Checked current Microsoft documentation for group-versus-role activation, restricted AU limitations and policy-read permissions.
- Browser interaction/layout, real Graph responses, consent, deployment and live access boundaries were **not validated in this review**. The default local module resolution did not provide Playwright; no browser pass is claimed.

Existing application files and the pre-existing untracked dashboard plan were left unchanged.

## Layout and shared-tool follow-up

In the follow-up review, inspected the local demo in the in-app browser at its default desktop viewport: workspace home, baseline initial/results views, and the PIM groups destination. This adds a desktop visual check, not a complete responsive/accessibility or live-tenant acceptance pass.

**Verdict:** keep the shell; refine the information hierarchy. The shared modules are useful foundations, but most are not yet adequate PIM views. Expand action 7 with the following subitems, retaining the original plan numbers.

### 7a. Put operational information before the tool directory

Keep the workspace switch, navy PIM header, left rail and retained tabs. Replace the large empty Recent tools column with a compact recent row. Make home lead with on-demand findings, incomplete sources, expiring access and next actions. Before a read, show an honest “not read” state and one clear read action. Move Help/Changelog/Roadmap into a compact support area; counting them as four of eleven tools exaggerates operational breadth. Replace the contradictory “Reads only — every write…” wording with per-tool read/write labels.

### 7b. Separate sections from verdict filters

The baseline toolbar currently mixes All/Differs/Missing/Match with Groups/Assignments/Regions, plus profile, search and four actions. Use section tabs for Roles, Groups, Regions and later Intune; a separate row for verdict filters and search. Keep the tenant/profile/catalog/freshness context visible. Reduce the long introductory paragraph to a short description with expandable guidance. Use one primary read/refresh action and an Export menu. Show selection count and clear selection scope.

### 7c. Make result tables easier to inspect

Use compact rows with severity, policy state, access findings, scope and completeness; open full differences in an inspector. The current expanded lists make each row tall and groups sit far below the role list. Coordinate sticky controls with table headers so scrolling retains column meaning. Translate durations such as PT2H to “2 hours” in the main view while preserving raw values in detail/export. Show “Policy matches · assignment finding” instead of an unqualified green Match beside a red finding.

### 7d. Give each crossover tool a real PIM context

| Tool | Current issue | PIM destination required |
|---|---|---|
| T12 Groups | “PIM groups” opens Conditional Access groups, CA catalog and “Used by CA policies” scope | PIM catalog, carried roles/scopes, Member/Owner policies and eligible/active membership; prevent CA-template creation actions from appearing as PIM fixes |
| T19 User/Group analyzer | Useful directory-role/eligibility and dependency investigation; not a complete “Who holds what” inventory | Deep-link a selected principal by ID, default to relevant services, show unknown coverage; keep T49 as the dedicated assignment inventory |
| T17 Sign-in log | CA failures/interruptions, not a PIM request/approval history | Activation-related sign-in drill-down with explicit correlation limits; separate request, approval, activation and expiry events |
| T16 Changes | The current audit runner calls Policy and watched-CA-group queries, then CA-specific parsing/filtering | PIM role/policy/group changes with actor, principal, role, scope, result and correlation; do not label current CA-only results as PIM history |
| T08 Checks | Opens CA bypass checks and depends on loaded CA policies | PIM checks driven by assignment and policy evidence; cross-link CA authentication-context enforcement as one dependency |
| T27 Restricted AUs | Shared AU administration is relevant, but the PIM card promotes blanket PIM-group placement | Supported object eligibility, scoped administrators and recovery checks from action 2; retain a general AU view separately |

Evidence: [PIM roster and labels](/Users/mihaimonte/REPO/enca/js/workspaces.js:48), [CA group entry](/Users/mihaimonte/REPO/enca/js/app.js:4745), [CA audit entry](/Users/mihaimonte/REPO/enca/js/app.js:12999), [audit category queries](/Users/mihaimonte/REPO/enca/js/audit.js:318), [CA checks entry](/Users/mihaimonte/REPO/enca/js/app.js:21329).

### 7e. Reuse logic while isolating workspace state

Use shared Graph clients, domain readers, validation and components with an explicit CA/PIM context. Keep workspace-specific filters, selections and defaults separate. A shortcut, card, tab, heading and accessible label must name the same task. Provide deliberate cross-links such as “View enforcing CA policy” and “Inspect this group’s other uses,” carrying immutable IDs. Switching workspaces must not change the scope of a pending action or reinterpret cached results.
