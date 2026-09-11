// ======================================================================
// Run ledger — the one progress box every batch write shows.
//
// A tool that walks a list and writes (139 policies, 6 groups, 4 ticks)
// used to say so with a toast per item and a spinner. This shows the WHOLE
// list before the first write, marks the row being written, turns each row
// green ✓ or red ✗ as it lands with the reason inline, keeps the working row
// in view, counts in the header, and offers Stop. Pure DOM, no state of its
// own beyond the rows; the caller drives it: start(i) → done(i) / fail(i) /
// skip(i), finish() at the end.
//
//   const L = RunLedger.create(hostEl, { unit: "policies", items: [{ label, sub }], onStop });
//   L.start(i); … L.done(i, "added"); L.fail(i, "why"); L.skip(i, "why");
//   L.part(i, "what landed and what did not") — PARTLY DONE (25324): some of
//   the item's writes landed and some were refused. Neither ✓ nor ✗ is
//   honest for a group taken out of 36 of 39 policies; the amber ◐ is.
//   L.finish({ report: () => …, retry: () => … });
//   L.stopped → true once Stop was pressed; the loop checks it between items.
// ======================================================================
const RunLedger = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmt = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };

  function create(host, opts) {
    const o = opts || {};
    const items = (o.items || []).map((it) => ({ label: typeof it === "string" ? it : it.label, sub: (it && it.sub) || "", state: "pend", note: "", st: "" }));
    const t0 = Date.now();
    const unit = o.unit || "items";
    let stopped = false, finished = false, timer = null;
    host.innerHTML = `<div class="rl">
      <div class="rl-hd"><b>${items.length} ${esc(unit)}</b>${o.title ? `<span class="mini muted">${esc(o.title)}</span>` : ""}<span class="n"></span></div>
      <div class="rl-bar"><i style="width:0%"></i></div>
      <div class="rl-list">${items.map((it, i) => row(it, i)).join("")}</div>
      <div class="rl-ft"><span class="k d"><i></i><span data-k="done">0 done</span></span><span class="k f"><i></i><span data-k="fail">0 failed</span></span><span class="k h" hidden><i></i><span data-k="part">0 partly done</span></span><span class="k p"><i></i><span data-k="pend">${items.length} waiting</span></span><span class="rl-actions"></span>${o.onStop !== false ? '<button class="btn sm stop" type="button">■ Stop after this one</button>' : ""}</div>
    </div>`;
    const el = host.querySelector(".rl");
    const list = el.querySelector(".rl-list"), bar = el.querySelector(".rl-bar i"), n = el.querySelector(".rl-hd .n");
    const stopBtn = el.querySelector(".stop");
    if (stopBtn) stopBtn.addEventListener("click", () => { stopped = true; stopBtn.disabled = true; stopBtn.textContent = "■ Stopping after this one…"; if (o.onStop) o.onStop(); });

    function row(it, i) {
      const ICON = { done: "✓", fail: "✗", part: "◐", skip: "–", work: "", pend: "" };
      const ST = { done: it.st || "done", fail: it.st || "failed", part: it.st || "partly done", skip: it.st || "skipped", work: it.st || "writing…", pend: "waiting" };
      return `<div class="rl-row ${it.state}" data-rl="${i}"><span class="ic">${ICON[it.state] || ""}</span><span class="lbl" title="${esc(it.label)}${it.note ? " — " + esc(it.note) : ""}">${esc(it.label)}${it.sub ? ` <small>${esc(it.sub)}</small>` : ""}${it.note ? ` <small>${esc(it.note)}</small>` : ""}</span><span class="st">${esc(ST[it.state])}</span></div>`;
    }
    function paint(i) {
      const r = list.querySelector(`[data-rl="${i}"]`);
      if (r) { r.outerHTML = row(items[i], i); }
      const done = items.filter((x) => x.state === "done").length, fail = items.filter((x) => x.state === "fail").length, skip = items.filter((x) => x.state === "skip").length, part = items.filter((x) => x.state === "part").length;
      const settled = done + fail + skip + part;
      n.innerHTML = `<b>${settled}</b> of ${items.length}${part ? ` · ${part} partly done` : ""}${fail ? ` · ${fail} failed` : ""}${skip ? ` · ${skip} skipped` : ""} · ${fmt(Date.now() - t0)}`;
      bar.style.width = `${items.length ? Math.round((settled / items.length) * 100) : 0}%`;
      bar.classList.toggle("has-fail", fail > 0);
      bar.classList.toggle("has-part", part > 0 && !fail);
      el.querySelector('[data-k="done"]').textContent = `${done} done`;
      el.querySelector('[data-k="fail"]').textContent = `${fail} failed`;
      const pk = el.querySelector('[data-k="part"]'); if (pk) { pk.textContent = `${part} partly done`; pk.parentElement.hidden = !part; }
      el.querySelector('[data-k="pend"]').textContent = `${items.length - settled} waiting`;
      const w = list.querySelector(".rl-row.work");
      if (w && w.scrollIntoView) { try { w.scrollIntoView({ block: "nearest" }); } catch { /* jsdom */ } }
    }
    const set = (i, state, note, st) => { const it = items[i]; if (!it) return; it.state = state; it.note = note || ""; it.st = st || ""; paint(i); };
    // the clock in the header keeps moving while a write is in flight
    timer = setInterval(() => { if (!finished) { const settled = items.filter((x) => x.state !== "pend" && x.state !== "work").length; const fail = items.filter((x) => x.state === "fail").length; const part = items.filter((x) => x.state === "part").length; n.innerHTML = `<b>${settled}</b> of ${items.length}${part ? ` · ${part} partly done` : ""}${fail ? ` · ${fail} failed` : ""} · ${fmt(Date.now() - t0)}`; } }, 1000);

    return {
      el, items,
      get stopped() { return stopped; },
      start: (i, st) => set(i, "work", "", st),
      done: (i, note, st) => set(i, "done", note, st),
      fail: (i, why, st) => set(i, "fail", why, st),
      part: (i, note, st) => set(i, "part", note, st),
      skip: (i, why, st) => set(i, "skip", why, st),
      note: (i, note) => { const it = items[i]; if (it) { it.note = note; paint(i); } },
      finish: (f) => {
        finished = true; clearInterval(timer);
        const fail = items.filter((x) => x.state === "fail").length;
        items.forEach((it, i) => { if (it.state === "pend" || it.state === "work") set(i, "skip", stopped ? "stopped" : "not reached"); });
        el.classList.add("finished"); el.classList.toggle("has-fail", fail > 0);
        if (stopBtn) stopBtn.remove();
        const acts = el.querySelector(".rl-actions");
        const bits = [];
        if (f && f.report) bits.push('<button class="btn sm" type="button" data-rl-report>📄 Report</button>');
        if (f && f.retry && fail) bits.push('<button class="btn sm" type="button" data-rl-retry>↻ Retry the failed</button>');
        acts.innerHTML = bits.join(" ");
        if (f && f.report) acts.querySelector("[data-rl-report]").addEventListener("click", f.report);
        if (f && f.retry && fail) acts.querySelector("[data-rl-retry]").addEventListener("click", () => f.retry(items.map((it, i) => it.state === "fail" ? i : -1).filter((i) => i >= 0)));
        paint(-1);
      },
    };
  }
  return { create };
})();
