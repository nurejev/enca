<#
.SYNOPSIS
  Move the baseline tenant (cloudfellows.dev) from CloudFellows PIM framework
  2.2 to 3.0 — job groups for one activation per job, direct groups for Tier 0,
  Exchange, SharePoint, Purview and the readers — in four phases, each planned
  first and applied only from its plan file.

.DESCRIPTION
  Reads framework-3.0.baseline.json (the union of the small, large and
  multi-region designs that the baseline tenant carries) and, for multi-region,
  the regions file: every row gets its regional job groups
  (PIM-SG-<REG>-Helpdesk, PIM-SG-<REG>-Ops), active at the region's own units.
  Regional groups and units are created by New-PimRegions.ps1, not here; a
  region whose groups are missing is reported and left out. Same shape as New-PimBaseline.ps1: without
  -Apply it only READS and writes a plan; with -Apply -PlanFile it plans again,
  stops if the tenant moved, asks for the tenant's default domain, backs up
  every rule it changes, applies in order, stops at the first failure and logs
  every outcome.

  Run the phases in this order. Each one leaves the tenant working.

    Direct  Create PIM-SG-M365-Ops-Direct, -Collab-Direct, -SecOps-Direct
            (role-assignable). Set the GroupMember membership policy on every
            direct group. Make each direct group ELIGIBLE for its roles
            (1 year). Copy the active members of the paired job group into the
            new direct group as ACTIVE members (1 year), so nobody loses the
            per-role path for Exchange, SharePoint or Purview.
            Impact: additive. A few people gain an eligibility they already had
            through the old group. Recovery: remove the new groups.

    People  Set GroupJITTier1 on every job group. Make every active member of a
            job group an ELIGIBLE member (1 year), then end the active
            membership. Never touches direct or protected groups, nor the ids
            in -ProtectedIds.
            Impact: until phase Jobs, these people activate the group, then the
            role (two steps instead of one). Nobody loses access: eligible
            membership of a group that is eligible for roles still reaches the
            roles. Recovery: add them back as active members (the outcome file
            lists each one).

    Jobs    Allow permanent active assignment on the roles job groups hold, then
            make each job group ACTIVE, permanently, in each of its roles
            (tenant scope, or AU-RM-Executives for the executive desk).
            REFUSED while any job group still has an active member: an active
            member of a group that holds roles actively would hold them
            standing. Run People first.
            Impact: one activation of a job group now gives every role of the
            job. Recovery: -RestoreFrom the backup puts the role rules back;
            remove the active assignments in PIM.

    Retire  Remove the job groups' old ELIGIBLE role assignments — only those
            now covered by the group's own active assignment or by the paired
            direct group's eligibility. Anything else is reported, not removed.
            Impact: none for people; the tenant is clean for T48 and the demo.
            Recovery: the outcome file lists every removed eligibility.

  Roles a job group holds that are also on Microsoft's activation-delay list
  (Exchange, SharePoint, Purview) are never in a job group in the design file;
  the script refuses a design that puts them there.

.PARAMETER Phase      Direct | People | Jobs | Retire
.PARAMETER DesignFile framework-3.0.baseline.json (default: next to the script)
.PARAMETER RegionsFile  regions.cloudfellows.dev.json (default: next to the script)
.PARAMETER NoRegions  leave the regional groups out
.PARAMETER ProtectedIds  Object ids never moved or removed (break-glass, the
                      standing Global Administrator of the baseline tenant).
