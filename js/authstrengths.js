// ======================================================================
// Authentication strengths — view, create, edit and delete Conditional
// Access authentication strength policies.
//   https://learn.microsoft.com/graph/api/resources/authenticationstrengthpolicy
//
// A strength is a set of allowed authentication method COMBINATIONS. The
// three built-in strengths (MFA, Passwordless MFA, Phishing-resistant MFA)
// are Microsoft-managed and immutable; custom strengths are the tenant's
// own and can be created, renamed, re-combined and deleted here.
//
// Graph shape worth knowing:
//   - create:            POST  /policies/authenticationStrengthPolicies
//   - rename/describe:   PATCH /policies/authenticationStrengthPolicies/{id}
//   - change the combos: POST  …/{id}/updateAllowedCombinations  (its own
//                        action, NOT part of PATCH — sending allowedCombinations
//                        in the PATCH body is rejected)
//   - delete custom:     DELETE …/{id}
// The valid combination catalog can be read from
// /identity/conditionalAccess/authenticationStrength (authenticationCombinations);
// a curated fallback list is bundled for demo mode and failed reads.
// Writes need Policy.ReadWrite.ConditionalAccess.
// ======================================================================
const AuthStrengths = (() => {
  const BUILTIN = {
    "00000000-0000-0000-0000-000000000002": "Multifactor authentication",
    "00000000-0000-0000-0000-000000000003": "Passwordless MFA",
    "00000000-0000-0000-0000-000000000004": "Phishing-resistant MFA",
  };
  const isBuiltIn = (p) => (p.policyType || "").toLowerCase() === "builtin" || !!BUILTIN[p.id];

  // Friendly names per authentication method mode.
  const MODE_LABEL = {
    password: "Password", voice: "Voice call", hardwareOath: "Hardware OATH token",
    softwareOath: "Software OATH token", sms: "SMS", fido2: "Passkey (FIDO2)",
    windowsHelloForBusiness: "Windows Hello for Business", microsoftAuthenticatorPush: "Authenticator push",
    deviceBasedPush: "Authenticator phone sign-in", temporaryAccessPassOneTime: "TAP (one-time)",
    temporaryAccessPassMultiUse: "TAP (multi-use)", email: "Email OTP",
    x509CertificateSingleFactor: "Certificate (single-factor)", x509CertificateMultiFactor: "Certificate (multifactor)",
    federatedSingleFactor: "Federated single-factor", federatedMultiFactor: "Federated multifactor",
    qrCodePin: "QR code + PIN",
  };
  const comboLabel = (combo) => String(combo || "").split(",").map((m) => MODE_LABEL[m.trim()] || m.trim()).join(" + ");

  // The combination catalog, mirrored from the Learn table
  // (concept-authentication-strengths). Used when the live catalog cannot be
  // read; the live read from /identity/conditionalAccess/authenticationStrength
  // wins when available, so new modes appear without a code change.
  const FALLBACK_COMBINATIONS = [
    "windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor", "deviceBasedPush",
    "temporaryAccessPassOneTime", "temporaryAccessPassMultiUse",
    "password,microsoftAuthenticatorPush", "password,softwareOath", "password,hardwareOath",
    "password,sms", "password,voice", "federatedMultiFactor",
    "microsoftAuthenticatorPush,federatedSingleFactor", "softwareOath,federatedSingleFactor",
    "hardwareOath,federatedSingleFactor", "sms,federatedSingleFactor", "voice,federatedSingleFactor",
    "x509CertificateSingleFactor", "sms", "password", "federatedSingleFactor",
  ];

  // Category per combination — mirrors how the portal groups them.
  const PR_SET = new Set(["windowshelloforbusiness", "fido2", "x509certificatemultifactor"]);
  const MFA_SINGLE = new Set(["devicebasedpush", "temporaryaccesspassonetime", "temporaryaccesspassmultiuse", "federatedmultifactor"]);
  function classify(combo) {
    const modes = String(combo || "").toLowerCase().split(",").map((m) => m.trim()).filter(Boolean);
    if (modes.length && modes.every((m) => PR_SET.has(m))) return "pr";
    if (modes.length === 1 && (PR_SET.has(modes[0]) || MFA_SINGLE.has(modes[0]) || modes[0] === "devicebasedpush")) return "mfa";
    if (modes.length > 1) return "mfa";                       // password+X / federated+X pairs
    return "single";                                          // password, sms, cert-SF, federated-SF …
  }
  const CLASS_LABEL = { pr: "phishing-resistant", mfa: "MFA", single: "single-factor" };

  // The overall class of a strength = its weakest allowed combination.
  function strengthClass(p) {
    const cs = (p.allowedCombinations || []).map(classify);
    if (!cs.length) return "single";
    if (cs.every((c) => c === "pr")) return "pr";
    if (cs.every((c) => c !== "single")) return "mfa";
    return "single";
  }

  // ---- Advanced options: combination configurations --------------------
  // Restrictions on specific methods inside a strength (custom only):
  //   fido2CombinationConfiguration          — allow-list of passkey AAGUIDs
  //   x509CertificateCombinationConfiguration — issuer SKIs and/or policy OIDs
  // GET/POST/PATCH/DELETE on …/{id}/combinationConfigurations; a create can
  // carry them inline. Docs: concept-authentication-strength-advanced-options.
  const PROVIDER_AAGUIDS = {
    authenticator: { label: "Microsoft Authenticator", aaguids: {
      "de1e552d-db1d-4423-a619-566b625cdc84": "Authenticator for Android",
      "90a3ccdf-635c-4729-a248-9b709135078f": "Authenticator for iOS",
    } },
    windowsHello: { label: "Windows Hello", aaguids: {
      "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello Hardware Authenticator",
      "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello VBS Hardware Authenticator",
      "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello Software Authenticator",
    } },
  };
  const AAGUID_NAME = Object.assign({}, ...Object.values(PROVIDER_AAGUIDS).map((p) => p.aaguids));
  const AAGUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isFidoCfg = (c) => (c["@odata.type"] || "").toLowerCase().includes("fido2");
  const isX509Cfg = (c) => (c["@odata.type"] || "").toLowerCase().includes("x509");

  // One line per configuration, for the cards and the report.
  function ccSummary(cfgs) {
    const out = [];
    for (const c of cfgs || []) {
      if (isFidoCfg(c)) {
        const n = (c.allowedAAGUIDs || []).length;
        out.push(`Passkeys restricted to ${n} AAGUID${n === 1 ? "" : "s"}`);
      } else if (isX509Cfg(c)) {
        const parts = [];
        if ((c.allowedIssuerSkis || []).length) parts.push(`${c.allowedIssuerSkis.length} issuer SKI${c.allowedIssuerSkis.length === 1 ? "" : "s"}`);
        if ((c.allowedPolicyOIDs || []).length) parts.push(`${c.allowedPolicyOIDs.length} policy OID${c.allowedPolicyOIDs.length === 1 ? "" : "s"}`);
        out.push(`Certificates restricted to ${parts.join(" + ") || "nothing"} (${(c.appliesToCombinations || []).map(comboLabel).join(", ")})`);
      }
    }
    return out;
  }

  // Validate the advanced form; returns { ok, errors[], fido2, x509 }.
  //   form.aaguids: string[]        form.skis/oids: string[]
  //   form.x509Applies: subset of [x509CertificateSingleFactor, x509CertificateMultiFactor]
  //   combos: the strength's selected combinations (context for validation)
  function buildAdvanced(form, combos) {
    const errors = [];
    const modes = new Set((combos || []).flatMap((c) => String(c).split(",").map((m) => m.trim())));
    const aaguids = [...new Set((form.aaguids || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))];
    for (const a of aaguids) if (!AAGUID_RE.test(a)) errors.push(`Not a valid AAGUID: ${a}`);
    if (aaguids.length && !modes.has("fido2")) errors.push("AAGUIDs restrict Passkeys (FIDO2) — select the Passkey (FIDO2) combination first, or clear the list.");
    const skis = [...new Set((form.skis || []).map((x) => String(x).trim()).filter(Boolean))];
    const oids = [...new Set((form.oids || []).map((x) => String(x).trim()).filter(Boolean))];
    if (skis.length > 5) errors.push("Graph allows at most 5 certificate issuer SKIs.");
    if (oids.length > 5) errors.push("Graph allows at most 5 policy OIDs.");
    for (const o of oids) if (!/^[0-9]+(\.[0-9]+)+$/.test(o)) errors.push(`Not a valid policy OID: ${o}`);
    for (const s of skis) if (!/^[0-9a-f]{2,}$/i.test(s)) errors.push(`Not a valid issuer SKI (hex expected): ${s}`);
    const applies = (form.x509Applies || []).filter((m) => modes.has(m));
    if ((skis.length || oids.length) && !applies.length)
      errors.push("Certificate restrictions need a selected certificate combination (single-factor or multifactor) to apply to.");
    return { ok: !errors.length, errors,
      fido2: aaguids.length ? { "@odata.type": "#microsoft.graph.fido2CombinationConfiguration", appliesToCombinations: ["fido2"], allowedAAGUIDs: aaguids } : null,
      x509: (skis.length || oids.length) ? { "@odata.type": "#microsoft.graph.x509CertificateCombinationConfiguration", appliesToCombinations: applies, allowedIssuerSkis: skis, allowedPolicyOIDs: oids } : null };
  }

  // Turn existing configurations + the wanted state into Graph operations.
  function ccPlan(existing, adv) {
    const ops = [];
    const oldFido = (existing || []).find(isFidoCfg) || null;
    const oldX509 = (existing || []).find(isX509Cfg) || null;
    const same = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());
    if (adv.fido2 && !oldFido) ops.push({ method: "post", body: adv.fido2 });
    else if (adv.fido2 && oldFido && !same(oldFido.allowedAAGUIDs, adv.fido2.allowedAAGUIDs))
      ops.push({ method: "patch", id: oldFido.id, body: { "@odata.type": "#microsoft.graph.fido2CombinationConfiguration", allowedAAGUIDs: adv.fido2.allowedAAGUIDs } });
    else if (!adv.fido2 && oldFido) ops.push({ method: "delete", id: oldFido.id });
    if (adv.x509 && !oldX509) ops.push({ method: "post", body: adv.x509 });
    else if (adv.x509 && oldX509 && !(same(oldX509.allowedIssuerSkis, adv.x509.allowedIssuerSkis) && same(oldX509.allowedPolicyOIDs, adv.x509.allowedPolicyOIDs) && same(oldX509.appliesToCombinations, adv.x509.appliesToCombinations)))
      ops.push({ method: "patch", id: oldX509.id, body: { "@odata.type": "#microsoft.graph.x509CertificateCombinationConfiguration", appliesToCombinations: adv.x509.appliesToCombinations, allowedIssuerSkis: adv.x509.allowedIssuerSkis, allowedPolicyOIDs: adv.x509.allowedPolicyOIDs } });
    else if (!adv.x509 && oldX509) ops.push({ method: "delete", id: oldX509.id });
    return ops;
  }

  // ---- policy usage ----------------------------------------------------
  function usedBy(strengthId, raws) {
    return (raws || []).filter((p) => (p.grantControls?.authenticationStrength?.id || "").toLowerCase() === String(strengthId).toLowerCase())
      .map((p) => ({ id: p.id, name: p.displayName, state: p.state }));
  }

  function summarize(list, raws) {
    const l = list || [];
    return {
      total: l.length,
      builtin: l.filter(isBuiltIn).length,
      custom: l.filter((p) => !isBuiltIn(p)).length,
      inUse: l.filter((p) => usedBy(p.id, raws).length > 0).length,
      pr: l.filter((p) => strengthClass(p) === "pr").length,
    };
  }

  function deletable(p, raws) {
    if (isBuiltIn(p)) return { ok: false, why: "built-in — Microsoft-managed, cannot be deleted" };
    const used = usedBy(p.id, raws);
    if (used.length) return { ok: false, why: `granted by ${used.length} Conditional Access polic${used.length === 1 ? "y" : "ies"} — repoint ${used.length === 1 ? "it" : "them"} first` };
    return { ok: true, why: "" };
  }

  // Validate the editor form; returns { ok, errors[], payload }
  function buildPayload(form) {
    const errors = [];
    const name = String(form.name || "").trim();
    const combos = (form.combinations || []).filter(Boolean);
    if (!name) errors.push("A display name is required.");
    if (name.length > 30) errors.push("Keep the display name at 30 characters or less.");
    if (!combos.length) errors.push("Select at least one authentication method combination.");
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors, payload: {
      displayName: name,
      description: String(form.description || "").trim(),
      allowedCombinations: combos,
    } };
  }

  function diff(orig, payload) {
    if (!orig) return ["created"];
    const out = [];
    if ((orig.displayName || "") !== payload.displayName) out.push(`name: ${orig.displayName} → ${payload.displayName}`);
    if ((orig.description || "") !== (payload.description || "")) out.push("description changed");
    const a = (orig.allowedCombinations || []).slice().sort().join("|");
    const b = (payload.allowedCombinations || []).slice().sort().join("|");
    if (a !== b) {
      const was = new Set(orig.allowedCombinations || []), is = new Set(payload.allowedCombinations || []);
      const added = [...is].filter((x) => !was.has(x)), removed = [...was].filter((x) => !is.has(x));
      if (added.length) out.push(`+ ${added.map(comboLabel).join(", ")}`);
      if (removed.length) out.push(`− ${removed.map(comboLabel).join(", ")}`);
    }
    return out;
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(list, raws, meta = {}) {
    const s = summarize(list, raws);
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = [`# Authentication strengths — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `- Strengths: **${s.total}** — ${s.builtin} built-in, ${s.custom} custom`,
      `- Granted by a CA policy: **${s.inUse}**`,
      `- Fully phishing-resistant: **${s.pr}**`, ""];
    for (const p of (list || []).slice().sort((a, b) => (isBuiltIn(b) ? 1 : 0) - (isBuiltIn(a) ? 1 : 0) || (a.displayName || "").localeCompare(b.displayName || ""))) {
      const used = usedBy(p.id, raws);
      L.push(`## ${mdEsc(p.displayName)}${isBuiltIn(p) ? " (built-in)" : ""}`, "");
      if (p.description) L.push(mdEsc(p.description), "");
      L.push(`- Class: **${CLASS_LABEL[strengthClass(p)]}** · id \`${p.id}\``);
      L.push(`- Used by: ${used.length ? used.map((u) => mdEsc(u.name)).join(", ") : "no policy"}`);
      L.push(`- Allowed combinations (${(p.allowedCombinations || []).length}):`);
      for (const c of p.allowedCombinations || []) L.push(`  - ${comboLabel(c)} _(${CLASS_LABEL[classify(c)]})_`);
      const cc = ccSummary(p.combinationConfigurations);
      if (cc.length) { L.push(`- Advanced restrictions:`); cc.forEach((x) => L.push(`  - ${mdEsc(x)}`)); }
      L.push("");
    }
    L.push("Built-in strengths are Microsoft-managed and immutable. A custom strength's combinations are changed through the dedicated updateAllowedCombinations action; a strength granted by a policy cannot be deleted.", "");
    return L.join("\n");
  }

  return { BUILTIN, isBuiltIn, MODE_LABEL, comboLabel, FALLBACK_COMBINATIONS, classify, CLASS_LABEL, strengthClass,
    usedBy, summarize, deletable, buildPayload, diff, toMd,
    PROVIDER_AAGUIDS, AAGUID_NAME, AAGUID_RE, isFidoCfg, isX509Cfg, ccSummary, buildAdvanced, ccPlan };
})();
