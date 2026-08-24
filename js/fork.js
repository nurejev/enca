// ======================================================================
// R15 — fork detection and update-from-upstream.
//
// A high-assurance tenant is encouraged to fork, review and serve its own
// pinned copy — and the moment it does, it stops hearing about fixes. This
// file makes that state impossible to miss: when the app is running
// somewhere that is not the canonical host AND its build is older than
// what the canonical host serves, a strip under the header says "you are
// N builds behind", and clicking it lists what those builds changed with
// the commands to update.
//
// What it deliberately does NOT do:
//   · Auto-update. That would defeat the reason for forking — the point of
//     a pinned, reviewed copy is that nothing changes without a review.
//   · Run on the canonical host (nothing to compare against — it IS
//     upstream) or on the beta channel (a five-digit beta build is AHEAD
//     of production, not behind it; the two series do not compare).
//   · Guess. If the upstream fetch fails — offline, an air-gapped network,
//     a CSP that removed the connect-src entry — it says nothing rather
//     than something wrong. One console.info line records the attempt.
//
// The check reads two files from upstream and parses them as TEXT with
// regexes pinned to the literal layout of version.js and changelog.js —
// never as code. Both files carry ONE `build:` / `title:` shape and the
// plain-text discipline (tools/check-plain-text.js) keeps titles quotable.
//
// UPSTREAM is hard-coded on purpose: a rebranded fork changes
// BRANDING.host to its own name, and the one host its copy should compare
// itself against is still this repository's. connect-src in index.html
// names it for the same reason.
// ======================================================================
(() => {
  "use strict";
  const UPSTREAM = "https://enca.limon-it.nl";
  const UPSTREAM_HOST = "enca.limon-it.nl";
  const SEEN_KEY = "enca-fork-seen";   // upstream build already dismissed

  const here = (location.hostname || "").toLowerCase();
  if (!here || here === UPSTREAM_HOST) return;                 // we ARE upstream
  if (typeof APP_BUILD === "undefined") return;
  if (APP_BUILD.build >= 10000) return;                        // beta series — its own channel

  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const ver = (b) => `v1.0.${b}`;

  // The titles of every release between here and upstream, newest first —
  // parsed from upstream's changelog.js text. The regex is pinned to the
  // one shape every release object opens with.
  function parseTitles(text, from, to) {
    const out = [];
    const re = /build:\s*(\d+),\s*date:\s*"([^"]*)",\s*title:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(text))) {
      const b = Number(m[1]);
      if (b > from && b <= to && b < 10000) {
        let t = m[3];
        // The escapes in the source are JSON-shaped (\" \\ \uNNNN); if one
        // ever is not, keep the raw text rather than losing the whole list.
        try { t = JSON.parse(`"${m[3]}"`); } catch { /* raw is readable enough */ }
        out.push({ build: b, date: m[2], title: t });
      }
    }
    out.sort((a, b) => b.build - a.build);
    return out;
  }

  function showStrip(upBuild, upDate, titles) {
    if (document.getElementById("forkStrip")) return;
    // Counted from the build numbers, not the parsed titles: production
    // builds are consecutive integers, so the arithmetic is right even when
    // the changelog fetch failed and `titles` holds only a placeholder.
    const behind = upBuild - APP_BUILD.build;
    const strip = document.createElement("div");
    strip.id = "forkStrip";
    strip.style.cssText = "background:var(--soft,#eee);border-bottom:1px solid var(--border,#ccc);" +
      "color:var(--ink,#222);font:600 13px/1.4 Inter,system-ui,sans-serif;padding:8px 18px;" +
      "display:flex;align-items:center;gap:12px;flex-wrap:wrap";
    strip.innerHTML =
      `<span>🍴 This copy is <b>${behind} build${behind === 1 ? "" : "s"} behind</b> upstream — ` +
      `${esc(ver(APP_BUILD.build))} here, ${esc(ver(upBuild))} on ${esc(UPSTREAM_HOST)} (${esc(upDate || "")}).</span>` +
      `<button class="btn" id="forkStripWhat" style="font-size:12px;padding:4px 10px">See what changed</button>` +
      `<button class="btn" id="forkStripHide" style="font-size:12px;padding:4px 10px" title="Hide until upstream moves again">Dismiss</button>`;
    const header = document.querySelector("header");
    (header && header.parentNode) ? header.parentNode.insertBefore(strip, header.nextSibling) : document.body.prepend(strip);

    strip.querySelector("#forkStripHide").addEventListener("click", () => {
      try { localStorage.setItem(SEEN_KEY, String(upBuild)); } catch { /* private mode */ }
      strip.remove();
    });
    strip.querySelector("#forkStripWhat").addEventListener("click", () => openModal(upBuild, titles));
  }

  function openModal(upBuild, titles) {
    let bg = document.getElementById("forkModal");
    if (bg) { bg.classList.add("open"); return; }
    bg = document.createElement("div");
    bg.id = "forkModal";
    bg.className = "modal-bg open";
    const rows = titles.map((t) =>
      `<li style="margin:0 0 8px"><b>${esc(ver(t.build))}</b> <span class="mini">(${esc(t.date)})</span> — ${esc(t.title)}</li>`).join("");
    bg.innerHTML = `<div class="modal" style="max-width:640px">
      <h3>🍴 ${esc(String(upBuild - APP_BUILD.build))} build${upBuild - APP_BUILD.build === 1 ? "" : "s"} between this copy and upstream</h3>
      <p class="mini">This deployment serves ${esc(ver(APP_BUILD.build))}; ${esc(UPSTREAM_HOST)} serves ${esc(ver(upBuild))}. Each line is one release's headline — the full detail is in 📋 What's new on the upstream site.</p>
      <ul style="list-style:none;margin:0 0 16px;padding:0;max-height:40vh;overflow:auto">${rows}</ul>
      <p class="mini" style="margin:0 0 6px"><b>To update a Docker instance</b> — pull and recreate:</p>
      <pre class="mini" style="background:var(--soft);padding:10px;border-radius:8px;overflow:auto">docker pull ghcr.io/nurejev/enca:latest
docker rm -f enca   # then the same docker run / compose up -d as before</pre>
      <p class="mini" style="margin:10px 0 6px"><b>To update a reviewed fork</b> — pull upstream in and re-review the diff, deliberately by hand:</p>
      <pre class="mini" style="background:var(--soft);padding:10px;border-radius:8px;overflow:auto">git remote add upstream https://github.com/nurejev/enca.git   # once
git fetch upstream
git diff HEAD upstream/main   # the review is the point
git merge upstream/main</pre>
      <div class="modal-foot"><button class="btn" id="forkModalClose">Close</button></div>
    </div>`;
    document.body.appendChild(bg);
    bg.querySelector("#forkModalClose").addEventListener("click", () => bg.classList.remove("open"));
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.classList.remove("open"); });
  }

  async function check() {
    let vText;
    try {
      const r = await fetch(`${UPSTREAM}/js/version.js?fork-check=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      vText = await r.text();
    } catch (e) {
      console.info(`fork check: could not read upstream ${UPSTREAM_HOST} (${e && e.message}) — saying nothing rather than guessing.`);
      return;
    }
    const m = /\bbuild:\s*(\d+)/.exec(vText);
    const d = /\bdate:\s*"([^"]*)"/.exec(vText);
    if (!m) { console.info("fork check: upstream version.js did not parse — its layout may have changed."); return; }
    const upBuild = Number(m[1]);
    if (upBuild >= 10000 || upBuild <= APP_BUILD.build) return;  // up to date (or upstream unexpectedly beta)

    let seen = 0;
    try { seen = Number(localStorage.getItem(SEEN_KEY) || 0); } catch { /* private mode */ }
    if (seen >= upBuild) return;                                 // dismissed until upstream moves

    let titles = [];
    try {
      const r = await fetch(`${UPSTREAM}/js/changelog.js?fork-check=${Date.now()}`, { cache: "no-store" });
      if (r.ok) titles = parseTitles(await r.text(), APP_BUILD.build, upBuild);
    } catch { /* strip still shows the count from the build numbers */ }
    if (!titles.length) titles = [{ build: upBuild, date: d ? d[1] : "", title: "Details unavailable — see What's new on the upstream site." }];

    const go = () => showStrip(upBuild, d ? d[1] : "", titles);
    (document.readyState === "loading") ? document.addEventListener("DOMContentLoaded", go) : go();
  }

  check();
})();
