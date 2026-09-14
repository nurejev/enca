// ======================================================================
// VERDICT TILES AND CALLOUTS — one implementation, every tool.
//
// A tile is the box that says one number and what it means: an uppercase
// label, the figure, a line of detail, and a colour when the figure is good
// or bad. 🕵 Who is has eighteen of them, 🌊 the wave thirteen, 🔒 Protect
// exclusions ten, 🛂 Session controls four, 🫥 Apps with no service
// principal one — and until this build every one of those was the same three
// spans typed out by hand, forty-six times across six files. js/spgap.js had
// already made itself a private function for it, which is the tell: the
// shape was stable enough to share and nobody had.
//
// The same goes for the callout — the coloured band that states the one
// thing a reader should act on. Six files write it.
//
// 🔗 User or Group analyzer (T19) is the tool this surface was made for and
// was the last big tool not using it: its counts were grey pills whose only
// states were grey-when-zero and green-when-picked, so "three ids a policy
// still names that the directory no longer has" looked exactly like "24
// groups". It is the first caller here; the other six migrate next, with
// their rendered output compared byte for byte.
//
// WHAT GOES IN. k, v and s are MARKUP the caller has already escaped — they
// hold interpolated names and counts, and several tiles deliberately put a
// <span class="of"> or a chip inside. title is an attribute and is escaped
// here. Nothing else is.
//
//   Verdict.tile({ k, v, s, cls, vcls, title, btn, on, data })
//   Verdict.tiles([ …tiles or html strings… ], { cols, cls })
//   Verdict.callout(html, kind)                  kind: "" | "ok" | "bad"
//
// `btn` makes the tile a button — the shape 🛂 Session controls uses for a
// tile that filters what is below it, and the shape T19 needs so a count can
// still be the jump link it always was. `data` carries whatever the tool's
// own click handler looks for.
//
// COLUMNS ARE DERIVED, not declared. The wrapper used to carry wo-3 / wo-5
// by hand, coupled to how many tiles the caller happened to emit — get that
// wrong and the grid leaves a hole. Pass the tiles and the count follows.
// ======================================================================
const Verdict = (() => {
  "use strict";
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // 4 across is the default the stylesheet already had; 1 and counts over 6
  // fall back to it rather than inventing a layout.
  const COLS = { 2: "wo-2", 3: "wo-3", 4: "", 5: "wo-5", 6: "wo-6" };

  function tile(o) {
    if (!o) return "";
    if (typeof o === "string") return o;
    const cls = ["wo-vt"];
    if (o.btn) cls.push("wo-tile");
    if (o.cls) cls.push(String(o.cls).trim());
    if (o.on) cls.push("on");
    const at = [`class="${cls.filter(Boolean).join(" ").replace(/\s+/g, " ")}"`];
    if (o.title) at.push(`title="${esc(o.title)}"`);
    Object.keys(o.data || {}).forEach((k) => at.push(`data-${k}="${esc(o.data[k])}"`));
    const body = `<span class="k">${o.k == null ? "" : o.k}</span>`
      + `<span class="v${o.vcls ? ` ${o.vcls}` : ""}">${o.v == null ? "" : o.v}</span>`
      + (o.s == null || o.s === "" ? "" : `<span class="s">${o.s}</span>`);
    return o.btn
      ? `<button type="button" ${at.join(" ")}>${body}</button>`
      : `<div ${at.join(" ")}>${body}</div>`;
  }

  function tiles(list, opts) {
    const items = (list || []).filter(Boolean);
    if (!items.length) return "";
    const o = opts || {};
    const col = COLS[o.cols || items.length];
    return `<div class="wo-verdicts${col ? ` ${col}` : ""}${o.cls ? ` ${o.cls}` : ""}">`
      + items.map(tile).join("") + `</div>`;
  }

  const callout = (html, kind) =>
    html ? `<div class="wo-callout${kind ? ` ${kind}` : ""}">${html}</div>` : "";

  return { tile, tiles, callout };
})();
