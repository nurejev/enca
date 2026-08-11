# ENCA — security & risk documentation

This document is for the security reviewer deciding whether administrators may
use ENCA against a production tenant. It describes how the tool is built, what
it can and cannot do, which risks remain — for the tenant that uses it and for
the operator that publishes it — and what to do about them. It is honest by
design: a tool that can write Conditional Access policies deserves scrutiny,
and the right answer to "is it safe?" is an explanation, not a yes.

*(Version note: statements here describe the code in this repository — every
claim below can be checked against the source, which is the point of shipping
this file next to it.)*

## Architecture: what ENCA is, and deliberately is not

ENCA is a **static, single-page web application**: HTML, CSS and plain
JavaScript served from GitHub Pages. There is **no backend, no database, no
proxy and no server-side code**. The browser talks to exactly two parties:
`login.microsoftonline.com` to sign in and `graph.microsoft.com` to read and
(only when an admin explicitly uses a write tool) change the tenant. Policy
data, sign-in logs, group memberships — everything the tool reads — exists
**only in the browser tab** and is gone when the tab closes. Nothing is
stored, proxied, cached or logged anywhere else, and the operator has no
technical means to see any tenant's data: there is no server that could.

Because there is no build step, the JavaScript that runs in the browser is the
JavaScript in this repository — human-readable, diff-able per release, with a
visible build number (footer and sign-in screen) that maps to a commit. A
reviewer can read exactly what ships; a cautious organisation can fork the
repository and serve a reviewed, pinned copy from its own origin (see
"Recommendations" below and the fork instructions in the README).

## Identity: delegated permissions only, asked for at the moment of use

ENCA signs the administrator in with **MSAL.js using the authorization code
flow with PKCE** as a public client — there is **no client secret** anywhere,
because a static site cannot keep one. Tokens are cached in
**`sessionStorage`**: they die with the tab, are not shared across sites, and
are never written to disk by the app. Access tokens are attached **only** to
requests whose hostname is `graph.microsoft.com` — validated before every
single request.

All permissions are **delegated**. This is the load-bearing property of the
whole security model:

- ENCA can never do anything the signed-in administrator cannot already do in
  the Entra admin portal. It does not escalate, it does not bypass PIM, roles,
  or Conditional Access applied to the admin — a token is minted for the
  session under exactly the caller's privileges.
- There is **no standing access**. No app-only permission, no service
  principal acting on its own, nothing that works while no human is signed in.
