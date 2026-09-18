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
// Two sources, because a browser that has never been here has no cache:
//   · window.ENCA_BRAND_BOOT — the deployment's own branding file, written
//     into the top of THIS FILE at container start by
//     selfhost/docker-entrypoint.sh (build 25389). It is what makes the
//     FIRST visit branded: the fetch below cannot finish before the page
//     paints, and on Azure Container Apps a cold start sits in front of it,
//     so a first-time visitor read the image's own look for a moment
//     (Dovilo, 18 Sep). A deployment that mounts the file gets the same
//     treatment; a static host with no entrypoint has no block and behaves
//     exactly as it did before.
//   · localStorage — what the ⚙ gear applied in this browser, and the cache
//     js/selfhost.js keeps of the last fetched file.
// js/selfhost.js still fetches /selfhost-branding.json and repaints through
// applyBranding(), so a file changed since the container started wins on
// this load, and the block is right again after the next restart.
//
// What comes from localStorage was sanitised by cleanBrand (js/selfhost.js)
// before it was stored; the injected block is the deployment file itself,
// escaped as a JSON string so it cannot be code. Either way the guards here
// are what decide what is used: colour values are charset-checked, images
// must be data: URIs, and nothing reaches the DOM as markup.
// applyBranding() removes the injected tag when it takes over, so this can
// never fight the real branding code.
//
// Kept dependency-free on purpose: it runs before BRANDING exists.
// ======================================================================
(() => {
  "use strict";
  try {
    const read = (k) => {
      try { const j = JSON.parse(localStorage.getItem(k) || "null"); return (j && j.brand) || null; } catch { return null; }
    };
    // The deployment's file as the container start wrote it into this file.
    const injected = (() => {
      try {
        const raw = window.ENCA_BRAND_BOOT;
        if (typeof raw !== "string" || !raw) return null;
        const j = JSON.parse(raw);
        const brand = (j && j.brand) || j;
        return brand && typeof brand === "object" ? brand : null;
      } catch { return null; }
    })();
    // The admin's own Apply beats the deployment, which beats this browser's
    // cache of an older read of it — the precedence js/selfhost.js registers
    // (localBrand || deploymentBrand).
    const b = read("enca-selfhost-brand") || injected || read("enca-selfhost-brand-cache");
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
