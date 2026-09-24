#!/usr/bin/env bash
# ======================================================================
# Resolve an image tag to its immutable sha256 digest — the step before
# every update of a PINNED self-hosted ENCA (see SELF-HOSTING.md,
# "Pinned installs: update and roll back").
#
#   bash selfhost/resolve-digest.sh                          # ghcr.io/nurejev/enca:latest
#   bash selfhost/resolve-digest.sh ghcr.io/nurejev/enca:beta
#   bash selfhost/resolve-digest.sh myacr.azurecr.io/enca:2.0  (needs az login)
#
# Prints the digest and the pinned image reference to deploy. Read-only:
# it asks the registry one question and changes nothing.
# No bash? `docker buildx imagetools inspect ghcr.io/nurejev/enca:latest`
# prints the same Digest line.
# ======================================================================
set -euo pipefail

REF="${1:-ghcr.io/nurejev/enca:latest}"
REPO="${REF%:*}"
TAG="${REF##*:}"
[ "${REPO}" = "${REF}" ] && TAG="latest"
REGISTRY="${REPO%%/*}"
PATH_PART="${REPO#*/}"

ACCEPT="application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json"

case "${REGISTRY}" in
  ghcr.io)
    TOKEN="$(curl -fsS "https://ghcr.io/token?scope=repository:${PATH_PART}:pull&service=ghcr.io" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
    API="https://ghcr.io/v2/${PATH_PART}/manifests/${TAG}"
    ;;
  docker.io)
    TOKEN="$(curl -fsS "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${PATH_PART}:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
    API="https://registry-1.docker.io/v2/${PATH_PART}/manifests/${TAG}"
    ;;
  *.azurecr.io)
    ACR="${REGISTRY%%.*}"
    DIGEST="$(az acr repository show --name "${ACR}" --image "${PATH_PART}:${TAG}" --query digest -o tsv)"
    ;;
  *)
    echo "Unknown registry ${REGISTRY}. Use: docker buildx imagetools inspect ${REF}" >&2
    exit 2
    ;;
esac

if [ -z "${DIGEST:-}" ]; then
  [ -n "${TOKEN:-}" ] || { echo "No pull token — is the package public?" >&2; exit 1; }
  HEADERS="$(curl -fsSL -I -H "Authorization: Bearer ${TOKEN}" -H "Accept: ${ACCEPT}" "${API}")" \
    || { echo "Registry refused ${REF} — does the tag exist?" >&2; exit 1; }
  DIGEST="$(printf '%s' "${HEADERS}" | tr -d '\r' | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest: //p' | tail -n 1)"
fi

printf '%s' "${DIGEST}" | grep -qE '^sha256:[0-9a-f]{64}$' \
  || { echo "No usable digest for ${REF} (got '${DIGEST}')." >&2; exit 1; }

cat <<OUT

  ${REF}
  -> ${DIGEST}

Deploy this pinned reference:

    ${REPO}@${DIGEST}

OUT
