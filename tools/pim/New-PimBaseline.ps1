<#
.SYNOPSIS
  Plan, then apply, the CloudFellows PIM framework (2.1) in a tenant — the
  groups, their membership policies, their role eligibilities, the people and
  (on request) the role policies — through Microsoft Graph, from the same
  config EasyPIM reads.

.DESCRIPTION
  Input: ENCA's ⬇ Baseline or ⬇ Delta config, tools/pim/pim-baseline*.json,
  or a filled-in sample (tools/pim/samples/easypim.<profile>.jsonc). Comments
  are allowed. "<id of NAME>" is resolved in the tenant; "<EDIT: …>" must be
  replaced first — the script stops while one is left.

  Connection: the Graph connection Connect-Customer.ps1 opened (app-only,
  certificate). Pass -Customer <key> and the script opens it itself; it then
  checks the tenant against Customers.json and the app's Graph permissions.

  WITHOUT -Apply (the default) it only READS, and writes a plan file:
    * Groups: PIM-SG groups to rename from -RenameLegacyPrefix and to create
      (role-assignable, except the approver groups); a name that exists twice
      stops the plan (tools/pim/Find-PimDuplicates.ps1 resolves it); a group
      that should be role-assignable and is not is reported, never "fixed";
    * GroupPolicies: each group's PIM for Groups Member policy against its
      template (GroupMember: active members, at most a year; GroupJIT:
      eligible members) — rule by rule;
    * Eligibilities: each persona group ELIGIBLE for its roles at tenant scope
      (the 2.1 model); an ACTIVE group assignment left from 2.0 is reported;
    * People: Assignments.Groups — active or eligible membership, per person;
    * RolePolicies (only with -Include RolePolicies): each Entra role's policy
      against its tier. Off by default: cloudfellows.dev is edited in the PIM
      portal and the catalog follows the portal.
  It also reports, never changes: users who hold Global Administrator as a
  standing assignment, and accounts whose NAME looks like break-glass.

  WITH -Apply -PlanFile <that file>: the plan is built again from the tenant
  as it is now; if it differs from the approved file in any operation, the run
  stops before the first write. Then the tenant domain is typed to confirm and
  the plan is built and compared ONCE MORE (a prompt can wait for hours); the
  current value of every rule and name that will change is written to a
  backup file (and read back), the operations run in order, the first failure
  stops the rest, every outcome is logged, and the plan is built once more to
  show what is still open.

  IMPACT, before you apply:
    * groups: new, empty; renames keep the object, members and roles;
    * membership policies: from the next assignment/activation on;
    * eligibilities: a group's ACTIVE members can activate the role — under the
      role's own policy (Tier 0: c1 and approval);
    * people: they become members (active) or eligible members (Intune groups);
    * role policies: from the next activation on, for everybody eligible.
    Nothing is ever removed: no assignment, member, group or policy.
  RECOVERY: -RestoreFrom <the backup file> makes a plan that puts every
  backed-up rule and name back (apply it the same way). A created group or
  assignment is removed by hand (portal, after checking it is unused);
  soft-delete of security groups is a preview — do not count on it.

.PARAMETER ConfigFile
  The config (JSON or JSONC). Default: tools/pim/pim-baseline.json.
.PARAMETER Customer
  Customers.json key (e.g. DEVCF): connect through Connect-Customer.ps1 and
  check the tenant.
.PARAMETER ConnectScript
  Path to Connect-Customer.ps1 when it is not on PATH or under ~/REPO.
.PARAMETER TenantId
  Expected tenant (id or verified domain) when not using -Customer.
.PARAMETER Interactive
  Delegated sign-in instead of Connect-Customer (for a tenant not in Customers.json).
.PARAMETER Include
  Groups, GroupPolicies, Eligibilities, People, RolePolicies. Default: all but RolePolicies.
.PARAMETER RenameLegacyPrefix
  Groups named <prefix>… are renamed to PIM-SG-… (default SG-PIM-). '' to skip.