.PARAMETER Customer / ConnectScript / TenantId / Interactive  as New-PimBaseline.ps1
.PARAMETER Apply / PlanFile / Yes / OutDir  as New-PimBaseline.ps1
.PARAMETER AlertDomain  Domain for pim-alerts (default: the tenant's default domain)

.EXAMPLE
  .\Set-PimFramework30.ps1 -Customer DEVCF -Phase Direct -ProtectedIds <bg1>,<bg2>
  .\Set-PimFramework30.ps1 -Customer DEVCF -Phase Direct -ProtectedIds <bg1>,<bg2> -Apply -PlanFile .\pim-plan.fw30-direct.cloudfellows.dev.<stamp>.json
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Direct', 'People', 'Jobs', 'Retire')][string]$Phase,
  [string]$DesignFile = (Join-Path $PSScriptRoot 'framework-3.0.baseline.json'),
  [string]$RegionsFile = (Join-Path $PSScriptRoot 'regions.cloudfellows.dev.json'),
  [switch]$NoRegions,
  [string[]]$ProtectedIds = @(),
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string]$AlertDomain,
  [string]$OutDir = '.',
  [switch]$Apply,
  [string]$PlanFile,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$KIND = "fw30-$($Phase.ToLower())"
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }
$DELAY_ROLES = @('Exchange Administrator', 'SharePoint Administrator', 'Compliance Administrator', 'Compliance Data Administrator', 'Security Administrator', 'Global Administrator', 'Global Reader')
$TIER0_ROLES = @('Global Administrator', 'Privileged Role Administrator', 'Privileged Authentication Administrator', 'Conditional Access Administrator', 'Security Administrator')
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
foreach ($p in $ProtectedIds) { if ($p -notmatch '^[0-9a-fA-F-]{36}$') { throw "-ProtectedIds '$p' is not an object id. Nothing was read or written." } }
$protected = @($ProtectedIds | ForEach-Object { $_.ToLower() })

# ---- design ---------------------------------------------------------------------------
$design = Read-PimJsonFile $DesignFile
if ("$($design['schema'])" -ne 'cloudfellows-pim-framework/3.0-baseline') { throw "$DesignFile is not a framework 3.0 baseline design. Nothing was read or written." }
$DG = @($design['groups'])
# multi-region: the regional job groups, once per row of the regions file
if ($design['regionGroups'] -and -not $NoRegions) {
  if (-not (Test-Path -LiteralPath $RegionsFile)) { throw "Regions file not found: $RegionsFile (or pass -NoRegions). Nothing was read or written." }
  $rdoc = Read-PimJsonFile $RegionsFile
  $codes = @(@($rdoc['regions']) | ForEach-Object { "$($_['code'])".Trim() } | Where-Object { $_ })
  if (-not $codes.Count) { throw "No regions in $RegionsFile. Nothing was read or written." }
  foreach ($c in $codes) {
    if ($c -cnotmatch "$($design['regionCodePattern'])") { throw "Region code '$c' does not match $($design['regionCodePattern']). Nothing was read or written." }
    foreach ($t in @($design['regionGroups'])) {
      $x = ($t | ConvertTo-Json -Depth 20 | ConvertFrom-Json -AsHashtable -Depth 20)
      $x['name'] = "$($t['name'])".Replace('<REG>', $c); $x['region'] = $c
      $x['roles'] = @(@($t['roles']) | ForEach-Object { @{ role = $_['role']; scope = "$($_['scope'])".Replace('<REG>', $c) } })
      $DG += $x
    }
  }
}
$jobs = @($DG | Where-Object { $_['path'] -eq 'job' })
$directs = @($DG | Where-Object { $_['path'] -eq 'direct' })
$protectedGroups = @($design['protectedGroups'])
foreach ($j in $jobs) {
  $bad = @(@($j['roles']) | Where-Object { $DELAY_ROLES -contains $_['role'] -or $TIER0_ROLES -contains $_['role'] } | ForEach-Object { $_['role'] })
  if ($bad.Count) { throw "Design error: job group $($j['name']) holds $($bad -join ', ') — Tier 0 and Exchange/SharePoint/Purview roles belong on the direct path. Nothing was read or written." }
  if ($protectedGroups -contains $j['name']) { throw "Design error: $($j['name']) is protected and cannot be a job group." }
}
function Get-Template([string]$name) { $t = $design['templates'][$name]; if (-not $t) { throw "Design error: template $name is missing." }; return $t }

