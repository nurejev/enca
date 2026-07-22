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
  - Idempotent: safe to run again (updates the existing app).
  - Grants admin consent in your own tenant (skip with -SkipAdminConsent).
  - Patches js/authConfig.js with the client ID when found next to this script.

.EXAMPLE
  ./New-EncaAppRegistration.ps1

.NOTES
  Requires: Microsoft.Graph.Applications module, and a role that can create
  app registrations + grant tenant-wide consent (e.g. Global Administrator or
  Privileged Role Administrator + Application Administrator).
#>
[CmdletBinding()]
param(
  [string]$AppName = "ENCA (Limon-IT)",
  # The pre-rename display name. Only used to FIND the existing app when it has
  # not been renamed yet; tenants that already consented keep showing the old
  # name in their Enterprise applications list, which is expected.
  [string]$PreviousAppName = "CA Documenter (Limon-IT)",
  # Preferred: target the app registration by its immutable Object ID
  # (display-name lookup can match the wrong app if names collide).
  [string]$AppObjectId,
  # cadoc.limon-it.nl stays listed while the old domain still redirects - drop
  # it once nobody reaches the app on the old host any more.
  [string[]]$RedirectUris = @("https://enca.limon-it.nl", "https://cadoc.limon-it.nl", "http://localhost:8080"),
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
  # AuditLog.Read.All: read the directory audit log for the Change audit tool
  # (read-only, on demand). The signed-in user also needs a reader role that can
  # see audit logs - Reports Reader, Security Reader or Security Administrator.
  [string[]]$DelegatedScopes = @("Policy.Read.All", "Directory.Read.All", "AuditLog.Read.All", "Agreement.Read.All", "Application.Read.All", "Application.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess", "Policy.ReadWrite.AuthenticationMethod", "Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"),
  [string]$AuthConfigPath = (Join-Path $PSScriptRoot "js/authConfig.js"),
  [switch]$SkipAdminConsent
)

$ErrorActionPreference = "Stop"
$GraphAppId = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

#--- 1. Connect (reuse existing session when possible) -------------------
$requiredScopes = @("Application.ReadWrite.All")
if (-not $SkipAdminConsent) { $requiredScopes += "DelegatedPermissionGrant.ReadWrite.All" }

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
$appParams = @{
  DisplayName            = $AppName
  SignInAudience         = "AzureADMultipleOrgs"                  # multi-tenant
  Spa                    = @{ RedirectUris = $RedirectUris }       # SPA = auth code + PKCE, no secret
  RequiredResourceAccess = $requiredResourceAccess
  Web                    = @{ ImplicitGrantSettings = @{ EnableAccessTokenIssuance = $false; EnableIdTokenIssuance = $false } }
}

$app = if ($AppObjectId) {
  Get-MgApplication -ApplicationId $AppObjectId
} else {
  $matches2 = @(Get-MgApplication -Filter "displayName eq '$AppName'")
  if (-not $matches2 -and $PreviousAppName) {
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
}

#--- 4. Ensure a service principal exists in this tenant ----------------
$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId }

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
Write-Host "  Audience     : multi-tenant (AzureADMultipleOrgs)"
Write-Host "  SPA redirects: $($RedirectUris -join ', ')"
Write-Host "  Permissions  : $($DelegatedScopes -join ', ') (delegated)"
Write-Host ""
Write-Host "  Customer tenant admin-consent URL:" -ForegroundColor Cyan
Write-Host "  https://login.microsoftonline.com/organizations/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
Write-Host "=================================================================="
