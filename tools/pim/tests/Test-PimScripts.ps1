# Tests for tools/pim: every script against a fake Graph (FakeGraph.ps1), no
# network. The reliability review's pass conditions, as tests:
#   * preview and planning make ZERO non-GET calls — renames and duplicates too;
#   * -Apply without an approved plan, or with a plan the tenant no longer
#     matches, writes nothing;
#   * a missing Graph permission or the wrong tenant stops before any write;
#   * applying, then planning again, leaves nothing to do (idempotent);
#   * a backup is written before rules change, and restores them;
#   * approvers from JSON arrive as a list; unsafe region rows never reach a rule;
#   * an Intune read that fails blocks the Intune part instead of guessing;
#   * a duplicate copy that is referenced anywhere is never deleted.
# Run:  pwsh -NoProfile -File tools/pim/tests/Test-PimScripts.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pim = Split-Path -Parent $here
. (Join-Path $here 'FakeGraph.ps1')
$script:pass = 0; $script:fail = 0
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("pimtest-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null

function Test-It([string]$Name, [scriptblock]$Body) {
  try { & $Body; $script:pass++; Write-Host "ok   $Name" -ForegroundColor Green }
  catch { $script:fail++; Write-Host "FAIL $Name`n     $($_.Exception.Message)`n     $($_.InvocationInfo.PositionMessage -replace "`n", "`n     ")" -ForegroundColor Red }
}
function Assert-True($c, [string]$m) { if (-not $c) { throw "assert: $m" } }
function Assert-Eq($a, $b, [string]$m) { if ("$a" -ne "$b") { throw "assert: $m — expected '$b', got '$a'" } }
function Assert-Throws([scriptblock]$b, [string]$like, [string]$m) {
  $threw = $false
  try { & $b *> $null } catch { $threw = $true; if ($like -and $_.Exception.Message -notmatch $like) { throw "assert: $m — threw '$($_.Exception.Message)', expected /$like/" } }
  if (-not $threw) { throw "assert: $m — did not throw" }
}
function Invoke-Quiet([scriptblock]$b) { & $b 6>$null *>$null }
function Get-Plans([string]$kind) { @(Get-ChildItem -Path $tmp -Filter "pim-plan.$kind.*.json" | Sort-Object LastWriteTime) }

$readScopes = @('Directory.Read.All', 'RoleManagement.Read.Directory', 'RoleManagementPolicy.Read.Directory', 'RoleManagementPolicy.Read.AzureADGroup', 'PrivilegedEligibilitySchedule.Read.AzureADGroup', 'PrivilegedAssignmentSchedule.Read.AzureADGroup', 'AdministrativeUnit.Read.All', 'DeviceManagementRBAC.Read.All', 'Policy.Read.All')
$allScopes = @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup', 'AdministrativeUnit.ReadWrite.All', 'DeviceManagementRBAC.ReadWrite.All', 'Policy.Read.All')
$small = Join-Path $pim 'pim-baseline.small.json'
$cfgSmall = Get-Content $small -Raw | ConvertFrom-Json -AsHashtable
$roleNames = @($cfgSmall.EntraRoles.Policies.Keys)
$baseline = Join-Path $pim 'New-PimBaseline.ps1'
$regions = Join-Path $pim 'New-PimRegions.ps1'
$dups = Join-Path $pim 'Find-PimDuplicates.ps1'

# ---------------------------------------------------------------------------
Test-It 'baseline: planning makes zero writes and writes a plan (rename, create, eligibilities, policies)' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Add-FakeGroup 'SG-PIM-M365-Ops' | Out-Null
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  Assert-Eq (Get-FakeWrites).Count 0 'non-GET calls while planning'
  $p = Get-Content (Get-Plans 'baseline')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $keys = @($p.ops | ForEach-Object { $_.key })
  Assert-True ($keys -match '^rename:').Count 'a rename op'
  Assert-True ($keys -contains 'group:PIM-SG-M365-GlobalAdmin') 'GlobalAdmin created'
  Assert-True ($keys -contains 'group:PIM-SG-Approvers') 'approvers created'
  Assert-True ($keys -contains 'elig:Global Administrator:PIM-SG-M365-GlobalAdmin') 'GA eligibility'
  Assert-True ($keys -match '^gpol:PIM-SG-M365-Ops:').Count 'the renamed group''s policy planned rule by rule'
  Assert-True ($keys -contains 'gpolnew:PIM-SG-INT-Ops') 'a new group''s policy last'
  Assert-True ($p.hash.Length -eq 64) 'the plan carries its SHA-256'
  $ra = @($p.ops | Where-Object { $_.key -eq 'group:PIM-SG-Approvers' })[0].body.isAssignableToRole
  Assert-True (-not $ra) 'approvers are a plain group'
}

