# Replication after a creation (32418). Dot-sourced by Test-PimScripts.ps1 after
# Test-PimRegions.inc.ps1 (uses New-RegionTenant, $regionsJson, Get-RunText).
# cloudfellows.dev, 28 Sep 2026: New-PimRegions.ps1 -Apply created AU-EU-NL-*
# and the EU-NL groups, then the first eligibility — 0.7 s after its group was
# made — came back 404 SubjectNotFound and the run stopped there.
function Get-LastOutcome([string]$kind) { Get-Content (@(Get-ChildItem -Path $tmp -Filter "pim-outcome.$kind.*.json" | Sort-Object LastWriteTime)[-1].FullName) -Raw | ConvertFrom-Json -AsHashtable }

Test-It 'replication: a new group PIM does not know yet is waited for — the eligibility is made on a later try, the run carries on' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $global:FakeLag = 2
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  Assert-True ($txt -match 'not replicated yet \(404\), trying again in 5 s') "the wait is shown`n$txt"
  $o = Get-LastOutcome 'regions'
  Assert-Eq @($o.ops | Where-Object { $_.status -eq 'failed' -or $_.status -eq 'not run' }).Count 0 'nothing failed, nothing left out'
  $first = @($o.ops | Where-Object { $_.key -eq 'act:Helpdesk Administrator:PIM-SG-EU-NL-Helpdesk:AU-EU-NL-Users' })[0]
  Assert-True ($first.status -like 'done*after 2 retries') "the first eligibility of the new group: done after two tries ($($first.status))"
  $hd = $global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-EU-NL-Helpdesk' }
  Assert-Eq @($global:Fake.active | Where-Object { $_.principalId -eq $hd.id }).Count 4 'all four Helpdesk assignments exist, once each (3.0: active at the unit)'
  Assert-Eq ($global:FakeSleeps[0..1] -join ',') '5,10' 'waits 5 s, then 10 s'
}

Test-It 'replication: a subject that never appears fails after the last wait; the rest is not run, nothing is written twice' {
  New-RegionTenant
  Invoke-Quiet { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp }
  $global:FakeLag = 99
  $txt = Get-RunText { & $regions -RegionsFile $regionsJson -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'regions')[-1].FullName -Yes }
  $o = Get-LastOutcome 'regions'
  $failed = @($o.ops | Where-Object { $_.status -eq 'failed' })
  Assert-Eq $failed.Count 1 'one operation failed'
  Assert-Eq $failed[0].key 'act:Helpdesk Administrator:PIM-SG-EU-NL-Helpdesk:AU-EU-NL-Users' 'the first eligibility'
  Assert-True ($failed[0].error -match 'SubjectNotFound') 'the Graph error is kept'
  Assert-Eq ($global:FakeSleeps -join ',') '5,10,15,30,30,30' 'six waits, two minutes in all, then it gives up'
  Assert-True (@($o.ops | Where-Object { $_.status -eq 'not run' }).Count -gt 10) 'the rest is not run'
  Assert-Eq ($global:Fake.elig.Count + $global:Fake.active.Count) 0 'no assignment made'
  Assert-True ($txt -match 'THREW') "the run ends with an error`n$txt"
}

Test-It 'replication: only a 404 is retried — a missing subject, or an object this run made; any other failure stops at once' {
  Import-Module (Join-Path $pim 'PimCommon.psm1') -Force -DisableNameChecking
  $sub = 'Response status code does not indicate success: NotFound (Not Found). {"error":{"code":"SubjectNotFound","message":"The subject is not found."}}'
  $res = 'Response status code does not indicate success: NotFound (Not Found). {"error":{"code":"Request_ResourceNotFound"}}'
  Assert-True (Test-PimNotReplicatedYet $sub $false) 'SubjectNotFound: retried even for an object made earlier'
  Assert-True (Test-PimNotReplicatedYet $res $true) 'a 404 on an operation naming an object this run made: retried'
  Assert-True (-not (Test-PimNotReplicatedYet $res $false)) 'a 404 on anything else: not retried'
  Assert-True (-not (Test-PimNotReplicatedYet 'Response status code does not indicate success: Forbidden (Forbidden).' $true)) '403: not retried'
  Assert-True (-not (Test-PimNotReplicatedYet 'Response status code does not indicate success: BadRequest (Bad Request). {"error":{"code":"ResourceNotFound"}}' $true)) 'a 400 is never retried, whatever its code says'
  Assert-True (-not (Test-PimNotReplicatedYet 'Response status code does not indicate success: InternalServerError (Internal Server Error).' $true)) '500: not retried (it may have written)'
}

Test-It 'replication: the baseline waits the same way for the groups it just made' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $global:FakeLag = 1
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile (Get-Plans 'baseline')[-1].FullName -Yes }
  $o = Get-LastOutcome 'baseline'
  Assert-Eq @($o.ops | Where-Object { $_.status -eq 'failed' }).Count 0 'nothing failed'
  Assert-True (@($o.ops | Where-Object { $_.key -like 'elig:*' -and $_.status -like '*after 1 retry' }).Count) 'eligibilities made after a wait'
  $ga = $global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-GlobalAdmin' }
  Assert-True (@($global:Fake.elig | Where-Object { $_.principalId -eq $ga.id }).Count -ge 3) 'GlobalAdmin eligible'
}
