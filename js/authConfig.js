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
//
// 3. NEITHER, FOR ONE SIGN-IN. Since build 25399 the sign-in card carries a
//    ⚙ connection control (js/connection.js): a client ID and a tenant kept
//    in ONE BROWSER, outranking everything in this file. It configures a
//    person, not a deployment — use it to try a registration before
//    committing it here, or to sign in to another directory. SINGLE-TENANT.md
//    covers both routes and when each is the right one.
// ======================================================================
// PER-HOST DEFAULTS — BETA CHANNEL ONLY. DO NOT PORT THIS BLOCK TO main.
//
// The publisher's own pre-production site (BRANDING.betaHost) signs in with a
// SINGLE-TENANT registration in the publisher's own directory, not with the
// shared multi-tenant one the hosted site uses. Two reasons:
//
//   * beta is where a registration change is tried first, and trying it on the
//     application every customer signs in with is not trying it, it is
//     shipping it; and
//   * a single-tenant app (AzureADMyOrg) cannot be reached from any other
//     directory at all, which is the correct blast radius for a test site
//     whose URL is a public github.io address.
//
// Keyed on hostname, exactly as BRANDING.betaHost is, so a copy served from
// anywhere else — production, a container, localhost, a fork — falls through
// to the shipped default below and is unaffected. It is NOT reachable from
// selfhost-branding.json or from any UI: a deployment that could name itself
// the publisher's beta host could borrow its registration.
//
// This sits BELOW window.ENCA_AUTH and below the ⚙ connection picker
// (js/connection.js) in precedence: a host default is still only a default.
const AUTH_HOSTS = {
  "nurejev.github.io": {
    clientId: "6da2c636-e3ef-4fc1-b431-37e79aae2184",
    authority: "https://login.microsoftonline.com/020eb2d3-8046-4257-828d-64bf3ece8fbb",
  },
};

const AUTH_CONFIG = Object.assign({
  clientId: "4437195a-f35c-417f-8c69-58036fbe2137", // <-- REPLACE for your own registration
  // "organizations" = any work/school tenant (multi-tenant). For a single-tenant
  // registration use your tenant ID or verified domain instead, which also stops
  // the app being usable from any other directory:
  //   https://login.microsoftonline.com/00000000-1111-2222-3333-444444444444
  authority: "https://login.microsoftonline.com/organizations",
  scopes: ["Policy.Read.All", "Directory.Read.All"],
  graphBase: "https://graph.microsoft.com/beta", // beta: full coverage of newest CA settings
},
  // the beta-channel host default, if this is that host
  (typeof location !== "undefined" && AUTH_HOSTS[String(location.hostname || "").toLowerCase()]) || {},
  // then anything js/authConfig.local.js set, which outranks both
  (typeof window !== "undefined" && window.ENCA_AUTH) || {});
