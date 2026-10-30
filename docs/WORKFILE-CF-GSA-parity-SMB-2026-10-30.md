# CloudFellows CA baseline – Global Secure Access policies on par with SMB Basic – workfile

Date: 30 October 2026
Requested by: Mihai (30 October 2026)
For: ENCA – the CloudFellows baseline (`js/baselineData.js`, generated from the CloudFellows.dev reference tenant), the import (`js/import.js`), and the documentation in the repo and in Klantdocumentatie
Status: **open** – nothing changed yet. One decision is open (D1, DevOps).

## Why

SMB Basic got three rounds of fixes on its Global Secure Access (compliant network) policies (catalog 1.0.8 → 1.0.10, ENCA build 33107/33108). The CloudFellows baseline has the same kind of policies (**CA215–CA218**, compliant network required) but none of those fixes. A comparison against the live reference tenant (CloudFellows.dev, read-only, 30 October 2026 – CA215–CA218 are *Report-only* there) shows these gaps:

| # | Gap in CloudFellows | SMB Basic today | Risk |
|---|---|---|---|
| G1 | CA215–CA218 do **not exclude `CAB-SEC-U-TeamsSharedDevices`**. Teams Rooms Pro / Teams Shared Devices licences include Entra ID P1, so room accounts land in the dynamic *Internals* group and get blocked (no GSA client on a room). Same gap on CA200 and other *Internals* policies. | Shared/room accounts excluded (`EXCLUDE.shared`) | **High** – Teams Rooms stop signing in when CA215–CA218 go On |
| G2 | CA215–CA218 do **not exclude Device Registration Service** (`01cb2876-7ebd-4aa4-9cc9-d28bd4d359a9`). | Excluded on CA201–CA204 (`EXCLUDE.drs`, 1.0.8) | **High** macOS (Platform SSO registration fails), **medium** Windows |
| G3 | **CA001 CountryWhitelist** has no exception for *All Compliant Network locations*. A user abroad on GSA is blocked although the traffic is managed. | CA010 and CA103 exclude the compliant network | **Medium** |
| G4 | CA215 uses no own exclusion group (`CAB-SEC-U-CA215-Exclusion` missing); CA216–CA218 have one. | Every policy has its own exclusion group | Low |
| G5 | CA215–CA218 exclude **6 more apps** than SMB, including Windows Azure Active Directory (`00000002-0000-0000-c000-000000000000`) – this opens a gap larger than needed. | Minimal app set (Intune, Intune Enrollment, Defender XPlat, TVM, Azure Credential Configuration Endpoint Service, DRS) | Low/medium |
| G6 | Stale disabled twin in CloudFellows.dev: `(NEW)CA215-BLOCK-Internals-CN-AllApps-WindowsOrMACOS-…-v3.0.3`. A catalog update could pick it up. | – | Low (housekeeping) |
| G7 | The CloudFellows import does **not force CN policies Off** and has no retry without the compliant network. A tenant without GSA gets CA215–CA218 in the state of the catalog. | `bundle.forceOff` + `bundle.cnOptional` (CA010, CA103) | **Medium** |

Facts from Microsoft Learn (checked 29–30 October 2026):

- The compliant network condition = named location *All Compliant Network locations* (`3d46dbda-8382-466a-856d-eb00cbc6b910`); it needs GSA with the Microsoft traffic profile and signalling on.
- Teams Rooms Pro and Teams Shared Devices licences include Entra ID P1 (`AAD_PREMIUM`, `41781fb2-bc02-4b7c-bd55-b576c07bb09d`).
- Device registration (macOS Platform SSO / Windows join) runs before the GSA client can make the network compliant – the DRS exclusion is needed (also seen in the gimi finding of 25 October 2026).

## Decisions

| ID | Decision | Status |
|---|---|---|
| D1 | **DevOps accounts in or out of CA215–CA218?** Today they are not covered. In: same protection as Internals, but every DevOps device needs GSA. Out: keep as is, write it down as a known gap in the release doc. | **open – Mihai** |
| D2 | Fix in the **reference tenant first** (CloudFellows.dev), then *🧱 Update the catalog* in ENCA. `baselineData.js` is never edited by hand. | taken (ENCA rule) |
| D3 | Customer tenants are **not** changed by this workpackage. Rollout = next ENCA import/compare per customer. | proposal |

## Tenant impact (read-only check, 30 October 2026)

| Tenant | CA215–CA218 | CA001 country policy | Effect of this workpackage |
|---|---|---|---|
| CloudFellows.dev (reference) | yes, Report-only | yes | all changes are made here (W01–W07) |
| CloudFellows (cf) | no policies returned | – | none |
| KS | no | older CloudFellows v1.0 set, CA001 **enabled** | G3 only when KS moves to R26.11; Compare will show it |
| Dovilo (DVL) | no | older v1.0 set, CA001 + CA001A (France) **enabled** | as KS; Dovilo docs never mention CloudFellows |
| MCA / CWE / MarketDiscovery | no | Joey set: CA001 report-only / disabled / enabled | none (Joey Verlinden+ baseline – see W14) |
| DenB, MVRDV | no | own policies / minimal | none |

No customer has CA215–CA218 yet, so the risk is in the **next import**, not in production today.

## Tasks

