<#
  PimCommon.psm1 — what every CloudFellows PIM framework script shares.
  (ENCA tools/pim, framework 2.1, after the reliability review of 25 Sep 2026.)

  CONNECTION. The scripts do not sign in themselves. They use the Microsoft
  Graph connection Connect-Customer.ps1 opened (app-only, the customer's
  certificate), or open it through Connect-Customer.ps1 -Customer <key>
  -Services Graph, or — with -Interactive — a delegated sign-in. Then they
  check that the connection is the tenant asked for (Customers.json's
  TenantId, or -TenantId) and that the app holds the Graph permissions the
  step needs; a missing permission stops the run with the exact
  Connect-Customer.ps1 -AddGraphScopes line that adds it.

  ONE WRITE GATE. Every call that is not a GET goes through Invoke-PimWrite,
  which refuses unless an approved plan is being applied. A plan is built
  from reads only and saved as a file with a SHA-256 of its operations; -Apply
  builds the plan again, and runs only when it is identical to the approved
  file (same tenant, same operations). Anything that changed in between stops
  the run before the first write. Before a policy rule is changed its current
  value is written to a backup file, and the backup is read back; every
  operation's outcome is logged; after the run the plan is built once more —
  what is left open is listed, nothing is assumed done.

  Nothing here removes an assignment, a member or a group.
#>
Set-StrictMode -Version 3
$script:Pim = @{ Applying = $false; Writes = 0; Ids = @{}; Ctx = $null; Log = New-Object System.Collections.Generic.List[object]; LateBackup = New-Object System.Collections.Generic.List[object]; LateBackupFile = $null }

function Write-PimStep([string]$t) { Write-Host "▶ $t" -ForegroundColor Cyan }
function Write-PimOk([string]$t) { Write-Host "  ✓ $t" -ForegroundColor Green }
function Write-PimWould([string]$t) { Write-Host "  ○ $t" -ForegroundColor Gray }
function Write-PimWarn([string]$t) { Write-Host "  ! $t" -ForegroundColor Yellow }
function Write-PimBad([string]$t) { Write-Host "  ✗ $t" -ForegroundColor Red }

# ---- JSON with comments --------------------------------------------------------
# The samples are JSONC (EasyPIM reads // and /* */ too). Strings are left alone.
function Remove-PimJsonComments([string]$Text) {
  $sb = New-Object System.Text.StringBuilder
  $i = 0; $str = $false; $n = $Text.Length
  while ($i -lt $n) {
    $c = $Text[$i]; $d = if ($i + 1 -lt $n) { $Text[$i + 1] } else { [char]0 }
    if ($str) {
      [void]$sb.Append($c)
      if ($c -eq '\') { if ($i + 1 -lt $n) { [void]$sb.Append($d) }; $i += 2; continue }
      if ($c -eq '"') { $str = $false }
      $i++; continue
    }
    if ($c -eq '"') { $str = $true; [void]$sb.Append($c); $i++; continue }
    if ($c -eq '/' -and $d -eq '/') { while ($i -lt $n -and $Text[$i] -ne "`n") { $i++ }; continue }
    if ($c -eq '/' -and $d -eq '*') { $i += 2; while ($i -lt $n -and -not ($Text[$i] -eq '*' -and $i + 1 -lt $n -and $Text[$i + 1] -eq '/')) { $i++ }; $i += 2; continue }
    [void]$sb.Append($c); $i++
  }
  return $sb.ToString()
}
function Read-PimJsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "File not found: $Path" }
  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  try { return ($(Remove-PimJsonComments $raw) | ConvertFrom-Json -AsHashtable -Depth 64) }
  catch { throw "Not valid JSON (comments allowed): $Path — $($_.Exception.Message)" }
}
function Get-PimSha256([string]$Text) {
  $b = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
  return ([System.BitConverter]::ToString($b) -replace '-', '').ToLower()
}
# Keys sorted at every level, so the same plan always hashes the same.
function ConvertTo-PimCanonical($o) {
  if ($null -eq $o) { return 'null' }
  if ($o -is [string]) { return ($o | ConvertTo-Json -Compress) }
  if ($o -is [bool]) { return $o.ToString().ToLower() }
  if ($o -is [int] -or $o -is [long] -or $o -is [double] -or $o -is [decimal]) { return [string]$o }
  if ($o -is [System.Collections.IDictionary]) {
    $parts = foreach ($k in ($o.Keys | Sort-Object)) { ($k | ConvertTo-Json -Compress) + ':' + (ConvertTo-PimCanonical $o[$k]) }
    return '{' + ($parts -join ',') + '}'
  }
  if ($o -is [System.Collections.IEnumerable]) { return '[' + ((@($o) | ForEach-Object { ConvertTo-PimCanonical $_ }) -join ',') + ']' }
  if ($o -is [psobject]) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; return ConvertTo-PimCanonical $h }
  return ($o | ConvertTo-Json -Compress)
}

