// ======================================================================
// Baseline usage guide (roadmap R05) — the deployment knowledge that
// otherwise lives only in whoever has done it before, written down as an
// in-app guide that READS THE TENANT while it explains.
//
// Structure: ordered steps, each with the REASON (not just the sequence)
// and a readiness check that says what is missing BEFORE you run the
// step instead of after. The step definitions are content; the checks
// are pure functions over a ctx the app fills from Graph (or demo data):
//   ctx = { groups:[names], aus:[{displayName,isMemberManagementRestricted}],
//           locations:[], strengths:[], contexts:[], agreements:[]|null
//           (null = not read / no consent), policies:[view models] }
// Every check returns { state: "ok"|"warn"|"missing"|"unknown",
//                       summary, missing:[...] }.
// ======================================================================
const Guide = (() => {
  const lc = (s) => String(s || "").toLowerCase();

  // ---- catalog expectations -------------------------------------------
  const expectedGroups = () => (typeof GROUP_TEMPLATES !== "undefined" ? GROUP_TEMPLATES : []).map((t) => t.displayName);
  const expectedAus = () => (typeof Rmau !== "undefined" ? Rmau.BASELINE_AUS : []).map((a) => Rmau.auName(a.code));
  const catalogByPersona = () => {
    const per = new Map();
    const cat = (typeof BASELINE !== "undefined" ? BASELINE.policies : []) || [];
    for (const p of cat) {
      const g = Render.caGroup(p.name);
      if (!per.has(g.key)) per.set(g.key, { label: g.label, total: 0 });
      per.get(g.key).total++;
    }
    return per;
  };

  function checkGroups(ctx) {
    const have = new Set((ctx.groups || []).map(lc));
    const missing = expectedGroups().filter((n) => !have.has(lc(n)));
    const total = expectedGroups().length;
    return { state: missing.length === 0 ? "ok" : missing.length === total ? "missing" : "warn",
      summary: `${total - missing.length} of ${total} baseline groups exist`, missing };
  }
  function checkAus(ctx) {
    const have = new Set((ctx.aus || []).filter((a) => a.isMemberManagementRestricted === true).map((a) => lc(a.displayName)));
    const missing = expectedAus().filter((n) => !have.has(lc(n)));
    const total = expectedAus().length;
    return { state: missing.length === 0 ? "ok" : missing.length === total ? "missing" : "warn",
      summary: `${total - missing.length} of ${total} restricted units exist`, missing };
  }
  function checkLocations(ctx) {
    const locs = ctx.locations || [];
    const trusted = locs.filter((l) => l.isTrusted === true).length;
    return { state: locs.length ? (trusted ? "ok" : "warn") : "missing",
      summary: locs.length ? `${locs.length} named location${locs.length === 1 ? "" : "s"}, ${trusted} trusted` : "no named locations yet",
      missing: locs.length && !trusted ? ["No location is marked TRUSTED — the baseline's trusted-network conditions have nothing to bind to"] : locs.length ? [] : ["At least the trusted egress ranges (e.g. HQ) before location-conditioned policies"] };
  }
  function checkStrengths(ctx) {
    const custom = (ctx.strengths || []).filter((s) => (s.policyType || "").toLowerCase() !== "builtin").length;
    return { state: "ok",
      summary: `3 built-in strengths are always present · ${custom} custom in this tenant`,
      missing: [] };
  }
  function checkContexts(ctx) {
    const pub = (ctx.contexts || []).filter((c) => c.isAvailable === true).length;
    return { state: pub ? "ok" : "warn",
      summary: pub ? `${pub} published authentication context${pub === 1 ? "" : "s"}` : "no published authentication contexts",
      missing: pub ? [] : ["Only needed if the baseline set you deploy uses Protected Actions / step-up contexts — publish before referencing"] };
  }
  function checkAgreements(ctx) {
    if (ctx.agreements === null || ctx.agreements === undefined)
      return { state: "unknown", summary: "not read — needs Agreement.Read.All (asked on the click)", missing: [] };
    const n = ctx.agreements.length;
    return { state: n ? "ok" : "warn",
      summary: n ? `${n} terms-of-use agreement${n === 1 ? "" : "s"}` : "no terms-of-use agreements",
      missing: n ? [] : ["Create agreements (with their PDFs) in 📜 Terms of use before importing policies that require them"] };
  }
  function checkPolicies(ctx) {
    // Use the same policy-by-policy matcher as the Baseline tool. Counting all
    // numbered policies inside a persona could say 93/99 while hiding WHICH
    // six CA numbers were absent (and an unrelated policy in the same persona
    // could even make the count look complete). The readiness check is useful
    // only when every gap names the exact policy that has to be imported.
    const cmp = Baseline.compare(ctx.policies || [], "limonit");
    const gaps = cmp.rows.filter((r) => r.baseline && (r.status === "missing" || r.status === "conflict"));
    const missing = gaps.map((r) => r.status === "conflict"
      ? `${r.baseline.name} — CA number clash with ${r.tenant.name}`
      : r.baseline.name);
    const total = cmp.baselineTotal;
    const got = cmp.covered;
    return { state: got >= total ? "ok" : got ? "warn" : "missing",
      summary: `${got} of ${total} catalog policies present (by CA number)`, missing };
  }
  function checkStates(ctx) {
    const nums = (ctx.policies || []).filter((vm) => Render.caGroup(vm.name).num !== null);
    const st = { off: 0, ro: 0, on: 0 };
    for (const vm of nums) {
      const s = vm.raw ? vm.raw.state : vm.state;
      if (s === "enabled") st.on++;
      else if (s === "enabledForReportingButNotEnforced") st.ro++;
      else st.off++;
    }
    return { state: nums.length ? "ok" : "unknown",
      summary: nums.length ? `${st.off} Off · ${st.ro} report-only · ${st.on} enforced` : "no numbered policies yet",
      missing: [] };
  }

  // ---- the guide itself ------------------------------------------------
  // why: the reason this step sits here. check: keys into the results.
  const STEPS = [
    {
      id: "model", icon: "🧭", title: "Understand the model first",
      why: "The baseline is organised by PERSONA, and the persona lives in the CA number: CA000–CA099 applies to everyone (Global), then each hundred-range covers one kind of identity — Admins, Internals, Externals, guests, service accounts, workload identities, DevOps, factory workers. A sign-in gets its persona's policies PLUS the Global range. Read the ranges below against the catalog before creating anything: every later step hangs off this structure.",
      links: [["toolBaseline", "🧬 Baseline Policies"], ["toolHelp", "❓ Help"]],
      render: (ctx) => {
        const per = catalogByPersona();
        return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => `${v.label} — ${v.total} polic${v.total === 1 ? "y" : "ies"}`);
      },
    },
    {
      id: "groups", icon: "👥", title: "Groups and their vaults", check: ["groups", "aus"],
      why: "Policies reference groups BY ID, so the groups must exist before any policy that assigns them — importing first would create policies that target nothing. And the exclusion groups are the keys to every door: whoever edits one walks through the policy it bypasses. That is why each persona's exclusions go into their own RESTRICTED administrative unit before the policies make those groups worth attacking — one vault per persona, so a scoped administrator for DevOps cannot touch the Admins exclusions.",
      links: [["toolCaGroups", "👥 Conditional Access groups"], ["toolRmau", "🛡 Restricted AUs"]],
    },
    {
      id: "deps", icon: "🌐", title: "Named locations, strengths, contexts", check: ["locations", "strengths", "contexts"],
      why: "Same rule, next layer: policies reference named locations, authentication strengths and authentication contexts by id. Locations first (mark the trusted egress ranges TRUSTED — the flag, not the name, is what policies test), custom strengths only if your set needs more than the three built-ins, contexts only for step-up scenarios.",
      links: [["toolLocations", "🌐 Named locations"], ["toolAuthStr", "💪 Authentication strengths"], ["toolAuthCtx", "🎫 Authentication contexts"]],
    },
    {
      id: "tou", icon: "📜", title: "Terms of use", check: ["agreements"],
      why: "The one dependency an Import cannot conjure from a backup alone: an agreement is an uploaded PDF per language, so it has to exist before a policy can require it. Create them in the Terms of use tool — per-device acceptance and re-accept schedules included — and only then import policies that reference them.",
      links: [["toolTou", "📜 Terms of use"]],
    },
    {
      id: "policies", icon: "🗂", title: "Policies — imported Off", check: ["policies"],
      why: "Now the policies, and they land OFF on purpose: an imported policy is untested in THIS tenant, and Off is the only state with a guaranteed blast radius of zero. The Baseline tool shows the gap against the catalog; Import creates what is missing. Nothing is enabled yet — that is the next step's job, and doing it here is how lockouts happen.",
      links: [["toolBaseline", "🧬 Baseline Policies"], ["toolPolicies", "🗂 List Policies"]],
    },
    {
      id: "golive", icon: "🚀", title: "Go live the boring way", check: ["states"],
      why: "Off → report-only → evidence → enforced, persona by persona, Global last (it touches everyone). Report-only records what WOULD happen without doing it; 🎚 Report-only impact turns that log into the go-live forecast — who would be denied, who just gets a prompt. Enforce a policy when its forecast has become boring, and keep the break-glass accounts excluded from every single one before the first switch is flipped.",
      links: [["toolImpact", "🎚 Report-only impact"], ["toolPolicies", "🗂 List Policies"]],
    },
  ];

  const CHECKS = { groups: checkGroups, aus: checkAus, locations: checkLocations, strengths: checkStrengths,
    contexts: checkContexts, agreements: checkAgreements, policies: checkPolicies, states: checkStates };

  function evaluate(ctx) {
    const out = {};
    for (const [k, fn] of Object.entries(CHECKS)) {
      try { out[k] = fn(ctx); } catch (e) { out[k] = { state: "unknown", summary: e.message || String(e), missing: [] }; }
    }
    return out;
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(results, meta = {}) {
    const ICONS = { ok: "✅", warn: "⚠️", missing: "❌", unknown: "❔" };
    const L = [`# Baseline deployment readiness — ${meta.tenantName || "tenant"}`, "", Brand.generatedBy(), ""];
    for (const s of STEPS) {
      L.push(`## ${s.icon} ${s.title}`, "", s.why, "");
      for (const key of s.check || []) {
        const r = (results || {})[key];
        if (!r) continue;
        L.push(`- ${ICONS[r.state] || "•"} ${r.summary}`);
        for (const m of (r.missing || []).slice(0, 30)) L.push(`  - ${m}`);
      }
      L.push("");
    }
    return L.join("\n");
  }

  return { STEPS, evaluate, toMd, expectedGroups, expectedAus };
})();
