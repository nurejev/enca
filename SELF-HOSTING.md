# Self-hosting ENCA (R06)

> **You are reading the beta-channel copy.** Every URL and image tag on this page points at the `beta` branch and the `:beta` image, so self-hosting is testable here rather than only after promotion. The production copy on `main` says `main` and `:latest` throughout — the beta→main port rewrites them.

ENCA is static files and a browser — no server code, no database, nothing stored anywhere. That makes it trivially self-hostable, and some tenants require it: a security tool that reads Conditional Access is exactly the kind of thing an organisation wants served from its own infrastructure.

## ⚠️ Read this first: the redirect URI

**This is the one step no script or template can do for you, and skipping it is what produces the confusing sign-in error.**

Every host you serve ENCA from — `http://localhost:8080`, `https://enca.yourcompany.com`, an Azure Container Apps URL — must be registered as a **single-page application (SPA) redirect URI** on the Entra app registration ENCA signs in with. If it is not, sign-in fails with **AADSTS50011** ("The redirect URI specified in the request does not match").

Two ways to do it:

1. **Your own app registration (recommended for self-hosting).** Run [`New-EncaAppRegistration.ps1`](New-EncaAppRegistration.ps1) — it creates a registration in *your* tenant and adds your host's redirect URI. Then put its client id in `js/authConfig.js` (or see [SINGLE-TENANT.md](SINGLE-TENANT.md)). Your own registration, your own host: no dependency on anything of ours at run time.

   Name it yours with `-AppName` — the registration lands in *your* Enterprise applications list, where a vendor's name on an app you own is at best confusing:

   ```powershell
   ./New-EncaAppRegistration.ps1 -SingleTenant -AppName "Contoso CA Review" `
     -SingleTenantRedirectUris "https://enca.contoso.example","http://localhost:8080"
   ```

   The name is the handle the script looks the app up by, so **re-run it with exactly the same `-AppName` to update**; a different name creates a second registration with a new client ID and orphans the consent recorded against the first. To rename one that already exists, pass `-AppObjectId` alongside the new `-AppName`.
2. **An existing registration.** Entra admin center → App registrations → your app → Authentication → *Single-page application* → add your URL exactly, including the port.

## Quick start on your own machine

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/nurejev/enca/beta/selfhost/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/nurejev/enca/beta/selfhost/install.ps1 | iex
```

Either script checks Docker is running, pulls `ghcr.io/nurejev/enca:beta`, starts it at `http://localhost:8080`, and prints the redirect-URI instructions above. Pass a port (`bash install.sh 9090` / `-Port 9090`) if 8080 is taken; use `ENCA_TAG=latest` / `-Tag latest` for the production channel.

## Pointing it at your own app registration

Two environment variables, and nothing to edit or rebuild:

```bash
docker run -d --name enca -p 8080:80 --restart unless-stopped \
  -e ENCA_CLIENT_ID=00000000-1111-2222-3333-444444444444 \
  -e ENCA_TENANT_ID=55555555-6666-7777-8888-999999999999 \
  ghcr.io/nurejev/enca:beta
```

`ENCA_CLIENT_ID` is the Application (client) ID printed by `New-EncaAppRegistration.ps1`. `ENCA_TENANT_ID` is only for a **single-tenant** registration (`-SingleTenant`) — omit it for a multi-tenant one and the shared `organizations` authority is kept. `ENCA_AUTHORITY` takes a full URL for a verified domain or a national cloud.

The container's entrypoint applies them to `js/authConfig.js` at start, and **does nothing at all when they are unset** — the image without them behaves exactly as before. Values that are not a plain GUID or `https://` URL are refused rather than escaped, because a value able to close a JavaScript string literal would be script injection into the sign-in page.

The install scripts take the same thing (`ENCA_CLIENT_ID=… bash install.sh`, `.\install.ps1 -ClientId … -TenantId …`), the compose file reads both from your environment, and the Deploy to Azure template exposes them as the `clientId` and `tenantId` parameters. **Every one of these still needs that host registered as a SPA redirect URI** — the variables change which registration you sign in to, not what it will accept.

Editing files still works if you prefer it: drop a `js/authConfig.local.js` setting `window.ENCA_AUTH` and reference it from `index.html` just before `js/authConfig.js`. That route survives a `git pull`; it needs an image you build yourself.

## Plain Docker

```bash
docker run -d --name enca -p 8080:80 --restart unless-stopped ghcr.io/nurejev/enca:beta
```

Or with compose — see [`selfhost/docker-compose.yml`](selfhost/docker-compose.yml). The image is nginx over the repo's files, built by [the workflow](.github/workflows/docker.yml) on every push: `:latest` from `main`, `:beta` from the beta channel. To build it yourself instead of trusting ours: `docker build -t enca .` in a clone — what you run is what you can read.

## Deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fnurejev%2Fenca%2Fbeta%2Fselfhost%2Fazuredeploy.json)