# ---- Graph ------------------------------------------------------------------------
function Invoke-PimGet([string]$Uri, [switch]$All) {
  $p = @{ Method = 'GET'; Uri = $Uri; OutputType = 'HashTable' }
  # ConsistencyLevel only where $count asks for it: the header routes the read
  # through the search index, which lags behind a creation.
  if ($Uri -match '\$count=true') { $p.Headers = @{ ConsistencyLevel = 'eventual' } }
  $r = Invoke-MgGraphRequest @p
  if (-not $All) { return $r }
  $items = New-Object System.Collections.Generic.List[object]
  while ($true) {
    if ($r -and $r.ContainsKey('value')) { foreach ($v in @($r['value'])) { if ($null -ne $v) { $items.Add($v) } } }
    $next = if ($r -and $r.ContainsKey('@odata.nextLink')) { $r['@odata.nextLink'] } else { $null }
    if (-not $next) { break }
    $p.Uri = $next
    $r = Invoke-MgGraphRequest @p
  }
  return $items.ToArray()
}
function Invoke-PimWrite([string]$Method, [string]$Uri, $Body) {
  if (-not $script:Pim.Applying) { throw "Write gate: $Method $Uri was attempted outside an approved apply. Nothing was written." }
  if ($Method -eq 'GET') { throw "Invoke-PimWrite is for writes" }
  $script:Pim.Writes++
  $p = @{ Method = $Method; Uri = $Uri; OutputType = 'HashTable' }
  if ($null -ne $Body) { $p.Body = ($Body | ConvertTo-Json -Depth 32 -Compress); $p.ContentType = 'application/json' }
  return Invoke-MgGraphRequest @p
}
function Get-PimGraphError($err) {
  $m = "$($err.Exception.Message)"
  try { if ($err.ErrorDetails -and $err.ErrorDetails.Message) { $m = "$m $($err.ErrorDetails.Message)" } } catch { }
  return ($m -replace '\s+', ' ').Trim()
}

