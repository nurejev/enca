<#
.SYNOPSIS
  Lists the dynamic "region" user groups of a tenant — the groups 🌍 Fill from
  regions reads — as a CSV, and optionally drafts the Fill from regions
  region list from them.

.DESCRIPTION
  Standalone: Microsoft Graph PowerShell only, nothing from ENCA. Reads every
  group whose display name starts with -Prefix (default PVM-UG-CORP-MEM-USERS-),
  and writes one row per group:

    DisplayName;CountryName;TotalUsers;MembershipRule;Description;Id

  the same shape as the Entra ID dynamic-groups export of 13 Oct 2026, so the
  two can be diffed. CountryName is derived from the membership rule — the
  first  user.usageLocation -eq "XX"  clause, turned into a country name — and
  is empty for a group whose rule does not name a country (a city, a company,
  a UPN prefix, a licence test). TotalUsers is the TRANSITIVE user count
  (users through nested groups included), read per group; -DirectOnly counts
  direct members instead, which is faster on a large tenant.

  With -FillCsv, a second file is written in the shape 🌍 Fill from regions
  imports (region,group,label,ticked,mode): every group gets its WAVE from the
  $WaveBySuffix table below — TUNO T28's wave → country table, keyed by the
  group-name suffix the way T28 keys it — a label, ticked yes, and an empty
  mode; a group whose suffix is not in the table (a new country, a site group,
  a test slice) is put under region "Review" UNTICKED so a person decides; a rule that selects
  disabled accounts is listed as mode ignore; a rule that selects users WITHOUT
  the Intune service plan is listed as mode sa-only (Fill's rule 0c). Nothing
  is written to the tenant.

.PARAMETER Prefix
  Display-name prefix of the region groups. Default PVM-UG-CORP-MEM-USERS-.

.PARAMETER OutFile
  Where the groups CSV goes. Default: <Prefix>groups-<date>.csv in the current folder.

.PARAMETER FillCsv
  Also write the Fill from regions region list next to it (…-fill-from-regions.csv).

.PARAMETER DirectOnly
  Count direct members instead of transitive users.

.PARAMETER DynamicOnly
  Only groups with a membership rule (default: on). -DynamicOnly:$false lists assigned groups too.

.EXAMPLE
  .\Get-RegionGroups.ps1
  .\Get-RegionGroups.ps1 -Prefix "SG-Users-" -FillCsv
  .\Get-RegionGroups.ps1 -DirectOnly -OutFile .\groups.csv

.NOTES
  Version : 1.1.0 (2026-10-13) - reuses an app-only session from Connect-Customer.ps1
  Permissions: Group.Read.All (groups, rules, member counts). Sign-in: an
  existing Graph session is reused (e.g. .\Connect-Customer.ps1 -Customer PVM
  -Services Graph, app-only); otherwise delegated, Connect-MgGraph asks once. Module: Microsoft.Graph.Authentication
  (Install-Module Microsoft.Graph.Authentication). PowerShell 5.1 or 7.
  Every Graph call is a read.
#>
[CmdletBinding()]
param(
  [string]$Prefix = "PVM-UG-CORP-MEM-USERS-",
  [string]$OutFile,
  [switch]$FillCsv,
  [switch]$DirectOnly,
  [bool]$DynamicOnly = $true
)

$ErrorActionPreference = "Stop"

# ---- which wave (region) a group belongs to — TUNO's T28 table (js/mdemembers.js
#      DEFAULTS.countryMap, Mihai's sheet of 29-09 + SK/KZ/LAGOS at 10635), keyed by the
#      part of the group name after the prefix, exactly as T28 keys it. A suffix not in
#      the table goes to "Review", unticked, so a person decides. Edit freely.
$WaveBySuffix = [ordered]@{
  "Euro"         = @("NL-Breda", "GB", "BE", "NL", "LU", "CZ", "SK", "POL-Warszawa", "POL-SKARB", "DK", "FR", "CH", "ES", "PT", "GR", "DE")
  "Americas"     = @("US", "MX", "CA")
  "APAC" = @("CN", "ID", "VN", "PH", "JP", "MY", "TH", "KR", "AU", "SG", "HK")
  "Italy"        = @("IT")
  "BAMSCA"       = @("IN", "BR", "BD", "LK", "NG", "LAGOS", "NP", "UAE", "ZA", "RU", "KZ", "TR")
}
# Labels Fill shows where the country name is not what the business calls the unit
# (T28's device-suffix overrides tell the same story). Anything else gets the country name.
$LabelOverride = @{
  "GB"="UK"; "CZ"="Czech"; "CN"="China"; "US"="North America"; "UAE"="Export Middle East & Africa DMCC"; "TR"="Turkey"
  "NL-Breda"="Netherlands (Breda) — pilot"; "POL-Warszawa"="PVM Polska (Warsaw)"; "POL-SKARB"="PVM Production (Skarbimierz)"; "LAGOS"="Nigeria (Lagos)"
}
$IntunePlan = "c1ec4a95-1f05-45b3-a911-aa3fa01094f5"   # service plan INTUNE_A (Microsoft Intune)

# ---- helpers
function Get-CountryCode([string]$rule) {
  if ($rule -match 'user\.usageLocation\s+-eq\s+"([A-Za-z]{2})"') { return $Matches[1].ToUpperInvariant() }
  return ""
}
function Get-CountryName([string]$code) {
  if (-not $code) { return "" }
  try { return ([System.Globalization.RegionInfo]::new($code)).EnglishName } catch { return $code }
}
function Invoke-GraphAll([string]$uri) {
  # every page, as plain hashtables
  $out = New-Object System.Collections.Generic.List[object]
  $next = $uri
  while ($next) {
    $page = Invoke-MgGraphRequest -Method GET -Uri $next -OutputType PSObject
    if ($page.value) { foreach ($v in $page.value) { $out.Add($v) } }
    $next = $page.'@odata.nextLink'
  }
  return $out
}
function Get-Count([string]$uri) {
  # $count=true on a collection needs ConsistencyLevel: eventual
  $page = Invoke-MgGraphRequest -Method GET -Uri $uri -Headers @{ ConsistencyLevel = "eventual" } -OutputType PSObject
  if ($null -ne $page.'@odata.count') { return [int]$page.'@odata.count' }
  # a tenant that refuses $count: fall back to paging the ids
  return (Invoke-GraphAll $uri.Replace('&$count=true', '').Replace('$top=1', '$top=999')).Count
}

# ---- sign in (read only)
if (-not (Get-Module -ListAvailable Microsoft.Graph.Authentication)) {
  throw "Install-Module Microsoft.Graph.Authentication -Scope CurrentUser   (needed once)"
}
Import-Module Microsoft.Graph.Authentication
#      An existing session is reused — delegated, or app-only from Connect-Customer.ps1
#      (certificate sign-in; Scopes then holds the app's application permissions).
$readScopes = @("Group.Read.All", "Group.ReadWrite.All", "Directory.Read.All", "Directory.ReadWrite.All")
$ctx = Get-MgContext
$hasRead = $ctx -and @($ctx.Scopes | Where-Object { $readScopes -contains $_ }).Count -gt 0
if ($ctx -and $ctx.AuthType -eq "AppOnly") {
  # never swap a customer's app-only session for an interactive one (could land in another tenant)
  if (-not $hasRead) { throw "App-only session ($($ctx.AppName)) has none of $($readScopes -join ', '). Add one: Connect-Customer.ps1 -AddGraphScopes -Customer <key> -GraphScopes 'Group.Read.All'" }
} elseif (-not $hasRead) {
  Connect-MgGraph -Scopes "Group.Read.All" -NoWelcome
  $ctx = Get-MgContext
}
$who = if ($ctx.AuthType -eq "AppOnly") { "app $($ctx.AppName)" } else { $ctx.Account }
Write-Host "Tenant $($ctx.TenantId) as $who — reading groups starting with '$Prefix'…"

# ---- the groups
$esc = $Prefix.Replace("'", "''")
$sel = 'id,displayName,description,membershipRule,membershipRuleProcessingState,groupTypes'
$groups = Invoke-GraphAll "https://graph.microsoft.com/v1.0/groups?`$filter=startswith(displayName,'$esc')&`$select=$sel&`$top=999"
if ($DynamicOnly) { $groups = @($groups | Where-Object { $_.membershipRule }) }
Write-Host "  $($groups.Count) group(s)"

$rows = New-Object System.Collections.Generic.List[object]
$i = 0
foreach ($g in ($groups | Sort-Object displayName)) {
  $i++
  Write-Progress -Activity "Counting members" -Status $g.displayName -PercentComplete ([int](100 * $i / [Math]::Max(1, $groups.Count)))
  $countUri = if ($DirectOnly) { "https://graph.microsoft.com/v1.0/groups/$($g.id)/members/microsoft.graph.user?`$count=true&`$top=1&`$select=id" }
              else             { "https://graph.microsoft.com/v1.0/groups/$($g.id)/transitiveMembers/microsoft.graph.user?`$count=true&`$top=1&`$select=id" }
  $n = try { Get-Count $countUri } catch { Write-Warning "$($g.displayName): members not counted — $($_.Exception.Message)"; "" }
  $code = Get-CountryCode $g.membershipRule
  $rows.Add([pscustomobject]@{
    DisplayName    = $g.displayName
    CountryName    = Get-CountryName $code
    TotalUsers     = $n
    MembershipRule = $g.membershipRule
    Description    = $g.description
    Id             = $g.id
    # not in the export, handy for the Fill draft and for diffing
    CountryCode    = $code
    RuleState      = $g.membershipRuleProcessingState
  })
}
Write-Progress -Activity "Counting members" -Completed

# ---- write the groups CSV — same six columns and ; delimiter as the Entra export
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
if (-not $OutFile) { $OutFile = Join-Path (Get-Location) ("{0}groups_{1}.csv" -f $Prefix.TrimEnd('-'), $stamp) }
$rows | Select-Object DisplayName, CountryName, TotalUsers, MembershipRule, Description, Id |
  Export-Csv -Path $OutFile -Delimiter ';' -NoTypeInformation -Encoding UTF8
Write-Host "Groups → $OutFile"

# ---- optional: the Fill from regions list
if ($FillCsv) {
  $fillPath = [System.IO.Path]::ChangeExtension($OutFile, $null).TrimEnd('.') + "-fill-from-regions.csv"
  $fill = New-Object System.Collections.Generic.List[object]
  $waveOf = @{}
  foreach ($w in $WaveBySuffix.Keys) { foreach ($s in $WaveBySuffix[$w]) { $waveOf[$s.ToLowerInvariant()] = $w } }
  foreach ($r in $rows) {
    $rule = [string]$r.MembershipRule
    $suffix = $r.DisplayName.Substring([Math]::Min($Prefix.Length, $r.DisplayName.Length))
    $mode = ""; $ticked = "yes"; $region = ""; $label = ""
    if ($rule -match 'user\.accountEnabled\s+-eq\s+false') {
      $region = "Ignored"; $label = "Disabled accounts"; $mode = "ignore"
    } elseif ($rule -match "not\s*\(\s*user\.assignedPlans\s+-any\s*\(\s*assignedPlan\.servicePlanId\s+-eq\s+`"$IntunePlan`"") {
      $region = "No Intune licence"; $label = "Unlicensed"; $mode = "sa-only"
    } elseif ($waveOf.ContainsKey($suffix.ToLowerInvariant())) {
      $region = $waveOf[$suffix.ToLowerInvariant()]
      $label = $LabelOverride[$suffix]; if (-not $label) { $label = $r.CountryName }; if (-not $label) { $label = $suffix }
    } else {
      # not in T28's wave table — a person decides
      $region = "Review"; $ticked = "no"
      $label = if ($r.CountryName) { "$($r.CountryName) — not in the T28 wave table" } else { "$suffix — not in the T28 wave table" }
    }
    $fill.Add([pscustomobject]@{ region = $region; group = $r.DisplayName; label = $label; ticked = $ticked; mode = $mode })
  }
  # the wildcard row Fill's rule 0c wants, when the tenant names its unlicensed groups this way
  $fill.Add([pscustomobject]@{ region = "No Intune licence"; group = ($Prefix + "Unlicensed*"); label = "Unlicensed"; ticked = "yes"; mode = "sa-only" })
  $order = @($WaveBySuffix.Keys) + @("No Intune licence", "Review", "Ignored")
  $fill | Sort-Object @{ e = { $k = [array]::IndexOf($order, $_.region); if ($k -lt 0) { 99 } else { $k } } }, @{ e = { $s = $_.group.Substring([Math]::Min($Prefix.Length, $_.group.Length)); $w = $WaveBySuffix[$_.region]; if ($w) { $k = [array]::IndexOf(@($w | ForEach-Object { $_.ToLowerInvariant() }), $s.ToLowerInvariant()); if ($k -lt 0) { 99 } else { $k } } else { 99 } } }, group |
    Export-Csv -Path $fillPath -Delimiter ',' -NoTypeInformation -Encoding UTF8
  Write-Host "Fill from regions draft → $fillPath   (import in ENCA → 👥 CA groups → 🌍 Fill from regions → ⬆ Import CSV; check the Review rows first)"
}

$rows | Select-Object DisplayName, CountryName, TotalUsers | Format-Table -AutoSize
