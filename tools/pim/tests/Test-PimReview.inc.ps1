# The second review (25 Sep 2026, of the 2.1 scripts themselves): each defect
# it reproduced, as a test. Dot-sourced by Test-PimScripts.ps1 (uses its
# helpers, $tmp, $pim, $allScopes, $roleNames, $baseline, $regions, $dups, and
# New-RegionTenant / New-RegionsJson / Get-RunText from the regions include).
Import-Module (Join-Path $pim 'PimCommon.psm1') -Force -DisableNameChecking
function Get-Reads { return @($global:FakeCalls | Where-Object { $_.Method -eq 'GET' -and $_.Uri -notmatch '/organization' }) }

Test-It 'review 1: the tenant check cannot be skipped — Customers.json is required, keys in any case, every source must agree, the plan names its tenant' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $cc = Join-Path $tmp 'cc2'; New-Item -ItemType Directory -Path $cc -Force | Out-Null
  $ccs = Join-Path $cc 'Connect-Customer.ps1'
  Set-Content $ccs 'param([string]$Customer, [string[]]$Services) Connect-MgGraph'
  Assert-Throws { & $baseline -ConfigFile $small -Customer DEVCF -ConnectScript $ccs -OutDir $tmp } 'Customers.json not found' 'no Customers.json: stop'
  Set-Content (Join-Path $cc 'Customers.json') '{ "devcf": { "tenantId": "11111111-1111-1111-1111-111111111111" }, "OTHER": { "tenantid": "22222222-2222-2222-2222-222222222222" }, "NOID": { "Organization": "x" } }'
  Invoke-Quiet { & $baseline -ConfigFile $small -Customer DEVCF -ConnectScript $ccs -OutDir $tmp }
  Assert-True @(Get-Plans 'baseline').Count 'keys in any case resolve'
  Assert-Throws { & $baseline -ConfigFile $small -Customer OTHER -ConnectScript $ccs -OutDir $tmp } 'Customers.json \(OTHER\) says 22222222' 'lower-case tenantid still checked'
  Assert-Throws { & $baseline -ConfigFile $small -Customer NOID -ConnectScript $ccs -OutDir $tmp } 'no tenant id' 'a key without a tenant id stops'
  Assert-Throws { & $baseline -ConfigFile $small -Customer DEVCF -ConnectScript $ccs -TenantId 22222222-2222-2222-2222-222222222222 -OutDir $tmp } 'named twice' '-Customer and -TenantId disagree'
  # a plan for another tenant, with a hash that matches its own operations
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $pf = (Get-Plans 'baseline')[-1].FullName
  $doc = Get-Content $pf -Raw | ConvertFrom-Json -AsHashtable
  $doc.tenantId = '22222222-2222-2222-2222-222222222222'
  $doc.hash = Get-PimPlanHash ([ordered]@{ schema = $doc.schema; kind = $doc.kind; tenantId = $doc.tenantId; ops = @($doc.ops) })
  $other = Join-Path $tmp 'plan-other-tenant.json'; ($doc | ConvertTo-Json -Depth 40) | Set-Content $other
  $global:FakeCalls.Clear()
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $other -Yes } 'the plan file says 22222222' 'a plan for another tenant stops at the connection'
  Assert-Eq (Get-Reads).Count 0 'nothing of the tenant read'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'review 2: an approved plan file whose operations were edited is refused' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $pf = (Get-Plans 'baseline')[-1].FullName
  $doc = Get-Content $pf -Raw | ConvertFrom-Json -AsHashtable
  $doc.ops = @($doc.ops | Where-Object { $_.key -ne 'group:PIM-SG-Approvers' })
  $t = Join-Path $tmp 'plan-edited.json'; ($doc | ConvertTo-Json -Depth 40) | Set-Content $t
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $t -Yes } 'was changed after it was written' 'edited plan'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'review 3: the tenant is checked again after the typed confirmation, and each copy right before its deletion' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $pf = (Get-Plans 'baseline')[-1].FullName
  function global:Read-Host { param($Prompt) Add-FakeGroup 'PIM-SG-M365-SecOps' | Out-Null; return 'fake.dev' }   # somebody acts while the prompt waits
  try { Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $pf } 'stale plan' 'a change during the prompt stops the run' }
  finally { Remove-Item function:global:Read-Host -ErrorAction SilentlyContinue }
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $k1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-01T10:00:00Z'; $d1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-02T10:00:00Z'; $d2 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-03T10:00:00Z'
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp }
  $pf = (Get-Plans 'duplicates')[-1].FullName
  $global:FakeBeforeWrite = { param($m, $u) if ($m -eq 'DELETE') { $global:Fake.members[$d2.id] = @('aaaaaaaa-0000-0000-0000-000000000001'); $global:FakeBeforeWrite = $null } }
  Assert-Throws { & $dups -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $pf -Yes } 'failed' 'the copy that gained a member mid-run is not deleted'
  Assert-True (@($global:Fake.groups | Where-Object { $_.id -eq $d2.id }).Count -eq 1) 'that copy still exists'
  Assert-True (@($global:Fake.groups | Where-Object { $_.id -eq $k1.id }).Count -eq 1) 'the kept copy still exists'
}

