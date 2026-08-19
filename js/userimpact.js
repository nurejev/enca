// ======================================================================
// 🗣 User impact brief (T32) — pure functions, no Graph reads of its own.
//
// Reads the policies already in memory and answers the question every
// rollout email struggles with: WHAT WILL PEOPLE NOTICE, and WHAT WILL NO
// LONGER BE POSSIBLE once everything is enforced. Every statement is
// derived from a policy actually present in the tenant — with its state,
// so "already live today" and "changes at go-live" never get mixed up —
// and every statement names the policies behind it.
//
// The analysis is deliberately written in end-user language: the output is
// meant to be pasted into a communication, not read by an engineer. The
// engineer-facing view of the same tenant is 🩺 Gap analyse; this tool is
// the translation layer.
//
// app.js wiring calls: UserImpact.analyze(policies) → res
//                      UserImpact.toMd(res, { tenantName }) → markdown
//                      UserImpact.toDocx(res, { tenantName }) → JSZip
// ======================================================================
const UserImpact = (() => {
  const AUD_ORDER = ["Everyone", "Employees", "External consultants", "Guests", "Guest admins", "Developers", "Factory workers", "Administrators", "Targeted users"];

  // Persona token in the policy name first — that is what a baseline tenant
  // speaks — then the assignment shape for tenants that name policies
  // differently. Service accounts, workload identities and the break-glass
  // set are deliberately NOT audiences: no human reads a comms addressed to
  // a service principal, and the E-Admin lockdowns are for two accounts.
  function audienceOf(vm) {
    const n = String(vm.name || "");
    if (/-(MSA|WorkloadIDs?|E-?Admins?)-/i.test(n)) return null;
    if (/-G[_-]?Admins?-/i.test(n)) return "Guest admins";
    if (/-GuestUsers?-|-Guests-/i.test(n)) return "Guests";
    if (/-Externals?-/i.test(n)) return "External consultants";
    if (/-Internals?-/i.test(n)) return "Employees";
    if (/-DevOps-/i.test(n)) return "Developers";
    if (/-FactoryWorkers?-/i.test(n)) return "Factory workers";
    if (/-Admins?-/i.test(n)) return "Administrators";
    if (/-Global-/i.test(n)) return "Everyone";
    const u = ((vm.raw || {}).conditions || {}).users || {};
    if (u.includeGuestsOrExternalUsers) return "Guests";
    if ((u.includeUsers || []).includes("All")) return "Everyone";
    if ((u.includeRoles || []).length) return "Administrators";
    if ((u.includeGroups || []).length || (u.includeUsers || []).length) return "Targeted users";
    return null;
  }

  const g = (vm) => (vm.raw || {}).grantControls || {};
  const s = (vm) => (vm.raw || {}).sessionControls || {};
  const c = (vm) => (vm.raw || {}).conditions || {};
  const isBlock = (vm) => (g(vm).builtInControls || []).includes("block");
  const grantTxt = (vm) => (vm.grant && vm.grant.controls || []).join(" · ");
  const hasMfa = (vm) => /strength|multifactor|mfa/i.test(grantTxt(vm)) && !isBlock(vm);
  const phishRes = (vm) => /phishing/i.test(grantTxt(vm));
  const appAct = (vm) => (c(vm).applications || {}).includeUserActions || [];
  const apps = (vm) => (c(vm).applications || {});
  const sif = (vm) => (s(vm).signInFrequency || {});
  const sifLabel = (vm) => {
    const f = sif(vm);
    if (!f.isEnabled) return null;
    if (f.frequencyInterval === "everyTime") return "every sign-in";
    return f.value ? `${f.value} ${f.type === "days" ? "day(s)" : "hour(s)"}` : null;
  };
  const netTxt = (vm) => [...(vm.net && vm.net.inc || []), ...(vm.net && vm.net.exc || [])].join(" · ");

  // One rule = one statement in the communication. `match` collects the
  // policies that make the statement true; `expect` is what the person
  // notices, `lost` is what stops being possible — the two lists the brief
  // is built around. Text is end-user language on purpose.
  const RULES = [
    { id: "mfa", icon: "🔐", title: "Sign-in asks for a second factor",
      match: (vm) => hasMfa(vm) && (apps(vm).includeApplications || []).length && !appAct(vm).length,
      expect: "Signing in requires multi-factor authentication (Microsoft Authenticator, security key or another registered method). On a healthy company device this is rare after the first sign-in; on other devices it is routine.",
      lost: "Signing in with only a password." },
    { id: "phish", icon: "🔑", title: "Strongest sign-in method for privileged accounts",
      match: (vm) => phishRes(vm) && !isBlock(vm),
      expect: "Phishing-resistant sign-in (security key, Windows Hello or a passkey) is required — a code by SMS or an approval tap alone is not accepted for these accounts.",
      lost: "SMS codes, voice calls or simple approve-taps as the only second factor.",
      aud: ["Administrators", "Guest admins", "Developers"] },
    { id: "legacy", icon: "📠", title: "Old sign-in protocols are switched off",
      match: (vm) => isBlock(vm) && ((c(vm).clientAppTypes || []).includes("exchangeActiveSync") || (c(vm).clientAppTypes || []).includes("other")),
      expect: "Apps that sign in the old way (IMAP, POP, basic SMTP, very old Office versions) stop connecting.",
      lost: "Legacy mail protocols — including older scan-to-mail devices and scripts that sign in with just a password." },
    { id: "devicecode", icon: "📺", title: "Enter-a-code sign-ins are blocked",
      match: (vm) => isBlock(vm) && /deviceCodeFlow/i.test(String((c(vm).authenticationFlows || {}).transferMethods || "")),
      expect: "The 'go to microsoft.com/devicelogin and enter this code' sign-in no longer works, except for approved exceptions.",
      lost: "Device-code sign-ins (TVs, consoles, some CLI tools) outside the approved exceptions." },
    { id: "authxfer", icon: "📱", title: "QR session transfer is blocked",
      match: (vm) => isBlock(vm) && /authenticationTransfer/i.test(String((c(vm).authenticationFlows || {}).transferMethods || "")),
      expect: "Moving a signed-in session from PC to phone by scanning a QR code is blocked; sign in on the phone itself.",
      lost: "Transferring your session to another device via QR code." },
    { id: "app", icon: "📲", title: "Company data on phones only in protected Microsoft apps",
      match: (vm) => ((g(vm).builtInControls || []).includes("compliantApplication") || (g(vm).builtInControls || []).includes("approvedApplication")) && !isBlock(vm),
      expect: "On iOS and Android, company mail and documents work only in Microsoft apps (Outlook, Teams, Office) protected with an app PIN.",
      lost: "Company mail in the phone's built-in mail app, and copying company data into private apps." },
    { id: "aer", icon: "🚫⬇", title: "View-only on devices the company does not manage",
      match: (vm) => (s(vm).applicationEnforcedRestrictions || {}).isEnabled === true,
      expect: "On a device that is not company-managed you can read and edit in the browser, but downloading attachments, printing and syncing files is blocked.",
      lost: "Downloading, printing or syncing company files on personal or unmanaged devices." },
    { id: "mdca", icon: "👁", title: "Monitored sessions on unmanaged devices",
      match: (vm) => (s(vm).cloudAppSecurity || {}).isEnabled === true,
      expect: "Sessions from unmanaged devices run through a monitoring gateway (Defender for Cloud Apps). You may notice a slightly different URL in the address bar.",
      lost: null },
    { id: "sif", icon: "⏱", title: "Sessions expire",
      match: (vm) => !!sifLabel(vm) && !appAct(vm).length && !(c(vm).signInRiskLevels || []).length && !(c(vm).userRiskLevels || []).length,
      dynamic: (vms) => {
        const parts = [...new Set(vms.map(sifLabel).filter(Boolean))].sort();
        return `Signing in again is required after: ${parts.join(", ")} — the short intervals apply to unmanaged devices and privileged accounts, the long ones to healthy company devices.`;
      },
      expect: "You are signed out and asked to authenticate again on a schedule.",
      lost: null },
    { id: "persist", icon: "🍪", title: "The browser forgets the session",
      match: (vm) => (s(vm).persistentBrowser || {}).isEnabled === true && (s(vm).persistentBrowser || {}).mode === "never",
      expect: "Closing the browser ends the session — 'Stay signed in?' is no longer offered on the devices in scope (unmanaged devices, privileged accounts).",
      lost: "Staying signed in across browser restarts on unmanaged devices." },
    { id: "geo", icon: "🌍", title: "Sign-in only from approved countries",
      match: (vm) => isBlock(vm) && ((c(vm).locations || {}).includeLocations || []).includes("All") && ((c(vm).locations || {}).excludeLocations || []).length > 0 && !/compliant network/i.test(netTxt(vm)),
      expect: "Sign-ins from outside the approved countries are blocked. Travelling for work? Request a travel exception BEFORE you leave.",
      lost: "Signing in from countries where the organization does not operate, without a pre-approved exception." },
    { id: "cn", icon: "🛡", title: "The secure network client must be running",
      match: (vm) => isBlock(vm) && /compliant network/i.test(netTxt(vm)),
      expect: "On company Windows/macOS devices the Global Secure Access client must be active — if it is off or broken, access to company data is blocked until it runs again.",
      lost: "Working without the secure network client on corporate desktops and laptops." },
    { id: "compliant", icon: "💻", title: "Company devices must be enrolled and healthy",
      match: (vm) => (g(vm).builtInControls || []).includes("compliantDevice") && !isBlock(vm),
      expect: "Windows and macOS devices must be enrolled in Intune and compliant (encrypted, updated, protected). A device that falls out of compliance loses access until it is healthy again.",
      lost: "Full access from laptops that are not enrolled, or that ignore compliance warnings." },
    { id: "platform", icon: "🖥", title: "Unrecognised device platforms are blocked",
      match: (vm) => isBlock(vm) && ((c(vm).platforms || {}).includePlatforms || []).includes("all") && ((c(vm).platforms || {}).excludePlatforms || []).length > 0 && !((c(vm).locations || {}).includeLocations || []).length,
      dynamic: (vms) => {
        const ok = [...new Set(vms.flatMap((vm) => (c(vm).platforms || {}).excludePlatforms || []))];
        return `Only the listed platforms can connect (${ok.join(", ")}); anything else — including Linux where it is not listed — is blocked.`;
      },
      expect: "Only recognised device platforms can connect.",
      lost: "Access from platforms outside the approved list (for example Linux, where it is not approved)." },
    { id: "guestlock", icon: "🚪", title: "Guests reach only what is shared with them",
      match: (vm) => isBlock(vm) && ((c(vm).users || {}).includeGuestsOrExternalUsers) && ((apps(vm).includeApplications || []).includes("All")) && (apps(vm).excludeApplications || []).length > 0,
      expect: "Guest accounts reach the Office 365 content shared with them (Teams, SharePoint) and nothing else.",
      lost: "Guests browsing applications beyond what was explicitly shared.",
      aud: ["Guests"] },
    { id: "adminO365", icon: "📵", title: "Admin accounts cannot open mail or Office",
      match: (vm) => isBlock(vm) && (apps(vm).includeApplications || []).includes("Office365"),
      expect: "Privileged accounts are for administration only — mail and Office 365 open with the normal account instead.",
      lost: "Reading mail or opening Office 365 with an admin account.",
      aud: ["Administrators", "Guest admins", "External consultants"] },
    { id: "risk", icon: "🚨", title: "Risky sign-ins trigger extra verification",
      match: (vm) => ((c(vm).signInRiskLevels || []).length || (c(vm).userRiskLevels || []).length) && !isBlock(vm),
      expect: "When a sign-in looks unusual (new country, impossible travel, leaked credentials) you are asked to verify again with strong MFA — automatic and protective, not disciplinary.",
      lost: null },
    { id: "riskblock", icon: "⛔", title: "High-risk accounts are paused",
      match: (vm) => ((c(vm).signInRiskLevels || []).length || (c(vm).userRiskLevels || []).length) && isBlock(vm),
      expect: "An account flagged at the configured risk level is blocked until IT investigates and clears it.",
      lost: "Continuing to work on an account the platform has flagged as compromised." },
    { id: "insider", icon: "🕵", title: "Insider-risk signals restrict access",
      match: (vm) => ((c(vm).insiderRiskLevels ? [].concat(c(vm).insiderRiskLevels) : []).length) > 0,
      expect: "Accounts flagged by insider-risk protection get restricted access or must re-accept the terms of use, depending on the level.",
      lost: null },
    { id: "tou", icon: "📜", title: "Terms of use must be accepted",
      match: (vm) => (g(vm).termsOfUse || []).length > 0 && !(c(vm).insiderRiskLevels && [].concat(c(vm).insiderRiskLevels).length),
      expect: "Before first access (or on a schedule) the organization's terms of use must be read and accepted.",
      lost: null },
    { id: "regsec", icon: "🪪", title: "Registering MFA methods is guarded",
      match: (vm) => appAct(vm).some((a) => /registersecurityinfo/i.test(a)),
      expect: "Adding or changing your sign-in methods requires the office network, a managed device or an extra verification step.",
      lost: "Silently registering new MFA methods from anywhere — which is how a phished account is normally taken over for good." },
    { id: "regdev", icon: "🖇", title: "Joining a device asks for MFA",
      match: (vm) => appAct(vm).some((a) => /registerdevice/i.test(a)) || (apps(vm).includeUserActions || []).some((a) => /registerdevice/i.test(a)),
      expect: "Enrolling or joining a device to the organization requires multi-factor authentication.",
      lost: null },
    { id: "devops", icon: "🧰", title: "Azure DevOps is locked down",
      match: (vm) => (apps(vm).includeApplications || []).includes("499b84ac-1321-427f-aa17-267ca6975798") && isBlock(vm),
      expect: "Azure DevOps is reachable only by the DevOps team, and only from trusted network locations.",
      lost: "Opening Azure DevOps from outside the trusted locations, or with a non-DevOps account.",
      aud: ["Developers", "Everyone"] },
  ];

  const STATE_WORD = { on: "live now", report: "staged (report-only)", off: "at go-live" };
  const stateOf = (vm) => vm.state === "on" ? "on" : vm.state === "report" ? "report" : "off";

  function analyze(policies) {
    const items = [];
    for (const rule of RULES) {
      const perAud = new Map();
      for (const vm of policies || []) {
        let a = audienceOf(vm);
        if (!a) continue;
        if (!rule.match(vm)) continue;
        if (rule.aud && !rule.aud.includes(a)) a = rule.aud.includes("Everyone") ? "Everyone" : rule.aud[0];
        if (!perAud.has(a)) perAud.set(a, []);
        perAud.get(a).push(vm);
      }
      for (const [aud, vms] of perAud) {
        const states = { on: 0, report: 0, off: 0 };
        vms.forEach((vm) => states[stateOf(vm)]++);
        items.push({
          rule: rule.id, icon: rule.icon, title: rule.title, aud,
          text: rule.dynamic ? rule.dynamic(vms) : rule.expect,
          expect: rule.expect, lost: rule.lost || null, states,
          liveNow: states.on > 0, atGoLive: states.on === 0,
          pols: vms.map((vm) => ({ id: vm.raw && vm.raw.id, seq: vm.seq, name: vm.name, state: stateOf(vm) })),
        });
      }
    }
    items.sort((x, y) => AUD_ORDER.indexOf(x.aud) - AUD_ORDER.indexOf(y.aud) || (y.lost ? 1 : 0) - (x.lost ? 1 : 0));
    const total = (policies || []).length;
    const counts = { on: 0, report: 0, off: 0 };
    (policies || []).forEach((vm) => counts[stateOf(vm)]++);
    return { items, total, counts, audiences: [...new Set(items.map((i) => i.aud))].sort((a, b2) => AUD_ORDER.indexOf(a) - AUD_ORDER.indexOf(b2)) };
  }

  // ---------- Markdown (the communication draft) ----------
  function toMd(res, { tenantName } = {}) {
    const d = new Date().toISOString().slice(0, 10);
    const out = [];
    out.push(`# Conditional Access — what you will notice`);
    out.push(`> ${tenantName || "This organization"} · generated ${d} from the tenant's own ${res.total} Conditional Access policies (${res.counts.on} enforced, ${res.counts.report} report-only, ${res.counts.off} prepared). Draft for the communications team — review before sending.`);
    out.push(``);
    out.push(`Conditional Access checks every sign-in — who you are, how healthy the device is and where the sign-in comes from — before access is granted. It reads sign-in signals only: it never opens your mail, chats or documents, and it is not used to monitor performance.`);
    out.push(``);
    const live = res.items.filter((i) => i.liveNow);
    const later = res.items.filter((i) => !i.liveNow);
    if (live.length) {
      out.push(`## Already live today`);
      for (const i of live) out.push(`- ${i.icon} **${i.title}** (${i.aud}) — ${i.text}`);
      out.push(``);
    }
    out.push(`## What changes when fully onboarded`);
    for (const aud of res.audiences) {
      const rows = later.filter((i) => i.aud === aud);
      if (!rows.length) continue;
      out.push(`### ${aud}`);
      for (const i of rows) out.push(`- ${i.icon} **${i.title}** — ${i.text}`);
      out.push(``);
    }
    const lost = res.items.filter((i) => i.lost);
    if (lost.length) {
      out.push(`## What will no longer be possible`);
      out.push(`These are deliberate outcomes of the security design — each one closes a route attackers actively use.`);
      const seen = new Set();
      for (const i of lost) {
        const key = i.rule + "|" + i.lost;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`- **${i.lost}** _(${i.aud}${i.liveNow ? " — already in effect" : ""})_`);
      }
      out.push(``);
    }
    out.push(`## If you are blocked`);
    out.push(`Contact the IT helpdesk with the time of the sign-in and the message on screen. A block is almost always: an unmanaged or non-compliant device, an unapproved country, the secure network client not running, a legacy protocol, or a risk detection — every one has a controlled exception process.`);
    out.push(``);
    out.push(`---`);
    out.push(`### Appendix — the policies behind each statement`);
    for (const i of res.items) {
      out.push(`- ${i.icon} ${i.title} (${i.aud}): ${i.pols.map((p2) => `${p2.name} [${STATE_WORD[p2.state]}]`).join("; ")}`);
    }
    return out.join("\n");
  }

  // ---------- Word (.docx) — text document, no images ----------
  const X = (t) => String(t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const P = (t, o = {}) => `<w:p><w:pPr>${o.h ? `<w:spacing w:before="${o.h === 1 ? 320 : 240}" w:after="120"/>` : `<w:spacing w:after="120"/>`}</w:pPr>` +
    (Array.isArray(t) ? t : [[t, o]]).map(([txt, ro = {}]) =>
      `<w:r><w:rPr>${ro.b || o.b || o.h ? "<w:b/>" : ""}${o.h ? `<w:sz w:val="${o.h === 1 ? 32 : 26}"/><w:color w:val="1F4E79"/>` : ""}${ro.i ? "<w:i/>" : ""}</w:rPr><w:t xml:space="preserve">${X(txt)}</w:t></w:r>`).join("") + `</w:p>`;

  function toDocx(res, { tenantName } = {}) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
    const d = new Date().toISOString().slice(0, 10);
    const body = [];
    body.push(P(`Conditional Access — what you will notice`, { h: 1 }));
    body.push(P(`${tenantName || "This organization"} · generated ${d} from ${res.total} Conditional Access policies (${res.counts.on} enforced, ${res.counts.report} report-only, ${res.counts.off} prepared). Draft — review before sending.`));
    body.push(P(`Conditional Access checks every sign-in — who you are, how healthy the device is and where the sign-in comes from — before access is granted. It reads sign-in signals only: it never opens your mail, chats or documents, and it is not used to monitor performance.`));
    const live = res.items.filter((i) => i.liveNow);
    const later = res.items.filter((i) => !i.liveNow);
    if (live.length) {
      body.push(P(`Already live today`, { h: 2 }));
      for (const i of live) body.push(P([[`• ${i.title} (${i.aud}): `, { b: true }], [i.text, {}]]));
    }
    body.push(P(`What changes when fully onboarded`, { h: 2 }));
    for (const aud of res.audiences) {
      const rows = later.filter((i) => i.aud === aud);
      if (!rows.length) continue;
      body.push(P(aud, { h: 2 }));
      for (const i of rows) body.push(P([[`• ${i.title}: `, { b: true }], [i.text, {}]]));
    }
    const lost = res.items.filter((i) => i.lost);
    if (lost.length) {
      body.push(P(`What will no longer be possible`, { h: 2 }));
      body.push(P(`These are deliberate outcomes of the security design — each one closes a route attackers actively use.`));
      const seen = new Set();
      for (const i of lost) {
        const key = i.rule + "|" + i.lost;
        if (seen.has(key)) continue;
        seen.add(key);
        body.push(P([[`• ${i.lost}`, { b: true }], [` (${i.aud}${i.liveNow ? " — already in effect" : ""})`, { i: true }]]));
      }
    }
    body.push(P(`If you are blocked`, { h: 2 }));
    body.push(P(`Contact the IT helpdesk with the time of the sign-in and the message on screen. A block is almost always: an unmanaged or non-compliant device, an unapproved country, the secure network client not running, a legacy protocol, or a risk detection — every one has a controlled exception process.`));
    body.push(P(`Appendix — the policies behind each statement`, { h: 2 }));
    for (const i of res.items) body.push(P(`${i.title} (${i.aud}): ${i.pols.map((p2) => `${p2.name} [${STATE_WORD[p2.state]}]`).join("; ")}`));

    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1250" w:bottom="1080" w:left="1250"/></w:sectPr>
</w:body></w:document>`);
    return zip;
  }

  return { analyze, toMd, toDocx, STATE_WORD };
})();
