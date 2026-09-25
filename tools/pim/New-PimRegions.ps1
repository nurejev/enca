<#
.SYNOPSIS
  Plan, then apply, the regional part of the CloudFellows PIM framework (2.1)
  from a regions file — the two demo regions of cloudfellows.dev first, a
  customer's regions after.

.DESCRIPTION
  ENCA's 🧬 PIM baseline (T48) → 🗺 Regions reads a customer's regions.csv and
  compares it with the tenant; ⬇ Regions file writes the rows with the region
  template as one JSON file. This script is the write side of the same file.
  Per row (region code <REG>, e.g. EU-NL):

    Entra
      AU-<REG>-Users, AU-<REG>-Devices   dynamic administrative units on the row's attribute
      AU-<REG>-Groups                    assigned administrative unit
      PIM-SG-<REG>-Helpdesk, -Ops        role-assignable persona groups; membership
                                         policy GroupMember (active members, at most a year)
      PIM-SG-INT-HelpDesk-<REG>, PIM-SG-INT-Ops-<REG>
                                         role-assignable Intune access groups; membership
                                         policy GroupJIT (eligible members, 8 h activation)
      PIM-SG-<REG>-Approvers             plain group, members = the row's approvers
      the persona groups ELIGIBLE for their roles, SCOPED to the region's units
    Intune (unless left out with -Include)
      INT-SG-USR-<REG>-All, INT-SG-DEV-<REG>-All   dynamic scope groups
      INT-TAG-<REG>                                scope tag, auto-assigned from the device group
      INT-ROLE-Regional-Ops                        the one custom role (once, every action or none)
      INT-RBAC-HelpDesk-<REG>, INT-RBAC-Ops-<REG>  role assignments: members = the INT access
                                                   groups, scope = the INT-SG groups, tag = INT-TAG-<REG>
    Manual, listed in the plan: the access review and the Autopilot profile.
    Never: a restricted management unit (the protection matrix says what goes
    in one, by hand) — and nothing is ever deleted or removed.

  WITHOUT -Apply (the default) it only READS and writes a plan file. Every row
  is validated first, the same way ENCA does it: a bad row (an attribute other
  than extensionAttribute1-15, a value with a quote in it, an address that is
  not one) blocks the whole plan — nothing unsafe reaches a membership rule.
  What exists and differs is reported; a unit's or scope group's rule or paused
  processing is changed only with -FixRules; an Intune role assignment that
  differs is reported, never rewritten. An Intune read that fails blocks the
  plan (leave Intune out with -Include to go on without it) — nothing is
  created after a read that did not work, and the custom role is created with
  every action the template lists or not at all.

  WITH -Apply -PlanFile <that file>: the plan is built again; if the tenant
  changed, the run stops before the first write. Then the tenant domain is
  typed to confirm and the plan is built and compared once more; rules about
  to change are backed up (and read back), the
  operations run in order, the first failure stops the rest, every outcome is
  logged and the plan is built once more to show what is still open.

  IMPACT, before -Apply:
    * units and scope groups: none until a role is scoped to them; every member
      of a dynamic unit or group needs Entra ID P1;
    * persona groups: none until they have members; members activate the
      scoped roles under the role's own policy;
    * scoped eligibilities: local IT gains, on activation, rights on the
      region's users, groups and devices — never tenant-wide, and never on an
      admin (Entra blocks AU-scoped Helpdesk/Password/Authentication
      Administrators from users who hold a role);
    * Intune: regional operators see and act on their scope after their next
      activation; central roles are untouched.
  RECOVERY: -RestoreFrom does not apply here (rules are only changed with
  -FixRules and are in the backup file: put them back in the portal); a
  created unit, group, tag or assignment is removed by hand after checking it
  is unused.

.PARAMETER RegionsFile
  regions.csv (columns code,name,attribute,value,devicePrefix,autopilotTag,
  itLead,approvers,timezone — code required; approvers "a@x;b@x") or the JSON
  ENCA writes (regions as a list; approvers a list or "a;b").
.PARAMETER TemplateFile
  The template (tools/pim/pim-regions-template.json). Used when the regions
  file does not carry its own.
.PARAMETER Customer
  Customers.json key (e.g. DEVCF): connect through Connect-Customer.ps1 and check the tenant.
.PARAMETER ConnectScript
  Path to Connect-Customer.ps1 when it is not on PATH or under ~/REPO.
.PARAMETER TenantId
  Expected tenant (id or verified domain) when not using -Customer.
.PARAMETER Interactive
  Delegated sign-in instead of Connect-Customer.
.PARAMETER Only
  Region codes to plan (default: every row).
.PARAMETER Include
  Units, Groups, GroupPolicies, Eligibilities, Intune. Default: all.
.PARAMETER FixRules
  Plan a rule rewrite for a unit or scope group whose rule differs from the
  template, and switch paused processing back on.
.PARAMETER AlertDomain
  Domain for alert recipients whose domain is not verified in the tenant.
.PARAMETER OutDir
  Where plan, backup and outcome files go (default: the current folder).
.PARAMETER Apply
  Run the plan. Needs -PlanFile.
.PARAMETER PlanFile
  The plan an earlier run without -Apply wrote.
.PARAMETER Yes
  Skip the typed confirmation (automation only).

.EXAMPLE
  .\Connect-Customer.ps1 -Customer DEVCF -Services Graph
  .\tools\pim\New-PimRegions.ps1 -RegionsFile .\tools\pim\regions.csv -Customer DEVCF
  .\tools\pim\New-PimRegions.ps1 -RegionsFile .\tools\pim\regions.csv -Customer DEVCF -Apply -PlanFile .\pim-plan.regions.cloudfellows.dev.20260925-170000.json

.EXAMPLE
  # one region of a customer, from ENCA's ⬇ Regions file, Intune later
  .\tools\pim\New-PimRegions.ps1 -RegionsFile .\regions.contoso.nl.json -Customer CONTOSO -Only EU-NL -Include Units,Groups,GroupPolicies,Eligibilities

.NOTES
  Graph application permissions (Connect-Customer.ps1 -AddGraphScopes adds them):
    plan  : Directory.Read.All, RoleManagement.Read.Directory, RoleManagementPolicy.Read.Directory,
            RoleManagementPolicy.Read.AzureADGroup, DeviceManagementRBAC.Read.All (Intune)
    apply : AdministrativeUnit.ReadWrite.All, Group.ReadWrite.All, RoleManagement.ReadWrite.Directory,
            RoleManagementPolicy.ReadWrite.AzureADGroup, DeviceManagementRBAC.ReadWrite.All (Intune)
  Only Microsoft.Graph.Authentication is needed (every call is Invoke-MgGraphRequest).
