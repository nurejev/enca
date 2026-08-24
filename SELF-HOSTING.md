# Self-hosting ENCA (R06)

ENCA is static files and a browser — no server code, no database, nothing stored anywhere. That makes it trivially self-hostable, and some tenants require it: a security tool that reads Conditional Access is exactly the kind of thing an organisation wants served from its own infrastructure.

## ⚠️ Read this first: the redirect URI

**This is the one step no script or template can do for you, and skipping it is what produces the confusing sign-in error.**

Every host you serve ENCA from — `http://localhost:8080`, `https://enca.yourcompany.com`, an Azure Container Apps URL — must be registered as a **single-page application (SPA) redirect URI** on the Entra app registration ENCA signs in with. If it is not, sign-in fails with **AADSTS50011** ("The redirect URI specified in the request does not match").

Two ways to do it:

1. **Your own app registration (recommended for self-hosting).** Run [`New-EncaAppRegistration.ps1`](New-EncaAppRegistration.ps1) — it creates a registration in *your* tenant and adds your host's redirect URI. Then put its client id in `js/authConfig.js` (or see [SINGLE-TENANT.md](SINGLE-TENANT.md)). Your own registration, your own host: no dependency on anything of ours at run time.
2. **An existing registration.** Entra admin center → App registrations → your app → Authentication → *Single-page application* → add your URL exactly, including the port.

## Quick start on your own machine

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/nurejev/enca/main/selfhost/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/nurejev/enca/main/selfhost/install.ps1 | iex
```

Either script checks Docker is running, pulls `ghcr.io/nurejev/enca:latest`, starts it at `http://localhost:8080`, and prints the redirect-URI instructions above. Pass a port (`bash install.sh 9090` / `-Port 9090`) if 8080 is taken; use `ENCA_TAG=beta` / `-Tag beta` for the beta channel.

## Plain Docker

```bash
docker run -d --name enca -p 8080:80 --restart unless-stopped ghcr.io/nurejev/enca:latest
```

Or with compose — see [`selfhost/docker-compose.yml`](selfhost/docker-compose.yml). The image is nginx over the repo's files, built by [the workflow](.github/workflows/docker.yml) on every push: `:latest` from `main`, `:beta` from the beta channel. To build it yourself instead of trusting ours: `docker build -t enca .` in a clone — what you run is what you can read.

## Deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fnurejev%2Fenca%2Fmain%2Fselfhost%2Fazuredeploy.json)

The button deploys [`selfhost/azuredeploy.json`](selfhost/azuredeploy.json): an **Azure Container App** running the published image with **scale-to-zero** (min 0 / max 1 replicas, 0.25 vCPU), so an instance used by one team costs close to nothing while idle. The deployment outputs show the app's HTTPS URL and repeat the next step: **add that URL as a SPA redirect URI** on your app registration.

## Branding your instance

A self-hosted instance can wear your organisation's identity without forking — the same mechanism as the per-audience looks on the hosted site:

1. On any non-production host, a **⚙ gear appears next to Sign out**. It opens the branding settings: product and organisation names, logos, login text, and light/dark colour palettes.
2. **Apply in this browser** previews and keeps the look locally (per browser).
3. **Download selfhost-branding.json** exports the same settings as a file. Serve it at the site root — the compose file and install scripts mount `./selfhost-branding.json` automatically — and **every visitor** to your instance gets the branding, and the red "BETA — not production" ribbon becomes a neutral "SELF-HOSTED" one.

Exports (Word/PDF/Markdown) keep the neutral ENCA credit by design, exactly like the hosted per-audience looks. For a full rebrand including export credits, fork and edit `js/branding.js` — its header comment is the guide.

## Staying up to date

A self-hosted copy stops hearing about fixes the moment it exists — so the app tells you (R15): when it runs on a non-canonical host and its build is older than upstream `enca.limon-it.nl`, a notice says **how many builds behind you are and what those builds changed**, with the commands to update. Deliberately not auto-updating — that would defeat the reason for self-hosting.

To update a Docker instance:

```bash
docker pull ghcr.io/nurejev/enca:latest
docker rm -f enca
# then the same docker run / compose up -d as before
```

For a reviewed fork: `git fetch upstream && git merge upstream/main`, re-review the diff, redeploy.

## Self-hosted roadmap

What is planned specifically for self-hosted instances — an optional saving/persistence layer (drift snapshots, reports, preferences in a SQLite store next to the container), update-channel choice, and more — lives in the app itself: **🗺 Roadmap → Self-hosted**, items numbered `S01`, `S02`, …
