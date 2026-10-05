<#
.SYNOPSIS
  Plan, then apply, the tenant-side fixes from the 30 Sep 2026 framework
  review (claude/ENCA-pim-framework-review-2026-09-30.md) on the baseline
  tenant cloudfellows.dev — and check the things a script must not change.

.DESCRIPTION
  Three fixes and four checks. Same shape as New-PimRegions.ps1: without
  -Apply it only READS and writes a plan file; with -Apply -PlanFile it
  builds the plan again, stops if the tenant changed, asks for the tenant
  domain, backs up every value about to change, applies in order, logs
  every outcome, and plans once more to show what is still open.

    FIX 1  Intune central assignments see every region.
           An auto-assigned scope tag OVERWRITES a device's tags, and the
           Default tag is only on untagged objects — so a device tagged
           INT-TAG-<REG> is invisible to a central assignment that carries
           only Default. Every central assignment (-CentralAssignments; the
           multi and large profile names by default) gets EVERY scope tag
           the tenant has, Default included. Regional assignments are
           never touched.
    FIX 2  Regional user units exclude admin accounts.
           AU-<REG>-Users and INT-SG-USR-<REG>-All get
             -and (user.userType -eq "Member")
             -and (user.userPrincipalName -notStartsWith "<AdminPrefix>")
           appended to the template rule. A rule that already carries the
           exclusion is left alone. Break-glass accounts are named by object
           id, never by prefix, so they are listed in the plan as a finding
           if the rule would still match them.
    FIX 3  Autopilot naming is only CHECKED here (the profile is manual in
           the framework): a row whose devicePrefix plus a 12-character
           serial would exceed 15 characters is a finding.

    CHECK  PIM-SG-Approvers and PIM-SG-Approvers-Tier0 have ≥ 2 members
           (without them Deploy leaves Tier 0 approval OFF, by design).
    CHECK  pim-alerts@<default domain> exists.
    CHECK  authentication context c1 exists (Policy.Read.ConditionalAccess;
           skipped with a warning when the connection lacks it).
    CHECK  no adm- account is a member of any AU-<REG>-Users today.

  IMPACT, before -Apply:
    * FIX 1: central Intune operators see every device and policy in the
      tenant after their next activation — which is what they had before
      the first region was tagged. Nobody gains rights on a region's
      Entra objects; scope tags only decide visibility of Intune objects.
    * FIX 2: an admin account that carried the region attribute leaves the
      region's unit and the Intune user scope group. A regional Helpdesk
      loses nothing it could use (Entra already refuses AU-scoped
      password and authentication resets on role holders); a regional
      User Administrator loses the ability to edit, disable or delete that
      admin account. A dynamic rule is re-evaluated by Entra within minutes;
      membership of other users is unchanged because the region clause is
      kept verbatim.
  RECOVERY: the backup file holds every rule and tag list as it was;
    put a rule back with -RestoreFrom <backup> (rules and tags only), or
    in the portal. Nothing is created or deleted by this script.

.PARAMETER RegionsFile
  The regions JSON ENCA writes (regions.cloudfellows.dev.json by default) or
  a regions.csv. Only the code, attribute and value columns are used.
.PARAMETER AdminPrefix
  UPN prefix of admin accounts to keep out of regional units (adm-).
.PARAMETER CentralAssignments
  Intune role assignment names that must carry every tag. Default: the
  multi and large profile names.
.PARAMETER Customer / ConnectScript / TenantId / Interactive
  As in New-PimRegions.ps1: connect through Connect-Customer.ps1 -Customer
  <KEY>, or -Interactive for a delegated sign-in; the tenant is checked
  against Customers.json, -TenantId and the plan file, and they must agree.
.PARAMETER OutDir
  Where plan, backup and outcome files land (default: the current folder).
.PARAMETER Apply / PlanFile / Yes
  Apply exactly the plan file a previous run wrote; -Yes skips the typed
  domain (for the test harness only).
.PARAMETER RestoreFrom
  A backup file from an earlier -Apply: writes every 'before' back.

.EXAMPLE
  .\Repair-PimBaseline.ps1 -Customer DEVCF
  .\Repair-PimBaseline.ps1 -Customer DEVCF -Apply -PlanFile .\pim-plan.repair.cloudfellows.dev.20260930-101500.json
