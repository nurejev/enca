<#
.SYNOPSIS
  Find framework groups that exist more than once under one name, show what
  uses each copy, and plan the deletion of the copies nothing uses — then,
  with an approved plan, delete exactly those.

.DESCRIPTION
  An earlier script version could create a group twice (a read served from
  the search index a minute behind a creation). New-PimBaseline.ps1 and
  New-PimRegions.ps1 now stop while a name they need exists twice; this
  script resolves it.

  WITHOUT -Apply (the default) it only READS. For every name under -Prefix
  that exists more than once it reads, per copy:
    members and owners; PIM for Groups schedules on the copy (active and
    eligible members/owners) and of the copy (the copy as a member of
    another group); directory role assignments and eligibilities held by the
    copy; app role assignments; memberships in other groups; Conditional
    Access policies that include or exclude it; approval rules (directory
    roles, and every framework group's membership policy) that name it as
    approver; Intune role assignments and scope-tag assignments that use it.
  A copy with ANY reference is never deleted. A read that fails makes the copy
  "unknown" — never deleted either. Per name:
    * exactly one copy in use → keep it, plan the others for deletion;
    * no copy in use → keep the OLDEST, plan the others;
    * several copies in use → nothing is planned: merge by hand (the report
      lists what uses each copy).
  Graph cannot see Azure RBAC, nor Intune policy and app assignments: copies
  of PIM-SG-AZ-* groups are only planned with -AzureChecked, copies of
  INT-SG-* and PIM-SG-INT-* groups only with -IntuneChecked — after you
  checked them yourself (the report prints how).

  WITH -Apply -PlanFile <that file>: the references are read again; if
  anything changed (a copy gained a member, a copy is gone) the run stops
  before the first deletion. Then the tenant domain is typed to confirm, the
  references are read once more, and every copy is checked again right before
  its own deletion (one that gained anything is not deleted); the deletions
  run in order, the first failure stops the rest, and every outcome is logged. Deleted security groups are not reliably restorable (soft-delete
  of security groups is a preview): the plan file records what was deleted.

.PARAMETER Customer
  Customers.json key (e.g. DEVCF): connect through Connect-Customer.ps1 and check the tenant.
.PARAMETER ConnectScript
  Path to Connect-Customer.ps1 when it is not on PATH or under ~/REPO.
.PARAMETER TenantId
  Expected tenant (id or verified domain) when not using -Customer.
.PARAMETER Interactive
  Delegated sign-in instead of Connect-Customer.
.PARAMETER Prefix
  Name prefixes to look at. Default: PIM-SG-, INT-SG-, SG-PIM-.
.PARAMETER Name
  Only these exact names.
.PARAMETER AzureChecked
  You checked that the PIM-SG-AZ-* copies planned for deletion hold no Azure
  role assignment (az role assignment list --assignee <id> --all).
.PARAMETER IntuneChecked
  You checked that the INT-SG-* / PIM-SG-INT-* copies planned for deletion are
  not assigned any Intune policy, app or profile.
.PARAMETER OutDir
  Where plan and outcome files go (default: the current folder).
.PARAMETER Apply
  Run the plan. Needs -PlanFile.
.PARAMETER PlanFile
  The plan an earlier run without -Apply wrote.
.PARAMETER Yes
  Skip the typed confirmation (automation only).

.EXAMPLE
  .\Connect-Customer.ps1 -Customer DEVCF -Services Graph
  .\tools\pim\Find-PimDuplicates.ps1 -Customer DEVCF
  .\tools\pim\Find-PimDuplicates.ps1 -Customer DEVCF -Apply -PlanFile .\pim-plan.duplicates.cloudfellows.dev.20260925-160000.json

.NOTES
  Graph application permissions (Connect-Customer.ps1 -AddGraphScopes adds them):
    plan  : Directory.Read.All, RoleManagement.Read.Directory, RoleManagementPolicy.Read.Directory,
            RoleManagementPolicy.Read.AzureADGroup, PrivilegedEligibilitySchedule.Read.AzureADGroup,
            PrivilegedAssignmentSchedule.Read.AzureADGroup, Policy.Read.All,
            DeviceManagementRBAC.Read.All (when Intune groups are involved)
    apply : Group.ReadWrite.All, RoleManagement.ReadWrite.Directory (role-assignable copies)
#>
#Requires -Version 7.2
[CmdletBinding()]
param(
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string[]]$Prefix = @('PIM-SG-', 'INT-SG-', 'SG-PIM-'),
  [string[]]$Name,
  [switch]$AzureChecked,
  [switch]$IntuneChecked,
  [string]$OutDir = (Get-Location).Path,
  [switch]$Apply,
  [string]$PlanFile,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$BetaUrl = 'https://graph.microsoft.com/beta'
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }

