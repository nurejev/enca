# Find-PimDuplicates.ps1 against the fake Graph. Dot-sourced by Test-PimScripts.ps1
# (uses its helpers, $tmp, $pim, $allScopes, $readScopes, $roleNames, $dups).
function Get-DupPlan { $f = @(Get-Plans 'duplicates'); if (-not $f.Count) { return $null }; return (Get-Content $f[-1].FullName -Raw | ConvertFrom-Json -AsHashtable) }
function Get-DupRun([scriptblock]$b) {
  $l = New-Object System.Collections.Generic.List[string]
  try { & $b *>&1 | ForEach-Object { $l.Add("$_") } } catch { $l.Add("THREW: $($_.Exception.Message)") }
  return ($l -join "`n")
}

Test-It 'duplicates: planning makes zero writes; unused copies are planned, the used copy (or else the oldest) is kept' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $o1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-01T10:00:00Z'
  $o2 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-02T10:00:00Z'
  $o3 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-03T10:00:00Z'
  $s1 = Add-FakeGroup 'PIM-SG-M365-SecOps' -Created '2026-09-01T10:00:00Z'
  $s2 = Add-FakeGroup 'PIM-SG-M365-SecOps' -Created '2026-09-05T10:00:00Z'
  $global:Fake.members[$s2.id] = @('aaaaaaaa-0000-0000-0000-000000000001')
  Add-FakeGroup 'PIM-SG-M365-GlobalAdmin' | Out-Null
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp }
  Assert-Eq (Get-FakeWrites).Count 0 'non-GET calls while planning'
  $p = Get-DupPlan
  $del = @($p.ops | ForEach-Object { ($_.uri -split '/')[-1] } | Sort-Object)
  Assert-Eq ($del -join ',') ((@($o2.id, $o3.id, $s1.id) | Sort-Object) -join ',') 'deletes the two newer Ops copies and the unused SecOps copy'
  Assert-True (@($p.ops | Where-Object { $_.kind -ne 'deleteGroup' }).Count -eq 0) 'only deletions'
  Assert-True (@($p.ops | Where-Object { $_.needs -contains 'RoleManagement.ReadWrite.Directory' }).Count -eq 3) 'role-assignable copies need RoleManagement.ReadWrite.Directory'
}

