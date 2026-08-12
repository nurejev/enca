// ======================================================================
// Drift watch — what moved in the Conditional Access configuration since
// a snapshot you took earlier.
//
// WHY THIS IS NOT THE CHANGE AUDIT TOOL. Change audit reads the directory
// audit log: authoritative about *who* did *what*, but Entra keeps only
// ~30 days and its snapshot compares log ROWS ("which events do I have now
// that I did not have then"). Drift watch compares CONFIGURATION STATE —
// what the tenant looks like now versus what it looked like when you took
// the snapshot. That has no time limit, because the history is a file you
// keep, not a log Microsoft ages out. A policy switched Off eleven months
// ago is invisible to the audit log and obvious here.
//
// No infrastructure, deliberately: the snapshot is a JSON file the tenant
// (or the consultant) downloads and stores wherever review files already
// live. Nothing is sent anywhere, nothing is stored server-side, and a
// snapshot from any past build still loads.
//
// The field-level diff engine is Audit.diff() — reused, not reimplemented,
// so a change reads the same here as it does in the audit trail.
// ======================================================================
const Drift = (() => {
  const EXPORT_SCHEMA = "enca-drift/1";
  const EXPORT_SCHEMA_LEGACY = [];      // none yet; keep the door open like Audit does

  // The areas a snapshot captures. Each is read independently and a failure
  // in one never voids the rest — a tenant that will not hand over named
  // locations should still get policy drift. `scopes` documents what the
  // read needs beyond the session's baseline Policy.Read.All.
  // `urls` is a candidate ladder, tried in order, first success wins — the same
  // pattern the group analyzer uses. It exists because $expand is not accepted
  // on every tenant: /policies/authenticationStrengthPolicies?$expand=... comes
  // back 400 "Query option 'Expand' is not allowed" in some directories, which
  // is exactly why the Authentication strengths tool already retries without
  // it. A richer read is attempted first and a thinner one still counts as a
  // successful capture, because half the fields is worth more than an area
  // marked "not captured".
  const AREAS = [
    { key: "policies",  label: "Conditional Access policies", icon: "🗂",
      urls: ["/identity/conditionalAccess/policies"] },
    { key: "locations", label: "Named locations",             icon: "🌐",
      urls: ["/identity/conditionalAccess/namedLocations"] },
    { key: "strengths", label: "Authentication strengths",    icon: "🔑",
      urls: ["/policies/authenticationStrengthPolicies?$expand=combinationConfigurations",
             "/policies/authenticationStrengthPolicies"] },
    { key: "contexts",  label: "Authentication contexts",     icon: "🏷",
      urls: ["/identity/conditionalAccess/authenticationContextClassReferences"] },
  ];
  const areaByKey = (k) => AREAS.find((a) => a.key === k) || { key: k, label: k, icon: "•" };

  // Fields that change on their own and would drown the real signal.
  // modifiedDateTime in particular moves on every save, including saves that
  // changed nothing we care about.
  const VOLATILE = new Set(["modifiedDateTime", "createdDateTime", "@odata.context", "@odata.type",
    "@odata.id", "templateId"]);

  function strip(obj) {
    if (Array.isArray(obj)) return obj.map(strip);
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const k of Object.keys(obj)) { if (!VOLATILE.has(k)) out[k] = strip(obj[k]); }
    return out;
  }

  const nameOf = (o) => o.displayName || o.name || o.id || "(unnamed)";

  // ---- snapshot ----------------------------------------------------------
  // `read(url)` is injected so the caller owns paging, progress and demo mode;
  // this module never talks to Graph itself. It returns the items, or throws.
  async function snapshot(read, meta = {}, onArea) {
    const areas = {};
    for (const a of AREAS) {
      if (meta.only && !meta.only.includes(a.key)) continue;
      if (onArea) onArea(a);
      const tried = [];
      let done = false;
      for (const url of a.urls) {
        try {
          const items = await read(url, a.key);
          areas[a.key] = {
            ok: true,
            url,
            reduced: url !== a.urls[0],   // a fallback shape: fewer fields captured
            items: (items || []).map((o) => ({ id: o.id, name: nameOf(o), body: strip(o) }))
              .sort((x, y) => String(x.id).localeCompare(String(y.id))),
          };
          done = true;
          break;
        } catch (e) { tried.push(`${url.split("?")[0].split("/").pop()}: ${e && e.message ? e.message : e}`); }
      }
      // Recorded, not swallowed: a compare against an area that failed to
      // read must say "not captured" rather than silently report "no drift".
      if (!done) areas[a.key] = { ok: false, error: tried.join(" · "), items: [] };
    }
    return {
      schema: EXPORT_SCHEMA,
      generated: new Date().toISOString(),
      tenant: meta.tenant || "",
      build: meta.build || "",
      names: meta.names || {},       // GUID → label, so a later diff reads in words
      areas,
    };
  }

  function fromExport(obj) {
    if (!obj || typeof obj !== "object") throw new Error(`That file isn't a ${BRANDING.name} drift snapshot.`);
    if (obj.schema !== EXPORT_SCHEMA && !EXPORT_SCHEMA_LEGACY.includes(obj.schema)) {
      throw new Error(`Unexpected format "${obj.schema || "unknown"}" — expected ${EXPORT_SCHEMA}.`);
    }
    if (!obj.areas || typeof obj.areas !== "object") throw new Error("The snapshot has no captured areas.");
    return obj;
  }

  // ---- severity ----------------------------------------------------------
  // Not every difference deserves the same attention. The ranking encodes the
  // question an administrator actually asks: did the baseline get WEAKER?
  // Widening an exclusion or switching a policy Off is how protection quietly
  // disappears, so those rank above a policy being renamed.
  const SEV = { critical: 3, high: 2, medium: 1, low: 0 };
  const SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

  function severityOf(kind, ch) {
    if (kind === "removed") return "critical";        // a policy that no longer exists
    if (kind === "added") return "high";
    const p = String(ch.path || "");
    if (p === "state") {
      const to = String(ch.to ?? "");
      if (to === "disabled") return "critical";                       // protection switched off
      if (to === "enabledForReportingButNotEnforced") return "critical"; // downgraded to observing
      return "high";                                                  // switched on / enforced
    }
    // Exclusions are the bypass surface: growing one is how a policy stops
    // applying to someone without the policy ever "changing".
    if (/^conditions\.users\.exclude/.test(p)) return ch.op === "add" ? "critical" : "medium";
    if (/^conditions\.users\.include/.test(p)) return ch.op === "remove" ? "high" : "medium";
    if (/^grantControls/.test(p)) return "high";
    if (/^conditions\.(applications|locations|platforms|clientAppTypes|signInRisk|userRisk|devices)/.test(p)) return "high";
    if (/^sessionControls/.test(p)) return "medium";
    if (/^(displayName|description)$/.test(p)) return "low";
    if (/isTrusted/.test(p)) return "critical";       // a location becoming trusted bypasses controls
    if (/ipRanges|countriesAndRegions/.test(p)) return "high";
    return "medium";
  }
  const worst = (list) => list.reduce((m, s) => (SEV[s] > SEV[m] ? s : m), "low");

  // ---- readable paths ----------------------------------------------------
  const PATH_LABEL = [
    [/^state$/,                                "Policy state"],
    [/^conditions\.users\.includeUsers$/,      "Included users"],
    [/^conditions\.users\.excludeUsers$/,      "Excluded users"],
    [/^conditions\.users\.includeGroups$/,     "Included groups"],
    [/^conditions\.users\.excludeGroups$/,     "Excluded groups"],
    [/^conditions\.users\.includeRoles$/,      "Included directory roles"],
    [/^conditions\.users\.excludeRoles$/,      "Excluded directory roles"],
    [/^conditions\.applications\.includeApplications$/, "Included resources"],
    [/^conditions\.applications\.excludeApplications$/, "Excluded resources"],
    [/^conditions\.locations\.includeLocations$/, "Included locations"],
    [/^conditions\.locations\.excludeLocations$/, "Excluded locations"],
    [/^conditions\.platforms\./,               "Device platforms"],
    [/^conditions\.clientAppTypes$/,           "Client apps"],
    [/^conditions\.signInRiskLevels$/,         "Sign-in risk"],
    [/^conditions\.userRiskLevels$/,           "User risk"],
    [/^conditions\.devices\./,                 "Device filter"],
    [/^grantControls\.builtInControls$/,       "Grant controls"],
    [/^grantControls\.operator$/,              "Grant control operator"],
    [/^grantControls\.authenticationStrength/, "Authentication strength"],
    [/^grantControls\.termsOfUse$/,            "Terms of use"],
    [/^sessionControls\./,                     "Session controls"],
    [/^ipRanges$/,                             "IP ranges"],
    [/^countriesAndRegions$/,                  "Countries"],
    [/^isTrusted$/,                            "Trusted flag"],
    [/^displayName$/,                          "Name"],
    [/^description$/,                          "Description"],
  ];
  function labelPath(p) {
    for (const [re, label] of PATH_LABEL) if (re.test(p)) return label;
    return p;
  }

  // GUIDs are unreadable in a diff, so resolve what we can from the names map
  // both snapshots carry. Unknown ids keep their GUID — an honest "I don't
  // know this one" beats inventing a label.
  function labelValue(v, names) {
    const one = (x) => {
      const s = String(x);
      if (names && names[s]) return `${names[s]}`;
      if (s === "All") return "All";
      if (s === "None") return "None";
      if (s === "GuestsOrExternalUsers") return "Guests or external users";
      return s;
    };
    if (Array.isArray(v)) return v.map(one).join(", ");
    if (v && typeof v === "object") return JSON.stringify(v);
    return v == null || v === "" ? "—" : one(v);
  }

  function describe(ch, names) {
    const what = labelPath(ch.path);
    if (ch.op === "add")    return { what, how: "added",   detail: labelValue(ch.value, names) };
    if (ch.op === "remove") return { what, how: "removed", detail: labelValue(ch.value, names) };
    if (ch.op === "set")    return { what, how: "set",     detail: labelValue(ch.to, names) };
    if (ch.op === "clear")  return { what, how: "cleared", detail: labelValue(ch.from, names) };
    return { what, how: "changed", detail: `${labelValue(ch.from, names)} → ${labelValue(ch.to, names)}` };
  }

  // ---- compare -----------------------------------------------------------
  function compare(before, after) {
    const names = { ...(before.names || {}), ...(after.names || {}) };
    const areas = [];
    let totals = { added: 0, removed: 0, changed: 0, unchanged: 0 };

    for (const a of AREAS) {
      const b = before.areas[a.key], n = after.areas[a.key];
      if (!b && !n) continue;
      // An area missing or failed on either side cannot be compared. Say so
      // instead of reporting a clean bill of health nobody verified.
      if (!b || !n || b.ok === false || n.ok === false) {
        areas.push({ ...a, comparable: false,
          why: !b ? "not captured in the snapshot" : !n ? "not read in this run"
             : b.ok === false ? `snapshot read failed: ${b.error}` : `this run failed: ${n.error}`,
          added: [], removed: [], changed: [], unchanged: 0, severity: "low" });
        continue;
      }
      const B = new Map(b.items.map((x) => [x.id, x]));
      const N = new Map(n.items.map((x) => [x.id, x]));
      const added = [], removed = [], changed = [];
      let unchanged = 0;

      for (const [id, item] of N) {
        const prev = B.get(id);
        if (!prev) { added.push({ id, name: item.name, severity: severityOf("added", {}) }); continue; }
        const chs = (typeof Audit !== "undefined" && Audit.diff ? Audit.diff(prev.body, item.body, "") : [])
          .map((c) => ({ ...c, severity: severityOf("changed", c) }));
        if (!chs.length) { unchanged++; continue; }
        changed.push({ id, name: item.name, was: prev.name,
          renamed: prev.name !== item.name,
          changes: chs.sort((x, y) => SEV[y.severity] - SEV[x.severity]),
          severity: worst(chs.map((c) => c.severity)) });
      }
      for (const [id, item] of B) if (!N.has(id)) removed.push({ id, name: item.name, severity: "critical" });

      const sevAll = [...added, ...removed, ...changed].map((x) => x.severity);
      // If one side was captured with the richer URL and the other fell back to
      // the thinner one, fields present in only one snapshot are an artefact of
      // the read, not a change somebody made. Say so on the area rather than
      // letting it read as drift the tenant caused.
      const shapeChanged = !!b.reduced !== !!n.reduced;
      areas.push({ ...a, comparable: true, added, removed, shapeChanged,
        shapeNote: shapeChanged
          ? "The two snapshots captured different field sets for this area (one read fell back to a simpler query), so some differences below may be an artefact of the read rather than a real change."
          : "",
        changed: changed.sort((x, y) => SEV[y.severity] - SEV[x.severity] || x.name.localeCompare(y.name)),
        unchanged, severity: sevAll.length ? worst(sevAll) : "low" });
      totals.added += added.length; totals.removed += removed.length;
      totals.changed += changed.length; totals.unchanged += unchanged;
    }

    const from = before.generated || "", to = after.generated || "";
    const days = from && to ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 864e5)) : null;
    // "No drift" is a claim, and it is only honest about areas that were
    // actually compared. If every area failed to read, the truthful answer is
    // "nothing was verified" — NOT a green tick. `clean` therefore requires at
    // least one comparable area, and `skipped` keeps the caveat attached to a
    // partial pass so it can never be quietly dropped from the summary.
    const compared = areas.filter((a) => a.comparable);
    const skipped = areas.filter((a) => !a.comparable);
    return { areas, totals, names, from, to, days,
      comparedAreas: compared.length,
      skipped: skipped.map((a) => ({ key: a.key, label: a.label, icon: a.icon, why: a.why })),
      verified: compared.length > 0,
      clean: compared.length > 0 && totals.added + totals.removed + totals.changed === 0,
      severity: worst(compared.map((a) => a.severity).concat("low")) };
  }

  // ---- attribution -------------------------------------------------------
  // Optional: if the Change audit tool has already read the directory log,
  // match drifted objects to the log entry that touched them. Only works
  // inside Entra's ~30-day retention — anything older stays unattributed,
  // and the UI says so rather than implying nobody was responsible.
  function attribute(cmp, auditRows) {
    if (!Array.isArray(auditRows) || !auditRows.length) return cmp;
    const byTarget = new Map();
    for (const r of auditRows) {
      if (!r.targetId) continue;
      const cur = byTarget.get(r.targetId);
      if (!cur || String(r.when) > String(cur.when)) byTarget.set(r.targetId, r);
    }
    for (const a of cmp.areas) {
      for (const list of [a.added, a.removed, a.changed]) {
        for (const item of list) {
          const hit = byTarget.get(item.id);
          if (hit) item.actor = { who: hit.actor, when: hit.when, activity: hit.activity };
        }
      }
    }
    cmp.attributed = true;
    return cmp;
  }

  // ---- markdown ----------------------------------------------------------
  function markdown(cmp, meta = {}) {
    const L = [];
    const when = (s) => String(s || "").slice(0, 16).replace("T", " ");
    L.push(`# Conditional Access drift report`);
    L.push("");
    L.push(`**Tenant:** ${meta.tenant || "—"}  `);
    L.push(`**Snapshot taken:** ${when(cmp.from) || "—"}  `);
    L.push(`**Compared with:** ${when(cmp.to) || "—"}${cmp.days != null ? `  (${cmp.days} day${cmp.days === 1 ? "" : "s"} apart)` : ""}  `);
    L.push(`**Generated by:** ${meta.build || ""}`);
    L.push("");
    if (!cmp.verified) {
      L.push(`## Nothing was compared`);
      L.push("");
      L.push(`**No area could be read, so this report proves nothing.** It is not a clean bill of health — it is the absence of one.`);
      L.push("");
      for (const s of cmp.skipped) L.push(`- ${s.icon} ${s.label} — ${s.why}`);
    } else if (cmp.clean) {
      L.push(`## No drift`);
      L.push("");
      L.push(`Every compared object is identical to the snapshot. ${cmp.totals.unchanged} object${cmp.totals.unchanged === 1 ? "" : "s"} checked across ${cmp.comparedAreas} area${cmp.comparedAreas === 1 ? "" : "s"}.`);
      if (cmp.skipped.length) {
        L.push("");
        L.push(`**Caveat:** ${cmp.skipped.length} area${cmp.skipped.length === 1 ? " was" : "s were"} not compared, so "no drift" covers only what was read:`);
        for (const s of cmp.skipped) L.push(`- ${s.icon} ${s.label} — ${s.why}`);
      }
    } else {
      L.push(`## Summary`);
      L.push("");
      L.push(`| | Count |`);
      L.push(`|---|---:|`);
      L.push(`| Added | ${cmp.totals.added} |`);
      L.push(`| Removed | ${cmp.totals.removed} |`);
      L.push(`| Changed | ${cmp.totals.changed} |`);
      L.push(`| Unchanged | ${cmp.totals.unchanged} |`);
      L.push("");
      L.push(`Highest severity: **${SEV_LABEL[cmp.severity]}**.`);
      L.push("");
    }
    for (const a of cmp.areas) {
      if (!a.comparable) {
        L.push(`## ${a.icon} ${a.label}`);
        L.push("");
        L.push(`_Not compared — ${a.why}._`);
        L.push("");
        continue;
      }
      if (!a.added.length && !a.removed.length && !a.changed.length) continue;
      L.push(`## ${a.icon} ${a.label}`);
      L.push("");
      if (a.shapeNote) { L.push(`> ⚠️ ${a.shapeNote}`); L.push(""); }
      for (const x of a.removed) L.push(`- **REMOVED** — ${x.name}${x.actor ? ` _(${x.actor.who}, ${when(x.actor.when)})_` : ""}`);
      for (const x of a.added)   L.push(`- **ADDED** — ${x.name}${x.actor ? ` _(${x.actor.who}, ${when(x.actor.when)})_` : ""}`);
      for (const x of a.changed) {
        L.push(`- **CHANGED** — ${x.name}${x.renamed ? ` _(was “${x.was}”)_` : ""}${x.actor ? ` _(${x.actor.who}, ${when(x.actor.when)})_` : ""}`);
        for (const c of x.changes) {
          const d = describe(c, cmp.names);
          L.push(`  - [${SEV_LABEL[c.severity]}] ${d.what} ${d.how}: ${d.detail}`);
        }
      }
      L.push("");
    }
    L.push("---");
    L.push("");
    L.push(`Drift is measured against a snapshot file, not the directory audit log, so it has no 30-day limit. Attribution (“who”) is only available for changes still inside Entra's audit retention.`);
    return L.join("\n");
  }

  return { EXPORT_SCHEMA, AREAS, areaByKey, snapshot, fromExport, compare, attribute,
    markdown, describe, labelPath, labelValue, severityOf, SEV, SEV_LABEL, strip };
})();
