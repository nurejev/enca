# The framework's custom Intune role (32420). Dot-sourced by Test-PimScripts.ps1
# after Test-PimRegions.inc.ps1 (uses New-RegionTenant, $regionsJson, Get-RunText).
# cloudfellows.dev, 28 Sep 2026: "Intune role INT-ROLE-Regional-Ops differs
# from the template — missing: <all 32 actions>; extra: —". The role came from a
# run before 32416, which checked the actions against the operations' short
# action names, recognised none and created the role with none. Reading is now
# done on the role itself, in every shape Intune returns; -FixIntuneRoles adds
# what is missing and never removes an action.
function Get-RegionTemplateActions { @((Get-Content (Join-Path $pim 'pim-regions-template.json') -Raw | ConvertFrom-Json -AsHashtable).intuneRoles[0].allowed) }
function Add-FakeIntuneRole([string]$Name, [string[]]$Allowed, [string]$Shape = 'resourceActions') {
  $r = @{ id = "ir-$([guid]::NewGuid().ToString('N').Substring(0, 8))"; displayName = $Name; isBuiltIn = $false; allowed = @($Allowed); shape = $Shape }
  $global:Fake.intune.roles.Add($r); return $r
}

Test-It 'intune role: the 28 Sep state — the role exists with no actions: reported with the count, nothing planned without -FixIntuneRoles' {
  New-RegionTenant
  $r = Add-FakeIntuneRole 'INT-ROLE-Regional-Ops' @()
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $n = (Get-RegionTemplateActions).Count
  Assert-True ($txt -match "Intune role INT-ROLE-Regional-Ops lacks $n of the template's $n actions \(it has none at all\)") "reported with the count`n$txt"
  Assert-True ($txt -match '-FixIntuneRoles plans adding them \(none removed\)') 'names the switch'
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  Assert-True (-not @($p.ops | Where-Object { $_.key -like 'introle*' }).Count) 'no role operation without the switch'
  Assert-Eq @($global:Fake.intune.roles | Where-Object { $_.displayName -eq 'INT-ROLE-Regional-Ops' }).Count 1 'never a second role'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'intune role: a role whose actions the list leaves out, or keeps as permissions[].actions, is read from the role itself — no false finding' {
  New-RegionTenant
  $global:FakeIntuneListBare = $true
  Add-FakeIntuneRole 'INT-ROLE-Regional-Ops' (Get-RegionTemplateActions) 'actions' | Out-Null
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  Assert-True ($txt -notmatch 'Intune role INT-ROLE-Regional-Ops (lacks|carries)') "complete role, no finding`n$txt"
  Assert-True (@($global:FakeCalls | Where-Object { $_.Method -eq 'GET' -and $_.Uri -match '/deviceManagement/roleDefinitions/ir-' }).Count) 'the role was read by id'
}

Test-It 'intune role: -FixIntuneRoles adds the missing actions, keeps an extra one, backs up the old list; planning again is clean' {
  New-RegionTenant
  $tplA = Get-RegionTemplateActions
  $r = Add-FakeIntuneRole 'INT-ROLE-Regional-Ops' @($tplA[0], 'Microsoft.Intune_Extra_Custom')
  $global:Fake.intune.ops += 'Microsoft.Intune_Extra_Custom'
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Include Intune -FixIntuneRoles }
  Assert-True ($txt -match "carries 1 action\(s\) the template does not: Microsoft.Intune_Extra_Custom — kept") "the extra is reported and kept`n$txt"
  $p = Get-Content (Get-Plans 'regions')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $op = @($p.ops | Where-Object { $_.key -eq 'introlefix:INT-ROLE-Regional-Ops' })[0]
  Assert-True $op 'a role fix planned'
  Assert-Eq $op.method 'PATCH' 'PATCH on the role'
  $body = @($op.body.rolePermissions[0].resourceActions[0].allowedResourceActions)
  Assert-Eq $body.Count ($tplA.Count + 1) 'every template action plus the extra'
  Assert-True ($body -contains 'Microsoft.Intune_Extra_Custom') 'the extra is not removed'
  Assert-Eq (Get-FakeWrites).Count 0 'planning writes nothing'
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Include Intune -FixIntuneRoles -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  Assert-True ($txt -match 'backup of') "a backup first`n$txt"
  $bk = Get-Content (@(Get-ChildItem $tmp -Filter 'pim-backup.regions.*.json' | Where-Object { $_.Name -notlike '*.late.json' } | Sort-Object LastWriteTime)[-1].FullName) -Raw | ConvertFrom-Json -AsHashtable
  $item = @($bk.items | Where-Object { $_.key -eq 'introlefix:INT-ROLE-Regional-Ops' })[0]
  Assert-Eq (@($item.before.rolePermissions[0].resourceActions[0].allowedResourceActions) -join ',') "$($tplA[0]),Microsoft.Intune_Extra_Custom" 'the old list is in the backup'
  Assert-Eq @($r.allowed).Count ($tplA.Count + 1) 'the role now has every action'
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Include Intune -FixIntuneRoles }
  Assert-True ($txt -notmatch 'introlefix|lacks') "nothing left to add`n$txt"
}

Test-It 'intune role: an action the tenant does not know blocks the fix — nothing is added' {
  New-RegionTenant
  Add-FakeIntuneRole 'INT-ROLE-Regional-Ops' @() | Out-Null
  $global:Fake.intune.ops = @($global:Fake.intune.ops | Select-Object -Skip 1)
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Include Intune -FixIntuneRoles }
  Assert-True ($txt -match "does not know 1 of the missing actions") "blocked`n$txt"
  Assert-True ($txt -match 'THREW: .*blocking') 'no plan'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}
