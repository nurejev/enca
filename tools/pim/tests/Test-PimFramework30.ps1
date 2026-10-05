# Tests for Set-PimFramework30.ps1 against FakeGraph.ps1 (no network).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pim = Split-Path -Parent $here
. (Join-Path $here 'FakeGraph.ps1')
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
$pass = 0; $fail = 0
function T([string]$n, [scriptblock]$b) { try { & $b; $script:pass++; Write-Host "ok   $n" -ForegroundColor Green } catch { $script:fail++; Write-Host "FAIL $n`n     $($_.Exception.Message)`n     $($_.InvocationInfo.PositionMessage)" -ForegroundColor Red } }
function A($c, [string]$m) { if (-not $c) { throw "assert: $m" } }
function Run([scriptblock]$b) { $l = New-Object System.Collections.Generic.List[string]; try { & $b *>&1 | ForEach-Object { $l.Add("$_") } } catch { $l.Add("THREW: $($_.Exception.Message)") }; return ($l -join "`n") }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("fw30-" + [guid]::NewGuid().ToString('N').Substring(0, 6)); New-Item -ItemType Directory $tmp | Out-Null
$S = Join-Path $pim 'Set-PimFramework30.ps1'
function LastPlan([string]$phase) { (Get-ChildItem $tmp -Filter "pim-plan.fw30-$phase.*.json" | Sort-Object LastWriteTime)[-1].FullName }
$design = Get-Content (Join-Path $pim 'framework-3.0.baseline.json') -Raw | ConvertFrom-Json -AsHashtable
$roles = @(@($design.groups) + @($design.regionGroups) | ForEach-Object { $_.roles | ForEach-Object { $_.role } } | Sort-Object -Unique)
$regions = Join-Path $tmp 'regions.json'
@{ regions = @(@{ code = 'EU-NL' }, @{ code = 'EU-DE' }) } | ConvertTo-Json -Depth 5 | Set-Content $regions
$scopes = @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup')
$anna = 'aaaaaaaa-0000-0000-0000-000000000001'; $joey = 'aaaaaaaa-0000-0000-0000-000000000002'; $bg = 'aaaaaaaa-0000-0000-0000-000000000003'
function RoleId([string]$n) { ($global:Fake.roles | Where-Object { $_.displayName -eq $n }).id }
function New-Tenant {
  New-FakeTenant -Scopes $scopes -RoleNames $roles
  $g = @{}
  foreach ($n in @('PIM-SG-M365-GlobalAdmin', 'PIM-SG-M365-Tier0', 'PIM-SG-M365-SecOps', 'PIM-SG-M365-SecOpsReader', 'PIM-SG-M365-Ops', 'PIM-SG-M365-Identity', 'PIM-SG-M365-Workplace', 'PIM-SG-M365-Apps', 'PIM-SG-M365-Collab', 'PIM-SG-M365-ServiceDesk', 'PIM-SG-M365-ServiceDesk-VIP', 'PIM-SG-M365-Audit', 'PIM-SG-M365-Helpdesk', 'PIM-SG-M365-AppOps', 'PIM-SG-EU-NL-Helpdesk', 'PIM-SG-EU-NL-Ops')) { $g[$n] = (Add-FakeGroup $n).id }
  $g['PIM-SG-Approvers'] = (Add-FakeGroup 'PIM-SG-Approvers' $false).id
  $global:Fake.aus.Add(@{ id = 'au-exec'; displayName = 'AU-RM-Executives' })
  foreach ($k in @('Users', 'Groups', 'Devices')) { $global:Fake.aus.Add(@{ id = "au-nl-$($k.ToLower())"; displayName = "AU-EU-NL-$k" }) }
  $global:Fake.pgA.Add(@{ id = 'x4'; groupId = $g['PIM-SG-EU-NL-Helpdesk']; principalId = 'aaaaaaaa-0000-0000-0000-000000000004'; accessId = 'member' })
  $global:Fake.elig.Add(@{ id = (New-FakeId); principalId = $g['PIM-SG-EU-NL-Helpdesk']; roleDefinitionId = (RoleId 'Helpdesk Administrator'); directoryScopeId = '/administrativeUnits/au-nl-users' })
  $global:Fake.pgA.Add(@{ id = 'x1'; groupId = $g['PIM-SG-M365-Ops']; principalId = $anna; accessId = 'member' })
  $global:Fake.pgA.Add(@{ id = 'x2'; groupId = $g['PIM-SG-M365-SecOps']; principalId = $joey; accessId = 'member' })
  $global:Fake.pgA.Add(@{ id = 'x3'; groupId = $g['PIM-SG-M365-SecOps']; principalId = $bg; accessId = 'member' })
  foreach ($p in @(@('PIM-SG-M365-Ops', 'Exchange Administrator'), @('PIM-SG-M365-Ops', 'Teams Administrator'), @('PIM-SG-M365-SecOps', 'Conditional Access Administrator'), @('PIM-SG-M365-SecOps', 'Security Operator'), @('PIM-SG-M365-SecOps', 'Hybrid Identity Administrator'))) {
    $rid = RoleId $p[1]; if (-not $rid) { $rid = 'unknown-role' }
    $global:Fake.elig.Add(@{ id = (New-FakeId); principalId = $g[$p[0]]; roleDefinitionId = $rid; directoryScopeId = '/' })
  }
  return $g
}
function Plan([string]$ph) { Run { & $S -Phase $ph -TenantId fake.dev -OutDir $tmp -ProtectedIds $bg -RegionsFile $regions } }
function Apply([string]$ph) { Run { & $S -Phase $ph -TenantId fake.dev -OutDir $tmp -ProtectedIds $bg -RegionsFile $regions -Apply -PlanFile (LastPlan $ph.ToLower()) -Yes } }

