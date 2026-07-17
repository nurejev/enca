// ======================================================================
// Export: PNG (single card) and combined PDF (cover + cards + matrix).
// Cards are rendered off-screen at a fixed 1100px width for consistency.
// ======================================================================
const Exporter = (() => {
  const A4 = { w: 297, h: 210 }; // landscape, mm
  const MARGIN = 10;

  function stage(html) {
    const el = document.createElement("div");
    el.className = "export-stage";
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  async function nodeToPng(node) {
    // skipFonts: system font stack, no @font-face to embed (avoids CSS fetches)
    const opts = { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true };
    // double render works around fonts/images not ready on first pass
    await htmlToImage.toPng(node, opts);
    return htmlToImage.toPng(node, opts);
  }

  // For PDF pages: JPEG at lower pixel ratio — many pages of full-res PNG can
  // exceed the JS string limit ("Invalid string length") when jsPDF assembles
  // the document. JPEG keeps each page ~5-10x smaller at equal readability.
  async function nodeToJpeg(node) {
    const opts = { pixelRatio: 1.5, backgroundColor: "#ffffff", skipFonts: true, quality: 0.9 };
    await htmlToImage.toJpeg(node, opts);
    return htmlToImage.toJpeg(node, opts);
  }

  function download(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename; a.click();
  }

  const safe = (s) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60);

  async function loadImg(src) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    return img;
  }

  async function policyPng(p, tenantName, logo) {
    const st = stage(Render.card(p, tenantName, { export: true, logo }));
    try {
      const url = await nodeToPng(st.firstElementChild);
      download(url, `${p.seq}-${safe(p.name)}.png`);
    } finally { st.remove(); }
  }

  // Neutral cover: no Limon-IT branding; tenant branding logo when available.
  async function addCover(pdf, tenantName, count, logo) {
    pdf.setFillColor(31, 41, 51);
    pdf.rect(0, 0, A4.w, A4.h, "F");
    pdf.setFillColor(50, 63, 75);
    pdf.rect(0, A4.h - 40, A4.w, 40, "F");
    if (logo) {
      try {
        const img = await loadImg(logo);
        const w = 55, h = w * img.height / img.width;
        pdf.addImage(logo, "PNG", MARGIN, 26, w, Math.min(h, 28));
      } catch {}
    }
    pdf.setDrawColor(129, 156, 178); pdf.setLineWidth(1);
    pdf.line(MARGIN, 96, 110, 96);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(30); pdf.setFont("helvetica", "bold");
    pdf.text("Conditional Access", MARGIN, 70);
    pdf.text("Documentation", MARGIN, 84);
    pdf.setFontSize(13); pdf.setFont("helvetica", "normal");
    pdf.setTextColor(200, 209, 217);
    pdf.text(`${tenantName || "Tenant"}  ·  ${count} policies  ·  ${new Date().toISOString().slice(0, 10)}`, MARGIN, 110);
    pdf.setFontSize(10);
    pdf.text(`Generated ${new Date().toISOString().slice(0, 10)}`, MARGIN, A4.h - 18);
  }

  async function addImagePaged(pdf, node) {
    // renders node and adds it, slicing vertically over multiple pages if needed
    const url = await nodeToJpeg(node);
    const img = await loadImg(url);
    if (!img.width || !img.height) throw new Error("rendered image is empty");
    const availW = A4.w - MARGIN * 2, availH = A4.h - MARGIN * 2;
    const scale = availW / img.width;
    const totalH = img.height * scale;
    if (totalH <= availH) {
      pdf.addImage(url, "JPEG", MARGIN, MARGIN, availW, totalH);
      return;
    }
    // slice
    const sliceHpx = availH / scale;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    const ctx = canvas.getContext("2d");
    let y = 0, first = true;
    while (y < img.height) {
      const h = Math.ceil(Math.min(sliceHpx, img.height - y));
      canvas.height = h;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, h);
      ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
      if (!first) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", MARGIN, MARGIN, availW, h * scale);
      y += h; first = false;
    }
  }

  async function policiesPdf(policies, tenantName, includeMatrix, onProgress, logo) {
    const pdf = new jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    await addCover(pdf, tenantName, policies.length, logo);

    const failed = [];
    let lastGroup = null;
    for (let i = 0; i < policies.length; i++) {
      // persona divider page when entering a new CA number range
      const g = Render.caGroup(policies[i].name);
      if (g.label !== lastGroup) {
        lastGroup = g.label;
        pdf.addPage();
        pdf.setFillColor(241, 242, 248); pdf.rect(0, 0, A4.w, A4.h, "F");
        pdf.setFillColor(50, 63, 75); pdf.rect(0, 90, A4.w, 26, "F");
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(22); pdf.setFont("helvetica", "bold");
        pdf.text(g.label, MARGIN, 107);
        pdf.setFont("helvetica", "normal");
      }
      onProgress?.(`Rendering ${policies[i].seq} (${i + 1}/${policies.length})…`);
      const st = stage(Render.card(policies[i], tenantName, { export: true, logo }));
      try {
        pdf.addPage();
        await addImagePaged(pdf, st.firstElementChild);
        pdf.setFontSize(8); pdf.setTextColor(120, 130, 140);
        pdf.text(`${policies[i].seq} — ${policies[i].name}`.slice(0, 120), MARGIN, A4.h - 4);
      } catch (e) {
        // keep going: note the failure on the page instead of aborting the whole PDF
        console.error(`PDF: rendering ${policies[i].seq} failed`, e);
        failed.push(policies[i].seq);
        pdf.setFontSize(12); pdf.setTextColor(176, 74, 58);
        pdf.text(`${policies[i].seq} — ${policies[i].name}\n\nCould not render this policy card (${e.message || e}).`, MARGIN, 30);
      } finally { st.remove(); }
    }
    if (failed.length === policies.length) throw new Error("all policy cards failed to render: " + (failed.join(", ")));

    if (includeMatrix) {
      onProgress?.("Rendering settings matrix…");
      const st = stage(`<div class="matrix-wrap" style="width:2000px"><table class="matrix">${Render.matrix(policies, { full: true })}</table></div>`);
      st.style.width = "2000px";
      try {
        pdf.addPage();
        await addImagePaged(pdf, st.firstElementChild);
      } catch (e) { console.error("PDF: matrix appendix failed", e); }
      finally { st.remove(); }
    }
    if (failed.length) onProgress?.(`Done with ${failed.length} card(s) skipped: ${failed.join(", ")}`);

    pdf.save(`ConditionalAccess-${safe(tenantName || "tenant")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ---------- bulk PNG bundle (.zip): every card as a separate high-res PNG ----------
  async function policiesZip(policies, tenantName, logo, onProgress) {
    const zip = new JSZip();
    for (let i = 0; i < policies.length; i++) {
      onProgress?.(`Rendering ${policies[i].seq} (${i + 1}/${policies.length})…`);
      const st = stage(Render.card(policies[i], tenantName, { export: true, logo }));
      try {
        const url = await nodeToPng(st.firstElementChild);
        const folder = safe(Render.caGroup(policies[i].name).label); // persona folder per CA range
        zip.file(`${folder}/${policies[i].seq}-${safe(policies[i].name)}.png`, url.split(",")[1], { base64: true });
      } catch (e) { console.error(`ZIP: ${policies[i].seq} failed`, e); }
      finally { st.remove(); }
    }
    onProgress?.("Building zip…");
    const blob = await zip.generateAsync({ type: "blob" });
    download(URL.createObjectURL(blob), `ConditionalAccess-${safe(tenantName || "tenant")}-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  // ---------- JSON backup (.zip): raw policy definitions, one file per policy ----------
  // opts.groups: raw Graph group objects → written to Groups/<displayName>.json
  // plus a MigrationTable.json ({TenantId, Objects:[{DisplayName,Id,Type}]}),
  // matching the established group-export format.
  async function policiesJson(policies, tenantName, opts = {}) {
    const zip = new JSZip();
    const all = [];
    for (const p of policies) {
      const folder = safe(Render.caGroup(p.name).label);
      zip.file(`${folder}/${p.seq}-${safe(p.name)}.json`, JSON.stringify(p.raw, null, 2));
      all.push(p.raw);
    }
    zip.file("all-policies.json", JSON.stringify(all, null, 2));
    // dependencies: each category in its own folder, all listed in MigrationTable.json
    const DEP_FOLDERS = {
      groups: ["Groups", "Group"],
      authStrengths: ["AuthenticationStrengths", "AuthenticationStrength"],
      namedLocations: ["NamedLocations", "NamedLocation"],
      authContexts: ["AuthenticationContexts", "AuthenticationContext"],
      termsOfUse: ["TermsOfUse", "Agreement"],
    };
    const migrationObjects = [];
    for (const [key, [folder, type]] of Object.entries(DEP_FOLDERS)) {
      for (const obj of (opts[key] || [])) {
        zip.file(`${folder}/${safe(obj.displayName || obj.id)}.json`, JSON.stringify(obj, null, 2));
        migrationObjects.push({ DisplayName: obj.displayName || "", Id: obj.id, Type: type });
      }
    }
    if (migrationObjects.length) {
      zip.file("MigrationTable.json", JSON.stringify({ TenantId: opts.tenantId || "", Objects: migrationObjects }, null, 2));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    // date + time stamp (yyyy-MM-dd-HHmmss) so re-runs never overwrite a previous backup
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    download(URL.createObjectURL(blob), `ConditionalAccess-JSON-${safe(tenantName || "tenant")}-${stamp}.zip`);
    return policies.length;
  }

  // ---------- Word document (.docx): one card image per page ----------
  const EMU_PER_PX = 9525; // 96 dpi
  const xesc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function buildDocx(images, title) {
    // images: [{ name, base64, wPx, hPx }] — wPx/hPx are CSS pixels (already /pixelRatio)
    const usableEmu = Math.round(10.69 * 914400); // A4 landscape minus 0.5" margins
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    const rels = [], body = [];
    let imgN = 0;
    images.forEach((img) => {
      if (img.heading) { // persona group heading
        body.push(`<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${xesc(img.heading)}</w:t></w:r></w:p>`);
        return;
      }
      const i = imgN++;
      const rid = `rIdImg${i + 1}`;
      zip.file(`word/media/image${i + 1}.png`, img.base64, { base64: true });
      rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`);
      let cx = img.wPx * EMU_PER_PX, cy = img.hPx * EMU_PER_PX;
      if (cx > usableEmu) { cy = Math.round(cy * usableEmu / cx); cx = usableEmu; }
      body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i + 1}" name="${xesc(img.name)}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${i + 1}" name="${xesc(img.name)}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    });
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:r><w:t>${xesc(title)}</w:t></w:r></w:p>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body></w:document>`);
    return zip;
  }

  async function policiesDocx(policies, tenantName, logo, onProgress) {
    const images = [];
    let lastGroup = null;
    for (let i = 0; i < policies.length; i++) {
      const g = Render.caGroup(policies[i].name);
      if (g.label !== lastGroup) { lastGroup = g.label; images.push({ heading: g.label }); }
      onProgress?.(`Rendering ${policies[i].seq} (${i + 1}/${policies.length})…`);
      const st = stage(Render.card(policies[i], tenantName, { export: true, logo }));
      try {
        const url = await nodeToPng(st.firstElementChild);
        const img = await loadImg(url);
        images.push({ name: `${policies[i].seq} — ${policies[i].name}`, base64: url.split(",")[1], wPx: img.width / 2, hPx: img.height / 2 });
      } catch (e) { console.error(`DOCX: ${policies[i].seq} failed`, e); }
      finally { st.remove(); }
    }
    if (!images.some(x => x.base64)) throw new Error("no policy cards could be rendered");
    onProgress?.("Building Word document…");
    const zip = buildDocx(images, `Conditional Access documentation — ${tenantName || "tenant"} — ${new Date().toISOString().slice(0, 10)}`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    download(URL.createObjectURL(blob), `ConditionalAccess-${safe(tenantName || "tenant")}-${new Date().toISOString().slice(0, 10)}.docx`);
  }

  return { policyPng, policiesPdf, policiesZip, policiesDocx, policiesJson, buildDocx };
})();