# ---- connect --------------------------------------------------------------------------
$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile $KIND } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup')
Assert-PimPermissions @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup') 'planning'
if (-not $AlertDomain) { $AlertDomain = $ctx.DefaultDomain }

# ---- reads (shared by every phase) ------------------------------------------------------
Write-PimStep "Reading groups, roles and schedules on $($ctx.TenantName)"
$groupsNow = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'PIM-SG-')&`$select=id,displayName,isAssignableToRole&`$top=999" -All)
$byName = @{}
foreach ($g in $groupsNow) { $n = "$($g['displayName'])"; if ($byName.ContainsKey($n)) { $byName[$n] = 'DUPLICATE' } else { $byName[$n] = $g } }
$idOf = @{}
foreach ($n in $byName.Keys) { if ($byName[$n] -ne 'DUPLICATE') { $idOf[$n] = "$($byName[$n]['id'])" } }
$defs = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleDefinitions?`$select=id,displayName,isBuiltIn,templateId" -All)
$roleIx = New-PimRoleIndex $defs
$roleName = @{}; foreach ($d in $defs) { $roleName["$($d['id'])"] = "$($d['displayName'])" }
$auByName = @{}
foreach ($a in @(Invoke-PimGet "$GraphUrl/directory/administrativeUnits?`$select=id,displayName&`$top=999" -All)) { $n = "$($a['displayName'])"; $auByName[$n] = $(if ($auByName.ContainsKey($n)) { 'DUPLICATE' } else { "$($a['id'])" }) }
function Get-ScopeId([string]$scope) {
  if ($scope -eq '/') { return '/' }
  if ($auByName.ContainsKey($scope) -and $auByName[$scope] -ne 'DUPLICATE') { return "/administrativeUnits/$($auByName[$scope])" }
  return $null
}
function Get-RoleId([string]$name) { $r = Resolve-PimRole $roleIx $name; if ($r.Contains('problem')) { return $null }; return $r.id }
function Get-Elig([string]$principal) { @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleEligibilitySchedules?`$filter=principalId eq '$principal'" -All | Where-Object { "$($_['principalId'])" -eq $principal }) }
function Get-Active([string]$principal) { @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleAssignmentSchedules?`$filter=principalId eq '$principal'" -All | Where-Object { "$($_['principalId'])" -eq $principal }) }
function Get-GroupActive([string]$gid) {
  @(Invoke-PimGet "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentSchedules?`$filter=groupId eq '$gid'" -All | Where-Object {
      "$($_['groupId'])" -eq $gid -and "$($_['accessId'])" -in @('member', '') -and "$($_['assignmentType'])" -notin @('activated', 'Activated') -and "$($_['memberType'])" -notin @('group', 'Group', 'inherited', 'Inherited') })
}
function Get-GroupElig([string]$gid) { @(Invoke-PimGet "$GraphUrl/identityGovernance/privilegedAccess/group/eligibilitySchedules?`$filter=groupId eq '$gid'" -All | Where-Object { "$($_['groupId'])" -eq $gid -and "$($_['accessId'])" -in @('member', '') }) }
function Test-User([string]$id) { try { $null = Invoke-PimGet "$GraphUrl/users/$id`?`$select=id"; return $true } catch { return $false } }

