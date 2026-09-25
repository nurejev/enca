# A fake Microsoft Graph for the tools/pim scripts: an in-memory tenant served
# through Invoke-MgGraphRequest, every call recorded. Dot-source it, then call
# New-FakeTenant; the scripts run unchanged against it.
# Used by tools/pim/tests/Test-PimScripts.ps1 — no network, no module needed.

$global:FakeCalls = New-Object System.Collections.Generic.List[object]
$global:FakeFail = @{}     # uri regex → message: a GET matching it throws (403 simulation)

function New-FakeRules([hashtable]$o = @{}) {
  $d = @{ act = 'PT8H'; en = @('MultiFactorAuthentication', 'Justification'); ctx = $false; appr = $false; permE = $true; maxE = 'P365D'; permA = $true; maxA = 'P180D'; lvl = 'All'; rec = @() }
  foreach ($k in $o.Keys) { $d[$k] = $o[$k] }
  $t = { param($caller, $level) @{ caller = $caller; operations = @('All'); level = $level; inheritableSettings = @(); enforcedSettings = @() } }
  return @(
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_EndUser_Assignment'; isExpirationRequired = $true; maximumDuration = $d.act; target = (& $t 'EndUser' 'Assignment') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyEnablementRule'; id = 'Enablement_EndUser_Assignment'; enabledRules = $d.en; target = (& $t 'EndUser' 'Assignment') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyAuthenticationContextRule'; id = 'AuthenticationContext_EndUser_Assignment'; isEnabled = $d.ctx; claimValue = $null; target = (& $t 'EndUser' 'Assignment') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyApprovalRule'; id = 'Approval_EndUser_Assignment'; target = (& $t 'EndUser' 'Assignment'); setting = @{ isApprovalRequired = $d.appr; isApprovalRequiredForExtension = $false; isRequestorJustificationRequired = $true; approvalMode = 'SingleStage'; approvalStages = @(@{ approvalStageTimeOutInDays = 1; isApproverJustificationRequired = $true; escalationTimeInMinutes = 0; primaryApprovers = @(); isEscalationEnabled = $false; escalationApprovers = @() }) } },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_Admin_Eligibility'; isExpirationRequired = -not $d.permE; maximumDuration = $d.maxE; target = (& $t 'Admin' 'Eligibility') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_Admin_Assignment'; isExpirationRequired = -not $d.permA; maximumDuration = $d.maxA; target = (& $t 'Admin' 'Assignment') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyNotificationRule'; id = 'Notification_Admin_Admin_Eligibility'; notificationType = 'Email'; recipientType = 'Admin'; notificationLevel = $d.lvl; isDefaultRecipientsEnabled = $true; notificationRecipients = $d.rec; target = (& $t 'Admin' 'Eligibility') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyNotificationRule'; id = 'Notification_Admin_Admin_Assignment'; notificationType = 'Email'; recipientType = 'Admin'; notificationLevel = $d.lvl; isDefaultRecipientsEnabled = $true; notificationRecipients = $d.rec; target = (& $t 'Admin' 'Assignment') },
    @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyNotificationRule'; id = 'Notification_Admin_EndUser_Assignment'; notificationType = 'Email'; recipientType = 'Admin'; notificationLevel = $d.lvl; isDefaultRecipientsEnabled = $true; notificationRecipients = $d.rec; target = (& $t 'EndUser' 'Assignment') }
  )
}