.PARAMETER AlertDomain
  Domain for alert recipients whose domain is not verified in the tenant
  (default: the tenant's default domain).
.PARAMETER OutDir
  Where plan, backup, outcome and resolved files go (default: the current folder).
.PARAMETER WriteResolved
  Also write the config with every "<id of NAME>" the tenant already has
  resolved, comments and _ keys stripped — the file for Invoke-EasyPIMOrchestrator.
.PARAMETER Apply
  Run the plan. Needs -PlanFile.
.PARAMETER PlanFile
  The plan an earlier run without -Apply wrote.
.PARAMETER RestoreFrom
  A backup file: plan putting its values back (apply as usual).
.PARAMETER Yes
  Skip the typed confirmation (automation only).

.EXAMPLE
  .\Connect-Customer.ps1 -Customer DEVCF -Services Graph
  .\New-PimBaseline.ps1 -Customer DEVCF                       # plan the whole framework
  .\New-PimBaseline.ps1 -Customer DEVCF -Apply -PlanFile .\pim-plan.baseline.cloudfellows.dev.20260925-161200.json

.EXAMPLE
  # a customer from a filled-in sample, and the file for EasyPIM
  .\New-PimBaseline.ps1 -ConfigFile .\pim.contoso.jsonc -Customer CONTOSO -WriteResolved .\pim.contoso.resolved.json

.NOTES
  Graph application permissions (Connect-Customer.ps1 -AddGraphScopes adds them):
    plan  : Directory.Read.All, RoleManagement.Read.Directory, RoleManagementPolicy.Read.Directory,
            RoleManagementPolicy.Read.AzureADGroup, PrivilegedEligibilitySchedule.Read.AzureADGroup,
            PrivilegedAssignmentSchedule.Read.AzureADGroup
    apply : Group.ReadWrite.All and RoleManagement.ReadWrite.Directory (groups, role-assignable,
            eligibilities), RoleManagementPolicy.ReadWrite.AzureADGroup (membership policies),
            PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup and
            PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup (people),
            RoleManagementPolicy.ReadWrite.Directory (role policies)
  Only Microsoft.Graph.Authentication is needed (every call is Invoke-MgGraphRequest).
#>
#Requires -Version 7.2
[CmdletBinding()]
param(
  [string]$ConfigFile = (Join-Path $PSScriptRoot 'pim-baseline.json'),
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [ValidateSet('Groups', 'GroupPolicies', 'Eligibilities', 'People', 'RolePolicies')][string[]]$Include = @('Groups', 'GroupPolicies', 'Eligibilities', 'People'),
  [string]$RenameLegacyPrefix = 'SG-PIM-',
  [string]$AlertDomain,
  [string]$OutDir = (Get-Location).Path,
  [string]$WriteResolved,
  [switch]$Apply,
  [string]$PlanFile,
  [string]$RestoreFrom,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }
$GA_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10'
$BREAKGLASS_HINT = '^(BG-|BGA\b|BreakGlass|Break-Glass|EmergencyAccess)'

$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile $(if ($RestoreFrom) { 'restore' } else { 'baseline' }) } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'Group.ReadWrite.All')
if (-not $AlertDomain) { $AlertDomain = $ctx.DefaultDomain }
Assert-PimPermissions @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup') 'planning'

function Get-NameRef($v) { if ("$v" -match '^<id of (.+)>$') { return $Matches[1] }; return $null }
function Test-Guid($v) { return ("$v" -match '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$') }
function Test-RoleAssignableName([string]$n) { return (($n -match '^PIM-SG-') -and ($n -notmatch '(^PIM-SG-Approvers)|(-Approvers$)')) }
function Get-Key($h, [string]$k) { if ($h -is [System.Collections.IDictionary] -and $h.Contains($k)) { return $h[$k] }; return $null }

# ---- restore: a plan from a backup file ------------------------------------------------
function Build-RestorePlan {
  $bk = Read-PimJsonFile $RestoreFrom
  if ($bk['tenantId'] -ne $ctx.TenantId) { throw "The backup is for tenant $($bk['tenantId']); connected to $($ctx.TenantId)." }
  $plan = New-PimPlan 'restore' $RestoreFrom
  foreach ($it in @($bk['items'])) {
    $body = if ($it['before'].Contains('id')) { Get-PimRuleBody $it['before'] } else { $it['before'] }
    # what is there now goes to the backup of this run, so a restore can be undone too
    $cur = $null
    try {
      $cur = if ($it['uri'] -match '/groups/[^/]+$') { $g0 = Invoke-PimGet "$($it['uri'])?`$select=displayName"; [ordered]@{ displayName = $g0['displayName'] } } else { Get-PimRuleBody (Invoke-PimGet $it['uri']) }
    } catch { $plan.blocked.Add("restore $($it['key']): the current value could not be read ($(Get-PimGraphError $_)) — nothing is put back blind"); continue }
    if ((ConvertTo-PimCanonical (Get-PimRuleBody $cur)) -eq (ConvertTo-PimCanonical (Get-PimRuleBody $body))) { continue }
    Add-PimOp $plan "restore:$($it['key'])" 'http' "put back $($it['key']) ($($it['uri']))" ([ordered]@{ method = 'PATCH'; uri = $it['uri']; body = $body; before = $cur })
  }
  return $plan
}