$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile 'duplicates' } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup', 'Policy.Read.All', 'DeviceManagementRBAC.Read.All', 'Group.ReadWrite.All')
Assert-PimPermissions @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup', 'Policy.Read.All') 'reading what uses each copy'

function Format-PimDate($v) { if ($v -is [datetime]) { return $v.ToUniversalTime().ToString('yyyy-MM-dd HH:mm') + ' UTC' }; if ("$v" -match '^\d{4}-\d\d-\d\dT\d\d:\d\d') { return ("$v".Substring(0, 16) -replace 'T', ' ') + ' UTC' }; return "$v" }
function Get-Key($h, [string]$k) { if ($h -is [System.Collections.IDictionary] -and $h.Contains($k)) { return $h[$k] }; return $null }
function Get-Esc([string]$s) { return $s.Replace("'", "''") }
function Test-IntuneName([string]$n) { return ($n -match '^(INT-SG-|PIM-SG-INT-|SG-PIM-INT-)') }
function Test-ApproverName([string]$n) { return ($n -match 'Approvers') }
# The references a copy carries that can be read per group. Used when planning
# and again right before the copy is deleted.
function Get-CopyRefs([string]$id) {
  $refs = New-Object System.Collections.Generic.List[string]; $unknown = New-Object System.Collections.Generic.List[string]
  $count = {
    param([string]$what, [string]$uri)
    try { $v = @(Invoke-PimGet $uri -All); if ($v.Count) { $refs.Add("$($v.Count) $what") } }
    catch { $unknown.Add("$what (not readable: $(Get-PimGraphError $_))") }
  }
  & $count 'member(s)' "$GraphUrl/groups/$id/members?`$select=id&`$top=999"
  & $count 'owner(s)' "$GraphUrl/groups/$id/owners?`$select=id&`$top=999"
  & $count 'PIM for Groups active member/owner schedule(s)' "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentSchedules?`$filter=groupId eq '$id'"
  & $count 'PIM for Groups eligible member/owner schedule(s)' "$GraphUrl/identityGovernance/privilegedAccess/group/eligibilitySchedules?`$filter=groupId eq '$id'"
  & $count 'PIM for Groups schedule(s) as a member of another group (active)' "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentSchedules?`$filter=principalId eq '$id'"
  & $count 'PIM for Groups schedule(s) as a member of another group (eligible)' "$GraphUrl/identityGovernance/privilegedAccess/group/eligibilitySchedules?`$filter=principalId eq '$id'"
  & $count 'app role assignment(s)' "$GraphUrl/groups/$id/appRoleAssignments?`$select=id"
  & $count 'membership(s) of other groups or units' "$GraphUrl/groups/$id/memberOf?`$select=id"
  & $count 'directory role eligibility schedule(s)' "$GraphUrl/roleManagement/directory/roleEligibilitySchedules?`$filter=principalId eq '$id'"
  & $count 'directory role assignment schedule(s)' "$GraphUrl/roleManagement/directory/roleAssignmentSchedules?`$filter=principalId eq '$id'"
  return @{ refs = $refs; unknown = $unknown }
}
function Test-AzureName([string]$n) { return ($n -match '^(PIM-SG-AZ-|SG-PIM-AZ-)') }

