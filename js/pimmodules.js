// ======================================================================
// 🧩 PIM modules (T51 Deploy, T48, T53 — beta 4.0, R79). Pure: no DOM, no Graph.
//
// The framework has optional modules (PIM_BASELINE.modules): rh (Remote Help),
// rhu (Remote Help unattended, needs rh) and w365 (Windows 365). A module is
// part of a profile only while it is switched on for the tenant. This file
// decides what to OFFER from the tenant's licences (subscribedSkus) and keeps
// the switch state; PimBaseline.profile(cat, id, { modules }) does the merge.
//
// Offer rules (Mihai, 12 Oct 2026):
//   * Large and multi-region: Remote Help is always offered; unattended
//     access too once Remote Help is on.
//   * Small: Remote Help is offered with Microsoft 365 E3/E5, or Business
//     Premium with the Defender suite, or any Remote Help entitlement found.
//   * Windows 365: offered only where a Windows 365 licence exists (SKU part
//     number starting CPC_), in every profile. Unread licences never hide a
//     module: they are offered with "licences not read".
//   * Remote Help needs an entitlement (add-on, Intune Suite, or E3/E5, per
//     Microsoft). A tenant without one still may prepare the groups and
//     roles; the entitlement says "none found" and a finding follows.
//
// SKU part numbers are matched after stripping whitespace and zero-width
// characters: gimi's Windows 365 SKU ends in a zero-width space (12 Oct 2026).
// ======================================================================
const PimModules = (() => {
  const IDS = ["rh", "rhu", "w365"];
  const STORE = "enca.pmbModules";
  const norm = (s) => String(s == null ? "" : s).replace(/[\u200B-\u200D\u2060\uFEFF\s]/g, "").toUpperCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function facts(skus) {
    const read = Array.isArray(skus);
    const live = read ? skus.filter((s) => s && (!s.capabilityStatus || /^enabled$/i.test(s.capabilityStatus))) : [];
    const parts = live.map((s) => norm(s.skuPartNumber));
    const plans = [];
    live.forEach((s) => (s.servicePlans || []).forEach((p) => plans.push(norm(p && p.servicePlanName))));
    const any = (re) => parts.some((x) => re.test(x));
    const anyPlan = (re) => plans.some((x) => re.test(x));
    return {
      read,
      e3: any(/^(SPE_E[35]|M365_E[35])/),
      bp: parts.includes("SPB"),
      suite: any(/DEFENDER_AND_PURVIEW_SUITES_FOR_BUSINESS_PREMIUM/) || (anyPlan(/^WINDEFATP$/) && anyPlan(/^MTP$/)),
      w365: any(/^CPC_/) || anyPlan(/^CPC_/),
      rhPlan: any(/REMOTE_?HELP|INTUNE_?SUITE/) || anyPlan(/REMOTE_?HELP|INTUNE_?SUITE/),
      parts,
    };
  }

  // → { facts, rh, rhu, w365 } each { available, entitlement?, reason }
  function offer(skus, profileId) {
    const f = facts(skus);
    const big = profileId === "large" || profileId === "multi";
    const out = { facts: f, rh: null, rhu: null, w365: null };
    const rhEnt = f.rhPlan ? "found" : f.e3 ? "included" : f.read ? "none" : "unknown";
    let rhOk, rhWhy;
    if (big) { rhOk = true; rhWhy = "offered in this profile"; }
    else if (f.e3) { rhOk = true; rhWhy = "Microsoft 365 E3/E5 found"; }
    else if (f.bp && f.suite) { rhOk = true; rhWhy = "Business Premium with the Defender suite found"; }
    else if (f.rhPlan) { rhOk = true; rhWhy = "a Remote Help entitlement found"; }
    else if (!f.read) { rhOk = true; rhWhy = "licences not read"; }
    else { rhOk = false; rhWhy = "needs Microsoft 365 E3/E5, or Business Premium with the Defender suite"; }
    out.rh = { available: rhOk, entitlement: rhEnt, reason: rhWhy };
    out.rhu = { available: rhOk && big, reason: big ? "needs Remote Help on" : "Large profiles only", requires: "rh" };
    const wOk = f.w365 || !f.read;
    out.w365 = { available: wOk, reason: f.w365 ? "Windows 365 licence found" : f.read ? "no Windows 365 licence found" : "licences not read" };
    return out;
  }

  // The finding a module's entitlement deserves, or "".
  function entitlementNote(o) {
    if (!o || !o.rh) return "";
    if (o.rh.entitlement === "none") return "No Remote Help entitlement found in these licences (needs the add-on, Intune Suite, or Microsoft 365 E3/E5). The groups and roles can still be prepared.";
    if (o.rh.entitlement === "included") return "Included with Microsoft 365 E3/E5, as Microsoft reports it; confirm the service plan on this tenant.";
    if (o.rh.entitlement === "unknown") return "Licences were not read, so the Remote Help entitlement is unknown.";
    return "";
  }

  // Stored state: a JSON array of ids. Unknown ids and dependents without
  // their requirement are dropped.
  function parse(text, cat) {
    let a = [];
    try { a = JSON.parse(text || "[]"); } catch { a = []; }
    if (!Array.isArray(a)) a = [];
    const known = new Set(cat && cat.modules ? Object.keys(cat.modules) : IDS);
    const set = new Set(a.filter((x) => known.has(x)));
    if (cat && cat.modules) for (const m of [...set]) { const r = cat.modules[m].requires; if (r && !set.has(r)) set.delete(m); }
    return [...set];
  }
  const serialize = (arr) => JSON.stringify([...new Set(arr || [])].sort());
  const key = (tenant) => `${STORE}:${tenant || "demo"}`;
  // Turning rh off turns rhu off; turning rhu on needs rh.
  function toggle(current, id, on, cat) {
    const set = new Set(current || []);
    if (on) set.add(id); else set.delete(id);
    return parse(JSON.stringify([...set]), cat);
  }

  function render(o, state, cat, profileId) {
    const on = new Set(state || []);
    const M = (cat && cat.modules) || {};
    const row = (id, label, off) => {
      const a = o[id];
      const avail = !!(a && a.available) && (!M[id] || !(M[id].byProfile || {})[profileId] ? false : true) && !(M[id] && M[id].requires && !on.has(M[id].requires));
      const reason = !a ? "" : (M[id] && !(M[id].byProfile || {})[profileId]) ? "not part of this profile" : (M[id] && M[id].requires && !on.has(M[id].requires)) ? `needs ${M[M[id].requires].label} on` : a.reason;
      return `<label class="pim-mod${avail ? "" : " off"}"><input type="checkbox" data-pdpmod="${esc(id)}"${on.has(id) ? " checked" : ""}${avail ? "" : " disabled"}><span><b>${esc(label)}</b> <span class="mini">${esc(reason)}</span></span></label>`;
    };
    const note = entitlementNote(o);
    return `<div class="pim-mods"><h4>Modules <span class="mini">off until you tick them</span></h4>${IDS.filter((id) => M[id]).map((id) => row(id, M[id].label)).join("")}${on.has("rh") && note ? `<p class="mini pmb-warn">${esc(note)}</p>` : ""}${!o.facts.read ? `<p class="mini muted">Licences were not read (LicenseAssignment.Read.All); modules stay available.</p>` : ""}</div>`;
  }
  return { IDS, key, norm, facts, offer, entitlementNote, parse, serialize, toggle, render };
})();
