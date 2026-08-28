<#
.SYNOPSIS
  Creates (or updates) the Entra app registration for ENCA.

.DESCRIPTION
  - Reuses an existing Microsoft Graph PowerShell session if it has the required
    scopes; otherwise signs in interactively.
  - Creates a multi-tenant SPA app registration with the enca.limon-it.nl and
    localhost redirect URIs and delegated Policy.Read.All + Directory.Read.All.
  - Rename-safe: if the app is not found under -AppName it also looks for the
    previous name (-PreviousAppName), so the 2026 CA Doc -> ENCA rename UPDATES
    the existing registration instead of creating a second one. The AppId must
    not change: every tenant that already consented is bound to it.
  - Name it what you like with -AppName. A self-hosted instance registers in
    YOUR tenant, and the registration shows up in your Enterprise applications
    list next to everything else you run, so "ENCA (Limon-IT)" is rarely the
    name you want there. The name is the only handle the script has when
    -AppObjectId is not given, so it is also what makes a re-run an UPDATE
    rather than a second registration - see the warning it prints.
  - Idempotent: safe to run again (updates the existing app).
  - Grants admin consent in your own tenant (skip with -SkipAdminConsent).
  - Optionally restricts the app to named users/groups (-RequireAssignment):
    sets "Assignment required" on the enterprise application and assigns the
    creator first, so the tool is usable only by you until you widen it.
  - Patches js/authConfig.js with the client ID when found next to this script.

.EXAMPLE
  ./New-EncaAppRegistration.ps1

.EXAMPLE
  # Lock the app to yourself while you evaluate it, then widen later from the portal.
  ./New-EncaAppRegistration.ps1 -RequireAssignment

.EXAMPLE
  # Yourself plus a team, by UPN or group display name.
  ./New-EncaAppRegistration.ps1 -RequireAssignment -AssignTo "sec-team@contoso.com","CA Administrators"

.EXAMPLE
  # High-assurance: register ENCA in YOUR tenant only, for your own hosted copy.
  ./New-EncaAppRegistration.ps1 -SingleTenant -SingleTenantRedirectUris "https://enca.contoso.example"
  # Prints the clientId + authority to paste into js/authConfig.local.js.
  # Full walkthrough: SINGLE-TENANT.md