# ---- connection -------------------------------------------------------------------
function Find-ConnectCustomerScript([string]$Hint) {
  foreach ($c in @($Hint, $env:CONNECT_CUSTOMER_SCRIPT)) { if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path } }
  $cmd = Get-Command Connect-Customer.ps1 -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($root in @((Join-Path $HOME 'REPO'), $HOME)) {
    if (-not (Test-Path $root)) { continue }
    $f = Get-ChildItem -Path $root -Filter 'Connect-Customer.ps1' -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { return $f.FullName }
  }
  return $null
}
function Get-PimKeyCI([System.Collections.IDictionary]$h, [string]$k) {
  if ($null -eq $h) { return $null }
  foreach ($x in $h.Keys) { if ("$x" -ieq $k) { return , $h[$x] } }
  return $null
}
# Every source that names the tenant must agree: Customers.json (with
# -Customer), -TenantId, and the plan file being applied. Any one that
# disagrees with the connection stops the run after reading /organization only.
function Connect-PimTenant {
  [CmdletBinding()]
  param([string]$Customer, [string]$ConnectScript, [string]$TenantId, [switch]$Interactive, [string[]]$DelegatedScopes, [string]$PlanTenantId)
  $isGuid = { param($v) "$v" -match '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' }
  $expect = New-Object System.Collections.Generic.List[object]
  $connectPath = $null
  if ($Customer) {
    $connectPath = Find-ConnectCustomerScript $ConnectScript
    if (-not $connectPath) { throw "Connect-Customer.ps1 not found. Pass -ConnectScript <path>, or set `$env:CONNECT_CUSTOMER_SCRIPT." }
    $json = Join-Path (Split-Path -Parent $connectPath) 'Customers.json'
    if (-not (Test-Path -LiteralPath $json)) { throw "Customers.json not found next to $connectPath — without it the tenant for '$Customer' cannot be checked. Nothing was read or written." }
    $cust = Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable
    $entry = Get-PimKeyCI $cust $Customer
    if (-not $entry) { throw "Customer '$Customer' is not in $json. Known: $(($cust.Keys | Sort-Object) -join ', ')" }
    $tid = Get-PimKeyCI $entry 'TenantId'
    if (-not (& $isGuid $tid)) { throw "Customers.json has no tenant id (a GUID) for '$Customer' — the tenant cannot be checked. Nothing was read or written." }
    $expect.Add(@{ value = "$tid"; from = "Customers.json ($Customer)" })
  }
  if ($TenantId) { $expect.Add(@{ value = $TenantId; from = '-TenantId' }) }
  if ($PlanTenantId) { $expect.Add(@{ value = $PlanTenantId; from = 'the plan file' }) }
  $guids = @($expect | Where-Object { & $isGuid $_.value } | ForEach-Object { "$($_.value)".ToLower() } | Sort-Object -Unique)
  if ($guids.Count -gt 1) { throw "The tenant is named twice, differently: $(@($expect | ForEach-Object { "$($_.from) = $($_.value)" }) -join '; '). Nothing was read or written." }
  if (-not (Get-Command Get-MgContext -ErrorAction SilentlyContinue)) { Import-Module Microsoft.Graph.Authentication -ErrorAction SilentlyContinue }
  if (-not (Get-Command Get-MgContext -ErrorAction SilentlyContinue)) { throw "Microsoft.Graph.Authentication is not installed: Install-Module Microsoft.Graph.Authentication -Scope CurrentUser (the only Graph module these scripts need)." }
  $ctx = Get-MgContext
  # An open connection to another tenant (by id) is closed first; a domain is
  # checked against the verified domains once connected.
  $wrong = $ctx -and $guids.Count -and ("$($ctx.TenantId)".ToLower() -ne $guids[0])
  if ($wrong -and -not ($Customer -or $Interactive)) {
    $src = @($expect | Where-Object { & $isGuid $_.value } | ForEach-Object { $_.from }) -join ', '
    throw "Connected to tenant $($ctx.TenantId), but $src says $($guids[0]). Nothing was read or written."
  }
  if (-not $ctx -or $wrong) {
    if ($wrong) { Write-PimWarn "connected to tenant $($ctx.TenantId), not $($guids[0]) — reconnecting"; Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null }
    if ($Customer) { Write-PimStep "Connect-Customer.ps1 -Customer $Customer -Services Graph"; & $connectPath -Customer $Customer -Services Graph | Out-Host }
    elseif ($Interactive) {
      $sc = if ($DelegatedScopes) { $DelegatedScopes } else { @('Directory.Read.All') }
      $t = if ($guids.Count) { $guids[0] } elseif ($TenantId) { $TenantId } else { $null }
      if ($t) { Connect-MgGraph -TenantId $t -Scopes $sc -NoWelcome } else { Connect-MgGraph -Scopes $sc -NoWelcome }
    } else { throw "Not connected to Microsoft Graph. Run .\Connect-Customer.ps1 -Customer <KEY> -Services Graph first, or pass -Customer <KEY> (or -Interactive for a delegated sign-in)." }
    $ctx = Get-MgContext
    if (-not $ctx) { throw "No Microsoft Graph connection after connecting — see the lines above." }
  }
  $org = (Invoke-PimGet 'https://graph.microsoft.com/v1.0/organization?$select=id,displayName,verifiedDomains')['value'][0]
  $domains = @($org['verifiedDomains'] | ForEach-Object { "$($_['name'])".ToLower() })
  $default = @($org['verifiedDomains'] | Where-Object { $_['isDefault'] } | ForEach-Object { "$($_['name'])".ToLower() })[0]
  foreach ($e in $expect) {
    $v = "$($e.value)".ToLower()
    $ok = ("$($org['id'])".ToLower() -eq $v) -or ($domains -contains $v)
    if (-not $ok) { throw "Connected to $($org['displayName']) ($($org['id'])), but $($e.from) says $($e.value) — the tenant $($e.value) was asked for. Nothing was read or written." }
  }
  $script:Pim.Ctx = [ordered]@{
    TenantId = $org['id']; TenantName = $org['displayName']; DefaultDomain = $default; Domains = $domains
    AuthType = "$($ctx.AuthType)"; Principal = $(if ($ctx.Account) { $ctx.Account } else { "app $($ctx.ClientId)" }); Scopes = @($ctx.Scopes); Customer = $Customer
  }
  Write-PimOk ("{0} ({1}) · {2} · {3} · default domain {4}" -f $org['displayName'], $org['id'], $script:Pim.Ctx.AuthType, $script:Pim.Ctx.Principal, $default)
  return $script:Pim.Ctx
}
# Read before connecting: the plan being applied names its tenant, and its own
# operations must still carry the hash written into it.
function Read-PimPlanFile([string]$PlanFile, [string]$Kind) {
  if (-not $PlanFile) { throw "-Apply needs -PlanFile: the plan a previous run without -Apply wrote and you read. Nothing was written." }
  $ap = Read-PimJsonFile $PlanFile
  if ("$($ap['kind'])" -ne $Kind) { throw "The plan is a '$($ap['kind'])' plan; this script applies '$Kind' plans. Nothing was written." }
  $own = Get-PimPlanHash ([ordered]@{ schema = $ap['schema']; kind = $ap['kind']; tenantId = $ap['tenantId']; ops = @($ap['ops']) })
  if ($own -ne "$($ap['hash'])") { throw "The plan file $PlanFile was changed after it was written (its operations no longer carry its SHA-256). Plan again. Nothing was written." }
  return $ap
}
# A ReadWrite permission covers its Read; Directory.Read(Write).All covers the
# directory reads. Missing → stop with the exact line that adds them.
function Test-PimPermission([string]$Need, [string[]]$Have) {
  if ($Have -contains $Need) { return $true }
  $rw = $Need -replace '\.Read\.', '.ReadWrite.'
  if ($Have -contains $rw) { return $true }
  $dir = @{ 'Group.Read.All' = 1; 'User.Read.All' = 1; 'AdministrativeUnit.Read.All' = 1; 'GroupMember.Read.All' = 1; 'Organization.Read.All' = 1 }
  if ($dir.ContainsKey($Need) -and ($Have -contains 'Directory.Read.All' -or $Have -contains 'Directory.ReadWrite.All')) { return $true }
  return $false
}
function Assert-PimPermissions([string[]]$Needed, [string]$Why) {
  $c = $script:Pim.Ctx
  $missing = @($Needed | Where-Object { -not (Test-PimPermission $_ $c.Scopes) } | Sort-Object -Unique)
  if (-not $missing.Count) { Write-PimOk "Graph permissions for $Why present"; return }
  $list = ($missing | ForEach-Object { "'$_'" }) -join ','
  $fix = if ($c.AuthType -eq 'AppOnly') {
    $k = if ($c.Customer) { $c.Customer } else { '<KEY>' }
    "`n    .\Connect-Customer.ps1 -AddGraphScopes -Customer $k -GraphScopes $list`n    Disconnect-MgGraph; then run this again (a token carries the permissions it was issued with)."
  } else { "`n    Disconnect-MgGraph; Connect-MgGraph -TenantId $($c.TenantId) -Scopes $list" }
  throw "The connection lacks $($missing.Count) Graph permission(s) for ${Why}: $($missing -join ', '). Nothing was written.$fix"
}

