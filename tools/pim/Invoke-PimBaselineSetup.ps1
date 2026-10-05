<#
.SYNOPSIS
  ONE command that sets up the whole CloudFellows PIM framework 3.0 in the
  baseline tenant (cloudfellows.dev): small, large and multi-region side by
  side, so customers can be compared against it in ENCA.

.DESCRIPTION
  Drives the existing scripts in tools/pim in the right order. Every stage is
  planned, the plan is shown, and only that plan is applied — the same
  plan-then-apply gate as running the scripts by hand. You confirm ONCE, at the
  start, by typing the tenant's default domain. The run stops at the first
  failure, a blocked plan, or a stage that keeps deferring.

  Stage    Script                    What it does
  -------  ------------------------  ---------------------------------------------
  Config   New-PimBaseline.ps1       Every global group (incl. the four new
                                     -Direct groups, approvers, INT, XDR, AZ) and
                                     every membership policy — with the 3.0
                                     templates (job groups GroupJITTier1, 4 h; direct
                                     groups GroupMember; access groups GroupJIT). Uses a config generated
                                     from pim-baseline.json + framework-3.0.baseline.json;
                                     the 2.x group→role eligibilities are left out.
  Exchange Set-PimExchangeRbac.ps1    PIM-SG-EXO-* access groups into their Exchange
                                     role groups (Recipient Management, Help Desk,
                                     Hygiene Management, View-Only Organization
                                     Management). Needs Exchange connected first:
                                     Connect-Customer.ps1 -Customer DEVCF -Services Exchange
  Regions  New-PimRegions.ps1        Units, regional groups (job groups on
                                     GroupJITTier1.multi), regional Intune — from
                                     regions.cloudfellows.dev.json. No regional
                                     eligibilities (3.0 makes them active).
  Repair   Repair-PimBaseline.ps1    (if present) central Intune assignments carry
                                     every scope tag; adm- accounts out of the
                                     regional user units.
  Direct   Set-PimFramework30.ps1    Direct groups eligible per role; people copied
                                     into them. Repeated while policies defer.
  People   Set-PimFramework30.ps1    Job-group members active → eligible.
  Jobs     Set-PimFramework30.ps1    Job groups ACTIVE, permanently, in their roles
                                     (tenant, executive unit, regional units).
  Retire   Set-PimFramework30.ps1    The old 2.x eligibilities 3.0 replaced.

  IMPACT: additive until People; after People, job-group members activate the
  group (and until Jobs, then the role); after Jobs one activation gives the
  whole job. Nobody loses access at any point; break-glass and the ids in
  -ProtectedIds are never touched. Running it again is safe: every stage says
  "nothing to do" when the tenant already matches.
  RECOVERY: every stage writes its plan, backup and outcome files into the run
  folder. Rules: New-PimBaseline.ps1 -RestoreFrom <backup>. Everything else is
  listed per item in the outcome files.

.PARAMETER Customer      Connect-Customer.ps1 key (DEVCF)
.PARAMETER ProtectedIds  Object ids never moved or removed: the break-glass
                         accounts and the standing Global Administrator.
.PARAMETER Stages        Default: all, in order. Pass a subset to run part of it.
.PARAMETER PlanOnly      Plan every stage and stop. Later stages are planned
                         against the tenant as it is NOW, so they show more than
                         they will do once the earlier stages are applied.
.PARAMETER Yes           Skip the typed confirmation (test harness only).

.EXAMPLE
  ./Invoke-PimBaselineSetup.ps1 -Customer DEVCF -ProtectedIds <bg1>,<bg2>,<ga> -PlanOnly
  ./Invoke-PimBaselineSetup.ps1 -Customer DEVCF -ProtectedIds <bg1>,<bg2>,<ga>
