# CA018 – Intune enrollment only from the office (all three ENCA baselines) – workfile

Date: 30 October 2026
Requested by: Mihai (decisions below, 30 October 2026)
For: ENCA – the CloudFellows baseline (`js/baselineData.js`), SMB Basic (`js/baselineSmbData.js`) and Joey Verlinden+ (`js/baselineJoeyData.js` + the Dovilo additions)
Status: **open** – nothing is built in ENCA yet. The CloudFellows Intune Deployer 2.8.0 already checks for this policy (read-only, see *Contract with the deployer*).

## Why

Autopilot v2 (Windows Autopilot device preparation) will also be used for **personal laptops** (not pre-registered, no corporate identifier). Those laptops may only be **onboarded in the office**. The deployer allows personal Windows enrollment for the Autopilot v2 user groups only while a Conditional Access policy blocks Intune enrollment outside the office. That policy belongs in the Conditional Access baselines, so ENCA creates and maintains it.

Mihai's decisions (30 October 2026):

1. Applies to **every tenant** (default in all three baselines).
2. **The office = the existing trusted named locations** of the tenant (no new location type).
3. **Block Intune enrollment** outside the office (not MFA).
4. **ENCA creates the policy**; the deployer only checks it.

Facts from Microsoft Learn (checked 30 October 2026):

- The user action *Register or join devices* only allows *Require MFA* or *Require authentication strength*. It can't block. → Target the app **Microsoft Intune Enrollment** instead.
- **Microsoft Intune Enrollment** = app ID `d4ebce55-015a-49b5-a083-c84d1797ae8c`. The service principal is **not created automatically** in new tenants (create it with `POST /servicePrincipals { appId }`).
- The *compliant network* (Global Secure Access) can't be the office signal: a laptop being onboarded is not MDM-enrolled yet and has no GSA client.
- Without corporate identifiers, enrollment restrictions treat an Autopilot v2 device as personal. That is why the deployer adds its own restriction (personal allowed) on the Autopilot v2 user groups.

## Number: CA018 in all three baselines

Checked in `js/baselineData.js`, `js/baselineJoeyData.js`, `js/baselineSmbData.js` and `js/eadminsData.js` (ENCA at 33106):

| Baseline | Global block in use | Lowest free global number | Free in all three |
|---|---|---|---|
| CloudFellows | CA000–CA017, CA099 | CA018 | ✔ |
| SMB Basic (BASE CA001–CA099) | CA001–CA010 | CA011 | CA011 is taken in CloudFellows (CA011 Exchange Online session) |
| Joey Verlinden (Global CA000–CA099) | CA000–CA006, CA099 | CA007 | CA007 is taken in CloudFellows and SMB |

**CA018** is the lowest number that is free in the global range of all three. One number everywhere keeps the deployer messages, the customer documents and Housekeeping/Compare/Duplicates (which match on `/CA(\d{3,4})/`) the same in every tenant.

Rejected alternatives: one policy per persona (CloudFellows CA219 Internals + CA311 Externals, mirroring CA203/CA306). That means two policies and two exclusion groups, and the deployer's "covers all Autopilot v2 user groups" check would depend on persona membership. A Global policy with *All users* is simpler and matches decision 1.

## The policy

| Item | Value |
|---|---|
| Users – include | All users |
| Users – exclude | break-glass group; the CA018 exclusion group; *Guests and external users* (all types, they never enroll); directory sync accounts / Microsoft 365 service accounts as the baseline already excludes them in its Global policies; `CAB-SEC-U-TeamsSharedDevices` (only if the baseline excludes it in its other Global policies) |
| Target resources | Include: **Microsoft Intune Enrollment** (`d4ebce55-015a-49b5-a083-c84d1797ae8c`). Nothing else. |
| Network | Include: Any network or location. Exclude: **All trusted networks and locations** (`AllTrusted`). |
| Device platforms | Include: **Windows** (decision 3 was "block Intune enrollment for all Windows enrollments"; macOS ADE, iOS and Android enrollment stay possible outside the office) |
| Client apps / device filter | not set (any) |
| Grant | **Block access** |
| Session | none |
| State at import | **Report-only** (and stays report-only when the tenant has no trusted IP location – see pre-flight) |

