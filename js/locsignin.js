// ======================================================================
// 🌐 Named locations vs. the sign-in log (R19, beta 32405) — a view of
// 🧩 Policy building blocks → Locations, not a tool of its own.
//
// Trusted IP ranges are usually older than the offices they describe. This
// crosses every named location with the sign-in window 🚦 / 🎚 / 🕵 already
// read (same source, same cache, same cap): which location nobody signs in
// from any more, which is seen but used by no policy, and which countries
// sign-ins come from that no country location names.
//
// A sign-in matches a location when EITHER
//   • Entra said so — networkLocationDetails on the Graph record names the
//     named locations the sign-in fell in (the Graph sources only), or
//   • the record's IP falls in one of the location's ranges (IPv4 and IPv6,
//     BigInt arithmetic), or its country is in the location's list.
// A country location that looks up by Authenticator GPS cannot be matched
// from an IP; only Entra's own answer counts for it, and the row says so.
//
//   LocSignin.analyze({ locations, policies, records, days, capped, usedBy })
//   LocSignin.render(m) / toMd(m, tenant) / inCidr(ip, cidr)
// ======================================================================
const LocSignin = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const kindOf = (l) => { const t = String((l && l["@odata.type"]) || "").toLowerCase(); return t.includes("country") ? "country" : t.includes("compliantnetwork") ? "compliantNetwork" : "ip"; };

  // ---- CIDR (pure; exported for the tests) ---------------------------------
  function v4(ip) {
    const p = String(ip).split(".");
    if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
    return p.reduce((a, x) => (a << 8n) | BigInt(+x), 0n);
  }
  function v6(ip) {
    let s = String(ip).toLowerCase().split("%")[0];
    if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(":")) return null;
    // an embedded IPv4 tail (::ffff:1.2.3.4)
    const m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) { const n = v4(m[1]); if (n === null) return null; s = s.slice(0, -m[1].length) + ((n >> 16n).toString(16)) + ":" + ((n & 0xffffn).toString(16)); }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [], tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    const parts = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
    if (parts.length !== 8 || parts.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
    return parts.reduce((a, x) => (a << 16n) | BigInt(parseInt(x, 16)), 0n);
  }
  function inCidr(ip, cidr) {
    const [addr, bitsRaw] = String(cidr || "").trim().split("/");
    const six = addr.includes(":"), ipSix = String(ip || "").includes(":");
    const a = six ? v6(addr) : v4(addr), b = ipSix ? v6(ip) : v4(ip);
    if (a === null || b === null || six !== ipSix) return false;
    const width = six ? 128 : 32, bits = bitsRaw === undefined ? width : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > width) return false;
    const shift = BigInt(width - bits);
    return (a >> shift) === (b >> shift);
  }

  // Entra's own answer: the named locations the sign-in fell in, by name
  function logNames(r) {
    const out = new Set();
    for (const d of (r && r.networkLocationDetails) || []) {
      if (!/named|trusted/i.test(String(d.networkType || ""))) continue;
      for (const n of d.networkNames || []) out.add(String(n).toLowerCase());
    }
    return out;
  }

  function analyze(input) {
    const I = input || {};
    const locs = (I.locations || []).filter((l) => kindOf(l) !== "compliantNetwork");
    const raws = I.policies || [];
    const usedBy = I.usedBy || (() => []);
    const records = I.records || [];
    const rows = locs.map((l) => {
      const k = kindOf(l);
      return { id: l.id, name: l.displayName || "(unnamed)", kind: k, trusted: k === "ip" && !!l.isTrusted,
        ranges: k === "ip" ? (l.ipRanges || []).map((r) => r.cidrAddress).filter(Boolean) : [],
        countries: k === "country" ? (l.countriesAndRegions || []).map((c) => String(c).toUpperCase()) : [],
        gps: k === "country" && /gps/i.test(String(l.countryLookupMethod || "")),
        used: usedBy(l, raws), n: 0, byLog: 0, users: new Set(), last: null, lname: String(l.displayName || "").toLowerCase() };
    });
    const countryNamed = new Set(rows.filter((r) => r.kind === "country").flatMap((r) => r.countries));
    const outside = new Map();   // country → { n, users }
    let withLog = 0, noIp = 0;
    for (const r of records) {
      const ip = r.ipAddress || "", cc = String(((r.location || {}).countryOrRegion) || "").toUpperCase();
      const names = logNames(r);
      if (r.networkLocationDetails) withLog++;
      if (!ip) noIp++;
      const who = r.userId || r.userPrincipalName || "";
      for (const row of rows) {
        const byLog = names.has(row.lname);
        const byMatch = row.kind === "ip" ? (ip && row.ranges.some((c) => inCidr(ip, c))) : (!row.gps && cc && row.countries.includes(cc));
        if (!byLog && !byMatch) continue;
        row.n++; if (byLog) row.byLog++;
        if (who) row.users.add(who);
        const t = r.createdDateTime; if (t && (!row.last || t > row.last)) row.last = t;
      }
      if (cc && !countryNamed.has(cc)) {
        if (!outside.has(cc)) outside.set(cc, { country: cc, n: 0, users: new Set() });
        const o = outside.get(cc); o.n++; if (who) o.users.add(who);
      }
    }
    const findings = [];
    for (const row of rows) {
      const used = row.used.length;
      row.verdict = row.n
        ? (used ? "in-use" : "seen-unused")
        : row.trusted ? "trusted-unseen" : used ? (row.kind === "country" ? "country-unseen" : "used-unseen") : "idle";
      if (row.verdict === "trusted-unseen") findings.push({ sev: used ? "high" : "medium", id: row.id, name: row.name, text: `Marked trusted, and no sign-in in the window came from its ${row.ranges.length} range${row.ranges.length === 1 ? "" : "s"}.${used ? ` ${used} polic${used === 1 ? "y relies" : "ies rely"} on it — a trusted range nobody uses is an exception that outlived its office.` : " No policy names it, but “All trusted locations” would still count it."}` });
      else if (row.verdict === "used-unseen") findings.push({ sev: "medium", id: row.id, name: row.name, text: `${used} polic${used === 1 ? "y names" : "ies name"} it and no sign-in in the window came from it. Check whether the range is still yours before the next policy leans on it.` });
      else if (row.verdict === "country-unseen") findings.push({ sev: "info", id: row.id, name: row.name, text: `No sign-in from ${row.countries.length ? row.countries.join(", ") : "any of its countries"} in the window${row.gps ? " (looked up by Authenticator GPS — only Entra's own match can count here)" : ""}. Expected for a list of blocked countries.` });
      else if (row.verdict === "seen-unused") findings.push({ sev: "info", id: row.id, name: row.name, text: `${row.n.toLocaleString()} sign-in${row.n === 1 ? "" : "s"} from ${row.users.size} user${row.users.size === 1 ? "" : "s"}, and no policy names it.` });
    }
    const SEV = { high: 0, medium: 1, info: 2 };
    findings.sort((a, b) => SEV[a.sev] - SEV[b.sev] || a.name.localeCompare(b.name));
    const countries = [...outside.values()].map((o) => ({ country: o.country, n: o.n, users: o.users.size })).sort((a, b) => b.n - a.n);
    rows.sort((a, b) => (b.n - a.n) || a.name.localeCompare(b.name));
    const counts = { high: 0, medium: 0, info: 0 };
    for (const f of findings) counts[f.sev]++;
    return { rows: rows.map((r) => ({ ...r, users: r.users.size })), findings, counts, countries, countryLocations: countryNamed.size > 0,
      records: records.length, withLog, noIp, days: I.days || 0, capped: !!I.capped, source: I.source || "", demo: !!I.demo };
  }

  // ---- render --------------------------------------------------------------
  const VERDICT = {
    "in-use": ["xt-pill tc-on", "In use"], "seen-unused": ["xt-pill xt-info", "Seen, no policy uses it"],
    "trusted-unseen": ["xt-pill xt-high", "Trusted, nobody signs in from it"], "used-unseen": ["xt-pill xt-medium", "Used by policy, not seen"],
    "country-unseen": ["xt-pill xt-info", "No sign-in from these countries"], idle: ["xt-pill xt-info", "Unused and not seen"],
  };
  const when = (t) => t ? new Date(t).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  function render(m) {
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    const stale = m.rows.filter((r) => r.verdict === "trusted-unseen" || r.verdict === "used-unseen").length;
    const tiles = `<div class="xt-tiles">${t("", "Sign-ins read", m.records.toLocaleString())}${t("", "Locations seen", m.rows.filter((r) => r.n).length + " of " + m.rows.length)}${t(stale ? "h" : "", "Trusted or used, not seen", stale)}${t(m.countries.length ? "m" : "", "Countries no location names", m.countries.length)}</div>`;
    const table = `<div class="list-card xt-card"><h3>Named locations against ${m.days} day${m.days === 1 ? "" : "s"} of sign-ins</h3><div class="xt-tw"><table class="xt-tbl ls-tbl">
      <thead><tr><th>Location</th><th>Kind</th><th>Used by</th><th>Sign-ins</th><th>Users</th><th>Last seen</th><th>Finding</th></tr></thead>
      <tbody>${m.rows.map((r) => `<tr><td><b class="pol-link" data-lodet="${esc(r.id)}">${esc(r.name)}</b></td>
        <td class="mini">${r.kind === "ip" ? `IP · ${r.ranges.length} range${r.ranges.length === 1 ? "" : "s"}${r.trusted ? " · trusted" : ""}` : `Country · ${esc(r.countries.slice(0, 6).join(", "))}${r.countries.length > 6 ? ` +${r.countries.length - 6}` : ""}${r.gps ? " · GPS" : ""}`}</td>
        <td class="mini">${r.used.length ? `${r.used.length} polic${r.used.length === 1 ? "y" : "ies"}` : '<span class="muted">none</span>'}</td>
        <td>${r.n.toLocaleString()}${r.byLog && r.byLog < r.n ? ` <span class="mini muted" title="Entra named this location on ${r.byLog} of them; the rest matched by range or country">(${r.byLog} by Entra)</span>` : ""}</td>
        <td>${r.users.toLocaleString()}</td><td class="mini">${when(r.last)}</td>
        <td><span class="${VERDICT[r.verdict][0]}">${VERDICT[r.verdict][1]}</span></td></tr>`).join("")}</tbody></table></div></div>`;
    const ctry = m.countries.length ? `<div class="list-card xt-card"><h3>Countries no location names <span class="mini">— ${m.countryLocations ? "not in any country location" : "no country location lists a country"}</span></h3>
      <div class="xt-pols">${m.countries.slice(0, 40).map((c) => `<span class="xt-pol">${esc(c.country)} · ${c.n.toLocaleString()} sign-in${c.n === 1 ? "" : "s"} · ${c.users} user${c.users === 1 ? "" : "s"}</span>`).join("")}${m.countries.length > 40 ? ` <span class="mini muted">and ${m.countries.length - 40} more</span>` : ""}</div></div>` : "";
    const fnd = `<div class="list-card xt-card"><h3>Findings</h3>${m.findings.length ? m.findings.map((f) => `<div class="xt-f"><span class="xt-pill xt-${f.sev}">${f.sev === "high" ? "High" : f.sev === "medium" ? "Medium" : "Info"}</span><div><b class="pol-link" data-lodet="${esc(f.id)}">${esc(f.name)}</b><p>${esc(f.text)}</p></div></div>`).join("") : '<p class="mini">Nothing flagged — every trusted or used location was seen in the window.</p>'}
      <p class="mini muted" style="margin-top:10px">${m.withLog ? `Entra's own location match was on ${m.withLog.toLocaleString()} of ${m.records.toLocaleString()} sign-ins; the rest are matched by range and country here. ` : "This source carries no location match from Entra, so every sign-in is matched by range and country here. "}${m.capped ? "The window was CAPPED — a location reading not seen may simply be past the cap; read a shorter window. " : ""}Only what Microsoft still keeps can be read — 30 days at most.</p></div>`;
    return tiles + table + ctry + fnd + (m.demo ? '<p class="mini muted">Demo data — example sign-ins, not a real tenant.</p>' : "");
  }
  function toMd(m, tenant) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`# Named locations vs. the sign-in log — ${tenant || "tenant"}`, "", `${m.records.toLocaleString()} sign-ins over ${m.days} days${m.capped ? " (CAPPED)" : ""}${m.demo ? " (demo)" : ""}`, "",
      "| Location | Kind | Used by | Sign-ins | Users | Last seen | Finding |", "| --- | --- | --- | --- | --- | --- | --- |"];
    for (const r of m.rows) L.push(`| ${e(r.name)} | ${r.kind}${r.trusted ? " (trusted)" : ""} | ${r.used.length} | ${r.n} | ${r.users} | ${r.last || "—"} | ${VERDICT[r.verdict][1]} |`);
    if (m.countries.length) { L.push("", "## Countries no location names", ""); for (const c of m.countries) L.push(`- ${c.country}: ${c.n} sign-ins, ${c.users} users`); }
    L.push("", "## Findings", "");
    if (!m.findings.length) L.push("Nothing flagged.");
    for (const f of m.findings) L.push(`- **${f.sev.toUpperCase()}** ${f.name} — ${f.text}`);
    return L.join("\n");
  }
  return { analyze, render, toMd, inCidr, logNames };
})();
