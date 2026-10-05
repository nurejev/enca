# End-to-end: Invoke-PimBaselineSetup.ps1 builds the framework 3.0 baseline in an EMPTY fake tenant,
# then a second run has nothing to do. Run: pwsh -NoProfile -File tools/pim/tests/Test-PimBaselineSetup.ps1
$ErrorActionPreference = 'Stop'
$pim = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $pim
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('pimsetup-' + [guid]::NewGuid().ToString('N').Substring(0, 6)); New-Item -ItemType Directory $tmp | Out-Null
. ./tests/FakeGraph.ps1
# routes the shared fake does not have yet
${function:FakeBase} = ${function:Invoke-MgGraphRequest}
function Invoke-MgGraphRequest {
  param([string]$Method = 'GET', [string]$Uri, $Body, [string]$OutputType, [string]$ContentType, $Headers)
  $u = [uri]::UnescapeDataString(($Uri -replace '^https://graph\.microsoft\.com/(v1\.0|beta)', ''))
  $b = if ($Body) { $Body | ConvertFrom-Json -AsHashtable -Depth 40 } else { $null }
  $F = $global:Fake
  if ($Method -eq 'POST' -and $u -eq '/roleManagement/directory/roleAssignmentScheduleRequests') {
    $global:FakeCalls.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body })
    $F.active.Add(@{ id = (New-FakeId); principalId = $b.principalId; roleDefinitionId = $b.roleDefinitionId; directoryScopeId = $b.directoryScopeId; assignmentType = 'Assigned' }); return @{ id = (New-FakeId); status = 'Provisioned' }
  }
  if ($Method -eq 'POST' -and $u -eq '/roleManagement/directory/roleEligibilityScheduleRequests' -and $b.action -eq 'adminRemove') {
    $global:FakeCalls.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body })
    $F.elig.RemoveAll([Predicate[object]] { param($x) $x.principalId -eq $b.principalId -and $x.roleDefinitionId -eq $b.roleDefinitionId -and $x.directoryScopeId -eq $b.directoryScopeId }) | Out-Null; return @{ id = (New-FakeId); status = 'Revoked' }
  }
  if ($Method -eq 'POST' -and $u -eq '/identityGovernance/privilegedAccess/group/assignmentScheduleRequests' -and $b.action -eq 'adminRemove') {
    $global:FakeCalls.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body })
    $F.pgA.RemoveAll([Predicate[object]] { param($x) $x.groupId -eq $b.groupId -and $x.principalId -eq $b.principalId }) | Out-Null; return @{ id = (New-FakeId); status = 'Revoked' }
  }
  return (FakeBase -Method $Method -Uri $Uri -Body $Body)
}
function global:Read-Host { 'fake.dev' }
# Exchange Online, faked: role group → members (by group id)
$global:RoleGroups = @{}
function global:Get-RoleGroupMember { param($Identity, $ResultSize, $ErrorAction) @($global:RoleGroups[$Identity] | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ Name = $_; ExternalDirectoryObjectId = $_ } }) }
function global:Add-RoleGroupMember { param($Identity, $Member, [switch]$BypassSecurityGroupManagerCheck, $ErrorAction) if (-not $global:RoleGroups[$Identity]) { $global:RoleGroups[$Identity] = @() }; $global:RoleGroups[$Identity] += $Member }
$cfg = Get-Content ./pim-baseline.json -Raw | ConvertFrom-Json -AsHashtable
$d = Get-Content ./framework-3.0.baseline.json -Raw | ConvertFrom-Json -AsHashtable
$roles = @(@($cfg.EntraRoles.Policies.Keys) + @(@($d.groups) + @($d.regionGroups) | % { $_.roles | % { $_.role } }) | Sort-Object -Unique)
$scopes = @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup', 'AdministrativeUnit.ReadWrite.All', 'DeviceManagementRBAC.ReadWrite.All', 'Policy.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup', 'AdministrativeUnit.Read.All', 'DeviceManagementRBAC.Read.All')
New-FakeTenant -Scopes $scopes -RoleNames $roles
$reg = Join-Path $tmp 'regions.test.json'
@{ regions = @(@{ code = 'EU-NL'; name = 'Netherlands'; attribute = 'extensionAttribute1'; value = 'EU-NL'; devicePrefix = 'NL-'; autopilotTag = 'EU-NL'; itLead = 'approver.a@fake.dev'; approvers = 'approver.a@fake.dev;approver.b@fake.dev' }) } | ConvertTo-Json -Depth 5 | Set-Content $reg
& ./Invoke-PimBaselineSetup.ps1 -TenantId fake.dev -ProtectedIds 'aaaaaaaa-0000-0000-0000-000000000003' -RegionsFile $reg -OutDir (Join-Path $tmp 'run1') -Yes -DeferWaitSeconds 0 -Stages Config,Exchange,Regions,Repair,Direct,People,Jobs,Retire *> (Join-Path $tmp 'run1.log')
$fail = 0
function Check($c, [string]$m) { if ($c) { Write-Host "ok   $m" -ForegroundColor Green } else { Write-Host "FAIL $m" -ForegroundColor Red; $script:fail++ } }
$id = { param($n) ($global:Fake.groups | Where-Object displayName -eq $n).id }
$act = { param($n) @($global:Fake.active | Where-Object principalId -eq (& $id $n)) }
$elig = { param($n) @($global:Fake.elig | Where-Object principalId -eq (& $id $n)) }
foreach ($n in @('PIM-SG-M365-Ops-Direct', 'PIM-SG-M365-Collab-Direct', 'PIM-SG-M365-SecOps-Direct', 'PIM-SG-M365-AppOps-Direct', 'PIM-SG-EU-NL-Helpdesk', 'PIM-SG-EU-NL-Ops')) { Check (& $id $n) "$n exists" }
Check ((& $act 'PIM-SG-M365-Ops').Count -eq 22 -and (& $elig 'PIM-SG-M365-Ops').Count -eq 0) 'Ops: 22 roles active, no eligibilities'
Check ((& $elig 'PIM-SG-M365-Ops-Direct').Count -eq 2 -and (& $act 'PIM-SG-M365-Ops-Direct').Count -eq 0) 'Ops-Direct: Exchange and SharePoint eligible, nothing active'
Check (@(& $act 'PIM-SG-EU-NL-Helpdesk' | Where-Object { $_.directoryScopeId -like '/administrativeUnits/*' }).Count -eq 4 -and @(& $act 'PIM-SG-EU-NL-Helpdesk' | Where-Object { $_.directoryScopeId -eq '/' }).Count -eq 0) 'EU-NL desk: 4 roles at its unit, none tenant-wide'
Check ((& $id 'PIM-SG-EXO-Recipients') -and @($global:RoleGroups['Recipient Management']) -contains (& $id 'PIM-SG-EXO-Recipients')) 'PIM-SG-EXO-Recipients is in Recipient Management'
Check (@($global:RoleGroups['View-Only Organization Management']) -contains (& $id 'PIM-SG-EXO-Reader')) 'PIM-SG-EXO-Reader is in View-Only Organization Management'
$opsPol = $global:Fake.groupPolicies[(& $id 'PIM-SG-M365-Ops')]
Check ((@($opsPol.rules | Where-Object { $_.id -eq 'Expiration_EndUser_Assignment' })[0]).maximumDuration -eq 'PT4H') 'Ops activation lasts 4 hours'
Check ((& $elig 'PIM-SG-M365-GlobalAdmin').Count -eq 3 -and (& $act 'PIM-SG-M365-GlobalAdmin').Count -eq 0) 'GlobalAdmin: per role only'
$second = (& ./Invoke-PimBaselineSetup.ps1 -TenantId fake.dev -ProtectedIds 'aaaaaaaa-0000-0000-0000-000000000003' -RegionsFile $reg -OutDir (Join-Path $tmp 'run2') -Yes -DeferWaitSeconds 0 *>&1 | Out-String)
Check (([regex]::Matches($second, 'nothing to do')).Count -ge 7) 'a second run has nothing to do in any stage'
Pop-Location
if ($fail) { exit 1 }
