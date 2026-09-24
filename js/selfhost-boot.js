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
      // The words (build 32310). The logo is swapped above, but the markup's
      // own org name, footer text and sign-in text are Limon-IT's, and the
      // body is long enough to paint before the scripts at its end arrive -
      // so a hard refresh of a branded copy flashed "Limon-IT" beside the
      // right logo (Dovilo, 24 Sep). They are held invisible (space kept, no
      // jump) until applyBranding() writes the real text and removes this tag.
      (b.org || b.orgUrl || b.loginBlurb || b.loginTitle || b.name)
        ? `${sel} #brandOrg, ${sel} #brandOrgLink, ${sel} #brandFoot, ${sel} #brandLoginTitle, ${sel} #brandLoginBlurb, ${sel} #brandTag{visibility:hidden}` : "",
    ].filter(Boolean).join("\n");
    // <title> is parsed before this file runs; its last part is the
    // organisation (Brand.pageTitle's order), so put the right one there now.
    try {
      const org = typeof b.org === "string" && b.org.length <= 300 ? b.org : "";
      if (org && document.title && document.title.includes(" · ")) {
        const parts = document.title.split(" · "); parts[parts.length - 1] = org; document.title = parts.join(" · ");
      }
    } catch { /* app.js sets the title anyway */ }
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
    // content:url() PAINTS OVER an <img>; it does not stop the element from
    // loading the src the markup gave it. Measured on a branded deployment,
    // the login mark still fetched and decoded assets/logo-mark-light.svg —
    // currentSrc and naturalWidth both said so — so on a cold start the
    // product's own logo can reach the screen before the replacement is ready
    // (Dovilo, 18 Sep, Chrome), and an engine that does not honour content on
    // a replaced element never replaces it at all. Setting the src is what
    // makes the wrong mark never be the element's image in the first place.
    //
    // A MutationObserver started here sees each <img> the moment the parser
    // creates it — the body has not been parsed yet when this file runs — so
    // the branded src is in place before the element can be painted. The CSS
    // rule above stays as the belt to this pair of braces: neither mechanism
    // is sufficient in every engine, and they cannot disagree, because both
    // carry the same value.
    // Its own try, and after everything else that must happen: this half is
    // the newest and the most dependent on the environment, and a browser
    // without MutationObserver used to take the favicon down with it.
    try {
    if (logo && typeof MutationObserver === "function" && document.addEventListener) {
      const SEL = ".logo img, .login-card > img";
      const paint = (el) => {
        if (!el || el.tagName !== "IMG" || el.dataset.shBoot === "1") return;
        el.dataset.shBoot = "1";
        el.src = logo;
        if (b.org || b.name) el.alt = String(b.org || b.name).slice(0, 120);
        if (b.logoWide === true) { el.style.width = "auto"; el.style.height = el.id === "brandLogo" ? "34px" : "56px"; const de = document.documentElement; if (de && de.classList) de.classList.add("brand-wide-logo"); }
      };
      const scan = (n) => {
        if (!n || n.nodeType !== 1) return;
        if (n.matches && n.matches(SEL)) paint(n);
        if (n.querySelectorAll) n.querySelectorAll(SEL).forEach(paint);
      };
      const mo = new MutationObserver((recs) => { recs.forEach((r) => r.addedNodes.forEach(scan)); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Belt for the braces: a parser chunk the observer somehow missed is
      // caught here, and the observer is let go the moment it can stop.
      document.addEventListener("DOMContentLoaded", () => { scan(document.body); mo.disconnect(); }, { once: true });
    }
    } catch { /* the CSS rule above still covers this in most engines */ }
  } catch { /* boot polish only — the body scripts brand authoritatively */ }
})();