$approverIds = @{}; foreach ($n in @('PIM-SG-Approvers', 'PIM-SG-Approvers-Tier0')) { if ($idOf.ContainsKey($n)) { $approverIds[$n] = $idOf[$n] } }
$plan = New-PimPlan $KIND $DesignFile
$needs = New-Object System.Collections.Generic.HashSet[string]
$planned = New-Object System.Collections.Generic.HashSet[string]
$ref = { param($n) if ($idOf.ContainsKey($n)) { $idOf[$n] } elseif ($planned.Contains($n)) { "{{group:$n}}" } else { $null } }
foreach ($n in $idOf.Keys) { $plan.resolved["group:$n"] = $idOf[$n] }
foreach ($g in $DG) {
  $n = $g['name']
  if ($byName[$n] -eq 'DUPLICATE') { $plan.blocked.Add("$n exists more than once — run Find-PimDuplicates.ps1 first") }
  elseif ($byName.ContainsKey($n) -and -not $byName[$n]['isAssignableToRole']) { $plan.blocked.Add("$n exists but is NOT role-assignable — Groups and AU administrators could change its members and bypass PIM; rename it away first") }
}
$policyOps = {
  param([string]$n, [string]$tplName)
  $gid = $idOf[$n]
  $T = Get-Template $tplName
  $pol = Get-PimGroupMemberPolicy $gid
  if (-not $pol) { [void]$needs.Add('RoleManagementPolicy.ReadWrite.AzureADGroup'); Add-PimOp $plan "gpolnew:$n" 'groupPolicy' "$n membership policy → $tplName (once the group is in PIM for Groups)" ([ordered]@{ group = $n; settings = $T }); return }
  foreach ($c in (Get-PimRuleChanges -Rules @($pol['rules']) -T $T -ApproverIds $approverIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains)) {
    if ($c.Contains('missing')) { $plan.findings.Add("$n membership policy has no rule $($c.ruleId) — left as it is"); continue }
    [void]$needs.Add('RoleManagementPolicy.ReadWrite.AzureADGroup')
    Add-PimOp $plan "gpol:${n}:$($c.ruleId)" 'http' "$n membership policy: $($c.ruleId) → $tplName" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"; body = (Get-PimRuleBody $c.after); before = $c.before })
  }
}

# =========================================================================== Direct
if ($Phase -eq 'Direct') {
  foreach ($g in $directs) {
    $n = $g['name']
    if (-not $idOf.ContainsKey($n)) {
      if (-not $g['new']) { $plan.findings.Add("$n does not exist — it is a 2.x group; run New-PimBaseline.ps1 for it first"); continue }
      [void]$needs.Add('Group.ReadWrite.All'); [void]$needs.Add('RoleManagement.ReadWrite.Directory')
      $nick = ($n -replace '[^A-Za-z0-9]', '').ToLower()
      Add-PimOp $plan "group:$n" 'http' "create role-assignable group $n" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups"; produces = "group:$n"; body = [ordered]@{ displayName = $n; mailEnabled = $false; mailNickname = $nick; securityEnabled = $true; groupTypes = @(); isAssignableToRole = $true; visibility = 'Private'; description = 'CloudFellows PIM framework 3.0 — direct path: active members, the group is eligible per role.' } })
      [void]$planned.Add($n)
    }
  }
  foreach ($g in $directs) { $n = $g['name']; if ($idOf.ContainsKey($n)) { & $policyOps $n $g['template'] } }
  foreach ($g in $directs) {
    $n = $g['name']; $gid = & $ref $n; if (-not $gid) { continue }
    $have = if ($idOf.ContainsKey($n)) { Get-Elig $gid } else { @() }
    foreach ($r in @($g['roles'])) {
      $rid = Get-RoleId $r['role']; if (-not $rid) { $plan.blocked.Add("role '$($r['role'])' does not exist in the tenant"); continue }
      $sc = Get-ScopeId $r['scope']; if (-not $sc) { $plan.findings.Add("$n · $($r['role']): scope $($r['scope']) does not exist — left out"); continue }
      if (@($have | Where-Object { "$($_['roleDefinitionId'])" -eq $rid -and "$($_['directoryScopeId'])" -eq $sc }).Count) { continue }
      [void]$needs.Add('RoleManagement.ReadWrite.Directory')
      Add-PimOp $plan "elig:${n}:$($r['role']):$sc" 'request' "$n eligible for $($r['role']) at $sc (1 year)" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleEligibilityScheduleRequests"; body = [ordered]@{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = $sc; justification = "CloudFellows PIM framework 3.0: $n carries $($r['role']) per role"; scheduleInfo = [ordered]@{ expiration = [ordered]@{ type = 'afterDuration'; duration = 'P365D' } } } })
    }
  }
  foreach ($g in @($directs | Where-Object { $_['copyPeopleFrom'] })) {
    $n = $g['name']; $src = $g['copyPeopleFrom']; $gid = & $ref $n
    if (-not $idOf.ContainsKey($src)) { $plan.findings.Add("$src does not exist — nobody to copy into $n"); continue }
    $already = if ($idOf.ContainsKey($n)) { @(Get-GroupActive $idOf[$n] | ForEach-Object { "$($_['principalId'])" }) } else { @() }
    foreach ($a in (Get-GroupActive $idOf[$src])) {
      $who = "$($a['principalId'])"
      if ($protected -contains $who.ToLower() -or $already -contains $who) { continue }
      if (-not (Test-User $who)) { $plan.findings.Add("$src has a member $who that is not a user — not copied"); continue }
      [void]$needs.Add('PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup')
      Add-PimOp $plan "copy:${n}:$who" 'request' "$who active member of $n (1 year) — copied from $src" ([ordered]@{ uri = "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentScheduleRequests"; body = [ordered]@{ accessId = 'member'; principalId = $who; groupId = $gid; action = 'adminAssign'; justification = "CloudFellows PIM framework 3.0: per-role path for the $src persona"; scheduleInfo = [ordered]@{ expiration = [ordered]@{ type = 'afterDuration'; duration = 'P365D' } } } })
    }
  }
  # new groups' membership policies last: they exist in PIM only after the first PIM operation
  foreach ($g in $directs) { $n = $g['name']; if ($planned.Contains($n)) { [void]$needs.Add('RoleManagementPolicy.ReadWrite.AzureADGroup'); Add-PimOp $plan "gpolnew:$n" 'groupPolicy' "$n membership policy → $($g['template']) (once the group is in PIM for Groups)" ([ordered]@{ group = $n; settings = (Get-Template $g['template']) }) } }
}

