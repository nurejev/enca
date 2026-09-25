# New-PimRegions.ps1 against the fake Graph. Dot-sourced by Test-PimScripts.ps1
# (uses its helpers, $tmp, $pim, $allScopes, $readScopes, $regions).
$regionRoles = @('Global Administrator', 'Helpdesk Administrator', 'Password Administrator', 'Authentication Administrator', 'License Administrator', 'User Administrator', 'Groups Administrator', 'Teams Administrator', 'Cloud Device Administrator')
$tplDoc = Get-Content (Join-Path $pim 'pim-regions-template.json') -Raw | ConvertFrom-Json -AsHashtable
function New-RegionsJson([string]$Name, [object[]]$Rows) {
  $d = [ordered]@{}; foreach ($k in $tplDoc.Keys) { $d[$k] = $tplDoc[$k] }
  $d['regions'] = $Rows
  $f = Join-Path $tmp $Name
  ($d | ConvertTo-Json -Depth 40) | Set-Content $f
  return $f
}
function Get-RunText([scriptblock]$b) {
  $l = New-Object System.Collections.Generic.List[string]
  try { & $b *>&1 | ForEach-Object { $l.Add("$_") } } catch { $l.Add("THREW: $($_.Exception.Message)") }
  return ($l -join "`n")
}
function New-RegionTenant([string[]]$Scopes = $allScopes, [switch]$NoIntune) {
  New-FakeTenant -Scopes $Scopes -RoleNames $regionRoles -NoIntune:$NoIntune
  Add-FakeGroup 'PIM-SG-Approvers' -RoleAssignable $false | Out-Null
}
$rowNL = [ordered]@{ code = 'EU-NL'; name = 'Netherlands'; attribute = 'extensionAttribute1'; value = 'EU-NL'; devicePrefix = 'NL-'; autopilotTag = 'EU-NL'; itLead = 'approver.a@fake.dev'; approvers = @('approver.a@fake.dev', 'approver.b@fake.dev'); timezone = 'Europe/Amsterdam' }
$rowDE = [ordered]@{ code = 'EU-DE'; name = 'Germany'; attribute = 'extensionAttribute1'; value = 'EU-DE'; devicePrefix = 'DE-'; autopilotTag = 'EU-DE'; itLead = 'approver.b@fake.dev'; approvers = 'approver.b@fake.dev'; timezone = 'Europe/Berlin' }
$regionsJson = New-RegionsJson 'regions.fake.json' @($rowNL, $rowDE)

