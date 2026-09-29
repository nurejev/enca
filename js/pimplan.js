// ======================================================================
// PIM plan / apply — the browser half of what tools/pim/PimCommon.psm1 does
// (beta 32422, R69). Pure: no DOM, no Graph; the caller hands in `send`.
//
// WHY IT EXISTS. PIM onboarding runs from the browser (Mihai, 28 Sep 2026:
// "the customer never runs a .ps1 — select and import from the baseline in
// their tenant"). Every Workspace 02 tool that writes — 🛡 Restricted AUs'
// PIM lens (T27), 🚀 Deploy (T51) — builds a PLAN here from reads only, shows
// it as a WhatIf, and applies exactly that plan through Graph with the run
// ledger. The rules are the scripts' rules, ported, so a tenant ends up the
// same whichever route made it:
//
//   * a plan is ops in order; an op that CREATES something says what it
//     `produces` ("group:PIM-SG-M365-Identity"), and a later op names it as
//     "{{group:PIM-SG-M365-Identity}}" — resolved at run time from the id
//     that came back;
//   * a write that names a just-created object and comes back 404 (Entra has
//     not replicated it yet — SubjectNotFound, or "does not exist" right
//     after a create) is retried after 5, 10, 15, 30, 30 and 30 seconds
//     (32418, cloudfellows.dev: 404 0.7 s after the group was made);
//   * a role or membership policy is PATCHed RULE BY RULE, each rule read,
//     only the fields the framework governs changed, sent back whole with its
//     own target and @odata.type (Get-PimRuleChanges); its `before` is kept
//     so the run can be put back;
//   * an eligibility request carries startDateTime = the moment it is sent,
//     and its duration never exceeds what the role's own policy allows;
//   * a membership policy of a group that is not in PIM for Groups yet is
//     DEFERRED (◐), never failed: the group joins PIM for Groups when its
//     first member is assigned, and the next plan picks the policy up;
//   * an op whose placeholder cannot be resolved (the create it depends on
//     failed or was stopped) is SKIPPED with that reason; independent ops go on;
//   * nothing is ever removed unless the op says `removes` and the person
//     ticked it; protected objects never appear in a plan at all.
// ======================================================================
const PimPlan = (() => {
  const V1 = "https://graph.microsoft.com/v1.0";
  const BETA = "https://graph.microsoft.com/beta";
  const WAITS = [5, 10, 15, 30, 30, 30];
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const canon = (o) => {
    if (Array.isArray(o)) return "[" + o.map(canon).join(",") + "]";
    if (o && typeof o === "object") return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
    return JSON.stringify(o === undefined ? null : o);
  };

  function newPlan(meta) {
    return { schema: "cloudfellows-pim-plan/web-1", meta: Object.assign({ createdAt: new Date().toISOString() }, meta || {}), ops: [], blocked: [], findings: [], manual: [], resolved: {} };
  }
  // op: { key, kind: "http" | "request" | "groupPolicy", method, url, body,
  //       produces, needs: [scopes], summary, section, before, removes, group }
  function add(plan, op) {
    if (plan.ops.some((o) => o.key === op.key)) return plan.ops.find((o) => o.key === op.key);
    const o = Object.assign({ kind: "http", needs: [], section: "other" }, op);
    plan.ops.push(o);
    return o;
  }
  const scopesOf = (plan, ops) => [...new Set((ops || plan.ops).flatMap((o) => o.needs || []))].sort();

  // ---- ISO 8601 durations ------------------------------------------------
  function seconds(iso) {
    const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(iso || ""));
    if (!m) return null;
    const n = (i) => +(m[i] || 0);
    return (((n(1) * 365 + n(2) * 30 + n(3) * 7 + n(4)) * 24 + n(5)) * 60 + n(6)) * 60 + n(7);
  }
  // The duration an eligibility may ask for, capped by the role's own
  // Expiration_Admin_Eligibility rule (the request is refused otherwise).
  function eligibilityDuration(rules, wanted) {
    const want = wanted || "P365D";
    const r = (rules || []).find((x) => x && x.id === "Expiration_Admin_Eligibility");
    if (!r || r.isExpirationRequired === false || !r.maximumDuration) return { duration: want, capped: false };
    const max = seconds(r.maximumDuration), w = seconds(want);
    return max != null && w != null && max < w ? { duration: r.maximumDuration, capped: true } : { duration: want, capped: false };
  }

  // ---- rules -------------------------------------------------------------
  // Graph's unifiedRoleManagementPolicyRule, minus what it returns but does
  // not take back.
  function ruleBody(rule) {
    const b = {};
    for (const k of Object.keys(rule || {})) if (!/@odata\.context$/.test(k) && k !== "@odata.etag") b[k] = rule[k];
    return b;
  }
  // Template T (the catalog's EasyPIM-shaped keys) → the rules that must
  // change. approverIds maps an approver group NAME to its id (or to a
  // "{{group:NAME}}" placeholder the same plan creates). Unknown recipients
  // outside the verified domains are rewritten to the alert domain.
  function ruleChanges(rules, T, o = {}) {
    const by = {};
    (rules || []).forEach((r) => { if (r && r.id) by[r.id] = r; });
    const out = [];
    const domain = String(o.domain || "").toLowerCase();
    const verified = (o.verifiedDomains || []).map((d) => String(d).toLowerCase());
    const mail = (r) => {
      const s = String(r).toLowerCase();
      if (!s.includes("@")) return domain ? `${s}@${domain}` : s;
      const d = s.split("@")[1];
      return verified.length && !verified.includes(d) && domain ? `${s.split("@")[0]}@${domain}` : s;
    };
    const set = (id, mutate) => {
      if (!by[id]) { out.push({ ruleId: id, missing: true }); return; }
      const before = clone(by[id]), after = clone(by[id]);
      mutate(after);
      if (canon(before) !== canon(after)) out.push({ ruleId: id, before: ruleBody(before), after: ruleBody(after) });
    };
    const req = String(T.ActivationRequirement || "None").split(",").map((s) => s.trim()).filter((s) => s && s !== "None").sort();
    set("Expiration_EndUser_Assignment", (r) => { r.isExpirationRequired = true; r.maximumDuration = String(T.ActivationDuration || "PT8H"); });
    set("Enablement_EndUser_Assignment", (r) => { r.enabledRules = req.slice(); });
    set("AuthenticationContext_EndUser_Assignment", (r) => { const on = !!T.AuthenticationContext_Enabled; r.isEnabled = on; r.claimValue = on ? String(T.AuthenticationContext_Value || "").split(":")[0] : null; });
    let approverProblem = null;
    // skipApproval: the approver group cannot approve yet (made in this run,
    // or fewer than two members) — the approval rule is left as it is (32429).
    if (!o.skipApproval) set("Approval_EndUser_Assignment", (r) => {
      const need = !!T.ApprovalRequired;
      r.setting = r.setting || {};
      r.setting.isApprovalRequired = need;
      const stages = (r.setting.approvalStages || []).filter(Boolean);
      const stage = stages.length ? stages[0] : { approvalStageTimeOutInDays: 1, isApproverJustificationRequired: true, escalationTimeInMinutes: 0, isEscalationEnabled: false, escalationApprovers: [] };
      stage.primaryApprovers = need ? (T.Approvers || []).map((a) => {
        const name = typeof a === "object" ? String(a.description || "") : String(a);
        const id = typeof a === "object" && /^[0-9a-f-]{36}$/i.test(a.id || "") ? a.id : (o.approverIds || {})[name];
        if (!id) { approverProblem = approverProblem || name; return null; }
        return { "@odata.type": "#microsoft.graph.groupMembers", groupId: id, description: name };
      }).filter(Boolean) : [];
      r.setting.approvalStages = [stage];
    });
    set("Expiration_Admin_Eligibility", (r) => { const perm = !!T.AllowPermanentEligibility; r.isExpirationRequired = !perm; if (!perm) r.maximumDuration = String(T.MaximumEligibilityDuration || "P365D"); });
    set("Expiration_Admin_Assignment", (r) => { const perm = !!T.AllowPermanentActiveAssignment; r.isExpirationRequired = !perm; if (!perm) r.maximumDuration = String(T.MaximumActiveAssignmentDuration || "P30D"); });
    const notes = { Notification_Admin_EndUser_Assignment: "Notification_Activation_Alert", Notification_Admin_Admin_Eligibility: "Notification_EligibleAssignment_Alert", Notification_Admin_Admin_Assignment: "Notification_ActiveAssignment_Alert" };
    for (const rid of Object.keys(notes).sort()) {
      const n = T[notes[rid]];
      if (!n) continue;
      set(rid, (r) => {
        r.notificationLevel = String(n.notificationLevel || "All");
        r.isDefaultRecipientsEnabled = String(n.isDefaultRecipientEnabled) !== "false";
        r.notificationRecipients = [...new Set((n.Recipients || []).filter(Boolean).map(mail))].sort();
      });
    }
    if (approverProblem) return { changes: [], problem: `approver group ${approverProblem} has no id and is not planned — nothing could approve through it` };
    return { changes: out, problem: null };
  }
  // The approver names a template needs resolved (only when approval is on).
  const approverNames = (T) => (T && T.ApprovalRequired ? (T.Approvers || []).map((a) => (typeof a === "object" ? (/^[0-9a-f-]{36}$/i.test(a.id || "") ? null : a.description) : a)).filter(Boolean) : []);

  // ---- placeholders ------------------------------------------------------
  const PH = /\{\{([^{}]+)\}\}/g;
  function uses(op) { const s = JSON.stringify([op.url, op.body || null]); return [...new Set([...s.matchAll(PH)].map((m) => m[1]))]; }
  function resolve(v, ids) {
    if (typeof v === "string") return v.replace(PH, (m, k) => { if (!ids[k]) throw Object.assign(new Error(`${k} has no id — the operation that makes it did not run`), { unresolved: k }); return ids[k]; });
    if (Array.isArray(v)) return v.map((x) => resolve(x, ids));
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = resolve(v[k], ids); return o; }
    return v;
  }
  // Not replicated yet: a 404 on a write naming an object this run made.
  function notReplicated(err, usesNew) {
    const s = String((err && (err.message || err.code)) || err || "");
    const status = err && (err.status || err.statusCode);
    const is404 = status === 404 || /\b404\b|NotFound|Not Found|does not exist|ResourceNotFound/i.test(s);
    if (!is404) return false;
    if (/SubjectNotFound/i.test(s)) return true;
    return !!usesNew;
  }

  // ---- the run -----------------------------------------------------------
  // hooks: send(method, url, body, needs) → response body | null (throws on
  // HTTP error), sleep(ms), stopped() → bool, groupPolicy(op, ids, send) →
  // "done" | "deferred: …" | throws, and the ledger callbacks onStart(i),
  // onDone(i, note), onFail(i, why), onPart(i, note), onSkip(i, why),
  // onWait(i, seconds, attempt).
  async function run(plan, hooks) {
    if ((plan.blocked || []).length) throw new Error("Plan is blocked — resolve the listed items and create a new preview before applying");
    const ids = Object.assign({}, plan.resolved || {});
    const h = Object.assign({ sleep: (ms) => new Promise((r) => setTimeout(r, ms)), stopped: () => false }, hooks);
    const outcome = [];
    const failedKeys = new Set();
    for (let i = 0; i < plan.ops.length; i++) {
      const op = plan.ops[i];
      const rec = { key: op.key, summary: op.summary, status: "not run", at: null, id: null, error: null };
      outcome.push(rec);
      if (h.stopped()) { rec.status = "stopped"; h.onSkip && h.onSkip(i, "stopped"); continue; }
      const req = (op.requires || []).find((k) => failedKeys.has(k));
      if (req) { rec.status = "skipped"; rec.error = `${req} failed`; failedKeys.add(op.key); h.onSkip && h.onSkip(i, `left out: ${req.replace(/^[a-z]+:/, "")} did not change — its role would be granted under the old settings`); continue; }
      const dep = uses(op).find((k) => !ids[k]);
      if (dep) { rec.status = "skipped"; rec.error = `${dep} was not made in this run`; failedKeys.add(op.produces || op.key); h.onSkip && h.onSkip(i, `needs ${dep.replace(/^[a-z]+:/, "")}, which was not made`); continue; }
      h.onStart && h.onStart(i);
      rec.at = new Date().toISOString();
      const usesNew = uses(op).some((k) => !(plan.resolved || {})[k]);
      let attempt = 0;
      for (;;) {
        try {
          if (op.kind === "groupPolicy") {
            const r = await h.groupPolicy(op, ids, h.send);
            rec.status = r || "done";
          } else {
            const url = resolve(op.url, ids);
            let body = op.body == null ? null : resolve(clone(op.body), ids);
            if (op.kind === "request") { body = body || {}; body.scheduleInfo = Object.assign({}, body.scheduleInfo || {}, { startDateTime: new Date().toISOString() }); }
            const res = await h.send(op.kind === "request" ? "POST" : op.method, url, body, op.needs || []);
            if (op.produces) {
              const id = res && res.id;
              if (!id) throw new Error("no id came back");
              ids[op.produces] = id; rec.id = id;
            } else if (res && res.id) rec.id = res.id;
            rec.status = op.kind === "request" ? `done${res && res.status ? ` (${res.status})` : ""}` : "done";
          }
          break;
        } catch (e) {
          if (op.kind !== "groupPolicy" && attempt < WAITS.length && notReplicated(e, usesNew) && !h.stopped()) {
            const w = WAITS[attempt++];
            h.onWait && h.onWait(i, w, attempt);
            await h.sleep(w * 1000);
            continue;
          }
          rec.status = "failed"; rec.error = String((e && e.message) || e).replace(/\s*·\s*inner:.*$/, "");
          break;
        }
      }
      if (attempt && rec.status !== "failed") rec.status += ` after ${attempt} retr${attempt === 1 ? "y" : "ies"}`;
      if (rec.status === "failed") { failedKeys.add(op.key); if (op.produces) failedKeys.add(op.produces); h.onFail && h.onFail(i, rec.error); }
      else if (/^deferred/.test(rec.status)) h.onPart && h.onPart(i, rec.status);
      else h.onDone && h.onDone(i, rec.status === "done" ? "" : rec.status);
    }
    const count = (f) => outcome.filter(f).length;
    return { ids, outcome, done: count((r) => /^done/.test(r.status)), deferred: count((r) => /^deferred/.test(r.status)), failed: count((r) => r.status === "failed"), skipped: count((r) => r.status === "skipped" || r.status === "stopped" || r.status === "not run") };
  }
  // What the run changed that can be put back: the rules as they were. A
  // create is undone from its object; an eligibility with adminRemove.
  function backup(plan, meta) {
    // Only PIM policy rules — what ↩ Put back can write (an Intune role's
    // permissions are changed in Intune by hand if they must go back).
    return { schema: "cloudfellows-pim-backup/web-1", meta: Object.assign({}, plan.meta || {}, meta || {}), rules: plan.ops.filter((o) => o.before && o.method === "PATCH" && /\/policies\/roleManagementPolicies\/[^/]+\/rules\//.test(o.url)).map((o) => ({ key: o.key, url: o.url, before: o.before })) };
  }
  // A backup → a plan that PATCHes every rule back.
  function restorePlan(file, needs) {
    const p = newPlan(Object.assign({}, (file && file.meta) || {}, { restoreOf: (file && file.meta && file.meta.createdAt) || null }));
    ((file && file.rules) || []).forEach((r, i) => {
      if (!/^https:\/\/graph\.microsoft\.com\/(v1\.0|beta)\/policies\/roleManagementPolicies\/[^/]+\/rules\/[A-Za-z_]+$/.test(String(r.url || ""))) { p.blocked.push(`entry ${i + 1}: ${r.url} is not a PIM policy rule — left out`); return; }
      add(p, { key: `restore:${r.key}`, method: "PATCH", url: r.url, body: ruleBody(r.before), summary: `put back ${String(r.key).replace(/^[a-z]+:/, "")}`, section: "restore", needs: needs || ["RoleManagementPolicy.ReadWrite.Directory", "RoleManagementPolicy.ReadWrite.AzureADGroup"] });
    });
    return p;
  }
  // The eligibility request body for a principal at a scope.
  function eligibility({ principalId, roleDefinitionId, scope, duration, justification, permanent }) {
    return { action: "adminAssign", principalId, roleDefinitionId, directoryScopeId: scope || "/", justification: justification || "CloudFellows PIM framework", scheduleInfo: { expiration: permanent ? { type: "noExpiration" } : { type: "afterDuration", duration: duration || "P365D" } } };
  }
  const mailNickname = (n) => String(n).replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 60) || "pimgroup";

  return { V1, BETA, WAITS, newPlan, add, scopesOf, seconds, eligibilityDuration, ruleBody, ruleChanges, approverNames, uses, resolve, notReplicated, run, backup, restorePlan, eligibility, mailNickname, canon };
})();
