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
      `2. To stop the ${DATES.nudge.label} auto-enablement, move users out of the SMS/Voice policy scope before that date — or set the temporary opt-out (passkeyDynamicMigration) via Graph. Neither changes the ${DATES.retire.label} enforcement.`,
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

  return { DATES, daysUntil, parseScope, classify, phoneRole, analyze, toMd, toCsv, notifyEmail, stateWord, campaignWord, RISK_WORD, MD_ROW_CAP };
})();
