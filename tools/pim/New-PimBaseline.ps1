<#
.SYNOPSIS
  Create the CloudFellows PIM framework in a tenant with EasyPIM — the baseline
  tenant (cloudfellows.dev) first, any customer tenant after.

.DESCRIPTION
  ENCA's 🧬 PIM baseline (T48, Workspace 02) writes the framework, or the delta
  for one tenant, as an EasyPIM.Orchestrator config with NAMES where EasyPIM
  needs object ids: "<id of SG-PIM-M365-Ops>", "<id of SG-PIM-Approvers>".
  This script turns that file into a runnable one and runs it:

    1. Connects to Microsoft Graph (delegated) and, unless -SkipGroups, makes
       sure every SG-PIM group the config names exists: the persona and Azure
       groups as ROLE-ASSIGNABLE security groups (isAssignableToRole cannot be
       switched on later — a group made without it is recreated under another
       name by you, never by this script), SG-PIM-Approvers as a plain group.
    2. Resolves every "<id of …>" to the object id, and adds the break-glass
       accounts (display name or UPN matching -BreakGlassPattern) to
       ProtectedUsers, so no run ever touches them.
    3. Rewrites the alert recipients' domain to -Domain when given.
    4. Writes the resolved config next to the input (…resolved.json).
    5. Runs Invoke-EasyPIMOrchestrator with -WhatIf. Only with -Apply does it
       run for real, in -Mode delta unless you say initial.

  IMPACT, before you run anything:
    * Groups: additive. A missing group is created; an existing one is left as
      it is (name, members, owners). Creating role-assignable groups needs the
      Privileged Role Administrator or Global Administrator role on the account
      that runs this.
    * -WhatIf (the default): reads only. EasyPIM prints what it would change.
    * -Apply -Mode delta: changes only what the config names — the role
      settings of the listed roles, the Member policy of the listed groups, and
      the eligible assignments listed under Assignments. Nothing is removed.
      Existing eligibilities of people are not touched (the config lists
      groups, not people). Activation settings change for everyone eligible
      for those roles from the next activation on.
    * -Apply -Mode initial: ALSO removes eligible and active assignments the
      config does not name, except ProtectedUsers. Never on a tenant you did
      not export a would-remove list for first (-WouldRemoveExportPath).
  RECOVERY:
    * Before -Apply the script backs the role policies up with EasyPIM's
      Backup-PIMEntraRolePolicy into the same folder; Import-PIMEntraRolePolicy
      puts them back.
    * A group created by mistake can be deleted in the portal (30-day recycle
      bin for groups); assignments EasyPIM created can be removed with
      Remove-PIMEntraRoleEligibleAssignment.

.PARAMETER ConfigFile
  The config ENCA wrote (⬇ Baseline config or ⬇ Delta config), or
  tools/pim/pim-baseline.json — the whole framework, committed with the repo.
.PARAMETER TenantId
  Tenant id or a verified domain (cloudfellows.dev).
.PARAMETER Domain
  Mail domain for the alert recipients (pim-alerts@<Domain>). Defaults to the
  tenant's default domain.
.PARAMETER BreakGlassPattern
  Regex over display name and UPN naming the break-glass accounts.
.PARAMETER Mode
  delta (default) or initial — see IMPACT.
.PARAMETER Apply
  Run for real. Without it, -WhatIf.
.PARAMETER SkipGroups
  Do not create groups; fail on a name that does not resolve.

.EXAMPLE
  # the baseline tenant, first time: create the groups, see what EasyPIM would do
  .\New-PimBaseline.ps1 -ConfigFile .\pim-baseline.json -TenantId cloudfellows.dev

.EXAMPLE
  # then, for real, only what the config names
  .\New-PimBaseline.ps1 -ConfigFile .\pim-baseline.json -TenantId cloudfellows.dev -Apply

.EXAMPLE
  # a customer, from ENCA's delta
  .\New-PimBaseline.ps1 -ConfigFile .\pim-delta.contoso.nl.json -TenantId contoso.nl

.NOTES
  Needs: Microsoft.Graph (Groups, Users, Identity.DirectoryManagement),
  EasyPIM and EasyPIM.Orchestrator from the PowerShell Gallery
  (Install-Module EasyPIM, EasyPIM.Orchestrator). Delegated scopes asked for:
  Group.ReadWrite.All, User.Read.All, Directory.Read.All,
  RoleManagement.ReadWrite.Directory, RoleManagementPolicy.ReadWrite.Directory,
  RoleManagementPolicy.ReadWrite.AzureADGroup, PrivilegedAccess.ReadWrite.AzureADGroup.
  ENCA (T48) is the read side; this is the write side. Same framework, one file.
