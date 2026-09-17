// ======================================================================
// Import tool (BETA) — restores an ENCA backup zip into the tenant.
// Order: dependencies first (groups, named locations, auth strengths,
// auth contexts), then the CA policies. Policies are ALWAYS imported in
// the disabled ("Off") state, skipped when a policy with the same CA
// number AND version (vX.Y[.Z]) already exists, and their INCLUDE
// assignment is remapped to the deploy/test persona group.
// ======================================================================
const Importer = (() => {
  // Application.Read.All is required by Graph whenever a policy carries an
  // application condition — without it the create fails with 403.
  const WRITE = ["Policy.ReadWrite.ConditionalAccess", "Application.Read.All"];
  const STRENGTH_WRITE = [...WRITE, "Policy.ReadWrite.AuthenticationMethod"];

  // Template placeholders used by the CA baseline policy files, e.g.
  //   "{{group:CAB-SEC-U-BreakGlass}}", "{{location:BG_TrustedLocation}}",
  //   "{{authstrength:Phishing-resistant MFA + TAP}}"
  const PLACEHOLDER = /^\{\{(group|location|authstrength|authcontext|tou):(.+)\}\}$/;
  const parsePlaceholder = (v) => {
    const m = PLACEHOLDER.exec(String(v || "").trim());
    return m ? { kind: m[1], name: m[2] } : null;
  };
  function collectPlaceholders(policies) {
    const found = [];
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") return Object.values(o).forEach(walk);
      const p = parsePlaceholder(o);
      if (p && !found.some(x => x.kind === p.kind && x.name === p.name)) found.push(p);
    };
    policies.forEach(walk);
    return found;
  }

  const PERSONA_GROUPS = {
    global: "CAD-SEC-U-DG-GLO", admins: "CAD-SEC-U-DG-ADM", internals: "CAD-SEC-U-DG-INT",
    externals: "CAD-SEC-U-DG-EXT", guestusers: "CAD-SEC-U-DG-GUESTUSERS", g_admins: "CAD-SEC-U-DG-GUESTAdmins",
    serviceaccounts: "CAD-SEC-U-DG-SA", devops: "CAD-SEC-U-DG-DevOps", factoryworkers: "CAD-SEC-U-DG-FW",
  };

  // A workload-identity policy targets service principals, not people. Graph
  // rejects a policy that carries both a user/group scope and a
  // clientApplications scope, so these must never get the persona remap.
  const isWorkloadIdentity = (raw) =>
    ((raw.conditions?.clientApplications?.includeServicePrincipals) || []).length > 0;

  // Conditional Access for agents (preview) — Joey Verlinden's CA5xx block.
  // Graph documents part of the shape only in beta (clientApplications'
  // includeAgentIdServicePrincipals, agentIdRiskLevels, "AllAgentIdResources")
  // and part of it not at all (conditions.agents, conditions.agentContext), and
  // the tenant needs Microsoft Entra Agent ID to accept any of it. A refusal on
  // one of these is most often the tenant, not the file — the failure says so.
  const isAgentPolicy = (raw) => {
    const c = (raw && raw.conditions) || {};
    return !!(c.agents || c.agentContext || c.agentIdRiskLevels
      || ((c.clientApplications && c.clientApplications.includeAgentIdServicePrincipals) || []).length
      || ((c.applications && c.applications.includeApplications) || []).includes("AllAgentIdResources")
      || ((c.users && c.users.includeUsers) || []).includes("AllAgentIdUsers"));
  };

  // Conditional Access for workload identities is a separately purchased SKU
  // (Microsoft Entra Workload ID — NOT part of Entra ID P1/P2). Without it Graph
  // refuses to create or modify a policy scoped to service principals, so the
  // CA900-range policies must be left out of the import rather than attempted.
  // /subscribedSkus is covered by the Directory.Read.All we already hold.
  // Returns { known, licensed, sku } — `known:false` means the read failed, in
  // which case we warn but do not block.
  const WID_SKU = /workload[ _-]?id/i;   // Entra_Workload_IDP1, WORKLOAD_IDENTITY_P1/P2, …
  async function workloadIdLicence() {
    try {
      const skus = await Graph.ggetAll("/subscribedSkus");
      for (const s of skus) {
        // A cancelled subscription still shows up — only a live one counts.
        if (["Suspended", "Deleted", "LockedOut"].includes(s.capabilityStatus)) continue;
        if (WID_SKU.test(s.skuPartNumber || "")) return { known: true, licensed: true, sku: s.skuPartNumber };
        const sp = (s.servicePlans || []).find(x => WID_SKU.test(x.servicePlanName || "") && x.provisioningStatus === "Success");
        if (sp) return { known: true, licensed: true, sku: `${s.skuPartNumber} / ${sp.servicePlanName}` };
      }
      return { known: true, licensed: false, sku: null };
    } catch (e) {
      console.warn("Workload ID licence check failed:", e.message);
      return { known: false, licensed: false, sku: null, error: e.message };
    }
  }

  // Friendly name for the Microsoft first-party apps the baseline excludes —
  // MSLearn already keeps that table, so borrow it rather than duplicating.
  function appLabel(appId) {
    const l = (typeof MSLearn !== "undefined" && MSLearn.APP_LABEL) ? MSLearn.APP_LABEL[String(appId).toLowerCase()] : null;
    return l ? `${l} (${appId})` : `Application ${appId}`;
  }

  // Every application a policy references, included or excluded. A CA policy
  // can only name an app that has a service principal in THIS tenant — if it
  // hasn't, Graph rejects the whole create with a bare 400 BadRequest.
  function appRefs(raws) {
    const out = new Set();
    const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
    for (const p of raws || []) {
      const a = p.conditions?.applications || {};
      [...(a.includeApplications || []), ...(a.excludeApplications || [])]
        .forEach((x) => { if (isGuid(x)) out.add(String(x).toLowerCase()); });
    }
    return [...out];
  }

  // E-Admins (emergency/break-glass) policies are imported AS-IS: no persona
  // remap, original state kept, assignments unchanged.
  function isEAdmins(name) {
    const n = (name || "").toLowerCase();
    return /\be[-_]?admins?\b/.test(n) || Render.caGroup(name).key === 1100;
  }

  // persona from the policy name (token first, CA-number range as fallback)
  function personaOf(name) {
    const n = (name || "").toLowerCase();
    // Agent identities (Joey's CA5xx block) have no deploy persona group: the
    // include is agent-shaped and stays as shipped.
    if (/-agents?-|agentid/.test(n)) return "agents";
    if (/g[_-]?admin|guestadmin/.test(n)) return "g_admins";
    if (/guest/.test(n)) return "guestusers";
    if (/factory|[-_]fw\b/.test(n)) return "factoryworkers";
    if (/serviceaccount|svcaccount|[-_]sa[-_]/.test(n)) return "serviceaccounts";
    if (/devops/.test(n)) return "devops";
    if (/external/.test(n)) return "externals";
    if (/internal/.test(n)) return "internals";
    if (/admin/.test(n)) return "admins";
    if (/global/.test(n)) return "global";
    const k = Render.caGroup(name).key;
    return { 0: "global", 100: "admins", 200: "internals", 300: "externals", 400: "guestusers", 500: "g_admins", 600: "serviceaccounts", 700: "serviceaccounts", 800: "serviceaccounts", 1000: "devops", 1100: "admins" }[k] || null;
  }

  // Persona key -> restricted-AU code. The deploy group and the AU carry the
  // same suffix by design (CAD-SEC-U-DG-ADM / CAB-SEC-RMAU-ADM-Exclusions), so
  // this is derived rather than written out a second time and left to rot.
  const PERSONA_CODE = Object.fromEntries(
    Object.entries(PERSONA_GROUPS).map(([k, g]) => [k, g.replace(/^CAD-SEC-U-DG-/, "")]));

  // A group's vault is decided by ONE rule, shared with ⑥ Protect:
  // CaMap.codeOf — this tenant's own stated mapping (R28) first, then the CA
  // number in the group's own name. Import used to infer it from the personas
  // of the policies that reference the group, which cannot answer for
  // CAB-SEC-U-BreakGlass (every persona excludes it) and gets no answer at all
  // for a group whose policies were not selected. Persona inference is kept
  // only as the fallback for a group nothing else places.
  //
  // Going through CaMap rather than Rmau directly is what makes the mapping
  // reach import at all: a reused group called Contractors-NoMFA is filed into
  // the vault the tenant said it belongs in, instead of falling to inference
  // that answers from whichever policies happened to be selected.
  const fixedCode = (g) => {
    try {
      if (typeof CaMap !== "undefined" && CaMap.codeOf) return CaMap.codeOf(g);
      const name = typeof g === "object" ? (g.displayName || g.name || "") : g;
      return (typeof Rmau !== "undefined" && Rmau.codeForGroup) ? Rmau.codeForGroup(name) : null;
    } catch { return null; }
  };

  // Which persona's vault does an imported group belong in? A group has no
  // persona of its own — it inherits from the policies that reference it. One
  // persona is an answer; two is NOT, and the difference matters:
  //
  // An object may sit in more than one restricted AU, and a scoped admin on
  // ANY of them can manage it (Microsoft Learn, "Who can modify objects").
  // So filing a shared group under two personas would let the Externals admin
  // edit a group the Admins policies rely on — the exact leak the per-persona
  // split exists to prevent. Ambiguous groups are reported, never placed.
  function groupPersonas(bundle, chosenRaws) {
    const out = new Map();
    for (const g of bundle.groups || []) {
      const fixed = fixedCode(g);
      if (fixed) { out.set(g.id, { name: g.displayName, personas: [], persona: null, code: fixed, why: null }); continue; }
      const seen = new Set();
      for (const raw of chosenRaws) {
        const blob = JSON.stringify(raw);
        if (!blob.includes(g.id) && !(g.displayName && blob.includes(g.displayName))) continue;
        const p = personaOf(raw.displayName);
        if (p) seen.add(p);
      }
      out.set(g.id, {
        name: g.displayName,
        personas: [...seen],
        persona: seen.size === 1 ? [...seen][0] : null,
        code: seen.size === 1 ? PERSONA_CODE[[...seen][0]] : null,
        why: seen.size === 0 ? "no persona could be read from the policies that use it"
           : seen.size > 1 ? `used by ${seen.size} personas (${[...seen].join(", ")}) — a shared group placed in one persona's unit would be editable by that persona's admin alone, and placing it in both would let either edit it`
           : null,
      });
    }
    return out;
  }

  // The persona codes an import will actually touch — the preflight asks about
  // these nine at most, and usually far fewer.
  function personaCodes(bundle, chosenRaws) {
    const codes = new Set();
    for (const raw of chosenRaws) {
      const p = personaOf(raw.displayName);
      if (p && PERSONA_CODE[p]) codes.add(PERSONA_CODE[p]);
    }
    // Break-glass is not a persona, so it is added by the presence of the group
    // itself rather than by any policy name.
    for (const g of bundle.groups || []) {
      const c = fixedCode(g);
      if (c) codes.add(c);
    }
    return [...codes];
  }

  function parseCaVersion(name) {
    const m = /v(\d+(?:\.\d+)+)/i.exec(name || "");
    return { num: Render.caGroup(name).num, ver: m ? m[1] : null };
  }

  // Backup files can be UTF-16. Windows PowerShell's Out-File writes UTF-16 LE
  // with a byte-order mark, and that is how Joey Verlinden's repository ships
  // every policy, group and named location. JSZip's "string" and File.text()
  // decode as UTF-8 whatever the bytes are, so a downloaded copy of his
  // repository used to load as zero policies without a word. Sniff the mark
  // (or the NUL-every-other-byte shape of UTF-16 without one) and decode
  // accordingly — the same rule js/baselineLive.js applies to the live read.
  function decodeBytes(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let enc = "utf-8";
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) enc = "utf-16le";
    else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) enc = "utf-16be";
    else if (b.length >= 4 && b[0] !== 0 && b[1] === 0 && b[3] === 0) enc = "utf-16le";
    let txt;
    try { txt = new TextDecoder(enc).decode(b); }
    catch { txt = new TextDecoder("utf-8").decode(b); }
    return txt.replace(/^\ufeff/, "");
  }

  // ---------- read a backup (zip file OR selected folder), same structure ----------
  const FOLDER_KEY = { Groups: "groups", NamedLocations: "namedLocations", AuthenticationStrengths: "authStrengths", AuthenticationContexts: "authContexts", TermsOfUse: "termsOfUse" };

  function parseEntries(entries) { // entries: [{path, text}]
    const bundle = { policies: [], groups: [], namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [] };
    let allPolicies = null;
    for (const { path, text } of entries) {
      if (!path.endsWith(".json")) continue;
      const name = path.split("/").pop();
      // MigrationTable.json is the id lookup; BackupScope.json states what a
      // baseline backup deliberately left out. Both describe the zip rather than
      // being content in it — neither is an object to import.
      if (name === "MigrationTable.json" || name === "BackupScope.json") continue;
      let obj;
      try { obj = JSON.parse(text); } catch { continue; }
      if (name === "all-policies.json") { allPolicies = obj; continue; }
      const base = path.includes("/") ? path.split("/").slice(-2)[0] : null;
      if (base && FOLDER_KEY[base]) bundle[FOLDER_KEY[base]].push(obj);
      else if (obj && obj.displayName && obj.conditions) bundle.policies.push(obj);
    }
    if (!bundle.policies.length && Array.isArray(allPolicies)) bundle.policies = allPolicies;
    return bundle;
  }

  async function readZip(data) {
    const zip = await JSZip.loadAsync(data);
    const entries = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.endsWith(".json")) continue;
      entries.push({ path, text: decodeBytes(await entry.async("uint8array")) });
    }
    return parseEntries(entries);
  }

  // folder picker (webkitdirectory): paths include the selected root folder — keep
  // the last two segments so Groups/x.json etc. are recognised at any depth.
  async function readFolder(fileList) {
    const entries = [];
    for (const f of fileList) {
      if (!f.name.endsWith(".json")) continue;
      entries.push({ path: (f.webkitRelativePath || f.name), text: decodeBytes(new Uint8Array(await f.arrayBuffer())) });
    }
    return parseEntries(entries);
  }

  // Does this policy grant a Terms of use? Either a real termsOfUse id in the
  // grant controls, or a {{tou:Name}} placeholder. Returns the count (>0 = yes).
  function touReferences(raw) {
    const g = raw.grantControls || {};
    let n = (g.termsOfUse || []).length;
    const blob = JSON.stringify(raw);
    n += (blob.match(/\{\{tou:[^}]+\}\}/gi) || []).length;
    return n;
  }

  // ---------- plan: which policies import / skip / update ----------
  // `existing` may be a legacy array of display-name strings, or the tenant's
  // raw policy objects. The objects carry the id + assignments needed for the
  // "match & replace" mode (copy the current scoping, disable the old policy).
  // A CA number is only an identity within ONE baseline (the Baseline tool's
  // rule): CA000 is a global MFA policy in both catalogs, CA501 is a
  // guest-admin policy in one and an agent policy in the other. So a
  // same-number policy in the tenant is only "the same policy at another
  // version" when its name does not contradict — otherwise it is a clash and
  // the import deploys alongside rather than replacing it in place.
  const contradicts = (a, b) => {
    try { return typeof Baseline !== "undefined" && Baseline.mismatchReason ? !!Baseline.mismatchReason(a, b) : false; }
    catch { return false; }
  };
  const cleanName = (s) => String(s || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim().toLowerCase();

  function plan(bundle, existing) {
    const ex = (existing || []).map((e) => {
      const name = typeof e === "string" ? e : (e && (e.displayName || e.name)) || "";
      const raw = typeof e === "string" ? null : (e && (e.raw || e));
      const { num, ver } = parseCaVersion(name);
      return { num, ver, name, raw, id: raw && raw.id };
    }).filter((e) => e.num != null);
    // E-Admins taken from another backup into this one (mergeShared) land Off.
    const forceOff = new Set((bundle.forceOff || []).map(cleanName));
    const renamed = bundle.sharedRenamed || null;
    return bundle.policies.map(raw => {
      const { num, ver } = parseCaVersion(raw.displayName);
      const sameNum = num != null ? ex.filter((e) => e.num === num) : [];
      // Versioned names: same CA number + same version is the same policy.
      // A baseline that does not version its names (Joey's): same CA number
      // + same name, staging prefix aside — being there is the whole test.
      const exact = ver ? sameNum.find((e) => e.ver === ver)
        : sameNum.find((e) => cleanName(e.name) === cleanName(raw.displayName));
      // present, but at another version or under an older name of the SAME
      // policy — never a number clash from the other baseline
      const other = exact ? null : sameNum.find((e) => !contradicts(raw.displayName, e.name));
      const asIs = isEAdmins(raw.displayName);
      const exists = !!exact;
      // "upgrade": the tenant already has this CA number at another version, so
      // it can be replaced in place rather than deployed alongside. E-Admins are
      // always handled as-is, never auto-replaced.
      const upgrade = !exact && !!other && !asIs;
      const persona = asIs ? null : personaOf(raw.displayName);
      // A ToU has no Graph create API, so a policy granting one needs a manual
      // step (create the ToU in the portal, re-import). Flag it up front.
      const needsTou = touReferences(raw);
      const label = (e) => e.ver ? `v${e.ver}` : `"${e.name}"`;
      const off = forceOff.has(cleanName(raw.displayName));
      return {
        raw, name: raw.displayName, num, ver, asIs,
        agent: isAgentPolicy(raw), forceOff: off,
        // workload-identity policy (CA900 range): needs the Workload ID SKU
        wid: isWorkloadIdentity(raw),
        persona, personaGroup: (persona && PERSONA_GROUPS[persona]) || null,
        exists, upgrade,
        existing: upgrade ? { id: other.id, name: other.name, ver: other.ver, label: label(other), raw: other.raw } : null,
        needsTou,
        reason: exists ? `already exists (CA${String(num).padStart(3, "0")}${ver ? ` v${ver}` : ""})`
          : upgrade ? `already in tenant as ${label(other)}`
          : asIs && off ? `E-Admins from ${bundle.sharedFrom || "another backup"} — lands Off; assignment as shipped${renamed ? `, break-glass group ${renamed.from} → ${renamed.to}` : ""}`
          : asIs ? "E-Admins — imported as-is (state & assignments unchanged)"
          : persona === "agents" ? "agent identities — include assignment kept as shipped"
          : !persona ? "no persona detected — include assignment kept as-is" : null,
      };
    });
  }

  // ---------- 🔀 switch baseline: which old group feeds which new one ----------
  // The two catalogs name the same THING differently — the break-glass
  // group, one exclusion group per policy, the persona include groups — so a
  // switch is a rename with the members carried across. This is the plan
  // for that, pure over the bundle and the two catalog contracts:
  //   [{ to, from, kind: breakglass|exclusion|persona, policy?, srcId }]
  // `to` is a group the bundle ships (so the import creates or reuses it),
  // `from` is the name the OTHER baseline gives its counterpart. Whether
  // `from` exists in the tenant is for the caller to read.
  function counterpartPlan(bundle, toCat, fromCat) {
    if (!bundle || !toCat || !fromCat || toCat.id === fromCat.id) return [];
    const norm = (s) => String(s || "").trim().toLowerCase();
    const out = [];
    const add = (to, from, kind, extra) => {
      if (!to || !from || norm(to) === norm(from)) return;
      if (out.some((x) => norm(x.to) === norm(to))) return;
      out.push({ to, from, kind, ...(extra || {}) });
    };
    const byNum = (cat, num) => (cat.policies || []).find((p) => p.num === num) || null;
    // the catalog's own exclusion group for that number first; failing that,
    // the convention's name for it (a tenant may have added one the catalog
    // does not list — CA000 in the field) — whether it EXISTS is read later
    const exclusionOf = (cat, num, name) => {
      const p = byNum(cat, num);
      const ex = cat.exclusionGroupFor ? cat.exclusionGroupFor(p ? p.name : name) : null;
      if (ex && ex.name) return ex.name;
      return cat.exclusionByNumber ? (cat.exclusionByNumber(num) || null) : null;
    };
    const personaFrom = new Map((fromCat.personaGroups || []).filter((p) => p.group).map((p) => [p.key, p.group]));
    for (const g of bundle.groups || []) {
      const name = g.displayName;
      if (!name) continue;
      // 1. break-glass
      if (toCat.breakGlassGroup && norm(name) === norm(toCat.breakGlassGroup)) { add(name, fromCat.breakGlassGroup, "breakglass", { srcId: g.id }); continue; }
      // 2. a policy's exclusion group — the same CA number in the other catalog
      const pol = (bundle.policies || []).find((p) => {
        const m = /\bCA(\d{3,4})\b/.exec(p.displayName || "");
        if (!m) return false;
        return norm(exclusionOf(toCat, parseInt(m[1], 10), p.displayName)) === norm(name);
      });
      if (pol) {
        const num = parseInt(/\bCA(\d{3,4})\b/.exec(pol.displayName)[1], 10);
        add(name, exclusionOf(fromCat, num, pol.displayName), "exclusion", { policy: pol.displayName, num, srcId: g.id });
        continue;
      }
      // 3. a persona include group, matched on the persona key both catalogs use
      const pg = (toCat.personaGroups || []).find((p) => p.group && norm(p.group) === norm(name));
      if (pg && personaFrom.get(pg.key)) add(name, personaFrom.get(pg.key), "persona", { persona: pg.key, srcId: g.id, example: !!pg.example });
    }
    return out;
  }

  // Which catalog a bundle belongs to: the one whose policy names it carries
  // most of. A backup zip does not say; the repository read does.
  function catalogOfBundle(bundle) {
    if (bundle && bundle.catalogId) return bundle.catalogId;
    if (typeof Baseline === "undefined" || !Baseline.catalogs) return null;
    const names = new Set((bundle?.policies || []).map((p) => cleanName(p.displayName)));
    let best = null, bestHits = 0;
    for (const c of Baseline.catalogs()) {
      const hits = (c.policies || []).filter((p) => names.has(cleanName(p.name))).length;
      if (hits > bestHits) { best = c.id; bestHits = hits; }
    }
    return best;
  }

  // ---------- groups are attached BY NAME (beta 25383) ----------
  // A backup's Groups folder records the NAME each source id had in the tenant
  // it was exported from. The id itself means nothing anywhere else, and
  // written into a policy it is an exclusion that excludes nobody — 👥 CA
  // groups lists it as "referenced but gone". That is what a Joey Verlinden
  // import left behind whenever a group could not be created: the policies
  // landed anyway, carrying his tenant's ids, so 29 of them excluded a
  // break-glass group that only exists in his tenant.
  //
  // So a policy never carries a source group id any more. prepareBundle()
  // rewrites every reference to a group the bundle ships into a NAME KEY, and
  // the group list becomes one entry per name; ensureDependencies() creates or
  // finds each group BY THAT NAME and maps the key to THIS tenant's id; a key
  // that did not resolve fails its policy, which is then not created at all.
  //
  // The name is the file's, with two corrections only a baseline's naming
  // contract can make — both are in Joey's 2026.6.1 release:
  //   * one source id, two files: CA005 and CA006 each had their exclusion
  //     group renamed in his tenant and the export wrote both names under the
  //     same id. Each policy gets the file that carries ITS OWN name.
  //   * a policy's own exclusion group under another name: CA403 and CA404
  //     exclude "CA403-Guests-… - Exclude" while the policies are called
  //     "CA403-GuestUsers-…". A group that is the policy's OWN exclusion (same
  //     CA number, exclusion-shaped) is created under the name the convention
  //     gives that policy, so every tool that reads the convention finds it.
  const GROUP_KEY = "enca-group:";
  // encodeURIComponent escapes ";", so the trailing one can only be the end —
  // no key is ever a prefix of another when the bundle is searched as text.
  const groupKey = (name) => `${GROUP_KEY}${encodeURIComponent(String(name || "").trim().toLowerCase())};`;
  const isGroupKey = (v) => typeof v === "string" && v.startsWith(GROUP_KEY) && v.endsWith(";");
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const lower = (s) => String(s || "").trim().toLowerCase();
  const isGuidStr = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());
  const caNumOf = (name) => { const m = /\bCA(\d{3,4})\b/i.exec(String(name || "")); return m ? parseInt(m[1], 10) : null; };
  // "All Compliant Network locations" is Microsoft's, not the tenant's: Global
  // Secure Access provides it under this id in every tenant (Learn's own
  // break-glass script looks for exactly this id), so it is referenced as-is
  // and never created — the old path tried to create it as an IP location.
  const COMPLIANT_NETWORK_ID = "3d46dbda-8382-466a-856d-eb00cbc6b910";

  function catalogForBundle(bundle) {
    try {
      if (typeof Baseline === "undefined" || !Baseline.catalog) return null;
      const id = catalogOfBundle(bundle);
      if (!id) return null;
      const c = Baseline.catalog(id);
      if (!c || c.id !== id) return null;
      return Baseline.withContract ? Baseline.withContract(c) : c;
    } catch { return null; }
  }

  // Pure over the bundle (and the catalog contracts). Returns a NEW bundle:
  // policies with name keys, one group entry per name ({ id: key,
  // displayName, srcIds, fileNames, … }), the notes worth showing, and an
  // index the repair step asks "which group did this source id mean for
  // THIS policy?".
  function prepareBundle(raw) {
    if (!raw || raw.prepared) return raw;
    const cat = catalogForBundle(raw);
    const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
    const isExcl = (n) => safe(() => !!(cat && cat.isExclusionGroup && cat.isExclusionGroup(n)), false);
    const convFor = (policyName) => safe(() => { const e = cat && cat.exclusionGroupFor ? cat.exclusionGroupFor(policyName) : null; return e && e.name ? e.name : null; }, null);
    const templates = safe(() => (cat && cat.templates ? cat.templates() : []) || [], []);
    const tplFor = (name) => templates.find((t) => lower(t.displayName) === lower(name)) || null;

    // source id -> the group files that carry it
    const files = new Map();
    for (const g of raw.groups || []) {
      if (!g || !g.id || !g.displayName) continue;
      const k = lower(g.id);
      if (!files.has(k)) files.set(k, []);
      if (!files.get(k).some((x) => lower(x.displayName) === lower(g.displayName))) files.get(k).push(g);
    }
    const own = (policyName, id) => {
      const cands = files.get(lower(id)) || [];
      const num = caNumOf(policyName);
      if (num == null || !cands.length) return null;
      const mine = cands.filter((f) => caNumOf(f.displayName) === num && isExcl(f.displayName));
      if (!mine.length) return null;
      const conv = convFor(policyName);
      const exact = conv ? mine.find((f) => lower(f.displayName) === lower(conv)) : null;
      if (exact) return { name: exact.displayName, file: exact };
      if (conv) return { name: conv, file: mine[0], renamedFrom: mine.map((f) => f.displayName) };
      return mine.length === 1 ? { name: mine[0].displayName, file: mine[0] } : null;
    };
    // what each source id is, to the policy that OWNS it — the name every
    // other policy pointing at that id is then attached to as well
    const owners = new Map();
    for (const p of raw.policies || []) {
      const u = (p.conditions && p.conditions.users) || {};
      for (const id of [...(u.includeGroups || []), ...(u.excludeGroups || [])]) {
        const o = typeof id === "string" ? own(p.displayName, id) : null;
        if (!o) continue;
        const k = lower(id);
        if (!owners.has(k)) owners.set(k, []);
        if (!owners.get(k).some((x) => lower(x.name) === lower(o.name))) owners.get(k).push(o);
      }
    }
    const resolve = (policyName, id) => {
      const k = lower(id);
      const cands = files.get(k);
      if (!cands || !cands.length) return null;
      const o = own(policyName, id);
      if (o) return o;
      const os = owners.get(k) || [];
      if (os.length) return os[0];
      if (cands.length === 1) return { name: cands[0].displayName, file: cands[0] };
      const byConv = cands.find((f) => (raw.policies || []).some((p) => lower(convFor(p.displayName)) === lower(f.displayName)));
      const pick = byConv || cands[0];
      return { name: pick.displayName, file: pick };
    };

    const planned = new Map();
    const notes = [];
    const want = (r, id) => {
      const k = lower(r.name);
      if (!planned.has(k)) {
        const f = r.file || {};
        const tpl = tplFor(r.name);
        planned.set(k, {
          id: groupKey(r.name), displayName: r.name,
          description: f.description || (tpl && tpl.description) || null,
          groupTypes: Array.isArray(f.groupTypes) ? f.groupTypes.slice() : [],
          membershipRule: f.membershipRule || null,
          securityEnabled: f.securityEnabled !== false, mailEnabled: f.mailEnabled === true,
          srcIds: [], fileNames: [],
        });
      }
      const g = planned.get(k);
      if (id && !g.srcIds.includes(lower(id))) g.srcIds.push(lower(id));
      for (const n of [r.file && r.file.displayName, ...(r.renamedFrom || [])]) if (n && !g.fileNames.includes(n)) g.fileNames.push(n);
      if (r.renamedFrom && !g.renamedFrom) {
        g.renamedFrom = r.renamedFrom.slice();
        notes.push(`“${r.name}” is created under the name the baseline gives this policy's exclusion group — the file calls it “${r.renamedFrom.join("” / “")}”`);
      }
      return g;
    };
    const policies = (raw.policies || []).map((p) => {
      const q = JSON.parse(JSON.stringify(p));
      const u = q.conditions && q.conditions.users;
      if (!u) return q;
      for (const list of ["includeGroups", "excludeGroups"]) {
        if (!Array.isArray(u[list])) continue;
        u[list] = u[list].map((id) => {
          if (typeof id !== "string" || parsePlaceholder(id) || isGroupKey(id)) return id;
          const r = resolve(p.displayName, id);
          return r ? want(r, id).id : id;
        });
      }
      return q;
    });
    // a group a file ships that the policies name only by NAME (a {{group:…}}
    // placeholder, say) still comes along, as it always did
    const blobs = (raw.policies || []).map((p) => JSON.stringify(p));
    for (const [k, fs] of files) {
      for (const f of fs) {
        if (planned.has(lower(f.displayName))) continue;
        if (blobs.some((b) => b.includes(f.displayName))) want({ name: f.displayName, file: f }, k);
      }
    }
    for (const [k, fs] of files) {
      if (fs.length < 2) continue;
      const got = [...planned.values()].filter((g) => g.srcIds.includes(k)).map((g) => `“${g.displayName}”`);
      notes.push(`one source id carries ${fs.length} names (${fs.map((f) => `“${f.displayName}”`).join(", ")}) — each policy is attached to the group that carries its own name${got.length ? `: ${got.join(", ")}` : ""}`);
    }
    const sourceIds = new Set(files.keys());
    return {
      ...raw,
      policies,
      groups: [...planned.values()],
      prepared: true,
      groupNotes: notes,
      groupIndex: {
        isSource: (id) => sourceIds.has(lower(id)),
        nameFor: (policyName, id) => { const r = resolve(policyName, id); return r ? r.name : null; },
        // the group entry a (policy, source id) pair means — created in the
        // plan if the bundle's own policies never named it (a tenant policy
        // under an older name, in the repair step)
        entryFor: (policyName, id) => { const r = resolve(policyName, id); return r ? want(r, id) : null; },
      },
    };
  }

  // 🚨 The shared E-Admins policies (CA1100–CA1105) are expected under every
  // baseline, and only a CloudFellows backup ships them. A Joey Verlinden
  // import used to say so and stop there. mergeShared() takes them — and only
  // them — from such a backup into the bundle being imported:
  //   * the groups, locations, strengths and contexts they name come along,
  //   * the break-glass group becomes the TARGET baseline's, because the block
  //     policies have to reach the accounts that baseline excludes everywhere
  //     (CAB-SEC-U-BreakGlass → CA-BreakGlassAccounts - Exclude),
  //   * every policy taken this way lands Off (forceOff): an emergency-access
  //     policy switched On in a tenant without the trusted locations or the
  //     phishing-resistant methods it expects locks the emergency accounts
  //     out — the one thing they exist to prevent.
  // A policy the bundle already carries is not taken twice. Pure over two raw
  // (unprepared) bundles; the result is prepared like any other.
  function mergeShared(target, source, opts = {}) {
    const t = target || {};
    const have = new Set((t.policies || []).map((p) => cleanName(p.displayName)));
    const all = ((source && source.policies) || []).filter((p) => isEAdmins(p.displayName));
    const add = all.filter((p) => !have.has(cleanName(p.displayName)));
    const blob = add.map((p) => JSON.stringify(p)).join("\n");
    const used = (x) => !!x && ((x.id && blob.includes(x.id)) || (x.displayName && blob.includes(`:${x.displayName}}}`)));
    const from = lower(opts.breakGlassFrom), to = String(opts.breakGlassTo || "").trim();
    const rename = !!(from && to && from !== lower(to));
    const groups = ((source && source.groups) || []).filter(used).map((g) =>
      rename && lower(g.displayName) === from ? { ...g, displayName: to } : { ...g });
    const merge = (a, b) => {
      const out = (a || []).slice();
      for (const x of b || []) if (x && !out.some((y) => y.id === x.id)) out.push(x);
      return out;
    };
    const pick = (arr) => (arr || []).filter(used);
    return {
      bundle: {
        ...t,
        policies: [...(t.policies || []), ...add],
        groups: merge(t.groups, groups),
        namedLocations: merge(t.namedLocations, pick(source && source.namedLocations)),
        authStrengths: merge(t.authStrengths, pick(source && source.authStrengths)),
        authContexts: merge(t.authContexts, pick(source && source.authContexts)),
        termsOfUse: merge(t.termsOfUse, pick(source && source.termsOfUse)),
        forceOff: [...new Set([...(t.forceOff || []), ...add.map((p) => p.displayName)])],
        sharedFrom: opts.label || t.sharedFrom || "a CloudFellows backup",
        sharedRenamed: rename ? { from: opts.breakGlassFrom, to } : (t.sharedRenamed || null),
        prepared: false,
      },
      added: add.map((p) => p.displayName),
      already: all.length - add.length,
      found: all.length,
    };
  }

  // 🔧 Policies ALREADY in the tenant that point at a source group id — what
  // an import before 25383 left behind when a group could not be created. The
  // prepared bundle says which group NAME each such id meant for that policy;
  // the repair creates or finds that group and swaps the id. Only ids the
  // bundle's own group files carry, and only those the directory does not
  // hold, are touched: an id this tenant has is never "repaired".
  function repairPlan(prepared, tenantRaws, directory) {
    const idx = prepared && prepared.groupIndex;
    if (!idx) return [];
    const here = (id) => !!(directory && directory.ids && directory.ids.has(lower(id)));
    const out = [];
    for (const raw of tenantRaws || []) {
      const u = (raw && raw.conditions && raw.conditions.users) || {};
      const swaps = [];
      for (const list of ["includeGroups", "excludeGroups"]) {
        for (const id of u[list] || []) {
          if (!isGuidStr(id) || !idx.isSource(id) || here(id)) continue;
          const g = idx.entryFor(raw.displayName, id);
          if (g && !swaps.some((s) => s.list === list && s.from === id)) swaps.push({ list, from: id, name: g.displayName, key: g.id, group: g });
        }
      }
      if (swaps.length) out.push({ id: raw.id, name: raw.displayName, state: raw.state, swaps });
    }
    return out;
  }

  // Which of these ids does the directory hold? One getByIds per thousand.
  // A failed read is an ANSWER ({ error }), never an empty set dressed up as
  // "none of them exist".
  async function readDirectoryIds(ids) {
    const out = { ids: new Set(), error: null };
    const list = [...new Set((ids || []).map(lower).filter(isGuidStr))];
    try {
      for (let i = 0; i < list.length; i += 1000) {
        const j = await Graph.gpost("/directoryObjects/getByIds", { ids: list.slice(i, i + 1000), types: ["user", "group"] });
        for (const o of (j && j.value) || []) if (o && o.id) out.ids.add(lower(o.id));
      }
    } catch (e) { out.error = e.message || String(e); }
    return out;
  }
  // The directory ids an import has to be sure of: every user or group a
  // policy names by id that no file in the bundle explains, and — for a
  // backup, not a repository — the source ids of the groups it ships, so a
  // backup restored into the tenant it came from binds to the same objects.
  function directoryIdsToCheck(bundle) {
    const out = new Set();
    for (const p of (bundle && bundle.policies) || []) {
      const u = (p.conditions && p.conditions.users) || {};
      for (const id of [...(u.includeUsers || []), ...(u.excludeUsers || []), ...(u.includeGroups || []), ...(u.excludeGroups || [])]) {
        if (isGuidStr(id)) out.add(lower(id));
      }
    }
    if (bundle && !bundle.fromRepository) {
      for (const g of bundle.groups || []) for (const s of g.srcIds || []) if (isGuidStr(s)) out.add(lower(s));
    }
    return [...out];
  }

  // ---------- housekeeping: policies left behind by a "match & replace" ----------
  // Compare two dotted version strings ("3.10" > "3.9").
  function cmpVer(a, b) {
    const A = String(a).split("."), B = String(b).split(".");
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const d = (parseInt(A[i], 10) || 0) - (parseInt(B[i], 10) || 0);
      if (d) return d;
    }
    return 0;
  }
  // A higher version is a review signal, not proof that protection is redundant.
  // Compare the loaded raw payload conservatively, retaining unknown preview fields.
  function housekeeping(list) {
    const signature = PolicyCompare.signature;
    const state = p => ({ disabled: "off", enabled: "on", enabledForReportingButNotEnforced: "report", off: "off", on: "on", report: "report" })[p.raw?.state ?? p.state] || "unknown";
    const family = name => cleanName(name).replace(/\s+v\d+(?:\.\d+)+\s*$/i, "").replace(/\s+/g, " ").trim();
    const payload = PolicyCompare.config;
    const items = (list || []).map(p => ({ p, ...parseCaVersion(p.name) })).filter(x => x.num != null && x.ver);
    const out = [];
    for (const x of items) {
      const higher = items.filter(y => y.num === x.num && y.p.id !== x.p.id && cmpVer(y.ver, x.ver) > 0).sort((a, b) => cmpVer(b.ver, a.ver));
      if (!higher.length) continue;
      const newer = higher[0], reasons = [];
      if (state(x.p) !== "off") reasons.push("Older version is still " + (state(x.p) === "report" ? "Report-only" : state(x.p) === "on" ? "On" : "in an unknown state") + ".");
      if (state(newer.p) !== "on") reasons.push("Newer version is not On.");
      if (higher.filter(y => cmpVer(y.ver, newer.ver) === 0).length > 1) reasons.push("Multiple policies share the highest version; choose the intended successor.");
      if (family(x.p.name) !== family(newer.p.name)) reasons.push("Policy names differ beyond the version; the same CA number does not prove a replacement.");
      if (!x.p.raw?.conditions || !newer.p.raw?.conditions || !(x.p.raw.grantControls || x.p.raw.sessionControls) || !(newer.p.raw.grantControls || newer.p.raw.sessionControls)) {
        reasons.push("Policy details are incomplete; configuration could not be compared.");
      } else {
        const old = payload(x.p), next = payload(newer.p);
        const assignments = p => ({ users: p.conditions.users, clientApplications: p.conditions.clientApplications });
        if (signature(assignments(old)) !== signature(assignments(next))) reasons.push("Assignments or exclusions differ; review who each version reaches.");
        const rest = p => ({ ...p, conditions: Object.fromEntries(Object.entries(p.conditions).filter(([k]) => !["users", "clientApplications"].includes(k))) });
        if (signature(rest(old)) !== signature(rest(next))) reasons.push("Conditions or controls differ; review the protection before retiring a version.");
      }
      out.push({ policy: x.p, num: x.num, ver: x.ver, newer: newer.p, newerVer: newer.ver, canDelete: reasons.length === 0, reasons });
    }
    return out.sort((a, b) => a.num - b.num || cmpVer(a.ver, b.ver));
  }
  function supersededOff(list) { return housekeeping(list).filter(r => r.canDelete); }

  // ---------- dependencies: create-if-missing, build old-id → new-id maps ----------
  // Narrow a bundle to only the dependencies the chosen policies actually
  // reference, so importing one persona does not create all 97 groups. Matching
  // is by id presence in the raw policy JSON — a dependency object is kept if
  // any chosen policy mentions its id anywhere (include/exclude group, location,
  // auth strength/context, terms of use, or a {{…}} placeholder by name).
  function scopeBundle(bundle, chosenRaws) {
    const blobs = chosenRaws.map(r => JSON.stringify(r));
    const used = (id) => id != null && blobs.some(b => b.includes(id));
    const keep = (arr) => (arr || []).filter(x => used(x.id));
    // placeholders reference by name, e.g. {{group:CAB-SEC-U-Persona-Admins}}
    const usedName = (name) => name && blobs.some(b => b.includes(name));
    return {
      ...bundle,
      policies: chosenRaws,
      groups: (bundle.groups || []).filter(g => used(g.id) || usedName(g.displayName)),
      namedLocations: keep(bundle.namedLocations),
      authStrengths: keep(bundle.authStrengths),
      authContexts: keep(bundle.authContexts),
      termsOfUse: keep(bundle.termsOfUse),
    };
  }

  async function ensureDependencies(bundle, onStatus, opts = {}) {
    // Prepared here if the caller did not, so no path can write a source group
    // id into a policy (see prepareBundle).
    if (bundle && !bundle.prepared) bundle = prepareBundle(bundle);
    // Policies being replaced keep their current tenant assignment, so they need
    // no deploy persona group — don't create one just for them.
    const matchedNames = new Set(opts.matchedNames || []);
    const maps = { group: {}, loc: {}, strength: {}, ctx: {}, tou: {}, ph: {}, groupFailed: {}, groupNames: {} };
    // missingTou: ToU display names the tenant lacks. A ToU has no Graph create
    // API (the PDF/localised content must be uploaded in the portal), so these
    // are collected for the report as a to-create checklist rather than a
    // generic warning.
    const log = { created: [], reused: [], warnings: [], missingTou: [], placed: [], placeFailed: [], unplaced: [], groupNotes: (bundle.groupNotes || []).slice() };
    const noteMissingTou = (name) => { if (name && !log.missingTou.includes(name)) log.missingTou.push(name); };
    // Groups are created as ORDINARY security groups. They were role-assignable
    // until build 254; the baseline moved off that, because a role-assignable
    // group's members can only be changed by Global Administrator or Privileged
    // Role Administrator — neither of which can be assigned at AU scope — so a
    // role-assignable group inside a restricted AU has nobody who can edit it.
    // Dynamic groups keep their membership rule. Say which, accurately.
    const noteGroup = (g, label) => {
      const kind = !g.created ? "" : g.dynamic ? " (dynamic, membership rule preserved)" : " (assigned)";
      (g.created ? log.created : log.reused).push(`${label}${kind}`);
    };

    // ---- template placeholders ({{group:…}} / {{location:…}} / {{authstrength:…}}) ----
    const placeholders = collectPlaceholders(bundle.policies);
    if (placeholders.length) {
      onStatus?.(`Resolving ${placeholders.length} template placeholder(s)…`);
      const key = (p) => `{{${p.kind}:${p.name}}}`;
      let locs = null, strengths = null, ctxs = null, tous = null;
      for (const p of placeholders) {
        try {
          if (p.kind === "group") {
            // create-if-missing (from the template if we have one)
            const tpl = Assign.templates().find(t => t.displayName === p.name) || { displayName: p.name };
            const g = await Assign.createGroup(tpl);
            maps.ph[key(p)] = g.id;
            noteGroup(g, `Group (template): ${p.name}`);
          } else if (p.kind === "location") {
            locs = locs || await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
            const f = locs.find(x => x.displayName === p.name);
            if (f) { maps.ph[key(p)] = f.id; log.reused.push(`Named location: ${p.name}`); }
            else log.warnings.push(`Named location "${p.name}" not found in this tenant — policies using it are skipped. Create it first, then re-import.`);
          } else if (p.kind === "authstrength") {
            strengths = strengths || await Graph.ggetAll("/policies/authenticationStrengthPolicies");
            const f = strengths.find(x => x.displayName === p.name);
            if (f) { maps.ph[key(p)] = f.id; log.reused.push(`Auth strength: ${p.name}`); }
            else log.warnings.push(`Authentication strength "${p.name}" not found in this tenant — policies using it are skipped. Create it first, then re-import.`);
          } else if (p.kind === "authcontext") {
            ctxs = ctxs || await Graph.ggetAll("/identity/conditionalAccess/authenticationContextClassReferences");
            const f = ctxs.find(x => x.displayName === p.name || x.id === p.name);
            if (f) { maps.ph[key(p)] = f.id; log.reused.push(`Auth context: ${p.name}`); }
            else log.warnings.push(`Authentication context "${p.name}" not found in this tenant — policies using it are skipped.`);
          } else if (p.kind === "tou") {
            tous = tous || await Graph.ggetAll("/identityGovernance/termsOfUse/agreements", [...AUTH_CONFIG.scopes, "Agreement.Read.All"]);
            const f = tous.find(x => x.displayName === p.name);
            if (f) { maps.ph[key(p)] = f.id; log.reused.push(`Terms of use: ${p.name}`); }
            else noteMissingTou(p.name);
          }
        } catch (e) { log.warnings.push(`Placeholder ${key(p)}: ${e.message}`); }
      }
    }

    // ---- applications referenced by the policies -------------------------
    // A policy may only name an app that has a service principal here. The
    // baseline excludes Microsoft first-party apps (Defender for Endpoint,
    // Defender for Mobile TVM, Device Registration Service) that a tenant which
    // has never used them won't have — and Graph answers a missing one with a
    // bare 400 on the whole policy, naming nothing. Instantiate them first.
    const apps = appRefs(bundle.policies);
    // Apps that still have no service principal after the create pass. Kept so
    // importPolicies can retry a rejected policy without them rather than lose
    // the whole policy over an exclusion the tenant cannot express.
    maps.missingApps = new Set();
    if (apps.length) {
      onStatus?.(`Checking ${apps.length} referenced application(s)…`);
      let present = new Set();
      try { present = await Graph.existingAppIds(apps); } catch (e) { console.warn("app check failed", e.message); }
      const missing = apps.filter((a) => !present.has(a));
      for (const appId of missing) {
        try {
          const sp = await Graph.createServicePrincipal(appId);
          log.created.push(`Service principal: ${sp.displayName || appId} (${appId})`);
        } catch (e) {
          maps.missingApps.add(appId);
          log.warnings.push(`${appLabel(appId)} has no service principal in this tenant and could not be created (${e.message}). `
            + `A policy that includes or excludes it is rejected by Graph with a bare 400, so it is imported without that app reference instead — see the change report.`);
        }
      }
    }

    // persona groups needed by the policies themselves (not the replaced ones)
    const personaNames = [...new Set(bundle.policies.filter(p => !matchedNames.has(p.displayName)).map(p => personaOf(p.displayName)).filter(Boolean).map(p => PERSONA_GROUPS[p]).filter(Boolean))];
    maps.personaGroupIds = {};
    for (const gname of personaNames) {
      onStatus?.(`Persona group ${gname}…`);
      try {
        const g = await Assign.createGroup({ displayName: gname });
        maps.personaGroupIds[gname] = g.id;
        noteGroup(g, `Group (persona): ${gname}`);
      } catch (e) { log.warnings.push(`Persona group ${gname}: ${e.message}`); }
    }

    // Placement into the persona's restricted AU, when the caller supplied a
    // code -> auId map from the preflight. Only groups this run CREATED are
    // placed: a group that already existed may be somewhere deliberately, and
    // filing it into a vault is not the import's decision to make.
    const auByCode = opts.auByCode || null;
    const personas = auByCode ? groupPersonas(bundle, bundle.policies) : null;

    // What the directory holds, read once — see directoryIdsToCheck().
    const dirIds = directoryIdsToCheck(bundle);
    maps.directory = dirIds.length ? await readDirectoryIds(dirIds) : { ids: new Set(), error: null };
    if (maps.directory.error) {
      log.warnings.push(`The directory could not be read to confirm the users and groups the policies name by id (${maps.directory.error}) — a policy that names one is held back rather than created on an unconfirmed reference.`);
    }
    // A source id that means exactly one group maps straight to it too, for a
    // caller still holding the unprepared policies.
    const bySource = new Map();
    for (const g of bundle.groups || []) for (const s of g.srcIds || []) bySource.set(s, bySource.has(s) ? null : g.id);
    const alsoBySource = (raw, id) => { for (const s of raw.srcIds || []) if (bySource.get(s) === raw.id) maps.group[s] = id; };

    for (const raw of bundle.groups) {
      onStatus?.(`Group ${raw.displayName}…`);
      let created = null;
      maps.groupNames[raw.id] = raw.displayName;
      // a backup restored into the tenant it came from binds to the same object
      const same = !bundle.fromRepository && (raw.srcIds || []).find((s) => maps.directory.ids.has(lower(s)));
      if (same) {
        maps.group[raw.id] = same;
        alsoBySource(raw, same);
        log.reused.push(`Group: ${raw.displayName} (the same object as in the backup)`);
        continue;
      }
      try {
        const dyn = (raw.groupTypes || []).includes("DynamicMembership");
        const g = await Assign.createGroup({ displayName: raw.displayName, description: raw.description, mailNickname: raw.mailNickname, dynamic: dyn, membershipRule: raw.membershipRule });
        if (!g || !g.id) throw new Error("the create returned no group id");
        maps.group[raw.id] = g.id;
        alsoBySource(raw, g.id);
        noteGroup(g, `Group: ${raw.displayName}${raw.renamedFrom ? ` (the file calls it ${raw.renamedFrom.join(" / ")})` : ""}`);
        if (g.created) created = g;
      } catch (e) {
        // Recorded against the key: every policy naming this group fails with
        // this reason instead of landing on a group that does not exist.
        maps.groupFailed[raw.id] = e.message || String(e);
        log.warnings.push(`Group ${raw.displayName}: ${e.message} — every policy that names it is held back, rather than created pointing at a group that does not exist.`);
        continue;
      }

      if (!created || !auByCode) continue;
      const info = personas.get(raw.id);
      const code = info ? info.code : null;
      const auId = code ? auByCode[code] : null;
      if (!auId) {
        // Not placing is a decision, so it is recorded as one. An unplaced
        // group is unprotected, and silence would read as "protected".
        log.unplaced.push({ name: raw.displayName, code,
          why: !code ? (info && info.why) || "no persona could be read from the policies that use it"
             : `no restricted unit for ${code} — it was missing at preflight and not created` });
        continue;
      }
      onStatus?.(`Protecting ${raw.displayName}…`);
      try {
        await Graph.gpost(`/administrativeUnits/${auId}/members/$ref`,
          { "@odata.id": `https://graph.microsoft.com/beta/groups/${created.id}` });
        log.placed.push({ name: raw.displayName, code });
      } catch (e) {
        // Reported, never swallowed: the group exists and the policy will use
        // it either way, so this failure is invisible unless it is said.
        log.placeFailed.push({ name: raw.displayName, code, error: e.message || String(e) });
        log.warnings.push(`${raw.displayName} was created but NOT added to ${Rmau.auName(code)}: ${e.message || e} — the group is live and unprotected.`);
      }
    }

    // Named locations. Read whenever a policy names one by id, so a reference
    // no file explains can be checked against what the tenant has (locKnown).
    const namesLocations = (bundle.policies || []).some((p) => {
      const l = p.conditions && p.conditions.locations;
      return !!l && [...(l.includeLocations || []), ...(l.excludeLocations || [])].some(isGuidStr);
    });
    if ((bundle.namedLocations || []).length || namesLocations) {
      onStatus?.("Named locations…");
      let existing = [];
      try {
        existing = await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
        maps.locKnown = new Set(existing.map((x) => lower(x.id)));
      } catch (e) { maps.locKnownError = e.message || String(e); }
      for (const raw of bundle.namedLocations || []) {
        const t = raw["@odata.type"] || "";
        if (/compliantNetwork/i.test(t) || lower(raw.id) === COMPLIANT_NETWORK_ID) {
          maps.loc[raw.id] = COMPLIANT_NETWORK_ID;
          log.reused.push(`Named location: ${raw.displayName} (Microsoft's compliant network location — referenced, never created; it applies once Global Secure Access signaling is enabled for Conditional Access)`);
          continue;
        }
        const found = existing.find(x => x.displayName === raw.displayName);
        if (found) { maps.loc[raw.id] = found.id; log.reused.push(`Named location: ${raw.displayName}`); continue; }
        try {
          if (!/country|ipNamedLocation/i.test(t) && !Array.isArray(raw.ipRanges)) {
            throw new Error(`${t.replace("#microsoft.graph.", "") || "this kind of location"} cannot be created through Graph — create it in the portal, then import again`);
          }
          const body = /country/i.test(t)
            ? { "@odata.type": "#microsoft.graph.countryNamedLocation", displayName: raw.displayName, countriesAndRegions: raw.countriesAndRegions || [], includeUnknownCountriesAndRegions: !!raw.includeUnknownCountriesAndRegions, countryLookupMethod: raw.countryLookupMethod || "clientIpAddress" }
            : { "@odata.type": "#microsoft.graph.ipNamedLocation", displayName: raw.displayName, isTrusted: !!raw.isTrusted, ipRanges: (raw.ipRanges || []).map(r => ({ "@odata.type": r["@odata.type"] || "#microsoft.graph.iPv4CidrRange", cidrAddress: r.cidrAddress })) };
          const created = await Graph.gpost("/identity/conditionalAccess/namedLocations", body, [...AUTH_CONFIG.scopes, ...WRITE]);
          maps.loc[raw.id] = created.id;
          log.created.push(`Named location: ${raw.displayName}`);
        } catch (e) { log.warnings.push(`Named location ${raw.displayName}: ${e.message}`); }
      }
    }

    if (bundle.authStrengths.length) {
      onStatus?.("Authentication strengths…");
      let existing = [];
      try { existing = await Graph.ggetAll("/policies/authenticationStrengthPolicies"); } catch {}
      for (const raw of bundle.authStrengths) {
        const found = existing.find(x => x.displayName === raw.displayName || x.id === raw.id);
        if (found) { maps.strength[raw.id] = found.id; log.reused.push(`Auth strength: ${raw.displayName}`); continue; }
        if (raw.policyType === "builtIn") { maps.strength[raw.id] = raw.id; log.reused.push(`Auth strength (built-in): ${raw.displayName}`); continue; }
        try {
          const created = await Graph.gpost("/policies/authenticationStrengthPolicies",
            { displayName: raw.displayName, description: raw.description || "", allowedCombinations: raw.allowedCombinations || [] },
            [...AUTH_CONFIG.scopes, ...STRENGTH_WRITE]);
          maps.strength[raw.id] = created.id;
          log.created.push(`Auth strength: ${raw.displayName}`);
        } catch (e) { log.warnings.push(`Auth strength ${raw.displayName}: ${e.message}`); }
      }
    }

    if (bundle.authContexts.length) {
      onStatus?.("Authentication contexts…");
      let existing = [];
      try { existing = await Graph.ggetAll("/identity/conditionalAccess/authenticationContextClassReferences"); } catch {}
      for (const raw of bundle.authContexts) {
        if (existing.some(x => x.id === raw.id)) { maps.ctx[raw.id] = raw.id; log.reused.push(`Auth context: ${raw.displayName} (${raw.id})`); continue; }
        try {
          await Graph.gpatch(`/identity/conditionalAccess/authenticationContextClassReferences/${raw.id}`,
            { id: raw.id, displayName: raw.displayName, description: raw.description || "", isAvailable: raw.isAvailable !== false });
          maps.ctx[raw.id] = raw.id;
          log.created.push(`Auth context: ${raw.displayName} (${raw.id})`);
        } catch (e) { log.warnings.push(`Auth context ${raw.displayName}: ${e.message}`); }
      }
    }

    if (bundle.termsOfUse.length) {
      onStatus?.("Terms of use (lookup only)…");
      let existing = [];
      try { existing = await Graph.ggetAll("/identityGovernance/termsOfUse/agreements", [...AUTH_CONFIG.scopes, "Agreement.Read.All"]); } catch {}
      for (const raw of bundle.termsOfUse) {
        const found = existing.find(x => x.displayName === raw.displayName);
        if (found) { maps.tou[raw.id] = found.id; log.reused.push(`Terms of use: ${raw.displayName}`); }
        else noteMissingTou(raw.displayName);
      }
    }

    return { maps, log };
  }

  // ---------- build the create payload for one policy ----------
  const stripOdata = (o) => {
    if (Array.isArray(o)) return o.map(stripOdata);
    if (o && typeof o === "object") {
      const r = {};
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith("#")) continue;
        // keep a genuine type discriminator (derived types need it), drop the
        // links and the sibling "xxx@odata.type": "#Collection(String)" hints
        if (k.includes("@odata") && !(k === "@odata.type" && typeof v === "string" && v.startsWith("#microsoft.graph."))) continue;
        r[k] = stripOdata(v);
      }
      return r;
    }
    return o;
  };

  // A create does not need a property it leaves unset, and an export carries
  // dozens of them as null — Joey's files carry conditions.agents: null on all
  // 38 policies, a preview property a tenant may not know. Omitting a null is
  // the same request, minus a 400 over a property this tenant does not have.
  const dropNulls = (o) => {
    if (Array.isArray(o)) return o.map(dropNulls);
    if (o && typeof o === "object") {
      const r = {};
      for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) r[k] = dropNulls(v);
      return r;
    }
    return o;
  };

  // keepAssignment: 🔀 switch baseline — the assignment as the baseline
  // ships it (its own groups, remapped to the ones this import created),
  // not the deploy persona group and not the replaced policy's scoping.
  function buildPolicyPayload(raw, maps, personaGroupId, warnings, asIs = false, matchFrom = null, keepAssignment = false) {
    const ph = maps.ph || {};
    // resolve a value that may be a template placeholder, a known old id, or a literal
    const resolveRef = (v, kindMap) => {
      const p = parsePlaceholder(v);
      if (p) {
        const hit = ph[`{{${p.kind}:${p.name}}}`];
        if (hit) return hit;
        throw new Error(`unresolved ${p.kind} "${p.name}" — create it in this tenant first`);
      }
      return (kindMap && kindMap[v]) || v;
    };
    const p = dropNulls(stripOdata(JSON.parse(JSON.stringify(raw))));
    delete p.id; delete p.createdDateTime; delete p.modifiedDateTime; delete p.templateId; delete p.partialEnablementStrategy; delete p.deletedDateTime;
    if (!asIs) p.state = "disabled"; // always import as Off — except E-Admins (as-is)
    // Match & replace is a seamless swap: the new version takes over in the SAME
    // state as the policy it supersedes (which importPolicies then switches Off).
    if (matchFrom && matchFrom.state) p.state = matchFrom.state;
    const c = p.conditions = p.conditions || {};
    const u = c.users = c.users || {};

    // A group reference resolves to THIS tenant's id or the policy fails. A
    // name key (prepareBundle) resolves through the groups this import created
    // or found; a bare GUID no file explains must be one the directory holds,
    // whenever the import read the directory (maps.directory).
    const dir = maps.directory || null;
    const groupRef = (v) => {
      if (isGroupKey(v)) {
        const hit = maps.group && maps.group[v];
        if (hit) return hit;
        const name = (maps.groupNames && maps.groupNames[v]) || safeDecode(v.slice(GROUP_KEY.length, -1));
        const why = maps.groupFailed && maps.groupFailed[v];
        throw new Error(`group “${name}” ${why ? `could not be created (${why})` : "was not created or found in this tenant"} — the policy was not created, so it cannot point at a group that does not exist`);
      }
      const r = resolveRef(v, maps.group);
      if (dir && isGuidStr(r) && r === v && !(maps.group && maps.group[v]) && !(dir.ids && dir.ids.has(lower(v)))) {
        throw new Error(`group ${v} is not in this import and ${dir.error ? `could not be confirmed in this tenant (${dir.error})` : "does not exist in this tenant"} — the policy was not created`);
      }
      return r;
    };
    const mapGroups = (arr) => (arr || []).map(groupRef);
    // In an as-shipped assignment a user named by id has to exist here too.
    const checkUsers = () => {
      if (!dir) return;
      const foreign = [...(u.includeUsers || []), ...(u.excludeUsers || [])].filter((x) => isGuidStr(x) && !(dir.ids && dir.ids.has(lower(x))));
      if (foreign.length) {
        throw new Error(`${foreign.length} user reference${foreign.length === 1 ? "" : "s"} (${foreign.slice(0, 2).join(", ")}${foreign.length > 2 ? ", …" : ""}) ${dir.error ? "could not be confirmed in this tenant" : `${foreign.length === 1 ? "does" : "do"} not exist in this tenant`} — the policy was not created`);
      }
    };

    if (matchFrom) {
      // Match & replace: this CA number already exists in the tenant. Keep the
      // NEW version's controls/conditions, but take the whole USER assignment
      // (include/exclude users, groups, roles, guests) verbatim from the policy
      // already deployed — those ids are valid in this tenant. The old policy is
      // disabled afterwards by importPolicies.
      // The newer baseline version may ADD exclusion groups the current policy
      // doesn't have (e.g. a new break-glass / TeamsSharedDevices exclusion) —
      // those must not be lost, so they are merged onto the kept assignment.
      const newExcludeGroups = Array.isArray(u.excludeGroups) ? u.excludeGroups.slice() : [];
      const eu = (matchFrom.conditions && matchFrom.conditions.users) || {};
      u.includeUsers = Array.isArray(eu.includeUsers) ? [...eu.includeUsers] : ["None"];
      u.includeGroups = Array.isArray(eu.includeGroups) ? [...eu.includeGroups] : [];
      u.includeRoles = Array.isArray(eu.includeRoles) ? [...eu.includeRoles] : [];
      u.excludeUsers = Array.isArray(eu.excludeUsers) ? [...eu.excludeUsers] : [];
      u.excludeGroups = Array.isArray(eu.excludeGroups) ? [...eu.excludeGroups] : [];
      u.excludeRoles = Array.isArray(eu.excludeRoles) ? [...eu.excludeRoles] : [];
      if (eu.includeGuestsOrExternalUsers) u.includeGuestsOrExternalUsers = eu.includeGuestsOrExternalUsers; else delete u.includeGuestsOrExternalUsers;
      if (eu.excludeGuestsOrExternalUsers) u.excludeGuestsOrExternalUsers = eu.excludeGuestsOrExternalUsers; else delete u.excludeGuestsOrExternalUsers;
      // merge in the newer version's exclusion groups (placeholders resolve to
      // create-if-missing groups; ids remap through the backup's Groups folder)
      let added = 0;
      for (const ref of newExcludeGroups) {
        let id;
        try { id = groupRef(ref); }
        catch (e) { throw new Error(`Required exclusion could not be resolved: ${e.message}`); }
        if (id && !u.excludeGroups.includes(id)) { u.excludeGroups.push(id); added++; }
      }
      if (added) warnings.push(`${raw.displayName}: kept the current assignment and merged ${added} new exclusion group(s) introduced by this baseline version.`);
    } else if (asIs || keepAssignment || isWorkloadIdentity(raw)) {
      // as-is, a baseline switch, or a workload-identity policy: keep the
      // assignment exactly as it is. Injecting a persona group into a
      // clientApplications-scoped policy makes Graph reject the create outright.
      checkUsers();
      u.includeGroups = mapGroups(u.includeGroups);
      u.excludeGroups = mapGroups(u.excludeGroups);
      const ca = c.clientApplications;
      if (ca) {
        ca.includeServicePrincipals = (ca.includeServicePrincipals || []).slice();
        ca.excludeServicePrincipals = (ca.excludeServicePrincipals || []).slice();
      }
    } else {
      // include assignment → persona deploy group
      if (personaGroupId) {
        u.includeUsers = ["None"];
        u.includeGroups = [personaGroupId];
        u.includeRoles = [];
        delete u.includeGuestsOrExternalUsers;
      } else {
        u.includeGroups = mapGroups(u.includeGroups);
      }
      // A source user exclusion cannot be discarded without broadening the policy.
      const specials = ["All", "None", "GuestsOrExternalUsers"];
      const droppedUsers = (u.excludeUsers || []).filter(x => !specials.includes(x) && !parsePlaceholder(x));
      if (droppedUsers.length || (u.excludeUsers || []).some(parsePlaceholder)) {
        throw new Error("Source user exclusions cannot be mapped automatically. Resolve them in the import source before deploying this policy.");
      }
      u.excludeUsers = (u.excludeUsers || []).filter(x => specials.includes(x));
      u.excludeGroups = mapGroups(u.excludeGroups);
    }
    // locations → placeholders / remap
    if (c.locations) {
      for (const k of ["includeLocations", "excludeLocations"]) {
        if (!c.locations[k]) continue;
        c.locations[k] = c.locations[k].flatMap(id => {
          if (id === "All" || id === "AllTrusted" || id === "AllCompliantNetworkLocations") return [id];
          if (lower(id) === COMPLIANT_NETWORK_ID) return [COMPLIANT_NETWORK_ID];
          let v;
          try { v = resolveRef(id, maps.loc); }
          catch (e) { throw new Error(`${e.message} (named location)`); } // location is material — fail the policy
          if (isGuidStr(v) && v === id && !(maps.loc && maps.loc[id]) && maps.locKnown && !maps.locKnown.has(lower(id))) {
            throw new Error(`named location ${id} is not in this import and does not exist in this tenant — the policy was not created`);
          }
          return [v];
        });
      }
    }
    // grant controls: auth strength + terms of use.
    // A source id that is neither a placeholder nor in the dependency map
    // passes through as a literal — valid for built-ins, a guaranteed 400 for
    // tenant-local objects like a terms of use. In match & replace there is a
    // better answer than failing: the policy being replaced already carries
    // ids that work in THIS tenant, so an unmappable source id falls back to
    // the existing policy's counterpart.
    const unmapped = (v, kindMap) => !parsePlaceholder(v) && !((kindMap || {})[v]);
    if (p.grantControls?.authenticationStrength) {
      // built-in strength ids are identical across tenants; placeholders resolve by name
      const sid = p.grantControls.authenticationStrength.id;
      const exStrength = matchFrom?.grantControls?.authenticationStrength?.id || null;
      // built-in strengths sit in a fixed well-known id range — those pass
      // through untouched; only a custom strength the map can't place falls
      // back to the replaced policy's strength.
      const builtIn = /^00000000-0000-0000-0000-0000000000/i.test(String(sid));
      if (matchFrom && exStrength && !builtIn && unmapped(sid, maps.strength)) {
        p.grantControls.authenticationStrength = { id: exStrength };
        warnings.push(`${raw.displayName}: the source authentication-strength id could not be mapped to this tenant — kept the strength of the policy it replaces.`);
      } else {
        p.grantControls.authenticationStrength = { id: resolveRef(sid, maps.strength) };
      }
    }
    if (p.grantControls?.termsOfUse?.length) {
      const exTou = matchFrom?.grantControls?.termsOfUse || [];
      if (matchFrom && exTou.length && p.grantControls.termsOfUse.every((id) => unmapped(id, maps.tou))) {
        p.grantControls.termsOfUse = [...exTou];
        warnings.push(`${raw.displayName}: the source terms-of-use id could not be mapped to this tenant — kept the terms of use of the policy it replaces.`);
      } else {
        p.grantControls.termsOfUse = p.grantControls.termsOfUse.map(id => resolveRef(id, maps.tou));
      }
    }
    if (c.applications?.includeAuthenticationContextClassReferences?.length) {
      c.applications.includeAuthenticationContextClassReferences =
        c.applications.includeAuthenticationContextClassReferences.map(id => resolveRef(id, maps.ctx));
    }
    // auth contexts keep their ids (ensured earlier)
    return p;
  }

  // ---------- Conditional Access for agents: the WRITE shape (beta 25384) ----------
  // An export is a READ. Graph's "Create conditionalAccessPolicy" (beta,
  // examples 5–9) documents a different body for agent policies than the one a
  // GET returns, and Joey's June 2026 files are GETs:
  //   * agent identities — the read carries an empty includeServicePrincipals
  //     beside includeAgentIdServicePrincipals and a users block of "None";
  //     the documented create has neither, only the agent-id lists;
  //   * agents' user accounts — the read carries conditions.agents
  //     (includeAgentUsers); the documented create names them as users,
  //     includeUsers "AllAgentIdUsers", and has no agents object at all.
  // Graph refused all five of Joey's agent policies with a bare 400 on
  // Courseware (17 Sep, beta 25382). So an agent policy is written in the
  // documented shape, without OData annotations; what could not be expressed
  // is a reason (blocked), never a silent guess.
  const isNoneUsers = (u) => {
    if (!u || typeof u !== "object") return false;
    const inc = u.includeUsers || [];
    const empty = (k) => !(u[k] || []).length;
    return inc.length === 1 && inc[0] === "None" && empty("excludeUsers") && empty("includeGroups") && empty("excludeGroups")
      && empty("includeRoles") && empty("excludeRoles") && !u.includeGuestsOrExternalUsers && !u.excludeGuestsOrExternalUsers;
  };
  const noAnnotations = (o) => {
    if (Array.isArray(o)) return o.map(noAnnotations);
    if (o && typeof o === "object") {
      const r = {};
      for (const [k, v] of Object.entries(o)) if (!k.includes("@odata")) r[k] = noAnnotations(v);
      return r;
    }
    return o;
  };
  function agentWriteShape(src) {
    const p = noAnnotations(JSON.parse(JSON.stringify(src || {})));
    const c = p.conditions || (p.conditions = {});
    const notes = [];
    const ca = c.clientApplications;
    if (ca && (ca.includeAgentIdServicePrincipals || []).length) {
      for (const k of ["includeServicePrincipals", "excludeServicePrincipals"]) if (Array.isArray(ca[k]) && !ca[k].length) delete ca[k];
      if (!Array.isArray(ca.excludeAgentIdServicePrincipals)) ca.excludeAgentIdServicePrincipals = [];
      if (isNoneUsers(c.users)) delete c.users;
    }
    const ag = c.agents;
    if (ag && typeof ag === "object") {
      const inc = (ag.includeAgentUsers || []).filter(Boolean), exc = (ag.excludeAgentUsers || []).filter(Boolean);
      if (ag.agentFilter) return { payload: p, notes, blocked: "it scopes agents' user accounts with an agent filter, which Graph's documented create cannot express — create this one in the portal" };
      if (!inc.length) return { payload: p, notes, blocked: "its agents condition includes no agents' user accounts" };
      if (c.users && !isNoneUsers(c.users)) return { payload: p, notes, blocked: "it scopes users and agents' user accounts at once, which Graph's documented create cannot express — create this one in the portal" };
      const users = c.users || {};
      users.includeUsers = inc.map((x) => (x === "All" ? "AllAgentIdUsers" : x));
      users.excludeUsers = exc;
      c.users = users;
      delete c.agents;
      notes.push(`agents' user accounts written as users ${users.includeUsers.join(", ")} — the shape Graph documents for a create`);
    }
    return { payload: p, notes, blocked: null };
  }

  // ---------- apply ----------
  // opts.mode: "deploy" (default) → new/updated policies scoped to the deploy
  // persona group; "replace" → policies already in the tenant keep their current
  // assignment and the old version is switched Off.
  // "switch" → 🔀 switch baseline: the policy lands with the baseline's own
  // groups (created by ensureDependencies, members copied across by the
  // caller), Off, and a same-policy-other-name it supersedes is switched Off
  // like a replace.
  // opts.onItem(i, "start" | "end", result) lets the caller drive a run
  // ledger; opts.shouldStop() is checked between policies.
  async function importPolicies(items, maps, onStatus, opts = {}) {
    const replace = opts.mode === "replace", switching = opts.mode === "switch", shipped = opts.mode === "shipped";
    const results = [], warnings = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (opts.shouldStop && opts.shouldStop()) { results.push({ name: it.name, ok: false, stopped: true, error: "stopped before this policy — nothing changed" }); continue; }
      opts.onItem?.(i, "start");
      onStatus?.(`Importing ${it.name} (${i + 1}/${items.length})…`);
      let createdId = null;
      try {
        const gid = it.personaGroup && !switching && !shipped ? maps.personaGroupIds?.[it.personaGroup] : null;
        const matchFrom = replace && it.upgrade && it.existing ? it.existing.raw : null;
        const supersedes = (replace || switching) && it.upgrade && it.existing && it.existing.id ? it.existing : null;
        let payload = buildPolicyPayload(it.raw, maps, gid, warnings, it.asIs, matchFrom, switching || shipped);
        // E-Admins taken from another backup land Off, whatever their source state
        if (it.forceOff) payload.state = "disabled";
        // agent policies go out in the create shape Graph documents
        const agentNotes = [];
        let retryWithoutContext = false;
        if (isAgentPolicy(it.raw)) {
          const w = agentWriteShape(payload);
          if (w.blocked) throw new Error(`${w.blocked} — the policy was not created`);
          payload = w.payload;
          agentNotes.push(...w.notes);
          retryWithoutContext = !!(payload.conditions && payload.conditions.agentContext);
        }
        const dropped = [];
        const missing = appRefs([payload]).filter(id => maps.missingApps?.has(String(id).toLowerCase()));
        if (missing.length) throw new Error(`Required application references are missing: ${missing.map(appLabel).join(", ")}. No policy was created.`);
        // Create disabled, verify material settings, then restore the approved state.
        // The previous version remains active until the replacement is read back.
        const staged = { ...payload, state: "disabled" };
        let created;
        try {
          created = await Graph.gpost("/identity/conditionalAccess/policies", staged, [...AUTH_CONFIG.scopes, ...WRITE]);
        } catch (e1) {
          // A 400 creates nothing, so one retry is safe — and only for the one
          // part of an agent policy Graph documents nowhere: the agent
          // execution environment (agentContext). Without it the policy covers
          // EVERY session of the agents' user accounts, so the report says so.
          if (!retryWithoutContext || !/\(400\)|BadRequest/i.test(e1.message || "")) throw e1;
          delete payload.conditions.agentContext;
          onStatus?.(`${it.name}: retrying without the agent execution environment condition…`);
          created = await Graph.gpost("/identity/conditionalAccess/policies", staged, [...AUTH_CONFIG.scopes, ...WRITE]);
          agentNotes.push("created WITHOUT the agent execution environment condition (sessions initiated from endpoints), which Graph refused: as created it applies to every session of the agents' user accounts, cloud-hosted agents with no device included — add the condition in the portal before switching it On");
        }
        if (!created?.id) throw new Error("Create returned no policy id; verify the tenant before retrying. Previous policy was not changed.");
        createdId = created.id;
        const url = `/identity/conditionalAccess/policies/${created.id}`;
        const canonical = value => {
          if (Array.isArray(value)) return value.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
          if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).filter(k => !k.startsWith("@odata") && value[k] != null && !(Array.isArray(value[k]) && !value[k].length)).sort().map(k => [k, canonical(value[k])]));
          return value;
        };
        // Compare the properties we sent; Graph may return additional read-only fields.
        const contains = (actual, expected) => {
          if (expected == null) return actual == null;
          if (Array.isArray(expected)) return JSON.stringify(canonical(actual || [])) === JSON.stringify(canonical(expected));
          // An OData annotation is not a setting. Graph answers a read with
          // minimal metadata, so the "@odata.type" an export carries on every
          // nested object never comes back — comparing it failed every Joey
          // policy as "differs from the approved plan" after creating it.
          if (typeof expected === "object") return Object.entries(expected).every(([k,v]) => k.includes("@odata") || contains(actual?.[k],v));
          return actual === expected;
        };
        let saved;
        try {
          saved = await Graph.gget(url);
          if (!contains(saved, staged)) throw new Error("Stored policy differs from the approved plan");
          if (payload.state !== "disabled") {
            await Graph.gpatch(url, { state: payload.state }, [...AUTH_CONFIG.scopes, ...WRITE]);
            saved = await Graph.gget(url);
            if (!contains(saved, payload)) throw new Error("Activated policy could not be verified");
          }
        } catch (e) {
          throw new Error(`${e.message}. New policy ${created.id} may exist (last verified state: ${saved?.state || "unknown"}); inspect it before retrying. Previous policy was not changed.`);
        }
        const newState = payload.state;
        let disabledOld = false;
        const oldName = it.existing?.name || null;
        if (supersedes) {
          // switch the superseded policy Off; both land disabled, so the admin
          // reviews the new one and removes the old when satisfied.
          try {
            await Graph.gpatch(`/identity/conditionalAccess/policies/${supersedes.id}`, { state: "disabled" }, [...AUTH_CONFIG.scopes, ...WRITE]);
            const oldReadback = await Graph.gget(`/identity/conditionalAccess/policies/${supersedes.id}`);
            if (oldReadback.state !== "disabled") throw new Error("previous policy did not read back as Off");
            disabledOld = true;
          } catch (e) {
            warnings.push(`${it.name}: the new version was created, but disabling the current policy "${oldName}" failed — disable it manually: ${e.message}`);
          }
        }
        results.push({ name: it.name, ok: !supersedes || disabledOld, createdId: created.id, verified: true, error: supersedes && !disabledOld ? `Replacement ${created.id} verified as ${newState}, but previous policy ${supersedes.id} is not confirmed Off. Inspect both before retrying.` : null, persona: it.persona, personaGroup: matchFrom || switching || shipped ? null : it.personaGroup, asIs: it.asIs, forceOff: !!it.forceOff, matched: !!matchFrom, switched: switching, shipped: shipped && !matchFrom, disabledOld, oldName: supersedes ? oldName : null, state: newState, dropped, agentNotes });
        for (const n of agentNotes) warnings.push(`${it.name}: ${n}`);
      } catch (e) {
        console.error("Import failed:", it.name, e);
        // Graph answers most policy-shape problems with a bare 400, so add the
        // causes we can actually see in the payload.
        let hint = "";
        if (/\((400|403)\)|BadRequest|Forbidden/i.test(e.message || "") && isAgentPolicy(it.raw)) {
          hint += " — a Conditional Access for agents policy (preview): the tenant needs Microsoft Entra Agent ID (Entra ID P1 or P2 with a Microsoft Agent 365 licence), agent risk needs ID Protection, and the file uses preview properties (agents, agentContext, agentIdRiskLevels) Graph may have changed since it was exported";
        }
        if (/\(400\)|BadRequest/i.test(e.message || "") && JSON.stringify(it.raw.conditions?.locations || {}).toLowerCase().includes(COMPLIANT_NETWORK_ID)) {
          hint += " — it uses the compliant network location, which needs Global Secure Access signaling enabled for Conditional Access";
        }
        if (/\(400\)|BadRequest/i.test(e.message || "") && !isAgentPolicy(it.raw)) {
          const a = it.raw.conditions?.applications || {};
          const refs = [...(a.includeApplications || []), ...(a.excludeApplications || [])]
            .filter((x) => /^[0-9a-f]{8}-/i.test(x));
          const bits = [];
          const unknown = refs.filter((x) => maps.missingApps?.has(String(x).toLowerCase()));
          if (unknown.length) bits.push(`this tenant has no service principal for ${unknown.map(appLabel).join(", ")}`);
          else if (refs.length) bits.push(`it references ${refs.length} application(s) by id — each needs a service principal in this tenant`);
          if (isWorkloadIdentity(it.raw)) bits.push("it is a workload-identity policy, which cannot also carry a user or group scope");
          if ((it.raw.conditions?.insiderRiskLevels || []).length) bits.push("it uses insider risk, which needs the licence and the feature enabled");
          if ((it.raw.grantControls?.termsOfUse || []).length) bits.push("it grants a terms of use, which must already exist here");
          if (bits.length) hint += ` — likely because ${bits.join("; ")}`;
        }
        // An "update" is create-new-version + switch-old-Off. When the create
        // fails, say so — otherwise a failed upgrade reads as if the existing
        // policy broke, when it is in fact untouched and still enforcing.
        if ((replace || switching) && it.upgrade && it.existing) {
          hint += ` · the previous policy "${it.existing.name || it.name}" is only changed after a verified replacement; inspect the reported state before retrying`;
        }
        results.push({ name: it.name, ok: false, createdId, error: (e.message || String(e)) + hint });
      }
      opts.onItem?.(i, "end", results[results.length - 1]);
    }
    return { results, warnings };
  }

  // ---------- 🔧 re-attach: swap source ids for this tenant's groups ----------
  // rows from repairPlan(); maps from ensureDependencies() over the groups the
  // rows name. Per policy: read it fresh, swap only the ids the plan named
  // (one that has changed since is left alone), PATCH the users block, read it
  // back and require the swap to be there. State, conditions and every other
  // assignment stay as they are.
  async function repairPolicies(rows, maps, opts = {}) {
    const results = [];
    for (let i = 0; i < (rows || []).length; i++) {
      const r = rows[i];
      if (opts.shouldStop && opts.shouldStop()) { results.push({ ...r, ok: false, stopped: true, error: "stopped before this policy — nothing changed" }); continue; }
      opts.onItem?.(i, "start");
      try {
        const url = `/identity/conditionalAccess/policies/${r.id}`;
        const fresh = await Graph.gget(url);
        const users = stripOdata(JSON.parse(JSON.stringify((fresh && fresh.conditions && fresh.conditions.users) || {})));
        const done = [];
        for (const s of r.swaps) {
          const to = maps.group && maps.group[s.key];
          if (!to) {
            const why = maps.groupFailed && maps.groupFailed[s.key];
            throw new Error(`group “${s.name}” ${why ? `could not be created (${why})` : "was not created or found"} — this policy was left unchanged`);
          }
          const arr = Array.isArray(users[s.list]) ? users[s.list] : [];
          if (!arr.includes(s.from)) continue;
          users[s.list] = [...new Set(arr.map((x) => (x === s.from ? to : x)))];
          done.push({ ...s, to });
        }
        if (!done.length) { results.push({ ...r, ok: true, changed: false, done }); opts.onItem?.(i, "end", results[results.length - 1]); continue; }
        await Graph.gpatch(url, { conditions: { users } }, [...AUTH_CONFIG.scopes, ...WRITE]);
        const back = await Graph.gget(url);
        const bu = (back && back.conditions && back.conditions.users) || {};
        const left = done.filter((s) => (bu[s.list] || []).includes(s.from));
        const gone = done.filter((s) => !(bu[s.list] || []).includes(s.to));
        if (left.length || gone.length) {
          throw new Error(`Graph accepted the update but the policy does not read back with the groups attached (${[...left.map((s) => `${s.from} still there`), ...gone.map((s) => `${s.name} missing`)].join(", ")}) — inspect it before switching it On`);
        }
        results.push({ ...r, ok: true, changed: true, done });
      } catch (e) {
        results.push({ ...r, ok: false, error: e.message || String(e) });
      }
      opts.onItem?.(i, "end", results[results.length - 1]);
    }
    return results;
  }

  function repairReport({ tenantName, fileName, rows, results, depLog }) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const ok = (results || []).filter((r) => r.ok && r.changed);
    const same = (results || []).filter((r) => r.ok && !r.changed);
    const bad = (results || []).filter((r) => !r.ok);
    const log = depLog || { created: [], reused: [], warnings: [] };
    const lines = [
      `# Conditional Access re-attach report`,
      ``,
      `- **Tenant:** ${tenantName}`,
      `- **Date:** ${stamp}`,
      `- **Source:** ${fileName}`,
      `- **Policies re-attached:** ${ok.length} of ${(rows || []).length}${same.length ? ` (${same.length} already fixed)` : ""}`,
      `- **Failures:** ${bad.length}`,
      ``,
      `These policies were imported earlier with the group ids of the tenant the file came from. An id this tenant does not have excludes (or includes) nobody. Each one was swapped for the group the file meant, created here or found by name; nothing else in the policy — state, conditions, the other assignments — was changed.`,
      ``,
      `## Groups`,
      ``,
      ...(log.created || []).map((x) => `- ➕ ${x}`),
      ...(log.reused || []).map((x) => `- ♻️ ${x}`),
      ``,
      ...(ok.length ? [`## Re-attached`, ``, ...ok.map((r) => `- ✅ **${r.name}** — ${r.done.map((s) => `${s.list === "excludeGroups" ? "exclusion" : "include"} \`${s.from}\` → **${s.name}** (\`${s.to}\`)`).join("; ")}`), ``] : []),
      ...(bad.length ? [`## Failed — left unchanged`, ``, ...bad.map((r) => `- ❌ **${r.name}** — ${r.error}`), ``] : []),
      ...((log.warnings || []).length ? [`## Warnings`, ``, ...log.warnings.map((w) => `- ⚠ ${w}`), ``] : []),
      `---`,
      `Generated by ${BRANDING.name} — Import (BETA)`,
    ];
    return lines.join("\n");
  }

  // ---------- markdown change report ----------
  function buildReport({ tenantName, fileName, depLog, planItems, results, warnings, mode, licence }) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const skipped = planItems.filter(p => p.exists);
    const replaced = results.filter(r => r.ok && r.matched);
    // Workload-identity policies held back because the tenant has no Workload ID SKU
    const widBlocked = (licence && licence.known && !licence.licensed)
      ? planItems.filter(p => p.wid && !p.exists) : [];
    const stateLabel = (s) => s === "enabled" ? "On" : s === "enabledForReportingButNotEnforced" ? "Report-only" : "Off";
    const lines = [
      `# Conditional Access import report`,
      ``,
      `- **Tenant:** ${tenantName}`,
      `- **Date:** ${stamp}`,
      `- **Source:** ${fileName}`,
      `- **Assignment mode:** ${mode === "replace" ? "Match & replace — existing policies keep their current assignment; the superseded version is switched Off"
        : mode === "switch" ? `Switch baseline — policies land with the baseline's own groups (created here), members copied across from the ${depLog.switchFrom ? depLog.switchFrom + " " : ""}counterpart groups; a superseded policy is switched Off`
        : mode === "shipped" ? "As shipped — the baseline's own groups, created or found by name in this tenant and attached; no id from the source tenant is written into a policy"
        : "Deployment groups — includes remapped to the deploy persona group (CAD-SEC-U-DG-*)"}`,
      `- **Policies imported:** ${results.filter(r => r.ok).length} (${["enabled", "enabledForReportingButNotEnforced", "disabled"].map(s => `${results.filter(r => r.ok && r.state === s).length} ${stateLabel(s)}`).join(", ")})`,
      ...(replaced.length ? [`- **Policies replaced (old version disabled):** ${replaced.filter(r => r.disabledOld).length} of ${replaced.length}`] : []),
      `- **Policies skipped (already exist):** ${skipped.length}`,
      `- **Failures:** ${results.filter(r => !r.ok).length}`,
      ``,
      `## Dependencies`,
      ``,
      ...(depLog.created.length ? [`### Created`, ``, ...depLog.created.map(x => `- ${x}`), ``] : []),
      ...(depLog.reused.length ? [`### Reused (already existed)`, ``, ...depLog.reused.map(x => `- ${x}`), ``] : []),
      ...((depLog.groupNotes || []).length ? [
        `### Groups attached by name`,
        ``,
        `The group ids in the file belong to the tenant it was exported from. Every group was created or found here by NAME and the policies point at this tenant's objects; a group that could not be created held its policies back (see Failed).`,
        ``,
        ...depLog.groupNotes.map(x => `- ${x}`),
        ``,
      ] : []),
      ...(((depLog.placed || []).length || (depLog.placeFailed || []).length || (depLog.unplaced || []).length) ? [
        `### Protection — restricted administrative units`,
        ``,
        `A group created by this import is added to its persona's restricted management administrative unit, so only an administrator scoped to that unit can change its members. This section covers the groups **created here**; one that already existed is placed only if it was ticked in the preflight, and is listed separately below.`,
        ``,
        ...(depLog.placed || []).map(x => `- 🛡 **${x.name}** → \`${Rmau.auName(x.code)}\``),
        ...(depLog.placeFailed || []).map(x => `- ❌ **${x.name}** → \`${Rmau.auName(x.code)}\` — ${x.error}. **The group exists and is in use, but is not protected.**`),
        ...(depLog.unplaced || []).map(x => `- ⚠ **${x.name}** — not placed: ${x.why}`),
        ``,
        ...((depLog.unplaced || []).length ? [
          `An unplaced group is a normal group: any tenant-wide Groups Administrator can change who is excluded by the policies that use it. Where the reason is a shared group, that is a judgement call rather than a fault — a group two personas rely on cannot be filed under one of them without handing that persona's administrator control of the other's exclusions, and cannot be filed under both without handing it to either. Split it per persona, or place it by hand and accept who can reach it.`,
          ``,
        ] : []),
      ] : []),
      ...((depLog.copied || []).length ? [
        `### 🔀 Members copied across — ${depLog.switchFrom || "previous baseline"} → ${depLog.switchTo || "this baseline"}`,
        ``,
        `A switch is a rename with the members carried across: each group this baseline ships got the members of the group the previous baseline used for the same thing — the break-glass group, the exclusion group of the same CA number, the persona include group. It is a **copy**: the old group keeps its members as the rollback, and 🧹 What ${depLog.switchFrom || "the previous baseline"} left behind (🧬 Baseline Policies) lists it once nothing references it any more.`,
        ``,
        ...depLog.copied.map((c) => c.skipped
          ? `- ⏭ **${c.to}** ← \`${c.from}\` — ${c.skipped}`
          : c.error
          ? `- ❌ **${c.to}** ← \`${c.from}\` — ${c.error}`
          : `- 🔀 **${c.to}** ← \`${c.from}\` — ${c.moved} of ${c.total} member${c.total === 1 ? "" : "s"} copied${c.failed && c.failed.length ? `; **${c.failed.length} failed** (${c.failed.slice(0, 3).map((f) => f.name).join(", ")}${c.failed.length > 3 ? ", …" : ""})` : ""}${c.skippedGroups && c.skippedGroups.length ? `; ${c.skippedGroups.length} nested group${c.skippedGroups.length === 1 ? "" : "s"} not copied (${c.skippedGroups.slice(0, 3).join(", ")})` : ""}${c.example ? " — ⚠ the baseline ships this include group as an EXAMPLE; replace it with your own internals group" : ""}`),
        ``,
      ] : []),
      ...(((depLog.hardened || []).length || (depLog.hardenFailed || []).length) ? [
        `### Groups that already existed, and were finished here`,
        ``,
        `A reused group inherits none of the hardening a created one gets, so these were ticked in the preflight and applied **after** the policies imported \u2014 an import that fails leaves every existing group as it found it. Both are writes the create path already makes, and neither is destructive: Entra refuses the nesting change rather than forcing it when a group already holds nested groups, and administrative-unit membership can be undone. Membership itself was not touched.`,
        ``,
        ...(depLog.hardened || []).map(x => `- \u2705 **${x.name}** \u2014 ${x.what}`),
        ...(depLog.hardenFailed || []).map(x => `- \u274c **${x.name}** \u2014 could not ${x.what}: ${x.error}${x.hint ? ` \u2014 ${x.hint}` : ""}`),
        ``,
      ] : []),
      `## Imported policies`,
      ``,
      ...(results.filter(r => r.ok).map(r => r.asIs && r.forceOff
        ? `- 🚨 **${r.name}** — **imported Off** (E-Admins taken from ${depLog.sharedFrom || "another backup"})${depLog.sharedRenamed ? `; break-glass group \`${depLog.sharedRenamed.from}\` → \`${depLog.sharedRenamed.to}\`` : ""} — check the trusted locations and the emergency accounts' sign-in methods before switching it On`
        : r.asIs
        ? `- ✅ **${r.name}** — **imported as-is** (E-Admins: state and assignments unchanged)`
        : r.matched
        ? `- ♻️ **${r.name}** — state **${stateLabel(r.state)}** (taken from the policy it replaces); **assignment copied from the current policy** (new exclusion groups from this version merged in)${r.disabledOld ? `; previous version **${r.oldName}** switched Off` : `; ⚠ could not disable previous version${r.oldName ? ` **${r.oldName}**` : ""}`}`
        : r.switched
        ? `- 🔀 **${r.name}** — state set to Off; assignment as the baseline ships it, on the groups created or reused here${r.oldName ? (r.disabledOld ? `; superseded **${r.oldName}** switched Off` : `; ⚠ could not disable superseded **${r.oldName}**`) : ""}`
        : r.shipped
        ? `- 🧩 **${r.name}** — state set to Off; assignment as the baseline ships it, attached to the groups created or found by name here${(r.agentNotes || []).length ? ` · 🤖 ${r.agentNotes.join("; ")}` : ""}`
        : `- ✅ **${r.name}** — state set to Off; include assignment → ${r.personaGroup ? `\`${r.personaGroup}\` (persona: ${r.persona})` : "kept as in source"}${(r.agentNotes || []).length ? ` · 🤖 ${r.agentNotes.join("; ")}` : ""}`)),
      ``,
      ...(skipped.length ? [`## Skipped (already exist by CA number + version)`, ``, ...skipped.map(p => `- ⏭ ${p.name} — ${p.reason}`), ``] : []),
      ...(results.some((r) => r.ok && (r.dropped || []).length) ? [
        `## ⚠ App references dropped to get the policy in`,
        ``,
        `Graph rejects a whole policy over one application id it cannot resolve, so where this tenant has **no service principal** for a referenced app, that reference was removed and the policy imported without it. Everything below landed in state **Off**:`,
        ``,
        ...results.filter((r) => r.ok && (r.dropped || []).length).map((r) =>
          `- **${r.name}** — dropped ${r.dropped.map((d) => `${d.where === "exclude" ? "exclusion" : "include"} of ${appLabel(d.id)}`).join(", ")}`),
        ``,
        `A dropped **exclusion widens the policy**: whatever that app was exempt from, it no longer is. Create the service principal (the app must be used once in the tenant, or instantiated), then re-add the reference — or delete and re-import the policy.`,
        ``,
      ] : []),
      ...(widBlocked.length ? [
        `## 🔒 Not imported — Workload ID licence missing`,
        ``,
        `These policies are scoped to **service principals** (workload identities). Conditional Access for workload identities needs the separately purchased **Microsoft Entra Workload ID** licence — it is *not* included in Entra ID P1 or P2 — and without it Graph refuses to create or modify such a policy. They were left out rather than attempted:`,
        ``,
        ...widBlocked.map(p => `- 🔒 **${p.name}**`),
        ``,
        `Acquire the licence (a 90-day trial is available at **Entra admin center → Identity → Workload identities**), then re-run this import — nothing else needs redoing.`,
        ``,
      ] : []),
      ...(licence && !licence.known && planItems.some((p) => p.wid && !p.exists) ? [
        `> ⚠ The Workload ID licence could not be read from \`/subscribedSkus\`${licence.error ? ` (${licence.error})` : ""}, so workload-identity policies were attempted anyway. A 400 on a CA900-range policy usually means the licence is absent.`,
        ``,
      ] : []),
      ...(results.some(r => !r.ok) ? [`## Failed`, ``, ...results.filter(r => !r.ok).map(r => `- ❌ ${r.name} — ${r.error}`), ``] : []),
      ...((depLog.missingTou || []).length ? [
        `## ⚠ Terms of use to create first (manual step)`,
        ``,
        `A Terms of use has **no Graph create API** — its PDF and localised content must be uploaded in the portal. Any policy that grants one of these was imported **without** the ToU control (so it does not enforce it yet).`,
        ``,
        `**Create each one, then re-run the import** — the importer resolves them by display name on the next pass:`,
        ``,
        ...depLog.missingTou.map(n => `- [ ] **${n}**`),
        ``,
        `Portal: **Entra admin center → Identity Governance → Terms of use → New terms** — https://entra.microsoft.com/#view/Microsoft_AAD_ERM/DashboardBlade/~/TermsOfUse . Use the exact display name above.`,
        ``,
      ] : []),
      ...((warnings.length || depLog.warnings.length) ? [`## Warnings`, ``, ...[...depLog.warnings, ...warnings].map(w => `- ⚠ ${w}`), ``] : []),
      `---`,
      `Generated by ${BRANDING.name} — Import (BETA)`,
    ];
    return lines.join("\n");
  }

  return { PERSONA_GROUPS, PERSONA_CODE, fixedCode, personaOf, groupPersonas, personaCodes, isEAdmins, isWorkloadIdentity, isAgentPolicy, agentWriteShape, workloadIdLicence, touReferences, parseCaVersion, cmpVer, housekeeping, supersededOff, parsePlaceholder, collectPlaceholders, decodeBytes, parseEntries, readZip, readFolder, plan, counterpartPlan, catalogOfBundle, prepareBundle, mergeShared, repairPlan, repairPolicies, repairReport, readDirectoryIds, groupKey, COMPLIANT_NETWORK_ID, scopeBundle, ensureDependencies, buildPolicyPayload, importPolicies, buildReport };
})();
