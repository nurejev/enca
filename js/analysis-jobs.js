// Large calculations run outside the UI thread. Two jobs share the worker budget.
const AnalysisJobs = (() => {
  const workerUrl = new URL("analysis-worker.js" + new URL(document.currentScript.src).search, document.currentScript.src).href;
  const queue = []; let active = 0;
  const stopped = () => Object.assign(new Error("Analysis stopped; results are incomplete"), { stopped: true });
  function pump() {
    while (active < 2 && queue.length) {
      const job = queue.shift(); job.unqueue?.();
      if (job.signal?.aborted) { job.reject(stopped()); continue; }
      active++;
      let worker, settled = false, resultRows = [], inputOffset = 0;
      const finish = (error, result) => {
        if (settled) return; settled = true;
        worker?.terminate(); job.signal?.removeEventListener("abort", abort);
        active--; error ? job.reject(error) : job.resolve(result); pump();
      };
      const abort = () => finish(stopped());
      const postSoon = (data) => setTimeout(() => {
        if (settled) return;
        try { worker.postMessage(data); } catch (error) { finish(error); }
      }, 0);
      try {
        if (typeof Worker === "undefined") throw new Error("This browser cannot start an analysis worker. Use a current browser; no incomplete result was published.");
        worker = new Worker(workerUrl);
        worker.onmessage = ({ data }) => {
          try {
            if (data.error) { finish(new Error(data.error)); return; }
            if (data.progress) { job.onProgress?.(data.progress); return; }
            if (data.requestUsers) {
              const users = job.args.users.slice(inputOffset, inputOffset + 500);
              inputOffset += users.length;
              // Yield between transfers so a large directory cannot monopolize
              // the UI thread while being cloned into the worker.
              postSoon({ usersChunk: users, inputDone: inputOffset >= job.args.users.length });
              return;
            }
            if (data.resultChunk) {
              for (const row of data.resultChunk) resultRows.push(row);
              postSoon({ nextResult: true });
              return;
            }
            finish(null, data.resultDone ? resultRows : data.result);
          } catch (e) { finish(e); }
        };
        worker.onerror = e => finish(new Error(e.message || "Analysis worker failed; no result was published"));
        job.signal?.addEventListener("abort", abort, { once: true });
        worker.postMessage(job.kind === "analyze"
          ? { kind: job.kind, stream: true, args: { lookup: job.args.lookup, ctx: job.args.ctx, total: job.args.users.length } }
          : { kind: job.kind, args: job.args });
      } catch (e) { finish(e); }
    }
  }
  function run(kind, args, options = {}) {
    if (kind === "analyze" && args.users.length * args.lookup.length > 2000000) return Promise.reject(new Error("Selection exceeds 2 million user-policy evaluations. Select a smaller group; no partial result was published."));
    return new Promise((resolve, reject) => {
      const job = { kind, args, ...options, resolve, reject };
      const abort = () => { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); job.unqueue(); reject(stopped()); } };
      job.unqueue = () => job.signal?.removeEventListener("abort", abort);
      if (job.signal?.aborted) { reject(stopped()); return; }
      job.signal?.addEventListener("abort", abort, { once: true });
      queue.push(job); pump();
    });
  }
  return { run };
})();