Names, following each baseline's own pattern:

| Baseline | Display name | Exclusion group | Restricted unit |
|---|---|---|---|
| CloudFellows | `CA018-BLOCK-Global-ASR-MicrosoftIntuneEnrollment-Windows-NonTrustedLocations-v1.0` | `CAB-SEC-U-CA018-Exclusion` | the Global unit, as CA000–CA017 |
| SMB Basic | `CA018-BLOCK-SMB-Global-IntuneEnrollment-Windows-OutsideTrustedLocations-v1.0` (via `add(18, "BLOCK", "Global", "IntuneEnrollment-Windows-OutsideTrustedLocations", …)`) | `CAB-SEC-U-SMB-CA018-Exclusion` | `CA-RMAU-SMB-BASE` (extend the unit note CA001–CA010 → CA001–CA010, CA018) |
| Joey Verlinden+ | `CA018-Global-AttackSurfaceReduction-MicrosoftIntuneEnrollment-Windows-BLOCK-NonTrustedLocations` | `CAB-SEC-U-CA018-Exclusion` | `CA-RMAU-Global-Exclusions` |

Joey Verlinden+: CA018 is not part of Joey's own release. Add it as a **Dovilo addition** next to the emergency-access policies (CA1100–CA1105, the `sharedEAdmins` pattern in `eadminsData.js`), so a new Joey import does not remove it. If Joey ever publishes his own CA018, the name marker decides (as for CA001 in SMB) – report the collision, don't overwrite.

Description (EN, all three): *"Blocks Windows Intune enrollment outside the trusted locations (the office). Autopilot v2 (also for personal laptops), Company Portal and 'Add work account' on Windows then only work in the office; macOS, iOS and Android are not affected. Already enrolled devices keep working – check-ins use the app Microsoft Intune, not Microsoft Intune Enrollment. The CloudFellows Intune Deployer allows personal Windows enrollment for the Autopilot v2 users only while this policy is On."*

## Tasks

| Done | ID | Priority | Task |
|---|---|---|---|
| [ ] | W01 | P1 | **CloudFellows**: CA018 in `baselineData.js` (catalog row as CA1005: resources *Microsoft Intune Enrollment*, network *Any network or location · − All trusted networks and locations*, condition *Platforms: Windows*, grant *Block access*, tag NEW) and in the release the import reads. Catalog/version bump + changelog. |
| [ ] | W02 | P1 | **SMB Basic**: `add(18, …)` with `everyone(18)` minus external users (as `internal(num)`), `applications: { includeApplications: [INTUNE_ENROLL] }`, `locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] }`, `platforms: { includePlatforms: ["windows"] }` (as `cnPlatform`), `grantControls: block`, `landsOff`-style report-only state. Catalog 1.0.8 → 1.0.9, BASE unit note, exclusion group. |
| [ ] | W03 | P1 | **Joey Verlinden+**: CA018 as a Dovilo addition (shared module as `eadminsData.js`, or the `+` additions list); import adds it after Joey's policies; Compare/Housekeeping treat it as baseline, not as "extra". |
| [ ] | W04 | P1 | **Service principal**: pre-flight looks up `servicePrincipals?$filter=appId eq 'd4ebce55-015a-49b5-a083-c84d1797ae8c'`; missing → the import creates it (`POST /servicePrincipals`) and the policy waits for it (the Import 2.16.6 wait for a just-created service principal). Read-only mode: name it as missing. |
| [ ] | W05 | P1 | **Trusted locations pre-flight**: list the trusted IP named locations (`ipNamedLocation`, `isTrusted`) with their ranges. **None** → CA018 is created **Off/report-only with a red line**: *"no trusted location – CA018 On would block Intune enrollment everywhere"*. SMB Basic has no trusted IP location of its own (only *SMB - Allowed countries* / *Allowed EU countries*) → offer to create **`SMB - Office`** (IP ranges, trusted) from the tenant's office IPs, empty by default, and keep CA018 report-only until it has a range. |
| [ ] | W06 | P2 | **Trusted-location hygiene**: show a warning on CA018 when a trusted location looks like a home or migration address (the App Access Review already flags these: *"Thuisadressen niet als vertrouwde locatie gebruiken"*). Every trusted IP counts as the office for onboarding. |
| [ ] | W07 | P2 | **Switch On**: the ⇄ switch as for the other report-only policies, after one week. The impact text is the report-only result of app *Microsoft Intune Enrollment* (sign-ins that would have been blocked, per user / IP). |
| [ ] | W08 | P2 | **Overlap checks**: (a) CA203 / CA306 (CloudFellows) and SMB CA007 keep MFA on enrollment / join – no change; (b) the compliant-network policies (CloudFellows CA215–CA218, SMB CA103 and CA201–CA204) already exclude *Microsoft Intune Enrollment* – keep it that way, otherwise onboarding is blocked in the office too; (c) country policies (CloudFellows CA001, SMB CA010) are unaffected. |
| [ ] | W09 | P2 | **Tests**: catalog (CA018 present in all three, names, exclusion group, unit), SMB build (`raw` body: app id, AllTrusted, platform Windows, block, state), Joey import keeps the addition, pre-flight (missing SP, no trusted location → Off), Compare/Duplicates match CA018. |
| [ ] | W10 | P3 | **Docs/guide**: Guide and RFC texts (`Conditional Access-release`) mention CA018; the deployer documents refer to it as "CA018". |