# ---- the baseline plan: reads only ----------------------------------------------------
function Build-BaselinePlan {
  $plan = New-PimPlan 'baseline' $ConfigFile
  $script:RoleIx = $null
  $rawText = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8
  $edits = @([regex]::Matches((Remove-PimJsonComments $rawText), '"<EDIT:[^"]*"') | ForEach-Object { $_.Value } | Sort-Object -Unique)
  if ($edits.Count) { $plan.blocked.Add("The config still has $($edits.Count) EDIT placeholder(s) — replace them first: $($edits -join ', ')"); return $plan }
  $cfg = Read-PimJsonFile $ConfigFile
  $tpl = Get-Key $cfg 'PolicyTemplates'; if (-not $tpl) { $tpl = @{} }
  $settingsOf = {
    param($entry)
    $t = [ordered]@{}
    $name = Get-Key $entry 'Template'
    if ($name -and $tpl.Contains($name)) { foreach ($k in $tpl[$name].Keys) { $t[$k] = $tpl[$name][$k] } }
    foreach ($k in $entry.Keys) { if ($k -ne 'Template') { $t[$k] = $entry[$k] } }
    return $t
  }
  # -- what the config names
  $groupPolicies = Get-Key (Get-Key $cfg 'GroupRoles') 'Policies'; if (-not $groupPolicies) { $groupPolicies = @{} }
  $rolePolicies = Get-Key (Get-Key $cfg 'EntraRoles') 'Policies'; if (-not $rolePolicies) { $rolePolicies = @{} }
  $roleAssign = @(Get-Key (Get-Key $cfg 'Assignments') 'EntraRoles') | Where-Object { $_ }
  $people = @(Get-Key (Get-Key $cfg 'Assignments') 'Groups') | Where-Object { $_ }
  $wanted = New-Object System.Collections.Generic.HashSet[string]
  foreach ($k in $groupPolicies.Keys) { [void]$wanted.Add($k) }
  foreach ($r in $roleAssign) { foreach ($a in @($r['assignments'])) { $n = Get-NameRef $a['principalId']; if (-not $n) { $n = Get-Key $a 'principalName' }; if ($n) { [void]$wanted.Add($n) } } }
  foreach ($b in $people) { $n = Get-NameRef $b['groupId']; if ($n) { [void]$wanted.Add($n) } }
  foreach ($src in @(@($tpl.Values) + @($rolePolicies.Values) + @($groupPolicies.Values | ForEach-Object { Get-Key $_ 'Member' } | Where-Object { $_ }))) { foreach ($a in @(Get-Key $src 'Approvers')) { if ($a -is [System.Collections.IDictionary] -and $a['description'] -and -not (Test-Guid $a['id'])) { [void]$wanted.Add("$($a['description'])") } elseif ($a -is [string] -and $a) { [void]$wanted.Add($a) } } }

  # -- what the tenant has (standard queries: served from the directory itself)
  $groups = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'PIM-SG-')&`$select=id,displayName,isAssignableToRole,createdDateTime&`$top=999" -All)
  $legacy = if ($RenameLegacyPrefix) { @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'$RenameLegacyPrefix')&`$select=id,displayName,isAssignableToRole,createdDateTime&`$top=999" -All) } else { @() }
  $byName = @{}
  foreach ($g in $groups) { if (-not $byName.ContainsKey($g['displayName'])) { $byName[$g['displayName']] = New-Object System.Collections.Generic.List[object] }; $byName[$g['displayName']].Add($g) }
  foreach ($g in $legacy) {
    $new = $g['displayName'] -replace ('^' + [regex]::Escape($RenameLegacyPrefix)), 'PIM-SG-'
    if ($byName.ContainsKey($new)) { $plan.blocked.Add("$($g['displayName']) would be renamed to $new, which already exists ($(@($byName[$new] | ForEach-Object { $_['id'] }) -join ', ')) — resolve by hand"); continue }
    if ($Include -notcontains 'Groups') { $plan.findings.Add("$($g['displayName']) carries the old prefix (Groups not included)"); continue }
    Add-PimOp $plan "rename:$($g['id'])" 'http' "rename $($g['displayName']) → $new (same object, members and roles)" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/groups/$($g['id'])"; body = [ordered]@{ displayName = $new }; before = [ordered]@{ displayName = $g['displayName'] } })
    $byName[$new] = New-Object System.Collections.Generic.List[object]; $byName[$new].Add(@{ id = $g['id']; displayName = $new; isAssignableToRole = $g['isAssignableToRole'] })
  }
  $dups = @($byName.Keys | Where-Object { $byName[$_].Count -gt 1 } | Sort-Object)
  if ($dups.Count) { foreach ($d in $dups) { $plan.blocked.Add("$d exists $($byName[$d].Count) times ($(@($byName[$d] | ForEach-Object { $_['id'] }) -join ', ')) — run .\Find-PimDuplicates.ps1 first") }; return $plan }
  $idOf = @{}
  foreach ($n in $byName.Keys) { $idOf[$n] = $byName[$n][0]['id']; $plan.resolved["group:$n"] = $idOf[$n] }

  # -- groups
  $planned = New-Object System.Collections.Generic.HashSet[string]
  foreach ($n in ($wanted | Sort-Object)) {
    $ra = Test-RoleAssignableName $n
    if ($idOf.ContainsKey($n)) {
      if ($ra -and -not $byName[$n][0]['isAssignableToRole']) { $plan.blocked.Add("$n exists but is NOT role-assignable — the flag cannot be set later; rename it away and plan again") }
      continue
    }
    if ($Include -notcontains 'Groups') { $plan.findings.Add("$n is missing (Groups not included)"); continue }
    $nick = ($n -replace '[^A-Za-z0-9]', '').ToLower()
    $body = [ordered]@{ displayName = $n; mailEnabled = $false; mailNickname = $nick; securityEnabled = $true; groupTypes = @(); description = $(if ($ra) { 'CloudFellows PIM framework 2.1 — role-assignable; PIM for Groups on Member.' } else { 'CloudFellows PIM framework 2.1 — approvers: a plain group, never role-assignable.' }) }
    if ($ra) { $body['isAssignableToRole'] = $true; $body['visibility'] = 'Private' }
    Add-PimOp $plan "group:$n" 'http' "create $(if ($ra) { 'role-assignable ' })group $n" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups"; body = $body; produces = "group:$n" })
    [void]$planned.Add($n)
  }
  # an id, a placeholder an earlier operation of THIS plan produces, or nothing
  $ref = { param($n) if ($idOf.ContainsKey($n)) { $idOf[$n] } elseif ($planned.Contains($n)) { "{{group:$n}}" } else { $null } }
  $approverIds = @{}; foreach ($n in $wanted) { $r0 = & $ref $n; if ($r0) { $approverIds[$n] = $r0 } }
  $approversOk = {
    param([string]$what, $settings)
    $miss = @(Get-PimApproverNames $settings | Where-Object { -not $approverIds.ContainsKey($_) })
    if ($miss.Count) { $plan.blocked.Add("${what}: approver group $($miss -join ', ') does not exist and is not planned (Groups not included?) — nothing could approve"); return $false }
    return $true
  }

  # -- membership policies (PIM for Groups, Member)
  $deferred = New-Object System.Collections.Generic.List[object]
  if ($Include -contains 'GroupPolicies') {
    foreach ($n in ($groupPolicies.Keys | Sort-Object)) {
      $m = Get-Key $groupPolicies[$n] 'Member'; if (-not $m) { continue }
      $settings = & $settingsOf $m
      if (-not (& $approversOk "$n membership policy" $settings)) { continue }
      if (-not $idOf.ContainsKey($n) -and -not $planned.Contains($n)) { $plan.findings.Add("$n does not exist and is not planned — its membership policy is left out"); continue }
      if (-not $idOf.ContainsKey($n)) { $deferred.Add(@{ name = $n; settings = $settings; template = (Get-Key $m 'Template') }); continue }
      $pol = Get-PimGroupMemberPolicy $idOf[$n]
      if (-not $pol) { $deferred.Add(@{ name = $n; settings = $settings; template = (Get-Key $m 'Template') }); continue }
      foreach ($c in (Get-PimRuleChanges -Rules @($pol['rules']) -T $settings -ApproverIds $approverIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains)) {
        if ($c.Contains('missing')) { $plan.findings.Add("$n Member policy has no rule $($c.ruleId) — left as it is"); continue }
        Add-PimOp $plan "gpol:${n}:$($c.ruleId)" 'http' "$n membership policy: $($c.ruleId) → $(Get-Key $m 'Template')" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"; body = (Get-PimRuleBody $c.after); before = $c.before })
      }
    }
  }

  # -- role definitions, role policies, schedules
  $defs = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleDefinitions?`$select=id,displayName,isBuiltIn,templateId" -All)
  # built-in roles by template id first — a renamed role keeps it (PimCommon, Resolve-PimRole)
  $roleIx = New-PimRoleIndex $defs; $script:RoleIx = $roleIx
  $noted = New-Object System.Collections.Generic.HashSet[string]
  $roleOf = {
    param([string]$n)
    $x = Resolve-PimRole $roleIx $n
    if ($x.Contains('problem')) { return $x }
    foreach ($t in $x.notes) { if ($noted.Add($t)) { $plan.findings.Add($t) } }
    return $x
  }
  $rolePol = @{}
  foreach ($a in @(Invoke-PimGet "$GraphUrl/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'&`$expand=policy(`$expand=rules)" -All)) { $rolePol[$a['roleDefinitionId']] = $a['policy'] }
  $eligSched = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleEligibilitySchedules?`$select=id,principalId,roleDefinitionId,directoryScopeId,scheduleInfo" -All)
  $activeSched = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleAssignmentSchedules?`$select=id,principalId,roleDefinitionId,directoryScopeId,assignmentType,scheduleInfo" -All)

  if ($Include -contains 'Eligibilities') {
    foreach ($r in $roleAssign) {
      $rn = "$($r['roleName'])"; $rx = & $roleOf $rn
      if ($rx.Contains('problem')) { $plan.blocked.Add($rx.problem); continue }
      $rid = $rx.id
      foreach ($a in @($r['assignments'])) {
        $gn = Get-NameRef $a['principalId']; if (-not $gn) { $gn = Get-Key $a 'principalName' }
        $gid = if ($gn) { & $ref $gn } elseif (Test-Guid $a['principalId']) { $a['principalId'] } else { $null }
        if (-not $gid -and $gn -and $Include -notcontains 'Groups') { $plan.findings.Add("$rn → ${gn}: left out, the group does not exist (Groups not included)"); continue }
        if (-not $gid) { $plan.blocked.Add("${rn}: principal '$($a['principalId'])' cannot be resolved"); continue }
        if ("$($a['assignmentType'])" -eq 'Active') {
          # 3.0: a job group holds the role ACTIVE, permanently; its eligible members activate the group
          if (@($activeSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['directoryScopeId'])" -eq '/' -and "$($_['assignmentType'])" -ne 'Activated' }).Count) { continue }
          if (@($eligSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['directoryScopeId'])" -eq '/' }).Count) { $plan.findings.Add("$gn is still ELIGIBLE for $rn (2.x) — a job group holds it ACTIVE; remove the eligibility once the active one exists (Set-PimFramework30.ps1 -Phase Retire)") }
          $pol = $rolePol[$rid]
          $arule = if ($pol) { @($pol['rules'] | Where-Object { $_['id'] -eq 'Expiration_Admin_Assignment' })[0] } else { $null }
          if ($arule -and $arule['isExpirationRequired']) { $plan.findings.Add("$rn requires an end date on active assignments — the framework allows permanent active for roles a job group holds: plan with -Include RolePolicies, apply, then plan again; $gn → $rn left out"); continue }
          $just = if (Get-Key $a 'justification') { "$($a['justification'])" } else { "CloudFellows PIM framework 3.0: job group $gn holds $rn" }
          $exp = if (Get-Key $a 'permanent') { [ordered]@{ type = 'noExpiration' } } else { [ordered]@{ type = 'afterDuration'; duration = $(if (Get-Key $a 'duration') { "$($a['duration'])" } else { 'P365D' }) } }
          Add-PimOp $plan "act:${rn}:$gn" 'request' "$gn ACTIVE in $rn at tenant scope ($(if (Get-Key $a 'permanent') { 'permanent' } else { $exp.duration }))" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleAssignmentScheduleRequests"; body = [ordered]@{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = '/'; justification = $just; scheduleInfo = [ordered]@{ expiration = $exp } } })
          continue
        }
        if ("$($a['assignmentType'])" -ne 'Eligible') { $plan.findings.Add("$rn → $gn is '$($a['assignmentType'])' in the config — left out"); continue }
        $has = @($eligSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['directoryScopeId'])" -eq '/' })
        if ($has.Count) { continue }
        $act = @($activeSched | Where-Object { $_['principalId'] -eq $gid -and $_['roleDefinitionId'] -eq $rid -and "$($_['assignmentType'])" -ne 'Activated' })
        if ($act.Count) { $plan.findings.Add("$gn holds $rn ACTIVE (2.0 style) — once the eligibility exists, remove the active assignment by hand") }
        $dur = if (Get-Key $a 'duration') { "$($a['duration'])" } else { 'P365D' }
        $pol = $rolePol[$rid]
        if ($pol) {
          $rule = @($pol['rules'] | Where-Object { $_['id'] -eq 'Expiration_Admin_Eligibility' })[0]
          if ($rule -and $rule['isExpirationRequired'] -and (ConvertTo-PimTimeSpan $rule['maximumDuration']) -lt (ConvertTo-PimTimeSpan $dur)) { $plan.findings.Add("$rn allows eligibility for at most $($rule['maximumDuration']); $gn gets that instead of $dur"); $dur = "$($rule['maximumDuration'])" }
        }
        $exp = if (Get-Key $a 'permanent') { [ordered]@{ type = 'noExpiration' } } else { [ordered]@{ type = 'afterDuration'; duration = $dur } }
        $just = if (Get-Key $a 'justification') { "$($a['justification'])" } else { "CloudFellows PIM framework: $gn carries $rn" }
        Add-PimOp $plan "elig:${rn}:$gn" 'request' "$gn eligible for $rn at tenant scope ($dur)" ([ordered]@{ uri = "$GraphUrl/roleManagement/directory/roleEligibilityScheduleRequests"; body = [ordered]@{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = '/'; justification = $just; scheduleInfo = [ordered]@{ expiration = $exp } } })
      }
    }
  }

  # -- people (Assignments.Groups)
  if ($Include -contains 'People') {
    foreach ($b in $people) {
      $gn = Get-NameRef $b['groupId']
      $gid = if ($gn) { & $ref $gn } elseif (Test-Guid $b['groupId']) { $b['groupId'] } else { $null }
      if (-not $gid -and $gn -and $Include -notcontains 'Groups') { $plan.findings.Add("Assignments.Groups ${gn}: left out, the group does not exist (Groups not included)"); continue }
      if (-not $gn) { $gn = "$gid" }
      if (-not $gid) { $plan.blocked.Add("Assignments.Groups: group '$($b['groupId'])' cannot be resolved"); continue }
      $access = "$($b['roleName'])".ToLower(); if ($access -notin @('member', 'owner')) { $plan.blocked.Add("${gn}: roleName must be Member or Owner"); continue }
      $haveA = @(); $haveE = @()
      if (Test-Guid $gid) {
        $haveA = @(Invoke-PimGet "$GraphUrl/identityGovernance/privilegedAccess/group/assignmentSchedules?`$filter=groupId eq '$gid'" -All)
        $haveE = @(Invoke-PimGet "$GraphUrl/identityGovernance/privilegedAccess/group/eligibilitySchedules?`$filter=groupId eq '$gid'" -All)
      }
      foreach ($a in @($b['assignments'])) {
        $who = "$($a['principalId'])"
        if (-not (Test-Guid $who)) { $plan.blocked.Add("${gn}: principalId '$who' is not an object id"); continue }
        try { $null = Invoke-PimGet "$GraphUrl/directoryObjects/$who`?`$select=id" } catch { $plan.blocked.Add("${gn}: principal $who does not exist in the tenant"); continue }
        $eligible = "$($a['assignmentType'])" -eq 'Eligible'
        $set = if ($eligible) { $haveE } else { $haveA }
        if (@($set | Where-Object { $_['principalId'] -eq $who -and "$($_['accessId'])" -eq $access }).Count) { continue }
        $dur = if (Get-Key $a 'duration') { "$($a['duration'])" } else { 'P365D' }
        $exp = if (Get-Key $a 'permanent') { [ordered]@{ type = 'noExpiration' } } else { [ordered]@{ type = 'afterDuration'; duration = $dur } }
        $kind = if ($eligible) { 'eligibilityScheduleRequests' } else { 'assignmentScheduleRequests' }
        $just = if (Get-Key $a 'justification') { "$($a['justification'])" } else { "CloudFellows PIM framework: $gn" }
        Add-PimOp $plan "person:${gn}:${access}:$who" 'request' "$who $(if ($eligible) { 'eligible' } else { 'active' }) $access of $gn ($dur)" ([ordered]@{ uri = "$GraphUrl/identityGovernance/privilegedAccess/group/$kind"; body = [ordered]@{ accessId = $access; principalId = $who; groupId = $gid; action = 'adminAssign'; justification = $just; scheduleInfo = [ordered]@{ expiration = $exp } } })
      }
    }
  }

  # -- role policies (opt-in)
  if ($Include -contains 'RolePolicies') {
    foreach ($rn in ($rolePolicies.Keys | Sort-Object)) {
      $rx = & $roleOf $rn
      if ($rx.Contains('problem')) { $plan.blocked.Add("role policy — $($rx.problem)"); continue }
      $rid = $rx.id
      $pol = $rolePol[$rid]; if (-not $pol) { $plan.findings.Add("role policy '$rn' was not read — left out"); continue }
      $settings = & $settingsOf $rolePolicies[$rn]
      if (-not (& $approversOk "role policy $rn" $settings)) { continue }
      foreach ($c in (Get-PimRuleChanges -Rules @($pol['rules']) -T $settings -ApproverIds $approverIds -AlertDomain $AlertDomain -VerifiedDomains $ctx.Domains)) {
        if ($c.Contains('missing')) { $plan.findings.Add("$rn policy has no rule $($c.ruleId)"); continue }
        Add-PimOp $plan "rpol:${rn}:$($c.ruleId)" 'http' "$rn policy: $($c.ruleId) → $(Get-Key $rolePolicies[$rn] 'Template')" ([ordered]@{ method = 'PATCH'; uri = "$GraphUrl/policies/roleManagementPolicies/$($pol['id'])/rules/$($c.ruleId)"; body = (Get-PimRuleBody $c.after); before = $c.before })
      }
    }
  }
  # membership policies of groups that are new (or not in PIM for Groups yet) come last
  foreach ($d in $deferred) { Add-PimOp $plan "gpolnew:$($d.name)" 'groupPolicy' "$($d.name) membership policy → $($d.template) (once the group is in PIM for Groups)" ([ordered]@{ group = $d.name; settings = $d.settings }) }

  # -- findings, never changes
  $gx = Resolve-PimRole $roleIx 'Global Administrator'
  $ga = if ($gx.Contains('problem')) { $null } else { $gx.id }
  if ($ga) {
    $st = @(Invoke-PimGet "$GraphUrl/roleManagement/directory/roleAssignmentScheduleInstances?`$filter=roleDefinitionId eq '$ga' and assignmentType eq 'Assigned'&`$expand=principal" -All)
    foreach ($s in $st) {
      $p = $s['principal']; if (-not $p -or "$($p['@odata.type'])" -ne '#microsoft.graph.user') { continue }
      $name = "$($p['displayName']) ($($p['userPrincipalName']))"
      $hint = if ("$($p['displayName'])" -match $BREAKGLASS_HINT -or "$($p['userPrincipalName'])" -match $BREAKGLASS_HINT) { ' — looks like break-glass by NAME: confirm, and list it by id' } else { ' — the framework makes Global Administrator eligible through PIM-SG-M365-GlobalAdmin; review by hand' }
      $plan.findings.Add("standing Global Administrator: $name, object id $($p['id'])$hint")
    }
  }
  return $plan
}

