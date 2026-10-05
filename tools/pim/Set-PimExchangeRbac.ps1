<#
.SYNOPSIS
  Framework 3.0 — Exchange RBAC like Intune: each PIM-SG-EXO-* access group
  (eligible members, GroupJIT) becomes a member of its Exchange Online role
  group, so one activation gives that Exchange job.

.DESCRIPTION
  Reads framework-3.0.baseline.json (groups with "exchangeRoleGroup").
  Without -Apply: reads Graph and Exchange, writes a plan. With -Apply
  -PlanFile: plans again, stops if the tenant moved, applies exactly that plan
  (after the typed domain), logs every outcome.

  The groups themselves are created — role-assignable, with their GroupJIT
  membership policy — by the Config stage of Invoke-PimBaselineSetup.ps1
  (New-PimBaseline.ps1). A group that does not exist yet is reported, not
  created here.

  Verified on cloudfellows.dev, 5 Oct 2026: Exchange Online accepts a
  role-assignable Entra security group as a role group member (test 5).
  NOT yet measured: how long Exchange takes to honour an activation and to
  drop it again — time the first real activation (design note, test 6).

  IMPACT: a group with no members gains the role group; nobody gains anything
  until someone is made an ELIGIBLE member and activates. RECOVERY:
  Remove-RoleGroupMember -Identity <role group> -Member <group id> (the
  outcome file lists each one).

  Needs Exchange connected first, in the same session:
      Connect-Customer.ps1 -Customer DEVCF -Services Exchange

.EXAMPLE
  ./Set-PimExchangeRbac.ps1 -Customer DEVCF
  ./Set-PimExchangeRbac.ps1 -Customer DEVCF -Apply -PlanFile ./pim-plan.exo-rbac.cloudfellows.dev.<stamp>.json
#>
[CmdletBinding()]
param(
  [string]$DesignFile = (Join-Path $PSScriptRoot 'framework-3.0.baseline.json'),
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [switch]$Interactive,
  [string]$OutDir = '.',
  [switch]$Apply,
  [string]$PlanFile,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$GraphUrl = 'https://graph.microsoft.com/v1.0'
$KIND = 'exo-rbac'
$SelfPath = try { $rel = Resolve-Path -LiteralPath $PSCommandPath -Relative; if ($rel -like '..*') { $PSCommandPath } else { $rel } } catch { $PSCommandPath }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$design = Read-PimJsonFile $DesignFile
$exo = @(@($design['groups']) | Where-Object { $_['exchangeRoleGroup'] })
if (-not $exo.Count) { Write-PimStep 'The design has no Exchange RBAC groups — nothing to do.'; return }
foreach ($g in $exo) { if ("$($g['exchangeRoleGroup'])" -match '^(Organization Management|Discovery Management)$') { throw "Design error: $($g['name']) → $($g['exchangeRoleGroup']) is never handed out through an access group. Nothing was read or written." } }

$planDoc = if ($Apply) { Read-PimPlanFile $PlanFile $KIND } else { $null }
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -Interactive:$Interactive -PlanTenantId $(if ($planDoc) { $planDoc['tenantId'] } else { '' }) -DelegatedScopes @('Directory.Read.All')
if (-not (Get-Command Get-RoleGroupMember -ErrorAction SilentlyContinue)) { throw 'Exchange Online is not connected in this session. Run  Connect-Customer.ps1 -Customer DEVCF -Services Exchange  first. Nothing was read or written.' }

Write-PimStep "Reading the Exchange access groups and their role groups on $($ctx.TenantName)"
$all = @(Invoke-PimGet "$GraphUrl/groups?`$filter=startswith(displayName,'PIM-SG-EXO-')&`$select=id,displayName,isAssignableToRole&`$top=999" -All)
$plan = New-PimPlan $KIND $DesignFile
foreach ($g in $exo) {
  $n = $g['name']; $rg = "$($g['exchangeRoleGroup'])"
  $hit = @($all | Where-Object { "$($_['displayName'])" -eq $n })
  if ($hit.Count -gt 1) { $plan.blocked.Add("$n exists $($hit.Count) times — run Find-PimDuplicates.ps1 first"); continue }
  if (-not $hit.Count) { $plan.findings.Add("$n does not exist — the Config stage of Invoke-PimBaselineSetup.ps1 creates it"); continue }
  if (-not $hit[0]['isAssignableToRole']) { $plan.blocked.Add("$n is not role-assignable — anyone with group rights could change who holds $rg; rename it away first"); continue }
  $gid = "$($hit[0]['id'])"
  try { $members = @(Get-RoleGroupMember -Identity $rg -ResultSize Unlimited -ErrorAction Stop) } catch { $plan.blocked.Add("role group '$rg' could not be read: $($_.Exception.Message)"); continue }
  $isIn = @($members | Where-Object { "$($_.ExternalDirectoryObjectId)" -eq $gid -or "$($_.Name)" -eq $n -or "$($_.DisplayName)" -eq $n -or "$($_.Name)" -eq $gid }).Count
  if ($isIn) { Write-PimOk "$n is in $rg"; continue }
  Add-PimOp $plan "exo:${n}" 'exoMember' "$n → Exchange role group $rg" ([ordered]@{ roleGroup = $rg; groupId = $gid; group = $n })
}

# A group Entra made minutes ago may not have reached Exchange yet: wait and try again
$exoResolver = {
  param($op)
  $waits = @(30, 60, 60, 120)
  for ($i = 0; ; $i++) {
    try { Add-RoleGroupMember -Identity $op.roleGroup -Member $op.groupId -BypassSecurityGroupManagerCheck -ErrorAction Stop; return $(if ($i) { "done after $i retr$(if ($i -eq 1) { 'y' } else { 'ies' })" } else { 'done' }) }
    catch {
      if ($i -ge $waits.Count -or "$($_.Exception.Message)" -notmatch "couldn't be found|could not be found|ManagementObjectNotFound|isn't a valid") { throw }
      Write-PimWould "$($op.group) has not reached Exchange yet — trying again in $($waits[$i]) s"
      Start-Sleep -Seconds $waits[$i]
    }
  }
}

Show-PimPlan $plan
if ($plan.blocked.Count) { Write-PimBad 'blocked — nothing can be applied until the lines marked ✗ are resolved'; if ($Apply) { throw 'blocked plan; nothing was written' }; return }
if (-not $Apply) {
  if (-not $plan.ops.Count) { Write-PimStep "Exchange RBAC has nothing to do on $($ctx.TenantName)."; return }
  $file = Save-PimPlan $plan $OutDir
  Write-PimStep "Plan written: $file"
  Write-Host "  Read it. To apply exactly this plan:`n    $(Get-PimApplyCommand $SelfPath $PSBoundParameters $file)"
  return
}
Assert-PimPlanMatches $plan $PlanFile
Confirm-PimApply $plan -Yes:$Yes
$plan.hash = Get-PimPlanHash $plan
Assert-PimPlanMatches $plan $PlanFile
$result = Invoke-PimPlan $plan $OutDir $exoResolver
if ($result.failed) { Write-PimBad 'stopped at the first failure — fix the cause and plan again' }
else { Write-PimStep 'Exchange RBAC in place. Next: make a test admin an ELIGIBLE member of PIM-SG-EXO-Recipients, activate, and time the Exchange admin centre (test 6).' }
