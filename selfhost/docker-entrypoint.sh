#!/bin/sh
# ======================================================================
# ENCA self-hosting — runtime configuration for the published image (R06).
#
# THE PROBLEM THIS SOLVES. Pointing a self-hosted copy at your OWN app
# registration used to mean editing js/authConfig.js (or adding a script
# tag for js/authConfig.local.js) and building your own image. On a
# platform with no filesystem to mount into — Azure Container Apps, most
# obviously — that made "self-hosting without forking" untrue: the one
# value you MUST change to own your identity was the one value the image
# could not be told.
#
#   docker run -e ENCA_CLIENT_ID=<guid> -e ENCA_TENANT_ID=<guid> ...
#
# ENCA_CLIENT_ID   Application (client) ID of your own registration.
# ENCA_TENANT_ID   Directory (tenant) ID for a SINGLE-TENANT registration.
#                  Omit it for a multi-tenant one and the shared
#                  "organizations" authority is kept.
# ENCA_AUTHORITY   Full authority URL, for the rare case neither of the
#                  above shapes fits (a verified domain, a national cloud).
#                  Wins over ENCA_TENANT_ID when both are set.
#
# WHY IT PREPENDS RATHER THAN EDITS. js/authConfig.js already ends with
# Object.assign(defaults, window.ENCA_AUTH || {}) — the override hook is
# there, it just had nowhere to be set from. So this writes one block
# ABOVE that file's contents instead of rewriting values inside it.
# Nothing has to match a pattern in the app's own source, which means a
# refactor upstream cannot silently break the injection and leave a
# container quietly signing in to the wrong registration.
#
# IDEMPOTENT, because a restarted container keeps its writable layer and
# would otherwise stack a second block on every start. The marker lines
# are what make a re-run replace rather than repeat, and they are matched
# as literal strings (awk, not sed) precisely because a JS comment marker
# is made of regex metacharacters.
#
# WITH NO VARIABLES SET IT DOES NOTHING AT ALL — the image behaves
# exactly as it did before, which is what keeps this safe to ship.
# ======================================================================
set -eu

ROOT="/usr/share/nginx/html"
CFG="$ROOT/js/authConfig.js"
MARK_START="// >>> ENCA-RUNTIME-CONFIG"
MARK_END="// <<< ENCA-RUNTIME-CONFIG"

CLIENT_ID="${ENCA_CLIENT_ID:-}"
TENANT_ID="${ENCA_TENANT_ID:-}"
AUTHORITY="${ENCA_AUTHORITY:-}"

if [ -n "$CLIENT_ID" ] || [ -n "$TENANT_ID" ] || [ -n "$AUTHORITY" ]; then
  if [ ! -f "$CFG" ]; then
    echo "enca: $CFG is missing - cannot apply runtime configuration." >&2
    exit 1
  fi

  # A value from an env var becomes a string literal in a script served to
  # every visitor. Anything that is not the exact expected shape is REFUSED
  # rather than escaped: a value able to close that literal would be script
  # injection into the sign-in page, and no legitimate id is rejected here.
  if [ -n "$CLIENT_ID" ] && ! printf '%s' "$CLIENT_ID" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
    echo "enca: ENCA_CLIENT_ID is not a guid - refusing to configure." >&2
    exit 1
  fi
  if [ -n "$TENANT_ID" ] && ! printf '%s' "$TENANT_ID" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
    echo "enca: ENCA_TENANT_ID is not a guid - refusing to configure." >&2
    exit 1
  fi
  if [ -n "$AUTHORITY" ] && ! printf '%s' "$AUTHORITY" | grep -Eq '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~-]+)*/?$'; then
    echo "enca: ENCA_AUTHORITY is not a plain https URL - refusing to configure." >&2
    exit 1
  fi

  if [ -n "$AUTHORITY" ]; then
    AUTH_VALUE="$AUTHORITY"
  elif [ -n "$TENANT_ID" ]; then
    AUTH_VALUE="https://login.microsoftonline.com/$TENANT_ID"
  else
    AUTH_VALUE=""
  fi

  # Drop a block written by an earlier start. Literal comparison, no regex.
  STRIPPED="$(mktemp)"
  awk -v s="$MARK_START" -v e="$MARK_END" '
    $0 == s { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip   { print }
  ' "$CFG" > "$STRIPPED"

  BLOCK="$(mktemp)"
  {
    echo "$MARK_START"
    echo "// Written at container start from environment variables by"
    echo "// selfhost/docker-entrypoint.sh. NOT part of the source tree - if you"
    echo "// are reading this in a repository, something copied it out of a"
    echo "// running container."
    echo "window.ENCA_AUTH = Object.assign(window.ENCA_AUTH || {}, {"
    if [ -n "$CLIENT_ID" ]; then
      echo "  clientId: \"$CLIENT_ID\","
    fi
    if [ -n "$AUTH_VALUE" ]; then
      echo "  authority: \"$AUTH_VALUE\","
    fi
    echo "});"
    echo "$MARK_END"
    cat "$STRIPPED"
  } > "$BLOCK"

  cat "$BLOCK" > "$CFG"
  rm -f "$BLOCK" "$STRIPPED"

  echo "enca: runtime configuration applied${CLIENT_ID:+ (clientId $CLIENT_ID)}${AUTH_VALUE:+, authority $AUTH_VALUE}."
  echo "enca: REMINDER - this instance's URL must be a SPA redirect URI on that registration, or sign-in fails with AADSTS50011."
fi

exec "$@"