Test-It 'duplicates: a copy that anything uses is never planned for deletion' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $F = $global:Fake
  $kinds = [ordered]@{
    Owner = { param($id) $F.owners[$id] = @('aaaaaaaa-0000-0000-0000-000000000001') }
    PimMember = { param($id) $F.pgE.Add(@{ id = 'e1'; groupId = $id; principalId = 'aaaaaaaa-0000-0000-0000-000000000002'; accessId = 'member' }) }
    PimNested = { param($id) $F.pgA.Add(@{ id = 'a1'; groupId = 'other-group'; principalId = $id; accessId = 'member' }) }
    Role = { param($id) $F.elig.Add(@{ id = 'r1'; principalId = $id; roleDefinitionId = '62e90394-69f5-4237-9190-012177145e10'; directoryScopeId = '/' }) }
    AppRole = { param($id) $F.appRoleRefs[$id] = @('ar1') }
    CondAccess = { param($id) $F.caRefs[$id] = 1 }
    Approver = { param($id) $rule = $F.rolePolicies['62e90394-69f5-4237-9190-012177145e10'].rules | Where-Object { $_.id -eq 'Approval_EndUser_Assignment' }; $rule.setting.approvalStages[0].primaryApprovers = @(@{ '@odata.type' = '#microsoft.graph.groupMembers'; groupId = $id }) }
    Nested = { param($id) $F.members['some-parent'] = @($id) }
  }
  $used = @{}; $old = @{}
  foreach ($k in $kinds.Keys) {
    $old[$k] = (Add-FakeGroup "PIM-SG-T-$k" -Created '2026-09-01T10:00:00Z').id
    $used[$k] = (Add-FakeGroup "PIM-SG-T-$k" -Created '2026-09-09T10:00:00Z').id
    & $kinds[$k] $used[$k]
  }
  $both1 = Add-FakeGroup 'PIM-SG-T-Both' -Created '2026-09-01T10:00:00Z'; $both2 = Add-FakeGroup 'PIM-SG-T-Both' -Created '2026-09-02T10:00:00Z'
  $F.members[$both1.id] = @('aaaaaaaa-0000-0000-0000-000000000001'); $F.owners[$both2.id] = @('aaaaaaaa-0000-0000-0000-000000000002')
  $txt = Get-DupRun { & $dups -TenantId fake.dev -OutDir $tmp }
  $p = Get-DupPlan
  $del = @($p.ops | ForEach-Object { ($_.uri -split '/')[-1] })
  foreach ($k in $kinds.Keys) {
    Assert-True ($del -notcontains $used[$k]) "the copy with a $k reference is kept`n$txt"
    Assert-True ($del -contains $old[$k]) "the unused $k copy is planned"
  }
  Assert-True (($del -notcontains $both1.id) -and ($del -notcontains $both2.id)) 'two used copies: nothing deleted'
  Assert-True ($txt -match 'PIM-SG-T-Both exists 2 times and 2 copies are in use') 'two used copies: merge by hand'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'duplicates: Azure and Intune copies need -AzureChecked / -IntuneChecked; a permission gap stops the run' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Add-FakeGroup 'PIM-SG-AZ-Sub-Owner' -Created '2026-09-01T10:00:00Z' | Out-Null; $az2 = Add-FakeGroup 'PIM-SG-AZ-Sub-Owner' -Created '2026-09-02T10:00:00Z'
  Add-FakeGroup 'INT-SG-DEV-EU-NL-All' -RoleAssignable $false -Created '2026-09-01T10:00:00Z' | Out-Null; $in2 = Add-FakeGroup 'INT-SG-DEV-EU-NL-All' -RoleAssignable $false -Created '2026-09-02T10:00:00Z'
  $txt = Get-DupRun { & $dups -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'nothing to delete') "nothing planned without the checks`n$txt"
  Assert-True ($txt -match "az role assignment list --assignee $($az2.id)") 'says how to check Azure'
  Assert-True ($txt -match '-IntuneChecked') 'says how to check Intune'
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp -AzureChecked -IntuneChecked }
  $del = @((Get-DupPlan).ops | ForEach-Object { ($_.uri -split '/')[-1] } | Sort-Object)
  Assert-Eq ($del -join ',') ((@($az2.id, $in2.id) | Sort-Object) -join ',') 'with the checks: the newer copies'
  # an Intune role assignment uses the newer INT copy: kept even with -IntuneChecked
  $global:Fake.intune.assignments.Add(@{ id = 'ia1'; displayName = 'INT-RBAC-HelpDesk-EU-NL'; members = @(); resourceScopes = @($in2.id); roleScopeTagIds = @(); roleDefinitionId = 'ir-HelpDeskOperator' })
  $txt = Get-DupRun { & $dups -TenantId fake.dev -OutDir $tmp -AzureChecked -IntuneChecked }
  $del = @((Get-DupPlan).ops | ForEach-Object { ($_.uri -split '/')[-1] })
  Assert-True ($del -notcontains $in2.id -and $txt -match 'Intune role assignment INT-RBAC-HelpDesk-EU-NL') 'Intune reference keeps the copy'
  New-FakeTenant -Scopes @($readScopes | Where-Object { $_ -ne 'Policy.Read.All' }) -RoleNames $roleNames
  Assert-Throws { & $dups -TenantId fake.dev -OutDir $tmp } 'Policy.Read.All' 'Conditional Access unreadable: stop'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'duplicates: apply deletes exactly the approved copies; a copy that gained a member since makes the plan stale' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $k1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-01T10:00:00Z'; $d1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-02T10:00:00Z'; $d2 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-03T10:00:00Z'
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'duplicates')[-1].FullName
  Assert-Throws { & $dups -TenantId fake.dev -OutDir $tmp -Apply -Yes } 'needs -PlanFile' 'no plan file'
  $global:Fake.members[$d2.id] = @('aaaaaaaa-0000-0000-0000-000000000001')      # somebody used a copy in between
  Assert-Throws { & $dups -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes } 'stale plan' 'stale'
  Assert-Eq (Get-FakeWrites).Count 0 'writes with a stale plan'
  $global:Fake.members.Remove($d2.id)
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes }
  $w = @(Get-FakeWrites)
  Assert-Eq (@($w | ForEach-Object { "$($_.Method) $(($_.Uri -split '/')[-1])" } | Sort-Object) -join ',') ((@("DELETE $($d1.id)", "DELETE $($d2.id)") | Sort-Object) -join ',') 'exactly the two planned deletions'
  Assert-Eq @($global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-Ops' }).Count 1 'one copy left'
  Assert-Eq @($global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-Ops' })[0].id $k1.id 'the oldest'
  $txt = Get-DupRun { & $dups -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'nothing to delete') 'nothing left'
}
