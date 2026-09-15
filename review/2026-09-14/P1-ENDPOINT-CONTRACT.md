# Beta 25368 — P1 endpoint contract

This is the implementation contract for work package 2, not live-tenant certification. The full 40-tool review is in `ENCA-P1-LARGE-TENANT-REVIEW.md`; `js/capabilities.js` records the baseline and optional-source classification for all 40 permanent tool IDs.

## Product and access rules

- P1 is the supported baseline for ENCA's Conditional Access policy and directory workflows. Merely reading an ordinary directory endpoint does not itself establish a P1 licensing requirement.
- P2 risk data, Workload Identities Premium, Intune, Defender and Governance are independent extensions. T30 specifically checks Intune, so its result is unavailable without Intune. Its unavailability must leave P1 policy workflows accessible.
- Subscription evidence, API consent, operator role and source configuration are different checks. A 403 must not mean “no objects” or “not licensed”. Missing positive evidence for products sold through several channels remains unknown.
- An import preview shows unmet requirements per policy. Unknown or absent entitlement blocks policy writes, including restores and batch mutations. Existing premium conditions are preserved. A pure switch to Disabled remains available.
- P1 and P2 service-plan IDs and active subscription status are checked. Additional product identification uses known plan/SKU name patterns; this is deliberately conservative and is not a billing/compliance certification. A false unknown can block a legitimate policy write and requires investigation rather than silent entitlement assumptions.
- Creating/staging/restoring policies checks the 240-policy ceiling. The browser cannot reserve slots atomically against a second administrator; Graph's server result remains authoritative. Existing import ledgers/readback handle partial execution.

## Endpoint-family inventory

The shared Graph base remains **beta** for legacy callers. The table distinguishes explicit versions implemented in this build from stable candidates. A v1.0 API existing does not mean every existing caller has migrated to it.

| Family | Dispatch in this beta | Requirement / role of evidence | Read behaviour and remaining contract check |
| --- | --- | --- | --- |
| `/auditLogs/signIns`, interactive queries | Explicit v1.0 | P1/P2; AuditLog.Read.All plus an authorized reader | Server filters; page limits reported; event interval separate from requested range |
| `/auditLogs/signIns`, non-interactive preview | Explicit beta, event types explicitly filtered | P1/P2 baseline; live P1 acceptance pending | User interactive + non-interactive events; no claim to service-principal/managed-identity coverage |
| `/subscribedSkus` capability reads | Explicit v1.0 | Existing directory permissions, or suitable licence read permission | Full paging; failure gives unknown; 60-second UI cache, fresh write preflight |
| `/users`, `/groups`, direct/transitive memberships | Legacy beta base; v1.0 migration candidate | Directory/group read permissions | Shared queue, complete paging; selected analysis paths accept cancellation |
| `/directoryRoles`, role members, role templates | Legacy beta base; v1.0 migration candidate | Directory role read access | Wave pages role and role-assigned-group membership; unread evidence remains unknown |
| `/directoryObjects/getByIds`, `/$batch` | Legacy beta unless caller explicitly selects v1.0 | Operation-specific consent and role | Batch subresponses checked; Retry-After honored; policy-write guard before sending mutation batches |
| `/identity/conditionalAccess/policies` | Legacy beta, retained for newer policy properties | P1 or policy-specific premium products; Policy.Read.All / Policy.ReadWrite.ConditionalAccess | Read paging, preflight, per-write guard; server acceptance and readback still required |
| Deleted CA policies and restore | Beta | Same policy requirements and write role | Read original payload before restore guard; restore needs a free policy slot |
| Named locations, strengths, contexts, terms of use | Existing endpoint-specific calls, mostly beta base | Policy / agreement scopes as requested by each tool | Selected failed reads now abort rather than create a false absence; full migration requires contract tests |
| `/auditLogs/directoryAudits` | Legacy beta base; v1.0 migration candidate | AuditLog.Read.All and reader role | Audit and membership records paged; a failed required read cannot be a clean audit |
| `/identityProtection/*` | Existing endpoint-specific calls | P2; risk read scopes and roles | Optional evidence only; unavailable risk is not low risk |
| `/security/runHuntingQuery` | Existing Graph-base routing | Table-specific entitlement, P2 for the Entra sign-in table, hunting permissions and populated source | Day/slice queries; row caps and source failures remain explicit; no inference that P2 supplies Defender |
| `/deviceManagement/*` | Endpoint-specific legacy calls | Intune plus relevant DeviceManagement scopes | Optional to P1; catalogue read failure does not prove no configuration |
| `/identityGovernance/*`, PIM, restricted AUs | Endpoint-specific legacy calls | Feature-specific entitlement and administrative roles | Separate from baseline P1; role/permission/feature contract tests pending |
| `/auditLogs/signInEventsAppSummary` | Beta | Audit access; exact P1 contract still pending | T39 summary-based evidence must be described as the returned summary window, not a complete tenant inventory |
| Azure ARM / Resource Graph | Existing API versions per call | Azure subscription/resource RBAC and token | ARM response handling fixed; live ARM and source-specific retry validation pending |
| M365, Exchange and other T19 optional sources | Existing source-specific calls | Source-specific licences, consent, roles and setup | Independent failures must not be represented as a successful empty search |

The inventory is by family rather than every URL permutation. `Capabilities.endpoints` is the compact registry for the principal families; it describes supported contracts, not a generated map of every call site. Retiring remaining beta routes and testing every tenant/permission combination belong to work package 4 acceptance and a later compatibility pass.

## Reference documentation

The review used Microsoft's official documentation and the installed Merill msgraph skill. These links support the contract; actual tenant evidence is still required:

- [List sign-ins](https://learn.microsoft.com/en-us/graph/api/signin-list?view=graph-rest-1.0)
- [List sign-ins, beta](https://learn.microsoft.com/en-us/graph/api/signin-list?view=graph-rest-beta)
- [Graph paging](https://learn.microsoft.com/en-us/graph/paging)
- [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling)
- [Conditional Access overview and licensing](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview)

## Acceptance still required

Run P1-only, P2-only, P1 + Intune, P2 + Defender, and Workload Premium lanes. In each lane distinguish missing licence, consent, operator role, unpopulated source, unsupported endpoint, transient error and a genuinely empty completed result. Verify actual writes only in a dedicated test tenant. Do not promote the contract as verified merely because the offline fixtures pass.

## Verified policy inventory constraint — 2026-09-15

Beta 25370 read-only acceptance repeated the 98 v1.0 / 105 beta inventory. Individual v1.0 GETs for every one of the seven additional policies returned HTTP 400, BadRequest, service message 1037: preview features require the beta endpoint. All seven beta detail reads succeeded; none was soft-deleted. This explains the difference without assuming lost policies. Keep the existing beta policy inventory for complete coverage. Aggregate evidence: `../2026-09-15/policy-inventory-25370.json`. This is an API compatibility finding, not P1-only certification.