#>
#Requires -Version 7.2
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RegionsFile,
  [string]$TemplateFile = (Join-Path $PSScriptRoot 'pim-regions-template.json'),
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string[]]$Only,
  [ValidateSet('Units', 'Groups', 'GroupPolicies', 'Eligibilities', 'Intune')][string[]]$Include = @('Units', 'Groups', 'GroupPolicies', 'Eligibilities', 'Intune'),
  [switch]$FixRules,
  [string]$AlertDomain,
  [string]$OutDir = (Get-Location).Path,
  [switch]$Apply,
  [string]$PlanFile,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }
$BetaUrl = 'https://graph.microsoft.com/beta'
$REGION_COLUMNS = @('code', 'name', 'attribute', 'value', 'devicePrefix', 'autopilotTag', 'itLead', 'approvers', 'timezone')
$REGION_MAX_ROWS = 250
$REGION_MAX_BYTES = 262144
$DEFAULT_FIELDS = @{
  attribute = '^extensionAttribute([1-9]|1[0-5])$'; value = '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$'; devicePrefix = '^[A-Za-z0-9][A-Za-z0-9-]{0,14}$'
  autopilotTag = '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'; name = '^[^\u0000-\u001f"<>]{1,64}$'; email = '^[^@\s"<>(),;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; timezone = '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'
}
$DEFAULT_CODE = '^[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}$'

$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile 'regions' } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All', 'AdministrativeUnit.ReadWrite.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'DeviceManagementRBAC.ReadWrite.All')
if (-not $AlertDomain) { $AlertDomain = $ctx.DefaultDomain }
$readNeeds = @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup')
if ($Include -contains 'Intune') { $readNeeds += 'DeviceManagementRBAC.Read.All' }
Assert-PimPermissions $readNeeds 'planning'

function Get-Key($h, [string]$k) { if ($h -is [System.Collections.IDictionary] -and $h.Contains($k)) { return $h[$k] }; return $null }
function Get-RuleKey([string]$r) { if (-not $r) { return '' }; return (($r -replace '\s+', ' ').Trim().ToLower()) }
function Get-Esc([string]$s) { return $s.Replace("'", "''") }