Test-It 'regions: planning makes zero writes; units, groups, scoped eligibilities and Intune planned; approvers from JSON arrive as a list' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-Eq (Get-FakeWrites).Count 0 'non-GET calls while planning'
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $keys = @($p.ops | ForEach-Object { $_.key })
  foreach ($k in @('au:AU-EU-NL-Users', 'au:AU-EU-NL-Devices', 'au:AU-EU-NL-Groups', 'group:PIM-SG-EU-NL-Helpdesk', 'group:PIM-SG-INT-HelpDesk-EU-NL', 'group:PIM-SG-EU-NL-Approvers', 'group:INT-SG-DEV-EU-NL-All', 'introle:INT-ROLE-Regional-Ops', 'tag:INT-TAG-EU-NL', 'tagassign:INT-TAG-EU-NL', 'intassign:INT-RBAC-Ops-EU-NL', 'gpolnew:PIM-SG-INT-Ops-EU-NL', 'au:AU-EU-DE-Users')) { Assert-True ($keys -contains $k) "planned: $k" }
  Assert-True ($keys -contains 'member:PIM-SG-EU-NL-Approvers:aaaaaaaa-0000-0000-0000-000000000004') 'first approver (JSON list)'
  Assert-True ($keys -contains 'member:PIM-SG-EU-NL-Approvers:aaaaaaaa-0000-0000-0000-000000000005') 'second approver (JSON list)'
  Assert-True ($keys -contains 'member:PIM-SG-EU-DE-Approvers:aaaaaaaa-0000-0000-0000-000000000005') 'approver from a JSON string'
  $el = @($p.ops | Where-Object { $_.key -eq 'elig:Helpdesk Administrator:PIM-SG-EU-NL-Helpdesk:AU-EU-NL-Users' })[0]
  Assert-Eq $el.body.directoryScopeId '/administrativeUnits/{{au:AU-EU-NL-Users}}' 'eligibility scoped to the region unit'
  $au = @($p.ops | Where-Object { $_.key -eq 'au:AU-EU-NL-Users' })[0]
  Assert-Eq $au.body.membershipRule '(user.extensionAttribute1 -eq "EU-NL")' 'the unit rule from the row'
  Assert-True (-not @($p.ops | Where-Object { $_.body -and $_.body.Contains('isMemberManagementRestricted') }).Count) 'never a restricted management unit'
  $apg = @($p.ops | Where-Object { $_.key -eq 'group:PIM-SG-EU-NL-Approvers' })[0]
  Assert-True (-not $apg.body.Contains('isAssignableToRole')) 'approvers: a plain group'
  # the same from a CSV
  $csv = Join-Path $tmp 'regions.fake.csv'
  Set-Content $csv "code,name,attribute,value,devicePrefix,autopilotTag,itLead,approvers,timezone`nEU-NL,Netherlands,extensionAttribute1,EU-NL,NL-,EU-NL,approver.a@fake.dev,`"approver.a@fake.dev;approver.b@fake.dev`",Europe/Amsterdam"
  Invoke-Quiet { & $regions -RegionsFile $csv -TenantId fake.dev -OutDir $tmp }
  $p2 = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-Eq @($p2.ops | Where-Object { $_.key -like 'member:PIM-SG-EU-NL-Approvers:*' }).Count 2 'CSV: two approvers'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'regions: an unsafe or malformed row blocks the plan; nothing unsafe reaches a rule, nothing is written' {
  New-RegionTenant
  $bad = @(
    @{ f = 'r1.csv'; t = "code,name,attribute,value`nEU-NL,Netherlands,department,EU-NL"; want = 'extensionAttribute1 to extensionAttribute15' },
    @{ f = 'r2.csv'; t = "code,name,attribute,value`nEU-NL,Netherlands,extensionAttribute1,`"EU`"`") -or (user.accountEnabled -eq true`""; want = 'inside a membership rule' },
    @{ f = 'r3.json'; t = '{"regions":{}}'; want = 'regions is a list' },
    @{ f = 'r4.json'; t = '[null]'; want = 'not a region' },
    @{ f = 'r5.json'; t = '[{"code":"EU-NL","name":"NL","approvers":[1,2]}]'; want = 'approvers must be text' },
    @{ f = 'r6.csv'; t = "code,name,approvers`nEU-NL,NL,not-an-address"; want = 'is not an address' },
    @{ f = 'r7.csv'; t = "code,name`nEU-NL,NL`neu-nl,NL again"; want = 'twice' }
  )
  foreach ($b in $bad) {
    $f = Join-Path $tmp $b.f; Set-Content $f $b.t
    $txt = Get-RunText { & $regions -RegionsFile $f -TenantId fake.dev -OutDir $tmp }
    Assert-True ($txt -match 'THREW: .*blocking') "$($b.f) blocks"
    Assert-True ($txt -match [regex]::Escape($b.want)) "$($b.f) says why ($($b.want))"
  }
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'regions: apply the approved plan, then planning again finds nothing; an interrupted tag assignment is repaired without a second tag' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'regions')[-1].FullName
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes }
  $F = $global:Fake
  Assert-Eq $F.aus.Count 6 'three units per region'
  $auU = $F.aus | Where-Object { $_.displayName -eq 'AU-EU-NL-Users' }
  Assert-Eq $auU.membershipRule '(user.extensionAttribute1 -eq "EU-NL")' 'dynamic rule'
  $hd = $F.groups | Where-Object { $_.displayName -eq 'PIM-SG-EU-NL-Helpdesk' }
  Assert-True $hd.isAssignableToRole 'persona group role-assignable'
  Assert-True (@($F.elig | Where-Object { $_.principalId -eq $hd.id -and $_.directoryScopeId -eq "/administrativeUnits/$($auU.id)" }).Count -eq 4) 'first line: four roles on the users unit'
  Assert-True (-not @($F.elig | Where-Object { $_.principalId -eq $hd.id -and $_.directoryScopeId -eq '/' }).Count) 'nothing tenant-wide'
  $jit = $F.groupPolicies[($F.groups | Where-Object { $_.displayName -eq 'PIM-SG-INT-Ops-EU-NL' }).id].rules
  Assert-Eq ($jit | Where-Object { $_.id -eq 'Expiration_EndUser_Assignment' }).maximumDuration 'PT8H' 'GroupJIT: a shift'
  Assert-Eq ($jit | Where-Object { $_.id -eq 'Expiration_Admin_Assignment' }).maximumDuration 'P30D' 'GroupJIT: active at most 30 days'
  $mem = $F.groupPolicies[$hd.id].rules
  Assert-Eq ($mem | Where-Object { $_.id -eq 'Expiration_Admin_Assignment' }).maximumDuration 'P365D' 'GroupMember: active at most a year'
  $apg = $F.groups | Where-Object { $_.displayName -eq 'PIM-SG-EU-NL-Approvers' }
  Assert-Eq ((@($F.members[$apg.id]) | Sort-Object) -join ',') 'aaaaaaaa-0000-0000-0000-000000000004,aaaaaaaa-0000-0000-0000-000000000005' 'approvers are members'
  $tag = $F.intune.tags | Where-Object { $_.displayName -eq 'INT-TAG-EU-NL' }
  $dev = $F.groups | Where-Object { $_.displayName -eq 'INT-SG-DEV-EU-NL-All' }
  Assert-Eq ((Get-FakeTagIds $tag.id) -join ',') $dev.id 'tag auto-assigned from the device group'
  $ra = $F.intune.assignments | Where-Object { $_.displayName -eq 'INT-RBAC-HelpDesk-EU-NL' }
  Assert-Eq ($ra.members -join ',') ($F.groups | Where-Object { $_.displayName -eq 'PIM-SG-INT-HelpDesk-EU-NL' }).id 'Intune members: the INT access group'
  Assert-Eq ($ra.roleScopeTagIds -join ',') $tag.id 'Intune assignment carries the tag'
  Assert-True (@($F.intune.roles | Where-Object { $_.displayName -eq 'INT-ROLE-Regional-Ops' }).Count -eq 1) 'custom role once'
  $global:FakeCalls.Clear()
  $n = @(Get-Plans 'regions').Count
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-Eq (Get-FakeWrites).Count 0 'writes on the second plan'
  Assert-Eq @(Get-Plans 'regions').Count $n "no new plan: nothing left to do`n$txt"
  # interrupted: the tag exists, its auto-assignment did not happen
  $F.intune.tagAssign[$tag.id] = @()
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'regions')[-1].FullName
  $p = Get-Content $plan -Raw | ConvertFrom-Json -AsHashtable
  Assert-Eq (@($p.ops | ForEach-Object { $_.key }) -join ',') 'tagassign:INT-TAG-EU-NL' 'only the assignment is planned'
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes }
  Assert-Eq ((Get-FakeTagIds $tag.id) -join ',') $dev.id 'repaired'
  Assert-Eq @($F.intune.tags | Where-Object { $_.displayName -eq 'INT-TAG-EU-NL' }).Count 1 'no second tag'
}

