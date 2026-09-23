// ======================================================================
// RunMeta — the descriptor a result is BOUND to. Beta 25412, queue 236.
//
// Every tool here reads a tenant, computes something, and then renders it
// next to controls that can change underneath it. Before this module the
// results were loose: 🚪 Exclusion analyzer and 🎫 Licences survived a policy
// Refresh untouched, so the screen showed yesterday's snapshot under a
// freshly-reloaded tenant — and T09's Export CSV happily wrote the old
// policies out while the screen said "No policies loaded". 🔍 Gap analyse
// derived its export header from the FORM rather than from the run, so
// changing All users to Guests without rerunning changed the report's
// description while its contents stayed the same eight users.
//
// The fix is one small object and one rule: a result is published together
// with the descriptor of the run that made it, and every label, export header
// and freshness check reads the descriptor — never the live form, never the
// current tenant state.
//
//   RunMeta.of(ctx)        build a descriptor (tenant, snapshot, states,
//                          population, options, completeness, run id)
//   RunMeta.stale(m, ctx)  has the context moved under this result?
//   RunMeta.strip(m, ctx)  the evidence strip, with the stale banner when it has
//
// Pure over its arguments apart from the run counter: no DOM, no Graph.
// ======================================================================
const RunMeta = (() => {
  let seq = 0;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function statesOf(policies) {
    const st = { on: 0, ro: 0, off: 0 };
    for (const p of policies || []) {
      const s = (p && (p.state || (p.raw && p.raw.state))) || "";
      if (s === "enabled") st.on++;
      else if (s === "enabledForReportingButNotEnforced") st.ro++;
      else st.off++;
    }
    return st;
  }

  function of(ctx = {}) {
    const states = ctx.states || statesOf(ctx.policies);
    return {
      id: (++seq).toString(16).padStart(3, "0"),
      tool: ctx.tool || "",
      tenantId: ctx.tenantId || "", tenantName: ctx.tenantName || "", isDemo: !!ctx.isDemo,
      // The policy SNAPSHOT this result was computed from — not "now".
      snapshot: ctx.snapshot || null,
      policyCount: ctx.policyCount != null ? ctx.policyCount : (ctx.policies || []).length,
      states,
      population: ctx.population || "",
      options: ctx.options || [],
      completeness: ctx.completeness || "exact",
      at: Date.now(),
    };
  }

  // Two results belong to the same world when the tenant and the policy
  // snapshot match. A Refresh replaces the snapshot, which is exactly the case
  // that used to go unnoticed.
  const key = (m) => m ? `${m.isDemo ? "demo" : m.tenantId}|${m.snapshot || ""}` : "";
  const stale = (m, ctx) => !!m && !!ctx && key(m) !== key(of({ ...ctx, tool: m.tool }));

  const clock = (t) => {
    if (!t) return "not recorded";
    try { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return String(t); }
  };

  const kv = (label, value, title) => `<div class="kv"${title ? ` title="${esc(title)}"` : ""}><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

  // `ctx` is the CURRENT context; passing it turns the strip into a freshness
  // check as well as a label.
  function strip(m, ctx, opts = {}) {
    if (!m) return "";
    const isStale = ctx ? stale(m, ctx) : false;
    const bits = [
      kv("Tenant", m.isDemo ? "Demo tenant" : (m.tenantName || "(unnamed)"), m.tenantId || ""),
      kv("Policies read", `${clock(m.snapshot)} · ${m.policyCount} polic${m.policyCount === 1 ? "y" : "ies"}`),
      kv("States", `On ${m.states.on} · Report-only ${m.states.ro} · Off ${m.states.off}`),
      m.population ? kv("Population", m.population) : "",
      m.options.length ? kv("Options", m.options.join(" · ")) : "",
      kv("Completeness", m.completeness, "exact means every membership this result depends on was read in full"),
      kv("Run", `#${m.id}`),
    ].filter(Boolean).join("");
    return `<div class="runstrip${isStale ? " stale" : ""}">${bits}${isStale
      ? `<div class="kv rs-warn"><span>⚠ Policy snapshot replaced</span><b>${esc(opts.staleHint || "These results belong to the earlier snapshot — run again to see the current one.")}</b></div>` : ""}</div>`;
  }

  return { of, stale, strip, statesOf, _key: key };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { RunMeta };