# ---- the file: rows, validated like ENCA's parseRegions ----------------------------
# Returns { rows, errors, warnings, doc }. Never throws on content: every
# problem is a message, and any error blocks the plan.
function Read-RegionsInput {
  $res = [ordered]@{ rows = New-Object System.Collections.Generic.List[object]; errors = New-Object System.Collections.Generic.List[string]; warnings = New-Object System.Collections.Generic.List[string]; doc = $null }
  if (-not (Test-Path -LiteralPath $RegionsFile)) { $res.errors.Add("Regions file not found: $RegionsFile"); return $res }
  $raw = Get-Content -LiteralPath $RegionsFile -Raw -Encoding UTF8
  if ($null -eq $raw) { $raw = '' }
  if ($raw.Length -gt $REGION_MAX_BYTES) { $res.errors.Add("The file is larger than $([math]::Round($REGION_MAX_BYTES / 1024)) KB — a regions file is one row per region."); return $res }
  $trim = $raw.Trim()
  if (-not $trim) { $res.errors.Add('The file is empty.'); return $res }
  $objs = $null
  if ($trim[0] -eq '[' -or $trim[0] -eq '{') {
    $j = $null
    try { $j = ConvertFrom-Json -InputObject (Remove-PimJsonComments $trim) -AsHashtable -Depth 32 -NoEnumerate } catch { $res.errors.Add("Not valid JSON: $($_.Exception.Message)"); return $res }
    if ($j -is [System.Collections.IList]) { $objs = @($j) }
    elseif ($j -is [System.Collections.IDictionary] -and $j.Contains('regions') -and $j['regions'] -is [System.Collections.IList]) { $objs = @($j['regions']); if ($j.Contains('template') -and $j['template']) { $res.doc = $j } }
    else { $res.errors.Add('JSON must be a list of regions, or an object whose regions is a list.'); return $res }
  } else {
    $first = ($trim -split "`r?`n")[0]
    $head = @($first -split ',' | ForEach-Object { $_.Trim().Trim('"').Trim() })
    if ($head -notcontains 'code') { $res.errors.Add("The first line must be the header: $($REGION_COLUMNS -join ',')"); return $res }
    foreach ($h in $head) { if ($h -and $REGION_COLUMNS -notcontains $h) { $res.warnings.Add("Column `"$h`" is not one the template reads (ignored).") } }
    $objs = @(($trim -split "`r?`n") | ConvertFrom-Csv | ForEach-Object { $o = [ordered]@{}; foreach ($p in $_.PSObject.Properties) { $o[$p.Name] = "$($p.Value)".Trim() }; $o })
  }
  if ($objs.Count -gt $REGION_MAX_ROWS) { $res.errors.Add("$($objs.Count) rows — more than $REGION_MAX_ROWS; split the file."); return $res }
  $tdoc = $res.doc
  $fieldRe = if ($tdoc -and (Get-Key $tdoc 'fields')) { $tdoc['fields'] } else { $DEFAULT_FIELDS }
  $codeRe = if ($tdoc -and (Get-Key $tdoc 'codePattern')) { $tdoc['codePattern'] } else { $DEFAULT_CODE }
  $re = { param($k) if ($fieldRe.Contains($k)) { $fieldRe[$k] } elseif ($DEFAULT_FIELDS.ContainsKey($k)) { $DEFAULT_FIELDS[$k] } else { $null } }
  $seen = @{}
  for ($i = 0; $i -lt $objs.Count; $i++) {
    $o = $objs[$i]; $line = $i + 2
    if ($o -isnot [System.Collections.IDictionary]) { $res.errors.Add("Row ${line}: not a region (an object with code and name)."); continue }
    $cell = @{}; $typeBad = $false
    foreach ($k in @('code', 'name', 'attribute', 'value', 'devicePrefix', 'autopilotTag', 'itLead', 'timezone')) {
      $v = Get-Key $o $k
      if ($null -eq $v) { $cell[$k] = ''; continue }
      if ($v -is [string] -or $v -is [int] -or $v -is [long] -or $v -is [double]) { $cell[$k] = "$v".Trim(); continue }
      $res.errors.Add("Row ${line}: $k must be text."); $typeBad = $true; break
    }
    if ($typeBad) { continue }
    $code = $cell.code.ToUpper()
    if (-not $code) { $res.errors.Add("Row ${line}: no code."); continue }
    if ($code -cnotmatch $codeRe) { $res.errors.Add("Row ${line}: code `"$code`" does not follow continent-country (EU-NL, NA-US, APAC-SG)."); continue }
    if ($seen.ContainsKey($code)) { $res.errors.Add("Row ${line}: code $code twice."); continue }
    $ap = Get-Key $o 'approvers'
    $approvers = @()
    if ($null -eq $ap -or ($ap -is [string] -and -not $ap.Trim())) { $approvers = @() }
    elseif ($ap -is [string]) { $approvers = @($ap -split '[;|]' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
    elseif ($ap -is [System.Collections.IList] -and -not @($ap | Where-Object { $_ -isnot [string] }).Count) { $approvers = @($ap | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
    else { $res.errors.Add("Row ${line}: approvers must be text (a;b) or a list of addresses."); continue }
    $last = ($code -split '-')[-1]
    $row = [ordered]@{
      code = $code; name = $(if ($cell.name) { $cell.name } else { $code })
      attribute = $(if ($cell.attribute) { $cell.attribute } else { 'extensionAttribute1' }); value = $(if ($cell.value) { $cell.value } else { $code })
      devicePrefix = $(if ($cell.devicePrefix) { $cell.devicePrefix } else { "$last-" }); autopilotTag = $(if ($cell.autopilotTag) { $cell.autopilotTag } else { $code })
      itLead = $cell.itLead; approvers = $approvers; timezone = $cell.timezone
    }
    $bad = New-Object System.Collections.Generic.List[string]
    if ($row.attribute -cnotmatch (& $re 'attribute')) { $bad.Add("attribute `"$($row.attribute)`" — only extensionAttribute1 to extensionAttribute15 exist on users and devices both") }
    if ($row.value -cnotmatch (& $re 'value')) { $bad.Add("value `"$($row.value)`" — letters, digits, space, dot, dash and underscore only (it goes inside a membership rule)") }
    if ($row.devicePrefix -cnotmatch (& $re 'devicePrefix')) { $bad.Add("devicePrefix `"$($row.devicePrefix)`" — letters, digits and dashes, at most 15") }
    if ($row.autopilotTag -cnotmatch (& $re 'autopilotTag')) { $bad.Add("autopilotTag `"$($row.autopilotTag)`"") }
    if ($row.name -cnotmatch (& $re 'name')) { $bad.Add('name — at most 64 characters, no quotes or angle brackets') }
    if ($row.itLead -and $row.itLead -cnotmatch (& $re 'email')) { $bad.Add("itLead `"$($row.itLead)`" is not an address") }
    foreach ($a in $row.approvers) { if ($a -cnotmatch (& $re 'email')) { $bad.Add("approver `"$a`" is not an address") } }
    if ($bad.Count) { $res.errors.Add("Row $line ($code) left out: $($bad -join '; ')."); continue }
    $seen[$code] = $true
    if (-not $cell.name) { $res.warnings.Add("Row ${line}: $code has no name (the code is used).") }
    if (-not $row.approvers.Count) { $res.warnings.Add("Row ${line}: $code names no approvers — PIM-SG-$code-Approvers stays empty.") }
    if (-not $row.itLead) { $res.warnings.Add("Row ${line}: $code names no IT lead to review the region's access.") }
    if ($row.timezone -and $row.timezone -cnotmatch (& $re 'timezone')) { $res.warnings.Add("Row ${line}: timezone `"$($row.timezone)`" does not look like Europe/Amsterdam.") }
    $res.rows.Add($row)
  }
  return $res
}

function Expand-RegionTemplate($v, $row) {
  if ($null -eq $v) { return $null }
  if ($v -is [string]) {
    return $v.Replace('<REG>', $row.code).Replace('<attribute>', $row.attribute).Replace('<value>', $row.value).Replace('<devicePrefix>', $row.devicePrefix).Replace('<autopilotTag>', $row.autopilotTag).Replace('<itLead>', $row.itLead).Replace('<approvers>', ($row.approvers -join '; ')).Replace('<name>', $row.name)
  }
  if ($v -is [System.Collections.IDictionary]) { $o = [ordered]@{}; foreach ($k in $v.Keys) { $o[$k] = Expand-RegionTemplate $v[$k] $row }; return $o }
  if ($v -is [System.Collections.IList]) { return , @($v | ForEach-Object { Expand-RegionTemplate $_ $row }) }
  return $v
}
function Get-SetKey($list) { return ((@($list) | Where-Object { $_ } | ForEach-Object { "$_".ToLower() } | Sort-Object -Unique) -join ',') }

# ---- the plan: reads only ------------------------------------------------------------
function Build-RegionsPlan {
  $plan = New-PimPlan 'regions' $RegionsFile
  $in = Read-RegionsInput
  foreach ($w in $in.warnings) { $plan.findings.Add($w) }
  foreach ($e in $in.errors) { $plan.blocked.Add($e) }
  if ($plan.blocked.Count) { return $plan }
  $tdoc = $in.doc
  if (-not $tdoc) {
    if (-not (Test-Path -LiteralPath $TemplateFile)) { $plan.blocked.Add("Template not found: $TemplateFile (a CSV needs tools/pim/pim-regions-template.json)"); return $plan }
    $tdoc = Read-PimJsonFile $TemplateFile
  }
  $tpl = Get-Key $tdoc 'template'
  if (-not $tpl) { $plan.blocked.Add('The template file carries no template.'); return $plan }
  $gTemplates = Get-Key $tdoc 'groupTemplates'; if (-not $gTemplates) { $gTemplates = @{} }
  $intuneRoles = @(Get-Key $tdoc 'intuneRoles' | Where-Object { $_ })
  $rmau = @(Get-Key (Get-Key $tdoc 'central') 'rmau' | Where-Object { $_ })
  if ($rmau.Count) { $plan.findings.Add("manual — restricted management unit(s) $(@($rmau | ForEach-Object { if ($_ -is [System.Collections.IDictionary]) { $_['name'] } else { $_ } }) -join ', '): made by hand, with the protection matrix; never a PIM-SG group or an adm- account in one") }
  $rows = $in['rows'].ToArray()
  if ($Only) {
    $want = @($Only | ForEach-Object { "$_".Trim().ToUpper() })
    foreach ($c in $want) { if (-not @($rows | Where-Object { $_.code -eq $c }).Count) { $plan.blocked.Add("-Only ${c}: no such region in the file") } }
    $rows = @($rows | Where-Object { $want -contains $_.code })
  }
  if (-not $rows.Count) { $plan.blocked.Add('No region to plan.'); return $plan }
  $expanded = @($rows | ForEach-Object { [ordered]@{ row = $_; R = (Expand-RegionTemplate $tpl $_) } })

  # -- the names this plan touches
  $touchGroups = New-Object System.Collections.Generic.HashSet[string]; $touchUnits = New-Object System.Collections.Generic.HashSet[string]
  $centralApprovers = New-Object System.Collections.Generic.HashSet[string]
  foreach ($t in $gTemplates.Values) { foreach ($a in @(Get-Key $t 'Approvers')) { if ($a) { $n = if ($a -is [System.Collections.IDictionary]) { "$($a['description'])" } else { "$a" }; [void]$centralApprovers.Add($n); [void]$touchGroups.Add($n) } } }
  foreach ($x in $expanded) {
    foreach ($a in @($x.R['aus'])) { [void]$touchUnits.Add($a['name']) }
    foreach ($g in @($x.R['groups'])) { [void]$touchGroups.Add($g['name']) }
    if ($Include -contains 'Intune' -and (Get-Key $x.R 'intune')) { foreach ($g in @($x.R['intune']['groups'])) { [void]$touchGroups.Add($g['name']) } }
  }

  # -- what the tenant has (standard queries: served from the directory itself)
  $sel = 'id,displayName,isAssignableToRole,createdDateTime,membershipRule,membershipRuleProcessingState,groupTypes'
  $groups = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'PIM-SG-')&`$select=$sel&`$top=999" -All) + @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'INT-SG-')&`$select=$sel&`$top=999" -All)
  $gBy = @{}; foreach ($g in $groups) { $k = $g['displayName']; if (-not $gBy.ContainsKey($k)) { $gBy[$k] = New-Object System.Collections.Generic.List[object] }; if (-not @($gBy[$k] | Where-Object { $_['id'] -eq $g['id'] }).Count) { $gBy[$k].Add($g) } }
  $units = @(Invoke-PimGet "$GraphUrl/directory/administrativeUnits?`$select=id,displayName,membershipType,membershipRule,membershipRuleProcessingState,isMemberManagementRestricted&`$top=999" -All)
  $uBy = @{}; foreach ($u in $units) { $k = $u['displayName']; if (-not $uBy.ContainsKey($k)) { $uBy[$k] = New-Object System.Collections.Generic.List[object] }; $uBy[$k].Add($u) }
  foreach ($n in ($touchGroups | Sort-Object)) { if ($gBy.ContainsKey($n) -and $gBy[$n].Count -gt 1) { $plan.blocked.Add("$n exists $($gBy[$n].Count) times ($(@($gBy[$n] | ForEach-Object { $_['id'] }) -join ', ')) — run .\Find-PimDuplicates.ps1 first") } }
  foreach ($n in ($touchUnits | Sort-Object)) { if ($uBy.ContainsKey($n) -and $uBy[$n].Count -gt 1) { $plan.blocked.Add("administrative unit $n exists $($uBy[$n].Count) times ($(@($uBy[$n] | ForEach-Object { $_['id'] }) -join ', ')) — keep one by hand") } }
  foreach ($n in $centralApprovers) { if (-not $gBy.ContainsKey($n)) { $plan.blocked.Add("$n (the approvers the membership templates name) does not exist — run New-PimBaseline.ps1 first") } }
  if ($plan.blocked.Count) { return $plan }
  $idOf = @{}; foreach ($n in $gBy.Keys) { $idOf[$n] = $gBy[$n][0]['id']; $plan.resolved["group:$n"] = $idOf[$n] }
  $auOf = @{}; foreach ($n in $uBy.Keys) { $auOf[$n] = $uBy[$n][0]['id']; $plan.resolved["au:$n"] = $auOf[$n] }
  $creating = New-Object System.Collections.Generic.HashSet[string]
  $gref = { param($n) if ($idOf.ContainsKey($n)) { $idOf[$n] } elseif ($creating.Contains("group:$n")) { "{{group:$n}}" } else { $null } }
  $uref = { param($n) if ($auOf.ContainsKey($n)) { $auOf[$n] } elseif ($creating.Contains("au:$n")) { "{{au:$n}}" } else { $null } }

  $defs = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleDefinitions?`$select=id,displayName,isBuiltIn,templateId" -All)
  $roleId = @{}
  foreach ($d in $defs) { $k = $d['displayName']; if ($roleId.ContainsKey($k)) { $roleId[$k] = 'CONFLICT' } elseif ($d['isBuiltIn']) { $roleId[$k] = $d['id'] } else { $roleId[$k] = "CUSTOM:$($d['id'])" } }
  $rolePol = @{}
  foreach ($a in @(Invoke-PimGet "$GraphUrl/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'&`$expand=policy(`$expand=rules)" -All)) { $rolePol[$a['roleDefinitionId']] = $a['policy'] }
  $eligSched = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleEligibilitySchedules?`$select=id,principalId,roleDefinitionId,directoryScopeId,scheduleInfo" -All)
  $activeSched = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleAssignmentSchedules?`$select=id,principalId,roleDefinitionId,directoryScopeId,assignmentType,scheduleInfo" -All)

  # -- Intune, read once; a read that fails blocks instead of guessing
  $intune = $null
  if ($Include -contains 'Intune') {
    try {
      $iRoles = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleDefinitions" -All)
      $iTags = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleScopeTags" -All)
      $iOps = @(Invoke-PimGet "$BetaUrl/deviceManagement/resourceOperations" -All)
      $iAssign = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleAssignments" -All)
      $intune = @{ roles = @{}; tags = @{}; known = New-Object System.Collections.Generic.HashSet[string]; assign = @{} }
      foreach ($ir in $iRoles) { $k = $ir['displayName']; if (-not $intune.roles.ContainsKey($k)) { $intune.roles[$k] = New-Object System.Collections.Generic.List[object] }; $intune.roles[$k].Add($ir) }
      foreach ($t in $iTags) { $k = $t['displayName']; if (-not $intune.tags.ContainsKey($k)) { $intune.tags[$k] = New-Object System.Collections.Generic.List[object] }; $intune.tags[$k].Add($t) }
      foreach ($op in $iOps) { foreach ($v in @($op['id'], (Get-Key $op 'actionName'))) { if ($v) { [void]$intune.known.Add("$v") } } }
      foreach ($a in $iAssign) { $k = $a['displayName']; if (-not $intune.assign.ContainsKey($k)) { $intune.assign[$k] = New-Object System.Collections.Generic.List[object] }; $intune.assign[$k].Add($a) }
    } catch {
      $plan.blocked.Add("Intune could not be read ($(Get-PimGraphError $_)) — nothing Intune is planned after a read that did not work. Fix it (DeviceManagementRBAC.Read.All, an Intune licence), or leave Intune out: -Include Units,Groups,GroupPolicies,Eligibilities")
      return $plan
    }
  }

  # -- the custom Intune role(s): every action or none
  $iRoleRef = @{}
  if ($intune) {
    foreach ($b in @($intune.roles.Keys)) { if ($intune.roles[$b].Count -gt 1) { $plan.findings.Add("Intune role $b exists $($intune.roles[$b].Count) times") }; $iRoleRef[$b] = $intune.roles[$b][0]['id'] }
    foreach ($cr in $intuneRoles) {
      $n = $cr['name']; $allowed = @($cr['allowed'])
      if ($intune.roles.ContainsKey($n)) {
        $have = @($intune.roles[$n][0]['rolePermissions'] | ForEach-Object { $_['resourceActions'] } | ForEach-Object { $_['allowedResourceActions'] } | Where-Object { $_ })
        $miss = @($allowed | Where-Object { $have -notcontains $_ }); $extra = @($have | Where-Object { $allowed -notcontains $_ })
        if ($miss.Count -or $extra.Count) { $plan.findings.Add("Intune role $n differs from the template — missing: $(if ($miss) { $miss -join ', ' } else { '—' }); extra: $(if ($extra) { $extra -join ', ' } else { '—' }). Not rewritten: correct it in Intune") }
        continue
      }
      $unknown = @($allowed | Where-Object { -not $intune.known.Contains($_) })
      if ($unknown.Count -eq $allowed.Count -and $allowed.Count) { $plan.blocked.Add("Intune role ${n}: the tenant's operation list recognises none of its $($allowed.Count) actions — the list may use another form; create the role by hand from the template, then plan again"); continue }
      if ($unknown.Count) { $plan.blocked.Add("Intune role ${n}: the tenant does not know $($unknown.Count) of its actions ($($unknown -join ', ')) — a reduced role is never created; fix the template, then plan again"); continue }
      Add-PimOp $plan "introle:$n" 'http' "create Intune custom role $n ($($allowed.Count) actions)" ([ordered]@{ method = 'POST'; uri = "$BetaUrl/deviceManagement/roleDefinitions"; produces = "introle:$n"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleDefinition'; displayName = $n; description = "$($cr['description'])"; isBuiltIn = $false; rolePermissions = @([ordered]@{ resourceActions = @([ordered]@{ allowedResourceActions = $allowed; notAllowedResourceActions = @() }) }) } })
      $iRoleRef[$n] = "{{introle:$n}}"
    }
  }

  $approverIds = @{}; foreach ($n in $centralApprovers) { $approverIds[$n] = $idOf[$n] }
  $deferred = New-Object System.Collections.Generic.List[object]

  foreach ($x in $expanded) {
    $row = $x.row; $R = $x.R; $tagR = "$($row.name) ($($row.code))"
    # -- units
    foreach ($a in @($R['aus'])) {
      $n = $a['name']; $dyn = "$($a['kind'])" -eq 'dynamic'
      if ($auOf.ContainsKey($n)) {
        $u = $uBy[$n][0]
        if ($u['isMemberManagementRestricted']) { $plan.findings.Add("$n is a restricted management unit — a region unit must not be (PIM cannot manage what is in one); left as it is") }
        if ($dyn) {
          $ruleOk = (Get-RuleKey $u['membershipRule']) -eq (Get-RuleKey $a['rule']); $typeOk = "$($u['membershipType'])" -eq 'Dynamic'; $stateOk = "$($u['membershipRuleProcessingState'])" -eq 'On'
          if (-not ($ruleOk -and $typeOk -and $stateOk)) {
            $what = @(); if (-not $typeOk) { $what += 'not dynamic' }; if (-not $ruleOk) { $what += "rule $($u['membershipRule'])" }; if (-not $stateOk) { $what += "processing $($u['membershipRuleProcessingState'])" }
            if (-not $typeOk) { $plan.findings.Add("$n is an ASSIGNED unit; the template makes it dynamic ($($a['rule'])). Not changed, not even with -FixRules: a dynamic rule removes every member it does not match. Recreate it under this name, or set the rule in the portal") }
            elseif ($FixRules -and $Include -contains 'Units') {
              Add-PimOp $plan "aufix:$n" 'http' "$n → dynamic, rule $($a['rule']), processing On (was: $($what -join '; '))" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/directory/administrativeUnits/$($u['id'])"; needs = @('AdministrativeUnit.ReadWrite.All'); body = [ordered]@{ membershipType = 'Dynamic'; membershipRule = $a['rule']; membershipRuleProcessingState = 'On' }; before = [ordered]@{ membershipType = $u['membershipType']; membershipRule = $u['membershipRule']; membershipRuleProcessingState = $u['membershipRuleProcessingState'] } })
            } else { $plan.findings.Add("$n differs: $($what -join '; ') (template: $($a['rule']), On) — -FixRules plans the rewrite") }
          }
        }
        continue
      }
      if ($Include -notcontains 'Units') { $plan.findings.Add("$n is missing (Units not included)"); continue }
      $body = [ordered]@{ displayName = $n; description = "CloudFellows PIM framework: $tagR — $($a['kind']) unit for the region's $($a['type'])s" }
      if ($dyn) { $body['membershipType'] = 'Dynamic'; $body['membershipRule'] = $a['rule']; $body['membershipRuleProcessingState'] = 'On' }
      Add-PimOp $plan "au:$n" 'http' "create administrative unit $n ($($a['kind'])$(if ($dyn) { ": $($a['rule'])" }))" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/directory/administrativeUnits"; produces = "au:$n"; needs = @('AdministrativeUnit.ReadWrite.All'); body = $body })
      [void]$creating.Add("au:$n")
    }
    # -- groups
    foreach ($g in @($R['groups'])) {
      $n = $g['name']; $ra = [bool]$g['roleAssignable']
      if ($idOf.ContainsKey($n)) {
        $cur = $gBy[$n][0]
        if ($ra -and -not $cur['isAssignableToRole']) { $plan.blocked.Add("$n exists but is NOT role-assignable — the flag cannot be set later; rename it away and plan again"); continue }
        if ($ra) {
          $own = @(Invoke-PimGet "$GraphUrl/groups/$($cur['id'])/owners?`$select=id" -All)
          if ($own.Count) { $plan.findings.Add("$n has $($own.Count) owner(s) — an owner can change membership outside PIM; remove them by hand unless intended") }
        }
      } elseif ($Include -contains 'Groups') {
        $nick = ($n -replace '[^A-Za-z0-9]', '').ToLower()
        $body = [ordered]@{ displayName = $n; mailEnabled = $false; mailNickname = $nick; securityEnabled = $true; groupTypes = @(); description = "CloudFellows PIM framework: $($g['persona']), $tagR. $($g['description'])" }
        $needs = @('Group.ReadWrite.All')
        if ($ra) { $body['isAssignableToRole'] = $true; $body['visibility'] = 'Private'; $needs += 'RoleManagement.ReadWrite.Directory' }
        Add-PimOp $plan "group:$n" 'http' "create $(if ($ra) { 'role-assignable ' } else { 'plain ' })group $n" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups"; produces = "group:$n"; needs = $needs; body = $body })
        [void]$creating.Add("group:$n")
      } else { $plan.findings.Add("$n is missing (Groups not included)"); continue }
      $approverIds[$n] = & $gref $n
      # membership policy
      $tn = Get-Key $g 'template'
      if ($tn -and $Include -contains 'GroupPolicies') {
        if (-not $gTemplates.Contains($tn)) { $plan.blocked.Add("${n}: membership template $tn is not in the template file"); continue }
        $settings = [ordered]@{}; foreach ($k in $gTemplates[$tn].Keys) { $settings[$k] = $gTemplates[$tn][$k] }
        $missA = @(Get-PimApproverNames $settings | Where-Object { -not $approverIds[$_] })
        if ($missA.Count) { $plan.blocked.Add("${n}: approver group $($missA -join ', ') does not exist — nothing could approve"); continue }
        $pol = if ($idOf.ContainsKey($n)) { Get-PimGroupMemberPolicy $idOf[$n] } else { $null }
        if (-not $pol) { $deferred.Add(@{ name = $n; settings = $settings; template = $tn }) }
        else {
          foreach ($c in (Get-PimRuleChanges -Rules @($pol['rules']) -T $settings -ApproverIds $approverIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains)) {
            if ($c.Contains('missing')) { $plan.findings.Add("$n Member policy has no rule $($c.ruleId) — left as it is"); continue }
            Add-PimOp $plan "gpol:${n}:$($c.ruleId)" 'http' "$n membership policy: $($c.ruleId) → $tn" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"; needs = @('RoleManagementPolicy.ReadWrite.AzureADGroup'); body = (Get-PimRuleBody $c.after); before = $c.before })
          }
        }
      }
      # approvers: a plain group with the row's people as members
      if (-not $ra -and (Get-Key $g 'members')) {
        if (-not $row.approvers.Count) { continue }
        $gid = & $gref $n
        $have = if ($idOf.ContainsKey($n)) { @(Invoke-PimGet "$GraphUrl/groups/$gid/members?`$select=id" -All | ForEach-Object { $_['id'] }) } else { @() }
        foreach ($upn in $row.approvers) {
          $u = $null
          try { $u = Invoke-PimGet "$GraphUrl/users/$([uri]::EscapeDataString($upn))?`$select=id,userPrincipalName" } catch { $u = $null }
          if (-not $u -or -not $u['id']) { $plan.findings.Add("${n}: approver $upn is not in the tenant — fix the file or add the person by hand"); continue }
          if ($have -contains $u['id']) { continue }
          if ($Include -notcontains 'Groups') { $plan.findings.Add("${n}: $upn is not a member (Groups not included)"); continue }
          Add-PimOp $plan "member:${n}:$($u['id'])" 'http' "add $upn to $n" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups/$gid/members/`$ref"; needs = @('Group.ReadWrite.All'); body = [ordered]@{ '@odata.id' = "$GraphUrl/directoryObjects/$($u['id'])" } })
        }
      }
    }
    # -- scoped eligibilities
    if ($Include -contains 'Eligibilities') {
      foreach ($e in @($R['eligibilities'])) {
        $rn = "$($e['role'])"; $gn = "$($e['group'])"; $an = "$($e['au'])"
        $rid = $roleId[$rn]
        if (-not $rid) { $plan.blocked.Add("role '$rn' does not exist in the tenant"); continue }
        if ($rid -eq 'CONFLICT' -or $rid -like 'CUSTOM:*') { $plan.blocked.Add("role '$rn' is ambiguous in the tenant (a custom role carries the name) — not assigned"); continue }
        $gid = & $gref $gn; $aid = & $uref $an
        if (-not $gid -or -not $aid) { $plan.findings.Add("$gn → $rn at ${an}: left out, $(if (-not $gid) { $gn } else { $an }) does not exist and is not planned"); continue }
        $scope = "/administrativeUnits/$aid"
        if ($idOf.ContainsKey($gn)) {
          $wide = @($eligSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['directoryScopeId'])" -eq '/' })
          if ($wide.Count) { $plan.findings.Add("$gn is eligible for $rn at TENANT scope — wider than the region; the scoped one does not replace it: remove the tenant-wide one by hand") }
          $act = @($activeSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['assignmentType'])" -ne 'Activated' })
          if ($act.Count) { $plan.findings.Add("$gn holds $rn ACTIVE at $(@($act | ForEach-Object { $_['directoryScopeId'] }) -join ', ') — the framework makes it eligible; remove the active one by hand") }
          if ($auOf.ContainsKey($an) -and @($eligSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['directoryScopeId'])" -eq $scope }).Count) { continue }
        }
        $dur = 'P365D'
        $pol = $rolePol[$rid]
        if ($pol) {
          $rule = @($pol['rules'] | Where-Object { $_['id'] -eq 'Expiration_Admin_Eligibility' })[0]
          if ($rule -and $rule['isExpirationRequired'] -and (ConvertTo-PimTimeSpan $rule['maximumDuration']) -lt (ConvertTo-PimTimeSpan $dur)) { $plan.findings.Add("$rn allows eligibility for at most $($rule['maximumDuration']); $gn gets that"); $dur = "$($rule['maximumDuration'])" }
        }
        Add-PimOp $plan "elig:${rn}:${gn}:$an" 'request' "$gn eligible for $rn at $an ($dur)" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleEligibilityScheduleRequests"; needs = @('RoleManagement.ReadWrite.Directory'); body = [ordered]@{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = $scope; justification = "CloudFellows PIM framework: $gn carries $rn in $an"; scheduleInfo = [ordered]@{ expiration = [ordered]@{ type = 'afterDuration'; duration = $dur } } } })
      }
    }
    # -- Intune
    $I = Get-Key $R 'intune'
    if ($intune -and $I) {
      foreach ($g in @($I['groups'])) {
        $n = $g['name']
        if ($idOf.ContainsKey($n)) {
          $cur = $gBy[$n][0]
          $ruleOk = (Get-RuleKey $cur['membershipRule']) -eq (Get-RuleKey $g['rule']); $stateOk = "$($cur['membershipRuleProcessingState'])" -eq 'On'; $dynOk = @($cur['groupTypes']) -contains 'DynamicMembership'
          if (-not ($ruleOk -and $stateOk -and $dynOk)) {
            $what = @(); if (-not $dynOk) { $what += 'not dynamic' }; if (-not $ruleOk) { $what += "rule $($cur['membershipRule'])" }; if (-not $stateOk) { $what += "processing $($cur['membershipRuleProcessingState'])" }
            if ($FixRules -and $dynOk) {
              Add-PimOp $plan "grfix:$n" 'http' "$n → rule $($g['rule']), processing On (was: $($what -join '; '))" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/groups/$($cur['id'])"; needs = @('Group.ReadWrite.All'); body = [ordered]@{ membershipRule = $g['rule']; membershipRuleProcessingState = 'On' }; before = [ordered]@{ membershipRule = $cur['membershipRule']; membershipRuleProcessingState = $cur['membershipRuleProcessingState'] } })
            } else { $plan.findings.Add("$n differs: $($what -join '; ') (template: $($g['rule']), On)$(if ($dynOk) { ' — -FixRules plans the rewrite' } else { ' — an assigned group cannot become this scope group; rename it away' })") }
          }
          continue
        }
        if ($Include -notcontains 'Groups') { $plan.findings.Add("$n is missing (Groups not included)"); continue }
        $nick = ($n -replace '[^A-Za-z0-9]', '').ToLower()
        Add-PimOp $plan "group:$n" 'http' "create dynamic group ${n}: $($g['rule'])" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups"; produces = "group:$n"; needs = @('Group.ReadWrite.All'); body = [ordered]@{ displayName = $n; mailEnabled = $false; mailNickname = $nick; securityEnabled = $true; groupTypes = @('DynamicMembership'); membershipRule = $g['rule']; membershipRuleProcessingState = 'On'; description = "CloudFellows PIM framework: Intune scope group, $tagR, $($g['type'])s" } })
        [void]$creating.Add("group:$n")
      }
      # scope tag + its auto-assignment (repaired on a rerun when the second step did not happen)
      $tag = Get-Key $I 'tag'
      $tagRef = $null
      if ($tag) {
        $tn = $tag['name']; $from = & $gref $tag['autoAssignFrom']
        if ($intune.tags.ContainsKey($tn)) {
          if ($intune.tags[$tn].Count -gt 1) { $plan.blocked.Add("Intune scope tag $tn exists $($intune.tags[$tn].Count) times — keep one by hand"); continue }
          $tagRef = $intune.tags[$tn][0]['id']
          $curT = @()
          try { $curT = @(Invoke-PimGet "$BetaUrl/deviceManagement/roleScopeTags/$tagRef/assignments" -All | ForEach-Object { $_['target'] } | Where-Object { $_ }) }
          catch { $plan.blocked.Add("Intune scope tag ${tn}: its assignments could not be read ($(Get-PimGraphError $_))"); continue }
          # assign REPLACES the list: every existing target goes back unchanged, and one
          # this script cannot identify stops the plan rather than being dropped
          $curIds = @(); $odd = @()
          foreach ($t0 in $curT) { $tid0 = if (Get-Key $t0 'entraObjectId') { $t0['entraObjectId'] } elseif (Get-Key $t0 'groupId') { $t0['groupId'] } else { $null }; if ($tid0) { $curIds += "$tid0" } else { $odd += "$(Get-Key $t0 '@odata.type')" } }
          if ($odd.Count) { $plan.blocked.Add("Intune scope tag ${tn}: $($odd.Count) auto-assignment target(s) of a kind this script does not know ($($odd -join ', ')) — add $($tag['autoAssignFrom']) by hand"); continue }
          if ($from -and $curIds -notcontains $from) {
            $keep = @($curT | ForEach-Object { [ordered]@{ target = $_ } })
            $add = [ordered]@{ target = [ordered]@{ '@odata.type' = '#microsoft.graph.scopeTagGroupAssignmentTarget'; targetType = 'device'; entraObjectId = $from } }
            Add-PimOp $plan "tagassign:$tn" 'http' "auto-assign $tn from $($tag['autoAssignFrom'])$(if ($keep.Count) { " (keeping its $($keep.Count) other target(s))" })" ([ordered]@{ method = 'POST'; uri = "$BetaUrl/deviceManagement/roleScopeTags/$tagRef/assign"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ assignments = @($keep + @($add)) } })
          }
        } else {
          Add-PimOp $plan "tag:$tn" 'http' "create Intune scope tag $tn" ([ordered]@{ method = 'POST'; uri = "$BetaUrl/deviceManagement/roleScopeTags"; produces = "tag:$tn"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ displayName = $tn; description = "CloudFellows PIM framework: $tagR" } })
          $tagRef = "{{tag:$tn}}"
          if ($from) { Add-PimOp $plan "tagassign:$tn" 'http' "auto-assign $tn from $($tag['autoAssignFrom'])" ([ordered]@{ method = 'POST'; uri = "$BetaUrl/deviceManagement/roleScopeTags/$tagRef/assign"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ assignments = @([ordered]@{ target = [ordered]@{ '@odata.type' = '#microsoft.graph.scopeTagGroupAssignmentTarget'; targetType = 'device'; entraObjectId = $from } }) } }) }
          else { $plan.findings.Add("${tn}: $($tag['autoAssignFrom']) does not exist and is not planned — the tag is not auto-assigned") }
        }
      }
      $tagIdOf = @{}; if ($tag -and $tagRef) { $tagIdOf[$tag['name']] = $tagRef }
      foreach ($as in @($I['assignments'])) {
        $n = $as['name']; $rname = "$(@($as['roles'])[0])"
        $rref = $iRoleRef[$rname]
        if (-not $rref) { $plan.blocked.Add("${n}: Intune role '$rname' does not exist and is not planned"); continue }
        $mem = @($as['members'] | ForEach-Object { & $gref $_ }); $scp = @($as['scopeGroups'] | ForEach-Object { & $gref $_ }); $tg = @($as['tags'] | ForEach-Object { $tagIdOf[$_] })
        if (@($mem + $scp + $tg | Where-Object { -not $_ }).Count) { $plan.findings.Add("${n}: left out — a member, scope group or tag it names does not exist and is not planned"); continue }
        if ($intune.assign.ContainsKey($n)) {
          if ($intune.assign[$n].Count -gt 1) { $plan.findings.Add("Intune assignment $n exists $($intune.assign[$n].Count) times") }
          $cur = $null
          try { $cur = Invoke-PimGet "$BetaUrl/deviceManagement/roleAssignments/$($intune.assign[$n][0]['id'])?`$expand=roleDefinition" }
          catch { $plan.blocked.Add("Intune assignment ${n}: could not be read ($(Get-PimGraphError $_))"); continue }
          $diff = @()
          $curRole = if (Get-Key $cur 'roleDefinition') { $cur['roleDefinition']['id'] } else { Get-Key $cur 'roleDefinitionId' }
          if ($rref -notlike '{{*' -and "$curRole" -ne "$rref") { $diff += "role $curRole, not $rname" }
          if ((Get-SetKey $cur['members']) -ne (Get-SetKey $mem)) { $diff += 'members' }
          if ((Get-SetKey $cur['resourceScopes']) -ne (Get-SetKey $scp)) { $diff += 'scope groups' }
          if ((Get-SetKey (Get-Key $cur 'roleScopeTagIds')) -ne (Get-SetKey $tg)) { $diff += 'scope tags' }
          if ($diff.Count) { $plan.findings.Add("Intune assignment $n differs from the template ($($diff -join ', ')) — not rewritten: correct it in Intune") }
          continue
        }
        Add-PimOp $plan "intassign:$n" 'http' "create Intune assignment ${n}: $rname · members $(@($as['members']) -join ', ') · scope $(@($as['scopeGroups']) -join ', ') · tag $(@($as['tags']) -join ', ')" ([ordered]@{ method = 'POST'; uri = "$BetaUrl/deviceManagement/roleAssignments"; needs = @('DeviceManagementRBAC.ReadWrite.All'); body = [ordered]@{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleAssignment'; displayName = $n; description = "CloudFellows PIM framework: $tagR"; members = $mem; resourceScopes = $scp; scopeType = 'resourceScope'; roleScopeTagIds = $tg; 'roleDefinition@odata.bind' = "$BetaUrl/deviceManagement/roleDefinitions/$rref" } })
      }
      $ap = Get-Key $I 'autopilot'
      if ($ap) { $plan.findings.Add("manual — Autopilot profile '$($ap['profile'])', naming $($ap['naming']), group tag $($ap['groupTag']): made in Intune by hand") }
    }
    $rv = Get-Key $R 'review'
    if ($rv) { $plan.findings.Add("manual — access review '$($rv['name'])', $($rv['cadence']), reviewer $(if ($rv['reviewer']) { $rv['reviewer'] } else { '(no IT lead in the row)' }), on $($rv['scope']): set up in Identity Governance by hand") }
  }
  # membership policies of new groups (or not in PIM for Groups yet) come last
  foreach ($d in $deferred) { Add-PimOp $plan "gpolnew:$($d.name)" 'groupPolicy' "$($d.name) membership policy → $($d.template) (once the group is in PIM for Groups)" ([ordered]@{ group = $d.name; settings = $d.settings; needs = @('RoleManagementPolicy.ReadWrite.AzureADGroup') }) }
  return $plan
}

# ---- the group-policy step of a new group, at apply time -----------------------------
$groupPolicyResolver = {
  param($op)
  $ids = Get-PimIds
  $gid = $ids["group:$($op.group)"]
  if (-not $gid) { throw "group $($op.group) has no id" }
  $pol = Get-PimGroupMemberPolicy $gid
  if (-not $pol) { return 'deferred — not in PIM for Groups yet; plan again in a few minutes' }
  $approverIds = @{}; foreach ($k in $ids.Keys) { if ($k -like 'group:*') { $approverIds[$k.Substring(6)] = $ids[$k] } }
  $changes = @(Get-PimRuleChanges -Rules @($pol['rules']) -T $op.settings -ApproverIds $approverIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains | Where-Object { -not $_.Contains('missing') })
  foreach ($c in $changes) {
    $u = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"
    Add-PimLateBackup "gpolnew:$($op.group):$($c.ruleId)" $u $c.before
    $null = Invoke-PimWrite 'PATCH' $u (Resolve-PimPlaceholders (Get-PimRuleBody $c.after))
  }
  return "done ($($changes.Count) rule(s))"
}

# ---- run ------------------------------------------------------------------------------
Write-PimStep "Reading $RegionsFile"
$plan = Build-RegionsPlan
Show-PimPlan $plan
if ($plan.blocked.Count) { throw "$($plan.blocked.Count) blocking problem(s) above — no plan written, nothing written." }
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimOk 'nothing to do: the tenant carries what the regions file says (the manual items above stay manual)'; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it. To apply exactly this plan:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
$needs = New-Object System.Collections.Generic.HashSet[string]
foreach ($o in $plan.ops) { foreach ($p in @($o.needs)) { if ($p) { [void]$needs.Add($p) } } }
Assert-PimPermissions @($needs) 'this plan'
Confirm-PimApply $plan -Yes:$Yes
# the tenant is read again AFTER the confirmation: a prompt can wait for hours
Write-PimStep 'Checking the plan against the tenant once more'
$plan = Build-RegionsPlan
if ($plan.blocked.Count) { Show-PimPlan $plan; throw "$($plan.blocked.Count) blocking problem(s) appeared since the plan — nothing written." }
Assert-PimPlanMatches $plan $PlanFile
$plan.hash = Get-PimPlanHash $plan
$null = Save-PimBackup $plan $OutDir
$result = Invoke-PimPlan $plan $OutDir $groupPolicyResolver
Write-PimStep 'Reading the tenant again'
if (-not $Yes) { Start-Sleep -Seconds 5 }
$after = Build-RegionsPlan
if (-not $after.ops.Count) { Write-PimOk 'verified: planning again finds nothing left to do' }
else { Write-PimWarn "$($after.ops.Count) operation(s) still open — dynamic units and new schedules can take a few minutes; plan again: $(@($after.ops | ForEach-Object { $_.summary }) -join '; ')" }
if ($result.failed) { throw "$($result.failed) operation(s) failed — see $($result.file)" }
if ($result.deferred) { throw "$($result.deferred) membership polic(ies) deferred: the new groups were not in PIM for Groups yet. Plan again in a few minutes and apply that plan — see $($result.file)" }
