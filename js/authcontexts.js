// ======================================================================
// Authentication contexts — view, create, edit, publish and delete the
// Conditional Access authentication context class references (c1–c99).
//   https://learn.microsoft.com/graph/api/resources/authenticationcontextclassreference
//
// An authentication context is a named step-up requirement: an app (or a
// Protected Action, or a Purview label) asks for "c1", and Conditional
// Access enforces whatever policy is scoped to c1. The id is the contract —
// it is what apps request and what the ACRS claim carries — so an id can be
// renamed and republished, but never changed.
//
// Lifecycle rules Graph enforces (and this tool surfaces up front):
//   - create/update is an UPSERT: PATCH …/authenticationContextClassReferences/{id}
//   - only an UNPUBLISHED (isAvailable=false) context can be deleted (403)
//   - a context referenced by a CA policy cannot be deleted at all (400)
// Writes need Policy.ReadWrite.ConditionalAccess — the scope ENCA already
// uses for every other CA write.
// ======================================================================
const AuthContexts = (() => {
  // The portal exposes c1–c99. c1–c25 is the classically documented range —
  // shown first, the rest behind the same picker.
  const SLOT_MAX = 99;
  const allSlots = () => Array.from({ length: SLOT_MAX }, (_, i) => `c${i + 1}`);
  const validId = (id) => /^c([1-9]|[1-9][0-9])$/.test(String(id || "")) && Number(String(id).slice(1)) <= SLOT_MAX;
  // numeric sort: c2 before c10
  const slotNum = (id) => Number(String(id || "c0").slice(1)) || 0;
  const sortById = (a, b) => slotNum(a.id) - slotNum(b.id);

  // ---- policy usage ----------------------------------------------------
  // A policy consumes a context through
  // conditions.applications.includeAuthenticationContextClassReferences.
  // Returns [{id,name,state}]
  function usedBy(ctxId, raws) {
    return (raws || []).filter((p) =>
      ((p.conditions?.applications?.includeAuthenticationContextClassReferences) || []).includes(ctxId))
      .map((p) => ({ id: p.id, name: p.displayName, state: p.state }));
  }

  function freeSlots(list) {
    const taken = new Set((list || []).map((c) => c.id));
    return allSlots().filter((id) => !taken.has(id));
  }

  function summarize(list, raws) {
    const l = list || [];
    return {
      total: l.length,
      published: l.filter((c) => c.isAvailable).length,
      unpublished: l.filter((c) => !c.isAvailable).length,
      inUse: l.filter((c) => usedBy(c.id, raws).length > 0).length,
      unused: l.filter((c) => usedBy(c.id, raws).length === 0).length,
      free: SLOT_MAX - l.length,
    };
  }

  // Deletability per Graph's rules — the UI disables what Graph would refuse.
  function deletable(c, raws) {
    if (c.isAvailable) return { ok: false, why: "published — unpublish it first (Graph refuses to delete a published context)" };
    const used = usedBy(c.id, raws);
    if (used.length) return { ok: false, why: `referenced by ${used.length} Conditional Access polic${used.length === 1 ? "y" : "ies"} — remove it from the policy first` };
    return { ok: true, why: "" };
  }

  // Validate the editor form; returns { ok, errors[], payload }
  function buildPayload(form) {
    const errors = [];
    const id = String(form.id || "").trim().toLowerCase();
    const name = String(form.name || "").trim();
    if (!validId(id)) errors.push(`The id must be c1–c${SLOT_MAX}.`);
    if (!name) errors.push("A display name is required.");
    if (name.length > 30) errors.push("Keep the display name at 30 characters or less — the portal truncates longer names in the selection UX.");
    if (String(form.description || "").length > 500) errors.push("The description is too long (max 500 characters).");
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors, id, payload: {
      displayName: name,
      description: String(form.description || "").trim(),
      isAvailable: !!form.isAvailable,
    } };
  }

  function toForm(c) {
    if (!c) return { id: "", name: "", description: "", isAvailable: false };
    return { id: c.id, name: c.displayName || "", description: c.description || "", isAvailable: !!c.isAvailable };
  }

  function diff(orig, payload) {
    if (!orig) return ["created"];
    const out = [];
    if ((orig.displayName || "") !== payload.displayName) out.push(`name: ${orig.displayName || "—"} → ${payload.displayName}`);
    if ((orig.description || "") !== (payload.description || "")) out.push("description changed");
    if (!!orig.isAvailable !== !!payload.isAvailable) out.push(payload.isAvailable ? "published" : "unpublished");
    return out;
  }

  // ---- Markdown export -------------------------------------------------
  function toMd(list, raws, meta = {}) {
    const s = summarize(list, raws);
    const L = [`# Authentication contexts — ${meta.tenantName || "tenant"}`, "",
      Brand.generatedBy(), "",
      `- Defined: **${s.total}** of ${SLOT_MAX} slots (${s.free} free)`,
      `- Published: **${s.published}** · unpublished: ${s.unpublished}`,
      `- Referenced by a CA policy: **${s.inUse}** · unreferenced: ${s.unused}`, "",
      "| Id | Name | Published | Used by | Description |",
      "|----|------|-----------|---------|-------------|"];
    const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    for (const c of (list || []).slice().sort(sortById)) {
      const used = usedBy(c.id, raws);
      L.push(`| ${c.id} | ${mdEsc(c.displayName)} | ${c.isAvailable ? "yes" : "no"} | ${used.length ? mdEsc(used.map((u) => u.name).join(", ")) : "—"} | ${mdEsc(c.description)} |`);
    }
    L.push("", "An unpublished context is hidden from app/label selection UX but stays available for Conditional Access policy authoring. Only an unpublished, unreferenced context can be deleted.", "");
    return L.join("\n");
  }

  return { SLOT_MAX, allSlots, validId, slotNum, sortById, usedBy, freeSlots, summarize, deletable, buildPayload, toForm, diff, toMd };
})();