# ---- rules: the framework's settings → Graph's unifiedRoleManagementPolicy rules
function ConvertTo-PimTimeSpan([string]$iso) { if (-not $iso) { return $null }; try { return [System.Xml.XmlConvert]::ToTimeSpan($iso) } catch { return $null } }
# Rule id → what the template key says it should be. Current rules are read,
# only the fields the framework governs are changed, and the rule is PATCHed
# back whole (its own target and @odata.type kept) — never rebuilt from scratch.
function Get-PimRuleChanges {
  param([object[]]$Rules, [System.Collections.IDictionary]$T, [hashtable]$ApproverIds, [string]$AlertDomain, [string[]]$VerifiedDomains)
  $by = @{}; foreach ($r in $Rules) { $by[$r['id']] = $r }
  $out = New-Object System.Collections.Generic.List[object]
  $clone = { param($x) ($x | ConvertTo-Json -Depth 32 | ConvertFrom-Json -AsHashtable -Depth 32) }
  $mail = {
    param($r)
    $s = "$r".ToLower()
    if ($s -notmatch '@') { return "$s@$AlertDomain" }
    $d = $s.Split('@')[1]
    if ($VerifiedDomains -and ($VerifiedDomains -notcontains $d)) { return ($s.Split('@')[0] + "@$AlertDomain") }
    return $s
  }
  $set = {
    param([string]$id, [scriptblock]$mutate)
    if (-not $by.ContainsKey($id)) { $out.Add([ordered]@{ ruleId = $id; missing = $true }); return }
    $before = & $clone $by[$id]; $after = & $clone $by[$id]
    & $mutate $after
    if ((ConvertTo-PimCanonical $before) -ne (ConvertTo-PimCanonical $after)) { $out.Add([ordered]@{ ruleId = $id; before = $before; after = $after }) }
  }
  $req = @("$($T['ActivationRequirement'])" -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'None' } | Sort-Object)
  & $set 'Expiration_EndUser_Assignment' { param($r) $r['isExpirationRequired'] = $true; $r['maximumDuration'] = "$($T['ActivationDuration'])" }
  & $set 'Enablement_EndUser_Assignment' { param($r) $r['enabledRules'] = @($req) }
  & $set 'AuthenticationContext_EndUser_Assignment' { param($r) $on = [bool]$T['AuthenticationContext_Enabled']; $r['isEnabled'] = $on; $r['claimValue'] = $(if ($on) { "$($T['AuthenticationContext_Value'])".Split(':')[0] } else { $null }) }
  & $set 'Approval_EndUser_Assignment' {
    param($r)
    $need = [bool]$T['ApprovalRequired']
    $r['setting']['isApprovalRequired'] = $need
    $stages = @($r['setting']['approvalStages'] | Where-Object { $_ })
    $stage = if ($stages.Count) { $stages[0] } else { [ordered]@{ approvalStageTimeOutInDays = 1; isApproverJustificationRequired = $true; escalationTimeInMinutes = 0; isEscalationEnabled = $false; escalationApprovers = @() } }
    $stage['primaryApprovers'] = @(if ($need) { foreach ($a in @($T['Approvers'])) {
      $name = if ($a -is [System.Collections.IDictionary]) { "$($a['description'])" } else { "$a" }
      $id = if ($a -is [System.Collections.IDictionary] -and "$($a['id'])" -match '^[0-9a-fA-F-]{36}$') { $a['id'] } else { $ApproverIds[$name] }
      if (-not $id) { throw "approver group $name has no id and is not planned — nothing can approve through it" }
      [ordered]@{ '@odata.type' = '#microsoft.graph.groupMembers'; groupId = $id; description = $name }
    } })
    $r['setting']['approvalStages'] = @($stage)
  }
  & $set 'Expiration_Admin_Eligibility' { param($r) $perm = [bool]$T['AllowPermanentEligibility']; $r['isExpirationRequired'] = -not $perm; if (-not $perm) { $r['maximumDuration'] = "$($T['MaximumEligibilityDuration'])" } }
  & $set 'Expiration_Admin_Assignment' { param($r) $perm = [bool]$T['AllowPermanentActiveAssignment']; $r['isExpirationRequired'] = -not $perm; if (-not $perm) { $r['maximumDuration'] = "$($T['MaximumActiveAssignmentDuration'])" } }
  $notes = @{ 'Notification_Admin_EndUser_Assignment' = 'Notification_Activation_Alert'; 'Notification_Admin_Admin_Eligibility' = 'Notification_EligibleAssignment_Alert'; 'Notification_Admin_Admin_Assignment' = 'Notification_ActiveAssignment_Alert' }
  foreach ($rid in $notes.Keys | Sort-Object) {
    $n = $T[$notes[$rid]]
    if (-not $n) { continue }
    & $set $rid { param($r)
      $r['notificationLevel'] = "$($n['notificationLevel'])"
      $r['isDefaultRecipientsEnabled'] = ("$($n['isDefaultRecipientEnabled'])" -ne 'false')
      $r['notificationRecipients'] = @(@($n['Recipients']) | Where-Object { $_ } | ForEach-Object { & $mail $_ } | Sort-Object -Unique)
    }
  }
  return $out.ToArray()
}
# The approver names a settings block needs resolved (only when approval is on).
function Get-PimApproverNames([System.Collections.IDictionary]$T) {
  if (-not [bool]$T['ApprovalRequired']) { return @() }
  return @(@($T['Approvers']) | Where-Object { $_ } | ForEach-Object {
    if ($_ -is [System.Collections.IDictionary]) { if ("$($_['id'])" -match '^[0-9a-fA-F-]{36}$') { return }; "$($_['description'])" } else { "$_" }
  } | Where-Object { $_ })
}
# Strip what Graph returns but does not take back.
function Get-PimRuleBody($rule) {
  $b = [ordered]@{}
  foreach ($k in $rule.Keys) { if ($k -notlike '*@odata.context' -and $k -ne '@odata.etag') { $b[$k] = $rule[$k] } }
  return $b
}

