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
      L.push("");
    }
    L.push("Built-in strengths are Microsoft-managed and immutable. A custom strength's combinations are changed through the dedicated updateAllowedCombinations action; a strength granted by a policy cannot be deleted.", "");
    return L.join("\n");
  }

  return { BUILTIN, isBuiltIn, MODE_LABEL, comboLabel, FALLBACK_COMBINATIONS, classify, CLASS_LABEL, strengthClass,
    usedBy, summarize, deletable, buildPayload, diff, toMd };
})();
