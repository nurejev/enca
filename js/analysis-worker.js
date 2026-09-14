// Same pure engines as the screens; no credentials, storage, Graph or tenant writes.
const assetVersion = new URL(self.location.href).search;
importScripts(...["cascope.js", "analyze.js", "whois.js", "signins.js", "reportimpact.js", "wave.js", "exclusions.js"].map(f => f + assetVersion));
self.onmessage = ({ data }) => {
  try {
    const a = data.args; let result;
    if (data.kind === "analyze") {
      result = [];
      for (let i = 0; i < a.users.length; i += 250) {
        result.push(...Analyzer.evaluate(a.lookup, a.users.slice(i, i + 250), a.ctx));
        self.postMessage({ progress: { done: Math.min(i + 250, a.users.length), total: a.users.length, label: "users evaluated" } });
      }
    } else if (data.kind === "wave") result = Wave.analyze(a);
    else if (data.kind === "impact") result = ReportImpact.build(a.records, a.policies);
    else if (data.kind === "exclusions") result = Exclusions.effectiveUsers(a.model);
    else throw new Error("Unknown analysis job");
    self.postMessage({ result });
  } catch (e) { self.postMessage({ error: e.message || String(e) }); }
};
