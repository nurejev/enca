// ======================================================================
// SMS / Voice retirement check (T33) — a TEMPORARY tool, and it says so.
//
// Microsoft retires its own SMS and voice MFA delivery in Entra ID on
// 1 February 2027, and from 1 September 2026 every user still enabled for
// SMS or voice in the Authentication Methods Policy is auto-enabled for
// passkeys and nudged to register one. After 1 February 2027 a user whose
// ONLY MFA method is a phone number hits a BLOCKING passkey-registration
// prompt — no opt-out. The dates come from Microsoft's retirement notice:
//   https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement
//
// The scope half of this analysis follows Microsoft's own script
// (Get-SmsVoicePolicyUsers.ps1, github.com/microsoft/entra-sms-voice-usage-analyzer):
// read the sms and voice authenticationMethodConfigurations, resolve their
// include/exclude targets. This tool then goes one step further than the
// script — it expands the scope to the actual users and, when the
// registration report is readable, says per user whether a phone method is
// really REGISTERED and whether a phishing-resistant method already covers
// them. Scope says who Microsoft's Sep 1 auto-enablement touches;
// registration says who Feb 1 actually breaks.
//
// This module is pure analysis over a ctx the wiring fills from Graph (or
// demo data) — nothing here talks to Graph and nothing writes, matching the
// house pattern (devcheck.js, guide.js):
//   ctx = {
//     campaignState: "enabled"|"disabled"|"default"|"unknown",
//     optOut:        true|false|null,       // passkeyDynamicMigration; null = not readable
//     sms:   { state, scope },              // scope = parseScope() result
//     voice: { state, scope },
//     names: { id → displayName },
//     users: [{ id, upn, name, enabled, via, inSms, inVoice }],
//     usersPartial: bool,                    // a read cap truncated the user list
//     reg:   { id → { methods:[...], defaultMethod } } | null,   // null = not read
//     regPartial: bool,
//   }
// ======================================================================
const SmsVoice = (() => {
  const DATES = {
    nudge:  { iso: "2026-09-01", label: "1 September 2026" },
    retire: { iso: "2027-02-01", label: "1 February 2027" },
  };
  const daysUntil = (iso) => Math.ceil((new Date(iso + "T00:00:00Z") - Date.now()) / 86400000);

  // ---- passkey dynamic migration: the one thing this tool can WRITE --------
  // Microsoft's temporary opt-out from its OWN September rollout, and the
  // reason it needs a tool at all: it is a Graph-only property with no control
  // anywhere in the Entra admin center, so a tenant cannot see its own setting
  // without calling Graph, and cannot tell "we decided not to opt out" from
  // "nobody ever looked". Tenant-wide, one boolean, on the authentication
  // methods policy — beta only, which is what AUTH_CONFIG.graphBase already is.
  //
  // What TRUE does: excludes the tenant from the 1 September 2026 automatic
  // passkey enablement and the Microsoft-managed registration campaign that
  // comes with it. What it does NOT do — and this is the misreading worth
  // spending words on — is move the 1 February 2027 retirement. SMS and voice
  // stop working on that date whatever this says.
  //   Background: Roy Klooster, rksolutions.nl/posts/microsoft-entra-passkey-dynamic-migration
  //   Graph: learn.microsoft.com/graph/api/authenticationmethodspolicy-update?view=graph-rest-beta
  const MIGRATION = {
    path: "/policies/authenticationMethodsPolicy",
    readScopes: ["Policy.Read.All"],                       // covered by the baseline consent
    writeScopes: ["Policy.ReadWrite.AuthenticationMethod"], // asked on demand, at the click
    role: "Authentication Policy Administrator",           // least-privileged built-in role that can write it
  };
  // null is a THIRD answer, not a falsy second one: an absent property means
  // the tenant has never used the opt-out — but it also looks identical to a
  // tenant that cannot expose it, so the caller must be able to say "not read".
  const readOptOut = (policy) => {
    const v = policy && policy.optOutSettings ? policy.optOutSettings.passkeyDynamicMigration : undefined;
    return typeof v === "boolean" ? v : null;
  };
  const optOutBody = (on) => ({ optOutSettings: { passkeyDynamicMigration: !!on } });
  const migrationWord = (v) => v === true ? "paused" : v === false ? "not paused" : "not read";
  // In a HISTORY line the third state means something different from "not
  // read": the property was absent from the policy at that moment. Same three
  // values, different sentence, so it gets its own word rather than reusing a
  // label that would claim the audit log failed.
  const migrationValueWord = (v) => v === true ? "paused" : v === false ? "not paused" : "absent";

  // ---- who changed it, and when: the directory audit log -------------------
  // The panel answers WHAT this tenant's setting is. The question that follows
  // it in every real conversation is "since when, and who did that?" — and
  // because the property has no control in the Entra admin center, there is no
  // change record anywhere a person can reach by clicking. The directory audit
  // log has one: an edit to the authentication methods policy is logged like
  // any other policy change, whoever made it and however they made it.
  //
  // Two caveats that must be PASSED ON rather than hidden, because both make
  // an empty answer mean something other than "nobody changed it":
  //   * retention is licence-bound — about 30 days on Entra ID P1/P2, 7 days
  //     otherwise. "No record" means "not in the window", never "never".
  //   * Entra does not reliably diff nested properties, so a record can prove
  //     the policy was edited without proving WHICH field moved. Those records
  //     are kept and labelled instead of dropped: a name and a timestamp is a
  //     smaller answer than a transition, but it is still an answer.
  const MIGRATION_AUDIT = {
    scopes: ["AuditLog.Read.All"],
    role: "Reports Reader",   // least-privileged built-in role that can read the audit log
    days: 30,                 // the most any licence retains
    // The date window plus the category every policy change lands in. Narrowing
    // further server-side is not worth it: the activity name for this edit
    // differs between the portal, Graph and PowerShell, and a filter that
    // misses one of them would report "nobody changed it" about a change that
    // is sitting right there in the log.
    query(days) {
      const since = new Date(Date.now() - (days || MIGRATION_AUDIT.days) * 864e5).toISOString();
      const f = `activityDateTime ge ${since} and category eq 'Policy'`;
      return `/auditLogs/directoryAudits?$filter=${encodeURIComponent(f)}&$orderby=activityDateTime desc&$top=999`;
    },
  };

  // Audit values arrive as JSON strings, sometimes double-encoded, sometimes
  // wrapped in a one-element array, and sometimes as the bare word "true".
  function auDecode(v) {
    if (v == null || v === "") return null;
    let x = v;
    for (let i = 0; i < 3; i++) {
      if (typeof x !== "string") break;
      const s = x.trim();
      if (s === "true") return true;
      if (s === "false") return false;
      if (!(s.startsWith("{") || s.startsWith("[") || s.startsWith('"'))) break;
      try { x = JSON.parse(s); } catch { break; }
    }
    if (Array.isArray(x) && x.length === 1 && x[0] && typeof x[0] === "object") return x[0];
    return x;
  }
  // The flag can sit anywhere in a decoded payload: the whole policy object,
  // just optOutSettings, or the bare boolean when the property is named on the
  // modifiedProperty itself. undefined means "this payload does not carry it",
  // which is not the same as null ("it carries it, and it was absent").
  function findFlag(v, depth = 0) {
    if (typeof v === "boolean") return depth ? v : undefined;
    if (!v || typeof v !== "object" || depth > 6) return undefined;
    if (Object.prototype.hasOwnProperty.call(v, "passkeyDynamicMigration")) {
      const b = v.passkeyDynamicMigration;
      return typeof b === "boolean" ? b : b === "true" ? true : b === "false" ? false : null;
    }
    for (const k of Object.keys(v)) {
      const r = findFlag(v[k], depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const NAMED_RX = /passkeydynamicmigration/i;
  const AUTH_POLICY_RX = /authentication ?methods ?policy|authenticationmethodspolicy/i;

  function migrationActor(rec) {
    const b = rec.initiatedBy || {};
    if (b.user && (b.user.userPrincipalName || b.user.displayName || b.user.id))
      return { kind: "user", name: b.user.displayName || b.user.userPrincipalName || b.user.id,
        upn: b.user.userPrincipalName || "", ip: b.user.ipAddress || "" };
    if (b.app && (b.app.displayName || b.app.appId))
      return { kind: "app", name: b.app.displayName || b.app.appId, upn: "", ip: "" };
    return { kind: "unknown", name: "(unknown)", upn: "", ip: "" };
  }

  // One audit record → one history row, or null when it has nothing to do with
  // the authentication methods policy.
  function migrationRecord(rec) {
    const trs = rec.targetResources || [];
    const props = trs.flatMap((t) => t.modifiedProperties || []);
    const text = [rec.activityDisplayName || "",
      ...trs.map((t) => `${t.displayName || ""} ${t.type || ""}`),
      ...props.map((p) => p.displayName || "")].join(" ");
    if (!NAMED_RX.test(text) && !AUTH_POLICY_RX.test(text)) return null;

    let from, to;
    for (const p of props) {
      const named = NAMED_RX.test(String(p.displayName || ""));
      const o = auDecode(p.oldValue), n = auDecode(p.newValue);
      const f = named ? (typeof o === "boolean" ? o : o == null ? null : findFlag(o, 1)) : findFlag(o);
      const t = named ? (typeof n === "boolean" ? n : n == null ? null : findFlag(n, 1)) : findFlag(n);
      if (f !== undefined && from === undefined) from = f;
      if (t !== undefined && to === undefined) to = t;
    }
    const seen = from !== undefined || to !== undefined;
    const norm = (v) => (v === true || v === false) ? v : null;
    return {
      id: rec.id,
      when: rec.activityDateTime,
      activity: rec.activityDisplayName || "(policy change)",
      result: rec.result || "",
      service: rec.loggedByService || "",
      actor: migrationActor(rec),
      from: seen ? norm(from) : null,
      to: seen ? norm(to) : null,
      seen,                                       // the record carried the property at all
      moved: seen && norm(from) !== norm(to),     // and it actually changed
    };
  }

  // The whole answer, in the order the panel needs it: the property changes
  // first, every other authentication methods policy edit behind them as the
  // fallback, and a word for which of the two the caller is looking at — so
  // the screen can say "nobody touched the property, but somebody edited the
  // policy" instead of drawing the weaker answer as if it were the strong one.
  function migrationHistory(records, days) {
    const rows = (records || []).map(migrationRecord).filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const moved = rows.filter((r) => r.moved);
    return {
      days: days || MIGRATION_AUDIT.days,
      rows, moved,
      last: moved[0] || null,        // who changed the opt-out, when Entra diffed it
      lastTouch: rows[0] || null,    // else: who last edited the policy at all
      matched: moved.length ? "property" : rows.length ? "policy" : "none",
    };
  }
  const migrationMove = (r) => `${migrationValueWord(r.from)} → ${migrationValueWord(r.to)}`;

  // ---- end passkey dynamic migration --------------------------------------

  // methodsRegistered values from the registration-details report, sorted
  // into what they mean for THIS retirement. mobilePhone can receive both
  // SMS and a call; the office and alternate numbers are voice-only.
  const SMS_METHODS   = new Set(["mobilePhone", "alternateMobilePhone"]);
  const VOICE_METHODS = new Set(["mobilePhone", "alternateMobilePhone", "officePhone"]);
  // Phishing-resistant: what Microsoft says survives the retirement without
  // any migration — passkeys in their several spellings, WHfB, FIDO2.
  const PR_METHODS = new Set(["passKeyDeviceBound", "passKeyDeviceBoundAuthenticator",
    "passKeyDeviceBoundWindowsHello", "windowsHelloForBusiness", "fido2SecurityKey",
    "macOsSecureEnclaveKey"]);
  // Any other method that satisfies MFA — a user with one of these is not
  // locked out on Feb 1, they just keep getting nudged toward passkeys.
  const OTHER_MFA = new Set(["microsoftAuthenticatorPush", "microsoftAuthenticatorPasswordless",
    "softwareOneTimePasscode", "hardwareOneTimePasscode", "temporaryAccessPass"]);
  // What the DEFAULT method looks like when it is a phone. The report speaks
  // two dialects — userPreferredMethodForSecondaryAuthentication says "sms" /
  // "voiceMobile" / "voiceAlternateMobile" / "voiceOffice", the legacy
  // defaultMfaMethod field names the method itself — so both are recognised.
  const PHONE_DEFAULTS = new Set(["sms", "voiceMobile", "voiceAlternateMobile", "voiceOffice",
    "mobilePhone", "alternateMobilePhone", "officePhone"]);

  // ---- policy scope, the way Microsoft's script reads it -----------------
  // includeTargets/excludeTargets of an authenticationMethodConfiguration:
  // targetType "group" (id "all_users" = everyone) or "user".
  function parseScope(cfg) {
    const read = (k) => cfg && (cfg[k] || (cfg.additionalProperties || {})[k]) || [];
    const out = { isAllUsers: false, includeGroups: [], excludeGroups: [], includeUsers: [], excludeUsers: [] };
    for (const t of read("includeTargets")) {
      if ((t.targetType || "group") === "group") {
        if (t.id === "all_users") out.isAllUsers = true; else out.includeGroups.push(t.id);
      } else out.includeUsers.push(t.id);
    }
    for (const t of read("excludeTargets")) {
      if ((t.targetType || "group") === "group") out.excludeGroups.push(t.id);
      else out.excludeUsers.push(t.id);
    }
    return out;
  }

  // ---- per-user verdict --------------------------------------------------
  // ready     — a phishing-resistant method is registered: the retirement
  //             changes nothing for this account.
  // migrate   — a phone method is registered AND another (phishable) MFA
  //             method exists: not locked out, but nudged from Sep 1 and the
  //             phone method dies Feb 1.
  // blocking  — a phone method is the ONLY MFA registered: on Feb 1 2027 the
  //             next sign-in is a blocking passkey-registration prompt.
  // clean     — in scope but no phone method registered (and nothing else
  //             at risk): the policy names them, the phones do not.
  // unknown   — registration data was not readable for this user.
  // phoneOnly — a phone is the ONLY MFA method registered (the blocking case,
  // stated as its own fact so the table can show it in a column rather than
  // leaving it implied by the verdict). phoneDefault — a phone is what the
  // user's MFA prompts actually use today, whatever else is registered: the
  // people who will FEEL the retirement first, even when a passkey already
  // sits unused next to the phone.
  function classify(rec) {
    if (!rec) return { risk: "unknown", sms: null, voice: null, pr: null, phoneOnly: null, phoneDefault: null };
    const m = rec.methods || [];
    const sms = m.some((x) => SMS_METHODS.has(x));
    const voice = m.some((x) => VOICE_METHODS.has(x));
    const pr = m.some((x) => PR_METHODS.has(x));
    const other = m.some((x) => OTHER_MFA.has(x));
    const phoneOnly = (sms || voice) && !pr && !other;
    const phoneDefault = PHONE_DEFAULTS.has(String(rec.defaultMethod || ""));
    let risk;
    if (pr) risk = "ready";
    else if (phoneOnly) risk = "blocking";
    else if (sms || voice) risk = "migrate";
    else risk = "clean";
    return { risk, sms, voice, pr, phoneOnly, phoneDefault };
  }

  // One phrase for the new column: what the phone IS to this user.
  function phoneRole(r) {
    if (r.phoneOnly === null) return "?";
    if (r.phoneOnly) return "only method";
    if (r.phoneDefault) return "default";
    if (r.sms || r.voice) return "backup";
    return "—";
  }

  const RISK_RANK = { blocking: 0, migrate: 1, unknown: 2, clean: 3, ready: 4 };

  function analyze(ctx) {
    const rows = (ctx.users || []).map((u) => {
      const rec = ctx.reg ? ctx.reg[u.id] : null;
      const c = ctx.reg ? classify(rec) : { risk: "unknown", sms: null, voice: null, pr: null };
      return { ...u, ...c, defaultMethod: rec ? rec.defaultMethod || "" : "" };
    });
    rows.sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk] || String(a.upn).localeCompare(String(b.upn)));
    const n = (k) => rows.filter((r) => r.risk === k).length;
    const anyEnabled = (ctx.sms || {}).state === "enabled" || (ctx.voice || {}).state === "enabled";
    return {
      rows, anyEnabled,
      campaignState: ctx.campaignState, optOut: ctx.optOut,
      sms: ctx.sms, voice: ctx.voice, names: ctx.names || {},
      usersPartial: !!ctx.usersPartial, regRead: !!ctx.reg, regPartial: !!ctx.regPartial,
      summary: {
        total: rows.length,
        blocking: n("blocking"), migrate: n("migrate"), ready: n("ready"),
        clean: n("clean"), unknown: n("unknown"),
        phone: rows.filter((r) => r.sms || r.voice).length,
        phoneDefault: rows.filter((r) => r.phoneDefault).length,
        daysNudge: daysUntil(DATES.nudge.iso), daysRetire: daysUntil(DATES.retire.iso),
      },
    };
  }

  // ---- the notification email --------------------------------------------
  // Who gets it: the users a phone method makes vulnerable — verdicts
  // blocking and migrate — minus disabled accounts, which have nobody
  // reading their mail. When the registration half was not read the whole
  // scope is the honest fallback, and the modal says so. Recipients are the
  // UPNs; a UPN is usually the primary address, but not always, and the
  // modal carries that caveat rather than hiding it.
  function notifyEmail(res) {
    const rows = (res.rows || []).filter((r) => r.enabled !== false);
    const targets = res.regRead ? rows.filter((r) => r.risk === "blocking" || r.risk === "migrate") : rows;
    const recipients = [...new Set(targets.map((r) => r.upn))].filter((u) => /@/.test(u)).sort();
    const subject = "Action required: set up a passkey — SMS and voice-call sign-in codes are being retired";
    const body = [
      "Hello,",
      "",
      "You are receiving this message because your work account currently uses text messages (SMS) or voice calls to confirm your sign-in.",
      "",
      "Microsoft is retiring SMS and voice-call sign-in codes:",
      "",
      `  * From ${DATES.nudge.label} you will be prompted to register a passkey when you sign in.`,
      `  * On ${DATES.retire.label} SMS and voice codes stop working. If a phone number is your only sign-in method by then, you will be blocked at sign-in until you register a passkey.`,
      "",
      "What you need to do — it takes about two minutes:",
      "",
      "  1. Go to https://aka.ms/mysecurityinfo and sign in.",
      "  2. Choose \"Add sign-in method\" and pick \"Passkey\". Follow the steps on your phone or computer (Face ID, fingerprint, Windows Hello or a security key).",
      "  3. Sign out and back in once, using the passkey, to confirm it works.",
      "  4. Then remove \"Phone\" from your sign-in methods on the same page, so the retiring method cannot interrupt you later.",
      "",
      "Passkeys are faster than codes and far more resistant to phishing — nothing is sent to your phone number, so nothing can be intercepted.",
      "",
      "If you run into trouble, contact [YOUR IT SERVICE DESK / CONTACT DETAILS].",
      "",
      "Thank you,",
      "[YOUR IT TEAM]",
    ].join("\n");
    return { subject, body, recipients, scopeOnly: !res.regRead,
      skippedDisabled: (res.rows || []).length - rows.length };
  }

  // ---- exports -----------------------------------------------------------
  const stateWord = (s) => s === "enabled" ? "Enabled" : s === "disabled" ? "Disabled" : String(s || "unknown");
  const campaignWord = (s) => s === "default" ? "Microsoft managed" : stateWord(s);
  const RISK_WORD = {
    blocking: "phone is the ONLY MFA — blocked into passkey registration after 1 Feb 2027",
    migrate: "phone registered, other MFA exists — nudged from 1 Sep 2026, phone stops 1 Feb 2027",
    ready: "phishing-resistant method registered — retirement changes nothing",
    clean: "in policy scope, no phone method registered",
    unknown: "registration data not read",
  };

  function scopeLines(scope, names) {
    if (!scope) return ["(policy disabled — no scope)"];
    const nm = (id) => names[id] || id;
    const L = [];
    if (scope.isAllUsers) L.push("Include: ALL USERS");
    for (const g of scope.includeGroups) L.push(`Include group: ${nm(g)} (${g})`);
    for (const u of scope.includeUsers) L.push(`Include user: ${nm(u)} (${u})`);
    for (const g of scope.excludeGroups) L.push(`Exclude group: ${nm(g)} (${g})`);
    for (const u of scope.excludeUsers) L.push(`Exclude user: ${nm(u)} (${u})`);
    return L.length ? L : ["(no targets)"];
  }

  const MD_ROW_CAP = 3000;   // a 30k-user tenant belongs in the CSV, not in a Markdown table

  function toMd(res, meta = {}) {
    const s = res.summary;
    const L = [`# SMS / Voice retirement check — ${meta.tenantName || "tenant"}`, "",
      (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy() : "", "",
      "> **Temporary tool.** Microsoft-provided SMS and voice MFA delivery retires on " +
      `**${DATES.retire.label}**; from **${DATES.nudge.label}** users enabled for SMS or voice are auto-enabled for passkeys and nudged at sign-in. ` +
      "Source: [Microsoft's retirement notice](https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement).", "",
      "## Tenant state", "",
      `- SMS policy: **${stateWord((res.sms || {}).state)}** · Voice policy: **${stateWord((res.voice || {}).state)}**`,
      `- Registration campaign: **${campaignWord(res.campaignState)}**`,
      `- Temporary opt-out (passkeyDynamicMigration): **${res.optOut === null ? "not read" : res.optOut ? "OPTED OUT (delays Sep 1 auto-enablement only — Feb 1 still applies)" : "not set"}**`,
      `- ${DATES.nudge.label} (passkey auto-enablement): **${s.daysNudge >= 0 ? `in ${s.daysNudge} day${s.daysNudge === 1 ? "" : "s"}` : `${-s.daysNudge} days ago`}**`,
      `- ${DATES.retire.label} (SMS/voice retired, blocking prompt): **${s.daysRetire >= 0 ? `in ${s.daysRetire} days` : `${-s.daysRetire} days ago`}**`, ""];
    if (!res.anyEnabled) {
      L.push("**Both policies are disabled — no user is enabled for Microsoft-provided SMS or voice. No action required.**", "");
    }
    L.push("## Policy scope", "", "### SMS", "", ...scopeLines((res.sms || {}).scope, res.names).map((x) => `- ${x}`), "",
      "### Voice", "", ...scopeLines((res.voice || {}).scope, res.names).map((x) => `- ${x}`), "");
    L.push("## Users in scope", "",
      `${s.total} user${s.total === 1 ? "" : "s"} in scope${res.usersPartial ? " (READ CAPPED — the list is partial)" : ""}` +
      (res.regRead
        ? ` · ${s.phone} with a phone method registered (${s.phoneDefault} as their default) · **${s.blocking} phone-only (blocked after ${DATES.retire.label})** · ${s.migrate} to migrate · ${s.ready} already phishing-resistant · ${s.clean} clean${s.unknown ? ` · ${s.unknown} unknown` : ""}${res.regPartial ? " · registration read was capped — unknowns may be understated" : ""}`
        : " · registration data NOT read (needs AuditLog.Read.All) — the table shows scope only, not who actually uses a phone"), "");
    if (res.rows.length) {
      L.push("| User | Name | Enabled | SMS scope | Voice scope | Via | SMS reg. | Voice reg. | Phishing-resistant | Phone role | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|");
      const yn = (v) => v === null ? "?" : v ? "yes" : "no";
      for (const r of res.rows.slice(0, MD_ROW_CAP))
        L.push(`| ${r.upn} | ${r.name || ""} | ${r.enabled === false ? "no" : r.enabled === true ? "yes" : "?"} | ${r.inSms ? "yes" : "no"} | ${r.inVoice ? "yes" : "no"} | ${(r.via || []).join("; ")} | ${yn(r.sms)} | ${yn(r.voice)} | ${yn(r.pr)} | ${phoneRole(r)} | ${RISK_WORD[r.risk]} |`);
      if (res.rows.length > MD_ROW_CAP) L.push("", `…and ${res.rows.length - MD_ROW_CAP} more — the CSV export carries the full list.`);
      L.push("");
    }
    L.push("## What to do", "",
      `1. Move users to passkeys before ${DATES.retire.label} — [plan a passkey deployment](https://learn.microsoft.com/entra/identity/authentication/how-to-deploy-phishing-resistant-passwordless-authentication) and [enable passkeys (FIDO2)](https://learn.microsoft.com/entra/identity/authentication/how-to-authentication-passkeys-fido2).`,
      `2. To stop the ${DATES.nudge.label} auto-enablement, move users out of the SMS/Voice policy scope before that date — or pause it tenant-wide with the temporary opt-out (\`optOutSettings.passkeyDynamicMigration\`), which this tool can read and set for you at the top of its screen. Neither changes the ${DATES.retire.label} enforcement.`,
      "3. A regulatory need for SMS/voice? A customer-managed telecom provider can be configured through the Microsoft Security Store (selectable from 30 October 2026).",
      "4. Tell the users — [Microsoft's communication templates](https://aka.ms/mfatemplates), scoped to the people this report names.", "",
      "Links: [retirement notice](https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement) · [FAQ](https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement-faq) · [Microsoft's scope script](https://github.com/microsoft/entra-sms-voice-usage-analyzer)", "");
    return L.join("\n");
  }

  function toCsv(res) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const yn = (v) => v === null ? "" : v ? "yes" : "no";
    const L = ["userPrincipalName,displayName,accountEnabled,inSmsScope,inVoiceScope,via,smsRegistered,voiceRegistered,phishingResistantRegistered,phoneIsOnlyMfaMethod,phoneIsDefaultMethod,defaultMethod,verdict"];
    for (const r of res.rows)
      L.push([q(r.upn), q(r.name), r.enabled === false ? "no" : r.enabled === true ? "yes" : "",
        r.inSms ? "yes" : "no", r.inVoice ? "yes" : "no", q((r.via || []).join("; ")),
        yn(r.sms), yn(r.voice), yn(r.pr), yn(r.phoneOnly), yn(r.phoneDefault), q(r.defaultMethod), q(RISK_WORD[r.risk])].join(","));
    return L.join("\n");
  }

  return { DATES, daysUntil, parseScope, classify, phoneRole, analyze, toMd, toCsv, notifyEmail, stateWord, campaignWord, RISK_WORD, MD_ROW_CAP,
    MIGRATION, readOptOut, optOutBody, migrationWord,
    MIGRATION_AUDIT, migrationHistory, migrationRecord, migrationValueWord, migrationMove };
})();
