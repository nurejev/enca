<#
.SYNOPSIS
  Framework 3.0, test 5: does Exchange Online accept a ROLE-ASSIGNABLE Entra
  security group as a member of an Exchange role group? The Exchange RBAC
  sub-design (PIM-SG-EXO-* groups, like Intune) is only built if it does.

.DESCRIPTION
  Without -Apply: reads only, and says what it would do.
  With -Apply:
    1. creates PIM-SG-EXO-Test (role-assignable, no members) if it is missing;
    2. tries Add-RoleGroupMember 'View-Only Organization Management' with that
       group, first by object id, then by name;
    3. reads the role group back and writes the result to
       pim-exo-test.<domain>.<stamp>.json.
  With -Cleanup: removes the group from the role group and deletes it.

  IMPACT: one empty group gets the read-only View-Only Organization Management
  role group. Nobody gains anything until someone is made a member — which is
  the manual part of the test (section 9, test 6 of the framework 3.0 design
  note). RECOVERY: -Cleanup.

  Needs: Microsoft.Graph.Authentication and ExchangeOnlineManagement. Connect
  Exchange FIRST, in the same PowerShell session:
      Connect-Customer.ps1 -Customer DEVCF -Services Exchange
  The script connects Graph itself (-Customer). The Graph identity creates the
  role-assignable group (Privileged Role Administrator or the app's
  RoleManagement.ReadWrite.Directory + Group.ReadWrite.All); the Exchange
  identity runs Add-RoleGroupMember (Organization Management). The Graph
  writes go through the same approved-apply gate as the other scripts: you
  type the tenant's default domain first.

.EXAMPLE
  .\Test-PimExchangeRbac.ps1 -Customer DEVCF
  .\Test-PimExchangeRbac.ps1 -Customer DEVCF -Apply
  .\Test-PimExchangeRbac.ps1 -Customer DEVCF -Cleanup
#>
[CmdletBinding()]
param(
  [string]$GroupName = 'PIM-SG-EXO-Test',
  [string]$RoleGroup = 'View-Only Organization Management',
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string]$OutDir = '.',
  [switch]$Apply,
  [switch]$Cleanup
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
if ($Apply -and $Cleanup) { throw 'Use -Apply or -Cleanup, not both.' }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -DelegatedScopes @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory')
$found = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'$GroupName')&`$select=id,displayName,isAssignableToRole&`$top=999" -All | Where-Object { "$($_['displayName'])" -eq $GroupName })
if ($found.Count -gt 1) { throw "$GroupName exists $($found.Count) times — remove the copies first." }
$grp = if ($found.Count) { $found[0] } else { $null }
if ($grp -and -not $grp['isAssignableToRole']) { throw "$GroupName exists but is not role-assignable — the test needs a role-assignable group. Rename it away first." }

if (-not $Apply -and -not $Cleanup) {
  Write-PimStep "Would test $RoleGroup with $GroupName on $($ctx.TenantName)"
  if ($grp) { Write-PimOk "$GroupName exists ($($grp['id']))" } else { Write-PimWould "create role-assignable group $GroupName (no members)" }
  Write-PimWould "Add-RoleGroupMember '$RoleGroup' -Member <$GroupName>"
  Write-Host "  Run again with -Apply. Impact: an EMPTY group gets read-only Exchange rights. Recovery: -Cleanup."
  return
}
if (-not (Get-Command Get-RoleGroup -ErrorAction SilentlyContinue)) { throw 'Exchange Online is not connected in this session. Run  Connect-Customer.ps1 -Customer DEVCF -Services Exchange  first, then this script again. Nothing was written.' }
try { $null = Get-RoleGroup -Identity $RoleGroup -ErrorAction Stop } catch { throw "Exchange cannot read role group '$RoleGroup' with this connection: $($_.Exception.Message). Nothing was written." }
# Graph writes run through the approved-apply gate (PimCommon): a one-op plan, typed domain, outcome file
function Invoke-GraphOp([string]$Key, [string]$Summary, [System.Collections.IDictionary]$Spec) {
  $plan = New-PimPlan 'exo-test' $null
  Add-PimOp $plan $Key 'http' $Summary $Spec
  Show-PimPlan $plan
  Confirm-PimApply $plan
  $plan.hash = Get-PimPlanHash $plan
  $r = Invoke-PimPlan $plan $OutDir $null
  if ($r.failed) { throw "$Summary failed — see $($r.file). Nothing else was done." }
  return (Get-PimIds)[$Key]
}

