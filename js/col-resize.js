// ======================================================================
// COLUMN RESIZE — every data table's columns can be dragged wider or
// narrower by their header edge (Mihai, 24 Sep 2026: "make every table
// column expandable by user"; mockup approved the same day).
//
// ONE module for every table, not a feature per tool: a MutationObserver
// finds tables as the tools render them (most tables are rebuilt from a
// template string on every repaint, so the grips are re-attached rather than
// kept) and puts a grip on the right edge of each header cell.
//
//   drag the grip       — that column's width; the table freezes to fixed
//                         layout at the widths it had, so nothing else jumps
//   double-click it     — fit the column to its widest cell on one line
//   ↺ in the last header — back to the tool's own layout (shown only once a
//                         table has been resized)
//
// Widths are remembered in THIS browser per table: by its id, or by its
// screen plus its header texts when it has none, and stored per header TEXT,
// so a table whose columns are hidden or reordered does not inherit another
// column's width. A table whose headers changed simply starts from its own
// layout again.
//
// NOT resized: matrix grids (persona × control, members × groups, the
// exclusion grid) — their narrow rotated columns ARE the layout — anything
// marked data-noresize, a header with merged cells, and a one-column table.
// ======================================================================
(function () {
  "use strict";
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  const SKIP = "table.matrix, table.mtable, table.gc-matrix, table.gm, .matrix-wrap table, table[data-noresize]";
  const KEY = "enca-colw:";
  const MIN = 44;
  const seen = new WeakSet();

  const headRow = (t) => {
    const r = t.tHead ? t.tHead.rows : null;
    if (r && r.length !== 1) return null;            // two header rows: grouped headers, leave alone
    const row = r && r.length ? r[0] : (t.rows[0] || null);
    if (!row) return null;
    const cells = [...row.cells];
    if (cells.length < 2 || cells.some((c) => c.tagName !== "TH" || c.colSpan > 1)) return null;
    return row;
  };
  // A header's name for storage: its text, or its position when it has none
  // (the tick column), so two unnamed columns never share one width.
  const label = (th) => (th.dataset.crLabel || th.textContent || "").replace(/[↺\s]+/g, " ").trim().slice(0, 60) || `#${th.cellIndex}`;
  const sig = (row) => [...row.cells].map(label).join("|");
  const keyOf = (t, row) => {
    const scr = t.closest(".screen, .modal, [id]");
    return KEY + (t.id || `${(scr && scr.id) || "page"}:${sig(row)}`);
  };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const save = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch { /* private mode */ } };

  // Freeze a table at the given widths (px per column index). Fixed layout
  // is what makes a width stick; the table's own width is the sum, never less
  // than its container, so it scrolls sideways when the columns outgrow it.
  function freeze(t, row, widths) {
    const cells = [...row.cells];
    cells.forEach((th, i) => { th.style.width = `${Math.round(widths[i])}px`; });
    t.style.tableLayout = "fixed";
    t.style.width = `${Math.round(widths.reduce((a, b) => a + b, 0))}px`;
    t.style.minWidth = "100%";
    t.classList.add("cr-custom");
    const box = t.parentElement;
    if (box && box.scrollWidth > box.clientWidth + 1 && getComputedStyle(box).overflowX === "visible") box.style.overflowX = "auto";
  }
  function measure(row) { return [...row.cells].map((th) => th.getBoundingClientRect().width); }
  function persist(t, row) {
    const w = {};
    [...row.cells].forEach((th) => { w[label(th)] = Math.round(th.getBoundingClientRect().width); });
    save(t.dataset.crKey, { sig: sig(row), w });
  }
  function reset(t, row) {
    [...row.cells].forEach((th) => { th.style.width = th.dataset.crW0 || ""; });
    t.style.tableLayout = t.dataset.crL0 || "";
    t.style.width = t.dataset.crT0 || "";
    t.style.minWidth = t.dataset.crM0 || "";
    t.classList.remove("cr-custom");
    save(t.dataset.crKey, null);
  }

  // Fit one column: lay the table out automatically for a moment with that
  // column's cells on one line, read the width the browser gives it, restore.
  function fit(t, row, idx) {
    const before = measure(row);
    const cells = [...t.rows].map((r) => r.cells[idx]).filter((c) => c && c.colSpan === 1);
    const ws = cells.map((c) => c.style.whiteSpace);
    const tl = t.style.tableLayout, tw = t.style.width, thw = row.cells[idx].style.width;
    t.style.tableLayout = "auto"; t.style.width = "max-content"; row.cells[idx].style.width = "";
    cells.forEach((c) => { c.style.whiteSpace = "nowrap"; });
    t.classList.add("cr-measuring");
    const w = Math.min(900, Math.max(MIN, Math.ceil(row.cells[idx].getBoundingClientRect().width)));
    t.classList.remove("cr-measuring");
    cells.forEach((c, i) => { c.style.whiteSpace = ws[i]; });
    t.style.tableLayout = tl; t.style.width = tw; row.cells[idx].style.width = thw;
    before[idx] = w;
    freeze(t, row, before);
    persist(t, row);
  }

  function startDrag(e, t, row, idx) {
    e.preventDefault(); e.stopPropagation();
    const grip = e.currentTarget;
    const widths = measure(row);
    freeze(t, row, widths);
    const x0 = e.clientX, w0 = widths[idx];
    grip.classList.add("on");
    document.body.classList.add("cr-dragging");
    try { grip.setPointerCapture(e.pointerId); } catch { /* old browser */ }
    const move = (ev) => {
      widths[idx] = Math.max(MIN, w0 + ev.clientX - x0);
      freeze(t, row, widths);
    };
    const up = () => {
      grip.classList.remove("on");
      document.body.classList.remove("cr-dragging");
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      persist(t, row);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  function attach(t) {
    if (t.matches(SKIP)) return;
    const row = headRow(t);
    if (!row) return;
    const cells = [...row.cells];
    if (cells.every((th) => th.querySelector(":scope > .cr-grip"))) return;   // already done for this render
    if (!seen.has(t)) {
      seen.add(t);
      t.dataset.crL0 = t.style.tableLayout || "";
      t.dataset.crT0 = t.style.width || "";
      t.dataset.crM0 = t.style.minWidth || "";
    }
    t.dataset.crKey = keyOf(t, row);
    cells.forEach((th, i) => {
      if (th.querySelector(":scope > .cr-grip")) return;
      if (th.dataset.crW0 === undefined) th.dataset.crW0 = th.style.width || "";
      if (getComputedStyle(th).position === "static") th.style.position = "relative";
      th.classList.add("cr-th");
      const g = document.createElement("span");
      g.className = "cr-grip";
      g.setAttribute("aria-hidden", "true");
      g.title = "Drag to resize this column · double-click to fit it";
      g.addEventListener("pointerdown", (e) => startDrag(e, t, row, i));
      g.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
      g.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); fit(t, row, i); });
      th.appendChild(g);
    });
    const last = cells[cells.length - 1];
    if (!last.querySelector(":scope > .cr-reset")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cr-reset";
      b.textContent = "↺";
      b.title = "Reset column widths";
      b.setAttribute("aria-label", "Reset column widths");
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); reset(t, row); });
      last.appendChild(b);
    }
    // Saved widths for exactly these headers: applied without measuring, so a
    // table rendered while hidden comes up at the right widths when shown.
    const s = load(t.dataset.crKey);
    if (s && s.sig === sig(row) && cells.every((th) => s.w[label(th)] > 0)) freeze(t, row, cells.map((th) => s.w[label(th)]));
  }

  let queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll("table").forEach((t) => { try { attach(t); } catch (e) { console.warn("col-resize:", e); } });
  }
  const queue = () => { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(scan); } };
  const start = () => { scan(); new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.ColResize = { scan, reset: (t) => { const r = headRow(t); if (r) reset(t, r); } };
})();
