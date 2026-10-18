// ======================================================================
// T59 — 🧹 Entra device cleanup (BETA, Workspace 03 · Entra Tools).
// Ported from TUNO T25 (R36, builds 10532–10605) on Mihai's ask, 18 Oct
// 2026: "next port T25 from TUNO to the ENCA 03 Entra workspace". The
// logic is TUNO's, unchanged; the screen (app.js) is drawn with ENCA's own
// components — KPI tiles, a tab strip, the floating selection bar, the
// run ledger — the shape Mihai picked from the mockup.
//
// Stale directory devices, staged out in two deliberate steps: DISABLE at
// 30 days of silence, DELETE at 90 — and delete ONLY what is already
// disabled. A machine goes dark before it goes away, and the gap between
// the two is where somebody notices the laptop in the drawer still matters.
//
// THE READ is the ENTRA DEVICE OBJECT (/devices), not the Intune enrolment:
// approximateLastSignInDateTime is the directory's own "last time this
// device authenticated". Its name says APPROXIMATE and so does the screen.
// In ENCA the read needs no new scope — Directory.Read.All, held from
// sign-in, covers /devices.
//
// THE BUCKETS:
//   * active            — contact within the disable threshold
//   * stale, enabled    — no contact ≥ 30d: the DISABLE candidates. A 90d+
//                         enabled device is STILL only a disable candidate.
//   * disabled, waiting — disabled, not yet 90d silent: parked.
//   * delete candidates — ≥ 90d silent AND already disabled.
//   * never seen        — no approximateLastSignInDateTime at all. Unknown
//                         is NOT stale; its own bucket, no action offered.
//   * disabled          — every disabled device, whatever its bucket: the
//                         re-enable list (the way back, TUNO 10565).
//
// THE WRITES need Device.ReadWrite.All — NEW to ENCA at this build, asked
// for at the click that writes and added to New-EncaAppRegistration.ps1 in
// the same commit (one more admin consent per customer tenant, said here).
// CONSENT ALONE IS NOT ENOUGH: Graph gates device enable/disable/delete on
// the signed-in user's DIRECTORY ROLE (Cloud Device Administrator or Intune
// Administrator among them); a 403 after consent is explained as "who you
// are, not what ENCA may do".
//
// THE PIPELINE: every write is preceded by a FRESH per-device read and
// followed by a read-back. A device re-enabled after the read is REFUSED at
// delete (somebody wants it back); one that signed in since is SKIPPED at
// both (it woke up). Deletes require the word DELETE typed — a deleted
// device object takes its BitLocker recovery keys with it. Autopilot-
// registered devices are refused by Graph itself; the row says so in the
// tenant's words.
// ======================================================================
const DeviceCleanup = (() => {
  "use strict";

  const DEFAULTS = { disableDays: 30, deleteDays: 90 };
  const SELECT = "id,deviceId,displayName,operatingSystem,operatingSystemVersion,approximateLastSignInDateTime,accountEnabled,trustType,isManaged,profileType,registrationDateTime";
  const WRITE_SCOPE = "Device.ReadWrite.All";

  const daysSince = (iso, now) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return Math.floor(((now || Date.now()) - t) / 86400000);
  };

  // ENCA's Graph, wrapped so the tests can hand in their own. A device that is
  // gone answers 404; that is "gone", not a failure.
  const baseScopes = () => (typeof AUTH_CONFIG !== "undefined" ? AUTH_CONFIG.scopes : []);
  const graphIO = () => ({
    readAll: (url) => Graph.ggetAll(url, { scopes: baseScopes() }),
    read: async (url) => { try { return await Graph.gget(url, baseScopes()); } catch (e) { if (/\(404\)|ResourceNotFound|does not exist/i.test(String((e && e.message) || e))) return null; throw e; } },
    patch: (url, body) => Graph.gpatch(url, body, [...baseScopes(), WRITE_SCOPE]),
    del: (url) => Graph.gdelete(url, [...baseScopes(), WRITE_SCOPE]),
  });

  async function readDevices(io) {
    return (io || graphIO()).readAll(`/v1.0/devices?$select=${SELECT}&$top=999`);
  }

  // Every device lands in exactly one bucket; unknown is its own, actionless.
  function bucketize(devices, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const now = o.now || Date.now();
    const out = { active: [], stale: [], parked: [], deletable: [], unknown: [], thresholds: { disableDays: o.disableDays, deleteDays: o.deleteDays } };
    for (const d of devices || []) {
      const days = daysSince(d.approximateLastSignInDateTime, now);
      const row = { d, days };
      if (days === null) { out.unknown.push(row); continue; }
      if (days < o.disableDays) { out.active.push(row); continue; }
      if (d.accountEnabled === false) (days >= o.deleteDays ? out.deletable : out.parked).push(row);
      else out.stale.push(row);   // 90d+ enabled still lands HERE — disable first
    }
    const byDays = (a, b) => (b.days ?? -1) - (a.days ?? -1);
    out.stale.sort(byDays); out.deletable.sort(byDays); out.parked.sort(byDays);
    out.disabled = [...out.active, ...out.parked, ...out.deletable, ...out.unknown].filter((r) => r.d.accountEnabled === false).sort(byDays);
    return out;
  }

  // ---- apply: fresh per-device read, then the write, then the read-back --
  // ops: [{ kind: "disable"|"delete"|"enable", d, days }]
  // opts.ledger: ENCA's RunLedger (or nothing) — one row per op, Stop honoured
  // between rows; what goes in `results` is what the row says.
  async function apply(ops, opts) {
    const o = opts || {}, io = o.io || graphIO();
    const now = o.now || Date.now();
    const disableDays = (o.thresholds || DEFAULTS).disableDays;
    const L = o.ledger || null;
    const results = [];
    const out = (i, r) => {
      results.push(r);
      if (!L) return;
      if (r.outcome === "failed") L.fail(i, r.detail);
      else if (r.outcome === "skipped" || r.outcome === "refused") L.skip(i, r.detail, r.outcome);
      else L.done(i, r.detail, r.outcome);
    };
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (L && L.stopped) { out(i, { op, outcome: "skipped", detail: "stopped" }); continue; }
      const name = op.d.displayName || op.d.id, url = `/v1.0/devices/${op.d.id}`;
      try {
        o.onStatus && o.onStatus(`${name} — fresh read…`);
        if (L) L.start(i, "fresh read…");
        const fresh = await io.read(`${url}?$select=id,accountEnabled,approximateLastSignInDateTime`);
        if (!fresh) { out(i, { op, outcome: "skipped", detail: "gone from the directory since the read" }); continue; }
        if (op.kind === "enable") {
          // the way back: no wake-up check — a disabled device cannot sign in
          if (fresh.accountEnabled !== false) { out(i, { op, outcome: "skipped", detail: "already enabled" }); continue; }
          if (L) L.start(i, "re-enabling…");
          await io.patch(url, { accountEnabled: true });
          const back = await io.read(`${url}?$select=accountEnabled`);
          if (!back || back.accountEnabled !== true) throw new Error("the write went through but the read-back does not say enabled — check the portal");
          out(i, { op, outcome: "enabled", detail: "verified by read-back" });
          continue;
        }
        const freshDays = daysSince(fresh.approximateLastSignInDateTime, now);
        // it WOKE UP: a sign-in since the read withdraws every claim
        if (freshDays !== null && freshDays < disableDays) {
          out(i, { op, outcome: "skipped", detail: `signed in ${freshDays} day${freshDays === 1 ? "" : "s"} ago — the device woke up; the read's claim no longer holds` });
          continue;
        }
        if (op.kind === "disable") {
          if (fresh.accountEnabled === false) { out(i, { op, outcome: "skipped", detail: "already disabled" }); continue; }
          if (L) L.start(i, "disabling…");
          await io.patch(url, { accountEnabled: false });
          const back = await io.read(`${url}?$select=accountEnabled`);
          if (!back || back.accountEnabled !== false) throw new Error("the write went through but the read-back does not say disabled — check the portal");
          out(i, { op, outcome: "disabled", detail: "verified by read-back" });
        } else {
          // DELETE COMES AFTER DISABLE — a re-enabled device is somebody's decision
          if (fresh.accountEnabled !== false) { out(i, { op, outcome: "refused", detail: "not disabled any more — re-enabled since the read; somebody wants it back" }); continue; }
          if (L) L.start(i, "deleting…");
          await io.del(url);
          let still = null;
          try { still = await io.read(`${url}?$select=id`); } catch { still = null; }
          if (still) throw new Error("the delete returned but the device still reads back — check the portal");
          out(i, { op, outcome: "deleted", detail: "verified — the directory no longer returns it" });
        }
      } catch (e) {
        const msg = String((e && e.message) || e);
        out(i, { op, outcome: "failed", detail: /403|authoriz|forbidden/i.test(msg)
          ? `${msg} — if consent is in place, this is Graph's DIRECTORY-ROLE gate on device writes (Cloud Device Administrator or Intune Administrator): who you are, not what ENCA may do`
          : msg });
      }
    }
    return results;
  }

  // the buckets follow the read-backs: only a verified outcome moves a device
  function afterResults(devices, results) {
    let list = [...(devices || [])];
    for (const r of results || []) {
      const dev = list.find((x) => x.id === r.op.d.id);
      if (!dev) continue;
      if (r.outcome === "disabled") dev.accountEnabled = false;
      else if (r.outcome === "enabled") dev.accountEnabled = true;
      else if (r.outcome === "deleted") list = list.filter((x) => x.id !== dev.id);
    }
    return list;
  }

  // ---- the report: one Markdown, from the same state the screen renders ---
  function markdown(state) {
    const s = state || {}, b = s.buckets, L = [];
    const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const dev = (r) => `| ${cell(r.d.displayName || r.d.id)} | ${cell(r.d.operatingSystem || "—")} | ${r.days === null ? "never seen" : r.days + "d"} | ${r.d.accountEnabled === false ? "disabled" : "enabled"} | ${r.d.isManaged ? "managed" : ""} |`;
    const head = "| Device | OS | Last contact | State | Managed |\n|---|---|---|---|---|";
    L.push("# Entra stale-device cleanup", "");
    L.push(`Generated ${new Date(s.now || Date.now()).toISOString().replace("T", " ").replace(/\..*/, " UTC")} by ENCA${s.build ? ` ${s.build}` : ""}${s.tenant ? ` · ${s.tenant}` : ""}`, "");
    L.push(`Thresholds: disable after **${b.thresholds.disableDays} days** without contact, delete after **${b.thresholds.deleteDays}** — and only what is already disabled. Last contact is the directory's \`approximateLastSignInDateTime\`, which is approximate.`, "");
    L.push(`${b.active.length + b.stale.length + b.parked.length + b.deletable.length + b.unknown.length} devices: ${b.active.length} active · ${b.stale.length} stale and enabled (disable candidates) · ${b.parked.length} disabled and waiting · ${b.deletable.length} delete candidates · ${b.unknown.length} never seen.`, "");
    if (s.results && s.results.length) {
      L.push("## Actions taken", "");
      const done = (k, title) => { const rows = s.results.filter((r) => r.outcome === k); if (!rows.length) return; L.push(`### ${title} (${rows.length})`, "", head); rows.forEach((r) => L.push(dev(r.op))); L.push(""); };
      done("disabled", "Disabled"); done("enabled", "Re-enabled"); done("deleted", "Deleted");
      const nope = s.results.filter((r) => r.outcome === "skipped" || r.outcome === "refused" || r.outcome === "failed");
      if (nope.length) { L.push(`### Not done, and why (${nope.length})`, ""); nope.forEach((r) => L.push(`- **${cell(r.op.d.displayName || r.op.d.id)}** — ${r.outcome}: ${cell(r.detail)}`)); L.push(""); }
    }
    const section = (rows, title, note) => { L.push(`## ${title} (${rows.length})`, ""); if (note) L.push(note, ""); if (rows.length) { L.push(head); rows.forEach((r) => L.push(dev(r))); } L.push(""); };
    section(b.stale, "Stale and still enabled — disable candidates", "Enabled, no contact beyond the disable threshold. The rows past the delete threshold are STILL only disable candidates — delete follows disable, never replaces it.");
    section(b.deletable, "Disabled and silent beyond the delete threshold — delete candidates", "**Deleting a device object deletes its BitLocker recovery keys with it.** An Autopilot-registered device is refused by the service until it is removed from Autopilot.");
    section(b.parked, "Disabled, waiting out the delete threshold", null);
    section(b.disabled, "Every disabled device — re-enable candidates", "Disabling is reversible: any of these can be re-enabled, with a fresh read and a read-back, no threshold applied.");
    section(b.unknown, "Never seen — no action offered", "The directory returned no last sign-in. Unknown is not stale: acting on these would be a guess.");
    return L.join("\n");
  }

  // ---- demo: a small estate with every bucket in it -----------------------
  function demo(now) {
    const t = now || Date.now(), ago = (d) => new Date(t - d * 86400000 - 3600000).toISOString();
    const mk = (id, name, os, ver, days, enabled, extra) => Object.assign({ id, deviceId: `dev-${id}`, displayName: name, operatingSystem: os, operatingSystemVersion: ver, approximateLastSignInDateTime: days == null ? null : ago(days), accountEnabled: enabled, trustType: "AzureAd", isManaged: false, registrationDateTime: ago(400) }, extra || {});
    return [
      mk("d1", "LT-0101", "Windows", "10.0.26100", 1, true, { isManaged: true }),
      mk("d2", "LT-0102", "Windows", "10.0.26100", 3, true, { isManaged: true }),
      mk("d3", "MBP-0201", "MacMDM", "15.6", 6, true, { isManaged: true, trustType: "Workplace" }),
      mk("d4", "LT-0142", "Windows", "10.0.22631", 184, true, { isManaged: true }),
      mk("d5", "BYO-VM-Z1D0W6GRDR", "MacMDM", "15.6", 61, true, { trustType: "Workplace" }),
      mk("d6", "iPad-Reception", "iPadOS", "18.1", 33, true, { trustType: "Workplace" }),
      mk("d7", "LT-0077", "Windows", "10.0.19045", 45, false, { isManaged: true }),
      mk("d8", "LT-0031", "Windows", "10.0.19045", 140, false),
      mk("d9", "Android-0912", "Android", "14", 210, false, { trustType: "Workplace" }),
      mk("d10", "AP-PRESTAGED-01", "Windows", "10.0.26100", null, true, { profileType: "RegisteredDevice" }),
      mk("d11", "LT-0055", "Windows", "10.0.26100", 12, false),
    ];
  }

  return { DEFAULTS, SELECT, WRITE_SCOPE, daysSince, readDevices, bucketize, apply, afterResults, markdown, demo };
})();
if (typeof module !== "undefined" && module.exports) module.exports = DeviceCleanup;
