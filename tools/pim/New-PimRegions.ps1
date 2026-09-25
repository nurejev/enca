<#
.SYNOPSIS
  Create everything regional the CloudFellows PIM framework expects, from a
  regions file — the two demo regions of cloudfellows.dev first, a customer's
  regions after.

.DESCRIPTION
  ENCA's 🧬 PIM baseline (T48, Workspace 02) → 🗺 Regions takes a customer's
  regions.csv, instantiates the framework's region TEMPLATE per row and shows
  what the tenant has. ⬇ Regions file writes the rows with the template as one
  JSON file; this script is the write side of the same file. Per row (region
  code <REG>, e.g. EU-NL) it makes sure these exist:

    Entra
      AU-<REG>-Users      dynamic administrative unit  (user.<attribute> -eq "<value>")
      AU-<REG>-Devices    dynamic administrative unit  (device.<attribute> -eq "<value>") -or (device.displayName -startsWith "<devicePrefix>")
      AU-<REG>-Groups     assigned administrative unit
      PIM-SG-<REG>-Helpdesk, PIM-SG-<REG>-Ops   role-assignable groups, PIM for Groups
                          on Member set to GroupTier2 (8 h, MFA + justification,
                          no approval, eligibility a year, nothing permanent)
      PIM-SG-<REG>-Approvers                     plain group, members = the row's approvers
      eligible role assignments of the two persona groups, SCOPED to the
      region's units (Helpdesk, Password, Authentication, License Administrator
      on -Users for the first line; User Administrator on -Users, Groups and
      Teams Administrator on -Groups, Cloud Device Administrator on -Devices
      for the second line), one year, as the template lists them
    Intune (unless -SkipIntune)
      INT-SG-USR-<REG>-All, INT-SG-DEV-<REG>-All   dynamic groups, same attribute
      INT-TAG-<REG>                                scope tag, auto-assigned from the device group
      INT-ROLE-Regional-Ops                        the one custom role (once)
      INT-RBAC-HelpDesk-<REG>, INT-RBAC-Ops-<REG>  role assignments: members = the
                                                   PIM-SG groups, scope = the INT-SG groups, tag = INT-TAG-<REG>
    Centre (the profile's restricted management unit)
      AU-RM-Admins        restricted management administrative unit; with
                          -RmauMembers every user matching -AdminPattern and every
                          PIM-SG-* group is added to it

  Additive, idempotent: what exists is left as it is and reported (a unit
  whose rule differs from the template is reported, and rewritten only with
  -Apply -FixRules). Nothing is ever deleted. WhatIf is the default: without
  -Apply the script only reads and prints what it would create.

  IMPACT, before -Apply:
    * Dynamic units and groups: none until a role is scoped to them. Every
      member of a dynamic unit needs Entra ID P1 (the admins need P1 or P2).
    * PIM-SG-<REG> groups: none until the eligibilities exist; eligible
      members still have to activate.
    * Scoped eligibilities: local IT gains, on activation, the scoped rights
      on the region's users, groups and devices — never on an admin (Entra
      blocks AU-scoped Helpdesk/Password/Authentication Administrators from
      users who hold a role) and never tenant-wide.
    * AU-RM-Admins with -RmauMembers: tenant-scoped Helpdesk and User
      Administrators lose the ability to edit the admin accounts and the
      PIM-SG groups — intended; only a role assigned ON the unit can. Do it
      before the regional first line goes live. Recovery: remove the member.
    * Intune: regional admins see and act on their scope after their next
      activation; central roles are untouched. Switch on "Scoped permissions"
      only after its Permissions Assessment Report (one-way) — this script
      does not flip it.
  RECOVERY: delete the unit (members untouched), the group (30-day recycle
  bin), the eligibility (Remove the schedule request), the Intune assignment
  or tag; nothing here changes an existing object except a rule with -FixRules.

.PARAMETER RegionsFile
  regions.csv (columns code,name,attribute,value,devicePrefix,autopilotTag,
  itLead,approvers,timezone — only code and name are required) or the JSON
  ENCA wrote (rows + template + Intune role). With a CSV the template comes
  from -TemplateFile.
.PARAMETER TemplateFile
  The template JSON (tools/pim/pim-regions-template.json). Ignored when the
  regions file carries its own.
.PARAMETER TenantId
  Tenant id or a verified domain (cloudfellows.dev).
.PARAMETER Domain
  Mail domain for the alert recipients (pim-alerts@<Domain>). Defaults to the
  tenant's default domain.
