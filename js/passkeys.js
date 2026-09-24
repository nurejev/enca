// ======================================================================
// 🔑 Passkeys — "our policies REQUIRE a passkey: can those people get one?"
//
// Mihai, 24 Sep: "in enca we required passkey, we need a check if passkeys
// are configured and with which settings, an option to configure it". On the
// mockup he chose a tab in 🛡 Checks, a Configure panel for the WHOLE method
// (state, targets, self-service, passkey profiles) and the TAP bootstrap as a
// finding only.
//
// The question starts from the POLICIES, not from the method: a policy
// requires a passkey when its grant is an authentication strength whose every
// allowed combination is phishing-resistant (fido2, windowsHelloForBusiness,
// x509CertificateMultiFactor) and fido2 is one of them — and no other grant
// control is offered beside it under OR. Then the Passkey (FIDO2) method in
// the authentication methods policy is asked whether the SAME people can
// register and use one.
//
// Reads (all by the app, on ▶ — this module is PURE, no DOM, no Graph):
//   GET v1.0 /policies/authenticationMethodsPolicy/authenticationMethodConfigurations/fido2
//        Policy.Read.All — ALWAYS v1.0: passkeyProfiles and
//        allowedPasskeyProfiles are v1.0 shapes; beta names them differently
//   the authentication methods policy the app already caches (TAP and
//        certificate-based auth state)
//   GET /policies/authenticationStrengthPolicies?$expand=combinationConfigurations
//   GET /groups/{id}/transitiveMembers/microsoft.graph.user?$select=id
//   GET /directoryRoles(roleTemplateId='{id}')/members/microsoft.graph.user
//        Directory.Read.All — ACTIVE role holders only; PIM-eligible ones are
//        not members until they activate, and the text says so
//
// Write (the app, from ✎ Configure, after a diff and an impact list):
//   PATCH v1.0 …/authenticationMethodConfigurations/fido2
//        Policy.ReadWrite.AuthenticationMethod, role Authentication Policy
//        Administrator. includeTargets, excludeTargets and passkeyProfiles
//        are sent WHOLE when they change (Graph replaces the collection).
//
// Facts this module leans on (Microsoft Learn, how-to-authentication-passkeys-fido2):
//   - an EXCLUDED group wins over every include: blocked from registration
//     AND sign-in with a passkey
//   - "Allow self-service set up" is tenant-wide, not per profile; No means
//     nobody can register a passkey in Security info
//   - a user in several profiles may use a passkey that satisfies ANY one
//   - key restrictions apply to registration AND sign-in: removing an allowed
//     AAGUID stops keys already registered; unticking Synced stops synced
//     passkeys already registered
//   - without attestation an AAGUID list is a guide, not a control
//   - up to three profiles including the Default; opting in is one-way
//   - isAttestationEnforced / keyRestrictions on the method itself are
//     deprecated (removed October 2027) — the legacy, not-opted-in shape
//   - registering needs MFA in the last five minutes: someone required a
//     passkey to register security info, with none yet, needs a TAP
// ======================================================================
const Passkeys = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const V1 = "https://graph.microsoft.com/v1.0";
  const FIDO2_PATH = "/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/fido2";
  const WRITE_SCOPES = ["Policy.ReadWrite.AuthenticationMethod"];
  const ODATA = "#microsoft.graph.fido2AuthenticationMethodConfiguration";
  const ALL = "all_users";
  const DEFAULT_PROFILE = "00000000-0000-0000-0000-000000000001";
  const LEGACY = "legacy";
  const MAX_PROFILES = 3;
  const REG_ACTION = "urn:user:registersecurityinfo";
  const PR = new Set(["fido2", "windowshelloforbusiness", "x509certificatemultifactor"]);
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SEV_RANK = { high: 0, medium: 1, info: 2, ok: 3 };
  const SEV_LABEL = { high: "Blocks", medium: "Warning", info: "Info", ok: "OK" };
  const COMBO_LABEL = { fido2: "Passkey (FIDO2)", windowshelloforbusiness: "Windows Hello for Business", x509certificatemultifactor: "Certificate (multifactor)" };
  // AAGUIDs worth a name on screen and one-click in the editor. The
  // Authenticator pair is Microsoft's own list (how-to-enable-authenticator-
  // passkey); the rest are vendor-published values.
  const PRESETS = {
    authenticator: { label: "Microsoft Authenticator", aaguids: {
      "de1e552d-db1d-4423-a619-566b625cdc84": "Authenticator for Android",
      "90a3ccdf-635c-4729-a248-9b709135078f": "Authenticator for iOS",
    } },
    windowsHello: { label: "Windows Hello", aaguids: {
      "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello Hardware Authenticator",
      "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello VBS Hardware Authenticator",
      "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello Software Authenticator",
    } },
    yubikey5: { label: "YubiKey 5 series", aaguids: {
      "cb69481e-8ff7-4039-93ec-0a2729a154a8": "YubiKey 5 (USB-A, No NFC)",
      "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5 NFC / 5C NFC",
      "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "YubiKey 5 NFC (FIPS)",
    } },
  };
  const AAGUID_NAME = Object.assign({}, ...Object.values(PRESETS).map((p) => p.aaguids));
  const aagName = (a) => AAGUID_NAME[String(a).toLowerCase()] || String(a);
  const low = (s) => String(s || "").toLowerCase();
  const uniq = (a) => [...new Set(a)];
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;

  // ---- the method ------------------------------------------------------------
  // passkeyTypes arrives as "deviceBound,synced" (a flags enum) — or, from a
  // client that serialised it as an array, as one. Both read the same.
  function typesOf(v) {
    const a = Array.isArray(v) ? v : String(v || "").split(",");
    return uniq(a.map((x) => x.trim()).filter((x) => x === "deviceBound" || x === "synced"));
  }
  function krOf(k) {
    return { on: !!(k && k.isEnforced), type: (k && k.enforcementType) === "allow" ? "allow" : "block",
      aaguids: uniq(((k && k.aaGuids) || []).map(low).filter(Boolean)) };
  }
  // A profile in ENCA's shape. The legacy (not opted in) method becomes one
  // virtual profile with the tenant-wide settings — Microsoft: with attestation
  // off, synced passkeys are already allowed; with it on, only attested
  // device-bound keys can register.
  function profilesOf(f) {
    const list = (f && Array.isArray(f.passkeyProfiles)) ? f.passkeyProfiles : [];
    if (list.length) {
      return { optedIn: true, list: list.map((p) => ({ id: p.id, name: p.name || p.id, types: typesOf(p.passkeyTypes),
        attest: p.attestationEnforcement === "registrationOnly", kr: krOf(p.keyRestrictions), isDefault: p.id === DEFAULT_PROFILE })) };
    }
    const attest = !!(f && f.isAttestationEnforced);
    return { optedIn: false, list: [{ id: LEGACY, name: "Tenant-wide settings", types: attest ? ["deviceBound"] : ["deviceBound", "synced"],
      attest, kr: krOf(f && f.keyRestrictions), isDefault: true, legacy: true }] };
  }
  function targetsOf(f, prof) {
    const inc = ((f && f.includeTargets) || []).map((t) => ({ id: t.id, all: t.id === ALL,
      reg: !!t.isRegistrationRequired,
      profiles: prof.optedIn ? ((t.allowedPasskeyProfiles || []).length ? t.allowedPasskeyProfiles.map(String) : [DEFAULT_PROFILE]) : [LEGACY] }));
    const exc = ((f && f.excludeTargets) || []).map((t) => ({ id: t.id }));
    return { include: inc, exclude: exc };
  }
  // Does a key-restriction set let this AAGUID through?
  function keyAllows(kr, a) {
    if (!kr || !kr.on) return true;
    const hit = kr.aaguids.includes(low(a));
    return kr.type === "allow" ? hit : !hit;
  }
  // Can ANY passkey satisfy both this profile and a strength's AAGUID list?
  // null list = the strength does not restrict passkeys.
  function profileMeets(p, strengthAag) {
    if (!p.types.length) return false;
    if (!strengthAag) return !(p.kr.on && p.kr.type === "allow" && !p.kr.aaguids.length);
    return strengthAag.some((a) => keyAllows(p.kr, a));
  }

  // ---- the policies ------------------------------------------------------------
  function strengthAaguids(s) {
    const c = ((s && s.combinationConfigurations) || []).find((x) => low(x["@odata.type"]).includes("fido2")
      && ((x.appliesToCombinations || []).map(low).includes("fido2")));
    return c && (c.allowedAAGUIDs || []).length ? uniq(c.allowedAAGUIDs.map(low)) : null;
  }
  // What a policy asks of passkeys, or null when it does not REQUIRE one.
  function requirement(p, strengths) {
    if (!p || p.state === "disabled") return null;
    const g = p.grantControls || {};
    const ref = g.authenticationStrength;
    if (!ref || !ref.id) return null;
    // Under OR, any other grant control is a way around the strength.
    const others = (g.builtInControls || []).filter((c) => c !== "block").concat(g.customAuthenticationFactors || []);
    if (low(g.operator) === "or" && others.length) return null;
    const s = (strengths && strengths.get(ref.id)) || ref;
    const combos = (s.allowedCombinations || ref.allowedCombinations || []).map(low);
    if (!combos.length || !combos.includes("fido2") || !combos.every((c) => PR.has(c))) return null;
    const apps = (p.conditions && p.conditions.applications) || {};
    return { strengthId: ref.id, strength: s.displayName || ref.displayName || ref.id, combos,
      alternatives: combos.filter((c) => c !== "fido2"), aaguids: strengthAaguids(s),
      registration: (apps.includeUserActions || []).map(low).includes(REG_ACTION) };
  }

  // ---- who ---------------------------------------------------------------------
  // members: { groups: { id: { ids: [...], complete } | null }, roles: { templateId: … } }
  // A missing or null entry is UNRESOLVED — named in the text, never guessed.
  function setOf(kind, id, members, unresolved) {
    const m = members && members[kind] && members[kind][id];
    if (!m) { unresolved.push({ kind, id }); return new Set(); }
    if (m.complete === false) unresolved.push({ kind, id, partial: true });
    return new Set(m.ids || []);
  }
  function scopeOf(p, members) {
    const u = (p.conditions && p.conditions.users) || {};
    const unresolved = [];
    const all = (u.includeUsers || []).includes("All");
    const inc = new Set();
    for (const id of (u.includeUsers || []).filter((x) => GUID.test(x))) inc.add(id);
    for (const g of u.includeGroups || []) for (const x of setOf("groups", g, members, unresolved)) inc.add(x);
    for (const r of u.includeRoles || []) for (const x of setOf("roles", r, members, unresolved)) inc.add(x);
    const exc = new Set();
    const excUnresolved = [];
    for (const id of (u.excludeUsers || []).filter((x) => GUID.test(x))) exc.add(id);
    for (const g of u.excludeGroups || []) for (const x of setOf("groups", g, members, excUnresolved)) exc.add(x);
    for (const r of u.excludeRoles || []) for (const x of setOf("roles", r, members, excUnresolved)) exc.add(x);
    const guests = !!u.includeGuestsOrExternalUsers;
    return { all, inc, exc, guests, unresolved, excGroups: new Set(u.excludeGroups || []), incGroups: u.includeGroups || [], incRoles: u.includeRoles || [] };
  }

  // ---- analyse -----------------------------------------------------------------
  // input: { fido2, fido2Ok, error, methods (the cached methods policy),
  //          strengths: [..], members, names }
  function analyze(input, policies, opts) {
    const I = input || {};
    const names = I.names || {};
    const nm = (id) => id === ALL ? "All users" : (names[id] || id);
    const f = I.fido2 || null;
    const findings = [];
    const add = (sev, key, title, text, extra) => findings.push({ sev, key, title, text, policies: [], ...(extra || {}) });
    const strengths = new Map((I.strengths || []).map((s) => [s.id, s]));
    const methodCfgs = (I.methods && I.methods.authenticationMethodConfigurations) || [];
    const methodState = (id) => { const c = methodCfgs.find((x) => low(x.id) === low(id)); return c ? c.state : null; };

    const prof = profilesOf(f);
    const tg = targetsOf(f, prof);
    const enabled = !!f && f.state === "enabled";
    const selfService = !!f && f.isSelfServiceRegistrationAllowed !== false;
    const methodAll = tg.include.some((t) => t.all);
    const incGroups = tg.include.filter((t) => !t.all);
    const mUnres = [];
    const methodInc = new Set();
    const memberOfTarget = new Map();   // group id -> Set of user ids
    for (const t of incGroups) { const s = setOf("groups", t.id, I.members, mUnres); memberOfTarget.set(t.id, s); for (const x of s) methodInc.add(x); }
    const methodExc = new Set();
    const excSets = new Map();
    for (const t of tg.exclude) { const s = setOf("groups", t.id, I.members, mUnres); excSets.set(t.id, s); for (const x of s) methodExc.add(x); }
    const profById = new Map(prof.list.map((p) => [p.id, p]));
    const allTarget = tg.include.find((t) => t.all);
    const allProfiles = allTarget ? allTarget.profiles.map((id) => profById.get(id)).filter(Boolean) : [];
    // the profiles a given user is in: the All users target's, plus every group target holding them
    const profilesForUser = (uid) => {
      const out = [...allProfiles];
      for (const t of incGroups) if ((memberOfTarget.get(t.id) || new Set()).has(uid)) for (const id of t.profiles) { const p = profById.get(id); if (p) out.push(p); }
      return uniq(out);
    };

    const usersOf = (id) => (((raw(policies, id).conditions) || {}).users) || {};
    const polGroups = (id) => (usersOf(id).includeGroups || []).filter((g) => GUID.test(g));
    const polRoles = (id) => usersOf(id).includeRoles || [];
    const required = [];
    for (const raw of policies || []) {
      const req = requirement(raw, strengths);
      if (!req) continue;
      const sc = scopeOf(raw, I.members);
      const name = raw.displayName || raw.id;
      const row = { id: raw.id, name, state: raw.state, ...req, all: sc.all, guests: sc.guests, unresolved: sc.unresolved,
        requiredN: sc.all ? null : [...sc.inc].filter((x) => !sc.exc.has(x)).length,
        uncovered: [], excluded: [], noKey: [], allUncoveredGroups: [], excludedGroups: [], allNoKey: false };
      if (!sc.all) {
        const R = [...sc.inc].filter((x) => !sc.exc.has(x));
        for (const uid of R) {
          if (methodExc.has(uid)) { row.excluded.push(uid); continue; }
          if (!methodAll && !methodInc.has(uid)) { row.uncovered.push(uid); continue; }
          if (!profilesForUser(uid).some((p) => profileMeets(p, req.aaguids))) row.noKey.push(uid);
        }
      } else {
        // Everyone is in scope: name the gaps by GROUP, since "everyone" cannot be counted here.
        if (!methodAll) row.allUncoveredGroups = incGroups.map((t) => t.id);
        for (const t of tg.exclude) if (!sc.excGroups.has(t.id)) {
          const left = [...(excSets.get(t.id) || [])].filter((x) => !sc.exc.has(x));
          if (left.length || !(I.members && I.members.groups && I.members.groups[t.id])) row.excludedGroups.push({ id: t.id, n: left.length, resolved: !!(I.members && I.members.groups && I.members.groups[t.id]) });
        }
        if (methodAll && allProfiles.length && !allProfiles.some((p) => profileMeets(p, req.aaguids))) row.allNoKey = true;
      }
      required.push(row);
    }
    const polName = (r) => r.name;
    const reqEnforced = required.filter((r) => r.state === "enabled");
    const sevFor = (rows) => rows.some((r) => r.state === "enabled") ? "high" : "medium";
    const altNote = (r) => r.alternatives.length
      ? ` The strength also accepts ${r.alternatives.map((c) => COMBO_LABEL[c] || c).join(" and ")}, so anyone with ${r.alternatives.length === 1 ? "that" : "one of those"} registered still gets in.`
      : " The strength accepts nothing but a passkey.";

    // 0. could not read
    if (!f) {
      add("medium", "unread", "The Passkey (FIDO2) method could not be read", `Nothing below judges the method.${I.error ? ` ${I.error}` : ""}`);
    }
    // 1. the method is off
    if (f && !enabled && required.length) {
      add(sevFor(required), "disabled", "Passkeys are required, but the Passkey (FIDO2) method is disabled",
        `Nobody can register or sign in with a passkey while the method is off, and ${plural(required.length, "policy", "policies")} require${required.length === 1 ? "s" : ""} one.`,
        { policies: required.map(polName), fix: { kind: "enable" } });
    }
    if (f && enabled) {
      // 2. required, not targeted
      for (const r of required) {
        if (r.uncovered.length) {
          add(r.state === "enabled" ? "high" : "medium", "uncovered:" + r.id, `Required, but not targeted by the passkey method — ${r.name}`,
            `${plural(r.uncovered.length, "user")} in this policy's scope ${r.uncovered.length === 1 ? "is" : "are"} in none of the method's include targets, so ${r.uncovered.length === 1 ? "they cannot" : "they cannot"} register a passkey.${polRoles(r.id).length ? " The policy names directory roles, and a role cannot be a method target — target a group that holds those admins." : ""}${altNote(r)}`,
            { policies: [r.name], users: r.uncovered, fix: polGroups(r.id).length ? { kind: "addTargets", groups: polGroups(r.id) } : { kind: "editTargets" } });
        }
        if (r.allUncoveredGroups.length || (r.all && !methodAll)) {
          add(r.state === "enabled" ? "high" : "medium", "alluncovered:" + r.id, `All users are required a passkey, the method targets only groups — ${r.name}`,
            `The policy includes All users; the method targets ${r.allUncoveredGroups.length ? r.allUncoveredGroups.map(nm).join(", ") : "nobody"}. Everyone outside ${r.allUncoveredGroups.length === 1 ? "that group" : "those groups"} cannot register a passkey.${altNote(r)}`,
            { policies: [r.name], fix: { kind: "addAll" } });
        }
        // 3. excluded from passkeys, required one
        if (r.excluded.length) {
          add(r.state === "enabled" ? "high" : "medium", "excluded:" + r.id, `Excluded from passkeys, required one — ${r.name}`,
            `${plural(r.excluded.length, "user")} in this policy's scope ${r.excluded.length === 1 ? "is" : "are"} in an excluded group of the method. The exclusion wins over every include: no passkey registration and no passkey sign-in.${altNote(r)}`,
            { policies: [r.name], users: r.excluded });
        }
        for (const g of r.excludedGroups) {
          add(r.state === "enabled" ? "high" : "medium", `exclgroup:${r.id}:${g.id}`, `Excluded from passkeys, required one — ${r.name}`,
            `The method excludes ${nm(g.id)}${g.resolved ? ` (${plural(g.n, "member")} not excluded by this policy)` : ""}; the policy includes All users and does not exclude that group. Those members are required a passkey they cannot register or use.${altNote(r)}`,
            { policies: [r.name], fix: { kind: "editExclude" } });
        }
        // 4. strength and profile allow no common key
        if (r.noKey.length || r.allNoKey) {
          add(r.state === "enabled" ? "high" : "medium", "nokey:" + r.id, `Strength and passkey profile allow no common key — ${r.name}`,
            `The strength "${r.strength}" ${r.aaguids ? `accepts only ${r.aaguids.map(aagName).join(", ")}` : "accepts any passkey"}; the passkey profile${r.allNoKey ? " of the All users target" : "s"} ${r.noKey.length ? `of ${plural(r.noKey.length, "user")} ` : ""}let none of those through (types, allow list or block list). No passkey satisfies both.${altNote(r)}`,
            { policies: [r.name], users: r.noKey, fix: { kind: "editProfiles" } });
        }
        // unresolved scope pieces — said, not guessed
        const unresolvedRoles = r.unresolved.filter((x) => x.kind === "roles");
        const unresolvedGroups = r.unresolved.filter((x) => x.kind === "groups");
        if (!methodAll && (unresolvedRoles.length || unresolvedGroups.length)) {
          add("medium", "unresolved:" + r.id, `Part of the scope could not be resolved — ${r.name}`,
            `${[unresolvedGroups.length ? plural(unresolvedGroups.length, "group") : "", unresolvedRoles.length ? plural(unresolvedRoles.length, "directory role") : ""].filter(Boolean).join(" and ")} (${r.unresolved.map((x) => nm(x.id) + (x.partial ? " — partly read" : "")).join(", ")}) could not be read, so their members are not counted above.`,
            { policies: [r.name] });
        }
        if (r.guests) add("info", "guests:" + r.id, `Guests in scope — ${r.name}`,
          "Guests cannot register a passkey in your tenant (Microsoft: registration is not supported for internal or external guests). What a guest can satisfy is judged in 📘 Microsoft Learn — not counted twice here.",
          { policies: [r.name] });
      }
      // 5. self-service
      if (!selfService && required.length) {
        add(sevFor(required), "selfservice", "Self-service setup is off",
          "Allow self-service set up is No: nobody can add a passkey in Security info, even where the method targets them. Only an administrator can provision one (Graph, preview). It is one tenant-wide switch, not per profile.",
          { policies: required.map(polName), fix: { kind: "selfService" } });
      }
      // 6. key restrictions without attestation
      for (const p of prof.list) {
        if (p.kr.on && !p.attest) add("medium", "weak:" + p.id, `Key restrictions on, attestation off — ${p.name}`,
          "Without attestation Entra ID cannot verify the make and model a passkey claims, so the AAGUID list is a guide, not a control. Enforce attestation for device-bound keys where the list matters.",
          { fix: { kind: "editProfiles" } });
        if (p.kr.on && p.kr.type === "allow" && !p.kr.aaguids.length) add("high", "emptyallow:" + p.id, `Allow list with nothing on it — ${p.name}`,
          "Key restrictions are on with Allow and no AAGUIDs: no passkey can register or sign in under this profile.", { fix: { kind: "editProfiles" } });
        if (p.attest && p.types.includes("synced")) add("info", "syncattest:" + p.id, `Synced passkeys with attestation enforced — ${p.name}`,
          "Synced passkeys do not support attestation. With attestation enforced, expect synced passkeys (iCloud Keychain, Google Password Manager) not to register under this profile.");
      }
      // 7. passkey profiles
      if (!prof.optedIn) add("info", "legacy", "Passkey profiles: not opted in",
        "The tenant uses the tenant-wide passkey settings. Those two properties (attestation, key restrictions) are deprecated and removed in October 2027 — opting in moves them to a Default passkey profile. Opting in cannot be undone.",
        { fix: { kind: "optIn" } });
      else if (prof.list.length >= MAX_PROFILES) add("info", "maxprofiles", `Passkey profiles: ${prof.list.length} of ${MAX_PROFILES}`,
        "Microsoft supports up to three profiles including the Default today; a new one needs another one gone first.");
      // 8. bootstrap — required a passkey to REGISTER, with none yet
      const reg = required.filter((r) => r.registration);
      const tap = methodState("TemporaryAccessPass");
      if (reg.length && tap !== "enabled") {
        add("medium", "bootstrap", "Registering security info requires a passkey — and Temporary Access Pass is " + (tap === null ? "not read" : "off"),
          "Someone with no passkey yet cannot satisfy these policies to register their first one; registering a passkey also needs MFA in the last five minutes. Microsoft's way in is a Temporary Access Pass. Enable it in Entra ID → Authentication methods → Temporary Access Pass for the people onboarding (ENCA does not write that method).",
          { policies: reg.map(polName) });
      }
      // 9. certificate alternative switched off
      const cba = methodState("X509Certificate");
      const withCba = required.filter((r) => r.alternatives.includes("x509certificatemultifactor"));
      if (withCba.length && cba && cba !== "enabled") add("info", "cba", "The strength accepts a certificate, but certificate-based auth is off",
        "Certificate (multifactor) is one of the combinations the strength allows, but the Certificate-based authentication method is disabled — so it is not a way in for anyone today.", { policies: withCba.map(polName) });
    }
    if (f && enabled && !required.length) add("info", "none", "No policy requires a passkey",
      "The method is on, but no enabled or report-only policy grants only phishing-resistant combinations with a passkey among them. Policies that merely ALLOW a passkey beside weaker methods are not listed here.");
    const blocking = findings.filter((x) => x.sev === "high").length;
    if (f && enabled && required.length && !blocking) add("ok", "ok", "Everyone required a passkey can register and use one",
      `Method on, self-service ${selfService ? "on" : "off"}, every user in scope of the ${plural(required.length, "requiring policy", "requiring policies")} is targeted, none is excluded, and a profile lets a key through that the strength accepts.`);

    findings.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
    const counts = { high: 0, medium: 0, info: 0, ok: 0 };
    for (const x of findings) counts[x.sev]++;
    return { fido2: f, enabled, selfService, optedIn: prof.optedIn, profiles: prof.list, targets: tg, required, findings, counts,
      methodUnresolved: mUnres, names, enforced: reqEnforced.length,
      readAt: (opts && opts.readAt) || Date.now(), demo: !!(opts && opts.demo), error: I.error || "" };
  }
  function raw(policies, id) { return (policies || []).find((p) => p.id === id) || { conditions: { users: {} } }; }

  // Which groups and roles the run must resolve to answer the checks.
  function wanted(fido2, policies, strengths) {
    const S = new Map((strengths || []).map((s) => [s.id, s]));
    const groups = new Set(), roles = new Set();
    for (const t of (fido2 && fido2.includeTargets) || []) if (t.id !== ALL) groups.add(t.id);
    for (const t of (fido2 && fido2.excludeTargets) || []) groups.add(t.id);
    for (const p of policies || []) {
      if (!requirement(p, S)) continue;
      const u = (p.conditions && p.conditions.users) || {};
      [...(u.includeGroups || []), ...(u.excludeGroups || [])].forEach((g) => groups.add(g));
      [...(u.includeRoles || []), ...(u.excludeRoles || [])].forEach((r) => roles.add(r));
    }
    return { groups: [...groups].filter((g) => GUID.test(g)), roles: [...roles].filter((r) => GUID.test(r)) };
  }

  // ---- the editor's draft ------------------------------------------------------
  // The draft is ENCA's shape of the method; toBody writes Graph's back.
  function draftFrom(f) {
    const prof = profilesOf(f);
    const tg = targetsOf(f, prof);
    return {
      state: f && f.state === "enabled" ? "enabled" : "disabled",
      selfService: !!f && f.isSelfServiceRegistrationAllowed !== false,
      optedIn: prof.optedIn, optIn: false,
      include: tg.include.map((t) => ({ id: t.id, reg: t.reg, profiles: prof.optedIn ? t.profiles.slice() : [] })),
      exclude: tg.exclude.map((t) => ({ id: t.id })),
      profiles: prof.list.map((p) => ({ id: p.id, name: p.name, types: p.types.slice(), attest: p.attest, kr: clone(p.kr), isDefault: p.isDefault, legacy: !!p.legacy })),
    };
  }
  // Opting in turns the tenant-wide settings into the Default profile —
  // Microsoft does the same when the banner link is clicked.
  function applyOptIn(d) {
    if (d.optedIn || d.optIn) return d;
    const l = d.profiles[0] || { types: ["deviceBound", "synced"], attest: false, kr: { on: false, type: "block", aaguids: [] } };
    d.optIn = true;
    d.profiles = [{ id: DEFAULT_PROFILE, name: "Default passkey profile", types: l.types.slice(), attest: l.attest, kr: clone(l.kr), isDefault: true, legacy: false }];
    d.include = d.include.map((t) => ({ ...t, profiles: [DEFAULT_PROFILE] }));
    return d;
  }
  const profiled = (d) => d.optedIn || d.optIn;
  function validate(d) {
    const errors = [], warnings = [];
    if (profiled(d)) {
      if (d.profiles.length > MAX_PROFILES) errors.push(`At most ${MAX_PROFILES} passkey profiles, the Default included.`);
      if (!d.profiles.some((p) => p.id === DEFAULT_PROFILE)) errors.push("The Default passkey profile cannot be removed.");
      const ids = new Set(d.profiles.map((p) => p.id));
      for (const t of d.include) {
        if (!t.profiles.length) errors.push(`${t.id === ALL ? "All users" : "A target"} has no passkey profile — pick at least one.`);
        for (const pid of t.profiles) if (!ids.has(pid)) errors.push("A target still uses a profile that is being removed — take it off the target first.");
      }
      const names = d.profiles.map((p) => low(p.name).trim());
      if (names.some((n) => !n)) errors.push("Every passkey profile needs a name.");
      if (new Set(names).size !== names.length) errors.push("Two passkey profiles have the same name.");
    }
    for (const p of d.profiles) {
      const label = p.name || "A profile";
      if (!p.types.length) errors.push(`${label}: tick Device-bound, Synced or both.`);
      if (p.kr.on && p.kr.type === "allow" && !p.kr.aaguids.length) errors.push(`${label}: Allow with an empty list lets no passkey through — add an AAGUID or turn key restrictions off.`);
      for (const a of p.kr.aaguids) if (!GUID.test(a)) errors.push(`${label}: ${a} is not an AAGUID (8-4-4-4-12 hex).`);
      if (p.attest && p.types.includes("synced")) warnings.push(`${label}: synced passkeys do not support attestation — with attestation enforced, expect them not to register.`);
      if (p.kr.on && !p.attest) warnings.push(`${label}: key restrictions without attestation are a guide, not a control.`);
    }
    if (!d.include.length && d.state === "enabled") warnings.push("The method is enabled with no include target — nobody can use a passkey.");
    return { ok: !errors.length, errors: uniq(errors), warnings: uniq(warnings) };
  }
  function profileBody(p) {
    return { id: p.id, name: p.name.trim(), passkeyTypes: p.types.join(","), attestationEnforcement: p.attest ? "registrationOnly" : "disabled",
      keyRestrictions: { isEnforced: !!p.kr.on, enforcementType: p.kr.type, aaGuids: p.kr.aaguids.slice() } };
  }
  function includeBody(d) {
    return d.include.map((t) => profiled(d)
      ? { targetType: "group", id: t.id, isRegistrationRequired: !!t.reg, allowedPasskeyProfiles: t.profiles.slice() }
      : { targetType: "group", id: t.id, isRegistrationRequired: !!t.reg });
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // The PATCH body: only what changed, with every changed collection whole.
  function toBody(before, d) {
    const b = draftFrom(before);
    const body = { "@odata.type": ODATA };
    if (b.state !== d.state) body.state = d.state;
    if (b.selfService !== d.selfService) body.isSelfServiceRegistrationAllowed = d.selfService;
    const incNow = includeBody(d);
    if (!same(includeBody(b), incNow) || d.optIn) body.includeTargets = incNow;
    const excNow = d.exclude.map((t) => ({ targetType: "group", id: t.id }));
    if (!same(b.exclude.map((t) => ({ targetType: "group", id: t.id })), excNow)) body.excludeTargets = excNow;
    if (profiled(d)) {
      const now = d.profiles.map(profileBody);
      if (d.optIn || !same(b.profiles.map(profileBody), now)) body.passkeyProfiles = now;
    } else {
      const l = d.profiles[0], bl = b.profiles[0];
      if (l.attest !== bl.attest) body.isAttestationEnforced = l.attest;
      if (!same(l.kr, bl.kr)) body.keyRestrictions = { isEnforced: !!l.kr.on, enforcementType: l.kr.type, aaGuids: l.kr.aaguids.slice() };
    }
    return body;
  }
  const changed = (body) => Object.keys(body).some((k) => k !== "@odata.type");
  // The method as it would read after the PATCH — the same analysis runs on it,
  // so the impact list can say which findings the save clears or opens.
  function applyBody(before, body) {
    const f = clone(before) || { "@odata.type": ODATA, id: "Fido2", state: "disabled", includeTargets: [], excludeTargets: [] };
    for (const [k, v] of Object.entries(body)) if (k !== "@odata.type") f[k] = clone(v);
    return f;
  }

  // Human diff, one line per change. names: id -> display name.
  function diff(before, d, names) {
    const nm = (id) => id === ALL ? "All users" : ((names && names[id]) || id);
    const b = draftFrom(before);
    const L = [];
    const profName = (id) => { const p = d.profiles.find((x) => x.id === id) || b.profiles.find((x) => x.id === id); return p ? p.name : id; };
    if (b.state !== d.state) L.push({ s: d.state === "enabled" ? "+" : "-", t: `Method ${d.state}` });
    if (b.selfService !== d.selfService) L.push({ s: d.selfService ? "+" : "-", t: `Allow self-service set up: ${d.selfService ? "Yes" : "No"}` });
    if (d.optIn) L.push({ s: "!", t: "Opt in to passkey profiles — tenant-wide settings become the Default passkey profile (cannot be undone)" });
    const bi = new Map(b.include.map((t) => [t.id, t])), di = new Map(d.include.map((t) => [t.id, t]));
    for (const [id, t] of di) {
      const was = bi.get(id);
      const pl = profiled(d) ? ` → ${t.profiles.map(profName).join(", ")}` : "";
      if (!was) L.push({ s: "+", t: `Include ${nm(id)}${pl}` });
      else if (profiled(d) && !d.optIn && !same(was.profiles, t.profiles)) L.push({ s: "~", t: `Include ${nm(id)}: profiles ${was.profiles.map(profName).join(", ")} → ${t.profiles.map(profName).join(", ")}` });
    }
    for (const id of bi.keys()) if (!di.has(id)) L.push({ s: "-", t: `Include ${nm(id)}` });
    const be = new Set(b.exclude.map((t) => t.id)), de = new Set(d.exclude.map((t) => t.id));
    for (const id of de) if (!be.has(id)) L.push({ s: "+", t: `Exclude ${nm(id)}` });
    for (const id of be) if (!de.has(id)) L.push({ s: "-", t: `Exclude ${nm(id)}` });
    const bp = new Map((d.optIn ? [] : b.profiles).map((p) => [p.id, p]));
    const krTxt = (k) => k.on ? `${k.type} · ${k.aaguids.map(aagName).join(", ") || "(empty)"}` : "off";
    for (const p of d.profiles) {
      const was = bp.get(p.id);
      const label = p.legacy ? "Tenant-wide" : `Profile "${p.name}"`;
      if (!was) { L.push({ s: "+", t: `${label}: ${p.types.join(" + ")} · attestation ${p.attest ? "on" : "off"} · key restrictions ${krTxt(p.kr)}` }); continue; }
      if (was.name !== p.name) L.push({ s: "~", t: `Profile "${was.name}" renamed "${p.name}"` });
      if (!same(was.types, p.types)) L.push({ s: "~", t: `${label}: types ${was.types.join(" + ")} → ${p.types.join(" + ") || "none"}` });
      if (was.attest !== p.attest) L.push({ s: "~", t: `${label}: attestation ${was.attest ? "on" : "off"} → ${p.attest ? "on" : "off"}` });
      if (!same(was.kr, p.kr)) L.push({ s: "~", t: `${label}: key restrictions ${krTxt(was.kr)} → ${krTxt(p.kr)}` });
    }
    for (const [id, p] of bp) if (!d.profiles.some((x) => x.id === id)) L.push({ s: "-", t: `Profile "${p.name}"` });
    return L;
  }

  // What the save does to people — the part Mihai wants BEFORE the button.
  // Losses first: every change that stops a key already registered.
  function impact(before, d, names, modelBefore, modelAfter) {
    const nm = (id) => id === ALL ? "All users" : ((names && names[id]) || id);
    const b = draftFrom(before);
    const lose = [], gain = [];
    if (b.state === "enabled" && d.state !== "enabled") lose.push("Disabling the method stops every passkey sign-in in the tenant, for everyone.");
    const di = new Set(d.include.map((t) => t.id));
    for (const t of b.include) if (!di.has(t.id)) lose.push(`${nm(t.id)} leaves the include targets — its members lose passkey registration and sign-in unless another target holds them.`);
    const be = new Set(b.exclude.map((t) => t.id));
    for (const t of d.exclude) if (!be.has(t.id)) lose.push(`${nm(t.id)} becomes excluded — its members can no longer register or sign in with a passkey, whatever includes them.`);
    const bp = new Map((d.optIn ? [] : b.profiles).map((p) => [p.id, p]));
    for (const p of d.profiles) {
      const was = bp.get(p.id); if (!was) continue;
      const label = p.legacy ? "the tenant-wide settings" : `"${p.name}"`;
      if (was.types.includes("synced") && !p.types.includes("synced")) lose.push(`Synced passkeys stop working under ${label} — users who registered one (iCloud Keychain, Google Password Manager, a password manager) can no longer sign in with it.`);
      if (was.types.includes("deviceBound") && !p.types.includes("deviceBound")) lose.push(`Device-bound passkeys stop working under ${label} — security keys and Authenticator passkeys already registered stop signing in.`);
      const allowed = (k, a) => keyAllows(k, a);
      const probe = uniq([...was.kr.aaguids, ...p.kr.aaguids]);
      const stopped = probe.filter((a) => allowed(was.kr, a) && !allowed(p.kr, a));
      if (stopped.length) lose.push(`Under ${label}, ${stopped.map(aagName).join(", ")} ${stopped.length === 1 ? "is" : "are"} no longer allowed — keys of that model already registered stop signing in.`);
      else if (!was.kr.on && p.kr.on) lose.push(`Key restrictions switch on under ${label} — every key ${p.kr.type === "allow" ? "NOT on the list" : "on the list"} stops signing in, including keys already registered.`);
      if (!was.attest && p.attest) gain.push(`Attestation becomes required for NEW registrations under ${label}; passkeys already registered keep working.`);
    }
    for (const [id, p] of bp) if (!d.profiles.some((x) => x.id === id)) lose.push(`Profile "${p.name}" is removed — users who were only in it fall back to the other profiles their targets carry.`);
    if (b.selfService && !d.selfService) lose.push("Nobody can add a passkey in Security info any more; registered passkeys keep working.");
    if (!b.selfService && d.selfService) gain.push("Users targeted by the method can add a passkey in Security info from their next sign-in.");
    if (d.optIn) gain.push("Opting in cannot be undone. The tenant-wide attestation and key-restriction settings move into the Default passkey profile unchanged.");
    if (modelBefore && modelAfter) {
      const hb = modelBefore.findings.filter((x) => x.sev === "high"), ha = modelAfter.findings.filter((x) => x.sev === "high");
      const cleared = hb.filter((x) => !ha.some((y) => y.key === x.key)), opened = ha.filter((x) => !hb.some((y) => y.key === x.key));
      for (const x of cleared) gain.push(`Clears: ${x.title}.`);
      for (const x of opened) lose.push(`Opens: ${x.title}.`);
    }
    return { lose: uniq(lose), gain: uniq(gain) };
  }

  // ---- render ------------------------------------------------------------------
  const FILTERS = [["all", "All"], ["high", "Blocks"], ["medium", "Warnings"], ["info", "Info"]];
  function chips(m, filter) {
    return FILTERS.map(([k, l]) => {
      const n = k === "all" ? m.findings.filter((x) => x.sev !== "ok").length : m.counts[k];
      return (n || k === "all" || k === filter) ? `<button class="fchip ${filter === k ? "active" : ""}" data-pkf="${k}">${l} (${n})</button>` : "";
    }).join("");
  }
  const PILL_CLS = { high: "xt-high", medium: "xt-medium", info: "xt-info", ok: "pk-okp" };
  const pill = (sev) => `<span class="xt-pill ${PILL_CLS[sev]}">${SEV_LABEL[sev]}</span>`;
  const polChips = (list) => list && list.length ? `<div class="xt-pols">${list.map((n) => `<span class="xt-pol">${esc(n)}</span>`).join("")}</div>` : "";
  const FIX_LABEL = { enable: "✎ Enable the method", addTargets: "✎ Add the policy's groups as targets", addAll: "✎ Target All users",
    selfService: "✎ Turn on self-service setup", editTargets: "✎ Open the targets", editProfiles: "✎ Open the profiles", editExclude: "✎ Open the exclusions", optIn: "✎ Opt in to passkey profiles" };
  function renderFindings(m, filter) {
    const list = m.findings.filter((x) => filter === "all" || !filter ? true : x.sev === filter);
    const body = list.length ? list.map((x, i) => `<div class="xt-f">${pill(x.sev)}<div><b>${esc(x.title)}</b><p>${esc(x.text)}</p>${polChips(x.policies)}${x.users && x.users.length ? `<p class="mini"><a href="#" data-pkusers="${esc(x.key)}">show ${plural(x.users.length, "user")}</a></p><div class="pk-users" data-pkulist="${esc(x.key)}" hidden></div>` : ""}${x.fix ? `<div class="pk-acts"><button class="btn sm" data-pkfix="${esc(x.fix.kind)}" data-pkfkey="${esc(x.key)}">${FIX_LABEL[x.fix.kind] || "✎ Configure"}</button></div>` : ""}</div></div>`).join("")
      : `<p class="mini" style="padding:8px 0">${m.findings.length ? "Nothing at this level." : "Nothing flagged."}</p>`;
    return `<div class="list-card xt-card"><h3>Findings</h3>${body}
      <p class="mini muted" style="margin-top:10px">A ✎ button opens Configure with that change already made — nothing is written until you have seen the diff and the impact and pressed Save.</p></div>`;
  }
  function renderTiles(m) {
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    return `<div class="xt-tiles">${t("", "Policies requiring a passkey", m.required.length)}${t(m.enabled ? "pk-on" : "h", "Passkey (FIDO2) method", m.fido2 ? (m.enabled ? "Enabled" : "Disabled") : "?")}${t(m.counts.high ? "h" : "", "Blocking", m.counts.high)}${t(m.counts.medium ? "m" : "", "Warnings", m.counts.medium)}</div>`;
  }
  const comboTxt = (r) => r.combos.map((c) => COMBO_LABEL[c] || c).join(" · ");
  function renderRequired(m) {
    if (!m.required.length) return "";
    const nm = (id) => (m.names && m.names[id]) || id;
    const rows = m.required.map((r) => {
      const who = r.all ? "All users" : `${r.requiredN} user${r.requiredN === 1 ? "" : "s"}`;
      const gap = r.all
        ? (r.allUncoveredGroups.length || r.excludedGroups.length || r.allNoKey ? '<span class="xt-dead">see findings</span>' : "✓")
        : (r.uncovered.length + r.excluded.length + r.noKey.length ? `<span class="xt-dead">${r.uncovered.length + r.excluded.length + r.noKey.length} cannot</span>` : "✓");
      return `<tr><td>${esc(r.name)}${r.state !== "enabled" ? ' <span class="mini muted">(report-only)</span>' : ""}${r.registration ? '<br><span class="mini muted">user action: register security info</span>' : ""}</td>
        <td>${esc(r.strength)}<br><span class="mini muted">${esc(comboTxt(r))}${r.aaguids ? ` · passkeys: ${esc(r.aaguids.map(aagName).join(", "))}` : ""}</span></td>
        <td>${esc(who)}${r.guests ? '<br><span class="mini muted">+ guests</span>' : ""}${r.unresolved.length ? `<br><span class="mini muted">${r.unresolved.length} not resolved: ${esc(r.unresolved.map((x) => nm(x.id)).join(", "))}</span>` : ""}</td>
        <td>${gap}</td></tr>`;
    }).join("");
    return `<div class="list-card xt-card"><h3>Policies that require a passkey <span class="mini">— the strength allows only phishing-resistant combinations, a passkey among them</span></h3>
      <div class="xt-tw"><table class="xt-tbl" style="min-width:680px"><thead><tr><th>Policy</th><th>Strength</th><th>In scope</th><th>Can get a passkey</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mini muted" style="margin-top:8px">Directory roles count ACTIVE holders; PIM-eligible holders join when they activate and are not counted.</p></div>`;
  }
  const krHtml = (k) => k.on ? `${k.type === "allow" ? "Allow" : "Block"} · ${esc(k.aaguids.map(aagName).join(", ") || "empty")}` : "Off";
  function renderSettings(m) {
    if (!m.fido2) return "";
    const nm = (id) => id === ALL ? "All users" : ((m.names && m.names[id]) || id);
    const prof = new Map(m.profiles.map((p) => [p.id, p]));
    const inc = m.targets.include.length ? m.targets.include.map((t) => `<tr><td>${esc(nm(t.id))}</td><td>${m.optedIn ? t.profiles.map((id) => `<span class="xt-pol">${esc((prof.get(id) || {}).name || id)}</span>`).join(" ") : '<span class="muted">tenant-wide</span>'}</td></tr>`).join("")
      : '<tr><td colspan="2" class="muted">No include target — nobody can use a passkey.</td></tr>';
    const exc = m.targets.exclude.length ? m.targets.exclude.map((t) => `<tr><td colspan="2">${esc(nm(t.id))} <span class="mini muted">— wins over every include</span></td></tr>`).join("") : '<tr><td colspan="2" class="muted">None</td></tr>';
    const profs = m.profiles.map((p) => `<tr><td>${esc(p.name)}${p.isDefault && !p.legacy ? ' <span class="mini muted">(default)</span>' : ""}</td><td>${esc(p.types.map((x) => x === "deviceBound" ? "Device-bound" : "Synced").join(", ") || "none")}</td><td>${p.attest ? "On" : "Off"}</td><td>${krHtml(p.kr)}</td></tr>`).join("");
    return `<div class="list-card xt-card"><h3>Current settings <span class="mini">— as in Entra ID → Authentication methods → Passkey (FIDO2)</span></h3>
      <div class="xt-grid">
        <div><div class="xt-tag">Enable and target · ${m.enabled ? "Enabled" : "Disabled"}</div>
          <table class="xt-tbl" style="min-width:0"><thead><tr><th>Include</th><th>Passkey profiles</th></tr></thead><tbody>${inc}</tbody></table>
          <table class="xt-tbl" style="min-width:0;margin-top:8px"><thead><tr><th colspan="2">Exclude</th></tr></thead><tbody>${exc}</tbody></table></div>
        <div><div class="xt-tag">Configure</div>
          <div class="xt-kv"><span>Allow self-service set up</span><span>${m.selfService ? "Yes" : "No"} <span class="mini muted">(tenant-wide)</span></span></div>
          <div class="xt-kv"><span>Passkey profiles</span><span>${m.optedIn ? `opted in · ${m.profiles.length} of ${MAX_PROFILES}` : "not opted in (tenant-wide settings)"}</span></div>
          <table class="xt-tbl" style="min-width:0;margin-top:8px"><thead><tr><th>Profile</th><th>Types</th><th>Attestation</th><th>Key restrictions</th></tr></thead><tbody>${profs}</tbody></table></div>
      </div></div>`;
  }
  function render(m, o) {
    const f = (o && o.filter) || "all";
    return renderTiles(m) + renderFindings(m, f) + renderRequired(m) + renderSettings(m)
      + (m.demo ? '<p class="mini muted">Demo data — an example method and groups, not a real tenant.</p>' : "");
  }

  // ---- export ------------------------------------------------------------------
  function toMd(m, tenant) {
    const nm = (id) => id === ALL ? "All users" : ((m.names && m.names[id]) || id);
    const L = [`# Passkeys — ${tenant || "tenant"}`, ""];
    L.push(`${m.required.length} polic${m.required.length === 1 ? "y requires" : "ies require"} a passkey · method ${m.fido2 ? (m.enabled ? "enabled" : "disabled") : "not read"} · ${m.counts.high} blocking, ${m.counts.medium} warnings · read ${new Date(m.readAt).toISOString().slice(0, 16).replace("T", " ")} UTC${m.demo ? " (demo)" : ""}`, "");
    L.push("## Findings", "");
    for (const x of m.findings) L.push(`- **${SEV_LABEL[x.sev].toUpperCase()}** ${x.title} — ${x.text}${x.policies.length ? ` Policies: ${x.policies.join("; ")}.` : ""}`);
    if (m.required.length) {
      L.push("", "## Policies that require a passkey", "", "| Policy | State | Strength | In scope | Cannot get one |", "| --- | --- | --- | --- | --- |");
      for (const r of m.required) L.push(`| ${r.name} | ${r.state} | ${r.strength} | ${r.all ? "All users" : r.requiredN} | ${r.all ? "see findings" : r.uncovered.length + r.excluded.length + r.noKey.length} |`);
    }
    if (m.fido2) {
      L.push("", "## Method settings", "", `- State: ${m.enabled ? "enabled" : "disabled"}`, `- Allow self-service set up: ${m.selfService ? "yes" : "no"}`,
        `- Include: ${m.targets.include.map((t) => nm(t.id)).join(", ") || "none"}`, `- Exclude: ${m.targets.exclude.map((t) => nm(t.id)).join(", ") || "none"}`,
        `- Passkey profiles: ${m.optedIn ? "opted in" : "not opted in"}`);
      for (const p of m.profiles) L.push(`  - ${p.name}: ${p.types.join(" + ")}, attestation ${p.attest ? "on" : "off"}, key restrictions ${p.kr.on ? `${p.kr.type} ${p.kr.aaguids.map(aagName).join(", ")}` : "off"}`);
    }
    return L.join("\n");
  }

  return { analyze, wanted, requirement, profilesOf, targetsOf, keyAllows, profileMeets, strengthAaguids,
    draftFrom, applyOptIn, validate, toBody, changed, applyBody, diff, impact,
    render, chips, toMd, aagName, typesOf,
    PRESETS, AAGUID_NAME, GUID, V1, FIDO2_PATH, WRITE_SCOPES, ODATA, ALL, DEFAULT_PROFILE, MAX_PROFILES, COMBO_LABEL };
})();