- Sign-in itself requests only the two read scopes every tool needs:
  `Policy.Read.All` and `Directory.Read.All`. Every further scope — the audit
  and sign-in logs, Intune reads for the Group Analyzer, and every write scope
  — is requested **on the click that starts the action**, through Microsoft's
  own consent prompt, so the administrator (or their tenant's consent policy)
  decides per capability. The full scope catalog, with the tool and purpose of
  each scope, is shown inside the app and can be audited there.

The write scopes are the powerful ones, and there is no way to soften what
they are: `Policy.ReadWrite.ConditionalAccess` can change the policies that
guard the tenant, `Group.ReadWrite.All` and `RoleManagement.ReadWrite.Directory`
can create and populate (role-assignable) groups, `AdministrativeUnit.ReadWrite.All`
can create a restricted management AU. They are requested only by the tools
that write, only when used, and every change they make is recorded — by
Entra, not by ENCA — in the tenant's own audit log with the administrator as
the actor. ENCA's Change audit tool reads that same log, so the tool's own
changes are visible in the tool.

## What leaves the browser

Two things, and only two:

1. **Microsoft Graph calls**, over TLS, to Microsoft's own API, under the
   administrator's token. This is the same traffic the Entra portal generates.
2. **Anonymous usage counts** to a GoatCounter endpoint: page views and one
   event per tool opened — the tool's name and the channel, nothing else. No
   identifiers, no tenant names, no cookies, nothing from the Graph session.
   The counting script is self-hosted; blocking the endpoint changes nothing
   about how ENCA works. (Also disclosed in the README, "Privacy & usage
   counting".)

Exports — Word, PDF, CSV, Markdown, JSON backups — are generated **locally in
the browser** and saved to the administrator's machine. They never transit any
service.

## Hardening inside the app

- A **Content-Security-Policy** (meta tag; GitHub Pages cannot send headers)
  restricts scripts to same-origin — no inline scripts, no third-party script
  origins — and network calls to `graph.microsoft.com`,
  `login.microsoftonline.com` and the count endpoint. This is the primary
  defence against script injection: even a successfully injected `<script>`
  from another origin will not execute.
- **Every JavaScript library is self-hosted** in `vendor/` (MSAL, jsPDF,
  JSZip, html-to-image, GoatCounter's count.js) — nothing loads from a CDN at
  runtime, so a CDN compromise cannot reach ENCA's users and versions only
  change when this repository changes.
- **Write friction is deliberate**: destructive actions require a typed
  confirmation (DELETE / RESTORE), changes show a diff or plan before they
  run, deleted policies land in the Recycle bin tool (Entra's 30-day
  soft-delete), and the Report-only impact tool exists precisely so policies
  are enabled on evidence instead of hope.
- **Protected actions** are honoured: if the tenant guards Conditional Access
  administration with an authentication context, ENCA declares the `cp1`
  client capability, receives the claims challenge, and steps up
  interactively — it works with that control, not around it.
- Graph throttling (429) is honoured with `Retry-After`, so bulk writes
  degrade politely instead of hammering the API.

## Risks for the tenant and its administrators

These are the residual risks a reviewer should weigh. None of them are
theoretical filler; they are the ones we would raise ourselves.

**1. The blast radius of delegated writes.** An administrator with
`Policy.ReadWrite.ConditionalAccess` can lock a tenant out — with ENCA, with
the portal, or with PowerShell. ENCA reduces the *likelihood* (diffs, typed
confirmations, report-only tooling, the recycle bin) but cannot reduce the
*authority*: it is the admin's own. Treat ENCA write sessions like portal
sessions: PIM-activate the role just-in-time, keep break-glass accounts
excluded from every policy, and prefer the report-only workflow before any
enable.

**2. Supply chain: the code you run is the repository.** Whoever can push to
this repository's default branch can change the JavaScript served to every
user — that is true of any web tool, and a Conditional Access tool is a
worthwhile target. Controls: the maintainer account uses MFA; there is no
build pipeline that could inject code outside the repo; every release is a
readable diff with a build number. The strongest control is in the tenant's
hands: **fork, review, pin, and serve from your own origin with your own app
registration** — the README documents exactly this, and the app is designed
(one branding file, one clientId) to make it easy.

**3. Token theft via script injection or extensions.** The CSP blocks
third-party and inline scripts, and tokens live only in `sessionStorage` on
the ENCA origin for the tab's lifetime. What no web app can defend against is
the browser itself: an extension with "read and change all data on websites"
permission can read anything on the page, including tokens and policy data.
Use a **clean browser profile without extensions** for administrative work —
for ENCA and for the Entra portal alike.

**4. Lookalikes and consent phishing.** Anyone can fork a public repository
and host a convincing copy that asks for the same scopes. Defences: reach the
tool only via the known production URL, check the application name and ID on
Microsoft's consent screen, and use Entra's admin-consent workflow / consent
policies so unfamiliar client IDs cannot acquire high-privilege delegated
scopes silently. A forked-and-reviewed copy under your own app registration
eliminates this class entirely.

**5. Sensitive data on the client.** Sign-in logs contain user identities,
IP addresses and locations; policy exports describe your security posture.
ENCA keeps them in memory and puts them only where the administrator asks
(screen or local export file) — but from that moment the files are the
organisation's responsibility. Handle exports under the same classification
as any security documentation.

**6. The Graph beta endpoint.** ENCA uses `graph.microsoft.com/beta` for full
coverage of the newest Conditional Access settings. Microsoft may change beta
APIs; the realistic consequence is a feature breaking until updated, not a
confidentiality issue — the endpoint sits behind the same authentication and
authorization as v1.0.

**7. The beta channel.** The separate beta site runs ahead of production for
testing. It wears a permanent warning banner and its builds are marked
`-beta.N`. Use production for production tenants.

## Risks for the operator (and what is done about them)

For transparency, the risks on the publishing side and their handling:

- **Repository / account compromise** is the operator's most serious risk,
  because its impact lands on users (risk 2 above). Mitigation: MFA on the
  hosting account, no third-party publishing pipeline, human-readable
  releases, and this document encouraging high-assurance tenants to fork
  rather than trust.
- **App registration integrity.** The multi-tenant app registration is a
  public client with no secrets — there is no credential to steal — but its
  redirect URIs are part of the trust boundary and are kept minimal and
  monitored. Tenants that fork use their own registration and are unaffected.
- **No visibility, by design.** The operator sees aggregate usage counts and
  nothing else — no tenant names, no data, no errors. That is a privacy
  feature with an operational cost the operator accepts: there is no way to
  detect a tenant-side problem remotely, which is another reason changes ship
  through a beta channel first.
- **Liability.** ENCA is provided as-is, without warranty. It executes only
  what an authenticated administrator instructs under that administrator's
  own permissions; accountability for changes rests with the tenant's
  administrators, and the tenant's audit log attributes every change to them.

## Recommendations for security teams

- Allow ENCA the way you would allow the Entra portal: for named
  administrators, on managed devices, in a clean browser profile.
- Gate the write scopes with **admin-consent policies**; leave the read-only
  scopes to per-user consent if that fits your model.
- Require **PIM just-in-time activation** for the roles that make the write
  scopes effective; ENCA cannot act above the role that is active.
- For high-assurance environments: **fork this repository**, review the code,
  register your own application, replace the `clientId`, and serve the pinned
  copy from your own origin. Everything about the app is built to survive
  that (no build step, one config file, one branding file).
- Keep break-glass accounts excluded from all policies, and use the
  Report-only impact tool before enabling anything — that is what it is for.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via **GitHub Security
Advisories** on this repository ("Report a vulnerability") rather than a
public issue. Reports get a response, a fix in the beta channel, and credit
if wanted; the changelog discloses security-relevant fixes.
