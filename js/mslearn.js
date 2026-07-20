// ======================================================================
// MS Learn — documented exclusion checks.
// Maps CA policy patterns to exclusions, limitations and configuration
// requirements documented on learn.microsoft.com. When a policy matches
// a pattern but misses a documented exclusion (or is misconfigured),
// it is flagged with severity, impact, requirement and remediation.
// Read-only: works entirely on the already-loaded policy JSON (plus one
// read of the authentication strength policies for the EAM check).
// Check set inspired by github.com/Jhope188/ca-policy-analyzer.
// ======================================================================
const MSLearn = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---- well-known app IDs ----
  const EXCHANGE_ONLINE = "00000002-0000-0ff1-ce00-000000000000";
  const SHAREPOINT_ONLINE = "00000003-0000-0ff1-ce00-000000000000";
  const TEAMS_SERVICE = "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe";
  const AZURE_VIRTUAL_DESKTOP = "9cdead84-a844-4324-93f2-b2e6bb768d07";
  const WINDOWS_365 = "0af06dc6-e4b5-4f28-818e-e78e62d137a5";
  const WINDOWS_CLOUD_LOGIN = "372140e0-b3b7-4226-8ef9-d57986796201";
  const DEFENDER_ATP_XPLAT = "a0e84e36-b067-4d5c-ab4a-3db38e598ae2";
  const DEFENDER_TVM = "e724aa31-0f56-4018-b8be-f8cb82ca1196";
  const DIRSYNC_ROLE = "d29b2b05-8046-44ba-8758-1e26182fcf32";
  // ---- baseline naming conventions ----
  // The Limon-IT baseline names its exclusion groups predictably, so a fix can
  // resolve the right group instead of guessing. Looked up by the caller and
  // handed in through ctx; when a group does not exist, the fix declines.
  // The first entry is canonical: it is what gets created when the tenant has
  // none of them. The rest are accepted aliases.
  const CONVENTION = {
    breakGlass: ["CAB-SEC-U-BreakGlass"],
    sharedDevices: ["CAB-SEC-U-SharedDevices", "CAB-SEC-U-Persona-SharedDevices",
                    "CAB-SEC-U-TeamsDevices", "CAB-SEC-U-Persona-Microsoft365ServiceAccounts"],
  };
  const GROUP_PURPOSE = {
    sharedDevices: "Teams Rooms, Teams panels, Teams phones and Surface Hub resource accounts — excluded from controls these devices cannot satisfy",
    breakGlass: "Emergency access (break-glass) accounts — excluded from every Conditional Access policy",
  };

  const TOKEN_PROT_APPS = [EXCHANGE_ONLINE, SHAREPOINT_ONLINE, TEAMS_SERVICE, AZURE_VIRTUAL_DESKTOP, WINDOWS_365, WINDOWS_CLOUD_LOGIN];
  // Device filter excluding every registration type token protection cannot support.
  const TOKEN_PROT_DEVICE_RULE = 'device.systemLabels -ne "CloudPC" -and device.systemLabels -ne "AzureVirtualDesktop" '
    + '-and device.profileType -ne "AutopilotSelfDeploying" -and device.profileType -ne "SecureVM"';

  // Add a group exclusion from ctx, or decline (null) when the tenant has no
  // group matching the convention — an invented exclusion is worse than none.
  function excludeGroupFix(ctxKey, what) {
    const fn = (d, ctx) => {
      const g = ctx && ctx[ctxKey];
      if (!g) return null;
      const u = d.conditions.users || (d.conditions.users = {});
      const list = u.excludeGroups || (u.excludeGroups = []);
      if (list.includes(g.id)) return [];
      list.push(g.id);
      return [`Excluded ${g.name} — the ${what} group`];
    };
    fn.needsGroup = ctxKey;   // which convention group this fix depends on
    return fn;
  }

  // ---- helpers on the raw Graph policy shape (fields may be missing) ----
  const U = (p) => p.conditions?.users || {};
  const A = (p) => p.conditions?.applications || {};
  const G = (p) => p.grantControls || {};
  const S = (p) => p.sessionControls || {};
  const grants = (p) => G(p).builtInControls || [];
  const appsInc = (p) => A(p).includeApplications || [];
  const appsExcLower = (p) => (A(p).excludeApplications || []).map((a) => String(a).toLowerCase());
  // When INCLUDE_DISABLED is set (e.g. a baseline tenant where the persona
  // policies are staged Off before enforcement) disabled policies are checked
  // too, as if they were switched on.
  let INCLUDE_DISABLED = false;
  const isActive = (p) => p.state === "enabled" || p.state === "enabledForReportingButNotEnforced" || (INCLUDE_DISABLED && p.state === "disabled");
  const allUsers = (p) => (U(p).includeUsers || []).includes("All");
  const allApps = (p) => appsInc(p).includes("All");
  const hasMfa = (p) => grants(p).includes("mfa") || G(p).authenticationStrength != null;
  const hasBlock = (p) => grants(p).includes("block");
  const hasCompliance = (p) => grants(p).includes("compliantDevice");
  const hasAdminRoles = (p) => (U(p).includeRoles || []).length > 0;
  const noUserExclusions = (p) => {
    const u = U(p);
    return !(u.excludeUsers || []).length && !(u.excludeGroups || []).length && !(u.excludeRoles || []).length;
  };
  const hasTokenProtection = (p) => {
    const s = S(p);
    return !!(s.secureSignInSession?.isEnabled || s.tokenProtection?.signInSessionTokenProtection?.isEnabled);
  };

  // ---- checks database ----
  const CHECKS = [
    // ── Emergency access / break-glass ────────────────────────────────
    {
      id: "break-glass-missing",
      title: "Break-glass accounts: no user exclusions on broad policy",
      appliesWhen: "Policy targets All users with MFA, block or device compliance controls",
      requirement: "Microsoft recommends excluding at least two emergency access (break-glass) accounts from every CA policy, so a misconfiguration or outage can never lock every administrator out of the tenant.",
      severity: "critical",
      docUrl: "https://learn.microsoft.com/entra/identity/role-based-access-control/security-emergency-access",
      remediation: "Exclude at least 2 emergency access (break-glass) accounts from this policy. Keep them cloud-only, with strong credentials, and alert on every sign-in.",
      // prefers the conventional break-glass group (CAB-SEC-U-BreakGlass),
      // falling back to whatever the exclusion patterns pointed at
      fix: (d, ctx) => {
        const bg = ctx && ctx.breakGlass;
        if (!bg) return null;
        const u = d.conditions.users || (d.conditions.users = {});
        const key = bg.type === "group" ? "excludeGroups" : "excludeUsers";
        const list = u[key] || (u[key] = []);
        if (list.includes(bg.id)) return [];
        list.push(bg.id);
        return [`Excluded the detected break-glass ${bg.type} ${bg.name || bg.id}`];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p)) return null;
        if (!hasMfa(p) && !hasBlock(p) && !hasCompliance(p)) return null;
        if (!noUserExclusions(p)) return null;
        return {
          detail: `Policy "${p.displayName}" targets All users with enforcement controls but has NO user exclusions. If it is misconfigured or an outage occurs, all users — including every admin — can be locked out.`,
          impactedResources: ["All administrators", "Emergency access accounts"],
        };
      },
    },
    {
      id: "approved-client-app-retirement",
      title: "Approved client app grant retiring — migrate to app protection policy",
      appliesWhen: "Policy uses 'Require approved client app' without (OR) 'Require app protection policy'",
      requirement: "Microsoft is retiring the 'Require approved client app' grant control in early March 2026. Policies must move to 'Require application protection policy', or use both controls with the OR operator during transition.",
      severity: "critical",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/migrate-approved-client-app",
      remediation: "Replace 'Require approved client app' with 'Require application protection policy'. For a transition period use both controls with the OR operator; new policies should use app protection only.",
      fix: (d) => {
        const g = d.grantControls || (d.grantControls = {});
        const b = g.builtInControls || [];
        const ch = [];
        if (!b.includes("compliantApplication")) { b.push("compliantApplication"); ch.push('Added grant control "Require app protection policy"'); }
        if (b.includes("approvedApplication")) {
          g.builtInControls = b.filter((x) => x !== "approvedApplication");
          ch.push('Removed the retired grant control "Require approved client app"');
        } else { g.builtInControls = b; }
        if (g.builtInControls.length > 1 && g.operator !== "OR") { g.operator = "OR"; ch.push("Grant operator set to OR"); }
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !grants(p).includes("approvedApplication")) return null;
        const hasAppProt = grants(p).includes("compliantApplication");
        if (hasAppProt && G(p).operator === "OR") return null; // compliant migration path
        if (hasAppProt) {
          return {
            detail: `Policy "${p.displayName}" combines 'Require approved client app' AND 'Require app protection policy'. After the retirement the approved-client-app control stops being enforced — change the operator to OR so app protection alone satisfies the policy.`,
            impactedResources: ["Mobile users on iOS and Android", "M365 apps on mobile devices"],
          };
        }
        return {
          detail: `Policy "${p.displayName}" relies only on 'Require approved client app', which is retired in early March 2026. After that date the policy no longer enforces any app-level control on mobile devices.`,
          impactedResources: ["Mobile users on iOS and Android", "M365 apps on mobile devices", "Unmanaged BYOD devices"],
        };
      },
    },

    // ── Token protection ──────────────────────────────────────────────
    {
      id: "token-prot-apps",
      title: "Token protection: only supported for specific apps",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Token protection policies must target only Exchange Online, SharePoint Online, Teams Services, Azure Virtual Desktop, Windows 365 and Windows Cloud Login. Targeting All resources or the Office 365 app group causes failures in unsupported clients.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#deployment",
      remediation: "Target only: Office 365 Exchange Online, Office 365 SharePoint Online, Microsoft Teams Services (plus AVD / Windows 365 if deployed). Do not use the Office 365 application group or All resources.",
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        a.includeApplications = TOKEN_PROT_APPS.slice();
        return ["Target resources narrowed to the six token-protection supported apps (Exchange Online, SharePoint Online, Teams Services, AVD, Windows 365, Windows Cloud Login)"];
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const inc = appsInc(p);
        if (inc.includes("All")) {
          return {
            detail: 'Token protection policy targets "All resources" instead of the specific supported applications — unsupported clients (PowerQuery, VS Code extensions, Office perpetual, PowerShell modules) will be blocked.',
            impactedResources: ["PowerShell modules accessing SharePoint", "PowerQuery for Excel", "VS Code extensions", "Office perpetual clients"],
          };
        }
        if (inc.some((a) => String(a).toLowerCase() === "office365")) {
          return {
            detail: "Token protection policy targets the Office 365 application group. Microsoft warns this may cause unintended failures — target Exchange Online, SharePoint Online and Teams Services individually.",
            impactedResources: ["Office 365 application group members"],
          };
        }
        const unsupported = inc.filter((a) => !TOKEN_PROT_APPS.includes(a));
        if (unsupported.length) {
          return {
            detail: `Token protection policy targets ${unsupported.length} application(s) that may not support token protection — only Exchange Online, SharePoint Online, Teams, AVD, Windows 365 and Windows Cloud Login are supported.`,
            impactedResources: unsupported,
          };
        }
        return null;
      },
    },
    {
      id: "token-prot-platform",
      title: "Token protection: Windows + desktop clients only",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Token protection only works on Windows: the policy must target the Windows device platform and only 'Mobile apps and desktop clients' — including Browser blocks MSAL.js apps such as Teams Web.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#deployment",
      remediation: "Set Device platforms → Include → Windows only, and Client apps → Mobile apps and desktop clients only (leave Browser unchecked).",
      fix: (d) => {
        const ch = [];
        const plat = d.conditions.platforms || (d.conditions.platforms = { includePlatforms: [], excludePlatforms: [] });
        if (!(plat.includePlatforms || []).includes("windows")) { plat.includePlatforms = ["windows"]; ch.push("Device platforms set to Windows only"); }
        const cat = d.conditions.clientAppTypes || [];
        if (!cat.length || cat.includes("browser") || cat.includes("all")) {
          d.conditions.clientAppTypes = ["mobileAppsAndDesktopClients"];
          ch.push("Client apps set to mobile apps and desktop clients only (Browser removed)");
        }
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const issues = [];
        const plat = p.conditions?.platforms;
        if (!plat || !(plat.includePlatforms || []).includes("windows"))
          issues.push("The policy does not explicitly target the Windows platform (token protection is Windows-only).");
        const cat = p.conditions?.clientAppTypes || [];
        if (!cat.length || cat.includes("browser") || cat.includes("all"))
          issues.push('The policy includes "Browser" client apps (or has no client apps condition) — MSAL.js-based apps like Teams Web will be blocked.');
        if (!issues.length) return null;
        return {
          detail: issues.join(" "),
          impactedResources: ["macOS / iOS / Android / Linux users", "Teams Web (MSAL.js)", "Browser-based applications"],
        };
      },
    },
    {
      id: "token-prot-devices",
      title: "Token protection: unsupported device types must be excluded",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Unsupported registration types must be excluded via device filters: Surface Hub, Teams Rooms, Entra-joined AVD hosts and Cloud PCs, Autopilot self-deploying, bulk-enrolled devices and Azure VMs.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#known-limitations",
      remediation: 'Add a device filter excluding the unsupported types, e.g. systemLabels -eq "CloudPC", systemLabels -eq "AzureVirtualDesktop", profileType -eq "SecureVM" (each combined with trustType -eq "AzureAD").',
      fix: (d) => {
        const dev = d.conditions.devices || (d.conditions.devices = {});
        dev.deviceFilter = { mode: "exclude", rule: TOKEN_PROT_DEVICE_RULE };
        return ["Device filter set to exclude the unsupported device types (Cloud PC, Azure Virtual Desktop, Autopilot self-deploying, Azure VM / SecureVM)"];
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const filter = p.conditions?.devices?.deviceFilter;
        if (!filter) {
          return {
            detail: "Token protection policy has no device filter excluding unsupported device types — Surface Hub, Teams Rooms, Entra-joined Cloud PCs / AVD hosts, Autopilot self-deploying, bulk-enrolled devices and Azure VMs will be blocked with unclear errors.",
            impactedResources: ["Surface Hub", "Teams Rooms (Windows)", "Cloud PCs (Entra joined)", "AVD session hosts (Entra joined)", "Autopilot self-deploying devices", "Bulk-enrolled Windows devices", "Azure VMs with Entra ID auth"],
          };
        }
        const rule = String(filter.rule || "").toLowerCase();
        const known = [
          { pat: "cloudpc", label: "Cloud PCs" },
          { pat: "azurevirtualdesktop", label: "Azure Virtual Desktop" },
          { pat: "autopilot", label: "Autopilot self-deploying" },
          { pat: "securevm", label: "Azure VMs" },
        ];
        const missing = known.filter((k) => !rule.includes(k.pat));
        if (missing.length && filter.mode === "exclude") {
          return {
            detail: `The device filter may not cover every unsupported device type — potentially missing exclusions for: ${missing.map((m) => m.label).join(", ")}.`,
            impactedResources: missing.map((m) => m.label),
          };
        }
        return null;
      },
    },

    // ── Continuous access evaluation / resilience ─────────────────────
    {
      id: "cae-disabled",
      title: "Continuous access evaluation disabled",
      appliesWhen: "Policy explicitly disables continuous access evaluation (CAE)",
      requirement: "CAE enables near-real-time token revocation. With CAE disabled, revocation falls back to token expiry (up to 1 hour) — a vulnerability window after security events such as account disablement or password change.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-continuous-access-evaluation",
      remediation: "Remove the CAE-disable setting unless strict evaluation demonstrably breaks a workload; CAE is on by default and should stay active.",
      fix: (d) => {
        if (d.sessionControls) delete d.sessionControls.continuousAccessEvaluation;
        return ["Removed the CAE-disable session control — continuous access evaluation returns to its default (on)"];
      },
      detect: (p) => {
        if (!isActive(p)) return null;
        if (S(p).continuousAccessEvaluation?.mode !== "disabled") return null;
        return {
          detail: "Policy explicitly disables continuous access evaluation — access tokens stay valid up to 1 hour after a security event (user disabled, password change, location change).",
          impactedResources: ["Real-time session revocation", "Location-based enforcement", "Risk-based session termination"],
        };
      },
    },
    {
      id: "resilience-disabled-impact",
      title: "Resilience defaults disabled: users blocked during outages",
      appliesWhen: "Policy disables resilience defaults",
      requirement: "With resilience defaults disabled, users whose sessions expire during an Entra ID outage are denied access until the service recovers. Only intended for high-security scenarios.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/resilience-defaults",
      remediation: "Keep resilience defaults enabled unless your organization requires strict real-time policy evaluation (e.g. regulated industries).",
      fix: (d) => {
        if (d.sessionControls) d.sessionControls.disableResilienceDefaults = false;
        return ["Resilience defaults re-enabled (disableResilienceDefaults: false)"];
      },
      detect: (p) => {
        if (!isActive(p) || !S(p).disableResilienceDefaults) return null;
        return {
          detail: `Policy disables resilience defaults for ${allUsers(p) ? "ALL users" : "the targeted users"} — during an Entra ID outage, expiring sessions are denied access until the service recovers.`,
          impactedResources: ["Covered users during Entra ID outages", "Business continuity"],
        };
      },
    },

    // ── Shared devices: Surface Hub / Teams Rooms ─────────────────────
    {
      id: "surface-hub-mfa",
      title: "Surface Hub: cannot satisfy MFA or compliance requirements",
      appliesWhen: "Broad policy requires MFA, compliance, hybrid join, approved app or app protection",
      requirement: "Surface Hub device accounts are incompatible with MFA, authentication strength, device compliance, hybrid join, approved client app, app protection and password change controls — they must be excluded from such policies.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/surface-hub/conditional-access-for-surface-hub",
      remediation: "Exclude Surface Hub device accounts (or a group containing them) from this policy — select the user object, not the device object.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        const bad = grants(p).filter((c) => ["mfa", "compliantDevice", "domainJoinedDevice", "approvedApplication", "compliantApplication", "passwordChange"].includes(c));
        const strength = G(p).authenticationStrength != null;
        if (!bad.length && !strength) return null;
        return {
          detail: `Policy requires ${[...bad, ...(strength ? ["authentication strength"] : [])].join(", ")} for all users — Surface Hub device accounts cannot satisfy these controls and will fail to sign in. Verify they are excluded (this check cannot see which excluded accounts are Surface Hubs).`,
          impactedResources: ["Surface Hub calendar sync", "Surface Hub Teams meetings", "Surface Hub whiteboard"],
        };
      },
    },
    {
      id: "teams-rooms-mfa",
      title: "Teams Rooms: MFA / authentication strength not supported",
      appliesWhen: "Policy requires MFA or authentication strength for all users",
      requirement: "Teams Rooms on Windows supports neither MFA nor authentication strength; Teams Rooms on Android supports MFA but not authentication strength. Room resource accounts must be excluded from MFA-enforcing policies.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams Rooms resource accounts (or a shared-device group) from MFA-enforcing policies; use device compliance as the control for these devices instead.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        if (!hasMfa(p)) return null;
        return {
          detail: "Policy requires MFA / authentication strength for all users and all resources. Teams Rooms on Windows supports neither; Teams Rooms on Android supports MFA but no authentication strength — room resource accounts will be blocked from signing in unless excluded.",
          impactedResources: ["Teams Rooms on Windows", "Teams Rooms on Android (auth strength)", "Teams Panels"],
        };
      },
    },
    {
      id: "device-code-teams-android",
      title: "Device code block: breaks Teams Android remote sign-in",
      appliesWhen: "Policy blocks the device code authentication flow",
      requirement: "Blocking device code flow prevents remote sign-in via microsoft.com/devicelogin, which Teams Android devices (phones, panels, rooms) rely on for setup. Their resource accounts need an exclusion or an alternative sign-in method.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams device resource accounts from the device-code-flow block policy, or add a device filter excluding Teams Android devices.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !hasBlock(p)) return null;
        const tm = p.conditions?.authenticationFlows?.transferMethods;
        if (!tm || tm === "none" || !String(tm).includes("deviceCodeFlow")) return null;
        return {
          detail: "Policy blocks the device code authentication flow — remote sign-in (microsoft.com/devicelogin) for Teams Android devices, Teams phones and Teams panels stops working; these devices use device code flow for initial setup.",
          impactedResources: ["Teams Rooms on Android", "Teams phones", "Teams panels", "Remote device sign-in"],
        };
      },
    },
    {
      id: "signin-freq-teams-rooms",
      title: "Sign-in frequency: causes Teams Rooms periodic sign-out",
      appliesWhen: "Policy enforces sign-in frequency for all users and all resources",
      requirement: "Teams Rooms, phones and panels do not support the sign-in frequency session control — it makes them periodically sign out, disrupting meetings and room availability.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams Rooms / shared-device resource accounts from sign-in frequency policies, or scope the frequency requirement to admin roles instead of all users.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        const sif = S(p).signInFrequency;
        if (!sif?.isEnabled) return null;
        const val = sif.frequencyInterval === "everyTime" ? "every time" : `${sif.value} ${sif.type}`;
        return {
          detail: `Policy enforces sign-in frequency (${val}) for all users — Teams Rooms, Teams phones and Teams panels do not support this and will periodically sign out, disrupting scheduled meetings.`,
          impactedResources: ["Teams Rooms on Windows", "Teams Rooms on Android", "Teams phones", "Teams panels"],
        };
      },
    },
    {
      id: "signin-freq-individual-services",
      title: "Sign-in frequency on individual M365 services breaks Teams",
      appliesWhen: "Sign-in frequency targets specific M365 services instead of all resources",
      requirement: "Applying sign-in frequency to individual Microsoft 365 services (Exchange, SharePoint, Teams) can interrupt or stop the Teams device sign-in flow and is not supported.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Target all resources (or Microsoft Admin Portals) with the sign-in frequency policy instead of individual M365 services.",
      detect: (p) => {
        if (!isActive(p)) return null;
        if (!S(p).signInFrequency?.isEnabled) return null;
        const inc = appsInc(p);
        if (inc.includes("All")) return null;
        if (!inc.some((a) => [EXCHANGE_ONLINE, SHAREPOINT_ONLINE, TEAMS_SERVICE].includes(a))) return null;
        return {
          detail: "Sign-in frequency is configured on individual Microsoft 365 services rather than all resources — Microsoft documents that this can interrupt or stop the Teams (device) sign-in flow.",
          impactedResources: ["Teams sign-in flow", "Teams Rooms devices", "Teams desktop/mobile clients"],
        };
      },
    },

    // ── App exclusions required by other Microsoft services ──────────
    {
      id: "defender-mobile-exclusion",
      title: "Defender mobile apps must be excluded from restrictive policies",
      appliesWhen: "Broad block policy targets all users and all resources",
      requirement: "The Microsoft Defender mobile app must run continuously in the background to report device posture. Restrictive CA policies that do not exclude the Defender apps can stop that reporting, making devices appear non-compliant (a compliance loop).",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/defender-endpoint/mobile-resources-defender-endpoint#microsoft-defender-mobile-app-exclusion-from-conditional-access-ca-policies",
      remediation: `Exclude MicrosoftDefenderATP XPlat (${DEFENDER_ATP_XPLAT}) and Microsoft Defender for Mobile TVM (${DEFENDER_TVM}) from this policy — create their service principals first if they do not exist.`,
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        const exc = a.excludeApplications || (a.excludeApplications = []);
        const ch = [];
        for (const [id, label] of [[DEFENDER_ATP_XPLAT, "MicrosoftDefenderATP XPlat"], [DEFENDER_TVM, "Defender for Mobile TVM"]]) {
          if (!exc.some((x) => String(x).toLowerCase() === id)) { exc.push(id); ch.push(`Excluded ${label} (${id})`); }
        }
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p) || !hasBlock(p)) return null;
        const exc = appsExcLower(p);
        if (exc.includes(DEFENDER_ATP_XPLAT) && exc.includes(DEFENDER_TVM)) return null;
        return {
          detail: "Restrictive block policy targets all resources without excluding the Microsoft Defender for Endpoint mobile apps — Defender can be prevented from reporting device posture, so devices appear non-compliant because Defender cannot reach its backend.",
          impactedResources: [`MicrosoftDefenderATP XPlat (${DEFENDER_ATP_XPLAT})`, `Defender for Mobile TVM (${DEFENDER_TVM})`, "Mobile device compliance reporting"],
        };
      },
    },
    {
      id: "azure-vm-signin-mfa",
      title: "Azure VM sign-in: MFA over RDP needs special client support",
      appliesWhen: "Policy requires MFA or device compliance for all users and all resources",
      requirement: `The Microsoft Azure Windows Virtual Machine Sign-In app (${WINDOWS_CLOUD_LOGIN}) requires the RDP client to supply the MFA claim; without Windows Hello for Business or FIDO2 that is impossible, and Windows Server RDP clients cannot satisfy device compliance at all. Microsoft recommends excluding the app when WHfB is not deployed.`,
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/devices/howto-vm-sign-in-azure-ad-windows#mfa-sign-in-method-required",
      remediation: `If Windows Hello for Business is not deployed, exclude the Azure Windows VM Sign-In app (${WINDOWS_CLOUD_LOGIN}) from MFA / compliance policies — or ensure all RDP clients support WHfB or FIDO2.`,
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        const exc = a.excludeApplications || (a.excludeApplications = []);
        if (exc.some((x) => String(x).toLowerCase() === WINDOWS_CLOUD_LOGIN)) return [];
        exc.push(WINDOWS_CLOUD_LOGIN);
        return [`Excluded Azure Windows VM Sign-In (${WINDOWS_CLOUD_LOGIN})`];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        if (!hasMfa(p) && !hasCompliance(p)) return null;
        if (appsExcLower(p).includes(WINDOWS_CLOUD_LOGIN)) return null;
        return {
          detail: "Policy requires MFA or device compliance for all users and all resources without excluding the Azure Windows VM Sign-In app — RDP connections to Azure VMs / Arc-enabled servers must supply the MFA claim from the connecting device, which fails without Windows Hello for Business or FIDO2; Windows Server RDP clients cannot satisfy device compliance.",
          impactedResources: [`Azure Windows VM Sign-In (${WINDOWS_CLOUD_LOGIN})`, "RDP to Azure VMs", "RDP to Arc-enabled Windows Servers", "Windows Server RDP client devices"],
        };
      },
    },

    // ── Behavior changes & hybrid identity ────────────────────────────
    {
      id: "all-resources-exclusion-change",
      title: "All resources: low-privilege scope exemption ending March 2026",
      appliesWhen: 'Policy targets "All resources" and has app exclusions',
      requirement: "Microsoft is removing the legacy behavior where low-privilege scopes (User.Read, openid, profile, email, offline_access) were auto-exempted from All-resources policies that carry app exclusions. From March 2026 these scopes are enforced.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-conditional-access-cloud-apps#conditional-access-for-all-resources",
      remediation: "Review every All-resources policy with app exclusions in report-only mode; consider removing the app exclusions and creating separate targeted policies instead.",
      detect: (p) => {
        if (!isActive(p) || !allApps(p)) return null;
        if (!(A(p).excludeApplications || []).length) return null;
        return {
          detail: 'Policy targets "All resources" with app exclusions. From March 2026 the previously auto-exempted low-privilege scopes (User.Read, openid, profile, email, offline_access) are enforced — users who accessed excluded-app scenarios without CA challenges may start being prompted or blocked. Review sign-in logs for impact.',
          impactedResources: ["Apps using User.Read", "Apps using openid/profile scopes", "Native clients and SPAs with basic Graph access"],
        };
      },
    },
    {
      id: "dirsync-account-mfa",
      title: "Directory sync exclusion: Entra Connect v2.5.76.0+ removes the need",
      appliesWhen: "MFA policy for All users excludes the Directory Synchronization Accounts role",
      requirement: "The Directory Synchronization Accounts exclusion existed because the sync engine's service account could not perform MFA. Entra Connect v2.5.76.0+ supports application-based authentication, removing the need for this MFA gap.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/hybrid/connect/reference-connect-version-history",
      remediation: "Check your Entra Connect version; if v2.5.76.0 or later, migrate the sync engine to application-based authentication and remove the Directory Synchronization Accounts exclusion from MFA policies.",
      fix: (d) => {
        const u = d.conditions.users || (d.conditions.users = {});
        u.excludeRoles = (u.excludeRoles || []).filter((r) => r !== DIRSYNC_ROLE);
        return ["Removed the Directory Synchronization Accounts role exclusion — only apply this after confirming Entra Connect is v2.5.76.0 or later with application-based authentication"];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !hasMfa(p)) return null;
        if (!(U(p).excludeRoles || []).includes(DIRSYNC_ROLE)) return null;
        return {
          detail: "This MFA policy excludes the Directory Synchronization Accounts role. If the tenant runs Entra Connect v2.5.76.0 or later, application-based authentication makes this exclusion unnecessary — review the Entra Connect version and close the MFA gap.",
          impactedResources: ["Directory Synchronization Accounts role", "Entra Connect sync service account", "Hybrid identity sync pipeline"],
        };
      },
    },

    // ── External authentication methods (third-party MFA) ─────────────
    {
      id: "eam-external-user-impact",
      title: "External authentication method (EAM) may block guests and vendors",
      appliesWhen: "Broad MFA policy requires a third-party MFA provider (custom controls or an authentication strength with EAM combinations)",
      requirement: "Guests, B2B collaborators and external service providers are not enrolled in your third-party MFA provider (Duo, RSA, …) and cannot satisfy an EAM requirement — a policy demanding it for All users effectively blocks external access.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/authentication/how-to-authentication-external-method-manage",
      remediation: "Exclude guest/external user types and give them a separate policy with Entra ID native MFA; or use an authentication strength that accepts both the EAM and native MFA methods; or scope the EAM requirement to a group of enrolled internal users.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        if (!allUsers(p) && !hasAdminRoles(p)) return null;
        const customFactors = (G(p).customAuthenticationFactors || []).length > 0;
        let eamStrength = false, strengthName = "", eamCombos = [];
        const ref = G(p).authenticationStrength;
        if (ref?.id && ctx?.strengths) {
          const asp = ctx.strengths.get(ref.id);
          if (asp) {
            eamCombos = (asp.allowedCombinations || []).filter((c) => String(c).toLowerCase().includes("externalauthenticationmethod"));
            if (eamCombos.length) { eamStrength = true; strengthName = asp.displayName || ref.displayName || "Unknown"; }
          }
        }
        if (!customFactors && !eamStrength) return null;
        const excludesGuests = p.conditions?.users?.excludeGuestsOrExternalUsers != null;
        const src = eamStrength
          ? `an authentication strength ("${strengthName}") containing external authentication method combinations`
          : "custom authentication factors (legacy custom controls)";
        return {
          detail: excludesGuests
            ? `Policy requires ${src}. Guests appear to be excluded, but verify ALL external identities are covered — B2B direct connect, service provider and cross-tenant sync accounts may still be impacted.`
            : `Policy requires ${src} for a broad scope without excluding guests or external users — external identities cannot enroll in your third-party MFA provider and will be blocked.`,
          impactedResources: [
            "B2B guest users", "External service providers / vendors", "Cross-tenant collaboration partners", "MSP accounts",
            ...(eamStrength ? [`Auth strength "${strengthName}": ${eamCombos.length} EAM combination(s)`] : []),
          ],
        };
      },
    },
  ];

  // ---- run every check against every policy ----
  // rawPolicies: raw Graph policy objects; strengths: Map<id, authStrengthPolicy>
  // opts.includeDisabled: also evaluate policies in the Off (disabled) state.
  function run(rawPolicies, strengths, opts = {}) {
    INCLUDE_DISABLED = !!opts.includeDisabled;
    const findings = [];
    const ctx = { strengths: strengths || new Map() };
    for (const p of rawPolicies) {
      for (const chk of CHECKS) {
        let res = null;
        try { res = chk.detect(p, ctx); } catch (e) { console.warn(`MS Learn check ${chk.id} failed on ${p.displayName}:`, e); }
        if (res) findings.push({ check: chk, result: res, policyId: p.id, policyName: p.displayName || "(unnamed policy)", policyState: p.state });
      }
    }
    return findings;
  }

  // group findings per check so one issue hitting many policies is one card
  function group(findings) {
    const map = new Map();
    for (const f of findings) {
      if (!map.has(f.check.id)) map.set(f.check.id, { check: f.check, policies: [] });
      map.get(f.check.id).policies.push({ id: f.policyId, name: f.policyName, state: f.policyState, result: f.result });
    }
    const order = { critical: 0, high: 1, medium: 2, info: 3 };
    return [...map.values()].sort((a, b) => order[a.check.severity] - order[b.check.severity] || b.policies.length - a.policies.length);
  }

  const SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", info: "Info" };
  const sevBadge = (s) => `<span class="sev ${s}">${SEV_LABEL[s] || s}</span>`;

  // ---- rendering ----
  function renderSummary(groups, checksTotal, includeDisabled) {
    const nPol = groups.reduce((s, g) => s + g.policies.length, 0);
    const bySev = (s) => groups.filter((g) => g.check.severity === s).length;
    const chips = ["critical", "high", "medium", "info"].filter((s) => bySev(s))
      .map((s) => `<span class="sev ${s}">${bySev(s)} ${SEV_LABEL[s]}</span>`).join(" ");
    const scope = includeDisabled ? "enabled, report-only and Off (disabled)" : "enabled and report-only";
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <h3>📘 MS Learn: documented exclusion checks</h3>
        <p style="margin-bottom:0">Your policies, checked against exclusions, limitations and upcoming behavior changes documented on learn.microsoft.com —
        missing break-glass exclusions, token protection limits, Teams Rooms / Surface Hub impact, required app exclusions and control retirements.
        ${checksTotal} checks ran against your ${scope} policies.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${groups.length}<span class="mini" style="font-weight:400"> finding${groups.length === 1 ? "" : "s"}</span></div>
        <div class="mini">across ${nPol} ${nPol === 1 ? "policy match" : "policy matches"}</div>
        <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${chips}</div>
      </div>
    </div>`;
  }

  function renderEmpty() {
    return `<div class="list-card" style="padding:40px;text-align:center">
      <div style="font-size:34px;margin-bottom:10px">✅</div>
      <h3 style="margin-bottom:6px">No impact issues found</h3>
      <p class="mini" style="max-width:420px;margin:0 auto">All enabled and report-only policies pass the documented Microsoft Learn exclusion checks — no missing exclusions or flagged misconfigurations.</p>
    </div>`;
  }

  function renderGroups(groups, filter, expanded) {
    const shown = filter === "all" ? groups : groups.filter((g) => g.check.severity === filter);
    if (!shown.length) return `<p class="mini" style="padding:20px">No findings match the current filter.</p>`;
    return shown.map((g) => {
      const c = g.check, open = expanded.has(c.id);
      const n = g.policies.length;
      const uniform = new Set(g.policies.map((p) => p.result.detail)).size === 1;
      const resources = [...new Set(g.policies.flatMap((p) => p.result.impactedResources || []))];
      return `<div class="list-card ml-card">
        <button class="ml-head ${open ? "open" : ""}" data-mltoggle="${esc(c.id)}">
          <span class="caret">▶</span>
          ${sevBadge(c.severity)}
          <span class="ml-title">${esc(c.title)}</span>
          <span class="mini">${n === 1 ? esc(g.policies[0].name) : `${n} policies affected`}</span>
        </button>
        ${open ? `<div class="ml-detail">
          ${uniform ? `<h5>Assessment</h5><p>${esc(g.policies[0].result.detail)}</p>` : ""}
          <h5>🛡 Affected ${n === 1 ? "policy" : `policies (${n})`}</h5>
          <ul class="plist2 ml-pols">${g.policies.map((p) => `<li><span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>${p.state === "enabledForReportingButNotEnforced" ? ' <span class="state report">Report-only</span>' : ""}${!uniform ? `<div class="mini" style="margin-top:3px">${esc(p.result.detail)}</div>` : ""}</li>`).join("")}</ul>
          ${resources.length ? `<h5 class="ml-red">Impacted resources</h5><ul class="ml-res">${resources.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
          <h5 class="ml-blue">MS Learn requirement</h5><p>${esc(c.requirement)}</p>
          <h5 class="ml-green">Remediation</h5><p>${esc(c.remediation)}</p>
          ${typeof c.fix === "function" ? `<p style="margin-top:10px"><button class="btn lemon" data-mlfix="${esc(c.id)}">🧰 Fix — build the adjusted policy</button>
            <span class="mini" style="margin-left:8px">creates a new policy (version bumped, state Off) to download — your tenant is not changed</span></p>` : ""}
          <a class="ml-doc" href="${esc(c.docUrl)}" target="_blank" rel="noopener noreferrer">↗ View the Microsoft Learn documentation</a>
        </div>` : ""}
      </div>`;
    }).join("");
  }


  // ======================================================================
  // Suggested fixes — build a NEW policy from an affected one with the
  // documented adjustment applied. Nothing is written to the tenant: the
  // result is a downloadable Graph JSON body, always with state "disabled"
  // and the version in the name bumped, so it can be reviewed, imported
  // and switched on deliberately.
  // ======================================================================

  // Bump the trailing version in a policy name: v1.0 -> v1.0.1, v1.0.1 -> v1.0.2.
  // A name without a version gets one, so the fix never overwrites the original.
  function bumpVersion(name) {
    const m = /^(.*?)(v\s?)(\d+(?:\.\d+)*)(\s*)$/i.exec(String(name || "").trim());
    if (!m) return `${String(name || "policy").trim()}-v1.1`;
    const parts = m[3].split(".").map(Number);
    if (parts.length < 3) parts.push(0);
    parts[parts.length - 1] += 1;
    return `${m[1]}${m[2]}${parts.join(".")}`;
  }

  // Fields Graph rejects (or that must not travel) on a create.
  const STRIP = ["id", "createdDateTime", "modifiedDateTime", "templateId", "deletedDateTime", "partialEnablementStrategy"];

  function draftFrom(raw) {
    const d = JSON.parse(JSON.stringify(raw));
    STRIP.forEach((k) => delete d[k]);
    d.conditions = d.conditions || {};
    return d;
  }

  // findings: the flat list from run(); raws: the raw policies keyed by id.
  // ctx may carry { breakGlass: {id, type, name} } for the break-glass fix.
  function buildFixes(findings, raws, ctx = {}) {
    const byPolicy = new Map();   // policyId -> { raw, draft, changes[], checks[] }
    const rawById = new Map(raws.map((p) => [p.id, p]));
    const skipped = [];

    for (const f of findings) {
      if (typeof f.check.fix !== "function") continue;
      const raw = rawById.get(f.policyId);
      if (!raw) continue;
      let entry = byPolicy.get(f.policyId);
      if (!entry) {
        entry = { policyId: f.policyId, originalName: raw.displayName || "(unnamed policy)", originalState: raw.state, draft: draftFrom(raw), changes: [], checks: [] };
        byPolicy.set(f.policyId, entry);
      }
      let ch = null;
      try { ch = f.check.fix(entry.draft, ctx); } catch (e) { console.warn(`MS Learn fix ${f.check.id} failed:`, e); }
      if (ch === null) {
        skipped.push({ policyName: entry.originalName, check: f.check, needs: f.check.needsGroup || null });
        continue;
      }
      if (!ch.length) continue;               // already satisfied by an earlier fix
      entry.changes.push(...ch);
      entry.checks.push(f.check);
    }

    const fixes = [];
    for (const e of byPolicy.values()) {
      if (!e.changes.length) continue;
      e.draft.displayName = bumpVersion(e.originalName);
      e.draft.state = "disabled";             // never auto-enable a generated policy
      e.newName = e.draft.displayName;
      e.json = JSON.stringify(e.draft, null, 2);
      fixes.push(e);
    }
    fixes.sort((a, b) => a.newName.localeCompare(b.newName));
    return { fixes, skipped };
  }

  function renderFixes(res) {
    if (!res.fixes.length) {
      return `<div class="list-card" style="padding:40px;text-align:center">
        <div style="font-size:34px;margin-bottom:10px">🧰</div>
        <h3 style="margin-bottom:6px">No automatic fixes available</h3>
        <p class="mini" style="max-width:460px;margin:0 auto">None of the current findings can be turned into a policy change mechanically —
        they need a decision (which app to target, which accounts to exclude) rather than an edit. Follow the remediation text on each finding instead.</p>
      </div>`;
    }
    const cards = res.fixes.map((f, i) => `<div class="list-card fx-card">
      <div class="fx-head">
        <div>
          <div class="fx-new">${esc(f.newName)}</div>
          <div class="mini">from <span class="pol-link" data-polid="${esc(f.policyId)}">${esc(f.originalName)}</span> · created as <b>Off</b></div>
        </div>
        <div class="spacer"></div>
        <button class="btn" data-fxjson="${i}">⤓ Download JSON</button>
      </div>
      <div class="fx-body">
        <h5 class="ml-green">Applied adjustments (${f.changes.length})</h5>
        <ul class="ml-res">${f.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        <h5 class="ml-blue">Based on</h5>
        <ul class="plist2">${f.checks.map((c) => `<li>${esc(c.title)} <a class="ml-doc" href="${esc(c.docUrl)}" target="_blank" rel="noopener noreferrer">↗ MS Learn</a></li>`).join("")}</ul>
      </div>
    </div>`).join("");
    const note = res.skipped.length
      ? (() => {
        const needs = [...new Set(res.skipped.map((x) => x.needs).filter(Boolean))];
        const titles = [...new Set(res.skipped.map((x) => x.check.title))].join("; ");
        const create = needs.map((k) => `<button class="btn" data-mkgroup="${esc(k)}">➕ Create ${esc(CONVENTION[k][0])} <span class="tag block">writes</span></button>`).join(" ");
        return `<div class="list-card fx-card"><div class="fx-body">
          <h5 class="ml-blue">${res.skipped.length} finding${res.skipped.length === 1 ? "" : "s"} need a group that does not exist yet</h5>
          <p class="mini">${esc(titles)}</p>
          ${needs.map((k) => `<p class="mini" style="margin-top:8px">These fixes exclude <b>${esc(CONVENTION[k][0])}</b> — ${esc(GROUP_PURPOSE[k] || "")}. The tenant has no group by that name (or an accepted alias: ${esc(CONVENTION[k].slice(1).join(", ") || "none")}), so the exclusion cannot be guessed.</p>`).join("")}
          ${create ? `<p style="margin-top:10px">${create} <span class="mini">creates an empty role-assignable security group, then re-runs the fixes — add the resource accounts to it yourself</span></p>` : ""}
        </div></div>`;
      })()
      : "";
    return `<p class="mini" style="margin:0 0 12px">${res.fixes.length} new polic${res.fixes.length === 1 ? "y" : "ies"} prepared from ${res.fixes.length === 1 ? "1 affected policy" : `${res.fixes.length} affected policies`}.
      Nothing is written to your tenant — download the JSON, review it, then bring it in through the Import tool.</p>${cards}${note}`;
  }

  return { run, group, renderSummary, renderGroups, renderEmpty, buildFixes, renderFixes, bumpVersion, CONVENTION, GROUP_PURPOSE, checksCount: CHECKS.length };
})();