Test-It 'review 4 + 5 + 10: -FixRules never makes an assigned unit dynamic; tag targets are kept whatever their shape; a one-region file loads' {
  New-RegionTenant
  $global:Fake.aus.Add(@{ id = 'au-assigned'; displayName = 'AU-EU-NL-Users'; membershipType = $null; membershipRule = $null; membershipRuleProcessingState = $null; isMemberManagementRestricted = $false })
  $one = New-RegionsJson 'regions.one.json' @($rowNL)
  $txt = Get-RunText { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp -FixRules }
  Assert-True ($txt -notmatch 'THREW') "one-region file plans`n$txt"
  Assert-True ($txt -match 'AU-EU-NL-Users is an ASSIGNED unit') 'assigned unit reported'
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-True (-not @($p.ops | Where-Object { $_.key -eq 'aufix:AU-EU-NL-Users' }).Count) 'no rule rewrite for an assigned unit'
  # tags: an existing target of the older shape stays in the list
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp }
  Invoke-Quiet { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  $F = $global:Fake
  $tag = $F.intune.tags | Where-Object { $_.displayName -eq 'INT-TAG-EU-NL' }
  $dev = $F.groups | Where-Object { $_.displayName -eq 'INT-SG-DEV-EU-NL-All' }
  $F.intune.tagAssign[$tag.id] = @(@{ '@odata.type' = '#microsoft.graph.groupAssignmentTarget'; groupId = 'keep-me' })
  Invoke-Quiet { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp }
  Invoke-Quiet { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  Assert-Eq ((Get-FakeTagIds $tag.id | Sort-Object) -join ',') ((@('keep-me', $dev.id) | Sort-Object) -join ',') 'the other target is kept, the device group added'
  $F.intune.tagAssign[$tag.id] = @(@{ '@odata.type' = '#microsoft.graph.allDevicesAssignmentTarget' })
  $txt = Get-RunText { & $regions -RegionsFile $one -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'THREW: .*blocking' -and $txt -match 'does not know') 'an unknown target kind blocks instead of being dropped'
}

Test-It 'review 6 + 7 + 8: duplicates — tags by id, Intune read always (scope members too), legacy INT names, approver copies need -AzureChecked' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $F = $global:Fake
  $a1 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-01T10:00:00Z'; $a2 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-02T10:00:00Z'
  $F.intune.tags.Add(@{ id = 'tag-1'; displayName = 'INT-TAG-X' }); $F.intune.tags.Add(@{ id = 'tag-2'; displayName = 'INT-TAG-X' })
  $F.intune.tagAssign['tag-1'] = @($a2.id); $F.intune.tagAssign['tag-2'] = @('someone-else')
  $b1 = Add-FakeGroup 'PIM-SG-M365-Helpdesk' -Created '2026-09-01T10:00:00Z'; $b2 = Add-FakeGroup 'PIM-SG-M365-Helpdesk' -Created '2026-09-02T10:00:00Z'
  $F.intune.assignments.Add(@{ id = 'ia1'; displayName = 'INT-RBAC-X'; members = @(); resourceScopes = @(); scopeMembers = @($b2.id); roleScopeTagIds = @(); roleDefinitionId = 'ir-HelpDeskOperator' })
  $c1 = Add-FakeGroup 'SG-PIM-INT-Ops' -Created '2026-09-01T10:00:00Z'; $c2 = Add-FakeGroup 'SG-PIM-INT-Ops' -Created '2026-09-02T10:00:00Z'
  $F.intune.assignments.Add(@{ id = 'ia2'; displayName = 'INT-RBAC-Y'; members = @($c2.id); resourceScopes = @(); roleScopeTagIds = @(); roleDefinitionId = 'ir-HelpDeskOperator' })
  $e1 = Add-FakeGroup 'PIM-SG-Approvers' -RoleAssignable $false -Created '2026-09-01T10:00:00Z'; $e2 = Add-FakeGroup 'PIM-SG-Approvers' -RoleAssignable $false -Created '2026-09-02T10:00:00Z'
  $ga = Add-FakeGroup 'PIM-SG-M365-GlobalAdmin'
  ($F.groupPolicies[$ga.id].rules | Where-Object { $_.id -eq 'Approval_EndUser_Assignment' }).setting.approvalStages[0].primaryApprovers = @(@{ '@odata.type' = '#microsoft.graph.groupMembers'; groupId = $e2.id })
  $txt = Get-RunText { & $dups -TenantId fake.dev -OutDir $tmp -IntuneChecked -AzureChecked }
  $del = @((Get-DupPlan).ops | ForEach-Object { $_.groupId })
  Assert-True ($del -notcontains $a2.id -and $del -contains $a1.id) "tag targets keyed by tag id: the targeted copy is kept`n$txt"
  Assert-True ($del -notcontains $b2.id -and $del -contains $b1.id) 'an Intune scope member is kept'
  Assert-True ($del -notcontains $c2.id -and $del -contains $c1.id) 'a legacy SG-PIM-INT copy in an Intune assignment is kept'
  Assert-True ($del -notcontains $e2.id -and $del -contains $e1.id) 'the approver named in a membership policy is kept'
  $txt = Get-RunText { & $dups -TenantId fake.dev -OutDir $tmp }
  $del = @((Get-DupPlan).ops | ForEach-Object { $_.groupId })
  Assert-True ($del -contains $a1.id -and $del -notcontains $c1.id) 'without -IntuneChecked a legacy SG-PIM-INT copy waits (its policy assignments are not readable here)'
  $txt = Get-RunText { & $dups -TenantId fake.dev -OutDir $tmp -IntuneChecked }
  $del = @((Get-DupPlan).ops | ForEach-Object { $_.groupId })
  Assert-True ($del -notcontains $e1.id) 'approver copies wait for -AzureChecked'
  Assert-True ($txt -match 'Azure resource role settings') 'and say why'
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames -NoIntune
  Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-01T10:00:00Z' | Out-Null; $n2 = Add-FakeGroup 'PIM-SG-M365-Ops' -Created '2026-09-02T10:00:00Z'
  $txt = Get-RunText { & $dups -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -match 'nothing to delete' -and $txt -match 'run with -IntuneChecked') 'Intune unreadable: nothing deleted, and why'
  Invoke-Quiet { & $dups -TenantId fake.dev -OutDir $tmp -IntuneChecked }
  Assert-Eq (@((Get-DupPlan).ops | ForEach-Object { $_.groupId }) -join ',') $n2.id 'with -IntuneChecked: the newer copy'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'review 9 + deferred: no placeholder that nothing produces; a membership policy not yet available is reported, not counted as done' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $ga = Add-FakeGroup 'PIM-SG-M365-GlobalAdmin'
  $txt = Get-RunText { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Eligibilities }
  Assert-True ($txt -notmatch 'THREW') "plans`n$txt"
  $p = Get-Content (Get-Plans 'baseline')[-1].FullName -Raw
  Assert-True ($p -notmatch '\{\{group:') 'no placeholder in a plan that creates no group'
  Assert-True ($txt -match 'the group does not exist \(Groups not included\)') 'the rest is reported'
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Eligibilities -Apply -PlanFile (Get-Plans 'baseline')[-1].FullName -Yes }
  Assert-True (@($global:Fake.elig | Where-Object { $_.principalId -eq $ga.id }).Count -ge 3) 'the existing group got its eligibilities'
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $global:FakeNoPolicyOnCreate = $true
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Groups, GroupPolicies }
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Groups, GroupPolicies -Apply -PlanFile (Get-Plans 'baseline')[-1].FullName -Yes } 'deferred' 'deferred is not done'
  $global:FakeNoPolicyOnCreate = $false
}
