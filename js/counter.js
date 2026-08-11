// ======================================================================
// Usage counting configuration (GoatCounter) — loaded BEFORE vendor/count.js.
//
// What is counted: page views and one event per tool-screen open (wired in
// app.js trackTool). The path is prefixed with the host so production and
// the beta site are distinguishable in one dashboard.
// What is never counted: identities, tenant names, policy data, anything
// from the Graph session. No cookies. Blocking this breaks nothing.
// Disclosed in README.md ("Privacy & usage counting").
//
// count.js is self-hosted (vendor/count.js, ISC licensed) so the CSP needs
// no third-party script origin — only the count endpoint itself.
// ======================================================================
window.goatcounter = {
  path: function (p) { return location.host + p; },
};
