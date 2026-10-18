<#
.SYNOPSIS
  Lists the USERS in the dynamic region groups — one row per user per group —
  with the fields 🌍 Fill from regions decides on, so a Fill run can be
  checked (or reasoned about) outside ENCA.

.DESCRIPTION
  Standalone: Microsoft Graph PowerShell only, nothing from ENCA. The groups
  come either from a groups CSV (the Entra dynamic-groups export, or the file
  Get-RegionGroups.ps1 writes — only the DisplayName and Id columns are used)
  or, without -GroupsCsv, from every group whose name starts with -Prefix.

  Per group the TRANSITIVE user members are read (users inside nested groups
  included — the same read 🌍 Fill and the 📊 Deployment dashboard do), with:

    Group, GroupId, UserPrincipalName, DisplayName, UserType, AccountEnabled,
    UsageLocation, IntuneLicensed, ExtensionAttribute10, Mail, Id

  IntuneLicensed is whether the user holds the Intune service plan
  (c1ec4a95-… INTUNE_A) Enabled — the licence the region groups' own rules
  test. ExtensionAttribute10 is the external-user marker Fill's rule 2 reads.

  Two files: the user rows (…-users.csv) and a per-group summary
  (…-summary.csv: users, enabled, guests, licensed, unlicensed, external
  marker). A user in several groups is one row per group in the first file
  and counted in each group in the second; -Unique adds a third file with
  every person once and the groups she is in, joined by " | ".

.PARAMETER GroupsCsv
  The groups CSV (; or , delimited; needs DisplayName and Id — or just DisplayName, then the id is looked up).

.PARAMETER Prefix
  Without -GroupsCsv: display-name prefix of the groups to read. Default PVM-UG-CORP-MEM-USERS-.

.PARAMETER Skip
  Group names (wildcards allowed) to leave out, e.g. "*DISABELD","*TEST". Default: none.

.PARAMETER OutFolder
  Where the files go. Default: the current folder.

.PARAMETER Unique
  Also write the one-row-per-person file.

.EXAMPLE
  .\Get-RegionGroupUsers.ps1 -GroupsCsv ".\Perfetti Van Melle-Entra_ID_Dynamic-Groups_2026-10-13.csv" -Skip "*DISABELD" -Unique
  .\Get-RegionGroupUsers.ps1 -Prefix "PVM-UG-CORP-MEM-USERS-" -OutFolder C:\Temp\regions

.NOTES
  Permissions: Group.Read.All and User.Read.All (assignedPlans and
  onPremisesExtensionAttributes come with User.Read.All). Delegated sign-in,
  asked once. Module: Microsoft.Graph.Authentication. PowerShell 5.1 or 7.
  Every Graph call is a read. On a large tenant (PVM: ~15 000 users across
  ~50 groups) this takes minutes — the progress bar says where it is. The
  output names people: keep the files where tenant data belongs.
#>
[CmdletBinding()]
param(
  [string]$GroupsCsv,
  [string]$Prefix = "PVM-UG-CORP-MEM-USERS-",
  [string[]]$Skip = @(),
  [string]$OutFolder = (Get-Location).Path,
  [switch]$Unique
)

$ErrorActionPreference = "Stop"
$IntunePlan = "c1ec4a95-1f05-45b3-a911-aa3fa01094f5"   # service plan INTUNE_A (Microsoft Intune)
$UserSelect = 'id,userPrincipalName,displayName,userType,accountEnabled,usageLocation,mail,assignedPlans,onPremisesExtensionAttributes'

function Invoke-GraphAll([string]$uri) {
  $out = New-Object System.Collections.Generic.List[object]
  $next = $uri
  while ($next) {
    $page = Invoke-MgGraphRequest -Method GET -Uri $next -OutputType PSObject
    if ($page.value) { foreach ($v in $page.value) { $out.Add($v) } }
    $next = $page.'@odata.nextLink'
  }
  return $out
}
function Import-AnyCsv([string]$path) {
  # the Entra export is ; delimited, Get-RegionGroups.ps1 writes ; too, a hand-made list may be ,
  $head = Get-Content -Path $path -TotalCount 1
  $delim = if (($head -split ';').Count -gt ($head -split ',').Count) { ';' } else { ',' }
  return Import-Csv -Path $path -Delimiter $delim -Encoding UTF8
}

# ---- sign in (read only)
if (-not (Get-Module -ListAvailable Microsoft.Graph.Authentication)) {
  throw "Install-Module Microsoft.Graph.Authentication -Scope CurrentUser   (needed once)"
}
Import-Module Microsoft.Graph.Authentication
$need = @("Group.Read.All", "User.Read.All")
$ctx = Get-MgContext
$have = if ($ctx) { @($ctx.Scopes) } else { @() }
if (-not $ctx -or ($need | Where-Object { $have -notcontains $_ -and $have -notcontains "Directory.Read.All" })) {
  Connect-MgGraph -Scopes $need -NoWelcome
  $ctx = Get-MgContext
}
Write-Host "Tenant $($ctx.TenantId) as $($ctx.Account)"