# ---- plans --------------------------------------------------------------------------
function New-PimPlan([string]$Kind, [string]$Source) {
  $c = $script:Pim.Ctx
  $src = [ordered]@{ path = $Source; sha256 = $(if ($Source -and (Test-Path -LiteralPath $Source)) { Get-PimSha256 (Get-Content -LiteralPath $Source -Raw -Encoding UTF8) } else { $null }) }
  return [ordered]@{
    schema = 'cloudfellows-pim-plan/2.1'; kind = $Kind; tenantId = $c.TenantId; tenantName = $c.TenantName; domain = $c.DefaultDomain
    createdAt = (Get-Date).ToUniversalTime().ToString('o'); createdBy = $c.Principal; source = $src
    resolved = [ordered]@{}; ops = New-Object System.Collections.Generic.List[object]
    findings = New-Object System.Collections.Generic.List[string]; blocked = New-Object System.Collections.Generic.List[string]; backup = New-Object System.Collections.Generic.List[object]
  }
}
# kind: http · groupPolicy · request (a schedule request; startDateTime is set when it runs)
function Add-PimOp($Plan, [string]$Key, [string]$Kind, [string]$Summary, [System.Collections.IDictionary]$Spec) {
  if (@($Plan.ops | Where-Object { $_.key -eq $Key }).Count) { return }
  $op = [ordered]@{ key = $Key; kind = $Kind; summary = $Summary }
  foreach ($k in $Spec.Keys) { $op[$k] = $Spec[$k] }
  $Plan.ops.Add($op)
}
function Get-PimPlanHash($Plan) {
  $core = [ordered]@{ schema = $Plan.schema; kind = $Plan.kind; tenantId = $Plan.tenantId; ops = @($Plan.ops | ForEach-Object { $o = [ordered]@{}; foreach ($k in $_.Keys) { if ($k -ne 'before') { $o[$k] = $_[$k] } }; $o }) }
  return Get-PimSha256 (ConvertTo-PimCanonical $core)
}
function Show-PimPlan($Plan) {
  Write-PimStep ("Plan: {0} operation(s) on {1}" -f $Plan.ops.Count, $Plan.tenantName)
  foreach ($o in $Plan.ops) { Write-PimWould $o.summary }
  foreach ($f in $Plan.findings) { Write-PimWarn $f }
  foreach ($b in $Plan.blocked) { Write-PimBad $b }
}
function Save-PimPlan($Plan, [string]$OutDir) {
  $Plan.hash = Get-PimPlanHash $Plan
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $OutDir ("pim-plan.{0}.{1}.{2}.json" -f $Plan.kind, $Plan.domain, $stamp)
  ($Plan | ConvertTo-Json -Depth 40) | Set-Content -LiteralPath $file -Encoding UTF8
  return $file
}
function Assert-PimPlanMatches($Fresh, [string]$PlanFile) {
  $ap = Read-PimPlanFile $PlanFile $Fresh.kind
  if ($ap['tenantId'] -ne $Fresh.tenantId) { throw "The plan is for tenant $($ap['tenantId']); connected to $($Fresh.tenantId). Nothing was written." }
  $h = Get-PimPlanHash $Fresh
  if ($ap['hash'] -ne $h) {
    $a = @($ap['ops'] | ForEach-Object { $_['key'] }); $f = @($Fresh.ops | ForEach-Object { $_.key })
    $gone = @($a | Where-Object { $f -notcontains $_ }); $new = @($f | Where-Object { $a -notcontains $_ })
    throw ("The tenant changed since the plan was made — stale plan, nothing was written.`n  no longer needed: {0}`n  new: {1}`n  Run without -Apply for a new plan, read it, then apply that one." -f $(if ($gone) { $gone -join '; ' } else { '—' }), $(if ($new) { $new -join '; ' } else { '— (same keys, different content)' }))
  }
  Write-PimOk "the approved plan $PlanFile matches the tenant now (SHA-256 $($h.Substring(0,16))…)"
}
function Confirm-PimApply($Plan, [switch]$Yes) {
  if ($Yes) { return }
  $word = $Plan.domain
  $a = Read-Host ("Type {0} to apply {1} operation(s) to {2}" -f $word, $Plan.ops.Count, $Plan.tenantName)
  if ($a -ne $word) { throw "Not confirmed. Nothing was written." }
}
# Before any rule or name changes: the current values, to a file that is read
# back. A backup that cannot be written or read stops the run.
function Save-PimBackup($Plan, [string]$OutDir) {
  $items = @($Plan.ops | Where-Object { $_.Contains('before') -and $null -ne $_.before })
  if (-not $items.Count) { return $null }
  $file = Join-Path $OutDir ("pim-backup.{0}.{1}.{2}.json" -f $Plan.kind, $Plan.domain, (Get-Date).ToString('yyyyMMdd-HHmmss'))
  $doc = [ordered]@{ schema = 'cloudfellows-pim-backup/2.1'; tenantId = $Plan.tenantId; createdAt = (Get-Date).ToUniversalTime().ToString('o'); items = @($items | ForEach-Object { [ordered]@{ key = $_.key; uri = $_.uri; before = $_.before } }) }
  ($doc | ConvertTo-Json -Depth 40) | Set-Content -LiteralPath $file -Encoding UTF8
  $check = Read-PimJsonFile $file
  if (@($check['items']).Count -ne $items.Count) { throw "Backup $file could not be verified. Nothing was written." }
  Write-PimOk "backup of $($items.Count) current value(s): $file (restore: -RestoreFrom $file)"
  return $file
}
function Resolve-PimPlaceholders($v) {
  if ($v -is [string]) {
    return [regex]::Replace($v, '\{\{([a-z]+):([^}]+)\}\}', {
      param($m) $k = "$($m.Groups[1].Value):$($m.Groups[2].Value)"
      if ($script:Pim.Ids.ContainsKey($k)) { return $script:Pim.Ids[$k] }
      throw "$k is not known yet (an earlier operation did not produce it)"
    })
  }
  if ($v -is [System.Collections.IDictionary]) { $o = [ordered]@{}; foreach ($k in $v.Keys) { $o[$k] = Resolve-PimPlaceholders $v[$k] }; return $o }
  if ($v -is [System.Collections.IEnumerable] -and $v -isnot [string]) { return , @($v | ForEach-Object { Resolve-PimPlaceholders $_ }) }
  return $v
}
# A value an apply step reads and changes itself (the membership policy of a
# group created in the same run): its current value goes to a backup file
# BEFORE the change, in the -RestoreFrom format, and the file is read back.
function Add-PimLateBackup([string]$Key, [string]$Uri, $Before) {
  if (-not $script:Pim.LateBackupFile) { throw "late backup outside an apply" }
  $script:Pim.LateBackup.Add([ordered]@{ key = $Key; uri = $Uri; before = $Before })
  $doc = [ordered]@{ schema = 'cloudfellows-pim-backup/2.1'; tenantId = $script:Pim.Ctx.TenantId; createdAt = (Get-Date).ToUniversalTime().ToString('o'); items = $script:Pim.LateBackup.ToArray() }
  ($doc | ConvertTo-Json -Depth 40) | Set-Content -LiteralPath $script:Pim.LateBackupFile -Encoding UTF8
  if (@((Read-PimJsonFile $script:Pim.LateBackupFile)['items']).Count -ne $script:Pim.LateBackup.Count) { throw "backup $($script:Pim.LateBackupFile) could not be verified" }
}
# Runs the ops in order. The first failure stops everything after it: a later
# op may depend on it, and a half-understood state is worse than a pause.
# Kinds: http · request (a schedule request, startDateTime set now) · anything
# else goes to -Resolver (the script's own step: a new group's membership
# policy, a guarded deletion). A resolver result starting with "deferred" is
# not done, and is counted as such.
function Invoke-PimPlan($Plan, [string]$OutDir, [scriptblock]$Resolver) {
  foreach ($k in $Plan.resolved.Keys) { $script:Pim.Ids[$k] = $Plan.resolved[$k] }
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $script:Pim.LateBackup = New-Object System.Collections.Generic.List[object]
  $script:Pim.LateBackupFile = Join-Path $OutDir ("pim-backup.{0}.{1}.{2}.late.json" -f $Plan.kind, $Plan.domain, $stamp)
  $outcome = New-Object System.Collections.Generic.List[object]
  $stop = $false
  $script:Pim.Applying = $true
  try {
    foreach ($o in $Plan.ops) {
      $rec = [ordered]@{ key = $o.key; summary = $o.summary; status = 'not run'; at = $null; id = $null; error = $null }
      $outcome.Add($rec)
      if ($stop) { continue }
      $rec.at = (Get-Date).ToUniversalTime().ToString('o')
      try {
        switch ($o.kind) {
          'http' {
            $r = Invoke-PimWrite $o.method (Resolve-PimPlaceholders $o.uri) $(if ($o.Contains('body')) { Resolve-PimPlaceholders $o.body } else { $null })
            if ($o.Contains('produces') -and $o.produces) { $id = if ($r -and $r.ContainsKey('id')) { $r['id'] } else { $null }; if (-not $id) { throw "no id came back" }; $script:Pim.Ids[$o.produces] = $id; $rec.id = $id }
            $rec.status = 'done'
          }
          'request' {
            $body = Resolve-PimPlaceholders $o.body
            if (-not $body.Contains('scheduleInfo')) { $body['scheduleInfo'] = [ordered]@{} }
            $body['scheduleInfo']['startDateTime'] = (Get-Date).ToUniversalTime().ToString('o')
            $r = Invoke-PimWrite 'POST' $o.uri $body
            $rec.id = $(if ($r) { $r['id'] }); $rec.status = "done ($(if ($r) { $r['status'] }))"
          }
          default {
            if (-not $Resolver) { throw "unknown op kind $($o.kind)" }
            $rec.status = "$(& $Resolver $o)"
          }
        }
        if ($rec.status -like 'deferred*') { Write-PimWarn "$($o.summary) — $($rec.status)" } else { Write-PimOk "$($o.summary) — $($rec.status)" }
      } catch {
        $rec.status = 'failed'; $rec.error = Get-PimGraphError $_
        Write-PimBad "$($o.summary) — $($rec.error)"
        $stop = $true
      }
    }
  } finally { $script:Pim.Applying = $false; $script:Pim.LateBackupFile = $null }
  $file = Join-Path $OutDir ("pim-outcome.{0}.{1}.{2}.json" -f $Plan.kind, $Plan.domain, $stamp)
  ([ordered]@{ schema = 'cloudfellows-pim-outcome/2.1'; tenantId = $Plan.tenantId; planHash = $Plan.hash; ops = $outcome } | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $file -Encoding UTF8
  $failed = @($outcome | Where-Object { $_.status -eq 'failed' }).Count
  $notrun = @($outcome | Where-Object { $_.status -eq 'not run' }).Count
  $deferred = @($outcome | Where-Object { "$($_.status)" -like 'deferred*' }).Count
  Write-PimStep ("Outcome: {0} done · {1} deferred · {2} failed · {3} not run — {4}" -f ($outcome.Count - $failed - $notrun - $deferred), $deferred, $failed, $notrun, $file)
  if ($script:Pim.LateBackup.Count) { Write-PimOk "backup of the membership policies changed during the run: $((Join-Path $OutDir ("pim-backup.{0}.{1}.{2}.late.json" -f $Plan.kind, $Plan.domain, $stamp))) (restore: New-PimBaseline.ps1 -RestoreFrom <that file>)" }
  return [ordered]@{ file = $file; failed = $failed; notRun = $notrun; deferred = $deferred }
}
# The group's Member (or Owner) policy, by group id (PIM for Groups).
function Get-PimGroupPolicy([string]$GroupId, [ValidateSet('member', 'owner')][string]$Role = 'member') {
  $u = "https://graph.microsoft.com/v1.0/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '$GroupId' and scopeType eq 'Group' and roleDefinitionId eq '$Role'&`$expand=policy(`$expand=rules)"
  $v = @(Invoke-PimGet $u -All)
  if (-not $v.Count -or -not $v[0]['policy']) { return $null }
  return $v[0]['policy']
}
function Get-PimGroupMemberPolicy([string]$GroupId) { return (Get-PimGroupPolicy $GroupId 'member') }
# The command line that applies a plan: the same parameters that built it
# (so the plan is rebuilt identically), plus -Apply -PlanFile.
function Get-PimApplyCommand([string]$Self, [System.Collections.IDictionary]$Bound, [string]$PlanFile) {
  $q = { param($x) $t = "$x"; if ($t -match '^[A-Za-z0-9_./\\:@,-]+$') { $t } else { "'" + $t.Replace("'", "''") + "'" } }
  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add($Self)
  foreach ($k in $Bound.Keys) {
    if ($k -in @('Apply', 'PlanFile', 'Yes', 'Verbose', 'Debug', 'ErrorAction', 'WarningAction', 'InformationAction')) { continue }
    $v = $Bound[$k]
    if ($v -is [System.Management.Automation.SwitchParameter]) { if ($v.IsPresent) { $parts.Add("-$k") }; continue }
    if ($v -is [array]) { $parts.Add("-$k " + ((@($v) | ForEach-Object { & $q $_ }) -join ',')) } else { $parts.Add("-$k " + (& $q $v)) }
  }
  $parts.Add('-Apply'); $parts.Add('-PlanFile ' + (& $q $PlanFile))
  return ($parts -join ' ')
}
function Get-PimWriteTest { return $script:Pim.Writes }
function Get-PimIds { return $script:Pim.Ids }
Export-ModuleMember -Function *