function New-FakeTenant {
  param([string[]]$Scopes, [string[]]$RoleNames, [switch]$NoIntune)
  $script:n = 0
  $roles = @(foreach ($r in $RoleNames) { $script:n++; @{ id = ('{0:x8}-0000-0000-0000-{1:x12}' -f 0x10000000, $script:n); displayName = $r; isBuiltIn = $true; templateId = $null } })
  $ga = $roles | Where-Object { $_.displayName -eq 'Global Administrator' }
  if ($ga) { $ga.id = '62e90394-69f5-4237-9190-012177145e10' }
  $global:Fake = @{
    org = @{ id = '11111111-1111-1111-1111-111111111111'; displayName = 'Fake Tenant'; verifiedDomains = @(@{ name = 'fake.dev'; isDefault = $true }, @{ name = 'fake.onmicrosoft.com'; isDefault = $false }) }
    scopes = $Scopes; groups = New-Object System.Collections.Generic.List[object]; aus = New-Object System.Collections.Generic.List[object]
    users = @{ 'aaaaaaaa-0000-0000-0000-000000000001' = 'adm-anna'; 'aaaaaaaa-0000-0000-0000-000000000002' = 'adm-joey'; 'aaaaaaaa-0000-0000-0000-000000000003' = 'BGA CF DEV'; 'aaaaaaaa-0000-0000-0000-000000000004' = 'approver.a'; 'aaaaaaaa-0000-0000-0000-000000000005' = 'approver.b' }
    roles = $roles; rolePolicies = @{}; groupPolicies = @{}; elig = New-Object System.Collections.Generic.List[object]; active = New-Object System.Collections.Generic.List[object]
    pgA = New-Object System.Collections.Generic.List[object]; pgE = New-Object System.Collections.Generic.List[object]
    members = @{}; owners = @{}; approverRefs = @{}; caRefs = @{}; appRoleRefs = @{}
    intune = @{ on = -not $NoIntune; roles = New-Object System.Collections.Generic.List[object]; tags = New-Object System.Collections.Generic.List[object]; tagAssign = @{}; assignments = New-Object System.Collections.Generic.List[object]; ops = @() }
    seq = 0
  }
  foreach ($r in $roles) { $global:Fake.rolePolicies[$r.id] = @{ id = "pol-$($r.id)"; rules = (New-FakeRules) } }
  foreach ($b in @('Help Desk Operator', 'Policy and Profile Manager', 'Application Manager', 'Endpoint Security Manager', 'Read Only Operator')) { $global:Fake.intune.roles.Add(@{ id = "ir-$($b -replace ' ','')"; displayName = $b; isBuiltIn = $true; allowed = @() }) }
  $global:Fake.intune.ops = @('Microsoft.Intune_ManagedDevices_Read', 'Microsoft.Intune_ManagedDevices_Update', 'Microsoft.Intune_ManagedDevices_Delete', 'Microsoft.Intune_ManagedDevices_SetPrimaryUser', 'Microsoft.Intune_ManagedDevices_ViewReports', 'Microsoft.Intune_RemoteTasks_SyncDevice', 'Microsoft.Intune_RemoteTasks_RebootNow', 'Microsoft.Intune_RemoteTasks_SetDeviceName', 'Microsoft.Intune_RemoteTasks_CollectDiagnostics', 'Microsoft.Intune_RemoteTasks_Wipe', 'Microsoft.Intune_RemoteTasks_Retire', 'Microsoft.Intune_RemoteTasks_RotateBitLockerKeys', 'Microsoft.Intune_RemoteTasks_RotateLocalAdminPassword', 'Microsoft.Intune_RemoteTasks_RemoteLock', 'Microsoft.Intune_RemoteTasks_LocateDevice', 'Microsoft.Intune_RemoteTasks_EnableLostMode', 'Microsoft.Intune_RemoteTasks_DisableLostMode', 'Microsoft.Intune_DeviceConfigurations_Read', 'Microsoft.Intune_DeviceConfigurations_ViewReports', 'Microsoft.Intune_DeviceConfigurations_Assign', 'Microsoft.Intune_DeviceCompliancePolices_Read', 'Microsoft.Intune_DeviceCompliancePolices_ViewReports', 'Microsoft.Intune_DeviceCompliancePolices_Assign', 'Microsoft.Intune_MobileApps_Read', 'Microsoft.Intune_MobileApps_ViewReports', 'Microsoft.Intune_MobileApps_Assign', 'Microsoft.Intune_ManagedApps_Read', 'Microsoft.Intune_EnrollmentProgram_Read', 'Microsoft.Intune_EnrollmentProgram_SyncDevice', 'Microsoft.Intune_AuditData_Read', 'Microsoft.Intune_Organization_Read', 'Microsoft.Intune_TermsAndConditions_Read')
  $global:FakeCalls.Clear(); $global:FakeFail = @{}; $global:FakeBeforeWrite = $null; $global:FakeNoPolicyOnCreate = $false; $global:FakeDisconnected = $false
}
function New-FakeId { $global:Fake.seq++; return ('{0:x8}-0000-0000-0000-{1:x12}' -f 0xfeed0000, $global:Fake.seq) }
function Add-FakeGroup([string]$Name, [bool]$RoleAssignable = $true, [string]$Created = '2026-09-25T10:00:00Z', [string]$Rule = $null, [string]$Id = $null) {
  $g = @{ id = $(if ($Id) { $Id } else { New-FakeId }); displayName = $Name; isAssignableToRole = $RoleAssignable; createdDateTime = $Created; membershipRule = $Rule; membershipRuleProcessingState = $(if ($Rule) { 'On' } else { $null }); groupTypes = @() }
  $global:Fake.groups.Add($g)
  if ($RoleAssignable) { $global:Fake.groupPolicies[$g.id] = @{ id = "gpol-$($g.id)"; rules = (New-FakeRules) } }
  return $g
}
function Get-FakeTagIds([string]$TagId) { return @($global:Fake.intune.tagAssign[$TagId] | Where-Object { $_ } | ForEach-Object { if ($_ -is [string]) { $_ } elseif ($_.entraObjectId) { $_.entraObjectId } else { $_.groupId } }) }
function Get-FakeWrites { return @($global:FakeCalls | Where-Object { $_.Method -ne 'GET' }) }

