// ======================================================================
// ENCA — auth configuration
//
// TWO WAYS TO RUN THIS APP.
//
// 1. SHARED, MULTI-TENANT (the default, and what enca.limon-it.nl uses).
//    One app registration owned by Limon-IT; your tenant consents to it. Fast
//    to adopt — nothing to deploy — but an application outside your directory
//    holds a delegated grant on your data.
//
// 2. YOUR OWN, SINGLE-TENANT. You register ENCA inside your own tenant and
//    serve your own reviewed copy. Own client ID, own consent record, own
//    redirect URIs, own audit trail; nothing to trust but the code you read.
//    Recommended for high-assurance environments — see SINGLE-TENANT.md for
//    the step-by-step, and SECURITY.md for why.
//
// The sign-in mechanism is identical either way: a SPA using authorization
// code + PKCE with no client secret. Only the OWNER of the registration
// changes, and therefore who can review, audit and revoke it.
//
// To switch to your own registration, either edit the two values below, or —
// better, because it survives a `git pull` from upstream without a conflict —
// drop a js/authConfig.local.js next to this file that sets window.ENCA_AUTH:
//
//   window.ENCA_AUTH = {
//     clientId:  "<your Application (client) ID>",
//     authority: "https://login.microsoftonline.com/<your tenant ID>",
//   };
//
// and add it to index.html immediately before this script. Anything it sets
// wins; anything it omits falls back to the defaults here.
// ======================================================================
const AUTH_CONFIG = Object.assign({
  clientId: "4437195a-f35c-417f-8c69-58036fbe2137", // <-- REPLACE for your own registration
  // "organizations" = any work/school tenant (multi-tenant). For a single-tenant
  // registration use your tenant ID or verified domain instead, which also stops
  // the app being usable from any other directory:
  //   https://login.microsoftonline.com/00000000-1111-2222-3333-444444444444
  authority: "https://login.microsoftonline.com/organizations",
  scopes: ["Policy.Read.All", "Directory.Read.All"],
  graphBase: "https://graph.microsoft.com/beta", // beta: full coverage of newest CA settings
}, (typeof window !== "undefined" && window.ENCA_AUTH) || {});