function Build-DuplicatesPlan {
  $plan = New-PimPlan 'duplicates' $null
  # -- every group under the prefixes (standard queries: served from the directory itself)
  $all = New-Object System.Collections.Generic.List[object]
  foreach ($p in $Prefix) {
    foreach ($g in @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'$(Get-Esc $p)')&`$select=id,displayName,createdDateTime,isAssignableToRole,groupTypes,membershipRule&`$top=999" -All)) {
      if (-not @($all | Where-Object { $_['id'] -eq $g['id'] }).Count) { $all.Add($g) }
    }
  }
  $byName = @{}
  foreach ($g in $all) { $k = "$($g['displayName'])"; if ($Name -and $Name -notcontains $k) { continue }; if (-not $byName.ContainsKey($k)) { $byName[$k] = New-Object System.Collections.Generic.List[object] }; $byName[$k].Add($g) }
  $dupNames = @($byName.Keys | Where-Object { $byName[$_].Count -gt 1 } | Sort-Object)
  Write-PimOk ("{0} framework groups read; {1} name(s) exist more than once" -f $all.Count, $dupNames.Count)
  if (-not $dupNames.Count) { return $plan }

  # -- the tenant-wide reference sources, read once
  $ca = @(Invoke-PimGet "$GraphUrl/identity/conditionalAccess/policies?`$select=id,displayName,conditions" -All)
  $approverRefs = @{}   # group id → where it is named as approver
  $addApprover = {
    param($pol, [string]$where)
    foreach ($r in @($pol['rules'])) {
      if ("$($r['id'])" -notlike 'Approval_*') { continue }
      foreach ($st in @($r['setting']['approvalStages'])) {
        if (-not $st) { continue }
        foreach ($ap in @($st['primaryApprovers']) + @($st['escalationApprovers'])) {
          if ($ap -and $ap['groupId']) { $gid = "$($ap['groupId'])"; if (-not $approverRefs.ContainsKey($gid)) { $approverRefs[$gid] = New-Object System.Collections.Generic.List[string] }; if (-not $approverRefs[$gid].Contains($where)) { $approverRefs[$gid].Add($where) } }
        }
      }
    }
  }
  $defs = @{}; foreach ($d in @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleDefinitions?`$select=id,displayName" -All)) { $defs[$d['id']] = $d['displayName'] }
  foreach ($a in @(Invoke-PimGet "$GraphUrl/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'&`$expand=policy(`$expand=rules)" -All)) { & $addApprover $a['policy'] "approver in the policy of $($defs[$a['roleDefinitionId']])" }
  $groupPolicyUnread = New-Object System.Collections.Generic.List[string]
  foreach ($g in $all) {
    if (-not $g['isAssignableToRole']) { continue }
    try {
      $pol = Get-PimGroupPolicy $g['id'] 'member'; if ($pol) { & $addApprover $pol "approver in the membership policy of $($g['displayName'])" }
      $pol = Get-PimGroupPolicy $g['id'] 'owner'; if ($pol) { & $addApprover $pol "approver in the ownership policy of $($g['displayName'])" }
    } catch { $groupPolicyUnread.Add("$($g['displayName'])") }
  }
  if ($groupPolicyUnread.Count) { $plan.findings.Add("membership policies not readable for $($groupPolicyUnread.Count) group(s) ($($groupPolicyUnread -join ', ')) — approver references there are unknown, so no copy is deleted") }
  # Intune RBAC can name any group (members, resource scopes, scope members, tag
  # auto-assignment), so it is read whenever there is a duplicate. A failed read
  # makes Intune references unknown for every copy — unless -IntuneChecked says
  # there is no Intune, or it was checked by hand.
  $intune = $null; $intuneErr = $null
  try {
    $intune = @{ assign = New-Object System.Collections.Generic.List[object]; tagTargets = @{}; oddTags = New-Object System.Collections.Generic.List[string] }
    foreach ($a in @(Invoke-PimGet "$BetaUrl/deviceManagement/roleAssignments" -All)) { $intune.assign.Add((Invoke-PimGet "$BetaUrl/deviceManagement/roleAssignments/$($a['id'])")) }
    foreach ($t in @(Invoke-PimGet "$BetaUrl/deviceManagement/roleScopeTags" -All)) {
      $ids = New-Object System.Collections.Generic.List[string]
      foreach ($x in @(Invoke-PimGet "$BetaUrl/deviceManagement/roleScopeTags/$($t['id'])/assignments" -All)) {
        $tg = $x['target']; $tid0 = if ($tg -and $tg.Contains('entraObjectId') -and $tg['entraObjectId']) { $tg['entraObjectId'] } elseif ($tg -and $tg.Contains('groupId') -and $tg['groupId']) { $tg['groupId'] } else { $null }
        if ($tid0) { $ids.Add("$tid0") } else { $intune.oddTags.Add("$($t['displayName'])") }
      }
      $intune.tagTargets[$t['id']] = @{ name = "$($t['displayName'])"; ids = $ids.ToArray() }
    }
  } catch { $intuneErr = Get-PimGraphError $_; $intune = $null }
  if ($intuneErr) { $plan.findings.Add("Intune could not be read ($intuneErr) — Intune references are unknown for every copy$(if ($IntuneChecked) { '; -IntuneChecked says you checked' } else { ', so nothing is deleted; a tenant without Intune: run with -IntuneChecked' })") }
  if ($intune -and $intune.oddTags.Count) { $plan.findings.Add("Intune scope tag(s) $(@($intune.oddTags | Sort-Object -Unique) -join ', ') carry an auto-assignment target this script cannot identify — Intune references are unknown for every copy") }

  foreach ($n in $dupNames) {
    $copies = @($byName[$n] | Sort-Object { $v = $_['createdDateTime']; if ($v -is [datetime]) { $v.ToUniversalTime() } else { try { ([datetime]"$v").ToUniversalTime() } catch { [datetime]::MaxValue } } }, { "$($_['id'])" })
    $info = New-Object System.Collections.Generic.List[object]
    foreach ($c in $copies) {
      $id = $c['id']
      $cr = Get-CopyRefs $id; $refs = $cr.refs; $unknown = $cr.unknown
      foreach ($p in $ca) {
        $u = $p['conditions']['users']
        if ($u -and ((@($u['includeGroups']) -contains $id) -or (@($u['excludeGroups']) -contains $id))) { $refs.Add("Conditional Access: $($p['displayName'])") }
      }
      if ($approverRefs.ContainsKey($id)) { foreach ($w in $approverRefs[$id]) { $refs.Add($w) } }
      if ($groupPolicyUnread.Count) { $unknown.Add('approver references (a membership policy was not readable)') }
      if ($intune) {
        foreach ($a in $intune.assign) {
          if (@($a['members']) -contains $id -or @($a['resourceScopes']) -contains $id -or @(Get-Key $a 'scopeMembers') -contains $id) { $refs.Add("Intune role assignment $($a['displayName'])") }
        }
        foreach ($t in $intune.tagTargets.Values) { if (@($t.ids) -contains $id) { $refs.Add("Intune scope tag $($t.name) (auto-assignment)") } }
        if ($intune.oddTags.Count) { $unknown.Add('Intune scope-tag targets (a target kind this script cannot identify)') }
      } elseif (-not $IntuneChecked) { $unknown.Add('Intune role and scope-tag assignments (Intune could not be read)') }
      if ((Test-IntuneName $n) -and -not $IntuneChecked) { $unknown.Add('Intune policy, app and profile assignments (not readable here: check in Intune, then -IntuneChecked)') }
      if ((Test-ApproverName $n) -and -not $AzureChecked) { $unknown.Add("approver references in Azure resource role settings and in PIM for Groups policies of groups outside $($Prefix -join ', ') (not read: check them, then -AzureChecked)") }
      if ((Test-AzureName $n) -and -not $AzureChecked) { $unknown.Add("Azure role assignments (not readable here: az role assignment list --assignee $id --all, then -AzureChecked)") }
      $info.Add([ordered]@{ id = $id; created = (Format-PimDate $c['createdDateTime']); roleAssignable = [bool]$c['isAssignableToRole']; refs = $refs.ToArray(); unknown = $unknown.ToArray() })
    }
    $used = @($info | Where-Object { $_.refs.Count })
    $keep = if ($used.Count -eq 1) { $used[0] } elseif (-not $used.Count) { $info[0] } else { $null }
    $lines = @($info | ForEach-Object { "    $($_.id) created $($_.created)$(if ($keep -and $_.id -eq $keep.id) { ' — KEEP' }): $(if ($_.refs.Count) { $_.refs -join '; ' } else { 'nothing uses it' })$(if ($_.unknown.Count) { ' · unknown: ' + ($_.unknown -join '; ') })" })
    if (-not $keep) { $plan.findings.Add("$n exists $($info.Count) times and $($used.Count) copies are in use — nothing planned; merge by hand (move what uses one copy to the other), then run again:`n$($lines -join "`n")"); continue }
    $plan.findings.Add("$n exists $($info.Count) times:`n$($lines -join "`n")")
    foreach ($x in $info) {
      if ($x.id -eq $keep.id) { continue }
      if ($x.refs.Count) { continue }
      if ($x.unknown.Count) { $plan.findings.Add("${n}: copy $($x.id) is not planned — unknown: $($x.unknown -join '; ')"); continue }
      $needs = @('Group.ReadWrite.All'); if ($x.roleAssignable) { $needs += 'RoleManagement.ReadWrite.Directory' }
      Add-PimOp $plan "delete:$($x.id)" 'deleteGroup' "delete copy $($x.id) of $n (created $($x.created); nothing uses it — $($keep.id) is kept)" ([ordered]@{ groupId = $x.id; uri = "$GraphUrl/groups/$($x.id)"; needs = $needs; deleted = [ordered]@{ id = $x.id; displayName = $n; createdDateTime = $x.created; isAssignableToRole = $x.roleAssignable } })
    }
  }
  return $plan
}

# ---- run ------------------------------------------------------------------------------
Write-PimStep "Looking for framework groups that exist more than once ($($Prefix -join ', '))"
$plan = Build-DuplicatesPlan
Show-PimPlan $plan
if ($plan.blocked.Count) { throw "$($plan.blocked.Count) blocking problem(s) above — no plan written, nothing written." }
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimOk 'nothing to delete'; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it — every copy it deletes and what the kept copy carries. To delete exactly these:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
$needs = New-Object System.Collections.Generic.HashSet[string]
foreach ($o in $plan.ops) { foreach ($p in @($o.needs)) { if ($p) { [void]$needs.Add($p) } } }
Assert-PimPermissions @($needs) 'deleting the copies'
Confirm-PimApply $plan -Yes:$Yes
# the tenant is read again AFTER the confirmation, and each copy once more
# right before its deletion: a copy that gained anything is not deleted
Write-PimStep 'Checking the plan against the tenant once more'
$plan = Build-DuplicatesPlan
if ($plan.blocked.Count) { Show-PimPlan $plan; throw "$($plan.blocked.Count) blocking problem(s) appeared since the plan — nothing deleted." }
Assert-PimPlanMatches $plan $PlanFile
$plan.hash = Get-PimPlanHash $plan
$guardedDelete = {
  param($op)
  if ($op.kind -ne 'deleteGroup') { throw "unknown op kind $($op.kind)" }
  $cr = Get-CopyRefs $op.groupId
  if ($cr.refs.Count -or $cr.unknown.Count) { throw "copy $($op.groupId) is not deleted: since the plan it has $(@($cr.refs) + @($cr.unknown) -join '; ')" }
  $null = Invoke-PimWrite 'DELETE' $op.uri $null
  return 'done'
}
$result = Invoke-PimPlan $plan $OutDir $guardedDelete
$after = Build-DuplicatesPlan
if (-not $after.ops.Count) { Write-PimOk 'verified: nothing left to delete' } else { Write-PimWarn "$($after.ops.Count) deletion(s) still open: $(@($after.ops | ForEach-Object { $_.summary }) -join '; ')" }
if ($result.failed) { throw "$($result.failed) deletion(s) failed — see $($result.file)" }
