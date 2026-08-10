// ======================================================================
// Terms of use — view, create, edit and delete the Entra terms-of-use
// agreements that Conditional Access policies can require.
//   https://learn.microsoft.com/graph/api/resources/agreement
//
// A CA policy consumes an agreement through grantControls.termsOfUse; the
// agreement itself lives in identity governance:
//   list:    GET    /identityGovernance/termsOfUse/agreements?$expand=files
//   create:  POST   /identityGovernance/termsOfUse/agreements   (PDF inline,
//            base64 in files[].fileData.data)
//   update:  PATCH  …/agreements/{id}   (display name + behaviour settings —
//            replacing the PDF is a new file localization, not covered here)
//   delete:  DELETE …/agreements/{id}
//   accepts: GET    …/agreements/{id}/acceptances
// Reads need Agreement.Read.All (ENCA already requests it for backups),
// writes Agreement.ReadWrite.All, acceptances AgreementAcceptance.Read.All —
// all delegated-only, with the CA Administrator / Security Administrator role.
//
// Deleting an agreement a policy still references leaves that policy with a
// dangling grant control, so the UI blocks it — repoint the policy first.
// ======================================================================
const TermsOfUse = (() => {
  // ---- policy usage ----------------------------------------------------
  function usedBy(agreementId, raws) {
    return (raws || []).filter((p) => ((p.grantControls?.termsOfUse) || []).includes(agreementId))
      .map((p) => ({ id: p.id, name: p.displayName, state: p.state }));
  }

  function summarize(list, raws) {
    const l = list || [];
    return {
      total: l.length,
      inUse: l.filter((a) => usedBy(a.id, raws).length > 0).length,
      perDevice: l.filter((a) => a.isPerDeviceAcceptanceRequired).length,
      reaccept: l.filter((a) => a.userReacceptRequiredFrequency).length,
      files: l.reduce((n, a) => n + ((a.files || []).length || (a.file ? 1 : 0)), 0),
    };
  }

  function deletable(a, raws) {
    const used = usedBy(a.id, raws);
    if (used.length) return { ok: false, why: `required by ${used.length} Conditional Access polic${used.length === 1 ? "y" : "ies"} — remove it from the grant first, or the policy keeps a dangling reference` };
    return { ok: true, why: "" };
  }

  // ISO 8601 duration → something a person reads. The portal only writes
  // day-based durations here.
  function freqLabel(dur) {
    if (!dur) return "never";
    const m = /^P(\d+)D$/i.exec(String(dur));
    if (m) {
      const d = Number(m[1]);
      return d === 365 ? "every year" : d === 180 ? "every 6 months" : d === 90 ? "every quarter" : d === 30 ? "every month" : `every ${d} days`;
    }
    return String(dur);
  }
  const FREQ_OPTIONS = [["", "Never"], ["P30D", "Every month (P30D)"], ["P90D", "Every quarter (P90D)"], ["P180D", "Every 6 months (P180D)"], ["P365D", "Every year (P365D)"]];

  function expirationLabel(a) {
    const t = a.termsExpiration;
    if (!t || (!t.startDateTime && !t.frequency)) return null;
    const start = (t.startDateTime || "").slice(0, 10);
    return `expires${start ? ` from ${start}` : ""}${t.frequency ? `, ${freqLabel(t.frequency)}` : ""}`;
  }

  // Behaviour settings as short tags for the card.
  function settingTags(a) {
    const out = [];
    if (a.isViewingBeforeAcceptanceRequired) out.push("view before accepting");
    if (a.isPerDeviceAcceptanceRequired) out.push("per device");
    if (a.userReacceptRequiredFrequency) out.push(`re-accept ${freqLabel(a.userReacceptRequiredFrequency)}`);
    const ex = expirationLabel(a);
    if (ex) out.push(ex);
    return out;
  }

  const fileList = (a) => (a.files || []).length ? a.files : (a.file ? [a.file] : []);

  // Validate the editor form; returns { ok, errors[], payload }
  // mode "create" needs the PDF; mode "edit" is settings-only.
  function buildPayload(form, mode) {
    const errors = [];
    const name = String(form.name || "").trim();
    if (!name) errors.push("A display name is required (internal tracking only — end users never see it).");
    if (name.length > 64) errors.push("Keep the display name at 64 characters or less.");
    if (mode === "create") {
      if (!form.pdfBase64) errors.push("A PDF file with the terms is required.");
      if (form.pdfName && !/\.pdf$/i.test(form.pdfName)) errors.push("The terms file must be a PDF.");
      if (form.pdfBase64 && form.pdfBase64.length > 3 * 1024 * 1024 * 1.4) errors.push("The PDF is too large — keep it under ~3 MB.");
    }
    if (errors.length) return { ok: false, errors };
    const base = {
      displayName: name,
      isViewingBeforeAcceptanceRequired: !!form.viewRequired,
      isPerDeviceAcceptanceRequired: !!form.perDevice,
      userReacceptRequiredFrequency: form.reaccept || null,
    };
    if (mode === "create") {
      base.files = [{
        fileName: form.pdfName || "TermsOfUse.pdf",
        language: String(form.language || "en").trim() || "en",
        isDefault: true,
        fileData: { data: form.pdfBase64 },
      }];
    }
    return { ok: true, errors, payload: base };
  }

  function diff(orig, payload) {
    if (!orig) return ["created"];
    const out = [];
    if ((orig.displayName || "") !== payload.displayName) out.push(`name: ${orig.displayName} → ${payload.displayName}`);
    if (!!orig.isViewingBeforeAcceptanceRequired !== payload.isViewingBeforeAcceptanceRequired) out.push("view-before-accepting changed");
    if (!!orig.isPerDeviceAcceptanceRequired !== payload.isPerDeviceAcceptanceRequired) out.push("per-device changed");
    if ((orig.userReacceptRequiredFrequency || null) !== payload.userReacceptRequiredFrequency) out.push(`re-accept: ${freqLabel(orig.userReacceptRequiredFrequency)} → ${freqLabel(payload.userReacceptRequiredFrequency)}`);
    return out;
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(list, raws, meta = {}) {
    const s = summarize(list, raws);
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = [`# Terms of use — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `- Agreements: **${s.total}** (${s.files} PDF file${s.files === 1 ? "" : "s"})`,
      `- Required by a CA policy: **${s.inUse}**`,
      `- Per-device acceptance: ${s.perDevice} · re-acceptance schedule: ${s.reaccept}`, "",
      "| Agreement | Behaviour | Languages | Required by |", "|---|---|---|---|"];
    for (const a of (list || []).slice().sort((x, y) => (x.displayName || "").localeCompare(y.displayName || ""))) {
      const used = usedBy(a.id, raws);
      const langs = fileList(a).map((f) => f.language || f.fileName).filter(Boolean).join(", ") || "—";
      L.push(`| ${mdEsc(a.displayName)} | ${settingTags(a).join("; ") || "accept only"} | ${mdEsc(langs)} | ${used.length ? mdEsc(used.map((u) => u.name).join(", ")) : "—"} |`);
    }
    L.push("", "An agreement a policy still requires cannot be deleted without leaving that policy with a dangling terms-of-use grant — repoint the policy first.", "");
    return L.join("\n");
  }

  return { usedBy, summarize, deletable, freqLabel, FREQ_OPTIONS, expirationLabel, settingTags, fileList, buildPayload, diff, toMd };
})();