Test-It 'baseline: -Apply without -PlanFile, or with a stale plan, writes nothing' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'baseline')[-1].FullName
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -Yes } 'needs -PlanFile' 'no plan file'
  Assert-Eq (Get-FakeWrites).Count 0 'writes without a plan'
  Add-FakeGroup 'PIM-SG-M365-SecOps' | Out-Null      # somebody made a group in between
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes } 'stale plan' 'stale plan'
  Assert-Eq (Get-FakeWrites).Count 0 'writes with a stale plan'
}

Test-It 'baseline: apply the approved plan, then planning again finds nothing (idempotent); membership policies set' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'baseline')[-1].FullName
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes }
  Assert-True ((Get-FakeWrites).Count -gt 20) 'the plan ran'
  $ga = $global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-M365-GlobalAdmin' }
  Assert-True $ga.isAssignableToRole 'GlobalAdmin is role-assignable'
  $e = @($global:Fake.elig | Where-Object { $_.principalId -eq $ga.id -and $_.directoryScopeId -eq '/' })
  Assert-True ($e.Count -ge 3) 'GA, PRA, PAA eligible at tenant scope (small profile folds Tier0 into GlobalAdmin)'
  $rules = $global:Fake.groupPolicies[$ga.id].rules
  $act = $rules | Where-Object { $_.id -eq 'Expiration_Admin_Assignment' }
  Assert-True ($act.isExpirationRequired -and $act.maximumDuration -eq 'P365D') 'GroupMember: active membership at most a year'
  $appr = $rules | Where-Object { $_.id -eq 'Approval_EndUser_Assignment' }
  $apg = $global:Fake.groups | Where-Object { $_.displayName -eq 'PIM-SG-Approvers' }
  Assert-Eq $appr.setting.approvalStages[0].primaryApprovers[0].groupId $apg.id 'the approver group resolved by id'
  $rec = ($rules | Where-Object { $_.id -eq 'Notification_Admin_EndUser_Assignment' }).notificationRecipients
  Assert-Eq ($rec -join ',') 'pim-alerts@fake.dev' 'the alert address moved to a verified domain'
  $global:FakeCalls.Clear()
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  Assert-Eq (Get-FakeWrites).Count 0 'writes on the second plan'
  $n = @(Get-Plans 'baseline').Count
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  Assert-Eq @(Get-Plans 'baseline').Count $n 'no new plan: nothing left to do'
  Assert-True @(Get-ChildItem $tmp -Filter 'pim-outcome.baseline.*.json').Count 'an outcome log'
}

