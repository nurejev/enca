// ======================================================================
// Live baseline — read the Conditional Access Baseline by Joey Verlinden
// from his repository instead of from our transcription (roadmap R36).
//
// WHY. js/baselineJoeyData.js is a hand-checked snapshot pinned at one
// commit: accurate the day it was written and stale the day he pushes. At
// the 2026.6.1 tag the repository already holds 38 policy files where the
// snapshot lists 36, and two of the snapshot's "no JSON ships" notes are no
// longer true. Reading Config/ConditionalAccess live means the catalog
// tracks his repository rather than our copy of it, and can say which
// release and commit it read.
//
// THIS IS A TRUST BOUNDARY, and the shape of the code follows from that:
//
//   * The bundled snapshot is the FALLBACK, never replaced. A failed or
//     refused fetch leaves the tool on the snapshot and says so — status()
//     always answers, and "bundled" is an answer, not a silence.
//   * Unauthenticated GitHub is rate-limited (60 requests an hour per IP)
//     and the listing is two API calls; the policy files come from
//     raw.githubusercontent.com, which is not counted the same way. A 403
//     with an x-ratelimit-remaining of 0 is reported as exactly that.
//   * Every file is validated before it is believed: JSON, an object, a
//     displayName that starts with CAnnn-, a bounded size, a bounded count.
//     A release that yields fewer than MIN_VALID usable policies is treated
//     as malformed and the snapshot stays. Nothing from the files is ever
//     executed or written into the DOM unescaped — the summaries are plain
//     strings built here, and the renderers escape them like any other.
//   * Read once per session and kept in sessionStorage: a baseline should
//     not change under you mid-session, and closing the tab forgets it. A
//     forced refresh is the person's choice, on a button.
//
// CSP: index.html's connect-src names api.github.com and
// raw.githubusercontent.com for this file and nothing else.
//
// Pure over fetch() apart from the sessionStorage cache; summarize() is a
// function of its argument so it can be tested with node alone.
// ======================================================================
const BaselineLive = (() => {
  const OWNER = "j0eyv", REPO = "ConditionalAccessBaseline";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}`;
  const KEY = "enca-baseline-live:joey";
  const MAX_FILES = 200;          // a folder with more than this is not a baseline
  const MAX_BYTES = 400 * 1024;   // per file — a policy export is ~15 KB
  const MIN_VALID = 10;           // fewer usable policies than this = malformed release

  // status: "idle" | "fetching" | "live" | "failed"
  let state = { status: "idle", error: null, at: null, release: null, commit: null, count: 0, files: 0, skipped: [] };
  let live = null;   // the catalog built from the last successful read

  const norm = (s) => String(s || "").trim().toLowerCase();

  // ---- summarising a Graph policy export into a catalog row --------------
  const APP_NAMES = {
    All: "All cloud apps", Office365: "Office 365", MicrosoftAdminPortals: "Microsoft Admin Portals",
    AllAgentIdResources: "All agent resources", None: "No resources",
  };
  const ACTION_NAMES = {
    "urn:user:registerdevice": "Register or join devices",
    "urn:user:registersecurityinfo": "Register security information",
  };
  const CONTROL_NAMES = {
    block: "Block access", mfa: "Require MFA", compliantDevice: "Require compliant device",
    domainJoinedDevice: "Require Entra hybrid joined device", approvedApplication: "Require approved client app",
    compliantApplication: "Require app protection policy", passwordChange: "Require password change",
  };
  const PLATFORM_NAMES = { android: "Android", iOS: "iOS", windows: "Windows", macOS: "macOS", linux: "Linux", windowsPhone: "Windows Phone", all: "Any platform" };
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const list = (a) => (Array.isArray(a) ? a.filter((x) => x != null && x !== "") : []);
  const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

  function resourcesOf(c) {
    const apps = c.applications || {};
    const acts = list(apps.includeUserActions);
    if (acts.length) return acts.map((a) => ACTION_NAMES[a] || a).join(", ");
    const ctx = list(apps.includeAuthenticationContextClassReferences);
    if (ctx.length) return `Authentication context (${ctx.length})`;
    const inc = list(apps.includeApplications);
    const exc = list(apps.excludeApplications);
    let txt;
    if (!inc.length) txt = "No resources";
    else if (inc.length === 1 && APP_NAMES[inc[0]]) txt = APP_NAMES[inc[0]];
    else txt = `Selected apps (${inc.length})`;
    if (exc.length) txt += ` · − ${exc.length} excluded`;
    return txt;
  }
  function platformOf(c) {
    const p = c.platforms;
    if (!p) return "Any platform";
    const inc = list(p.includePlatforms), exc = list(p.excludePlatforms);
    let txt = inc.length && !inc.includes("all") ? inc.map((x) => PLATFORM_NAMES[x] || x).join(", ") : "Any platform";
    if (exc.length) txt += ` (excl. ${exc.map((x) => PLATFORM_NAMES[x] || x).join(", ")})`;
    const f = c.devices && c.devices.deviceFilter;
    if (f && f.rule) txt += ` · device filter (${f.mode || "include"})`;
    return txt;
  }
  function networkOf(c) {
    const l = c.locations;
    if (!l) return "";
    const inc = list(l.includeLocations), exc = list(l.excludeLocations);
    const name = (x) => x === "All" ? "Any network or location" : x === "AllTrusted" ? "All trusted locations" : x === "AllCompliantNetworkLocations" ? "Compliant network" : isGuid(x) ? "a named location" : x;
    let txt = inc.length ? inc.map(name).join(", ") : "";
    if (exc.length) txt += `${txt ? " " : ""}− ${exc.map(name).join(", ")}`;
    return txt;
  }
  function conditionsOf(c) {
    const out = [];
    const ur = list(c.userRiskLevels), sr = list(c.signInRiskLevels);
    if (ur.length) out.push(`User risk: ${ur.map(cap).join(", ")}`);
    if (sr.length) out.push(`Sign-in risk: ${sr.map(cap).join(", ")}`);
    const ir = list(c.insiderRiskLevels);
    if (ir.length) out.push(`Insider risk: ${ir.map(cap).join(", ")}`);
    const ca = list(c.clientAppTypes);
    if (ca.length && !ca.includes("all")) out.push(`Client apps: ${ca.join(", ")}`);
    const af = c.authenticationFlows && list(c.authenticationFlows.transferMethods);
    if (af && af.length) out.push(`Auth flows: ${af.join(", ")}`);
    const agentRisk = c.agents && list(c.agents.agentRiskLevels || c.agents.riskLevels);
    if (agentRisk && agentRisk.length) out.push(`Agent risk: ${agentRisk.map(cap).join(", ")}`);
    return out;
  }
  function grantOf(g, s) {
    if (!g) return sessionOf(s).length ? `Session: ${sessionOf(s).join(" · ")}` : "No controls";
    const bic = list(g.builtInControls);
    if (bic.includes("block")) return "Block access";
    const parts = bic.map((x) => CONTROL_NAMES[x] || x);
    if (g.authenticationStrength && (g.authenticationStrength.displayName || g.authenticationStrength.id)) {
      parts.push(`Authentication strength: ${g.authenticationStrength.displayName || "custom"}`);
    }
    if (list(g.termsOfUse).length) parts.push("Terms of use");
    if (!parts.length) return sessionOf(s).length ? `Session: ${sessionOf(s).join(" · ")}` : "No controls (grant)";
    return parts.join(parts.length > 1 ? (String(g.operator || "OR").toUpperCase() === "AND" ? " + " : " or ") : "");
  }
  function sessionOf(s) {
    if (!s) return [];
    const out = [];
    const sf = s.signInFrequency;
    if (sf && sf.isEnabled !== false) {
      if (sf.frequencyInterval === "everyTime") out.push("sign-in frequency every time");
      else if (sf.value) out.push(`sign-in frequency ${sf.value} ${String(sf.type || "hours").replace(/s$/, "")}${sf.value === 1 ? "" : "s"}`);
    }
    const pb = s.persistentBrowser;
    if (pb && pb.isEnabled !== false && pb.mode) out.push(pb.mode === "never" ? "never persistent browser" : "always persistent browser");
    if (s.applicationEnforcedRestrictions && s.applicationEnforcedRestrictions.isEnabled !== false) out.push("app enforced restrictions");
    if (s.continuousAccessEvaluation && s.continuousAccessEvaluation.mode) out.push(`continuous access evaluation: ${s.continuousAccessEvaluation.mode}`);
    if (s.cloudAppSecurity && s.cloudAppSecurity.isEnabled !== false && s.cloudAppSecurity.cloudAppSecurityType) out.push(`Defender for Cloud Apps: ${s.cloudAppSecurity.cloudAppSecurityType}`);
    if (s.disableResilienceDefaults === true) out.push("resilience defaults disabled");
    return out;
  }

  // One catalog row from one policy export. `bundled` is the snapshot's row
  // for the same name, if any — its hand-written description and Learn link
  // are worth more than anything derivable from the JSON, so they carry over.
  function summarize(raw, bundled) {
    const name = String(raw.displayName || "").trim();
    const m = /^CA(\d{3,4})-/i.exec(name);
    const c = raw.conditions || {};
    const sess = sessionOf(raw.sessionControls);
    const row = {
      num: m ? +m[1] : null,
      name,
      grant: grantOf(raw.grantControls, raw.sessionControls),
      resources: resourcesOf(c),
      platform: platformOf(c),
      network: networkOf(c) || undefined,
      conditions: conditionsOf(c).join(" · ") || undefined,
      session: sess.join(" · ") || undefined,
      state: raw.state || "",
      description: (bundled && bundled.description) || "",
      learn: (bundled && bundled.learn) || undefined,
    };
    if (bundled && bundled.persona) row.persona = bundled.persona;
    return row;
  }

  // ---- validation ----------------------------------------------------------
  // What a file must be before it counts. Returns a reason string when it does
  // not, null when it does.
  function reject(raw, size) {
    if (size > MAX_BYTES) return `larger than ${Math.round(MAX_BYTES / 1024)} KB`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "not a JSON object";
    if (typeof raw.displayName !== "string" || !/^CA\d{3,4}-/i.test(raw.displayName.trim())) return "displayName is not CAnnn-…";
    if (!raw.conditions || typeof raw.conditions !== "object") return "no conditions block";
    return null;
  }

  // ---- fetching ------------------------------------------------------------
  async function get(url, accept) {
    const r = await fetch(url, { headers: { Accept: accept || "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) {
      const rem = r.headers.get("x-ratelimit-remaining");
      if ((r.status === 403 || r.status === 429) && rem === "0") {
        const reset = +r.headers.get("x-ratelimit-reset") * 1000;
        const when = reset ? new Date(reset).toLocaleTimeString() : "later";
        throw new Error(`GitHub rate limit reached for this address (unauthenticated: 60 requests an hour) — try again after ${when}`);
      }
      throw new Error(`GitHub answered ${r.status} for ${url.replace(API, "").replace(RAW, "") || "/"}`);
    }
    return r;
  }

  // The policy files are PowerShell exports, and Windows PowerShell's
  // Out-File writes UTF-16 LE with a byte-order mark — raw.githubusercontent
  // even labels them "charset=utf-16". Response.text() decodes as UTF-8
  // regardless and yields "\ufffd\ufffd{\0\r\0…", which is how build 25243's
  // first live read reported 0 of 38 files as valid JSON. So: read the bytes,
  // sniff the BOM, decode accordingly, and strip the mark.
  function decode(buf) {
    const b = new Uint8Array(buf);
    let enc = "utf-8";
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) enc = "utf-16le";
    else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) enc = "utf-16be";
    // no BOM but every other byte is NUL in the first line: UTF-16 LE anyway
    else if (b.length >= 8 && b[1] === 0 && b[3] === 0 && b[5] === 0 && b[7] === 0) enc = "utf-16le";
    let txt;
    try { txt = new TextDecoder(enc).decode(b); }
    catch { txt = new TextDecoder("utf-8").decode(b); }
    return txt.replace(/^\ufeff/, "");
  }

  // ---- what the importer needs, kept alongside the catalog ----------------
  // The repository is laid out exactly like an ENCA backup — a policy file per
  // policy, Config/Groups with one JSON per group (ids the policies reference),
  // Config/NamedLocations — which is what lets 📥 Import take it straight
  // from the read instead of asking for a zip. The raw objects are kept, with
  // the OData noise stripped (the links, the "#microsoft.graph.restore"
  // action, the per-property type hints), so a policy export of 16 KB
  // becomes ~5 KB in sessionStorage; the type discriminators a create needs
  // ("@odata.type": "#microsoft.graph.countryNamedLocation") stay.
  function slim(o) {
    if (Array.isArray(o)) return o.map(slim);
    if (o && typeof o === "object") {
      const r = {};
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith("#")) continue;
        if (k.includes("@odata") && !(k === "@odata.type" && typeof v === "string" && v.startsWith("#microsoft.graph."))) continue;
        r[k] = slim(v);
      }
      return r;
    }
    return o;
  }
  // A group file carries 40 properties of one tenant's directory; the create
  // needs six. mailNickname is deliberately dropped — the export holds a
  // truncated GUID, and the create derives a readable one from the name.
  const slimGroup = (g) => ({ id: g.id, displayName: g.displayName, description: g.description || null,
    groupTypes: Array.isArray(g.groupTypes) ? g.groupTypes : [], membershipRule: g.membershipRule || null,
    securityEnabled: g.securityEnabled !== false, mailEnabled: g.mailEnabled === true });

  // A few files at a time: raw.githubusercontent is not the rate-limited
  // API, but 80 sequential round trips is a long wait for a button.
  async function pool(items, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; await fn(items[k], k); }
    });
    await Promise.all(workers);
  }

  // Read the latest release and every policy file it ships. Resolves to the
  // catalog on success; throws on failure. Never touches the snapshot.
  async function read(onStatus) {
    const bundled = typeof BASELINE_JOEY !== "undefined" ? BASELINE_JOEY : null;
    if (!bundled) throw new Error("the bundled catalog is not loaded, so there is nothing to fall back to");
    onStatus?.("Reading the latest release…");
    const rel = await (await get(`${API}/releases/latest`)).json();
    const tag = String(rel.tag_name || "").trim();
    if (!tag || !/^[\w.\-]{1,64}$/.test(tag)) throw new Error("the latest release has no usable tag name");
    const published = String(rel.published_at || rel.created_at || "").slice(0, 10);

    // One tree call lists the whole Config/ folder — policies, groups and
    // named locations — where the contents listing costs one call per folder
    // against a 60-an-hour budget. The contents listing stays as the
    // fallback for the policies alone, so a tree that is refused or truncated
    // still yields a catalog (and says the importer has no groups to go on).
    const root = String(bundled.configPath || "").split("/")[0] || "Config";
    const inFolder = (path, folder) => path.startsWith(folder + "/") && path.slice(folder.length + 1).indexOf("/") < 0 && /\.json$/i.test(path);
    let files = [], groupFiles = [], locFiles = [], treeOk = false;
    onStatus?.(`Listing ${root}/ at ${tag}…`);
    try {
      const tree = await (await get(`${API}/git/trees/${encodeURIComponent(tag)}?recursive=1`)).json();
      if (Array.isArray(tree.tree) && !tree.truncated) {
        const blobs = tree.tree.filter((t) => t && t.type === "blob" && typeof t.path === "string" && t.path.startsWith(root + "/"));
        const entry = (t) => ({ name: t.path.split("/").pop(), path: t.path, size: t.size || 0 });
        files = blobs.filter((t) => inFolder(t.path, bundled.configPath)).map(entry);
        groupFiles = blobs.filter((t) => inFolder(t.path, `${root}/Groups`)).map(entry);
        locFiles = blobs.filter((t) => inFolder(t.path, `${root}/NamedLocations`)).map(entry);
        treeOk = files.length > 0;
      }
    } catch (e) { console.warn("baseline live: tree listing failed, falling back to contents:", e.message || e); }
    if (!treeOk) {
      onStatus?.(`Listing ${bundled.configPath} at ${tag}…`);
      const listing = await (await get(`${API}/contents/${bundled.configPath}?ref=${encodeURIComponent(tag)}`)).json();
      if (!Array.isArray(listing)) throw new Error(`${bundled.configPath} is not a folder at ${tag}`);
      files = listing.filter((f) => f && f.type === "file" && /\.json$/i.test(f.name || "")).map((f) => ({ name: f.name, path: `${bundled.configPath}/${f.name}`, size: f.size || 0 }));
      groupFiles = []; locFiles = [];
    }
    if (!files.length) throw new Error(`no policy JSON files in ${bundled.configPath} at ${tag}`);
    if (files.length > MAX_FILES) throw new Error(`${files.length} files in ${bundled.configPath} — more than the ${MAX_FILES} this reader accepts`);
    if (groupFiles.length > MAX_FILES) groupFiles = groupFiles.slice(0, MAX_FILES);
    if (locFiles.length > MAX_FILES) locFiles = locFiles.slice(0, MAX_FILES);

    // The commit the tag points at is what "which commit did it read" means.
    // The contents listing does not carry it, so it is one more small call —
    // and a failure there costs only the commit line, not the read.
    let commit = "";
    try {
      const ref = await (await get(`${API}/git/ref/tags/${encodeURIComponent(tag)}`)).json();
      commit = String((ref.object && ref.object.sha) || "");
      // an annotated tag points at a tag object, not the commit
      if (ref.object && ref.object.type === "tag") {
        try { const t = await (await get(ref.object.url)).json(); commit = String((t.object && t.object.sha) || commit); } catch { /* keep the tag object sha */ }
      }
    } catch { commit = ""; }

    const byName = new Map((bundled.policies || []).map((p) => [norm(p.name), p]));
    const rawUrl = (path) => `${RAW}/${encodeURIComponent(tag)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const readJson = async (f) => {
      const txt = decode(await (await get(rawUrl(f.path), "application/json")).arrayBuffer());
      let raw;
      try { raw = JSON.parse(txt); } catch (e) { throw new Error(`not valid JSON (${String(e.message || e).slice(0, 60)})`); }
      return { raw, size: txt.length };
    };
    const policies = [], raws = [], skipped = [];
    let n = 0;
    const slots = new Array(files.length);
    await pool(files, 6, async (f, k) => {
      onStatus?.(`Reading policy files… ${++n}/${files.length}`);
      try {
        const { raw, size } = await readJson(f);
        const why = reject(raw, size);
        if (why) { skipped.push(`${f.name}: ${why}`); return; }
        const row = summarize(raw, byName.get(norm(raw.displayName)) || null);
        row.file = f.name;
        slots[k] = { row, raw: slim(raw) };
      } catch (e) { skipped.push(`${f.name}: ${e.message || e}`); }
    });
    for (const s of slots) if (s) { policies.push(s.row); raws.push(s.raw); }
    if (policies.length < MIN_VALID) {
      throw new Error(`only ${policies.length} of ${files.length} files were usable policies — treating the release as malformed and keeping the bundled snapshot${skipped.length ? ` (${skipped[0]}${skipped.length > 1 ? ", …" : ""})` : ""}`);
    }
    policies.sort((a, b) => (a.num ?? 9999) - (b.num ?? 9999) || a.name.localeCompare(b.name));
    raws.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
    // duplicate numbers in the repository are a finding, not a bug to hide
    const seen = new Map();
    for (const p of policies) { if (p.num != null) seen.set(p.num, (seen.get(p.num) || 0) + 1); }
    const dups = [...seen].filter(([, k]) => k > 1).map(([num]) => `CA${String(num).padStart(3, "0")}`);

    // The importer's dependencies. A file that fails here costs that one
    // object, never the read: the catalog is the policies, the rest is
    // what makes them importable.
    const groups = [], namedLocations = [], depSkipped = [];
    let g = 0;
    await pool(groupFiles, 6, async (f) => {
      onStatus?.(`Reading group files… ${++g}/${groupFiles.length}`);
      try {
        const { raw } = await readJson(f);
        if (!raw || typeof raw !== "object" || typeof raw.displayName !== "string" || !raw.id) throw new Error("not a group export");
        groups.push(slimGroup(raw));
      } catch (e) { depSkipped.push(`Groups/${f.name}: ${e.message || e}`); }
    });
    let l = 0;
    await pool(locFiles, 4, async (f) => {
      onStatus?.(`Reading named locations… ${++l}/${locFiles.length}`);
      try {
        const { raw } = await readJson(f);
        if (!raw || typeof raw !== "object" || typeof raw.displayName !== "string" || !raw.id) throw new Error("not a named-location export");
        namedLocations.push(slim(raw));
      } catch (e) { depSkipped.push(`NamedLocations/${f.name}: ${e.message || e}`); }
    });
    groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
    namedLocations.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { tag, published, commit, policies, files: files.length, skipped, dups, htmlUrl: rel.html_url || "",
      raws, groups, namedLocations, depSkipped, treeOk };
  }

  function build(r) {
    const B = BASELINE_JOEY;
    const cat = {
      ...B,
      source: "live",
      release: r.tag, released: r.published, commit: r.commit || B.commit,
      liveUrl: r.htmlUrl || `${B.url}/releases/tag/${r.tag}`,
      files: r.files, skipped: r.skipped || [], dups: r.dups || [],
      readAt: r.at || new Date().toISOString(),
      policies: r.policies.map((p) => ({ ...p })),
      // what 📥 Import works from — the same shape a backup zip unpacks to
      bundle: {
        policies: (r.raws || []).map((p) => ({ ...p })),
        groups: (r.groups || []).map((g) => ({ ...g })),
        namedLocations: (r.namedLocations || []).map((x) => ({ ...x })),
        authStrengths: [], authContexts: [], termsOfUse: [],
        depSkipped: r.depSkipped || [], complete: !!r.treeOk,
      },
    };
    // the live release may drop or rename groups the snapshot listed; the
    // named groups come from the contract, the exclusions from the policies
    return B.decorate(cat);
  }

  // ---- cache ---------------------------------------------------------------
  // schema 2: the raw policy, group and named-location objects ride along,
  // so an import can start from a read taken earlier in the session. A
  // schema-1 entry (rows only) is simply re-read.
  const SCHEMA = 2;
  function load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || o.schema !== SCHEMA || !Array.isArray(o.policies) || o.policies.length < MIN_VALID) return false;
      live = build(o);
      state = { status: "live", error: null, at: o.at, release: o.tag, commit: o.commit, count: o.policies.length, files: o.files, skipped: o.skipped || [] };
      return true;
    } catch { return false; }
  }
  function save(r) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, tag: r.tag, published: r.published, commit: r.commit, files: r.files,
        skipped: r.skipped, dups: r.dups, htmlUrl: r.htmlUrl, at: r.at, policies: r.policies,
        raws: r.raws, groups: r.groups, namedLocations: r.namedLocations, depSkipped: r.depSkipped, treeOk: r.treeOk }));
    } catch { /* storage refused — the read still lives for this page */ }
  }

  // The importable form of the live read, or null when there is none. The
  // caller decides what to do about a bundle that has no groups (a tree
  // listing that was refused): the policies still import, their group
  // references cannot be resolved by id and are dropped with a warning each.
  function bundle() {
    if (!live || !live.bundle || !live.bundle.policies.length) return null;
    return {
      policies: live.bundle.policies.map((p) => JSON.parse(JSON.stringify(p))),
      groups: live.bundle.groups.map((g) => ({ ...g })),
      namedLocations: live.bundle.namedLocations.map((x) => JSON.parse(JSON.stringify(x))),
      authStrengths: [], authContexts: [], termsOfUse: [],
      depSkipped: live.bundle.depSkipped.slice(), complete: live.bundle.complete,
      release: live.release, commit: live.commit, label: live.label, catalogId: live.id,
    };
  }

  let inflight = null;
  // The one entry point. Resolves to status(); never throws — a failure is a
  // state, reported, not an exception the caller has to remember to catch.
  //   force: read again even if this session already has a live catalog
  async function fetchLatest(opts) {
    const o = opts || {};
    if (!o.force && live) return status();
    if (inflight) return inflight;
    state = { ...state, status: "fetching", error: null };
    inflight = (async () => {
      try {
        const r = await read(o.onStatus);
        r.at = new Date().toISOString();
        live = build(r);
        save(r);
        state = { status: "live", error: null, at: r.at, release: r.tag, commit: r.commit, count: r.policies.length, files: r.files, skipped: r.skipped };
      } catch (e) {
        // A failed refresh does not throw away the read that already worked.
        state = { ...state, status: live ? "live" : "failed", error: e.message || String(e), failedAt: new Date().toISOString() };
      } finally { inflight = null; }
      try { document.dispatchEvent(new CustomEvent("enca:baseline-live", { detail: status() })); } catch { /* no DOM */ }
      return status();
    })();
    return inflight;
  }

  const catalog = () => live;
  const status = () => ({ ...state, hasLive: !!live, bundled: typeof BASELINE_JOEY !== "undefined" ? { release: BASELINE_JOEY.release, commit: BASELINE_JOEY.commit } : null });
  const shortSha = (sha) => String(sha || "").slice(0, 7);
  // One line that says which of the two the tool is using — the thing the
  // roadmap card says must never be left to inference.
  function sourceLine(cat) {
    const c = cat || live || (typeof BASELINE_JOEY !== "undefined" ? BASELINE_JOEY : null);
    if (!c) return "";
    if (c.source === "live") {
      const when = c.readAt ? new Date(c.readAt) : null;
      const ago = when ? Math.max(0, Math.round((Date.now() - when.getTime()) / 60000)) : null;
      return `LIVE from the repository — release ${c.release}${c.commit ? ` at commit ${shortSha(c.commit)}` : ""}, ${c.policies.length} policies from ${c.files} files, read ${ago == null ? "this session" : ago < 1 ? "just now" : `${ago} min ago`}`;
    }
    const s = state;
    const why = s.status === "failed" ? ` — the live read failed: ${s.error}` : s.status === "fetching" ? " — reading the repository…" : s.status === "idle" ? " — the repository has not been read this session" : "";
    return `BUNDLED SNAPSHOT — release ${c.release} at commit ${shortSha(c.commit)}, ${c.policies.length} policies${why}`;
  }

  load();
  return { fetchLatest, catalog, bundle, status, sourceLine, summarize, reject, slim, KEY, API, RAW, MIN_VALID, MAX_FILES };
})();