#>
[CmdletBinding()]
param(
  [string]$RegionsFile = (Join-Path $PSScriptRoot 'regions.cloudfellows.dev.json'),
  [string]$AdminPrefix = 'adm-',
  [string[]]$CentralAssignments = @('INT-RBAC-PolicyProfile-Central', 'INT-RBAC-HelpDesk-Central', 'INT-RBAC-SecOps-Central', 'INT-RBAC-Workplace', 'INT-RBAC-HelpDesk', 'INT-RBAC-SecOps', 'INT-RBAC-Ops-All', 'INT-RBAC-HelpDesk-All', 'INT-RBAC-SecOps-All'),
  [string[]]$ApproverGroups = @('PIM-SG-Approvers', 'PIM-SG-Approvers-Tier0'),
  [string]$AlertMailbox = 'pim-alerts',
  [string]$AuthContextId = 'c1',
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string]$OutDir = '.',
  [switch]$Apply,
  [string]$PlanFile,
  [string]$RestoreFrom,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$BetaUrl = 'https://graph.microsoft.com/beta'
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }
$KIND = 'repair'
$SERIAL_LEN = 12          # a long but common serial; Windows computer names cap at 15
$NAME_MAX = 15

if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
if ($AdminPrefix -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$') { throw "-AdminPrefix '$AdminPrefix' is not a plain UPN prefix. Nothing was read or written." }

function Get-Key($h, [string]$k) { if ($h -is [System.Collections.IDictionary] -and $h.Contains($k)) { return $h[$k] }; return $null }
function Get-RuleKey([string]$r) { if (-not $r) { return '' }; return (($r -replace '\s+', ' ').Trim().ToLower()) }

# ---- connect ------------------------------------------------------------------------
$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile $KIND } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All', 'AdministrativeUnit.ReadWrite.All', 'Group.ReadWrite.All', 'DeviceManagementRBAC.ReadWrite.All', 'Policy.Read.ConditionalAccess')
Assert-PimPermissions @('Directory.Read.All', 'AdministrativeUnit.Read.All', 'Group.Read.All', 'DeviceManagementRBAC.Read.All') 'planning'

# ---- restore: every 'before' from a backup, and nothing else -------------------------
if ($RestoreFrom) {
  $bk = Read-PimJsonFile $RestoreFrom
  if ("$($bk['tenantId'])" -ne "$($ctx.TenantId)") { throw "The backup is for tenant $($bk['tenantId']); connected to $($ctx.TenantId). Nothing was written." }
  $plan = New-PimPlan $KIND $RestoreFrom
  foreach ($it in @($bk['items'])) {
    Add-PimOp $plan "restore:$($it['key'])" 'http' "restore $($it['key']) to its value before the run" ([ordered]@{ method = 'PATCH'; uri = $it['uri']; body = $it['before'] })
  }
  Show-PimPlan $plan
  Assert-PimPermissions @('AdministrativeUnit.ReadWrite.All', 'Group.ReadWrite.All', 'DeviceManagementRBAC.ReadWrite.All') 'the restore'
  Confirm-PimApply $plan -Yes:$Yes
  $plan.hash = Get-PimPlanHash $plan
  $null = Invoke-PimPlan $plan $OutDir $null
  return
}