Test-It 'baseline: duplicates and a group that is not role-assignable block the plan; nothing written' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Add-FakeGroup 'PIM-SG-M365-Ops' | Out-Null; Add-FakeGroup 'PIM-SG-M365-Ops' | Out-Null
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp } 'blocking' 'duplicate'
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Add-FakeGroup 'PIM-SG-M365-Ops' -RoleAssignable $false | Out-Null
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp } 'blocking' 'not role-assignable'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'baseline: a missing permission and the wrong tenant stop before anything is written' {
  New-FakeTenant -Scopes @('Directory.Read.All') -RoleNames $roleNames
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp } 'AddGraphScopes' 'missing read permission names the fix'
  New-FakeTenant -Scopes $readScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp }
  $plan = (Get-Plans 'baseline')[-1].FullName
  Assert-Throws { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $plan -Yes } 'Group.ReadWrite.All' 'missing write permission'
  Assert-Throws { & $baseline -ConfigFile $small -TenantId other.example -OutDir $tmp } 'was asked for' 'wrong tenant'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'connect: -Customer runs Connect-Customer.ps1 -Services Graph and checks the tenant against Customers.json' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $cc = Join-Path $tmp 'cc'; New-Item -ItemType Directory -Path $cc -Force | Out-Null
  Set-Content (Join-Path $cc 'Connect-Customer.ps1') 'param([string]$Customer, [string[]]$Services) $global:CcCalls += "$Customer/$($Services -join ",")"; Connect-MgGraph'
  Set-Content (Join-Path $cc 'Customers.json') '{ "DEVCF": { "TenantId": "11111111-1111-1111-1111-111111111111", "CertPassword": "not-read" }, "OTHER": { "TenantId": "22222222-2222-2222-2222-222222222222" } }'
  $global:CcCalls = @(); $global:FakeDisconnected = $true
  Invoke-Quiet { & $baseline -ConfigFile $small -Customer DEVCF -ConnectScript (Join-Path $cc 'Connect-Customer.ps1') -OutDir $tmp }
  Assert-Eq ($global:CcCalls -join ';') 'DEVCF/Graph' 'Connect-Customer.ps1 -Customer DEVCF -Services Graph ran once'
  Invoke-Quiet { & $baseline -ConfigFile $small -Customer DEVCF -ConnectScript (Join-Path $cc 'Connect-Customer.ps1') -OutDir $tmp }
  Assert-Eq ($global:CcCalls -join ';') 'DEVCF/Graph' 'an open connection to the right tenant is reused'
  Assert-Throws { & $baseline -ConfigFile $small -Customer OTHER -ConnectScript (Join-Path $cc 'Connect-Customer.ps1') -OutDir $tmp } 'was asked for' 'the key points at another tenant'
  Assert-Throws { & $baseline -ConfigFile $small -Customer NOPE -ConnectScript (Join-Path $cc 'Connect-Customer.ps1') -OutDir $tmp } 'is not in' 'unknown key'
  $global:FakeDisconnected = $false
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'baseline: EDIT placeholders block; a filled-in sample plans people as active members and Intune people as eligible' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  $sample = Join-Path $pim 'samples/easypim.small.jsonc'
  Assert-Throws { & $baseline -ConfigFile $sample -TenantId fake.dev -OutDir $tmp } 'blocking' 'EDIT left'
  $txt = Get-Content $sample -Raw
  $i = 0
  $txt = [regex]::Replace($txt, '"<EDIT: object id of [^"]*>"', { $script:i++; if ($script:i % 2) { '"aaaaaaaa-0000-0000-0000-000000000001"' } else { '"aaaaaaaa-0000-0000-0000-000000000002"' } })
  $txt = $txt -replace '"EDIT: why[^"]*"', '"test"'
  $f = Join-Path $tmp 'pim.fake.jsonc'; Set-Content $f $txt
  Invoke-Quiet { & $baseline -ConfigFile $f -TenantId fake.dev -OutDir $tmp -WriteResolved (Join-Path $tmp 'resolved.json') }
  $p = Get-Content (Get-Plans 'baseline')[-1].FullName -Raw | ConvertFrom-Json -AsHashtable
  $people = @($p.ops | Where-Object { $_.key -like 'person:*' })
  Assert-True ($people.Count -ge 5) 'people planned'
  Assert-True (@($people | Where-Object { $_.key -like 'person:PIM-SG-INT-Ops:*' -and $_.uri -like '*eligibilityScheduleRequests' }).Count) 'Intune access group: eligible'
  Assert-True (@($people | Where-Object { $_.key -like 'person:PIM-SG-M365-Ops:*' -and $_.uri -like '*assignmentScheduleRequests' }).Count) 'persona group: active'
  Assert-True (Test-Path (Join-Path $tmp 'resolved.json')) 'resolved config for EasyPIM'
  $r = Get-Content (Join-Path $tmp 'resolved.json') -Raw
  Assert-True ($r -notmatch '"_meta"') 'the _ keys are stripped for EasyPIM'
  Assert-True ($r -notmatch '//') 'no comments for EasyPIM'
  Assert-Eq (Get-FakeWrites).Count 0 'writes'
}