| Done | ID | Priority | Task |
|---|---|---|---|
| [ ] | W01 | P1 | **Backup first**: export all CA policies + named locations of CloudFellows.dev (ENCA export) and save it under `klanten/…/ENCA/` with date. |
| [ ] | W02 | P1 | **G1** – CloudFellows.dev: add `CAB-SEC-U-TeamsSharedDevices` to the excluded groups of CA215–CA218 (new policy version, name suffix bumped). Check CA200 and the other *Internals* policies for the same gap and fix them in the same round. |
| [ ] | W03 | P1 | **G2** – CloudFellows.dev: exclude Device Registration Service (`01cb2876-…`) on CA215–CA218. |
| [ ] | W04 | P2 | **G3** – CloudFellows.dev: CA001 CountryWhitelist – exclude location *All Compliant Network locations* (new version). Same check for any CA001 variant (CA001A). |
| [ ] | W05 | P2 | **G4** – create `CAB-SEC-U-CA215-Exclusion` (assigned, empty) and exclude it on CA215; add it to the ENCA group templates so the import creates it. |
| [ ] | W06 | P2 | **G5** – trim the app exclusions of CA215–CA218 to the SMB set; at least remove Windows Azure Active Directory. Test sign-in on a Windows and a macOS test device in Report-only first (sign-in logs → *Report-only: failure*). |
| [ ] | W07 | P3 | **G6** – delete the disabled `(NEW)CA215-…-v3.0.3` twin in CloudFellows.dev (after W01). |
| [ ] | W08 | P1 | **D1** – Mihai decides DevOps in/out; if in: add DevOps to CA215–CA218 in CloudFellows.dev, otherwise write it as a known point (W16). |
| [ ] | W09 | P1 | **ENCA catalog**: *🧱 Update the catalog* from CloudFellows.dev → new catalog revision in `js/baselineData.js`; check the diff only touches CA001, CA200(+), CA215–CA218 and the group templates. |
| [ ] | W10 | P1 | **G7 – ENCA import**: give the CloudFellows bundle the same handling as SMB – `forceOff` for CA215–CA218, `cnOptional` for CA001 (retry without the compliant-network exclusion when GSA is not set up), pre-flight line when *All Compliant Network locations* is missing. |
| [ ] | W11 | P1 | **ENCA tests** (`node --test tools/*.test.cjs`): CloudFellows tests for (a) TeamsSharedDevices + DRS excluded on CA215–CA218, (b) CA001 excludes the CN location, (c) CN policies land Off, (d) cnOptional retry; all existing tests green. |
| [ ] | W12 | P1 | **ENCA bookkeeping**: `js/version.js` (build + tool versions), `js/changelog.js`, `js/promote.js` queue item, `index.html ?v=<build>`, catalog release in the release picker. |
| [ ] | W13 | P2 | **CA018 workfile**: W02 still says SMB catalog *1.0.8 → 1.0.9* (now 1.0.10) and W08 calls SMB CA103 a compliant-network policy – since 1.0.10 CA103 = *admins outside allowed countries unless compliant network*. Update both lines; check that the new CA103 keeps *Microsoft Intune Enrollment* reachable. |
| [ ] | W14 | P3 | **Joey Verlinden+**: check `js/baselineJoeyData.js` for the same patterns (CA001 without CN exception, rooms not excluded). Report only – Joey's set is not ours to change; additions go via the Dovilo/`+` list. |
| [ ] | W15 | P1 | **Repo doc – CloudFellows release**: `klanten/Docs/ConditionalAccess/_bron/CF/` → new version of *New Release Conditional Access-baseline CloudFellows* (CA215–CA218 exclusions, CA001 change, CA215 exclusion group, known points), rebuild PDF + DOCX, remove the old version (only newest kept). Update `_bron/README.md` and `_bron/enca-catalogus/` (new export + `BRON.txt`). |
| [ ] | W16 | P2 | **Repo doc – known points**: DevOps decision (D1), GSA required before CA215–CA218 go On, Teams Rooms excluded and why. |
| [ ] | W17 | P2 | **Repo doc – end-user guides** (iOS / Android): today generic for SMB (CA009, CA203/CA204). Add a CloudFellows variant or an IT appendix naming the CloudFellows policies (CA212, CA217, CA218); note that CloudFellows CA212 covers Office 365 only. |
| [ ] | W18 | P3 | **Repo – other references**: `klanten/DVL/Identity/CA/ENCA/ConditionalAccess-Dovilo-BV-2026-08-21.md` (CA001/CA001A – Dovilo wording, no CloudFellows), PVM PIMBuddy files and `PVM/Intune/Exports/PSSO-READINESS-20261027-212107/READINESS.md` (DRS exclusion) – check and update where they describe CA215 or CountryWhitelist. |
| [ ] | W19 | P2 | **Klantdocumentatie (OneDrive *Klanten_LiMo/Klantdocumentatie*)** – not reachable from the repo; per customer folder check *Conditional Access*, *Security Briefing*, RFC and Windows/macOS baseline documents for CA001, CA215–CA218, GSA/compliant network: **KS** (CloudFellows customer, CA001 enabled – add the compliant-network exception to the next RFC), **DVL** (Dovilo wording only), **MCA / CWE / MarketDiscovery** (Joey CA001 – note only), **CloudFellows** internal. Only the newest version of each document stays. |
| [ ] | W20 | P2 | **Rollout per customer** (after W09–W12 promoted): ENCA Compare per tenant → RFC with the CA001 change and, where GSA is live, CA215–CA218 Report-only → On after a week of clean sign-in logs. Explain impact and recovery (disable policy / add to exclusion group) in each RFC. |
| [ ] | W21 | P3 | **Commit** ENCA + repo docs (only when Mihai asks); ENCA commit 99bff30 (SMB 1.0.10) is still unpushed. |

## Done when

- CloudFellows.dev has CA215–CA218 and CA001 matching the SMB patterns (G1–G6 closed), backup saved.
- ENCA catalog, import and tests cover G1–G7, build promoted.
- CloudFellows release doc, guides and Klantdocumentatie show the new state; old versions removed.