.EXAMPLE
  # The same, under your own name in your own Enterprise applications list.
  ./New-EncaAppRegistration.ps1 -SingleTenant -AppName "Contoso CA Review" `
    -SingleTenantRedirectUris "https://enca.contoso.example","http://localhost:8080"
  # Re-run it with the SAME -AppName to update. A different name creates a
  # SECOND registration - to rename an existing one, pass -AppObjectId with
  # the new -AppName instead.

.NOTES
  Requires: Microsoft.Graph.Applications module, and a role that can create
  app registrations + grant tenant-wide consent (e.g. Global Administrator or
  Privileged Role Administrator + Application Administrator).
#>
[CmdletBinding()]
param(
  # The registration's display name, and - unless -AppObjectId is given - the
  # only thing the script looks it up by. Self-hosters SHOULD set this: the app
  # lands in your own Enterprise applications list, where a vendor's name on
  # your own registration is at best confusing. Under -SingleTenant the default
  # shortens to plain "ENCA", since the Limon-IT suffix names a publisher who
  # does not own the app you are creating.
  [string]$AppName = "ENCA (Limon-IT)",
  # The pre-rename display name. Only used to FIND the existing app when it has
  # not been renamed yet; tenants that already consented keep showing the old
  # name in their Enterprise applications list, which is expected.
  #
  # It is Limon-IT's own rename history, so it applies ONLY to the default
  # -AppName. Searching for it after somebody passed a name of their own would
  # mean a self-hoster who happens to have an app called "CA Documenter
  # (Limon-IT)" silently gets that app renamed to theirs.
  [string]$PreviousAppName = "CA Documenter (Limon-IT)",
  # Preferred: target the app registration by its immutable Object ID
  # (display-name lookup can match the wrong app if names collide).
  [string]$AppObjectId,
  # cadoc.limon-it.nl stays listed while the old domain still redirects - drop
  # it once nobody reaches the app on the old host any more.
  [string[]]$RedirectUris = @("https://enca.limon-it.nl", "https://cadoc.limon-it.nl", "http://localhost:8080"),
  # Register the app for THIS TENANT ONLY (AzureADMyOrg) instead of multi-tenant.
  # This is the high-assurance route: you own the registration, its consent
  # record and its audit trail, and no directory but yours can use it. Pair it
  # with your own hosted copy of the app and set the client ID + authority it
  # prints into js/authConfig.local.js. See SINGLE-TENANT.md.
  [switch]$SingleTenant,
  # Where your own copy is served from. Ignored unless -SingleTenant.
  [string[]]$SingleTenantRedirectUris = @("http://localhost:8080"),
  # Lock the app down to named people. Sets "Assignment required" on the
  # enterprise application (servicePrincipal.appRoleAssignmentRequired) so that
  # ANYONE not explicitly assigned is refused at sign-in with AADSTS50105, and
  # assigns YOU so you are not locked out of your own registration. Add others
  # with -AssignTo. Read the caveats in SINGLE-TENANT.md: this gates who may
  # OPEN the tool; it does not reduce what an assigned person can do, which is
  # still bounded by their own directory roles.
  [switch]$RequireAssignment,
  # Extra principals to assign, by UPN or group display name. Groups must be
  # assigned DIRECTLY - Entra does not honour nested groups for app assignment.
  [string[]]$AssignTo = @(),
  # Policy.ReadWrite.ConditionalAccess is only used by the Assign-groups tool;
  # Group.ReadWrite.All + RoleManagement.ReadWrite.Directory only when creating
  # role-assignable persona groups. All are requested on demand in the app but
  # must be consented here.
  # Agreement.Read.All: backing up terms-of-use dependencies (on demand).
  # Policy.ReadWrite.AuthenticationMethod: creating auth strengths during Import.
  # Application.ReadWrite.All: create service principals for Microsoft first-party
  # apps a fixed policy must reference (MS Learn "Apply in tenant").
  # Application.Read.All: Graph requires it to create/update policies that carry
  # an application condition (Import).
  # AuditLog.Read.All: read the directory audit log (Change audit) and the sign-in log (Sign-in failures)
  # AdministrativeUnit.ReadWrite.All: create the restricted management administrative unit protecting CA exclusion groups (CA groups - Protect)
  # (read-only, on demand). The signed-in user also needs a reader role that can
  # see audit logs - Reports Reader, Security Reader or Security Administrator.
  # Group Analyzer (all read-only, all on demand, all optional - the tool runs
  # per area and reports any area it could not read rather than failing):
  #   RoleManagement.Read.Directory            directory role + PIM eligibility
  #   EntitlementManagement.Read.All           access packages
  #   DeviceManagementConfiguration.Read.All   Intune compliance, config profiles
  #   DeviceManagementApps.Read.All            Intune apps + app protection
  #   DeviceManagementServiceConfig.Read.All   enrolment restrictions, Autopilot
  #   DeviceManagementScripts.Read.All         PowerShell/shell scripts, remediations
  #     (its own scope - Configuration.Read.All does NOT cover scripts)
  # Group-NestingSupport.ReadWrite.All: set disableNesting on a group (beta) so
  # no group can be added as a member - CA groups, on demand.
  # Azure RBAC is NOT a Graph permission: it uses the Azure Resource Manager
  # resource (https://management.azure.com/user_impersonation), consented
  # separately in the browser when the Azure area is switched on. Nothing to
  # add here for it - the signed-in user just needs Reader on the scopes they
  # want to see.
  [string[]]$DelegatedScopes = @("Policy.Read.All", "Directory.Read.All", "AuditLog.Read.All", "AdministrativeUnit.ReadWrite.All", "Agreement.Read.All", "Application.Read.All", "Application.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess", "Policy.ReadWrite.AuthenticationMethod", "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "RoleManagement.Read.Directory", "EntitlementManagement.Read.All", "DeviceManagementConfiguration.Read.All", "DeviceManagementApps.Read.All", "DeviceManagementServiceConfig.Read.All", "DeviceManagementScripts.Read.All", "Group-NestingSupport.ReadWrite.All"),
  [string]$AuthConfigPath = (Join-Path $PSScriptRoot "js/authConfig.js"),
  [switch]$SkipAdminConsent
)

$ErrorActionPreference = "Stop"
$GraphAppId = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

# Did the caller choose the name, or is this the canonical Limon-IT app? Asked
# via PSBoundParameters rather than by comparing against the default string:
# somebody passing -AppName "ENCA (Limon-IT)" explicitly means it, and a string
# comparison cannot tell that from not passing it at all.
$NamedByCaller = $PSBoundParameters.ContainsKey('AppName')

#--- 1. Connect (reuse existing session when possible) -------------------
$requiredScopes = @("Application.ReadWrite.All")
if (-not $SkipAdminConsent) { $requiredScopes += "DelegatedPermissionGrant.ReadWrite.All" }
# Assigning users/groups to the enterprise app needs its own scope.
if ($RequireAssignment) { $requiredScopes += "AppRoleAssignment.ReadWrite.All" }

$ctx = Get-MgContext
$missing = if ($ctx) { $requiredScopes | Where-Object { $_ -notin $ctx.Scopes } } else { $requiredScopes }
if ($ctx -and -not $missing) {
  Write-Host "Reusing existing Graph session: $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
} else {
  if ($ctx) { Write-Host "Existing session lacks scopes ($($missing -join ', ')) - reconnecting..." -ForegroundColor Yellow }
  Connect-MgGraph -Scopes $requiredScopes -NoWelcome
  $ctx = Get-MgContext
  Write-Host "Signed in as $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
}

#--- 2. Resolve delegated permission IDs from the Graph service principal ---
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$GraphAppId'"
$resourceAccess = foreach ($name in $DelegatedScopes) {
  $perm = $graphSp.Oauth2PermissionScopes | Where-Object Value -eq $name
  if (-not $perm) { throw "Delegated permission '$name' not found on Microsoft Graph." }
  @{ Id = $perm.Id; Type = "Scope" }
}
$requiredResourceAccess = @(@{ ResourceAppId = $GraphAppId; ResourceAccess = $resourceAccess })

#--- 3. Create or update the app registration ---------------------------
if ($SingleTenant) {
  # Your own tenant only. The redirect URIs must point at YOUR copy of the app;
  # the Limon-IT hosts are meaningless in a registration you own.
  $RedirectUris = $SingleTenantRedirectUris
  # Only the default shortens. A name the caller chose is left exactly alone.
  if (-not $NamedByCaller) { $AppName = "ENCA" }
}
$audience = if ($SingleTenant) { "AzureADMyOrg" } else { "AzureADMultipleOrgs" }

$appParams = @{
  DisplayName            = $AppName
  SignInAudience         = $audience
  Spa                    = @{ RedirectUris = $RedirectUris }       # SPA = auth code + PKCE, no secret
  RequiredResourceAccess = $requiredResourceAccess
  Web                    = @{ ImplicitGrantSettings = @{ EnableAccessTokenIssuance = $false; EnableIdTokenIssuance = $false } }
}

$app = if ($AppObjectId) {
  Get-MgApplication -ApplicationId $AppObjectId
} else {
  $safeName = $AppName.Replace("'", "''")
  $matches2 = @(Get-MgApplication -Filter "displayName eq '$safeName'")
  # The previous-name fallback is Limon-IT's rename history and belongs only to
  # the canonical app. Running it for a caller-chosen name would rename somebody
  # else's registration into theirs.
  if (-not $matches2 -and $PreviousAppName -and -not $NamedByCaller) {
    $matches2 = @(Get-MgApplication -Filter "displayName eq '$PreviousAppName'")
    if ($matches2) { Write-Host "Found the app under its previous name '$PreviousAppName' - it will be renamed to '$AppName' (AppId is unchanged)." -ForegroundColor Yellow }
  }
  if ($matches2.Count -gt 1) { throw "Multiple apps named '$AppName' found. Re-run with -AppObjectId <object-id> to target the right one." }
  $matches2 | Select-Object -First 1
}
if ($app) {
  Write-Host "App '$($app.DisplayName)' ($($app.Id)) exists - updating..." -ForegroundColor Yellow
  Update-MgApplication -ApplicationId $app.Id @appParams
  $app = Get-MgApplication -ApplicationId $app.Id
} else {
  Write-Host "Creating app registration '$AppName'..." -ForegroundColor Green
  $app = New-MgApplication @appParams
  # A NEW AppId means every consent recorded against the old one is orphaned,
  # and the commonest way to get here by accident is a typo in -AppName on a
  # re-run: the lookup misses, and the script dutifully creates a second app.
  if ($NamedByCaller) {
    Write-Host "  Note: re-run with EXACTLY -AppName '$AppName' to update this registration." -ForegroundColor Yellow
    Write-Host "        A different name creates a SECOND app with a new client ID. To rename" -ForegroundColor Yellow
    Write-Host "        this one later, pass -AppObjectId $($app.Id) with the new -AppName." -ForegroundColor Yellow
  }
}

#--- 4. Ensure a service principal exists in this tenant ----------------
$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId }

#--- 4b. Restrict who may open the app ----------------------------------
# "Assignment required" is enforced by Entra at sign-in, before any token is
# issued: an unassigned user gets AADSTS50105 and never reaches the app. It is
# a gate on WHO MAY OPEN the tool, not on what they can do once inside - that
# is still bounded by their own directory roles and by consent.
#
# The creator is assigned FIRST and unconditionally. Turning on the requirement
# without assigning anybody would lock every human out of the app, including
# the person who just created it.
if ($RequireAssignment) {
  # An app that exposes no app roles uses the well-known "default access" role.
  $defaultAccessRole = "00000000-0000-0000-0000-000000000000"

  $assignedNames = @()
  $failed = @()

  function Add-EncaAssignment {
    param([string]$PrincipalId, [string]$Label)
    $existing = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All |
                Where-Object { $_.PrincipalId -eq $PrincipalId }
    if ($existing) { Write-Host "  . $Label - already assigned" -ForegroundColor DarkGray; return $true }
    try {
      New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -BodyParameter @{
        principalId = $PrincipalId; resourceId = $sp.Id; appRoleId = $defaultAccessRole
      } | Out-Null
      Write-Host "  + $Label" -ForegroundColor Green
      return $true
    } catch {
      Write-Host "  x $Label - $($_.Exception.Message)" -ForegroundColor Red
      return $false
    }
  }

  Write-Host ""
  Write-Host "Restricting the app to assigned principals..." -ForegroundColor Cyan

  # 1) the person running this script
  $meUpn = (Get-MgContext).Account
  $me = $null
  try { $me = Get-MgUser -UserId $meUpn -Property Id,DisplayName,UserPrincipalName -ErrorAction Stop } catch {}
  if ($me) {
    if (Add-EncaAssignment -PrincipalId $me.Id -Label "$($me.DisplayName) <$($me.UserPrincipalName)>  (you)") {
      $assignedNames += $me.UserPrincipalName
    } else { $failed += $meUpn }
  } else {
    Write-Host "  ! Could not resolve the signed-in account '$meUpn' as a user object." -ForegroundColor Yellow
    Write-Host "    Assignment required will NOT be enabled - that would lock everyone out." -ForegroundColor Yellow
    $failed += $meUpn
  }

  # 2) anyone else named on the command line, by UPN or group display name
  foreach ($name in $AssignTo) {
    $n = $name.Trim(); if (-not $n) { continue }
    $principal = $null; $label = $n
    if ($n -like "*@*") {
      try { $u = Get-MgUser -UserId $n -Property Id,DisplayName -ErrorAction Stop
            $principal = $u.Id; $label = "$($u.DisplayName) <$n>  (user)" } catch {}
    }
    if (-not $principal) {
      # Escape on its own line: a $() holding double quotes inside a double-quoted
      # string is legal PowerShell but a trap for anyone editing it later.
      $safe = $n.Replace("'", "''")
      $filter = "displayName eq '" + $safe + "'"
      $g = @(Get-MgGroup -Filter $filter -Property Id,DisplayName)
      if ($g.Count -gt 1) { Write-Host "  x $n - several groups share that name; assign it in the portal" -ForegroundColor Red; $failed += $n; continue }
      if ($g.Count -eq 1) { $principal = $g[0].Id; $label = "$($g[0].DisplayName)  (group - members must be DIRECT, nested groups are ignored by Entra)" }
    }
    if (-not $principal) { Write-Host "  x $n - no user or group found" -ForegroundColor Red; $failed += $n; continue }
    if (Add-EncaAssignment -PrincipalId $principal -Label $label) { $assignedNames += $n } else { $failed += $n }
  }

  # 3) only now flip the switch, and only if somebody can actually get in
  if ($assignedNames.Count -gt 0) {
    Update-MgServicePrincipal -ServicePrincipalId $sp.Id -AppRoleAssignmentRequired:$true
    Write-Host "Assignment required: ON - everyone else is refused at sign-in (AADSTS50105)." -ForegroundColor Green
  } else {
    Write-Host "Assignment required: LEFT OFF - nobody could be assigned, and enabling it now would lock the app to nobody." -ForegroundColor Red
  }
  if ($failed.Count) { Write-Host "Not assigned: $($failed -join ', ')" -ForegroundColor Yellow }
}

#--- 5. Admin consent for this tenant -----------------------------------
if (-not $SkipAdminConsent) {
  $scopeString = $DelegatedScopes -join " "
  $grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)' and resourceId eq '$($graphSp.Id)' and consentType eq 'AllPrincipals'" | Select-Object -First 1
  if ($grant) {
    Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope $scopeString
    Write-Host "Admin consent updated ($scopeString)" -ForegroundColor Green
  } else {
    New-MgOauth2PermissionGrant -ClientId $sp.Id -ResourceId $graphSp.Id -ConsentType "AllPrincipals" -Scope $scopeString | Out-Null
    Write-Host "Admin consent granted ($scopeString)" -ForegroundColor Green
  }
}

#--- 6. Patch js/authConfig.js -------------------------------------------
if (Test-Path $AuthConfigPath) {
  $cfg = Get-Content $AuthConfigPath -Raw
  $cfg = $cfg -replace 'clientId:\s*"[^"]*"', "clientId: `"$($app.AppId)`""
  Set-Content -Path $AuthConfigPath -Value $cfg -NoNewline
  Write-Host "Patched clientId in $AuthConfigPath" -ForegroundColor Green
} else {
  Write-Host "authConfig.js not found at $AuthConfigPath - set clientId manually." -ForegroundColor Yellow
}