Test-It 'baseline: role policies only with -Include RolePolicies; a backup is written first and -RestoreFrom puts it back' {
  New-FakeTenant -Scopes $allScopes -RoleNames $roleNames
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Groups, GroupPolicies, Eligibilities, RolePolicies }
  $plan = (Get-Plans 'baseline')[-1].FullName
  $p = Get-Content $plan -Raw | ConvertFrom-Json -AsHashtable
  Assert-True (@($p.ops | Where-Object { $_.key -like 'rpol:*' }).Count -gt 50) 'role policy rules planned'
  $gaPol = $global:Fake.rolePolicies['62e90394-69f5-4237-9190-012177145e10']
  $before = ($gaPol.rules | Where-Object { $_.id -eq 'Expiration_EndUser_Assignment' }).maximumDuration
  Invoke-Quiet { & $baseline -ConfigFile $small -TenantId fake.dev -OutDir $tmp -Include Groups, GroupPolicies, Eligibilities, RolePolicies -Apply -PlanFile $plan -Yes }
  Assert-Eq ($gaPol.rules | Where-Object { $_.id -eq 'Expiration_EndUser_Assignment' }).maximumDuration 'PT2H' 'small: GA two hours'
  $ctxRule = $gaPol.rules | Where-Object { $_.id -eq 'AuthenticationContext_EndUser_Assignment' }
  Assert-True ($ctxRule.isEnabled -and $ctxRule.claimValue -eq 'c1') 'Tier 0: c1'
  $bk = @(Get-ChildItem $tmp -Filter 'pim-backup.baseline.*.json' | Where-Object { $_.Name -notlike '*.late.json' } | Sort-Object LastWriteTime)[-1].FullName
  Assert-True $bk 'backup written'
  Invoke-Quiet { & $baseline -RestoreFrom $bk -TenantId fake.dev -OutDir $tmp }
  $rp = (Get-Plans 'restore')[-1].FullName
  Invoke-Quiet { & $baseline -RestoreFrom $bk -TenantId fake.dev -OutDir $tmp -Apply -PlanFile $rp -Yes }
  Assert-Eq ($gaPol.rules | Where-Object { $_.id -eq 'Expiration_EndUser_Assignment' }).maximumDuration $before 'restored'
}

Test-It 'module: the write gate refuses a write outside an approved apply' {
  Import-Module (Join-Path $pim 'PimCommon.psm1') -Force -DisableNameChecking
  Assert-Throws { Invoke-PimWrite 'POST' 'https://graph.microsoft.com/v1.0/groups' @{ displayName = 'x' } } 'Write gate' 'gate'
  Assert-Eq (Remove-PimJsonComments ('{"u":"https://x/y", // c' + "`n" + '"v":1 /* d */}')) ('{"u":"https://x/y", ' + "`n" + '"v":1 }') 'comments stripped, strings kept'
  $a = ConvertTo-PimCanonical ([ordered]@{ b = 1; a = @{ d = 2; c = 3 } }); $b = ConvertTo-PimCanonical ([ordered]@{ a = [ordered]@{ c = 3; d = 2 }; b = 1 })
  Assert-Eq $a $b 'canonical JSON does not depend on key order'
  $cmd = Get-PimApplyCommand '.\tools\pim\New-PimRegions.ps1' ([ordered]@{ RegionsFile = 'my regions.csv'; Customer = 'DEVCF'; Include = @('Units', 'Groups'); FixRules = [switch]$true; Yes = [switch]$true }) 'C:\plans\p.json'
  Assert-Eq $cmd ".\tools\pim\New-PimRegions.ps1 -RegionsFile 'my regions.csv' -Customer DEVCF -Include Units,Groups -FixRules -Apply -PlanFile C:\plans\p.json" 'the apply command repeats what built the plan'
}

if (Test-Path $regions) { . (Join-Path $here 'Test-PimRegions.inc.ps1') }
if (Test-Path $dups) { . (Join-Path $here 'Test-PimDuplicates.inc.ps1') }
if ((Test-Path $regions) -and (Test-Path $dups)) { . (Join-Path $here 'Test-PimReview.inc.ps1') }
if (Test-Path $regions) { . (Join-Path $here 'Test-PimRoles.inc.ps1') }
if (Test-Path $regions) { . (Join-Path $here 'Test-PimReplication.inc.ps1') }
if (Test-Path $regions) { . (Join-Path $here 'Test-PimScopeTags.inc.ps1') }
if (Test-Path $regions) { . (Join-Path $here 'Test-PimIntuneRole.inc.ps1') }

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Write-Host ("`n# pass {0}`n# fail {1}" -f $script:pass, $script:fail)
if ($script:fail) { exit 1 }