# ---- the group-policy step of a new group, at apply time --------------------------------
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

# ---- the resolved config for EasyPIM ------------------------------------------------------
function Write-ResolvedConfig($plan) {
  $raw = Remove-PimJsonComments (Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8)
  $open = New-Object System.Collections.Generic.List[string]
  $txt = [regex]::Replace($raw, '<id of ([^>"]+)>', { param($m) $k = "group:$($m.Groups[1].Value)"; if ($plan.resolved.Contains($k)) { $plan.resolved[$k] } else { $open.Add($m.Groups[1].Value); $m.Value } })
  $txt = [regex]::Replace($txt, '"([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})"', { param($m) if ($ctx.Domains -contains $m.Groups[2].Value.ToLower()) { $m.Value } else { '"' + $m.Groups[1].Value + '@' + $AlertDomain + '"' } })
  $o = $txt | ConvertFrom-Json -AsHashtable -Depth 64
  foreach ($k in @($o.Keys | Where-Object { $_ -like '_*' })) { $o.Remove($k) }
  # EasyPIM looks roles up by display name: give it the name this tenant uses
  $renamed = [ordered]@{}
  $tenantNameOf = { param([string]$n) if (-not $script:RoleIx) { return $n }; $x = Resolve-PimRole $script:RoleIx $n; if ($x.Contains('problem')) { return $n }; if ($x.tenantName -ne $n) { $renamed[$n] = $x.tenantName }; return $x.tenantName }
  foreach ($r in @(Get-Key (Get-Key $o 'Assignments') 'EntraRoles')) { if ($r -is [System.Collections.IDictionary] -and $r.Contains('roleName')) { $r['roleName'] = & $tenantNameOf "$($r['roleName'])" } }
  $rp = Get-Key (Get-Key $o 'EntraRoles') 'Policies'
  if ($rp -is [System.Collections.IDictionary]) { foreach ($k in @($rp.Keys)) { $t = & $tenantNameOf "$k"; if ($t -ne $k) { $v = $rp[$k]; $rp.Remove($k); $rp[$t] = $v } } }
  foreach ($k in $renamed.Keys) { Write-PimOk "EasyPIM name: $k → $($renamed[$k]) (what this tenant calls it)" }
  ($o | ConvertTo-Json -Depth 64) | Set-Content -LiteralPath $WriteResolved -Encoding UTF8
  $u = @($open | Sort-Object -Unique)
  if ($u.Count) { Write-PimWarn "resolved config written, but $($u.Count) group(s) do not exist yet ($($u -join ', ')) — apply the plan, then write it again" }
  else { Write-PimOk "resolved config for EasyPIM: $WriteResolved (Invoke-EasyPIMOrchestrator -ConfigFilePath $WriteResolved -TenantId $($ctx.TenantId) -Mode delta -WhatIf)" }
}