# ---- the regions file: code, attribute, value, devicePrefix -------------------------
function Read-Regions([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Regions file not found: $path. Nothing was read or written." }
  $rows = New-Object System.Collections.Generic.List[object]
  if ($path -match '\.json$') {
    $doc = Read-PimJsonFile $path
    foreach ($r in @($doc['regions'])) { $rows.Add($r) }
  } else {
    foreach ($r in @(Import-Csv -LiteralPath $path -Encoding UTF8)) { $h = [ordered]@{}; foreach ($p in $r.PSObject.Properties) { $h[$p.Name] = $p.Value }; $rows.Add($h) }
  }
  $out = New-Object System.Collections.Generic.List[object]
  foreach ($r in $rows) {
    $code = "$(Get-Key $r 'code')".Trim()
    if (-not $code) { continue }
    $attr = "$(Get-Key $r 'attribute')".Trim(); if (-not $attr) { $attr = 'extensionAttribute1' }
    $val = "$(Get-Key $r 'value')".Trim(); if (-not $val) { $val = $code }
    $pref = "$(Get-Key $r 'devicePrefix')".Trim(); if (-not $pref) { $pref = ($code -split '-')[-1] + '-' }
    if ($attr -notmatch '^extensionAttribute([1-9]|1[0-5])$') { throw "Region ${code}: attribute '$attr' is not extensionAttribute1-15. Nothing was written." }
    if ($val -notmatch '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$') { throw "Region ${code}: value '$val' would not be safe inside a membership rule. Nothing was written." }
    $out.Add([ordered]@{ code = $code; attribute = $attr; value = $val; devicePrefix = $pref })
  }
  if (-not $out.Count) { throw "No region rows in $path. Nothing was read or written." }
  return $out.ToArray()
}
$regions = Read-Regions $RegionsFile
Write-PimOk ("regions: {0}" -f (($regions | ForEach-Object { $_.code }) -join ', '))

# ---- reads ---------------------------------------------------------------------------
Write-PimStep 'Reading units, groups, Intune roles and tags'
$units = @(Invoke-PimGet "$GraphUrl/directory/administrativeUnits?`$select=id,displayName,membershipType,membershipRule,membershipRuleProcessingState&`$top=999" -All)
$groups = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'PIM-SG-') or startswith(displayName,'INT-SG-')&`$select=id,displayName,membershipRule,membershipRuleProcessingState,groupTypes&`$top=999" -All)
$tags = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleScopeTags" -All)
$assignments = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleAssignments" -All)
$unitByName = @{}; foreach ($u in $units) { $unitByName["$($u['displayName'])"] = $u }
$groupByName = @{}; foreach ($g in $groups) { $groupByName["$($g['displayName'])"] = $g }
$allTagIds = @($tags | ForEach-Object { "$($_['id'])" } | Sort-Object -Unique)
Write-PimOk ("{0} unit(s), {1} PIM-SG/INT-SG group(s), {2} scope tag(s), {3} Intune assignment(s)" -f $units.Count, $groups.Count, $tags.Count, $assignments.Count)

$plan = New-PimPlan $KIND $RegionsFile
$needs = New-Object System.Collections.Generic.List[string]

