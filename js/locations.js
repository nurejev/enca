// ======================================================================
// Named locations — view, create, edit and delete the Conditional Access
// named locations of the tenant.
//   https://learn.microsoft.com/graph/api/resources/namedlocation
//
// Two derived types, and the @odata.type decides which fields apply:
//   ipNamedLocation      — ipRanges (IPv4/IPv6 CIDR) + isTrusted
//   countryNamedLocation — countriesAndRegions (ISO 3166-2) +
//                          includeUnknownCountriesAndRegions + countryLookupMethod
// The type is fixed at creation: an existing location can be renamed and its
// ranges/countries changed, but it cannot switch between the two.
//
// Writes need Policy.ReadWrite.ConditionalAccess. Deleting a location that a
// policy still references silently widens that policy, so references are
// surfaced and a referenced location needs a typed confirmation.
// ======================================================================
const Locations = (() => {
  const IP_TYPE = "#microsoft.graph.ipNamedLocation";
  const COUNTRY_TYPE = "#microsoft.graph.countryNamedLocation";

  // A tenant can also hold a Global Secure Access "compliant network" location.
  // It is service-managed: it has no ranges and this tool won't edit it.
  function kindOf(l) {
    const t = String(l && l["@odata.type"] || "").toLowerCase();
    if (t.includes("country")) return "country";
    if (t.includes("compliantnetwork")) return "compliantNetwork";
    return "ip";
  }
  const isTrusted = (l) => kindOf(l) === "ip" && !!l.isTrusted;
  const editable = (l) => kindOf(l) !== "compliantNetwork";

  // ---- validation -------------------------------------------------------
  // IPv4 a.b.c.d/0-32; IPv6 is accepted on shape (Graph does the real parsing).
  function validCidr(s) {
    const v = String(s || "").trim();
    if (!v) return false;
    const [addr, bitsRaw] = v.split("/");
    if (bitsRaw === undefined || bitsRaw === "") return false;
    const bits = Number(bitsRaw);
    if (addr.includes(":")) return /^[0-9a-f:]+$/i.test(addr) && Number.isInteger(bits) && bits >= 0 && bits <= 128;
    const p = addr.split(".");
    if (p.length !== 4 || p.some((x) => x === "" || !/^\d+$/.test(x) || +x > 255)) return false;
    return Number.isInteger(bits) && bits >= 0 && bits <= 32;
  }
  const validCountry = (s) => /^[A-Za-z]{2}$/.test(String(s || "").trim());
  const isIPv6 = (s) => String(s).split("/")[0].includes(":");

  // free text (newline / comma separated) → clean list
  const splitList = (txt) => String(txt || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

  // Validate an editor form; returns { ok, errors[], payload }
  function buildPayload(form) {
    const errors = [];
    const name = String(form.name || "").trim();
    if (!name) errors.push("A display name is required.");
    if (name.length > 256) errors.push("The display name is too long (max 256 characters).");

    if (form.kind === "ip") {
      const ranges = splitList(form.ranges);
      if (!ranges.length) errors.push("At least one IP range in CIDR format is required (for example 203.0.113.0/24).");
      const bad = ranges.filter((r) => !validCidr(r));
      if (bad.length) errors.push(`Not valid CIDR: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}.`);
      if (errors.length) return { ok: false, errors };
      return { ok: true, errors, payload: {
        "@odata.type": IP_TYPE,
        displayName: name,
        isTrusted: !!form.isTrusted,
        ipRanges: ranges.map((r) => ({
          "@odata.type": isIPv6(r) ? "#microsoft.graph.iPv6CidrRange" : "#microsoft.graph.iPv4CidrRange",
          cidrAddress: r,
        })),
      } };
    }

    const countries = [...new Set(splitList(form.countries).map((c) => c.toUpperCase()))];
    if (!countries.length) errors.push("At least one country/region code is required (two letters, ISO 3166-2).");
    const badC = countries.filter((c) => !validCountry(c));
    if (badC.length) errors.push(`Not valid two-letter codes: ${badC.slice(0, 5).join(", ")}.`);
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors, payload: {
      "@odata.type": COUNTRY_TYPE,
      displayName: name,
      countriesAndRegions: countries,
      includeUnknownCountriesAndRegions: !!form.includeUnknown,
      countryLookupMethod: form.lookupMethod || "clientIpAddress",
    } };
  }

  // ---- which policies reference a location? ----------------------------
  // Two ways a policy can reach a location:
  //   directly   — its id sits in includeLocations / excludeLocations
  //   implicitly — the policy uses "AllTrusted" and the location is trusted,
  //                so it is covered without ever naming it. This is how most
  //                trusted-network locations are actually consumed, and missing
  //                it made them look unused.
  // Pass the location object (an id still works, but then only direct hits are
  // found because the trusted flag isn't known).
  // Returns [{id,name,state,how,implicit}]
  function usedBy(loc, raws) {
    const id = typeof loc === "string" ? loc : (loc && loc.id);
    const trusted = typeof loc === "object" && isTrusted(loc);
    const out = [];
    for (const p of raws || []) {
      const l = p.conditions?.locations || {};
      const inc = l.includeLocations || [], exc = l.excludeLocations || [];
      const dInc = inc.includes(id), dExc = exc.includes(id);
      const tInc = trusted && inc.includes("AllTrusted");
      const tExc = trusted && exc.includes("AllTrusted");
      if (!(dInc || dExc || tInc || tExc)) continue;
      const how = dInc && dExc ? "included + excluded"
        : dInc ? "included" : dExc ? "excluded"
        : tInc && tExc ? "included + excluded via All trusted locations"
        : tInc ? "included via All trusted locations" : "excluded via All trusted locations";
      out.push({ id: p.id, name: p.displayName, state: p.state, how, implicit: !(dInc || dExc) });
    }
    return out;
  }
  // How many policies use "All trusted locations"? Those follow every trusted
  // IP location, so flipping isTrusted changes their behaviour too.
  function trustedConsumers(raws) {
    return (raws || []).filter((p) => {
      const l = p.conditions?.locations || {};
      return (l.includeLocations || []).includes("AllTrusted") || (l.excludeLocations || []).includes("AllTrusted");
    }).map((p) => ({ id: p.id, name: p.displayName, state: p.state }));
  }

  function summarize(list, raws) {
    const ip = list.filter((l) => kindOf(l) === "ip");
    return {
      total: list.length,
      ip: ip.length,
      country: list.filter((l) => kindOf(l) === "country").length,
      compliantNetwork: list.filter((l) => kindOf(l) === "compliantNetwork").length,
      trusted: ip.filter(isTrusted).length,
      ranges: ip.reduce((n, l) => n + (l.ipRanges || []).length, 0),
      unused: list.filter((l) => usedBy(l, raws).length === 0).length,
      viaTrusted: list.filter((l) => usedBy(l, raws).every((u) => u.implicit) && usedBy(l, raws).length > 0).length,
    };
  }

  // one-line description for a row
  function detail(l) {
    if (kindOf(l) === "compliantNetwork") return "Global Secure Access compliant network — managed by the service";
    if (kindOf(l) === "ip") {
      const r = (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean);
      return r.length ? `${r.length} range${r.length === 1 ? "" : "s"}: ${r.slice(0, 4).join(", ")}${r.length > 4 ? ` +${r.length - 4} more` : ""}` : "no ranges";
    }
    const c = l.countriesAndRegions || [];
    return `${c.length} countr${c.length === 1 ? "y" : "ies"}: ${c.slice(0, 12).join(", ")}${c.length > 12 ? ` +${c.length - 12} more` : ""}`
      + (l.includeUnknownCountriesAndRegions ? " · incl. unknown" : "")
      + (l.countryLookupMethod === "authenticatorAppGps" ? " · GPS lookup" : "");
  }

  // editor form prefilled from an existing location
  function toForm(l) {
    if (!l) return { kind: "ip", name: "", ranges: "", isTrusted: false, countries: "", includeUnknown: false, lookupMethod: "clientIpAddress" };
    return {
      id: l.id, kind: kindOf(l), name: l.displayName || "",
      ranges: (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean).join("\n"),
      isTrusted: !!l.isTrusted,
      countries: (l.countriesAndRegions || []).join(", "),
      includeUnknown: !!l.includeUnknownCountriesAndRegions,
      lookupMethod: l.countryLookupMethod || "clientIpAddress",
    };
  }

  // what changed between the stored location and the edited form
  function diff(orig, payload) {
    const out = [];
    if (!orig) return ["created"];
    if ((orig.displayName || "") !== payload.displayName) out.push(`name: ${orig.displayName} → ${payload.displayName}`);
    if (kindOf(orig) === "ip") {
      const a = (orig.ipRanges || []).map((x) => x.cidrAddress).sort().join(",");
      const b = (payload.ipRanges || []).map((x) => x.cidrAddress).sort().join(",");
      if (a !== b) out.push("IP ranges changed");
      if (!!orig.isTrusted !== !!payload.isTrusted) out.push(`trusted: ${!!orig.isTrusted} → ${!!payload.isTrusted}`);
    } else {
      const a = (orig.countriesAndRegions || []).slice().sort().join(",");
      const b = (payload.countriesAndRegions || []).slice().sort().join(",");
      if (a !== b) out.push("countries changed");
      if (!!orig.includeUnknownCountriesAndRegions !== !!payload.includeUnknownCountriesAndRegions) out.push("include-unknown changed");
      if ((orig.countryLookupMethod || "clientIpAddress") !== payload.countryLookupMethod) out.push("lookup method changed");
    }
    return out;
  }

  // ---------- config export / compare ----------------------------------
  // Named locations are the quiet dependency of half a CA baseline: a policy
  // that trusts an office range breaks silently when someone edits the range.
  // Nothing is stored server-side here, so exporting a snapshot is the only way
  // to hold "what it looked like then" and diff a later state against it.
  const EXPORT_SCHEMA = "enca-locations/1";

  // Only the fields that define the location — ids and timestamps are tenant
  // state, not configuration, and would make every diff noisy.
  function configOf(l) {
    const k = kindOf(l);
    const base = { displayName: l.displayName || "", kind: k };
    if (k === "country") {
      return { ...base,
        countriesAndRegions: (l.countriesAndRegions || []).slice().sort(),
        includeUnknownCountriesAndRegions: !!l.includeUnknownCountriesAndRegions,
        countryLookupMethod: l.countryLookupMethod || "clientIpAddress" };
    }
    if (k === "compliantNetwork") return base;
    return { ...base,
      isTrusted: !!l.isTrusted,
      ipRanges: (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean).slice().sort() };
  }

  function toExport(list, meta = {}) {
    return {
      schema: EXPORT_SCHEMA,
      generated: new Date().toISOString(),
      tenant: meta.tenant || "",
      build: meta.build || "",
      count: (list || []).length,
      locations: (list || []).map(configOf)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  }
  function fromExport(obj) {
    if (!obj || typeof obj !== "object") throw new Error(`That file isn't a ${BRANDING.name} named-locations export.`);
    if (obj.schema !== EXPORT_SCHEMA) throw new Error(`Unexpected format "${obj.schema || "unknown"}" — expected ${EXPORT_SCHEMA}.`);
    if (!Array.isArray(obj.locations)) throw new Error("The export has no locations.");
    return obj;
  }

  // Match on display name: it is the only stable handle across tenants, and an
  // id from another tenant means nothing here. Returns four buckets.
  function compare(current, snapLocations) {
    const cur = new Map((current || []).map((l) => [(l.displayName || "").toLowerCase(), l]));
    const snap = new Map((snapLocations || []).map((s) => [(s.displayName || "").toLowerCase(), s]));
    const same = [], changed = [], missing = [], extra = [];
    for (const [key, s] of snap) {
      const c = cur.get(key);
      if (!c) { missing.push(s); continue; }             // in the file, not here
      const now = configOf(c), fields = [];
      if (now.kind !== s.kind) fields.push(`type: ${s.kind} → ${now.kind}`);
      const list = (a) => (a || []).join(", ") || "—";
      if ((s.ipRanges || now.ipRanges) && list(s.ipRanges) !== list(now.ipRanges)) {
        const was = new Set(s.ipRanges || []), is = new Set(now.ipRanges || []);
        const added = [...is].filter((x) => !was.has(x)), removed = [...was].filter((x) => !is.has(x));
        fields.push(`ranges: ${added.length ? `+${added.join(", +")}` : ""}${added.length && removed.length ? " · " : ""}${removed.length ? `−${removed.join(", −")}` : ""}`);
      }
      if ((s.countriesAndRegions || now.countriesAndRegions) && list(s.countriesAndRegions) !== list(now.countriesAndRegions)) {
        const was = new Set(s.countriesAndRegions || []), is = new Set(now.countriesAndRegions || []);
        const added = [...is].filter((x) => !was.has(x)), removed = [...was].filter((x) => !is.has(x));
        fields.push(`countries: ${added.length ? `+${added.join(", +")}` : ""}${added.length && removed.length ? " · " : ""}${removed.length ? `−${removed.join(", −")}` : ""}`);
      }
      // The trusted flag is the one that silently changes what policies enforce
      if (!!s.isTrusted !== !!now.isTrusted) fields.push(`trusted: ${!!s.isTrusted} → ${!!now.isTrusted}`);
      if (!!s.includeUnknownCountriesAndRegions !== !!now.includeUnknownCountriesAndRegions) fields.push(`include-unknown: ${!!s.includeUnknownCountriesAndRegions} → ${!!now.includeUnknownCountriesAndRegions}`);
      if ((s.countryLookupMethod || "") !== (now.countryLookupMethod || "") && (s.countryLookupMethod || now.countryLookupMethod)) fields.push(`lookup: ${s.countryLookupMethod || "—"} → ${now.countryLookupMethod || "—"}`);
      if (fields.length) changed.push({ location: c, snapshot: s, fields });
      else same.push(c);
    }
    for (const [key, c] of cur) if (!snap.has(key)) extra.push(c);   // here, not in the file
    const byName = (a, b) => (a.displayName || "").localeCompare(b.displayName || "");
    return {
      same: same.sort(byName), extra: extra.sort(byName), missing: missing.sort(byName),
      changed: changed.sort((a, b) => byName(a.location, b.location)),
    };
  }

  return { IP_TYPE, COUNTRY_TYPE, EXPORT_SCHEMA, kindOf, isTrusted, editable, validCidr, validCountry, splitList,
    buildPayload, usedBy, trustedConsumers, summarize, detail, toForm, diff, configOf, toExport, fromExport, compare };
})();