# ---- run ----------------------------------------------------------------------------------
$build = if ($RestoreFrom) { { Build-RestorePlan } } else { { Build-BaselinePlan } }
Write-PimStep "Reading $(if ($RestoreFrom) { $RestoreFrom } else { $ConfigFile })"
$plan = & $build
Show-PimPlan $plan
if ($plan.blocked.Count) { throw "$($plan.blocked.Count) blocking problem(s) above — no plan written, nothing written." }
if ($WriteResolved -and -not $RestoreFrom) { Write-ResolvedConfig $plan }
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimOk "nothing to do: the tenant carries what the config says"; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it. To apply exactly this plan:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
$needs = New-Object System.Collections.Generic.HashSet[string]
foreach ($o in $plan.ops) {
  switch -Wildcard ($o.key) {
    'rename:*' { [void]$needs.Add('Group.ReadWrite.All') }
    'group:*' { [void]$needs.Add('Group.ReadWrite.All'); [void]$needs.Add('RoleManagement.ReadWrite.Directory') }
    'gpol*' { [void]$needs.Add('RoleManagementPolicy.ReadWrite.AzureADGroup') }
    'elig:*' { [void]$needs.Add('RoleManagement.ReadWrite.Directory') }
    'person:*' { [void]$needs.Add('PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup'); [void]$needs.Add('PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup') }
    'rpol:*' { [void]$needs.Add('RoleManagementPolicy.ReadWrite.Directory') }
    'restore:*' { [void]$needs.Add('RoleManagementPolicy.ReadWrite.Directory'); [void]$needs.Add('RoleManagementPolicy.ReadWrite.AzureADGroup'); [void]$needs.Add('Group.ReadWrite.All') }
  }
}
Assert-PimPermissions @($needs) 'this plan'
Confirm-PimApply $plan -Yes:$Yes
# the tenant is read again AFTER the confirmation: a prompt can wait for hours
Write-PimStep 'Checking the plan against the tenant once more'
$plan = & $build
if ($plan.blocked.Count) { Show-PimPlan $plan; throw "$($plan.blocked.Count) blocking problem(s) appeared since the plan — nothing written." }
Assert-PimPlanMatches $plan $PlanFile
$plan.hash = Get-PimPlanHash $plan
$null = Save-PimBackup $plan $OutDir
$result = Invoke-PimPlan $plan $OutDir $groupPolicyResolver
Write-PimStep "Reading the tenant again"
if (-not $Yes) { Start-Sleep -Seconds 5 }
$after = & $build
if (-not $after.ops.Count) { Write-PimOk "verified: planning again finds nothing left to do" }
else { Write-PimWarn "$($after.ops.Count) operation(s) still open — new schedules can take a minute to show; plan again: $(@($after.ops | ForEach-Object { $_.summary }) -join '; ')" }
if ($result.failed) { throw "$($result.failed) operation(s) failed — see $($result.file)" }
if ($result.deferred) { throw "$($result.deferred) membership polic(ies) deferred: the new groups were not in PIM for Groups yet. Plan again in a few minutes and apply that plan — see $($result.file)" }
