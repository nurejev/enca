// Same pure engines as the screens; no credentials, storage, Graph or tenant writes.
const assetVersion = new URL(self.location.href).search;
// coverage.js (the shared "does this policy replace that one?" comparison)
// rides along because Analyzer.evaluate and Exclusions.effectiveUsers both
// call it, and the worker is where those run. Leaving it out is silent on the
// screen and fatal in here: the analysis fails with "CaCoverage is not
// defined" after the whole tenant has been read.
importScripts(...["cascope.js", "coverage.js", "analyze.js", "whois.js", "signins.js", "reportimpact.js", "wave.js", "exclusions.js"].map(f => f + assetVersion));
let stream = null;
const reportOrder = (a, b) => b.riskyCount - a.riskyCount || b.bypassing.length - a.bypassing.length || a.user.localeCompare(b.user);
function sendResult() {
  if (stream.offset >= stream.rows.length) { self.postMessage({ resultDone: true }); stream = null; return; }
  const rows = stream.rows.slice(stream.offset, stream.offset + 500); stream.offset += rows.length;
  self.postMessage({ resultChunk: rows });
}
self.onmessage = ({ data }) => {
  try {
    if (data.stream && data.kind === "analyze") {
      stream = { ...data.args, rows: [], offset: 0, done: 0 };
      self.postMessage({ requestUsers: true }); return;
    }
    if (data.usersChunk && stream) {
      stream.rows.push(...Analyzer.evaluate(stream.lookup, data.usersChunk, stream.ctx));
      stream.done += data.usersChunk.length;
      self.postMessage({ progress: { done: stream.done, total: stream.total, label: "users evaluated" } });
      if (data.inputDone) { stream.rows.sort(reportOrder); sendResult(); }
      else self.postMessage({ requestUsers: true });
      return;
    }
    if (data.nextResult && stream) { sendResult(); return; }
    const a = data.args; let result;
    if (data.kind === "analyze") {
      result = [];
      for (let i = 0; i < a.users.length; i += 250) {
        result.push(...Analyzer.evaluate(a.lookup, a.users.slice(i, i + 250), a.ctx));
        self.postMessage({ progress: { done: Math.min(i + 250, a.users.length), total: a.users.length, label: "users evaluated" } });
      }
      result.sort(reportOrder);
    } else if (data.kind === "wave") result = Wave.analyze(a);
    else if (data.kind === "impact") result = ReportImpact.build(a.records, a.policies);
    else if (data.kind === "exclusions") result = Exclusions.effectiveUsers(a.model);
    else throw new Error("Unknown analysis job");
    self.postMessage({ result });
  } catch (e) { self.postMessage({ error: e.message || String(e) }); }
};
