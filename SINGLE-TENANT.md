# Running ENCA on your own single-tenant app registration

**Who this is for.** Organisations that would rather not have an application
outside their directory holding a delegated grant on their Conditional Access
configuration — regulated environments, tenants under audit, anyone whose
security review asks "who owns the app we are consenting to?"

**What it costs you.** About twenty minutes to set up, and thereafter you own
keeping it current: your copy of the code, your registration, your redirect
URIs. That is the trade. If you would rather not carry it, the shared
registration at `enca.limon-it.nl` is a perfectly reasonable choice and this
document is not a criticism of it.

---

## What actually changes

| | Shared (default) | Your own single-tenant |
|---|---|---|
| Application owner | Limon-IT | You |
| Application ID | one, shared by every tenant | yours alone |
| Audience | `AzureADMultipleOrgs` | `AzureADMyOrg` — no other directory can use it |
| Consent record | to an external app | to an app in your own tenant |
| Who can revoke it | you (the grant), Limon-IT (the app) | you, both |
| Code you run | served from `enca.limon-it.nl` | served from wherever you put it |
| Sign-in mechanism | SPA, authorization code + PKCE, no secret | **identical** |

The last row matters more than it looks. This is **not** a security upgrade to
the sign-in flow — that was already a public client using PKCE with no secret,
which is the correct pattern. What changes is *ownership*: who can review the
code, who can audit the registration, and who can pull the plug.

---

## Before you start

You need:

- **Privileged Role Administrator** or **Global Administrator** in the tenant
  (creating an app registration and granting tenant-wide admin consent).
- The **Microsoft.Graph.Applications** PowerShell module:
  `Install-Module Microsoft.Graph.Applications -Scope CurrentUser`