function Get-MgContext {
  if (-not $global:Fake -or $global:FakeDisconnected) { return $null }
  return [pscustomobject]@{ TenantId = $global:Fake.org.id; AuthType = 'AppOnly'; ClientId = 'client-1'; Account = $null; Scopes = $global:Fake.scopes }
}
function Connect-MgGraph { $global:FakeDisconnected = $false }
function Disconnect-MgGraph { $global:FakeDisconnected = $true }

function ConvertTo-FakeHash($o) { return ($o | ConvertTo-Json -Depth 40 | ConvertFrom-Json -AsHashtable -Depth 40) }
function Invoke-MgGraphRequest {
  param([string]$Method = 'GET', [string]$Uri, $Body, [string]$OutputType, [string]$ContentType, $Headers)
  $global:FakeCalls.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body })
  $F = $global:Fake
  $u = [uri]::UnescapeDataString(($Uri -replace '^https://graph\.microsoft\.com/(v1\.0|beta)', ''))
  foreach ($k in $global:FakeFail.Keys) { if ($u -match $k) { throw "Response status code does not indicate success: Forbidden (403). $($global:FakeFail[$k])" } }
  $b = if ($Body) { $Body | ConvertFrom-Json -AsHashtable -Depth 40 } else { $null }
  $list = { param($items) return @{ value = @($items | ForEach-Object { ConvertTo-FakeHash $_ }) } }
  if ($Method -eq 'GET') {
    switch -Regex ($u) {
      '^/organization' { return (& $list @($F.org)) }
      "^/groups\?\`$filter=startswith\(displayName,'([^']+)'\) or startswith\(displayName,'([^']+)'\)" { $a = $Matches[1]; $c = $Matches[2]; return (& $list @($F.groups | Where-Object { $_.displayName.StartsWith($a) -or $_.displayName.StartsWith($c) })) }
      "^/groups\?\`$filter=startswith\(displayName,'([^']+)'\)" { $a = $Matches[1]; return (& $list @($F.groups | Where-Object { $_.displayName.StartsWith($a) })) }
      '^/groups/([^/?]+)/members' { return (& $list @($F.members[$Matches[1]] | Where-Object { $_ } | ForEach-Object { @{ id = $_ } })) }
      '^/groups/([^/?]+)/memberOf' { $id = $Matches[1]; return (& $list @($F.members.Keys | Where-Object { @($F.members[$_]) -contains $id } | ForEach-Object { @{ id = $_ } })) }
      '^/groups/([^/?]+)/owners' { return (& $list @($F.owners[$Matches[1]] | Where-Object { $_ } | ForEach-Object { @{ id = $_ } })) }
      '^/groups/([^/?]+)/appRoleAssignments' { return (& $list @($F.appRoleRefs[$Matches[1]] | Where-Object { $_ } | ForEach-Object { @{ id = $_ } })) }
      '^/groups/([^/?]+)(\?|$)' { $id = $Matches[1]; $g = @($F.groups | Where-Object { $_.id -eq $id })[0]; if (-not $g) { throw 'NotFound (404)' }; return (ConvertTo-FakeHash $g) }
      '^/directoryObjects/([^/?]+)' { $id = $Matches[1]; if ($F.users.ContainsKey($id) -or @($F.groups | Where-Object { $_.id -eq $id }).Count) { return @{ id = $id } }; throw "Response status code does not indicate success: NotFound (404)." }
      '^/users/([^/?]+)' { $k = $Matches[1]; foreach ($id in $F.users.Keys) { $upn = "$($F.users[$id] -replace ' ','.')@fake.dev"; if ($id -eq $k -or $upn -ieq $k) { return @{ id = $id; displayName = $F.users[$id]; userPrincipalName = $upn } } }; throw "Response status code does not indicate success: NotFound (404)." }
      '^/users' { return (& $list @($F.users.Keys | ForEach-Object { @{ id = $_; displayName = $F.users[$_]; userPrincipalName = "$($F.users[$_] -replace ' ','.')@fake.dev" } })) }
      '^/roleManagement/directory/roleDefinitions' { return (& $list $F.roles) }
      "^/policies/roleManagementPolicyAssignments\?\`$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'" { return (& $list @($F.rolePolicies.Keys | ForEach-Object { @{ roleDefinitionId = $_; policy = $F.rolePolicies[$_] } })) }
      "^/policies/roleManagementPolicyAssignments\?\`$filter=scopeId eq '([^']+)' and scopeType eq 'Group'" { $gid = $Matches[1]; if ($F.groupPolicies.ContainsKey($gid)) { return (& $list @(@{ roleDefinitionId = 'member'; policy = $F.groupPolicies[$gid] })) }; return @{ value = @() } }
      '^/policies/roleManagementPolicies/([^/]+)/rules/([^/?]+)' { $pid_ = $Matches[1]; $rid = $Matches[2]; $pol = @($F.rolePolicies.Values + $F.groupPolicies.Values) | Where-Object { $_.id -eq $pid_ } | Select-Object -First 1; $r = @($pol.rules | Where-Object { $_.id -eq $rid })[0]; if (-not $r) { throw 'NotFound (404)' }; return (ConvertTo-FakeHash $r) }
      '^/policies/roleManagementPolicies\?' { $all = @(); foreach ($p in $F.rolePolicies.Values) { $all += $p }; foreach ($p in $F.groupPolicies.Values) { $all += $p }; return (& $list $all) }
      "^/roleManagement/directory/roleEligibilitySchedules\?\`$filter=principalId eq '([^']+)'" { $p = $Matches[1]; return (& $list @($F.elig | Where-Object { $_.principalId -eq $p })) }
      "^/roleManagement/directory/roleAssignmentSchedules\?\`$filter=principalId eq '([^']+)'" { $p = $Matches[1]; return (& $list @($F.active | Where-Object { $_.principalId -eq $p })) }
      '^/roleManagement/directory/roleEligibilitySchedules' { return (& $list $F.elig) }
      '^/roleManagement/directory/roleAssignmentSchedules' { return (& $list $F.active) }
      '^/roleManagement/directory/roleAssignmentScheduleInstances' { return (& $list @($F.active | Where-Object { $_.roleDefinitionId -eq '62e90394-69f5-4237-9190-012177145e10' -and $_.assignmentType -eq 'Assigned' } | ForEach-Object { $x = ConvertTo-FakeHash $_; $x.principal = @{ '@odata.type' = '#microsoft.graph.user'; id = $_.principalId; displayName = $F.users[$_.principalId]; userPrincipalName = "$($F.users[$_.principalId] -replace ' ','.')@fake.dev" }; $x })) }
      "^/identityGovernance/privilegedAccess/group/assignmentSchedules\?\`$filter=groupId eq '([^']+)'" { $gid = $Matches[1]; return (& $list @($F.pgA | Where-Object { $_.groupId -eq $gid })) }
      "^/identityGovernance/privilegedAccess/group/eligibilitySchedules\?\`$filter=groupId eq '([^']+)'" { $gid = $Matches[1]; return (& $list @($F.pgE | Where-Object { $_.groupId -eq $gid })) }
      "^/identityGovernance/privilegedAccess/group/(assignment|eligibility)Schedules\?\`$filter=principalId eq '([^']+)'" { $k = $Matches[1]; $p = $Matches[2]; $src = if ($k -eq 'assignment') { $F.pgA } else { $F.pgE }; return (& $list @($src | Where-Object { $_.principalId -eq $p })) }
      '^/identity/conditionalAccess/policies' { return (& $list @($F.caRefs.Keys | ForEach-Object { @{ id = "ca-$_"; displayName = "CA using $_"; conditions = @{ users = @{ includeGroups = @($_); excludeGroups = @() } } } })) }
      '^/directory/administrativeUnits/([^/?]+)/members' { return @{ value = @() } }
      '^/directory/administrativeUnits' { return (& $list $F.aus) }
      '^/deviceManagement/resourceOperations' { if (-not $F.intune.on) { throw 'Response status code does not indicate success: Forbidden (403). Intune not licensed' }; return (& $list @($F.intune.ops | ForEach-Object { @{ id = $_; actionName = 'x' } })) }
      '^/deviceManagement/roleDefinitions' { if (-not $F.intune.on) { throw 'Forbidden (403)' }; return (& $list @($F.intune.roles | ForEach-Object { @{ id = $_.id; displayName = $_.displayName; isBuiltIn = $_.isBuiltIn; rolePermissions = @(@{ resourceActions = @(@{ allowedResourceActions = $_.allowed }) }) } })) }
      '^/deviceManagement/roleScopeTags/([^/?]+)/assignments' { return (& $list @($F.intune.tagAssign[$Matches[1]] | Where-Object { $_ } | ForEach-Object { @{ id = 'ta'; target = $(if ($_ -is [string]) { @{ '@odata.type' = '#microsoft.graph.scopeTagGroupAssignmentTarget'; targetType = 'device'; entraObjectId = $_ } } else { $_ }) } })) }
      '^/deviceManagement/roleScopeTags' { if (-not $F.intune.on) { throw 'Forbidden (403)' }; return (& $list $F.intune.tags) }
      '^/deviceManagement/roleAssignments/([^/?]+)' { $id = $Matches[1]; $a = @($F.intune.assignments | Where-Object { $_.id -eq $id })[0]; if (-not $a) { throw 'NotFound (404)' }; $x = ConvertTo-FakeHash $a; $x.roleDefinition = @{ id = $a.roleDefinitionId }; return $x }
      '^/deviceManagement/roleAssignments' { if (-not $F.intune.on) { throw 'Forbidden (403)' }; return (& $list $F.intune.assignments) }
      default { throw "FakeGraph: no route for GET $u" }
    }
  }
  if ($global:FakeBeforeWrite) { & $global:FakeBeforeWrite $Method $u }
  switch -Regex ("$Method $u") {
    '^POST /groups$' { $g = @{ id = (New-FakeId); displayName = $b.displayName; isAssignableToRole = [bool]$b.isAssignableToRole; createdDateTime = (Get-Date).ToUniversalTime().ToString('o'); membershipRule = $b.membershipRule; membershipRuleProcessingState = $b.membershipRuleProcessingState; groupTypes = $b.groupTypes }; $F.groups.Add($g); if (-not $global:FakeNoPolicyOnCreate) { $F.groupPolicies[$g.id] = @{ id = "gpol-$($g.id)"; rules = (New-FakeRules) } }; return (ConvertTo-FakeHash $g) }
    '^PATCH /groups/([^/?]+)$' { $g = $F.groups | Where-Object { $_.id -eq $Matches[1] }; foreach ($k in $b.Keys) { $g[$k] = $b[$k] }; return $null }
    '^DELETE /groups/([^/?]+)$' { $id = $Matches[1]; $F.groups.RemoveAll([Predicate[object]] { param($x) $x.id -eq $id }) | Out-Null; return $null }
    '^POST /groups/([^/?]+)/members/\$ref$' { $gid = $Matches[1]; if (-not $F.members[$gid]) { $F.members[$gid] = @() }; $F.members[$gid] += ($b['@odata.id'] -split '/')[-1]; return $null }
    '^PATCH /policies/roleManagementPolicies/([^/]+)/rules/([^/?]+)$' {
      $pid_ = $Matches[1]; $rid = $Matches[2]
      $pol = @($F.rolePolicies.Values + $F.groupPolicies.Values) | Where-Object { $_.id -eq $pid_ } | Select-Object -First 1
      if (-not $pol) { throw "FakeGraph: no policy $pid_" }
      for ($i = 0; $i -lt $pol.rules.Count; $i++) { if ($pol.rules[$i].id -eq $rid) { $pol.rules[$i] = $b } }
      return $null
    }
    '^POST /roleManagement/directory/roleEligibilityScheduleRequests$' { $F.elig.Add(@{ id = (New-FakeId); principalId = $b.principalId; roleDefinitionId = $b.roleDefinitionId; directoryScopeId = $b.directoryScopeId; scheduleInfo = $b.scheduleInfo }); return @{ id = (New-FakeId); status = 'Provisioned' } }
    '^POST /identityGovernance/privilegedAccess/group/assignmentScheduleRequests$' { $F.pgA.Add(@{ id = (New-FakeId); groupId = $b.groupId; principalId = $b.principalId; accessId = $b.accessId }); return @{ id = (New-FakeId); status = 'Provisioned' } }
    '^POST /identityGovernance/privilegedAccess/group/eligibilityScheduleRequests$' { $F.pgE.Add(@{ id = (New-FakeId); groupId = $b.groupId; principalId = $b.principalId; accessId = $b.accessId }); return @{ id = (New-FakeId); status = 'Provisioned' } }
    '^POST /directory/administrativeUnits$' { $a = @{ id = (New-FakeId); displayName = $b.displayName; membershipType = $b.membershipType; membershipRule = $b.membershipRule; membershipRuleProcessingState = $b.membershipRuleProcessingState; isMemberManagementRestricted = [bool]$b.isMemberManagementRestricted }; $F.aus.Add($a); return (ConvertTo-FakeHash $a) }
    '^PATCH /directory/administrativeUnits/([^/?]+)$' { $a = $F.aus | Where-Object { $_.id -eq $Matches[1] }; foreach ($k in $b.Keys) { $a[$k] = $b[$k] }; return $null }
    '^POST /deviceManagement/roleDefinitions$' { $r = @{ id = (New-FakeId); displayName = $b.displayName; isBuiltIn = $false; allowed = @($b.rolePermissions[0].resourceActions[0].allowedResourceActions) }; $F.intune.roles.Add($r); return @{ id = $r.id } }
    '^POST /deviceManagement/roleScopeTags$' { $t = @{ id = (New-FakeId); displayName = $b.displayName }; $F.intune.tags.Add($t); return @{ id = $t.id } }
    '^POST /deviceManagement/roleScopeTags/([^/]+)/assign$' { $F.intune.tagAssign[$Matches[1]] = @($b.assignments | ForEach-Object { $_.target }); return $null }
    '^POST /deviceManagement/roleAssignments$' { $a = @{ id = (New-FakeId); displayName = $b.displayName; members = $b.members; resourceScopes = $b.resourceScopes; roleScopeTagIds = $b.roleScopeTagIds; roleDefinitionId = (($b['roleDefinition@odata.bind']) -split '/')[-1] }; $F.intune.assignments.Add($a); return @{ id = $a.id } }
    default { throw "FakeGraph: no route for $Method $u" }
  }
}