The button deploys [`selfhost/azuredeploy.json`](selfhost/azuredeploy.json): an **Azure Container App** running the published image with **scale-to-zero** (min 0 / max 1 replicas, 0.25 vCPU), so an instance used by one team costs close to nothing while idle. The deployment outputs show the app's HTTPS URL and repeat the next step: **add that URL as a SPA redirect URI** on your app registration.

The template's `image` parameter defaults to the channel this branch publishes — `ghcr.io/nurejev/enca:beta` here, `:latest` on `main` — and anonymous pull requires the GHCR package to be **Public** (github.com → Packages → enca → Package settings). If the container app deploys but never becomes healthy, an unauthorised pull is the first thing to check, in the Container App's *Log stream*.

## Branding your instance

A self-hosted instance can wear your organisation's identity without forking — the same mechanism as the per-audience looks on the hosted site:

1. On any non-production host, a **⚙ gear appears next to Sign out**. It opens the branding settings: product and organisation names, logos, login text, and light/dark colour palettes.
2. **Apply in this browser** previews and keeps the look locally (per browser).
3. **Import from JSON** loads an existing `selfhost-branding.json` into the form for review — a look made on another machine, or handed to you as a file, never has to be retyped.
4. **Download selfhost-branding.json** exports the same settings as a file. Serve it at the site root — the compose file and install scripts mount `./selfhost-branding.json` automatically — and **every visitor** to your instance gets the branding.
5. **Copy for container** gives you the same look as a value instead of a file, for a platform with no filesystem to mount into:

   ```bash
   az containerapp update -n enca -g <rg> --set-env-vars ENCA_BRANDING='<paste>'
   docker run -e ENCA_BRANDING='<paste>' ...
   ```

   The entrypoint writes it to `selfhost-branding.json` at the site root — the same path the download tells you to serve from, so the two routes are the same mechanism reached two ways. If the branding is too large for an environment variable (an embedded PNG logo is the usual reason, and the button tells you the size), serve the same JSON at a URL and set **`ENCA_BRANDING_URL`**; the container fetches it once at start, and a fetch that fails leaves the instance unbranded rather than refusing to serve.

Branding saved with **Apply in this browser** stays in that browser. Only the file and the environment variable reach other people — that distinction is deliberate, and it is why the gear has three buttons rather than one.

Exports (Word/PDF/Markdown) keep the neutral ENCA credit by design, exactly like the hosted per-audience looks. For a full rebrand including export credits, fork and edit `js/branding.js` — its header comment is the guide.

## Staying up to date

A self-hosted copy stops hearing about fixes the moment it exists — so the app tells you (R15): when it runs on a non-canonical host and its build is older than upstream `enca.limon-it.nl`, a notice says **how many builds behind you are and what those builds changed**, with the command for *your* deployment, ready to copy. On an `*.azurecontainerapps.io` host it leads with the `az` command rather than a `docker pull` you have nowhere to run.

**The app cannot update itself, and that is not an oversight.** It is static files in a browser with no server behind it: nothing in it can restart a container, and anything that could would be a control plane you would then have to trust. Not auto-updating is also the point of a pinned, reviewed copy — nothing changes without a review.

To update a Docker instance:

```bash
docker pull ghcr.io/nurejev/enca:beta
docker rm -f enca
# then the same docker run / compose up -d as before
```

Azure Container Apps — restarting the active revision re-pulls the tag:

```bash
APP=<app-name>; RG=<resource-group>
az containerapp revision restart -n $APP -g $RG \
  --revision $(az containerapp show -n $APP -g $RG --query properties.latestRevisionName -o tsv)
```

Or in the portal: **Revisions and replicas → the active revision → Restart**. `az containerapp revision copy -n $APP -g $RG` does it too, and leaves a revision to roll back to. Do **not** reach for `az containerapp update --image <the same tag>`: an unchanged image reference is not a revision-scope change, so it can create no revision and do nothing — a command that looks like it worked and did not.

**One honest exception.** Container Apps sets every container's image pull policy to `always`, so a container that *starts* pulls the tag fresh. With this template's scale-to-zero (min 0 replicas), an idle instance therefore picks up a republished `:beta` or `:latest` on its next cold start, without anyone asking it to. If you want a genuinely pinned deployment there, use a digest (`ghcr.io/nurejev/enca@sha256:…`) or your own immutable tag as the `image` parameter — a mutable tag plus scale-to-zero is a rolling deployment whether or not it was meant as one.

For a reviewed fork: `git fetch upstream && git merge upstream/beta`, re-review the diff, redeploy.

## Self-hosted roadmap

What is planned specifically for self-hosted instances — an optional saving/persistence layer (drift snapshots, reports, preferences in a SQLite store next to the container), update-channel choice, and more — lives in the app itself: **🗺 Roadmap → Self-hosted**, items numbered `S01`, `S02`, …