# ---- FIX 2: admin exclusion on the regional user rules ------------------------------
$exclude = "(user.userType -eq `"Member`") -and (user.userPrincipalName -notStartsWith `"$AdminPrefix`")"
foreach ($R in $regions) {
  $code = $R.code
  $base = "(user.$($R.attribute) -eq `"$($R.value)`")"
  $auName = "AU-$code-Users"
  $auRule = "$base -and $exclude"
  $u = $unitByName[$auName]
  if (-not $u) { $plan.findings.Add("$auName does not exist — run New-PimRegions.ps1 (or T51 Deploy) first; this script changes rules, it does not create units") }
  elseif ("$($u['membershipType'])" -ne 'Dynamic') { $plan.findings.Add("$auName is not a dynamic unit — not changed; make it dynamic in the portal or through Deploy first") }
  elseif ((Get-RuleKey $u['membershipRule']) -eq (Get-RuleKey $auRule)) { Write-PimOk "$auName already excludes $AdminPrefix accounts" }
  elseif ((Get-RuleKey $u['membershipRule']) -match [regex]::Escape((Get-RuleKey "-notStartsWith `"$AdminPrefix`""))) { $plan.findings.Add("$auName carries an admin exclusion in a different shape ($($u['membershipRule'])) — not changed; align it by hand if you want the template's exact rule") }
  else {
    $needs.Add('AdministrativeUnit.ReadWrite.All')
    Add-PimOp $plan "aufix:$auName" 'http' "$auName → rule $auRule (was: $($u['membershipRule']))" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/directory/administrativeUnits/$($u['id'])"; needs = @('AdministrativeUnit.ReadWrite.All'); body = [ordered]@{ membershipRule = $auRule; membershipRuleProcessingState = 'On' }; before = [ordered]@{ membershipRule = $u['membershipRule']; membershipRuleProcessingState = $u['membershipRuleProcessingState'] } })
  }
  $sgName = "INT-SG-USR-$code-All"
  $sgRule = "$base -and (user.accountEnabled -eq true) -and $exclude"
  $g = $groupByName[$sgName]
  if (-not $g) { $plan.findings.Add("$sgName does not exist — created by New-PimRegions.ps1 / T51 Deploy, not here") }
  elseif (@($g['groupTypes']) -notcontains 'DynamicMembership') { $plan.findings.Add("$sgName is not a dynamic group — not changed") }
  elseif ((Get-RuleKey $g['membershipRule']) -eq (Get-RuleKey $sgRule)) { Write-PimOk "$sgName already excludes $AdminPrefix accounts" }
  elseif ((Get-RuleKey $g['membershipRule']) -match [regex]::Escape((Get-RuleKey "-notStartsWith `"$AdminPrefix`""))) { $plan.findings.Add("$sgName carries an admin exclusion in a different shape ($($g['membershipRule'])) — not changed") }
  else {
    $needs.Add('Group.ReadWrite.All')
    Add-PimOp $plan "grfix:$sgName" 'http' "$sgName → rule $sgRule (was: $($g['membershipRule']))" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/groups/$($g['id'])"; needs = @('Group.ReadWrite.All'); body = [ordered]@{ membershipRule = $sgRule; membershipRuleProcessingState = 'On' }; before = [ordered]@{ membershipRule = $g['membershipRule']; membershipRuleProcessingState = $g['membershipRuleProcessingState'] } })
  }
  # CHECK: who is in the unit today with the admin prefix
  if ($u) {
    try {
      $members = @(Invoke-PimGet "$GraphUrl/directory/administrativeUnits/$($u['id'])/members/microsoft.graph.user?`$select=id,userPrincipalName&`$top=999" -All)
      $adm = @($members | Where-Object { "$($_['userPrincipalName'])".StartsWith($AdminPrefix, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_['userPrincipalName'] })
      if ($adm.Count) { $plan.findings.Add("$auName holds $($adm.Count) admin account(s) today: $($adm -join ', ') — they leave the unit once the rule above is applied and re-evaluated") } else { Write-PimOk "$auName holds no $AdminPrefix account today" }
    } catch { Write-PimWarn "$auName members could not be read: $(Get-PimGraphError $_)" }
  }
  # FIX 3 (check only): Autopilot naming length
  if (($R.devicePrefix.Length + $SERIAL_LEN) -gt $NAME_MAX) { $plan.findings.Add("Region ${code}: devicePrefix '$($R.devicePrefix)' plus a $SERIAL_LEN-character serial exceeds $NAME_MAX characters — the Autopilot template <devicePrefix>%SERIAL% would be refused; shorten the prefix to $($NAME_MAX - $SERIAL_LEN) or use %RAND:$($NAME_MAX - $R.devicePrefix.Length)%") }
}

# ---- FIX 1: central Intune assignments carry every scope tag ------------------------
if (-not $tags.Count) { $plan.findings.Add('Intune scope tags could not be listed (none, or no permission) — central assignments not checked') }
else {
  foreach ($name in $CentralAssignments) {
    $a = @($assignments | Where-Object { "$($_['displayName'])" -eq $name })
    if (-not $a.Count) { continue }
    if ($a.Count -gt 1) { $plan.findings.Add("$name exists $($a.Count) times in Intune — not changed; remove the copy first"); continue }
    $a = $a[0]
    $have = @(Get-Key $a 'roleScopeTagIds' | ForEach-Object { "$_" } | Sort-Object -Unique)
    if (($have -join ',') -eq ($allTagIds -join ',')) { Write-PimOk "$name already carries every scope tag ($($allTagIds.Count))"; continue }
    $missing = @($allTagIds | Where-Object { $have -notcontains $_ } | ForEach-Object { $id = $_; ($tags | Where-Object { "$($_['id'])" -eq $id } | ForEach-Object { $_['displayName'] }) })
    $needs.Add('DeviceManagementRBAC.ReadWrite.All')
    Add-PimOp $plan "inttags:$name" 'http' "$name → every scope tag ($($allTagIds.Count)); adds $($missing -join ', ')" ([ordered]@{ method = 'PATCH'; uri = "$BetaUrl/deviceManagement/roleAssignments/$($a['id'])"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleAssignment'; roleScopeTagIds = $allTagIds }; before = [ordered]@{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleAssignment'; roleScopeTagIds = $have } })
  }
  # Regional assignments must NOT carry Default (they would see every object).
  foreach ($a in $assignments) {
    $n = "$($a['displayName'])"
    if ($n -notmatch '^INT-RBAC-(HelpDesk|Ops)-[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}$') { continue }
    $have = @(Get-Key $a 'roleScopeTagIds' | ForEach-Object { "$_" })
    if ($have -contains '0') { $plan.findings.Add("$n carries the Default scope tag — the region's operators would see every Intune object; remove Default from it in the portal (not changed here: a regional assignment is the region's)") }
  }
}

# ---- CHECKS that a script must not fix ----------------------------------------------
foreach ($an in $ApproverGroups) {
  $g = $groupByName[$an]
  if (-not $g) { $plan.findings.Add("$an does not exist — Deploy creates it, and Tier 0 approval stays OFF until it has two members"); continue }
  try {
    $m = @(Invoke-PimGet "$GraphUrl/groups/$($g['id'])/members?`$select=id&`$top=999" -All)
    if ($m.Count -lt 2) { $plan.findings.Add("$an has $($m.Count) member(s) — Tier 0 approval needs at least two people who never approve their own activation; add them in the portal, then Preview in T51 again") } else { Write-PimOk "$an has $($m.Count) members" }
  } catch { Write-PimWarn "$an members could not be read: $(Get-PimGraphError $_)" }
}
try {
  $mb = Invoke-PimGet "$GraphUrl/users?`$filter=startswith(userPrincipalName,'$AlertMailbox@')&`$select=id,userPrincipalName,accountEnabled&`$top=5"
  $hit = @($mb['value'] | Where-Object { "$($_['userPrincipalName'])" -ieq "$AlertMailbox@$($ctx.DefaultDomain)" })
  if (-not $hit.Count) { $plan.findings.Add("$AlertMailbox@$($ctx.DefaultDomain) does not exist — every PIM alert recipient in the catalog resolves to it; create the shared mailbox in Exchange first") } else { Write-PimOk "$AlertMailbox@$($ctx.DefaultDomain) exists" }
} catch { Write-PimWarn "the alert mailbox could not be checked: $(Get-PimGraphError $_)" }
if (Test-PimPermission 'Policy.Read.ConditionalAccess' $ctx.Scopes) {
  try {
    $null = Invoke-PimGet "$GraphUrl/identity/conditionalAccess/authenticationContextClassReferences/$AuthContextId"
    Write-PimOk "authentication context $AuthContextId exists (its Conditional Access policy is Workspace 01's — check it is On)"
  } catch { $plan.findings.Add("authentication context $AuthContextId is missing — Tier 0 activation requires it; create it in Conditional Access → Authentication contexts and the policy that gates it (phishing-resistant MFA + compliant device)") }
} else { Write-PimWarn "authentication context $AuthContextId not checked — the connection lacks Policy.Read.ConditionalAccess" }

# ---- plan / apply --------------------------------------------------------------------
Show-PimPlan $plan
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimStep 'Nothing to apply — the tenant already carries these fixes (read the findings above).'; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it. To apply exactly this plan:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
Assert-PimPermissions @($needs | Sort-Object -Unique) 'this plan'
Confirm-PimApply $plan -Yes:$Yes
# built again after the confirmation: the tenant may have moved while the domain was typed
$plan.hash = Get-PimPlanHash $plan
Assert-PimPlanMatches $plan $PlanFile
$null = Save-PimBackup $plan $OutDir
$result = Invoke-PimPlan $plan $OutDir $null
if ($result.failed) { Write-PimBad "stopped at the first failure — the operations after it did not run; fix the cause and plan again" }
else { Write-PimStep 'Done. Verify: Intune → Tenant admin → Roles → the central assignments list every tag; Entra → Admin units → AU-<REG>-Users → Dynamic membership rules carry the exclusion; membership re-evaluates within minutes.' }
