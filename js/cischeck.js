// ======================================================================
// CIS Benchmark alignment — evaluates the tenant's Conditional Access
// policies against the automated recommendations of section 5.2.2 of the
// CIS Microsoft 365 Foundations Benchmark v7.0.0 (content: cisdata.js).
//
// Each control is expressed as the machine criteria from the benchmark's
// "audit using the Microsoft Graph API" procedure. A control PASSES when
// at least one enabled policy meets every criterion; a policy that meets
// every criterion but runs in report-only yields REPORT-ONLY; otherwise
// the control FAILS and the nearest-miss policies are shown with exactly
// which criteria they miss — that is the remediation map.
//
// The benchmark also asks per control that exclusions are documented and
// reviewed annually — that part is inherently manual and is carried as a
// standing note, not a per-control verdict.
// ======================================================================
const CisCheck = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ─── policy helpers ───────────────────────────────────────────────
  const U = (p) => p.conditions?.users || {};
  const A = (p) => p.conditions?.applications || {};
  const G = (p) => p.grantControls || {};
  const S = (p) => p.sessionControls || {};
  const grants = (p) => G(p).builtInControls || [];
  const strengthId = (p) => G(p).authenticationStrength?.id || null;
  const isEnabled = (p) => p.state === "enabled";
  const isRO = (p) => p.state === "enabledForReportingButNotEnforced";
  const allUsers = (p) => (U(p).includeUsers || []).includes("All");
  const anyUsers = (p) => (U(p).includeUsers || []).length || (U(p).includeGroups || []).length || (U(p).includeRoles || []).length;
  const allApps = (p) => (A(p).includeApplications || []).includes("All");
  const noAppExcl = (p) => !(A(p).excludeApplications || []).length;
  const mfaOrStrength = (p) => grants(p).includes("mfa") || !!strengthId(p);
  const isBlock = (p) => grants(p).includes("block");
  const sif = (p) => S(p).signInFrequency || {};
  const sifEvery = (p) => sif(p).isEnabled && sif(p).frequencyInterval === "everyTime";
  const sifHoursMax = (p, h) => { // everyTime or timeBased ≤ h hours
    const s = sif(p); if (!s.isEnabled) return false;
    if (s.frequencyInterval === "everyTime") return true;
    if (s.frequencyInterval !== "timeBased") return false;
    const v = Number(s.value);
    return s.type === "hours" ? v <= h : s.type === "days" ? v * 24 <= h : false;
  };
  const hasRisk = (p) => ((p.conditions?.signInRiskLevels) || []).length > 0 || ((p.conditions?.userRiskLevels) || []).length > 0;
  const flows = (p) => p.conditions?.authenticationFlows?.transferMethods || "";
  const clientTypes = (p) => p.conditions?.clientAppTypes || [];

  // Admin-role coverage against the benchmark's 15-role minimum set.
  const ADMIN = CIS_BENCHMARK.adminRoles;
  const adminMissing = (p) => Object.keys(ADMIN).filter((id) => !((U(p).includeRoles || []).some((r) => String(r).toLowerCase() === id.toLowerCase())));
  const adminRolesOk = (p) => adminMissing(p).length === 0;
  // The benchmark's Graph audit reads includeRoles — but ENCA's deployment
  // model (and many real baselines) scopes administrator policies through an
  // admin persona GROUP instead. A group-scoped policy protects the admins
  // just as well provided the group actually holds them, so it is accepted as
  // satisfying the admin-scope criterion, and the control carries a note
  // (see ADMIN_CONTROLS below) because an auditor following the letter of the
  // procedure will ask. Recognised by an Admins/E-Admins token in the policy
  // name plus a group in the include ("NonAdmins" does not match).
  const ADMIN_NAME = /(^|[^a-z])(e-)?admins?([^a-z]|$)/i;
  const adminGroupScoped = (p) => (U(p).includeGroups || []).length > 0 && ADMIN_NAME.test(p.displayName || "");
  const adminScopeOk = (p) => adminRolesOk(p) || adminGroupScoped(p);
  const adminScopeLabel = (p) => {
    if (adminScopeOk(p)) return null;
    const miss = adminMissing(p);
    if ((U(p).includeRoles || []).length) {
      const have = 15 - miss.length;
      return `covers ${have}/15 benchmark admin roles — missing ${miss.slice(0, 4).map((id) => ADMIN[id]).join(", ")}${miss.length > 4 ? ` +${miss.length - 4} more` : ""}`;
    }
    return "no admin directory roles included and no admin persona group recognised in the include";
  };
  // Controls whose scope is the administrator set — a pass through a persona
  // group gets an explanatory note.
  const ADMIN_CONTROLS = new Set(["5.2.2.1", "5.2.2.4", "5.2.2.5"]);
  const ADMIN_GROUP_NOTE = "Admin scope satisfied by an admin persona group rather than directory roles. The benchmark's Graph audit reads includeRoles — document the group as the tenant's administrator scope and verify every admin-role holder is actually a member (Compare users / Group Analyzer can check this).";

  // Pilot deployment groups: in the ENCA deployment model a policy rolls out
  // to a CAD-… deployment group first and is switched to All users when the
  // pilot completes. A policy whose entire user include is CAD- groups is
  // therefore accepted as satisfying "users: All" — with a note, because the
  // benchmark's Graph audit reads includeUsers = All. Needs the group display
  // names (ctx.groupNames, resolved by the app before the run).
  const PILOT_RE = /^CAD-/i;
  const groupName = (ctx, id) => (ctx.groupNames || {})[id] || null;
  const pilotScoped = (p, ctx) => {
    const gs = U(p).includeGroups || [];
    return gs.length > 0 && gs.every((id) => PILOT_RE.test(groupName(ctx, id) || ""));
  };
  const allUsersOk = (p, ctx) => allUsers(p) || pilotScoped(p, ctx);
  const usersWhy = (p, ctx) => {
    const gs = U(p).includeGroups || [];
    if (gs.length) {
      const names = gs.map((id) => groupName(ctx, id) || id).slice(0, 3);
      return `include is group ${names.join(", ")}${gs.length > 3 ? ` +${gs.length - 3} more` : ""} — not All users and not (only) CAD- pilot deployment groups`;
    }
    const iu = U(p).includeUsers || [];
    return iu.length ? `includeUsers is ${iu.slice(0, 3).join(", ")}` : "no users included";
  };
  const PILOT_NOTE = "User scope satisfied by a CAD- pilot deployment group, treated as All users per the ENCA deployment model. The benchmark's Graph audit reads includeUsers = All — switch the policy to All users when the pilot completes, or document the pilot scope for the auditor.";

  // Phishing-resistant strength: allowed combinations restricted to the three
  // phishing-resistant methods. Resolved via the tenant's strength policies
  // when available; the built-in "Phishing-resistant MFA" GUID is accepted
  // directly (…-000000000004 — its combinations are fixed by Microsoft).
  const PR_BUILTIN = "00000000-0000-0000-0000-000000000004";
  const PR_COMBOS = new Set(["windowshelloforbusiness", "fido2", "x509certificatemultifactor"]);
  const prStrength = (p, ctx) => {
    const id = strengthId(p); if (!id) return false;
    if (id.toLowerCase() === PR_BUILTIN) return true;
    const st = ctx.strengths?.get?.(id);
    if (!st) return false;
    const combos = (st.allowedCombinations || []).map((c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, ""));
    return combos.length > 0 && combos.every((c) => PR_COMBOS.has(c));
  };

  // Location trust, resolved against the named locations in ctx. A GUID the
  // directory no longer has counts as untrusted (and GapCheck flags it as a
  // dangling reference separately). Country locations cannot be trusted.
  const locById = (ctx, id) => (ctx.namedLocations || []).find((l) => String(l.id).toLowerCase() === String(id).toLowerCase());
  const isTrustedLoc = (ctx, id) => { const l = locById(ctx, id); return !!(l && l.isTrusted === true); };

  const APPS = CIS_BENCHMARK.apps;
  const appsInclude = (p, ids) => { const inc = (A(p).includeApplications || []).map((a) => String(a).toLowerCase()); return inc.includes("all") || ids.every((id) => inc.includes(id.toLowerCase())); };

  // ─── controls: candidate filter + criteria ────────────────────────
  // cand(p): the benchmark's own "filter to policies where …" step — which
  // policies count as an attempt at this control (used for near-miss display).
  // crit: [label, fn(p, ctx)] — every one must hold for a policy to satisfy
  // the control. State is checked separately (enabled vs report-only).
  const CONTROL_LOGIC = {
    "5.2.2.1": {
      cand: (p) => ((U(p).includeRoles || []).length > 0 || adminGroupScoped(p)) && mfaOrStrength(p),
      crit: [
        ["admin scope: the 15 benchmark admin roles (includeRoles) or an admin persona group", (p) => adminScopeOk(p), (p) => adminScopeLabel(p)],
        ["resources: All", allApps],
        ["grant: mfa or authentication strength", mfaOrStrength],
      ],
    },
    "5.2.2.2": {
      cand: (p) => allUsers(p) && mfaOrStrength(p),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["grant: mfa or authentication strength", mfaOrStrength],
      ],
    },
    "5.2.2.3": {
      cand: (p) => clientTypes(p).includes("exchangeActiveSync") || clientTypes(p).includes("other"),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["client app types include exchangeActiveSync", (p) => clientTypes(p).includes("exchangeActiveSync")],
        ["client app types include other", (p) => clientTypes(p).includes("other")],
        ["grant: block", isBlock],
      ],
    },
    "5.2.2.4": {
      cand: (p) => S(p).persistentBrowser?.isEnabled || (((U(p).includeRoles || []).length > 0 || adminGroupScoped(p)) && sif(p).isEnabled),
      crit: [
        ["admin scope: the 15 benchmark admin roles (includeRoles) or an admin persona group", (p) => adminScopeOk(p), (p) => adminScopeLabel(p)],
        ["resources: All", allApps],
        ["sign-in frequency everyTime or ≤ 4 hours", (p) => sifHoursMax(p, 4),
          (p) => { const s = sif(p); return s.isEnabled && s.frequencyInterval === "timeBased" ? `found ${s.value} ${s.type}` : !s.isEnabled ? "no sign-in frequency on this policy" : null; }],
        ["persistent browser: never", (p) => S(p).persistentBrowser?.isEnabled && S(p).persistentBrowser?.mode === "never"],
      ],
    },
    "5.2.2.5": {
      cand: (p) => !!strengthId(p),
      crit: [
        ["admin scope: the 15 benchmark admin roles (includeRoles) or an admin persona group", (p) => adminScopeOk(p), (p) => adminScopeLabel(p)],
        ["resources: All", allApps],
        ["authentication strength limited to phishing-resistant methods", (p, ctx) => prStrength(p, ctx),
          (p, ctx) => {
            const id = strengthId(p);
            if (!id) return "no authentication strength granted";
            const st = ctx.strengths?.get?.(id);
            if (!st) return `strength ${id} not found among the tenant's strength policies — combinations could not be verified`;
            const norm2 = (c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, "");
            const bad = (st.allowedCombinations || []).filter((c) => !PR_COMBOS.has(norm2(c)));
            const good = (st.allowedCombinations || []).filter((c) => PR_COMBOS.has(norm2(c)));
            if (!bad.length) return null;
            // The common near-pass: a strength built on the PR methods that
            // also opens a weaker door (typically TAP for onboarding).
            return good.length
              ? `close — strength '${st.displayName || id}' includes the phishing-resistant methods (${good.join(", ")}) but ALSO allows: ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? "…" : ""}. The benchmark accepts only the three phishing-resistant combinations — remove the extras, or document them as a deviation (e.g. TAP for onboarding)`
              : `strength '${st.displayName || id}' allows only non-phishing-resistant combinations: ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? "…" : ""}`;
          }],
      ],
    },
    "5.2.2.6": {
      cand: (p) => ((p.conditions?.userRiskLevels) || []).length > 0,
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["userRiskLevels includes high", (p) => (p.conditions?.userRiskLevels || []).includes("high")],
        ["grant: passwordChange", (p) => grants(p).includes("passwordChange")],
        ["grant: mfa or authentication strength", mfaOrStrength],
        ["sign-in frequency: everyTime", sifEvery],
      ],
    },
    "5.2.2.7": {
      cand: (p) => ((p.conditions?.signInRiskLevels) || []).length > 0,
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["signInRiskLevels includes high", (p) => (p.conditions?.signInRiskLevels || []).includes("high")],
        ["signInRiskLevels includes medium", (p) => (p.conditions?.signInRiskLevels || []).includes("medium")],
        // Benchmark note 2: a block is a stricter enforcement and satisfies
        // the grant and session criteria outright.
        ["grant: mfa/strength (or block)", (p) => isBlock(p) || mfaOrStrength(p)],
        ["sign-in frequency: everyTime (or block)", (p) => isBlock(p) || sifEvery(p)],
      ],
    },
    "5.2.2.8": {
      cand: (p) => ((p.conditions?.signInRiskLevels) || []).length > 0 && isBlock(p),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["no resource exclusions", noAppExcl],
        ["signInRiskLevels includes high", (p) => (p.conditions?.signInRiskLevels || []).includes("high")],
        ["signInRiskLevels includes medium", (p) => (p.conditions?.signInRiskLevels || []).includes("medium")],
        ["grant: block", isBlock],
      ],
    },
    "5.2.2.9": {
      cand: (p) => grants(p).includes("compliantDevice") || grants(p).includes("domainJoinedDevice"),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["grant: compliantDevice", (p) => grants(p).includes("compliantDevice")],
        ["no grant controls besides compliantDevice / domainJoinedDevice", (p) => grants(p).every((g) => g === "compliantDevice" || g === "domainJoinedDevice")],
        // A single selected control is functionally identical whichever
        // operator the policy stores.
        ["operator: OR (a single control also satisfies)", (p) => G(p).operator === "OR" || grants(p).length === 1],
      ],
    },
    "5.2.2.10": {
      cand: (p) => (A(p).includeUserActions || []).includes("urn:user:registersecurityinfo"),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["user action: register security information", (p) => (A(p).includeUserActions || []).includes("urn:user:registersecurityinfo")],
        ["grant: compliantDevice", (p) => grants(p).includes("compliantDevice")],
        ["no grant controls besides compliantDevice / domainJoinedDevice", (p) => grants(p).every((g) => g === "compliantDevice" || g === "domainJoinedDevice")],
        ["operator: OR (a single control also satisfies)", (p) => G(p).operator === "OR" || grants(p).length === 1],
      ],
    },
    "5.2.2.11": {
      cand: (p) => appsInclude(p, [APPS.intuneEnrollment]) && (mfaOrStrength(p) || sif(p).isEnabled),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources include Microsoft Intune Enrollment", (p) => appsInclude(p, [APPS.intuneEnrollment])],
        ["grant: mfa or authentication strength", mfaOrStrength],
        ["sign-in frequency: everyTime", sifEvery],
      ],
    },
    "5.2.2.12": {
      cand: (p) => String(flows(p)).includes("deviceCodeFlow"),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["authentication flows include deviceCodeFlow", (p) => String(flows(p)).includes("deviceCodeFlow")],
        ["grant: block", isBlock],
      ],
    },
    "5.2.2.13": {
      cand: (p) => sif(p).isEnabled && !hasRisk(p),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["no risk conditions", (p) => !hasRisk(p)],
        // everyTime is stricter than any 7-day interval — compliant per the
        // benchmark's "any combination ≤ 7 days" note.
        ["sign-in frequency ≤ 7 days (or every time)", (p) => {
          const s = sif(p); if (!s.isEnabled) return false;
          if (s.frequencyInterval === "everyTime") return true;
          if (s.frequencyInterval !== "timeBased") return false;
          const v = Number(s.value);
          return s.type === "days" ? v <= 7 : s.type === "hours" ? v <= 168 : false;
        }, (p) => { const s = sif(p); return s.isEnabled && s.frequencyInterval === "timeBased" ? `found ${s.value} ${s.type} — the benchmark requires 7 days or less` : !s.isEnabled ? "no sign-in frequency on this policy" : null; }],
      ],
    },
    // 5.2.2.14 is assessed from named locations, not policies — custom below.
    "5.2.2.15": {
      cand: (p) => ((p.conditions?.locations?.includeLocations) || []).length > 0 && isBlock(p),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["includes ≥ 1 untrusted named location", (p, ctx) => (p.conditions?.locations?.includeLocations || []).some((id) => !["All", "AllTrusted"].includes(id) && !isTrustedLoc(ctx, id))],
        ["excludes trusted locations (AllTrusted or ≥ 1 trusted location)", (p, ctx) => { const ex = p.conditions?.locations?.excludeLocations || []; return ex.includes("AllTrusted") || ex.some((id) => isTrustedLoc(ctx, id)); }],
        ["grant: block", isBlock],
      ],
    },
    "5.2.2.16": {
      cand: (p) => !!S(p).secureSignInSession?.isEnabled,
      crit: [
        ["users: not none", (p) => !!anyUsers(p)],
        ["resources include Exchange Online, SharePoint Online and Teams Services", (p) => appsInclude(p, [APPS.exchangeOnline, APPS.sharePointOnline, APPS.teamsServices]),
          // Name exactly which of the three is missing — "only Teams missing"
          // is a one-line fix, and the generic label hid that.
          (p) => {
            const inc = (A(p).includeApplications || []).map((a) => String(a).toLowerCase());
            if (inc.includes("all")) return null;
            const miss = [["Office 365 Exchange Online", APPS.exchangeOnline], ["Office 365 SharePoint Online", APPS.sharePointOnline], ["Microsoft Teams Services", APPS.teamsServices]]
              .filter(([, id]) => !inc.includes(id.toLowerCase())).map(([n]) => n);
            return miss.length ? `missing only: ${miss.join(", ")}` : null;
          }],
        ["platforms include windows", (p) => { const pl = p.conditions?.platforms?.includePlatforms || []; return pl.includes("windows") || pl.includes("all"); }],
        ["client app types: mobileAppsAndDesktopClients only", (p) => { const c = clientTypes(p); return c.length === 1 && c[0] === "mobileAppsAndDesktopClients"; }],
        ["session: token protection (secureSignInSession) enabled", (p) => !!S(p).secureSignInSession?.isEnabled],
      ],
    },
    "5.2.2.17": {
      cand: (p) => String(flows(p)).includes("authenticationTransfer"),
      crit: [
        ["users: All (or a CAD- pilot deployment group)", allUsersOk, usersWhy],
        ["resources: All", allApps],
        ["authentication flows include authenticationTransfer", (p) => String(flows(p)).includes("authenticationTransfer")],
        ["grant: block", isBlock],
      ],
    },
  };

  // ─── evaluation ───────────────────────────────────────────────────
  function evalControl(ctl, raws, ctx) {
    if (ctl.id === "5.2.2.14") {
      const hits = (ctx.namedLocations || []).filter((l) =>
        (l["@odata.type"] || "").includes("ipNamedLocation") && l.isTrusted === true && ((l.ipRanges || []).length > 0));
      return hits.length
        ? { status: "pass", policies: hits.map((l) => l.displayName || l.id), near: [] }
        : { status: "fail", policies: [], near: [], note: (ctx.namedLocations || []).length ? "Named locations exist, but none is a trusted IP-range location with at least one range." : "No named locations are defined (or they could not be read)." };
    }
    const logic = CONTROL_LOGIC[ctl.id];
    if (!logic) return { status: "manual", policies: [], near: [] };
    // ALL states are evaluated — a disabled policy that meets every criterion
    // is its own tier ("configured"), not an invisible fail. Staged-rollout
    // baselines live in that state for weeks.
    const pool = raws;
    const judged = pool.map((p) => ({
      p,
      missing: logic.crit.filter(([, fn]) => !fn(p, ctx)).map(([label, , why]) => (why && why(p, ctx)) ? `${label} (${why(p, ctx)})` : label),
    }));
    const full = judged.filter((j) => j.missing.length === 0);
    const passers = full.filter((j) => isEnabled(j.p));
    // Passes achieved through a convention rather than the audit's letter
    // carry explanatory notes — admin persona group instead of includeRoles,
    // CAD- pilot group instead of All users.
    const wantsAllUsers = logic.crit.some(([l]) => l.startsWith("users: All"));
    const mk = (status, set) => {
      const r = { status, policies: set.map((j) => j.p.displayName), near: [] };
      const notes = [];
      if (ADMIN_CONTROLS.has(ctl.id) && set.every((j) => !adminRolesOk(j.p))) notes.push(ADMIN_GROUP_NOTE);
      if (wantsAllUsers && set.every((j) => !allUsers(j.p))) notes.push(PILOT_NOTE);
      if (notes.length) r.note = notes.join(" ");
      return r;
    };
    if (passers.length) return mk("pass", passers);
    const roFull = full.filter((j) => isRO(j.p));
    if (roFull.length) return mk("reportonly", roFull);
    if (full.length) {
      // full match, but every matching policy is Off
      const r = mk("configured", full);
      r.note = ((r.note ? r.note + " " : "")) + "Meets every criterion but the policy is Off — the benchmark's audit requires state = enabled, so an auditor scores this as fail until it is switched On. Staged-rollout policies land here.";
      return r;
    }
    // Nearest misses: prefer policies that attempt the control, fewest gaps first.
    const attempts = judged.filter((j) => logic.cand(j.p, ctx));
    const ranked = (attempts.length ? attempts : judged).sort((a, b) => a.missing.length - b.missing.length).slice(0, 3);
    return {
      status: "fail", policies: [],
      near: attempts.length ? ranked.map((j) => ({ name: j.p.displayName, id: j.p.id, state: j.p.state, missing: j.missing })) : [],
      note: attempts.length ? null : "No policy attempts this control.",
    };
  }

  // raws: raw Graph CA policies. ctx: { strengths: Map, namedLocations: [],
  // p2: true|false|null } — null means the licence could not be determined.
  function run(raws, ctx) {
    ctx = ctx || {};
    const results = CIS_BENCHMARK.controls.map((ctl) => {
      if (ctl.e5Only && ctx.p2 === false) return { ...ctl, status: "unlicensed", policies: [], near: [], note: "Requires Microsoft Entra ID P2 (E5) — the tenant has no P2 licence, so this recommendation is not applicable." };
      let r;
      try { r = evalControl(ctl, raws, ctx); } catch (e) { console.warn(`CIS ${ctl.id} evaluation failed:`, e); r = { status: "error", policies: [], near: [], note: e.message }; }
      return { ...ctl, ...r };
    });
    const scored = results.filter((r) => r.status !== "unlicensed" && r.status !== "error");
    const pct = (list) => list.length ? Math.round(list.filter((r) => r.status === "pass").length / list.length * 100) : 0;
    return {
      results,
      score: {
        overall: pct(scored),
        l1: pct(scored.filter((r) => r.level === 1)),
        l2: pct(scored.filter((r) => r.level === 2)),
        pass: scored.filter((r) => r.status === "pass").length,
        reportonly: scored.filter((r) => r.status === "reportonly").length,
        configured: scored.filter((r) => r.status === "configured").length,
        fail: scored.filter((r) => r.status === "fail").length,
        na: results.filter((r) => r.status === "unlicensed").length,
        total: scored.length,
      },
    };
  }

  // ─── rendering ────────────────────────────────────────────────────
  const scoreColor = (n) => n >= 80 ? "var(--on)" : n >= 55 ? "var(--report)" : "var(--off)";
  const STATUS = {
    pass: ["✓ Pass", "on"], reportonly: ["◐ Report-only", "report"],
    configured: ["⏸ Configured (Off)", "report"],
    fail: ["✗ Fail", "off"], unlicensed: ["— Not licensed", ""], error: ["! Error", "off"],
  };
  const statusBadge = (s) => { const [label, cls] = STATUS[s] || [s, ""]; return `<span class="tag ${cls === "on" ? "grant" : cls === "report" ? "new" : cls === "off" ? "block" : ""}" style="white-space:nowrap">${label}</span>`; };

  function renderSummary(result, meta = {}) {
    const s = result.score;
    const card = (label, val) => `<div style="flex:0 0 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:96px;border:1px solid var(--border);border-radius:12px;padding:10px 16px">
      <div style="font-size:26px;font-weight:800;color:${scoreColor(val)}">${val}%</div><div class="mini muted">${label}</div></div>`;
    return `<h3>📐 CIS Benchmark alignment <span class="tag new">BETA</span></h3>
      <p style="margin:6px 0 0">The tenant's Conditional Access policies assessed against the <b>${esc(CIS_BENCHMARK.name)} v${CIS_BENCHMARK.version}</b> (released ${esc(CIS_BENCHMARK.released)}), section ${esc(CIS_BENCHMARK.section)} — the ${CIS_BENCHMARK.controls.length} automated CA recommendations. A CA compliance slice, not a full M365 benchmark scan.</p>
      <p class="mini muted" style="margin:4px 0 0">Benchmark catalog revision ${esc(CIS_BENCHMARK.revision)} — the control set and assessment criteria are versioned on their own (cisdata.js), separate from the app build and the other tools.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:stretch;margin-top:12px">
        ${card("Overall", s.overall)}${card("Level 1", s.l1)}${card("Level 2", s.l2)}
        <div style="flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:center;border:1px solid var(--border);border-radius:12px;padding:10px 16px">
          <div class="mini"><b style="color:var(--on)">${s.pass}</b> pass · <b style="color:var(--report)">${s.reportonly}</b> report-only · <b style="color:var(--report)">${s.configured || 0}</b> configured (Off) · <b style="color:var(--off)">${s.fail}</b> fail${s.na ? ` · ${s.na} not licensed` : ""} — of ${s.total} assessed</div>
          ${(s.reportonly || s.configured) ? `<div class="mini muted" style="margin-top:2px">Report-only and configured are one state switch from passing — the benchmark counts them as fail until enforced.</div>` : ""}
          <div class="mini muted" style="margin-top:4px">Every control also expects exclusions to be documented and reviewed annually — that part is manual and not scored here.</div>
        </div>
      </div>
      <p class="mini muted" style="margin:10px 0 0">${esc(CIS_BENCHMARK.copyright)}</p>`;
  }

  function renderTable(result, filter, expanded) {
    const lvl = filter.level, st = filter.status;
    let list = result.results;
    if (lvl !== "all") list = list.filter((r) => r.level === lvl);
    if (st !== "all") list = list.filter((r) => r.status === st);
    if (!list.length) return `<p class="mini" style="padding:20px">No controls match the current filter.</p>`;
    return list.map((r) => {
      const open = expanded.has(r.id);
      const pol = r.policies.length ? `<span class="mini">${esc(r.policies.slice(0, 2).join(", "))}${r.policies.length > 2 ? ` +${r.policies.length - 2}` : ""}</span>` : "";
      return `<div class="list-card ml-card">
        <button class="ml-head ${open ? "open" : ""}" data-cistoggle="${esc(r.id)}">
          <span class="caret">▶</span>
          ${statusBadge(r.status)}
          <span class="tag ${r.level === 2 ? "new" : ""}" title="CIS profile level">L${r.level}</span>
          ${r.e5Only ? '<span class="tag" title="Requires Entra ID P2 (E5)">E5</span>' : ""}
          <span class="ml-title">${esc(r.id)} — ${esc(r.title)}</span>
          ${pol}
        </button>
        ${open ? `<div class="ml-detail">
          <h5>Recommendation</h5><p>${esc(r.what)}</p>
          <h5>What ENCA checks</h5><ul class="mini" style="margin:4px 0 0;padding-left:18px">${r.checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
          ${r.status === "pass" ? `<h5 class="ml-green" style="margin-top:12px">Satisfied by</h5><p>${r.policies.map((n) => esc(n)).join("<br>")}</p>` : ""}
          ${r.status === "reportonly" ? `<h5 style="margin-top:12px">Report-only</h5><p>${r.policies.map((n) => esc(n)).join("<br>")}<br><span class="mini muted">Meets every criterion but is not enforced — switch it On to pass.</span></p>` : ""}
          ${r.status === "configured" ? `<h5 style="margin-top:12px">Configured — Off</h5><p>${r.policies.map((n) => esc(n)).join("<br>")}<br><span class="mini muted">Meets every criterion but the policy is Off — switch it On to pass.</span></p>` : ""}
          ${r.note ? `<p class="mini" style="margin-top:10px">${esc(r.note)}</p>` : ""}
          ${r.near && r.near.length ? `<h5 style="margin-top:12px">Nearest policies and what they miss</h5>${r.near.map((n) => `
            <p style="margin:6px 0 0"><span class="pol-link" data-polid="${esc(n.id || "")}">${esc(n.name)}</span> <span class="mini muted">(${n.state === "enabledForReportingButNotEnforced" ? "report-only" : n.state})</span></p>
            <ul class="mini" style="margin:2px 0 0;padding-left:18px">${n.missing.map((m) => `<li>✗ ${esc(m)}</li>`).join("")}</ul>`).join("")}` : ""}
        </div>` : ""}
      </div>`;
    }).join("");
  }

  // ─── Markdown export ──────────────────────────────────────────────
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const MD_STATUS = { pass: "✅ Pass", reportonly: "◐ Report-only", configured: "⏸ Configured (Off)", fail: "❌ Fail", unlicensed: "— Not licensed (no P2)", error: "⚠ Error" };

  function toMd(result, meta = {}) {
    const s = result.score;
    const L = [];
    L.push(`# CIS Benchmark alignment — ${mdEsc(meta.tenantName || "tenant")}`);
    L.push("");
    L.push(Brand.generatedBy());
    L.push("");
    L.push(`Assessed against the **${CIS_BENCHMARK.name} v${CIS_BENCHMARK.version}** (${CIS_BENCHMARK.released}), section ${CIS_BENCHMARK.section} — the ${CIS_BENCHMARK.controls.length} automated Conditional Access recommendations. This is a CA compliance slice, not a full Microsoft 365 benchmark scan. Benchmark catalog revision: ${CIS_BENCHMARK.revision}.`);
    L.push("");
    L.push("## Score");
    L.push("");
    L.push(`- Overall: **${s.overall}%** (${s.pass}/${s.total} controls pass)`);
    L.push(`- Level 1: **${s.l1}%** · Level 2: **${s.l2}%**`);
    L.push(`- ${s.pass} pass, ${s.reportonly} report-only, ${s.fail} fail${s.na ? `, ${s.na} not applicable (no Entra ID P2)` : ""}`);
    L.push(`- Policies evaluated: ${meta.policyCount ?? "?"} (enabled and report-only)`);
    L.push("");
    L.push("| # | Level | Recommendation | Result | Satisfied by |");
    L.push("|---|-------|----------------|--------|--------------|");
    for (const r of result.results) {
      L.push(`| ${r.id} | L${r.level}${r.e5Only ? " (E5)" : ""} | ${mdEsc(r.title)} | ${MD_STATUS[r.status] || r.status} | ${mdEsc(r.policies.join(", ")) || "—"} |`);
    }
    L.push("");
    for (const r of result.results.filter((x) => x.status === "fail" || x.status === "reportonly" || x.status === "configured")) {
      L.push(`## ${r.id} — ${mdEsc(r.title)} (${MD_STATUS[r.status]})`);
      L.push("");
      L.push(r.what);
      L.push("");
      L.push("Criteria: " + r.checks.join("; ") + ".");
      if (r.note) { L.push(""); L.push(`> ${r.note}`); }
      if (r.status === "reportonly") { L.push(""); L.push(`Report-only match: ${r.policies.map(mdEsc).join(", ")} — meets every criterion but is not enforced; switch it On to pass.`); }
      if (r.status === "configured") { L.push(""); L.push(`Configured (Off) match: ${r.policies.map(mdEsc).join(", ")} — meets every criterion but the policy is Off; switch it On to pass.`); }
      if (r.near && r.near.length) {
        L.push("");
        L.push("Nearest policies and what they miss:");
        L.push("");
        for (const n of r.near) {
          L.push(`- **${mdEsc(n.name)}** (${n.state === "enabledForReportingButNotEnforced" ? "report-only" : n.state})`);
          for (const m of n.missing) L.push(`  - ✗ ${mdEsc(m)}`);
        }
      }
      L.push("");
    }
    L.push("## Notes");
    L.push("");
    L.push("- Every recommendation additionally expects policy exclusions to be documented and reviewed annually — a manual step outside this automated assessment.");
    L.push(`- ${CIS_BENCHMARK.copyright}`);
    L.push("");
    return L.join("\n");
  }

  return { run, renderSummary, renderTable, toMd };
})();
