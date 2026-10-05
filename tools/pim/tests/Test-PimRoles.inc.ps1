# Built-in Entra roles are found by template id (32417). Dot-sourced by
# Test-PimScripts.ps1 after Test-PimRegions.inc.ps1 (uses Get-RunText,
# New-RegionTenant, $regionsJson and the main file's helpers).
# cloudfellows.dev, 28 Sep 2026: New-PimBaseline.ps1 stopped at
#   ✗ role 'Microsoft Entra Joined Device Local Administrator' does not exist in the tenant
# — the tenant's role definition still carried a former display name.
$renamed = @{ 'Microsoft Entra Joined Device Local Administrator' = 'Azure AD Joined Device Local Administrator' }
$ejdla = '9f06204d-73c1-4d4c-880a-6edb90606fd8'

Test-It 'roles: a built-in role the tenant still calls by its former name is found by template id; the resolved config carries the tenant''s name' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames -RenamedRoles $renamed
  $res = Join-Path $tmp 'resolved.renamed.json'
  $t0 = (Get-Date).AddSeconds(-1)
  $txt = Get-RunText { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -WriteResolved $res }
  Assert-True ($txt -notmatch 'THREW') "planned without a blocking problem`n$txt"
  Assert-True ($txt -match "is called 'Azure AD Joined Device Local Administrator' in this tenant") "the finding names the tenant's name`n$txt"
  Assert-True ((Get-Plans 'baseline')[-1].LastWriteTime -ge $t0) 'a plan written'
  $p = Get-Content (Get-Plans 'baseline')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  # 3.0: in the small profile the role is held by the Ops job group — an ACTIVE assignment
  $el = @($p.ops | Where-Object { $_.key -like 'elig:Microsoft Entra Joined Device Local Administrator:*' -or $_.key -like 'act:Microsoft Entra Joined Device Local Administrator:*' })
  Assert-True $el.Count 'the renamed role''s assignments planned'
  foreach ($o in $el) { Assert-Eq $o.body.roleDefinitionId $ejdla 'the built-in role, by template id' }
  $r = Get-Content $res -Raw | ConvertFrom-Json -AsHashtable
  $names = @($r.Assignments.EntraRoles | ForEach-Object { $_.roleName })
  Assert-True ($names -contains 'Azure AD Joined Device Local Administrator') 'EasyPIM gets the name the tenant uses (assignments)'
  Assert-True ($names -notcontains 'Microsoft Entra Joined Device Local Administrator') 'and not the catalog name'
  Assert-True ($r.EntraRoles.Policies.Contains('Azure AD Joined Device Local Administrator')) 'EasyPIM gets the name the tenant uses (policies)'
  Assert-True (-not $r.EntraRoles.Policies.Contains('Microsoft Entra Joined Device Local Administrator')) 'the catalog name is gone from the policies'
  Assert-Eq $r.EntraRoles.Policies.Count $cfgSmall.EntraRoles.Policies.Count 'no policy lost in the rename'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'roles: applying with the former name in the tenant makes the eligibility on the built-in role; planning again leaves it alone' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames -RenamedRoles $renamed
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'baseline')[-1].FullName -Yes }
  Assert-True (@($global:Fake.elig.ToArray() + $global:Fake.active.ToArray() | Where-Object { $_.roleDefinitionId -eq $ejdla -and $_.directoryScopeId -eq '/' }).Count) 'assigned on the built-in role'
  $global:FakeCalls.Clear()
  $n = @(Get-Plans 'baseline').Count
  $txt = Get-RunText { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -notmatch 'THREW') "second plan ran`n$txt"
  Assert-Eq @(Get-Plans 'baseline').Count $n "no new plan: nothing left to do`n$txt"
  Assert-Eq (Get-FakeWrites).Count 0 'writes on the second plan'
}

Test-It 'roles: a custom role wearing a built-in role''s name is never used — the built-in is, and the name clash is a finding' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames -CustomRoles @('Microsoft Entra Joined Device Local Administrator')
  $txt = Get-RunText { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Groups, GroupPolicies, Eligibilities, RolePolicies }
  Assert-True ($txt -notmatch 'THREW') "planned`n$txt"
  Assert-True ($txt -match "another role definition is also called 'Microsoft Entra Joined Device Local Administrator'") "the clash reported`n$txt"
  $p = Get-Content (Get-Plans 'baseline')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $el = @($p.ops | Where-Object { $_.key -like 'elig:Microsoft Entra Joined Device Local Administrator:*' -or $_.key -like 'act:Microsoft Entra Joined Device Local Administrator:*' })
  Assert-True $el.Count 'assignments planned'
  foreach ($o in $el) { Assert-Eq $o.body.roleDefinitionId $ejdla 'the built-in role, not the custom one' }
  $rp = @($p.ops | Where-Object { $_.key -like 'rpol:Microsoft Entra Joined Device Local Administrator:*' })
  Assert-True $rp.Count 'role policy planned'
  foreach ($o in $rp) { Assert-True ($o.uri -like "*/pol-$ejdla/*") 'the built-in role''s policy' }
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'roles: a name the catalog does not know still blocks when only a custom role carries it, or when it is missing' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames -CustomRoles @('Contoso Tier1 Helper')
  $cfg = Get-Content $small -Raw | ConvertFrom-Json -AsHashtable
  $cfg.Assignments.EntraRoles += @(@{ roleName = 'Contoso Tier1 Helper'; assignments = @(@{ principalId = '<id of PIM-SG-M365-Ops>'; principalName = 'PIM-SG-M365-Ops'; principalType = 'Group'; assignmentType = 'Eligible'; duration = 'P365D' }) })
  $cfg.Assignments.EntraRoles += @(@{ roleName = 'No Such Role'; assignments = @(@{ principalId = '<id of PIM-SG-M365-Ops>'; principalName = 'PIM-SG-M365-Ops'; principalType = 'Group'; assignmentType = 'Eligible'; duration = 'P365D' }) })
  $f = Join-Path $tmp 'pim.unknownroles.json'; ($cfg | ConvertTo-Json -Depth 40) | Set-Content $f
  $txt = Get-RunText { & $baseline -ConfigFile $f -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match "role 'Contoso Tier1 Helper' is ambiguous in the tenant \(a custom role carries the name\)") "custom-only name blocks`n$txt"
  Assert-True ($txt -match "role 'No Such Role' does not exist in the tenant") "missing name blocks`n$txt"
  Assert-True ($txt -match 'THREW: 2 blocking problem') "two blocking problems, no plan`n$txt"
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'roles: New-PimRegions finds a renamed regional role by template id' {
  New-FakeTenant -Scopes $allScopes -RoleNames $regionRoles -RenamedRoles @{ 'Helpdesk Administrator' = 'Helpdesk Administrator (former name)' }
  Add-FakeGroup 'PIM-SG-Approvers' -RoleAssignable $false | Out-Null
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -notmatch 'THREW') "planned`n$txt"
  Assert-True ($txt -match "is called 'Helpdesk Administrator \(former name\)' in this tenant") "finding`n$txt"
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $el = @($p.ops | Where-Object { $_.key -eq 'act:Helpdesk Administrator:PIM-SG-EU-NL-Helpdesk:AU-EU-NL-Users' })[0]
  Assert-Eq $el.body.roleDefinitionId '729827e3-9c14-49f7-bb1b-9608f156bbb8' 'the built-in Helpdesk Administrator, by template id'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}
