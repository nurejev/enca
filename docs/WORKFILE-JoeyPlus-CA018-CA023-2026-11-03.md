# Joey Verlinden+ additions CA018–CA023 – workfile

Date: 3 November 2026
Requested by: Mihai ("update enca direct — net zoals de e-admins toegevoegd als Joey+")
Status: **built in beta 33109**; not yet tested against a tenant.

## What

The Joey Verlinden+ release documentation (R26.11, v1.2 of 30 October) lists five planned additions: CA019 (app protection on phones) and CA020–CA023 (users and admins only through Global Secure Access, per platform). CA018 (Windows Intune enrollment only from the office) comes from WORKFILE-CA018 (W03). None of the six were in ENCA. Courseware's admin-account advice relies on CA020–CA023.

## How (the E-Admins pattern)

| Part | Change |
|---|---|
| `js/joeyPlusData.js` (new) | `JOEY_PLUS`: raw bundle of the six (placeholder group ids), catalog rows, `isPlus`, `forceOff` (CA020–CA023), `externalAdminsGroup` |
| `js/baseline.js` | `sharedPolicies(cat)` appends the six under the Joey catalog (bundled and live), `shared: "Joey+"`; summary/report texts name the shared families (`sharedText`) |
| `js/baselineJoeyData.js` | `codeForGroup` and `templates` know the six exclusion groups and `CAB-SEC-U-ExternalAdmins` (persona GLO → CA-RMAU-Global-Exclusions) |
| `js/import.js` | `mergeShared(target, source, { match, forceOff })` – defaults unchanged (E-Admins, all Off) |
| `js/app.js` | `imEaAddBundled` merges Joey+ beside the E-Admins under the Joey catalog; ➕ JOEY+ panel |
| `index.html`, version, changelog, promote | build 33109, Baseline 2.16.0, Import 2.16.9, promote item 372 |
| `tools/joeyplus.test.cjs` (new) | 6 tests: bundle, definitions, sharedPolicies, contract, mergeShared, import |

## The six

| Policy | Lands | Exclusions besides its own `- Exclude` group and `CA-BreakGlassAccounts - Exclude` |
|---|---|---|
| CA018-Global-AttackSurfaceReduction-MicrosoftIntuneEnrollment-Windows-BLOCK-NonTrustedLocations | as the run (Report-only) | guests/externals (all types), sync roles |
| CA019-Global-DataProtection-AllApps-iOSenAndroid-GRANT-RequireAppProtection | as the run (Report-only) | guests/externals, sync roles; apps: Defender XPlat, Defender TVM, Azure Credential Configuration Endpoint Service |
| CA020–CA023 …-{Windows,macOS,iOS,Android}-BLOCK-OutsideCompliantNetwork | **Off** (forceOff) | guests/externals incl. GDAP, sync roles, `CAB-SEC-U-ExternalAdmins`, `CA-ServiceAccounts`; apps: Intune, Intune Enrollment, Device Registration Service (+ Defender apps and Credential Configuration on iOS/Android) |

Deviation from WORKFILE-CA018: the Joey+ CA018 exclusion group follows Joey's convention (`<policy name> - Exclude`), not `CAB-SEC-U-CA018-Exclusion`, like CA019–CA023 in the release documentation.

Groups (e12, decision Mihai 7 Nov, ENCA 33202): ENCA changes as little as possible in Joey's baseline, and its own additions follow Joey. His exclusion groups (`<policy name> - Exclude`), `CA-BreakGlassAccounts - Exclude` and `CA-ServiceAccounts` stay exactly as he ships them, for his 36 policies and for CA018–CA023 alike. The only group replaced is his EXAMPLE internals include group: `APP_Microsoft365_E5` → `CAB-SEC-U-Persona-Internals` (dynamic, the CloudFellows "Entra ID P1 enabled" rule), included by CA200–CA210. A tenant imported before 33202 gets the rename from 👥 CA groups ⑦ Migrate (preview first, same object id and members; assigned → dynamic is a separate manual step). `CAB-SEC-U-ExternalAdmins` stays as is.

## Open

| Done | ID | Task |
|---|---|---|
| [ ] | J01 | Test on a tenant (promote item 372 checklist), then Courseware |
| [ ] | J02 | Pre-flight: CA018 without a trusted IP location → keep Report-only/Off with a warning (WORKFILE-CA018 pre-flight) |
| [ ] | J03 | Release documentation Joey+ (klanten/docs/ConditionalAccess/_bron/JOEY): "gepland" → "in ENCA 33109", CA018 added |
| [ ] | J04 | CloudFellows and SMB Basic CA018 (WORKFILE-CA018 W01/W02) |
