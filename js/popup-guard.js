// ======================================================================
// MSAL popup / iframe short-circuit. MUST be the first script in <head>.
//
// redirectUri is this app's own index.html (see js/graph.js), so after
// authentication the SIGN-IN POPUP navigates back here — and would load the
// entire application again: every script, and a second MSAL instance, inside
// a window whose only job is to hand its own URL back to the opener.
//
// That second instance is the problem. It can consume the authorization
// response out of the URL before the opener has read it, and the opener then
// has nothing to complete the sign-in with. Microsoft's account picker
// reappears instead of the app: pick an account → /common/reprocess → pick an
// account, forever. The same applies to the hidden iframe MSAL uses for silent
// token renewal.
//
// Neither window needs anything from this app. Stop the document before the
// rest of it parses.
//
// Deliberately NOT solved by pointing redirectUri at a blank page: that is the
// other documented fix, but it requires every tenant's app registration to add
// a new SPA redirect URI first, and anyone who deploys before doing that gets
// AADSTS50011 on every sign-in. This needs no registration change at all.
// ======================================================================
(function () {
  try {
    // A popup opened by us, or MSAL's silent-renewal iframe.
    var framed = (window.opener && window.opener !== window) || window.parent !== window;
    if (!framed) return;

    // …carrying an authorization response. Without this check a legitimately
    // embedded copy of the app would be stopped from loading at all.
    var url = String(window.location.hash || "") + String(window.location.search || "");
    if (!/[#&?](code|error|id_token|access_token|state)=/.test(url)) return;

    window.stop();
  } catch (e) {
    // Reading window.opener across origins can throw in some browsers. If we
    // cannot tell, do nothing — a slow popup beats a page that will not load.
  }
})();
