<#
.SYNOPSIS
  Creates (or updates) a SINGLE-TENANT Entra app registration for ENCA in the
  tenant you are signed in to. Since ENCA build 327 that is the only kind
  ENCA signs in with: there is no shared, multi-tenant registration any more.

.DESCRIPTION
  - Single-tenant only (AzureADMyOrg), SPA (authorization code + PKCE), no
    secret, implicit grant off. An existing registration of the same name (or
    -AppObjectId) is UPDATED - and if it was multi-tenant, it is made
    single-tenant, which stops every other directory signing in through it.
  - Runs in Azure Cloud Shell (PowerShell; "No storage account required" is
    fine - nothing is kept once the window closes). There it uses the Cloud
    Shell session's own Microsoft Graph token: no second sign-in and no
    device-code prompt, which a good Conditional Access baseline blocks.
    Elsewhere it reuses a Microsoft Graph PowerShell session with the right
    scopes, or signs in interactively.
  - Redirect URIs: the ones given are ADDED to those the registration already
    has, never replacing them - one registration can serve the hosted site and
    your own copy at the same time.
  - Grants admin consent for the organisation (skip with -SkipAdminConsent).
  - -RequireAssignment sets "Assignment required" on the enterprise
    application after assigning you first, so it cannot seal you out.
  - Prints the two values ENCA needs - the client ID and the tenant ID - for
    the sign-in card (gear panel -> + Add), a container (ENCA_CLIENT_ID /
    ENCA_TENANT_ID) or js/authConfig.local.js. It never edits js/authConfig.js.

.EXAMPLE
  # Azure Cloud Shell, PowerShell. The ENCA sign-in card gives this line with
  # the SHA-256 check in front of it; this is the part after the download.
  ./New-EncaAppRegistration.ps1 -RedirectUris "https://enca.limon-it.nl/" -RequireAssignment

.EXAMPLE
  # Your own copy, under your own name, with a team assigned.
  ./New-EncaAppRegistration.ps1 -AppName "Contoso CA Review" `
    -RedirectUris "https://enca.contoso.example/","http://localhost:8080" `
    -RequireAssignment -AssignTo "sec-team@contoso.com","CA Administrators"
  # Re-run with the SAME -AppName to update. A different name creates a
  # SECOND registration - to rename one, pass -AppObjectId with the new name.

.EXAMPLE
  # Refuse to run anywhere but the tenant you meant.
  ./New-EncaAppRegistration.ps1 -TenantId 00000000-1111-2222-3333-444444444444 -RequireAssignment

.NOTES
  Requires: the Microsoft.Graph.Applications module (preinstalled in Cloud
  Shell), and a role that can create app registrations and grant tenant-wide
  consent: Global Administrator, or Privileged Role Administrator together
  with Application Administrator.
#>
[CmdletBinding()]
param(
  # The registration's display name, and - unless -AppObjectId is given - the
  # only thing the script looks it up by. It lands in your own Enterprise
  # applications list, so name it what your admins will recognise.
  [string]$AppName = "ENCA",
  # Preferred: target the app registration by its immutable Object ID
  # (display-name lookup can match the wrong app if names collide).
  [string]$AppObjectId,
  # Where ENCA is served from, exactly as the browser shows it (origin + path).
  # Added to the registration's SPA redirect URIs; existing ones are kept.
  [string[]]$RedirectUris = @("https://enca.limon-it.nl/"),
  # Only run in this tenant (tenant ID). The script stops if the session is
  # signed in anywhere else.
  [string]$TenantId,
  # Accepted for scripts written for build 32708 and earlier, and ignored:
  # every registration this script makes is single-tenant now.
  [switch]$SingleTenant,
  # The old -SingleTenant companion. When given it is used as -RedirectUris.
  [string[]]$SingleTenantRedirectUris,
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
  # DirectoryRecommendations.Read.All: read the Entra Identity Secure Score and
  # its recommendations (Checks - Identity score, and the home page), read-only,
  # on demand. The signed-in user also needs Reports Reader, Security Reader,
  # Global Reader or a similar role.
  # CrossTenantInformation.ReadBasic.All: look up partner tenant names and
  # default domains (Checks - Cross-tenant, Show partner names), read-only,
  # on demand.
  # Azure RBAC is NOT a Graph permission: it uses the Azure Resource Manager
  # resource (https://management.azure.com/user_impersonation), consented
  # separately in the browser when the Azure area is switched on. Nothing to
  # add here for it - the signed-in user just needs Reader on the scopes they
  # want to see.
  # App access review (T60, build 328) writes - each asked for at the click:
  # AppRoleAssignment.ReadWrite.All: assign a group to an app (Restrict) and
  # take an application permission away from an app or give it back.
  # DelegatedPermissionGrant.ReadWrite.All: take delegated permissions, or a
  # user's own consent, away from an app and give them back.
  # Policy.ReadWrite.ConsentRequest: switch the admin consent requests (admin
  # consent workflow) on or off with a group as reviewers.
  # The role still decides: Cloud Application Administrator or Application
  # Administrator; Privileged Role Administrator to give a Microsoft Graph
  # application permission back.
  [string[]]$DelegatedScopes = @("Policy.Read.All", "Directory.Read.All", "AuditLog.Read.All", "AdministrativeUnit.ReadWrite.All", "Agreement.Read.All", "Application.Read.All", "Application.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess", "Policy.ReadWrite.AuthenticationMethod", "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory", "RoleManagement.Read.Directory", "EntitlementManagement.Read.All", "DeviceManagementConfiguration.Read.All", "DeviceManagementApps.Read.All", "DeviceManagementServiceConfig.Read.All", "DeviceManagementScripts.Read.All", "Group-NestingSupport.ReadWrite.All", "DirectoryRecommendations.Read.All", "CrossTenantInformation.ReadBasic.All", "AppRoleAssignment.ReadWrite.All", "DelegatedPermissionGrant.ReadWrite.All", "Policy.ReadWrite.ConsentRequest"),
  [switch]$SkipAdminConsent
)

