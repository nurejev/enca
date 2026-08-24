// ======================================================================
// Self-host branding, the before-first-paint half (S02).
//
// index.html carries the deployment's default look as static markup and
// every app script loads at the end of the body — so on a hard refresh a
// branded instance painted Limon-IT first and swapped after the scripts
// arrived. This file is the fix: it loads BLOCKING in <head>, reads the
// brand this browser already knows about, and injects the palette and
// logo before anything is painted.
//
// It can only ever be the SECOND paint that is authoritative:
//   · js/selfhost.js still fetches /selfhost-branding.json, updates the
//     cache this file reads, and repaints through applyBranding() — so a
//     changed file wins on this load, and this file is right on the next.
//   · The very first visit in a browser has no cache and still flashes
//     once. That is the floor for a static site: the alternative is a
//     blocking fetch before every paint, which taxes every load to save
//     the first.
//
// Everything read here was sanitised by cleanBrand (js/selfhost.js)
// before it was stored, and is guarded again anyway: colour values are
// charset-checked and images must be data: URIs. applyBranding() removes
// the injected tag when it takes over, so this can never fight the real
// branding code.
//
// Kept dependency-free on purpose: it runs before BRANDING exists.
// ======================================================================
(() => {
  "use strict";
  try {
    const read = (k) => {
      try { const j = JSON.parse(localStorage.getItem(k) || "null"); return (j && j.brand) || null; } catch { return null; }
    };
    // The admin's own Apply beats the cached deployment file, same
    // precedence as js/selfhost.js.
    const b = read("enca-selfhost-brand") || read("enca-selfhost-brand-cache");
    if (!b || typeof b !== "object") return;

    const SAFE = /^[#a-zA-Z0-9(),.%\s\/-]+$/;
    const decl = (o) => Object.entries(o || {})
      .filter(([k, v]) => k.startsWith("--") && typeof v === "string" && v.length < 80 && SAFE.test(v))
      .map(([k, v]) => `${k}:${v}`).join(";");
    const uri = (v) => (typeof v === "string" && v.length < 800000 && /^data:image\/(png|jpe?g|svg\+xml|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : null;

    document.documentElement.setAttribute("data-brand", "selfhost");
    const sel = ':root[data-brand="selfhost"]';
    const L = decl(b.colorsLight), D = decl(b.colorsDark), logo = uri(b.logo), fav = uri(b.favicon);
    const css = [
      L ? `${sel}[data-theme="light"]{${L}}\n@media (prefers-color-scheme: light){ ${sel}:not([data-theme="dark"]){${L}} }` : "",
      D ? `${sel}[data-theme="dark"]{${D}}\n@media (prefers-color-scheme: dark){ ${sel}:not([data-theme="light"]){${D}} }` : "",
      // content:url replaces the imgs before app.js can set src; the wide
      // treatment keeps a wordmark from being squeezed into the 1:1 slot.
      logo ? `${sel} .logo img, ${sel} .login-card > img{content:url("${logo}")}` : "",
      (logo && b.logoWide) ? `${sel} .logo img{width:auto;height:34px} ${sel} .login-card > img{width:auto;height:56px}` : "",
      (b.hideOrgName === true) ? `${sel} .logo b{display:none}` : "",
    ].filter(Boolean).join("\n");
    if (css) {
      const tag = document.createElement("style");
      tag.id = "selfhostBootCss";
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    if (fav) {
      const l = document.createElement("link");
      l.rel = "icon"; l.href = fav;
      document.head.appendChild(l);
    }
  } catch { /* boot polish only — the body scripts brand authoritatively */ }
})();