.PARAMETER Only
  Region codes to process (default: every row).
.PARAMETER Apply
  Create for real. Without it, WhatIf: nothing is written.
.PARAMETER FixRules
  With -Apply: rewrite the membership rule of a unit or group that exists with
  a different rule.
.PARAMETER SkipIntune
  Leave Intune alone (no scope groups, tag, custom role, assignments).
.PARAMETER SkipPolicies
  Do not set the PIM-for-Groups settings on the persona groups.
.PARAMETER RmauMembers
  Also add every user matching -AdminPattern and every PIM-SG-* group to
  AU-RM-Admins.
.PARAMETER AdminPattern
  Regex over UPN and display name for the admin accounts (default ^adm-).

.EXAMPLE
  # the baseline tenant, first look
  .\New-PimRegions.ps1 -RegionsFile .\regions.csv -TenantId cloudfellows.dev

.EXAMPLE
  # then for real, both demo regions, Intune included
  .\New-PimRegions.ps1 -RegionsFile .\regions.csv -TenantId cloudfellows.dev -Apply

.EXAMPLE
  # a customer, from ENCA's ⬇ Regions file, one region at a time
  .\New-PimRegions.ps1 -RegionsFile .\regions.contoso.nl.json -TenantId contoso.nl -Only EU-NL -Apply

