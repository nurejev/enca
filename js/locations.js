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

  // ---- findings (roadmap R37) -------------------------------------------
  // Everything below is computed from data the tool ALREADY reads — the
  // location list and the policies in memory. No extra Graph call, which is
  // exactly why this went ahead of anything that needs one: the tool knew all
  // of it and told nobody, because it was rendered as a row rather than raised
  // as a finding.
  //
  // Pure over its inputs (list, raws) so it can be tested with node alone and
  // lifted out of this app: no DOM, no globals, no reads of its own.
  //
  // Severity vocabulary is the one 🔍 Gap analyse uses — high / medium / low —
  // so a reader does not have to learn a second scale.
  // \b DOES NOT WORK HERE. An underscore is a word character in a JS regex, so
  // /\bblock/ has no boundary to find in "_Blocked IPs" — and a leading
  // underscore is the usual way of pinning a list to the top of an alphabetical
  // list in Entra, which makes it the single most likely spelling of the case
  // this suppression exists for. The boundaries are therefore explicit
  // "not a letter or digit", which an underscore satisfies.
  //
  // "bad" was removed: /\bbad\b/ suppressed "Bad Homburg office", a real place,
  // and a check that silently ignores a location because of where it is would
  // be a worse failure than the nagging it was added to prevent.
  const BLOCKLIST_NAME = /(^|[^a-z0-9])(block|blocked|blocklist|blok|geblokkeerd|deny|denied|denylist|blacklist|banned|forbidden|malicious|tor|vpn)([^a-z0-9]|$)/i;

  const prefixOf = (cidr) => {
    const bits = Number(String(cidr || "").split("/")[1]);
    return Number.isInteger(bits) ? bits : null;
  };
  // "Overly broad" is not a matter of taste: a /8 is 16.7 million addresses, and
  // an office does not have one. IPv6 is enormous at every prefix, so the line
  // is drawn at the ISP allocation rather than the site one: a /32 is what a
  // provider is handed by its RIR, while a site is normally given a /48 and a
  // single network a /64. Flagging at /48 would flag every correctly sized
  // office; /32 or shorter is somebody's whole allocation, not a location.
  function broadness(cidr) {
    const bits = prefixOf(cidr);
    if (bits === null) return null;
    const v6 = String(cidr).split("/")[0].includes(":");
    if (v6) return bits === 0 ? "any" : bits <= 32 ? "broad" : null;
    return bits === 0 ? "any" : bits <= 8 ? "broad" : null;
  }
  const raise = (s) => (s === "low" ? "medium" : "high");
  const isBlockPolicy = (p) => ((p.grantControls || {}).builtInControls || []).includes("block");
  const enabledish = (p) => p.state === "enabled";

  // Every location id a policy names, other than the two reserved keywords.
  function referencedIds(raws) {
    const m = new Map();                                     // id → [policies]
    for (const p of raws || []) {
      const l = p.conditions?.locations || {};
      for (const id of [...(l.includeLocations || []), ...(l.excludeLocations || [])]) {
        if (id === "All" || id === "AllTrusted") continue;
        if (!m.has(id)) m.set(id, []);
        const arr = m.get(id);
        if (!arr.some((x) => x.id === p.id)) arr.push({ id: p.id, name: p.displayName, state: p.state });
      }
    }
    return m;
  }

  // A finding is a plain record: what is wrong, on what, why it matters, and
  // what closes it. `locationId` is null for the one check that is about a
  // policy pointing at nothing.
  const FIND = (o) => ({ policies: [], locationId: null, locationName: "", ...o });

  function findings(list, raws) {
    const out = [];
    const locs = list || [], pols = raws || [];
    const byId = new Map(locs.map((l) => [l.id, l]));
    const allTrusted = trustedConsumers(pols);

    // ① DANGLING REFERENCE — a policy names a location id this tenant no longer
    // has. Same failure ① Check reports for groups, and the same cause:
    // something was tidied up while a policy still pointed at it. Entra keeps
    // the stale id in the policy; the condition it describes is gone.
    for (const [id, ps] of referencedIds(pols)) {
      if (byId.has(id)) continue;
      const live = ps.filter(enabledish);
      out.push(FIND({
        code: "dangling",
        severity: live.length ? "high" : "medium",
        title: "Policy references a named location that no longer exists",
        detail: `Location id — no location in this tenant carries it.`,
        why: live.length
          ? `${live.length} enforced polic${live.length === 1 ? "y" : "ies"} still name${live.length === 1 ? "s" : ""} it. Entra keeps the id in the policy, so the condition reads as configured while matching nothing — which for an EXCLUDE means the exclusion silently stopped applying, and for an INCLUDE means the policy no longer covers what it was written for.`
          : "No enforced policy names it today, so nothing is being widened right now — but the reference will come back to life the moment one of these policies is switched on.",
        fix: "Remove the reference from each policy, or recreate the location it was pointing at.",
        locationId: null,
        locationName: id,
        policies: ps,
      }));
    }

    for (const l of locs) {
      const k = kindOf(l);
      if (k === "compliantNetwork") continue;               // service-managed
      const used = usedBy(l, pols);
      const usedLive = used.filter((u) => (pols.find((p) => p.id === u.id) || {}).state === "enabled");

      // ② EMPTY COUNTRY LOCATION — matches nothing, and still reads as
      // configured everywhere it is used. Including unknown regions makes it
      // non-empty in practice, so that case is not a finding.
      if (k === "country" && !(l.countriesAndRegions || []).length && !l.includeUnknownCountriesAndRegions) {
        out.push(FIND({
          code: "emptyCountry",
          severity: usedLive.length ? "high" : "medium",
          title: "Country location with no countries in it",
          detail: "0 countries, unknown regions not included — it matches no sign-in at all.",
          why: used.length
            ? `${used.length} polic${used.length === 1 ? "y uses" : "ies use"} it, and every one of them evaluates a condition that can never be true. A block policy scoped to it blocks nobody; an exclusion built on it excludes nobody. The policy list still shows the condition, so this looks configured from every screen except this one.`
            : "No policy uses it yet, so it enforces nothing today — the cost is the next person who reaches for it assuming it holds the countries its name promises.",
          fix: "Add the countries it is meant to cover, or delete it and remove the reference.",
          locationId: l.id, locationName: l.displayName || "(unnamed)", policies: used,
        }));
      }

      if (k !== "ip") continue;
      const ranges = (l.ipRanges || []).map((x) => x.cidrAddress).filter(Boolean);

      // ③ OVERLY BROAD IP RANGE — a /8 inside a location called "office".
      // A trusted one is worse than an untrusted one, because everything
      // consuming All trusted locations inherits it without naming it.
      const any = ranges.filter((r) => broadness(r) === "any");
      const broad = ranges.filter((r) => broadness(r) === "broad");
      if (any.length || broad.length) {
        let sev = any.length ? "high" : "medium";
        if (isTrusted(l) && sev !== "high") sev = raise(sev);
        out.push(FIND({
          code: "broadRange",
          severity: sev,
          title: any.length ? "IP location contains a range covering the whole internet" : "IP location contains an overly broad range",
          detail: [...any, ...broad].join(", "),
          why: (any.length
            ? "A /0 matches every address there is, so the location is not a location — anything scoped to it is scoped to everyone. "
            : "A /8 is 16.7 million addresses and a /32 IPv6 prefix is an entire allocation; neither is an office. ")
            + (isTrusted(l)
              ? `This location is TRUSTED, so the ${allTrusted.length} polic${allTrusted.length === 1 ? "y" : "ies"} using “All trusted locations” inherit the range without ever naming it.`
              : "Whatever is scoped to this location is scoped to far more than its name suggests."),
          fix: "Narrow the range to the addresses actually in use, or split the location so the broad part is separate and can be judged on its own.",
          locationId: l.id, locationName: l.displayName || "(unnamed)", policies: used,
        }));
      }

      // ④ UNTRUSTED IP LOCATION — the careful one.
      //
      // The trusted flag only changes behaviour when something actually
      // consumes "All trusted locations". In a tenant where nothing does, this
      // check has nothing to say and stays silent rather than filling the
      // screen with a preference.
      //
      // And an untrusted IP location is very often deliberate: a block list is
      // untrusted ON PURPOSE, and marking it trusted would be the bug. Where
      // the tenant's own configuration says so — a Block policy naming it, or
      // a name that says it outright — nothing is raised at all. Everywhere
      // else the finding NAMES the block-list case as a valid reason to leave
      // it alone, because a check that cries wolf about the normal case is
      // worse than no check.
      if (!isTrusted(l) && allTrusted.length) {
        const blocking = used.filter((u) => isBlockPolicy(pols.find((p) => p.id === u.id) || {}));
        const deliberate = blocking.length > 0 || BLOCKLIST_NAME.test(l.displayName || "");
        if (!deliberate) {
          out.push(FIND({
            code: "untrustedIp",
            severity: "low",
            title: "IP location is not trusted, and policies rely on “All trusted locations”",
            detail: `${allTrusted.length} polic${allTrusted.length === 1 ? "y" : "ies"} in this tenant target “All trusted locations”; this location is not one of them.`,
            why: "Sign-ins from these ranges do not get whatever those policies grant or exclude on a trusted network — which is right if that is the intent, and a quiet gap if the ranges belong to an office somebody assumed was covered.",
            fix: "Mark it trusted if it is a corporate network — note that this immediately moves every policy using “All trusted locations”. If it is a deliberate block list, or any set of addresses you do not vouch for, leave it exactly as it is: untrusted is the correct state and this finding can be ignored.",
            locationId: l.id, locationName: l.displayName || "(unnamed)", policies: used,
          }));
        }
      }
    }

    const order = { high: 0, medium: 1, low: 2 };
    out.sort((a, b) => order[a.severity] - order[b.severity] || a.locationName.localeCompare(b.locationName));
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of out) counts[f.severity]++;
    // Grouped by location id for the row badges; dangling findings have no
    // location and live under the empty key so a caller cannot lose them.
    const byLocation = {};
    for (const f of out) (byLocation[f.locationId || ""] ||= []).push(f);
    return { findings: out, counts, total: out.length, byLocation,
             trustedConsumerCount: allTrusted.length };
  }

  const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" };

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
    buildPayload, usedBy, trustedConsumers, summarize, detail, toForm, diff, configOf, toExport, fromExport, compare,
    findings, broadness, SEV_LABEL };
})();