Test-It 'regions: Intune that cannot be read, or a custom role the tenant cannot fully grant, blocks; without Intune the rest plans' {
  New-RegionTenant -NoIntune
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'THREW: .*blocking' -and $txt -match 'Intune could not be read') 'unreadable Intune blocks'
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Include Units, Groups, GroupPolicies, Eligibilities }
  Assert-True ($txt -notmatch 'THREW') "without Intune it plans`n$txt"
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-True (-not @($p.ops | Where-Object { $_.key -match '^(introle|tag|tagassign|intassign):' -or $_.key -like 'group:INT-SG-*' }).Count) 'no Intune operation'
  New-RegionTenant
  $global:Fake.intune.ops = @($global:Fake.intune.ops | Where-Object { $_ -ne 'Microsoft.Intune_RemoteTasks_Wipe' })
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'THREW: .*blocking' -and $txt -match 'reduced role is never created') 'unknown action blocks'
  New-RegionTenant -Scopes @($readScopes | Where-Object { $_ -ne 'DeviceManagementRBAC.Read.All' })
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'THREW: .*DeviceManagementRBAC.Read.All' -and $txt -match 'AddGraphScopes') 'the missing Intune permission is named with its fix'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'regions: tenant-wide extras, paused processing, owners and a hand-edited Intune assignment are reported; -FixRules plans the fix' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  $F = $global:Fake
  $hd = $F.groups | Where-Object { $_.displayName -eq 'PIM-SG-EU-NL-Helpdesk' }
  $rid = ($F.roles | Where-Object { $_.displayName -eq 'Helpdesk Administrator' }).id
  $F.elig.Add(@{ id = 'x1'; principalId = $hd.id; roleDefinitionId = $rid; directoryScopeId = '/' })
  ($F.groups | Where-Object { $_.displayName -eq 'INT-SG-DEV-EU-NL-All' }).membershipRuleProcessingState = 'Paused'
  $F.owners[($F.groups | Where-Object { $_.displayName -eq 'PIM-SG-EU-NL-Ops' }).id] = @('aaaaaaaa-0000-0000-0000-000000000001')
  ($F.intune.assignments | Where-Object { $_.displayName -eq 'INT-RBAC-HelpDesk-EU-NL' }).members = @('someone-else')
  $global:FakeCalls.Clear()
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'PIM-SG-EU-NL-Helpdesk is eligible for Helpdesk Administrator at TENANT scope') "tenant-wide extra reported`n$txt"
  Assert-True ($txt -match 'INT-SG-DEV-EU-NL-All differs: processing Paused') 'paused processing reported'
  Assert-True ($txt -match 'PIM-SG-EU-NL-Ops has 1 owner') 'owner reported'
  Assert-True ($txt -match 'INT-RBAC-HelpDesk-EU-NL differs from the template \(members\)') 'hand-edited Intune assignment reported'
  Assert-True ($txt -match 'nothing to do') 'reported, not planned'
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -FixRules }
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-Eq (@($p.ops | ForEach-Object { $_.key }) -join ',') 'grfix:INT-SG-DEV-EU-NL-All' '-FixRules plans only the processing fix'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}