if ($Cleanup) {
  if (-not $grp) { Write-PimOk "$GroupName does not exist — nothing to clean up"; return }
  try { Remove-RoleGroupMember -Identity $RoleGroup -Member $grp['id'] -Confirm:$false -BypassSecurityGroupManagerCheck; Write-PimOk "removed from $RoleGroup" } catch { Write-PimWarn "not in $RoleGroup ($($_.Exception.Message))" }
  $null = Invoke-GraphOp "del:$GroupName" "delete test group $GroupName" ([ordered]@{ method = 'DELETE'; uri = "$GraphUrl/groups/$($grp['id'])" })
  Write-PimOk "$GroupName deleted (restorable for 30 days from deleted groups)"
  return
}

if (-not $grp) {
  $newId = Invoke-GraphOp "group:$GroupName" "create role-assignable test group $GroupName (no members)" ([ordered]@{ method = 'POST'; uri = "$GraphUrl/groups"; produces = "group:$GroupName"; body = [ordered]@{ displayName = $GroupName; mailEnabled = $false; mailNickname = ($GroupName -replace '[^A-Za-z0-9]', '').ToLower(); securityEnabled = $true; groupTypes = @(); isAssignableToRole = $true; visibility = 'Private'; description = 'CloudFellows PIM framework 3.0 — Exchange RBAC test. Delete with Test-PimExchangeRbac.ps1 -Cleanup.' } })
  if (-not $newId) { throw "the group was created but no id came back — look for $GroupName in Entra, then run again" }
  $grp = @{ id = $newId; displayName = $GroupName }
  Write-PimOk "created $GroupName ($newId); waiting 60 s for it to reach Exchange"
  Start-Sleep -Seconds 60
}
$result = [ordered]@{ tenant = $ctx.DefaultDomain; at = (Get-Date).ToUniversalTime().ToString('o'); group = $GroupName; groupId = $grp['id']; roleGroup = $RoleGroup; attempts = @(); accepted = $false; members = @() }
foreach ($m in @($grp['id'], $GroupName)) {
  try {
    Add-RoleGroupMember -Identity $RoleGroup -Member $m -BypassSecurityGroupManagerCheck -ErrorAction Stop
    $result.attempts += [ordered]@{ member = $m; ok = $true; error = $null }; $result.accepted = $true; break
  } catch { $result.attempts += [ordered]@{ member = $m; ok = $false; error = $_.Exception.Message } }
}
try { $result.members = @(Get-RoleGroupMember -Identity $RoleGroup | ForEach-Object { "$($_.Name) ($($_.RecipientTypeDetails))" }) } catch { $result.members = @("read failed: $($_.Exception.Message)") }
$file = Join-Path $OutDir ("pim-exo-test.{0}.{1}.json" -f $ctx.DefaultDomain, (Get-Date).ToString('yyyyMMdd-HHmmss'))
($result | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $file -Encoding UTF8
if ($result.accepted) {
  Write-PimOk "ACCEPTED — Exchange takes a role-assignable group in $RoleGroup. Next: test 6 (make a test admin an eligible member, activate, time the Exchange admin centre)."
} else {
  Write-PimBad "REFUSED — the Exchange RBAC sub-design falls back to Exchange Administrator / Exchange Recipient Administrator on the direct path."
  foreach ($a in $result.attempts) { Write-PimWarn "$($a.member): $($a.error)" }
}
Write-PimStep "Result: $file   ·   remove the test with -Cleanup"