## Contract with the deployer (already built, CloudFellows Intune Deployer 2.8.0)

`Common/CF.IntuneRollout.psm1` 0.6.0 `Test-CFDppOfficeOnly` counts a policy as the office-only policy when **all** of these hold. Keep CA018 inside them:

- `conditions.applications.includeApplications` contains `d4ebce55-015a-49b5-a083-c84d1797ae8c` (or `All`) and `excludeApplications` doesn't.
- `grantControls.builtInControls` contains `block`.
- `conditions.locations.includeLocations` contains `All`; `excludeLocations` is not empty and holds only `AllTrusted` and/or IDs of **trusted** named locations (an untrusted location such as a country list makes it not count).
- `conditions.platforms` is not set, or its `includePlatforms` contains `all` or `windows` and `excludePlatforms` does not contain `windows`.
- `conditions.users.includeUsers` contains `All` (or `includeGroups` holds every Autopilot v2 user group), and no Autopilot v2 user group is in `excludeGroups`.
- `state`: `enabled` = On (only then the deployer allows personal laptops); `enabledForReportingButNotEnforced` = ReportOnly; `disabled` = Off. Anything but On keeps personal laptops blocked.

The deployer also reports a missing service principal, a tenant without a trusted named location, and a default enrollment restriction that already allows personal Windows for everyone.

## Impact and recovery

- **Impact when On**: every Windows Intune enrollment outside the trusted locations is blocked for all users in scope. That covers Autopilot v2 (personal and corporate), Company Portal, *Add work account* and an Autopilot v1 reset that enrolls again. Already enrolled devices keep working. Microsoft documents that the *Microsoft Intune Enrollment* resource is used for Apple ADE / Company Portal enrollment. For Windows OOBE (Autopilot v2) the policy must be **proven in report-only** before it goes On.
- **To test before On**: (1) Autopilot v2 in the office and at home (expect: blocked at home), (2) Windows 365 Cloud PC provisioning (enrollment by the service), (3) Autopilot v1 reset outside the office, (4) macOS ADE and iOS/Android enrollment outside the office (expect: not affected – platform condition), (5) a GSA user in the office (source IP restoration must be on so the real office IP is seen).
- **Recovery**: CA018 to report-only or Off → enrollment works from anywhere again. At its next run the deployer unassigns its personal-device restriction (personal laptops blocked again). Nothing is deleted.