.NOTES
  Needs Microsoft.Graph (Authentication, Groups, Users, Identity.DirectoryManagement).
  Delegated scopes: AdministrativeUnit.ReadWrite.All, Group.ReadWrite.All,
  User.Read.All, Directory.Read.All, RoleManagement.ReadWrite.Directory,
  RoleManagementPolicy.ReadWrite.AzureADGroup, PrivilegedAccess.ReadWrite.AzureADGroup,
  DeviceManagementRBAC.ReadWrite.All. The account needs Privileged Role
  Administrator (units, role-assignable groups, scoped eligibilities) and
  Intune Administrator (or Intune Role Administrator) for the Intune part.
  ENCA (T48 → Regions) is the read side; this is the write side. Same file.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RegionsFile,
  [string]$TemplateFile = (Join-Path $PSScriptRoot 'pim-regions-template.json'),
  [Parameter(Mandatory = $true)][string]$TenantId,
  [string]$Domain,
  [string[]]$Only,
  [switch]$Apply,
  [switch]$FixRules,
  [switch]$SkipIntune,
  [switch]$SkipPolicies,
  [switch]$RmauMembers,
  [string]$AdminPattern = '^adm-'
)
$ErrorActionPreference = 'Stop'
function Write-Step([string]$text) { Write-Host "▶ $text" -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Would([string]$text) { Write-Host "  ○ would $text" -ForegroundColor Gray }
function Write-Warn2([string]$text) { Write-Host "  ! $text" -ForegroundColor Yellow }
$script:made = 0; $script:kept = 0; $script:would = 0; $script:warned = 0

# ---- 0. the file --------------------------------------------------------------
if (-not (Test-Path $RegionsFile)) { throw "Regions file not found: $RegionsFile" }
$rows = @(); $template = $null; $intuneRoles = @(); $central = @(); $groupTier2 = $null
if ($RegionsFile -match '\.json$') {
  $j = Get-Content -Path $RegionsFile -Raw | ConvertFrom-Json -Depth 32
  $rows = @($j.regions); $template = $j.template; $intuneRoles = @($j.intuneRoles); $central = @($j.central.rmau)
  if ($j.groupTemplates -and $j.groupTemplates.GroupTier2) { $groupTier2 = $j.groupTemplates.GroupTier2 }
  Write-Step "Regions file $RegionsFile — $($j._comment)"
} else {
  $rows = @(Import-Csv -Path $RegionsFile)
  Write-Step "Regions file $RegionsFile — $($rows.Count) rows"
}
if (-not $template) {
  if (-not (Test-Path $TemplateFile)) { throw "Template not found: $TemplateFile (the CSV route needs tools/pim/pim-regions-template.json)" }
  $t = Get-Content -Path $TemplateFile -Raw | ConvertFrom-Json -Depth 32
  $template = $t.template; $intuneRoles = @($t.intuneRoles); $central = @($t.central.rmau)
  if ($t.groupTemplates -and $t.groupTemplates.GroupTier2) { $groupTier2 = $t.groupTemplates.GroupTier2 }
  Write-Ok "template from $TemplateFile"
}
# Defaults and validation, the same as ENCA's parseRegions.
$regions = @()
foreach ($r in $rows) {
  $code = ("$($r.code)").Trim().ToUpper()
  if (-not $code) { Write-Warn2 "a row without a code is skipped"; continue }
  if ($code -notmatch '^[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}$') { throw "Region code '$code' does not follow continent-country (EU-NL, NA-US, APAC-SG)" }
  if ($Only -and $Only -notcontains $code) { continue }
  $last = ($code -split '-')[-1]
  $approvers = @()
  if ($r.approvers) { $approvers = @(("$($r.approvers)" -split '[;|]') | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
  $regions += [pscustomobject]@{
    code = $code; name = $(if ($r.name) { "$($r.name)".Trim() } else { $code })
    attribute = $(if ($r.attribute) { "$($r.attribute)".Trim() } else { 'extensionAttribute1' })
    value = $(if ($r.value) { "$($r.value)".Trim() } else { $code })
    devicePrefix = $(if ($r.devicePrefix) { "$($r.devicePrefix)".Trim() } else { "$last-" })
    autopilotTag = $(if ($r.autopilotTag) { "$($r.autopilotTag)".Trim() } else { $code })
    itLead = "$($r.itLead)".Trim(); approvers = $approvers; timezone = "$($r.timezone)".Trim()
  }
}
if (-not $regions.Count) { throw "No region to process" }
Write-Ok ("regions: " + (($regions | ForEach-Object { "$($_.code) ($($_.name))" }) -join ', '))

function Fill([object]$v, $row) {
  if ($null -eq $v) { return $null }
  if ($v -is [string]) {
    return $v.Replace('<REG>', $row.code).Replace('<attribute>', $row.attribute).Replace('<value>', $row.value).Replace('<devicePrefix>', $row.devicePrefix).Replace('<autopilotTag>', $row.autopilotTag).Replace('<itLead>', $row.itLead).Replace('<approvers>', ($row.approvers -join '; ')).Replace('<name>', $row.name)
  }
  if ($v -is [array]) { return @($v | ForEach-Object { Fill $_ $row }) }
  if ($v -is [pscustomobject]) {
    $o = [ordered]@{}
    foreach ($p in $v.PSObject.Properties) { $o[$p.Name] = Fill $p.Value $row }
    return [pscustomobject]$o
  }
  return $v
}
function RuleKey([string]$r) { if (-not $r) { return '' } ; return (($r -replace '\s+', ' ').Trim().ToLower()) }

# ---- 1. Graph -----------------------------------------------------------------
Write-Step "Connecting to Microsoft Graph for $TenantId"
Import-Module Microsoft.Graph.Authentication, Microsoft.Graph.Groups, Microsoft.Graph.Users, Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop
$scopes = @('AdministrativeUnit.ReadWrite.All', 'Group.ReadWrite.All', 'User.Read.All', 'Directory.Read.All', 'RoleManagement.ReadWrite.Directory', 'RoleManagementPolicy.ReadWrite.AzureADGroup', 'PrivilegedAccess.ReadWrite.AzureADGroup')
if (-not $SkipIntune) { $scopes += 'DeviceManagementRBAC.ReadWrite.All' }
Connect-MgGraph -TenantId $TenantId -Scopes $scopes -NoWelcome
$org = Get-MgOrganization
$tid = $org.Id
if (-not $Domain) { $Domain = ($org.VerifiedDomains | Where-Object { $_.IsDefault } | Select-Object -First 1).Name }
Write-Ok "Tenant $($org.DisplayName) ($tid), mail domain $Domain$(if (-not $Apply) { ' — WhatIf: nothing is written' })"
function G([string]$method, [string]$uri, $body) {
  # ConsistencyLevel only where $count=true asks for it: the header routes a
  # read through the search index, which can lag a minute behind a creation —
  # a rerun would then not see what the last run made and make it again.
  $p = @{ Method = $method; Uri = $uri; OutputType = 'PSObject' }
  if ($uri -match '\$count=true') { $p.Headers = @{ ConsistencyLevel = 'eventual' } }
  if ($null -ne $body) { $p.Body = ($body | ConvertTo-Json -Depth 16 -Compress); $p.ContentType = 'application/json' }
  return Invoke-MgGraphRequest @p
}
function GAll([string]$uri) {
  $out = @(); $next = $uri
  while ($next) { $r = G GET $next; $out += @($r.value); $next = $r.'@odata.nextLink' }
  return $out
}
function Esc([string]$s) { return $s.Replace("'", "''") }

# ---- 2. what the tenant has ------------------------------------------------------
Write-Step "Reading the tenant"
$units = @{}; foreach ($u in (GAll "https://graph.microsoft.com/v1.0/directory/administrativeUnits?`$select=id,displayName,membershipType,membershipRule,membershipRuleProcessingState,isMemberManagementRestricted")) { $units[$u.displayName] = $u }
$groups = @{}; $dupes = @()
foreach ($g in (GAll "https://graph.microsoft.com/v1.0/groups?`$filter=startswith(displayName,'PIM-SG-') or startswith(displayName,'INT-SG-')&`$select=id,displayName,isAssignableToRole,membershipRule,groupTypes,createdDateTime")) {
  if ($groups[$g.displayName]) { $dupes += $g.displayName; if ($g.createdDateTime -lt $groups[$g.displayName].createdDateTime) { $groups[$g.displayName] = $g } }   # the oldest copy is the one that counts
  else { $groups[$g.displayName] = $g }
}
if ($dupes) { throw "These names exist more than once: $(($dupes | Sort-Object -Unique) -join ', '). Run New-PimBaseline.ps1 -MergeDuplicates first (keeps the oldest, deletes the empty copies), then rerun." }
$roleDefs = @{}; foreach ($d in (GAll "https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions?`$select=id,displayName")) { $roleDefs[$d.displayName] = $d.id }
Write-Ok "$($units.Count) administrative units, $($groups.Count) PIM-SG / INT-SG groups, $($roleDefs.Count) directory roles"

# ---- helpers that create -----------------------------------------------------------
function Ensure-Unit([string]$name, [string]$kind, [string]$rule, [string]$desc, [bool]$restricted = $false) {
  $u = $units[$name]
  if ($u) {
    if ($kind -eq 'dynamic' -and (RuleKey $u.membershipRule) -ne (RuleKey $rule)) {
      if ($Apply -and $FixRules) { G PATCH "https://graph.microsoft.com/v1.0/directory/administrativeUnits/$($u.id)" @{ membershipType = 'Dynamic'; membershipRule = $rule; membershipRuleProcessingState = 'On' } | Out-Null; Write-Ok "$name — rule rewritten"; $script:made++ }
      else { Write-Warn2 "$name exists with another rule: $($u.membershipRule) (template: $rule) — -Apply -FixRules rewrites it"; $script:warned++ }
    } elseif ($restricted -and -not $u.isMemberManagementRestricted) { Write-Warn2 "$name exists but is NOT restricted — a unit can only be made restricted at creation; recreate it under this name"; $script:warned++ }
    else { Write-Ok "$name exists$(if ($u.membershipType -eq 'Dynamic') { ' (dynamic)' })"; $script:kept++ }
    return $u.id
  }
  if (-not $Apply) { Write-Would "create $name ($kind$(if ($rule) { ": $rule" })$(if ($restricted) { ', restricted management' }))"; $script:would++; return $null }
  $body = @{ displayName = $name; description = $desc; visibility = 'HiddenMembership' }
  if ($kind -eq 'dynamic') { $body.membershipType = 'Dynamic'; $body.membershipRule = $rule; $body.membershipRuleProcessingState = 'On' }
  if ($restricted) { $body.isMemberManagementRestricted = $true }
  $new = G POST "https://graph.microsoft.com/v1.0/directory/administrativeUnits" $body
  $units[$name] = $new; Write-Ok "created $name → $($new.id)"; $script:made++
  return $new.id
}
function Ensure-Group([string]$name, [bool]$roleAssignable, [string]$rule, [string]$desc) {
  $g = $groups[$name]
  if ($g) {
    if ($roleAssignable -and -not $g.isAssignableToRole) { Write-Warn2 "$name exists but is NOT role-assignable — isAssignableToRole cannot be set later; rename it away and rerun"; $script:warned++ }
    elseif ($rule -and (RuleKey $g.membershipRule) -ne (RuleKey $rule)) {
      if ($Apply -and $FixRules) { G PATCH "https://graph.microsoft.com/v1.0/groups/$($g.id)" @{ membershipRule = $rule; membershipRuleProcessingState = 'On' } | Out-Null; Write-Ok "$name — rule rewritten"; $script:made++ }
      else { Write-Warn2 "$name exists with another rule: $($g.membershipRule) (template: $rule)"; $script:warned++ }
    } else { Write-Ok "$name exists"; $script:kept++ }
    return $g.id
  }
  if (-not $Apply) { Write-Would "create group $name ($(if ($roleAssignable) { 'role-assignable' } elseif ($rule) { "dynamic: $rule" } else { 'plain' }))"; $script:would++; return $null }
  $nick = ($name -replace '[^A-Za-z0-9]', '').ToLower()
  $body = @{ displayName = $name; mailEnabled = $false; mailNickname = $nick; securityEnabled = $true; description = $desc; groupTypes = @() }
  if ($roleAssignable) { $body.isAssignableToRole = $true; $body.visibility = 'Private' }
  if ($rule) { $body.groupTypes = @('DynamicMembership'); $body.membershipRule = $rule; $body.membershipRuleProcessingState = 'On' }
  $new = G POST "https://graph.microsoft.com/v1.0/groups" $body
  $groups[$name] = $new; Write-Ok "created $name → $($new.id)"; $script:made++
  return $new.id
}
function Ensure-Members([string]$gid, [string]$gname, [string[]]$upns) {
  if (-not $upns -or -not $upns.Count) { return }
  $have = @()
  if ($gid) { $have = @((GAll "https://graph.microsoft.com/v1.0/groups/$gid/members?`$select=id,userPrincipalName") | ForEach-Object { $_.userPrincipalName }) }
  foreach ($upn in $upns) {
    if ($have -contains $upn) { continue }
    $u = $null
    try { $u = G GET "https://graph.microsoft.com/v1.0/users/$([uri]::EscapeDataString($upn))?`$select=id,userPrincipalName" } catch { }
    if (-not $u) { Write-Warn2 "$gname — approver $upn not found in the tenant (the row names it; fix the file or add the person by hand)"; $script:warned++; continue }
    if (-not $Apply -or -not $gid) { Write-Would "add $upn to $gname"; $script:would++; continue }
    G POST "https://graph.microsoft.com/v1.0/groups/$gid/members/`$ref" @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($u.id)" } | Out-Null
    Write-Ok "$gname ← $upn"; $script:made++
  }
}
# PIM for Groups, the Member role: the GroupTier2 settings, rule by rule.
function Ensure-GroupPolicy([string]$gid, [string]$gname) {
  if ($SkipPolicies -or -not $groupTier2) { return }
  if (-not $gid) { Write-Would "set PIM for Groups (Member) on $gname to GroupTier2"; $script:would++; return }
  $pa = GAll "https://graph.microsoft.com/v1.0/policies/roleManagementPolicyAssignments?`$filter=scopeId eq '$gid' and scopeType eq 'Group' and roleDefinitionId eq 'member'&`$expand=policy(`$expand=rules)"
  if (-not $pa) { Write-Warn2 "$gname — no PIM policy for Member yet (the group is onboarded to PIM on its first read; rerun in a minute)"; $script:warned++; return }
  $pol = $pa[0].policy; $rules = @{}; foreach ($r in $pol.rules) { $rules[$r.id] = $r }
  $T = $groupTier2
  $req = @(("$($T.ActivationRequirement)" -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'None' })
  $recips = @($T.Notification_Activation_Alert.Recipients | ForEach-Object { if ($_ -match '@') { $_ } else { "$_@$Domain" } })
  $want = @(
    @{ id = 'Expiration_EndUser_Assignment'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_EndUser_Assignment'; isExpirationRequired = $true; maximumDuration = $T.ActivationDuration } ; test = { param($r) $r.maximumDuration -eq $T.ActivationDuration } },
    @{ id = 'Enablement_EndUser_Assignment'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyEnablementRule'; id = 'Enablement_EndUser_Assignment'; enabledRules = $req } ; test = { param($r) (@($r.enabledRules | Sort-Object) -join ',') -eq (@($req | Sort-Object) -join ',') } },
    @{ id = 'Approval_EndUser_Assignment'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyApprovalRule'; id = 'Approval_EndUser_Assignment'; setting = @{ isApprovalRequired = [bool]$T.ApprovalRequired; isApprovalRequiredForExtension = $false; isRequestorJustificationRequired = $true; approvalMode = 'SingleStage'; approvalStages = @(@{ approvalStageTimeOutInDays = 1; isApproverJustificationRequired = $true; escalationTimeInMinutes = 0; primaryApprovers = @(); isEscalationEnabled = $false; escalationApprovers = @() }) } } ; test = { param($r) [bool]$r.setting.isApprovalRequired -eq [bool]$T.ApprovalRequired } },
    @{ id = 'Expiration_Admin_Eligibility'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_Admin_Eligibility'; isExpirationRequired = (-not [bool]$T.AllowPermanentEligibility); maximumDuration = $T.MaximumEligibilityDuration } ; test = { param($r) ([bool]$r.isExpirationRequired -eq (-not [bool]$T.AllowPermanentEligibility)) -and $r.maximumDuration -eq $T.MaximumEligibilityDuration } },
    @{ id = 'Expiration_Admin_Assignment'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyExpirationRule'; id = 'Expiration_Admin_Assignment'; isExpirationRequired = (-not [bool]$T.AllowPermanentActiveAssignment); maximumDuration = $T.MaximumActiveAssignmentDuration } ; test = { param($r) ([bool]$r.isExpirationRequired -eq (-not [bool]$T.AllowPermanentActiveAssignment)) -and $r.maximumDuration -eq $T.MaximumActiveAssignmentDuration } },
    @{ id = 'Notification_Admin_EndUser_Assignment'; body = @{ '@odata.type' = '#microsoft.graph.unifiedRoleManagementPolicyNotificationRule'; id = 'Notification_Admin_EndUser_Assignment'; notificationType = 'Email'; recipientType = 'Admin'; notificationLevel = $T.Notification_Activation_Alert.notificationLevel; isDefaultRecipientsEnabled = $true; notificationRecipients = $recips } ; test = { param($r) $r.notificationLevel -eq $T.Notification_Activation_Alert.notificationLevel -and (@($r.notificationRecipients | Sort-Object) -join ',') -eq (@($recips | Sort-Object) -join ',') } }
  )
  $changed = 0
  foreach ($w in $want) {
    $cur = $rules[$w.id]
    if ($cur -and (& $w.test $cur)) { continue }
    if (-not $Apply) { Write-Would "set $($w.id) on $gname"; $script:would++; $changed++; continue }
    G PATCH "https://graph.microsoft.com/v1.0/policies/roleManagementPolicies/$($pol.id)/rules/$($w.id)" $w.body | Out-Null
    $changed++
  }
  if ($Apply -and $changed) { Write-Ok "$gname — PIM for Groups set to GroupTier2 ($changed rules)"; $script:made++ } elseif (-not $changed) { Write-Ok "$gname — PIM for Groups already GroupTier2"; $script:kept++ }
}
function Ensure-Eligibility([string]$role, [string]$gid, [string]$gname, [string]$auId, [string]$auName) {
  $rid = $roleDefs[$role]
  if (-not $rid) { Write-Warn2 "role '$role' not found in the tenant — check the template"; $script:warned++; return }
  if (-not $gid -or -not $auId) { Write-Would "make $gname eligible for $role at $auName (P365D)"; $script:would++; return }
  $scope = "/administrativeUnits/$auId"
  $have = @(GAll "https://graph.microsoft.com/v1.0/roleManagement/directory/roleEligibilityScheduleInstances?`$filter=principalId eq '$gid' and roleDefinitionId eq '$rid'")
  if ($have | Where-Object { $_.directoryScopeId -eq $scope }) { Write-Ok "$gname eligible for $role at $auName"; $script:kept++; return }
  if ($have | Where-Object { $_.directoryScopeId -eq '/' }) { Write-Warn2 "$gname holds $role at TENANT scope — wider than the region; the scoped one is added, remove the tenant-wide one by hand"; $script:warned++ }
  if (-not $Apply) { Write-Would "make $gname eligible for $role at $auName (P365D)"; $script:would++; return }
  $body = @{ action = 'adminAssign'; principalId = $gid; roleDefinitionId = $rid; directoryScopeId = $scope; justification = "CloudFellows PIM framework: $gname carries $role in $auName"; scheduleInfo = @{ startDateTime = (Get-Date).ToUniversalTime().ToString('o'); expiration = @{ type = 'afterDuration'; duration = 'P365D' } } }
  G POST "https://graph.microsoft.com/v1.0/roleManagement/directory/roleEligibilityScheduleRequests" $body | Out-Null
  Write-Ok "$gname eligible for $role at $auName (a year)"; $script:made++
}

# ---- 3. the centre ----------------------------------------------------------------------
foreach ($c in $central) {
  Write-Step "Centre: $($c.name)"
  $rmId = Ensure-Unit $c.name 'assigned' $null "CloudFellows PIM framework: restricted management unit for $($c.holds)" ([bool]$c.restricted)
  if ($RmauMembers) {
    $have = @()
    if ($rmId) { $have = @((GAll "https://graph.microsoft.com/v1.0/directory/administrativeUnits/$rmId/members?`$select=id") | ForEach-Object { $_.id }) }
    $admins = @((GAll "https://graph.microsoft.com/v1.0/users?`$select=id,displayName,userPrincipalName&`$top=999") | Where-Object { $_.userPrincipalName -match $AdminPattern -or $_.displayName -match $AdminPattern })
    $pimGroups = @($groups.Values | Where-Object { $_.displayName -like 'PIM-SG-*' })
    foreach ($m in ($admins + $pimGroups)) {
      if ($have -contains $m.id) { continue }
      $label = if ($m.userPrincipalName) { $m.userPrincipalName } else { $m.displayName }
      if (-not $Apply -or -not $rmId) { Write-Would "add $label to $($c.name)"; $script:would++; continue }
      G POST "https://graph.microsoft.com/v1.0/directory/administrativeUnits/$rmId/members/`$ref" @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($m.id)" } | Out-Null
      Write-Ok "$($c.name) ← $label"; $script:made++
    }
  } else { Write-Ok "members not touched (-RmauMembers adds every $AdminPattern account and every PIM-SG group)" }
}

# ---- 4. Intune, the parts made once ------------------------------------------------------
$tagIds = @{}; $intuneRoleIds = @{}
if (-not $SkipIntune) {
  Write-Step "Intune: roles and tags"
  try {
    foreach ($d in (GAll "https://graph.microsoft.com/beta/deviceManagement/roleDefinitions?`$select=id,displayName,isBuiltIn")) { $intuneRoleIds[$d.displayName] = $d.id }
    foreach ($t in (GAll "https://graph.microsoft.com/beta/deviceManagement/roleScopeTags")) { $tagIds[$t.displayName] = $t.id }
    $known = @((GAll "https://graph.microsoft.com/beta/deviceManagement/resourceOperations?`$select=actionName") | ForEach-Object { $_.actionName })
    foreach ($cr in $intuneRoles) {
      if ($intuneRoleIds[$cr.name]) { Write-Ok "$($cr.name) exists"; $script:kept++; continue }
      $allowed = @(); $unknown = @()
      foreach ($a in $cr.allowed) { if ($known -contains $a) { $allowed += $a } else { $unknown += $a } }
      if ($unknown.Count) { Write-Warn2 "$($cr.name): $($unknown.Count) actions this tenant does not know are left out: $($unknown -join ', ')"; $script:warned++ }
      if (-not $Apply) { Write-Would "create custom role $($cr.name) with $($allowed.Count) allowed actions"; $script:would++; continue }
      $body = @{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleDefinition'; displayName = $cr.name; description = $cr.description; isBuiltIn = $false; rolePermissions = @(@{ resourceActions = @(@{ allowedResourceActions = $allowed; notAllowedResourceActions = @() }) }) }
      $new = G POST "https://graph.microsoft.com/beta/deviceManagement/roleDefinitions" $body
      $intuneRoleIds[$cr.name] = $new.id; Write-Ok "created $($cr.name) → $($new.id)"; $script:made++
    }
  } catch { Write-Warn2 "Intune not reachable ($($_.Exception.Message)) — the Intune part is skipped; rerun with an Intune Administrator, or -SkipIntune"; $script:warned++; $SkipIntune = $true }
}

# ---- 5. per region -------------------------------------------------------------------------
foreach ($row in $regions) {
  Write-Step "Region $($row.code) · $($row.name)"
  $R = Fill $template $row
  $auIds = @{}
  foreach ($a in $R.aus) { $auIds[$a.name] = Ensure-Unit $a.name $a.kind $a.rule "CloudFellows PIM framework: $($row.name) ($($row.code)) — $($a.kind) unit for the region's $($a.type)s" }
  $gids = @{}
  foreach ($g in $R.groups) {
    $gids[$g.name] = Ensure-Group $g.name ([bool]$g.roleAssignable) $null "CloudFellows PIM framework: $($g.persona), $($row.name) ($($row.code)). $($g.description)"
    if ($g.roleAssignable) { Ensure-GroupPolicy $gids[$g.name] $g.name }
    elseif ($g.members -and $row.approvers.Count) { Ensure-Members $gids[$g.name] $g.name $row.approvers }
    elseif (-not $g.roleAssignable -and -not $row.approvers.Count) { Write-Warn2 "$($g.name): the row names no approvers — add them to the file or to the group by hand"; $script:warned++ }
  }
  foreach ($e in $R.eligibilities) { Ensure-Eligibility $e.role $gids[$e.group] $e.group $auIds[$e.au] $e.au }
  if (-not $SkipIntune -and $R.intune) {
    $sgIds = @{}
    foreach ($g in $R.intune.groups) { $sgIds[$g.name] = Ensure-Group $g.name $false $g.rule "CloudFellows PIM framework: Intune scope group, $($row.name) ($($row.code)), $($g.type)s" }
    $tag = $R.intune.tag
    if ($tag) {
      if ($tagIds[$tag.name]) { Write-Ok "$($tag.name) exists"; $script:kept++ }
      elseif (-not $Apply) { Write-Would "create scope tag $($tag.name), auto-assigned from $($tag.autoAssignFrom)"; $script:would++ }
      else {
        $new = G POST "https://graph.microsoft.com/beta/deviceManagement/roleScopeTags" @{ displayName = $tag.name; description = "CloudFellows PIM framework: $($row.name) ($($row.code))" }
        $tagIds[$tag.name] = $new.id; Write-Ok "created $($tag.name) → $($new.id)"; $script:made++
        if ($sgIds[$tag.autoAssignFrom]) { G POST "https://graph.microsoft.com/beta/deviceManagement/roleScopeTags/$($new.id)/assign" @{ assignments = @(@{ target = @{ '@odata.type' = '#microsoft.graph.groupAssignmentTarget'; groupId = $sgIds[$tag.autoAssignFrom] } }) } | Out-Null; Write-Ok "$($tag.name) auto-assigned from $($tag.autoAssignFrom)" }
      }
    }
    $existing = @{}
    try { foreach ($ra in (GAll "https://graph.microsoft.com/beta/deviceManagement/roleAssignments?`$select=id,displayName")) { $existing[$ra.displayName] = $ra.id } } catch { }
    foreach ($as in $R.intune.assignments) {
      if ($existing[$as.name]) { Write-Ok "$($as.name) exists"; $script:kept++; continue }
      $rname = $as.roles[0]; $rid = $intuneRoleIds[$rname]
      if (-not $rid) { Write-Warn2 "$($as.name): Intune role '$rname' not found"; $script:warned++; continue }
      $members = @($as.members | ForEach-Object { $gids[$_] } | Where-Object { $_ })
      $scopesG = @($as.scopeGroups | ForEach-Object { $sgIds[$_] } | Where-Object { $_ })
      $tags = @($as.tags | ForEach-Object { $tagIds[$_] } | Where-Object { $_ })
      if (-not $Apply -or $members.Count -ne $as.members.Count -or $scopesG.Count -ne $as.scopeGroups.Count) { Write-Would "create Intune assignment $($as.name): $rname · members $($as.members -join ', ') · scope $($as.scopeGroups -join ', ') · tag $($as.tags -join ', ')"; $script:would++; continue }
      $body = @{ '@odata.type' = '#microsoft.graph.deviceAndAppManagementRoleAssignment'; displayName = $as.name; description = "CloudFellows PIM framework: $($row.name) ($($row.code))"; members = $members; resourceScopes = $scopesG; scopeType = 'resourceScope'; roleScopeTagIds = $tags; 'roleDefinition@odata.bind' = "https://graph.microsoft.com/beta/deviceManagement/roleDefinitions/$rid" }
      G POST "https://graph.microsoft.com/beta/deviceManagement/roleAssignments" $body | Out-Null
      Write-Ok "created $($as.name)"; $script:made++
    }
    if ($R.intune.autopilot) { Write-Ok "Autopilot: profile '$($R.intune.autopilot.profile)', naming $($R.intune.autopilot.naming), group tag $($R.intune.autopilot.groupTag) — made in Intune by hand (not created here)" }
  }
  if ($R.review) { Write-Ok "Access review: $($R.review.name), $($R.review.cadence), reviewer $($R.review.reviewer) — set up in Identity Governance (not created here)" }
}

# ---- 6. the sum --------------------------------------------------------------------------
Write-Step "Done"
if (-not $Apply) { Write-Warn2 "WhatIf: $($script:would) objects would be created or changed, $($script:kept) already right, $($script:warned) warnings. Rerun with -Apply." }
else { Write-Ok "$($script:made) created or changed, $($script:kept) already right, $($script:warned) warnings. Open ENCA Workspace 02 → 🧬 PIM baseline → 🗺 Regions → ⟳ Read again." }