$ErrorActionPreference = "Stop"
$GraphAppId = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

# Did the caller choose the name? Only used to word the re-run hint.
$NamedByCaller = $PSBoundParameters.ContainsKey('AppName')
if ($SingleTenant) { Write-Host "-SingleTenant is no longer needed: every registration this script makes is single-tenant." -ForegroundColor DarkGray }
if ($SingleTenantRedirectUris) { $RedirectUris = $SingleTenantRedirectUris }

#--- 1. Connect (reuse existing session when possible) -------------------
$requiredScopes = @("Application.ReadWrite.All")
if (-not $SkipAdminConsent) { $requiredScopes += "DelegatedPermissionGrant.ReadWrite.All" }
# Assigning users/groups to the enterprise app needs its own scope.
if ($RequireAssignment) { $requiredScopes += "AppRoleAssignment.ReadWrite.All" }

# Azure Cloud Shell has no browser for an interactive sign-in, and a
# device-code prompt is exactly what a Conditional Access baseline blocks. Its
# own session already holds a token for Microsoft Graph (the administrator who
# opened the shell, with their MFA and their Conditional Access) - use that.
# What the token may do is then bounded by that person's directory roles, so
# the scope check below does not apply to it.
$inCloudShell = ($env:AZUREPS_HOST_ENVIRONMENT -like 'cloud-shell*') -or [bool]$env:ACC_CLOUD
$ctx = Get-MgContext
$missing = if ($ctx) { $requiredScopes | Where-Object { $_ -notin $ctx.Scopes } } else { $requiredScopes }
if ($ctx -and -not $missing) {
  Write-Host "Reusing existing Graph session: $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
} elseif ($inCloudShell) {
  $at = Get-AzAccessToken -ResourceTypeName MSGraph -ErrorAction Stop
  $secure = if ($at.Token -is [securestring]) { $at.Token } else { ConvertTo-SecureString $at.Token -AsPlainText -Force }
  Connect-MgGraph -AccessToken $secure -NoWelcome
  $ctx = Get-MgContext
  Write-Host "Using the Cloud Shell session: $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
} else {
  if ($ctx) { Write-Host "Existing session lacks scopes ($($missing -join ', ')) - reconnecting..." -ForegroundColor Yellow }
  if ($TenantId) { Connect-MgGraph -Scopes $requiredScopes -TenantId $TenantId -NoWelcome } else { Connect-MgGraph -Scopes $requiredScopes -NoWelcome }
  $ctx = Get-MgContext
  Write-Host "Signed in as $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
}
if ($TenantId -and $ctx.TenantId -and ($ctx.TenantId -ne $TenantId)) {
  throw "Signed in to tenant $($ctx.TenantId), not $TenantId - nothing was changed. Open Cloud Shell in the right directory (or sign in to it) and run again."
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
# Always this tenant only (327). There is no multi-tenant variant to choose.
$audience = "AzureADMyOrg"

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
  if ($matches2.Count -gt 1) { throw "Multiple apps named '$AppName' found. Re-run with -AppObjectId <object-id> to target the right one." }
  $matches2 | Select-Object -First 1
}
if ($app) {
  Write-Host "App '$($app.DisplayName)' ($($app.Id)) exists - updating..." -ForegroundColor Yellow
  # Keep every redirect URI it already has: one registration may serve the
  # hosted site and a copy of your own, and replacing the list signs one out.
  $have = @($app.Spa.RedirectUris)
  $appParams.Spa = @{ RedirectUris = @($have + $RedirectUris | Where-Object { $_ } | Select-Object -Unique) }
  if ($app.SignInAudience -ne $audience) {
    Write-Host "  It is $($app.SignInAudience) - making it single-tenant. Every OTHER directory stops signing in through it now." -ForegroundColor Yellow
  }
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

  # 1) the person running this script - read from /me, which works for every
  # sign-in kind (a Cloud Shell token has no Account in Get-MgContext) and
  # needs no Microsoft.Graph.Users module (Cloud Shell does not preinstall it)
  $meUpn = (Get-MgContext).Account
  $me = $null
  try {
    $r = Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName' -ErrorAction Stop
    $me = [pscustomobject]@{ Id = $r.id; DisplayName = $r.displayName; UserPrincipalName = $r.userPrincipalName }
    if (-not $meUpn) { $meUpn = $me.UserPrincipalName }
  } catch {}
  if ($me -and $me.Id) {
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
      try { $u = Invoke-MgGraphRequest -Method GET -Uri ("https://graph.microsoft.com/v1.0/users/" + [uri]::EscapeDataString($n) + '?$select=id,displayName') -ErrorAction Stop
            $principal = $u.id; $label = "$($u.displayName) <$n>  (user)" } catch {}
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

#--- 6. js/authConfig.js is never edited ----------------------------------
# Until 32708 this step wrote the client ID into js/authConfig.js for the
# shared multi-tenant registration. There is none any more, and a tenant's own
# client ID in a file every visitor is served is how a published site ends up
# pointed at one customer. The values are printed below instead.

#--- 7. Summary ----------------------------------------------------------
Write-Host ""
Write-Host "==================== ENCA app registration ====================" -ForegroundColor Cyan
Write-Host "  Display name : $($app.DisplayName)"
Write-Host "  Client ID    : $($app.AppId)"
Write-Host "  Object ID    : $($app.Id)"
Write-Host "  Audience     : THIS TENANT ONLY (AzureADMyOrg)"
Write-Host "  SPA redirects: $(@((Get-MgApplication -ApplicationId $app.Id -Property Spa).Spa.RedirectUris) -join ', ')"
Write-Host "  Permissions  : $($DelegatedScopes -join ', ') (delegated)"
if ($RequireAssignment) {
  $spNow = Get-MgServicePrincipal -ServicePrincipalId $sp.Id -Property AppRoleAssignmentRequired,Id
  $who = @(Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All | Select-Object -ExpandProperty PrincipalDisplayName)
  Write-Host "  Access       : $(if ($spNow.AppRoleAssignmentRequired) { 'ASSIGNED PRINCIPALS ONLY' } else { 'anyone in the tenant (assignment NOT required)' })"
  Write-Host "  Assigned     : $(if ($who) { $who -join ', ' } else { '(nobody)' })"
  Write-Host "  Add more     : Entra ID > Enterprise applications > $($app.DisplayName) > Users and groups"
}
Write-Host ""
$tenantId = (Get-MgContext).TenantId
Write-Host "  SIGN IN WITH IT - on the ENCA sign-in card: gear panel -> + Add" -ForegroundColor Cyan
Write-Host "    Application (client) ID : $($app.AppId)"
Write-Host "    Tenant                  : $tenantId"
Write-Host ""
Write-Host "  A copy of your own? Pass the same two values:" -ForegroundColor Cyan
Write-Host "    docker run -e ENCA_CLIENT_ID=$($app.AppId) -e ENCA_TENANT_ID=$tenantId ..."
Write-Host "    or js/authConfig.local.js:  window.ENCA_AUTH = { clientId: `"$($app.AppId)`", authority: `"https://login.microsoftonline.com/$tenantId`" };"
Write-Host ""
Write-Host "  Admin-consent URL (this tenant, if you skipped consent):" -ForegroundColor Cyan
Write-Host "  https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
Write-Host ""
Write-Host "  Full walkthrough: SINGLE-TENANT.md" -ForegroundColor Cyan
Write-Host "=================================================================="
