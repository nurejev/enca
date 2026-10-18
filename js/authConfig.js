// ======================================================================
// ENCA — auth configuration
//
// ONE WAY TO SIGN IN (build 32709): through an app registration that lives in
// the tenant you sign in to. Single-tenant (AzureADMyOrg), SPA, authorization
// code + PKCE, no client secret. Your client ID, your consent record, your
// audit trail; no directory but yours can use it.
//
// There is NO shared, multi-tenant registration any more. Until build 32708
// this file shipped one (Limon-IT's) with the "organizations" authority, so
// every tenant that ever signed in held a tenant-wide delegated grant to an
// application another organisation owned. That is gone, and the guard at the
// bottom of this file keeps it gone: a shared endpoint (organizations,
// common, consumers) or a client ID without a tenant is REFUSED, whichever
// file or variable it came from, and the sign-in card says why.
//
// So a copy of ENCA ships WITHOUT a login. Three ways to give it one:
//
// 1. THIS BROWSER — the ⚙ panel on the sign-in card (js/connection.js): a
//    client ID and a tenant kept in this browser only. What a person uses on
//    the hosted site, and what an MSP uses with one login per customer.
//
// 2. THIS DEPLOYMENT, a container — ENCA_CLIENT_ID and ENCA_TENANT_ID
//    (selfhost/docker-entrypoint.sh writes them into this file at start; a
//    client ID without a tenant makes the container refuse to start).
//
// 3. THIS DEPLOYMENT, a file — a js/authConfig.local.js next to this file,
//    referenced in index.html immediately before this script:
//
//   window.ENCA_AUTH = {
//     clientId:  "<your Application (client) ID>",
//     authority: "https://login.microsoftonline.com/<your tenant ID>",
//   };
//
// The registration itself is made by New-EncaAppRegistration.ps1 — in Azure
// Cloud Shell (PowerShell, no storage account needed) or on your own machine.
// SINGLE-TENANT.md is the long form.
// ======================================================================
// PER-HOST DEFAULTS — BETA CHANNEL ONLY. DO NOT PORT THIS BLOCK TO main.
//
// The publisher's own pre-production site (BRANDING.betaHost) signs in with a
// SINGLE-TENANT registration in the publisher's own directory (the hosted
// site ships no login at all since 32709). Two reasons it has a default:
//
//   * beta is where a sign-in change is tried first, and the publisher's own
//     tenant is where trying it costs nobody else anything; and
//   * a single-tenant app (AzureADMyOrg) cannot be reached from any other
//     directory at all, which is the correct blast radius for a test site
//     whose URL is a public github.io address.
//
// Keyed on hostname, exactly as BRANDING.betaHost is, so a copy served from
// anywhere else — production, a container, localhost, a fork — falls through
// to the empty default below and is unaffected. It is NOT reachable from
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
  // Empty on purpose: a copy of ENCA ships no login of its own (see above).
  clientId: "",
  // A tenant ID or verified domain, never a shared endpoint:
  //   https://login.microsoftonline.com/00000000-1111-2222-3333-444444444444
  authority: "",
  scopes: ["Policy.Read.All", "Directory.Read.All"],
  graphBase: "https://graph.microsoft.com/beta", // beta: full coverage of newest CA settings
},
  // the beta-channel host default, if this is that host
  (typeof location !== "undefined" && AUTH_HOSTS[String(location.hostname || "").toLowerCase()]) || {},
  // then anything js/authConfig.local.js or the container start wrote, which outranks both
  (typeof window !== "undefined" && window.ENCA_AUTH) || {});

// ---------- R1: no shared authority, no client without a tenant (32709) ----------
// Applied to the MERGED result, so it holds whichever of the three sources
// supplied the value. A refused value is not "fixed up" into something else:
// the login is emptied and the reason kept in AUTH_CONFIG.refused, so the
// sign-in card can say exactly what was wrong and with which values. Signing
// in with the wrong registration quietly is the failure this file exists to
// prevent; not signing in at all, with the reason on screen, is not.
(function refuseShared(c) {
  const tail = String(c.authority || "").replace(/\/+$/, "").split("/").pop() || "";
  const shared = /^(organizations|common|consumers)$/i.test(tail);
  const noTenant = !!c.clientId && !c.authority;
  const noClient = !c.clientId && !!c.authority;
  c.refused = shared ? "shared" : noTenant ? "no-tenant" : noClient ? "no-client" : "";
  if (c.refused) {
    c.refusedFrom = { clientId: c.clientId || "", authority: c.authority || "" };
    c.clientId = ""; c.authority = "";
  }
})(AUTH_CONFIG);