- Somewhere to serve static files over HTTPS. ENCA has no build step and no
  server component, so any static host works — see **[Where to host
  it](#where-to-host-it)** below, which also covers the GitHub Pages trap that
  a private repository still gives you a public website.

---

## Step 1 — Take your own copy of the code

Fork or clone the repository, then **read the diff before you deploy it**. That
is the entire point of this exercise; a copy you have not reviewed buys you
nothing but maintenance.

```bash
git clone https://github.com/nurejev/enca.git enca
cd enca
git remote add upstream https://github.com/nurejev/enca.git
```

Pin to a specific release rather than tracking `main`, so the code cannot change
under you between reviews:

```bash
git log --oneline -5          # pick a build you have reviewed
git checkout -b pinned <sha>
```

Note the build number in `js/version.js`. You will want it when you compare
against upstream later.

---

## Step 2 — Register the application in your tenant

```powershell
Connect-MgGraph -Scopes "Application.ReadWrite.All","DelegatedPermissionGrant.ReadWrite.All","AppRoleAssignment.ReadWrite.All"

./New-EncaAppRegistration.ps1 -SingleTenant `
    -SingleTenantRedirectUris "https://enca.contoso.example","http://localhost:8080"
```

Pass every origin you will serve the app from. A redirect URI must match the
origin **exactly** — scheme, host and port — or sign-in fails with
`AADSTS50011`. Keep `http://localhost:8080` if you want to run it locally; drop
it if you do not.

The app is called `ENCA` unless you say otherwise. It is yours, in your
directory, listed among your own enterprise applications — so name it the way
your organisation names things:

```powershell
./New-EncaAppRegistration.ps1 -SingleTenant -AppName "Contoso CA Review" `
    -SingleTenantRedirectUris "https://enca.contoso.example"
```

The name is also the handle the script finds the app by when `-AppObjectId` is
not given, which makes it load-bearing: **re-run with exactly the same
`-AppName` and the registration is updated; use a different one and you get a
second app with a new client ID**, while every consent already recorded against
the first is stranded on an app nothing points at. To rename one that exists,
give `-AppObjectId` with the new `-AppName` — the object ID is immutable, so
that path can never fork the registration in two.

The script creates the registration with:

- the display name you chose, or `ENCA`
- `SignInAudience = AzureADMyOrg` — your directory only
- an **SPA** platform (authorization code + PKCE, no client secret)
- implicit grant explicitly **off**
- the delegated Microsoft Graph permissions ENCA uses

It is idempotent: run it again to update redirect URIs or permissions.

When it finishes it prints the two values you need. Keep the window open.

---

## Step 3 — Point your copy at your registration

Create **`js/authConfig.local.js`** with the block the script printed:

```javascript
window.ENCA_AUTH = {
  clientId:  "<your Application (client) ID>",
  authority: "https://login.microsoftonline.com/<your tenant ID>",
};
```

Reference it in `index.html`, immediately **before** `js/authConfig.js`:

```html
<script src="js/authConfig.local.js"></script>
<script src="js/authConfig.js?v=NNN"></script>
```

Use this file rather than editing `js/authConfig.js` directly. It keeps your
tenant-specific values out of the upstream file, so `git pull` from upstream
merges cleanly instead of conflicting on every release.

Using your tenant ID in `authority` (rather than `organizations`) means the app
will not even attempt to authenticate against another directory — a useful
belt-and-braces alongside the single-tenant audience.

---

## Step 3b — Restrict who may open it (recommended)

By default any user in the tenant can sign in to the app; what they can *see*
is bounded by their own roles, but the app itself opens for anyone. To gate it
to named people:

```powershell
./New-EncaAppRegistration.ps1 -SingleTenant -RequireAssignment `
    -SingleTenantRedirectUris "https://enca.contoso.example"
```

This sets **Assignment required** on the enterprise application and assigns
**you** — the account running the script — first. Everyone else is refused at
sign-in with `AADSTS50105` until you add them. Add others at the same time:

```powershell
./New-EncaAppRegistration.ps1 -RequireAssignment -AssignTo "sec-team@contoso.com","CA Administrators"
```

or afterwards in **Entra ID → Enterprise applications → ENCA → Users and
groups**.

**What this does and does not do.** It gates *who may open the tool*. It does
not reduce what an assigned person can do once inside — that is still bounded
by their own directory roles and by the consented scopes. A Global
Administrator you assign is still a Global Administrator. Treat it as a
front door, not a permission model.

**Four things to know before you switch it on:**

- **Nested groups are ignored.** Entra honours only *direct* membership of an
  assigned group for app assignment. A group of groups will not work, and it
  fails silently — the user simply cannot sign in.
- **You cannot lock yourself out with this script.** The requirement is only
  enabled *after* at least one principal is successfully assigned, and you are
  always the first one tried. If nothing could be assigned, the script says so
  and leaves the requirement off rather than sealing the app shut.
- **If you do get locked out another way**, you are still an administrator:
  fix it in the portal under Enterprise applications → Properties →
  *Assignment required* → No. The app's own gate does not apply to managing the
  app.
- **Guests need assigning too**, individually or via a group they are a direct
  member of.

---

## Where to host it

ENCA is static files. No build step, no server component, no database — whatever
serves a folder over HTTPS will do. The choice is really about **who can reach
the site**, which is a separate question from who can sign in.

| Host | Site reachable by | Notes |
|---|---|---|
| GitHub Pages, public repo | anyone | Free. Simplest. |
| GitHub Pages, **private** repo | **anyone** | Needs Pro/Team/Enterprise Cloud. The repo is private; **the site is not**. |
| GitHub Pages, private *site* | org members with repo read access | **Enterprise Cloud only.** |
| Azure Static Web Apps | anyone, or gated by Entra | Built-in auth can sit in front of the site itself. |
| Azure Storage static website + Front Door | anyone, or gated by WAF/Private Link | |
| Internal web server | your network | The traditional answer, and often the right one. |

### The GitHub Pages trap

**A private repository does not give you a private website.** Pages sites are
publicly available on the internet even when the repository behind them is
private. Publishing from a private repo requires **GitHub Pro, Team or
Enterprise Cloud** (Free is public repositories only), and restricting who can
*view the site* — to people with read access to the repo — is a **GitHub
Enterprise Cloud** feature.

So on Pro or Team you get private source and a public site. Whether that is
acceptable depends on what your copy contains.

### What a public site actually exposes

Nothing secret ends up in the deployed files:

- **The client ID is not a secret.** ENCA is a public client — a SPA using
  authorization code + PKCE — and its application ID is visible to anyone who
  signs in. That is by design; it is why there is no client secret to protect.
- **No tenant data is in the files.** Everything is read live into the browser
  and discarded; nothing is written to the site or to any server.
- **The code is already open source**, so publishing a copy of it reveals
  nothing that upstream does not already publish.
- With `-RequireAssignment`, anyone who is not assigned cannot get past sign-in.
  A public URL that turns everyone away except your assigned people is a
  perfectly sound outcome.

What a public site *would* expose is **your own changes**: your branding, an
edited baseline catalog, and your group naming convention in
`js/groupTemplates.js` — which names your CA exclusion groups. If that is
sensitive in your environment, choose a host from the gated rows above.

### If you do use GitHub Pages

Two things will bite you:

**1. Delete the `CNAME` file.** The upstream repository contains a `CNAME`
holding `enca.limon-it.nl`. A fork that keeps it will fight for that domain and
your site will not resolve.

```bash
git rm CNAME && git commit -m "Remove upstream custom domain"
```

**2. A project page serves from a subpath**, `https://yourorg.github.io/enca/`,
and the redirect URI must match it **exactly, including the trailing slash**.
ENCA computes its redirect URI at runtime as
`window.location.origin + window.location.pathname`, so it will ask for exactly
that — you just have to register it:

```powershell
./New-EncaAppRegistration.ps1 -SingleTenant -RequireAssignment `
    -SingleTenantRedirectUris "https://yourorg.github.io/enca/"
```

A **user or organisation page** (`https://yourorg.github.io`) has no subpath and
avoids the issue. Everything else in the app is referenced relatively — `js/`,
`css/`, and the in-app rendering of this file and `SECURITY.md` — so a subpath
deployment needs no edits.

Sources: [GitHub's plans](https://docs.github.com/get-started/learning-about-github/githubs-products),
[Changing the visibility of your GitHub Pages site](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site).

---

## Step 4 — Deploy and grant consent

Publish the folder to your host. There is nothing to compile; the files are
served as they sit on disk.

Then grant tenant-wide admin consent, using the URL the script printed:

```
https://login.microsoftonline.com/<tenant-id>/adminconsent?client_id=<client-id>&redirect_uri=<your-origin>
```

Or in the portal: **Entra ID → App registrations → your app → API permissions →
Grant admin consent**.

---

## Step 5 — Verify

Open your copy and sign in. Check:

1. The Microsoft consent screen names **your** application, in **your** tenant.
2. **Entra ID → Enterprise applications → your app → Permissions** shows the
   grant recorded against your own service principal.
3. The footer build number matches the release you pinned.
4. The 🔒 Permissions panel in ENCA lists the scopes you consented to.
5. If you used `-RequireAssignment`: **Enterprise applications → your app →
   Properties** shows *Assignment required* = **Yes**, and **Users and groups**
   lists exactly who you assigned. Sign in as somebody unassigned and confirm
   they are refused with `AADSTS50105` — an untested gate is not a gate.

If sign-in returns `AADSTS50011`, the redirect URI does not match your origin
exactly. If it returns `AADSTS700016`, the client ID in
`authConfig.local.js` is not an application in that tenant.

---

## Keeping it current — the part people skip

A pinned copy stops receiving fixes the moment you pin it. Put a recurring
reminder somewhere real:

```bash
git fetch upstream
git log --oneline pinned..upstream/main     # what has changed since you pinned
git diff pinned..upstream/main              # review it
git checkout -b pinned-YYYYMMDD upstream/main
```

Read **What's new** in the app (or `js/changelog.js`) for the builds between
your pin and upstream. Anything marked `fixed` is the category worth reading
first.

> A future release will make this visible inside the app: a forked deployment
> will notice it is behind, say by how many builds, and show the What's-new
> entries between your pin and upstream. See 🍴 *Fork detection and
> update-from-upstream* on the roadmap. Until then it is a calendar reminder.

---

## Things that will bite you

**Redirect URIs are exact.** `https://enca.contoso.example` and
`https://enca.contoso.example/` are the same origin, but
`https://enca.contoso.example/app` is not. If you serve from a subpath, register
the subpath.

**Do not add a client secret.** ENCA is a public client. A secret in a SPA is
readable by anyone who opens developer tools, and Entra does not need one for
authorization code + PKCE.

**Leave implicit grant off.** The script disables it deliberately. Turning it on
issues tokens in the URL fragment, which is exactly the pattern PKCE replaced.

**Consent is per registration.** Your users consent to your app, not to the
shared one. Someone who used `enca.limon-it.nl` before will be prompted again on
your copy — that is correct, not a fault.

**Your own registration does not change what ENCA can do.** The permissions are
the same; the tool still cannot act above the roles the signed-in user holds.
What you gain is ownership of the trust decision, not extra restriction.

---

## Related

- **SECURITY.md** — the architecture, the permission model, the residual risks,
  and why this route is recommended for high-assurance environments.
- **README.md** — the standard setup, for the shared registration.
- **New-EncaAppRegistration.ps1** — `-SingleTenant`, and the comments explaining
  each permission it requests.