# =========================================================================== People
if ($Phase -eq 'People') {
  foreach ($g in $jobs) {
    $n = $g['name']
    if (-not $idOf.ContainsKey($n)) { $plan.findings.Add("$n does not exist — create it with $(if ($g['region']) { 'New-PimRegions.ps1' } else { 'New-PimBaseline.ps1' }) first"); continue }
    & $policyOps $n $g['template']
  }
  foreach ($g in $jobs) {
    $n = $g['name']; if (-not $idOf.ContainsKey($n)) { continue }
    $gid = $idOf[$n]
    $elig = @(Get-GroupElig $gid | ForEach-Object { "$($_['principalId'])" })
    foreach ($a in (Get-GroupActive $gid)) {
      $who = "$($a['principalId'])"
      if ($protected -contains $who.ToLower()) { $plan.findings.Add("$n · $who is protected — left as an active member; phase Jobs will refuse until it is removed by hand"); continue }
      if (-not (Test-User $who)) { $plan.findings.Add("$n has a member $who that is not a user — left; remove it by hand"); continue }
      [void]$needs.Add('PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup'); [void]$needs.Add('PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup')
      if ($elig -notcontains $who) {
        Add-PimOp $plan "pe:${n}:$who" 'request' "$who eligible member of $n (1 year)" ([ordered]@{ uri = "$GraphUrl/identityGovernance/privilegedAccess/group/eligibilityScheduleRequests"; body = [ordered]@{ accessId = 'member'; principalId = $who; groupId = $gid; action = 'adminAssign'; justification = 'CloudFellows PIM framework 3.0: job group, one activation per job'; scheduleInfo = [ordered]@{ expiration = [ordered]@{ type = 'afterDuration'; duration = 'P365D' } } } })
      }
      Add-PimOp $plan "pa-:${n}:$who" 'request' "$who no longer an active member of $n (eligible instead)" ([ordered]@{ uri = "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentScheduleRequests"; body = [ordered]@{ accessId = 'member'; principalId = $who; groupId = $gid; action = 'adminRemove'; justification = 'CloudFellows PIM framework 3.0: membership becomes eligible' } })
    }
  }
}

