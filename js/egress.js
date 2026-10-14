// ======================================================================
// 🛰 Egress & location impact — T57, Workspace 03 · Entra Tools, a
// TEMPORARY tool (beta 32525, P-2716).
//
// Mihai, 14 Oct 2026, on P-2716 (Netskope and trusted locations): "this is
// now checked against the devcf tenant, I will need a tool in ENCA to verify
// this against that tenant. It can be a temporary tool." On the mockup:
// "build as mockup, but country should be lookup".
//
// The question: what happens to Conditional Access when sign-ins leave
// through a different public IP — a cloud proxy (Netskope, Zscaler), a new
// office line, a VPN. Entra evaluates the IP that reaches it (a proxy's
// X-Forwarded-For is ignored), and the country is looked up from that IP.
// Every policy with a location condition is evaluated twice: TODAY (signing
// in from the trusted office ranges) and VIA THE EGRESS, side by side.
//
// PURE: no Graph, no DOM. app.js reads the policies, the named locations and
// the sign-in log, and calls
//   Egress.parse(text)                     → { entries[], bad[] }
//   Egress.country(signIns)                → the country Entra recorded for an IP
//   Egress.model(input)                    → { rows[], findings[], summary, ... }
//   Egress.render(model, ui)               → the tiles, the flow, the table, the findings
//   Egress.markdown(model, { filter })     → the same, for the P-2716 write-up: verdicts + details
//   Egress.demo()                          → a devcf-shaped read for ?demo=1
// Reads only. Nothing is written to the tenant.
// ======================================================================
const Egress = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const BREAK_GLASS_RE = /break[\s-]?glass|emergency[\s-]?access|emergency_access|e-admins/i;
  const MFA_TRUSTED_IPS = "00000000-0000-0000-0000-000000000000";   // the legacy MFA trusted IPs pseudo-location
  const REGISTER = "urn:user:registersecurityinfo";

  // ---- IP parsing and CIDR containment, IPv4 and IPv6 -------------------
  function v4(ip) {
    const p = String(ip).trim().split(".");
    if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
    return BigInt(((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3]);
  }
  function v6(ip) {
    let s = String(ip).trim().toLowerCase();
    if (!s.includes(":") || !/^[0-9a-f:.]+$/.test(s)) return null;
    // an embedded IPv4 tail (::ffff:1.2.3.4)
    const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (m) { const t = v4(m[2]); if (t == null) return null; s = m[1] + ((t >> 16n) & 0xffffn).toString(16) + ":" + (t & 0xffffn).toString(16); }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
    const groups = [...head, ...Array(fill).fill("0"), ...tail];
    if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n);
  }
  // "1.2.3.4", "1.2.3.0/24", "2001:db8::/48" → { fam, net, bits, text } or null
  function cidr(text) {
    const [addr, bitsRaw] = String(text || "").trim().split("/");
    const a4 = v4(addr), a6 = a4 == null ? v6(addr) : null;
    if (a4 == null && a6 == null) return null;
    const fam = a4 != null ? 4 : 6, max = fam === 4 ? 32 : 128;
    const bits = bitsRaw == null || bitsRaw === "" ? max : /^\d+$/.test(bitsRaw) ? +bitsRaw : NaN;
    if (!(bits >= 0 && bits <= max)) return null;
    const val = fam === 4 ? a4 : a6;
    const mask = bits === 0 ? 0n : ((1n << BigInt(max)) - 1n) ^ ((1n << BigInt(max - bits)) - 1n);
    return { fam, net: val & mask, bits, max, text: String(text).trim() };
  }
  // Is range a inside range b (a single IP is a /32 or /128)?
  function within(a, b) {
    if (!a || !b || a.fam !== b.fam || a.bits < b.bits) return false;
    const mask = b.bits === 0 ? 0n : ((1n << BigInt(b.max)) - 1n) ^ ((1n << BigInt(b.max - b.bits)) - 1n);
    return (a.net & mask) === b.net;
  }
  const overlaps = (a, b) => !!a && !!b && a.fam === b.fam && (within(a, b) || within(b, a));

  // The pasted egress list: one per line, commas and spaces also split.
  function parse(text) {
    const entries = [], bad = [];
    for (const tok of String(text || "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)) {
      const c = cidr(tok);
      if (c) { if (!entries.some((e) => e.text === c.text)) entries.push(c); } else bad.push(tok);
    }
    return { entries, bad };
  }
  // A single address (a /32 or /128) can be looked up in the sign-in log.
  const isHost = (e) => e && e.bits === e.max;
  const hostText = (e) => String(e.text).split("/")[0];

  // ---- the country Entra recorded for an IP -----------------------------
  // signIns: rows with location.countryOrRegion. The most frequent country
  // wins; ties go to the most recent. { country, seen, at } or null.
  function country(signIns) {
    const tally = new Map();
    for (const s of signIns || []) {
      const c = String((s.location && s.location.countryOrRegion) || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(c)) continue;
      const t = tally.get(c) || { country: c, seen: 0, at: "" };
      t.seen++; if ((s.createdDateTime || "") > t.at) t.at = s.createdDateTime || "";
      tally.set(c, t);
    }
    const all = [...tally.values()].sort((a, b) => b.seen - a.seen || b.at.localeCompare(a.at));
    return all.length ? Object.assign({}, all[0], { others: all.slice(1).map((x) => x.country) }) : null;
  }

  // ---- where a sign-in sits ---------------------------------------------
  const isCountryLoc = (l) => String((l && l["@odata.type"]) || "").toLowerCase().includes("country");
  const isIpLoc = (l) => String((l && l["@odata.type"]) || "").toLowerCase().includes("ipnamedlocation");
  const locRanges = (l) => (l.ipRanges || []).map((r) => cidr(r.cidrAddress)).filter(Boolean);
  // scenario: { ips: [cidr], country: "NL" | "" , extraTrusted: bool }
  // → { ids:Set, trusted:bool, unknown:Set (locations that cannot be judged), partial:Set }
  function placement(sc, locations) {
    const ids = new Set(), unknown = new Set(), partial = new Set();
    let trusted = false;
    for (const l of locations || []) {
      if (isCountryLoc(l)) {
        if (l.countryLookupMethod === "authenticatorAppGps") { unknown.add(l.id); continue; }
        const list = (l.countriesAndRegions || []).map((c) => String(c).toUpperCase());
        const hit = sc.country ? list.includes(String(sc.country).toUpperCase()) : !!l.includeUnknownCountriesAndRegions;
        if (!sc.country && !l.includeUnknownCountriesAndRegions) unknown.add(l.id);
        if (hit) ids.add(l.id);
      } else if (isIpLoc(l)) {
        const rs = locRanges(l);
        const hits = (sc.ips || []).map((ip) => rs.some((r) => within(ip, r)));
        if (hits.length && hits.every(Boolean)) { ids.add(l.id); if (l.isTrusted) trusted = true; }
        else if (hits.some(Boolean) || (sc.ips || []).some((ip) => rs.some((r) => overlaps(ip, r)))) partial.add(l.id);
      } else if (l && l.id) unknown.add(l.id);     // compliant network and other kinds: not judged by IP
    }
    if (sc.extraTrusted) trusted = true;
    return { ids, trusted, unknown, partial };
  }

  // ---- one policy -------------------------------------------------------
  const arr = (x) => (Array.isArray(x) ? x : []);
  function locCond(raw) {
    const l = (raw.conditions && raw.conditions.locations) || null;
    if (!l) return null;
    const inc = arr(l.includeLocations), exc = arr(l.excludeLocations);
    if (!inc.length && !exc.length) return null;
    return { inc, exc };
  }
  // Does the location condition put this sign-in in scope? true / false / null (cannot judge)
  function locApplies(cond, pl) {
    const has = (id) => pl.ids.has(id);
    const judge = (id) => (id === "All" ? true : id === "AllTrusted" ? pl.trusted : id === MFA_TRUSTED_IPS ? null : pl.unknown.has(id) ? null : has(id));
    const incV = cond.inc.map(judge);
    const inInc = cond.inc.length === 0 ? true : incV.some((v) => v === true) ? true : incV.some((v) => v === null) ? null : false;
    const excV = cond.exc.map(judge);
    const inExc = excV.some((v) => v === true) ? true : excV.some((v) => v === null) ? null : false;
    if (inInc === false || inExc === true) return false;
    if (inInc === null || inExc === null) return null;
    return true;
  }
  function control(raw) {
    const g = raw.grantControls || {}, s = raw.sessionControls || {};
    const built = arr(g.builtInControls);
    if (built.includes("block")) return { kind: "block", text: "Block" };
    const parts = [];
    if (g.authenticationStrength) parts.push(g.authenticationStrength.displayName || "Authentication strength");
    const W = { mfa: "MFA", compliantDevice: "Compliant device", domainJoinedDevice: "Hybrid joined device", approvedApplication: "Approved app", compliantApplication: "App protection", passwordChange: "Password change" };
    built.forEach((b) => parts.push(W[b] || b));
    if (arr(g.termsOfUse).length) parts.push("Terms of use");
    if (parts.length) return { kind: "grant", text: parts.join(g.operator === "AND" ? " + " : " or ") };
    const ss = [];
    if (s.signInFrequency && s.signInFrequency.isEnabled) ss.push(s.signInFrequency.frequencyInterval === "everyTime" ? "Sign-in every time" : `Sign-in frequency ${s.signInFrequency.value || ""}${s.signInFrequency.type === "days" ? "d" : "h"}`);
    if (s.persistentBrowser && s.persistentBrowser.isEnabled) ss.push(s.persistentBrowser.mode === "never" ? "No persistent browser" : "Persistent browser");
    if (s.applicationEnforcedRestrictions && s.applicationEnforcedRestrictions.isEnabled) ss.push("App-enforced restrictions");
    if (s.cloudAppSecurity && s.cloudAppSecurity.isEnabled) ss.push("App control");
    if (s.continuousAccessEvaluation && s.continuousAccessEvaluation.mode) ss.push(`CAE ${s.continuousAccessEvaluation.mode}`);
    if (s.secureSignInSession && s.secureSignInSession.isEnabled) ss.push("Token protection");
    if (ss.length) return { kind: "session", text: ss.join(", ") };
    return { kind: "none", text: "—" };
  }
  // Who the policy covers, in words; and whether it reaches break-glass or everyone.
  function who(raw, names) {
    const u = (raw.conditions && raw.conditions.users) || {}, ca = (raw.conditions && raw.conditions.clientApplications) || null;
    const nm = (id) => (names && names[id]) || id;
    const inc = [], exc = [];
    if (arr(u.includeUsers).includes("All")) inc.push("All users");
    else arr(u.includeUsers).filter((x) => x !== "None").forEach((x) => inc.push(x === "GuestsOrExternalUsers" ? "Guests" : nm(x)));
    arr(u.includeGroups).forEach((g) => inc.push(nm(g)));
    arr(u.includeRoles).forEach((r) => inc.push(nm(r)));
    if (u.includeGuestsOrExternalUsers) inc.push("Guests / external users");
    const sps = ca ? arr(ca.includeServicePrincipals) : [];
    if (sps.length) inc.push(sps.includes("ServicePrincipalsInMyTenant") ? "All service principals" : `${sps.length} service principal${sps.length === 1 ? "" : "s"}`);
    arr(u.excludeUsers).forEach((x) => exc.push(x === "GuestsOrExternalUsers" ? "Guests" : nm(x)));
    arr(u.excludeGroups).forEach((g) => exc.push(nm(g)));
    arr(u.excludeRoles).forEach((r) => exc.push(nm(r)));
    if (u.excludeGuestsOrExternalUsers) exc.push("guests / external");
    const allUsers = arr(u.includeUsers).includes("All");
    const bgIn = [...arr(u.includeGroups), ...arr(u.includeUsers)].some((id) => BREAK_GLASS_RE.test(nm(id)));
    return { inc, exc, allUsers, breakGlass: bgIn, workload: !!sps.length, nobody: !inc.length };
  }
  function targets(raw) {
    const a = (raw.conditions && raw.conditions.applications) || {};
    const inc = arr(a.includeApplications), acts = arr(a.includeUserActions), ctx = arr(a.includeAuthenticationContextClassReferences);
    if (acts.includes(REGISTER)) return { text: "Register security info", none: false, register: true };
    if (acts.length) return { text: acts.join(", "), none: false };
    if (ctx.length) return { text: `Authentication context ${ctx.join(", ")}`, none: false };
    if (a.applicationFilter) return { text: "Apps by filter", none: false };
    if (!inc.length || (inc.length === 1 && inc[0] === "None")) return { text: "None", none: true };
    if (inc.includes("All")) { const ex = arr(a.excludeApplications).length; return { text: `All resources${ex ? `, except ${ex}` : ""}`, none: false }; }
    return { text: `${inc.length} app${inc.length === 1 ? "" : "s"}`, none: false };
  }
  function locText(cond, locs) {
    const nm = (id) => (id === "All" ? "All" : id === "AllTrusted" ? "all trusted" : id === MFA_TRUSTED_IPS ? "MFA trusted IPs" : ((locs.find((l) => l.id === id) || {}).displayName || `missing ${id.slice(0, 8)}`));
    const inc = cond.inc.map(nm).join(", ") || "All", exc = cond.exc.map(nm).join(", ");
    return exc ? `${inc}, except ${exc}` : inc;
  }

  // The impact of the change from today to via-egress.
  // tone: r (lockout), o (a group blocked / protection lost), y (extra prompt / session), i (info), g (no change)
  function impact(row) {
    const { today, via, ctl, w, tg } = row;
    if (tg.none) return { tone: "i", text: "config: targets nothing", key: "noop" };
    if (row.noDep) return { tone: "g", text: "no location dependency", key: "nodep" };
    if (today === via) return via === null ? { tone: "i", text: "cannot judge", key: "unknown" } : { tone: "g", text: "no change", key: "same" };
    if (via === null || today === null) return { tone: "i", text: "cannot judge — see the location", key: "unknown" };
    if (via && !today) {
      if (ctl.kind === "block") {
        if (w.allUsers) return { tone: "r", text: "everyone blocked", key: "block" };
        if (w.breakGlass) return { tone: "r", text: "break-glass blocked", key: "block" };
        if (w.workload) return { tone: "o", text: "workload identities blocked", key: "block" };
        return { tone: "o", text: "group blocked", key: "block" };
      }
      if (ctl.kind === "grant") return { tone: "y", text: tg.register ? "MFA to register" : `now requires ${ctl.text}`, key: "more" };
      if (ctl.kind === "session") return { tone: "y", text: "session change", key: "more" };
      return { tone: "g", text: "applies, no control", key: "same" };
    }
    // applied today, not via egress: protection the office path had
    if (ctl.kind === "block") return { tone: "i", text: "block no longer applies", key: "less" };
    return { tone: "o", text: "control no longer applies", key: "less" };
  }

  // input: { policies:[{raw,name}], locations:[], names:{}, egress:[cidr], country, officeCountry, mode:"asis"|"trusted" }
  function model(input) {
    const locs = input.locations || [];
    const trustedIp = locs.filter((l) => isIpLoc(l) && l.isTrusted);
    const officeIps = trustedIp.flatMap(locRanges).slice(0, 1).length ? trustedIp.map((l) => locRanges(l)[0]).filter(Boolean) : [];
    // TODAY: a sign-in inside every trusted IP location, from the office country.
    const today = { ids: new Set(trustedIp.map((l) => l.id)), trusted: trustedIp.length > 0, unknown: new Set(), partial: new Set() };
    const officeCountry = input.officeCountry || "";
    for (const l of locs.filter(isCountryLoc)) {
      if (l.countryLookupMethod === "authenticatorAppGps") { today.unknown.add(l.id); continue; }
      const list = (l.countriesAndRegions || []).map((c) => String(c).toUpperCase());
      if (officeCountry ? list.includes(officeCountry.toUpperCase()) : l.includeUnknownCountriesAndRegions) today.ids.add(l.id);
      else if (!officeCountry) today.unknown.add(l.id);
    }
    for (const l of locs) if (!isIpLoc(l) && !isCountryLoc(l) && l.id) today.unknown.add(l.id);
    const egress = input.egress || [];
    const via = placement({ ips: egress, country: input.country || "", extraTrusted: input.mode === "trusted" }, locs);
    const viaAsIs = input.mode === "trusted" ? placement({ ips: egress, country: input.country || "" }, locs) : via;

    const rows = [];
    for (const p of input.policies || []) {
      const raw = p.raw || p, cond = locCond(raw);
      if (!cond) continue;
      const w = who(raw, input.names), tg = targets(raw), ctl = control(raw);
      const noDep = cond.inc.length === 1 && cond.inc[0] === "All" && !cond.exc.length;
      const row = {
        id: raw.id, name: raw.displayName || p.name || raw.id, state: raw.state || "",
        w, tg, ctl, cond, loc: locText(cond, locs), noDep,
        today: egress.length ? locApplies(cond, today) : locApplies(cond, today),
        via: egress.length ? locApplies(cond, via) : null,
        specific: [...cond.inc, ...cond.exc].filter((id) => id !== "All" && id !== "AllTrusted"),
        allTrusted: [...cond.inc, ...cond.exc].includes("AllTrusted"),
        cae: (raw.sessionControls && raw.sessionControls.continuousAccessEvaluation && raw.sessionControls.continuousAccessEvaluation.mode) || "",
      };
      row.imp = egress.length ? impact(row) : { tone: "i", text: "enter the egress", key: "wait" };
      rows.push(row);
    }
    const ord = { r: 0, o: 1, y: 2, i: 3, g: 4 };
    rows.sort((a, b) => ord[a.imp.tone] - ord[b.imp.tone] || (a.state === "enabled" ? -1 : 0) - (b.state === "enabled" ? -1 : 0) || a.name.localeCompare(b.name));

    // ---- findings ----
    const F = [];
    const nm = (id) => ((locs.find((l) => l.id === id) || {}).displayName || id);
    const st = (r) => (r.state === "enabled" ? "on" : r.state === "disabled" ? "off" : "report-only");
    const lockouts = rows.filter((r) => r.imp.tone === "r");
    lockouts.forEach((r) => F.push({ sev: "High", tone: "r", text: `${r.name} (${st(r)}) — ${r.imp.text} via the egress${r.state === "enabled" ? "" : ", once it is on"}.` }));
    rows.filter((r) => r.ctl.kind === "block" && r.w.breakGlass && r.imp.tone !== "r").forEach((r) => F.push({ sev: "High", tone: "r", text: `${r.name} blocks the break-glass group on location (${r.loc}) — emergency access depends on the network path.` }));
    rows.filter((r) => r.tg.none).forEach((r) => F.push({ sev: "Info", tone: "i", text: `${r.name} has a location condition but targets no resources (None) — it never applies.` }));
    if (egress.length && input.mode === "trusted") {
      const stuck = rows.filter((r) => r.specific.length && r.imp.key !== "same" && r.imp.key !== "nodep" && r.imp.key !== "noop");
      if (stuck.length) F.push({ sev: "Medium", tone: "o", text: `A NEW trusted location does not help ${stuck.length} polic${stuck.length === 1 ? "y" : "ies"} that name locations directly (${[...new Set(stuck.flatMap((r) => r.specific))].map(nm).join(", ")}): add the egress to those locations, or change the policy to all trusted.` });
    }
    const allT = rows.filter((r) => r.allTrusted);
    if (allT.length) F.push({ sev: "Info", tone: "i", text: `${allT.length} polic${allT.length === 1 ? "y depends" : "ies depend"} on all trusted locations — the egress counts only once a named location marked TRUSTED holds it${viaAsIs.trusted ? " (it already does)" : ""}.` });
    const strict = rows.filter((r) => /strict/i.test(r.cae));
    F.push(strict.length
      ? { sev: "Medium", tone: "o", text: `${strict.length} polic${strict.length === 1 ? "y uses" : "ies use"} CAE strict location enforcement — a proxy that sees a different IP than the resource blocks the session.` }
      : { sev: "OK", tone: "g", text: "No policy uses CAE strict location enforcement — an IP mismatch between Entra and the resource gives a one-hour token, not a block." });
    if (egress.length) {
      const inLocs = [...viaAsIs.ids].filter((id) => isIpLoc(locs.find((l) => l.id === id) || {}));
      if (inLocs.length) F.push({ sev: "Info", tone: "i", text: `The egress is already inside ${inLocs.map(nm).join(", ")}${viaAsIs.trusted ? " (trusted)" : " (not trusted)"}.` });
      else F.push({ sev: "Info", tone: "i", text: "The egress is in no IP named location yet." });
      const part = [...viaAsIs.partial].map(nm);
      if (part.length) F.push({ sev: "Medium", tone: "o", text: `Only part of the egress list falls inside ${part.join(", ")} — sign-ins from the rest are treated as outside.` });
      if (!input.country) F.push({ sev: "Medium", tone: "o", text: "The country of the egress is unknown — country locations could not be judged. Look it up, or pick it." });
      const v6 = egress.some((e) => e.fam === 6), locV6 = trustedIp.some((l) => locRanges(l).some((r) => r.fam === 6));
      if (locV6 && !v6) F.push({ sev: "Info", tone: "i", text: "A trusted location holds IPv6 ranges and the egress list has none — check whether the proxy also egresses over IPv6." });
    }
    locs.filter((l) => isCountryLoc(l) && l.countryLookupMethod === "authenticatorAppGps").forEach((l) => F.push({ sev: "Info", tone: "i", text: `${l.displayName} uses GPS from Authenticator, not the IP — not judged here.` }));
    const ordS = { High: 0, Medium: 1, Info: 2, OK: 3 };
    F.sort((a, b) => ordS[a.sev] - ordS[b.sev]);

    const count = (f) => rows.filter(f).length;
    const summary = {
      total: rows.length,
      on: count((r) => r.state === "enabled"), ro: count((r) => r.state === "enabledForReportingButNotEnforced"), off: count((r) => r.state === "disabled"),
      blocks: count((r) => r.imp.key === "block"),
      lockouts: lockouts.length,
      changes: count((r) => r.imp.key === "more" || r.imp.key === "less"),
      nodep: count((r) => r.noDep),
      noop: count((r) => r.tg.none),
      unknown: count((r) => r.imp.key === "unknown"),
      changed: count((r) => ["block", "more", "less", "unknown"].includes(r.imp.key)),
    };
    return {
      rows, findings: F, summary, egress, country: input.country || "", officeCountry, mode: input.mode || "asis",
      office: { ips: officeIps.map((c) => c.text), names: trustedIp.map((l) => l.displayName) },
      viaNames: [...viaAsIs.ids].map(nm), locCount: locs.length,
    };
  }

  // ---- render -----------------------------------------------------------
  const TONE = { r: "eg-r", o: "eg-o", y: "eg-y", i: "eg-i", g: "eg-g" };
  const stTag = (s) => (s === "enabled" ? '<span class="tag ok">on</span>' : s === "disabled" ? '<span class="tag">off</span>' : '<span class="tag new">report-only</span>');
  const verdict = (v, r) => (r.tg.none ? '<span class="muted">— (targets none)</span>' : r.noDep ? '<span class="muted">applies (no dependency)</span>' : v === null ? '<span class="muted">cannot judge</span>' : v ? (r.ctl.kind === "block" ? '<b class="eg-bad">BLOCK</b>' : '<b class="eg-warnt">applies</b>') : '<span class="eg-okt">not applied</span>');
  function render(m, ui) {
    const u = ui || {}, s = m.summary, filter = u.filter || "changes";
    const tile = (n, label, cls) => `<div class="eg-tile${cls ? " " + cls : ""}"><b>${n}</b><small>${label}</small></div>`;
    const tiles = `<div class="eg-tiles">
      ${tile(s.total, `polic${s.total === 1 ? "y names" : "ies name"} a location · ${s.on} on · ${s.ro} report-only · ${s.off} off`)}
      ${tile(s.blocks, "would BLOCK a group via the egress", s.blocks ? "bad" : "")}
      ${tile(s.lockouts, "lockout risk: everyone or break-glass", s.lockouts ? "bad" : "")}
      ${tile(s.changes, "change behaviour: extra MFA, a session control, or protection lost", s.changes ? "warn" : "")}
      ${tile(s.nodep + s.noop, "name a location but do not depend on it")}
    </div>`;
    const eg = m.egress.length ? `${esc(m.egress.slice(0, 2).map((e) => e.text).join(", "))}${m.egress.length > 2 ? ` +${m.egress.length - 2}` : ""}` : "—";
    const flow = `<div class="eg-flow">
      <span class="eg-node">Office today<br><small>${esc(m.office.names.join(", ") || "no trusted IP location")}${m.officeCountry ? ` · ${esc(m.officeCountry)}` : ""} ${m.office.names.length ? "✓ trusted" : ""}</small></span><span class="muted">→</span><span class="eg-node">Entra ID</span>
      <span class="eg-gap"></span>
      <span class="eg-node">Via the egress<br><small>${eg} · ${m.viaNames.length ? esc(m.viaNames.join(", ")) : "no location"} · ${esc(m.country || "country ?")}${m.mode === "trusted" ? " · simulated TRUSTED" : ""}</small></span><span class="muted">→</span><span class="eg-node">Entra ID</span>
    </div>`;
    const list = filterRows(m, filter);
    const seg = (k, label) => `<button type="button" data-egfilter="${k}" class="${filter === k ? "active" : ""}">${label}</button>`;
    const table = `<div class="list-card eg-card">
      <div class="eg-tablehead"><b>Policies with a location condition</b>
        <div class="seg">${seg("changes", `Changes only (${m.rows.filter((r) => ["block", "more", "less", "unknown", "noop"].includes(r.imp.key)).length})`)}${seg("all", `All ${m.rows.length}`)}${seg("on", `On only (${s.on})`)}</div></div>
      ${list.length ? `<div class="eg-scroll"><table class="eg-table"><thead><tr><th>Policy</th><th>State</th><th>Who</th><th>Target</th><th>Location rule</th><th>Control</th><th>Today</th><th>Via egress</th><th>Impact</th></tr></thead><tbody>
      ${list.map((r) => `<tr>
        <td><a href="#" data-egpol="${esc(r.id)}">${esc(r.name)}</a></td><td>${stTag(r.state)}</td>
        <td>${esc(r.w.inc.join(", ") || "nobody")}${r.w.exc.length ? `<div class="mini muted">excl. ${esc(r.w.exc.join(", "))}</div>` : ""}</td>
        <td>${r.tg.none ? '<b class="eg-bad">None</b>' : esc(r.tg.text)}</td><td>${esc(r.loc)}</td><td>${esc(r.ctl.text)}</td>
        <td>${verdict(r.today, r)}</td><td>${m.egress.length ? verdict(r.via, r) : '<span class="muted">—</span>'}</td>
        <td><span class="eg-imp ${TONE[r.imp.tone]}">${esc(r.imp.text)}</span>${r.state !== "enabled" && ["r", "o"].includes(r.imp.tone) ? '<div class="mini muted">once on</div>' : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="mini muted">${m.rows.length ? "Nothing changes in this view — switch to All." : "No policy in this tenant has a location condition."}</p>`}
    </div>`;
    const finds = `<div class="list-card eg-card"><b>Findings</b><ul class="eg-finds">${m.findings.map((f) => `<li><span class="eg-imp ${TONE[f.tone]}">${esc(f.sev)}</span> ${esc(f.text)}</li>`).join("")}</ul>
      <p class="mini muted" style="margin:6px 0 0">The options — dedicated egress IPs in a trusted location, a steering bypass for the Microsoft sign-in endpoints, PoP pinning, device and authentication trust instead of the network — are in Help → 🛰 Egress &amp; location impact.</p></div>`;
    return `${tiles}${flow}${table}${finds}`;
  }

  // ---- markdown ---------------------------------------------------------
  // 0.2.0 (32604, Mihai: "when exporting the view becomes scrollable"; chose
  // option A from the mockup): one 9-column table with the Who column's
  // exclusion lists could not fit a Markdown preview and scrolled sideways.
  // Now a narrow VERDICT table (Policy · State · Today · Via egress · Impact)
  // that every row can be compared in, then DETAILS per policy — who,
  // excluded, target, rule, control — as a short list. The export follows the
  // table's filter (Changes only / All / On only) and says which it used.
  const FILTERS = { changes: "Changes only", all: "All", on: "On only" };
  const CHANGE_KEYS = ["block", "more", "less", "unknown", "noop"];
  function filterRows(m, filter) {
    return m.rows.filter((r) => filter === "all" ? true : filter === "on" ? r.state === "enabled" : CHANGE_KEYS.includes(r.imp.key));
  }
  function markdown(m, meta) {
    const x = meta || {}, s = m.summary, cell = (t) => String(t ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
    const filter = FILTERS[x.filter] ? x.filter : "all";
    const rows = filterRows(m, filter);
    const v = (val, r) => (r.tg.none ? "— (targets none)" : r.noDep ? "applies (no dependency)" : val === null ? "cannot judge" : val ? (r.ctl.kind === "block" ? "BLOCK" : "applies") : "not applied");
    const st = (r) => r.state === "enabled" ? "on" : r.state === "disabled" ? "off" : "report-only";
    const once = (r) => r.state !== "enabled" && ["r", "o"].includes(r.imp.tone) ? " (once on)" : "";
    const L = [];
    L.push(`# Egress & location impact${x.tenant ? ` — ${x.tenant}` : ""}`, "");
    L.push(`Read ${x.at || new Date().toISOString()} by ENCA T57 (reads only).`, "");
    L.push(`- Egress: ${m.egress.map((e) => e.text).join(", ") || "—"}`);
    L.push(`- Egress country: ${m.country || "unknown"}${x.countrySource ? ` (${x.countrySource})` : ""}`);
    L.push(`- Office today: ${m.office.names.join(", ") || "no trusted IP location"}${m.officeCountry ? ` · ${m.officeCountry}` : ""}`);
    L.push(`- Compared: ${m.mode === "trusted" ? "as if the egress were in a NEW trusted named location" : "as it is"}`);
    L.push(`- Shown: ${FILTERS[filter]} — ${rows.length} of ${m.rows.length} policies`, "");
    L.push(`**${s.total}** policies name a location (${s.on} on, ${s.ro} report-only, ${s.off} off) · **${s.blocks}** would block a group · **${s.lockouts}** lockout risk · **${s.changes}** change behaviour · ${s.nodep + s.noop} do not depend on it.`, "");
    L.push("## Verdicts", "");
    if (rows.length) {
      L.push("| Policy | State | Today | Via egress | Impact |", "|---|---|---|---|---|");
      rows.forEach((r) => L.push(`| ${cell(r.name)} | ${st(r)} | ${v(r.today, r)} | ${m.egress.length ? v(r.via, r) : "—"} | ${cell(r.imp.text)}${once(r)} |`));
    } else L.push("Nothing in this view.");
    L.push("");
    if (rows.length) L.push("## Details", "");
    rows.forEach((r) => {
      L.push(`### ${cell(r.name)}`, "");
      L.push(`- Who: ${r.w.inc.join(", ") || "nobody"}`);
      if (r.w.exc.length) L.push(`- Excluded (${r.w.exc.length}): ${r.w.exc.join(", ")}`);
      L.push(`- Target: ${r.tg.text} · Location rule: ${r.loc} · Control: ${r.ctl.text}`, "");
    });
    L.push("## Findings", "");
    m.findings.forEach((f) => L.push(`- **${f.sev}** — ${f.text}`));
    L.push("");
    return L.join("\n");
  }

  // ---- demo: devcf-shaped -------------------------------------------------
  function demo() {
    const P = (id, name, state, users, apps, inc, exc, grant, session, extra) => ({ raw: Object.assign({ id, displayName: name, state,
      conditions: Object.assign({ users, applications: apps, locations: { includeLocations: inc, excludeLocations: exc } }, extra || {}),
      grantControls: grant, sessionControls: session || null }) });
    const all = { includeApplications: ["All"] }, none = { includeApplications: ["None"] }, reg = { includeApplications: [], includeUserActions: [REGISTER] };
    const blk = { operator: "OR", builtInControls: ["block"] };
    const mfa = { operator: "OR", builtInControls: [], authenticationStrength: { displayName: "Multifactor authentication" } };
    return {
      locations: [
        { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-hq", displayName: "HeadQuarters", isTrusted: true, ipRanges: [{ cidrAddress: "203.0.113.10/32" }, { cidrAddress: "2001:db8:208d:c900::/64" }] },
        { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-hhw", displayName: "Department Heerhugowaard", isTrusted: true, ipRanges: [{ cidrAddress: "198.51.100.23/32" }] },
        { "@odata.type": "#microsoft.graph.countryNamedLocation", id: "loc-cw", displayName: "CountryWhitelist", countriesAndRegions: ["LU", "BE", "NL"], includeUnknownCountriesAndRegions: false, countryLookupMethod: "clientIpAddress" },
      ],
      names: { "g-adm": "DEVCF-Persona-Admins", "g-bg": "DEVCF-BreakGlass", "g-cbg": "CAB-SEC-U-BreakGlass", "g-svc": "CAB-SEC-U-Persona-Microsoft365ServiceAccounts", "g-int": "CAB-SEC-U-Persona-Internals" },
      policies: [
        P("p003", "DEVCF Base Protection - P003: Locations Allowed v1.0", "enabled", { includeGroups: ["g-adm"], excludeGroups: ["g-bg"] }, none, ["All"], ["loc-cw", "loc-hhw", "loc-hq"], blk),
        P("p002", "DEVCF Base Protection - P002: Admin SigninFrequency 12h v1.0", "enabled", { includeGroups: ["g-adm"], excludeGroups: ["g-bg"] }, all, ["All"], ["loc-hhw", "loc-hq"], null, { signInFrequency: { isEnabled: true, value: 12, type: "hours", frequencyInterval: "timeBased" } }),
        P("p004", "DEVCF Base Protection - P004: Admin PersistentBrowser v1.0", "enabled", { includeGroups: ["g-adm"], excludeGroups: ["g-bg"] }, all, ["All"], ["loc-hhw", "loc-hq"], null, { persistentBrowser: { isEnabled: true, mode: "never" } }),
        P("ca001", "CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1.0.2", "disabled", { includeUsers: ["All"], excludeGroups: ["g-cbg"] }, all, ["All"], ["loc-cw"], blk),
        P("ca1102", "(UP)CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0", "disabled", { includeGroups: ["g-cbg"] }, all, ["All"], ["AllTrusted"], blk),
        P("ca600", "CA600-BLOCK-MSA-BP-AllApps-AnyPlatform-BlockUntrustedLocations-v1.0", "disabled", { includeGroups: ["g-svc"], excludeGroups: ["g-cbg"] }, all, ["All"], ["AllTrusted"], blk),
        P("ca210", "CA210-GRANT-Internals-IP-AllApps-AnyPlatform-CombineRegistration-v1.0", "disabled", { includeGroups: ["g-int"], excludeGroups: ["g-cbg"] }, reg, ["All"], ["AllTrusted"], mfa),
        P("ca200", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled", { includeGroups: ["g-int"], excludeGroups: ["g-cbg"] }, all, ["All"], [], mfa),
      ],
      signIns: { "192.0.2.80": [{ createdDateTime: "2026-10-14T08:00:00Z", location: { countryOrRegion: "DE" } }], "203.0.113.10": [{ createdDateTime: "2026-10-14T07:00:00Z", location: { countryOrRegion: "NL" } }] },
      egress: "192.0.2.80",
    };
  }

  return { parse, cidr, within, country, placement, locApplies, model, render, markdown, demo, isHost, hostText, BREAK_GLASS_RE };
})();
if (typeof module !== "undefined") module.exports = Egress;