#>
[CmdletBinding()]
param(
  [string]$Customer,
  [string]$ConnectScript,
  [string]$TenantId,
  [Parameter(Mandatory)][string[]]$ProtectedIds,
  [ValidateSet('Config', 'Exchange', 'Regions', 'Repair', 'Direct', 'People', 'Jobs', 'Retire')][string[]]$Stages = @('Config', 'Exchange', 'Regions', 'Repair', 'Direct', 'People', 'Jobs', 'Retire'),
  [string]$RegionsFile = (Join-Path $PSScriptRoot 'regions.cloudfellows.dev.json'),
  [string]$OutDir,
  [int]$DeferWaitSeconds = 120,
  [int]$MaxDeferRounds = 3,
  [switch]$PlanOnly,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'PimCommon.psm1') -Force -DisableNameChecking
$order = @('Config', 'Exchange', 'Regions', 'Repair', 'Direct', 'People', 'Jobs', 'Retire')
$Stages = @($order | Where-Object { $Stages -contains $_ })
foreach ($p in $ProtectedIds) { if ($p -notmatch '^[0-9a-fA-F-]{36}$') { throw "-ProtectedIds '$p' is not an object id. Nothing was read or written." } }
$need = @{ Config = 'New-PimBaseline.ps1'; Exchange = 'Set-PimExchangeRbac.ps1'; Regions = 'New-PimRegions.ps1'; Repair = 'Repair-PimBaseline.ps1'; Direct = 'Set-PimFramework30.ps1'; People = 'Set-PimFramework30.ps1'; Jobs = 'Set-PimFramework30.ps1'; Retire = 'Set-PimFramework30.ps1' }
foreach ($f in @('framework-3.0.baseline.json', 'pim-baseline.json', 'pim-regions-template.json')) { if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw "$f is missing next to this script. Nothing was read or written." } }
if ($Stages -contains 'Repair' -and -not (Test-Path (Join-Path $PSScriptRoot 'Repair-PimBaseline.ps1'))) { Write-PimWarn 'Repair-PimBaseline.ps1 is not in tools/pim — stage Repair is skipped'; $Stages = @($Stages | Where-Object { $_ -ne 'Repair' }) }
if ($Stages -contains 'Exchange' -and -not (Get-Command Get-RoleGroupMember -ErrorAction SilentlyContinue)) { throw 'Stage Exchange needs Exchange Online connected in this session: run  Connect-Customer.ps1 -Customer DEVCF -Services Exchange  first (or leave Exchange out with -Stages). Nothing was read or written.' }
if ($Stages -contains 'Regions' -and -not (Test-Path -LiteralPath $RegionsFile)) { throw "Regions file not found: $RegionsFile. Nothing was read or written." }
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
if (-not $OutDir) { $OutDir = Join-Path (Get-Location).Path "baseline-run-$stamp" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---- connect once; every stage reuses the connection --------------------------------
$ctx = Connect-PimTenant -Customer $Customer -ConnectScript $ConnectScript -TenantId $TenantId -DelegatedScopes @('Directory.Read.All', 'Group.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedEligibilitySchedule.ReadWrite.AzureADGroup', 'PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup', 'AdministrativeUnit.ReadWrite.All', 'DeviceManagementRBAC.ReadWrite.All')
$common = @{ TenantId = $ctx.TenantId; OutDir = $OutDir }

# ---- the 3.0 inputs for the 2.x scripts (generated, kept in the run folder) ---------------
$design = Read-PimJsonFile (Join-Path $PSScriptRoot 'framework-3.0.baseline.json')
$fwGroups = @{}; foreach ($g in @($design['groups'])) { $fwGroups[$g['name']] = $g }
$cfg = Read-PimJsonFile (Join-Path $PSScriptRoot 'pim-baseline.json')
foreach ($t in $design['templates'].Keys) { if (-not $cfg['PolicyTemplates'].Contains($t)) { $cfg['PolicyTemplates'][$t] = $design['templates'][$t] } }
foreach ($n in $fwGroups.Keys) { $cfg['GroupRoles']['Policies'][$n] = [ordered]@{ Member = [ordered]@{ Template = $fwGroups[$n]['template'] } } }
$kept = New-Object System.Collections.Generic.List[object]
foreach ($r in @($cfg['Assignments']['EntraRoles'])) {
  $a = @(@($r['assignments']) | Where-Object { -not $fwGroups.ContainsKey("$($_['principalName'])") })
  if ($a.Count) { $r['assignments'] = $a; $kept.Add($r) }
}
$cfg['Assignments']['EntraRoles'] = $kept.ToArray()
$cfg['_meta']['catalog'] = 'CloudFellows PIM framework 3.0 (baseline tenant, generated by Invoke-PimBaselineSetup.ps1)'
$cfgFile = Join-Path $OutDir 'pim-baseline.fw30.json'
($cfg | ConvertTo-Json -Depth 64) | Set-Content -LiteralPath $cfgFile -Encoding UTF8
$tpl = Read-PimJsonFile (Join-Path $PSScriptRoot 'pim-regions-template.json')
foreach ($t in $design['templates'].Keys) { if (-not $tpl['groupTemplates'].Contains($t)) { $tpl['groupTemplates'][$t] = $design['templates'][$t] } }
$regJob = @{}; foreach ($rg in @($design['regionGroups'])) { $regJob[$rg['name']] = $rg['template'] }
foreach ($g in @($tpl['template']['groups'])) { if ($regJob.ContainsKey($g['name'])) { $g['template'] = $regJob[$g['name']] } }
$tplFile = Join-Path $OutDir 'pim-regions-template.fw30.json'
($tpl | ConvertTo-Json -Depth 64) | Set-Content -LiteralPath $tplFile -Encoding UTF8

$stageDef = [ordered]@{
  Config  = @{ kind = 'baseline'; args = @{ ConfigFile = $cfgFile; Include = @('Groups', 'GroupPolicies', 'Eligibilities') }; impact = 'creates missing groups (4 new -Direct groups); sets every membership policy to its 3.0 template'; undo = 'New-PimBaseline.ps1 -RestoreFrom the backup (rules); delete new groups' }
  Exchange = @{ kind = 'exo-rbac'; args = @{}; impact = 'PIM-SG-EXO-* access groups into their Exchange role groups (empty until someone is made eligible)'; undo = 'Remove-RoleGroupMember (listed in the outcome)' }
  Regions = @{ kind = 'regions'; args = @{ RegionsFile = $RegionsFile; TemplateFile = $tplFile; Include = @('Units', 'Groups', 'GroupPolicies', 'Intune') }; impact = 'missing units, regional groups and regional Intune; regional job groups on GroupJITTier1.multi'; undo = 'the outcome file lists every object' }
  Repair  = @{ kind = 'repair'; args = @{ RegionsFile = $RegionsFile }; impact = 'central Intune assignments get every scope tag; adm- accounts leave regional user units'; undo = 'Repair-PimBaseline.ps1 -RestoreFrom the backup' }
  Direct  = @{ kind = 'fw30-direct'; args = @{ Phase = 'Direct'; ProtectedIds = $ProtectedIds; RegionsFile = $RegionsFile }; impact = 'direct groups eligible per role; people copied into them (additive)'; undo = 'remove the eligibilities / memberships listed in the outcome' }
  People  = @{ kind = 'fw30-people'; args = @{ Phase = 'People'; ProtectedIds = $ProtectedIds; RegionsFile = $RegionsFile }; impact = 'job-group members active → eligible (nobody loses access)'; undo = 'add them back as active members (listed in the outcome)' }
  Jobs    = @{ kind = 'fw30-jobs'; args = @{ Phase = 'Jobs'; ProtectedIds = $ProtectedIds; RegionsFile = $RegionsFile }; impact = 'job groups active, permanently, in their roles — one activation per job'; undo = '-RestoreFrom the backup (rules); remove the active assignments in PIM' }
  Retire  = @{ kind = 'fw30-retire'; args = @{ Phase = 'Retire'; ProtectedIds = $ProtectedIds; RegionsFile = $RegionsFile }; impact = 'the 2.x eligibilities that 3.0 replaced'; undo = 'the outcome lists every removed eligibility' }
}

# ---- one confirmation for the whole run ----------------------------------------------------
Write-PimStep "Framework 3.0 baseline setup on $($ctx.TenantName) — $(if ($PlanOnly) { 'PLAN ONLY' } else { 'plan and apply' })"
foreach ($s in $Stages) { Write-Host ("  {0,-8} {1}`n           undo: {2}" -f $s, $stageDef[$s].impact, $stageDef[$s].undo) }
Write-Host "  never touched: break-glass and $($ProtectedIds.Count) protected id(s); Conditional Access; Defender portal"
Write-Host "  run folder: $OutDir"
if (-not $PlanOnly -and -not $Yes) {
  $a = Read-Host "Type $($ctx.DefaultDomain) to run $($Stages.Count) stage(s) on $($ctx.TenantName)"
  if ($a -ne $ctx.DefaultDomain) { throw 'Not confirmed. Nothing was written.' }
}

function Get-Newest([string]$pattern, [datetime]$since) { Get-ChildItem -LiteralPath $OutDir -Filter $pattern -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $since } | Sort-Object LastWriteTime | Select-Object -Last 1 }
function Invoke-Stage([string]$name) {
  $d = $stageDef[$name]; $script = Join-Path $PSScriptRoot $need[$name]
  $p = @{} + $common; foreach ($k in $d.args.Keys) { $p[$k] = $d.args[$k] }
  for ($round = 1; $round -le $MaxDeferRounds; $round++) {
    Write-PimStep "Stage $name$(if ($round -gt 1) { " (round $round)" }) — plan"
    $t0 = (Get-Date).AddSeconds(-1)
    $out = & $script @p *>&1; $out | ForEach-Object { Write-Host "    $_" }
    $txt = ($out | Out-String)
    $planFile = Get-Newest "pim-plan.$($d.kind).*.json" $t0
    if (-not $planFile) {
      if ($txt -match 'blocked|✗') { throw "stage $name is blocked — see the lines marked ✗ above. Stopped; nothing after it ran." }
      Write-PimOk "stage ${name}: nothing to do"; return
    }
    if ($PlanOnly) { Write-PimOk "stage $name planned: $($planFile.Name)"; return }
    Write-PimStep "Stage $name — apply $($planFile.Name)"
    $t1 = (Get-Date).AddSeconds(-1)
    $out = & $script @p -Apply -PlanFile $planFile.FullName -Yes *>&1; $out | ForEach-Object { Write-Host "    $_" }
    $oc = Get-Newest "pim-outcome.$($d.kind).*.json" $t1
    if (-not $oc) { throw "stage $name wrote no outcome file — read the lines above. Stopped." }
    $ops = @((Read-PimJsonFile $oc.FullName)['ops'])
    $failedOps = @($ops | Where-Object { $_['status'] -eq 'failed' })
    # PIM refuses to remove an assignment younger than 5 minutes (ActiveDurationTooShort):
    # nothing was written for it, so wait and plan the stage again
    $young = @($failedOps | Where-Object { "$($_['error'])" -match 'ActiveDurationTooShort' })
    $failed = $failedOps.Count - $young.Count
    $deferred = @($ops | Where-Object { "$($_['status'])" -like 'deferred*' }).Count
    if ($failed) { throw "stage ${name}: $failed operation(s) failed — see $($oc.Name). Stopped; nothing after it ran." }
    if (-not $deferred -and -not $young.Count) { Write-PimOk "stage $name applied ($($ops.Count) operation(s))"; return }
    if ($round -lt $MaxDeferRounds) {
      $wait = if ($young.Count) { [Math]::Max($DeferWaitSeconds, 330) } else { $DeferWaitSeconds }
      $why = if ($young.Count) { 'PIM will not remove an assignment younger than 5 minutes' } else { "$deferred operation(s) deferred (new groups reach PIM after a few minutes)" }
      Write-PimWarn "stage ${name}: $why — waiting $wait s, then planning again"
      Start-Sleep -Seconds $wait
    }
  }
  throw "stage ${name} still defers after $MaxDeferRounds rounds — run this script again in a few minutes (it picks up where it stopped)."
}

foreach ($s in $Stages) { Invoke-Stage $s }
Write-PimStep $(if ($PlanOnly) { "Plans are in $OutDir. Run without -PlanOnly to apply." } else { "Framework 3.0 baseline is in place on $($ctx.TenantName). Run file: $OutDir. Next: demo accounts (change plan §6), then compare customers against it once ENCA carries catalog 3.0." })
