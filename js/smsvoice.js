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

  // ---- what is registered, in words -------------------------------------
  // The verdict compresses the registration record into one sentence; the
  // Methods column shows the record itself, because the sentence is only as
  // trustworthy as the sets above and a person checking a verdict should be
  // able to see the methods it was made from. Every methodsRegistered value
  // the report documents has a short label; one it does not is printed as
  // the raw Graph value rather than dropped, so a method Microsoft adds later
  // shows up as a name to look up instead of a hole in the list.
  //   learn.microsoft.com/graph/api/resources/userregistrationdetails
  const METHOD_LABELS = {
    mobilePhone: "Phone (mobile)",
    alternateMobilePhone: "Phone (alternate mobile)",
    officePhone: "Phone (office)",
    microsoftAuthenticatorPush: "Authenticator push",
    microsoftAuthenticatorPasswordless: "Authenticator passwordless",
    softwareOneTimePasscode: "Software TOTP",
    hardwareOneTimePasscode: "Hardware OATH token",
    temporaryAccessPass: "Temporary Access Pass",
    passKeyDeviceBound: "Passkey (device-bound)",
    passKeyDeviceBoundAuthenticator: "Passkey (Authenticator)",
    passKeyDeviceBoundWindowsHello: "Passkey (Windows Hello)",
    windowsHelloForBusiness: "Windows Hello for Business",
    fido2SecurityKey: "FIDO2 security key",
    macOsSecureEnclaveKey: "macOS Secure Enclave key",
    email: "Email (SSPR only)",
    securityQuestion: "Security questions (SSPR only)",
    password: "Password",
  };
  // The same value in both dialects of the default-method field, so the
  // default can be marked in the list whatever the report chose to call it.
  const DEFAULT_ALIASES = {
    sms: "mobilePhone", voiceMobile: "mobilePhone", voiceAlternateMobile: "alternateMobilePhone",
    voiceOffice: "officePhone", push: "microsoftAuthenticatorPush", oath: "softwareOneTimePasscode",
    microsoftAuthenticatorPush: "microsoftAuthenticatorPush",
  };
  const methodLabel = (m) => METHOD_LABELS[m] || String(m);
  // Which registered method the default field points at, if any: a method
  // name, or null when the field is empty or names something not registered
  // (the report can say "sms" for a user whose phone was since removed).
  function defaultOf(rec) {
    if (!rec) return null;
    const d = String(rec.defaultMethod || "");
    if (!d) return null;
    const m = rec.methods || [];
    if (m.includes(d)) return d;
    const a = DEFAULT_ALIASES[d];
    return a && m.includes(a) ? a : null;
  }
  // One list for the exports: labels, the default first and marked, the rest
  // in the report's own order. Password is left out of the MFA picture — it
  // is not a second factor and every user has one.
  function methodsList(rec) {
    if (!rec || rec.methods === null) return null;   // not read → not a list
    const m = (rec.methods || []).filter((x) => x !== "password");
    const d = defaultOf(rec);
    const rest = m.filter((x) => x !== d);
    return (d ? [{ m: d, label: methodLabel(d), isDefault: true }] : [])
      .concat(rest.map((x) => ({ m: x, label: methodLabel(x), isDefault: false })));
  }
  const methodsWord = (rec) => {
    const L = methodsList(rec);
    if (L === null) return "?";
    if (!L.length) return "none";
    return L.map((x) => x.isDefault ? `${x.label} (default)` : x.label).join("; ");
  };

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
    if (!rec) return { risk: "unknown", sms: null, voice: null, pr: null, phoneOnly: null, phoneDefault: null, methods: null };
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
    return { risk, sms, voice, pr, phoneOnly, phoneDefault, methods: m.slice() };
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
      const c = ctx.reg ? classify(rec) : { risk: "unknown", sms: null, voice: null, pr: null, phoneOnly: null, phoneDefault: null, methods: null };
      return { ...u, ...c, defaultMethod: rec ? rec.defaultMethod || "" : "" };
    });
    rows.sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk] || String(a.upn).localeCompare(String(b.upn)));
    const n = (k) => rows.filter((r) => r.risk === k).length;
    const anyEnabled = (ctx.sms || {}).state === "enabled" || (ctx.voice || {}).state === "enabled";
    return {
      rows, anyEnabled,
      campaignState: ctx.campaignState,
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
    if (res.si) L.push(`Last 5 interactive sign-ins read for ${res.si.read} of ${res.si.asked} phone user${res.si.asked === 1 ? "" : "s"}${res.si.capped ? " (capped)" : ""}: **${res.si.phoneUsed} used a text message or phone call** in at least one of them · ${res.si.noPhone} signed in without the phone · ${res.si.none} have no sign-in in the log window (30 days on P1/P2). The CSV and HTML exports carry every sign-in with the authentication used.`, "");
    if (res.rows.length) {
      const withSi = !!res.si;
      L.push("| User | Name | Enabled | SMS scope | Voice scope | Via | SMS reg. | Voice reg. | Phishing-resistant | Methods registered | Phone role | Verdict |" + (withSi ? " Last 5 sign-ins |" : ""),
        "|---|---|---|---|---|---|---|---|---|---|---|---|" + (withSi ? "---|" : ""));
      const yn = (v) => v === null ? "?" : v ? "yes" : "no";
      for (const r of res.rows.slice(0, MD_ROW_CAP))
        L.push(`| ${r.upn} | ${r.name || ""} | ${r.enabled === false ? "no" : r.enabled === true ? "yes" : "?"} | ${r.inSms ? "yes" : "no"} | ${r.inVoice ? "yes" : "no"} | ${(r.via || []).join("; ")} | ${yn(r.sms)} | ${yn(r.voice)} | ${yn(r.pr)} | ${methodsWord(r)} | ${phoneRole(r)} | ${RISK_WORD[r.risk]} |${withSi ? ` ${siWord(r)} |` : ""}`);
      if (res.rows.length > MD_ROW_CAP) L.push("", `…and ${res.rows.length - MD_ROW_CAP} more — the CSV export carries the full list.`);
      L.push("");
    }
    L.push("## What to do", "",
      `1. Move users to passkeys before ${DATES.retire.label} — [plan a passkey deployment](https://learn.microsoft.com/entra/identity/authentication/how-to-deploy-phishing-resistant-passwordless-authentication) and [enable passkeys (FIDO2)](https://learn.microsoft.com/entra/identity/authentication/how-to-authentication-passkeys-fido2).`,
      "2. A regulatory need for SMS/voice? A customer-managed telecom provider can be configured through the Microsoft Security Store (selectable from 30 October 2026).",
      "3. Tell the users — [Microsoft's communication templates](https://aka.ms/mfatemplates), scoped to the people this report names.", "",
      "Links: [retirement notice](https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement) · [FAQ](https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement-faq) · [Microsoft's scope script](https://github.com/microsoft/entra-sms-voice-usage-analyzer)", "");
    return L.join("\n");
  }

  function toCsv(res) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const yn = (v) => v === null ? "" : v ? "yes" : "no";
    const L = ["userPrincipalName,displayName,accountEnabled,inSmsScope,inVoiceScope,via,smsRegistered,voiceRegistered,phishingResistantRegistered,methodsRegistered,methodsRegisteredLabels,phoneIsOnlyMfaMethod,phoneIsDefaultMethod,defaultMethod,verdict,signInsRead,signInsWithPhone,lastSignIn,last5SignIns"];
    for (const r of res.rows)
      L.push([q(r.upn), q(r.name), r.enabled === false ? "no" : r.enabled === true ? "yes" : "",
        r.inSms ? "yes" : "no", r.inVoice ? "yes" : "no", q((r.via || []).join("; ")),
        yn(r.sms), yn(r.voice), yn(r.pr),
        q(r.methods === null ? "" : r.methods.join("; ")), q(r.methods === null ? "" : methodsWord(r)),
        yn(r.phoneOnly), yn(r.phoneDefault), q(r.defaultMethod), q(RISK_WORD[r.risk]),
        r.signins == null ? "" : r.signins.length, r.signins == null ? "" : r.siPhone, q(r.siLast || ""), q(siLines(r))].join(","));
    return L.join("\n");
  }


  // ---- the last sign-ins (1.8.0) ------------------------------------------
  // Registration says what a user COULD sign in with; the sign-in log says
  // what they actually DID. The wiring reads, per phone user, the newest five
  // interactive sign-ins (auditLogs/signIns, userId filter, newest first) and
  // hands the raw records here. authenticationDetails holds one entry per
  // step — "Password", "Text message", "Mobile app notification", "Previously
  // satisfied"… — and mfaDetail.authMethod (beta) the MFA method by name.
  // A phone step is a text message or a call; Authenticator's "phone sign-in"
  // and "mobile app notification" are not, whatever the word phone suggests.
  const PHONE_AUTH = /text message|\bsms\b|phone call|voice call|\bvoice\b/i;
  const NOT_PHONE = /mobile app|authenticator|notification|oath|phone sign-in/i;
  const isPhoneAuth = (m) => PHONE_AUTH.test(String(m || "")) && !NOT_PHONE.test(String(m || ""));

  function summarizeSignIn(si) {
    const det = Array.isArray(si && si.authenticationDetails) ? si.authenticationDetails : [];
    const methods = [], failedSteps = [];
    for (const d of det) {
      const m = String(d.authenticationMethod || "").trim();
      if (!m) continue;
      if (d.succeeded === false) { if (!failedSteps.includes(m)) failedSteps.push(m); }
      else if (!methods.includes(m)) methods.push(m);
    }
    const mfa = si && si.mfaDetail && si.mfaDetail.authMethod;
    if (mfa && !methods.includes(mfa) && !failedSteps.includes(mfa)) methods.push(String(mfa));
    const st = (si && si.status) || {};
    const loc = (si && si.location) || {};
    const dev = (si && si.deviceDetail) || {};
    return {
      when: (si && si.createdDateTime) || "",
      app: (si && (si.appDisplayName || si.resourceDisplayName)) || "",
      ok: !st.errorCode,
      error: st.errorCode ? `${st.errorCode}${st.failureReason ? ` — ${st.failureReason}` : ""}` : "",
      methods, failedSteps,
      requirement: (si && si.authenticationRequirement) || "",
      // A failed text message still means the phone was what got prompted.
      phone: methods.concat(failedSteps).some(isPhoneAuth),
      ip: (si && si.ipAddress) || "",
      where: [loc.city, loc.countryOrRegion].filter(Boolean).join(", "),
      client: [dev.operatingSystem, dev.browser || (si && si.clientAppUsed)].filter(Boolean).join(" · "),
    };
  }
  const signInMethodWord = (s) => {
    const a = (s.methods || []).slice();
    for (const f of s.failedSteps || []) a.push(`${f} (failed)`);
    return a.length ? a.join(" + ") : "—";
  };
  const siStamp = (iso) => iso ? String(iso).replace("T", " ").slice(0, 16) : "";

  // byId: { userId → raw signIn records } for every user that was read; a user
  // absent from byId was not read (cap, error, disabled) and keeps signins:
  // null, which is not the same as [] — read, nothing in the log's window.
  function withSignIns(res, byId, info = {}) {
    const rows = res.rows.map((r) => {
      if (!Object.prototype.hasOwnProperty.call(byId, r.id) || byId[r.id] === null) return { ...r, signins: null, siPhone: null, siLast: "" };
      const s = (byId[r.id] || []).slice(0, 5).map(summarizeSignIn)
        .sort((a, b) => String(b.when).localeCompare(String(a.when)));
      return { ...r, signins: s, siPhone: s.filter((x) => x.phone).length, siLast: s.length ? s[0].when : "" };
    });
    const read = rows.filter((r) => r.signins !== null);
    return { ...res, rows,
      si: { read: read.length, asked: info.asked != null ? info.asked : read.length,
        capped: !!info.capped, failed: info.failed || 0, error: info.error || "",
        phoneUsed: read.filter((r) => r.siPhone > 0).length,
        noPhone: read.filter((r) => r.signins.length && !r.siPhone).length,
        none: read.filter((r) => !r.signins.length).length,
        at: info.at || new Date().toISOString() } };
  }
  // One bucket per row for the filters: phone (a phone step in the last five),
  // nophone (signed in, never with the phone), none (read, empty log window),
  // unread (not read).
  const siBucket = (r) => r.signins == null ? "unread" : !r.signins.length ? "none" : r.siPhone ? "phone" : "nophone";
  const SI_BUCKET_WORD = { phone: "phone used in last 5", nophone: "signed in without the phone", none: "no sign-in in the log", unread: "sign-ins not read" };
  const siWord = (r) => r.signins == null ? "not read" : !r.signins.length ? "none in the log"
    : `${r.siPhone}/${r.signins.length} with phone · last ${siStamp(r.siLast)}`;
  const siLines = (r) => r.signins == null ? "" : r.signins.map((s) =>
    `${siStamp(s.when)} ${s.app || "?"}: ${signInMethodWord(s)}${s.ok ? "" : ` [FAILED ${s.error}]`}`).join(" | ");

  // ---- standalone HTML with filtering --------------------------------------
  // A snapshot file anybody can open without ENCA: every row is in the page,
  // the filters only hide and show. Search, verdict, phone role, sign-in
  // bucket, a method seen in the last five sign-ins, enabled — combined with
  // AND — and a CSV of exactly the rows the filters leave.
  const hx = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HTML_RISK = { blocking: ["b", "⛔ locked out Feb 1"], migrate: ["m", "📵 migrate"], unknown: ["", "❔ unknown"], clean: ["", "➖ no phone method"], ready: ["ok", "✅ passkey-ready"] };
  const HTML_CSS = `*{box-sizing:border-box}body{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1d2433}.wrap{max-width:1500px;margin:0 auto;padding:24px}h1{font-size:22px;margin:4px 0}.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#6b7385;margin:0}.meta{color:#6b7385;font-size:12px}.card{background:#fff;border:1px solid #e3e6ec;border-radius:10px;padding:14px 16px;margin:12px 0}.kpis{display:flex;gap:10px;flex-wrap:wrap}.kpi{background:#fff;border:1px solid #e3e6ec;border-radius:10px;padding:10px 14px;min-width:130px}.kpi b{display:block;font-size:20px}.kpi span{font-size:11px;color:#6b7385}.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.filters label{display:flex;flex-direction:column;font-size:11px;color:#6b7385;gap:2px}input,select,button{font:inherit;padding:5px 8px;border:1px solid #cfd4dd;border-radius:6px;background:#fff}button{cursor:pointer}input[type=search]{min-width:240px}table{border-collapse:collapse;width:100%;background:#fff}th,td{text-align:left;padding:6px 8px;border-top:1px solid #edf0f4;vertical-align:top}th{position:sticky;top:0;background:#fafbfc;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7385;cursor:pointer;white-space:nowrap}.tag{display:inline-block;padding:1px 7px;border-radius:999px;background:#eef0f4;font-size:11px;margin:1px 3px 1px 0;white-space:nowrap}.tag.b{background:#fde3e3;color:#a11}.tag.m{background:#fff1d6;color:#8a5a00}.tag.ok{background:#dff5e6;color:#11622f}.tag.ph{background:#fde3e3;color:#a11;font-weight:600}.si{white-space:nowrap;font-size:12px}.si .d{color:#6b7385}.si.fail{color:#a11}.muted{color:#8a91a1}.count{margin-left:auto;color:#6b7385}`;

  function toHtml(res, meta = {}) {
    const s = res.summary, si = res.si;
    const methodsSeen = new Set();
    for (const r of res.rows) for (const x of r.signins || []) for (const m of (x.methods || []).concat(x.failedSteps || [])) methodsSeen.add(m);
    const regCell = (r) => {
      const L = methodsList(r);
      if (L === null) return '<span class="muted">?</span>';
      if (!L.length) return '<span class="muted">none</span>';
      return L.map((m) => `<span class="tag${/Phone/.test(m.label) ? " ph" : ""}"${m.isDefault ? ' style="font-weight:700"' : ""}>${hx(m.label)}${m.isDefault ? " ★" : ""}</span>`).join("");
    };
    const siCell = (r) => {
      if (r.signins == null) return '<span class="muted">not read</span>';
      if (!r.signins.length) return '<span class="muted">no sign-in in the log</span>';
      return r.signins.map((x) => `<div class="si${x.ok ? "" : " fail"}" title="${hx([x.client, x.where, x.ip, x.requirement, x.error].filter(Boolean).join(" · "))}"><span class="d">${hx(siStamp(x.when))}</span> ${hx(x.app || "?")} — ${
        (x.methods.length || x.failedSteps.length) ? x.methods.map((m) => `<span class="tag${isPhoneAuth(m) ? " ph" : ""}">${hx(m)}</span>`).join("") + x.failedSteps.map((m) => `<span class="tag${isPhoneAuth(m) ? " ph" : ""}" style="text-decoration:line-through">${hx(m)}</span>`).join("") : '<span class="muted">—</span>'}${x.ok ? "" : " ✗"}</div>`).join("");
    };
    const role = (r) => phoneRole(r);
    const rowsHtml = res.rows.map((r) => {
      const used = new Set();
      for (const x of r.signins || []) for (const m of (x.methods || []).concat(x.failedSteps || [])) used.add(m);
      const text = [r.upn, r.name, (r.via || []).join(" "), methodsWord(r), siLines(r)].join(" ").toLowerCase();
      const csv = [r.upn, r.name, r.enabled === false ? "no" : r.enabled === true ? "yes" : "", r.inSms ? "yes" : "no", r.inVoice ? "yes" : "no",
        methodsWord(r), role(r), RISK_WORD[r.risk], siWord(r), siLines(r)];
      const rk = HTML_RISK[r.risk];
      return `<tr data-risk="${r.risk}" data-role="${hx(role(r))}" data-si="${siBucket(r)}" data-en="${r.enabled === false ? "no" : r.enabled === true ? "yes" : "?"}" data-m="${hx([...used].join("\u001f"))}" data-t="${hx(text)}" data-last="${hx(r.siLast || "")}" data-csv="${hx(JSON.stringify(csv))}">
<td><b>${hx(r.upn)}</b>${r.name ? `<br><span class="muted">${hx(r.name)}</span>` : ""}</td>
<td>${r.enabled === false ? '<span style="color:#a11">no</span>' : r.enabled === true ? "yes" : "?"}</td>
<td>${[r.inSms ? "SMS" : "", r.inVoice ? "Voice" : ""].filter(Boolean).join(" · ") || "—"}</td>
<td style="min-width:200px">${regCell(r)}</td>
<td>${hx(role(r))}</td>
<td><span class="tag ${rk[0]}">${hx(rk[1])}</span></td>
<td>${r.signins == null ? '<span class="muted">—</span>' : r.signins.length ? `<b>${r.siPhone}</b>/${r.signins.length}` : "0"}</td>
<td style="min-width:380px">${siCell(r)}</td></tr>`;
    }).join("\n");
    const opt = (v, l) => `<option value="${hx(v)}">${hx(l)}</option>`;
    const kpi = (n, l) => `<div class="kpi"><b>${Number(n).toLocaleString("en")}</b><span>${hx(l)}</span></div>`;
    const stamp = new Date(meta.now || Date.now()).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${hx(`SMS & voice users — ${meta.tenantName || "tenant"}`)}</title><style>${HTML_CSS}</style></head><body><div class="wrap">
<p class="eyebrow">Entra · SMS &amp; voice retirement · users and their last sign-ins</p><h1>${hx(meta.tenantName || "SMS & voice users")}</h1>
<p class="meta">Generated ${hx(stamp)}${meta.build ? ` · ${hx(meta.build)}` : ""} · ENCA T33 · SMS policy ${hx(stateWord((res.sms || {}).state))} · Voice policy ${hx(stateWord((res.voice || {}).state))} · SMS/voice delivery retires ${hx(DATES.retire.label)}</p>
<div class="kpis">${kpi(s.total, "users in scope")}${res.regRead ? kpi(s.phone, "phone registered") + kpi(s.blocking, "phone is the only MFA") + kpi(s.phoneDefault, "phone is the default") : ""}${si ? kpi(si.phoneUsed, "used the phone in their last 5") + kpi(si.noPhone, "signed in without the phone") + kpi(si.none, "no sign-in in the log") : ""}</div>
<div class="card"><p class="meta" style="margin:0">${si
  ? `Last 5 interactive sign-ins read for ${si.read.toLocaleString("en")} of ${si.asked.toLocaleString("en")} user${si.asked === 1 ? "" : "s"} (enabled accounts with a phone method registered${res.regRead ? "" : " — registration not read, so everyone in scope"})${si.capped ? " — capped, the rest are marked not read" : ""}${si.failed ? ` · ${si.failed} read${si.failed === 1 ? "" : "s"} failed` : ""}. The sign-in log keeps 30 days on Entra ID P1/P2: no sign-in means none in that window, not never. A phone step is a text message or a phone call; a struck-through method is a step that failed. Hover a sign-in for client, location, IP and error.`
  : "Sign-ins were not read for this export — run ⌚ Last 5 sign-ins in ENCA first to fill the last two columns."}${res.usersPartial ? " The user read was capped — the list is partial." : ""}</p></div>
<div class="card filters">
<label>Search<input type="search" id="q" placeholder="UPN, name, app, method…"></label>
<label>Verdict<select id="fRisk">${opt("", "All")}${["blocking", "migrate", "ready", "clean", "unknown"].map((k) => opt(k, HTML_RISK[k][1])).join("")}</select></label>
<label>Phone role<select id="fRole">${opt("", "All")}${["only method", "default", "backup", "—", "?"].map((k) => opt(k, k)).join("")}</select></label>
<label>Last 5 sign-ins<select id="fSi">${opt("", "All")}${Object.entries(SI_BUCKET_WORD).map(([k, v]) => opt(k, v)).join("")}</select></label>
<label>Method used<select id="fM">${opt("", "Any")}${[...methodsSeen].sort().map((m) => opt(m, m)).join("")}</select></label>
<label>Enabled<select id="fEn">${opt("", "All")}${opt("yes", "yes")}${opt("no", "no")}</select></label>
<button id="reset">✕ Reset</button><button id="csv">⭳ CSV of shown rows</button>
<span class="count" id="count"></span></div>
<div class="card" style="padding:0;overflow:auto"><table id="t"><thead><tr><th data-k="upn">User</th><th>Enabled</th><th>Policy</th><th>Methods registered</th><th>Phone role</th><th data-k="risk">Verdict</th><th data-k="ph" title="Sign-ins with a phone step / sign-ins read">Phone</th><th data-k="last">Last 5 sign-ins (newest first, UTC) · authentication used</th></tr></thead><tbody>
${rowsHtml}
</tbody></table></div>
<p class="meta">A read-only snapshot. It names users and where they sign in from — share it like the tenant data it is.</p>
</div><script>
(function(){var $=function(i){return document.getElementById(i)};var rows=[].slice.call(document.querySelectorAll('#t tbody tr'));
function apply(){var q=$('q').value.trim().toLowerCase(),r=$('fRisk').value,ro=$('fRole').value,s=$('fSi').value,m=$('fM').value,e=$('fEn').value,n=0;
rows.forEach(function(tr){var d=tr.dataset,ok=(!q||d.t.indexOf(q)>=0)&&(!r||d.risk===r)&&(!ro||d.role===ro)&&(!s||d.si===s)&&(!e||d.en===e)&&(!m||d.m.split('\\u001f').indexOf(m)>=0);tr.style.display=ok?'':'none';if(ok)n++;});
$('count').textContent=n+' of '+rows.length+' users shown';}
['q','fRisk','fRole','fSi','fM','fEn'].forEach(function(i){$(i).addEventListener('input',apply);});
$('reset').addEventListener('click',function(){['q','fRisk','fRole','fSi','fM','fEn'].forEach(function(i){$(i).value='';});apply();});
var RANK={blocking:0,migrate:1,unknown:2,clean:3,ready:4},dir={};
[].forEach.call(document.querySelectorAll('th[data-k]'),function(th){th.addEventListener('click',function(){var k=th.dataset.k;dir[k]=-(dir[k]||-1);var tb=$('t').tBodies[0];
var key=function(tr){var d=tr.dataset;return k==='risk'?RANK[d.risk]:k==='last'?d.last:k==='ph'?(d.si==='phone'?0:d.si==='nophone'?1:d.si==='none'?2:3):d.t;};
rows.sort(function(a,b){var x=key(a),y=key(b);return (x<y?-1:x>y?1:0)*dir[k];}).forEach(function(tr){tb.appendChild(tr);});});});
$('csv').addEventListener('click',function(){var q=function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';};
var L=['userPrincipalName,displayName,accountEnabled,inSmsScope,inVoiceScope,methodsRegistered,phoneRole,verdict,lastSignInsSummary,lastSignIns'];
rows.forEach(function(tr){if(tr.style.display!=='none')L.push(JSON.parse(tr.dataset.csv).map(q).join(','));});
var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+L.join('\\r\\n')],{type:'text/csv'}));a.download='SmsVoice-users-filtered.csv';a.click();});
apply();})();
</script></body></html>`;
  }

  return { DATES, daysUntil, parseScope, classify, phoneRole, analyze, toMd, toCsv, notifyEmail, stateWord, campaignWord, RISK_WORD, MD_ROW_CAP,
    METHOD_LABELS, methodLabel, defaultOf, methodsList, methodsWord,
    isPhoneAuth, summarizeSignIn, signInMethodWord, withSignIns, siBucket, siWord, siLines, SI_BUCKET_WORD, toHtml };
})();
