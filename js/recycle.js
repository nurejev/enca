// ======================================================================
// Recycle bin — view and restore recently deleted Conditional Access
// policies and named locations.
//   https://learn.microsoft.com/graph/api/policydeletableitem-list
//
// Conditional Access gained a soft-delete window: a deleted policy or
// named location sits in the recycle bin for 30 days and can be restored;
// after that it is gone for good. (ENCA's own delete flows long said
// "Conditional Access has no recycle bin" — that changed, and this tool
// is the counterpart.)
//
// Graph (beta):
//   list:    GET  /identity/conditionalAccess/deletedItems/policies
//            GET  /identity/conditionalAccess/deletedItems/namedLocations
//   restore: POST /identity/conditionalAccess/deletedItems/policies/{id}/restore
//            POST /identity/conditionalAccess/deletedItems/namedLocations/{id}/restore
//
// The one thing to respect on restore: a policy comes back IN THE STATE IT
// WAS DELETED IN. A policy that was On when it was deleted enforces again
// the moment it is restored — so the confirm dialog says so, loudly, and
// shows the stored state up front.
// ======================================================================
const Recycle = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const RETENTION_DAYS = 30;

  // deletedDateTime comes back on deleted items; guard for absence.
  function daysLeft(item, now) {
    const del = Date.parse(item.deletedDateTime || "");
    if (!Number.isFinite(del)) return null;
    return Math.max(0, Math.ceil(RETENTION_DAYS - ((now ?? Date.now()) - del) / DAY));
  }
  function deletedAgo(item, now) {
    const del = Date.parse(item.deletedDateTime || "");
    if (!Number.isFinite(del)) return "unknown";
    const d = Math.floor(((now ?? Date.now()) - del) / DAY);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  }

  const stateLabel = (s) => s === "enabled" ? "On" : s === "enabledForReportingButNotEnforced" ? "Report-only" : s === "disabled" ? "Off" : (s || "unknown");

  // Restoring an On policy re-enforces immediately — the dangerous case.
  const restoresEnforcing = (p) => p.state === "enabled";

  // One-line summary of what a deleted policy did — enough to recognise it.
  function policyBrief(p) {
    const u = p.conditions?.users || {}, a = p.conditions?.applications || {}, g = p.grantControls || {};
    const users = (u.includeUsers || []).includes("All") ? "All users"
      : (u.includeRoles || []).length ? `${(u.includeRoles || []).length} role${(u.includeRoles || []).length === 1 ? "" : "s"}`
      : (u.includeGroups || []).length ? `${(u.includeGroups || []).length} group${(u.includeGroups || []).length === 1 ? "" : "s"}`
      : (u.includeUsers || []).length ? `${(u.includeUsers || []).length} user${(u.includeUsers || []).length === 1 ? "" : "s"}` : "—";
    const apps = (a.includeApplications || []).includes("All") ? "All resources"
      : (a.includeUserActions || []).length ? "user action"
      : (a.includeAuthenticationContextClassReferences || []).length ? "auth context"
      : (a.includeApplications || []).length ? `${(a.includeApplications || []).length} app${(a.includeApplications || []).length === 1 ? "" : "s"}` : "—";
    const grants = (g.builtInControls || []).length ? (g.builtInControls || []).join(", ")
      : g.authenticationStrength?.id ? "auth strength" : "session controls only";
    return `${users} · ${apps} · ${grants}`;
  }

  function locationBrief(l) {
    const t = String(l["@odata.type"] || "").toLowerCase();
    if (t.includes("country")) return `${(l.countriesAndRegions || []).length} countries`;
    const r = (l.ipRanges || []).length;
    return `${r} IP range${r === 1 ? "" : "s"}${l.isTrusted ? " · trusted" : ""}`;
  }

  // A restored policy whose name is already taken again would be confusing —
  // flag name collisions with the live set up front.
  const nameClash = (item, liveNames) => (liveNames || []).some((n) => (n || "").toLowerCase() === (item.displayName || "").toLowerCase());

  function summarize(pols, locs, now) {
    const all = [...(pols || []), ...(locs || [])];
    const soon = all.filter((x) => { const d = daysLeft(x, now); return d !== null && d <= 7; });
    return {
      policies: (pols || []).length,
      locations: (locs || []).length,
      total: all.length,
      wereOn: (pols || []).filter(restoresEnforcing).length,
      expiringSoon: soon.length,
    };
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(pols, locs, meta = {}) {
    const now = meta.now ?? Date.now();
    const s = summarize(pols, locs, now);
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const L = [`# Conditional Access recycle bin — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `- Deleted policies: **${s.policies}**${s.wereOn ? ` (${s.wereOn} were On at deletion — restoring re-enforces them immediately)` : ""}`,
      `- Deleted named locations: **${s.locations}**`,
      `- Expiring within 7 days: **${s.expiringSoon}** — after ${RETENTION_DAYS} days an item is permanently gone`, ""];
    if ((pols || []).length) {
      L.push("## Deleted policies", "", "| Policy | State at deletion | Deleted | Days left | Scope |", "|---|---|---|---|---|");
      for (const p of pols) L.push(`| ${mdEsc(p.displayName)} | ${stateLabel(p.state)} | ${deletedAgo(p, now)} | ${daysLeft(p, now) ?? "?"} | ${mdEsc(policyBrief(p))} |`);
      L.push("");
    }
    if ((locs || []).length) {
      L.push("## Deleted named locations", "", "| Location | Deleted | Days left | Definition |", "|---|---|---|---|");
      for (const l of locs) L.push(`| ${mdEsc(l.displayName)} | ${deletedAgo(l, now)} | ${daysLeft(l, now) ?? "?"} | ${mdEsc(locationBrief(l))} |`);
      L.push("");
    }
    if (!s.total) L.push("The recycle bin is empty.", "");
    L.push(`A restored policy returns in the state it was deleted in — a policy that was On enforces again the moment it is restored.`, "");
    return L.join("\n");
  }

  return { RETENTION_DAYS, daysLeft, deletedAgo, stateLabel, restoresEnforcing, policyBrief, locationBrief, nameClash, summarize, toMd };
})();
