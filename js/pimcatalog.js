// ======================================================================
// 🧱 Update the catalog from cloudfellows.dev (T48, beta 32427, R74).
// Pure: no DOM, no Graph.
//
// cloudfellows.dev is the source of truth: the framework is configured in
// the PIM portal there, and the catalog (js/pimBaselineData.js) follows it.
// Until now a difference found there went into the file by hand. This module
// turns 🧬 T48's read of the baseline tenant into the catalog's own terms
// and writes the edit:
//
//   propose(base, res, profileId)
//     → changes: one per catalog value the tenant disagrees with, placed
//       where the catalog keeps it —
//         templates.<Tier>              every role of the tier agrees
//         profiles.<p>.templates.<Tier> the profile already overrides that key
//         roles["<name>"].override      only some roles of the tier differ,
//                                       or the role already overrides the key
//       Recipients and default-recipient switches are domain-specific and are
//       never proposed; a rule the tenant does not carry is never proposed.
//   applyRevision(sourceText, changes, revised)
//     → the file's text with exactly those values edited in place (comments,
//       order and layout kept) and `revised` set — so the result can be
//       committed as it is, and a diff shows only what cloudfellows.dev said.
// ======================================================================
const PimCatalog = (() => {
  // SETTINGS key (js/pimbaseline.js) → catalog template key(s).
  const MAP = {
    activation: (v) => ({ ActivationDuration: v }),
    enablement: (v) => ({ ActivationRequirement: ORDER.filter((x) => v.includes(x)).concat(v.filter((x) => !ORDER.includes(x))).join(",") || "None" }),
    authContext: (v) => (v ? { AuthenticationContext_Enabled: true, AuthenticationContext_Value: v } : { AuthenticationContext_Enabled: false }),
    approval: (v) => ({ ApprovalRequired: v }),
    approvers: (v) => ({ Approvers: v }),
    permEligible: (v) => ({ AllowPermanentEligibility: v }),
    maxEligible: (v) => (v ? { MaximumEligibilityDuration: v } : {}),
    permActive: (v) => ({ AllowPermanentActiveAssignment: v }),
    maxActive: (v) => (v ? { MaximumActiveAssignmentDuration: v } : {}),
    alertActivation: (v) => ({ "Notification_Activation_Alert.notificationLevel": v }),
    alertEligible: (v) => ({ "Notification_EligibleAssignment_Alert.notificationLevel": v }),
    alertActive: (v) => ({ "Notification_ActiveAssignment_Alert.notificationLevel": v }),
  };
  const ORDER = ["MultiFactorAuthentication", "Justification", "Ticketing"];
  const SKIP = new Set(["recipients", "defaults"]);
  const get = (o, k) => k.split(".").reduce((a, p) => (a == null ? a : a[p]), o);

  function propose(base, res, profileId) {
    const prof = (base.profiles || {})[profileId] || {};
    const changes = [], notes = [];
    const tierOf = (name) => { const r = base.roles.find((x) => x.name === name); const po = prof.roles && prof.roles[name]; return r ? r.template : null; };
    // Gather: tier → key → [{ role, value }]
    const byTier = {};
    const add = (tier, who, key, value, kind) => { const t = (byTier[`${kind}:${tier}`] = byTier[`${kind}:${tier}`] || { tier, kind, keys: {} }); (t.keys[key] = t.keys[key] || []).push({ who, value }); };
    const members = {};
    (res.rows || []).forEach((r) => {
      if (r.status !== "differs" && r.status !== "match") return;
      const t = tierOf(r.name); if (!t) return;
      (members[`role:${t}`] = members[`role:${t}`] || []).push(r.name);
      r.diffs.forEach((d) => { if (SKIP.has(d.key) || d.rawTenant === "rule absent") return; add(t, r.name, d.key, d.rawTenant, "role"); });
    });
    (res.groups || []).forEach((g) => {
      if (!g.present || !g.template || g.settings === "unread") return;
      (members[`group:${g.template}`] = members[`group:${g.template}`] || []).push(g.name);
      g.diffs.forEach((d) => { if (SKIP.has(d.key) || d.rawTenant === "rule absent") return; add(g.template, g.name, d.key, d.rawTenant, "group"); });
    });
    const where = (tier, tkey) => (prof.templates && prof.templates[tier] && get(prof.templates[tier], tkey) !== undefined ? `profiles.${profileId}.templates.${tier}` : `templates.${tier}`);
    const valueAt = (path, tkey) => get(path.split(".").reduce((a, p) => (a == null ? a : a[p]), base), tkey);
    for (const t of Object.values(byTier)) {
      const all = members[`${t.kind}:${t.tier}`] || [];
      for (const [skey, list] of Object.entries(t.keys)) {
        const groups = new Map();
        list.forEach((x) => { const k = JSON.stringify(x.value); (groups.get(k) || groups.set(k, []).get(k)).push(x.who); });
        for (const [vk, whos] of groups) {
          const value = JSON.parse(vk);
          const mapped = MAP[skey] ? MAP[skey](value) : {};
          const everyone = t.kind === "group" || whos.length === all.length;
          for (const [tkey, tval] of Object.entries(mapped)) {
            if (everyone) {
              // A role that overrides this key keeps its own value; the tier follows the rest.
              const path = where(t.tier, tkey);
              const from = valueAt(path, tkey);
              if (JSON.stringify(from) === JSON.stringify(tval)) continue;
              if (!changes.some((c) => c.path === path && c.key === tkey)) changes.push({ id: `${path}|${tkey}`, path, key: tkey, from: from === undefined ? null : from, to: tval, who: whos.slice(), kind: t.kind, tier: t.tier, scope: `every ${t.kind === "group" ? `${t.tier} group` : `${t.tier} role`} read (${whos.length})` });
            } else {
              whos.forEach((w) => {
                const r = base.roles.find((x) => x.name === w);
                const from = r && r.override && get(r.override, tkey) !== undefined ? get(r.override, tkey) : get(Object.assign({}, base.templates[t.tier], (prof.templates || {})[t.tier] || {}), tkey);
                if (JSON.stringify(from) === JSON.stringify(tval)) return;
                changes.push({ id: `roles.${w}|${tkey}`, path: `roles["${w}"].override`, role: w, key: tkey, from: from === undefined ? null : from, to: tval, who: [w], kind: "role", tier: t.tier, scope: `${w} only — ${whos.length} of ${all.length} ${t.tier} roles` });
              });
            }
          }
        }
      }
    }
    // A key two different ways across the tier is a decision, not an edit.
    const split = {};
    changes.filter((c) => c.path.startsWith("roles[")).forEach((c) => { const k = `${c.tier}|${c.key}`; split[k] = (split[k] || new Set()).add(JSON.stringify(c.to)); });
    Object.entries(split).forEach(([k, s]) => { if (s.size > 1) notes.push(`${k.replace("|", ": ")} is set ${s.size} different ways across the tier in cloudfellows.dev — each role gets its own override; consider making the tier one value in the portal first`); });
    return { changes: changes.sort((a, b) => a.path.localeCompare(b.path) || a.key.localeCompare(b.key)), notes };
  }

  // ---- editing the source text ------------------------------------------
  // The first "{" at or after i, and its matching "}", skipping strings.
  function block(text, i) {
    const open = text.indexOf("{", i);
    if (open < 0) return null;
    let depth = 0, q = null;
    for (let k = open; k < text.length; k++) {
      const c = text[k];
      if (q) { if (c === "\\") { k++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (!depth) return [open, k]; }
    }
    return null;
  }
  // The end of a JS literal value starting at i (string, number, boolean,
  // null, array or object).
  function valueEnd(text, i) {
    const c = text[i];
    if (c === '"') { for (let k = i + 1; k < text.length; k++) { if (text[k] === "\\") { k++; continue; } if (text[k] === '"') return k + 1; } return -1; }
    if (c === "[" || c === "{") {
      const close = c === "[" ? "]" : "}"; let depth = 0, q = null;
      for (let k = i; k < text.length; k++) { const d = text[k]; if (q) { if (d === "\\") { k++; continue; } if (d === q) q = null; continue; } if (d === '"') { q = d; continue; } if (d === c) depth++; else if (d === close) { depth--; if (!depth) return k + 1; } }
      return -1;
    }
    const m = /^(true|false|null|-?\d+(\.\d+)?)/.exec(text.slice(i));
    return m ? i + m[0].length : -1;
  }
  const lit = (v) => JSON.stringify(v);
  // Set key (possibly "A.b") inside the object whose braces are [open, close].
  function setIn(text, open, close, key, value) {
    const [head, ...rest] = key.split(".");
    const body = text.slice(open + 1, close);
    const re = new RegExp(`(^|[\\s{,])${head}\\s*:\\s*`, "g");
    let m, at = -1;
    // Only a key at depth 1 of this object.
    while ((m = re.exec(body))) {
      const pos = m.index + m[1].length;
      const before = body.slice(0, pos);
      const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length + ((before.match(/\[/g) || []).length - (before.match(/\]/g) || []).length);
      const quotes = (before.match(/(^|[^\\])"/g) || []).length;
      if (depth === 0 && quotes % 2 === 0) { at = open + 1 + m.index + m[0].length; break; }
    }
    if (rest.length) {
      if (at < 0) return setIn(text, open, close, head, Object.fromEntries([[rest.join("."), value]]));
      const b = block(text, at);
      return setIn(text, b[0], b[1], rest.join("."), value);
    }
    if (at >= 0) { const end = valueEnd(text, at); if (end < 0) throw new Error(`cannot read the value of ${key}`); return text.slice(0, at) + lit(value) + text.slice(end); }
    // Absent: add it as the object's last key.
    const inner = text.slice(open + 1, close);
    const trimmed = inner.replace(/\s+$/, "");
    const sep = trimmed.trim() === "" ? " " : trimmed.endsWith(",") ? " " : ", ";
    return text.slice(0, open + 1) + trimmed + sep + `${key}: ${lit(value)}` + (inner.includes("\n") ? inner.slice(trimmed.length) : " ") + text.slice(close);
  }
  function locate(text, path) {
    // templates.Tier1 · profiles.large.templates.Tier0 · roles["X"].override
    const start = text.indexOf("const PIM_BASELINE = {");
    if (start < 0) throw new Error("not js/pimBaselineData.js");
    let m;
    if ((m = /^roles\["(.+)"\]\.override$/.exec(path))) {
      const at = text.indexOf(`{ name: ${JSON.stringify(m[1])},`, start);
      if (at < 0) throw new Error(`role ${m[1]} not found in the file`);
      const b = block(text, at);
      const inner = text.slice(b[0], b[1] + 1);
      const om = /override:\s*\{/.exec(inner);
      if (om) return block(text, b[0] + om.index);
      // No override yet: add an empty one before note / at the end.
      const noteAt = inner.search(/,\s*note:/);
      const ins = noteAt >= 0 ? b[0] + noteAt : b[1];
      const nt = text.slice(0, ins) + (noteAt >= 0 ? ", override: {}" : ", override: {} ") + text.slice(ins);
      return { text: nt, again: true };
    }
    const parts = path.split(".");
    let open = start + "const PIM_BASELINE = ".length, close = block(text, open)[1];
    for (const p of parts) {
      const body = text.slice(open, close);
      const re = new RegExp(`\\n\\s*${p}\\s*:\\s*\\{`);
      const mm = re.exec(body) || new RegExp(`[{,]\\s*${p}\\s*:\\s*\\{`).exec(body);
      if (!mm) {
        // A profile tier that does not exist yet: add it.
        if (/^Tier|^Group|^Reader/.test(p)) { const nt = setIn(text, open, close, p, {}); return { text: nt, again: true }; }
        throw new Error(`${path}: ${p} not found in the file`);
      }
      const b = block(text, open + mm.index);
      open = b[0]; close = b[1];
    }
    return [open, close];
  }
  function applyRevision(text, changes, revised) {
    let t = String(text);
    for (const c of changes) {
      let loc = locate(t, c.path);
      for (let n = 0; loc && loc.again && n < 3; n++) { t = loc.text; loc = locate(t, c.path); }
      t = setIn(t, loc[0], loc[1], c.key, c.to);
    }
    if (revised) t = t.replace(/(\n  revised: )"[^"]*"/, `$1"${revised}"`);
    return t;
  }
  const show = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") || "none" : typeof v === "boolean" ? (v ? "on" : "off") : String(v));
  function toMd(res, prop, tenant, date) {
    const L = [`# 🧱 CloudFellows PIM framework — catalog revision from ${tenant || "cloudfellows.dev"}`, "", `${date}. ${prop.changes.length} value${prop.changes.length === 1 ? "" : "s"} follow the portal.`, "", "| Where | Setting | Catalog | cloudfellows.dev | Read from |", "|---|---|---|---|---|", ...prop.changes.map((c) => `| ${c.path} | ${c.key} | ${show(c.from)} | ${show(c.to)} | ${c.scope} |`)];
    if (prop.notes.length) L.push("", "## To decide", "", ...prop.notes.map((n) => `- ${n}`));
    return L.join("\n");
  }
  return { MAP, propose, applyRevision, toMd, show, _block: block, _setIn: setIn };
})();