$g = New-Tenant
T 'Direct: planning writes nothing; creates three direct groups, eligibilities and copies people' {
  $global:FakeCalls.Clear(); $t = Plan 'Direct'
  A (@(Get-FakeWrites).Count -eq 0) "writes while planning`n$t"
  $p = Get-Content (LastPlan 'direct') -Raw | ConvertFrom-Json -AsHashtable
  $keys = @($p.ops | ForEach-Object { $_.key })
  foreach ($n in @('PIM-SG-M365-Ops-Direct', 'PIM-SG-M365-Collab-Direct', 'PIM-SG-M365-SecOps-Direct')) { A ($keys -contains "group:$n") "create $n" }
  A (@($keys | Where-Object { $_ -like 'elig:PIM-SG-M365-Ops-Direct:Exchange Administrator:*' }).Count) 'Ops-Direct eligible for Exchange'
  A ($keys -contains "copy:PIM-SG-M365-Ops-Direct:$anna") 'anna copied to Ops-Direct'
  A ($keys -notcontains "copy:PIM-SG-M365-SecOps-Direct:$bg") 'protected id not copied'
}
T 'Direct: apply' {
  $t = Apply 'Direct'; A ($t -notmatch 'THREW|✗') "apply ran`n$t"
  A (@($global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-Ops-Direct' -and $_.isAssignableToRole }).Count -eq 1) 'Ops-Direct exists, role-assignable'
}
T 'Jobs is refused while job groups have active members' {
  $null = Plan 'Jobs'; $t = Plan 'Jobs'
  A ($t -match 'still has 1 active member') "blocked`n$t"
}
T 'People: anna becomes eligible in Ops; the protected id is left and reported' {
  $null = Plan 'People'; $t = Apply 'People'; A ($t -notmatch 'THREW') "apply`n$t"
  A (@($global:Fake.pgE | Where-Object { $_.principalId -eq $anna -and $_.groupId -eq $g['PIM-SG-M365-Ops'] }).Count -eq 1) 'anna eligible'
  A (@($global:Fake.pgA | Where-Object { $_.principalId -eq $anna -and $_.groupId -eq $g['PIM-SG-M365-Ops'] }).Count -eq 0) 'anna no longer active'
  A (@($global:Fake.pgA | Where-Object { $_.principalId -eq $bg }).Count -eq 1) 'protected left active'
}
T 'Jobs stays refused because of the protected member; after removing it by hand it applies' {
  $t = Plan 'Jobs'; A ($t -match 'still has 1 active member') "blocked by bg`n$t"
  $global:Fake.pgA.RemoveAll([Predicate[object]] { param($x) $x.principalId -eq $bg }) | Out-Null
  $null = Plan 'Jobs'; $t = Apply 'Jobs'; A ($t -notmatch 'THREW|✗') "apply`n$t"
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-M365-Ops'] -and $_.roleDefinitionId -eq (RoleId 'Teams Administrator') }).Count -eq 1) 'Ops active in Teams Administrator'
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-M365-Ops'] -and $_.roleDefinitionId -eq (RoleId 'Exchange Administrator') }).Count -eq 0) 'Ops NOT active in Exchange Administrator'
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-M365-ServiceDesk-VIP'] -and $_.directoryScopeId -eq '/administrativeUnits/au-exec' }).Count -eq 3) 'VIP desk active at the executive unit'
  $r = @($global:Fake.rolePolicies[(RoleId 'Teams Administrator')].rules | Where-Object { $_.id -eq 'Expiration_Admin_Assignment' })[0]
  A (-not $r.isExpirationRequired) 'Teams Administrator allows permanent active'
}
T 'Regions: the regional desk is active at its own units; a region without groups is reported, not created' {
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-EU-NL-Helpdesk'] -and $_.directoryScopeId -eq '/administrativeUnits/au-nl-users' }).Count -eq 4) 'EU-NL desk: 4 roles at AU-EU-NL-Users'
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-EU-NL-Ops'] -and $_.directoryScopeId -eq '/administrativeUnits/au-nl-groups' }).Count -eq 2) 'EU-NL Ops: 2 roles at AU-EU-NL-Groups'
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-EU-NL-Helpdesk'] -and $_.directoryScopeId -eq '/' }).Count -eq 0) 'never at tenant scope'
  A (@($global:Fake.pgE | Where-Object { $_.groupId -eq $g['PIM-SG-EU-NL-Helpdesk'] }).Count -eq 1) 'regional member eligible'
  $t = Plan 'Jobs'; A ($t -match 'PIM-SG-EU-DE-Helpdesk does not exist') "EU-DE reported`n$t"
}
T 'Multi: AppOps gets its own direct group for Exchange and SharePoint' {
  A (@($global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-AppOps-Direct' }).Count -eq 1) 'AppOps-Direct created'
  A (@($global:Fake.active | Where-Object { $_.principalId -eq $g['PIM-SG-M365-AppOps'] -and $_.roleDefinitionId -eq (RoleId 'SharePoint Administrator') }).Count -eq 0) 'AppOps never active in SharePoint'
}
T 'Retire removes only superseded eligibilities and reports the rest' {
  $null = Plan 'Retire'; $t = Apply 'Retire'; A ($t -notmatch 'THREW') "apply`n$t"
  $ops = @($global:Fake.elig | Where-Object { $_.principalId -eq $g['PIM-SG-M365-Ops'] })
  A ($ops.Count -eq 0) 'Ops old eligibilities gone (Exchange via Ops-Direct, Teams via active)'
  $sec = @($global:Fake.elig | Where-Object { $_.principalId -eq $g['PIM-SG-M365-SecOps'] })
  A ($sec.Count -eq 1) 'SecOps keeps the one eligibility 3.0 does not explain'
  A (@($global:Fake.elig | Where-Object { $_.principalId -eq $g['PIM-SG-EU-NL-Helpdesk'] }).Count -eq 0) 'regional scoped eligibility retired'
}
T 'Every phase planned again has nothing to do' {
  foreach ($ph in @('Direct', 'People', 'Jobs')) { $t = Plan $ph; A ($t -match 'nothing to do') "$ph again`n$t" }
}
T 'A design that bundles a delay or Tier 0 role in a job group is refused before any read' {
  $d = Get-Content (Join-Path $pim 'framework-3.0.baseline.json') -Raw | ConvertFrom-Json -AsHashtable
  ($d.groups | Where-Object { $_.name -eq 'PIM-SG-M365-Ops' }).roles += @{ role = 'SharePoint Administrator'; scope = '/' }
  $bad = Join-Path $tmp 'bad.json'; $d | ConvertTo-Json -Depth 20 | Set-Content $bad
  $global:FakeCalls.Clear(); $t = Run { & $S -Phase Direct -TenantId fake.dev -OutDir $tmp -DesignFile $bad -NoRegions }
  A ($t -match 'belong on the direct path') "refused`n$t"; A ($global:FakeCalls.Count -eq 0) 'no Graph call at all'
}
Write-Host "`n$pass passed, $fail failed"
if ($fail) { exit 1 }
