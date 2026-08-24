#!/usr/bin/env bash
# ======================================================================
# ENCA self-hosted — one-command local setup for macOS / Linux (R06).
#
#   curl -fsSL https://raw.githubusercontent.com/nurejev/enca/main/selfhost/install.sh | bash
#   # or, from a clone:  bash selfhost/install.sh [port]
#
# What it does — nothing more than the four steps it prints:
#   1. checks Docker is installed and running
#   2. pulls ghcr.io/nurejev/enca:latest (set ENCA_TAG=beta for the beta
#      channel; falls back to a local `docker build` inside a repo clone)
#   3. runs it on http://localhost:PORT (default 8080), picking up an
#      optional ./selfhost-branding.json next to where you run it
#   4. tells you about the ONE step it cannot do for you: the redirect URI
# ======================================================================
set -euo pipefail

PORT="${1:-8080}"
TAG="${ENCA_TAG:-latest}"
IMAGE="ghcr.io/nurejev/enca:${TAG}"
NAME="enca"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# 1 — Docker present and running
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Get Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this script again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start Docker Desktop and run this script again."

# 2 — the image
say "Pulling ${IMAGE} ..."
if ! docker pull "${IMAGE}"; then
  if [ -f "$(dirname "$0")/../Dockerfile" ]; then
    say "Pull failed — building locally from this clone instead."
    IMAGE="enca:local"
    docker build -t "${IMAGE}" "$(dirname "$0")/.."
  else
    fail "Could not pull ${IMAGE} and no local clone to build from. Is the package public, and are you online?"
  fi
fi

# 3 — (re)start the container
if docker ps -a --format '{{.Names}}' | grep -qx "${NAME}"; then
  say "Replacing the existing '${NAME}' container."
  docker rm -f "${NAME}" >/dev/null
fi
BRANDING_MOUNT=()
if [ -f "./selfhost-branding.json" ]; then
  say "Found ./selfhost-branding.json — this deployment will wear your branding."
  BRANDING_MOUNT=(-v "$(pwd)/selfhost-branding.json:/usr/share/nginx/html/selfhost-branding.json:ro")
fi
docker run -d --name "${NAME}" --restart unless-stopped -p "${PORT}:80" "${BRANDING_MOUNT[@]}" "${IMAGE}" >/dev/null

URL="http://localhost:${PORT}"
say "ENCA is running at ${URL}"

# 4 — the step that cannot be automated
cat <<EOF

  ONE THING LEFT TO DO, and sign-in fails without it (error AADSTS50011):
  ${URL} must be a SPA redirect URI on the Entra app registration you use.

    • Your own registration (recommended): run New-EncaAppRegistration.ps1
      from the repo — it creates the registration AND adds this URI.
    • An existing registration: Entra admin center → App registrations →
      your app → Authentication → Single-page application → add ${URL}

  Details: https://github.com/nurejev/enca/blob/main/SELF-HOSTING.md

EOF

# open the browser where we can
if command -v open >/dev/null 2>&1; then open "${URL}" || true
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "${URL}" || true
fi
