// ======================================================================
// App wiring.
// ======================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  let policies = [];          // view models
  let tenantName = "";
  let selected = new Set();
  let stateFilter = "all", query = "", docView = "cards", fmt = "png";
  let currentDoc = [];        // ids in the doc preview

  // ---------- helpers ----------
  function show(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $("toast"); t.innerHTML = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- list ----------
  function refreshList() {
    $("stateChips").innerHTML = Render.stateChips(policies, stateFilter);
    document.querySelector("#ptable tbody").innerHTML = Render.listRows(policies, selected, stateFilter, query);
    updateSelbar();
  }
  function updateSelbar() {
    const n = selected.size;
    $("selCount").textContent = n;
    $("selbar").classList.toggle("visible", n > 0);
    $("exportBtn").disabled = n === 0;
    $("selHint").textContent = n <= 1
      ? "Select one policy for PNG, multiple for a combined PDF"
      : "Multiple selected — will export as a combined PDF";
  }

  // ---------- doc preview ----------
  function openDoc(ids) {
    currentDoc = ids;
    const ps = ids.map(id => policies.find(p => p.id === id));
    $("cardsView").innerHTML = ps.map(p => Render.card(p, tenantName)).join("");
    $("mtable").innerHTML = Render.matrix(ps);
    $("docCount").textContent = `· ${ps.length} ${ps.length === 1 ? "policy" : "policies"}`;
    setDocView(docView);
    show("screen-doc");
  }
  function setDocView(v) {
    docView = v;
    $("cardsView").style.display = v === "cards" ? "grid" : "none";
    $("matrixView").style.display = v === "matrix" ? "block" : "none";
    $("segCards").classList.toggle("active", v === "cards");
    $("segMatrix").classList.toggle("active", v === "matrix");
  }

  // ---------- export ----------
  function openExport(ids) {
    currentExport = ids;
    fmt = ids.length > 1 ? "pdf" : "png";
    syncFmt();
    $("expDesc").textContent = ids.length > 1
      ? `${ids.length} policies selected — recommended export is a single combined PDF.`
      : "1 policy selected — recommended export is a PNG image.";
    $("exportModal").classList.add("open");
  }
  let currentExport = [];
  function syncFmt() {
    $("expOptPng").classList.toggle("sel", fmt === "png");
    $("expOptPdf").classList.toggle("sel", fmt === "pdf");
  }
  async function doExport() {
    $("exportModal").classList.remove("open");
    const ps = currentExport.map(id => policies.find(p => p.id === id));
    try {
      if (fmt === "png") {
        for (const p of ps) {
          toast(`Exporting <span>${p.seq}.png</span>…`);
          await Exporter.policyPng(p, tenantName);
        }
        toast("PNG export <span>done</span>");
      } else {
        await Exporter.policiesPdf(ps, tenantName, $("expMatrix").checked, (m) => toast(m));
        toast("PDF export <span>done</span>");
      }
    } catch (e) {
      console.error(e);
      toast("Export failed — see browser console");
    }
  }

  // ---------- data loading ----------
  async function loadFromGraph() {
    show("screen-loading");
    try {
      const { policies: raw, org, resolve, account } = await Graph.loadTenant((m) => $("loadStatus").textContent = m);
      tenantName = org?.displayName || account?.tenantId || "";
      raw.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      policies = raw.map((r, i) => buildViewModel(r, resolve, i));
      $("tenantName").textContent = tenantName;
      $("tenantUser").textContent = account?.username || "";
      $("avatar").textContent = (account?.name || account?.username || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      $("tenantBox").style.display = "flex";
      selected = new Set();
      refreshList();
      show("screen-list");
      toast(`Signed in to <span>${tenantName}</span> — ${policies.length} Conditional Access policies loaded`);
    } catch (e) {
      console.error(e);
      alert("Could not load policies: " + e.message + "\n\nCheck that admin consent was granted for Policy.Read.All and Directory.Read.All.");
      show("screen-login");
    }
  }

  function loadDemo() {
    tenantName = DEMO_DATA.tenantName;
    const resolve = (id, map) => (map && map[id]) || DEMO_DATA.names[id] || id;
    policies = DEMO_DATA.policies.map((r, i) => buildViewModel(r, resolve, i));
    $("tenantName").textContent = tenantName;
    $("tenantUser").textContent = "demo@contoso.onmicrosoft.com";
    $("avatar").textContent = "DM";
    $("tenantBox").style.display = "flex";
    refreshList();
    show("screen-list");
    toast(`Demo mode — <span>${policies.length}</span> sample policies loaded`);
  }

  // ---------- events ----------
  $("signInBtn").addEventListener("click", async () => {
    if (AUTH_CONFIG.clientId.startsWith("00000000")) {
      alert("No clientId configured yet in js/authConfig.js — see README.md step 1.\nUse the demo link below to preview the app.");
      return;
    }
    try { await Graph.signIn(); await loadFromGraph(); }
    catch (e) { if (e.errorCode !== "user_cancelled") { console.error(e); toast("Sign-in failed"); } }
  });
  $("signOutBtn").addEventListener("click", () => {
    $("tenantBox").style.display = "none";
    policies = []; selected.clear();
    Graph.signOut?.();
    show("screen-login");
  });

  $("searchBox").addEventListener("input", (e) => { query = e.target.value.toLowerCase(); refreshList(); });
  $("stateChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-state]"); if (!b) return;
    stateFilter = b.dataset.state; refreshList();
  });
  document.querySelector("#ptable tbody").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) { openDoc([open.dataset.open]); return; }
  });
  document.querySelector("#ptable tbody").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-sel]"); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    updateSelbar();
  });
  $("selAll").addEventListener("change", (e) => {
    document.querySelectorAll("#ptable tbody [data-sel]").forEach(cb => {
      cb.checked = e.target.checked;
      e.target.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    });
    updateSelbar();
  });
  $("clearSelBtn").addEventListener("click", () => { selected.clear(); refreshList(); $("selAll").checked = false; });
  $("docSelBtn").addEventListener("click", () => openDoc([...selected]));
  $("docAllBtn").addEventListener("click", () => openDoc(policies.map(p => p.id)));
  $("backBtn").addEventListener("click", () => show("screen-list"));
  $("segCards").addEventListener("click", () => setDocView("cards"));
  $("segMatrix").addEventListener("click", () => setDocView("matrix"));

  $("exportBtn").addEventListener("click", () => openExport([...selected]));
  $("exportBtn2").addEventListener("click", () => openExport(currentDoc));
  $("expOptPng").addEventListener("click", () => { fmt = "png"; syncFmt(); });
  $("expOptPdf").addEventListener("click", () => { fmt = "pdf"; syncFmt(); });
  $("expCancel").addEventListener("click", () => $("exportModal").classList.remove("open"));
  $("expGo").addEventListener("click", doExport);
  $("cardsView").addEventListener("click", (e) => {
    const b = e.target.closest("[data-png]"); if (!b) return;
    const p = policies.find(x => x.id === b.dataset.png);
    toast(`Exporting <span>${p.seq}.png</span>…`);
    Exporter.policyPng(p, tenantName).catch(err => { console.error(err); toast("Export failed"); });
  });

  // ---------- boot ----------
  Graph.init().then(() => {
    if (new URLSearchParams(location.search).get("demo")) loadDemo();
  }).catch(e => console.error("MSAL init failed", e));
})();