# =========================================================================== Jobs
if ($Phase -eq 'Jobs') {
  foreach ($g in $jobs) {
    $n = $g['name']; if (-not $idOf.ContainsKey($n)) { if ($g['region']) { $plan.findings.Add("$n does not exist — region $($g['region']) is left out; create it with New-PimRegions.ps1") } else { $plan.blocked.Add("$n does not exist") }; continue }
    $left = @(Get-GroupActive $idOf[$n])
    if ($left.Count) { $plan.blocked.Add("$n still has $($left.Count) active member(s) ($(@($left | ForEach-Object { $_['principalId'] }) -join ', ')) — they would hold every role of the job standing; run phase People (or remove them by hand) first") }
  }
  $roleNames = @($jobs | ForEach-Object { @($_['roles']) | ForEach-Object { $_['role'] } } | Sort-Object -Unique)
  $pols = @{}
  foreach ($pa in @(Invoke-PimGet "$GraphUrl/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'&`$expand=policy(`$expand=rules)" -All)) { $pols["$($pa['roleDefinitionId'])"] = $pa['policy'] }
  foreach ($rn in $roleNames) {
    $rid = Get-RoleId $rn; if (-not $rid) { $plan.blocked.Add("role '$rn' does not exist in the tenant"); continue }
    $pol = $pols[$rid]; if (-not $pol) { $plan.findings.Add("$rn policy was not read — left as it is"); continue }
    $rule = @($pol['rules'] | Where-Object { $_['id'] -eq 'Expiration_Admin_Assignment' })[0]
    if (-not $rule -or -not $rule['isExpirationRequired']) { continue }
    $after = ($rule | ConvertTo-Json -Depth 32 | ConvertFrom-Json -AsHashtable -Depth 32); $after['isExpirationRequired'] = $false
    [void]$needs.Add('RoleManagementPolicy.ReadWrite.Directory')
    Add-PimOp $plan "rpol:${rn}" 'http' "$rn policy: allow permanent active assignment (held by a job group)" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/Expiration_Admin_Assignment"; body = (Get-PimRuleBody $after); before = $rule })
  }
  foreach ($g in $jobs) {
    $n = $g['name']; if (-not $idOf.ContainsKey($n)) { continue }
    $gid = $idOf[$n]; $have = Get-Active $gid
    foreach ($r in @($g['roles'])) {
      $rid = Get-RoleId $r['role']; if (-not $rid) { continue }
      $sc = Get-ScopeId $r['scope']; if (-not $sc) { $plan.findings.Add("$n · $($r['role']): unit $($r['scope']) does not exist or exists twice — left out (create it with New-PimRegions.ps1, New-PimBaseline.ps1 or in 🛡 T27)"); continue }
      if (@($have | Where-Object { "$($_['roleDefinitionId'])" -eq $rid -and "$($_['directoryScopeId'])" -eq $sc }).Count) { continue }
      [void]$needs.Add('RoleManagement.ReadWrite.Directory')
      Add-PimOp $plan "act:${n}:$($r['role']):$sc" 'request' "$n ACTIVE in $($r['role']) at $sc (permanent — its eligible members get it on activation)" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleAssignmentScheduleRequests"; body = [ordered]@{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = $sc; justification = "CloudFellows PIM framework 3.0: job group $n"; scheduleInfo = [ordered]@{ expiration = [ordered]@{ type = 'noExpiration' } } } })
    }
  }
}