#--- 7. Summary ----------------------------------------------------------
Write-Host ""
Write-Host "==================== ENCA app registration ====================" -ForegroundColor Cyan
Write-Host "  Display name : $($app.DisplayName)"
Write-Host "  Client ID    : $($app.AppId)"
Write-Host "  Object ID    : $($app.Id)"
Write-Host "  Audience     : $(if ($SingleTenant) { 'THIS TENANT ONLY (AzureADMyOrg)' } else { 'multi-tenant (AzureADMultipleOrgs)' })"
Write-Host "  SPA redirects: $($RedirectUris -join ', ')"
Write-Host "  Permissions  : $($DelegatedScopes -join ', ') (delegated)"
if ($RequireAssignment) {
  $spNow = Get-MgServicePrincipal -ServicePrincipalId $sp.Id -Property AppRoleAssignmentRequired,Id
  $who = @(Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All | Select-Object -ExpandProperty PrincipalDisplayName)
  Write-Host "  Access       : $(if ($spNow.AppRoleAssignmentRequired) { 'ASSIGNED PRINCIPALS ONLY' } else { 'anyone in the tenant (assignment NOT required)' })"
  Write-Host "  Assigned     : $(if ($who) { $who -join ', ' } else { '(nobody)' })"
  Write-Host "  Add more     : Entra ID > Enterprise applications > $($app.DisplayName) > Users and groups"
}
Write-Host ""
if ($SingleTenant) {
  $tenantId = (Get-MgContext).TenantId
  Write-Host "  Paste this into js/authConfig.local.js of your copy:" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "    window.ENCA_AUTH = {"
  Write-Host "      clientId:  `"$($app.AppId)`","
  Write-Host "      authority: `"https://login.microsoftonline.com/$tenantId`","
  Write-Host "    };"
  Write-Host ""
  Write-Host "  ...and reference it in index.html just before js/authConfig.js:" -ForegroundColor Cyan
  Write-Host "    <script src=`"js/authConfig.local.js`"></script>"
  Write-Host ""
  Write-Host "  Admin-consent URL (this tenant):" -ForegroundColor Cyan
  Write-Host "  https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
  Write-Host ""
  Write-Host "  Full walkthrough: SINGLE-TENANT.md" -ForegroundColor Cyan
} else {
  Write-Host "  Customer tenant admin-consent URL:" -ForegroundColor Cyan
  Write-Host "  https://login.microsoftonline.com/organizations/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
}
Write-Host "=================================================================="
