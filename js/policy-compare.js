// Read-only comparison of two loaded policy versions. Shared normalization
// keeps Housekeeping eligibility and its field comparison in agreement.
const PolicyCompare = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  const signature = value => JSON.stringify(canonical(value));
  // @odata.* annotations are transport, not configuration, and Graph nests
  // them: grantControls.authenticationStrength@odata.context names the
  // POLICY's own id, so two policies on the same strength used to compare as
  // different and the comparison showed a metadata URL as a changed setting.
  // Stripped at every depth (25376).
  const META = /@odata\./;
  function strip(value) {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !META.test(k)).map(([k, v]) => [k, strip(v)]));
    return value;
  }
  const config = p => strip(Object.fromEntries(Object.entries(p.raw || {}).filter(([k]) => !["id", "displayName", "state", "createdDateTime", "modifiedDateTime", "deletedDateTime"].includes(k))));
  // An authentication strength is a reference to a tenant object, compared and
  // shown as one setting (its name and id) rather than as the object's own
  // allowed combinations, description and timestamps.
  const LEAF = /(^|\.)authenticationStrength$/;
  const complete = p => !!(p.raw?.conditions && (p.raw.grantControls || p.raw.sessionControls));
  function compare(older, newer) {
    const rows = [], a = { displayName: older.name, state: older.raw?.state ?? older.state }, b = { displayName: newer.name, state: newer.raw?.state ?? newer.state };
    if (older.raw && newer.raw) { Object.assign(a, config(older)); Object.assign(b, config(newer)); }
    const object = v => v && typeof v === "object" && !Array.isArray(v);
    // A side that is null (Graph's "not set" for a whole block — sessionControls
    // null against a block with one control set) is walked as an object whose
    // every setting is null, so the reader sees the settings that differ, not
    // the block's JSON against "null". A null LEAF against an absent one still
    // counts as a difference — the two are not the same payload.
    const expandable = v => v === undefined || v === null || object(v);
    const at = (v, key) => v === null ? null : v?.[key];
    function walk(left, right, path) {
      // Recurse through object/missing pairs, but keep type changes intact.
      if ((object(left) || object(right)) && expandable(left) && expandable(right) && !LEAF.test(path) && Object.keys({...left, ...right}).length) {
        for (const key of [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].sort()) walk(at(left, key), at(right, key), path ? path + "." + key : key);
      } else rows.push({ path, left, right, changed: signature(left) !== signature(right) });
    }
    walk(a, b, "");
    return { older, newer, rows, complete: complete(older) && complete(newer), changed: rows.filter(r => r.changed).length };
  }
  const labels = {
    displayName: "Policy name", state: "Policy state", conditions: "Conditions", users: "People and groups", applications: "Target resources", clientApplications: "Workload identities",
    includeUsers: "Included users", excludeUsers: "Excluded users", includeGroups: "Included groups", excludeGroups: "Excluded groups", includeRoles: "Included roles", excludeRoles: "Excluded roles",
    includeApplications: "Included resources", excludeApplications: "Excluded resources", platforms: "Platforms", includePlatforms: "Included platforms", excludePlatforms: "Excluded platforms",
    clientAppTypes: "Client app types", locations: "Network and locations", includeLocations: "Included locations", excludeLocations: "Excluded locations",
    grantControls: "Grant controls", builtInControls: "Required controls", operator: "Operator", sessionControls: "Session controls", signInFrequency: "Sign-in frequency", value: "Value", type: "Unit", isEnabled: "Enabled",
    devices: "Devices", deviceFilter: "Device filter", rule: "Rule", mode: "Mode", authenticationStrength: "Authentication strength", termsOfUse: "Terms of use"
  };
  const label = path => path.split('.').filter(k => k !== 'conditions').map(k => labels[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())).join(' · ');
  function render(result, { onlyChanges = true, resolve = id => id } = {}) {
    const status = v => ({ enabled: "On", disabled: "Off", enabledForReportingButNotEnforced: "Report-only", on: "On", off: "Off", report: "Report-only" })[v] || v;
    function text(value, path) {
      if (value === undefined) return "Not configured";
      if (value === null) return "null (not set)";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "object") {
        // a reference (an authentication strength, a terms-of-use agreement…): its name and id
        if (value.displayName || value.id) return `${value.displayName || "(unnamed)"}${value.id ? ` (${value.id})` : ""}`;
        // any other object: one "Setting: value" line per entry, never raw JSON
        return Object.entries(canonical(value)).map(([k, v]) => `${label(k)}: ${text(v, path ? path + "." + k : k)}`).join("\n");
      }
      if (path === "state") return status(value);
      // Only resolve directory references, never arbitrary rule or mode strings.
      if (/\.(includeUsers|excludeUsers|includeGroups|excludeGroups|includeRoles|excludeRoles|includeApplications|excludeApplications|includeLocations|excludeLocations|includeServicePrincipals|excludeServicePrincipals|termsOfUse|includeAuthenticationContextClassReferences)$/.test(path) || /authenticationStrength\.id$/.test(path)) {
        const name = resolve(value);
        return name !== value ? `${name} (${value})` : String(value);
      }
      return String(value);
    }
    function cell(value, other, path, side) {
      const mark = side === 'left' ? 'Removed' : 'Added';
      if (Array.isArray(value)) {
        if (!value.length) return '<span class="mini">None (empty list)</span>';
        const peers = new Set((Array.isArray(other) ? other : []).map(signature));
        return '<ul class="hk-values">' + canonical(value).map(v => `<li class="${peers.has(signature(v)) ? '' : 'hk-value-changed'}">${!peers.has(signature(v)) ? `<b>${mark}: </b>` : ''}${esc(text(v, path))}</li>`).join('') + '</ul>';
      }
      return `<span class="hk-value">${esc(text(value, path))}</span>`;
    }
    const rows = result.rows.filter(r => !onlyChanges || r.changed);
    return `${!result.complete ? '<p class="callout warn">Policy details are incomplete. Only available fields can be compared; this does not establish equivalent protection.</p>' : ''}
      <p class="mini">${result.changed} changed fields. Left: older version. Right: newer version. Policy IDs and timestamps are omitted; list order is ignored. Names are shown where already resolved.</p>
      <div class="hk-compare-scroll" tabindex="0" role="region" aria-label="Policy version comparison"><table class="hk-compare-table"><thead><tr><th scope="col">Setting</th><th scope="col">Older version<br>${esc(result.older.name)}</th><th scope="col">Newer version<br>${esc(result.newer.name)}</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.changed ? 'hk-changed' : ''}" data-hk-field="${esc(r.path)}"><th scope="row">${esc(label(r.path))}<span class="mini">${r.changed ? 'Changed' : 'Same'}</span></th><td>${cell(r.left, r.right, r.path, 'left')}</td><td>${cell(r.right, r.left, r.path, 'right')}</td></tr>`).join('') || '<tr><td colspan="3">No differences in the available fields.</td></tr>'}</tbody></table></div>`;
  }
  return { canonical, signature, config, compare, render };
})();