# ---- which groups
$groups = New-Object System.Collections.Generic.List[object]
if ($GroupsCsv) {
  if (-not (Test-Path $GroupsCsv)) { throw "not found: $GroupsCsv" }
  foreach ($r in (Import-AnyCsv $GroupsCsv)) {
    $name = [string]$r.DisplayName; if (-not $name) { $name = [string]$r.group }   # a Fill list has 'group'
    if (-not $name -or $name.EndsWith('*')) { continue }                              # wildcard rows are Fill's, not a group
    $id = [string]$r.Id
    if (-not $id) {
      $esc = $name.Replace("'", "''")
      $hit = Invoke-GraphAll "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq '$esc'&`$select=id,displayName"
      if ($hit.Count -ne 1) { Write-Warning "$name — $($hit.Count) group(s) with that name, skipped"; continue }
      $id = $hit[0].id
    }
    $groups.Add([pscustomobject]@{ DisplayName = $name; Id = $id })
  }
  Write-Host "  $($groups.Count) group(s) from $GroupsCsv"
} else {
  $esc = $Prefix.Replace("'", "''")
  foreach ($g in (Invoke-GraphAll "https://graph.microsoft.com/v1.0/groups?`$filter=startswith(displayName,'$esc')&`$select=id,displayName&`$top=999")) {
    $groups.Add([pscustomobject]@{ DisplayName = $g.displayName; Id = $g.id })
  }
  Write-Host "  $($groups.Count) group(s) starting with '$Prefix'"
}
if ($Skip.Count) {
  $groups = @($groups | Where-Object { $n = $_.DisplayName; -not ($Skip | Where-Object { $n -like $_ }) })
  Write-Host "  $($groups.Count) after -Skip"
}
$groups = @($groups | Sort-Object DisplayName)

# ---- the users, per group
$rows = New-Object System.Collections.Generic.List[object]
$summary = New-Object System.Collections.Generic.List[object]
$byUser = @{}
$i = 0
foreach ($g in $groups) {
  $i++
  Write-Progress -Activity "Reading members" -Status "$($g.DisplayName) ($i of $($groups.Count))" -PercentComplete ([int](100 * $i / [Math]::Max(1, $groups.Count)))
  try {
    $members = Invoke-GraphAll "https://graph.microsoft.com/v1.0/groups/$($g.Id)/transitiveMembers/microsoft.graph.user?`$select=$UserSelect&`$top=999"
  } catch {
    Write-Warning "$($g.DisplayName): not read — $($_.Exception.Message)"
    $summary.Add([pscustomobject]@{ Group = $g.DisplayName; Users = ""; Enabled = ""; Guests = ""; IntuneLicensed = ""; Unlicensed = ""; ExternalMarker = ""; Note = "not read: $($_.Exception.Message)" })
    continue
  }
  $s = [ordered]@{ Group = $g.DisplayName; Users = 0; Enabled = 0; Guests = 0; IntuneLicensed = 0; Unlicensed = 0; ExternalMarker = 0; Note = "" }
  foreach ($u in $members) {
    $lic = $false
    foreach ($p in @($u.assignedPlans)) { if ($p.servicePlanId -eq $IntunePlan -and $p.capabilityStatus -eq "Enabled") { $lic = $true; break } }
    $ext10 = ""
    if ($u.onPremisesExtensionAttributes) { $ext10 = [string]$u.onPremisesExtensionAttributes.extensionAttribute10 }
    $isGuest = ($u.userType -eq "Guest")
    $rows.Add([pscustomobject]@{
      Group                = $g.DisplayName
      GroupId              = $g.Id
      UserPrincipalName    = $u.userPrincipalName
      DisplayName          = $u.displayName
      UserType             = $u.userType
      AccountEnabled       = $u.accountEnabled
      UsageLocation        = $u.usageLocation
      IntuneLicensed       = $lic
      ExtensionAttribute10 = $ext10
      Mail                 = $u.mail
      Id                   = $u.id
    })
    $s.Users++
    if ($u.accountEnabled) { $s.Enabled++ }
    if ($isGuest) { $s.Guests++ }
    if ($lic) { $s.IntuneLicensed++ } else { $s.Unlicensed++ }
    if ($ext10 -and $ext10.StartsWith("External", [System.StringComparison]::OrdinalIgnoreCase)) { $s.ExternalMarker++ }
    if ($Unique) {
      if (-not $byUser.ContainsKey($u.id)) {
        $byUser[$u.id] = [pscustomobject]@{
          UserPrincipalName = $u.userPrincipalName; DisplayName = $u.displayName; UserType = $u.userType; AccountEnabled = $u.accountEnabled
          UsageLocation = $u.usageLocation; IntuneLicensed = $lic; ExtensionAttribute10 = $ext10; Groups = New-Object System.Collections.Generic.List[string]; Id = $u.id
        }
      }
      $byUser[$u.id].Groups.Add($g.DisplayName)
    }
  }
  $summary.Add([pscustomobject]$s)
}
Write-Progress -Activity "Reading members" -Completed

# ---- write
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$base = Join-Path $OutFolder ("region-groups_{0}" -f $stamp)
$rows    | Export-Csv -Path "$base-users.csv"   -Delimiter ';' -NoTypeInformation -Encoding UTF8
$summary | Export-Csv -Path "$base-summary.csv" -Delimiter ';' -NoTypeInformation -Encoding UTF8
Write-Host "Users   → $base-users.csv   ($($rows.Count) rows)"
Write-Host "Summary → $base-summary.csv ($($summary.Count) groups)"
if ($Unique) {
  $byUser.Values | ForEach-Object {
    [pscustomobject]@{ UserPrincipalName = $_.UserPrincipalName; DisplayName = $_.DisplayName; UserType = $_.UserType; AccountEnabled = $_.AccountEnabled
      UsageLocation = $_.UsageLocation; IntuneLicensed = $_.IntuneLicensed; ExtensionAttribute10 = $_.ExtensionAttribute10; GroupCount = $_.Groups.Count; Groups = ($_.Groups -join " | "); Id = $_.Id }
  } | Sort-Object UserPrincipalName | Export-Csv -Path "$base-unique.csv" -Delimiter ';' -NoTypeInformation -Encoding UTF8
  Write-Host "Unique  → $base-unique.csv  ($($byUser.Count) people)"
}
$summary | Format-Table Group, Users, Enabled, Guests, IntuneLicensed, Unlicensed, ExternalMarker -AutoSize