#>
[CmdletBinding()]
param(
  [string]$ConfigFile = (Join-Path $PSScriptRoot 'pim-baseline.json'),
  [Parameter(Mandatory = $true)][string]$TenantId,
  [string]$Domain,
  [string]$BreakGlassPattern = '^(BG-|BreakGlass|Break-Glass|EmergencyAccess)',
  [ValidateSet('delta', 'initial')][string]$Mode = 'delta',
  [switch]$Apply,
  [switch]$SkipGroups,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'

function Write-Step([string]$text) { Write-Host "▶ $text" -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Warn2([string]$text) { Write-Host "  ! $text" -ForegroundColor Yellow }

# ---- 0. the config ---------------------------------------------------------
if (-not (Test-Path $ConfigFile)) { throw "Config not found: $ConfigFile" }
$raw = Get-Content -Path $ConfigFile -Raw
$cfg = $raw | ConvertFrom-Json -Depth 32
Write-Step "Config $ConfigFile — $($cfg._comment)"

# Every "<id of NAME>" in the file, and the group names the GroupRoles section keys on.
$placeholders = [regex]::Matches($raw, '<id of ([^>]+)>') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$groupKeys = @()
if ($cfg.GroupRoles -and $cfg.GroupRoles.Policies) { $groupKeys = @($cfg.GroupRoles.Policies.PSObject.Properties.Name) }
$approverNames = @()
if ($cfg.PolicyTemplates) {
  foreach ($t in $cfg.PolicyTemplates.PSObject.Properties) {
    foreach ($a in @($t.Value.Approvers)) { if ($a -and $a.description) { $approverNames += $a.description } }
  }
}
$approverNames = $approverNames | Sort-Object -Unique
$wantedGroups = @($placeholders + $groupKeys | Where-Object { $_ -match '^SG-PIM-' } | Sort-Object -Unique)
Write-Ok "$($placeholders.Count) names to resolve, $($wantedGroups.Count) SG-PIM groups wanted, approvers: $($approverNames -join ', ')"

# ---- 1. Graph ---------------------------------------------------------------
Write-Step "Connecting to Microsoft Graph for $TenantId"
Import-Module Microsoft.Graph.Groups, Microsoft.Graph.Users, Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop
$scopes = @('Group.ReadWrite.All', 'User.Read.All', 'Directory.Read.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedAccess.ReadWrite.AzureADGroup')
Connect-MgGraph -TenantId $TenantId -Scopes $scopes -NoWelcome
$org = Get-MgOrganization
$tid = $org.Id
if (-not $Domain) { $Domain = ($org.VerifiedDomains | Where-Object { $_.IsDefault } | Select-Object -First 1).Name }
Write-Ok "Tenant $($org.DisplayName) ($tid), mail domain $Domain"

# ---- 2. groups --------------------------------------------------------------
$ids = @{}
function Resolve-GroupId([string]$name) {
  $g = Get-MgGroup -Filter "displayName eq '$($name.Replace("'", "''"))'" -Property Id, DisplayName, IsAssignableToRole -ConsistencyLevel eventual -CountVariable c
  if ($g -is [array]) { if ($g.Count -gt 1) { throw "More than one group is called $name — the framework needs exact, unique names" } ; $g = $g[0] }
  return $g
}
Write-Step "Groups"
foreach ($name in ($wantedGroups + $approverNames | Sort-Object -Unique)) {
  $g = Resolve-GroupId $name
  $roleAssignable = $name -match '^SG-PIM-(M365|AZ)-'
  if ($g) {
    if ($roleAssignable -and -not $g.IsAssignableToRole) {
      Write-Warn2 "$name exists but is NOT role-assignable. isAssignableToRole cannot be switched on afterwards: create SG-PIM-…-v2 by hand or rename this one away and rerun. Resolving to it anyway so WhatIf shows the rest."
    }
    $ids[$name] = $g.Id; Write-Ok "$name → $($g.Id)$(if ($g.IsAssignableToRole) { ' (role-assignable)' })"
    continue
  }
  if ($SkipGroups) { throw "$name does not exist and -SkipGroups is set" }
  $nick = ($name -replace '[^A-Za-z0-9]', '').ToLower()
  $desc = if ($roleAssignable) { "CloudFellows PIM framework persona group. PIM for Groups on Member; carries Entra roles. Members are people, never nested groups." } else { "CloudFellows PIM framework: approves Tier 0 and SecOps activations. Plain security group." }
  if ($PSCmdlet.ShouldProcess($name, "Create $(if ($roleAssignable) { 'role-assignable ' })security group")) {
    $params = @{ DisplayName = $name; MailEnabled = $false; MailNickname = $nick; SecurityEnabled = $true; Description = $desc; GroupTypes = @() }
    if ($roleAssignable) { $params.IsAssignableToRole = $true; $params.Visibility = 'Private' }
    $new = New-MgGroup @params
    $ids[$name] = $new.Id
    Write-Ok "created $name → $($new.Id)"
  }
}

# ---- 3. break-glass → ProtectedUsers -----------------------------------------
Write-Step "Break-glass accounts ($BreakGlassPattern)"
$bg = Get-MgUser -All -Property Id, DisplayName, UserPrincipalName | Where-Object { $_.DisplayName -match $BreakGlassPattern -or $_.UserPrincipalName -match $BreakGlassPattern }
$protected = @()
foreach ($u in $bg) { $protected += $u.Id; Write-Ok "protected: $($u.DisplayName) ($($u.UserPrincipalName))" }
if (-not $bg) { Write-Warn2 "no account matched — check the pattern; a run in initial mode would otherwise not spare the emergency accounts" }

# ---- 4. rewrite the file ----------------------------------------------------
Write-Step "Resolving names"
$resolved = $raw
foreach ($name in $placeholders) {
  if (-not $ids.ContainsKey($name)) {
    $g = Resolve-GroupId $name
    if ($g) { $ids[$name] = $g.Id } else { throw "Cannot resolve <id of $name>" }
  }
  $resolved = $resolved.Replace("<id of $name>", $ids[$name])
}
if ($Domain) { $resolved = $resolved -replace '@cloudfellows\.dev"', "@$Domain`"" -replace '@<tenant domain>"', "@$Domain`"" }
$obj = $resolved | ConvertFrom-Json -Depth 32
$existing = @($obj.ProtectedUsers | Where-Object { $_ -notmatch '^<' })
$obj.ProtectedUsers = @($existing + $protected | Sort-Object -Unique)
if ($obj.PSObject.Properties['_protectedNote']) { $obj.PSObject.Properties.Remove('_protectedNote') }
if (-not $OutFile) { $OutFile = [System.IO.Path]::ChangeExtension($ConfigFile, ".$($Domain).resolved.json") }
$obj | ConvertTo-Json -Depth 32 | Set-Content -Path $OutFile -Encoding UTF8
Write-Ok "written $OutFile — $($obj.ProtectedUsers.Count) protected principals"

# ---- 5. EasyPIM -------------------------------------------------------------
Write-Step "EasyPIM.Orchestrator"
Import-Module EasyPIM, EasyPIM.Orchestrator -ErrorAction Stop
$orch = @{ ConfigFilePath = $OutFile; TenantId = $tid; Mode = $Mode }
if (-not $Apply) {
  Write-Warn2 "-WhatIf: nothing is written. Read the preview, then rerun with -Apply."
  Invoke-EasyPIMOrchestrator @orch -WhatIf -WouldRemoveExportPath (Split-Path $OutFile -Parent)
  return
}
$backup = Join-Path (Split-Path $OutFile -Parent) ("pim-policies-backup-{0}-{1:yyyyMMdd-HHmm}.csv" -f $Domain, (Get-Date))
try { Backup-PIMEntraRolePolicy -tenantID $tid -exportFilename $backup; Write-Ok "role policies backed up to $backup (Import-PIMEntraRolePolicy puts them back)" }
catch { Write-Warn2 "backup skipped: $($_.Exception.Message)" }
if ($Mode -eq 'initial') { Write-Warn2 "initial mode REMOVES what the config does not name (ProtectedUsers excepted). Press Ctrl+C now if that is not what you want." ; Start-Sleep -Seconds 8 }
Invoke-EasyPIMOrchestrator @orch -WouldRemoveExportPath (Split-Path $OutFile -Parent)
Write-Ok "done — open ENCA Workspace 02 → 🧬 PIM baseline → ⟳ Read again; the rows should read Match"