# =========================================================================== Retire
if ($Phase -eq 'Retire') {
  $directOf = @{}; foreach ($d in $directs) { $directOf[$d['name']] = $d }
  foreach ($g in $jobs) {
    $n = $g['name']; if (-not $idOf.ContainsKey($n)) { continue }
    $gid = $idOf[$n]
    $act = Get-Active $gid
    $pair = $g['directPair']
    $pairElig = if ($pair -and $idOf.ContainsKey($pair)) { Get-Elig $idOf[$pair] } else { @() }
    foreach ($e in (Get-Elig $gid)) {
      $rid = "$($e['roleDefinitionId'])"; $sc = "$($e['directoryScopeId'])"
      $byAct = @($act | Where-Object { "$($_['roleDefinitionId'])" -eq $rid -and "$($_['directoryScopeId'])" -eq $sc }).Count
      $byPair = @($pairElig | Where-Object { "$($_['roleDefinitionId'])" -eq $rid -and "$($_['directoryScopeId'])" -eq $sc }).Count
      $rn = if ($roleName.ContainsKey($rid)) { $roleName[$rid] } else { $rid }
      if (-not $byAct -and -not $byPair) { $plan.findings.Add("$n is still eligible for $rn at $sc and nothing in 3.0 replaces it — left; decide by hand"); continue }
      [void]$needs.Add('RoleManagement.ReadWrite.Directory')
      $why = if ($byAct) { 'the group holds it actively now' } else { "$pair carries it per role now" }
      Add-PimOp $plan "ret:${n}:${rid}:$sc" 'request' "$n no longer eligible for $rn at $sc — $why" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleEligibilityScheduleRequests"; body = [ordered]@{ action = 'adminRemove'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = $sc; justification = "CloudFellows PIM framework 3.0: superseded ($why)" } })
    }
  }
}

# ---- a new group's membership policy, at apply time (as New-PimBaseline.ps1) ------------
$groupPolicyResolver = {
  param($op)
  $ids = Get-PimIds
  $gid = $ids["group:$($op.group)"]; if (-not $gid) { throw "group $($op.group) has no id" }
  $pol = Get-PimGroupMemberPolicy $gid
  if (-not $pol) { return 'deferred — not in PIM for Groups yet; plan phase Direct again in a few minutes' }
  $aIds = @{}; foreach ($k in $ids.Keys) { if ($k -like 'group:*') { $aIds[$k.Substring(6)] = $ids[$k] } }
  $changes = @(Get-PimRuleChanges -Rules @($pol['rules']) -T $op.settings -ApproverIds $aIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains | Where-Object { -not $_.Contains('missing') })
  foreach ($c in $changes) {
    $u = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"
    Add-PimLateBackup "gpolnew:$($op.group):$($c.ruleId)" $u $c.before
    $null = Invoke-PimWrite 'PATCH' $u (Resolve-PimPlaceholders (Get-PimRuleBody $c.after))
  }
  return "done ($($changes.Count) rule(s))"
}

# ---- plan / apply ----------------------------------------------------------------------
Show-PimPlan $plan
if ($plan.blocked.Count) { Write-PimBad "blocked — nothing can be applied until the lines marked ✗ are resolved"; if ($Apply) { throw 'blocked plan; nothing was written' }; return }
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimStep "Phase $Phase has nothing to do on $($ctx.TenantName)."; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it. To apply exactly this plan:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
Assert-PimPermissions @($needs | Sort-Object) "phase $Phase"
Confirm-PimApply $plan -Yes:$Yes
$plan.hash = Get-PimPlanHash $plan
Assert-PimPlanMatches $plan $PlanFile
$null = Save-PimBackup $plan $OutDir
$result = Invoke-PimPlan $plan $OutDir $groupPolicyResolver
if ($result.failed) { Write-PimBad 'stopped at the first failure — the operations after it did not run; fix the cause and plan again' }
elseif ($result.deferred) { Write-PimWarn "plan phase $Phase again in a few minutes for the deferred membership policies" }
else {
  $next = @{ Direct = 'People'; People = 'Jobs'; Jobs = 'Retire'; Retire = $null }[$Phase]
  Write-PimStep $(if ($next) { "Phase $Phase done. Verify (see the change plan), then plan phase $next." } else { 'Framework 3.0 is in place. Run 🧬 T48 compare and the demo checks.' })
}
