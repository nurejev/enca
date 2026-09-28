# Intune scope tag auto-assignment (32419). Dot-sourced by Test-PimScripts.ps1
# after Test-PimRegions.inc.ps1 (uses New-RegionTenant, $regionsJson, Get-RunText).
# cloudfellows.dev, 28 Sep 2026: POST roleScopeTags/1/assign with a
# scopeTagGroupAssignmentTarget (the shape Graph's docs show) came back 400
# NotSupported — "Role Scope Tags only supports targeting to direct security
# group memberships". The fake now refuses that shape the same way.

Test-It 'scope tags: the auto-assignment is a direct group target (groupAssignmentTarget + groupId) and Intune takes it' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $op = @($p.ops | Where-Object { $_.key -eq 'tagassign:INT-TAG-EU-NL' })[0]
  $t = $op.body.assignments[0].target
  Assert-Eq $t['@odata.type'] '#microsoft.graph.groupAssignmentTarget' 'a direct group target'
  Assert-Eq $t.groupId '{{group:INT-SG-DEV-EU-NL-All}}' 'the device scope group, by id'
  Assert-True (-not $t.Contains('entraObjectId') -and -not $t.Contains('targetType')) 'none of the refused shape''s fields'
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  Assert-True ($txt -notmatch 'NotSupported') "Intune took it`n$txt"
  $F = $global:Fake
  $tag = $F.intune.tags | Where-Object { $_.displayName -eq 'INT-TAG-EU-NL' }
  $dev = $F.groups | Where-Object { $_.displayName -eq 'INT-SG-DEV-EU-NL-All' }
  Assert-Eq ((Get-FakeTagIds $tag.id) -join ',') $dev.id 'the tag is auto-assigned from the device group'
  Assert-True (@($F.intune.assignments | Where-Object { $_.displayName -eq 'INT-RBAC-HelpDesk-EU-NL' }).Count) 'and the run went on to the Intune assignments'
}

Test-It 'scope tags: the 28 Sep state — tag made, not assigned; a target read back in the newer shape goes back as a group target, its filter kept' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  $F = $global:Fake
  $tag = $F.intune.tags | Where-Object { $_.displayName -eq 'INT-TAG-EU-NL' }
  $dev = $F.groups | Where-Object { $_.displayName -eq 'INT-SG-DEV-EU-NL-All' }
  $F.intune.tagAssign[$tag.id] = @(@{ '@odata.type' = '#microsoft.graph.scopeTagGroupAssignmentTarget'; targetType = 'device'; entraObjectId = 'other-group'; deviceAndAppManagementAssignmentFilterId = 'filter-1'; deviceAndAppManagementAssignmentFilterType = 'include' })
  $global:FakeCalls.Clear()
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-Eq (@($p.ops | ForEach-Object { $_.key }) -join ',') 'tagassign:INT-TAG-EU-NL' 'only the assignment is planned'
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  $got = @($F.intune.tagAssign[$tag.id])
  Assert-Eq $got.Count 2 'the other target kept, the device group added'
  Assert-True (-not @($got | Where-Object { $_['@odata.type'] -ne '#microsoft.graph.groupAssignmentTarget' }).Count) 'both sent as direct group targets'
  $other = @($got | Where-Object { $_.groupId -eq 'other-group' })[0]
  Assert-Eq "$($other.deviceAndAppManagementAssignmentFilterId)/$($other.deviceAndAppManagementAssignmentFilterType)" 'filter-1/include' 'its assignment filter kept'
  Assert-True (@($got | Where-Object { $_.groupId -eq $dev.id }).Count) 'the device group is a target'
}
